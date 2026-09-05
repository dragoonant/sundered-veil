// ops2.js — second op vocabulary, added for the competitive-deck expansion. Loads after
// ops.js and before validate.js. Registers into SB.ops / SB.queueSteps, and extends the
// condition, amount-ref and selector vocabularies through the hook tables effects.js
// consults before throwing (SB.extraConditions, SB.extraAmounts, SB.extraSelector).
// Every op here has a describer in text.js and a test in tests/test-expansion.js.
(function (SB) {
  'use strict';
  const O = SB.ops;
  const S = SB.queueSteps;

  // ---- helpers --------------------------------------------------------------
  function saved(state, ctx, name) { return SB.efx(state, ctx)[name]; }
  function savedUnit(state, ctx, name) {
    const t = saved(state, ctx, name);
    return t && t.kind === 'unit' ? SB.findUnit(state, t.uid) : null;
  }
  function unitOwnerOrPlayer(state, t) {
    if (!t) return null;
    if (t.kind === 'base') return t.player;
    const u = SB.findUnit(state, t.uid);
    return u ? u.owner : null;
  }
  function pushDiscardInst(state, playerIdx, inst) {
    state.players[playerIdx].discard.push(inst);
    SB.noteDiscarded(state, playerIdx, inst);
  }
  // Discards made this phase (uids) — shd-135-style discard actions read it.
  SB.noteDiscarded = function (state, playerIdx, inst) {
    const p = state.players[playerIdx];
    p.discardedThisPhase = p.discardedThisPhase || [];
    p.discardedThisPhase.push(inst.uid);
  };

  // All abilities a unit currently carries, in a stable order: its own definition
  // (deployed side for leaders), each upgrade (pilot cards contribute only their
  // pilot-side abilities; leader pilots their pilotSide block), granted temporaries,
  // and auras from other units. Used by trigger firing AND by the action enumerator,
  // so an upgrade-granted "Action:" is offered like a printed one.
  SB.unitAllAbilities = function (state, unit) {
    const out = [];
    const def = SB.unitDef(unit);
    if (unit.abilitiesSuppressed || SB.nameSilenced(state, unit.owner, unit.cardId)) return out;
    (def.abilities || []).forEach(function (ab) { if (!ab.asPilotOnly) out.push(ab); });
    unit.upgrades.forEach(function (inst) {
      const c = SB.card(inst.cardId);
      if (inst.leaderPilot) {
        ((c.pilotSide && c.pilotSide.abilities) || []).forEach(function (ab) { out.push(ab); });
        return;
      }
      if (SB.nameSilenced(state, SB.upgradeOwner(unit, inst), inst.cardId)) return;
      (c.abilities || []).forEach(function (ab) { if (!ab.asUnitOnly) out.push(ab); });
    });
    (unit.tempAbilities || []).forEach(function (ab) { out.push(ab); });
    SB.auraGrants(state, unit).forEach(function (g) {
      (g.abilities || []).forEach(function (ab) { out.push(ab); });
    });
    return out;
  };

  // "Name a card" effects (see DEVIATIONS.md): the unit remembers a card id and either
  // blocks the opponent from playing it or silences every copy the opponent owns.
  SB.nameSilenced = function (state, ownerIdx, cardId) {
    if (!state || ownerIdx == null) return false;
    return SB.allUnits(state, SB.other(ownerIdx)).some(function (u) {
      return u.namedCard === cardId && u.namedMode === 'silence';
    });
  };
  SB.nameBlocked = function (state, ownerIdx, cardId) {
    return SB.allUnits(state, SB.other(ownerIdx)).some(function (u) {
      return u.namedCard === cardId && u.namedMode === 'block';
    });
  };

  // ---- aura extensions: lost keywords, dynamic stats, numeric keyword auras ------
  // Re-entrancy guard: an aura's condition or scope may read power, keywords or
  // traits, which read auras again. Nested lookups see printed values only (the same
  // rule ops.js applies to trait grants), so the recursion bottoms out.
  const prevAuraGrants = SB.auraGrants;
  let auraDepth = 0;
  SB.auraGrants = function (state, unit) {
    if (auraDepth > 0) return [];
    auraDepth++;
    try { return prevAuraGrants(state, unit); } finally { auraDepth--; }
  };
  const prevHasKeyword = SB.hasKeyword;
  SB.hasKeyword = function (state, unit, k) {
    if (unit.abilitiesSuppressed) return false;
    let lost = false;
    SB.auraGrants(state, unit).forEach(function (g) {
      if (g.loseKeywords && g.loseKeywords.indexOf(k) >= 0) lost = true;
    });
    if (lost) return false;
    if (prevHasKeyword(state, unit, k)) return true;
    return (unit.tempKeywordNs || []).some(function (kw) { return kw.k === k; });
  };
  const prevKeywordTotal = SB.keywordTotal;
  SB.keywordTotal = function (state, unit, k) {
    let n = prevKeywordTotal(state, unit, k);
    (unit.tempKeywordNs || []).forEach(function (kw) { if (kw.k === k) n += kw.n || 0; });
    SB.auraGrants(state, unit).forEach(function (g) {
      if (g.dynamicKeyword && g.dynamicKeyword.k === k) n += dynamicCount(state, unit, g.dynamicKeyword.per);
    });
    return n;
  };
  function dynamicCount(state, unit, kind) {
    if (kind === 'damagedEnemyUnits') return SB.allUnits(state, SB.other(unit.owner)).filter(function (u) { return u.damage > 0; }).length;
    if (kind === 'otherFriendlySpace') return state.space.filter(function (u) { return u.owner === unit.owner && u.uid !== unit.uid; }).length;
    if (kind === 'upgradesOnSelf') return unit.upgrades.length;
    return 0;
  }
  const prevPower = SB.unitPower, prevMaxHp = SB.unitMaxHp;
  SB.unitPower = function (state, unit) {
    let p = prevPower(state, unit);
    SB.auraGrants(state, unit).forEach(function (g) {
      if (g.dynamicStat) p += dynamicCount(state, unit, g.dynamicStat) * (g.dynamicPowerPer || 0);
    });
    return Math.max(0, p);
  };
  SB.unitMaxHp = function (state, unit) {
    let h = prevMaxHp(state, unit);
    SB.auraGrants(state, unit).forEach(function (g) {
      if (g.dynamicStat) h += dynamicCount(state, unit, g.dynamicStat) * (g.dynamicHpPer || 0);
    });
    return h;
  };
  // Power without any aura, for aura conditions that look at the unit's own power
  // (an aura conditioned on unitPower would recurse into itself).
  SB.unitPowerNoAura = function (state, unit) {
    const def = SB.unitDef(unit);
    let p = def.power + unit.temp.power + unit.experience + (unit.advantage || 0);
    unit.upgrades.forEach(function (inst) {
      const c = SB.card(inst.cardId);
      p += c.type === 'leader' ? c.deployedSide.power : (c.power || 0);
    });
    if (prevHasKeyword(state, unit, 'grit')) p += unit.damage;
    return Math.max(0, p);
  };

  // Static cost discounts from units in play: grant {costDiscount:{amount, filter, oncePerRound?}}.
  // Consumed by engine.playCard (SB.consumeStaticDiscounts) when oncePerRound.
  const prevCardCost = SB.cardCost;
  SB.cardCost = function (state, playerIdx, cardId) {
    let cost = prevCardCost(state, playerIdx, cardId);
    if (!state || !state.ground) return cost;
    const card = SB.card(cardId);
    SB.allUnits(state, playerIdx).forEach(function (u) {
      (SB.unitDef(u).abilities || []).forEach(function (ab) {
        if (ab.trigger !== 'constant' || !ab.grant || !ab.grant.costDiscount) return;
        const d = ab.grant.costDiscount;
        if (!discountMatches(card, d.filter)) return;
        if (d.oncePerRound && u.discountUsedRound === state.round) return;
        cost = Math.max(0, cost - d.amount);
      });
    });
    return cost;
  };
  function discountMatches(card, f) {
    f = f || {};
    if (f.type && card.type !== f.type) return false;
    if (f.trait && (card.traits || []).indexOf(f.trait) < 0) return false;
    if (f.hasTrigger && !(card.abilities || []).some(function (ab) { return ab.trigger === f.hasTrigger; })) return false;
    return true;
  }
  SB.consumeStaticDiscounts = function (state, playerIdx, cardId) {
    const card = SB.card(cardId);
    SB.allUnits(state, playerIdx).forEach(function (u) {
      (SB.unitDef(u).abilities || []).forEach(function (ab) {
        if (ab.trigger !== 'constant' || !ab.grant || !ab.grant.costDiscount) return;
        const d = ab.grant.costDiscount;
        if (d.oncePerRound && discountMatches(card, d.filter) && u.discountUsedRound !== state.round) {
          u.discountUsedRound = state.round;
        }
      });
    });
  };

  // Upgrades that make the bearer count as a leader unit / provide aspect icons.
  SB.bearerCountsAsLeader = function (unit) {
    return unit.upgrades.some(function (inst) { return (SB.card(inst.cardId).staticFlags || []).indexOf('bearerIsLeader') >= 0; });
  };
  const prevPlayerAspects = SB.playerAspects;
  SB.playerAspects = function (state, playerIdx) {
    let a = prevPlayerAspects(state, playerIdx);
    if (!state || !state.ground) return a;
    SB.allUnits(state, playerIdx).forEach(function (u) {
      if (u.upgrades.some(function (inst) { return (SB.card(inst.cardId).staticFlags || []).indexOf('providesAspects') >= 0; })) {
        a = a.concat(SB.card(u.cardId).aspects || []);
      }
    });
    return a;
  };

  // ---- selectors ------------------------------------------------------------
  // Post-filter for selector keys effects.js does not know. Keep describeTarget in
  // text.js in step with every key here.
  SB.extraSelector = function (state, controller, sel, ctx, u) {
    if (sel.minRemHp != null && SB.unitRemainingHp(state, u) < sel.minRemHp) return false;
    if (sel.upgraded && u.upgrades.length === 0) return false;
    if (sel.powerLessThanSomeFriendly) {
      const p = SB.unitPower(state, u);
      if (!SB.allUnits(state, controller).some(function (f) { return f.uid !== u.uid && SB.unitPower(state, f) > p; })) return false;
    }
    if (sel.sameArenaAsPlayed) {
      const pu = ctx.playedUid != null ? SB.findUnit(state, ctx.playedUid) : null;
      if (!pu || SB.arenaOf(state, pu) !== SB.arenaOf(state, u)) return false;
    }
    if (sel.sameArenaAsSource) {
      const su = SB.findUnit(state, ctx.sourceUid);
      if (!su || SB.arenaOf(state, su) !== SB.arenaOf(state, u)) return false;
    }
    if (sel.maxCostRefMilled) {
      const costs = SB.efx(state, ctx).milledCosts || [];
      const c = costs.length ? costs[costs.length - 1] : null;
      if (c == null || (SB.card(u.cardId).cost || 0) > c) return false;
    }
    if (sel.notCardIs && sel.notCardIs.indexOf(u.cardId) >= 0) return false;
    if (sel.arenaRef) {
      const a = SB.efx(state, ctx)[sel.arenaRef];
      if (!a || SB.arenaOf(state, u) !== a) return false;
    }
    if (sel.aspectRef) {
      const a = SB.efx(state, ctx)[sel.aspectRef];
      if (!a || (SB.card(u.cardId).aspects || []).indexOf(a) < 0) return false;
    }
    if (sel.hasShieldOrExperience && !(u.shields > 0 || u.experience > 0)) return false;
    if (sel.notLeaderPilotBearer && u.upgrades.some(function (i) { return i.leaderPilot; })) return false;
    return true;
  };

  // ---- conditions -------------------------------------------------------------
  SB.extraConditions = {
    moreCardsInHandThanOpponent: function (state, c) {
      return state.players[c].hand.length > state.players[SB.other(c)].hand.length;
    },
    enteredThisPhaseAtLeast: function (state, c, cond) {
      return SB.allUnits(state, c).filter(function (u) { return u.enteredRound === state.round; }).length >= cond.n;
    },
    unitLeftPlayThisPhase: function (state) {
      return (state.defeatedThisPhase || []).length > 0 || (state.leftPlayThisPhase || 0) > 0;
    },
    attackedWithTraitThisPhase: function (state, c, cond) {
      return (state.attackedThisPhase || []).some(function (a) {
        if (a.owner !== c) return false;
        if (cond.nonToken && SB.card(a.cardId).token) return false;
        return a.traits.indexOf(cond.trait) >= 0;
      });
    },
    controlUnitsAtLeast: function (state, c, cond) { return SB.allUnits(state, c).length >= cond.n; },
    onlyFriendlyNonLeaderGroundUnit: function (state, c, cond, ctx) {
      return state.ground.filter(function (u) { return u.owner === c && SB.card(u.cardId).type !== 'leader'; })
        .every(function (u) { return u.uid === ctx.sourceUid; });
    },
    savedGone: function (state, c, cond, ctx) {
      const t = saved(state, ctx, cond.name);
      return !!t && t.kind === 'unit' && !SB.findUnit(state, t.uid);
    },
    storedAtLeast: function (state, c, cond, ctx) { return (SB.efx(state, ctx)[cond.name] || 0) >= cond.n; },
    milledHasAspect: function (state, c, cond, ctx) {
      const a = SB.efx(state, ctx).milledAspects || [];
      return a.length > 0 && a[a.length - 1].indexOf(cond.aspect) >= 0;
    },
    discardHasAspect: function (state, c, cond) {
      return state.players[c].discard.some(function (inst) { return (SB.card(inst.cardId).aspects || []).indexOf(cond.aspect) >= 0; });
    },
    controlNonUniqueUnit: function (state, c, cond, ctx) {
      return SB.allUnits(state, c).some(function (u) { return !SB.card(u.cardId).unique && u.uid !== ctx.sourceUid; });
    },
    controlDamagedUnit: function (state, c) { return SB.allUnits(state, c).some(function (u) { return u.damage > 0; }); },
    moreSpaceUnitsThanOpponent: function (state, c) {
      const mine = state.space.filter(function (u) { return u.owner === c; }).length;
      return mine > state.space.length - mine;
    },
    selfPowerAtLeast: function (state, c, cond, ctx) {
      const self = SB.findUnit(state, ctx.sourceUid);
      return !!self && SB.unitPowerNoAura(state, self) >= cond.n;
    },
    noOtherAttacksThisPhase: function (state, c, cond, ctx) {
      const me = ctx.attackEndedUid != null ? ctx.attackEndedUid : ctx.sourceUid;
      return (state.attackedThisPhase || []).every(function (a) { return a.uid === me; });
    },
    leaderHasTrait: function (state, c, cond) {
      return (SB.card(state.players[c].leader.cardId).traits || []).indexOf(cond.trait) >= 0;
    },
    bearerHasAspect: function (state, c, cond, ctx) {
      const b = SB.findUnit(state, ctx.sourceUid);
      return !!b && (SB.card(b.cardId).aspects || []).indexOf(cond.aspect) >= 0;
    },
    bearerHasNoneOfAspects: function (state, c, cond, ctx) {
      const b = SB.findUnit(state, ctx.sourceUid);
      return !!b && !(SB.card(b.cardId).aspects || []).some(function (a) { return cond.aspects.indexOf(a) >= 0; });
    },
    savedMaxCost: function (state, c, cond, ctx) {
      const u = savedUnit(state, ctx, cond.name);
      return !!u && (SB.card(u.cardId).cost || 0) <= cond.n;
    },
    creditsAtLeast: function (state, c, cond) { return (state.players[c].credits || 0) >= cond.n; },
    opponentHasCredits: function (state, c) { return (state.players[SB.other(c)].credits || 0) > 0; },
    baseRemHpAtMost: function (state, c, cond) {
      const b = state.players[c].base;
      return SB.card(b.cardId).hp - b.damage <= cond.n;
    },
    controlUnitWithTraitAny: function (state, c, cond) {
      return SB.allUnits(state, c).some(function (u) { return SB.unitTraits(state, u).indexOf(cond.trait) >= 0; });
    },
    controlCapitalOrTrait: function (state, c, cond) {
      return SB.allUnits(state, c).some(function (u) { return SB.unitTraits(state, u).indexOf(cond.trait) >= 0; });
    },
    savedIsCard: function (state, c, cond, ctx) {
      const u = savedUnit(state, ctx, cond.name);
      return !!u && cond.cards.indexOf(u.cardId) >= 0;
    },
    playedThisPhaseHasTrait: function (state, c, cond) {
      return (state.players[c].playedThisPhase || []).some(function (cid) { return (SB.card(cid).traits || []).indexOf(cond.trait) >= 0; });
    },
  };

  // ---- amount refs -------------------------------------------------------------
  SB.extraAmounts = function (state, item, target, ref) {
    const ctx = item.ctx || {};
    if (ref === 'powerOfPlayed') {
      const u = ctx.playedUid != null ? SB.findUnit(state, ctx.playedUid) : null;
      return u ? SB.unitPower(state, u) : 0;
    }
    if (ref === 'friendlySpaceCount') return state.space.filter(function (u) { return u.owner === item.controller; }).length;
    if (ref === 'handSize') return state.players[item.controller].hand.length;
    if (ref === 'defeatedPower') return ctx.defeatedPower || 0;
    if (ref === 'playedCardCost') return ctx.playedCardCost || 0;
    if (ref === 'creditsOwned') return state.players[item.controller].credits || 0;
    const m = ref.match(/^remHpOf:(.+)$/);
    if (m) { const u = savedUnit(state, ctx, m[1]); return u ? SB.unitRemainingHp(state, u) : 0; }
    return undefined;
  };

  // ---- small ops ----------------------------------------------------------------
  // Exhaust every unit matched by scope.
  O.exhaustAll = function (state, item) {
    SB.selectorCandidates(state, item.controller, item.op.scope, item.ctx || {}).forEach(function (c) {
      const u = SB.findUnit(state, c.uid);
      if (u && !u.exhausted) { u.exhausted = true; SB.log(state, { type: 'exhausted', uid: u.uid }); }
    });
  };
  // Give a temporary keyword (numeric allowed) to every unit matched by scope.
  O.giveKeywordAll = function (state, item) {
    SB.selectorCandidates(state, item.controller, item.op.scope, item.ctx || {}).forEach(function (c) {
      const u = SB.findUnit(state, c.uid);
      if (!u) return;
      grantTempKeyword(u, item.op.k, item.op.n);
      SB.log(state, { type: 'gainedKeyword', uid: u.uid, k: item.op.k, sound: 'buff' });
    });
  };
  function grantTempKeyword(u, k, n) {
    if (n != null) { u.tempKeywordNs = u.tempKeywordNs || []; u.tempKeywordNs.push({ k: k, n: n }); }
    else { u.tempKeywords = u.tempKeywords || []; u.tempKeywords.push(k); }
  }
  // Spend credit tokens (fizzles if short).
  O.spendCredits = function (state, item) {
    const p = state.players[item.controller];
    if ((p.credits || 0) < item.op.amount) { SB.log(state, { type: 'fizzle', why: 'cantPay', fizzled: true }); return; }
    p.credits -= item.op.amount;
    SB.log(state, { type: 'creditSpent', player: item.controller });
  };
  // Hand this unit (the source) to the opponent.
  O.giveControlSelf = function (state, item) {
    const u = SB.findUnit(state, item.ctx && item.ctx.sourceUid);
    if (!u) return;
    u.owner = SB.other(u.owner);
    SB.log(state, { type: 'controlTaken', uid: u.uid, by: u.owner, sound: 'claim', notice: true });
  };
  // The attacking source lets the defender strike first this attack (law-086).
  O.defenderStrikesFirst = function (state, item) {
    const u = SB.findUnit(state, item.ctx && item.ctx.sourceUid);
    if (u) { u.defenderFirstNext = true; SB.log(state, { type: 'attackModified', uid: u.uid }); }
  };
  // A unit loses all abilities (and keywords) for this round.
  O.suppressAbilities = function (state, item, target) {
    const u = SB.findUnit(state, target.uid);
    if (!u) return;
    u.abilitiesSuppressed = true;
    u.keywordsSuppressed = true;
    SB.log(state, { type: 'abilitiesSuppressed', uid: u.uid, sound: 'ability' });
  };
  // "The next unit you play this phase (matching filter) enters play ready."
  O.grantEntersReady = function (state, item) {
    const p = state.players[item.controller];
    p.entersReadyGrants = p.entersReadyGrants || [];
    p.entersReadyGrants.push({ filter: item.op.filter || {} });
    SB.log(state, { type: 'readyGrantArmed', player: item.controller, sound: 'buff' });
  };
  // Use the "When Defeated" abilities of another friendly unit without defeating it.
  O.useWhenDefeatedOf = function (state, item, target) {
    const u = SB.findUnit(state, target.uid);
    if (!u) return;
    SB.unitAllAbilities(state, u).forEach(function (ab) {
      if (ab.trigger !== 'whenDefeated') return;
      SB.queueEffects(state, u.owner, ab.effects, { sourceUid: u.uid, cardId: u.cardId, condition: ab.condition });
    });
    SB.log(state, { type: 'abilityBorrowed', uid: u.uid, sound: 'ability' });
  };
  // Use again the "When Defeated" ability that just resolved (jtl-002 style).
  O.reuseAbility = function (state, item) {
    const r = state.lastWhenDefeated;
    if (!r || r.controller !== item.controller) { SB.log(state, { type: 'fizzle', why: 'nothingToRepeat', fizzled: true }); return; }
    const ctx = Object.assign({}, r.ctx); delete ctx.inv;
    SB.queueEffects(state, item.controller, r.effects, ctx);
    SB.log(state, { type: 'abilityRepeated', cardId: r.ctx.cardId, sound: 'ability' });
  };
  // Remove every copy of the saved unit's card from its controller's hand and deck.
  O.purgeCopies = function (state, item) {
    const cid = SB.efx(state, item.ctx)[item.op.ofSaved + 'CardId'];
    const who = SB.efx(state, item.ctx)[item.op.ofSaved + 'Owner'];
    if (!cid || who == null) return;
    const p = state.players[who];
    let n = 0;
    ['hand', 'deck'].forEach(function (zone) {
      p[zone] = p[zone].filter(function (inst) { if (inst.cardId === cid) { p.discard.push(inst); n++; return false; } return true; });
    });
    p.deck = SB.shuffled(p.deck, SB.rng(SB.stateSeed(state, 'purge')));
    SB.log(state, { type: 'copiesPurged', player: who, cardId: cid, amount: n, notice: true });
  };
  // Defeat: also remember the victim's card id / owner for follow-up ops.
  const prevDefeatOp = O.defeat;
  O.defeat = function (state, item, target) {
    const u = SB.findUnit(state, target.uid);
    if (u && item.op.saveDefeatedAs) {
      const st = SB.efx(state, item.ctx);
      st[item.op.saveDefeatedAs + 'CardId'] = u.cardId;
      st[item.op.saveDefeatedAs + 'Owner'] = u.owner;
      st[item.op.saveDefeatedAs + 'Uid'] = u.uid;
    }
    prevDefeatOp(state, item, target);
  };
  // Defeat every unit in scope and remember how many enemies fell.
  const prevDefeatAll = O.defeatAll;
  O.defeatAll = function (state, item) {
    if (item.op.saveEnemyCountAs) {
      const n = SB.selectorCandidates(state, item.controller, item.op.scope, item.ctx || {})
        .filter(function (c) { const u = SB.findUnit(state, c.uid); return u && u.owner !== item.controller; }).length;
      SB.efx(state, item.ctx)[item.op.saveEnemyCountAs] = n;
    }
    prevDefeatAll(state, item);
  };
  // damageAll may take an amountRef.
  const prevDamageAll = O.damageAll;
  O.damageAll = function (state, item) {
    if (item.op.amountRef == null) return prevDamageAll(state, item);
    const amt = SB.resolveAmount(state, item, null) || 0;
    const cands = SB.selectorCandidates(state, item.controller, item.op.scope, item.ctx || {});
    const units = cands.map(function (c) { return SB.findUnit(state, c.uid); }).filter(Boolean);
    units.forEach(function (u) { SB.damageUnit(state, u, amt, item.ctx); });
  };
  // Defeat all upgrades on a chosen unit.
  O.defeatAllUpgradesOn = function (state, item, target) {
    const u = SB.findUnit(state, target.uid);
    if (!u) return;
    u.upgrades.slice().forEach(function (inst) { SB.removeUpgrade(state, u, inst, 'defeated'); });
    if (SB.findUnit(state, u.uid) && SB.unitRemainingHp(state, u) <= 0) SB.defeatUnit(state, u, item.ctx);
  };
  // Return this upgrade card (just defeated) from its owner's discard pile to hand.
  O.selfUpgradeToHand = function (state, item) {
    const uid = item.ctx && item.ctx.upgradeInstUid;
    const who = item.controller;
    const p = state.players[who];
    const i = p.discard.findIndex(function (inst) { return inst.uid === uid; });
    if (i < 0) return;
    p.hand.push(p.discard.splice(i, 1)[0]);
    SB.log(state, { type: 'tookFromDiscard', player: who, sound: 'draw' });
  };
  // Distribute N advantage tokens among units matched by scope, one at a time
  // (optional: the player may stop early; count saved when asked).
  O.dividedAdvantage = function (state, item) {
    const total = item.op.amountRef ? (SB.resolveAmount(state, item, null) || 0) : (item.op.amount || 0);
    if (total <= 0) return;
    state.queue.unshift({ step: 'advantagePoint', player: item.controller, left: total, given: 0,
      scope: item.op.scope || { who: 'friendly', what: 'unit' }, optional: !!item.op.optional,
      saveCountAs: item.op.saveCountAs, ctx: item.ctx });
  };
  S.advantagePoint = {
    actions: function (state, it) {
      if (it.left <= 0) return null;
      const acts = SB.selectorCandidates(state, it.player, it.scope, it.ctx || {})
        .filter(function (c) { return c.kind === 'unit'; })
        .map(function (c) { return { type: 'advantageTo', player: it.player, uid: c.uid }; });
      if (!acts.length) return null;
      if (it.optional) acts.push({ type: 'advantageTo', player: it.player, uid: null });
      return acts;
    },
    apply: function (state, it, action) {
      if (action.uid == null) { finish(state, it); return; }
      const u = SB.findUnit(state, action.uid);
      if (u) { u.advantage = (u.advantage || 0) + 1; SB.log(state, { type: 'advantage', uid: u.uid, amount: 1, sound: 'buff' }); }
      const next = Object.assign({}, it, { left: it.left - 1, given: it.given + 1 });
      if (next.left > 0) state.queue.unshift(next); else finish(state, next);
    },
  };
  function finish(state, it) {
    if (it.saveCountAs && it.ctx) SB.efx(state, it.ctx)[it.saveCountAs] = it.given;
  }

  // Choose an aspect (stored under saveAs for later ops).
  O.chooseAspect = function (state, item) {
    state.queue.unshift({ step: 'aspectPick', player: item.controller, saveAs: item.op.saveAs || 'aspect', ctx: item.ctx });
  };
  S.aspectPick = {
    actions: function (state, it) {
      return ['vigilance', 'command', 'aggression', 'cunning', 'heroism', 'villainy'].map(function (a) {
        return { type: 'pickAspect', player: it.player, aspect: a };
      });
    },
    apply: function (state, it, action) {
      SB.efx(state, it.ctx || {})[it.saveAs] = action.aspect;
      SB.log(state, { type: 'aspectChosen', player: it.player, aspect: action.aspect });
    },
  };
  // Choose an arena (stored under saveAs).
  O.chooseArena = function (state, item) {
    state.queue.unshift({ step: 'arenaPick', player: item.controller, saveAs: item.op.saveAs || 'arena', ctx: item.ctx });
  };
  S.arenaPick = {
    actions: function (state, it) {
      return [{ type: 'pickArena', player: it.player, arena: 'ground' }, { type: 'pickArena', player: it.player, arena: 'space' }];
    },
    apply: function (state, it, action) {
      SB.efx(state, it.ctx || {})[it.saveAs] = action.arena;
      SB.log(state, { type: 'arenaChosen', player: it.player, arena: action.arena });
    },
  };
  // Mill 1 and note the milled card's aspects (law-018).
  const prevMill = O.mill;
  O.mill = function (state, item) {
    const p = state.players[item.controller];
    const before = p.discard.length;
    prevMill(state, item);
    const milled = p.discard.slice(before);
    SB.efx(state, item.ctx).milledAspects = milled.map(function (inst) { return SB.card(inst.cardId).aspects || []; });
    milled.forEach(function (inst) { SB.noteDiscarded(state, item.controller, inst); });
  };
  SB.extraConditions.milledHasChosenAspect = function (state, c, cond, ctx) {
    const st = SB.efx(state, ctx);
    const a = st[cond.name || 'aspect'];
    const m = st.milledAspects || [];
    return !!a && m.length > 0 && m[m.length - 1].indexOf(a) >= 0;
  };

  // Put a card from hand on the top or bottom of your deck.
  O.handToDeckTopOrBottom = function (state, item) {
    state.queue.unshift({ step: 'handToDeckPick', player: item.controller });
  };
  S.handToDeckPick = {
    actions: function (state, it) {
      const p = state.players[it.player];
      if (!p.hand.length) return null;
      const acts = [];
      p.hand.forEach(function (inst, i) {
        acts.push({ type: 'handToDeck', player: it.player, handIndex: i, where: 'top' });
        acts.push({ type: 'handToDeck', player: it.player, handIndex: i, where: 'bottom' });
      });
      return acts;
    },
    apply: function (state, it, action) {
      const p = state.players[it.player];
      const inst = p.hand.splice(action.handIndex, 1)[0];
      if (action.where === 'top') p.deck.unshift(inst); else p.deck.push(inst);
      SB.log(state, { type: action.where === 'top' ? 'toppedCard' : 'bottomedCard', player: it.player });
    },
  };

  // Deal up to N damage to your own base in steps of `per`; the next unit you play
  // this phase costs 1 less per step (ash-027).
  O.selfBaseDamageForDiscount = function (state, item) {
    state.queue.unshift({ step: 'selfBurnPick', player: item.controller, max: item.op.max || 6, per: item.op.per || 2 });
  };
  S.selfBurnPick = {
    actions: function (state, it) {
      const acts = [];
      for (let n = 0; n <= it.max; n += it.per) acts.push({ type: 'selfBurn', player: it.player, amount: n });
      return acts;
    },
    apply: function (state, it, action) {
      if (action.amount <= 0) return;
      SB.damageBase(state, it.player, action.amount, 'selfEffect');
      const p = state.players[it.player];
      p.discounts = p.discounts || [];
      p.discounts.push({ amount: Math.floor(action.amount / it.per), remaining: 1, filter: { type: 'unit' } });
      SB.log(state, { type: 'discountGranted', player: it.player, sound: 'buff' });
    },
  };

  // Defeat any number of non-leader units with total remaining HP <= budget; queue
  // `perDefeat` effects once for each unit defeated this way (ash-053).
  O.defeatBudget = function (state, item) {
    state.queue.unshift({ step: 'defeatBudgetPick', player: item.controller, budget: item.op.budget,
      perDefeat: item.op.perDefeat || [], ctx: item.ctx, scope: item.op.scope || { who: 'any', what: 'unit', nonLeader: true } });
  };
  S.defeatBudgetPick = {
    actions: function (state, it) {
      const acts = [{ type: 'budgetDefeat', player: it.player, uid: null }];
      SB.selectorCandidates(state, it.player, it.scope, it.ctx || {}).forEach(function (c) {
        const u = SB.findUnit(state, c.uid);
        if (!u || SB.unitRemainingHp(state, u) > it.budget) return;
        acts.push({ type: 'budgetDefeat', player: it.player, uid: u.uid });
      });
      return acts.length > 1 ? acts : null;
    },
    apply: function (state, it, action) {
      if (action.uid == null) return;
      const u = SB.findUnit(state, action.uid);
      if (!u) return;
      const hp = SB.unitRemainingHp(state, u);
      SB.defeatUnit(state, u, it.ctx || {});
      if (it.perDefeat.length) SB.queueEffects(state, it.player, it.perDefeat, it.ctx || {});
      const rest = it.budget - hp;
      if (rest > 0) state.queue.push({ step: 'defeatBudgetPick', player: it.player, budget: rest, perDefeat: it.perDefeat, ctx: it.ctx, scope: it.scope });
    },
  };

  // Attach a friendly pilot unit (or move a pilot upgrade) onto the source unit (jtl-038).
  O.attachUnitAsPilot = function (state, item) {
    const bearer = SB.findUnit(state, item.ctx && item.ctx.sourceUid);
    if (!bearer) return;
    state.queue.unshift({ step: 'pilotAttachPick', player: item.controller, bearerUid: bearer.uid, optional: item.op.optional !== false });
  };
  S.pilotAttachPick = {
    actions: function (state, it) {
      const bearer = SB.findUnit(state, it.bearerUid);
      if (!bearer || SB.hasPilot(state, bearer)) return null;
      const acts = [];
      SB.allUnits(state, it.player).forEach(function (u) {
        if (u.uid === bearer.uid) return;
        if (SB.unitTraits(state, u).indexOf('tr30') >= 0 && SB.card(u.cardId).type === 'unit') {
          acts.push({ type: 'pilotFromUnit', player: it.player, uid: u.uid });
        }
        u.upgrades.forEach(function (inst, ui) {
          const c = SB.card(inst.cardId);
          if (inst.leaderPilot || (c.traits || []).indexOf('tr30') < 0) return;
          acts.push({ type: 'pilotFromUpgrade', player: it.player, uid: u.uid, index: ui });
        });
      });
      if (!acts.length) return null;
      if (it.optional) acts.push({ type: 'pilotFromUnit', player: it.player, uid: null });
      return acts;
    },
    apply: function (state, it, action) {
      const bearer = SB.findUnit(state, it.bearerUid);
      if (!bearer || action.uid == null) return;
      if (action.type === 'pilotFromUnit') {
        SB.unitToUpgrade(state, SB.findUnit(state, action.uid), bearer);
      } else {
        const src = SB.findUnit(state, action.uid);
        if (!src) return;
        const inst = src.upgrades.splice(action.index, 1)[0];
        bearer.upgrades.push(inst);
        SB.log(state, { type: 'attached', uid: bearer.uid, cardId: inst.cardId, sound: 'attach' });
      }
    },
  };
  // A unit in play becomes an upgrade on `bearer` (its own upgrades are defeated,
  // its damage removed).
  SB.unitToUpgrade = function (state, unit, bearer) {
    if (!unit || !bearer) return;
    unit.upgrades.slice().forEach(function (inst) { SB.removeUpgrade(state, unit, inst, 'defeated'); });
    const arena = SB.arenaOf(state, unit);
    state[arena].splice(state[arena].indexOf(unit), 1);
    const inst = { uid: unit.uid, cardId: unit.cardId, owner: unit.owner };
    bearer.upgrades.push(inst);
    SB.log(state, { type: 'attached', uid: bearer.uid, cardId: inst.cardId, sound: 'attach' });
  };
  // A pilot upgrade leaves its bearer and enters the ground arena as an exhausted unit.
  SB.upgradeToGroundUnit = function (state, bearer, inst) {
    const i = bearer.upgrades.indexOf(inst);
    if (i >= 0) bearer.upgrades.splice(i, 1);
    const owner = inst.owner != null ? inst.owner : bearer.owner;
    const u = SB.makeUnit(state, inst.cardId, owner);
    u.uid = inst.uid;
    u.exhausted = true;
    state.ground.push(u);
    SB.log(state, { type: 'ejected', uid: u.uid, cardId: u.cardId, sound: 'deploy' });
  };

  // Move one shield or experience token from a unit to another unit (jtl-242).
  O.moveTokenCounter = function (state, item) {
    state.queue.unshift({ step: 'tokenSourcePick', player: item.controller, optional: item.op.optional !== false });
  };
  S.tokenSourcePick = {
    actions: function (state, it) {
      const acts = [];
      SB.allUnits(state).forEach(function (u) {
        if (u.shields > 0) acts.push({ type: 'tokenTake', player: it.player, uid: u.uid, kind: 'shield' });
        if (u.experience > 0) acts.push({ type: 'tokenTake', player: it.player, uid: u.uid, kind: 'experience' });
      });
      if (!acts.length) return null;
      if (it.optional) acts.push({ type: 'tokenTake', player: it.player, uid: null });
      return acts;
    },
    apply: function (state, it, action) {
      if (action.uid == null) return;
      state.queue.unshift({ step: 'tokenDestPick', player: it.player, fromUid: action.uid, kind: action.kind });
    },
  };
  S.tokenDestPick = {
    actions: function (state, it) {
      const acts = [];
      SB.allUnits(state).forEach(function (u) {
        if (u.uid !== it.fromUid) acts.push({ type: 'tokenGive', player: it.player, uid: u.uid, kind: it.kind });
      });
      return acts.length ? acts : null;
    },
    apply: function (state, it, action) {
      const from = SB.findUnit(state, it.fromUid), to = SB.findUnit(state, action.uid);
      if (!from || !to) return;
      if (it.kind === 'shield' && from.shields > 0) { from.shields--; to.shields++; SB.log(state, { type: 'shield', uid: to.uid, sound: 'shield' }); }
      if (it.kind === 'experience' && from.experience > 0) {
        from.experience--; to.experience++;
        SB.log(state, { type: 'experience', uid: to.uid, amount: 1, sound: 'buff' });
        if (SB.unitRemainingHp(state, from) <= 0) SB.defeatUnit(state, from, {});
      }
    },
  };

  // Spend a credit token belonging to either player (law-191).
  O.spendAnyCredit = function (state, item) {
    state.queue.unshift({ step: 'creditPick', player: item.controller, optional: item.op.optional !== false, saveAs: item.op.saveAs, ctx: item.ctx });
  };
  S.creditPick = {
    actions: function (state, it) {
      const acts = [];
      [it.player, SB.other(it.player)].forEach(function (pi) {
        if ((state.players[pi].credits || 0) > 0) acts.push({ type: 'creditSpend', player: it.player, who: pi });
      });
      if (!acts.length) return null;
      if (it.optional) acts.push({ type: 'creditSpend', player: it.player, who: null });
      return acts;
    },
    apply: function (state, it, action) {
      if (action.who == null) return;
      state.players[action.who].credits -= 1;
      SB.log(state, { type: 'creditSpent', player: action.who });
      if (it.saveAs && it.ctx) SB.efx(state, it.ctx)[it.saveAs] = 1;
    },
  };

  // Name a card: choose among the cards visible in the opponent's hand and discard
  // pile (DEVIATIONS.md). mode 'block' = they cannot play it; 'silence' = their copies
  // lose all abilities. Both last while this unit remains in play.
  O.nameCard = function (state, item) {
    const src = SB.findUnit(state, item.ctx && item.ctx.sourceUid);
    if (!src) return;
    state.queue.unshift({ step: 'namePick', player: item.controller, uid: src.uid, mode: item.op.mode || 'block' });
  };
  S.namePick = {
    actions: function (state, it) {
      const opp = state.players[SB.other(it.player)];
      const seen = {};
      opp.hand.concat(opp.discard).forEach(function (inst) { seen[inst.cardId] = true; });
      const acts = Object.keys(seen).map(function (cid) { return { type: 'nameCard', player: it.player, cardId: cid }; });
      return acts.length ? acts : null;
    },
    apply: function (state, it, action) {
      const u = SB.findUnit(state, it.uid);
      if (!u) return;
      u.namedCard = action.cardId; u.namedMode = it.mode;
      SB.log(state, { type: 'cardNamed', uid: u.uid, cardId: action.cardId, notice: true });
    },
  };

  // Your base captures an enemy unit; it is rescued at the start of the regroup phase.
  O.captureToBase = function (state, item, target) {
    const victim = SB.findUnit(state, target.uid);
    if (!victim) return;
    SB.collectBounties(state, victim);
    const arena = SB.arenaOf(state, victim);
    state[arena].splice(state[arena].indexOf(victim), 1);
    const p = state.players[item.controller];
    p.baseCaptured = p.baseCaptured || [];
    p.baseCaptured.push({ uid: victim.uid, cardId: victim.cardId, owner: victim.owner, upgrades: victim.upgrades });
    SB.log(state, { type: 'captured', uid: victim.uid, cardId: victim.cardId, by: null, sound: 'capture' });
  };
  SB.releaseBaseCaptives = function (state) {
    state.players.forEach(function (p) {
      (p.baseCaptured || []).forEach(function (cap) {
        const u = SB.makeUnit(state, cap.cardId, cap.owner);
        u.uid = cap.uid; u.upgrades = cap.upgrades || [];
        state[SB.card(cap.cardId).arena].push(u);
        SB.log(state, { type: 'rescued', uid: u.uid, cardId: u.cardId });
      });
      p.baseCaptured = [];
    });
  };

  // Count a saved unit's on-attack abilities into a stored number (jtl-174).
  O.countOnAttackAbilities = function (state, item) {
    const u = savedUnit(state, item.ctx, item.op.ofSaved);
    SB.efx(state, item.ctx)[item.op.saveAs || 'n'] = u ? SB.unitAllAbilities(state, u).filter(function (ab) { return ab.trigger === 'onAttack'; }).length : 0;
  };
  // Clone: enter play as a copy of a non-leader, non-vehicle unit (twi-116).
  O.cloneEnter = function (state, item, target) {
    const self = SB.findUnit(state, item.ctx && item.ctx.sourceUid);
    const model = SB.findUnit(state, target.uid);
    if (!self || !model) return;
    self.copyOf = model.copyOf || model.cardId;
    SB.log(state, { type: 'cloned', uid: self.uid, cardId: self.copyOf, notice: true });
  };
  // The opponent may play the just-defeated unit from its owner's discard for free (jtl-221).
  O.opponentMayPlayDefeated = function (state, item) {
    const uid = item.ctx && item.ctx.sourceUid;
    if (uid == null) return;
    state.queue.unshift({ step: 'playHandPick', player: SB.other(item.controller), ctx: item.ctx,
      filter: { uidIs: uid }, discount: 99, entersReady: false, defeatAtRegroup: false, optional: true, zones: ['opponentDiscard'] });
  };

  // ---- extended queue steps -------------------------------------------------------
  // playHandPick: more zones (resources, opponentDiscard), upgrades with a bearer pick,
  // uid / stored-card filters, and a saved played unit.
  const prevPlayPick = S.playHandPick;
  S.playHandPick = {
    actions: function (state, it) {
      const zones = it.zones || ['hand'];
      const extra = zones.some(function (z) { return z === 'resources' || z === 'opponentDiscard'; });
      const f = it.filter || {};
      const wantsUpgrades = f.type === 'upgrade' || f.allowUpgrades;
      if (!extra && !wantsUpgrades && !f.uidIs && !f.uidRef && !f.cardIsRef) return prevPlayPick.actions(state, it);
      const p = state.players[it.player];
      const acts = [];
      function pile(z) {
        if (z === 'hand') return p.hand;
        if (z === 'discard') return p.discard;
        if (z === 'opponentDiscard') return state.players[SB.other(it.player)].discard;
        if (z === 'resources') return p.resources.map(function (r) { return r.instance; });
        return [];
      }
      zones.forEach(function (z) {
        pile(z).forEach(function (inst, i) {
          const card = SB.card(inst.cardId);
          if (f.uidIs != null && inst.uid !== f.uidIs) return;
          if (f.uidRef && SB.efx(state, it.ctx || {})[f.uidRef] !== inst.uid) return;
          if (f.cardIsRef && SB.efx(state, it.ctx || {})[f.cardIsRef] !== inst.cardId) return;
          if (f.type && card.type !== f.type) return;
          if (f.trait && (card.traits || []).indexOf(f.trait) < 0) return;
          if (f.maxCost != null && card.cost > f.maxCost) return;
          if (f.aspect && (card.aspects || []).indexOf(f.aspect) < 0) return;
          if (card.type === 'leader' || card.type === 'base') return;
          if (card.type === 'upgrade' && !wantsUpgrades) return;
          if (card.type !== 'upgrade' && f.type === 'upgrade') return;
          const cost = Math.max(0, SB.cardCost(state, it.player, inst.cardId) - it.discount);
          if (cost > SB.readyResources(state, it.player)) return;
          if (card.type === 'unit' && card.unique &&
              SB.allUnits(state, it.player).some(function (u) { return u.cardId === inst.cardId; })) return;
          if (card.type === 'upgrade') {
            SB.allUnits(state).forEach(function (u) {
              if (card.attachTo === 'friendly' && u.owner !== it.player) return;
              if (card.attachTo === 'enemy' && u.owner === it.player) return;
              if (!SB.attachAllowed(state, card, u)) return;
              if (f.bearerRef) { const t = SB.efx(state, it.ctx || {})[f.bearerRef]; if (!t || t.uid !== u.uid) return; }
              if (f.bearerPlayedThisRound && u.enteredRound !== state.round) return;
              if (f.bearerFriendly && u.owner !== it.player) return;
              acts.push({ type: 'playHandCard', player: it.player, handIndex: i, cardId: inst.cardId, zone: z, attachTo: u.uid });
            });
          } else {
            acts.push({ type: 'playHandCard', player: it.player, handIndex: i, cardId: inst.cardId, zone: z });
          }
        });
      });
      if (!acts.length) return null;
      if (it.optional) acts.push({ type: 'playHandCard', player: it.player, handIndex: -1 });
      return acts;
    },
    apply: function (state, it, action) {
      if (action.handIndex === -1) return;
      const p = state.players[it.player];
      let playAction;
      if (action.zone === 'resources') {
        const r = p.resources[action.handIndex];
        if (!r || r.instance.cardId !== action.cardId) return;
        const inst = r.instance;
        if (p.deck.length) p.resources[action.handIndex] = { instance: p.deck.shift(), exhausted: r.exhausted };
        else p.resources.splice(action.handIndex, 1);
        playAction = { fromInst: inst, cardId: action.cardId, attachTo: action.attachTo };
      } else if (action.zone === 'opponentDiscard') {
        const od = state.players[SB.other(it.player)].discard;
        const inst = od.splice(action.handIndex, 1)[0];
        playAction = { fromInst: inst, cardId: action.cardId, attachTo: action.attachTo };
      } else if (action.zone === 'discard') {
        playAction = { fromDiscard: action.handIndex, cardId: action.cardId, attachTo: action.attachTo };
      } else {
        playAction = { handIndex: action.handIndex, cardId: action.cardId, attachTo: action.attachTo };
      }
      SB.playCardWithMods(state, it.player, playAction,
        { discount: it.discount, entersReady: it.entersReady, defeatAtRegroup: it.defeatAtRegroup, returnAtRegroup: it.returnAtRegroup });
      const played = SB.allUnits(state, it.player).find(function (u) { return u.cardId === action.cardId && u.enteredRound === state.round; });
      if (it.ctx) {
        const st = SB.efx(state, it.ctx);
        st.playedOne = 1;
        if (played) st[it.savePlayedAs || 'played'] = { kind: 'unit', uid: played.uid };
      }
      const grantAmbush = it.withAmbush || (it.withAmbushIfCredit && state.lastPaymentUsedCredit);
      if (grantAmbush && played && played.exhausted && SB.card(action.cardId).type === 'unit') {
        state.queue.push({ step: 'effect', controller: it.player,
          ctx: { sourceUid: played.uid, cardId: played.cardId }, op: { op: 'ambushAttack', target: null } });
      }
      if (it.withHidden && played) grantTempKeyword(played, 'hidden');
      if (it.entersReady && played) played.exhausted = false;
    },
  };
  const prevPlayFromHand = O.playFromHand;
  O.playFromHand = function (state, item) {
    prevPlayFromHand(state, item);
    const step = state.queue[0];
    if (step && step.step === 'playHandPick') {
      step.savePlayedAs = item.op.savePlayedAs;
      step.withHidden = !!item.op.withHidden;
      step.returnAtRegroup = !!item.op.returnAtRegroup;
    }
  };
  // Attach filters shared by every attach path.
  SB.attachAllowed = function (state, card, u) {
    if (card.attachArena && SB.arenaOf(state, u) !== card.attachArena) return false;
    const f = card.attachFilter;
    if (!f) return true;
    const traits = SB.unitTraits(state, u);
    if (f.notTrait && traits.indexOf(f.notTrait) >= 0) return false;
    if (f.trait && traits.indexOf(f.trait) < 0) return false;
    if (f.uniqueOnly && !SB.card(u.cardId).unique) return false;
    if (f.damaged && u.damage === 0) return false;
    return true;
  };

  // searchPick: opponent search, depth refs, budgets, discard-it / resource-it, saved
  // card id, upgrades played onto a saved bearer, and enters-ready / return mods.
  const prevSearch = S.searchPick;
  S.searchPick = {
    actions: function (state, it) {
      if (it.budget == null && !it.discardIt && !it.resourceIt && !it.attachToSaved) return prevSearch.actions(state, it);
      const p = state.players[it.player];
      const depth = it.depth || p.deck.length;
      const f = it.filter || {};
      const acts = [];
      p.deck.slice(0, depth).forEach(function (inst, i) {
        const c = SB.card(inst.cardId);
        if (f.type && c.type !== f.type) return;
        if (f.trait && (c.traits || []).indexOf(f.trait) < 0) return;
        if (f.arena && c.arena !== f.arena) return;
        if (it.budget != null) {
          if ((c.cost || 0) > it.budget) return;
          if (c.unique && SB.allUnits(state, it.player).some(function (u) { return u.cardId === inst.cardId; })) return;
        }
        if (it.attachToSaved) {
          const b = savedUnit(state, it.ctx, it.attachToSaved);
          if (!b || c.type !== 'upgrade' || !SB.attachAllowed(state, c, b)) return;
          const cost = Math.max(0, SB.cardCost(state, it.player, inst.cardId) - (it.playDiscount || 0));
          if (cost > SB.readyResources(state, it.player)) return;
        }
        acts.push({ type: 'searchTake', player: it.player, deckIndex: i });
      });
      if (!acts.length) return null;
      acts.push({ type: 'searchTake', player: it.player, deckIndex: -1 });
      return acts;
    },
    apply: function (state, it, action) {
      const p = state.players[it.player];
      const took = action.deckIndex >= 0;
      if (took) {
        const inst = p.deck[action.deckIndex];
        if (it.ctx) SB.efx(state, it.ctx).lastSearchedCardId = inst.cardId;
        if (it.discardIt) {
          p.deck.splice(action.deckIndex, 1); pushDiscardInst(state, it.player, inst);
          if (it.ctx) SB.efx(state, it.ctx).discardedCardId = inst.cardId;
          SB.log(state, { type: 'discarded', player: it.player, cardId: inst.cardId, sound: 'discard' });
        } else if (it.resourceIt) {
          p.deck.splice(action.deckIndex, 1);
          p.resources.push({ instance: inst, exhausted: false });
          SB.log(state, { type: 'resourced', player: it.player });
        } else if (it.budget != null) {
          const cost = SB.card(inst.cardId).cost || 0;
          SB.playCardWithMods(state, it.player, { fromDeckIndex: action.deckIndex, cardId: inst.cardId }, { discount: 99 });
          const rest = it.budget - cost;
          if (rest > 0) { state.queue.unshift(Object.assign({}, it, { budget: rest, depth: it.depth == null ? null : it.depth - 1 })); return; }
        } else if (it.attachToSaved) {
          const b = savedUnit(state, it.ctx, it.attachToSaved);
          if (b) SB.playCardWithMods(state, it.player, { fromDeckIndex: action.deckIndex, cardId: inst.cardId, attachTo: b.uid }, { discount: it.playDiscount || 0 });
        } else if (it.playIt) {
          SB.playCardWithMods(state, it.player, { fromDeckIndex: action.deckIndex, cardId: inst.cardId },
            { discount: it.playDiscount, entersReady: it.entersReady, returnAtRegroup: it.returnAtRegroup });
        } else {
          p.deck.splice(action.deckIndex, 1); p.hand.push(inst);
          SB.log(state, { type: 'searched', player: it.player });
        }
        if (it.remaining > 1) {
          state.queue.unshift(Object.assign({}, it, { remaining: it.remaining - 1, depth: it.depth == null ? null : it.depth - 1 }));
          return;
        }
      }
      p.deck = SB.shuffled(p.deck, SB.rng(SB.stateSeed(state, 'searchShuffle')));
      SB.log(state, { type: 'deckShuffled', player: it.player });
    },
  };
  const prevSearchOp = O.searchDeck;
  O.searchDeck = function (state, item) {
    const who = item.op.who === 'opponent' ? SB.other(item.controller) : item.controller;
    let depth = item.op.depth || null;
    if (item.op.depthRef) depth = (SB.efx(state, item.ctx)[item.op.depthRef] || 0) * (item.op.depthMul || 1);
    if (item.op.depthRef && depth <= 0) return;
    // Search doubling upgrade on the source unit.
    const src = SB.findUnit(state, item.ctx && item.ctx.sourceUid);
    if (depth && src && src.upgrades.some(function (i) { return (SB.card(i.cardId).staticFlags || []).indexOf('doubleSearch') >= 0; })) depth *= 2;
    state.queue.unshift({
      step: 'searchPick', player: who, filter: item.op.filter || {}, remaining: item.op.take || 1, depth: depth,
      playIt: !!item.op.playIt, playDiscount: item.op.playDiscount || 0, budget: item.op.budget,
      discardIt: !!item.op.discardIt, resourceIt: !!item.op.resourceIt, attachToSaved: item.op.attachToSaved,
      entersReady: !!item.op.entersReady, returnAtRegroup: !!item.op.returnAtRegroup, ctx: item.ctx,
    });
    void prevSearchOp;
  };

  // attackWith: power bonus from a ref, abilities borrowed from a discarded card, and
  // a saved-target attacker (useTarget) all flow through the existing step.
  const prevAttackWith = O.attackWith;
  O.attackWith = function (state, item, target) {
    if (item.op.bonusPowerRef) {
      item = Object.assign({}, item, { op: Object.assign({}, item.op, { bonusPower: (item.op.bonusPower || 0) + (SB.resolveAmount(state, { op: { amountRef: item.op.bonusPowerRef }, ctx: item.ctx, controller: item.controller }, target) || 0) }) });
    }
    if (item.op.abilitiesFromDiscarded) {
      const cid = SB.efx(state, item.ctx).discardedCardId;
      const u = SB.findUnit(state, target.uid);
      if (cid && u) {
        const c = SB.card(cid);
        if (c.abilities && c.abilities.length) u.tempAbilities = (u.tempAbilities || []).concat(c.abilities);
        if (c.keywords) c.keywords.forEach(function (kw) { grantTempKeyword(u, kw.k, kw.n); });
      }
    }
    if (item.op.defenderFirst) {
      const u = SB.findUnit(state, target.uid);
      if (u) u.defenderFirstNext = true;
    }
    prevAttackWith(state, item, target);
  };

  // defeatUpgradePick: friendly-only, non-leader, optional, remember the bearer.
  const prevDefeatUpgradePick = S.defeatUpgradePick;
  S.defeatUpgradePick = {
    actions: function (state, it) {
      const acts = [];
      SB.allUnits(state).forEach(function (u) {
        if (it.friendlyOnly && u.owner !== it.player) return;
        if (it.bearerArena && SB.arenaOf(state, u) !== it.bearerArena) return;
        u.upgrades.forEach(function (inst, ui) {
          if (it.nonLeaderOnly && inst.leaderPilot) return;
          if (it.nonUniqueOnly && SB.card(inst.cardId).unique) return;
          acts.push({ type: 'defeatUpgrade', player: it.player, uid: u.uid, index: ui });
        });
      });
      if (!acts.length) return null;
      if (it.optional) acts.push({ type: 'defeatUpgrade', player: it.player, uid: null });
      return acts;
    },
    apply: function (state, it, action) {
      if (action.uid == null) return;
      const u = SB.findUnit(state, action.uid);
      if (!u) return;
      if (it.ctx) {
        const st = SB.efx(state, it.ctx);
        if (it.saveBearerAs) st[it.saveBearerAs] = { kind: 'unit', uid: u.uid };
        if (it.saveAs) st[it.saveAs] = 1;
      }
      prevDefeatUpgradePick.apply(state, it, action);
    },
  };
  O.defeatUpgrade = function (state, item) {
    state.queue.unshift({ step: 'defeatUpgradePick', player: item.controller, friendlyOnly: !!item.op.friendlyOnly,
      nonLeaderOnly: !!item.op.nonLeaderOnly, nonUniqueOnly: !!item.op.nonUniqueOnly, optional: !!item.op.optional,
      saveBearerAs: item.op.saveBearerAs, saveAs: item.op.saveAs, bearerArena: item.op.bearerArena, ctx: item.ctx });
  };

  // discardChoice: aspect-sharing filter, optional decline, success flag.
  const prevDiscardChoice = S.discardChoice;
  S.discardChoice = {
    actions: function (state, it) {
      const base = prevDiscardChoice.actions(state, it);
      if (!base) return null;
      let acts = base;
      const f = it.filter || {};
      if (f.sharesAspectWithSaved) {
        const u = savedUnit(state, it.ctx, f.sharesAspectWithSaved);
        const asp = u ? (SB.card(u.cardId).aspects || []) : [];
        const p = state.players[it.player];
        acts = acts.filter(function (a) { return (SB.card(p.hand[a.handIndex].cardId).aspects || []).some(function (x) { return asp.indexOf(x) >= 0; }); });
      }
      if (f.notType) { const p = state.players[it.player]; acts = acts.filter(function (a) { return SB.card(p.hand[a.handIndex].cardId).type !== f.notType; }); }
      if (!acts.length) return null;
      if (it.optional) acts.push({ type: 'discardCard', player: it.forcedBy != null ? it.forcedBy : it.player, targetPlayer: it.player, handIndex: -1 });
      return acts;
    },
    apply: function (state, it, action) {
      if (action.handIndex === -1) return;
      prevDiscardChoice.apply(state, it, action);
      const p = state.players[it.player];
      const inst = p.discard[p.discard.length - 1];
      if (inst) SB.noteDiscarded(state, it.player, inst);
      if (it.saveAs && it.ctx) SB.efx(state, it.ctx)[it.saveAs] = 1;
    },
  };
  O.discardFromOpponentHandChoice = function (state, item) {
    O.revealHand(state, item);
    state.queue.unshift({ step: 'discardChoice', player: SB.other(item.controller), forcedBy: item.controller, ctx: item.ctx,
      filter: item.op.filter, optional: !!item.op.optional, saveAs: item.op.saveAs });
  };
  const prevDiscardRandom = O.discardRandom;
  O.discardRandom = function (state, item) {
    const who = item.op.who === 'self' ? item.controller : SB.other(item.controller);
    const before = state.players[who].discard.length;
    prevDiscardRandom(state, item);
    state.players[who].discard.slice(before).forEach(function (inst) { SB.noteDiscarded(state, who, inst); });
  };

  // bottomDiscardPick / takeFromDiscardPick: cost and aspect filters.
  const prevBottomPick = S.bottomDiscardPick;
  S.bottomDiscardPick = {
    actions: function (state, it) {
      const base = prevBottomPick.actions(state, it);
      if (!base) return null;
      const f = it.filter || {};
      const p = state.players[it.player];
      const acts = base.filter(function (a) {
        if (a.index < 0) return true;
        const c = SB.card(p.discard[a.index].cardId);
        if (f.maxCost != null && (c.cost || 0) > f.maxCost) return false;
        if (f.aspect && (c.aspects || []).indexOf(f.aspect) < 0) return false;
        return true;
      });
      return acts.length > 1 || it.count > 0 ? acts : null;
    },
    apply: prevBottomPick.apply,
  };
  const prevTakePick = S.takeFromDiscardPick;
  S.takeFromDiscardPick = {
    actions: function (state, it) {
      const base = prevTakePick.actions(state, it);
      if (!base) return null;
      const f = it.filter || {};
      const p = state.players[it.player];
      const acts = base.filter(function (a) {
        if (a.index < 0) return true;
        const c = SB.card(p.discard[a.index].cardId);
        if (f.maxCost != null && (c.cost || 0) > f.maxCost) return false;
        if (f.aspect && (c.aspects || []).indexOf(f.aspect) < 0) return false;
        return true;
      });
      return acts.some(function (a) { return a.index >= 0; }) ? acts : null;
    },
    apply: prevTakePick.apply,
  };

  // readyResource / discloseReveal for the other player.
  const prevReadyResource = O.readyResource;
  O.readyResource = function (state, item) {
    if (item.op.who !== 'opponent') return prevReadyResource(state, item);
    prevReadyResource(state, Object.assign({}, item, { controller: SB.other(item.controller) }));
  };
  const prevDisclose = O.discloseReveal;
  O.discloseReveal = function (state, item) {
    if (item.op.who !== 'opponent') return prevDisclose(state, item);
    prevDisclose(state, Object.assign({}, item, { controller: SB.other(item.controller) }));
  };
  // binaryChoice: the gate may be evaluated for the chooser rather than the controller.
  const prevBinaryPick = S.binaryPick;
  S.binaryPick = {
    actions: function (state, it) {
      if (!it.aGateFor) return prevBinaryPick.actions(state, it);
      const acts = [];
      if ((!it.aGate || SB.checkCondition(state, it.player, it.aGate, it.ctx || {})) &&
          SB.branchAffordable(state, it.controller, it.a)) acts.push({ type: 'binary', player: it.player, pick: 'a' });
      acts.push({ type: 'binary', player: it.player, pick: 'b' });
      return acts;
    },
    apply: prevBinaryPick.apply,
  };
  const prevBinary = O.binaryChoice;
  O.binaryChoice = function (state, item) {
    prevBinary(state, item);
    if (item.op.aGateFor === 'chooser') state.queue[0].aGateFor = 'chooser';
  };
  // createToken: fires "when you play or create a unit" observers and may save the token.
  const prevCreateToken = O.createToken;
  O.createToken = function (state, item) {
    const before = SB.allUnits(state).map(function (u) { return u.uid; });
    prevCreateToken(state, item);
    const made = SB.allUnits(state).filter(function (u) { return before.indexOf(u.uid) < 0; });
    if (!made.length) return;
    if (item.op.saveAs && item.ctx) SB.efx(state, item.ctx)[item.op.saveAs] = { kind: 'unit', uid: made[0].uid };
    made.forEach(function (tok) {
      SB.allUnits(state, tok.owner).forEach(function (obs) {
        if (obs.uid === tok.uid) return;
        SB.fireTriggers(state, 'onUnitPlayed', obs, { sourceUid: obs.uid, playedUid: tok.uid, playedCardId: tok.cardId, created: true });
      });
      if (SB.fireLeaderTrigger) SB.fireLeaderTrigger(state, tok.owner, 'onUnitPlayed', { playedUid: tok.uid, playedCardId: tok.cardId });
    });
  };
  // peekTop: play discount.
  const prevPeek = S.peekDecide;
  S.peekDecide = {
    actions: function (state, it) {
      if (!it.discount) return prevPeek.actions(state, it);
      const p = state.players[it.player];
      if (!p.deck.length) return null;
      const inst = p.deck[0], card = SB.card(inst.cardId);
      const acts = [];
      it.modes.forEach(function (m) {
        if (m !== 'play') { acts.push({ type: 'peekAct', player: it.player, mode: m }); return; }
        const cost = Math.max(0, SB.cardCost(state, it.player, inst.cardId) - it.discount);
        if (cost > SB.readyResources(state, it.player)) return;
        if (card.type === 'unit' && card.unique && SB.allUnits(state, it.player).some(function (u) { return u.cardId === inst.cardId; })) return;
        if (card.type === 'unit' || card.type === 'event') acts.push({ type: 'peekAct', player: it.player, mode: 'play', cardId: inst.cardId });
        else if (card.type === 'upgrade') SB.allUnits(state).forEach(function (u) {
          if (card.attachTo === 'friendly' && u.owner !== it.player) return;
          if (card.attachTo === 'enemy' && u.owner === it.player) return;
          if (!SB.attachAllowed(state, card, u)) return;
          acts.push({ type: 'peekAct', player: it.player, mode: 'play', cardId: inst.cardId, attachTo: u.uid });
        });
      });
      return acts;
    },
    apply: function (state, it, action) {
      if (action.mode !== 'play' || !it.discount) return prevPeek.apply(state, it, action);
      const inst = state.players[it.player].deck[0];
      if (!inst) return;
      SB.playCardWithMods(state, it.player, { fromDeckTop: true, cardId: inst.cardId, attachTo: action.attachTo }, { discount: it.discount });
    },
  };
  O.peekTop = function (state, item) {
    state.queue.unshift({ step: 'peekDecide', player: item.controller, modes: item.op.modes, discount: item.op.free ? 99 : (item.op.discount || 0) });
  };
  // takeControl: returned to its owner when the source unit leaves play.
  const prevTakeControl = O.takeControl;
  O.takeControl = function (state, item, target) {
    const u = SB.findUnit(state, target.uid);
    if (u && (SB.unitDef(u).staticFlags || []).indexOf('noControlChange') >= 0) {
      SB.log(state, { type: 'fizzle', why: 'immune', fizzled: true }); return;
    }
    const original = u ? u.owner : null;
    prevTakeControl(state, item, target);
    if (u && item.op.untilSourceLeaves && item.ctx && item.ctx.sourceUid != null) {
      u.controlBond = { srcUid: item.ctx.sourceUid, originalOwner: original };
    }
  };
  // Indirect damage: a dealer with the assignOwnIndirect static assigns the points.
  const prevIndirect = O.indirectDamage;
  O.indirectDamage = function (state, item) {
    const before = state.queue.length;
    prevIndirect(state, item);
    const own = SB.allUnits(state, item.controller).some(function (u) { return (SB.unitDef(u).staticFlags || []).indexOf('assignOwnIndirect') >= 0; });
    if (!own) return;
    for (let i = 0; i < state.queue.length - before; i++) {
      const q = state.queue[i];
      if (q.step === 'indirectPoint' && q.player !== item.controller) { q.assignedBy = item.controller; q.victim = q.player; }
    }
  };
  const prevIndirectPoint = S.indirectPoint;
  S.indirectPoint = {
    actions: function (state, it) {
      if (it.assignedBy == null) return prevIndirectPoint.actions(state, it);
      const v = it.victim;
      const acts = [{ type: 'indirectTo', player: it.assignedBy, target: { kind: 'base', player: v } }];
      SB.allUnits(state, v).forEach(function (u) { acts.push({ type: 'indirectTo', player: it.assignedBy, target: { kind: 'unit', uid: u.uid } }); });
      return acts;
    },
    apply: prevIndirectPoint.apply,
  };

  // ---- upgrade defeat plumbing ----------------------------------------------------
  // Every path that removes an upgrade goes through here so "When Defeated" on the
  // upgrade itself, ejecting pilots, and "when a friendly upgrade is defeated"
  // observers all fire from one place.
  SB.removeUpgrade = function (state, bearer, inst, why) {
    const i = bearer.upgrades.indexOf(inst);
    if (i < 0) return;
    const card = SB.card(inst.cardId);
    if (why === 'defeated' && !inst.leaderPilot && (card.staticFlags || []).indexOf('ejectOnDefeat') >= 0) {
      SB.upgradeToGroundUnit(state, bearer, inst);
      return;
    }
    bearer.upgrades.splice(i, 1);
    if (inst.leaderPilot) {
      SB.sidelineLeaderPilot(state, bearer, inst, { defeated: why === 'defeated', log: true });
      return;
    }
    const owner = SB.upgradeOwner(bearer, inst);
    if (!card.token) state.players[owner].discard.push(inst);
    if (why === 'defeated') {
      SB.log(state, { type: 'upgradeDefeated', uid: bearer.uid, cardId: inst.cardId, sound: 'destroy' });
      const bearerTraits = SB.unitTraits(state, bearer);
      (card.abilities || []).forEach(function (ab) {
        if (ab.trigger !== 'whenDefeated') return;
        SB.queueEffects(state, owner, ab.effects, { cardId: inst.cardId, upgradeInstUid: inst.uid, bearerUid: bearer.uid,
          bearerTraits: bearerTraits, bearerFriendly: bearer.owner === owner, condition: ab.condition });
      });
      SB.allUnits(state, owner).forEach(function (obs) {
        SB.fireTriggers(state, 'onFriendlyUpgradeDefeated', obs, { sourceUid: obs.uid });
      });
    }
  };
  SB.extraConditions.bearerWasFriendlyWithTrait = function (state, c, cond, ctx) {
    return !!ctx.bearerFriendly && (ctx.bearerTraits || []).indexOf(cond.trait) >= 0;
  };
  // Route the older upgrade-removal paths through the shared helper.
  S.defeatUpgradePick.apply = (function (orig) {
    return function (state, it, action) {
      if (action.uid == null) return orig(state, it, action);
      const u = SB.findUnit(state, action.uid);
      if (!u) return;
      if (it.ctx) {
        const st = SB.efx(state, it.ctx);
        if (it.saveBearerAs) st[it.saveBearerAs] = { kind: 'unit', uid: u.uid };
        if (it.saveAs) st[it.saveAs] = 1;
      }
      const inst = u.upgrades[action.index];
      if (!inst) return;
      SB.removeUpgrade(state, u, inst, 'defeated');
      if (SB.findUnit(state, u.uid) && SB.unitRemainingHp(state, u) <= 0) SB.defeatUnit(state, u, {});
    };
  })(S.defeatUpgradePick.apply);
  O.defeatDefenderUpgrades = function (state, item) {
    const t = item.ctx && item.ctx.attackTarget;
    const u = t && t.kind === 'unit' ? SB.findUnit(state, t.uid) : null;
    if (!u) return;
    u.upgrades.slice().forEach(function (inst) { SB.removeUpgrade(state, u, inst, 'defeated'); });
    SB.log(state, { type: 'upgradesDefeated', uid: u.uid, sound: 'destroy' });
    if (SB.unitRemainingHp(state, u) <= 0) SB.defeatUnit(state, u, {});
  };
  O.defeatUpgradeOn = function (state, item) {
    const uid = item.ctx && item.ctx.damagedUid;
    const u = uid != null ? SB.findUnit(state, uid) : null;
    if (!u) return;
    const inst = u.upgrades.find(function (i2) { return !SB.card(i2.cardId).unique && !i2.leaderPilot; });
    if (!inst) return;
    SB.removeUpgrade(state, u, inst, 'defeated');
    if (SB.unitRemainingHp(state, u) <= 0) SB.defeatUnit(state, u, {});
  };

  // ---- damage hooks ------------------------------------------------------------------
  // Replacement effects on damage (see DEVIATIONS.md for the auto-choice rules):
  //  - shieldRedirect: another friendly unit with the static pops one of its shields to
  //    prevent damage that would defeat the target;
  //  - sacrificeToPrevent: the target's controller defeats their cheapest other unit
  //    sharing a kind with it to prevent damage that would defeat it;
  //  - underworldUnpreventable: damage from an underworld source whose controller has
  //    the static ignores the target's shields.
  const prevDamageUnit = SB.damageUnit;
  SB.damageUnit = function (state, unit, amount, ctx) {
    if (amount <= 0) return;
    ctx = ctx || {};
    const lethal = amount >= SB.unitRemainingHp(state, unit);
    if (lethal) {
      const guard = SB.allUnits(state, unit.owner).find(function (f) {
        return f.uid !== unit.uid && f.shields > 0 && (SB.unitDef(f).staticFlags || []).indexOf('shieldRedirect') >= 0;
      });
      if (guard) { guard.shields -= 1; SB.log(state, { type: 'shieldPopped', uid: guard.uid, sound: 'shield' }); return; }
      if ((SB.unitDef(unit).staticFlags || []).indexOf('sacrificeToPrevent') >= 0) {
        const traits = SB.unitTraits(state, unit);
        const cands = SB.allUnits(state, unit.owner).filter(function (f) {
          return f.uid !== unit.uid && SB.unitTraits(state, f).some(function (t) { return traits.indexOf(t) >= 0; });
        }).sort(function (a, b) { return (SB.card(a.cardId).cost || 0) - (SB.card(b.cardId).cost || 0); });
        if (cands.length) { SB.defeatUnit(state, cands[0], {}); SB.log(state, { type: 'damagePrevented', uid: unit.uid }); return; }
      }
    }
    if (unit.shields > 0) {
      const srcUnit = ctx.sourceUid != null ? SB.findUnit(state, ctx.sourceUid) : null;
      const dealer = ctx.dealer != null ? ctx.dealer : (srcUnit ? srcUnit.owner : ctx.controller);
      const srcTraits = srcUnit ? SB.unitTraits(state, srcUnit) : (ctx.cardId ? (SB.card(ctx.cardId).traits || []) : []);
      if (dealer != null && dealer !== unit.owner && srcTraits.indexOf('tr45') >= 0 &&
          SB.allUnits(state, dealer).some(function (f) { return (SB.unitDef(f).staticFlags || []).indexOf('underworldUnpreventable') >= 0; })) {
        unit.shields = 0;
        SB.log(state, { type: 'shieldsSabotaged', uid: unit.uid, sound: 'shield' });
      }
    }
    prevDamageUnit(state, unit, amount, ctx);
    if (!SB.findUnit(state, unit.uid)) return;
    // Survived: observers on both sides ("a friendly unit" includes the observer itself).
    SB.allUnits(state, unit.owner).forEach(function (obs) {
      SB.fireTriggers(state, 'onFriendlyDamagedSurvives', obs, { sourceUid: obs.uid, damagedUid: unit.uid });
    });
    const srcUnit2 = ctx.sourceUid != null ? SB.findUnit(state, ctx.sourceUid) : null;
    const dealer2 = ctx.dealer != null ? ctx.dealer : (srcUnit2 ? srcUnit2.owner : ctx.controller);
    if (dealer2 != null && dealer2 !== unit.owner) {
      SB.allUnits(state, dealer2).forEach(function (obs) {
        SB.fireTriggers(state, 'onFriendlyDealsDamageToEnemyUnit', obs, { sourceUid: obs.uid, damagedUid: unit.uid });
      });
      if (SB.fireLeaderTrigger) SB.fireLeaderTrigger(state, dealer2, 'onFriendlyDealsDamageToEnemyUnit', { damagedUid: unit.uid });
    }
  };
  // Defeat hooks: remember the victim's power, fire enemy-defeated observers, return
  // control-bonded units, count units leaving play, and route upgrades through
  // SB.removeUpgrade so their own "When Defeated" fires.
  const prevDefeatUnit = SB.defeatUnit;
  SB.defeatUnit = function (state, unit, ctx) {
    if (!SB.findUnit(state, unit.uid)) return;
    ctx = ctx || {};
    ctx.defeatedPower = SB.unitPower(state, unit);
    // Ejecting pilots leave before the defeat; every other upgrade is discarded by the
    // base routine (which also collects their bounties), then their own "When
    // Defeated" and the friendly-upgrade observers fire from here.
    unit.upgrades.slice().forEach(function (inst) {
      if (!inst.leaderPilot && (SB.card(inst.cardId).staticFlags || []).indexOf('ejectOnDefeat') >= 0) SB.removeUpgrade(state, unit, inst, 'defeated');
    });
    const ups = unit.upgrades.slice();
    const bearerTraits = SB.unitTraits(state, unit);
    const owner = unit.owner;
    // Remember the defeated unit's When Defeated abilities for "use it again" effects.
    const wd = SB.unitAllAbilities(state, unit).filter(function (ab) { return ab.trigger === 'whenDefeated'; });
    // Abilities lent by an aura cannot be found once the unit has left the board, so
    // their last words are queued from here.
    const auraWd = [];
    SB.auraGrants(state, unit).forEach(function (g) {
      (g.abilities || []).forEach(function (ab) { if (ab.trigger === 'whenDefeated') auraWd.push(ab); });
    });
    prevDefeatUnit(state, unit, ctx);
    auraWd.forEach(function (ab) {
      SB.queueEffects(state, owner, ab.effects, { sourceUid: unit.uid, cardId: unit.cardId, condition: ab.condition, defeatedPower: ctx.defeatedPower });
    });
    ups.forEach(function (inst) {
      if (inst.leaderPilot) return;
      const card = SB.card(inst.cardId);
      const upOwner = inst.owner != null ? inst.owner : owner;
      (card.abilities || []).forEach(function (ab) {
        if (ab.trigger !== 'whenDefeated') return;
        SB.queueEffects(state, upOwner, ab.effects, { cardId: inst.cardId, upgradeInstUid: inst.uid, bearerUid: unit.uid,
          bearerTraits: bearerTraits, bearerFriendly: owner === upOwner, condition: ab.condition });
      });
      SB.allUnits(state, upOwner).forEach(function (obs) {
        SB.fireTriggers(state, 'onFriendlyUpgradeDefeated', obs, { sourceUid: obs.uid });
      });
    });
    state.leftPlayThisPhase = (state.leftPlayThisPhase || 0) + 1;
    if (wd.length) {
      state.lastWhenDefeated = { controller: unit.owner, effects: [].concat.apply([], wd.map(function (ab) { return ab.effects; })),
        ctx: { sourceUid: unit.uid, cardId: unit.cardId } };
      SB.allUnits(state, unit.owner).forEach(function (obs) {
        SB.fireTriggers(state, 'onWhenDefeatedUsed', obs, { sourceUid: obs.uid });
      });
      if (SB.fireLeaderTrigger) SB.fireLeaderTrigger(state, unit.owner, 'onWhenDefeatedUsed', {});
    }
    SB.allUnits(state, SB.other(unit.owner)).forEach(function (obs) {
      SB.fireTriggers(state, 'onEnemyUnitDefeated', obs, { sourceUid: obs.uid, defeatedUid: unit.uid });
    });
    SB.allUnits(state).filter(function (u) { return u.controlBond && u.controlBond.srcUid === unit.uid; }).forEach(function (u) {
      u.owner = u.controlBond.originalOwner; delete u.controlBond;
      SB.log(state, { type: 'controlTaken', uid: u.uid, by: u.owner, sound: 'claim', notice: true });
    });
  };
  // Bounce also counts as leaving play and releases control bonds.
  const prevReturnHand = O.returnHand;
  O.returnHand = function (state, item, target) {
    const u = SB.findUnit(state, target.uid);
    if (u && (SB.unitDef(u).staticFlags || []).indexOf('noControlChange') >= 0 && u.owner !== item.controller) {
      SB.log(state, { type: 'fizzle', why: 'immune', fizzled: true }); return;
    }
    if (u) {
      const ups = u.upgrades.slice(); u.upgrades = [];
      ups.forEach(function (inst) { SB.removeUpgrade(state, { uid: u.uid, owner: u.owner, upgrades: [inst], cardId: u.cardId }, inst, 'returned'); });
    }
    prevReturnHand(state, item, target);
    if (u && !SB.findUnit(state, u.uid)) {
      state.leftPlayThisPhase = (state.leftPlayThisPhase || 0) + 1;
      SB.allUnits(state).filter(function (x) { return x.controlBond && x.controlBond.srcUid === u.uid; }).forEach(function (x) {
        x.owner = x.controlBond.originalOwner; delete x.controlBond;
      });
    }
  };

  // ---- fireTriggers: the combined ability list, pilot sides, silence --------------
  SB.fireTriggers = function (state, trigger, unit, ctx) {
    SB.unitAllAbilities(state, unit).forEach(function (ab) {
      if (ab.trigger !== trigger) return;
      if (ab.playedTrait && (!ctx || !ctx.playedCardId ||
          (SB.card(ctx.playedCardId).traits || []).indexOf(ab.playedTrait) < 0)) return;
      if (ab.playedUnique && (!ctx || !ctx.playedCardId || !SB.card(ctx.playedCardId).unique)) return;
      if (ab.notCreated && ctx && ctx.created) return;
      if (ab.oncePerRoundTrigger) {
        if (unit.triggerUsedRound === state.round) return;
        unit.triggerUsedRound = state.round;
      }
      SB.queueEffects(state, unit.owner, ab.effects, {
        viaTrigger: true,   // see js/effects.js fireTriggers
        sourceUid: unit.uid, cardId: unit.cardId, condition: ab.condition,
        playedCardId: ctx && ctx.playedCardId, bearerUid: ctx && ctx.bearerUid,
        attackerUid: ctx && ctx.attackerUid, attackTarget: ctx && ctx.attackTarget,
        damagedUid: ctx && ctx.damagedUid, paidCost: ctx && ctx.paidCost,
        defenderDefeated: ctx && ctx.defenderDefeated, healedAmount: ctx && ctx.healedAmount,
        baseDamageDealt: ctx && ctx.baseDamageDealt, attackEndedUid: ctx && ctx.attackEndedUid,
        defeatedUid: ctx && ctx.defeatedUid, playedUid: ctx && ctx.playedUid,
        combat: ctx && ctx.combat, defenderDamagedNonLeader: ctx && ctx.defenderDamagedNonLeader,
        defeatedPower: ctx && ctx.defeatedPower, playedCardCost: ctx && ctx.playedCardCost,
        controller: unit.owner,
      });
    });
  };
  // Aura-granted abilities must not be re-collected through auraGrants of the source
  // itself; auraGrants reads only printed constant abilities, so no cycle.

  // ---- useTarget: '@damaged' -------------------------------------------------------
  const prevDrain = SB.drainQueue;
  SB.drainQueue = function (state) {
    // Rewrite '@damaged' into a stored target before the base driver looks at it.
    if (state.queue.length && state.queue[0].step === 'effect' && state.queue[0].op && state.queue[0].op.useTarget === '@damaged') {
      const it = state.queue[0];
      const uid = it.ctx && it.ctx.damagedUid;
      SB.efx(state, it.ctx || {}).damagedTarget = uid != null ? { kind: 'unit', uid: uid } : null;
      it.op = Object.assign({}, it.op, { useTarget: 'damagedTarget' });
    }
    prevDrain(state);
  };
  // Keep going when a rewritten item is not at the head: apply the same rewrite lazily.
  const prevExecOp = SB.execOp;
  SB.execOp = function (state, item, target) {
    prevExecOp(state, item, target);
    if (state.queue.length && state.queue[0].step === 'effect' && state.queue[0].op && state.queue[0].op.useTarget === '@damaged') {
      const it = state.queue[0];
      const uid = it.ctx && it.ctx.damagedUid;
      SB.efx(state, it.ctx || {}).damagedTarget = uid != null ? { kind: 'unit', uid: uid } : null;
      it.op = Object.assign({}, it.op, { useTarget: 'damagedTarget' });
    }
  };
})(window.SB = window.SB || {});
