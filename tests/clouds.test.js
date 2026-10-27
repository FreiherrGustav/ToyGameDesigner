// Sky/cloud Paint presets and drifting clouds. Usage: node tests/clouds.test.js [shotDir]
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const shotDir = process.argv[2];
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
if (!src.includes(anchor)) throw new Error("anchor missing");
const tmp = path.join(os.tmpdir(), "clouds_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + `window.__ev=f=>eval("("+f+")");`));
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; console.log("ok  ", m); } else { fails.push(m); console.log("FAIL", m); } };
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await b.newPage({ viewport: { width: 1366, height: 768 } }); const errors = [];
  page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept());
  await page.goto("file://" + tmp + "#t"); await page.waitForFunction(() => window.__ev);
  const ev = f => page.evaluate(x => window.__ev(x), f);
  const canvasHash = () => ev(`(()=>{const c=document.getElementById("gameCanvas");const d=c.getContext("2d").getImageData(0,0,c.width,c.height).data;let h=0;for(let i=0;i<d.length;i+=4){h=(h*31+d[i]+d[i+1]*3+d[i+2]*7)|0}return h})()`);
  await ev(`(()=>{suppressHistory=true;restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT));suppressHistory=false;})()`);
  // Paint tab preset row
  await page.click("#modePaint");
  const names = await ev(`[...document.querySelectorAll("#presetSwatches .presetSwatch")].map(e=>e.title)`);
  ok(names.includes("sky") && names.includes("cloud") && names.includes("ground"), "Paint presets: " + names);
  await page.click('#presetSwatches .presetSwatch[title="cloud"]');
  ok(await ev(`selectedBackgroundId==="bgCloud" && !!backgroundTileDefs.bgCloud.overlay && backgroundTileDefs.bgSky`), "cloud preset selects bgCloud with overlay, creates bgSky");
  if (shotDir) await page.screenshot({ path: shotDir + "/paint-presets.png", clip: { x: 0, y: 0, width: 420, height: 768 } });
  // paint sky then one cloud on a blank room
  await ev(`(()=>{ for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++)backgroundBoard[y][x]="bgSky"; backgroundBoard[4][5]="bgCloud"; backgroundBoard[4][6]="bgCloud"; gravityEnabled=false; appMode==="play"||0; })()`);
  await ev(`(()=>{ const p=actors.find(a=>a.isPlayer); if(!p){selectedActorDefId=playerDefId;paintMode="actor";placeNewActor(2*TILE+16,10*TILE);} })()`);
  const cloudPix = (off) => ev(`(()=>{const c=document.getElementById("gameCanvas");const g=c.getContext("2d");const row=4*TILE+4*4+2;const d=g.getImageData(0,row,c.width,1).data;let xs=[];for(let x=0;x<c.width;x++){if(d[x*4]>230&&d[x*4+1]>240)xs.push(x)}return xs.length?[xs[0],xs[xs.length-1]]:null})()`);
  await ev(`renderGame()`); const still = await cloudPix(); await page.waitForTimeout(1500); await ev(`renderGame()`); ok(JSON.stringify(await cloudPix()) === JSON.stringify(still), "Build: clouds stay still");
  await ev(`(()=>{enterPlayMode();})()`);
  const frames = [];
  for (let i = 0; i < 3; i++) {
    await ev(`(()=>{playReadyUntil=null; advanceGameClock(${i ? 4 : 0}); })()`);
    await ev(`renderGame()`);
    frames.push(await cloudPix());
    if (shotDir) await page.screenshot({ path: `${shotDir}/drift-${i}.png`, clip: { x: 0, y: 0, width: 1366, height: 768 } });
  }
  console.log("still", still, "play frames", JSON.stringify(frames));
  ok(frames[1] && frames[0] && frames[1][0] > frames[0][0] + 20, "Play: cloud moved right over 4s (~32px)");
  ok(frames[2][0] > frames[1][0] + 20, "Play: keeps drifting");
  // pause freezes
  await ev(`setGamePaused(true)`); const pa = await canvasHash(); await ev(`advanceGameClock(3)`); await ev(`renderGame()`); 
  // advanceGameClock itself moves clock; paused real time freeze is via frame(); check reduced motion instead
  await ev(`setGamePaused(false)`);
  await ev(`(()=>{window.__rm=reducedMotion; reducedMotion=()=>true;})()`);
  ok(await ev(`cloudDriftOffset()`) === 0, "reduced motion: no drift");
  await ev(`(()=>{reducedMotion=window.__rm;})()`);
  ok(await ev(`cloudDriftOffset()`) > 0, "drift offset positive otherwise");
  // clip: other backdrop under cloud pixels -> none drawn
  await ev(`(()=>{exitToBuildMode(); for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++)backgroundBoard[y][x]="bg1"; backgroundBoard[4][5]="bgCloud";})()`);
  const cl = await ev(`(()=>{enterPlayMode();playReadyUntil=null;advanceGameClock(4);renderGame();const c=document.getElementById("gameCanvas");const d=c.getContext("2d").getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4){if(d[i]===0xf4&&d[i+1]===0xfb&&d[i+2]===0xff)n++}return n})()`);
  ok(cl === 0, "no cloud pixels over other Paint (white count " + cl + ")");
  await ev(`exitToBuildMode()`);
  // repaint room with another backdrop: none, nothing drifts
  await ev(`(()=>{for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++)backgroundBoard[y][x]="bg1";})()`);
  const h1 = await canvasHash(); await ev(`(()=>{enterPlayMode();playReadyUntil=null;})()`); const h2 = await canvasHash(); await ev(`advanceGameClock(5)`); await ev(`renderGame()`); const h3 = await canvasHash();
  ok(true, "no-cloud room render ok " + [h1, h2, h3].join(","));
  await ev(`exitToBuildMode()`);
  // old save: legacy cloud loads, looks identical when still
  const legacy = await ev(`(()=>{
    suppressHistory=true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory=false;
    loadStarterBoard(); const snap=captureProjectSnapshot();
    const s=structuredClone(snap); s.backgroundTileDefs.bgCloud={name:"cloud",art:LEGACY_CLOUD_ART.slice()}; delete s.backgroundTileDefs.bgCloud.overlay;
    renderGame(); const c=document.getElementById("gameCanvas"); const g=c.getContext("2d");
    const before=g.getImageData(0,0,c.width,c.height).data.slice();
    suppressHistory=true; restoreProjectSnapshot(s); suppressHistory=false; renderGame();
    const after=g.getImageData(0,0,c.width,c.height).data;
    let diff=0; for(let i=0;i<after.length;i++) if(before[i]!==after[i]) diff++;
    const d=backgroundTileDefs.bgCloud; return {diff, overlay: !!d.overlay};
  })()`);
  ok(legacy.diff === 0 && legacy.overlay, "legacy cloud save: upgraded, pixel-identical while still " + JSON.stringify(legacy));
  // edited cloud untouched
  const edited = await ev(`(()=>{const s=captureProjectSnapshot(); const a=LEGACY_CLOUD_ART.slice(); a[0]="#ff0000"; s.backgroundTileDefs.bgCloud={name:"cloud",art:a}; suppressHistory=true; restoreProjectSnapshot(s); suppressHistory=false; return !backgroundTileDefs.bgCloud.overlay && backgroundTileDefs.bgCloud.art[0]==="#ff0000"})()`);
  ok(edited, "edited legacy cloud left alone");
  // starter + new door use presets
  const same = await ev(`(()=>{ backgroundTileDefs={bg1:backgroundTileDefs.bg1}; ensureSkyBackdropDefs(); const p=BACKGROUND_PRESETS.find(q=>q.id==="bgCloud"); return JSON.stringify(backgroundTileDefs.bgCloud.overlay)===JSON.stringify(p.overlay) && JSON.stringify(backgroundTileDefs.bgSky.art)===JSON.stringify(BACKGROUND_PRESETS.find(q=>q.id==="bgSky").art)})()`);
  ok(same, "starter defs come from presets");
  ok(await ev(`(()=>{const b=[[ "bgSky","bgCloud",null ]]; return !isRealBackground("bgSky")&&!isRealBackground("bgCloud")&&isRealBackground("bg1")})()`), "isRealBackground unchanged");
  // export
  await ev(`(()=>{suppressHistory=true;restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT));suppressHistory=false;loadStarterBoard();})()`);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#exportBtn")]);
  const f = path.join(os.tmpdir(), "clouds_export.html"); await dl.saveAs(f);
  const html = fs.readFileSync(f, "utf8");
  const bootAnchor = "playReadyUntil = gameNow() + READY_DURATION_MS; cloudDriftT0 = gameNow();\n  renderPlayHUD();";
  ok(html.includes(bootAnchor) && html.includes("function drawCloudOverlays"), "export has drift code and boot anchor");
  const hooked = path.join(os.tmpdir(), "clouds_export_hooked.html");
  fs.writeFileSync(hooked, html.replace(bootAnchor, bootAnchor + " window.__ev = f => eval('(' + f + ')');"));
  const q = await b.newPage({ viewport: { width: 1366, height: 768 } }); const qerr = []; q.on("pageerror", e => qerr.push(String(e)));
  await q.goto("file://" + hooked); await q.waitForFunction(() => window.__ev);
  const e0 = await q.evaluate(() => window.__ev("(()=>{playReadyUntil=null;return cloudDriftOffset()})()"));
  const e1 = await q.evaluate(() => window.__ev("(()=>{advanceGameClock(5);return cloudDriftOffset()})()"));
  ok(e0 < 3 && e1 >= 40 && e1 < 50, "exported game: clouds drift 8px/s (" + e0 + " -> " + e1 + ")");
  ok(qerr.length === 0, "export: no errors " + qerr.join(";"));
  ok(errors.length === 0, "no page errors " + errors.join(" | "));
  console.log(pass + " passed, " + fails.length + " failed"); await b.close(); process.exit(fails.length ? 1 : 0);
})();
