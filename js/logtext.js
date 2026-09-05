// logtext.js — human-readable log lines from structured log entries
// (CARD-LOG-AND-TARGETING-SPEC part one). Display-only: the structured data is the
// source of truth, and sound (js/sound.js) and the AI (js/ai.js) read THAT, never
// this prose. Every type pushed through SB.log must have a describer here —
// tests/test-log.js fuzzes real games and fails on any type that reaches the
// fallback, so a new log type cannot ship mute.
//
// Describers take (entry, state). State is optional and may be a LATER state than
// the one that produced the entry, so nothing here may assume a uid still exists:
// SB.log stamps cardId at push time exactly so a defeated card can still be named.
(function (SB) {
  'use strict';

  // ---- naming --------------------------------------------------------------

  // Seat names relative to the human seat (0). The engine writes player indices;
  // second person is applied here, at the last moment, and only here.
  function player(idx) { return idx === 0 ? 'You' : 'The opponent'; }
  function possessive(idx) { return idx === 0 ? 'Your' : 'The opponent’s'; }
  // Lowercase forms, for mid-sentence use.
  function them(idx) { return idx === 0 ? 'you' : 'the opponent'; }
  function theirs(idx) { return idx === 0 ? 'your' : 'the opponent’s'; }

  // Verb agreement: "You draw" but "The opponent draws".
  function v(idx, bare, third) { return idx === 0 ? bare : (third || bare + 's'); }

  // The name of whatever a log entry is about. cardId is stamped at push time so
  // this survives the card leaving play; the state lookup is only a fallback for
  // older entries, and 'a unit' is the last resort (never "[undefined]").
  // 'side' is stamped by SB.log only when the other seat fielded a card of the same
  // name, so the qualifier appears exactly where the bare name would be a riddle.
  function name(l, state) {
    let nm = null;
    if (l.cardId) nm = SB.names.card(l.cardId);
    else if (state && l.uid != null && SB.findUnit) {
      const u = SB.findUnit(state, l.uid);
      if (u) nm = SB.names.card(u.cardId);
    }
    if (nm == null) return 'a unit';
    return l.side == null ? nm : theirs(l.side) + ' ' + nm;
  }
  // Secondary actors: the stamped id first (survives death), then the live state.
  function nameOf(uid, state, fallback, stampedCardId) {
    if (stampedCardId) return SB.names.card(stampedCardId);
    if (state && uid != null && SB.findUnit) {
      const u = SB.findUnit(state, uid);
      if (u) return SB.names.card(u.cardId);
    }
    return fallback || 'a unit';
  }
  function cardName(id) { return id ? SB.names.card(id) : 'a card'; }

  function n(x, one, many) {
    return x + ' ' + (x === 1 ? one : (many || one + 's'));
  }

  // ---- describers ----------------------------------------------------------
  // Keys are log entry types. Order mirrors roughly the flow of a game.

  const D = {
    // --- structure ---
    gameStart: function (l) {
      return 'Game start — ' + them(l.initiative) + ' ' + v(l.initiative, 'hold') + ' the initiative.';
    },
    actionPhase: function (l) { return '— Round ' + l.round + ' —'; },
    regroup: function () { return 'Regroup: both players draw, bank, and ready.'; },
    gameOver: function (l) {
      if (l.winner === 'draw') return 'Game over — a draw.';
      return 'Game over — ' + them(l.winner) + ' ' + v(l.winner, 'win') + '.';
    },
    mulligan: function (l) { return player(l.player) + ' took a new hand.'; },
    pass: function (l) { return player(l.player) + ' passed.'; },
    claimInitiative: function (l) { return player(l.player) + ' took the initiative.'; },

    // --- cards and resources ---
    draw: function (l) { return player(l.player) + ' drew a card.'; },
    deckedOut: function (l) { return possessive(l.player) + ' deck is empty — no card drawn!'; },
    deckShuffled: function (l) { return possessive(l.player) + ' deck was shuffled.'; },
    resourced: function (l) { return player(l.player) + ' banked a resource.'; },
    resourcesSpent: function (l) { return player(l.player) + ' spent ' + n(l.amount, 'resource') + '.'; },
    resourcesExhausted: function (l) { return player(l.player) + ' exhausted ' + n(l.amount, 'resource') + '.'; },
    resourcesReadied: function (l) { return player(l.player) + ' readied ' + n(l.amount, 'resource') + '.'; },
    playCard: function (l) { return player(l.player) + ' played ' + cardName(l.cardId) + '.'; },
    smuggled: function (l) { return player(l.player) + ' smuggled in ' + cardName(l.cardId) + '.'; },
    plotPlayed: function (l) { return player(l.player) + ' sprang a scheme: ' + cardName(l.cardId) + '.'; },
    plotDiscount: function (l) { return possessive(l.player) + ' next scheme costs less.'; },
    discarded: function (l) { return player(l.player) + ' discarded ' + cardName(l.cardId) + '.'; },
    milled: function (l) { return player(l.player) + ' milled ' + cardName(l.cardId) + ' off the deck.'; },
    milledToHand: function (l) { return player(l.player) + ' took the top card of the deck into hand.'; },
    bottomedCard: function (l) { return player(l.player) + ' put a card on the bottom of the deck.'; },
    arrangedTop: function (l) { return player(l.player) + ' rearranged the top of the deck.'; },
    peeked: function (l) { return player(l.player) + ' looked at the top of the deck.'; },
    peekBottomed: function (l) { return player(l.player) + ' buried the card that was peeked at.'; },
    revealedTop: function (l) { return possessive(l.player) + ' top card is ' + cardName(l.cardId) + '.'; },
    searched: function (l) { return player(l.player) + ' searched the deck.'; },
    tookFromDiscard: function (l) { return player(l.player) + ' recovered a card from the discard pile.'; },
    handRevealed: function (l) { return possessive(l.player) + ' hand was revealed.'; },
    disclosed: function (l) { return player(l.player) + ' disclosed aspects to pay for it.'; },
    discountGranted: function (l) { return possessive(l.player) + ' next card costs less.'; },
    echoArmed: function (l) { return possessive(l.player) + ' next unit will echo.'; },
    echoedOnPlay: function (l, s) { return name(l, s) + ' echoed its arrival.'; },

    // --- tokens and economy ---
    creditsGained: function (l) { return player(l.player) + ' gained ' + n(l.amount, 'credit') + '.'; },
    creditSpent: function (l) { return player(l.player) + ' spent a credit.'; },
    forceGained: function (l) { return player(l.player) + ' gained the Current.'; },
    forceUsed: function (l) { return player(l.player) + ' spent the Current.'; },
    tokenCreated: function (l, s) {
      return 'A ' + cardName(l.cardId) + ' token joined the board alongside ' + nameOf(l.uid, s, 'its summoner') + '.';
    },

    // --- leaders ---
    deployLeader: function (l) { return player(l.player) + ' deployed ' + cardName(l.cardId) + '!'; },
    deployLeaderPilot: function (l, s) {
      return player(l.player) + ' deployed ' + cardName(l.cardId) + ' aboard ' + nameOf(l.uid, s, 'a vehicle') + '!';
    },
    leaderAction: function (l) { return player(l.player) + ' used a leader ability.'; },
    leaderReturned: function (l) { return possessive(l.player) + ' leader was driven back to the sidelines.'; },
    baseEpic: function (l) { return player(l.player) + ' used a base epic action.'; },

    // --- combat ---
    attackDeclared: function (l, s) {
      const who = nameOf(l.attacker, s, 'A destroyed unit', l.attackerCardId);
      const at = l.target && l.target.kind === 'base'
        ? theirs(l.target.player) + ' base'
        : nameOf(l.target && l.target.uid, s, 'a destroyed unit');
      return who + ' attacks ' + at + '.';
    },
    ambush: function (l, s) { return name(l, s) + ' ambushes!'; },
    attackModified: function (l, s) { return name(l, s) + ' fights on different terms.'; },
    globalCombatMod: function (l) { return 'Combat terms shift in ' + theirs(l.player) + ' favour.'; },
    unitDamage: function (l, s) { return name(l, s) + ' took ' + n(l.amount, 'damage', 'damage') + '.'; },
    baseDamage: function (l) { return possessive(l.player) + ' base took ' + n(l.amount, 'damage', 'damage') + '.'; },
    unitHeal: function (l, s) { return name(l, s) + ' healed ' + n(l.amount, 'damage', 'damage') + '.'; },
    baseHeal: function (l) { return possessive(l.player) + ' base healed ' + n(l.amount, 'damage', 'damage') + '.'; },
    defeated: function (l, s) { return name(l, s) + ' was defeated.'; },
    exploited: function (l, s) { return name(l, s) + ' was sacrificed to pay the cost.'; },
    shield: function (l, s) { return name(l, s) + ' gained a shield.'; },
    shieldPopped: function (l, s) { return 'A shield on ' + name(l, s) + ' absorbed the hit and broke.'; },
    shieldsSabotaged: function (l, s) { return 'Shields on ' + name(l, s) + ' were sabotaged away!'; },
    bountyCollected: function (l, s) { return 'A bounty on ' + name(l, s) + ' was collected.'; },

    // --- unit state ---
    exhausted: function (l, s) { return name(l, s) + ' was exhausted.'; },
    readied: function (l, s) { return name(l, s) + ' readied.'; },
    stunned: function (l, s) { return name(l, s) + ' was stunned.'; },
    unitAction: function (l, s) { return name(l, s) + ' used an ability.'; },
    experience: function (l, s) {
      return name(l, s) + ' gained ' + n(l.amount || 1, 'experience token') + '.';
    },
    experienceRemoved: function (l, s) { return name(l, s) + ' lost an experience token.'; },
    advantage: function (l, s) { return name(l, s) + ' gained ' + n(l.amount || 1, 'advantage token') + '.'; },
    advantageExpired: function (l, s) { return 'The advantage on ' + name(l, s) + ' expired.'; },
    buff: function (l, s) { return name(l, s) + ' is now ' + statDelta(l.power, l.hp) + '.'; },
    buffAll: function (l) { return 'Every unit is now ' + statDelta(l.power, l.hp) + '.'; },
    gainedKeyword: function (l, s) {
      return name(l, s) + ' gained ' + (SB.names.keywords[l.k] || 'a keyword') + '.';
    },
    gainedAbility: function (l, s) { return name(l, s) + ' gained an ability.'; },
    keywordsSuppressed: function (l, s) { return name(l, s) + ' lost its keywords.'; },
    attached: function (l, s) {
      return cardName(l.cardId) + ' attached to ' + nameOf(l.uid, s, 'a unit') + '.';
    },
    upgradeDefeated: function (l, s) {
      return cardName(l.cardId) + ' was stripped from ' + nameOf(l.uid, s, 'a unit') + '.';
    },
    upgradesDefeated: function (l, s) { return 'Every upgrade on ' + name(l, s) + ' was stripped away.'; },
    movedArena: function (l, s) {
      return name(l, s) + ' moved to the ' + (l.to === 'space' ? 'space' : 'ground') + ' arena.';
    },
    returnedToHand: function (l, s) { return name(l, s) + ' was returned to hand.'; },
    rescued: function (l, s) { return name(l, s) + ' was rescued.'; },
    bonded: function (l, s) { return name(l, s) + ' bonded with ' + nameOf(l.to, s, null, l.toCardId) + '.'; },
    supported: function (l, s) { return nameOf(l.by, s, null, l.byCardId) + ' lent its support to ' + name(l, s) + '.'; },
    jailed: function (l, s) { return name(l, s) + ' was locked down by ' + nameOf(l.by, s, null, l.byCardId) + '.'; },
    captured: function (l, s) {
      if (l.by == null) return name(l, s) + ' was captured and held at the base!';
      return name(l, s) + ' was captured by ' + nameOf(l.by, s, null, l.byCardId) + '!';
    },
    controlTaken: function (l, s) { return them(l.by) + ' seized control of ' + name(l, s) + '!'; },
    controlExchanged: function (l, s) {
      return nameOf(l.a, s, null, l.aCardId) + ' and ' + nameOf(l.b, s, null, l.bCardId) + ' changed sides.';
    },
    binaryChosen: function (l) { return player(l.player) + ' chose an option.'; },

    // --- competitive expansion (js/ops2.js) ---
    abilitiesSuppressed: function (l, s) { return name(l, s) + ' lost all its abilities.'; },
    readyGrantArmed: function (l) { return possessive(l.player) + ' next matching unit will arrive ready.'; },
    arrivedReady: function (l, s) { return name(l, s) + ' arrived ready.'; },
    abilityBorrowed: function (l, s) { return 'The last-words ability of ' + name(l, s) + ' was used.'; },
    abilityRepeated: function (l) { return 'The last-words ability of ' + cardName(l.cardId) + ' was used again.'; },
    copiesPurged: function (l) { return player(l.player) + ' lost ' + n(l.amount, 'copy', 'copies') + ' of ' + cardName(l.cardId) + ' from hand and deck.'; },
    aspectChosen: function (l) { return player(l.player) + ' chose ' + (SB.names.aspects[l.aspect] || l.aspect) + '.'; },
    arenaChosen: function (l) { return player(l.player) + ' chose the ' + l.arena + ' arena.'; },
    toppedCard: function (l) { return player(l.player) + ' put a card on top of the deck.'; },
    ejected: function (l, s) { return name(l, s) + ' ejected into the ground arena.'; },
    cardNamed: function (l, s) { return name(l, s) + ' named ' + cardName(l.cardId) + '.'; },
    cloned: function (l, s) { return name(l, s) + ' took the form of ' + cardName(l.cardId) + '.'; },
    damagePrevented: function (l, s) { return 'Damage to ' + name(l, s) + ' was prevented.'; },

    // --- the two lines that keep a paid-for card honest (§4) ---
    autoTarget: function (l, s) {
      const src = l.sourceCardId ? cardName(l.sourceCardId) : 'The effect';
      // A self-targeting effect with one candidate would otherwise read
      // 'X resolves against its only legal target: X', which tells the player nothing.
      if (l.sourceUid != null && l.uid === l.sourceUid) {
        return src + ' resolves against itself — its only legal target.';
      }
      const at = l.targetPlayer != null ? theirs(l.targetPlayer) + ' base' : name(l, s);
      return src + ' resolves against its only legal target: ' + at + '.';
    },
    fizzle: function (l) {
      const who = l.cardId ? cardName(l.cardId) : 'The effect';
      switch (l.why) {
        case 'noTargets': return who + ' finds no legal target.';
        case 'noSavedTarget': return who + ' lost the target it was saving.';
        case 'negated': return who + ' was negated!';
        case 'declined': return who + ' was declined.';
        case 'condition': return who + ' had its condition unmet.';
        case 'immune': return who + ' was shrugged off.';
        case 'cantPay': return who + ' could not be paid for.';
        case 'emptyDeck': return who + ' found an empty deck.';
        case 'noDamage': return who + ' found nothing to heal.';
        case 'noForce': return who + ' needed the Force.';
        default: return who + ' had no effect.';
      }
    },
  };

  function statDelta(power, hp) {
    const p = power || 0, h = hp || 0;
    if (p === 0 && h === 0) return 'unchanged';
    const bits = [];
    if (p) bits.push((p > 0 ? '+' : '') + p + ' power');
    if (h) bits.push((h > 0 ? '+' : '') + h + ' HP');
    return bits.join(' and ');
  }

  // ---- public surface ------------------------------------------------------

  // The prose for one entry. Returns null for a type with no describer, so the
  // test can name the offender instead of a UI showing a raw internal id.
  SB.describeLog = function (l, state) {
    const fn = D[l.type];
    if (!fn) return null;
    const line = fn(l, state || null);
    // §2: capitalise last, not in each describer — a name substituted into the first
    // slot ('you seized…', 'a unit lent…') is lowercase through no fault of the caller.
    return line && line.charAt(0).toUpperCase() + line.slice(1);
  };

  SB.logTypes = function () { return Object.keys(D); };

  // §3: what this line is ABOUT, so the log panel can hang a card preview on it.
  // Keys are checked in priority order; the first that names a real card wins.
  // A uid that has left the state still resolves through its stamped cardId, so a
  // line about a destroyed unit stays previewable.
  const SUBJECT_KEYS = ['uid', 'attacker', 'by', 'to', 'a', 'b'];
  SB.logSubject = function (l, state) {
    if (!l) return null;
    for (let i = 0; i < SUBJECT_KEYS.length; i++) {
      const uid = l[SUBJECT_KEYS[i]];
      if (uid == null || typeof uid !== 'number') continue;
      const u = state && SB.findUnit ? SB.findUnit(state, uid) : null;
      if (u) return { uid: uid, cardId: u.cardId };
      if (i === 0 && l.cardId) return { uid: null, cardId: l.cardId };  // stamped at push
    }
    if (l.cardId) return { uid: null, cardId: l.cardId };
    if (l.sourceCardId) return { uid: null, cardId: l.sourceCardId };
    if (l.target && l.target.kind === 'unit' && state && SB.findUnit) {
      const t = SB.findUnit(state, l.target.uid);
      if (t) return { uid: l.target.uid, cardId: t.cardId };
    }
    return null;
  };

  // §5: turn dividers read differently from events.
  SB.logIsDivider = function (l) {
    return l.type === 'actionPhase' || l.type === 'regroup' || l.type === 'gameStart' ||
      l.type === 'gameOver';
  };
})(window.SB = window.SB || {});
