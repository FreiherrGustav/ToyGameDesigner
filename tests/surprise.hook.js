// Shared test hook for the Surprise Me suites (not deployed). Returns the source injected into a TEMP copy of
// index.html (the repo file stays clean). Includes the debug-only interaction counter: it wraps the engine's own
// reaction functions in the copy, so nothing is added to the product or the export.
module.exports = function hook() { return `
  window.__ia = { on: false, counts: {}, first: {}, frame: 0, log: [] };
  const __ev = (type, extra) => { const ia = window.__ia; if (!ia.on) return; ia.counts[type] = (ia.counts[type] || 0) + 1; if (!(type in ia.first)) ia.first[type] = ia.frame; if (ia.log.length < 400) ia.log.push([ia.frame, type]); };
  const __wrap = (name, fn, type) => { /* placeholder to keep the list readable */ };
  { const o = detonateBombAt; detonateBombAt = function () { __ev("explosion"); return o.apply(this, arguments); }; }
  { const o = detonateCarriedBombAt; detonateCarriedBombAt = function () { __ev("explosion"); return o.apply(this, arguments); }; }
  { const o = triggerGravityWellCapture; triggerGravityWellCapture = function () { __ev("blackHole"); return o.apply(this, arguments); }; }
  { const o = triggerPlayerGravityWellCapture; triggerPlayerGravityWellCapture = function () { __ev("blackHole"); return o.apply(this, arguments); }; }
  { const o = attachCarryable; attachCarryable = function () { __ev("carry"); return o.apply(this, arguments); }; }
  { const o = triggerHazard; triggerHazard = function () { const r = o.apply(this, arguments); if (r) __ev("hit"); return r; }; }
  { const o = triggerNpcCatch; triggerNpcCatch = function () { __ev("hit"); return o.apply(this, arguments); }; }
  { const o = triggerNpcLethalReset; triggerNpcLethalReset = function () { __ev("respawn"); return o.apply(this, arguments); }; }
  { const o = respawnAtCheckpoint; respawnAtCheckpoint = function () { __ev("respawn"); return o.apply(this, arguments); }; }
  { const o = triggerFlip; triggerFlip = function () { __ev("buttonPress"); return o.apply(this, arguments); }; }
  { const o = fireLoadedCannon; fireLoadedCannon = function () { __ev("cannon"); return o.apply(this, arguments); }; }
  { const o = destroyPhysicsObjectInLethal; destroyPhysicsObjectInLethal = function () { __ev("lava"); return o.apply(this, arguments); }; }
  { const o = triggerBombArm; triggerBombArm = function () { __ev("bombArm"); return o.apply(this, arguments); }; }
  { const o = triggerWarp; triggerWarp = function () { __ev("warp"); return o.apply(this, arguments); }; }
  { const o = spawnActorAt; spawnActorAt = function () { __ev("spawn"); return o.apply(this, arguments); }; }
  { const o = applyWorldWrap; applyWorldWrap = function (a) { const x = a.x, y = a.y; const r = o.apply(this, arguments); if (a.x !== x || a.y !== y) __ev("wrap"); return r; }; }
  { const o = fanAccelFor; fanAccelFor = function (actor) { const r = o.apply(this, arguments); if (actor && !actor.isPlayer && r && (Math.abs(r.ax) + Math.abs(r.ay)) > 1) __ev("fanPush"); return r; }; }
  { const o = windAccelFor; windAccelFor = function (actor) { const r = o.apply(this, arguments); if (actor && !actor.isPlayer && r && (Math.abs(r.ax) + Math.abs(r.ay)) > 1) __ev("beltRide"); return r; }; }
  { const o = radialForceAccelFor; radialForceAccelFor = function (actor) { const r = o.apply(this, arguments); if (actor && !actor.isPlayer && r && (Math.abs(r.ax) + Math.abs(r.ay)) > 200) __ev("pull"); return r; }; }
  { const o = sounds.boing; sounds.boing = function () { __ev("bounce"); return o.apply(this, arguments); }; }
  { const o = sounds.trampolineBoing; sounds.trampolineBoing = function () { __ev("bounce"); return o.apply(this, arguments); }; }
  { const o = triggerBouncyLaunch; triggerBouncyLaunch = function () { __ev("bounce"); return o.apply(this, arguments); }; }
  window.__iaPrev = {};
  window.__iaPoll = () => { // channel edges: a plate/button channel turning on, and a gate of that color opening
    const ia = window.__ia; if (!ia.on) return;
    const now = {};
    CHANNEL_COLORS.forEach(c => { now[c] = !!isChannelOn(c); });
    CHANNEL_COLORS.forEach(c => { if (now[c] && !window.__iaPrev[c]) {
      __ev("plateOn");
      let gate = false; for (let y = 0; y < ROWS && !gate; y++) for (let x = 0; x < board[0].length; x++) { if (colorBoard[y][x] === c && String(board[y][x]).startsWith("barrier")) { gate = true; break; } }
      if (gate) __ev("gateOpen");
    } });
    window.__iaPrev = now;
  };
  window.__iaStart = () => { window.__ia = { on: true, counts: {}, first: {}, frame: 0, log: [] }; window.__iaPrev = {}; };
  window.__iaStop = () => { window.__ia.on = false; return window.__ia; };
  window.__iaTick = n => { for (let i = 0; i < n; i++) { window.__ia.frame++; tick(1 / 60); window.__iaPoll(); } };
`; };
