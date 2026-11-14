// v2.64 activity measurement for the whole-room machines (not deployed): what happens in the first 10 s after the machine starts.
// node tests/machines.activity.js <templateId> [seeds=6] [fps=60] [shotDir]
//  - chain events: events on the causal path that leads to the machine's last chain event, up to 10 s
//  - movers: non-player actors that travelled more than half a tile at some point in the first 10 s (the player and held things excluded)
//  - area: bounding box of everything placed (tiles + actors) before Play, and the share of the 24x18 cells within 2 tiles of a piece
//  - filmstrip: 8 screenshots across the first 10 s of seed 1 (when a shot directory is given)
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const [id, SEEDS = "6", FPS = "60", SHOTS] = process.argv.slice(2);
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = require("./causal.hook.js")() + `
window.__a = { ev: s => eval(s), list: (id, seed) => {   surpriseMe(seed, { templateIds: [id] }); return actors.filter(a => !a.isPlayer).map(a => a.defId + ":" + ((actorDefs[a.defId] || {}).temperament) + "@" + Math.floor(a.x / TILE) + "," + Math.floor(a.y / TILE)); },
  run: (id, seed, fps, shotFrames) => {
   
  const r = surpriseMe(seed, { templateIds: [id] }); if (!r || r.failed || r.pending || r.skipped) return { gen: false, why: JSON.stringify(r) };
  const t = SURPRISE_TEMPLATES.find(t => t.id === id);
  // area before Play
  let x0 = 99, x1 = -1, y0 = 99, y1 = -1; const near = new Set();
  const mark = (x, y) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) near.add(nx + "," + ny); } };
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (board[y][x] || (backgroundBoard[y][x] && isRealBackground(backgroundBoard[y][x]))) mark(x, y);
  actors.forEach(a => mark(Math.floor((a.x + a.w / 2) / TILE), Math.floor((a.y + a.h / 2) / TILE)));
  const bbox = (x1 - x0 + 1) * (y1 - y0 + 1) / (COLS * ROWS), nearShare = near.size / (COLS * ROWS);
  enterPlayMode(); tick(1 / fps); window.__czStart();
  const start = {}; actors.forEach(a => { start[a.id] = { x: a.x, y: a.y }; }); const moved = new Set(); const frames = Math.ceil(10 * fps); const shots = [];
  let err = null; try { for (let i = 0; i < frames; i++) { window.__cz.frame++; tick(1 / fps); window.__czPoll();
      if (i % 6 === 0) actors.forEach(a => { if (a.isPlayer || a.carried) return; const s = start[a.id]; if (s && Math.hypot(a.x - s.x, a.y - s.y) > TILE / 2) moved.add(a.id); if (!s) { start[a.id] = { x: a.x, y: a.y }; } });
      if (shotFrames && shotFrames.includes(i)) { renderGame(); shots.push(document.getElementById("gameCanvas").toDataURL("image/png")); }
  } } catch (e) { err = String(e); }
  const z = window.__czStop(); const hero = actors.find(a => a.isPlayer);
  return { gen: true, events: z.events, err, moved: moved.size, bbox, nearShare, lives: typeof lives === "number" ? lives : null, heroAlive: !!hero && playSessionEnded !== "lose", chain: t.expect.chain, variant: r.variant, shots, movers: [...moved].length }; } };`;
const tmp = path.join(os.tmpdir(), "machines_act.html"); fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK));
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); const fps = Number(FPS); const out = [];
  for (let seed = 1; seed <= Number(SEEDS); seed++) {
    const ctx = await b.newContext({ viewport: { width: 1000, height: 700 } }); const p = await ctx.newPage(); p.on("dialog", d => d.accept()); let pe = null; p.on("pageerror", e => { pe = String(e); });
    await p.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    await p.goto("file://" + tmp + "#t"); await p.waitForFunction(() => window.__a);
    const shotFrames = SHOTS && seed === 1 ? [0, 1, 2, 3, 4, 5, 6, 7].map(k => Math.floor(k * 10 * fps / 8 + 5)) : null;
    const r = await p.evaluate(([i, s, f, sf]) => window.__a.run(i, s, f, sf), [id, seed, fps, shotFrames]);
    if (!r.gen) { out.push({ seed, why: r.why }); await ctx.close(); continue; }
    const byId = new Map(r.events.map(e => [e.id, e])); // the path to the LAST event of the declared chain's final type
    // the cause path to the final-type event with the longest path (streams of repeated events keep later, shorter ones)
    const finals = r.events.filter(e => e.type === r.chain[r.chain.length - 1]); if (!finals.length) finals.push(r.events.filter(e => e.type === "plateOn").pop());
    let pathEv = [];
    finals.forEach(f0 => { const pe2 = []; let c = f0, n = 0; while (c && n++ < 800) { pe2.push(c); c = c.cause != null ? byId.get(c.cause) : null; } if (pe2.filter(e => e.f / fps <= 10).length > pathEv.filter(e => e.f / fps <= 10).length) pathEv = pe2; });
    const within = pathEv.filter(e => e.f / fps <= 10);
    out.push({ seed, variant: r.variant, chainEvents10s: within.length, distinctTypes10s: new Set(within.map(e => e.type)).size, allEvents10s: r.events.length, movers: r.movers, bboxPct: Math.round(100 * r.bbox), nearPct: Math.round(100 * r.nearShare), heroAlive: r.heroAlive, err: r.err || pe });
    if (SHOTS && r.shots && r.shots.length) { fs.mkdirSync(SHOTS, { recursive: true }); r.shots.forEach((d, k) => fs.writeFileSync(path.join(SHOTS, id + "-film-" + (k + 1) + ".png"), Buffer.from(d.split(",")[1], "base64"))); }
    await ctx.close();
  }
  console.table(out);
  const ok = out.every(o => !o.why && !o.err && o.chainEvents10s >= 5 && o.movers >= 6 && o.bboxPct >= 60 && o.heroAlive);
  console.log(id, ok ? "ACTIVITY OK" : "ACTIVITY BELOW TARGET", "(chain events >= 5, movers >= 6, bbox >= 60%, hero alive)");
  await b.close();
})();
