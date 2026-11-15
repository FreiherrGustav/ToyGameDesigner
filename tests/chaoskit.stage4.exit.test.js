// Stage 4 exit paths: Stop / board click / tab / Play / project load / room switch, mid-Earthquake and mid-Rising Lava. Nothing may stay lifted.
const fs = require("fs"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const ANCH = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
fs.writeFileSync("/tmp/ck/s4x.html", fs.readFileSync(path.resolve(__dirname, "..", "index.html"), "utf8").replace(ANCH, ANCH + 'window.__ev = f => eval("(" + f + ")");\n'));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage(); const errs = [];
  page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept());
  await page.goto("file:///tmp/ck/s4x.html#t"); await page.waitForTimeout(600); await page.click("#messTabMess");
  const ev = (fn, arg) => page.evaluate(([s, a]) => window.__ev(s)(a), [String(fn), arg]);
  const SETUP = () => { restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); undoStack.length = 0; const s = SAMPLE_GAMES.find(x => x.id === "cloud-hopper"); loadExampleGame(s.builder, s.name, { skipConfirm: true }); setGamePaused(false); gravityEnabled = true; gravityDir = "down"; undoStack.length = 0; };
  const ST = () => { let t = 0; for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (board[y][editorPanCol + x]) t++; const o = document.getElementById("mkOverlay"); return { tiles: t, overlay: !!o && o.style.display !== "none", sess: window.chaosKit.active(), paused: gamePaused, mode: appMode, hero: actors.some(a => a.isPlayer) }; };
  for (const [kind, wait, label, act] of [
    ["quake", 3500, "Stop", () => page.click("#mkStop")],
    ["quake", 3500, "board click", () => page.mouse.click(700, 300)],
    ["quake", 3500, "Make a Game tab", () => page.click("#messTabGame")],
    ["quake", 3500, "Play button", () => page.click("#modePlayBtn")],
    ["quake", 1200, "Stop (early, before the tiles lift)", () => page.click("#mkStop")],
    ["lava", 1500, "Stop", () => page.click("#mkStop")],
    ["lava", 1500, "board click", () => page.mouse.click(700, 300)],
    ["lava", 1500, "Make a Game tab", () => page.click("#messTabGame")],
    ["lava", 1500, "Play button", () => page.click("#modePlayBtn")],
    ["lava", 5200, "Stop (during the fall)", () => page.click("#mkStop")]
  ]) {
    await ev(SETUP); await page.click("#messTabMess"); await page.waitForTimeout(150);
    const pre = await ev(ST);
    await page.click('[data-mk="' + kind + '"]'); await page.waitForTimeout(wait);
    const mid = await ev(ST);
    await act(); await page.waitForTimeout(400);
    const post = await ev(ST);
    ok(mid.sess === kind, kind + "/" + label + ": was running");
    ok(post.sess == null && !post.overlay && post.hero, kind + "/" + label + ": ended, overlay gone, hero here");
    if (kind === "lava") ok(post.tiles > 0 && post.tiles <= pre.tiles, kind + "/" + label + ": tiles committed, not left lifted (" + pre.tiles + " -> " + post.tiles + ")");
    else ok(post.tiles >= pre.tiles * 0.8 && post.tiles <= pre.tiles, kind + "/" + label + ": tiles committed, not left lifted (" + pre.tiles + " -> " + post.tiles + ")");
    if (post.mode === "play") await ev(() => { if (appMode === "play") exitToBuildMode(); });
    ok(!(await ev(() => gamePaused)) || pre.paused, kind + "/" + label + ": sim not left frozen");
  }
  // project load and room switch mid-session
  for (const kind of ["quake", "lava"]) {
    await ev(SETUP); await page.click("#messTabMess"); await page.waitForTimeout(150);
    await page.click('[data-mk="' + kind + '"]'); await page.waitForTimeout(kind === "quake" ? 3500 : 1500);
    await ev(() => restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT))); await page.waitForTimeout(300);
    const a = await ev(ST);
    ok(a.sess == null && !a.overlay && !a.paused, kind + ": project load mid-session: ended, overlay gone, not frozen");
    await ev(SETUP); await page.click("#messTabMess"); await page.waitForTimeout(150);
    await page.click('[data-mk="' + kind + '"]'); await page.waitForTimeout(kind === "quake" ? 3500 : 1500);
    await ev(() => { const r = createEmptyRoom("x"); rooms.push(r); activateRoom(r.id); }); await page.waitForTimeout(300);
    const b = await ev(ST);
    ok(b.sess == null && !b.overlay && !b.paused, kind + ": room switch mid-session: ended, overlay gone, not frozen");
  }
  ok(errs.length === 0, "no page errors " + errs.slice(0, 2));
  console.log(pass + " passed, " + fail + " failed");
  await browser.close();
})();
