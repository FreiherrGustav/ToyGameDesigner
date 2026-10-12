// Lava double-death, stale death-reset timer, side-dig lock, handled-crate crush (not deployed). Usage: node tests/deathdig.test.js
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const REPO = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
if (!src.includes(anchor)) throw new Error("anchor missing");
const tmp = path.join(os.tmpdir(), "fixes_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + `window.__ev=f=>eval("("+f+")");`));
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; console.log("ok  ", m); } else { fails.push(m); console.log("FAIL", m); } };
const run = (pg, fn, arg) => pg.evaluate(([s, a]) => window.__ev(s)(a), [fn.toString(), arg]);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = []; page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept());
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto("file://" + tmp); await page.waitForFunction(() => window.__ev);
  const load = () => run(page, () => {
    if (appMode === "play") exitToBuildMode();
    loadExampleGame(buildRockBottomGame, "Rock Bottom"); enterPlayMode(); playReadyUntil = null;
    for (const k in keys) keys[k] = false;
    if (!window.__wrapped) { window.__wrapped = true; window.__restarts = 0; const o = restartLevelKeepingLives; restartLevelKeepingLives = function(){ window.__restarts++; return o(); }; }
    window.__restarts = 0; return true; });

  // 1. lava double death: stay in lava ~1.5s of real+game time, count lives lost and level restarts
  await load();
  await run(page, () => { const p = actors.find(a=>a.isPlayer); // find a lava cell
    let lc=null; for (let y=0;y<ROWS&&!lc;y++) for (let x=0;x<72;x++){ const g=board[y][x]; if (g && g.endsWith(":lethal")) { lc=[x,y]; break; } }
    window.__lava = lc; p.x = lc[0]*TILE+5; p.y = lc[1]*TILE+5; p.vx=0; p.vy=0; return lc; });
  for (let i = 0; i < 30; i++) { await run(page, () => { const p = actors.find(a=>a.isPlayer); if (appMode==="play" && window.__lava && window.__restarts===0) { p.x=window.__lava[0]*TILE+5; p.y=window.__lava[1]*TILE+5; p.vx=0;p.vy=0;} for (let k=0;k<3;k++) tick(1/60); }); await sleep(50); }
  const r1 = await run(page, () => ({ lives, restarts: window.__restarts }));
  console.log("lava:", r1);
  ok(r1.lives === 2, "one lava visit costs exactly one life (lives=" + r1.lives + ")");
  ok(r1.restarts === 1, "exactly one level restart (" + r1.restarts + ")");

  // 2. throw into a wall while standing against it
  await load();
  const r2 = await run(page, () => {
    const P = actors.find(a=>a.isPlayer);
    // corridor row 10: stand at col 33 next to the dirt shelf at (34,10), facing east
    P.x = 33*TILE + (TILE-P.w)/2; P.y = 11*TILE - P.h; P.vx=0; P.vy=0; P.facingDir = 1;
    for (let i=0;i<30;i++) tick(1/60);
    const crate = actors.find(a=>a.defId===PUSHABLE_DEF_ID);
    crate.x = P.x - 40; crate.y = P.y; crate.vx=0; crate.vy=0;
    attachCarryable(P, crate); for (let i=0;i<5;i++) tick(1/60);
    const before = lives; P.facingDir = 1;
    throwCarriedObject(P, 450);
    let minL = lives; for (let i=0;i<150;i++){ tick(1/60); minL = Math.min(minL, lives); }
    return { before, after: minL, crate: [crate.x, crate.y] };
  });
  console.log("throw:", r2);
  ok(r2.after === r2.before, "throwing into a wall does not crush you (lives " + r2.before + " -> " + r2.after + ")");

  // 3. dig lock: dig through the cork holding Right+Down; player must not run into the pit
  await load();
  const r3 = await run(page, () => {
    const P = actors.find(a=>a.isPlayer);
    // find the cork: a diggable cell in row 15 col 52
    const cx = 52, cy = 15;
    P.x = (cx-1)*TILE + (TILE-P.w)/2; P.y = (cy+1)*TILE - P.h; P.vx=0; P.vy=0; P.facingDir=1;
    for (let i=0;i<20;i++) tick(1/60);
    keys.ArrowRight = true; keys.ArrowDown = true;
    let broke = -1; for (let i=0;i<200;i++){ tick(1/60); if (board[cy][cx]===null) { broke=i; break; } }
    const xAtBreak = P.x; let maxX = P.x;
    for (let i=0;i<60;i++){ tick(1/60); maxX = Math.max(maxX, P.x); }
    keys.ArrowRight = false; keys.ArrowDown = false;
    return { broke, xAtBreak, maxX, cellX: cx*TILE, lives, cork: board[cy][cx] };
  });
  console.log("dig:", r3);
  ok(r3.broke >= 0, "cork broke");
  ok(r3.maxX < r3.cellX + 4, "player does not walk into the opened cell while the key stays held (maxX=" + r3.maxX.toFixed(1) + " vs cell " + r3.cellX + ")");
  const r4 = await run(page, () => {
    const P = actors.find(a=>a.isPlayer); const x0 = P.x;
    keys.ArrowRight = false; for (let i=0;i<5;i++) tick(1/60);
    keys.ArrowRight = true; for (let i=0;i<20;i++) tick(1/60);
    keys.ArrowRight = false; return { moved: P.x - x0 };
  });
  ok(r4.moved > 3, "after releasing and pressing again the player moves normally (" + r4.moved.toFixed(1) + ")");

  // 4. stale reset timer: die, click Play again right away -> no second reset 650ms later
  await load();
  await run(page, () => { const p = actors.find(a=>a.isPlayer); triggerHazard(p); return true; });
  await sleep(100);
  await run(page, () => { restartPlaySessionFromSnapshot(); playReadyUntil = null; });
  await sleep(900);
  const r5 = await run(page, () => ({ restarts: window.__restarts, lives }));
  console.log("stale:", r5);
  ok(r5.restarts === 0, "a manual restart cancels the pending death reset");

  // 5. grab the bottom crate of a stack: the one above falls onto you
  await load();
  const r6 = await run(page, () => {
    const P = actors.find(a=>a.isPlayer);
    P.x = 28*TILE + (TILE-P.w)/2; P.y = 11*TILE - P.h; P.vx=0; P.vy=0; P.facingDir=1;
    for (let i=0;i<30;i++) tick(1/60);
    const cs = actors.filter(a=>a.defId===PUSHABLE_DEF_ID);
    const a = cs[0], b = cs[1];
    a.x = P.x + 30; a.y = 11*TILE - a.h; a.vx=0; a.vy=0; a.spawnX=a.x; a.spawnY=a.y;
    b.x = a.x; b.y = a.y - b.h - 1; b.vx=0; b.vy=0; b.spawnX=b.x; b.spawnY=b.y;
    for (let i=0;i<20;i++) tick(1/60);
    const before = lives;
    attachCarryable(P, a);
    let minL = lives; for (let i=0;i<90;i++){ tick(1/60); minL = Math.min(minL, lives); }
    return { before, after: minL };
  });
  console.log("stack grab:", r6);
  ok(r6.after === r6.before, "grabbing the lower crate of a stack does not cost a life (" + r6.before + " -> " + r6.after + ")");
  ok(errors.length === 0, "no page errors " + errors.join("|"));
  console.log(pass + " passed, " + fails.length + " failed");
  await browser.close(); process.exit(fails.length ? 1 : 0);
})();
