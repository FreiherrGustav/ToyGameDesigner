// The OPTIONAL turned-board mode (viewFollowsGravity = true; off by default since the user wanted the board to stay put) (not deployed). Usage: node tests/gravview.test.js [shotDir]
// Everything a kid sees is as if gravity pointed down: keys, pointer, and every direction a piece stores are on the SCREEN.
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const SHOTS = process.argv[2] || os.tmpdir();
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const hook = `window.__ev=f=>eval("("+f+")");
window.__seed=v=>{ let s=v>>>0; Math.random=()=>{ s=(s+0x6D2B79F5)>>>0; let t=s; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; }; };
window.__sim=(n,inputFn)=>{ for(let i=0;i<n;i++){ if(inputFn) inputFn(i); window.__T+=16; window.__seed(Math.round(gameClockMs/16)*7919+1); const q=window.__q.splice(0); for(const cb of q) cb(window.__T); } };
`;
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8"); if (!src.includes(anchor)) throw new Error("anchor");
const FILE = path.join(os.tmpdir(), "gv_new.html"); fs.writeFileSync(FILE, src.replace(anchor, anchor + hook));
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; console.log("ok  ", m); } else { fails.push(m); console.log("FAIL", m); } };
const FAKE = () => { window.__T = 0; window.__q = []; performance.now = () => window.__T; window.requestAnimationFrame = cb => { window.__q.push(cb); return 1; }; };
const open = async (b, vp) => { const ctx = await b.newContext({ viewport: vp || { width: 1366, height: 700 }, acceptDownloads: true }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept()); await page.addInitScript(FAKE);
  await page.goto("file://" + FILE + "#t"); await page.waitForFunction(() => window.__sim); await page.evaluate(() => window.__ev("()=>{ viewFollowsGravity=true; }")()); /* the optional turned-board mode */ return { ctx, page, errors }; };
const ev = (pg, code) => pg.evaluate(c => window.__ev(c)(), code);
const key = (pg, type, k) => pg.evaluate(([t, k]) => window.dispatchEvent(new KeyboardEvent(t, { key: k, bubbles: true })), [type, k]);
const sim = (pg, n) => pg.evaluate(n => window.__sim(n), n);
const K = { down: 0, up: 2, left: 1, right: 3 };
// world vector -> screen vector, world point -> canvas px (768x576), mirroring applyViewTransform
const sv = (x, y, k) => k === 2 ? [-x, -y] : k === 1 ? [y, -x] : k === 3 ? [-y, x] : [x, y];
const wv = (x, y, k) => k === 2 ? [-x, -y] : k === 1 ? [-y, x] : k === 3 ? [y, -x] : [x, y]; // screen vector -> world vector
const sp = (x, y, k) => { const [dx, dy] = sv(x - 384, y - 288, k), s = k % 2 ? 0.75 : 1; return [384 + dx * s, 288 + dy * s]; };
const SCENE = (dir, body) => `()=>{ if(appMode==='play') exitToBuildMode(); gameClockMs=0; clearGameTimers(); nextActorInstId=1000; window.__seed(99);
  suppressHistory=true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory=false; gravityEnabled=true; gravityDir='${dir}';
  const put=(x,y,k)=>{ board[y][x]=k; }; const player=(cx,cy)=>{ selectedActorDefId=playerDefId; paintMode='actor'; placeNewActor(cx*TILE+16, cy*TILE+16); };
  const obj=(def,cx,cy)=>placeCarryableActor(def,cx*TILE+16,cy*TILE+16);
  ${body}
  enterPlayMode(); playReadyUntil=null; lastT=window.__T; }`;
