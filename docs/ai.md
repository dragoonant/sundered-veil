# AI notes — weights and the reasoning behind them

All difficulties are one machine (js/ai.js): enumerate `legalActions`, apply each,
settle forced choices greedily, score with `evaluate = sideValue(me) − sideValue(them)`,
pick the best. Easy adds noise (±25) and a 20% uniform blunder; Mid settles with
small noise (±4); Hard is noiseless and subtracts half the opponent's best reply
swing (one-ply min).

## Weight table (js/ai.js `W`) — cite a reason or don't change it

- `baseDamage: 10` — base HP is the win condition; damage there is worth more than
  any single stat point. Set above unitHp so the AI finishes bases rather than
  endlessly trading.
- `unitOnBoard: 8` — a body has action value beyond stats (blocks, triggers,
  coordinate count). Carried from MegaRobotWar where a flat body bonus stopped the
  AI from over-valuing hand cards.
- `unitPower: 4`, `unitHp: 3` — power slightly over HP: this game rewards tempo
  (attackers pick fights), and raid/overwhelm scale with power.
- `shield: 6` — a shield eats one whole hit, usually 2–5 damage; 6 ≈ average hit
  absorbed.
- `handCard: 4` — options; below unitOnBoard so deploying beats hoarding.
- `resource: 5`, `readyResource: 1` — permanent economy vs spendable-this-turn.
- `initiative: 6` — acting first matters most when both players hold attacks;
  roughly one card of value.
- `leaderDeployed: 10` — leader units are stat-cheap and re-usable; encourages
  deploying once the threshold hits.
- `wastedPlay: 60` — LARGE on purpose (MegaRobotWar lesson): passing gives the
  opponent nothing here (they just act), so a card resolved into nothing must
  never look cheaper than passing. Horizon effect; size found by measurement in
  the predecessor, kept until re-measured here.
- `wastedTrigger: 3` — deliberately SMALL: reorders plays so incidental triggers
  land, but must never argue against deploying at all (the predecessor's first
  version taught the AI to stop attacking).

## Testing policy

Pin decisions, not scores (tests/test-ai.js): each test builds a position with one
clearly right move and asserts the policy finds it in noiseless mode. Measure AI
changes over many full games, never by eyeballing one game.

That measurement is `tools/ai-balance.mjs`, NOT the fuzz suite. The fuzz matrix in
tests/test-fuzz.js plays uniformly at random, one game per pairing, and asserts
nothing — it is a crash smoke pass, and it says nothing about play quality or deck
balance. Run the real thing:

```
node tools/ai-balance.mjs --games 6 --difficulty hard --seed bal1 --out scratch/ai-balance-hard.json
```

`chooseAction` is deterministic given a state, so a pairing replayed under the same
game seed reproduces exactly; repeat games vary the GAME seed, which is what varies
the shuffle. A whole run is reproducible from `--seed`. Budget ~2.9s/game at hard
(two-ply lookahead; a short probe suggests 1.8s, but the full matrix averaged 2.9s
across all pairings) and ~0.3s at mid, so the 16-deck matrix at 6 games/pairing is
1440 games and about 70 minutes.

## Measured baseline — 2026-08-31, seed `bal1`, hard, 6 games/pairing

1440 games over 240 ordered pairings; every deck plays every other in both seats.
Taken immediately after the nine leader deploy-cost corrections, so it supersedes
any impression formed before them. Re-measure after any change to `W`, to the
search, or to card data.

```
deck                    win%   as-1st  as-2nd        deck                    win%
Sera's Rescue          77.2%   72.2%   82.2%         Kael's Vanguard        51.1%
Tessa's Pathfinders    67.8%   67.8%   67.8%         The Oathbound          42.2%
Kade's Contract        67.2%   71.1%   63.3%         Veyd's Design          37.8%
Farrow's Gambit        65.0%   62.2%   67.8%         Kael's Redemption      36.1%
Solenne's Resolve      60.6%   62.2%   58.9%         The Emperor's Design   33.3%
Skarn's Vengeance      56.1%   53.3%   58.9%         The Living Current     26.1%
Malvane's Fist         52.2%   51.1%   53.3%         Gorvax's Court         23.3%
Draul's Remnant        52.2%   54.4%   50.0%
The Machine Hosts      51.7%   47.8%   55.6%
```

