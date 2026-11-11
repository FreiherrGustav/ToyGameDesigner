// Dev tool (not shipped): turn one room of a saved project into a SURPRISE_ROOMS entry with an `exact` block.
// usage: node tests/surprise.import.js <project.json> <roomId> <id> <out.json> [--pet=<defId>] [--look=player]
// Custom characters become `actor|@<id>` pieces (their defs are copied into exact.actors, authored lethal flag kept);
// a harmless chaser clone (sp~pet~...) becomes the `softchaser` piece; ground textures and Paint tiles are copied per
// cell (custom ones are copied as defs, built-in ones keep their real id).
const fs = require("fs"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const [projFile, roomIdArg, entryId, outFile, ...flags] = process.argv.slice(2);
const proj = JSON.parse(fs.readFileSync(projFile, "utf8")).data, roomId = Number(roomIdArg);
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = `window.__imp = { run: (snap, roomId, tmp) => { restoreProjectSnapshot(snap); activateRoom(roomId);
  tmp.forEach(id => { if (actorDefs[id]) actorDefs[id].temperament = "stationary"; });
  const e = surpriseSerialize("room", "x"); return e; } };`;
const tmp = path.join(require("os").tmpdir(), "imp_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK));
const room = proj.rooms.find(r => r.id === roomId);
const builtinActor = id => ["player", "pushable", "largestone", "carrybomb2", "hazardball", "movingplatform"].includes(id) || /^col|^carry|^mv/.test(id);
const used = new Set(room.actors.filter(a => !a.isPlayer && a.spawnerKey == null).map(a => a.defId));
const custom = [...used].filter(id => !builtinActor(id) && proj.actorDefs[id] && !(proj.actorDefs[id].temperament === "collectible"));
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); const p = await b.newPage();
  p.on("dialog", d => d.accept()); p.on("pageerror", e => console.log("ERR", e));
  await p.goto("file://" + tmp + "#t"); await p.waitForFunction(() => window.__imp);
  const e = await p.evaluate(([s, r, t]) => window.__imp.run(s, r, t), [proj, roomId, custom]);
  await b.close();
  const X = { actors: {}, grounds: {}, bgs: {}, skins: [], backs: [], pet: null, chaser: null, reward: null, playerLook: null };
  // rewrite the custom-character pieces
  Object.keys(e.legend).forEach(ch => {
    e.legend[ch] = e.legend[ch].split("&").map(n => {
      if (!n.startsWith("actor|")) return n;
      const id = n.slice(6);
      if (id.startsWith("sp~pet~")) return "softchaser";
      X.actors[id] = JSON.parse(JSON.stringify(proj.actorDefs[id]));
      return "actor|@" + id;
    }).join("&");
  });
  // ground skins and Paint tiles, per cell
  const builtinGround = new Set(["gndGrass","gndStone","gndDirt","gndSnow","gndRubble","gndBrick","gndSand","gndCrystalPink","gndCrystalCyan","lthLava","lthFire","lthSpike","lthMine"]);
  for (let y = 0; y < 18; y++) for (let x = 0; x < 24; x++) {
    const s = room.groundSkinBoard[y][x]; if (s && room.board[y][x]) {
      X.skins.push([x, y, s, (room.groundSkinRotationBoard && room.groundSkinRotationBoard[y][x]) || 0]);
      if (!builtinGround.has(s) && proj.groundTileDefs[s]) X.grounds[s] = JSON.parse(JSON.stringify(proj.groundTileDefs[s]));
    }
    const g = room.backgroundBoard[y][x]; if (g) { X.backs.push([x, y, g]); if (proj.backgroundTileDefs[g]) X.bgs[g] = JSON.parse(JSON.stringify(proj.backgroundTileDefs[g])); }
  }
  const petFlag = flags.find(f => f.startsWith("--pet=")); if (petFlag) { const id = petFlag.slice(6); X.actors[id] = JSON.parse(JSON.stringify(proj.actorDefs[id])); X.pet = id; }
  if (flags.includes("--look=player")) { const d = proj.actorDefs[proj.playerDefId]; X.playerLook = { art: d.art, poses: d.poses || null }; }
  const out = { id: entryId, category: "room", closed: e.closed, stooge: e.stooge, authored: true, room: e.room, legend: e.legend, rows: e.rows, exact: X, notes: e.notes, discover: e.discover };
  fs.writeFileSync(outFile, JSON.stringify(out));
  console.log("legend", JSON.stringify(e.legend)); console.log("rows\n" + e.rows.join("\n")); console.log("notes", e.notes, "actors", Object.keys(X.actors), "grounds", Object.keys(X.grounds), "bgs", Object.keys(X.bgs), "skins", X.skins.length, "backs", X.backs.length);
})();
