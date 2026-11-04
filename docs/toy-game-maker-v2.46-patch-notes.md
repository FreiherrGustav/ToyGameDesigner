# Toy Game-Maker v2.46 — Movers: lanes of things that carry you or hurt you (PROPOSAL, not implemented)

Status: **design only**. Nothing in `index.html` has changed. This is the Phase 1 write-up for the
"Crossing Guard" sample (see `prototypes/crossing-guard-test.html` for the Phase 0 measurements this
design is built on). The user decides whether it ships. The label "v2.46" follows the power-ups
(v2.44) and Surprise Me (v2.45) sections in CLAUDE.md; labels are informal (see "Version labels are
not reliable").

Files the brief mentioned that **do not exist** in this repo: `object-interaction-matrix.md` (the
matrix lives inside CLAUDE.md's "Object-to-object interaction matrix" section, so the new rows are
given in section 12 below and would go there), `LEVEL_DESIGN_PROCESS.md`, and any earlier
`*-patch-notes.md` (CLAUDE.md sections are the existing "patch note" format; this file follows that
voice: why first, then mechanics, then export/compat, then verification plan).

## 1. What it is, and why not just the existing Moving Platform

A **mover** is a placed object that travels at one fixed speed along one axis of a lane and loops
forever. It never changes speed and never reacts to anything: a closed rule, not scripting. It comes
in two kinds, as one object with one flag:

- **floats** (log, turtle, rubber duck, sleeping crocodile): carries whatever overlaps it, and makes
  water safe underneath whoever it is carrying.
- **hurts** (scooter, shopping cart): carries nothing; touching it applies the plain Hazard reaction.

The repo already has a **Moving Platform** (`MOVING_PLATFORM_KIND`, v2.x): an immovable-but-standable
actor that swings ±4 tiles on a triangle wave, and a general riding step in `tick()` (a standable
object's frame delta is applied to whoever rests on it). Movers cannot reuse either as-is:

- Moving Platform *swings back and forth* and is solid-standable; a mover must *loop forever* (so a
  lane never runs out) and is not solid.
- The riding step is keyed to "bottom edge within `RIDE_CONTACT_EPSILON` of a standable's top edge"
  and was deliberately made **gravity-only** (the south-push stutter fix). Movers need riding by
  *center overlap*, which is meaningful with no gravity.

So movers are a new actor kind that borrows the Moving Platform's *shape* (self-driven branch in
`stepActor`, click-to-change, `resetActorsToSpawn` resets its phase) and writes a separate carry step.
The existing riding step is left untouched, so nothing can be double-carried.

## 2. The object and its two kinds

- One actor temperament, `MOVER_KIND` (`"mover"`). Per-instance fields: `moverKind` (`"floats"` |
  `"hurts"`), `moverDir` (`"n"|"e"|"s"|"w"`, default `"s"`), `moverT` (seconds travelled, transient),
  plus the def's `lenTiles` (along travel), `wTiles` (across the lane), `speedTier`.
- **Presets, not a generic editor** (the toy rule: pieces, not parameters). Each preset is a built-in
  `actorDefs` entry, exactly like collectible presets: scooter (hurts, 1 long, fast), shopping cart
  (hurts, 1 long, slow), rubber duck (floats, 1, medium), turtle (floats, 2, medium), log (floats, 4,
  slow), sleeping crocodile (floats, 6, very slow). All are `wTiles = 2` so a lane is 2 tiles wide.
- **Speed tiers** are a closed list: slow 60, medium 110, fast 180 px/s (`MOVER_SPEEDS`). Phase 0
  limits: cars should stay at or below ~120px/s with gaps of 4+ tiles to leave a human window; floats
  at or below ~220px/s and at least 4 tiles long. The tiers sit inside that.
- A mover never reacts to anything and is immune to every optional force: it is excluded the same way
  the Moving Platform is (its own early-return branch in `stepActor`), so wind/fan/magnet/black hole/
  bounce/cannon/bomb knockback never apply.

## 3. Palette placement and caption line

A new row "Traffic and floaters" at the end of the Objects tab (`renderObjectSwatches`, same
click-to-select path as `OBJECT_ACTOR_KINDS`; each swatch sets `selectedActorDefId`, `paintMode =
"actor"`). `CAPTION_TEXT` entries, in the toy voice:

- floats: "Carries you. Water can't get you while you're on it."
- hurts: "Knocks you back. Look both ways."

Placement by click puts the mover's lane origin at the clicked cell; the placed cell *is* its phase.

## 4. Overlap carrying (works with no gravity)

New `tickMovers(dt)`, called in `tick()` **before** the per-actor `stepActor` loop, so the whole
result is order-independent of the actors array. In order:

1. **Decide riders at the start of the frame**, before anything moves: every non-carried,
   non-mover, non-cannon-loaded actor whose center overlaps (modularly, see 6) a floats mover.
   First mover in array order wins if lanes overlap (a level rule: lanes shouldn't).
2. **Move every mover** by `speed * dt` along `moverDir` (position derived from `spawnX/Y +
   dir * speed * moverT`, modulo the lane extent, so it is exact and resettable).
3. **Carry each rider** by the same displacement, as a direct position offset on top of its own
   steering (the existing carried-object-follow and riding steps already do this), clipped by the
   same solid-tile collision `actorBlockedByTiles` gives everything else.

Anything can ride: the player, NPCs, crates, bombs. Hurts movers decide nobody as a rider.

**Phase 0 evidence**: with no input a rider stays put on the log to 0.0001px; steering adds to the
log's speed (up against a 90px/s log = -130px/s, down with it = 310px/s); walking off the side onto a
bank took 0.2s with zero hits.

## 5. The water exemption (the only genuinely new rule)

In `checkPlayerTileContacts`, the `hazard` and `lethal` ground reactions are skipped while the
player's center is over a floats mover (`moverFloatsUnder(actor)`; the same predicate step 1 uses).
`checkNpcLethalContacts` gets the same skip so a chaser riding a log isn't sent home.

**Order is load-bearing** (measured in Phase 0): because `tickMovers` has already moved the movers
and carried the riders before `stepActor`, the water check always sees post-carry positions. Doing
the water check *before* the carry makes a rider within one frame of travel of a log's trailing edge
(~1.5px at 90px/s, more at higher speeds) take damage; the order above removes it (0 hits across a
±4px sweep and under jittery frame times).

Water stays plain Hazard ground (the sample paints `none:hazard`). Lethal water is unnecessary and
wrong for Frogger (lethal costs a life and restarts, no knockback beat), and the exemption covers both
anyway.

## 6. Looping and wrap

A mover's own position is a **modular** coordinate along its axis: `mod(origin + dir*speed*t, extent)`
where `extent = ROWS*TILE` for vertical lanes and `roomCols()*TILE` for horizontal ones. It is
drawn with ghost copies at ±extent so it slides on and off the edge. It does **not** use
`applyWorldWrap`.

This matters because of a real Phase 0 finding: the engine's `applyWorldWrap` resets a fully-off actor
to `y = -h` instead of subtracting the room height. That is a 22px (one body-height) shift every lap
for a 22px actor, and for a 128px log it would stretch each lap by 128px and make a lane's spacing
drift. A rider left to the engine wrap slides back 22px relative to its log per lap and falls off
the tail after a few laps (observed: first hit at 12.9s starting near the tail; 0 hits ever with a
modular wrap).

**Decision for the user (flagged, not silently changed):**

- **Option A (cleanest):** change `applyWorldWrap` to `actor.y -= ROWS*TILE` / `+=` (and `x` likewise)
  for every actor. Seamless for everything, but it changes when wrapped actors reappear in every
  existing wrap room (Zero-G Piñata etc.) and in exported games. Regression sweep required.
- **Option B (recommended for the first ship, zero regression risk):** only actors that currently have
  a `ridingMover` use the modular rule; everyone else keeps the old wrap. Carried riders are
  seamless, nothing else changes.

A lane's axis needs wrap on that axis for the rider to cross the seam (vertical lane ⇒ per-room
Wrap Up/Down on). If it is off, movers still loop, but a rider is carried into the room edge, pinned
there by the same collision clip as a solid, and eventually leaves the log. Build mode logs once:
"A mover needs wrap on its lane's axis." It does not auto-flip the rule. Runner camera + horizontal
wrap stays mutually exclusive as today; the sample's lanes are vertical, so this is unaffected.

## 7. Direction: the rotate affordance

Click a placed mover (with a mover swatch selected, mirroring the Moving Platform's click-to-toggle
precedent and `cannonRotateStrokeCells`' once-per-stroke guard) to cycle `moverDir`:
s -> n -> e -> w -> s. Horizontal directions exist for completeness but only matter in rooms with
Wrap Left/Right. A placed mover is not draggable (same tradeoff as the Moving Platform): erase and
replace to move it. Optional polish: a small arrow badge on the hovered mover, using the existing
`drawRotateBadge` style (Build-only, not exported).

## 8. Hurts movers and the Hazard knockback fix

`resolveActorContact` gets a `MOVER_KIND` branch: for a hurts mover vs the player, call
`triggerHazard(player, awayVec)`. They are non-blocking and carry nothing. Hearts and star apply
automatically because everything goes through `triggerHazard` -> `takePlayerHit`.

**Risk found in Phase 0:** `triggerHazard` knocks the player back *against its own steering velocity*,
and straight **up** when it is standing still. A frog dropped in water while riding with no input is
thrown north, arbitrarily. Fix, scoped so existing hazards don't change: `triggerHazard(actor, away?)`
takes an optional unit vector.

- Car hit: away = perpendicular to the lane, toward the side the player came from.
- Water drop (an ordinary Hazard tile, no mover involved): the caller passes the direction back to the
  last dry spot, using a transient `actor.lastDryX/Y` updated each frame the player is on non-hazard
  ground and not riding. Frogger reads this as "knocked back toward the bank you left".
- No `away` given: the old behavior exactly.

In Play, losing a life with lives left already restarts the whole level after 650ms
(`restartLevelKeepingLives`), so the frog returns to the start and all mover phases reset (`moverT = 0`
via `resetActorsToSpawn`). That makes every attempt's lane timing identical, which is a feature for a
learnable puzzle; flag if you would rather randomize phases.

## 9. Snapshots, undo, JSON, autosave, export

- **Saved state**: actors are cloned wholesale, so `moverKind`, `moverDir` and the placed position
  survive undo/redo, autosave, JSON save/load and New Project with no snapshot change. `moverT` is
  transient (reset by `resetActorsToSpawn` and `clearTransientRuntimeState`), never meaningful saved.
- **Backward compat**: the new built-in `actorDefs` entries (one per preset) join the
  `restoreProjectSnapshot` backfill list, per the established rule for every new built-in def. Any
  new numeric field is read with a missing-safe comparison (`!(x > 0)`), because imported projects
  skip `createActor` defaults (the `displacedCooldown` lesson).
- **Export**: new constants (`MOVER_KIND`, `MOVER_SPEEDS`, def ids) go in `constantsSource`; new
  functions (`tickMovers`, `moverFloatsUnder`, `moverCovers`, plus the changed `triggerHazard`,
  `checkPlayerTileContacts`, `checkNpcLethalContacts`, `resolveActorContact`, `resetActorsToSpawn`,
  `applyWorldWrap` if Option A) go in `runtimeFunctions`; `lastDryX/Y` needs no template declaration
  (it is an actor field). Per this file's history of export gaps (`SWITCH_OFF_ART`, `nextActorInstId`,
  `removeActorById`), the export test must actually *play* a river crossing, not just load.
- **Surprise Me / Try this**: unaffected (movers aren't in any template); a Try-this entry is optional.

## 10. Sound (chip engine, synthesized)

Two new hand-written `CHIP_DESIGNS`, each a literal arrow in `sounds` (the closure-capture rule):

- `honk`: two short square-wave pulses, played by a hurts mover hit.
- `splash`: a short noise burst with a falling pulse, played when the water Hazard fires while not
  riding (replacing the generic yelp for that one trigger only).

Optional third, `boardFloat`: a soft thunk when a rider first lands on a float. `SOUND_LIMITS` gets
`honk: 250ms/1`, `splash: 250ms/1` so a lane of cars can't stack. Like every hand-written design in
this project, **never listened to**; retune in the sound designer if wrong.

## 11. Art

The Phase 0 prototype uses flat rectangles. Movers are 1x1 to 6x2 tiles but the engine's sprite
system is fixed 8x8. Proposed rule: draw the 8x8 per tile cell along the length (like a ground
skin), with an optional distinct head cell, so a 4-tile log is four log tiles and a turtle is two. The
user's uploaded `moving_platform` sprite fits as the log/raft body if wanted. This is the one open
art question; it needs real sprites per preset before Phase 2.

## 12. Interaction matrix rows (would go into CLAUDE.md's matrix section)

| mover | acts on | result |
|---|---|---|
| floats | player / NPC / crate / bomb whose center overlaps | carried by the mover's displacement, plus own steering |
| floats | player over Hazard/Lethal ground | tile reaction skipped while the center is over it |
| floats | NPC over lethal (`checkNpcLethalContacts`) | skipped, same rule |
| hurts | player | plain Hazard, knockback away from the lane, hearts/star apply |
| hurts | NPC / crate / bomb | nothing (not a trigger for them) |
| hurts / floats | anything pushing it | immovable; never displaced |
| wind / fan / magnet / black hole / cannon / bounce / bomb blast | a mover | no effect (self-driven, excluded) |
| gravity | a mover | none; in a gravity room it still loops and carries by overlap, but nothing "stands" on it (non-solid) — unsupported use, just cosmetic |
| solid tile | a rider | clips the carry; rider pins while the mover passes underneath (see risks) |
| mover | mover | no interaction (lanes should not overlap) |

## 13. Risks and decisions needing the user

1. **Wrap rule (Option A vs B, section 6).** Recommended B first.
2. **Pinned riders (Phase 0 finding).** A rider carried into a solid post stops flush while the log
   passes underneath, falls in at ~1s, and then re-takes the water hit every 0.45s (the hazard
   cooldown) until another log arrives. In Play the level restarts after 650ms, so it only matters in
   Build. Level rule instead of code: never put solids in a float lane.
3. **Knockback change (section 8)** touches `triggerHazard`'s signature; default behavior is
   unchanged. Medium-low risk.
4. **Multi-tile art** (section 11).
5. **Order of operations** (`tickMovers` before the actor loop). Door transitions and the READY pause
   already freeze `tick()`, so movers freeze with them; movers in the room you just left stay frozen,
   as every other actor does.
6. **Human timing windows.** Perfect timing can cross any speed, but the "go now" window for boarding
   from the bank shrinks fast: 1233ms (60px/s, 4-tile log) down to 317ms at 220px/s for a 4-tile log
   and 250ms for a 2-tile one; 217ms/83ms at 450px/s. Tier values and lengths above keep the sample
   in the comfortable range; a kid who builds a 700px/s lane will make an unwinnable one, which is the
   toy's normal contract (the sample, not the engine, owns fairness).
7. **Not tested yet**: the one-way Follow camera at 3 screens wide, the lives/restart loop in the real
   engine, and the optional gate+plate.

## 14. Verification plan (when/if this ships)

`tests/movers.test.js` (hook-injected temp copy, like `tests/bombs.test.js`): rider stays put with no
input; steering adds to carry speed; no hit anywhere in a ±4px sweep of both edges and under jittery
dt; rider crosses the wrap seam over several laps with zero relative drift and zero hits; a mover's
lane spacing is stable over many laps; walking off the side onto a bank has no hit; solid-post pin;
hurts mover knockback direction; water-drop knockback toward the last dry spot; hearts absorb a car
hit; star ignores both; Reset/Play restart reset phases; undo/JSON round-trip of `moverDir`; old
snapshot without the new defs backfills; and an exported file plays a full crossing with zero errors.
Then the usual sweep: all samples load and play, plus a fresh export.
