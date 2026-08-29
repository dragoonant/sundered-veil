// logtext.js — human-readable log lines from structured log entries. Display-only;
// the structured data is the source of truth (sound + AI read that, never prose).
(function (SB) {
  'use strict';

  const D = {
    gameStart: function () { return 'Game start.'; },
    actionPhase: function (l) { return '— Round ' + l.round + ' —'; },
    regroup: function () { return 'Regroup phase.'; },
    mulligan: function (l) { return player(l) + ' mulliganed.'; },
    resourced: function (l) { return player(l) + ' banked a resource.'; },
    draw: function (l) { return player(l) + ' drew a card.'; },
    playCard: function (l) { return player(l) + ' played ' + SB.names.card(l.cardId) + '.'; },
    attackDeclared: function () { return 'Attack!'; },
    ambush: function () { return 'Ambush!'; },
    unitDamage: function (l) { return l.amount + ' damage dealt.'; },
    baseDamage: function (l) { return player(l) + '’s base took ' + l.amount + '.'; },
    baseHeal: function (l) { return player(l) + '’s base healed ' + l.amount + '.'; },
    unitHeal: function (l) { return 'Healed ' + l.amount + '.'; },
    defeated: function (l) { return SB.names.card(l.cardId) + ' was defeated.'; },
    shield: function () { return 'Shield gained.'; },
    shieldPopped: function () { return 'Shield absorbed the hit.'; },
    shieldsSabotaged: function () { return 'Shields sabotaged!'; },
    experience: function () { return 'Experience gained.'; },
    buff: function () { return 'Stats changed.'; },
    exhausted: function () { return 'Exhausted.'; },
    readied: function () { return 'Readied.'; },
    attached: function (l) { return SB.names.card(l.cardId) + ' attached.'; },
    deployLeader: function (l) { return player(l) + ' deployed ' + SB.names.card(l.cardId) + '!'; },
    leaderAction: function (l) { return player(l) + ' used their leader.'; },
    unitAction: function () { return 'Ability used.'; },
    claimInitiative: function (l) { return player(l) + ' took the initiative.'; },
    pass: function (l) { return player(l) + ' passed.'; },
    fizzle: function () { return '…no effect.'; },
    deckedOut: function (l) { return player(l) + ' cannot draw!'; },
    returnedToHand: function (l) { return SB.names.card(l.cardId) + ' returned to hand.'; },
    gameOver: function (l) { return 'Game over.'; },
  };

  function player(l) {
    // Seat names relative to the human seat (0). UI-local convention.
    return l.player === 0 ? 'You' : 'Opponent';
  }

  SB.describeLog = function (l) {
    const fn = D[l.type];
    return fn ? fn(l) : l.type;
  };
})(window.SB = window.SB || {});
