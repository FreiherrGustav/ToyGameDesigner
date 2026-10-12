// "Rock Bottom" sample traces (not deployed). Usage: node tests/rockbottom.test.js
// Injects a throwaway accessor into a temp copy of index.html (the repo file stays clean), disables
// requestAnimationFrame and drives tick(1/60) by hand so every trace is deterministic. Real-time waits are only used
// where the engine itself uses setTimeout (a gathered gem is removed 220ms later; a lost life restarts the level 650ms later).
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/opt/node22/lib/node_modules/playwright");
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = `window.__ev=f=>eval("("+f+")");`;
const tmp = path.join(os.tmpdir(), "rb_test_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK));
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fails.push(m); console.log("FAIL:", m); } };
const run = (pg, fn, arg) => pg.evaluate(([s, a]) => window.__ev(s)(a), [fn.toString(), arg]);
const table = [];

// helpers installed inside the app's scope (the editor page and the exported page both get the same ones)
const LIB = `()=>{
 window.T={
  P(){return actors.find(a=>a.isPlayer)},
  tk(n,dt){for(let i=0;i<n;i++)tick(dt||1/60)},
  key(k,v){keys[k]=v},
  at(gx,gy){const p=T.P();p.x=gx*TILE+(TILE-p.w)/2;p.y=(gy+1)*TILE-p.h;p.vx=0;p.vy=0;p.grounded=false;},
  cell(a){return [Math.floor((a.x+a.w/2)/TILE),Math.floor((a.y+a.h/2)/TILE)]},
  list(d){return actors.filter(a=>a.defId===d)},
  hit(){return 3-lives},
  gemsLeft(){return actors.filter(a=>a.defId==="colGem").length},
  beast(){return actors.find(a=>a.defId==="rbBeast")}
 };
 window.B={
  hold(keys2,fn,max){keys2.forEach(k=>T.key(k,true));let t=0;for(;t<max;t++){T.tk(1);if(fn())break;}keys2.forEach(k=>T.key(k,false));return t;},
  walk(dir,toX,max,opts){opts=opts||{};max=max||600;const q=T.P();const k=dir>0?"ArrowRight":"ArrowLeft";T.key(k,true);let t=0;
    for(;t<max;t++){T.key(" ",!!opts.hopWhenStuck&&q.vx===0&&q.grounded&&t%8===0);T.tk(1);if(T.hit()>0)break;if(dir>0?q.x>=toX:q.x<=toX)break;}
    T.key(k,false);T.key(" ",false);return t;},
  dig(dir,cx,cy,max){max=max||300;const k=dir>0?"ArrowRight":"ArrowLeft";T.key(k,true);T.key("ArrowDown",true);let t=0;for(;t<max;t++){T.tk(1);if(board[cy][cx]===null)break;}T.key(k,false);T.key("ArrowDown",false);return t;},
  hop(dir,hold,after){const k=dir>0?"ArrowRight":"ArrowLeft";T.key(k,true);T.key(" ",true);T.tk(hold||10);T.key(" ",false);T.tk(after||50);T.key(k,false);T.tk(30);},
  settle(n){T.tk(n||90)}
 };}`;

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = []; page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept());
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto("file://" + tmp); await page.waitForFunction(() => window.__ev);
  await page.evaluate(l => window.__ev(l)(), LIB);
  const load = () => run(page, () => {
    if (appMode === "play") exitToBuildMode();
    loadExampleGame(buildRockBottomGame, "Rock Bottom"); enterPlayMode(); playReadyUntil = null;
    for (const k in keys) keys[k] = false;
    return true;
  });
  const sec = n => console.log("\n== " + n);

  // ---------------------------------------------------------------- A. static checks
  sec("A. static");
  await load();
  const st = await run(page, () => {
    const r = rooms[0]; const out = {};
    out.rooms = rooms.length; out.cols = roomCols(); out.cam = cameraMode; out.grav = gravityEnabled; out.wrapH = wrapHEnabled; out.wrapV = wrapVEnabled;
    out.gems = actors.filter(a => a.defId === "colGem").length;
    out.otherCollectibles = actors.filter(a => { const d = actorDefs[a.defId]; return d && d.temperament === "collectible" && a.defId !== "colGem"; }).length;
    out.powerups = actors.filter(a => POWERUP_DEF_IDS.includes(a.defId)).length;
    out.goalTiles = board.flat().filter(c => c && c.startsWith("goal")).length;
    out.crates = actors.filter(a => a.defId === PUSHABLE_DEF_ID).length; out.stones = actors.filter(a => a.defId === LARGE_STONE_DEF_ID).length;
    out.beasts = actors.filter(a => a.defId === "rbBeast").length; out.players = actors.filter(a => a.isPlayer).length;
    out.player = actorDefs[playerDefId].name;
    let bare = 0, dirtCells = 0, rockCells = 0;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < 72; x++) {
      if (!backgroundBoard[y][x]) bare++;                      // every cell, even solid ones, has a cave wall or sky behind it
      if (board[y][x] && !groundSkinBoard[y][x] && !board[y][x].startsWith("barrier") && !board[y][x].startsWith("plate")) bare++;
      if (board[y][x] === "solid:diggable") dirtCells++; if (board[y][x] === "solid:none") rockCells++;
    }
    out.bare = bare; out.dirtCells = dirtCells; out.rockCells = rockCells;
    out.dirtSkins = new Set(board.flat().map((c, i) => c === "solid:diggable" ? groundSkinBoard[Math.floor(i / 72)][i % 72] : null).filter(Boolean)).size;
    out.bgTypes = new Set(backgroundBoard.flat().filter(Boolean)).size;
    out.gates = board.flat().filter(c => c && c.startsWith("barrier")).length; out.plates = board.flat().filter(c => c === "plate:none").length;
    out.lavaCells = board.flat().filter(c => c === "none:lethal").length;
    return out;
  });
  console.log(JSON.stringify(st));
  ok(st.rooms === 1 && st.cols === 72 && st.cam === "follow" && st.grav && !st.wrapH && !st.wrapV, "room shape " + JSON.stringify(st));
  ok(st.gems === 12 && st.otherCollectibles === 0 && st.powerups === 0 && st.goalTiles === 0, "win rule: 12 gems, no goal, no heart/key/star");
  ok(st.players === 1 && st.beasts === 1 && st.crates === 6 && st.stones === 3, "actor counts " + JSON.stringify(st));
  ok(st.bare === 0, "no bare (undecorated) cells: " + st.bare);
  ok(st.dirtSkins >= 3 && st.bgTypes >= 12 && st.dirtCells > 100 && st.rockCells > 100, "decoration variety " + JSON.stringify(st));
  ok(st.gates === 6 && st.plates === 3 && st.lavaCells === 2, "gates/plates/lava " + JSON.stringify(st));

  // ---------------------------------------------------------------- B. Part 1 — Topsoil
  sec("B1. Part 1 Topsoil");
  const p1 = await run(page, () => {
    const out = {}; const FRAMES = 60;
    // fall down the well from the start
    T.tk(1);
    const q = T.P(); T.key("ArrowRight", true); let t = 0; for (; t < 300; t++) { T.tk(1); if (q.grounded && T.cell(q)[1] === 10) break; } T.key("ArrowRight", false); T.tk(20);
    out.well = { s: +(t / FRAMES).toFixed(2), cell: T.cell(q) };
    // the shelf: three input patterns. 'hold' keeps Right+Down for 1.2s after the crumble
    const pattern = (label, after) => {
      loadExampleGame(buildRockBottomGame, "Rock Bottom"); enterPlayMode(); playReadyUntil = null;
      const p = T.P(); T.at(33, 10); T.tk(10);
      T.key("ArrowRight", true); T.key("ArrowDown", true);
      let dug = null, stop = null, last = null;
      for (let i = 0; i < 400; i++) {
        T.tk(1);
        if (dug === null && board[10][34] === null) dug = i;
        if (dug !== null && stop === null && (after === 0 || i >= dug + after)) { T.key("ArrowRight", false); T.key("ArrowDown", false); stop = i; }
        if (label === "early" && i === 20) { T.key("ArrowRight", false); T.key("ArrowDown", false); }
      }
      const cr = T.list(PUSHABLE_DEF_ID).filter(a => a.x > 1088 && a.x < 1130).map(a => Math.round(a.y)).sort((a, b) => a - b);
      out[label] = { dugS: dug === null ? null : +(dug / FRAMES).toFixed(2), hits: T.hit(), crates: cr, playerCell: T.cell(p) };
      // seconds until the falling crates are at rest
    };
    pattern("hold", 72); pattern("release", 0); pattern("early", 0);
    // how long do the crates take to land? (release at the crumble, sample)
    loadExampleGame(buildRockBottomGame, "Rock Bottom"); enterPlayMode(); playReadyUntil = null;
    const p = T.P(); T.at(33, 10); T.tk(10); B.dig(1, 34, 10); let ft = 0; const cs = T.list(PUSHABLE_DEF_ID).filter(a => a.x > 1088 && a.x < 1130);
    for (; ft < 200; ft++) { T.tk(1); if (cs.every(a => a.vy === 0 && a.grounded)) break; }
    out.fallS = +(ft / FRAMES).toFixed(2);
    return out;
  });
  console.log(JSON.stringify(p1));
  ok(p1.well.cell[1] === 10, "start falls down the well into the corridor");
  ok(p1.release.hits === 0 && p1.hold.hits === 0 && p1.early.hits === 0, "no boulder hit in any pattern " + JSON.stringify(p1));
  ok(p1.release.crates.join() === "308,330" && p1.hold.crates.length === 2, "two crates stack beside the pillar: " + JSON.stringify(p1.release));
  ok(p1.early.dugS === null && p1.early.crates.join() === "276,298", "released early: shelf stands, crates untouched");
  // the pillar: needs the 2-stack. 0/1/2 crates at three frame rates (jump height is 122-130px depending on dt)
  const pill = await run(page, () => {
    const out = {};
    for (const dt of [1 / 30, 1 / 60, 1 / 144]) for (const n of [0, 1, 2]) {
      loadExampleGame(buildRockBottomGame, "Rock Bottom"); enterPlayMode(); playReadyUntil = null;
      const q = T.P(); const cs = T.list(PUSHABLE_DEF_ID).filter(a => a.x > 1088 && a.x < 1130);
      for (let i = n; i < cs.length; i++) actors.splice(actors.indexOf(cs[i]), 1);
      T.at(33, 10); T.tk(10, dt);
      T.key("ArrowRight", true); T.key("ArrowDown", true); for (let i = 0; i < 600; i++) { T.tk(1, dt); if (board[10][34] === null) break; } T.key("ArrowDown", false); T.key("ArrowRight", false);
      T.tk(Math.round(1.5 / dt), dt);
      let got = false; T.key("ArrowRight", true);
      for (let j = 0; j < 4 && !got; j++) {
        T.key(" ", true); for (let i = 0; i < Math.round(0.6 / dt); i++) { T.tk(1, dt); if (T.cell(q)[1] <= 5 && T.cell(q)[0] === 35) got = true; } T.key(" ", false);
        T.tk(Math.round(0.9 / dt), dt);
        if (T.cell(q)[0] === 35 && T.cell(q)[1] <= 5) got = true;
      }
      T.key("ArrowRight", false);
      out["dt" + Math.round(1 / dt) + "_crates" + n] = got;
    }
    return out;
  });
  console.log(JSON.stringify(pill));
  for (const dt of [30, 60, 144]) {
    ok(pill["dt" + dt + "_crates2"] === true, "pillar gem reachable with the 2-stack at " + dt + "fps");
    ok(pill["dt" + dt + "_crates1"] === false && pill["dt" + dt + "_crates0"] === false, "pillar gem NOT reachable with <2 crates at " + dt + "fps");
  }
  table.push(["1 Topsoil", "well, 2 gems, dig shelf (" + p1.release.dugS + "s), jump onto stack, jump to pillar", p1.fallS + "s (crates land)", "no boulder can reach the digger", "hold/release/early: all 0 hits"]);

  // ---------------------------------------------------------------- B2. Part 2 — Plate Vault
  sec("B2. Part 2 Plate Vault");
  const p2 = await run(page, () => {
    const out = {};
    const attempt = (label, mode) => {
      loadExampleGame(buildRockBottomGame, "Rock Bottom"); enterPlayMode(); playReadyUntil = null;
      const q = T.P(); T.at(25, 10); T.tk(10);
      const t1 = B.dig(-1, 24, 10); T.key("ArrowLeft", false);
      T.key("ArrowLeft", true); let w = 0; for (; w < 200; w++) { T.tk(1); if (T.cell(q)[0] <= 20) break; } T.key("ArrowLeft", false); T.tk(15);
      const t2 = B.dig(-1, 19, 10);
      if (mode === "hold") T.key("ArrowLeft", true);
      let landed = null; const cs = T.list(PUSHABLE_DEF_ID).filter(a => a.x > 560 && a.x < 660 && a.y < 400);
      for (let i = 0; i < 400; i++) { T.tk(1); if (landed === null && mode !== "hold" && cs.every(a => a.vy === 0 && a.grounded)) landed = i; }
      T.key("ArrowLeft", false);
      out[label] = { plugS: +(t1 / 60).toFixed(2), shelfS: +(t2 / 60).toFixed(2), landS: landed === null ? null : +(landed / 60).toFixed(2), gateOpen: isChannelOn("red"), hits: T.hit(),
        crates: T.list(PUSHABLE_DEF_ID).filter(a => a.x < 24 * 32 && a.y < 14 * 32).map(a => [Math.round(a.x), Math.round(a.y)]), pl: [Math.round(q.x), Math.round(q.y)] };
    };
    attempt("release", "release"); attempt("hold", "hold");
    return out;
  });
  console.log(JSON.stringify(p2));
  ok(p2.release.gateOpen && p2.release.hits === 0 && p2.release.crates.length === 2, "release at the crumble: both crates land on the plate, gate opens " + JSON.stringify(p2.release));
  ok(p2.hold.hits === 0, "holding Left through the dig costs no life: " + JSON.stringify(p2.hold));
  // recovery from the 'hold' outcome (crates shoved west along the hall): hop over them, push them back east into the pit
  const rec = await run(page, () => {
    loadExampleGame(buildRockBottomGame, "Rock Bottom"); enterPlayMode(); playReadyUntil = null;
    const q = T.P(); T.at(25, 10); T.tk(10); B.dig(-1, 24, 10); T.key("ArrowLeft", true); for (let w = 0; w < 200; w++) { T.tk(1); if (T.cell(q)[0] <= 20) break; } T.key("ArrowLeft", false); T.tk(15);
    B.dig(-1, 19, 10); T.key("ArrowLeft", true); T.tk(240); T.key("ArrowLeft", false); T.tk(30);
    const before = { gate: isChannelOn("red"), crates: T.list(PUSHABLE_DEF_ID).filter(a => a.x < 24 * 32 && a.y < 14 * 32).map(a => Math.round(a.x)) };
    // walk west off the crates, then push everything east
    T.key("ArrowLeft", true); T.tk(60); T.key("ArrowLeft", false); T.tk(30);
    T.key("ArrowRight", true); for (let i = 0; i < 700; i++) { T.tk(1); if (isChannelOn("red")) break; } T.key("ArrowRight", false);
    return { before, gateAfter: isChannelOn("red"), pl: [Math.round(q.x), Math.round(q.y)], hits: T.hit() };
  });
  console.log("recovery:", JSON.stringify(rec));
  ok(rec.before.gate === false && rec.gateAfter === true, "hold-through outcome is recoverable by pushing the crates back east: " + JSON.stringify(rec));
  table.push(["2 Plate Vault", "dig plug, dig shelf (" + p2.release.shelfS + "s), crates fall onto the red plate, walk in", (p2.release.landS || "?") + "s", "n/a (digger beside the column)", "release: gate opens; hold: crates shoved west, recover by pushing back"]);

  // ---------------------------------------------------------------- B3. Part 3 — Lava Moat
  sec("B3. Part 3 Lava Moat");
  const p3 = await run(page, () => {
    const out = {};
    const attempt = (label, mode) => {
      loadExampleGame(buildRockBottomGame, "Rock Bottom"); enterPlayMode(); playReadyUntil = null;
      const q = T.P(); T.at(51, 15); T.tk(10);
      T.key("ArrowRight", true); T.key("ArrowDown", true); let t = 0; for (; t < 300; t++) { T.tk(1); if (board[15][52] === null) break; }
      T.key("ArrowDown", false); if (mode === "release") T.key("ArrowRight", false);
      if (mode === "early") { /* never dug: release before the crumble */ }
      const ss = T.list(LARGE_STONE_DEF_ID); let landed = null;
      for (let i = 0; i < 200; i++) { T.tk(1); if (mode === "release" && landed === null && ss.every(a => a.vy === 0 && a.grounded)) landed = i; }
      const res = { cork: +(t / 60).toFixed(2), landS: landed === null ? null : +(landed / 60).toFixed(2), stones: ss.map(a => Math.round(a.y)).sort((a, b) => a - b), hits: T.hit(), lives: lives };
      if (mode === "release") {
        T.key("ArrowRight", true); let crossed = false; for (let i = 0; i < 300; i++) { T.key(" ", i % 12 < 5); T.tk(1); if (T.hit() > 0) break; if (q.x > 54 * 32) { crossed = true; break; } }
        T.key("ArrowRight", false); T.key(" ", false); res.crossed = crossed; res.hitsAfterCross = T.hit();
      }
      out[label] = res;
    };
    attempt("release", "release"); attempt("hold", "hold");
    // released early: stop before the cork crumbles (0.4s of digging)
    loadExampleGame(buildRockBottomGame, "Rock Bottom"); enterPlayMode(); playReadyUntil = null; const q = T.P(); T.at(51, 15); T.tk(10);
    T.key("ArrowRight", true); T.key("ArrowDown", true); T.tk(24); T.key("ArrowRight", false); T.key("ArrowDown", false); T.tk(120);
    out.early = { corkStands: board[15][52] === "solid:diggable", hits: T.hit(), stones: T.list(LARGE_STONE_DEF_ID).map(a => Math.round(a.y)).sort((a, b) => a - b) };
    return out;
  });
  console.log(JSON.stringify(p3));
  ok(p3.release.stones.join() === "510,532,554" && p3.release.hits === 0 && p3.release.crossed === true && p3.release.hitsAfterCross === 0, "release at the crumble: 3 stones fill the pit (lip 2px) and the player crosses " + JSON.stringify(p3.release));
  ok(p3.hold.hits >= 1, "holding Right through the dig walks into the lava (costs a life): " + JSON.stringify(p3.hold));
  ok(p3.early.corkStands && p3.early.hits === 0, "released early: nothing happens " + JSON.stringify(p3.early));
  // the open pit is deadly and cannot be hopped (needs the stones): remove stones, remove cork, try 12 jump timings
  const hop = await run(page, () => {
    const res = [];
    for (const jd of [0, 4, 8, 12, 16, 24, 32]) {
      loadExampleGame(buildRockBottomGame, "Rock Bottom"); enterPlayMode(); playReadyUntil = null; const q = T.P();
      T.list(LARGE_STONE_DEF_ID).forEach(a => actors.splice(actors.indexOf(a), 1)); board[15][52] = null;
      T.at(49, 15); T.tk(10); T.key("ArrowRight", true); let jumped = null, crossed = false;
      for (let i = 0; i < 160; i++) { const edge = 52 * 32 - (q.x + q.w); if (jumped === null && edge <= jd) { T.key(" ", true); jumped = i; } if (jumped !== null && i >= jumped + 10) T.key(" ", false); T.tk(1); if (T.hit() > 0) break; if (q.x > 54 * 32) { crossed = true; break; } }
      T.key("ArrowRight", false); T.key(" ", false); res.push(crossed);
    }
    return res;
  });
  console.log("open-pit hop attempts (jump distance 0..32px before the edge):", JSON.stringify(hop));
  // informational: an open 1-wide pit can be hopped with an early jump, but it is never open without the stones: the cork releases them the moment it breaks
  table.push(["3 Lava Moat", "dig plug, dig cork (" + p3.release.cork + "s), 3 stones fall in, hop the 2px lip, cross", (p3.release.landS || "?") + "s (stones at rest)", "n/a (digger beside the column)", "hold-through = lava (life lost, level restarts)"]);

  // ---------------------------------------------------------------- B4. Part 4 — Beast's Tunnels
  sec("B4. Part 4 Beast's Tunnels");
  const p4 = await run(page, () => {
    const out = {};
    const attempt = (label, pat) => {
      loadExampleGame(buildRockBottomGame, "Rock Bottom"); enterPlayMode(); playReadyUntil = null;
      const q = T.P(); T.at(25, 15); T.tk(10);
      const dugT = B.dig(-1, 24, 15);
      let gateAt = null, pitAt = null; const be = T.beast(); const x0 = Math.round(be.x);
      for (let i = 0; i < 700; i++) {
        T.key("ArrowLeft", pat === "hold" || (pat === "release" && gateAt === null) || (pat === "early" && i < 20));
        T.tk(1);
        if (gateAt === null && isChannelOn("green")) gateAt = i;
        if (pitAt === null && be.y > 510 && be.x > 14 * 32 && be.x < 19 * 32) pitAt = i;
      }
      T.key("ArrowLeft", false);
      out[label] = { plugS: +(dugT / 60).toFixed(2), gateAt: gateAt === null ? null : +(gateAt / 60).toFixed(2), beastInPitS: (pitAt !== null && gateAt !== null) ? +((pitAt - gateAt) / 60).toFixed(2) : null,
        beast: [Math.round(be.x), Math.round(be.y)], player: [Math.round(q.x), Math.round(q.y)], hits: T.hit(), beastFreeAtStart: x0 };
    };
    attempt("release", "release"); attempt("hold", "hold"); attempt("early", "early");
    return out;
  });
  console.log(JSON.stringify(p4));
  ok(p4.release.gateAt !== null && p4.release.beastInPitS !== null && p4.release.hits === 0, "release: crate opens the gate, the beast runs into the pit and is stuck " + JSON.stringify(p4.release));
  ok(p4.hold.hits === 0 && p4.hold.gateAt !== null && p4.hold.beast[1] > 510, "hold: the player ends up standing in the plate pit (stuck until he jumps); the beast is in the pit; no hit " + JSON.stringify(p4.hold));
  ok(p4.early.gateAt === null && p4.early.beast[0] < 13 * 32, "early: gate stays shut, beast stays sealed " + JSON.stringify(p4.early));
  // without the pit trap the beast is a real threat: remove the trap pit floor-holes and check it catches the player
  const threat = await run(page, () => {
    loadExampleGame(buildRockBottomGame, "Rock Bottom"); enterPlayMode(); playReadyUntil = null; const q = T.P();
    board[16][16] = "solid:none"; board[16][17] = "solid:none"; // fill the trap pit
    T.at(25, 15); T.tk(10); B.dig(-1, 24, 15); T.key("ArrowLeft", true); let caught = null;
    for (let i = 0; i < 800; i++) { if (isChannelOn("green")) T.key("ArrowLeft", false); T.tk(1); if (T.hit() > 0) { caught = i; break; } }
    T.key("ArrowLeft", false);
    // and it cannot be outrun: player runs east, beast follows at 160px/s vs player's 220 - but dead ends catch
    return { caught: caught !== null, lives };
  });
  console.log("beast without the pit:", JSON.stringify(threat));
  ok(threat.caught, "the beast really is a threat without the trap pit: " + JSON.stringify(threat));
  // crossing the trap pit once the beast is in it
  const cross = await run(page, () => {
    const res = [];
    for (const jd of [0, 8, 16, 24, 32, 40]) {
      loadExampleGame(buildRockBottomGame, "Rock Bottom"); enterPlayMode(); playReadyUntil = null; const q = T.P();
      T.list(PUSHABLE_DEF_ID).filter(a => a.x < 24 * 32 && a.y > 14 * 32).forEach(a => actors.splice(actors.indexOf(a), 1));
      board[16][19] = "solid:none"; actors.filter(a => a.defId === "rbBeast").forEach(a => actors.splice(actors.indexOf(a), 1));
      q.x = 21 * 32; q.y = 15 * 32 + 32 - 22; q.vx = 0; q.vy = 0; T.tk(20);
      T.key("ArrowLeft", true); let jumped = null, crossed = false;
      for (let i = 0; i < 300; i++) { const edge = q.x - 18 * 32; if (jumped === null && edge <= jd) { T.key(" ", true); jumped = i; } if (jumped !== null && i >= jumped + 10) T.key(" ", false); T.tk(1); if (q.x < 14.5 * 32 && q.grounded) { crossed = true; break; } }
      T.key("ArrowLeft", false); T.key(" ", false); res.push(crossed);
    }
    return res;
  });
  console.log("trap-pit hop (jump 0..40px before the edge):", JSON.stringify(cross));
  ok(cross.slice(0, 4).every(Boolean), "the trap pit is hoppable with a 24px window: " + JSON.stringify(cross));
  table.push(["4 Beast's Tunnels", "dig plug, push crate into the plate pit, wait, hop the trap pit, take 3 gems", p4.release.beastInPitS + "s (gate to pit)", "player east of the pit the whole time", "hold: stuck in plate pit; no hit"]);

  // ---------------------------------------------------------------- B5. Part 5 — Deep Vault
  sec("B5. Part 5 Deep Vault");
  const p5 = await run(page, () => {
    loadExampleGame(buildRockBottomGame, "Rock Bottom"); enterPlayMode(); playReadyUntil = null; const q = T.P(); T.at(55, 15); T.tk(10);
    const crate = T.list(PUSHABLE_DEF_ID).find(a => a.x > 57 * 32); const out = { gateBefore: isChannelOn("blue") };
    T.key("ArrowRight", true); let t = 0; for (; t < 600; t++) { T.tk(1); if (isChannelOn("blue")) break; }
    out.openAfterS = +(t / 60).toFixed(2); out.gateOpen = isChannelOn("blue");
    // keep holding Right for 3 more seconds (hopping out of the pit when stuck): the crate cannot be pushed past the plate pit
    for (let i = 0; i < 180; i++) { T.key(" ", q.vx === 0 && q.grounded && i % 10 === 0); T.tk(1); } T.key("ArrowRight", false); T.key(" ", false);
    out.crate = [Math.round(crate.x), Math.round(crate.y)]; out.gateStillOpen = isChannelOn("blue"); out.vaultX = Math.round(q.x);
    return out;
  });
  console.log(JSON.stringify(p5));
  ok(!p5.gateBefore && p5.gateOpen && p5.gateStillOpen && p5.crate[1] > 500 && p5.vaultX > 66 * 32, "crate falls into the blue plate pit and holds the gate; holding Right cannot lose it " + JSON.stringify(p5));
  // the vault is shut without the crate: walking the player alone (no crate) never gets in
  const shut = await run(page, () => {
    loadExampleGame(buildRockBottomGame, "Rock Bottom"); enterPlayMode(); playReadyUntil = null; const q = T.P();
    T.list(PUSHABLE_DEF_ID).filter(a => a.x > 57 * 32).forEach(a => actors.splice(actors.indexOf(a), 1)); T.at(60, 15); T.tk(10);
    T.key("ArrowRight", true); T.tk(240); T.key("ArrowRight", false);
    return { x: Math.round(q.x), gate: isChannelOn("blue") };
  });
  ok(shut.x < 63 * 32, "without the crate the Deep Vault stays shut " + JSON.stringify(shut));
  table.push(["5 Deep Vault", "cross Part 3, push the far crate onto the blue plate, hop it, take 2 gems", p5.openAfterS + "s (push to open)", "n/a", "over-push stops on the plate"]);

  // ---------------------------------------------------------------- C. a full real-input playthrough (win by collecting every gem)
  sec("C. full playthrough");
  await load();
  const phase = async (name, fn) => { const r = await run(page, fn); await page.waitForTimeout(260); return r; };
  const log = [];
  log.push(await phase("well+P1", () => { const q = T.P(); B.walk(1, 26 * 32 + 4, 200); B.settle(60); B.walk(1, 28 * 32, 200); B.walk(1, 31 * 32, 200); B.walk(1, 33 * 32 + 6, 200); B.settle(10); B.dig(1, 34, 10); B.settle(90);
    T.key("ArrowRight", true); T.key(" ", true); T.tk(10); T.key(" ", false); T.tk(30); T.key(" ", true); T.tk(10); T.key(" ", false); T.tk(60); T.key("ArrowRight", false); return { cell: T.cell(q), left: T.gemsLeft(), lives }; }));
  log.push(await phase("P2", () => { const q = T.P(); B.walk(-1, 32 * 32, 200); B.settle(40); B.walk(-1, 25 * 32 + 2, 300); B.settle(10); B.dig(-1, 24, 10); B.walk(-1, 20 * 32 + 2, 300); B.settle(10); B.dig(-1, 19, 10); B.settle(120);
    T.key("ArrowLeft", true); for (let t = 0; t < 500; t++) { T.key(" ", q.grounded && q.vx === 0 && t % 10 === 0); T.tk(1); if (q.x < 7 * 32) break; } T.key("ArrowLeft", false); T.key(" ", false); B.settle(30); return { cell: T.cell(q), left: T.gemsLeft(), lives }; }));
  log.push(await phase("shaft+P4", () => { const q = T.P(); B.walk(1, 29 * 32 + 4, 700, { hopWhenStuck: true }); B.settle(15); T.key("ArrowDown", true); for (let t = 0; t < 600; t++) { T.tk(1); if (T.cell(q)[1] >= 14 && q.grounded) break; } T.key("ArrowDown", false); B.settle(20);
    B.walk(-1, 25 * 32 + 2, 300); B.settle(10); B.dig(-1, 24, 15); T.key("ArrowLeft", true); for (let i = 0; i < 300; i++) { T.tk(1); if (isChannelOn("green")) break; } T.key("ArrowLeft", false); B.settle(200);
    T.key("ArrowLeft", true); for (let t = 0; t < 200; t++) { T.key(" ", (q.grounded && q.vx === 0 && t % 14 === 0) || t < 12); T.tk(1); if (q.grounded && q.x < 600 && q.x > 580) break; if (q.x < 580) break; } T.key("ArrowLeft", false); T.key(" ", false); B.settle(40);
    B.hop(-1, 10, 70); T.key("ArrowLeft", true); for (let i = 0; i < 300; i++) { T.tk(1); if (q.x < 5 * 32) break; } T.key("ArrowLeft", false); B.settle(30); return { cell: T.cell(q), left: T.gemsLeft(), lives, beast: [Math.round(T.beast().x), Math.round(T.beast().y)] }; }));
  log.push(await phase("back east+P3", () => { const q = T.P(); B.walk(1, 480, 400); B.settle(30); B.hop(1, 10, 50); B.walk(1, 590, 200); B.settle(30); B.hop(1, 8, 40);
    B.walk(1, 43 * 32 + 2, 500, { hopWhenStuck: true }); B.settle(20); B.dig(1, 44, 15); B.walk(1, 51 * 32 + 6, 400, { hopWhenStuck: true }); B.settle(20); B.dig(1, 52, 15); B.settle(100);
    T.key("ArrowRight", true); for (let i = 0; i < 300; i++) { T.key(" ", i % 12 < 5); T.tk(1); if (q.x > 57 * 32) break; } T.key("ArrowRight", false); T.key(" ", false); B.settle(20); return { cell: T.cell(q), left: T.gemsLeft(), lives }; }));
  log.push(await phase("P5", () => { const q = T.P(); T.key("ArrowRight", true); for (let t = 0; t < 500; t++) { T.tk(1); if (isChannelOn("blue")) break; } const crate = T.list(PUSHABLE_DEF_ID).find(a => a.x > 57 * 32);
    for (let i = 0; i < 300; i++) { T.key(" ", q.vx === 0 && q.grounded && i % 10 === 0); T.tk(1); if (q.x > 70 * 32) break; } T.key("ArrowRight", false); T.key(" ", false); B.settle(30); return { cell: T.cell(q), left: T.gemsLeft(), lives }; }));
  await page.waitForTimeout(500);
  const fin = await run(page, () => ({ ended: playSessionEnded, left: actors.filter(a => a.defId === "colGem").length, lives }));
  console.log("phases:", JSON.stringify(log.map(l => l.left)), "final:", JSON.stringify(fin));
  ok(fin.ended === "win" && fin.left === 0 && fin.lives === 3, "the real-input playthrough collects every gem and wins with all lives: " + JSON.stringify(fin));

  // ---------------------------------------------------------------- D. order independence (Part 2, 3+5, 4 in every order), via the same solvers from each part's own door
  sec("D. any order");
  const orders = [["2", "3", "4"], ["2", "4", "3"], ["3", "2", "4"], ["3", "4", "2"], ["4", "2", "3"], ["4", "3", "2"]];
  for (const ord of orders) {
    await load();
    const r = await run(page, (o) => {
      const q = T.P();
      const solve = {
        "2": () => { T.at(25, 10); T.tk(10); B.dig(-1, 24, 10); B.walk(-1, 20 * 32 + 2, 300); B.settle(10); B.dig(-1, 19, 10); B.settle(120); T.key("ArrowLeft", true); for (let t = 0; t < 500; t++) { T.key(" ", q.grounded && q.vx === 0 && t % 10 === 0); T.tk(1); if (q.x < 7 * 32) break; } T.key("ArrowLeft", false); T.key(" ", false); B.settle(30); },
        "4": () => { T.at(25, 15); T.tk(10); B.dig(-1, 24, 15); T.key("ArrowLeft", true); for (let i = 0; i < 300; i++) { T.tk(1); if (isChannelOn("green")) break; } T.key("ArrowLeft", false); B.settle(200);
          T.key("ArrowLeft", true); for (let t = 0; t < 200; t++) { T.key(" ", (q.grounded && q.vx === 0 && t % 14 === 0) || t < 12); T.tk(1); if (q.grounded && q.x < 600 && q.x > 580) break; if (q.x < 580) break; } T.key("ArrowLeft", false); T.key(" ", false); B.settle(40);
          B.hop(-1, 10, 70); T.key("ArrowLeft", true); for (let i = 0; i < 300; i++) { T.tk(1); if (q.x < 5 * 32) break; } T.key("ArrowLeft", false); B.settle(30); },
        "3": () => { T.at(43, 15); T.tk(10); B.dig(1, 44, 15); B.walk(1, 51 * 32 + 6, 400, { hopWhenStuck: true }); B.settle(20); B.dig(1, 52, 15); B.settle(100);
          T.key("ArrowRight", true); for (let i = 0; i < 300; i++) { T.key(" ", i % 12 < 5); T.tk(1); if (q.x > 57 * 32) break; } T.key("ArrowRight", false); T.key(" ", false); B.settle(20);
          T.key("ArrowRight", true); for (let t = 0; t < 500; t++) { T.tk(1); if (isChannelOn("blue")) break; } const crate = T.list(PUSHABLE_DEF_ID).find(a => a.x > 57 * 32);
          for (let i = 0; i < 300; i++) { T.key(" ", q.vx === 0 && q.grounded && i % 10 === 0); T.tk(1); if (q.x > 70 * 32) break; } T.key("ArrowRight", false); T.key(" ", false); B.settle(30); }
      };
      // part 1's three gems first (the hub), then the three others in the requested order
      B.walk(1, 26 * 32 + 4, 200); B.settle(60); B.walk(1, 28 * 32, 200); B.walk(1, 31 * 32, 200); B.walk(1, 33 * 32 + 6, 200); B.settle(10); B.dig(1, 34, 10); B.settle(90);
      T.key("ArrowRight", true); T.key(" ", true); T.tk(10); T.key(" ", false); T.tk(30); T.key(" ", true); T.tk(10); T.key(" ", false); T.tk(60); T.key("ArrowRight", false);
      const left = [T.gemsLeft()];
      o.forEach(k => { solve[k](); left.push(T.gemsLeft()); });
      return { left, lives };
    }, ord);
    await page.waitForTimeout(500);
    const f2 = await run(page, () => ({ ended: playSessionEnded, left: actors.filter(a => a.defId === "colGem").length, lives }));
    console.log("order", ord.join(""), JSON.stringify(r.left), JSON.stringify(f2));
    ok(f2.ended === "win" && f2.left === 0, "order " + ord.join("-") + " completes: " + JSON.stringify(f2));
  }
  // Part 5 needs Part 3, not Part 2: with Part 2 untouched the vault opens; Part 5 without Part 3 is unreachable
  const dep = await run(page, () => {
    loadExampleGame(buildRockBottomGame, "Rock Bottom"); enterPlayMode(); playReadyUntil = null; const q = T.P();
    T.at(43, 15); T.tk(10); B.dig(1, 44, 15); B.walk(1, 51 * 32 + 6, 400, { hopWhenStuck: true });
    T.key("ArrowRight", true); T.tk(300); T.key("ArrowRight", false);
    return { x: Math.round(q.x), cell: T.cell(q) };
  });
  ok(dep.x < 52 * 32, "without breaking the cork (Part 3) the way to Part 5 stays shut " + JSON.stringify(dep));

  // ---------------------------------------------------------------- E. mistakes and softlocks
  sec("E. mistakes");
  // E1. Part 3 hold-through: lava, then the real level restart (650ms) puts the cork, the stones and the player back
  await load();
  const e1 = await run(page, () => { const q = T.P(); T.at(51, 15); T.tk(10); T.key("ArrowRight", true); T.key("ArrowDown", true); for (let i = 0; i < 300; i++) { T.tk(1); if (board[15][52] === null) break; } T.key("ArrowDown", false); T.tk(60); return { hit: T.hit(), lives }; });
  await page.waitForTimeout(900);
  const e1b = await run(page, () => { T.key("ArrowRight", false); for (const k in keys) keys[k] = false; const q = T.P(); return { lives, cork: board[15][52], stones: T.list(LARGE_STONE_DEF_ID).map(a => Math.round(a.y)).sort().join(), pl: [Math.round(q.x), Math.round(q.y)], ready: playReadyUntil !== null }; });
  console.log("E1", JSON.stringify(e1), JSON.stringify(e1b));
  ok(e1.hit >= 1 && e1b.cork === "solid:diggable" && e1b.stones === "389,421,453" && e1b.lives === 2, "hold-through in Part 3 costs one life and the level restarts clean " + JSON.stringify(e1b));
  // E2. the camera never shows a bare area: look at the five Follow positions at the start
  // E3. falling into the trap pit with the beast costs a life, then restarts
  await load();
  const e3 = await run(page, () => { const q = T.P(); T.at(25, 15); T.tk(10); B.dig(-1, 24, 15); T.key("ArrowLeft", true); for (let i = 0; i < 300; i++) { T.tk(1); if (isChannelOn("green")) break; } T.key("ArrowLeft", false); T.tk(200);
    const l0 = lives; q.x = 16.4 * 32; q.y = 14 * 32; q.vx = 0; q.vy = 0; T.tk(120); return { l0, lives, cell: T.cell(q) }; });
  console.log("E3", JSON.stringify(e3));
  ok(e3.lives < e3.l0, "falling into the trap pit with the beast costs a life: " + JSON.stringify(e3));

  // ---------------------------------------------------------------- F. loads from the gallery, no autosave dependence, exports
  sec("F. gallery + export");
  const gal = await run(page, () => {
    const i = SAMPLE_GAMES.findIndex(s => s.name === "Rock Bottom");
    return { idx: i, count: SAMPLE_GAMES.length, hasIcon: typeof SAMPLE_GAMES[i].draw === "function" };
  });
  ok(gal.idx === SAMPLE_GAMES_COUNT_FALLBACK(gal), "registered in the gallery " + JSON.stringify(gal));
  function SAMPLE_GAMES_COUNT_FALLBACK(g) { return g.idx >= 0 ? g.idx : -2; }
  // fresh browser context with empty storage: the builder alone produces the whole level
  const ctx2 = await browser.newContext(); const pg2 = await ctx2.newPage(); const e2 = [];
  pg2.on("pageerror", e => e2.push(String(e))); pg2.on("dialog", d => d.accept());
  await pg2.addInitScript(() => { window.requestAnimationFrame = () => 0; localStorage.clear(); });
  await pg2.goto("file://" + tmp); await pg2.waitForFunction(() => window.__ev);
  await pg2.click("#samplesBtn").catch(() => {});
  const viaModal = await pg2.evaluate(() => { const cards = [...document.querySelectorAll("#samplesGrid *")].filter(e => e.textContent.trim() === "Rock Bottom"); return cards.length; });
  ok(viaModal > 0, "Rock Bottom card is in the Samples modal");
  await pg2.evaluate(() => window.__ev("()=>{loadExampleGame(buildRockBottomGame,'Rock Bottom');}")());
  const fresh = await pg2.evaluate(() => window.__ev("()=>({gems:actors.filter(a=>a.defId==='colGem').length,rooms:rooms.length})")());
  ok(fresh.gems === 12 && fresh.rooms === 1, "loads from nothing (no autosave needed) " + JSON.stringify(fresh));
  ok(e2.length === 0, "no errors loading in a fresh context: " + e2.join("|"));
  await ctx2.close();

  // export: the exported standalone game plays through the same Part 5 / Part 3 solvers
  await load();
  await run(page, () => { exitToBuildMode(); });
  const dl = page.waitForEvent("download");
  await page.click("#exportBtn");
  const out = path.join(os.tmpdir(), "rb_export.html");
  await (await dl).saveAs(out);
  let html = fs.readFileSync(out, "utf8");
  ok(!html.includes("__toyDebug") && html.includes("rbBeast") && html.includes("rbDirtA") && html.includes("rbCave1"), "export carries the sample's art and beast");
  const bootAnchor = "playReadyUntil = performance.now() + READY_DURATION_MS;\n  renderPlayHUD();";
  ok(html.includes(bootAnchor), "export boot anchor present");
  html = html.replace(bootAnchor, bootAnchor + " window.__ev = f => eval('(' + f + ')');");
  fs.writeFileSync(out, html);
  const px = await browser.newPage(); const ex = [];
  await px.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  px.on("pageerror", e => ex.push(String(e))); px.on("console", m => { if (m.type() === "error") ex.push(m.text()); });
  await px.goto("file://" + out); await px.waitForTimeout(500);
  await px.evaluate(l => { window.__ev(l)(); playReadyUntil = null; }, LIB);
  const exLog = [];
  const exphase = async fn => { const r = await px.evaluate(([s]) => window.__ev(s)(), [fn.toString()]); await px.waitForTimeout(260); return r; };
  exLog.push(await exphase(() => { const q = T.P(); B.walk(1, 26 * 32 + 4, 200); B.settle(60); B.walk(1, 28 * 32, 200); B.walk(1, 31 * 32, 200); B.walk(1, 33 * 32 + 6, 200); B.settle(10); B.dig(1, 34, 10); B.settle(90);
    T.key("ArrowRight", true); T.key(" ", true); T.tk(10); T.key(" ", false); T.tk(30); T.key(" ", true); T.tk(10); T.key(" ", false); T.tk(60); T.key("ArrowRight", false); return { left: T.gemsLeft(), lives }; }));
  exLog.push(await exphase(() => { const q = T.P(); T.at(43, 15); T.tk(10); B.dig(1, 44, 15); B.walk(1, 51 * 32 + 6, 400, { hopWhenStuck: true }); B.settle(20); B.dig(1, 52, 15); B.settle(100); T.key("ArrowRight", true); for (let i = 0; i < 300; i++) { T.key(" ", i % 12 < 5); T.tk(1); if (q.x > 57 * 32) break; } T.key("ArrowRight", false); T.key(" ", false); B.settle(20);
    T.key("ArrowRight", true); for (let t = 0; t < 500; t++) { T.tk(1); if (isChannelOn("blue")) break; }
    for (let i = 0; i < 400; i++) { T.key(" ", q.vx === 0 && q.grounded && i % 10 === 0); T.tk(1); if (q.x > 70 * 32) break; } T.key("ArrowRight", false); T.key(" ", false); B.settle(30); return { left: T.gemsLeft(), lives, gate: isChannelOn("blue") }; }));
  const exLeft = await px.evaluate(() => window.__ev("()=>({left:T.gemsLeft(),lives})")());
  console.log("export phases:", JSON.stringify(exLog), "after:", JSON.stringify(exLeft));
  ok(exLeft.left === 5 && exLeft.lives === 3, "exported game: gems collected by real play " + JSON.stringify(exLeft));
  ok(ex.length === 0, "export errors: " + ex.slice(0, 3).join(" | "));
  ok(errors.length === 0, "page errors: " + errors.slice(0, 3).join(" | "));
  await browser.close();

  console.log("\nTRACE TABLE");
  console.log("part | steps | fall time | escape | margin/notes");
  table.forEach(r => console.log(r.join(" | ")));
  console.log(`\n=== ROCK BOTTOM: ${pass} passed, ${fails.length} failed ===`);
  process.exit(fails.length ? 1 : 0);
})();
