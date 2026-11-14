// v2.67 Stage 2: adds painted backdrops (Paint layer only) to eight Surprise Me designs by writing an `exact` block into
// their entries in index.html. Run once: node tests/s2.decor.gen.js  (idempotent: skips an entry that already has the marker).
const fs = require("fs");
const FILE = __dirname + "/../index.html";
let src = fs.readFileSync(FILE, "utf8");
const hash = (x, y) => (x * 7 + y * 13 + (x * y) % 5) % 23;
const flat = c => new Array(64).fill(c);
const speck = (c, dots) => { const a = flat(c); dots.forEach(([i, col]) => { a[i] = col; }); return a; };
const KIT = {
  n0: { name: "night", art: flat("#0b1033") },
  n1: { name: "night stars", art: speck("#0b1033", [[10, "#cfd8ff"], [45, "#5566aa"]]) },
  n2: { name: "night stars", art: speck("#0b1033", [[26, "#cfd8ff"], [53, "#7f8fd0"], [5, "#5566aa"]]) },
  d0: { name: "dusk", art: flat("#14103a") }, d1: { name: "dusk", art: flat("#1c1650") },
  d2: { name: "dusk", art: flat("#261c5e") }, d3: { name: "dusk", art: flat("#302268") },
  e0: { name: "earth", art: flat("#3a2a22") },
  e1: { name: "earth", art: speck("#3a2a22", [[9, "#4a362c"], [27, "#2e211a"], [50, "#4a362c"], [36, "#2e211a"]]) },
  e2: { name: "earth", art: speck("#3a2a22", [[18, "#2e211a"], [44, "#4a362c"], [60, "#2e211a"]]) }
};
const LEG = { a: "bgSky", b: "bgSky2", c: "bgSky3", d: "bgSky4", l: "bgCloud", h: "bgHill1", i: "bgHill2", j: "bgHill3", k: "bgBush",
  n: "n0", o: "n1", p: "n2", D: "d0", E: "d1", F: "d2", G: "d3", x: "e0", y: "e1", z: "e2" };
const bandChar = y => y <= 6 ? "a" : y <= 9 ? "b" : y <= 12 ? "c" : "d"; // the same bands the starter board paints
const grid = () => Array.from({ length: 18 }, () => new Array(24).fill("."));
const sky = (g, y0, y1) => { for (let y = y0; y <= y1; y++) for (let x = 0; x < 24; x++) g[y][x] = (y >= 1 && y <= 6 && hash(x, y) === 3 && g[y][x - 1] !== "l") ? "l" : bandChar(y); };
const night = (g, y0, y1) => { for (let y = y0; y <= y1; y++) for (let x = 0; x < 24; x++) { const h = hash(x, y); g[y][x] = h === 3 ? "o" : h === 11 ? "p" : "n"; } };
const dusk = (g, y0, y1) => { for (let y = y0; y <= y1; y++) for (let x = 0; x < 24; x++) g[y][x] = y <= 3 ? "D" : y <= 7 ? "E" : y <= 11 ? "F" : "G"; };
const earth = (g, y0, y1) => { for (let y = y0; y <= y1; y++) for (let x = 0; x < 24; x++) { const h = hash(x, y); g[y][x] = h === 4 ? "y" : h === 9 ? "z" : "x"; } };
// scenery on the row above a floor: only in a cell that is empty in the layout and has something solid under it
const scenery = (g, rows, y, picks) => picks.forEach(([x, c]) => { if (rows[y][x] === "." && rows[y + 1][x] !== "." && g[y][x] !== undefined) g[y][x] = c; });
const asRows = g => g.map(r => r.join(""));

