// v2.52 Stage 1 (not deployed): gravity direction UI, persistence, indicator, export, crispness. Usage: node tests/gravdir_ui.test.js [shotDir]
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const REPO = path.join(__dirname, "..");
const SHOTS = process.argv[2] || os.tmpdir();
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const hook = `window.__ev=f=>eval("("+f+")");
window.__sim=(n,inputFn)=>{ for(let i=0;i<n;i++){ if(inputFn) inputFn(i); window.__T+=16; const q=window.__q.splice(0); for(const cb of q) cb(window.__T); } };
`;
const srcFile = path.join(REPO, "index.html");
const src = fs.readFileSync(srcFile, "utf8"); if (!src.includes(anchor)) throw new Error("anchor");
const NEW = path.join(os.tmpdir(), "gdui_new.html"); fs.writeFileSync(NEW, src.replace(anchor, anchor + hook));
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; console.log("ok  ", m); } else { fails.push(m); console.log("FAIL", m); } };
const FAKE = () => { window.__T = 0; window.__q = []; performance.now = () => window.__T; window.requestAnimationFrame = cb => { window.__q.push(cb); return 1; }; };
const open = async (b, opt = {}) => {
  const ctx = await b.newContext({ viewport: opt.vp || { width: 1366, height: 700 }, deviceScaleFactor: opt.dpr || 1, acceptDownloads: true });
  const page = await ctx.newPage(); const errors = []; page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept());
  await page.addInitScript(FAKE);
  await page.goto("file://" + NEW + "#t"); await page.waitForFunction(() => window.__sim);
  return { ctx, page, errors };
};
const ev = (pg, code) => pg.evaluate(c => window.__ev(c)(), code);
const key = (pg, type, k) => pg.evaluate(([t, k]) => window.dispatchEvent(new KeyboardEvent(t, { key: k, bubbles: true })), [type, k]);

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  let { ctx, page, errors } = await open(browser);
  // ---- 1. the rule buttons ----
  ok(await ev(page, "()=>document.getElementById('gravityDirRow').style.display==='none'"), "direction buttons hidden while gravity is off");
  await page.click("#gameRuleSwatches .swatch:nth-child(1)");
  ok(await ev(page, "()=>gravityEnabled===true && document.getElementById('gravityDirRow').style.display!=='none'"), "turning gravity on shows the four direction buttons");
  const btns = await ev(page, "()=>[...document.querySelectorAll('#gravityDirRow .swatch')].map(s=>[s.dataset.dir,s.title,s.style.opacity])");
  ok(btns.length === 4 && btns.map(b => b[0]).join() === "down,up,left,right", "four buttons: down, up, left, right");
  ok(btns[0][2] === "1" && btns[1][2] === "1" && +btns[2][2] < 1 && +btns[3][2] < 1, "left and right are shown dimmed (next stage)");
  ok(await ev(page, "()=>gravityDir==='down'"), "default direction is down");
  await page.click("#gravityDirRow .swatch[data-dir=up]");
  ok(await ev(page, "()=>gravityDir==='up'"), "clicking the up button applies instantly");
  await page.click("#gravityDirRow .swatch[data-dir=left]");
  ok(await ev(page, "()=>gravityDir==='up'"), "a dimmed (not yet available) button does nothing");
  // ---- 2. a real scene: build, then Play, with the indicator ----
  await ev(page, `()=>{ for(let x=0;x<24;x++) board[0][x]='solid:none'; for(let x=0;x<24;x++) board[17][x]='solid:none'; for(let x=6;x<12;x++) board[5][x]='solid:none';
    selectedActorDefId=playerDefId; paintMode='actor'; placeNewActor(4*TILE+16, 15*TILE+16);
    placeCarryableActor(PUSHABLE_DEF_ID, 9*TILE+16, 10*TILE); placeCarryableActor(PUSHABLE_DEF_ID, 9*TILE+16, 12*TILE); }`);
  await page.evaluate(() => window.__sim(120));
  ok(await ev(page, "()=>{ const p=actors.find(a=>a.isPlayer); return p.grounded && Math.abs(p.y-TILE)<0.5; }"), "Build: the player falls up and stands under the ceiling row");
  ok(await ev(page, "()=>document.getElementById('gravIndicator').style.display==='none'"), "indicator hidden in Build");
  await page.screenshot({ path: path.join(SHOTS, "gravdir_up_build.png") });
  await page.click("#modePlayBtn"); await page.evaluate(() => window.__sim(150));
  ok(await ev(page, "()=>appMode==='play'"), "Play entered");
  ok(await ev(page, "()=>{const e=document.getElementById('gravIndicator'); return e.style.display!=='none' && e.textContent==='↑' && Math.abs(e.getBoundingClientRect().width-e.getBoundingClientRect().height)<0.5 && e.getBoundingClientRect().width>=20;}"), "Play: a fixed-size ↑ indicator shows in the status strip");
  await key(page, "keydown", "ArrowRight"); await page.evaluate(() => window.__sim(40)); await key(page, "keyup", "ArrowRight");
  const px = await ev(page, "()=>actors.find(a=>a.isPlayer).x");
  ok(px < 4 * TILE_C() , "Play: the Right key moves the upside-down player to the screen's left (x " + px.toFixed(0) + ")");
  function TILE_C() { return 32 * 4; }
  const y0 = await ev(page, "()=>actors.find(a=>a.isPlayer).y");
  await key(page, "keydown", " "); await page.evaluate(() => window.__sim(8)); await key(page, "keyup", " ");
  const y1 = await ev(page, "()=>actors.find(a=>a.isPlayer).y");
  ok(y1 > y0 + 8, "Play: Jump pushes the player down the screen, away from the ceiling (y " + y0.toFixed(0) + " -> " + y1.toFixed(0) + ")");
  await page.evaluate(() => window.__sim(60));
  await page.screenshot({ path: path.join(SHOTS, "gravdir_up_play.png") });
  await ev(page, "()=>{ exitToBuildMode(); }");
  // ---- 3. persistence ----
  const snap = await ev(page, "()=>{ snapshotCurrentRoomState(); return JSON.parse(JSON.stringify(captureProjectSnapshot())); }");
  ok(snap.rooms[0].gravityDir === "up", "snapshot stores gravityDir up");
  await ev(page, "()=>{ gravityDir='down'; }");
  await page.evaluate(s => window.__ev("(s)=>{ suppressHistory=true; restoreProjectSnapshot(structuredClone(s)); suppressHistory=false; }")(s), snap);
  ok(await ev(page, "()=>gravityDir==='up' && gravityEnabled"), "JSON round trip restores up");
  const old = JSON.parse(JSON.stringify(snap)); old.rooms.forEach(r => delete r.gravityDir);
  await page.evaluate(s => window.__ev("(s)=>{ suppressHistory=true; restoreProjectSnapshot(structuredClone(s)); suppressHistory=false; }")(s), old);
  ok(await ev(page, "()=>gravityDir==='down'"), "an old save (no gravityDir) loads as down");
  const bad = JSON.parse(JSON.stringify(snap)); bad.rooms.forEach(r => r.gravityDir = "sideways");
  await page.evaluate(s => window.__ev("(s)=>{ suppressHistory=true; restoreProjectSnapshot(structuredClone(s)); suppressHistory=false; }")(s), bad);
  ok(await ev(page, "()=>gravityDir==='down'"), "an unknown direction loads as down");
  await page.evaluate(s => window.__ev("(s)=>{ suppressHistory=true; restoreProjectSnapshot(structuredClone(s)); suppressHistory=false; }")(s), snap);
  // two rooms with different directions, room switch and duplicate
  const rs = await ev(page, `()=>{ const r1=currentRoomId; duplicateRoom(); const r2=currentRoomId; setGravityDir('down'); activateRoom(r1); const a=gravityDir; activateRoom(r2); const b=gravityDir; return [a,b,rooms.length]; }`);
  ok(rs[0] === "up" && rs[1] === "down", "each room keeps its own direction across room switches (duplicate copies it, then it changes independently): " + rs.join());
  // Play snapshot round trip: exit restores the Build direction
  await ev(page, "()=>{ activateRoom(rooms[0].id); enterPlayMode(); }");
  await page.evaluate(() => window.__sim(10));
  await ev(page, "()=>{ exitToBuildMode(); }");
  ok(await ev(page, "()=>gravityDir==='up'"), "Play -> Build keeps the direction");
  // ---- 4. exported game ----
  await ev(page, "()=>{ activateRoom(rooms[0].id); }");
  const [d] = await Promise.all([page.waitForEvent("download"), page.click("#exportBtn")]);
  const f = path.join(os.tmpdir(), "gdui_export.html"); await d.saveAs(f);
  let ex = fs.readFileSync(f, "utf8"); const mark = "requestAnimationFrame(frame);"; const li = ex.lastIndexOf(mark);
  ok(li > 0, "export has the frame loop"); ex = ex.slice(0, li) + "window.__x=f=>eval('('+f+')');" + ex.slice(li);
  const ef = path.join(os.tmpdir(), "gdui_export_hooked.html"); fs.writeFileSync(ef, ex);
  const q = await ctx.newPage(); const qerr = []; q.on("pageerror", x => qerr.push(String(x)));
  await q.goto("file://" + ef); await q.waitForTimeout(2800);
  const e1 = await q.evaluate(() => window.__x("()=>({dir:gravityDir,sign:gravSign(),y:actors.find(a=>a.isPlayer).y,gr:actors.find(a=>a.isPlayer).grounded})")());
  ok(e1.dir === "up" && e1.sign === -1, "export: the room's direction is carried (" + JSON.stringify(e1) + ")");
  ok(e1.gr && Math.abs(e1.y - 32) < 0.6, "export: the player stands under the ceiling");
  await q.keyboard.down("ArrowRight"); await q.waitForTimeout(500); await q.keyboard.up("ArrowRight");
  const e2 = await q.evaluate(() => window.__x("()=>actors.find(a=>a.isPlayer).x")());
  ok(e2 < 4 * 32, "export: Right moves the player to the screen's left (x " + e2.toFixed(0) + ")");
  await q.keyboard.down(" "); await q.waitForTimeout(150); await q.keyboard.up(" ");
  const e3 = await q.evaluate(() => window.__x("()=>actors.find(a=>a.isPlayer).y")());
  ok(e3 > 40, "export: Jump goes down the screen (y " + e3.toFixed(0) + ")");
  ok(qerr.length === 0, "export: no errors " + qerr.join(";"));
  await q.close();
  ok(errors.length === 0, "no page errors " + errors.slice(0, 3).join(";"));
  await ctx.close();

  // ---- 5. crispness: the turned-over character is the vertical mirror of the upright one, pixel for pixel ----
  for (const dpr of [1, 1.5, 2]) {
    const r = await open(browser, { dpr });
    const res = await r.page.evaluate(() => {
      const draw = (dir) => {
        window.__ev("()=>{ suppressHistory=true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory=false; gravityEnabled=true; }")();
        window.__ev(`()=>{ gravityDir='${dir}'; selectedActorDefId=playerDefId; paintMode='actor'; placeNewActor(300, 300); const p=actors.find(a=>a.isPlayer); p.x=100; p.y=100; p.vx=0; p.vy=0; setGamePaused(true); }`)();
        window.__sim(2);
        window.__ev("()=>{ const p=actors.find(a=>a.isPlayer); p.x=100; p.y=100; p.vx=0; p.vy=0; p.grounded=true; p.impactMag=0; p.jumpCrouch=0; }")();
        window.__sim(1);
        const c = document.getElementById("gameCanvas"); const ctx = c.getContext("2d");
        return Array.from(ctx.getImageData(100 - 5, 100 - 5 - 0, 32, 32).data);
      };
      const a = draw("down"), b = draw("up");
      let diff = 0; const colors = new Set();
      // compare the colour at the centre of each 4x4 art cell: up's row (7-r) must equal down's row r
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const i = ((r * 4 + 2 + 0) * 32 + (c * 4 + 2)) * 4, j = (((7 - r) * 4 + 2) * 32 + (c * 4 + 2)) * 4;
        for (let k = 0; k < 4; k++) if (a[i + k] !== b[j + k]) { diff++; break; }
        colors.add(b[j] + "," + b[j + 1] + "," + b[j + 2]);
      }
      return { diff, colors: colors.size };
    });
    ok(res.diff === 0, `DPR ${dpr}: the upside-down player is the upright sprite flipped, cell by cell (${res.diff} of 64 art cells differ, ${res.colors} colors, no blending at cell centres)`);
    // pointer accuracy with gravity up: click the centre of a cell and the right cell gets painted
    await r.page.evaluate(() => window.__ev("()=>{ gravityEnabled=true; gravityDir='up'; selectGeometry('solid'); }")());
    await r.page.evaluate(() => window.__ev("()=>{ setGamePaused(false); }")());
    const box = await r.page.locator("#gameCanvas").boundingBox();
    await r.page.evaluate(() => window.__ev("()=>{ if(appMode==='play') exitToBuildMode(); setGamePaused(false); for(let y=0;y<18;y++) for(let x=0;x<24;x++) board[y][x]=null; actors.length=0; selectGeometry('solid'); paintMode='tile'; }")());
    const rect = await r.page.evaluate(() => { const b = document.getElementById("gameCanvas").getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width, h: b.height, bw: window.__ev("()=>canvasBorderPx")() }; });
    let bad = 0;
    for (const [gx, gy] of [[0, 0], [23, 0], [0, 17], [23, 17], [11, 8]]) {
      const px = rect.l + rect.bw + (gx + 0.5) * (rect.w - 2 * rect.bw) / 24, py = rect.t + rect.bw + (gy + 0.5) * (rect.h - 2 * rect.bw) / 18;
      await r.page.mouse.click(px, py); await r.page.evaluate(() => window.__sim(2));
      const got = await r.page.evaluate(([x, y]) => window.__ev(`()=>board[${y}][${x}]`)(), [gx, gy]);
      if (!got) bad++;
    }
    ok(bad === 0, `DPR ${dpr}, gravity up: clicks at 4 corners + centre paint the cell under the cursor`);
    ok(r.errors.length === 0, `DPR ${dpr}: no errors ` + r.errors.join(";"));
    await r.ctx.close();
  }
  await browser.close();
  console.log(`\n${pass} passed, ${fails.length} failed`); if (fails.length) { console.log(fails.join("\n")); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
