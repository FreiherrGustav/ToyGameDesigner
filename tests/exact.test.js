// Hand-built Surprise Me rooms keep the author's own textures, Paint tiles and characters. node tests/exact.test.js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
let src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
src = src.replace('  if (loadAutosave()) log(', `  window.__s = { press: (id, seed) => surpriseMe(seed, { templateId: id, chaos: true }),
    room: () => { snapshotCurrentRoomState(); const r = rooms.find(q => q.id === currentRoomId);
      return { skins: r.groundSkinBoard.map((row, y) => row.map((c, x) => c && r.board[y][x] ? [x, y, c, r.groundSkinRotationBoard[y][x]] : null).filter(Boolean)).flat(),
        backs: r.backgroundBoard.map((row, y) => row.map((c, x) => c ? [x, y, c] : null).filter(Boolean)).flat(),
        actors: r.actors.map(a => a.defId), pa: actorDefs[playerDefId].art, pp: actorDefs[playerDefId].poses, defs: actorDefs, g: groundTileDefs, b: backgroundTileDefs }; } };
  if (loadAutosave()) log(`);
const tmp = '/tmp/exact_hooked.html'; fs.writeFileSync(tmp, src);
const FILES = { cannoncat: 'Cannon Cat', fanloop: 'Fan loop', monsterescape: 'monster escape', byebyecupcake: 'byebye cupcake', gravity1: 'gravity 1', chaos1: 'Chaos 1', stayalive: 'Stay Alive', oopscannons: 'Oops cannons', minilevel1: 'Mini Level 1' };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const id of Object.keys(FILES)) {
    const f = fs.readdirSync(ROOT).find(n => n.startsWith(FILES[id]) && n.endsWith('.json'));
    const d = JSON.parse(fs.readFileSync(path.join(ROOT, f))).data, room = d.rooms[0];
    const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', x => x.accept());
    await p.goto('file://' + tmp + '#t'); await p.waitForTimeout(300);
    // three different seeds: the skins never change (no random wall textures), the characters are the author's
    for (const seed of [11, 4821, 9001]) {
      await p.evaluate(() => { document.getElementById('newBtn') && 0; });
      await p.reload(); await p.waitForTimeout(300);
      await p.evaluate(([i, s]) => window.__s.press(i, s), [id, seed]); await p.waitForTimeout(150);
      const r = await p.evaluate(() => { const o = window.__s.room(); return { skins: o.skins, backs: o.backs, actors: o.actors, pa: o.pa, pp: o.pp, nsActors: Object.keys(o.defs).filter(k => k.startsWith('sx~')), g: Object.fromEntries(Object.entries(o.g).filter(([k]) => k.startsWith('sx~')).map(([k, v]) => [k, v.frames])), b: Object.fromEntries(Object.entries(o.b).filter(([k]) => k.startsWith('sx~')).map(([k, v]) => [k, v.art])), defs: Object.fromEntries(Object.entries(o.defs).filter(([k]) => k.startsWith('sx~')).map(([k, v]) => [k, v.art])) }; });
      const wantSkins = []; for (let y = 0; y < 18; y++) for (let x = 0; x < 24; x++) { const s = room.groundSkinBoard[y][x]; if (s && room.board[y][x]) wantSkins.push([x, y, 'sx~' + id + '~' + s, room.groundSkinRotationBoard[y][x] || 0]); }
      const wantBacks = []; for (let y = 0; y < 18; y++) for (let x = 0; x < 24; x++) { const s = room.backgroundBoard[y][x]; if (s) wantBacks.push([x, y, 'sx~' + id + '~' + s]); }
      ok(JSON.stringify(r.skins) === JSON.stringify(wantSkins), id + ' seed ' + seed + ': every ground texture is the author\'s (' + wantSkins.length + ' cells)');
      ok(JSON.stringify(r.backs) === JSON.stringify(wantBacks), id + ' seed ' + seed + ': every Paint tile is the author\'s (' + wantBacks.length + ' cells)');
      Object.entries(r.g).forEach(([k, fr]) => ok(JSON.stringify(fr) === JSON.stringify(d.groundTileDefs[k.split('~')[2]].frames), id + ': ' + k + ' frames match'));
      Object.entries(r.b).forEach(([k, art]) => ok(JSON.stringify(art) === JSON.stringify(d.backgroundTileDefs[k.split('~')[2]].art), id + ': ' + k + ' art matches'));
      Object.entries(r.defs).forEach(([k, art]) => { const o = k.split('~')[2]; ok(JSON.stringify(art) === JSON.stringify(d.actorDefs[o].art), id + ': character ' + k + ' art matches'); });
      ok(JSON.stringify(r.pa) === JSON.stringify(d.actorDefs[d.playerDefId].art), id + ' seed ' + seed + ': the hero looks like the author\'s');
      // every character in the room that the author drew with a custom look uses it
      const customUsed = new Set(room.actors.map(a => a.defId).filter(x => x === 'a2' || x === 'a3'));
      customUsed.forEach(o => ok(r.actors.some(a => a.endsWith('~' + o)), id + ': uses the author\'s ' + o));
    }
    ok(errs.length === 0, id + ': no errors ' + errs.join('|'));
    await p.close();
  }
  await b.close(); console.log('exact: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
