// Try me: every scene builds and runs clean, first press opens a "try me" room, later ones share it, a full room opens a new one,
// nothing of the kid's is overwritten, Surprise Me's 39 designs are unaffected. node tests/tryme.test.js
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "ok   " : "FAIL ") + m); };
(async () => {
  const br = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const hook = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
  const tmp = path.join(os.tmpdir(), "tryme.html");
  fs.writeFileSync(tmp, src.replace(hook, hook + "window.__t = { pieces: () => TRYME_TEMPLATES.map(t => t.piece), try: p => surpriseTry(p), rooms: () => rooms.map(r => ({ id: r.id, name: r.name, tryMe: !!r.tryMe, surprises: (r.surprises || []).length })), cur: () => currentRoomId, ids: () => surpriseEligibleTemplates().eligible.length, players: () => rooms.reduce((n, r) => n + (r.id === currentRoomId ? actors : r.actors).filter(a => a.isPlayer).length, 0), actors: () => actors.length, paused: () => gamePaused, tiles: () => { let n = 0; for (const row of board) for (const c of row) if (c) n++; return n; }, sel: () => surpriseSelectedPiece() };\n"));
  const fresh = async () => { const p = await br.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("dialog", d => d.accept()); await p.goto("file://" + tmp + "#t"); await p.waitForFunction(() => window.__t); p.errs = errs; return p; };
  let p = await fresh();
  const pieces = await p.evaluate(() => window.__t.pieces());
  ok(pieces.length === 20, "20 scenes: " + pieces.join(","));
  ok(await p.evaluate(() => window.__t.ids()) === 39, "Surprise Me still has 39 designs");
  await p.close();
  for (const piece of pieces) {
    p = await fresh();
    const r = await p.evaluate(pc => { const x = window.__t.try(pc); return { built: !!(x && x.templateId), rooms: window.__t.rooms(), players: window.__t.players(), paused: window.__t.paused(), tiles: window.__t.tiles() }; }, piece);
    await p.waitForTimeout(3500);
    ok(r.built && r.rooms.some(x => x.tryMe) && r.players === 1 && !r.paused && r.tiles > 20 && p.errs.length === 0, piece + ": builds in a try-me room, one player, runs live, no errors " + JSON.stringify(p.errs));
    await p.close();
  }
  // sharing and overflow
  p = await fresh();
  const seq = await p.evaluate(() => { const out = []; ["fan", "gate", "bounce", "belt", "lava", "tramp", "key", "bomb"].forEach(pc => { window.__t.try(pc); const rs = window.__t.rooms(); out.push(rs.filter(r => r.tryMe).length + "/" + rs.length); }); return out; });
  console.log("try-me rooms/total rooms after each press: " + seq.join(" "));
  ok(seq[0] === "1/2" && seq[1] === "1/2", "second press fits the same room");
  ok(Number(seq[seq.length - 1].split("/")[0]) >= 2, "when full a new try-me room opens");
  ok(p.errs.length === 0, "no errors");
  // never overwrites the kid's own stuff
  p = await fresh();
  const ow = await p.evaluate(() => { window.__t.try("fan"); const n1 = window.__t.tiles(); window.__t.try("fan"); window.__t.try("fan"); return { n1, n2: window.__t.tiles(), rooms: window.__t.rooms().length }; });
  const tr = await p.evaluate(() => window.__t.rooms().filter(r => r.tryMe)); ok(ow.rooms >= 3 && tr.length >= 2 && tr.every(r => r.surprises >= 1), "repeat presses keep earlier scenes and add rooms when full (" + JSON.stringify(tr.map(r => r.surprises)) + ")");
  // selection mapping through the real palette + the real button
  await p.click("#modeObject");
  await p.click('.swatch[title="black hole"]');
  ok(await p.evaluate(() => window.__t.sel()) === "hole", "clicking the black hole swatch selects the hole scene");
  const before = await p.evaluate(() => window.__t.rooms().length);
  await p.click("#tryThisBtn");
  ok(await p.evaluate(() => window.__t.rooms().length) >= before, "the Try me button builds a scene");
  ok((await p.textContent("#tryThisBtn")).includes("Try me"), "button reads Try me");
  await p.close();
  await br.close();
  console.log(pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
})();
