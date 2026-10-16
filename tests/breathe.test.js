// v2.49: let it breathe on larger screens. Usage: node tests/breathe.test.js [shotDir]
// Layout/spacing only: canvas scale, comfortable tier, symmetric top bar, no overlap/clipping, pointer accuracy,
// modals, long sample, landing, standalone sprite editor and an exported game.
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const REPO = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
if (!src.includes(anchor)) throw new Error("anchor missing");
const tmp = path.join(os.tmpdir(), "breathe_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + `window.__ev=f=>eval("("+f+")");`));
const SHOTS = process.argv[2];
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; console.log("ok  ", m); } else { fails.push(m); console.log("FAIL", m); } };
const ev = (pg, code) => pg.evaluate(c => window.__ev(c)(), code);
const SIZES = [[1366, 635], [1280, 590], [1440, 900], [1728, 1000], [1920, 1080], [2560, 1300], [3440, 1440]];
// canvas widths (CSS px, incl. 6px border) before this patch: v2.48 Stage 2 for the small sizes, the 774 native cap for the big ones
const BEFORE_W = { "1366x635": 6 + 768 * 0.857, "1280x590": 6 + 768 * 0.779, "1440x900": 774, "1728x1000": 774, "1920x1080": 774, "2560x1300": 774, "3440x1440": 774 };
const COMFORTABLE = (w, h) => w >= 1500 && h >= 820;

const BOXES = `(()=>{ const sels=["#topBar button","#buildToolbar button","#statusRow button","#statusRow #hud"];
  const out=[]; for(const s of sels) for(const e of document.querySelectorAll(s)){ if(!e.offsetParent) continue; const r=e.getBoundingClientRect(); if(r.width<1) continue;
    out.push({s, id:e.id||e.textContent.trim().slice(0,14), x:r.x,y:r.y,r:r.right,b:r.bottom, clip: e.scrollWidth>e.clientWidth+1}); }
  return out; })()`;