- **Seat 1 (initiative) win rate: 50.3%** over 1440 decided games. The initiative
  model is fair — going first is worth essentially nothing measurable, which is the
  single most important number here and the one the deploy-cost fixes could have
  broken. `W.initiative: 6` is not obviously mispriced.
- **0 draws, 0 timeouts, 79 actions/game mean.** Games end decisively and quickly;
  nothing is grinding against the 4000-action cap.
- **Deck spread is wide: 77.2% to 23.3% — but most of that is the AI, not the decks.**
  See the control below.

## Random-play control — 2026-08-31, seed `bal1`, 24 games/pairing

5760 games, same matrix, uniform random play on both sides. Random play is blind to
archetype, so it measures the DECK with the pilot removed. Comparing the two orderings
separates a strong deck from a deck the AI happens to play well.

```
deck                    AI%   random%   delta   read
Sera's Rescue          77.2     62.9   +14.3   AI pilots it well
Kade's Contract        67.2     55.3   +11.9   AI pilots it well
The Machine Hosts      51.7     40.3   +11.4   AI pilots it well
Solenne's Resolve      60.6     49.3   +11.2   AI pilots it well
Farrow's Gambit        65.0     55.0   +10.0   AI pilots it well
Skarn's Vengeance      56.1     46.8    +9.3   AI pilots it well
Malvane's Fist         52.2     43.6    +8.6   AI pilots it well
Tessa's Pathfinders    67.8     64.2    +3.6   consistent — genuinely strong
Kael's Vanguard        51.1     47.5    +3.6   consistent
Draul's Remnant        52.2     51.7    +0.6   consistent
The Oathbound          42.2     49.0    -6.8   AI struggles
Veyd's Design          37.8     44.9    -7.1   AI struggles
The Living Current     26.1     35.3    -9.2   weak deck AND badly piloted
The Emperor's Design   33.3     50.6   -17.2   AI CANNOT PILOT IT
Gorvax's Court         23.3     41.8   -18.5   AI CANNOT PILOT IT
Kael's Redemption      36.1     61.9   -25.8   AI CANNOT PILOT IT
```

**The headline: `Kael's Redemption` is the 3rd STRONGEST deck under random play (61.9%)
and the 3rd weakest under the AI (36.1%).** A 26-point swing. That is not a weak deck;
that is `js/ai.js` failing to pilot it. Same for The Emperor's Design and Gorvax's Court,
both near or above even under random play and bottom-three under the AI.

Corroborating: the spread is 53.9 points under the AI and only 28.9 under random play.
The AI nearly DOUBLES the apparent imbalance. Deck power differences are real but roughly
half what the AI table suggests.

Only `The Living Current` is weak under both (35.3% random), so it is the one deck with a
genuine card-level problem — compounded by poor piloting on top.

Seat 1 wins 49.9% under random play against 50.3% under the AI. The initiative model is
fair independently of who is playing, which is a much stronger result than either run
alone.

### What the cause is NOT

Two hypotheses tested against the data and both come up short — record them so nobody
re-runs them:

- **Not the unvalued token/Force/plot resources** (the known gap below). The five
  worst-piloted decks average a SMALLER share of token cards than the five best (16% vs
  22%), and `Kael's Redemption`, the worst by 7 points, contains zero of them.
- **Not simply deck cost.** Expensive decks do trend worse — the five worst-piloted
  average 3.30 mean cost against 2.81 for the five best, consistent with a one-ply
  evaluator that cannot see an expensive card's payoff past its horizon. But the
  correlation is only r = -0.44 (r-squared 0.20), which explains a fifth of the variance
  and is not significant at n = 16. A lead, not a cause.

The next step is to instrument, not to theorise: log `evaluate()` for `Kael's Redemption`
against a deck it beats under random play and loses to under the AI, and find the turn
where the policy's choice diverges from the obvious line.

## Instrumented trace — what the numbers actually say

`tools/ai-trace.mjs` replays one seeded game and records every candidate action's score
through the `AI.trace` hook in js/ai.js. The hook is opt-in and behaviour-neutral: the
scoring is untouched and the rng is consumed in the same order either way, verified by
replaying games with tracing off and on and diffing the results.

```
node tools/ai-trace.mjs --deck0 deck-p5a --deck1 deck-p8a --seed "bal1|deck-p5a|deck-p8a|0" --side 1
```

