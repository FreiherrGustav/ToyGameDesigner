// Surprise Me v2.50 suite (not deployed). Usage: node tests/surprise2.test.js [stage] [mixSeeds]
// Temp hooked copy of index.html (the repo file stays clean). Stage 1: metadata, mix, recency, selfStart, multi-room.
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const MIX = Number(process.argv[3] || 1000);
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = require("./surprise.hook.js")() + `
  window.__st = {
    reset: keep => { suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false; if (!keep) surpriseRecent.length = 0; },
    templates: () => SURPRISE_TEMPLATES.map(t => ({ id: t.id, category: t.category, closed: t.closed, stooge: t.stooge, room: t.room || null, expect: t.expect || null, nonsense: !!t.nonsense, legend: t.legend || null, rows: t.rows || null, rooms: t.rooms || null, requires: t.requires, names: t.names, discover: t.discover })),
    eligible: () => surpriseEligibleTemplates(),
    gen: (seed, o) => generateSurprise(seed, o), press: (seed, o) => surpriseMe(seed, o),
    play: () => enterPlayMode(), stop: () => exitToBuildMode(),
    state: () => ({ actors, board, rooms, currentRoomId, playerRoomId, gravity: gravityEnabled, wrapH: wrapHEnabled, wrapV: wrapVEnabled, doorLinks }),
    snapshot: () => captureProjectSnapshot(), room: () => { snapshotCurrentRoomState(); return rooms.find(r => r.id === currentRoomId); },
    recent: () => surpriseRecent.slice(), pushTemplate: t => SURPRISE_TEMPLATES.push(t), popTemplate: () => SURPRISE_TEMPLATES.pop(),
    weights: () => SURPRISE_CATEGORY_WEIGHTS, defs: () => actorDefs
  };
`;
const tmp = path.join(os.tmpdir(), "surprise2_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK));
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; console.log("ok  ", m); } else { fails.push(m); console.log("FAIL", m); } };
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept());
  await page.goto("file://" + tmp + "#t"); await page.waitForFunction(() => window.__st);
  const T = await page.evaluate(() => __st.templates());
  const elig = await page.evaluate(() => __st.eligible());
  console.log("templates:", T.length, "skipped:", JSON.stringify(elig.skipped));

  // ---- A. metadata ----
  const CATS = ["loop", "vignette", "room", "toy", "nonsense"];
  const blockingPiece = n => /^(wall|bounce|slick|sticky|tramp|magnet|bomb|fan|gate|belt|spawner|spawnerc|cannon)(:|$)/.test(n);
  for (const t of T) {
    const parts = t.rooms || [{ rows: t.rows, legend: t.legend, room: t.room }];
    ok(CATS.includes(t.category), t.id + ": category " + t.category);
    ok(typeof t.closed === "boolean", t.id + ": closed declared");
    parts.forEach((p, i) => {
      ok(p.room && ["on", "off", "either"].includes(p.room.gravity), t.id + "[" + i + "]: room.gravity");
      ok(p.room && [true, false, "maybe"].includes(p.room.wrapH) && [true, false, "maybe"].includes(p.room.wrapV), t.id + "[" + i + "]: room wrap rules");
      if (p.room.gravity === "either") ok(["on", "off"].includes(p.room.native), t.id + ": native gravity named");
      const w = p.rows[0].length; ok(p.rows.every(r => r.length === w), t.id + "[" + i + "]: rows rectangular");
      ok(p.rows.join("").split("").every(c => c === "." || p.legend[c]), t.id + "[" + i + "]: every char is in the legend");
    });
    if (!t.rooms) {
      const rows = t.rows, h = rows.length, w = rows[0].length;
      const border = []; for (let x = 0; x < w; x++) { border.push(rows[0][x]); border.push(rows[h - 1][x]); } for (let y = 0; y < h; y++) { border.push(rows[y][0]); border.push(rows[y][w - 1]); }
      const sealed = border.every(c => c !== "." && blockingPiece(t.legend[c]));
      ok(sealed === t.closed, t.id + ": closed flag (" + t.closed + ") agrees with the layout (sealed=" + sealed + ")");
    }
    if (t.category !== "toy") { // the stooge rule
      const chars = (t.stooge || "").split("");
      const has = chars.some(c => { const n = t.legend && t.legend[c]; return n && /^(player|playerplate|pet|pet\*|chaser)$/.test(n) && t.rows.some(r => r.includes(c)); });
      ok(has, t.id + ": a character is in the way (stooge " + t.stooge + ")");
    }
    if (t.category === "loop" || t.category === "vignette") ok(t.expect && t.expect.selfStart === true, t.id + ": expect.selfStart declared");
    if (t.category === "toy") ok(t.expect && t.expect.needsInput === true, t.id + ": toy is labelled needsInput");
    // spawner templates need a sink
    if (t.rows && Object.values(t.legend).some(n => /^spawner/.test(n))) {
      const sink = Object.values(t.legend).some(n => n === "lava" || n === "hole") || t.room.wrapH === true || t.room.wrapV === true;
      ok(sink, t.id + ": spawner has a sink (lava, black hole or required wrap)");
    }
  }
  const closedN = T.filter(t => t.closed).length;
  ok(closedN / T.length <= 1 / 3 + 1e-9, "closed share " + closedN + "/" + T.length + " <= one third");
  const closedElig = elig.eligible.filter(t => t.closed).length;
  ok(closedElig / elig.eligible.length <= 1 / 3 + 1e-9, "closed share of ELIGIBLE " + closedElig + "/" + elig.eligible.length);

  // ---- B. category mix and recency over MIX presses (chained, as a kid would press) ----
  const mix = await page.evaluate((n) => {
    __st.reset();
    const recent = [], cats = {}, per = {}; let repeats = 0, fails = 0;
    for (let i = 0; i < n; i++) {
      const g = __st.gen(100 + i, { avoid: recent.slice() });
      if (!g || g.failed || g.noRoom) { fails++; continue; }
      if (recent.includes(g.templateId)) repeats++;
      recent.push(g.templateId); if (recent.length > 5) recent.shift();
      cats[g.category] = (cats[g.category] || 0) + 1; per[g.templateId] = (per[g.templateId] || 0) + 1;
    }
    return { cats, per, repeats, fails, pool: __st.eligible().eligible.length };
  }, MIX);
  console.log("mix over", MIX, JSON.stringify(mix.cats), "per template", JSON.stringify(mix.per));
  console.log("target mix (weights):", JSON.stringify(await page.evaluate(() => __st.weights())));
  ok(mix.repeats === 0, "no template repeats within any 5 consecutive presses (" + mix.repeats + " repeats)");
  ok(mix.fails === 0, "no generator failures in the mix run (" + mix.fails + ")");
  // small pool: with 3 eligible templates the OLDEST is the only one allowed to repeat
  const small = await page.evaluate(() => {
    const ids = ["pinball", "fanclub", "magnet"], seq = [], recent = [];
    for (let i = 0; i < 30; i++) { const g = __st.gen(900 + i, { templateIds: ids, avoid: recent.slice() }); seq.push(g.templateId); recent.push(g.templateId); if (recent.length > 5) recent.shift(); }
    let bad = 0; for (let i = 3; i < seq.length; i++) if (seq[i] !== seq[i - 3]) bad++; // round-robin: each one repeats only after the other two
    return { seq: seq.slice(0, 9), bad };
  });
  ok(small.bad === 0, "with fewer than 6 eligible, only the oldest repeats " + JSON.stringify(small.seq));
  // a given seed always rebuilds the same thing, whatever was pressed before
  const det = await page.evaluate(() => { __st.reset(); const a = __st.press(4821).templateId; __st.reset(true); __st.press(1); __st.reset(true); const b = __st.press(4821).templateId; return a === b && __st.recent().length >= 2; });
  ok(det, "gen(seed) is independent of the recent list (explicit seeds replay exactly)");
  const dice = await page.evaluate(() => { __st.reset(); const seen = []; for (let i = 0; i < 14; i++) { __st.reset(true); const r = __st.press(); if (r && r.pending) { document.getElementById("surpriseFullOverlay").remove(); break; } seen.push(r.templateId); } let bad = 0; for (let i = 0; i < seen.length; i++) for (let j = Math.max(0, i - 5); j < i; j++) if (seen[i] === seen[j]) bad++; return { n: seen.length, bad, recent: __st.recent() }; });
  ok(dice.bad === 0 && dice.n >= 6, "real dice presses never repeat within 5 " + JSON.stringify(dice));

  // ---- C. self-start: an idle player sees an interaction within 3 s ----
  const SELF = T.filter(t => t.category === "loop" || t.category === "vignette");
  for (const t of SELF) {
    for (const mode of ["canonical", "chaos"]) {
      let okN = 0, n = 0; const firsts = [];
      for (let k = 0; k < 8; k++) {
        await page.goto("file://" + tmp + "#t"); await page.waitForFunction(() => window.__st); // a fresh page per run: Play sessions can leak transient state into the next one
        const r = await page.evaluate(({ id, seed, canon }) => {
          __st.reset();
          const rep = __st.press(seed, canon ? { templateId: id, chaos: false, canonical: true } : { templateId: id });
          if (!rep || !rep.templateId) return { built: false };
          __st.play(); __iaStart(); __iaTick(180); const ia = __iaStop(); __st.stop();
          const types = Object.keys(ia.counts).filter(x => x !== "spawn");
          return { built: true, types, first: Math.min(...types.map(x => ia.first[x]), 9999), all: ia.counts, wrap: rep.wrapH + "/" + rep.wrapV, grav: rep.gravity };
        }, { id: t.id, seed: 3000 + k * 53, canon: mode === "canonical" });
        n++; if (r.built && r.types.length) { okN++; firsts.push(r.first); } else console.log("   no interaction:", t.id, mode, JSON.stringify(r));
      }
      console.log("selfStart", t.id, mode, okN + "/" + n, "first interaction frames:", firsts.join(","));
      ok(okN === n, "selfStart " + t.id + " (" + mode + ") " + okN + "/" + n);
    }
  }

  // ---- D. wrap rules are part of the template ----
  const wr = await page.evaluate((ids) => {
    const out = [];
    for (const id of ids) { const t = __st.gen(77, { templateId: id }); }
    return out;
  }, []);
  for (const t of T.filter(x => x.room)) {
    const r = await page.evaluate(({ id }) => {
      let h = 0, v = 0, gflip = 0, n = 60;
      for (let s = 1; s <= n; s++) { __st.reset(); const rep = __st.press(s, { templateId: id }); if (rep.wrapH) h++; if (rep.wrapV) v++; if (rep.gravityFlipped) gflip++; }
      return { h, v, gflip, n };
    }, { id: t.id });
    const R = t.room;
    if (R.wrapH === false) ok(r.h === 0, t.id + ": wrapH false is never rolled on"); if (R.wrapH === true) ok(r.h === r.n, t.id + ": wrapH true always");
    if (R.wrapV === false) ok(r.v === 0, t.id + ": wrapV false never"); if (R.wrapV === true) ok(r.v === r.n, t.id + ": wrapV true always");
    if (R.gravity !== "either") ok(r.gflip === 0, t.id + ": required gravity is never flipped");
  }

  // ---- E. multi-room template: parts joined by doors ----
  await page.evaluate(() => __st.pushTemplate({ id: "twoRoomTest", category: "vignette", closed: false, stooge: "P", names: ["Test Hall"], requires: [],
    room: { gravity: "on", wrapH: false, wrapV: false }, discover: "o", expect: { needsInput: true },
    rooms: [
      { room: { gravity: "on", wrapH: false, wrapV: false }, legend: { "=": "wall", P: "player", D: "door:1", o: "reward" }, rows: ["............", "............", "..P......D.o", "============"] },
      { room: { gravity: "off", wrapH: false, wrapV: true }, legend: { "#": "wall", D: "door:1", w: "pet" }, rows: ["########", "#D....w#", "########"] }
    ] }));
  const mr = await page.evaluate(() => {
    __st.reset(); const rep = __st.press(555, { templateId: "twoRoomTest" });
    const st = __st.state(); const out = { rep: rep && { rooms: rep.roomIds, tpl: rep.templateId }, nRooms: st.rooms.length };
    out.links = Object.keys(st.doorLinks).length; out.back = Object.entries(st.doorLinks).every(([k, v]) => { const back = st.doorLinks[v.toRoomId + ":" + v.toX + "," + v.toY]; const [rid, xy] = k.split(":"); return back && back.toRoomId === +rid && (back.toX + "," + back.toY) === xy; });
    out.grav = st.rooms.map(r => r.gravityEnabled); out.wrapV = st.rooms.map(r => r.wrapVEnabled); out.players = st.rooms.flatMap(r => r.actors.filter(a => a.isPlayer)).length;
    out.current = st.currentRoomId === rep.roomIds[0];
    // non-empty room: both parts land in NEW rooms and the old room is untouched
    __st.reset(); for (let x = 0; x < 24; x++) for (let y = 0; y < 18; y++) if ((x + y) % 2 === 0) __st.state().board[y][x] = "solid:none";
    const before = JSON.stringify(__st.state().board); const r2 = __st.press(556, { templateId: "twoRoomTest", full: "new" });
    out.newRooms = __st.state().rooms.length; out.oldKept = JSON.stringify(__st.snapshot().rooms[0].board) === before;
    __st.play(); __iaTick(60); __st.stop();
    return out;
  });
  console.log("multi-room:", JSON.stringify(mr));
  await page.evaluate(() => __st.popTemplate());
  ok(mr.nRooms === 2 && mr.links === 2 && mr.back, "two parts -> two rooms joined by a door pair, linked both ways");
  ok(JSON.stringify(mr.grav) === "[true,false]" && JSON.stringify(mr.wrapV) === "[false,true]", "each part has its own room rules");
  ok(mr.players === 1 && mr.current, "one player, and the editor stays on the first part");
  ok(mr.newRooms === 3 && mr.oldKept, "into a non-empty room: new tabs, existing room untouched");

  ok(errors.length === 0, "no page errors " + errors.slice(0, 3).join(" | "));
  await browser.close();
  console.log("\n" + pass + " passed, " + fails.length + " failed");
  if (fails.length) { console.log(fails.join("\n")); process.exit(1); }
})();
