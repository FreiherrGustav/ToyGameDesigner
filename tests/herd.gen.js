// Dev tool: builds examples/herd-the-wheebuns.json, a prototype "herd the Wheebuns" level (edit it freely).
// Top-down (no gravity). Fleers always run straight away from the hero, so the hero herds them by where they stand: a funnel of
// walls leads to a pen on the right; fans nudge strays; a Button back at the start closes the pen gate; a Wheebun on the pen's plates
// opens the goal's gate. node tests/herd.gen.js [out.json]
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const out = process.argv[2] || path.join(__dirname, "..", "examples", "herd-the-wheebuns.json");
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = `window.__g = () => {
  restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); activateRoom(rooms[0].id);
  const solid = (x, y) => { board[y][x] = "solid:none"; };
  gravityEnabled = false; wrapHEnabled = false; wrapVEnabled = false; cameraMode = "fixed";
  paintSkyBackdrop();
  for (let y = 0; y < ROWS; y++) { solid(0, y); solid(COLS - 1, y); }
  for (let x = 0; x < COLS; x++) { solid(x, 0); solid(x, ROWS - 1); }
  // the funnel: from column 6 the walls close in, one row every two columns, toward the mouth at column 17 (rows 7-9)
  for (let c = 6; c <= 17; c++) { const t = Math.min(6, Math.floor((c - 5) / 2)); for (let y = 0; y <= t; y++) { solid(c, y); solid(c, 16 - y + 1); } }
  // the pen: columns 18-22, rows 5-11, walled on every side
  for (let x = 17; x <= COLS - 1; x++) for (let y = 0; y < ROWS; y++) if (!(x >= 18 && x <= 22 && y >= 5 && y <= 11) && !(x === 17 && y >= 7 && y <= 9)) solid(x, y);
  // the pen gate (red) is open at the start; the red Button in the far corner, behind the hero's start, turns it off, which shuts it
  for (let y = 7; y <= 9; y++) { board[y][17] = "barrier-n:none"; colorBoard[y][17] = "red"; }
  board[15][3] = "pushbutton:none"; colorBoard[15][3] = "red"; switchChannels.red = true; // far from the herd: running back to it is what traps them (a fleer stepping on a Button flips it too)
  // a column of plates along the pen's east wall (a Wheebun pinned there opens the goal gate), and the goal's little room in the top left
  for (let y = 5; y <= 11; y++) { board[y][22] = "plate:none"; colorBoard[y][22] = "yellow"; } // the whole east wall of the pen: a fleer pinned against it always stands on one
  for (let x = 1; x <= 4; x++) solid(x, 4); solid(5, 1); solid(5, 2); solid(5, 3); solid(5, 4);
  board[4][2] = "barrier-n:none"; colorBoard[4][2] = "yellow";
  board[2][2] = "goal:none";
  // two fans at the funnel's wide end that sweep strays in toward the middle
  board[1][5] = "fan-s:none"; board[16][5] = "fan-n:none";
  const put = (defId, cx, cy) => { selectedActorDefId = defId; return placeNewActor(cx * TILE + TILE / 2, cy * TILE + TILE / 2); };
  put(playerDefId, 2, 9);
  const fl = findDefaultActorDef("fleer");
  [[7, 6], [8, 8], [7, 10], [9, 12], [10, 5]].forEach(([x, y]) => put(fl, x, y));
  snapshotCurrentRoomState();
  return JSON.stringify({ format: "toygamedesigner-project", version: 1, data: captureProjectSnapshot() });
};`;
const tmp = path.join(os.tmpdir(), "herd_gen.html"); fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK));
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); const p = await b.newPage();
  p.on("pageerror", e => console.log("ERR", String(e))); await p.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await p.goto("file://" + tmp + "#t"); await p.waitForFunction(() => window.__g);
  fs.writeFileSync(out, await p.evaluate(() => window.__g())); await b.close(); console.log("wrote", out);
})();
