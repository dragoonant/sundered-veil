// test-text.js — the day-one text-quality guard (CARD-GAME-LESSONS §2): render every
// card's generated text and fail on structural rot. Runs over ALL registered cards,
// so real sets are covered automatically as they load.
(function (SB) {
  'use strict';
  const T = SB.test;

  T.add('text: every card renders clean rules text', function () {
    const problems = [];
    Object.keys(SB.cards).forEach(function (id) {
      let lines;
      try {
        lines = SB.cardText(id);
      } catch (e) {
        problems.push(id + ': threw ' + e.message);
        return;
      }
      lines.forEach(function (line) {
        if (!line || !line.trim()) problems.push(id + ': empty line');
        if (/\s\s/.test(line)) problems.push(id + ': doubled space in "' + line + '"');
        if (/^[a-z]/.test(line)) problems.push(id + ': lowercase start "' + line + '"');
        if (/\bundefined\b|\bnull\b|\bNaN\b/.test(line)) problems.push(id + ': hole in "' + line + '"');
        if (/ \./.test(line) || /\.\./.test(line)) problems.push(id + ': broken punctuation "' + line + '"');
      });
    });
    if (problems.length) throw new Error(problems.length + ' text problems:\n  ' + problems.join('\n  '));
  });

  T.add('text: keyword sentences match engine behavior samples', function () {
    // Spot checks that describers say what the engine does.
    const raider = SB.cardText('fx-raider').join(' ');
    T.ok(/Raid 2/.test(raider), 'raid shows its number');
    const bolt = SB.cardText('fx-bolt').join(' ');
    T.ok(/deal 3 damage/i.test(bolt), 'bolt says 3 damage');
    const leaderA = SB.cardText('fx-leaderA').join(' ');
    T.ok(/Epic Action/.test(leaderA), 'leader has epic action line');
    T.ok(/5 or more resources/.test(leaderA), 'deploy threshold stated');
  });

  T.add('names: no two distinct cards collide on name+subtitle (art/slug gate)', function () {
    const seen = {};
    const dupes = [];
    Object.keys(SB.cards).forEach(function (id) {
      if (id.indexOf('fx-') === 0) return;
      const n = SB.names.cards[id];
      if (!n) return;
      const slug = (n.name + '|' + (n.subtitle || '')).toLowerCase();
      if (seen[slug]) dupes.push(slug + ' (' + seen[slug] + ' vs ' + id + ')');
      else seen[slug] = id;
    });
    if (dupes.length) throw new Error('name collisions: ' + dupes.join(', '));
  });

  T.add('names: every card and deck has a display name', function () {
    const missing = [];
    Object.keys(SB.cards).forEach(function (id) {
      if (!SB.names.cards[id]) missing.push('card ' + id);
    });
    Object.keys(SB.decks).forEach(function (id) {
      if (!SB.names.decks[id]) missing.push('deck ' + id);
    });
    if (missing.length) throw new Error('missing names: ' + missing.join(', '));
  });

  // The card face is a PROMISE about the rules. A keyword badge that the engine would
  // not honour is worse than no badge at all: the player reads an enemy attack that
  // legally ignores their "Sentinel" as a broken game. The glossary is free to reach
  // into effect data to explain a keyword a card can GRANT — the badge line is not.
  T.add('presentation: the keyword badge never claims what the engine denies', function () {
    let s = T.game('fixtureA', 'fixtureB', 'kw-face');
    const me = s.active;
    const units = Object.keys(SB.cards).filter(function (id) {
      return SB.cards[id].type === 'unit' && !/^fx-/.test(id) && !/^tok-/.test(id);
    });
    T.ok(units.length > 100, 'checking the real unit cards: ' + units.length);
    const liars = [];
    // Each unit is checked alone and then taken off again: keyword lookups walk the
    // board for auras, so leaving every unit in play made this quadratic in the card
    // pool (minutes once the pool passed a thousand units).
    units.forEach(function (id) {
      const ref = T.putOnBoard(s, me, id);
      const u = SB.findUnit(s, ref.uid);
      if (!u) return;
      SB.cardFaceKeywords(id, u, s).forEach(function (kw) {
        if (!SB.hasKeyword(s, u, kw.k)) liars.push(id + ' shows ' + kw.k);
      });
      const arena = s[SB.card(id).arena];
      arena.splice(arena.indexOf(ref), 1);
    });
    if (liars.length) {
      throw new Error(liars.length + ' card(s) advertise a keyword they do not have: ' +
        liars.slice(0, 5).join(', '));
    }
  });

  T.add('presentation: a granted keyword appears on the face once it is granted', function () {
    let s = T.game('fixtureA', 'fixtureB', 'kw-grant');
    const me = s.active;
    // sec-120 GRANTS sentinel from an ability; it has none of its own.
    const ref = T.putOnBoard(s, me, 'sec-120');
    const u = SB.findUnit(s, ref.uid);
    const shown = function () {
      return SB.cardFaceKeywords('sec-120', u, s).map(function (k) { return k.k; });
    };
    T.eq(shown().join(','), '', 'no badge before the grant');
    u.tempKeywords = ['sentinel'];
    T.eq(shown().join(','), 'sentinel', 'badge appears once granted');
    T.ok(SB.hasKeyword(s, u, 'sentinel'), 'and the engine agrees');
    // The glossary still explains a keyword the card can hand out, badge or not.
    T.ok(SB.cardGlossary('sec-120', null, null).some(function (g) { return /Sentinel/i.test(g.name); }),
      'glossary still explains Sentinel');
  });

  T.add('presentation: a printed keyword shows in hand and on board', function () {
    let s = T.game('fixtureA', 'fixtureB', 'kw-printed');
    const me = s.active;
    T.eq(SB.cardFaceKeywords('fx-wall', null, null).map(function (k) { return k.k; }).join(','),
      'sentinel', 'printed keyword shows with no unit (in hand)');
    const ref = T.putOnBoard(s, me, 'fx-wall');
    T.ok(SB.cardFaceKeywords('fx-wall', SB.findUnit(s, ref.uid), s)
      .some(function (k) { return k.k === 'sentinel'; }), 'and on the board');
  });
  // Every trait id the card data uses must have a real display name. tr ids are
  // append-only and assigned by the import tools, while the names are hand-authored in
  // data/names-4.js — so a new set silently ships cards whose traits render as the
  // placeholder "TR50" unless something fails first. This is that something.
  T.add('text: every trait id in the card data has a display name', function () {
    const used = new Set();
    Object.keys(SB.cards).forEach(function (id) {
      (SB.card(id).traits || []).forEach(function (t) { used.add(t); });
    });
    T.ok(used.size > 40, 'found the trait ids (' + used.size + ')');
    const missing = [];
    used.forEach(function (t) {
      const name = SB.names.traits[t];
      // The placeholder file fills every id with its own uppercased id, which reads as a
      // name to any code that only checks for undefined.
      if (!name || name === t.toUpperCase()) missing.push(t);
    });
    T.eq(missing.sort().join(',') || 'none', 'none', 'traits with no display name');
  });

  // ---- the source-name pack (names.js registerSource) -----------------------------
  // data/names-source.js carries the published game's names; it is loaded by index.html
  // only. If it ever reaches tests.html, every text test below silently starts checking
  // stored printed text instead of the generated describers — the exact regression the
  // split exists to prevent. So the suite asserts the pack is absent when it starts.
  T.add('names: no source pack is loaded in the test suite', function () {
    T.eq(SB.names.hasSource(), false, 'tests.html must not load data/names-source.js');
    T.eq(SB.sourceText == null, true, 'SB.sourceText must be unset under test');
  });

  T.add('names: the source pack swaps names and text and restores them on the way out', function () {
    SB.names.register('cards', 'zz-901', { name: 'Veil Name', subtitle: null });
    SB.names.register('traits', 'tr-zz', 'Veil Trait');
    SB.names.register('decks', 'deck-zz', 'Veil Deck');
    try {
      SB.names.registerSource({
        cards: { 'zz-901': { name: 'Printed Name' }, 'zz-902': { name: 'Only Printed' } },
        traits: { 'tr-zz': 'Printed Trait' }, decks: { 'deck-zz': 'Printed Deck' },
        text: { 'zz-901': ['Printed line.'] },
      });
      T.eq(SB.names.hasSource(), true, 'pack registered');
      T.eq(SB.names.mode(), 'source', 'source is the default mode');
      T.eq(SB.names.card('zz-901'), 'Printed Name', 'card name from the pack');
      T.eq(SB.names.card('zz-902'), 'Only Printed', 'an id with no original still resolves');
      T.eq(SB.names.traits['tr-zz'], 'Printed Trait', 'trait name from the pack');
      T.eq(SB.names.decks['deck-zz'], 'Printed Deck', 'deck name from the pack');
      T.eq(SB.sourceText['zz-901'][0], 'Printed line.', 'printed text exposed for SB.cardText');

      SB.names.setMode('original');
      T.eq(SB.names.card('zz-901'), 'Veil Name', 'original name back under mode original');
      T.eq(SB.names.card('zz-902'), '[zz-902]', 'an id with no original falls back to the id');
      T.eq(SB.names.traits['tr-zz'], 'Veil Trait', 'original trait back');
      T.eq(SB.sourceText, null, 'printed text off under mode original');

      SB.names.toggleMode();
      T.eq(SB.names.mode(), 'source', 'toggle flips back');
      T.eq(SB.names.card('zz-901'), 'Printed Name', 'and the pack applies again');
    } finally {
      SB.names.clearSource();
      SB.names.setMode('source');           // leave the default for the next test
    }
    T.eq(SB.names.hasSource(), false, 'pack cleared');
    T.eq(SB.names.card('zz-901'), 'Veil Name', 'clearing restores the original');
    T.eq(SB.names.cards['zz-902'], undefined, 'clearing removes pack-only ids');
    T.eq(SB.sourceText, null, 'clearing unsets the printed text');
    delete SB.names.cards['zz-901']; delete SB.names.traits['tr-zz']; delete SB.names.decks['deck-zz'];
  });

})(window.SB = window.SB || {});
