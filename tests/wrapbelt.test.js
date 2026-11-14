// Belts/wind carry things across a wrapped seam (and the old build stalls them). node tests/wrapbelt.test.js [old index.html]
const fs = require("fs"), { chromium } = require("/opt/node22/lib/node_modules/playwright");
const A = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
function copy(src, out) { fs.writeFileSync(out, fs.readFileSync(src, "utf8").replace(A, A + 'window.__ev=f=>eval("("+f+")");\n')); }
async function run(html, dir, kind) {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }), p = await b.newPage();
  const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("dialog", d => d.accept());
  await p.goto("file://" + html + "#t"); await p.waitForTimeout(300);
  const body = `() => {
      requestAnimationFrame = () => 0;
      restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT));
      initBoard(); actors = [];
      gravityEnabled = true; gravityDir = "${dir}"; wrapHEnabled = true; wrapVEnabled = false;
      cameraMode = "fixed";
      for (let x = 0; x < COLS; x++) board[15][x] = gameplayKey("solid", "wind-e");
      for (let x = 0; x < COLS; x++) board[16][x] = gameplayKey("solid", "none");
      let a; const kind = "${kind}";
      if (kind === "player") { selectedActorDefId = playerDefId; placeNewActor(20, 14); a = actors.find(x => x.isPlayer); }
      else a = placeCarryableActor(kind === "crate" ? PUSHABLE_DEF_ID : defaultDefIdForKind("wanderer"), 20, 14, null);
      a.vx = 0; startPos.x = a.x; startPos.y = a.y;
      appMode = "play"; playReadyUntil = null;
      const xs = []; let wraps = 0, last = a.x;
      for (let i = 0; i < 60 * 12; i++) { tick(1 / 60); if (Math.abs(a.x - last) > 300) wraps++; last = a.x; if (i % 60 === 0) xs.push(Math.round(a.x)); }
      return { xs, wraps, y: Math.round(a.y), grounded: a.grounded };
    }`;
  const r = await p.evaluate(src => window.__ev(src)(), body).catch(e => ({ err: String(e).slice(0, 200) }));
  await b.close(); return { r, errs };
}
(async () => {
  const old = process.argv[2]; copy("/home/user/ToyGameDesigner/index.html", "/tmp/wb_new.html"); if (old) copy(old, "/tmp/wb_old.html");
  let bad = 0;
  for (const kind of ["crate", "player"]) for (const dir of ["down"]) {
    const n = await run("/tmp/wb_new.html", dir, kind), o = old ? await run("/tmp/wb_old.html", dir, kind) : null;
    const good = n.r && !n.r.err && n.r.wraps >= 1 && n.errs.length === 0;
    console.log(good ? "ok  " : "FAIL", kind, dir, "new", JSON.stringify(n.r), n.errs[0] || "", o ? "\n      old " + JSON.stringify(o.r) : "");
    if (!good) bad++;
  }
  console.log(bad ? bad + " FAILED" : "ALL PASSED"); process.exit(bad ? 1 : 0);
})();
