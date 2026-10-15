// v2.48 Stage 3 (not deployed): Pause. Usage: node tests/pause.test.js [runsPerSample=50] [shotDir]
// Injects a hook + a fake clock/rAF into a temp copy of index.html (the repo file stays clean).
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const REPO = path.join(__dirname, "..");
const RUNS = +(process.argv[2] || 50), SHOTS = process.argv[3] || os.tmpdir();
const src = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
if (!src.includes(anchor)) throw new Error("anchor missing");
const hook = `window.__ev=f=>eval("("+f+")");
window.__seed=v=>{ let s=v>>>0; Math.random=()=>{ s=(s+0x6D2B79F5)>>>0; let t=s; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; }; };
window.__sim=(n,inputFn)=>{ let steps=0; for(let i=0;i<n;i++){ if(inputFn) inputFn(i);
  window.__T+=16; window.__seed(Math.round(gameClockMs/16)*7919+1);
  const q=window.__q.splice(0); for(const cb of q) cb(window.__T); steps++; } return steps; };
`;
const tmp = path.join(os.tmpdir(), "pause_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + hook));
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; console.log("ok  ", m); } else { fails.push(m); console.log("FAIL", m); } };
const FAKE = () => { window.__T = 0; window.__q = []; performance.now = () => window.__T; window.requestAnimationFrame = cb => { window.__q.push(cb); return 1; }; };
const open = async (b, hash, vp) => {
  const ctx = await b.newContext({ viewport: vp || { width: 1366, height: 635 }, acceptDownloads: true });
  const page = await ctx.newPage(); const errors = []; page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept());
  page.on("console", m => { if (m.text().includes("unexpected error")) errors.push(m.text().slice(0, 200)); });
  await page.addInitScript(FAKE);
  await page.goto("file://" + tmp + (hash === undefined ? "#t" : hash)); await page.waitForFunction(() => window.__sim);
  return { ctx, page, errors };
};
const ev = (pg, code) => pg.evaluate(c => window.__ev(c)(), code);
const FP = `()=>{ let h=0; const s=board.map(r=>r.join(",")).join("|"); for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))|0;
  const r=v=>typeof v==="number"?+v.toFixed(3):v;
  return JSON.stringify({a:actors.map(a=>[a.defId,r(a.x),r(a.y),r(a.vx),r(a.vy),a.carried?1:0,r(a.moverT||0)]),room:currentRoomId,h,score,lives,ses:playSessionEnded,sw:switchChannels,clk:Math.round(gameClockMs),cam:r(cameraX)}); }`;
const loadAndPlay = (page, idx) => ev(page, `()=>{ const g=SAMPLE_GAMES[${idx}]; loadExampleGame(g.builder,g.name,{skipConfirm:true}); enterPlayMode(); return appMode; }`);
const sampleIdx = (page, id) => ev(page, `()=>SAMPLE_GAMES.findIndex(g=>g.id===${JSON.stringify(id)})`);
const key = (pg, type, k) => pg.evaluate(([t, k]) => window.dispatchEvent(new KeyboardEvent(t, { key: k, bubbles: true })), [type, k]);

// scripted input, a function of the simulation-frame index only
const SCHEDULE = `(function(){ window.__held=new Set(); const sets=[["ArrowRight"],["ArrowRight"," "],["ArrowLeft"],["ArrowDown"],["ArrowUp"],[],["ArrowRight","e"],["ArrowLeft"," "],["d"],["s"]];
  window.__inputAt=k=>{ if(k%15!==0) return; const want=new Set(sets[(Math.imul(k/15+3,2654435761)>>>0)%sets.length]);
   for(const h of [...window.__held]) if(!want.has(h)){ window.dispatchEvent(new KeyboardEvent("keyup",{key:h,bubbles:true})); window.__held.delete(h); }
   for(const w of want) if(!window.__held.has(w)){ window.dispatchEvent(new KeyboardEvent("keydown",{key:w,bubbles:true})); window.__held.add(w); } };
  window.__releaseAll=()=>{ for(const h of [...window.__held]) window.dispatchEvent(new KeyboardEvent("keyup",{key:h,bubbles:true})); window.__held.clear(); }; })()`;

