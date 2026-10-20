// Stage 4: export a game built from each new Surprise template and play it (not deployed). node tests/export_s4.js
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
(async () => {
  // a temp copy with only a build helper (no wrappers: the export serializes functions by source, wrapped ones would be anonymous)
  const srcH = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
  fs.writeFileSync("/tmp/s4_build.html", srcH.replace(anchor, anchor + 'window.__f = { build: (seed, id) => { surpriseRecent.length = 0; const r = surpriseMe(seed, { templateIds: [id], chaos: false, canonical: true }); return !!(r && !r.failed); } };\n'));
  const br = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); let bad = 0;
  for (const [id, what] of [["stonepets", "squash"], ["craterain", "squash"], ["bombrow", "bombs"]]) {
    const c = await br.newContext({ acceptDownloads: true }); const q = await c.newPage(); const qe = []; q.on("pageerror", e => qe.push(String(e))); q.on("dialog", d => d.accept());
    await q.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    await q.goto("file:///tmp/s4_build.html#t"); await q.waitForFunction(() => window.__f);
    const built = await q.evaluate(a => window.__f.build(7, a), id);
    const [d] = await Promise.all([q.waitForEvent("download"), q.click("#exportBtn")]);
    const f2 = path.join(os.tmpdir(), "s4_export_" + id + ".html"); await d.saveAs(f2);
    let html = fs.readFileSync(f2, "utf8");
    const anchorX = "playReadyUntil = gameNow() + READY_DURATION_MS;\n  renderPlayHUD();";
    if (!html.includes(anchorX)) throw new Error("export anchor missing");
    html = html.replace(anchorX, anchorX + " window.__sq = 0; window.__det = 0; { const od = detonateCarriedBombAt; detonateCarriedBombAt = function () { window.__det++; return od.apply(this, arguments); }; } { const o = playRecipe; playRecipe = function (e, n) { if (n === 'squashFlat') window.__sq++; return o.apply(this, arguments); }; } window.__x = () => ({ sq: window.__sq, det: window.__det, bombs: actors.filter(a => (actorDefs[a.defId] || {}).temperament === CARRY_BOMB2_KIND).length, n: actors.length });");
    fs.writeFileSync(f2, html);
    const c3 = await br.newContext(); const x = await c3.newPage(); const xe = []; x.on("pageerror", e => xe.push(String(e)));
    await x.goto("file://" + f2); await x.waitForTimeout(400);
    console.log("errs", xe.slice(0,2)); const before = await x.evaluate(() => window.__x && window.__x()); await x.waitForTimeout(6000); const after = await x.evaluate(() => window.__x());
    const ok = built && xe.length === 0 && (what === "squash" ? after.sq >= 1 : after.det >= 3);
    if (!ok) bad++;
    console.log(ok ? "ok  " : "FAIL", id, JSON.stringify({ built, before, after, errors: xe.slice(0, 2) }));
    await c.close();
  }
  await br.close(); process.exit(bad ? 1 : 0);
})();
