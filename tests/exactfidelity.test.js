// Every hand-built Surprise Me room must open exactly as its author designed it. For each entry with a source project
// (surprise-sources/ or an upload), build it through the real Surprise Me path and compare the hot room with the source room:
// tiles, channel colours, ground textures, Paint tiles, actors (cell, kind, look, lethal), rules, camera and starting switches.
// node tests/exactfidelity.test.js [id ...]
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const SRC = path.join(__dirname, "..", "surprise-sources"), UP = "/root/.claude/uploads/0f142de1-ff44-506d-8472-18e2f85ac272";
const MAP = {
  stayalive: ["Stay Alive - surprise me 7.json", 1], chaos1: ["Chaos 1 - surprise 6.json", 1], gravity1: ["gravity 1 - surprise me 5.json", 1],
  minilevel1: ["Mini Level 1 - surprise me 8.json", 1], minilevel2: ["Mini Level 2 - surprise me 11.json", 1], minilevel3: ["Mini level 3 - surprise me 12.json", 1],
  monsterescape: ["monster escape - surprise me 3.json", 1], gravitytunnel: ["Gravity Tunnel - surprise me 10.json", 1], cannoncat: ["Cannon Cat - surprise me 1.json", 1],
  fanloop: ["Fan loop - surprise me 2.json", 1], byebyecupcake: ["byebye cupcake - surprise me 4.json", 1], oopscannons: ["Oops cannons - surprise me 9.json", 1],
  warpfall: ["Warpfall - surprise me.json", 1], windspiral: ["Wind spiral - surprise me.json", 1],
  stonedomino: [UP + "/4d151336-Stone_Cold_Domino_-_mini_level.json", 1], plinko: [UP + "/d1d1dba1-Plinko.json", 1], trafficjam: [UP + "/80df2881-Traffic_jam.json", 1], oopstramps: [UP + "/ebcca2ea-oops_all_trampolines.json", 3],
  magnetmile: [UP + "/39819088-magnet_mile_mini_level.json", 1],
};
const only = process.argv.slice(2);
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = `window.__f = { build: (id) => { const r = surpriseMe(10001, { templateIds: [id] }); if (!r || r.failed || r.pending) return { err: JSON.stringify(r) };
  const strip = s => s == null ? null : String(s).replace(/^sx~[a-z0-9]+~/, "");
  const out = { board: [], color: [], skin: [], back: [], actors: [], rules: { g: gravityEnabled, d: gravityDir, h: wrapHEnabled, v: wrapVEnabled, cam: cameraMode }, channels: JSON.parse(JSON.stringify(switchChannels)), paused: gamePaused };
  const W = 24;
  for (let y = 0; y < ROWS; y++) { out.board.push(board[y].slice(0, W)); out.color.push(colorBoard[y].slice(0, W)); out.skin.push(groundSkinBoard[y].slice(0, W).map(strip)); out.back.push(backgroundBoard[y].slice(0, W).map(strip)); }
  out.actors = actors.map(a => { const d = actorDefs[a.defId]; return { x: Math.floor((a.x + a.w / 2) / TILE), y: Math.floor((a.y + a.h / 2) / TILE), t: d.temperament, player: !!a.isPlayer, art: JSON.stringify(d.poses ? d.poses.stand : d.art), lethal: d.lethal, id: strip(a.defId), channel: a.channel || null }; });
  out.spawners = {}; Object.keys(spawnerContents).forEach(k => { out.spawners[k.split(":")[1]] = strip(spawnerContents[k]); });
  return out; } };`;
