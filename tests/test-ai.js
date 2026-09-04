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

  // ---- enablement: power you cannot swing with is not power ------------------
  // ash-011's leader action is free and deals exactly 1 damage to a unit with 2+
  // remaining HP, so it can never kill. lof-063 is a 5/5 that can attack ONLY while
  // damaged — and both are in the same competitive list. The ping is the switch.
  function withCadBane(seed) {
    const s = T.game('fixtureA', 'fixtureB', seed);
    s.active = 0; s.initiative = 0;
    s.players[0].leader.cardId = 'ash-011';
    s.players[0].leader.exhausted = false;
    // An empty hand keeps the position about the ping: with cards to play the AI may
    // reasonably do those first (the ping is free and keeps), and this test is about
    // WHICH unit it points at, not when it fires.
    s.players[0].hand = [];
    return s;
  }
  // Drive the leader action to the point where its target is chosen, and report it.
  function pingTarget(s) {
    const act = SB.ai.chooseAction(s, 'competition');
    if (act.type !== 'leaderAction') return { skipped: act.type };
    let r = SB.apply(s, act);
    let guard = 0;
    while (r.queue.length && guard++ < 10) {
      const acts = SB.legalActions(r);
      const head = r.queue[0];
      if (head.candidates) {
        const pick = SB.ai.chooseAction(r, 'competition');
        const cand = head.candidates[pick.index];
        return { uid: cand && cand.uid };
      }
      r = SB.apply(r, acts[0]);
    }
    return { uid: null };
  }

  T.add('ai: pings its OWN locked unit to switch it on, not a harmless enemy', function () {
    const s = withCadBane('ai-enable');
    const mine = T.putOnBoard(s, 0, 'lof-063');   // 5/5, cannot attack until damaged
    const theirs = T.putOnBoard(s, 1, 'ash-248'); // 1/4: pinging it achieves nothing
    const got = pingTarget(s);
    T.ok(!got.skipped, 'takes the free leader action (got ' + got.skipped + ')');
    T.eq(got.uid, mine.uid, 'damages its own locked 5/5, not the enemy 1/4');
    T.ok(got.uid !== theirs.uid, 'and specifically not the harmless enemy unit');
  });

  T.add('ai: does not ping the ENEMY unit that is waiting to be switched on', function () {
    const s = withCadBane('ai-enable-enemy');
    const theirs = T.putOnBoard(s, 1, 'lof-063');  // their 5/5, locked while undamaged
    T.putOnBoard(s, 1, 'ash-248');                 // a legal alternative target
    const got = pingTarget(s);
    if (!got.skipped && got.uid != null) {
      T.ok(got.uid !== theirs.uid, 'never hands the enemy a live 5/5');
    }
  });

  T.add('ai: values a locked unit below the same unit unlocked', function () {
    // The term itself, independent of any one decision.
    const s = T.game('fixtureA', 'fixtureB', 'ai-locked-value');
    const u = T.putOnBoard(s, 0, 'lof-063');
    const locked = SB.ai.evaluate(s, 0, 'competition');
    const hot = JSON.parse(JSON.stringify(s));
    SB.findUnit(hot, u.uid).damage = 1;            // now it can attack
    T.ok(SB.ai.evaluate(hot, 0, 'competition') > locked,
      'a damaged 5/5 that can swing beats an untouched one that cannot');
  });

  // ---- what a position is made of besides bodies -----------------------------
  T.add('ai: the death-payoff machinery works, and is switched off on purpose', function () {
    // deathPayoff lost every gauntlet it was given (49.3% symmetric, 49.1% own-side,
    // against 50.4% without it) and is set to 1 in the profile. The wiring stays because
    // it is correct and measurable; this test pins the mechanism WITHOUT endorsing the
    // term, so re-enabling it is a one-number change with a working test behind it.
    const prof = SB.ai.profiles.competition;
    T.eq(prof.deathPayoff, 1, 'the term is off by default — see docs/ai.md');
    function costOfLosing(cardId) {
      const s = T.game('fixtureA', 'fixtureB', 'ai-death-' + cardId);
      const u = T.putOnBoard(s, 0, cardId);
      const withIt = SB.ai.evaluate(s, 0, 'competition');
      const without = JSON.parse(JSON.stringify(s));
      const arena = SB.arenaOf(without, SB.findUnit(without, u.uid));
      without[arena] = without[arena].filter(function (x) { return x.uid !== u.uid; });
      return withIt - SB.ai.evaluate(without, 0, 'competition');
    }
    T.eq(costOfLosing('fx-martyr').toFixed(2), costOfLosing('fx-grunt').toFixed(2),
      'off: the two 2/2s cost the same to lose');
    prof.deathPayoff = 0.5;
    try {
      T.ok(costOfLosing('fx-martyr') < costOfLosing('fx-grunt'),
        'on: the one that draws a card when it dies is cheaper to lose');
    } finally { prof.deathPayoff = 1; }
  });

  T.add('ai: the force token and credits are worth something', function () {
    const s = T.game('fixtureA', 'fixtureB', 'ai-currency');
    const flat = SB.ai.evaluate(s, 0, 'competition');
    const withForce = JSON.parse(JSON.stringify(s));
    withForce.players[0].force = true;
    T.ok(SB.ai.evaluate(withForce, 0, 'competition') > flat, 'holding the power token beats not holding it');
    const withCredit = JSON.parse(JSON.stringify(s));
    withCredit.players[0].credits = 1;
    T.ok(SB.ai.evaluate(withCredit, 0, 'competition') > flat, 'a credit beats no credit');
    // ...and a permanent resource is still worth more than a one-shot credit.
    const withRes = JSON.parse(JSON.stringify(s));
    T.giveResources(withRes, 0, 1);
    T.ok(SB.ai.evaluate(withRes, 0, 'competition') > SB.ai.evaluate(withCredit, 0, 'competition'),
      'a resource outvalues a credit');
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
