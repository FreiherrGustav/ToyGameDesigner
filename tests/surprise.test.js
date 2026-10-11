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
    undo: () => performUndo(),
    templatesFull: () => SURPRISE_TEMPLATES.map(t => ({ id: t.id, expect: t.expect, nonsense: !!t.nonsense, discover: t.discover, rows: t.rows, legend: t.legend })),
    eligible: () => surpriseEligibleTemplates(),
    gen: (seed, o) => generateSurprise(seed, o),
    press: (seed, o) => surpriseMe(seed, o),
    play: () => enterPlayMode(), stop: () => exitToBuildMode(),
    tick: n => { for (let i = 0; i < n; i++) tick(1 / 60); },
    state: () => ({ appMode, lives, ended: playSessionEnded, actors, rooms, board, currentRoomId, playerRoomId, plates: plateChannelsActive, DEFAULT_LIVES, gravity: gravityEnabled, wrapH: wrapHEnabled, wrapV: wrapVEnabled }),
    sig: () => JSON.stringify([board, actors.map(a => [a.defId, Math.round(a.x), Math.round(a.y)])]),
    defs: () => actorDefs, paint: (x, y, key) => { board[y][x] = key; },
    place: (defId, x, y) => { selectedActorDefId = defId; return placeNewActor(x * TILE + TILE / 2, y * TILE + TILE / 2); },
    setGravity: v => { gravityEnabled = v; }, room: () => { snapshotCurrentRoomState(); return rooms.find(r => r.id === currentRoomId); },
    templateById: id => SURPRISE_TEMPLATES.find(t => t.id === id)
  };
