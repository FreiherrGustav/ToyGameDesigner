// Dev generator (not shipped): the "Claw Machine" and "Fuse Line" Surprise Me entries, inserted into index.html for tracing/export.
// node tests/claw.gen.js ; node tests/watch.export.js clawmachine examples/claw-machine.json 30 ; node tests/watch.export.js fuseline examples/fuse-line.json 30 ; git checkout index.html
const fs = require("fs"), path = require("path");
const IDX = path.join(__dirname, "..", "index.html");
const W = 24, H = 18;
const solid = c => Array(64).fill(c);
const hex = (a, b, c) => "#" + [a, b, c].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const mix = (c1, c2, t) => { const p = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)); const a = p(c1), b = p(c2); return hex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t); };
const speckle = (base, spec, pts) => { const a = solid(base); pts.forEach(i => a[i] = spec); return a; };
const blank = () => Array.from({ length: H }, () => Array(W).fill("."));
const put = (R, x, y, ch) => { R[y][x] = ch; };
const fill = (R, x0, y0, x1, y1, ch) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) R[y][x] = ch; };

function claw() {
  const R = blank();
  // frame
  fill(R, 0, 0, 23, 0, "M"); fill(R, 0, 17, 23, 17, "M"); fill(R, 0, 0, 0, 17, "M"); fill(R, 23, 0, 23, 17, "M");
  fill(R, 1, 16, 22, 16, "M");                         // floor
  // lift shaft: platform column is col 3; west wall col 2 (rows 7..15), east wall col 4 (rows 7..15 = the ledge's start)
  fill(R, 2, 7, 2, 15, "#"); fill(R, 4, 7, 4, 15, "#");
  put(R, 3, 14, "#");                                  // shaft floor (a crate rests on it, platform sinks to just above)
  put(R, 3, 1, "c");                                   // prize spawner (crates) above the shaft
  put(R, 3, 9, "m");                                   // the platform (placed as an actor, vertical axis set in the saved project)
  // fan on the west, gate to hold it back until the pad is pressed: fan (1,5) gate (2,5)
  put(R, 1, 5, "E");                                   // the fan is tagged red (exact.colors): only blows while the pad is pressed
  // ledge belt east of the shaft: row 7 cols 5..8 (belt east), then a chute col 9 down to the bin
  fill(R, 5, 7, 8, 7, "b");
  fill(R, 8, 8, 8, 15, "#");                           // chute west wall
  fill(R, 10, 7, 10, 15, "#");                         // chute east wall
  // bin: wide pit at the bottom, plate under the chute
  fill(R, 9, 15, 9, 15, "p");
  // player pad outside the cabinet, right side
  fill(R, 11, 8, 17, 8, "#"); fill(R, 17, 9, 17, 14, "#"); put(R, 17, 15, "G");   // prize closet, blue gate at its door
  put(R, 12, 15, "a"); put(R, 14, 15, "b"); put(R, 16, 15, "d");
  put(R, 19, 15, "r"); put(R, 21, 15, "P");
  const legend = { M: "wall", "#": "wall", c: "spawnerc:s", m: "actor|movingplatform", E: "fan:e", G: "gate:blue", a: "pet", b: "pet", d: "pet", b: "belt:e", r: "plate:red", p: "plate:blue", P: "player" };
  return { R, legend };
}
function entryClaw() {
  const { R, legend } = claw();
  const bgs = { n0: { name: "arcade", art: speckle("#23123f", "#3a1f5f", [18, 44]) }, n1: { name: "arcade 2", art: speckle("#291650", "#4a2d7a", [9, 37, 52]) } };
  const back = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => ((x * 5 + y * 3) % 7 === 0) ? "n1" : "n0"));
  return packBack({
    id: "clawmachine", category: "toy", closed: false, stooge: "P", ext: true, weight: 2, authored: true,
    names: ["The Claw Machine", "Prize Grab", "Lift, Lift, Drop", "Win Something"],
    room: { gravity: "on", wrapH: false, wrapV: false }, requires: ["fan"], discover: "c",
    expect: { fact: "a platform lifts prizes up a shaft; stand on the pad to blow one off the top into the chute", check: "selfStart", needsInput: false, selfStart: true },
    legend, rows: R.map(r => r.join("")), vary: { mirror: false },
    exact: { actors: {}, grounds: {}, bgs, skins: [], backs: [], colors: [[1, 5, "red"]], backRows: back.map(r => r.join("|")), backLegend: Object.fromEntries(Object.keys(bgs).map(k => [k, k])), pet: null, chaser: null, reward: null, playerLook: null, _multi: true },
  });
}

