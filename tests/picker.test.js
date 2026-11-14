// Surprise Me cycling picker: statistics (10,000 simulated visits), every design builds through the dice with no errors,
// tab reuse (untouched swapped, edited left alone), persistence across a reload, #surprise=<id>, and the telemetry events.
// node tests/picker.test.js [visits]
const fs = require("fs"), os = require("os"), path = require("path"), vm = require("vm");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const file = path.join(__dirname, "..", "index.html");
const src = fs.readFileSync(file, "utf8");
const VISITS = Number(process.argv[2] || 10000);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "ok   " : "FAIL ") + m); };

// ---- pure functions, lifted from the real source ----
const a = src.indexOf("// ===== SURPRISE CYCLE START"), b = src.indexOf("// ===== SURPRISE CYCLE END");
const ctx = {}; vm.createContext(ctx);
vm.runInContext(src.slice(a, b) + "\nthis.api = { SURPRISE_TIER1, surpriseBuildOrder, surpriseCycleNext };", ctx);
const { SURPRISE_TIER1: TIER1, surpriseBuildOrder, surpriseCycleNext } = ctx.api;

function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

(async () => {
  const b0 = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const hook = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
  const tmp = path.join(os.tmpdir(), "picker.html");
  fs.writeFileSync(tmp, src.replace(hook, hook + "window.__p = { resume: () => setGamePaused(false), ids: () => surpriseEligibleTemplates().eligible.map(t => t.id), rooms: () => rooms.map(r => r.id + ':' + r.name), state: () => ({ n: rooms.length, ids: rooms.map(r => r.id), cur: currentRoomId, paused: gamePaused, players: rooms.reduce((n, r) => n + r.actors.filter(a => a.isPlayer).length, 0) + 0 }), cap: () => lastSurpriseCaption, edit: () => { board[0][0] = board[0][0] === 'solid:bouncy' ? 'solid:sticky' : 'solid:bouncy'; snapshotCurrentRoomState(); } };\n"));
  const p0 = await b0.newPage(); await p0.goto("file://" + tmp + "#t"); await p0.waitForFunction(() => window.__p);
  const IDS = await p0.evaluate(() => window.__p.ids()); await p0.close();
  console.log("designs eligible: " + IDS.length + ", tier 1 present: " + TIER1.filter(t => IDS.includes(t)).length + "/" + TIER1.length);
  ok(IDS.length === 39, "39 designs");
  ok(TIER1.every(t => IDS.includes(t)), "every tier-1 id exists");

  // ---- statistics ----
  const rnd = mulberry(12345);
  let headOk = 0, onceOk = 0, startsOnLast = 0, cycles = 0;
  const pos = {}, posN = {}; IDS.forEach(i => { pos[i] = 0; posN[i] = 0; });
  for (let v = 0; v < VISITS; v++) {
    let st = null; const seen = [];
    for (let k = 0; k < IDS.length; k++) { const r = surpriseCycleNext(st, IDS, TIER1, rnd); st = r.state; seen.push(r.id); }
    if (seen[0] !== seen[1] && TIER1.includes(seen[0]) && TIER1.includes(seen[1])) headOk++;
    if (new Set(seen).size === IDS.length) onceOk++;
    seen.forEach((id, i) => { pos[id] += i; posN[id]++; });
    // two more cycles: a reshuffle never starts on the design just shown
    for (let c = 0; c < 2; c++) {
      const last = seen[seen.length - 1];
      const cyc = []; for (let k = 0; k < IDS.length; k++) { const r = surpriseCycleNext(st, IDS, TIER1, rnd); st = r.state; cyc.push(r.id); }
      if (cyc[0] === last) startsOnLast++;
      if (new Set(cyc).size !== IDS.length) onceOk--;
      seen.length = 0; cyc.forEach(x => seen.push(x)); cycles++;
    }
  }
  ok(headOk === VISITS, "first two slots are two different tier-1 designs in all " + VISITS + " visits (" + headOk + ")");
  ok(onceOk === VISITS, "every design exactly once per cycle, all cycles (" + onceOk + "/" + VISITS + ")");
  ok(startsOnLast === 0, "a reshuffle never starts on the last design shown (" + cycles + " reshuffles, " + startsOnLast + " violations)");
  // expected mean 0-based position: non-tier1 uniform over slots 2..N-1; tier-1 is in the head with prob 2/8 (mean 0.5) otherwise uniform over 2..N-1
  const N = IDS.length, rest = (2 + N - 1) / 2, pHead = 2 / TIER1.length;
  const expT1 = pHead * 0.5 + (1 - pHead) * rest, expOther = rest;
  let worst = 0; const rows = [];
  IDS.forEach(i => { const m = pos[i] / posN[i], e = TIER1.includes(i) ? expT1 : expOther; worst = Math.max(worst, Math.abs(m - e)); rows.push((TIER1.includes(i) ? "T1 " : "   ") + i.padEnd(16) + m.toFixed(2) + " (expected " + e.toFixed(2) + ")"); });
  console.log(rows.join("\n"));
  const tol = Math.max(0.5, 4 * 10.7 / Math.sqrt(0.75 * VISITS));
  ok(worst < tol, "mean positions match expected within 4 standard errors (" + tol.toFixed(2) + " slots; worst " + worst.toFixed(2) + ")");

  // ---- browser: every design through the dice, no errors ----
  const errors = [];
  const mk = async (url, init) => { const p = await b0.newPage(); p.on("dialog", d => d.accept()); p.on("pageerror", e => errors.push(String(e))); if (init) await p.addInitScript(init); await p.goto(url); await p.waitForFunction(() => window.__p); return p; };
  const pg = await mk("file://" + tmp + "#t");
  const shown = [];
  for (let i = 0; i < IDS.length; i++) { const r = await pg.evaluate(() => { const x = window.surpriseDice(); return x && { id: x.templateId, room: x.roomId, pending: x.pending, failed: x.failed }; }); shown.push(r && r.id); if (!r || !r.id || r.pending || r.failed) console.log("  press " + i + " -> " + JSON.stringify(r)); }
  ok(new Set(shown).size === IDS.length && !shown.includes(undefined), "39 dice presses showed 39 different designs (" + new Set(shown).size + ")");
  ok(errors.length === 0, "no page errors across the 39 presses " + (errors[0] || ""));
  const st = await pg.evaluate(() => window.__p.state());
  console.log("  rooms after 39 presses: " + st.n + ", players: " + st.players);
  ok(st.players <= 1, "at most one player in the project");
  ok(st.n <= 2, "tabs did not pile up (" + st.n + " tabs after 39 presses; 2 only while the two-room design is shown)");
  await pg.close();

  // ---- tab reuse: order starts with whole-room designs ----
  const order = ["lavalamp", "fanwindmill", "herd", "magnetmile", "trafficjam", "carousel", "windrally", "oopstramps"].filter(x => IDS.includes(x));
  const full = order.concat(IDS.filter(x => !order.includes(x)));
  const initOrder = (pos) => `try { if (!sessionStorage.getItem("toyGameDesigner.surpriseOrder")) sessionStorage.setItem("toyGameDesigner.surpriseOrder", JSON.stringify({ order: ${JSON.stringify(full)}, pos: ${pos}, last: null })); } catch (e) {}`;
  const pr = await mk("file://" + tmp + "#t", initOrder(0));
  const press = () => pr.evaluate(() => { const x = window.surpriseDice(); return x && { id: x.templateId, room: x.roomId, ids: x.roomIds }; });
  const r1 = await press(); const s1 = await pr.evaluate(() => window.__p.state());
  ok(r1.id === "lavalamp" && s1.n === 1, "press 1 fills the empty room (1 tab) with lavalamp: " + r1.id + " " + s1.n);
  const r2 = await press(); const s2 = await pr.evaluate(() => window.__p.state());
  ok(r2.id === "fanwindmill" && s2.n === 1 && !s2.ids.includes(r1.room), "press 2 replaces the untouched first surprise (still 1 tab, old room gone): " + JSON.stringify(s2.ids));
  await pr.evaluate(() => window.__p.resume()); await pr.waitForTimeout(1200);
  const r3 = await press(); const s3 = await pr.evaluate(() => window.__p.state());
  ok(r3.id === "herd" && s3.n === 1, "a surprise that was resumed and ran still counts as untouched (" + s3.n + " tab)");
  ok(s3.paused, "every press opens frozen (design by decision)");
  await pr.evaluate(() => window.__p.edit());
  const r4 = await press(); const s4 = await pr.evaluate(() => window.__p.state());
  ok(r4.id === "magnetmile" && s4.n === 2 && s4.ids.includes(r3.room), "an edited tab is left alone; the new design gets a new tab (" + s4.n + " tabs)");
  const r5 = await press(); const s5 = await pr.evaluate(() => window.__p.state());
  ok(s5.n === 2 && s5.ids.includes(r3.room) && !s5.ids.includes(r4.room), "the next press reuses the new untouched tab and still keeps the edited one");
  ok(s5.players === 1, "one player in the project");
  // reload in the same tab: the order continues
  await pr.reload(); await pr.waitForFunction(() => window.__p);
  const r6 = await press();
  ok(r6.id === full[5], "reload in the same tab continues the order (next is " + r6.id + ", expected " + full[5] + ")");
  // hash link to one design
  await pr.close();
  const ph = await mk("file://" + tmp + "#surprise=lavalamp");
  const hs = await ph.evaluate(() => ({ cap: window.__p.cap(), rooms: window.__p.rooms() }));
  ok(/Lava|lamp|Lamp|Blob|blob/i.test(hs.cap) || hs.cap.indexOf("Surprise #") === 0, "#surprise=lavalamp builds that design: " + hs.cap);
  const ph2 = await mk("file://" + tmp + "#surprise=10002:rink"); // a retired seed link: unknown template id now, must not crash
  await ph2.close(); await ph.close();
  ok(errors.length === 0, "no page errors in the tab-reuse and link tests " + (errors[0] || ""));

  // ---- telemetry: names, values, timing ----
  const events = [];
  const pt = await b0.newPage(); pt.on("dialog", d => d.accept()); pt.on("pageerror", e => errors.push(String(e)));
  const reqs = []; await pt.route("**/*", route => { const u = route.request().url(); if (u.startsWith("file:")) return route.continue(); reqs.push(u); return route.abort(); });
  pt.on("console", m => { const t = m.text(); if (t.startsWith("[tele]")) events.push(t.slice(7)); });
  await pt.addInitScript(initOrder(0));
  await pt.goto("file://" + tmp + "?study=1&telelog=1#t"); await pt.waitForFunction(() => window.__p);
  await pt.evaluate(() => window.surpriseDice()); // A, shown
  await pt.evaluate(() => window.__p.resume()); await pt.waitForTimeout(2200); // resumed within 10 s -> started
  await pt.evaluate(() => window.surpriseDice()); // B within 10 s of A -> A skipped
  await pt.waitForTimeout(11000);
  await pt.evaluate(() => window.surpriseDice()); // C after 11 s: B not skipped, B never started
  await pt.waitForTimeout(500);
  const sur = events.filter(e => e.indexOf("surprise_") === 0 && e !== "surprise_me_used");
  console.log("  events: " + sur.join(", "));
  ok(sur[0] === "surprise_shown:lavalamp", "surprise_shown/<id> on the first press");
  ok(sur.includes("surprise_started:lavalamp"), "surprise_started/<id> when resumed within 10 s");
  ok(sur.includes("surprise_skipped:lavalamp"), "surprise_skipped/<id> when the next press comes within 10 s");
  ok(sur.includes("surprise_shown:fanwindmill") && sur.includes("surprise_shown:herd"), "later presses are counted");
  ok(!sur.includes("surprise_skipped:fanwindmill") && !sur.includes("surprise_started:fanwindmill"), "no skipped/started for a design left alone for 11 s");
  ok(sur.every(e => /^surprise_(shown|started|skipped):[a-z0-9]+$/.test(e)), "only fixed-list design ids in the values");
  ok(reqs.every(u => u.indexOf("goatcounter.com/count?e=true&p=%2Fe%2F") >= 0) && reqs.every(u => !/seed|#|room/i.test(decodeURIComponent(u).replace("/e/", ""))), "network: only counter GETs with the event path, nothing else (" + reqs.length + " requests)");
  await pt.close();
  // opt-out: no telemetry without the flag
  const pn = await b0.newPage(); const ev2 = []; pn.on("console", m => { if (m.text().startsWith("[tele]")) ev2.push(m.text()); });
  const reqs2 = []; await pn.route("**/*", route => { if (route.request().url().startsWith("file:")) return route.continue(); reqs2.push(route.request().url()); return route.abort(); });
  await pn.goto("file://" + tmp + "?telelog=1#t"); await pn.waitForFunction(() => window.__p);
  await pn.evaluate(() => window.surpriseDice()); await pn.waitForTimeout(9000);
  ok(ev2.length === 0 && reqs2.length === 0, "without ?study=1 nothing is counted or sent");
  await pn.close();
  ok(errors.length === 0, "no page errors overall " + (errors[0] || ""));
  await b0.close(); console.log("picker: " + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
})();
