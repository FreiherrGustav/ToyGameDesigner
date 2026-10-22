// v2.54 Stage 3 reliability harness (not deployed): N full-variation runs of one machine at several frame rates; the whole expected
// chain (expect.chain, an ordered list of event types along ONE causal path) has to happen. node tests/machines.rel.js <defs.js|index> <id> [runs=100] [fps=30,60,144] [seconds=12]
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const [defsFile, id, RUNS = "100", FPS = "30,60,144", SECS = "12"] = process.argv.slice(2);
const defs = defsFile === "index" ? null : require(path.resolve(defsFile)); const def = defs ? defs.find(d => d.id === id) : null;
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = require("./causal.hook.js")() + `
window.__r = { run: (def, id, seed, fps, secs) => { if (def) SURPRISE_TEMPLATES.push(def); const t = SURPRISE_TEMPLATES.find(t => t.id === id); surpriseRecent.length = 0; surpriseRecentVariants.length = 0;
  const r = surpriseMe(seed, { templateIds: [id] });
  if (!r || r.failed || r.pending || r.skipped) return { gen: false, why: JSON.stringify(r) };
  enterPlayMode(); tick(1 / fps); window.__czStart(); const frames = Math.ceil(secs * fps); let err = null;
  try { for (let i = 0; i < frames; i++) { window.__cz.frame++; tick(1 / fps); window.__czPoll(); } } catch (e) { err = String(e); }
  const z = window.__czStop(); return { gen: true, chain: t.expect.chain, events: z.events, err, variant: r.variant, ops: r.ops, fps }; } };`;
const tmp = path.join(os.tmpdir(), "machines_rel.html"); fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK));
function chainDone(events, chain) {
  const byId = new Map(events.map(e => [e.id, e])); let best = null;
  for (const e of events) { // walk each event's cause path to the root; the types must appear in order along it
    const path_ = []; let cur = e, n = 0; while (cur && n++ < 600) { path_.push(cur); cur = cur.cause != null ? byId.get(cur.cause) : null; }
    path_.reverse(); let k = 0, last = null; for (const p of path_) if (k < chain.length && p.type === chain[k]) { k++; last = p; }
    if (k === chain.length) { if (!best || last.f < best) best = last.f; }
  }
  return best;
}
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  for (const fps of FPS.split(",").map(Number)) {
    let ok = 0, n = 0, errs = 0, times = [], fails = []; let next = 1;
    async function worker() { while (true) { const seed = next++; if (seed > Number(RUNS)) return;
      const ctx = await b.newContext({ viewport: { width: 1000, height: 700 } }); const p = await ctx.newPage(); p.on("dialog", d => d.accept()); let pe = null; p.on("pageerror", e => { pe = String(e); });
      await p.addInitScript(() => { window.requestAnimationFrame = () => 0; });
      try { await p.goto("file://" + tmp + "#t"); await p.waitForFunction(() => window.__r);
        const r = await p.evaluate(([d, i, s, f, sec]) => window.__r.run(d, i, s, f, sec), [def, id, seed, fps, Number(SECS)]); n++;
        if (!r.gen || r.err || pe) { errs++; fails.push(seed + ":" + (r.why || r.err || pe).slice(0, 80)); }
        else { const f = chainDone(r.events, r.chain); if (f != null) { ok++; times.push(f / fps); } else fails.push(seed + ":" + r.variant + " types=" + [...new Set(r.events.map(e => e.type))].join(",")); }
      } catch (e) { errs++; fails.push(seed + ":crash " + String(e).slice(0, 60)); } await ctx.close(); } }
    await Promise.all([worker(), worker(), worker(), worker()]);
    times.sort((a, c) => a - c);
    console.log(id, "fps", fps, "complete", ok + "/" + n, Math.round(100 * ok / n) + "%", "errors", errs, "time s: median", (times[Math.floor(times.length / 2)] || 0).toFixed(2), "max", (times[times.length - 1] || 0).toFixed(2));
    fails.slice(0, 6).forEach(f => console.log("   fail", f));
  }
  await b.close();
})();