### Confirmed defect: banking a resource is a coin flip

`resourceCard` decisions are **100% exact ties, in every deck measured** — and they are
18-21% of every decision the AI makes. `sideValue` counts resources by COUNT alone
(`v += pl.resources.length * W.resource`, js/ai.js), so every candidate bank scores
identically and the winner is whichever card `legalActions` happened to list first.
Roughly a fifth of the AI's play is decided by array order, and it will cheerfully bank
its best card.

`mulligan` is 100% tied too, but that is once a game and binary; the resource choice
recurs every regroup phase for the whole game.

### What the trace did NOT explain

The instrumentation was built to explain WHY the AI misplays Kael's Redemption
specifically, and on that it failed. Across 6 traced games each for three badly-piloted
and two well-piloted decks (1120 decisions), none of the obvious aggregate signals
separate them:

```
deck                          W-L   decisions   tie%  term-flip%  attack-declined%
Kael's Redemption (-25.8)     0-6         205   46.8         3.4              12.7
Emperor's Design  (-17.2)     2-4         246   37.4        12.6              17.1
Gorvax's Court    (-18.5)     3-3         239   42.7         9.6              12.6
Sera's Rescue     (+14.3)     6-0         189   37.0         7.4              16.9
Kade's Contract   (+11.9)     5-1         241   41.5         3.3              10.8
```

Sera's Rescue declines the most attacks (16.9%) and is the best-piloted deck; Kade's
Contract has a higher tie rate than two of the three failures. So the deck-specific
cause is still open — do not assume it is the tie rate just because the tie rate is bad.

### Experiment: per-card hand valuation — TRIED, FAILED, REVERTED

The obvious next experiment was to give `sideValue` a per-card term for what is banked
instead of `pl.hand.length * W.handCard`, so the cheapest way to gain a resource is to
bank a card you cannot cast. Implemented as a reach decay (`outOfReachDecay: 0.15`,
`outOfReachFloor: 0.4`) and measured on the same matrix, same seed, same 1440 games.

**It made the AI worse. Do not try it again in this form.**

> **Correction, 2026-09-03.** This section claimed the change was reverted. It was not:
> the commit that recorded the failure (`9561922`) touched only this file, so the losing
> heuristic stayed live in `js/ai.js` for three days and every measurement taken in that
> window was taken on it. The code is reverted now, as part of the Competition-difficulty
> work. **A doc that says "reverted" is not a revert — check the diff.**

```
                       before   after   delta   random
Skarn's Vengeance        56.1    63.3    +7.2     46.8
Farrow's Gambit          65.0    71.7    +6.7     55.0
Sera's Rescue            77.2    81.7    +4.4     62.9
Kael's Redemption        36.1    40.0    +3.9     61.9
...
Kade's Contract          67.2    61.7    -5.6     55.3
The Machine Hosts        51.7    44.4    -7.2     40.3
Kael's Vanguard          51.1    43.3    -7.8     47.5

SPREAD   before 53.9   after 62.8   (target: toward random 28.9)
```

The spread was the whole claim, and it moved **8.9 points in the wrong direction** —
away from random play, not toward it. The AI became MORE archetype-biased, not less.
`Kael's Redemption` did gain 3.9 points, but its gap to its own random-play winrate only
closed from 25.8 to 21.9, so the deck-specific failure is essentially untouched, and
`Gorvax's Court` fell further (23.3 to 18.9). The cost was also real: 32% slower
(4183s to 5534s), since every evaluation now prices every card in hand.

Seat 1 held at 49.8% against 50.3%, so the initiative model is robust to this. That is
the only good news in the run.

What this rules out: banking is NOT merely mispriced in a way a cheap per-card heuristic
fixes. Breaking the tie with a wrong tiebreaker is worse than leaving it arbitrary,
because a systematic bad choice beats a random one only when the systematics are right.
The tie itself is still a real defect — about 19% of decisions — but the fix has to know
which card is actually surplus, which needs more than cost-versus-reach.

## Competition difficulty — Phase 1: enablement (2026-09-03)

