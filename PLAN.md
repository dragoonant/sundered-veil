# Project plan — SWU-style card game vs AI (working title: pick during theming)

Goal: a playable-in-browser digital card game whose mechanics faithfully follow Star Wars
Unlimited, with a fully original theme (original names, generated rules text, AI-generated art),
built on the MegaRobotWar architecture. See CARD-GAME-LESSONS.md — every rule there applies.

## Mechanics to implement (functional, from SWU)

- **Leaders**: double-sided; leader side with an action/ability, deployable as a unit (epic
  action) once enough resources are in play.
- **Base**: each player has a base with HP (typically 30) and possibly an ability/epic action.
  You win by reducing the enemy base to 0.
- **Aspects**: colorish alignment system; cards cost +2 per missing aspect relative to your
  leader+base aspects (aspect penalty), except the neutral pair.
- **Resources**: any card may be placed face-down as a resource (1 per turn, at any action);
  resources exhaust to pay costs and ready each regroup.
- **Turn structure**: action phase of strictly alternating single actions (play a card, attack,
  use action ability, take initiative, pass), then regroup phase (both draw 2, may resource 1,
  ready everything). Taking the initiative token means acting first next round and passing for
  the rest of this one.
- **Two arenas**: ground and space; units attack only within their arena (bases attackable from
  both).
- **Combat**: attacker exhausts; attacker and defender deal power simultaneously; damage
  persists; overwhelm/sentinel/saboteur/raid/restore/ambush/shielded/grit/hidden/bounty/smuggle
  and "when played / when defeated / on attack" triggers as data-driven ops.
- **Card types**: leader, base, unit (ground/space), event, upgrade (attaches to units, includes
  pilots-style variants later).
- **Sideways knowledge**: exhausted state, damage counters, shields as tokens.

First set scope: **2 leaders + 2 bases + ~50 cards** across 4 aspects — enough for two
prebuilt 50-card decks. Grow after the loop is fun.

## Phases

### Phase 0 — Repo hygiene (day one, before anything else)
1. `git init`; `.gitignore` covering `.hf_token`, `.elevenlabs_key`, `art-masters/`, scratch dirs.
2. `CLAUDE.md` pointing at CARD-GAME-LESSONS.md and this plan.
3. `NOTICE.md` stating the mechanics-functional / expression-original posture.

### Phase 1 — Engine skeleton
- IIFE-per-file on one namespace, no build step, `index.html` loads in commented dependency order.
- `legalActions(state)`, `apply(state, action)` (immutable), `isTerminal(state)`.
- Seeded deterministic RNG keyed off `seed|log.length|turn`; structured log entries with `data`.
- State model: players (base HP, leader state, hand, deck, discard, resources, exhausted flags),
  arenas, initiative, phase.
- Start with the action-phase loop + vanilla units + attacking + resourcing + regroup. No
  keywords yet. Fuzz from the first week.

### Phase 2 — Content system
- Cards as pure data; abilities `{trigger, condition?, effects}`; effects interpreter ops added
  one at a time, each with: op + text-generator sentence + test.
- `names.js` for ALL display text; stable ids (`s01-001`) everywhere else.
- Load-time validation (unknown ids/keywords/triggers/duplicates throw).
- **Day-one text-quality test**: render every card's generated text; fail on empty output,
  doubled spaces, lowercase sentence starts (the §2 guard the old project never built).

### Phase 3 — Tests
- `tests.html` self-running + headless Node runner that parses its `<script src>` tags
  (`node:vm`, bare window shim, `--quiet`, `--filter`).
- Position-building helpers; `act(state, matcher)` printing available actions on failure.
- Reproducibility test; "apply never mutates" test; 200-random-game fuzz (no exceptions, no
  zero-legal-action states, termination bound); deck-vs-deck matrix from the deck registry.
- Content-integrity gates incl. names-slug-to-unique-art-filenames.

### Phase 4 — UI
- Board: two arenas, bases, resources row, hand, initiative token. Every affordance filtered
  from `legalActions`.
- Apply the §7 trap list preemptively: `draggable="false"`, synthetic-click suppression,
  distance-based tap/drag (~8px), stale-gesture recovery, pointer-events on overlays, keyed
  card-node reconciliation planned from the start.
- Undo (free, from immutable apply), structured-log-driven sounds.

### Phase 5 — AI
- One machine, three difficulties: enumerate legalActions → evaluate → pick; Easy adds noise +
  blunder rate, Mid settles combat before scoring, Hard adds one-ply opponent reply.
- `docs/ai.md` with cited reasoning per weight. Port the penalty lessons: large wasted-play
  penalty (measure the size), tightly-scoped incidental-trigger penalty, reserve-break on own
  turn only. SWU-specific policy: initiative timing, aspect-penalty awareness, resourcing
  choices (which card to bank), sentinel math.
- Pinned-decision tests with margins + negative controls; measure changes over many full games.

### Phase 6 — Theme & content pipeline
- Choose the original setting + faction identities for the 4 aspects (naming session).
- Art: chibi super-deformed via Hugging Face; rigid prompt template with byte-identical style
  block; idempotent generator (`-DryRun`, exact-match `-Only`, skip-existing); masters kept out
  of repo, downscaled in. PowerShell + `.mjs` twin sharing prompt file/key resolution.
- Audio: ElevenLabs SFX for structured-log events (ambience, not music).
- Key precedence: flag → env var → gitignored file.

### Phase 7 — Polish & balance
- Deck-matrix win rates as a crude balance readout; expand the set once the loop is fun.

## Order of play
Phases 0–3 land together as the foundation (engine + tests before any UI). Then UI with
placeholder art, then AI, then theme/art/audio last — art is the most expensive and least
reworkable step, so it waits until names and card pool are stable.

## Status (2026-08-29, autonomous build session)

- DONE Phase 0–3: repo hygiene, engine, content system, tests (40 green: text-quality,
  200-game fuzz, 16-deck matrix, reproducibility, immutability, AI pinned decisions,
  AI-vs-AI full game).
- DONE expanded scope: all 16 precon decks (3 two-player starters + 10 spotlight decks,
  sets 1–8), 408 unique cards + 6 tokens, every mechanic implemented (see DEVIATIONS.md
  for the few logged digital-model simplifications).
- DONE Phase 4–5: playable click UI with generic choice bar for every queue step; AI
  with three difficulties (docs/ai.md).
- DONE Phase 6 naming: "The Sundered Veil" theme (THEME.md), 414 original names.
- Art: pipeline live (tools/gen-art.mjs, HF router → FLUX.1-schnell); prompts in
  tools/art-prompts.json; generated files land in gitignored art/.
- Sound: pipeline built (tools/gen-sfx.mjs + js/sound.js) — BLOCKED on a valid
  ElevenLabs key (.elevenlabs_key is rejected by the API).
