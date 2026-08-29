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
  };

  const triggerText = {
    onPlay: 'When played',
    onAttack: 'On attack',
    whenDefeated: 'When defeated',
    onDeploy: 'When deployed',
    onRegroup: 'At the start of the regroup phase',
  };

  const conditionText = {
    controlUnitWithTrait: function (c) {
      return 'if you control another ' + (SB.names.traits[c.trait] || c.trait) + ' unit';
    },
    hasInitiative: function () { return 'if you have the initiative'; },
    baseDamaged: function () { return 'if your base is damaged'; },
  };

  function describeAbility(ab) {
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
