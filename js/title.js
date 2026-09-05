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
  function deckLabel(d) {
    const fmt = SB.decks[d].format
      ? ' (' + (SB.names.ui.format[SB.decks[d].format] || SB.decks[d].format) + ')' : '';
    return (SB.names.decks[d] || d) + fmt;
  }
  // Random draws from the tournament lists only. The starters and two-player sets are
  // teaching decks — worth picking deliberately, never worth being handed by accident
  // when the point of the exercise is testing a real list.
  function randomDeck(notThis) {
    const pool = playableDecks().filter(function (d) {
      return d !== notThis && SB.decks[d].group === 'competitive';
    });
    if (!pool.length) return playableDecks()[0];   // a build with no lists still starts
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Hovering a deck for a beat shows the two cards its name does not: its leader and its
  // base. Those decide how a list opens and what it is trying to survive to, and picking
  // between twenty names without them is picking blind.
  const PEEK_MS = 600;
  function clearPeek() {
    const old = document.querySelector('.deck-peek');
    if (old) old.remove();
  }
  function attachDeckPeek(btn, deck) {
    const deckOf = typeof deck === 'function' ? deck : function () { return deck; };
    let timer = null;
    function show() {
      clearPeek();
      const deckId = deckOf();
      const dk = SB.decks[deckId];
      if (!dk) return;
      const panel = el('div', 'deck-peek');
      // The same enlargement the board uses, so a leader's abilities and every keyword
      // on it are readable here — which is the difference between choosing a deck and
      // choosing a name.
      [dk.leader, dk.base].forEach(function (id) {
        if (id) panel.appendChild(SB.preview.face(id, null, null));
      });
      document.body.appendChild(panel);
      // Two full previews stacked are taller than a short window: scale to fit rather
      // than clip, since a peek nobody can scroll must show everything or nothing.
      const r = btn.getBoundingClientRect();
      const w = panel.offsetWidth, h = panel.offsetHeight;
      const k = Math.min(1, (window.innerHeight - 16) / h, (window.innerWidth - 16) / w);
      if (k < 1) { panel.style.transform = 'scale(' + k + ')'; panel.style.transformOrigin = '0 0'; }
      const sw = w * k, sh = h * k;
      let left = r.right + 12;
      if (left + sw > window.innerWidth - 8) left = r.left - sw - 12;
      panel.style.left = Math.max(8, left) + 'px';
      panel.style.top = Math.max(8, Math.min(r.top + r.height / 2 - sh / 2,
        window.innerHeight - sh - 8)) + 'px';
    }
    function arm() { clearTimeout(timer); timer = setTimeout(show, PEEK_MS); }
    function disarm() { clearTimeout(timer); clearPeek(); }
    btn.addEventListener('mouseenter', arm);
    btn.addEventListener('mouseleave', disarm);
    btn.addEventListener('focus', arm);          // keyboard parity, as everywhere else
    btn.addEventListener('blur', disarm);
    btn.addEventListener('click', disarm);
  }

  // Both sides are chosen here. This is a testbed for the mechanics and the lists, not
  // a campaign: the interesting question is "how does THIS deck play against THAT one",
  // which a fixed opponent cannot answer. Opening on two random decks means the button
  // that starts a match is always live — nobody has to choose anything to see a game.
  const chosen = { mine: null, theirs: null };

  // ---- the screens ---------------------------------------------------------

  function splash() {
    const wrap = el('div', 'title-splash');
    wrap.appendChild(el('h1', 'title-name', SB.names.ui.gameTitle));
    wrap.appendChild(el('div', 'title-tagline', SB.names.ui.gameTagline));
    wrap.appendChild(el('div', 'title-hint', SB.names.ui.titleHint));
    return wrap;
  }

  // A slot's button: the deck it currently holds, and a whole screen behind it.
  function deckSlot(side, labelText) {
    const row = el('div', 'title-field');
    row.appendChild(el('span', 'title-field-label', labelText));
    const btn = el('button', 'title-deck-btn');
    btn.id = 'deck-btn-' + side;
    function paint() { btn.textContent = deckLabel(chosen[side]); }
    paint();
    // Attached once; it reads the slot's CURRENT deck each time it opens.
    attachDeckPeek(btn, function () { return chosen[side]; });
    btn.onclick = function () {
      openChooser(side, function (picked) { chosen[side] = picked; paint(); });
    };
    row.appendChild(btn);
    return row;
  }

  // The chooser: every deck as its own large button, grouped, over the same title art.
  // It replaces the picker rather than floating above it, so nothing is half-covered.
  function openChooser(side, done) {
    const screen = $('title-screen');
    const box = el('div', 'title-picker deck-chooser');
    box.appendChild(el('h1', 'title-name title-name-small', SB.names.ui.pickDeckFor[side]));

    const groups = [['precon', []], ['competitive', []]];
    playableDecks().forEach(function (d) {
      groups[SB.decks[d].group === 'competitive' ? 1 : 0][1].push(d);
    });
    function close(picked) {
      clearPeek();                                // it lives on <body>, not on the screen
      if (picked) done(picked);
      screen.textContent = '';
      screen.appendChild(picker());
    }
    groups.forEach(function (pair) {
      if (!pair[1].length) return;
      box.appendChild(el('div', 'deck-group-label', SB.names.ui.deckGroups[pair[0]]));
      const grid = el('div', 'deck-grid');
      pair[1].forEach(function (d) {
        const b = el('button', 'deck-choice' + (d === chosen[side] ? ' is-chosen' : ''));
        b.appendChild(el('span', 'deck-choice-name', SB.names.decks[d] || d));
        const meta = [];
        if (SB.decks[d].format) meta.push(SB.names.ui.format[SB.decks[d].format] || SB.decks[d].format);
        meta.push(SB.decks[d].cards.length + ' ' + SB.names.ui.deckCount);
        b.appendChild(el('span', 'deck-choice-meta', meta.join(' · ')));
        b.onclick = function () { close(d); };
        attachDeckPeek(b, d);
        grid.appendChild(b);
      });
      box.appendChild(grid);
    });

    const row = el('div', 'deck-chooser-actions');
    const rnd = el('button', 'title-select-btn', SB.names.ui.randomDeck);
    rnd.onclick = function () { close(randomDeck(null)); };
    const back = el('button', 'title-select-btn', SB.names.ui.deckChooserBack);
    back.onclick = function () { close(null); };
    row.appendChild(rnd); row.appendChild(back);
    box.appendChild(row);

    screen.textContent = '';
    screen.appendChild(box);
  }

  function picker() {
    if (!chosen.mine) chosen.mine = randomDeck(null);
    if (!chosen.theirs) chosen.theirs = randomDeck(chosen.mine);
    const box = el('div', 'title-picker');
    box.appendChild(el('h1', 'title-name title-name-small', SB.names.ui.gameTitle));
    box.appendChild(deckSlot('mine', SB.names.ui.chooseDeck));
    box.appendChild(deckSlot('theirs', SB.names.ui.chooseOppDeck));

    const diffRow = el('label', 'title-field');
    diffRow.appendChild(el('span', 'title-field-label', SB.names.ui.chooseDifficulty));
    const diff = el('select', 'title-select');
    diff.id = 'difficulty-select';
    ['easy', 'mid', 'hard', 'competition'].forEach(function (k) {
      const o = document.createElement('option');
      o.value = k; o.textContent = SB.names.ui.difficulty[k];
      // Competition is the default: it is the only difficulty measured to play every
      // list competently (docs/ai.md), which is what a deck test needs from an opponent.
      if (k === 'competition') o.selected = true;
      diff.appendChild(o);
    });
    diffRow.appendChild(diff);
    box.appendChild(diffRow);

    const start = el('button', 'title-start', SB.names.ui.startGame);
    start.onclick = function () { newGame(chosen.mine, chosen.theirs, diff.value); };
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

  function newGame(deckId, aiDeck, difficulty) {
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
