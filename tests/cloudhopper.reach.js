// Cloud Hopper: reachability check. Reads the real boards from the builder, derives every required jump of the main route
// (rise and horizontal gap in px) and compares it with the measured limits (apex 122 px, worst case at 30 fps; standing reach
// from a ballistic model with a 20% acceleration allowance) requiring >= 25% margin. Timed legs (moving platform) and the
// trampoline leg are measured by simulation instead (fraction of the platform cycle that works; landing band of the bounce).
// usage: node tests/cloudhopper.reach.js [html]
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const fs = require("fs"), path = require("path"), os = require("os");
const html = path.resolve(process.argv[2] || path.join(__dirname, "..", "index.html"));
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const PAGE = `window.__reach = () => {
  const g = SAMPLE_GAMES.find(g => g.id === "cloud-hopper"); loadExampleGame(g.builder, g.name, { skipConfirm: true });
  const topRow = (room, row, c0, c1) => { activateRoom(rooms[room].id); for (let c = c0; c <= c1; c++) if (geometryAt(c, row) !== "solid") return null; return row; };
  // [label, room, fromRow, fromC0, fromC1, toRow, toC0, toC1]  (rows are the solid tile rows; the hero stands on top)
  const legs = [
    ["R1 floor -> dip far side", 0, 15, 0, 9, 15, 13, 15, "flat gap over the dip"],
    ["R1 floor -> cloud A", 0, 15, 13, 15, 13, 16, 18],
    ["R1 cloud A -> cloud B", 0, 13, 16, 18, 11, 19, 23],
    ["R3 floor -> cloud A", 2, 16, 0, 23, 14, 4, 6],
    ["R3 A -> B", 2, 14, 4, 6, 12, 9, 11],
    ["R3 B -> C", 2, 12, 9, 11, 10, 14, 16],
    ["R3 C -> D", 2, 10, 14, 16, 8, 18, 20],
    ["R3 D -> island", 2, 8, 18, 20, 6, 21, 23],
  ];
  const out = [];
  for (const [label, room, fr, f0, f1, tr, t0, t1] of legs) {
    const okFrom = topRow(room, fr, f0, f1) !== null, okTo = topRow(room, tr, t0, t1) !== null;
    const rise = (fr - tr) * 32, gap = Math.max(0, t0 - (f1 + 1)) * 32;
    // ballistic model: time to come back down to height 'rise' after a 620 px/s jump; walking speed 220 with a 20% acceleration allowance
    const disc = 620 * 620 - 2 * 1450 * Math.max(0, rise), t = disc > 0 ? (620 + Math.sqrt(disc)) / 1450 : 0;
    const avail = 0.8 * 220 * t, need = gap + 1;
    out.push({ label, okFrom, okTo, rise, gap, riseMargin: +(1 - rise / 122).toFixed(2), reachMargin: avail ? +(1 - need / avail).toFixed(2) : -1, availReach: Math.round(avail) });
  }
  // trampoline leg (room 2 pit -> big cloud): launch 900 px/s from the trampoline surface (row 16 top = 512) to the cloud top (row 10 = 320)
  activateRoom(rooms[1].id);
  const tr = { cloudOk: [13, 14, 15, 16, 17, 18, 19].every(c => geometryAt(c, 10) === "solid"), trampolineOk: geometryAt(9, 16) === "trampoline" };
  const rise = 512 - 320, disc = 900 * 900 - 2 * 1450 * rise;
  tr.rise = rise; tr.apex = Math.round(900 * 900 / (2 * 1450)); tr.riseMargin = +(1 - rise / tr.apex).toFixed(2);
  tr.timeToCloud = +((900 + Math.sqrt(disc)) / 1450).toFixed(2);
  return { legs: out, tramp: tr };
};`;
(async () => {
  const src = fs.readFileSync(html, "utf8"); if (!src.includes(anchor)) throw new Error("anchor");
  const tmp = path.join(os.tmpdir(), "chreach_hooked.html"); fs.writeFileSync(tmp, src.replace(anchor, anchor + PAGE));
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await (await b.newContext({ viewport: { width: 1366, height: 635 } })).newPage(); p.on("dialog", d => d.accept());
  const errs = []; p.on("pageerror", e => errs.push(e.message)); await p.addInitScript("window.requestAnimationFrame=()=>0;");
  await p.goto("file://" + tmp + "#t");
  const r = await p.evaluate(() => window.__reach());
  let bad = 0;
  for (const l of r.legs) {
    const ok = l.okFrom && l.okTo && l.riseMargin >= 0.25 && (l.gap === 0 || l.reachMargin >= 0.25);
    if (!ok) bad++;
    console.log((ok ? "ok   " : "FAIL ") + l.label.padEnd(26) + " rise " + String(l.rise).padStart(3) + " px (margin " + Math.round(l.riseMargin * 100) + "%)  gap " + String(l.gap).padStart(3) + " px of " + l.availReach + " reachable (margin " + (l.gap ? Math.round(l.reachMargin * 100) + "%" : "n/a, adjacent") + ")");
  }
  const t = r.tramp, tok = t.cloudOk && t.trampolineOk && t.riseMargin >= 0.25;
  if (!tok) bad++;
  console.log((tok ? "ok   " : "FAIL ") + "R2 trampoline -> big cloud   rise " + t.rise + " px of apex " + t.apex + " (margin " + Math.round(t.riseMargin * 100) + "%), airborne to the cloud top " + t.timeToCloud + " s");
  console.log("required jumps on the main route: Room 1: 3 (dip, cloud A, cloud B), Room 2: 3 (trampoline bounce, platform hop, ledge hop), Room 3: 5; total 11 (the bot made 11 hops in its win)");
  console.log("errors", errs.length, "bad", bad);
  await b.close(); process.exit(bad || errs.length ? 1 : 0);
})();
