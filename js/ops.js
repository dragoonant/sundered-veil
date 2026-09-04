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

  const baseUnitTraits = SB.unitTraits;
  let inAura = false;
  SB.unitTraits = function (state, unit) {
    let ts = baseUnitTraits(state, unit);
    if (!inAura) {
      inAura = true;
      try {
        SB.auraGrants(state, unit).forEach(function (g) {
          if (g.traits) ts = ts.concat(g.traits);
        });
      } finally { inAura = false; }
    }
    return ts;
  };

  SB.auraGrants = function (state, unit) {
    const grants = [];
    SB.allUnits(state).forEach(function (src) {
      const def = SB.unitDef(src);
      let abilities = (def.abilities || []).slice();
      src.upgrades.forEach(function (inst) {
        abilities = abilities.concat(SB.card(inst.cardId).abilities || []);
      });
      abilities.forEach(function (ab) {
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

  function dynamicPowerValue(state, unit, kind) {
    if (kind === 'friendlyPilotsAndPilotUpgrades') {
      let n = 0;
      SB.allUnits(state, unit.owner).forEach(function (u) {
        if (u.uid !== unit.uid && SB.unitTraits(state, u).indexOf('tr30') >= 0) n++;
        u.upgrades.forEach(function (inst) {
          const c = SB.card(inst.cardId);
          if (c.type === 'leader' || (c.traits || []).indexOf('tr30') >= 0) n++;
        });
      });
      return n;
    }
    if (kind === 'pilotsOnSelf') return SB.pilotCount(state, unit);
    if (kind === 'upgradesOnOtherFriendlies') {
      let n = 0;
      SB.allUnits(state, unit.owner).forEach(function (u) {
        if (u.uid !== unit.uid) n += u.upgrades.length;
      });
      return n;
    }
    return 0;
  }

  SB.unitPower = function (state, unit) {
    let p = basePower(state, unit);
    SB.auraGrants(state, unit).forEach(function (g) {
      p += (g.power || 0);
      if (g.dynamicPower) p += dynamicPowerValue(state, unit, g.dynamicPower);
    });
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
    if (unit.keywordsSuppressed) return false;
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
    SB.log(state, { type: 'buffAll', power: item.op.power || 0, hp: item.op.hp || 0, sound: 'buff' });
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
    if (item.op.bonusIfOddCostsDiffer) {
      const rc = SB.efx(state, item.ctx).revealedCost;
      const uc = SB.card(u.cardId).cost;
      if (rc != null && uc != null && rc % 2 === 1 && uc % 2 === 1 && rc !== uc) {
        bonus += item.op.bonusIfOddCostsDiffer;
      }
    }
    if (item.op.grantSaboteurForAttack) {
      u.tempKeywords = u.tempKeywords || [];
      u.tempKeywords.push('saboteur');
    }
    if (item.op.grantTempAbility) {
      u.tempAbilities = (u.tempAbilities || []).concat([item.op.grantTempAbility]);
    }
    state.queue.unshift({ step: 'attackTargetChoice', player: item.controller, uid: u.uid,
      bonusPower: bonus, firstStrike: !!item.op.firstStrike, ready: !!item.op.ready,
      optional: !!item.op.optionalAttack, bonusVsUnitsOnly: !!item.op.bonusVsUnitsOnly,
      unitsOnly: !!item.op.unitsOnly });
  };

  // Look at the top card of your deck and decide. modes ⊆ ['leave','bottom','discard','play'].
  O.peekTop = function (state, item) {
    state.queue.unshift({ step: 'peekDecide', player: item.controller, modes: item.op.modes });
  };

  // Play a card from hand via an effect. {filter?, discount?, entersReady?, defeatAtRegroup?, optional?}
  O.playFromHand = function (state, item) {
    state.queue.unshift({ step: 'playHandPick', player: item.controller, ctx: item.ctx, filter: item.op.filter || {},
      discount: item.op.free ? 99 : (item.op.discount || 0), entersReady: !!item.op.entersReady,
      defeatAtRegroup: !!item.op.defeatAtRegroup, optional: item.op.optional !== false,
      withAmbush: !!item.op.withAmbush, withAmbushIfCredit: !!item.op.withAmbushIfCredit,
      zones: item.op.zones || ['hand'] });
  };

  // Mill: discard top N cards of own deck; records their types for conditions.
  O.mill = function (state, item) {
    const p = state.players[item.controller];
    const types = [];
    const costs = [];
    for (let i = 0; i < (item.op.amount || 1) && p.deck.length > 0; i++) {
      const inst = p.deck.shift();
      p.discard.push(inst);
      types.push(SB.card(inst.cardId).type);
      costs.push(SB.card(inst.cardId).cost);
      SB.log(state, { type: 'milled', player: item.controller, cardId: inst.cardId });
    }
    SB.efx(state, item.ctx).milledTypes = types;
    SB.efx(state, item.ctx).milledCosts = costs;
  };

  // A named player picks one of two effect lists. {chooser:'opponent'|'self', a:{effects}, b:{effects}}
  O.binaryChoice = function (state, item) {
    const who = item.op.chooser === 'opponent' ? SB.other(item.controller) : item.controller;
    state.queue.unshift({ step: 'binaryPick', player: who, controller: item.controller,
      a: item.op.a, b: item.op.b, aGate: item.op.aGate, ctx: item.ctx });
  };

  // An event that banks itself: move it from the discard pile to resources.
  O.selfToResource = function (state, item) {
    const p = state.players[item.controller];
    const i = p.discard.findIndex(function (inst) { return inst.uid === (item.ctx && item.ctx.eventUid); });
    if (i < 0) return;
    const inst = p.discard.splice(i, 1)[0];
    p.resources.push({ instance: inst, exhausted: false });
    SB.log(state, { type: 'resourced', player: item.controller });
  };

  // Give a keyword until end of round (cleared in regroup with temp stats).
  O.giveKeyword = function (state, item, target) {
    const u = SB.findUnit(state, target.uid);
    if (!u) return;
    u.tempKeywords = u.tempKeywords || [];
    u.tempKeywords.push(item.op.k);
    SB.log(state, { type: 'gainedKeyword', uid: u.uid, k: item.op.k, sound: 'buff' });
  };

  // Opponent discards N cards of THEIR choice (queued choice for that player).
  O.discard = function (state, item) {
    const who = item.op.who === 'self' ? item.controller : SB.other(item.controller);
    for (let i = 0; i < (item.op.amount || 1); i++) {
      state.queue.unshift({ step: 'discardChoice', player: who, ctx: item.ctx, filter: item.op.filter });
    }
  };

  // Random discard (seeded).
  O.discardRandom = function (state, item) {
    let who = item.op.who === 'self' ? item.controller : SB.other(item.controller);
    if (item.op.who === 'targetOwner') {
      const t = SB.efx(state, item.ctx)[item.op.ofSaved];
      const u = t && t.kind === 'unit' ? SB.findUnit(state, t.uid) : null;
      if (u) who = u.owner; else if (t && t.kind === 'base') who = t.player; else return;
    }
    const p = state.players[who];
    const rand = SB.rng(SB.stateSeed(state, 'discardRandom'));
    for (let i = 0; i < (item.op.amount || 1) && p.hand.length > 0; i++) {
      const idx = Math.floor(rand() * p.hand.length);
      const inst = p.hand.splice(idx, 1)[0];
      p.discard.push(inst);
      SB.log(state, { type: 'discarded', player: who, cardId: inst.cardId, sound: 'discard' });
    }
  };

  // Create N token units for the controller.
  O.createToken = function (state, item) {
    for (let i = 0; i < (item.op.amount || 1); i++) {
      const unit = SB.makeUnit(state, item.op.token, item.op.forOpponent ? SB.other(item.controller) : item.controller);
      const card = SB.card(item.op.token);
      if (item.op.ready) unit.exhausted = false;
      state[card.arena].push(unit);
      SB.log(state, { type: 'tokenCreated', uid: unit.uid, cardId: item.op.token, sound: 'deploy' });
    }
  };

  // Capture: remove an enemy unit from play, held under the capturing source unit.
  // Released (returned to owner's play area, exhausted) if the captor leaves play.
  O.capture = function (state, item, target) {
    const victim = SB.findUnit(state, target.uid);
    let captorRef = item.ctx && item.ctx.sourceUid;
    if (item.op.captorSaved) {
      const t = SB.efx(state, item.ctx)[item.op.captorSaved];
      captorRef = t && t.uid;
    }
    const captor = SB.findUnit(state, captorRef);
    if (!victim || !captor) return;
    SB.collectBounties(state, victim);
    const arena = SB.arenaOf(state, victim);
    state[arena].splice(state[arena].indexOf(victim), 1);
    captor.captured = captor.captured || [];
    captor.captured.push({ uid: victim.uid, cardId: victim.cardId, owner: victim.owner, upgrades: victim.upgrades });
    SB.log(state, { type: 'captured', uid: victim.uid, cardId: victim.cardId, by: captor.uid, sound: 'capture' });
  };

  // Heal own base.
  O.healBase = function (state, item) {
    const b = state.players[item.controller].base;
    const healed = Math.min(item.op.amount, b.damage);
    b.damage -= healed;
    if (healed > 0) SB.log(state, { type: 'baseHeal', player: item.controller, amount: healed, sound: 'heal' });
    else SB.log(state, { type: 'fizzle', why: 'noDamage', fizzled: true });
  };

  // Deal damage to your own base (costs of powerful villain effects).
  O.damageOwnBase = function (state, item) {
    SB.damageBase(state, item.controller, item.op.amount, 'selfEffect');
  };

  // Indirect damage: opponent (or chosen player) distributes N damage among their
  // units and/or base. AI/queue: we model as that player choosing targets one point
  // at a time (digital-friendly, rules-equivalent distribution).
  O.indirectDamage = function (state, item) {
    let who = item.op.who === 'self' ? item.controller : SB.other(item.controller);
    if (item.op.who === 'defending') {
      const t = item.ctx && item.ctx.attackTarget;
      if (!t) return;
      who = t.kind === 'base' ? t.player : (SB.findUnit(state, t.uid) || {}).owner;
      if (who == null) return;
    }
    let amount = SB.resolveAmount(state, item, null) || item.op.amount;
    if (who !== item.controller) {
      // "Indirect damage you deal to opponents is increased by 1" statics.
      SB.allUnits(state, item.controller).forEach(function (u) {
        if ((SB.unitDef(u).staticFlags || []).indexOf('indirectBoost') >= 0) amount += 1;
      });
    }
    for (let i = 0; i < amount; i++) {
      state.queue.unshift({ step: 'indirectPoint', player: who, dealer: item.controller });
    }
  };

  // Look at / reveal effects reduce to draw-filtering; simplest faithful digital
  // form for "search your deck for X" style:
  O.searchDeck = function (state, item) {
    // {op:'searchDeck', filter:{...}, take:N, depth?:N, playIt?:bool, playDiscount?:n}
    state.queue.unshift({
      step: 'searchPick', player: item.controller, filter: item.op.filter || {},
      remaining: item.op.take || 1, depth: item.op.depth || null,
      playIt: !!item.op.playIt, playDiscount: item.op.playDiscount || 0,
    });
  };

  O.readyResource = function (state, item) {
    const res = state.players[item.controller].resources;
    let left = item.op.amountRef ? SB.resolveAmount(state, item, null) : (item.op.amount || 1);
    for (let i = 0; i < res.length && left > 0; i++) {
      if (res[i].exhausted) { res[i].exhausted = false; left--; }
    }
    SB.log(state, { type: 'resourcesReadied', player: item.controller, amount: (item.op.amount || 1) - left });
  };

  O.exhaustResource = function (state, item) {
    const who = item.op.who === 'self' ? item.controller : SB.other(item.controller);
    const res = state.players[who].resources;
    let left = item.op.amount || 1;
    for (let i = 0; i < res.length && left > 0; i++) {
      if (!res[i].exhausted) { res[i].exhausted = true; left--; }
    }
    SB.log(state, { type: 'resourcesExhausted', player: who, amount: (item.op.amount || 1) - left });
  };

  // Put the top card of your deck into play as a resource (economy ramp).
  O.resourceTopDeck = function (state, item) {
    const p = state.players[item.controller];
    if (p.deck.length === 0) { SB.log(state, { type: 'fizzle', why: 'emptyDeck', fizzled: true }); return; }
    const inst = p.deck.shift();
    p.resources.push({ instance: inst, exhausted: item.op.exhausted !== false });
    SB.log(state, { type: 'resourced', player: item.controller });
  };

  // Defeat a non-unique upgrade on the (indirectly damaged) unit.
  O.defeatUpgradeOn = function (state, item) {
    const uid = item.ctx && item.ctx.damagedUid;
    const u = uid != null ? SB.findUnit(state, uid) : null;
    if (!u) return;
    const idx = u.upgrades.findIndex(function (inst) { return !SB.card(inst.cardId).unique && !inst.leaderPilot; });
    if (idx < 0) return;
    const inst = u.upgrades.splice(idx, 1)[0];
    if (!SB.card(inst.cardId).token) state.players[SB.upgradeOwner(u, inst)].discard.push(inst);
    SB.log(state, { type: 'upgradeDefeated', uid: u.uid, cardId: inst.cardId, sound: 'destroy' });
    if (SB.unitRemainingHp(state, u) <= 0) SB.defeatUnit(state, u, {});
  };

  // Mill both decks and count odd costs among the milled cards.
  O.millBothCountOdd = function (state, item) {
    let odd = 0;
    [item.controller, SB.other(item.controller)].forEach(function (pi) {
      const p = state.players[pi];
      for (let i = 0; i < (item.op.amount || 3) && p.deck.length > 0; i++) {
        const inst = p.deck.shift();
        p.discard.push(inst);
        const c = SB.card(inst.cardId).cost;
        if (c != null && c % 2 === 1) odd++;
        SB.log(state, { type: 'milled', player: pi, cardId: inst.cardId });
      }
    });
    SB.efx(state, item.ctx)[item.op.saveAs || 'odds'] = odd;
  };

  // Ready every unit matched by scope.
  O.readyAll = function (state, item) {
    const cands = SB.selectorCandidates(state, item.controller, item.op.scope, item.ctx || {});
    cands.forEach(function (c) {
      const u = SB.findUnit(state, c.uid);
      if (u && u.exhausted && !u.stunned && !SB.isJailed(state, u)) {
        u.exhausted = false;
        SB.log(state, { type: 'readied', uid: u.uid });
      }
    });
  };

  // Spend resources as an effect cost. Affordability is normally settled upstream
  // (binaryPick will not offer a branch that cannot be paid for), but if an unpayable
  // cost is reached anyway, the REST of its invocation is dropped too — the effects
  // this was buying must never resolve for free.
  O.spendResources = function (state, item) {
    const res = state.players[item.controller].resources;
    const ready = res.filter(function (x) { return !x.exhausted; }).length;
    if (ready < item.op.amount) {
      SB.log(state, { type: 'fizzle', why: 'cantPay', cardId: item.ctx && item.ctx.cardId, fizzled: true });
      SB.cancelInvocation(state, item.ctx);
      return;
    }
    let left = item.op.amount;
    for (let i = 0; i < res.length && left > 0; i++) {
      if (!res[i].exhausted) { res[i].exhausted = true; left--; }
    }
    SB.log(state, { type: 'resourcesSpent', player: item.controller, amount: item.op.amount });
  };

  // Move this unit to the other arena.
  O.moveSelfArena = function (state, item) {
    const u = SB.findUnit(state, item.ctx && item.ctx.sourceUid);
    if (!u) return;
    const from = SB.arenaOf(state, u);
    const to = item.op.to || (from === 'ground' ? 'space' : 'ground');
    if (from === to) return;
    state[from].splice(state[from].indexOf(u), 1);
    state[to].push(u);
    SB.log(state, { type: 'movedArena', uid: u.uid, to: to });
  };

  // Take control of an enemy unit (optionally returned to owner at next regroup).
  O.takeControl = function (state, item, target) {
    const u = SB.findUnit(state, target.uid);
    if (!u) return;
    const original = u.owner;
    u.owner = item.controller;
    if (item.op.ready && u.exhausted && !u.stunned) u.exhausted = false;
    if (item.op.returnAtRegroup) u.commandeered = { originalOwner: original };
    SB.log(state, { type: 'controlTaken', uid: u.uid, by: item.controller, sound: 'claim', notice: true });
  };

  // Reveal the top card of the deck (public information effect).
  O.revealTop = function (state, item) {
    const p = state.players[item.controller];
    if (p.deck.length === 0) return;
    SB.efx(state, item.ctx).revealedCost = SB.card(p.deck[0].cardId).cost;
    SB.log(state, { type: 'revealedTop', player: item.controller, cardId: p.deck[0].cardId, notice: true });
  };

  // Force token economy: one token per player, kept until spent.
  O.gainForce = function (state, item) {
    const p = state.players[item.controller];
    if (!p.force) { p.force = true; SB.log(state, { type: 'forceGained', player: item.controller, sound: 'buff' }); }
  };
  O.useForce = function (state, item) {
    const p = state.players[item.controller];
    if (!p.force) { SB.log(state, { type: 'fizzle', why: 'noForce', fizzled: true }); return; }
    p.force = false;
    SB.log(state, { type: 'forceUsed', player: item.controller, sound: 'ability' });
  };

  // Defeat every unit matched by scope.
  O.defeatAll = function (state, item) {
    const cands = SB.selectorCandidates(state, item.controller, item.op.scope, item.ctx || {});
    const units = cands.map(function (c) { return SB.findUnit(state, c.uid); }).filter(Boolean);
    units.forEach(function (u) { if (SB.findUnit(state, u.uid)) SB.defeatUnit(state, u, item.ctx); });
  };

  // Remove one experience token from a chosen unit.
  O.removeExperience = function (state, item, target) {
    const u = SB.findUnit(state, target.uid);
    if (!u || u.experience <= 0) return;
    u.experience -= 1;
    SB.log(state, { type: 'experienceRemoved', uid: u.uid });
    if (SB.unitRemainingHp(state, u) <= 0) SB.defeatUnit(state, u, item.ctx);
  };

  // The defender weakens the incoming attacker for this attack.
  O.attackerPowerDelta = function (state, item) {
    const cd = state.queue.find(function (q) {
      return q.step === 'combatDamage' && q.attackerUid === (item.ctx && item.ctx.attackerUid);
    });
    if (!cd) return;
    cd.bonusPower = (cd.bonusPower || 0) + item.op.amount;
    SB.log(state, { type: 'attackModified', uid: item.ctx.attackerUid });
  };

  // Exhaust any number of units with combined cost <= budget.
  O.exhaustBudget = function (state, item) {
    state.queue.unshift({ step: 'exhaustBudgetPick', player: item.controller, budget: item.op.budget });
  };
  SB.queueSteps.exhaustBudgetPick = {
    actions: function (state, itemStep) {
      const acts = [{ type: 'budgetExhaust', player: itemStep.player, uid: null }];
      SB.allUnits(state).forEach(function (u) {
        if (u.exhausted) return;
        const c = SB.card(u.cardId).cost;
        if (c == null || c > itemStep.budget) return;
        acts.push({ type: 'budgetExhaust', player: itemStep.player, uid: u.uid, cost: c });
      });
      return acts.length > 1 ? acts : null;
    },
    apply: function (state, itemStep, action) {
      if (action.uid == null) return;
      const u = SB.findUnit(state, action.uid);
      if (!u || u.exhausted) return;
      u.exhausted = true;
      SB.log(state, { type: 'exhausted', uid: u.uid });
      const rest = itemStep.budget - (SB.card(u.cardId).cost || 0);
      if (rest > 0) state.queue.unshift({ step: 'exhaustBudgetPick', player: itemStep.player, budget: rest });
    },
  };

  // Pay up to N resources one at a time; each grants an experience token to self.
  O.payForExperience = function (state, item) {
    state.queue.unshift({ step: 'payXpPick', player: item.controller, left: item.op.max || 6, uid: item.ctx.sourceUid });
  };
  SB.queueSteps.payXpPick = {
    actions: function (state, itemStep) {
      if (itemStep.left <= 0) return null;
      if (!SB.findUnit(state, itemStep.uid)) return null;
      const acts = [{ type: 'payXp', player: itemStep.player, pay: false }];
      if (SB.readyResources(state, itemStep.player) > 0) acts.push({ type: 'payXp', player: itemStep.player, pay: true });
      return acts.length > 1 ? acts : null;
    },
    apply: function (state, itemStep, action) {
      if (!action.pay) return;
      const res = state.players[itemStep.player].resources;
      for (let i = 0; i < res.length; i++) {
        if (!res[i].exhausted) { res[i].exhausted = true; break; }
      }
      const u = SB.findUnit(state, itemStep.uid);
      if (u) { u.experience += 1; SB.log(state, { type: 'experience', uid: u.uid, sound: 'buff' }); }
      state.queue.unshift({ step: 'payXpPick', player: itemStep.player, left: itemStep.left - 1, uid: itemStep.uid });
    },
  };

  // Put up to N matching cards from discard on the bottom of the deck; count them.
  O.bottomFromDiscard = function (state, item) {
    state.queue.unshift({ step: 'bottomDiscardPick', player: item.controller,
      filter: item.op.filter || {}, left: item.op.upTo || 1, saveCountAs: item.op.saveCountAs, count: 0, ctx: item.ctx });
  };
  SB.queueSteps.bottomDiscardPick = {
    actions: function (state, itemStep) {
      const p = state.players[itemStep.player];
      const acts = [{ type: 'bottomDiscard', player: itemStep.player, index: -1 }];
      if (itemStep.left > 0) {
        p.discard.forEach(function (inst, i) {
          const c = SB.card(inst.cardId);
          if (itemStep.filter.trait && (c.traits || []).indexOf(itemStep.filter.trait) < 0) return;
          if (itemStep.filter.type && c.type !== itemStep.filter.type) return;
          acts.push({ type: 'bottomDiscard', player: itemStep.player, index: i });
        });
      }
      return acts.length > 1 || itemStep.count > 0 ? acts : null;
    },
    apply: function (state, itemStep, action) {
      if (action.index < 0) {
        if (itemStep.saveCountAs && itemStep.ctx) SB.efx(state, itemStep.ctx)[itemStep.saveCountAs] = itemStep.count;
        return;
      }
      const p = state.players[itemStep.player];
      const inst = p.discard.splice(action.index, 1)[0];
      p.deck.push(inst);
      SB.log(state, { type: 'bottomedCard', player: itemStep.player });
      state.queue.unshift({ step: 'bottomDiscardPick', player: itemStep.player,
        filter: itemStep.filter, left: itemStep.left - 1, saveCountAs: itemStep.saveCountAs,
        count: itemStep.count + 1, ctx: itemStep.ctx });
    },
  };

  // Grant "echo the next When Played ability" to the controller this phase.
  O.echoNextOnPlay = function (state, item) {
    state.players[item.controller].echoNextOnPlay = true;
    SB.log(state, { type: 'echoArmed', player: item.controller, sound: 'buff' });
  };

  // Give an experience token to every unit matched by scope.
  O.experienceAll = function (state, item) {
    const cands = SB.selectorCandidates(state, item.controller, item.op.scope, item.ctx || {});
    cands.forEach(function (c) {
      const u = SB.findUnit(state, c.uid);
      if (u) { u.experience += 1; SB.log(state, { type: 'experience', uid: u.uid, sound: 'buff' }); }
    });
  };

  // Buff both stats by a resolved amount (this round).
  O.buffTempRef = function (state, item, target) {
    const u = SB.findUnit(state, target.uid);
    if (!u) return;
    const n = SB.resolveAmount(state, item, target) || 0;
    u.temp.power += n; u.temp.hp += n;
    SB.log(state, { type: 'buff', uid: u.uid, power: n, hp: n, sound: 'buff' });
  };

  O.gainCredits = function (state, item) {
    const p = state.players[item.controller];
    p.credits = (p.credits || 0) + (item.op.amount || 1);
    SB.log(state, { type: 'creditsGained', player: item.controller, amount: item.op.amount || 1, sound: 'claim' });
  };

  // Buff a unit +1/+1 per distinct aspect it has (this round).
  O.buffPerOwnAspects = function (state, item, target) {
    const u = SB.findUnit(state, target.uid);
    if (!u) return;
    const n = new Set(SB.card(u.cardId).aspects || []).size;
    u.temp.power += n; u.temp.hp += n;
    SB.log(state, { type: 'buff', uid: u.uid, power: n, hp: n, sound: 'buff' });
  };

  // Look at top 2, bottom any number, keep the rest on top in chosen order.
  O.arrangeTop2 = function (state, item) {
    state.queue.unshift({ step: 'arrangeTop2', player: item.controller });
  };
  SB.queueSteps.arrangeTop2 = {
    actions: function (state, itemStep) {
      const p = state.players[itemStep.player];
      if (p.deck.length === 0) return null;
      if (p.deck.length === 1) {
        return [
          { type: 'arrange2', player: itemStep.player, mode: 'keep' },
          { type: 'arrange2', player: itemStep.player, mode: 'bottomBoth' },
        ];
      }
      return [
        { type: 'arrange2', player: itemStep.player, mode: 'keep' },
        { type: 'arrange2', player: itemStep.player, mode: 'swap' },
        { type: 'arrange2', player: itemStep.player, mode: 'bottomFirst' },
        { type: 'arrange2', player: itemStep.player, mode: 'bottomSecond' },
        { type: 'arrange2', player: itemStep.player, mode: 'bottomBoth' },
      ];
    },
    apply: function (state, itemStep, action) {
      const d = state.players[itemStep.player].deck;
      const a = d.shift(); const b = d.length ? d.shift() : null;
      const put = { keep: [[a, b], []], swap: [[b, a], []], bottomFirst: [[b], [a]],
        bottomSecond: [[a], [b]], bottomBoth: [[], [a, b]] }[action.mode];
      put[0].filter(Boolean).reverse().forEach(function (x) { d.unshift(x); });
      put[1].filter(Boolean).forEach(function (x) { d.push(x); });
      SB.log(state, { type: 'arrangedTop', player: itemStep.player });
    },
  };

  // Bottom a unit from your discard pile; store its power.
  O.bottomUnitFromDiscardPower = function (state, item) {
    state.queue.unshift({ step: 'bottomUnitPick', player: item.controller,
      saveAs: item.op.saveAs || 'p', ctx: item.ctx });
  };
  SB.queueSteps.bottomUnitPick = {
    actions: function (state, itemStep) {
      const p = state.players[itemStep.player];
      const acts = [];
      p.discard.forEach(function (inst, i) {
        if (SB.card(inst.cardId).type === 'unit') {
          acts.push({ type: 'bottomUnit', player: itemStep.player, index: i });
        }
      });
      return acts.length ? acts : null;
    },
    apply: function (state, itemStep, action) {
      const p = state.players[itemStep.player];
      const inst = p.discard.splice(action.index, 1)[0];
      p.deck.push(inst);
      if (itemStep.ctx) SB.efx(state, itemStep.ctx)[itemStep.saveAs] = SB.card(inst.cardId).power || 0;
      SB.log(state, { type: 'bottomedCard', player: itemStep.player });
    },
  };

  // Exchange control of a chosen friendly and enemy non-leader unit; the player
  // receiving the cheaper unit gains credits equal to the cost difference.
  O.exchangeControl = function (state, item) {
    state.queue.unshift({ step: 'swapPickEnemy', player: item.controller, ctx: item.ctx });
    state.queue.unshift({ step: 'swapPickFriendly', player: item.controller, ctx: item.ctx });
  };
  SB.queueSteps.swapPickFriendly = {
    actions: function (state, itemStep) {
      const acts = [];
      SB.allUnits(state, itemStep.player).forEach(function (u) {
        if (SB.card(u.cardId).type === 'leader') return;
        acts.push({ type: 'swapPick', player: itemStep.player, uid: u.uid, slot: 'mine' });
      });
      return acts.length ? acts : null;
    },
    apply: function (state, itemStep, action) {
      SB.efx(state, itemStep.ctx).swapMine = action.uid;
    },
  };
  SB.queueSteps.swapPickEnemy = {
    actions: function (state, itemStep) {
      const acts = [];
      SB.allUnits(state, SB.other(itemStep.player)).forEach(function (u) {
        if (SB.card(u.cardId).type === 'leader') return;
        acts.push({ type: 'swapPick', player: itemStep.player, uid: u.uid, slot: 'theirs' });
      });
      return acts.length ? acts : null;
    },
    apply: function (state, itemStep, action) {
      const mineUid = SB.efx(state, itemStep.ctx).swapMine;
      const mine = SB.findUnit(state, mineUid);
      const theirs = SB.findUnit(state, action.uid);
      if (!mine || !theirs) return;
      const a = mine.owner, b = theirs.owner;
      mine.owner = b; theirs.owner = a;
      SB.log(state, { type: 'controlExchanged', a: mine.uid, b: theirs.uid, notice: true });
      const cm = SB.card(mine.cardId).cost || 0, ct = SB.card(theirs.cardId).cost || 0;
      if (cm !== ct) {
        // Whoever received the cheaper unit gains the difference in credits.
        const receiverOfCheaper = cm < ct ? b : a;
        const diff = Math.abs(cm - ct);
        state.players[receiverOfCheaper].credits = (state.players[receiverOfCheaper].credits || 0) + diff;
        SB.log(state, { type: 'creditsGained', player: receiverOfCheaper, amount: diff, sound: 'claim' });
      }
    },
  };

  // Opponent chooses one of their ground units; you may deal N damage to it.
  O.oppChoosesUnitDamage = function (state, item) {
    state.queue.unshift({ step: 'oppChooseUnit', player: SB.other(item.controller),
      controller: item.controller, amount: item.op.amount, arena: item.op.arena, ctx: item.ctx });
  };
  SB.queueSteps.oppChooseUnit = {
    actions: function (state, itemStep) {
      const acts = [];
      SB.allUnits(state, itemStep.player).forEach(function (u) {
        if (itemStep.arena && SB.arenaOf(state, u) !== itemStep.arena) return;
        acts.push({ type: 'oppOffer', player: itemStep.player, uid: u.uid });
      });
      return acts.length ? acts : null;
    },
    apply: function (state, itemStep, action) {
      SB.efx(state, itemStep.ctx).oppChosen = { kind: 'unit', uid: action.uid };
      SB.queueEffects(state, itemStep.controller, [
        { op: 'binaryChoice', chooser: 'self',
          a: { effects: [{ op: 'damage', amount: itemStep.amount, useTarget: 'oppChosen' }] },
          b: { effects: [] } }], itemStep.ctx);
    },
  };

  // Simplified auction (see DEVIATIONS.md): choose a player; reveal the top card of
  // their deck; they may play it for free; if they do, the other player gains
  // credits equal to its printed cost.
  O.auctionTop = function (state, item) {
    state.queue.unshift({ step: 'auctionWho', player: item.controller, ctx: item.ctx });
  };
  SB.queueSteps.auctionWho = {
    actions: function (state, itemStep) {
      return [
        { type: 'auctionPick', player: itemStep.player, who: itemStep.player },
        { type: 'auctionPick', player: itemStep.player, who: SB.other(itemStep.player) },
      ];
    },
    apply: function (state, itemStep, action) {
      const who = action.who;
      const p = state.players[who];
      if (p.deck.length === 0) return;
      const top = p.deck[0];
      SB.log(state, { type: 'revealedTop', player: who, cardId: top.cardId, notice: true });
      const card = SB.card(top.cardId);
      if (card.type !== 'unit' && card.type !== 'event') return;
      state.queue.unshift({ step: 'auctionPlay', player: who, cardId: top.cardId, cost: card.cost || 0 });
    },
  };
  SB.queueSteps.auctionPlay = {
    actions: function (state, itemStep) {
      const p = state.players[itemStep.player];
      if (p.deck.length === 0 || p.deck[0].cardId !== itemStep.cardId) return null;
      const card = SB.card(itemStep.cardId);
      if (card.type === 'unit' && card.unique &&
          SB.allUnits(state, itemStep.player).some(function (u) { return u.cardId === itemStep.cardId; })) return null;
      return [
        { type: 'auctionPlay', player: itemStep.player, play: true },
        { type: 'auctionPlay', player: itemStep.player, play: false },
      ];
    },
    apply: function (state, itemStep, action) {
      if (!action.play) return;
      SB.playCardWithMods(state, itemStep.player,
        { fromDeckTop: true, cardId: itemStep.cardId }, { discount: 99 });
      const other = SB.other(itemStep.player);
      if (itemStep.cost > 0) {
        state.players[other].credits = (state.players[other].credits || 0) + itemStep.cost;
        SB.log(state, { type: 'creditsGained', player: other, amount: itemStep.cost, sound: 'claim' });
      }
    },
  };

  // Advantage tokens: +1/+0 each, defeated when the carrier's attack/defense ends.
  O.giveAdvantage = function (state, item, target) {
    const u = SB.findUnit(state, target.uid);
    if (!u) return;
    const n = item.op.amountRef ? SB.resolveAmount(state, item, target) : (item.op.amount || 1);
    if (n <= 0) return;
    u.advantage = (u.advantage || 0) + n;
    SB.log(state, { type: 'advantage', uid: u.uid, amount: n, sound: 'buff' });
  };
  O.advantageAll = function (state, item) {
    const cands = SB.selectorCandidates(state, item.controller, item.op.scope, item.ctx || {});
    cands.forEach(function (c) {
      const u = SB.findUnit(state, c.uid);
      if (u) { u.advantage = (u.advantage || 0) + (item.op.amount || 1); SB.log(state, { type: 'advantage', uid: u.uid, amount: item.op.amount || 1, sound: 'buff' }); }
    });
  };

  // Support: attack with another friendly ready unit, lending it this unit's
  // on-attack abilities for the round (see DEVIATIONS.md).
  O.supportAttack = function (state, item) {
    const src = SB.findUnit(state, item.ctx && item.ctx.sourceUid);
    if (!src) return;
    state.queue.unshift({ step: 'supportPick', player: item.controller, srcUid: src.uid });
  };
  SB.queueSteps.supportPick = {
    actions: function (state, itemStep) {
      const acts = [{ type: 'supportChoose', player: itemStep.player, uid: null }];
      SB.allUnits(state, itemStep.player).forEach(function (u) {
        if (u.uid === itemStep.srcUid || u.exhausted) return;
        if (SB.attackTargets(state, u).length === 0) return;
        acts.push({ type: 'supportChoose', player: itemStep.player, uid: u.uid });
      });
      return acts.length > 1 ? acts : null;
    },
    apply: function (state, itemStep, action) {
      if (action.uid == null) return;
      const u = SB.findUnit(state, action.uid);
      const src = SB.findUnit(state, itemStep.srcUid);
      if (!u || !src) return;
      const lent = (SB.unitDef(src).abilities || []).filter(function (ab) {
        return ['onAttack', 'onAttackEnds', 'combatConstant'].indexOf(ab.trigger) >= 0;
      });
      if (lent.length) {
        u.tempAbilities = (u.tempAbilities || []).concat(lent);
        SB.log(state, { type: 'supported', uid: u.uid, by: src.uid, sound: 'buff' });
      }
      state.queue.unshift({ step: 'attackTargetChoice', player: itemStep.player, uid: u.uid,
        bonusPower: 0, firstStrike: false, ready: false, optional: false });
    },
  };

  // Token doubling (defeat this unit to double a token creation).
  O.createToken = (function (orig) {
    return function (state, item) {
      const doubler = SB.allUnits(state, item.controller).find(function (u) {
        return (SB.unitDef(u).staticFlags || []).indexOf('tokenDoubler') >= 0;
      });
      if (doubler && !item.op._resolved) {
        state.queue.unshift({ step: 'tokenDoubleOffer', player: item.controller,
          doublerUid: doubler.uid, op: item.op, controller: item.controller, ctx: item.ctx });
        return;
      }
      orig(state, item);
    };
  })(O.createToken);
  SB.queueSteps.tokenDoubleOffer = {
    actions: function (state, itemStep) {
      if (!SB.findUnit(state, itemStep.doublerUid)) return null;
      return [
        { type: 'tokenDouble', player: itemStep.player, use: true },
        { type: 'tokenDouble', player: itemStep.player, use: false },
      ];
    },
    apply: function (state, itemStep, action) {
      const op = Object.assign({}, itemStep.op, { _resolved: true });
      if (action.use) {
        const d = SB.findUnit(state, itemStep.doublerUid);
        if (d) SB.defeatUnit(state, d, {});
        op.amount = (op.amount || 1) * 2;
      }
      state.queue.unshift({ step: 'effect', controller: itemStep.controller, op: op, ctx: itemStep.ctx || {} });
    },
  };

  // Capture a just-defeated friendly unit back from the discard pile.
  O.captureFromDiscard = function (state, item) {
    const src = SB.findUnit(state, item.ctx && item.ctx.sourceUid);
    const uid = item.ctx && item.ctx.defeatedUid;
    if (!src || uid == null) return;
    const owner = state.players[item.controller];
    const i = owner.discard.findIndex(function (inst) { return inst.uid === uid; });
    if (i < 0) return;
    const inst = owner.discard.splice(i, 1)[0];
    src.captured = src.captured || [];
    src.captured.push({ uid: inst.uid, cardId: inst.cardId, owner: item.controller, upgrades: [] });
    SB.log(state, { type: 'captured', uid: inst.uid, cardId: inst.cardId, by: src.uid, sound: 'capture' });
  };

  // Defeat the damaged (surviving, non-leader) defender of the just-ended attack.
  O.defeatDamagedDefender = function (state, item) {
    const t = item.ctx && item.ctx.attackTarget;
    const u = t && t.kind === 'unit' ? SB.findUnit(state, t.uid) : null;
    if (!u || u.damage === 0) return;
    if (SB.card(u.cardId).type === 'leader') return;
    SB.defeatUnit(state, u, {});
  };

  // Defeat all upgrades on the defending unit.
  O.defeatDefenderUpgrades = function (state, item) {
    const t = item.ctx && item.ctx.attackTarget;
    const u = t && t.kind === 'unit' ? SB.findUnit(state, t.uid) : null;
    if (!u) return;
    u.upgrades.slice().forEach(function (inst) {
      u.upgrades.splice(u.upgrades.indexOf(inst), 1);
      if (inst.leaderPilot) {
        const lp = state.players[u.owner].leader;
        lp.deployed = false; lp.exhausted = true; lp.damage = 0; lp.uid = null;
      } else if (!SB.card(inst.cardId).token) state.players[SB.upgradeOwner(u, inst)].discard.push(inst);
    });
    SB.log(state, { type: 'upgradesDefeated', uid: u.uid, sound: 'destroy' });
    if (SB.unitRemainingHp(state, u) <= 0) SB.defeatUnit(state, u, {});
  };

  // Heal every friendly unit fully.
  O.healAllFriendly = function (state, item) {
    SB.allUnits(state, item.controller).forEach(function (u) {
      if (u.damage > 0) {
        SB.log(state, { type: 'unitHeal', uid: u.uid, amount: u.damage, sound: 'heal' });
        u.damage = 0;
      }
    });
  };

  // Return all OTHER upgrades on the bearer to their owners' hands.
  O.returnOtherUpgradesOnBearer = function (state, item) {
    const bearer = SB.findUnit(state, item.ctx && item.ctx.bearerUid != null ? item.ctx.bearerUid : item.ctx.sourceUid);
    if (!bearer) return;
    const selfCardId = item.ctx && item.ctx.upgradeCardId;
    bearer.upgrades.slice().forEach(function (inst) {
      if (inst.cardId === selfCardId) return;
      if (inst.leaderPilot) return;
      bearer.upgrades.splice(bearer.upgrades.indexOf(inst), 1);
      state.players[SB.upgradeOwner(bearer, inst)].hand.push(inst);
      SB.log(state, { type: 'returnedToHand', uid: bearer.uid, cardId: inst.cardId });
    });
  };

  // Disclose: reveal hand cards covering the aspect icons (public log; simplified
  // to an all-at-once reveal — the gating happened via condition canDisclose).
  O.discloseReveal = function (state, item) {
    SB.log(state, { type: 'disclosed', player: item.controller, aspects: item.op.aspects, notice: true });
    if (SB.fireLeaderTrigger) SB.fireLeaderTrigger(state, item.controller, 'onRevealOrDiscard', {});
    SB.allUnits(state, item.controller).forEach(function (u) {
      SB.fireTriggers(state, 'onRevealOrDiscard', u, { sourceUid: u.uid });
    });
  };

  // Round-long combat penalty for enemy units attacking a base.
  O.roundCombatPenaltyVsBase = function (state, item) {
    state.tempCombatMods = state.tempCombatMods || [];
    state.tempCombatMods.push({ enemyOf: item.controller, vsBase: true, power: item.op.amount });
    SB.log(state, { type: 'globalCombatMod', player: item.controller, sound: 'buff' });
  };

  // Exhaust an enemy unit and keep it exhausted while this unit remains in play.
  O.jailExhaust = function (state, item, target) {
    const u = SB.findUnit(state, target.uid);
    const src = SB.findUnit(state, item.ctx && item.ctx.sourceUid);
    if (!u || !src) return;
    u.exhausted = true;
    src.jails = u.uid;
    SB.log(state, { type: 'jailed', uid: u.uid, by: src.uid, sound: 'ability', notice: true });
  };

  // Suppress all keywords on a unit for this round.
  O.suppressKeywords = function (state, item, target) {
    const u = SB.findUnit(state, target.uid);
    if (!u) return;
    u.keywordsSuppressed = true;
    SB.log(state, { type: 'keywordsSuppressed', uid: u.uid, sound: 'ability' });
  };

  // Plot support: discount for the next plot card this phase.
  O.plotDiscount = function (state, item) {
    const p = state.players[item.controller];
    p.plotDiscount = (p.plotDiscount || 0) + item.op.amount;
    SB.log(state, { type: 'plotDiscount', player: item.controller, sound: 'buff' });
  };

  // Offer playing Plot cards from resources (used by leader deploys and effects).
  O.plotOffer = function (state, item) {
    state.queue.unshift({ step: 'plotOffer', player: item.controller });
  };

  SB.queueSteps.plotOffer = {
    actions: function (state, itemStep) {
      const p = state.players[itemStep.player];
      const acts = [{ type: 'plotPlay', player: itemStep.player, resourceIndex: -1 }];
      p.resources.forEach(function (res, ri) {
        const card = SB.cards[res.instance.cardId];
        if (!card || !(card.keywords || []).some(function (k) { return k.k === 'plot'; })) return;
        if (p.deck.length === 0) return;
        const cost = Math.max(0, SB.cardCost(state, itemStep.player, card.id) - (p.plotDiscount || 0));
        if (cost > SB.readyResources(state, itemStep.player)) return;
        if (card.type === 'unit' && card.unique &&
            SB.allUnits(state, itemStep.player).some(function (u) { return u.cardId === card.id; })) return;
        acts.push({ type: 'plotPlay', player: itemStep.player, resourceIndex: ri, cardId: card.id });
      });
      return acts.length > 1 ? acts : null;
    },
    apply: function (state, itemStep, action) {
      if (action.resourceIndex < 0) return;
      const p = state.players[itemStep.player];
      const res = p.resources[action.resourceIndex];
      const card = SB.card(action.cardId);
      const cost = Math.max(0, SB.cardCost(state, itemStep.player, card.id) - (p.plotDiscount || 0));
      p.plotDiscount = 0;
      // pay
      let left = cost;
      for (let i = 0; i < p.resources.length && left > 0; i++) {
        if (!p.resources[i].exhausted) { p.resources[i].exhausted = true; left--; }
      }
      const wasExhausted = res.exhausted;
      const inst = res.instance;
      p.resources[action.resourceIndex] = { instance: p.deck.shift(), exhausted: wasExhausted };
      p.playedThisPhase = p.playedThisPhase || [];
      p.playedThisPhase.push(inst.cardId);
      SB.log(state, { type: 'plotPlayed', player: itemStep.player, cardId: inst.cardId, sound: 'play' });
      if (card.type === 'unit') {
        const unit = SB.makeUnit(state, inst.cardId, itemStep.player);
        unit.uid = inst.uid;
        state[card.arena].push(unit);
        if (SB.hasKeyword(state, unit, 'shielded')) { unit.shields += 1; SB.log(state, { type: 'shield', uid: unit.uid, sound: 'shield' }); }
        if (SB.hasKeyword(state, unit, 'ambush')) {
          state.queue.push({ step: 'effect', controller: itemStep.player, ctx: { sourceUid: unit.uid, cardId: unit.cardId },
            op: { op: 'ambushAttack', target: null } });
        }
        SB.fireTriggers(state, 'onPlay', unit, { sourceUid: unit.uid });
      } else if (card.type === 'event') {
        p.discard.push(inst);
        const ab = (card.abilities || []).find(function (a) { return a.trigger === 'onPlay'; });
        if (ab) SB.queueEffects(state, itemStep.player, ab.effects, { cardId: inst.cardId, eventUid: inst.uid });
      } else if (card.type === 'upgrade') {
        // Attach: queue a pick for the attach target.
        state.queue.unshift({ step: 'plotAttachPick', player: itemStep.player, inst: inst });
      }
      // Offer further plot cards.
      state.queue.push({ step: 'plotOffer', player: itemStep.player });
    },
  };

  SB.queueSteps.plotAttachPick = {
    actions: function (state, itemStep) {
      const card = SB.card(itemStep.inst.cardId);
      const acts = [];
      SB.allUnits(state).forEach(function (u) {
        if (card.attachTo === 'friendly' && u.owner !== itemStep.player) return;
        if (card.attachTo === 'enemy' && u.owner === itemStep.player) return;
        if (card.attachFilter) {
          const f = card.attachFilter;
          const traits = SB.unitTraits(state, u);
          if (f.notTrait && traits.indexOf(f.notTrait) >= 0) return;
          if (f.trait && traits.indexOf(f.trait) < 0) return;
          if (f.uniqueOnly && !SB.card(u.cardId).unique) return;
        }
        acts.push({ type: 'plotAttach', player: itemStep.player, uid: u.uid });
      });
      return acts.length ? acts : null;
    },
    apply: function (state, itemStep, action) {
      const u = SB.findUnit(state, action.uid);
      if (!u) return;
      itemStep.inst.owner = itemStep.player;
      u.upgrades.push(itemStep.inst);
      SB.log(state, { type: 'attached', uid: u.uid, cardId: itemStep.inst.cardId, sound: 'attach' });
    },
  };

  // Attack with any number of other friendly units (even exhausted), units only.
  O.massAttack = function (state, item) {
    state.queue.unshift({ step: 'massAttackPick', player: item.controller, exceptUid: item.ctx && item.ctx.sourceUid });
  };
  SB.queueSteps.massAttackPick = {
    actions: function (state, itemStep) {
      const acts = [{ type: 'massAttackChoose', player: itemStep.player, uid: null }];
      SB.allUnits(state, itemStep.player).forEach(function (u) {
        if (u.uid === itemStep.exceptUid) return;
        if (u.massAttacked) return;
        if (SB.attackTargets(state, u).some(function (t) { return t.kind === 'unit'; })) {
          acts.push({ type: 'massAttackChoose', player: itemStep.player, uid: u.uid });
        }
      });
      return acts.length > 1 ? acts : null;
    },
    apply: function (state, itemStep, action) {
      if (action.uid == null) {
        SB.allUnits(state, itemStep.player).forEach(function (u) { delete u.massAttacked; });
        return;
      }
      const u = SB.findUnit(state, action.uid);
      if (!u) return;
      u.massAttacked = true;
      state.queue.unshift({ step: 'attackTargetChoice', player: itemStep.player, uid: u.uid,
        bonusPower: 0, firstStrike: false, ready: true, optional: false, unitsOnly: true });
      state.queue.push({ step: 'massAttackPick', player: itemStep.player, exceptUid: itemStep.exceptUid });
    },
  };

  // Capture any number of enemy non-leader units with combined remaining HP <= budget.
  O.captureBudget = function (state, item, target) {
    // target = the friendly captor (chosen by target selector with saveTargetAs upstream
    // or direct target).
    state.queue.unshift({ step: 'captureBudgetPick', player: item.controller,
      captorUid: target.uid, budget: item.op.budget });
  };
  SB.queueSteps.captureBudgetPick = {
    actions: function (state, itemStep) {
      const acts = [{ type: 'captureBudget', player: itemStep.player, uid: null }];
      SB.allUnits(state).forEach(function (u) {
        if (u.owner === itemStep.player) return;
        if (SB.card(u.cardId).type === 'leader') return;
        if (SB.unitRemainingHp(state, u) > itemStep.budget) return;
        acts.push({ type: 'captureBudget', player: itemStep.player, uid: u.uid });
      });
      return acts.length > 1 ? acts : null;
    },
    apply: function (state, itemStep, action) {
      if (action.uid == null) return;
      const victim = SB.findUnit(state, action.uid);
      const captor = SB.findUnit(state, itemStep.captorUid);
      if (!victim || !captor) return;
      const hp = SB.unitRemainingHp(state, victim);
      SB.collectBounties(state, victim);
      const arena = SB.arenaOf(state, victim);
      state[arena].splice(state[arena].indexOf(victim), 1);
      captor.captured = captor.captured || [];
      captor.captured.push({ uid: victim.uid, cardId: victim.cardId, owner: victim.owner, upgrades: victim.upgrades });
      SB.log(state, { type: 'captured', uid: victim.uid, cardId: victim.cardId, by: captor.uid, sound: 'capture' });
      const rest = itemStep.budget - hp;
      if (rest > 0) state.queue.unshift({ step: 'captureBudgetPick', player: itemStep.player,
        captorUid: itemStep.captorUid, budget: rest });
    },
  };

  // Look at an opponent's hand (revealed in the log).
  O.revealHand = function (state, item) {
    const opp = SB.other(item.controller);
    SB.log(state, { type: 'handRevealed', player: opp,
      cards: state.players[opp].hand.map(function (i) { return i.cardId; }), notice: true });
  };

  // Reveal the opponent's hand and discard one chosen card from it (see DEVIATIONS.md).
  O.discardFromOpponentHandChoice = function (state, item) {
    O.revealHand(state, item);
    state.queue.unshift({ step: 'discardChoice', player: SB.other(item.controller), forcedBy: item.controller, ctx: item.ctx });
  };

  // ---- queue steps handled by the engine loop (registered here) -----------
  SB.queueSteps = SB.queueSteps || {};

  SB.queueSteps.discardChoice = {
    actions: function (state, itemStep) {
      const p = state.players[itemStep.player];
      if (p.hand.length === 0) return null; // auto-skip
      const chooser = itemStep.forcedBy != null ? itemStep.forcedBy : itemStep.player;
      const acts = [];
      p.hand.forEach(function (inst, i) {
        if (itemStep.filter && itemStep.filter.type && SB.card(inst.cardId).type !== itemStep.filter.type) return;
        acts.push({ type: 'discardCard', player: chooser, targetPlayer: itemStep.player, handIndex: i });
      });
      return acts.length ? acts : null;
    },
    apply: function (state, itemStep, action) {
      const p = state.players[itemStep.player];
      const inst = p.hand.splice(action.handIndex, 1)[0];
      p.discard.push(inst);
      if (itemStep.ctx) {
        SB.efx(state, itemStep.ctx).lastDiscardedType = SB.card(inst.cardId).type;
        SB.efx(state, itemStep.ctx).lastDiscardedCost = SB.card(inst.cardId).cost;
      }
      SB.log(state, { type: 'discarded', player: itemStep.player, cardId: inst.cardId, sound: 'discard' });
      if (SB.fireLeaderTrigger) SB.fireLeaderTrigger(state, itemStep.player, 'onRevealOrDiscard', {});
      SB.allUnits(state, itemStep.player).forEach(function (u) {
        SB.fireTriggers(state, 'onRevealOrDiscard', u, { sourceUid: u.uid });
      });
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
        if (u) {
          SB.damageUnit(state, u, 1, {});
          if (itemStep.dealer != null && SB.findUnit(state, u.uid)) {
            SB.allUnits(state, itemStep.dealer).forEach(function (obs) {
              SB.fireTriggers(state, 'onIndirectUnitDamage', obs, { sourceUid: obs.uid, damagedUid: u.uid });
            });
          }
        }
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
        if (f.cardIs && f.cardIs.indexOf(c.id) < 0) return false;
        if (f.sharesAspectWithFriendly) {
          const mine = {};
          SB.allUnits(state, itemStep.player).forEach(function (u) {
            (SB.card(u.cardId).aspects || []).forEach(function (a) { mine[a] = true; });
          });
          if (!(c.aspects || []).some(function (a) { return mine[a]; })) return false;
        }
        if (f.hasPlot && !(c.keywords || []).some(function (k) { return k.k === 'plot'; })) return false;
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
        if (itemStep.playIt) {
          if (c.type !== 'unit') return;
          const cost = Math.max(0, SB.cardCost(state, itemStep.player, inst.cardId) - (itemStep.playDiscount || 0));
          if (cost > SB.readyResources(state, itemStep.player)) return;
          if (c.unique && SB.allUnits(state, itemStep.player).some(function (u) { return u.cardId === inst.cardId; })) return;
        }
        matches.push({ type: 'searchTake', player: itemStep.player, deckIndex: i });
      });
      if (matches.length === 0) return null; // shuffle happens in apply-skip
      matches.push({ type: 'searchTake', player: itemStep.player, deckIndex: -1 }); // decline
      return matches;
    },
    apply: function (state, itemStep, action) {
      const p = state.players[itemStep.player];
      const took = action.deckIndex >= 0;
      if (took && itemStep.playIt) {
        const inst = p.deck[action.deckIndex];
        SB.playCardWithMods(state, itemStep.player,
          { fromDeckIndex: action.deckIndex, cardId: inst.cardId }, { discount: itemStep.playDiscount });
      } else if (took) {
        const inst = p.deck.splice(action.deckIndex, 1)[0];
        p.hand.push(inst);
        SB.log(state, { type: 'searched', player: itemStep.player });
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
      SB.log(state, { type: 'deckShuffled', player: itemStep.player });
    },
  };

  // Grant an ability to a unit until end of round.
  O.grantAbilityTemp = function (state, item, target) {
    const u = SB.findUnit(state, target.uid);
    if (!u) return;
    u.tempAbilities = u.tempAbilities || [];
    u.tempAbilities.push(item.op.ability);
    SB.log(state, { type: 'gainedAbility', uid: u.uid, sound: 'buff' });
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
    SB.log(state, { type: 'attackModified', uid: item.ctx.sourceUid });
  };

  // Exhaust another friendly unit as a cost, then boost this attack.
  O.exhaustFriendlyForBonus = function (state, item, target) {
    const u = SB.findUnit(state, target.uid);
    if (!u || u.exhausted) return;
    u.exhausted = true;
    SB.log(state, { type: 'exhausted', uid: u.uid });
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
    SB.log(state, { type: 'resourced', player: item.controller });
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
      SB.log(state, { type: 'milledToHand', player: item.controller, sound: 'draw' });
    } else {
      p.discard.push(inst);
      SB.log(state, { type: 'milled', player: item.controller, cardId: inst.cardId });
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
    SB.log(state, { type: 'bonded', uid: src.uid, to: u.uid, sound: 'buff' });
  };

  // Temporary per-player cost discount for the next N matching cards this phase.
  O.grantDiscount = function (state, item) {
    const p = state.players[item.controller];
    p.discounts = p.discounts || [];
    p.discounts.push({ amount: item.op.amount, remaining: item.op.count || 1, filter: item.op.filter || {} });
    SB.log(state, { type: 'discountGranted', player: item.controller, sound: 'buff' });
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
        if (f.nonUnique && c.unique) return;
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
      SB.log(state, { type: 'tookFromDiscard', player: itemStep.player, sound: 'draw' });
    },
  };

  // Each player (controller first) defeats a non-leader unit they control.
  O.eachPlayerDefeatOwn = function (state, item) {
    state.queue.unshift({ step: 'defeatOwnPick', player: SB.other(item.controller) });
    if (!item.op.opponentOnly) state.queue.unshift({ step: 'defeatOwnPick', player: item.controller });
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
      SB.log(state, { type: 'exhausted', uid: u.uid });
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
      SB.log(state, { type: 'bottomedCard', player: itemStep.player });
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
      SB.log(state, { type: 'attached', uid: dst.uid, cardId: inst.cardId, sound: 'attach' });
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
      if (!SB.card(inst.cardId).token) state.players[SB.upgradeOwner(u, inst)].discard.push(inst);
      SB.log(state, { type: 'upgradeDefeated', uid: u.uid, cardId: inst.cardId, sound: 'destroy' });
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
      SB.log(state, { type: 'tookFromDiscard', player: itemStep.player, sound: 'draw' });
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
      let pool = SB.attackTargets(state, u);
      if (itemStep.unitsOnly) pool = pool.filter(function (t) { return t.kind === 'unit'; });
      if (pool.length === 0) return null;
      const acts = pool.map(function (t) {
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
      if (u && u.exhausted && !u.stunned) { u.exhausted = false; SB.log(state, { type: 'readied', uid: u.uid }); }
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
        SB.log(state, { type: 'peeked', player: itemStep.player });
      } else if (action.mode === 'bottom') {
        p.deck.shift(); p.deck.push(inst);
        SB.log(state, { type: 'peekBottomed', player: itemStep.player });
      } else if (action.mode === 'discard') {
        p.deck.shift(); p.discard.push(inst);
        SB.log(state, { type: 'discarded', player: itemStep.player, cardId: inst.cardId, sound: 'discard' });
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
        if (f.notAspect && (card.aspects || []).indexOf(f.notAspect) >= 0) return;
        if (f.requiresPenalty && SB.cardCost(state, itemStep.player, inst.cardId) <= card.cost) return;
        if (f.maxCostLtRef) {
          const lim = SB.efx(state, itemStep.ctx || {})[f.maxCostLtRef];
          if (lim == null || card.cost >= lim) return;
        }
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
      const grantAmbush = itemStep.withAmbush ||
        (itemStep.withAmbushIfCredit && state.lastPaymentUsedCredit);
      if (grantAmbush) {
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

  // What branch 'a' charges its controller up front. Card data usually says so with
  // an aGate {if:'canPay'}, but the cost is right there in the effects, so read it and
  // enforce it either way — a missing gate must not hand out a paid effect for free.
  SB.branchCost = function (branch) {
    return ((branch && branch.effects) || []).reduce(function (n, e) {
      return n + (e.op === 'spendResources' ? (e.amount || 0) : 0);
    }, 0);
  };
  SB.branchAffordable = function (state, player, branch) {
    return SB.readyResources(state, player) >= SB.branchCost(branch);
  };

  SB.queueSteps.binaryPick = {
    actions: function (state, itemStep) {
      const acts = [];
      if ((!itemStep.aGate || SB.checkCondition(state, itemStep.controller, itemStep.aGate, itemStep.ctx || {})) &&
          SB.branchAffordable(state, itemStep.controller, itemStep.a)) {
        acts.push({ type: 'binary', player: itemStep.player, pick: 'a' });
      }
      acts.push({ type: 'binary', player: itemStep.player, pick: 'b' });
      return acts;
    },
    apply: function (state, itemStep, action) {
      const branch = itemStep[action.pick];
      SB.log(state, { type: 'binaryChosen', player: itemStep.player, pick: action.pick });
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
        SB.log(state, { type: 'bountyCollected', uid: unit.uid, sound: 'claim' });
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
      SB.log(state, { type: 'rescued', uid: u.uid, cardId: u.cardId });
    });
    unit.captured = [];
  }
})(window.SB = window.SB || {});
