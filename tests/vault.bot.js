// Plays Stonekeeper's Vault from Play start to the win with synthetic key events, following the solver's shortest solutions.
// usage: node tests/vault.bot.js <solutions.json> [html] [shotDir] [export]   (export = play the downloaded standalone file instead)
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const fs = require("fs"), path = require("path"), os = require("os");
const sols = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const html = path.resolve(process.argv[3] || path.join(__dirname, "..", "index.html"));
const shotDir = process.argv[4] && process.argv[4] !== "-" ? process.argv[4] : null;
const doExport = process.argv[5] === "export";
const DRIVER = `(() => {
  const W = 24, H = 18;
  const sleepFrames0 = 0; const sleepFrames = n => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  const key = (k, down) => window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { key: k, bubbles: true }));
  const KEY = { "1,0": "ArrowRight", "-1,0": "ArrowLeft", "0,1": "ArrowDown", "0,-1": "ArrowUp" };
  const pl = () => actors.find(a => a.isPlayer);
  const hc = () => { const p = pl(); return [p.x + p.w / 2, p.y + p.h / 2]; };
  const cellOf = a => [Math.floor((a.x + a.w / 2) / TILE), Math.floor((a.y + a.h / 2) / TILE)];
  const objs = () => actors.filter(a => !a.isPlayer && !a.carried && ["pushable", "largestone"].includes(actorDefs[a.defId].temperament));
  const objAt = (cx, cy) => objs().find(a => { const c = cellOf(a); return c[0] === cx && c[1] === cy; });
  const release = () => Object.values(KEY).forEach(k => key(k, false));
  async function axisTo(axis, target, tol) {           // bang-bang: accelerate toward, brake in time, settle within tol
    const i = axis === "x" ? 0 : 1, v = axis === "x" ? "vx" : "vy", neg = axis === "x" ? "ArrowLeft" : "ArrowUp", pos = axis === "x" ? "ArrowRight" : "ArrowDown";
    for (let n = 0; n < 600; n++) {
      if (playSessionEnded) { release(); return true; }
      if (window.__room !== undefined && currentRoomId !== window.__room) { release(); return false; }
      const d = target - hc()[i], vel = pl()[v], stop = vel * Math.abs(vel) / (2 * 1700);
      const err = d - stop; key(neg, false); key(pos, false);
      if (Math.abs(d) <= tol && Math.abs(vel) < 25) { release(); return true; }
      if (err > 1.5) key(pos, true); else if (err < -1.5) key(neg, true);
      await sleepFrames(1);
    }
    release(); return false;
  }
  const blocked = (cx, cy, avoid) => {
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) return true;
    if (avoid && avoid(cx, cy)) return true;
    const g = geometryAt(cx, cy);
    if (g === "lockeddoor" || g === "door" || g === "goal") return false;
    if (modifierAt(cx, cy) === "lethal") return true;
    if (isCellBlocking(cx, cy, { isPlayer: true })) return true;
    return !!objAt(cx, cy);
  };
  function bfs(from, to, avoid) {
    const prev = new Map([[from.join(), null]]); const q = [from];
    while (q.length) { const c = q.shift(); if (c[0] === to[0] && c[1] === to[1]) break;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = [c[0] + dx, c[1] + dy];
        if (prev.has(n.join())) continue; if (!(n[0] === to[0] && n[1] === to[1]) && blocked(n[0], n[1], avoid)) continue;
        if (n[0] === to[0] && n[1] === to[1] && blocked(n[0], n[1], avoid) && !["door", "goal", "lockeddoor"].includes(geometryAt(n[0], n[1]))) continue;
        prev.set(n.join(), c); q.push(n); } }
    if (!prev.has(to.join())) return null; const p = []; for (let c = to; c; c = prev.get(c.join())) p.push(c); return p.reverse();
  }
  async function goCell(tx, ty, avoid) {
    for (let guard = 0; guard < 80; guard++) {
      if (playSessionEnded) { release(); return true; }
      const me = cellOf(pl()); if (me[0] === tx && me[1] === ty) { await axisTo("x", tx * TILE + TILE / 2, 3); await axisTo("y", ty * TILE + TILE / 2, 3); return true; }
      const p = bfs(me, [tx, ty], avoid); if (!p) return false;
      // walk straight runs: move along the first leg's axis to the far end of the leg
      let e = 1; const dx = p[1][0] - p[0][0], dy = p[1][1] - p[0][1];
      while (e + 1 < p.length && p[e + 1][0] - p[e][0] === dx && p[e + 1][1] - p[e][1] === dy) e++;
      console.log('goCell', tx, ty, 'me', me, 'leg', JSON.stringify(p.slice(0, e + 1)), 'room', currentRoomId, window.__room); const ax = dx ? "x" : "y", other = dx ? "y" : "x";
      await axisTo(other, p[0][dx ? 1 : 0] * TILE + TILE / 2, 3);
      if (!(await axisTo(ax, p[e][dx ? 0 : 1] * TILE + TILE / 2, 3))) { if (cellOf(pl()).join() === p[e].join()) continue; }
      if (currentRoomId !== window.__room) { release(); return "room"; }
    }
    return false;
  }
  async function pushRun(from, to) {            // object at cell 'from' pushed in a straight line to cell 'to'
    const dx = Math.sign(to[0] - from[0]), dy = Math.sign(to[1] - from[1]); const k = KEY[dx + "," + dy];
    const behind = [from[0] - dx, from[1] - dy];
    const ok = await goCell(behind[0], behind[1], (cx, cy) => cx === from[0] && cy === from[1]); if (!ok) return "no path to " + behind;
    const o = objAt(from[0], from[1]); if (!o) return "no object at " + from + "; objects at " + JSON.stringify(objs().map(a => [a.x, a.y, ...cellOf(a)])) + " hero " + JSON.stringify([pl().x, pl().y, pl().vx]);
    const tx = to[0] * TILE + TILE / 2, ty = to[1] * TILE + TILE / 2;
    key(k, true);
    for (let n = 0; n < 600; n++) { await sleepFrames(1);
      const c = [o.x + o.w / 2, o.y + o.h / 2]; const rem = dx ? (tx - c[0]) * dx : (ty - c[1]) * dy;
      const v = Math.abs(dx ? pl().vx : pl().vy);
      if (rem <= v * v / (2 * 1700) + 1) break; }
    key(k, false); await sleepFrames(40);
    const c = cellOf(o); return (c[0] === to[0] && c[1] === to[1] && !o.destroyed) ? true : "object ended at " + c + " wanted " + to;
  }
  async function throwStone(stoneCell, bank) {
    const o = objAt(stoneCell[0], stoneCell[1]); if (!o) return "no stone";
    const near = [[stoneCell[0] - 1, stoneCell[1]], [stoneCell[0], stoneCell[1] - 1], [stoneCell[0] + 1, stoneCell[1]], [stoneCell[0], stoneCell[1] + 1]].filter(c => !blocked(c[0], c[1]));
    let ok = false; for (const c of near) { if (await goCell(c[0], c[1])) { ok = true; break; } } if (!ok) return "can't reach stone";
    key("e", true); await sleepFrames(2); key("e", false); await sleepFrames(10);
    if (pl().carrying == null) return "grab failed";
    const west = [bank[0] - 1, bank[1]];
    if (!(await goCell(west[0], west[1]))) return "can't reach bank"; 
    await axisTo("y", bank[1] * TILE + TILE / 2, 2); await axisTo("x", bank[0] * TILE + TILE / 2, 2);
    key("ArrowRight", true); await sleepFrames(1); key("ArrowRight", false); await sleepFrames(20);   // face the moat
    key("e", true); await sleepFrames(45); key("e", false); await sleepFrames(60);
    const so = objs().find(a => actorDefs[a.defId].temperament === "largestone" && cellOf(a)[0] >= 15 && cellOf(a)[0] <= 17);
    return so ? true : "stone did not land on the plates";
  }
  window.__bot = { goCell, pushRun, throwStone, cellOf, objs, sleepFrames, key, pl };
})()`;
(async () => {
  let src = fs.readFileSync(html, "utf8"); let page;
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await b.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
  page = await ctx.newPage(); page.on("console", m => { if (process.env.DEBUG) console.log("   [page] " + m.text()); }); const errs = []; page.on("pageerror", e => errs.push(e.message)); page.on("dialog", d => d.accept());
  const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
  const hooked = path.join(os.tmpdir(), "vault_bot_" + process.pid + ".html");
  fs.writeFileSync(hooked, src.replace(anchor, anchor + 'window.__ev=f=>eval("("+f+")");\n'));
  await page.goto("file://" + hooked + "#t"); await page.waitForTimeout(400);
  const E = (f) => page.evaluate(x => window.__ev(x)(), f.toString());
  await E(() => loadExampleGame(buildStonekeepersVaultGame, "v", { skipConfirm: true }));
  let target = page;
  if (doExport) {
    await E(() => { window.__dl = null; });
    const [dl] = await Promise.all([page.waitForEvent("download"), page.evaluate(() => window.__ev(() => exportStandaloneGame())())]);
    const f = path.join(os.tmpdir(), "vault_export_" + process.pid + ".html"); await dl.saveAs(f);
    const ex = await ctx.newPage(); ex.on("pageerror", e => errs.push("EXPORT " + e.message)); await ex.goto("file://" + f); await ex.waitForTimeout(800);
    // exports have no debug hook: add one by editing the exported source
    let t = fs.readFileSync(f, "utf8"); const marker = "// ===== MAIN LOOP"; 
    if (!/window\.__ev/.test(t)) { let i = t.lastIndexOf("})();"); if (i < 0) i = t.lastIndexOf("</script>"); t = t.slice(0, i) + "\nwindow.__ev=f=>eval('('+f+')');\n" + t.slice(i); fs.writeFileSync(f, t); await ex.goto("file://" + f); await ex.waitForTimeout(800); }
    target = ex;
  } else {
    await E(() => enterPlayMode()); 
  }
  const T = (f) => target.evaluate(x => window.__ev('()=>{const pl_=()=>actors.find(a=>a.isPlayer);return (' + x + ')()}')(), f.toString());
  await target.evaluate(DRIVER.startsWith("(") ? `window.__ev(()=>${DRIVER})()` : DRIVER);
  await target.waitForTimeout(1600);
  const exitCells = [[23, 8], [23, 8], null];
  let ok = true, lives0 = await T(() => lives);
  for (let ri = 0; ri < 3; ri++) {
    const sol = sols.find(s => s.room === ri); const W = 24;
    await T(() => { window.__room = currentRoomId; });
    const room = await T(() => currentRoomId); await target.evaluate(r => { window.__room = r; }, room);
    console.log("room " + (ri + 1) + ": playing " + sol.steps.length + " solver steps");
    // group consecutive pushes of one object along one direction
    const steps = sol.steps.map(s => ({ push: s.push, from: [s.hero % W, Math.floor(s.hero / W)], to: [s.to % W, Math.floor(s.to / W)], hero: s.hero }));
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i]; let r;
      if (s.push) {
        let j = i, last = s; const d = [Math.sign(s.to[0] - s.from[0]), Math.sign(s.to[1] - s.from[1])];
        while (j + 1 < steps.length && steps[j + 1].push && steps[j + 1].from[0] === last.to[0] && steps[j + 1].from[1] === last.to[1] && Math.sign(steps[j + 1].to[0] - steps[j + 1].from[0]) === d[0] && Math.sign(steps[j + 1].to[1] - steps[j + 1].from[1]) === d[1]) { j++; last = steps[j]; }
        r = await target.evaluate(a => window.__bot.pushRun(a[0], a[1]), [s.from, last.to]); i = j;
        if (shotDir && r === true) { /* leave screenshots to the final pass */ }
      } else {
        // a throw: the stone to throw is the stone nearest the plate block in the solver's state, located by the bank row
        const stones = await T(() => window.__bot.objs().filter(a => actorDefs[a.defId].temperament === "largestone").map(a => window.__bot.cellOf(a)));
        const near = stones.sort((a, b) => Math.abs(a[1] - s.from[1]) - Math.abs(b[1] - s.from[1]) + (a[0] - b[0]) * 0.001)[0];
        r = await target.evaluate(a => window.__bot.throwStone(a[0], a[1]), [near, s.from]);
      }
      console.log("   step " + (i + 1) + (s.push ? " push " : " throw ") + s.from + "->" + s.to + ": " + (r === true ? "ok" : "FAIL " + r)); if (r !== true) { ok = false; break; }
    }
    if (!ok) break;
    if (ri === 2) { // key and the goal
      const g = await target.evaluate(x => window.__ev(x)(), (async () => { const k = actors.find(a => a.defId === "colKey"); let r = await window.__bot.goCell(...window.__bot.cellOf(k)); if (r !== true) return "key " + r; await window.__bot.sleepFrames(10);
        r = await window.__bot.goCell(21, 14); return r === true ? true : "goal path " + r; }).toString());
      console.log("   key and goal: " + (g === true ? "ok" : "FAIL " + g)); if (g !== true) { ok = false; break; }
      await target.waitForTimeout(600);
    } else {
      const r = await target.evaluate(async () => { const r = await window.__bot.goCell(23, 8); return r; });
      await target.waitForTimeout(1200);
      const now = await T(() => currentRoomId); console.log("   walked to the exit door: room " + room + " -> " + now);
      if (now === room) { ok = false; break; }
      await target.evaluate(r => { window.__room = r; }, now);
      console.log("   arrived: " + JSON.stringify(await T(() => ({ room: currentRoomId, hero: [pl_().x, pl_().y], keys: Object.keys(keys).filter(k => keys[k]) }))));
    }
    if (shotDir) await target.screenshot({ path: path.join(shotDir, "bot-room" + (ri + 1) + ".png") });
  }
  await target.waitForTimeout(500);
  const end = await T(() => ({ sess: playSessionEnded, lives, room: currentRoomId }));
  console.log("END", JSON.stringify(end), "lives at start", lives0, "errors", JSON.stringify(errs));
  const pass = ok && end.sess === "win" && end.lives === lives0 && !errs.length;
  console.log(pass ? "BOT WON" : "BOT FAILED"); await b.close(); fs.unlinkSync(hooked); process.exit(pass ? 0 : 1);
})();
