// v2.54 Stage 3 dev harness (not deployed): trace one machine definition from a JS file with the causal hook.
// node tests/machines.build.js <defs.js> <id> [frames=600] [every=30] [seed=1] [mirror=0]
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const [defsFile, id, FR = "600", EV = "30", SEED = "1", MIR = "0"] = process.argv.slice(2);
const defs = require(path.resolve(defsFile)); const def = defs.find(d => d.id === id);
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = require("./causal.hook.js")() + `
window.__m = { run: (def, seed, mirror, frames, every, dt) => { SURPRISE_TEMPLATES.push(def); surpriseRecent.length = 0;
  const r = surpriseMe(seed, { templateIds: [def.id], canonical: true, chaos: false, mirror: !!mirror });
  if (!r || r.failed) return { fail: JSON.stringify(r) };
  enterPlayMode(); tick(1/60); window.__czStart(); const lines = [];
  for (let i = 0; i < frames; i++) { window.__cz.frame++; tick(dt); window.__czPoll();
    if (i % every === 0) lines.push(i + ": " + actors.map(a => { const d = actorDefs[a.defId] || {}; const n = a.isPlayer ? "P" : (d.name || a.defId).slice(0, 6); return n + "(" + (a.x / TILE).toFixed(1) + "," + (a.y / TILE).toFixed(1) + (Math.abs(a.vx) + Math.abs(a.vy) > 30 ? " v" + Math.round(a.vx) + "," + Math.round(a.vy) : "") + (a.cannonLoad ? " LOAD" : "") + ")"; }).join(" ")); }
  const z = window.__czStop(); return { name: r.name, lines, ev: z.events.map(e => e.f + ":" + e.type + (e.char ? "*" : "") + "<" + (e.cause == null ? "-" : e.cause)), ops: r.ops, rect: r.rect, dir: r.gravity }; } };`;
const tmp = path.join(os.tmpdir(), "machines_build.html"); fs.writeFileSync(tmp, src.replace(anchor, anchor + "surpriseVaried = true;\n" + HOOK));
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); const p = await b.newPage(); p.on("dialog", d => d.accept()); p.on("pageerror", e => console.log("PAGEERROR", e));
  await p.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await p.goto("file://" + tmp + "#t"); await p.waitForFunction(() => window.__m);
  const r = await p.evaluate(([d, s, m, f, e]) => window.__m.run(d, s, m, f, e, 1 / 60), [def, Number(SEED), MIR === "1", Number(FR), Number(EV)]);
  if (r.fail) console.log("FAIL", r.fail); else { console.log(r.name, JSON.stringify(r.rect), "gravity", r.dir); r.lines.forEach(l => console.log(l)); console.log("EVENTS", r.ev.join(" ")); }
  await b.close();
})();
