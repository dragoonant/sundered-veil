// names.js — ALL display text lives here, keyed by stable internal id or slug.
// Nothing else in the repo may contain display names. Populated per set by the
// content phase; fixtures used by tests register their names in the test files
// via SB.names.register.
(function (SB) {
  'use strict';

  SB.names = {
    cards: {},     // cardId -> {name, subtitle?}
    traits: {},    // trait slug -> display
    aspects: {
      command: 'Command', aggression: 'Aggression', cunning: 'Cunning',
      vigilance: 'Vigilance', heroism: 'Heroism', villainy: 'Villainy',
    },
    keywords: {
      sentinel: 'Sentinel', saboteur: 'Saboteur', ambush: 'Ambush',
      overwhelm: 'Overwhelm', raid: 'Raid', restore: 'Restore',
      shielded: 'Shielded', grit: 'Grit', hidden: 'Hidden',
      bounty: 'Bounty', smuggle: 'Smuggle', exploit: 'Exploit',
      piloting: 'Piloting', coordinate: 'Coordinate', plot: 'Plot',
      unkillableThisRound: 'Deathless (this round)',
    },
    decks: {},     // deckId -> display name
    ui: {
      round: 'Round', yourTurn: 'Your move', enemyTurn: 'Opponent is acting…',
      initiative: 'Initiative', pass: 'Pass', claim: 'Take initiative',
      deploy: 'Deploy leader', leaderAbility: 'Leader ability',
      exhausted: 'Exhausted', ready: 'Ready', deployed: 'Deployed',
      youWin: 'Victory!', youLose: 'Defeat', chooseTarget: 'Choose a target',
      decline: 'Decline', keep: 'Keep hand', mulligan: 'Mulligan', undo: 'Undo',
      newGame: 'New game',
    },
    register: function (kind, id, value) { SB.names[kind][id] = value; },
    card: function (cardId) {
      const n = SB.names.cards[cardId];
      return n ? n.name : ('[' + cardId + ']');
    },
  };
})(window.SB = window.SB || {});
