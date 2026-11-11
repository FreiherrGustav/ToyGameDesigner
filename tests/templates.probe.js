// v2.54 dev probe (not deployed): per-template facts from the live Surprise tables. node tests/templates.probe.js [html]
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const file = path.resolve(process.argv[2] || path.join(__dirname, "..", "index.html"));
const src = fs.readFileSync(file, "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = `window.__p = { facts: () => { const res = [];
  for (const t of SURPRISE_TEMPLATES) {
    surpriseRecent.length = 0; let s = null;
    try { s = generateSurprise(7, { templateIds: [t.id], canonical: true, mirror: false, chaos: false }); } catch (e) { res.push({ id: t.id, err: String(e) }); continue; }
    if (!s || s.failed || s.noRoom) { res.push({ id: t.id, none: JSON.stringify(s).slice(0, 80) }); continue; }
    const solid = new Set(); s.tiles.forEach(k => { if (/^(solid|bomb|spawner|fan|cannon|barrier|magnet|trampoline)/.test(k.key)) solid.add(k.x + "," + k.y); });
    let per = 0, sol = 0; for (let x = 0; x < s.w; x++) for (const y of [0, s.h - 1]) { per++; if (solid.has((s.ox + x) + "," + (s.oy + y))) sol++; }
    for (let y = 1; y < s.h - 1; y++) for (const x of [0, s.w - 1]) { per++; if (solid.has((s.ox + x) + "," + (s.oy + y))) sol++; }
    res.push({ id: t.id, cat: t.category, closed: !!t.closed, w: s.w, h: s.h, perimSolid: +(sol / per).toFixed(2), wrapH: s.wrapH, wrapV: s.wrapV, grav: s.gravity, dir: s.dir });
  } return res; } };`;
const tmp = path.join(os.tmpdir(), "templates_probe.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + "surpriseVaried = true;\n" + HOOK + "\n"));
(async () => { const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); const p = await b.newPage(); p.on("dialog", d => d.accept());
  await p.addInitScript(() => { window.requestAnimationFrame = () => 0; }); await p.goto("file://" + tmp + "#t"); await p.waitForFunction(() => window.__p);
  (await p.evaluate(() => window.__p.facts())).forEach(r => console.log(JSON.stringify(r))); await b.close(); })();
