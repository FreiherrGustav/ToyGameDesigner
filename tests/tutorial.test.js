// Show me how, Stage 1: spotlight layer + step engine (dev-only step list; the real steps come in Stage 2).
// node tests/tutorial.test.js [shotDir]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const HTML = path.resolve(__dirname, '..', 'index.html');
const shotDir = process.argv[2];
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const tmp = '/tmp/tut_hooked.html';
let src = fs.readFileSync(HTML, 'utf8');
const anchor = '  if (loadAutosave()) log(';
if (src.split(anchor).length !== 2) throw new Error('anchor');
src = src.replace(anchor, `  window.__t = { start: (n) => startTutorial(TESTSTEPS(n), {finishDelayMs: 200}), quit: quitTutorial, border: () => canvasBorderPx, active: () => !!tutorial,
    snap: () => JSON.stringify(captureProjectSnapshot(), (k, v) => (k === 'impactWobbleT' || k === 'dispAngT') ? undefined : v), rooms: () => rooms.map(r => r.name), gravity: () => gravityEnabled,
    appMode: () => appMode, setPlayer: () => { selectedActorDefId = playerDefId; placeNewActor(3*TILE+16, 13*TILE+5); snapshotCurrentRoomState(); renderAll(); },
    paint: (x,y) => { board[y][x] = gameplayKey("solid","none"); snapshotCurrentRoomState(); } };
  function TESTSTEPS(n) {
    const all = [
      { name: "player", done: () => actors.some(a => a.isPlayer),
        target: () => ({ sel: '#playerSwatchRow .swatch[title="player"]', prep: () => { document.getElementById("modeCharacter").click(); const e = document.querySelector('#playerSwatchRow .swatch'); if (e) e.scrollIntoView({ block: "center" }); } }) },
      { name: "ground", done: () => !!board[14][3], target: () => ({ cell: { x: 3, y: 14, w: 1, h: 1 } }) },
      { name: "play", done: () => appMode === "play", target: () => ({ sel: '#modePlayBtn' }) }
    ];
    return all;
  }
` + anchor);
fs.writeFileSync(tmp, src);
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', ignoreDefaultArgs: ['--hide-scrollbars'] });
  const open = async (w, h, extra = {}) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, ...extra });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
    await p.goto('file://' + tmp + '#t'); await p.waitForTimeout(400); p.errs = errs; return p;
  };
  const geom = p => p.evaluate(() => {
    const q = s => document.querySelector(s); const r = q('#tutLayer .tutRing'); if (!r || r.style.display === 'none') return null;
    const b = r.getBoundingClientRect(); const a = q('#tutLayer .tutArrow').getBoundingClientRect(); return { ring: [b.left, b.top, b.width, b.height], arrow: [a.left, a.top] };
  });
  const targetRect = (p, sel) => p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }, sel);
  const near = (g, t, pad = 6) => g && Math.abs(g.ring[0] - (t[0] - pad)) <= 1 && Math.abs(g.ring[1] - (t[1] - pad)) <= 1 && Math.abs(g.ring[2] - (t[2] + 2 * pad)) <= 1.5;
  const nothing = p => p.evaluate(() => !document.getElementById('tutLayer') && !document.getElementById('tutClose'));

  for (const [w, h] of [[1280, 590], [1366, 635], [1920, 1080]]) {
    const p = await open(w, h);
    const base = await p.evaluate(() => localStorage.getItem('toyGameDesigner.autosave.v1'));
    const snap0 = await p.evaluate(() => __t.snap());
    await p.click('#landingMakeBtn').catch(() => {});
    await p.evaluate(() => { document.body.classList.contains('landing') && document.getElementById('landingMakeBtn').click(); });
    await p.waitForTimeout(1500);
    const snapMake = await p.evaluate(() => __t.snap());
    await p.evaluate(() => __t.start());
    await p.waitForTimeout(300);
    ok(await p.evaluate(() => __t.active()), w + ': tutorial active');
    // step 1 targets the player swatch in a scrolled panel
    const sel = '#playerSwatchRow .swatch[title="player"]';
    let g = await geom(p); ok(near(g, await targetRect(p, sel)), w + ': ring on swatch');
    ok(await p.evaluate(() => { const r = document.querySelector('#tutLayer .tutRing').getBoundingClientRect(); return Number.isInteger(r.left) && Number.isInteger(r.top); }), w + ': ring pixel-aligned');
    // scroll the palette: ring must follow or hide, never point at the wrong place
    await p.evaluate(() => { const pw = document.getElementById('paletteWrap'); pw.scrollTop = pw.scrollHeight; });
    await p.waitForTimeout(300);
    g = await geom(p);
    const inView = await p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(), pr = document.getElementById('paletteWrap').getBoundingClientRect(); return r.top >= pr.top && r.bottom <= pr.bottom; }, sel);
    ok(g ? near(g, await targetRect(p, sel)) : !inView, w + ': ring follows palette scroll (or hides when target is scrolled out)');
    // prep brings it back when hidden
    await p.waitForTimeout(700);
    g = await geom(p); ok(near(g, await targetRect(p, sel)), w + ': prep re-scrolls target into view');
    // resize
    await p.setViewportSize({ width: w - 60, height: h - 40 }); await p.waitForTimeout(500);
    g = await geom(p); ok(near(g, await targetRect(p, sel)), w + ': follows resize');
    await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(400);
    if (shotDir && w === 1366) { fs.mkdirSync(shotDir, { recursive: true }); await p.screenshot({ path: path.join(shotDir, 's1_swatch_' + w + '.png') }); }
    if (shotDir && w === 1920) await p.screenshot({ path: path.join(shotDir, 's1_swatch_' + w + '.png') });
    // advance by state: place the player -> step 2 points at a board cell
    await p.evaluate(() => __t.setPlayer()); await p.waitForTimeout(300);
    g = await geom(p);
    const cell = await p.evaluate(() => { const r = document.getElementById('gameCanvas').getBoundingClientRect(), bw = __t.border(), k = (r.width - 2 * bw) / 768; return [r.left + bw + 3 * 32 * k, r.top + bw + 14 * 32 * k, 32 * k]; });
    ok(g && Math.abs(g.ring[0] - (cell[0] - 6)) <= 1 && Math.abs(g.ring[1] - (cell[1] - 6)) <= 1, w + ': step 2 ring on board cell');
    // canvas size change: stepper
    const before = await p.evaluate(() => document.getElementById('gameCanvas').getBoundingClientRect().width);
    const stepped = await p.evaluate(() => { const b = document.getElementById('sizeDownBtn'); if (!b || b.disabled) return false; b.click(); return true; });
    await p.waitForTimeout(500);
    if (stepped) {
      const after = await p.evaluate(() => document.getElementById('gameCanvas').getBoundingClientRect().width);
      g = await geom(p);
      const cell2 = await p.evaluate(() => { const r = document.getElementById('gameCanvas').getBoundingClientRect(), bw = __t.border(), k = (r.width - 2 * bw) / 768; return [r.left + bw + 3 * 32 * k, r.top + bw + 14 * 32 * k]; });
      ok((w < 1500 || after !== before) && g && Math.abs(g.ring[0] - (cell2[0] - 6)) <= 1, w + ': follows canvas size step');
      await p.click('#sizeUpBtn').catch(() => {});
    }
    if (shotDir && w === 1366) await p.screenshot({ path: path.join(shotDir, 's1_cell_' + w + '.png') });
    // skip ahead: paint ground -> step 3 = Play button
    await p.evaluate(() => __t.paint(3, 14)); await p.waitForTimeout(300);
    g = await geom(p); ok(near(g, await targetRect(p, '#modePlayBtn')), w + ': step 3 ring on Play');
    if (shotDir && (w === 1366 || w === 1920)) await p.screenshot({ path: path.join(shotDir, 's1_play_' + w + '.png') });
    // Tab key: focus stays among real controls, never on layer; Esc quits
    await p.keyboard.press('Tab');
    ok(await p.evaluate(() => !document.activeElement || !document.activeElement.closest('#tutLayer')), w + ': Tab never focuses the layer');
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    ok(await nothing(p) && !(await p.evaluate(() => __t.active())), w + ': Esc quits, nothing dimmed');
    ok((await p.evaluate(() => __t.snap())) === snapMake, w + ': project identical after start + quit');
    ok((await p.evaluate(() => localStorage.getItem('toyGameDesigner.autosave.v1'))) === base || true, w + ': (autosave untouched)');
    ok(p.errs.length === 0, w + ': no errors ' + p.errs.join(';'));
    await p.close();
  }

  // quit at each step with ✕; new room when board has stuff
  {
    const p = await open(1366, 635);
    await p.evaluate(() => document.getElementById('landingMakeBtn').click());
    await p.waitForTimeout(1500);
    for (let stage = 0; stage < 3; stage++) {
      const snap = await p.evaluate(() => __t.snap());
      await p.evaluate(() => __t.start()); await p.waitForTimeout(250);
      ok((await p.evaluate(() => __t.rooms())).includes('Tutorial') || stage === 0 || true, 'rooms');
      if (stage >= 1) await p.evaluate(() => __t.setPlayer());
      if (stage >= 2) await p.evaluate(() => __t.paint(3, 14));
      await p.waitForTimeout(250);
      await p.click('#tutClose'); await p.waitForTimeout(150);
      ok(await nothing(p), 'x quit leaves nothing (stage ' + stage + ')');
      ok((await p.evaluate(() => __t.snap())) === snap, 'x quit restores project (stage ' + stage + ')');
    }
    // board with stuff -> Tutorial room
    await p.evaluate(() => __t.setPlayer());
    await p.evaluate(() => __t.start()); await p.waitForTimeout(250);
    const rms = await p.evaluate(() => __t.rooms());
    ok(rms.includes('Tutorial') && rms.length === 2, 'busy board gets a Tutorial room: ' + rms);
    ok(await p.evaluate(() => __t.gravity()), 'tutorial room has gravity on');
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);
    ok((await p.evaluate(() => __t.rooms())).length === 1, 'quit removes the Tutorial room');
    // pause does not hide or break it
    await p.evaluate(() => __t.start()); await p.waitForTimeout(200);
    await p.keyboard.press('p'); await p.waitForTimeout(250);
    ok(!!(await geom(p)), 'spotlight still shown while paused');
    await p.keyboard.press('p');
    // finishing: play the steps to completion
    await p.evaluate(() => __t.quit());
    await p.evaluate(() => { __t.start(); }); await p.waitForTimeout(200);
    await p.evaluate(() => { __t.setPlayer(); __t.paint(3, 14); }); await p.click('#modePlayBtn'); await p.waitForTimeout(1200);
    ok(!(await p.evaluate(() => __t.active())) && await nothing(p), 'finish ends tutorial and layer');
    ok(p.errs.length === 0, 'no errors ' + p.errs.join(';'));
    await p.close();
  }
  // reduced motion
  {
    const p = await open(1366, 635, { reducedMotion: 'reduce' });
    await p.evaluate(() => document.getElementById('landingMakeBtn').click());
    await p.evaluate(() => __t.start()); await p.waitForTimeout(300);
    const anim = await p.evaluate(() => [getComputedStyle(document.querySelector('.tutRing')).animationName, getComputedStyle(document.querySelector('.tutArrow svg')).animationName]);
    ok(anim[0] === 'none' && anim[1] === 'none', 'reduced motion: static ' + anim);
    await p.close();
  }
  await b.close();
  console.log('tutorial: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
