// A crate is smashed by a bomb blast or a Large Stone falling on it; a short drop and resting stacks leave it alone (not deployed).
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/opt/node22/lib/node_modules/playwright");
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = `window.__k = (() => {
  const FLOOR = 17 * TILE - ACTOR_SIZE / 2 - 1;
  const mk = (id, px, py) => { const a = placeCarryableActor(id, px, py); a.spawnX = a.x; a.spawnY = a.y; return a; };
  function room() {
    suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false;
    gravityEnabled = true; gravityDir = "down";
    for (let x = 0; x < 24; x++) { board[17][x] = "solid:none"; board[0][x] = "solid:none"; }
    for (let y = 0; y < 18; y++) { board[y][0] = "solid:none"; board[y][23] = "solid:none"; }
    actors.length = 0;
  }
  const step = n => { for (let i = 0; i < n; i++) tick(1 / 60); };
  const gone = c => !actors.includes(c);
  return {
    blast() { room(); const b = mk(CARRY_BOMB2_DEF_ID, 12 * TILE + 16, FLOOR); const c = mk(PUSHABLE_DEF_ID, 13 * TILE + 16, FLOOR); const far = mk(PUSHABLE_DEF_ID, 18 * TILE, FLOOR); step(10);
      detonateCarriedBombAt(currentRoomId, b.id); step(5); advanceGameClock(1); step(2); return { crateGone: gone(c), farKept: !gone(far) }; },
    stone(tiles) { room(); const c = mk(PUSHABLE_DEF_ID, 12 * TILE + 16, FLOOR); step(10);
      const s = mk(LARGE_STONE_DEF_ID, 12 * TILE + 16, FLOOR - ACTOR_SIZE - tiles * TILE); s.x = c.x; let n = 0; while (!c.destroyed && n++ < 200) step(1); advanceGameClock(1); step(2); return { destroyed: !!c.destroyed, gone: gone(c) }; },
    rest() { room(); const c = mk(PUSHABLE_DEF_ID, 12 * TILE + 16, FLOOR); step(10); const s = mk(LARGE_STONE_DEF_ID, 12 * TILE + 16, c.y - ACTOR_SIZE - 1); s.x = c.x; step(600); return { kept: !gone(c) && !c.destroyed }; },
    crateOnStone() { room(); const s = mk(LARGE_STONE_DEF_ID, 12 * TILE + 16, FLOOR); step(10); const c = mk(PUSHABLE_DEF_ID, 12 * TILE + 16, FLOOR - ACTOR_SIZE - 5 * TILE); c.x = s.x; step(120); return { stoneKept: !gone(s), crateKept: !c.destroyed }; }
  };
})();`;
(async () => {
  const tmp = path.join(os.tmpdir(), "cs_" + process.pid + ".html");
  fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK + "\n"));
  const br = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await (await br.newContext()).newPage(); const errs = [];
  page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept());
  await page.goto("file://" + tmp + "#t"); await page.waitForTimeout(300);
  let fail = 0; const ok = (n, c, x) => { if (!c) fail++; console.log((c ? "ok   " : "FAIL ") + n + " " + JSON.stringify(x)); };
  const ev = (f, ...a) => page.evaluate(([f, a]) => window.__k[f](...a), [f, a]);
  let r = await ev("blast"); ok("bomb blast smashes the adjacent crate, far crate survives", r.crateGone && r.farKept, r);
  for (const t of [2, 4]) { r = await ev("stone", t); ok(`stone dropped ${t} tiles smashes the crate`, r.destroyed && r.gone, r); }
  r = await ev("rest"); ok("stone resting on a crate leaves it alone for 10 s", r.kept, r);
  r = await ev("crateOnStone"); ok("a crate falling on a stone is fine", r.stoneKept && r.crateKept, r);
  ok("no page errors", errs.length === 0, errs); await br.close(); fs.unlinkSync(tmp); process.exit(fail ? 1 : 0);
})();
