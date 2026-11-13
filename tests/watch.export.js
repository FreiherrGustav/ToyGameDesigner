// Dev (not shipped): build a Surprise entry (from index.html, canonical) and save it as an editable example project, and trace it.
// node tests/watch.export.js <id> <out.json> [seconds=20]
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const [id, out, SECS = "20"] = process.argv.slice(2);
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = `window.__w = { build: id => { surpriseRecent.length = 0; window.__logs = []; const ol = log; const r = surpriseMe(10001, { templateIds: [id] }); return JSON.stringify({r, last: document.getElementById("log").textContent}); return JSON.stringify(r && { failed: r.failed, why: r.why || r.reason, pending: r.pending, name: r.name, n: actors.length }); },
  save: () => { snapshotCurrentRoomState(); return JSON.stringify({ format: "toygamedesigner-project", version: 1, data: captureProjectSnapshot() }); },
  play: () => { setGamePaused(false); enterPlayMode(); tick(1/60); },
  adv: (s) => { for (let f = 0; f < s * 60; f++) tick(1/60); renderGame(); return actors.length; },
  begin: () => { setGamePaused(false); enterPlayMode(); playReadyUntil = 0; tick(1/60); },
  trace: (secs) => { const pts = []; for (let f = 0; f < secs * 60; f++) { tick(1/60); if (f % 30 === 0) pts.push(f / 60 + "s " + actors.map(a => { const d = actorDefs[a.defId] || {}; return (a.isPlayer ? "P" : (d.name || a.defId).slice(0, 5)) + "(" + (a.x / TILE).toFixed(1) + "," + (a.y / TILE).toFixed(1) + ")"; }).join(" ")); } return pts; } };`;
const tmp = path.join(os.tmpdir(), "watch_export.html"); fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK));
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); const p = await b.newPage(); p.on("dialog", d => d.accept()); p.on("pageerror", e => console.log("PAGEERROR", e));
  await p.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await p.goto("file://" + tmp + "#t"); await p.waitForFunction(() => window.__w);
  console.log("build:", await p.evaluate(i => window.__w.build(i), id));
  fs.writeFileSync(out, await p.evaluate(() => window.__w.save()));
  await p.evaluate(() => window.__w.play());
  await p.evaluate(() => { playReadyUntil = 0; });
  (await p.evaluate(s => window.__w.trace(s), Number(SECS))).forEach(l => console.log(l));
  await b.close();
})();
