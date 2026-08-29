// effects.js — the effect-op interpreter and target selectors.
// Depends on: util.js, rules.js. Mutates only states already cloned by engine.apply.
//
// Ability schema (in card data):
//   ability = { trigger, condition?, effects: [op, ...] }
//   op = { op: '<opName>', target?: selector, amount?, ... , then?: [op...], else?: [op...] }
//   selector = { who: 'enemy'|'friendly'|'any', what: 'unit'|'base'|'unitOrBase',
//                arena?, trait?, maxCost?, damaged?, optional?, self? }
// Triggers: 'onPlay', 'onAttack', 'whenDefeated', 'onRegroup', 'action' (activated).
//
// Resolution model: engine pushes queue items {step:'effect', controller, op, ctx}.
// SB.drainQueue advances the queue until a player choice is required or it empties.
// A choice is surfaced by leaving the item at queue[0] with .candidates filled in;
// engine.legalActions turns candidates into {type:'choose'} actions.
(function (SB) {
  'use strict';

  // --- selectors -----------------------------------------------------------

  // Enumerate concrete targets for a selector from the controller's perspective.
  // Targets are {kind:'unit', uid} or {kind:'base', player}.
  SB.selectorCandidates = function (state, controller, sel, ctx) {
    const out = [];
    if (sel.self) return [{ kind: 'unit', uid: ctx.sourceUid }];
    const wantUnit = sel.what === 'unit' || sel.what === 'unitOrBase';
    const wantBase = sel.what === 'base' || sel.what === 'unitOrBase';
    if (wantUnit) {
      SB.allUnits(state).forEach(function (u) {
        if (sel.who === 'friendly' && u.owner !== controller) return;
        if (sel.who === 'enemy' && u.owner === controller) return;
        if (sel.arena && SB.arenaOf(state, u) !== sel.arena) return;
        if (sel.trait && SB.unitTraits(state, u).indexOf(sel.trait) < 0) return;
        if (sel.traitOrCards) {
          const okT = SB.unitTraits(state, u).indexOf(sel.traitOrCards.trait) >= 0;
          const okC = (sel.traitOrCards.cards || []).indexOf(u.cardId) >= 0;
          if (!okT && !okC) return;
        }
        if (sel.tokenOnly && !SB.card(u.cardId).token) return;
        if (sel.noPilot && SB.pilotCount(state, u) > 0) return;
        if (sel.anyTrait && !sel.anyTrait.some(function (tr) { return SB.unitTraits(state, u).indexOf(tr) >= 0; })) return;
        if (sel.pilotish) {
          const isPilot = SB.unitTraits(state, u).indexOf('tr30') >= 0;
          if (!isPilot && SB.pilotCount(state, u) === 0) return;
        }
        if (sel.maxCost != null && SB.card(u.cardId).cost > sel.maxCost) return;
        if (sel.minCost != null && SB.card(u.cardId).cost < sel.minCost) return;
        if (sel.minPower != null && SB.unitPower(state, u) < sel.minPower) return;
        if (sel.maxPower != null && SB.unitPower(state, u) > sel.maxPower) return;
        if (sel.maxCostRefPlayed) {
          const pc = ctx.playedCardId ? SB.card(ctx.playedCardId).cost : null;
          if (pc == null || SB.card(u.cardId).cost > pc) return;
        }
        if (sel.powerLessThanSource) {
          const src = SB.findUnit(state, ctx.sourceUid);
          if (!src || SB.unitPower(state, u) >= SB.unitPower(state, src)) return;
        }
        if (sel.damaged && u.damage === 0) return;
        if (sel.notSelf && u.uid === ctx.sourceUid) return;
        if (sel.aspect && (SB.card(u.cardId).aspects || []).indexOf(sel.aspect) < 0) return;
        if (sel.notTrait && SB.unitTraits(state, u).indexOf(sel.notTrait) >= 0) return;
        if (sel.maxRemHp != null && SB.unitRemainingHp(state, u) > sel.maxRemHp) return;
        if (sel.nonLeader && SB.card(u.cardId).type === 'leader') return;
        if (sel.leader && SB.card(u.cardId).type !== 'leader') return;
        if (sel.nonUnique && SB.card(u.cardId).unique) return;
        if (sel.playedThisRound && u.enteredRound !== state.round) return;
        if (sel.exhaustedOnly && !u.exhausted) return;
        if (sel.readyOnly && u.exhausted) return;
        if (sel.cardIs && sel.cardIs.indexOf(u.cardId) < 0) return;
        if (sel.token === false && SB.card(u.cardId).token) return;
        if (sel.notSavedAs) {
          const names = Array.isArray(sel.notSavedAs) ? sel.notSavedAs : [sel.notSavedAs];
          const store = SB.efx(state, ctx);
          if (names.some(function (n) { const t = store[n]; return t && t.uid === u.uid; })) return;
        }
        out.push({ kind: 'unit', uid: u.uid });
      });
    }
    if (wantBase) {
      [0, 1].forEach(function (p) {
        if (sel.who === 'friendly' && p !== controller) return;
        if (sel.who === 'enemy' && p === controller) return;
        out.push({ kind: 'base', player: p });
      });
    }
    return out;
  };

  // --- damage / defeat plumbing -------------------------------------------

  SB.damageBase = function (state, playerIdx, amount, why) {
    if (amount <= 0) return;
    const base = state.players[playerIdx].base;
    base.damage += amount;
    state.log.push({ type: 'baseDamage', player: playerIdx, amount: amount, why: why || null, sound: 'hit' });
    const hp = SB.card(base.cardId).hp;
    if (base.damage >= hp && state.winner == null) {
      state.winner = SB.other(playerIdx);
      state.phase = 'done';
      state.log.push({ type: 'gameOver', winner: state.winner });
    }
  };

  // Deal damage to a unit from a source; shields absorb whole hits.
  SB.damageUnit = function (state, unit, amount, ctx) {
    if (amount <= 0) return;
    if (unit.shields > 0) {
      unit.shields -= 1;
      state.log.push({ type: 'shieldPopped', uid: unit.uid, sound: 'shield' });
      return;
    }
    unit.damage += amount;
    state.log.push({ type: 'unitDamage', uid: unit.uid, amount: amount, sound: 'hit' });
    if (unit.damage >= SB.unitMaxHp(state, unit)) SB.defeatUnit(state, unit, ctx);
    else if (ctx && ctx.combat) SB.fireTriggers(state, 'whenCombatDamaged', unit, { sourceUid: unit.uid });
  };

  SB.defeatUnit = function (state, unit, ctx) {
    const arena = SB.arenaOf(state, unit);
    const list = state[arena];
    const i = list.indexOf(unit);
    if (i < 0) return; // already gone (e.g. double-defeat in one resolution)
    list.splice(i, 1);
    state.defeatedThisPhase = state.defeatedThisPhase || [];
    state.defeatedThisPhase.push({ uid: unit.uid, owner: unit.owner, cardId: unit.cardId });
    state.log.push({ type: 'defeated', uid: unit.uid, cardId: unit.cardId, sound: 'destroy' });
    const card = SB.card(unit.cardId);
    const owner = state.players[unit.owner];
    if (card.type === 'leader') {
      // Deployed leader flips back to leader side, exhausted, healed.
      owner.leader.deployed = false;
      owner.leader.exhausted = true;
      owner.leader.damage = 0;
      owner.leader.uid = null;
    } else if (!card.token) {
      owner.discard.push({ uid: unit.uid, cardId: unit.cardId });
    }
    // Upgrades go to their owner's discard (tokens vanish; leader pilots flip back).
    unit.upgrades.forEach(function (inst) {
      if (inst.leaderPilot) {
        const lp = state.players[unit.owner].leader;
        lp.deployed = false; lp.exhausted = true; lp.damage = 0; lp.uid = null;
        state.log.push({ type: 'leaderReturned', player: unit.owner });
      } else if (!SB.card(inst.cardId).token) owner.discard.push(inst);
    });
    SB.fireTriggers(state, 'whenDefeated', unit, ctx);
  };

  SB.drawCards = function (state, playerIdx, n) {
    const p = state.players[playerIdx];
    // "When an opponent draws during the action phase" observers.
    if (state.phase === 'action' && n > 0 && !state._drawObserverGuard) {
      state._drawObserverGuard = true;
      SB.allUnits(state, SB.other(playerIdx)).forEach(function (u) {
        SB.fireTriggers(state, 'onOpponentDraw', u, { sourceUid: u.uid });
      });
      delete state._drawObserverGuard;
    }
    for (let i = 0; i < n; i++) {
      if (p.deck.length === 0) {
        // Decked: 3 damage to your base per card you fail to draw.
        state.log.push({ type: 'deckedOut', player: playerIdx });
        SB.damageBase(state, playerIdx, 3, 'decked');
      } else {
        p.hand.push(p.deck.shift());
        state.log.push({ type: 'draw', player: playerIdx });
      }
    }
  };

  // Queue an ability's effects (in order) for a trigger on a unit.
  SB.fireTriggers = function (state, trigger, unit, ctx) {
    const def = SB.unitDef(unit);
    const sources = [def].concat(unit.upgrades.map(function (i) { return SB.card(i.cardId); }));
    if (unit.tempAbilities) sources.push({ abilities: unit.tempAbilities });
    sources.forEach(function (src) {
      (src.abilities || []).forEach(function (ab) {
        if (ab.trigger !== trigger) return;
        if (ab.playedTrait && (!ctx || !ctx.playedCardId ||
            (SB.card(ctx.playedCardId).traits || []).indexOf(ab.playedTrait) < 0)) return;
        SB.queueEffects(state, unit.owner, ab.effects, {
          sourceUid: unit.uid, cardId: unit.cardId, condition: ab.condition,
          playedCardId: ctx && ctx.playedCardId,
        });
      });
    });
  };

  SB.queueEffects = function (state, controller, effects, ctx) {
    // Insert at the FRONT in order: effects of the newest trigger resolve before
    // previously queued items (nested-resolution ordering). Each invocation gets an
    // id so ops can share saved targets/amounts via state.efx (ctx objects are
    // cloned apart by apply(), so shared data cannot live on ctx itself).
    ctx = ctx || {};
    if (ctx.inv == null) { ctx.inv = state.nextUid++; }
    const items = effects.map(function (op) {
      return { step: 'effect', controller: controller, op: op, ctx: ctx };
    });
    state.queue = items.concat(state.queue);
  };

  SB.efx = function (state, ctx) {
    state.efx = state.efx || {};
    const key = String(ctx && ctx.inv != null ? ctx.inv : 0);
    return state.efx[key] = state.efx[key] || {};
  };

  // Amount resolution: literal op.amount, or op.amountRef into the invocation store
  // / combat context. Refs: 'lastHealed', 'excess', 'powerOf:<name>',
  // 'friendlyInTargetArena'.
  SB.resolveAmount = function (state, item, target) {
    const op = item.op;
    if (op.amountRef == null) return op.amount;
    const store = SB.efx(state, item.ctx);
    if (op.amountRef === 'lastHealed') return store.lastHealed || 0;
    if (op.amountRef === 'excess') return (item.ctx && item.ctx.excess) || 0;
    if (op.amountRef === 'friendlyInTargetArena') {
      if (!target || target.kind !== 'unit') return 0;
      const u = SB.findUnit(state, target.uid);
      if (!u) return 0;
      const arena = SB.arenaOf(state, u);
      return state[arena].filter(function (x) { return x.owner === item.controller; }).length;
    }
    if (op.amountRef === 'oddFriendlyCount') {
      let n = 0;
      SB.allUnits(state, item.controller).forEach(function (u) {
        const c = SB.card(u.cardId).cost;
        if (c != null && c % 2 === 1) n++;
        u.upgrades.forEach(function (inst) {
          const uc = SB.card(inst.cardId).cost;
          if (uc != null && uc % 2 === 1) n++;
        });
      });
      return n;
    }
    if (op.amountRef === 'targetRemHpMinus1') {
      const u = target && target.kind === 'unit' ? SB.findUnit(state, target.uid) : null;
      return u ? Math.max(0, SB.unitRemainingHp(state, u) - 1) : 0;
    }
    const st = op.amountRef.match(/^stored:(.+)$/);
    if (st) return SB.efx(state, item.ctx)[st[1]] || 0;
    if (op.amountRef === 'distinctDiscardCosts') {
      const costs = new Set();
      state.players[item.controller].discard.forEach(function (inst) {
        const c = SB.card(inst.cardId).cost;
        if (c != null) costs.add(c);
      });
      return costs.size;
    }
    const m = op.amountRef.match(/^powerOf:(.+)$/);
    if (m) {
      const t = store[m[1]];
      const u = t && t.kind === 'unit' ? SB.findUnit(state, t.uid) : null;
      return u ? SB.unitPower(state, u) : 0;
    }
    throw new Error('unknown amountRef ' + op.amountRef);
  };

  // Central op execution: saved-target reuse + save-after + handler dispatch.
  const DAMAGE_OPS = ['damage', 'damageAll', 'dividedDamage', 'damageOwnBase', 'damagePerExploited'];
  SB.execOp = function (state, item, target) {
    if (item.op.saveTargetAs && target) SB.efx(state, item.ctx)[item.op.saveTargetAs] = target;
    SB.ops[item.op.op](state, item, target);
    // "When you deal non-combat damage" leader observers (fires once per damage op).
    if (DAMAGE_OPS.indexOf(item.op.op) >= 0 && SB.fireLeaderTrigger && !state._ncdGuard) {
      state._ncdGuard = true;
      SB.fireLeaderTrigger(state, item.controller, 'onNonCombatDamage', {});
      delete state._ncdGuard;
    }
  };

  // --- conditions ----------------------------------------------------------

  SB.checkCondition = function (state, controller, cond, ctx) {
    if (!cond) return true;
    // Generic negation: {if:'x', not:true} — except 'saved', which handles its own.
    if (cond.not && cond.if !== 'saved') {
      return !SB.checkCondition(state, controller, Object.assign({}, cond, { not: false }), ctx);
    }
    switch (cond.if) {
      case 'savedHasTrait': {
        const t = SB.efx(state, ctx)[cond.name];
        const u = t && t.kind === 'unit' ? SB.findUnit(state, t.uid) : null;
        return !!u && SB.unitTraits(state, u).indexOf(cond.trait) >= 0;
      }
      case 'bearerHasTrait': {
        const bearer = SB.findUnit(state, ctx.sourceUid);
        return !!bearer && SB.unitTraits(state, bearer).indexOf(cond.trait) >= 0;
      }
      case 'controlUnitWithTrait':
        return SB.allUnits(state, controller).some(function (u) {
          return SB.unitTraits(state, u).indexOf(cond.trait) >= 0 && u.uid !== ctx.sourceUid;
        });
      case 'hasInitiative': return state.initiative === controller;
      case 'baseDamaged': return state.players[controller].base.damage > 0;
      case 'enemyBaseDamaged': return state.players[SB.other(controller)].base.damage > 0;
      case 'resourcesAtLeast': return state.players[controller].resources.length >= cond.n;
      case 'playedAspectThisPhase':
        return (state.players[controller].playedThisPhase || []).some(function (cid) {
          return (SB.card(cid).aspects || []).indexOf(cond.aspect) >= 0;
        });
      case 'playedCardThisPhase': return (state.players[controller].playedThisPhase || []).length > 0;
      case 'friendlyDefeatedThisPhase': return (state.defeatedThisPhase || []).some(function (d) { return d.owner === controller; });
      case 'attachedIs': {
        // Context: upgrade ability; ctx.sourceUid is the bearer unit.
        const bearer = SB.findUnit(state, ctx.sourceUid);
        return !!bearer && cond.cards.indexOf(bearer.cardId) >= 0;
      }
      case 'controlCard':
        // Leader (either side), unit, or attached upgrade with one of these ids.
        return cond.cards.some(function (cid) {
          if (SB.allUnits(state, controller).some(function (u) {
            return u.cardId === cid || u.upgrades.some(function (inst) { return inst.cardId === cid; });
          })) return true;
          return state.players[controller].leader.cardId === cid;
        });
      case 'milledNonUnit': {
        const st = SB.efx(state, ctx);
        return st.milledTypes && st.milledTypes.length > 0 &&
          st.milledTypes.every(function (t) { return t !== 'unit'; });
      }
      case 'saved': {
        const has = SB.efx(state, ctx)[cond.name] != null;
        return cond.not ? !has : has;
      }
      case 'controlOtherSpaceUnit':
        return state.space.filter(function (u) { return u.owner === controller && u.uid !== ctx.sourceUid; }).length > 0;
      case 'discardedUnit':
        return SB.efx(state, ctx).lastDiscardedType === 'unit';
      case 'enemyUnitDamaged':
        return SB.allUnits(state, SB.other(controller)).some(function (u) { return u.damage > 0; });
      case 'opponentMoreSpaceUnits': {
        const mine = state.space.filter(function (u) { return u.owner === controller; }).length;
        const theirs = state.space.filter(function (u) { return u.owner !== controller; }).length;
        return theirs > mine;
      }
      case 'milledOddCost': {
        const st = SB.efx(state, ctx);
        return (st.milledCosts || []).some(function (c) { return c != null && c % 2 === 1; });
      }
      case 'coordinate':
        return SB.allUnits(state, controller).length >= 3;
      case 'baseDamageAtLeast':
        return state.players[controller].base.damage >= cond.n;
      case 'controlsTokenUnit':
        return SB.allUnits(state, controller).some(function (u) { return SB.card(u.cardId).token; });
      case 'controlUnitWithAspect':
        return SB.allUnits(state, controller).some(function (u) {
          if (!cond.includeSelf && u.uid === ctx.sourceUid) return false;
          return (SB.card(u.cardId).aspects || []).indexOf(cond.aspect) >= 0;
        });
      case 'bountyUnitUnique':
        return !!(ctx.bountyCardId && SB.card(ctx.bountyCardId).unique);
      case 'defenderHasBounty': {
        const t = ctx.attackTarget;
        const u = t && t.kind === 'unit' ? SB.findUnit(state, t.uid) : null;
        if (!u) return false;
        const sources = [SB.unitDef(u)].concat(u.upgrades.map(function (i2) { return SB.card(i2.cardId); }));
        if (u.tempAbilities) sources.push({ abilities: u.tempAbilities });
        return sources.some(function (s) {
          return (s.abilities || []).some(function (ab) { return ab.trigger === 'bounty'; });
        });
      }
      case 'selfUpgraded': {
        const self = SB.findUnit(state, ctx.sourceUid);
        return !!self && self.upgrades.length > 0;
      }
      case 'savedIsUnique': {
        const t = SB.efx(state, ctx)[cond.name];
        const u = t && t.kind === 'unit' ? SB.findUnit(state, t.uid) : null;
        return !!u && !!SB.card(u.cardId).unique;
      }
      case 'selfDamaged': {
        const self = SB.findUnit(state, ctx.sourceUid);
        return !!self && self.damage > 0;
      }
      case 'controlMoreUnitsThanOpponent':
        return SB.allUnits(state, controller).length > SB.allUnits(state, SB.other(controller)).length;
      default: throw new Error('unknown condition ' + cond.if);
    }
  };

  // --- op registry ---------------------------------------------------------

  // Each op handler: (state, item, target) -> void. `target` is null for untargeted
  // ops. Handlers run only after any required choice was made.
  SB.ops = {
    damage: function (state, item, target) {
      const amt = SB.resolveAmount(state, item, target);
      if (target.kind === 'base') SB.damageBase(state, target.player, amt, 'effect');
      else {
        const u = SB.findUnit(state, target.uid);
        if (u) SB.damageUnit(state, u, amt, item.ctx);
      }
    },
    heal: function (state, item, target) {
      const amt = SB.resolveAmount(state, item, target);
      let healed = 0;
      if (target.kind === 'base') {
        const b = state.players[target.player].base;
        healed = Math.min(amt, b.damage);
        b.damage -= healed;
        if (healed > 0) state.log.push({ type: 'baseHeal', player: target.player, amount: healed, sound: 'heal' });
      } else {
        const u = SB.findUnit(state, target.uid);
        if (u) {
          healed = Math.min(amt, u.damage);
          u.damage -= healed;
          if (healed > 0) {
            state.log.push({ type: 'unitHeal', uid: u.uid, amount: healed, sound: 'heal' });
            SB.fireTriggers(state, 'whenHealed', u, { sourceUid: u.uid });
          }
        }
      }
      SB.efx(state, item.ctx).lastHealed = healed;
    },
    draw: function (state, item) {
      let who = item.controller;
      if (item.op.who === 'opponent') who = SB.other(item.controller);
      if (item.op.who === 'targetOwner') {
        const t = SB.efx(state, item.ctx)[item.op.ofSaved];
        const u = t && t.kind === 'unit' ? SB.findUnit(state, t.uid) : null;
        if (u) who = u.owner; else if (t && t.kind === 'base') who = t.player; else return;
      }
      SB.drawCards(state, who, item.op.amount || 1);
    },
    healFull: function (state, item, target) {
      const u = SB.findUnit(state, target.uid);
      if (u && u.damage > 0) {
        state.log.push({ type: 'unitHeal', uid: u.uid, amount: u.damage, sound: 'heal' });
        u.damage = 0;
      }
    },
    stunExhaust: function (state, item, target) {
      // Exhaust and prevent readying this round (including regroup).
      const u = SB.findUnit(state, target.uid);
      if (!u) return;
      u.exhausted = true;
      u.stunned = true;
      state.log.push({ type: 'stunned', uid: u.uid, sound: 'ability' });
    },
    opponentMayReady: function (state, item) {
      state.queue.unshift({ step: 'mayReadyOwn', player: SB.other(item.controller) });
    },
    shield: function (state, item, target) {
      const u = SB.findUnit(state, target.uid);
      if (u) { u.shields += (item.op.amount || 1); state.log.push({ type: 'shield', uid: u.uid, sound: 'shield' }); }
    },
    experience: function (state, item, target) {
      const u = SB.findUnit(state, target.uid);
      if (u) { u.experience += (item.op.amount || 1); state.log.push({ type: 'experience', uid: u.uid, sound: 'buff' }); }
    },
    buffTemp: function (state, item, target) {
      // Lasts for the round; cleared in regroup. A negative HP change can defeat.
      const u = SB.findUnit(state, target.uid);
      if (u) {
        u.temp.power += (item.op.power || 0);
        u.temp.hp += (item.op.hp || 0);
        state.log.push({ type: 'buff', uid: u.uid, power: item.op.power || 0, hp: item.op.hp || 0, sound: 'buff' });
        if (SB.unitRemainingHp(state, u) <= 0) SB.defeatUnit(state, u, item.ctx);
      }
    },
    defeat: function (state, item, target) {
      const u = SB.findUnit(state, target.uid);
      if (!u) return;
      if (u.owner !== item.controller &&
          (SB.unitDef(u).staticFlags || []).indexOf('noEnemyDefeatReturn') >= 0) {
        state.log.push({ type: 'fizzle', why: 'immune', fizzled: true });
        return;
      }
      SB.defeatUnit(state, u, item.ctx);
    },
    exhaust: function (state, item, target) {
      const u = SB.findUnit(state, target.uid);
      if (u && !u.exhausted) { u.exhausted = true; state.log.push({ type: 'exhausted', uid: u.uid }); }
    },
    ready: function (state, item, target) {
      const u = SB.findUnit(state, target.uid);
      if (u && u.exhausted && !u.stunned) { u.exhausted = false; state.log.push({ type: 'readied', uid: u.uid }); }
    },
    returnHand: function (state, item, target) {
      const u = SB.findUnit(state, target.uid);
      if (!u) return;
      if (u.owner !== item.controller &&
          (SB.unitDef(u).staticFlags || []).indexOf('noEnemyDefeatReturn') >= 0) {
        state.log.push({ type: 'fizzle', why: 'immune', fizzled: true });
        return;
      }
      const arena = SB.arenaOf(state, u);
      state[arena].splice(state[arena].indexOf(u), 1);
      const card = SB.card(u.cardId);
      const owner = state.players[u.owner];
      if (card.type === 'leader') {
        owner.leader.deployed = false; owner.leader.exhausted = true;
        owner.leader.damage = 0; owner.leader.uid = null;
      } else if (!card.token) {
        owner.hand.push({ uid: u.uid, cardId: u.cardId });
      }
      u.upgrades.forEach(function (inst) {
        if (inst.leaderPilot) {
          const lp = state.players[u.owner].leader;
          lp.deployed = false; lp.exhausted = true; lp.damage = 0; lp.uid = null;
        } else if (!SB.card(inst.cardId).token) owner.discard.push(inst);
      });
      state.log.push({ type: 'returnedToHand', uid: u.uid, cardId: u.cardId });
    },
  };

  // --- queue driver --------------------------------------------------------

  // Advance queue[0] as far as possible. Returns when the queue is empty or the
  // head item needs a player choice (head.candidates set).
  SB.drainQueue = function (state) {
    while (state.queue.length > 0 && state.winner == null) {
      const item = state.queue[0];
      if (item.candidates) return; // waiting on a choice

      if (item.step !== 'effect') return; // setup/combat steps handled by engine

      const op = item.op;
      if (item.ctx && item.ctx.condition &&
          !SB.checkCondition(state, item.controller, item.ctx.condition, item.ctx)) {
        state.queue.shift();
        state.log.push({ type: 'fizzle', why: 'condition', cardId: item.ctx.cardId, fizzled: true });
        continue;
      }
      // Per-op condition (in addition to the ability-level one).
      if (op.condition && !SB.checkCondition(state, item.controller, op.condition, item.ctx || {})) {
        state.queue.shift();
        state.log.push({ type: 'fizzle', why: 'condition', cardId: item.ctx && item.ctx.cardId, fizzled: true });
        continue;
      }
      const handler = SB.ops[op.op];
      if (!handler) throw new Error('unknown op ' + op.op);

      // Reuse a target chosen by an earlier op of this invocation.
      if (op.useTarget) {
        state.queue.shift();
        const t = op.useTarget === '@defender'
          ? (item.ctx && item.ctx.attackTarget && item.ctx.attackTarget.kind === 'unit' ? item.ctx.attackTarget : null)
          : SB.efx(state, item.ctx)[op.useTarget];
        if (!t) {
          state.log.push({ type: 'fizzle', why: 'noSavedTarget', cardId: item.ctx && item.ctx.cardId, fizzled: true });
          continue;
        }
        SB.execOp(state, item, t);
        continue;
      }

      if (op.target) {
        const cands = SB.selectorCandidates(state, item.controller, op.target, item.ctx || {});
        if (cands.length === 0) {
          state.queue.shift();
          state.log.push({ type: 'fizzle', why: 'noTargets', cardId: item.ctx && item.ctx.cardId, fizzled: true });
          continue;
        }
        if (cands.length === 1 && !op.target.optional) {
          state.queue.shift();
          SB.execOp(state, item, cands[0]);
          continue;
        }
        item.candidates = cands; // legalActions will offer 'choose' (and 'declineChoice' if optional)
        return;
      }
      state.queue.shift();
      SB.execOp(state, item, null);
    }
  };
})(window.SB = window.SB || {});
