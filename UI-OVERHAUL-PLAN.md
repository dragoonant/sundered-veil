# UI Overhaul Plan (branch `ui-overhaul`)

Goal: reclaim screen real estate. The board becomes the whole screen; everything that
is not the board becomes a title screen, a drawer, or a centred panel.

Constraints carried in: no build step, IIFEs on `SB`, new files added to BOTH
`index.html` and `tests.html`, all display text in `names.js`, engine surface
untouched, `node tools/run-tests.mjs --quiet` green before commit.

## 0. New files

- `js/title.js` — title screen + wipe + deck/difficulty picker (UI-only, index.html only).
- `js/hud.js` — turn banner, initiative marker, opponent hand row, leader action popover.
- `styles.css` — extended in place (sections added, none removed wholesale).
- `tools/art-prompts-title.json` — one prompt for the title background.

`index.html` loses `#topbar` entirely; `#main` becomes board-only with `#side` as an
overlay drawer.

## 1. Title screen

- `art/title-duel.png` at 1536x864, generated with the existing STYLE block via
  `node tools/gen-art.mjs --prompts tools/art-prompts-title.json --size 1536x864`.
- **Legal note:** NOTICE.md commits this repo to original expression and no
  third-party names outside `scratch/`. `tools/art-prompts-title.json` is committed,
  so the prompt is written as an original scene — a masked warlord with a crimson
  blade against a young hero with an azure blade, in the project's chibi style — not
  the named characters. Same picture beat, no claim broken. Say the word if you want
  the literal version instead and I'll keep the prompt file out of git.
- Flow: title art full-bleed + game title + 3s hold → Star Wars-style **wipe**
  (a hard vertical edge sweeping left-to-right, CSS `clip-path` inset animation on a
  layer that carries the outgoing screen) → deck-select screen over the same art,
  dimmed.
- Deck select screen owns: deck `<select>`, difficulty `<select>`, **Start battle**.
  `newGame()` moves out of the inline `index.html` script into `js/title.js`.
- Skippable: click / any key during the 3s hold jumps to the wipe.
- Reachable again from "New game" in the drawer.

## 2. Collapsible log drawer

- `#side` becomes `position: fixed` on the right, `transform: translateX(100%)`,
  closed at game start. A slim **tab handle on the left edge of the screen** opens it
  (as asked); it also closes from a × in the drawer header and with Esc.
- `#main` no longer reserves 250px, so `#board` gets the full width and `#mat`'s
  `min(100cqw, 66cqh*2048/1280)` clamp starts producing a genuinely bigger board.
- Drawer state persists across games in a module var (not in game state, not undoable —
  same rule the peek follows).

## 3. Every choice is a centre-screen panel

- `#choice-modal` already is that panel, with peek/restore (`js/targeting.js`).
  The gap is the mulligan and the setup/regroup banking, which live in
  `#mulligan-bar`/`#choice-bar` under the board.
- Move mulligan into the modal via `SB.renderGenericModal` (it already supports
  hide/restore), so "Keep hand / Mulligan" is centred and hideable.
- `#mulligan-bar` is deleted from `index.html`; `#choice-bar` stays only for
  drop-variant resolution (play plain vs exploit), which is anchored to a gesture.

## 4. Drawer controls

Drawer header gains: **mute** (calls the existing `SB.sound.toggleMute()`, label from
`names.js`, reflects `SB.sound.isMuted()`), **New game** (returns to the title's deck
select), **How to play**, **Undo**. That empties `#topbar` and it is removed.

## 5. Leader card popover

- Remove `#turn-buttons` leader entries from `renderStatus`.
- Clicking your leader slot opens a popover anchored to it: the zoomed leader card
  (`SB.renderCard` at preview size, same as the inspector) plus one button per legal
  leader action found in `legalActions` — `deployLeader`, `deployLeaderPilot`
  (one per attach target), `leaderAction`, `baseEpic`. No legal action ⇒ the popover
  is inspect-only, exactly as today.
- Pass / Take initiative have no card to hang on, so they move to a small bar pinned
  under the hand (they are turn actions, not leader actions).

## 6. Turn + initiative presentation

- On each round/turn change, `js/hud.js` shows a centred banner —
  "Round 3 · Your move · You have the initiative" — for ~1.6s, fading out, click to
  dismiss, `pointer-events: none` so it never blocks the board.
- Persistent: the leader slot of whoever holds initiative gets a pulsating glow ring
  (shared `SB.animationPhase` so re-renders don't restart it) and an "Initiative"
  caption above the slot.
- The old `#status` chip goes away with the topbar.

## 7. Opponent hand on screen

- New `#enemy-hand` row above their board row, rendered by `renderHand`'s sibling:
  one card back per card (`SB.renderCard({cardId, hidden:true})`), same overlap-fan
  CSS as your hand (`--n`), so 12 cards still fit.
- A card is drawn face-up only when the state says it is revealed; the renderer takes
  a per-card `hidden` flag so a future reveal effect can flip one without new plumbing.
- `#enemy-hand-line` (the "Their hand: N" text) is deleted.
- Both hands get `justify-content: center` — they currently start at the left edge.

## 8. Order of work

1. Drawer (#2) + topbar removal (#4) — biggest space win, lowest risk.
2. Hands centred + opponent hand (#7).
3. Turn banner + initiative glow (#6).
4. Leader popover (#5).
5. Mulligan into the modal (#3).
6. Title screen + art generation (#1) — last, because it wraps the new entry point
   around everything above.

Each step: `node tools/run-tests.mjs --quiet` green, then a commit. `DEVIATIONS.md`
gets an entry if the choice-modal changes diverge from CARD-LOG-AND-TARGETING-SPEC.
