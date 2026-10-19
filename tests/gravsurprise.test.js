// v2.52 Stage 4 (not deployed): Surprise Me with gravity direction. Usage: node tests/gravsurprise.test.js <pre-stage-4 index.html> [shotDir]
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const PRE = path.resolve(process.argv[2]), SHOTS = process.argv[3] || os.tmpdir();
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = require("./surprise.hook.js")() + `
  window.__ev = f => eval("(" + f + ")");
  window.__st = {
    reset: () => { suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false; surpriseRecent.length = 0; },
    press: (seed, o) => surpriseMe(seed, o), gen: (seed, o) => generateSurprise(seed, o),
    play: () => enterPlayMode(), stop: () => exitToBuildMode(),
    templates: () => SURPRISE_TEMPLATES.map(t => ({ id: t.id, category: t.category, room: t.room || (t.rooms && t.rooms[0].room) })),
    room: () => { snapshotCurrentRoomState(); return rooms.find(r => r.id === currentRoomId); },
    validate: (spec, ctx) => surpriseValidatePart(spec, ctx || surpriseEmptyContext(), true),
    serialize: (m, n) => surpriseSerialize(m, n),
    pushTemplate: t => SURPRISE_TEMPLATES.push(t), popTemplate: () => SURPRISE_TEMPLATES.pop(),
  };`;
