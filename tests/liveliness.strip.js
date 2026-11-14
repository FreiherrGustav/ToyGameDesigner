// Contact sheet of the idle motion (6 moments x 4 pieces + squash), 5x zoom. node tests/liveliness.strip.js [out.png]
const fs = require("fs"), path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/opt/node22/lib/node_modules/playwright");
const A = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
fs.writeFileSync("/tmp/strip.html", fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8").replace(A, A + 'window.__ev=f=>eval("("+f+")");\n'));
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 900, height: 700 } });
  await p.goto("file:///tmp/strip.html#t");
  const url = await p.evaluate(() => window.__ev(function () {
    const Z = 5, steps = 8, names = [["goal:none"], ["trampoline:none"], ["cannon2-ne:none"], ["magnet:none"], ["solid:bouncy"]];
    const c = document.createElement("canvas"); c.width = steps * 34 * Z; c.height = names.length * 34 * Z; const g = c.getContext("2d"); g.imageSmoothingEnabled = false;
    const t = document.createElement("canvas"); t.width = 32; t.height = 32; const tc = t.getContext("2d");
    names.forEach(([key], r) => { gameClockMs = 5000; for (let s = 0; s < steps; s++) {
      tc.fillStyle = "#1c2233"; tc.fillRect(0, 0, 32, 32); const prev = appMode; appMode = "play";
      drawGameplayTile(tc, 0, 0, GAMEPLAY_TILE_DEFS[key], { phase: 0.3 }); appMode = prev;
      g.drawImage(t, s * 34 * Z, r * 34 * Z, 32 * Z, 32 * Z); advanceGameClock(0.3); } });
    return c.toDataURL("image/png");
  })());
  fs.writeFileSync(process.argv[2] || "prototypes/liveliness-shots/idle-strip.png", Buffer.from(url.split(",")[1], "base64"));
  await b.close(); console.log("ok");
})();
