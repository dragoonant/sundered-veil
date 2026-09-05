# The Sundered Veil

A browser card duel against an AI opponent. Unofficial, non-commercial fan project: the
game's mechanics follow a published trading card game; every name, rules sentence, image
and sound here is original or generated for this project (see NOTICE.md). Not affiliated
with, endorsed by, or connected to Fantasy Flight Games, Lucasfilm Ltd., or The Walt Disney
Company.

**Play:** https://dragoonant.github.io/sundered-veil/

Pick a deck and a difficulty on the title screen. Every deck is a registered list from
`data/decks.js`; the AI plays a deck from the same group.

## Running it locally

No build step. Either open `index.html` from disk, or serve the folder:

```
node tools/serve.mjs        # http://localhost:8321
```

## Tests

```
node tools/run-tests.mjs --quiet
```

`tests.html` runs the same suite in a browser. Run the headless suite before any commit.

## Deploying

GitHub Pages serves `main` at the repo root, so the live site is whatever is committed.
Generated art and sound are tracked in delivery formats only; before pushing art:

```
node tools/check-pages.mjs
```

lists anything a deck can show that is missing or untracked. See PAGES-PLAN.md.

## Layout

- `js/` engine (`SB.legalActions`, `SB.apply`, `SB.isTerminal`), text generator, UI, AI
- `data/` cards as pure data, decks, display names
- `names.js` every piece of display text
- `tools/` generators for art, sound, names, and the test runner
- `docs/` schema, AI weights, board and art-prompt rules
