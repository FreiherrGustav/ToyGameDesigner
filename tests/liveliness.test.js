// Liveliness pass: tile squash, idle motion for static pieces, bouncy tell in Play, performance. BEFORE=/tmp/before_index.html node tests/liveliness.test.js
const fs = require("fs"), path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/opt/node22/lib/node_modules/playwright");
const A = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const mk = (file, tag) => { const out = "/tmp/live_" + tag + ".html"; fs.writeFileSync(out, fs.readFileSync(file, "utf8").replace(A, A + 'window.__ev=f=>eval("("+f+")");\n')); return out; };
const AFTER = mk(path.join(__dirname, "..", "index.html"), "a"), BEFORE = process.env.BEFORE ? mk(process.env.BEFORE, "b") : null;
let fails = 0; const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fails++; };
const dist = (A, B) => { let n = 0; for (let i = 0; i < A.length; i += 4) if (A[i] !== B[i] || A[i+1] !== B[i+1] || A[i+2] !== B[i+2] || A[i+3] !== B[i+3]) n++; return n; };
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const open = async (file, opts) => { const p = await b.newPage(Object.assign({ viewport: { width: 1366, height: 768 } }, opts)); p.on("dialog", d => d.accept()); p.errs = []; p.on("pageerror", e => p.errs.push(e.message)); await p.goto("file://" + file + "#t"); p.ev = (f, a) => p.evaluate(([f, a]) => window.__ev(f)(a), [f.toString(), a]); return p; };
  const p = await open(AFTER);
  // ---- 1. squash on bounce, all four gravities, resting-state skinned tile keeps its skin
  for (const dir of ["down", "up", "left", "right"]) {
    const r = await p.ev((dir) => {
      suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false;
      gravityEnabled = true; gravityDir = dir;
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) board[y][x] = null;
      actors.length = 0; setGamePaused(false);
      const vec = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[dir];
      const cx = 12, cy = 8; // tile
      board[cy][cx] = "solid:bouncy"; // single tile; the crate falls onto it along gravity
      const a = placeCarryableActor(PUSHABLE_DEF_ID, (cx + 0.5 - vec[0] * 3) * TILE, (cy + 0.5 - vec[1] * 3) * TILE, null);
      a.vx = vec[0] * 300; a.vy = vec[1] * 300; a.bouncyCooldown = 400;
      let found = null;
      for (let i = 0; i < 120 && !found; i++) { tick(1 / 60); const e = tileAnimState[cx + "," + cy]; if (e && e.recipe === "tileSquash") found = { dirx: e.dirx, diry: e.diry }; }
      return { found, vec };
    }, dir);
    ok(r.found && r.found.dirx === r.vec[0] && r.found.diry === r.vec[1], "tile squash recorded along the contact line, gravity " + dir + " " + JSON.stringify(r.found));
  }
  // render the squash and see the tile region change
  const sq = await p.ev(() => {
    suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false;
    gravityEnabled = true; gravityDir = "down"; setGamePaused(false); actors.length = 0;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) board[y][x] = null;
    board[10][12] = "solid:bouncy"; groundSkinBoard[10][12] = "gndGrass"; // skinned on purpose: the skin must survive the squash
    const g = gameCanvas.getContext("2d");
    renderGame(); const rest = Array.from(g.getImageData(12 * 32, 10 * 32, 32, 32).data);
    tileAnimState["12,10"] = { recipe: "tileSquash", t: gameNow(), geometry: "solid", modifier: "bouncy", extra: { skinDef: groundTileDefs.gndGrass, skinRotation: 0 }, dirx: 0, diry: 1 };
    advanceGameClock(0.055); renderGame(); const mid = Array.from(g.getImageData(12 * 32, 10 * 32, 32, 32).data);
    // green-ish pixels (grass skin) still present mid-squash
    let green = 0; for (let i = 0; i < mid.length; i += 4) if (mid[i] > 130 && mid[i + 1] > 70 && mid[i + 2] < 80 && mid[i] > mid[i + 2] + 60 && !(mid[i] > 240 && mid[i + 1] > 140 && mid[i + 2] < 20)) green++; // the grass skin's dirt browns, not the orange bouncy ring
    advanceGameClock(0.3); renderGame(); const after = Array.from(g.getImageData(12 * 32, 10 * 32, 32, 32).data);
    return { rest, mid, after, green };
  });
  ok(dist(sq.rest, sq.mid) > 60, "squash visibly changes the tile (" + dist(sq.rest, sq.mid) + " px)");
  ok(sq.green > 100, "a skinned tile keeps its skin while squashing (" + sq.green + " skin px)");
  ok(dist(sq.rest, sq.after) < 20, "tile is back to rest after the recipe (" + dist(sq.rest, sq.after) + " px)");
  // jump off a bouncy floor
  const jr = await p.ev(() => {
    suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false;
    gravityEnabled = true; gravityDir = "down"; setGamePaused(false); actors.length = 0;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) board[y][x] = null;
    for (let x = 8; x < 16; x++) board[12][x] = "solid:bouncy";
    selectedActorDefId = playerDefId; placeNewActor(12 * TILE + 16, 12 * TILE - 12);
    for (let i = 0; i < 90; i++) tick(1 / 60); // settle (the bounces die out)
    for (const k in tileAnimState) delete tileAnimState[k];
    keys[" "] = true; let rec = null; for (let i = 0; i < 6 && !rec; i++) { tick(1 / 60); for (const k in tileAnimState) if (tileAnimState[k].recipe === "tileSquashSoft") rec = k; } keys[" "] = false;
    return { rec };
  });
  ok(!!jr.rec, "a plain jump off a bouncy tile squashes it softly (" + jr.rec + ")");
  // ---- 2. idle motion for the four static pieces; already-animated pieces untouched; bouncy at-rest tell in Play
  const idleScript = (keys) => {
    const out = {};
    const g = document.createElement("canvas"); g.width = 32; g.height = 32; const c = g.getContext("2d");
    for (const [name, key, extra, mode] of keys) {
      const prev = appMode; appMode = mode; const frames = []; gameClockMs = 1000;
      try { for (let i = 0; i < 10; i++) { c.clearRect(0, 0, 32, 32); drawGameplayTile(c, 0, 0, GAMEPLAY_TILE_DEFS[key], extra); frames.push(Array.from(c.getImageData(0, 0, 32, 32).data)); advanceGameClock(0.19); } } finally { appMode = prev; }
      out[name] = frames;
    }
    return out;
  };
  const KEYS = [["goal", "goal:none", { phase: 0.2 }, "play"], ["trampoline", "trampoline:none", { phase: 0.2 }, "play"], ["cannon", "cannon2-ne:none", { phase: 0.2 }, "play"], ["magnet", "magnet:none", { phase: 0.2 }, "play"],
    ["warp", "warp:none", { phase: 0.2 }, "play"], ["blackhole", "gravitywell:none", { phase: 0.2 }, "play"], ["plain", "solid:none", { phase: 0.2 }, "play"], ["bouncy", "solid:bouncy", { phase: 0.2 }, "play"], ["bouncyBuild", "solid:bouncy", { phase: 0.2 }, "build"],
    ["plate", "plate:none", { phase: 0.2 }, "play"], ["door", "door:none", { phase: 0.2 }, "play"]];
  const after = await p.ev(idleScript, KEYS);
  const anim = f => { let m = 0; for (let i = 1; i < f.length; i++) m = Math.max(m, dist(f[0], f[i])); return m; };
  for (const n of ["goal", "trampoline", "cannon", "magnet"]) ok(anim(after[n]) >= 8, n + " has idle motion (" + anim(after[n]) + " px change over 1.9 s)");
  for (const n of ["goal", "trampoline", "cannon", "magnet"]) ok(anim(after[n]) < 420, n + " idle motion is small (<420 of 1024 px)");
  ok(anim(after.plain) === 0 && anim(after.plate) === 0 && anim(after.door) === 0, "plain ground, plate and door stay still");
  ok(dist(after.bouncy[0], after.plain[0]) > 0, "bouncy vs plain in Play: " + dist(after.bouncy[0], after.plain[0]) + " px (was 0)");
  ok(anim(after.bouncy) > 0, "the bouncy tell breathes (" + anim(after.bouncy) + " px)");
  let bef = null;
  if (BEFORE) {
    const pb = await open(BEFORE);
    bef = await pb.ev(idleScript, KEYS);
    ok(dist(bef.bouncy[0], bef.plain[0]) === 0, "[before] bouncy vs plain in Play was 0 px");
    ok(anim(bef.goal) === 0 && anim(bef.cannon) === 0 && anim(bef.magnet) === 0 && anim(bef.trampoline) === 0, "[before] the four pieces were static");
    let same = true; for (const n of ["warp", "blackhole", "plain", "plate", "door"]) for (let i = 0; i < 10; i++) if (dist(bef[n][i], after[n][i]) !== 0) same = false;
    ok(same, "warp, black hole, plain ground, plate and door draw identically before and after (10 clock steps)");
    await pb.close();
  }
  // reduced motion
  const pr = await open(AFTER, { reducedMotion: "reduce" });
  const red = await pr.ev(idleScript, KEYS);
  ok(["goal", "trampoline", "cannon", "magnet", "bouncy"].every(n => anim(red[n]) === 0), "reduced motion: idle motion off");
  await pr.close();
  // ---- 3. performance: render cost over every sample, before vs after
  const perfScript = () => {
    const res = [];
    for (const s of SAMPLE_GAMES) {
      suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false;
      loadExampleGame(s.builder, s.name, { skipConfirm: true }); setGamePaused(false);
      for (let i = 0; i < 30; i++) tick(1 / 60);
      const N = 120; const t0 = performance.now(); for (let i = 0; i < N; i++) { advanceGameClock(0.016); renderGame(); } const dt = (performance.now() - t0) / N;
      res.push([s.id, +dt.toFixed(2)]);
    }
    return res;
  };
  const runPerf = async (file, throttle) => { const pp = await open(file); const cdp = await pp.context().newCDPSession(pp); if (throttle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle }); const r = await pp.ev(perfScript); await pp.close(); return r; };
  const perfA = await runPerf(AFTER, 1), perfB = BEFORE ? await runPerf(BEFORE, 1) : null;
  const perfA4 = await runPerf(AFTER, 4), perfB4 = BEFORE ? await runPerf(BEFORE, 4) : null;
  console.log("sample".padEnd(26), "before ms", "after ms", "| 4x throttle before/after");
  perfA.forEach(([id, t], i) => console.log(id.padEnd(26), String(perfB ? perfB[i][1] : "-").padEnd(9), String(t).padEnd(8), "|", perfB4 ? perfB4[i][1] : "-", "/", perfA4[i][1]));
  const worst = perfA4.reduce((m, r) => r[1] > m[1] ? r : m);
  ok(worst[1] < 33, "worst sample at 4x CPU throttle renders under 33 ms (" + worst[0] + " " + worst[1] + " ms)");
  ok(p.errs.length === 0, "no page errors " + p.errs.slice(0, 2));
  await b.close(); console.log(fails ? "FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);
})();
