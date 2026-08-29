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
    if (sel.damaged) s += ' that is damaged';       // engine: selectorCandidates .damaged
    return s;
  }

  // Where a target was chosen by an earlier op (useTarget), or an amount is a
  // reference, describe them symbolically. Keep in step with SB.resolveAmount.
  function targetText(op) {
    if (op.useTarget === '@defender') return 'the defender';
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
    if (op.amountRef === 'distinctFriendlyAspects') return '1 for each different aspect among your units in';
    return String(op.amount);
  }

  // One clause per op. Keep each in step with SB.ops[<op>].
  const opText = {
    damage: function (op) { return 'deal ' + amountText(op) + ' damage to ' + targetText(op); },
    heal: function (op) { return 'heal ' + amountText(op) + ' damage from ' + targetText(op); },
    draw: function (op) { return 'draw ' + ((op.amount || 1) === 1 ? 'a card' : op.amount + ' cards'); },
    shield: function (op) { return 'give a shield to ' + targetText(op); },
    experience: function (op) { return 'give ' + ((op.amount||1)===1?'an experience token':op.amount+' experience tokens') + ' to ' + targetText(op); },
    buffTemp: function (op) {
      const p = op.power || 0, h = op.hp || 0;
      const stat = (p >= 0 ? '+' : '') + p + '/' + (h >= 0 ? '+' : '') + h;
      return 'give ' + targetText(op) + ' ' + stat + ' for this round';
    },
    defeat: function (op) { return 'defeat ' + targetText(op); },
    exhaust: function (op) { return 'exhaust ' + targetText(op); },
    ready: function (op) { return 'ready ' + targetText(op); },
    returnHand: function (op) { return 'return ' + targetText(op) + ' to its owner’s hand'; },
    damageAll: function (op) { return 'deal ' + op.amount + ' damage to each ' + scopeNoun(op.scope); },
    buffAll: function (op) {
      const stat = (op.power >= 0 ? '+' : '') + (op.power || 0) + '/' + (op.hp >= 0 ? '+' : '') + (op.hp || 0);
      return 'give each ' + scopeNoun(op.scope) + ' ' + stat + ' for this round';
    },
    giveKeyword: function (op) {
      return 'give ' + targetText(op) + ' ' + (SB.names.keywords[op.k] || op.k) + ' for this round';
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
      const who = op.who === 'self' ? 'you distribute' :
        op.who === 'defending' ? 'the defending player distributes' : 'your opponent distributes';
      return who + ' ' + amountText(op) + ' indirect damage among their units and base';
    },
    searchDeck: function (op) {
      const verb = op.playIt ? (', reveal it, and play it' + (op.playDiscount ? ' for ' + op.playDiscount + ' less' : '')) : ', reveal it, and draw it';
      let s = 'search ' + (op.depth ? 'the top ' + op.depth + ' cards of ' : '') + 'your deck for ' + filterNoun(op.filter) + verb;
      return s + ', then shuffle your deck';
    },
    readyResource: function (op) { return 'ready ' + (op.amountRef ? amountText(op) : (op.amount || 1)) + ' of your resources'; },
    exhaustResource: function (op) {
      const who = op.who === 'self' ? 'your' : 'your opponent’s';
      return 'exhaust ' + (op.amount || 1) + ' of ' + who + ' resources';
    },
    resourceTopDeck: function () { return 'put the top card of your deck into play as a resource'; },
    pickUnit: function (op) { return 'choose ' + describeTarget(op.target); },
    dividedDamage: function (op) {
      return 'deal ' + amountText(op) + ' damage divided as you choose among ' + scopeNoun(op.scope || { who: 'enemy', what: 'unit' }) + 's';
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
      if (op.bonusIfTrait) perks.push('a ' + (SB.names.traits[op.bonusIfTrait.trait] || op.bonusIfTrait.trait) + ' unit gets +' + op.bonusIfTrait.amount + '/+0 for this attack');
      if (op.grantSaboteurForAttack) perks.push('it gains Saboteur for this round');
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
    healFull: function (op) { return 'heal all damage from ' + targetText(op); },
    stunExhaust: function (op) { return 'exhaust ' + targetText(op) + ' — it cannot ready this round'; },
    opponentMayReady: function () { return 'your opponent may ready one of their units'; },
    grantAbilityTemp: function (op) {
      return 'until end of round, ' + targetText(op) + ' gains: ' + JSON.stringify(describeAbilityPublic(op.ability));
    },
    attackBonus: function (op) {
      const parts = [];
      if (op.amount) parts.push('this unit gets +' + op.amount + '/+0 for this attack');
      if (op.defenderDelta) parts.push('the defender gets ' + op.defenderDelta + '/+0 for this attack');
      return parts.join(' and ') || 'modify this attack';
    },
    exhaustFriendlyForBonus: function (op) {
      return 'you may exhaust ' + describeTarget(op.target) + ' — if you do, this unit gets +' + op.amount + '/+0 for this attack';
    },
    collectBountiesOf: function (op) { return 'collect the bounties on ' + targetText(op); },
    selfDefeatedToResource: function () { return 'put this card into play as a ready resource'; },
    defeatCountUpgrades: function (op) { return 'defeat ' + targetText(op) + ', counting its upgrades'; },
    repeat: function (op) {
      const fn = opText[op.effect.op];
      return 'for each counted upgrade, ' + (fn ? fn(op.effect) : op.effect.op);
    },
    millMatchBaseAspect: function () {
      return 'discard the top card of your deck — if it shares an aspect with your base, take it into hand instead';
    },
    moveUpgrade: function () { return 'move an upgrade to another eligible unit with the same controller'; },
    defeatUpgrade: function () { return 'defeat an upgrade'; },
    upgradeFromDiscard: function () { return 'you may return an upgrade from your discard pile to your hand'; },
    bondBuff: function (op) {
      return 'while this unit is in play, ' + targetText(op) + ' gets +' + (op.power || 0) + '/+' + (op.hp || 0);
    },
    grantDiscount: function (op) {
      return 'each of the next ' + op.count + ' ' + filterNoun(op.filter).replace(/^a /, '') + 's you play this phase costs ' + op.amount + ' less';
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
    spendResources: function (op) { return 'pay ' + op.amount + ' resources'; },
    moveSelfArena: function (op) { return 'move this unit to the ' + (op.to || 'other') + ' arena'; },
    takeControl: function (op) {
      let s = 'take control of ' + describeTarget(op.target);
      if (op.ready) s += ' and ready it';
      if (op.returnAtRegroup) s += ' — return it to its owner at the start of the next regroup phase';
      return s;
    },
    revealTop: function () { return 'reveal the top card of your deck'; },
    gainForce: function () { return 'you gain your power token'; },
    useForce: function () { return 'spend your power token'; },
    defeatAll: function (op) { return 'defeat each ' + scopeNoun(op.scope); },
    removeExperience: function (op) { return 'remove an experience token from ' + targetText(op); },
    attackerPowerDelta: function (op) { return 'the attacker gets ' + op.amount + '/+0 for this attack'; },
    exhaustBudget: function (op) { return 'exhaust any number of units with combined cost ' + op.budget + ' or less'; },
    payForExperience: function (op) { return 'pay up to ' + op.max + ' resources — this unit gains an experience token for each'; },
    bottomFromDiscard: function (op) {
      return 'put up to ' + op.upTo + ' matching cards from your discard pile on the bottom of your deck';
    },
    echoNextOnPlay: function () { return 'the next time you use a when-played ability this round, use it again'; },
    discloseReveal: function (op) {
      return 'reveal cards from your hand showing these icons: ' +
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
    buffTempRef: function (op) { return 'give ' + targetText(op) + ' +1/+1 for this round ' + amountText(op).replace(/^1 /, '') ; },
    gainCredits: function (op) { return 'create ' + ((op.amount || 1) === 1 ? 'a credit token' : op.amount + ' credit tokens'); },
    buffPerOwnAspects: function (op) { return 'give ' + targetText(op) + ' +1/+1 for this round for each different aspect it has'; },
    arrangeTop2: function () { return 'look at the top 2 cards of your deck — bottom any number and keep the rest on top in any order'; },
    bottomUnitFromDiscardPower: function () { return 'put a unit from your discard pile on the bottom of your deck'; },
    exchangeControl: function () { return 'exchange control of a chosen friendly and enemy non-leader unit — whoever receives the cheaper unit creates credits equal to the cost difference'; },
    oppChoosesUnitDamage: function (op) { return 'the opponent chooses one of their ' + (op.arena ? op.arena + ' ' : '') + 'units — you may deal ' + op.amount + ' damage to it'; },
    auctionTop: function () { return 'choose a player: reveal the top card of their deck and they may play it for free — if they do, the other player creates credits equal to its cost'; },
    discardFromOpponentHandChoice: function () { return 'look at the opponent’s hand and discard a card from it'; },
    damagePerExploited: function () {
      return 'for each unit exploited while playing this card, you may deal damage equal to its power to an enemy unit';
    },
  };
  // Late-bound alias so grantAbilityTemp can render nested abilities.
  function describeAbilityPublic(ab) { return describeAbility(ab); }

  function describeEffectList(effects) {
    if (!effects || effects.length === 0) return 'do nothing';
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
    if (f.hasPlot) return 'a card with ' + (SB.names.keywords.plot || 'Plot');
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
  };

  const conditionText = {
    controlUnitWithTrait: function (c) {
      return 'if you control another ' + (SB.names.traits[c.trait] || c.trait) + ' unit';
    },
    hasInitiative: function () { return 'if you have the initiative'; },
    hasForce: function () { return 'while you hold your power token'; },
    controlLeaderUnit: function () { return 'if you control a leader unit'; },
    defenderExhausted: function () { return 'if the defender is exhausted'; },
    paidZero: function () { return 'if no resources were paid to play this unit'; },
    controlUnitWithAspect2: function (c) {
      return 'if you control a ' + c.aspects.map(function (a) { return SB.names.aspects[a] || a; }).join(' or ') + ' unit';
    },
    canPay: function (c) { return 'if you can pay ' + c.n + ' resource' + (c.n === 1 ? '' : 's'); },
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
      return 'if you played a ' + (SB.names.aspects[c.aspect] || c.aspect) + ' card this phase';
    },
    playedCardThisPhase: function () { return 'if you played a card this phase'; },
    friendlyDefeatedThisPhase: function () { return 'if a friendly unit was defeated this phase'; },
    attachedIs: function () { return 'if attached to the named champion'; },
    controlCard: function () { return 'if you control the named champion'; },
    bearerHasTrait: function (c) { return 'if the attached unit is a ' + (SB.names.traits[c.trait] || c.trait) + ' unit'; },
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
  };

  function describeAbility(ab) {
    if (ab.trigger === 'defenderAura') {
      return 'While this unit is defending, the attacker gets ' + ((ab.grant || {}).attackerPower || 0) + '/+0.';
    }
    if (ab.trigger === 'combatAura') {
      const g = ab.grant || {};
      const parts = [];
      if (g.power || g.hp) parts.push('gets +' + (g.power || 0) + '/+' + (g.hp || 0));
      (g.keywords || []).forEach(function (kw) { parts.push('gains ' + (SB.names.keywords[kw.k] || kw.k)); });
      return 'While attacking an enemy unit, each ' + scopeNoun(ab.scope) + ' ' + parts.join(' and ') + '.';
    }
    if (ab.trigger === 'combatConstant') {
      // Keep in step with combatMods in engine.js.
      const g = ab.grant || {};
      const parts = [];
      if (g.power || g.hp) parts.push('gets +' + (g.power || 0) + '/+' + (g.hp || 0));
      if (g.powerPerSelfDamage) parts.push('gets +' + g.powerPerSelfDamage + '/+0 for each damage on it');
      if (g.firstStrike) parts.push('deals its combat damage before the defender');
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
      if (g.dynamicPower === 'friendlyPilotsAndPilotUpgrades') parts.push('gets +1/+0 for each other friendly pilot unit or pilot upgrade');
      if (g.dynamicPower === 'pilotsOnSelf') parts.push('gets +1/+0 for each pilot on it');
      if (g.traits) parts.push('gains the ' + g.traits.map(function (tr) { return SB.names.traits[tr] || tr; }).join(', ') + ' kind');
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
    if (kw.k === 'smuggle') {
      const asp = (kw.aspects || []).map(function (a) { return SB.names.aspects[a] || a; }).join(', ');
      return name + ' [' + kw.cost + (asp ? ', ' + asp : '') + ']';
    }
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
        if (p || h) lines.unshift('Attached unit gets +' + p + '/+' + h + '.');
      }
    }
    return lines;
  };
})(window.SB = window.SB || {});
