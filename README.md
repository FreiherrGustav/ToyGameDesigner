# TinyGameMaker (Toy Game-Maker)

A toy for making games, for kids. Drop pieces on a board and they just work: no scripting, no
build step, no framework. The whole app is one file, `index.html`; open it in a browser.

## Layout

| Path | What it is |
|---|---|
| `index.html` | The entire app: editor, game engine, samples, standalone export |
| `CLAUDE.md` | Design principles, architecture and the full change history (read this first) |
| `tests/` | Throwaway Playwright scripts, run with `node tests/<name>.test.js` (see `CLAUDE.md` > Testing conventions) |
| `prototypes/` | Standalone dev tools (`sprite-editor.html`), early experiments and screenshots from past QA passes |
| `surprise-sources/` | The author's original project files behind the hand-built "Surprise me" rooms (read by `tests/exact.test.js`) |
| `examples/` | Projects to open with Load and edit (`wind-spiral.json`: a one-room wind-tile journey with shortcuts and two goals) |
| `docs/` | Longer design notes (for example the v2.46 Movers patch notes) |

## Running and testing

Open `index.html` in Chrome. Tests need Playwright and Chromium; the paths used are in
`CLAUDE.md`. Add `#t` to the address to skip the landing screen.

## Study mode

Anonymous usage counters exist but only run when the address has `?study=1`. See
"Anonymous usage counters" in `CLAUDE.md` (what is counted, how to turn it off, how to remove it).
