// Movers (traffic and floaters) tests (not deployed). Usage: node tests/movers.test.js
// Injects a throwaway hook into a temp copy of index.html; the repo file stays clean.
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/opt/node22/lib/node_modules/playwright");
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = `window.__ev=f=>eval("("+f+")")();window.__hz=0;window.__sfx=[];
{const o=triggerHazard;triggerHazard=function(){const r=o.apply(this,arguments);if(r)window.__hz++;return r;};window.__unwrapHz=()=>{triggerHazard=o;};}
window.__t={
 reset:()=>{suppressHistory=true;restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT));suppressHistory=false;window.__hz=0;},
 snap:()=>captureProjectSnapshot(),restore:s=>restoreProjectSnapshot(s),paint:(x,y,k)=>{board[y][x]=k},
 grav:v=>{gravityEnabled=v},wrapV:v=>{wrapVEnabled=v},wrapH:v=>{wrapHEnabled=v},
 tick:(n,jit)=>{let s=12345;const r=()=>{s=(s*1103515245+12345)&0x7fffffff;return s/0x7fffffff};for(let i=0;i<n;i++)tick(jit?(1/240+r()*(1/30-1/240)):1/60)},
 st:()=>({actors,board,rooms}),keys:()=>keys,
 place:(defId,gx,gy,dir)=>{selectedActorDefId=defId;paintMode="actor";const a=placeNewActor(gx*TILE+TILE/2,gy*TILE+TILE/2);while(dir&&a.moverDir!==dir)rotateMover(a);return a;},
 player:(gx,gy)=>{selectedActorDefId=playerDefId;paintMode="actor";return placeNewActor(gx*TILE+16,gy*TILE+16)},
 resetBtn:()=>document.getElementById('resetBtn').click(),play:()=>enterPlayMode(),stop:()=>exitToBuildMode(),
 misc:()=>({lives,spare:spareHearts,star:starTimer,over:playSessionEnded,ready:playReadyUntil}),
 setSpare:n=>{spareHearts=n},setStar:n=>{starTimer=n},setLives:n=>{lives=n},
 snd:()=>sounds,wrapSounds:()=>{const c={};for(const k of Object.keys(sounds)){const f=sounds[k];sounds[k]=function(){c[k]=(c[k]||0)+1;return f.apply(this,arguments)}}return c},
 ROWS:()=>ROWS,TILE:()=>TILE};`;
const tmp = path.join(os.tmpdir(), "movers_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK));
const run = (pg, fn) => pg.evaluate(s => window.__ev(s), fn.toString());
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fails.push(m); console.log("FAIL:", m); } };

