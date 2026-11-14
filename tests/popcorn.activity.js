// Popcorn Box opens live with hopping non-lethal Gloops all over. node tests/popcorn.activity.js
const fs = require("fs"), { chromium } = require("/opt/node22/lib/node_modules/playwright");
const A = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
fs.writeFileSync("/tmp/pa.html", fs.readFileSync(__dirname + "/../index.html", "utf8").replace(A, A + 'window.__ev=f=>eval("("+f+")");\n'));
let bad = 0; const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) bad++; };
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }), p = await b.newPage();
  const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("dialog", d => d.accept());
  await p.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await p.goto("file:///tmp/pa.html#t"); await p.waitForTimeout(300);
  const r = await p.evaluate(s => window.__ev(s)(), `() => {
    surpriseMe(10000, { templateId: "popcorn" });
    const hop = actors.filter(a => isHopperDef(actorDefs[a.defId]));
    const info = { paused: gamePaused, hoppers: hop.length, lethal: hop.filter(a => npcIsLethal(actorDefs[a.defId])).length, startY: hop.map(a => a.y) };
    const per = []; let bounces = 0;
    const o = sounds.boing; 
    const lastVy = hop.map(a => a.vy);
    for (let i = 0; i < 60 * 10; i++) {
      tick(1 / 60);
      hop.forEach((a, k) => { if (lastVy[k] > 150 && a.vy < -150) bounces++; lastVy[k] = a.vy; });
      if (i % 60 === 59) per.push({ air: hop.filter(a => !a.grounded).length, moving: hop.filter(a => Math.abs(a.vy) > 60 || Math.abs(a.vx) > 30).length });
    }
    const ys = hop.map(a => a.y), inRoom = hop.every(a => a.x > -30 && a.x < 24 * TILE + 30 && a.y > -30 && a.y < 18 * TILE + 30);
    return { info, per, bounces, inRoom, lives: lives };
  }`);
  console.log(JSON.stringify(r.per.slice(0, 5)), "bounces in 10s:", r.bounces);
  ok(!r.info.paused, "opens live");
  ok(r.info.hoppers >= 8, r.info.hoppers + " hopping Gloops");
  ok(r.info.lethal === 0, "none lethal");
  ok(r.per[0].moving >= 6, "most are moving within the first second (" + r.per[0].moving + " of " + r.info.hoppers + ")");
  ok(r.per.slice(0, 5).every(x => x.air >= 3), "at least 3 airborne in each of the first 5 seconds");
  ok(r.bounces >= 40, r.bounces + " bounce/hop launches in 10 s");
  ok(r.inRoom, "all stay in the room");
  ok(errs.length === 0, "no page errors " + errs[0]);
  await p.screenshot({ path: "/home/user/ToyGameDesigner/prototypes/popcorn-gloops.png" });
  await b.close(); console.log(bad ? bad + " FAILED" : "ALL PASSED"); process.exit(bad ? 1 : 0);
})();
