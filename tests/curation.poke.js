// Surprise Me curation review (v2.65, report only, not deployed): "poke it" test. For each template, build it, delete ONE piece a kid could drag away
// (a non-player actor, or a mechanism tile: plate/gate/cannon/fan/bomb/spawner/magnet/trampoline/button/black hole), run 10 s and compare with the unpoked run.
// A poke "shows" when the set of interaction types changes or the event count changes by 30%+. usage: node tests/curation.poke.js [seeds=2] [out.json]
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const SEEDS = Number(process.argv[2] || 2), OUT = process.argv[3];
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = require("./causal.hook.js")() + `
window.__p = { ids: () => SURPRISE_TEMPLATES.map(t => t.id),
  run: (id, seed, which) => {
    Math.random = (function () { let a = seed * 7919 + 13; return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; }; })();
    suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false; surpriseRecent.length = 0; surpriseRecentVariants.length = 0;
    const r = surpriseMe(seed, { templateIds: [id], recent: false, scene: false, chaos: false, canonical: true, mirror: false }); if (!r || r.failed || r.pending || r.skipped || !r.templateId) return { gen: false };
    const MECHG = /^(plate|barrier|cannon2|fan|bomb2|spawner|magnet|trampoline|pushbutton|gravitywell)/;
    const cands = []; actors.forEach(a => { if (!a.isPlayer) cands.push({ kind: "actor", a }); });
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { const k = board[y][x]; if (k && MECHG.test(k)) cands.push({ kind: "tile", x, y }); }
    const n = cands.length; if (which >= 0) { if (!n) return { gen: true, n: 0 };
      const c = cands[Math.floor((which + 0.5) * n / 3) % n]; if (c.kind === "actor") actors = actors.filter(a => a !== c.a); else { board[c.y][c.x] = null; colorBoard[c.y][c.x] = null; } }
    enterPlayMode(); tick(1 / 60); window.__czStart(); let err = null; try { for (let i = 0; i < 600; i++) { window.__cz.frame++; tick(1 / 60); window.__czPoll(); } } catch (e) { err = String(e); }
    const z = window.__czStop(); const types = {}; z.events.forEach(e => { if (e.type !== "spawn") types[e.type] = (types[e.type] || 0) + 1; });
    return { gen: true, n, types, total: z.events.filter(e => e.type !== "spawn").length, err }; } };`;
const tmp = path.join(os.tmpdir(), "poke_hooked.html"); fs.writeFileSync(tmp, src.replace(anchor, anchor + "surpriseVaried = true;\n" + HOOK));
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const boot = await b.newPage(); await boot.goto("file://" + tmp + "#t"); await boot.waitForFunction(() => window.__p); let ids = await boot.evaluate(() => window.__p.ids()); await boot.close(); if (ONLY) ids = ids.filter(i => ONLY.includes(i));
  const jobs = []; ids.forEach(id => { for (let s = 0; s < SEEDS; s++) for (const w of [-1, 0, 1, 2]) jobs.push({ id, seed: 700 + s * 11, which: w }); });
  const rows = []; let next = 0;
  async function worker() { while (true) { const j = jobs[next++]; if (!j) return; const ctx = await b.newContext({ viewport: { width: 1000, height: 700 } }); const p = await ctx.newPage(); p.on("dialog", d => d.accept());
    try { await p.addInitScript(() => { window.requestAnimationFrame = () => 0; }); await p.goto("file://" + tmp + "#t"); await p.waitForFunction(() => window.__p); rows.push(Object.assign({}, j, await p.evaluate(([i, s, w]) => window.__p.run(i, s, w), [j.id, j.seed, j.which]))); } catch (e) { rows.push(Object.assign({}, j, { gen: false, err: String(e) })); } await ctx.close(); } }
  await Promise.all([worker(), worker(), worker(), worker()]);
  const res = {}; ids.forEach(id => { let shows = 0, tried = 0, pieces = 0;
    for (let s = 0; s < SEEDS; s++) { const base = rows.find(r => r.id === id && r.seed === 700 + s * 11 && r.which === -1); if (!base || !base.gen) continue; pieces = Math.max(pieces, base.n);
      for (const w of [0, 1, 2]) { const r = rows.find(q => q.id === id && q.seed === base.seed && q.which === w); if (!r || !r.gen || !r.types) continue; tried++;
        const ka = Object.keys(base.types).sort().join(), kb = Object.keys(r.types).sort().join(); const ratio = base.total ? Math.abs(r.total - base.total) / base.total : (r.total ? 1 : 0);
        if (ka !== kb || ratio >= 0.3) shows++; } }
    res[id] = { pokeable: pieces, tried, shows, rate: tried ? shows / tried : null }; });
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(res)); console.log(JSON.stringify(res)); await b.close();
})();