`;
const tmp = path.join(os.tmpdir(), "surprise_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK));
const results = { fail: [], notes: [] };
const fail = (m) => { results.fail.push(m); console.log("FAIL:", m); };
const blank = () => ({ runs: 0, exception: 0, nan: 0, dead: 0, frozen: 0, unsatisfied: 0, flipped: 0 });
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("dialog", d => d.accept());
  await page.goto("file://" + tmp);
  await page.waitForFunction(() => window.__st);
  const tmpls = await page.evaluate(() => __st.templatesFull());
  const ids = tmpls.map(t => t.id);
  const elig = await page.evaluate(() => __st.eligible());
  console.log("templates:", ids.length, "(" + tmpls.filter(t => t.nonsense).length + " nonsense) skipped:", JSON.stringify(elig.skipped));

  // ---- 0. Every template has something to discover ----
  tmpls.forEach(t => {
    const has = t.rows.some(r => r.includes(t.discover)) && t.legend[t.discover];
    if (!has) fail("discover missing in template " + t.id);
  });

  // ---- 1. Fuzz: one surprise into a fresh project (chaos on: random gravity/wrap) ----
  const per = {}; ids.forEach(id => per[id] = blank());
  const t0 = Date.now();
  let flips = 0, total = 0;
  for (let seed = 1; seed <= FUZZ; seed++) {
    const r = await page.evaluate((seed) => {
      const out = { seed };
      try {
        __st.reset();
        const g = __st.gen(seed);
        out.templateId = g && g.templateId;
        if (!g || g.failed || g.noRoom) { out.unsatisfied = true; return out; }
        const rep = __st.press(seed);
        if (!rep || !rep.templateId) { out.exception = "press returned " + JSON.stringify(rep); return out; }
        out.flipped = rep.gravityFlipped;
        __st.play();
        const sig0 = __st.sig();
        let changed = false;
        __st.tick(1);
        const s1 = __st.state();
        if (!s1.actors.find(a => a.isPlayer)) out.noPlayer = true;
        if (s1.ended || s1.lives < s1.DEFAULT_LIVES) out.dead = true;
        for (let sec = 0; sec < 10; sec++) {
          __st.tick(60);
          if (__st.sig() !== sig0) changed = true;
          if (__st.state().actors.some(a => !Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(a.vx) || !Number.isFinite(a.vy))) { out.nan = true; break; }
        }
        out.frozen = !changed;
        __st.stop();
      } catch (e) { out.exception = String(e && e.stack || e); }
      return out;
    }, seed);
    const p = per[r.templateId || "?"] || (per[r.templateId || "?"] = blank());
    p.runs++; total++;
    if (r.exception) { p.exception++; if (p.exception <= 2) console.log("exception seed", seed, r.exception.split("\n").slice(0, 3).join(" | ")); }
    if (r.nan) p.nan++;
    if (r.dead) p.dead++;
    if (r.frozen) p.frozen++;
    if (r.unsatisfied) p.unsatisfied++;
    if (r.noPlayer) p.exception++;
    if (r.flipped) { p.flipped++; flips++; }
  }
  console.log("fuzz seconds:", ((Date.now() - t0) / 1000).toFixed(1), " gravity-flipped:", flips + "/" + total);
  console.table(per);
  Object.entries(per).forEach(([id, p]) => { if (p.exception || p.nan || p.dead || p.frozen || p.unsatisfied) fail("fuzz " + id + " " + JSON.stringify(p)); });
  if (flips === 0 || flips / total > 0.3) fail("gravity chaos rate looks wrong: " + flips + "/" + total);

  // ---- 2. Expectations (canonical: native gravity, no wrap) ----
  for (const t of tmpls) {
    if (t.expect.needsInput) { results.notes.push(t.id + ": needsInput"); continue; }
    let okCount = 0, total = 0;
    for (let k = 0; k < 8; k++) {
      const seed = 5000 + k * 37;
      const ok = await page.evaluate(({ id, seed, check }) => {
        __st.reset();
        const rep = __st.press(seed, { templateId: id, chaos: false });
        if (!rep || !rep.templateId) return false;
        __st.play();
        const h = { plateSeen: false, side0: null, chaserOk: true };
        const st0 = __st.state();
        const defs = __st.defs();
        const crates0 = st0.actors.filter(a => a.defId === "pushable").map(a => ({ id: a.id, x: a.x, y: a.y }));
        const anchorCell = (pred) => { for (let y = 0; y < 18; y++) for (let x = 0; x < 24; x++) if (pred(String(st0.board[y][x]))) return { x: x * 32, y: y * 32 }; return null; };
        const fan = anchorCell(g => g.startsWith("fan-")), magnet = anchorCell(g => g.startsWith("magnet")), hole = anchorCell(g => g.startsWith("gravitywell"));
        const chasers = st0.actors.filter(a => !a.isPlayer && defs[a.defId].temperament === "chaser").map(a => ({ id: a.id, side: Math.sign(a.x - (fan ? fan.x : 0)) }));
        const player = st0.actors.find(a => a.isPlayer);
        const chaseDist0 = chasers.length ? Math.min(...chasers.map(c => { const a = st0.actors.find(q => q.id === c.id); return Math.hypot(a.x - player.x, a.y - player.y); })) : 0;
        let crateMoved = false, crateGone = false, chaseClosed = false;
        const frames = check === "chaserHeld" ? 300 : 600;
        for (let f = 0; f < frames; f++) {
          __st.tick(1);
          const st = __st.state();
          if (Object.values(st.plates).some(v => v)) h.plateSeen = true;
          if (check === "chaserHeld") chasers.forEach(c => { const a = st.actors.find(q => q.id === c.id); if (a && Math.sign(a.x - fan.x) !== c.side) h.chaserOk = false; });
          if (f === 179) {
            if (check === "crateTowardMagnet") crateMoved = st.actors.filter(a => a.defId === "pushable").some(a => { const o = crates0.find(q => q.id === a.id); return o && Math.abs(o.x - magnet.x) - Math.abs(a.x - magnet.x) >= 20; });
            if (check === "crateMovedOrGone") crateMoved = crates0.some(o => { const a = st.actors.find(q => q.id === o.id); return !a || Math.hypot(a.x - o.x, a.y - o.y) >= 20; });
            if (check === "chasersApproach") { const pl = st.actors.find(a => a.isPlayer); const d = Math.min(...chasers.map(c => { const a = st.actors.find(q => q.id === c.id); return a ? Math.hypot(a.x - pl.x, a.y - pl.y) : 0; })); chaseClosed = chaseDist0 - d >= 20; }
          }
        }
        const st = __st.state();
        const ok = ({
          spawnCount2: () => st.actors.filter(a => a.spawnerKey != null).length >= 2,
          plateOn: () => h.plateSeen, chaserHeld: () => h.chaserOk && chasers.length > 0 && !!fan,
          crateTowardMagnet: () => crateMoved && !!magnet, crateMovedOrGone: () => crateMoved && !!hole,
          chasersApproach: () => chaseClosed,
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
    const dump = () => JSON.stringify(__st.state().rooms.map(r => [r.board, r.colorBoard, r.groundSkinBoard, r.actors.map(x => [x.defId, x.spawnX, x.spawnY]), r.gravityEnabled, r.wrapHEnabled, r.name]));
    for (let seed = 1; seed <= n; seed++) { __st.reset(); __st.press(seed); const a = dump(); __st.reset(); __st.press(seed); if (a !== dump()) bad.push(seed); }
    return bad;
  }, { n: 80 });
  console.log("determinism mismatches:", det.length);
  if (det.length) fail("determinism " + det.slice(0, 5));

  // ---- 4. Several surprises in one room, never overwriting, one undo each ----
  const multi = await page.evaluate(() => {
    const out = { problems: [] };
    __st.reset();
    // the kid's own stuff: some walls, a crate, a background cell — must survive untouched
    for (let x = 0; x < 4; x++) __st.paint(x, 17, "solid:none");
    __st.paint(1, 16, "solid:bouncy");
    const kidCrate = __st.place("pushable", 3, 16);
    const kidBefore = JSON.stringify([__st.state().board.map(r => r.slice(0, 24))]);
    const placed = [];
    for (let i = 0; i < 12; i++) {
      const snapBefore = __st.snapshot();
      const rep = __st.press(7000 + i, { chaos: false });
      if (rep && rep.pending) { out.pendingAt = i; out.overlay = !!document.getElementById("surpriseFullOverlay"); out.buttons = [...document.querySelectorAll("#surpriseFullOverlay button")].map(b => b.firstChild.textContent); document.getElementById("surpriseFullOverlay").remove(); break; }
      if (!rep || !rep.templateId) { out.problems.push("press " + i + " returned " + JSON.stringify(rep)); break; }
      placed.push(rep.rect);
      // one undo step restores exactly what was there before this press
      const after = __st.snapshot();
      __st.undo();
      const undone = __st.snapshot();
      if (JSON.stringify(undone.rooms.map(r => [r.board, r.colorBoard, r.actors.map(a => [a.id, a.defId, a.spawnX, a.spawnY])])) !== JSON.stringify(snapBefore.rooms.map(r => [r.board, r.colorBoard, r.actors.map(a => [a.id, a.defId, a.spawnX, a.spawnY])]))) out.problems.push("undo mismatch at " + i);
      __st.restore(after);
    }
    out.count = placed.length;
    // footprints (with margin 1) never overlap each other
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i], b = placed[j];
      if (!(a.x + a.w + 1 <= b.x || b.x + b.w + 1 <= a.x || a.y + a.h + 1 <= b.y || b.y + b.h + 1 <= a.y)) out.problems.push("footprints touch " + i + "," + j);
    }
    // kid's own cells byte for byte
    const st = __st.state();
    const kidAfterBoard = st.board;
    for (let x = 0; x < 4; x++) if (kidAfterBoard[17][x] !== "solid:none") out.problems.push("kid wall changed");
    if (kidAfterBoard[16][1] !== "solid:bouncy") out.problems.push("kid bouncy changed");
    const crate = st.actors.find(a => a.id === kidCrate.id);
    if (!crate || crate.spawnX !== kidCrate.spawnX || crate.spawnY !== kidCrate.spawnY) out.problems.push("kid crate moved");
    out.players = st.actors.filter(a => a.isPlayer).length;
    // the whole crowded room still plays for 10 seconds without a problem
    try { __st.play(); __st.tick(1); for (let s = 0; s < 10; s++) __st.tick(60); const ss = __st.state(); if (ss.actors.some(a => !Number.isFinite(a.x) || !Number.isFinite(a.y))) out.problems.push("NaN in crowded room"); __st.stop(); } catch (e) { out.problems.push("crowded room threw " + e); }
    return out;
  });
  console.log("multi:", JSON.stringify(multi));
  if (multi.problems.length || multi.count < 2 || multi.players !== 1 || !multi.overlay || JSON.stringify(multi.buttons) !== JSON.stringify(["Create a new room", "Overwrite part of this room", "Cancel"])) fail("multi " + JSON.stringify(multi));

  // ---- 4b. Crowded-room fuzz: 3-4 chaotic surprises in one room, then 10 seconds of play ----
  const crowd = await page.evaluate(() => {
    const out = { runs: 0, bad: [], flips: 0, pending: 0 };
    for (let seed = 1; seed <= 80; seed++) {
      try {
        __st.reset();
        let placed = 0;
        for (let i = 0; i < 4; i++) { const r = __st.press(seed * 10 + i); if (r && r.pending) { out.pending++; const o = document.getElementById("surpriseFullOverlay"); if (o) o.remove(); break; } if (r && r.templateId) placed++; if (r && r.gravityFlipped) out.flips++; }
        __st.play(); __st.tick(1);
        const s1 = __st.state();
        if (s1.ended || s1.lives < s1.DEFAULT_LIVES) out.bad.push(seed + ": dead on frame one");
        for (let s = 0; s < 10; s++) __st.tick(60);
        if (__st.state().actors.some(a => !Number.isFinite(a.x) || !Number.isFinite(a.y))) out.bad.push(seed + ": NaN");
        __st.stop();
        out.runs++;
      } catch (e) { out.bad.push(seed + ": " + e); }
    }
    return out;
  });
  console.log("crowded rooms:", JSON.stringify({ runs: crowd.runs, bad: crowd.bad.slice(0, 5), pending: crowd.pending }));
  if (crowd.bad.length) fail("crowded rooms " + crowd.bad.slice(0, 5).join(" | "));

  // ---- 5. Full room: new room / overwrite prefers untouched surprises / kid stuff warns / cancel ----
  const full = await page.evaluate(() => {
    const out = {};
    __st.reset();
    let n = 0; for (; n < 14; n++) { const r = __st.press(8000 + n, { chaos: false }); if (r && r.pending) { document.getElementById("surpriseFullOverlay").remove(); break; } }
    const roomsBefore = __st.snapshot().rooms.length;
    const ow = __st.press(8100, { chaos: false, full: "overwrite" });
    out.overwrite = ow && { mode: ow.mode, kid: ow.overwroteKidStuff };
    const nw = __st.press(8101, { chaos: false, full: "new" });
    out.newRoom = nw && { mode: nw.mode, rooms: __st.snapshot().rooms.length, before: roomsBefore, players: __st.snapshot().rooms.flatMap(r => r.actors.filter(a => a.isPlayer)).length, placed: nw.playerPlaced };
    const nover = __st.press(8102, { chaos: false, full: "none-of-the-above" });
    return out;
  });
  console.log("full:", JSON.stringify(full));
  if (!full.overwrite || full.overwrite.mode !== "overwrite" || full.overwrite.kid !== 0) fail("overwrite should only replace untouched surprises first " + JSON.stringify(full));
  if (!full.newRoom || full.newRoom.rooms !== full.newRoom.before + 1 || full.newRoom.players !== 1 || full.newRoom.placed) fail("new room option " + JSON.stringify(full.newRoom));
  // a room packed with the kid's own stuff: overwrite must say it hits their stuff, and nothing happens without a choice
  const packed = await page.evaluate(() => {
    __st.reset();
    for (let y = 0; y < 18; y++) for (let x = 0; x < 24; x++) if ((x + y) % 3 === 0) __st.paint(x, y, "solid:none");
    const before = JSON.stringify(__st.state().board);
    const r = __st.press(9100, { chaos: false });
    const untouched = JSON.stringify(__st.state().board) === before;
    const g = __st.gen(9100, { chaos: false, place: "overwrite" });
    const ov = document.getElementById("surpriseFullOverlay"); if (ov) ov.remove();
    return { pending: !!(r && r.pending), untouched, cost: g && g.cost };
  });
  console.log("packed room:", JSON.stringify(packed));
  if (!packed.pending || !packed.untouched || !(packed.cost > 0)) fail("packed room " + JSON.stringify(packed));
  // the real button opens the dialog and Cancel changes nothing
  await page.evaluate(() => { __st.reset(); for (let y = 0; y < 18; y++) for (let x = 0; x < 24; x++) if ((x + y) % 3 === 0) __st.paint(x, y, "solid:none"); });
  const boardBefore = await page.evaluate(() => JSON.stringify(__st.state().board));
  await page.click("#surpriseBtn");
  const dlg = await page.evaluate(() => [...document.querySelectorAll("#surpriseFullOverlay button")].map(b => b.firstChild.textContent));
  console.log("dialog buttons:", JSON.stringify(dlg));
  await page.click("#surpriseFullOverlay button:last-child");
  const afterCancel = await page.evaluate(() => ({ same: JSON.stringify(__st.state().board), gone: !document.getElementById("surpriseFullOverlay") }));
  if (dlg.length !== 3 || afterCancel.same !== boardBefore || !afterCancel.gone) fail("dialog/cancel " + JSON.stringify({ dlg, cancelSame: afterCancel.same === boardBefore, gone: afterCancel.gone }));

  // ---- 6. A room with the kid's own stuff and a project player in another room: nothing breaks ----
  const kid = await page.evaluate(() => {
    const out = { exceptions: 0, runs: 0 };
    for (let seed = 1; seed <= 60; seed++) {
      try {
        __st.reset();
        __st.press(20000 + seed, { full: "new" }); // player lives here
        __st.press(30000 + seed, { chaos: false, full: "new" }); // a second room, no player
        out.runs++;
        const players = __st.snapshot().rooms.flatMap(r => r.actors.filter(a => a.isPlayer)).length;
        if (players !== 1) out.exceptions++;
      } catch (e) { out.exceptions++; }
    }
    return out;
  });
  console.log("two rooms:", JSON.stringify(kid));
  if (kid.exceptions) fail("two rooms " + JSON.stringify(kid));

  if (errors.length) fail("page errors: " + errors.slice(0, 3).join(" | "));
  await browser.close();
  console.log(results.fail.length ? "\nFAILURES: " + results.fail.length : "\nALL PASSED");
  process.exit(results.fail.length ? 1 : 0);
})();
