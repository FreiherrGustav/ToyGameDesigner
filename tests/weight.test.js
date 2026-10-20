// v2.53 Stage 1 "weight matters" tests (not deployed). Usage: node tests/weight.test.js [shotDir]
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/opt/node22/lib/node_modules/playwright");
const src = fs.readFileSync(process.env.HTML || path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = `window.__w = (() => {
  const ev = { sounds: {}, thudMags: [], det: 0, reflect: 0 };
  for (const k of Object.keys(sounds)) { const f = sounds[k]; sounds[k] = function (m) { ev.sounds[k] = (ev.sounds[k] || 0) + 1; if (k === "thud") ev.thudMags.push(m === undefined ? -1 : +m.toFixed(2)); return f.apply(this, arguments); }; }
  { const o = detonateCarriedBombAt; detonateCarriedBombAt = function () { ev.det++; return o.apply(this, arguments); }; }
  { const o = reflectActorsApart; reflectActorsApart = function () { ev.reflect++; return o.apply(this, arguments); }; }
  let freeze = true;
  { const o = steeringAccelFor; steeringAccelFor = function () { return freeze ? { ax: 0, ay: 0 } : o.apply(this, arguments); }; }
  const ids = { wanderer: () => defaultDefIdForKind("wanderer"), crate: () => PUSHABLE_DEF_ID, stone: () => LARGE_STONE_DEF_ID, bomb: () => CARRY_BOMB2_DEF_ID, hazardball: () => HAZARD_BALL_DEF_ID, chaser: () => defaultDefIdForKind("chaser") };
  function mk(kind, px, py) { const a = placeCarryableActor(ids[kind](), px, py); a.spawnX = a.x; a.spawnY = a.y; a.kind = kind; return a; }
  let rs = 12345; Math.random = () => (rs = (rs * 1664525 + 1013904223) % 4294967296) / 4294967296;
  function room() {
    rs = 12345;
    suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false;
    gravityEnabled = true; gravityDir = "down";
    for (let x = 0; x < 24; x++) board[17][x] = "solid:none";
    for (let y = 0; y < 18; y++) { board[y][0] = "solid:none"; board[y][23] = "solid:none"; }
    actors.length = 0; ev.sounds = {}; ev.thudMags = []; ev.det = 0; ev.reflect = 0;
    for (const k in actorContactCooldown) delete actorContactCooldown[k];
  }
  const FLOOR = 17 * TILE - ACTOR_SIZE / 2 - 1;
  const snap = a => ({ k: a.kind, x: +a.x.toFixed(1), y: +a.y.toFixed(1), vx: +a.vx.toFixed(0), vy: +a.vy.toFixed(0) });
  function trace(list, frames, every) { const rows = []; for (let f = 0; f < frames; f++) { tick(1 / 60); if (f < 10 || f % every === 0) rows.push([f, list.map(a => snap(a))]); } return rows; }
  const inBounds = a => a.x >= TILE - 2 && a.x + a.w <= 23 * TILE + 2 && a.y >= -2 && a.y + a.h <= 17 * TILE + 2;
  const bad = list => list.filter(a => !inBounds(a) || actorBlockedByTiles(a)).map(snap);
  return {
    // A: a stone dropped on a stack of three crates
    stoneOnStack() {
      room(); const cs = [0, 1, 2].map(i => mk("crate", 12 * TILE + 16, FLOOR - i * ACTOR_SIZE));
      for (let i = 0; i < 20; i++) tick(1 / 60);
      const S = mk("stone", 12 * TILE + 16, FLOOR - 3 * ACTOR_SIZE - 4 * TILE); S.vy = 300;
      const before = cs.map(snap); const tr = trace([S, ...cs], 90, 30);
      return { before, S0: snap(S), tr, bad: bad([S, ...cs]), thud: ev.thudMags.slice(0, 6), sounds: ev.sounds, det: ev.det };
    },
    // B: a stone shoved (given 300 px/s, as a throw would) into a row of five crates
    stoneIntoCrates(fast) {
      room(); const cs = [0, 1, 2, 3, 4].map(i => mk("crate", (9 + i) * TILE + 16, FLOOR));
      for (let i = 0; i < 20; i++) tick(1 / 60);
      const S = mk("stone", 4 * TILE + 16, FLOOR); S.x = cs[0].x - ACTOR_SIZE - 1; S.vx = fast ? 500 : 300; S.bouncyCooldown = 400;
      const x0 = cs.map(c => c.x); const tr = trace([S, ...cs], 120, 30);
      return { tr, moved: cs.map((c, i) => +(c.x - x0[i]).toFixed(1)), bad: bad([S, ...cs]), thud: ev.thudMags.slice(0, 6), sounds: ev.sounds };
    },
    // C: a crate thrown at a row of five pets
    crateIntoPets() {
      room(); const ps = [0, 1, 2, 3, 4].map(i => mk("wanderer", (11 + i) * TILE + 16, FLOOR));
      for (let i = 0; i < 20; i++) tick(1 / 60);
      const C = mk("crate", 5 * TILE + 16, FLOOR); C.x = ps[0].x - ACTOR_SIZE - 1; C.vx = 350; C.bouncyCooldown = 400;
      const x0 = ps.map(c => c.x); const tr = trace([C, ...ps], 90, 30);
      return { tr, moved: ps.map((c, i) => +(c.x - x0[i]).toFixed(1)), bad: bad([C, ...ps]), thud: ev.thudMags.slice(0, 6), sounds: ev.sounds, silentEnemy: null };
    },
    // C2: a stone into a row of pets
    stoneIntoPets(fast) {
      room(); const ps = [0, 1, 2, 3, 4].map(i => mk("wanderer", (11 + i) * TILE + 16, FLOOR));
      for (let i = 0; i < 20; i++) tick(1 / 60);
      const S = mk("stone", 5 * TILE + 16, FLOOR); S.x = ps[0].x - ACTOR_SIZE - 1; S.vx = fast ? 500 : 350; S.bouncyCooldown = 400;
      const x0 = ps.map(c => c.x); const tr = trace([S, ...ps], 90, 30);
      return { tr, moved: ps.map((c, i) => +(c.x - x0[i]).toFixed(1)), bad: bad([S, ...ps]), thud: ev.thudMags.slice(0, 6), sounds: ev.sounds };
    },
    // C3: crate into a stone (a crate bounces off a stone)
    crateIntoStone() {
      room(); const S = mk("stone", 12 * TILE + 16, FLOOR); for (let i = 0; i < 20; i++) tick(1 / 60);
      const C = mk("crate", 6 * TILE + 16, FLOOR); C.x = S.x - ACTOR_SIZE - 1; C.vx = 350; C.bouncyCooldown = 400; const s0 = S.x;
      const tr = trace([C, S], 60, 20);
      return { tr, stoneMoved: +(S.x - s0).toFixed(1), thud: ev.thudMags.slice(0, 4) };
    },
    // D: resting stacks stay still for 30 s
    rest(n) {
      room(); const cs = []; for (let i = 0; i < n; i++) cs.push(mk("crate", 12 * TILE + 16, FLOOR - i * ACTOR_SIZE));
      for (let i = 0; i < 120; i++) tick(1 / 60);
      const p0 = cs.map(c => [c.x, c.y]); ev.reflect = 0; ev.sounds = {}; let maxV = 0, maxDrift = 0;
      for (let i = 0; i < 1800; i++) { tick(1 / 60); for (const c of cs) maxV = Math.max(maxV, Math.hypot(c.vx, c.vy)); }
      cs.forEach((c, i) => { maxDrift = Math.max(maxDrift, Math.hypot(c.x - p0[i][0], c.y - p0[i][1])); });
      return { n, maxV: +maxV.toFixed(2), maxDrift: +maxDrift.toFixed(2), reflect: ev.reflect, sounds: ev.sounds };
    },
    // F: a stone into a bomb actor does not detonate it
    stoneIntoBomb() {
      room(); const B = mk("bomb", 12 * TILE + 16, FLOOR); for (let i = 0; i < 20; i++) tick(1 / 60);
      const S = mk("stone", 6 * TILE + 16, FLOOR); S.x = B.x - ACTOR_SIZE - 1; S.vx = 400; S.bouncyCooldown = 400; ev.det = 0;
      const tr = trace([S, B], 90, 30);
      return { det: ev.det, there: actors.includes(B), armed: B.fuseTimerId != null, tr };
    },
    // E: chaos - a mixed pile with hits from everything, nothing leaves or enters a wall
    chaos(seed, opts) {
      opts = opts || {};
      room(); for (let x = 0; x < 24; x++) board[0][x] = "solid:none"; let r = seed * 9301 + 49297; const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
      const ks = opts.noBall ? ["crate", "stone", "wanderer", "chaser", "crate"] : ["crate", "stone", "wanderer", "chaser", "hazardball", "crate"]; const SPD = opts.speed || 900; const all = [];
      for (let i = 0; i < 24; i++) { const a = mk(ks[Math.floor(rnd() * ks.length)], (2 + (i % 12) * 1.6) * TILE + 16, (2 + Math.floor(i / 12) * 2.2 + rnd() * 3) * TILE); a.vx = (rnd() - 0.5) * SPD; a.vy = (rnd() - 0.5) * SPD * 0.55; a.bouncyCooldown = 500; all.push(a); }
      let out = 0, wall = 0, oneFrame = 0; freezeOff(); const run = new Map();
      for (let f = 0; f < 900; f++) { tick(1 / 60); for (const a of all) if (actors.includes(a)) {
        const v = !inBounds(a) || actorBlockedByTiles(a); const n = v ? (run.get(a) || 0) + 1 : 0; run.set(a, n);
        if (n === 1) oneFrame++; if (n > 4) { if (!inBounds(a)) out++; else wall++; } } }
      return { out, wall, oneFrame, left: all.filter(a => actors.includes(a)).length };
    },
    pile(n, seconds) {
      room(); freezeOff();
      const ks = ["crate", "crate", "wanderer", "bomb", "hazardball"];
      for (let i = 0; i < n; i++) { const a = mk(ks[i % 5], (2 + (i % 18)) * TILE + 16, (4 + Math.floor(i / 18) * 2) * TILE); a.vx = (i % 5) * 40 - 80; }
      const per = [], times = []; let c0;
      for (let s = 0; s < seconds; s++) { c0 = ev.reflect; for (let f = 0; f < 60; f++) { const t = performance.now(); tick(1 / 60); try { renderGame(); } catch (e) {} times.push(performance.now() - t); } per.push(ev.reflect - c0); }
      const avg = a => a.reduce((x, y) => x + y, 0) / a.length, p95 = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length * 0.95)];
      return { n: actors.length, per, frameMsAvg: +avg(times).toFixed(3), frameMsP95: +p95(times).toFixed(3), moving: actors.filter(a => Math.hypot(a.vx, a.vy) > 20).length };
    },
    firstSink(seed, SPD) {
      SPD = SPD || 900;
      room(); for (let x = 0; x < 24; x++) board[0][x] = "solid:none"; let r = seed * 9301 + 49297; const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
      const ks = ["crate", "stone", "wanderer", "chaser", "hazardball", "crate"]; const all = [];
      for (let i = 0; i < 24; i++) { const a = mk(ks[Math.floor(rnd() * ks.length)], (2 + (i % 12) * 1.6) * TILE + 16, (2 + Math.floor(i / 12) * 2.2 + rnd() * 3) * TILE); a.vx = (rnd() - 0.5) * SPD; a.vy = (rnd() - 0.5) * SPD * 0.55; a.bouncyCooldown = 500; all.push(a); }
      freezeOff(); let prev = all.map(snap); const run = new Map(); const hist = [];
      for (let f = 0; f < 900; f++) { tick(1 / 60); hist.push(all.map(snap)); if (hist.length > 8) hist.shift();
        for (const a of all) if (actors.includes(a)) { const v = !inBounds(a) || actorBlockedByTiles(a); const n = v ? (run.get(a) || 0) + 1 : 0; run.set(a, n);
          if (n > 4) { const i = all.indexOf(a); return { f, who: snap(a), hist: hist.map(h => h[i]), near: all.filter(o => Math.abs(o.x - a.x) < 60 && Math.abs(o.y - a.y) < 60).map(snap) }; } } }
      return null;
    },
    teleport(seed) {
      room(); for (let x = 0; x < 24; x++) board[0][x] = "solid:none"; let r = seed * 9301 + 49297; const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
      const ks = ["crate", "stone", "wanderer", "chaser", "hazardball", "crate"]; const all = [];
      for (let i = 0; i < 24; i++) { const a = mk(ks[Math.floor(rnd() * ks.length)], (2 + (i % 12) * 1.6) * TILE + 16, (2 + Math.floor(i / 12) * 2.2 + rnd() * 3) * TILE); a.vx = (rnd() - 0.5) * 900; a.vy = (rnd() - 0.5) * 500; a.bouncyCooldown = 500; all.push(a); }
      freezeOff(); let prev = all.map(a => ({ x: a.x, y: a.y, vx: a.vx, vy: a.vy }));
      for (let f = 0; f < 900; f++) {
        tick(1 / 60);
        for (let i = 0; i < all.length; i++) { const a = all[i], p = prev[i]; if (actors.includes(a) && (Math.abs(a.x - p.x) > 12 || (Math.abs(a.y - p.y) > 12 && Math.abs(p.vy) < 600 && Math.abs(a.y - p.y) > Math.abs(p.vy) / 60 + 8))) return { f, who: snap(a), was: p, near: all.filter(o => o !== a && Math.abs(o.x - p.x) < 50 && Math.abs(o.y - p.y) < 50).map(snap) }; }
        prev = all.map(a => ({ x: a.x, y: a.y, vx: a.vx, vy: a.vy }));
      }
      return null;
    },
    trace(seed) {
      room(); for (let x = 0; x < 24; x++) board[0][x] = "solid:none"; let r = seed * 9301 + 49297; const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
      const ks = ["crate", "stone", "wanderer", "chaser", "hazardball", "crate"]; const all = [];
      for (let i = 0; i < 24; i++) { const a = mk(ks[Math.floor(rnd() * ks.length)], (2 + (i % 12) * 1.6) * TILE + 16, (2 + Math.floor(i / 12) * 2.2 + rnd() * 3) * TILE); a.vx = (rnd() - 0.5) * 900; a.vy = (rnd() - 0.5) * 500; a.bouncyCooldown = 500; all.push(a); }
      freezeOff();
      const calls = []; const names = ["resolveAxis", "shovePushables", "bounceOffTrampolineObjects", "applyWorldWrap", "pushApart", "reflectActorsApart", "exchangeAlong", "recoverStrayActor", "checkActorContacts"];
      const origs = {}; const set = (n, f) => { eval(n + " = f"); };
      for (const n of names) { origs[n] = eval(n); set(n, function (...args) { const t = args.filter(x => x && typeof x === "object" && "x" in x); const before = t.map(x => [x.id, x.x, x.y]); const res = origs[n].apply(this, args); t.forEach((x, i) => { if (Math.abs(x.x - before[i][1]) > 10 || Math.abs(x.y - before[i][2]) > 10) calls.push({ fn: n, args: args.map(y => (y && typeof y === "object" && "x" in y) ? snap(y) : y), before: before[i], after: [x.x, x.y] }); }); return res; }); }
      let prev = all.map(a => [a.x, a.y]); let out = null;
      for (let f = 0; f < 900 && !out; f++) {
        calls.length = 0; tick(1 / 60);
        for (let i = 0; i < all.length; i++) { const a = all[i]; if (!actors.includes(a)) continue; if (!inBounds(a) || actorBlockedByTiles(a)) { if (Math.abs(a.x - prev[i][0]) > 10 || Math.abs(a.y - prev[i][1]) > 10) { out = { f, who: snap(a), prev: prev[i], calls: calls.filter(c => true).slice(0, 6) }; break; } } }
        prev = all.map(a => [a.x, a.y]);
      }
      for (const n of names) set(n, origs[n]);
      return out;
    },
    plowScene() { // for screenshots: a stone about to plow through a mixed pile
      room(); for (let i = 0; i < 4; i++) for (let j = 0; j <= 3 - i; j++) mk(j === 0 ? ["wanderer", "crate", "hazardball", "wanderer"][i % 4] : "crate", (12 + i) * TILE + 16, FLOOR - j * ACTOR_SIZE);
      for (let i = 0; i < 40; i++) tick(1 / 60);
      const S = mk("stone", 3 * TILE + 16, FLOOR); S.x = 8 * TILE; S.vx = 500; S.bouncyCooldown = 400; return S.id;
    },
    step(n) { for (let k = 0; k < n; k++) tick(1 / 60); try { renderGame(); } catch (e) {} },
    addPlayer() { selectedActorDefId = playerDefId; placeNewActor(2 * TILE, 17 * TILE - 20); },
    snapshotJSON() { return JSON.stringify(wrapProjectSnapshot(captureProjectSnapshot())); },
    dump() { return actors.map(a => Object.assign(snap(a), { inb: inBounds(a) })); },
    unfreeze() { freeze = false; }, freeze() { freeze = true; }
  };
  function freezeOff() { freeze = false; }
})();`;
const tmp = path.join(os.tmpdir(), "weight_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK));
const fails = []; const fail = m => { fails.push(m); console.log("FAIL:", m); };
const row = (r) => r[0] + ": " + r[1].map(a => `${a.k}(${a.x},${a.y} v${a.vx},${a.vy})`).join(" ");
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage();
  const errors = []; page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept());
  await page.goto("file://" + tmp + "#t"); await page.waitForFunction(() => window.__w);
  const show = (t, r, n = 14) => { console.log("\n== " + t); r.tr.slice(0, n).forEach(x => console.log("  " + row(x))); };
  let r = await page.evaluate(() => __w.stoneOnStack()); show("A stone dropped on a 3-crate stack", r, 12);
  console.log("  thud:", JSON.stringify(r.thud), "sounds:", JSON.stringify(r.sounds), "det:", r.det, "bad:", JSON.stringify(r.bad));
  if (r.bad.length) fail("A out of bounds/in wall"); if (r.det) fail("A detonated");
  r = await page.evaluate(() => __w.stoneIntoCrates()); show("B stone into a row of five crates", r, 14);
  console.log("  crate displacement:", JSON.stringify(r.moved), "thud:", JSON.stringify(r.thud), "bad:", JSON.stringify(r.bad));
  if (r.bad.length) fail("B bad");
  const plowedB = r.moved.filter(m => m > 4).length; console.log("  crates moved >4px:", plowedB);
  r = await page.evaluate(() => __w.stoneIntoCrates(true)); show("B2 stone at 500 px/s into five crates", r, 14);
  console.log("  crate displacement:", JSON.stringify(r.moved), "thud:", JSON.stringify(r.thud), "bad:", JSON.stringify(r.bad));
  r = await page.evaluate(() => __w.stoneIntoPets(true)); show("C4 stone at 500 px/s into five pets", r, 14);
  console.log("  pet displacement:", JSON.stringify(r.moved), "thud:", JSON.stringify(r.thud));
  r = await page.evaluate(() => __w.crateIntoPets()); show("C crate into a row of five pets", r, 14);
  console.log("  pet displacement:", JSON.stringify(r.moved), "thud:", JSON.stringify(r.thud), "sounds:", JSON.stringify(r.sounds), "bad:", JSON.stringify(r.bad));
  if (r.bad.length) fail("C bad");
  r = await page.evaluate(() => __w.stoneIntoPets()); show("C2 stone into a row of five pets", r, 14);
  console.log("  pet displacement:", JSON.stringify(r.moved), "thud:", JSON.stringify(r.thud), "bad:", JSON.stringify(r.bad));
  if (r.bad.length) fail("C2 bad");
  r = await page.evaluate(() => __w.crateIntoStone()); show("C3 crate into a stone", r, 10);
  console.log("  stone moved:", r.stoneMoved, "thud:", JSON.stringify(r.thud));
  for (const n of [3, 6]) { r = await page.evaluate(n => __w.rest(n), n); console.log("rest", n, JSON.stringify(r)); if (r.maxDrift > 0.5 || r.reflect || r.maxV > 5) fail("resting stack of " + n + " moved " + JSON.stringify(r)); }
  r = await page.evaluate(() => __w.stoneIntoBomb()); console.log("stone->bomb det:", r.det, "bombThere:", r.there, "armed:", r.armed); if (r.det || !r.there) fail("stone detonated the bomb");
  for (const [label, opts] of [["all kinds, 450px/s", {}], ["no hazard balls", { noBall: true }], ["all kinds, 250px/s", { speed: 500 }]]) {
    let o = 0, w = 0, one = 0; for (let seed = 1; seed <= 30; seed++) { r = await page.evaluate(([s, op]) => __w.chaos(s, op), [seed, opts]); o += r.out; w += r.wall; one += r.oneFrame; }
    console.log("chaos x30 (" + label + "): stuck out-of-room frames", o, "stuck in-wall frames", w, "one-off embeds", one); if (o || w) fail("chaos leaked (" + label + ") " + o + "/" + w);
  }
  let o = 0, w = 0, one = 0;
  
  r = await page.evaluate(() => __w.pile(40, 20)); console.log("pile40:", JSON.stringify(r));
  // export: a stone hitting crates and pets in a standalone game (scene built here, loaded into a clean page, exported, played)
  {
    const json = await page.evaluate(() => { __w.plowScene(); __w.addPlayer(); return __w.snapshotJSON(); });
    const f1 = path.join(os.tmpdir(), "weight_scene.json"); fs.writeFileSync(f1, json);
    const ctx = await browser.newContext({ acceptDownloads: true }); const q = await ctx.newPage(); const errs = []; q.on("pageerror", e => errs.push(String(e))); q.on("dialog", d => d.accept());
    await q.goto("file://" + path.join(__dirname, "..", "index.html") + "#t"); await q.waitForTimeout(500);
    await q.setInputFiles("#loadProjectInput", f1); await q.waitForTimeout(500);
    const [d] = await Promise.all([q.waitForEvent("download"), q.click("#exportBtn")]);
    const f2 = path.join(os.tmpdir(), "weight_export.html"); await d.saveAs(f2);
    const x = await ctx.newPage(); const xerr = []; x.on("pageerror", e => xerr.push(String(e)));
    await x.goto("file://" + f2); await x.waitForTimeout(3000);
    const txt = await x.evaluate(() => document.documentElement.outerHTML);
    console.log("export contains exchangeAlong:", txt.includes("function exchangeAlong"), "MASS table:", txt.includes("MASS_HEAVY"), "errors:", JSON.stringify(xerr));
    if (xerr.length || !txt.includes("function exchangeAlong")) fail("export problem " + xerr.join("|"));
    await ctx.close();
  }
  console.log("\npage errors:", errors.slice(0, 3)); if (errors.length) fail("page errors");
  await browser.close();
  console.log(fails.length ? "\nFAILED " + fails.length : "\nALL PASSED"); process.exit(fails.length ? 1 : 0);
})();
