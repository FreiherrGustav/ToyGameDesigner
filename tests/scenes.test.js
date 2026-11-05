// Surprise Me v2.56 Stage B: scenes (a primary plus fillers), the fixed inventory, recency over fillers, and the filler-safety fuzz.
// usage: node tests/scenes.test.js [structSeeds=1000] [fuzzPerTemplate=12] [section: all|inv|struct|press|fuzz]
// Temp hooked copy of index.html (the repo file stays clean).
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const NS = Number(process.argv[2] || 1000), NF = Number(process.argv[3] || 12), SEC = process.argv[4] || "all";
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = require("./causal.hook.js")() + `
  window.__sc = {
    reset: () => { suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false; surpriseRecent.length = 0; surpriseRecentVariants.length = 0; },
    press: (seed, o) => { surpriseRecent.length = 0; surpriseRecentVariants.length = 0; return surpriseMe(seed, Object.assign({ recent: false }, o || {})); },
    pressKeep: (seed, o) => surpriseMe(seed, o), undo: () => performUndo(),
    snapshot: () => captureProjectSnapshot(), room: () => { snapshotCurrentRoomState(); return rooms.find(r => r.id === currentRoomId); },
    state: () => ({ actors, board, gravity: gravityEnabled, dir: gravityDir, wrapH: wrapHEnabled, wrapV: wrapVEnabled, rooms: rooms.length }),
    kit: () => surpriseKit(), fixed: () => surpriseFixedInventory(),
    addCustomPet: () => { const id = "customZ"; actorDefs[id] = structuredClone(actorDefs[defaultDefIdForKind("wanderer")]); actorDefs[id].name = "mine"; customActorSlotIds.push(id); const k = surpriseKit(); return k.pets.includes(id) || k.walkers.includes(id) || k.chasers.includes(id); },
    freshPress: seed => { suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false; const r = surpriseMe(seed, { recent: true }); return r; },
    forced: (seed, id, scene) => { suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false; surpriseRecent.length = 0; surpriseRecentVariants.length = 0; return surpriseMe(seed, { templateId: id, recent: false, scene, chaos: true }); },
    loadSample: fn => loadExampleGame(fn, "t", { skipConfirm: true }), builders: () => ({ rb: buildRockBottomGame, cc: buildCrystalCaveRunnerGame, ice: buildIceCaveGame }),
    base: () => ({ actors: Object.keys(FACTORY_DEFAULT_SNAPSHOT.actorDefs), skins: GROUND_SEEDS.map(x => x.id).concat(LETHAL_SEEDS.map(x => x.id)), tiles: Object.keys(GAMEPLAY_TILE_DEFS) }),
    templates: () => SURPRISE_TEMPLATES.map(t => ({ id: t.id, category: t.category, filler: !!t.filler, strip: !!t.strip, parts: (t.rooms || [t]).map(p => ({ legend: p.legend, room: p.room, rows: p.rows })) })),
    gen: (seed, o) => { const spec = generateSurprise(seed, o); if (!spec || spec.noRoom || spec.failed) return { fail: true };
      const sum = s => ({ id: s.templateId, rect: { x: s.ox, y: s.oy, w: s.w, h: s.h }, dir: s.dir, gravity: s.gravity, wrapH: s.wrapH, wrapV: s.wrapV, player: !!s.player, spawners: s.spawners.length, filler: !!s.filler,
        colors: Array.from(new Set(s.tiles.map(t => t.color).filter(Boolean))), actors: s.actors.map(a => a.defId), content: s.spawners.map(p => p.content).filter(Boolean), skins: s.tiles.map(t => t.skin).filter(Boolean), extra: (s.extra || []).length,
        tiles: s.tiles.map(t => t.key), variant: s.variant });
      return Object.assign(sum(spec), { fillers: (spec.fillers || []).map(sum) }); },
    emptyGen: (seed, o) => window.__sc.gen(seed, Object.assign({ ctx: surpriseEmptyContext(), place: "free" }, o || {})),
    play: () => { enterPlayMode(); tick(1 / 60); window.__czStart(); }, tick: n => window.__czTick(n), stop: () => window.__czStop(), exit: () => exitToBuildMode(),
  };
`;
const tmp = path.join(os.tmpdir(), "scenes_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK));
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; console.log("ok  ", m); } else { fails.push(m); console.log("FAIL", m); } };
const MECH = { plateOn: "plate", plateOff: "plate", gateOpen: "gate", gateClose: "gate", buttonPress: "button", gravityFlip: "gravity", cannonLoad: "cannon", cannonFire: "cannon", bombArm: "bomb", impact: "bomb", detonate: "bomb", blastClear: "bomb", fanLift: "fan", fanPush: "fan", trampolineLaunch: "trampoline", spawn: "spawner" };
function honestSteps(path) { const st = []; for (const e of path) { const m = MECH[e.type]; if (!m) continue; if (st.length && st[st.length - 1] === m) continue; if (st.includes(m)) break; st.push(m); } return st; }
// the honest paths of a run, only those that touch `rect` (grown by 1): a filler's own chain must not make the primary look fine
function primaryPaths(events, rect) {
  const by = new Map(events.map(e => [e.id, e])), has = new Set(); events.forEach(e => { if (e.cause != null && by.has(e.cause)) has.add(e.cause); });
  const inR = e => e.cx != null && e.cx >= rect.x - 1 && e.cx <= rect.x + rect.w && e.cy >= rect.y - 1 && e.cy <= rect.y + rect.h;
  const out = [];
  for (const e of events) { if (has.has(e.id)) continue; const p = []; let c = e; while (c && p.length < 500) { p.push(c); c = c.cause != null ? by.get(c.cause) : null; } p.reverse();
    if (!p.some(inR) && p.some(x => x.cx != null)) continue; out.push(honestSteps(p)); }
  return out;
}
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const mk = async () => { const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } }); const page = await ctx.newPage(); const errs = []; page.on("dialog", d => d.accept()); page.on("pageerror", e => errs.push(String(e))); await page.goto("file://" + tmp + "#t"); await page.waitForFunction(() => window.__sc); return { ctx, page, errs }; };
  const T = (await (async () => { const { ctx, page } = await mk(); const r = await page.evaluate(() => window.__sc.templates()); await ctx.close(); return r; })());

  if (SEC === "all" || SEC === "inv") {
    console.log("\n== A. fixed inventory ==");
    const { ctx, page, errs } = await mk();
    const base = await page.evaluate(() => window.__sc.base());
    // every actor and tile a template legend names is part of the base game
    const badLegend = [];
    T.forEach(t => t.parts.forEach(p => Object.values(p.legend).forEach(n => n.split("&").forEach(q => {
      if (q.startsWith("actor|") && !q.startsWith("actor|@") && !base.actors.includes(q.slice(6))) badLegend.push(t.id + " " + q);
      if (q.startsWith("raw|") && !base.tiles.includes(q.slice(4))) badLegend.push(t.id + " " + q);
    }))));
    ok(badLegend.length === 0, "every actor| / raw| piece in every template is a base-game def or tile (" + (badLegend.join(", ") || "none odd") + ")");
    const kitCheck = async label => {
      const k = await page.evaluate(() => ({ kit: window.__sc.kit(), fixed: window.__sc.fixed() }));
      const allowed = new Set(base.actors.concat(base.skins));
      const odd = [].concat(k.kit.skins, k.kit.pets, k.kit.chasers, k.kit.rewards, k.kit.balls).filter(id => !allowed.has(id));
      ok(odd.length === 0, label + ": the kit holds only base-game ids" + (odd.length ? " (odd: " + odd.join(",") + ")" : ""));
      ok(k.kit.skins.every(id => k.fixed.skins.includes(id)) && k.kit.rewards.every(id => k.fixed.rewards.includes(id)), label + ": skins and rewards come from the fixed lists");
    };
    await kitCheck("fresh project");
    for (const [key, name] of [["rb", "Rock Bottom"], ["cc", "Crystal Cave Runner"], ["ice", "The Ice Cave"]]) {
      await page.evaluate(k => window.__sc.loadSample(window.__sc.builders()[k]), key);
      await kitCheck("after loading " + name);
      // a press in that project uses only base pieces
      const bad = await page.evaluate(() => { const B = window.__sc.base(); const al = new Set(B.actors.concat(B.skins)); const odd = []; for (let s = 1; s <= 120; s++) { const r = window.__sc.emptyGen(s); if (r.fail) continue; [r].concat(r.fillers).forEach(x => x.actors.concat(x.content, x.skins).forEach(id => { if (!String(id).startsWith("sx~") && !al.has(String(id).replace(/^sp~\w+~/, ""))) odd.push(x.id + ":" + id); })); } return odd.slice(0, 5); });
      ok(bad.length === 0, "120 scenes after loading " + name + " use only base-game actors and textures" + (bad.length ? " (odd " + bad.join(",") + ")" : ""));
    }
    await page.evaluate(() => { window.__sc.reset(); });
    // the player's look is a base preset (already true) and a custom character is never cast
    const custom = await page.evaluate(() => { window.__sc.reset(); return window.__sc.addCustomPet(); });
    ok(!custom, "a kid's own custom character is never in the kit");
    ok(errs.length === 0, "no page errors (" + errs.join("; ") + ")");
    await ctx.close();
  }

  if (SEC === "all" || SEC === "struct") {
    console.log("\n== B. scene structure over " + NS + " seeds (empty room, recency chained like presses) ==");
    const { ctx, page, errs } = await mk();
    const res = await page.evaluate(n => { const out = [], recent = [], pres = []; for (let seed = 1; seed <= n; seed++) { const r = window.__sc.emptyGen(seed, { avoid: recent.slice() }); out.push(Object.assign({ seed, recentBefore: recent.slice() }, r)); if (r.fail) continue; const ids = [r.id].concat(r.fillers.map(f => f.id)); ids.forEach(i => recent.push(i)); pres.push(ids.length); while (pres.length > 5) recent.splice(0, pres.shift()); } return out; }, NS);
    const good = res.filter(r => !r.fail);
    ok(good.length === NS, "every seed builds (" + good.length + "/" + NS + ")");
    const gap = (a, b) => a.x + a.w + 1 <= b.x || b.x + b.w + 1 <= a.x || a.y + a.h + 1 <= b.y || b.y + b.h + 1 <= a.y; // at least one empty tile between
    const issues = { overlap: 0, player: 0, spawner: 0, color: 0, dir: 0, notFiller: 0, dup: 0, strip: 0, unflagged: 0, count: 0, gravity: 0, rules: 0 };
    const tmap = Object.fromEntries(T.map(t => [t.id, t]));
    let scenes = 0, bb40 = 0, bb35 = 0; const bbs = [];
    good.forEach(r => {
      const rects = [r.rect].concat(r.fillers.map(f => f.rect));
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (!gap(rects[i], rects[j])) issues.overlap++;
      if (r.fillers.length) scenes++;
      if (r.fillers.length > 2) issues.count++;
      const used = new Set(r.colors);
      r.fillers.forEach((f, i) => {
        if (f.player) issues.player++; if (f.spawners) issues.spawner++; if (!tmap[f.id].filler) issues.notFiller++;
        if (f.colors.some(c => used.has(c))) issues.color++; f.colors.forEach(c => used.add(c));
        const g = tmap[f.id].parts[0].room.gravity; if (!(g === "either" || (g === "on") === !!r.gravity)) issues.gravity++;
        if (f.filler !== true) issues.unflagged++;
      });
      if (r.fillers.length && (r.dir !== "down" || r.extra)) issues.dir++;
      const ids = [r.id].concat(r.fillers.map(f => f.id)); if (new Set(ids).size !== ids.length || ids.some(i => r.recentBefore.includes(i))) issues.dup++;
      if (tmap[r.id].strip && r.fillers.length && r.rect.y + r.rect.h !== 18) issues.strip++;
      const x0 = Math.min(...rects.map(q => q.x)), x1 = Math.max(...rects.map(q => q.x + q.w)), y0 = Math.min(...rects.map(q => q.y)), y1 = Math.max(...rects.map(q => q.y + q.h));
      const bb = 100 * (x1 - x0) * (y1 - y0) / 432; bbs.push(bb); if (bb >= 40) bb40++; if (bb >= 35) bb35++;
    });
    Object.entries({ overlap: "rectangles never touch (>= 1 empty tile between)", player: "a filler never holds the player", spawner: "a filler never holds a spawner", color: "channel colours are never shared between the primary and a filler (or two fillers)", dir: "fillers only in a plain down-gravity single-room scene", notFiller: "only templates flagged filler:true are used as fillers", dup: "no template repeats inside 5 presses (primary and fillers together) and none twice in one scene", strip: "a strip primary sits on the floor side", count: "at most two fillers", gravity: "a filler's gravity need matches the scene's", unflagged: "filler specs are flagged filler" }).forEach(([k, m]) => ok(issues[k] === 0, m + " (violations " + issues[k] + ")"));
    const share = 100 * scenes / good.length; bbs.sort((a, b) => a - b);
    console.log("   scenes with fillers:", share.toFixed(1) + "%", "| bbox >= 35%:", (100 * bb35 / good.length).toFixed(1) + "%", ">= 40%:", (100 * bb40 / good.length).toFixed(1) + "%", "median box", bbs[bbs.length >> 1].toFixed(0) + "%");
    ok(100 * bb40 / good.length >= 80, "at least 80% of presses have a bounding box >= 40% of the room");
    // determinism
    const again = await page.evaluate(() => { const o = []; for (const s of [3, 17, 21, 44, 99, 250, 777]) { const a = window.__sc.emptyGen(s), b = window.__sc.emptyGen(s); o.push(JSON.stringify(a) === JSON.stringify(b)); } return o; });
    ok(again.every(Boolean), "the same seed builds the same scene (determinism)");
    // plain builds are unchanged by the scene logic: scene:false gives the primary alone, in the place the old snug rule chose
    const alone = await page.evaluate(() => { let bad = 0; for (let s = 1; s <= 60; s++) { const a = window.__sc.emptyGen(s, { scene: false }); if (!a.fail && a.fillers.length) bad++; } return bad; });
    ok(alone === 0, "scene:false builds no fillers");
    const canon = await page.evaluate(() => { let bad = 0, n = 0; for (let s = 1; s <= 80; s++) { const a = window.__sc.emptyGen(s, { canonical: true, chaos: false }); if (!a.fail) { n++; if (a.fillers.length) bad++; } } return { bad, n }; });
    ok(canon.bad === 0, "Try-this (canonical) never adds fillers (" + canon.n + " builds)");
    ok(errs.length === 0, "no page errors (" + errs.join("; ") + ")");
    await ctx.close();
  }

  if (SEC === "all" || SEC === "press") {
    console.log("\n== C. real presses: one undo, rules from the primary, one player ==");
    let tested = 0, bad = [];
    for (let seed = 1; seed <= 400 && tested < 14; seed++) {
      const { ctx, page, errs } = await mk();
      const pre = await page.evaluate(() => { window.__sc.reset(); return JSON.stringify(window.__sc.snapshot()); });
      const r = await page.evaluate(s => window.__sc.press(s), seed);
      if (r && r.fillers && r.fillers.length) {
        tested++;
        const st = await page.evaluate(() => { const s = window.__sc.state(); const room = window.__sc.room(); return { rooms: s.rooms, players: s.actors.filter(a => a.isPlayer).length, gravity: s.gravity, dir: s.dir, surprises: room.surprises.length, fillerFlags: room.surprises.filter(x => x.filler).length }; });
        if (st.rooms !== 1) bad.push(seed + " rooms " + st.rooms);
        if (st.players !== 1) bad.push(seed + " players " + st.players);
        if (st.surprises !== 1 + r.fillers.length || st.fillerFlags !== r.fillers.length) bad.push(seed + " surprise records " + st.surprises);
        if (st.gravity !== r.gravity) bad.push(seed + " gravity differs from the primary's");
        const diff = await page.evaluate(pre => { window.__sc.undo(); return JSON.stringify(window.__sc.snapshot()) === pre; }, pre);
        if (!diff) bad.push(seed + " one undo did not restore the room exactly");
      }
      if (errs.length) bad.push(seed + " errors " + errs.join("; "));
      await ctx.close();
    }
    ok(tested >= 10 && bad.length === 0, "real presses with fillers (" + tested + "): one undo restores exactly, one player, rules from the primary, records for every piece" + (bad.length ? " -> " + bad.join(" | ") : ""));
    // recency across real presses in one page (fresh room per press so there is always space): no template twice inside 5 presses, fillers included
    const { ctx, page, errs } = await mk();
    const seq = await page.evaluate(() => { window.__sc.reset(); const seqs = []; for (let i = 0; i < 60; i++) { const r = window.__sc.freshPress(9000 + i * 7); if (r && r.templateId) seqs.push([r.templateId].concat((r.fillers || []).map(f => f.templateId))); } return seqs; });
    let rep = 0; for (let i = 0; i < seq.length; i++) for (let j = Math.max(0, i - 4); j < i; j++) if (seq[i].some(id => seq[j].includes(id))) rep++;
    ok(seq.length >= 50 && rep === 0, "no template (primary or filler) repeats within any 5 real presses (" + seq.length + " presses, repeats " + rep + ")");
    ok(errs.length === 0, "no page errors (" + errs.join("; ") + ")");
    await ctx.close();
  }

  if (SEC === "all" || SEC === "fuzz") {
    console.log("\n== D. filler-safety fuzz: the primary's chain with fillers vs alone (Play, no input, 10 s) ==");
    // primaries that take fillers: every small template with a chain (non-toy) plus the toys, so a broken lane shows up anywhere
    const smalls = T.filter(t => { const p = t.parts[0], a = p.rows.length * p.rows[0].length; return a < 0.35 * 432 && !t.parts[1]; });
    const jobs = []; smalls.forEach(t => { for (let k = 0; k < NF; k++) jobs.push({ id: t.id, cat: t.category, seed: 20000 + k * 37 + t.id.length }); });
    let next = 0; const rows = [];
    async function worker() {
      while (true) {
        const j = jobs[next++]; if (!j) return;
        const one = async scene => {
          const { ctx, page, errs } = await mk();
          try {
            const r = await page.evaluate(([s, id, sc]) => { const rep = window.__sc.forced(s, id, sc); if (!rep || !rep.templateId) return null; window.__sc.play(); window.__sc.tick(600); const z = window.__sc.stop(); return { rect: rep.rect, fillers: rep.fillers, events: z.events }; }, [j.seed, j.id, scene]);
            await ctx.close(); return r && { r, errs };
          } catch (e) { await ctx.close(); return { err: String(e).slice(0, 100) }; }
        };
        const a = await one(false), s = await one(true);
        if (a && a.r && s && s.r) rows.push({ id: j.id, cat: j.cat, seed: j.seed, nf: s.r.fillers.length, errs: a.errs.concat(s.errs), alone: primaryPaths(a.r.events, a.r.rect), scene: primaryPaths(s.r.events, s.r.rect), aloneEv: a.r.events.length, sceneEv: s.r.events.length });
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()]);
    const pass2 = p => p.some(st => st.length >= 2);
    const withF = rows.filter(r => r.nf > 0);
    const aloneOk = withF.filter(r => pass2(r.alone));
    const kept = aloneOk.filter(r => pass2(r.scene));
    // the primary's own best path is still there with the fillers (same mechanisms, same order)
    const prefix = r => { const best = r.alone.slice().sort((x, y) => y.length - x.length)[0] || []; return best.length < 2 || r.scene.some(st => best.every((m, i) => st[i] === m)); };
    const same = aloneOk.filter(prefix);
    console.log("   runs (small primaries x seeds):", rows.length, "| with fillers:", withF.length, "| alone passes honest:", aloneOk.length, "| still pass with fillers:", kept.length, "| same best path kept:", same.length);
    const by = {}; withF.forEach(r => { const b = (by[r.id] = by[r.id] || { n: 0, alone: 0, kept: 0, same: 0 }); b.n++; if (pass2(r.alone)) { b.alone++; if (pass2(r.scene)) b.kept++; if (prefix(r)) b.same++; } });
    Object.entries(by).sort().forEach(([id, b]) => console.log("   " + id.padEnd(14), "n", String(b.n).padStart(3), "alone-pass", String(b.alone).padStart(3), "kept", String(b.kept).padStart(3), "path-kept", String(b.same).padStart(3)));
    ok(aloneOk.length > 0 && kept.length / aloneOk.length >= 0.97, "a primary that passes the honest chain alone still passes with fillers in >= 97% of runs (" + kept.length + "/" + aloneOk.length + ")");
    ok(aloneOk.length > 0 && same.length / aloneOk.length >= 0.95, "its own best mechanism path is still there with fillers in >= 95% of runs (" + same.length + "/" + aloneOk.length + ")");
    const errRuns = rows.filter(r => r.errs.length); ok(errRuns.length === 0, "no page errors in " + rows.length + " runs" + (errRuns.length ? " (" + errRuns[0].errs[0] + ")" : ""));
    const brokenList = aloneOk.filter(r => !pass2(r.scene) || !prefix(r)).map(r => r.id + "#" + r.seed);
    if (brokenList.length) console.log("   broken:", brokenList.slice(0, 20).join(", "));
  }

  await browser.close();
  console.log("\n=== SCENES: " + pass + " passed, " + fails.length + " failed ===");
  if (fails.length) { console.log(fails.join("\n")); process.exit(1); }
})();
