// ai.js — one machine, three difficulties: enumerate legalActions, score each
// resulting position, pick the best. See docs/ai.md for the reasoning behind every
// weight. Depends on: engine. Deterministic given the state (uses seeded RNG).
(function (SB) {
  'use strict';

  const AI = SB.ai = {};

  // ---- weights (docs/ai.md records the WHY for each) ----------------------
  const W = {
    baseDamage: 10,        // per point of damage on a base (win condition)
    unitOnBoard: 8,        // flat value of having a body
    unitPower: 4,          // per point of effective power
    unitHp: 3,             // per point of remaining HP
    shield: 6,             // a shield eats a whole hit
    upgrade: 3,            // attached upgrade residual value
    handCard: 4,           // cards are options
    readyResource: 1,      // unspent mana this turn ≈ small
    resource: 5,           // permanent economy
    initiative: 6,         // acting first next round
    leaderDeployed: 10,    // a leader unit is a strong body with upside
    // Penalties (policy that position value can't express):
    wastedPlay: 60,        // resolved into nothing — LARGE on purpose: passing gives
                           // the opponent nothing, so wasting a card must never look
                           // cheaper than passing (horizon effect; measured in MRW).
    wastedTrigger: 3,      // incidental trigger fizzled — SMALL on purpose: reorders
                           // plays but must never argue against deploying at all.
  };

  function sideValue(state, p) {
    const pl = state.players[p];
    let v = 0;
    v -= state.players[SB.other(p)].base.damage * 0; // (enemy damage counted from their side)
    v -= pl.base.damage * W.baseDamage;
    SB.allUnits(state, p).forEach(function (u) {
      v += W.unitOnBoard + SB.unitPower(state, u) * W.unitPower +
        SB.unitRemainingHp(state, u) * W.unitHp + u.shields * W.shield +
        u.upgrades.length * W.upgrade;
    });
    v += pl.hand.length * W.handCard;
    v += pl.resources.length * W.resource;
    v += SB.readyResources(state, p) * W.readyResource;
    if (pl.leader.deployed) v += W.leaderDeployed;
    if (state.initiative === p) v += W.initiative;
    if (state.winner === p) v += 100000;
    if (state.winner === SB.other(p)) v -= 100000;
    return v;
  }

  AI.evaluate = function (state, me) {
    return sideValue(state, me) - sideValue(state, SB.other(me));
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
      return W.wastedPlay; // the whole card did nothing
    }
    return fizzles * W.wastedTrigger; // incidental trigger wasted; deliberately small
  }

  AI.chooseAction = function (state, difficulty) {
    const me = state.queue.length > 0
      ? (state.queue[0].player != null ? state.queue[0].player : state.queue[0].controller)
      : state.active;
    const acts = SB.legalActions(state);
    SB.assert(acts.length > 0, 'AI asked to act with no legal actions');
    if (acts.length === 1) return acts[0];

    const noise = difficulty === 'easy' ? 25 : difficulty === 'mid' ? 4 : 0;
    const rand = SB.rng(SB.stateSeed(state, 'ai'));
    // Easy blunders: occasionally pick uniformly at random.
    if (difficulty === 'easy' && rand() < 0.2) {
      return acts[Math.floor(rand() * acts.length)];
    }

    let best = null, bestV = -Infinity;
    acts.forEach(function (a) {
      let after = SB.apply(state, a);
      after = settle(after);
      let v = AI.evaluate(after, me);
      v -= wastedPlayPenalty(state, after, a);
      // Hard: one-ply min over the opponent's best reply.
      if (difficulty === 'hard' && !SB.isTerminal(after) && after.queue.length === 0 &&
          after.phase === 'action' && after.active !== me) {
        v = v - 0.5 * bestReplySwing(after, SB.other(me));
      }
      v += (rand() - 0.5) * 2 * noise;
      if (v > bestV) { bestV = v; best = a; }
    });
    return best;
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
