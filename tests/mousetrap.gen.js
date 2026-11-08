// Builds the Mousetrap Surprise Me entry (tests/mousetrap.entry.json, an array with one entry) from a small drawing.
// node tests/mousetrap.gen.js   -> prints the room. Trace with: node tests/machines.build.js tests/mousetrap.entry.json mousetrap 1800 60
const fs = require("fs"), path = require("path");
const g = Array.from({ length: 18 }, () => Array(24).fill("."));
const set = (x, y, c) => { g[y][x] = c; };
const row = (y, x0, x1, c) => { for (let x = x0; x <= x1; x++) set(x, y, c); };
const col = (x, y0, y1, c) => { for (let y = y0; y <= y1; y++) set(x, y, c); };
// outer box
row(0, 0, 23, "="); row(17, 0, 23, "="); col(0, 0, 17, "="); col(23, 0, 17, "=");
// five belt legs, each 2 rows below the last (a crate rides the row above its belt)
row(2, 2, 20, ">"); row(4, 4, 21, "<"); row(6, 3, 20, ">"); row(8, 4, 21, "<"); row(10, 3, 20, ">");
// start: bait crate drops onto a plate, the plate opens the gate that holds the relay crate
set(1, 1, "c"); set(1, 3, "p"); set(1, 4, "="); set(2, 1, "c"); set(3, 1, "g");
// finale: the relay crate falls on a bomb, the blast smashes the crate that holds the red plate down
set(21, 12, "b"); set(22, 12, "H");   // H = plate:red with a crate on it
// the hall roof (nothing gets in or out) and the floor
row(13, 1, 22, "I");
// the trap: two red gates across the hall, open while the crate sits on the plate
col(9, 14, 16, "R"); col(16, 14, 16, "R");
// the cast
set(2, 16, "C"); set(21, 16, "P");
const rows = g.map(r => r.join(""));
const entry = {
  id: "mousetrap", category: "room", closed: false, stooge: "C", ext: true, weight: 2,
  names: ["The Mousetrap", "Cheese Not Included", "Lure The Cat", "A Very Slow Trap"],
  room: { gravity: "on", wrapH: false, wrapV: false },
  requires: ["conveyor", "gate", "plate", "bombActors"],
  discover: "R",
  expect: { fact: "a crate rides five belts, falls on a bomb, the blast smashes the crate holding the red plate and the two red gates close", check: "gateClose", needsInput: true, selfStart: true },
  vary: {},
  legend: { "=": "wall", I: "raw|solid:indestructible", ">": "belt:e", "<": "belt:w", c: "crate", p: "plate:brown", g: "gate:brown", b: "bomb", H: "plate:red&crate", R: "gate:red", C: "chaser", P: "player" },
  rows
};
fs.writeFileSync(path.join(__dirname, "mousetrap.entry.json"), JSON.stringify([entry]));
console.log(rows.join("\n"));
