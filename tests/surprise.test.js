// Surprise Me test harness (not deployed). Usage: node tests/surprise.test.js [fuzzCount]
// Needs Playwright + Chromium; paths below match the sandbox this project is developed in.
// Builds a throwaway copy of index.html with a debug hook injected (the repo file stays clean).
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/opt/node22/lib/node_modules/playwright");
const FUZZ = Number(process.argv[2] || 1000);
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
if (!src.includes(anchor)) throw new Error("boot anchor not found");
const HOOK = `
  window.__st = {
    reset: () => { suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false; },
    snapshot: () => captureProjectSnapshot(), restore: s => restoreProjectSnapshot(s),
    undo: () => performUndo(), templates: () => SURPRISE_TEMPLATES.map(t => t.id), templatesFull: () => SURPRISE_TEMPLATES.map(t => ({ id: t.id, expect: t.expect })),
    eligible: () => surpriseEligibleTemplates(),
    gen: (seed, o) => generateSurprise(seed, o),
    press: (seed, o) => surpriseMe(seed, o),
    play: () => enterPlayMode(), stop: () => exitToBuildMode(),
    tick: n => { for (let i = 0; i < n; i++) tick(1 / 60); },
    state: () => ({ appMode, lives, ended: playSessionEnded, actors, rooms, board, currentRoomId, playerRoomId, plates: plateChannelsActive, DEFAULT_LIVES, spawnerContents, doorLinks }),
    sig: () => JSON.stringify([board, actors.map(a => [a.defId, Math.round(a.x), Math.round(a.y)])]),
    colors: () => CHANNEL_COLORS, defs: () => actorDefs, isChannelOn: c => isChannelOn(c)
  };
`;
const tmp = path.join(os.tmpdir(), "surprise_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK));
const results = { fail: [], notes: [] };
const fail = (m) => { results.fail.push(m); console.log("FAIL:", m); };
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("dialog", d => d.accept());
  await page.goto("file://" + tmp);
  await page.waitForFunction(() => window.__st);
  const ids = await page.evaluate(() => __st.templates());
  const elig = await page.evaluate(() => __st.eligible());
  console.log("templates:", ids.length, "skipped:", JSON.stringify(elig.skipped));

  // ---- 1. Fuzz ----
  const per = {}; ids.forEach(id => per[id] = { runs: 0, exception: 0, nan: 0, dead: 0, frozen: 0, unsatisfied: 0, expectFail: 0 });
  const t0 = Date.now();
  for (let seed = 1; seed <= FUZZ; seed++) {
    const r = await page.evaluate((seed) => {
      const out = { seed };
      try {
        __st.reset();
        const g = __st.gen(seed);
        out.templateId = g && g.templateId;
        if (!g || g.failed) { out.unsatisfied = true; return out; }
        const rep = __st.press(seed);
        if (!rep || !rep.templateId) { out.exception = "press returned " + JSON.stringify(rep); return out; }
        __st.play();
        const sig0 = __st.sig();
        let changed = false, frozenFrom = null;
        __st.tick(1);
        const s1 = __st.state();
        const player = s1.actors.find(a => a.isPlayer);
        if (!player) out.noPlayer = true;
        if (s1.ended || s1.lives < s1.DEFAULT_LIVES) out.dead = true;
        for (let sec = 0; sec < 10; sec++) {
          __st.tick(60);
          if (__st.sig() !== sig0) changed = true;
          const st = __st.state();
          if (st.actors.some(a => !Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(a.vx) || !Number.isFinite(a.vy))) { out.nan = true; break; }
        }
        out.frozen = !changed;
        __st.stop();
      } catch (e) { out.exception = String(e && e.stack || e); }
      return out;
    }, seed);
    const p = per[r.templateId || "?"] || (per[r.templateId || "?"] = { runs: 0, exception: 0, nan: 0, dead: 0, frozen: 0, unsatisfied: 0, expectFail: 0 });
    p.runs++;
    if (r.exception) { p.exception++; if (p.exception <= 2) console.log("exception seed", seed, r.exception.split("\n").slice(0, 3).join(" | ")); }
    if (r.nan) p.nan++;
    if (r.dead) p.dead++;
    if (r.frozen) p.frozen++;
    if (r.unsatisfied) p.unsatisfied++;
    if (r.noPlayer) { p.exception++; }
  }
  console.log("fuzz seconds:", ((Date.now() - t0) / 1000).toFixed(1));
  console.table(per);
  Object.entries(per).forEach(([id, p]) => { if (p.exception || p.nan || p.dead || p.frozen || p.unsatisfied) fail("fuzz " + id + " " + JSON.stringify(p)); });
  if (errors.length) fail("page errors: " + errors.slice(0, 3).join(" | "));

  // ---- 2. Expectations (canonical-ish: first fill, a few seeds each) ----
  const EXPECT = {
    spawnCount2: (st) => st.actors.filter(a => a.spawnerKey != null).length >= 2,
    plateOn: (st, h) => h.plateSeen,
    chaserHeld: (st, h) => h.chaserOk,
    crateTowardMagnet: (st, h) => h.crateMoved,
    bombActors: (st) => st.actors.filter(a => a.defId === "carrybomb2").length === 3
  };
  const tmpls = await page.evaluate(() => __st.templatesFull());
  for (const t of tmpls) {
    if (t.expect.needsInput) { results.notes.push(t.id + ": needsInput"); continue; }
    let okCount = 0, total = 0;
    for (let k = 0; k < 8; k++) {
      const seed = 5000 + k * 37;
      const ok = await page.evaluate(({ id, seed, check }) => {
        __st.reset();
        const rep = __st.press(seed, { templateId: id });
        if (!rep || !rep.templateId) return false;
        __st.play();
        const h = { plateSeen: false, chaserOk: true, crateMoved: false };
        const st0 = __st.state();
        const color = (() => { const r = st0.rooms.find(r => r.id === st0.currentRoomId); return r; })();
        const crate0 = st0.actors.filter(a => a.defId === "pushable").map(a => ({ id: a.id, x: a.x }));
        const chaser = st0.actors.find(a => a.defs); // unused
        let fanX = null;
        for (let y = 0; y < 18; y++) for (let x = 0; x < 24; x++) if (String(st0.board[y][x]).startsWith("fan-")) fanX = x * 32;
        const chaserId = (st0.actors.find(a => !a.isPlayer && __st.defs()[a.defId] && __st.defs()[a.defId].temperament === "chaser") || {}).id;
        for (let f = 0; f < (check === "chaserHeld" ? 300 : 600); f++) {
          __st.tick(1);
          const st = __st.state();
          if (Object.values(st.plates).some(v => v)) h.plateSeen = true;
          if (chaserId != null) { const c = st.actors.find(a => a.id === chaserId); if (c && c.x > fanX) h.chaserOk = false; }
          if (check === "crateTowardMagnet" && f === 179) { const c = st.actors.filter(a => a.defId === "pushable").some(a => { const o = crate0.find(q => q.id === a.id); return o && a.x - o.x >= 20; }); h.crateMoved = c; }
        }
        const st = __st.state();
        const ok = ({
          spawnCount2: () => st.actors.filter(a => a.spawnerKey != null).length >= 2,
          plateOn: () => h.plateSeen, chaserHeld: () => h.chaserOk, crateTowardMagnet: () => h.crateMoved,
          bombActors: () => st.actors.filter(a => a.defId === "carrybomb2").length === 3
        })[check]();
        __st.stop();
        return ok;
      }, { id: t.id, seed, check: t.expect.check });
      total++; if (ok) okCount++;
    }
    console.log("expect", t.id, t.expect.check, okCount + "/" + total);
    if (okCount !== total) fail("expect " + t.id + " (" + t.expect.check + ") " + okCount + "/" + total);
  }

  // ---- 3. Determinism ----
  const det = await page.evaluate(({ n }) => {
    const bad = [];
    for (let seed = 1; seed <= n; seed++) {
      __st.reset(); __st.press(seed); const a = JSON.stringify(__st.state().rooms.map(r => [r.board, r.colorBoard, r.groundSkinBoard, r.actors.map(x => [x.defId, x.spawnX, x.spawnY]), r.gravityEnabled, r.name]));
      __st.reset(); __st.press(seed); const b = JSON.stringify(__st.state().rooms.map(r => [r.board, r.colorBoard, r.groundSkinBoard, r.actors.map(x => [x.defId, x.spawnX, x.spawnY]), r.gravityEnabled, r.name]));
      if (a !== b) bad.push(seed);
    }
    return bad;
  }, { n: 60 });
  console.log("determinism mismatches:", det.length);
  if (det.length) fail("determinism " + det.slice(0, 5));

  // ---- 4. Non-destructive + one undo ----
  const nd = await page.evaluate(() => {
    const out = {};
    __st.reset();
    // build something in the single room so a press must add a new tab
    __st.press(11); // fills the empty room
    const before = JSON.stringify(__st.snapshot());
    const rep = __st.press(12);
    const after = __st.snapshot();
    out.mode = rep.mode; out.rooms = after.rooms.length;
    // every old room unchanged byte for byte (ignore live-actor jitter by comparing boards + spawn data)
    const prev = JSON.parse(before);
    const same = prev.rooms.every(pr => { const nr = after.rooms.find(r => r.id === pr.id); return nr && JSON.stringify([nr.board, nr.colorBoard, nr.groundSkinBoard, nr.name, nr.gravityEnabled, nr.actors.map(a => [a.id, a.defId, a.spawnX, a.spawnY])]) === JSON.stringify([pr.board, pr.colorBoard, pr.groundSkinBoard, pr.name, pr.gravityEnabled, pr.actors.map(a => [a.id, a.defId, a.spawnX, a.spawnY])]); });
    out.oldRoomsUnchanged = same;
    __st.undo();
    const undone = __st.snapshot();
    out.undoRooms = undone.rooms.length;
    out.undoMatches = JSON.stringify([undone.rooms.map(r => [r.board, r.colorBoard, r.name]), undone.doorLinks, undone.spawnerContents, undone.playerRoomId]) === JSON.stringify([prev.rooms.map(r => [r.board, r.colorBoard, r.name]), prev.doorLinks, prev.spawnerContents, prev.playerRoomId]);
    return out;
  });
  console.log("non-destructive:", JSON.stringify(nd));
  if (nd.mode !== "new" || nd.rooms !== 2 || !nd.oldRoomsUnchanged || nd.undoRooms !== 1 || !nd.undoMatches) fail("non-destructive " + JSON.stringify(nd));

  // room cap replace + untouched-only rule
  const cap = await page.evaluate(() => {
    __st.reset(); __st.press(1);
    for (let i = 0; i < 11; i++) __st.press(100 + i);
    const full = __st.snapshot().rooms.length;
    const rep = __st.press(999);
    const after = __st.snapshot().rooms;
    const replaced = after.length === full && after.some(r => r.name === "surprise #999");
    // edit the newest surprise room, and every other room -> nothing replaceable
    return { full, replaced, rep: rep && rep.mode };
  });
  console.log("cap:", JSON.stringify(cap));
  if (cap.full !== 12 || !cap.replaced) fail("room cap replace " + JSON.stringify(cap));

  // kid with an existing player elsewhere: no second player
  const pl = await page.evaluate(() => { __st.reset(); __st.press(21); const r = __st.press(22); const players = __st.snapshot().rooms.flatMap(r => r.actors.filter(a => a.isPlayer)); return { players: players.length, placed: r.playerPlaced }; });
  console.log("player elsewhere:", JSON.stringify(pl));
  if (pl.players !== 1 || pl.placed) fail("single player " + JSON.stringify(pl));

  if (errors.length) fail("page errors: " + errors.slice(0, 3).join(" | "));
  await browser.close();
  console.log(results.fail.length ? "\nFAILURES: " + results.fail.length : "\nALL PASSED");
  process.exit(results.fail.length ? 1 : 0);
})();
