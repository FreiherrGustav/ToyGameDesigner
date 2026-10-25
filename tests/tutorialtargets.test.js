// Show me how, Stage 3: every step's target is findable, visible, unclipped and uncovered at the standard viewports.
// node tests/tutorialtargets.test.js   (Chromium; Firefox is run too when playwright has it installed)
const pw = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const HTML = path.resolve(__dirname, '..', 'index.html');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
let src = fs.readFileSync(HTML, 'utf8');
const anchor = '  if (loadAutosave()) log(';
src = src.replace(anchor, `  window.__t = { border: () => canvasBorderPx, stepName: () => { const s = tutorial && tutCurrentStep(); return s ? s.name : null; } };\n` + anchor);
fs.writeFileSync('/tmp/tuttargets_hooked.html', src);
const VIEWPORTS = [[1280, 590], [1366, 635], [1366, 768], [1920, 1080]];
const FADE = 22;
async function run(name, launcher, opts) {
  let b; try { b = await launcher.launch(opts); } catch (e) { console.log(name + ': not available, skipped'); return; }
  for (const [w, h] of VIEWPORTS) {
    const c = await b.newContext({ viewport: { width: w, height: h } }); const p = await c.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
    await p.goto('file:///tmp/tuttargets_hooked.html'); await p.waitForTimeout(500);
    const tag = `${name} ${w}x${h}`;
    await p.click('#landingShowBtn'); await p.waitForTimeout(350);
    // Check the current step's ring: the thing under it must exist, be on screen, not clipped by the palette or its fade, and not covered.
    const check = async (label, sel) => {
      const step = await p.evaluate(() => __t.stepName());
      const where = `${tag} step "${step}" (${label})`;
      const ring = await p.evaluate(() => { const r = document.querySelector('#tutLayer .tutRing'); if (!r || r.style.display === 'none') return null; const q = r.getBoundingClientRect(); return [q.left, q.top, q.width, q.height]; });
      ok(!!ring, where + ': ring shown (target missing or hidden)');
      const info = await p.evaluate(({ sel }) => {
        const e = document.querySelector(sel); if (!e) return { missing: true };
        const r = e.getBoundingClientRect(), vw = innerWidth, vh = innerHeight;
        const cs = getComputedStyle(e);
        const o = { r: [r.left, r.top, r.width, r.height], hidden: cs.visibility === 'hidden' || cs.display === 'none' || r.width < 2 || r.height < 2, inView: r.left >= 0 && r.top >= 0 && r.right <= vw && r.bottom <= vh };
        const pal = e.closest('#paletteWrap');
        if (pal) { const q = pal.getBoundingClientRect(); o.inPalette = r.top >= q.top && r.bottom <= q.bottom; o.fade = Math.min(r.top - q.top, q.bottom - r.bottom); o.canScrollUp = pal.scrollTop > 1; o.canScrollDown = pal.scrollTop + pal.clientHeight < pal.scrollHeight - 1; o.fadeTop = r.top - q.top; o.fadeBot = q.bottom - r.bottom; }
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2, top = document.elementFromPoint(cx, cy);
        o.covered = !(top && (top === e || e.contains(top) || top.closest('#tutLayer')));
        return o;
      }, { sel });
      ok(!info.missing, where + ': target element missing');
      if (info.missing) return;
      ok(!info.hidden, where + ': target hidden');
      ok(info.inView, where + ': target outside the window');
      if ('inPalette' in info) {
        ok(info.inPalette, where + ': target clipped by the palette');
        ok(!(info.canScrollUp && info.fadeTop < FADE), where + ': target inside the top scroll fade');
        ok(!(info.canScrollDown && info.fadeBot < FADE), where + ': target inside the bottom scroll fade');
      }
      ok(!info.covered, where + ': target covered by something else');
      const t = info.r; ok(Math.abs(ring[0] - (t[0] - Math.min(6, Math.max(0, t[0])))) <= 2 && Math.abs(ring[1] - (t[1] - Math.min(6, Math.max(0, t[1])))) <= 2 && ring[0] >= 0 && ring[1] >= 0, where + ': ring not on target');
    };
    const cellCheck = async label => {
      const step = await p.evaluate(() => __t.stepName());
      const where = `${tag} step "${step}" (${label})`;
      const ring = await p.evaluate(() => { const r = document.querySelector('#tutLayer .tutRing'); if (!r || r.style.display === 'none') return null; const q = r.getBoundingClientRect(); return [q.left, q.top, q.width, q.height]; });
      ok(!!ring, where + ': ring shown');
      if (!ring) return;
      const cv = await p.evaluate(() => { const r = document.getElementById('gameCanvas').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom, innerWidth, innerHeight]; });
      const cx = ring[0] + ring[2] / 2, cy = ring[1] + ring[3] / 2;
      ok(cx > cv[0] && cx < cv[2] && cy > cv[1] && cy < cv[3], where + ': target outside the board');
      ok(ring[0] >= 0 && ring[1] >= 0 && ring[0] + ring[2] <= cv[4] && ring[1] + ring[3] <= cv[5], where + ': target clipped by the window');
    };
    const cellRect = (x, y) => p.evaluate(([x, y]) => { const r = document.getElementById('gameCanvas').getBoundingClientRect(), bw = __t.border(), k = (r.width - 2 * bw) / 768; return [r.left + bw + x * 32 * k, r.top + bw + y * 32 * k, 32 * k, 32 * k]; }, [x, y]);
    const clickCell = async (x, y) => { const r = await cellRect(x, y); await p.mouse.click(r[0] + r[2] / 2, r[1] + r[3] / 2); await p.waitForTimeout(350); };
    const S = { player: '#playerSwatchRow .swatch[title="player"]', ground: '#groundSwatches .swatch[title="solid"]', enemy: '#characterSwatches .swatch[title="wanderer"]', goal: '#fixtureSwatches .swatch[title="goal"]' };
    await check('swatch', S.ground); await p.click(S.ground); await p.waitForTimeout(350); await cellCheck('floor');
    { const a = await cellRect(2, 14), z = await cellRect(9, 14); await p.mouse.move(a[0] + a[2] / 2, a[1] + a[3] / 2); await p.mouse.down(); await p.mouse.move(z[0] + z[2] / 2, z[1] + z[3] / 2, { steps: 12 }); await p.mouse.up(); await p.waitForTimeout(350); }
    await cellCheck('ledge');
    for (const row of [12, 13]) { const a = await cellRect(6, row), z = await cellRect(9, row); await p.mouse.move(a[0] + a[2] / 2, a[1] + a[3] / 2); await p.mouse.down(); await p.mouse.move(z[0] + z[2] / 2, z[1] + z[3] / 2, { steps: 8 }); await p.mouse.up(); }
    await p.waitForTimeout(350);
    await check('swatch', S.player); await p.click(S.player); await p.waitForTimeout(350); await cellCheck('cell'); await clickCell(3, 13);
    await check('swatch', S.enemy); await p.click(S.enemy); await p.waitForTimeout(350); await cellCheck('cell'); await clickCell(5, 13);
    await check('swatch', S.goal); await p.click(S.goal); await p.waitForTimeout(350); await cellCheck('cell'); await clickCell(8, 11);
    await check('button', '#modePlayBtn');
    await p.click('#modePlayBtn'); await p.waitForTimeout(1500); await cellCheck('goal while playing');
    ok(errs.length === 0, tag + ': page errors ' + errs.join('|'));
    await c.close();
  }
  await b.close();
}
(async () => {
  await run('chromium', pw.chromium, { executablePath: '/opt/pw-browsers/chromium', ignoreDefaultArgs: ['--hide-scrollbars'] });
  await run('firefox', pw.firefox, {});
  console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
