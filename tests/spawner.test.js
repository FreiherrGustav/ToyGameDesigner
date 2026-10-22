// Spawner: never blocked by what sits in its launch cell (except a Large Stone); live cap is 60.
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = `window.__t = {
  setup() { loadStarterBoard(); gravityEnabled = true; const y = 16; board[y][5] = gameplayKey("spawner-e", "none"); spawnerContents[roomCellKey(currentRoomId, 5, y)] = PUSHABLE_DEF_ID; enterPlayMode(); return y; },
  put(kind, cx, cy) { const defId = kind === "stone" ? LARGE_STONE_DEF_ID : PUSHABLE_DEF_ID; const a = spawnActorAt(defId, cx * TILE + TILE / 2, cy * TILE + TILE / 2, null, { x: 0, y: 0 }); a.vx = 0; a.vy = 0; a.bouncyCooldown = 0; a.spawnerKey = null; return a.id; },
  run(n) { for (let i = 0; i < n; i++) tick(1 / 60); },
  count() { return actors.filter(a => a.spawnerKey && a.defId === PUSHABLE_DEF_ID).length; },
  get(id) { const a = actors.find(q => q.id === id); return a && { x: a.x / TILE, y: a.y / TILE, vx: a.vx }; },
  cap() { return SPAWNER_MAX_LIVE; }
};`;
const tmp = path.join(os.tmpdir(), "spawner_test.html"); fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? "ok   " : "FAIL ") + m); };
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  for (const kind of ["crate", "stone"]) {
    const p = await b.newPage(); p.on("pageerror", e => { fail++; console.log("PAGEERROR", e); });
    await p.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    await p.goto("file://" + tmp + "#t"); await p.waitForFunction(() => window.__t);
    const r = await p.evaluate(kind => { const t = window.__t; const y = t.setup(); const id = t.put(kind, 6, y); t.run(200); return { before: t.count(), item: t.get(id), y }; }, kind);
    if (kind === "crate") {
      ok(r.before >= 1, "crate in the launch cell: spawner still fired (" + r.before + " spawned)");
      ok(r.item && r.item.x > 6.5, "the crate was pushed out along the facing (x=" + (r.item && r.item.x.toFixed(2)) + ")");
    } else {
      ok(r.before === 0, "a Large Stone in the launch cell holds the spawner shut");
    }
    await p.close();
  }
  const p = await b.newPage(); await p.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await p.goto("file://" + tmp + "#t"); await p.waitForFunction(() => window.__t);
  ok(await p.evaluate(() => window.__t.cap()) >= 50, "live cap raised (>= 50)");
  await b.close(); console.log(pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
})();
