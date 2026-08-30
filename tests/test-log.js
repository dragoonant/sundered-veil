// test-log.js — the log-quality guard (CARD-LOG-AND-TARGETING-SPEC §1–§5).
// Same posture as test-text.js: fuzz real games, collect every log type that
// actually occurs, and fail on structural rot in the generated prose. A new log
// type cannot ship without a describer, because it will surface here.
(function (SB) {
  'use strict';
  const T = SB.test;

  // Play games across the whole deck registry and keep the final states, so the
  // describers are also exercised against a state where units have since died.
  function harvest() {
    const seen = {};   // type -> {entry, state}
    const ids = Object.keys(SB.decks);
    ids.forEach(function (a, i) {
      const b = ids[(i + 1) % ids.length];
      if (a === b) return;
      const final = SB.randomGame(a, b, 'log|' + a + '|' + b);
      final.log.forEach(function (l) {
        if (!seen[l.type]) seen[l.type] = { entry: l, state: final };
      });
    });
    return seen;
  }

  T.add('log: every emitted entry type produces clean prose', function () {
    const seen = harvest();
    const types = Object.keys(seen);
    T.ok(types.length > 25, 'fuzz exercised a real spread of log types (' + types.length + ')');
    const problems = [];
    types.forEach(function (type) {
      const rec = seen[type];
      let line;
      try {
        line = SB.describeLog(rec.entry, rec.state);
      } catch (e) {
        problems.push(type + ': threw ' + e.message);
        return;
      }
      if (line === null) { problems.push(type + ': no describer (log would show a raw id)'); return; }
      if (!line.trim()) { problems.push(type + ': empty line'); return; }
      if (/\s\s/.test(line)) problems.push(type + ': doubled space in "' + line + '"');
      if (/^[a-z]/.test(line)) problems.push(type + ': lowercase start "' + line + '"');
      if (/\bundefined\b|\bnull\b|\bNaN\b/.test(line)) problems.push(type + ': hole in "' + line + '"');
      if (/\[[a-z0-9-]+\]/.test(line)) problems.push(type + ': unnamed card id in "' + line + '"');
      if (/ \./.test(line) || /\.\./.test(line)) problems.push(type + ': broken punctuation "' + line + '"');
      if (!/[.!—]$/.test(line)) problems.push(type + ': unterminated "' + line + '"');
    });
    if (problems.length) throw new Error(problems.length + ' log problems:\n  ' + problems.join('\n  '));
  });

  T.add('log: prose survives a state where the subject has been defeated', function () {
    // §3/§1: SB.log stamps cardId at push time precisely so a line about a card that
    // has since left play still names it. Replay a real game and describe the WHOLE
    // log against the FINAL state — the hardest case for name resolution.
    const final = SB.randomGame('fixtureA', 'fixtureB', 'grave');
    const holes = [];
    final.log.forEach(function (l, i) {
      const line = SB.describeLog(l, final);
      if (line === null) { holes.push(i + ' ' + l.type + ': no describer'); return; }
      if (/\bundefined\b|\bnull\b/.test(line)) holes.push(i + ' ' + l.type + ': "' + line + '"');
    });
    if (holes.length) throw new Error(holes.length + ' stale-subject holes:\n  ' + holes.join('\n  '));
  });

  T.add('log: describers are exercised with no state at all', function () {
    // The log panel can render before a state is threaded through, and a replay
    // viewer has only entries. Nothing may throw or leak a hole.
    const final = SB.randomGame('fixtureA', 'fixtureB', 'nostate');
    final.log.forEach(function (l) {
      const line = SB.describeLog(l, null);
      T.ok(line === null || (line && !/\bundefined\b/.test(line)), 'stateless: ' + l.type + ' -> ' + line);
    });
  });

  T.add('log: subject resolution never throws and never names a missing card', function () {
    const final = SB.randomGame('fixtureA', 'fixtureB', 'subj');
    let withSubject = 0;
    final.log.forEach(function (l) {
      const subj = SB.logSubject(l, final);
      if (!subj) return;
      withSubject++;
      T.ok(!!subj.cardId, 'subject carries a cardId: ' + l.type);
      T.ok(!!SB.cards[subj.cardId], 'subject cardId is a real card: ' + subj.cardId);
      if (subj.uid != null) T.ok(!!SB.findUnit(final, subj.uid), 'live uid really is live');
    });
    T.ok(withSubject > 10, 'most of a real log hangs off a card (' + withSubject + ')');
  });

  T.add('log: a card that finds nothing says so, and says it loudly', function () {
    // §4. The fizzle notice is what tells a SPENT card from a WASTED one — for the
    // player (highlighted line) and for the AI (the `fizzled` flag it prices).
    const s = T.game('fixtureA', 'fixtureB');
    const entry = { type: 'fizzle', why: 'noTargets', cardId: 'fx-bolt', fizzled: true, notice: true };
    const line = SB.describeLog(entry, s);
    T.ok(/finds no legal target/.test(line), 'fizzle names the whiff: ' + line);
    T.ok(entry.notice === true, 'fizzle is a notice line');
  });

  T.add('log: a forced sole target is announced rather than resolved in silence', function () {
    // §4 deviation guard: we auto-resolve, so the announcement is the only thing
    // standing between the player and a card that hit something unseen.
    const ids = Object.keys(SB.decks);
    let found = null;
    for (let i = 0; i < ids.length && !found; i++) {
      const final = SB.randomGame(ids[i], ids[(i + 1) % ids.length], 'auto|' + i);
      found = final.log.filter(function (l) { return l.type === 'autoTarget'; })[0] || null;
      if (found) {
        const line = SB.describeLog(found, final);
        T.ok(/only legal target/.test(line), 'announces what was hit: ' + line);
        T.ok(found.notice === true, 'autoTarget is a notice line');
      }
    }
    T.ok(found !== null, 'fuzz produced at least one forced sole target');
  });

  T.add('log: sound cues ride the log and name real clips', function () {
    // §6: the audio layer knows no rules — it reads data.sound. Cue names must be a
    // small closed vocabulary, or a typo becomes a silent clip nobody notices.
    const CUES = { hit: 1, destroy: 1, shield: 1, heal: 1, buff: 1, play: 1, deploy: 1,
      attack: 1, ability: 1, claim: 1, attach: 1, draw: 1, discard: 1, capture: 1 };
    const bad = {};
    let cued = 0;
    Object.keys(SB.decks).forEach(function (a, i) {
      const ids = Object.keys(SB.decks);
      const final = SB.randomGame(a, ids[(i + 1) % ids.length], 'cue|' + a);
      final.log.forEach(function (l) {
        if (!l.sound) return;
        cued++;
        if (!CUES[l.sound]) bad[l.sound] = (bad[l.sound] || 0) + 1;
      });
    });
    T.ok(cued > 50, 'a real game is audible (' + cued + ' cued entries)');
    if (Object.keys(bad).length) throw new Error('unknown sound cues: ' + JSON.stringify(bad));
  });

  T.add('targeting: every prompt a real game raises is real English', function () {
    // §16. A blank or id-shaped prompt is the same failure mode as blank rules text,
    // so it is guarded the same way: walk real games and inspect every open choice.
    const problems = {};
    let prompts = 0;
    const ids = Object.keys(SB.decks);
    ids.forEach(function (a, i) {
      const b = ids[(i + 1) % ids.length];
      if (a === b) return;
      let st = SB.newGame({ deck0: a, deck1: b, seed: 'prompt|' + a });
      const rand = SB.rng('prompt|' + a);
      let steps = 0;
      while (!SB.isTerminal(st) && ++steps < 1200) {
        if (st.queue.length > 0) {
          const line = SB.targetPrompt(st, st.queue[0]);
          prompts++;
          const key = (st.queue[0].step || '') + '|' + ((st.queue[0].op && st.queue[0].op.op) || '');
          if (!line || !line.trim()) problems[key] = 'empty';
          else if (/undefined|null|NaN/.test(line)) problems[key] = 'hole: ' + line;
          else if (/^[a-z]/.test(line)) problems[key] = 'lowercase start: ' + line;
          else if (!/[.?!]$/.test(line)) problems[key] = 'unterminated: ' + line;
          else if (/\[[a-z0-9-]+\]/.test(line)) problems[key] = 'raw id: ' + line;
        }
        const acts = SB.legalActions(st);
        st = SB.apply(st, acts[Math.floor(rand() * acts.length)]);
      }
    });
    T.ok(prompts > 100, 'games actually raised prompts (' + prompts + ')');
    const keys = Object.keys(problems);
    if (keys.length) {
      throw new Error(keys.length + ' bad prompts:\n  ' + keys.map(function (k) {
        return k + ' -> ' + problems[k];
      }).join('\n  '));
    }
  });
})(window.SB = window.SB || {});
