// harness.js — hand-rolled test framework + position-building helpers.
// Tests set state directly so each test states its premise in 2–3 lines.
(function (SB) {
  'use strict';

  const T = SB.test = { cases: [], only: null };

  T.add = function (name, fn) { T.cases.push({ name: name, fn: fn }); };

  T.run = function (opts) {
    opts = opts || {};
    let pass = 0, fail = 0;
    const failures = [];
    T.cases.forEach(function (c) {
      if (opts.filter && c.name.indexOf(opts.filter) < 0) return;
      try {
        c.fn();
        pass++;
        if (!opts.quiet) T.report('ok', c.name);
      } catch (e) {
        fail++;
        failures.push({ name: c.name, error: e });
        T.report('FAIL', c.name + '\n    ' + (e && e.stack || e));
      }
    });
    T.report(fail ? 'FAIL' : 'ok', pass + ' passed, ' + fail + ' failed');
    return { pass: pass, fail: fail, failures: failures };
  };

  T.report = function (status, msg) {
    if (typeof console !== 'undefined') console.log('[' + status + '] ' + msg);
  };

  T.eq = function (a, b, msg) {
    if (a !== b) throw new Error((msg || 'eq') + ': expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));
  };
  T.ok = function (v, msg) { if (!v) throw new Error(msg || 'expected truthy'); };
  T.deepEq = function (a, b, msg) {
    const ja = JSON.stringify(a), jb = JSON.stringify(b);
    if (ja !== jb) throw new Error((msg || 'deepEq') + ': ' + ja + ' !== ' + jb);
  };
  T.throws = function (fn, msg) {
    try { fn(); } catch (e) { return e; }
    throw new Error(msg || 'expected throw');
  };

  // ---- position builders --------------------------------------------------
  // T.game(deck0, deck1) builds a fresh game and fast-forwards through setup with
  // default choices (keep hand, resource first cards).
  T.game = function (deck0, deck1, seed) {
    let s = SB.newGame({ deck0: deck0 || 'fixtureA', deck1: deck1 || 'fixtureB', seed: seed || 'test' });
    while (s.queue.length > 0 && (s.queue[0].step === 'mulligan' || s.queue[0].step === 'setupResources')) {
      const acts = SB.legalActions(s);
      const act = acts.find(function (a) { return a.type === 'mulligan' ? a.keep : true; }) || acts[0];
      s = SB.apply(s, act);
    }
    return s;
  };

  // Direct state surgery (allowed in tests only). These mutate the given state.
  T.putOnBoard = function (state, playerIdx, cardId, opts) {
    opts = opts || {};
    const unit = SB.makeUnit(state, cardId, playerIdx);
    unit.exhausted = !!opts.exhausted;
    if (opts.damage) unit.damage = opts.damage;
    if (opts.shields) unit.shields = opts.shields;
    state[SB.card(cardId).arena].push(unit);
    return unit;
  };

  T.putInHand = function (state, playerIdx, cardId) {
    const inst = { uid: state.nextUid++, cardId: cardId };
    state.players[playerIdx].hand.push(inst);
    return inst;
  };

  T.giveResources = function (state, playerIdx, n) {
    for (let i = 0; i < n; i++) {
      state.players[playerIdx].resources.push({
        instance: { uid: state.nextUid++, cardId: state.players[playerIdx].deck[0] ?
          state.players[playerIdx].deck[0].cardId : Object.keys(SB.cards)[0] },
        exhausted: false,
      });
    }
  };

  // Find-and-apply: matcher is a subset object; on failure prints every action.
  T.act = function (state, matcher) {
    const acts = SB.legalActions(state);
    const found = acts.filter(function (a) {
      return Object.keys(matcher).every(function (k) {
        return JSON.stringify(a[k]) === JSON.stringify(matcher[k]);
      });
    });
    if (found.length !== 1) {
      throw new Error('act(' + JSON.stringify(matcher) + ') matched ' + found.length +
        ' actions.\nAvailable:\n' + acts.map(function (a) { return '  ' + JSON.stringify(a); }).join('\n'));
    }
    return SB.apply(state, found[0]);
  };
})(window.SB = window.SB || {});
