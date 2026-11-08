// Random-input fuzz of the Moving Platform Maze example: flags one-frame jumps/warps of the player (not deployed).
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/opt/node22/lib/node_modules/playwright");
const src = fs.readFileSync(process.argv[2] || path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const tmp = path.join(os.tmpdir(), "platformfuzz_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + 'window.__ev=f=>eval("("+f+")");'));
const proj = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "examples", "moving-platform-maze.json"), "utf8")).data;
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage(); p.on("dialog", d => d.accept()); const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto("file://" + tmp + "#t");
  await p.evaluate(pr => { window.__proj = pr; }, proj);
  const r = await p.evaluate(() => window.__ev(function () {
    restoreProjectSnapshot(structuredClone(window.__proj));
    const res = { pops: [], embedded: 0, frames: 0 };
    let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let run = 0; run < 12; run++) {
      enterPlayMode(); playReadyUntil = null;
      const pl = actors.find(a => a.isPlayer);
      let prev = { x: pl.x, y: pl.y, room: currentRoomId }, held = {};
      for (let i = 0; i < 3600; i++) {
        if (i % 20 === 0) { held = { ArrowLeft: rnd() < 0.4, ArrowRight: rnd() < 0.5, " ": rnd() < 0.35 }; Object.assign(keys, held); }
        tick(1 / 60);
        if (playSessionEnded) break;
        res.frames++;
        const dx = pl.x - prev.x, dy = pl.y - prev.y;
        const nearPlat = actors.some(a => a.defId === MOVING_PLATFORM_DEF_ID && Math.abs(a.x - pl.x) < 80 && Math.abs(a.y - pl.y) < 80);
        if (nearPlat && (Math.abs(dx) > 14 || dy < -14)) res.pops.push([run, i, actors.filter(a=>!a.isPlayer && Math.abs(a.x-pl.x)<60 && Math.abs(a.y-pl.y)<60).map(a=>[a.defId,+a.x.toFixed(1),+a.y.toFixed(1),+a.vx.toFixed(0),+a.vy.toFixed(0)]), +pl.vx.toFixed(0), +pl.vy.toFixed(0), +prev.x.toFixed(1), +prev.y.toFixed(1), +pl.x.toFixed(1), +pl.y.toFixed(1)]);
        if (actorBlockedByTiles(pl)) res.embedded++;
        prev = { x: pl.x, y: pl.y };
      }
      exitToBuildMode();
    }
    res.pops = res.pops.slice(0, 12);
    return res;
  })());
  console.log(JSON.stringify(r), errs);
  await b.close();
})();
