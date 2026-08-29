// engine.js — the entire engine surface: SB.legalActions(state), SB.apply(state, action),
// SB.isTerminal(state). Depends on: util.js, rules.js, effects.js, card data.
//
// apply() clones, mutates the clone, drains the resolution queue, and returns the clone.
// legalActions() is pure. UI, AI, and tests build on ONLY these three functions.
(function (SB) {
  'use strict';

  SB.isTerminal = function (state) {
    return state.winner != null;
  };

  // ---- legal actions ------------------------------------------------------

  SB.legalActions = function (state) {
    if (state.winner != null) return [];
    const acts = [];

    // A pending queue item owns the turn: only its choices are legal.
    if (state.queue.length > 0) {
      const item = state.queue[0];
      if (item.step === 'mulligan') {
        return [
          { type: 'mulligan', player: item.player, keep: true },
          { type: 'mulligan', player: item.player, keep: false },
        ];
      }
      if (item.step === 'setupResources' || item.step === 'regroupResource') {
        const p = state.players[item.player];
        p.hand.forEach(function (inst, i) {
          acts.push({ type: 'resourceCard', player: item.player, handIndex: i });
        });
        if (item.step === 'regroupResource') {
          acts.push({ type: 'resourceCard', player: item.player, handIndex: -1 }); // decline
        }
        return acts;
      }
      if (item.candidates) {
        item.candidates.forEach(function (c, i) {
          acts.push({ type: 'choose', player: item.controller, index: i });
        });
        if (item.op && item.op.target && item.op.target.optional) {
          acts.push({ type: 'choose', player: item.controller, index: -1 }); // decline
        }
        return acts;
      }
      if (SB.queueSteps && SB.queueSteps[item.step]) {
        const stepActs = SB.queueSteps[item.step].actions(state, item);
        if (stepActs && stepActs.length) return stepActs;
        // Auto-skip steps are drained in apply's processQueue; reaching here with
        // none available means the step is a no-op — treat as internal error.
        throw new Error('queue step ' + item.step + ' offered no actions');
      }
      // Head is an engine step that needs no choice — apply() would have drained it.
      throw new Error('queue head unresolved without choice: ' + state.queue[0].step);
    }

    if (state.phase !== 'action') throw new Error('no actions outside action phase: ' + state.phase);

    const me = state.active;
    const p = state.players[me];
    if (state.locked[me]) return []; // shouldn't be asked, but be safe

    // Play cards from hand.
    p.hand.forEach(function (inst, i) {
      const card = SB.card(inst.cardId);
      const cost = SB.cardCost(state, me, inst.cardId);
      if (cost > SB.readyResources(state, me)) return;
      if (card.type === 'unit') {
        if (card.unique && SB.allUnits(state, me).some(function (u) { return u.cardId === inst.cardId; })) return;
        acts.push({ type: 'playCard', player: me, handIndex: i, cardId: inst.cardId });
      } else if (card.type === 'event') {
        acts.push({ type: 'playCard', player: me, handIndex: i, cardId: inst.cardId });
      } else if (card.type === 'upgrade') {
        // One action per legal attach target so the choice is explicit up front.
        SB.allUnits(state).forEach(function (u) {
          if (card.attachTo === 'friendly' && u.owner !== me) return;
          if (card.attachTo === 'enemy' && u.owner === me) return;
          if (card.attachArena && SB.arenaOf(state, u) !== card.attachArena) return;
          acts.push({ type: 'playCard', player: me, handIndex: i, cardId: inst.cardId, attachTo: u.uid });
        });
      }
    });

    // Attacks.
    SB.allUnits(state, me).forEach(function (u) {
      if (u.exhausted) return;
      if (SB.unitPower(state, u) <= 0 && !unitHasKeyword(state, u, 'saboteur')) {
        // A 0-power attack is legal in rules but only matters for on-attack triggers;
        // keep it legal if the unit has any onAttack ability, else prune the noise.
        if (!hasTrigger(u, 'onAttack') && SB.keywordTotal(state, u, 'raid') === 0) return;
      }
      const arena = SB.arenaOf(state, u);
      const enemies = state[arena].filter(function (e) { return e.owner !== me; });
      const sentinels = enemies.filter(function (e) { return SB.hasKeyword(state, e, 'sentinel'); });
      const sab = SB.hasKeyword(state, u, 'saboteur');
      const targets = (sentinels.length > 0 && !sab) ? sentinels : enemies;
      targets.forEach(function (e) {
        acts.push({ type: 'attack', player: me, attacker: u.uid, target: { kind: 'unit', uid: e.uid } });
      });
      if (sentinels.length === 0 || sab) {
        acts.push({ type: 'attack', player: me, attacker: u.uid, target: { kind: 'base', player: SB.other(me) } });
      }
    });

    // Leader: deploy epic action / leader-side action abilities.
    const leaderCard = SB.card(p.leader.cardId);
    if (!p.leader.deployed) {
      if (p.resources.length >= leaderCard.deployCost) {
        acts.push({ type: 'deployLeader', player: me });
      }
      (leaderCard.leaderSide.abilities || []).forEach(function (ab, ai) {
        if (ab.trigger !== 'action') return;
        if (p.leader.exhausted) return; // leader actions cost exhausting the leader
        const rCost = ab.cost || 0;
        if (rCost > SB.readyResources(state, me)) return;
        acts.push({ type: 'leaderAction', player: me, abilityIndex: ai });
      });
    }

    // Unit activated abilities (trigger:'action', cost = exhaust self + resources).
    SB.allUnits(state, me).forEach(function (u) {
      (SB.unitDef(u).abilities || []).forEach(function (ab, ai) {
        if (ab.trigger !== 'action') return;
        if (u.exhausted) return;
        if ((ab.cost || 0) > SB.readyResources(state, me)) return;
        acts.push({ type: 'unitAction', player: me, uid: u.uid, abilityIndex: ai });
      });
    });

    if (!state.initiativeClaimed) acts.push({ type: 'claimInitiative', player: me });
    acts.push({ type: 'pass', player: me });
    return acts;
  };

  function hasTrigger(unit, trigger) {
    return (SB.unitDef(unit).abilities || []).some(function (a) { return a.trigger === trigger; });
  }
  function unitHasKeyword(state, u, k) { return SB.hasKeyword(state, u, k); }

  // ---- apply --------------------------------------------------------------

  SB.apply = function (prev, action) {
    const state = SB.clone(prev);
    if (state.locked == null) state.locked = [false, false];

    if (state.queue.length > 0) {
      applyQueueAction(state, action);
    } else {
      applyPhaseAction(state, action);
    }
    processQueue(state);

    // If the queue emptied mid-setup, move to the first action phase.
    if (state.phase === 'setup' && state.queue.length === 0) {
      startActionPhase(state);
    }
    return state;
  };

  function expect(cond, action) {
    if (!cond) throw new Error('illegal action: ' + JSON.stringify(action));
  }

  function applyQueueAction(state, action) {
    const item = state.queue[0];
    if (item.step === 'mulligan') {
      expect(action.type === 'mulligan' && action.player === item.player, action);
      state.queue.shift();
      if (!action.keep) {
        const p = state.players[item.player];
        const rand = SB.rng(state.seed + '|mulligan|' + item.player);
        const all = p.deck.concat(p.hand);
        const reshuffled = SB.shuffled(all, rand);
        p.hand = reshuffled.slice(0, 6);
        p.deck = reshuffled.slice(6);
        state.log.push({ type: 'mulligan', player: item.player });
      }
      return;
    }
    if (item.step === 'setupResources' || item.step === 'regroupResource') {
      expect(action.type === 'resourceCard' && action.player === item.player, action);
      const p = state.players[item.player];
      if (action.handIndex === -1) {
        expect(item.step === 'regroupResource', action);
        state.queue.shift();
        return;
      }
      expect(action.handIndex >= 0 && action.handIndex < p.hand.length, action);
      const inst = p.hand.splice(action.handIndex, 1)[0];
      p.resources.push({ instance: inst, exhausted: false });
      state.log.push({ type: 'resourced', player: item.player });
      if (item.step === 'setupResources') {
        item.remaining = (item.remaining == null ? 2 : item.remaining) - 1;
        if (item.remaining <= 0) state.queue.shift();
      } else {
        p.resourcedThisRound = true;
        state.queue.shift();
      }
      return;
    }
    if (SB.queueSteps && SB.queueSteps[item.step]) {
      state.queue.shift();
      SB.queueSteps[item.step].apply(state, item, action);
      return;
    }
    // Target choice for the head effect.
    expect(action.type === 'choose' && item.candidates, action);
    state.queue.shift();
    if (action.index === -1) {
      expect(item.op.target && item.op.target.optional, action);
      state.log.push({ type: 'fizzle', why: 'declined', cardId: item.ctx && item.ctx.cardId, fizzled: true });
      return;
    }
    const target = item.candidates[action.index];
    expect(target, action);
    delete item.candidates;
    SB.ops[item.op.op](state, item, target);
  }

  function applyPhaseAction(state, action) {
    expect(state.phase === 'action' && action.player === state.active, action);
    const me = state.active;
    const p = state.players[me];

    if (action.type === 'pass') {
      state.passed[me] = true;
      state.log.push({ type: 'pass', player: me });
      advanceTurn(state);
      return;
    }
    if (action.type === 'claimInitiative') {
      expect(!state.initiativeClaimed, action);
      state.initiative = me;
      state.initiativeClaimed = true;
      state.locked[me] = true;
      state.passed[me] = true;
      state.log.push({ type: 'claimInitiative', player: me, sound: 'claim' });
      advanceTurn(state);
      return;
    }

    // Everything below is a real action: clears consecutive-pass tracking.
    state.passed = [state.locked[0], state.locked[1]];

    if (action.type === 'playCard') {
      playCard(state, me, action);
    } else if (action.type === 'attack') {
      startAttack(state, me, action);
    } else if (action.type === 'deployLeader') {
      const leaderCard = SB.card(p.leader.cardId);
      expect(!p.leader.deployed && p.resources.length >= leaderCard.deployCost, action);
      p.leader.deployed = true;
      const unit = SB.makeUnit(state, p.leader.cardId, me);
      unit.exhausted = false; // leaders deploy ready
      p.leader.uid = unit.uid;
      state[leaderCard.deployedSide.arena || 'ground'].push(unit);
      state.log.push({ type: 'deployLeader', player: me, cardId: p.leader.cardId, sound: 'deploy' });
      SB.fireTriggers(state, 'onDeploy', unit, { sourceUid: unit.uid });
    } else if (action.type === 'leaderAction') {
      const ab = SB.card(p.leader.cardId).leaderSide.abilities[action.abilityIndex];
      expect(ab && ab.trigger === 'action' && !p.leader.exhausted, action);
      payResources(state, me, ab.cost || 0);
      p.leader.exhausted = true;
      state.log.push({ type: 'leaderAction', player: me, sound: 'ability' });
      SB.queueEffects(state, me, ab.effects, { cardId: p.leader.cardId, condition: ab.condition });
    } else if (action.type === 'unitAction') {
      const u = SB.findUnit(state, action.uid);
      expect(u && u.owner === me && !u.exhausted, action);
      const ab = SB.unitDef(u).abilities[action.abilityIndex];
      expect(ab && ab.trigger === 'action', action);
      payResources(state, me, ab.cost || 0);
      u.exhausted = true;
      state.log.push({ type: 'unitAction', uid: u.uid, sound: 'ability' });
      SB.queueEffects(state, me, ab.effects, { sourceUid: u.uid, cardId: u.cardId, condition: ab.condition });
    } else {
      expect(false, action);
    }
    advanceTurn(state);
  }

  function payResources(state, playerIdx, n) {
    const res = state.players[playerIdx].resources;
    let left = n;
    for (let i = 0; i < res.length && left > 0; i++) {
      if (!res[i].exhausted) { res[i].exhausted = true; left--; }
    }
    SB.assert(left === 0, 'could not pay ' + n + ' resources');
  }

  function playCard(state, me, action) {
    const p = state.players[me];
    const inst = p.hand[action.handIndex];
    expect(inst && inst.cardId === action.cardId, action);
    const card = SB.card(inst.cardId);
    const cost = SB.cardCost(state, me, inst.cardId);
    expect(cost <= SB.readyResources(state, me), action);
    payResources(state, me, cost);
    p.hand.splice(action.handIndex, 1);
    state.log.push({ type: 'playCard', player: me, cardId: inst.cardId, cost: cost, sound: 'play' });

    if (card.type === 'unit') {
      const unit = SB.makeUnit(state, inst.cardId, me);
      unit.uid = inst.uid; // keep instance identity
      state[card.arena].push(unit);
      if (SB.hasKeyword(state, unit, 'shielded')) {
        unit.shields += 1;
        state.log.push({ type: 'shield', uid: unit.uid, sound: 'shield' });
      }
      if (SB.hasKeyword(state, unit, 'ambush')) {
        // Ambush: may ready and attack immediately. Queue the option as a choice.
        state.queue.push({ step: 'effect', controller: me, ctx: { sourceUid: unit.uid, cardId: unit.cardId },
          op: { op: 'ambushAttack', target: null } });
      }
      SB.fireTriggers(state, 'onPlay', unit, { sourceUid: unit.uid });
      // "When you play another unit" observers on other friendly units.
      SB.allUnits(state, me).forEach(function (obs) {
        if (obs.uid === unit.uid) return;
        SB.fireTriggers(state, 'onUnitPlayed', obs, { sourceUid: obs.uid, playedUid: unit.uid, playedCardId: unit.cardId });
      });
    } else if (card.type === 'event') {
      p.discard.push(inst);
      SB.queueEffects(state, me, collectEffects(card), { cardId: inst.cardId });
    } else if (card.type === 'upgrade') {
      const target = SB.findUnit(state, action.attachTo);
      expect(target, action);
      target.upgrades.push(inst);
      state.log.push({ type: 'attached', uid: target.uid, cardId: inst.cardId, sound: 'attach' });
      SB.fireTriggers(state, 'onPlay', target, { sourceUid: target.uid, upgradeCardId: inst.cardId });
    }
  }

  function collectEffects(card) {
    // Events store their effects as a single 'onPlay' ability.
    const ab = (card.abilities || []).find(function (a) { return a.trigger === 'onPlay'; });
    return ab ? ab.effects : [];
  }

  function startAttack(state, me, action) {
    const attacker = SB.findUnit(state, action.attacker);
    expect(attacker && attacker.owner === me && !attacker.exhausted, action);
    attacker.exhausted = true;
    state.log.push({ type: 'attackDeclared', attacker: attacker.uid, target: action.target, sound: 'attack' });
    // Damage step resolves AFTER on-attack triggers: append to queue tail, then
    // fire triggers (which prepend). Restore heals in the damage step.
    state.queue.push({ step: 'combatDamage', attackerUid: attacker.uid, target: action.target, player: me });
    SB.fireTriggers(state, 'onAttack', attacker, { sourceUid: attacker.uid, attackTarget: action.target });
    if (action.target.kind === 'unit') {
      const defender = SB.findUnit(state, action.target.uid);
      if (defender) SB.fireTriggers(state, 'whenAttacked', defender, { sourceUid: defender.uid, attackerUid: attacker.uid });
    }
  }

  // Ambush is modeled as an op so it flows through the normal choice machinery.
  SB.ops.ambushAttack = function () { /* resolved via candidates below */ };

  function resolveCombatDamage(state, item) {
    const attacker = SB.findUnit(state, item.attackerUid);
    if (!attacker) return; // attacker died to a trigger — attack fizzles
    let power = SB.unitPower(state, attacker) + SB.keywordTotal(state, attacker, 'raid');
    const restore = SB.keywordTotal(state, attacker, 'restore');
    if (restore > 0) {
      const b = state.players[attacker.owner].base;
      const healed = Math.min(restore, b.damage);
      b.damage -= healed;
      if (healed > 0) state.log.push({ type: 'baseHeal', player: attacker.owner, amount: healed, sound: 'heal' });
    }
    if (item.target.kind === 'base') {
      SB.damageBase(state, item.target.player, power, 'attack');
      return;
    }
    const defender = SB.findUnit(state, item.target.uid);
    if (!defender) return; // defender gone — no damage either way
    const defPower = SB.unitPower(state, defender);
    const overwhelm = SB.hasKeyword(state, attacker, 'overwhelm');
    const sab = SB.hasKeyword(state, attacker, 'saboteur');
    const defHpLeft = SB.unitRemainingHp(state, defender);
    if (sab && defender.shields > 0) {
      defender.shields = 0;
      state.log.push({ type: 'shieldsSabotaged', uid: defender.uid, sound: 'shield' });
    }
    // Simultaneous: compute both, then apply both.
    SB.damageUnit(state, defender, power, { sourceUid: attacker.uid });
    SB.damageUnit(state, attacker, defPower, { sourceUid: defender.uid });
    if (overwhelm && defender.shields === 0 && power > defHpLeft) {
      SB.damageBase(state, defender.owner, power - defHpLeft, 'overwhelm');
    }
  }

  // ---- queue driver -------------------------------------------------------

  function processQueue(state) {
    while (state.queue.length > 0 && state.winner == null) {
      const item = state.queue[0];
      if (item.step === 'effect' && item.op && item.op.op === 'ambushAttack') {
        // Offer ready-and-attack targets, or decline.
        const unit = SB.findUnit(state, item.ctx.sourceUid);
        if (!unit) { state.queue.shift(); continue; }
        if (!item.candidates) {
          const cands = ambushTargets(state, unit);
          if (cands.length === 0) { state.queue.shift(); continue; }
          item.candidates = cands;
          item.op.target = { optional: true }; // enables decline via index -1
          item.onChoose = 'ambush';
        }
        return;
      }
      if (item.step === 'combatDamage') {
        state.queue.shift();
        resolveCombatDamage(state, item);
        // "After this unit attacks" triggers, if the attacker survived.
        const atk = SB.findUnit(state, item.attackerUid);
        if (atk) SB.fireTriggers(state, 'onAttackEnds', atk, { sourceUid: atk.uid, attackTarget: item.target });
        continue;
      }
      if (item.step === 'effect') {
        SB.drainQueue(state);
        if (state.queue.length > 0 && state.queue[0].candidates) return;
        if (state.queue.length > 0 && state.queue[0].step !== 'effect') continue;
        if (state.queue.length > 0) return; // drain stopped on a choice
        continue;
      }
      if (SB.queueSteps && SB.queueSteps[item.step]) {
        // Auto-skip a step with no available actions (e.g. discard with empty hand).
        const stepActs = SB.queueSteps[item.step].actions(state, item);
        if (!stepActs || stepActs.length === 0) { state.queue.shift(); continue; }
        return;
      }
      // mulligan / setupResources / regroupResource wait for player actions.
      return;
    }
  }

  function ambushTargets(state, unit) {
    const me = unit.owner;
    const arena = SB.arenaOf(state, unit);
    const enemies = state[arena].filter(function (e) { return e.owner !== me; });
    const sentinels = enemies.filter(function (e) { return SB.hasKeyword(state, e, 'sentinel'); });
    const sab = SB.hasKeyword(state, unit, 'saboteur');
    const pool = (sentinels.length > 0 && !sab) ? sentinels : enemies;
    // Ambush attacks target units only (not bases).
    return pool.map(function (e) { return { kind: 'unit', uid: e.uid }; });
  }

  // Chosen ambush target: the unit readies, then immediately attacks (exhausting).
  SB.ops.ambushAttack = function (state, item, target) {
    const unit = SB.findUnit(state, item.ctx.sourceUid);
    if (!unit || !target) return;
    state.log.push({ type: 'ambush', uid: unit.uid, sound: 'attack' });
    unit.exhausted = true;
    state.queue.unshift({ step: 'combatDamage', attackerUid: unit.uid, target: target, player: unit.owner });
    SB.fireTriggers(state, 'onAttack', unit, { sourceUid: unit.uid, attackTarget: target });
  };

  // ---- turn / phase flow --------------------------------------------------

  function startActionPhase(state) {
    state.phase = 'action';
    state.passed = [false, false];
    state.locked = [false, false];
    state.initiativeClaimed = false;
    state.active = state.initiative;
    state.log.push({ type: 'actionPhase', round: state.round });
  }

  function advanceTurn(state) {
    if (state.winner != null) return;
    // Queue pending? The controller of the head choice acts next; turn order
    // resumes after the queue drains. We simply leave `active` as-is; legalActions
    // routes to the queue anyway.
    if (state.passed[0] && state.passed[1]) {
      startRegroup(state);
      return;
    }
    const next = SB.other(state.active);
    if (state.passed[next] && !state.passed[state.active]) {
      // Opponent is done (claimed/locked); current player keeps acting.
      return;
    }
    state.active = next;
  }

  function startRegroup(state) {
    state.phase = 'regroup';
    state.log.push({ type: 'regroup', round: state.round });
    SB.drawCards(state, 0, 2);
    SB.drawCards(state, 1, 2);
    if (state.winner != null) return;
    // Resource step: initiative holder picks first (digital sequencing of a
    // simultaneous step).
    state.players[0].resourcedThisRound = false;
    state.players[1].resourcedThisRound = false;
    state.queue.push({ step: 'regroupResource', player: state.initiative });
    state.queue.push({ step: 'regroupResource', player: SB.other(state.initiative) });
    state.queue.push({ step: 'endRegroup' });
    // endRegroup is handled here rather than processQueue for locality:
  }

  // Extend processQueue handling for endRegroup via a wrapper check inside apply:
  const origApply = SB.apply;
  SB.apply = function (prev, action) {
    const state = origApply(prev, action);
    while (state.queue.length > 0 && state.queue[0].step === 'endRegroup' && state.winner == null) {
      state.queue.shift();
      finishRegroup(state);
    }
    return state;
  };

  function finishRegroup(state) {
    // Ready everything, clear temp buffs, next round.
    SB.allUnits(state).forEach(function (u) {
      u.exhausted = false;
      u.temp = { power: 0, hp: 0 };
      delete u.tempKeywords;
    });
    state.players.forEach(function (p) {
      p.resources.forEach(function (r) { r.exhausted = false; });
      p.leader.exhausted = false;
    });
    state.round += 1;
    startActionPhase(state);
  }
})(window.SB = window.SB || {});
