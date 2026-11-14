// node tests/shots_s2.js <index.html> <outdir> <label> [ids...]   (full-page screenshots of designs at 1366x635 and 1920x1080)
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const [html, out, label, ...ids] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  for (const [w, h] of [[1366, 635], [1920, 1080]]) for (const id of ids) {
    const p = await b.newPage({ viewport: { width: w, height: h } }); p.on("dialog", d => d.accept()); p.on("pageerror", e => console.log("pageerror", id, String(e)));
    await p.goto("file://" + html + "#t"); await p.waitForFunction(() => window.surpriseMe);
    await p.evaluate(i => window.surpriseMe(10000, { templateId: i }), id); await p.waitForTimeout(500);
    await p.screenshot({ path: `${out}/${label}-${id}-${w}.png` }); await p.close();
  }
  await b.close();
})();
