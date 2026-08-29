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
    // Bond links: a unit that buffs one specific other unit while it remains in play.
    SB.allUnits(state).forEach(function (src) {
      if (src.bondTarget === unit.uid && src.bondGrant) grants.push(src.bondGrant);
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
  const baseKeywordTotal = SB.keywordTotal;
  SB.keywordTotal = function (state, unit, k) {
    let n = baseKeywordTotal(state, unit, k);
    SB.auraGrants(state, unit).forEach(function (g) {
      (g.keywords || []).forEach(function (kw) { if (kw.k === k) n += (kw.n || 0); });
    });
    return n;
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
    let bonus = item.op.bonusPower || 0;
    if (item.op.bonusIfTrait && SB.unitTraits(state, u).indexOf(item.op.bonusIfTrait.trait) >= 0) {
      bonus += item.op.bonusIfTrait.amount;
    }
    state.queue.unshift({ step: 'attackTargetChoice', player: item.controller, uid: u.uid,
      bonusPower: bonus, firstStrike: !!item.op.firstStrike, ready: !!item.op.ready,
      optional: !!item.op.optionalAttack, bonusVsUnitsOnly: !!item.op.bonusVsUnitsOnly });
  };

  // Look at the top card of your deck and decide. modes ⊆ ['leave','bottom','discard','play'].
  O.peekTop = function (state, item) {
    state.queue.unshift({ step: 'peekDecide', player: item.controller, modes: item.op.modes });
  };

  // Play a card from hand via an effect. {filter?, discount?, entersReady?, defeatAtRegroup?, optional?}
  O.playFromHand = function (state, item) {
    state.queue.unshift({ step: 'playHandPick', player: item.controller, filter: item.op.filter || {},
      discount: item.op.free ? 99 : (item.op.discount || 0), entersReady: !!item.op.entersReady,
      defeatAtRegroup: !!item.op.defeatAtRegroup, optional: item.op.optional !== false,
      withAmbush: !!item.op.withAmbush, zones: item.op.zones || ['hand'] });
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
    SB.collectBounties(state, victim);
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
      function matchOne(c, f) {
        if (f.type && c.type !== f.type) return false;
        if (f.trait && (c.traits || []).indexOf(f.trait) < 0) return false;
        if (f.maxCost != null && c.cost > f.maxCost) return false;
        if (f.aspect && (c.aspects || []).indexOf(f.aspect) < 0) return false;
        return true;
      }
      seen.forEach(function (inst, i) {
        const c = SB.card(inst.cardId);
        const f = itemStep.filter;
        const ok = f.anyOf ? f.anyOf.some(function (sub) { return matchOne(c, sub); }) : matchOne(c, f);
        if (!ok) return;
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

  // Grant an ability to a unit until end of round.
  O.grantAbilityTemp = function (state, item, target) {
    const u = SB.findUnit(state, target.uid);
    if (!u) return;
    u.tempAbilities = u.tempAbilities || [];
    u.tempAbilities.push(item.op.ability);
    state.log.push({ type: 'gainedAbility', uid: u.uid, sound: 'buff' });
  };

  // Modify the pending combat (queued combatDamage item for this attacker).
  // {op:'attackBonus', amount} boosts the attacker; {defenderDelta} shifts the
  // defender's retaliation power (min 0).
  O.attackBonus = function (state, item) {
    const cd = state.queue.find(function (q) {
      return q.step === 'combatDamage' && q.attackerUid === (item.ctx && item.ctx.sourceUid);
    });
    if (!cd) return;
    cd.bonusPower = (cd.bonusPower || 0) + (item.op.amount || 0);
    cd.defenderPowerDelta = (cd.defenderPowerDelta || 0) + (item.op.defenderDelta || 0);
    state.log.push({ type: 'attackModified', uid: item.ctx.sourceUid });
  };

  // Exhaust another friendly unit as a cost, then boost this attack.
  O.exhaustFriendlyForBonus = function (state, item, target) {
    const u = SB.findUnit(state, target.uid);
    if (!u || u.exhausted) return;
    u.exhausted = true;
    state.log.push({ type: 'exhausted', uid: u.uid });
    O.attackBonus(state, item);
  };

  // Collect a unit's bounties as if defeated (without defeating it).
  O.collectBountiesOf = function (state, item, target) {
    const u = SB.findUnit(state, target.uid);
    if (u) SB.collectBounties(state, u);
  };

  // The defeated unit puts ITSELF into play as a resource (from its discard pile).
  O.selfDefeatedToResource = function (state, item) {
    const owner = state.players[item.controller];
    const uid = item.ctx && item.ctx.sourceUid;
    const i = owner.discard.findIndex(function (inst) { return inst.uid === uid; });
    if (i < 0) return;
    const inst = owner.discard.splice(i, 1)[0];
    owner.resources.push({ instance: inst, exhausted: false });
    state.log.push({ type: 'resourced', player: item.controller });
  };

  // Defeat a unit and remember how many upgrades it had.
  O.defeatCountUpgrades = function (state, item, target) {
    const u = SB.findUnit(state, target.uid);
    if (!u) return;
    SB.efx(state, item.ctx)[item.op.saveCountAs || 'n'] = u.upgrades.length;
    SB.defeatUnit(state, u, item.ctx);
  };

  // Queue `countRef` copies of an effect.
  O.repeat = function (state, item) {
    const n = SB.efx(state, item.ctx)[item.op.countRef] || 0;
    const copies = [];
    for (let i = 0; i < n; i++) copies.push(item.op.effect);
    if (copies.length) SB.queueEffects(state, item.controller, copies, item.ctx);
  };

  // Mill 1; if the milled card shares an aspect with your base, return it to hand.
  O.millMatchBaseAspect = function (state, item) {
    const p = state.players[item.controller];
    if (p.deck.length === 0) return;
    const inst = p.deck.shift();
    const baseAspects = SB.card(p.base.cardId).aspects || [];
    const shares = (SB.card(inst.cardId).aspects || []).some(function (a) { return baseAspects.indexOf(a) >= 0; });
    if (shares) {
      p.hand.push(inst);
      state.log.push({ type: 'milledToHand', player: item.controller, sound: 'draw' });
    } else {
      p.discard.push(inst);
      state.log.push({ type: 'milled', player: item.controller, cardId: inst.cardId });
    }
  };

  // Move an upgrade from one unit to another unit of the same controller.
  O.moveUpgrade = function (state, item) {
    state.queue.unshift({ step: 'moveUpgradePick', player: item.controller });
  };

  // Defeat an upgrade on any unit.
  O.defeatUpgrade = function (state, item) {
    state.queue.unshift({ step: 'defeatUpgradePick', player: item.controller });
  };

  // Return an upgrade from your discard pile to your hand.
  O.upgradeFromDiscard = function (state, item) {
    state.queue.unshift({ step: 'upgradeFromDiscardPick', player: item.controller, optional: item.op.optional !== false });
  };

  // Persistent single-target buff while the source remains in play.
  O.bondBuff = function (state, item, target) {
    const src = SB.findUnit(state, item.ctx && item.ctx.sourceUid);
    const u = SB.findUnit(state, target.uid);
    if (!src || !u) return;
    src.bondTarget = u.uid;
    src.bondGrant = { power: item.op.power || 0, hp: item.op.hp || 0 };
    state.log.push({ type: 'bonded', uid: src.uid, to: u.uid, sound: 'buff' });
  };

  // Temporary per-player cost discount for the next N matching cards this phase.
  O.grantDiscount = function (state, item) {
    const p = state.players[item.controller];
    p.discounts = p.discounts || [];
    p.discounts.push({ amount: item.op.amount, remaining: item.op.count || 1, filter: item.op.filter || {} });
    state.log.push({ type: 'discountGranted', player: item.controller, sound: 'buff' });
  };

  // Take a matching card from your discard pile into hand.
  O.takeFromDiscard = function (state, item) {
    state.queue.unshift({ step: 'takeFromDiscardPick', player: item.controller,
      filter: item.op.filter || {}, optional: item.op.optional !== false });
  };

  SB.queueSteps.takeFromDiscardPick = {
    actions: function (state, itemStep) {
      const p = state.players[itemStep.player];
      const acts = [];
      p.discard.forEach(function (inst, i) {
        const c = SB.card(inst.cardId);
        const f = itemStep.filter;
        if (f.type && c.type !== f.type) return;
        if (f.trait && (c.traits || []).indexOf(f.trait) < 0) return;
        if (f.defeatedThisPhase && !(state.defeatedThisPhase || []).some(function (d) { return d.uid === inst.uid; })) return;
        acts.push({ type: 'takeFromDiscard', player: itemStep.player, index: i });
      });
      if (acts.length === 0) return null;
      if (itemStep.optional) acts.push({ type: 'takeFromDiscard', player: itemStep.player, index: -1 });
      return acts;
    },
    apply: function (state, itemStep, action) {
      if (action.index < 0) return;
      const p = state.players[itemStep.player];
      const inst = p.discard.splice(action.index, 1)[0];
      p.hand.push(inst);
      state.log.push({ type: 'tookFromDiscard', player: itemStep.player, sound: 'draw' });
    },
  };

  // Each player (controller first) defeats a non-leader unit they control.
  O.eachPlayerDefeatOwn = function (state, item) {
    state.queue.unshift({ step: 'defeatOwnPick', player: SB.other(item.controller) });
    state.queue.unshift({ step: 'defeatOwnPick', player: item.controller });
  };

  SB.queueSteps.defeatOwnPick = {
    actions: function (state, itemStep) {
      const acts = [];
      SB.allUnits(state, itemStep.player).forEach(function (u) {
        if (SB.card(u.cardId).type === 'leader') return;
        acts.push({ type: 'defeatOwn', player: itemStep.player, uid: u.uid });
      });
      return acts.length ? acts : null;
    },
    apply: function (state, itemStep, action) {
      const u = SB.findUnit(state, action.uid);
      if (u) SB.defeatUnit(state, u, {});
    },
  };

  // Exhaust any number of matching friendly ready units; deal 1 damage to the
  // defending player's base for each.
  O.massExhaustForBaseDamage = function (state, item) {
    const t = item.ctx && item.ctx.attackTarget;
    const basePlayer = t ? (t.kind === 'base' ? t.player : (function () {
      const u = SB.findUnit(state, t.uid); return u ? u.owner : null;
    })()) : null;
    if (basePlayer == null) return;
    state.queue.unshift({ step: 'massExhaustPick', player: item.controller,
      trait: item.op.trait, basePlayer: basePlayer });
  };

  SB.queueSteps.massExhaustPick = {
    actions: function (state, itemStep) {
      const acts = [{ type: 'massExhaust', player: itemStep.player, uid: null }]; // stop
      SB.allUnits(state, itemStep.player).forEach(function (u) {
        if (u.exhausted) return;
        if (itemStep.trait && SB.unitTraits(state, u).indexOf(itemStep.trait) < 0) return;
        acts.push({ type: 'massExhaust', player: itemStep.player, uid: u.uid });
      });
      return acts.length > 1 ? acts : null;
    },
    apply: function (state, itemStep, action) {
      if (action.uid == null) return;
      const u = SB.findUnit(state, action.uid);
      if (!u || u.exhausted) return;
      u.exhausted = true;
      state.log.push({ type: 'exhausted', uid: u.uid });
      SB.damageBase(state, itemStep.basePlayer, 1, 'effect');
      // Keep offering until the player stops or runs out.
      state.queue.unshift({ step: 'massExhaustPick', player: itemStep.player,
        trait: itemStep.trait, basePlayer: itemStep.basePlayer });
    },
  };

  // Put N cards from hand on the bottom of the deck (chosen one at a time).
  O.bottomFromHand = function (state, item) {
    for (let i = 0; i < (item.op.amount || 1); i++) {
      state.queue.unshift({ step: 'bottomHandPick', player: item.controller });
    }
  };

  SB.queueSteps.bottomHandPick = {
    actions: function (state, itemStep) {
      const p = state.players[itemStep.player];
      if (p.hand.length === 0) return null;
      return p.hand.map(function (_, i) {
        return { type: 'bottomCard', player: itemStep.player, handIndex: i };
      });
    },
    apply: function (state, itemStep, action) {
      const p = state.players[itemStep.player];
      const inst = p.hand.splice(action.handIndex, 1)[0];
      p.deck.push(inst);
      state.log.push({ type: 'bottomedCard', player: itemStep.player });
    },
  };

  // For each unit exploited while playing this card, optionally deal damage equal
  // to that unit's power to an enemy unit.
  O.damagePerExploited = function (state, item) {
    const powers = (state.efxExploit && state.efxExploit[String(item.ctx && item.ctx.sourceUid)]) || [];
    const copies = powers.map(function (p2) {
      return { op: 'damage', amount: p2, target: { who: 'enemy', what: 'unit', optional: true } };
    });
    if (copies.length) SB.queueEffects(state, item.controller, copies, item.ctx);
  };

  SB.queueSteps.moveUpgradePick = {
    actions: function (state, itemStep) {
      const acts = [];
      SB.allUnits(state).forEach(function (src) {
        src.upgrades.forEach(function (inst, ui) {
          SB.allUnits(state, src.owner).forEach(function (dst) {
            if (dst.uid === src.uid) return;
            const card = SB.card(inst.cardId);
            if (card.attachFilter && card.attachFilter.notTrait &&
                SB.unitTraits(state, dst).indexOf(card.attachFilter.notTrait) >= 0) return;
            acts.push({ type: 'moveUpgrade', player: itemStep.player, from: src.uid, index: ui, to: dst.uid });
          });
        });
      });
      if (acts.length === 0) return null;
      acts.push({ type: 'moveUpgrade', player: itemStep.player, from: null }); // decline
      return acts;
    },
    apply: function (state, itemStep, action) {
      if (action.from == null) return;
      const src = SB.findUnit(state, action.from), dst = SB.findUnit(state, action.to);
      if (!src || !dst) return;
      const inst = src.upgrades.splice(action.index, 1)[0];
      dst.upgrades.push(inst);
      state.log.push({ type: 'attached', uid: dst.uid, cardId: inst.cardId, sound: 'attach' });
    },
  };

  SB.queueSteps.defeatUpgradePick = {
    actions: function (state, itemStep) {
      const acts = [];
      SB.allUnits(state).forEach(function (u) {
        u.upgrades.forEach(function (inst, ui) {
          acts.push({ type: 'defeatUpgrade', player: itemStep.player, uid: u.uid, index: ui });
        });
      });
      return acts.length ? acts : null;
    },
    apply: function (state, itemStep, action) {
      const u = SB.findUnit(state, action.uid);
      if (!u) return;
      const inst = u.upgrades.splice(action.index, 1)[0];
      if (!SB.card(inst.cardId).token) state.players[u.owner].discard.push(inst);
      state.log.push({ type: 'upgradeDefeated', uid: u.uid, cardId: inst.cardId, sound: 'destroy' });
      // Removing +HP can defeat the bearer.
      if (SB.unitRemainingHp(state, u) <= 0) SB.defeatUnit(state, u, {});
    },
  };

  SB.queueSteps.upgradeFromDiscardPick = {
    actions: function (state, itemStep) {
      const p = state.players[itemStep.player];
      const acts = [];
      p.discard.forEach(function (inst, i) {
        if (SB.card(inst.cardId).type === 'upgrade') {
          acts.push({ type: 'takeFromDiscard', player: itemStep.player, index: i });
        }
      });
      if (acts.length === 0) return null;
      if (itemStep.optional) acts.push({ type: 'takeFromDiscard', player: itemStep.player, index: -1 });
      return acts;
    },
    apply: function (state, itemStep, action) {
      if (action.index < 0) return;
      const p = state.players[itemStep.player];
      const inst = p.discard.splice(action.index, 1)[0];
      p.hand.push(inst);
      state.log.push({ type: 'tookFromDiscard', player: itemStep.player, sound: 'draw' });
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
        bonusVsUnitsOnly: itemStep.bonusVsUnitsOnly,
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
      function consider(inst, i, zone) {
        const card = SB.card(inst.cardId);
        const f = itemStep.filter;
        if (f.type && card.type !== f.type) return;
        if (f.trait && (card.traits || []).indexOf(f.trait) < 0) return;
        if (f.maxCost != null && card.cost > f.maxCost) return;
        if (f.aspect && (card.aspects || []).indexOf(f.aspect) < 0) return;
        if (card.type === 'upgrade' || card.type === 'leader' || card.type === 'base') return;
        const cost = Math.max(0, SB.cardCost(state, itemStep.player, inst.cardId) - itemStep.discount);
        if (cost > SB.readyResources(state, itemStep.player)) return;
        if (card.type === 'unit' && card.unique &&
            SB.allUnits(state, itemStep.player).some(function (u) { return u.cardId === inst.cardId; })) return;
        acts.push({ type: 'playHandCard', player: itemStep.player, handIndex: i, cardId: inst.cardId, zone: zone });
      }
      (itemStep.zones || ['hand']).forEach(function (z) {
        (z === 'hand' ? p.hand : p.discard).forEach(function (inst, i) { consider(inst, i, z); });
      });
      if (acts.length === 0) return null;
      if (itemStep.optional) acts.push({ type: 'playHandCard', player: itemStep.player, handIndex: -1 });
      return acts;
    },
    apply: function (state, itemStep, action) {
      if (action.handIndex === -1) return;
      const playAction = action.zone === 'discard'
        ? { fromDiscard: action.handIndex, cardId: action.cardId }
        : { handIndex: action.handIndex, cardId: action.cardId };
      SB.playCardWithMods(state, itemStep.player, playAction,
        { discount: itemStep.discount, entersReady: itemStep.entersReady, defeatAtRegroup: itemStep.defeatAtRegroup });
      if (itemStep.withAmbush) {
        const played = SB.allUnits(state, itemStep.player).find(function (u) {
          return u.cardId === action.cardId && u.enteredRound === state.round && u.exhausted;
        });
        if (played && SB.card(action.cardId).type === 'unit') {
          state.queue.push({ step: 'effect', controller: itemStep.player,
            ctx: { sourceUid: played.uid, cardId: played.cardId }, op: { op: 'ambushAttack', target: null } });
        }
      }
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

  // ---- bounty --------------------------------------------------------------
  // Bounty = ability {trigger:'bounty', effects}. When the unit is defeated or
  // captured, the OPPONENT of its controller collects each bounty (chooses targets).
  SB.collectBounties = function (state, unit) {
    const collector = SB.other(unit.owner);
    const sources = [SB.unitDef(unit)]
      .concat(unit.upgrades.map(function (i) { return SB.card(i.cardId); }));
    if (unit.tempAbilities) sources.push({ abilities: unit.tempAbilities });
    sources.forEach(function (src) {
      (src.abilities || []).forEach(function (ab) {
        if (ab.trigger !== 'bounty') return;
        state.log.push({ type: 'bountyCollected', uid: unit.uid, sound: 'claim' });
        SB.queueEffects(state, collector, ab.effects, { bountyUnitUid: unit.uid, bountyCardId: unit.cardId });
      });
    });
  };

  // Release captured cards when the captor leaves play; collect bounties on defeat.
  const baseDefeat = SB.defeatUnit;
  SB.defeatUnit = function (state, unit, ctx) {
    releaseCaptured(state, unit);
    SB.collectBounties(state, unit);
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
