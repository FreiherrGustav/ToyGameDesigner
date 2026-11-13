// Dev generator (not shipped): writes the two "to-be-watched" Surprise Me entries (fanwindmill, lavalamp) into index.html.
// node tests/watch.gen.js  inserts both entries into index.html (they ship in Surprise Me). Fan Windmill's hero is the Princess preset (watch.princess.json).
const fs = require("fs"), path = require("path");
const IDX = path.join(__dirname, "..", "index.html");
const W = 24, H = 18;
const solid = c => Array(64).fill(c);
const grid = (rows, map) => rows.join("").split("").map(ch => map[ch] || null);
const hex = (a, b, c) => "#" + [a, b, c].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const mix = (c1, c2, t) => { const p = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)); const a = p(c1), b = p(c2); return hex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t); };
const speckle = (base, spec, pts) => { const a = solid(base); pts.forEach(i => a[i] = spec); return a; };

// ---------------- Fan Windmill ----------------
function windmill() {
  const rows = Array.from({ length: H }, () => Array(W).fill("."));
  const back = Array.from({ length: H }, () => Array(W).fill("s"));
  const bgs = {};
  const sky1 = "#8fd3f4", sky2 = "#9bdaf6";
  bgs.s = { name: "sky", art: speckle(sky1, "#b6e6fa", [10, 45]) };
  bgs.j = { name: "sky 2", art: speckle(sky2, "#b6e6fa", [20, 53]) };
  const pals = [["#ffd54f", "#ffb300", "#ff7043"], ["#f8a5c2", "#e8639a", "#ad1457"], ["#a5e8b5", "#4cc777", "#1b8f4a"], ["#ffcc80", "#ff9800", "#e65100"], ["#b39ddb", "#7e57c2", "#4527a0"], ["#80deea", "#26c6da", "#00838f"]];
  pals.forEach((p, i) => {
    bgs["pa" + i] = { name: "windmill path " + (i + 1), art: speckle(p[0], p[1], [9, 14, 49, 54, 27, 36]) };
    bgs["hb" + i] = { name: "windmill hub " + (i + 1), art: speckle(mix(p[0], "#ffffff", 0.45), p[1], [27, 28, 35, 36]) };
    bgs["hc" + i] = { name: "windmill hub core " + (i + 1), art: speckle(p[1], p[2], [27, 28, 35, 36]) };
  });
  let n = 0;
  for (let gy = 0; gy < 2; gy++) for (let gx = 0; gx < 3; gx++) {
    const ox = gx * 8, oy = gy * 9, mirror = (gx + gy) % 2 === 1, pi = n++;
    const X = x => ox + (mirror ? 7 - x : x), Y = y => oy + y;
    const put = (x, y, ch) => { rows[Y(y)][X(x)] = ch; };
    const E = mirror ? "W" : "E", Wd = mirror ? "E" : "W";
    put(0, 1, E); put(6, 0, "S"); put(7, 6, Wd); put(1, 7, "N");
    for (let x = 1; x <= 6; x++) { back[Y(1)][X(x)] = "pa" + pi; back[Y(6)][X(x)] = "pa" + pi; }
    for (let y = 1; y <= 6; y++) { back[Y(y)][X(1)] = "pa" + pi; back[Y(y)][X(6)] = "pa" + pi; }
    for (let y = 2; y <= 5; y++) for (let x = 2; x <= 5; x++) back[Y(y)][X(x)] = (x >= 3 && x <= 4 && y >= 3 && y <= 4) ? "hc" + pi : "hb" + pi;
    put(2, 1, "c");
    if (gx === 1 && gy === 0) put(3, 3, "P");
  }
  // sky checker (2x2 blocks) for cells not otherwise painted
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (back[y][x] === "s" && ((x >> 1) + (y >> 1)) % 2) back[y][x] = "j";
  const legend = { E: "fan:e", S: "fan:s", W: "fan:w", N: "fan:n", c: "crate", P: "player" };
  const backLegend = { s: "s", j: "j" };
  Object.keys(bgs).forEach(k => { if (/^(pa|hb|hc)/.test(k)) backLegend[k] = k; });
  return {
    id: "fanwindmill", category: "toy", closed: false, stooge: "P", ext: true, weight: 2, authored: true,
    names: ["The Fan Windmill", "Six Pinwheels, Six Crates", "Round And Round With The Wind", "Breezy Business"],
    room: { gravity: "off", wrapH: false, wrapV: false }, requires: ["fan"], discover: "c",
    expect: { fact: "six pinwheels of four fans each blow a light crate round and round its own ring", check: "selfStart", needsInput: false, selfStart: true },
    legend, rows: rows.map(r => r.join("")), vary: { mirror: false },
    exact: { actors: {}, grounds: {}, bgs, skins: [], backs: [], backRows: back.map(r => r.join("|")).map(s => s), backLegend, pet: null, chaser: null, reward: null, playerLook: JSON.parse(fs.readFileSync(path.join(__dirname, "watch.princess.json"), "utf8")), _multi: true },
  };
}

