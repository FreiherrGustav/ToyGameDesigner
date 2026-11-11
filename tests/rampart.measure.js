// Dev check: fire a crate and a bomb from every cannon of an example project and report where they land / go off.
// node tests/rampart.measure.js examples/rampart.json
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const proj = process.argv[2];
let src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
src = src.replace(anchor, anchor + `window.__m = { restoreProjectSnapshot, activateRoom, tick, rooms: () => rooms, get board() { return board; }, get actors() { return actors; }, set actors(v) { actors = v; }, triggerCannon, createActor: typeof createActor === "function" ? createActor : null, placeNewActor, setSel: (d) => { selectedActorDefId = d; }, TILE, PUSHABLE_DEF_ID, CARRY_BOMB2_DEF_ID, advance: (ms) => advanceGameClock(ms), get spawnerContents() { return spawnerContents; } };\n`);
src = src.replace("requestAnimationFrame(frame);", "/*raf off*/");
const tmp = path.join(os.tmpdir(), "rampart_measure.html"); fs.writeFileSync(tmp, src);
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); const p = await b.newPage();
  p.on("pageerror", e => console.log("ERR", String(e)));
  await p.goto("file://" + tmp + "#t"); await p.waitForFunction(() => window.__m);
  const res = await p.evaluate((json) => {
    const m = window.__m, T = m.TILE, out = [];
    const d = JSON.parse(json); const snap = d.data || d;
    const cannons = [];
    snap.rooms[0].board.forEach((row, y) => row.forEach((c, x) => { if (c && String(c).startsWith("cannon2")) cannons.push([x, y, String(c).split(":")[0]]); }));
    for (const [cx, cy, geom] of cannons) for (const kind of ["crate", "bomb"]) {
      const s = structuredClone(snap); s.rooms[0].actors = []; s.spawnerContents = {};
      m.restoreProjectSnapshot(s); m.activateRoom(m.rooms()[0].id);
      m.setSel(kind === "crate" ? m.PUSHABLE_DEF_ID : m.CARRY_BOMB2_DEF_ID);
      const a = m.placeNewActor(cx * T + T / 2, (cy - 1) * T + T / 2) || m.actors[m.actors.length - 1];
      const actor = m.actors[m.actors.length - 1];
      m.triggerCannon(actor, geom, cx, cy);
      let landX = null, fell = 0, detonated = false, maxUp = 0, t = 0;
      const y0 = actor.y; let top = actor.y;
      for (let f = 0; f < 60 * 6; f++) {
        m.tick(1 / 60); t++;
        if (!m.actors.includes(actor) || actor.detonating) { detonated = true; landX = (actor.x + actor.w / 2) / T; break; }
        top = Math.min(top, actor.y);
        if (f > 40 && actor.grounded && !actor.cannonLoad) { landX = (actor.x + actor.w / 2) / T; break; }
      }
      out.push({ cannon: cx + "," + cy, kind, landX: landX && +landX.toFixed(1), dx: landX && +(landX - cx).toFixed(1), landY: +(actor.y / T).toFixed(1), detonated, secs: +(t / 60).toFixed(2) });
    }
    return out;
  }, fs.readFileSync(proj, "utf8"));
  res.forEach(r => console.log(JSON.stringify(r)));
  await b.close();
})();
