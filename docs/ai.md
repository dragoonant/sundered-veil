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

**It made the AI worse, and it is reverted. Do not try it again in this form.**

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

## Known gaps (future passes)

- No initiative-timing policy (when to claim vs squeeze one more action).
- Credits/Force/plot resources not separately valued.
- **Resources are valued by count only, so WHICH card is banked is invisible and every
  `resourceCard` choice is an exact tie broken by list order — ~19% of all decisions.**
- `settle()` greedily resolves choice queues from the chooser's perspective —
  fine for single choices, weak for long divided-damage chains.
