// "Show me how" rework: the layout picture, never cut off, a hold beat between steps, a gliding spotlight, readable notes and
// controls card, and the "Well done!" ending. Real timings (no speed-up). node tests/tutorial3.test.js [shotDir]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const HTML = path.resolve(__dirname, '..', 'index.html');
const shotDir = process.argv[2];
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
let src = fs.readFileSync(HTML, 'utf8');
const anchor = '  if (loadAutosave()) log(';
src = src.replace(anchor, `  window.__t = { border: () => canvasBorderPx, appMode: () => appMode, stepName: () => { const s = tutorial && tutCurrentStep(); return s ? s.name : null; },
    active: () => !!tutorial, teleportToGoal: () => { const g = tutGoalCell(); const p = actors.find(a => a.isPlayer); p.x = g.x * TILE + 4; p.y = g.y * TILE + 4; p.vx = p.vy = 0; },
    layout: () => tutLayout(), wandererLethal: () => actorDefs[findDefaultActorDef('wanderer')].lethal };
` + anchor);
fs.writeFileSync('/tmp/tut3_hooked.html', src);
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', ignoreDefaultArgs: ['--hide-scrollbars'] });
  const open = async (w, h, extra) => { const c = await b.newContext(Object.assign({ viewport: { width: w, height: h } }, extra || {})); const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('dialog', d => d.accept());
    await p.goto('file:///tmp/tut3_hooked.html'); await p.waitForTimeout(500); return p; };
  const ring = p => p.evaluate(() => { const r = document.querySelector('#tutLayer .tutRing'); if (!r || document.getElementById('tutLayer').classList.contains('off')) return null; const q = r.getBoundingClientRect(); return [q.left, q.top, q.width, q.height]; });
  const layerOff = p => p.evaluate(() => { const l = document.getElementById('tutLayer'); return !l || l.classList.contains('off'); });
  const note = p => p.evaluate(() => { const n = document.getElementById('tutNote'); if (!n) return null; const r = n.getBoundingClientRect(); return { on: n.classList.contains('on'), text: n.textContent, r: [r.left, r.top, r.right, r.bottom], fs: parseFloat(getComputedStyle(n).fontSize), op: parseFloat(getComputedStyle(n).opacity) }; });
  const cellRect = (p, x, y, w = 1, h = 1) => p.evaluate(([x, y, w, h]) => { const r = document.getElementById('gameCanvas').getBoundingClientRect(), bw = __t.border(), k = (r.width - 2 * bw) / 768; return [r.left + bw + x * 32 * k, r.top + bw + y * 32 * k, w * 32 * k, h * 32 * k]; }, [x, y, w, h]);
  const paint = async (p, x0, x1, y) => { const a = await cellRect(p, x0, y), z = await cellRect(p, x1, y); await p.mouse.move(a[0] + a[2] / 2, a[1] + a[3] / 2); await p.mouse.down(); await p.mouse.move(z[0] + z[2] / 2, z[1] + z[3] / 2, { steps: 12 }); await p.mouse.up(); };
  const clickCell = async (p, x, y) => { const r = await cellRect(p, x, y); await p.mouse.click(r[0] + r[2] / 2, r[1] + r[3] / 2); };
  const shot = (p, n) => shotDir && (fs.mkdirSync(shotDir, { recursive: true }), p.screenshot({ path: path.join(shotDir, n + '.png') }));
  const near = (g, t, tol = 2) => g && t && g.every((v, i) => Math.abs(v - t[i]) <= tol);
  const disjoint = (a, r) => a[2] <= r[0] || a[0] >= r[0] + r[2] || a[3] <= r[1] || a[1] >= r[1] + r[3];

  for (const [w, h] of [[1280, 590], [1366, 635], [1920, 1080]]) {
    const p = await open(w, h);
    await p.click('#landingShowBtn'); await p.waitForTimeout(900);
    const L = await p.evaluate(() => __t.layout());
    ok(JSON.stringify(L) === JSON.stringify({ player: { x: 6, y: 13 }, floor: { x: 2, y: 14, w: 11, h: 1 }, ledge: { x: 9, y: 12, w: 4, h: 2 }, enemy: { x: 2, y: 13 }, goal: { x: 12, y: 11 } }), w + ': layout is the attached picture ' + JSON.stringify(L));
    ok(await p.evaluate(() => __t.wandererLethal()) === false, w + ': the tutorial wanderer is harmless');
    let n = await note(p);
    ok(n && n.on && /grass/i.test(n.text) && n.fs >= 15, w + ': ground note is on and readable ' + JSON.stringify(n && [n.text, n.fs]));
    ok(n && n.r[0] >= 0 && n.r[1] >= 0 && n.r[2] <= w && n.r[3] <= h, w + ': note inside the window');
    await p.click('#groundSwatches .swatch[title="grass"]'); await p.waitForTimeout(900);
    ok(near(await ring(p), (await cellRect(p, 2, 14, 11, 1)).map((v, i) => i < 2 ? v - 6 : v + 12), 3), w + ': ring on the whole floor');
    n = await note(p); ok(n && /drag/i.test(n.text), w + ': floor note says what to do');
    { const rg = await ring(p); ok(disjoint(n.r.slice(0, 2).concat([n.r[2] - n.r[0], n.r[3] - n.r[1]]), rg), w + ': note does not sit on the ring'); }
    await shot(p, `s3_floor_${w}`);
    // 9 of 10 squares: the step must NOT advance, however long we wait
    await paint(p, 2, 11, 14); await p.waitForTimeout(3000);
    ok(await p.evaluate(() => __t.stepName()) === 'ground', w + ': ten of eleven squares: still the ground step after 3 s');
    ok(!(await layerOff(p)), w + ': spotlight still on while unfinished');
    // the last square
    await clickCell(p, 12, 14); await p.waitForTimeout(300);
    ok(await layerOff(p), w + ': last square drawn: spotlight fades out for the beat');
    n = await note(p); ok(n && /nice/i.test(n.text), w + ': a "Nice!" beat ' + JSON.stringify(n && n.text));
    await shot(p, `s3_nice_${w}`);
    // glide: sample the ring until it settles on the ledge
    const track = []; const t0 = Date.now();
    while (Date.now() - t0 < 2200) { const g = await ring(p); track.push([Date.now() - t0, g]); await p.waitForTimeout(40); }
    const live = track.filter(x => x[1]);
    ok(live.length > 5, w + ': ring comes back after the beat (' + live.length + ' samples)');
    const firstShown = live[0][0]; ok(firstShown >= 400, w + ': the beat lasts a moment before the next step (' + firstShown + ' ms)');
    const steps = live.slice(1).map((x, i) => Math.hypot(x[1][0] - live[i][1][0], x[1][1] - live[i][1][1]));
    const total = Math.hypot(live[live.length - 1][1][0] - live[0][1][0], live[live.length - 1][1][1] - live[0][1][1]);
    ok(total > 30 && Math.max(...steps) < total * 0.7, w + ': ring glides (largest hop ' + Math.round(Math.max(...steps)) + ' of ' + Math.round(total) + ' px)');
    ok(await p.evaluate(() => __t.stepName()) === 'ledge', w + ': now the ledge step');
    // ledge: swatch is picked already; paint 3 of 4 columns x 2 rows, then the rest
    await paint(p, 9, 11, 12); await paint(p, 9, 11, 13); await p.waitForTimeout(2500);
    ok(await p.evaluate(() => __t.stepName()) === 'ledge', w + ': a part-built step stays the ledge step');
    await clickCell(p, 12, 12); await clickCell(p, 12, 13); await p.waitForTimeout(1800);
    ok(await p.evaluate(() => __t.stepName()) === 'player', w + ': whole step drawn -> player');
    await p.click('#playerSwatchRow .swatch[title="player"]'); await p.waitForTimeout(700); await clickCell(p, 6, 13); await p.waitForTimeout(1800);
    await p.click('#characterSwatches .swatch[title="Enemy"]'); await p.waitForTimeout(700);
    ok(near(await ring(p), (await cellRect(p, 2, 13)).map((v, i) => i < 2 ? v - 6 : v + 12), 3), w + ': enemy ring at the far left of the floor');
    await clickCell(p, 2, 13); await p.waitForTimeout(1800);
    await p.click('#fixtureSwatches .swatch[title="goal"]'); await p.waitForTimeout(900);
    ok(near(await ring(p), (await cellRect(p, 12, 11)).map((v, i) => i < 2 ? v - 6 : v + 12), 3), w + ': goal ring on top of the step');
    await clickCell(p, 12, 11); await p.waitForTimeout(1800);
    n = await note(p); ok(n && /play/i.test(n.text), w + ': play note');
    await p.click('#modePlayBtn'); await p.waitForTimeout(1700);
    // controls card
    const kc = await p.evaluate(() => { const e = document.querySelector('#tutLayer .tutKeys'); if (!e || getComputedStyle(e).display === 'none') return null; const r = e.getBoundingClientRect(); return { text: e.textContent, r: [r.left, r.top, r.right, r.bottom], fs: parseFloat(getComputedStyle(e).fontSize), bg: getComputedStyle(e).backgroundColor, fg: getComputedStyle(e).color }; });
    ok(kc && /walk/i.test(kc.text) && /jump/i.test(kc.text) && /space/i.test(kc.text), w + ': controls card has words ' + JSON.stringify(kc && kc.text));
    ok(kc && kc.fs >= 16 && kc.r[0] >= 0 && kc.r[2] <= w && kc.r[1] >= 0, w + ': controls card legible and on screen');
    n = await note(p); ok(n && /flag/i.test(n.text), w + ': goal note in Play');
    ok(n && kc && (n.r[2] <= kc.r[0] || n.r[0] >= kc.r[2] || n.r[3] <= kc.r[1] || n.r[1] >= kc.r[3]), w + ': note and controls card do not overlap');
    await shot(p, `s3_controls_${w}`);
    await p.evaluate(() => __t.teleportToGoal());
    await p.waitForTimeout(1500);
    ok(await p.evaluate(() => __t.appMode()) === 'play', w + ': after the win it stays on the win screen for a while');
    await p.waitForTimeout(2600);
    ok(await p.evaluate(() => __t.appMode()) === 'build' && await p.evaluate(() => __t.stepName()) === 'objects', w + ': then back to Build, last step');
    await p.waitForTimeout(900);
    n = await note(p);
    ok(n && /well done/i.test(n.text) && /make it your own/i.test(n.text) && /objects/i.test(n.text), w + ': ending says it out loud ' + JSON.stringify(n && n.text));
    const tab = await p.evaluate(() => { const r = document.getElementById('modeObject').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
    const rg = await ring(p);
    ok(rg && rg[0] <= tab[0] + 1 && rg[1] <= tab[1] + 1 && rg[0] + rg[2] >= tab[0] + tab[2] - 1, w + ': ring on the Objects tab');
    await shot(p, `s3_welldone_${w}`);
    await p.click('#modeObject'); await p.waitForTimeout(1500);
    ok(!(await p.evaluate(() => __t.active())), w + ': clicking Objects ends it');
    ok(p.errs.length === 0, w + ': no errors ' + p.errs.join(';'));
    await p.close();
  }

  // Skip on the ground step moves on (the safety valve)
  { const p = await open(1366, 635); await p.click('#landingShowBtn'); await p.waitForTimeout(800);
    await p.click('#tutNote .skip'); await p.waitForTimeout(1500);
    ok(await p.evaluate(() => __t.stepName()) === 'ledge', 'Skip moves past the ground step');
    ok(p.errs.length === 0, 'skip: no errors'); await p.close(); }
  // reduced motion: the ring snaps, no fade
  { const p = await open(1366, 635, { reducedMotion: 'reduce' }); await p.click('#landingShowBtn'); await p.waitForTimeout(600);
    await p.click('#groundSwatches .swatch[title="grass"]'); await p.waitForTimeout(150);
    ok(near(await ring(p), (await cellRect(p, 2, 14, 11, 1)).map((v, i) => i < 2 ? v - 6 : v + 12), 3), 'reduced motion: ring is on the target within 150 ms');
    ok(p.errs.length === 0, 'reduced: no errors'); await p.close(); }
  await b.close();
  console.log(`tutorial3: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
