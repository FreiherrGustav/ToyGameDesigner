// Every Surprise Me template opens identically whatever the seed (no mirror, no random skin/pet/hero look, no chaos), frozen at its
// starting layout. Also prints the audit: what each template places. node tests/exactdeterm.test.js [--audit]
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = `window.__d = { ids: () => SURPRISE_TEMPLATES.map(t => ({ id: t.id, cat: t.category, names: t.names })),
  build: (id, seed) => { surpriseRecent.length = 0; surpriseRecentVariants.length = 0; const r = surpriseMe(seed, { templateIds: [id] }); if (!r || r.failed || r.pending) return { err: JSON.stringify(r) };
    const room = rooms.find(q => q.id === r.roomId), cols = roomCols();
    const cells = {}; let tiles = 0, walls = 0, paint = 0;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < BOARD_MAX_COLS; x++) { const t = board[y][x]; if (t) { tiles++; if (t === "solid:none" || t === "solid:indestructible") walls++; const g = t.split(":")[0]; cells[g] = (cells[g] || 0) + 1; } if (backgroundBoard[y][x]) paint++; }
    const act = {}; actors.forEach(a => { const d = actorDefs[a.defId]; const k = a.isPlayer ? "player" : (d && d.temperament) || "?"; act[k] = (act[k] || 0) + 1; });
    const sig = JSON.stringify([board, colorBoard, groundSkinBoard, groundSkinRotationBoard, backgroundBoard, actors.map(a => [a.defId, a.spawnX, a.spawnY, a.isPlayer]), gravityEnabled, gravityDir, wrapHEnabled, wrapVEnabled, cameraMode, switchChannels, spawnerContents, JSON.stringify(Object.keys(actorDefs).filter(k => k.startsWith("sx~")).sort().map(k => actorDefs[k].art))]);
    let h = 0; for (let i = 0; i < sig.length; i++) h = (Math.imul(h, 31) + sig.charCodeAt(i)) | 0;
    return { hash: h, tiles, walls, paint, cells, act, actors: actors.length, paused: gamePaused, rules: [gravityEnabled, gravityDir, wrapHEnabled, wrapVEnabled, cameraMode], name: r.name }; } };`;
const tmp = path.join(os.tmpdir(), "exactdeterm.html"); fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK));
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p0 = await b.newPage(); await p0.goto("file://" + tmp + "#t"); await p0.waitForFunction(() => window.__d); const ids = await p0.evaluate(() => window.__d.ids()); await p0.close();
  let pass = 0, fail = 0; const audit = [];
  for (const t of ids) {
    const res = [];
    for (const seed of [10001, 20007, 31337, 4242]) {
      const p = await b.newPage(); p.on("dialog", d => d.accept()); p.on("pageerror", e => console.log("  pageerror", t.id, String(e)));
      await p.addInitScript(() => { window.requestAnimationFrame = () => 0; });
      await p.goto("file://" + tmp + "#t"); await p.waitForFunction(() => window.__d);
      res.push(await p.evaluate(([i, s]) => window.__d.build(i, s), [t.id, seed])); await p.close();
    }
    const same = res.every(r => !r.err && r.hash === res[0].hash && r.paused);
    same ? pass++ : fail++; console.log((same ? "ok   " : "FAIL ") + t.id + (same ? "" : " " + JSON.stringify(res.map(r => r.err || r.hash))));
    audit.push(Object.assign({ id: t.id, cat: t.cat }, res[0]));
  }
  fs.writeFileSync(path.join(os.tmpdir(), "surprise-audit.json"), JSON.stringify(audit));
  await b.close(); console.log("exactdeterm: " + pass + " identical, " + fail + " differ"); process.exit(fail ? 1 : 0);
})();
