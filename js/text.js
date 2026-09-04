// text.js — card rules text GENERATED from effect data. Never stored per card.
// Depends on: names.js, rules.js. Every describer here must stay in step with its
// engine counterpart (effects.js / engine.js) — the failure mode is silent: the
// engine enforces something the sentence never says. The text-quality test renders
// every card and catches structural rot (empty text, doubled spaces, case), but
// MEANING drift is only caught by keeping these functions honest.
(function (SB) {
  'use strict';

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // 'an' by sound, not spelling: 'a unit', 'a used card' but 'an Umbra unit'.
  function an(phrase) { return (/^[aeiou]/i.test(phrase) && !/^u(ni|se)/i.test(phrase) ? 'an ' : 'a ') + phrase; }

  // A stat modifier prints as a matched pair (-2/-0, +1/+0): a zero half takes the
  // sign of the other half rather than defaulting to '+'.
  function statPair(p, h) {
    p = p || 0; h = h || 0;
    const neg = (p < 0 || h < 0);
    const one = v => (v < 0 ? '' : (neg ? '-' : '+')) + v;
    return one(p) + '/' + one(h);
  }
  function describeTarget(sel) {
    if (!sel) return '';
    if (sel.self) return 'this unit';
    const parts = [];
    if (sel.who === 'friendly') parts.push('friendly');
    if (sel.who === 'enemy') parts.push('enemy');
    if (sel.arena) parts.push(sel.arena);
    if (sel.aspect) parts.push(SB.names.aspects[sel.aspect] || sel.aspect);
    if (sel.trait) parts.push(SB.names.traits[sel.trait] || sel.trait);
    let noun = sel.what === 'base' ? 'base' : sel.what === 'unitOrBase' ? 'unit or base' : 'unit';
    if (sel.leader) noun = 'leader ' + noun;
    const head = (parts.length ? parts.join(' ') + ' ' : '') + noun;
    // notSelf / notSavedAs: the engine excludes the source unit / an already-chosen
    // unit, so the sentence must say "another", not "a".
    let s = (sel.notSelf || sel.notSavedAs) ? 'another ' + head : an(head);
    if (sel.maxCost != null) s += ' that costs ' + sel.maxCost + ' or less';
    if (sel.minCost != null) s += ' that costs ' + sel.minCost + ' or more';
    if (sel.minPower != null) s += ' with power ' + sel.minPower + ' or more';
    if (sel.maxPower != null) s += ' with power ' + sel.maxPower + ' or less';
    if (sel.maxCostRefPlayed) s += ' that costs no more than the played card';
    if (sel.tokenOnly) s = s.replace(/unit$/, 'token unit');
    if (sel.traitOrCards) s += ' (of the matching kind or the named champion)';
    if (sel.pilotish) s += ' that is a pilot or carries one';
    if (sel.noPilot) s += ' without a pilot';
    if (sel.anyTrait) s += ' of an eligible kind';
    if (sel.hasExperience) s += ' that has an experience token';
    if (sel.hasSentinel) s += ' with Sentinel';
    if (sel.remHpLessThanSourcePower) s += ' with less remaining HP than this unit’s power';
    if (sel.remHpLessThanSourceRemHp) s += ' with less remaining HP than the attached unit';
    if (sel.maxRemHp != null) s += ' with ' + sel.maxRemHp + ' or less remaining HP';
    if (sel.powerLessThanSource) s += ' with less power than this unit';
    if (sel.exhaustedOnly) s += ' that is exhausted';
    if (sel.nonLeader) s += ' (non-leader)';
    if (sel.nonUnique) s += ' (non-champion)';
    if (sel.damagedBaseThisPhase) s += ' that dealt damage to a base this phase';
    if (sel.sharesTraitWithFriendlyLeader) s += ' that shares a kind with a friendly leader';
    if (sel.sameArenaAsSaved) s += ' in the same arena as the chosen unit';
    if (sel.powerLteSaved) s += ' with power no greater than the chosen unit’s';
    if (sel.costGtLastDiscarded) s += ' that costs more than the discarded card';
    if (sel.damaged) s += ' that is damaged';       // engine: selectorCandidates .damaged
    if (sel.notTrait) s += ' that isn’t ' + an((SB.names.traits[sel.notTrait] || sel.notTrait) + ' unit');
    if (sel.playedThisRound) s += ' that entered play this round';
    // Keys added by js/ops2.js (SB.extraSelector).
    if (sel.minRemHp != null) s += ' with ' + sel.minRemHp + ' or more remaining HP';
    if (sel.upgraded) s += ' that has an upgrade';
    if (sel.powerLessThanSomeFriendly) s += ' with less power than a friendly unit';
    if (sel.sameArenaAsPlayed) s += ' in the same arena as the played unit';
    if (sel.sameArenaAsSource) s += ' in this unit’s arena';
    if (sel.maxCostRefMilled) s += ' that costs no more than the discarded card';
    if (sel.notCardIs) s += ' other than this card';
    if (sel.arenaRef) s += ' in the chosen arena';
    if (sel.aspectRef) s += ' of the chosen aspect';
    if (sel.hasShieldOrExperience) s += ' carrying a shield or experience token';
    if (sel.notLeaderPilotBearer) s += ' not carrying a leader';
    if (sel.token === false) s += ' (non-token)';
    return s;
  }

  // Where a target was chosen by an earlier op (useTarget), or an amount is a
  // reference, describe them symbolically. Keep in step with SB.resolveAmount.
  function targetText(op) {
    if (op.useTarget === '@defender') return 'the defender';
    if (op.useTarget === '@damaged') return 'the damaged unit';
    if (op.useTarget === '@played') return 'the played unit';
    if (op.useTarget === '@attackEnded') return 'the attacking unit';
    if (op.useTarget) return 'the chosen unit';
    return describeTarget(op.target);
  }
  function amountText(op) {
    if (op.amountRef == null) return String(op.amount);
    if (op.amountRef === 'lastHealed') return 'that much';
    if (op.amountRef === 'excess') return 'the excess';
    if (op.amountRef === 'friendlyInTargetArena') return 'as much as the number of friendly units in its arena';
    if (/^powerOf:/.test(op.amountRef)) return 'as much as the chosen unit’s power';
    if (op.amountRef === 'powerOfSource') return 'as much as this unit’s power in';
    if (op.amountRef === 'distinctDiscardCosts') return '1 for each different cost among cards in your discard pile';
    if (op.amountRef === 'oddFriendlyCount') return '1 for each friendly unit or upgrade with an odd cost';
    if (op.amountRef === 'targetRemHpMinus1') return '1 less than its remaining HP in';
    if (/^stored:/.test(op.amountRef)) return 'that much';
    if (op.amountRef === 'healedAmount') return 'that much';
    if (op.amountRef === 'baseDamageDealt') return 'that much';
    if (op.amountRef === 'otherFriendlyCount') return '1 for each other friendly unit';
    if (op.amountRef === 'distinctFriendlyAspects') return '1 for each different aspect among your units';
    // Refs added by js/ops2.js (SB.extraAmounts).
    if (op.amountRef === 'powerOfPlayed') return 'as much as the played unit’s power in';
    if (op.amountRef === 'friendlySpaceCount') return '1 for each friendly space unit';
    if (op.amountRef === 'handSize') return '1 for each card in your hand';
    if (op.amountRef === 'defeatedPower') return 'as many as this unit’s power';
    if (op.amountRef === 'playedCardCost') return 'as much as that card’s cost in';
    if (op.amountRef === 'creditsOwned') return '1 for each of your credit tokens';
    if (/^remHpOf:/.test(op.amountRef)) return 'as much as the chosen unit’s remaining HP in';
    return String(op.amount);
  }

  // A counted amount reads as a trailing "equal to …" clause: 'deal damage to a unit
  // equal to the number of cards in your hand'. Keep in step with SB.resolveAmount and
  // SB.extraAmounts (js/ops2.js).
  function countPhrase(ref) {
    if (ref == null) return null;
    const fixed = {
      lastHealed: 'the damage healed this way', healedAmount: 'the damage healed', excess: 'the excess damage',
      friendlyInTargetArena: 'the number of friendly units in its arena', otherFriendlyCount: 'the number of other friendly units',
      baseDamageDealt: 'the damage dealt to the base', distinctFriendlyAspects: 'the number of different aspects among your units',
      powerOfSource: 'this unit’s power', oddFriendlyCount: 'the number of friendly units and upgrades with an odd cost',
      targetRemHpMinus1: 'its remaining HP minus 1', distinctDiscardCosts: 'the number of different costs among cards in your discard pile',
      powerOfPlayed: 'the played unit’s power', friendlySpaceCount: 'the number of friendly space units', handSize: 'the number of cards in your hand',
      defeatedPower: 'this unit’s power', playedCardCost: 'that card’s cost', creditsOwned: 'the number of your credit tokens',
    };
    if (fixed[ref]) return fixed[ref];
    if (/^powerOf:/.test(ref)) return 'the chosen unit’s power';
    if (/^remHpOf:/.test(ref)) return 'the chosen unit’s remaining HP';
    if (/^stored:/.test(ref)) return 'that amount';
    return 'that amount';
  }
  function dealText(verb, op, what, to) {
    // verb: 'deal' | 'heal'; what: 'damage'; to: the target phrase
    if (op.amountRef != null) return verb + ' ' + what + ' ' + to + ' equal to ' + countPhrase(op.amountRef);
    return verb + ' ' + op.amount + ' ' + what + ' ' + to;
  }

  // One clause per op. Keep each in step with SB.ops[<op>].
  const opText = {
    damage: function (op) { return dealText('deal', op, 'damage', 'to ' + targetText(op)); },
    heal: function (op) { return dealText('heal', op, 'damage', 'from ' + targetText(op)); },
    draw: function (op) { return 'draw ' + ((op.amount || 1) === 1 ? 'a card' : op.amount + ' cards'); },
    shield: function (op) { return 'give a shield to ' + targetText(op); },
    experience: function (op) {
      if (op.amountRef != null) return 'give an experience token to ' + targetText(op) + ' ' + amountText(op).replace(/^1 /, '');
      return 'give ' + ((op.amount||1)===1?'an experience token':op.amount+' experience tokens') + ' to ' + targetText(op);
    },
    buffTemp: function (op) {
      const p = op.power || 0, h = op.hp || 0;
      const stat = statPair(p, h);
      return 'give ' + targetText(op) + ' ' + stat + ' for this round';
    },
    defeat: function (op) { return 'defeat ' + targetText(op); },
    exhaust: function (op) { return 'exhaust ' + targetText(op); },
    ready: function (op) { return 'ready ' + targetText(op); },
    returnHand: function (op) { return 'return ' + targetText(op) + ' to its owner’s hand'; },
    damageAll: function (op) { return dealText('deal', op, 'damage', 'to each ' + scopeNoun(op.scope)); },
    buffAll: function (op) {
      const stat = statPair(op.power, op.hp);
      return 'give each ' + scopeNoun(op.scope) + ' ' + stat + ' for this round';
    },
    giveKeyword: function (op) {
      return 'give ' + targetText(op) + ' ' + (SB.names.keywords[op.k] || op.k) + ' for this round';
    },
    discard: function (op) {
      const who = op.who === 'self' ? 'you discard' : 'your opponent discards';
      const f = op.filter || {};
      const what = f.type ? an(f.type) : f.notType ? 'a non-' + f.notType + ' card' : 'a card';
      return who + ' ' + ((op.amount || 1) === 1 ? what : (op.amount + ' cards')) + ' from their hand';
    },
    discardRandom: function (op) {
      const who = op.who === 'self' ? 'you discard' : 'your opponent discards';
      return who + ' ' + ((op.amount || 1) === 1 ? 'a random card' : (op.amount + ' random cards'));
    },
    createToken: function (op) {
      const n = op.amount || 1;
      const tokenName = SB.names.card(op.token);
      let s = (op.forOpponent ? 'the opponent creates ' : 'create ') + (n === 1 ? an(tokenName + ' token') : n + ' ' + tokenName + ' tokens');
      if (op.ready) s += ' and ready ' + (n === 1 ? 'it' : 'them');
      return s;
    },
    capture: function (op) { return 'capture ' + describeTarget(op.target); },
    healBase: function (op) { return 'heal ' + amountText(op) + ' damage from your base'; },
    damageOwnBase: function (op) { return 'deal ' + op.amount + ' damage to your base'; },
    indirectDamage: function (op) {
      const who = op.who === 'self' ? 'you distribute' :
        op.who === 'defending' ? 'the defending player distributes' : 'your opponent distributes';
      return who + ' ' + amountText(op) + ' indirect damage among their units and base';
    },
    searchDeck: function (op) {
      const n = op.take || 1;
      const it = n > 1 ? 'them' : 'it';
      let verb;
      if (op.budget != null) {
        return 'search the top ' + op.depth + ' cards of your deck for any number of ' + filterNoun(op.filter).replace(/^an? /, '') +
          's with combined cost ' + op.budget + ' or less and play them for free, then shuffle';
      }
      else if (op.discardIt) verb = ' and discard ' + it;
      else if (op.resourceIt) verb = ' and put ' + it + ' into play as a resource';
      else if (op.attachToSaved) verb = ' that can attach to the chosen unit and play it on that unit' + (op.playDiscount ? ' for ' + op.playDiscount + ' less' : '');
      else if (op.playIt) verb = ', reveal ' + it + ', and play ' + it + (op.playDiscount ? ' for ' + op.playDiscount + ' less' : '') +
        (op.entersReady ? ' — it enters play ready' : '') + (op.returnAtRegroup ? ' and returns to hand at the start of the regroup phase' : '');
      else verb = ', reveal ' + it + ', and draw ' + it;
      const whose = op.who === 'opponent' ? 'the opponent searches the top cards of their deck' : null;
      const depth = op.depthRef ? 'twice that many cards of ' : (op.depth ? 'the top ' + op.depth + ' cards of ' : '');
      let s = whose ? whose + ' (' + (op.depthRef ? 'twice that many' : op.depth) + ') for ' + filterNoun(op.filter, n) + verb
        : 'search ' + depth + 'your deck for ' + filterNoun(op.filter, n) + verb;
      return s + ', then shuffle';
    },
    readyResource: function (op) {
      const whose = op.who === 'opponent' ? 'the opponent readies 1 of their resources' : null;
      if (whose) return whose;
      if (op.amountRef != null) return 'ready 1 of your resources ' + amountText(op).replace(/^1 /, '');
      return 'ready ' + (op.amount || 1) + ' of your resources';
    },
    exhaustResource: function (op) {
      const who = op.who === 'self' ? 'your' : 'your opponent’s';
      return 'exhaust ' + (op.amount || 1) + ' of ' + who + ' resources';
    },
    resourceTopDeck: function () { return 'put the top card of your deck into play as a resource'; },
    pickUnit: function (op) { return 'choose ' + describeTarget(op.target); },
    dividedDamage: function (op) {
      const among = ' divided as you choose among ' + scopeNounPlural(op.scope || { who: 'enemy', what: 'unit' });
      if (op.amountRef != null) return 'deal damage' + among + ' equal to ' + countPhrase(op.amountRef);
      return 'deal ' + op.amount + ' damage' + among;
    },
    attackWith: function (op) {
      let s = 'attack with ' + (op.useTarget ? 'the chosen unit' : describeTarget(op.target));
      if (op.optionalAttack) s = 'you may ' + s;
      const perks = [];
      if (op.bonusPower) perks.push('it gets +' + op.bonusPower + '/+0 for this attack');
      if (op.firstStrike) perks.push('it deals its combat damage first');
      if (op.ready) perks.push('it may attack even while exhausted');
      if (op.unitsOnly) perks.push('it cannot attack a base this way');
      if (op.bonusIfOddCostsDiffer) perks.push('if the revealed card and that unit have different odd costs, it gets +' + op.bonusIfOddCostsDiffer + '/+0');
      if (op.bonusIfTrait) perks.push(an((SB.names.traits[op.bonusIfTrait.trait] || op.bonusIfTrait.trait) + ' unit') + ' gets +' + op.bonusIfTrait.amount + '/+0 for this attack');
      if (op.grantSaboteurForAttack) perks.push('it gains Saboteur for this round');
      if (op.grantTempAbility) perks.push('for this round it gains: ' + JSON.stringify(describeAbilityLate(op.grantTempAbility)));
      if (op.bonusPowerRef) perks.push('it gets +1/+0 for this attack ' + amountText({ amountRef: op.bonusPowerRef }).replace(/^1 /, ''));
      if (op.abilitiesFromDiscarded) perks.push('for this round it gains the discarded card’s abilities');
      if (op.defenderFirst) perks.push('the defender deals its combat damage first');
      if (perks.length) s += ' — ' + perks.join(' and ');
      return s;
    },
    peekTop: function (op) {
      const play = op.free ? 'play it for free' : op.discount ? 'play it for ' + op.discount + ' less' : 'play it';
      const verbs = { leave: 'leave it on top', bottom: 'put it on the bottom of your deck', discard: 'discard it', play: play };
      return 'look at the top card of your deck — you may ' + op.modes.map(function (m) { return verbs[m]; }).join(', or ');
    },
    playFromHand: function (op) {
      const f = op.filter || {};
      const zones = op.zones || ['hand'];
      const from = zones.map(function (z) {
        return { hand: 'your hand', discard: 'your discard pile', resources: 'your resources', opponentDiscard: 'the opponent’s discard pile' }[z] || z;
      }).join(' or ');
      let what = (f.uidIs != null || f.uidRef) ? 'that card' : f.cardIsRef ? 'the found card' : filterNoun(f);
      if (f.cardIsRef && f.maxCost != null) what += ', if it costs ' + f.maxCost + ' or less,';
      let s = 'play ' + what + ' from ' + from;
      if (f.requiresPenalty) s += ' that you would owe an aspect penalty for';
      if (f.bearerPlayedThisRound) s += ' on a unit that entered play this round';
      if (f.bearerFriendly) s += ' on a friendly unit';
      if (f.bearerRef) s += ' on the chosen unit';
      if (op.free) s += ' for free';
      const perks = [];
      if (!op.free && op.discount) perks.push('it costs ' + op.discount + ' less');
      if (op.entersReady) perks.push('it enters play ready');
      if (op.withHidden) perks.push('it gains Hidden for this round');
      if (op.withAmbush) perks.push('it gains Ambush for this round');
      if (op.defeatAtRegroup) perks.push('defeat it at the start of the regroup phase');
      if (op.returnAtRegroup) perks.push('return it to hand at the start of the regroup phase');
      if (perks.length) s += ' — ' + perks.join(', ');
      return (op.optional === true ? 'you may ' : '') + s;
    },
    mill: function (op) {
      return 'discard ' + ((op.amount || 1) === 1 ? 'the top card' : 'the top ' + op.amount + ' cards') + ' of your deck';
    },
    binaryChoice: function (op) {
      const chooser = op.chooser === 'opponent' ? 'your opponent chooses' : 'choose';
      return chooser + ' one — ' + describeEffectList(op.a.effects) + '; or ' + describeEffectList(op.b.effects);
    },
    selfToResource: function () { return 'put this card into play as a resource'; },
    healFull: function (op) { return 'heal all damage from ' + targetText(op); },
    stunExhaust: function (op) { return 'exhaust ' + targetText(op) + ' — it cannot ready this round'; },
    opponentMayReady: function () { return 'your opponent may ready one of their units'; },
    grantAbilityTemp: function (op) {
      return 'until end of round, ' + targetText(op) + ' gains: ' + JSON.stringify(describeAbilityPublic(op.ability));
    },
    attackBonus: function (op) {
      const parts = [];
      if (op.amount) parts.push('this unit gets ' + statPair(op.amount, 0) + ' for this attack');
      if (op.defenderDelta) parts.push('the defender gets ' + statPair(op.defenderDelta, 0) + ' for this attack');
      return parts.join(' and ') || 'modify this attack';
    },
    exhaustFriendlyForBonus: function (op) {
      return 'you may exhaust ' + describeTarget(op.target) + ' — if you do, this unit gets ' + statPair(op.amount, 0) + ' for this attack';
    },
    collectBountiesOf: function (op) { return 'collect the bounties on ' + targetText(op); },
    selfDefeatedToResource: function () { return 'put this card into play as a ready resource'; },
    defeatCountUpgrades: function (op) { return 'defeat ' + targetText(op) + ', counting its upgrades'; },
    repeat: function (op) {
      const fn = opText[op.effect.op];
      return 'that many times, ' + (fn ? fn(op.effect) : op.effect.op);
    },
    millMatchBaseAspect: function () {
      return 'discard the top card of your deck — if it shares an aspect with your base, take it into hand instead';
    },
    moveUpgrade: function () { return 'move an upgrade to another eligible unit with the same controller'; },
    defeatUpgrade: function (op) {
      let s = 'defeat ' + (op.nonUniqueOnly ? 'a basic' : op.nonLeaderOnly ? 'a non-leader' : 'an') + ' upgrade';
      if (op.friendlyOnly) s += ' on a friendly unit';
      if (op.bearerArena) s += ' on a ' + op.bearerArena + ' unit';
      return op.optional ? 'you may ' + s : s;
    },
    upgradeFromDiscard: function () { return 'you may return an upgrade from your discard pile to your hand'; },
    bondBuff: function (op) {
      return 'while this unit is in play, ' + targetText(op) + ' gets ' + statPair(op.power, op.hp);
    },
    grantDiscount: function (op) {
      const noun = filterNoun(op.filter).replace(/^an? /, '');
      if ((op.count || 1) === 1) return 'the next ' + noun + ' you play this round costs ' + op.amount + ' less';
      return 'each of the next ' + op.count + ' ' + noun + 's you play this round costs ' + op.amount + ' less';
    },
    takeFromDiscard: function (op) {
      return 'you may return ' + filterNoun(op.filter) + (op.filter && op.filter.defeatedThisPhase ? ' defeated this phase' : '') + ' from your discard pile to your hand';
    },
    eachPlayerDefeatOwn: function (op) {
      return (op.opponentOnly ? 'your opponent chooses' : 'each player chooses') + ' and defeats a non-leader unit they control';
    },
    massExhaustForBaseDamage: function () {
      return 'exhaust any number of eligible friendly units — deal 1 damage to the defending base for each';
    },
    bottomFromHand: function (op) { return 'put ' + op.amount + ' cards from your hand on the bottom of your deck'; },
    defeatUpgradeOn: function () { return 'you may defeat a basic upgrade on that unit'; },
    millBothCountOdd: function (op) { return 'discard ' + (op.amount || 3) + ' cards from each deck, counting odd costs'; },
    readyAll: function (op) { return 'ready each ' + scopeNoun(op.scope); },
    spendResources: function (op) { return 'pay ' + op.amount + ' resource' + (op.amount === 1 ? '' : 's'); },
    moveSelfArena: function (op) { return 'move this unit to the ' + (op.to || 'other') + ' arena'; },
    takeControl: function (op) {
      let s = 'take control of ' + targetText(op);
      if (op.ready) s += ' and ready it';
      if (op.returnAtRegroup) s += ' — return it to its owner at the start of the next regroup phase';
      if (op.untilSourceLeaves) s += ' — its owner takes it back when this unit leaves play';
      return s;
    },
    revealTop: function () { return 'reveal the top card of your deck'; },
    gainForce: function () { return 'you gain your power token'; },
    useForce: function () { return 'spend your power token'; },
    defeatAll: function (op) { return 'defeat each ' + scopeNoun(op.scope) + (op.saveEnemyCountAs ? ', counting the enemy units defeated' : ''); },
    removeExperience: function (op) { return 'remove an experience token from ' + targetText(op); },
    attackerPowerDelta: function (op) { return 'the attacker gets ' + statPair(op.amount, 0) + ' for this attack'; },
    exhaustBudget: function (op) { return 'exhaust any number of units with combined cost ' + op.budget + ' or less'; },
    payForExperience: function (op) { return 'pay up to ' + op.max + ' resources — this unit gains an experience token for each'; },
    bottomFromDiscard: function (op) {
      if ((op.upTo || 1) === 1) return 'you may put ' + filterNoun(op.filter) + ' from your discard pile on the bottom of your deck';
      return 'put up to ' + op.upTo + ' ' + filterNoun(op.filter).replace(/^an? /, '') + 's from your discard pile on the bottom of your deck';
    },
    echoNextOnPlay: function () { return 'the next time you use a when-played ability this round, use it again'; },
    discloseReveal: function (op) {
      return (op.who === 'opponent' ? 'the opponent reveals cards from their hand showing these icons: ' : 'reveal cards from your hand showing these icons: ') +
        (op.aspects || []).map(function (a) { return SB.names.aspects[a] || a; }).join(', ');
    },
    roundCombatPenaltyVsBase: function (op) {
      return 'for this round, each enemy unit gets ' + op.amount + '/+0 while attacking a base';
    },
    jailExhaust: function (op) { return 'exhaust ' + targetText(op) + ' — it cannot ready while this unit is in play'; },
    suppressKeywords: function (op) { return targetText(op) + ' loses all keywords for this round'; },
    plotDiscount: function (op) { return 'the next scheme card you play this round costs ' + op.amount + ' less'; },
    plotOffer: function () { return 'you may play scheme cards from your resources'; },
    massAttack: function () { return 'attack with any number of other units, one at a time, even exhausted ones — they cannot attack bases'; },
    captureBudget: function (op) {
      return targetText(op) + ' captures any number of enemy non-leader units with total remaining HP ' + op.budget + ' or less';
    },
    revealHand: function () { return 'look at the opponent’s hand'; },
    experienceAll: function (op) { return 'give an experience token to each ' + scopeNoun(op.scope); },
    buffTempRef: function (op) { return 'give ' + targetText(op) + ' +1/+1 for this round ' + amountText(op).replace(/^1 /, ''); },
    gainCredits: function (op) { return 'create ' + ((op.amount || 1) === 1 ? 'a credit token' : op.amount + ' credit tokens'); },
    buffPerOwnAspects: function (op) { return 'give ' + targetText(op) + ' +1/+1 for this round for each different aspect it has'; },
    arrangeTop2: function () { return 'look at the top 2 cards of your deck — bottom any number and keep the rest on top in any order'; },
    bottomUnitFromDiscardPower: function () { return 'put a unit from your discard pile on the bottom of your deck'; },
    exchangeControl: function () { return 'exchange control of a chosen friendly and enemy non-leader unit — whoever receives the cheaper unit creates credits equal to the cost difference'; },
    oppChoosesUnitDamage: function (op) { return 'the opponent chooses one of their ' + (op.arena ? op.arena + ' ' : '') + 'units — you may deal ' + op.amount + ' damage to it'; },
    giveAdvantage: function (op) {
      if (op.amountRef === 'otherFriendlyCount') return 'give an advantage token to ' + targetText(op) + ' for each other friendly unit';
      if (op.amountRef === 'lastHealed') return 'give an advantage token to ' + targetText(op) + ' for each damage healed this way';
      if (op.amountRef != null) return 'give advantage tokens to ' + targetText(op) + ' equal to ' + countPhrase(op.amountRef);
      const n = op.amount || 1;
      return 'give ' + (n === 1 ? 'an advantage token' : n + ' advantage tokens') + ' to ' + targetText(op);
    },
    advantageAll: function (op) { return 'give an advantage token to each ' + scopeNoun(op.scope); },
    supportAttack: function () { return 'you may attack with another friendly unit — it borrows this unit’s attack abilities'; },
    captureFromDiscard: function () { return 'this unit captures the defeated card from your discard pile'; },
    defeatDamagedDefender: function () { return 'defeat the damaged non-leader defender'; },
    defeatDefenderUpgrades: function () { return 'defeat all upgrades on the defending unit'; },
    healAllFriendly: function () { return 'heal all damage from each friendly unit'; },
    returnOtherUpgradesOnBearer: function () { return 'return the other upgrades on this unit to their owners’ hands'; },
    auctionTop: function () { return 'choose a player: reveal the top card of their deck and they may play it for free — if they do, the other player creates credits equal to its cost'; },
    discardFromOpponentHandChoice: function (op) {
      const f = op.filter || {};
      let what = f.type ? an(f.type) : f.notType ? 'a non-' + f.notType + ' card' : 'a card';
      if (f.sharesAspectWithSaved) what += ' that shares an aspect with the chosen unit';
      return 'look at the opponent’s hand and ' + (op.optional ? 'you may ' : '') + 'discard ' + what + ' from it';
    },
    damagePerExploited: function () {
      return 'for each unit exploited while playing this card, you may deal damage equal to its power to an enemy unit';
    },
    // ---- competitive expansion (js/ops2.js) — keep each in step with its handler ----
    exhaustAll: function (op) { return 'exhaust each ' + scopeNoun(op.scope); },
    giveKeywordAll: function (op) {
      return 'each ' + scopeNoun(op.scope) + ' gains ' + (SB.names.keywords[op.k] || op.k) + (op.n != null ? ' ' + op.n : '') + ' for this round';
    },
    spendCredits: function (op) { return 'spend ' + ((op.amount || 1) === 1 ? 'a credit token' : op.amount + ' credit tokens'); },
    giveControlSelf: function () { return 'the opponent takes control of this unit'; },
    defenderStrikesFirst: function () { return 'the defender deals its combat damage before this unit'; },
    suppressAbilities: function (op) { return targetText(op) + ' loses all abilities for this round'; },
    grantEntersReady: function (op) {
      const f = op.filter || {};
      let s = 'the next unit you play this round';
      if (f.maxPower != null) s += ' with power ' + f.maxPower + ' or less';
      if (f.trait) s += ' of the ' + (SB.names.traits[f.trait] || f.trait) + ' kind';
      return s + ' enters play ready';
    },
    useWhenDefeatedOf: function (op) { return 'use the last-words ability of ' + targetText(op) + ' without defeating it'; },
    reuseAbility: function () { return 'use that last-words ability again'; },
    purgeCopies: function () { return 'its controller discards every copy of that card from their hand and deck'; },
    defeatAllUpgradesOn: function (op) { return 'defeat every upgrade on ' + targetText(op); },
    selfUpgradeToHand: function () { return 'return this upgrade from your discard pile to your hand'; },
    dividedAdvantage: function (op) {
      const among = ' among ' + scopeNounPlural(op.scope || { who: 'friendly', what: 'unit' });
      if (op.amountRef != null) return 'distribute advantage tokens equal to ' + countPhrase(op.amountRef) + among;
      return 'distribute ' + (op.optional ? 'up to ' : '') + op.amount + ' advantage tokens' + among;
    },
    chooseAspect: function () { return 'choose an aspect'; },
    chooseArena: function () { return 'choose an arena'; },
    handToDeckTopOrBottom: function () { return 'put a card from your hand on the top or bottom of your deck'; },
    selfBaseDamageForDiscount: function (op) {
      return 'you may deal up to ' + (op.max || 6) + ' damage to your base — the next unit you play this round costs 1 less for every ' + (op.per || 2) + ' damage dealt this way';
    },
    defeatBudget: function (op) {
      let s = 'defeat any number of ' + scopeNounPlural(op.scope || { who: 'any', what: 'unit', nonLeader: true }) + ' with total remaining HP ' + op.budget + ' or less';
      if (op.perDefeat && op.perDefeat.length) s += ' — for each unit defeated this way, ' + describeEffectList(op.perDefeat);
      return s;
    },
    attachUnitAsPilot: function () { return 'you may put a friendly pilot unit, or move a friendly pilot upgrade, aboard this unit'; },
    moveTokenCounter: function () { return 'you may move a shield or experience token from one unit to another'; },
    spendAnyCredit: function () { return 'you may spend a credit token belonging to either player'; },
    nameCard: function (op) {
      return op.mode === 'silence'
        ? 'name a card the opponent has shown — while this unit is in play, every copy they own loses all abilities'
        : 'name a card the opponent has shown — while this unit is in play, they cannot play it';
    },
    captureToBase: function (op) { return 'your base captures ' + describeTarget(op.target) + ' until the start of the regroup phase'; },
    countOnAttackAbilities: function () { return 'count the chosen unit’s on-attack abilities'; },
    cloneEnter: function (op) { return 'you may have this unit enter play as a copy of ' + describeTarget(op.target).replace(/^another /, 'any other '); },
    opponentMayPlayDefeated: function () { return 'the opponent may play this card from your discard pile for free'; },
  };
  // Late-bound alias so grantAbilityTemp can render nested abilities.
  function describeAbilityPublic(ab) { return describeAbility(ab); }

  function describeAbilityLate(ab) { return describeAbility(ab); }
  // Public: the UI labels binary-choice buttons with the branch they commit to.
  SB.describeEffects = function (effects) { return describeEffectList(effects); };
  function describeEffectList(effects) {
    if (!effects || effects.length === 0) return 'do nothing';
    return effects.map(function (op) {
      return describeOpChain(op);
    }).join(', then ');
  }

  // A condition renders as a leading clause; `not:true` flips it to 'unless'.
  function conditionClause(c) {
    const cf = conditionText[c.if];
    if (!cf) throw new Error('no text for condition ' + c.if);
    const s = cf(c);
    return c.not ? s.replace(/^if /, 'unless ') : s;
  }

  function scopeNoun(sel) {
    // 'a unit' -> 'unit' (for 'each unit'), 'another unit' -> 'other unit'.
    return describeTarget(sel).replace(/^an? /, '').replace(/^another /, 'other ');
  }
  // Plural form for 'among ...' lists: pluralise the head noun, not the tail,
  // so suffix clauses ('in the same arena ...') stay untouched.
  function scopeNounPlural(sel) {
    return scopeNoun(sel).replace(/\bunit\b/, 'units');
  }
  function filterNoun(f, count) {
    f = f || {};
    const n = count || 1;
    if (f.hasPlot) return 'a card with ' + (SB.names.keywords.plot || 'Plot');
    const parts = [];
    if (f.aspect) parts.push(SB.names.aspects[f.aspect] || f.aspect);
    if (f.trait) parts.push(SB.names.traits[f.trait] || f.trait);
    if (f.arena) parts.push(f.arena);
    let noun = f.type ? f.type : 'card';
    const head = (parts.length ? parts.join(' ') + ' ' : '') + noun;
    let s = n > 1 ? 'up to ' + n + ' ' + head + 's' : an(head);
    if (f.maxCost != null) s += ' that costs ' + f.maxCost + ' or less';
    return s;
  }

  // One op plus its then/else continuations. Keep in step with SB.execOp/SB.execElse.
  function describeOpChain(op) {
    const fn = opText[op.op];
    if (!fn) throw new Error('no text for op ' + op.op);
    let s = fn(op);
    if (op.target && op.target.optional && !/^you may /.test(s)) s = s.replace(/^([a-z]+)/, 'you may $1');
    if (op.condition) s = conditionClause(op.condition) + ', ' + s;
    if (op.then && op.then.length) {
      s += ' — if you do, ' + op.then.map(describeOpChain).join(', then ');
    }
    if (op.else && op.else.length) {
      s += ' — if you don’t, ' + op.else.map(describeOpChain).join(', then ');
    }
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
    bounty: 'Bounty — when this unit is defeated or captured, its opponent',
    onSmuggle: 'When played using its smuggle cost',
    onUpgradePlayed: 'When you play an upgrade',
    whenCombatDamaged: 'When combat damage is dealt to this unit (and it survives)',
    onOpponentDraw: 'When an opponent draws during the action phase',
    whenHealed: 'When damage is healed from this unit',
    onIndirectUnitDamage: 'When your indirect damage hits a unit',
    onDeployPilot: 'When deployed as a pilot',
    onPlayAsPilot: 'When played as a pilot',
    onNonCombatDamage: 'When you deal non-combat damage',
    onForceUnitAttack: 'When a friendly mystic unit attacks',
    onRevealOrDiscard: 'When you reveal or discard cards from your hand',
    onFriendlyAttack: 'When another matching friendly unit attacks',
    onFriendlyDefeated: 'When another friendly unit is defeated',
    onFriendlyAttackEnds: 'When a friendly unit’s attack ends',
    // competitive expansion (js/ops2.js)
    onTakeInitiative: 'When you take the initiative',
    onWhenDefeatedUsed: 'When you use a last-words ability',
    onFriendlyDamagedSurvives: 'When a friendly unit is dealt damage and survives',
    onEnemyUnitDefeated: 'When an enemy unit is defeated',
    onFriendlyUpgradeDefeated: 'When a friendly upgrade is defeated',
    onFriendlyDealsDamageToEnemyUnit: 'When a friendly unit deals damage to an enemy unit',
    onOpponentPlaysCard: 'When an opponent plays a card',
    onOwnBaseCombatDamaged: 'When your base is dealt combat damage',
  };

  const conditionText = {
    savedHasTrait: function (c) {
      return 'if that unit is ' + an((SB.names.traits[c.trait] || c.trait) + ' unit');
    },
    controlUnitWithTrait: function (c) {
      return 'if you control another ' + (SB.names.traits[c.trait] || c.trait) + ' unit';
    },
    hasInitiative: function () { return 'if you have the initiative'; },
    hasForce: function () { return 'while you hold your power token'; },
    controlLeaderUnit: function () { return 'if you control a leader unit'; },
    defenderExhausted: function () { return 'if the defender is exhausted'; },
    paidZero: function () { return 'if no resources were paid to play this unit'; },
    controlUnitWithAspect2: function (c) {
      return 'if you control ' + an(c.aspects.map(function (a) { return SB.names.aspects[a] || a; }).join(' or ') + ' unit');
    },
    canPay: function (c) { return 'if you can pay ' + c.n + ' resource' + (c.n === 1 ? '' : 's'); },
    selfReady: function () { return 'while this unit is ready'; },
    selfRemHpAtLeast: function (c) { return 'if this unit has ' + c.n + ' or more remaining HP'; },
    controlArenaUnit: function (c) { return 'while you control a ' + c.arena + ' unit'; },
    opponentControlsSpaceUnit: function () { return 'if the opponent controls a space unit'; },
    defeatedByCombat: function () { return 'if defeated by combat damage'; },
    dealtBaseDamage: function () { return 'if this attack damaged the base'; },
    defenderDamagedNonLeader: function () { return 'if the defender survived with damage'; },
    defenderDefeated: function () { return 'if the defending unit was defeated'; },
    canDisclose: function (c) {
      return 'if you can reveal the required icons: ' +
        (c.aspects || []).map(function (a) { return SB.names.aspects[a] || a; }).join(', ');
    },
    isBearer: function () { return 'if the upgrade was played on this unit'; },
    baseDamaged: function () { return 'if your base is damaged'; },
    enemyBaseDamaged: function () { return 'if the enemy base is damaged'; },
    resourcesAtLeast: function (c) { return 'while you control ' + c.n + ' or more resources'; },
    playedAspectThisPhase: function (c) {
      return 'if you played ' + an((SB.names.aspects[c.aspect] || c.aspect) + ' card') + ' this phase';
    },
    playedCardThisPhase: function () { return 'if you played a card this phase'; },
    friendlyDefeatedThisPhase: function () { return 'if a friendly unit was defeated this phase'; },
    attachedIs: function (c) { return 'if attached to ' + (c.cards || []).map(function (id) { return SB.names.card(id); }).join(' or '); },
    controlCard: function (c) { return 'if you control ' + (c.cards || []).map(function (id) { return SB.names.card(id); }).join(' or '); },
    bearerHasTrait: function (c) { return 'if the attached unit is ' + an((SB.names.traits[c.trait] || c.trait) + ' unit'); },
    milledNonUnit: function () { return 'if the discarded card was not a unit'; },
    saved: function (c) { return c.not ? 'if no target was chosen' : 'if a target was chosen'; },
    selfDamaged: function () { return 'if this unit is damaged'; },
    selfUpgraded: function () { return 'while this unit has an upgrade'; },
    controlUnitWithAspect: function (c) { return 'if you control another ' + (SB.names.aspects[c.aspect] || c.aspect) + ' unit'; },
    bountyUnitUnique: function () { return 'if the defeated unit was a champion'; },
    defenderHasBounty: function () { return 'if the defender carries a bounty'; },
    coordinate: function () { return 'while you control 3 or more units'; },
    baseDamageAtLeast: function (c) { return 'while your base has ' + c.n + ' or more damage'; },
    controlsTokenUnit: function () { return 'if you control a token unit'; },
    enemyUnitDamaged: function () { return 'while an enemy unit is damaged'; },
    opponentMoreSpaceUnits: function () { return 'if the opponent controls more space units than you'; },
    milledOddCost: function () { return 'if the discarded card has an odd cost'; },
    controlOtherSpaceUnit: function () { return 'if you control another space unit'; },
    discardedUnit: function () { return 'if the discarded card was a unit'; },
    defenderExhaustedOld: function () { return 'while attacking an exhausted unit that did not enter play this round'; },
    controlMoreUnitsThanOpponent: function () { return 'if you control more units than the opponent'; },
    // competitive expansion (js/ops2.js SB.extraConditions)
    moreCardsInHandThanOpponent: function () { return 'while you have more cards in hand than the opponent'; },
    enteredThisPhaseAtLeast: function (c) { return 'if ' + c.n + ' or more friendly units entered play this round'; },
    unitLeftPlayThisPhase: function () { return 'if a unit left play this round'; },
    attackedWithTraitThisPhase: function (c) { return 'if you attacked with ' + an((c.nonToken ? 'non-token ' : '') + (SB.names.traits[c.trait] || c.trait) + ' unit') + ' this round'; },
    controlUnitsAtLeast: function (c) { return 'if you control ' + c.n + ' or more units'; },
    onlyFriendlyNonLeaderGroundUnit: function () { return 'while this is your only non-leader ground unit'; },
    savedGone: function () { return 'if that unit was defeated'; },
    storedAtLeast: function (c) { return c.n === 1 ? 'if you did' : 'if you did so ' + c.n + ' or more times'; },
    milledHasAspect: function (c) { return 'if the discarded card is ' + (SB.names.aspects[c.aspect] || c.aspect); },
    milledHasChosenAspect: function () { return 'if the discarded card has the chosen aspect'; },
    discardHasAspect: function (c) { return 'if there is ' + an((SB.names.aspects[c.aspect] || c.aspect) + ' card') + ' in your discard pile'; },
    controlNonUniqueUnit: function () { return 'if you control a non-champion unit'; },
    controlDamagedUnit: function () { return 'if you control a damaged unit'; },
    moreSpaceUnitsThanOpponent: function () { return 'if you control more space units than the opponent'; },
    selfPowerAtLeast: function (c) { return 'while this unit has ' + c.n + ' or more power'; },
    noOtherAttacksThisPhase: function () { return 'if no other unit has attacked this round'; },
    leaderHasTrait: function (c) { return 'while your leader is ' + an((SB.names.traits[c.trait] || c.trait) + ' leader'); },
    bearerHasAspect: function (c) { return 'if the attached unit is ' + an((SB.names.aspects[c.aspect] || c.aspect) + ' unit'); },
    bearerHasNoneOfAspects: function (c) { return 'if the attached unit is neither ' + c.aspects.map(function (a) { return SB.names.aspects[a] || a; }).join(' nor '); },
    savedMaxCost: function (c) { return 'if it costs ' + c.n + ' or less'; },
    creditsAtLeast: function (c) { return 'if you have ' + c.n + ' or more credit tokens'; },
    opponentHasCredits: function () { return 'if the opponent has a credit token'; },
    baseRemHpAtMost: function (c) { return 'if your base has ' + c.n + ' or less remaining HP'; },
    controlUnitWithTraitAny: function (c) { return 'if you control ' + an((SB.names.traits[c.trait] || c.trait) + ' unit'); },
    controlCapitalOrTrait: function (c) { return 'if you control ' + an((SB.names.traits[c.trait] || c.trait) + ' unit'); },
    savedIsCard: function () { return 'if it is the named champion'; },
    playedThisPhaseHasTrait: function (c) { return 'if you played ' + an((SB.names.traits[c.trait] || c.trait) + ' card') + ' this round'; },
    bearerWasFriendlyWithTrait: function (c) { return 'if this upgrade was on a friendly ' + (SB.names.traits[c.trait] || c.trait) + ' unit'; },
  };

  function describeAbility(ab) {
    if (ab.trigger === 'onReadyTax') {
      return 'When this unit readies: pay ' + (ab.amount || 3) + ' resources or exhaust it.';
    }
    if (ab.trigger === 'defenderAura') {
      const g = ab.grant || {};
      const parts = [];
      if (g.attackerPower) parts.push('the attacker gets ' + statPair(g.attackerPower, 0));
      if (g.defenderPower) parts.push('this unit gets ' + statPair(g.defenderPower, 0));
      return 'While this unit is defending, ' + parts.join(' and ') + '.';
    }
    if (ab.trigger === 'combatAura') {
      const g = ab.grant || {};
      const parts = [];
      if (g.power || g.hp) parts.push('gets ' + statPair(g.power, g.hp));
      (g.keywords || []).forEach(function (kw) { parts.push('gains ' + (SB.names.keywords[kw.k] || kw.k)); });
      return 'While attacking an enemy unit, each ' + scopeNoun(ab.scope) + ' ' + parts.join(' and ') + '.';
    }
    if (ab.trigger === 'combatConstant') {
      // Keep in step with combatMods in engine.js.
      const g = ab.grant || {};
      const parts = [];
      if (g.power || g.hp) parts.push('gets ' + statPair(g.power, g.hp));
      if (g.powerPerSelfDamage) parts.push('gets +' + g.powerPerSelfDamage + '/+0 for each damage on it');
      if (g.firstStrike) parts.push('deals its combat damage before the defender');
      if (g.defenderFirst) parts.push('lets the defender deal its combat damage first');
      (g.keywords || []).forEach(function (kw) {
        parts.push('gains ' + (SB.names.keywords[kw.k] || kw.k));
      });
      let when = 'While attacking';
      if (ab.condition && ab.condition.if === 'defenderDamaged') when = 'While attacking a damaged unit';
      else if (ab.condition && ab.condition.if === 'defenderExhaustedOld') when = 'While attacking an exhausted unit that did not enter play this round';
      else if (ab.condition) when = 'While attacking, ' + conditionClause(ab.condition);
      return when + ', this unit ' + parts.join(' and ') + '.';
    }
    if (ab.trigger === 'constant') {
      // Keep in step with SB.auraGrants in ops.js.
      const g = ab.grant;
      const parts = [];
      if (g.power || g.hp) parts.push('gets ' + statPair(g.power, g.hp));
      if (g.dynamicPower === 'friendlyPilotsAndPilotUpgrades') parts.push('gets +1/+0 for each other friendly pilot unit or pilot upgrade');
      if (g.dynamicPower === 'pilotsOnSelf') parts.push('gets +1/+0 for each pilot on it');
      if (g.dynamicPower === 'upgradesOnOtherFriendlies') parts.push('gets +1/+0 for each upgrade on other friendly units');
      if (g.traits) parts.push('gains the ' + g.traits.map(function (tr) { return SB.names.traits[tr] || tr; }).join(', ') + ' kind');
      (g.keywords || []).forEach(function (kw) {
        parts.push('gains ' + (SB.names.keywords[kw.k] || kw.k) + (kw.n != null ? ' ' + kw.n : ''));
      });
      // Grants added by js/ops2.js (keep in step with its aura wrappers).
      (g.loseKeywords || []).forEach(function (k) { parts.push('loses ' + (SB.names.keywords[k] || k)); });
      if (g.dynamicStat) {
        const per = { damagedEnemyUnits: 'damaged enemy unit', otherFriendlySpace: 'other friendly space unit', upgradesOnSelf: 'upgrade on it' }[g.dynamicStat] || g.dynamicStat;
        parts.push('gets ' + statPair(g.dynamicPowerPer, g.dynamicHpPer) + ' for each ' + per);
      }
      if (g.dynamicKeyword) {
        const per = { damagedEnemyUnits: 'damaged enemy unit', otherFriendlySpace: 'other friendly space unit', upgradesOnSelf: 'upgrade on it' }[g.dynamicKeyword.per] || g.dynamicKeyword.per;
        parts.push('gains ' + (SB.names.keywords[g.dynamicKeyword.k] || g.dynamicKeyword.k) + ' 1 for each ' + per);
      }
      if (g.costDiscount) {
        const d = g.costDiscount;
        const f = d.filter || {};
        let what = f.hasTrigger === 'whenDefeated' ? 'unit with a last-words ability' : (f.trait ? (SB.names.traits[f.trait] || f.trait) + ' ' : '') + (f.type || 'card');
        parts.push((d.oncePerRound ? 'the first ' + what + ' you play each round' : 'each ' + what + ' you play') + ' costs ' + d.amount + ' less');
      }
      (g.abilities || []).forEach(function (inner) { parts.push('gains: ' + JSON.stringify(describeAbility(inner))); });
      const scope = ab.scope && !ab.scope.self ? 'Each ' + scopeNoun(ab.scope) : (g.costDiscount ? 'While this unit is in play,' : 'This unit');
      let s = scope + ' ' + parts.join(' and ') + '.';
      if (ab.condition) {
        s = cap(conditionClause(ab.condition)) + ', ' + s.charAt(0).toLowerCase() + s.slice(1);
      }
      return s;
    }
    const clauses = ab.effects.map(function (op) {
      return describeOpChain(op);
    });
    let body = clauses.join(', then ');
    if (ab.condition) body = conditionClause(ab.condition) + ', ' + body;
    if (ab.gate && ab.trigger === 'action') body = conditionClause(ab.gate) + ', ' + body;
    const side = ab.asPilotOnly ? 'While piloting — ' : ab.asUnitOnly ? 'While a unit — ' : '';
    if (ab.trigger === 'action') {
      const cost = [];
      if (ab.cost) cost.push('spend ' + ab.cost + ' resource' + (ab.cost === 1 ? '' : 's'));
      if (ab.forceCost) cost.push('spend your power token');
      if (!ab.noExhaust) cost.push('exhaust');
      let s = side + 'Action' + (cost.length ? ' [' + cost.join(', ') + ']' : '') + ': ' + cap(body) + '.';
      if (ab.oncePerRound) s += ' Use this only once each round.';
      return s;
    }
    if (ab.exhaustCost) {
      return triggerText[ab.trigger] + ': You may exhaust this leader. If you do, ' + body + '.';
    }
    let s = side + triggerText[ab.trigger] + ': ' + cap(body) + '.';
    if (ab.oncePerRoundTrigger) s += ' Use this only once each round.';
    if (ab.notCreated) s = s.replace('When you play another unit', 'When you play a unit from hand');
    if (ab.trigger === 'onUnitPlayed') s = s.replace('When you play another unit', 'When you play or create another unit');
    return s;
  }

  function describeKeyword(kw) {
    const name = SB.names.keywords[kw.k];
    if (!name) throw new Error('no display name for keyword ' + kw.k);
    if (kw.k === 'smuggle') {
      const asp = (kw.aspects || []).map(function (a) { return SB.names.aspects[a] || a; }).join(', ');
      return name + ' [' + kw.cost + (asp ? ', ' + asp : '') + ']';
    }
    return kw.n != null ? name + ' ' + kw.n : name;
  }

  // ---- targeting prompts (CARD-LOG-AND-TARGETING-SPEC §16) ------------------
  // Every prompt is GENERATED from the effect data, exactly like rules text, so a
  // card author never writes one and an unnamed effect is never a blank prompt.
  // The card says WHAT ('Choose an enemy unit'); the UI appends HOW ('Click a
  // highlighted card') — see js/targeting.js. Keep these two responsibilities apart.

  // What the open queue item is asking for, as one English sentence.
  SB.targetPrompt = function (state, item) {
    if (!item) return 'Make a choice.';
    if (item.step === 'mulligan') return 'Keep this hand, or take a new one?';
    if (item.step === 'setupResources') return 'Choose a card to bank as a starting resource.';
    if (item.step === 'regroupResource') return 'Bank a card as a resource, or decline.';
    if (item.onChoose === 'ambush') return 'Ambush — attack a unit now, or decline.';
    if (item.step === 'triggerOrder') return 'Several abilities triggered at once — choose which one resolves first.';

    const source = item.ctx && item.ctx.cardId ? SB.names.card(item.ctx.cardId) : null;
    if (item.step === 'binaryPick') return source ? source + ' — choose one option.' : 'Choose one option.';
    if (item.step === 'peekDecide') return 'Look at the top card of your deck — what do you do with it?';
    if (item.step === 'arrangeTop2') return 'Look at the top two cards of your deck — arrange them.';
    let ask;
    if (item.op && item.op.op && opText[item.op.op]) {
      // Reuse the card's own clause so the prompt says what the effect will DO,
      // not merely that a choice is due: 'Deal 3 damage to an enemy unit.'
      let clause;
      try { clause = opText[item.op.op](item.op); } catch (e) { clause = null; }
      ask = clause ? cap(clause) + '.' : null;
    }
    if (!ask) ask = 'Choose a target.';
    return source ? source + ' — ' + lowerFirst(ask) : ask;
  };

  function lowerFirst(s) {
    // Only de-capitalise a plain word; a proper name keeps its capital.
    return /^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
  }

  // ---- card-level rules outside the abilities list ------------------------
  // costMod / costModAttach / attachFilter / staticFlags are enforced by the engine
  // (js/rules.js, js/engine.js, js/ops.js) but are not abilities, so nothing in the
  // ability walk above ever described them. Keep this table in step with the flags
  // actually present in data/cards-*.js.
  const STATIC_FLAG_TEXT = {
    indirectBoost: 'Indirect damage you deal to your opponent is increased by 1.',
    extraPilotSlot: 'This unit may carry a second pilot.',
    firstStrike: 'This unit deals its combat damage before the other unit deals its.',
    defeatAtRegroup: 'Defeat this unit at the start of the regroup phase.',
    attackOnlyDamaged: 'This unit can attack only while it is damaged.',
    negateFirstEvent: 'While you control this unit, the first event your opponent plays each round is cancelled.',
    noEnemyDefeatReturn: 'This unit cannot be defeated by an opponent’s effect.',
    tokenDoubler: 'When you would create tokens, you may defeat this unit to create twice as many.',
    // competitive expansion (js/ops2.js)
    underworldUnpreventable: 'Damage dealt by your underworld cards ignores shields.',
    assignOwnIndirect: 'You assign the indirect damage you deal to the opponent.',
    shieldRedirect: 'When damage would defeat another friendly unit, a shield on this unit breaks instead.',
    sacrificeToPrevent: 'When damage would defeat this unit, you defeat your cheapest other unit that shares a kind with it instead.',
    ejectOnDefeat: 'If this pilot would be defeated, it lands in the ground arena as an exhausted unit instead.',
    noControlChange: 'Opponents cannot take control of this unit.',
    grantSmuggle: 'Each of your resources gains Smuggle for its cost plus 2 (units and events).',
    doubleSearch: 'When the attached unit searches cards from your deck, it searches twice as many.',
    bearerIsLeader: 'The attached unit counts as a leader unit.',
    providesAspects: 'The attached unit’s aspect icons count as yours when paying costs.',
  };

  function traitName(t) { return SB.names.traits[t] || t; }

  function attachRule(card) {
    const f = card.attachFilter;
    const bits = [];
    if (card.attachArena) bits.push(card.attachArena);
    if (f && f.uniqueOnly) bits.push('champion');
    if (f && f.notTrait) bits.push('non-' + traitName(f.notTrait));
    if (f && f.trait) bits.push(traitName(f.trait));
    if (f && f.damaged) bits.push('damaged');
    if (!bits.length) return null;
    return 'Attach to ' + an(bits.join(' ') + ' unit') + '.';
  }

  function costRules(card) {
    const out = [];
    const m = card.costMod;
    if (m && m.delta < 0) {
      let cond = conditionClause(m);
      if (card.type !== 'unit') cond = cond.replace(/control another (.+)$/, function (m, rest) { return 'control ' + an(rest); });
      out.push('This card costs ' + (-m.delta) + ' less to play ' + cond + '.');
    }
    const a = card.costModAttach;
    if (a && a.delta < 0) {
      const who = a.uniqueOnly ? 'a champion unit' : (a.cards || []).map(function (id) { return SB.names.card(id); }).join(' or ');
      out.push('This upgrade costs ' + (-a.delta) + ' less to play on ' + (who || 'certain units') + '.');
    }
    return out;
  }

  function cardLevelLines(card) {
    const out = costRules(card);
    const at = attachRule(card);
    if (at) out.push(at);
    (card.staticFlags || []).forEach(function (f) {
      if (STATIC_FLAG_TEXT[f]) out.push(STATIC_FLAG_TEXT[f]);
      else throw new Error('no text for staticFlag ' + f);
    });
    // Engine-enforced card fields outside the ability list (keep in step with
    // engine.playCard / legalActions / state.newGame).
    if (card.entersReadyIf) out.push(cap(conditionClause(card.entersReadyIf)) + ', this unit enters play ready.');
    if (card.discardAction) out.push('Action: if this card was discarded from your hand or deck this round, play it from your discard pile (paying its cost).');
    if (card.copyLimit) out.push('A deck may hold up to ' + card.copyLimit + ' copies of this card.');
    if (card.startingHandDelta) out.push('Draw ' + Math.abs(card.startingHandDelta) + (card.startingHandDelta < 0 ? ' less' : ' more') + ' in your opening hand.');
    return out;
  }

  // Full rules text for a card id, as an array of lines.
  SB.cardText = function (cardId) {
    // Local playtesting override: data/source-local.js (gitignored, generated by
    // tools/gen-source-names.mjs) supplies the source material's printed text so a
    // tester can check our effect data against the real card. Absent from the repo and
    // from any public build, where the generated describers below are the only text.
    if (SB.sourceText && SB.sourceText[cardId]) return SB.sourceText[cardId].slice();
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
      lines.push('Epic Action: deploy this leader when you control ' + card.deployCost + ' or more resources' +
        (card.pilotSide ? ', as a ground unit or as a pilot on a friendly vehicle without a pilot' : '') + '.');
      block(card.deployedSide, 'Unit');
      if (card.pilotSide) block(card.pilotSide, 'Pilot');
    } else {
      block(card);
      if (card.epicAbility) {
        lines.push('Epic Action (once per game): ' + card.epicAbility.effects.map(function (op) {
          const fn = opText[op.op];
          if (!fn) throw new Error('no text for op ' + op.op);
          return fn(op);
        }).join(', then ') + '.');
      }
      if (card.type === 'upgrade') {
        const p = card.power || 0, h = card.hp || 0;
        if (p || h) lines.unshift('Attached unit gets ' + statPair(p, h) + '.');
      }
      if ((card.keywords || []).some(function (k) { return k.k === 'piloting'; })) {
        for (let i = 0; i < lines.length; i++) lines[i] = lines[i].replace(/^When played:/, 'When played as a unit:');
      }
    }
    cardLevelLines(card).forEach(function (l) { lines.push(l); });
    return lines;
  };
})(window.SB = window.SB || {});
