// ops.js — extended op vocabulary + static-ability (aura) machinery + tokens +
// capture. Loads after effects.js/engine.js; registers into SB.ops and hooks the
// stat calculators. Every op here must have a describer in text.js (same order) —
// the text test enforces coverage, THIS comment enforces intent.
(function (SB) {
  'use strict';

  // ---- constant abilities (auras) -----------------------------------------
  // ability = {trigger:'constant', scope: selector-of-affected-units, grant:{power,hp,keywords?},
  //            condition?} on the SOURCE unit's def. Recomputed from board state on
  // every stat read; no cached state, so nothing to clean up.
  const basePower = SB.unitPower, baseMaxHp = SB.unitMaxHp;

  SB.auraGrants = function (state, unit) {
    const grants = [];
    SB.allUnits(state).forEach(function (src) {
      const def = SB.unitDef(src);
      (def.abilities || []).forEach(function (ab) {
        if (ab.trigger !== 'constant' || !ab.grant) return;
        if (ab.condition && !SB.checkCondition(state, src.owner, ab.condition, { sourceUid: src.uid })) return;
        const sel = ab.scope || { self: true };
        const cands = SB.selectorCandidates(state, src.owner, sel, { sourceUid: src.uid });
        if (cands.some(function (c) { return c.kind === 'unit' && c.uid === unit.uid; })) {
          grants.push(ab.grant);
        }
      });
    });
    return grants;
  };

  SB.unitPower = function (state, unit) {
    let p = basePower(state, unit);
    SB.auraGrants(state, unit).forEach(function (g) { p += (g.power || 0); });
    return Math.max(0, p);
  };
  SB.unitMaxHp = function (state, unit) {
    let h = baseMaxHp(state, unit);
    SB.auraGrants(state, unit).forEach(function (g) { h += (g.hp || 0); });
    return h;
  };
  const baseHasKeyword = SB.hasKeyword;
  SB.hasKeyword = function (state, unit, k) {
    if (baseHasKeyword(state, unit, k)) return true;
    if (unit.tempKeywords && unit.tempKeywords.indexOf(k) >= 0) return true;
    return SB.auraGrants(state, unit).some(function (g) {
      return (g.keywords || []).some(function (kw) { return kw.k === k; });
    });
  };

  // ---- extra ops ----------------------------------------------------------
  const O = SB.ops;

  // Deal damage to every unit matched by `scope` (both arenas unless filtered).
  O.damageAll = function (state, item) {
    const cands = SB.selectorCandidates(state, item.controller, item.op.scope, item.ctx || {});
    // Snapshot first: simultaneous damage.
    const units = cands.map(function (c) { return SB.findUnit(state, c.uid); }).filter(Boolean);
    units.forEach(function (u) { SB.damageUnit(state, u, item.op.amount, item.ctx); });
  };

  O.buffAll = function (state, item) {
    const cands = SB.selectorCandidates(state, item.controller, item.op.scope, item.ctx || {});
    const units = cands.map(function (c) { return SB.findUnit(state, c.uid); }).filter(Boolean);
    units.forEach(function (u) { u.temp.power += (item.op.power || 0); u.temp.hp += (item.op.hp || 0); });
    units.forEach(function (u) {
      if (SB.findUnit(state, u.uid) && SB.unitRemainingHp(state, u) <= 0) SB.defeatUnit(state, u, item.ctx);
    });
    state.log.push({ type: 'buffAll', power: item.op.power || 0, hp: item.op.hp || 0, sound: 'buff' });
  };

  // Choice-only op: pick a unit and save it for later ops (via saveTargetAs).
  O.pickUnit = function () { /* the save happens in SB.execOp */ };

  // Divided damage: controller assigns N points one at a time among units matched
  // by scope (default: enemy units).
  O.dividedDamage = function (state, item) {
    const total = SB.resolveAmount(state, item, null);
    for (let i = 0; i < total; i++) {
      state.queue.unshift({ step: 'dividedPoint', player: item.controller,
        scope: item.op.scope || { who: 'enemy', what: 'unit' }, ctx: item.ctx });
    }
  };

  // A friendly unit attacks immediately (effect-driven attack).
  // {target: sel-of-attacker, bonusPower?, firstStrike?, ready?: allow exhausted}
  O.attackWith = function (state, item, target) {
    const u = SB.findUnit(state, target.uid);
    if (!u) return;
    if (u.exhausted && !item.op.ready) return;
    state.queue.unshift({ step: 'attackTargetChoice', player: item.controller, uid: u.uid,
      bonusPower: item.op.bonusPower || 0, firstStrike: !!item.op.firstStrike, ready: !!item.op.ready,
      optional: !!item.op.optionalAttack });
  };

  // Look at the top card of your deck and decide. modes ⊆ ['leave','bottom','discard','play'].
  O.peekTop = function (state, item) {
    state.queue.unshift({ step: 'peekDecide', player: item.controller, modes: item.op.modes });
  };

  // Play a card from hand via an effect. {filter?, discount?, entersReady?, defeatAtRegroup?, optional?}
  O.playFromHand = function (state, item) {
    state.queue.unshift({ step: 'playHandPick', player: item.controller, filter: item.op.filter || {},
      discount: item.op.discount || 0, entersReady: !!item.op.entersReady,
      defeatAtRegroup: !!item.op.defeatAtRegroup, optional: item.op.optional !== false });
  };

  // Mill: discard top N cards of own deck; records their types for conditions.
  O.mill = function (state, item) {
    const p = state.players[item.controller];
    const types = [];
    for (let i = 0; i < (item.op.amount || 1) && p.deck.length > 0; i++) {
      const inst = p.deck.shift();
      p.discard.push(inst);
      types.push(SB.card(inst.cardId).type);
      state.log.push({ type: 'milled', player: item.controller, cardId: inst.cardId });
    }
    SB.efx(state, item.ctx).milledTypes = types;
  };

  // A named player picks one of two effect lists. {chooser:'opponent'|'self', a:{effects}, b:{effects}}
  O.binaryChoice = function (state, item) {
    const who = item.op.chooser === 'opponent' ? SB.other(item.controller) : item.controller;
    state.queue.unshift({ step: 'binaryPick', player: who, controller: item.controller,
      a: item.op.a, b: item.op.b, ctx: item.ctx });
  };

  // An event that banks itself: move it from the discard pile to resources.
  O.selfToResource = function (state, item) {
    const p = state.players[item.controller];
    const i = p.discard.findIndex(function (inst) { return inst.uid === (item.ctx && item.ctx.eventUid); });
    if (i < 0) return;
    const inst = p.discard.splice(i, 1)[0];
    p.resources.push({ instance: inst, exhausted: false });
    state.log.push({ type: 'resourced', player: item.controller });
  };

  // Give a keyword until end of round (cleared in regroup with temp stats).
  O.giveKeyword = function (state, item, target) {
    const u = SB.findUnit(state, target.uid);
    if (!u) return;
    u.tempKeywords = u.tempKeywords || [];
    u.tempKeywords.push(item.op.k);
    state.log.push({ type: 'gainedKeyword', uid: u.uid, k: item.op.k, sound: 'buff' });
  };

  // Opponent discards N cards of THEIR choice (queued choice for that player).
  O.discard = function (state, item) {
    const who = item.op.who === 'self' ? item.controller : SB.other(item.controller);
    for (let i = 0; i < (item.op.amount || 1); i++) {
      state.queue.unshift({ step: 'discardChoice', player: who });
    }
  };

  // Random discard (seeded).
  O.discardRandom = function (state, item) {
    const who = item.op.who === 'self' ? item.controller : SB.other(item.controller);
    const p = state.players[who];
    const rand = SB.rng(SB.stateSeed(state, 'discardRandom'));
    for (let i = 0; i < (item.op.amount || 1) && p.hand.length > 0; i++) {
      const idx = Math.floor(rand() * p.hand.length);
      const inst = p.hand.splice(idx, 1)[0];
      p.discard.push(inst);
      state.log.push({ type: 'discarded', player: who, cardId: inst.cardId, sound: 'discard' });
    }
  };

  // Create N token units for the controller.
  O.createToken = function (state, item) {
    for (let i = 0; i < (item.op.amount || 1); i++) {
      const unit = SB.makeUnit(state, item.op.token, item.op.forOpponent ? SB.other(item.controller) : item.controller);
      const card = SB.card(item.op.token);
      if (item.op.ready) unit.exhausted = false;
      state[card.arena].push(unit);
      state.log.push({ type: 'tokenCreated', uid: unit.uid, cardId: item.op.token, sound: 'deploy' });
    }
  };

  // Capture: remove an enemy unit from play, held under the capturing source unit.
  // Released (returned to owner's play area, exhausted) if the captor leaves play.
  O.capture = function (state, item, target) {
    const victim = SB.findUnit(state, target.uid);
    const captor = SB.findUnit(state, item.ctx && item.ctx.sourceUid);
    if (!victim || !captor) return;
    const arena = SB.arenaOf(state, victim);
    state[arena].splice(state[arena].indexOf(victim), 1);
    captor.captured = captor.captured || [];
    captor.captured.push({ uid: victim.uid, cardId: victim.cardId, owner: victim.owner, upgrades: victim.upgrades });
    state.log.push({ type: 'captured', uid: victim.uid, cardId: victim.cardId, by: captor.uid, sound: 'capture' });
  };

  // Heal own base.
  O.healBase = function (state, item) {
    const b = state.players[item.controller].base;
    const healed = Math.min(item.op.amount, b.damage);
    b.damage -= healed;
    if (healed > 0) state.log.push({ type: 'baseHeal', player: item.controller, amount: healed, sound: 'heal' });
    else state.log.push({ type: 'fizzle', why: 'noDamage', fizzled: true });
  };

  // Deal damage to your own base (costs of powerful villain effects).
  O.damageOwnBase = function (state, item) {
    SB.damageBase(state, item.controller, item.op.amount, 'selfEffect');
  };

  // Indirect damage: opponent (or chosen player) distributes N damage among their
  // units and/or base. AI/queue: we model as that player choosing targets one point
  // at a time (digital-friendly, rules-equivalent distribution).
  O.indirectDamage = function (state, item) {
    const who = item.op.who === 'self' ? item.controller : SB.other(item.controller);
    for (let i = 0; i < item.op.amount; i++) {
      state.queue.unshift({ step: 'indirectPoint', player: who });
    }
  };

  // Look at / reveal effects reduce to draw-filtering; simplest faithful digital
  // form for "search your deck for X" style:
  O.searchDeck = function (state, item) {
    // {op:'searchDeck', filter:{type?, trait?, maxCost?}, take:N, depth?:N}
    state.queue.unshift({
      step: 'searchPick', player: item.controller, filter: item.op.filter || {},
      remaining: item.op.take || 1, depth: item.op.depth || null, toHand: true,
    });
  };

  O.readyResource = function (state, item) {
    const res = state.players[item.controller].resources;
    let left = item.op.amount || 1;
    for (let i = 0; i < res.length && left > 0; i++) {
      if (res[i].exhausted) { res[i].exhausted = false; left--; }
    }
    state.log.push({ type: 'resourcesReadied', player: item.controller, amount: (item.op.amount || 1) - left });
  };

  O.exhaustResource = function (state, item) {
    const who = item.op.who === 'self' ? item.controller : SB.other(item.controller);
    const res = state.players[who].resources;
    let left = item.op.amount || 1;
    for (let i = 0; i < res.length && left > 0; i++) {
      if (!res[i].exhausted) { res[i].exhausted = true; left--; }
    }
    state.log.push({ type: 'resourcesExhausted', player: who, amount: (item.op.amount || 1) - left });
  };

  // Put the top card of your deck into play as a resource (economy ramp).
  O.resourceTopDeck = function (state, item) {
    const p = state.players[item.controller];
    if (p.deck.length === 0) { state.log.push({ type: 'fizzle', why: 'emptyDeck', fizzled: true }); return; }
    const inst = p.deck.shift();
    p.resources.push({ instance: inst, exhausted: item.op.exhausted !== false });
    state.log.push({ type: 'resourced', player: item.controller });
  };

  // ---- queue steps handled by the engine loop (registered here) -----------
  SB.queueSteps = SB.queueSteps || {};

  SB.queueSteps.discardChoice = {
    actions: function (state, itemStep) {
      const p = state.players[itemStep.player];
      if (p.hand.length === 0) return null; // auto-skip
      return p.hand.map(function (_, i) {
        return { type: 'discardCard', player: itemStep.player, handIndex: i };
      });
    },
    apply: function (state, itemStep, action) {
      const p = state.players[itemStep.player];
      const inst = p.hand.splice(action.handIndex, 1)[0];
      p.discard.push(inst);
      state.log.push({ type: 'discarded', player: itemStep.player, cardId: inst.cardId, sound: 'discard' });
    },
  };

  SB.queueSteps.indirectPoint = {
    actions: function (state, itemStep) {
      const me = itemStep.player;
      const acts = [{ type: 'indirectTo', player: me, target: { kind: 'base', player: me } }];
      SB.allUnits(state, me).forEach(function (u) {
        acts.push({ type: 'indirectTo', player: me, target: { kind: 'unit', uid: u.uid } });
      });
      return acts;
    },
    apply: function (state, itemStep, action) {
      if (action.target.kind === 'base') SB.damageBase(state, action.target.player, 1, 'indirect');
      else {
        const u = SB.findUnit(state, action.target.uid);
        if (u) SB.damageUnit(state, u, 1, {});
      }
    },
  };

  SB.queueSteps.searchPick = {
    actions: function (state, itemStep) {
      const p = state.players[itemStep.player];
      const depth = itemStep.depth || p.deck.length;
      const seen = p.deck.slice(0, depth);
      const matches = [];
      seen.forEach(function (inst, i) {
        const c = SB.card(inst.cardId);
        const f = itemStep.filter;
        if (f.type && c.type !== f.type) return;
        if (f.trait && (c.traits || []).indexOf(f.trait) < 0) return;
        if (f.maxCost != null && c.cost > f.maxCost) return;
        if (f.aspect && (c.aspects || []).indexOf(f.aspect) < 0) return;
        matches.push({ type: 'searchTake', player: itemStep.player, deckIndex: i });
      });
      if (matches.length === 0) return null; // shuffle happens in apply-skip
      matches.push({ type: 'searchTake', player: itemStep.player, deckIndex: -1 }); // decline
      return matches;
    },
    apply: function (state, itemStep, action) {
      const p = state.players[itemStep.player];
      const took = action.deckIndex >= 0;
      if (took) {
        const inst = p.deck.splice(action.deckIndex, 1)[0];
        p.hand.push(inst);
        state.log.push({ type: 'searched', player: itemStep.player });
      }
      if (took && itemStep.remaining > 1) {
        // Multi-take search: keep picking from the same window before shuffling.
        state.queue.unshift({ step: 'searchPick', player: itemStep.player, filter: itemStep.filter,
          remaining: itemStep.remaining - 1, depth: itemStep.depth == null ? null : itemStep.depth - 1, toHand: true });
        return;
      }
      // Shuffle after searching (seeded). (Printed rule bottoms the unseen window in
      // random order; a full shuffle is mechanically equivalent for hidden zones.)
      p.deck = SB.shuffled(p.deck, SB.rng(SB.stateSeed(state, 'searchShuffle')));
      state.log.push({ type: 'deckShuffled', player: itemStep.player });
    },
  };

  SB.queueSteps.dividedPoint = {
    actions: function (state, itemStep) {
      const cands = SB.selectorCandidates(state, itemStep.player, itemStep.scope, itemStep.ctx || {});
      return cands.filter(function (c) { return c.kind === 'unit'; }).map(function (c) {
        return { type: 'dividedTo', player: itemStep.player, target: c };
      });
    },
    apply: function (state, itemStep, action) {
      const u = SB.findUnit(state, action.target.uid);
      if (u) SB.damageUnit(state, u, 1, itemStep.ctx || {});
    },
  };

  SB.queueSteps.attackTargetChoice = {
    actions: function (state, itemStep) {
      const u = SB.findUnit(state, itemStep.uid);
      if (!u) return null;
      if (u.exhausted && !itemStep.ready) return null;
      const acts = SB.attackTargets(state, u).map(function (t) {
        return { type: 'effectAttack', player: itemStep.player, target: t };
      });
      if (itemStep.optional && acts.length) acts.push({ type: 'effectAttack', player: itemStep.player, target: null });
      return acts;
    },
    apply: function (state, itemStep, action) {
      if (!action.target) return; // declined optional attack
      const u = SB.findUnit(state, itemStep.uid);
      if (!u) return;
      SB.performAttack(state, u, action.target, {
        bonusPower: itemStep.bonusPower, firstStrike: itemStep.firstStrike, ready: itemStep.ready,
      });
    },
  };

  SB.queueSteps.mayReadyOwn = {
    actions: function (state, itemStep) {
      const acts = [];
      SB.allUnits(state, itemStep.player).forEach(function (u) {
        if (u.exhausted && !u.stunned) acts.push({ type: 'mayReady', player: itemStep.player, uid: u.uid });
      });
      if (acts.length === 0) return null;
      acts.push({ type: 'mayReady', player: itemStep.player, uid: null }); // decline
      return acts;
    },
    apply: function (state, itemStep, action) {
      if (action.uid == null) return;
      const u = SB.findUnit(state, action.uid);
      if (u && u.exhausted && !u.stunned) { u.exhausted = false; state.log.push({ type: 'readied', uid: u.uid }); }
    },
  };

  SB.queueSteps.peekDecide = {
    actions: function (state, itemStep) {
      const p = state.players[itemStep.player];
      if (p.deck.length === 0) return null;
      const acts = [];
      const inst = p.deck[0];
      const card = SB.card(inst.cardId);
      itemStep.modes.forEach(function (m) {
        if (m === 'play') {
          const cost = SB.cardCost(state, itemStep.player, inst.cardId);
          if (cost > SB.readyResources(state, itemStep.player)) return;
          if (card.type === 'unit' || card.type === 'event') {
            acts.push({ type: 'peekAct', player: itemStep.player, mode: 'play', cardId: inst.cardId });
          } else if (card.type === 'upgrade') {
            SB.allUnits(state).forEach(function (u) {
              if (card.attachTo === 'friendly' && u.owner !== itemStep.player) return;
              if (card.attachTo === 'enemy' && u.owner === itemStep.player) return;
              acts.push({ type: 'peekAct', player: itemStep.player, mode: 'play', cardId: inst.cardId, attachTo: u.uid });
            });
          }
        } else {
          acts.push({ type: 'peekAct', player: itemStep.player, mode: m });
        }
      });
      return acts;
    },
    apply: function (state, itemStep, action) {
      const p = state.players[itemStep.player];
      const inst = p.deck[0];
      if (!inst) return;
      if (action.mode === 'leave') {
        state.log.push({ type: 'peeked', player: itemStep.player });
      } else if (action.mode === 'bottom') {
        p.deck.shift(); p.deck.push(inst);
        state.log.push({ type: 'peekBottomed', player: itemStep.player });
      } else if (action.mode === 'discard') {
        p.deck.shift(); p.discard.push(inst);
        state.log.push({ type: 'discarded', player: itemStep.player, cardId: inst.cardId, sound: 'discard' });
      } else if (action.mode === 'play') {
        SB.playCardWithMods(state, itemStep.player,
          { fromDeckTop: true, cardId: inst.cardId, attachTo: action.attachTo }, {});
      }
    },
  };

  SB.queueSteps.playHandPick = {
    actions: function (state, itemStep) {
      const p = state.players[itemStep.player];
      const acts = [];
      p.hand.forEach(function (inst, i) {
        const card = SB.card(inst.cardId);
        const f = itemStep.filter;
        if (f.type && card.type !== f.type) return;
        if (f.trait && (card.traits || []).indexOf(f.trait) < 0) return;
        if (f.maxCost != null && card.cost > f.maxCost) return;
        const cost = Math.max(0, SB.cardCost(state, itemStep.player, inst.cardId) - itemStep.discount);
        if (cost > SB.readyResources(state, itemStep.player)) return;
        if (card.type === 'unit' && card.unique &&
            SB.allUnits(state, itemStep.player).some(function (u) { return u.cardId === inst.cardId; })) return;
        acts.push({ type: 'playHandCard', player: itemStep.player, handIndex: i, cardId: inst.cardId });
      });
      if (acts.length === 0) return null;
      if (itemStep.optional) acts.push({ type: 'playHandCard', player: itemStep.player, handIndex: -1 });
      return acts;
    },
    apply: function (state, itemStep, action) {
      if (action.handIndex === -1) return;
      SB.playCardWithMods(state, itemStep.player,
        { handIndex: action.handIndex, cardId: action.cardId },
        { discount: itemStep.discount, entersReady: itemStep.entersReady, defeatAtRegroup: itemStep.defeatAtRegroup });
    },
  };

  SB.queueSteps.binaryPick = {
    actions: function (state, itemStep) {
      return [
        { type: 'binary', player: itemStep.player, pick: 'a' },
        { type: 'binary', player: itemStep.player, pick: 'b' },
      ];
    },
    apply: function (state, itemStep, action) {
      const branch = itemStep[action.pick];
      state.log.push({ type: 'binaryChosen', player: itemStep.player, pick: action.pick });
      SB.queueEffects(state, itemStep.controller, branch.effects, itemStep.ctx || {});
    },
  };

  // Release captured cards when the captor leaves play.
  const baseDefeat = SB.defeatUnit;
  SB.defeatUnit = function (state, unit, ctx) {
    releaseCaptured(state, unit);
    baseDefeat(state, unit, ctx);
  };
  function releaseCaptured(state, unit) {
    (unit.captured || []).forEach(function (cap) {
      const u = SB.makeUnit(state, cap.cardId, cap.owner);
      u.uid = cap.uid;
      u.upgrades = cap.upgrades || [];
      state[SB.card(cap.cardId).arena].push(u);
      state.log.push({ type: 'rescued', uid: u.uid, cardId: u.cardId });
    });
    unit.captured = [];
  }
})(window.SB = window.SB || {});
