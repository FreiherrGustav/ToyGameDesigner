// Dev tool: builds examples/rampart.json, a Rampart-style "tower defense" prototype (edit it freely).
// A stair of firing terraces on the left (cannons at different heights and depths), a lava moat, and a big
// stone fortress on the right: a curtain wall, then a keep with 3 floors of chambers full of harmless enemies.
// Crates squash what they land on; bombs (they go off after a fall of more than 6 tiles) blow holes in floors and walls,
// and anything that falls to the bottom ends up in the lava. Supply: two spawners in the left wall throw crates and bombs onto the lowest terrace.
// node tests/rampart.gen.js [out.json]      (MEASURE=1 also fires each cannon with a crate and a bomb and prints where they land)
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const out = process.argv[2] || path.join(__dirname, "..", "examples", "rampart.json");
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = `window.__g = () => {
  restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); activateRoom(rooms[0].id);
  gravityEnabled = true; gravityDir = "down"; wrapHEnabled = false; wrapVEnabled = false; cameraMode = "follow";
  const W = roomCols();
  paintSkyBackdrop(backgroundBoard, W);
  // ---- art (Paint tiles) ----
  const L = { a: "#2b2f3a", b: "#353b49", c: "#454d5f", d: "#8a5a2b", e: "#c8281e", f: "#ffcf3a", g: "#ff8a1e", h: "#14161c", w: "#e9edf5", n: "#1e3a8a" };
  const brickRows = ["abbbabbb", "aaaaaaaa", "bbabbbab", "aaaaaaaa", "abbbabbb", "aaaaaaaa", "bbabbbab", "aaaaaaaa"];
  const mk = (id, name, rows) => { backgroundTileDefs[id] = { name, art: pat(rows, L) }; return id; };
  const BG_WALL = mk("rpWall", "castle wall", brickRows);
  const BG_SLIT = mk("rpSlit", "arrow slit", ["abbbabbb", "aaahaaaa", "bbahbbab", "aaahaaaa", "abbhabbb", "aaahaaaa", "bbabbbab", "aaaaaaaa"]);
  const BG_BANNER_R = mk("rpBannerR", "red banner", ["aeeeeaaa", "aeeeeeaa", "aeeeeaaa", "aeeeaaaa", "aeeaaaaa", "aeaaaaaa", "aaaaaaaa", "aaaaaaaa"]);
  const BG_BANNER_B = mk("rpBannerB", "blue banner", ["annnnaaa", "annnnnaa", "annnnaaa", "annnaaaa", "annaaaaa", "anaaaaaa", "aaaaaaaa", "aaaaaaaa"]);
  const BG_TORCH = mk("rpTorch", "torch", ["abbbabbb", "aaafaaaa", "bbfgfbab", "aaagaaaa", "abbdabbb", "aaadaaaa", "bbabbbab", "aaaaaaaa"]);
  const BG_FLAGPOLE = mk("rpFlagPole", "flag", ["wwwwwwww", "wddeeeww", "wd.eeeew", "wd..eeew", "wd.....w", "wd.....w", "wd.....w", "wd.....w"].map(r => r.replace(/\\./g, "w")));
  backgroundTileDefs.rpFlagPole.art = pat(["........", ".dee....", ".deee...", ".dee....", ".d......", ".d......", ".d......", ".d......"], { ".": null, d: "#8a5a2b", e: "#c8281e" });
  const BG_COBBLE = mk("rpCobble", "cobbles", ["bbbbbbbb", "bcbbbcbb", "bbbbbbbb", "bbbcbbbc", "bbbbbbbb", "bcbbbcbb", "bbbbbbbb", "bbbcbbbc"]);
  // ---- helpers ----
  const solid = (x, y, skin, mod) => { board[y][x] = "solid:" + (mod || "none"); groundSkinBoard[y][x] = skin || "gndStone"; groundSkinRotationBoard[y][x] = 0; };
  const lava = (x, y) => { board[y][x] = "none:lethal"; groundSkinBoard[y][x] = "lthLava"; groundSkinRotationBoard[y][x] = 0; };
  const bg = (x, y, id) => { backgroundBoard[y][x] = id; };
  const FX = ${process.env.FX || 0}; // fortress shift, set from the measurements
  // ---- frame: bedrock row 17, left wall ----
  for (let x = 0; x < W; x++) solid(x, ROWS - 1, "gndStone", "indestructible");
  for (let y = 0; y < ROWS; y++) { solid(0, y, "gndBrick", "indestructible"); solid(W - 1, y, "gndBrick", "indestructible"); }
  // ---- the firing stair: DESCENDING toward the fortress (a rising stair would wall off the lower cannons) ----
  // [x0, x1, standing row]; high cannons are far back and shoot far, low cannons are close and shoot short
  const steps = [[1, 16, 5], [17, 19, 8], [20, 20, 11]];
  steps.forEach(([x0, x1, sr]) => { for (let x = x0; x <= x1; x++) for (let y = sr + 1; y < ROWS - 1; y++) solid(x, y, y === sr + 1 ? "gndBrick" : "gndStone"); });
  const cannons = [[11, 5], [13, 5], [15, 5], [17, 8], [19, 8], [20, 11]];
  cannons.forEach(([x, y]) => { board[y][x] = "cannon2-ne:none"; });
  board[4][0] = "spawner-e:none"; board[3][0] = "spawner-e:none";
  spawnerContents[roomCellKey(currentRoomId, 0, 4)] = PUSHABLE_DEF_ID;
  spawnerContents[roomCellKey(currentRoomId, 0, 3)] = CARRY_BOMB2_DEF_ID;
  // ---- the moat: lava under everything, so a broken floor drops its enemies into it ----
  for (let x = 21; x < W - 1; x++) lava(x, ROWS - 2);
  // ---- the fortress: every wall and floor ONE tile thick so a bomb breaches it ----
  const F0 = 22 + FX;
  const K0 = F0 + 5, K1 = K0 + 9;
  for (let y = 11; y <= 15; y++) solid(F0, y, "gndBrick");            // curtain wall
  solid(F0, 10, "gndBrick");
  for (let x = F0 + 1; x < K0; x++) solid(x, 15, "gndStone");        // yard floor
  for (let y = 11; y <= 15; y++) { solid(K0, y, "gndBrick"); solid(K1, y, "gndBrick"); }  // keep walls
  for (let x = K0; x <= K1; x++) { solid(x, 11, "gndBrick"); solid(x, 15, "gndStone"); }  // roof + chamber floor
  for (let x = K0; x <= K1; x += 3) solid(x, 10, "gndStone");        // battlements
  [K0 + 4].forEach(px => { for (let y = 12; y <= 14; y++) solid(px, y, "gndBrick"); });  // partition
  const T0 = K1 - 4;
  for (let y = 5; y <= 10; y++) { solid(T0, y, "gndBrick"); solid(K1, y, "gndBrick"); }
  for (let x = T0; x <= K1; x++) { solid(x, 4, "gndBrick"); solid(x, 8, "gndStone"); }
  for (let x = T0; x <= K1; x += 2) solid(x, 3, "gndStone");
  // decoration: castle wall, slits, torches, banners behind every chamber; flags on the roofs; cobbles in the yard
  for (let y = 12; y <= 14; y++) for (let x = K0 + 1; x < K1; x++) { if (!board[y][x]) { const k = (x * 5 + y * 3) % 9; bg(x, y, k === 0 ? BG_TORCH : k === 4 ? BG_SLIT : (y === 12 && k === 6) ? BG_BANNER_R : (y === 12 && k === 2) ? BG_BANNER_B : BG_WALL); } }
  for (let y = 5; y <= 10; y++) for (let x = T0 + 1; x < K1; x++) bg(x, y, (x + y) % 5 === 0 ? BG_SLIT : (y === 6 && x % 3 === 0) ? BG_BANNER_R : BG_WALL);
  bg(K0 + 2, 10, BG_FLAGPOLE); bg(K1 - 2, 3, BG_FLAGPOLE); bg(F0, 10, BG_FLAGPOLE);
  for (let y = 12; y <= 14; y++) for (let x = F0 + 2; x < K0; x++) bg(x, y, BG_COBBLE);
  // ---- enemies: harmless wanderers in every chamber, on the roof and in the yard ----
  actorDefs[findDefaultActorDef("wanderer")].lethal = false;
  const wDef = findDefaultActorDef("wanderer");
  const put = (defId, cx, cy) => { selectedActorDefId = defId; return placeNewActor(cx * TILE + TILE / 2, cy * TILE + TILE / 2); };
  [K0 + 2, K0 + 6, K1 - 2].forEach(x => put(wDef, x, 14));
  [K0 + 1, K0 + 2, K0 + 4, K0 + 5, K0 + 7].forEach(x => put(wDef, x, 10));  // roof patrol
  put(wDef, T0 + 2, 7); put(wDef, T0 + 2, 6);  // the back tower, two rooms
  [F0 + 2, F0 + 3, F0 + 4].forEach(x => put(wDef, x, 14)); put(wDef, F0 + 1, 10);                     // yard
  // hero at the foot of the stair
  put(playerDefId, 3, 4);
  startPos.x = 3 * TILE; startPos.y = 4 * TILE;
  snapshotCurrentRoomState();
  return JSON.stringify({ format: "toygamedesigner-project", version: 1, data: captureProjectSnapshot() });
};`;
const tmp = path.join(os.tmpdir(), "rampart_gen.html"); fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK));
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); const p = await b.newPage();
  p.on("pageerror", e => console.log("ERR", String(e))); await p.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await p.goto("file://" + tmp + "#t"); await p.waitForFunction(() => window.__g);
  fs.writeFileSync(out, await p.evaluate(() => window.__g())); await b.close(); console.log("wrote", out);
})();
