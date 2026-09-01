// fixtures.js — synthetic cards/decks used only by tests. Ids use the fx- prefix so
// they can never collide with real set ids. Registered before validateContent runs.
(function (SB) {
  'use strict';

  const F = {
    'fx-grunt': { id: 'fx-grunt', type: 'unit', arena: 'ground', cost: 1, power: 2, hp: 2, aspects: ['aggression'] },
    'fx-wall': { id: 'fx-wall', type: 'unit', arena: 'ground', cost: 2, power: 1, hp: 5, aspects: ['vigilance'],
      keywords: [{ k: 'sentinel' }] },
    'fx-flyer': { id: 'fx-flyer', type: 'unit', arena: 'space', cost: 2, power: 3, hp: 2, aspects: ['aggression'] },
    'fx-raider': { id: 'fx-raider', type: 'unit', arena: 'ground', cost: 2, power: 1, hp: 3, aspects: ['aggression'],
      keywords: [{ k: 'raid', n: 2 }] },
    'fx-medic': { id: 'fx-medic', type: 'unit', arena: 'ground', cost: 2, power: 1, hp: 3, aspects: ['vigilance'],
      keywords: [{ k: 'restore', n: 2 }] },
    'fx-brute': { id: 'fx-brute', type: 'unit', arena: 'ground', cost: 4, power: 5, hp: 4, aspects: ['aggression'],
      keywords: [{ k: 'overwhelm' }] },
    'fx-ghost': { id: 'fx-ghost', type: 'unit', arena: 'ground', cost: 3, power: 3, hp: 2, aspects: ['cunning'],
      keywords: [{ k: 'saboteur' }] },
    'fx-shieldy': { id: 'fx-shieldy', type: 'unit', arena: 'space', cost: 3, power: 2, hp: 3, aspects: ['vigilance'],
      keywords: [{ k: 'shielded' }] },
    'fx-ambusher': { id: 'fx-ambusher', type: 'unit', arena: 'ground', cost: 3, power: 3, hp: 3, aspects: ['cunning'],
      keywords: [{ k: 'ambush' }] },
    'fx-gritty': { id: 'fx-gritty', type: 'unit', arena: 'ground', cost: 3, power: 2, hp: 6, aspects: ['vigilance'],
      keywords: [{ k: 'grit' }] },
    'fx-sniper': { id: 'fx-sniper', type: 'unit', arena: 'ground', cost: 3, power: 2, hp: 2, aspects: ['aggression'],
      abilities: [{ trigger: 'onPlay', effects: [{ op: 'damage', amount: 2, target: { who: 'enemy', what: 'unit' } }] }] },
    'fx-martyr': { id: 'fx-martyr', type: 'unit', arena: 'ground', cost: 2, power: 2, hp: 2, aspects: ['command'],
      abilities: [{ trigger: 'whenDefeated', effects: [{ op: 'draw', amount: 1 }] }] },
    'fx-bolt': { id: 'fx-bolt', type: 'event', cost: 1, aspects: ['aggression'],
      abilities: [{ trigger: 'onPlay', effects: [{ op: 'damage', amount: 3, target: { who: 'any', what: 'unitOrBase' } }] }] },
    'fx-supply': { id: 'fx-supply', type: 'event', cost: 2, aspects: ['command'],
      abilities: [{ trigger: 'onPlay', effects: [{ op: 'draw', amount: 2 }] }] },
    'fx-blade': { id: 'fx-blade', type: 'upgrade', cost: 2, power: 2, hp: 1, aspects: ['aggression'], attachTo: 'friendly' },
    // Bounty upgrade: no attachTo, so it may go on either side's units.
    'fx-bounty': { id: 'fx-bounty', type: 'upgrade', cost: 0, aspects: [],
      abilities: [{ trigger: 'bounty', effects: [{ op: 'draw', amount: 1 }] }] },
    'fx-leaderA': { id: 'fx-leaderA', type: 'leader', aspects: ['command', 'heroism'], deployCost: 5,
      leaderSide: { abilities: [{ trigger: 'action', cost: 1, effects: [{ op: 'experience', amount: 1, target: { who: 'friendly', what: 'unit' } }] }] },
      deployedSide: { arena: 'ground', power: 4, hp: 7, keywords: [] } },
    'fx-leaderB': { id: 'fx-leaderB', type: 'leader', aspects: ['aggression', 'villainy'], deployCost: 5,
      leaderSide: { abilities: [{ trigger: 'action', cost: 0, effects: [{ op: 'damage', amount: 1, target: { who: 'enemy', what: 'unit', optional: true } }] }] },
      deployedSide: { arena: 'ground', power: 5, hp: 6, keywords: [{ k: 'raid', n: 1 }] } },
    'fx-baseA': { id: 'fx-baseA', type: 'base', hp: 30, aspects: ['aggression'] },
    'fx-baseB': { id: 'fx-baseB', type: 'base', hp: 30, aspects: ['vigilance'] },
  };
  Object.keys(F).forEach(function (id) {
    SB.cards[id] = F[id];
    SB.names.register('cards', id, { name: 'FX ' + id.slice(3) });
  });

  function deckOf(list) {
    const cards = [];
    list.forEach(function (pair) { for (let i = 0; i < pair[1]; i++) cards.push(pair[0]); });
    return cards;
  }
  SB.decks.fixtureA = {
    leader: 'fx-leaderA', base: 'fx-baseA',
    cards: deckOf([['fx-grunt', 3], ['fx-wall', 3], ['fx-flyer', 3], ['fx-raider', 3], ['fx-medic', 3],
      ['fx-brute', 3], ['fx-sniper', 3], ['fx-martyr', 3], ['fx-bolt', 3], ['fx-supply', 3], ['fx-blade', 3],
      ['fx-gritty', 3], ['fx-shieldy', 2]]),
  };
  SB.decks.fixtureB = {
    leader: 'fx-leaderB', base: 'fx-baseB',
    cards: deckOf([['fx-grunt', 3], ['fx-wall', 3], ['fx-flyer', 3], ['fx-ghost', 3], ['fx-ambusher', 3],
      ['fx-brute', 3], ['fx-sniper', 3], ['fx-martyr', 3], ['fx-bolt', 3], ['fx-supply', 3], ['fx-blade', 3],
      ['fx-gritty', 3], ['fx-shieldy', 2]]),
  };
  SB.names.register('decks', 'fixtureA', 'Fixture Alpha');
  SB.names.register('decks', 'fixtureB', 'Fixture Beta');
})(window.SB = window.SB || {});
