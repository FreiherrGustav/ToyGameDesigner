// Event Horizon stage 5: old autosave loads, the sample opens from the Samples gallery by real clicks, first-frame check, coverage and screenshots
// of every room at 1366x635 and 1920x1080, and an exported game plays.  usage: node tests/eventhorizon.check.js <baseline index.html> [shotDir]
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const fs = require("fs"), path = require("path"), os = require("os");
const REPO = path.join(__dirname, "..");
const BASE = path.resolve(process.argv[2]), SHOTS = process.argv[3] || os.tmpdir();
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? "ok  " : "FAIL", m); };
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ehc-"));
  const oldTmp = path.join(dir, "old.html"), newTmp = path.join(dir, "new.html");
  const hook = anchor + "window.__e = f => eval('(' + f + ')');\n";
  fs.writeFileSync(oldTmp, fs.readFileSync(BASE, "utf8").replace(anchor, hook));
  fs.writeFileSync(newTmp, fs.readFileSync(path.join(REPO, "index.html"), "utf8").replace(anchor, hook));
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await b.newContext({ viewport: { width: 1366, height: 635 }, acceptDownloads: true });
  const errs = []; const mk = async f => { const p = await ctx.newPage(); p.on("pageerror", e => errs.push(String(e))); p.on("dialog", d => d.accept()); await p.goto("file://" + f + (f === oldTmp ? "#t" : "")); await p.waitForTimeout(400); return p; };
  // 1. an autosave from the previous build loads in the new build
  const po = await mk(oldTmp);
  const sig = await po.evaluate(() => window.__e("()=>{ const g=SAMPLE_GAMES.find(g=>g.id==='cloud-hopper'); loadExampleGame(g.builder,g.name,{skipConfirm:true}); saveAutosave(); return localStorage.getItem('toyGameDesigner.autosave.v1').length; }")());
  await po.close(); ok(sig > 1000, "previous build wrote an autosave (" + sig + " chars)");
  const pn = await mk(newTmp);
  const info = await pn.evaluate(() => window.__e("()=>({rooms: rooms.length, landing: document.body.classList.contains('landing'), last: SAMPLE_GAMES[SAMPLE_GAMES.length-1].id})")());
  ok(info.rooms === 3 && !info.landing, "old autosave restored (3 rooms, editor): " + JSON.stringify(info));
  ok(info.last === "event-horizon", "Event Horizon is last in the Samples list");
  // 2. open it through the gallery with real clicks, then play it with real keys
  await pn.getByRole("button", { name: /Samples/ }).first().click(); await pn.waitForTimeout(300);
  const t0 = Date.now(); await pn.locator("#samplesGrid > *").last().click(); await pn.waitForTimeout(250);
  const s1 = await pn.locator("#gameCanvas").screenshot(); const el = Date.now() - t0;
  await pn.waitForTimeout(300); const s2 = await pn.locator("#gameCanvas").screenshot();
  const rooms = await pn.evaluate(() => window.__e("()=>rooms.map(r=>r.name)")());
  ok(JSON.stringify(rooms) === JSON.stringify(["Orbit", "Vortex", "Slingshot", "Quad Pulls", "Flip side"]), "the sample opened from the gallery has 5 rooms: " + rooms.join(", "));
  const cmp = await pn.evaluate(async ([a, c]) => {
    const load = async b64 => { const im = new Image(); im.src = "data:image/png;base64," + b64; await im.decode(); const cv = document.createElement("canvas"); cv.width = im.width; cv.height = im.height; const x = cv.getContext("2d"); x.drawImage(im, 0, 0); return x.getImageData(0, 0, im.width, im.height).data; };
    const A = await load(a), C = await load(c); let diff = 0, black = 0, violet = 0, n = A.length / 4;
    for (let i = 0; i < A.length; i += 4) { if (A[i] !== C[i] || A[i+1] !== C[i+1] || A[i+2] !== C[i+2]) diff++; if (A[i] + A[i+1] + A[i+2] < 14) black++; if (A[i+2] > A[i+1] + 12) violet++; }
    return { diff, blackPct: +(100 * black / n).toFixed(1), bluishPct: +(100 * violet / n).toFixed(1) };
  }, [s1.toString("base64"), s2.toString("base64")]);
  console.log("first frame (" + el + " ms after the click):", JSON.stringify(cmp));
  ok(cmp.blackPct < 2 && cmp.bluishPct > 40, "space backdrop visible at the first frame, no black void: " + JSON.stringify(cmp));
  ok(cmp.diff > 20, "the black hole animates within 300 ms (" + cmp.diff + " px changed)");
  fs.writeFileSync(path.join(SHOTS, "check-first-frame.png"), s1);
  await pn.click("#modePlayBtn"); await pn.waitForTimeout(1600);
  await pn.keyboard.down("ArrowRight"); await pn.waitForTimeout(900); await pn.keyboard.up("ArrowRight"); await pn.waitForTimeout(300);
  const pl = await pn.evaluate(() => window.__e("()=>{const p=actors.find(a=>a.isPlayer);return {x:p.x,y:p.y,lives}}")());
  ok(pl.x > 40 && pl.lives === 3, "real keys move the hero in Play: " + JSON.stringify(pl));
  ok(errs.length === 0, "no page errors (autosave load, gallery, play): " + errs.slice(0, 2));
  await pn.close();
  // 3. coverage of every room at both viewports (screenshots come from the committed shots script)
  for (const [w, h] of [[1366, 635], [1920, 1080]]) {
    const c2 = await b.newContext({ viewport: { width: w, height: h } }); const p = await c2.newPage(); const e2 = []; p.on("pageerror", e => e2.push(String(e))); p.on("dialog", d => d.accept());
    await p.goto("file://" + newTmp + "#t"); await p.waitForTimeout(400);
    for (let ri = 0; ri < 5; ri++) {
      const cover = await p.evaluate(ri => window.__e("(ri)=>{ const g=SAMPLE_GAMES.find(g=>g.id==='event-horizon'); loadExampleGame(g.builder,g.name,{skipConfirm:true}); activateRoom(rooms[ri].id); let empty=0, miss=0; for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){ const bg=backgroundBoard[y][x], sk=groundSkinBoard[y][x]; if(!bg && !sk) empty++; if(bg && !backgroundTileDefs[bg]) miss++; if(sk && !groundTileDefs[sk]) miss++; } return {empty, miss}; }")(ri), ri);
      ok(cover.empty === 0 && cover.miss === 0, `${w}x${h} room ${ri + 1}: 0 empty cells, 0 missing defs`);
      await p.waitForTimeout(150);
      const box = await p.locator("#gameCanvas").boundingBox(); const sc = await p.evaluate(() => [document.documentElement.scrollHeight, innerHeight, document.documentElement.scrollWidth, innerWidth]);
      ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= w && box.y + box.height <= h && sc[0] <= sc[1] && sc[2] <= sc[3], `${w}x${h} room ${ri + 1}: board inside the window, no page scroll`);
    }
    ok(e2.length === 0, `${w}x${h}: no errors`); await c2.close();
  }
  // 4. export plays
  const c3 = await b.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true }); const p3 = await c3.newPage(); const e3 = []; p3.on("pageerror", e => e3.push(String(e))); p3.on("dialog", d => d.accept());
  await p3.goto("file://" + newTmp + "#t"); await p3.waitForTimeout(400);
  await p3.evaluate(() => window.__e("()=>{ const g=SAMPLE_GAMES.find(g=>g.id==='event-horizon'); loadExampleGame(g.builder,g.name,{skipConfirm:true}); }")());
  const [dl] = await Promise.all([p3.waitForEvent("download"), p3.getByRole("button", { name: /Export/ }).first().click()]);
  const exp = path.join(dir, "export.html"); await dl.saveAs(exp); const html = fs.readFileSync(exp, "utf8");
  ok(!html.includes("buildEventHorizonGame"), "export contains no sample builder, " + Math.round(html.length / 1000) + " KB");
  const pe = await c3.newPage(); pe.on("pageerror", e => e3.push(String(e))); await pe.goto("file://" + exp); await pe.waitForTimeout(1500);
  await pe.keyboard.down("ArrowRight"); await pe.waitForTimeout(2500); await pe.keyboard.up("ArrowRight");
  fs.writeFileSync(path.join(SHOTS, "check-export-play.png"), await pe.locator("canvas").first().screenshot());
  ok(e3.length === 0, "exported game plays 4 s with a held key, no errors " + e3.slice(0, 2));
  await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
