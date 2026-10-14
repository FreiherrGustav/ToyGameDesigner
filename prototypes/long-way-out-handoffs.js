// Phase 0 throwaway: each hand-off of "The Long Way Out" run N times with start jitter.
// Usage: node prototypes/long-way-out-handoffs.js [runs]
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/opt/node22/lib/node_modules/playwright");
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
if (!src.includes(anchor)) throw new Error("anchor missing");
const HOOK = `window.__t={
 reset:()=>{suppressHistory=true;restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT));suppressHistory=false;
   gravityEnabled=true;for(let x=0;x<24;x++){board[17][x]="solid:none";}},
 paint:(x,y,k,c)=>{board[y][x]=k;if(c)colorBoard[y][x]=c;},
 grav:v=>{gravityEnabled=v},
 actor:(def,x,y,jx)=>{const a=placeCarryableActor(def,x*TILE+16+(jx||0),y*TILE+16);return a},
 tick:(n,dt)=>{for(let i=0;i<n;i++)tick(dt||1/60)},
 on:c=>isChannelOn(c), ch:()=>switchChannels, S:()=>({actors,board}),
 ids:()=>({P:PUSHABLE_DEF_ID,L:LARGE_STONE_DEF_ID,B:CARRY_BOMB2_DEF_ID,T:TILE}),
 sw:(c)=>{switchChannels[c]=!switchChannels[c]},
 touch:a=>checkPhysicsObjectSwitchContacts(a)
};`;
const tmp = path.join(os.tmpdir(), "lwo_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK));
const RUNS = +process.argv[2] || 50, FPS = +process.argv[3] || 60;
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage();
  const errors = []; page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept());
  await page.goto("file://" + tmp); await page.waitForFunction(() => window.__t);
  const res = await page.evaluate(({ RUNS, FPS }) => {
    const T = __t, DT = 1 / FPS, out = {}; const ID = T.ids(), TS = ID.T;
    const stat = a => { const s = a.slice().sort((x, y) => x - y); return a.length ? { n: a.length, min: s[0], med: s[s.length >> 1], max: s[s.length - 1] } : { n: 0 }; };
    // Each case: build(j) -> {watch: fn()->bool, obs: fn()->number}; runs until watch true or maxF frames.
    const cases = {};
    const frameUntil = (cond, maxF) => { for (let f = 1; f <= maxF * FPS / 60; f++) { T.tick(1, DT); if (cond()) return Math.round(f * 1000 / FPS); } return -1; };
    // 1 switch toggle by crate falling on it
    cases.crateOnSwitch = j => { T.paint(5, 16, "pushbutton:none", "red"); const c = T.actor(ID.P, 5, 8, j); return { f: () => frameUntil(() => T.on("red"), 200), end: () => c.x }; };
    // 2 crate falling on plate opens gate
    cases.crateOnPlate = j => { T.paint(5, 16, "plate:none", "red"); T.paint(10, 16, "barrier-n:none", "red"); const c = T.actor(ID.P, 5, 10, j); return { f: () => frameUntil(() => T.on("red"), 200), end: () => c.x }; };
    // 3 open gate releases held crate: gate holds crate at row 10, channel flips, crate falls to floor
    cases.gateReleasesCrate = j => { T.paint(5, 10, "barrier-n:none", "green"); const c = T.actor(ID.P, 5, 9, j); T.tick(40); T.sw("green"); return { f: () => frameUntil(() => c.y > 10 * TS + 20, 200), end: () => c.y }; };
    // 4 crate falls onto conveyor and rides to wall/plate
    cases.conveyorToPlate = j => { for (let x = 2; x <= 9; x++) T.paint(x, 12, "solid:wind-e"); T.paint(10, 12, "plate:none", "blue"); const c = T.actor(ID.P, 3, 8, j); return { f: () => frameUntil(() => T.on("blue"), 900), end: () => c.x }; };
    // 5 fan blows crate across gap (fan at left, gap floor)
    // 5 fan-e pushes a floor crate along the floor onto a Plate inside its 5-tile reach
    cases.fanBlow = j => { for (let x = 0; x <= 14; x++) T.paint(x, 12, "solid:none"); T.paint(2, 11, "fan-e:none"); T.paint(6, 11, "plate:none", "red"); const c = T.actor(ID.P, 3, 10, j); return { f: () => frameUntil(() => T.on("red"), 600), end: () => c.x }; };
    // 6 trampoline launches crate that drops from height onto it, lands on shelf
    // 6 crate rides a conveyor off its end, drops onto a Trampoline one level down, bounces onto a shelf (plate on shelf)
    // 6 crate dropped onto a Trampoline bounces up through a Switch cell (non-blocking) 3 tiles above it
    cases.trampoline = j => { T.paint(5, 16, "trampoline:none"); T.paint(5, 13, "pushbutton:none", "red"); const c = T.actor(ID.P, 5, 7, j); return { f: () => frameUntil(() => T.on("red"), 300), end: () => { T.tick(600); return T.on("red") ? 1 : 0; } }; };
    // 7 crate into cannon (non-player loading) falling from above; measure landing x
    cases.cannonCrate = j => { T.paint(5, 16, "cannon2-ne:none"); const c = T.actor(ID.P, 5, 12, j); let fired = false; return { f: () => frameUntil(() => c.cannonLoad || c.ballistic, 400), end: () => { T.tick(240); return c.x; } }; };
    // 8 cannon-fired crate hits switch far away on floor
    cases.cannonToSwitch = j => { T.paint(5, 16, "cannon2-ne:none"); T.paint(14, 16, "pushbutton:none", "red"); const c = T.actor(ID.P, 5, 12, j); return { f: () => frameUntil(() => T.on("red"), 600), end: () => c.x }; };
    // 9 bomb falls >6 tiles and detonates, clears diggable
    cases.bombFallDiggable = j => { T.paint(5, 16, "solid:diggable"); const b = T.actor(ID.B, 5, 6, j); return { f: () => frameUntil(() => !T.S().actors.includes(b) || T.S().board[16][5] == null, 300), end: () => (T.S().board[16][5] == null ? 1 : 0) }; };
    // 10 bomb blast detonates neighbor bomb (chain) then clears diggable below second
    // 10 bomb A lands (fall >6 tiles), blast chains to resting bomb B, B's blast clears the diggable beside it
    // 10 bomb A lands (fall >6 tiles), blast chains to resting bomb B (roof above B so A cannot land on it), B's blast clears the diggable beside it
    cases.bombChain = j => { T.paint(7, 16, "solid:diggable"); T.paint(6, 15, "solid:none"); const b = T.actor(ID.B, 6, 16, j); T.tick(30); const a = T.actor(ID.B, 5, 5, j); return { f: () => frameUntil(() => T.S().board[16][7] == null, 400), end: () => (T.S().board[15][6] == null ? 1 : 0) }; };
    // 11 large stone onto plate
    cases.stoneOnPlate = j => { T.paint(5, 16, "plate:none", "red"); const s = T.actor(ID.L, 5, 8, j); return { f: () => frameUntil(() => T.on("red"), 200), end: () => s.x }; };
    // 12 magnet pulls crate across floor to a plate
    // 12 magnet (same row) pulls a floor crate onto a Plate beside it
    cases.magnetPull = j => { T.paint(12, 16, "magnet:none"); T.paint(11, 16, "plate:none", "blue"); const c = T.actor(ID.P, 9, 15, j); return { f: () => frameUntil(() => T.on("blue"), 900), end: () => c.x }; };
    // 13 slippery floor carries crate: sliding crate pushed by... crate falls on slippery slope? (no slope) -> test: crate dropped on slippery with horizontal wind
    // 13 fan-e + slippery floor: crate slides further, reaches Plate at col 9
    cases.slipperyWind = j => { for (let x = 2; x <= 12; x++) T.paint(x, 12, "solid:slippery"); T.paint(9, 11, "plate:none", "red"); T.paint(2, 11, "fan-e:none"); const c = T.actor(ID.P, 3, 9, j); return { f: () => frameUntil(() => T.on("red"), 900), end: () => c.x }; };
    // 14 black hole swallows a crate
    cases.blackHole = j => { T.paint(8, 15, "gravitywell:none"); const c = T.actor(ID.P, 5, 15, j); return { f: () => frameUntil(() => c.destroyed || !T.S().actors.includes(c), 600), end: () => c.x }; };
    // 15 switch flipped twice
    cases.switchTwice = j => { T.paint(5, 16, "pushbutton:none", "red"); const c = T.actor(ID.P, 5, 12, j); T.tick(60); const a = T.on("red"); c.x += 200; T.tick(30); c.x = 5 * TS + 16 - c.w / 2; c.y = 12 * TS; T.tick(60); return { f: () => (a && !T.on("red") ? 1 : -1), end: () => 0 }; };
    // 16 gate re-closes on crate (channel off while crate in cell)
    cases.gateClosesOnCrate = j => { T.paint(5, 12, "barrier-n:none", "green"); T.sw("green"); const c = T.actor(ID.P, 5, 10, j); T.tick(30); T.sw("green"); T.tick(60); return { f: () => 1, end: () => c.y }; };
    for (const k of Object.keys(cases)) {
      const frames = [], ends = []; let miss = 0;
      for (let r = 0; r < RUNS; r++) {
        T.reset(); const j = ((r % 7) - 3) * 1.5 + (r % 3) * 0.37; // sub-pixel/pixel start jitter, deterministic
        try { const c = cases[k](j); const f = c.f(); if (f < 0) miss++; else frames.push(f); ends.push(+(c.end() || 0)); } catch (e) { miss++; out[k + "_err"] = String(e); }
      }
      out[k] = { miss, frames: stat(frames), end: stat(ends) };
    }
    return out;
  }, { RUNS, FPS });
  for (const [k, v] of Object.entries(res)) console.log(k.padEnd(20), JSON.stringify(v));
  console.log("page errors:", errors.length, errors.slice(0, 3));
  await browser.close();
})();
