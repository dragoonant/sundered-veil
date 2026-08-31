// state.js — game state shape and initial setup. Depends on: util.js, and card data
// (SB.cards, SB.decks) being loaded.
//
// State is a plain JSON-safe object. Never mutate a state you were given; engine.apply
// clones first. Shape:
// {
//   seed, round, phase: 'setup'|'action'|'regroup'|'done',
//   active: 0|1,                  // whose choice it is right now
//   initiative: 0|1,              // token holder
//   initiativeClaimed: bool,      // claimed THIS round
//   passed: [bool, bool],         // passed out of the current action phase
//   queue: [pendingStep, ...],    // resolution stack; non-empty => 'choose' actions only
//   players: [player, player],
//   ground: [unit...], space: [unit...],   // both players' units, owner field discriminates
//   nextUid: int,
//   log: [{type, ...data}],
//   winner: null|0|1|'draw',
// }
// player = {
//   leader: {cardId, deployed:bool, exhausted:bool, damage:int, uid|null,
//            defeated:bool},  // a leader defeated as a unit can never deploy again
//   base: {cardId, damage:int},
//   hand: [instance], deck: [instance], discard: [instance],
//   resources: [{instance, exhausted:bool}],
//   resourcedThisRound: bool, drawnThisRegroup: bool, mulliganed: bool,
// }
// instance = {uid, cardId}  (hidden zones keep instances so tokens/copies stay distinct)
// unit (in arena) = {uid, cardId, owner, damage, exhausted, upgrades:[instance...],
//                    shields:int, experience:int, temp:{power,hp}, enteredRound:int,
//                    attackedThisPhase? ... }
(function (SB) {
  'use strict';

  SB.makeUnit = function (state, cardId, owner) {
    return {
      uid: state.nextUid++, cardId: cardId, owner: owner,
      damage: 0, exhausted: true, upgrades: [], shields: 0, experience: 0,
      temp: { power: 0, hp: 0 }, enteredRound: state.round,
    };
  };

  // Build a fresh game. deckIds reference SB.decks entries: {leader, base, cards:[cardId xN]}
  SB.newGame = function (opts) {
    const seed = String(opts.seed == null ? 'game' : opts.seed);
    const state = {
      seed: seed, round: 1, phase: 'setup', active: 0, initiative: 0,
      initiativeClaimed: false, passed: [false, false], queue: [],
      players: [], ground: [], space: [], nextUid: 1, log: [], winner: null,
    };
    const rand = SB.rng(seed + '|setup');
    state.initiative = rand() < 0.5 ? 0 : 1;
    state.active = state.initiative;

    [opts.deck0, opts.deck1].forEach(function (deckId, idx) {
      const deck = SB.decks[deckId];
      SB.assert(deck, 'unknown deck ' + deckId);
      const instances = deck.cards.map(function (cardId) {
        return { uid: state.nextUid++, cardId: cardId };
      });
      const shuffledDeck = SB.shuffled(instances, SB.rng(seed + '|shuffle|' + idx));
      state.players.push({
        deckId: deckId,
        leader: { cardId: deck.leader, deployed: false, exhausted: false, damage: 0, uid: null,
          defeated: false },
        base: { cardId: deck.base, damage: 0 },
        hand: shuffledDeck.slice(0, 6),
        deck: shuffledDeck.slice(6),
        discard: [],
        resources: [],
        resourcedThisRound: false, mulliganed: false,
      });
    });
    SB.log(state, { type: 'gameStart', initiative: state.initiative });
    // Setup phase: each player (initiative first) decides mulligan, then picks 2 cards
    // from hand to start as resources. Modeled through the queue like any other choice.
    state.queue.push({ step: 'mulligan', player: state.initiative });
    state.queue.push({ step: 'mulligan', player: SB.other(state.initiative) });
    state.queue.push({ step: 'setupResources', player: state.initiative });
    state.queue.push({ step: 'setupResources', player: SB.other(state.initiative) });
    return state;
  };
})(window.SB = window.SB || {});
