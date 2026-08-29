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
changes over many full games (deck-matrix winrates in the fuzz suite), never by
eyeballing one game.

## Known gaps (future passes)

- No initiative-timing policy (when to claim vs squeeze one more action).
- Credits/Force/plot resources not separately valued.
- `settle()` greedily resolves choice queues from the chooser's perspective —
  fine for single choices, weak for long divided-damage chains.
