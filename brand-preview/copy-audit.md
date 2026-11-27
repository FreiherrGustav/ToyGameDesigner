# Copy audit (v. current build, before the description-line change)

Reach key: **always** = visible without interaction; **hover** = needs a mouse over (touch: only the tap handler, see notes); **click** = after a click or action; **brief** = shown for about 5 s in the one-line message under the board, then fades; **rare** = only in an unusual state.

Important mechanics found while auditing:
- Piece captions are wired to `mouseenter` (shows) and `mouseleave` (back to the idle hint) plus `touchstart` (shows, stays). **Keyboard focus shows nothing.** A piece that is selected shows nothing either, so after a mouse leaves the line is back to the idle hint.
- Swatch `title` attributes (native tooltips) hold only the **name** ("crate"), never the description. Native tooltips never appear on touch.
- The message line under the board (`#log`) keeps only the newest message and fades it after 5 s; a second message replaces the first.

## A. Palette and editor chrome (always visible unless noted)

| Where | Exact text | Reach |
|---|---|---|
| Top bar | TinyGameMaker (logo, title "Back to the front screen") | always (title: hover) |
| Top bar | Build / Play; Pause (title "Pause or resume the game (P)"); 🎮 Samples ("Browse sample games"); 🎲 ("Surprise me") | always; titles hover |
| Palette tabs | Make a Game / Make a Mess | always (captions: hover, see C) |
| What to place | What to place · Paint · Erase · Characters · Objects · Ground | always |
| Tab titles (native tooltips) | "Paint: decorate the background", "Erase: remove whatever you click", "Characters: your hero and enemies", "Objects: crates, bombs, cannons, flags and more", "Ground: blocks, textures and ground effects" | hover only |
| Room rules | Room rules · Gravity · Edges · Screen | always |
| Rule chip titles | "gravity (off — click to turn on)", "sides loop (…)", "top & bottom loop (…)", "Gravity pulls down/up/left/right", "Fixed", "Follow", "Runner" | hover only |
| Objects tab headings | Try me button, "Pick an object", "Game pieces", "Collectibles", "Traffic and floaters" | always |
| Characters tab | Pick a character · The player (only one) · Enemy · Behavior (Chaser/Wanderer/Fleer/Statue) · "If it touches you" (lethal / harmless) · "If it dies" (comes back / stays gone) · Pick a look · My looks · Draw your hero | always (some only when an enemy is selected) |
| Ground tab | Ground · Deadly stuff · Ground effects · Color | always |
| Hint paragraph (Ground > Color) | "None: this wall always blocks, same as ever. Pick a color and it only blocks while nothing of that color is currently on — a matching Switch over in Game pieces, or a plate over in Objects, is what turns it off." | always (only when a colour-capable ground is selected) |
| Hint paragraph (Paint) | "Pure decoration, zero gameplay meaning. Pick one to paint, or hit + to draw a new one — it's added to this project's kit, never swapped in for an old one." | always (Paint tab) |
| Hint paragraph (Pick a look) | "Starter looks for whatever's selected above. Pick one, then keep drawing on it below." | always (Characters tab) |
| Caption bar (idle) | "Hover (or tap) a piece to see what it does." | always (inside the Room Rules area) |
| Make a Mess idle caption | "Hover (or tap) a button to see what it does." | always (Make a Mess tab) |
| Toolbar | Undo · Redo · Reset to start / Reset · Clear board / Clear · New project / New · Save project / Save · Load project / Load · Share game / Share | always (short names under 1400 px wide; full name is the tooltip) |
| Toolbar titles | Undo, Redo, Reset to start, Clear board, New project, Save project, Load project, Share game, Smaller/Larger board | hover only |
| Pan row | Pan ◀ ▶ and a position label | always (Follow/Runner rooms) |
| Autosave hint | (text set at runtime) | brief |
| Landing: tagline | A toy for making games. Drop pieces on the board. They just work. | always |
| Landing: buttons | Make a game · Surprise me · Play a game · Show me how | always |
| Landing: trust line | Free. No account. Nothing leaves your browser. | always |
| Landing: now playing | Now playing: <name> · Take it apart ↗ | always |
| Landing: keys | ← ↑ ↓ → or WASD move · Space jump · E grab | always (hidden under 700 px wide) |
| Landing: footer | Credits (hidden) · Privacy · Contact · Best on a computer or Chromebook | always |
| Landing: study note | "This test counts anonymous clicks, such as which buttons get pressed. It never records names, drawings or anything personal. Add ?nostats to the web address to turn it off." | only with ?study=1 |
| Samples dialog | Sample games · each sample name under its icon · × (aria-label Close) | click only |
| Confirmation dialog (5 variants) | "Open this saved game?" / "Open \"X\"?" / "Play \"X\"?" / "Open \"X\" in the editor?" / "Start a new project?" + body "What you're making now gets put away. Undo (Ctrl+Z) can bring it back while this page stays open." — buttons: Open it / Keep mine / Yes, switch / Start fresh / Play it | click only |
| Confirmation: delete room | "Delete \"<room>\"?" — "Everything in it goes, and doors that led there stop working. Undo (Ctrl+Z) can bring it back." — Delete room / Keep it | click only |
| Confirmation: clear everything | "Clear everything?" — "Every room, door, tile and character goes away and you start over with one empty room. Undo (Ctrl+Z) can bring it back." — Clear it all / Keep it | click only |
| In-game canvas | READY! · YOU WIN! · GAME OVER · Score: N · "Press ▶ Play to try again" (export: "Press any key or tap to play again") | Play only |
| Error overlay | "😵 Something glitched — use the reset button to pick back up." (see logs list) | rare |
| Tutorial (Show me how) | "Drag across the glowing squares to draw the ground." / "Pick the grass tile to start building." / "Now add a step up. Fill in the glowing block." / "Pick the grass tile again." / "Click the glowing square to put your hero there." / "Now pick your hero." / "Click to drop an enemy. It roams around." / "Pick the Enemy to add some trouble." / "Click to plant the flag on top of the step." / "Pick the goal flag." / "All set! Press Play." / "Walk, jump past the enemy and climb the step." / "Not this time. Press Play to try again." / "Press Play." / "Nice!" / "Well done!" + "Now make it your own! Open the Objects tab to find more pieces." / "Want to wreck it?" + "Open the Make a Mess tab to shake things up. Then build it all back." + a controls card ← → walk / Space jump | click only (tutorial running); always visible while a step is current |
| Make a Mess buttons | Surprise Me · Give me walls/stuff/enemies/scenery · Gravity Tumble · Earthquake · Bomb Storm · Rising Lava · Stop | always (Make a Mess tab) |
| Make a Mess toast | "Added N <things>." + Undo button | brief (8 s) |

