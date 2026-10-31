// Mousecop's Garden stage 3: old autosave loads, first-frame check, screenshots/coverage at 1366x635 and 1920x1080, export plays.
// usage: node tests/garden.check.js <baseline index.html (pre-garden)> [shotDir]
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const fs = require("fs"), path = require("path"), os = require("os");
const REPO = path.join(__dirname, "..");
const BASE = path.resolve(process.argv[2]), SHOTS = process.argv[3] || os.tmpdir();
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? "ok  " : "FAIL", m); };
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gc-"));
  const oldTmp = path.join(dir, "old.html"), newTmp = path.join(dir, "new.html");
  fs.writeFileSync(oldTmp, fs.readFileSync(BASE, "utf8").replace(anchor, anchor + "window.__e = f => eval('(' + f + ')');\n"));
  fs.writeFileSync(newTmp, fs.readFileSync(path.join(REPO, "index.html"), "utf8").replace(anchor, anchor + "window.__e = f => eval('(' + f + ')');\n"));
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  // ---- 1. autosave written by the pre-garden build loads in the new build
  const ctx = await b.newContext({ viewport: { width: 1366, height: 635 }, acceptDownloads: true });
  const errs = []; const mk = async f => { const p = await ctx.newPage(); p.on("pageerror", e => errs.push(String(e))); p.on("dialog", d => d.accept()); await p.goto("file://" + f + (f === oldTmp ? "#t" : "")); await p.waitForTimeout(400); return p; };
  const po = await mk(oldTmp);
  const sig = await po.evaluate(() => window.__e("()=>{ const g=SAMPLE_GAMES.find(g=>g.id==='cloud-hopper'); loadExampleGame(g.builder,g.name,{skipConfirm:true}); saveAutosave(); return localStorage.getItem('toyGameDesigner.autosave.v1').length; }")());
  await po.close();
  ok(sig > 1000, "old build wrote an autosave (" + sig + " chars, Cloud Hopper)");
  const pn = await mk(newTmp);
  const info = await pn.evaluate(() => window.__e("()=>({rooms: rooms.length, name: rooms[0].name, landing: document.body.classList.contains('landing'), hasGarden: SAMPLE_GAMES.some(g=>g.id==='mousecops-garden'), last: SAMPLE_GAMES[SAMPLE_GAMES.length-1].id})")());
  ok(info.rooms === 3 && !info.landing, "new build restored the old autosave (3 rooms, editor not landing): " + JSON.stringify(info));
  ok(info.hasGarden && info.last === "mousecops-garden", "garden is in the gallery, last in the list");
  // open the gallery by the real UI and pick the garden (last card)
  await pn.getByRole("button", { name: /Samples/ }).first().click(); await pn.waitForTimeout(300);
  const cards = await pn.locator("#samplesGrid > *").count(); ok(cards >= 15, "gallery shows " + cards + " cards");
  const t0 = Date.now(); await pn.locator("#samplesGrid > *").last().click();
  await pn.waitForTimeout(250);
  const s1 = await pn.locator("#gameCanvas").screenshot(); const el = Date.now() - t0;
  await pn.waitForTimeout(250); const s2 = await pn.locator("#gameCanvas").screenshot();
  // play
  await pn.click("#modePlayBtn"); await pn.waitForTimeout(1600); const p1 = await pn.locator("#gameCanvas").screenshot(); await pn.waitForTimeout(400); const p2 = await pn.locator("#gameCanvas").screenshot();
  fs.writeFileSync(path.join(SHOTS, "stage3-first-frame.png"), s1); fs.writeFileSync(path.join(SHOTS, "stage3-play-1366x635.png"), p2);
  // decode and compare in the page
  const cmp = await pn.evaluate(async ([a, c, d]) => {
    const load = async b64 => { const im = new Image(); im.src = "data:image/png;base64," + b64; await im.decode(); const cv = document.createElement("canvas"); cv.width = im.width; cv.height = im.height; const x = cv.getContext("2d"); x.drawImage(im, 0, 0); return x.getImageData(0, 0, im.width, im.height).data; };
    const A = await load(a), C = await load(c), D = await load(d); let dac = 0, dcd = 0, green = 0, black = 0;
    for (let i = 0; i < A.length; i += 4) { if (A[i] !== C[i] || A[i+1] !== C[i+1] || A[i+2] !== C[i+2]) dac++; if (C[i] !== D[i] || C[i+1] !== D[i+1] || C[i+2] !== D[i+2]) dcd++; if (A[i+1] > A[i] + 20 && A[i+1] > A[i+2] + 20) green++; if (A[i] + A[i+1] + A[i+2] < 30) black++; }
    return { diffFirstFrame250ms: dac, diffPlay400ms: dcd, greenPct: +(100 * green / (A.length / 4)).toFixed(1), blackPct: +(100 * black / (A.length / 4)).toFixed(1) };
  }, [s1.toString("base64"), s2.toString("base64"), p2.toString("base64")]);
  console.log("first-frame metrics (" + el + " ms after the click):", JSON.stringify(cmp));
  ok(cmp.greenPct > 30 && cmp.blackPct < 3, "garden visible at the first frame: " + cmp.greenPct + "% green, " + cmp.blackPct + "% black");
  ok(cmp.diffPlay400ms > 200, "motion visible within 400 ms in Play (" + cmp.diffPlay400ms + " px changed)");
  ok(errs.length === 0, "no page errors (autosave load, gallery, play): " + errs.slice(0, 2));
  await pn.close();
  // ---- 2. coverage + screenshots at both viewports, Build and Play
  for (const [w, h] of [[1366, 635], [1920, 1080]]) {
    const c2 = await b.newContext({ viewport: { width: w, height: h } }); const p = await c2.newPage(); const e2 = []; p.on("pageerror", e => e2.push(String(e))); p.on("dialog", d => d.accept());
    await p.goto("file://" + newTmp + "#t"); await p.waitForTimeout(400);
    const cover = await p.evaluate(() => window.__e("()=>{ const g=SAMPLE_GAMES.find(g=>g.id==='mousecops-garden'); loadExampleGame(g.builder,g.name,{skipConfirm:true}); let empty=0, miss=0; for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){ const bg=backgroundBoard[y][x], sk=groundSkinBoard[y][x]; if(!bg && !sk) empty++; if(bg && !backgroundTileDefs[bg]) miss++; if(sk && !groundTileDefs[sk]) miss++; } return {empty, miss, actors: actors.length, wrap:[wrapHEnabled,wrapVEnabled], grav: gravityEnabled}; }")());
    ok(cover.empty === 0 && cover.miss === 0, `${w}x${h}: 0 uncovered cells, 0 missing defs ` + JSON.stringify(cover));
    await p.waitForTimeout(300);
    const box = await p.locator("#gameCanvas").boundingBox(); const sc = await p.evaluate(() => [document.documentElement.scrollHeight, innerHeight, document.documentElement.scrollWidth, innerWidth]);
    ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= w && box.y + box.height <= h && sc[0] <= sc[1] && sc[2] <= sc[3], `${w}x${h}: board inside the window, no page scroll (${Math.round(box.width)}x${Math.round(box.height)} at ${Math.round(box.x)},${Math.round(box.y)})`);
    await p.screenshot({ path: path.join(SHOTS, `stage3-build-${w}x${h}.png`) });
    await p.click("#modePlayBtn"); await p.waitForTimeout(2400);
    await p.screenshot({ path: path.join(SHOTS, `stage3-play-page-${w}x${h}.png`) });
    ok(e2.length === 0, `${w}x${h}: no errors`); await c2.close();
  }
  // ---- 3. export plays
  const c3 = await b.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true }); const p3 = await c3.newPage(); const e3 = []; p3.on("pageerror", e => e3.push(String(e))); p3.on("dialog", d => d.accept());
  await p3.goto("file://" + newTmp + "#t"); await p3.waitForTimeout(400);
  await p3.evaluate(() => window.__e("()=>{ const g=SAMPLE_GAMES.find(g=>g.id==='mousecops-garden'); loadExampleGame(g.builder,g.name,{skipConfirm:true}); }")());
  const [dl] = await Promise.all([p3.waitForEvent("download"), p3.getByRole("button", { name: /Export/ }).first().click()]);
  const exp = path.join(dir, "export.html"); await dl.saveAs(exp); const html = fs.readFileSync(exp, "utf8");
  ok(!html.includes("buildMousecopsGardenGame"), "export contains no sample builder, size " + Math.round(html.length / 1000) + " KB");
  const pe = await c3.newPage(); pe.on("pageerror", e => e3.push(String(e))); await pe.goto("file://" + exp); await pe.waitForTimeout(1500);
  await pe.keyboard.down("ArrowRight"); await pe.keyboard.down("ArrowUp"); await pe.waitForTimeout(3000); await pe.keyboard.up("ArrowRight"); await pe.keyboard.up("ArrowUp");
  const ex1 = await pe.locator("canvas").first().screenshot(); fs.writeFileSync(path.join(SHOTS, "stage3-export-play.png"), ex1);
  ok(e3.length === 0, "exported garden plays 4.5 s with held keys, no errors " + e3.slice(0, 2));
  await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