`sideValue` priced a unit as body + power + HP + shields, with no term for whether the
unit can act at all. The failure that exposed it: `ash-011`'s free leader action deals 1
damage to a unit with 2+ remaining HP (so it can never kill), and `lof-063` — in the same
competitive list — is a 5/5 that can attack ONLY while damaged. The correct play is to
ping your OWN 5/5 to switch it on. The AI scored that as −3 HP with no upside and pinged
a harmless enemy 1/4 instead. It was not misjudging the combo; it could not see it.

The term: `SB.attackBlocked(state, unit)` (js/engine.js, extracted from the predicate
`legalActions` already used, so the two cannot drift) reports why a unit cannot attack,
ignoring exhaustion. `sideValue` multiplies a blocked unit's power by `W.lockedPower`.

- **0.5, not 0** — a locked unit still deals its power when it is defended into.
- **0.5, not 1** — an attacker that cannot attack is not an attacker.
- **Exhaustion is deliberately not a block.** It is the normal turn cycle; pricing it as
  a defect would argue the AI out of attacking at all.

This generalises past the one card: the same term makes pinging the ENEMY's locked unit
read as the gift it is, and it will price every future "only while X" unit without
anything being taught about that card specifically.

Pinned in tests/test-ai.js: it pings its own locked 5/5 over a harmless enemy; it does
not switch on the enemy's; and a locked unit evaluates below the same unit unlocked.
Setting `lockedPower` back to 1.0 fails two of the three, so the tests bite.

**Measured: no effect at matrix scale, and it cannot have one.** A/B over the competitive
matrix (seed `comp1`, 2 games/pairing, 760 games/arm), `lockedPower` 0.5 against 1.0,
nothing else changed: **6 games out of 1520 changed hands.** Every one of them was in a
pairing against `deck-c01`, because `deck-c01` is the only competitive list holding
`lof-063`, and `lof-063` is the only card in a 1527-card pool with `attackOnlyDamaged`.

The term is KEPT: it is correct, it is pinned by tests, it costs one multiply per unit,
and it fixes a decision watched at the table. But it buys ~nothing on the matrix, and no
matrix at this card frequency could say otherwise. **A term that fires on one card in
1527 is a correctness fix, not a strength fix — do not expect winrate from it.**

## Competitive baseline and control — 2026-09-03, seed `comp1`, 2 games/pairing

First measurement of the 20 tournament lists. 760 games/arm, 0 draws, 0 timeouts, 88
actions/game mean. Seat 1: **48.6%** under the AI, 50.8% under random — initiative stays
fairly priced on these lists.

**The control is the finding.** Six decks are piloted WORSE THAN RANDOM:

```
deck                     leader     AI     random    gap
Zhael's Misfortune       jtl-002   21.1%   50.0%   -28.9
Voss's Full Hand         law-018   35.5%   57.9%   -22.4
Skarn's Shadow           lof-009   40.8%   57.9%   -17.1
Dray's Audit             sec-010   19.7%   35.5%   -15.8
Wyn's Foresight          twi-004   63.2%   75.0%   -11.8
Vale's Vow              ts26-002   60.5%   69.7%    -9.2
                    ... and, at the other end ...
The Forgemother's Steel  ash-001   73.7%   25.0%   +48.7
Kael's Wingmen           jtl-012   64.5%   44.7%   +19.7
Korrin's Run             ash-014   48.7%   30.3%   +18.4
```

Losing to random is not a missing heuristic — random has none. It means the policy is
**systematically choosing bad moves** in those archetypes, and two of them read straight
off their leaders:

- `jtl-002` (worst, -28.9) reuses a *whenDefeated* ability: the deck wants its own units
  to die. `sideValue` prices every body at +8 plus power and HP, so the AI protects the
  units whose deaths ARE the engine, and declines the trades the deck is built on.
- `law-018` (-22.4) mills for credits. Credits are not in `sideValue` at all (see Known
  gaps), so the AI spends a real resource for a currency it scores as zero — it is paying
  to make its own position look worse.

Both are missing terms in the evaluator, not missing deck knowledge. That is where the
next Phase 1 pass goes: the six worse-than-random decks are 30% of the field, and the AI
is actively throwing those games.

## Competition difficulty — the profile split, and why the matrix cannot judge it

A deck-vs-deck matrix cannot answer "did the AI get better". Every deck plays the same
policy, so the mean winrate is 50% by construction and all the matrix shows is archetype
bias moving around. Both Phase 1 measurements ran into this: the death-payoff/currency
arm moved a dozen decks by several points each (Wyn's Foresight -9.3, Greeve's Favor
+6.6) with no way to read a verdict out of it.

