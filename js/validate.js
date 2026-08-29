// validate.js — load-time content validation. Call SB.validateContent() after all
// data files load (index.html and tests.html both do). Throw early: a typo caught
// here would otherwise surface as a confusing engine error many turns later.
(function (SB) {
  'use strict';

  const CARD_TYPES = ['unit', 'event', 'upgrade', 'leader', 'base'];
  const ARENAS = ['ground', 'space'];
  const TRIGGERS = ['onPlay', 'onAttack', 'whenDefeated', 'onDeploy', 'onRegroup', 'action',
    'constant', 'onAttackEnds', 'whenAttacked', 'onCardPlayed', 'onUnitPlayed',
    'combatConstant', 'onDefeatUnit', 'bounty', 'onSmuggle', 'onUpgradePlayed',
    'whenCombatDamaged', 'combatAura', 'onOpponentDraw', 'whenHealed',
    'onIndirectUnitDamage', 'onDeployPilot', 'onPlayAsPilot', 'onNonCombatDamage',
    'onForceUnitAttack', 'onRevealOrDiscard', 'onFriendlyAttack',
    'onFriendlyDefeated', 'defenderAura', 'onFriendlyAttackEnds', 'onReadyTax'];
  const ASPECTS = ['command', 'aggression', 'cunning', 'vigilance', 'heroism', 'villainy'];

  function fail(id, msg) { throw new Error('content error [' + id + ']: ' + msg); }

  function checkAbilities(id, def) {
    (def.keywords || []).forEach(function (kw) {
      if (!SB.names.keywords[kw.k]) fail(id, 'unknown keyword ' + kw.k);
    });
    (def.grantKeywords || []).forEach(function (kw) {
      if (!SB.names.keywords[kw.k]) fail(id, 'unknown granted keyword ' + kw.k);
    });
    (def.abilities || []).forEach(function (ab) {
      if (TRIGGERS.indexOf(ab.trigger) < 0) fail(id, 'unknown trigger ' + ab.trigger);
      if (ab.trigger === 'onReadyTax') return; // {amount} shape, no effects list
      if (ab.trigger === 'constant' || ab.trigger === 'combatConstant' ||
          ab.trigger === 'combatAura' || ab.trigger === 'defenderAura') {
        if (!ab.grant) fail(id, 'constant ability without grant');
        (ab.grant.keywords || []).forEach(function (kw) {
          if (!SB.names.keywords[kw.k]) fail(id, 'unknown granted keyword ' + kw.k);
        });
        return;
      }
      if (!Array.isArray(ab.effects) || ab.effects.length === 0) fail(id, 'ability without effects');
      ab.effects.forEach(function (op) {
        if (!SB.ops[op.op]) fail(id, 'unknown op ' + op.op);
      });
    });
  }

  SB.validateContent = function () {
    Object.keys(SB.cards).forEach(function (id) {
      const c = SB.cards[id];
      if (c.id !== id) fail(id, 'id mismatch: ' + c.id);
      if (CARD_TYPES.indexOf(c.type) < 0) fail(id, 'unknown type ' + c.type);
      (c.aspects || []).forEach(function (a) {
        if (ASPECTS.indexOf(a) < 0) fail(id, 'unknown aspect ' + a);
      });
      if (c.type === 'unit') {
        if (ARENAS.indexOf(c.arena) < 0) fail(id, 'unit needs arena');
        if (typeof c.cost !== 'number' || typeof c.power !== 'number' || typeof c.hp !== 'number')
          fail(id, 'unit needs cost/power/hp');
        checkAbilities(id, c);
      } else if (c.type === 'leader') {
        if (!c.leaderSide || !c.deployedSide) fail(id, 'leader needs leaderSide + deployedSide');
        if (typeof c.deployCost !== 'number') fail(id, 'leader needs deployCost');
        if (typeof c.deployedSide.power !== 'number' || typeof c.deployedSide.hp !== 'number')
          fail(id, 'deployedSide needs power/hp');
        checkAbilities(id, c.leaderSide);
        checkAbilities(id, c.deployedSide);
      } else if (c.type === 'base') {
        if (typeof c.hp !== 'number') fail(id, 'base needs hp');
        checkAbilities(id, c);
      } else {
        if (typeof c.cost !== 'number') fail(id, c.type + ' needs cost');
        checkAbilities(id, c);
      }
    });

    Object.keys(SB.decks || {}).forEach(function (deckId) {
      const d = SB.decks[deckId];
      if (!SB.cards[d.leader] || SB.cards[d.leader].type !== 'leader') fail(deckId, 'bad leader ' + d.leader);
      if (!SB.cards[d.base] || SB.cards[d.base].type !== 'base') fail(deckId, 'bad base ' + d.base);
      d.cards.forEach(function (cid) {
        const c = SB.cards[cid];
        if (!c) fail(deckId, 'unknown card ' + cid);
        if (c.type === 'leader' || c.type === 'base') fail(deckId, 'deck contains ' + c.type + ' ' + cid);
      });
      // Copy limit: max 3 of a card id per deck.
      const counts = {};
      d.cards.forEach(function (cid) { counts[cid] = (counts[cid] || 0) + 1; });
      Object.keys(counts).forEach(function (cid) {
        if (counts[cid] > 3) fail(deckId, counts[cid] + ' copies of ' + cid);
      });
    });
  };
})(window.SB = window.SB || {});
