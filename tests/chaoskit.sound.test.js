// Make a Mess: earthquake and lava sounds. Measures the real master-bus level (analyser) over time. node tests/chaoskit.sound.test.js
const fs = require("fs"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const ANCH = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
fs.mkdirSync("/tmp/ck", { recursive: true });
fs.writeFileSync("/tmp/ck/snd.html", fs.readFileSync(path.resolve(__dirname, "..", "index.html"), "utf8").replace(ANCH, ANCH + 'window.__ev = f => eval("(" + f + ")");\n'));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--autoplay-policy=no-user-gesture-required"] });
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage(); const errs = [];
  page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept());
  await page.goto("file:///tmp/ck/snd.html#t"); await page.waitForTimeout(700);
  const ev = (fn, a) => page.evaluate(([s, x]) => window.__ev(s)(x), [String(fn), a]);
  await ev(() => { restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); const s = SAMPLE_GAMES.find(x => x.id === "cloud-hopper"); loadExampleGame(s.builder, s.name, { skipConfirm: true }); setGamePaused(false);
    const an = getAudioCtx().createAnalyser(); an.fftSize = 2048; getMasterBus().connect(an); window.__an = an; window.__buf = new Float32Array(2048);
    window.__rms = () => { an.getFloatTimeDomainData(window.__buf); let s = 0; for (const v of window.__buf) s += v * v; return Math.sqrt(s / window.__buf.length); };
    window.__hiss = () => { return 0; }; });
  await page.click("#messTabMess");
  const sample = async (n, ms) => { const a = []; for (let i = 0; i < n; i++) { a.push(await ev(() => window.__rms())); await page.waitForTimeout(ms); } return a; };
  const avg = (a, i, j) => a.slice(i, j).reduce((x, y) => x + y, 0) / Math.max(1, j - i);
  // quiet before
  const q0 = avg(await sample(5, 40), 0, 5);
  await page.click("[data-mk=quake]");
  const qa = await sample(70, 100); // 7 s
  const early = avg(qa, 3, 10), mid = avg(qa, 40, 55), late = avg(qa, 64, 70), peak = Math.max(...qa);
  console.log("quake rms: before", q0.toFixed(4), "early", early.toFixed(4), "peak-phase", mid.toFixed(4), "tail", late.toFixed(4), "max", peak.toFixed(4));
  ok(early > q0 * 2 && early > 0.002, "quake audible at the start");
  ok(mid > early * 1.5, "quake swells louder toward its peak");
  ok(late < mid * 0.6, "quake fades out at the end");
  ok(peak < 0.9, "no clipping");
  await page.waitForTimeout(4000);
  const qafter = avg(await sample(5, 40), 0, 5); ok(qafter < 0.003, "silent after the quake: " + qafter.toFixed(4));
  await page.click("[data-mk=lava]");
  const la = await sample(90, 100);
  const l1 = avg(la, 2, 10), l2 = avg(la, 20, 30), lend = avg(la, 80, 90), lmax = Math.max(...la);
  console.log("lava rms: start", l1.toFixed(4), "rising", l2.toFixed(4), "end", lend.toFixed(4), "max", lmax.toFixed(4));
  ok(l1 > 0.002 && l2 > 0.004, "lava audible");
  ok(lmax < 0.9, "no clipping (lava)");
  await page.waitForTimeout(1200);
  const lafter = avg(await sample(5, 40), 0, 5); ok(lafter < 0.003, "silent after lava: " + lafter.toFixed(4));
  // tumble siren: audible but quiet, silent after
  await page.click("[data-mk=tumble]"); const ta = await sample(50, 100);
  const tm = avg(ta, 8, 40), tmax = Math.max(...ta); console.log("tumble siren rms", tm.toFixed(4), "max", tmax.toFixed(4));
  ok(tm > 0.004 && tmax < 0.12, "siren audible but not loud");
  await page.waitForTimeout(4500); ok(avg(await sample(5, 40), 0, 5) < 0.003, "silent after tumble");
  // Stop mid-run silences quickly
  await page.click("[data-mk=quake]"); await page.waitForTimeout(3000); await page.click("#mkStop"); await page.waitForTimeout(900);
  ok(avg(await sample(5, 40), 0, 5) < 0.003, "Stop silences the quake");
  await page.click("[data-mk=lava]"); await page.waitForTimeout(2000); await page.click("#mkStop"); await page.waitForTimeout(900);
  ok(avg(await sample(5, 40), 0, 5) < 0.003, "Stop silences the lava");
  ok(errs.length === 0, "no page errors " + errs.join("|"));
  console.log(pass + " passed, " + fail + " failed"); await browser.close(); process.exit(fail ? 1 : 0);
})();
