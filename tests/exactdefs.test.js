// Regression: every ground skin / Paint tile a Surprise room paints has a real def (stonedomino once painted ids with no def,
// so its lava vanished and its rubble loaded as plain solid). node tests/exactdefs.test.js
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = `window.__x = { ids: () => SURPRISE_TEMPLATES.filter(t => t.exact).map(t => t.id), build: id => { surpriseRecent.length = 0; surpriseRecentVariants.length = 0;
  const r = surpriseMe(10001, { templateIds: [id], scene: false }); if (!r || r.failed) return { err: JSON.stringify(r) };
  const miss = []; for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { const s = groundSkinBoard[y][x]; if (s && !groundTileDefs[s]) miss.push("skin " + s + "@" + x + "," + y);
    const g = backgroundBoard[y][x]; if (g && !backgroundTileDefs[g]) miss.push("bg " + g + "@" + x + "," + y); } return { miss }; } };`;
const tmp = path.join(os.tmpdir(), "exactdefs.html"); fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK));
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); let pass = 0, fail = 0;
  const p0 = await b.newPage(); await p0.goto("file://" + tmp + "#t"); await p0.waitForFunction(() => window.__x); const ids = await p0.evaluate(() => window.__x.ids()); await p0.close();
  for (const id of ids) {
    const p = await b.newPage(); p.on("dialog", d => d.accept()); await p.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    await p.goto("file://" + tmp + "#t"); await p.waitForFunction(() => window.__x);
    const r = await p.evaluate(i => window.__x.build(i), id); const ok = r && !r.err && r.miss.length === 0;
    console.log((ok ? "ok   " : "FAIL ") + id + (ok ? "" : " " + JSON.stringify(r).slice(0, 200))); ok ? pass++ : fail++; await p.close();
  }
  await b.close(); console.log("exactdefs: " + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
})();
