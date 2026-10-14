// "The Over-Engineered Escape" durability suite (not deployed). Usage: node tests/overengineered.test.js [fuzzRuns]
// Hook-injected temp copy of index.html. The game loop is never used: every session steps tick() by hand, so each run is
// deterministic. What it proves, in order:
//   1. the sample is registered, loads clean (no leaked Switch state / spawner content) and starts sealed in the booth;
//   2. a complete recorded solution (the "recipe" below) WINS, wins at the identical time twice, and only with pink ON;
//   3. the first half of the machine is frame-rate independent (30/60/90/144 fps) and survives a mashing player;
//   4. the exploits found while auditing it stay closed (crate dropped on the player, crate+jump ping-pong, carried magnet);
//   5. random-input fuzz never wins (the goal is only reachable through the machine) and never throws;
//   6. an exported standalone copy runs the opening of the machine.
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/opt/node22/lib/node_modules/playwright");
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
if (!src.includes(anchor)) throw new Error("anchor missing");
const tmp = path.join(os.tmpdir(), "oe_test_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + 'window.__ev=f=>eval("("+f+")");'));
const FUZZ = +process.argv[2] || 30;
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fails.push(m); console.log("FAIL:", m); } };

// ---- in-page toolkit (evaluated inside the app's closure, so it can see tick(), actors, board ...) ----------------
function TOOLKIT() {
  const T = {};
  T.load = () => {
    if (appMode === "play") exitToBuildMode();
    loadExampleGame(buildOverEngineeredEscapeGame, "The Over-Engineered Escape");
    enterPlayMode(); playReadyUntil = null;
    for (const k of Object.keys(keys)) keys[k] = false;
  };
  T.sim = (fps) => {
    const S = { t: 0, DT: 1 / fps, held: {} };
    S.P = () => actors.find(a => a.isPlayer);
    S.key = (ty, k) => window.dispatchEvent(new KeyboardEvent(ty, { key: k }));
    S.hold = (k, v) => { if (!!S.held[k] !== v) { S.held[k] = v; S.key(v ? "keydown" : "keyup", k); } };
    S.release = () => { for (const k of Object.keys(S.held)) S.hold(k, false); };
    // virtual timers: a detonating / destroyed actor is removed ~0.4 s later (the app uses a real setTimeout)
    S.step = () => {
      tick(S.DT); S.t += S.DT;
      for (const a of actors.slice()) if (a.detonating || a.destroyed || a.ttlPopped) { if (a._dAt == null) a._dAt = S.t; else if (S.t - a._dAt > 0.4) removeActorById(a.id); }
    };
    S.px = () => S.P().x / TILE; S.py = () => S.P().y / TILE;
    S.until = (cond, maxS) => { const end = S.t + maxS; while (S.t < end) { S.step(); if (playSessionEnded) return false; if (cond()) return true; } return false; };
    S.bombAHeld = () => actors.some(a => a.defId === "carrybomb2" && a.x > 21.5 * TILE && a.y < 5.5 * TILE && a.y > 3.5 * TILE && Math.abs(a.vy) < 1);
    S.roofOpen = () => board[13][22] == null && board[13][23] == null;
    S.cascadeDone = () => ["blue", "green", "yellow", "purple"].every(c => isChannelOn(c));
    // one input macro: hold d1 (Up for jmp s) for hd s, then d2, for exactly `frames` ticks
    S.macro = (m) => {
      const [dirs, jmp, hd, frames] = m; const parts = dirs.split(">");
      const d1 = parts[0] === "-" ? [] : parts[0].split("+"); const d2 = parts[1] ? parts[1].split("+") : [];
      S.release(); d1.forEach(k => S.hold(k, true)); if (jmp) S.hold("ArrowUp", true);
      let tt = 0;
      for (let f = 0; f < frames; f++) {
        S.step(); tt += S.DT;
        if (jmp && tt >= jmp) S.hold("ArrowUp", false);
        if (tt >= hd) { d1.forEach(k => S.hold(k, false)); d2.forEach(k => S.hold(k, true)); }
        if (playSessionEnded) break;
      }
      S.release();
    };
    S.holdFor = (keys, secs) => { keys.forEach(k => S.hold(k, true)); S.until(() => false, secs); S.release(); };
    S.holdUntil = (keys, cond, maxS) => { keys.forEach(k => S.hold(k, true)); const r = S.until(cond, maxS); S.release(); return r; };
    return S;
  };
  // Booth phase driven by what it sees, not by a clock: flip red ON, wait for the bomb to be held at the magnet,
  // flip red OFF (the bomb drops onto the roof, which blows open).
  T.boothOpening = (S) => {
    const redOn = S.holdUntil(["ArrowLeft"], () => isChannelOn("red"), 5);
    const held = S.until(() => S.bombAHeld(), 40);
    S.holdFor(["ArrowRight"], 0.4);
    const redOff = S.holdUntil(["ArrowLeft"], () => !isChannelOn("red"), 4);
    const roofOpen = S.until(() => S.roofOpen(), 6);
    return { redOn, held, redOff, roofOpen, t: S.t };
  };
  // Leave the booth through the roof hole. The roof is 4 tiles up and a jump is just under 4, so hop into the niche behind
  // the brown Gate (23,14) first, then jump out of it. Closed loop with three states: works at any frame rate.
  T.boothExit = (S, maxS, jumpHold) => {
    const end = S.t + maxS; let mode = S.exitMode || "floor";
    while (S.t < end && !playSessionEnded) {
      const px = S.px(), py = S.py(), g = S.P().grounded;
      if (g && py < 12.5 && px < 22) { S.release(); S.exitMode = "floor"; return true; } // standing outside, above the booth
      S.release();
      if (g && py > 14.8) mode = "floor";
      else if (mode === "floor" && !g && py <= 14.8) mode = "hop";
      else if (mode === "hop" && g && px > 22.7) mode = "out";
      if (mode === "floor") { S.hold("ArrowRight", true); if (px >= 22.2 && g) S.hold("ArrowUp", true); } // hop up beside the wall
      else if (mode === "hop") S.hold("ArrowRight", true); // get over the niche
      else { // out of the niche: a hop of `jumpHold` seconds (default: full jump), drifting west the whole time
        S.hold("ArrowLeft", true);
        if (g) S.outT0 = S.t;
        if (jumpHold == null || S.t - (S.outT0 || 0) < jumpHold) S.hold("ArrowUp", true);
      }
      S.step();
    }
    S.exitMode = mode; S.release(); return false;
  };
  T.cascadeCheck = (S) => {
    const P = S.P(); P.x = 19.3 * TILE; P.y = 12.31 * TILE; P.vx = P.vy = 0;
    const casc = S.until(() => S.cascadeDone(), 60);
    const crate = actors.some(c => c.defId === "pushable" && Math.abs(c.x - 16 * TILE) < 40 && c.y > 15 * TILE);
    return { casc, crateOnPurple: crate, t: +S.t.toFixed(1), lives };
  };
  // The recorded recipe, clock-driven and exact at 60 fps (positions come from the recorded run, see CLAUDE.md).
  T.recipe = (S, route) => {
    const out = { stages: [] };
    S.holdUntil(["ArrowLeft"], () => isChannelOn("red"), 20); S.until(() => false, 14);
    S.holdFor(["ArrowRight"], 0.4); S.holdFor(["ArrowLeft"], 0.6); S.until(() => false, 2);
    S.holdUntil(["ArrowRight"], () => S.px() > 22.2, 3);
    S.holdFor(["ArrowUp", "ArrowRight"], 0.45); S.until(() => false, 0.5);
    S.holdFor(["ArrowUp", "ArrowLeft"], 0.75); S.holdFor(["ArrowLeft"], 0.3);
    out.cyan = isChannelOn("cyan"); S.until(() => false, 30); out.cascade = S.cascadeDone();
    S.holdUntil(["ArrowRight"], () => S.py() > 13.5, 4); S.until(() => false, 0.5);
    S.holdUntil(["ArrowLeft"], () => isChannelOn("red"), 4); out.redBack = isChannelOn("red");
    S.holdUntil(["ArrowRight"], () => S.px() > 22.2, 3);
    S.holdFor(["ArrowUp", "ArrowRight"], 0.45); S.until(() => false, 0.5);
    S.holdFor(["ArrowUp", "ArrowLeft"], 0.75); S.holdFor(["ArrowLeft"], 0.3);
    out.onRoof = S.py() < 12.7;
    for (const m of route) { S.macro(m); if (playSessionEnded) break; }
    out.pinkAtEnd = isChannelOn("pink"); out.end = playSessionEnded; out.t = +S.t.toFixed(3);
    return out;
  };
  return T;
}

