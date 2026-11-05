// A whole-room surprise opens at its starting layout: leaked channel colours cleared, the author's hero look wins over
// stock looks (never a kid's own drawing), and the room opens paused. node tests/lockedin.test.js
const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs = require('fs'), path = require('path'), os = require('os');
(async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const A = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
  if (!src.includes(A)) throw new Error('anchor');
  const tmp = path.join(os.tmpdir(), 'lockedin.html');
  fs.writeFileSync(tmp, src.replace(A, A + 'window.__v={surpriseMe,get paused(){return gamePaused},get sc(){return switchChannels},get pdef(){return actorDefs[playerDefId]},P:CHARACTER_PRESETS};\n'));
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); let pass = 0, fail = 0;
  const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL', m)); if (c) console.log('ok  ', m); };
  const open = async () => { const p = await b.newPage(); p.on('dialog', d => d.accept()); await p.goto('file://' + tmp + '#t'); await p.waitForTimeout(300); await p.evaluate(() => { window.requestAnimationFrame = () => 0; }); return p; };
  let p = await open();
  const r = await p.evaluate(() => { __v.sc.red = true; __v.sc.green = true; __v.sc.blue = true; __v.surpriseMe(1, { templateIds: ['byebyecupcake'] }); const a = JSON.stringify(__v.pdef.art); return { sc: JSON.stringify(__v.sc), paused: __v.paused, derpy: __v.P.some(q => q.name === 'Derpy' && JSON.stringify(q.art) === a) }; });
  ok(r.sc === '{}', 'channels left on by an earlier room are cleared'); ok(r.paused, 'a whole-room surprise opens paused'); ok(r.derpy, 'the cupcake hero look is applied over the stock look');
  const r2 = await p.evaluate(() => { __v.surpriseMe(2, { templateIds: ['minilevel1'] }); __v.surpriseMe(3, { templateIds: ['byebyecupcake'] }); const a = JSON.stringify(__v.pdef.art); return __v.P.some(q => q.name === 'Derpy' && JSON.stringify(q.art) === a); });
  ok(r2, 'a second press still gets the cupcake after another authored look'); await p.close();
  p = await open();
  const r3 = await p.evaluate(() => { const d = __v.pdef; d.art = d.art.map((c, i) => i === 10 ? '#123456' : c); d.poses = null; const mine = JSON.stringify(d.art); __v.surpriseMe(1, { templateIds: ['byebyecupcake'] }); return JSON.stringify(__v.pdef.art) === mine; });
  ok(r3, "a kid's own drawing is never replaced"); await p.close(); await b.close();
  console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
