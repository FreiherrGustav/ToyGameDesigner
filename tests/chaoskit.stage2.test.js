// Make a Mess, Stage 2 (session wrapper, Gravity Tumble, Bomb Storm). node tests/chaoskit.stage2.test.js
// Real time (the sessions run on real timers). Uses a hook-injected temp copy; the repo file is never touched.
const fs = require("fs"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const ANCH = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const src = fs.readFileSync(path.resolve(__dirname, "..", "index.html"), "utf8");
fs.writeFileSync("/tmp/ck/s2.html", src.replace(ANCH, ANCH + 'window.__ev = f => eval("(" + f + ")");\n'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function open(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage(); page.errs = [];
  page.on("pageerror", e => page.errs.push(String(e))); page.on("dialog", d => d.accept());
  await page.goto("file:///tmp/ck/s2.html#t"); await page.waitForTimeout(700);
  return page;
}
const ev = (page, fn, arg) => page.evaluate(([s, a]) => window.__ev(s)(a), [String(fn), arg]);
// a Cloud Hopper-like scene: a sample with gravity on and a hero
const LOAD = () => { restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); const s = SAMPLE_GAMES.find(x => x.id === "cloud-hopper"); loadExampleGame(s.builder, s.name, { skipConfirm: true }); setGamePaused(false); return { en: gravityEnabled, dir: gravityDir, room: currentRoomId }; };
const STATE = () => ({ en: gravityEnabled, dir: gravityDir, paused: gamePaused, sess: window.chaosKit.active(), undo: undoStack.length, mode: appMode, room: currentRoomId, player: !!actors.find(a => a.isPlayer) });
const snapSig = () => { const s = captureProjectSnapshot(); return JSON.stringify(s.rooms.map(r => [r.board, r.gravityEnabled, r.gravityDir, r.actors.length, r.startPos])); };
async function showMess(page) { await page.click("#messTabMess"); await page.waitForTimeout(100); }
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  let page = await open(browser);
  await ev(page, LOAD); await showMess(page);

  // ---- Gravity Tumble, normal end ----
  const g0 = await ev(page, STATE), sig0 = await ev(page, snapSig);
  await page.click('[data-mk="tumble"]');
  const seen = []; let sessAt = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 9600) {
    const s = await ev(page, STATE);
    if (s.sess === "tumble") sessAt++;
    if (!seen.length || seen[seen.length - 1] !== s.dir) seen.push(s.dir);
    await sleep(100);
  }
  const g1 = await ev(page, STATE);
  ok(sessAt > 70 && sessAt < 95, "tumble runs about 8 s (" + sessAt * 0.1 + " s)");
  ok(["right", "up", "left", "down"].every(d => seen.includes(d)), "all four directions seen: " + seen.join(">"));
  ok(g1.sess == null && g1.en === g0.en && g1.dir === g0.dir, "gravity restored exactly (" + g1.en + "," + g1.dir + ")");
  ok(g1.undo === g0.undo + 1, "one undo step (" + g0.undo + " -> " + g1.undo + ")");
  ok(g1.player, "hero still exists");
  await page.click("#undoBtn"); await page.waitForTimeout(200);
  const sig1 = await ev(page, snapSig);
  ok(sig1 === sig0, "undo returns to the pre-press state (gravity, boards, actor counts, start)");

  // ---- Stop button, and a few exit paths for Tumble ----
  async function tumbleThen(label, act) {
    await ev(page, LOAD); await showMess(page);
    const a = await ev(page, STATE);
    await page.click('[data-mk="tumble"]'); await page.waitForTimeout(2300);
    const mid = await ev(page, STATE);
    ok(mid.sess === "tumble" && mid.dir !== a.dir, label + ": was running and turned (" + mid.dir + ")");
    await act(); await page.waitForTimeout(250);
    const b = await ev(page, STATE);
    ok(b.sess == null && b.en === a.en && b.dir === a.dir, label + ": ended, gravity restored (" + b.en + "," + b.dir + ")");
    return { a, b };
  }
  await tumbleThen("Stop button", () => page.click("#mkStop"));
  await tumbleThen("click on the board", () => page.mouse.click(683, 400));
  await tumbleThen("switch to Make a Game", () => page.click("#messTabGame"));
  {
    await ev(page, LOAD); await showMess(page);
    const a = await ev(page, STATE);
    await page.click('[data-mk="tumble"]'); await page.waitForTimeout(2300);
    await page.click('[data-mk="bombs"]'); await page.waitForTimeout(250);
    const b = await ev(page, STATE);
    ok(b.sess === "bombs" && b.en === a.en && b.dir === a.dir, "another chaos button: tumble restored, storm took over (" + b.sess + "," + b.dir + ")");
    await page.click("#mkStop");
  }
  await tumbleThen("Ctrl+Z", () => page.keyboard.press("Control+z"));
  await tumbleThen("P key", () => page.keyboard.press("p"));
  {
    const r = await tumbleThen("Play button", () => page.click("#modePlayBtn"));
    await ev(page, () => { if (appMode === "play") exitToBuildMode(); });
    ok((await ev(page, STATE)).mode === "build", "Play and back to Build works");
  }
  // a programmatic room switch: new room, then switch
  await ev(page, LOAD); await showMess(page);
  await ev(page, () => { const r = createEmptyRoom("other"); rooms.push(r); window.__otherId = r.id; });
  const a2 = await ev(page, STATE);
  await page.click('[data-mk="tumble"]'); await page.waitForTimeout(1500);
  await ev(page, () => activateRoom(window.__otherId));
  await page.waitForTimeout(250);
  const homeRoom = await ev(page, () => { const r = rooms.find(x => x.id === window.__homeId) || rooms[0]; return [r.gravityEnabled, r.gravityDir]; });
  ok((await ev(page, STATE)).sess == null && homeRoom[0] === a2.en && homeRoom[1] === a2.dir, "room switch (programmatic): ended, the first room's own gravity restored (" + homeRoom + ")");
  // project replaced
  await ev(page, LOAD); await showMess(page);
  await page.click('[data-mk="tumble"]'); await page.waitForTimeout(1500);
  await ev(page, () => restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)));
  await page.waitForTimeout(250);
  ok((await ev(page, STATE)).sess == null, "project load: session ended without touching the new project");
  // gravity-off room and a paused room
  await ev(page, LOAD); await showMess(page);
  await ev(page, () => { gravityEnabled = false; });
  await page.click('[data-mk="tumble"]'); await page.waitForTimeout(1500);
  const offMid = await ev(page, STATE);
  ok(offMid.en === true, "gravity-off room tumbles (gravity on while it runs)");
  await page.click("#mkStop"); await page.waitForTimeout(200);
  ok((await ev(page, STATE)).en === false, "...and goes back off");
  await ev(page, LOAD); await showMess(page);
  await ev(page, () => setGamePaused(true));
  await page.click('[data-mk="tumble"]'); await page.waitForTimeout(500);
  ok((await ev(page, STATE)).paused === false, "a paused room is un-paused for the session");
  await page.click("#mkStop"); await page.waitForTimeout(200);
  ok((await ev(page, STATE)).paused === true, "...and paused again after a normal stop");
  await ev(page, () => setGamePaused(false));

  // ---- Bomb Storm ----
  await ev(page, LOAD); await showMess(page);
  await ev(page, () => {
    window.__bl = []; window.__peak = { actors: 0, live: 0 };
    const orig = detonateCarriedBombAt;
    detonateCarriedBombAt = function (r, id) { const b = actors.find(a => a.id === id); if (b && b.spawnerKey === "chaos:storm" && !b.detonating) window.__bl.push(performance.now()); return orig.apply(this, arguments); };
    window.__mon = setInterval(() => { window.__peak.actors = Math.max(window.__peak.actors, actors.length); window.__peak.live = Math.max(window.__peak.live, actors.filter(a => a.spawnerKey === "chaos:storm" && !a.detonating).length); }, 30);
  });
  const b0 = await ev(page, STATE), bsig0 = await ev(page, snapSig);
  const startActors = await ev(page, () => actors.length);
  const tb = Date.now();
  await page.click('[data-mk="bombs"]');
  await page.waitForTimeout(7600);
  const b1 = await ev(page, STATE);
  const m = await ev(page, () => { const bl = window.__bl; let maxWin = 0; for (const t of bl) maxWin = Math.max(maxWin, bl.filter(u => u >= t && u < t + 1000).length); return { n: bl.length, maxWin, peak: window.__peak, left: actors.filter(a => a.spawnerKey === "chaos:storm").length }; });
  console.log("storm: blasts", m.n, "max blasts in any 1 s", m.maxWin, "peak actors", m.peak.actors, "(start " + startActors + ") peak live bombs", m.peak.live, "leftover storm bombs", m.left);
  ok(m.n >= 8, "the storm made blasts (" + m.n + ")");
  ok(m.maxWin <= 8, "blasts in any second capped (" + m.maxWin + ")");
  ok(m.peak.live <= 6, "simultaneous live bombs capped (" + m.peak.live + ")");
  ok(m.left === 0, "no storm bombs left over");
  ok(b1.sess == null && b1.player, "storm ended by itself, hero still here");
  ok(b1.undo === b0.undo + 1, "one undo step");
  const startOk = await ev(page, () => { const p = actors.find(a => a.isPlayer); return Number.isFinite(p.x) && Number.isFinite(p.y) && p.x > -64 && p.y > -64 && p.x < COLS * TILE * 3 && p.y < ROWS * TILE + 64; });
  ok(startOk, "hero on the board");
  await page.click("#undoBtn"); await page.waitForTimeout(250);
  ok((await ev(page, snapSig)) === bsig0, "undo restores the exact pre-storm project (boards, actors, start)");
  // Stop mid-storm
  await ev(page, LOAD); await showMess(page);
  await page.click('[data-mk="bombs"]'); await page.waitForTimeout(2500);
  await page.click("#mkStop"); await page.waitForTimeout(1600);
  const s2 = await ev(page, () => ({ left: actors.filter(a => a.spawnerKey === "chaos:storm" && !a.detonating).length, sess: window.chaosKit.active() }));
  ok(s2.sess == null && s2.left === 0, "Stop mid-storm: ended, un-exploded bombs removed (" + s2.left + ")");
  // Play entry mid-storm
  await ev(page, LOAD); await showMess(page);
  await page.click('[data-mk="bombs"]'); await page.waitForTimeout(1500);
  await page.click("#modePlayBtn"); await page.waitForTimeout(400);
  const p1 = await ev(page, () => ({ mode: appMode, sess: window.chaosKit.active(), storm: actors.filter(a => a.spawnerKey === "chaos:storm").length }));
  ok(p1.mode === "play" && p1.sess == null && p1.storm === 0, "Play mid-storm: session ended, no storm bombs in Play");
  await ev(page, () => { if (appMode === "play") exitToBuildMode(); });
  // storm in a gravity-off room
  await ev(page, LOAD); await showMess(page);
  await ev(page, () => { gravityEnabled = false; });
  await page.click('[data-mk="bombs"]'); await page.waitForTimeout(7200);
  ok((await ev(page, STATE)).sess == null, "storm in a gravity-off room ends by itself");
  // idle cost
  const idle = await ev(page, () => new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => { if (++n < 120) requestAnimationFrame(f); else res((performance.now() - t0) / n); }; requestAnimationFrame(f); }));
  console.log("frame interval after sessions", idle.toFixed(2), "ms");
  ok(page.errs.length === 0, "no page errors: " + page.errs.slice(0, 2));
  console.log(pass + " passed, " + fail + " failed");
  await browser.close();
})();