// Vertical river: water on cols 3..8, wrap-V on, no gravity.
const DEFINE_RIVER = `window.__river=()=>{ __t.reset(); __t.grav(false); __t.wrapV(true); __t.wrapH(false);
  for (let y = 0; y < 18; y++) for (let x = 3; x <= 8; x++) __t.paint(x, y, "none:hazard"); };`;

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = []; page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept());
  await page.goto("file://" + tmp); await page.waitForFunction(() => window.__t);
  await page.evaluate(DEFINE_RIVER);

  // 1. presets exist with the right shape
  const presets = await run(page, () => MOVER_DEF_IDS.map(id => { const d = actorDefs[id]; return { id, k: d.moverKind, len: d.lenTiles, w: d.wTiles, t: d.speedTier, art: d.art.length }; }));
  ok(presets.length === 6 && presets.every(p => p.w === 2 && p.art === 64), "six presets, all 2 wide with 8x8 art: " + JSON.stringify(presets));
  ok(presets.find(p => p.id === "mvLog").len === 4 && presets.find(p => p.id === "mvCroc").len === 6 && presets.find(p => p.id === "mvScooter").k === "hurts", "preset lengths/kinds");

  // 2. rider with no input stays put on the log across several laps (seam crossing), zero hits
  const ride = await run(page, () => {
    __river();
    const log = __t.place("mvLog", 4, 3, "s"); const p = __t.player(0, 0);
    p.x = 4 * TILE + (64 - p.w) / 2; p.y = log.y + 60; p.vx = p.vy = 0;
    const ext = ROWS * TILE, rel0 = ((p.y - log.y) % ext + ext) % ext, x0 = p.x;
    let maxDev = 0, maxDx = 0;
    for (let i = 0; i < 1100; i++) {
      __t.tick(1);
      const rel = ((p.y - log.y) % ext + ext) % ext; const d = Math.abs(rel - rel0);
      maxDev = Math.max(maxDev, Math.min(d, ext - d)); maxDx = Math.max(maxDx, Math.abs(p.x - x0));
    }
    return { maxDev, maxDx, hz: window.__hz, laps: (60 * 1100 / 60) / ext, logSize: [log.w, log.h] };
  });
  console.log("ride:", JSON.stringify(ride));
  ok(ride.maxDev < 0.05 && ride.maxDx < 0.05, "rider drifts relative to log " + JSON.stringify(ride));
  ok(ride.hz === 0, "rider took hits " + ride.hz);
  ok(ride.logSize[0] === 64 && ride.logSize[1] === 128, "log is 2 wide x 4 long");

  // 3. steering adds to the carry speed
  const steer = await run(page, () => {
    __river();
    const log = __t.place("mvLog", 4, 3, "s"); const p = __t.player(0, 0);
    p.x = 4 * TILE + 21; p.y = log.y + 20; p.vx = p.vy = 0;
    __t.tick(10); const y0 = p.y;
    __t.keys().ArrowDown = true; __t.tick(20); const down = (p.y - y0) / (20 / 60);
    __t.keys().ArrowDown = false; __t.tick(30);
    return { down, hz: window.__hz };
  });
  ok(steer.down > 100, "steering with the log should exceed log speed, got " + steer.down);

  // 4. edge sweep: centre just inside either edge, jittered frame times, never a hit
  const sweep = await run(page, () => {
    const out = []; let worst = 0;
    for (const edge of ["trailing", "leading"]) for (const d of [0.25, 0.5, 1, 1.5, 2, 3, 4]) for (const jit of [false, true]) {
      __river();
      const log = __t.place("mvLog", 4, 3, "s"); const p = __t.player(0, 0);
      p.x = 4 * TILE + 21;
      const cy = edge === "trailing" ? log.y + log.h - d : log.y + d;
      p.y = cy - p.h / 2; p.vx = p.vy = 0; p.hazardCooldown = 0;
      __t.tick(120, jit);
      if (window.__hz) out.push(edge + " d=" + d + " jit=" + jit + " hits=" + window.__hz);
    }
    return out;
  });
  ok(sweep.length === 0, "edge sweep hits: " + sweep.join("; "));

  // 5. lane spacing is stable: two logs keep their gap after many laps; positions are exact
  const lane = await run(page, () => {
    __river();
    const a = __t.place("mvLog", 4, 0, "s"), b = __t.place("mvLog", 4, 8, "s");
    const ext = ROWS * TILE; const gap0 = ((b.y - a.y) % ext + ext) % ext;
    __t.tick(3000);
    const gap1 = ((b.y - a.y) % ext + ext) % ext;
    return { gap0, gap1 };
  });
  ok(Math.abs(lane.gap0 - lane.gap1) < 0.01, "lane spacing drifted " + JSON.stringify(lane));

  // 6. a rider can walk off the side of a log onto the dry bank without a hit
  const walkoff = await run(page, () => {
    __river();
    for (let y = 0; y < 18; y++) for (let x = 1; x <= 2; x++) __t.paint(x, y, "none:hazard"); // water right next to the bank at col 0
    const log = __t.place("mvLog", 1, 3, "s"); const p = __t.player(0, 0);
    p.x = 1 * TILE + 20; p.y = log.y + 50; p.vx = p.vy = 0;
    __t.tick(5); __t.keys().ArrowLeft = true; __t.tick(40); __t.keys().ArrowLeft = false; __t.tick(10);
    return { x: p.x, hz: window.__hz };
  });
  console.log("walkoff:", JSON.stringify(walkoff));
  ok(walkoff.x < 32 && walkoff.hz === 0, "walk-off onto the bank " + JSON.stringify(walkoff));

  // 7. a solid post pins a rider flush (no tunnelling) while the log passes underneath
  const pin = await run(page, () => {
    __river();
    __t.paint(4, 9, "solid:none");
    const log = __t.place("mvLog", 4, 3, "s"); const p = __t.player(0, 0);
    p.x = 4 * TILE + 21; p.y = log.y + 90; p.vx = p.vy = 0;
    __t.tick(240);
    return { y: p.y, bottom: p.y + p.h, post: 9 * TILE };
  });
  ok(pin.bottom <= pin.post + 0.5 || pin.y > pin.post, "rider tunnelled through a solid " + JSON.stringify(pin));

  // 8. a hurts mover: plain Hazard, knocked out of the lane toward the side the player came from
  const car = await run(page, () => {
    __river();
    const sc = __t.place("mvScooter", 12, 2, "s"); // dry ground, lane cols 12-13
    sc.spawnY = 5 * TILE; sc.moverT = 0; moverPlaceAt(sc);
    const p = __t.player(0, 0); p.x = 9 * TILE + 2; p.y = sc.y + 75; p.vx = p.vy = 0; p.facingDir = 1;
    __t.keys().ArrowRight = true; const c = __t.wrapSounds();
    let hit = null;
    for (let i = 0; i < 90 && !hit; i++) { __t.tick(1); if (window.__hz) hit = { x: p.x, vx: p.vx, vy: p.vy, scx: sc.x }; }
    __t.keys().ArrowRight = false; __t.tick(30);
    return { hit, after: p.x, scx: sc.x, honk: c.honk || 0, hz: window.__hz };
  });
  console.log("car:", JSON.stringify(car));
  ok(car.hit && car.hit.vx < 0 && Math.abs(car.hit.vy) < 1, "car hit should knock back left, got " + JSON.stringify(car.hit));
  ok(car.after + 22 <= car.scx + 0.5, "player was left in the lane " + JSON.stringify(car));
  ok(car.honk === 1, "honk played " + car.honk);

  // 9. water drop with no log knocks the frog toward the last dry spot (not north), with a splash
  const drop = await run(page, () => {
    __river();
    const log = __t.place("mvLog", 7, 0, "s"); // a floater exists, so the room counts as a river
    const p = __t.player(1, 8); p.vx = p.vy = 0; __t.tick(5);
    const c = __t.wrapSounds();
    p.x = 4 * TILE + 5; p.y = 8 * TILE + 5; p.vx = p.vy = 0;
    __t.tick(2);
    return { vx: p.vx, vy: p.vy, hz: window.__hz, splash: c.splash || 0 };
  });
  console.log("drop:", JSON.stringify(drop));
  ok(drop.hz === 1 && drop.vx < -100 && Math.abs(drop.vy) < 60, "water drop knockback should head to the bank " + JSON.stringify(drop));
  ok(drop.splash === 1, "splash played " + drop.splash);

  // 10. plain hazards in a room with no floater keep the old behaviour (straight up when still)
  const oldHaz = await run(page, () => {
    __river();
    const p = __t.player(1, 8); p.vx = p.vy = 0; __t.tick(5);
    p.x = 4 * TILE + 5; p.y = 8 * TILE + 5; p.vx = p.vy = 0; __t.tick(2);
    return { vx: p.vx, vy: p.vy };
  });
  ok(oldHaz.vy < -100 && Math.abs(oldHaz.vx) < 5, "hazard without movers changed behaviour " + JSON.stringify(oldHaz));

  // 11. Play-mode: heart absorbs a car, no heart costs a life, star ignores both car and water
  const play = await run(page, async () => {
    const res = {};
    const setup = () => {
      __river();
      const sc = __t.place("mvScooter", 12, 2, "s"); sc.spawnY = 5 * TILE; moverPlaceAt(sc);
      const p = __t.player(9, 5); __t.play();
      return sc;
    };
    const press = () => { const p = __t.st().actors.find(a => a.isPlayer); const sc = __t.st().actors.find(a => a.defId === "mvScooter"); p.x = sc.x - p.w + 2; p.y = sc.y + 10; p.vx = p.vy = 0; p.hazardCooldown = 0; p.invulnT = 0; __t.tick(2); };
    setup(); await new Promise(r => setTimeout(r, 1400));
    const lives0 = __t.misc().lives;
    __t.setSpare(1); press(); res.heart = { lives: __t.misc().lives, spare: __t.misc().spare, lives0 };
    __t.stop();
    setup(); await new Promise(r => setTimeout(r, 1400)); const l1 = __t.misc().lives; __t.setSpare(0); press(); res.noHeart = { l1, lives: __t.misc().lives };
    __t.stop();
    setup(); await new Promise(r => setTimeout(r, 1400)); const l2 = __t.misc().lives; __t.setStar(5000); press();
    const p = __t.st().actors.find(a => a.isPlayer); p.x = 4 * TILE + 5; p.y = 8 * TILE + 5; p.hazardCooldown = 0; __t.tick(3);
    res.star = { l2, lives: __t.misc().lives, hz: window.__hz };
    __t.stop();
    return res;
  });
  console.log("play:", JSON.stringify(play));
  ok(play.heart.lives === play.heart.lives0 && play.heart.spare === 0, "heart should absorb a car " + JSON.stringify(play.heart));
  ok(play.noHeart.lives === play.noHeart.l1 - 1, "no heart should cost a life " + JSON.stringify(play.noHeart));
  ok(play.star.lives === play.star.l2, "star should ignore car and water " + JSON.stringify(play.star));

  // 12. Reset to start restores every phase
  const reset = await run(page, () => {
    __river();
    const log = __t.place("mvLog", 4, 3, "s"); __t.tick(200);
    const moved = log.y; __t.resetBtn();
    return { moved, y: log.y, spawn: log.spawnY, t: log.moverT };
  });
  ok(reset.moved !== reset.spawn && reset.y === reset.spawn && reset.t === 0, "reset phases " + JSON.stringify(reset));

  // 13. moverDir survives a snapshot round trip, and an old snapshot gets the defs back
  const rt = await run(page, () => {
    __river();
    const t = __t.place("mvTurtle", 6, 4, "e");
    const dims = [t.w, t.h];
    const s = structuredClone(__t.snap()); __t.restore(structuredClone(s));
    const back = __t.st().actors.find(a => a.defId === "mvTurtle");
    const old = structuredClone(s); MOVER_DEF_IDS.forEach(id => delete old.actorDefs[id]);
    __t.restore(old);
    return { dir: back.moverDir, dims, backDims: [back.w, back.h], defs: MOVER_DEF_IDS.every(id => !!actorDefs[id]) };
  });
  ok(rt.dir === "e" && rt.dims[0] === 64 && rt.dims[1] === 64 && rt.backDims[0] === 64, "round trip " + JSON.stringify(rt));
  ok(rt.defs, "old snapshot should backfill mover defs");

  // 14. rotating a placed mover cycles s -> n -> e -> w -> s and swaps its box
  const rot = await run(page, () => {
    __river();
    const l = __t.place("mvLog", 4, 3, "s"); const seq = [l.moverDir + ":" + l.w + "x" + l.h];
    for (let i = 0; i < 4; i++) { rotateMover(l); seq.push(l.moverDir + ":" + l.w + "x" + l.h); }
    return seq.join(" ");
  });
  ok(rot === "s:64x128 n:64x128 e:128x64 w:128x64 s:64x128", "rotate cycle " + rot);

  // 15. movers are immune to forces and never collide with other actors / block spawners
  const immune = await run(page, () => {
    __river();
    const log = __t.place("mvLog", 4, 3, "s"); const c = __t.place("mvCroc", 4, 10, "s");
    log.vx = 500; log.vy = -500; __t.tick(3);
    const crate = (selectedActorDefId = PUSHABLE_DEF_ID, placeNewActor(8 * TILE, 8 * TILE));
    crate.x = log.x + 4; crate.y = log.y + 4; __t.tick(30);
    return { vx: log.vx, vy: log.vy, lx: log.x, occupied: cellOccupiedByActor(4, 3) };
  });
  ok(immune.vx === 0 && immune.vy === 0 && immune.lx === 128 && !immune.occupied, "mover not immune " + JSON.stringify(immune));

  // 16. NPC riding a log over lethal water is not sent home
  const npc = await run(page, () => {
    __river();
    for (let y = 0; y < 18; y++) for (let x = 3; x <= 8; x++) __t.paint(x, y, "none:lethal");
    const log = __t.place("mvLog", 4, 3, "s");
    selectedActorDefId = findDefaultActorDef("wanderer"); paintMode = "actor";
    const w = placeNewActor(5 * TILE, log.y + 60); w.x = 4 * TILE + 21; w.y = log.y + 50; w.spawnX = 0; w.spawnY = 0;
    for (let i = 0; i < 50; i++) { w.vx = 0; w.vy = 0; __t.tick(1); }
    return { x: w.x, y: w.y, near: w.x > 100 && w.y > 100 };
  });
  ok(npc.near, "NPC on a log was reset " + JSON.stringify(npc));


  // 18. a horizontal lane (wrap-H on) carries a rider across the side seam with no drift
  const horiz = await run(page, () => {
    __t.reset(); __t.grav(false); __t.wrapV(false); __t.wrapH(true);
    for (let x = 0; x < 24; x++) for (let y = 6; y <= 9; y++) __t.paint(x, y, "none:hazard");
    const log = __t.place("mvLog", 2, 6, "e"); const p = __t.player(0, 0);
    p.x = log.x + 40; p.y = 6 * TILE + (64 - p.h) / 2; p.vx = p.vy = 0;
    const ext = roomCols() * TILE, rel0 = ((p.x - log.x) % ext + ext) % ext; let dev = 0;
    for (let i = 0; i < 1500; i++) { __t.tick(1); const rel = ((p.x - log.x) % ext + ext) % ext; const d = Math.abs(rel - rel0); dev = Math.max(dev, Math.min(d, ext - d)); }
    return { dev, hz: window.__hz, dims: [log.w, log.h] };
  });
  ok(horiz.dev < 0.05 && horiz.hz === 0 && horiz.dims[0] === 128, "horizontal lane " + JSON.stringify(horiz));

  // 19. palette: the Traffic and floaters row has six captioned swatches; clicking one then the canvas places it
  await page.evaluate(() => { __t.reset(); });
  const n = await page.evaluate(() => document.querySelectorAll("#moverSwatches .swatch").length);
  ok(n === 6, "mover swatches " + n);
  await page.click("#modeObject");
  await page.click("#moverSwatches .swatch:nth-child(5)");
  const box = await page.locator("#gameCanvas").boundingBox();
  await page.mouse.click(box.x + box.width * (4.5 / 24), box.y + box.height * (3.5 / 18));
  const placed = await run(page, () => { const m = __t.st().actors.find(a => a.defId === "mvLog"); return m && { x: m.x, y: m.y, w: m.w, h: m.h, dir: m.moverDir }; });
  ok(placed && placed.x === 128 && placed.y === 96 && placed.w === 64 && placed.h === 128 && placed.dir === "s", "palette placement " + JSON.stringify(placed));
  await page.mouse.click(box.x + box.width * (4.5 / 24), box.y + box.height * (4.5 / 18)); // click the placed log: rotates it
  const turned = await run(page, () => { const l = __t.st().actors.find(a => a.defId === "mvLog"); return l ? l.moverDir : "gone:" + __t.st().actors.map(a => a.defId).join(","); });
  ok(turned === "n", "clicking a placed mover rotates it, got " + turned);
  await page.hover("#moverSwatches .swatch:nth-child(5)");
  const cap = await page.textContent("#captionBar");
  ok(/Carries you/.test(cap), "caption for a floater: " + cap);

  ok(errors.length === 0, "page errors: " + errors.slice(0, 3).join(" | "));
  await page.close();

  // 17. an exported game runs a crossing: a rider on a log is carried and takes no hit, zero errors
  const p2 = await browser.newPage(); p2.on("dialog", d => d.accept());
  const e2 = []; p2.on("pageerror", e => e2.push(String(e)));
  await p2.goto("file://" + tmp); await p2.waitForFunction(() => window.__t);
  await p2.evaluate(DEFINE_RIVER);
  await run(p2, () => {
    __river();
    const log = __t.place("mvLog", 4, 3, "s"); __t.place("mvScooter", 12, 8, "s"); __t.place("mvCroc", 6, 0, "s");
    const p = __t.player(0, 0); p.x = 4 * TILE + 21; p.y = log.y + 50; p.spawnX = p.x; p.spawnY = p.y;
    startPos.x = p.x; startPos.y = p.y;
    window.__unwrapHz();
  });
  const dl = p2.waitForEvent("download");
  await p2.click("#exportBtn");
  const out = path.join(os.tmpdir(), "movers_export.html");
  await (await dl).saveAs(out);
  let html = fs.readFileSync(out, "utf8");
  ok(html.includes("tickMovers") && html.includes("MOVER_SPEEDS") && html.includes("honk"), "export has mover code");
  const hookAnchor = "playReadyUntil = performance.now() + READY_DURATION_MS;\n  renderPlayHUD();";
  ok(html.includes(hookAnchor), "export boot anchor present");
  html = html.replace(hookAnchor, hookAnchor + " window.__x={a:()=>actors,lives:()=>lives};");
  fs.writeFileSync(out, html);
  const p3 = await browser.newPage(); const e3 = [];
  p3.on("pageerror", e => e3.push(String(e))); p3.on("console", m => { if (m.type() === "error") e3.push(m.text()); });
  await p3.goto("file://" + out); await p3.waitForTimeout(1600);
  if (e3.length) console.log("export errors:", e3.slice(0, 3));
  const y0 = await p3.evaluate(() => { const a = __x.a(); const p = a.find(x => x.isPlayer), l = a.find(x => x.defId === "mvLog"); return { py: p.y, ly: l.y, lives: __x.lives() }; });
  await p3.waitForTimeout(3000);
  const y1 = await p3.evaluate(() => { const a = __x.a(); const p = a.find(x => x.isPlayer), l = a.find(x => x.defId === "mvLog"); return { py: p.y, ly: l.y, lives: __x.lives() }; });
  const rel0 = y0.py - y0.ly, rel1 = y1.py - y1.ly;
  console.log("export:", JSON.stringify({ y0, y1 }));
  ok(Math.abs(y1.ly - y0.ly) > 100, "exported log should move " + JSON.stringify({ y0, y1 }));
  ok(Math.abs(((rel1 - rel0) % 576 + 576) % 576) < 1 || Math.abs(rel1 - rel0) < 1, "exported rider should keep its place on the log " + JSON.stringify({ rel0, rel1 }));
  ok(y1.lives === y0.lives, "exported rider lost a life");
  ok(e3.length === 0 && e2.length === 0, "export errors: " + e3.concat(e2).slice(0, 3).join(" | "));

  await browser.close();
  console.log(`\n=== MOVERS: ${pass} passed, ${fails.length} failed ===`);
  process.exit(fails.length ? 1 : 0);
})();
