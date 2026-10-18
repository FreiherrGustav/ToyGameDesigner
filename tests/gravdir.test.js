// v2.52 Stage 1 (not deployed): gravity direction (down / up). Usage: node tests/gravdir.test.js [baselineHtml] [shotDir]
// A: frame-by-frame no-regression of every sample at "down" against a baseline build (the v2.51 index.html).
// B: 180-degree invariance: a world and its half-turned copy (up gravity, tiles/inputs the same) mirror each other.
// C: save/load/export round trip, old save loads as down, pointer accuracy, crispness.
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const REPO = path.join(__dirname, "..");
const BASE = process.argv[2] || "", SHOTS = process.argv[3] || os.tmpdir();
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const hook = `window.__ev=f=>eval("("+f+")");
window.__seed=v=>{ let s=v>>>0; Math.random=()=>{ s=(s+0x6D2B79F5)>>>0; let t=s; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; }; };
window.__sim=(n,inputFn)=>{ for(let i=0;i<n;i++){ if(inputFn) inputFn(i); window.__T+=16; window.__seed(Math.round(gameClockMs/16)*7919+1);
  const q=window.__q.splice(0); for(const cb of q) cb(window.__T); } };
`;
const mk = (file, name) => { const s = fs.readFileSync(file, "utf8"); if (!s.includes(anchor)) throw new Error("anchor missing in " + file); const t = path.join(os.tmpdir(), name); fs.writeFileSync(t, s.replace(anchor, anchor + hook)); return t; };
const NEW = mk(path.join(REPO, "index.html"), "gd_new.html");
const OLD = BASE ? mk(BASE, "gd_old.html") : null;
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; console.log("ok  ", m); } else { fails.push(m); console.log("FAIL", m); } };
const FAKE = () => { window.__T = 0; window.__q = []; performance.now = () => window.__T; window.requestAnimationFrame = cb => { window.__q.push(cb); return 1; }; };
const open = async (b, file, vp, hash) => {
  const ctx = await b.newContext({ viewport: vp || { width: 1366, height: 635 }, acceptDownloads: true });
  const page = await ctx.newPage(); const errors = []; page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept());
  await page.addInitScript(FAKE);
  await page.goto("file://" + file + (hash === undefined ? "#t" : hash)); await page.waitForFunction(() => window.__sim);
  return { ctx, page, errors };
};
const ev = (pg, code) => pg.evaluate(c => window.__ev(c)(), code);

const SCHEDULE = `(function(){ window.__held=new Set(); const sets=[["ArrowRight"],["ArrowRight"," "],["ArrowLeft"],["ArrowDown"],["ArrowUp"],[],["ArrowRight","e"],["ArrowLeft"," "],["d"],["s"]];
  window.__inputAt=k=>{ if(k%15!==0) return; const want=new Set(sets[(Math.imul(k/15+3,2654435761)>>>0)%sets.length]);
   for(const h of [...window.__held]) if(!want.has(h)){ window.dispatchEvent(new KeyboardEvent("keyup",{key:h,bubbles:true})); window.__held.delete(h); }
   for(const w of want) if(!window.__held.has(w)){ window.dispatchEvent(new KeyboardEvent("keydown",{key:w,bubbles:true})); window.__held.add(w); } };
  window.__releaseAll=()=>{ for(const h of [...window.__held]) window.dispatchEvent(new KeyboardEvent("keyup",{key:h,bubbles:true})); window.__held.clear(); }; })()`;
// one sample, 625 frames, per-frame full-precision fingerprint hashed to an int
const TRACE = `(idx)=>{
  if(appMode==='play') exitToBuildMode(); gameClockMs=0; clearGameTimers(); nextActorInstId=1000; window.__seed(12345);
  const g=SAMPLE_GAMES[idx]; loadExampleGame(g.builder,g.name,{skipConfirm:true}); enterPlayMode(); lastT=window.__T;
  const out=[]; const hs=s=>{ let h=0; for(let i=0;i<s.length;i++) h=(Math.imul(h,31)+s.charCodeAt(i))|0; return h; };
  for(let k=0;k<625;k++){ window.__sim(1,()=>window.__inputAt(k));
    const bs=board.map(r=>r.join(",")).join("|");
    out.push(hs(JSON.stringify(actors.map(a=>[a.defId,a.x,a.y,a.vx,a.vy,a.grounded?1:0]))+score+"/"+lives+"/"+currentRoomId+"/"+Math.round(gameClockMs)+"/"+cameraX+bs)); }
  window.__releaseAll(); return { name:g.name, out }; }`;

