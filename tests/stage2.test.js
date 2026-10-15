// v2.48 Stage 2: vertical space. Usage: node tests/stage2.test.js [shotDir]
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
if (!src.includes(anchor)) throw new Error("anchor missing");
const tmp = path.join(os.tmpdir(), "stage2_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + `window.__ev=f=>eval("("+f+")");`));
const shotDir = process.argv[2];
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; console.log("ok  ", m); } else { fails.push(m); console.log("FAIL", m); } };
const SIZES = [[1280,590],[1366,635],[1440,680],[1536,735],[1366,768],[1920,1080]];
const BEFORE = { "1280x590": 0.689, "1366x635": 0.767, "1440x680": 0.845, "1536x735": 0.94, "1366x768": 0.997, "1920x1080": 1 };
const metrics = () => ({ b: (() => { const r = document.getElementById("gameCanvas").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom }; })(),
  rowTops: id => 0 });
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const table = [];
  for (const [w, h] of SIZES) {
    const tag = `${w}x${h}`;
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const errors = []; page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept());
    await page.goto("file://" + tmp + "#t"); await page.waitForFunction(() => window.__ev); await page.waitForTimeout(300);
    const rowsOf = sel => page.evaluate(sel => { const e = document.querySelector(sel); return new Set([...e.children].filter(k => k.offsetParent).map(k => Math.round(k.getBoundingClientRect().top))).size; }, sel);
    const canvas = () => page.evaluate(() => { const r = document.getElementById("gameCanvas").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom }; });
    const noScroll = () => page.evaluate(() => scrollY === 0 && document.documentElement.scrollHeight <= innerHeight + 1);
    // Build, an empty fresh project
    ok(await rowsOf("#buildToolbar") === 1, `${tag}: toolbar is one row (8 buttons)`);
    ok(await page.evaluate(() => { const bs = [...document.querySelectorAll("#buildToolbar button")]; return bs.length === 8 && bs.every(b => b.getBoundingClientRect().right <= innerWidth); }), `${tag}: all 8 toolbar buttons on screen`);
    // status row: tabs, pan, score on ONE line
    const oneLine = () => page.evaluate(() => { const r = document.getElementById("statusRow"); const items = [document.querySelector("#roomTabRow button"), document.getElementById("hud")].concat([...document.querySelectorAll("#cameraPanRow button")].filter(b => b.offsetParent)); const mids = items.map(e => { const q = e.getBoundingClientRect(); return Math.round(q.top + q.height / 2); }); return Math.max(...mids) - Math.min(...mids) <= 4 && r.getBoundingClientRect().height < 40; });
    ok(await oneLine(), `${tag}: room tabs + Score on one row`);
    let c = await canvas();
    const scale = (c.w - 6) / 768;
    table.push([tag, BEFORE[tag], +scale.toFixed(3)]);
    ok(c.b <= h && c.y >= 0 && await noScroll(), `${tag}: canvas inside viewport, no page scroll`);
    ok(Math.abs(c.h / c.w - 0.75) < 0.01, `${tag}: aspect 4:3`);
    if (tag === "1366x635") ok(scale >= 0.85, `${tag}: scale ${scale.toFixed(3)} >= 0.85`);
    if (tag === "1280x590") ok(scale >= 0.75, `${tag}: scale ${scale.toFixed(3)} >= 0.75`);
    ok(scale >= BEFORE[tag] - 0.001, `${tag}: no regression (${BEFORE[tag]} -> ${scale.toFixed(3)})`);
    if (shotDir && (tag === "1366x635" || tag === "1280x590")) {
      await page.evaluate(() => window.__ev("()=>loadStarterBoard()")());
      await page.screenshot({ path: path.join(shotDir, `s2_build_${tag}.png`) });
    }
    // pointer accuracy at five canvas locations: paint a ground tile, it must be the cell under the cursor
    await page.click("#modeGround");
    await page.evaluate(() => { const s = [...document.querySelectorAll("#groundSwatches .swatch")]; (s[1] || s[0]).click(); });
    await page.evaluate(() => window.__ev("()=>{for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++)board[y][x]=null;actors.length=0;}")());
    const cells = [[0,0],[23,0],[0,17],[23,17],[12,9]];
    c = await canvas();
    const sc = (c.w - 6) / 768;
    for (const [cx, cy] of cells) {
      await page.mouse.click(c.x + 3 + (cx + 0.5) * 32 * sc, c.y + 3 + (cy + 0.5) * 32 * sc);
    }
    const painted = await page.evaluate(() => window.__ev("()=>{const o=[];for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){const g=board[y][x];if(g&&g!==\"none:none\")o.push(x+\",\"+y);}return o;}")());
    ok(JSON.stringify(painted.sort()) === JSON.stringify(cells.map(q => q.join(",")).sort()), `${tag}: 5 clicks (4 corners + centre) painted exactly the cells under the cursor ${painted.join(" ")}`);
    // many rooms: still one row (tabs scroll inside their strip)
    await page.evaluate(() => window.__ev("()=>{for(let i=0;i<5;i++){createEmptyRoomAndActivate?0:0;}}")()).catch(() => {});
    for (let i = 0; i < 5; i++) await page.evaluate(() => window.__ev("()=>{rooms.push(createEmptyRoom(nextRoomId++,'room '+nextRoomId));renderRoomTabs();}")()).catch(() => {});
    await page.waitForTimeout(150);
    ok(await oneLine(), `${tag}: 6+ rooms still one row`);
    ok((await canvas()).w >= scale * 768 + 6 - 2, `${tag}: canvas unchanged with many room tabs`);
    // Follow camera: pan controls join the same row
    await page.evaluate(() => window.__ev("()=>{cameraMode='follow';renderCameraPanRow();renderAll();}")());
    await page.waitForTimeout(150);
    ok(await page.evaluate(() => document.getElementById("cameraPanRow").offsetParent !== null), `${tag}: pan controls visible in Follow`);
    ok(await oneLine(), `${tag}: tabs + pan + Score on one row in Follow`);
    ok(await noScroll() && (await canvas()).b <= h, `${tag}: Follow: no page scroll, canvas fits`);
    // Play
    await page.evaluate(() => window.__ev("()=>{cameraMode='fixed';while(rooms.length>1)rooms.pop();currentRoomId=rooms[0].id;renderRoomTabs();loadStarterBoard();}")()).catch(() => {});
    await page.waitForTimeout(100);
    await page.click("#modePlayBtn");
    await page.waitForTimeout(400);
    ok(await page.evaluate(() => document.body.classList.contains("play-mode")), `${tag}: Play started`);
    const hud = await page.evaluate(() => { const e = document.getElementById("hud"); const r = e.getBoundingClientRect(); return { h: r.height, text: e.innerText.replace(/\s+/g, " ") }; });
    ok(hud.h < 24 && /Lives/.test(hud.text) && /Score/.test(hud.text), `${tag}: Play HUD is one line "${hud.text}"`);
    c = await canvas();
    ok(c.b <= h && await noScroll(), `${tag}: Play: canvas inside viewport, no scroll`);
    ok((c.w - 6) / 768 >= scale - 0.001, `${tag}: Play canvas at least as big as Build (${((c.w - 6) / 768).toFixed(3)})`);
    if (shotDir && (tag === "1366x635" || tag === "1280x590")) await page.screenshot({ path: path.join(shotDir, `s2_play_${tag}.png`) });
    ok(errors.length === 0, `${tag}: no page errors ${errors.join(";")}`);
    await page.close();
  }
  await browser.close();
  console.log("\nviewport     before -> after (canvas scale, 1.0 = native 768 wide)");
  table.forEach(r => console.log(r[0].padEnd(11), String(r[1]).padEnd(7), "->", r[2]));
  console.log(`\n${pass} passed, ${fails.length} failed`); if (fails.length) { console.log(fails.join("\n")); process.exit(1); }
})();
