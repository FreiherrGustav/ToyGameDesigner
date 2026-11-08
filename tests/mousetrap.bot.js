// Keep-away bot for the Mousetrap entry (not deployed). node tests/mousetrap.bot.js [fps=60] [maxSecs=40]
// The bot only reads positions. It waits at one end of the hall; when Mousecop gets close it jumps over him toward the other end.
// Parameters (standR, standL: where it waits at each end, in tiles; closeGap: how near Mousecop gets before the jump)
// are searched; a run "catches" if Mousecop is inside the cage (x between the two gates) when the red gates close.
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const FPS = Number(process.argv[2] || 60), MAXS = Number(process.argv[3] || 40);
const def = require(path.resolve(__dirname, "mousetrap.entry.json"))[0];
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
const HOOK = `window.__go = (def, P, fps, maxS, noChaser) => { SURPRISE_TEMPLATES.push(def); surpriseRecent.length = 0;
  const r = surpriseMe(1, { templateIds: [def.id], canonical: true, chaos: false, mirror: false }); if (!r || r.failed) return { fail: 1 };
  enterPlayMode(); playReadyUntil = null; tick(1 / fps);
  const pl = actors.find(a => a.isPlayer), mc = actors.find(a => { const d = actorDefs[a.defId]; return d && d.temperament === "chaser"; });
  if (noChaser && mc) { removeActorById(mc.id); }
  window.__dl = []; const dt = 1 / fps, T = x => x * TILE; let jumpDir = "L", mode = "wait", side = "R", jumpedAt = -9, closedAt = null, mcAtClose = null, lives0 = lives, deaths = 0, redOn = true, frame = 0;
  const K = keys; const set = (l, r, j) => { K.ArrowLeft = l; K.ArrowRight = r; K[" "] = j; };
  let lastLives = lives;
  for (; frame < maxS * fps; frame++) {
    const px = pl.x / TILE, mx = mc ? mc.x / TILE : -99, gap = Math.abs(px - mx), mcSide = mx < px ? "L" : "R";
    if (P.tau != null && frame >= (P.tClose - P.tau) * fps) side = "L"; const stand = side === "R" ? P.standR : P.standL;
    if (mode === "wait") {
      // walk to the standing spot, then stand; jump when Mousecop is close
      if (px < stand - 0.25) set(false, true, false); else if (px > stand + 0.25) set(true, false, false); else set(false, false, false);
      if (mc && gap < P.closeGap && pl.grounded) { mode = "jump"; jumpedAt = frame; jumpDir = mx < px ? "L" : "R"; }
    } else if (mode === "jump") {
      const dirToward = jumpDir;
      set(dirToward === "L", dirToward === "R", frame - jumpedAt < 6);
      if (pl.grounded && frame - jumpedAt > 12) { if (P.tau == null || frame < (P.tClose - P.tau) * fps) side = side === "R" ? "L" : "R"; mode = "wait"; }
    }
    const before = lives; tick(dt);
    if (!pl.isPlayer) break;
    if (lives < lastLives) { deaths++; lastLives = lives; if (window.__dl) window.__dl.push([frame, +(pl.x/TILE).toFixed(1), +(pl.y/TILE).toFixed(1), +(mx).toFixed(1), mode]); }
    const redNow = typeof isChannelOn === "function" ? isChannelOn("red") : true;
    if (redOn && !redNow) { closedAt = frame; mcAtClose = mc ? mc.x / TILE : null; redOn = false; break; }
    if (playSessionEnded) break;
  }
  return { dl: window.__dl, closedAt, tClosed: closedAt == null ? null : +(closedAt / fps).toFixed(2), mcAtClose, deaths, frame, px: pl.x / TILE };
};`;
const tmp = path.join(os.tmpdir(), "mousetrap_bot.html"); fs.writeFileSync(tmp, src.replace(anchor, anchor + HOOK));
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const run = async (P, noChaser) => { const p = await b.newPage(); p.on("pageerror", e => console.log("PAGEERROR", e.message));
    await p.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    await p.goto("file://" + tmp + "#t"); await p.waitForFunction(() => window.__go);
    const r = await p.evaluate(([d, P, f, m, n]) => window.__go(d, P, f, m, n), [def, P, FPS, MAXS, noChaser]); await p.close(); return r; };
  const base = await run({ standR: 21, standL: 2, closeGap: 3 }, true);
  console.log("machine alone: gates close at", base.tClosed, "s");
  const wins = [];
  for (const standR of [20]) for (const standL of [2]) for (const closeGap of [2, 2.5, 3]) for (const tau of [2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 7]) {
    const P = { standR, standL, closeGap, tau, tClose: base.tClosed }; const r = await run(P, false);
    const inCage = r.mcAtClose != null && r.mcAtClose > 10 && r.mcAtClose < 16.0; 
    console.log(closeGap, tau, r.mcAtClose && r.mcAtClose.toFixed(1), r.px.toFixed(1), r.deaths); if (inCage && r.deaths === 0 && (r.px > 16.9 || r.px < 8.3)) wins.push({ P, r });
  }
  console.log("winning parameter sets:", wins.length); wins.slice(0, 30).forEach(w => console.log(JSON.stringify(w)));
  await b.close();
})();
