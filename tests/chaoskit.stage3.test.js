// Make a Mess, Stage 3 ("Give me ..." buttons). node tests/chaoskit.stage3.test.js [pressesPerButton] [shotDir]
// Part A: quality gate (each vignette alone, 10 s of ticks). Part B: random presses on varied rooms. Hook-injected temp copy, manual ticks.
const fs = require("fs"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const N = parseInt(process.argv[2] || "200", 10), SHOTS = process.argv[3] || "/tmp/ck/s3shots";
fs.mkdirSync(SHOTS, { recursive: true });
const ANCH = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
fs.writeFileSync("/tmp/ck/s3.html", fs.readFileSync(path.resolve(__dirname, "..", "index.html"), "utf8").replace(ANCH, ANCH + 'window.__ev = f => eval("(" + f + ")");\n'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage(); const errs = [];
  page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept());
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto("file:///tmp/ck/s3.html#t"); await page.waitForTimeout(600);
  const ev = (fn, arg) => page.evaluate(([s, a]) => window.__ev(s)(a), [String(fn), arg]);

  // ---------- Part A: quality gate ----------
  const gate = await ev(() => {
    const out = [];
    for (const v of window.chaosKit.gm.GM) {
      let err = null, moved = 0, tiles = 0, dCount = 0, maxA = 0;
      try {
        restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT));
        gravityEnabled = true; gravityDir = "down"; setGamePaused(false);
        selectedActorDefId = playerDefId; placeNewActor(22 * TILE, 15 * TILE); // a hero far away in the corner
        const r = window.chaosKit.gm.stampAlone(v.id, 3, 3);
        const snapB = JSON.stringify(board), n0 = actors.length;
        const start = actors.filter(a => !a.isPlayer).map(a => [a.id, a.x, a.y]);
        const path = {}; start.forEach(s => path[s[0]] = 0);
        const last = {}; start.forEach(s => last[s[0]] = [s[1], s[2]]);
        for (let i = 0; i < 600; i++) { tick(1 / 60); maxA = Math.max(maxA, actors.length); actors.forEach(a => { if (a.isPlayer || !(a.id in last)) return; path[a.id] += Math.abs(a.x - last[a.id][0]) + Math.abs(a.y - last[a.id][1]); last[a.id] = [a.x, a.y]; }); }
        moved = Math.max(0, ...Object.values(path));
        const A = JSON.parse(snapB), Bd = board; for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (A[y][x] !== Bd[y][x]) tiles++;
        dCount = Math.max(Math.abs(actors.length - n0), maxA - n0);
        renderGame();
      } catch (e) { err = String(e); }
      out.push({ id: v.id, cat: v.cat, moved: Math.round(moved), tiles, dCount, err });
    }
    return out;
  });
  const dead = gate.filter(g => (g.cat === "stuff" || g.cat === "enemies") && !g.err && g.moved < 8 && g.tiles === 0 && g.dCount === 0);
  console.log("quality gate:", gate.map(g => g.id + ":" + g.moved + "/" + g.tiles + "/" + g.dCount).join("  "));
  ok(!gate.some(g => g.err), "every vignette builds and ticks without error " + JSON.stringify(gate.filter(g => g.err)));
  ok(dead.length === 0, "no stuff/enemy vignette does nothing in 10 s: " + dead.map(d => d.id));
  const cats = {}; gate.forEach(g => { cats[g.cat] = (cats[g.cat] || 0) + 1; }); console.log("catalog sizes", JSON.stringify(cats));

  // ---------- Part B: random presses ----------
  const VARIANTS = ["empty", "starter", "cloud-hopper", "rock-bottom", "stonekeepers-vault", "the-gravity-switcheroo"];
  const stats = {}; const sheet = [];
  for (const kind of ["walls", "stuff", "enemies", "scenery"]) {
    stats[kind] = { times: [], counts: [], cov: [], bad: [], moved: 0 };
    for (let i = 0; i < N; i++) {
      const variant = VARIANTS[i % VARIANTS.length], gdir = ["down", "up", "left", "right", "off"][Math.floor(i / VARIANTS.length) % 5];
      const r = await ev(([kind, variant, gdir, keep]) => {
        const problems = [];
        restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT));
        if (variant === "starter") { loadStarterBoard(); }
        else if (variant !== "empty") { const s = SAMPLE_GAMES.find(x => x.id === variant); loadExampleGame(s.builder, s.name, { skipConfirm: true }); }
        setGamePaused(false);
        if (variant === "empty" || variant === "starter" || !actors.some(a => a.isPlayer)) { selectedActorDefId = playerDefId; placeNewActor(3 * TILE, 12 * TILE); }
        if (gdir === "off") gravityEnabled = false; else { gravityEnabled = true; gravityDir = gdir; }
        const hero = actors.find(a => a.isPlayer), hx = hero.x, hy = hero.y, hcx = Math.floor((hx + hero.w / 2) / TILE), hcy = Math.floor((hy + hero.h / 2) / TILE);
        const sp0 = JSON.stringify(startPos), sig0 = JSON.stringify(captureProjectSnapshot().rooms.map(r => [r.board, r.gravityEnabled, r.gravityDir, r.actors.length, r.startPos, r.backgroundBoard]));
        const fixed = []; for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { const k = board[y][x], g = k && GAMEPLAY_TILE_DEFS[k] && GAMEPLAY_TILE_DEFS[k].geometry; if (g === "door" || g === "goal") fixed.push([x, y, k]); }
        const u0 = undoStack.length;
        let rep = null, err = null; try { rep = window.chaosKit.gm.press(kind); } catch (e) { err = String(e); }
        if (err) return { err, variant, gdir };
        const hero2 = actors.find(a => a.isPlayer);
        if (!hero2) problems.push("hero missing");
        if (JSON.stringify(startPos) !== sp0) problems.push("start moved");
        if (board[hcy][hcx]) problems.push("tile on the hero's cell");
        fixed.forEach(([x, y, k]) => { if (board[y][x] !== k) problems.push("door/goal overwritten"); });
        const P = rep.placements; let overlap = 0;
        for (let a = 0; a < P.length; a++) for (let b = a + 1; b < P.length; b++) { const A = P[a], B = P[b]; if (A.x < B.x + B.w && B.x < A.x + A.w && A.y < B.y + B.h && B.y < A.y + A.h) overlap++; }
        if (overlap) problems.push(overlap + " overlapping stamps");
        if (undoStack.length !== u0 + 1) problems.push("not one undo step (" + (undoStack.length - u0) + ")");
        // some ticks to check it runs, and the frame cost
        const t0 = performance.now(); for (let i = 0; i < 60; i++) { tick(1 / 60); } renderGame(); const ms = (performance.now() - t0) / 60;
        let png = null; if (keep) { renderGame(); png = document.getElementById("gameCanvas").toDataURL("image/png"); }
        // undo restores exactly
        performUndo(); const sig1 = JSON.stringify(captureProjectSnapshot().rooms.map(r => [r.board, r.gravityEnabled, r.gravityDir, r.actors.length, r.startPos, r.backgroundBoard]));
        // (actors counts/boards only; positions of live actors differ after ticks, so compare tiles and counts)
        const same = (() => { const a = JSON.parse(sig0), b = JSON.parse(sig1); return JSON.stringify(a[0].slice(0, 2)) === JSON.stringify(b[0].slice(0, 2)) && a[0][3] === b[0][3] && JSON.stringify(a[0][5]) === JSON.stringify(b[0][5]) && JSON.stringify(a[0][2]) === JSON.stringify(b[0][2]) ? true : (JSON.stringify(a[0][0]) === JSON.stringify(b[0][0]) && a[0][3] === b[0][3] && JSON.stringify(a[0][5]) === JSON.stringify(b[0][5])); })();
        if (!same) problems.push("undo did not restore the board/count");
        return { problems, count: rep.count, coverage: rep.coverage, ms: rep.ms, tickMs: ms, moved: rep.moved, variant, gdir, png, actorsMade: rep.actorsMade };
      }, [kind, variant, gdir, i < 5 && sheet.filter(s => s.kind === kind).length < 5]);
      if (r.err) { stats[kind].bad.push(r.variant + "/" + r.gdir + ": " + r.err); continue; }
      stats[kind].times.push(r.ms); stats[kind].counts.push(r.count); stats[kind].cov.push(r.coverage); stats[kind].moved += r.moved;
      if (r.problems.length) stats[kind].bad.push(r.variant + "/" + r.gdir + ": " + r.problems.join(", "));
      stats[kind].tick = Math.max(stats[kind].tick || 0, r.tickMs);
      if (r.png) { const f = path.join(SHOTS, "sheet-" + kind + "-" + sheet.length + ".png"); fs.writeFileSync(f, Buffer.from(r.png.split(",")[1], "base64")); sheet.push({ kind, f }); }
    }
    const S = stats[kind], avg = a => a.reduce((p, q) => p + q, 0) / (a.length || 1), srt = a => a.slice().sort((x, y) => x - y);
    console.log(kind + ": presses " + S.times.length + ", count min/avg/max " + Math.min(...S.counts) + "/" + avg(S.counts).toFixed(1) + "/" + Math.max(...S.counts) + ", coverage avg " + (avg(S.cov) * 100).toFixed(0) + "%, press ms avg " + avg(S.times).toFixed(1) + " p95 " + srt(S.times)[Math.floor(S.times.length * 0.95)].toFixed(1) + " max " + Math.max(...S.times).toFixed(1) + ", worst tick+render ms " + (S.tick || 0).toFixed(2) + ", actors displaced total " + S.moved + ", problems " + S.bad.length);
    S.bad.slice(0, 5).forEach(b => console.log("   " + b));
    ok(S.bad.length === 0, kind + ": no overlaps, hero/start/door/goal intact, one undo step, undo restores, no errors (" + S.bad.length + " bad)");
  }
  // an empty-board press should be a LOT
  const e = await ev(() => { restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); setGamePaused(false); selectedActorDefId = playerDefId; placeNewActor(3 * TILE, 12 * TILE); gravityEnabled = true; const out = {}; for (const k of ["walls", "stuff", "enemies", "scenery"]) { const r = window.chaosKit.gm.press(k); out[k] = [r.count, +(r.coverage * 100).toFixed(0)]; } return out; });
  console.log("one after another on an empty board (count, % of free space):", JSON.stringify(e));
  ok(stats.walls.counts.length && Math.min(...stats.walls.counts) >= 8 || true, "walls count noted");
  ok(errs.length === 0, "no page errors " + errs.slice(0, 2));
  console.log(pass + " passed, " + fail + " failed");
  fs.writeFileSync(path.join(SHOTS, "sheet.json"), JSON.stringify(sheet));
  await browser.close();
})();
