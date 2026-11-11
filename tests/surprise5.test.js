// v2.54 Stage 2 suite (not deployed): closed-box rule, variation operators, variant recency, category mix.
// node tests/surprise5.test.js [mixPresses=1000]
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const MIX = Number(process.argv[2] || 1000);
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = `window.__s5 = {
  reset: () => { suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false; surpriseRecent.length = 0; surpriseRecentVariants.length = 0; },
  gen: (seed, o) => { const s = generateSurprise(seed, o); return s && (s.failed || s.noRoom) ? { failed: true } : s; },
  push: t => SURPRISE_TEMPLATES.push(t), pop: () => SURPRISE_TEMPLATES.pop(),
  press: (seed, o) => surpriseMe(seed, o), cats: () => SURPRISE_CATEGORY_WEIGHTS,
  facts: () => { const res = []; for (const t of SURPRISE_TEMPLATES) { surpriseRecent.length = 0; const s = generateSurprise(7, { templateIds: [t.id], canonical: true, mirror: false, chaos: false });
      if (!s || s.failed || s.noRoom) { res.push({ id: t.id, bad: true }); continue; }
      const solid = new Set(); s.tiles.forEach(k => { if (/^(solid|bomb|spawner|fan|cannon|barrier|magnet|trampoline)/.test(k.key)) solid.add(k.x + "," + k.y); });
      let per = 0, sol = 0; for (let x = 0; x < s.w; x++) for (const y of [0, s.h - 1]) { per++; if (solid.has((s.ox + x) + "," + (s.oy + y))) sol++; }
      for (let y = 1; y < s.h - 1; y++) for (const x of [0, s.w - 1]) { per++; if (solid.has((s.ox + x) + "," + (s.oy + y))) sol++; }
      res.push({ id: t.id, cat: t.category, closed: !!t.closed, frac: sol / per }); } return res; },
  variantCount: (id, n) => { const set = new Set(); for (let i = 1; i <= n; i++) { surpriseRecent.length = 0; const sp = generateSurprise(i, { templateIds: [id] }); if (sp && !sp.failed && !sp.noRoom) set.add(sp.variant); } return set.size; },
  chain: (n, ids) => { surpriseRecent.length = 0; surpriseRecentVariants.length = 0; const out = [];
      for (let i = 0; i < n; i++) { const s = generateSurprise(5000 + i, { avoid: surpriseRecent, avoidVariants: surpriseRecentVariants, templateIds: ids || undefined });
        if (!s || s.failed || s.noRoom) { out.push(null); continue; }
        out.push({ id: s.templateId, cat: s.category, variant: s.variant }); surpriseRecent.push(s.templateId); if (surpriseRecent.length > SURPRISE_RECENT_MAX) surpriseRecent.shift();
        surpriseRecentVariants.push(s.variant); if (surpriseRecentVariants.length > SURPRISE_RECENT_VARIANTS_MAX) surpriseRecentVariants.shift(); } return out; },
};`;
const tmp = path.join(os.tmpdir(), "surprise5_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + "surpriseVaried = true;\n" + HOOK));
let pass = 0; const fails = [];
const ok = (c, m, x) => { if (c) { pass++; console.log("ok  ", m); } else { fails.push(m); console.log("FAIL", m, x !== undefined ? JSON.stringify(x).slice(0, 300) : ""); } };
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 900 } })).newPage(); const errors = [];
  page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept());
  await page.goto("file://" + tmp + "#t"); await page.waitForFunction(() => window.__s5);
  const E = (f, ...a) => page.evaluate(([f, a]) => window.__s5[f](...a), [f, a]);

  // ---- A. the closed-box rule: closed = 90% or more of the footprint's border is solid; only toys may be closed ----
  const facts = await E("facts");
  facts.forEach(f => {
    ok(!f.bad, f.id + ": generates");
    if (f.bad) return;
    ok((f.frac >= 0.9) === f.closed, f.id + ": closed flag (" + f.closed + ") agrees with the border (" + Math.round(f.frac * 100) + "% solid)");
    if (f.cat !== "toy") ok(!f.closed && f.frac < 0.9, f.id + " (" + f.cat + "): not a box (border " + Math.round(f.frac * 100) + "% solid)");
  });
  const nClosed = facts.filter(f => f.closed).length; ok(nClosed / facts.length <= 1 / 3, "closed share " + nClosed + "/" + facts.length + " <= one third");

  // ---- B. variation operators on a synthetic machine ----
  const machine = { id: "opTest", category: "room", closed: false, stooge: "wP", names: ["Op Test"], requires: [], discover: "o",
    room: { gravity: "on", dirs: ["left", "right"], wrapH: false, wrapV: false }, vary: { mirror: false, colors: true, payload: { c: ["crate", "stone", "actor|hazardball"] }, skins: false, sprites: false, drains: [[1, 5], [2, 5]] },
    expect: { fact: "x", check: "", needsInput: false, selfStart: true },
    legend: { "=": "wall", P: "player", c: "crate", a: "plate:red", b: "gate:red", d: "plate:green", e: "gate:green", w: "pet", o: "reward" },
    rows: ["============", "=.c.....o..=", "=.a.b.d.e..=", "=..w..P....=", "============", "............", "............"].map(r => r) };
  machine.rows = ["============", "=.c.....o..=", "=.a.b.d.e..=", "=..w..P....=", "=..........=", "=..........=", "============"].map(r => r.slice(0, 12));
  await E("reset"); await E("push", machine);
  const COL = ["red", "orange", "yellow", "green", "blue", "purple", "pink", "cyan", "brown"];
  const colorOf = (spec, ch) => null;
  let forcedColors = [], payloads = [], mirrors = [], skins = [], drainsAt = [], det = [];
  for (let seed = 1; seed <= 40; seed++) {
    const s = await E("gen", seed, { templateId: "opTest", vary: { colors: true, payload: true, drains: true } });
    forcedColors.push(s.tiles.filter(t => t.color).map(t => t.key.split(":")[0] + ":" + t.color));
    payloads.push(s.actors.filter(a => ["pushable", "largestone", "hazardball"].includes(a.defId)).map(a => a.defId));
    mirrors.push(s.mirror); skins.push(s.tiles.filter(t => t.skin && t.key === "solid:none").length);
    drainsAt.push(s.tiles.filter(t => t.key === "none:lethal").map(t => (t.x - s.ox) + "," + (t.y - s.oy)));
    if (seed <= 5) { const s2 = await E("gen", seed, { templateId: "opTest", vary: { colors: true, payload: true, drains: true } }); det.push(s.variant === s2.variant && JSON.stringify(s.tiles) === JSON.stringify(s2.tiles)); }
  }
  ok(det.every(Boolean), "operators are deterministic by seed");
  ok(mirrors.every(m => m === false), "mirror:false is never mirrored (40 seeds)");
  ok(skins.every(n => n === 0), "skins:false keeps the plain wall (40 seeds)");
  // colours: plate and gate of one pair always match, the two pairs never share a colour, and the colours are changed in most seeds
  let pairOk = 0, distinct = 0, changed = 0;
  forcedColors.forEach(list => { const plates = list.filter(x => x.startsWith("plate")).map(x => x.split(":")[1]), gates = list.filter(x => x.startsWith("solid") || x.startsWith("barrier")).map(x => x.split(":")[1]);
    const pl = new Set(plates), gt = new Set(gates); if (pl.size === 2 && gt.size === 2 && [...pl].every(c => gt.has(c))) pairOk++; if (pl.size === 2) distinct++; if (![...pl].every(c => c === "red" || c === "green")) changed++; });
  ok(pairOk === 40, "colour permutation keeps every plate/gate pair on one colour, and two pairs on two colours (40/40)", pairOk);
  ok(changed >= 25, "the permutation really changes the colours (" + changed + "/40 seeds)");
  const pset = new Set(payloads.flat());
  ok([...pset].every(d => ["pushable", "largestone", "hazardball"].includes(d)) && pset.size === 3, "payload comes only from the declared list and all three appear", [...pset]);
  ok(payloads.every(l => l.length === 1), "one payload choice per legend char (the single c cell)", payloads[0]);
  const allowed = new Set(["1,5", "2,5"]); ok(drainsAt.flat().every(d => allowed.has(d)) && drainsAt.some(d => d.length), "drains only at declared cells, and sometimes present", drainsAt.slice(0, 5));
  // gravity direction: only from the verified list; a direction not on it is ignored
  const dirs = [];
  for (const d of ["left", "right", "up"]) { const s = await E("gen", 11, { templateId: "opTest", vary: { dir: d } }); dirs.push([d, s.dir]); }
  ok(dirs[0][1] === "left" && dirs[1][1] === "right" && dirs[2][1] !== "up", "gravity direction: left/right accepted, up (not on the list) refused", dirs);
  const rolled = new Set(); for (let seed = 1; seed <= 300; seed++) rolled.add((await E("gen", seed, { templateId: "opTest" })).dir);
  ok([...rolled].every(d => ["down", "left", "right"].includes(d)) && rolled.has("left") && rolled.has("right"), "rolled directions stay on the list", [...rolled]);
  // canonical (Try this) and explicit seeds
  const can = await E("gen", 3, { templateId: "opTest", canonical: true, chaos: false });
  ok(can.ops.length === 0 && can.dir === "down", "canonical (Try this) applies no operator", can.ops);
  // payload with no operator forced and chaos off: the original piece
  const plain = await E("gen", 3, { templateId: "opTest", chaos: false });
  ok(plain.ops.filter(o => o !== "mirror").length === 0, "no operator without chaos or force", plain.ops);
  await E("pop");

  // ---- C. variant recency and the category mix over chained dice presses ----
  await E("reset");
  const ch = await E("chain", MIX);
  ok(ch.every(Boolean), "every chained press produced something");
  const cnt = {}; ch.forEach(r => { cnt[r.cat] = (cnt[r.cat] || 0) + 1; });
  const share = {}; Object.keys(cnt).forEach(k => share[k] = Math.round(100 * cnt[k] / ch.length));
  console.log("measured mix over", ch.length, "presses:", JSON.stringify(share));
  let repeats = 0; for (let i = 0; i < ch.length; i++) for (let j = Math.max(0, i - 10); j < i; j++) if (ch[i].id === ch[j].id) repeats++;
  ok(repeats === 0, "no template repeats within any 10 consecutive presses", repeats);
  let vrep = 0; for (let i = 0; i < ch.length; i++) for (let j = Math.max(0, i - 6); j < i; j++) if (ch[i].variant === ch[j].variant) vrep++;
  ok(vrep === 0, "no variant repeats within any 6 consecutive presses", vrep);
  { const per = {}; ch.forEach(r => { per[r.id] = (per[r.id] || 0) + 1; }); const top = Object.entries(per).sort((a, b) => b[1] - a[1])[0];
    ok(top[1] / ch.length <= 0.08, "no single template takes more than 8% of presses (top: " + top[0] + " " + (100 * top[1] / ch.length).toFixed(1) + "%)", top);
    ok(Object.keys(per).length >= 20, "at least 20 different templates seen in " + ch.length + " presses", Object.keys(per).length); }
  // v2.57: every template is about equally likely (toys/nonsense a little less), so a category's share follows how many templates it has
  // v2.65 Stage 2: after the curation cuts the whole-room entries are most of the pool
  ok(Math.abs((share.room || 0) - 61) <= 10 && Math.abs((share.toy || 0) - 25) <= 9 && (share.vignette || 0) <= 15 && (share.loop || 0) <= 10, "mix follows template counts (room ~61, toy ~25, vignette ~7, loop ~3)", share);
  // variant recency on one template: chained presses of the same template keep changing variant
  await E("reset"); await E("push", Object.assign({}, machine, { category: "loop" }));
  const same = await E("chain", 40, ["opTest"]);
  let r2 = 0; for (let i = 0; i < same.length; i++) for (let j = Math.max(0, i - 6); j < i; j++) if (same[i] && same[j] && same[i].variant === same[j].variant) r2++;
  ok(r2 === 0, "the same template pressed 40 times never repeats a variant within 6", r2);
  await E("pop");
  const rooms = (await E("facts")).filter(f => f.cat === "room");
  console.log("\ndistinct variants over 300 seeds per whole-room machine (mirror x wall skin x wrap/dir x operators):");
  for (const r of rooms) console.log("  " + r.id.padEnd(14), await E("variantCount", r.id, 300));
  ok(errors.length === 0, "no page errors", errors.slice(0, 3));
  console.log(`=== SURPRISE Stage 2: ${pass} passed, ${fails.length} failed ===`); fails.forEach(f => console.log(" -", f));
  await browser.close(); process.exit(fails.length ? 1 : 0);
})();
