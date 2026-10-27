// v2.47 Stage 2: landing screen (not deployed). Usage: node tests/landing.test.js [shotDir]
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const REPO = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
if (!src.includes(anchor)) throw new Error("anchor missing");
const tmp = path.join(os.tmpdir(), "landing_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + `window.__ev=f=>eval("("+f+")");`));
const SHOTS = process.argv[2] || os.tmpdir();
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; console.log("ok  ", m); } else { fails.push(m); console.log("FAIL", m); } };
const ev = (pg, code) => pg.evaluate(c => window.__ev(c)(), code);
const open = async (b, vp, hash, init) => {
  const ctx = await b.newContext({ viewport: vp, acceptDownloads: true });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage(); const errors = []; page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept());
  await page.goto("file://" + tmp + (hash || "")); await page.waitForFunction(() => window.__ev); await page.waitForTimeout(400);
  return { ctx, page, errors };
};
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

  // 1. first visit shows the landing screen, nothing overflowing
  for (const [w, h] of [[1280,720],[1366,768],[1180,820],[390,844]]) {
    const { ctx, page, errors } = await open(browser, { width: w, height: h }, "");
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => {
      const L = document.getElementById("landing"), P = document.getElementById("landingPanel").getBoundingClientRect();
      const kids = [...document.querySelectorAll("#landingPanel *")].map(e => e.getBoundingClientRect()).filter(b => b.width);
      return { on: document.body.classList.contains("landing"), sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight,
        lsh: L.scrollHeight, lch: L.clientHeight, inX: kids.every(b => b.left >= 0 && b.right <= innerWidth), inY: P.top >= 0 && P.bottom <= innerHeight,
        stacked: (() => { const bs = [...document.querySelectorAll("#landingButtons button")].map(b => b.getBoundingClientRect()); return bs[1].top > bs[0].top; })() };
    });
    await page.screenshot({ path: path.join(SHOTS, `landing_${w}x${h}.png`) });
    ok(r.on, `${w}x${h}: first visit shows the landing screen`);
    ok(r.sw <= w && r.sh <= h && r.lsh <= r.lch && r.inX && r.inY, `${w}x${h}: nothing overflows (${JSON.stringify(r)})`);
    if (w < 700) ok(r.stacked, `${w}x${h}: buttons stack`);
    ok(errors.length === 0, `${w}x${h}: no errors ${errors}`);
    await ctx.close();
  }

  // 2. the three buttons, Take it apart, Escape, tab order
  {
    let { ctx, page } = await open(browser, { width: 1280, height: 720 }, "");
    await page.keyboard.press("Escape");
    ok(await page.evaluate(() => document.body.classList.contains("landing")), "Escape does nothing destructive");
    const order = [];
    ok(await page.evaluate(() => document.activeElement.id) === "landingMakeBtn", "Make one is focused first");
    for (let i = 0; i < 12; i++) { await page.keyboard.press("Tab"); order.push((await page.evaluate(() => document.activeElement.id)) || "sample"); }
    ok(JSON.stringify(order) === JSON.stringify(["landingSurpriseBtn","landingPlayBtn","landingShowBtn","landingTakeApartBtn","sample","sample","sample","sample","sample","sample","landingPrivacy","landingContact"]), "keyboard order " + order);
    await page.evaluate(() => document.getElementById("landingPlayBtn").focus());
    await page.keyboard.press("Enter");
    ok(await page.evaluate(() => document.getElementById("samplesModalOverlay").style.display) === "flex", "Play a game (Enter) opens the Samples gallery");
    await page.locator("#samplesGrid > *").nth(3).click();
    ok(await page.evaluate(() => !document.body.classList.contains("landing") && document.body.classList.contains("play-mode")), "picking a sample starts it in Play mode, landing gone");
    await ctx.close();
    ({ ctx, page } = await open(browser, { width: 1280, height: 720 }, ""));
    await page.click("#landingMakeBtn");
    ok(await page.evaluate(() => !document.body.classList.contains("landing") && !document.body.classList.contains("play-mode")), "Make one: editor");
    ok(await ev(page, "()=>actors.length===0&&board[ROWS-1][0]==='solid:none'&&!board.some(r=>r.some(c=>c&&c.startsWith('goal')))&&gravityEnabled"), "Make one: the starter board (grass strip, no hero, no flag, gravity)");
    await ctx.close();
    ({ ctx, page } = await open(browser, { width: 1280, height: 720 }, ""));
    await page.click("#landingSurpriseBtn");
    await page.waitForTimeout(300);
    ok(await ev(page, "()=>!document.body.classList.contains('landing') && rooms.some(r=>r.surprises&&r.surprises.length) || actors.length>0"), "Surprise me: landing gone and a surprise placed");
    await ctx.close();
    ({ ctx, page } = await open(browser, { width: 1280, height: 720 }, ""));
    const name = await page.evaluate(() => document.getElementById("landingNowName").textContent);
    await page.click("#landingTakeApartBtn");
    const same = await ev(page, `()=>{ const boards=()=>JSON.stringify(rooms.map(r=>r.board)); const a=boards(); const hero=SAMPLE_GAMES.find(g=>g.name==${JSON.stringify(name)}); loadExampleGame(hero.builder,hero.name,{skipConfirm:true}); return !document.body.classList.contains('landing') && appMode==='build' && a===boards(); }`);
    ok(same, `Take it apart opens the displayed sample (${name}) in the editor`);
    await ctx.close();
  }

  // 3. returning visitor + Home round trip, byte for byte; landing is inert
  {
    let { ctx, page } = await open(browser, { width: 1280, height: 720 }, "#t");
    await ev(page, "()=>{ const g=SAMPLE_GAMES.find(g=>g.id==='rock-bottom'); loadExampleGame(g.builder,g.name,{skipConfirm:true}); saveAutosave(); }");
    const raw = await page.evaluate(() => localStorage.getItem("toyGameDesigner.autosave.v1"));
    await ctx.close();
    // rAF off so a live Build-mode sandbox (wandering/spawning actors) can't move between the two snapshots
    ({ ctx, page } = await open(browser, { width: 1280, height: 720 }, "", `localStorage.setItem("toyGameDesigner.autosave.v1", ${JSON.stringify(raw)}); window.requestAnimationFrame = () => 0;`));
    ok(await page.evaluate(() => !document.body.classList.contains("landing")), "returning visitor goes straight to the editor");
    const snapA = await ev(page, "()=>JSON.stringify(captureProjectSnapshot())");
    ok(await page.evaluate(() => localStorage.getItem("toyGameDesigner.autosave.v1")) === raw, "autosave unchanged on load");
    await page.click("#homeLogo");
    ok(await page.evaluate(() => document.body.classList.contains("landing")), "Home shows the landing screen");
    // sound / keys / autosave inert while up
    ok(await ev(page, "()=>claimVoice('boing',100)===0"), "backdrop is silent (no audio voices)");
    await page.keyboard.down("ArrowRight"); await page.waitForTimeout(200); await page.keyboard.up("ArrowRight");
    ok(await ev(page, "()=>!keys.ArrowRight"), "game keys are not fed to the backdrop");
    await page.waitForTimeout(5500);
    ok(await page.evaluate(() => localStorage.getItem("toyGameDesigner.autosave.v1")) === raw, "autosave untouched while the landing screen is up (5.5s)");
    await page.click("#landingMakeBtn");
    const snapB = await ev(page, "()=>JSON.stringify(captureProjectSnapshot())");
    ok(snapA === snapB, "project identical byte for byte after Home -> Make one");
    await page.waitForTimeout(4500);
    ok(await page.evaluate(() => localStorage.getItem("toyGameDesigner.autosave.v1")) === raw, "autosave identical byte for byte afterwards");
    await ctx.close();
    for (const h of ["#surprise=4821", "#x"]) {
      ({ ctx, page } = await open(browser, { width: 1280, height: 720 }, h));
      ok(await page.evaluate(() => !document.body.classList.contains("landing")), `deep link ${h} skips the landing screen`);
      await ctx.close();
    }
  }

  // reduced motion freezes the backdrop
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
    const page = await ctx.newPage(); page.on("dialog", d => d.accept());
    await page.goto("file://" + tmp); await page.waitForFunction(() => window.__ev);
    await ev(page, "()=>{ endLanding(true); LANDING_HEROES.length=0; LANDING_HEROES.push('crossing-guard'); showLanding(); }");
    await page.waitForTimeout(800);
    const a = await ev(page, "()=>JSON.stringify(actors.map(x=>[x.x,x.y]))");
    await page.waitForTimeout(1500);
    const b = await ev(page, "()=>JSON.stringify(actors.map(x=>[x.x,x.y]))");
    ok(a === b, "prefers-reduced-motion: backdrop frozen");
    await ctx.close();
  }

  // 4. every hero, 20 s, no input
  {
    const heroes = await (async () => { const { ctx, page } = await open(browser, { width: 1280, height: 720 }, "#t"); const h = await ev(page, "()=>LANDING_HEROES.slice()"); await ctx.close(); return h; })();
    await Promise.all(heroes.map(async id => {
      const { ctx, page, errors } = await open(browser, { width: 1280, height: 720 }, "");
      await ev(page, `()=>{ endLanding(true); LANDING_HEROES.length=0; LANDING_HEROES.push(${JSON.stringify(id)}); showLanding(); window.__p0=actors.map(a=>[a.id,a.x,a.y]); window.__mv=0; }`);
      let nan = false, moved = 0;
      for (let i = 0; i < 20; i++) {
        await page.waitForTimeout(1000);
        const s = await ev(page, "()=>{ let nan=false, m=0; actors.forEach(a=>{ if(!isFinite(a.x)||!isFinite(a.y)||!isFinite(a.vx)||!isFinite(a.vy)) nan=true; }); actors.forEach(a=>{ if(a.isPlayer)return; const t=window.__p0.find(t=>t[0]===a.id); if(t&&(Math.abs(t[1]-a.x)>2||Math.abs(t[2]-a.y)>2)) m++; }); window.__p0=actors.map(a=>[a.id,a.x,a.y]); return {nan,m}; }");
        if (s.nan) nan = true; if (s.m) moved++;
      }
      const end = await ev(page, "()=>({lives,ended:playSessionEnded,landing:landingActive,pl:actors.some(a=>a.isPlayer)})");
      ok(errors.length === 0 && !nan && end.ended == null && end.lives === 3 && end.pl && end.landing, `hero ${id}: 20 s, no input: no exception, no NaN, player alive (${JSON.stringify(end)}, ${moved}/20 s with motion)`);
      ok(moved >= 10, `hero ${id}: something moves on its own (${moved}/20 s)`);
      await ctx.close();
    }));
  }

  // 5. network: only the page itself
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); const reqs = []; page.on("request", r => reqs.push(r.url())); page.on("dialog", d => d.accept());
    await page.goto("file://" + tmp); await page.waitForTimeout(3000);
    await page.click("#landingMakeBtn"); await page.click("#homeLogo"); await page.waitForTimeout(1500);
    const external = reqs.filter(u => !u.startsWith("data:") && u !== "file://" + tmp);
    ok(external.length === 0, `no requests other than the page itself (${reqs.length} total, extra: ${JSON.stringify(external)})`);
    await ctx.close();
  }

  // 6. export: no landing screen, title, plays
  {
    const { ctx, page } = await open(browser, { width: 1280, height: 720 }, "#t");
    await ev(page, "()=>{ const g=SAMPLE_GAMES.find(g=>g.id==='the-cheese-heist'); loadExampleGame(g.builder,g.name,{skipConfirm:true}); }");
    const [d] = await Promise.all([page.waitForEvent("download"), page.click("#exportBtn")]);
    const f = path.join(os.tmpdir(), "landing_export.html"); await d.saveAs(f);
    const html = fs.readFileSync(f, "utf8");
    ok(/<title>My Game — made with TinyGameMaker<\/title>/.test(html), "export <title> follows the pattern");
    ok(!html.includes('id="landing"') && !html.includes("landingWordmark"), "export has no landing screen markup");
    const q = await ctx.newPage(); const errs = []; q.on("pageerror", e => errs.push(String(e)));
    await q.goto("file://" + f); await q.waitForTimeout(1800);
    await q.keyboard.down("ArrowRight"); await q.waitForTimeout(1200); await q.keyboard.up("ArrowRight");
    ok(errs.length === 0 && await q.evaluate(() => !!document.querySelector("canvas") && !document.getElementById("landing") && document.title.includes("TinyGameMaker")), "export plays with no errors, no landing, right title " + errs);
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fails.length} failed`); if (fails.length) { console.log(fails.join("\n")); process.exit(1); }
})();
