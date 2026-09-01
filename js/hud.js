// hud.js — the chrome that used to be a top bar. UI-only file, loaded after help.js
// and before ui.js.
//
// Three things live here, and they share one idea: the board is the whole screen, so
// anything that is not a card gets out of its way.
//
//   the log drawer   — closed at the start of a game, opened by an edge handle
//   the turn banner  — said once in the middle of the screen, then gone
//   the leader popover — the leader's own actions, on the leader's own card
//
// None of it is game state. Whether the drawer is open or the banner has been shown
// is a way of LOOKING at the game, never a move in it, so undo must not touch it.
(function (SB) {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  let drawerOpen = false;
  let bannerKey = null;        // the turn we have already announced
  let leaderSeat = null;       // which leader's popover is open, if any

  // ---- the log drawer ------------------------------------------------------

  function setDrawer(on) {
    drawerOpen = on;
    document.body.classList.toggle('drawer-open', on);
    const h = $('log-handle');
    if (h) h.setAttribute('aria-expanded', String(on));
  }

  function syncMute() {
    const b = $('mute-btn');
    if (!b) return;
    const muted = SB.sound && SB.sound.isMuted();
    b.textContent = muted ? SB.names.ui.muteOff : SB.names.ui.muteOn;
    b.classList.toggle('is-muted', !!muted);
  }

  // ---- the turn banner -----------------------------------------------------
  // Fired once per ROUND, never per redraw and never per action. The action phase
  // alternates the acting player after every single move, so keying this on "whose
  // turn is it" would put a banner across the middle of the board a dozen times a
  // round. The round is the thing worth announcing; who holds the initiative is then
  // marked permanently on their leader, which is what you check mid-round anyway.

  function showBanner(text, sub) {
    const node = $('turn-banner');
    if (!node) return;
    node.textContent = '';
    node.appendChild(el('div', 'turn-banner-main', text));
    if (sub) node.appendChild(el('div', 'turn-banner-sub', sub));
    // Restart the animation on a node that may still be mid-fade from the last turn.
    node.classList.remove('show');
    void node.offsetWidth;
    node.classList.add('show');
  }

  function maybeBanner(state, humanSeat, acting) {
    if (SB.isTerminal(state)) return;
    const key = String(state.round);
    if (key === bannerKey) return;
    bannerKey = key;
    const mine = acting === humanSeat;
    showBanner(SB.names.ui.round + ' ' + state.round + ' — ' +
      (mine ? SB.names.ui.yourTurn : SB.names.ui.enemyTurn),
      state.initiative === humanSeat ? SB.names.ui.initiativeYours : SB.names.ui.initiativeTheirs);
  }

  // ---- the initiative marker ----------------------------------------------
  // A ring round the leader who holds it, plus the word itself. Both are added AFTER
  // ui.js has rebuilt the leader slots, because rebuilding clears them.

  function markInitiative(state, humanSeat) {
    [['my-leader', humanSeat], ['enemy-leader', SB.other(humanSeat)]].forEach(function (pair) {
      const node = $(pair[0]);
      if (!node) return;
      const holds = state.initiative === pair[1];
      node.classList.toggle('has-initiative', holds);
      // The pulse is a wall-clock animation (§11): a slot redrawn every action would
      // otherwise restart its glow and never actually pulse.
      if (holds) {
        node.style.animationDelay = SB.animationPhase(1900);
        node.appendChild(el('div', 'initiative-flag', SB.names.ui.initiative));
      } else {
        node.style.animationDelay = '';
      }
    });
  }

  // ---- the leader popover --------------------------------------------------
  // Deploying and leader abilities used to be unexplained verbs in a top bar. They
  // belong to one card, so they are asked for on that card, with its face enlarged.

  function leaderActions(acts, seat) {
    return acts.filter(function (a) {
      if (a.type === 'deployLeader' || a.type === 'leaderAction') return true;
      return a.type === 'deployLeaderPilot';
    });
  }

  function unitName(state, uid) {
    const u = SB.findUnit(state, uid);
    return u ? SB.names.card(u.cardId) : '?';
  }

  function leaderLabel(state, a) {
    if (a.type === 'deployLeader') return SB.names.ui.deploy;
    if (a.type === 'deployLeaderPilot') return SB.names.ui.deploy + ' → ' + unitName(state, a.attachTo);
    return SB.names.ui.leaderAbility;
  }

  function renderLeaderPopover(state, acts, humanSeat, acting, doAction) {
    const node = $('leader-popover');
    if (!node) return;
    if (leaderSeat == null || SB.isTerminal(state)) {
      node.classList.remove('open');
      node.textContent = '';
      return;
    }
    const seat = leaderSeat;
    const mine = seat === humanSeat;
    const L = state.players[seat].leader;
    node.textContent = '';

    const box = el('div', 'leader-pop-box');
    box.appendChild(el('div', 'leader-pop-title',
      mine ? SB.names.card(L.cardId) : SB.names.ui.theirLeader));
    // The same renderer as everywhere else, at preview width: a decision about a card
    // is made while looking at the card (CARD-PRESENTATION-SPEC §1).
    const face = SB.renderCard({ cardId: L.cardId }, { size: 'preview', state: state });
    box.appendChild(face);

    const btns = el('div', 'leader-pop-buttons');
    const mineToAct = mine && acting === humanSeat;
    const available = mineToAct ? leaderActions(acts, seat) : [];
    available.forEach(function (a) {
      const b = el('button', 'action-btn', leaderLabel(state, a));
      b.onclick = function () { close(); doAction(a); };
      btns.appendChild(b);
    });
    if (mine && !available.length) {
      btns.appendChild(el('div', 'leader-pop-empty', SB.names.ui.leaderNoActions));
    }
    box.appendChild(btns);

    const cl = el('button', 'peek-btn', SB.names.ui.leaderClose);
    cl.onclick = close;
    box.appendChild(cl);
    node.appendChild(box);
    node.classList.add('open');
  }

  function close() {
    leaderSeat = null;
    const node = $('leader-popover');
    if (node) { node.classList.remove('open'); node.textContent = ''; }
  }

  // ---- public --------------------------------------------------------------

  SB.hud = {
    init: function () {
      $('log-handle').textContent = SB.names.ui.logOpen;
      $('log-handle').onclick = function () { setDrawer(!drawerOpen); };
      $('side-title').textContent = SB.names.ui.logDrawer;
      $('side-close').onclick = function () { setDrawer(false); };
      $('undo-btn').textContent = SB.names.ui.undo;
      $('undo-btn').onclick = function () { SB.ui.undo(); };
      $('new-game-btn').textContent = SB.names.ui.newGame;
      $('new-game-btn').onclick = function () { setDrawer(false); SB.title.openPicker(); };
      $('help-btn').textContent = SB.names.ui.helpBtn;
      $('help-btn').onclick = function () { SB.help.open(); };
      $('mute-btn').onclick = function () { SB.sound.toggleMute(); syncMute(); };
      syncMute();
      setDrawer(false);
      // Esc closes whichever piece of chrome is in the way. The choice modal owns Esc
      // for its own peek (js/targeting.js), so it is checked first and left alone.
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        const modal = $('choice-modal');
        if (modal && modal.classList.contains('open')) return;
        if (leaderSeat != null) { close(); SB.ui.render(); return; }
        if (drawerOpen) setDrawer(false);
      });
      const banner = $('turn-banner');
      if (banner) banner.onclick = function () { banner.classList.remove('show'); };
    },

    // A new match must be allowed to announce its first turn again.
    reset: function () { bannerKey = null; close(); },

    isDrawerOpen: function () { return drawerOpen; },
    setDrawer: setDrawer,
    syncMute: syncMute,

    // Clicking a leader slot. Your own opens its actions; theirs is a read-only look.
    openLeader: function (seat) { leaderSeat = seat; },
    closeLeader: close,
    leaderOpen: function () { return leaderSeat; },

    // Called at the end of every UI.render, after the board has been rebuilt.
    render: function (state, acts, humanSeat, acting, doAction) {
      markInitiative(state, humanSeat);
      maybeBanner(state, humanSeat, acting);
      renderLeaderPopover(state, acts, humanSeat, acting, doAction);
      syncMute();
    },
  };
})(window.SB = window.SB || {});
