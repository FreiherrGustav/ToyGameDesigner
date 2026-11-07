// v2.64 Stage 4 (not deployed): old seeds are unchanged and the new machines' share. Usage: node tests/seedstable.test.js <pre-v2.64 index.html> [oldSeeds=3000] [diceSeeds=4000]
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const PRE = path.resolve(process.argv[2]), NOLD = +process.argv[3] || 3000, NDICE = +process.argv[4] || 4000;
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = `window.__g = (seed) => { surpriseRecent.length = 0; surpriseRecentVariants.length = 0; try { const r = generateSurprise(seed, {}); return r ? JSON.stringify(r) : "null"; } catch (e) { return "ERR " + e.message; } };
window.__m = () => SURPRISE_TEMPLATES.filter(t => t.expect && t.expect.chain).map(t => t.id);
window.__ids = () => SURPRISE_TEMPLATES.map(t => t.id);`;
const mk = (src, out) => { const s = fs.readFileSync(src, "utf8"); if (!s.includes(anchor)) throw new Error("anchor"); fs.writeFileSync(out, s.replace(anchor, anchor + HOOK)); return out; };
const NEW = mk(path.join(__dirname, "..", "index.html"), path.join(os.tmpdir(), "ss_new.html")), OLD = mk(PRE, path.join(os.tmpdir(), "ss_old.html"));
const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h; };
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); const out = {};
  for (const [name, file] of [["old", OLD], ["new", NEW]]) {
    const p = await (await b.newContext({ viewport: { width: 1000, height: 700 } })).newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
    await p.goto("file://" + file + "#t"); await p.waitForFunction(() => window.__g);
    out[name] = await p.evaluate(([n1, n2]) => {
      const low = [], dice = {}; const machines = new Set(window.__m()); let mach = 0;
      for (let s = 1; s <= n1; s++) low.push(window.__g(s));
      for (let s = 10000; s < 10000 + n2; s++) { const r = window.__g(s); let id = "ERR"; try { id = JSON.parse(r).templateId || JSON.parse(r).id || "?"; } catch (e) {} dice[id] = (dice[id] || 0) + 1; if (machines.has(id)) mach++; }
      return { low, dice, mach, machines: [...machines], total: n2 };
    }, [NOLD, NDICE]);
    out[name].errs = errs;
  }
  await b.close();
  let diff = 0, errsLow = 0; const ex = [];
  out.old.low.forEach((a, i) => { if (a !== out.new.low[i]) { diff++; if (ex.length < 5) ex.push(i + 1); } if (a.startsWith("ERR")) errsLow++; });
  console.log(`seeds 1..${NOLD}: ${NOLD - diff} identical, ${diff} different${diff ? " e.g. " + ex.join(",") : ""}, build errors old ${errsLow}`);
  const share = o => (100 * o.mach / o.total).toFixed(1) + "% (" + o.mach + "/" + o.total + ")";
  console.log("declared-chain machines among dice presses (seeds 10000+): old " + share(out.old) + " new " + share(out.new));
  console.log("machine templates old " + out.old.machines.length + " new " + out.new.machines.length);
  ["magnetmile", "drain", "stonedomino"].forEach(id => console.log(id, "appears in", (100 * (out.new.dice[id] || 0) / NDICE).toFixed(2) + "% of dice presses (" + (out.new.dice[id] || 0) + "/" + NDICE + ")"));
  const top = Object.entries(out.new.dice).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => k + " " + (100 * v / NDICE).toFixed(1) + "%").join(", "); console.log("top templates now:", top);
  console.log("page errors", out.old.errs.length, out.new.errs.length);
})();
