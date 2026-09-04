// ai.js — one machine, four difficulties: enumerate legalActions, score each resulting
// position, pick the best. See docs/ai.md for the reasoning behind every weight.
// Depends on: engine. Deterministic given the state (uses seeded RNG).
//
// easy/mid/hard share the BASE weight profile. 'competition' is the same machine with a
// richer profile — terms that price things the base evaluator is blind to. Keeping the
// profiles apart is what makes a change measurable: a deck-vs-deck matrix cannot say
// whether the AI got stronger (every deck plays the same AI, so the mean is 50% by
// construction), but competition vs hard head to head answers exactly that:
//   node tools/ai-balance.mjs --group competitive --vs hard --difficulty competition
// A term earns promotion into the base profile by winning that gauntlet, not by seeming
// sensible. docs/ai.md records one that seemed sensible and measured backwards.
(function (SB) {
  'use strict';

  const AI = SB.ai = {};

  // ---- weights (docs/ai.md records the WHY for each) ----------------------
  const W = {
    baseDamage: 10,        // per point of damage on a base (win condition)
    unitOnBoard: 8,        // flat value of having a body
    unitPower: 4,          // per point of effective power
    lockedPower: 1,        // (competition prices this; see PROFILES)
    unitHp: 3,             // per point of remaining HP
    shield: 6,             // a shield eats a whole hit
    upgrade: 3,            // attached upgrade residual value
    handCard: 4,           // cards are options. Priced per CARD COUNT on purpose: the
                           // per-card reach decay was measured and made the AI worse
                           // (docs/ai.md, "TRIED, FAILED, REVERTED").
    readyResource: 1,      // unspent mana this turn ≈ small
    resource: 5,           // permanent economy
    credit: 0,             // (competition prices these three; see PROFILES)
    force: 0,
    deathPayoff: 1,
    deathPayoffEnemy: 1,
    initiative: 6,         // acting first next round
    leaderDeployed: 10,    // a leader unit is a strong body with upside
    // Penalties (policy that position value can't express):
    wastedPlay: 60,        // resolved into nothing — LARGE on purpose: passing gives
                           // the opponent nothing, so wasting a card must never look
                           // cheaper than passing (horizon effect; measured in MRW).
    wastedTrigger: 3,      // incidental trigger fizzled — SMALL on purpose: reorders
                           // plays but must never argue against deploying at all.
  };

  // ---- profiles -----------------------------------------------------------
  // Competition sees things the base evaluator does not. Each override is one concept,
  // and each is pinned by a test in tests/test-ai.js.
  const COMPETITION = Object.assign({}, W, {
    // Power you cannot swing with is not power. Not 0 — a locked unit still hits back
    // when it is defended into. Not 1 — an attacker that cannot attack is not one.
    lockedPower: 0.5,
    // A credit is a resource you get to spend ONCE. SB.readyResources already counts it
    // as spendable-now (1); this is the rest of it, since it keeps until spent.
    credit: 3,
    // The power token is binary and gates whole abilities (ab.forceCost). The base
    // evaluator scored it at exactly zero, so a deck built on it paid to do nothing.
    force: 5,
    // HP prices how hard a unit is to kill; for a unit that pays its controller when it
    // dies, being killed is partly the point.
    deathPayoff: 0.5,
    // The same discount applied to the ENEMY's death-trigger units is a different claim:
    // that the AI should be less interested in killing them. Held separately because the
    // two are separately measurable, and the first gauntlet suggests they do not agree.
    deathPayoffEnemy: 0.5,
  });
  const PROFILES = { competition: COMPETITION };
  // Exposed so a measurement run can vary ONE weight without editing this file, the
  // way AI.trace is exposed for instrumentation (tools/ai-balance.mjs --weights).
  // Nothing in the game writes to it.
  AI.profiles = PROFILES;
  // The active profile. Set for the duration of a decision and restored after, so a
  // caller that does not name a difficulty always gets base behaviour.
  let P = W;
  function profileFor(difficulty) { return PROFILES[difficulty] || W; }

  // Does this unit pay its controller when it dies? Upgrades and granted abilities
  // count: a martyr wearing a "when defeated" upgrade is as happy to die as a printed one.
  function paysOnDeath(state, u) {
    const abs = SB.unitAllAbilities ? SB.unitAllAbilities(state, u) : (SB.unitDef(u).abilities || []);
    return (abs || []).some(function (ab) { return ab.trigger === 'whenDefeated'; });
  }

  // mine: is this the side the evaluation is FOR? A unit that pays when it dies is worth
  // holding differently from a unit whose death pays your opponent.
  function sideValue(state, p, mine) {
    const pl = state.players[p];
    let v = 0;
    v -= state.players[SB.other(p)].base.damage * 0; // (enemy damage counted from their side)
    v -= pl.base.damage * P.baseDamage;
    SB.allUnits(state, p).forEach(function (u) {
      // Power the unit cannot swing with is discounted, which is what makes an
      // enabler legible: damaging your own "can attack only while damaged" unit reads
      // as unlocking its power, and pinging the ENEMY's reads as unlocking theirs.
      // Exhaustion is deliberately NOT a block here — it is the normal turn cycle,
      // and pricing it as a defect would talk the AI out of attacking at all.
      const blocked = SB.attackBlocked && SB.attackBlocked(state, u);
      const powerWorth = P.unitPower * (blocked ? P.lockedPower : 1);
      const hpWorth = P.unitHp *
        (paysOnDeath(state, u) ? (mine ? P.deathPayoff : P.deathPayoffEnemy) : 1);
      v += P.unitOnBoard + SB.unitPower(state, u) * powerWorth +
        SB.unitRemainingHp(state, u) * hpWorth + u.shields * P.shield;
    });
    // An upgrade counts for whoever played it — a bounty sits on an ENEMY unit
    // but is still worth something to its owner.
    SB.allUnits(state).forEach(function (u) {
      u.upgrades.forEach(function (inst) {
        if (SB.upgradeOwner(u, inst) === p) v += P.upgrade;
      });
    });
    v += pl.hand.length * P.handCard;
    v += pl.resources.length * P.resource;
    v += SB.readyResources(state, p) * P.readyResource;
    v += (pl.credits || 0) * P.credit;
    if (pl.force) v += P.force;
    if (pl.leader.deployed) v += P.leaderDeployed;
    if (state.initiative === p) v += P.initiative;
    if (state.winner === p) v += 100000;
    if (state.winner === SB.other(p)) v -= 100000;
    return v;
  }

  // difficulty is optional: callers inside a decision inherit the active profile.
  AI.evaluate = function (state, me, difficulty) {
    if (difficulty == null) return sideValue(state, me, true) - sideValue(state, SB.other(me), false);
    const prev = P;
    P = profileFor(difficulty);
    try { return sideValue(state, me, true) - sideValue(state, SB.other(me), false); }
    finally { P = prev; }
  };

  // Resolve any pending queue choices greedily (for lookahead only): among choice
  // actions pick whichever maximizes the CHOOSER's eval — the chooser may be either
  // player (e.g. opponent's regroup resourcing).
  function settle(state, depth) {
    let s = state;
    let guard = 0;
    while (!SB.isTerminal(s) && s.queue.length > 0 && guard++ < 30) {
      const acts = SB.legalActions(s);
      if (acts.length === 0) break;
      if (acts.length === 1) { s = SB.apply(s, acts[0]); continue; }
      const chooser = acts[0].player != null ? acts[0].player : s.active;
      let best = null, bestV = -Infinity;
      acts.forEach(function (a) {
        const r = settleOnce(SB.apply(s, a));
        const v = AI.evaluate(r, chooser);
        if (v > bestV) { bestV = v; best = r; }
      });
      s = best;
    }
    return s;
  }
  function settleOnce(s) {
    // Auto-advance forced single choices without recursion into scoring.
    let guard = 0;
    while (!SB.isTerminal(s) && s.queue.length > 0 && guard++ < 30) {
      const acts = SB.legalActions(s);
      if (acts.length !== 1) break;
      s = SB.apply(s, acts[0]);
    }
    return s;
  }

  function wastedPlayPenalty(before, after, action) {
    // A play/ability that resolved into nothing: detect via structured fizzle logs
    // added by this action with no other board delta signals needed.
    if (action.type !== 'playCard' && action.type !== 'leaderAction' && action.type !== 'unitAction') return 0;
    const newLogs = after.log.slice(before.log.length);
    const fizzles = newLogs.filter(function (l) { return l.fizzled; }).length;
    if (fizzles === 0) return 0;
    const realEffects = newLogs.filter(function (l) {
      return ['unitDamage', 'baseDamage', 'draw', 'shield', 'experience', 'buff', 'defeated',
        'baseHeal', 'unitHeal', 'readied', 'attached'].indexOf(l.type) >= 0;
    }).length;
    if (realEffects === 0 && action.type === 'playCard' && SB.card(action.cardId).type === 'event') {
      return P.wastedPlay; // the whole card did nothing
    }
    return fizzles * P.wastedTrigger; // incidental trigger wasted; deliberately small
  }

  AI.chooseAction = function (state, difficulty) {
    const me = SB.whoActs(state);
    const acts = SB.legalActions(state);
    SB.assert(acts.length > 0, 'AI asked to act with no legal actions');
    if (acts.length === 1) return acts[0];

    const noise = difficulty === 'easy' ? 25 : difficulty === 'mid' ? 4 : 0;
    const deep = difficulty === 'hard' || difficulty === 'competition';
    const prevProfile = P;
    P = profileFor(difficulty);
    try {
    const rand = SB.rng(SB.stateSeed(state, 'ai'));
    // Easy blunders: occasionally pick uniformly at random.
    if (difficulty === 'easy' && rand() < 0.2) {
      return acts[Math.floor(rand() * acts.length)];
    }

    let best = null, bestV = -Infinity;
    // AI.trace is an opt-in instrumentation hook (tools/ai-trace.mjs). It records the
    // score of EVERY candidate and its components, so a bad decision can be read off
    // the numbers instead of guessed at. It must never change what is chosen: the
    // scoring below is untouched and the rng is consumed in the same order either way.
    const trace = AI.trace ? [] : null;
    acts.forEach(function (a) {
      let after = SB.apply(state, a);
      after = settle(after);
      const base = AI.evaluate(after, me);
      const wasted = wastedPlayPenalty(state, after, a);
      let v = base - wasted;
      let swing = 0;
      // Hard: one-ply min over the opponent's best reply.
      if (deep && !SB.isTerminal(after) && after.queue.length === 0 &&
          after.phase === 'action' && after.active !== me) {
        swing = bestReplySwing(after, SB.other(me));
        v = v - 0.5 * swing;
      }
      v += (rand() - 0.5) * 2 * noise;
      if (trace) trace.push({ action: a, value: v, base: base, wasted: wasted, swing: swing });
      if (v > bestV) { bestV = v; best = a; }
    });
    if (trace) AI.lastScores = { me: me, best: best, bestV: bestV, all: trace };
    return best;
    } finally { P = prevProfile; }
  };

  function bestReplySwing(state, opp) {
    const acts = SB.legalActions(state);
    let bestV = -Infinity;
    const before = AI.evaluate(state, opp);
    acts.slice(0, 24).forEach(function (a) {
      const after = settle(SB.apply(state, a));
      const v = AI.evaluate(after, opp) - before;
      if (v > bestV) bestV = v;
    });
    return bestV === -Infinity ? 0 : Math.max(0, bestV);
  }
})(window.SB = window.SB || {});
