// v2.47 Stage 1: editor first-screen layout (not deployed). Usage: node tests/layout.test.js
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const REPO = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
if (!src.includes(anchor)) throw new Error("anchor missing");
const tmp = path.join(os.tmpdir(), "layout_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + `window.__ev=f=>eval("("+f+")");`));
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; console.log("ok  ", m); } else { fails.push(m); console.log("FAIL", m); } };
const SIZES = [[1280,720],[1366,768],[1180,820],[1440,900],[1920,1080]];
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  for (const [w, h] of SIZES) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const errors = []; page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept());
    await page.goto("file://" + tmp); await page.waitForFunction(() => window.__ev);
    await page.waitForTimeout(300);
    const box = await page.evaluate(() => { const r = document.getElementById("gameCanvas").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom }; });
    console.log(w + "x" + h, "canvas top", Math.round(box.y), "bottom", Math.round(box.b), "size", Math.round(box.w) + "x" + Math.round(box.h));
    ok(box.b <= h && box.y >= 0, `${w}x${h}: whole canvas inside viewport`);
    ok(Math.abs(box.h / box.w - 0.75) < 0.01, `${w}x${h}: aspect stays 4:3`);
    // top bar visible
    ok(await page.evaluate(() => { const r = document.getElementById("topBar").getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), `${w}x${h}: top bar visible`);
    // tabs on one line
    ok(await page.evaluate(() => { const bs = [...document.querySelectorAll("#placeTabs button")]; return new Set(bs.map(b => Math.round(b.getBoundingClientRect().top))).size === 1; }), `${w}x${h}: place tabs on one row`);
    // click lands on the cell under the cursor: paint ground solid at a chosen cell
    await page.click("#modeGround");
    await page.evaluate(() => { const s = [...document.querySelectorAll("#groundSwatches .swatch")]; (s[1] || s[0]).click(); });
    const cell = [7, 5];
    const px = box.x + 3 + (cell[0] + 0.5) * ((box.w - 6) / 24), py = box.y + 3 + (cell[1] + 0.5) * ((box.h - 6) / 18);
    await page.mouse.click(px, py);
    const painted = await page.evaluate(() => window.__ev("()=>{const o=[];for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){const g=board[y][x];if(g&&g!==\"none:none\")o.push([x,y]);}return o;}")());
    ok(painted.length === 1 && painted[0][0] === cell[0] && painted[0][1] === cell[1], `${w}x${h}: click painted the cell under the cursor (${JSON.stringify(painted)})`);
    ok(await page.evaluate(() => scrollY === 0 && document.documentElement.scrollHeight <= innerHeight + 1), `${w}x${h}: page never scrolled (scrollY 0, scrollHeight fits)`);
    ok(errors.length === 0, `${w}x${h}: no page errors ${errors.join(";")}`);
    await page.close();
  }
  await browser.close();
  console.log(`\n${pass} passed, ${fails.length} failed`); if (fails.length) { console.log(fails.join("\n")); process.exit(1); }
})();
