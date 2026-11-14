// Random-input bot for The Popcorn Box: how often does a random player reach the star cache (and the rewards)?
// node tests/popcorn.fuzz.js [runs] [ticksPerRun] [fps]   (hook-injected temp copy; the repo file stays clean)
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = `window.__f = {
  tpl: () => surpriseTemplateById("popcorn").rows,
  cells: () => board.map(r => r.slice(0, 24).map(c => !c || c === "none:none" ? "." : c.indexOf("solid:bouncy") === 0 ? "B" : c.indexOf("trampoline") === 0 ? "t" : "#").join("")),
  dump: () => actors.map(a => [a.defId, Math.round(a.x / 32), Math.round(a.y / 32)]),
  build: () => { const r = surpriseMe(10000, { templateId: "popcorn" }); setGamePaused(false); return r && r.roomId; },
  step: (n, dt) => { for (let i = 0; i < n; i++) tick(dt); },
  setKeys: k => { ["ArrowLeft", "ArrowRight", " "].forEach(x => { keys[x] = false; }); k.forEach(x => { keys[x] = true; }); },
  state: () => { const p = actors.find(a => a.isPlayer); return { x: p.x, y: p.y, star: actors.some(a => a.defId === "colStar"), rewards: actors.filter(a => (actorDefs[a.defId] || {}).temperament === "collectible" && a.defId !== "colStar").length, n: actors.length }; } };
`;
const tmp = path.join(os.tmpdir(), "popfuzz.html"); fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK));
const RUNS = Number(process.argv[2] || 60), TICKS = Number(process.argv[3] || 3600), FPS = Number(process.argv[4] || 60);
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  let gotStar = 0, firstTimes = [], minRewards = [], errs = 0;
  for (let r = 0; r < RUNS; r++) {
    const p = await b.newPage(); p.on("dialog", d => d.accept()); p.on("pageerror", e => { errs++; if (errs < 3) console.log("pageerror", String(e)); });
    await p.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    await p.goto("file://" + tmp + "#t"); await p.waitForFunction(() => window.__f);
    const res = await p.evaluate(([seed, ticks, fps]) => {
      Math.random = (function () { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();
      window.__f.build(); const dt = 1 / fps; let t = 0, star = null, minR = 99;
      while (t < ticks) {
        const L = Math.random(), k = []; if (L < 0.4) k.push("ArrowLeft"); else if (L < 0.7) k.push("ArrowRight"); if (Math.random() < 0.5) k.push(" ");
        window.__f.setKeys(k); const n = 4 + Math.floor(Math.random() * 26);
        for (let i = 0; i < n && t < ticks; i++, t++) { window.__f.step(1, dt); }
        const s = window.__f.state(); minR = Math.min(minR, s.rewards); if (!s.star && star == null) star = t / fps;
      }
      return { star, minR };
    }, [r + 1, TICKS, FPS]);
    if (res.star != null) { gotStar++; firstTimes.push(res.star); } minRewards.push(res.minR);
    await p.close();
  }
  console.log("runs " + RUNS + ", star reached in " + gotStar + " (" + Math.round(100 * gotStar / RUNS) + "%), first-times(s): " + firstTimes.map(x => x.toFixed(0)).join(",") + ", errors " + errs);
  await b.close();
})();
