// Surprise Me start behavior: one-shot machines open paused with a click-to-start pill, everything else opens live. node tests/surprisestart.test.js
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/opt/node22/lib/node_modules/playwright");
const src = fs.readFileSync(process.env.HTML || path.join(__dirname, "..", "index.html"), "utf8");
const A = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const tmp = path.join(os.tmpdir(), "surprisestart_hooked.html");
fs.writeFileSync(tmp, src.replace(A, A + 'window.__ev=f=>eval("("+f+")");\n'));
let fails = 0; const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1366, height: 768 } }); p.on("dialog", d => d.accept()); const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto("file://" + tmp + "#t");
  const ev = (f, a) => p.evaluate(([f, a]) => window.__ev(f)(a), [f.toString(), a]);
  const ONE = ["magnetmile", "stonedomino", "mousetrap", "cannonballrun", "crateescape"];
  const LIVE = ["popcorn", "plinko", "lavalamp", "minilevel1", "cannoncat", "trafficjam"];
  for (const id of ONE) {
    const r = await ev((id) => { surpriseMe(1, { templateId: id, full: "new" }); return { paused: gamePaused, pending: surpriseStartPending, log: document.getElementById("log").textContent }; }, id);
    ok(r.paused && r.pending, id + " opens paused with the Start pill pending");
    if (id === "magnetmile") ok(/Click Start|press P/.test(r.log), "log line tells how to start (" + r.log.slice(-60) + ")");
  }
  for (const id of LIVE) {
    const r = await ev((id) => { surpriseMe(1, { templateId: id, full: "new" }); return { paused: gamePaused, pending: surpriseStartPending, log: document.getElementById("log").textContent }; }, id);
    ok(!r.paused && !r.pending, id + " opens live");
    if (id === "popcorn") ok(/running/.test(r.log), "live log line says it is running (" + r.log.slice(-40) + ")");
  }
  // a live press after a one-shot unpauses
  await ev(() => { surpriseMe(1, { templateId: "magnetmile", full: "new" }); });
  await ev(() => { surpriseMe(2, { templateId: "popcorn", full: "new" }); });
  ok(!(await ev(() => gamePaused)), "a live surprise after a paused one runs");
  // click the pill with the real mouse
  await ev(() => { surpriseMe(3, { templateId: "stonedomino", full: "new" }); });
  await p.waitForTimeout(300);
  const pos = await ev(() => { const r = startPillRect, c = gameCanvas.getBoundingClientRect(), s = (c.width - 2 * canvasBorderPx) / gameCanvas.width; return { x: c.left + canvasBorderPx + (r.x + r.w / 2) * s, y: c.top + canvasBorderPx + (r.y + r.h / 2) * s, cells: board.flat().filter(Boolean).length }; });
  await p.mouse.click(pos.x, pos.y);
  const after = await ev(() => ({ paused: gamePaused, pending: surpriseStartPending, cells: board.flat().filter(Boolean).length }));
  ok(!after.paused && !after.pending, "clicking the pill starts it");
  ok(after.cells === pos.cells, "the pill click painted nothing");
  // P also starts one
  await ev(() => { surpriseMe(4, { templateId: "mousetrap", full: "new" }); });
  await p.keyboard.press("p");
  ok(!(await ev(() => gamePaused)), "P starts it");
  // the pill is drawn (gold pixels near the bottom centre)
  await ev(() => { surpriseMe(5, { templateId: "cannonballrun", full: "new" }); });
  await p.waitForTimeout(200);
  const gold = await ev(() => { const g = gameCanvas.getContext("2d"), r = startPillRect, d = g.getImageData(r.x, r.y, r.w, r.h).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 170 && d[i + 2] < 120) n++; return n; });
  ok(gold > 200, "the pill is drawn (" + gold + " gold px)");
  ok(errs.length === 0, "no page errors " + errs.slice(0, 2));
  await b.close(); console.log(fails ? "FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);
})();
