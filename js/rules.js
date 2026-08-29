// rules.js — derived-value helpers shared by engine, AI, and UI.
// Depends on: util.js, card data (SB.cards). No state mutation anywhere in this file.
(function (SB) {
  'use strict';

  SB.card = function (cardId) {
    const c = SB.cards[cardId];
    SB.assert(c, 'unknown card ' + cardId);
    return c;
  };

  // The card definition governing a unit in an arena. Deployed leaders use the
  // deployedSide block; everything else uses the card root.
  SB.unitDef = function (unit) {
    const c = SB.card(unit.cardId);
    return c.type === 'leader' ? c.deployedSide : c;
  };

  function upgradeDefs(unit) {
    return unit.upgrades.map(function (inst) { return SB.card(inst.cardId); });
  }

  SB.unitKeywords = function (state, unit) {
    // Keyword instances from the unit itself plus its upgrades. Duplicate keywords
    // stack for numeric ones (raid, restore) and are redundant for boolean ones.
    let kws = (SB.unitDef(unit).keywords || []).slice();
    upgradeDefs(unit).forEach(function (u) {
      kws = kws.concat(u.grantKeywords || []);
    });
    return kws;
  };

  SB.hasKeyword = function (state, unit, k) {
    return SB.unitKeywords(state, unit).some(function (kw) { return kw.k === k; });
  };

  SB.keywordTotal = function (state, unit, k) {
    return SB.unitKeywords(state, unit).reduce(function (sum, kw) {
      return sum + (kw.k === k ? (kw.n || 0) : 0);
    }, 0);
  };

  SB.unitPower = function (state, unit) {
    const def = SB.unitDef(unit);
    let p = def.power + unit.temp.power + unit.experience;
    upgradeDefs(unit).forEach(function (u) { p += (u.power || 0); });
    if (SB.hasKeyword(state, unit, 'grit')) p += unit.damage;
    return Math.max(0, p);
  };

  SB.unitMaxHp = function (state, unit) {
    const def = SB.unitDef(unit);
    let h = def.hp + unit.temp.hp + unit.experience;
    upgradeDefs(unit).forEach(function (u) { h += (u.hp || 0); });
    return h;
  };

  SB.unitRemainingHp = function (state, unit) {
    return SB.unitMaxHp(state, unit) - unit.damage;
  };

  // Aspect icons available to a player: leader icons + base icon(s).
  SB.playerAspects = function (state, playerIdx) {
    const p = state.players[playerIdx];
    return (SB.card(p.leader.cardId).aspects || [])
      .concat(SB.card(p.base.cardId).aspects || []);
  };

  // Cost after aspect penalty: +2 per aspect icon on the card not matched by an
  // available icon (icons are consumed per copy: a double-aggression card needs
  // two aggression icons to avoid penalty).
  SB.cardCost = function (state, playerIdx, cardId) {
    const card = SB.card(cardId);
    const avail = SB.playerAspects(state, playerIdx).slice();
    let penalty = 0;
    (card.aspects || []).forEach(function (a) {
      const i = avail.indexOf(a);
      if (i >= 0) avail.splice(i, 1); else penalty += 2;
    });
    return card.cost + penalty;
  };

  SB.readyResources = function (state, playerIdx) {
    return state.players[playerIdx].resources.filter(function (r) { return !r.exhausted; }).length;
  };

  SB.allUnits = function (state, playerIdx) {
    const all = state.ground.concat(state.space);
    return playerIdx == null ? all : all.filter(function (u) { return u.owner === playerIdx; });
  };

  SB.arenaOf = function (state, unit) {
    return state.ground.indexOf(unit) >= 0 ? 'ground' : 'space';
  };

  SB.findUnit = function (state, uid) {
    return SB.allUnits(state).find(function (u) { return u.uid === uid; }) || null;
  };
})(window.SB = window.SB || {});