## B. Piece descriptions (the caption text) — hover/tap only today

Reached by hovering (mouse) or touching (touchstart) the tile. Keyboard focus and selection do not show them. 66 tiles checked by hovering each one.

| Tile | Description | Reach |
|---|---|---|
| objectSwatches: crate | Push it. Stacks, too. | hover / touch-down only |
| objectSwatches: large stone | Heavy. Lava-proof. | hover / touch-down only |
| objectSwatches: moving platform | Slides side to side. Click: up and down. | hover / touch-down only |
| objectSwatches: cannon | Shoots things. | hover / touch-down only |
| objectSwatches: bomb | Boom. Eventually. | hover / touch-down only |
| objectSwatches: fan | Blows you around. | hover / touch-down only |
| objectSwatches: magnet | Pulls stuff your way, and holds on. | hover / touch-down only |
| objectSwatches: spawner | Makes more of something. | hover / touch-down only |
| objectSwatches: trampoline | Launches you skyward. | hover / touch-down only |
| objectSwatches: Gate | Opens for its color. | hover / touch-down only |
| fixtureSwatches: goal | Touch it, you win. | hover / touch-down only |
| fixtureSwatches: plate | On while you're standing there. | hover / touch-down only |
| fixtureSwatches: door | Leads somewhere new. | hover / touch-down only |
| fixtureSwatches: locked door | Only a key of its color opens it. | hover / touch-down only |
| fixtureSwatches: warp | Zap. You're elsewhere. | hover / touch-down only |
| fixtureSwatches: black hole | A black hole. It sucks you in. | hover / touch-down only |
| fixtureSwatches: switch | Flips a color on — for good. | hover / touch-down only |
| collectibleSwatches: heart | Takes a hit for you. | hover / touch-down only |
| collectibleSwatches: key | Opens gates of its color. | hover / touch-down only |
| collectibleSwatches: star | Nothing can hurt you. For a bit. | hover / touch-down only |
| moverSwatches: scooter | Knocks you back. Look both ways. | hover / touch-down only |
| moverSwatches: shopping cart | Knocks you back. Look both ways. | hover / touch-down only |
| moverSwatches: rubber duck | Carries you. Safe from the water. | hover / touch-down only |
| moverSwatches: turtle | Carries you. Safe from the water. | hover / touch-down only |
| moverSwatches: log | Carries you. Safe from the water. | hover / touch-down only |
| moverSwatches: sleeping crocodile | Carries you. Safe from the water. | hover / touch-down only |
| groundSwatches: open space | Open space. Effects still work. | hover / touch-down only |
| groundSwatches: plain block | A plain block. Solid, nothing special. | hover / touch-down only |
| surfaceSwatches: none | No extra effect. | hover / touch-down only |
| surfaceSwatches: slippery | Zero grip. | hover / touch-down only |
| surfaceSwatches: bouncy | Boing. | hover / touch-down only |
| surfaceSwatches: hazard | Stings a little. | hover / touch-down only |
| surfaceSwatches: lethal | Costs a life, then starts over. | hover / touch-down only |
| surfaceSwatches: sticky | Slows you to a crawl. | hover / touch-down only |
| surfaceSwatches: diggable | Dig in. Hold on. | hover / touch-down only |
| surfaceSwatches: trap | Looks solid. Crumbles under you. | hover / touch-down only |
| surfaceSwatches: indestructible | Bombs can't touch it. | hover / touch-down only |
| surfaceSwatches: wind | Pushes you along. | hover / touch-down only |
| lethalSwatches: lava | Hot. Don't. | hover / touch-down only |
| lethalSwatches: fire | Also hot. Also don't. | hover / touch-down only |
| lethalSwatches: spike | Ouch, permanently. | hover / touch-down only |
| lethalSwatches: spiked mine | Don't poke it. | hover / touch-down only |

