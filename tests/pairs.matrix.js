// Stage 0 pair matrix for "When things meet" (throwaway, not deployed). Usage: node tests/pairs.matrix.js [out.json]
// Runs every (mover, target) pair of actor kinds in a temp, hooked copy of index.html (the repo file stays clean).
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/opt/node22/lib/node_modules/playwright");
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
if (!src.includes(anchor)) throw new Error("anchor missing");
const HOOK = `
window.__m = (() => {
  const ev = { sounds: {}, logs: [], recipes: [], det: 0, reflect: 0, squash: 0, reset: 0, shove: 0, catch: 0, hazard: 0 };
  window.__ev = ev;
  for (const k of Object.keys(sounds)) { const f = sounds[k]; sounds[k] = function () { ev.sounds[k] = (ev.sounds[k] || 0) + 1; return f.apply(this, arguments); }; }
  { const o = log; log = function (m) { ev.logs.push(String(m)); return o.apply(this, arguments); }; }
  { const o = playRecipe; playRecipe = function (e, n) { ev.recipes.push(n); return o.apply(this, arguments); }; }
  { const o = detonateCarriedBombAt; detonateCarriedBombAt = function () { ev.det++; return o.apply(this, arguments); }; }
  { const o = detonateBombAt; detonateBombAt = function () { ev.det++; return o.apply(this, arguments); }; }
  { const o = reflectActorsApart; reflectActorsApart = function () { ev.reflect++; return o.apply(this, arguments); }; }
  { const o = triggerNpcLethalReset; triggerNpcLethalReset = function () { ev.reset++; return o.apply(this, arguments); }; }
  { const o = triggerNpcCatch; triggerNpcCatch = function () { ev.catch++; return o.apply(this, arguments); }; }
  { const o = triggerHazard; triggerHazard = function () { const r = o.apply(this, arguments); if (r) ev.hazard++; return r; }; }
  { const o = triggerCannon; triggerCannon = function () { ev.cannon = (ev.cannon || 0) + 1; return o.apply(this, arguments); }; }
  let freeze = true;
  { const o = steeringAccelFor; steeringAccelFor = function () { return freeze ? { ax: 0, ay: 0 } : o.apply(this, arguments); }; }
  const KINDS = {
    player: null, wanderer: () => defaultDefIdForKind("wanderer"), chaser: () => defaultDefIdForKind("chaser"),
    fleer: () => defaultDefIdForKind("fleer"), stationary: () => defaultDefIdForKind("stationary"),
    hazardball: () => HAZARD_BALL_DEF_ID, crate: () => PUSHABLE_DEF_ID, stone: () => LARGE_STONE_DEF_ID,
    bomb: () => CARRY_BOMB2_DEF_ID, trampoline: () => CARRY_TRAMPOLINE_DEF_ID, magnet: () => CARRY_MAGNET_DEF_ID,
    cannon: () => CARRY_CANNON2_DEF_ID, collectible: () => "colGem", platform: () => MOVING_PLATFORM_DEF_ID
  };
  function mk(kind, px, py) {
    let a;
    if (kind === "player") {
      selectedActorDefId = playerDefId; placeNewActor(px, py); a = actors.find(x => x.isPlayer);
    } else {
      const defId = KINDS[kind]();
      if (!actorDefs[defId]) throw new Error("no def for " + kind);
      a = placeCarryableActor(defId, px, py, kind === "cannon" ? "ne" : null);
      a.spawnX = a.x; a.spawnY = a.y;
    }
    a.kind = kind; return a;
  }
  function room(gravity) {
    suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false;
    gravityEnabled = gravity; gravityDir = "down";
    for (let x = 0; x < 24; x++) { board[17][x] = "solid:none"; }
    if (!gravity) { for (let x = 0; x < 24; x++) board[0][x] = "solid:none"; }
    for (let y = 0; y < 18; y++) { board[y][0] = "solid:none"; board[y][23] = "solid:none"; }
    actors.length = 0; for (const k in ev.sounds) delete ev.sounds[k];
    ev.logs.length = 0; ev.recipes.length = 0; ev.det = ev.reflect = ev.reset = ev.catch = ev.hazard = 0; ev.cannon = 0;
    for (const k in actorContactCooldown) delete actorContactCooldown[k];
  }
  const snapA = a => a ? { x: +a.x.toFixed(1), y: +a.y.toFixed(1), vx: +a.vx.toFixed(1), vy: +a.vy.toFixed(1) } : null;
  function run(mover, target, mode, gravity) {
    room(gravity);
    // target rests on the floor (gravity) or floats (no gravity); mover set up per mode
    const floorY = 17 * TILE;
    const cx = 12 * TILE + 16;
    const ty = gravity ? floorY - ACTOR_SIZE / 2 - 1 : 9 * TILE + 16;
    const T = mk(target, cx, ty), M = mk(mover, 0, 0);
    if (mover === "player") { /* ok */ }
    // settle the target
    if (target !== "platform") T.spawnX = T.x, T.spawnY = T.y;
    let M0;
    const sizeM = ACTOR_SIZE;
    if (mode === "rest") {
      // mover resting directly beside the target on the floor
      M.x = T.x - sizeM - 0.5; M.y = T.y; M.vx = 0; M.vy = 0;
    } else if (mode === "slow" || mode === "fast") {
      const sp = mode === "slow" ? 60 : 400;
      if (!gravity || mode === "slow") {
        // horizontal hit from the left
        M.x = T.x - sizeM + (mode === 'slow' ? 1 : -6); M.y = T.y; M.vx = sp; M.vy = 0;
        if (mover !== "player") M.bouncyCooldown = 400; // exempt the NPC speed cap, as a launch/throw would be
      } else {
        // fast: dropped about 3 tiles onto the target from above, plus 400px/s of speed along the drop
        M.x = T.x; M.y = T.y - ACTOR_SIZE - 3 * TILE; M.vx = 0; M.vy = sp;
        if (mover !== "player") M.bouncyCooldown = 400;
      }
    }
    M0 = snapA(M); const T0 = snapA(T);
    const idsBefore = actors.map(a => a.id);
    const traceM = [], traceT = [];
    let first = null;
    for (let f = 0; f < 90; f++) {
      tick(1 / 60);
      if (f < 12 || f % 15 === 0) { traceM.push(snapA(actors.find(a => a === M))); traceT.push(snapA(actors.find(a => a === T))); }
    }
    const removedAfter = [M, T].map(a => !actors.includes(a));
    // allow popVanish removals to finish (they use the game clock)
    advanceGameClock && advanceGameClock(600);
    const removed = [M, T].map(a => !actors.includes(a));
    // peak velocity after impact, from the trace
    const peak = tr => tr.filter(Boolean).reduce((m, s) => Math.max(m, Math.abs(s.vx) + Math.abs(s.vy)), 0);
    const dispT = T ? Math.hypot(T.x - T0.x, T.y - T0.y) : 0;
    return {
      before: { M: M0, T: T0 }, after: { M: snapA(M), T: snapA(T) },
      peakM: +peak(traceM).toFixed(0), peakT: +peak(traceT).toFixed(0), dispT: +dispT.toFixed(1),
      sounds: Object.assign({}, ev.sounds), logs: [...new Set(ev.logs)].slice(0, 4), recipes: [...new Set(ev.recipes)],
      reflect: ev.reflect, detonated: ev.det, resets: ev.reset, catches: ev.catch, hazard: ev.hazard, cannon: ev.cannon || 0,
      removed: { mover: removed[0], target: removed[1] }
    };
  }

  // ---- targeted probes for the Stage 0 questions ----
  function stepN(n) { for (let i = 0; i < n; i++) tick(1 / 60); }
  function snapEv() { return { sounds: Object.assign({}, ev.sounds), logs: [...new Set(ev.logs)].slice(0, 3), recipes: [...new Set(ev.recipes)], det: ev.det, reflect: ev.reflect, reset: ev.reset, cannon: ev.cannon || 0 }; }
  // Q1: things hitting a bomb ACTOR vs a bomb TILE. dropTiles = drop height; speed = horizontal speed (gravity off).
  function bombHit(mover, how, amount) {
    room(how === "drop"); freeze = (mover === "player") ? true : false; freeze = true;
    const cx = 12 * TILE + 16;
    const B = mk("bomb", cx, how === "drop" ? 17 * TILE - ACTOR_SIZE / 2 - 1 : 9 * TILE + 16);
    stepN(5);
    const M = mk(mover, 0, 0);
    if (how === "drop") { M.x = B.x; M.y = B.y - ACTOR_SIZE - amount * TILE; M.vx = 0; M.vy = 0; }
    else { M.x = B.x - ACTOR_SIZE + 1; M.y = B.y; M.vx = amount; M.vy = 0; }
    if (mover !== "player") M.bouncyCooldown = 400;
    for (const k in ev.sounds) delete ev.sounds[k]; ev.det = 0; ev.reflect = 0;
    let maxSp = 0;
    for (let f = 0; f < 120; f++) { tick(1 / 60); maxSp = Math.max(maxSp, Math.abs(M.vx) + Math.abs(M.vy)); }
    const r = snapEv(); r.bombStillThere = actors.includes(B); r.bombArmed = B.fuseTimerId != null || B.fuseArmed; r.maxSpeedM = Math.round(maxSp);
    return r;
  }
  // same but a bomb TILE (gravity off so it stays a tile)
  function bombTileHit(mover, speed) {
    room(false); freeze = true;
    board[9][12] = "bomb2:none";
    const M = mk(mover, 0, 0); M.x = 12 * TILE - ACTOR_SIZE - 1; M.y = 9 * TILE + (TILE - ACTOR_SIZE) / 2; M.vx = speed; M.vy = 0;
    if (mover !== "player") M.bouncyCooldown = 400;
    ev.det = 0;
    stepN(60);
    return { det: ev.det, tileLeft: board[9][12], armed: Object.keys(bombArmed).length };
  }
  // Q2: can an NPC push a crate / stone / bomb / magnet / trampoline? Steering ON, player on the far side.
  function npcPush(npc, obj, gravity) {
    room(gravity); freeze = false;
    const P = mk("player", 20 * TILE, gravity ? 17 * TILE - ACTOR_SIZE / 2 - 1 : 9 * TILE + 16);
    const y = gravity ? 17 * TILE - ACTOR_SIZE / 2 - 1 : 9 * TILE + 16;
    const N = mk(npc, 4 * TILE, y), O = mk(obj, 7 * TILE, y);
    P.hazardCooldown = 1e9; // keep the (lethal) NPC from ending the probe
    const x0 = O.x;
    stepN(180);
    freeze = true;
    return { objMoved: +(O.x - x0).toFixed(1), npcX: +N.x.toFixed(1), objX: +O.x.toFixed(1), passedThrough: N.x > O.x + O.w / 2 };
  }
  // Q3 is the matrix fast-drop row (stone/crate onto NPC/collectible/hazard ball); extra detail:
  function dropOn(mover, target, tiles) {
    room(true); freeze = true;
    const T = mk(target, 12 * TILE + 16, 17 * TILE - ACTOR_SIZE / 2 - 1); stepN(5);
    const M = mk(mover, 0, 0); M.x = T.x; M.y = T.y - ACTOR_SIZE - tiles * TILE; M.vx = 0; M.vy = 0;
    for (const k in ev.sounds) delete ev.sounds[k]; ev.reflect = 0; ev.reset = 0;
    stepN(120);
    const r = snapEv();
    r.overlap = Math.round(Math.max(0, Math.min(M.y + M.h, T.y + T.h) - Math.max(M.y, T.y)) * 10) / 10;
    r.mAfter = { x: +M.x.toFixed(1), y: +M.y.toFixed(1) }; r.tAfter = { x: +T.x.toFixed(1), y: +T.y.toFixed(1) };
    r.targetThere = actors.includes(T);
    return r;
  }
  // Q4: a cannon-launched object hits each kind. Cannon tile on the floor; shooter drops onto it; target sits where the shot lands.
  function cannonShot(shooter, target) {
    const build = (withTarget, tx) => {
      room(true); freeze = true;
      board[16][3] = "cannon2-ne:none";
      const S = mk(shooter, 3 * TILE + 16, 10 * TILE); S.x = 3 * TILE + (TILE - ACTOR_SIZE) / 2; S.y = (shooter === "bomb" ? 13 : 8) * TILE;
      let T = null;
      if (withTarget) { T = mk(target, tx, 17 * TILE - ACTOR_SIZE / 2 - 1); }
      return { S, T };
    };
    let { S } = build(false);
    let landX = null, fired = false;
    for (let f = 0; f < 300; f++) { tick(1 / 60); if (S.ballistic) fired = true; if (fired && !S.ballistic) { landX = S.x + S.w / 2; break; } }
    if (!fired || landX == null) return { fired, error: "no landing" };
    const b = build(true, landX);
    for (const k in ev.sounds) delete ev.sounds[k]; ev.reflect = 0; ev.reset = 0; ev.det = 0;
    let hitF = -1; const T = b.T, S2 = b.S; const t0 = { x: T.x, y: T.y };
    for (let f = 0; f < 300; f++) { tick(1 / 60); }
    const r = snapEv(); r.landX = Math.round(landX); r.targetMoved = +Math.hypot(T.x - t0.x, T.y - t0.y).toFixed(1);
    r.targetThere = actors.includes(T); r.shooterThere = actors.includes(S2);
    return r;
  }
  // Q5: a 40-actor pile. Counts reflectActorsApart calls per second and measures per-frame CPU time (tick, and tick + render).
  function pile(n, seconds, mixed) {
    room(true); freeze = false;
    const ks = mixed ? ["crate", "crate", "wanderer", "bomb", "hazardball"] : ["crate"];
    for (let i = 0; i < n; i++) { const a = mk(ks[i % ks.length], (2 + (i % 18)) * TILE + 16, (4 + Math.floor(i / 18) * 2) * TILE); a.vx = (i % 5) * 40 - 80; }
    mk("player", 21 * TILE, 17 * TILE - 20);
    const per = []; let calls0 = ev.reflect; const times = [], rtimes = [];
    for (let s = 0; s < seconds; s++) {
      calls0 = ev.reflect;
      for (let f = 0; f < 60; f++) {
        const t = performance.now(); tick(1 / 60); const t1 = performance.now();
        try { renderGame(); } catch (e) {}
        const t2 = performance.now(); times.push(t1 - t); rtimes.push(t2 - t1);
      }
      per.push(ev.reflect - calls0);
    }
    const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
    const p95 = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length * 0.95)];
    let twitch = 0; // actors still moving at the end
    const still = actors.filter(a => !a.isPlayer && Math.hypot(a.vx, a.vy) > 20).length;
    return { n: actors.length, reflectPerSec: per, tickMsAvg: +avg(times).toFixed(3), tickMsP95: +p95(times).toFixed(3), renderMsAvg: +avg(rtimes).toFixed(3), movingAtEnd: still, boing: ev.sounds.boing || 0 };
  }
  return { KINDS: Object.keys(KINDS), run, bombHit, bombTileHit, npcPush, dropOn, cannonShot, pile };
})();
`;
const tmp = path.join(os.tmpdir(), "pairs_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK));
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage();
  const errors = []; page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept());
  await page.goto("file://" + tmp + "#t"); await page.waitForFunction(() => window.__m);
  const kinds = await page.evaluate(() => __m.KINDS);
  if (process.argv[3] === "probe") {
    const R = {};
    for (const mv of ["crate", "stone", "hazardball", "wanderer", "chaser", "player"]) {
      R["bombActor.drop." + mv] = {};
      for (const t of [1, 3, 5]) R["bombActor.drop." + mv]["t" + t] = await page.evaluate(([m, a]) => __m.bombHit(m, "drop", a), [mv, t]);
      R["bombActor.side." + mv] = {};
      for (const sp of [60, 160, 400]) R["bombActor.side." + mv]["s" + sp] = await page.evaluate(([m, a]) => __m.bombHit(m, "side", a), [mv, sp]);
      R["bombTile.side." + mv] = {};
      for (const sp of [60, 160, 400]) R["bombTile.side." + mv]["s" + sp] = await page.evaluate(([m, a]) => __m.bombTileHit(m, a), [mv, sp]);
    }
    R.npcPush = {};
    for (const n of ["wanderer", "chaser", "fleer"]) for (const o of ["crate", "stone", "bomb", "magnet", "trampoline", "cannon", "hazardball", "collectible"]) for (const g of [true, false]) R.npcPush[[n, o, g ? "G" : "F"].join("|")] = await page.evaluate(([a, b, c]) => __m.npcPush(a, b, c), [n, o, g]);
    R.dropOn = {};
    for (const m of ["crate", "stone"]) for (const t of ["wanderer", "chaser", "fleer", "stationary", "collectible", "hazardball", "bomb", "crate", "player"]) for (const h of [1, 3]) R.dropOn[[m, t, h].join("|")] = await page.evaluate(([a, b, c]) => __m.dropOn(a, b, c), [m, t, h]);
    R.cannon = {};
    for (const sh of ["crate", "stone", "bomb", "hazardball", "player", "wanderer"]) for (const t of ["wanderer", "chaser", "fleer", "stationary", "collectible", "hazardball", "bomb", "crate", "stone", "player", "trampoline"]) R.cannon[sh + "|" + t] = await page.evaluate(([a, b]) => __m.cannonShot(a, b), [sh, t]);
    R.pile = {};
    R.pile.crates40 = await page.evaluate(() => __m.pile(40, 20, false));
    R.pile.mixed40 = await page.evaluate(() => __m.pile(40, 20, true));
    fs.writeFileSync(process.argv[2], JSON.stringify(R, null, 1));
    console.log("probe done; errors:", errors.slice(0, 5));
    await browser.close(); return;
  }
  const out = {};
  for (const grav of [true, false]) for (const mover of kinds) for (const target of kinds) {
    if (mover === "player" && target === "player") continue;
    for (const mode of ["rest", "slow", "fast"]) {
      const key = [grav ? "G" : "F", mover, target, mode].join("|");
      try { out[key] = await page.evaluate(([m, t, md, g]) => __m.run(m, t, md, g), [mover, target, mode, grav]); }
      catch (e) { out[key] = { error: String(e).slice(0, 200) }; }
    }
  }
  fs.writeFileSync(process.argv[2] || path.join(__dirname, "..", "pairs.matrix.json"), JSON.stringify(out, null, 1));
  console.log("cells:", Object.keys(out).length, "errors:", errors.slice(0, 5), "cellErrors:", Object.values(out).filter(v => v.error).length);
  await browser.close();
})();
