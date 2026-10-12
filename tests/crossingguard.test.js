// Crossing Guard sample traces (not deployed). Usage: node tests/crossingguard.test.js
// Hook-injected temp copy, requestAnimationFrame disabled so every trace is deterministic manual ticking.
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/opt/node22/lib/node_modules/playwright");
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = `window.__ev=f=>eval("("+f+")");window.__hz=0;
{const o=triggerHazard;triggerHazard=function(){const pre={x:Math.round(arguments[0].x),y:Math.round(arguments[0].y),near:actors.filter(a=>moverDefOf(a)&&moverTouches(a,arguments[0])).map(a=>a.defId+'@'+Math.round(a.x)+','+Math.round(a.y))};const r=o.apply(this,arguments);if(r){window.__hz++;window.__hzInfo={...pre,sfx:arguments[2]||'',stack:new Error().stack.split('\\n').slice(2,4).join('|')};}return r;};window.__unwrapHz=()=>{triggerHazard=o;};}
window.__t={tick:n=>{for(let i=0;i<n;i++)tick(1/60)},keys:()=>keys};`;
const tmp = path.join(os.tmpdir(), "cg_test_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK));
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fails.push(m); console.log("FAIL:", m); } };
const run = (pg, fn, arg) => pg.evaluate(([s, a]) => window.__ev(s)(a), [fn.toString(), arg]);

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage();
  const errors = []; page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept());
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto("file://" + tmp); await page.waitForFunction(() => window.__t);

  const load = () => run(page, () => {
    exitToBuildMode && appMode === "play" && exitToBuildMode();
    loadExampleGame(buildCrossingGuardGame, "Crossing Guard"); enterPlayMode(); playReadyUntil = null; window.__hz = 0;
    const p = actors.find(a => a.isPlayer);
    return { cols: roomCols(), cam: cameraMode, wrapV: wrapVEnabled, grav: gravityEnabled, lives, movers: actors.filter(a => moverDefOf(a)).length, px: p.x, py: p.y, coins: actors.filter(a => a.defId === "colCoin").length };
  });
  const info = await load();
  console.log("sample:", JSON.stringify(info));
  ok(info.cols === 72 && info.cam === "follow" && info.wrapV && !info.grav && info.movers === 32, "sample shape " + JSON.stringify(info));

  // The bot: a patient player. It only ever crosses a road lane when no car will touch its row during the crossing,
  // and only hops to the next river lane when a float of that lane will be under it as it crosses the boundary.
  const BOT = (cfg) => {
    const ext = ROWS * TILE;
    const p = actors.find(a => a.isPlayer);
    const movers = () => actors.filter(a => moverDefOf(a));
    const yAt = (m, t) => { const d = MOVER_DIRS[m.moverDir]; return m.y + d.y * moverSpeedOf(moverDefOf(m)) * t; };
    const overlapsY = (m, t, a, b) => { const y = yAt(m, t); for (const k of [-1, 0, 1, 2]) { const lo = y + (k - 1) * ext, hi = lo + m.h; if (a < hi && b > lo) return true; } return false; };
    const laneOf = (m) => Math.round(m.x / TILE);
    const K = __t.keys();
    const stages = [];
    let hits = 0, t = 0; const dt = 1 / 60;
    const roadLanes = [7, 11, 15, 19, 23, 27], islands = [298, 426, 554, 682, 810, 930];
    const riverLeft = 36 * TILE;
    const floatsIn = (laneCol) => movers().filter(m => laneOf(m) === laneCol && moverDefOf(m).moverKind === "floats");
    const hurtsIn = (laneCol) => movers().filter(m => laneOf(m) === laneCol && moverDefOf(m).moverKind === "hurts");
    const coversY = (m, tt, a, b) => { const y = yAt(m, tt); for (const k of [-1, 0, 1, 2]) { const lo = y + (k - 1) * ext; if (lo <= a && lo + m.h >= b) return true; } return false; };
    let committed = false, settled = false, phase = "road", hopK = null;
    const waitTicks = cfg.delay | 0;
    for (let i = 0; i < waitTicks; i++) { __t.tick(1); t += dt; }
    const startHz = window.__hz;
    for (let step = 0; step < cfg.maxSeconds * 60 && !playSessionEnded; step++) {
      const cx = p.x + p.w / 2;
      let wantRight = false;
      if (cx < 31 * TILE) {
        // road: stop 26px short of a lane's near edge, cross only when no car will touch this row during the crossing
        const inLane = roadLanes.some(c => p.x + p.w > c * TILE && p.x < (c + 2) * TILE);
        const lc = roadLanes.find(c => (c + 2) * TILE > p.x);
        if (inLane || committed) { wantRight = true; if (inLane) committed = false; }
        else if (lc == null) wantRight = true;
        else {
          // release the approach early enough that coasting (~14px) leaves a few px before the lane
          const holdUntil = lc * TILE - 44;
          if (p.x < holdUntil && !settled) wantRight = true;
          else {
            settled = true;
            const dist = (lc + 2) * TILE - p.x;
            const need = 0.12 + dist / 220;
            let safe = true;
            for (let tt = 0; tt <= need + 0.1 && safe; tt += 0.05) for (const m of hurtsIn(lc)) if (overlapsY(m, tt, p.y - 14, p.y + p.h + 14)) { safe = false; break; }
            wantRight = safe; committed = safe; if (safe) settled = false;
          }
        }
        phase = "road";
      } else if (cx < 50 * TILE) {
        // bank (k = -1) or riding lane k (0..6); a hop is committed until the centre is well inside the next lane
        const k = cx < riverLeft ? -1 : Math.floor((cx - riverLeft) / 64);
        phase = "river" + k;
        if (hopK !== null && cx >= riverLeft + (hopK + 1) * 64 + 18) hopK = null;
        if (hopK !== null) wantRight = true;
        else if (k === -1 && cx < riverLeft - 14) wantRight = true; // walk to the bank edge first
        else {
          const B = riverLeft + (k + 1) * 64;
          const d = Math.max(B - cx, 0);
          const tc = d < 24 ? Math.sqrt(2 * d / 2200) : 0.1 + (d - 11) / 220;
          const vy = p.ridingMover != null ? (() => { const rm = actors.find(a => a.id === p.ridingMover); return rm ? MOVER_DIRS[rm.moverDir].y * moverSpeedOf(moverDefOf(rm)) : 0; })() : 0;
          const yc = p.y + vy * tc;
          const cur = k >= 0 ? floatsIn(36 + 2 * k) : [], nxt = k < 6 ? floatsIn(36 + 2 * (k + 1)) : [];
          const mid = p.h / 2, curOk = k < 0 || p.ridingMover != null;
          let go;
          if (k === 6) go = p.ridingMover != null;
          else go = curOk && nxt.some(m => coversY(m, tc, yc + mid - 6, yc + mid + 6));
          if (go) { hopK = k; wantRight = true; }
        }
      } else {
        wantRight = true; phase = "meadow";
      }
      K.ArrowRight = wantRight;
      if (wantRight) K.ArrowLeft = false;
      __t.tick(1); t += dt;
      if (window.__hz > startHz) { hits = window.__hz - startHz; stages.push(phase + "@" + t.toFixed(1)); break; }
      if (cx > 63 * TILE + 40) break;
    }
    K.ArrowRight = false;
    const dbgState = { hopK, rm: p.ridingMover, y: Math.round(p.y), cxl: Math.round(p.x + p.w / 2), keyR: K.ArrowRight };
    return { dbgState, won: playSessionEnded === "win", hits, t: +t.toFixed(1), x: Math.round(p.x), phase, stages, lives, info: window.__hzInfo };
  };
  const botSrc = BOT.toString();
  const runBot = (cfg) => page.evaluate(([s, c]) => window.__ev(s)(c), [botSrc, cfg]);

  for (const delay of [0, 37, 91, 143, 211, 307]) {
    await load();
    const r = await runBot({ delay, maxSeconds: 260 });
    console.log("bot delay", delay, JSON.stringify(r));
    ok(r.won && r.hits === 0, "patient bot (delay " + delay + ") should win with no hit: " + JSON.stringify(r));
  }

  // naive: hold right the whole way never wins and costs lives
  await load();
  const naive = await run(page, () => {
    const K = __t.keys(); K.ArrowRight = true; let t = 0;
    while (t < 90 && !playSessionEnded) { __t.tick(1); t += 1 / 60; if (window.__hz) break; }
    K.ArrowRight = false;
        return { won: playSessionEnded === "win", hits: window.__hz, x: Math.round(actors.find(a => a.isPlayer).x) };
  });
  console.log("naive:", JSON.stringify(naive));
  ok(!naive.won && naive.hits >= 1, "holding right should not win " + JSON.stringify(naive));

  // river-only naive: standing at the bank edge and holding right through every lane never makes it across (12 starts)
  let riverWins = 0, riverTries = 0;
  for (let d = 0; d < 12; d++) {
    await load();
    const r = await run(page, (delay) => {
      const p = actors.find(a => a.isPlayer); p.x = 35 * TILE + 4; p.y = 9 * TILE + 5; startPos.x = p.x; startPos.y = p.y;
      __t.tick(delay); const K = __t.keys(); K.ArrowRight = true; let t = 0; window.__hz = 0;
      while (t < 40 && !playSessionEnded && !window.__hz) { __t.tick(1); t += 1 / 60; }
      K.ArrowRight = false; return { won: playSessionEnded === "win", hits: window.__hz };
    }, d * 53);
    riverTries++; if (r.won && !r.hits) riverWins++;
  }
  console.log("river-only holding right:", riverWins + "/" + riverTries);
  ok(riverWins <= 3, "river is not gating enough: " + riverWins + "/" + riverTries);


  // lives/restart loop in the real engine: a car hit costs a life, the level restarts after ~650ms with phases reset
  await load();
  const hit0 = await run(page, () => {
    const p = actors.find(a => a.isPlayer); const K = __t.keys(); K.ArrowRight = true;
    for (let i = 0; i < 1200 && !window.__hz; i++) __t.tick(1); // walk straight into a lane until a car connects
    K.ArrowRight = false;
    const t = actors.find(a => moverDefOf(a)).moverT;
    return { hz: window.__hz, lives, moverT: t };
  });
  await page.waitForTimeout(1000);
  const hit1 = await run(page, () => { const p = actors.find(a => a.isPlayer); return { lives, x: Math.round(p.x), t: actors.find(a => moverDefOf(a)).moverT, ready: playReadyUntil != null }; });
  console.log("restart loop:", JSON.stringify({ hit0, hit1 }));
  ok(hit0.hz >= 1 && hit1.lives === 2 && hit1.x === Math.round(info.px) && hit1.t < 0.1, "car hit should cost a life and restart the level " + JSON.stringify({ hit0, hit1 }));

  // Follow camera across the 72-wide room: it has to reach the far end while the bot crosses
  await load();
  const cam = await runBot({ delay: 0, maxSeconds: 60 });
  const camX = await run(page, () => cameraX);
  ok(cam.won && camX > 600, "camera should follow to the goal: " + camX);

  // idle on the start bank for two minutes: nothing touches the frog
  await load();
  const idle = await run(page, () => { __t.tick(7200); return { hz: window.__hz, over: playSessionEnded }; });
  ok(idle.hz === 0 && !idle.over, "idle on the start bank " + JSON.stringify(idle));

  // opportunity analysis: how long can a patient player be made to wait?
  await load();
  const windows = await run(page, () => {
    const ext = ROWS * TILE;
    const ms = actors.filter(a => moverDefOf(a));
    const lane = (c) => ms.filter(m => Math.round(m.x / TILE) === c);
    const setT = (t) => ms.forEach(m => { m.moverT = t; moverPlaceAt(m); });
    const intervalsAt = (c) => lane(c).filter(m => moverDefOf(m).moverKind === "floats").map(m => [m.y, m.y + m.h]);
    const overlapMax = (A, B) => { let best = 0; for (const [a0, a1] of A) for (const [b0, b1] of B) for (const k of [-1, 0, 1]) { const lo = Math.max(a0, b0 + k * ext), hi = Math.min(a1, b1 + k * ext); best = Math.max(best, hi - lo); } return best; };
    const out = {};
    // river hops, per float: riding THIS float, how long until a float of the next lane overlaps it by >= 30px?
    for (let k = 0; k < 6; k++) {
      let worst = 0, minPct = 100;
      const floatsK = lane(36 + 2 * k).filter(m => moverDefOf(m).moverKind === "floats");
      floatsK.forEach((fl, idx) => {
        let longestWait = 0, run = 0, feasible = 0, n = 0;
        for (let t = 0; t < 400; t += 1 / 20) {
          setT(t);
          const f = lane(36 + 2 * k).filter(m => moverDefOf(m).moverKind === "floats")[idx];
          const w = overlapMax([[f.y, f.y + f.h]], intervalsAt(38 + 2 * k)); n++;
          if (w >= 30) { feasible++; longestWait = Math.max(longestWait, run); run = 0; } else run += 1 / 20;
        }
        worst = Math.max(worst, longestWait, run); minPct = Math.min(minPct, 100 * feasible / n);
      });
      out["river" + k] = { feasiblePct: +minPct.toFixed(1), longestWaitS: +worst.toFixed(1) };
    }
    // bank -> lane 1 requires a lane-1 float at the frog's row
    {
      let longestWait = 0, run = 0, feasible = 0, n = 0;
      for (let t = 0; t < 400; t += 1 / 20) { setT(t); const f = intervalsAt(36).some(([a, b]) => [-1, 0, 1].some(k => a + k * ext <= 293 - 3 && b + k * ext >= 293 + 25)); n++; if (f) { feasible++; longestWait = Math.max(longestWait, run); run = 0; } else run += 1 / 20; }
      out.bankToLane1 = { feasiblePct: +(100 * feasible / n).toFixed(1), longestWaitS: +Math.max(longestWait, run).toFixed(1) };
    }
    // road lanes: the frog's row (y 293..315) clear of every vehicle for a 0.55s crossing
    const roadC = [7, 11, 15, 19, 23, 27];
    roadC.forEach((c, i) => {
      let longestWait = 0, run = 0, feasible = 0, n = 0;
      for (let t = 0; t < 400; t += 1 / 20) {
        setT(t);
        const dirY = MOVER_DIRS[lane(c)[0].moverDir].y, sp = moverSpeedOf(moverDefOf(lane(c)[0]));
        let clear = true;
        for (let tt = 0; tt <= 0.6 && clear; tt += 0.05) for (const m of lane(c)) { const y = m.y + dirY * sp * tt; for (const k of [-1, 0, 1]) { const lo = y + k * ext - 14; if (lo < 293 + 22 + 0 && lo + m.h + 28 > 293) clear = false; } }
        n++; if (clear) { feasible++; longestWait = Math.max(longestWait, run); run = 0; } else run += 1 / 20;
      }
      out["road" + i] = { feasiblePct: +(100 * feasible / n).toFixed(1), longestWaitS: +Math.max(longestWait, run).toFixed(1) };
    });
    return out;
  });
  console.log("windows:", JSON.stringify(windows));
  for (const k of Object.keys(windows)) ok(windows[k].longestWaitS <= 14 && windows[k].feasiblePct >= 10, "hop " + k + " too rare: " + JSON.stringify(windows[k]));


  // exported standalone game: the same patient bot crosses road and river inside the exported file
  await load();
  await run(page, () => { window.__unwrapHz(); exitToBuildMode(); });
  const dl = page.waitForEvent("download");
  await page.click("#exportBtn");
  const out = path.join(os.tmpdir(), "cg_export.html");
  await (await dl).saveAs(out);
  let html = fs.readFileSync(out, "utf8");
  ok(!html.includes("__toyDebug") && html.includes("tickMovers") && html.includes("cgWater") && html.includes("mvLog"), "export has the sample");
  const bootAnchor = "playReadyUntil = performance.now() + READY_DURATION_MS;\n  renderPlayHUD();";
  ok(html.includes(bootAnchor), "export boot anchor present");
  html = html.replace(bootAnchor, bootAnchor + " window.__ev = f => eval('(' + f + ')'); window.__t = { tick: n => { for (let i = 0; i < n; i++) tick(1/60); }, keys: () => keys }; Object.defineProperty(window, '__hz', { get: () => 3 - lives });");
  fs.writeFileSync(out, html);
  const px = await browser.newPage(); const ex = [];
  await px.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  px.on("pageerror", e => ex.push(String(e))); px.on("console", m => { if (m.type() === "error") ex.push(m.text()); });
  await px.goto("file://" + out); await px.waitForTimeout(500);
  await px.evaluate(() => { playReadyUntil = null; }).catch(() => {});
  const exr = await px.evaluate(([s, c]) => { playReadyUntil = null; return window.__ev(s)(c); }, [botSrc, { delay: 20, maxSeconds: 120 }]).catch(e => ({ err: String(e) }));
  console.log("export bot:", JSON.stringify(exr).slice(0, 300));
  ok(exr && exr.won && exr.hits === 0, "exported game should be crossable by the same bot " + JSON.stringify(exr).slice(0, 200));
  ok(ex.length === 0, "export errors: " + ex.slice(0, 3).join(" | "));

  ok(errors.length === 0, "page errors: " + errors.slice(0, 3).join(" | "));
  await browser.close();
  console.log(`\n=== CROSSING GUARD: ${pass} passed, ${fails.length} failed ===`);
  process.exit(fails.length ? 1 : 0);
})();