So the weights are now two profiles. easy/mid/hard share the BASE table — unchanged from
before this work. `competition` is the same machine with the terms the base evaluator is
blind to. That makes the real question directly measurable:

```
node tools/ai-balance.mjs --group competitive --difficulty competition --vs hard --seed g1
```

Each pairing is played twice with the seats swapped, so the result cannot be a seat
advantage in disguise. **A term earns promotion into the base profile by winning that
gauntlet.** Not by being sensible — this file records one that was sensible and measured
backwards.

Competition currently carries: `lockedPower` 0.5, `credit` 3, `force` 5,
`deathPayoff` 0.5. Frequency in the 20 competitive lists, which is what decides whether
a term can show up at all:

```
mechanic            cards in pool   decks running it   median copies
whenDefeated              46             18/20               6
force token                7              2/20               4
credits                    6              2/20               1
attackOnlyDamaged          1              1/20               2
```

Only `deathPayoff` can move a matrix. Currency is judged on deck-c07 and deck-c11
specifically, both currently piloted worse than random.

### Gauntlet 1 — the four terms together: 49.3% of 760 games

A coin flip (SE ~1.8%), so the bundle is not an improvement. But it is not flat either.
Comparing each deck's gauntlet winrate to its own matrix winrate — where both seats
played hard, so deck strength cancels — the terms sort the field almost perfectly by how
well the AI played it BEFORE:

```
helped                          hurt
Zhael's Misfortune  +15.8       Tessa's Trust        -23.7
Dray's Audit         +9.2       Zhal's Coven          -9.2
Kresh's Achievement  +7.9       Marrow's Manhunt      -6.6
Greeve's Favor       +6.6       Forgemother's Steel   -5.3
                    ... 9 helped, 11 hurt, mean -0.65
```

Three of the four decks the AI played worst improved sharply. The cost landed on decks it
already piloted well. That is a term right in kind and wrong in magnitude — or one term in
the bundle pulling the other way.

**Which term, deduced before measuring:** `deck-c03` runs no force, no credits and no
`attackOnlyDamaged` card, so of the four terms only `deathPayoff` can touch it. The
-23.7 is `deathPayoff` alone. And `deck-c12` (+15.8) is likewise a deathPayoff-only
deck. One term produces both the largest gain and the largest loss.

Deck composition says why they differ:

```
deck        units   whenDefeated copies   share   payoffs
deck-c12      47            19             40%    buffTemp, draw, damage, tokens
deck-c13      42            10             24%    binaryChoice, draw, advantage
deck-c03      52             3              6%    searchDeck
deck-c01      52             3              6%    heal
```

Three cards cannot cost 23.7 points, so the damage is not on `deck-c03`'s own side of
the board. **The term is symmetric**: it discounts the HP of the ENEMY's death-trigger
units too, which says "be less interested in killing them". Against a field averaging six
such cards per deck, that is an under-removal bias running all game, and it swamps the
handful of times `deck-c03` benefits from its own three.

The two halves are separate claims and only one of them looks defensible. Split into
`deathPayoff` (my units — I should trade them more freely) and `deathPayoffEnemy`
(their units — should I really want to kill them less?), so each can be measured alone.

### Checked and NOT a defect: initiative timing

The fingerprint (tools/ai-fingerprint.mjs, new) showed the AI ending its round by claiming
initiative on 12.5% of its actions against random's 8.7%, which looked like the missing
initiative-timing policy biting. It is not. Sampling 38 claims across six games: it takes
**3.37 actions in the round before claiming** and has **1.18 ready resources unspent**
when it does. Only 3 of 38 claims came with no actions taken. The gap against random is
random passing at arbitrary moments, not the AI claiming early. Not pursued.

## Known gaps (future passes)

- No initiative-timing policy (when to claim vs squeeze one more action).
- Credits/Force/plot resources not separately valued.
- **Resources are valued by count only, so WHICH card is banked is invisible and every
  `resourceCard` choice is an exact tie broken by list order — ~19% of all decisions.**
- `settle()` greedily resolves choice queues from the chooser's perspective —
  fine for single choices, weak for long divided-damage chains.
