// Bomb/pile regression tests (not deployed). Usage: node tests/bombs.test.js
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/opt/node22/lib/node_modules/playwright");
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = `window.__t={snd:()=>sounds,wrap:()=>{const c={};for(const k of Object.keys(sounds)){const f=sounds[k];sounds[k]=function(){c[k]=(c[k]||0)+1;return f.apply(this,arguments)}}return c},
 reset:()=>{suppressHistory=true;restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT));suppressHistory=false},
 snap:()=>captureProjectSnapshot(),restore:s=>restoreProjectSnapshot(s),paint:(x,y,k)=>{board[y][x]=k},grav:v=>{gravityEnabled=v},
 tick:n=>{for(let i=0;i<n;i++)tick(1/60)},st:()=>({actors,board}),resetBtn:()=>document.getElementById('resetBtn').click(),
 bomb:(x,y)=>placeCarryableActor(CARRY_BOMB2_DEF_ID,x*TILE+16,y*TILE+16),det:id=>detonateCarriedBombAt(currentRoomId,id)};`;
const tmp = path.join(os.tmpdir(), "bombs_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK));
const fails = []; const fail = m => { fails.push(m); console.log("FAIL:", m); };
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage();
  const errors = []; page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept());
  await page.goto("file://" + tmp + "#t"); await page.waitForFunction(() => window.__t);
  // 1. a pile of bombs sharing one spot doesn't run away off the board, and a resting pile is silent
  const pile = await page.evaluate(() => {
    __t.reset(); __t.grav(true);
    for (let x = 0; x < 24; x++) __t.paint(x, 16, "solid:none");
    for (let i = 0; i < 20; i++) __t.bomb(5, 14);
    const c = __t.wrap();
    __t.tick(240);
    const bs = __t.st().actors.filter(a => a.defId === "carrybomb2");
    const off = bs.filter(a => a.y < -100 || a.y > 700 || a.x < -50 || a.x > 800).length;
    for (const k in c) delete c[k];
    __t.tick(300);
    return { n: bs.length, off, boing: c.boing || 0 };
  });
  console.log("pile:", JSON.stringify(pile));
  if (pile.off) fail("pile ran away " + JSON.stringify(pile));
  if (pile.boing) fail("resting pile boings " + JSON.stringify(pile));
  // 2. painting a bomb tile onto a cell a bomb already fills never leaves two bombs overlapping
  const occ = await page.evaluate(() => {
    __t.reset(); __t.grav(true);
    for (let x = 0; x < 24; x++) __t.paint(x, 16, "solid:none");
    __t.bomb(5, 15); __t.tick(30);
    for (let i = 0; i < 4; i++) { __t.paint(5, 15, "bomb2:none"); __t.tick(30); }
    const bs = __t.st().actors.filter(a => a.defId === "carrybomb2"); let overlaps = 0;
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) { const a = bs[i], c = bs[j]; if (a.x < c.x + c.w - 4 && a.x + a.w > c.x + 4 && a.y < c.y + c.h - 4 && a.y + a.h > c.y + 4) overlaps++; }
    return { bombs: bs.length, overlaps };
  });
  if (occ.overlaps) fail("stacked bombs overlap " + JSON.stringify(occ));
  // 3. a Build-mode blast is undone by Reset (wall and bomb come back)
  const blast = await page.evaluate(() => {
    __t.reset(); __t.grav(true);
    for (let x = 0; x < 24; x++) __t.paint(x, 16, "solid:none");
    __t.paint(6, 15, "solid:none");
    const b = __t.bomb(5, 15); __t.tick(30);
    __t.det(b.id);
    return new Promise(res => setTimeout(() => {
      const mid = { wall: __t.st().board[15][6], bombs: __t.st().actors.filter(a => a.defId === "carrybomb2").length };
      __t.resetBtn();
      const end = { wall: __t.st().board[15][6], bombs: __t.st().actors.filter(a => a.defId === "carrybomb2").length };
      res({ mid, end });
    }, 700));
  });
  console.log("blast:", JSON.stringify(blast));
  if (blast.mid.wall || blast.mid.bombs !== 0) fail("blast did not destroy " + JSON.stringify(blast.mid));
  if (blast.end.wall !== "solid:none" || blast.end.bombs !== 1) fail("reset did not restore " + JSON.stringify(blast.end));
  // 4. loading a save with identical stacked bombs keeps one per spawn point
  const mig = await page.evaluate(() => {
    __t.reset(); __t.grav(true);
    for (let i = 0; i < 6; i++) __t.bomb(3, 3);
    const s = __t.snap(); __t.restore(structuredClone(s));
    return __t.st().actors.filter(a => a.defId === "carrybomb2").length;
  });
  if (mig !== 1) fail("stack migration kept " + mig);
  // 5. a stray far-off object is brought home
  const stray = await page.evaluate(() => {
    __t.reset(); __t.grav(true);
    for (let x = 0; x < 24; x++) __t.paint(x, 16, "solid:none");
    const b = __t.bomb(5, 14); b.y = -50000; __t.tick(3);
    return { y: b.y, spawnY: b.spawnY };
  });
  if (!(stray.y >= -100 && stray.y < 700)) fail("stray not recovered " + JSON.stringify(stray));
  if (errors.length) fail("page errors " + errors.slice(0, 3));
  await browser.close();
  console.log(fails.length ? "FAILURES " + fails.length : "ALL PASSED");
  process.exit(fails.length ? 1 : 0);
})();
