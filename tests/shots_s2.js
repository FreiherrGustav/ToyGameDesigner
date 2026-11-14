// v2.54 Stage 2 dev script (not deployed): one machine under three variations, screenshots after 1.5 s of play. node tests/shots_s2.js <templateId> <outDir>
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const id = process.argv[2] || "pinballroom", out = process.argv[3] || "/tmp/claude-0/s2shots";
fs.mkdirSync(out, { recursive: true });
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const tmp = path.join(os.tmpdir(), "shots_s2.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + 'window.__x = { press: (seed, o) => {   const r = surpriseMe(seed, o); return r && { variant: r.variant, ops: r.ops, name: r.name }; }, play: () => { enterPlayMode(); }, run: n => { for (let i = 0; i < n; i++) tick(1 / 60); renderGame(); }, restoreFactory: () => { suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false; } };\n'));
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const seen = new Set(); let n = 0;
  for (let seed = 3; n < 3 && seed < 80; seed++) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage(); p.on("dialog", d => d.accept());
    await p.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    await p.goto("file://" + tmp + "#t"); await p.waitForFunction(() => window.__x);
    const r = await p.evaluate(([s, i]) => window.__x.press(s, { templateIds: [i], vary: { payload: true } }), [seed, id]);
    if (!r || seen.has(r.variant)) { await ctx.close(); continue; }
    seen.add(r.variant); n++;
    await p.evaluate(() => { window.__x.play(); window.__x.run(90); });
    await p.waitForTimeout(100);
    const f = path.join(out, id + "_" + n + ".png"); await (await p.$("#gameCanvas")).screenshot({ path: f });
    console.log(n, JSON.stringify(r)); await ctx.close();
  }
  await b.close();
})();
