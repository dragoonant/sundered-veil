# Handoff — competitive decks, continued

Start here in a fresh chat. Read CLAUDE.md first (it points at the binding docs), then this.

## Where things stand (branch `competitive-decks`, 2026-09-02)

| Commit  | What |
|---------|------|
| afadf41 | Full competitive card pool pulled as skeletons (1,119 cards, `tools/pull-sets.mjs`), 20 tournament lists registered as deck-c01..c20 |
| 4d8df97 | 212 main-deck cards of those lists authored to completion; engine extension `js/ops2.js`; names in `data/names-5.js` |
| 9482ddb | Art for the 212 generated and QC'd; `tools/art-thumbs.mjs` contact sheets |
| 55f0cdc | `SB.whoActs` fixes the hang when the AI plays a "reveal hand, opponent picks" card; local real names cover the 20 decks |

Suite: `node tools/run-tests.mjs --quiet` → 82 passed. Run it before every commit.

## Open work, in the order agreed with the user

1. **Card behaviour bugs seen in play.** The user saw several cards not doing what they should
   but has not yet listed them. Ask for card names + one line each, then fix one at a time:
   grep the id in `data/cards-*.js`, read only that line and the op handler it uses, add a
   test in `tests/test-expansion.js`, run the suite, commit.
2. **21 sideboard-only cards** still skeletons (no abilities). Work packets with printed text
   are in `scratch/workpackets/<set>.json`; pattern for authoring is `scratch/author212.mjs`.
3. **~900 remaining skeletons** across ASH/LAW/LOF/SEC/JTL and stragglers. Same packets.
4. **Text audit** of generated rules text for the 212 (compare `scratch/text212.md` style
   output against the packets). Was agreed to happen after art.

## Real names vs original names

- Original names live in `data/names-*.js` and are always loaded; they are the fallback
  for any id the source pack misses and the whole game when the pack is switched off.
- Real SWU names and printed text are `data/names-source.js`, COMMITTED, built by
  `node tools/gen-source-names.mjs scratch` (needs `scratch/trait-map.json` and a card
  dump; `--fetch` downloads one). Loaded by `index.html` only, never by `tests.html` (a
  test enforces this). `names.js registerSource` keeps both sets; the HUD drawer's
  names button toggles, remembered in `localStorage['sb.names']`; default is printed.
- Third-party names go nowhere else: not card data, engine, tests, art prompts, docs
  or commit messages. Regenerate the file rather than editing it.

## Art

- Delivery files (`art/*.webp`, `art/fx/*.webp`, the two shrunk `.mp4`s, `sfx/*.mp3`) are
  COMMITTED: GitHub Pages serves the repo root, so the live site has exactly what is in
  git. `node tools/check-pages.mjs` lists what is missing or untracked. PNG intermediates,
  masters, thumbs and logs stay ignored.
- Generate: `node tools/gen-art.mjs [--force] --only <ids>` (FLUX.1-schnell via HF; key from `.hf_token`).
- Prompts: `tools/art-prompts.json`, rules in `docs/ART-PROMPT-RULES.md`.
- QC cheaply: `node tools/art-thumbs.mjs --only <ids> --width 256 --sheet <name>` writes
  `art/thumbs/sheet-<name>.jpg` (16 tiles per sheet). Hand sheets to ONE Haiku agent with the
  failure checklist (lettering/signatures, crossguard blades, franchise trooper helmets,
  galleons/flags, broken anatomy, wrong subject). Only look at flagged tiles yourself.
- Known drift fixes: plasma blades use "an ignited plasma blade held low, a straight glowing
  <color> beam from a short metal grip"; troopers use "matte dark grey plate armor with a
  narrow red visor slit".

## Token budget rules (the user hit the usage limit twice; do not repeat)

- Never view full-size renders in the main context; sheets + Haiku, as above.
- Read files by range or grep; never whole large files (`js/ops2.js`, `data/names-5.js`,
  `tools/art-prompts.json` are all large).
- One Haiku agent at a time (parallel agents have crashed this machine). Never open the
  Browser pane (hangs the machine).
- If a cheap agent underperforms, fix its brief and rerun; do not take over its bulk work.
- Commit at checkpoints and report, rather than one long autonomous run.
- Git Bash here eats backslashes in `sed -i` and `node -e` regex literals; write such lines
  from a heredoc file.

## Battle animations (added 2026-09-03, uncommitted at time of writing)

`js/anim.js` draws every hit before the board redraws: `plan()` (pure, tested in
`tests/test-anim.js`) turns one apply's fresh log entries into steps; `run()` plays them on
the OLD board, then `UI.render` fires. Ranged = sprite bolt (`art/fx/bolt-*.webp`, colour by
aspect), melee = the attacker card lunges (ground units with the force/blade traits listed
in MELEE_TRAITS), defeats shrink into the owner's discard pile, events fly from the spotlight
to the pile. Two beats per unit attack: attacker lands, then the defender's return fire.
Input is locked under `#fx-lock`; a click, Esc, Space or Enter skips. The drawer button
`anim-btn` cycles full / quick / off (localStorage `sb.anim`). Sprites: `node tools/gen-fx.mjs`;
clips laser/laserHit/lunge/slash/baseHit/defeat: `node tools/gen-sfx.mjs` (attack/hit/destroy
clips were retired; `js/sound.js` aliases those log tags). Engine side: `unitDamage`,
`shieldPopped` and `baseDamage` entries now carry `source` (+ `sourceCardId`) and `combat`,
and combat damage finally passes `ctx.combat`, so `whenCombatDamaged` triggers fire.
