// Bomb fuse (resets on pickup/cannon, lit on landing) and the "stays gone" toggle. node tests/fusegone.test.js
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
let src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
src = src.replace(anchor, anchor + `window.__t = { rooms:()=>rooms, get board(){return board}, get actors(){return actors}, tick, triggerCannon, placeNewActor, setSel:d=>{selectedActorDefId=d}, TILE, ROWS, COLS, PUSHABLE_DEF_ID, CARRY_BOMB2_DEF_ID, actorDefs:()=>actorDefs, findDefaultActorDef, playerDefId:()=>playerDefId, enterPlayMode, exitToBuildMode:()=>document.getElementById("modeBuild")&&0, gameNow, setGrav:g=>{gravityEnabled=g}, resetBtn:()=>document.getElementById("resetBtn").click(), startPos:()=>startPos, restoreBlast:()=>0 };\n`);
src = src.replace("requestAnimationFrame(frame);", "/*raf off*/");
const tmp = path.join(os.tmpdir(), "fusegone.html"); fs.writeFileSync(tmp, src);
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); const p = await b.newPage();
  p.on("pageerror", e => { console.log("ERR", String(e)); fails++; });
  await p.goto("file://" + tmp + "#t"); await p.waitForFunction(() => window.__t);
  const r = await p.evaluate(() => {
    const t = window.__t, T = t.TILE, out = {};
    t.setGrav(true);
    const solid = (x, y) => { t.board[y][x] = "solid:none"; };
    for (let x = 0; x < t.COLS; x++) solid(x, t.ROWS - 1);
    t.board[t.ROWS - 2][5] = "cannon2-ne:none";
    t.setSel(t.playerDefId()); t.placeNewActor(2 * T, (t.ROWS - 2) * T);
    t.setSel(t.CARRY_BOMB2_DEF_ID);
    t.placeNewActor(8 * T + 16, (t.ROWS - 4) * T);
    const bomb = t.actors[t.actors.length - 1];
    // case 1: fuse already ticking, loaded into a cannon -> reset + not ticking while loaded/flying
    bomb.fuseRemainingMs = 300; bomb.fuseArmed = true; bomb.fuseTimerId = 1;
    t.triggerCannon(bomb, "cannon2-ne", 5, t.ROWS - 2);
    out.afterLoad = { rem: bomb.fuseRemainingMs, ticking: bomb.fuseTimerId != null, wait: !!bomb.fuseWaitLand };
    let airborneTicking = false, litAt = null, f = 0;
    for (; f < 600 && !bomb.detonating; f++) {
      t.tick(1 / 60);
      if (bomb.ballistic && bomb.fuseTimerId != null) airborneTicking = true;
      if (litAt == null && bomb.fuseTimerId != null) litAt = f;
    }
    out.flight = { airborneTicking, litAt, x: bomb.x / T, y: bomb.y / T, detonating: !!bomb.detonating, grounded: bomb.grounded };
    return out;
  });
  console.log(JSON.stringify(r));
  ok(r.afterLoad.rem === 1200 && r.afterLoad.wait, "cannon load resets fuse and holds it");
  ok(!r.flight.airborneTicking, "fuse never ticks while in the cannon or flying");
  ok(r.flight.litAt != null || r.flight.detonating, "fuse lit (or fall rule fired) once it landed");
  const g = await p.evaluate(() => {
    const t = window.__t, T = t.TILE, d = t.actorDefs();
    const w = t.findDefaultActorDef("wanderer");
    const res = {};
    // lava pool under a wanderer, Build mode
    t.setGrav(false);
    for (let x = 10; x < 14; x++) { t.board[8][x] = "none:lethal"; }
    d[w].lethal = false;
    const make = () => { t.setSel(w); t.placeNewActor(11 * T + 16, 8 * T + 16); return t.actors[t.actors.length - 1]; };
    const a = make(); const idA = a.id;
    for (let f = 0; f < 30; f++) t.tick(1 / 60);
    res.defaultStillThere = t.actors.some(x => x.id === idA);
    d[w].staysGone = true;
    const b = make(); const idB = b.id;
    for (let f = 0; f < 40; f++) t.tick(1 / 60);
    res.goneRemoved = !t.actors.some(x => x.id === idB);
    return res;
  });
  await new Promise(r => setTimeout(r, 400));
  const g2 = await p.evaluate(() => { const t = window.__t; return { stillGone: !t.actors.some(a => a.destroyed), count: t.actors.length }; });
  console.log(JSON.stringify(g), JSON.stringify(g2));
  ok(g.defaultStillThere, "default character is sent home, not removed");
  ok(g.goneRemoved, "stays-gone character is removed in Build");
  await b.close(); console.log(fails ? "FAILED " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})();
