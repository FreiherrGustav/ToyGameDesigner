// Stage 4 (not deployed): frame capture for pixel parity + fps measurement.
// node tests/artcache.capture.js capture <html> <outDir>   |  node tests/artcache.capture.js fps <html> [throttle]
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const [mode, htmlArg, arg3] = process.argv.slice(2);
const src = fs.readFileSync(path.resolve(htmlArg), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
if (!src.includes(anchor)) throw new Error("anchor missing");
const hook = `window.__ev=f=>eval("("+f+")");
window.__seed=v=>{ let s=v>>>0; Math.random=()=>{ s=(s+0x6D2B79F5)>>>0; let t=s; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; }; };
window.__sim=(n,inputFn)=>{ for(let i=0;i<n;i++){ if(inputFn) inputFn(i); window.__T+=16; window.__seed(Math.round(gameClockMs/16)*7919+1);
  const q=window.__q.splice(0); for(const cb of q) cb(window.__T); } };
`;
const tmp = path.join(os.tmpdir(), "artcache_" + process.pid + ".html");
fs.writeFileSync(tmp, mode === "capture" ? src.replace(anchor, anchor + hook) : src.replace(anchor, anchor + 'window.__ev=f=>eval("("+f+")");\n'));
const FAKE = () => { window.__T = 0; window.__q = []; performance.now = () => window.__T; window.requestAnimationFrame = cb => { window.__q.push(cb); return 1; }; };
const SCHEDULE = `(function(){ window.__held=new Set(); const sets=[["ArrowRight"],["ArrowRight"," "],["ArrowLeft"],["ArrowDown"],["ArrowUp"],[],["ArrowRight","e"],["ArrowLeft"," "],["d"],["s"]];
  window.__inputAt=k=>{ if(k%15!==0) return; const want=new Set(sets[(Math.imul(k/15+3,2654435761)>>>0)%sets.length]);
   for(const h of [...window.__held]) if(!want.has(h)){ window.dispatchEvent(new KeyboardEvent("keyup",{key:h,bubbles:true})); window.__held.delete(h); }
   for(const w of want) if(!window.__held.has(w)){ window.dispatchEvent(new KeyboardEvent("keydown",{key:w,bubbles:true})); window.__held.add(w); } }; })()`;
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  if (mode === "capture") {
    const out = path.resolve(arg3); fs.mkdirSync(out, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 635 } });
    const page = await ctx.newPage(); const errors = [];
    page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept());
    await page.addInitScript(FAKE);
    await page.goto("file://" + tmp + "#t"); await page.waitForFunction(() => window.__sim);
    await page.evaluate(SCHEDULE);
    const snap = async name => { const d = await page.evaluate(() => document.getElementById("gameCanvas").toDataURL("image/png")); fs.writeFileSync(path.join(out, name + ".png"), Buffer.from(d.split(",")[1], "base64")); };
    const shot = async name => { await page.screenshot({ path: path.join(out, name + ".page.png") }); };
    const n = await page.evaluate("window.__ev(\"()=>SAMPLE_GAMES.length\")()");
    for (let i = 0; i < n; i++) {
      const id = await page.evaluate(`window.__ev("()=>{ gameClockMs=0; clearGameTimers(); nextActorInstId=1000; window.__seed(777); if(appMode==='play') exitToBuildMode(); const g=SAMPLE_GAMES[${i}]; loadExampleGame(g.builder,g.name,{skipConfirm:true}); return g.id; }")()`);
      // Build mode at several pan positions
      const maxPan = await page.evaluate(`window.__ev("()=>{ const m=roomCols()-COLS; return m>0?m:0; }")()`);
      for (const pan of [0, Math.floor(maxPan / 2), maxPan]) {
        await page.evaluate(`window.__ev("()=>{ editorPanCol=${pan}; }")()`); await page.evaluate(() => window.__sim(3));
        await snap(`${id}.build.pan${pan}`);
      }
      await shot(`${id}.build`);
      // Play at several times
      await page.evaluate(`window.__ev("()=>{ gameClockMs=0; clearGameTimers(); window.__seed(12345); enterPlayMode(); }")()`);
      let k = 0;
      for (const target of [10, 100, 250, 500, 800]) {
        await page.evaluate(`window.__ev("()=>{ }")()`);
        await page.evaluate(([a, b]) => { let k = a; window.__sim(b - a, () => { window.__inputAt(k); k++; }); }, [k, target]); k = target;
        await snap(`${id}.play.f${target}`);
      }
      await shot(`${id}.play`);
      if (maxPan > 0) for (const cx of [0.3, 37.4, 100.7, 333.5]) {
        await page.evaluate(`window.__ev("()=>{ cameraX=${cx}; renderGame(); }")()`);
        await snap(`${id}.play.cam${cx}`);
      }
      await page.evaluate(() => { for (const h of [...window.__held]) window.dispatchEvent(new KeyboardEvent("keyup", { key: h, bubbles: true })); window.__held.clear(); });
      await page.evaluate(`window.__ev("()=>{ exitToBuildMode(); }")()`);
    }
    // sprite edit then redraw, and paint tile edit
    await page.evaluate(`window.__ev("()=>{ gameClockMs=0; if(appMode==='play') exitToBuildMode(); const g=SAMPLE_GAMES[0]; loadExampleGame(g.builder,g.name,{skipConfirm:true}); }")()`);
    await page.evaluate(() => window.__sim(3)); await snap("edit.before");
    await page.evaluate(`window.__ev("()=>{ const d=actorDefs[playerDefId]; if(d.art) for(let i=0;i<64;i+=3) d.art[i]='#ff00ff'; for(const id in groundTileDefs){ const g=groundTileDefs[id]; if(g.art) for(let i=0;i<64;i+=5) g.art[i]='#00ffff'; if(g.frames) g.frames.forEach(f=>{for(let i=0;i<64;i+=5) f[i]='#00ffff';}); } for(const id in backgroundTileDefs){ const g=backgroundTileDefs[id]; if(g.art) for(let i=0;i<64;i+=4) g.art[i]='#ffff00'; } }")()`);
    await page.evaluate(() => window.__sim(3)); await snap("edit.after");
    // paint editor open
    await page.click("text=Characters").catch(() => {}); await page.waitForTimeout(100); await shot("editor.page");
    console.log("captured; errors:", errors);
    await browser.close(); return;
  }
  // fps mode: real time, no fake clock
  const results = [];
  const throttle = +(arg3 || 1);
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 635 } });
  const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept());
  await page.goto("file://" + tmp + "#t"); await page.waitForFunction(() => window.__ev);
  const cdp = await ctx.newCDPSession(page); if (throttle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  const n = await page.evaluate("window.__ev(\"()=>SAMPLE_GAMES.length\")()");
  for (let i = 0; i < n; i++) {
    const id = await page.evaluate(`window.__ev("()=>{ if(appMode==='play') exitToBuildMode(); const g=SAMPLE_GAMES[${i}]; loadExampleGame(g.builder,g.name,{skipConfirm:true}); enterPlayMode(); window.__f=[]; let l=performance.now(); const loop=t=>{ const n=performance.now(); window.__f.push(n-l); l=n; requestAnimationFrame(loop); }; requestAnimationFrame(loop); return g.id; }")()`);
    await page.waitForTimeout(1600);
    await page.keyboard.down("ArrowRight"); await page.evaluate(() => { window.__f.length = 0; });
    await page.waitForTimeout(4000); await page.keyboard.up("ArrowRight");
    const f = await page.evaluate(() => window.__f.slice());
    const avg = f.reduce((a, b) => a + b, 0) / f.length;
    const sorted = f.slice().sort((a, b) => a - b);
    results.push({ id, fps: +(1000 / avg).toFixed(1), worst: +Math.max(...f).toFixed(1), p95: +sorted[Math.floor(f.length * 0.95)].toFixed(1) });
  }
  console.log(JSON.stringify(results)); if (errors.length) console.log("errors", errors);
  await browser.close();
})();
