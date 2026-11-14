// Decoration is Paint only: for each design, build it in the old and the new index.html, run 900 manual ticks (seeded Math.random)
// and compare every actor's x/y/vx/vy, the board and the colour layer each frame. node tests/decor.invariance.js <old index.html> [ids...]
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const [oldHtml, ...ids0] = process.argv.slice(2);
const ids = ids0.length ? ids0 : ["trampit", "catcannon", "tunneltrouble", "elevator", "plinko", "cannonrange", "windrally"];
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = `window.__i = { run: (id, n) => { Math.random = (function () { let s = 12345; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();
  const r = surpriseMe(10000, { templateId: id }); setGamePaused(false); const hs = []; let h = 5381;
  const mix = s => { for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0; };
  mix(JSON.stringify([board, colorBoard, groundSkinBoard]));
  for (let f = 0; f < n; f++) { tick(1 / 60); mix(JSON.stringify(actors.map(a => [a.defId, +a.x.toFixed(3), +a.y.toFixed(3), +a.vx.toFixed(3), +a.vy.toFixed(3)]))); if (f % 100 === 99) hs.push(h); }
  mix(JSON.stringify([board, colorBoard])); hs.push(h); return { hs, actors: actors.length, ok: !!r && !r.failed }; } };\n`;
const mk = (src, name) => { const t = path.join(os.tmpdir(), name); fs.writeFileSync(t, src.replace(anchor, anchor + HOOK)); return t; };
const A = mk(fs.readFileSync(oldHtml, "utf8"), "inv_old.html"), B = mk(fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8"), "inv_new.html");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const go = async (file, id) => { const p = await b.newPage(); p.on("dialog", d => d.accept()); await p.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    await p.goto("file://" + file + "#t"); await p.waitForFunction(() => window.__i); const r = await p.evaluate(i => window.__i.run(i, 900), id); await p.close(); return r; };
  let bad = 0;
  for (const id of ids) { const a = await go(A, id), c = await go(B, id); const same = a.ok && c.ok && JSON.stringify(a.hs) === JSON.stringify(c.hs); if (!same) bad++; console.log((same ? "identical " : "DIFFERS   ") + id + " (" + a.actors + " actors)"); }
  await b.close(); console.log(bad ? bad + " differ" : "all identical"); process.exit(bad ? 1 : 0);
})();
