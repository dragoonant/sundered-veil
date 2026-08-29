# Lessons from MegaRobotWar — starter guide for the next card game

Distilled from building MegaRobotWar (engine, AI, content pipelines, art/audio, tests).
Drop this file into the new project's repo root and point `CLAUDE.md` at it from commit one.
The full original write-up lives in the old repo at `docs/new-project-handoff.md`; companions:
`docs/ai.md`, `docs/adding-a-set.md`, `docs/art-pipeline.md`, `docs/spatial-input.md`, `NOTICE.md`.

---

## 1. Architecture decisions that paid off — repeat all of these

**No build step.** Plain browser JS, no framework, no dependencies, no `package.json`.
`index.html` loads scripts in dependency order (comment the order requirement). Double-clicking
`index.html` works from `file://`; Netlify publishes the repo root with an empty build command.
Every file is an IIFE on one global namespace: `(function (NS) { ... })((window.NS = window.NS || {}))`.

**The engine exposes exactly three functions:** `legalActions(state)`, `apply(state, action)`,
`isTerminal(state)`. UI, AI, and tests are all built on only those. `apply` returns a NEW state,
never mutates — undo, AI search, and an "apply never mutates" test come nearly free.

**Every UI affordance derives from `legalActions`.** Drop zones, buttons, highlights are filters
over the engine's own action list. The UI cannot invent a rule; drag path and button path cannot
disagree. This was the single best structural decision in the UI.

**Log entries carry structured `data`, not just prose** (`{sound:'destroy'}`, `{notice:true}`).
Sound layer and AI react to what happened without pattern-matching English. The AI's "don't waste
a card" fix was only possible because fizzles were already recorded structurally.

**Cards are pure data; abilities are data, never code.** Ability = `{trigger, condition?, effects}`;
effect = `{op, target?, ...fields, then?, else?}`. A new mechanic = one new op in the effects
interpreter + one sentence in the text generator + one test. Adding a set = one data file + names
+ script tags in BOTH `index.html` and `tests.html` (forget the second and tests silently miss it).

**Validate content at load time, not play time.** Throw on missing/unknown ids, types, keywords,
triggers, duplicates. A typo otherwise surfaces as a confusing engine error many turns later.

**All display text in ONE file (`names.js`) from day one.** Everything else uses stable internal
ids (`d01-001`). Retrofitting this is miserable.

**Card rules text is GENERATED from the effect data, never stored.** This is both the copyright
firewall (nowhere to paste published wording) and a consistency guarantee (a card cannot say one
thing and do another).

**Seeded, deterministic RNG** (`seedFrom(seed + '|' + log.length + '|' + turn)`), with a test that
games are reproducible from their seed.

---

## 2. The recurring bug class — build the guard on day one

**"The engine enforces something the text generator never learned to say."** This produced four
separate user-visible bug batches: unspoken target filters ("1 enemy unit" that only accepted
damaged ones), literal holes in sentences ("While linked, this card  this turn."), unspoken
conditions, and a keyword value applied in only one branch.

**Day-one test (never actually built in the old project — build it first this time):** render every
card's generated text and fail on empty output, doubled spaces, or a lowercase sentence start.
Put a comment at each text describer noting it must stay in step with its engine counterpart —
the failure mode is silent.

---

## 3. AI

All difficulties are the same machine: enumerate `legalActions`, score each resulting position,
pick the best.
- Easy = same evaluator + noise + deliberate blunder rate (mistakes look human, not a dumber ruleset).
- Mid = settle battles to the damage step before scoring, small noise.
- Hard = settle + zero noise + one-ply min over the opponent's best reply.

Evaluation is `sideValue(me) - sideValue(them)` with a documented weight table. Keep a `docs/ai.md`
that records the *reasoning with citations* for each weight, not just the number.

Position value alone cannot express policy. Three penalties were needed:
- **Wasted play** (action resolved into nothing) — counter-intuitively LARGE (60 when the position
  deltas were 12–30), because passing gives the opponent a draw+resource, so throwing a card away
  can look cheaper than passing. Horizon effect. Find the size by measurement, not argument.
