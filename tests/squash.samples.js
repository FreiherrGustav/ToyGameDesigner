// Stage 2 sample sweep (not deployed): every sample, 60 s idle and a scripted pass; lists every squash. Usage: node tests/squash.samples.js
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/opt/node22/lib/node_modules/playwright");
const src = fs.readFileSync(process.env.HTML || path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = `window.__sw = (() => {
  let rs = 1; Math.random = () => (rs = (rs * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const sq = []; { const o = squashNpc; squashNpc = function (t) { const d = actorDefs[t.defId]; sq.push({ t: Math.round(gameClockMs / 1000), who: d && d.name || t.defId, spawned: !!t.spawnerKey, x: Math.round(t.x / 32), y: Math.round(t.y / 32) }); return o.apply(this, arguments); }; }
  const KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", " ", "ArrowDown"];
  return {
    list: () => SAMPLE_GAMES.map(g => g.id),
    run(idx, mode, seconds) {
      rs = 1; sq.length = 0; if (appMode === "play") exitToBuildMode(); gameClockMs = 0; clearGameTimers();
      const g = SAMPLE_GAMES[idx]; loadExampleGame(g.builder, g.name, { skipConfirm: true }); enterPlayMode(); playReadyUntil = null;
      for (const k in keys) keys[k] = false;
      let lives0 = lives;
      for (let f = 0; f < seconds * 60; f++) {
        if (mode === "script") { // scripted pass: hold right 4 s, left 2 s, jump-mash while holding right, repeat; E taps
          const ph = Math.floor(f / 60) % 12;
          keys.ArrowRight = ph < 4 || ph >= 8; keys.ArrowLeft = ph >= 4 && ph < 6; keys[" "] = (f % 30) < 8 && ph >= 6; keys.ArrowDown = ph === 11;
        }
        if (playSessionEnded) { restartPlaySessionFromSnapshot(); playReadyUntil = null; }
        tick(1 / 60);
      }
      for (const k in keys) keys[k] = false;
      return { id: g.id, mode, squashes: sq.slice(), ended: !!playSessionEnded };
    }
  };
})();`;
const tmp = path.join(os.tmpdir(), "squash_samples.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK));
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const errors = []; let total = 0;
  const ids = await (async () => { const p = await browser.newPage(); await p.goto("file://" + tmp + "#t"); await p.waitForFunction(() => window.__sw); const l = await p.evaluate(() => __sw.list()); await p.close(); return l; })();
  for (let i = 0; i < ids.length; i++) for (const [mode, secs] of [["idle", 60], ["script", 60]]) {
    const page = await browser.newPage(); page.on("pageerror", e => errors.push(ids[i] + ": " + e)); page.on("dialog", d => d.accept());
    await page.goto("file://" + tmp + "#t"); await page.waitForFunction(() => window.__sw);
    let r; try { r = await page.evaluate(([i, m, s]) => __sw.run(i, m, s), [i, mode, secs]); } catch (e) { errors.push(ids[i] + ": " + String(e).slice(0, 150)); await page.close(); continue; }
    total += r.squashes.length;
    console.log((ids[i] + " " + mode).padEnd(34), "squashes:", r.squashes.length, r.squashes.length ? JSON.stringify(r.squashes.slice(0, 6)) : "");
    await page.close();
  }
  console.log("TOTAL squashes:", total, "errors:", errors.length, errors.slice(0, 5));
  await browser.close();
})();
