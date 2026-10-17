// v2.51 Stage 2: DPR-aware crisp board scales, 1.25 default ceiling, size stepper. Usage: node tests/v251s2.test.js
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
if (!src.includes(anchor)) throw new Error("anchor missing");
const tmp = path.join(os.tmpdir(), "v251s2_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + `window.__h={allowed:(m,d)=>allowedScales(m,d),fit:()=>JSON.parse(JSON.stringify(fitState)),
 check:()=>{const a=[];for(let i=0;i<64;i++)a.push(((i%8)+(i>>3))%2?"#ffffff":"#000000");const id=Object.keys(backgroundTileDefs)[0];backgroundTileDefs[id].art=a;delete backgroundTileDefs[id].frames;for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++)backgroundBoard[y][x]=id;renderAll();},
 painted:()=>{const o=[];for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){const g=board[y][x];if(g&&g!=="none:none")o.push(x+","+y);}return o}};`));
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; } else { fails.push(m); console.log("FAIL", m); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// in-page PNG decode: longest/shortest run of equal brightness along the middle row and column of the board content box
const MEASURE = async (page) => {
  const r = await page.evaluate(() => { const c = document.getElementById("gameCanvas"), b = c.getBoundingClientRect(), bw = parseFloat(getComputedStyle(c).borderLeftWidth), d = devicePixelRatio; return { x: (b.left + bw) * d, y: (b.top + bw) * d, w: (b.width - 2 * bw) * d, h: (b.height - 2 * bw) * d, dpr: d }; });
  const png = (await page.screenshot()).toString("base64");
  return await page.evaluate(async ({ png, r }) => {
    const img = new Image(); img.src = "data:image/png;base64," + png; await img.decode();
    const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height; const cx = cv.getContext("2d"); cx.drawImage(img, 0, 0);
    const X = Math.round(r.x), Y = Math.round(r.y), W = Math.round(r.w), H = Math.round(r.h);
    const row = cx.getImageData(X, Y + Math.round(H * 0.3), W, 1).data, col = cx.getImageData(X + Math.round(W * 0.3), Y, 1, H).data;
    const runs = (d, n, step) => { const out = []; let c = 1, prev = d[0] > 128; for (let i = 1; i < n; i++) { const b = d[i * 4] > 128; if (b === prev) c++; else { out.push(c); c = 1; prev = b; } } out.push(c); return out.slice(1, -1); };
    const uniq = a => [...new Set(a)].sort((p, q) => p - q);
    return { frac: Math.max(...[r.x, r.y, r.w, r.h].map(v => Math.abs(v - Math.round(v)))), xr: uniq(runs(row, W)), yr: uniq(runs(col, H)) };
  }, { png, r });
};
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  // 1. allowed scales per DPR
  const pg0 = await browser.newPage(); await pg0.goto("file://" + tmp + "#t"); await pg0.waitForFunction(() => window.__h);
  const exp = { 1: [0.5,0.75,1,1.25,1.5,1.75,2], 1.25: [1,2], 1.5: [0.5,1,1.5,2], 1.75: [1,2], 2: [0.5,0.75,1,1.25,1.5,1.75,2] };
  const table = {};
  for (const d of Object.keys(exp)) { const got = await pg0.evaluate(d => window.__h.allowed(2, +d), d); table[d] = got.filter(s => s >= 0.5); ok(eq(table[d], exp[d]), `allowed scales at DPR ${d}: ${JSON.stringify(table[d])}`); }
  await pg0.close();
  // 2. crispness + click accuracy at each DPR (fixed window, default size, and each allowed size via the stepper)
  const crisp = [];
  for (const dpr of [1, 1.25, 1.5, 2]) {
    const ctx = await browser.newContext({ viewport: { width: 2560, height: 1440 }, deviceScaleFactor: dpr });
    const page = await ctx.newPage(); const errors = []; page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept());
    await page.goto("file://" + tmp + "#t"); await page.waitForFunction(() => window.__h); await page.waitForTimeout(300);
    await page.evaluate(() => window.__h.check()); await page.waitForTimeout(200);
    const st0 = await page.evaluate(() => window.__h.fit());
    const sizes = st0.sizes;
    ok(Math.abs(st0.chosen - Math.max(...sizes.filter(s => s >= 1 && s <= 1.25 + 1e-9))) < 1e-9 || !sizes.length, `DPR ${dpr}: default is the largest allowed up to 1.25 (${st0.chosen})`);
    for (const target of sizes) {
      // step to the target size with the real buttons
      for (let i = 0; i < 12; i++) { const cur = (await page.evaluate(() => window.__h.fit())).chosen; if (Math.abs(cur - target) < 1e-9) break; await page.click(cur < target ? "#sizeUpBtn" : "#sizeDownBtn"); await page.waitForTimeout(80); }
      await page.evaluate(() => window.__h.check()); await page.waitForTimeout(120);
      const cur = (await page.evaluate(() => window.__h.fit())).chosen;
      ok(Math.abs(cur - target) < 1e-9, `DPR ${dpr}: stepped to ${target} (got ${cur})`);
      const m = await MEASURE(page);
      const want = 4 * target * dpr;
      ok(m.frac < 0.01, `DPR ${dpr} scale ${target}: board box on whole device pixels (off by ${m.frac.toFixed(3)})`);
      ok(eq(m.xr, [want]) && eq(m.yr, [want]), `DPR ${dpr} scale ${target}: every art pixel is ${want} device px wide and tall (x ${JSON.stringify(m.xr)}, y ${JSON.stringify(m.yr)})`);
      crisp.push([dpr, target, want, m.xr.join("/"), m.yr.join("/")]);
      // click accuracy: all four corners + centre cells, centre of each cell and near the cell's edges
      await page.evaluate(() => { document.getElementById("modeGround").click(); const s = [...document.querySelectorAll("#groundSwatches .swatch")]; (s[1] || s[0]).click(); });
      const box = await page.evaluate(() => { const c = document.getElementById("gameCanvas"), b = c.getBoundingClientRect(), bw = parseFloat(getComputedStyle(c).borderLeftWidth); return { x: b.left + bw, y: b.top + bw, w: b.width - 2 * bw, h: b.height - 2 * bw }; });
      const cells = [[0,0],[23,0],[0,17],[23,17],[12,9]], fr = [[0.5,0.5],[0.1,0.1],[0.9,0.9]];
      for (const [fx, fy] of fr) {
        await page.evaluate(() => { document.getElementById("clearAllBtn").click(); }); await page.waitForTimeout(60);
        await page.evaluate(() => window.__h.check());
        for (const [cx, cy] of cells) await page.mouse.click(box.x + (cx + fx) * box.w / 24, box.y + (cy + fy) * box.h / 18);
        const painted = await page.evaluate(() => window.__h.painted());
        ok(eq(painted.sort(), cells.map(c => c.join(",")).sort()), `DPR ${dpr} scale ${target}: clicks at cell offset ${fx},${fy} land in the clicked cell (${painted.join(" ")})`);
      }
    }
    ok(errors.length === 0, `DPR ${dpr}: no page errors ${errors}`);
    await ctx.close();
  }
  // 3. stepper behaviour: hidden when only one size fits, remembered per browser, default 1.25, auto when back at default
  const cases = [[1366, 635], [1280, 590], [1920, 1080], [2560, 1440]];
  for (const [w, h] of cases) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage(); page.on("dialog", d => d.accept());
    await page.goto("file://" + tmp + "#t"); await page.waitForFunction(() => window.__h); await page.waitForTimeout(300);
    const info = await page.evaluate(() => ({ st: window.__h.fit(), vis: document.getElementById("sizeStepper").style.display !== "none", w: document.getElementById("gameCanvas").getBoundingClientRect().width, scroll: document.scrollingElement.scrollHeight > innerHeight + 1 }));
    console.log(`  ${w}x${h}: sizes ${JSON.stringify(info.st.sizes)} chosen ${info.st.chosen} stepper ${info.vis ? "shown" : "hidden"}`);
    ok(info.vis === (info.st.sizes.length > 1), `${w}x${h}: stepper hidden iff only one size`);
    ok(!info.scroll, `${w}x${h}: no page scroll`);
    if (w <= 1366) ok(info.st.free && !info.vis, `${w}x${h}: below 1.0 the free fit is kept and no stepper`);
    if (info.vis) {
      ok(info.st.chosen <= 1.25 + 1e-9, `${w}x${h}: default capped at 1.25`);
      const up = info.st.sizes.filter(s => s > info.st.chosen).length, down = info.st.sizes.filter(s => s < info.st.chosen).length;
      ok((await page.evaluate(() => document.getElementById("sizeUpBtn").disabled)) === (up === 0), `${w}x${h}: + disabled only at the largest`);
      ok((await page.evaluate(() => document.getElementById("sizeDownBtn").disabled)) === (down === 0), `${w}x${h}: - disabled only at the smallest`);
      if (up) { await page.click("#sizeUpBtn"); await page.waitForTimeout(200);
        const after = await page.evaluate(() => ({ c: window.__h.fit().chosen, pref: localStorage.getItem("toyGameDesigner.boardScale"), scroll: document.scrollingElement.scrollHeight > innerHeight + 1 }));
        ok(after.c > info.st.chosen && !after.scroll, `${w}x${h}: + makes the board bigger without scrolling (${after.c})`);
        await page.reload(); await page.waitForFunction(() => window.__h); await page.waitForTimeout(300);
        ok(Math.abs((await page.evaluate(() => window.__h.fit().chosen)) - after.c) < 1e-9, `${w}x${h}: chosen size remembered after reload`);
        await page.click("#sizeDownBtn"); await page.waitForTimeout(200);
        ok((await page.evaluate(() => localStorage.getItem("toyGameDesigner.boardScale"))) === "auto", `${w}x${h}: stepping back to the default stores "auto"`);
      }
    }
    await ctx.close();
  }
  // a window shrinking below a remembered size clamps instead of overflowing
  { const ctx = await browser.newContext({ viewport: { width: 2560, height: 1440 } }); await ctx.addInitScript(() => { try { localStorage.setItem("toyGameDesigner.boardScale", "1.75"); } catch (e) {} });
    const page = await ctx.newPage(); page.on("dialog", d => d.accept()); await page.goto("file://" + tmp + "#t"); await page.waitForFunction(() => window.__h); await page.waitForTimeout(300);
    ok(Math.abs((await page.evaluate(() => window.__h.fit().chosen)) - 1.75) < 1e-9, "remembered 1.75 applies in a big window");
    await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(400);
    const a = await page.evaluate(() => ({ c: window.__h.fit().chosen, scroll: document.scrollingElement.scrollHeight > innerHeight + 1 }));
    ok(a.c <= 1.25 + 1e-9 && !a.scroll, `shrinking the window clamps the remembered size (${a.c}) with no scroll`);
    await ctx.close(); }
  // blocked localStorage must not break anything
  { const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } }); await ctx.addInitScript(() => { Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } }); });
    const page = await ctx.newPage(); const errs = []; page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept());
    await page.goto("file://" + tmp + "#t"); await page.waitForTimeout(500);
    ok(await page.evaluate(() => document.getElementById("gameCanvas").getBoundingClientRect().width) > 700, "board still fits with localStorage blocked");
    ok(!errs.some(e => /blocked/.test(e)), "no uncaught error from blocked storage " + errs.filter(e => /blocked/.test(e)).slice(0, 1));
    await ctx.close(); }
  await browser.close();
  console.log("\nallowed scales (>=0.5, <=2):"); for (const d in table) console.log("  DPR", d, JSON.stringify(table[d]));
  console.log("measured art-pixel runs (device px):"); crisp.forEach(r => console.log("  DPR", r[0], "scale", r[1], "expected", r[2], "x", r[3], "y", r[4]));
  console.log(`\n${pass} passed, ${fails.length} failed`);
  process.exit(fails.length ? 1 : 0);
})();
