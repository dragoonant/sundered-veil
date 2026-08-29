// test-fuzz.js — layered fuzzing: the real regression guard. Random full games must
// never throw, never reach a live state with zero legal actions, and must terminate.
(function (SB) {
  'use strict';
  const T = SB.test;

  // Play one full random game; returns final state. Throws on any invariant break.
  SB.randomGame = function (deck0, deck1, seed, maxActions) {
    let s = SB.newGame({ deck0: deck0, deck1: deck1, seed: seed });
    const rand = SB.rng('fuzz|' + seed);
    let n = 0;
    const cap = maxActions || 4000;
    while (!SB.isTerminal(s)) {
      if (++n > cap) throw new Error('game did not terminate within ' + cap + ' actions (round ' + s.round + ')');
      const acts = SB.legalActions(s);
      if (acts.length === 0) throw new Error('dead state: zero legal actions in phase ' + s.phase +
        ' queue=' + JSON.stringify(s.queue[0] || null));
      s = SB.apply(s, acts[Math.floor(rand() * acts.length)]);
    }
    return s;
  };

  T.add('fuzz: 60 random fixture games run clean', function () {
    for (let i = 0; i < 60; i++) {
      const final = SB.randomGame(i % 2 ? 'fixtureA' : 'fixtureB', i % 2 ? 'fixtureB' : 'fixtureA', 'fz' + i);
      T.ok(final.winner === 0 || final.winner === 1 || final.winner === 'draw', 'has result');
    }
  });

  T.add('fuzz: random game reproducible from seed', function () {
    const a = SB.randomGame('fixtureA', 'fixtureB', 'repro');
    const b = SB.randomGame('fixtureA', 'fixtureB', 'repro');
    T.deepEq(a.log, b.log, 'identical logs');
  });

  // Deck-matrix fuzz over the real deck registry: every deck vs every other, both
  // seats. With only fixtures loaded this covers the fixtures; when the 13 real
  // decks land this automatically becomes the full matrix + crude balance readout.
  T.add('fuzz: deck matrix, every registered deck both seats', function () {
    const ids = Object.keys(SB.decks);
    const wins = {};
    ids.forEach(function (a) {
      ids.forEach(function (b) {
        if (a === b) return;
        const f = SB.randomGame(a, b, 'mx|' + a + '|' + b);
        const w = f.winner === 0 ? a : f.winner === 1 ? b : 'draw';
        wins[w] = (wins[w] || 0) + 1;
      });
    });
    // No assertion on balance — this is a smoke pass + readout hook.
    T.ok(true, JSON.stringify(wins));
  });
})(window.SB = window.SB || {});