// ---------- scenarios for the half-turn test ----------
const SC = {
  platform: { tiles: [[0,16,"solid:none",23],[8,12,"solid:none",4],[15,13,"solid:none",3],[20,14,"solid:none",3]],
    actors: [["player", 2, 15]], keys: [[10, 120, "ArrowRight"], [60, 75, " "], [120, 125, "ArrowUp"], [150, 230, "ArrowRight"], [170, 180, "ArrowUp"], [200, 215, " "], [260, 330, "ArrowLeft"], [280, 290, " "]] },
  bounce: { tiles: [[0,16,"solid:bouncy",23],[4,10,"solid:none",3]], actors: [["player", 3, 3]], keys: [[60, 160, "ArrowRight"], [100, 115, " "], [200, 280, "ArrowLeft"]] },
  stack: { tiles: [[0,16,"solid:none",23]], actors: [["player", 3, 15], ["crate", 8, 5], ["crate", 8, 8], ["crate", 8, 11], ["stone", 12, 3]],
    keys: [[10, 140, "ArrowRight"], [150, 190, "ArrowLeft"], [200, 215, " "], [230, 300, "ArrowRight"]] },
  conveyor: { tiles: [[0,16,"solid:none",23],[6,16,"solid:wind-e",6],[14,16,"solid:wind-w",4]], actors: [["player", 7, 15], ["crate", 9, 15], ["crate", 15, 15], ["stone", 6, 13]], keys: [[100, 140, "ArrowLeft"], [180, 200, " "]] },
  bomb: { tiles: [[0,16,"solid:none",23],[7,15,"solid:none",1],[9,15,"solid:none",1]], actors: [["player", 3, 15], ["bomb", 8, 2]], keys: [[200, 230, "ArrowRight"]] },
  trampoline: { tiles: [[0,16,"solid:none",23],[10,16,"trampoline:none",2]], actors: [["player", 11, 4], ["tramp", 16, 14], ["crate", 16, 3]], keys: [[140, 150, " "]] },
  sticky: { tiles: [[0,16,"solid:none",23],[12,6,"solid:sticky",1],[12,7,"solid:sticky",1],[12,8,"solid:sticky",1],[12,9,"solid:sticky",1],[12,10,"solid:sticky",1],[12,11,"solid:sticky",1],[12,12,"solid:sticky",1],[12,13,"solid:sticky",1],[12,14,"solid:sticky",1],[12,15,"solid:sticky",1]],
    actors: [["player", 3, 15]], keys: [[10, 150, "ArrowRight"], [30, 40, " "], [90, 100, " "], [160, 230, "ArrowLeft"]] },
  cannon: { tiles: [[0,16,"solid:none",23],[6,15,"cannon2-ne:none",1]], actors: [["player", 3, 15], ["crate", 9, 3]], keys: [[10, 45, "ArrowRight"], [160, 220, "ArrowRight"]] },
  slippery: { tiles: [[0,16,"solid:slippery",23],[14,15,"solid:none",1]], actors: [["player", 3, 15], ["crate", 6, 15]], keys: [[10, 80, "ArrowRight"], [100, 130, "ArrowLeft"], [140, 150, " "], [170, 220, "ArrowRight"]] },
};
const FLIPKEY = { "wind-e": "wind-w", "wind-w": "wind-e", "wind-n": "wind-s", "wind-s": "wind-n", "cannon2-ne": "cannon2-sw", "cannon2-sw": "cannon2-ne", "cannon2-se": "cannon2-nw", "cannon2-nw": "cannon2-se" };
const BUILD = `(spec, rot)=>{
  if(appMode==='play') exitToBuildMode(); gameClockMs=0; clearGameTimers(); nextActorInstId=1000; window.__seed(777);
  suppressHistory=true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory=false;
  gravityEnabled=true; gravityDir=rot?'up':'down';
  const FLIP=${JSON.stringify(FLIPKEY)};
  const mapKey=k=>{ if(!rot) return k; const [g,m]=k.split(':'); const gg=g.replace(/(wind|cannon2)-[nesw]+/,x=>FLIP[x]||x); return (FLIP[g]||g)+':'+(FLIP[m]||m); };
  for(const [x,y,key,len] of spec.tiles) for(let i=0;i<len;i++){ const gx=x+i; if(rot) board[17-y][23-gx]=mapKey(key); else board[y][gx]=key; }
  const W=24*TILE,H=18*TILE;
  for(const [kind,cx,cy] of spec.actors){ const px=cx*TILE+TILE/2, py=cy*TILE+TILE/2; const X=rot?W-px:px, Y=rot?H-py:py;
    if(kind==='player'){ selectedActorDefId=playerDefId; paintMode='actor'; placeNewActor(X,Y); }
    else placeCarryableActor({crate:PUSHABLE_DEF_ID,stone:LARGE_STONE_DEF_ID,bomb:CARRY_BOMB2_DEF_ID,tramp:CARRY_TRAMPOLINE_DEF_ID}[kind],X,Y); }
  enterPlayMode(); playReadyUntil=null; lastT=window.__T; return rot; }`;
