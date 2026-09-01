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
- **Deck spread is wide: 77.2% to 23.3%.** Do NOT read this as a deck-balance
  verdict. It is one number confounding two causes, and this harness cannot separate
  them: a precon really being stronger, and the AI playing some archetypes better
  than others. A one-ply greedy policy flatters decks that win by attacking and
  punishes decks that need a plan held across turns — and the bottom of that table
  (The Living Current, Gorvax's Court) is exactly where the slower, more conditional
  decks sit. Suspect the AI first.

To separate the two, the next pass needs a non-AI control: replay the same matrix
with `SB.randomGame` on both sides and compare the orderings. Where a deck is weak
under both, that is the deck; where it is weak only under the AI, that is `js/ai.js`.

## Known gaps (future passes)

- No initiative-timing policy (when to claim vs squeeze one more action).
- Credits/Force/plot resources not separately valued.
- `settle()` greedily resolves choice queues from the chooser's perspective —
  fine for single choices, weak for long divided-damage chains.
