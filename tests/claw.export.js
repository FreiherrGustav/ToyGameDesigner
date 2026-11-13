// Dev (not shipped): build a Surprise entry canonically, set vertical axis on Moving Platforms, save as an example and trace.
// node tests/claw.export.js <id> <out.json> [secs] [padX,padY,fromSec] [verbose]
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const [id, out, SECS = "20", PAD = "", VERB = ""] = process.argv.slice(2);
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = `window.__w = {
  build: (id, yaxis) => { surpriseRecent.length = 0; surpriseMe(10001, { templateIds: [id] }); actors.forEach(a => { if (a.defId === MOVING_PLATFORM_DEF_ID && yaxis) a.platformAxis = "y"; }); return actors.length; },
  save: () => { snapshotCurrentRoomState(); return JSON.stringify({ format: "toygamedesigner-project", version: 1, data: captureProjectSnapshot() }); },
  begin: () => { setGamePaused(false); enterPlayMode(); playReadyUntil = 0; tick(1/60); },
  step: n => { const dt = 1 / (window.__fps || 60); for (let i = 0; i < n * (window.__fps || 60) / 60; i++) tick(dt); },
  pl: () => actors.find(a => a.isPlayer),
  state: () => actors.map(a => { const d = actorDefs[a.defId] || {}; return { k: a.isPlayer ? "P" : (d.name || a.defId).slice(0, 6), x: +(a.x / 32).toFixed(1), y: +(a.y / 32).toFixed(1), id: a.id, vy: Math.round(a.vy || 0) }; }),
  tp: (x, y) => { const p = actors.find(a => a.isPlayer); p.x = x * 32 + 5; p.y = y * 32 + 5; p.vx = 0; p.vy = 0; },
  draw: () => renderGame(),
  chan: () => JSON.stringify({ sw: switchChannels, plate: plateChannelsActive }),
};`;
const tmp = path.join(os.tmpdir(), "claw_export.html"); fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK));
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); const p = await b.newPage(); p.on("dialog", d => d.accept()); p.on("pageerror", e => console.log("PAGEERROR", e));
  await p.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await p.goto("file://" + tmp + "#t"); await p.waitForFunction(() => window.__w);
  console.log("built actors:", await p.evaluate(([i, y]) => window.__w.build(i, y), [id, id === "clawmachine"]));
  fs.writeFileSync(out, await p.evaluate(() => window.__w.save()));
  await p.evaluate(f => { window.__fps = f; window.__w.begin(); }, Number(process.env.FPS || 60));
  const pad = PAD ? PAD.split(",").map(Number) : null;
  for (let t = 0; t < Number(SECS) * 2; t++) {
    if (pad && t / 2 >= pad[2]) await p.evaluate(([x, y]) => window.__w.tp(x, y), pad);
    await p.evaluate(() => window.__w.step(30));
    const st = await p.evaluate(() => window.__w.state());
    console.log((t / 2 + 0.5) + "s", st.map(a => a.k + "(" + a.x + "," + a.y + ")").join(" "), VERB ? await p.evaluate(() => window.__w.chan()) : "");
  }
  if (process.env.SHOT) { await p.evaluate(() => window.__w.draw()); await p.locator('#gameCanvas').screenshot({ path: process.env.SHOT }); }
  await b.close();
})();
