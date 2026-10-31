// Tutorial look: default sky backdrop, grass ground. node tests/tutoriallook.test.js [shotDir] [html] [label]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const HTML = process.argv[3] || path.resolve(__dirname, '..', 'index.html'), LABEL = process.argv[4] || 'after';
const shotDir = process.argv[2];
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
let src = fs.readFileSync(HTML, 'utf8');
const anchor = '  if (loadAutosave()) log(';
src = src.replace('const TUT_GLIDE_RATE = 11, TUT_HOLD_MS = 900;', 'const TUT_GLIDE_RATE = 400, TUT_HOLD_MS = 80;');
src = src.replace(anchor, `  window.__t = { info: () => { snapshotCurrentRoomState(); let tiles = 0, grass = 0, sky = 0, real = 0; for (let y = 0; y < ROWS; y++) for (let x = 0; x < board[0].length; x++) { if (board[y][x]) tiles++; if (groundSkinBoard[y][x] === 'gndGrass') grass++; if (backgroundBoard[y][x]) sky++; if (isRealBackground(backgroundBoard[y][x])) real++; }
      return { tiles, grass, sky, real, rooms: rooms.map(r => r.name), actors: actors.length, tut: !!tutorial, step: tutorial ? (TUTORIAL_STEPS.find(s => !(s.applies && !s.applies()) && !s.done()) || {}).name : null }; },
    teleportToGoal: () => { const g = tutGoalCell(); const p = actors.find(a => a.isPlayer); p.x = g.x * TILE + 4; p.y = g.y * TILE + 4; p.vx = p.vy = 0; },
    place: (x, y) => { board[y][x] = gameplayKey("solid", "none"); snapshotCurrentRoomState(); }, save: () => { snapshotCurrentRoomState(); saveAutosave(); },
    border: () => canvasBorderPx, cap: () => JSON.stringify(captureProjectSnapshot().rooms.map(r => [r.name, r.board, r.backgroundBoard, r.actors.length])) };
` + anchor);
const TMP = '/tmp/tutlook_' + LABEL + '.html'; fs.writeFileSync(TMP, src);
const GROUND = LABEL === 'before' ? 'solid' : 'grass';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', ignoreDefaultArgs: ['--hide-scrollbars'] });
  const open = async (w, h, ctx, hash = '') => { const c = ctx || await b.newContext({ viewport: { width: w, height: h } }); const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('dialog', d => d.accept());
    await p.goto('file://' + TMP + hash); await p.waitForTimeout(500); return p; };
  const cellRect = (p, x, y, w = 1, h = 1) => p.evaluate(([x, y, w, h]) => { const r = document.getElementById('gameCanvas').getBoundingClientRect(), bw = __t.border(), k = (r.width - 2 * bw) / 768; return [r.left + bw + x * 32 * k, r.top + bw + y * 32 * k, w * 32 * k, h * 32 * k]; }, [x, y, w, h]);
  const settle = p => p.waitForTimeout(350);
  const shot = (p, n) => shotDir && (fs.mkdirSync(shotDir, { recursive: true }), p.screenshot({ path: path.join(shotDir, n + '.png') }));
  const drag = async (p, x0, y0, x1, y1) => { const a = await cellRect(p, x0, y0), z = await cellRect(p, x1, y1); await p.mouse.move(a[0] + a[2] / 2, a[1] + a[3] / 2); await p.mouse.down(); await p.mouse.move(z[0] + z[2] / 2, z[1] + z[3] / 2, { steps: 10 }); await p.mouse.up(); };
  const click = async (p, x, y) => { const r = await cellRect(p, x, y); await p.mouse.click(r[0] + r[2] / 2, r[1] + r[3] / 2); };
  const pick = async (p, tab, sel) => { await p.click(tab); await p.click(sel); };
  const sw = `#groundSwatches .swatch[title="${GROUND}"]`;
  const ring = p => p.evaluate(() => { const r = document.querySelector('#tutLayer .tutRing'); if (!r || r.style.display === 'none') return null; const q = r.getBoundingClientRect(); return [q.left, q.top, q.width, q.height]; });
  const rectOf = (p, sel) => p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }, sel);
  const onRect = (g, t, pad = 6) => g && Math.abs(g[0] - (t[0] - pad)) <= 2 && Math.abs(g[1] - (t[1] - pad)) <= 2 && Math.abs(g[2] - (t[2] + 2 * pad)) <= 3 && Math.abs(g[3] - (t[3] + 2 * pad)) <= 3;

  for (const [w, h] of [[1366, 768], [1920, 1080]]) {
    // happy path on a blank project
    const p = await open(w, h); await p.click('#landingShowBtn'); await settle(p);
    let i = await p.evaluate(() => __t.info());
    if (LABEL !== 'before') ok(i.sky > 100 && i.real === 0, w + ': sky backdrop at tutorial start ' + JSON.stringify(i)); else ok(i.sky === 0, w + ': (before) no sky');
    ok(onRect(await ring(p), await rectOf(p, sw)), w + ': first ring on the ' + GROUND + ' swatch'); await shot(p, `${LABEL}-first-${w}`);
    await p.click(sw); await settle(p);
    ok(onRect(await ring(p), await cellRect(p, 2, 14, 11, 1)), w + ': ring on the floor span');
    await drag(p, 2, 14, 12, 14); await settle(p);
    i = await p.evaluate(() => __t.info()); ok(i.step === 'ledge', w + ': floor painted -> ledge ' + i.step);
    if (LABEL !== 'before') ok(i.grass === 11, w + ': floor is grass ' + i.grass);
    ok(onRect(await ring(p), await cellRect(p, 9, 12, 4, 2)), w + ': ring on the step-up block');
    for (const row of [12, 13]) await drag(p, 9, row, 12, row); await settle(p);
    i = await p.evaluate(() => __t.info()); ok(i.step === 'player', w + ': ledge done by skinned tiles -> player ' + i.step);
    if (LABEL !== 'before') ok(i.grass === 19, w + ': step-up block is grass too ' + i.grass);
    await pick(p, '#modeCharacter', '#playerSwatchRow .swatch[title="player"]'); await click(p, 6, 13); await settle(p);
    await pick(p, '#modeCharacter', '#characterSwatches .swatch:first-child'); await click(p, 2, 13); await settle(p);
    await pick(p, '#modeObject', '#fixtureSwatches .swatch[title="goal"]'); await click(p, 12, 11); await settle(p);
    ok((await p.evaluate(() => __t.info())).step === 'play', w + ': all placed -> Play');
    await p.click('#modePlayBtn'); await p.waitForTimeout(1500); await p.evaluate(() => __t.teleportToGoal()); await p.waitForTimeout(3600);
    i = await p.evaluate(() => __t.info()); ok(i.step === 'objects', w + ': won -> objects step ' + i.step);
    await p.click('#modeObject'); await p.waitForTimeout(3300);
    i = await p.evaluate(() => __t.info()); ok(!i.tut && i.tiles >= 19 && i.actors >= 2, w + ': finished, board kept ' + JSON.stringify(i)); if (LABEL !== 'before') ok(i.sky > 100, w + ': finished board has the sky');
    await shot(p, `${LABEL}-finished-${w}`); ok(!p.errs.length, w + ': no errors ' + p.errs); await p.context().close();
  }
  if (LABEL !== 'before') {
    const [w, h] = [1366, 768];
    // out of order: goal and enemy first, then a plain solid swatch is also accepted for ground
    { const p = await open(w, h); await p.click('#landingShowBtn'); await settle(p);
      await pick(p, '#modeObject', '#fixtureSwatches .swatch[title="goal"]'); await click(p, 12, 11); await settle(p);
      ok((await p.evaluate(() => __t.info())).step === 'ground', 'out of order: ground still first');
      await pick(p, '#modeGround', '#groundSwatches .swatch[title="solid"]'); await settle(p);
      ok(onRect(await ring(p), await cellRect(p, 2, 14, 11, 1)), 'a plain solid pick also shows the floor span (not sent back)');
      await drag(p, 2, 14, 12, 14); await settle(p); ok((await p.evaluate(() => __t.info())).step === 'ledge', 'plain solid floor counts too');
      await p.context().close(); }
    // quit with Esc and with the close button, existing project left untouched (blank and busy)
    for (const how of ['esc', 'x']) for (const busy of [false, true]) {
      const p = await open(w, h, null, '#t');
      if (busy) { await p.evaluate(() => { __t.place(3, 10); __t.save(); }); }
      const before = await p.evaluate(() => __t.cap());
      await p.click('#homeLogo'); await settle(p); await p.click('#landingShowBtn'); await settle(p);
      const i = await p.evaluate(() => __t.info()); ok(i.tut && i.sky > 100, `${how}/${busy ? 'busy' : 'blank'}: tutorial running with sky ` + JSON.stringify(i));
      if (busy) ok(i.rooms.includes('Tutorial'), 'busy project gets its own Tutorial room');
      await pick(p, '#modeGround', sw); await drag(p, 2, 14, 12, 14); await settle(p);
      if (how === 'esc') await p.keyboard.press('Escape'); else await p.click('#tutClose'); await settle(p);
      ok(!(await p.evaluate(() => __t.info())).tut && (await p.evaluate(() => __t.cap())) === before, `${how}/${busy ? 'busy' : 'blank'}: quit leaves the project exactly as it was`);
      ok(!p.errs.length, 'no errors ' + p.errs); await p.context().close(); }
    // reload in the middle of the tutorial: the saved project comes back, nothing of the tutorial is saved
    { const c = await b.newContext({ viewport: { width: w, height: h } }); const p = await open(w, h, c, '#t'); await p.evaluate(() => { __t.place(3, 10); __t.save(); });
      const before = await p.evaluate(() => __t.cap()); await p.click('#homeLogo'); await settle(p); await p.click('#landingShowBtn'); await settle(p);
      await pick(p, '#modeGround', sw); await drag(p, 2, 14, 12, 14); await p.waitForTimeout(4500); // longer than the autosave interval
      await p.goto('file://' + TMP + '#t'); await p.reload(); await p.waitForTimeout(600);
      const i = await p.evaluate(() => __t.info()); ok(!i.tut && i.tiles === 1 && i.grass === 0 && i.rooms.length === 1, 'reload mid-tutorial: saved project back, no tutorial leftovers ' + JSON.stringify(i));
      ok((await p.evaluate(() => __t.cap())) === before, 'reload mid-tutorial: project identical'); await c.close(); }
  }
  await b.close();
  console.log('tutoriallook(' + LABEL + '): ' + pass + ' passed, ' + fail + ' failed');
})();
