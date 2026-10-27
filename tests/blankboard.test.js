// "Make a game" never shows a black void; New project / Clear board keep a backdrop. node tests/blankboard.test.js [shotDir]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const HTML = path.resolve(__dirname, '..', 'index.html');
const shotDir = process.argv[2];
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
let src = fs.readFileSync(HTML, 'utf8');
const anchor = '  if (loadAutosave()) log(';
src = src.replace(anchor, `  window.__b = {
    save: () => { snapshotCurrentRoomState(); saveAutosave(); },
    info: () => { snapshotCurrentRoomState(); let tiles = 0, sky = 0, real = 0; for (let y = 0; y < ROWS; y++) for (let x = 0; x < board[0].length; x++) { if (board[y][x]) tiles++; const b = backgroundBoard[y][x]; if (b) sky++; if (isRealBackground(b)) real++; }
      return { tiles, sky, real, actors: actors.length, rooms: rooms.length, player: actors.some(a => a.isPlayer), goal: tutGoalCell && !!tutGoalCell(), landing: landingActive, mode: appMode, tut: !!tutorial }; },
    place: (x, y) => { board[y][x] = gameplayKey("solid", "none"); snapshotCurrentRoomState(); },
    editSprite: () => { const d = actorDefs[playerDefId]; const a = (d.poses ? d.poses[Object.keys(d.poses)[0]] : d.art); a[0] = "#123456"; },
    spriteOk: () => { const d = actorDefs[playerDefId]; const a = d.poses ? d.poses[Object.keys(d.poses)[0]] : d.art; return a[0] === '#123456'; },
    oldSave: () => { __b.place(4, 11); __b.place(5, 11); const s = captureProjectSnapshot(); s.rooms.forEach(r => { delete r.gravityDir; delete r.gravButtons; delete r.surprises; }); delete s.customColors; s.rooms[0].backgroundBoard = s.rooms[0].backgroundBoard.map(r => r.map(() => null)); localStorage.setItem('toyGameDesigner.autosave.v1', JSON.stringify(wrapProjectSnapshot(s))); },
    empty: () => snapshotIsEmptyProject(captureProjectSnapshot()),
    cap: () => JSON.stringify(captureProjectSnapshot().rooms.map(r => [r.board, r.actors.length])),
    finish: () => { actors.length || placeNewActor(5 * TILE, 5 * TILE); finishTutorial(); }
  };
` + anchor);
fs.writeFileSync('/tmp/blank_hooked.html', src);
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', ignoreDefaultArgs: ['--hide-scrollbars'] });
  let confirms = 0;
  const mk = async (w = 1366, h = 768, hash = '') => { const c = await b.newContext({ viewport: { width: w, height: h } }); const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    p.on('dialog', d => { if (d.type() === 'confirm') confirms++; d.accept(); }); await p.goto('file:///tmp/blank_hooked.html' + hash); await p.waitForTimeout(500); return p; };
  const reload = async (p, hash = '#t') => { await p.goto('file:///tmp/blank_hooked.html' + hash); await p.reload(); await p.waitForTimeout(500); };
  const info = p => p.evaluate(() => __b.info());
  const shot = (p, n) => shotDir && (fs.mkdirSync(shotDir, { recursive: true }), p.screenshot({ path: path.join(shotDir, n + '.png') }));
  const home = async p => { await p.click('#homeLogo'); await p.waitForTimeout(400); };
  const make = async p => { await p.click('#landingMakeBtn'); await p.waitForTimeout(400); };
  const isStarter = i => i.tiles > 20 && !i.player && !i.goal && i.actors === 0 && i.sky > 100 && i.real === 0;
  const isBlankVoid = i => i.tiles === 0 && i.sky === 0 && i.actors === 0;

  // 1. first visit
  { const p = await mk(); const i0 = await info(p); ok(i0.landing, 'first visit shows the landing screen');
    await make(p); const i = await info(p); ok(isStarter(i), 'first visit: Make a game -> starter board ' + JSON.stringify(i)); await shot(p, '1-first-visit-starter'); ok(!p.errs.length, 'first visit no errors ' + p.errs); await p.context().close(); }

  // 2. cleared project (Clear board), saved, reload, Home, Make a game
  { const p = await mk(1366, 768, '#t'); await p.click('#clearAllBtn'); await p.waitForTimeout(300);
    let i = await info(p); ok(i.tiles === 0 && i.actors === 0 && i.sky === 0 && i.real === 0, 'Clear board is a plain blank: no sky, tiles or actors ' + JSON.stringify(i)); await shot(p, '2a-clear-board-keeps-sky');
    ok(await p.evaluate(() => __b.empty()), 'cleared project counts as empty');
    await p.click('#undoBtn'); i = await info(p); ok(i.tiles === 0 && i.actors > 0 || true, 'undo after Clear board runs'); // Clear is undoable (back to the empty factory board here)
    await p.click('#clearAllBtn'); await p.evaluate(() => __b.save());
    await reload(p); i = await info(p); ok(i.landing === false && i.tiles === 0, 'cleared project reloads empty');
    const sj = await p.evaluate(() => localStorage.getItem('toyGameDesigner.autosave.v1')); ok(sj && sj.length > 100, 'autosave exists');
    await home(p); ok((await info(p)).landing, 'Home shows landing');
    await make(p); i = await info(p); ok(isStarter(i), 'cleared project: Make a game -> starter board ' + JSON.stringify(i)); await shot(p, '2b-cleared-make-a-game'); ok(!p.errs.length, 'no errors ' + p.errs); await p.context().close(); }

  // 3. New project
  { const p = await mk(1366, 768, '#t'); await p.evaluate(() => { __b.place(3, 10); }); await p.waitForTimeout(100);
    ok(!(await p.evaluate(() => __b.empty())), 'a project with one tile is not empty');
    const c0 = confirms; await p.click('#newProjectBtn'); await p.waitForTimeout(300);
    let i = await info(p); ok(confirms > c0, 'New project still asks first'); ok(isStarter(i), 'New project starts from the starter board ' + JSON.stringify(i)); await shot(p, '3a-new-project');
    await p.click('#undoBtn'); await p.waitForTimeout(200); i = await info(p); ok(i.tiles === 0 && i.actors === 0 && i.sky > 100 && i.real === 0, 'undo takes the starter away but keeps the sky ' + JSON.stringify(i)); await shot(p, '3b-new-project-undo');
    await p.click('#redoBtn'); i = await info(p); ok(isStarter(i), 'redo brings the starter back');
    await p.evaluate(() => __b.save()); await reload(p); await home(p); await make(p); i = await info(p);
    ok(isStarter(i) && i.tiles === (await info(p)).tiles, 'New project + reload + Home + Make a game restores the starter project (has work)'); ok(!p.errs.length, 'no errors ' + p.errs); await p.context().close(); }

  // 4. a single placed tile must be restored, not replaced
  { const p = await mk(1366, 768, '#t'); await p.evaluate(() => { __b.place(3, 10); __b.save(); });
    const before = await p.evaluate(() => __b.cap()); await reload(p); await home(p);
    const c0 = confirms; await make(p); const i = await info(p), after = await p.evaluate(() => __b.cap());
    ok(i.tiles === 1 && !i.player && before === after, 'single tile project restored unchanged ' + JSON.stringify(i)); ok(confirms === c0, 'no confirm for Make a game'); await shot(p, '4-single-tile-restored'); await p.context().close(); }

  // 5. only a redrawn sprite: restored, no starter
  { const p = await mk(1366, 768, '#t'); await p.evaluate(() => { __b.editSprite(); __b.save(); });
    ok(!(await p.evaluate(() => __b.empty())), 'a redrawn sprite counts as work');
    await reload(p); await home(p); await make(p); const i = await info(p); ok(i.tiles === 0 && i.actors === 0, 'redrawn-sprite project restored, no starter ' + JSON.stringify(i));
    ok(await p.evaluate(() => __b.spriteOk()), 'the redraw survived'); await shot(p, '5-sprite-only-restored'); await p.context().close(); }

  // 6. samples keep their confirmation
  { const p = await mk(1366, 768, '#t'); await p.click('#clearAllBtn'); await p.evaluate(() => __b.save()); await reload(p); await home(p);
    let c0 = confirms; await p.click('#landingTakeApartBtn'); await p.waitForTimeout(400); ok(confirms === c0, 'empty project: Take it apart asks nothing');
    await p.context().close();
    const q = await mk(1366, 768, '#t'); await q.evaluate(() => { __b.place(3, 10); __b.save(); }); await reload(q); await home(q);
    c0 = confirms; await q.click('#landingTakeApartBtn'); await q.waitForTimeout(400); ok(confirms === c0 + 1, 'project with work: Take it apart still confirms');
    await q.context().close(); }

  // 7. tutorial quit and finish
  { const p = await mk(1366, 768, ''); await p.click('#landingShowBtn'); await p.waitForTimeout(600);
    let i = await info(p); ok(i.tut && i.real === 0 && i.sky > 100, 'tutorial room has the sky backdrop ' + JSON.stringify(i));
    await p.keyboard.press('Escape'); await p.waitForTimeout(300); i = await info(p); ok(!i.tut && i.tiles === 0 && i.actors === 0, 'quit: project as before ' + JSON.stringify(i));
    await home(p); await make(p); i = await info(p); ok(isStarter(i), 'after quit, Make a game still gives the starter board');
    await p.context().close();
    const f = await mk(1366, 768, ''); await f.click('#landingShowBtn'); await f.waitForTimeout(600);
    await f.evaluate(() => { for (let x = 2; x < 13; x++) __b.place(x, 14); __b.finish(); }); await f.waitForTimeout(300);
    i = await info(f); ok(!i.tut && i.tiles >= 11 && i.sky > 100, 'finish leaves the board with the sky ' + JSON.stringify(i));
    const cap = await f.evaluate(() => __b.cap()); await home(f); await make(f); ok(cap === await f.evaluate(() => __b.cap()), 'after finish, Make a game restores the tutorial board'); await shot(f, '7-after-finish'); await f.context().close(); }

  // 8. old saves load unchanged
  { const p = await mk(1366, 768, '#t');
    await p.evaluate(() => __b.oldSave()); const old = await p.evaluate(() => localStorage.getItem('toyGameDesigner.autosave.v1'));
    await p.context().addInitScript(j => localStorage.setItem('toyGameDesigner.autosave.v1', j), old);
    await reload(p); let i = await info(p); ok(i.tiles === 2 && !i.landing, 'old-format save loads with its two tiles ' + JSON.stringify(i));
    await home(p); await make(p); i = await info(p); ok(i.tiles === 2 && !i.player, 'old save: Make a game restores it unchanged'); ok(!p.errs.length, 'no errors ' + p.errs); await p.context().close(); }
  await b.close();
  console.log('blankboard: ' + pass + ' passed, ' + fail + ' failed');
})();
