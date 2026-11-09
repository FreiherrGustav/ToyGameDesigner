// Surprise Me curation review (v2.65 Stage 0/1, report only, not deployed): per-template evidence at 30/60/144 fps.
// usage: node tests/curation.evidence.js [seedsPerFps=4] [out.json]   env: ONLY=id1,id2  FPSLIST=30,60,144
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const N = Number(process.argv[2] || 4), OUT = process.argv[3], FPSLIST = (process.env.FPSLIST || "30,60,144").split(",").map(Number);
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = require("./causal.hook.js")() + `
window.__e = {
  meta: () => SURPRISE_TEMPLATES.map(t => { const parts = surpriseTemplateParts(t); const p0 = parts[0]; const leg = {}; parts.forEach(p => Object.values(p.legend || {}).forEach(v => String(v).split("&").forEach(x => { leg[x] = 1; })));
    return { id: t.id, category: t.category, filler: !!t.filler, exact: !!t.exact, authored: !!t.authored, ext: !!t.ext, weight: t.weight == null ? 1 : t.weight, closed: !!t.closed, stooge: t.stooge || "", names: t.names.length,
      wide: surpriseIsWide(t), rooms: parts.length, w: p0.rows[0].length, h: p0.rows.length, footprint: p0.rows[0].length * p0.rows.length / (ROWS * COLS), gravity: (t.room || {}).gravity, dir: (t.room || {}).dir || "down",
      chain: (t.expect || {}).chain || null, selfStart: !!(t.expect || {}).selfStart, needsInput: !!(t.expect || {}).needsInput, check: (t.expect || {}).check || null, vary: Object.keys(t.vary || {}), pieces: Object.keys(leg), strip: !!t.strip, requires: t.requires }; }),
  run: (id, seed, fps) => {
    suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false; surpriseRecent.length = 0; surpriseRecentVariants.length = 0;
    const r = surpriseMe(seed, { templateIds: [id], recent: false, scene: false, chaos: true }); if (!r || r.failed || r.pending || r.skipped || !r.templateId) return { gen: false };
    let x0 = 99, x1 = -1, y0 = 99, y1 = -1; const mark = (x, y) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (board[y][x] || (backgroundBoard[y][x] && isRealBackground(backgroundBoard[y][x]))) mark(x, y);
    actors.forEach(a => mark(Math.floor((a.x + a.w / 2) / TILE), Math.floor((a.y + a.h / 2) / TILE)));
    const bbox = (x1 - x0 + 1) * (y1 - y0 + 1) / (COLS * ROWS);
    enterPlayMode(); tick(1 / fps); window.__czStart();
    const start = {}; actors.forEach(a => { start[a.id] = { x: a.x, y: a.y }; }); const moved = new Set(); const frames = Math.ceil(10 * fps); let err = null, first = null; const cum = [];
    try { for (let i = 0; i < frames; i++) { window.__cz.frame++; tick(1 / fps); window.__czPoll();
      if (i % 6 === 0) actors.forEach(a => { if (a.isPlayer || a.carried) return; const s = start[a.id]; if (s && Math.hypot(a.x - s.x, a.y - s.y) > TILE / 2) moved.add(a.id); if (!s) start[a.id] = { x: a.x, y: a.y }; });
      if (first == null && window.__cz.events.some(e => e.type !== "spawn" && !/^(shove|bounce|fall|blastHit)$/.test(e.type) || (e.type !== "spawn" && e.f > 15))) first = i / fps;
    } } catch (e) { err = String(e); }
    const z = window.__czStop(); const hero = actors.find(a => a.isPlayer);
    return { gen: true, events: z.events, err, moved: moved.size, bbox, lives: typeof lives === "number" ? lives : null, heroAlive: !!hero && playSessionEnded !== "lose", end: playSessionEnded || null, first };
  } };`;
