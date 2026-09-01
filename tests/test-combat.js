// test-combat.js — attacks, keywords, triggers, events, upgrades.
(function (SB) {
  'use strict';
  const T = SB.test;

  function duel(seed) {
    // Fresh game where the active player has a ready attacker context.
    return T.game('fixtureA', 'fixtureB', seed || 'combat');
  }

  T.add('attack base: exhausts attacker, damages base', function () {
    let s = duel();
    const me = s.active, foe = SB.other(me);
    T.putOnBoard(s, me, 'fx-grunt');
    const uid = s.ground[s.ground.length - 1].uid;
    s = T.act(s, { type: 'attack', attacker: uid, target: { kind: 'base', player: foe } });
    T.eq(s.players[foe].base.damage, 2, 'grunt power 2');
    T.ok(SB.findUnit(s, uid).exhausted, 'attacker exhausted');
  });

  T.add('unit combat: simultaneous damage, mutual destruction possible', function () {
    let s = duel('mutual');
    const me = s.active, foe = SB.other(me);
    const a = T.putOnBoard(s, me, 'fx-grunt');            // 2/2
    const d = T.putOnBoard(s, foe, 'fx-flyer');           // wrong arena
    const g = T.putOnBoard(s, foe, 'fx-grunt');           // 2/2 ground
    s = T.act(s, { type: 'attack', attacker: a.uid, target: { kind: 'unit', uid: g.uid } });
    T.ok(!SB.findUnit(s, a.uid), 'attacker died');
    T.ok(!SB.findUnit(s, g.uid), 'defender died');
    T.ok(SB.findUnit(s, d.uid), 'space unit untouched');
  });

  T.add('arena rule: ground unit cannot attack space unit', function () {
    let s = duel('arena');
    const me = s.active, foe = SB.other(me);
    const a = T.putOnBoard(s, me, 'fx-grunt');
    T.putOnBoard(s, foe, 'fx-flyer');
    const targets = SB.legalActions(s).filter(function (x) { return x.type === 'attack' && x.attacker === a.uid; });
    T.eq(targets.length, 1, 'only base');
    T.eq(targets[0].target.kind, 'base', 'base only');
  });

  T.add('sentinel: forces unit targeting; saboteur ignores it', function () {
    let s = duel('sent');
    const me = s.active, foe = SB.other(me);
    const a = T.putOnBoard(s, me, 'fx-grunt');
    const sab = T.putOnBoard(s, me, 'fx-ghost');
    const w = T.putOnBoard(s, foe, 'fx-wall');   // sentinel
    T.putOnBoard(s, foe, 'fx-grunt');
    const gruntTargets = SB.legalActions(s).filter(function (x) { return x.type === 'attack' && x.attacker === a.uid; });
    T.eq(gruntTargets.length, 1, 'sentinel only');
    T.eq(gruntTargets[0].target.uid, w.uid, 'must hit sentinel');
    const sabTargets = SB.legalActions(s).filter(function (x) { return x.type === 'attack' && x.attacker === sab.uid; });
    T.eq(sabTargets.length, 3, 'saboteur: both units + base');
  });

  T.add('raid: bonus power only while attacking', function () {
    let s = duel('raid');
    const me = s.active, foe = SB.other(me);
    const r = T.putOnBoard(s, me, 'fx-raider'); // 1/3 raid 2
    s = T.act(s, { type: 'attack', attacker: r.uid, target: { kind: 'base', player: foe } });
    T.eq(s.players[foe].base.damage, 3, '1 + raid 2');
  });

  T.add('raid defender: no raid bonus when defending', function () {
    let s = duel('raidD');
    const me = s.active, foe = SB.other(me);
    const a = T.putOnBoard(s, me, 'fx-grunt');     // 2/2
    const r = T.putOnBoard(s, foe, 'fx-raider');   // 1/3 raid 2
    s = T.act(s, { type: 'attack', attacker: a.uid, target: { kind: 'unit', uid: r.uid } });
    T.eq(SB.findUnit(s, a.uid).damage, 1, 'took base power 1, not 3');
  });

  T.add('overwhelm: excess damage hits base', function () {
    let s = duel('ov');
    const me = s.active, foe = SB.other(me);
    const b = T.putOnBoard(s, me, 'fx-brute');   // 5/4 overwhelm
    const g = T.putOnBoard(s, foe, 'fx-grunt');  // 2/2
    s = T.act(s, { type: 'attack', attacker: b.uid, target: { kind: 'unit', uid: g.uid } });
    T.eq(s.players[foe].base.damage, 3, '5 - 2 = 3 overflow');
  });

  T.add('shielded: enters with shield; shield eats one hit fully', function () {
    let s = duel('sh');
    const me = s.active, foe = SB.other(me);
    T.putInHand(s, me, 'fx-shieldy');
    T.giveResources(s, me, 5);
    s = T.act(s, { type: 'playCard', cardId: 'fx-shieldy', handIndex: s.players[me].hand.length - 1 });
    const u = SB.allUnits(s, me).find(function (x) { return x.cardId === 'fx-shieldy'; });
    T.eq(u.shields, 1, 'has shield');
    let s2 = SB.clone(s);
    const u2 = SB.findUnit(s2, u.uid);
    SB.damageUnit(s2, u2, 5, {});
    T.eq(u2.damage, 0, 'shield absorbed everything');
    T.eq(u2.shields, 0, 'shield gone');
  });

  T.add('saboteur: defeats all shields before dealing damage', function () {
    let s = duel('sab');
    const me = s.active, foe = SB.other(me);
    const g = T.putOnBoard(s, me, 'fx-ghost');   // 3/2 saboteur, ground
    const t = T.putOnBoard(s, foe, 'fx-gritty', {}); // ground 2/6
    SB.findUnit(s, t.uid).shields = 2;
    s = T.act(s, { type: 'attack', attacker: g.uid, target: { kind: 'unit', uid: t.uid } });
    const t2 = SB.findUnit(s, t.uid);
    T.eq(t2.shields, 0, 'shields sabotaged');
    T.eq(t2.damage, 3, 'full damage through');
  });

  T.add('grit: power grows with damage', function () {
    let s = duel('grit');
    const g = T.putOnBoard(s, s.active, 'fx-gritty', { damage: 3 }); // 2/6 grit
    T.eq(SB.unitPower(s, SB.findUnit(s, g.uid)), 5, '2 + 3 damage');
  });

  T.add('restore: heals own base on attack', function () {
    let s = duel('rest');
    const me = s.active, foe = SB.other(me);
    s.players[me].base.damage = 5;
    const m = T.putOnBoard(s, me, 'fx-medic'); // restore 2
    s = T.act(s, { type: 'attack', attacker: m.uid, target: { kind: 'base', player: foe } });
    T.eq(s.players[me].base.damage, 3, 'healed 2');
  });

  T.add('ambush: may attack an enemy unit on entry', function () {
    let s = duel('amb');
    const me = s.active, foe = SB.other(me);
    const g = T.putOnBoard(s, foe, 'fx-grunt'); // 2/2
    T.putInHand(s, me, 'fx-ambusher');          // 3/3 ambush
    T.giveResources(s, me, 5);
    s = T.act(s, { type: 'playCard', cardId: 'fx-ambusher' });
    const choices = SB.legalActions(s);
    T.ok(choices.some(function (a) { return a.type === 'choose'; }), 'ambush choice offered');
    s = SB.apply(s, choices[0]);
    T.ok(!SB.findUnit(s, g.uid), 'ambushed grunt died');
    const amb = SB.allUnits(s, me).find(function (u) { return u.cardId === 'fx-ambusher'; });
    T.eq(amb.damage, 2, 'took return damage');
    T.ok(amb.exhausted, 'exhausted after ambush attack');
  });

  T.add('ambush decline: unit stays exhausted, no attack', function () {
    let s = duel('amb2');
    const me = s.active, foe = SB.other(me);
    const g = T.putOnBoard(s, foe, 'fx-grunt');
    T.putInHand(s, me, 'fx-ambusher');
    T.giveResources(s, me, 5);
    s = T.act(s, { type: 'playCard', cardId: 'fx-ambusher' });
    s = T.act(s, { type: 'choose', index: -1 });
    T.ok(SB.findUnit(s, g.uid), 'no attack happened');
  });

  T.add('onPlay damage trigger targets enemy unit; fizzles with none', function () {
    let s = duel('trig');
    const me = s.active, foe = SB.other(me);
    T.putInHand(s, me, 'fx-sniper');
    T.giveResources(s, me, 3);
    s = T.act(s, { type: 'playCard', cardId: 'fx-sniper' });
    const fizzled = s.log.some(function (l) { return l.fizzled; });
    T.ok(fizzled, 'no targets: recorded structurally as fizzle');
  });

  T.add('whenDefeated: martyr draws its owner a card', function () {
    let s = duel('mart');
    const me = s.active, foe = SB.other(me);
    const a = T.putOnBoard(s, me, 'fx-brute');   // 5/4
    const m = T.putOnBoard(s, foe, 'fx-martyr'); // 2/2 whenDefeated draw
    const handBefore = s.players[foe].hand.length;
    s = T.act(s, { type: 'attack', attacker: a.uid, target: { kind: 'unit', uid: m.uid } });
    T.eq(s.players[foe].hand.length, handBefore + 1, 'martyr owner drew');
  });

  T.add('event: bolt deals 3 to chosen target and is discarded', function () {
    let s = duel('bolt');
    const me = s.active, foe = SB.other(me);
    const g = T.putOnBoard(s, foe, 'fx-brute'); // 5/4
    T.putInHand(s, me, 'fx-bolt');
    T.giveResources(s, me, 1);
    s = T.act(s, { type: 'playCard', cardId: 'fx-bolt' });
    const choices = SB.legalActions(s).filter(function (a) { return a.type === 'choose'; });
    T.ok(choices.length >= 3, 'units + bases offered');
    // pick the brute
    const idx = s.queue[0].candidates.findIndex(function (c) { return c.uid === g.uid; });
    s = SB.apply(s, { type: 'choose', player: me, index: idx });
    T.eq(SB.findUnit(s, g.uid).damage, 3, 'took 3');
    T.eq(s.players[me].discard.length, 1, 'event discarded');
  });

  T.add('upgrade: grants stats; detaches to discard when bearer dies', function () {
    let s = duel('upg');
    const me = s.active, foe = SB.other(me);
    const g = T.putOnBoard(s, me, 'fx-grunt'); // 2/2
    T.putInHand(s, me, 'fx-blade');            // +2/+1
    T.giveResources(s, me, 2);
    s = T.act(s, { type: 'playCard', cardId: 'fx-blade', attachTo: g.uid });
    const u = SB.findUnit(s, g.uid);
    T.eq(SB.unitPower(s, u), 4, 'power 2+2');
    T.eq(SB.unitMaxHp(s, u), 3, 'hp 2+1');
    let s2 = SB.clone(s);
    SB.defeatUnit(s2, SB.findUnit(s2, g.uid), {});
    T.ok(s2.players[me].discard.some(function (i) { return i.cardId === 'fx-blade'; }), 'upgrade discarded');
  });

  T.add('win: base at 0 ends game', function () {
    let s = duel('win');
    const me = s.active, foe = SB.other(me);
    s.players[foe].base.damage = 29;
    const g = T.putOnBoard(s, me, 'fx-grunt');
    s = T.act(s, { type: 'attack', attacker: g.uid, target: { kind: 'base', player: foe } });
    T.ok(SB.isTerminal(s), 'terminal');
    T.eq(s.winner, me, 'attacker wins');
    T.eq(SB.legalActions(s).length, 0, 'no actions after game over');
  });
})(window.SB = window.SB || {});