const DESIGNS = {
  catcannon(rows) { const g = grid(); sky(g, 0, 17); scenery(g, rows, 10, [[0, "h"], [1, "i"], [2, "j"], [5, "k"], [7, "k"], [16, "k"], [21, "h"], [22, "i"], [23, "j"]]); return { backRows: asRows(g) }; },
  trampit(rows) { const g = grid(); dusk(g, 0, 17); return { backRows: asRows(g) }; },
  popcorn(rows) { const g = grid(); sky(g, 0, 17); return { backRows: asRows(g) }; },
  elevator(rows) { const g = grid(); night(g, 0, 17); return { backRows: asRows(g) }; },
  tunneltrouble(rows, rooms) {
    const g = grid(); sky(g, 0, 12); earth(g, 13, 17); scenery(g, rooms[0], 12, [[7, "h"], [8, "i"], [9, "j"], [12, "k"], [20, "k"], [21, "h"], [22, "j"]]);
    const g2 = grid(); earth(g2, 0, 17);
    return { backRows: asRows(g), partBackRows: [asRows(g2)] };
  }
};
const marker = "/*v2.67-decor*/";
function insertExact(id, anchor, exact) {
  const i = src.indexOf('{ id: "' + id + '"');
  if (i < 0) throw new Error("entry not found " + id);
  const j = src.indexOf(anchor, i);
  if (src.slice(i, j).includes(marker)) return;
  src = src.slice(0, j) + marker + " exact: " + JSON.stringify(exact) + ",\n      " + src.slice(j);
}
const evalRooms = () => { const a = src.indexOf("// SURPRISE_ROOMS BEGIN"), b = src.indexOf("// SURPRISE_ROOMS END"); const body = src.slice(a, b); const m = body.indexOf("const SURPRISE_ROOMS = ["); return eval(body.slice(m + "const SURPRISE_ROOMS = ".length).replace(/;\s*SURPRISE_ROOMS.*$/s, "").replace(/\/\*v2\.67-decor\*\//g, "")); };
const list = evalRooms();
for (const id of Object.keys(DESIGNS)) {
  const t = list.find(x => x.id === id);
  const rows = t.rows, rooms = t.rooms ? t.rooms.map(r => r.rows) : null;
  const d = DESIGNS[id](rows, rooms);
  const used = new Set(); [].concat(d.backRows, ...(d.partBackRows || [])).forEach(r => r.split("").forEach(c => { if (LEG[c]) used.add(LEG[c]); }));
  const bgs = {}; used.forEach(k => { if (KIT[k]) bgs[k] = KIT[k]; });
  const legend = {}; Object.keys(LEG).forEach(c => { if (used.has(LEG[c])) legend[c] = LEG[c]; });
  const exact = Object.assign({ wallSkin: null, bgs, backs: [], backLegend: legend }, d);
  insertExact(id, t.rooms ? "rooms:" : "legend:", exact);
}
// plinko and cannonrange are one-line JSON entries that already carry an `exact` block
function patchJson(id, fn) {
  const i = src.indexOf('{"id":"' + id + '"'); if (i < 0) throw new Error("json entry not found " + id);
  const e = src.indexOf("\n", i); const line = src.slice(i, e); const trail = line.endsWith(",") ? "," : "";
  const obj = JSON.parse(trail ? line.slice(0, -1) : line);
  if (obj.exact && obj.exact.backLegend && obj.exact.backLegend.__decor) return;
  fn(obj);
  src = src.slice(0, i) + JSON.stringify(obj) + trail + src.slice(e);
}
patchJson("plinko", o => { // a night playfield behind the pegs; the author's own score tiles stay on top
  const X = o.exact, taken = new Set((X.backs || []).map(([x, y]) => x + "," + y));
  const g = grid(); night(g, 0, 17); taken.forEach(k => { const [x, y] = k.split(",").map(Number); g[y][x] = "."; });
  X.bgs = Object.assign({}, X.bgs, { n0: KIT.n0, n1: KIT.n1, n2: KIT.n2 }); X.backRows = asRows(g); X.backLegend = { n: "n0", o: "n1", p: "n2", __decor: "n0" };
});
patchJson("cannonrange", o => { const X = o.exact, g = grid(); dusk(g, 0, 17); X.bgs = Object.assign({}, X.bgs, { d0: KIT.d0, d1: KIT.d1, d2: KIT.d2, d3: KIT.d3 }); X.backRows = asRows(g); X.backLegend = { D: "d0", E: "d1", F: "d2", G: "d3", __decor: "d0" }; });
fs.writeFileSync(FILE, src);
console.log("done");
