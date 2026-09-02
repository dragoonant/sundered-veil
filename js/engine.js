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
      // "Name a card" blocks (js/ops2.js): the opponent cannot play the named card.
      if (SB.nameBlocked && SB.nameBlocked(state, me, inst.cardId)) return;
      let cost = SB.cardCost(state, me, inst.cardId);
      const exKw = (card.keywords || []).find(function (k) { return k.k === 'exploit'; });
      if (exKw) {
        const maxK = Math.min(exKw.n, SB.allUnits(state, me).length);
        cost = Math.max(0, cost - 2 * maxK); // affordable via max exploit
      }
      if (cost > SB.readyResources(state, me)) return;
      if (card.type === 'unit') {
        if (card.unique && SB.allUnits(state, me).some(function (u) { return u.cardId === inst.cardId; })) return;
        const baseCost = SB.cardCost(state, me, inst.cardId);
        if (baseCost <= SB.readyResources(state, me)) {
          acts.push({ type: 'playCard', player: me, handIndex: i, cardId: inst.cardId });
        }
        // Piloting: a unit with the piloting keyword may instead be played as an
        // upgrade on a friendly Vehicle without a Pilot, for its piloting cost.
        const pilotKw = (card.keywords || []).find(function (k) { return k.k === 'piloting'; });
        if (pilotKw) {
          const pCost = SB.smuggleCost(state, me, card, pilotKw); // same cost+aspects shape
          if (pCost <= SB.readyResources(state, me)) {
            SB.allUnits(state, me).forEach(function (u) {
              if (SB.unitTraits(state, u).indexOf('tr46') < 0) return;
              if (SB.hasPilot(state, u)) return;
              acts.push({ type: 'playCard', player: me, handIndex: i, cardId: inst.cardId, asPilot: true, attachTo: u.uid });
            });
          }
        }
        // Exploit: also offer paying by defeating 1..N friendly units (2 less each).
        const ex = (card.keywords || []).find(function (k) { return k.k === 'exploit'; });
        if (ex) {
          const maxK = Math.min(ex.n, SB.allUnits(state, me).length);
          for (let k2 = 1; k2 <= maxK; k2++) {
            if (Math.max(0, baseCost - 2 * k2) <= SB.readyResources(state, me)) {
              acts.push({ type: 'playCard', player: me, handIndex: i, cardId: inst.cardId, exploit: k2 });
            }
          }
        }
      } else if (card.type === 'event') {
        acts.push({ type: 'playCard', player: me, handIndex: i, cardId: inst.cardId });
      } else if (card.type === 'upgrade') {
        // One action per legal attach target so the choice is explicit up front.
        SB.allUnits(state).forEach(function (u) {
          if (card.attachTo === 'friendly' && u.owner !== me) return;
          if (card.attachTo === 'enemy' && u.owner === me) return;
          if (card.attachArena && SB.arenaOf(state, u) !== card.attachArena) return;
          if (card.attachFilter) {
            const f = card.attachFilter;
            const traits = (SB.unitDef(u).traits || []).concat(SB.card(u.cardId).traits || []);
            if (f.notTrait && traits.indexOf(f.notTrait) >= 0) return;
            if (f.trait && traits.indexOf(f.trait) < 0) return;
          }
          if (card.costModAttach && attachDiscountApplies(card.costModAttach, u)) {
            const c2 = Math.max(0, SB.cardCost(state, me, inst.cardId) + card.costModAttach.delta);
            if (c2 > SB.readyResources(state, me)) return;
          }
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
      if ((SB.unitDef(u).staticFlags || []).indexOf('attackOnlyDamaged') >= 0 && u.damage === 0) return;
      SB.attackTargets(state, u).forEach(function (t) {
        acts.push({ type: 'attack', player: me, attacker: u.uid, target: t });
      });
    });

    // Leader: deploy epic action / leader-side action abilities.
    const leaderCard = SB.card(p.leader.cardId);
    if (!p.leader.deployed) {
      // A leader defeated as a unit stays leader-side up for the rest of the game:
      // its leader-side abilities still work, but it can never deploy again.
      if (!p.leader.defeated && p.resources.length >= leaderCard.deployCost) {
        acts.push({ type: 'deployLeader', player: me });
        if (leaderCard.pilotSide) {
          SB.allUnits(state, me).forEach(function (u) {
            if (SB.unitTraits(state, u).indexOf('tr46') < 0) return; // Vehicle only
            if (SB.hasPilot(state, u)) return;
            acts.push({ type: 'deployLeaderPilot', player: me, attachTo: u.uid });
          });
        }
      }
      (leaderCard.leaderSide.abilities || []).forEach(function (ab, ai) {
        if (ab.trigger !== 'action') return;
        if (p.leader.exhausted) return; // leader actions cost exhausting the leader
        if (ab.gate && !SB.checkCondition(state, me, ab.gate, {})) return;
        if (ab.forceCost && !p.force) return;
        const rCost = ab.cost || 0;
        if (rCost > SB.readyResources(state, me)) return;
        acts.push({ type: 'leaderAction', player: me, abilityIndex: ai });
      });
    }

    // Unit activated abilities (trigger:'action', cost = exhaust self + resources).
    // The list includes abilities granted by upgrades and auras (SB.unitAllAbilities),
    // indexed the same way apply() reads them.
    SB.allUnits(state, me).forEach(function (u) {
      unitAbilities(state, u).forEach(function (ab, ai) {
        if (ab.trigger !== 'action') return;
        if (u.exhausted && !ab.noExhaust) return;
        if (ab.oncePerRound && u.usedActionRound === state.round) return;
        if ((ab.cost || 0) > SB.readyResources(state, me)) return;
        if (ab.gate && !SB.checkCondition(state, me, ab.gate, { sourceUid: u.uid })) return;
        acts.push({ type: 'unitAction', player: me, uid: u.uid, abilityIndex: ai });
      });
    });

    // A card in the discard pile with a discard action (shd-135 style) may be played
    // from there during the phase it was discarded.
    p.discard.forEach(function (inst, i) {
      const c = SB.card(inst.cardId);
      if (!c.discardAction) return;
      if ((p.discardedThisPhase || []).indexOf(inst.uid) < 0) return;
      if (c.type !== 'unit' && c.type !== 'event') return;
      if (SB.cardCost(state, me, inst.cardId) > SB.readyResources(state, me)) return;
      if (c.type === 'unit' && c.unique && SB.allUnits(state, me).some(function (u) { return u.cardId === inst.cardId; })) return;
      acts.push({ type: 'playDiscardAction', player: me, index: i, cardId: inst.cardId });
    });

    // Smuggle: a face-down resource with the smuggle keyword may be played for its
    // smuggle cost (own aspect icons); it is replaced by the top card of the deck.
    p.resources.forEach(function (r, ri) {
      const card = SB.cards[r.instance.cardId];
      if (!card) return;
      const sm = (card.keywords || []).find(function (k) { return k.k === 'smuggle'; }) || grantedSmuggle(state, me, card);
      if (!sm) return;
      const cost = SB.smuggleCost(state, me, card, sm);
      if (cost > SB.readyResources(state, me)) return;
      if (card.type === 'unit' && card.unique &&
          SB.allUnits(state, me).some(function (u) { return u.cardId === card.id; })) return;
      if (p.deck.length === 0) return; // nothing to replace it with
      acts.push({ type: 'smuggle', player: me, resourceIndex: ri, cardId: card.id });
    });

    // Base epic action (once per game).
    const baseCard = SB.card(p.base.cardId);
    if (baseCard.epicAbility && !p.baseEpicUsed) {
      acts.push({ type: 'baseEpic', player: me });
    }

    if (!state.initiativeClaimed) acts.push({ type: 'claimInitiative', player: me });
    acts.push({ type: 'pass', player: me });
    return acts;
  };

  function hasTrigger(unit, trigger) {
    return (SB.unitDef(unit).abilities || []).some(function (a) { return a.trigger === trigger; });
  }
  function unitHasKeyword(state, u, k) { return SB.hasKeyword(state, u, k); }
  function unitAbilities(state, u) {
    return SB.unitAllAbilities ? SB.unitAllAbilities(state, u) : (SB.unitDef(u).abilities || []);
  }
  // A unit with the grantSmuggle static (shd-248 style) lets every friendly resource
  // smuggle for its printed cost plus 2 and its own aspect icons (units and events).
  function grantedSmuggle(state, me, card) {
    if (card.type !== 'unit' && card.type !== 'event') return null;
    if (!SB.allUnits(state, me).some(function (u) { return (SB.unitDef(u).staticFlags || []).indexOf('grantSmuggle') >= 0; })) return null;
    return { k: 'smuggle', cost: (card.cost || 0) + 2, aspects: card.aspects || [] };
  }
  // costModAttach: {cards:[ids]} names specific bearers; {uniqueOnly:true} any champion.
  function attachDiscountApplies(m, u) {
    if ((m.cards || []).indexOf(u.cardId) >= 0) return true;
    return !!m.uniqueOnly && !!SB.card(u.cardId).unique;
  }
  function noteAttack(state, attacker) {
    state.attackedThisPhase = state.attackedThisPhase || [];
    state.attackedThisPhase.push({ uid: attacker.uid, cardId: attacker.cardId, owner: attacker.owner, traits: SB.unitTraits(state, attacker) });
  }

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
        const hs = 6 + (SB.card(p.base.cardId).startingHandDelta || 0);
        p.hand = reshuffled.slice(0, hs);
        p.deck = reshuffled.slice(hs);
        SB.log(state, { type: 'mulligan', player: item.player });
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
      SB.log(state, { type: 'resourced', player: item.player });
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
      SB.log(state, { type: 'fizzle', why: 'declined', cardId: item.ctx && item.ctx.cardId, fizzled: true });
      SB.execElse(state, item);
      return;
    }
    const target = item.candidates[action.index];
    expect(target, action);
    delete item.candidates;
    SB.execOp(state, item, target);
  }

  function applyPhaseAction(state, action) {
    expect(state.phase === 'action' && action.player === state.active, action);
    const me = state.active;
    const p = state.players[me];

    if (action.type === 'pass') {
      state.passed[me] = true;
      SB.log(state, { type: 'pass', player: me });
      advanceTurn(state);
      return;
    }
    if (action.type === 'claimInitiative') {
      expect(!state.initiativeClaimed, action);
      state.initiative = me;
      state.initiativeClaimed = true;
      state.locked[me] = true;
      state.passed[me] = true;
      SB.log(state, { type: 'claimInitiative', player: me, sound: 'claim' });
      // "When you take the initiative" observers (leader side and units).
      fireLeaderTrigger(state, me, 'onTakeInitiative', {});
      SB.allUnits(state, me).forEach(function (u) { SB.fireTriggers(state, 'onTakeInitiative', u, { sourceUid: u.uid }); });
      advanceTurn(state);
      return;
    }

    // Everything below is a real action: clears consecutive-pass tracking.
    state.passed = [state.locked[0], state.locked[1]];

    if (action.type === 'playCard') {
      playCard(state, me, action);
    } else if (action.type === 'attack') {
      startAttack(state, me, action);
    } else if (action.type === 'baseEpic') {
      const bc = SB.card(p.base.cardId);
      expect(bc.epicAbility && !p.baseEpicUsed, action);
      p.baseEpicUsed = true;
      SB.log(state, { type: 'baseEpic', player: me, sound: 'ability' });
      SB.queueEffects(state, me, bc.epicAbility.effects, { cardId: p.base.cardId });
    } else if (action.type === 'playDiscardAction') {
      const inst = p.discard[action.index];
      expect(inst && inst.cardId === action.cardId && SB.card(inst.cardId).discardAction, action);
      playCard(state, me, { fromDiscard: action.index, cardId: action.cardId });
    } else if (action.type === 'smuggle') {
      const r = p.resources[action.resourceIndex];
      expect(r && r.instance.cardId === action.cardId, action);
      const card = SB.card(action.cardId);
      const sm = (card.keywords || []).find(function (k) { return k.k === 'smuggle'; }) || grantedSmuggle(state, me, card);
      const cost = SB.smuggleCost(state, me, card, sm);
      expect(cost <= SB.readyResources(state, me) && p.deck.length > 0, action);
      payResources(state, me, cost);
      const wasExhausted = r.exhausted;
      const inst = r.instance;
      // Replace the departing resource with the top card of the deck, same state.
      p.resources[action.resourceIndex] = { instance: p.deck.shift(), exhausted: wasExhausted };
      p.playedThisPhase = p.playedThisPhase || [];
      p.playedThisPhase.push(inst.cardId);
      SB.log(state, { type: 'smuggled', player: me, cardId: inst.cardId, sound: 'play' });
      if (card.type === 'unit') {
        const unit = SB.makeUnit(state, inst.cardId, me);
        unit.uid = inst.uid;
        state[card.arena].push(unit);
        if (SB.hasKeyword(state, unit, 'shielded')) { unit.shields += 1; SB.log(state, { type: 'shield', uid: unit.uid, sound: 'shield' }); }
        SB.fireTriggers(state, 'onSmuggle', unit, { sourceUid: unit.uid });
        if (SB.hasKeyword(state, unit, 'ambush')) {
          state.queue.push({ step: 'effect', controller: me, ctx: { sourceUid: unit.uid, cardId: unit.cardId },
            op: { op: 'ambushAttack', target: null } });
        }
        SB.fireTriggers(state, 'onPlay', unit, { sourceUid: unit.uid });
      } else if (card.type === 'event') {
        p.discard.push(inst);
        p.eventsThisRound = (p.eventsThisRound || 0) + 1;
        const ab = (card.abilities || []).find(function (a) { return a.trigger === 'onPlay'; });
        if (ab) SB.queueEffects(state, me, ab.effects, { cardId: inst.cardId, eventUid: inst.uid });
      }
    } else if (action.type === 'deployLeaderPilot') {
      const lc = SB.card(p.leader.cardId);
      expect(!p.leader.deployed && !p.leader.defeated &&
        p.resources.length >= lc.deployCost && lc.pilotSide, action);
      const bearer = SB.findUnit(state, action.attachTo);
      expect(bearer && bearer.owner === me && !SB.hasPilot(state, bearer), action);
      p.leader.deployed = 'pilot';
      const inst = { uid: state.nextUid++, cardId: p.leader.cardId, leaderPilot: true };
      p.leader.uid = inst.uid;
      bearer.upgrades.push(inst);
      SB.log(state, { type: 'deployLeaderPilot', player: me, cardId: p.leader.cardId, uid: bearer.uid, sound: 'deploy' });
      state.queue.push({ step: 'plotOffer', player: me });
      (lc.pilotSide.abilities || []).forEach(function (ab) {
        if (ab.trigger !== 'onDeployPilot') return;
        SB.queueEffects(state, me, ab.effects, { sourceUid: bearer.uid, cardId: p.leader.cardId, condition: ab.condition });
      });
    } else if (action.type === 'deployLeader') {
      const leaderCard = SB.card(p.leader.cardId);
      expect(!p.leader.deployed && !p.leader.defeated &&
        p.resources.length >= leaderCard.deployCost, action);
      p.leader.deployed = true;
      const unit = SB.makeUnit(state, p.leader.cardId, me);
      unit.exhausted = false; // leaders deploy ready
      p.leader.uid = unit.uid;
      state[leaderCard.deployedSide.arena || 'ground'].push(unit);
      SB.log(state, { type: 'deployLeader', player: me, cardId: p.leader.cardId, sound: 'deploy' });
      SB.fireTriggers(state, 'onDeploy', unit, { sourceUid: unit.uid });
      state.queue.push({ step: 'plotOffer', player: me });
    } else if (action.type === 'leaderAction') {
      const ab = SB.card(p.leader.cardId).leaderSide.abilities[action.abilityIndex];
      expect(ab && ab.trigger === 'action' && !p.leader.exhausted, action);
      expect(!ab.gate || SB.checkCondition(state, me, ab.gate, {}), action);
      expect(!ab.forceCost || p.force, action);
      if (ab.forceCost) { p.force = false; SB.log(state, { type: 'forceUsed', player: me, sound: 'ability' }); }
      payResources(state, me, ab.cost || 0);
      p.leader.exhausted = true;
      SB.log(state, { type: 'leaderAction', player: me, sound: 'ability' });
      SB.queueEffects(state, me, ab.effects, { cardId: p.leader.cardId, condition: ab.condition });
    } else if (action.type === 'unitAction') {
      const u = SB.findUnit(state, action.uid);
      expect(u && u.owner === me, action);
      const ab = unitAbilities(state, u)[action.abilityIndex];
      expect(ab && ab.trigger === 'action' && (!u.exhausted || ab.noExhaust), action);
      expect(!(ab.oncePerRound && u.usedActionRound === state.round), action);
      payResources(state, me, ab.cost || 0);
      if (ab.oncePerRound) u.usedActionRound = state.round;
      if (!ab.noExhaust) u.exhausted = true;
      SB.log(state, { type: 'unitAction', uid: u.uid, sound: 'ability' });
      SB.queueEffects(state, me, ab.effects, { sourceUid: u.uid, cardId: u.cardId, condition: ab.condition });
    } else {
      expect(false, action);
    }
    advanceTurn(state);
  }

  function payResources(state, playerIdx, n) {
    const p = state.players[playerIdx];
    const res = p.resources;
    let left = n;
    for (let i = 0; i < res.length && left > 0; i++) {
      if (!res[i].exhausted) { res[i].exhausted = true; left--; }
    }
    state.lastPaymentUsedCredit = false;
    while (left > 0 && (p.credits || 0) > 0) {
      p.credits -= 1;
      left -= 1;
      state.lastPaymentUsedCredit = true;
      SB.log(state, { type: 'creditSpent', player: playerIdx });
    }
    SB.assert(left === 0, 'could not pay ' + n + ' resources');
  }

  function playCard(state, me, action, mods) {
    mods = mods || {};
    const p = state.players[me];
    // fromInst: the caller already lifted the instance out of its pile (a resource
    // or the opponent's discard pile, see js/ops2.js playHandPick).
    const inst = action.fromInst ? action.fromInst
      : action.fromDeckTop ? p.deck[0]
      : action.fromDeckIndex != null ? p.deck[action.fromDeckIndex]
      : action.fromDiscard != null ? p.discard[action.fromDiscard]
      : p.hand[action.handIndex];
    expect(inst && inst.cardId === action.cardId, action);
    const card = SB.card(inst.cardId);
    let cost = Math.max(0, SB.cardCost(state, me, inst.cardId) - (mods.discount || 0));
    if (action.asPilot) {
      const pk = (card.keywords || []).find(function (k) { return k.k === 'piloting'; });
      cost = SB.smuggleCost(state, me, card, pk);
    }
    if (action.exploit) cost = Math.max(0, cost - 2 * action.exploit);
    if (action.attachTo && card.costModAttach) {
      const tgt = SB.findUnit(state, action.attachTo);
      if (tgt && attachDiscountApplies(card.costModAttach, tgt)) {
        cost = Math.max(0, cost + card.costModAttach.delta);
      }
    }
    // Temporary "next N matching cards cost X less" grants.
    if (p.discounts) {
      for (const d of p.discounts) {
        if (d.remaining <= 0) continue;
        if (d.filter.trait && (card.traits || []).indexOf(d.filter.trait) < 0) continue;
        if (d.filter.type && card.type !== d.filter.type) continue;
        cost = Math.max(0, cost - d.amount);
        d.remaining -= 1;
        break;
      }
    }
    expect(cost <= SB.readyResources(state, me), action);
    payResources(state, me, cost);
    if (SB.consumeStaticDiscounts) SB.consumeStaticDiscounts(state, me, inst.cardId);
    if (action.fromInst) { /* already lifted out of its pile */ }
    else if (action.fromDeckTop) p.deck.shift();
    else if (action.fromDeckIndex != null) p.deck.splice(action.fromDeckIndex, 1);
    else if (action.fromDiscard != null) p.discard.splice(action.fromDiscard, 1);
    else p.hand.splice(action.handIndex, 1);
    p.playedThisPhase = p.playedThisPhase || [];
    p.playedThisPhase.push(inst.cardId);
    SB.log(state, { type: 'playCard', player: me, cardId: inst.cardId, cost: cost, sound: 'play' });
    // "When an opponent plays a card" observers on the other side's units.
    SB.allUnits(state, SB.other(me)).forEach(function (obs) {
      SB.fireTriggers(state, 'onOpponentPlaysCard', obs, { sourceUid: obs.uid, playedCardId: inst.cardId, playedCardCost: card.cost || 0 });
    });

    if (action.asPilot) {
      const bearer = SB.findUnit(state, action.attachTo);
      expect(bearer, action);
      inst.owner = me; // a card always goes back to ITS owner, not the bearer's
      bearer.upgrades.push(inst);
      SB.log(state, { type: 'attached', uid: bearer.uid, cardId: inst.cardId, sound: 'attach' });
      (card.abilities || []).forEach(function (ab) {
        if (ab.trigger !== 'onPlayAsPilot') return;
        SB.queueEffects(state, me, ab.effects, { sourceUid: bearer.uid, cardId: inst.cardId, condition: ab.condition });
      });
    } else if (card.type === 'unit') {
      const unit = SB.makeUnit(state, inst.cardId, me);
      unit.uid = inst.uid; // keep instance identity
      if (SB.card(inst.cardId).staticFlags &&
          SB.card(inst.cardId).staticFlags.indexOf('defeatAtRegroup') >= 0) unit.defeatAtRegroup = true;
      if (mods.entersReady) unit.exhausted = false;
      if (card.entersReadyIf && SB.checkCondition(state, me, card.entersReadyIf, { sourceUid: unit.uid })) unit.exhausted = false;
      if (mods.defeatAtRegroup) unit.defeatAtRegroup = true;
      if (mods.returnAtRegroup) unit.commandeered = { originalOwner: me };
      // "The next unit you play this phase (matching) enters play ready" grants.
      if (p.entersReadyGrants && p.entersReadyGrants.length) {
        const gi = p.entersReadyGrants.findIndex(function (g) {
          const f = g.filter || {};
          if (f.maxPower != null && (card.power || 0) > f.maxPower) return false;
          if (f.trait && (card.traits || []).indexOf(f.trait) < 0) return false;
          return true;
        });
        if (gi >= 0) { p.entersReadyGrants.splice(gi, 1); unit.exhausted = false; }
      }
      state[card.arena].push(unit);
      if (SB.hasKeyword(state, unit, 'shielded')) {
        unit.shields += 1;
        SB.log(state, { type: 'shield', uid: unit.uid, sound: 'shield' });
      }
      if (SB.hasKeyword(state, unit, 'ambush')) {
        // Ambush: may ready and attack immediately. Queue the option as a choice.
        state.queue.push({ step: 'effect', controller: me, ctx: { sourceUid: unit.uid, cardId: unit.cardId },
          op: { op: 'ambushAttack', target: null } });
      }
      SB.fireTriggers(state, 'onPlay', unit, { sourceUid: unit.uid, paidCost: cost });
      if (p.echoNextOnPlay && (SB.card(inst.cardId).abilities || []).some(function (ab) { return ab.trigger === 'onPlay'; })) {
        delete p.echoNextOnPlay;
        SB.fireTriggers(state, 'onPlay', unit, { sourceUid: unit.uid });
        SB.log(state, { type: 'echoedOnPlay', uid: unit.uid, notice: true });
      }
      if (action.exploit) {
        for (let k3 = 0; k3 < action.exploit; k3++) {
          state.queue.unshift({ step: 'exploitPick', player: me, forUid: unit.uid });
        }
      }
      // "When you play another unit" observers on other friendly units, and on the
      // undeployed leader.
      SB.allUnits(state, me).forEach(function (obs) {
        if (obs.uid === unit.uid) return;
        SB.fireTriggers(state, 'onUnitPlayed', obs, { sourceUid: obs.uid, playedUid: unit.uid, playedCardId: unit.cardId });
      });
      fireLeaderTrigger(state, me, 'onUnitPlayed', { playedUid: unit.uid, playedCardId: unit.cardId });
    } else if (card.type === 'event') {
      p.discard.push(inst);
      p.eventsThisRound = (p.eventsThisRound || 0) + 1;
      // Static negation aura: an enemy unit may cancel the first event you play
      // each round (see staticFlags in card data; behavior of sor-089).
      const negated = p.eventsThisRound === 1 &&
        SB.allUnits(state, SB.other(me)).some(function (u) {
          return (SB.unitDef(u).staticFlags || []).indexOf('negateFirstEvent') >= 0;
        });
      if (negated) {
        SB.log(state, { type: 'fizzle', why: 'negated', cardId: inst.cardId, fizzled: true, notice: true });
      } else {
        SB.queueEffects(state, me, collectEffects(card), { cardId: inst.cardId, eventUid: inst.uid });
      }
    } else if (card.type === 'upgrade') {
      const target = SB.findUnit(state, action.attachTo);
      expect(target, action);
      inst.owner = me; // upgrades on enemy units still return to their own owner
      target.upgrades.push(inst);
      SB.log(state, { type: 'attached', uid: target.uid, cardId: inst.cardId, sound: 'attach' });
      // Upgrade abilities that trigger when the upgrade itself is played resolve
      // in the context of the bearer.
      (card.abilities || []).forEach(function (ab) {
        if (ab.trigger !== 'onPlay') return;
        SB.queueEffects(state, me, ab.effects, { sourceUid: target.uid, cardId: inst.cardId, condition: ab.condition });
      });
      SB.fireTriggers(state, 'onPlay', target, { sourceUid: target.uid, upgradeCardId: inst.cardId });
      SB.allUnits(state, me).forEach(function (obs) {
        SB.fireTriggers(state, 'onUpgradePlayed', obs, { sourceUid: obs.uid, upgradeCardId: inst.cardId });
      });
      fireLeaderTrigger(state, me, 'onUpgradePlayed', { upgradeCardId: inst.cardId });
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
    SB.performAttack(state, attacker, action.target, {});
  }

  // Ambush is modeled as an op so it flows through the normal choice machinery.
  SB.ops.ambushAttack = function () { /* resolved via candidates below */ };

  // Combat-only bonuses: abilities with trigger 'combatConstant' on the attacker.
  // grant = {power?, powerPerSelfDamage?, keywords?:[{k}]} — condition kinds:
  // 'defenderDamaged'. Keep SB.cardText's combat describers in step with this.
  function combatMods(state, attacker, defender) {
    const mods = { power: 0, overwhelm: false, firstStrike: false, defenderFirst: false };
    // combatAura: another unit's grant applying to attackers matching its scope
    // (only while attacking an enemy unit).
    if (defender) {
      SB.allUnits(state).forEach(function (src) {
        (SB.unitDef(src).abilities || []).forEach(function (ab) {
          if (ab.trigger !== 'combatAura') return;
          const cands = SB.selectorCandidates(state, src.owner, ab.scope || {}, { sourceUid: src.uid });
          if (!cands.some(function (c) { return c.kind === 'unit' && c.uid === attacker.uid; })) return;
          const g2 = ab.grant || {};
          mods.power += g2.power || 0;
          (g2.keywords || []).forEach(function (kw) { if (kw.k === 'overwhelm') mods.overwhelm = true; });
        });
      });
    }
    (SB.unitDef(attacker).abilities || []).forEach(function (ab) {
      if (ab.trigger !== 'combatConstant') return;
      if (ab.condition) {
        const ci = ab.condition.if;
        if (ci === 'defenderDamaged') { if (!defender || defender.damage === 0) return; }
        else if (ci === 'defenderExhaustedOld') { if (!defender || !defender.exhausted || defender.enteredRound === state.round) return; }
        else if (!SB.checkCondition(state, attacker.owner, ab.condition, { sourceUid: attacker.uid })) return;
      }
      const g = ab.grant || {};
      mods.power += g.power || 0;
      if (g.powerPerSelfDamage) mods.power += g.powerPerSelfDamage * attacker.damage;
      if (g.firstStrike) mods.firstStrike = true;
      if (g.defenderFirst) mods.defenderFirst = true;
      (g.keywords || []).forEach(function (kw) { if (kw.k === 'overwhelm') mods.overwhelm = true; });
    });
    return mods;
  }

  function resolveCombatDamage(state, item) {
    const attacker = SB.findUnit(state, item.attackerUid);
    if (!attacker) return; // attacker died to a trigger — attack fizzles
    let power = SB.unitPower(state, attacker) + SB.keywordTotal(state, attacker, 'raid');
    if (item.bonusPower && !(item.bonusVsUnitsOnly && item.target.kind === 'base')) power += item.bonusPower;
    const restore = SB.keywordTotal(state, attacker, 'restore');
    if (restore > 0) {
      const b = state.players[attacker.owner].base;
      const healed = Math.min(restore, b.damage);
      b.damage -= healed;
      if (healed > 0) SB.log(state, { type: 'baseHeal', player: attacker.owner, amount: healed, sound: 'heal' });
    }
    if (item.target.kind === 'base') {
      (state.tempCombatMods || []).forEach(function (m) {
        if (m.vsBase && attacker.owner !== m.enemyOf) return; // penalty applies to enemies of m.enemyOf
      });
      let basePower = power;
      (state.tempCombatMods || []).forEach(function (m) {
        if (m.vsBase && attacker.owner === SB.other(m.enemyOf)) basePower = Math.max(0, basePower + m.power);
      });
      SB.damageBase(state, item.target.player, basePower, 'attack');
      if (basePower > 0) {
        state.baseDamagersThisPhase = state.baseDamagersThisPhase || [];
        state.baseDamagersThisPhase.push(attacker.uid);
        // "When your base is dealt combat damage" observers on the defending side.
        const victim = item.target.player;
        SB.allUnits(state, victim).forEach(function (obs) { SB.fireTriggers(state, 'onOwnBaseCombatDamaged', obs, { sourceUid: obs.uid }); });
        fireLeaderTrigger(state, victim, 'onOwnBaseCombatDamaged', {});
      }
      return;
    }
    const defender = SB.findUnit(state, item.target.uid);
    if (!defender) return; // defender gone — no damage either way
    const mods = combatMods(state, attacker, defender);
    power += mods.power;
    // Defender-side aura: "while this unit is defending, the attacker gets X" and
    // "this unit gets +X while defending".
    let defBonus = 0;
    (SB.unitDef(defender).abilities || []).forEach(function (ab) {
      if (ab.trigger !== 'defenderAura') return;
      power = Math.max(0, power + ((ab.grant || {}).attackerPower || 0));
      defBonus += (ab.grant || {}).defenderPower || 0;
    });
    const defPower = Math.max(0, SB.unitPower(state, defender) + (item.defenderPowerDelta || 0) + defBonus);
    const overwhelm = SB.hasKeyword(state, attacker, 'overwhelm') || mods.overwhelm;
    const sab = SB.hasKeyword(state, attacker, 'saboteur');
    const defHpLeft = SB.unitRemainingHp(state, defender);
    const defShielded = defender.shields > 0;
    if (sab && defShielded) {
      defender.shields = 0;
      SB.log(state, { type: 'shieldsSabotaged', uid: defender.uid, sound: 'shield' });
    }
    const alwaysFirst = (SB.unitDef(attacker).staticFlags || []).indexOf('firstStrike') >= 0 || mods.firstStrike;
    const defenderFirst = mods.defenderFirst || !!attacker.defenderFirstNext;
    delete attacker.defenderFirstNext;
    if (defenderFirst) {
      // The attacker lets the defender strike first (law-086 style).
      SB.damageUnit(state, attacker, defPower, { sourceUid: defender.uid });
      if (SB.findUnit(state, attacker.uid)) SB.damageUnit(state, defender, power, { sourceUid: attacker.uid });
    } else if (item.firstStrike || alwaysFirst) {
      // Attacker deals combat damage first; defender only retaliates if it lives.
      SB.damageUnit(state, defender, power, { sourceUid: attacker.uid });
      if (SB.findUnit(state, defender.uid)) {
        SB.damageUnit(state, attacker, defPower, { sourceUid: defender.uid });
      }
    } else {
      // Simultaneous: compute both, then apply both.
      SB.damageUnit(state, defender, power, { sourceUid: attacker.uid });
      SB.damageUnit(state, attacker, defPower, { sourceUid: defender.uid });
    }
    const defeated = !SB.findUnit(state, defender.uid);
    if (overwhelm && !defShielded && power > defHpLeft) {
      SB.damageBase(state, defender.owner, power - defHpLeft, 'overwhelm');
      state.baseDamagersThisPhase = state.baseDamagersThisPhase || [];
      state.baseDamagersThisPhase.push(attacker.uid);
    }
    if (defeated) {
      const atkAlive = SB.findUnit(state, attacker.uid);
      if (atkAlive) {
        SB.fireTriggers(state, 'onDefeatUnit', atkAlive, {
          sourceUid: atkAlive.uid, excess: Math.max(0, power - defHpLeft),
        });
      }
    }
  }

  // Shared attack entry for effect-driven attacks (Shoot First / Surprise Strike
  // style). mods: {bonusPower, firstStrike, ready}.
  SB.performAttack = function (state, attacker, target, mods) {
    mods = mods || {};
    if (mods.ready) attacker.exhausted = false;
    attacker.exhausted = true;
    SB.log(state, { type: 'attackDeclared', attacker: attacker.uid, target: target, sound: 'attack' });
    noteAttack(state, attacker);
    state.queue.push({ step: 'combatDamage', attackerUid: attacker.uid, target: target, player: attacker.owner,
      bonusPower: mods.bonusPower || 0, firstStrike: !!mods.firstStrike, bonusVsUnitsOnly: !!mods.bonusVsUnitsOnly });
    SB.fireTriggers(state, 'onAttack', attacker, { sourceUid: attacker.uid, attackTarget: target });
    if (target.kind === 'unit') {
      const defender = SB.findUnit(state, target.uid);
      if (defender) SB.fireTriggers(state, 'whenAttacked', defender, { sourceUid: defender.uid, attackerUid: attacker.uid });
    }
    // "When another friendly <trait> unit attacks" observers.
    SB.allUnits(state, attacker.owner).forEach(function (obs) {
      if (obs.uid === attacker.uid) return;
      (SB.unitDef(obs).abilities || []).forEach(function (ab) {
        if (ab.trigger !== 'onFriendlyAttack') return;
        if (ab.attackerTrait && SB.unitTraits(state, attacker).indexOf(ab.attackerTrait) < 0) return;
        SB.queueEffects(state, obs.owner, ab.effects, { sourceUid: obs.uid, cardId: obs.cardId, condition: ab.condition });
      });
    });
    // Base ability: gain the Force when a friendly Force unit attacks.
    const baseCard = SB.card(state.players[attacker.owner].base.cardId);
    if (SB.unitTraits(state, attacker).indexOf('tr12') >= 0) {
      (baseCard.abilities || []).forEach(function (ab) {
        if (ab.trigger !== 'onForceUnitAttack') return;
        SB.queueEffects(state, attacker.owner, ab.effects, { sourceUid: attacker.uid });
      });
    }
  };

  // Legal attack targets for a unit (sentinel/saboteur rules) — shared with the
  // action enumerator and effect-driven attacks.
  SB.attackTargets = function (state, unit) {
    const me = unit.owner;
    const arena = SB.arenaOf(state, unit);
    const enemies = state[arena].filter(function (e) {
      if (e.owner === me) return false;
      // Hidden: cannot be attacked during the round it was played.
      if (SB.hasKeyword(state, e, 'hidden') && e.enteredRound === state.round) return false;
      return true;
    });
    const sentinels = enemies.filter(function (e) { return SB.hasKeyword(state, e, 'sentinel'); });
    const sab = SB.hasKeyword(state, unit, 'saboteur');
    const pool = (sentinels.length > 0 && !sab) ? sentinels : enemies;
    const targets = pool.map(function (e) { return { kind: 'unit', uid: e.uid }; });
    if (sentinels.length === 0 || sab) targets.push({ kind: 'base', player: SB.other(me) });
    return targets;
  };

  SB.playCardWithMods = playCard; // ops.js queue steps play cards with modifiers

  // Undeployed-leader triggered abilities (e.g. "When you play an upgrade").
  // exhaustCost:true abilities are offered as optional (pay by exhausting leader).
  SB.fireLeaderTrigger = fireLeaderTrigger;
  function fireLeaderTrigger(state, playerIdx, trigger, ctx) {
    const p = state.players[playerIdx];
    if (p.leader.deployed) return;
    const abilities = SB.card(p.leader.cardId).leaderSide.abilities || [];
    abilities.forEach(function (ab, ai) {
      if (ab.trigger !== trigger) return;
      if (ab.exhaustCost && p.leader.exhausted) return;
      state.queue.push({ step: 'leaderTriggerOffer', player: playerIdx, abilityIndex: ai,
        exhaustCost: !!ab.exhaustCost, ctx: ctx || {} });
    });
  }

  SB.queueSteps = SB.queueSteps || {};
  SB.queueSteps.readyTax = {
    actions: function (state, itemStep) {
      const u = SB.findUnit(state, itemStep.uid);
      if (!u || u.exhausted) return null;
      const acts = [{ type: 'readyTax', player: itemStep.player, pay: false }];
      if (SB.readyResources(state, itemStep.player) >= itemStep.amount) {
        acts.push({ type: 'readyTax', player: itemStep.player, pay: true });
      }
      return acts;
    },
    apply: function (state, itemStep, action) {
      const u = SB.findUnit(state, itemStep.uid);
      if (!u) return;
      if (action.pay) {
        const res = state.players[itemStep.player].resources;
        let left = itemStep.amount;
        for (let i = 0; i < res.length && left > 0; i++) {
          if (!res[i].exhausted) { res[i].exhausted = true; left--; }
        }
        SB.log(state, { type: 'resourcesSpent', player: itemStep.player, amount: itemStep.amount });
      } else {
        u.exhausted = true;
        SB.log(state, { type: 'exhausted', uid: u.uid });
      }
    },
  };
  SB.queueSteps.exploitPick = {
    actions: function (state, itemStep) {
      const acts = [];
      SB.allUnits(state, itemStep.player).forEach(function (u) {
        if (u.uid === itemStep.forUid) return; // cannot exploit the card being played
        acts.push({ type: 'exploitUnit', player: itemStep.player, uid: u.uid });
      });
      return acts.length ? acts : null;
    },
    apply: function (state, itemStep, action) {
      const u = SB.findUnit(state, action.uid);
      if (!u) return;
      state.efxExploit = state.efxExploit || {};
      const key = String(itemStep.forUid);
      state.efxExploit[key] = state.efxExploit[key] || [];
      state.efxExploit[key].push(SB.unitPower(state, u));
      SB.log(state, { type: 'exploited', uid: u.uid, sound: 'destroy' });
      SB.defeatUnit(state, u, {});
    },
  };
  SB.queueSteps.leaderTriggerOffer = {
    actions: function (state, itemStep) {
      const p = state.players[itemStep.player];
      if (itemStep.exhaustCost && p.leader.exhausted) return null;
      return [
        { type: 'leaderTrigger', player: itemStep.player, use: true },
        { type: 'leaderTrigger', player: itemStep.player, use: false },
      ];
    },
    apply: function (state, itemStep, action) {
      if (!action.use) return;
      const p = state.players[itemStep.player];
      const ab = SB.card(p.leader.cardId).leaderSide.abilities[itemStep.abilityIndex];
      if (itemStep.exhaustCost) {
        p.leader.exhausted = true;
        SB.log(state, { type: 'leaderAction', player: itemStep.player, sound: 'ability' });
      }
      SB.queueEffects(state, itemStep.player, ab.effects,
        Object.assign({}, itemStep.ctx, { cardId: p.leader.cardId, condition: ab.condition }));
    },
  };

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
        const hadDefender = item.target.kind === 'unit' ? item.target.uid : null;
        const baseBefore = item.target.kind === 'base' ? state.players[item.target.player].base.damage : null;
        resolveCombatDamage(state, item);
        const defDefeated = hadDefender != null && !SB.findUnit(state, hadDefender);
        const defUnit = hadDefender != null ? SB.findUnit(state, hadDefender) : null;
        const baseDealt = baseBefore != null ? state.players[item.target.player].base.damage - baseBefore : 0;
        const atk = SB.findUnit(state, item.attackerUid);
        const endCtx = { attackTarget: item.target, defenderDefeated: defDefeated,
          baseDamageDealt: baseDealt,
          defenderDamagedNonLeader: !!(defUnit && defUnit.damage > 0 && SB.card(defUnit.cardId).type !== 'leader') };
        // Advantage tokens expire when their carrier's attack or defense ends.
        if (atk && atk.advantage) { atk.advantage = 0; SB.log(state, { type: 'advantageExpired', uid: atk.uid }); }
        if (defUnit && defUnit.advantage) { defUnit.advantage = 0; SB.log(state, { type: 'advantageExpired', uid: defUnit.uid }); }
        // "After this unit attacks" triggers, if the attacker survived.
        if (atk) SB.fireTriggers(state, 'onAttackEnds', atk, Object.assign({ sourceUid: atk.uid }, endCtx));
        // "When a friendly unit's attack ends" observers (leader + units).
        if (atk) {
          fireLeaderTrigger(state, atk.owner, 'onFriendlyAttackEnds',
            Object.assign({ attackEndedUid: atk.uid }, endCtx));
          SB.allUnits(state, atk.owner).forEach(function (obs) {
            if (obs.uid === atk.uid) return;
            SB.fireTriggers(state, 'onFriendlyAttackEnds', obs,
              Object.assign({ sourceUid: obs.uid, attackEndedUid: atk.uid }, endCtx));
          });
          // Deployed leader units also observe (they are units, covered above).
        }
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
    SB.log(state, { type: 'ambush', uid: unit.uid, sound: 'attack' });
    unit.exhausted = true;
    noteAttack(state, unit);
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
    state.defeatedThisPhase = [];
    state.efx = {};
    state.efxExploit = {};
    state.baseDamagersThisPhase = [];
    state.attackedThisPhase = [];
    state.leftPlayThisPhase = 0;
    state.lastWhenDefeated = null;
    state.players.forEach(function (p) {
      p.playedThisPhase = []; p.eventsThisRound = 0; p.discounts = []; p.plotDiscount = 0;
      p.discardedThisPhase = []; p.entersReadyGrants = [];
      delete p.echoNextOnPlay;
    });
    SB.log(state, { type: 'actionPhase', round: state.round });
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
    SB.log(state, { type: 'regroup', round: state.round });
    // Units captured by a base are rescued at the start of the regroup phase.
    if (SB.releaseBaseCaptives) SB.releaseBaseCaptives(state);
    // "When the regroup phase starts" unit triggers.
    SB.allUnits(state).slice().forEach(function (u) {
      SB.fireTriggers(state, 'onRegroup', u, { sourceUid: u.uid });
    });
    // "At the start of the regroup phase, defeat it" markers (temporary summons).
    SB.allUnits(state).filter(function (u) { return u.defeatAtRegroup; }).forEach(function (u) {
      SB.defeatUnit(state, u, {});
    });
    // Commandeered units go back to their owner's hand.
    SB.allUnits(state).filter(function (u) { return u.commandeered; }).forEach(function (u) {
      const arena = SB.arenaOf(state, u);
      state[arena].splice(state[arena].indexOf(u), 1);
      const original = u.commandeered.originalOwner;
      state.players[original].hand.push({ uid: u.uid, cardId: u.cardId });
      u.upgrades.forEach(function (inst) {
        if (inst.leaderPilot) {
          // The bearer leaves play, so the leader-pilot upgrade is defeated with it.
          const lp = state.players[u.owner].leader;
          lp.deployed = false; lp.exhausted = true; lp.damage = 0; lp.uid = null;
          lp.defeated = true;
        } else if (!SB.card(inst.cardId).token) state.players[original].discard.push(inst);
      });
      SB.log(state, { type: 'returnedToHand', uid: u.uid, cardId: u.cardId });
    });
    if (state.winner != null) return;
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

  // Extend processQueue handling for endRegroup via a wrapper check inside apply.
  // finishRegroup can queue new triggers (e.g. deaths from expiring buffs), so the
  // queue must be reprocessed afterwards.
  const origApply = SB.apply;
  SB.apply = function (prev, action) {
    const state = origApply(prev, action);
    while (state.queue.length > 0 && state.queue[0].step === 'endRegroup' && state.winner == null) {
      state.queue.shift();
      finishRegroup(state);
      processQueue(state);
    }
    return state;
  };

  function finishRegroup(state) {
    // Ready everything, clear temp buffs, next round.
    state.tempCombatMods = [];
    state.baseDamagersThisPhase = [];
    SB.allUnits(state).forEach(function (u) {
      delete u.keywordsSuppressed;
      const wasExhausted = u.exhausted;
      if (u.stunned) { delete u.stunned; } // stunned units miss this ready step
      else if (SB.isJailed(state, u)) { /* jailed units stay exhausted */ }
      else {
        u.exhausted = false;
        // "When this unit readies: pay N or exhaust it" taxes from upgrades.
        if (wasExhausted) {
          const sources = [SB.unitDef(u)].concat(u.upgrades.map(function (i2) { return SB.card(i2.cardId); }));
          sources.forEach(function (src) {
            (src.abilities || []).forEach(function (ab) {
              if (ab.trigger !== 'onReadyTax') return;
              state.queue.push({ step: 'readyTax', player: u.owner, uid: u.uid, amount: ab.amount || 3 });
            });
          });
        }
      }
      u.temp = { power: 0, hp: 0 };
      delete u.tempKeywords;
      delete u.tempKeywordNs;
      delete u.tempAbilities;
      delete u.triggerUsedRound;
      delete u.abilitiesSuppressed;
      delete u.defenderFirstNext;
    });
    // A unit kept alive past lethal by a this-round effect dies when it expires.
    SB.allUnits(state).slice().forEach(function (u) {
      if (SB.unitRemainingHp(state, u) <= 0) SB.defeatUnit(state, u, {});
    });
    state.players.forEach(function (p) {
      p.resources.forEach(function (r) { r.exhausted = false; });
      p.leader.exhausted = false;
    });
    state.round += 1;
    startActionPhase(state);
  }
})(window.SB = window.SB || {});
