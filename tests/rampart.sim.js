// Dev check: fire bombs (and crates) from the cannons of examples/rampart.json at the fortress and report what is left.
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
let src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
src = src.replace(anchor, anchor + `window.__m = { enterPlayMode, restoreProjectSnapshot, activateRoom, tick, rooms: () => rooms, get board() { return board; }, get actors() { return actors; }, triggerCannon, placeNewActor, setSel: (d) => { selectedActorDefId = d; }, TILE, PUSHABLE_DEF_ID, CARRY_BOMB2_DEF_ID, actorDefs: () => actorDefs };\n`);
src = src.replace("requestAnimationFrame(frame);", "/*raf off*/");
const tmp = path.join(os.tmpdir(), "rampart_sim.html"); fs.writeFileSync(tmp, src);
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); const p = await b.newPage();
  p.on("pageerror", e => console.log("ERR", String(e)));
  await p.goto("file://" + tmp + "#t"); await p.waitForFunction(() => window.__m);
  const res = await p.evaluate((json) => {
    const m = window.__m, T = m.TILE; const d = JSON.parse(json); const snap = d.data || d;
    const cannons = []; snap.rooms[0].board.forEach((row, y) => row.forEach((c, x) => { if (c && String(c).startsWith("cannon2")) cannons.push([x, y, String(c).split(":")[0]]); }));
    snap.spawnerContents = {}; snap.rooms[0].actors = snap.rooms[0].actors.filter(a => !a.isPlayer || true);
    m.restoreProjectSnapshot(snap); m.activateRoom(m.rooms()[0].id); m.enterPlayMode(); for (let f=0;f<100;f++) m.tick(1/60);
    const defs = m.actorDefs();
    const enemies = () => m.actors.filter(a => !a.isPlayer && defs[a.defId] && defs[a.defId].temperament === "wanderer" && !a.destroyed).length;
    const solids = () => { let n = 0; m.board.forEach(r => r.forEach(c => { if (c && String(c).startsWith("solid")) n++; })); return n; };
    const out = { enemies0: enemies(), solids0: solids(), rounds: [] };
    // volley: every cannon fires a bomb, then a crate, 10 volleys
    for (let v = 0; v < 10; v++) {
      for (const [kind, def] of [["bomb", m.CARRY_BOMB2_DEF_ID], ["crate", m.PUSHABLE_DEF_ID]]) {
        for (const [cx, cy, geom] of cannons) {
          m.setSel(def); m.placeNewActor(cx * T + T / 2, (cy - 1) * T + T / 2);
          const a = m.actors[m.actors.length - 1]; m.triggerCannon(a, geom, cx, cy);
          for (let f = 0; f < 70; f++) m.tick(1 / 60);
        }
        for (let f = 0; f < 120; f++) m.tick(1 / 60);
      }
      out.rounds.push({ v, enemies: enemies(), solids: solids() });
    }
    return out;
  }, fs.readFileSync(process.argv[2], "utf8"));
  console.log(JSON.stringify(res)); await b.close();
})();
