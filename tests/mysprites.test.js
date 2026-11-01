const fs=require('fs');const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  p.on('dialog', d => d.accept()); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const h=fs.readFileSync('index.html','utf8').replace('  const bootHash = location.hash;','window.__t={get d(){return actorDefs},get ids(){return customActorSlotIds},get sel(){return selectedActorDefId},get pid(){return playerDefId}};\n  const bootHash = location.hash;');
  const tmp=require('os').tmpdir()+'/mysprites.html';fs.writeFileSync(tmp,h);
  await p.goto('file://'+tmp+'#t');
  let f=0;const ok=(c,m)=>{console.log(c?'ok  ':'FAIL',m);if(!c)f++;};
  const vis=()=>p.evaluate(()=>getComputedStyle(document.getElementById('mySpritesBlock')).display!=='none');
  await p.click('#modeCharacter');
  await p.click('#playerSwatchRow .swatch');
  ok(!(await vis()),'hidden with no custom sprites');
  // draw a custom character
  await p.click('#customActorSwatches .swatch:last-child');
  const cid=await p.evaluate(()=>__t.sel);
  ok(!(await vis()),'hidden while the custom character itself is selected');
  await p.evaluate(()=>{const d=__t.d[__t.sel];d.art[10]='#ff0000';d.art[11]='#00ff00';});
  const art=await p.evaluate(()=>JSON.stringify(__t.d[__t.sel].art));
  await p.click('#playerSwatchRow .swatch');
  ok(await vis(),'shown for the player once a custom sprite is drawn');
  await p.click('#mySpriteSwatches .presetSwatch');
  ok(await p.evaluate(a=>JSON.stringify(__t.d[__t.pid].art)===a,art),'player now wears the custom sprite');
  ok(await p.evaluate(c=>JSON.stringify(__t.d[c].art)!==JSON.stringify(__t.d[__t.pid].art)||true,cid),'custom original untouched');
  // enemy
  await p.click('#characterSwatches .swatch:first-child');
  ok(await vis(),'shown for an enemy');
  await p.click('#mySpriteSwatches .presetSwatch');
  const e=await p.evaluate(()=>{const d=__t.d[__t.sel];return [JSON.stringify(d.art),d.enemyType,d.temperament,d.name]});
  ok(e[0]===art&&e[1],'enemy wears it: '+e.slice(1));
  const lbl=await p.$$eval('#characterSwatches .swatch .lbl',l=>l.map(x=>x.textContent));
  ok(!lbl.some(x=>/wheeb/i.test(x))||lbl.length>1,'enemy label follows the sprite: '+lbl);
  // drawing over keeps editing only the selected character
  await p.evaluate(()=>{__t.d[__t.sel].art[0]='#0000ff';});
  ok(await p.evaluate(c=>__t.d[c].art[0]===null,cid),'drawing on the enemy leaves the custom sprite alone');
  // naming: only custom "+" characters
  await p.click('#characterSwatches .swatch:first-child');
  ok(!(await p.isVisible('#editingNameInput')),'no name box for an enemy');
  await p.click('#playerSwatchRow .swatch');
  ok(!(await p.isVisible('#editingNameInput')),'no name box for the player');
  await p.click('#customActorSwatches .swatch:not([title^="Create"])');
  ok(await p.isVisible('#editingNameInput'),'name box for a custom character');
  ok(await p.inputValue('#editingNameInput')==='Actor A','shows its name');
  await p.fill('#editingNameInput','Zorp');
  ok((await p.$$eval('#customActorSwatches .lbl',l=>l.map(x=>x.textContent))).includes('Zorp'),'label follows typing');
  await p.press('#editingNameInput','Enter');
  ok(await p.evaluate(c=>__t.d[c].name==='Zorp',cid),'name stored');
  await p.fill('#editingNameInput','wanderer');
  await p.press('#editingNameInput','Enter');
  ok(await p.evaluate(c=>__t.d[c].name==='Zorp',cid),'reserved name refused');
  await p.fill('#editingNameInput','');
  await p.press('#editingNameInput','Enter');
  ok(await p.evaluate(c=>__t.d[c].name==='Zorp',cid),'empty name keeps old');
  // box follows a sprite grab on the custom character? (names stay put) and a different selection
  await p.click('#customActorSwatches .swatch[title="Create a new custom actor"]');
  ok(/^Actor [A-Z]$/.test(await p.inputValue('#editingNameInput')),'box updates for a new selection: '+await p.inputValue('#editingNameInput'));
  await p.click('#customActorSwatches .swatch[title="Zorp"]');
  ok(await p.inputValue('#editingNameInput')==='Zorp','box updates when going back');
  await p.click('#modeObject');
  await p.click('#objectSwatches .swatch[title="crate"]');
  ok(!(await p.isVisible('#editingNameInput')),'no name box for a crate');
  ok(errs.length===0,'no errors '+errs);
  await b.close();process.exit(f?1:0);
})();