Rule chips (Room rules): gravity "Things fall. Click to switch it." · "Gravity pulls down/up/left/right." · "Walk off one side, come back the other." · "Fall off the bottom, come back on top." · Fixed "Shows the whole room." · Follow "Keeps you in view." · Runner "Keep up, or get left behind." — hover / touch-down only.

Make a Mess captions: "Build a game, piece by piece." · "Make a mess: random piles and chaos." · "Stop now and keep what has happened." · "Takes back everything that last button just did." + one per chaos button (set in the kit) — hover only.

Behavior / lethal / death swatches (`opt.tip`): "Touching it costs a life." / "Touching it is safe." and the comes-back / stays-gone pair — hover / touch-down only.

Try me: "Pick a piece, then see it work." — hover only.

## C. Messages in the one-line message line under the board (`log()`) — brief

Each shows for about 5 seconds; the next message replaces it. Not all reachable by touch users who are not looking at the line at that moment.

| Source line | Text (first part) |
|---|---|
| 2239 | "Play started!" |
| 2297 | "Back to the start of this room." |
| 2731 | "Project saved! Check your downloads for my-project.json." |
| 2738 | "That file isn't a project this tool can read." |
| 2739 | "That file isn't a project this tool can read." |
| 2747 | "Project loaded from " |
| 2750 | "Couldn't read that file." |
| 2786 | "Auto-save is low on space and has stopped — export your game or save a project file as backup." |
| 4243 | "Loaded: " |
| 4760 | "😵 Something glitched — use the reset button to pick back up." |
| 5221 | "New background added to the kit — draw it below." |
| 5291 | "New ground tile \" |
| 5437 | "New lethal tile \" |
| 5618 | "New collectible \" |
| 5831 | "New enemy \" |
| 6093 | "Gravity on." |
| 6103 | "Gravity now pulls " |
| 6140 | "Runner and horizontal wrap can't both be on — wrap turned off." |
| 6240 | "Using your sprite \" |
| 6268 | "Picked \" |
| 6286 | "Grabbed the \" |
| 6645 | "Unlocked with the " |
| 7127 | "Dug through!" |
| 7679 | "Round complete!" |
| 7693 | "You win!" |
| 7750 | "Game over!" |
| 7768 | "A heart took that hit!" |
| 7833 | "Boop!" |
| 7840 | "Oof!" |
| 7846 | "Oof!" |
| 7850 | "Pop!" |
| 7858 | "Got it! +1" |
| 7903 | "Heart! A spare hit." |
| 7908 | "A " |
| 7912 | "Star! Nothing can hurt you. For a bit." |
| 8060 | "Ouch! Hazard knockback." |
| 8062 | "A heart took that hit!" |
| 8096 | "Game over!" |
| 8099 | "Splat!" |
| 8135 | "Pulled into the black hole — back to the start of the room!" |
| 8139 | "Pulled into the black hole — sent back to the start!" |
| 8164 | "Boing! Launched." |
| 8178 | "Crumble!" |
| 8224 | "Gravity already pulls " |
| 8228 | "Flip! Gravity pulls " |
| 8295 | "Loaded!" |
| 8328 | "Shot!" |
| 8348 | "Fuse lit — run!" |
| 8443 | "Boom!" |
| 8467 | "Warped!" |
| 8693 | "Smashed!" |
| 8754 | "Squashed!" |
| 8788 | "Caught in lethal!" |
| 8796 | "Caught in lethal — sent back to its spawn point!" |
| 8849 | "Pulled into the black hole — sent back to its spawn point!" |
| 8854 | "Pulled into the black hole — destroyed!" |
| 9156 | "Picked up the " |
| 9224 | "Fuse lit — run!" |
| 9243 | "Grabbed the bomb — safe while you're holding it. Drop or throw it to light the fuse." |
| 9245 | "Grabbed the " |
| 9280 | "No room to put it down here." |
| 9287 | "Dropped it." |
| 9322 | "Threw it!" |
| 9416 | "Back on the board!" |
| 9961 | "A spawner can't launch anything — the way it's facing is blocked. Try rotating it." |
| 10466 | "Switch set to: " |
| 10666 | "New door — linked directly to the matching door in \" |
| 10680 | "New door — added \" |
| 10701 | "Can't delete the only room — a game needs at least one." |
| 10725 | "Deleted \" |
| 10762 | "Duplicated \" |
| 10831 | "A mover needs v-wrap on to carry things around its lane. Turn it on in Game Rules." |
| 10832 | "A mover needs h-wrap on to carry things around its lane. Turn it on in Game Rules." |
| 10877 | "Tip: turn on v-wrap in Game Rules so a mover can carry things all the way around its lane." |
| 10901 | "Can't load the player into a spawner." |
| 10905 | "Spawner emptied — back to the default hazard ball." |
| 10908 | "Loaded into spawner — replaces whatever was loaded before." |
| 11109 | "Running." |
| 11194 | "Running." |
| 11292 | "Reset to start." |
| 11331 | "Started a new project. Undo can bring the old one back." |
| 14033 | "SURPRISE_ROOMS entry:\n" |
| 14408 | "Surprise me has nothing to build." |
| 14412 | "Surprise me: no room for that one." |
| 14415 | "Surprise me couldn't build #" |
| 14541 | "Pick a piece first, then press Try me." |
| 14932 | "A sunny field. Place a hero to get started." |
| 15429 | "[tele]" |
| 15789 | "Gravity Tumble!" |
| 15808 | "Gravity is back to normal." |
| 15843 | "Bomb Storm!" |
| 15874 | "Every free tile just got a bomb..." |
| 15884 | "The storm is over." |
| 16473 | "The earthquake is over." |
| 16476 | "Earthquake!" |
| 16577 | "The lava is gone." |
| 16581 | "Rising Lava!" |
| 16635 | "[tele]" |
| 16696 | "Welcome back! Restored your last auto-saved session." |
| 16729 | "Place a player first — nothing to export yet." |
| 16935 | "Exported! Check your downloads for my-game.html" |

## D. Things the audit flags

1. **Hover-only (no touch/keyboard path):** all native tooltips (tab, toolbar, chip, piece names); Make a Mess captions; the Try me hint; the rule-chip captions are touchstart-capable but not keyboard-capable.
2. **No description at all:** see the list in the report (31 tiles: player, Wheebuns/enemy, "+" create buttons, cheese, gem, coin, nine ground textures, ten Color swatches, Paint tiles, preset looks).
3. **A message that can be missed:** error/blocked messages ("Place a player first", "Can't delete the only room — a game needs at least one", "No room to put it down here", "That file isn't a project this tool can read") appear for about 5 s in a single line under the board.
4. **Wording mismatches noticed (not changed):** the log still says "Turn it on in Game Rules" (the block is now called Room Rules); "Auto-save is low on space…" and "Exported! Check your downloads for my-game.html" mention a file name while the button says Share game.