// Switchable magnet + hold-on-contact (not deployed). Usage: node tests/magnet.test.js
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/opt/node22/lib/node_modules/playwright");
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const tmp = path.join(os.tmpdir(), "magnet_test_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + 'window.__ev=f=>eval("("+f+")");'));
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage(); p.on("dialog", d => d.accept()); const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto("file://" + tmp);
  const r = await p.evaluate(() => window.__ev(function () {
    loadExampleGame(buildLongWayOutGame, "x"); exitToBuildMode && 0;
    const out = {};
    const trial = (color, sw) => {
      loadExampleGame(buildLongWayOutGame, "x");
      for (const a of actors.filter(a => !a.isPlayer)) removeActorById(a.id);
      for (let x = 0; x < 24; x++) board[17][x] = "solid:none";
      board[14][10] = "magnet:none"; colorBoard[14][10] = color;
      enterPlayMode(); playReadyUntil = null; switchChannels = { red: !!sw };
      const bomb = placeCarryableActor(CARRY_BOMB2_DEF_ID, 2, 14); // falls toward the floor, sliding east? no: set velocity
      bomb.x = 9 * TILE + 8; bomb.y = 14 * TILE + 3; bomb.vx = 0; bomb.vy = 0;
      for (let i = 0; i < 90; i++) tick(1 / 60);
      const held = bomb.y < 15 * TILE && Math.abs(bomb.vy) < 1;
      return { bomb, held };
    };
    const a = trial(null, false); out.untaggedHolds = a.held;
    const b = trial("red", true); out.onHolds = b.held;
    switchChannels = { red: false }; for (let i = 0; i < 60; i++) tick(1 / 60); out.offDrops = b.bomb.y > 15 * TILE;
    const c = trial("red", false); out.offDoesNotHold = !c.held;
    return out;
  })());
  console.log(JSON.stringify(r), errs);
  const ok = r.untaggedHolds && r.onHolds && r.offDrops && r.offDoesNotHold && !errs.length;
  console.log(ok ? "PASS" : "FAIL"); await b.close(); process.exit(ok ? 0 : 1);
})();