const tmp = path.join(os.tmpdir(), "curation_hooked.html"); fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK));
const MECH = { plateOn: "plate", plateOff: "plate", gateOpen: "gate", gateClose: "gate", buttonPress: "button", gravityFlip: "gravity", cannonLoad: "cannon", cannonFire: "cannon", bombArm: "bomb", impact: "bomb", detonate: "bomb", blastClear: "bomb", fanLift: "fan", fanPush: "fan", trampolineLaunch: "trampoline", spawn: "spawner" };
const EFFECT = new Set(["gate", "cannon", "bomb", "fan", "trampoline", "gravity"]);
function steps(p) { const st = []; for (const e of p) { const m = MECH[e.type]; if (!m) continue; if (st.length && st[st.length - 1] === m) continue; if (st.includes(m)) break; st.push(m); } return st; }
function analyse(events) {
  const by = new Map(events.map(e => [e.id, e])), has = new Set(); events.forEach(e => { if (e.cause != null && by.has(e.cause)) has.add(e.cause); });
  let honest = false, strong = false, best = []; const mech = new Set(events.map(e => MECH[e.type]).filter(Boolean)); mech.delete("spawner");
  for (const e of events) { if (has.has(e.id)) continue; const p = []; let c = e; while (c && p.length < 500) { p.push(c); c = c.cause != null ? by.get(c.cause) : null; } p.reverse(); const st = steps(p);
    if (st.length > best.length) best = st; if (st.length >= 2) honest = true; if (st.length >= 2 && EFFECT.has(st[st.length - 1])) strong = true; }
  let freed = false; for (const e of events) { if (e.type !== "released" && e.type !== "fall") continue; let c = e, n = 0; while (c && n++ < 500) { if (c.type === "gateOpen") { freed = true; break; } c = c.cause != null ? by.get(c.cause) : null; } if (freed) break; }
  const gateOpened = events.some(e => e.type === "gateOpen"), plateOn = events.some(e => e.type === "plateOn");
  const types = new Set(events.filter(e => e.type !== "spawn").map(e => e.type));
  return { honest, strong, freed, steps: best.join(">"), gateOpened, plateOn, nTypes: types.size, types: [...types] };
}
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const boot = await browser.newPage(); await boot.goto("file://" + tmp + "#t"); await boot.waitForFunction(() => window.__e);
  let meta = await boot.evaluate(() => window.__e.meta()); await boot.close(); if (ONLY) meta = meta.filter(t => ONLY.includes(t.id));
  const jobs = []; meta.forEach(t => FPSLIST.forEach(fps => { for (let k = 0; k < N; k++) jobs.push({ id: t.id, fps, seed: 50000 + k * 37 + t.id.length * 3 }); }));
  const rows = []; let next = 0;
  async function worker() { while (true) { const j = jobs[next++]; if (!j) return;
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } }); const page = await ctx.newPage(); let pe = null; page.on("dialog", d => d.accept()); page.on("pageerror", e => { pe = String(e); });
    try { await page.addInitScript(() => { window.requestAnimationFrame = () => 0; }); await page.goto("file://" + tmp + "#t"); await page.waitForFunction(() => window.__e);
      const r = await page.evaluate(([s, id, f]) => window.__e.run(id, s, f), [j.seed, j.id, j.fps]);
      if (!r.gen) rows.push(Object.assign({}, j, { gen: false })); else { const a = analyse(r.events); delete r.events; rows.push(Object.assign({}, j, r, a, { err: r.err || pe })); } } catch (e) { rows.push(Object.assign({}, j, { gen: false, err: String(e) })); }
    await ctx.close(); } }
  await Promise.all([worker(), worker(), worker(), worker()]);
  if (OUT) fs.writeFileSync(OUT, JSON.stringify({ meta, rows }));
  console.log("runs", rows.length, "gen-failed", rows.filter(r => !r.gen).length, "errors", rows.filter(r => r.err).length);
  await browser.close();
})();
