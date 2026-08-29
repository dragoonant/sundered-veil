// test-engine-core.js — setup, turn flow, resources, play costs, immutability.
(function (SB) {
  'use strict';
  const T = SB.test;

  T.add('setup: hands of 4 after resourcing 2, resources 2 each', function () {
    const s = T.game();
    T.eq(s.phase, 'action', 'phase');
    [0, 1].forEach(function (p) {
      T.eq(s.players[p].hand.length, 4, 'hand p' + p);
      T.eq(s.players[p].resources.length, 2, 'resources p' + p);
      const total = SB.decks[s.players[p].deckId].cards.length;
      T.eq(s.players[p].deck.length, total - 6, 'deck p' + p);
    });
    T.eq(s.active, s.initiative, 'initiative acts first');
  });

  T.add('reproducible: same seed, same game start', function () {
    const a = T.game('fixtureA', 'fixtureB', 'seed42');
    const b = T.game('fixtureA', 'fixtureB', 'seed42');
    T.deepEq(a, b, 'identical states');
    const c = T.game('fixtureA', 'fixtureB', 'seed43');
    T.ok(JSON.stringify(a) !== JSON.stringify(c), 'different seed differs');
  });

  T.add('apply never mutates its input', function () {
    const s = T.game();
    const before = JSON.stringify(s);
    const acts = SB.legalActions(s);
    acts.forEach(function (a) { SB.apply(s, a); });
    T.eq(JSON.stringify(s), before, 'state unchanged after applying every action');
  });

  T.add('play unit: pays cost, enters exhausted in its arena', function () {
    let s = T.game();
    const me = s.active;
    T.putInHand(s, me, 'fx-grunt');
    T.giveResources(s, me, 3);
    s = T.act(s, { type: 'playCard', cardId: 'fx-grunt' });
    const u = SB.allUnits(s, me).find(function (x) { return x.cardId === 'fx-grunt'; });
    T.ok(u, 'on board');
    T.ok(u.exhausted, 'enters exhausted');
    T.eq(SB.arenaOf(s, u), 'ground', 'ground arena');
  });

  T.add('aspect penalty: off-aspect card costs +2 per missing icon', function () {
    const s = T.game();
    // fixtureA aspects: command+heroism (leader) + aggression (base).
    T.eq(SB.cardCost(s, 0, 'fx-grunt'), 1, 'aggression covered');
    T.eq(SB.cardCost(s, 0, 'fx-ghost'), 5, 'cunning not covered: 3+2');
    T.eq(SB.cardCost(s, 0, 'fx-supply'), 2, 'command covered');
  });

  T.add('pass/pass ends round; regroup draws 2 and readies', function () {
    let s = T.game('fixtureA', 'fixtureB', 'rg');
    const first = s.active;
    s = T.act(s, { type: 'pass' });
    s = T.act(s, { type: 'pass' });
    // Now in regroup resource choices.
    T.eq(s.players[0].hand.length, 6, 'drew 2');
    T.eq(s.players[1].hand.length, 6, 'drew 2');
    s = SB.apply(s, SB.legalActions(s)[0]); // resource something
    s = SB.apply(s, SB.legalActions(s).find(function (a) { return a.handIndex === -1; })); // decline
    T.eq(s.phase, 'action', 'back to action');
    T.eq(s.round, 2, 'round 2');
    T.eq(s.players[0].resources.length + s.players[1].resources.length, 5, 'one resourced');
  });

  T.add('claim initiative: locks claimer, flips token, other keeps acting', function () {
    let s = T.game('fixtureA', 'fixtureB', 'claim');
    const claimer = s.active;
    s = T.act(s, { type: 'claimInitiative' });
    T.eq(s.initiative, claimer, 'token moved');
    T.eq(s.active, SB.other(claimer), 'other player acts');
    // Claimer never acts again this phase: other player passes → regroup.
    s = T.act(s, { type: 'pass' });
    T.eq(s.phase, 'regroup', 'phase over');
    // Initiative holder resources first next regroup: queue head is claimer.
    T.eq(s.queue[0].player, claimer, 'claimer picks resource first');
  });

  T.add('pass then act clears consecutive-pass tracking', function () {
    let s = T.game('fixtureA', 'fixtureB', 'pp');
    const a = s.active, b = SB.other(a);
    T.putInHand(s, b, 'fx-grunt');
    T.giveResources(s, b, 2);
    s = T.act(s, { type: 'pass' });               // a passes
    s = T.act(s, { type: 'playCard', cardId: 'fx-grunt' }); // b acts
    T.eq(s.phase, 'action', 'still action phase');
    s = T.act(s, { type: 'pass' });               // a passes again
    T.eq(s.phase, 'action', 'not over: passes were not consecutive');
    s = T.act(s, { type: 'pass' });               // b passes → both consecutive
    T.eq(s.phase, 'regroup', 'now over');
  });

  T.add('unique rule: second copy unplayable while first in play', function () {
    let s = T.game();
    const me = s.active;
    SB.cards['fx-uniq'] = { id: 'fx-uniq', type: 'unit', arena: 'ground', cost: 1, power: 1, hp: 1,
      aspects: [], unique: true };
    SB.names.register('cards', 'fx-uniq', { name: 'FX Uniq' });
    T.putOnBoard(s, me, 'fx-uniq');
    T.putInHand(s, me, 'fx-uniq');
    T.giveResources(s, me, 2);
    const plays = SB.legalActions(s).filter(function (a) { return a.cardId === 'fx-uniq'; });
    T.eq(plays.length, 0, 'no duplicate unique');
    delete SB.cards['fx-uniq'];
  });

  T.add('deck-out: failing to draw damages own base 3 per card', function () {
    let s = T.game('fixtureA', 'fixtureB', 'deckout');
    s.players[0].deck = [];
    s = T.act(s, { type: 'pass' });
    s = T.act(s, { type: 'pass' });
    T.eq(s.players[0].base.damage, 6, 'two missed draws = 6');
  });

  T.add('leader deploy: needs resources, arrives ready, flips back on defeat', function () {
    let s = T.game('fixtureA', 'fixtureB', 'dep');
    const me = s.active;
    T.eq(SB.legalActions(s).filter(function (a) { return a.type === 'deployLeader'; }).length, 0, 'not yet');
    T.giveResources(s, me, 3); // 2 + 3 = 5 total resources
    s = T.act(s, { type: 'deployLeader' });
    const lu = SB.allUnits(s, me).find(function (u) { return SB.card(u.cardId).type === 'leader'; });
    T.ok(lu && !lu.exhausted, 'deployed ready');
    // Defeat it: flips back exhausted, healed.
    let s2 = SB.clone(s);
    const lu2 = SB.findUnit(s2, lu.uid);
    SB.defeatUnit(s2, lu2, {});
    T.ok(!s2.players[me].leader.deployed, 'back to leader side');
    T.ok(s2.players[me].leader.exhausted, 'exhausted after defeat');
  });

  T.add('leader action: exhausts leader, queues effect with choice', function () {
    let s = T.game('fixtureA', 'fixtureB', 'la');
    s.active = 0; s.initiative = 0; // pin to the fixtureA player: its leader grants experience
    const me = 0;
    T.putOnBoard(s, me, 'fx-grunt');
    T.putOnBoard(s, me, 'fx-wall');
    T.giveResources(s, me, 1);
    s = T.act(s, { type: 'leaderAction' });
    T.ok(s.players[me].leader.exhausted, 'leader exhausted');
    const choices = SB.legalActions(s);
    T.eq(choices[0].type, 'choose', 'choice pending');
    T.eq(choices.length, 2, 'two friendly units to pick');
    s = SB.apply(s, choices[0]);
    const total = SB.allUnits(s, me).reduce(function (n, u) { return n + u.experience; }, 0);
    T.eq(total, 1, 'one experience token granted');
  });
})(window.SB = window.SB || {});
