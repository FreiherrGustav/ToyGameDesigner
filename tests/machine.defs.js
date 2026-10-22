// v2.54 Stage 3 machine definitions under development (not deployed). Final entries are pasted into SURPRISE_ROOMS in index.html.
function grid(fn) { const g = Array.from({ length: 18 }, () => Array(24).fill(".")); const set = (x, y, c) => { g[y][x] = c; }; fn(set, g); return g.map(r => r.join("")); }
module.exports = [
  { id: "domino", category: "room", closed: false, stooge: "wP", names: ["The Domino Effect", "Drop, Boom, Plop, Open", "Rube Goldberg's Lunch Break"],
    room: { gravity: "on", wrapH: true, wrapV: false }, requires: ["spawner", "bombActors", "largestone", "plate", "gate"], discover: "o",
    vary: { payload: { c: ["crate", "stone"] } },
    expect: { fact: "a crate drops on the bomb, the blast knocks the floor out from under the stone, the stone lands on the plate and the gate opens", check: "gateOpen", chain: ["spawn", "impact", "detonate", "blastClear", "fall", "plateOn", "gateOpen"], needsInput: false, selfStart: true },
    legend: { "=": "wall", s: "spawnerc:s", b: "bomb", S: "stone", p: "plate:green", G: "gate:green", w: "pet", c: "crate", P: "player", o: "reward", ">": "belt:w" },
    rows: grid((set) => {
      for (let x = 0; x < 24; x++) set(x, 17, "=");
      set(9, 1, "s");
      for (let y = 9; y <= 16; y++) { set(8, y, "="); set(12, y, "="); }
      set(10, 13, "S"); set(9, 14, "b"); set(10, 14, "="); set(11, 14, "="); set(9, 15, "="); set(9, 16, "="); set(10, 16, "p");
      for (let x = 15; x <= 22; x++) set(x, 12, "=");
      set(15, 13, "="); for (let y = 13; y <= 16; y++) set(22, y, "=");
      for (let y = 14; y <= 16; y++) set(15, y, "G");
      for (let x = 16; x <= 21; x++) set(x, 17, ">");
      set(17, 16, "c"); set(18, 16, "w"); set(20, 16, "w"); set(21, 16, "o"); set(3, 16, "P");
    }) }
,{ id: "opensdoor", category: "room", closed: false, stooge: "wP", names: ["Crate Opens The Door", "The Long Way Around", "Door Policy: Crates Only"],
    room: { gravity: "on", wrapH: true, wrapV: false }, requires: ["spawner", "cannon", "plate", "gate", "trampoline", "conveyor"], discover: "o",
    vary: { payload: { w: ["pet", "walker"] } },
    expect: { fact: "a crate drops into the cannon and is fired onto the plate, the gate opens and the pets in the pen are let out", check: "released", chain: ["spawn", "cannonLoad", "cannonFire", "plateOn", "gateOpen", "released"], needsInput: false, selfStart: true },
    legend: { "=": "wall", s: "spawnerc:s", k: "cannon:ne", p: "plate:red", G: "gate:red", t: "tramp", ">": "belt:w", w: "pet", P: "player", o: "reward" },
    rows: grid((set) => {
      for (let x = 0; x < 24; x++) set(x, 17, "=");
      set(3, 3, "s"); set(3, 9, "k");
      for (let x = 13; x <= 16; x++) set(x, 16, "p");
      set(17, 16, "="); set(18, 16, "="); set(19, 16, "t");
      for (let x = 20; x <= 22; x++) set(x, 12, ">"); set(20, 12, "="); // belt floor of the pen, the gate's own floor cell
      set(20, 10, "G"); set(20, 11, "G");
      for (let x = 20; x <= 23; x++) set(x, 9, "="); for (let y = 10; y <= 12; y++) set(23, y, "=");
      set(21, 11, "w"); set(22, 11, "w"); set(21, 15, "P");
      for (let x = 8; x <= 10; x++) set(x, 13, "="); set(9, 12, "o");
    }) }

,{ id: "carousel", category: "room", closed: false, stooge: "wP", names: ["Crate Carousel", "Round And Round It Goes", "The Crate Commute"],
    room: { gravity: "on", wrapH: false, wrapV: false }, requires: ["fan", "conveyor", "npcWind"], discover: "o",
    vary: { payload: { w: ["pet", "walker"] } },
    expect: { fact: "three crates ride a belt loop, a fan lifts each one back to the top", check: "fanLift", chain: ["beltCarry", "fanLift", "beltCarry"], selfStart: true },
    legend: { "=": "wall", ">": "belt:e", "<": "belt:w", f: "fan:n", g: "gust:w", c: "crate", w: "pet", P: "player", o: "reward" },
    rows: grid((set) => {
      for (let x = 0; x < 24; x++) set(x, 0, "=");
      for (let x = 3; x <= 20; x++) set(x, 17, ">");
      for (let x = 0; x <= 2; x++) set(x, 17, "=");
      for (let x = 4; x <= 20; x++) set(x, 15, "<");
      set(21, 17, "f"); for (let y = 11; y <= 16; y++) set(22, y, "="); set(21, 11, "=");
      set(21, 14, "g"); set(21, 13, "g");
      set(8, 14, "c"); set(12, 14, "c"); set(16, 16, "c");
      set(4, 13, "w"); set(1, 16, "P"); set(1, 14, "o");
      for (let y = 12; y <= 16; y++) set(0, y, "=");
    }) }
];
