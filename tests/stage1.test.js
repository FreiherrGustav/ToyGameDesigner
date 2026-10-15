// v2.48 Stage 1 (not deployed): starter board, Play with no player, start-position drag, key hints.
// Usage: node tests/stage1.test.js [shotDir]
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const REPO = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
if (!src.includes(anchor)) throw new Error("anchor missing");
const tmp = path.join(os.tmpdir(), "stage1_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + `window.__ev=f=>eval("("+f+")");`));
const SHOTS = process.argv[2] || os.tmpdir();
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; console.log("ok  ", m); } else { fails.push(m); console.log("FAIL", m); } };
const ev = (pg, code) => pg.evaluate(c => window.__ev(c)(), code);
const open = async (b, vp, hash) => {
  const ctx = await b.newContext({ viewport: vp, acceptDownloads: true });
  const page = await ctx.newPage(); const errors = []; page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept());
  await page.goto("file://" + tmp + (hash || "")); await page.waitForFunction(() => window.__ev); await page.waitForTimeout(400);
  return { ctx, page, errors };
};
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  for (const [w, h] of [[1366, 635], [1280, 590]]) {
    // landing, order, focus
    let { ctx, page, errors } = await open(browser, { width: w, height: h }, "");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(SHOTS, `s1_landing_${w}x${h}.png`) });
    const ids = await page.evaluate(() => [...document.querySelectorAll("#landingButtons button")].map(b => b.id));
    ok(JSON.stringify(ids) === JSON.stringify(["landingMakeBtn", "landingSurpriseBtn", "landingPlayBtn"]), `${w}x${h}: order Make, Surprise, Play`);
    ok(await page.evaluate(() => document.activeElement.id) === "landingMakeBtn", `${w}x${h}: Make one has focus`);
    const col = await page.evaluate(() => { const g = id => getComputedStyle(document.getElementById(id)).backgroundColor; return [g("landingMakeBtn"), g("landingSurpriseBtn"), g("landingPlayBtn")]; });
    ok(col[0] !== col[1] && col[1] === col[2], `${w}x${h}: Make is primary, the others share the secondary style ${col}`);
    // no input reaches the backdrop
    const before = await ev(page, "()=>JSON.stringify([actors.find(a=>a.isPlayer).x,actors.find(a=>a.isPlayer).vx])");
    await page.keyboard.down("ArrowRight"); await page.waitForTimeout(600); await page.keyboard.up("ArrowRight");
    await page.mouse.click(w / 2, h / 2);
    ok(await ev(page, "()=>landingActive&&Object.keys(keys).every(k=>!keys[k])"), `${w}x${h}: still on the landing screen, no key registered`);
    // Make one -> starter
    await page.click("#landingMakeBtn"); await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, `s1_starter_${w}x${h}.png`) });
    const st = await ev(page, "()=>({players:actors.filter(a=>a.isPlayer).length,floor:board[ROWS-1].slice(0,roomCols()).every(c=>c==='solid:none'),goal:board[ROWS-2][roomCols()-3],g:gravityEnabled,n:actors.length,px:actors.find(a=>a.isPlayer).x})");
    ok(st.players === 1 && st.floor && st.goal === "goal:none" && st.g && st.n === 1 && st.px < 100, `${w}x${h}: starter board ${JSON.stringify(st)}`);
    // Play to the goal
    await page.click("#modePlayBtn"); await page.waitForTimeout(1500);
    await page.keyboard.down("ArrowRight");
    let won = false;
    for (let i = 0; i < 80 && !won; i++) { await page.waitForTimeout(100); won = await ev(page, "()=>playSessionEnded==='win'"); }
    await page.keyboard.up("ArrowRight");
    ok(won, `${w}x${h}: Play on the starter wins at the goal`);
    await page.screenshot({ path: path.join(SHOTS, `s1_starter_win_${w}x${h}.png`) });
    ok(errors.length === 0, `${w}x${h}: no errors ${errors}`);
    await ctx.close();
  }

  // Clear board stays empty; starter is one undo step
  {
    const { ctx, page } = await open(browser, { width: 1280, height: 720 }, "");
    await page.click("#landingMakeBtn"); await page.waitForTimeout(300);
    await page.click("#undoBtn"); await page.waitForTimeout(200);
    ok(await ev(page, "()=>actors.length===0&&board[ROWS-1].every(c=>!c)"), "undo removes the whole starter in one step");
    await page.click("#redoBtn"); await page.waitForTimeout(200);
    ok(await ev(page, "()=>actors.length===1"), "redo brings it back");
    await page.click("#clearAllBtn"); await page.waitForTimeout(200);
    ok(await ev(page, "()=>actors.length===0&&board[ROWS-1].every(c=>!c)"), "Clear board stays empty");
    // Play with no player: caption, flash, no mode change
    await page.click("#modePlayBtn"); await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({ cap: document.getElementById("captionBar").textContent, flash: document.getElementById("playerSwatchRow").classList.contains("flashHint"), play: document.body.classList.contains("play-mode"), modal: !!document.querySelector("#surpriseFullOverlay") }));
    ok(r.cap === "Place a player first." && r.flash && !r.play && !r.modal, "Play with no player: caption + flash, still Build " + JSON.stringify(r));
    await page.screenshot({ path: path.join(SHOTS, "s1_noplayer.png") });
    await ctx.close();
  }

  // Set-start button is gone; dragging the player moves the start; Reset returns to it; survives save/export; second room
  {
    const { ctx, page, errors } = await open(browser, { width: 1280, height: 720 }, "#t");
    ok(await page.evaluate(() => !document.getElementById("setStartBtn")), "setStartBtn removed");
    await ev(page, "()=>{ selectedActorDefId=playerDefId; placeNewActor(2*TILE+16, 10*TILE+16); renderAll(); }");
    const bx = await page.evaluate(() => { const r = document.getElementById("gameCanvas").getBoundingClientRect(); return { x: r.left, y: r.top, s: r.width / 768 }; });
    const start0 = await ev(page, "()=>({x:startPos.x,y:startPos.y})");
    // drag the player with real mouse events
    const p0 = await ev(page, "()=>{const p=actors.find(a=>a.isPlayer);return {x:p.x+p.w/2,y:p.y+p.h/2}}");
    await page.mouse.move(bx.x + p0.x * bx.s, bx.y + p0.y * bx.s); await page.mouse.down();
    await page.mouse.move(bx.x + 300 * bx.s, bx.y + 200 * bx.s, { steps: 6 }); await page.mouse.up();
    const after = await ev(page, "()=>{const p=actors.find(a=>a.isPlayer);return {px:p.x,py:p.y,sx:startPos.x,sy:startPos.y,spx:p.spawnX}}");
    ok(Math.abs(after.sx - after.px) < 1 && Math.abs(after.sy - after.py) < 1 && Math.abs(after.sx - start0.x) > 50, "dragging the player moves startPos " + JSON.stringify(after));
    await ev(page, "()=>{const p=actors.find(a=>a.isPlayer);p.x+=200;p.y-=50;}"); // walk it somewhere (Build)
    await page.click("#resetBtn");
    const rp = await ev(page, "()=>{const p=actors.find(a=>a.isPlayer);return {x:p.x,y:p.y,sx:startPos.x,sy:startPos.y}}");
    ok(Math.abs(rp.x - after.sx) < 1 && Math.abs(rp.y - after.sy) < 1, "Reset returns the player to the dragged spot");
    const snap = await ev(page, "()=>{snapshotCurrentRoomState();const s=captureProjectSnapshot();return rooms[0].startPos.x+','+rooms[0].startPos.y+'|'+s.rooms[0].startPos.x+','+s.rooms[0].startPos.y}");
    ok(snap.split("|")[0] === snap.split("|")[1] && snap.startsWith(after.sx + ","), "start is in the saved snapshot " + snap);
    await ev(page, "()=>{ const s=captureProjectSnapshot(); restoreProjectSnapshot(structuredClone(s)); }");
    ok(await ev(page, `()=>Math.abs(startPos.x-${after.sx})<1&&Math.abs(startPos.y-${after.sy})<1`), "start survives save/restore");
    // second room: new room, place a player there (moves it), drag
    await ev(page, "()=>{ const r=createEmptyRoom('two'); rooms.push(r); activateRoom(r.id); selectedActorDefId=playerDefId; placeNewActor(5*TILE+16,8*TILE+16); }");
    const bx2 = await page.evaluate(() => { const r = document.getElementById("gameCanvas").getBoundingClientRect(); return { x: r.left, y: r.top, s: r.width / 768 }; });
    const q0 = await ev(page, "()=>{const p=actors.find(a=>a.isPlayer);return {x:p.x+p.w/2,y:p.y+p.h/2}}");
    await page.mouse.move(bx2.x + q0.x * bx2.s, bx2.y + q0.y * bx2.s); await page.mouse.down();
    await page.mouse.move(bx2.x + 500 * bx2.s, bx2.y + 400 * bx2.s, { steps: 6 }); await page.mouse.up();
    const room2 = await ev(page, "()=>{const p=actors.find(a=>a.isPlayer);return {px:p.x,sx:startPos.x,pr:playerRoomId===currentRoomId,r2:rooms.find(r=>r.id===currentRoomId).startPos.x}}");
    ok(Math.abs(room2.px - room2.sx) < 1 && room2.pr && Math.abs(room2.r2 - room2.sx) < 1, "second room: drag sets that room's start " + JSON.stringify(room2));
    // old save: room with an explicit startPos loads with the same start
    const old = await ev(page, "()=>{const s=structuredClone(captureProjectSnapshot());s.rooms[0].startPos={x:123,y:321};restoreProjectSnapshot(s);return [rooms[0].startPos.x,rooms[0].startPos.y]}");
    ok(old[0] === 123 && old[1] === 321, "an old save's start loads unchanged");
    ok(errors.length === 0, "no errors " + errors);
    await ctx.close();
  }

  // Key hints
  {
    const { ctx, page, errors } = await open(browser, { width: 1366, height: 635 }, "#t");
    const hint = async () => ev(page, "()=>{keyHintCacheAt=-1e9;return keyHintText()}");
    const loadPlay = async (id) => { await ev(page, `()=>{const g=SAMPLE_GAMES.find(g=>g.id==='${id}');loadExampleGame(g.builder,g.name,{skipConfirm:true});enterPlayMode();playReadyUntil=null;}`); await page.waitForTimeout(500); };
    await loadPlay("rock-bottom"); const rb = await hint();
    await loadPlay("crossing-guard"); const cg = await hint();
    await loadPlay("the-over-engineered-escape"); const oe = await hint();
    console.log("hints:", { rb, cg, oe });
    ok(rb.includes("Space jump") && rb.includes("E grab"), "Rock Bottom (gravity, crates): Space jump + E grab");
    ok(!cg.includes("Space") && !cg.includes("E grab") && cg.includes("WASD"), "Crossing Guard (no gravity, nothing carryable): arrows only");
    ok(oe.includes("Space jump") && oe.includes("E grab"), "Over-Engineered Escape: jump + grab");
    // gravity, nothing carryable: hand-built room
    await ev(page, "()=>{exitToBuildMode();initBoard();for(let x=0;x<24;x++)board[17][x]='solid:none';gravityEnabled=true;selectedActorDefId=playerDefId;placeNewActor(64,17*32-11);enterPlayMode();playReadyUntil=null;}");
    ok(await hint() === "← ↑ ↓ → or WASD move · Space jump · P pause", "gravity room, nothing carryable: arrows + jump only");
    // fade after the first key
    await page.screenshot({ path: path.join(SHOTS, "s1_hint_play.png") });
    ok(await ev(page, "()=>keyHintFirstKeyAt===null"), "hint timer not started before a key");
    await page.keyboard.down("ArrowRight"); await page.waitForTimeout(300); await page.keyboard.up("ArrowRight");
    ok(await ev(page, "()=>keyHintFirstKeyAt!==null"), "first key starts the fade clock");
    await page.waitForTimeout(3800);
    ok(await ev(page, "()=>{const t=performance.now()-keyHintFirstKeyAt-3000;return t>=500}"), "hint has faded out");
    await ev(page, "()=>exitToBuildMode()");
    await ctx.close();
    ok(errors.length === 0, "no errors " + errors);
  }
  // Export: the standalone game shows the same pill (pixel check on the canvas) and fades it
  {
    const { ctx, page } = await open(browser, { width: 1366, height: 635 }, "");
    await page.click("#landingMakeBtn"); await page.waitForTimeout(300);
    const [d] = await Promise.all([page.waitForEvent("download"), page.click("#exportBtn")]);
    const f = path.join(os.tmpdir(), "stage1_export.html"); await d.saveAs(f);
    const q = await ctx.newPage(); const errs = []; q.on("pageerror", e => errs.push(String(e)));
    await q.goto("file://" + f); await q.waitForTimeout(1800);
    // sample the bottom-right pill area of the canvas: bright text pixels present
    const lit = async () => q.evaluate(() => { const c = document.querySelector("canvas"); const g = c.getContext("2d"); const d = g.getImageData(c.width - 330, c.height - 42, 318, 30).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 200 && d[i + 2] > 200) n++; return n; });
    const before = await lit();
    await q.screenshot({ path: path.join(SHOTS, "s1_hint_export.png") });
    await q.keyboard.down("ArrowRight"); await q.waitForTimeout(4200); await q.keyboard.up("ArrowRight");
    const after = await lit();
    ok(before > 20 && after === 0, `export: hint pill drawn (${before} bright px) then faded (${after})`);
    ok(errs.length === 0, "export: no errors " + errs);
    await ctx.close();
  }
  await browser.close();
  console.log(`\n${pass} passed, ${fails.length} failed`); if (fails.length) { console.log(fails.join("\n")); process.exit(1); }
})();
