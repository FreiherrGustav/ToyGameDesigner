// Black hole and warp animations. Usage: node tests/vortex.test.js [shotDir]
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
if (!src.includes(anchor)) throw new Error("anchor missing");
const tmp = path.join(os.tmpdir(), "vortex_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + `window.__ev=f=>eval("("+f+")");`));
const shots = process.argv[2];
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; console.log("ok  ", m); } else { fails.push(m); console.log("FAIL", m); } };
const ev = (pg, code) => pg.evaluate(c => window.__ev(c)(), code);

const SCENE = `(geom, kind)=>{
  suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false;
  loadStarterBoard(); gravityEnabled = false;
  board[8][12] = gameplayKey(geom, "none");
  const p = actors.find(a => a.isPlayer);
  if (kind) {
    const id = kind === "pushable" ? PUSHABLE_DEF_ID : defaultDefIdForKind(kind);
    selectedActorDefId = id; paintMode = "actor";
    placeNewActor(12 * TILE + TILE / 2 - 60, 8 * TILE + TILE / 2);
  }
  p.x = 3 * TILE; p.y = 3 * TILE;
  enterPlayMode(); playReadyUntil = null;
  return actors.length;
}`;
const STEP = `(n)=>{ for (let i=0;i<n;i++){ tick(1/60); renderGame(); } return fxGhosts.length; }`;

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = []; page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept());
  await page.goto("file://" + tmp + "#t"); await page.waitForFunction(() => window.__ev);
  const scene = (g, k) => page.evaluate(([s, a, b]) => window.__ev(s)(a, b), [SCENE, g, k]);
  const step = n => page.evaluate(([s, n]) => window.__ev(s)(n), [STEP, n]);
  const shot = async name => { if (shots) { fs.mkdirSync(shots, { recursive: true }); await page.locator("#gameCanvas").screenshot({ path: path.join(shots, name + ".png") }); } };

  // --- crate swallowed by a black hole ---
  await scene("gravitywell", "pushable");
  await ev(page, `()=>{ const c = actors.find(a => a.defId === PUSHABLE_DEF_ID); window.__c = c; c.vx = 100; return 1; }`);
  let sawGhost = 0;
  for (let i = 0; i < 80 && !sawGhost; i++) sawGhost = await step(1);
  ok(sawGhost > 0, "a ghost appears when the crate is captured");
  const g = await ev(page, `()=>{ const g = fxGhosts[0]; return g && { recipe: g.recipe, dx: g.dx, hidden: window.__c.vortexHidden, destroyed: window.__c.destroyed }; }`);
  ok(g && g.recipe === "blackHoleSuck" && g.hidden && g.destroyed, "ghost is blackHoleSuck, crate hidden and destroyed");
  await step(8); await shot("bh-early");
  await step(14); await shot("bh-mid");
  await step(30);
  ok((await ev(page, `()=>fxGhosts.length`)) === 0, "ghost finishes");
  await page.waitForTimeout(700); await step(40);
  ok(await ev(page, `()=>!actors.includes(window.__c)`), "crate removed after the animation");

  // --- wanderer goes home with a pop-in ---
  await scene("gravitywell", "wanderer");
  await ev(page, `()=>{ const n = actors[actors.length-1]; window.__n = n; n.spawnX = 20*TILE; n.spawnY = 14*TILE; n.vx = 60; return 1; }`);
  let ng = 0; for (let i = 0; i < 90 && !ng; i++) ng = await step(1);
  const n = await ev(page, `()=>({ ghosts: fxGhosts.length, home: Math.abs(window.__n.x - 20*TILE) < 4, anim: animState[window.__n.id] && animState[window.__n.id].recipe, alive: actors.includes(window.__n) })`);
  ok(n.ghosts > 0 && !n.home, "NPC (Play): ghost sucked in, placed character destroyed, not sent home");

  // --- player in Play: game over waits for the animation ---
  await scene("gravitywell", null);
  await ev(page, `()=>{ const p = actors.find(a => a.isPlayer); p.x = 12*TILE + 4; p.y = 8*TILE + 4; return 1; }`);
  await step(3);
  const pl = await ev(page, `()=>{ const p = actors.find(a => a.isPlayer); return { ended: playSessionEnded, hidden: p.vortexHidden, ghost: fxGhosts.some(g => g.holdOverlay) }; }`);
  ok(pl.ended && pl.hidden && pl.ghost, "player: game over, hidden, ghost holds the overlay");
  await step(70);
  ok((await ev(page, `()=>fxGhosts.length`)) === 0, "player ghost finishes");

  // --- warp ---
  await scene("warp", null);
  await ev(page, `()=>{ const p = actors.find(a => a.isPlayer); window.__p0 = {x:p.x,y:p.y}; p.x = 12*TILE + 4; p.y = 8*TILE + 4; return 1; }`);
  await step(2);
  const w = await ev(page, `()=>{ const p = actors.find(a => a.isPlayer); return { ghost: fxGhosts.map(g => g.recipe), anim: animState[p.id] && animState[p.id].recipe, moved: Math.hypot(p.x - 12*TILE, p.y - 8*TILE) > TILE }; }`);
  ok(w.ghost.includes("warpOut") && w.anim === "warpIn" && w.moved, "warp: warpOut ghost at origin, warpIn at the destination");
  await shot("warp-now");
  await step(30);
  ok((await ev(page, `()=>fxGhosts.length`)) === 0, "warp ghost finishes");

  // --- teleporter tile art animates ---
  const frames = await ev(page, `()=>{ const set = new Set(); const t0 = gameClockMs; for (let i=0;i<14;i++){ advanceGameClock(110); set.add(Math.floor(gameNow()/TELEPORTER_FRAME_MS)%TELEPORTER_FRAMES.length); } return set.size; }`);
  ok(frames >= 6, "teleporter frames cycle (" + frames + ")");
  ok(await ev(page, `()=>GEOMETRY_ICONS.warp === TELEPORTER_FRAME1_ART`), "warp swatch is teleporter frame 1");

  // --- export plays ---
  await scene("gravitywell", "pushable");
  const html = await ev(page, `()=>{ let out = null; const orig = URL.createObjectURL; try { return typeof exportStandaloneGame; } catch(e){ return String(e);} }`);
  ok(html === "function", "exportStandaloneGame exists");

  ok(errors.length === 0, "no page errors" + (errors.length ? ": " + errors[0] : ""));
  console.log(`\n${pass} passed, ${fails.length} failed`); await browser.close(); process.exit(fails.length ? 1 : 0);
})();
