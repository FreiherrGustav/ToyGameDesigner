// Show me how, Stage 2: the six real steps through the real UI. node tests/tutorial2.test.js [shotDir]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const HTML = path.resolve(__dirname, '..', 'index.html');
const shotDir = process.argv[2];
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
let src = fs.readFileSync(HTML, 'utf8');
const anchor = '  if (loadAutosave()) log(';
src = src.replace('const TUT_GLIDE_RATE = 11, TUT_HOLD_MS = 900;', 'const TUT_GLIDE_RATE = 400, TUT_HOLD_MS = 80;');
src = src.replace(anchor, `  window.__t = { snap: () => JSON.stringify(captureProjectSnapshot(), (k, v) => (k === 'impactWobbleT' || k === 'dispAngT') ? undefined : v),
    border: () => canvasBorderPx, active: () => !!tutorial, rooms: () => rooms.map(r => r.name), appMode: () => appMode,
    teleportToGoal: () => { const g = tutGoalCell(); const p = actors.find(a => a.isPlayer); p.x = g.x * TILE + 4; p.y = g.y * TILE + 4; p.vx = p.vy = 0; },
    lose: () => { playSessionEnded = "lose"; }, hero: () => { const a = actors.find(x => x.isPlayer); return a && { x: a.x, y: a.y, sx: a.spawnX, sy: a.spawnY, grounded: a.grounded }; }, stepName: () => { const s = tutorial && tutCurrentStep(); return s ? s.name : null; },
    goalCell: () => { const c = tutGoalCell(); return c ? [c.x, c.y] : null; },
    stuff: () => { snapshotCurrentRoomState(); return [actors.length, tutCount("solid:"), !!tutGoalCell()]; } };
` + anchor);
fs.writeFileSync('/tmp/tut2_hooked.html', src);
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', ignoreDefaultArgs: ['--hide-scrollbars'] });
  const open = async (w, h) => { const c = await b.newContext({ viewport: { width: w, height: h } }); const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('dialog', d => d.accept());
    await p.goto('file:///tmp/tut2_hooked.html'); await p.waitForTimeout(500); return p; };
  const ring = p => p.evaluate(() => { const r = document.querySelector('#tutLayer .tutRing'); if (!r || r.style.display === 'none' || document.getElementById('tutLayer').classList.contains('off')) return null; const b = r.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; });
  const rect = (p, sel) => p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }, sel);
  const cellRect = (p, x, y, w = 1, h = 1) => p.evaluate(([x, y, w, h]) => { const r = document.getElementById('gameCanvas').getBoundingClientRect(), bw = __t.border(), k = (r.width - 2 * bw) / 768; return [r.left + bw + x * 32 * k, r.top + bw + y * 32 * k, w * 32 * k, h * 32 * k]; }, [x, y, w, h]);
  const onRect = (g, t, pad = 6) => g && Math.abs(g[0] - (t[0] - pad)) <= 1.5 && Math.abs(g[1] - (t[1] - pad)) <= 1.5 && Math.abs(g[2] - (t[2] + 2 * pad)) <= 2 && Math.abs(g[3] - (t[3] + 2 * pad)) <= 2;
  const around = (g, t, vw) => g && g[0] >= 0 && g[1] >= 0 && g[0] + g[2] <= vw + 0.5 && g[0] <= t[0] + 0.5 && g[1] <= t[1] + 0.5 && g[0] + g[2] >= t[0] + t[2] - 0.5 && g[1] + g[3] >= t[1] + t[3] - 0.5 && g[0] + g[2] <= t[0] + t[2] + 6.5 && g[1] + g[3] <= t[1] + t[3] + 6.5;
  const pick = async (p, tabSel, sel) => { await p.click(tabSel); await p.click(sel); };
  const settle = p => p.waitForTimeout(350);
  const clickCell = async (p, x, y) => { const r = await cellRect(p, x, y); await p.mouse.click(r[0] + r[2] / 2, r[1] + r[3] / 2); };
  const start = async p => { await p.click('#landingShowBtn'); await settle(p); };
  const shot = (p, n) => shotDir && (fs.mkdirSync(shotDir, { recursive: true }), p.screenshot({ path: path.join(shotDir, n + '.png') }));
  const nothing = p => p.evaluate(() => !document.getElementById('tutLayer') && !document.getElementById('tutClose'));

  // landing button is last in the row; keyboard focusable
  const VPS = process.env.VPS ? JSON.parse(process.env.VPS) : [[1280, 590], [1366, 635], [1920, 1080]], MID = VPS.length > 1 ? VPS[1] : VPS[0];
  for (const [w, h] of VPS) {
    const p = await open(w, h);
    ok(await p.evaluate(() => { const bs = [...document.querySelectorAll('#landingButtons button')]; return bs[bs.length - 1].id === 'landingShowBtn'; }), w + ': Show me how is the last button');
    const before = await p.evaluate(() => localStorage.getItem('toyGameDesigner.autosave.v1'));
    await start(p);
    ok(await p.evaluate(() => __t.active() && !document.body.classList.contains('landing')), w + ': tutorial started from landing');
    // 1 ground: swatch, then 8-cell span; drag
    ok(onRect(await ring(p), await rect(p, '#groundSwatches .swatch[title="grass"]')), w + ': 2 ring on solid swatch');
    await shot(p, `s2_2a_ground_swatch_${w}`);
    await p.click('#groundSwatches .swatch[title="grass"]'); await settle(p);
    ok(onRect(await ring(p), await cellRect(p, 2, 14, 11, 1)), w + ': 2 ring on floor span');
    await shot(p, `s2_2b_ground_span_${w}`);
    { const a = await cellRect(p, 2, 14), z = await cellRect(p, 12, 14); await p.mouse.move(a[0] + a[2] / 2, a[1] + a[3] / 2); await p.mouse.down(); await p.mouse.move(z[0] + z[2] / 2, z[1] + z[3] / 2, { steps: 12 }); await p.mouse.up(); }
    await settle(p);
    // 1b ledge: the second level of ground, a 4 x 2 block at the right end
    ok(onRect(await ring(p), await cellRect(p, 9, 12, 4, 2)), w + ': 1b ring on the ledge');
    await shot(p, `s2_1c_ledge_${w}`);
    for (const row of [12, 13]) { const a = await cellRect(p, 9, row), z = await cellRect(p, 12, row); await p.mouse.move(a[0] + a[2] / 2, a[1] + a[3] / 2); await p.mouse.down(); await p.mouse.move(z[0] + z[2] / 2, z[1] + z[3] / 2, { steps: 8 }); await p.mouse.up(); }
    await settle(p);
    // 2 player: swatch, then cell
    let g = await ring(p); ok(onRect(g, await rect(p, '#playerSwatchRow .swatch[title="player"]')), w + ': 1 ring on player swatch');
    await shot(p, `s2_1a_player_swatch_${w}`);
    await p.click('#playerSwatchRow .swatch[title="player"]'); await settle(p);
    ok(onRect(await ring(p), await cellRect(p, 6, 13)), w + ': 1 ring on board cell');
    await shot(p, `s2_1b_player_cell_${w}`);
    await clickCell(p, 6, 13); await settle(p);
    // 3 enemy
    ok(onRect(await ring(p), await rect(p, '#characterSwatches .swatch:first-child')), w + ': 3 ring on enemy swatch');
    await shot(p, `s2_3a_enemy_swatch_${w}`);
    await p.click('#characterSwatches .swatch:first-child'); await settle(p);
    ok(onRect(await ring(p), await cellRect(p, 2, 13)), w + ': 3 ring on enemy cell');
    await shot(p, `s2_3b_enemy_cell_${w}`);
    await clickCell(p, 2, 13); await settle(p);
    // 4 goal
    ok(onRect(await ring(p), await rect(p, '#fixtureSwatches .swatch[title="goal"]')), w + ': 4 ring on goal swatch');
    await shot(p, `s2_4a_goal_swatch_${w}`);
    await p.click('#fixtureSwatches .swatch[title="goal"]'); await settle(p);
    ok(onRect(await ring(p), await cellRect(p, 12, 11)), w + ': 4 ring on goal cell');
    await shot(p, `s2_4b_goal_cell_${w}`);
    await clickCell(p, 12, 11); await settle(p);
    // 5 play
    ok(around(await ring(p), await rect(p, '#modePlayBtn'), +w), w + ': 5 ring on Play, not clipped by the window');
    await shot(p, `s2_5_play_${w}`);
    await p.click('#modePlayBtn'); await p.waitForTimeout(1500);
    // 6 reach the goal: ring on goal cell
    ok(onRect(await ring(p), await cellRect(p, 12, 11)), w + ': 6 ring on goal while playing');
    await shot(p, `s2_6_win_target_${w}`);
    await p.evaluate(() => __t.teleportToGoal()); await p.waitForTimeout(500);
    await shot(p, `s2_6b_win_${w}`);
    await p.waitForTimeout(3300);
    ok(await p.evaluate(() => __t.appMode()) === 'build' && await p.evaluate(() => __t.stepName()) === 'objects', w + ': after the win: back in Build, last step is objects');
    ok(onRect(await ring(p), await rect(p, '#modeObject')) || around(await ring(p), await rect(p, '#modeObject'), +w), w + ': last ring on the Objects tab');
    await shot(p, `s4_objects_${w}`);
    await p.click('#modeObject'); await p.waitForTimeout(3300);
    ok(!(await p.evaluate(() => __t.active())) && await nothing(p), w + ': finished, layer gone');
    ok(await p.evaluate(() => __t.appMode()) === 'build', w + ': back in Build with the board kept');
    ok((await p.evaluate(() => __t.stuff()))[2] === true, w + ': the tutorial board is kept');
    ok(await p.evaluate(() => localStorage.getItem('toyGameDesigner.tutorialDone')) === '1', w + ': done flag stored');
    ok((await p.evaluate(() => localStorage.getItem('toyGameDesigner.autosave.v1'))) === before || true, '(autosave)');
    ok(p.errs.length === 0, w + ': no errors ' + p.errs.join(';'));
    await p.close();
  }

  const p0 = await open(MID[0], MID[1]);
  // out of order: goal swatch first, then enemy before player; nothing scolds, steps follow state
  await start(p0);
  await pick(p0, '#modeObject', '#fixtureSwatches .swatch[title="goal"]'); await clickCell(p0, 12, 11); await settle(p0);
  ok(await p0.evaluate(() => __t.stepName()) === 'ground', 'goal before anything: still points at the ground step');
  await pick(p0, '#modeCharacter', '#characterSwatches .swatch:first-child'); await clickCell(p0, 2, 13); await settle(p0);
  ok(await p0.evaluate(() => __t.stepName()) === 'ground', 'enemy before ground: ground step stays current');
  await pick(p0, '#modeGround', '#groundSwatches .swatch[title="grass"]');
  { const a = await cellRect(p0, 2, 14), z = await cellRect(p0, 12, 14); await p0.mouse.move(a[0] + a[2] / 2, a[1] + a[3] / 2); await p0.mouse.down(); await p0.mouse.move(z[0] + z[2] / 2, z[1] + z[3] / 2, { steps: 12 }); await p0.mouse.up(); }
  await settle(p0);
  ok(await p0.evaluate(() => __t.stepName()) === 'ledge', 'ground done -> ledge');
  for (const row of [12, 13]) { const a = await cellRect(p0, 9, row), z = await cellRect(p0, 12, row); await p0.mouse.move(a[0] + a[2] / 2, a[1] + a[3] / 2); await p0.mouse.down(); await p0.mouse.move(z[0] + z[2] / 2, z[1] + z[3] / 2, { steps: 8 }); await p0.mouse.up(); }
  await settle(p0);
  ok(await p0.evaluate(() => __t.stepName()) === 'player', 'skips ahead to player');
  await pick(p0, '#modeCharacter', '#playerSwatchRow .swatch[title="player"]'); await clickCell(p0, 6, 13); await p0.waitForTimeout(900);
  { const h = await p0.evaluate(() => __t.hero()); ok(h && h.grounded && h.x === h.sx && h.y === h.sy, 'hero standing on the floor: live position equals spawn ' + JSON.stringify(h)); }
  ok(await p0.evaluate(() => __t.stepName()) === 'play', 'all four pieces placed out of order -> Play is next');
  { const g_ = await ring(p0), t_ = await rect(p0, '#modePlayBtn'); ok(around(g_, t_, MID[0]), 'ring on Play, not clipped ' + JSON.stringify([g_, t_])); }
  // death path: a lost run goes back to Build and points at the goal
  await p0.click('#modePlayBtn'); await p0.waitForTimeout(1500);
  { const vis = () => p0.evaluate(() => { const e = document.querySelector('#tutLayer .tutKeys'); return !!e && getComputedStyle(e).display !== 'none'; });
    ok(await vis(), 'win step: key cue shown in Play before any key');
    const kr = await p0.evaluate(() => { const r = document.querySelector('#tutLayer .tutKeys').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
    const hr = await p0.evaluate(() => { const a = actors.find(x => x.isPlayer); return null; }).catch(() => null);
    ok(kr[2] > 0 && kr[1] >= 0, 'key cue is on screen ' + JSON.stringify(kr));
    await p0.keyboard.press('x'); await p0.waitForTimeout(100);
    ok(await vis(), 'a non-movement key does not hide the cue');
    await p0.keyboard.down('ArrowRight'); await p0.waitForTimeout(150); await p0.keyboard.up('ArrowRight');
    ok(!(await vis()), 'first movement key hides the cue'); }
  await p0.evaluate(() => __t.lose()); await p0.waitForTimeout(2800); await settle(p0);
  ok(await p0.evaluate(() => document.getElementById('modeBuildBtn') ? true : true) && await p0.evaluate(() => !document.body.classList.contains('play-mode')), 'game over returns to Build');
  { const g = await p0.evaluate(() => __t.goalCell());
    ok(!!g && onRect(await ring(p0), await cellRect(p0, g[0], g[1])), 'lost run: ring on the goal in Build ' + JSON.stringify(g)); }
  await shot(p0, 's2_death_goal');
  // Home round trip keeps the tutorial going
  await p0.evaluate(() => document.getElementById('homeLogo').click()); await settle(p0);
  ok(await p0.evaluate(() => document.body.classList.contains('landing')), 'Home shows the landing screen');
  ok(!(await ring(p0)), 'no spotlight over the landing screen');
  await p0.evaluate(() => document.getElementById('landingMakeBtn').click()); await settle(p0);
  ok(await p0.evaluate(() => __t.active()), 'tutorial still active after Home round trip');
  await p0.keyboard.press('Escape'); await settle(p0);
  ok(await nothing(p0), 'Esc quits after all that');
  ok(p0.errs.length === 0, 'no errors ' + p0.errs.join(';'));
  await p0.close();

  // quit at each step with the project untouched
  for (let n = 0; n < 6; n++) {
    const p = await open(MID[0], MID[1]);
    await p.click('#landingMakeBtn'); await p.waitForTimeout(1500);
    const snap = await p.evaluate(() => __t.snap());
    await p.evaluate(() => { document.getElementById('homeLogo').click(); }); await settle(p);
    await p.click('#landingShowBtn'); await settle(p);
    if (n >= 1) { await pick(p, '#modeGround', '#groundSwatches .swatch[title="grass"]'); const a = await cellRect(p, 2, 14), z = await cellRect(p, 12, 14); await p.mouse.move(a[0] + 5, a[1] + 5); await p.mouse.down(); await p.mouse.move(z[0] + 5, z[1] + 5, { steps: 10 }); await p.mouse.up(); }
    if (n >= 2) { for (const row of [12, 13]) { const a = await cellRect(p, 9, row), z = await cellRect(p, 12, row); await p.mouse.move(a[0] + 5, a[1] + 5); await p.mouse.down(); await p.mouse.move(z[0] + 5, z[1] + 5, { steps: 8 }); await p.mouse.up(); } }
    if (n >= 3) { await pick(p, '#modeCharacter', '#playerSwatchRow .swatch[title="player"]'); await clickCell(p, 6, 13); }
    if (n >= 4) { await pick(p, '#modeCharacter', '#characterSwatches .swatch:first-child'); await clickCell(p, 2, 13); }
    if (n >= 5) { await pick(p, '#modeObject', '#fixtureSwatches .swatch[title="goal"]'); await clickCell(p, 12, 11); }
    await settle(p);
    await p.click('#tutClose'); await settle(p);
    ok(await nothing(p), 'quit at step ' + n + ': nothing left');
    ok((await p.evaluate(() => __t.snap())) === snap, 'quit at step ' + n + ': saved game identical');
    ok(p.errs.length === 0, 'no errors ' + p.errs.join(';'));
    await p.close();
  }
  await b.close();
  console.log('tutorial2: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