const RUNSC = `(spec, frames)=>{
  const held=new Set(); const out=[]; const keysOf=k=>{ const want=new Set(); for(const [a,b,key] of spec.keys) if(k>=a&&k<b) want.add(key);
    for(const h of [...held]) if(!want.has(h)){ window.dispatchEvent(new KeyboardEvent('keyup',{key:h,bubbles:true})); held.delete(h); }
    for(const w of want) if(!held.has(w)){ window.dispatchEvent(new KeyboardEvent('keydown',{key:w,bubbles:true})); held.add(w); } };
  for(let k=0;k<frames;k++){ window.__sim(1,()=>keysOf(k)); out.push(actors.map(a=>[a.x,a.y,a.vx,a.vy,a.grounded?1:0,a.w,a.h])); }
  for(const h of [...held]) window.dispatchEvent(new KeyboardEvent('keyup',{key:h,bubbles:true}));
  return { out, board: board.map(r=>r.slice(0,24)), lives, ended: playSessionEnded }; }`;

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  // ---------------- A: no regression at "down" ----------------
  if (OLD && !process.env.SKIP_A) {
    const probe = await open(browser, NEW); const n = await ev(probe.page, "()=>SAMPLE_GAMES.length"); await probe.ctx.close();
    let framesTotal = 0;
    for (let i = 0; i < n; i++) {
      const res = [];
      for (const f of [OLD, NEW]) { const q = await open(browser, f); await q.page.evaluate(SCHEDULE);
        res.push(await q.page.evaluate(`window.__ev(${JSON.stringify(TRACE)})(${i})`)); if (q.errors.length) throw new Error(q.errors[0]); await q.ctx.close(); }
      let first = -1; for (let k = 0; k < res[0].out.length; k++) if (res[0].out[k] !== res[1].out[k]) { first = k; break; }
      framesTotal += res[0].out.length;
      ok(first < 0, `A: ${res[0].name}: ${res[0].out.length} frames identical (every actor x/y/vx/vy/grounded, board, score, lives, camera) baseline vs new at "down"` + (first >= 0 ? ` — first difference at frame ${first}` : ""));
    }
    console.log(`A total: ${n} samples, ${framesTotal} frames compared`);
  } else console.log("A skipped (no baseline given)");

  // ---------------- B: half-turn invariance ----------------
  for (const [name, spec] of Object.entries(SC)) {
    const runs = [];
    for (const rot of [false, true]) { const q = await open(browser, NEW); await q.page.evaluate(SCHEDULE);
      await q.page.evaluate(`window.__ev(${JSON.stringify(BUILD)})(${JSON.stringify(spec)},${rot})`);
      runs.push(await q.page.evaluate(`window.__ev(${JSON.stringify(RUNSC)})(${JSON.stringify(spec)},330)`)); if (q.errors.length) throw new Error(q.errors[0]); await q.ctx.close(); }
    const [A, B] = runs; const W = 768, H = 576; let maxd = 0, worst = -1, moved = 0;
    for (let k = 0; k < A.out.length; k++) {
      if (A.out[k].length !== B.out[k].length) { maxd = Infinity; worst = k; break; }
      for (let i = 0; i < A.out[k].length; i++) { const a = A.out[k][i], b = B.out[k][i];
        const d = Math.max(Math.abs(W - a[0] - a[5] - b[0]), Math.abs(H - a[1] - a[6] - b[1]), Math.abs(-a[2] - b[2]), Math.abs(-a[3] - b[3]));
        if (d > maxd) { maxd = d; worst = k; } }
    }
    for (let k = 0; k < A.out.length; k++) for (let i = 0; i < Math.min(A.out[k].length, A.out[0].length); i++) moved = Math.max(moved, Math.abs(A.out[k][i][0] - A.out[0][i][0]) + Math.abs(A.out[k][i][1] - A.out[0][i][1]));
    let boardOk = true; for (let y = 0; y < 18 && boardOk; y++) for (let x = 0; x < 24; x++) { const a = A.board[y][x], b = B.board[17 - y][23 - x]; const fb = k => { if (!k) return k; const [g, m] = k.split(":"); return (FLIPKEY[g] || g) + ":" + (FLIPKEY[m] || m); }; if ((fb(a) || null) !== (b || null)) { boardOk = false; break; } }
    ok(maxd < 1e-6, `B: ${name}: 330 frames mirror exactly (max difference ${maxd.toExponential(2)} px at frame ${worst}; something moved ${moved.toFixed(0)} px)`);
    ok(boardOk, `B: ${name}: boards end as mirror images`);
    ok(moved > 30, `B: ${name}: the scenario actually moves things`);
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fails.length} failed`); if (fails.length) { console.log(fails.join("\n")); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
