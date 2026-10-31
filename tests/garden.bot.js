// Mousecop's Garden: scripted bots (win rate, first catch, chaser stuck, softlocks) and wrap checks with actors.
// usage: node tests/garden.bot.js [html] [runsPerStrategy=20] [bots|wrap|both]
// Manual ticking at 60 fps (requestAnimationFrame disabled), Math.random seeded per run, keys set like the keyboard handlers do.
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const fs = require("fs"), path = require("path"), os = require("os");
const html = path.resolve(process.argv[2] && process.argv[2] !== "-" ? process.argv[2] : path.join(__dirname, "..", "index.html"));
const RUNS = +(process.argv[3] || 20), MODE = process.argv[4] || "both";
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const DRIVER = `(() => {
  const CFG = ${JSON.stringify({ m0: +(process.env.M0 || 0.3), slope: +(process.env.SLOPE || 0.05), floor: +(process.env.FLOOR || -0.2) })};
  const FPS = 60, dt = 1 / FPS;
  const P = () => actors.find(a => a.isPlayer);
  const by = n => actors.find(a => { const d = actorDefs[a.defId]; return d && d.temperament === n; });
  const K = (k, v) => { keys[k] = v; };
  const release = () => { for (const k of ["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"]) K(k, false); };
  let seed = 1; const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const C = (a) => ({ x: Math.floor((a.x + a.w / 2) / 32), y: Math.floor((a.y + a.h / 2) / 32) });
  const wrapD = (d, n) => { d = ((d % n) + n) % n; return d > n / 2 ? d - n : d; };
  const wx = x => ((x % COLS) + COLS) % COLS, wy = y => ((y % ROWS) + ROWS) % ROWS;
  const solid = (x, y) => geometryAt(wx(x), wy(y)) === "solid";
  const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];
  // BFS from a cell over open cells (wrap both axes); blocked(x,y) extra; returns {dist map, first-step map}
  function bfs(from, blocked) {
    const dist = new Map(), first = new Map(), q = [[from.x, from.y]]; const key = (x, y) => x + "," + y;
    dist.set(key(from.x, from.y), 0);
    for (let i = 0; i < q.length; i++) { const [x, y] = q[i]; const d = dist.get(key(x, y));
      for (const [dx, dy] of DIRS) { const nx = wx(x + dx), ny = wy(y + dy), k = key(nx, ny);
        if (dist.has(k) || solid(nx, ny) || (blocked && blocked(nx, ny))) continue;
        dist.set(k, d + 1); first.set(k, i === 0 ? [dx, dy] : first.get(key(x, y))); q.push([nx, ny]); } }
    return { dist, first, key };
  }
  // steer toward the centre of the neighbouring cell (dx,dy cells away); fix the cross axis first so we do not clip hedge corners
  function steer(dx, dy) {
    const p = P(), c = C(p); release();
    const cx = c.x * 32 + 16, cy = c.y * 32 + 16, hx = p.x + p.w / 2, hy = p.y + p.h / 2;
    if (dx !== 0) { if (Math.abs(cy - hy) > 4) K(cy > hy ? "ArrowDown" : "ArrowUp", true); else K(dx > 0 ? "ArrowRight" : "ArrowLeft", true); }
    else if (dy !== 0) { if (Math.abs(cx - hx) > 4) K(cx > hx ? "ArrowRight" : "ArrowLeft", true); else K(dy > 0 ? "ArrowDown" : "ArrowUp", true); }
  }
  const coins = () => actors.filter(a => { const d = actorDefs[a.defId]; return d && d.temperament === "collectible" && a.defId === "colCoin" && !a.destroyed; });
  const dangerRadius = 2;
  // one decision per tick
  const strategies = {
    idle: () => release(),
    holdRight: () => { release(); K("ArrowRight", true); },
    holdDiag: () => { release(); K("ArrowRight", true); K("ArrowDown", true); },
    random: (st) => { if (st.t % 30 === 0) { release(); const r = Math.floor(rnd() * 5); if (r < 4) K(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"][r], true); } },
    greedy: () => path(false),
    smart: () => path(true),
    smart2: (st) => path2(st),
  };
  function path(avoid) {
    const p = P(), me = C(p), cs = coins(); if (!cs.length) { release(); return; }
    const m = by("chaser"), mc = m ? C(m) : null;
    const near = (x, y) => mc && Math.abs(wrapD(x - mc.x, COLS)) <= dangerRadius && Math.abs(wrapD(y - mc.y, ROWS)) <= dangerRadius;
    let r = bfs(me, avoid ? near : null), best = null;
    for (const c of cs) { const cc = C(c), d = r.dist.get(r.key(cc.x, cc.y)); if (d != null && (best == null || d < best.d)) best = { d, cc }; }
    if (!best && avoid) { // every coin is behind the chaser's zone: step to the neighbour that is farthest from it
      let bd = -1, bs = null; for (const [dx, dy] of DIRS) { const nx = wx(me.x + dx), ny = wy(me.y + dy); if (solid(nx, ny)) continue;
        const d = Math.hypot(wrapD(nx - mc.x, COLS), wrapD(ny - mc.y, ROWS)); if (d > bd) { bd = d; bs = [dx, dy]; } }
      if (bs) steer(bs[0], bs[1]); return; }
    if (!best) { r = bfs(me, null); for (const c of cs) { const cc = C(c), d = r.dist.get(r.key(cc.x, cc.y)); if (d != null && (best == null || d < best.d)) best = { d, cc }; } }
    if (!best) { release(); return; }
    if (best.d === 0) { const t = best.cc; const hx = p.x + p.w / 2, hy = p.y + p.h / 2; release(); const ex = t.x * 32 + 16 - hx, ey = t.y * 32 + 16 - hy; if (Math.abs(ex) > 3) K(ex > 0 ? "ArrowRight" : "ArrowLeft", true); if (Math.abs(ey) > 3) K(ey > 0 ? "ArrowDown" : "ArrowUp", true); return; }
    const f = r.first.get(r.key(best.cc.x, best.cc.y)); steer(f[0], f[1]);
  }
  // smart2: time-aware. A cell is usable if the hero gets there clearly before the chaser's straight-line run (no seam, it ignores them);
  // keeps its target for half a second so it does not dither; falls back to the neighbour farthest from the chaser.
  function path2(st) {
    const p = P(), me = C(p), cs = coins(); if (!cs.length) { release(); return; }
    if (st.lastN !== cs.length) { st.lastN = cs.length; st.stale = 0; } else st.stale = (st.stale || 0) + 1;
    const m = by("chaser"), mx = m.x + m.w / 2, my = m.y + m.h / 2;
    const safe = (x, y, hd) => { const d = Math.hypot(x * 32 + 16 - mx, y * 32 + 16 - my); return d / 160 > (hd * 32) / 220 + Math.max(CFG.floor, CFG.m0 - CFG.slope * (st.stale || 0) / 60) || d > 7 * 32; };
    const dist0 = bfs(me, null);
    const blocked = (x, y) => { const hd = dist0.dist.get(dist0.key(x, y)); return hd == null ? true : !safe(x, y, hd); };
    const r = bfs(me, blocked); let best = null;
    const want = st.target && cs.find(c => c.id === st.target) && st.t - st.targetT < 30 ? cs.find(c => c.id === st.target) : null;
    const list = want ? [want] : cs;
    for (const c of list) { const cc = C(c), d = r.dist.get(r.key(cc.x, cc.y)); if (d != null && (best == null || d < best.d)) best = { d, cc, c }; }
    if (!best && want) { st.target = null; for (const c of cs) { const cc = C(c), d = r.dist.get(r.key(cc.x, cc.y)); if (d != null && (best == null || d < best.d)) best = { d, cc, c }; } }
    if (best && !want) { st.target = best.c.id; st.targetT = st.t; }
    if (!best) { // flee: neighbour (or two steps) maximising straight-line distance, preferring open cells
      let bd = -1, bs = null; for (const [dx, dy] of DIRS) { const nx = wx(me.x + dx), ny = wy(me.y + dy); if (solid(nx, ny)) continue;
        const d = Math.hypot(nx * 32 + 16 - mx, ny * 32 + 16 - my); if (d > bd) { bd = d; bs = [dx, dy]; } }
      if (bs) steer(bs[0], bs[1]); else release(); return; }
    if (best.d === 0) { const t = best.cc; const hx = p.x + p.w / 2, hy = p.y + p.h / 2; release(); const ex = t.x * 32 + 16 - hx, ey = t.y * 32 + 16 - hy; if (Math.abs(ex) > 3) K(ex > 0 ? "ArrowRight" : "ArrowLeft", true); if (Math.abs(ey) > 3) K(ey > 0 ? "ArrowDown" : "ArrowUp", true); return; }
    const f = r.first.get(r.key(best.cc.x, best.cc.y)); steer(f[0], f[1]);
  }
  function frameStep() {
    if (roomTransition) { advanceGameClock(dt); if (gameNow() - roomTransition.startedAt >= ROOM_TRANSITION_MS) roomTransition = null; return; }
    if (playSessionEnded) return;
    if (playReadyUntil && gameNow() < playReadyUntil) { advanceGameClock(dt); return; }
    tick(dt);
  }
  function setup(s) {
    seed = s * 7919 + 13; Math.random = rnd;
    const g = SAMPLE_GAMES.find(g => g.id === "mousecops-garden");
    loadExampleGame(g.builder, g.name, { skipConfirm: true });
    enterPlayMode(); release();
  }
  window.__runBot = (strategy, s, maxSec) => {
    setup(s); const st = { t: 0 }; const fn = strategies[strategy];
    const out = { strategy, seed: s, win: false, over: false, catches: 0, firstCatch: null, firstCatchAfterMove: null, coinsMax: 0, mStuckSec: 0, mStuckEpisodes: 0, heroStuckSec: 0, noProgressSec: 0, offBoard: 0, sec: 0 };
    let lastLives = lives, simT = 0, lastCoinT = 0, lastCoins = coins().length, ready0 = null;
    const mH = [], pH = []; let mStuckOpen = false, heroStuckOpen = 0;
    for (let f = 0; f < FPS * maxSec && !playSessionEnded; f++) {
      const inReady = playReadyUntil && gameNow() < playReadyUntil;
      if (!inReady && !roomTransition) { fn(st); st.t++; }
      frameStep();
      if (!inReady) simT += dt;
      const p = P(), m = by("chaser");
      if (window.__trace && f % 15 === 0) window.__trace.push([+simT.toFixed(1), (p.x/32).toFixed(1), (p.y/32).toFixed(1), (m.x/32).toFixed(1), (m.y/32).toFixed(1), Object.keys(keys).filter(k=>keys[k]&&k.startsWith('Arrow')).join('')]);
      if (lives < lastLives) { out.catches += lives < lastLives ? lastLives - lives : 0; if (out.firstCatch == null) out.firstCatch = +simT.toFixed(2); lastLives = lives; mH.length = 0; pH.length = 0; }
      const nc = coins().length; if (nc < lastCoins) { lastCoinT = simT; lastCoins = nc; } if (nc > lastCoins) lastCoins = nc; // coins return after a catch
      out.coinsMax = Math.max(out.coinsMax, 16 - nc);
      if (p.x < -40 || p.x > COLS * 32 + 40 || p.y < -40 || p.y > ROWS * 32 + 40 || !isFinite(p.x)) out.offBoard++;
      // windows of 3 s
      if (!inReady && f % 6 === 0) {
        mH.push([m.x, m.y]); pH.push([p.x, p.y]); if (mH.length > 30) { mH.shift(); pH.shift(); }
        if (mH.length === 30) {
          const md = Math.hypot(mH[29][0] - mH[0][0], mH[29][1] - mH[0][1]), pd = Math.hypot(pH[29][0] - pH[0][0], pH[29][1] - pH[0][1]);
          const dist = Math.hypot(wrapD((m.x - p.x) / 32, COLS), wrapD((m.y - p.y) / 32, ROWS));
          const stuck = md < 8 && dist > 2.5; // chaser standing still while the hero is not touching it
          if (stuck) { out.mStuckSec += 0.1; if (!mStuckOpen) { out.mStuckEpisodes++; mStuckOpen = true; } } else mStuckOpen = false;
          const wantsMove = ["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].some(k => keys[k]);
          if (wantsMove && pd < 6) { out.heroStuckSec += 0.1; } 
        }
      }
    }
    out.win = playSessionEnded === "win"; out.over = playSessionEnded === "lose"; out.sec = +simT.toFixed(1); out.lives = lives;
    out.noProgressSec = +(simT - lastCoinT).toFixed(1);
    out.left = coins().map(c => [Math.floor(c.x / 32), Math.floor(c.y / 32)]); { const p = P(), m = by('chaser'); out.end = { hero: [+(p.x/32).toFixed(1), +(p.y/32).toFixed(1)], mouse: [+(m.x/32).toFixed(1), +(m.y/32).toFixed(1)] }; }
    return out;
  };
  // ---------- wrap checks ----------
  function soloRoom(s, keep) { setup(s); playReadyUntil = null; for (let i = actors.length - 1; i >= 0; i--) { const a = actors[i]; const d = actorDefs[a.defId]; if (!keep(a, d)) actors.splice(i, 1); } }
  const put = (a, cx, cy) => { a.x = cx * 32 + 5; a.y = cy * 32 + 5; a.spawnX = a.x; a.spawnY = a.y; a.vx = a.vy = 0; };
  function run(secs, each) { for (let f = 0; f < FPS * secs && !playSessionEnded; f++) { frameStep(); if (each) each(f); } }
  window.__wrap = () => {
    const res = {};
    // hero walks through each seam on a clear lane with real key states and arrives on the far side, then goes back
    const lanes = [["left", 0, 1, "ArrowLeft", p => p.x > 700], ["right", 23, 1, "ArrowRight", p => p.x < 60], ["up", 1, 0, "ArrowUp", p => p.y > 520], ["down", 1, 17, "ArrowDown", p => p.y < 60]];
    for (const [name, cx, cy, key, ok] of lanes) {
      soloRoom(5, (a, d) => a.isPlayer); const p = P(); put(p, cx, cy); release(); run(0.3); K(key, true);
      let crossed = false, maxJump = 0, last = null, stuckFrames = 0;
      run(4, () => { if (ok(p)) crossed = true; if (last) { const j = Math.max(Math.abs(p.x - last[0]), Math.abs(p.y - last[1])); if (j < 700 && j > maxJump) maxJump = j; } last = [p.x, p.y]; });
      release(); res["hero_" + name] = { crossed, maxSmoothStep: +maxJump.toFixed(1), x: +p.x.toFixed(0), y: +p.y.toFixed(0) };
    }
    // chaser and fleer: launched at a seam on an open lane by momentum (the chaser chases the hero placed on the far lane end)
    for (const kind of ["chaser", "fleer"]) for (const [name, cx, cy, vx, vy] of [["left", 0, 1, -150, 0], ["right", 23, 1, 150, 0], ["up", 1, 0, 0, -150], ["down", 1, 17, 0, 150]]) {
      soloRoom(6, (a, d) => a.isPlayer || (d && d.temperament === kind)); const p = P(), m = by(kind); put(p, 7, 7); put(m, cx, cy);
      // keep the hero far away along the lane so the chaser keeps pushing toward the seam only by momentum; fleer flees from the hero
      p.x = (cx === 0 ? 20 : cx === 23 ? 3 : 12) * 32; p.y = (cy === 1 && vx !== 0 ? 1 : cy) * 32 + 5; if (vy) { p.x = 13 * 32 + 5; p.y = (cy === 0 ? 9 : 8) * 32 + 5; }
      m.vx = vx; m.vy = vy; m.bouncyCooldown = 400; m.displacedCooldown = 600; let crossed = false, lx = m.x, ly = m.y;
      let after = null; run(6, f => { if (f < 30) { m.vx = vx; m.vy = vy; m.bouncyCooldown = 400; m.displacedCooldown = 600; } if (Math.abs(m.x - lx) > 500 || Math.abs(m.y - ly) > 400) { crossed = true; after = [m.x, m.y, f]; } lx = m.x; ly = m.y; });
      const moved = after ? Math.hypot(m.x - after[0], m.y - after[1]) : 0;
      res[kind + "_" + name] = { crossed, movedAfterCrossing: +moved.toFixed(0), x: +m.x.toFixed(0), y: +m.y.toFixed(0), inBounds: m.x > -40 && m.x < COLS * 32 + 40 && m.y > -40 && m.y < ROWS * 32 + 40 };
    }
    // every actor in every corner cell: none may end stuck out of bounds or frozen for good
    for (const kind of ["player", "chaser", "fleer"]) for (const [cx, cy] of [[0,0],[23,0],[0,17],[23,17]]) {
      soloRoom(7, (a, d) => a.isPlayer || (d && d.temperament === (kind === "player" ? "x" : kind)));
      const me = kind === "player" ? P() : by(kind), other = kind === "player" ? null : P();
      put(me, cx, cy); if (other) put(other, 12, 8);
      let off = 0; if (kind === "player") release();
      const trail = []; run(8, f => { if (f % 30 === 0) trail.push([me.x, me.y]); if (me.x < -40 || me.x > COLS * 32 + 40 || me.y < -40 || me.y > ROWS * 32 + 40 || !isFinite(me.x)) off++; });
      if (kind === "player") { // from the corner also push toward the middle and make sure it can leave
        put(me, cx, cy); release(); K(cx === 0 ? "ArrowRight" : "ArrowLeft", true); K(cy === 0 ? "ArrowDown" : "ArrowUp", true); const x0 = me.x, y0 = me.y; run(1.5); release(); res["corner_player_" + cx + "_" + cy + "_left"] = Math.hypot(me.x - x0, me.y - y0) > 60; }
      res["corner_" + kind + "_" + cx + "_" + cy] = { off };
    }
    return res;
  };
})();`;
(async () => {
  const src = fs.readFileSync(html, "utf8"); if (!src.includes(anchor)) throw new Error("anchor missing");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gb-")), tmp = path.join(dir, "index.html");
  fs.writeFileSync(tmp, src.replace(anchor, anchor + "window.__e = f => eval('(' + f + ')');\n  " + DRIVER + "\n"));
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const errs = [];
  async function page() { const p = await b.newPage({ viewport: { width: 1366, height: 768 } }); p.on("pageerror", e => errs.push(String(e))); p.on("dialog", d => d.accept()); await p.addInitScript("window.requestAnimationFrame=()=>0;"); await p.goto("file://" + tmp + "#t"); await p.waitForTimeout(300); return p; }
  if (MODE !== "wrap") {
    const strategies = process.env.STRATS ? process.env.STRATS.split(",") : ["idle", "holdRight", "holdDiag", "random", "greedy", "smart", "smart2"];
    console.log("strategy   runs win%  over%  avgSec  firstCatch(avg/min)  catches/run  coins(max)  chaserStuck(runs,eps,sec)  heroStuckSec  noProgress>60s  offBoard");
    const all = {};
    for (const s of strategies) {
      const rs = [];
      for (let i = 1; i <= RUNS; i++) { const p = await page(); rs.push(await p.evaluate(([s, i]) => window.__runBot(s, i, 240), [s, i])); await p.close(); }
      all[s] = rs;
      const n = rs.length, w = rs.filter(r => r.win).length, o = rs.filter(r => r.over).length, fc = rs.filter(r => r.firstCatch != null).map(r => r.firstCatch);
      const avg = a => a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : "-";
      console.log(s.padEnd(10), String(n).padStart(4), (100 * w / n).toFixed(0).padStart(4), (100 * o / n).toFixed(0).padStart(5), String(avg(rs.map(r => r.sec))).padStart(7), (fc.length + "/" + n + " " + avg(fc) + "/" + (fc.length ? Math.min(...fc) : "-")).padStart(20), String(avg(rs.map(r => r.catches))).padStart(11), String(Math.max(...rs.map(r => r.coinsMax))).padStart(11),
        ("(" + rs.filter(r => r.mStuckEpisodes).length + "," + rs.reduce((a, r) => a + r.mStuckEpisodes, 0) + "," + rs.reduce((a, r) => a + r.mStuckSec, 0).toFixed(0) + ")").padStart(20), String(rs.reduce((a, r) => a + r.heroStuckSec, 0).toFixed(1)).padStart(12), String(rs.filter(r => !r.win && !r.over && r.noProgressSec > 60).length).padStart(14), String(rs.reduce((a, r) => a + r.offBoard, 0)).padStart(8));
    }
    fs.writeFileSync(path.join(os.tmpdir(), "garden-bot-results.json"), JSON.stringify(all));
  }
  if (MODE !== "bots") {
    const p = await page(); const w = await p.evaluate(() => window.__wrap());
    console.log(JSON.stringify(w, null, 1)); await p.close();
  }
  console.log("page errors:", errs.length, errs.slice(0, 3));
  await b.close();
})();