// ---------------- Lava Lamp ----------------
function lamp() {
  const R = [
    "........................",
    "........................",
    ".........MMMMMM.........",
    "........MMMMMMMM........",
    ".........#....#.........",
    "........#......#........",
    ".......#........#.......",
    "......#..........#......",
    "......#..........#......",
    "......#..........#......",
    "......#..........#......",
    "......#TTTTTTTTTT#......",
    "......#LLLLLLLLLL#......",
    ".......#LLLLLLLL#.......",
    "......MMMMMMMMMMMM......",
    ".....MMMMMMMMMMMMMM.....",
    "....MMMMMMMMMMMMMMMM....",
    "........................",
  ].map(r => r.split(""));
  // blobs and the player start mid-air at different heights
  const put = (x, y, ch) => { R[y][x] = ch; };
  put(8, 8, "a"); put(10, 6, "b"); put(12, 9, "c"); put(14, 7, "d"); put(9, 10, "e"); put(15, 9, "f"); put(11, 7, "P");
  // backdrop: dark night outside, a glowing purple-to-magenta gradient inside the glass
  const inside = Array.from({ length: H }, () => Array(W).fill(false));
  for (let y = 4; y <= 13; y++) { let l = R[y].findIndex(c => c === "#"); let r = R[y].lastIndexOf("#"); for (let x = l + 1; x < r; x++) inside[y][x] = true; }
  const bands = ["#2a1060", "#35146a", "#43186f", "#561c70", "#6b2070", "#822568", "#9a2a5c"];
  const bgs = { n0: { name: "night", art: speckle("#120822", "#2b1a4a", [18, 44]) }, n1: { name: "night 2", art: speckle("#160a28", "#3a2a60", [9, 37, 52]) } };
  bands.forEach((c, i) => bgs["g" + i] = { name: "glow " + (i + 1), art: speckle(c, mix(c, "#ffffff", 0.12), [10, 35, 53]) });
  const back = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => inside[y][x] ? "g" + Math.min(6, Math.max(0, y - 4)) : (((x * 7 + y * 3) % 5 === 0) ? "n1" : "n0")));
  // glass and metal wall textures, per cell
  const glass = solid("#bfe9f7"); [0, 8, 16, 24, 32, 40, 48, 56].forEach(i => glass[i] = "#e6f7fc"); [7, 15, 23, 31, 39, 47, 55, 63].forEach(i => glass[i] = "#86c5de");
  const metal = solid("#c99a2e"); for (let i = 0; i < 8; i++) { metal[i] = "#e8c25a"; metal[56 + i] = "#8a6416"; } [27, 28, 35, 36].forEach(i => metal[i] = "#fff0a8");
  const grounds = {
    lampGlass: { name: "lamp glass", frames: [glass], frameMs: 0, geometry: "solid", modifier: "none" },
    lampMetal: { name: "lamp metal", frames: [metal], frameMs: 0, geometry: "solid", modifier: "none" },
  };
  const skins = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = R[y][x]; if (c === "#") skins.push([x, y, "lampGlass", 0]); else if (c === "M") skins.push([x, y, "lampMetal", 0]); }
  // six blobs, each its own bright colour (harmless wanderers)
  const blob = (c, d) => { const o = null, k = "#2a0f3a", w = "#ffffff"; return [o, o, c, c, c, c, o, o, o, c, c, c, c, c, c, o, c, c, w, c, c, w, c, c, c, c, k, c, c, k, c, c, c, c, c, c, c, c, c, c, c, d, c, c, c, c, d, c, c, c, d, d, d, d, c, c, o, c, c, c, c, c, c, o]; };
  const palette = { a: ["#ff8a3d", "#c75a14"], b: ["#ff5fa2", "#b02a68"], c: ["#ffe14d", "#c9a400"], d: ["#4de1ff", "#139bb8"], e: ["#8cff6b", "#3aa31f"], f: ["#c58cff", "#7a3fc2"] };
  const actors = {}, legend = { "#": "wall", M: "wall", T: "tramp", L: "lava", P: "player" };
  Object.keys(palette).forEach(k => { actors["blob" + k] = { temperament: "wanderer", art: blob(palette[k][0], palette[k][1]), poses: null, name: "blob", lethal: false }; legend[k] = "actor|@blob" + k; });
  return {
    id: "lavalamp", category: "toy", closed: false, stooge: "P", ext: true, weight: 2, authored: true,
    names: ["The Lava Lamp", "Six Blobs Over Lava", "Bounce, Bounce, Glow", "Hypnotic Wax"],
    room: { gravity: "on", wrapH: false, wrapV: false }, requires: ["lava", "trampoline"], discover: "a",
    expect: { fact: "six coloured blobs and the hero bounce on trampolines over a pool of lava inside a glass lamp", check: "selfStart", needsInput: false, selfStart: true },
    legend, rows: R.map(r => r.join("")), vary: { mirror: false },
    exact: { actors, grounds, bgs, skins, backs: [], backRows: back.map(r => r.join("|")), backLegend: Object.fromEntries(Object.keys(bgs).map(k => [k, k])), pet: null, chaser: null, reward: null, playerLook: null, _multi: true },
  };
}

// backRows use single characters: map each multi-character tile id to one character
function packBack(e) {
  const X = e.exact; const ids = Object.keys(X.backLegend); const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const toCh = {}; ids.forEach((id, i) => toCh[id] = chars[i]);
  X.backRows = X.backRows.map(r => r.split("|").map(id => toCh[id]).join(""));
  X.backLegend = Object.fromEntries(ids.map(id => [toCh[id], id]));
  delete X._multi; return e;
}
const entries = [packBack(windmill()), packBack(lamp())];
let lines = fs.readFileSync(IDX, "utf8").split("\n");
entries.forEach(e => {
  lines = lines.filter(l => !l.startsWith('    {"id":"' + e.id + '"'));
  const i = lines.findIndex(l => l.startsWith('    {"id":"trafficjam"'));
  lines.splice(i, 0, "    " + JSON.stringify(e) + ",");
});
fs.writeFileSync(IDX, lines.join("\n"));
console.log("wrote", entries.map(e => e.id).join(", "));
