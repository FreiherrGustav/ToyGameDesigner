// v2.54 Stage 1/4: causal-chain metric over Surprise Me presses. usage: node tests/causal.test.js [seeds=1000] [html] [out.json] [frames=600]
// Fresh page per seed, one dice press (recency cleared, chaos on), Play, N frames with NO input, causal events recorded by tests/causal.hook.js.
// Metric (a press "passes"): some cause chain has >= 2 links (>= 3 events) and >= 2 different event types. "Lenient" = >= 1 link, >= 2 types.
// Payoff beat = frame of the first non-spawn event that happened to a character (player or steering NPC).
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const N = Number(process.argv[2] || 1000), file = path.resolve(process.argv[3] || path.join(__dirname, "..", "index.html")), OUT = process.argv[4], FRAMES = Number(process.argv[5] || 600);
const src = fs.readFileSync(file, "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
if (!src.includes(anchor)) throw new Error("anchor missing");
const HOOK = require("./causal.hook.js")() + `
  window.__f = { run: (seed, frames) => { surpriseRecent.length = 0; const r = surpriseMe(seed); if (!r) return null;
      const t = SURPRISE_TEMPLATES.find(t => t.id === r.templateId) || {};
      enterPlayMode(); tick(1/60); window.__czStart(); let err = null; try { window.__czTick(frames); } catch (e) { err = String(e); }
      const z = window.__czStop(); return { id: r.templateId, category: t.category, events: z.events, err }; } };
`;
const tmp = path.join(os.tmpdir(), "causal_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK));
function analyse(events) {
  const byId = new Map(events.map(e => [e.id, e])); const hasChild = new Set(); events.forEach(e => { if (e.cause != null && byId.has(e.cause)) hasChild.add(e.cause); });
  let bestEdges = 0, strict = false, lenient = false, anyLink = false;
  for (const e of events) {
    if (hasChild.has(e.id)) continue; // leaf: walk to the root
    const types = new Set(); let n = 0, cur = e;
    while (cur) { types.add(cur.type); n++; cur = cur.cause != null ? byId.get(cur.cause) : null; if (n > 500) break; }
    if (n - 1 > bestEdges) bestEdges = n - 1;
    if (n >= 2) anyLink = true;
    if (n >= 3 && types.size >= 2) strict = true;
    if (n >= 2 && types.size >= 2) lenient = true;
  }
  const payoff = events.filter(e => e.char && e.type !== "spawn").map(e => e.f)[0];
  const settled = events.filter(e => e.char && e.type !== "spawn" && e.f > 15).map(e => e.f)[0]; // ignore the 15-frame start-up settle (things landing on their first frames)
  return { strict, lenient, anyLink, bestEdges, payoff: payoff == null ? null : payoff, payoffSettled: settled == null ? null : settled, n: events.length, types: [...new Set(events.map(e => e.type))] };
}
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const rows = []; let errs = 0; let next = 1;
  async function worker() {
    while (true) {
      const seed = next++; if (seed > N) return;
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } }); const page = await ctx.newPage();
      page.on("dialog", d => d.accept()); let pe = null; page.on("pageerror", e => { pe = String(e); });
      try {
        await page.goto("file://" + tmp + "#t"); await page.waitForFunction(() => window.__f);
        const r = await page.evaluate(([s, f]) => window.__f.run(s, f), [seed, FRAMES]);
        if (r) { if (r.err || pe) { errs++; console.log("seed", seed, r.id, "error", r.err || pe); } const a = analyse(r.events); rows.push(Object.assign({ seed, id: r.id, category: r.category }, a)); }
      } catch (e) { errs++; console.log("seed", seed, "crash", String(e).slice(0, 120)); }
      await ctx.close();
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  rows.sort((a, b) => a.seed - b.seed);
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(rows));
  const med = a => { if (!a.length) return null; a = a.slice().sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
  const by = {}; rows.forEach(r => { const b = (by[r.id] = by[r.id] || { cat: r.category, rows: [] }); b.rows.push(r); });
  const fmt = r => { const n = r.length, pc = f => Math.round(100 * r.filter(f).length / n); return { n, strict: pc(x => x.strict), lenient: pc(x => x.lenient), nochain: pc(x => !x.anyLink), payoff: med(r.filter(x => x.payoff != null).map(x => x.payoff / 60)), payoffS: med(r.filter(x => x.payoffSettled != null).map(x => x.payoffSettled / 60)), nopayoff: pc(x => x.payoff == null) }; };
  console.log("template".padEnd(16), "cat".padEnd(9), "n".padStart(4), "strict%".padStart(8), "lenient%".padStart(9), "noChain%".padStart(9), "payoff(s,med)".padStart(14), "after-settle".padStart(13), "noPayoff%".padStart(10));
  const table = Object.entries(by).map(([id, b]) => [id, b.cat, fmt(b.rows)]).sort((a, b) => a[0].localeCompare(b[0]));
  table.forEach(([id, cat, f]) => console.log(id.padEnd(16), String(cat).padEnd(9), String(f.n).padStart(4), String(f.strict).padStart(8), String(f.lenient).padStart(9), String(f.nochain).padStart(9), String(f.payoff == null ? "-" : f.payoff.toFixed(2)).padStart(14), String(f.payoffS == null ? "-" : f.payoffS.toFixed(2)).padStart(13), String(f.nopayoff).padStart(10)));
  const nonToy = rows.filter(r => r.category !== "toy" && r.category !== "nonsense");
  const show = (label, r) => { const f = fmt(r); console.log(label.padEnd(26), "n=" + f.n, "strict " + f.strict + "%", "lenient " + f.lenient + "%", "no chain " + f.nochain + "%", "median payoff " + (f.payoff == null ? "-" : f.payoff.toFixed(2) + "s"), "no payoff " + f.nopayoff + "%"); };
  console.log(""); show("ALL presses", rows); show("NON-TOY (loop/vig/room)", nonToy);
  ["loop", "vignette", "room", "toy", "nonsense"].forEach(c => { const r = rows.filter(x => x.category === c); if (r.length) show("  " + c, r); });
  console.log("\nfive lowest strict (n>=5):", table.filter(t => t[2].n >= 5).sort((a, b) => a[2].strict - b[2].strict).slice(0, 5).map(t => t[0] + " " + t[2].strict + "%").join(", "));
  console.log("seeds run:", rows.length, "errors:", errs);
  await browser.close(); process.exit(errs ? 1 : 0);
})();
