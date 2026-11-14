// Stage 4: interaction-counter fuzz. usage: node tests/surprise4.test.js [seeds=1000] [html=index.html] [shotDir]
// For each seed: fresh page, one dice press (seed), Play, 5 simulated seconds with no input, count interaction TYPES
// (debug-only wrappers injected into a temp copy; repo file stays clean). Reports per-template table and the >=2-types rate.
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const N = Number(process.argv[2] || 1000), file = path.resolve(process.argv[3] || path.join(__dirname, "..", "index.html")), SHOTS = process.argv[4];
const src = fs.readFileSync(file, "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
if (!src.includes(anchor)) throw new Error("anchor missing");
const HOOK = require("./surprise.hook.js")() + `
  window.__f = { run: seed => {  const r = surpriseMe(seed); if (!r) return null;
      const t = SURPRISE_TEMPLATES.find(t => t.id === r.templateId) || {};
      enterPlayMode(); tick(1/60); window.__iaStart(); let err = null; try { window.__iaTick(300); } catch (e) { err = String(e); }
      const ia = window.__iaStop(); const types = Object.keys(ia.counts).filter(k => k !== "spawn" && k !== "npcHit");
      return { id: r.templateId, category: t.category, types, counts: ia.counts, err }; },
    probe: (seed, id, opts) => {  const r = surpriseMe(seed, Object.assign({ templateIds: [id] }, opts || {})); if (!r) return null;
      enterPlayMode(); tick(1/60); window.__iaStart(); window.__iaTick(300); const ia = window.__iaStop(); return { c: ia.counts, f: ia.first }; },
    dump: (seed, id) => {  surpriseMe(seed, { templateIds: [id] }); const plates = [];
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < 24; x++) if (String(board[y][x]).startsWith("plate")) plates.push([x, y]);
      const pl = actors.find(a => a.isPlayer); return { plates, px: pl.x / TILE, py: pl.y / TILE, g: gravityEnabled }; },
    shot: seed => {  const r = surpriseMe(seed); enterPlayMode(); tick(1/60); for (let i = 0; i < 120; i++) tick(1/60); return r && r.templateId; } };
`;
const tmp = path.join(os.tmpdir(), "surprise4_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK));
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const rows = []; let errs = 0;
  for (let seed = 1; seed <= N; seed++) {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } }); const page = await ctx.newPage();
    page.on("dialog", d => d.accept()); let pe = null; page.on("pageerror", e => { pe = String(e); });
    try {
      await page.goto("file://" + tmp + "#t"); await page.waitForFunction(() => window.__f);
      const r = await page.evaluate(s => window.__f.run(s), seed);
      if (r) { if (r.err || pe) { errs++; r.err = r.err || pe; } rows.push(r); }
      if (SHOTS && seed <= 5) { /* shots handled in a separate pass below */ }
    } catch (e) { errs++; console.log("seed", seed, "crash", String(e).slice(0, 120)); }
    await ctx.close();
  }
  const by = {}; rows.forEach(r => { (by[r.id] = by[r.id] || { cat: r.category, n: 0, ok2: 0, types: {} }); const b = by[r.id]; b.n++; if (r.types.length >= 2) b.ok2++; r.types.forEach(t => b.types[t] = (b.types[t] || 0) + 1); });
  console.log("template".padEnd(16), "cat".padEnd(9), "n".padStart(4), ">=2 types".padStart(10), "  types seen");
  Object.entries(by).sort((a, b) => a[0].localeCompare(b[0])).forEach(([id, b]) =>
    console.log(id.padEnd(16), String(b.cat).padEnd(9), String(b.n).padStart(4), (Math.round(100 * b.ok2 / b.n) + "%").padStart(10), "  ", Object.keys(b.types).sort().join(",")));
  const nonToy = rows.filter(r => r.category !== "toy" && r.category !== "nonsense");
  const all = rows.length, ge2 = rows.filter(r => r.types.length >= 2).length, nt2 = nonToy.filter(r => r.types.length >= 2).length;
  const dist = {}; rows.forEach(r => dist[r.types.length] = (dist[r.types.length] || 0) + 1);
  console.log("\nseeds run:", all, "errors:", errs, "| types distribution:", JSON.stringify(dist));
  console.log("ALL   >=2 types:", ge2 + "/" + all, (100 * ge2 / all).toFixed(1) + "%");
  console.log("NON-TOY (loop/vignette/room) >=2 types:", nt2 + "/" + nonToy.length, (100 * nt2 / nonToy.length).toFixed(1) + "%");
  const zero = rows.filter(r => r.types.length === 0).length; console.log("zero interaction types:", zero);
  await browser.close(); process.exit(errs ? 1 : 0);
})();
