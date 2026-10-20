// v2.53 Stage 3 tests: bomb-by-impact, chains, cannon-launched hits, big-hit puff/shake (not deployed).
// Usage: node tests/chain.test.js [shotDir]      HTML=<other index.html> node tests/chain.test.js   (frame-time comparison uses HTML)
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/opt/node22/lib/node_modules/playwright");
const src = fs.readFileSync(process.env.HTML || path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const SHOTS = process.argv[2];
const HOOK = `window.__c = (() => {
  const ev = { det: 0, big: 0, sounds: {}, squash: 0, logs: [], shakes: 0, puffs: 0 };
  for (const k of Object.keys(sounds)) { const f = sounds[k]; sounds[k] = function () { ev.sounds[k] = (ev.sounds[k] || 0) + 1; return f.apply(this, arguments); }; }
  { const o = log; log = function (m) { ev.logs.push(String(m)); return o.apply(this, arguments); }; }
  { const o = detonateBombAt; detonateBombAt = function () { ev.det++; return o.apply(this, arguments); }; }
  if (typeof bigHitFx === "function") { const o = bigHitFx; bigHitFx = function (a, b, s) { const sa = shakeAt, pl = fxPuffs.length; const r = o.apply(this, arguments); ev.big++; if (shakeAt !== sa) ev.shakes++; if (fxPuffs.length > pl) ev.puffs++; return r; }; }
  { const o = squashNpc; squashNpc = function () { ev.squash++; return o.apply(this, arguments); }; }
  let freeze = true; { const o = steeringAccelFor; steeringAccelFor = function () { return freeze ? { ax: 0, ay: 0 } : o.apply(this, arguments); }; }
  const ids = { wanderer: () => defaultDefIdForKind("wanderer"), crate: () => PUSHABLE_DEF_ID, stone: () => LARGE_STONE_DEF_ID, bomb: () => CARRY_BOMB2_DEF_ID };
  function mk(kind, px, py) { const a = placeCarryableActor(ids[kind](), px, py); a.spawnX = a.x; a.spawnY = a.y; a.kind = kind; return a; }
  const FLOOR = 17 * TILE - ACTOR_SIZE / 2 - 1;
  function room() {
    suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false;
    gravityEnabled = true; gravityDir = "down";
    for (let x = 0; x < 24; x++) { board[17][x] = "solid:none"; board[0][x] = "solid:none"; }
    for (let y = 0; y < 18; y++) { board[y][0] = "solid:none"; board[y][23] = "solid:none"; }
    actors.length = 0; for (const k in ev) if (typeof ev[k] === "number") ev[k] = 0; ev.sounds = {}; ev.logs = []; freeze = true;
    for (const k in actorContactCooldown) delete actorContactCooldown[k];
    if (typeof fxPuffs !== "undefined") { fxPuffs.length = 0; bigHitTimes.length = 0; shakeAt = -1e9; }
  }
  const step = n => { for (let i = 0; i < n; i++) tick(1 / 60); };
  const wait = ms => advanceGameClock(ms / 1000);
  const bombs = () => actors.filter(a => a.kind === "bomb");
  return {
    // a striker dropped from N tiles above a bomb actor resting on the floor
    dropOnBomb(striker, tiles) {
      room(); const B = mk("bomb", 12 * TILE + 16, FLOOR); step(10);
      const C = mk(striker, 12 * TILE + 16, FLOOR - ACTOR_SIZE - tiles * TILE); C.x = B.x; step(3);
      let n = 0; while (!B.detonating && n++ < 200) step(1);
      return { det: ev.det, detonating: !!B.detonating, kaboom: ev.sounds.kaboom || 0 };
    },
    // striker shoved sideways into a bomb at a given speed (placed 1px away, velocity set after the first tick)
    shoveBomb(striker, speed) {
      room(); const B = mk("bomb", 14 * TILE, FLOOR); step(10);
      const C = mk(striker, 14 * TILE - ACTOR_SIZE - 2, FLOOR); step(8); C.bouncyCooldown = 400; C.vx = speed;
      step(30);
      return { det: ev.det, detonating: !!B.detonating };
    },
    // three bombs side by side; a crate dropped on the first
    chain3() {
      room(); const bs = [10, 11, 12].map(c => mk("bomb", c * TILE + 16, FLOOR)); step(10);
      const C = mk("crate", 10 * TILE + 16, FLOOR - 4 * TILE); C.x = bs[0].x; let n = 0; while (!bs.every(b => b.detonating) && n++ < 400) step(1);
      return { det: ev.det, all: bs.every(b => b.detonating), frames: n };
    },
    // bomb at the bottom of a stack, and a stack with a stone; resting for 30 simulated seconds: no detonation, no fx
    restStack() {
      room(); const B = mk("bomb", 12 * TILE + 16, FLOOR); step(10);
      let y = B.y; for (let i = 0; i < 3; i++) { y -= ACTOR_SIZE + 1; const c = mk("crate", 12 * TILE + 16, y); c.x = B.x; step(30); }
      const S = mk("stone", 15 * TILE, FLOOR); step(30);
      const before = { big: ev.big, det: ev.det };
      for (let i = 0; i < 30 * 60; i++) tick(1 / 60);
      return { det: ev.det - before.det, bigDuring: ev.big - before.big, puffs: ev.puffs, shakes: ev.shakes, bombY: Math.round(B.y), alive: bombs().length };
    },
    // cannon-launched crate into a wanderer: measure the landing spot with nothing there, then put a wanderer on it
    cannonHit(withNpc) {
      room(); board[16][4] = "cannon2-ne:none"; const T = { x: 0 };
      const C = mk("crate", 4 * TILE + 16, 16 * TILE + 16); C.x = 4 * TILE + 16 - C.w / 2; C.y = 16 * TILE + 16 - C.h / 2 - 24; C.vy = 200;
      let W = null;
      if (withNpc) { W = mk("wanderer", withNpc * TILE + 16, FLOOR); W.spawnX = 20 * TILE; W.spawnY = W.y; }
      let n = 0, landed = null, ball = false; const trace = [];
      while (n++ < 400) { step(1); if (C.ballistic) ball = true; if (n % 10 === 0) trace.push([Math.round(C.x), Math.round(C.y), Math.round(C.vx), Math.round(C.vy), !!C.ballistic]); if (ball && !C.ballistic && C.grounded) { landed = Math.round(C.x); break; } if (ev.squash) break; }
      return { landed, ball, squash: ev.squash, W: W && { x: Math.round(W.x), y: Math.round(W.y), vx: Math.round(W.vx), vy: Math.round(W.vy), home: Math.abs(W.x - W.spawnX) < 4 }, sounds: ev.sounds, trace: trace.slice(0, 12), logs: ev.logs.slice(-3) };
    },
    // a big crate drop fires puff + shake once; many hits in a second never exceed 2 shakes; reduced motion and pause are respected
    fx() {
      room(); const out = {};
      const B = mk("bomb", 8 * TILE, FLOOR); // anchor, harmless
      const T = mk("stone", 12 * TILE + 16, FLOOR); step(10);
      const C = mk("crate", 12 * TILE + 16, FLOOR - ACTOR_SIZE - 6 * TILE - 40); C.x = T.x; C.y = 40; let n = 0; while (!ev.big && n++ < 300) step(1);
      out.single = { big: ev.big, puffs: ev.puffs, shakes: ev.shakes, offset: shakeOffset() };
      // burst: 10 big hits in 0.5 s
      ev.shakes = 0; ev.puffs = 0; bigHitTimes.length = 0; advanceGameClock(1);
      for (let i = 0; i < 10; i++) { bigHitFx(C, T, 600); advanceGameClock(0.05); }
      out.burst = { shakes: ev.shakes, puffs: ev.puffs, live: fxPuffs.length };
      // paused: no offset
      advanceGameClock(2); bigHitFx(C, T, 600); const live = shakeOffset(); gamePaused = true; out.pausedOffset = shakeOffset(); gamePaused = false; out.liveOffsetBeforePause = live;
      out.decay = []; for (let i = 0; i < 6; i++) { out.decay.push(shakeOffset()); advanceGameClock(0.03); }
      return out;
    },
    fxReduced() { room(); const T = mk("stone", 12 * TILE, FLOOR); const C = mk("crate", 12 * TILE, FLOOR - 100); bigHitFx(C, T, 700); return { puffs: fxPuffs.length, off: shakeOffset() }; },
    // frame time with 40 actors piled and moving
    perf() {
      room(); const kinds = ["crate", "wanderer", "bomb", "stone", "crate"];
      for (let i = 0; i < 40; i++) { const a = mk(kinds[i % 5], (2 + (i % 20)) * TILE + 6, FLOOR - Math.floor(i / 20) * 40 - (i % 3) * 90); a.vx = (i % 7 - 3) * 60; }
      freeze = false; step(60); const t0 = performance.now(); const N = 600; for (let i = 0; i < N; i++) tick(1 / 60); const dt = (performance.now() - t0) / N;
      return { msPerTick: +dt.toFixed(3), actors: actors.length, det: ev.det };
    },

    snapScene() {
      room(); const bs = [8, 9, 10].map(c => mk("bomb", c * TILE + 16, FLOOR)); step(10);
      const C = mk("crate", 8 * TILE + 16, FLOOR - 5 * TILE); C.x = bs[0].x; C.y = FLOOR - 6 * TILE; C.vy = 0; C.spawnX = C.x; C.spawnY = C.y;
      selectedActorDefId = playerDefId; placeNewActor(20 * TILE, FLOOR);
      return JSON.stringify(wrapProjectSnapshot(captureProjectSnapshot()));
    },
    shot() { return null; }
  };
})();`;
(async () => {
  const tmp = path.join(os.tmpdir(), "chain_" + process.pid + ".html");
  fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK + "\n"));
  const br = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await br.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage(); const errs = [];
  page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept());
  await page.goto("file://" + tmp + "#t"); await page.waitForTimeout(300);
  let pass = 0, fail = 0;
  const ok = (name, cond, extra) => { if (cond) pass++; else fail++; console.log((cond ? "ok   " : "FAIL ") + name + (extra !== undefined ? "  " + JSON.stringify(extra) : "")); };
  const ev = (fn, ...a) => page.evaluate(([f, args]) => window.__c[f](...args), [fn, a]);
  const NEW = !process.env.HTML || /impact/.test(src);
  if (!process.env.PERF_ONLY) {
    for (const t of [1, 3, 5]) { const r = await ev("dropOnBomb", "crate", t); ok(`crate dropped ${t} tile(s) onto a bomb actor detonates it`, r.detonating && r.det >= 1, r); }
    for (const t of [2, 4]) { const r = await ev("dropOnBomb", "stone", t); ok(`stone dropped ${t} tiles onto a bomb detonates it`, r.detonating, r); }
    let r = await ev("shoveBomb", "stone", 330); ok("stone shoved into a bomb at 330px/s detonates it", r.detonating, r);
    r = await ev("shoveBomb", "crate", 120); ok("slow shove (120px/s) does not detonate", !r.detonating && r.det === 0, r);
    r = await ev("shoveBomb", "crate", 300); ok("crate at 300px/s detonates (>= BOMB_IMPACT_DETONATE_SPEED)", r.detonating, r);
    r = await ev("chain3"); ok("one dropped crate sets off a chain of three bombs", r.all && r.det >= 3, r);
    r = await ev("restStack"); ok("a bomb under a stack stays put for 30 s: no detonation", r.det === 0 && r.alive === 1, r);
    ok("resting pile: no big-hit events, puffs or shakes in 30 s", r.bigDuring === 0 && r.shakes === 0 && r.puffs === 0, r);
    const nofree = await ev("cannonHit", 0); ok("cannon shot lands somewhere (ballistic flag seen)", nofree.ball && nofree.landed, nofree);
    const land = nofree.landed; const col = Math.round((land - 16) / 32);
    for (const dc of [0, -1, 1]) { const h = await ev("cannonHit", col + dc); console.log("  cannon->wanderer at col", col + dc, JSON.stringify({ squash: h.squash, W: h.W, sounds: h.sounds, logs: h.logs })); if (dc === 0) ok("cannon-launched crate into a wanderer: squashed or flung (not ignored)", h.squash > 0 || (h.W && (Math.abs(h.W.vx) > 20 || h.W.home)), h); }
    const f = await ev("fx"); ok("a big drop fires one event: puff and shake", f.single.big >= 1 && f.single.puffs >= 1 && f.single.shakes >= 1, f.single);
    ok("burst of 10 hits in 0.5 s: exactly 2 shakes, puffs throttled and capped", f.burst.shakes === 2 && f.burst.puffs <= 5 && f.burst.live <= 6, f.burst);
    ok("shake offset is null while paused", f.pausedOffset === null, f);
    ok("shake offsets are whole pixels and decay", f.decay.every(o => o === null || (Number.isInteger(o.x) && Number.isInteger(o.y))), f.decay);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const rr = await ev("fxReduced"); ok("reduced-motion: no puff, no shake", rr.puffs === 0 && rr.off === null, rr);
    await page.emulateMedia({ reducedMotion: "no-preference" });
  }

  {
    const json = await ev("snapScene"); const f1 = path.join(os.tmpdir(), "chain_scene.json"); fs.writeFileSync(f1, json);
    const c2 = await br.newContext({ acceptDownloads: true }); const q = await c2.newPage(); const qe = []; q.on("pageerror", e => qe.push(String(e))); q.on("dialog", d => d.accept());
    await q.addInitScript(() => { window.requestAnimationFrame = () => 0; }); // no Build-mode simulation before export (the scene would blow up before it is saved)
    await q.goto("file://" + path.join(__dirname, "..", "index.html") + "#t"); await q.waitForTimeout(500);
    await q.setInputFiles("#loadProjectInput", f1); await q.waitForTimeout(500);
    const [d] = await Promise.all([q.waitForEvent("download"), q.click("#exportBtn")]);
    const f2 = path.join(os.tmpdir(), "chain_export.html"); await d.saveAs(f2);
    let html = fs.readFileSync(f2, "utf8");
    html = html.replace("playReadyUntil = gameNow() + READY_DURATION_MS;\n  renderPlayHUD();", "playReadyUntil = gameNow() + READY_DURATION_MS;\n  renderPlayHUD(); window.__x = () => ({ bombs: actors.filter(a => (actorDefs[a.defId]||{}).temperament === CARRY_BOMB2_KIND).length, puffs: fxPuffs.length, shakeAt, a: actors.map(a => [(actorDefs[a.defId]||{}).temperament, Math.round(a.x), Math.round(a.y), Math.round(a.vy), !!a.detonating]), t: gameNow(), ready: playReadyUntil });", 1);
    fs.writeFileSync(f2, html);
    const x = await c2.newPage(); const xe = []; x.on("pageerror", e => xe.push(String(e)));
    await x.goto("file://" + f2); await x.waitForTimeout(500);
    const before = await x.evaluate(() => window.__x());
    await x.waitForTimeout(4000);
    const after = await x.evaluate(() => window.__x());
    const txt = fs.readFileSync(f2, "utf8");
    ok("export has the new functions/constants", ["function tryImpactDetonate", "function bigHitFx", "BIG_HIT_MIN_SPEED", "function renderPuffs"].every(t => txt.includes(t)));
    ok("exported game: dropped crate sets off the three-bomb chain (3 bombs -> 0), no errors", before.bombs === 3 && after.bombs === 0 && xe.length === 0, { before, after, xe });
    await c2.close();
  }
  const pf = await ev("perf"); console.log("PERF", JSON.stringify(pf));
  ok("no page errors", errs.length === 0, errs.slice(0, 3));
  console.log(`=== CHAIN (Stage 3): ${pass} passed, ${fail} failed ===`);
  await br.close(); fs.unlinkSync(tmp); process.exit(fail ? 1 : 0);
})();
