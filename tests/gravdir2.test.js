// v2.52 Stage 2 (not deployed): behaviour in all four gravity directions. Usage: node tests/gravdir2.test.js [shotDir]
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const SHOTS = process.argv[2] || os.tmpdir();
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const hook = `window.__ev=f=>eval("("+f+")");
window.__seed=v=>{ let s=v>>>0; Math.random=()=>{ s=(s+0x6D2B79F5)>>>0; let t=s; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; }; };
window.__sim=(n,inputFn)=>{ for(let i=0;i<n;i++){ if(inputFn) inputFn(i); window.__T+=16; window.__seed(Math.round(gameClockMs/16)*7919+1); const q=window.__q.splice(0); for(const cb of q) cb(window.__T); } };
`;
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8"); if (!src.includes(anchor)) throw new Error("anchor");
const FILE = path.join(os.tmpdir(), "gd2_new.html"); fs.writeFileSync(FILE, src.replace(anchor, anchor + hook));
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; console.log("ok  ", m); } else { fails.push(m); console.log("FAIL", m); } };
const FAKE = () => { window.__T = 0; window.__q = []; performance.now = () => window.__T; window.requestAnimationFrame = cb => { window.__q.push(cb); return 1; }; };
const open = async (b, vp) => { const ctx = await b.newContext({ viewport: vp || { width: 1366, height: 700 } }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept()); await page.addInitScript(FAKE);
  await page.goto("file://" + FILE + "#t"); await page.waitForFunction(() => window.__sim); return { ctx, page, errors }; };
const ev = (pg, code) => pg.evaluate(c => window.__ev(c)(), code);
const key = (pg, type, k) => pg.evaluate(([t, k]) => window.dispatchEvent(new KeyboardEvent(t, { key: k, bubbles: true })), [type, k]);
const sim = (pg, n) => pg.evaluate(n => window.__sim(n), n);
const SCENE = (dir, body) => `()=>{ if(appMode==='play') exitToBuildMode(); gameClockMs=0; clearGameTimers(); nextActorInstId=1000; window.__seed(99);
  suppressHistory=true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory=false; gravityEnabled=true; gravityDir='${dir}';
  const put=(x,y,k)=>{ board[y][x]=k; }; const player=(cx,cy)=>{ selectedActorDefId=playerDefId; paintMode='actor'; placeNewActor(cx*TILE+16, cy*TILE+16); };
  const obj=(def,cx,cy)=>placeCarryableActor(def,cx*TILE+16,cy*TILE+16);
  ${body}
  enterPlayMode(); playReadyUntil=null; lastT=window.__T; }`;
