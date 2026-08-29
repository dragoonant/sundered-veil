// test-ai.js — pinned AI decisions (policy tests, per CARD-GAME-LESSONS §3): each
// position has one clearly right move by card-game fundamentals; assert the policy
// finds it in noiseless (hard) mode so a failure means the reasoning changed.
(function (SB) {
  'use strict';
  const T = SB.test;

  T.add('ai: takes lethal on base over any other action', function () {
    let s = T.game('fixtureA', 'fixtureB', 'ai-lethal');
    const me = s.active, foe = SB.other(me);
    s.players[foe].base.damage = 28;
    T.putOnBoard(s, me, 'fx-brute'); // 5 power, lethal on base
    const uid = s.ground[s.ground.length - 1].uid;
    const act = SB.ai.chooseAction(s, 'hard');
    T.eq(act.type, 'attack', 'attacks');
    T.eq(act.attacker, uid, 'with the brute');
    T.eq(act.target.kind, 'base', 'at the base');
  });

  T.add('ai: removes a big threat with efficient event over passing', function () {
    let s = T.game('fixtureA', 'fixtureB', 'ai-removal');
    s.active = 0; s.initiative = 0;
    const me = 0, foe = 1;
    T.putOnBoard(s, foe, 'fx-brute');            // 5/4 threat
    T.putInHand(s, me, 'fx-bolt');               // 3 damage
    T.putInHand(s, me, 'fx-bolt');
    T.giveResources(s, me, 2);
    // With two bolts it can finish the brute across turns; at minimum it should
    // NOT pass while holding playable interaction and a live threat.
    const act = SB.ai.chooseAction(s, 'hard');
    T.ok(act.type !== 'pass', 'does something (got ' + act.type + ')');
  });

  T.add('ai: does not attack its own disadvantageous trade for nothing', function () {
    let s = T.game('fixtureA', 'fixtureB', 'ai-trade');
    s.active = 0; s.initiative = 0;
    const me = 0, foe = 1;
    const mine = T.putOnBoard(s, me, 'fx-grunt');   // 2/2
    T.putOnBoard(s, foe, 'fx-gritty');              // 2/6 grit: trade kills grunt, buffs gritty
    // Attacking the gritty unit loses the grunt for 2 damage and PUMPS grit.
    // Attacking base (2 damage) is strictly better.
    const act = SB.ai.chooseAction(s, 'hard');
    if (act.type === 'attack' && act.attacker === mine.uid) {
      T.eq(act.target.kind, 'base', 'prefers base hit over feeding grit');
    }
  });

  T.add('ai: full game vs itself terminates with a winner (mid)', function () {
    let s = SB.newGame({ deck0: 'deck-s1a', deck1: 'deck-s1b', seed: 'aivai' });
    let n = 0;
    while (!SB.isTerminal(s)) {
      if (++n > 2500) throw new Error('AI game did not terminate');
      const act = SB.ai.chooseAction(s, 'mid');
      s = SB.apply(s, act);
    }
    T.ok(s.winner === 0 || s.winner === 1, 'winner: ' + s.winner + ' in ' + n + ' actions, round ' + s.round);
  });
})(window.SB = window.SB || {});
