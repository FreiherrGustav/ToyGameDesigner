// v2.51 Stage 1: editor layout tidy (alignment, grouped toolbar, room strip, message line). Usage: node tests/v251.test.js [shotDir]
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const REPO = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
if (!src.includes(anchor)) throw new Error("anchor missing");
const tmp = path.join(os.tmpdir(), "v251_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + `window.__ev=f=>eval("("+f+")");`));
const shotDir = process.argv[2];
if (shotDir) fs.mkdirSync(shotDir, { recursive: true });
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; } else { fails.push(m); console.log("FAIL", m); } };
const SIZES = [[1366,635],[1280,590],[1440,900],[1728,1000],[1920,1080],[2560,1300],[3440,1440]];
const SAMPLES = [["the-cheese-heist","one room"],["the-gravity-switcheroo","two rooms"],["rock-bottom","follow camera"]];
const rectsOverlap = (a, b) => !(a.r <= b.l + 0.5 || b.r <= a.l + 0.5 || a.b <= b.t + 0.5 || b.b <= a.t + 0.5);
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const table = [];
  for (const [w, h] of SIZES) for (const [sid, sname] of SAMPLES) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const errors = []; page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept());
    await page.goto("file://" + tmp + "#t"); await page.waitForFunction(() => window.__ev);
    await page.evaluate(id => window.__ev(`()=>{const s=SAMPLE_GAMES.find(x=>x.id==="${id}"); loadExampleGame(s.builder, s.name, {skipConfirm:true}); renderAll();}`)(), sid);
    await page.waitForTimeout(400);
    for (const mode of ["build", "play"]) {
      if (mode === "play") { await page.click("#modePlayBtn"); await page.waitForTimeout(500); }
      const tag = `${w}x${h} ${sname} ${mode}`;
      const m = await page.evaluate(() => {
        const R = id => { const r = document.getElementById(id).getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height, vis: !!document.getElementById(id).offsetParent }; };
        const cv = R("gameCanvas"), tg = R("appModeToggle"), tabs = R("roomTabRow");
        const clipped = [...document.querySelectorAll("#topBar button, #buildToolbar button, #roomTabRow button, #cameraPanRow button")].filter(b => b.offsetParent && b.scrollWidth > b.clientWidth + 1).map(b => b.id || b.textContent);
        const groups = [...document.querySelectorAll("#buildToolbar .tgroup")].map(g => { const r = g.getBoundingClientRect(); const bs = [...g.querySelectorAll("button")].map(b => Math.round(b.getBoundingClientRect().top)); return { splits: new Set(bs).size > 1, top: r.top, w: r.width }; });
        const ctl = [...document.querySelectorAll("#topBar button, #buildToolbar button, #roomTabRow button, #cameraPanRow button, #pauseBtn")].filter(b => b.offsetParent).map(b => { const r = b.getBoundingClientRect(); return { id: b.id || b.textContent, l: r.left, r: r.right, t: r.top, b: r.bottom }; });
        return { cv, tg, tabs, clipped, groups, ctl, scroll: document.scrollingElement.scrollHeight > innerHeight + 1 || scrollY !== 0,
          hud: document.getElementById("hud").offsetParent !== null, panVis: (e => e.offsetParent !== null && getComputedStyle(e).visibility === "visible")(document.getElementById("cameraPanRow")),
          msg: R("msgRow"), log: R("log"), hint: R("keyHint"), toolbarRows: new Set([...document.querySelectorAll("#buildToolbar .tgroup")].map(g => Math.round(g.getBoundingClientRect().top))).size };
      });
      const cc = m.cv.l + m.cv.w / 2;
      const dTog = Math.abs(m.tg.l + m.tg.w / 2 - cc);
      const dTabs = mode === "build" ? Math.abs(m.tabs.l + m.tabs.w / 2 - cc) : 0;
      table.push([tag, dTog.toFixed(1), dTabs.toFixed(1)]);
      ok(dTog <= 2, `${tag}: Build/Play toggle centre within 2px of board centre (${dTog.toFixed(1)})`);
      if (mode === "build") ok(dTabs <= 2, `${tag}: room tabs centred on board (${dTabs.toFixed(1)})`);
      ok(m.cv.t >= 0 && m.cv.b <= h && m.cv.l >= 0 && m.cv.r <= w, `${tag}: board fully visible`);
      ok(!m.scroll, `${tag}: no page scroll`);
      ok(m.clipped.length === 0, `${tag}: no clipped button text ${m.clipped}`);
      let overlap = null;
      for (let i = 0; i < m.ctl.length; i++) for (let j = i + 1; j < m.ctl.length; j++) if (rectsOverlap(m.ctl[i], m.ctl[j])) overlap = m.ctl[i].id + "/" + m.ctl[j].id;
      ok(!overlap, `${tag}: no overlapping controls ${overlap}`);
      ok(m.msg.b <= h && m.msg.t >= m.cv.b - 1, `${tag}: message line below the board and on screen`);
      if (mode === "build") {
        ok(m.groups.every(g => !g.splits), `${tag}: no toolbar group split across rows`);
        ok(!m.hud, `${tag}: score hidden in Build`);
        ok(m.panVis === (sid === "rock-bottom"), `${tag}: pan row only for Follow rooms (${m.panVis})`);
        
        if (w >= 1500 && h >= 820 || true) ok(m.toolbarRows <= 2, `${tag}: toolbar ${m.toolbarRows} rows`);
        if (w <= 1500) ok(m.toolbarRows === 1, `${tag}: compact toolbar is one row`);
        ok(m.hint.vis, `${tag}: build hint shown`);
      } else {
        ok(m.hud, `${tag}: HUD shown in Play`);
        ok(!m.panVis, `${tag}: no pan row in Play`);
      }
      if (shotDir && sid === "the-cheese-heist" && [[1366,635],[1920,1080],[2560,1300]].some(([a, b]) => a === w && b === h)) await page.screenshot({ path: path.join(shotDir, `${mode}_${w}.png`) });
    }
    ok(errors.length === 0, `${w}x${h} ${sname}: no page errors ${errors.join(";")}`);
    await page.close();
  }
  function document_pan() { return 1e9; }
  // functional + behavioural checks at one size
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = []; page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept());
  await page.goto("file://" + tmp + "#t"); await page.waitForFunction(() => window.__ev); await page.waitForTimeout(300);
  const ev = f => page.evaluate(x => window.__ev(x)(), f);
  // every old control exists and works
  for (const id of ["undoBtn","redoBtn","resetBtn","clearAllBtn","newProjectBtn","saveProjectBtn","loadProjectBtn","exportBtn","pauseBtn","samplesBtn","surpriseBtn","panLeftBtn","panRightBtn","modeBuildBtn","modePlayBtn"])
    ok(await page.evaluate(i => !!document.getElementById(i), id), `control #${id} exists`);
  // paint, undo, redo
  await page.click("#modeGround");
  const box = await page.evaluate(() => { const r = document.getElementById("gameCanvas").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const cellAt = (cx, cy) => [box.x + 3 + (cx + 0.5) * ((box.w - 6) / 24), box.y + 3 + (cy + 0.5) * ((box.h - 6) / 18)];
  await page.evaluate(() => { const s = [...document.querySelectorAll("#groundSwatches .swatch")]; (s[1] || s[0]).click(); });
  await page.mouse.click(...cellAt(5, 5));
  const count = () => ev("()=>{let n=0;for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){const g=board[y][x];if(g&&g!=='none:none')n++;}return n}");
  ok(await count() === 1, "click paints one cell"); 
  await page.click("#undoBtn"); ok(await count() === 0, "Undo works");
  await page.click("#redoBtn"); ok(await count() === 1, "Redo works");
  await page.click("#clearAllBtn"); await page.waitForTimeout(100); ok(await count() === 0, "Clear board works");
  // room tabs: duplicate, close
  await page.click("#roomTabRow .ghost"); await page.waitForTimeout(200);
  ok(await ev("()=>rooms.length") === 2, "Duplicate Room adds a room");
  ok(await page.evaluate(() => document.querySelectorAll("#roomTabRow .roomTab").length) === 2, "two tab pieces");
  ok(await page.evaluate(() => [...document.querySelectorAll("#roomTabRow .roomTab")].every(t => t.querySelectorAll("button").length === 2)), "each tab owns its close button");
  await page.click("#roomTabRow .roomTab:last-of-type button:last-child"); await page.waitForTimeout(200);
  ok(await ev("()=>rooms.length") === 1, "close x deletes its room");
  // reset / save / load / export exist and run
  await page.click("#resetBtn");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#saveProjectBtn")]);
  ok(/\.json$/.test(dl.suggestedFilename()), "Save project downloads json");
  // message line: log fades and clears on mode change
  await page.evaluate(() => window.__ev("()=>log('hello there')")());
  ok(await page.evaluate(() => document.getElementById("log").textContent.includes("hello")), "log shows");
  await page.waitForTimeout(5800);
  { const st = await page.evaluate(() => ({ c: document.getElementById("log").className, t: document.getElementById("log").textContent })); ok(/faded/.test(st.c) || !/hello/.test(st.t), "log fades after ~5s " + JSON.stringify(st)); }
  await page.evaluate(() => window.__ev(`()=>{const s=SAMPLE_GAMES.find(x=>x.id==="the-cheese-heist"); loadExampleGame(s.builder, s.name, {skipConfirm:true}); renderAll();}`)());
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__ev("()=>log('Build message')")());
  await page.click("#modePlayBtn"); await page.waitForTimeout(300);
  ok(!(await page.evaluate(() => document.getElementById("log").textContent)).includes("Build message"), "log cleared on mode change");
  await page.click("#modeBuildBtn"); await page.waitForTimeout(300);
  ok(!(await page.evaluate(() => document.getElementById("log").textContent)).includes("Play started"), "'Play started!' never lingers in Build");
  // key hint: Build text; Play pill fades after first key
  ok((await page.textContent("#keyHint")).includes("Ctrl+Z undo"), "Build hint text");
  await page.click("#modePlayBtn"); await page.waitForTimeout(300);
  ok((await page.getAttribute("#keyHint", "class")) === "pill" && (await page.textContent("#keyHint")).includes("WASD"), "Play pill with keys");
  const fs1 = await page.evaluate(() => getComputedStyle(document.getElementById("keyHint")).fontSize);
  await page.keyboard.down("ArrowRight"); await page.waitForTimeout(4200); await page.keyboard.up("ArrowRight");
  ok(await page.evaluate(() => +document.getElementById("keyHint").style.opacity) === 0, "pill faded after first key");
  ok(fs1 === "12px", "pill font fixed at 12px");
  // pause attached
  const pr = await page.evaluate(() => { const a = document.getElementById("appModeToggle").getBoundingClientRect(), b = document.getElementById("pauseBtn").getBoundingClientRect(); return { gap: b.left - a.right, vis: !!document.getElementById("pauseBtn").offsetParent }; });
  ok(pr.vis && pr.gap >= 0 && pr.gap < 40, `Pause attached next to the toggle in Play (gap ${Math.round(pr.gap)})`);
  // tab order follows visual order (top bar then toolbar)
  await page.click("#modeBuildBtn");
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  const order = [];
  for (let i = 0; i < 24; i++) { await page.keyboard.press("Tab"); order.push(await page.evaluate(() => document.activeElement.id || document.activeElement.textContent.slice(0, 12))); }
  const idx = n => order.indexOf(n);
  ok(idx("modePlayBtn") < idx("pauseBtn") && idx("pauseBtn") < idx("samplesBtn") && idx("samplesBtn") < idx("surpriseBtn"), "top bar tab order = visual order " + order.slice(0, 7));
  ok(errors.length === 0, "no page errors " + errors.join(";"));
  await page.close(); await browser.close();
  console.log("\nalignment offsets (px) toggle / tabs:"); table.filter(r => /rock|one room/.test(r[0])).forEach(r => console.log(" ", r.join("  ")));
  console.log(`\n${pass} passed, ${fails.length} failed`);
  process.exit(fails.length ? 1 : 0);
})();
