// Stage 4 probe (not deployed): the three new templates, N seeds x canonical/chaos, 10 s no input. node tests/probe_s4.js [N=12]
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const N = Number(process.argv[2] || 12);
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = require("./surprise.hook.js")() + `window.__f = { build: (seed, id) => { surpriseRecent.length = 0; const r = surpriseMe(seed, { templateIds: [id], chaos: false, canonical: true }); return !!(r && !r.failed); }, dump: (seed, id) => { surpriseRecent.length = 0; const r = surpriseMe(seed, { templateIds: [id], chaos: false, canonical: true }); return { r: JSON.stringify(r).slice(0, 400), pend: typeof surprisePending !== "undefined" ? !!surprisePending : null, actors: actors.map(a => [a.defId, Math.round(a.x), Math.round(a.y)]), g: gravityEnabled, board: board.slice(0, 10).map(row => row.slice(0, 13).map(c => c ? String(c).slice(0, 8) : '.').join('|')) }; }, trace: (seed, id) => { surpriseRecent.length = 0; surpriseMe(seed, { templateIds: [id], chaos: false, canonical: true }); enterPlayMode(); tick(1/60); const out = []; { const o = tryCrushNpc; tryCrushNpc = function (c, t) { const r = o.apply(this, arguments); out.push('  crush? ' + actorDefs[c.defId].temperament.slice(0,4) + ' vy=' + Math.round(c.vy) + ' y=' + Math.round(c.y) + ' -> ' + actorDefs[t.defId].temperament.slice(0,4) + ' y=' + Math.round(t.y) + ' x=' + Math.round(t.x) + ' => ' + r); return r; }; } for (let f = 0; f < 45; f++) { tick(1/60); if (f % 3 === 0) out.push(f + ' ' + actors.filter(a => !a.isPlayer).map(a => actorDefs[a.defId].temperament.slice(0,4) + '@' + Math.round(a.x) + ',' + Math.round(a.y) + (a.vy ? '/' + Math.round(a.vy) : '')).join(' ')); } return out; }, probe: (seed, id, canon) => { surpriseRecent.length = 0;
  const r = surpriseMe(seed, canon ? { templateIds: [id], chaos: false, canonical: true } : { templateIds: [id] }); if (!r) return null;
  enterPlayMode(); tick(1/60); window.__iaStart(); let err = null; try { window.__iaTick(600); } catch (e) { err = String(e); } const ia = window.__iaStop(); return { c: ia.counts, f: ia.first, err }; } };`;
const tmp = path.join(os.tmpdir(), "probe_s4.html"); fs.writeFileSync(tmp, src.replace(anchor, anchor + "surpriseVaried = true;\n" + HOOK));
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  for (const id of ["stonepets", "craterain", "bombrow"]) for (const canon of [true, false]) {
    const agg = {}; let ok = 0, first = [], errs = 0;
    for (let k = 0; k < N; k++) {
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } }); const page = await ctx.newPage(); page.on("dialog", d => d.accept());
      await page.goto("file://" + tmp + "#t"); await page.waitForFunction(() => window.__f);
      const r = await page.evaluate(a => window.__f.probe(a[0], a[1], a[2]), [4000 + k * 71, id, canon]);
      if (!r) { console.log(id, "no build"); continue; } if (r.err) errs++;
      Object.entries(r.c).forEach(([t, v]) => agg[t] = (agg[t] || 0) + v);
      const want = id === "bombrow" ? "impactBomb" : "squash"; if (r.c[want]) { ok++; first.push(r.f[want]); } else if (process.env.SHOWFAIL) console.log('   fail seed', 4000 + k * 71, id, canon ? 'canon' : 'chaos');
      await ctx.close();
    }
    console.log(id.padEnd(10), canon ? "canon" : "chaos", ok + "/" + N, "errs", errs, "first(frame)", first.slice(0, 6).join(","), JSON.stringify(agg));
  }
  await browser.close();
})();
