const fs=require('fs');const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  p.on('dialog', d => d.accept()); const errs = []; p.on('pageerror', e => errs.push(e.message));
  let h=fs.readFileSync('index.html','utf8').replace('  const bootHash = location.hash;','window.__t={get d(){return actorDefs},get ids(){return customActorSlotIds},get sel(){return selectedActorDefId},add:()=>addEnemyType(),look:d=>enemyLookName(d),snap:()=>captureProjectSnapshot(),rest:s=>restoreProjectSnapshot(s),pick:k=>selectActorKind(k),preset:()=>CHARACTER_PRESETS};\n  const bootHash = location.hash;');
  const tmp=require('os').tmpdir()+'/enemypanel.html';fs.writeFileSync(tmp,h);
  await p.goto('file://'+tmp+'#t');
  await p.click('#modeCharacter');
  const labels = () => p.$$eval('#characterSwatches .swatch .lbl', l => l.map(x => x.textContent));
  let f = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) f++; };
  ok((await labels()).some(x => /Wheeb/.test(x)), 'first slot named by name: ' + (await labels()));
  await p.click('#characterSwatches .swatch:first-child');
  const art0 = await p.evaluate(() => JSON.stringify(__t.d[__t.sel].art));
  for (const t of ['Chaser', 'Fleer', 'Statue']) await p.click('#temperamentPickerSwatches .swatch[title="' + t + '"]');
  ok(await p.evaluate(a => JSON.stringify(__t.d[__t.sel].art) === a && __t.d[__t.sel].temperament === 'stationary', art0), 'behavior keeps sprite');
  await p.evaluate(() => __t.add());
  await p.click('#temperamentPickerSwatches .swatch[title="Chaser"]');
  await p.click('#lethalPickerSwatches .swatch:last-child');
  const s = await p.evaluate(() => __t.ids.map(i => [__t.d[i].name, __t.d[i].temperament, __t.d[i].lethal]));
  ok(s.length === 2 && s[0][1] === 'stationary' && s[1][1] === 'chaser', 'slots independent ' + JSON.stringify(s));
  ok(!(await labels()).some(x => /enemy/i.test(x)), 'no "Enemy N" labels: ' + (await labels()));
  // preset applies to the selected slot only, name follows the sprite
  await p.evaluate(()=>{const ids=__t.ids; const sel=__t.sel; });
  await p.click('#presetSwatches .presetSwatch[title="Grumble"]');
  const s2 = await p.evaluate(() => __t.ids.map(i => [__t.d[i].name, __t.d[i].temperament, __t.d[i].lethal]));
  ok(s2[1][0]==='Grumble' && s2[1][1]==='chaser' && s2[0][0]==='Wheebuns', 'preset renames only selected slot ' + JSON.stringify(s2));
  // behavior + lethal survive a snapshot round trip and an old-name migration
  const rt = await p.evaluate(() => { const sn = JSON.parse(JSON.stringify(__t.snap())); __t.rest(sn); return __t.ids.map(i => [__t.d[i].name, __t.d[i].temperament, __t.d[i].lethal]); });
  ok(JSON.stringify(rt)===JSON.stringify(s2), 'snapshot round trip keeps triples');
  const legacy = await p.evaluate(() => { const i=__t.ids[0]; __t.d[i].name='Enemy 2'; return __t.look(__t.d[i]); });
  ok(legacy==='Wheebuns', 'legacy "Enemy 2" resolves to sprite name: '+legacy);
  // a built-in enemy selection (old state) does not revert on behavior click
  await p.evaluate(() => __t.pick('wanderer'));
  const before = await p.evaluate(() => JSON.stringify(__t.d[__t.sel].art));
  await p.click('#temperamentPickerSwatches .swatch[title="Fleer"]');
  const aft = await p.evaluate(() => [JSON.stringify(__t.d[__t.sel].art), __t.d[__t.sel].temperament, __t.d[__t.sel].enemyType, __t.d.a2.temperament]);
  ok(aft[0]===before && aft[1]==='fleer' && aft[2] && aft[3]==='wanderer', 'built-in selection becomes own slot, built-in untouched');
    // player not a behavior, voices hidden, header and player label by name
  await p.evaluate(()=>__t.pick('wanderer'));
  const titles = await p.$$eval('#temperamentPickerSwatches .swatch', l=>l.map(x=>x.title));
  ok(JSON.stringify(titles)==='["Chaser","Wanderer","Fleer","Statue"]','four behaviors only: '+titles);
  ok(await p.evaluate(()=>getComputedStyle(document.getElementById('temperamentPickerBlock')).display==='none'),'voice block hidden');
  const plabel = await p.$eval('#playerSwatchRow .lbl',e=>e.textContent);
  ok(!/^hero$/i.test(plabel), 'player label by name: '+plabel);
  await p.click('#playerSwatchRow .swatch'); await p.click('#presetSwatches .presetSwatch[title="Grumble"]');
  ok(await p.$eval('#playerSwatchRow .lbl',e=>e.textContent)==='Grumble','player renamed by sprite');
  await p.click('#characterSwatches .swatch:first-child');
  ok(!/enemy/i.test(await p.$eval('#customActorEditingName',e=>e.textContent)),'behavior header has no "Enemy N"');
  // slot look order, on a fresh page
  const p2 = await b.newPage({ viewport: { width: 1366, height: 768 } }); p2.on('dialog', d => d.accept());
  await p2.goto('file://'+tmp+'#t'); await p2.click('#modeCharacter');
  await p2.evaluate(()=>{ for(let i=0;i<10;i++) __t.add(); });
  const names = await p2.evaluate(()=>__t.ids.filter(i=>__t.d[i].enemyType).map(i=>__t.d[i].name));
  ok(JSON.stringify(names.slice(0,8))===JSON.stringify(['Wheebuns','Gloop','Mousecop','McDinglechud','crabby','Thelonius','Bonesy','Grumble']),'slots 1-8 fixed looks: '+names.slice(0,8));
  ok(names.length===10 && names.slice(8).every(n=>typeof n==='string'&&n.length>0),'9th+ random preset names: '+names.slice(8));
  ok(!errs.length, 'no errors ' + errs);
  await b.close(); process.exit(f ? 1 : 0);
})();
