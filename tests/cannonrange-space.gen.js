// Dev tool: builds examples/cannon-range-space.json, a prototype "cannon shooting challenge" (edit it freely).
// The hero carries crates (E) along a row of cannons and drops one on the cannon of their choice; the fixed arc lands it
// a fixed distance away, where wanderers pace along a catwalk. A crate coming down on one squashes it (it goes back to its start).
// node tests/cannonrange.gen.js [out.json]
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const out = process.argv[2] || path.join(__dirname, "..", "examples", "cannon-range-space.json");
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = `window.__g = () => {
  restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); activateRoom(rooms[0].id);
  const solid = (x, y) => { board[y][x] = "solid:none"; };
  gravityEnabled = false; gravityDir = "down"; wrapHEnabled = false; wrapVEnabled = false; cameraMode = "fixed";
  for (let y = 0; y < ROWS; y++) { solid(0, y); solid(COLS - 1, y); }
  for (let x = 0; x < COLS; x++) { solid(x, 0); solid(x, ROWS - 1); }
  // the lava gap: a full-height river, columns 12-13 (nothing floats across it; knock the targets in)
  for (let y = 1; y < ROWS - 1; y++) for (let x = 12; x <= 13; x++) { board[y][x] = "none:lethal"; groundSkinBoard[y][x] = "lthLava"; }
  // cannon pads along the bank at different heights; each fires up and to the right
  [3, 6, 9, 12, 15].forEach(y => { board[y][11] = "cannon2-ne:none"; });
  // supply: a crate spawner and a bomb spawner in the left wall, free to reach in open space
  board[7][0] = "spawner-e:none"; board[10][0] = "spawner-e:none";
  spawnerContents[roomCellKey(currentRoomId, 0, 7)] = PUSHABLE_DEF_ID;
  spawnerContents[roomCellKey(currentRoomId, 0, 10)] = CARRY_BOMB2_DEF_ID;
  actorDefs[findDefaultActorDef("wanderer")].lethal = false; actorDefs[findDefaultActorDef("wanderer")].staysGone = true; // the targets are harmless
  const put = (defId, cx, cy) => { selectedActorDefId = defId; return placeNewActor(cx * TILE + TILE / 2, cy * TILE + TILE / 2); };
  put(playerDefId, 4, 9);
  [[15,4],[16,8],[15,12],[17,6],[16,14]].forEach(([x, y]) => put(findDefaultActorDef("wanderer"), x, y));
  snapshotCurrentRoomState();
  return JSON.stringify({ format: "toygamedesigner-project", version: 1, data: captureProjectSnapshot() });
};`;
const tmp = path.join(os.tmpdir(), "cannonrange_space_gen.html"); fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK));
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); const p = await b.newPage();
  p.on("pageerror", e => console.log("ERR", String(e))); await p.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await p.goto("file://" + tmp + "#t"); await p.waitForFunction(() => window.__g);
  fs.writeFileSync(out, await p.evaluate(() => window.__g())); await b.close(); console.log("wrote", out);
})();
