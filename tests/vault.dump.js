// Dumps the three Stonekeeper's Vault rooms from the real builder to JSON (used by tests/vault.solver.js).
// usage: node tests/vault.dump.js <out.json> [index.html]
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const fs = require("fs"), path = require("path");
(async () => {
  const out = process.argv[2], html = path.resolve(process.argv[3] || path.join(__dirname, "..", "index.html"));
  let src = fs.readFileSync(html, "utf8");
  const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
  if (!src.includes(anchor)) throw new Error("hook anchor missing");
  const tmp = path.join(require("os").tmpdir(), "vault_dump_" + process.pid + ".html");
  fs.writeFileSync(tmp, src.replace(anchor, anchor + 'window.__ev=f=>eval("("+f+")");\n'));
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage(); p.on("dialog", d => d.accept());
  await p.goto("file://" + tmp + "#t"); await p.waitForTimeout(400);
  const data = await p.evaluate(() => window.__ev(() => {
    loadExampleGame(buildStonekeepersVaultGame, "v", { skipConfirm: true });
    return rooms.map(r => {
      activateRoom(r.id);
      const cells = [];
      for (let y = 0; y < ROWS; y++) { const row = []; for (let x = 0; x < COLS; x++) row.push([board[y][x], colorBoard[y][x]]); cells.push(row); }
      return { name: r.name, cells, actors: actors.map(a => ({ def: a.defId, x: Math.round(a.x / TILE - 0.1), y: Math.round(a.y / TILE - 0.1), channel: a.channel || null, isPlayer: a.isPlayer })), startPos: r.startPos };
    });
  })());
  fs.writeFileSync(out, JSON.stringify(data));
  console.log("rooms:", data.map(r => r.name + " (" + r.actors.length + " actors)").join(", "));
  await b.close(); fs.unlinkSync(tmp);
})();
