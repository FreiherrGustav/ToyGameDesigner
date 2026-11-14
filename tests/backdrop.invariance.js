// The backdrop pass only touches the Paint layer: every room's tiles, colors, skins, actors and rules equal the pre-backdrop build. node tests/backdrop.invariance.js <old index.html>
const fs = require("fs"), path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/opt/node22/lib/node_modules/playwright");
const A = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const mk = (file, tag) => { const o = "/tmp/bdi_" + tag + ".html"; fs.writeFileSync(o, fs.readFileSync(file, "utf8").replace(A, A + 'window.__ev=f=>eval("("+f+")");\n')); return o; };
const files = { old: mk(process.argv[2], "o"), cur: mk(path.join(__dirname, "..", "index.html"), "c") };
const IDS = ["dungeon-diving", "the-world-s-worst-elevator", "the-bomb-factory", "the-gravity-switcheroo", "sushi-train-panic", "the-monster-s-den"];
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); const res = {};
  for (const [tag, f] of Object.entries(files)) {
    const p = await b.newPage(); p.on("dialog", d => d.accept()); await p.goto("file://" + f + "#t");
    res[tag] = await p.evaluate(([ids]) => window.__ev(function (ids) {
      const out = {};
      for (const id of ids) {
        const s = SAMPLE_GAMES.find(s => s.id === id); loadExampleGame(s.builder, s.name, { skipConfirm: true }); snapshotCurrentRoomState();
        const rs = rooms.map(r => JSON.stringify([r.board, r.colorBoard, r.groundSkinBoard, r.groundSkinRotationBoard, r.actors.map(a => [a.defId, a.spawnX, a.spawnY]), r.startPos, r.gravityEnabled, r.wrapHEnabled, r.wrapVEnabled, r.cameraMode]));
        let paint = 0; rooms.forEach(r => r.backgroundBoard.forEach(row => row.forEach(v => { if (v) paint++; })));
        out[id] = { rooms: rs.length, hash: rs.map(x => { let h = 5381; for (let i = 0; i < x.length; i++) h = (Math.imul(h, 33) ^ x.charCodeAt(i)) >>> 0; return h; }), paint, doorLinks: JSON.stringify(doorLinks).length, defs: Object.keys(actorDefs).length };
      }
      return out;
    })(ids), [IDS]);
    await p.close();
  }
  let bad = 0;
  for (const id of IDS) { const o = res.old[id], c = res.cur[id]; const same = JSON.stringify(o.hash) === JSON.stringify(c.hash) && o.doorLinks === c.doorLinks && o.defs === c.defs && o.rooms === c.rooms;
    if (!same) bad++; console.log((same ? "ok   " : "FAIL ") + id + ": layout identical = " + same + "; Paint cells " + o.paint + " -> " + c.paint); }
  await b.close(); console.log(bad ? "FAILED" : "ALL PASSED"); process.exit(bad ? 1 : 0);
})();
