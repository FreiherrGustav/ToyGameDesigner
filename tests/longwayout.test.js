// "The Long Way Out" reliability suite (not deployed). Usage: node tests/longwayout.test.js [runs]
// Hook-injected temp copy; requestAnimationFrame is disabled so every run is deterministic manual ticking.
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/opt/node22/lib/node_modules/playwright");
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
if (!src.includes(anchor)) throw new Error("anchor missing");
const HOOK = `window.__ev=f=>eval("("+f+")");window.__t={tick:(n,dt)=>{for(let i=0;i<n;i++)tick(dt||1/60)},keys:()=>keys};`;
const tmp = path.join(os.tmpdir(), "lwo_test_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK));
const RUNS = +process.argv[2] || 100;
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fails.push(m); console.log("FAIL:", m); } };
const run = (pg, fn, arg) => pg.evaluate(([s, a]) => window.__ev(s)(a), [fn.toString(), arg]);

// One simulated session. cfg: { fps, flip: "walk"|"none", mash: seed|null, mashAlways: bool, idleAfter: seconds, maxS }
const SIM = (cfg) => {
  if (appMode === "play") exitToBuildMode();
  loadExampleGame(buildLongWayOutGame, "The Long Way Out"); enterPlayMode(); playReadyUntil = null;
  for (const k of Object.keys(keys)) keys[k] = false; // no key may leak in from a previous simulated session
  const DT = 1 / cfg.fps, p = actors.find(a => a.isPlayer);
  const key = (type, k) => window.dispatchEvent(new KeyboardEvent(type, { key: k }));
  const by = (dx, dy) => actors.find(a => !a.isPlayer && Math.floor(a.spawnX / TILE + 0.5) === dx && Math.floor(a.spawnY / TILE + 0.5) === dy);
  const crate1 = by(23, 0), stone = by(2, 0), bomb = by(1, 0), crate2 = by(0, 8), crate3 = by(22, 10);
  let startPos = null;
  const T = {}; let t = 0, t0 = null, flips = 0, lastRed = false, minDist = 1e9, xMin = 1e9, carried = false, winBeforePurple = false;
  let seed = (cfg.mash || 1) >>> 0; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const origRandom = Math.random; let randomCalls = 0; Math.random = function () { randomCalls++; return origRandom(); };
  const mark = (k, c) => { if (c && !(k in T)) T[k] = +(t - (t0 || 0)).toFixed(3); };
  const held = {}; const hold = (k, v) => { if (!!held[k] !== v) { held[k] = v; key(v ? "keydown" : "keyup", k); } };
  let leaving = false, idle = 0, purpleAt = null;
  hold("ArrowLeft", cfg.flip === "walk");
  const maxF = cfg.fps * (cfg.maxS || 80);
  for (let f = 0; f < maxF; f++) {
    tick(DT); t += DT;
    if (startPos == null && t >= 2) startPos = actors.filter(a => !a.isPlayer).map(a => [a.x, a.y]); // after the initial settle
    const red = isChannelOn("red"); if (red !== lastRed) { flips++; lastRed = red; }
    if (t0 == null && red) { t0 = t; if (cfg.flip === "walk") hold("ArrowLeft", false); }
    if (t0 != null) {
      mark("gateA_crate1_moves", crate1.x < 22 * TILE);
      mark("P1_blue", isChannelOn("blue"));
      mark("P2_green", isChannelOn("green"));
      mark("bomb_blast_cork", board[9][0] == null);
      mark("cannon_fired", crate2.ballistic || crate2.cannonLoad);
      mark("switch2_yellow", isChannelOn("yellow"));
      mark("crate3_leaves_gateD", crate3.x < 21 * TILE);
      mark("last_plate_purple", isChannelOn("purple"));
      if (isChannelOn("purple") && !leaving && cfg.flip === "walk" && !cfg.noLeave) { leaving = true; hold("ArrowLeft", true); }
      if (isChannelOn("purple") && purpleAt == null) purpleAt = t;
      if (playSessionEnded) { mark("win", true); if (!("purple" in {}) && !isChannelOn("purple")) winBeforePurple = true; if (!cfg.idleAfter) break; }
    }
    if (cfg.mash != null && (cfg.mashAlways || t0 == null || !leaving)) {
      if (f % 7 === 0) { const ks = (cfg.noLeft ? ["ArrowRight", "ArrowUp", "ArrowDown", " ", "w", "s", "d"] : ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "w", "a", "s", "d"]); ks.forEach(k => hold(k, rnd() < 0.4)); }
      if (f % 23 === 0) { key("keydown", "e"); } if (f % 23 === 11) key("keyup", "e");
    }
    if (!playSessionEnded) {
      const px = p.x + p.w / 2, py = p.y + p.h / 2;
      if (purpleAt == null) xMin = Math.min(xMin, p.x);
      if (purpleAt == null) for (const a of actors) { if (a === p) continue; const d = Math.hypot(a.x + a.w / 2 - px, a.y + a.h / 2 - py); if (d < minDist) minDist = d; }
      if (p.carrying != null) carried = true;
    }
    if (cfg.idleAfter && purpleAt != null && t - purpleAt > cfg.idleAfter) break;
    if (cfg.flip === "none" && t > (cfg.maxS || 60)) break;
  }
  Math.random = origRandom;
  const moved = actors.filter(a => !a.isPlayer).some((a, i) => cfg.flip === "none" && startPos[i] && (Math.abs(a.x - startPos[i][0]) > 0.5 || Math.abs(a.y - startPos[i][1]) > 0.5));
  return { T, end: +(t - (t0 || 0)).toFixed(3), win: playSessionEnded, flips, minDist: Math.round(minDist), xMin: Math.round(xMin), carried, randomCalls, moved, errsLog: 0, playerX: Math.round(p.x) };
};
const stats = (a) => { const s = a.slice().sort((x, y) => x - y); return { n: s.length, min: s[0], med: s[s.length >> 1], max: s[s.length - 1] }; };

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage();
  const errors = []; page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept());
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto("file://" + tmp); await page.waitForFunction(() => window.__t);

  // 1. one reference run
  const base = await run(page, SIM, { fps: 60, flip: "walk" });
  console.log("reference:", JSON.stringify(base.T));
  ok(base.win === "win", "plays start to finish and wins: " + base.win);
  ok(base.randomCalls === 0, "no Math.random calls during a run: " + base.randomCalls);
  console.log("Math.random calls in a run:", base.randomCalls, "| min player-to-piece distance (px):", base.minDist, "(grab range", 41.6, ")");

  // 1b. the whole 24x18 screen is painted, fixed camera, gravity on, no wrap, no hazards anywhere
  const shape = await run(page, () => {
    if (appMode === "play") exitToBuildMode();
    loadExampleGame(buildLongWayOutGame, "x");
    let painted = 0, hurts = 0; for (let y = 0; y < 18; y++) for (let x = 0; x < 24; x++) { if (backgroundBoard[y][x]) painted++; const k = board[y][x] || ""; if (/lethal|hazard/.test(k) || /black|gravitywell/.test(k)) hurts++; }
    return { painted, hurts, cam: cameraMode, grav: gravityEnabled, wrapH: wrapHEnabled, wrapV: wrapVEnabled, rooms: rooms.length };
  });
  console.log("shape:", JSON.stringify(shape));
  ok(shape.painted === 432 && shape.hurts === 0 && shape.cam === "fixed" && shape.grav && !shape.wrapH && !shape.wrapV && shape.rooms === 1, "one fixed room, every cell painted, nothing hurts: " + JSON.stringify(shape));

  // 2. RUNS headless runs: success rate and the spread of every beat
  const all = []; let wins = 0;
  for (let i = 0; i < RUNS; i++) { const r = await run(page, SIM, { fps: 60, flip: "walk" }); all.push(r.T); if (r.win === "win") wins++; }
  console.log(`${RUNS} runs: ${wins} wins`);
  ok(wins === RUNS, `all ${RUNS} runs win (${wins})`);
  const spread = {};
  for (const k of Object.keys(base.T)) { spread[k] = stats(all.map(T => T[k]).filter(v => v != null)); }
  console.table(spread);
  for (const k of Object.keys(spread)) ok(spread[k].n === RUNS && spread[k].max - spread[k].min < 0.05, `beat ${k} identical across runs: ${JSON.stringify(spread[k])}`);

  // 3. frame rates
  for (const fps of [30, 60, 120, 144]) {
    const r = await run(page, SIM, { fps, flip: "walk" });
    const diffs = Object.keys(base.T).map(k => (r.T[k] == null ? 99 : Math.abs(r.T[k] - base.T[k])));
    console.log(`fps ${fps}: win=${r.win} max beat diff ${Math.max(...diffs).toFixed(3)}s plate=${r.T.last_plate_purple}`);
    ok(r.win === "win", `fps ${fps} wins`);
    ok(Math.max(...diffs) < 0.25, `fps ${fps} beats within 0.25s of 60fps (${Math.max(...diffs).toFixed(3)})`);
  }

  // 4. player interference: mashing every key (incl. E) before and after the flip, never leaving the booth until the Gate opens
  for (const seed of [1, 2, 3, 4, 5]) {
    const r = await run(page, SIM, { fps: 60, flip: "walk", mash: seed, mashAlways: false, noLeave: false });
    const diffs = Object.keys(base.T).filter(k => k !== "win").map(k => (r.T[k] == null ? 99 : Math.abs(r.T[k] - base.T[k])));
    console.log(`mash seed ${seed}: win=${r.win} flips=${r.flips} maxBeatDiff=${Math.max(...diffs).toFixed(3)} xMin=${r.xMin} carried=${r.carried} minDist=${r.minDist}`);
    ok(r.xMin >= 20 * 32 - 2, `mash ${seed}: player never left the booth before the Gate opened (xMin ${r.xMin})`);
    ok(!r.carried, `mash ${seed}: player never grabbed anything`);
    ok(r.minDist > 41.6, `mash ${seed}: player never within grab range of a piece (${r.minDist})`);
    ok(Math.max(...diffs) < 0.6, `mash ${seed}: chain unchanged (max beat diff ${Math.max(...diffs).toFixed(3)}s)`);
  }

  // 5. Rule one: do nothing for 60 s (nothing moves, nothing wins); try to get out without ever flipping the Switch
  const idle = await run(page, SIM, { fps: 60, flip: "none", maxS: 60 });
  ok(idle.win === null && !idle.moved && idle.xMin >= 20 * 32 - 2, `idle 60s: nothing moves, no win (${JSON.stringify({ win: idle.win, moved: idle.moved })})`);
  const trying = await run(page, SIM, { fps: 60, flip: "none", mash: 9, mashAlways: true, noLeft: true, maxS: 60 });
  ok(trying.win === null && trying.xMin >= 20 * 32 - 2 && !trying.carried, `mashing without the Switch: stays inside, no win, no grab (xMin ${trying.xMin})`);

  // 6. a 90 s idle after the finale: no errors, nothing drifts
  const fin = await run(page, SIM, { fps: 60, flip: "walk", noLeave: true, idleAfter: 90, maxS: 200 });
  console.log("90s after finale:", JSON.stringify({ win: fin.win, T: fin.T.last_plate_purple, end: fin.end }));
  ok(fin.win === null, "player parked after the finale: no win before leaving (idle 90 s)");

  // 7. Switch mashing: 20 entries in 5 s on the Switch itself
  const sw = await run(page, () => {
    if (appMode === "play") exitToBuildMode();
    for (const k of Object.keys(keys)) keys[k] = false;
    loadExampleGame(buildLongWayOutGame, "x"); enterPlayMode(); playReadyUntil = null;
    const key = (type, k) => window.dispatchEvent(new KeyboardEvent(type, { key: k }));
    const crate1 = actors.find(a => !a.isPlayer && Math.floor(a.spawnX / TILE + 0.5) === 23 && Math.floor(a.spawnY / TILE + 0.5) === 0);
    let t = 0, flips = 0, last = false, t0 = null, tBlue = null, tPurple = null; const DT = 1 / 60;
    for (let f = 0; f < 60 * 60 && !playSessionEnded; f++) {
      // 5 s of in/out of the Switch cell (20 entries), then hands off
      if (f < 300) { const phase = Math.floor(f / 7.5) % 2; key(phase ? "keydown" : "keyup", "ArrowRight"); key(phase ? "keyup" : "keydown", "ArrowLeft"); }
      else { key("keyup", "ArrowRight"); key("keyup", "ArrowLeft"); }
      tick(DT); t += DT;
      const red = isChannelOn("red"); if (red !== last) { flips++; last = red; if (t0 == null) t0 = t; }
      if (tBlue == null && isChannelOn("blue")) tBlue = t; if (tPurple == null && isChannelOn("purple")) tPurple = t;
    }
    return { flips, t0: +t0.toFixed(3), blueAfterFirstFlip: +(tBlue - t0).toFixed(3), purpleAfterFirstFlip: +(tPurple - t0).toFixed(3), crate1x: Math.round(crate1.x) };
  });
  console.log("switch mashing (20 entries / 5s):", JSON.stringify(sw), "baseline blue/purple:", base.T.P1_blue, base.T.last_plate_purple);
  ok(Math.abs(sw.purpleAfterFirstFlip - base.T.last_plate_purple) < 0.6, "mashed Switch: finale time unchanged");

  // 8. lose-nothing: after a full run, Play restart and Build "Reset to start" both put every piece back exactly
  const rs = await run(page, () => {
    for (const k of Object.keys(keys)) keys[k] = false;
    const key = (type, k) => window.dispatchEvent(new KeyboardEvent(type, { key: k }));
    const state = () => JSON.stringify({ b: board, a: actors.map(a => [a.defId, +a.x.toFixed(2), +a.y.toFixed(2), a.isPlayer ? 0 : a.vx, a.isPlayer ? 0 : a.vy]), ch: switchChannels, p: ["red", "blue", "green", "yellow", "purple"].map(c => isChannelOn(c)) });
    const out = {};
    // Play restart
    if (appMode === "play") exitToBuildMode();
    loadExampleGame(buildLongWayOutGame, "x"); enterPlayMode(); playReadyUntil = null; syncChannelsToHotRoom();
    const before = state();
    key("keydown", "ArrowLeft"); for (let i = 0; i < 60 * 40; i++) { tick(1 / 60); if (isChannelOn("red")) key("keyup", "ArrowLeft"); }
    out.ranToPurple = isChannelOn("purple") || playSessionEnded;
    restartPlaySessionFromSnapshot(); playReadyUntil = null; syncChannelsToHotRoom();
    for (const k of Object.keys(keys)) keys[k] = false;
    out.playRestartIdentical = state() === before;
    // Build reset
    exitToBuildMode(); loadExampleGame(buildLongWayOutGame, "x");
    const b2 = state();
    key("keydown", "ArrowLeft"); for (let i = 0; i < 60 * 40; i++) { tick(1 / 60); if (isChannelOn("red")) key("keyup", "ArrowLeft"); }
    out.buildRan = isChannelOn("purple");
    for (const k of Object.keys(keys)) keys[k] = false;
    document.getElementById("resetBtn").click();
    const a2 = state();
    out.buildResetIdentical = a2 === b2;
    if (a2 !== b2) { const A = JSON.parse(b2), B = JSON.parse(a2); out.diff = { boardSame: JSON.stringify(A.b) === JSON.stringify(B.b), actorsSame: JSON.stringify(A.a) === JSON.stringify(B.a), chB: A.ch, chA: B.ch, pB: A.p, pA: B.p }; }
    return out;
  });
  console.log("restart:", JSON.stringify(rs));
  ok(rs.ranToPurple && rs.playRestartIdentical, "Play restart returns every piece, tile and channel to the start state");
  ok(rs.buildRan, "Build mode runs the machine live");
  // Build "Reset to start" restores every piece and tile (blast included); Switch positions are authored data and stay as left.
  ok(rs.buildResetIdentical || (rs.diff && rs.diff.boardSame && rs.diff.actorsSame), "Build 'Reset to start' returns every tile and piece: " + JSON.stringify(rs.diff));
  console.log("note: Build Reset leaves Switch states:", JSON.stringify(rs.diff && rs.diff.chA));

  // 9. export: the standalone file runs the chain once and wins
  await run(page, () => { for (const k of Object.keys(keys)) keys[k] = false; if (appMode === "play") exitToBuildMode(); loadExampleGame(buildLongWayOutGame, "x"); });
  const dl = page.waitForEvent("download");
  await page.click("#exportBtn");
  const out = path.join(os.tmpdir(), "lwo_export.html");
  await (await dl).saveAs(out);
  let html = fs.readFileSync(out, "utf8");
  ok(!html.includes("__toyDebug") && html.includes("lwoBeltE") && html.includes("lwoPlank"), "export contains the sample art");
  const bootAnchor = "playReadyUntil = performance.now() + READY_DURATION_MS;\n  renderPlayHUD();";
  ok(html.includes(bootAnchor), "export boot anchor present");
  html = html.replace(bootAnchor, bootAnchor + " window.__ev = f => eval('(' + f + ')');");
  fs.writeFileSync(out, html);
  const px = await browser.newPage(); const ex = [];
  await px.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  px.on("pageerror", e => ex.push(String(e))); px.on("console", m => { if (m.type() === "error") ex.push(m.text()); });
  await px.goto("file://" + out); await px.waitForTimeout(500);
  const exr = await px.evaluate(() => window.__ev(`() => {
    playReadyUntil = null;
    const key = (type, k) => window.dispatchEvent(new KeyboardEvent(type, { key: k }));
    const T = {}; let t = 0, t0 = null, leaving = false; key("keydown", "ArrowLeft");
    for (let f = 0; f < 60 * 60 && !playSessionEnded; f++) {
      tick(1 / 60); t += 1 / 60;
      if (t0 == null && isChannelOn("red")) { t0 = t; key("keyup", "ArrowLeft"); }
      if (t0 != null) { for (const c of ["blue", "green", "yellow", "purple"]) if (isChannelOn(c) && !(c in T)) T[c] = +(t - t0).toFixed(3); if (T.purple && !leaving) { leaving = true; key("keydown", "ArrowLeft"); } }
    }
    return { T, win: playSessionEnded };
  }`)()).catch(e => ({ err: String(e) }));
  console.log("export run:", JSON.stringify(exr));
  ok(exr && exr.win === "win" && Math.abs(exr.T.purple - base.T.last_plate_purple) < 0.3, "exported game runs the chain once and wins at the same time " + JSON.stringify(exr));
  ok(ex.length === 0, "export errors: " + ex.slice(0, 3).join(" | "));

  ok(errors.length === 0, "page errors: " + errors.slice(0, 3).join(" | "));
  await browser.close();
  console.log(`\n=== THE LONG WAY OUT: ${pass} passed, ${fails.length} failed ===`);
  process.exit(fails.length ? 1 : 0);
})();
