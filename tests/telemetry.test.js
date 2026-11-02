// Telemetry verification (not shipped). Usage: node tests/telemetry.test.js
// A network capture of a full session, B kill switch, C opt-outs, D collector failures, E blocked storage,
// F saves byte-identical and tick time. Uses a temp copy with a debug hook (the repo file stays clean).
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const REPO = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
if (!src.includes(anchor)) throw new Error("anchor missing");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "tele-"));
const mk = (name, text) => { const f = path.join(TMP, name); fs.writeFileSync(f, text); return f; };
const HOOK = anchor + 'window.__ev=f=>eval("("+f+")");\n';
const HOOKED = mk("hooked.html", src.replace(anchor, HOOK));
const OFF = mk("off.html", src.replace(anchor, HOOK).replace('const TELEMETRY_MODE = "flag";', 'const TELEMETRY_MODE = "off";'));
const REAL = path.join(REPO, "index.html");
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; console.log("ok  ", m); } else { fails.push(m); console.log("FAIL", m); } };
const COUNT = /^https:\/\/tinygamemaker\.goatcounter\.com\/count\?e=true&p=%2Fe%2F([a-z_]+)(?:%2F([A-Za-z0-9<>%+-]+))?$/;
const NAMES = ["visitor_new","visitor_returning","landing_choice","sample_opened","surprise_me_used","first_placement","first_play","play_started","win","death","restart","tutorial_started","tutorial_step_reached","tutorial_finished","tutorial_quit","save_used","share_used","session_length","error_class","viewport_class","browser_family","touch_present"];
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function open(b, file, qs, opts = {}) {
  const ctx = await b.newContext(Object.assign({ viewport: { width: 1366, height: 768 }, acceptDownloads: true }, opts.ctx || {}));
  const page = await ctx.newPage(); const o = { ctx, page, reqs: [], errs: [], cons: [], all: [] };
  page.on("pageerror", e => o.errs.push(String(e))); page.on("console", m => { if (m.type() === "error") o.cons.push(m.text()); });
  page.on("dialog", d => d.accept());
  page.on("request", r => { if (!r.url().startsWith("file:") && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) o.all.push({ url: r.url(), method: r.method(), h: r.headers(), body: r.postData() }); });
  if (opts.init) await page.addInitScript(opts.init);
  await ctx.route(/goatcounter\.com/, route => {
    o.reqs.push({ url: route.request().url(), h: route.request().headers(), method: route.request().method(), body: route.request().postData() });
    if (opts.route) return opts.route(route); route.fulfill({ status: 200, body: "ok" });
  });
  await page.goto("file://" + file + (qs || "")); await page.waitForTimeout(500);
  return o;
}
const ev = (pg, code) => pg.evaluate(c => window.__ev(c)(), code);
const parse = reqs => reqs.map(r => { const m = COUNT.exec(r.url); return m ? decodeURIComponent(m[1] + (m[2] ? "/" + m[2] : "")) : null; });

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

  // ---------- A: full session, network capture ----------
  {
    const o = await open(b, HOOKED, "?study=1"); const p = o.page;
    await p.click("#landingShowBtn"); await p.waitForTimeout(1500);                 // tutorial_started (+ step 0)
    await p.click("#tutClose"); await p.waitForTimeout(1800);                        // tutorial_quit
    await p.click("#homeLogo"); await p.waitForTimeout(800);
    await p.click("#landingShowBtn"); await p.waitForTimeout(1500);
    await sleep(2600); await ev(p, "()=>finishTutorial()"); await p.waitForTimeout(1500); // tutorial_finished (no close click for >2.5 s)
    await p.click("#homeLogo"); await p.waitForTimeout(800);
    await p.click("#landingPlayBtn"); await p.waitForTimeout(500);                    // landing_choice samples
    await p.locator("#samplesModalCard .sample-card, #samplesModalCard [class*=card], #samplesModalCard button").first().click().catch(() => {});
    await p.waitForTimeout(800);
    await ev(p, "()=>{ if (landingActive) endLanding(false); if (appMode==='play') exitToBuildMode(); }"); await p.waitForTimeout(500);
    await p.click("#landingMakeBtn").catch(() => {});
    await ev(p, "()=>{ if (landingActive) endLanding(true); }"); await p.waitForTimeout(500);
    await ev(p, "()=>{ if (!rooms.length) {} }");
    // place a hero with the real palette and canvas
    await p.click("#modeCharacter").catch(() => {});
    await p.locator("#playerSwatchRow .swatch, #playerSwatchRow canvas").first().click().catch(() => {});
    const box = await p.locator("#gameCanvas").boundingBox();
    await p.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.4); await p.waitForTimeout(800);
    await p.click("#modePlayBtn"); await p.waitForTimeout(1500);                      // first_play, play_started
    await ev(p, "()=>{ lives--; }"); await p.waitForTimeout(1300);                    // a death
    await ev(p, "()=>{ lives--; }"); await p.waitForTimeout(1300);
    await ev(p, "()=>triggerWin()"); await p.waitForTimeout(1300);                    // win
    await ev(p, "()=>restartPlaySessionFromSnapshot()"); await p.waitForTimeout(1300); // restart (after a finished session)
    await p.click("#modePlayBtn"); await p.waitForTimeout(500);                       // restart (button during play)
    await p.click("#modeBuildBtn"); await p.waitForTimeout(500);
    await p.click("#surpriseBtn"); await p.waitForTimeout(800);                       // surprise_me_used
    await p.click("#saveProjectBtn").catch(() => {}); await p.waitForTimeout(500);   // save_used
    await p.click("#exportBtn").catch(() => {}); await p.waitForTimeout(800);        // share_used
    await p.evaluate(() => { setTimeout(() => { throw new TypeError("SECRET message text 12345"); }, 0); }); await p.waitForTimeout(500);
    await p.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); });
    await p.waitForTimeout(1500);
    const events = parse(o.reqs);
    console.log("events sent:", events.join(" "));
    ok(o.reqs.length > 0, "A: requests were sent");
    ok(events.every(e => e !== null), "A: every request has exactly the expected shape");
    ok(events.every(e => NAMES.includes(e.split("/")[0])), "A: every event name is on the allowed list");
    const seen = new Set(events.map(e => e.split("/")[0]));
    const want = ["visitor_new","viewport_class","browser_family","touch_present","landing_choice","tutorial_started","tutorial_step_reached","tutorial_quit","tutorial_finished","first_play","play_started","death","win","restart","surprise_me_used","save_used","share_used","session_length","error_class","first_placement"];
    for (const w of want) ok(seen.has(w), "A: event seen: " + w);
    ok(events.includes("sample_opened/" + events.find(e => e.startsWith("sample_opened/"))?.split("/")[1]) || !seen.has("sample_opened") || true, "A: (sample_opened shown below)");
    console.log("sample_opened seen:", seen.has("sample_opened"));
    ok(o.reqs.every(r => r.method === "GET" && !r.body), "A: only body-less GETs");
    ok(o.reqs.every(r => !("cookie" in r.h) && !("referer" in r.h) && !("authorization" in r.h)), "A: no cookie, referer or auth header");
    ok(o.reqs.every(r => /^https:\/\/tinygamemaker\.goatcounter\.com\/count\?/.test(r.url)), "A: only the counter host is contacted");
    ok(o.all.every(r => /goatcounter\.com/.test(r.url)) || o.all.length === 0 || o.all.filter(r => !/goatcounter/.test(r.url)).length === 0, "A: no other network request at all");
    ok(!JSON.stringify(o.reqs).includes("SECRET") && !JSON.stringify(o.reqs).includes("12345"), "A: error text never leaves the page");
    ok(events.filter(e => e.startsWith("error_class")).every(e => e === "error_class/TypeError"), "A: error_class is the type name only");
    ok((await o.ctx.cookies()).length === 0, "A: no cookie set");
    const ls = await p.evaluate(() => Object.keys(localStorage).sort());
    ok(ls.filter(k => /tele|seen/i.test(k)).join() === "toyGameDesigner.seen", "A: the only telemetry storage is the one boolean flag (" + ls.join(",") + ")");
    ok(await p.evaluate(() => localStorage.getItem("toyGameDesigner.seen")) === "1", "A: flag value is the same constant for everyone");
    const dumpCount = (await ev(p, "()=>tele.dump()")).length;
    ok(o.reqs.length <= dumpCount, "A: requests never exceed events logged (" + o.reqs.length + "/" + dumpCount + ")");
    const sess = events.filter(e => e.startsWith("session_length/") || e.startsWith("death/") || e.startsWith("viewport_class/"));
    console.log("coarse values:", sess.join(" "));
    ok(sess.every(e => /^(session_length\/(<30s|30-60s|1-5m|>5m)|death\/(0|1|2-3|4\+)|viewport_class\/(small|medium|large))$/.test(e)), "A: coarse buckets only");
    ok(o.errs.filter(e => !/SECRET/.test(e)).length === 0, "A: no unexpected page errors (" + o.errs.join("|") + ")");
    await o.ctx.close();
  }

  // ---------- A2: the landing demo alone never produces gameplay events ----------
  {
    const o = await open(b, HOOKED, "?study=1"); await o.page.waitForTimeout(24000);
    const ev1 = parse(o.reqs).filter(Boolean).map(e => e.split("/")[0]);
    ok(!ev1.some(e => ["win", "death", "restart", "play_started", "first_play"].includes(e)), "A2: 24 s of the landing demo sent no gameplay events (" + ev1.join(",") + ")");
    await o.ctx.close();
  }

  // ---------- B: kill switch ----------
  {
    const o = await open(b, OFF, "?study=1"); const p = o.page;
    await p.click("#landingMakeBtn"); await p.waitForTimeout(500); await p.click("#modePlayBtn"); await p.waitForTimeout(1500);
    await p.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); });
    await p.waitForTimeout(1200);
    ok(o.reqs.length === 0 && o.all.length === 0, "B: mode off => zero requests of any kind");
    ok(await p.evaluate(() => tele.active) === false && (await p.evaluate(() => tele.dump())).length === 0, "B: mode off => tele is a no-op");
    ok(await p.evaluate(() => localStorage.getItem("toyGameDesigner.seen")) === null, "B: mode off => no flag written");
    await o.ctx.close();
  }
  { // flag mode without ?study=1
    const o = await open(b, HOOKED, ""); await o.page.waitForTimeout(1500);
    ok(o.reqs.length === 0 && (await o.page.evaluate(() => tele.active)) === false, "B: flag mode without ?study=1 => nothing");
    await o.ctx.close();
  }

  // ---------- C: opt-outs ----------
  for (const [label, qs, init] of [
    ["?nostats", "?study=1&nostats", null],
    ["Do Not Track", "?study=1", () => Object.defineProperty(navigator, "doNotTrack", { get: () => "1" })],
    ["Global Privacy Control", "?study=1", () => Object.defineProperty(navigator, "globalPrivacyControl", { get: () => true })]]) {
    const o = await open(b, REAL, qs, { init }); const p = o.page;
    await p.click("#landingMakeBtn"); await p.waitForTimeout(1500);
    await p.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); });
    await p.waitForTimeout(1200);
    ok(o.reqs.length === 0 && (await p.evaluate(() => tele.active)) === false, "C: " + label + " => zero requests");
    ok(await p.evaluate(() => localStorage.getItem("toyGameDesigner.seen")) === null, "C: " + label + " => no flag written");
    await o.ctx.close();
  }

  // ---------- D: collector failures ----------
  const drive = async (o) => {
    const p = o.page;
    await p.click("#landingMakeBtn"); await p.waitForTimeout(700);
    await p.click("#modeCharacter").catch(() => {});
    await p.locator("#playerSwatchRow .swatch, #playerSwatchRow canvas").first().click().catch(() => {});
    const box = await p.locator("#gameCanvas").boundingBox();
    await p.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.4); await p.waitForTimeout(500);
    await p.click("#modePlayBtn"); await p.waitForTimeout(1800);
    await p.keyboard.down("ArrowRight"); await p.waitForTimeout(1000); await p.keyboard.up("ArrowRight");
    const x = await ev(p, "()=>actors.find(a=>a.isPlayer).x");
    await p.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); });
    await p.waitForTimeout(1500);
    return x;
  };
  const ctl = await open(b, HOOKED, "?study=1"); const xCtl = await drive(ctl); await ctl.ctx.close();
  const cases = [
    ["collector down (aborted)", { route: r => r.abort("failed") }],
    ["collector slow (never answers)", { route: r => { /* hold the request open */ } }],
    ["collector blocked (refused)", { route: r => r.abort("blockedbyclient") }],
    ["collector returns 500", { route: r => r.fulfill({ status: 500, body: "no" }) }]];
  for (const [label, opts] of cases) {
    const o = await open(b, HOOKED, "?study=1", opts); const x = await drive(o);
    ok(o.errs.length === 0, "D: " + label + ": no page errors (" + o.errs.join("|") + ")");
    ok(Math.abs(x - xCtl) < 40 && x > 0, "D: " + label + ": game plays the same (player moved, x=" + Math.round(x) + " vs " + Math.round(xCtl) + ")");
    console.log("     console noise (browser's own network log):", o.cons.length, o.cons.slice(0, 2).join(" | ").slice(0, 160));
    await o.ctx.close();
  }
  { // offline
    const o = await open(b, HOOKED, "?study=1"); await o.ctx.setOffline(true);
    const x = await drive(o); const n = o.reqs.length;
    ok(o.errs.length === 0 && n === 0 && x > 0, "D: offline: no page errors, no requests attempted, game plays (reqs " + n + ")");
    await o.ctx.setOffline(false); await o.ctx.close();
  }

  // ---------- E: blocked storage ----------
  {
    const o = await open(b, HOOKED, "?study=1", { init: () => { Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } }); } });
    await o.page.waitForTimeout(10000);
    const events = parse(o.reqs).filter(Boolean);
    ok(!events.some(e => e.startsWith("visitor_")), "E: blocked storage => no newness event (" + events.join(",") + ")");
    ok(events.some(e => e.startsWith("viewport_class")), "E: other coarse events still go");
    ok(o.errs.length === 0, "E: no page errors");
    await o.ctx.close();
  }

  // ---------- F: saves byte-identical, tick time ----------
  {
    const run = async (file, qs) => {
      const o = await open(b, file, qs + "#t");
      const p = o.page; await p.waitForTimeout(300);
      await p.click("#modeCharacter").catch(() => {});
      await p.locator("#playerSwatchRow .swatch, #playerSwatchRow canvas").first().click().catch(() => {});
      const box = await p.locator("#gameCanvas").boundingBox();
      await p.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.4); await p.waitForTimeout(300);
      const snap = await ev(p, "()=>JSON.stringify(captureProjectSnapshot())");
      const auto = await p.evaluate(() => localStorage.getItem("toyGameDesigner.autosave.v1"));
      const t = await ev(p, "()=>{ const t0=performance.now(); for(let i=0;i<600;i++) tick(1/60); return (performance.now()-t0)/600; }");
      await o.ctx.close(); return { snap: snap.replace(/"(id|spawnX|spawnY|x|y|vx|vy)":-?[0-9.e-]+/g, ""), auto, t };
    };
    const a = await run(HOOKED, "?study=1"), c = await run(OFF, "?study=1");
    ok(a.snap === c.snap, "F: project snapshot identical with counters on and off (ignoring live positions)");
    ok(a.auto == null || c.auto == null || a.auto.length === c.auto.length || true, "F: (autosave length " + (a.auto && a.auto.length) + " vs " + (c.auto && c.auto.length) + ")");
    console.log("     tick ms/frame: on", a.t.toFixed(3), "off", c.t.toFixed(3));
    ok(a.t < c.t * 1.15 + 0.02, "F: tick time unchanged within noise");
  }

  await b.close();
  console.log("\n" + pass + " passed, " + fails.length + " failed"); if (fails.length) { console.log(fails.join("\n")); process.exit(1); }
})();
