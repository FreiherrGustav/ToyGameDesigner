// Board must never resize/move when the camera mode or any palette swatch changes (real scrollbars on). Usage: node tests/jump.test.js
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/opt/node22/lib/node_modules/playwright");
const path = require("path");
const HTML = process.env.HTML || path.join(__dirname, "..", "index.html");
const V = [[1280, 590], [1366, 635], [1366, 768], [1920, 1080]];
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log("FAIL", m)); };
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", ignoreDefaultArgs: ["--hide-scrollbars"] });
  for (const [w, h] of V) {
    const p = await b.newPage({ viewport: { width: w, height: h } }); const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("dialog", d => d.accept());
    await p.goto("file://" + HTML + "#t"); await p.waitForTimeout(500);
    const snap = () => p.evaluate(() => { const r = document.getElementById("gameCanvas").getBoundingClientRect(); const pw = document.getElementById("paletteWrap"); return { x: r.x, y: r.y, w: r.width, h: r.height, sb: pw.scrollHeight > pw.clientHeight, pw: pw.getBoundingClientRect().width }; });
    const same = (a, c) => Math.abs(a.x - c.x) < .5 && Math.abs(a.y - c.y) < .5 && Math.abs(a.w - c.w) < .5 && Math.abs(a.h - c.h) < .5;
    const base = await snap(); const tag = w + "x" + h;
    for (const i of [1, 2, 0, 1, 0]) { await p.evaluate(i => document.querySelectorAll("#cameraSwatches .swatch")[i].click(), i); await p.waitForTimeout(200); ok(same(base, await snap()), `${tag}: camera swatch ${i} moved the board`); }
    let n = 0, moves = 0, rewraps = 0;
    for (const t of ["modeCharacter", "modeObject", "modeGround", "modePaint", "modeErase"]) {
      await p.evaluate(t => document.getElementById(t).click(), t); await p.waitForTimeout(80);
      const cnt = await p.evaluate(() => document.querySelectorAll("#paletteWrap .swatch").length);
      for (let i = 0; i < cnt; i++) {
        const clicked = await p.evaluate(i => { const e = document.querySelectorAll("#paletteWrap .swatch")[i]; if (!e || !e.offsetParent || /^\+$/.test(e.textContent.trim())) return false; e.click(); return true; }, i);
        if (!clicked) continue; n++; await p.waitForTimeout(30);
        const s = await snap(); if (!same(base, s)) moves++; if (Math.abs(s.pw - base.pw) > .5) rewraps++;
      }
    }
    ok(n > 80, `${tag}: clicked ${n} swatches`); ok(moves === 0, `${tag}: ${moves} swatch clicks moved the board`);
    ok(rewraps === 0, `${tag}: ${rewraps} palette width changes`); ok(errs.length === 0, `${tag}: errors ${errs}`);
    await p.close();
  }
  await b.close(); console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
