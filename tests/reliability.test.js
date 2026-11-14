// Surprise Me v2.56 Stage C: per-template reliability of the chain, each template alone (no fillers), chaos on, no input, 10 s.
// usage: node tests/reliability.test.js [runsPerTemplate=25] [html] [out.json]   env: ONLY=id1,id2  FRAMES=600
// honest = >= 2 trigger mechanisms on one loop-free cause path (see causal.test.js). strong = honest AND the path ENDS in an effect
// (gate, cannon, bomb, fan, trampoline): a path that ends in a plate/button/spawner with nothing behind it is decoration, not a chain.
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const N = Number(process.argv[2] || 25), file = path.resolve(process.argv[3] || path.join(__dirname, "..", "index.html")), OUT = process.argv[4], FRAMES = Number(process.env.FRAMES || 600);
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const src = fs.readFileSync(file, "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = require("./causal.hook.js")() + `
  window.__r = { ids: () => SURPRISE_TEMPLATES.map(t => ({ id: t.id, category: t.category })),
    run: (seed, id, frames) => { suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false;  
      const r = surpriseMe(seed, { templateId: id, recent: false, scene: false, chaos: true }); if (!r || !r.templateId) return null;
      enterPlayMode(); tick(1/60); window.__czStart(); let err = null; try { window.__czTick(frames); } catch (e) { err = String(e); }
      const z = window.__czStop(); return { events: z.events, err }; } };
`;
const tmp = path.join(os.tmpdir(), "reliab_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK));
const MECH = { plateOn: "plate", plateOff: "plate", gateOpen: "gate", gateClose: "gate", buttonPress: "button", gravityFlip: "gravity", cannonLoad: "cannon", cannonFire: "cannon", bombArm: "bomb", impact: "bomb", detonate: "bomb", blastClear: "bomb", fanLift: "fan", fanPush: "fan", trampolineLaunch: "trampoline", spawn: "spawner" };
const EFFECT = new Set(["gate", "cannon", "bomb", "fan", "trampoline", "gravity"]);
function steps(path) { const st = []; for (const e of path) { const m = MECH[e.type]; if (!m) continue; if (st.length && st[st.length - 1] === m) continue; if (st.includes(m)) break; st.push(m); } return st; }
function analyse(events) {
  const by = new Map(events.map(e => [e.id, e])), has = new Set(); events.forEach(e => { if (e.cause != null && by.has(e.cause)) has.add(e.cause); });
  let honest = false, strong = false, best = [];
  for (const e of events) { if (has.has(e.id)) continue; const p = []; let c = e; while (c && p.length < 500) { p.push(c); c = c.cause != null ? by.get(c.cause) : null; } p.reverse(); const st = steps(p);
    if (st.length > best.length) best = st; if (st.length >= 2) honest = true; if (st.length >= 2 && EFFECT.has(st[st.length - 1])) strong = true; }
  // a gate that opens must let something go: a `released` or `fall` event whose cause chain runs through a gateOpen
  let freed = false; for (const e of events) { if (e.type !== "released" && e.type !== "fall") continue; let c = e, n = 0; while (c && n++ < 500) { if (c.type === "gateOpen") { freed = true; break; } c = c.cause != null ? by.get(c.cause) : null; } if (freed) break; }
  const pay = events.filter(e => e.char && e.type !== "spawn").map(e => e.f)[0];
  return { honest, strong, freed, steps: best.join(">"), payoff: pay == null ? null : pay / 60 };
}
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const boot = await browser.newPage(); await boot.goto("file://" + tmp + "#t"); await boot.waitForFunction(() => window.__r);
  let ids = await boot.evaluate(() => window.__r.ids()); await boot.close(); if (ONLY) ids = ids.filter(t => ONLY.includes(t.id));
  const jobs = []; ids.forEach(t => { for (let k = 0; k < N; k++) jobs.push({ id: t.id, cat: t.category, seed: 30000 + k * 41 + t.id.length }); });
  const rows = []; let next = 0, errs = 0;
  async function worker() { while (true) { const j = jobs[next++]; if (!j) return;
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } }); const page = await ctx.newPage(); let pe = null; page.on("dialog", d => d.accept()); page.on("pageerror", e => { pe = String(e); });
    try { await page.goto("file://" + tmp + "#t"); await page.waitForFunction(() => window.__r); const r = await page.evaluate(([s, id, f]) => window.__r.run(s, id, f), [j.seed, j.id, FRAMES]);
      if (r) { if (r.err || pe) { errs++; console.log("error", j.id, j.seed, r.err || pe); } rows.push(Object.assign({}, j, analyse(r.events), { n: r.events.length })); } } catch (e) { errs++; }
    await ctx.close(); } }
  await Promise.all([worker(), worker(), worker(), worker()]);
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(rows));
  const by = {}; rows.forEach(r => (by[r.id] = by[r.id] || { cat: r.cat, rows: [] }).rows.push(r));
  const med = a => { a = a.filter(x => x != null).sort((x, y) => x - y); return a.length ? a[a.length >> 1] : null; };
  const pc = (a, f) => Math.round(100 * a.filter(f).length / a.length);
  console.log("template".padEnd(15), "cat".padEnd(9), "n".padStart(3), "honest%".padStart(8), "strong%".padStart(8), "freed%".padStart(7), "payoff".padStart(7), " commonest path");
  Object.entries(by).sort().forEach(([id, b]) => { const c = {}; b.rows.forEach(r => { c[r.steps || "-"] = (c[r.steps || "-"] || 0) + 1; }); const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
    const p = med(b.rows.map(r => r.payoff)); console.log(id.padEnd(15), b.cat.padEnd(9), String(b.rows.length).padStart(3), String(pc(b.rows, r => r.honest)).padStart(8), String(pc(b.rows, r => r.strong)).padStart(8), String(pc(b.rows, r => r.freed)).padStart(7), (p == null ? "-" : p.toFixed(2)).padStart(7), " " + top[0] + " x" + top[1]); });
  console.log("seeds run:", rows.length, "errors:", errs);
  await browser.close(); process.exit(errs ? 1 : 0);
})();
