// v2.54 Stage 0: report-only traces for what Surprise Me machines depend on. Not deployed. node tests/machines.stage0.js [only]
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/opt/node22/lib/node_modules/playwright");
const src = fs.readFileSync(process.env.HTML || path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = `window.__m = (() => {
  const ev = []; let T = 0;
  const wrap = (name, tag) => { const o = window[name]; if (typeof o !== "function") return; try { eval(name + " = function () { ev.push([T, tag || name]); return o.apply(this, arguments); }"); } catch (e) {} };
  wrap("triggerCannon", "cannonLoad"); wrap("fireLoadedCannon", "cannonFire"); wrap("detonateBombAt", "detonate"); wrap("squashNpc", "squash");
  let freeze = false; { const o = steeringAccelFor; steeringAccelFor = function () { return freeze ? { ax: 0, ay: 0 } : o.apply(this, arguments); }; }
  const def = k => ({ wanderer: () => defaultDefIdForKind("wanderer"), chaser: () => defaultDefIdForKind("chaser"), crate: () => PUSHABLE_DEF_ID, stone: () => LARGE_STONE_DEF_ID, bomb: () => CARRY_BOMB2_DEF_ID, ball: () => HAZARD_BALL_DEF_ID }[k]());
  function mk(kind, cx, cy) { const a = placeCarryableActor(def(kind), cx * TILE + 16, cy * TILE + 16); a.spawnX = a.x; a.spawnY = a.y; a.kind = kind; if (kind === "wanderer" || kind === "chaser") a.isNpc = true; return a; }
  function room(opt) {
    opt = opt || {};
    suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false;
    gravityEnabled = opt.gravity !== false; gravityDir = "down"; wrapHEnabled = false; wrapVEnabled = false;
    for (let x = 0; x < 24; x++) board[17][x] = "solid:none";
    actors.length = 0; ev.length = 0; T = 0; freeze = opt.freeze !== false;
    switchChannels = {}; clearTransientRuntimeState && clearTransientRuntimeState();
    for (const k in spawnerContents) delete spawnerContents[k];
    for (const k in spawnerRuntime) delete spawnerRuntime[k];
    for (const k in actorContactCooldown) delete actorContactCooldown[k];
  }
  const set = (x, y, g, m, c) => { board[y][x] = gameplayKey(g, m || "none"); if (c) colorBoard[y][x] = c; };
  const step = n => { for (let i = 0; i < n; i++) { tick(1 / 60); T++; } };
  const r = a => ({ x: +(a.x / TILE).toFixed(2), y: +(a.y / TILE).toFixed(2), vx: Math.round(a.vx), vy: Math.round(a.vy) });
  const col = a => Math.floor((a.x + a.w / 2) / TILE), row = a => Math.floor((a.y + a.h / 2) / TILE);
  return { ev, room, set, step, mk, mkdef: def, r, col, row, setFreeze: v => { freeze = v; }, T: () => T, evs: () => ev.slice(),
    // 1
    spawnCannon(content, gravity) {
      room({ gravity }); set(6, 4, "spawner-s"); set(6, 9, "cannon2-ne"); // spawner drops into cannon top
      const key = roomCellKey(currentRoomId, 6, 4); if (content !== "ball") spawnerContents[key] = def(content);
      spawnerRuntime[key] = { clock: SPAWN_INTERVAL_MS - 50, windUp: false, warnedBlocked: false };
      const out = { content, gravity: gravity !== false }; let spawnT = null, loadT = null, fireT = null, landT = null, A = null, peakY = 1e9, trace = [];
      for (let i = 0; i < 900; i++) {
        step(1);
        if (!A) { A = actors.find(a => a.spawnerKey); if (A) spawnT = i; }
        if (A) {
          if (loadT == null && A.cannonLoad) loadT = i; if (fireT == null && loadT != null && !A.cannonLoad) fireT = i;
          if (fireT != null) { peakY = Math.min(peakY, A.y); if (landT == null && i > fireT + 5 && A.grounded) { landT = i; break; } }
          if (i % 30 === 0) trace.push([i, Math.round(A.x), Math.round(A.y), Math.round(A.vx), Math.round(A.vy)]);
        }
      }
      out.frames = { spawn: spawnT, load: loadT, fire: fireT, land: landT };
      out.loadFrames = fireT != null ? fireT - loadT : null; out.cannonLoadMs = CANNON_LOAD_MS; out.cannonCooldownMs = CANNON_COOLDOWN_MS;
      if (A) { out.landCol = +( (A.x + A.w / 2) / TILE - 6 - 0.5).toFixed(2); out.peakAboveCannonTiles = +((9 * TILE - peakY) / TILE).toFixed(2); out.end = r(A); }
      out.trace = trace.slice(0, 6); return out;
    },
    // 2
    plateHold(kind, gravity) {
      room({ gravity: gravity !== false }); set(10, 16, "plate", "none", "red"); set(14, 16, "barrier-n", "none", "red"); set(14, 15, "barrier-n", "none", "red"); set(14, 14, "barrier-n", "none", "red");
      const A = mk(kind, 10, 15); if (A.isNpc) { freeze = false; A.spawnX = A.x; }
      const out = {}; step(1); const on0 = isChannelOn("red");
      step(180); out.after3s = { channelOn: isChannelOn("red"), gateBlocks: isCellBlocking(14, 16, { isPlayer: false }), onPlate: row(A) === 15 || row(A) === 16 && col(A) === 10, pos: r(A) };
      step(600); out.after13s = { channelOn: isChannelOn("red"), pos: r(A) }; out.initial = on0; return out;
    },
    petThroughGate() {
      room(); freeze = false; set(8, 16, "plate", "none", "red"); const C = mk("crate", 8, 15); // crate on plate holds red open
      for (const y of [16, 15, 14]) set(12, y, "barrier-n", "none", "red");
      const W = mk("wanderer", 10, 16); W.spawnX = W.x; step(30);
      const out = { gateOpen: isChannelOn("red") }; let passed = null, maxX = 0;
      // force the wanderer eastwards
      for (let i = 0; i < 600; i++) { W.vx = 120; W.bouncyCooldown = 10; step(1); maxX = Math.max(maxX, W.x); if (W.x > 13 * TILE && passed == null) { passed = i; break; } }
      out.pet = { passedFrame: passed, maxXTiles: +(maxX / TILE).toFixed(2) };
      // now park the pet in the gate cell and close the gate by moving the crate off the plate
      W.x = 12 * TILE + 5; W.y = 16 * TILE - W.h + 32 - 0.5; W.vx = 0; W.vy = 0; freeze = true; step(5);
      C.x = 3 * TILE; C.y = 16 * TILE; step(1); const closedNow = !isChannelOn("red");
      const trace = []; for (let i = 0; i < 90; i++) { step(1); if (i % 10 === 0) trace.push(r(W)); }
      out.closeOnPet = { closed: closedNow, trace: trace.slice(0, 5), end: r(W), insideGate: W.x + W.w > 12 * TILE && W.x < 13 * TILE, inSolid: overlappedCells(W).some(c => isCellBlocking(c.cx, c.cy, { isPlayer: false })) };
      return out;
    },
    plateFrozenPet() {
      room(); set(10, 16, "plate", "none", "red"); const W = mk("wanderer", 10, 15); freeze = true; step(120);
      const a = isChannelOn("red"); freeze = false; let off = null; for (let i = 0; i < 600; i++) { step(1); if (!isChannelOn("red")) { off = i; break; } }
      return { frozenPetHoldsPlate: a, unfrozenPetLeavesPlateAfterFrames: off };
    },
    resetState() {
      room(); set(10, 16, "plate", "none", "red"); set(14, 16, "barrier-n", "none", "red"); set(14, 15, "barrier-n", "none", "red");
      const C = mk("crate", 5, 16); step(5); const B = mk("bomb", 18, 16); step(5);
      C.x = 10 * TILE + 5; C.y = 15 * TILE; step(30); const out = { beforeReset: { channel: isChannelOn("red"), crate: r(C) } };
      document.getElementById("resetBtn").click(); const afterNow = { crate: r(C), channelSameTick: isChannelOn("red") }; step(2); afterNow.channelAfter2Ticks = isChannelOn("red"); out.afterReset = afterNow;
      // bomb: detonate a bomb actor in Build, then Reset
      const nb = actors.filter(a => a.kind === "bomb").length; detonateCarriedBombAt(currentRoomId, B.id); advanceGameClock(1); step(30);
      out.bomb = { before: nb, afterBlast: actors.filter(a => a.kind === "bomb").length };
      document.getElementById("resetBtn").click(); step(2); out.bomb.afterReset = actors.filter(a => a.kind === "bomb").length;
      // armed (lit) bomb actor: light fuse, Reset, does it still go off later?
      const B2 = actors.find(a => a.kind === "bomb"); if (B2) { startOrResumeBombFuse(B2); step(10); document.getElementById("resetBtn").click(); advanceGameClock(4); step(30); out.armedThenReset = { bombsLeft: actors.filter(a => a.kind === "bomb").length, fuseTimer: B2.fuseTimerId != null, armed: !!B2.fuseArmed }; }
      return out;
    },
    roomSwitch() {
      room(); set(10, 16, "plate", "none", "red"); set(14, 16, "barrier-n", "none", "red"); const C = mk("crate", 10, 15); step(30);
      const idA = currentRoomId; const out = { A_on: isChannelOn("red") }; duplicateRoom(); const idB = currentRoomId; step(5);
      out.B_hotChannel = isChannelOn("red"); out.B_crates = actors.filter(a => a.kind === "crate").length;
      activateRoom(idA); step(3); out.A_again = isChannelOn("red"); const Ca = actors.find(a => a.kind === "crate"); out.A_crateStillOnPlate = Ca ? r(Ca) : null;
      return out;
    },
    // 3
    tramp(kind, drop) {
      room(); set(10, 16, "trampoline"); const A = mk(kind, 10, 16 - drop - 1); A.x = 10 * TILE + (TILE - A.w) / 2; if (A.isNpc) { freeze = true; }
      A.y = (16 - drop) * TILE - A.h; A.vy = 0; A.spawnY = A.y; A.spawnX = A.x;
      let minY = 1e9, bounces = 0, prevVy = 0, firstVy = null, i = 0, apex1 = null;
      for (; i < 300; i++) { step(1); if (prevVy > 50 && A.vy < -50) { bounces++; if (firstVy == null) { firstVy = Math.round(A.vy); minY = A.y; } } prevVy = A.vy; if (bounces === 1) minY = Math.min(minY, A.y); if (bounces === 2 && apex1 == null) apex1 = minY; }
      return { kind, dropTiles: drop, bounces, launchVy: firstVy, firstBounceRiseTiles: apex1 != null ? +(((16 * TILE - A.h) - apex1) / TILE).toFixed(2) : null, restedAt: r(A), speedClampNote: A.isNpc ? "npc cap " + NPC_MAX_SPEED : "" };
    },
    // 4
    fanHeight(kind) {
      room(); set(10, 16, "fan-n"); const A = mk(kind, 10, 15); freeze = true; let minY = 1e9, ys = [];
      for (let i = 0; i < 600; i++) { step(1); minY = Math.min(minY, A.y); if (i >= 300) ys.push(A.y); }
      const mean = ys.reduce((s, v) => s + v, 0) / ys.length;
      return { kind, fanRow: 16, peakRowsAboveFan: +((16 * TILE - (minY + A.h)) / TILE).toFixed(2), hoverMeanRowsAboveFan: +((16 * TILE - (mean + A.h)) / TILE).toFixed(2), swing: +((Math.max(...ys) - Math.min(...ys))).toFixed(1), FAN_RANGE_TILES };
    },
    fanBelt(runs, variant) {
      let ok = 0; const rows = [];
      for (let n = 0; n < runs; n++) {
        room(); set(10, 16, "fan-n"); // chute col 10; open-air east wind at row 12..13 in col 10 pushes crate onto belt at (11..16, 14)
        for (let y = 11; y <= 14; y++) set(10, y, "none", "wind-e");
        for (let x = 11; x <= 15; x++) set(x, 14, "solid", "wind-e");
        for (let x = 11; x <= 15; x++) set(x, 12, "solid", "none"); // roof so it cannot overshoot
        const A = mk("crate", 10, 15); A.x += (n % 7 - 3) * 2; step(1);
        let landed = false, i = 0; for (; i < 900; i++) { step(1); if (A.grounded && col(A) >= 11 && row(A) === 13) { landed = true; break; } }
        if (landed) { ok++; } rows.push(landed ? i : -1);
      }
      return { runs, carriedOntoBelt: ok, frames: rows.slice(0, 8) };
    },
    // 5
    belts(runs) {
      let ok = 0, times = [], speeds = [];
      for (let n = 0; n < runs; n++) {
        room(); for (let x = 2; x <= 7; x++) set(x, 16, "solid", "wind-e"); for (let x = 8; x <= 13; x++) set(x, 16, "solid", "wind-e"); // seam at 7/8
        const A = mk("crate", 2, 15); A.x += (n % 5) * 3; let t7 = null, t9 = null;
        for (let i = 0; i < 900; i++) { step(1); if (t7 == null && col(A) >= 7) t7 = i; if (t9 == null && col(A) >= 9) { t9 = i; speeds.push(Math.round(A.vx)); } if (col(A) >= 13) { ok++; times.push(i); break; } }
      }
      return { runs, reachedEnd: ok, frames: times.slice(0, 5), vxAtSeam: speeds.slice(0, 5) };
    },
    beltStep(runs) { // belt end drops crate onto a lower belt one column further
      let ok = 0;
      for (let n = 0; n < runs; n++) {
        room(); for (let x = 2; x <= 6; x++) set(x, 12, "solid", "wind-e"); for (let x = 7; x <= 12; x++) set(x, 14, "solid", "wind-e");
        const A = mk("crate", 2, 11); A.x += (n % 5) * 3; let done = false;
        for (let i = 0; i < 900; i++) { step(1); if (row(A) === 13 && col(A) >= 11) { done = true; break; } }
        if (done) ok++;
      }
      return { runs, handedOff: ok };
    },
    // 6
    magnets(kind, gap, gravity) {
      room({ gravity }); const x0 = 4, x1 = x0 + gap; set(x0, 8, "magnet"); set(x1, 8, "magnet");
      const mid = (x0 + x1) / 2; const A = mk(kind, 0, 0); A.x = mid * TILE + 16 - A.w / 2; A.y = 8 * TILE + 16 - A.h / 2; A.x += 20; A.spawnX = A.x; A.spawnY = A.y; A.vx = 0; A.vy = 0;
      if (gravity === false) { for (let y = 0; y < 18; y++) { /* free roam, walls absent */ } }
      const xs = []; for (let i = 0; i < 600; i++) { step(1); xs.push((A.x + A.w / 2) / TILE); }
      const tail = xs.slice(300), mn = Math.min(...tail), mx = Math.max(...tail);
      let cross = 0; const c = (x0 + x1) / 2 + 0.5; for (let i = 1; i < xs.length; i++) if ((xs[i - 1] - c) * (xs[i] - c) < 0) cross++;
      return { kind, gapTiles: gap, gravity: gravity !== false, startX: +xs[0].toFixed(2), endX: +xs[599].toFixed(2), tailRange: +(mx - mn).toFixed(3), centreCrossings10s: cross, stuckAt: (Math.abs(xs[599] - (x0 + 0.5)) < 1.1 ? "left magnet" : Math.abs(xs[599] - (x1 + 0.5)) < 1.1 ? "right magnet" : "none"), held: !!(A.magnetHeld) };
    },
    magnetsCentred(kind, gap) {
      room({ gravity: false }); const x0 = 4, x1 = x0 + gap; set(x0, 8, "magnet"); set(x1, 8, "magnet");
      const A = mk(kind, 0, 0); A.x = ((x0 + x1) / 2 + 0.5) * TILE - A.w / 2; A.y = 8 * TILE + 16 - A.h / 2; A.spawnX = A.x; A.vx = 0; A.vy = 0; A.vx = 3;
      const xs = []; for (let i = 0; i < 600; i++) { step(1); xs.push(+((A.x + A.w / 2) / TILE).toFixed(2)); }
      return { kind, gap, nudge: "vx=3 px/s", every100: [0, 100, 200, 300, 400, 500, 599].map(i => xs[i]) };
    },
    // 7
    hole(kind, dist, gravity) {
      room({ gravity }); set(12, 8, "gravitywell"); const A = mk(kind, 12 - dist, 8); A.vx = 0; A.vy = 0; A.spawnX = A.x; let t = null;
      for (let i = 0; i < 900; i++) { step(1); if (A.destroyed || !actors.includes(A)) { t = i; break; } }
      return { kind, distTiles: dist, gravity: gravity !== false, capturedAtFrame: t, end: r(A) };
    },
    // 8
    blastStone(indestructible) {
      room(); // shaft: bomb at (9,15) on floor; support tile (10,14)? use stone on tile east of bomb
      for (let y = 9; y <= 16; y++) { set(8, y, "solid"); set(12, y, "solid"); }
      set(10, 14, "solid", indestructible ? "indestructible" : "none"); set(10, 16, "plate", "none", "green"); set(10, 13, "none"); // plate below support? support spans (10,14); plate at bottom (10,16)
      const B = mk("bomb", 9, 14); B.x = 9 * TILE + (TILE - B.w) / 2; // beside support tile on floor? place on solid (9,15)
      set(9, 15, "solid"); set(11, 14, "solid"); set(9, 14, "none");
      B.y = 14 * TILE + TILE - B.h; const S = mk("stone", 10, 13); S.x = 10 * TILE + (TILE - S.w) / 2; S.y = 13 * TILE + TILE - S.h;
      const C = mk("crate", 9, 0); C.x = B.x; C.y = 8 * TILE; step(5);
      const before = r(S); let det = null, plateOn = null, fell = null;
      for (let i = 0; i < 400; i++) { step(1); if (det == null && B.detonating) det = i; if (plateOn == null && isChannelOn("green")) plateOn = i; }
      return { indestructible: !!indestructible, stoneBefore: before, stoneAfter: r(S), bombDetonatedFrame: det, supportTile: board[14][10], greenPlateOn: plateOn, stoneOnPlateRow: row(S), crateAlive: actors.includes(C) };
    },
    // 9
    dropBomb(tiles) {
      room(); const B = mk("bomb", 12, 16); step(20); const C = mk("crate", 12, 16 - tiles - 1); C.x = B.x; C.y = (16 - tiles) * TILE - C.h - 1 - 0; C.vy = 0; C.spawnY = C.y;
      let t = null, hitV = null, pv = 0; for (let i = 0; i < 300; i++) { pv = C.vy; step(1); if (hitV == null && pv > 0 && C.vy < pv * 0.5) hitV = Math.round(pv); if (B.detonating) { t = i; break; } }
      return { tilesAbove: tiles, detonated: !!B.detonating, frame: t, impactVy: hitV };
    }
  };
})();`;
(async () => {
  const tmp = path.join(os.tmpdir(), "machines_stage0.html");
  if (!src.includes(anchor)) throw new Error("anchor missing");
  fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK + "\n"));
  const br = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await br.newPage(); const errs = []; page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept());
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto("file://" + tmp + "#t"); await page.waitForTimeout(500);
  const call = (fn, ...a) => page.evaluate(([f, args]) => window.__m[f](...args), [fn, a]);
  const only = process.argv[2]; const show = (n, v) => { if (!only || only === String(n)) console.log(n + " " + JSON.stringify(v)); };
  const run = async (n, fn, ...a) => { try { show(n + " " + fn + "(" + a.join(",") + ")", await call(fn, ...a)); } catch (e) { console.log(n, fn, "ERR", String(e).slice(0, 200)); } };
  for (const c of ["crate", "ball", "stone", "wanderer"]) await run(1, "spawnCannon", c);
  await run(1, "spawnCannon", "crate", false);
  for (const k of ["crate", "stone", "ball", "wanderer"]) await run(2, "plateHold", k);
  await run(2, "petThroughGate");
  for (const k of ["wanderer", "chaser", "crate", "ball", "stone"]) for (const d of [2, 5]) await run(3, "tramp", k, d);
  for (const k of ["crate", "ball", "stone", "wanderer"]) await run(4, "fanHeight", k);
  await run(4, "fanBelt", 20); await run(5, "belts", 20); await run(5, "beltStep", 20);
  for (const k of ["ball", "crate"]) for (const g of [6, 7, 8]) { await run(6, "magnets", k, g, false); await run(6, "magnets", k, g, true); }
  for (const k of ["crate", "ball"]) for (const g of [false, true]) await run(7, "hole", k, 5, g);
  await run(2, "plateFrozenPet"); await run(10, "resetState"); await run(10, "roomSwitch");
  await run(6, "magnetsCentred", "ball", 6); await run(6, "magnetsCentred", "crate", 7);
  await run(8, "blastStone", false); await run(8, "blastStone", true);
  for (const t of [1, 3, 5]) await run(9, "dropBomb", t);
  console.log("errors", JSON.stringify(errs.slice(0, 5)));
  await br.close();
})();