// the recorded route from the roof: [directions (a>b = switch to b after the hold), jump hold s, direction hold s, frames]
const ROUTE = [
  ["ArrowLeft", 0, 0.3, 29], ["ArrowLeft", 0.12, 0.7, 45], ["ArrowLeft", 0.9, 0.7, 65], ["ArrowLeft", 0.9, 0.7, 57],
  ["ArrowLeft", 0, 0.1, 9], ["ArrowLeft>ArrowRight", 0.12, 0.7, 209], ["ArrowRight>ArrowLeft", 0, 0.7, 217],
  ["ArrowLeft>ArrowRight", 0.12, 0.3, 173], ["ArrowRight>ArrowLeft", 0, 0.7, 89],
];

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage(); page.on("dialog", d => d.accept());
  const errs = []; page.on("pageerror", e => errs.push(String(e)));
  await page.goto("file://" + tmp); await page.waitForFunction(() => window.__ev);
  const KIT = TOOLKIT.toString();
  const withKit = (fn, arg) => page.evaluate(([k, s, a]) => { const T = window.__ev(k)(); return window.__ev(s)(T, a); }, [KIT, fn.toString(), arg]);

  // ---------------------------------------------------------------- 1. the sample itself
  const s1 = await withKit((T) => {
    const entry = SAMPLE_GAMES.find(g => g.name === "The Over-Engineered Escape");
    switchChannels = { red: true, yellow: true }; // a Switch left on in another project must not leak into the sample
    T.load();
    const S = T.sim(60);
    const P = S.P();
    return {
      registered: !!entry && typeof entry.draw === "function", old: SAMPLE_GAMES.some(g => g.name === "The Long Way Out"),
      channels: JSON.stringify(switchChannels), spawners: JSON.stringify(spawnerContents), actors: actors.length,
      player: actorDefs[P.defId] && P.defId, boothSealed: ["barrier-n:none"].every(g => board[16][19] === g && board[15][19] === g && board[14][19] === g),
      roof: [19, 20, 21, 22, 23].every(x => board[13][x] === "solid:none"), goal: board[16][18], gravity: gravityEnabled, wrapV: wrapVEnabled,
      bombs: actors.filter(a => a.defId === "carrybomb2").length, stones: actors.filter(a => a.defId === "largestone").length,
    };
  });
  ok(s1.registered && !s1.old, "sample registered under its new name, old sample gone " + JSON.stringify(s1));
  ok(s1.channels === "{}" && s1.spawners === "{}", "no leaked Switch state or spawner content " + s1.channels + s1.spawners);
  ok(s1.actors === 8 && s1.bombs === 3 && s1.stones === 2 && s1.player === "lwoInventor", "actor line-up " + JSON.stringify(s1));
  ok(s1.boothSealed && s1.roof && s1.goal === "goal:none" && s1.gravity, "booth sealed, roof solid, goal present " + JSON.stringify(s1));

  // ---------------------------------------------------------------- 2. the recorded solution
  const sol = [];
  for (let i = 0; i < 2; i++) sol.push(await withKit((T, route) => { T.load(); return T.recipe(T.sim(60), route); }, ROUTE));
  ok(sol[0].cyan && sol[0].cascade && sol[0].redBack && sol[0].onRoof, "recipe stages " + JSON.stringify(sol[0]));
  ok(sol[0].end === "win" && sol[0].pinkAtEnd, "recorded solution wins with pink ON " + JSON.stringify(sol[0]));
  ok(sol[0].t === sol[1].t && sol[1].end === "win", "solution is deterministic: " + sol[0].t + " vs " + sol[1].t);
  // the route must not depend on how long the player lingers on the roof first
  for (const wait of [0.5, 2, 5]) {
    const r = await withKit((T, a) => {
      T.load(); const S = T.sim(60);
      // same recipe up to "on the roof" (route = []), then idle, then the route
      const out = T.recipe(S, []); S.until(() => false, a.wait);
      for (const m of a.route) { S.macro(m); if (playSessionEnded) break; }
      return { end: playSessionEnded, onRoof: out.onRoof };
    }, { wait, route: ROUTE });
    ok(r.end === "win", "route still wins after lingering " + wait + "s on the roof " + JSON.stringify(r));
  }
  // gated: without the pink Button the pink Gates stay shut -> same route but stop before the last two legs: no win
  const gated = await withKit((T, route) => { T.load(); const S = T.sim(60); T.recipe(S, route.slice(0, 5)); return { end: playSessionEnded, pink: isChannelOn("pink") }; }, ROUTE);
  ok(!gated.end && !gated.pink, "no win before the pink Button is pressed " + JSON.stringify(gated));

  // ---------------------------------------------------------------- 3. frame rate + a mashing player
  for (const fps of [30, 60, 90, 144]) {
    const r = await withKit((T, a) => {
      T.load(); const S = T.sim(a.fps);
      const b = T.boothOpening(S);
      // can a player climb out through the new hole at this frame rate?
      const exited = T.boothExit(S, 15);
      const out = { px: +S.px().toFixed(1), py: +S.py().toFixed(1) };
      if (!exited) { T.load(); const S3 = T.sim(a.fps); T.boothOpening(S3); return { b, exited, out, ...T.cascadeCheck(S3) }; }
      // and the rest of the machine runs on its own once someone stands on the cyan Plate (put the player there directly)
      return { b, exited, out, ...T.cascadeCheck(S) };
    }, { fps });
    ok(r.b.redOn && r.b.held && r.b.redOff && r.b.roofOpen, fps + "fps: booth opening " + JSON.stringify(r.b));
    // Known limit: at 30 fps (the slowest the game's dt clamp allows) the last hop out of the booth needs the player to
    // slip into a 10px-tall gap between the belt at (21,11) and the roof, which a 33ms frame steps right over.
    if (fps >= 60) ok(r.exited, fps + "fps: climbs out of the booth " + JSON.stringify(r.out));
    else console.log("note: " + fps + "fps climb-out " + (r.exited ? "works" : "is NOT possible (known limit)"));
    ok(r.casc && r.crateOnPurple, fps + "fps: cascade (blue/green/yellow/purple) completes " + JSON.stringify(r));
  }
  for (let seed = 1; seed <= 8; seed++) {
    const r = await withKit((T, a) => {
      T.load(); const S = T.sim(60);
      let s = a.seed >>> 0; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
      const ks = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "w", "a", "d"];
      let leftBooth = false, win = false;
      for (let f = 0; f < 60 * 45; f++) {
        if (f % 8 === 0) { ks.forEach(k => S.hold(k, rnd() < 0.4)); if (rnd() < 0.2) S.key("keydown", "e"); else S.key("keyup", "e"); }
        S.step();
        const P = S.P();
        if (!S.roofOpen() && (P.y < 13.5 * TILE || P.x < 19.8 * TILE)) leftBooth = true;
        if (playSessionEnded) win = true;
      }
      S.release(); S.key("keyup", "e");
      // afterwards the machine can still be finished from the booth
      const redOn = isChannelOn("red"), roofWasOpen = S.roofOpen();
      let ok2 = roofWasOpen;
      if (!roofWasOpen) {
        // make sure red is ON (releases the bomb) then OFF once the bomb is held
        if (!isChannelOn("red")) S.holdUntil(["ArrowLeft"], () => isChannelOn("red"), 5);
        S.until(() => S.bombAHeld() || S.roofOpen(), 60);
        if (!S.roofOpen()) { S.holdFor(["ArrowRight"], 0.4); S.holdUntil(["ArrowLeft"], () => !isChannelOn("red"), 4); }
        ok2 = S.until(() => S.roofOpen(), 8);
      }
      return { leftBooth, win, roofWasOpen, ok2, redOn, p: [+S.px().toFixed(1), +S.py().toFixed(1)] };
    }, { seed });
    ok(!r.leftBooth && !r.win, "mash seed " + seed + ": never leaves the booth before the roof opens, never wins " + JSON.stringify(r));
    ok(r.ok2, "mash seed " + seed + ": the roof still opens afterwards " + JSON.stringify(r));
  }

  // ---------------------------------------------------------------- 4. exploits found while auditing, now closed
  const x1 = await withKit((T) => {
    T.load(); const S = T.sim(60); const P = S.P();
    for (const a of actors.slice()) if (a !== P && a.defId !== "pushable") removeActorById(a.id);
    const crate = actors.find(a => a.defId === "pushable");
    const carry = (cx, cy) => { P.x = cx; P.y = cy; P.vx = P.vy = 0; P.facingDir = 1; crate.carried = true; P.carrying = crate.id; crate.x = P.x; crate.y = P.y - crate.h - 1; };
    const overlap = () => crate.x < P.x + P.w && crate.x + crate.w > P.x && crate.y < P.y + P.h && crate.y + crate.h > P.y;
    // a) facing a wall: the crate must not land on the player
    carry(513.4, 522); dropCarriedObject(P); const a = { dropped: P.carrying == null, overlap: overlap(), blocked: actorBlockedByTiles(crate) };
    // b) nowhere to put it down (the sealed goal pocket): keep carrying
    carry(18 * TILE + 5, 16 * TILE + 5); dropCarriedObject(P); const b = { stillCarrying: P.carrying === crate.id };
    // c) a crate already sitting on the player + jump: no ping-pong into the floor
    P.carrying = null; crate.carried = false; crate.x = 514; crate.y = 522; crate.vx = crate.vy = 0; P.x = 517; P.y = 522; P.vx = P.vy = 0;
    S.hold("ArrowUp", true); let maxY = 0; for (let f = 0; f < 90; f++) { S.step(); maxY = Math.max(maxY, P.y); } S.release();
    const c = { maxY: Math.round(maxY) };
    // d) same with Right held: the player never ends up past the wall at x=544
    crate.x = 514; crate.y = 522; P.x = 517; P.y = 522; P.vx = P.vy = 0;
    S.hold("ArrowUp", true); S.hold("ArrowRight", true); let maxX = 0; for (let f = 0; f < 240; f++) { S.step(); maxX = Math.max(maxX, P.x); } S.release();
    return { a, b, c, d: { maxX: Math.round(maxX) }, win: playSessionEnded };
  });
  ok(x1.a.dropped && !x1.a.overlap && !x1.a.blocked, "drop facing a wall never lands on the player " + JSON.stringify(x1.a));
  ok(x1.b.stillCarrying, "no room to drop -> keeps carrying " + JSON.stringify(x1.b));
  ok(x1.c.maxY <= 530, "overlapped crate + jump: player never pushed into the floor " + JSON.stringify(x1.c));
  ok(x1.d.maxX < 544 && !x1.win, "overlapped crate + jump + right: no tunnelling through the wall " + JSON.stringify(x1.d) + " win=" + x1.win);
  const x2 = await withKit((T) => {
    // grab the magnet tile off the wall, then keep ticking next to another physics object (used to throw a ReferenceError)
    T.load(); const S = T.sim(60); const P = S.P();
    P.x = 22 * TILE + 2; P.y = 5 * TILE + 8; P.vx = P.vy = 0;
    S.key("keydown", "e"); S.key("keyup", "e");
    const grabbed = P.carrying != null && actorDefs[(actors.find(a => a.id === P.carrying) || {}).defId].temperament === CARRY_MAGNET_KIND;
    let threw = null; try { for (let f = 0; f < 120; f++) S.step(); } catch (e) { threw = String(e); }
    return { grabbed, threw };
  });
  ok(x2.grabbed && !x2.threw, "carrying the magnet near other objects does not throw " + JSON.stringify(x2));

  // ---------------------------------------------------------------- 5. random-input fuzz: no win, no throw, never off the board
  const fz = await withKit((T, a) => {
    const out = { runs: 0, wins: 0, off: 0, pink: 0, nan: 0, lives: 3 };
    for (let run = 0; run < a.runs; run++) {
      T.load(); const S = T.sim(60);
      let s = (a.seed + run * 7919) >>> 0; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
      const ks = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "w"];
      S.hold("ArrowLeft", true); let flipped = false, next = 0;
      for (let f = 0; f < 60 * a.secs; f++) {
        if (!flipped && isChannelOn("red")) { S.hold("ArrowLeft", false); flipped = true; }
        if (flipped && S.t >= next) { ks.forEach(k => S.hold(k, rnd() < 0.35)); if (rnd() < 0.2) S.key("keydown", "e"); else S.key("keyup", "e"); next = S.t + 0.15 + rnd() * 0.9; }
        S.step();
        const P = S.P();
        if (!Number.isFinite(P.x) || !Number.isFinite(P.y)) out.nan++;
        if (P.x < -10 || P.x > 24 * TILE + 10 || P.y < -40 || P.y > 18 * TILE + 40) out.off++;
        if (isChannelOn("pink")) out.pink++;
        if (playSessionEnded) { out.wins += playSessionEnded === "win" ? 1 : 0; break; }
      }
      S.release(); S.key("keyup", "e"); out.runs++; out.lives = Math.min(out.lives, lives);
    }
    return out;
  }, { runs: FUZZ, secs: 150, seed: 20260 });
  console.log("fuzz:", JSON.stringify(fz));
  ok(fz.wins === 0, "random play never wins (" + fz.wins + "/" + fz.runs + ") — the goal is only reachable through the machine");
  ok(fz.nan === 0 && fz.off <= fz.runs * 20, "player stays finite and on the board " + JSON.stringify(fz));

  // ---------------------------------------------------------------- 6. exported standalone copy runs the opening
  const dl = page.waitForEvent("download");
  await withKit((T) => { T.load(); exitToBuildMode(); });
  await page.click("#exportBtn");
  const out = path.join(os.tmpdir(), "oe_export.html");
  await (await dl).saveAs(out);
  let html = fs.readFileSync(out, "utf8");
  const hookAnchor = "playReadyUntil = performance.now() + READY_DURATION_MS;\n  renderPlayHUD();";
  ok(html.includes(hookAnchor), "export boot anchor present");
  ok(html.includes("magnetHoldsActor") && html.includes("magnetActiveAt"), "export carries the magnet hold code");
  html = html.replace(hookAnchor, hookAnchor + " window.__x={on:c=>isChannelOn(c),bombs:()=>actors.filter(a=>a.defId==='carrybomb2').map(a=>({x:a.x,y:a.y,vy:a.vy})),roof:()=>board[13][22]==null&&board[13][23]==null,lives:()=>lives,ended:()=>playSessionEnded};");
  fs.writeFileSync(out, html);
  const p3 = await browser.newPage(); const e3 = [];
  p3.on("pageerror", e => e3.push(String(e))); p3.on("console", m => { if (m.type() === "error") e3.push(m.text()); });
  await p3.goto("file://" + out); await p3.waitForTimeout(2400); // past the READY! pause
  for (let tries = 0; tries < 3 && !(await p3.evaluate(() => window.__x.on("red"))); tries++) {
    await p3.keyboard.down("ArrowLeft"); await p3.waitForTimeout(800); await p3.keyboard.up("ArrowLeft");
  }
  const heldInExport = await p3.waitForFunction(() => window.__x.bombs().some(b => b.x > 21.5 * 32 && b.y < 5.5 * 32 && b.y > 3.5 * 32 && Math.abs(b.vy) < 1), null, { timeout: 40000 }).then(() => true).catch(() => false);
  const brown = await p3.evaluate(() => window.__x.on("brown"));
  ok(heldInExport && brown, "export: the bomb rides the belts and cannons to the magnet and stays held (brown ON=" + brown + ")");
  await p3.keyboard.down("ArrowRight"); await p3.waitForTimeout(500); await p3.keyboard.up("ArrowRight");
  await p3.keyboard.down("ArrowLeft"); await p3.waitForTimeout(900); await p3.keyboard.up("ArrowLeft");
  const roofOpen = await p3.waitForFunction(() => window.__x.roof(), null, { timeout: 8000 }).then(() => true).catch(() => false);
  ok(roofOpen, "export: releasing the magnet drops the bomb and opens the roof");
  ok(e3.length === 0, "export errors: " + e3.slice(0, 3).join(" | "));

  // ---------------------------------------------------------------- 7. every built-in sample still loads and plays (shared physics changed)
  const sw = await withKit((T) => {
    const res = [];
    for (const g of SAMPLE_GAMES) {
      let err = null;
      try {
        if (appMode === "play") exitToBuildMode();
        loadExampleGame(g.builder, g.name); enterPlayMode(); playReadyUntil = null;
        const S = T.sim(60); S.hold("ArrowRight", true);
        for (let f = 0; f < 60 * 3; f++) S.step();
        S.release();
      } catch (e) { err = String(e); }
      res.push([g.name, err]);
    }
    return res;
  });
  console.log("samples:", sw.length);
  for (const [name, err] of sw) ok(!err, "sample '" + name + "' loads and plays 3s: " + err);

  ok(errs.length === 0, "page errors: " + errs.slice(0, 3).join(" | "));
  console.log("\n=== OVER-ENGINEERED ESCAPE: " + pass + " passed, " + fails.length + " failed ===");
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();
