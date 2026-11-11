// Dev tool: builds examples/cannon-range.json, a prototype "cannon shooting challenge" (edit it freely).
// The hero carries crates (E) along a row of cannons and drops one on the cannon of their choice; the fixed arc lands it
// a fixed distance away, where wanderers pace along a catwalk. A crate coming down on one squashes it (it goes back to its start).
// node tests/cannonrange.gen.js [out.json]
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const out = process.argv[2] || path.join(__dirname, "..", "examples", "cannon-range.json");
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = `window.__g = () => {
  restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); activateRoom(rooms[0].id);
  const solid = (x, y) => { board[y][x] = "solid:none"; };
  gravityEnabled = true; gravityDir = "down"; wrapHEnabled = false; wrapVEnabled = false; cameraMode = "fixed";
  paintSkyBackdrop();
  for (let y = 0; y < ROWS; y++) { solid(0, y); solid(COLS - 1, y); }
  for (let x = 0; x < COLS; x++) solid(x, ROWS - 1);
  // the firing table (row 16) with a cannon standing on it every other cell; the hero walks (and hops) along row 15
  for (let x = 1; x <= 13; x++) solid(x, 16);
  [5, 7, 9, 11].forEach(x => { board[15][x] = "cannon2-ne:none"; });
  // the target run: a catwalk (row 14) with walls at both ends, a lava pit under it; wanderers pace along it
  for (let x = 14; x <= COLS - 2; x++) { board[16][x] = "none:lethal"; groundSkinBoard[16][x] = "lthLava"; }
  for (let x = 15; x <= COLS - 2; x++) solid(x, 14);
  solid(15, 13);
  // supply: a crate spawner and a bomb spawner in the left wall, throwing east onto a shelf (row 13) with a stopper wall
  for (let x = 1; x <= 2; x++) solid(x, 13);
  solid(3, 12); solid(3, 11); solid(3, 10);
  board[12][0] = "spawner-e:none"; board[11][0] = "spawner-e:none";
  spawnerContents[roomCellKey(currentRoomId, 0, 12)] = PUSHABLE_DEF_ID;
  spawnerContents[roomCellKey(currentRoomId, 0, 11)] = CARRY_BOMB2_DEF_ID;
  actorDefs[findDefaultActorDef("wanderer")].lethal = false; // the targets are harmless
  const put = (defId, cx, cy) => { selectedActorDefId = defId; return placeNewActor(cx * TILE + TILE / 2, cy * TILE + TILE / 2); };
  put(playerDefId, 4, 15);
  [16, 18, 21].forEach(x => put(findDefaultActorDef("wanderer"), x, 13));
  snapshotCurrentRoomState();
  return JSON.stringify({ format: "toygamedesigner-project", version: 1, data: captureProjectSnapshot() });
};`;
const tmp = path.join(os.tmpdir(), "cannonrange_gen.html"); fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK));
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); const p = await b.newPage();
  p.on("pageerror", e => console.log("ERR", String(e))); await p.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await p.goto("file://" + tmp + "#t"); await p.waitForFunction(() => window.__g);
  fs.writeFileSync(out, await p.evaluate(() => window.__g())); await b.close(); console.log("wrote", out);
})();
