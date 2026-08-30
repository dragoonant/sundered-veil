// logpanel.js — the three things that answer "what just happened?"
// (CARD-LOG-AND-TARGETING-SPEC §3, §5, §7, §8):
//   the LOG      — history, newest first, with live card names
//   the RECENT   — a strip of actual card faces, because a log line is not a card
//   the BATTLE   — one line of CURRENT state, which history cannot give you
// UI-only file. Reads state and SB.describeLog; never writes either.
(function (SB) {
  'use strict';

  const WINDOW = 60;      // §5: a long game's log is thousands of lines nobody reads
  const RECENT_MAX = 5;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // ---- §3: card names in the log are live hover targets ---------------------

  function logLine(state, entry) {
    const line = el('div', 'log-line');
    if (SB.logIsDivider(entry)) line.classList.add('log-turn');
    if (entry.notice) line.classList.add('log-notice');

    const text = SB.describeLog(entry, state);
    if (text == null) {
      // Should be unreachable — tests/test-log.js fails on any type without a
      // describer — but a missing line must never be a raw internal id on screen.
      line.textContent = '…';
      return line;
    }

    const subject = SB.logSubject(entry, state);
    if (!subject) { line.textContent = text; return line; }

    const label = SB.names.card(subject.cardId);
    const at = text.indexOf(label);
    const getUnit = subject.uid == null ? null
      : function () { return SB.findUnit(SB.ui.state, subject.uid); };
    const getState = function () { return SB.ui.state; };

    if (at === -1) {
      // The name did not survive phrasing (possessives, pronouns, plurals). Degrading
      // to a whole-line hover target beats silently dropping the affordance.
      line.textContent = text;
      line.classList.add('has-card');
      line.tabIndex = 0;
      SB.preview.attach(line, subject.cardId, getUnit, getState);
      return line;
    }
    line.appendChild(document.createTextNode(text.slice(0, at)));
    const ref = el('span', 'card-ref', label);
    ref.tabIndex = 0;                                   // keyboard reachable
    SB.preview.attach(ref, subject.cardId, getUnit, getState);
    line.appendChild(ref);
    line.appendChild(document.createTextNode(text.slice(at + label.length)));
    return line;
  }

  // ---- §5: the panel --------------------------------------------------------

  function renderLog(state, node) {
    node.textContent = '';
    const entries = state.log.slice(-WINDOW);
    for (let i = entries.length - 1; i >= 0; i--) {     // NEWEST FIRST — never scroll
      if (entries[i].silent) continue;                  // cue-only entries carry no line
      node.appendChild(logLine(state, entries[i]));
    }
    node.scrollTop = 0;
  }

  // ---- §7: recently played --------------------------------------------------
  // Derived from the log rather than hooked off the action, so it is correct after
  // an undo and after a drag (which skips the spotlight animation entirely).

  const PLAY_TYPES = { playCard: 1, smuggled: 1, plotPlayed: 1, deployLeader: 1, deployLeaderPilot: 1 };

  function renderRecent(state, node, humanSeat) {
    node.textContent = '';
    const recent = [];
    for (let i = state.log.length - 1; i >= 0 && recent.length < RECENT_MAX; i--) {
      const l = state.log[i];
      if (PLAY_TYPES[l.type] && l.cardId) recent.push(l);
    }
    if (recent.length === 0) {
      node.appendChild(el('div', 'recent-empty', 'Nothing played yet.'));
      return;
    }
    recent.forEach(function (l) {
      const wrap = el('div', 'recent-card' + (l.player === humanSeat ? ' mine' : ' theirs'));
      const card = SB.renderCard({ cardId: l.cardId }, { size: 'board', state: state });
      wrap.appendChild(card);
      wrap.tabIndex = 0;
      SB.preview.attach(wrap, l.cardId, null, function () { return SB.ui.state; });
      node.appendChild(wrap);
    });
  }

  // ---- §8: the battle line --------------------------------------------------
  // Combat normally resolves inside one apply(), so this line exists for the case
  // that matters: an attack that has stopped mid-flight to ask a question. Then the
  // player is being asked to decide something ABOUT a battle they can no longer see.

  function pendingBattle(state) {
    for (let i = 0; i < state.queue.length; i++) {
      if (state.queue[i].step === 'combatDamage') return state.queue[i];
    }
    return null;
  }

  // Sided, because the two ends of a battle are routinely the SAME card: mirrored
  // leaders make a bare "Kael Verin → Kael Verin" say nothing at all.
  function unitLabel(state, uid, humanSeat, fallback) {
    const u = SB.findUnit(state, uid);
    if (!u) return fallback;
    return (u.owner === humanSeat ? 'your ' : 'the enemy ') + SB.names.card(u.cardId);
  }

  function renderBattle(state, node, humanSeat) {
    const b = pendingBattle(state);
    node.textContent = '';
    node.style.display = b ? '' : 'none';
    if (!b) return;
    // Fallbacks are load-bearing: either side can die mid-battle and the line must
    // still render rather than throw on a uid that has left the state.
    const attacker = unitLabel(state, b.attackerUid, humanSeat, 'a destroyed unit');
    const target = b.target.kind === 'base'
      ? (b.target.player === humanSeat ? 'your base' : 'the enemy base')
      : unitLabel(state, b.target.uid, humanSeat, 'a destroyed unit');
    node.appendChild(el('span', 'battle-attacker', attacker.charAt(0).toUpperCase() + attacker.slice(1)));
    node.appendChild(el('span', 'battle-arrow', '  →  '));
    node.appendChild(el('span', 'battle-target', target));
  }

  SB.logPanel = {
    renderLog: renderLog,
    renderRecent: renderRecent,
    renderBattle: renderBattle,
    pendingBattle: pendingBattle,
  };
})(window.SB = window.SB || {});
