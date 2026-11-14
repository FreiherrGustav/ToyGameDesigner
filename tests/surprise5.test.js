// Surprise Me suite (not deployed): the closed-box rule (the operator/recency/mix parts were retired with that code in v2.67).
// node tests/surprise5.test.js
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const MIX = Number(process.argv[2] || 1000);
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = `window.__s5 = {
  reset: () => { suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false;   },
  gen: (seed, o) => { const s = generateSurprise(seed, o); return s && (s.failed || s.noRoom) ? { failed: true } : s; },
  push: t => SURPRISE_TEMPLATES.push(t), pop: () => SURPRISE_TEMPLATES.pop(),
  press: (seed, o) => surpriseMe(seed, o), cats: () => SURPRISE_CATEGORY_WEIGHTS,
  facts: () => { const res = []; for (const t of SURPRISE_TEMPLATES) {  const s = generateSurprise(7, { templateIds: [t.id], canonical: true, mirror: false, chaos: false });
      if (!s || s.failed || s.noRoom) { res.push({ id: t.id, bad: true }); continue; }
      const solid = new Set(); s.tiles.forEach(k => { if (/^(solid|bomb|spawner|fan|cannon|barrier|magnet|trampoline)/.test(k.key)) solid.add(k.x + "," + k.y); });
      let per = 0, sol = 0; for (let x = 0; x < s.w; x++) for (const y of [0, s.h - 1]) { per++; if (solid.has((s.ox + x) + "," + (s.oy + y))) sol++; }
      for (let y = 1; y < s.h - 1; y++) for (const x of [0, s.w - 1]) { per++; if (solid.has((s.ox + x) + "," + (s.oy + y))) sol++; }
      res.push({ id: t.id, cat: t.category, closed: !!t.closed, frac: sol / per }); } return res; },
  variantCount: (id, n) => { const set = new Set(); for (let i = 1; i <= n; i++) {  const sp = generateSurprise(i, { templateIds: [id] }); if (sp && !sp.failed && !sp.noRoom) set.add(sp.variant); } return set.size; },
  chain: (n, ids) => {   const out = [];
      for (let i = 0; i < n; i++) { const s = generateSurprise(5000 + i, { avoid: surpriseRecent, avoidVariants: surpriseRecentVariants, templateIds: ids || undefined });
        if (!s || s.failed || s.noRoom) { out.push(null); continue; }
        out.push({ id: s.templateId, cat: s.category, variant: s.variant }); surpriseRecent.push(s.templateId); if (surpriseRecent.length > SURPRISE_RECENT_MAX) surpriseRecent.shift();
        surpriseRecentVariants.push(s.variant); if (surpriseRecentVariants.length > SURPRISE_RECENT_VARIANTS_MAX) surpriseRecentVariants.shift(); } return out; },
};`;
const tmp = path.join(os.tmpdir(), "surprise5_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK));
let pass = 0; const fails = [];
const ok = (c, m, x) => { if (c) { pass++; console.log("ok  ", m); } else { fails.push(m); console.log("FAIL", m, x !== undefined ? JSON.stringify(x).slice(0, 300) : ""); } };
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 900 } })).newPage(); const errors = [];
  page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept());
  await page.goto("file://" + tmp + "#t"); await page.waitForFunction(() => window.__s5);
  const E = (f, ...a) => page.evaluate(([f, a]) => window.__s5[f](...a), [f, a]);

  // ---- A. the closed-box rule: closed = 90% or more of the footprint's border is solid; only toys may be closed ----
  const facts = await E("facts");
  facts.forEach(f => {
    ok(!f.bad, f.id + ": generates");
    if (f.bad) return;
    ok((f.frac >= 0.9) === f.closed, f.id + ": closed flag (" + f.closed + ") agrees with the border (" + Math.round(f.frac * 100) + "% solid)");
    if (f.cat !== "toy") ok(!f.closed && f.frac < 0.9, f.id + " (" + f.cat + "): not a box (border " + Math.round(f.frac * 100) + "% solid)");
  });
  const nClosed = facts.filter(f => f.closed).length; ok(nClosed / facts.length <= 1 / 3, "closed share " + nClosed + "/" + facts.length + " <= one third");

  ok(errors.length === 0, "no page errors", errors.slice(0, 3));
  console.log(`=== SURPRISE Stage 2: ${pass} passed, ${fails.length} failed ===`); fails.forEach(f => console.log(" -", f));
  await browser.close(); process.exit(fails.length ? 1 : 0);
})();