- **Wasted incidental trigger** — deliberately SMALL (below the cheapest deploy's value) so it
  reorders deploys but never argues against deploying. First version was too broad and taught the
  AI to stop attacking: scope penalties precisely.
- **Reserve break** (spending resources out from under a held instant-speed answer) — charged only
  on the AI's own turn.

`usableAp()` idea: ignore temporary stat deltas on a unit that cannot spend them before expiry.
One function fixed two bugs (self-wounding for unspendable pumps; casting debuffs that expire
harmlessly).

**Ties are where stupid AI moves come from** — "use for nothing" and "discard" score identically
and the tie-break picks the first.

**Pin decisions, not scores.** Each AI test builds a position with one clearly right move by
card-game fundamentals and asserts the policy finds it, with margins well clear of tie-break noise
(or noiseless mode) so a failure means the reasoning changed, not a coin flip. Include negative
controls (e.g. a friendly pump is NOT hoarded).

**Measure AI changes over many full games**, counting the specific behavior before/after
("9 wasted plays → 0, attacks 200 → 202"), never by eyeballing one game.

---

## 4. Testing

- Two entry points, one source: `tests.html` self-runs in browser; the headless Node runner
  **parses the `<script src>` tags out of tests.html** and runs them under `node:vm` in a bare
  `window` shim. One script list, no drift. Support `--quiet` and `--filter`.
- Hand-rolled harness with position-building helpers (`putOnBoard`, `putInHand`, `giveResources`,
  `act(state, matcher)` that on failure prints every available action). Tests set state directly
  so each states its premise in 2–3 lines.
- Layered fuzzing is the real regression guard: 200 random games over fixtures (no exceptions, no
  dead states — zero legal actions is a failure — termination bound); plus **every real deck vs
  every other, both seats** picked up automatically from the deck registry (its win-rate summary
  doubles as a crude balance readout).
- Content-integrity gates: every deck legal; every card/trait/set/pilot has a display name; every
  link requirement resolves; **card names slug to unique art filenames**.

---

## 5. Content pipelines (art, audio, imports)

- **Art style chosen for function over taste:** chibi super-deformed reads at 34px, forgives
  diffusion anatomy errors, and is a genre tradition rather than anyone's IP.
- **Rigid prompt template** with a byte-identical closing style block is what makes 169 generations
  look like one set. Encode card mechanics in the prompt ("EXACTLY N visible weapons" = AP).
- Generators must be **idempotent** (skip existing, `-Force`, `-Only`, `-DryRun`). `-DryRun` must be
  free and print the whole plan — it caught a slug collision before 169 paid generations.
- Substring `-Only` filters are dangerous (`resource` matched `resources` and regenerated a wide
  background at portrait size). Anchor or exact-match.
- Keep full-res masters OUT of the repo; downscale from masters every time (160 MB → 16.7 MB).
- Match medium to tool: SFX models do ambience, not music.
- Import tooling that reads third-party data writes work packets to a SCRATCH dir, never the repo,
  because packets carry third-party names. Read only mechanical fields.
- Gitignore the API key file BEFORE writing it; key precedence: flag → env var → gitignored file.
  Provide a Node `.mjs` twin of any PowerShell generator (for Linux containers), sharing the same
  prompt file/key resolution/skip rule.

---

## 6. Legal / IP posture

Mechanics are functional (not copyrightable) and implemented faithfully; ALL expression is
original. Two structural decisions make it durable rather than a one-time scrub: display text in
one file, and rules text generated not stored. Keep a `NOTICE.md` and update it **in the same
commit** as any behavior change that affects its claims (it went stale once when art landed).
When matching a keyword, match the behavior and write the sentence in your own words.

---

## 7. Browser/UI traps (each cost a real debugging session)

- `<img>` is natively draggable; the browser's image drag cancels pointer drags — cards failed to
  drag only when grabbed over artwork. Fix: `draggable="false"` + `-webkit-user-drag: none`.
- A synthetic `click` follows every pointer gesture; after a drop the board has re-rendered, so the
  click lands on a detached node. Suppress by timestamp AND in capture phase.
- `requestAnimationFrame` doesn't fire in background tabs — rAF animations freeze; force a layout
  read and set the end state.
- CSS `background` shorthand silently wipes `background-image`.
- A grid with no explicit width shrink-wraps into one column.
- Overlays need `pointer-events: none` or they eat drops.
- Discriminate tap vs drag by **distance (~8px), not time**.
- A drag whose `pointerup` never arrives wedges all later drags — let a fresh press finish the
  stale gesture.
- Full-redraw rendering eventually flickers; plan for keyed reconciliation of card nodes.

---

## 8. PowerShell traps (if tooling is PowerShell again)

- Variable names are case-insensitive: a local `$key` IS the `$Key` parameter — this silently
  overwrote an API key.
- `-match` replaces `$Matches` wholesale.
- Read failed HTTP bodies from `$_.ErrorDetails.Message` (the stream is already drained) — the
  difference between "HTTP 401" and "Invalid API key".
- `Out-File -Encoding utf8` writes a BOM in PS 5.1 that ends up in commit subjects.
- Here-strings break on embedded quotes with `git commit -m` — use `git commit -F <file>`.

---

## 9. Working process

- A user's diagnosis is a symptom report, not a root cause ("the zoom popup blocks dragging" was
  wrong — but drags really were failing, for two other reasons). Also say when the reported thing
  is not a bug.
- Measure instead of eyeballing (text legibility was settled by sampling luminance behind the text
  across all 169 cards — 47 were too bright — not by opinion).
- When screenshots are unavailable, read the DOM; drive the real code path — several "bugs" were
  test artifacts.
- Comment the WHY on every weight, penalty, and non-obvious branch. This habit is the most
  valuable thing to carry over.

## 10. Day-one checklist for the new project

1. `CLAUDE.md` pointing at this file.
2. Engine skeleton: `legalActions` / `apply` (immutable) / `isTerminal`; seeded RNG; structured log.
3. `names.js` for all display text; stable internal ids everywhere else.
4. Load-time content validation.
5. Generated card text + the render-every-card text-quality test (§2).
6. Test harness + headless runner that parses `tests.html`; reproducibility test; random-game fuzz.
7. `NOTICE.md`.
8. `.gitignore` for key files before any generator exists.
