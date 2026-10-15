// Control returns when a cannon shot lands (gravity rooms), no runaway speed after. Not deployed. Usage: node tests/cannonlanding.test.js
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
if (!src.includes(anchor)) throw new Error("anchor missing");
const tmp = path.join(os.tmpdir(), "cannonlanding_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + `window.__ev=f=>eval("("+f+")");`));
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; console.log("ok  ", m); } else { fails.push(m); console.log("FAIL", m); } };
// Over-Engineered Escape, brown/green/blue gates open, player dropped onto the trampoline column so the real
// trampoline -> cannon path fires it. mode: none | right | rightjump | duringflight; gravity: true/false
const run = (page, mode, gravity) => page.evaluate(([mode, gravity]) => window.__ev(`(a)=>{const mode=a[0],grav=a[1];
  const g=SAMPLE_GAMES.find(g=>g.id==='the-over-engineered-escape');loadExampleGame(g.builder,g.name,{skipConfirm:true});enterPlayMode();playReadyUntil=null;
  switchChannels.brown=true;switchChannels.green=true;switchChannels.blue=true;
  const pl=actors.find(a=>a.isPlayer);gravityEnabled=grav;
  if(grav){pl.x=5;pl.y=5*TILE-pl.h-1;pl.vx=0;pl.vy=300;}else{ /* free-roam: drop straight into the cannon cell's neighbour */ pl.x=5;pl.y=2*TILE;pl.vx=0;pl.vy=-300; }
  for(const k in keys)keys[k]=false;
  let fired=null,landed=null,maxVx=0,log=[],xAtLanding=null,vxAfter=[];
  for(let f=0;f<420;f++){
    if(mode==='duringflight'&&pl.ballistic)keys.ArrowRight=true;
    if((mode==='right'||mode==='rightjump')&&landed!==null)keys.ArrowRight=true;
    if(mode==='rightjump'&&landed!==null)keys[' ']=true;
    tick(1/60);
    if(fired===null&&pl.ballistic)fired=f;
    if(landed===null&&fired!==null&&pl.grounded&&f>fired+10){landed=f;xAtLanding=pl.x;}
    if(landed!==null&&f-landed<=120){maxVx=Math.max(maxVx,Math.abs(pl.vx));if(f-landed<=5)vxAfter.push(Math.round(pl.vx));}
    if(fired!==null&&!pl.grounded&&mode==='duringflight')log.push(Math.round(pl.vx));
  }
  return {fired,landed,xAtLanding,x:pl.x,maxVx:Math.round(maxVx),vxAfter,inFlightVx:log.slice(0,10)};}`)([mode, gravity]), [mode, gravity]);
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept());
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto("file://" + tmp + "#t"); await page.waitForFunction(() => window.__ev);
  const none = await run(page, "none", true);
  ok(none.fired != null && none.landed != null, `shot fires and lands (fired ${none.fired}, landed ${none.landed})`);
  const dur = await run(page, "duringflight", true);
  ok(Math.abs(dur.xAtLanding - none.xAtLanding) < 1, `holding right during flight does not bend the arc (landing x ${dur.xAtLanding} vs ${none.xAtLanding})`);
  const r = await run(page, "right", true);
  ok(r.vxAfter.slice(0, 4).some(v => v >= 200 && v <= 225), `control is back within 4 frames of landing, speed capped at 220 (vx after: ${r.vxAfter})`);
  ok(r.maxVx <= 345, `no runaway speed under a held key after landing (max |vx| ${r.maxVx})`);
  ok(r.x > r.xAtLanding + 100, `walks away from the landing spot against the belt (x ${Math.round(r.xAtLanding)} -> ${Math.round(r.x)})`);
  const j = await run(page, "rightjump", true);
  ok(j.maxVx <= 345, `jump-mashing + right after landing stays capped (max |vx| ${j.maxVx})`);
  const nf = await run(page, "none", false), nr = await run(page, "duringflight", false);
  ok(nf.fired == null || Math.abs(nr.xAtLanding - nf.xAtLanding) < 1 || nr.landed == null, `free-roam room still locks input for the cooldown (${JSON.stringify([nf.fired, nr.fired])})`);
  ok(errors.length === 0, "no errors " + errors);
  await browser.close();
  console.log(`\n${pass} passed, ${fails.length} failed`); if (fails.length) { console.log(fails.join("\n")); process.exit(1); }
})();
