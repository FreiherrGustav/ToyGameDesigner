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
    templatesFull: () => SURPRISE_TEMPLATES.map(t => ({ id: t.id, expect: t.expect, nonsense: !!t.nonsense, discover: t.discover, rows: t.rows, legend: t.legend, rooms: t.rooms || null })),
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
    select: (pm, g, m, kind, defId) => { paintMode = pm; selectedGeometry = g; selectedModifier = m; selectedActorKind = kind; selectedActorDefId = defId; },
    piece: () => surpriseSelectedPiece(), tryThis: seed => surpriseTry(seed), forPiece: k => surpriseTemplatesFor(k), pieceKeys: () => Object.keys(SURPRISE_PIECE_MATCH),
    templateById: id => SURPRISE_TEMPLATES.find(t => t.id === id),
    smallIds: () => SURPRISE_TEMPLATES.filter(t => !t.rooms && t.rows[0].length < 20).map(t => t.id)
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
  await page.goto("file://" + tmp + "#t");
  await page.waitForFunction(() => window.__st);
  const tmpls = await page.evaluate(() => __st.templatesFull());
  const ids = tmpls.map(t => t.id);
  const elig = await page.evaluate(() => __st.eligible());
  console.log("templates:", ids.length, "(" + tmpls.filter(t => t.nonsense).length + " nonsense) skipped:", JSON.stringify(elig.skipped));

  // ---- 0. Every template has something to discover ----
  tmpls.forEach(t => {
    const rows0 = t.rows || t.rooms[0].rows, leg0 = t.legend || t.rooms[0].legend;
    const has = rows0.some(r => r.includes(t.discover)) && leg0[t.discover];
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
  // since v2.50 only "either"-gravity templates can flip (required gravity never does), so the rate is a few percent; a tiny run can legitimately see none
  if ((FUZZ >= 200 && flips === 0) || flips / Math.max(1, total) > 0.3) fail("gravity chaos rate looks wrong: " + flips + "/" + total);

  // ---- 2. Expectations (canonical: native gravity, no wrap) ----
  for (const t of tmpls) {
    if (t.expect.needsInput || !["spawnCount2", "plateOn", "chaserHeld", "crateTowardMagnet", "crateMovedOrGone", "chasersApproach", "bombFall", "bombActors"].includes(t.expect.check)) { // newer checks live in surprise2.test.js
      results.notes.push(t.id + ": needsInput"); continue; }
    let okCount = 0, total = 0;
    for (let k = 0; k < 8; k++) {
      const seed = 5000 + k * 37;
      // some Play sessions leak transient state into the next one on the same page (the falling-bomb template shows it), so give it a fresh page
      if (t.expect.check === "bombFall") { await page.goto("file://" + tmp + "#t"); await page.waitForFunction(() => window.__st); }
      const ok = await page.evaluate(({ id, seed, check }) => {
        __st.reset();
        const rep = __st.press(seed, { templateId: id, chaos: false, canonical: true });
        if (!rep || !rep.templateId) return false;
        __st.play();
        const h = { plateSeen: false, side0: null, chaserOk: true, boom: false };
        const st0 = __st.state();
        const defs = __st.defs();
        const crates0 = st0.actors.filter(a => a.defId === "pushable").map(a => ({ id: a.id, x: a.x, y: a.y }));
        const anchorCell = (pred) => { for (let y = 0; y < 18; y++) for (let x = 0; x < 24; x++) if (pred(String(st0.board[y][x]))) return { x: x * 32, y: y * 32 }; return null; };
        const fan = anchorCell(g => g.startsWith("fan-")), magnet = anchorCell(g => g.startsWith("magnet")), hole = anchorCell(g => g.startsWith("gravitywell"));
        const chasers = st0.actors.filter(a => !a.isPlayer && defs[a.defId].temperament === "chaser").map(a => ({ id: a.id, side: Math.sign(a.x - (fan ? fan.x : 0)) }));
        const player = st0.actors.find(a => a.isPlayer);
        const chaseDist0 = chasers.length ? Math.min(...chasers.map(c => { const a = st0.actors.find(q => q.id === c.id); return Math.hypot(a.x - player.x, a.y - player.y); })) : 0;
        const bombs0 = st0.actors.filter(a => a.defId === "carrybomb2").length;
        let crateMoved = false, crateGone = false, chaseClosed = false;
        const frames = check === "chaserHeld" ? 300 : 600;
        for (let f = 0; f < frames; f++) {
          __st.tick(1);
          const st = __st.state();
          if (Object.values(st.plates).some(v => v)) h.plateSeen = true;
          { const bs = st.actors.filter(a => a.defId === "carrybomb2"); if (bs.some(a => a.detonating) || bs.length < bombs0) h.boom = true; }
          (h.seen = h.seen || new Set()); st.actors.forEach(a => { if (a.spawnerKey != null) h.seen.add(a.id); }); // count spawns ever made: black holes now destroy them on the game clock (they used to linger because the removal timer was real time)
          if (check === "chaserHeld") chasers.forEach(c => { const a = st.actors.find(q => q.id === c.id); if (a && Math.sign(a.x - fan.x) !== c.side) h.chaserOk = false; });
          if (f === 179) {
            if (check === "crateTowardMagnet") crateMoved = st.actors.filter(a => a.defId === "pushable").some(a => { const o = crates0.find(q => q.id === a.id); return o && Math.abs(o.x - magnet.x) - Math.abs(a.x - magnet.x) >= 20; });
            if (check === "crateMovedOrGone") crateMoved = crates0.some(o => { const a = st.actors.find(q => q.id === o.id); return !a || Math.hypot(a.x - o.x, a.y - o.y) >= 20; });
            if (check === "chasersApproach") { const pl = st.actors.find(a => a.isPlayer); const d = Math.min(...chasers.map(c => { const a = st.actors.find(q => q.id === c.id); return a ? Math.hypot(a.x - pl.x, a.y - pl.y) : 0; })); chaseClosed = chaseDist0 - d >= 20; }
          }
        }
        const st = __st.state();
        const ok = ({
          spawnCount2: () => (h.seen ? h.seen.size : 0) >= 2,
          plateOn: () => h.plateSeen, chaserHeld: () => h.chaserOk && chasers.length > 0 && !!fan,
          crateTowardMagnet: () => crateMoved && !!magnet, crateMovedOrGone: () => crateMoved && !!hole,
          chasersApproach: () => chaseClosed,
          bombFall: () => h.boom,
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
      const rep = __st.press(7000 + i, { chaos: false, templateIds: __st.smallIds() }); // small templates only: a whole-room event never goes over the kid's stuff (it opens a new room tab)
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
  if (multi.problems.length || multi.count < 2 || multi.players !== 1 || !multi.overlay || ![JSON.stringify(["Create a new room", "Overwrite part of this room", "Cancel"]), JSON.stringify(["Create a new room", "Cancel"])].includes(JSON.stringify(multi.buttons))) fail("multi " /* a template too big to overwrite offers only new room / cancel */ + JSON.stringify(multi));

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
  if (!full.newRoom || full.newRoom.rooms !== full.newRoom.before + 1 || full.newRoom.players !== 1 || !full.newRoom.placed) fail("new room option " + JSON.stringify(full.newRoom));
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
  // overwriting must not pick the same section every time: fill a room, overwrite repeatedly, count distinct spots
  const spread = await page.evaluate(() => {
    __st.reset();
    for (let n = 0; n < 14; n++) { const r = __st.press(8200 + n, { chaos: false }); if (r && r.pending) { document.getElementById("surpriseFullOverlay").remove(); break; } }
    const spots = new Set(), hits = [];
    for (let i = 0; i < 12; i++) { const r = __st.press(8300 + i, { chaos: false, full: "overwrite" }); if (r && r.rect) { spots.add(r.rect.x + "," + r.rect.y); hits.push(r.overwroteKidStuff); } }
    // and with the kid's own stuff lying around too (cost > 0 everywhere): still rotates
    __st.reset();
    for (let y = 0; y < 18; y++) for (let x = 0; x < 24; x++) if ((x * 7 + y * 3) % 11 === 0) __st.paint(x, y, "solid:none");
    const spots2 = new Set();
    for (let i = 0; i < 12; i++) { const r = __st.press(8400 + i, { chaos: false, full: "overwrite" }); if (r && r.rect) spots2.add(r.rect.x + "," + r.rect.y); }
    return { distinct: spots.size, kidHits: hits.filter(Boolean).length, distinctPacked: spots2.size };
  });
  console.log("overwrite spread:", JSON.stringify(spread));
  if (spread.distinct < 3 || spread.kidHits || spread.distinctPacked < 3) fail("overwrite keeps choosing the same spot " + JSON.stringify(spread));
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

  // ---- 7. Stage 2: "Try this" ----
  // every template builds canonically (no chaos, plain fills), plays 5s clean, and the plain pieces really are plain
  const canon = await page.evaluate((ids) => {
    const bad = [];
    for (const id of ids) for (let k = 0; k < 5; k++) {
      try {
        __st.reset();
        const rep = __st.press(7000 + k * 11, { templateId: id, chaos: false, canonical: true });
        if (!rep || !rep.templateId) { bad.push(id + " no build"); continue; }
        const defs = __st.defs();
        const odd = __st.room().actors.filter(a => !a.isPlayer && !["pushable", "largestone", "wanderer1", "colCheese", "hazardball"].includes(a.defId) && defs[a.defId].temperament !== "chaser" && defs[a.defId].temperament !== "wanderer" && defs[a.defId].temperament !== "collectible");
        if (odd.length) bad.push(id + " odd actor " + odd[0].defId);
        const skins = __st.room().groundSkinBoard.flat().filter(Boolean).filter(x => !String(x).startsWith("lth"));
        if (skins.length) bad.push(id + " has a wall skin");
        __st.play(); __st.tick(300); __st.stop();
      } catch (e) { bad.push(id + " " + e); }
    }
    return bad;
  }, ids);
  console.log("canonical builds:", canon.length ? JSON.stringify(canon.slice(0, 5)) : "ok");
  if (canon.length) fail("canonical " + canon.slice(0, 5));
  // every piece key finds at least one template that really has it in its legend
  const keys = await page.evaluate(() => __st.pieceKeys());
  for (const k of keys) {
    const found = await page.evaluate(k => __st.forPiece(k), k);
    if (!found.length) fail("no template features piece " + k);
  }
  // selecting each piece in the palette -> Try this builds a template containing it
  const sel = [
    ["tile", "fan-e", "none", "player", null, "fan"], ["tile", "cannon2-ne", "none", "player", null, "cannon"], ["tile", "spawner-n", "none", "player", null, "spawner"],
    ["tile", "barrier-n", "none", "player", null, "gate"], ["tile", "trampoline", "none", "player", null, "tramp"], ["tile", "magnet", "none", "player", null, "magnet"],
    ["tile", "bomb2", "none", "player", null, "bomb"], ["tile", "gravitywell", "none", "player", null, "hole"], ["tile", "pushbutton", "none", "player", null, "button"],
    ["tile", "plate", "none", "player", null, "plate"], ["tile", "solid", "bouncy", "player", null, "bounce"], ["tile", "solid", "sticky", "player", null, "sticky"],
    ["tile", "solid", "slippery", "player", null, "slick"], ["tile", "none", "lethal", "player", null, "lava"], ["tile", "solid", "wind-e", "player", null, "belt"],
    ["actor", "none", "none", "pushable", "pushable", "crate"], ["actor", "none", "none", "largestone", "largestone", "stone"]
  ];
  for (const [pm, g, m, kind, defId, want] of sel) {
    const r = await page.evaluate(({ pm, g, m, kind, defId, want }) => {
      __st.reset();
      const d = defId === "pushable" ? "pushable" : defId;
      __st.select(pm, g, m, kind, d);
      const piece = __st.piece();
      const rep = __st.tryThis(4242);
      const t = rep && rep.templateId && __st.templateById(rep.templateId);
      const has = t && __st.forPiece(want).includes(t.id);
      return { piece, built: !!(rep && rep.templateId), has: !!has, tid: rep && rep.templateId, fallback: !!(rep && rep.fallback), gravityFlipped: rep && rep.gravityFlipped, wrapH: rep && rep.wrapH && !(t && t.room && t.room.wrapH === true) }; // a template that REQUIRES wrap keeps it in Try this
    }, { pm, g, m, kind, defId, want });
    if (r.piece !== want || !r.built || !r.has || r.fallback || r.gravityFlipped || r.wrapH) fail("try this " + want + " " + JSON.stringify(r));
  }
  console.log("try-this selections checked:", sel.length);
  // nothing relevant selected -> falls back to a plain Surprise Me
  const fb = await page.evaluate(() => { __st.reset(); __st.select("actor", "none", "none", "player", null); const rep = __st.tryThis(777); return { fallback: !!(rep && rep.fallback), built: !!(rep && rep.templateId) }; });
  if (!fb.fallback || !fb.built) fail("fallback " + JSON.stringify(fb));
  // never overwrites: in a packed room Try this changes nothing, offers only new-room/cancel, and new-room leaves the old board alone
  const nov = await page.evaluate(() => {
    __st.reset();
    for (let y = 0; y < 18; y++) for (let x = 0; x < 24; x++) if ((x + y) % 3 === 0) __st.paint(x, y, "solid:none");
    __st.select("tile", "fan-e", "none", "player", null);
    const before = JSON.stringify(__st.state().board);
    const rep = __st.tryThis(6001);
    const labels = [...document.querySelectorAll("#surpriseFullOverlay button")].map(b => b.firstChild.textContent);
    const same = JSON.stringify(__st.state().board) === before;
    const ov = document.getElementById("surpriseFullOverlay");
    const newBtn = ov && ov.querySelector("button");
    if (newBtn) newBtn.click();
    return { pending: !!(rep && rep.pending), labels, same, oldKept: JSON.stringify(__st.snapshot().rooms[0].board) === before, rooms: __st.snapshot().rooms.length };
  });
  console.log("try-this in a full room:", JSON.stringify(nov));
  if (!nov.pending || !nov.same || nov.labels.some(l => /overwrite/i.test(l)) || nov.labels.length !== 2 || !nov.oldKept || nov.rooms !== 2) fail("try this never overwrites " + JSON.stringify(nov));
  // one undo undoes a try; caption is set; the real button works and is in the Objects tab
  const ui = await page.evaluate(() => { __st.reset(); const s0 = __st.sig(); __st.select("tile", "magnet", "none", "player", null); const rep = __st.tryThis(9001); const s1 = __st.sig(); __st.undo(); return { built: !!rep.templateId, changed: s0 !== s1, undone: __st.sig() === s0, caption: document.getElementById("captionBar").textContent }; });
  if (!ui.built || !ui.changed || !ui.undone || !/Surprise #9001/.test(ui.caption)) fail("try this undo/caption " + JSON.stringify(ui));
  await page.evaluate(() => { __st.reset(); });
  await page.click("[data-tab=object], #tabObject, button:has-text('Objects')").catch(() => {});
  const btnVisible = await page.evaluate(() => { const b = document.getElementById("tryThisBtn"); return !!b && b.offsetParent !== null; });
  console.log("try-this button visible in Objects tab:", btnVisible);
  if (!btnVisible) fail("try this button not visible in the Objects tab");

  if (errors.length) fail("page errors: " + errors.slice(0, 3).join(" | "));
  await browser.close();
  console.log(results.fail.length ? "\nFAILURES: " + results.fail.length : "\nALL PASSED");
  process.exit(results.fail.length ? 1 : 0);
})();
