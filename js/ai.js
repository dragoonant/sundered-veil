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
    handCard: 4,           // cards are options — see handCardValue: a card you cannot
                           // afford is a weaker option than one you can.
    outOfReachDecay: 0.15, // per resource a card's cost exceeds your resource count
    outOfReachFloor: 0.4,  // an unaffordable card still has future value
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

  // An unaffordable card is still an option, just a worse one: decay by how far out
  // of reach it is, with a floor so a bomb is never treated as worthless.
  function handCardValue(state, p, inst) {
    const cost = SB.cardCost ? SB.cardCost(state, p, inst.cardId) : (SB.card(inst.cardId).cost || 0);
    if (cost == null) return W.handCard;
    const short = cost - state.players[p].resources.length;
    if (short <= 0) return W.handCard;
    return W.handCard * Math.max(W.outOfReachFloor, 1 - W.outOfReachDecay * short);
  }

  function sideValue(state, p) {
    const pl = state.players[p];
    let v = 0;
    v -= state.players[SB.other(p)].base.damage * 0; // (enemy damage counted from their side)
    v -= pl.base.damage * W.baseDamage;
    SB.allUnits(state, p).forEach(function (u) {
      v += W.unitOnBoard + SB.unitPower(state, u) * W.unitPower +
        SB.unitRemainingHp(state, u) * W.unitHp + u.shields * W.shield;
    });
    // An upgrade counts for whoever played it — a bounty sits on an ENEMY unit
    // but is still worth something to its owner.
    SB.allUnits(state).forEach(function (u) {
      u.upgrades.forEach(function (inst) {
        if (SB.upgradeOwner(u, inst) === p) v += W.upgrade;
      });
    });
    // Per CARD, not per card COUNT. A flat value made every bank score identically,
    // so which card got resourced was decided by legalActions order — about 19% of
    // all decisions (docs/ai.md). Scaling by reach means the cheapest way to gain a
    // resource is to bank something you cannot cast, which is also how it is played.
    pl.hand.forEach(function (inst) { v += handCardValue(state, p, inst); });
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
    const me = SB.whoActs(state);
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
      if (difficulty === 'hard' && !SB.isTerminal(after) && after.queue.length === 0 &&
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
