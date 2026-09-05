// test-anim.js — the battle-animation planner (js/anim.js, the pure half).
// Every apply's fresh log entries must turn into the steps the player expects to
// see: a shot from the attacker, the return fire, the fall into the pile.
(function (SB) {
  'use strict';
  const T = SB.test;

  function duel(seed) { return T.game('fixtureA', 'fixtureB', seed || 'anim'); }
  function planOf(before, after, fromLog) { return SB.anim.plan(before, after, fromLog, 0); }
  function kinds(steps) { return steps.map(function (s) { return s.kind; }); }

  T.add('anim: attacking a unit is two strikes, attacker first, then the defeats', function () {
    let s = duel('two-beats');
    const me = s.active, foe = SB.other(me);
    const a = T.putOnBoard(s, me, 'fx-grunt');            // 2/2
    const g = T.putOnBoard(s, foe, 'fx-grunt');           // 2/2: mutual destruction
    const before = s.log.length;
    const n = T.act(s, { type: 'attack', attacker: a.uid, target: { kind: 'unit', uid: g.uid } });
    const steps = planOf(s, n, before);
    T.deepEq(kinds(steps), ['strike', 'strike', 'defeat', 'defeat'], 'shape');
    T.eq(steps[0].from.uid, a.uid, 'first strike from the attacker');
    T.eq(steps[0].hits[0].to.uid, g.uid, 'lands on the defender');
    T.eq(steps[0].hits[0].amount, 2, 'for its power');
    T.eq(steps[0].style, 'ranged', 'a plain trooper shoots');
    T.eq(steps[1].from.uid, g.uid, 'second strike is the return fire');
    T.eq(steps[1].hits[0].to.uid, a.uid, 'back at the attacker');
    T.eq(steps[2].uid, g.uid, 'defender leaves first (logged first)');
    T.eq(steps[2].owner, foe, 'to the pile of its owner');
    T.eq(steps[3].uid, a.uid, 'then the attacker');
  });

  T.add('anim: attacking the base is one strike on the base', function () {
    let s = duel('base');
    const me = s.active, foe = SB.other(me);
    const a = T.putOnBoard(s, me, 'fx-grunt');
    const before = s.log.length;
    const n = T.act(s, { type: 'attack', attacker: a.uid, target: { kind: 'base', player: foe } });
    const steps = planOf(s, n, before);
    T.deepEq(kinds(steps), ['strike'], 'one step');
    T.deepEq(steps[0].hits[0].to, { kind: 'base', player: foe }, 'on the base');
    T.eq(steps[0].hits[0].amount, 2, 'amount');
  });

  T.add('anim: a ground force-wielder lunges; its trooper defender shoots back', function () {
    let s = duel('melee');
    const me = s.active, foe = SB.other(me);
    // Any real ground unit carrying a melee trait, with enough HP to survive a 2-power hit.
    const blade = Object.keys(SB.cards).find(function (id) {
      const c = SB.cards[id];
      return c.type === 'unit' && c.arena === 'ground' && !c.token && (c.hp || 0) >= 3 &&
        (c.traits || []).some(function (t) { return ['tr13', 'tr22', 'tr40', 'tr26'].indexOf(t) >= 0; });
    });
    T.ok(blade, 'a melee-trait ground unit exists in the data');
    const a = T.putOnBoard(s, me, blade);
    const g = T.putOnBoard(s, foe, 'fx-gritty');          // 2/6: nobody dies
    const before = s.log.length;
    const n = T.act(s, { type: 'attack', attacker: a.uid, target: { kind: 'unit', uid: g.uid } });
    const steps = planOf(s, n, before).filter(function (x) { return x.kind === 'strike'; });
    T.ok(steps.length >= 1, 'a strike was planned');
    T.eq(steps[0].style, 'melee', 'the force-wielder lunges');
    if (steps.length > 1) T.eq(steps[1].style, 'ranged', 'the return fire is a shot');
  });

  T.add('anim: a space unit never lunges, whatever its traits', function () {
    let s = duel('space');
    const me = s.active, foe = SB.other(me);
    const a = T.putOnBoard(s, me, 'fx-flyer');
    const before = s.log.length;
    const n = T.act(s, { type: 'attack', attacker: a.uid, target: { kind: 'base', player: foe } });
    T.eq(planOf(s, n, before)[0].style, 'ranged', 'space is always ranged');
  });

  T.add('anim: combat damage is flagged combat; effect damage is not', function () {
    let s = duel('flag');
    const me = s.active, foe = SB.other(me);
    const a = T.putOnBoard(s, me, 'fx-grunt');
    const g = T.putOnBoard(s, foe, 'fx-gritty');
    const n = T.act(s, { type: 'attack', attacker: a.uid, target: { kind: 'unit', uid: g.uid } });
    const dmg = n.log.filter(function (l) { return l.type === 'unitDamage'; });
    T.ok(dmg.length >= 1, 'damage logged');
    T.ok(dmg.every(function (l) { return l.combat === true; }), 'combat flagged');
    T.eq(dmg[0].source, a.uid, 'source is the attacker');
    T.eq(dmg[0].sourceCardId, 'fx-grunt', 'and its card is stamped');
    // Sourceless effect damage: nothing to draw from except the acting side.
    let s2 = duel('flag2');
    const t = T.putOnBoard(s2, SB.other(s2.active), 'fx-gritty');
    const before = s2.log.length;
    SB.damageUnit(s2, t, 1, null);
    T.eq(s2.log[s2.log.length - 1].combat, false, 'not combat');
    const steps = planOf(s2, s2, before);
    T.eq(steps[0].from.kind, 'base', 'drawn from the acting side');
    T.eq(steps[0].style, 'ranged', 'as a shot');
  });

  T.add('anim: passing plans nothing', function () {
    let s = duel('pass');
    const before = s.log.length;
    const n = T.act(s, { type: 'pass' });
    T.deepEq(planOf(s, n, before), [], 'empty');
  });

  T.add('anim: a played event waits for its spotlight, fires from it, then falls to the pile', function () {
    let s = duel('event');
    const me = s.active, foe = SB.other(me);
    const g = T.putOnBoard(s, foe, 'fx-gritty');
    T.putInHand(s, me, 'fx-bolt');
    T.giveResources(s, me, 4);
    const before = s.log.length;
    // By index: the fixture hand may already hold another copy.
    const hi = s.players[me].hand.length - 1;
    T.eq(s.players[me].hand[hi].cardId, 'fx-bolt', 'the event is the last card in hand');
    let n = T.act(s, { type: 'playCard', handIndex: hi });
    // Answer whatever the event asks, aiming at the gritty unit when it is offered.
    let guard = 0;
    while (n.queue.length > 0 && SB.whoActs(n) === me && guard++ < 6) {
      const acts = SB.legalActions(n);
      const pick = acts.find(function (x) {
        return x.type === 'choose' && n.queue[0].candidates && n.queue[0].candidates[x.index] &&
          n.queue[0].candidates[x.index].uid === g.uid;
      }) || acts[0];
      n = SB.apply(n, pick);
    }
    const steps = planOf(s, n, before);
    T.eq(steps[0].kind, 'wait', 'spotlight first');
    const strike = steps.find(function (x) { return x.kind === 'strike'; });
    T.ok(strike, 'the damage of the event is drawn');
    T.eq(strike.from.kind, 'spot', 'from the spotlighted card');
    T.eq(steps[steps.length - 1].kind, 'eventToDiscard', 'and the event ends in the pile');
    T.eq(steps[steps.length - 1].cardId, 'fx-bolt', 'that event');
  });

  T.add('anim: the killing blow on a base ends with the planet going up', function () {
    let s = duel('planet');
    const me = s.active, foe = SB.other(me);
    const a = T.putOnBoard(s, me, 'fx-grunt');            // 2 power
    a.ready = true; a.exhausted = false; a.justPlayed = false;
    const base = s.players[foe].base;
    base.damage = SB.card(base.cardId).hp - 1;            // one hit from dead
    const before = s.log.length;
    const n = T.act(s, { type: 'attack', attacker: a.uid, target: { kind: 'base', player: foe } });
    T.eq(n.winner, me, 'the base fell');
    const steps = planOf(s, n, before);
    const last = steps[steps.length - 1];
    T.eq(last.kind, 'baseBlast', 'the blast is the final step');
    T.eq(last.player, foe, 'over the base that died');
    T.eq(kinds(steps).filter(function (k) { return k === 'baseBlast'; }).length, 1, 'exactly one planet');
  });

  // The planner sees every log type real games produce. It must never throw, and
  // every step it emits must point at something the board can draw.
  T.add('anim: the planner survives whole games across the deck registry', function () {
    const ids = Object.keys(SB.decks).slice(0, 6);
    let applies = 0, drawn = 0;
    ids.forEach(function (a, i) {
      const b = ids[(i + 1) % ids.length];
      let s = SB.newGame({ deck0: a, deck1: b, seed: 'anim-fuzz|' + a + '|' + b });
      let guard = 0;
      while (!SB.isTerminal(s) && guard++ < 600) {
        const acts = SB.legalActions(s);
        const act = SB.ai ? SB.ai.chooseAction(s, 'easy') : acts[0];
        const before = s.log.length;
        const n = SB.apply(s, act);
        const steps = SB.anim.plan(s, n, before, 0);
        applies++;
        steps.forEach(function (st) {
          T.ok(['wait', 'strike', 'defeat', 'upgradeGone', 'eventToDiscard', 'handDiscard', 'baseBlast'].indexOf(st.kind) >= 0, 'known kind ' + st.kind);
          if (st.kind === 'strike') {
            T.ok(st.from && st.from.kind, 'strike has an origin');
            T.ok(st.hits.length > 0, 'strike has hits');
            T.ok(st.style === 'melee' || st.style === 'ranged', 'style set');
            T.ok(['red', 'blue', 'gold'].indexOf(st.color) >= 0, 'colour set');
            drawn++;
          }
          if (st.kind === 'baseBlast') {
            T.eq(st.player, SB.other(n.winner), 'the planet that goes up is the loser\'s');
            T.eq(st, steps[steps.length - 1], 'and nothing is drawn after it');
          }
        });
        s = n;
      }
    });
    T.ok(applies > 100, 'games actually ran (' + applies + ' applies)');
    T.ok(drawn > 20, 'strikes were planned (' + drawn + ')');
  });
})(window.SB = window.SB || {});
