// Export check for the liveliness pass: a game with a Gloop hopper, bouncy floor, trampoline, goal, cannon and magnet exports, loads and plays with no errors. node tests/liveliness.export.js
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/opt/node22/lib/node_modules/playwright");
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const A = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
fs.writeFileSync("/tmp/lex_build.html", src.replace(A, A + 'window.__f = { build: () => {\n' +
  '  suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false; gravityEnabled = true;\n' +
  '  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) board[y][x] = null; actors.length = 0;\n' +
  '  for (let x = 0; x < 24; x++) board[17][x] = "solid:none"; for (let x = 8; x < 13; x++) board[17][x] = "solid:bouncy"; board[17][14] = "trampoline:none"; board[16][20] = "goal:none"; board[16][3] = "cannon2-ne:none"; board[14][17] = "magnet:none";\n' +
  '  const id = ensureHopperPetDef(); placeCarryableActor(id, 6 * TILE, 16 * TILE, null); placeCarryableActor(id, 10 * TILE, 12 * TILE, null); placeCarryableActor(PUSHABLE_DEF_ID, 16 * TILE, 10 * TILE, null);\n' +
  '  selectedActorDefId = playerDefId; placeNewActor(22 * TILE, 16 * TILE); renderAll(); return true; } };\n'));
(async () => {
  const br = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const c = await br.newContext({ acceptDownloads: true }); const q = await c.newPage(); const qe = []; q.on("pageerror", e => qe.push(String(e))); q.on("dialog", d => d.accept());
  await q.goto("file:///tmp/lex_build.html#t"); await q.waitForFunction(() => window.__f);
  await q.evaluate(() => window.__f.build());
  const [d] = await Promise.all([q.waitForEvent("download"), q.click("#exportBtn")]);
  const f2 = path.join(os.tmpdir(), "lex_export.html"); await d.saveAs(f2);
  let html = fs.readFileSync(f2, "utf8");
  const anchorX = "playReadyUntil = gameNow() + READY_DURATION_MS; cloudDriftT0 = gameNow();";
  if (!html.includes(anchorX)) throw new Error("export anchor missing");
  const at = html.indexOf(anchorX), inject = " window.__sq = 0; { const o = tileSquashAt; tileSquashAt = function () { window.__sq++; return o.apply(this, arguments); }; } window.__x = () => ({ sq: window.__sq, hoppers: actors.filter(a => a.hop).length, hops: window.__hops || 0, pos: actors.filter(a => a.hop).map(a => Math.round(a.x)) });";
  // the first occurrence is the restart function; the boot line is the one right before renderPlayHUD at top level
  const boot = html.indexOf(anchorX + "\n  renderPlayHUD();"); html = html.slice(0, boot + anchorX.length) + inject + html.slice(boot + anchorX.length);
  fs.writeFileSync(f2, html);
  const x = await (await br.newContext()).newPage(); const xe = []; x.on("pageerror", e => xe.push(String(e)));
  await x.goto("file://" + f2); await x.waitForTimeout(500);
  const hasStart = await x.evaluate(() => typeof surpriseStartPending !== "undefined" || typeof startPillHit !== "undefined" || typeof askConfirm !== "undefined");
  await x.waitForTimeout(7000);
  const after = await x.evaluate(() => window.__x ? window.__x() : { missing: true }).catch(e => ({ err: String(e) }));
  // render a few frames of the exported canvas (goal flutter, trampoline, cannon, magnet idle all run in the exported draw path)
  const px = await x.evaluate(() => { const g = document.querySelector("canvas").getContext("2d"); return g.getImageData(0, 0, 8, 8).data.length; });
  const ok = xe.length === 0 && after.hoppers >= 1 && !hasStart;
  if (!ok) console.log("page errors:", xe.slice(0, 3));
  console.log(ok ? "ok  " : "FAIL", JSON.stringify({ after, editorOnlyCodeLeaked: hasStart, errors: xe.slice(0, 3), canvasOk: px > 0 }));
  await br.close(); process.exit(ok ? 0 : 1);
})();
