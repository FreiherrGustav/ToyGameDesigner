// Cloud Hopper: a bot that plays the sample from the first frame to the flag, and a fall test from every platform.
// usage: node tests/cloudhopper.bot.js [html] [fps list, default 30,60,144] [mode: full|fall|both]
// The bot sets the same key state the keyboard handlers set (keys[...]) and steps tick() by hand (requestAnimationFrame
// disabled), so a run is deterministic. It has no map knowledge beyond which platform it stands on: it walks to a takeoff x,
// jumps, steers toward the next platform and lets go, like a kid would; if a jump misses it simply starts again from wherever it lands.
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const fs = require("fs"), path = require("path"), os = require("os");
const html = path.resolve(process.argv[2] && process.argv[2] !== "-" ? process.argv[2] : path.join(__dirname, "..", "index.html"));
const fpsList = (process.argv[3] || "30,60,144").split(",").map(Number);
const mode = process.argv[4] || "both";
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const DRIVER = `window.__bot = (FPS) => {
  const dt = 1 / FPS; let frames = 0; const step = n => { for (let i = 0; i < n; i++) { tick(dt); frames++; } };
  const P = () => actors.find(a => a.isPlayer);
  const K = (k, v) => { keys[k] = v; };
  const release = () => { K("ArrowLeft", false); K("ArrowRight", false); K(" ", false); };
  const roomIdx = () => rooms.findIndex(r => r.id === currentRoomId);
  const stats = { hops: 0, misses: 0, walked: 0, rooms: [], mpTries: 0 };
  const done = () => playSessionEnded;
  function walkTo(px, tol) {
    tol = tol || 3;
    for (let n = 0; n < FPS * 12 && !done(); n++) {
      const p = P(), d = px - p.x, vel = p.vx, stop = vel * Math.abs(vel) / (2 * 1700), err = d - stop;
      K("ArrowLeft", false); K("ArrowRight", false);
      if (Math.abs(d) <= tol && Math.abs(vel) < 25) break;
      if (err > 1.5) K("ArrowRight", true); else if (err < -1.5) K("ArrowLeft", true);
      const x0 = p.x; step(1); stats.walked += Math.abs(p.x - x0);
      if (!p.grounded) { release(); return false; }
    }
    release(); return true;
  }
  // jump toward dir, hold the direction until until(p) says stop, then coast to the landing
  function hop(dir, until) {
    const p = P(), key = dir > 0 ? "ArrowRight" : "ArrowLeft"; stats.hops++;
    K(key, true); K(" ", true); step(2); K(" ", false);
    let air = false;
    for (let n = 0; n < FPS * 2 && !done(); n++) {
      if (until(p)) K(key, false);
      const x0 = p.x; step(1); stats.walked += Math.abs(p.x - x0);
      if (!p.grounded) air = true;
      if (air && p.grounded) break;
    }
    release(); step(Math.ceil(FPS * 0.25));
  }
  const ty = p => Math.round(p.y / 32 * 100) / 100, tx = p => p.x / 32;
  const near = (a, b) => Math.abs(a - b) < 0.2;
  const mp = () => actors.find(a => a.defId === MOVING_PLATFORM_DEF_ID);
  // one decision per call; returns false if nothing sensible to do (airborne)
  function act(room) {
    const p = P();
    if (!p.grounded) {                                                                            // bouncing in the pit: steer over to the big cloud, as the first time
      if (room === 1 && p.x / 32 > 8.4 && p.x / 32 < 14.2) { K("ArrowRight", true); step(1); if (P().x / 32 >= 14.2) release(); return; }
      step(1); return;
    }
    const y = ty(p), x = tx(p);
    if (room === 0) {
      if (near(y, 14.31) && x < 10) { walkTo(8.3 * 32); hop(1, q => q.x >= 13.2 * 32); }
      else if (y > 15.5) { walkTo(12.0 * 32); hop(1, q => q.x >= 13.2 * 32); }                   // in the dip: hop out to the right
      else if (near(y, 14.31) && x < 16.0) { walkTo(14.2 * 32); hop(1, q => q.x >= 16.4 * 32); }
      else if (near(y, 14.31)) { walkTo(14.2 * 32); }                                              // fell off a cloud: back to the foot of the steps
      else if (near(y, 12.31)) { walkTo(17.2 * 32); hop(1, q => q.x >= 19.5 * 32); }
      else if (near(y, 10.31)) { K("ArrowRight", true); step(Math.ceil(FPS * 0.6)); release(); }  // walk on into the door
      else step(1);
    } else if (room === 1) {
      const m = mp();
      if (near(y, 14.31) && x < 9) { K("ArrowRight", true); for (let n = 0; n < FPS * 3 && !done(); n++) { step(1); if (!P().grounded) break; }
        // dropped into the pit: ride the bounce and let go once over the cloud
        for (let n = 0; n < FPS * 3 && !done(); n++) { if (P().x >= 14.2 * 32) K("ArrowRight", false); step(1); if (P().grounded && n > 3 && P().y < 12 * 32) break; }
        release(); step(Math.ceil(FPS * 0.25)); }
      else if (near(y, 14.31) && x >= 10.2) { K("ArrowLeft", true); for (let n = 0; n < FPS * 3 && !done(); n++) { step(1); if (!P().grounded) break; }
        for (let n = 0; n < FPS * 3 && !done(); n++) { if (P().x >= 14.2 * 32 || P().vy < -400) K("ArrowLeft", false); if (P().vy < -300) K("ArrowRight", true); if (P().x >= 14.2 * 32) K("ArrowRight", false); step(1); if (P().grounded && n > 3 && P().y < 12 * 32) break; }
        release(); step(Math.ceil(FPS * 0.25)); }
      else if (near(y, 9.31) && x >= 12.6) {                                                      // on the big cloud: wait for the platform, then hop onto it
        walkTo(17.6 * 32);
        for (let n = 0; n < FPS * 12 && !done(); n++) {
          const dx = m.x - P().x;
          const lo = 40 + (stats.mpTries % 5) * 12;                                                // a kid varies the moment after a miss
          if (dx > lo && dx < lo + 60) { stats.mpTries++; hop(1, q => Math.abs((m.x + 11) - (q.x + 11)) < 10 + (stats.mpTries % 3) * 6); break; }
          step(1);
        }
      }
      else if (y > 7.2 && y < 7.8) {                                                              // riding the platform: hop to the ledge when it is on the left half
        for (let n = 0; n < FPS * 12 && !done(); n++) { if (m.x <= 19.2 * 32 && m.x >= 16 * 32) { hop(1, q => q.x >= 21.2 * 32); break; } step(1); }
      }
      else if (near(y, 5.31) && x >= 19.2) { K("ArrowRight", true); step(Math.ceil(FPS * 0.8)); release(); }
      else if (near(y, 12.31) || near(y, 10.31)) { K("ArrowLeft", true); step(Math.ceil(FPS * 1.2)); release(); }
      else if (near(y, 14.31)) { K("ArrowLeft", true); step(Math.ceil(FPS * 0.5)); release(); }
      else step(1);
    } else {
      if (near(y, 15.31)) { if (x < 3.0 || x > 3.6) walkTo(3.2 * 32); hop(1, q => q.x >= 4.5 * 32); }
      else if (near(y, 13.31) && x < 8) { walkTo(6.0 * 32); hop(1, q => q.x >= 8.7 * 32); }
      else if (near(y, 11.31) && x < 13) { walkTo(10.4 * 32); hop(1, q => q.x >= 14.2 * 32); }
      else if (near(y, 9.31) && x < 18) { walkTo(16.0 * 32); hop(1, q => q.x >= 18.2 * 32); }
      else if (near(y, 7.31) && x < 21.4) { walkTo(20.0 * 32); hop(1, q => q.x >= 21.3 * 32); }
      else if (near(y, 5.31)) { if (x > 22.8) walkTo(22.2 * 32); else { K("ArrowRight", true); step(Math.ceil(FPS * 0.8)); release(); } }   // the flag is at column 22: step back if we ran past it
      else if (near(y, 13.31) || near(y, 11.31)) { K("ArrowLeft", true); step(Math.ceil(FPS * 1.5)); release(); }  // a side-route cloud: drop back down
      else step(1);
    }
  }
  // run until the room changes or the run ends; returns seconds spent
  function playRoom(room, maxSec) {
    const start = frames;
    while (!done() && roomIdx() === room && frames - start < FPS * maxSec) { if (roomTransition) { advanceGameClock(dt); frames++; if (gameNow() - roomTransition.startedAt >= ROOM_TRANSITION_MS) roomTransition = null; continue; } if (window.__trace && window.__trace.length < 400) window.__trace.push([room, +((frames - start) / FPS).toFixed(1), +(P().x / 32).toFixed(2), +(P().y / 32).toFixed(2), P().grounded ? 1 : 0, mp() ? +(mp().x / 32).toFixed(1) : 0]); act(room); }
    return (frames - start) / FPS;
  }
  function setup(room, cx, cy) {
    const g = SAMPLE_GAMES.find(g => g.id === "cloud-hopper");
    loadExampleGame(g.builder, g.name, { skipConfirm: true });
    if (room !== 0 || cx != null) { activateRoom(rooms[room].id); removeAllPlayerInstances(); placeExampleActor(playerDefId, cx, cy); playerRoomId = currentRoomId; }
    enterPlayMode(); playReadyUntil = null; release();
    for (let i = 0; i < FPS * 0.8 && P().vy === 0; i++) step(1);
    step(Math.round(FPS * 0.6));
  }
  function full() {
    setup(0);
    const t = { r1: 0, r2: 0, r3: 0 };
    const hp = () => P().x;
    t.r1 = playRoom(0, 90); stats.rooms.push(roomIdx());
    t.r2 = roomIdx() === 1 ? playRoom(1, 150) : 0; stats.rooms.push(roomIdx());
    t.r3 = roomIdx() === 2 ? playRoom(2, 90) : 0; stats.rooms.push(roomIdx());
    for (let i = 0; i < FPS; i++) step(1);
    return { win: playSessionEnded === "win", lives, seconds: +(frames / FPS).toFixed(1), perRoom: t, hops: stats.hops, tilesWalked: +(stats.walked / 32).toFixed(1), route: stats.rooms };
  }
  // fall test: stand on every platform cell, walk off either side, wait, check, then finish the room from wherever we landed
  function fall() {
    const g = SAMPLE_GAMES.find(g => g.id === "cloud-hopper");
    const results = []; let bad = 0;
    for (let room = 0; room < 3; room++) {
      loadExampleGame(g.builder, g.name, { skipConfirm: true }); activateRoom(rooms[room].id);
      const spots = [];
      for (let cy = 1; cy < ROWS - 1; cy++) for (let cx = 0; cx < roomCols(); cx++) {
        const solidHere = board[cy + 1] && board[cy + 1][cx] && geometryAt(cx, cy + 1) === "solid" && !isCellBlocking(cx, cy, { isPlayer: true });
        if (solidHere && !isCellBlocking(cx, cy - 1, { isPlayer: true }) && geometryAt(cx, cy) !== "door") spots.push([cx, cy]);
      }
      for (const [cx, cy] of spots) for (const dir of [-1, 1]) {
        loadExampleGame(g.builder, g.name, { skipConfirm: true }); activateRoom(rooms[room].id); removeAllPlayerInstances();
        placeExampleActor(playerDefId, cx, cy); playerRoomId = currentRoomId; enterPlayMode(); playReadyUntil = null; release();
        const p = P(); step(Math.round(FPS * 0.7));
        K(dir > 0 ? "ArrowRight" : "ArrowLeft", true); step(Math.round(FPS * 0.9)); release();      // walk off the platform
        for (let i = 0; i < FPS * 7; i++) { step(1); if (p.grounded && Math.abs(p.vx) < 1 && i > FPS * 0.5) break; if (playSessionEnded) break; }
        const walkedIntoDoor = roomIdx() !== room;                                                       // the platform led to a door: that is progress, not a fall
        const settled = walkedIntoDoor || playSessionEnded === "win" || (lives === 3 && !playSessionEnded && p.x > -5 && p.x < roomCols() * 32 && p.y > 0 && p.y < ROWS * 32);
        const land = [Math.round(p.x / 32 * 10) / 10, Math.round(p.y / 32 * 10) / 10];
        const sec = !walkedIntoDoor && settled ? playRoom(room, 120) : 0;
        const finished = walkedIntoDoor || playSessionEnded === "win" || roomIdx() !== room;
        const ok = settled && finished;
        if (!ok) bad++;
        results.push({ room, from: [cx, cy], dir, ok, settled, finished, land, seconds: +sec.toFixed(1) });
      }
    }
    return { total: results.length, bad, failures: results.filter(r => !r.ok).slice(0, 8) };
  }
  function from(room, cx, cy) { setup(room, cx, cy); const sec = playRoom(room, 120); return { room, sec: +sec.toFixed(1), win: playSessionEnded === "win", now: [roomIdx(), +(P().x / 32).toFixed(1), +(P().y / 32).toFixed(1)] }; }
  return { full, fall, from };
};`;
(async () => {
  const src = fs.readFileSync(html, "utf8");
  if (!src.includes(anchor)) throw new Error("anchor missing");
  const tmp = path.join(os.tmpdir(), "chbot_hooked.html");
  fs.writeFileSync(tmp, src.replace(anchor, anchor + DRIVER));
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  let failed = false;
  for (const fps of fpsList) {
    const c = await b.newContext({ viewport: { width: 1366, height: 635 } }); const p = await c.newPage();
    p.on("dialog", d => d.accept()); const errs = []; p.on("pageerror", e => errs.push(e.message));
    await p.addInitScript("window.requestAnimationFrame=()=>0;");
    await p.goto("file://" + tmp + "#t");
    if (process.env.CHFROM) { const [r, cx, cy] = process.env.CHFROM.split(",").map(Number); if (process.env.CHTRACE) await p.evaluate(() => { window.__trace = []; }); console.log(JSON.stringify(await p.evaluate(([f, r, cx, cy]) => window.__bot(f).from(r, cx, cy), [fps, r, cx, cy]))); if (process.env.CHTRACE) console.log((await p.evaluate(() => window.__trace)).slice(0, 30).map(t => t.join(":")).join(" ")); await c.close(); continue; }
    if (mode !== "fall") {
      if (process.env.CHTRACE) await p.evaluate(() => { window.__trace = []; });
      const r = await p.evaluate(f => window.__bot(f).full(), fps);
      if (process.env.CHTRACE) console.log((await p.evaluate(() => window.__trace)).filter(t => t[0] === 1).slice(0, 40).map(t => t.join(":")).join(" "));
      console.log(fps + " fps FULL RUN", JSON.stringify(r), "errors", errs.length);
      if (!r.win || errs.length) failed = true;
    }
    if (mode !== "full") {
      const r = await p.evaluate(f => window.__bot(f).fall(), fps);
      console.log(fps + " fps FALL TEST", JSON.stringify(r), "errors", errs.length);
      if (r.bad || errs.length) failed = true;
    }
    await c.close();
  }
  await b.close();
  process.exit(failed ? 1 : 0);
})();
