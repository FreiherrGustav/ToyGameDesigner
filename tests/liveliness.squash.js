// Contact sheet of the bouncy / trampoline tile squash (real renderGame, 7 moments, 5x zoom). node tests/liveliness.squash.js [out.png]
const fs = require("fs"), path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/opt/node22/lib/node_modules/playwright");
const A = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
fs.writeFileSync("/tmp/squash.html", fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8").replace(A, A + 'window.__ev=f=>eval("("+f+")");\n'));
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 900, height: 700 } });
  await p.goto("file:///tmp/squash.html#t");
  const url = await p.evaluate(() => window.__ev(function () {
    suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false; gravityEnabled = true; setGamePaused(false); actors.length = 0;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { board[y][x] = null; backgroundBoard[y][x] = null; }
    for (let x = 8; x < 16; x++) board[12][x] = "solid:none"; board[10][10] = "solid:bouncy"; board[10][12] = "trampoline:none"; board[10][14] = "solid:bouncy"; groundSkinBoard[10][14] = "gndGrass"; board[11][14] = "solid:none";
    const Z = 5, steps = [0, 0.03, 0.06, 0.09, 0.12, 0.15, 0.2], cells = [[10, 10, 0, 1], [12, 10, 0, 1], [14, 10, 0, 1]];
    const c = document.createElement("canvas"); c.width = steps.length * 34 * Z; c.height = cells.length * 34 * Z; const g = c.getContext("2d"); g.imageSmoothingEnabled = false; const src = gameCanvas.getContext("2d");
    cells.forEach(([cx, cy, dx, dy], r) => steps.forEach((t, s) => {
      gameClockMs = 9000; tileAnimState = {}; tileSquashAt(cx, cy, dx, dy, false); advanceGameClock(t); renderGame();
      g.drawImage(gameCanvas, cx * 32 - 1, cy * 32 - 1, 34, 34, s * 34 * Z, r * 34 * Z, 34 * Z, 34 * Z);
    }));
    return c.toDataURL("image/png");
  })());
  fs.writeFileSync(process.argv[2] || "prototypes/liveliness-shots/squash-strip.png", Buffer.from(url.split(",")[1], "base64"));
  await b.close(); console.log("ok");
})();
