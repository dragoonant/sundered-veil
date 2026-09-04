// util.js — RNG, cloning, small helpers. No dependencies; load first.
(function (SB) {
  'use strict';

  // Deterministic RNG: mulberry32 seeded from a string hash.
  // Callers derive a per-decision stream via SB.rng(seedString) so replays are exact.
  function hashString(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  SB.rng = function (seedString) {
    return mulberry32(hashString(String(seedString)));
  };

  // The per-state decision seed: unique per (game seed, log length, round) so any
  // random op inside apply() is reproducible from the state alone.
  SB.stateSeed = function (state, tag) {
    return state.seed + '|' + state.log.length + '|' + state.round + '|' + (tag || '');
  };

  SB.shuffled = function (arr, rand) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };

  // Structured-clone based deep copy. States are plain JSON-safe objects by design.
  SB.clone = function (obj) {
    return JSON.parse(JSON.stringify(obj));
  };

  // The one log entry point (CARD-LOG-AND-TARGETING-SPEC §1). Entries are STRUCTURED —
  // prose is generated at render time by js/logtext.js, never stored. Any entry naming a
  // unit by uid gets its cardId stamped here, so the log can still name (and preview) a card
  // that has since been defeated and left the state.
  // Secondary actors get stamped too ('by' = the doer, 'to'/'a'/'b' = the other end),
  // so a line naming two units still names both after either has left the board.
  const LOG_UIDS = { uid: 'cardId', by: 'byCardId', to: 'toCardId', a: 'aCardId', b: 'bCardId',
    attacker: 'attackerCardId', source: 'sourceCardId' };
  SB.log = function (state, entry) {
    if (SB.findUnit) {
      for (const key in LOG_UIDS) {
        const stamp = LOG_UIDS[key];
        if (entry[key] == null || entry[stamp] != null) continue;
        const u = SB.findUnit(state, entry[key]);
        if (u) entry[stamp] = u.cardId;
      }
    }
    state.log.push(entry);
    return entry;
  };

  SB.other = function (playerIdx) { return playerIdx === 0 ? 1 : 0; };

  SB.assert = function (cond, msg) {
    if (!cond) throw new Error('Assertion failed: ' + msg);
  };
})(window.SB = window.SB || {});
