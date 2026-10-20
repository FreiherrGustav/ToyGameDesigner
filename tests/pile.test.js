// v2.53 Stage 4: the pile room (not deployed). Usage: node tests/pile.test.js [seeds=100] [html=index.html] [baselineHtml]
// A spawner each dropping crates, a pet and a bomb; a stone; wrap on; a lava drain. 20 simulated seconds per seed, fresh page
// per seed, Math.random seeded. Reports events by type, distinct event types in every 10 s window, and tick time.
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/opt/node22/lib/node_modules/playwright");
const N = Number(process.argv[2] || 100), file = path.resolve(process.argv[3] || path.join(__dirname, "..", "index.html"));
const base = process.argv[4] ? path.resolve(process.argv[4]) : null;
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = require("./surprise.hook.js")() + `
  window.__p = (() => {
    const rng = s => () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    function room() {
      suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false;
      gravityEnabled = true; gravityDir = "down"; wrapHEnabled = true;
      for (let x = 0; x < 24; x++) board[17][x] = (x >= 19 && x <= 22) ? "none:lethal" : "solid:none";
      const rid = currentRoomId;
      [[3, PUSHABLE_DEF_ID], [9, CARRY_BOMB2_DEF_ID], [15, defaultDefIdForKind("wanderer")]].forEach(([x, def]) => {
        board[1][x] = SPAWNER_ORDER[2] + ":none"; spawnerContents[roomCellKey(rid, x, 1)] = def;
      });
      actorDefs[defaultDefIdForKind("wanderer")].lethal = false;
      actors.length = 0;
      const S = placeCarryableActor(LARGE_STONE_DEF_ID, 11 * TILE + 16, 17 * TILE - ACTOR_SIZE / 2 - 1); S.spawnX = S.x; S.spawnY = S.y;
      const P = placeCarryableActor(defaultDefIdForKind("wanderer"), 6 * TILE + 16, 17 * TILE - ACTOR_SIZE / 2 - 1); P.spawnX = P.x; P.spawnY = P.y;
    }
    return { run(seed) {
      Math.random = rng(seed * 7919 + 1); room(); window.__iaStart();
      const snaps = [], times = []; let err = null;
      try { for (let s = 0; s < 20; s++) { const t0 = performance.now(); window.__iaTick(60); times.push(performance.now() - t0); snaps.push(Object.assign({}, window.__ia.counts)); } } catch (e) { err = String(e); }
      const ia = window.__iaStop(); return { counts: ia.counts, snaps, ms: times.reduce((a, b) => a + b, 0) / (times.length * 60), err, actors: actors.length };
    },
    // a calm stack: 3 crates on a bomb plus a stone beside, 20 s, max per-frame movement and events
    stack() {
      suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false;
      gravityEnabled = true; gravityDir = "down"; actors.length = 0; for (let x = 0; x < 24; x++) board[17][x] = "solid:none";
      const F = 17 * TILE - ACTOR_SIZE / 2 - 1; const B = placeCarryableActor(CARRY_BOMB2_DEF_ID, 12 * TILE + 16, F); for (let i = 0; i < 20; i++) tick(1 / 60);
      let y = B.y; const all = [B];
      for (let i = 0; i < 3; i++) { y -= ACTOR_SIZE + 1; const c = placeCarryableActor(PUSHABLE_DEF_ID, 12 * TILE + 16, y); c.x = B.x; all.push(c); for (let k = 0; k < 30; k++) tick(1 / 60); }
      all.push(placeCarryableActor(LARGE_STONE_DEF_ID, 15 * TILE + 16, F)); for (let k = 0; k < 40; k++) tick(1 / 60);
      window.__iaStart(); let maxStep = 0; const prev = all.map(a => [a.x, a.y]);
      for (let f = 0; f < 1200; f++) { window.__iaTick(1); all.forEach((a, i) => { maxStep = Math.max(maxStep, Math.hypot(a.x - prev[i][0], a.y - prev[i][1])); prev[i] = [a.x, a.y]; }); }
      const ia = window.__iaStop(); return { counts: ia.counts, maxStep, alive: all.filter(a => actors.includes(a)).length };
    } };
  })();
`;
async function runFile(f, label, withStack) {
  const src = fs.readFileSync(f, "utf8"); if (!src.includes(anchor)) throw new Error("anchor missing");
  const tmp = path.join(os.tmpdir(), "pile_" + label + ".html"); fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK));
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const rows = []; let errs = 0, stack = null;
  for (let seed = 1; seed <= N; seed++) {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } }); const page = await ctx.newPage();
    page.on("dialog", d => d.accept()); let pe = null; page.on("pageerror", e => { pe = String(e); });
    try { await page.goto("file://" + tmp + "#t"); await page.waitForFunction(() => window.__p);
      const r = await page.evaluate(s => window.__p.run(s), seed); if (r.err || pe) { errs++; console.log("seed", seed, r.err || pe); } rows.push(r);
      if (withStack && seed === 1) stack = await page.evaluate(() => window.__p.stack());
    } catch (e) { errs++; console.log("seed", seed, "crash", String(e).slice(0, 150)); }
    await ctx.close();
  }
  await browser.close(); return { rows, errs, stack };
}
(async () => {
  const cur = await runFile(file, "cur", true);
  const tot = {}; cur.rows.forEach(r => Object.entries(r.counts).forEach(([k, v]) => tot[k] = (tot[k] || 0) + v));
  console.log("events by type, " + cur.rows.length + " seeds x 20 s (total, per-seed mean, seeds with >=1):");
  Object.keys(tot).sort().forEach(k => console.log("  " + k.padEnd(11), String(tot[k]).padStart(8), (tot[k] / cur.rows.length).toFixed(1).padStart(8), String(cur.rows.filter(r => r.counts[k]).length).padStart(5)));
  // distinct types in every 10 s window (start 0..10 s, 1 s steps), excluding spawn / npcHit
  const ign = new Set(["spawn", "npcHit"]); let minTypes = 99, fails = 0; const hist = {}; const NEWT = ["shove", "squash", "impactBomb", "bigHit", "chainBlast"];
  cur.rows.forEach(r => { let worst = 99; for (let s = 0; s <= 10; s++) { const a = s === 0 ? {} : r.snaps[s - 1], b = r.snaps[s + 9]; const n = Object.keys(b).filter(k => !ign.has(k) && (b[k] - (a[k] || 0)) > 0).length; worst = Math.min(worst, n); }
    hist[worst] = (hist[worst] || 0) + 1; if (worst < 3) fails++; minTypes = Math.min(minTypes, worst); });
  console.log("worst 10 s window, distinct event types per seed:", JSON.stringify(hist), "| seeds below 3:", fails);
  console.log("new-type totals:", NEWT.map(k => k + "=" + (tot[k] || 0)).join(" "));
  console.log("resting stack (20 s): events", JSON.stringify(cur.stack.counts), "max per-frame move px", cur.stack.maxStep.toFixed(4), "alive", cur.stack.alive);
  const ms = cur.rows.reduce((a, r) => a + r.ms, 0) / cur.rows.length; console.log("mean tick ms (current):", ms.toFixed(3), "| errors:", cur.errs);
  if (base) { const b = await runFile(base, "base", false); const bm = b.rows.reduce((a, r) => a + r.ms, 0) / b.rows.length; console.log("mean tick ms (baseline):", bm.toFixed(3), "ratio", (ms / bm).toFixed(2)); }
  process.exit(cur.errs ? 1 : 0);
})();
