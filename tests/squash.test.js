// v2.53 Stage 2 "squash works both ways" tests (not deployed). Usage: node tests/squash.test.js [shotDir]
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/opt/node22/lib/node_modules/playwright");
const src = fs.readFileSync(process.env.HTML || path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const SHOTS = process.argv[2];
const HOOK = `window.__s = (() => {
  const ev = { sounds: {}, logs: [], squash: 0 };
  for (const k of Object.keys(sounds)) { const f = sounds[k]; sounds[k] = function () { ev.sounds[k] = (ev.sounds[k] || 0) + 1; return f.apply(this, arguments); }; }
  { const o = log; log = function (m) { ev.logs.push(String(m)); return o.apply(this, arguments); }; }
  { const o = squashNpc; squashNpc = function (t) { ev.squash++; (ev.sqlog = ev.sqlog || []).push([gameNow(), t.kind, Math.round(t.x), Math.round(t.y), t.squashImmuneUntil]); return o.apply(this, arguments); }; }
  { const o = triggerHazard; triggerHazard = function () { const r = o.apply(this, arguments); if (r) ev.hazard = (ev.hazard || 0) + 1; return r; }; }
  let freeze = true; { const o = steeringAccelFor; steeringAccelFor = function () { return freeze ? { ax: 0, ay: 0 } : o.apply(this, arguments); }; }
  const ids = { wanderer: () => defaultDefIdForKind("wanderer"), chaser: () => defaultDefIdForKind("chaser"), fleer: () => defaultDefIdForKind("fleer"), stationary: () => defaultDefIdForKind("stationary"), crate: () => PUSHABLE_DEF_ID, stone: () => LARGE_STONE_DEF_ID, bomb: () => CARRY_BOMB2_DEF_ID, collectible: () => "colGem" };
  function mk(kind, px, py) { const a = placeCarryableActor(ids[kind](), px, py); a.spawnX = a.x; a.spawnY = a.y; a.kind = kind; return a; }
  const FLOOR = 17 * TILE - ACTOR_SIZE / 2 - 1;
  function room(play) {
    suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false;
    gravityEnabled = true; gravityDir = "down";
    for (let x = 0; x < 24; x++) board[17][x] = "solid:none";
    for (let y = 0; y < 18; y++) { board[y][0] = "solid:none"; board[y][23] = "solid:none"; }
    for (let x = 0; x < 24; x++) board[0][x] = "solid:none";
    actors.length = 0; ev.sounds = {}; ev.logs = []; ev.squash = 0; ev.hazard = 0; freeze = true;
    for (const k in actorContactCooldown) delete actorContactCooldown[k];
  }
  const snap = a => ({ x: +a.x.toFixed(1), y: +a.y.toFixed(1), sq: !!a.squashed, here: actors.includes(a) });
  const wait = ms => { advanceGameClock(ms / 1000); };
  const step = n => { for (let i = 0; i < n; i++) tick(1 / 60); };
  return {
    // drop a crate/stone from N tiles above a target standing on the floor at col 12; the target was placed with its own start 3 cols left (so a squash is visible as a move)
    drop(crusher, target, tiles, opts) {
      opts = opts || {}; room();
      const T = mk(target, 12 * TILE + 16, FLOOR); T.spawnX = 5 * TILE; T.spawnY = T.y; step(5);
      const C = mk(crusher, 12 * TILE + 16, FLOOR - ACTOR_SIZE - tiles * TILE); C.x = T.x;
      if (opts.spawnerKey) T.spawnerKey = "5,5"; if (opts.safe) C.safeUntil = gameNow() + 2000;
      let n = 0; while (!ev.squash && n++ < 200) step(1); const mid = { sq: T.squashed, ev: ev.squash }; step(40);
      wait(400); step(10);
      return { squashed: ev.squash, mid, T: snap(T), home: { x: T.spawnX, y: T.spawnY }, logs: [...new Set(ev.logs)], splat: ev.sounds.splat || 0, cThere: actors.includes(C) };
    },
    // resting crate on top of an NPC (placed overlapping at rest): nothing may happen
    rest() {
      room(); const T = mk("wanderer", 12 * TILE + 16, FLOOR); step(5);
      const C = mk("crate", 12 * TILE + 16, FLOOR - 24); C.x = T.x; step(240);
      return { squashed: ev.squash, T: snap(T) };
    },
    // cooldown: after a squash and the send-home, a second hit right away does nothing; later it works
    cooldown() {
      room(); const T = mk("wanderer", 12 * TILE + 16, FLOOR); T.spawnX = 12 * TILE + 16 - 11; T.spawnY = T.y; step(5); // home = where it already stands
      const C = mk("crate", 12 * TILE + 16, FLOOR - ACTOR_SIZE - 4 * TILE); C.x = T.x; let n = 0; while (!ev.squash && n++ < 200) step(1); wait(300); step(1);
      const first = ev.squash; C.x = 60; C.y = FLOOR - 200; C.vx = 0; C.vy = 0;
      const C2 = mk("crate", T.x + 11, FLOOR - ACTOR_SIZE - 4 * TILE); C2.x = T.x; C2.y = T.y - 120; C2.vy = 600; for (const k in actorContactCooldown) delete actorContactCooldown[k]; step(40);
      const second = ev.squash; C2.x = 60; C2.y = FLOOR - 400; C2.vy = 0; window.__dbg = { imm: T.squashImmuneUntil, now: gameNow(), sq: T.squashed };
      wait(1000);
      const C3 = mk("crate", T.x + 11, FLOOR); C3.x = T.x; C3.y = T.y - 120; C3.vy = 600; for (const k in actorContactCooldown) delete actorContactCooldown[k]; step(40);
      return { first, second, third: ev.squash, dbg: window.__dbg, sqlog: ev.sqlog };
    },
    // player holding a crate directly above/at their head: no crush
    held() {
      room(); const P = (selectedActorDefId = playerDefId, placeNewActor(12 * TILE, FLOOR), actors.find(a => a.isPlayer)); step(5);
      const C = mk("crate", P.x + 11, P.y - 30); attachCarryable(P, C); step(120);
      return { hazard: ev.hazard || 0, squash: ev.squash };
    },
    // thrown crate squashes an NPC: player throws from height
    throwCrate() {
      room(); const T = mk("wanderer", 16 * TILE + 16, FLOOR); T.spawnX = 3 * TILE; T.spawnY = T.y; step(5);
      const C = mk("crate", 16 * TILE, 4 * TILE); C.x = T.x - 5; C.vx = 0; C.vy = 0; C.bouncyCooldown = 0; C.safeUntil = gameNow() + 2000; step(200); wait(400); step(5);
      return { squash: ev.squash, T: snap(T) };
    },
    // pause during the animation: nothing advances until resume
    pauseStart() {
      room(); const T = mk("wanderer", 12 * TILE + 16, FLOOR); T.spawnX = 5 * TILE; T.spawnY = T.y; step(5); window.__T = T;
      const C = mk("crate", 12 * TILE + 16, 0); C.x = T.x; C.y = T.y - 150; C.vy = 700; let n = 0; while (!ev.squash && n++ < 60) step(1);
      gamePaused = true; return { sq: T.squashed, x: T.x };
    },
    pauseCheck() { const T = window.__T; return { sq: T.squashed, x: T.x, y: T.y }; },
    pauseResume() { gamePaused = false; },
    reduced() {
      room(); window.matchMedia = q => ({ matches: /reduce/.test(q), addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      const T = mk("wanderer", 12 * TILE + 16, FLOOR); T.spawnX = 5 * TILE; T.spawnY = T.y; step(5);
      let rec = 0; const o = playRecipe; playRecipe = function (e, n) { if (n === "squashFlat") rec++; return o.apply(this, arguments); };
      const C = mk("crate", 12 * TILE + 16, 0); C.x = T.x; C.y = T.y - 150; C.vy = 700; step(40); step(5); const sq = ev.squash; playRecipe = o;
      return { squashRecipePlayed: rec, squash: sq, sentHome: Math.abs(T.x - T.spawnX) < 2 };
    },
    state() { return { tr: actors.map(a => ({ k: a.kind, x: +a.x.toFixed(0), y: +a.y.toFixed(0), sq: a.squashed })) }; },
    step, render() { try { renderGame(); } catch (e) {} }, scene(c, t, tiles) { room(); const T = mk(t, 12 * TILE + 16, FLOOR); T.spawnX = 5 * TILE; T.spawnY = T.y; step(5); const C = mk(c, 12 * TILE + 16, FLOOR - ACTOR_SIZE - tiles * TILE); C.x = T.x; },
    ev: () => ev
  };
})();`;
const tmp = path.join(os.tmpdir(), "squash_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK));
const fails = []; const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fails.push(m); };
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const errors = [];
  const fresh = async () => { const page = await browser.newPage(); page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept()); await page.goto("file://" + tmp + "#t"); await page.waitForFunction(() => window.__s); return page; };
  const page = await fresh();
  // drops: crusher x target x height
  console.log("\ncrate/stone dropped from N tiles above (squashed? sent home?)");
  for (const crusher of ["crate", "stone"]) for (const target of ["wanderer", "chaser", "fleer", "stationary"]) {
    const row = [];
    for (const tiles of [1, 2, 4]) {
      const r = await page.evaluate(([c, t, n]) => __s.drop(c, t, n), [crusher, target, tiles]);
      row.push(`${tiles}t:${r.squashed ? "SQUASH" : "none"}`);
      if (tiles === 1) ok(r.squashed === 0, `${crusher} from 1 tile on ${target}: no squash`);
      else {
        ok(r.squashed === 1 && r.mid.sq === true, `${crusher} from ${tiles} tiles on ${target}: squashed (frozen mid-animation)`);
        ok(Math.abs(r.T.x - r.home.x) < 3 && r.T.here && !r.T.sq, `  ... and sent to its own start, not destroyed (${r.T.x} vs ${r.home.x})`);
        ok(r.splat >= 1 && r.logs.includes("Squashed!"), `  ... splat + log`);
      }
    }
    console.log("   ", crusher, "on", target, row.join("  "));
  }
  // spawner-made despawns, placed does not
  let r = await page.evaluate(() => __s.drop("crate", "wanderer", 4, { spawnerKey: true }));
  ok(r.squashed === 1 && r.T.here === false, "spawner-made NPC despawns (removed from actors) instead of going home");
  r = await page.evaluate(() => __s.drop("crate", "wanderer", 4, { safe: true }));
  ok(r.squashed === 1, "a crate the player just dropped/threw (safeUntil) DOES squash an NPC");
  r = await page.evaluate(() => __s.drop("bomb", "wanderer", 4));
  ok(r.squashed === 0, "a falling bomb never squashes");
  r = await page.evaluate(() => __s.drop("crate", "collectible", 4)); ok(r.squashed === 0, "collectibles are not squashed");
  r = await page.evaluate(() => __s.rest()); ok(r.squashed === 0 && r.T.here, "resting crate on an NPC does nothing");
  r = await page.evaluate(() => __s.cooldown()); console.log("cooldown", JSON.stringify(r));
  ok(r.first === 1 && r.second === 1 && r.third === 2, "cooldown: an immediate second hit does nothing, a later one works");
  r = await page.evaluate(() => __s.held()); ok(r.hazard === 0, "a held crate does not crush the player " + JSON.stringify(r));
  r = await page.evaluate(() => __s.throwCrate()); console.log("throw", JSON.stringify(r)); ok(r.squash === 1, "a thrown crate (player-handled) squashes an NPC");
  r = await page.evaluate(() => __s.pauseStart()); await page.waitForTimeout(700); const dur = await page.evaluate(() => __s.pauseCheck());
  console.log("pause", JSON.stringify(r), JSON.stringify(dur));
  ok(r.sq && dur.sq && Math.abs(dur.x - r.x) < 0.01, "Pause during the animation (0.7 s real time): still flattened, nothing moves");
  await page.evaluate(() => __s.pauseResume()); await page.waitForTimeout(700); const aft = await page.evaluate(() => __s.pauseCheck());
  ok(!aft.sq && Math.abs(aft.x - 5 * 32) < 3, "... and after resume it finishes and is sent home");
  const p2 = await fresh(); r = await p2.evaluate(() => __s.reduced()); console.log("reduced", JSON.stringify(r));
  ok(r.squash === 1 && r.squashRecipePlayed === 0 && r.sentHome, "reduced-motion: no flatten animation, still sent home"); await p2.close();
  if (SHOTS) {
    const pg = await fresh(); await pg.setViewportSize({ width: 1100, height: 780 });
    await pg.evaluate(() => { __s.scene("stone", "chaser", 4); });
    for (const [i, n] of [[0, 0], [1, 14], [2, 3]]) { await pg.evaluate(n => { __s.step(n); __s.render(); }, n); await pg.locator("#gameCanvas").screenshot({ path: path.join(SHOTS, "squash" + i + ".png") }); }
    await pg.close();
  }
  ok(errors.length === 0, "no page errors " + errors.slice(0, 2));
  await browser.close();
  console.log(fails.length ? "\nFAILED " + fails.length + "\n" + fails.join("\n") : "\nALL PASSED"); process.exit(fails.length ? 1 : 0);
})();
