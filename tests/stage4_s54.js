// v2.54 Stage 4 dev script (not deployed): machine export play + screenshots. node tests/stage4_s54.js <outDir>
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const out = process.argv[2] || "/tmp/claude-0/s4shots"; fs.mkdirSync(out, { recursive: true });
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const tmp = path.join(os.tmpdir(), "s54_s4.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + 'window.__x = { press: (seed, o) => {   const r = surpriseMe(seed, o); return r && { variant: r.variant, ops: r.ops, name: r.name, id: r.templateId }; }, play: () => { enterPlayMode(); }, run: n => { for (let i = 0; i < n; i++) tick(1 / 60); renderGame(); }, pos: () => actors.map(a => [a.defId, Math.round(a.x), Math.round(a.y)]) };\n'));
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); let bad = 0;
  const fresh = async () => { const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true }); const p = await ctx.newPage(); p.errs = []; p.on("pageerror", e => p.errs.push(String(e))); p.on("dialog", d => d.accept()); await p.addInitScript(() => { window.requestAnimationFrame = () => 0; }); await p.goto("file://" + tmp + "#t"); await p.waitForFunction(() => window.__x); return [ctx, p]; };
  // 1. each machine: screenshot in motion (two variations), then export + play
  for (const id of ["domino", "opensdoor", "carousel"]) {
    for (let k = 0; k < 2; k++) {
      const [ctx, p] = await fresh();
      const r = await p.evaluate(([s, i, v]) => window.__x.press(s, { templateIds: [i], vary: v ? { payload: true, mirror: true } : null }), [11 + k, id, k]);
      await p.evaluate(() => { window.__x.play(); window.__x.run(90 + 120); }); // past READY not needed for manual ticks
      await (await p.$("#gameCanvas")).screenshot({ path: path.join(out, id + "_" + (k + 1) + ".png") });
      console.log("shot", id, k, JSON.stringify(r)); await ctx.close();
    }
    // export of the machine (first variation) and play
    const [ctx, p] = await fresh();
    const r = await p.evaluate(([s, i]) => window.__x.press(s, { templateIds: [i], vary: { payload: true, mirror: true } }), [21, id]);
    const [d] = await Promise.all([p.waitForEvent("download"), p.click("#exportBtn")]);
    const f2 = path.join(os.tmpdir(), "s54_export_" + id + ".html"); await d.saveAs(f2);
    const c3 = await b.newContext({ viewport: { width: 1280, height: 800 } }); const x = await c3.newPage(); const xe = []; x.on("pageerror", e => xe.push(String(e)));
    await x.goto("file://" + f2); await x.waitForTimeout(9000);
    await (await x.$("#gameCanvas")).screenshot({ path: path.join(out, "export_" + id + ".png") });
    const ok = xe.length === 0; if (!ok) bad++;
    console.log(ok ? "ok  " : "FAIL", "export", id, JSON.stringify({ r, errors: xe.slice(0, 2) })); await ctx.close(); await c3.close();
  }
  // 2. ten random presses
  for (let i = 0; i < 10; i++) {
    const [ctx, p] = await fresh();
    const r = await p.evaluate(s => window.__x.press(s, {}), 500 + i * 37);
    await p.evaluate(() => { window.__x.play(); window.__x.run(150); });
    await (await p.$("#gameCanvas")).screenshot({ path: path.join(out, "random_" + (i + 1) + ".png") });
    console.log("random", i + 1, JSON.stringify(r), p.errs.length ? "ERR " + p.errs[0] : ""); if (p.errs.length) bad++; await ctx.close();
  }
  await b.close(); process.exit(bad ? 1 : 0);
})();
