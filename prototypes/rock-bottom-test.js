// "Rock Bottom" Stage A prototype (throwaway, not deployed). Usage: node prototypes/rock-bottom-test.js
// Observes what the engine actually does for a Boulder-Dash-shaped cave: digging, support, crush, plates,
// lava, camera, timing, softlocks. Injects a hook into a temp copy of index.html (the repo file stays clean),
// disables requestAnimationFrame and drives tick(1/60) by hand so every number is deterministic.
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/opt/node22/lib/node_modules/playwright");
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = `window.__ev=f=>eval("("+f+")");window.__hz=0;window.__lz=0;
{const l=triggerLethalHazard;triggerLethalHazard=function(){window.__lz++;return l.apply(this,arguments);};}
{const o=triggerHazard;triggerHazard=function(){const r=o.apply(this,arguments);if(r)window.__hz++;return r;};}`;
const tmp = path.join(os.tmpdir(), "rb_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK));
const out = {};
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage();
  const errors = []; page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept());
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto("file://" + tmp); await page.waitForFunction(() => window.__ev);
  const run = async (name, fn) => { out[name] = await page.evaluate(s => window.__ev(s)(), fn.toString()); console.log("\n== " + name + "\n" + JSON.stringify(out[name], null, 1)); };

  // shared helpers, installed once inside the app's scope
  await page.evaluate(() => window.__ev(`()=>{
    window.H={
      reset(){suppressHistory=true;restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT));suppressHistory=false;gravityEnabled=true;wrapHEnabled=false;wrapVEnabled=false;cameraMode="fixed";window.__hz=0;window.__lz=0;
        for(let k in keys)keys[k]=false;
        for(let x=0;x<24;x++){board[17][x]="solid:none";}},
      paint(x,y,k){board[y][x]=k;},
      dirt(x,y){board[y][x]="solid:diggable";},
      rock(x,y){board[y][x]="solid:none";},
      put(def,gx,gy){selectedActorDefId=def;paintMode="actor";return placeNewActor(gx*TILE+16,gy*TILE+16);},
      player(gx,gy){selectedActorDefId=playerDefId;paintMode="actor";return placeNewActor(gx*TILE+16,gy*TILE+16);},
      tk(n){for(let i=0;i<n;i++)tick(1/60);},
      key(k,v){keys[k]=v;},
      P(){return actors.find(a=>a.isPlayer);}
    };}`)());
  const A = "HEADER";

  await run("Q1_digging", () => {
    const r = {};
    const trial = (label, setup, hold, ticks) => {
      H.reset(); setup(); const p = H.P();
      H.tk(30); hold.forEach(k => H.key(k, true));
      let tDone = null; const x0 = p.x, y0 = p.y;
      for (let i = 0; i < ticks; i++) { H.tk(1); if (tDone === null && setup.check()) tDone = +((i + 1) / 60).toFixed(3); }
      hold.forEach(k => H.key(k, false));
      r[label] = { dugAtS: tDone, moved: [Math.round(p.x - x0), Math.round(p.y - y0)] };
    };
    // A) stand on dirt, hold Down
    let s = () => { for (let x = 3; x <= 8; x++) H.rock(x, 16); H.dirt(5, 16); H.player(5, 15); }; s.check = () => board[16][5] === null; trial("down_standing_on_dirt", s, ["ArrowDown"], 90);
    // B) dirt beside, hold Right only / Right+Down / Down only
    s = () => { for (let x = 3; x <= 8; x++) H.rock(x, 16); H.dirt(6, 15); H.player(5, 15); }; s.check = () => board[15][6] === null;
    trial("side_right_only", s, ["ArrowRight"], 90);
    trial("side_right_plus_down", s, ["ArrowRight", "ArrowDown"], 90);
    trial("side_down_only_not_pressing_in", s, ["ArrowDown"], 90);
    // C) dirt ceiling above a 1-tile cavity: hold Up+Down (jump into it)
    s = () => { for (let x = 3; x <= 8; x++) { H.rock(x, 16); H.rock(x, 13); } H.dirt(5, 14); H.player(5, 15); }; s.check = () => board[14][5] === null;
    trial("up_into_ceiling_up_plus_down", s, ["ArrowUp", "ArrowDown"], 240);
    trial("up_into_ceiling_up_only", s, ["ArrowUp"], 240);
    // D) dig a 3-deep shaft straight down (bedrock walls), hold Down only
    H.reset(); for (let y = 12; y <= 16; y++) { H.rock(4, y); H.rock(6, y); } H.rock(5, 17); H.dirt(5, 13); H.dirt(5, 14); H.dirt(5, 15); H.dirt(5, 16);
    const p = H.P() || H.player(5, 12); H.tk(20); H.key("ArrowDown", true);
    const times = []; let n = 0;
    for (let i = 0; i < 420; i++) { H.tk(1); const dug = [13, 14, 15, 16].filter(y => board[y][5] === null).length; if (dug > n) { n = dug; times.push(+((i + 1) / 60).toFixed(2)); } }
    H.key("ArrowDown", false); r.shaft_down_hold_down = { tilesDugAtS: times, playerY: Math.round(p.y), grounded: p.grounded };
    r.DIG_DURATION_MS = DIG_DURATION_MS;
    return r;
  });

  await run("Q2_support_and_cascade", () => {
    const r = {};
    // crate on a dirt tile, dug from the side: Right+Down held the whole time / released at the crumble
    const side = (label, release) => {
      H.reset(); for (let x = 2; x <= 9; x++) H.rock(x, 16); H.dirt(6, 15); const c = H.put(PUSHABLE_DEF_ID, 6, 14); const p = H.player(5, 15); H.tk(40);
      const y0 = c.y; H.key("ArrowRight", true); H.key("ArrowDown", true);
      let tDug = null, tFall = null, tLand = null, hz0 = window.__hz;
      for (let i = 0; i < 300; i++) {
        H.tk(1);
        if (tDug === null && board[15][6] === null) { tDug = i; if (release) { H.key("ArrowRight", false); H.key("ArrowDown", false); } }
        if (tDug !== null && tFall === null && c.y > y0 + 0.5) tFall = i;
        if (tFall !== null && tLand === null && c.vy === 0 && c.grounded) tLand = i;
      }
      r[label] = { dugTick: tDug, fallStartsTicksAfterDug: tFall === null ? null : tFall - tDug, landTicksAfterDug: tLand === null ? null : tLand - tDug, crateY0: Math.round(y0), crateYEnd: Math.round(c.y), playerX: Math.round(p.x), hazardHits: window.__hz - hz0 };
      H.key("ArrowRight", false); H.key("ArrowDown", false);
    };
    side("dig_from_side_hold_through", false);
    side("dig_from_side_release_at_crumble", true);
    // cascade: 3 crates stacked on a dirt tile
    H.reset(); for (let x = 2; x <= 9; x++) H.rock(x, 16); H.dirt(6, 15); const cs = [14, 13, 12].map(y => H.put(PUSHABLE_DEF_ID, 6, y)); H.player(3, 15); H.tk(30);
    const before = cs.map(c => Math.round(c.y)); H.paint(6, 15, null); const land = [];
    for (let i = 0; i < 240; i++) { H.tk(1); cs.forEach((c, k) => { if (land[k] === undefined && c.grounded && c.vy === 0 && i > 3) land[k] = i; }); }
    r.cascade_3_crates = { before, after: cs.map(c => Math.round(c.y)), landTicks: land, stackedOnFloor: cs.map(c => Math.round(c.y)).join(",") };
    // large stone on dirt
    H.reset(); for (let x = 2; x <= 9; x++) H.rock(x, 16); H.dirt(6, 15); const ls = H.put(LARGE_STONE_DEF_ID, 6, 14); H.tk(30); const y1 = ls.y; H.paint(6, 15, null); H.tk(60);
    r.large_stone_on_dirt = { fell: ls.y > y1 + 5, yBefore: Math.round(y1), yAfter: Math.round(ls.y) };
    // dig UP under a boulder: player in a cavity, jump-digging the dirt ceiling that carries a crate
    H.reset(); for (let x = 3; x <= 8; x++) { H.rock(x, 16); } H.dirt(5, 14); const c3 = H.put(PUSHABLE_DEF_ID, 5, 13); H.rock(4, 14); H.rock(6, 14); H.rock(4, 13); H.rock(6, 13);
    const p3 = H.player(5, 15); H.tk(30); const hz1 = window.__hz; H.key("ArrowUp", true); H.key("ArrowDown", true);
    let dugAt = null; for (let i = 0; i < 400; i++) { H.tk(1); if (dugAt === null && board[14][5] === null) dugAt = i; }
    H.key("ArrowUp", false); H.key("ArrowDown", false);
    r.dig_up_under_boulder = { dugTick: dugAt, hazardHits: window.__hz - hz1, crateY: Math.round(c3.y), playerY: Math.round(p3.y) };
    return r;
  });

  await run("Q3_crush", () => {
    const r = {};
    const drop = (label, def, gapPx) => {
      H.reset(); for (let x = 2; x <= 9; x++) H.rock(x, 16);
      const p = H.player(6, 15); H.tk(40); const c = H.put(def, 6, 8);
      c.x = p.x + (p.w - c.w) / 2; c.y = p.y - c.h - gapPx; c.vy = 0; c.vx = 0; c.spawnerKey = null;
      const hz0 = window.__hz; let maxVy = 0; const px = p.x;
      for (let i = 0; i < 120; i++) { H.tk(1); maxVy = Math.max(maxVy, c.vy); }
      r[label] = { hazardHits: window.__hz - hz0, maxVy: Math.round(maxVy), crateRestsOn: c.y > p.y ? "below?" : "on top of / beside player", playerMoved: Math.round(p.x - px) };
    };
    [4, 10, 16, 32, 64, 128].forEach(g => drop("crate_gap_" + g + "px", PUSHABLE_DEF_ID, g));
    [16, 64].forEach(g => drop("large_stone_gap_" + g + "px", LARGE_STONE_DEF_ID, g));
    // walking into a resting boulder / standing on it: no crush
    H.reset(); for (let x = 2; x <= 9; x++) H.rock(x, 16); const rc = H.put(PUSHABLE_DEF_ID, 6, 15); const pw = H.player(3, 15); H.tk(30); H.key("ArrowRight", true); H.tk(90); H.key("ArrowRight", false);
    r.walk_into_resting_crate = { hazardHits: window.__hz, crateMovedPx: Math.round(rc.x - (6 * TILE + 5)) };
    // chaser under a falling crate
    H.reset(); for (let x = 2; x <= 9; x++) H.rock(x, 16); const ch = H.put(findDefaultActorDef("chaser"), 7, 15); ch.vx = 0; const c2 = H.put(PUSHABLE_DEF_ID, 7, 9); c2.x = ch.x; c2.y = ch.y - 120; H.player(2, 15);
    H.tk(120); r.chaser_under_falling_crate = { chaserStillThere: actors.includes(ch), chaserDestroyed: !!ch.destroyed, crateY: Math.round(c2.y), chaserY: Math.round(ch.y), hazardHitsOnPlayer: window.__hz };
    // gem under a falling crate
    H.reset(); for (let x = 2; x <= 9; x++) H.rock(x, 16); const gem = H.put("colGem", 7, 15); const c3 = H.put(PUSHABLE_DEF_ID, 7, 9); c3.x = gem.x; c3.y = gem.y - 140; H.player(2, 15);
    const gx0 = gem.x, gy0 = gem.y; H.tk(180);
    r.gem_under_falling_crate = { gemStillThere: actors.includes(gem), gemMoved: [Math.round(gem.x - gx0), Math.round(gem.y - gy0)], crateX: Math.round(c3.x - gx0), crateY: Math.round(c3.y), crateRests: c3.grounded };
    // gem sitting on a crate-sized pile / crate resting ON a gem cell next to player pickup
    r.collectibleCountAfter = countCollectibles();
    return r;
  });

  await run("Q4_plates", () => {
    const r = {};
    for (const [label, def] of [["crate", PUSHABLE_DEF_ID], ["large_stone", LARGE_STONE_DEF_ID]]) {
      H.reset(); for (let x = 2; x <= 12; x++) H.rock(x, 16);
      H.paint(6, 15, "plate:none"); colorBoard[15][6] = "red";
      H.paint(10, 15, "barrier-n:none"); colorBoard[15][10] = "red"; H.paint(10, 14, "barrier-n:none"); colorBoard[14][10] = "red";
      const p = H.player(2, 15); H.tk(10); const before = { plate: !!plateChannelsActive.red, gateBlocks: isCellBlocking(10, 15, p) };
      const c = H.put(def, 6, 9); H.tk(120);
      const during = { plate: !!plateChannelsActive.red, gateBlocks: isCellBlocking(10, 15, p), crateY: Math.round(c.y), crateRestsOnPlateCell: c.grounded };
      H.tk(300); const later = { plate: !!plateChannelsActive.red, gateBlocks: isCellBlocking(10, 15, p) };
      c.x += 200; H.tk(5); const removed = { plate: !!plateChannelsActive.red, gateBlocks: isCellBlocking(10, 15, p) };
      r[label] = { before, during, after5s: later, afterBoulderRemoved: removed };
    }
    return r;
  });

  await run("Q5_lava", () => {
    const r = {};
    const gap = (label, build) => { H.reset(); for (let x = 2; x <= 12; x++) H.rock(x, 16); for (let x = 7; x <= 8; x++) board[16][x] = "none:lethal"; build(); };
    // A) one large stone in a 1-deep, 2-wide lava gap (floor row 17): rests where? can the player walk across?
    gap("", () => {});
    for (let x = 7; x <= 8; x++) board[17][x] = "solid:none";
    const s1 = H.put(LARGE_STONE_DEF_ID, 7, 12); const crate = H.put(PUSHABLE_DEF_ID, 8, 12); const p = H.player(5, 15); H.tk(150);
    r.stone_in_gap = { stoneY: Math.round(s1.y), stoneGrounded: s1.grounded, stoneAlive: actors.includes(s1) && !s1.destroyed, groundRowTopY: 16 * TILE, stoneTopY: Math.round(s1.y), overlapsLavaRowBy: Math.round((s1.y + s1.h) - 16 * TILE) };
    r.crate_in_lava = { crateDestroyed: !actors.includes(crate) || !!crate.destroyed };
    // walk the player across (hold right from col 5)
    window.__lz = 0; H.key("ArrowRight", true); let died = false, maxX = p.x; for (let i = 0; i < 200; i++) { H.tk(1); maxX = Math.max(maxX, p.x); }
    H.key("ArrowRight", false);
    r.walk_across_one_stone = { lethalHits: window.__lz, playerX: Math.round(p.x), reachedFarSide: p.x > 9 * TILE };
    // B) two stones stacked in the same cell
    gap("", () => {}); for (let x = 7; x <= 8; x++) board[17][x] = "solid:none";
    const a = H.put(LARGE_STONE_DEF_ID, 7, 12); const b = H.put(LARGE_STONE_DEF_ID, 7, 10); H.tk(150);
    const s2 = H.put(LARGE_STONE_DEF_ID, 8, 12); const s3 = H.put(LARGE_STONE_DEF_ID, 8, 10); H.tk(150);
    const p2 = H.player(5, 15); H.tk(10); H.key("ArrowRight", true); for (let i = 0; i < 40; i++) { H.tk(1); } 
    r.two_stacked = { stoneTopY: [Math.round(b.y), Math.round(s3.y)], aboveGroundBy: Math.round(16 * TILE - b.y) };
    // player jump+hold right toward far side
    let attempts = [];
    for (let t = 0; t < 3; t++) { H.tk(10); H.key("ArrowUp", true); H.tk(8); H.key("ArrowUp", false); H.tk(60); }
    H.key("ArrowRight", false);
    r.walk_across_two_stacked = { lethalHits: window.__lz, playerX: Math.round(p2.x), reachedFarSide: p2.x > 9 * TILE };
    // C) how does the player die: lethal check is AABB overlap?
    H.reset(); for (let x = 2; x <= 12; x++) H.rock(x, 16); board[16][7] = "none:lethal"; H.rock(7, 17);
    const p3 = H.player(7, 14); H.tk(60); r.fall_into_lava = { lethalHits: window.__lz, playerY: Math.round(p3.y) };
    return r;
  });

  await run("Q6_camera", () => {
    const r = { ROWS, COLS, TILE, BOARD_MAX_COLS, cameraYExists: typeof cameraY !== "undefined" };
    H.reset(); cameraMode = "follow"; cameraFollowSnapNeeded = true; const p = H.player(40, 5); p.x = 60 * TILE; p.y = 5 * TILE;
    // follow only scrolls horizontally: take the camera after the player teleports, and check any y offset in the render path
    cameraMode = "follow"; H.tk(60); r.cameraXAfter = Math.round(cameraX); r.roomCols = roomCols();
    return r;
  });

  await run("Q7_timing", () => {
    const r = { GRAVITY, MAX_FALL, MAX_SPEED, MOVE_ACCEL, JUMP_VELOCITY, DIG_DURATION_MS, FRICTION_DECEL };
    // real simulated fall of a crate over d px starting at rest
    const fall = (tiles) => { H.reset(); for (let x = 0; x < 24; x++) { board[16][x] = null; } const c = H.put(PUSHABLE_DEF_ID, 6, 2); c.y = 2 * TILE; c.vy = 0; const y0 = c.y; let t = 0; while (c.y - y0 < tiles * TILE && t < 600) { H.tk(1); t++; } return +(t / 60).toFixed(3); };
    r.fall_s = { "1": fall(1), "2": fall(2), "4": fall(4) };
    // player horizontal distance covered from rest in that time (real sim, hold right)
    const walk = (s) => { H.reset(); const p = H.player(2, 16); H.tk(30); const x0 = p.x; H.key("ArrowRight", true); H.tk(Math.round(s * 60)); H.key("ArrowRight", false); return Math.round(p.x - x0); };
    r.walk_px_in_fall_time = { "1": walk(r.fall_s["1"]), "2": walk(r.fall_s["2"]), "4": walk(r.fall_s["4"]) };
    r.analytic_fall_s = { "1": +Math.sqrt(2 * TILE / GRAVITY).toFixed(3), "2": +Math.sqrt(4 * TILE / GRAVITY).toFixed(3), "4": +Math.sqrt(8 * TILE / GRAVITY).toFixed(3) };
    r.minGapPxForCrush = Math.round(200 * 200 / (2 * GRAVITY) * 10) / 10;
    r.jumpRisePx = Math.round(JUMP_VELOCITY * JUMP_VELOCITY / (2 * GRAVITY)); r.jumpRiseTiles = +(r.jumpRisePx / TILE).toFixed(2);
    return r;
  });

  await run("Q8_softlock_probes", () => {
    const r = {};
    const climb = (depth, wallsDirt) => {
      H.reset(); const top = 16 - depth + 1; for (let y = top; y <= 16; y++) { wallsDirt ? (H.dirt(4, y), H.dirt(6, y)) : (H.rock(4, y), H.rock(6, y)); }
      const p = H.player(5, 16); H.tk(40); let minY = p.y, outside = false;
      // jump, steer right at the apex, repeat a few times
      for (let t = 0; t < 6; t++) { H.key("ArrowUp", true); for (let i = 0; i < 45; i++) { H.tk(1); minY = Math.min(minY, p.y); if (p.y + p.h <= top * TILE + 1) H.key("ArrowRight", true); } H.key("ArrowUp", false); H.key("ArrowRight", false); H.tk(20); if (p.x > 6 * TILE) outside = true; }
      return { depthTiles: depth, apexRisePx: Math.round(522 - minY), escaped: outside };
    };
    r.pit_depth_2_bedrock = climb(2, false); r.pit_depth_3_bedrock = climb(3, false); r.pit_depth_4_bedrock = climb(4, false); r.pit_depth_5_bedrock = climb(5, false);
    // dug-shaft in dirt: deep 5 shaft with dirt walls, can they dig sideways at the bottom and does it help?
    H.reset(); for (let y = 12; y <= 16; y++) { H.dirt(4, y); H.dirt(6, y); } const q = H.player(5, 16); H.tk(30);
    H.key("ArrowRight", true); H.key("ArrowDown", true); H.tk(80); H.key("ArrowRight", false); H.key("ArrowDown", false);
    r.dirt_walled_shaft_dig_sideways = { dugRight: board[16][6] === null, playerX: Math.round(q.x), stillBelowRim: q.y > 12 * TILE };
    // crate dropped on a player standing at the bottom of a 3-deep shaft: also covered by crush rule; can the player shove it out?
    H.reset(); for (let y = 13; y <= 16; y++) { H.rock(4, y); H.rock(6, y); } const c = H.put(PUSHABLE_DEF_ID, 5, 14); const p3 = H.player(5, 16); H.tk(60);
    let best = 999; for (let t = 0; t < 6; t++) { H.key("ArrowUp", true); for (let i = 0; i < 45; i++) { H.tk(1); best = Math.min(best, p3.y); } H.key("ArrowUp", false); H.tk(20); }
    r.crate_filling_1wide_shaft_over_player = { crateY: Math.round(c.y), playerApexY: Math.round(best), shaftRimY: 13 * TILE, playerBelowCrate: p3.y > c.y };
    // E picks the crate up? (even in a 1-wide shaft)
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "e" })); H.tk(5); r.grab_crate_in_shaft = { carried: p3.carrying != null }; window.dispatchEvent(new KeyboardEvent("keyup", { key: "e" }));
    // crate pushed to the end of a 1-tall dead-end corridor, player behind it
    H.reset(); for (let x = 2; x <= 10; x++) { H.rock(x, 14); H.rock(x, 16); } H.rock(11, 15); const cc = H.put(PUSHABLE_DEF_ID, 6, 15); const p4 = H.player(3, 15); H.tk(30);
    H.key("ArrowRight", true); H.tk(240); H.key("ArrowRight", false);
    r.crate_pushed_to_dead_end = { crateX: Math.round(cc.x), endWallX: 11 * TILE, crateFlushWithWall: Math.abs(cc.x + cc.w - 11 * TILE) < 1.5, playerCannotPass: p4.x < cc.x };
    return r;
  });

  await run("Q3b_chaser_vs_boulders_and_pits", () => {
    const r = {};
    const ch = () => findDefaultActorDef("chaser");
    // chaser pushing a crate along a 1-tall corridor toward the player
    H.reset(); for (let x = 1; x <= 14; x++) { H.rock(x, 14); H.rock(x, 16); } H.rock(0, 15); H.rock(15, 15);
    const c = H.put(PUSHABLE_DEF_ID, 6, 15); const e = H.put(ch(), 10, 15); const p = H.player(2, 15); H.tk(30);
    const cx0 = c.x; H.tk(300);
    r.chaser_vs_crate_in_corridor = { crateMovedPx: Math.round(c.x - cx0), chaserX: Math.round(e.x), playerX: Math.round(p.x), chaserPassedCrate: e.x < c.x, hazardHitsOnPlayer: window.__hz };
    // chaser vs a Large Stone
    H.reset(); for (let x = 1; x <= 14; x++) { H.rock(x, 14); H.rock(x, 16); } H.rock(0, 15); H.rock(15, 15);
    const l = H.put(LARGE_STONE_DEF_ID, 6, 15); const e2 = H.put(ch(), 10, 15); const p2 = H.player(2, 15); H.tk(30); const lx0 = l.x; H.tk(300);
    r.chaser_vs_large_stone_in_corridor = { stoneMovedPx: Math.round(l.x - lx0), chaserX: Math.round(e2.x), chaserPassedStone: e2.x < l.x };
    // chaser walking into pits of depth 1 and 2 (gravity room): does it get stuck / climb out?
    for (const depth of [1, 2, 3]) {
      H.reset(); const floorTop = 17 - depth; for (let x = 1; x <= 14; x++) for (let y = floorTop; y <= 16; y++) H.rock(x, y);
      for (let y = floorTop; y <= 16; y++) board[y][7] = null;   // pit col 7 from floorTop to row 16 (depth tiles), bottom = row 17 rock
      const eh = H.put(ch(), 11, floorTop - 1); const ph = H.player(3, floorTop - 1); H.tk(30); H.tk(420);
      r["chaser_pit_depth_" + depth] = { chaserX: Math.round(eh.x), playerX: Math.round(ph.x), pitX: 7 * TILE, chaserFellIn: eh.y > (floorTop) * TILE - 5 && eh.x > 6.2 * TILE && eh.x < 7.9 * TILE, chaserCrossedPit: eh.x < 6 * TILE, chaserY: Math.round(eh.y), floorTopY: floorTop * TILE };
    }
    // boulder into a pit onto a trapped chaser: still alive?
    return r;
  });

  await run("Q5b_jump_distance_and_lava_gap", () => {
    const r = {};
    // how wide a gap can the player jump? open air vs a 2-tile-tall tunnel (ceiling 2 tiles above the walkway)
    const jumpGap = (w, ceiling) => {
      H.reset(); for (let x = 1; x <= 20; x++) H.rock(x, 16); for (let x = 8; x < 8 + w; x++) board[16][x] = "none:lethal";
      for (let x = 8; x < 8 + w; x++) board[17][x] = "solid:none";
      if (ceiling) for (let x = 1; x <= 20; x++) H.rock(x, 13);       // walkway row 15, headroom rows 14-15 => 2 tiles
      const p = H.player(5, 15); H.tk(30); window.__lz = 0; H.key("ArrowRight", true); let jumped = false;
      for (let i = 0; i < 240; i++) { H.tk(1); if (!jumped && p.x + p.w >= 8 * TILE - 6) { H.key("ArrowUp", true); jumped = true; } }
      H.key("ArrowRight", false); H.key("ArrowUp", false);
      return { gapTiles: w, crossed: p.x > (8 + w) * TILE && window.__lz === 0 };
    };
    r.open_air = [1, 2, 3, 4, 5].map(w => jumpGap(w, false));
    r.two_tall_tunnel = [1, 2, 3, 4].map(w => jumpGap(w, true));
    // stones dropped down a 2-wide shaft above a 2-wide lava gap, two per cell, inside a 2-tall tunnel
    const stoneBridge = (tunnelRows) => {
      H.reset(); for (let x = 1; x <= 20; x++) { H.rock(x, 16); for (let k = 0; k < 1; k++) H.rock(x, 15 - tunnelRows); }
      for (let x = 8; x <= 9; x++) { board[16][x] = "none:lethal"; board[17][x] = "solid:none"; board[15 - tunnelRows][x] = null; }
      const st = []; for (let k = 0; k < 2; k++) { for (const x of [8, 9]) { const a = H.put(LARGE_STONE_DEF_ID, x, 9); st.push(a); } H.tk(150); }
      const p = H.player(4, 15); H.tk(20); window.__lz = 0; H.key("ArrowRight", true);
      let jumpedAt = null; for (let i = 0; i < 400; i++) { H.tk(1); if (jumpedAt === null && p.x + p.w >= 8 * TILE - 4) { H.key("ArrowUp", true); jumpedAt = i; } if (jumpedAt !== null && i > jumpedAt + 18) H.key("ArrowUp", false); }
      H.key("ArrowRight", false); H.key("ArrowUp", false);
      return { tunnelRows, stoneTopsY: st.map(s => Math.round(s.y)), walkwayTopY: 16 * TILE, lethalHits: window.__lz, crossed: p.x > 10 * TILE, playerX: Math.round(p.x) };
    };
    r.stones_2per_cell_tunnel_2_tall = stoneBridge(2);
    r.stones_2per_cell_tunnel_1_tall = stoneBridge(1);
    // control: ONE stone per cell
    H.reset(); for (let x = 1; x <= 20; x++) { H.rock(x, 16); H.rock(x, 13); } for (let x = 8; x <= 9; x++) { board[16][x] = "none:lethal"; board[17][x] = "solid:none"; board[13][x] = null; }
    for (const x of [8, 9]) H.put(LARGE_STONE_DEF_ID, x, 9); H.tk(150);
    const pp = H.player(4, 15); H.tk(20); window.__lz = 0; H.key("ArrowRight", true); for (let i = 0; i < 300; i++) H.tk(1); H.key("ArrowRight", false);
    r.one_stone_per_cell_walk = { lethalHits: window.__lz, crossed: pp.x > 10 * TILE };
    return r;
  });

  await run("Q3c_beast_mobility", () => {
    const r = {}; const ch = () => findDefaultActorDef("chaser");
    // can the chaser climb a 1-tile step toward a player standing on the ledge?
    H.reset(); for (let x = 1; x <= 14; x++) H.rock(x, 16); for (let x = 8; x <= 14; x++) H.rock(x, 15);
    const e = H.put(ch(), 3, 15); const p = H.player(11, 14); H.tk(400);
    r.step_up_1_tile = { chaserX: Math.round(e.x), ledgeX: 8 * TILE, climbed: e.x > 8 * TILE };
    // a pit plugged with a crate: does the chaser cross it?
    H.reset(); for (let x = 1; x <= 14; x++) H.rock(x, 16); board[16][7] = null; H.rock(7, 17);
    const plug = H.put(PUSHABLE_DEF_ID, 7, 15); H.tk(60); const e2 = H.put(ch(), 11, 15); const p2 = H.player(2, 15); H.tk(420);
    r.crate_plugged_pit = { plugY: Math.round(plug.y), chaserX: Math.round(e2.x), crossed: e2.x < 6 * TILE, plugMovedPx: Math.round(plug.x - (7 * TILE + 5)) };
    // same pit, plug picked up by the player (E) before the chaser arrives: does the chaser fall in?
    H.reset(); for (let x = 1; x <= 14; x++) H.rock(x, 16); board[16][7] = null; H.rock(7, 17);
    const plug3 = H.put(PUSHABLE_DEF_ID, 7, 15); H.tk(60); const p3 = H.player(6, 15); p3.x = 6 * TILE + 3; H.tk(10);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "e" })); H.tk(3); window.dispatchEvent(new KeyboardEvent("keyup", { key: "e" })); H.tk(3);
    const got = p3.carrying != null; const e3 = H.put(ch(), 12, 15); H.tk(420);
    r.pit_unplugged_by_pickup = { playerCarried: got, chaserX: Math.round(e3.x), chaserY: Math.round(e3.y), chaserTrappedInPit: e3.y > 16 * TILE - 5 };
    return r;
  });

  console.log("\npage errors:", errors.length ? errors : "none");
  fs.writeFileSync(path.join(os.tmpdir(), "rb_stageA.json"), JSON.stringify(out, null, 1));
  await browser.close();
})();
