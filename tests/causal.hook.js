// v2.54 Stage 1: causal-tagging debug counter for the Surprise Me suites (not deployed, off by default, not in the export).
// Injected into a TEMP copy of index.html. Every event gets an id and the id of the event that caused it; actors carry the id of the
// last event that acted on them (actor.__cause) so a cause can travel actor -> plate -> gate -> actor.
// Event: { id, f (frame), type, cause (id|null), subj (actor id|null), char (a character was involved) }
module.exports = function hook() { return `
  window.__cz = { on: false, events: [], frame: 0, n: 0 };
  const __cellCause = {}; let __curDet = null, __impact = null;
  const __isChar = a => !!a && (a.isPlayer || (typeof isSteeringCharacter === "function" && actorDefs[a.defId] && isSteeringCharacter(actorDefs[a.defId].temperament)));
  const __emit = (type, subj, cause, subj2) => {
    const z = window.__cz; if (!z.on) return null;
    if (cause == null && subj && subj.__cause != null) cause = subj.__cause;
    const prev = cause != null ? z.events[cause - 1] : null;
    if (prev && prev.type === type && subj && prev.subj === subj.id) { return cause; } // repeats of one thing on one actor are one link
    const id = ++z.n;
    z.events.push({ id, f: z.frame, type, cause: cause == null ? null : cause, subj: subj ? subj.id : null, char: __isChar(subj) || __isChar(subj2) });
    if (subj) subj.__cause = id; if (subj2) subj2.__cause = id;
    return id;
  };
  window.__czEmit = __emit;
  { const o = spawnActorAt; spawnActorAt = function () { const a = o.apply(this, arguments); if (a) __emit("spawn", a, null); return a; }; }
  { const o = triggerCannon; triggerCannon = function (actor) { const had = !!actor.cannonLoad; const r = o.apply(this, arguments); if (!had && actor.cannonLoad) __emit("cannonLoad", actor); return r; }; }
  { const o = fireLoadedCannon; fireLoadedCannon = function (actor) { const r = o.apply(this, arguments); __emit("cannonFire", actor); return r; }; }
  { const o = triggerFlip; triggerFlip = function (actor, gx, gy) { const r = o.apply(this, arguments); const col = (typeof colorAt === "function") ? colorAt(gx, gy) : null; const id = __emit("buttonPress", actor); if (col) window.__czColorCause[col] = id; return r; }; }
  window.__czColorCause = {};
  { const o = exchangeAlong; exchangeAlong = function (a, b) { const r = o.apply(this, arguments); __emit("shove", a, null, b); return r; }; }
  { const o = tryCrushNpc; tryCrushNpc = function (crusher, target) { const r = o.apply(this, arguments); if (r) __emit("squash", crusher, null, target); return r; }; }
  { const o = tryImpactDetonate; tryImpactDetonate = function (striker, bomb) { __impact = { striker, bomb }; try { return o.apply(this, arguments); } finally { __impact = null; } }; }
  { const o = triggerBombArm; triggerBombArm = function (gx, gy) { const near = actors.filter(a => Math.hypot(a.x + a.w / 2 - (gx * TILE + 16), a.y + a.h / 2 - (gy * TILE + 16)) < 60).sort((a, b) => (b.__cause || 0) - (a.__cause || 0))[0]; const id = __emit("bombArm", near || null, null); if (id != null) __cellCause[gx + "," + gy] = id; return o.apply(this, arguments); }; }
  { const o = startOrResumeBombFuse; startOrResumeBombFuse = function (obj) { const armed = obj.fuseTimerId != null; const r = o.apply(this, arguments); if (!armed && obj.fuseTimerId != null) __emit("bombArm", obj); return r; }; }
  { const o = detonateCarriedBombAt; detonateCarriedBombAt = function (roomId, actorId) {
      const list = roomId === currentRoomId ? actors : ((rooms.find(r => r.id === roomId) || {}).actors || []); const b = list.find(a => a.id === actorId);
      if (b && !b.detonating && __impact && __impact.bomb === b) __emit("impact", __impact.striker, null, b);
      if (b && !b.detonating && __curDet != null) b.__cause = __curDet;
      return o.apply(this, arguments); }; }
  { const o = detonateBombAt; detonateBombAt = function (roomId, gx, gy) {
      const hot = roomId === currentRoomId; const bd = hot ? board : (rooms.find(r => r.id === roomId) || { board: null }).board;
      const before = bd ? bd.map(r => r.slice()) : null;
      const bombActor = (hot ? actors : []).find(a => a.detonating && Math.floor((a.x + a.w / 2) / TILE) === gx && Math.floor((a.y + a.h / 2) / TILE) === gy);
      let cause = __curDet != null ? __curDet : (bombActor && bombActor.__cause != null ? bombActor.__cause : (__cellCause[gx + "," + gy] != null ? __cellCause[gx + "," + gy] : null));
      const z = window.__cz; let id = null;
      if (z.on) { id = ++z.n; z.events.push({ id, f: z.frame, type: "detonate", cause, subj: bombActor ? bombActor.id : null, char: false }); if (bombActor) bombActor.__cause = id; }
      const saved = __curDet; if (id != null) __curDet = id;
      try { return o.apply(this, arguments); } finally {
        __curDet = saved;
        if (id != null && bd) {
          for (let y = 0; y < ROWS; y++) for (let x = 0; x < bd[0].length; x++) if (before[y][x] && !bd[y][x] && !(x === gx && y === gy)) {
            const bid = ++z.n; z.events.push({ id: bid, f: z.frame, type: "blastClear", cause: id, subj: null, char: false }); __cellCause[x + "," + y] = bid;
          }
          (hot ? actors : []).forEach(a => { if (!a.detonating && Math.abs(Math.floor((a.x + a.w / 2) / TILE) - gx) + Math.abs(Math.floor((a.y + a.h / 2) / TILE) - gy) <= 1) { a.__cause = id; const e = { id: ++z.n, f: z.frame, type: "blastHit", cause: id, subj: a.id, char: __isChar(a) }; z.events.push(e); a.__cause = e.id; } });
        } } }; }
  { const o = triggerHazard; triggerHazard = function (actor) { const r = o.apply(this, arguments); if (r) __emit("hit", actor); return r; }; }
  { const o = triggerNpcCatch; triggerNpcCatch = function (player, npc) { __emit("hit", player, npc ? npc.__cause : null); return o.apply(this, arguments); }; }
  { const o = triggerNpcLethalReset; triggerNpcLethalReset = function (actor) { __emit("lethal", actor); __emit("respawn", actor); return o.apply(this, arguments); }; }
  { const o = destroyPhysicsObjectInLethal; destroyPhysicsObjectInLethal = function (actor) { __emit("lethal", actor); return o.apply(this, arguments); }; }
  { const o = respawnAtCheckpoint; respawnAtCheckpoint = function () { const p = actors.find(a => a.isPlayer); __emit("respawn", p || null); return o.apply(this, arguments); }; }
  { const o = triggerGravityWellCapture; triggerGravityWellCapture = function (actor) { __emit("capture", actor); return o.apply(this, arguments); }; }
  { const o = triggerPlayerGravityWellCapture; triggerPlayerGravityWellCapture = function (p) { __emit("capture", p); return o.apply(this, arguments); }; }
  { const o = triggerWarp; triggerWarp = function (p) { __emit("warp", p); return o.apply(this, arguments); }; }
  { const o = applyWorldWrap; applyWorldWrap = function (a) { const x = a.x, y = a.y; const r = o.apply(this, arguments); if (a.x !== x || a.y !== y) __emit("wrap", a); return r; }; }
  const __fan = {}, __belt = {}, __pull = {};
  { const o = fanAccelFor; fanAccelFor = function (actor) { const r = o.apply(this, arguments); if (actor && r && Math.abs(r.ax) + Math.abs(r.ay) > 1) __fan[actor.id] = r.ay < -1 ? "fanLift" : "fanPush"; return r; }; }
  { const o = windAccelFor; windAccelFor = function (actor) { const r = o.apply(this, arguments); if (actor && r && Math.abs(r.ax) + Math.abs(r.ay) > 1 && actor.grounded) __belt[actor.id] = true; return r; }; }
  { const o = radialForceAccelFor; radialForceAccelFor = function (actor) { const r = o.apply(this, arguments); if (actor && !actor.isPlayer && r && Math.abs(r.ax) + Math.abs(r.ay) > 200) __pull[actor.id] = true; return r; }; }
  let __prevPull = {}, __prevFan = {}, __prevBelt = {}, __prevCh = {}, __prevV = {}, __prevG = {};
  window.__czPoll = () => {
    const z = window.__cz; if (!z.on) return;
    const byId = {}; actors.forEach(a => { byId[a.id] = a; });
    for (const id in __fan) if (!__prevFan[id] && byId[id]) __emit(__fan[id], byId[id]);
    for (const id in __belt) if (!__prevBelt[id] && byId[id]) __emit("beltCarry", byId[id]);
    for (const id in __pull) if (!__prevPull[id] && byId[id]) __emit("pull", byId[id]);
    __prevPull = Object.assign({}, __pull); for (const k in __pull) delete __pull[k];
    __prevFan = Object.assign({}, __fan); __prevBelt = Object.assign({}, __belt); for (const k in __fan) delete __fan[k]; for (const k in __belt) delete __belt[k];
    // bounces and falls from velocity / grounded edges
    actors.forEach(a => {
      if (a.carried || a.detonating || a.cannonLoad || a.isMover) return;
      const pv = __prevV[a.id], pg = __prevG[a.id];
      if (pv) {
        const flipY = pv.vy > 150 && a.vy < -150 && !a.ballistic, flipX = Math.abs(pv.vx) > 150 && a.vx * pv.vx < 0 && Math.abs(a.vx) > 100;
        if (flipY || flipX) {
          const cx = Math.floor((a.x + a.w / 2) / TILE), cy = Math.floor((a.y + a.h) / TILE);
          const t = (flipY && board[cy] && GAMEPLAY_TILE_DEFS[board[cy][cx]]) || null; __emit(t && t.geometry === "trampoline" ? "trampolineLaunch" : "bounce", a);
        }
      }
      if (a.grounded) a.__falling = false;
      else if (!a.__falling && a.vy >= 0 && gravityOn() && !a.carried) {
        const x0 = Math.floor(a.x / TILE), x1 = Math.floor((a.x + a.w - 0.01) / TILE), cy = Math.floor((a.y + a.h + 1) / TILE);
        let c = null; for (let x = x0; x <= x1; x++) { const k = __cellCause[x + "," + cy]; if (k != null && (c == null || k > c)) c = k; }
        if (c != null) { __emit("fall", a, c); a.__falling = true; }
      }
      __prevV[a.id] = { vx: a.vx, vy: a.vy }; __prevG[a.id] = a.grounded;
    });
    // channel edges: plate on/off (or a button's permanent flip), and the gates of that color opening/closing
    const now = {}; CHANNEL_COLORS.forEach(c => { now[c] = !!isChannelOn(c); });
    CHANNEL_COLORS.forEach(c => {
      if (!!now[c] === !!__prevCh[c]) return;
      let src = null, fromPlate = false;
      for (const a of actors) for (const cell of overlappedCells(a)) if (geometryAt(cell.cx, cell.cy) === "plate" && colorAt(cell.cx, cell.cy) === c && (a.__cause != null)) { if (src == null || a.__cause > src) src = a.__cause; fromPlate = true; }
      if (!fromPlate) for (const a of actors) for (const cell of overlappedCells(a)) if (geometryAt(cell.cx, cell.cy) === "plate" && colorAt(cell.cx, cell.cy) === c) fromPlate = true;
      let evId = null;
      if (fromPlate) { evId = ++z.n; z.events.push({ id: evId, f: z.frame, type: now[c] ? "plateOn" : "plateOff", cause: src, subj: null, char: false }); }
      else if (window.__czColorCause[c] != null) evId = window.__czColorCause[c];
      else if (!now[c]) { evId = ++z.n; z.events.push({ id: evId, f: z.frame, type: "plateOff", cause: null, subj: null, char: false }); }
      const gates = []; for (let y = 0; y < ROWS; y++) for (let x = 0; x < board[0].length; x++) if (colorBoard[y][x] === c && /^(barrier|solid)/.test(String(board[y][x]))) gates.push([x, y]);
      if (gates.length && evId != null) { const gid = ++z.n; z.events.push({ id: gid, f: z.frame, type: now[c] ? "gateOpen" : "gateClose", cause: evId, subj: null, char: false }); gates.forEach(([x, y]) => { __cellCause[x + "," + y] = gid; });
        if (now[c]) actors.forEach(a => { // whatever was held against the gate is released by it
          if (gates.some(([gx, gy]) => a.x < (gx + 1) * TILE + 4 && a.x + a.w > gx * TILE - 4 && a.y < (gy + 1) * TILE + 4 && a.y + a.h > gy * TILE - 4)) __emit("released", a, gid);
        }); }
    });
    window.__czColorCause = {}; __prevCh = now;
  };
  window.__czStart = () => { window.__cz = { on: true, events: [], frame: 0, n: 0 }; __prevCh = {}; __prevFan = {}; __prevBelt = {}; __prevPull = {}; __prevV = {}; __prevG = {}; for (const k in __cellCause) delete __cellCause[k]; window.__czColorCause = {}; actors.forEach(a => { delete a.__cause; }); };
  window.__czStop = () => { window.__cz.on = false; return window.__cz; };
  window.__czTick = n => { for (let i = 0; i < n; i++) { window.__cz.frame++; tick(1 / 60); window.__czPoll(); } };
`; };