// then/else chaining (CARD-GAME-LESSONS §1 effect schema).
(function (SB) {
  'use strict';
  const T = SB.test;

  T.add('effects: then runs after resolution, else runs on fizzle', function () {
    SB.cards['fx-chain'] = { id: 'fx-chain', type: 'event', cost: 1, aspects: [],
      abilities: [{ trigger: 'onPlay', effects: [
        { op: 'damage', amount: 1, target: { who: 'enemy', what: 'unit' },
          then: [{ op: 'draw', amount: 1 }],
          else: [{ op: 'healBase', amount: 2 }] }] }] };
    SB.names.register('cards', 'fx-chain', { name: 'FX Chain' });

    // Case 1: a target exists -> damage lands, then-branch draws.
    let s = T.game('fixtureA', 'fixtureB', 'chain1');
    const me = s.active, foe = SB.other(me);
    const g = T.putOnBoard(s, foe, 'fx-gritty'); // 2/6 survives 1 damage
    T.putInHand(s, me, 'fx-chain');
    T.giveResources(s, me, 1);
    const hand = s.players[me].hand.length;
    s = T.act(s, { type: 'playCard', cardId: 'fx-chain' });
    T.eq(SB.findUnit(s, g.uid).damage, 1, 'damage landed');
    T.eq(s.players[me].hand.length, hand, 'played 1, drew 1 (then ran)');

    // Case 2: no enemy units -> fizzle, else-branch heals the base.
    let s2 = T.game('fixtureA', 'fixtureB', 'chain2');
    const me2 = s2.active;
    s2.players[me2].base.damage = 5;
    T.putInHand(s2, me2, 'fx-chain');
    T.giveResources(s2, me2, 1);
    s2 = T.act(s2, { type: 'playCard', cardId: 'fx-chain' });
    T.eq(s2.players[me2].base.damage, 3, 'else healed 2');

    delete SB.cards['fx-chain'];
  });

  T.add('bounty upgrade: attaches to an enemy unit, opponent collects', function () {
    let s = T.game('fixtureA', 'fixtureB', 'bounty1');
    const me = s.active, foe = SB.other(me);
    const victim = T.putOnBoard(s, foe, 'fx-grunt');
    T.putInHand(s, me, 'fx-bounty');
    s = T.act(s, { type: 'playCard', cardId: 'fx-bounty', attachTo: victim.uid });
    T.eq(SB.findUnit(s, victim.uid).upgrades.length, 1, 'attached to the enemy unit');

    // Defeating it pays the bounty to the opponent of its controller (me).
    const hand = s.players[me].hand.length;
    SB.defeatUnit(s, SB.findUnit(s, victim.uid), {}); SB.drainQueue(s);
    T.eq(s.players[me].hand.length, hand + 1, 'bounty collected by the upgrade owner');
    // The upgrade returns to ITS owner's discard, not the bearer controller's.
    T.ok(s.players[me].discard.some(function (i) { return i.cardId === 'fx-bounty'; }),
      'upgrade in its own owner discard');
    T.ok(!s.players[foe].discard.some(function (i) { return i.cardId === 'fx-bounty'; }),
      'not in the bearer owner discard');
  });

  T.add('bounty upgrade may also attach to a friendly unit', function () {
    let s = T.game('fixtureA', 'fixtureB', 'bounty2');
    const me = s.active;
    const own = T.putOnBoard(s, me, 'fx-grunt');
    T.putInHand(s, me, 'fx-bounty');
    s = T.act(s, { type: 'playCard', cardId: 'fx-bounty', attachTo: own.uid });
    T.eq(SB.findUnit(s, own.uid).upgrades.length, 1, 'attached');
    const foeHand = s.players[SB.other(me)].hand.length;
    SB.defeatUnit(s, SB.findUnit(s, own.uid), {}); SB.drainQueue(s);
    T.eq(s.players[SB.other(me)].hand.length, foeHand + 1, 'my opponent collects it');
  });

  T.add('bounty is collected on capture too', function () {
    let s = T.game('fixtureA', 'fixtureB', 'bounty3');
    const me = s.active, foe = SB.other(me);
    const victim = T.putOnBoard(s, foe, 'fx-grunt');
    T.putInHand(s, me, 'fx-bounty');
    s = T.act(s, { type: 'playCard', cardId: 'fx-bounty', attachTo: victim.uid });
    const captor = T.putOnBoard(s, me, 'fx-wall');
    const hand = s.players[me].hand.length;
    SB.ops.capture(s, { controller: me, ctx: { sourceUid: captor.uid }, op: { op: 'capture' } },
      { uid: victim.uid });
    SB.drainQueue(s);
    T.eq(s.players[me].hand.length, hand + 1, 'capture pays the bounty');
  });
})(window.SB = window.SB || {});
