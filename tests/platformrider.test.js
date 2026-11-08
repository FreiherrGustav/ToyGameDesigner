// Player riding a Moving Platform next to walls (not deployed). Usage: node tests/platformrider.test.js [html]
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/opt/node22/lib/node_modules/playwright");
const src = fs.readFileSync(process.argv[2] || path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const tmp = path.join(os.tmpdir(), "platformrider_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + 'window.__ev=f=>eval("("+f+")");'));
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage(); p.on("dialog", d => d.accept()); const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto("file://" + tmp + "#t");
  const r = await p.evaluate(() => window.__ev(function () {
    const out = {};
    // scenario: wall column at col wallCol rows 8-16 (full height), platform shuttling toward it, player riding
    const run = (opts) => {
      loadExampleGame(buildSushiTrainGame, "x");
      for (const a of actors.filter(a => !a.isPlayer)) removeActorById(a.id);
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { board[y][x] = null; }
      for (let x = 0; x < COLS; x++) board[17][x] = "solid:none";
      for (let y = opts.wallTop; y <= 16; y++) board[y][opts.wallCol] = "solid:none";
      gravityEnabled = true; gravityDir = "down";
      enterPlayMode(); playReadyUntil = null;
      const pl = actors.find(a => a.isPlayer);
      const plat = placeCarryableActor(MOVING_PLATFORM_DEF_ID, opts.px, opts.py);
      plat.platformAxis = opts.axis || "x"; plat.platformT = opts.t0 || 0;
      pl.x = plat.x + 0; pl.y = plat.y - pl.h - 0.5; pl.vx = 0; pl.vy = 0;
      keys.ArrowRight = false; keys.ArrowLeft = false; keys[" "] = false;
      const trace = []; let maxUp = 0, maxJump = 0, embedded = 0;
      let prev = { x: pl.x, y: pl.y };
      for (let i = 0; i < opts.frames; i++) {
        if (opts.hold) { keys.ArrowRight = opts.hold === "R"; keys.ArrowLeft = opts.hold === "L"; }
        tick(1 / 60);
        const dx = pl.x - prev.x, dy = pl.y - prev.y;
        if (-dy > maxUp) maxUp = -dy; if (Math.abs(dx) > maxJump) maxJump = Math.abs(dx);
        if (actorBlockedByTiles(pl)) embedded++;
        if (-dy > 3) (out.__pops = out.__pops || []).push([i, +prev.x.toFixed(1), +prev.y.toFixed(1), +pl.x.toFixed(1), +pl.y.toFixed(1), +plat.x.toFixed(1)]);
        trace.push([+pl.x.toFixed(1), +pl.y.toFixed(1), +plat.x.toFixed(1)]);
        prev = { x: pl.x, y: pl.y };
      }
      return { maxUp: +maxUp.toFixed(1), maxStep: +maxJump.toFixed(1), embedded, onPlat: pl.y < plat.y, fin: trace[trace.length - 1], samples: trace.filter((_, i) => i % 40 === 0) };
    };
    // platform centred col 8 row 13, range +-4 tiles -> reaches col 12; wall at col 13 so the platform edge touches it
    out.standStill = run({ wallCol: 13, wallTop: 8, px: 8 * TILE + 16, py: 13 * TILE + 16, frames: 900 });
    out.holdRight = run({ wallCol: 13, wallTop: 8, px: 8 * TILE + 16, py: 13 * TILE + 16, frames: 900, hold: "R" });
    out.wallClose = run({ wallCol: 12, wallTop: 8, px: 8 * TILE + 16, py: 13 * TILE + 16, frames: 900 });
    out.wallCloseHold = run({ wallCol: 12, wallTop: 8, px: 8 * TILE + 16, py: 13 * TILE + 16, frames: 900, hold: 'R' });
    // vertical platform rising into a ceiling at row 9 (wall = ceiling row), player riding
    out.ceiling = (() => { const o = { wallCol: 99, wallTop: 99, px: 8 * TILE + 16, py: 13 * TILE + 16, frames: 900, axis: 'y' };
      const r0 = run(o); return r0; })();
    out.wallLeft = run({ wallCol: 3, wallTop: 8, px: 8 * TILE + 16, py: 13 * TILE + 16, frames: 900 });
    out.wallLow = run({ wallCol: 13, wallTop: 13, px: 8 * TILE + 16, py: 13 * TILE + 16, frames: 900 });
    return out;
  })());
  for (const k in r) console.log(k, JSON.stringify(r[k]));
  console.log(errs);
  await b.close();
})();
