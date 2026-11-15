// Make a Mess, Stage 5: captions, usage counters (?study=1 only), the last tutorial step. node tests/chaoskit.stage5.test.js
const fs = require("fs"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const ANCH = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
fs.writeFileSync("/tmp/ck/s5.html", fs.readFileSync(path.resolve(__dirname, "..", "index.html"), "utf8").replace(ANCH, ANCH + 'window.__ev = f => eval("(" + f + ")");\n'));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const SETUP = () => { restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); const s = SAMPLE_GAMES.find(x => x.id === "cloud-hopper"); loadExampleGame(s.builder, s.name, { skipConfirm: true }); setGamePaused(false); gravityEnabled = true; gravityDir = "down"; };
async function open(browser, qs) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage(); page.errs = []; page.reqs = []; page.logs = [];
  page.on("pageerror", e => page.errs.push(String(e))); page.on("dialog", d => d.accept());
  await ctx.route(/goatcounter/, route => { page.reqs.push(route.request().url()); route.fulfill({ status: 200, body: "ok" }); });
  page.on("console", m => { if (/^\[tele\]/.test(m.text())) page.logs.push(m.text().replace("[tele] ", "")); });
  await page.goto("file:///tmp/ck/s5.html" + qs); await page.waitForTimeout(700);
  page.ev = (fn, arg) => page.evaluate(([s, a]) => window.__ev(s)(a), [String(fn), arg]);
  return page;
}
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  // ---------- captions ----------
  { const p = await open(browser, "#t"); await p.ev(SETUP);
    ok(await p.evaluate(() => !document.getElementById("paletteWrap").classList.contains("messMode")), "Make a Game is the default tab");
    const cap = async (sel, where) => { await p.hover(sel); await p.waitForTimeout(80); return p.evaluate(([w]) => document.getElementById(w).textContent, [where]); };
    // on the Make a Game tab the tab buttons write to the main caption bar
    ok((await cap("#messTabMess", "captionBar")).length > 10, "Make a Mess tab has a caption (on the Game tab)");
    await p.click("#messTabMess");
    for (const [sel, name] of [["#messTabGame", "Make a Game tab"], ["#messTabMess", "Make a Mess tab"], ["#mkSurprise", "Surprise Me"], ["[data-mk=walls]", "walls"], ["[data-mk=stuff]", "stuff"], ["[data-mk=enemies]", "enemies"], ["[data-mk=scenery]", "scenery"], ["[data-mk=tumble]", "tumble"], ["[data-mk=quake]", "quake"], ["[data-mk=bombs]", "bombs"], ["[data-mk=lava]", "lava"]]) {
      const t = await cap(sel, "messCaption"); ok(t.length > 10 && !/coming soon/i.test(t) && !/built yet/i.test(t), "caption for " + name + ": " + t);
    }
    // the chips of the gravity view
    for (const i of [0, 1, 2]) { await p.hover("#mkGravRow button >> nth=" + i); await p.waitForTimeout(60); const t = await p.evaluate(() => document.getElementById("messCaption").textContent); ok(t.length > 5 && !/^Hover/.test(t), "caption for gravity chip " + i + ": " + t); }
    // Stop and the Undo toast
    await p.click("[data-mk=tumble]"); await p.waitForTimeout(200);
    const st = await cap("#mkStop", "messCaption"); ok(/stop|keeps/i.test(st), "Stop caption: " + st);
    await p.click("#mkStop");
    await p.click("[data-mk=walls]"); await p.waitForTimeout(200);
    const ut = await cap("#mkToastUndo", "messCaption"); ok(/takes back|undo/i.test(ut), "toast Undo caption: " + ut);
    ok(p.errs.length === 0, "captions: no errors"); await p.context().close(); }
  // ---------- counters: without ?study=1 nothing is sent or logged ----------
  { const p = await open(browser, "?telelog=1#t"); await p.ev(SETUP); await p.click("#messTabMess"); await p.click("[data-mk=walls]"); await p.waitForTimeout(9500);
    ok(p.logs.length === 0 && p.reqs.length === 0, "no ?study=1: no events logged (" + p.logs.length + "), no requests (" + p.reqs.length + ")");
    ok((await p.evaluate(() => window.chaosKit.teleDump())).length === 0, "no ?study=1: nothing counted"); await p.context().close(); }
  // ---------- counters with ?study=1 ----------
  { const p = await open(browser, "?study=1&telelog=1#t"); await p.ev(SETUP);
    await p.click("#messTabMess");
    for (const k of ["walls", "stuff", "enemies", "scenery"]) { await p.click("[data-mk=" + k + "]"); await p.waitForTimeout(150); }
    await p.click("#undoBtn"); await p.waitForTimeout(150);                                  // undo of the last press: counts
    await p.click("[data-mk=scenery]"); await p.waitForTimeout(150); await p.keyboard.press("Control+z"); await p.waitForTimeout(150); // Ctrl+Z right after a press: counts
    await p.click("[data-mk=stuff]"); await p.waitForTimeout(150); await p.click("#mkToastUndo"); await p.waitForTimeout(150); // the toast's Undo: counts
    await p.click("#undoBtn"); await p.waitForTimeout(100);                                   // an undo NOT right after a press: does not count
    for (const k of ["tumble", "quake", "bombs", "lava"]) { await p.click("[data-mk=" + k + "]"); await p.waitForTimeout(250); await p.click("#mkStop"); await p.waitForTimeout(200); }
    await p.waitForTimeout(9500);
    const dump = await p.evaluate(() => window.chaosKit.teleDump());
    const want = ["mess_tab_opened", "quickbuild_walls", "quickbuild_stuff", "quickbuild_enemies", "quickbuild_scenery", "mess_undo", "chaos_tumble", "chaos_earthquake", "chaos_bombs", "chaos_lava"];
    want.forEach(w => ok(dump.includes(w), "event counted: " + w));
    ok(dump.filter(d => d === "mess_undo").length === 3, "mess_undo counted for the Undo button, Ctrl+Z and the toast, and not for a later undo (" + dump.filter(d => d === "mess_undo").length + ")");
    ok(dump.every(d => want.includes(d)), "only the fixed names: " + dump.filter(d => !want.includes(d)));
    const mine = p.reqs.filter(u => /%2Fe%2F(mess_|quickbuild_|chaos_)/.test(u));
    ok(mine.length >= 9, "requests sent (" + mine.length + ")");
    ok(mine.every(u => /^https:\/\/tinygamemaker\.goatcounter\.com\/count\?e=true&p=%2Fe%2F[a-z_]+$/.test(u)), "every request is a bare counter GET with just the event name: " + mine.filter(u => !/%2Fe%2F[a-z_]+$/.test(u)).slice(0, 2));
    ok(p.errs.length === 0, "counters: no errors"); await p.context().close(); }
  // ---------- tutorial: the Make a Mess step is last, the default tab is still Make a Game ----------
  { const p = await open(browser, "#t");
    const info = await p.evaluate(() => { const names = window.__ev("()=>TUTORIAL_STEPS.map(s=>s.name)")(); return names; });
    ok(JSON.stringify(info) === JSON.stringify(["ground", "ledge", "player", "enemy", "goal", "play", "win", "objects", "mess"]), "tutorial steps: only 'mess' was added at the end (" + info + ")");
    ok(await p.evaluate(() => !document.getElementById("paletteWrap").classList.contains("messMode")), "default tab is Make a Game");
    await p.context().close(); }
  console.log(pass + " passed, " + fail + " failed");
  await browser.close();
})();
