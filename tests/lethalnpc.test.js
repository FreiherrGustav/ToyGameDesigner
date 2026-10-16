// Lethal / harmless NPC characters. Usage: node tests/lethalnpc.test.js
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const anchor = 'if (loadAutosave()) log("Welcome back! Restored your last auto-saved session.");\n  updateUndoRedoButtons();\n';
if (!src.includes(anchor)) throw new Error("anchor missing");
const tmp = path.join(os.tmpdir(), "lethalnpc_hooked.html");
fs.writeFileSync(tmp, src.replace(anchor, anchor + `window.__ev=f=>eval("("+f+")");`));
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; console.log("ok  ", m); } else { fails.push(m); console.log("FAIL", m); } };
const ev = (pg, code) => pg.evaluate(c => window.__ev(c)(), code);

// a fresh Play session with the player and one NPC of the given kind sitting on top of it
const SCENE = `(kind, lethal, opts)=>{
  suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false;
  loadStarterBoard();
  const id = defaultDefIdForKind(kind), def = actorDefs[id];
  if (lethal === undefined) delete def.lethal; else def.lethal = lethal;
  const p = actors.find(a => a.isPlayer);
  selectedActorDefId = id; paintMode = "actor";
  placeNewActor(p.x + p.w / 2, p.y + p.h / 2);
  enterPlayMode(); playReadyUntil = null;
  const npc = actors[actors.length - 1];
  if (opts && opts.lives) lives = opts.lives;
  if (opts && opts.hearts) spareHearts = opts.hearts;
  if (opts && opts.star) starTimer = 5000;
  const lives0 = lives, hearts0 = spareHearts, n0 = actors.length;
  for (let i = 0; i < 4; i++) tick(1 / 60);
  return { lives0, lives, hearts0, hearts: spareHearts, ended: playSessionEnded, resetPending: levelResetPending, alive: actors.includes(npc) };
}`;

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = []; page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept()); page.on("console", async m => { if (m.text().includes("unexpected error")) { const st = await m.args()[1].evaluate(e => e && e.stack).catch(() => ""); console.log("CONSOLE:", String(st).split("\n").slice(0, 5).join(" | ")); } });
  await page.goto("file://" + tmp + "#t"); await page.waitForFunction(() => window.__ev);
  const scene = (kind, lethal, opts) => page.evaluate(([s, k, l, o]) => window.__ev(s)(k, l, o), [SCENE, kind, lethal === undefined ? undefined : lethal, opts || null]);

  // ---- defaults: new characters are lethal ----
  const defaults = await ev(page, `()=>{ suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false;
    return TEMPERAMENTS.map(t => [t, actorDefs[findDefaultActorDef(t)].lethal]); }`);
  ok(defaults.every(([, v]) => v === true), "the four built-in characters start lethal " + JSON.stringify(defaults));
  const custom = await ev(page, `()=>{ const plus = [...document.querySelectorAll("#customActorSwatches .swatch")].pop(); plus.click(); const id = customActorSlotIds[customActorSlotIds.length - 1]; return actorDefs[id].lethal; }`);
  ok(custom === true, "a new custom character starts lethal");

  // ---- behavior per kind: lethal costs a life, harmless doesn't, legacy (no field) keeps its old behavior ----
  for (const kind of ["stationary", "wanderer", "chaser", "fleer"]) {
    const L = await scene(kind, true), H = await scene(kind, false), G = await scene(kind, undefined);
    ok(L.lives === L.lives0 - 1, `${kind} lethal: touching it costs a life (${L.lives0} -> ${L.lives})`);
    ok(H.lives === H.lives0, `${kind} harmless: no life lost (${H.lives0} -> ${H.lives})`);
    const legacyLethal = kind === "chaser";
    ok(G.lives === G.lives0 - (legacyLethal ? 1 : 0), `${kind} with no saved choice (old project) behaves as before: ${legacyLethal ? "lethal" : "harmless"}`);
  }
  // hearts, star
  const heart = await scene("wanderer", true, { hearts: 2 });
  ok(heart.lives === heart.lives0 && heart.hearts === 1, `a spare heart absorbs a lethal wanderer (hearts ${heart.hearts0} -> ${heart.hearts})`);
  const star = await scene("wanderer", true, { star: true });
  ok(star.lives === star.lives0, "a star makes a lethal wanderer harmless for a while");
  // game over on the last life
  const last = await scene("wanderer", true, { lives: 1 });
  ok(last.ended === "gameover" || last.lives === 0, "a lethal wanderer ends the game on the last life " + JSON.stringify(last));
  // a harmless wanderer made by a spawner still pops when touched (its old population rule), a lethal one doesn't
  // (not exercised here: spawner behavior is unchanged for harmless, and lethal follows the chaser path which never despawned)

  // ---- Build mode: lethal sends you back to the start without any stakes ----
  await ev(page, "()=>{ if (appMode === 'play') exitToBuildMode(); }");
  const build = await ev(page, `()=>{ suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false; loadStarterBoard();
    const def = actors; const id = defaultDefIdForKind("wanderer"); actorDefs[id].lethal = true;
    const p = actors.find(a => a.isPlayer); selectedActorDefId = id; paintMode = "actor"; placeNewActor(p.x + 100, p.y + p.h / 2 - 40);
    const npc = actors[actors.length - 1]; npc.x = p.x; npc.y = p.y; const l0 = lives;
    for (let i = 0; i < 4; i++) tick(1 / 60); return { appMode, lives: lives === l0 }; }`);
  ok(build.appMode === "build" && build.lives, "Build mode: no stakes, lives untouched");

  // ---- the palette picker ----
  await page.evaluate(() => window.__ev("()=>{ if (appMode === 'play') exitToBuildMode(); suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false; selectActorKind('stationary'); }")());
  const sw = () => page.evaluate(() => { const b = document.getElementById("lethalPickerBlock"); return { shown: b.style.display !== "none", sel: [...document.querySelectorAll("#lethalPickerSwatches .swatch")].map(s => s.classList.contains("selected")), name: document.getElementById("lethalPickerName").textContent }; });
  await page.evaluate(() => [...document.querySelectorAll("#characterSwatches .swatch")][1].click());   // wanderer
  let u = await sw();
  ok(u.shown && u.sel[0] && !u.sel[1], `picking the built-in wanderer shows the picker with "lethal" selected (${u.name})`);
  await page.evaluate(() => document.querySelectorAll("#lethalPickerSwatches .swatch")[1].click());
  u = await sw();
  ok(u.sel[1] && (await ev(page, "()=>actorDefs[defaultDefIdForKind('wanderer')].lethal")) === false, "clicking harmless stores lethal: false and highlights it");
  await page.evaluate(() => [...document.querySelectorAll("#characterSwatches .swatch")][2].click());   // chaser
  u = await sw(); ok(u.shown && u.sel[0], "the chaser's own picker is separate (still lethal)");
  await page.evaluate(() => document.querySelector("#playerSwatchRow .swatch").click());
  u = await sw(); ok(!u.shown, "no picker for the player");
  await ev(page, "()=>selectGeometry('goal')"); u = await sw(); ok(!u.shown, "no picker on the Objects tab");
  await page.evaluate(() => [...document.querySelectorAll("#customActorSwatches .swatch")].pop().click());   // the "+" makes a custom character and selects it
  u = await sw(); ok(u.shown, "the picker shows for a custom character");
  // an old project's character (no saved choice) shows its legacy state
  await ev(page, "()=>{ const id = defaultDefIdForKind('wanderer'); delete actorDefs[id].lethal; }");
  await page.evaluate(() => [...document.querySelectorAll("#characterSwatches .swatch")][1].click());
  u = await sw(); ok(u.sel[1] && !u.sel[0], "a wanderer saved before this choice reads harmless (its old behavior)");

  // ---- save / restore ----
  const rt = await ev(page, `()=>{ const id = defaultDefIdForKind("fleer"); actorDefs[id].lethal = false; const s = structuredClone(captureProjectSnapshot()); suppressHistory = true; restoreProjectSnapshot(s); suppressHistory = false; return actorDefs[defaultDefIdForKind("fleer")].lethal; }`);
  ok(rt === false, "the choice survives a project snapshot round trip");

  // ---- export: the standalone game has the same behavior ----
  const [dl] = await Promise.all([page.waitForEvent("download"), (async () => {
    await ev(page, `()=>{ suppressHistory = true; restoreProjectSnapshot(structuredClone(FACTORY_DEFAULT_SNAPSHOT)); suppressHistory = false; loadStarterBoard();
      const id = defaultDefIdForKind("wanderer"); actorDefs[id].lethal = true; const p = actors.find(a => a.isPlayer);
      selectedActorDefId = id; paintMode = "actor"; placeNewActor(p.x + p.w / 2 + 300, p.y + p.h / 2); }`);
    await page.click("#exportBtn");
  })()]);
  const f = path.join(os.tmpdir(), "lethalnpc_export.html"); await dl.saveAs(f);
  let html = fs.readFileSync(f, "utf8");
  ok(html.includes("function npcIsLethal") && html.includes("function triggerNpcCatch"), "export contains npcIsLethal and triggerNpcCatch");
  const bootAnchor = "playReadyUntil = gameNow() + READY_DURATION_MS;\n  renderPlayHUD();";
  ok(html.includes(bootAnchor), "export boot anchor present");
  const hooked = path.join(os.tmpdir(), "lethalnpc_export_hooked.html");
  fs.writeFileSync(hooked, html.replace(bootAnchor, bootAnchor + " window.__ev = f => eval('(' + f + ')');"));
  const q = await browser.newPage(); const qerr = []; q.on("pageerror", e => qerr.push(String(e)));
  await q.goto("file://" + hooked); await q.waitForFunction(() => window.__ev);
  const ex = await q.evaluate(() => window.__ev(`()=>{ playReadyUntil = null; const p = actors.find(a => a.isPlayer); const npc = actors.find(a => !a.isPlayer && actorDefs[a.defId].temperament === "wanderer");
    const l0 = lives; npc.x = p.x; npc.y = p.y; npc.vx = 0; npc.vy = 0; for (let i = 0; i < 4; i++) tick(1 / 60); return { l0, lives, lethal: actorDefs[npc.defId].lethal }; }`)());
  ok(ex.lethal === true && ex.lives === ex.l0 - 1, `exported game: a lethal wanderer costs a life (${ex.l0} -> ${ex.lives})`);
  ok(qerr.length === 0, "export: no errors " + qerr.join(";"));
  ok(errors.length === 0, "no page errors " + errors.slice(0, 2).join(";"));
  await browser.close();
  console.log(`\n${pass} passed, ${fails.length} failed`); if (fails.length) { console.log(fails.join("\n")); process.exit(1); }
})().catch(e => { console.error(e); process.exit(2); });