const mk = (srcFile, out, hook) => { const s = fs.readFileSync(srcFile, "utf8"); if (!s.includes(anchor)) throw new Error("anchor"); fs.writeFileSync(out, s.replace(anchor, anchor + hook)); return out; };
const NEW = mk(path.join(__dirname, "..", "index.html"), path.join(os.tmpdir(), "gs_new.html"), HOOK);
const OLD = mk(PRE, path.join(os.tmpdir(), "gs_old.html"), HOOK);
const MINI = mk(path.join(__dirname, "..", "index.html"), path.join(os.tmpdir(), "gs_mini.html"), `window.__ev = f => eval("(" + f + ")"); window.__st = { reset: () => { suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false; surpriseRecent.length = 0; }, press: (seed, o) => surpriseMe(seed, o), play: () => enterPlayMode() };`);
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; console.log("ok  ", m); } else { fails.push(m); console.log("FAIL", m); } };
const open = async (b, file) => { const ctx = await b.newContext({ viewport: { width: 1366, height: 700 }, acceptDownloads: true }); const page = await ctx.newPage(); const errors = []; page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept()); await page.goto("file://" + file + "#t"); await page.waitForFunction(() => window.__st); return { ctx, page, errors }; };
const ev = (pg, code, arg) => pg.evaluate(([c, a]) => window.__ev(c)(a), [code, arg]);

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  let { ctx, page, errors } = await open(browser, NEW);
  const T = await ev(page, "()=>__st.templates()");
  // ---- 1. metadata ----
  const dirs = {}; T.forEach(t => { dirs[t.id] = (t.room && t.room.dir) || "down"; });
  ok(T.every(t => !t.room || !t.room.dir || ["down", "up", "left", "right", "any"].includes(t.room.dir)), "every template's dir is down/up/left/right/any");
  const anyIds = T.filter(t => t.room && t.room.dir === "any").map(t => t.id), fixedIds = T.filter(t => t.room && ["up", "left", "right"].includes(t.room.dir)).map(t => t.id);
  console.log("any:", anyIds.join(), " fixed:", fixedIds.join());
  ok(anyIds.includes("fallforever") && anyIds.length >= 3 && fixedIds.includes("upsidedown"), "fallforever and others are 'any'; the Upside-Down Picnic is fixed up");

  // ---- 2. the roll ----
  const roll = await ev(page, `()=>{ const out={}; for (const id of ${JSON.stringify(anyIds.concat(fixedIds))}) { const c={down:0,up:0,left:0,right:0}, k={down:0,up:0,left:0,right:0};
      for (let s=1;s<=300;s++){ const sp=__st.gen(s,{templateId:id,ctx:surpriseEmptyContext(),place:"free",avoid:[]}); if(sp&&sp.dir) c[sp.dir]++; const sc=__st.gen(s,{templateId:id,ctx:surpriseEmptyContext(),place:"free",avoid:[],chaos:false,canonical:true}); if(sc&&sc.dir) k[sc.dir]++; }
      out[id]={c,k}; } return out; }`);
  for (const id of anyIds) {
    const c = roll[id].c, tot = c.down + c.up + c.left + c.right, nd = (tot - c.down) / tot;
    ok(nd > 0.15 && nd < 0.36 && c.up > 5 && c.left > 5 && c.right > 5, `${id}: chaos rolls non-down ${(nd * 100).toFixed(0)}% of the time, all three directions seen (${JSON.stringify(c)})`);
    ok(roll[id].k.down === 300 - (300 - roll[id].k.down) && roll[id].k.up + roll[id].k.left + roll[id].k.right === 0, `${id}: canonical (Try this) is always down`);
  }
  ok(roll.upsidedown.c.up === 300 && roll.upsidedown.k.up === 300, "upsidedown is up in chaos and canonical, every seed");

  // ---- 3. nothing else moved: a spec for every other template is identical to the pre-Stage-4 build (same seed) ----
  const others = T.filter(t => !anyIds.includes(t.id) && !fixedIds.includes(t.id) && t.id !== "roulette2").map(t => t.id);
  const specOf = async (pg, ids) => ev(pg, `()=>{ const out={}; for (const id of ${JSON.stringify(ids)}) { const a=[]; for (let s=1;s<=40;s++){ const sp=__st.gen(s,{templateId:id,ctx:surpriseEmptyContext(),place:"free",avoid:[]}); a.push(JSON.stringify(sp,(k,v)=>k==='dir'||k==='gravOpt'?undefined:v)); } out[id]=a; } return out; }`);
  const o2 = await open(browser, OLD);
  const specNew = await specOf(page, others), specOld = await specOf(o2.page, others);
  let same = 0, diff = [];
  others.forEach(id => { if (JSON.stringify(specNew[id]) === JSON.stringify(specOld[id])) same++; else diff.push(id); });
  ok(diff.length === 0, `specs for the ${others.length} unchanged templates are identical to the old build over 40 seeds each ${diff.join()}`);
  await o2.ctx.close();

  // ---- 4. gravity-aware reachability ----
  const val = await ev(page, `()=>{
    const mk = (dir, walls, p) => ({ tiles: walls.map(([x,y]) => ({x,y,key:'solid:none'})), actors: [], spawners: [], player: p, gravity: true, dir, clearRect: null, doors: [] });
    const box = []; for (let x=2;x<=8;x++){ box.push([x,0]); box.push([x,13]); } for (let y=0;y<=13;y++){ box.push([2,y]); box.push([8,y]); }
    const ledge = []; // gravity up: a three-wide ledge against the ceiling over a deep, narrow chamber
    for (let x=2;x<=6;x++){ ledge.push([x,0]); ledge.push([x,14]); } for (let y=0;y<=14;y++){ ledge.push([2,y]); ledge.push([6,y]); }
    const down = __st.validate(mk('down', ledge, {x:3,y:1}));
    const up = __st.validate(mk('up', ledge, {x:3,y:1}));
    const right = __st.validate(mk('right', box, {x:7,y:6}));
    return { down, up, right }; }`);
  ok(val.down == null, "down keeps the old plain-adjacency flood (a deep chamber counts) " + val.down);
  ok(val.up && /reachable/.test(val.up), "up: a chamber you cannot climb out of is not 'reachable' (" + val.up + ")");
  ok(val.right == null, "right: a box you can walk around in passes " + val.right);

  // ---- 5. the Upside-Down Picnic in Play ----
  const up = await ev(page, `()=>{ __st.reset(); __st.press(77,{templateId:'upsidedown',chaos:false,canonical:true}); __st.play(); playReadyUntil=null; for(let i=0;i<150;i++) tick(1/60); const p=actors.find(a=>a.isPlayer); const rect=__st.room().surprises[0].rect; return {dir:gravityDir,on:gravityEnabled,grounded:p.grounded,rel:(p.y/TILE)-rect.y}; }`);
  ok(up.dir === "up" && up.on && up.grounded && up.rel > 0.9 && up.rel < 1.1, "upsidedown: gravity pulls up and the player stands on the ceiling (" + JSON.stringify(up) + ")");
  await page.evaluate(() => window.__ev("()=>__st.stop()")());

  // ---- 6. random gravity Button in Falling Forever and Gravity Roulette ----
  for (const id of ["fallforever", "roulette2"]) {
    const r = await ev(page, `()=>{ __st.reset(); const rep=__st.press(4000,{templateId:${JSON.stringify(id)},chaos:false,canonical:true}); const hot=__st.room();
      const opts=Object.values(hot.gravButtons||{}); __st.play(); playReadyUntil=null; __iaStart(); const seen={}; for(let i=0;i<600;i++){ tick(1/60); seen[gravityDir]=1; } const ia=__iaStop();
      return {built:!!rep&&!!rep.templateId, opts, press:ia.counts.buttonPress||0, dirs:Object.keys(seen)}; }`);
    ok(r.built && r.opts.includes("random"), id + ": the surprise carries a random gravity Button " + JSON.stringify(r.opts));
    ok(r.press >= 1, id + ": something presses a Button within 10 s (" + r.press + ")");
    if (id === "fallforever") ok(r.dirs.length > 1, id + ": gravity actually changed direction (" + r.dirs.join() + ")");
    await page.evaluate(() => window.__ev("()=>__st.stop()")());
  }

  // ---- 7. every 'any' template, every direction: builds, plays 8 s, nothing off the board or NaN ----
  const anyRes = await ev(page, `()=>{ const res=[]; for (const id of ${JSON.stringify(anyIds)}) { const got={};
      for (let s=1;s<=400 && Object.keys(got).length<4;s++){ const sp=__st.gen(s,{templateId:id,ctx:surpriseEmptyContext(),place:"free",avoid:[]}); if(sp&&!sp.failed&&!sp.noRoom&&sp.dir&&!(sp.dir in got)&&(sp.gravity||sp.dir==='down')) got[sp.dir]=s; }
      for (const d of Object.keys(got)) { __st.reset(); const rep=__st.press(got[d],{templateId:id}); const dirNow=gravityDir; __st.play(); playReadyUntil=null; let bad=null;
        for(let i=0;i<480;i++){ tick(1/60); const p=actors.find(a=>a.isPlayer); if(!p||!isFinite(p.x)||!isFinite(p.y)||p.x<-60||p.x>COLS*TILE+60||p.y<-60||p.y>ROWS*TILE+60){ bad='off '+i; break; } }
        res.push({id,d,dirNow,built:!!rep&&!!rep.templateId,bad}); __st.stop(); } } return res; }`);
  anyRes.forEach(r => ok(r.built && !r.bad && r.dirNow === r.d, `${r.id} falling ${r.d}: built, played 8 s, player stays on the board ${r.bad || ""}`));
  ok(anyRes.length >= anyIds.length * 3, "every 'any' template was tried in at least three directions (" + anyRes.length + " runs)");
  ok(errors.length === 0, "no page errors: " + errors.slice(0, 2).join(";"));

  // ---- 8. serialize and overwrite ----
  const ser = await ev(page, `()=>{ __st.reset(); gravityEnabled=true; gravityDir='left'; const hot=__st.room(); for(let x=0;x<24;x++){ board[17][x]='solid:none'; } board[10][5]='pushbutton:none'; hot.gravButtons={'5,10':'random'}; board[10][7]='pushbutton:none'; selectedActorDefId=playerDefId; paintMode='actor'; placeNewActor(12*TILE+16,16*TILE+16);
      const e=__st.serialize('hot','sertest'); return {room:e.room, legendVals:Object.values(e.legend), notes:e.notes}; }`);
  ok(ser.room.dir === "left", "serialize writes the room's dir: " + JSON.stringify(ser.room));
  ok(ser.legendVals.includes("gbutton:random") && ser.legendVals.includes("button0"), "serialize writes gbutton:random for an option Button and button0 for a plain one " + ser.legendVals.join());
  const rt = await ev(page, `()=>{ const e=__st.serialize('hot','sertest'); __st.reset(); e.id='sertest'; e.category='toy'; e.names=['x']; e.requires=[]; e.expect={fact:'x',check:null,needsInput:true}; e.discover=Object.keys(e.legend)[0]; __st.pushTemplate(e);
      const rep=__st.press(5,{templateId:'sertest',chaos:false,canonical:true,mirror:false}); __st.popTemplate(); const hot=__st.room(); return {built:!!rep&&!!rep.templateId, dir:gravityDir, on:gravityEnabled, opts:Object.values(hot.gravButtons||{})}; }`);
  ok(rt.built && rt.dir === "left" && rt.on && rt.opts.includes("random"), "a serialized room with up gravity and a random Button rebuilds the same " + JSON.stringify(rt));
  const stale = await ev(page, `()=>{ __st.reset(); const hot=__st.room(); hot.gravButtons={'3,3':'up'}; surpriseClearRect({x:0,y:0,w:10,h:10}); const a=Object.keys(hot.gravButtons).length; return a; }`);
  ok(stale === 0, "clearing a surprise's rectangle also clears Button options in it");

  // ---- 9. exported: Falling Forever with its random Button, played ----
  const m = await open(browser, MINI);
  await ev(m.page, `()=>{ __st.reset(); __st.press(4000,{templateId:'fallforever',chaos:false,canonical:true}); }`);
  const [d] = await Promise.all([m.page.waitForEvent("download"), m.page.click("#exportBtn")]);
  const f = path.join(os.tmpdir(), "gs_export.html"); await d.saveAs(f);
  let exs = fs.readFileSync(f, "utf8"); const li = exs.lastIndexOf("requestAnimationFrame(frame);"); exs = exs.slice(0, li) + "window.__x=f=>eval('('+f+')');" + exs.slice(li);
  const ef = path.join(os.tmpdir(), "gs_export_hooked.html"); fs.writeFileSync(ef, exs);
  const q = await m.ctx.newPage(); const qerr = []; q.on("pageerror", e => qerr.push(String(e)));
  await q.goto("file://" + ef); await q.waitForTimeout(4500);
  const xs = await q.evaluate(() => window.__x("()=>({dir:gravityDir,on:gravityEnabled,opts:Object.values(rooms[0].gravButtons||{}),p:(()=>{const p=actors.find(a=>a.isPlayer);return [p.x,p.y];})()})")());
  ok(xs.opts.includes("random") && xs.on, "export: the random Button travelled with the room " + JSON.stringify(xs));
  ok(xs.dir !== "down", "export: the player fell through the Button and gravity turned (" + xs.dir + ")");
  ok(xs.p.every(Number.isFinite), "export: the player is on the board");
  ok(qerr.length === 0, "export: no errors " + qerr.join(";"));
  await q.close(); await m.ctx.close();

  // ---- 10. screenshots: five presses with non-down gravity ----
  const sh = await open(browser, NEW);
  const picks = [];
  for (let s = 1; s <= 600 && picks.length < 5; s++) {
    const r = await ev(sh.page, `()=>{ const ids=${JSON.stringify(anyIds.concat(fixedIds))}; const id=ids[${picks.length} % ids.length]; const sp=__st.gen(${s},{templateId:id,ctx:surpriseEmptyContext(),place:'free',avoid:[]}); return sp&&!sp.failed&&!sp.noRoom&&sp.gravity&&sp.dir!=='down'?{id,dir:sp.dir}:null; }`);
    if (r) picks.push({ seed: s, ...r });
  }
  for (const [i, pk] of picks.entries()) {
    await ev(sh.page, `(a)=>{ __st.reset(); __st.press(a.seed,{templateId:a.id}); }`, pk);
    await sh.page.waitForTimeout(1500);
    await sh.page.screenshot({ path: path.join(SHOTS, `gravsurprise_${i + 1}_${pk.id}_${pk.dir}.png`) });
  }
  console.log("shots:", picks.map(p => `${p.id}/${p.dir}#${p.seed}`).join(" "));
  ok(picks.length === 5, "five non-down presses screenshotted");
  ok(sh.errors.length === 0, "no errors while screenshotting");
  await browser.close();
  console.log(`\n${pass} passed, ${fails.length} failed`); if (fails.length) { console.log(fails.join("\n")); process.exit(1); }
})();
