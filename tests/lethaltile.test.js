// Per-tile lethal for placed characters. Usage: node tests/lethaltile.test.js
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
if (!src.includes(anchor)) throw new Error("anchor missing");
const tmp = path.join(os.tmpdir(), "lethaltile_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + `window.__ev=f=>eval("("+f+")");`));
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; console.log("ok  ", m); } else { fails.push(m); console.log("FAIL", m); } };
// a wanderer standing in a lethal cell with the given skin; mode "play" or "build"
const SCENE = `(skin, mode)=>{
  if (appMode === "play") exitToBuildMode();
  suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false;
  loadStarterBoard();
  const id = defaultDefIdForKind("wanderer"); actorDefs[id].lethal = false;
  const p = actors.find(a => a.isPlayer);
  selectedActorDefId = id; paintMode = "actor";
  placeNewActor(4 * TILE + 16, 4 * TILE + 16);
  let npc = actors[actors.length - 1];
  const cx = 12, cy = 4;
  board[cy][cx] = gameplayKey("none", "lethal"); if (skin) groundSkinBoard[cy][cx] = skin;
  if (mode === "play") { enterPlayMode(); playReadyUntil = null; npc = actors.find(a => !a.isPlayer && actorDefs[a.defId].temperament === "wanderer"); }
  const home = { x: npc.spawnX, y: npc.spawnY };
  npc.x = cx * TILE + 5; npc.y = cy * TILE + 5; npc.vx = 0; npc.vy = 0;
  for (let i = 0; i < 3; i++) tick(1 / 60);
  const gone = npc.destroyed;
  const atHome = Math.abs(npc.x - home.x) < 2 && Math.abs(npc.y - home.y) < 2;
  return { gone, atHome };
}`;
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await b.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept());
  await page.goto("file://" + tmp + "#t"); await page.waitForFunction(() => window.__ev);
  const run = (skin, mode) => page.evaluate(([s, k, m]) => window.__ev(s)(k, m), [SCENE, skin, mode]);
  for (const [skin, swallow] of [["lthLava", true], ["lthFire", false], ["lthSpike", false], ["lthMine", false], [null, false]]) {
    const r = await run(skin, "play");
    ok(swallow ? r.gone : (!r.gone && r.atHome), `Play, ${skin || "plain lethal"}: ${swallow ? "swallowed" : "sent home"} ${JSON.stringify(r)}`);
    const q = await run(skin, "build");
    ok(!q.gone && q.atHome, `Build, ${skin || "plain lethal"}: sent home ${JSON.stringify(q)}`);
  }
  // black hole: placed character destroyed in Play, sent home in Build
  const BH = `(mode)=>{
    if (appMode === "play") exitToBuildMode();
    suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false;
    loadStarterBoard();
    const id = defaultDefIdForKind("wanderer"); actorDefs[id].lethal = false;
    selectedActorDefId = id; paintMode = "actor"; placeNewActor(4 * TILE + 16, 4 * TILE + 16);
    let npc = actors[actors.length - 1];
    if (mode === "play") { enterPlayMode(); playReadyUntil = null; npc = actors.find(a => !a.isPlayer && actorDefs[a.defId].temperament === "wanderer"); }
    const home = { x: npc.spawnX, y: npc.spawnY };
    npc.x = 12 * TILE; npc.y = 8 * TILE;
    triggerGravityWellCapture(npc, "wanderer", 12, 8);
    return { gone: !!npc.destroyed, atHome: Math.abs(npc.x - home.x) < 2 && Math.abs(npc.y - home.y) < 2 };
  }`;
  const bp = await page.evaluate(([s, m]) => window.__ev(s)(m), [BH, "play"]), bb = await page.evaluate(([s, m]) => window.__ev(s)(m), [BH, "build"]);
  ok(bp.gone, "black hole, Play: placed character destroyed " + JSON.stringify(bp));
  ok(!bb.gone && bb.atHome, "black hole, Build: sent home " + JSON.stringify(bb));
  ok(errors.length === 0, "no page errors " + errors.join("|"));
  console.log(pass + " passed, " + fails.length + " failed"); await b.close(); process.exit(fails.length ? 1 : 0);
})();
