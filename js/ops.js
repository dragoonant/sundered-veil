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
    cands.forEach(function (c) {
      const u = SB.findUnit(state, c.uid);
      if (u) { u.temp.power += (item.op.power || 0); u.temp.hp += (item.op.hp || 0); }
    });
    state.log.push({ type: 'buffAll', power: item.op.power || 0, hp: item.op.hp || 0, sound: 'buff' });
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
      if (action.deckIndex >= 0) {
        const inst = p.deck.splice(action.deckIndex, 1)[0];
        p.hand.push(inst);
        state.log.push({ type: 'searched', player: itemStep.player });
      }
      // Shuffle after searching (seeded).
      p.deck = SB.shuffled(p.deck, SB.rng(SB.stateSeed(state, 'searchShuffle')));
      state.log.push({ type: 'deckShuffled', player: itemStep.player });
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
