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
})(window.SB = window.SB || {});
