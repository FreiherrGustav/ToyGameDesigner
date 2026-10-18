// v2.52 Stage 3 (not deployed): the uncolored Button's gravity options. Usage: node tests/gravbutton.test.js [shotDir]
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const REPO = path.join(__dirname, "..");
const SHOTS = process.argv[2] || os.tmpdir();
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const hook = `window.__ev=f=>eval("("+f+")");
window.__sim=(n,inputFn)=>{ for(let i=0;i<n;i++){ if(inputFn) inputFn(i); window.__T+=16; const q=window.__q.splice(0); for(const cb of q) cb(window.__T); } };
`;
const src = fs.readFileSync(path.join(REPO, "index.html"), "utf8"); if (!src.includes(anchor)) throw new Error("anchor");
const NEW = path.join(os.tmpdir(), "gb_new.html"); fs.writeFileSync(NEW, src.replace(anchor, anchor + hook));
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; console.log("ok  ", m); } else { fails.push(m); console.log("FAIL", m); } };
const FAKE = () => { window.__T = 0; window.__q = []; performance.now = () => window.__T; window.requestAnimationFrame = cb => { window.__q.push(cb); return 1; }; };
const open = async b => {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 700 }, acceptDownloads: true });
  const page = await ctx.newPage(); const errors = []; page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept());
  await page.addInitScript(FAKE);
  await page.goto("file://" + NEW + "#t"); await page.waitForFunction(() => window.__sim);
  return { ctx, page, errors };
};
const ev = (pg, code) => pg.evaluate(c => window.__ev(c)(), code);
const sim = (pg, n) => pg.evaluate(n => window.__sim(n), n);
// Buttons (gx,gy) with option opt; a closed box; the player somewhere harmless.
const SCENE = `(opts)=>{ for(let y=0;y<ROWS;y++) for(let x=0;x<24;x++) board[y][x]=(y===0||y===ROWS-1||x===0||x===23)?'solid:none':null;
  const hot=rooms.find(r=>r.id===currentRoomId); hot.gravButtons={};
  for(const [x,y,o] of opts){ board[y][x]=gameplayKey(PUSH_BUTTON_GEOMETRY,'none'); colorBoard[y][x]=null; if(o!=='toggle') hot.gravButtons[x+','+y]=o; }
  actors.length=0; selectedActorDefId=playerDefId; paintMode='actor'; placeNewActor(2*TILE+16, 3*TILE+16); }`;
