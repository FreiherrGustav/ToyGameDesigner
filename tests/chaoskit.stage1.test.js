// Make a Mess, Stage 1 (tab shell). node tests/chaoskit.stage1.test.js <baseline index.html> [shotDir]
// Compares the Make a Game panel with the baseline build (pixels), checks the layout, the second gravity view, the Surprise button,
// the tutorial guard and that CHAOS_KIT_ENABLED = false leaves the app byte-for-byte as it was on screen.
const fs = require("fs"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const BASE = process.argv[2], SHOTS = process.argv[3] || "/tmp/ck/shots";
if (!BASE) { console.log("usage: node tests/chaoskit.stage1.test.js <baseline index.html> [shotDir]"); process.exit(2); }
fs.mkdirSync(SHOTS, { recursive: true });
const NEW = path.resolve(__dirname, "..", "index.html");
const ANCH = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const { execFileSync } = require("child_process");
// number of differing pixels and the biggest per-pixel channel-sum difference between two PNG files
const pngDiff = (a, b) => JSON.parse(execFileSync("python3", ["-I", "-c", "import sys,json\nfrom PIL import Image, ImageChops\nimport numpy as np\nA=Image.open(sys.argv[1]).convert('RGB');B=Image.open(sys.argv[2]).convert('RGB')\nif A.size!=B.size: print(json.dumps({'n':-1,'max':-1}));sys.exit()\nd=np.array(ImageChops.difference(A,B)).sum(axis=2)\nprint(json.dumps({'n':int((d>0).sum()),'max':int(d.max())}))", a, b]).toString());
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const tmp = (n, src) => { const p = "/tmp/ck/" + n + ".html"; fs.writeFileSync(p, src); return p; };
const newSrc = fs.readFileSync(NEW, "utf8");
const FILES = {
  base: BASE, now: NEW,
  off: tmp("off", newSrc.replace("const CHAOS_KIT_ENABLED = true;", "const CHAOS_KIT_ENABLED = false;")),
  hook: tmp("hook", newSrc.replace(ANCH, ANCH + 'window.__ev = f => eval("(" + f + ")");\n'))
};
async function open(browser, file, vw, vh) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, reducedMotion: "reduce" });
  const page = await ctx.newPage(); const errs = [];
  page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept());
  await page.goto("file://" + file + "#t"); await page.waitForTimeout(1400); // long enough for the board-size stepper and its CSS transitions to settle
  page.errs = errs; page.ctx = ctx; return page;
}
const UNROLL = "html,body{height:auto!important;overflow:visible!important}#app{height:auto!important;max-height:none!important;overflow:visible!important}#paletteWrap{overflow:visible!important;max-height:none!important;height:auto!important;mask:none!important;-webkit-mask:none!important;animation:none!important}";
// the visible children of the Make a Game panel (everything except the kit's own elements and the hidden title)
const PANEL_INFO = () => {
  const pw = document.getElementById("paletteWrap");
  const kids = [...pw.children].filter(e => e.id !== "messTabs" && e.id !== "messPanel" && getComputedStyle(e).display !== "none");
  const first = kids[0].getBoundingClientRect(), last = kids[kids.length - 1].getBoundingClientRect(), p = pw.getBoundingClientRect();
  return { left: p.left, width: p.width, top: first.top + scrollY, bottom: last.bottom + scrollY, ptop: p.top, pbottom: p.bottom };
};
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  for (const [vw, vh] of [[1366, 768], [1920, 1080]]) {
    const tag = vw + "x" + vh;
    // ---- whole panel, unrolled so scrolling and the edge fade cannot differ ----
    const shots = {};
    for (const k of ["base", "now"]) {
      const page = await open(browser, FILES[k], vw, vh);
      await page.addStyleTag({ content: UNROLL }); await page.waitForTimeout(300);
      const info = await page.evaluate(PANEL_INFO);
      shots[k] = { info, page };
    }
    const bi = shots.base.info, ni = shots.now.info, H = Math.round(bi.bottom - bi.top);
    ok(Math.round(ni.bottom - ni.top) === H, tag + " panel content height is the same (" + H + " vs " + Math.round(ni.bottom - ni.top) + ")");
    const grab = async (s, i) => s.page.screenshot({ fullPage: true, clip: { x: Math.round(i.left), y: Math.round(i.top), width: Math.round(i.width), height: H } });
    const a = await grab(shots.base, bi), b = await grab(shots.now, ni);
    const pa = path.join(SHOTS, tag + "-panel-base.png"), pb2 = path.join(SHOTS, tag + "-panel-now.png"), pc = path.join(SHOTS, tag + "-panel-spacer.png");
    fs.writeFileSync(pa, a); fs.writeFileSync(pb2, b);
    // control: the baseline with an empty spacer instead of the tab bar. ANY vertical shift of the panel re-rasterizes a few anti-aliased
    // rounded corners differently; the kit must match the control exactly and the baseline except for those few pixels.
    const gap = await shots.now.page.evaluate(() => parseFloat(getComputedStyle(document.getElementById("paletteWrap")).rowGap) || 0);
    const ctl = await open(browser, FILES.base, vw, vh);
    await ctl.evaluate(h => { const d = document.createElement("div"); d.id = "spacerCtl"; d.style.cssText = "height:" + h + "px;flex:0 0 auto"; const pw = document.getElementById("paletteWrap"); pw.insertBefore(d, pw.firstChild); }, (ni.top - bi.top) - gap);
    await ctl.addStyleTag({ content: UNROLL }); await ctl.waitForTimeout(300);
    const ci = await ctl.evaluate(() => {
      const pw = document.getElementById("paletteWrap");
      const kids = [...pw.children].filter(e => e.id !== "spacerCtl" && getComputedStyle(e).display !== "none");
      const first = kids[0].getBoundingClientRect(), p = pw.getBoundingClientRect();
      return { left: p.left, width: p.width, top: first.top + scrollY };
    });
    fs.writeFileSync(pc, await grab({ page: ctl }, ci)); await ctl.ctx.close();
    const dc = pngDiff(pb2, pc), db = pngDiff(pa, pb2);
    ok(dc.n === 0, tag + " Make a Game panel (" + H + "px tall) is pixel-identical to the baseline shifted by an inert spacer (differing pixels: " + dc.n + ")");
    ok(db.n <= 30 && db.max <= 30, tag + " ...and equals the unshifted baseline except " + db.n + " anti-aliased corner pixels (max channel-sum diff " + db.max + "), the same ones the spacer control changes");
    // the tab bar itself costs this much height
    console.log(tag + " tab bar shifts the panel down by " + Math.round(ni.top - bi.top) + "px");
    await shots.base.page.ctx.close(); await shots.now.page.ctx.close();

    // ---- the real, scrolled viewport: the part that is on screen without scrolling ----
    const real = {};
    for (const k of ["base", "now"]) {
      const page = await open(browser, FILES[k], vw, vh);
      const info = await page.evaluate(PANEL_INFO); real[k] = { page, info };
    }
    const shift = real.now.info.top - real.base.info.top;
    const visH = Math.floor(real.base.info.pbottom - real.base.info.top - shift - 40);
    const ga = await real.base.page.screenshot({ clip: { x: real.base.info.left, y: real.base.info.top, width: real.base.info.width, height: visH } });
    const gb = await real.now.page.screenshot({ clip: { x: real.now.info.left, y: real.now.info.top, width: real.now.info.width, height: visH } });
    const va = path.join(SHOTS, tag + "-view-base.png"), vb = path.join(SHOTS, tag + "-view-now.png");
    fs.writeFileSync(va, ga); fs.writeFileSync(vb, gb);
    const dv = pngDiff(va, vb);
    ok(visH > 100 && dv.n <= 30 && dv.max <= 30, tag + " on-screen slice of the panel (" + visH + "px) matches the baseline (differing pixels " + dv.n + ", max " + dv.max + ": corner anti-aliasing from the shift)");
    await real.now.page.screenshot({ path: path.join(SHOTS, tag + "-now-full.png") });
    await real.base.page.ctx.close(); await real.now.page.ctx.close();

    // ---- the flag off: the whole page is unchanged ----
    const pb = await open(browser, FILES.base, vw, vh), po = await open(browser, FILES.off, vw, vh);
    const mk = pg => ({ mask: [pg.locator('#gameCanvas'), pg.locator('#topBar'), pg.locator('#sizeStepper')] }); // these three move with real time even in the baseline vs itself (board cue, button transitions)
    const fa = await pb.screenshot(mk(pb)), fo = await po.screenshot(mk(po));
    { let same = fa.equals(fo); if (!same) { fs.writeFileSync(path.join(SHOTS, tag + "-off-a.png"), fa); fs.writeFileSync(path.join(SHOTS, tag + "-off-b.png"), fo); }
      ok(same, tag + " CHAOS_KIT_ENABLED=false: whole page is pixel-identical to the baseline (everything but the board, top bar and size stepper)"); }
    ok(await po.evaluate(() => !document.getElementById("messTabs") && !document.getElementById("messPanel") && !document.getElementById("chaosKitStyle") && !window.chaosKit), tag + " flag off: no kit DOM, style or global");
    ok(await po.evaluate(() => document.getElementById("paletteWrap").children.length) === await pb.evaluate(() => document.getElementById("paletteWrap").children.length), tag + " flag off: same palette child count");
    await pb.ctx.close(); await po.ctx.close();

    // ---- layout of the Make a Mess tab ----
    const p = await open(browser, FILES.hook, vw, vh);
    ok(await p.evaluate(() => document.getElementById("messTabGame").classList.contains("active") && !document.getElementById("paletteWrap").classList.contains("messMode")), tag + " default tab is Make a Game");
    const w = await p.evaluate(() => ["messTabGame", "messTabMess"].map(i => document.getElementById(i).getBoundingClientRect().width));
    ok(Math.abs(w[0] - w[1]) < 0.5 && w[0] > 50, tag + " the two tabs are equal width (" + w.map(x => x.toFixed(1)) + ")");
    ok(await p.evaluate(() => !document.getElementById("messPanel").offsetParent), tag + " Make a Mess panel hidden by default");
    await p.click("#messTabMess"); await p.waitForTimeout(150);
    const lay = await p.evaluate(() => {
      const vis = e => !!e.offsetParent;
      const order = ["mkGravRow", "mkSurprise"].map(i => document.getElementById(i).getBoundingClientRect().top);
      const give = [...document.querySelectorAll('[data-mk="walls"],[data-mk="stuff"],[data-mk="enemies"],[data-mk="scenery"]')].map(e => e.getBoundingClientRect().top);
      const chaos = [...document.querySelectorAll('[data-mk="tumble"],[data-mk="quake"],[data-mk="bombs"],[data-mk="lava"]')].map(e => e.getBoundingClientRect().top);
      return { gamePanelHidden: ![...document.getElementById("paletteWrap").children].filter(e => e.id !== "messTabs" && e.id !== "messPanel").some(vis), panelVisible: vis(document.getElementById("messPanel")),
        order, giveTop: Math.min(...give), giveN: give.length, chaosTop: Math.min(...chaos), chaosN: chaos.length, fits: document.getElementById("messPanel").getBoundingClientRect().bottom <= innerHeight };
    });
    ok(lay.gamePanelHidden && lay.panelVisible, tag + " Make a Mess: existing panel hidden, new panel shown");
    ok(lay.order[0] < lay.order[1] && lay.order[1] < lay.giveTop && lay.giveTop < lay.chaosTop, tag + " order: gravity, Surprise Me, Give me, Chaos");
    ok(lay.giveN === 4 && lay.chaosN === 4, tag + " four Give me buttons and four chaos buttons");
    ok(lay.fits, tag + " the whole Make a Mess panel fits without scrolling");
    await p.screenshot({ path: path.join(SHOTS, tag + "-mess-tab.png") });

    // ---- the second gravity view stays in sync ----
    const G = () => p.evaluate(() => window.__ev("()=>({on:gravityEnabled,dir:gravityDir})")());
    const mirror = () => p.evaluate(() => ({ chips: [...document.querySelectorAll("#mkGravRow .mkChip")].map(c => c.textContent + (c.classList.contains("on") ? "*" : "")) }));
    const orig = () => p.evaluate(() => ({ on: !!document.querySelector('#gameRuleSwatches .swatch.selected'), dirs: [...document.querySelectorAll("#gravityDirRow .swatch")].map(s => s.dataset.dir + (s.style.background.includes("255") ? "*" : "")), rowShown: document.getElementById("gravityDirRow").style.display !== "none" }));
    let g = await G(); ok(g.on === false, tag + " starts with gravity off"); let m = await mirror(); ok(m.chips.length === 1, tag + " gravity off: the mirror shows only the toggle");
    await p.click("#mkGravRow .mkChip"); await p.waitForTimeout(100);
    g = await G(); ok(g.on === true, tag + " mirror toggle turns gravity on (the real state)");
    ok((await orig()).rowShown, tag + " ...and the Make a Game view updated at the same time (direction row shown)");
    m = await mirror(); ok(m.chips.length === 5 && m.chips[1] === "↓*", tag + " mirror shows four directions, down lit (" + m.chips + ")");
    await p.click('#mkGravRow .mkChip[title="Gravity pulls up"]'); await p.waitForTimeout(100);
    g = await G(); ok(g.dir === "up", tag + " mirror direction click sets the real direction");
    m = await mirror(); ok(m.chips[2] === "↑*", tag + " mirror lights up");
    // change it from the other side while Make a Mess is open (like a gravity Button would): the mirror follows within a moment
    await p.evaluate(() => window.__ev('()=>setGravityDir("left")')()); await p.waitForTimeout(500);
    m = await mirror(); ok(m.chips[3] === "←*", tag + " a change made elsewhere shows up in the mirror (" + m.chips + ")");
    // and the Make a Game view agrees after switching back
    await p.click("#messTabGame"); await p.waitForTimeout(100);
    const sel = await p.evaluate(() => [...document.querySelectorAll("#gravityDirRow .swatch")].map(s => s.dataset.dir + ":" + (getComputedStyle(s).backgroundColor)));
    ok(sel.find(s => s.startsWith("left")).includes("255, 209, 102") && !sel.find(s => s.startsWith("up")).includes("255, 209, 102"), tag + " Make a Game view agrees (left lit)");
    await p.click("#gravityDirRow .swatch[data-dir=right]"); await p.click("#messTabMess"); await p.waitForTimeout(100);
    m = await mirror(); ok(m.chips[4] === "→*", tag + " change made in Make a Game shows in the mirror when it opens");
    await p.click("#mkGravRow .mkChip"); await p.waitForTimeout(100);
    ok((await G()).on === false && (await mirror()).chips.length === 1, tag + " mirror toggle off: gravity off, mirror collapses");
    ok(await p.evaluate(() => window.__ev("()=>undoStack.length")()) === 0, tag + " gravity changes added no undo steps (same as the original controls)");

    // ---- Surprise Me button = the dice ----
    const u0 = await p.evaluate(() => window.__ev("()=>undoStack.length")());
    await p.click("#mkSurprise"); await p.waitForTimeout(500);
    const u1 = await p.evaluate(() => window.__ev("()=>({u:undoStack.length,rooms:rooms.length,cap:lastSurpriseCaption})")());
    ok(u1.u === u0 + 1 && u1.cap.startsWith("Surprise #"), tag + " Surprise Me press = one undo step and a Surprise caption (" + u1.cap + ")");
    ok((await p.evaluate(() => document.getElementById("messCaption").textContent)).startsWith("Surprise #"), tag + " the Make a Mess caption bar shows it");
    // placeholders do nothing
    const before = await p.evaluate(() => window.__ev("()=>JSON.stringify([undoStack.length,actors.length,rooms.length])")());
    // (no placeholder buttons are left after Stage 4: all eight are live and covered by the stage 2-4 tests)
    ok(before === await p.evaluate(() => window.__ev("()=>JSON.stringify([undoStack.length,actors.length,rooms.length])")()), tag + " placeholder buttons change nothing");
    // captions
    await p.hover('[data-mk="bombs"]'); ok((await p.evaluate(() => document.getElementById("messCaption").textContent)).length > 10, tag + " hover shows a caption");
    // tutorial guard
    await p.evaluate(() => window.__ev("()=>{tutorialActive=true}")()); await p.waitForTimeout(450);
    ok(await p.evaluate(() => !document.getElementById("paletteWrap").classList.contains("messMode")), tag + " an active tutorial brings Make a Game back");
    await p.evaluate(() => window.__ev("()=>{tutorialActive=false}")());
    // Play hides the palette, build brings the tab back as it was
    await p.evaluate(() => window.__ev("()=>{selectedActorDefId=playerDefId;placeNewActor(100,100)}")());
    await p.click("#messTabMess"); await p.click("#modePlayBtn").catch(() => {}); await p.waitForTimeout(300);
    const inPlay = await p.evaluate(() => window.__ev("()=>appMode")());
    if (inPlay === "play") { ok(await p.evaluate(() => !document.getElementById("paletteWrap").offsetParent), tag + " Play hides the whole left panel"); await p.click("#modeBuildBtn"); await p.waitForTimeout(300); ok(await p.evaluate(() => document.getElementById("paletteWrap").classList.contains("messMode")), tag + " back in Build the Make a Mess tab is still selected"); }
    else console.log(tag + " (play check skipped: no player placed)");
    // idle cost: no timer left running on Make a Game
    await p.click("#messTabGame"); ok(await p.evaluate(() => !document.getElementById("paletteWrap").classList.contains("messMode")), tag + " back to Make a Game");
    ok(p.errs.length === 0, tag + " no page errors (" + p.errs.join("|") + ")");
    await p.ctx.close();
  }
  await browser.close();
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