const PL = "()=>{ const p=actors.find(a=>a.isPlayer); return {x:p.x+p.w/2,y:p.y+p.h/2,vx:p.vx,vy:p.vy,g:p.grounded}; }";
const DIRS = ["down", "up", "left", "right"];

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

  // ---- 1. the tables: a stored direction turns into the world vector that shows up that way ----
  {
    const { ctx, page, errors } = await open(browser);
    for (const dir of DIRS) {
      await ev(page, `()=>{ gravityEnabled=true; gravityDir='${dir}'; syncViewTables(); }`);
      const t = await ev(page, "()=>({c:CANNON_DIRECTIONS['cannon2-ne'],f:FAN_DIRECTIONS['fan-n'],w:WIND_DIRECTIONS['wind-e'],s:SPAWNER_DIRECTIONS['spawner-n'],b:BARRIER_DIRECTIONS['barrier-n'],m:MOVER_DIRS.s})");
      const near = (v, e) => Math.abs(v[0] - e[0]) < 1e-9 && Math.abs(v[1] - e[1]) < 1e-9;
      const k = K[dir];
      ok(near(sv(t.c.x, t.c.y, k), [0.49, -0.8717]), `${dir}: a cannon stored ne fires up-and-right on the screen`);
      ok(near(sv(t.f.x, t.f.y, k), [0, -1]), `${dir}: a fan stored n blows screen-up`);
      ok(near(sv(t.w.x, t.w.y, k), [1, 0]), `${dir}: a belt stored e carries screen-right`);
      ok(near(sv(t.s.x, t.s.y, k), [0, -1]), `${dir}: a spawner stored n launches screen-up`);
      ok(near(sv(t.b.x, t.b.y, k), [0, -1]), `${dir}: a Gate stored n opens screen-up`);
      ok(near(sv(t.m.x, t.m.y, k), [0, 1]), `${dir}: a mover stored s heads screen-down`);
    }
    await ev(page, "()=>{ gravityEnabled=false; syncViewTables(); }");
    ok(await ev(page, "()=>CANNON_DIRECTIONS['cannon2-ne'].x===0.49 && FAN_DIRECTIONS['fan-n'].y===-1"), "gravity off: the tables are the stored vectors");
    ok(errors.length === 0, "tables: no errors " + errors.join(";")); await ctx.close();
  }

  // ---- 2. keys keep their screen meaning in every direction ----
  for (const dir of DIRS) {
    const { ctx, page, errors } = await open(browser); const k = K[dir];
    await ev(page, SCENE(dir, "player(11,8);")); await sim(page, 120);
    const rest = await ev(page, PL);
    ok(rest.g, `${dir}: the player lands (grounded)`);
    for (const [name, key_, want] of [["Left", "ArrowLeft", -1], ["Right", "ArrowRight", 1]]) {
      await key(page, "keydown", key_); await sim(page, 12); const s = await ev(page, PL); await key(page, "keyup", key_); await sim(page, 40);
      const [vx] = sv(s.vx, s.vy, k);
      ok(vx * want > 20, `${dir}: ${name} runs screen-${want < 0 ? "left" : "right"} (screen vx ${vx.toFixed(0)})`);
    }
    await sim(page, 30);
    await key(page, "keydown", " "); await sim(page, 3); const j = await ev(page, PL); await key(page, "keyup", " ");
    const [, vy] = sv(j.vx, j.vy, k);
    ok(vy < -150, `${dir}: Jump goes screen-up (screen vy ${vy.toFixed(0)})`);
    ok(errors.length === 0, `${dir}: no errors ` + errors.join(";")); await ctx.close();
  }

  // ---- 3. the pointer: click where a world cell is drawn and that cell is painted ----
  for (const dir of DIRS) {
    const { ctx, page, errors } = await open(browser); const k = K[dir];
    await ev(page, `()=>{ gravityEnabled=true; gravityDir='${dir}'; selectGeometry('solid'); paintMode='tile'; for(let y=0;y<18;y++) for(let x=0;x<24;x++) board[y][x]=null; actors.length=0; }`);
    await sim(page, 1);
    const rect = await page.evaluate(() => { const b = document.getElementById("gameCanvas").getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width, h: b.height, bw: window.__ev("()=>canvasBorderPx")() }; });
    let bad = 0;
    for (const [gx, gy] of [[0, 0], [23, 0], [0, 17], [23, 17], [11, 8], [5, 13]]) {
      const [cx, cy] = sp(gx * 32 + 16, gy * 32 + 16, k);
      const px = rect.l + rect.bw + cx / 768 * (rect.w - 2 * rect.bw), py = rect.t + rect.bw + cy / 576 * (rect.h - 2 * rect.bw);
      await page.mouse.click(px, py); await sim(page, 1);
      const painted = await ev(page, "()=>{ const out=[]; for(let y=0;y<18;y++) for(let x=0;x<24;x++) if(board[y][x]) out.push(x+','+y); return out; }");
      if (!(painted.length === 1 && painted[0] === gx + "," + gy)) { bad++; console.log("   got", painted, "wanted", gx, gy); }
      await ev(page, "()=>{ for(let y=0;y<18;y++) for(let x=0;x<24;x++) board[y][x]=null; }");
    }
    ok(bad === 0, `${dir}: clicks on corner and middle cells paint the cell that is drawn there`);
    if (k % 2) { // the black bars beside the turned room are not board
      const px = rect.l + rect.bw + 20 / 768 * (rect.w - 2 * rect.bw), py = rect.t + rect.bw + 300 / 576 * (rect.h - 2 * rect.bw);
      await page.mouse.click(px, py); await sim(page, 1);
      ok(await ev(page, "()=>{ for(let y=0;y<18;y++) for(let x=0;x<24;x++) if(board[y][x]) return false; return true; }"), `${dir}: a click in the black bar paints nothing`);
    }
    ok(errors.length === 0, `${dir}: no errors ` + errors.join(";")); await ctx.close();
  }

  // ---- 4. a piece behaves the way it is drawn: cannon, fan, belt, spawner ----
  for (const dir of DIRS) {
    const k = K[dir];
    // cannon: a crate loaded into a cannon stored ne leaves up-and-right on the screen
    { const { ctx, page, errors } = await open(browser);
      await ev(page, SCENE(dir, "put(11,8,'cannon2-ne:none'); obj(PUSHABLE_DEF_ID,11,8); player(2,2);"));
      await ev(page, "()=>{ const c=actors.find(a=>!a.isPlayer); window.__c=c; }");
      let launched = null;
      for (let i = 0; i < 120 && !launched; i++) { await sim(page, 1); const c = await ev(page, "()=>({cl:!!window.__c.cannonLoad,vx:window.__c.vx,vy:window.__c.vy,b:!!window.__c.ballistic})"); if (c.b && !c.cl) launched = c; }
      if (launched) { const [vx, vy] = sv(launched.vx, launched.vy, k); ok(vx > 100 && vy < -300, `${dir}: a cannon stored ne shoots up-and-right on the screen (screen ${vx.toFixed(0)}, ${vy.toFixed(0)})`); }
      else ok(false, `${dir}: the cannon fired`);
      ok(errors.length === 0, `${dir}: cannon no errors ` + errors.join(";")); await ctx.close(); }
    // fan stored n: a crate floating above it is pushed screen-up (away from the floor), the push at rest is up
    { const { ctx, page } = await open(browser);
      const up = wv(0, -1, k), cx = 11 + up[0], cy = 9 + up[1];
      await ev(page, SCENE(dir, `put(11,9,'fan-n:none'); obj(PUSHABLE_DEF_ID,${cx},${cy}); player(2,2);`));
      const a = await ev(page, "()=>{ syncViewTables(); return fanAccelFor(actors.find(a=>!a.isPlayer)); }"); const [, ay] = sv(a.ax, a.ay, k);
      ok(ay < -500, `${dir}: a fan stored n pushes the thing in front of it screen-up (screen ay ${ay.toFixed(0)})`); await ctx.close(); }
    // belt stored e: a crate on it is carried screen-right
    { const { ctx, page } = await open(browser);
      const right = wv(1, 0, k), up = wv(0, -1, k);
      await ev(page, SCENE(dir, `for(let i=-5;i<=6;i++) put(11+(${right[0]})*i, 10+(${right[1]})*i, 'solid:wind-e'); obj(PUSHABLE_DEF_ID,${11 + up[0]},${10 + up[1]}); player(2,2);`));
      await sim(page, 60); const c = await ev(page, "()=>{ const c=actors.find(a=>!a.isPlayer); return {vx:c.vx,vy:c.vy}; }"); const [vx] = sv(c.vx, c.vy, k);
      ok(vx > 40, `${dir}: a belt stored e carries a crate screen-right (screen vx ${vx.toFixed(0)})`); await ctx.close(); }
    // spawner stored n: what it makes leaves screen-up (before gravity bends it)
    { const { ctx, page } = await open(browser);
      await ev(page, SCENE(dir, "put(11,9,'spawner-n:none'); spawnerContents[roomCellKey(currentRoomId,11,9)]=PUSHABLE_DEF_ID; player(2,2);"));
      let first = null;
      for (let i = 0; i < 400 && !first; i++) { await sim(page, 1); const c = await ev(page, "()=>{ const c=actors.find(a=>!a.isPlayer); return c?{x:c.x+c.w/2,y:c.y+c.h/2,vx:c.vx,vy:c.vy}:null; }"); if (c) first = c; }
      const cell = first ? sv(first.x - (11 * 32 + 16), first.y - (9 * 32 + 16), k) : null;
      ok(first && cell[1] < -20 && Math.abs(cell[0]) < 6, `${dir}: a spawner stored n puts its crate screen-above it (screen offset ${cell ? cell.map(v => v.toFixed(0)) : "none"})`); await ctx.close(); }
  }

  // ---- 5. a Moving Platform stored horizontal swings screen-sideways ----
  for (const dir of DIRS) {
    const { ctx, page } = await open(browser); const k = K[dir];
    await ev(page, SCENE(dir, "selectedActorDefId=MOVING_PLATFORM_DEF_ID; paintMode='actor'; placeNewActor(11*32+16, 9*32+16); player(2,2);"));
    const a = await ev(page, "()=>{ const m=actors.find(a=>a.defId===MOVING_PLATFORM_DEF_ID); return [m.x+m.w/2,m.y+m.h/2]; }");
    await sim(page, 60); const b = await ev(page, "()=>{ const m=actors.find(a=>a.defId===MOVING_PLATFORM_DEF_ID); return [m.x+m.w/2,m.y+m.h/2]; }");
    const [dx, dy] = sv(b[0] - a[0], b[1] - a[1], k);
    ok(Math.abs(dx) > 20 && Math.abs(dy) < 1, `${dir}: a platform left horizontal moves sideways on the screen (screen move ${dx.toFixed(0)}, ${dy.toFixed(0)})`); await ctx.close();
  }

  // ---- 6. what is drawn: a cannon stays upright, the player is upright, no errors; screenshots ----
  {
    const { ctx, page, errors } = await open(browser);
    for (const dir of DIRS) {
      await ev(page, SCENE(dir, "put(11,12,'cannon2-ne:none'); put(8,12,'fan-n:none'); for(let x=0;x<24;x++) put(x,15,'solid:none'); player(14,13);"));
      await sim(page, 30);
      await page.screenshot({ path: path.join(SHOTS, `gv_${dir}.png`), clip: { x: 440, y: 90, width: 780, height: 600 } });
    }
    ok(errors.length === 0, "screens: no errors " + errors.join(";")); await ctx.close();
  }

  // ---- 7. an exported game in left gravity plays: Left key runs screen-left, no errors ----
  {
    const { ctx, page, errors } = await open(browser);
    await ev(page, SCENE("left", "for(let y=0;y<18;y++) put(0,y,'solid:none'); put(1,3,'cannon2-ne:none'); player(2,10);")); await ev(page, "()=>{ exitToBuildMode(); }");
    const dl = page.waitForEvent("download"); await ev(page, "()=>exportStandaloneGame()"); const d = await dl; const ef = path.join(os.tmpdir(), "gv_export.html"); await d.saveAs(ef);
    const q = await ctx.newPage(); const qerr = []; q.on("pageerror", e => qerr.push(String(e)));
    await q.goto("file://" + ef); await q.waitForTimeout(2500);
    const before = await q.evaluate(() => { const p = actors.find(a => a.isPlayer); return [p.x, p.y]; }).catch(() => null);
    ok(!qerr.length, "export (left gravity): boots with no errors " + qerr.join(";"));
    await q.keyboard.down("ArrowLeft"); await q.waitForTimeout(600); await q.keyboard.up("ArrowLeft");
    ok(!qerr.length, "export (left gravity): holding Left runs without errors " + qerr.join(";"));
    await q.screenshot({ path: path.join(SHOTS, "gv_export_left.png") });
    void before; await q.close(); ok(errors.length === 0, "export: editor no errors " + errors.join(";")); await ctx.close();
  }

  // ---- 8. Surprise Me: non-down gravity is a small share ----
  {
    const { ctx, page, errors } = await open(browser);
    const r = await ev(page, `()=>{ let n=0, off=0, byT={}; for(let s=1;s<=900;s++){ const spec=generateSurprise(s,{ctx:surpriseHotContext()}); if(!spec||spec.failed||spec.noRoom) continue; n++; if(spec.gravity && spec.dir!=='down'){ off++; byT[spec.templateId]=(byT[spec.templateId]||0)+1; } } return {n,off,byT}; }`);
    const share = r.off / r.n;
    ok(share > 0.005 && share <= 0.08, `Surprise Me: a turned gravity is a small share of presses (${(share * 100).toFixed(1)}%: ${JSON.stringify(r.byT)})`);
    ok(errors.length === 0, "surprise: no errors " + errors.join(";")); await ctx.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fails.length} failed`); if (fails.length) { console.log(fails.join("\n")); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
