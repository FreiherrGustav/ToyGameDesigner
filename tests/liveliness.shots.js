// Before/after screenshots for the liveliness pass. node tests/liveliness.shots.js <before.html> <outdir>
const fs = require("fs"), path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/opt/node22/lib/node_modules/playwright");
const A = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const mk = (file, tag) => { const src = fs.readFileSync(file, "utf8"); const out = "/tmp/shots_" + tag + ".html"; fs.writeFileSync(out, src.replace(A, A + 'window.__ev=f=>eval("("+f+")");\n')); return out; };
const builds = { before: mk(process.argv[2], "b"), after: mk(path.join(__dirname, "..", "index.html"), "a") };
const outdir = process.argv[3] || path.join(__dirname, "..", "prototypes", "liveliness-shots");
const SC = [["popcorn", () => surpriseMe(1, { templateId: "popcorn", full: "new" })], ["magnetmile", () => surpriseMe(1, { templateId: "magnetmile", full: "new" })], ["plinko", () => surpriseMe(1, { templateId: "plinko", full: "new" })],
  ["icecave", () => { loadExampleGame(buildIceCaveGame, "x", { skipConfirm: true }); }], ["gravitytunnel", () => surpriseMe(1, { templateId: "gravitytunnel", full: "new" })]];
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  for (const [tag, file] of Object.entries(builds)) for (const [name, fn] of SC) {
    const p = await b.newPage({ viewport: { width: 1366, height: 768 } }); p.on("dialog", d => d.accept()); p.on("pageerror", e => console.log("ERR", tag, name, e.message));
    await p.goto("file://" + file + "#t");
    await p.evaluate(([f]) => window.__ev(f)(), [fn.toString()]);
    await p.waitForTimeout(1800);
    await (await p.$("#gameCanvas")).screenshot({ path: path.join(outdir, tag + "-" + name + ".png") });
    await p.close();
  }
  await b.close(); console.log("done");
})();
