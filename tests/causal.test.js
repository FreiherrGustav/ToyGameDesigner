// v2.54 Stage 1/4: causal-chain metric over Surprise Me presses. usage: node tests/causal.test.js [seeds=1000] [html] [out.json] [frames=600]
// Fresh page per seed, one dice press (recency cleared, chaos on), Play, N frames with NO input, causal events recorded by tests/causal.hook.js.
// HONEST metric (v2.56 Stage A; a press "passes"): along ONE cause path (root -> leaf) keep only trigger-mechanism events
//   plate (plateOn/Off), gate (gateOpen/Close), button (buttonPress), cannon (cannonLoad/Fire), bomb (bombArm/impact/detonate/blastClear),
//   fan (fanLift/fanPush), trampoline (trampolineLaunch), spawner (spawn). Passive types (wrap, bounce, shove, beltCarry, respawn, lethal, pull,
//   fall, hit, squash, released, capture, warp) never count and are skipped. Consecutive events of one mechanism merge into one step. Walk the steps
//   until a mechanism comes round again (a loop) and stop there. The press passes if that loop-free prefix has >= 2 different mechanisms.
// ROOM-USE test: a non-toy press fails if the bounding box of everything placed (tiles + actors, measured before Play) is < 35% of the 24x18 room.
// The old metric (>= 3 events on a path, >= 2 types of any kind) is kept as the "legacy" column. "Lenient" = >= 1 link, >= 2 types.
// Payoff beat = frame of the first non-spawn event that happened to a character (player or steering NPC).
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const N = Number(process.argv[2] || 1000), file = path.resolve(process.argv[3] || path.join(__dirname, "..", "index.html")), OUT = process.argv[4], FRAMES = Number(process.argv[5] || 600);
const ONLY_T = process.env.TEMPLATE || null, VARY = process.env.VARY ? JSON.parse(process.env.VARY) : null; // force a template / force variation operators on
const src = fs.readFileSync(file, "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
if (!src.includes(anchor)) throw new Error("anchor missing");
const HOOK = require("./causal.hook.js")() + `
  window.__f = { run: (seed, frames, only, vary) => { surpriseRecent.length = 0; surpriseRecentVariants.length = 0; const r = surpriseMe(seed, only ? { templateIds: [only], vary: vary || undefined } : undefined); if (!r) return null;
      const t = SURPRISE_TEMPLATES.find(t => t.id === r.templateId) || {};
      const W = 24, H = 18; const occ = new Set(); let minx = 99, maxx = -1, miny = 99, maxy = -1;
      const add = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return; occ.add(x + "," + y); if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; };
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (board[y][x]) add(x, y);
      actors.forEach(a => add(Math.floor((a.x + a.w / 2) / TILE), Math.floor((a.y + a.h / 2) / TILE)));
      const geo = { occ: occ.size, bw: maxx < 0 ? 0 : maxx - minx + 1, bh: maxx < 0 ? 0 : maxy - miny + 1 };
      enterPlayMode(); tick(1/60); window.__czStart(); let err = null; try { window.__czTick(frames); } catch (e) { err = String(e); }
      const z = window.__czStop(); return { id: r.templateId, category: t.category, authored: !!t.authored, geo, events: z.events, err, ops: r.ops, variant: r.variant }; } };
`;
const tmp = path.join(os.tmpdir(), "causal_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK));
const MECH = { plateOn: "plate", plateOff: "plate", gateOpen: "gate", gateClose: "gate", buttonPress: "button", gravityFlip: "gravity", cannonLoad: "cannon", cannonFire: "cannon",
  bombArm: "bomb", impact: "bomb", detonate: "bomb", blastClear: "bomb", fanLift: "fan", fanPush: "fan", trampolineLaunch: "trampoline", spawn: "spawner" };
function honestPath(path) { // path: events root -> leaf. Returns the loop-free mechanism prefix.
  const steps = []; for (const e of path) { const m = MECH[e.type]; if (!m) continue; if (steps.length && steps[steps.length - 1] === m) continue; if (steps.includes(m)) break; steps.push(m); }
  return steps;
}
function analyse(events) {
  const byId = new Map(events.map(e => [e.id, e])); const hasChild = new Set(); events.forEach(e => { if (e.cause != null && byId.has(e.cause)) hasChild.add(e.cause); });
  let bestEdges = 0, strict = false, lenient = false, anyLink = false, honest = false, bestSteps = [];
  for (const e of events) {
    if (hasChild.has(e.id)) continue; // leaf: walk to the root
    const types = new Set(); let n = 0, cur = e; const path = [];
    while (cur) { types.add(cur.type); path.push(cur); n++; cur = cur.cause != null ? byId.get(cur.cause) : null; if (n > 500) break; }
    path.reverse(); const steps = honestPath(path); if (steps.length > bestSteps.length) bestSteps = steps; if (steps.length >= 2) honest = true;
    if (n - 1 > bestEdges) bestEdges = n - 1;
    if (n >= 2) anyLink = true;
    if (n >= 3 && types.size >= 2) strict = true;
    if (n >= 2 && types.size >= 2) lenient = true;
  }
  const payoff = events.filter(e => e.char && e.type !== "spawn").map(e => e.f)[0];
  const SETTLE = new Set(["shove", "bounce", "trampolineLaunch", "fall", "blastHit"]); // start-up landing noise: ignored in the first 15 frames only
  const settled = events.filter(e => e.char && e.type !== "spawn" && !(e.f <= 15 && SETTLE.has(e.type))).map(e => e.f)[0];
  return { honest, steps: bestSteps.join('>'), strict, lenient, anyLink, bestEdges, payoff: payoff == null ? null : payoff, payoffSettled: settled == null ? null : settled, n: events.length, types: [...new Set(events.map(e => e.type))] };
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
        const r = await page.evaluate(([s, f, o, v]) => window.__f.run(s, f, o, v), [seed, FRAMES, ONLY_T, VARY]);
        if (r) { if (r.err || pe) { errs++; console.log("seed", seed, r.id, "error", r.err || pe); } const a = analyse(r.events); rows.push(Object.assign({ seed, id: r.id, category: r.category, authored: r.authored, geo: r.geo, ops: r.ops || [], variant: r.variant }, a)); }
      } catch (e) { errs++; console.log("seed", seed, "crash", String(e).slice(0, 120)); }
      await ctx.close();
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  rows.sort((a, b) => a.seed - b.seed);
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(rows));
  const med = a => { if (!a.length) return null; a = a.slice().sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
  const AREA = 24 * 18; rows.forEach(r => { r.bbP = 100 * r.geo.bw * r.geo.bh / AREA; r.occP = 100 * r.geo.occ / AREA; });
  const exempt = c => c === "toy" || c === "nonsense";
  const CHAIN_PASS = 85, ROOM_PASS = 80; // a TEMPLATE passes the chain test at >= 85% of its presses, the room test at >= 80% of its presses with a box >= 35%
  const by = {}; rows.forEach(r => { const b = (by[r.id] = by[r.id] || { cat: r.category, rows: [] }); b.rows.push(r); });
  const pc = (r, f) => Math.round(100 * r.filter(f).length / r.length);
  const table = Object.entries(by).map(([id, b]) => { const r = b.rows; return { id, cat: b.cat, n: r.length, honest: pc(r, x => x.honest), legacy: pc(r, x => x.strict), bb: Math.round(med(r.map(x => x.bbP))), roomOk: pc(r, x => x.bbP >= 35), payoff: med(r.filter(x => x.payoff != null).map(x => x.payoff / 60)), steps: (() => { const c = {}; r.forEach(x => { if (x.steps) c[x.steps] = (c[x.steps] || 0) + 1; }); return (Object.entries(c).sort((a, b) => b[1] - a[1])[0] || ["-"])[0]; })() }; }).sort((a, b) => a.id.localeCompare(b.id));
  console.log("template".padEnd(16), "cat".padEnd(9), "n".padStart(4), "honest%".padStart(8), "legacy%".padStart(8), "bbox%med".padStart(9), "box>=35%".padStart(9), "payoff s".padStart(9), "chain".padStart(6), "room".padStart(6), " commonest honest path");
  table.forEach(t => console.log(t.id.padEnd(16), t.cat.padEnd(9), String(t.n).padStart(4), String(t.honest).padStart(8), String(t.legacy).padStart(8), String(t.bb).padStart(9), String(t.roomOk).padStart(9), String(t.payoff == null ? "-" : t.payoff.toFixed(2)).padStart(9), (t.honest >= CHAIN_PASS ? "PASS" : "FAIL").padStart(6), (t.roomOk >= ROOM_PASS ? "PASS" : "FAIL").padStart(6), " " + t.steps));
  const nonToy = rows.filter(r => !exempt(r.category));
  const show = (label, r) => console.log(label.padEnd(26), "n=" + r.length, "honest chain " + pc(r, x => x.honest) + "%", "legacy " + pc(r, x => x.strict) + "%", "room-use pass(>=35%) " + pc(r, x => x.bbP >= 35) + "%", "box>=40% " + pc(r, x => x.bbP >= 40) + "%", "median box " + Math.round(med(r.map(x => x.bbP))) + "%");
  console.log(""); show("ALL presses", rows); show("NON-TOY", nonToy);
  ["loop", "vignette", "room", "toy", "nonsense"].forEach(c => { const r = rows.filter(x => x.category === c); if (r.length) show("  " + c + " (" + (100 * r.length / rows.length).toFixed(1) + "% of presses)", r); });
  const machines = table.filter(t => t.n >= 5 && t.honest >= 95).map(t => t.id);
  console.log("\ntrue machines (honest >= 95%):", machines.join(", ") || "none", "| share of presses:", (100 * rows.filter(r => machines.includes(r.id)).length / rows.length).toFixed(1) + "%");
  console.log("seeds run:", rows.length, "errors:", errs);
  await browser.close(); process.exit(errs ? 1 : 0);
})();
