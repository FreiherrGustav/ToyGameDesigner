// Make a Mess, Stage 4 (Earthquake + Rising Lava via the overlay module). node tests/chaoskit.stage4.test.js [runsPerEffect=50] [workers=4] [shotDir]
// Real time, hook-injected temp copy. Each run: set up a room, press, wait for the session to end, check the result and that undo restores.
const fs = require("fs"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const RUNS = parseInt(process.argv[2] || "50", 10), WORKERS = parseInt(process.argv[3] || "4", 10), SHOTS = process.argv[4] || "/tmp/ck/s4shots";
fs.mkdirSync(SHOTS, { recursive: true });
const ANCH = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
fs.writeFileSync("/tmp/ck/s4.html", fs.readFileSync(path.resolve(__dirname, "..", "index.html"), "utf8").replace(ANCH, ANCH + 'window.__ev = f => eval("(" + f + ")");\n'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const VARIANTS = ["empty+walls", "starter+stuff", "cloud-hopper", "rock-bottom", "the-gravity-switcheroo", "event-horizon", "stonekeepers-vault", "the-bomb-factory"];
const GDIRS = ["down", "up", "left", "right", "off"];
const SETUP = ([variant, gdir]) => {
  restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); undoStack.length = 0; redoStack.length = 0;
  if (variant === "empty+walls" || variant === "starter+stuff") {
    if (variant === "starter+stuff") loadStarterBoard();
    selectedActorDefId = playerDefId; placeNewActor(3 * TILE, 12 * TILE);
    gravityEnabled = true; gravityDir = "down"; setGamePaused(false);
    window.chaosKit.gm.press(variant === "empty+walls" ? "walls" : "stuff"); window.chaosKit.gm.press("enemies");
  } else { const s = SAMPLE_GAMES.find(x => x.id === variant); loadExampleGame(s.builder, s.name, { skipConfirm: true }); }
  setGamePaused(false);
  if (!actors.some(a => a.isPlayer)) { selectedActorDefId = playerDefId; placeNewActor(3 * TILE, 12 * TILE); }
  if (gdir === "off") gravityEnabled = false; else { gravityEnabled = true; gravityDir = gdir; }
  undoStack.length = 0; redoStack.length = 0;
};
const INSTALL = () => { window.__SIG = () => { const s = captureProjectSnapshot(); return JSON.stringify([s.rooms.map(r => [r.board, r.colorBoard, r.groundSkinBoard, r.backgroundBoard, r.actors.length, r.startPos, r.gravityEnabled, r.gravityDir]), s.doorLinks, s.spawnerContents]); }; };
const SIG = () => window.__SIG();
const PRE = () => {
  const hero = actors.find(a => a.isPlayer), c0 = editorPanCol;
  let tiles = 0, tilesNoBomb = 0, doors = []; for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { const k = board[y][c0 + x]; if (k) { tiles++; if (!(GAMEPLAY_TILE_DEFS[k] && GAMEPLAY_TILE_DEFS[k].geometry === BOMB2_GEOMETRY)) tilesNoBomb++; if (GAMEPLAY_TILE_DEFS[k] && GAMEPLAY_TILE_DEFS[k].geometry === "door") doors.push([c0 + x, y, k]); } }
  return { tiles, tilesNoBomb, doors, actors: actors.length, hero: !!hero, start: JSON.stringify(startPos), links: JSON.stringify(doorLinks), stuck: actors.filter(a => actorBlockedByTiles(a)).length, sig: window.__SIG(), paused: gamePaused, u: undoStack.length };
};
const POST = (pre) => {
  const out = { problems: [] }, c0 = editorPanCol;
  const hero = actors.find(a => a.isPlayer);
  if (!hero) out.problems.push("hero missing");
  else if (!(Number.isFinite(hero.x) && Number.isFinite(hero.y) && hero.x > -80 && hero.y > -80 && hero.x < BOARD_MAX_COLS * TILE + 80 && hero.y < ROWS * TILE + 80)) out.problems.push("hero off the board");
  if (JSON.stringify(startPos) !== pre.start) out.problems.push("start moved");
  let tiles = 0, bad = 0; for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { const k = board[y][c0 + x]; if (k) { tiles++; if (!GAMEPLAY_TILE_DEFS[k]) bad++; } }
  if (bad) out.problems.push(bad + " tiles with unknown keys");
  const stuck = actors.filter(a => actorBlockedByTiles(a)); if (stuck.length > pre.stuck) out.problems.push((stuck.length - pre.stuck) + " more actors inside tiles than before: " + stuck.map(a => a.defId + "@" + Math.round(a.x / TILE * 10) / 10 + "," + Math.round(a.y / TILE * 10) / 10).join(" "));
  if (document.getElementById("mkOverlay") && document.getElementById("mkOverlay").style.display !== "none") out.problems.push("overlay still showing");
  if (window.chaosKit.active()) out.problems.push("session still active");
  if (gamePaused !== pre.paused) out.problems.push("pause state not restored");
  out.tiles = tiles; out.actors = actors.length;
  return out;
};
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const CTL = process.env.CTL === "1"; const results = CTL ? { ctl: [] } : { quake: [], lava: [] }, errs = [];
  const jobs = []; for (let i = 0; i < RUNS; i++) { if (CTL) jobs.push(["ctl", i]); else { jobs.push(["quake", i]); jobs.push(["lava", i]); } }
  let next = 0, shot = 0;
  async function worker(w) {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept());
    await page.goto("file:///tmp/ck/s4.html#t"); await page.waitForTimeout(600);
    await page.click("#messTabMess");
    await page.evaluate(([s]) => window.__ev(s)(), [String(INSTALL)]);
    const ev = (fn, arg) => page.evaluate(([s, a]) => window.__ev(s)(a), [String(fn), arg]);
    while (next < jobs.length) {
      const [kind, i] = jobs[next++];
      const variant = VARIANTS[i % VARIANTS.length], gdir = GDIRS[Math.floor(i / VARIANTS.length) % 5];
      await ev(SETUP, [variant, gdir]); await page.waitForTimeout(150);
      await ev(() => setGamePaused(true));
      const pre = await ev(PRE);
      if (kind === "ctl") { await ev(() => setGamePaused(false)); await page.waitForTimeout(8500); const post = await ev(POST, pre); results.ctl.push({ variant, gdir, probs: post.problems.filter(x => /inside tiles/.test(x)), pre: pre.tiles, post: post.tiles, preA: pre.actors, postA: post.actors }); continue; }
      await page.click('[data-mk="' + (kind === "quake" ? "quake" : "lava") + '"]');
      const t0 = Date.now(); let midShot = false;
      while (Date.now() - t0 < 14000) {
        await page.waitForTimeout(250);
        if (!midShot && shot < 6 && Date.now() - t0 > (kind === "quake" ? 3200 : 1800)) { midShot = true; const f = path.join(SHOTS, kind + "-" + (shot++) + "-" + variant + "-" + gdir + ".png"); await page.screenshot({ path: f }); }
        if (!(await ev(() => window.chaosKit.active()))) break;
      }
      await page.waitForTimeout(300);
      const post = await ev(POST, pre);
      const u1 = await ev(() => undoStack.length);
      const probs = post.problems.slice();
      if (u1 !== pre.u + 1) probs.push("not one undo step (" + (u1 - pre.u) + ")");
      if (kind === "quake") {
        
        if (post.tiles > pre.tiles) probs.push("more tiles than before");
        if (pre.tilesNoBomb > 20 && post.tiles < pre.tilesNoBomb * 0.8) probs.push("too many tiles lost (" + post.tiles + "/" + pre.tiles + ")");
        const dn = await ev((d) => { const c0 = editorPanCol; return d.every(([x, y, k]) => board[y][x] === k); }, pre.doors);
        if (!dn) probs.push("a door moved or was erased");
        if ((await ev(() => JSON.stringify(doorLinks))) !== pre.links) probs.push("door links changed");
      } else if (post.tiles > pre.tiles) probs.push("lava: more tiles than before");
      await ev(() => performUndo()); await page.waitForTimeout(100);
      if ((await ev(SIG)) !== pre.sig) probs.push("undo did not restore the project");
      results[kind].push({ variant, gdir, probs, pre: pre.tiles, post: post.tiles, preA: pre.actors, postA: post.actors });
    }
    await ctx.close();
  }
  await Promise.all(Array.from({ length: WORKERS }, (_, w) => worker(w)));
  for (const kind of Object.keys(results)) {
    const R = results[kind], bad = R.filter(r => r.probs.length);
    const avg = (f) => (R.reduce((p, r) => p + f(r), 0) / R.length).toFixed(1);
    console.log(kind + ": runs " + R.length + ", tiles before/after avg " + avg(r => r.pre) + "/" + avg(r => r.post) + ", actors before/after avg " + avg(r => r.preA) + "/" + avg(r => r.postA) + ", runs with problems " + bad.length);
    bad.slice(0, 8).forEach(r => console.log("   " + r.variant + "/" + r.gdir + ": " + r.probs.join(", ")));
    ok(kind === "ctl" || (R.length === RUNS && bad.length === 0), kind + ": " + RUNS + " runs, valid board, no stuck actors, hero and start safe, one undo step, undo restores");
  }
  ok(errs.length === 0, "no page errors " + errs.slice(0, 2));
  console.log(pass + " passed, " + fail + " failed");
  await browser.close();
})();
