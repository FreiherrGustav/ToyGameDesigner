// v2.64 Stage 4 (not deployed): old autosave loads in the new build; screenshots of the three machines at two viewports. Usage: node tests/machines.final.js <pre-v2.64 index.html> <shotDir>
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const PRE = path.resolve(process.argv[2]), DIR = path.resolve(process.argv[3] || ".");
const A = 'Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const NEWSRC = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const hook = 'window.__S=(i,s)=>surpriseMe(s,{templateIds:[i],chaos:false,canonical:true,scene:false});window.__R=()=>rooms.length;window.__sn=()=>JSON.stringify(captureProjectSnapshot().rooms.map(r=>r.board));';
const NEW = path.join(os.tmpdir(), "mf_new.html"); fs.writeFileSync(NEW, NEWSRC.replace(A, A + hook));
let pass = 0; const bad = []; const ok = (c, m) => { if (c) pass++; else bad.push(m); console.log(c ? "ok  " : "FAIL", m); };
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  // old autosave: an old build makes a project (Surprise press), the new build loads it
  const ctx = await b.newContext({ viewport: { width: 1366, height: 700 } });
  let p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("dialog", d => d.accept());
  await p.goto("file://" + PRE + "#surprise=4821"); await p.waitForTimeout(1500);
  await p.evaluate(() => { document.querySelector("#saveProjectBtn") && 0; });
  await p.waitForTimeout(5000);
  const oldKeys = await p.evaluate(() => Object.keys(localStorage).filter(k => /autosave/i.test(k)));
  const oldLen = await p.evaluate(k => (localStorage.getItem(k[0]) || "").length, oldKeys);
  ok(oldKeys.length > 0 && oldLen > 1000, "old build wrote an autosave (" + oldLen + " chars)");
  await p.close();
  p = await ctx.newPage(); p.on("pageerror", e => errs.push(e.message)); p.on("dialog", d => d.accept());
  await p.goto("file://" + NEW + "#t"); await p.waitForTimeout(1500);
  const nRooms = await p.evaluate(() => window.__R());
  const sn = await p.evaluate(() => window.__sn());
  // the same autosave opened by the old build must give the same boards (restore migrations are the same in both)
  const OLDH = path.join(os.tmpdir(), "mf_old.html"); fs.writeFileSync(OLDH, fs.readFileSync(PRE, "utf8").replace(A, A + hook));
  const p2 = await ctx.newPage(); p2.on("dialog", d => d.accept()); await p2.goto("file://" + OLDH + "#t"); await p2.waitForTimeout(1500);
  const sn2 = await p2.evaluate(() => window.__sn()); await p2.close();
  ok(sn === sn2, "boards loaded by the new build equal the boards the old build loads from the same autosave");
  await p.evaluate(() => window.__S("drain", 12345)); await p.waitForTimeout(300);
  ok(await p.evaluate(() => window.__R()) >= 1, "a new machine can still be pressed on top of the old project");
  ok(errs.length === 0, "no page errors" + (errs.length ? ": " + errs[0] : ""));
  await ctx.close();
  // screenshots
  for (const [w, h] of [[1366, 635], [1920, 1080]]) for (const id of ["magnetmile", "drain", "stonedomino"]) {
    const c2 = await b.newContext({ viewport: { width: w, height: h } }); const q = await c2.newPage(); const e2 = []; q.on("pageerror", e => e2.push(e.message)); q.on("dialog", d => d.accept());
    await q.goto("file://" + NEW + "#t"); await q.waitForTimeout(700);
    await q.evaluate(([i]) => window.__S(i, 12345), [id]); await q.waitForTimeout(2500);
    const f = path.join(DIR, `final-${id}-${w}x${h}.png`); await q.screenshot({ path: f });
    const m = await q.evaluate(() => { const c = document.querySelector("#gameCanvas").getBoundingClientRect(); return { r: c.right, b: c.bottom, w: innerWidth, h: innerHeight, sy: scrollY }; });
    ok(m.r <= m.w + 1 && m.b <= m.h + 1 && m.sy === 0 && e2.length === 0, `${id} at ${w}x${h}: board inside the window, no scroll, no errors`);
    await c2.close();
  }
  await b.close(); console.log(`machines.final: ${pass} passed, ${bad.length} failed`); process.exit(bad.length ? 1 : 0);
})();
