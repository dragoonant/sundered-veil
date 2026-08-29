// text.js — card rules text GENERATED from effect data. Never stored per card.
// Depends on: names.js, rules.js. Every describer here must stay in step with its
// engine counterpart (effects.js / engine.js) — the failure mode is silent: the
// engine enforces something the sentence never says. The text-quality test renders
// every card and catches structural rot (empty text, doubled spaces, case), but
// MEANING drift is only caught by keeping these functions honest.
(function (SB) {
  'use strict';

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function describeTarget(sel) {
    if (!sel) return '';
    if (sel.self) return 'this unit';
    const parts = [];
    if (sel.who === 'friendly') parts.push('friendly');
    if (sel.who === 'enemy') parts.push('enemy');
    if (sel.arena) parts.push(sel.arena);
    if (sel.trait) parts.push(SB.names.traits[sel.trait] || sel.trait);
    let noun = sel.what === 'base' ? 'base' : sel.what === 'unitOrBase' ? 'unit or base' : 'unit';
    let s = 'a ' + (parts.length ? parts.join(' ') + ' ' : '') + noun;
    if (sel.maxCost != null) s += ' that costs ' + sel.maxCost + ' or less';
    if (sel.damaged) s += ' that is damaged';       // engine: selectorCandidates .damaged
    return s;
  }

  // One clause per op. Keep each in step with SB.ops[<op>].
  const opText = {
    damage: function (op) { return 'deal ' + op.amount + ' damage to ' + describeTarget(op.target); },
    heal: function (op) { return 'heal ' + op.amount + ' damage from ' + describeTarget(op.target); },
    draw: function (op) { return 'draw ' + ((op.amount || 1) === 1 ? 'a card' : op.amount + ' cards'); },
    shield: function (op) { return 'give a shield to ' + describeTarget(op.target); },
    experience: function (op) { return 'give an experience token to ' + describeTarget(op.target); },
    buffTemp: function (op) {
      const p = op.power || 0, h = op.hp || 0;
      const stat = (p >= 0 ? '+' : '') + p + '/' + (h >= 0 ? '+' : '') + h;
      return 'give ' + describeTarget(op.target) + ' ' + stat + ' for this round';
    },
    defeat: function (op) { return 'defeat ' + describeTarget(op.target); },
    exhaust: function (op) { return 'exhaust ' + describeTarget(op.target); },
    ready: function (op) { return 'ready ' + describeTarget(op.target); },
    returnHand: function (op) { return 'return ' + describeTarget(op.target) + ' to its owner’s hand'; },
    damageAll: function (op) { return 'deal ' + op.amount + ' damage to each ' + scopeNoun(op.scope); },
    buffAll: function (op) {
      const stat = (op.power >= 0 ? '+' : '') + (op.power || 0) + '/' + (op.hp >= 0 ? '+' : '') + (op.hp || 0);
      return 'give each ' + scopeNoun(op.scope) + ' ' + stat + ' for this round';
    },
    giveKeyword: function (op) {
      return 'give ' + describeTarget(op.target) + ' ' + (SB.names.keywords[op.k] || op.k) + ' for this round';
    },
    discard: function (op) {
      const who = op.who === 'self' ? 'you discard' : 'your opponent discards';
      return who + ' ' + ((op.amount || 1) === 1 ? 'a card' : (op.amount + ' cards')) + ' from their hand';
    },
    discardRandom: function (op) {
      const who = op.who === 'self' ? 'you discard' : 'your opponent discards';
      return who + ' ' + ((op.amount || 1) === 1 ? 'a random card' : (op.amount + ' random cards'));
    },
    createToken: function (op) {
      const n = op.amount || 1;
      const tokenName = SB.names.card(op.token);
      return 'create ' + (n === 1 ? 'a' : n) + ' ' + tokenName + ' token' + (n === 1 ? '' : 's');
    },
    capture: function (op) { return 'capture ' + describeTarget(op.target); },
    healBase: function (op) { return 'heal ' + op.amount + ' damage from your base'; },
    damageOwnBase: function (op) { return 'deal ' + op.amount + ' damage to your base'; },
    indirectDamage: function (op) {
      const who = op.who === 'self' ? 'you distribute' : 'your opponent distributes';
      return who + ' ' + op.amount + ' indirect damage among their units and base';
    },
    searchDeck: function (op) {
      let s = 'search ' + (op.depth ? 'the top ' + op.depth + ' cards of ' : '') + 'your deck for ' + filterNoun(op.filter) + ', reveal it, and draw it';
      return s + ', then shuffle your deck';
    },
    readyResource: function (op) { return 'ready ' + (op.amount || 1) + ' of your resources'; },
    exhaustResource: function (op) {
      const who = op.who === 'self' ? 'your' : 'your opponent’s';
      return 'exhaust ' + (op.amount || 1) + ' of ' + who + ' resources';
    },
    resourceTopDeck: function () { return 'put the top card of your deck into play as a resource'; },
    pickUnit: function (op) { return 'choose ' + describeTarget(op.target); },
    dividedDamage: function (op) {
      return 'deal ' + op.amount + ' damage divided as you choose among ' + scopeNoun(op.scope || { who: 'enemy', what: 'unit' }) + 's';
    },
    attackWith: function (op) {
      let s = 'attack with ' + describeTarget(op.target);
      const perks = [];
      if (op.bonusPower) perks.push('it gets +' + op.bonusPower + '/+0 for this attack');
      if (op.firstStrike) perks.push('it deals its combat damage first');
      if (perks.length) s += ' — ' + perks.join(' and ');
      return s;
    },
    peekTop: function (op) {
      const verbs = { leave: 'leave it on top', bottom: 'put it on the bottom of your deck', discard: 'discard it', play: 'play it' };
      return 'look at the top card of your deck — you may ' + op.modes.map(function (m) { return verbs[m]; }).join(', or ');
    },
    playFromHand: function (op) {
      let s = 'play ' + filterNoun(op.filter) + ' from your hand';
      const perks = [];
      if (op.discount) perks.push('it costs ' + op.discount + ' less');
      if (op.entersReady) perks.push('it enters play ready');
      if (op.defeatAtRegroup) perks.push('defeat it at the start of the regroup phase');
      if (perks.length) s += ' — ' + perks.join(', ');
      return s;
    },
    mill: function (op) {
      return 'discard ' + ((op.amount || 1) === 1 ? 'the top card' : 'the top ' + op.amount + ' cards') + ' of your deck';
    },
    binaryChoice: function (op) {
      const chooser = op.chooser === 'opponent' ? 'your opponent chooses' : 'choose';
      return chooser + ' one — ' + describeEffectList(op.a.effects) + '; or ' + describeEffectList(op.b.effects);
    },
    selfToResource: function () { return 'put this card into play as a resource'; },
    healFull: function (op) { return 'heal all damage from ' + describeTarget(op.target); },
    stunExhaust: function (op) { return 'exhaust ' + describeTarget(op.target) + ' — it cannot ready this round'; },
    opponentMayReady: function () { return 'your opponent may ready one of their units'; },
  };

  function describeEffectList(effects) {
    return effects.map(function (op) {
      const fn = opText[op.op];
      if (!fn) throw new Error('no text for op ' + op.op);
      return fn(op);
    }).join(', then ');
  }

  function scopeNoun(sel) {
    return describeTarget(sel).replace(/^a /, '');
  }
  function filterNoun(f) {
    f = f || {};
    const parts = [];
    if (f.aspect) parts.push(SB.names.aspects[f.aspect] || f.aspect);
    if (f.trait) parts.push(SB.names.traits[f.trait] || f.trait);
    let noun = f.type ? f.type : 'card';
    let s = 'a ' + (parts.length ? parts.join(' ') + ' ' : '') + noun;
    if (f.maxCost != null) s += ' that costs ' + f.maxCost + ' or less';
    return s;
  }

  const triggerText = {
    onPlay: 'When played',
    onAttack: 'On attack',
    whenDefeated: 'When defeated',
    onDeploy: 'When deployed',
    onRegroup: 'At the start of the regroup phase',
    onAttackEnds: 'After this unit attacks',
    whenAttacked: 'When this unit is attacked',
    onCardPlayed: 'When you play another card',
    onUnitPlayed: 'When you play another unit',
    onDefeatUnit: 'When this unit defeats an enemy unit in combat',
  };

  const conditionText = {
    controlUnitWithTrait: function (c) {
      return 'if you control another ' + (SB.names.traits[c.trait] || c.trait) + ' unit';
    },
    hasInitiative: function () { return 'if you have the initiative'; },
    baseDamaged: function () { return 'if your base is damaged'; },
    enemyBaseDamaged: function () { return 'if the enemy base is damaged'; },
    resourcesAtLeast: function (c) { return 'while you control ' + c.n + ' or more resources'; },
    playedAspectThisPhase: function (c) {
      return 'if you played a ' + (SB.names.aspects[c.aspect] || c.aspect) + ' card this phase';
    },
    playedCardThisPhase: function () { return 'if you played a card this phase'; },
    friendlyDefeatedThisPhase: function () { return 'if a friendly unit was defeated this phase'; },
    attachedIs: function () { return 'if attached to the named champion'; },
    controlCard: function () { return 'if you control the named champion'; },
    milledNonUnit: function () { return 'if the discarded card was not a unit'; },
    saved: function (c) { return c.not ? 'if no target was chosen' : 'if a target was chosen'; },
    selfDamaged: function () { return 'if this unit is damaged'; },
    controlMoreUnitsThanOpponent: function () { return 'if you control more units than the opponent'; },
  };

  function describeAbility(ab) {
    if (ab.trigger === 'combatConstant') {
      // Keep in step with combatMods in engine.js.
      const g = ab.grant || {};
      const parts = [];
      if (g.power || g.hp) parts.push('gets +' + (g.power || 0) + '/+' + (g.hp || 0));
      if (g.powerPerSelfDamage) parts.push('gets +' + g.powerPerSelfDamage + '/+0 for each damage on it');
      (g.keywords || []).forEach(function (kw) {
        parts.push('gains ' + (SB.names.keywords[kw.k] || kw.k));
      });
      let when = 'While attacking';
      if (ab.condition && ab.condition.if === 'defenderDamaged') when = 'While attacking a damaged unit';
      return when + ', this unit ' + parts.join(' and ') + '.';
    }
    if (ab.trigger === 'constant') {
      // Keep in step with SB.auraGrants in ops.js.
      const g = ab.grant;
      const parts = [];
      if (g.power || g.hp) parts.push('gets +' + (g.power || 0) + '/+' + (g.hp || 0));
      (g.keywords || []).forEach(function (kw) {
        parts.push('gains ' + (SB.names.keywords[kw.k] || kw.k) + (kw.n != null ? ' ' + kw.n : ''));
      });
      const scope = ab.scope && !ab.scope.self ? 'Each ' + scopeNoun(ab.scope) : 'This unit';
      let s = scope + ' ' + parts.join(' and ') + '.';
      if (ab.condition) {
        const cf = conditionText[ab.condition.if];
        if (!cf) throw new Error('no text for condition ' + ab.condition.if);
        s = cap(cf(ab.condition)) + ', ' + s.charAt(0).toLowerCase() + s.slice(1);
      }
      return s;
    }
    const clauses = ab.effects.map(function (op) {
      const fn = opText[op.op];
      if (!fn) throw new Error('no text for op ' + op.op);
      let s = fn(op);
      if (op.target && op.target.optional) s = s.replace(/^([a-z]+)/, 'you may $1');
      return s;
    });
    let body = clauses.join(', then ');
    if (ab.condition) {
      const cf = conditionText[ab.condition.if];
      if (!cf) throw new Error('no text for condition ' + ab.condition.if);
      body = cf(ab.condition) + ', ' + body;
    }
    if (ab.trigger === 'action') {
      const cost = [];
      if (ab.cost) cost.push('spend ' + ab.cost + ' resource' + (ab.cost === 1 ? '' : 's'));
      cost.push('exhaust');
      return 'Action [' + cost.join(', ') + ']: ' + cap(body) + '.';
    }
    return triggerText[ab.trigger] + ': ' + cap(body) + '.';
  }

  function describeKeyword(kw) {
    const name = SB.names.keywords[kw.k];
    if (!name) throw new Error('no display name for keyword ' + kw.k);
    return kw.n != null ? name + ' ' + kw.n : name;
  }

  // Full rules text for a card id, as an array of lines.
  SB.cardText = function (cardId) {
    const card = SB.card(cardId);
    const lines = [];
    function block(def, label) {
      const kws = (def.keywords || []).map(describeKeyword);
      if (kws.length) lines.push((label ? label + ': ' : '') + kws.join(', '));
      (def.abilities || []).forEach(function (ab) {
        lines.push((label ? label + ': ' : '') + describeAbility(ab));
      });
      (def.grantKeywords || []).forEach(function (kw) {
        lines.push('Attached unit gains ' + describeKeyword(kw) + '.');
      });
    }
    if (card.type === 'leader') {
      block(card.leaderSide, 'Leader');
      lines.push('Epic Action: deploy this leader when you control ' + card.deployCost + ' or more resources.');
      block(card.deployedSide, 'Unit');
    } else {
      block(card);
      if (card.type === 'upgrade') {
        const p = card.power || 0, h = card.hp || 0;
        if (p || h) lines.unshift('Attached unit gets +' + p + '/+' + h + '.');
      }
    }
    return lines;
  };
})(window.SB = window.SB || {});