const P = "()=>{ const p=actors.find(a=>a.isPlayer); return {x:p.x,y:p.y,vx:p.vx,vy:p.vy,g:p.grounded}; }";

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  // ---- 1. the control table ----
  const TABLE = { down: { L: ["vx", -1], R: ["vx", 1], J: ["vy", -1] }, up: { L: ["vx", 1], R: ["vx", -1], J: ["vy", 1] }, right: { L: ["vy", 1], R: ["vy", -1], J: ["vx", -1] }, left: { L: ["vy", -1], R: ["vy", 1], J: ["vx", 1] } };
  for (const dir of ["down", "up", "right", "left"]) {
    const { ctx, page, errors } = await open(browser);
    await ev(page, SCENE(dir, "player(11,8);"));
    await sim(page, 120);
    const rest = await ev(page, P);
    ok(rest.g, `${dir}: the player lands on its wall (grounded at ${rest.x.toFixed(0)},${rest.y.toFixed(0)})`);
    for (const [name, k] of [["Left", "ArrowLeft"], ["Right", "ArrowRight"]]) {
      await key(page, "keydown", k); await sim(page, 12); const s = await ev(page, P); await key(page, "keyup", k); await sim(page, 40);
      const [ax, sg] = TABLE[dir][name[0]];
      ok(s[ax] * sg > 20, `${dir}: ${name} key pushes ${ax === "vx" ? (sg > 0 ? "screen right" : "screen left") : (sg > 0 ? "screen down" : "screen up")} (${ax} ${s[ax].toFixed(0)})`);
    }
    await sim(page, 30);
    await key(page, "keydown", " "); await sim(page, 3); const j = await ev(page, P); await key(page, "keyup", " ");
    const [ja, js] = TABLE[dir].J;
    ok(j[ja] * js > 150, `${dir}: Jump goes ${ja === "vx" ? (js > 0 ? "screen right" : "screen left") : (js > 0 ? "screen down" : "screen up")}, away from the surface (${ja} ${j[ja].toFixed(0)})`);
    ok(errors.length === 0, `${dir}: no errors ` + errors.join(";")); await ctx.close();
  }
  // ---- 2. a flip in mid-air with a key held: "Right" keeps meaning the character's right ----
  {
    const { ctx, page } = await open(browser);
    await ev(page, SCENE("down", "player(11,3);")); await key(page, "keydown", "ArrowRight"); await sim(page, 25);
    const a = await ev(page, P); await ev(page, "()=>{ setGravityDir('up'); }"); await sim(page, 4); const b = await ev(page, P); await sim(page, 40); const c = await ev(page, P);
    ok(a.vx > 100 && !a.g, `mid-air flip: before it, holding Right runs right while falling (vx ${a.vx.toFixed(0)})`);
    ok(c.vx < b.vx - 50 && c.vx < 0, `mid-air flip: after it, the same held Right now pushes screen-left (vx ${b.vx.toFixed(0)} -> ${c.vx.toFixed(0)})`);
    await ev(page, "()=>{ setGravityDir('right'); }"); await sim(page, 30); const d = await ev(page, P);
    ok(d.vy < 0, `mid-air flip to right gravity: held Right now pushes screen-up (vy ${d.vy.toFixed(0)})`);
    await key(page, "keyup", "ArrowRight"); await ctx.close();
  }
  // ---- 3. characters walk the other axis: chaser and wanderer in left gravity ----
  {
    const { ctx, page, errors } = await open(browser);
    await ev(page, SCENE("left", "const ch=findDefaultActorDef('chaser'); actorDefs[ch].lethal=false; const wa=findDefaultActorDef('wanderer'); actorDefs[wa].lethal=false; player(1,14); obj(ch,1,2); obj(wa,1,8);"));
    // objects placed with placeCarryableActor are plain bodies; make them real characters by id
    await ev(page, "()=>{ const ch=findDefaultActorDef('chaser'), wa=findDefaultActorDef('wanderer'); const a=actors.filter(x=>!x.isPlayer); a[0].defId=ch; a[1].defId=wa; }");
    await sim(page, 20);
    const y0 = await ev(page, "()=>actors.map(a=>[a.x,a.y])");
    await sim(page, 150);
    const s = await ev(page, "()=>actors.map(a=>({x:a.x,y:a.y,vy:a.vy,vx:a.vx,g:a.grounded}))");
    ok(s[1].y > y0[1][1] + 60, `left gravity: the chaser walks down the wall toward the player (y ${y0[1][1].toFixed(0)} -> ${s[1].y.toFixed(0)})`);
    ok(s[1].g && s[1].x < 40, `left gravity: the chaser stays on the left wall (x ${s[1].x.toFixed(1)})`);
    await sim(page, 300); const w = await ev(page, "()=>{ const a=actors.filter(x=>!x.isPlayer)[1]; return [a.x,a.y,a.grounded]; }");
    ok(w[2] && w[0] < 40, `left gravity: the wanderer stays on the wall while it wanders along it (x ${w[0].toFixed(1)}, y ${w[1].toFixed(0)})`);
    ok(errors.length === 0, "no errors " + errors.join(";")); await ctx.close();
  }
  // ---- 4. carry, drop and throw on a wall ----
  {
    const { ctx, page, errors } = await open(browser);
    await ev(page, SCENE("left", "player(1,9); obj(PUSHABLE_DEF_ID,1,11);")); await sim(page, 90);
    await ev(page, "()=>{ const p=actors.find(a=>a.isPlayer), c=actors.find(a=>!a.isPlayer); c.y = p.y + 30; c.x = p.x; c.vx=0; c.vy=0; }"); await sim(page, 3);
    await key(page, "keydown", "e"); await key(page, "keyup", "e"); await sim(page, 3);
    const g = await ev(page, "()=>{ const p=actors.find(a=>a.isPlayer), c=actors.find(a=>!a.isPlayer); return {carrying:p.carrying===c.id, dx:c.x-(p.x+p.w), dy:(c.y+c.h/2)-(p.y+p.h/2)}; }");
    ok(g.carrying, "left gravity: E grabs the crate");
    ok(g.dx > 0 && g.dx < 10 && Math.abs(g.dy) < 2, `left gravity: the carried crate rides on the side away from the wall (dx ${g.dx.toFixed(1)}, dy ${g.dy.toFixed(1)})`);
    await key(page, "keydown", "ArrowRight"); await sim(page, 25); await key(page, "keyup", "ArrowRight");
    const walked = await ev(page, "()=>{ const p=actors.find(a=>a.isPlayer), c=actors.find(a=>!a.isPlayer); return {py:p.y, cy:c.y, face:p.facingDir}; }");
    ok(Math.abs(walked.cy - walked.py) < 30 && walked.face === 1, `left gravity: Right walks down the wall with the crate following (face ${walked.face})`);
    await key(page, "keydown", "e"); await sim(page, 40); await key(page, "keyup", "e"); await sim(page, 4);
    const t = await ev(page, "()=>{ const c=actors.find(a=>!a.isPlayer); return {vx:c.vx, vy:c.vy}; }");
    ok(t.vy > 100 && t.vx > 0, `left gravity: a throw goes the way the character faces (down the wall) and arcs out from it (vx ${t.vx.toFixed(0)}, vy ${t.vy.toFixed(0)})`);
    await sim(page, 120); const l = await ev(page, "()=>{ const c=actors.find(a=>!a.isPlayer); return {x:c.x, g:c.grounded}; }");
    ok(l.g && l.x < 40, `left gravity: the thrown crate comes to rest back on the wall (x ${l.x.toFixed(1)})`);
    ok(errors.length === 0, "no errors " + errors.join(";")); await ctx.close();
  }
  // ---- 5. a spawner's content falls to the wall ----
  {
    const { ctx, page, errors } = await open(browser);
    await ev(page, SCENE("right", "put(12,9,'spawner-e:none'); spawnerContents[roomCellKey(currentRoomId,12,9)]=PUSHABLE_DEF_ID; player(20,4);"));
    await sim(page, 330);
    const c = await ev(page, "()=>actors.filter(a=>!a.isPlayer).map(a=>({x:a.x,w:a.w,g:a.grounded,y:a.y}))");
    ok(c.length >= 1 && c.some(a => a.g && a.x + a.w > 767) && c.every(a => a.x > 380), `right gravity: of ${c.length} spawned crate(s), the first has fallen to the right wall and rests there, none stuck beside the spawner`);
    ok(errors.length === 0, "no errors " + errors.join(";")); await ctx.close();
  }
  // ---- 6. a fan blowing against gravity ----
  {
    const { ctx, page } = await open(browser);
    await ev(page, SCENE("right", "put(20,9,'fan-n:none'); obj(PUSHABLE_DEF_ID,18,9); player(2,4);"));
    await sim(page, 60); const f = await ev(page, "()=>{ const c=actors.find(a=>!a.isPlayer); return {x:c.x, vx:c.vx}; }");
    ok(f.x < 18 * 32 + 5, `right gravity: a fan blowing away from the wall keeps a crate off it (crate x ${f.x.toFixed(0)}, started ${18 * 32 + 5})`);
    const rest = await ev(page, "()=>fanAccelFor(actors.find(a=>!a.isPlayer))");
    ok(rest.ax < 0, `right gravity: the fan's push points away from the wall (ax ${rest.ax.toFixed(0)})`);
    await ctx.close();
  }
  // ---- 7. wrap: falling through the wall comes back round ----
  {
    const { ctx, page, errors } = await open(browser);
    await ev(page, SCENE("left", "wrapHEnabled=true; obj(PUSHABLE_DEF_ID,10,9); player(10,14);"));
    const xs = []; for (let i = 0; i < 60; i++) { await sim(page, 5); xs.push(await ev(page, "()=>actors.filter(a=>!a.isPlayer)[0].x")); }
    let wraps = 0; for (let i = 1; i < xs.length; i++) if (xs[i] > xs[i - 1] + 300) wraps++;
    ok(wraps >= 1, `left gravity with h-wrap: a falling crate keeps coming round (${wraps} wraps in 5s, falling the whole time)`);
    ok(errors.length === 0, "no errors " + errors.join(";")); await ctx.close();
  }
  // ---- 8. camera: a Follow room with right gravity ----
  {
    const { ctx, page } = await open(browser);
    await ev(page, SCENE("right", "cameraMode='follow'; board.forEach(r=>{}); player(5,9);"));
    await sim(page, 200); const cm = await ev(page, "()=>({cam:cameraX, px:actors.find(a=>a.isPlayer).x, max:Math.max(0,roomCols()*TILE-COLS*TILE)})");
    ok(cm.px > 1500 && cm.cam > cm.max - 140, `right gravity, Follow camera: it follows the player to the far wall (player x ${cm.px.toFixed(0)}, camera ${cm.cam.toFixed(0)} of ${cm.max})`);
    await ctx.close();
  }
  // ---- 9. pictures: all four directions in Build and Play ----
  for (const dir of ["down", "up", "right", "left"]) {
    const { ctx, page } = await open(browser);
    const body = `for(let x=0;x<24;x++){ put(x,17,'solid:none'); put(x,0,'solid:none'); } for(let y=0;y<18;y++){ put(0,y,'solid:none'); put(23,y,'solid:none'); }
      for(let i=0;i<5;i++){ put(5+i,12,'solid:none'); put(14+i,6,'solid:none'); put(11,13+i%3,'solid:none'); }
      put(9,11,'trampoline:none'); put(12,3,'solid:bouncy'); put(13,3,'solid:bouncy');
      player(7,11); obj(PUSHABLE_DEF_ID,15,5); obj(PUSHABLE_DEF_ID,15,4); obj(CARRY_BOMB2_DEF_ID,6,8); const wa=findDefaultActorDef('wanderer'); actorDefs[wa].lethal=false; const w=obj(PUSHABLE_DEF_ID,17,5); w.defId=wa;`;
    await ev(page, SCENE(dir, body)); await sim(page, 90);
    await page.screenshot({ path: path.join(SHOTS, `gravdir2_${dir}_play.png`) });
    await ev(page, "()=>{ exitToBuildMode(); }"); await sim(page, 50);
    await page.screenshot({ path: path.join(SHOTS, `gravdir2_${dir}_build.png`) });
    await ctx.close();
  }
  await browser.close();
  console.log(`\n${pass} passed, ${fails.length} failed`); if (fails.length) { console.log(fails.join("\n")); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
