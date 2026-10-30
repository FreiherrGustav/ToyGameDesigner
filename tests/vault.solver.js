// Stonekeeper's Vault solver (not shipped). Searches push sequences per room on the grids dumped by tests/vault.dump.js.
// usage: node tests/vault.solver.js <vault.json> [sampleWalks=300]
// Model (cell level, same rules the real rooms rely on): the hero walks freely inside his region; moving into an object pushes it one
// cell if the next cell is free; objects never enter walls, lava, closed gates or other objects; a gate is open while a plate of its color
// has an object on it; a state where a gate would close on an object standing in it is dropped. Room 3 extra "throw": a hero region touching
// a stone and a cell next to the lava (col 13, rows 7-9) throws that stone onto the plate block in that row. The grab-and-carry-anywhere
// escape hatch is NOT modelled in the "push only" results (worst case: a kid who never grabs).
const fs = require("fs");
const rooms = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const WALKS = +(process.argv[3] || 300);
const W = 24, H = 18, DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function build(r, ri) {
  const g = { w: W, h: H, wall: new Uint8Array(W * H), lava: new Uint8Array(W * H), gate: new Array(W * H).fill(null), plate: new Array(W * H).fill(null),
    lock: new Array(W * H).fill(null), exit: -1, key: -1, objs: [], hero: -1, throwRows: [], throwFrom: -1 };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [k, col] = r.cells[y][x] || [null, null]; const i = y * W + x; if (!k) continue;
    const [geo, mod] = k.split(":");
    if (geo === "solid") g.wall[i] = 1;
    else if (geo.startsWith("barrier")) g.gate[i] = col;
    else if (geo === "plate") g.plate[i] = col;
    else if (geo === "lockeddoor") g.lock[i] = col;
    else if (geo === "goal") g.exit = i;
    else if (geo === "door" && x === W - 1) g.exit = i;           // the exit door is the east one
    if (mod === "lethal") g.lava[i] = 1;
  }
  r.actors.forEach(a => {
    const i = a.y * W + a.x;
    if (a.def === "pushable") g.objs.push({ kind: "c", at: i });
    else if (a.def === "largestone") g.objs.push({ kind: "s", at: i });
    else if (a.def === "colKey") g.key = i;
  });
  g.hero = ri === 0 ? 8 * W + 2 : 8 * W + 0;                         // room 1 start; rooms 2/3 arrive on the west door
  if (ri === 2) { g.throwRows = [7, 8, 9]; g.throwCol = 13; }
  return g;
}
const key = (objs, region, keyHeld) => objs.map(o => o.kind + o.at).sort().join(",") + "|" + region + "|" + (keyHeld ? 1 : 0);
function channels(g, objs) { const on = {}; objs.forEach(o => { const c = g.plate[o.at]; if (c) on[c] = true; }); return on; }
function flood(g, objs, start, keyHeld, on) {
  const occ = new Set(objs.map(o => o.at)); const seen = new Uint8Array(W * H); const st = [start]; seen[start] = 1; let kh = keyHeld;
  while (st.length) { const c = st.pop(); if (c === g.key) kh = true;
    const x = c % W, y = (c / W) | 0;
    for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const n = ny * W + nx;
      if (seen[n] || g.wall[n] || g.lava[n] || occ.has(n)) continue;
      if (g.gate[n] && !on[g.gate[n]]) continue;
      if (g.lock[n] && !kh) { continue; }
      seen[n] = 1; st.push(n); } }
  if (kh && !keyHeld) return flood(g, objs, start, true, on);
  return { seen, keyHeld: kh };
}
function moves(g, objs, region, keyHeld, on) {
  const out = []; const occ = new Map(objs.map((o, i) => [o.at, i]));
  const free = (n, mover) => n >= 0 && !g.wall[n] && !g.lava[n] && !occ.has(n) && !(g.lock[n]) && !(g.gate[n] && !on[g.gate[n]]);
  objs.forEach((o, oi) => {
    const x = o.at % W, y = (o.at / W) | 0;
    for (const [dx, dy] of DIRS) {
      const hx = x - dx, hy = y - dy, tx = x + dx, ty = y + dy;
      if (hx < 0 || hy < 0 || hx >= W || hy >= H || tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
      const h = hy * W + hx, t = ty * W + tx;
      if (!region.seen[h] || !free(t)) continue;
      out.push({ oi, to: t, hero: o.at, push: 1 });
    }
    // throw: a stone, hero touching it, and standing at the lava bank
    if (g.throwRows.length && o.kind === "s") {
      const touch = DIRS.some(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < W && ny < H && region.seen[ny * W + nx]; });
      if (touch) for (const r of g.throwRows) if (region.seen[r * W + g.throwCol]) { const t = r * W + 16; if (!occ.has(t)) out.push({ oi, to: t, hero: r * W + g.throwCol, push: 0 }); }
    }
  });
  return out;
}
function apply(g, st, m) {
  const objs = st.objs.map(o => ({ kind: o.kind, at: o.at })); objs[m.oi].at = m.to;
  const on = channels(g, objs), onOld = channels(g, st.objs);
  // a gate that just closed must not have anything standing in it
  for (const c of Object.keys(onOld)) if (!on[c]) for (let i = 0; i < W * H; i++) if (g.gate[i] === c && objs.some(o => o.at === i)) return null;
  return mk(g, objs, m.hero, st.keyHeld);
}
const regionId = (fl) => { for (let i = 0; i < fl.seen.length; i++) if (fl.seen[i]) return i; return -1; };
function mk(g, objs, hero, keyHeld) {
  const on = channels(g, objs); const fl = flood(g, objs, hero, keyHeld, on);
  return { objs, anchor: regionId(fl), keyHeld: fl.keyHeld, win: g.exit >= 0 && !!fl.seen[g.exit] };
}
function init(g) { return mk(g, g.objs, g.hero, false); }
const stKey = (s) => key(s.objs, s.anchor, s.keyHeld);
const won = (g, s) => s.win;
function expand(g, s) { const on = channels(g, s.objs); const region = flood(g, s.objs, s.anchor, s.keyHeld, on); return moves(g, s.objs, region, s.keyHeld, on); }

