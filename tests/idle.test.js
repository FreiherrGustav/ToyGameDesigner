// Idle life: breathing, collectible life, render-only. Usage: node tests/idle.test.js [shotDir]
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const shotDir = process.argv[2];
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const tmp = path.join(os.tmpdir(), "idle_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + `window.__ev=f=>eval("("+f+")");`));
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; console.log("ok  ", m); } else { fails.push(m); console.log("FAIL", m); } };
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await b.newPage({ viewport: { width: 1366, height: 768 } }); const errors = [];
  page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept());
  await page.goto("file://" + tmp + "#t"); await page.waitForFunction(() => window.__ev);
  const ev = f => page.evaluate(x => window.__ev(x), f);
  // a stage: starter board, a kid-drawn character, coin, gem, heart, a kid-made collectible
  await ev(`(()=>{ suppressHistory=true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory=false; loadStarterBoard();selectedActorDefId=playerDefId;placeNewActor(2*TILE+16,(ROWS-3)*TILE-11);
    const art=new Array(64).fill(null); for(let y=1;y<8;y++)for(let x=2;x<6;x++)art[y*8+x]="#aa44cc"; art[2*8+3]="#ffffff"; art[2*8+5]="#ffffff";
    const id="kidChar"; actorDefs[id]={temperament:"wanderer",name:"kid",poses:null,art,lethal:false};
    const cart=new Array(64).fill(null); for(let y=2;y<7;y++)for(let x=2;x<6;x++)cart[y*8+x]="#33cc66"; actorDefs.kidCol={temperament:"collectible",name:"kid thing",poses:null,art:cart};
    const put=(def,cx,cy)=>{selectedActorDefId=def;paintMode="actor";placeNewActor(cx*TILE+16,cy*TILE+16)};
    put("colCoin",8,10); put("colGem",10,10); put("colHeart",12,10); put("kidCol",14,10); put("kidChar",17,10); })()`);
  const probe = `(()=>{const out={}; actors.forEach(a=>{const d=actorDefs[a.defId]; out[a.defId]=idleLifeFor(a,d,gameNow(),0)}); return out})()`;
  // Build: characters do not breathe; collectibles live
  const bl = await ev(probe);
  ok(!bl[await ev(`playerDefId`)] && !bl.kidChar, "Build: no breathing for the hero or a kid-drawn character");
  ok(bl.colCoin && bl.colCoin.sx > 0 && bl.kidCol && "oyPx" in bl.kidCol, "Build: collectibles have life (coin width, kid-made float)");
  // Play: sample over time
  await ev(`(()=>{enterPlayMode();playReadyUntil=null;})()`);
  await ev(`(()=>{actors.forEach(a=>{if(actorDefs[a.defId].temperament==="wanderer"){a.vx=0}}); })()`);
  const seen = { hero: new Set(), kid: new Set(), coin: new Set(), heart: new Set(), float: new Set(), spark: new Set() };
  for (let i = 0; i < 80; i++) {
    const r = await ev(`(()=>{ advanceGameClock(0.05); actors.forEach(a=>{ if(a.defId!=="kidChar"&&!a.isPlayer&&actorDefs[a.defId].temperament!=="collectible")return; }); const kid=actors.find(a=>a.defId==="kidChar"); if(kid){kid.vx=0;kid.vy=0;kid.grounded=true}; return ${probe}})()`);
    const pid = await ev(`playerDefId`);
    const h = r[pid] ? r[pid].stretch : 0; seen.hero.add(h || 0);
    seen.kid.add((r.kidChar && r.kidChar.stretch) || 0);
    seen.coin.add(r.colCoin.sx); seen.heart.add(r.colHeart.sx); seen.float.add(r.kidCol.oyPx); seen.spark.add(r.colGem.sparkle);
  }
  ok(seen.hero.size >= 3 && Math.max(...seen.hero) === 2, "Play: hero breathes in whole-pixel steps " + [...seen.hero]);
  ok(seen.kid.size >= 2, "Play: a kid-drawn character (no flag) breathes " + [...seen.kid]);
  ok(seen.coin.size >= 3 && [...seen.coin].every(v => v >= 0.25 && v <= 1 && v * 4 === Math.round(v * 4)), "coin: stepped width " + [...seen.coin]);
  ok(seen.heart.size >= 2 && Math.max(...seen.heart) > 1, "heart pulses " + [...seen.heart]);
  ok(seen.float.size >= 3, "kid-made collectible floats " + [...seen.float]);
  ok(seen.spark.size >= 2 && Math.max(...seen.spark) >= 2, "gem sparkles " + [...seen.spark]);
  // moving hero does not breathe
  const mv = await ev(`(()=>{const p=actors.find(a=>a.isPlayer); p.vx=100; return idleLifeFor(p,actorDefs[p.defId],gameNow(),0)})()`);
  ok(mv === null, "a moving hero does not breathe");
  // pixel check: head rises by 2px at the top of a breath, feet fixed
  const pix = await ev(`(()=>{ const p=actors.find(a=>a.isPlayer); p.vx=0; p.vy=0; const res=[]; for(const t of [0,240,480]){ gameClockMs = Math.floor(gameNow()/960)*960+t; renderGame(); const c=document.getElementById("gameCanvas"),g=c.getContext("2d"); const x0=Math.floor(p.x-8),y0=Math.floor(p.y-16); const d=g.getImageData(x0,y0,40,48).data; let top=99,bot=-1; for(let y=0;y<48;y++)for(let x=0;x<40;x++){const i=(y*40+x)*4; if(d[i]>140&&d[i+1]<110&&d[i+2]<80){ if(top===99)top=y; bot=y } } res.push([top,bot]) } return res})()`);
  console.log("head/feet rows", JSON.stringify(pix));
  if (shotDir) { await ev(`(()=>{gameClockMs = Math.floor(gameNow()/960)*960+480; renderGame();})()`); await page.screenshot({ path: shotDir + "/idle-play.png", clip: { x: 290, y: 60, width: 790, height: 600 } }); }
  // Pause: frame does not change across real time
  await ev(`setGamePaused(true)`); await page.waitForTimeout(100);
  const hsh = () => ev(`(()=>{const c=document.getElementById("gameCanvas");const d=c.getContext("2d").getImageData(0,0,c.width,c.height).data;let h=0;for(let i=0;i<d.length;i+=4)h=(h*31+d[i]+d[i+1]*3+d[i+2]*7)|0;return h})()`);
  const p1 = await hsh(); await page.waitForTimeout(900); const p2 = await hsh();
  ok(p1 === p2, "Pause: frame frozen");
  await ev(`setGamePaused(false)`);
  // reduced motion
  await page.emulateMedia({ reducedMotion: "reduce" });
  const rm = await ev(probe);
  ok(Object.values(rm).every(v => v === null), "reduced motion: no idle life at all");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // export parity
  await ev(`exitToBuildMode()`);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#exportBtn")]);
  const f = path.join(os.tmpdir(), "idle_export.html"); await dl.saveAs(f);
  const html = fs.readFileSync(f, "utf8");
  const bootAnchor = "playReadyUntil = gameNow() + READY_DURATION_MS; cloudDriftT0 = gameNow();\n  renderPlayHUD();";
  ok(html.includes(bootAnchor) && html.includes("function idleLifeFor"), "export has idle code");
  const hooked = path.join(os.tmpdir(), "idle_export_hooked.html");
  fs.writeFileSync(hooked, html.replace(bootAnchor, bootAnchor + " window.__ev = f => eval('(' + f + ')');"));
  const q = await b.newPage({ viewport: { width: 1366, height: 768 } }); const qerr = []; q.on("pageerror", e => qerr.push(String(e)));
  await q.goto("file://" + hooked); await q.waitForFunction(() => window.__ev);
  const xs = new Set();
  for (let i = 0; i < 40; i++) xs.add(await q.evaluate(() => window.__ev("(()=>{playReadyUntil=null;advanceGameClock(0.05);const p=actors.find(a=>a.isPlayer);p.vx=0;p.vy=0;const l=idleLifeFor(p,actorDefs[p.defId],gameNow(),0);return l?l.stretch:0})()")));
  ok(xs.size >= 3, "exported game: hero breathes " + [...xs]);
  ok(qerr.length === 0, "export: no errors " + qerr.join(";"));
  ok(errors.length === 0, "no page errors " + errors.join("|"));
  console.log(pass + " passed, " + fails.length + " failed"); await b.close(); process.exit(fails.length ? 1 : 0);
})();