// ---------------- Fuse Line ----------------
// A stone spawner drops a Large Stone on bomb 1 (a stone falling 2+ tiles sets a bomb off). Each blast clears the support block under the next stone,
// which falls down onto the next bomb; the last bomb sits at the end of a row of bombs: one big finale.
function fuse() {
  const R = blank();
  fill(R, 0, 0, 23, 0, "I"); fill(R, 0, 17, 23, 17, "I"); fill(R, 0, 0, 0, 17, "I"); fill(R, 23, 0, 23, 17, "I");
  const N = 5;
  put(R, 3, 1, "s");                                    // stone spawner facing south over bomb 1
  for (let k = 0; k < N; k++) {
    const bx = 3 + k, by = 4 + k * 3;
    put(R, bx, by, "B"); put(R, bx, by + 1, "I");
    if (k < N - 1) { put(R, bx + 1, by, "w"); put(R, bx + 1, by - 1, "S"); }   // support block, and the next stone on it
  }
  fill(R, 8, 16, 14, 16, "B"); fill(R, 9, 15, 13, 15, "B");                     // the finale: a heap of bombs at the end of the line
  put(R, 1, 16, "P");
  const legend = { I: "raw|solid:indestructible", w: "wall", B: "bomb", S: "stone", s: "spawners:s", P: "player" };
  return { R, legend };
}
function entryFuse() {
  const { R, legend } = fuse();
  const bgs = {};
  const bands = ["#0a0a24", "#0d0d2e", "#101038", "#14143f", "#1a1a47", "#201f4f"];
  bands.forEach((c, i) => bgs["k" + i] = { name: "night " + (i + 1), art: speckle(c, mix(c, "#ffffff", 0.35), [(i * 13) % 64, (i * 29 + 7) % 64]) });
  const back = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => "k" + Math.min(5, Math.floor(y / 3) + (((x * 7 + y * 5) % 11 === 0) ? 1 : 0))));
  return packBack({
    id: "fuseline", category: "room", closed: false, stooge: "P", ext: true, weight: 2, authored: true,
    names: ["The Fuse Line", "Finale", "Light The Sky", "A Chain Of Fireworks"],
    room: { gravity: "on", wrapH: false, wrapV: false }, requires: ["bombActors"], discover: "B",
    expect: { fact: "a stone lights the first bomb; each blast drops the next stone on the next bomb down the staircase, ending in a heap of bombs", check: "selfStart", needsInput: false, selfStart: true, chain: ["spawn", "impact", "detonate", "blastClear", "fall", "impact", "detonate"] },
    legend, rows: R.map(r => r.join("")), vary: { mirror: false },
    exact: { actors: {}, grounds: {}, bgs, skins: [], backs: [], backRows: back.map(r => r.join("|")), backLegend: Object.fromEntries(Object.keys(bgs).map(k => [k, k])), pet: null, chaser: null, reward: null, playerLook: null, _multi: true },
  });
}
function packBack(e) {
  const X = e.exact; const ids = Object.keys(X.backLegend); const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const toCh = {}; ids.forEach((id, i) => toCh[id] = chars[i]);
  X.backRows = X.backRows.map(r => r.split("|").map(id => toCh[id]).join(""));
  X.backLegend = Object.fromEntries(ids.map(id => [toCh[id], id]));
  delete X._multi; return e;
}
const only = process.argv[2];
const entries = [entryClaw(), entryFuse()];
let lines = fs.readFileSync(IDX, "utf8").split("\n");
entries.forEach(e => {
  lines = lines.filter(l => !l.startsWith('    {"id":"' + e.id + '"'));
  const i = lines.findIndex(l => l.startsWith('    {"id":"trafficjam"'));
  lines.splice(i, 0, "    " + JSON.stringify(e) + ",");
});
fs.writeFileSync(IDX, lines.join("\n"));
console.log("wrote", entries.map(e => e.id).join(", "));