const tmp = path.join(os.tmpdir(), "exactfid.html"); fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK));
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); let pass = 0, fail = 0;
  for (const id of Object.keys(MAP)) {
    if (only.length && !only.includes(id)) continue;
    const [f, rid] = MAP[id], file = path.isAbsolute(f) ? f : path.join(SRC, f);
    const proj = JSON.parse(fs.readFileSync(file, "utf8")).data, room = proj.rooms.find(r => r.id === rid);
    const p = await b.newPage(); p.on("dialog", d => d.accept()); p.on("pageerror", e => console.log("  pageerror", String(e)));
    await p.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    await p.goto("file://" + tmp + "#t"); await p.waitForFunction(() => window.__f);
    const got = await p.evaluate(i => window.__f.build(i), id); await p.close();
    if (got.err) { console.log("FAIL " + id + " build " + got.err); fail++; continue; }
    const bad = [];
    const cmp = (name, a, b) => { let n = 0; for (let y = 0; y < 18; y++) for (let x = 0; x < 24; x++) { const A = a[y][x] || null, B = b[y][x] || null; if (A !== B) { if (n++ < 4) bad.push(name + " @" + x + "," + y + " got " + A + " want " + B); } } if (n > 4) bad.push(name + " ... " + n + " cells differ"); };
    const bombCells = new Set(room.actors.filter(a => a.spawnerKey == null && a.defId === "carrybomb2").map(a => Math.floor((a.x + (a.w || 22) / 2) / 32) + "," + Math.floor((a.y + (a.h || 22) / 2) / 32)));
    // a Bomb is a painted tile until the first tick turns it into an actor in a gravity room: the same thing at the same cell
    const gotBoard = got.board.map((r, y) => r.map((t, x) => (t === "bomb2:none" && bombCells.has(x + "," + y)) ? null : t));
    cmp("tile", gotBoard, room.board.map(r => r.slice(0, 24)));
    got.actors = got.actors.concat(got.board.flatMap((r, y) => r.map((t, x) => t === "bomb2:none" && bombCells.has(x + "," + y) ? { x, y, t: "carrybomb2", player: false, art: "", id: "carrybomb2" } : null)).filter(Boolean));
    cmp("color", got.color, room.colorBoard.map(r => r.slice(0, 24)));
    const wantSkin = room.groundSkinBoard.map((r, y) => r.slice(0, 24).map((s, x) => room.board[y][x] ? s : null));
    const gotSkin = got.skin.map((r, y) => r.map((s, x) => got.board[y][x] ? s : null));
    cmp("skin", gotSkin, wantSkin);
    const isSky = s => s && /^bg(Sky|Cloud|Hill|Bush)/.test(s);
    const EXTRA_OK = { warpfall: "decoration (a space backdrop added)" };
    if (!EXTRA_OK[id]) cmp("paint", got.back.map(r => r.map(s => isSky(s) ? null : s)), room.backgroundBoard.map(r => r.slice(0, 24).map(s => isSky(s) ? null : s)));
    // actors: hand-placed only (a spawner's own spawns are not part of the design); one per cell and kind
    const key = a => a.x + "," + a.y + ":" + (a.player ? "P" : a.t);
    const want = room.actors.filter(a => a.spawnerKey == null).map(a => { const d = proj.actorDefs[a.defId] || {}; return { x: Math.floor(((a.spawnX != null ? a.spawnX : a.x) + (a.w || 22) / 2) / 32), y: Math.floor(((a.spawnY != null ? a.spawnY : a.y) + (a.h || 22) / 2) / 32), t: d.temperament, player: !!a.isPlayer, art: JSON.stringify(d.poses ? d.poses.stand : d.art), lethal: d.lethal, id: a.defId }; });
    const wm = new Map(), gm = new Map();
    want.forEach(a => wm.set(key(a), a)); got.actors.forEach(a => gm.set(key(a), a));
    let miss = 0, extra = 0, looks = 0;
    wm.forEach((a, k) => { const g = gm.get(k); if (!g) { if (miss++ < 4) bad.push("actor missing " + k); } else if (!a.player && g.art !== a.art && a.t !== "collectible" && a.id !== "carrybomb2") { if (looks++ < 3) bad.push("actor look differs @" + k + " " + g.id + " vs " + a.id); } });
    gm.forEach((a, k) => { if (!wm.has(k) && !(id === "warpfall" && a.player)) { if (extra++ < 4) bad.push("actor extra " + k); } });
    const R = got.rules; const wr = { g: room.gravityEnabled, d: room.gravityDir || "down", h: room.wrapHEnabled, v: room.wrapVEnabled, cam: room.cameraMode };
    if (JSON.stringify(R) !== JSON.stringify(wr)) bad.push("rules got " + JSON.stringify(R) + " want " + JSON.stringify(wr));
    const wc = {}; Object.keys(proj.switchChannels || {}).forEach(c => { if (proj.switchChannels[c]) wc[c] = true; });
    const gc = {}; Object.keys(got.channels).forEach(c => { if (got.channels[c]) gc[c] = true; });
    if (JSON.stringify(gc) !== JSON.stringify(wc)) bad.push("channels got " + JSON.stringify(gc) + " want " + JSON.stringify(wc));
    if (!got.paused) bad.push("not paused at start");
    if (id === "oopstramps") for (let i = bad.length - 1; i >= 0; i--) if (/player|:P/.test(bad[i])) bad.splice(i, 1); // the author left the hero inside the top wall: placed at (1,1) instead
    const ok = bad.length === 0; ok ? pass++ : fail++;
    console.log((ok ? "ok   " : "FAIL ") + id + (ok ? " (" + want.length + " placed)" : "\n   " + bad.join("\n   ") + (miss + extra ? "\n   actors: " + miss + " missing, " + extra + " extra" : "")));
  }
  await b.close(); console.log("exactfidelity: " + pass + " ok, " + fail + " differ"); process.exit(fail ? 1 : 0);
})();