// Walk off (teleport away, wait out the 500 ms cooldown), then onto the cell.
const stepOn = async (pg, gx, gy) => {
  await ev(pg, `()=>{ const p=actors.find(a=>a.isPlayer); p.x=2*TILE+5; p.y=3*TILE+5; p.vx=0; p.vy=0; }`);
  await sim(pg, 40);
  await ev(pg, `()=>{ const p=actors.find(a=>a.isPlayer); p.x=${gx}*TILE+5; p.y=${gy}*TILE+5; p.vx=0; p.vy=0; }`);
  await sim(pg, 3);
};
const scene = (pg, opts) => ev(pg, `()=>(${SCENE})(${JSON.stringify(opts)})`);
const state = pg => ev(pg, "()=>({on:gravityEnabled,dir:gravityDir})");

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  let { ctx, page, errors } = await open(browser);

  // ---- 1. the palette picker (real clicks) ----
  await page.click("#placeTabs [data-tab=object], #placeTabs button:has-text('Objects')").catch(() => {});
  await ev(page, "()=>{ activeTab='object'; renderAll(); }");
  await page.click("#fixtureSwatches .swatch[title=switch]");
  ok(await ev(page, "()=>document.getElementById('buttonOptBlock').style.display!=='none'"), "picking the Switch shows the 'when touched' row");
  const opts = await ev(page, "()=>[...document.querySelectorAll('#buttonOptSwatches .swatch')].map(s=>s.dataset.opt)");
  ok(opts.join() === "toggle,down,up,left,right,random", "six options: " + opts.join());
  ok(await ev(page, "()=>document.querySelector('#buttonOptSwatches .swatch.selected').dataset.opt==='toggle'"), "toggle is the default");
  await page.click("#buttonOptSwatches .swatch[data-opt=left]");
  ok(await ev(page, "()=>selectedButtonOpt==='left'"), "clicking an option selects it");
  await page.click("#fixtureSwatches .swatch[title=plate]");
  ok(await ev(page, "()=>document.getElementById('buttonOptBlock').style.display==='none'"), "the row hides for other pieces");
  await page.click("#fixtureSwatches .swatch[title=switch]");
  await ev(page, "()=>{ selectedChannelColor='red'; renderAll(); }");
  ok(await ev(page, "()=>document.getElementById('buttonOptBlock').style.display==='none'"), "a colored Switch has no gravity options");
  await ev(page, "()=>{ selectedChannelColor=null; renderAll(); }");

  // paint through the canvas
  await scene(page, []);
  await page.click("#fixtureSwatches .swatch[title=switch]");
  await page.click("#buttonOptSwatches .swatch[data-opt=up]");
  const box = await page.locator("#gameCanvas").boundingBox();
  const cellPx = (gx, gy) => { const sc = (box.width - 6) / 768; return [box.x + 3 + (gx * 32 + 16) * sc, box.y + 3 + (gy * 32 + 16) * sc]; };
  const [mx, my] = cellPx(8, 8); await page.mouse.click(mx, my);
  ok(await ev(page, "()=>geometryAt(8,8)==='pushbutton' && gravButtonOptAt(8,8)==='up'"), "painting with 'up' selected stores up on that Button");
  await page.click("#buttonOptSwatches .swatch[data-opt=toggle]");
  const [m2x, m2y] = cellPx(12, 8); await page.mouse.click(m2x, m2y);
  ok(await ev(page, "()=>geometryAt(12,8)==='pushbutton' && gravButtonOptAt(12,8)==='toggle' && !('12,8' in rooms[0].gravButtons)"), "painting with toggle stores nothing");
  await page.click("#buttonOptSwatches .swatch[data-opt=random]");
  await page.mouse.click(m2x, m2y); // click the existing toggle Button with random selected: re-sets it
  ok(await ev(page, "()=>gravButtonOptAt(12,8)==='random'"), "clicking a placed Switch with another option re-sets it");
  await page.mouse.click(...cellPx(8, 8)); // different option -> re-set to random
  ok(await ev(page, "()=>gravButtonOptAt(8,8)==='random'"), "re-setting works on any placed Switch");
  await sim(page, 2);
  await page.screenshot({ path: path.join(SHOTS, "gravbutton_build.png") });

  // ---- 2. each option, Build and Play ----
  const OPT = [[4, 6, "down"], [8, 6, "up"], [12, 6, "left"], [16, 6, "right"], [4, 12, "toggle"], [20, 12, "random"]];
  for (const mode of ["build", "play"]) {
    await scene(page, OPT);
    if (mode === "play") { await ev(page, "()=>{ enterPlayMode(); playReadyUntil=null; }"); }
    await sim(page, 3);
    for (const dir of ["down", "up", "left", "right"]) {
      await ev(page, "()=>{ gravityEnabled=false; gravityDir='down'; }");
      const [x, y] = OPT.find(o => o[2] === dir);
      await stepOn(page, x, y);
      let s = await state(page);
      ok(s.on && s.dir === dir, `${mode}: ${dir} Button turns gravity on and points it ${dir} (${JSON.stringify(s)})`);
    }
    // from gravity ON in another direction
    await ev(page, "()=>{ gravityEnabled=true; gravityDir='left'; }");
    await stepOn(page, 4, 6);
    let s = await state(page); ok(s.on && s.dir === "down", `${mode}: a direction Button re-points gravity that was already on`);
    // toggle Button: today's behaviour
    await ev(page, "()=>{ gravityEnabled=false; gravityDir='up'; }");
    await stepOn(page, 4, 12); s = await state(page);
    ok(s.on && s.dir === "up", `${mode}: toggle Button turns gravity on and keeps its direction`);
    await stepOn(page, 4, 12); s = await state(page);
    ok(!s.on, `${mode}: toggle Button turns it off again`);
    // random from off
    await ev(page, "()=>{ gravityEnabled=false; gravityDir='down'; gravRandomCount=0; }");
    await stepOn(page, 20, 12); s = await state(page);
    ok(s.on && s.dir !== "down", `${mode}: random Button turns gravity on, in a different direction (${s.dir})`);
    // same direction again: no change, but the sound and animation fire
    await ev(page, `()=>{ gravityEnabled=true; gravityDir='right'; if(!window.__wrapped){ window.__wrapped=1; window.__of=sounds.flip; window.__or=playRecipe; const f=sounds.flip; sounds.flip=function(){ window.__fl++; return f.apply(this,arguments); }; const r=playRecipe; playRecipe=function(e,n){ if(n==='gravityFlip') window.__an++; return r.apply(this,arguments); }; } window.__fl=0; window.__an=0; }`);
    await stepOn(page, 16, 6);
    const fb = await ev(page, "()=>({fl:window.__fl,an:window.__an,dir:gravityDir,on:gravityEnabled})");
    ok(fb.dir === "right" && fb.on && fb.fl === 1 && fb.an === 1, `${mode}: the same direction again changes nothing but plays the flip sound and animation (${JSON.stringify(fb)})`);
    if (mode === "play") { await ev(page, "()=>exitToBuildMode()"); }
  }
  await ev(page, "()=>{ sounds.flip=window.__of; playRecipe=window.__or; window.__wrapped=0; }"); // the export serializes these, so put them back

  // ---- 3. the Button shows its option ----
  await scene(page, OPT);
  await sim(page, 2);
  const px = (gx, gy, dx, dy) => page.evaluate(([gx, gy, dx, dy]) => { const c = document.getElementById("gameCanvas"); const d = c.getContext("2d").getImageData(gx * 32 + dx, gy * 32 + dy, 1, 1).data; return [d[0], d[1], d[2]].join(); }, [gx, gy, dx, dy]);
  const badge = await px(8, 6, 24, 8), plain = await px(4, 12, 24, 8);
  ok(badge !== plain, "a direction Button draws a badge in its corner; the toggle Button doesn't (" + badge + " vs " + plain + ")");

  // ---- 4. chain of two Buttons ----
  await scene(page, [[6,8,'up'],[14,8,'left']]);
  await ev(page, "()=>{ gravityEnabled=false; gravityDir='down'; }");
  await stepOn(page, 6, 8); let s = await state(page); ok(s.on && s.dir === "up", "chain: first Button points gravity up");
  await stepOn(page, 14, 8); s = await state(page); ok(s.on && s.dir === "left", "chain: second Button points it left");
  await stepOn(page, 6, 8); s = await state(page); ok(s.dir === "up", "chain: walking back gives up again");
  // standing still on a Button doesn't re-fire (edge triggered) even past the cooldown
  await ev(page, "()=>{ gravityEnabled=false; gravityDir='right'; }"); await sim(page, 60); s = await state(page);
  ok(!s.on && s.dir === "right", "standing on a Button does not fire it again");

  // ---- 5. random never repeats the current direction over 1000 presses; seeded ----
  const seqRun = () => ev(page, `()=>{ gravityEnabled=true; gravityDir='down'; gravRandomCount=0; const seq=[]; let bad=0; const cnt={down:0,up:0,left:0,right:0};
    for(let i=0;i<1000;i++){ const before=gravityDir; applyGravButtonOption('random'); if(gravityDir===before) bad++; seq.push(gravityDir); cnt[gravityDir]++; }
    return {bad,seq:seq.join(','),cnt}; }`);
  const r1 = await seqRun(), r2 = await seqRun();
  ok(r1.bad === 0, "1000 random presses: none repeated the current direction");
  ok(Object.values(r1.cnt).every(n => n > 150), "random reaches every direction (" + JSON.stringify(r1.cnt) + ")");
  ok(r1.seq === r2.seq, "the random stream is the same every Play session (seeded)");
  await ev(page, "()=>{ gravityEnabled=false; gravityDir='up'; gravRandomCount=0; applyGravButtonOption('random'); }");
  s = await state(page); ok(s.on && s.dir !== "up", "random from off: on, and different from the stored direction");

  // ---- 6. Reset, Play round trip, room switch ----
  await scene(page, [[6,8,'up'],[14,8,'random']]);
  await ev(page, "()=>{ gravityEnabled=true; gravityDir='down'; }");
  await ev(page, "()=>{ enterPlayMode(); playReadyUntil=null; }"); await sim(page, 3);
  await stepOn(page, 6, 8); s = await state(page); ok(s.dir === "up", "Play: Button works after entering Play");
  await ev(page, "()=>exitToBuildMode()"); s = await state(page);
  ok(s.on && s.dir === "down", "leaving Play restores the room's own gravity (as the toggle does)");
  ok(await ev(page, "()=>gravButtonOptAt(6,8)==='up' && gravButtonOptAt(14,8)==='random'"), "options survive a Play round trip");
  await ev(page, "()=>{ enterPlayMode(); playReadyUntil=null; gravRandomCount=5; }"); await sim(page, 3);
  await ev(page, "()=>{ restartPlaySessionFromSnapshot(); }");
  ok(await ev(page, "()=>gravRandomCount===0"), "a Play restart starts the random stream over");
  await ev(page, "()=>exitToBuildMode()");
  // build-mode Reset to start
  await ev(page, "()=>{ gravityDir='left'; }");
  await page.click("#resetBtn"); s = await state(page);
  ok(await ev(page, "()=>gravButtonOptAt(6,8)==='up'"), "Reset to start keeps the Button options");
  // rooms
  await ev(page, "()=>{ duplicateRoom(); }");
  ok(await ev(page, "()=>rooms.length===2 && gravButtonOptAt(6,8)==='up' && gravButtonOptAt(14,8)==='random' && rooms[1].gravButtons!==rooms[0].gravButtons"), "Duplicate Room copies the options (separately)");
  await ev(page, "()=>{ const h=rooms.find(r=>r.id===currentRoomId); h.gravButtons['6,8']='right'; }");
  ok(await ev(page, "()=>gravButtonOptAt(6,8)==='right'"), "second room: its own option");
  await ev(page, "()=>activateRoom(rooms[0].id)");
  ok(await ev(page, "()=>gravButtonOptAt(6,8)==='up'"), "switching rooms shows each room's own options");
  await ev(page, "()=>{ gravityEnabled=false; gravityDir='down'; activateRoom(rooms[1].id); gravityEnabled=true; gravityDir='left'; activateRoom(rooms[0].id); }");
  s = await state(page); ok(!s.on && s.dir === "down", "gravity set by a Button stays with its own room");

  // ---- 7. save / load / old save / export ----
  const snap = await ev(page, "()=>JSON.stringify(captureProjectSnapshot())");
  const back = await ev(page, `()=>{ const sn=JSON.parse(${JSON.stringify(snap)}); suppressHistory=true; restoreProjectSnapshot(sn); suppressHistory=false; return [gravButtonOptAt(6,8), gravButtonOptAt(14,8)]; }`);
  ok(back.join() === "up,random", "save -> load keeps the options (" + back + ")");
  const old = await ev(page, `()=>{ const sn=JSON.parse(${JSON.stringify(snap)}); sn.rooms.forEach(r=>delete r.gravButtons); suppressHistory=true; restoreProjectSnapshot(sn); suppressHistory=false; return [gravButtonOptAt(6,8), gravButtonOptAt(14,8), geometryAt(6,8)]; }`);
  ok(old.join() === "toggle,toggle,pushbutton", "an old save (no field) loads as toggle Buttons");
  await ev(page, `()=>{ const sn=JSON.parse(${JSON.stringify(snap)}); suppressHistory=true; restoreProjectSnapshot(sn); suppressHistory=false; activateRoom(rooms[0].id); }`);
  await ev(page, "()=>{ gravityEnabled=false; gravityDir='down'; }");
  const [d] = await Promise.all([page.waitForEvent("download"), page.click("#exportBtn")]);
  const f = path.join(os.tmpdir(), "gb_export.html"); await d.saveAs(f);
  let ex = fs.readFileSync(f, "utf8"); const mark = "requestAnimationFrame(frame);"; const li = ex.lastIndexOf(mark);
  ex = ex.slice(0, li) + "window.__x=f=>eval('('+f+')');" + ex.slice(li);
  const ef = path.join(os.tmpdir(), "gb_export_hooked.html"); fs.writeFileSync(ef, ex);
  const q = await ctx.newPage(); const qerr = []; q.on("pageerror", x => qerr.push(String(x)));
  await q.goto("file://" + ef); await q.waitForTimeout(2500);
  const xo = await q.evaluate(() => window.__x("()=>[gravButtonOptAt(6,8),gravButtonOptAt(14,8),gravButtonOptAt(3,3)]")());
  ok(xo.join() === "up,random,toggle", "export carries the options (" + xo + ")");
  const xs = await q.evaluate(() => window.__x(`()=>{ const p=actors.find(a=>a.isPlayer); p.x=6*TILE+5; p.y=8*TILE+5; p.vx=0; p.vy=0; return 1; }`)());
  await q.waitForTimeout(400);
  const xd = await q.evaluate(() => window.__x("()=>[gravityEnabled,gravityDir]")());
  ok(xd[0] === true && xd[1] === "up", "export: stepping on the up Button points gravity up (" + xd + ")");
  const xr = await q.evaluate(() => window.__x(`()=>{ const p=actors.find(a=>a.isPlayer); p.x=2*TILE+5; p.y=3*TILE+5; return 1; }`)());
  await q.waitForTimeout(700);
  await q.evaluate(() => window.__x(`()=>{ const p=actors.find(a=>a.isPlayer); p.x=14*TILE+5; p.y=8*TILE+5; p.vx=0; p.vy=0; return 1; }`)());
  await q.waitForTimeout(400);
  const xe = await q.evaluate(() => window.__x("()=>gravityDir")());
  ok(xe !== "up", "export: the random Button picks a different direction (" + xe + ")");
  ok(qerr.length === 0, "export: no errors " + qerr.join(";"));
  await q.close();
  ok(errors.length === 0, "no page errors " + errors.slice(0, 3).join(";"));
  await ctx.close(); await browser.close();
  console.log(`\n${pass} passed, ${fails.length} failed`); if (fails.length) { console.log(fails.join("\n")); process.exit(1); }
})();
