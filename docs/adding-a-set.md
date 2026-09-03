# Adding a set — the card representation, formally

Companion to CARD-GAME-LESSONS.md §1. Cards are pure data registered on `SB.cards`;
abilities are data, never code. This file is the schema reference.

## Checklist for a new set

1. Create `data/cards-<set>.js`: an IIFE that `Object.assign(SB.cards, {...})`.
2. Add display names to a `data/names-*.js` file (NEVER inline in card data).
3. Add art subject lines to `tools/art-prompts.json`; run `node tools/gen-art.mjs`, then
   `node tools/art-thumbs.mjs --only <ids> --sheet <name>` and QC the contact sheet
   (never the full renders; `npm install` once for sharp, tools only, no build step).
4. Add the script tag to **BOTH** `index.html` and `tests.html` (forget the second
   and tests silently miss the set).
5. Register decks in `data/decks.js` and deck names in the names files.
6. `node tools/run-tests.mjs --quiet` — load-time validation, the text-quality
   test, the fuzz matrix, and the name-integrity gates all pick the set up
   automatically.

## Adding cards to an existing set (the competitive expansion)

`tools/convert-cards.mjs` regenerates whole files and must not run once abilities are
hand-authored. `tools/pull-sets.mjs <scratchDir>` is the incremental path: it reads the
per-set swu-db dumps (primary) and the dotgg dump (fallback) from scratch, appends
skeleton lines for ids not yet in `data/cards-<set>.js` below a marker comment, writes the
printed text to `<scratch>/workpackets/<set>.json` for the authoring pass, extends
`<scratch>/trait-map.json` for new traits, and registers the tournament lists from
`<scratch>/decks.json`. `--dry-run` prints the plan. Existing lines are never touched.

Deck registry fields beyond `leader/base/cards`: `sideboard` (validated like the main
deck; the 3-copy limit counts main + sideboard), `format` (`premier` | `eternal`, shown
in the picker via `names.ui.format`) and `group` (`competitive` puts the deck in the
tournament optgroup and pairs the AI with a deck from the same group). A card may raise
its own copy limit with `copyLimit: N`.

## Card shapes

```js
// unit
{ id, type: 'unit', cost, power, hp, arena: 'ground'|'space',
  aspects: ['command', ...],         // [] = neutral
  traits: ['tr17', ...],             // neutral trait ids; display via names
  unique?: true, token?: true,
  keywords?: [{k:'raid', n:2}, {k:'smuggle', cost:6, aspects:[...]},
              {k:'piloting', cost:2, aspects:[...]}, {k:'exploit', n:2}, ...],
  staticFlags?: ['firstStrike'|'negateFirstEvent'|'attackOnlyDamaged'|
                 'noEnemyDefeatReturn'|'indirectBoost'|'tokenDoubler'|
                 'extraPilotSlot'|'defeatAtRegroup'],
  entersReadyIf?: <condition>,
  abilities?: [<ability>, ...] }

// leader (double-sided)
{ id, type: 'leader', aspects, traits, unique: true, deployCost,
  leaderSide: { abilities: [...] },          // 'action' abilities may add
                                             // cost (resources), forceCost,
                                             // gate (condition), exhaustCost
  deployedSide: { arena, power, hp, keywords?, abilities? },
  pilotSide?: { power, hp, abilities? } }    // deploy-as-pilot option

// base
{ id, type: 'base', hp, aspects, abilities?, epicAbility?: {effects:[...]} }

// event   — effects live in one {trigger:'onPlay'} ability
{ id, type: 'event', cost, aspects, traits?, costMod?: <condition + delta>,
  abilities: [{trigger:'onPlay', effects:[...]}] }

// upgrade
{ id, type: 'upgrade', cost, power?, hp?, aspects,
  attachTo?: 'friendly'|'enemy',     // omitted = any unit; only printed "friendly" restricts
  attachArena?, attachFilter?: {trait?, notTrait?, uniqueOnly?},
  costModAttach?: {cards:[ids], delta},
  grantKeywords?: [...], grantTraits?: [...], abilities?: [...] }
```

## Abilities

```js
{ trigger, condition?, effects: [op, ...] }
```

Triggered: `onPlay onAttack onAttackEnds whenDefeated whenAttacked onDeploy
onDeployPilot onPlayAsPilot onRegroup onUnitPlayed onUpgradePlayed onSmuggle
whenCombatDamaged whenHealed onDefeatUnit onIndirectUnitDamage onFriendlyAttack
onFriendlyDefeated onFriendlyAttackEnds onOpponentDraw onRevealOrDiscard
onNonCombatDamage onForceUnitAttack bounty` — plus `action` (activated; fields
`cost`, `forceCost`, `gate`, `oncePerRound`, `noExhaust`).

Static (use `grant`, not `effects`): `constant` (aura over `scope`),
`combatConstant` (own attacks), `combatAura` (other attackers), `defenderAura`,
and `onReadyTax` (`{amount}`).

Observer filters on triggered abilities: `playedTrait`, `playedUnique`,
`attackerTrait`, `oncePerRoundTrigger`, `exhaustCost` (leader-side offers).

## Effects (ops)

```js
{ op: '<name>', target?: <selector>, amount?|amountRef?, condition?,
  saveTargetAs?, useTarget?, then?: [op...], else?: [op...] }
```

- `then` runs after the op resolves; `else` runs when it fizzled (no legal
  target, or an optional target declined). Both nest.
- `saveTargetAs`/`useTarget` share a chosen target across the ops of one
  ability; `useTarget` also accepts `'@defender'`, `'@attackEnded'`, `'@played'`.
- `amountRef` values are listed in `SB.resolveAmount` (js/effects.js); every new
  ref needs a phrase in `amountText` (js/text.js).
- The op registry lives in js/effects.js + js/ops.js, extended by js/ops2.js (the
  competitive-deck expansion). **A new op requires: the handler, a describer in
  js/text.js, and a test.** Validation rejects unknown ops/triggers/keywords at load.
- js/ops2.js also hosts the extension hooks: `SB.extraConditions[name]`,
  `SB.extraAmounts(state, item, target, ref)` and `SB.extraSelector(...)` are consulted
  by effects.js before it throws on an unknown condition / amountRef / selector key;
  `SB.unitAllAbilities` is the one list of a unit's abilities (printed, upgrade-borne
  — pilot cards mark `asPilotOnly` / `asUnitOnly` — temporary, and aura-granted via
  `grant.abilities`); `SB.removeUpgrade` is the single upgrade-removal path so
  "When Defeated" on an upgrade and `ejectOnDefeat` pilots fire from one place.
- Card-level fields the engine reads outside abilities: `entersReadyIf`, `costMod`,
  `costModAttach` (`cards` or `uniqueOnly`), `attachArena`, `attachFilter`
  (`trait`, `notTrait`, `uniqueOnly`, `damaged`), `staticFlags`, `discardAction`,
  `copyLimit`, and on bases `startingHandDelta`. Each has a line in js/text.js.

Selectors: see `SB.selectorCandidates` — `who/what/arena/trait/aspect/maxCost/
minPower/damaged/notSelf/nonLeader/tokenOnly/...`; every filter needs a phrase in
`describeTarget` (js/text.js). The text-quality test catches structural rot; only
discipline keeps meaning in step — comment each describer with its engine
counterpart.
