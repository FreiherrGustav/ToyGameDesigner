// Dev tool: builds examples/pinball.json from the user's pinball start (their room frame, spawner lane, slopes) with the machine finished.
// node tests/pinball.gen.js <Pinball_start.json> [out.json]
const fs = require("fs");
const src = JSON.parse(fs.readFileSync(process.argv[2], "utf8")); const out = process.argv[3] || "examples/pinball.json";
const p = src.data, r = p.rooms[0], W = 72, H = 18;
const key = (g, m) => g + ":" + (m || "none");
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { r.board[y][x] = null; r.groundSkinBoard[y][x] = null; r.backgroundBoard[y][x] = null; if (r.groundSkinRotationBoard) r.groundSkinRotationBoard[y][x] = 0; if (r.colorBoard) r.colorBoard[y][x] = null; }
const set = (x, y, k) => { r.board[y][x] = k; };
const solid = (x, y) => set(x, y, "solid:none");
// ---- frame (the author's): ceiling, left wall, the plunger lane walls
for (let x = 5; x <= 21; x++) solid(x, 0);
solid(4, 1); solid(5, 1); solid(3, 2);
for (let y = 3; y <= 17; y++) { solid(3, y); solid(19, y); solid(21, y); }
solid(21, 1);
// ---- plunger lane (col 20): fan at the bottom + air wind up the whole lane; the spawner sits in the right wall and drops each ball in just above the fan
for (let y = 3; y <= 16; y++) set(20, y, "none:wind-n");
set(20, 17, "fan-n:none");
set(21, 16, "spawner-w:none");
// ---- lane exit: air wind west into the field, a fan on the right wall helps
for (const y of [1, 2]) { set(19, y, "none:wind-w"); set(20, y, "none:wind-w"); }
set(21, 2, "fan-w:none");
// ---- funnel slopes (slippery) with solid fill underneath
const slope = (pts) => pts.forEach(([x, y]) => { set(x, y, "solid:slippery"); for (let yy = y + 1; yy <= 17; yy++) solid(x, yy); });
slope([[4, 11], [5, 12], [6, 13], [7, 14], [8, 15]]); slope([[18, 11], [17, 12], [16, 13], [15, 14], [14, 15]]);
for (let y = 12; y <= 17; y++) { solid(4, y); } for (let y = 12; y <= 17; y++) solid(18, y);
// ---- the drain geyser: three fans under the centre and air wind up, so most balls are thrown back into play; the two outer drain cells are lava
for (const x of [10, 11, 12]) { set(x, 17, "fan-n:none"); for (let y = 9; y <= 16; y++) set(x, y, "none:wind-n"); }
set(9, 17, "none:lethal"); r.groundSkinBoard[17][9] = "lthLava"; set(13, 17, "none:lethal"); r.groundSkinBoard[17][13] = "lthLava";
// ---- wind over each slope step carries a resting ball toward the drain
[[5, 11], [6, 12], [7, 13], [8, 14]].forEach(([x, y]) => set(x, y, "none:wind-e")); [[17, 11], [16, 12], [15, 13], [14, 14]].forEach(([x, y]) => set(x, y, "none:wind-w"));
// ---- pop bumpers (trampoline tiles) and posts
const T = [[8, 4], [12, 3], [16, 4], [10, 7], [14, 7]]; T.forEach(([x, y]) => set(x, y, "trampoline:none"));
// (posts removed: balls rested on their top corners)
// ---- cannons
const C = {};
C[ "17,1" ] = "cannon2-sw:none"; C["6,2"] = "cannon2-se:none"; C["4,10"] = "cannon2-ne:none"; C["18,10"] = "cannon2-nw:none";
Object.entries(C).forEach(([k, v]) => { const [x, y] = k.split(",").map(Number); set(x, y, v); });
// ---- actors: the player waits outside the left wall; the spawner drops the default hazard ball
r.actors = r.actors.filter(a => a.isPlayer); const pl = r.actors[0]; pl.x = pl.spawnX = 1.5 * 32; pl.y = pl.spawnY = 17 * 32 + 5; r.startPos = { x: pl.x, y: pl.y };
p.spawnerContents = {};
// ================= decoration: steel rails, a navy playfield, and chasing lights (Paint tiles share one clock; phase-shifted copies make the chase)
const A8 = (f) => { const a = []; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) a.push(f(x, y) || null); return a; };
const panel = (v) => A8((x, y) => ((x * 3 + y * 5 + v * 7) % 11 === 0) ? "#1b2a70" : ((x + y * 2 + v) % 13 === 0 ? "#142058" : "#0b1033"));
const margin = (v) => A8((x, y) => ((x * 5 + y * 3 + v * 4) % 9 === 0) ? "#2a1a50" : "#0e0820");
const bulb = (on, glow, off) => (lit) => A8((x, y) => { const d = Math.hypot(x - 3.5, y - 3.5); if (d < 1.9) return lit ? on : off; if (d < 3.1) return lit ? glow : "#1a1f4a"; return "#0b1033"; });
const COLORS = { R: ["#ff3030", "#a01818", "#3a1020"], Y: ["#ffe030", "#9a8418", "#3a3510"], G: ["#40ff70", "#1a9a3c", "#10351a"], B: ["#40c8ff", "#1a6a9a", "#10283a"], P: ["#ff50e0", "#9a2a88", "#351030"] };
const chase = (c, phase) => { const [on, glow, off] = COLORS[c]; const mk = bulb(on, glow, off); return { frames: [0, 1, 2].map(f => mk((f + phase) % 3 === 0)), frameMs: 260 }; };
const arrow = (phase) => { const mk = (lit) => A8((x, y) => { const c = lit ? "#ffd84a" : "#3a3a20"; if (y >= 1 && y <= 5 && Math.abs(x - 3.5) <= (y - 0.5) * 0.9 && y < 4) return c; if (y >= 4 && y <= 7 && (x === 3 || x === 4)) return c; return "#0b1033"; }); return { frames: [0, 1, 2].map(f => mk((f + phase) % 3 === 0)), frameMs: 220 }; };
const bg = r2 => r2; const BD = p.backgroundTileDefs;
const defBg = (id, name, art, extra) => { BD[id] = Object.assign({ art, name }, extra || {}); if (extra && extra.frames) BD[id].art = extra.frames[0]; };
defBg("pbPanel1", "playfield", panel(0)); defBg("pbPanel2", "playfield 2", panel(1)); defBg("pbPanel3", "playfield 3", panel(2));
defBg("pbMargin1", "cabinet", margin(0)); defBg("pbMargin2", "cabinet 2", margin(1));
for (const c of Object.keys(COLORS)) for (let ph = 0; ph < 3; ph++) defBg("pbLight" + c + ph, "light " + c + (ph + 1), null, chase(c, ph));
for (let ph = 0; ph < 3; ph++) defBg("pbArrow" + ph, "arrow " + (ph + 1), null, arrow(ph));
// ground skin: steel rail with a blue stud
const rail = A8((x, y) => (x === 0 || y === 0) ? "#b7c3df" : (x === 7 || y === 7) ? "#4a5675" : (x === 3 && y === 3) || (x === 4 && y === 4) ? "#40c8ff" : "#7b88a6");
p.groundTileDefs.pbRail = { name: "steel rail", frames: [rail], frameMs: 200, geometry: "solid", modifier: "none" };
if (!p.groundSlotIds.includes("pbRail")) p.groundSlotIds.push("pbRail");
// base layer: every empty cell gets a backdrop (the cabinet outside, the felt inside)
for (let y = 0; y < 18; y++) for (let x = 0; x < 24; x++) {
  const inside = x >= 4 && x <= 18 && y >= 1; r.backgroundBoard[y][x] = inside || (x === 20 && y >= 1) ? "pbPanel" + ((x * 7 + y * 3) % 3 + 1) : "pbMargin" + ((x + y) % 2 + 1);
}
// wall skins
for (let y = 0; y < 18; y++) for (let x = 0; x < 24; x++) if (/^solid:(none|slippery|bouncy)$/.test(r.board[y][x] || "")) r.groundSkinBoard[y][x] = "pbRail";
// light chains (the phase shifts along each chain so the glow travels)
const chainCells = (cells, c) => cells.forEach(([x, y], i) => { r.backgroundBoard[y][x] = "pbLight" + c + (i % 3); });
const col = (x, y0, y1) => { const a = []; for (let y = y0; y <= y1; y++) a.push([x, y]); return a; };
const row = (y, x0, x1) => { const a = []; for (let x = x0; x <= x1; x++) a.push([x, y]); return a; };
chainCells(row(1, 7, 16), "R"); chainCells(col(5, 3, 9), "Y"); chainCells(col(18, 3, 9).reverse(), "Y");
chainCells([[8, 5], [7, 4], [8, 3], [9, 4], [9, 5], [7, 5]], "B"); chainCells([[16, 5], [17, 4], [16, 3], [15, 4], [15, 5], [17, 5]], "B");
chainCells([[12, 4], [11, 3], [13, 3], [12, 2], [11, 4], [13, 4]], "G"); chainCells([[10, 8], [9, 7], [11, 7], [10, 6], [9, 8], [11, 8]], "P"); chainCells([[14, 8], [13, 7], [15, 7], [14, 6], [13, 8], [15, 8]], "P");
// arrows up the plunger lane (a chase)
for (let y = 3; y <= 16; y++) r.backgroundBoard[y][20] = "pbArrow" + (y % 3);
// the margins: marquee chases down both sides and a row of lights over the machine
chainCells(col(0, 0, 17), "P"); chainCells(col(2, 0, 17).reverse(), "Y"); chainCells(col(22, 0, 17), "Y"); chainCells(col(23, 0, 17).reverse(), "P");
chainCells(row(0, 0, 4), "R"); chainCells(row(0, 22, 23), "R");
// the drain lights flash red
chainCells([[9, 16], [13, 16]], "R"); chainCells([[10, 15], [11, 15], [12, 15]], "R");

fs.writeFileSync(out, JSON.stringify(src));
console.log(r.board.slice(0, 18).map((row, y) => String(y).padStart(2) + " " + row.slice(0, 24).map(c => !c ? "." : c.startsWith("solid:slip") ? "S" : c.startsWith("solid:bouncy") ? "B" : c.startsWith("solid") ? "#" : c.startsWith("fan") ? "F" : c.startsWith("none:wind") ? "w" : c.startsWith("cannon") ? "C" : c.startsWith("spawner") ? "X" : c.startsWith("tramp") ? "T" : c.startsWith("none:lethal") ? "L" : "?").join("")).join("\n"));
