// Dev check: do fleers pile up? node tests/fleerspread.test.js [project.json] [index.html]
// Loads a project, plays 25 simulated seconds with the hero walking toward the nearest fleer, reports overlap and spread.
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const proj = process.argv[2] || path.join(__dirname, "..", "examples", "herd-the-wheebuns.json");
const html = process.argv[3] || path.join(__dirname, "..", "index.html");
let src = fs.readFileSync(html, "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
src = src.replace(anchor, anchor + `window.__h = { restoreProjectSnapshot, enterPlayMode, tick, get actors() { return actors; }, get lives() { return lives; }, keys, set rafOff(v) {}, advance: (ms) => { if (typeof advanceGameClock === "function") advanceGameClock(ms); }, get ended() { return playSessionEnded; } };\n`);
src = src.replace("requestAnimationFrame(frame);", "/*raf off*/");
const tmp = path.join(os.tmpdir(), "fleerspread.html"); fs.writeFileSync(tmp, src);
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); const p = await b.newPage();
  p.on("pageerror", e => console.log("PAGEERR", e.message)); p.on("dialog", d => d.accept());
  await p.goto("file://" + tmp + "#t"); await p.waitForFunction(() => window.__h);
  const res = await p.evaluate((json) => {
    const h = window.__h; { const d = JSON.parse(json); h.restoreProjectSnapshot(d.data || d); }; h.enterPlayMode();
    const dt = 1 / 60; let seed = 12345; Math.random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < 80; i++) { h.tick(dt); } // clear READY (tick runs regardless in this harness)
    const out = { overlapFrames: 0, frames: 0, minD: 1e9, spreadSamples: [] };
    for (let f = 0; f < 60 * 25; f++) {
      const pl = h.actors.find(a => a.isPlayer); const fl = h.actors.filter(a => !a.isPlayer && !a.destroyed);
      for (const k of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) h.keys[k] = false;
      let best = null, bd = 1e9; for (const a of fl) { const d = Math.hypot(a.x - pl.x, a.y - pl.y); if (d < bd) { bd = d; best = a; } }
      if (best && f % 3 === 0) { const t = best; h.keys[t.x > pl.x + 6 ? "ArrowRight" : "ArrowLeft"] = true; h.keys[t.y > pl.y + 6 ? "ArrowDown" : "ArrowUp"] = true; }
      h.tick(dt); h.advance && 0;
      out.frames++;
      let ov = false;
      for (let i = 0; i < fl.length; i++) for (let j = i + 1; j < fl.length; j++) { const d = Math.hypot(fl[i].x - fl[j].x, fl[i].y - fl[j].y); out.minD = Math.min(out.minD, d); if (d < 11) ov = true; }
      if (ov) out.overlapFrames++;
      if (f % 300 === 299) out.spreadSamples.push(fl.map(a => [Math.round(a.x / 32), Math.round(a.y / 32)].join(",")).join(" "));
    }
    out.lives = h.lives; out.n = h.actors.length; return out;
  }, fs.readFileSync(proj, "utf8"));
  console.log(JSON.stringify(res, null, 1)); await b.close();
})();