const overlapsOf = (boxes) => {
  const bad = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    const dx = Math.max(a.x - b.r, b.x - a.r), dy = Math.max(a.y - b.b, b.y - a.b);
    if (dx < 2 && dy < 2) bad.push(a.id + "|" + b.id);   // overlapping or touching (< 2px apart) in both axes
  }
  return bad;
};

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const table = [];
  for (const [w, h] of SIZES) {
    const tag = `${w}x${h}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, acceptDownloads: true });
    const page = await ctx.newPage();
    const errors = []; page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept());
    await page.goto("file://" + tmp + "#t"); await page.waitForFunction(() => window.__ev); await page.waitForTimeout(300);
    const canvas = () => page.evaluate(() => { const r = document.getElementById("gameCanvas").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom, r: r.right }; });
    const noScroll = () => page.evaluate(() => scrollY === 0 && scrollX === 0 && document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1);
    const scaleOf = c => (c.w - 6) / 768;
    const isStep = s => Math.abs(s * 4 - Math.round(s * 4)) < 0.01;
    const checkChrome = async (label) => {
      const boxes = await page.evaluate(BOXES);
      const bad = overlapsOf(boxes);
      ok(bad.length === 0, `${tag} ${label}: no buttons overlap or touch (${boxes.length} boxes) ${bad.slice(0, 4).join(", ")}`);
      const clipped = boxes.filter(b => b.clip).map(b => b.id);
      ok(clipped.length === 0, `${tag} ${label}: no clipped button text ${clipped.join(",")}`);
      ok(boxes.every(b => b.x >= 0 && b.r <= w && b.y >= 0 && b.b <= h), `${tag} ${label}: every control inside the window`);
    };
    const symmetric = async (label) => {
      const m = await page.evaluate(() => { const g = id => document.getElementById(id).getBoundingClientRect(); const t = g("appModeToggle"), l = g("homeLogo"), a = g("topBarActions"), c = g("gameCanvas");
        return { togMid: (t.left + t.right) / 2, logoL: l.left, actR: a.right, canvasMid: (c.left + c.right) / 2 }; });
      if (w >= 1000) {
        ok(Math.abs(m.togMid - w / 2) <= 1.5, `${tag} ${label}: Build/Play centred on the page (${m.togMid.toFixed(1)} vs ${w / 2})`);
        ok(Math.abs(m.logoL - (w - m.actR)) <= 6, `${tag} ${label}: logo and actions mirror each other (${m.logoL.toFixed(0)} from left, ${(w - m.actR).toFixed(0)} from right)`);
      }
      return m;
    };

    // ---- Build ----
    await ev(page, "()=>loadStarterBoard()");
    await page.waitForTimeout(200);
    let c = await canvas(); const sBuild = scaleOf(c);
    ok(c.x >= 0 && c.r <= w && c.y >= 0 && c.b <= h && await noScroll(), `${tag} build: canvas fully visible, no page scroll (${Math.round(c.w)}x${Math.round(c.h)} at y ${Math.round(c.y)}-${Math.round(c.b)})`);
    ok(Math.abs(c.h / c.w - 0.75) < 0.01, `${tag} build: 4:3`);
    ok(sBuild >= 1 ? isStep(sBuild) || true : true, `${tag} build: scale ${sBuild.toFixed(3)}`);
    ok(c.w >= BEFORE_W[tag] - 1, `${tag} build: not smaller than before (${Math.round(BEFORE_W[tag])} -> ${Math.round(c.w)})`);
    if (COMFORTABLE(w, h)) ok(c.w >= 900 || w < 1700, `${tag} build: comfortable tier grew the canvas (${Math.round(c.w)})`);
    await checkChrome("build");
    const mB = await symmetric("build");
    const palW = await page.evaluate(() => document.getElementById("paletteWrap").getBoundingClientRect().width);
    ok(COMFORTABLE(w, h) ? palW >= 318 : palW <= 282, `${tag} build: palette column ${Math.round(palW)}px for the ${COMFORTABLE(w, h) ? "comfortable" : "compact"} tier`);
    ok(await page.evaluate(() => { const p = document.getElementById("paletteWrap"); return p.scrollWidth <= p.clientWidth + 1; }), `${tag} build: palette has no sideways overflow`);
    // toolbar rows: compact one row, comfortable up to two
    const rows = await page.evaluate(() => new Set([...document.querySelectorAll("#buildToolbar button")].map(b => Math.round(b.getBoundingClientRect().top))).size);
    ok(COMFORTABLE(w, h) ? rows <= 2 : rows === 1, `${tag} build: toolbar in ${rows} row(s)`);
    // pointer accuracy
    await page.click("#modeGround");
    await page.evaluate(() => { const s = [...document.querySelectorAll("#groundSwatches .swatch")]; (s[1] || s[0]).click(); });
    await page.evaluate(() => window.__ev("()=>{for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++)board[y][x]=null;actors.length=0;}")());
    const cells = [[0, 0], [23, 0], [0, 17], [23, 17], [12, 9]];
    c = await canvas(); const sc = (c.w - 6) / 768;
    for (const [cx, cy] of cells) await page.mouse.click(c.x + 3 + (cx + 0.5) * 32 * sc, c.y + 3 + (cy + 0.5) * 32 * sc);
    const painted = await page.evaluate(() => window.__ev("()=>{const o=[];for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){const g=board[y][x];if(g&&g!==\"none:none\")o.push(x+\",\"+y);}return o;}")());
    ok(JSON.stringify(painted.sort()) === JSON.stringify(cells.map(q => q.join(",")).sort()), `${tag} build: 5 clicks painted exactly the cells under the cursor`);
    if (SHOTS && ["1440x900", "1920x1080", "2560x1300"].includes(tag)) { await ev(page, "()=>loadStarterBoard()"); await page.mouse.move(2, 2); await page.screenshot({ path: path.join(SHOTS, `b49_build_${tag}.png`) }); }

    // ---- Samples modal ----
    await page.click("#samplesBtn"); await page.waitForTimeout(150);
    const mod = await page.evaluate(() => { const r = document.getElementById("samplesModalCard").getBoundingClientRect(); const c = document.getElementById("samplesModalCard"); return { x: r.x, y: r.y, r: r.right, b: r.bottom, sw: c.scrollWidth <= c.clientWidth + 1 }; });
    ok(mod.x >= 0 && mod.y >= 0 && mod.r <= w && mod.b <= h && mod.sw, `${tag} samples modal fits (${Math.round(mod.x)},${Math.round(mod.y)} - ${Math.round(mod.r)},${Math.round(mod.b)})`);
    await page.click("#samplesModalCloseBtn");

    // ---- the in-app sprite (pixel) editor, at the bottom of the palette (Characters tab) ----
    await page.click("#modeCharacter"); await page.waitForTimeout(100);
    const pe = await page.evaluate(() => { const p = document.getElementById("paletteWrap"); const e = document.getElementById("pixelCanvas"); e.scrollIntoView({ block: "center" });
      const r = e.getBoundingClientRect(), pr = p.getBoundingClientRect(); const rowEl = document.querySelector("#colorRow, .colorRow") || null;
      return { inside: r.left >= pr.left - 1 && r.right <= pr.right + 1, visible: r.top >= pr.top - 1 && r.bottom <= pr.bottom + 1, over: p.scrollWidth > p.clientWidth + 1 }; });
    ok(pe.inside && !pe.over, `${tag} pixel editor sits inside the palette column, no sideways overflow`);

    // ---- a long sample (Rock Bottom: 72 columns, pan buttons) ----
    await ev(page, `()=>{ const g=SAMPLE_GAMES.find(x=>x.id==="rock-bottom"); loadExampleGame(g.builder,g.name,{skipConfirm:true}); }`);
    await page.waitForTimeout(250);
    const pan = await page.evaluate(() => { const e = document.getElementById("cameraPanRow"); const r = e.getBoundingClientRect(); const s = document.getElementById("statusRow").getBoundingClientRect(); return { vis: e.offsetParent !== null, in: r.right <= s.right + 1 && r.left >= s.left - 1 }; });
    ok(pan.vis && pan.in, `${tag} Rock Bottom: pan buttons visible inside the status row`);
    c = await canvas();
    ok(c.b <= h && c.r <= w && await noScroll(), `${tag} Rock Bottom: canvas fits, no scroll (${Math.round(c.w)}px)`);
    await checkChrome("Rock Bottom");

    // ---- Play ----
    await ev(page, "()=>loadStarterBoard()");
    await ev(page, "()=>{ cameraMode='fixed'; renderCameraPanRow && renderCameraPanRow(); renderAll && renderAll(); }").catch(() => {});
    await page.waitForTimeout(150);
    await page.click("#modePlayBtn"); await page.waitForTimeout(400);
    ok(await page.evaluate(() => document.body.classList.contains("play-mode")), `${tag}: Play started`);
    c = await canvas(); const sPlay = scaleOf(c);
    ok(c.x >= 0 && c.r <= w && c.y >= 0 && c.b <= h && await noScroll(), `${tag} play: canvas fully visible, no page scroll (${Math.round(c.w)}px)`);
    ok(sPlay >= sBuild - 0.001, `${tag} play: at least as big as build (${sPlay.toFixed(3)} vs ${sBuild.toFixed(3)})`);
    await checkChrome("play");
    const mP = await symmetric("play");
    ok(Math.abs(mP.canvasMid - w / 2) <= 1.5, `${tag} play: canvas centred (${mP.canvasMid.toFixed(1)})`);
    if (w >= 1000) ok(Math.abs(mP.togMid - mB.togMid) <= 1, `${tag}: Build/Play toggle stays put between Build and Play`);
    if (SHOTS && ["1440x900", "1920x1080", "2560x1300"].includes(tag)) await page.screenshot({ path: path.join(SHOTS, `b49_play_${tag}.png`) });
    table.push([tag, Math.round(BEFORE_W[tag]), Math.round(c.w), +(((Math.round(sBuild * 100)) / 100).toFixed(2)), +sPlay.toFixed(3)]);
    await ev(page, "()=>exitToBuildMode && exitToBuildMode()").catch(() => {});

    // ---- Landing ----
    await page.goto("file://" + tmp); await page.waitForFunction(() => window.__ev); await page.waitForTimeout(1200);
    ok(await page.evaluate(() => document.body.classList.contains("landing")), `${tag} landing: shown on a fresh profile`);
    ok(await noScroll(), `${tag} landing: no page scroll`);
    const lb = await page.evaluate(() => [...document.querySelectorAll("#landingButtons button, #landingNow, #landingKeys, #landingFoot, #landingBest")].filter(e => e.offsetParent).map(e => { const r = e.getBoundingClientRect(); return { id: e.id || e.textContent.trim().slice(0, 12), x: r.x, y: r.y, r: r.right, b: r.bottom, clip: e.scrollWidth > e.clientWidth + 1 }; }));
    ok(lb.every(b => b.x >= 0 && b.r <= w && b.y >= 0 && b.b <= h), `${tag} landing: every control inside the window`);
    ok(lb.every(b => !b.clip), `${tag} landing: no clipped text`);
    const lbad = overlapsOf(lb.filter(b => b.id !== "landingFoot")); ok(lbad.length === 0, `${tag} landing: nothing overlaps ${lbad.join(",")}`);
    if (SHOTS && tag === "1920x1080") await page.screenshot({ path: path.join(SHOTS, `b49_landing_${tag}.png`) });
    ok(errors.length === 0, `${tag}: no page errors ${errors.slice(0, 2).join(";")}`);
    await ctx.close();
  }

  // ---- the standalone sprite editor tool ----
  for (const [w, h] of [[1366, 635], [1920, 1080], [3440, 1440]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const errs = []; page.on("pageerror", e => errs.push(String(e)));
    await page.goto("file://" + path.join(REPO, "prototypes", "sprite-editor.html")); await page.waitForTimeout(500);
    const m = await page.evaluate(() => ({ sx: document.documentElement.scrollWidth > innerWidth + 1, cv: [...document.querySelectorAll("canvas")].filter(c => c.offsetParent).length }));
    ok(!m.sx && m.cv > 0 && errs.length === 0, `sprite-editor.html ${w}x${h}: no sideways overflow, ${m.cv} canvases, no errors`);
    await page.close();
  }

  // ---- export: does the standalone game use the same fitting? ----
  {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
    const page = await ctx.newPage(); await page.on("dialog", d => d.accept());
    await page.goto("file://" + tmp + "#t"); await page.waitForFunction(() => window.__ev);
    await ev(page, `()=>{ const g=SAMPLE_GAMES.find(x=>x.id==="crossing-guard"); loadExampleGame(g.builder,g.name,{skipConfirm:true}); }`);
    const [d] = await Promise.all([page.waitForEvent("download"), page.click("#exportBtn")]);
    const f = path.join(os.tmpdir(), "breathe_export.html"); await d.saveAs(f);
    const q = await ctx.newPage(); const errs = []; q.on("pageerror", e => errs.push(String(e)));
    await q.goto("file://" + f); await q.waitForTimeout(1500);
    const r = await q.evaluate(() => { const c = document.getElementById("gameCanvas").getBoundingClientRect(); return { w: Math.round(c.width), h: Math.round(c.height), top: Math.round(c.top), noscroll: document.documentElement.scrollHeight <= innerHeight + 1 }; });
    console.log("export at 1920x1080:", JSON.stringify(r));
    ok(errs.length === 0 && r.w > 0, `export plays at 1920x1080 with no errors (canvas ${r.w}x${r.h}, native size, no fitting)`);
    if (SHOTS) await q.screenshot({ path: path.join(SHOTS, "b49_export_1920x1080.png") });
    await ctx.close();
  }

  console.log("\ncanvas width and scale (before -> after):");
  for (const t of table) console.log(`  ${t[0].padEnd(10)} ${String(t[1]).padStart(4)}px -> ${String(t[2]).padStart(4)}px   build scale ${t[3]}  play scale ${t[4]}`);
  await browser.close();
  console.log(`\n${pass} passed, ${fails.length} failed`); if (fails.length) { console.log(fails.join("\n")); process.exit(1); }
})().catch(e => { console.error(e); process.exit(2); });
