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
        if (sel.trait && (SB.unitDef(u).traits || []).indexOf(sel.trait) < 0 &&
            (SB.card(u.cardId).traits || []).indexOf(sel.trait) < 0) return;
        if (sel.maxCost != null && SB.card(u.cardId).cost > sel.maxCost) return;
        if (sel.damaged && u.damage === 0) return;
        if (sel.notSelf && u.uid === ctx.sourceUid) return;
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
  };

  SB.defeatUnit = function (state, unit, ctx) {
    const arena = SB.arenaOf(state, unit);
    const list = state[arena];
    const i = list.indexOf(unit);
    if (i < 0) return; // already gone (e.g. double-defeat in one resolution)
    list.splice(i, 1);
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
    // Upgrades go to their owner's discard (tokens vanish).
    unit.upgrades.forEach(function (inst) {
      if (!SB.card(inst.cardId).token) owner.discard.push(inst);
    });
    SB.fireTriggers(state, 'whenDefeated', unit, ctx);
  };

  SB.drawCards = function (state, playerIdx, n) {
    const p = state.players[playerIdx];
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
    sources.forEach(function (src) {
      (src.abilities || []).forEach(function (ab) {
        if (ab.trigger !== trigger) return;
        SB.queueEffects(state, unit.owner, ab.effects, {
          sourceUid: unit.uid, cardId: unit.cardId, condition: ab.condition,
        });
      });
    });
  };

  SB.queueEffects = function (state, controller, effects, ctx) {
    // Insert at the FRONT in order: effects of the newest trigger resolve before
    // previously queued items (nested-resolution ordering).
    const items = effects.map(function (op) {
      return { step: 'effect', controller: controller, op: op, ctx: ctx };
    });
    state.queue = items.concat(state.queue);
  };

  // --- conditions ----------------------------------------------------------

  SB.checkCondition = function (state, controller, cond, ctx) {
    if (!cond) return true;
    switch (cond.if) {
      case 'controlUnitWithTrait':
        return SB.allUnits(state, controller).some(function (u) {
          return (SB.unitDef(u).traits || []).indexOf(cond.trait) >= 0 && u.uid !== ctx.sourceUid;
        });
      case 'hasInitiative': return state.initiative === controller;
      case 'baseDamaged': return state.players[controller].base.damage > 0;
      default: throw new Error('unknown condition ' + cond.if);
    }
  };

  // --- op registry ---------------------------------------------------------

  // Each op handler: (state, item, target) -> void. `target` is null for untargeted
  // ops. Handlers run only after any required choice was made.
  SB.ops = {
    damage: function (state, item, target) {
      const amt = item.op.amount;
      if (target.kind === 'base') SB.damageBase(state, target.player, amt, 'effect');
      else {
        const u = SB.findUnit(state, target.uid);
        if (u) SB.damageUnit(state, u, amt, item.ctx);
      }
    },
    heal: function (state, item, target) {
      const amt = item.op.amount;
      if (target.kind === 'base') {
        const b = state.players[target.player].base;
        const healed = Math.min(amt, b.damage);
        b.damage -= healed;
        if (healed > 0) state.log.push({ type: 'baseHeal', player: target.player, amount: healed, sound: 'heal' });
      } else {
        const u = SB.findUnit(state, target.uid);
        if (u) {
          const healed = Math.min(amt, u.damage);
          u.damage -= healed;
          if (healed > 0) state.log.push({ type: 'unitHeal', uid: u.uid, amount: healed, sound: 'heal' });
        }
      }
    },
    draw: function (state, item) {
      SB.drawCards(state, item.controller, item.op.amount || 1);
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
      // Lasts for the round; cleared in regroup.
      const u = SB.findUnit(state, target.uid);
      if (u) {
        u.temp.power += (item.op.power || 0);
        u.temp.hp += (item.op.hp || 0);
        state.log.push({ type: 'buff', uid: u.uid, power: item.op.power || 0, hp: item.op.hp || 0, sound: 'buff' });
      }
    },
    defeat: function (state, item, target) {
      const u = SB.findUnit(state, target.uid);
      if (u) SB.defeatUnit(state, u, item.ctx);
    },
    exhaust: function (state, item, target) {
      const u = SB.findUnit(state, target.uid);
      if (u && !u.exhausted) { u.exhausted = true; state.log.push({ type: 'exhausted', uid: u.uid }); }
    },
    ready: function (state, item, target) {
      const u = SB.findUnit(state, target.uid);
      if (u && u.exhausted) { u.exhausted = false; state.log.push({ type: 'readied', uid: u.uid }); }
    },
    returnHand: function (state, item, target) {
      const u = SB.findUnit(state, target.uid);
      if (!u) return;
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
        if (!SB.card(inst.cardId).token) owner.discard.push(inst);
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
      const handler = SB.ops[op.op];
      if (!handler) throw new Error('unknown op ' + op.op);

      if (op.target) {
        const cands = SB.selectorCandidates(state, item.controller, op.target, item.ctx || {});
        if (cands.length === 0) {
          state.queue.shift();
          state.log.push({ type: 'fizzle', why: 'noTargets', cardId: item.ctx && item.ctx.cardId, fizzled: true });
          continue;
        }
        if (cands.length === 1 && !op.target.optional) {
          state.queue.shift();
          handler(state, item, cands[0]);
          continue;
        }
        item.candidates = cands; // legalActions will offer 'choose' (and 'declineChoice' if optional)
        return;
      }
      state.queue.shift();
      handler(state, item, null);
    }
  };
})(window.SB = window.SB || {});