// run one scenario inside the page: 600 simulation frames, optional pause at sim frame pauseAt for pauseLen real frames
const RUN = `(sample, pauseAt, pauseLen, pauses)=>{
  if(appMode==='play') exitToBuildMode(); gameClockMs=0; clearGameTimers(); nextActorInstId=1000; window.__seed(12345); const g=SAMPLE_GAMES[sample]; loadExampleGame(g.builder,g.name,{skipConfirm:true}); enterPlayMode(); lastT=window.__T;
  let k=0; const press=c=>window.dispatchEvent(new KeyboardEvent("keydown",{key:c,bubbles:true}));
  const list=pauses; // [{at,len}]
  while(k<625){
    const p=list.find(x=>x.at===k&&!x.done);
    if(p){ p.done=true; press("p"); if(!gamePaused) throw new Error("did not pause");
      const frozen=JSON.stringify(actors.map(a=>[a.x,a.y]))+gameClockMs;
      for(let i=0;i<p.len;i++){ const sc=["w","a","z","x","q","c"][i%6]; window.dispatchEvent(new KeyboardEvent("keydown",{key:sc,bubbles:true})); window.__sim(1); window.dispatchEvent(new KeyboardEvent("keyup",{key:sc,bubbles:true})); }
      if(JSON.stringify(actors.map(a=>[a.x,a.y]))+gameClockMs!==frozen) throw new Error("state moved while paused");
      press("p"); if(gamePaused) throw new Error("did not resume"); }
    window.__sim(1,()=>window.__inputAt(k)); k++;
  }
  window.__releaseAll(); return (${FP})();
}`;

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  let { ctx, page, errors } = await open(browser);
  await page.evaluate(SCHEDULE);

  // ---- 1. invisible to the simulation: 4 samples x RUNS runs ----
  // each run gets a fresh page: state leaking between Play sessions in one page (not related to pause) would otherwise
  // make even two unpaused runs differ
  const runFresh = async (idx, pauses) => { const q = await open(browser); try { await q.page.evaluate(SCHEDULE);
      const r = await q.page.evaluate(`window.__ev(${JSON.stringify(RUN)})(${idx},0,0,${JSON.stringify(pauses)})`); if (q.errors.length) throw new Error(q.errors[0]); return r; } finally { await q.ctx.close(); } };
  for (const id of (process.env.ONLY ? process.env.ONLY.split(",") : ["crossing-guard", "rock-bottom", "sushi-train-panic", "the-gravity-switcheroo"])) {
    const idx = await sampleIdx(page, id);
    const base = await runFresh(idx, []);
    ok(base === await runFresh(idx, []), `${id}: unpaused run is deterministic (so differences below are the pause)`);
    let bad = 0, firstBad = null; const t0 = Date.now();
    for (let r = 0; r < RUNS; r++) {
      let s = (r * 2654435761 + idx * 97 + 11) >>> 0; const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
      const n = 1 + Math.floor(rnd() * 3); const pauses = [];
      for (let i = 0; i < n; i++) pauses.push({ at: Math.floor(rnd() * 610), len: 1 + Math.floor(rnd() * 600) });
      const fp = await runFresh(idx, pauses);
      if (fp !== base) { bad++; if (!firstBad) firstBad = JSON.stringify(pauses) + "\n" + fp.slice(0, 300) + "\n" + base.slice(0, 300); }
    }
    ok(bad === 0, `${id}: ${RUNS} runs with 1-3 random pauses (random frame, 1-600 frames long) end identical to the unpaused 10s run (${bad} differ, ${((Date.now() - t0) / 1000).toFixed(0)}s)` + (firstBad ? "\n" + firstBad : ""));
  }

  if (process.env.ONLY) { await browser.close(); console.log(`\n${pass} passed, ${fails.length} failed`); process.exit(fails.length ? 1 : 0); }
  // ---- 2. frozen state identical after 5s (Play and Build) ----
  await page.evaluate(`()=>{ window.__releaseAll(); }`);
  await loadAndPlay(page, await sampleIdx(page, "crossing-guard"));
  await page.evaluate(() => window.__sim(120));
  await key(page, "keydown", "p");
  const f1 = await ev(page, FP); const png1 = await page.evaluate(() => document.querySelector("canvas").toDataURL());
  await page.evaluate(() => window.__sim(300));
  const f2 = await ev(page, FP); const png2 = await page.evaluate(() => document.querySelector("canvas").toDataURL());
  ok(f1 === f2, "Play: state identical after 5 s paused");
  ok(png1 === png2, "Play: canvas identical after 5 s paused (nothing animates)");
  await key(page, "keydown", "p"); await page.evaluate(() => window.__sim(60));
  ok((await ev(page, FP)) !== f2, "Play: resumes and moves on");

  await ev(page, "()=>{ exitToBuildMode(); }");
  await ev(page, `()=>{ const g=SAMPLE_GAMES.find(x=>x.id==="rock-bottom"); loadExampleGame(g.builder,g.name,{skipConfirm:true}); }`);
  await page.evaluate(() => window.__sim(60));
  await page.click("#pauseBtn"); await page.evaluate(() => window.__sim(2));
  const b1 = await ev(page, FP); const bp1 = await page.evaluate(() => document.querySelector("canvas").toDataURL());
  await page.evaluate(() => window.__sim(300));
  ok(b1 === (await ev(page, FP)), "Build: state identical after 5 s paused");
  ok(bp1 === (await page.evaluate(() => document.querySelector("canvas").toDataURL())), "Build: canvas identical after 5 s paused");
  ok((await page.textContent("#pauseBtn")).includes("Resume"), "button reads Resume while paused");
  await page.screenshot({ path: path.join(SHOTS, "pause_build_1366x635.png") });

  // ---- 3. edit while paused (real UI) ----
  await ev(page, "()=>{ selectGeometry('solid'); }");
  const box = await page.locator("#gameCanvas").boundingBox();
  const [pgx, pgy] = await ev(page, "()=>{ for(let y=2;y<10;y++) for(let x=2;x<22;x++) if(!board[y][x]) return [x,y]; return [3,3]; }");
  const cx = box.x + box.width * ((pgx + 0.5) / 24), cy = box.y + box.height * ((pgy + 0.5) / 18);
  const cellBefore = await ev(page, `()=>board[${pgy}][${pgx}]`);
  await page.mouse.click(cx, cy); await page.evaluate(() => window.__sim(2));
  const cellAfter = await ev(page, `()=>board[${pgy}][${pgx}]`);
  ok(cellAfter !== cellBefore && /solid/.test(String(cellAfter)), `paint while paused works (${cellBefore} -> ${cellAfter})`);
  ok(await ev(page, "()=>gamePaused"), "still paused after painting");
  await page.keyboard.press("Control+z"); await page.evaluate(() => window.__sim(2));
  ok((await ev(page, `()=>board[${pgy}][${pgx}]`)) === cellBefore, "undo while paused reverts the paint");
  await page.keyboard.press("Control+y"); await page.evaluate(() => window.__sim(2));
  ok((await ev(page, `()=>board[${pgy}][${pgx}]`)) === cellAfter, "redo while paused restores it");
  await page.mouse.click(cx, cy, { button: "right" }).catch(() => {});
  const pp = await ev(page, "()=>actors.map(a=>[a.x,a.y]).join()");
  await key(page, "keydown", "ArrowRight"); await page.evaluate(() => window.__sim(60)); await key(page, "keyup", "ArrowRight");
  ok(pp === (await ev(page, "()=>actors.map(a=>[a.x,a.y]).join()")), "movement keys are ignored while paused");
  await page.click("#resetBtn"); await page.evaluate(() => window.__sim(2));
  ok(await ev(page, "()=>gamePaused"), "Reset to start stays paused");
  await page.screenshot({ path: path.join(SHOTS, "pause_build_edit_1366x635.png") });

  // ---- 4. Build pause persists through a Play trip, Play starts running ----
  await page.click("#modePlayBtn"); await page.evaluate(() => window.__sim(5));
  ok(!(await ev(page, "()=>gamePaused")), "Play always starts running");
  await key(page, "keydown", "p");
  await page.screenshot({ path: path.join(SHOTS, "pause_play_1366x635.png") });
  await key(page, "keydown", "p");
  await page.click("#modeBuildBtn"); await page.evaluate(() => window.__sim(5));
  ok(await ev(page, "()=>gamePaused"), "Build pause is remembered after a Play trip");
  // loading a sample / Surprise Me resume
  await ev(page, `()=>{ const g=SAMPLE_GAMES[0]; loadExampleGame(g.builder,g.name,{skipConfirm:true}); }`);
  ok(!(await ev(page, "()=>gamePaused")), "loading a sample resumes");
  await page.click("#pauseBtn"); ok(await ev(page, "()=>gamePaused"), "paused again");
  await page.click("#surpriseBtn").catch(async () => { await ev(page, "()=>surpriseMe(4821)"); }); await page.evaluate(() => window.__sim(5));
  ok(!(await ev(page, "()=>gamePaused")), "Surprise Me resumes");

  // ---- 5. hidden tab auto-pauses in Play, not in Build ----
  const hide = v => page.evaluate(v => { Object.defineProperty(document, "hidden", { configurable: true, get: () => v }); document.dispatchEvent(new Event("visibilitychange")); }, v);
  await ev(page, "()=>{ exitToBuildMode && appMode==='play' && exitToBuildMode(); }");
  await hide(true); ok(!(await ev(page, "()=>gamePaused")), "hidden tab does not pause Build");
  await hide(false);
  await loadAndPlay(page, await sampleIdx(page, "crossing-guard")); await page.evaluate(() => window.__sim(100));
  await hide(true); ok(await ev(page, "()=>gamePaused"), "hidden tab pauses Play");
  await hide(false); ok(await ev(page, "()=>gamePaused"), "coming back leaves it paused (explicit resume)");
  await key(page, "keydown", "p");

  // ---- 6. win / game over: P does nothing, no wedge ----
  await ev(page, "()=>{ playSessionEnded='gameover'; }");
  await key(page, "keydown", "p"); ok(!(await ev(page, "()=>gamePaused")), "P ignored on the game-over screen");
  await ev(page, "()=>{ playSessionEnded='win'; }");
  await key(page, "keydown", "p"); ok(!(await ev(page, "()=>gamePaused")), "P ignored on the win screen");
  await ev(page, "()=>{ playSessionEnded=null; }");

  // ---- 7. fuses hold remaining time ----
  const FUSE = `(setupSrc, pauseAfter, pauseLen)=>{
    eval(setupSrc); lastT=window.__T; let sim=0, st=0;
    const total=400+pauseLen+5; for(let i=0;i<total;i++){
      if(sim===pauseAfter && pauseLen && st===0){ window.dispatchEvent(new KeyboardEvent("keydown",{key:"p"})); st=1; }
      window.__sim(1);
      if(st===1){ pauseLen--; if(pauseLen<=0){ window.dispatchEvent(new KeyboardEvent("keydown",{key:"p"})); st=2; } continue; }
      sim++; if(window.__done()) return sim;
    } return -1; }`;
  const fuse = (label, setup, pauseAfter, pauseLen) => page.evaluate(([src, setup, pa, pl]) => window.__ev(src)(setup, pa, pl), [FUSE, setup, pauseAfter, pauseLen]);
  // tile bomb: a bomb with a solid neighbour in a gravity-free room; detonation clears the neighbour
  const TILE_SETUP = `if(appMode==='play') exitToBuildMode(); setGamePaused(false);
    for(const r of rooms){} for(let y=0;y<board.length;y++) for(let x=0;x<board[y].length;x++) board[y][x]=null;
    gravityEnabled=false; board[8][8]=gameplayKey(BOMB2_GEOMETRY,"none"); board[8][9]=gameplayKey("solid","none"); board[8][7]=gameplayKey(BOMB2_GEOMETRY,"none"); board[8][6]=gameplayKey("solid","none");
    for(const k in bombArmed) delete bombArmed[k]; triggerBombArm(8,8);
    window.__done=()=>board[8][9]===null && board[8][6]===null;`;
  const base = await fuse("tile", TILE_SETUP, 0, 0);
  ok(base >= 71 && base <= 75, `bomb tile fuse (+ chain into the bomb next to it) goes off after ~1.2 s of game time (${base} frames; 72 expected)`);
  for (const [pa, pl] of [[10, 300], [40, 1], [71, 200], [1, 500]]) {
    const f = await fuse("tile", TILE_SETUP, pa, pl);
    ok(f === base, `tile bomb + chain: pause after frame ${pa} for ${pl} frames -> detonates on the same simulated frame (${f} vs ${base})`);
  }
  // carried-bomb fuse (an actor): drop one and let it run
  const ACT_SETUP = `if(appMode==='play') exitToBuildMode(); setGamePaused(false);
    for(let y=0;y<board.length;y++) for(let x=0;x<board[y].length;x++) board[y][x]=null;
    for(let x=0;x<24;x++) board[12][x]=gameplayKey("solid","none"); gravityEnabled=true; actors=actors.filter(a=>a.isPlayer);
    const b=placeCarryableActor(CARRY_BOMB2_DEF_ID, 5*TILE+16, 11*TILE, null); const id=b&&b.id;
    startOrResumeBombFuse(actors.find(a=>a.id===id)||b); window.__done=()=>!actors.some(a=>a.id===id);`;
  const abase = await fuse("actor", ACT_SETUP, 0, 0);
  ok(abase > 60 && abase < 100, `dropped bomb actor fuse ~1.2 s + blast fade (${abase} frames)`);
  for (const [pa, pl] of [[20, 400], [60, 250]]) {
    const f = await fuse("actor", ACT_SETUP, pa, pl);
    ok(f === abase, `bomb actor: pause after frame ${pa} for ${pl} frames -> same simulated frame (${f} vs ${abase})`);
  }

  // ---- 8. audio ----
  await ev(page, "()=>{ if(appMode==='play') exitToBuildMode(); setGamePaused(false); }");
  await page.evaluate(() => { window.__aud = { suspend: 0, resume: 0, voices: 0 }; const AC = window.AudioContext; if (AC) { const s = AC.prototype.suspend, r = AC.prototype.resume, c = AC.prototype.createBufferSource; AC.prototype.suspend = function () { window.__aud.suspend++; return s.apply(this, arguments); }; AC.prototype.resume = function () { window.__aud.resume++; return r.apply(this, arguments); }; AC.prototype.createBufferSource = function () { window.__aud.voices++; return c.apply(this, arguments); }; } });
  await ev(page, "()=>{ getAudioCtx && getAudioCtx(); }").catch(() => {});
  await key(page, "keydown", "p");
  const v0 = await page.evaluate(() => window.__aud.voices);
  await ev(page, "()=>{ for(let i=0;i<5;i++){ try{ sounds.boing(); sounds.thud && sounds.thud(1); }catch(e){} } }");
  ok((await page.evaluate(() => window.__aud.voices)) === v0, "no new sound starts while paused");
  ok((await page.evaluate(() => window.__aud.suspend)) >= 1, "audio context suspended on pause");
  await key(page, "keydown", "p");
  ok((await page.evaluate(() => window.__aud.resume)) >= 1, "audio context resumed on resume");
  await ev(page, "()=>{ sounds.boing(); }");
  ok((await page.evaluate(() => window.__aud.voices)) > v0, "sounds play again after resume");

  // ---- 9. pause mid door-transition and mid Surprise Me never wedge ----
  await loadAndPlay(page, await sampleIdx(page, "the-gravity-switcheroo")); await page.evaluate(() => window.__sim(100));
  const fired = await ev(page, "()=>{ const p=actors.find(a=>a.isPlayer); p.doorCooldown=0; for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++) if(doorLinks[roomCellKey(currentRoomId,x,y)]){ triggerDoor(p,x,y); return !!roomTransition; } return false; }");
  ok(fired, "a real door transition is in flight when pausing");
  await key(page, "keydown", "p"); await page.evaluate(() => window.__sim(120));
  await key(page, "keydown", "p"); await page.evaluate(() => window.__sim(60));
  ok(await ev(page, "()=>roomTransition==null && !gamePaused"), "pause during a room transition: resumes and the transition completes");
  await ev(page, "()=>{ exitToBuildMode(); }");
  await key(page, "keydown", "p"); await ev(page, "()=>surpriseMe(777)"); await page.evaluate(() => window.__sim(30));
  ok(!(await ev(page, "()=>gamePaused")), "Surprise Me while paused resumes cleanly");
  await key(page, "keydown", "p"); await key(page, "keydown", "p");
  ok(await ev(page, "()=>!gamePaused"), "toggle twice returns to running");

  // ---- 10. hint pills (screenshots) at two sizes ----
  for (const [w, h] of [[1366, 635], [1280, 590]]) {
    const q = await open(browser, "#t", { width: w, height: h });
    await ev(q.page, "()=>{ keyHintFirstKeyAt=null; keyHintAnyKey=false; }");
    await q.page.evaluate(() => window.__sim(30));
    await q.page.screenshot({ path: path.join(SHOTS, `pause_hint_build_${w}x${h}.png`) });
    ok(await ev(q.page, "()=>keyHintText().includes('P pause')"), `${w}x${h}: Build hint mentions P pause (${await ev(q.page, "()=>keyHintText()")})`);
    await q.page.click("#modePlayBtn").catch(() => {});
    const hasPlayer = await ev(q.page, "()=>playerRoomId!=null");
    if (!hasPlayer) { await ev(q.page, `()=>{ const g=SAMPLE_GAMES[0]; loadExampleGame(g.builder,g.name,{skipConfirm:true}); enterPlayMode(); }`); }
    await q.page.evaluate(() => window.__sim(100));
    ok(await ev(q.page, "()=>keyHintText().includes('P pause')"), `${w}x${h}: Play hint mentions P pause`);
    await q.page.screenshot({ path: path.join(SHOTS, `pause_hint_play_${w}x${h}.png`) });
    await key(q.page, "keydown", "p"); await q.page.evaluate(() => window.__sim(5));
    await q.page.screenshot({ path: path.join(SHOTS, `pause_play_paused_${w}x${h}.png`) });
    ok(q.errors.length === 0, `${w}x${h}: no errors ${q.errors.join(";")}`);
    await q.ctx.close();
  }

  // ---- 11. exported game: P pauses, hidden tab pauses, hint says P pause ----
  {
    const e = await open(browser, "#t");
    await ev(e.page, `()=>{ const g=SAMPLE_GAMES.find(x=>x.id==="crossing-guard"); loadExampleGame(g.builder,g.name,{skipConfirm:true}); }`);
    const [d] = await Promise.all([e.page.waitForEvent("download"), e.page.click("#exportBtn")]);
    const f = path.join(os.tmpdir(), "pause_export.html"); await d.saveAs(f);
    const q = await ctx.newPage(); const errs = []; q.on("pageerror", x => errs.push(String(x)));
    await q.goto("file://" + f); await q.waitForTimeout(2500);
    const shot = async () => (await q.screenshot()).toString("base64");
    const a1 = await shot(); await q.waitForTimeout(500); const a2 = await shot();
    ok(a1 !== a2, "export: game animates while running");
    await q.keyboard.press("p"); await q.waitForTimeout(200);
    const p1 = await shot(); await q.waitForTimeout(1500); const p2 = await shot();
    ok(p1 === p2, "export: P freezes the game completely (screens identical 1.5 s apart)");
    await q.screenshot({ path: path.join(SHOTS, "pause_export_paused.png") });
    await q.keyboard.press("p"); await q.waitForTimeout(500); const r1 = await shot(); await q.waitForTimeout(500);
    ok(r1 !== await shot(), "export: P resumes");
    await q.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); });
    await q.waitForTimeout(200); const h1 = await shot(); await q.waitForTimeout(1000);
    ok(h1 === await shot(), "export: hidden tab pauses");
    ok(errs.length === 0, "export: no errors " + errs.join(";"));
    await e.ctx.close();
  }

  ok(errors.length === 0, "no page errors in the main run " + errors.slice(0, 3).join(";"));
  await browser.close();
  console.log(`\n${pass} passed, ${fails.length} failed`); if (fails.length) { console.log(fails.join("\n")); process.exit(1); }
})().catch(e => { console.error(e); process.exit(2); });
