// Hopper (Gloop) long-run + behavior tests. node tests/hopper.test.js [seconds=60]
const fs = require("fs"), path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/opt/node22/lib/node_modules/playwright");
const A = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const out = "/tmp/hopper_hooked.html";
fs.writeFileSync(out, fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8").replace(A, A + 'window.__ev=f=>eval("("+f+")");\n'));
const SECS = +(process.argv[2] || 60);
let fails = 0; const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fails++; };
const PAGE = function (args) {
  const [kind, dir, secs, scen, dtDiv] = args; const T = TILE, OFF = 3, N = 18;
  const cellMap = (d, lx, ly) => d === "down" ? [OFF + lx, ly] : d === "up" ? [OFF + N - 1 - lx, N - 1 - ly] : d === "right" ? [OFF + ly, N - 1 - lx] : [OFF + N - 1 - ly, lx];
  const ptMap = (d, px, py) => { const S = N * T, O = OFF * T; return d === "down" ? [O + px, py] : d === "up" ? [O + S - px, S - py] : d === "right" ? [O + py, S - px] : [O + S - py, px]; };
  const vecMap = (d, x, y) => d === "down" ? [x, y] : d === "up" ? [-x, -y] : d === "right" ? [y, -x] : [-y, x];
  const ptUn = (d, wx, wy) => { const S = N * T, O = OFF * T; return d === "down" ? [wx - O, wy] : d === "up" ? [O + S - wx, S - wy] : d === "right" ? [S - wy, wx - O] : [wy, O + S - wx]; };
  const cardName = (x, y) => x === 0 && y === -1 ? "n" : x === 1 && y === 0 ? "e" : x === 0 && y === 1 ? "s" : "w";
  const vecOf = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
  const mapKey = (d, key) => key.replace(/(wind|fan)-([nesw])/g, (m, k, s) => { const v = vecMap(d, ...vecOf[s]); return k + "-" + cardName(v[0], v[1]); });
  suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false; setGamePaused(false);
  gravityEnabled = true; gravityDir = dir; wrapHEnabled = false; wrapVEnabled = false;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { board[y][x] = null; colorBoard[y][x] = null; }
  actors.length = 0;
  const set = (lx, ly, key) => { const c = cellMap(dir, lx, ly); board[c[1]][c[0]] = mapKey(dir, key); };
  for (let i = 0; i < N; i++) { set(i, N - 1, "solid:none"); set(i, 0, "solid:none"); set(0, i, "solid:none"); set(N - 1, i, "solid:none"); }
  const row = (a, b, y, k) => { for (let x = a; x <= b; x++) set(x, y, k); };
  const floorKeys = { plain: null, trampoline: "trampoline:none", bouncy: "solid:bouncy", slippery: "solid:slippery", sticky: "solid:sticky", conveyor: "solid:wind-e" };
  if (floorKeys[scen] !== undefined && floorKeys[scen] !== null) row(1, 16, N - 1, floorKeys[scen]);
  if (scen === "wind") for (let y = 8; y <= 16; y++) row(2, 15, y, "none:wind-e");
  if (scen === "fan") { set(8, 17, "fan-n:none"); set(9, 17, "fan-n:none"); set(10, 17, "fan-n:none"); }
  // the hero: standing still in a corner of the box (a target for the chaser/fleer, never moves)
  const pp = ptMap(dir, 15.5 * T, 16.5 * T);
  selectedActorDefId = playerDefId; placeNewActor(pp[0], pp[1]);
  const hero = actors.find(a => a.isPlayer); hero.dragging = true; // frozen in place
  const base = actorDefs[findDefaultActorDef(kind)]; const def = structuredClone(base);
  const gl = CHARACTER_PRESETS.find(p => p.name === "Gloop"); def.art = gl.art.slice(); def.poses = null; def.hopper = true; def.lethal = false;
  actorDefs["t_hop"] = def;
  const start = ptMap(dir, 4.5 * T, 16 * T); const a = placeCarryableActor("t_hop", start[0], start[1], null);
  const dt = 1 / (60 * (dtDiv || 1)); const n = Math.round(secs * 60 * (dtDiv || 1));
  let hops = 0, prevGround = true, maxSpeed = 0, outOfBounds = 0, nan = 0, travelled = 0, last = ptUn(dir, a.x + a.w / 2, a.y + a.h / 2);
  const apexes = []; let curApex = 0, sawAir = false;
  for (let i = 0; i < n; i++) {
    tick(dt);
    const c = ptUn(dir, a.x + a.w / 2, a.y + a.h / 2);
    if (!isFinite(a.x) || !isFinite(a.y) || !isFinite(a.vx) || !isFinite(a.vy)) nan++;
    if (a.x < -40 || a.y < -40 || a.x > COLS * T + 40 || a.y > ROWS * T + 40) outOfBounds++;
    const loc = ptUn(dir, a.x + a.w / 2, a.y + a.h / 2); // local frame: y grows toward the floor
    if (loc[0] < 0 || loc[0] > N * T || loc[1] < 0 || loc[1] > N * T) outOfBounds++;
    maxSpeed = Math.max(maxSpeed, Math.hypot(a.vx, a.vy));
    travelled += Math.hypot(c[0] - last[0], c[1] - last[1]); last = c;
    if (!a.grounded && prevGround) hops++;
    prevGround = a.grounded;
    const h = ((N - 1) * T - 11) - loc[1]; // height above the resting spot on the floor, local frame
    if (h > curApex) curApex = h;
    if (!a.grounded) sawAir = true;
    if (i % Math.round(60 * (dtDiv || 1)) === 0) { apexes.push(curApex); curApex = 0; } // one apex per simulated second
  }
  const third = Math.floor(apexes.length / 3);
  const first = Math.max(...apexes.slice(0, third)), lastA = Math.max(...apexes.slice(-third));
  return { hops, maxSpeed: Math.round(maxSpeed), outOfBounds, nan, travelled: Math.round(travelled), firstApex: Math.round(first), lastApex: Math.round(lastA), alive: actors.includes(a) };
};
const WRAPPAGE = function (args) {
  const [kind, dir, secs, both] = args; const T = TILE, C = roomCols(), R = ROWS;
  suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false; setGamePaused(false);
  gravityEnabled = true; gravityDir = dir; const alongX = dir === "down" || dir === "up";
  wrapHEnabled = alongX || !!both; wrapVEnabled = !alongX || !!both;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) board[y][x] = null; actors.length = 0;
  // a floor along the whole wall gravity points at, no side walls: the hopper can cross the seam
  if (dir === "down") for (let x = 0; x < C; x++) board[R - 1][x] = "solid:none";
  if (dir === "up") for (let x = 0; x < C; x++) board[0][x] = "solid:none";
  if (dir === "left") for (let y = 0; y < R; y++) board[y][0] = "solid:none";
  if (dir === "right") for (let y = 0; y < R; y++) board[y][C - 1] = "solid:none";
  const heroAt = { down: [3 * T, (R - 1) * T - 11], up: [3 * T, T + 11], left: [T + 11, 3 * T], right: [C * T - T - 11, 3 * T] }[dir];
  selectedActorDefId = playerDefId; placeNewActor(heroAt[0], heroAt[1]); const hero = actors.find(a => a.isPlayer); hero.dragging = true;
  const def = structuredClone(actorDefs[findDefaultActorDef(kind)]); def.art = CHARACTER_PRESETS.find(p => p.name === "Gloop").art.slice(); def.poses = null; def.hopper = true; def.lethal = false; actorDefs["t_hop"] = def;
  const startAt = { down: [6 * T, (R - 1) * T - 11], up: [6 * T, T + 11], left: [T + 11, 6 * T], right: [C * T - T - 11, 6 * T] }[dir];
  const a = placeCarryableActor("t_hop", startAt[0], startAt[1], null);
  const len = (alongX ? C : R) * T, along = alongX ? "x" : "y";
  let wraps = 0, prev = a[along], hops = 0, prevG = true, bad = 0, travelled = 0;
  for (let i = 0; i < secs * 60; i++) {
    tick(1 / 60); const cur = a[along]; if (Math.abs(cur - prev) > len / 2) wraps++; else travelled += Math.abs(cur - prev); prev = cur;
    if (!isFinite(a.x) || !isFinite(a.y) || a.x < -60 || a.y < -60 || a.x > C * T + 60 || a.y > R * T + 60) bad++;
    if (!a.grounded && prevG) hops++; prevG = a.grounded;
  }
  return { wraps, hops, bad, travelled: Math.round(travelled), alive: actors.includes(a) };
};
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage(); p.on("dialog", d => d.accept()); const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto("file://" + out + "#t");
  const run = (args) => p.evaluate(([f, a]) => window.__ev(f)(a), [PAGE.toString(), args]);
  const rows = [];
  for (const dir of ["down", "up", "left", "right"]) for (const kind of ["wanderer", "chaser", "fleer"]) {
    const r = await run([kind, dir, SECS, "plain"]); rows.push(["plain", kind, dir, r]);
    ok(r.outOfBounds === 0 && r.nan === 0 && r.alive, `plain/${kind}/${dir}: stays in the room, ${r.hops} hops in ${SECS}s, travelled ${r.travelled}px, max speed ${r.maxSpeed}`);
    ok(r.hops >= SECS * 0.5, `plain/${kind}/${dir}: it really hops (${r.hops} >= ${SECS * 0.5})`);
    ok(r.maxSpeed < 800, `plain/${kind}/${dir}: max speed ${r.maxSpeed} < 800 (terminal fall is 750)`);
    ok(r.lastApex <= r.firstApex * 1.1 + 4, `plain/${kind}/${dir}: apex does not grow (${r.firstApex} -> ${r.lastApex})`);
  }
  for (const scen of ["fan", "wind", "conveyor", "trampoline", "bouncy", "slippery", "sticky"]) for (const dir of ["down", "up", "left", "right"]) {
    const r = await run(["wanderer", dir, SECS, scen]); rows.push([scen, "wanderer", dir, r]);
    // apex ceilings: a plain hop is 380 px/s = 50 px; the hero's bouncy launch 620 px/s = 132 px; the hero's trampoline launch 900 px/s = 279 px
    const cap = { trampoline: 290, bouncy: 142, fan: 130 }[scen] || 58;
    ok(r.outOfBounds === 0 && r.nan === 0 && r.alive, `${scen}/${dir}: stays in the room (${r.hops} hops, max speed ${r.maxSpeed}, apex ${r.firstApex}->${r.lastApex})`);
    ok(r.maxSpeed < 960, `${scen}/${dir}: max speed ${r.maxSpeed} < 960`);
    ok(Math.max(r.firstApex, r.lastApex) <= cap, `${scen}/${dir}: energy does not stack (apex ${r.firstApex} -> ${r.lastApex}, ceiling ${cap} px)`);
  }
  for (const dir of ["down", "up", "left", "right"]) for (const kind of ["wanderer", "fleer"]) for (const both of [false, true]) {
    const r = await p.evaluate(([f, a]) => window.__ev(f)(a), [WRAPPAGE.toString(), [kind, dir, SECS, both]]);
    ok(r.bad === 0 && r.alive && r.hops >= SECS * 0.4 && r.travelled > 300, `wrap${both ? " H+V" : ""}/${kind}/${dir}: stays on the board, keeps hopping (${r.hops} hops, ${r.wraps} seam crossings, travelled ${r.travelled}px)`);
  }
  // different frame rates
  for (const div of [0.5, 2.4]) { const r = await run(["wanderer", "down", 20, "plain", div]); ok(r.hops >= 10 && r.outOfBounds === 0, `frame rate x${div}: ${r.hops} hops in 20s, in bounds`); }
  // hero contact: identical reaction table for a hopper and an ordinary character
  const contact = await p.evaluate(([f]) => window.__ev(f)(), [(function () {
    const res = {};
    for (const hop of [true, false]) for (const kind of ["wanderer", "chaser", "fleer", "stationary"]) for (const lethal of [true, false]) {
      suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false; setGamePaused(false);
      gravityEnabled = true; for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) board[y][x] = null; actors.length = 0;
      for (let x = 0; x < 24; x++) board[14][x] = "solid:none";
      const def = structuredClone(actorDefs[findDefaultActorDef(kind)]); def.lethal = lethal;
      if (hop) { def.art = CHARACTER_PRESETS.find(p => p.name === "Gloop").art.slice(); def.hopper = true; } else { def.hopper = false; }
      actorDefs["t_c"] = def;
      selectedActorDefId = playerDefId; placeNewActor(10 * TILE, 13 * TILE + 10); const hero = actors.find(a => a.isPlayer);
      const n = placeCarryableActor("t_c", 10 * TILE + 6, 13 * TILE + 10, null);
      const ev = { catch: 0, reset: 0 }; const oc = triggerNpcCatch; triggerNpcCatch = function () { ev.catch++; return oc.apply(this, arguments); };
      const lives0 = lives;
      for (let i = 0; i < 3; i++) tick(1 / 60);
      triggerNpcCatch = oc;
      res[(hop ? "hop" : "plain") + "/" + kind + "/" + (lethal ? "lethal" : "harmless")] = { catch: ev.catch, gone: !actors.includes(n), flash: hero.flashTimer > 0 || hero.hazardCooldown > 0 };
    }
    return res;
  }).toString()]).catch(e => ({ err: String(e) }));
  console.log(JSON.stringify(contact).slice(0, 200));
  for (const kind of ["wanderer", "chaser", "fleer", "stationary"]) for (const l of ["lethal", "harmless"]) {
    const h = contact[`hop/${kind}/${l}`], q = contact[`plain/${kind}/${l}`];
    ok(h && q && JSON.stringify(h) === JSON.stringify(q), `hero contact identical for a hopper and an ordinary ${kind} (${l}): ${JSON.stringify(h)} vs ${JSON.stringify(q)}`);
  }
  // flag handling
  const flags = await p.evaluate(([f]) => window.__ev(f)(), [(function () {
    const g = CHARACTER_PRESETS.find(p => p.name === "Gloop");
    return { gloopPreset: g.hopper === true, others: CHARACTER_PRESETS.filter(p => p.name !== "Gloop").every(p => !p.hopper), legacy: isHopperDef({ art: SLIME_ART.slice() }), legacyOther: isHopperDef({ art: CHAR_ART_OTHER() }), explicitOff: isHopperDef({ art: SLIME_ART.slice(), hopper: false }) };
    function CHAR_ART_OTHER() { return CHARACTER_PRESETS.find(p => p.name === "Mousecop").art.slice(); }
  }).toString()]);
  ok(flags.gloopPreset && flags.others, "only the Gloop preset carries the hopper flag");
  ok(flags.legacy && !flags.legacyOther && !flags.explicitOff, "a def without the flag is a hopper only while its art is Gloop's; an explicit false wins");
  // the bouncy Try me scene really has a hopper on a bouncy floor, and it bounces
  const tm = await p.evaluate(([f]) => window.__ev(f)(), [(function () {
    suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false;
    selectedActorKind = "x"; surpriseMe(1, { templateId: "tryme-bounce", full: "new", tryme: true, live: true });
    const h = actors.find(a => a.defId === HOPPER_PET_DEF_ID); if (!h) return { found: false };
    let up = 0, prevVy = 0; for (let i = 0; i < 360; i++) { tick(1 / 60); if (prevVy > 150 && h.vy < -150) up++; prevVy = h.vy; }
    return { found: true, bounces: up, def: isHopperDef(actorDefs[HOPPER_PET_DEF_ID]) };
  }).toString()]).catch(e => ({ err: String(e) }));
  ok(tm.found && tm.def && tm.bounces >= 1, "bouncy Try me scene: a hopping Gloop on the bouncy floor bounces " + JSON.stringify(tm));
  ok(errs.length === 0, "no page errors " + errs.slice(0, 2));
  console.log(JSON.stringify(rows.map(r => [r[0], r[1], r[2], r[3].hops, r[3].maxSpeed, r[3].travelled, r[3].firstApex + ">" + r[3].lastApex])));
  await b.close(); console.log(fails ? "FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);
})();