function bfs(g, startState, cap) {
  const seen = new Map(); const q = [startState]; seen.set(stKey(startState), null); startState.d = 0; let qi = 0, nStates = 1, deadEnds = 0;
  while (qi < q.length) { const s = q[qi++]; if (won(g, s)) return { solved: true, pushes: s.d, path: pathOf(s, seen), states: nStates };
    if (nStates > cap) return { solved: false, capped: true, states: nStates };
    for (const m of expand(g, s)) { const n = apply(g, s, m); if (!n) continue; const k = stKey(n); if (seen.has(k)) continue;
      n.d = s.d + 1; n.prev = s; n.mv = m; seen.set(k, s); q.push(n); nStates++; } }
  return { solved: false, exhausted: true, states: nStates };
}
function pathOf(s) { const p = []; for (let c = s; c.prev; c = c.prev) p.push(c.mv); return p.reverse(); }
const cellName = (i) => "(" + (i % W) + "," + ((i / W) | 0) + ")";

// every state reachable from the start (exact), then which of them can still reach the exit
function exactDead(g, cap) {
  const start = init(g); const idx = new Map(); const list = []; const edges = [];
  const add = (s) => { const k = stKey(s); if (idx.has(k)) return idx.get(k); const i = list.length; idx.set(k, i); list.push(s); edges.push([]); return i; };
  add(start); if (list.length) for (let i = 0; i < list.length; i++) { if (list.length > cap) return { capped: true, states: list.length };
    const s = list[i]; for (const m of expand(g, s)) { const n = apply(g, s, m); if (!n) continue; const j = add(n); edges[i].push(j); } }
  const rev = list.map(() => []); edges.forEach((es, i) => es.forEach(j => rev[j].push(i)));
  const good = new Uint8Array(list.length); const st = []; list.forEach((s, i) => { if (won(g, s)) { good[i] = 1; st.push(i); } });
  while (st.length) { const j = st.pop(); rev[j].forEach(i => { if (!good[i]) { good[i] = 1; st.push(i); } }); }
  const dead = list.filter((s, i) => !good[i]);
  return { states: list.length, dead: dead.length, sample: dead.slice(0, 2).map(s => s.objs.map(o => o.kind + cellName(o.at)).join(" ")) };
}
// random walks: from the start do N random pushes, then ask whether the exit is still reachable (capped BFS)
function sampleDead(g, walks, len, cap) {
  let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  let dead = 0, capped = 0, ok = 0; const examples = [];
  for (let w = 0; w < walks; w++) {
    let s = init(g); const n = 5 + ((rnd() * len) | 0);
    for (let i = 0; i < n; i++) { const ms = expand(g, s); if (!ms.length) break; const m = ms[(rnd() * ms.length) | 0]; const nx = apply(g, s, m); if (nx) s = nx; }
    s.d = 0; s.prev = null; const r = bfs(g, s, cap);
    if (r.solved) ok++; else if (r.capped) capped++; else { dead++; if (examples.length < 2) examples.push(s.objs.map(o => o.kind + cellName(o.at)).join(" ")); }
  }
  return { walks, ok, dead, capped, examples };
}

let bad = 0; const solutions = [];
rooms.forEach((r, ri) => {
  const g = build(r, ri);
  console.log("\n== Room " + (ri + 1) + ": " + r.name + "  (objects: " + g.objs.map(o => o.kind + cellName(o.at)).join(" ") + ")");
  const res = bfs(g, init(g), 6e6);
  if (!res.solved) { console.log("  NOT SOLVED", JSON.stringify({ capped: res.capped, exhausted: res.exhausted, states: res.states })); bad++; return; }
  console.log("  solvable: yes, shortest = " + res.pushes + " pushes/throws (" + res.states + " states searched)");
  solutions.push({ room: ri, start: g.hero, steps: res.path.map(m => ({ hero: m.hero, to: m.to, push: m.push, from: null })) });
  console.log("  solution: " + res.path.map(m => (m.push ? "push " : "throw ") + cellName(m.hero) + (m.push ? "->" + cellName(m.to) : "->" + cellName(m.to))).join(", "));
  const ex = exactDead(g, ri === 0 ? 3e6 : 3e5);
  if (ex.capped) console.log("  exact dead-end analysis skipped (more than " + ex.states + " states); sampled instead");
  else console.log("  all reachable states: " + ex.states + ", states that can no longer reach the exit: " + ex.dead + (ex.dead ? "  e.g. " + ex.sample.join(" | ") : ""));
  const sm = sampleDead(g, WALKS, 60, 150000);
  console.log("  sampled " + sm.walks + " random push-histories: can still win " + sm.ok + ", stuck " + sm.dead + ", undecided (search cap) " + sm.capped + (sm.examples.length ? "  e.g. " + sm.examples.join(" | ") : ""));
});
if (process.env.SOLUTIONS) fs.writeFileSync(process.env.SOLUTIONS, JSON.stringify(solutions));
process.exit(bad ? 1 : 0);
