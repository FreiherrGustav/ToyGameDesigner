// v2.67 Stage 2: rebuilds The Popcorn Box (a bouncy maze, a star cache reached only through a trampoline chain, a crowd of
// bouncing pets and a hazard-ball spawner). Rewrites the `popcorn` entry's rows/legend in index.html. Idempotent.
// node tests/s2.popcorn.gen.js [--print]
const fs = require("fs");
const FILE = __dirname + "/../index.html";
const W = 24, H = 18;
const g = Array.from({ length: H }, () => new Array(W).fill("."));
const set = (x, y, c) => { g[y][x] = c; };
const hline = (x0, x1, y, c = "B") => { for (let x = x0; x <= x1; x++) set(x, y, c); };
const vline = (x, y0, y1, c = "B") => { for (let y = y0; y <= y1; y++) set(x, y, c); };
hline(0, W - 1, 0); hline(0, W - 1, H - 1); vline(0, 0, H - 1); vline(W - 1, 0, H - 1);
// the star cache (top left): sealed except a two-tile opening at (4,1..2)
hline(1, 4, 4); set(4, 3, "B"); set(2, 3, "S");
// middle shelves with a trampoline on each: the chain that reaches the cache
hline(8, 14, 10); set(10, 9, "t");            // shelf 1 (row 10) with trampoline 1
hline(15, 22, 6);                               // upper right shelf
hline(6, 12, 14);                               // low shelf
vline(12, 11, 13);                              // a bouncy post under shelf 1's end
// the player's nook (bottom right) and the first trampoline that starts the chain
set(16, 16, "t"); set(21, 16, "P");
hline(19, 22, 15); vline(19, 16, 16, ".");      // a low roof over the nook's far end
// obstacles: posts, a ceiling stub, a staggered row
vline(17, 1, 2); hline(9, 10, 3); vline(13, 6, 8); set(20, 9, "B"); set(21, 9, "B"); hline(3, 5, 8); vline(15, 12, 13); set(9, 17, "B"); set(10, 17, "B");
// rewards (the maze's win in Play: collect them all) and the crowd
set(21, 5, "o"); set(2, 15, "o"); set(13, 13, "o"); set(8, 1, "o");
[[3, 6], [9, 7], [15, 9], [11, 15], [4, 11], [18, 11], [20, 2]].forEach(([x, y]) => set(x, y, "w"));
set(19, 1, "h"); // a hazard-ball spawner in the ceiling, dropping balls into the maze
const rows = g.map(r => r.join(""));
if (process.argv.includes("--print")) { rows.forEach((r, i) => console.log(String(i).padStart(2), r)); }
let src = fs.readFileSync(FILE, "utf8");
const i = src.indexOf('{ id: "popcorn"'); if (i < 0) throw new Error("popcorn entry not found");
const j = src.indexOf("rows: [", i), k = src.indexOf("] }", j) + 1; // keeps the " }," that closes the entry
const legendStart = src.indexOf("legend:", i), legendEnd = src.indexOf("\n", legendStart);
const legend = 'legend: {"B": "bounce", "t": "tramp", "o": "reward", "S": "actor|colStar", "P": "player", "w": "pet", "h": "spawnerh:s"},';
src = src.slice(0, legendStart) + legend + src.slice(legendEnd, j) + "rows: " + JSON.stringify(rows).replace(/,/g, ", ") + src.slice(k);
// the line describing it
src = src.replace(/expect: \{"fact": "a bouncy maze: one critter[^}]*\}/, 'expect: {"fact": "a bouncy maze full of springing critters and falling balls; a star hides in a pocket you can only reach by chaining trampolines", "check": "", "needsInput": true}');
fs.writeFileSync(FILE, src);
console.log("popcorn rewritten");
