// title.js — the entry point. UI-only file, loaded last (after ui.js).
//
// index.html used to start a game the moment it parsed, with the deck and difficulty
// pickers wedged into the top bar for the whole match. Both are setup questions, so
// they were taking board width to ask something already answered. They live here now.
//
// Sequence: title art holds for ~3s (or until the player clicks), a hard-edged wipe
// sweeps it away, and the deck picker arrives over the same art, dimmed. Nothing here
// touches game state — SB.ui.start is the only thing that begins a match.
(function (SB) {
  'use strict';

  const HOLD_MS = 3000;
  const WIPE_MS = 900;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  let holdTimer = null;
  let phase = 'idle';       // idle | splash | picker

  function playableDecks() {
    return Object.keys(SB.decks).filter(function (d) { return d.indexOf('fixture') < 0; });
  }

  // ---- the screens ---------------------------------------------------------

  function splash() {
    const wrap = el('div', 'title-splash');
    wrap.appendChild(el('h1', 'title-name', SB.names.ui.gameTitle));
    wrap.appendChild(el('div', 'title-tagline', SB.names.ui.gameTagline));
    wrap.appendChild(el('div', 'title-hint', SB.names.ui.titleHint));
    wrap.appendChild(el('div', 'title-disclaimer', SB.names.ui.disclaimer));
    return wrap;
  }

  function picker() {
    const box = el('div', 'title-picker');
    box.appendChild(el('h1', 'title-name title-name-small', SB.names.ui.gameTitle));

    const deckRow = el('label', 'title-field');
    deckRow.appendChild(el('span', 'title-field-label', SB.names.ui.chooseDeck));
    const deck = el('select', 'title-select');
    deck.id = 'deck-select';
    // Two groups: the prebuilt legions, then the tournament lists (data/decks.js
    // group:'competitive'), each of those labelled with its format so a player knows
    // which card pool it was built for. Labels come from names.js like everything else.
    const groups = [['precon', []], ['competitive', []]];
    playableDecks().forEach(function (d) {
      const g = SB.decks[d].group === 'competitive' ? 1 : 0;
      groups[g][1].push(d);
    });
    groups.forEach(function (pair) {
      if (!pair[1].length) return;
      const og = document.createElement('optgroup');
      og.label = SB.names.ui.deckGroups[pair[0]];
      pair[1].forEach(function (d) {
        const o = document.createElement('option');
        const fmt = SB.decks[d].format ? ' (' + (SB.names.ui.format[SB.decks[d].format] || SB.decks[d].format) + ')' : '';
        o.value = d; o.textContent = (SB.names.decks[d] || d) + fmt;
        og.appendChild(o);
      });
      deck.appendChild(og);
    });
    deckRow.appendChild(deck);
    box.appendChild(deckRow);

    const diffRow = el('label', 'title-field');
    diffRow.appendChild(el('span', 'title-field-label', SB.names.ui.chooseDifficulty));
    const diff = el('select', 'title-select');
    diff.id = 'difficulty-select';
    ['easy', 'mid', 'hard', 'competition'].forEach(function (k) {
      const o = document.createElement('option');
      o.value = k; o.textContent = SB.names.ui.difficulty[k];
      if (k === 'mid') o.selected = true;
      diff.appendChild(o);
    });
    diffRow.appendChild(diff);
    box.appendChild(diffRow);

    const start = el('button', 'title-start', SB.names.ui.startGame);
    start.onclick = function () { newGame(deck.value, diff.value); };
    box.appendChild(start);
    return box;
  }

  // The wipe: one opaque panel with a hard vertical edge, swept across the screen.
  // It carries no content — it is a curtain, not a transition of the thing behind it,
  // so the screen swap can happen while the panel covers the middle of the sweep.
  // Lives on <body>, not inside #title-screen: the screen swap it hides is done by
  // emptying #title-screen, which would take the curtain down with it.
  function wipe(then) {
    const bar = el('div', 'title-wipe');
    document.body.appendChild(bar);
    void bar.offsetWidth;
    bar.classList.add('run');
    setTimeout(then, WIPE_MS * 0.45);
    setTimeout(function () { bar.remove(); }, WIPE_MS + 60);
  }

  function toPicker() {
    if (phase !== 'splash') return;
    phase = 'picker';
    clearTimeout(holdTimer);
    const screen = $('title-screen');
    screen.classList.remove('is-splash');
    wipe(function () {
      screen.textContent = '';
      screen.appendChild(picker());
      screen.classList.add('is-picker');
    });
  }

  function newGame(deckId, difficulty) {
    // The opponent draws from the same group as the player's pick: a legion deck meets
    // a legion deck, a tournament list meets a tournament list.
    const group = SB.decks[deckId].group || 'precon';
    const others = playableDecks().filter(function (d) {
      return d !== deckId && (SB.decks[d].group || 'precon') === group;
    });
    const aiDeck = others[Math.floor(Math.random() * others.length)];
    // The first real user gesture of the page happens on this button, which is what
    // browsers wait for before letting audio start.
    SB.sound.reset();
    SB.sound.startAmbience();
    SB.boardArt.rollScenes();
    SB.hud.reset();
    const screen = $('title-screen');
    wipe(function () {
      screen.className = '';
      screen.textContent = '';
      phase = 'idle';
      SB.ui.start({ deck0: deckId, deck1: aiDeck, difficulty: difficulty });
    });
  }

  SB.title = {
    // Show the title art, hold, then wipe into the picker. Click or any key skips.
    init: function () {
      const screen = $('title-screen');
      phase = 'splash';
      screen.className = 'open is-splash';
      screen.textContent = '';
      screen.appendChild(splash());
      holdTimer = setTimeout(toPicker, HOLD_MS);
      screen.addEventListener('click', function () { toPicker(); });
      document.addEventListener('keydown', function (e) {
        if (phase === 'splash') { e.preventDefault(); toPicker(); }
      });
    },
    // "New game" in the drawer: straight back to the picker, no splash — the player
    // has seen it, and they are here to choose a deck.
    openPicker: function () {
      const screen = $('title-screen');
      phase = 'picker';
      screen.className = 'open';
      wipe(function () {
        screen.textContent = '';
        screen.appendChild(picker());
        screen.classList.add('is-picker');
      });
    },
  };
})(window.SB = window.SB || {});
