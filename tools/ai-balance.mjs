// ai-balance.mjs — AI-vs-AI winrate measurement over the full deck matrix.
//
// docs/ai.md's testing policy says to measure AI and card changes "over many full games
// (deck-matrix winrates)". The fuzz suite's matrix is NOT that: it plays uniformly at
// random, one game per pairing, and asserts nothing. This plays the real policy
// (SB.ai.chooseAction) on both sides, every deck against every other in BOTH seats, and
// reports per-deck winrates plus the seat (initiative) advantage.
//
// SB.ai.chooseAction is deterministic given a state, so repeat games of one pairing must
// differ by GAME seed — that is what varies the shuffle. Runs are fully reproducible.
//
// Usage:
//   node tools/ai-balance.mjs [--games N] [--difficulty easy|mid|hard|competition]
//                             [--seed TAG] [--policy ai|random] [--out FILE] [--quiet]
//                             [--cap N] [--group NAME] [--vs DIFFICULTY] [--decks id,id]
//
// --group NAME restricts the matrix to decks carrying that group tag (e.g. competitive),
// which is the difference between 36 decks and 20 — the matrix is quadratic, so measuring
// only what you are changing is the difference between an hour and four.
//
// --vs DIFFICULTY is the GAUNTLET: --difficulty plays --vs head to head, and every game is
// played twice with the seats swapped, so the result cannot be read as a seat advantage.
// It reports one number that matters — did the challenger beat the incumbent — plus the
// per-deck breakdown, since a difficulty that wins overall while losing with three decks
// is a difficulty that has learned an archetype, not the game.
//
// --policy random is the CONTROL. A deck's winrate under the AI confounds two causes:
// the deck being stronger, and the AI piloting that archetype better. Random play is
// blind to archetype, so a deck that is strong under both is a deck property, while one
// that is strong only under the AI is a fact about js/ai.js. Compare the ORDERINGS.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] != null && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};
const GAMES = Number(flag('games', 6));
const DIFFICULTY = flag('difficulty', 'hard');
const SEED = flag('seed', 'bal');
const OUT = flag('out', null);
const CAP = Number(flag('cap', 4000));
const POLICY = flag('policy', 'ai');
const GROUP = flag('group', null);
const VS = flag('vs', null);
const ONLY = flag('decks', null);   // id,id — a smoke-test subset, not a measurement
if (POLICY !== 'ai' && POLICY !== 'random') { console.error('--policy must be ai or random'); process.exit(2); }
const QUIET = argv.includes('--quiet');
const NEWLINE = String.fromCharCode(10);

// Load the engine the way tools/run-tests.mjs does — one script list, no drift.
const html = readFileSync(join(root, 'tests.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
const win = {}; win.window = win;
const ctx = vm.createContext({ window: win, console, SB: undefined });
for (const s of srcs) vm.runInContext(readFileSync(join(root, s), 'utf8'), ctx, { filename: s });
const SB = win.SB;
SB.validateContent();

// Fixtures are test scaffolding, not playable decks; measuring them would skew the table.
const decks = Object.keys(SB.decks)
  .filter(id => !/^fixture/.test(id))
  .filter(id => !GROUP || SB.decks[id].group === GROUP)
  .filter(id => !ONLY || ONLY.split(',').includes(id))
  .sort();
if (decks.length < 2) { console.error('need at least 2 real decks' + (GROUP ? ' in group ' + GROUP : '')); process.exit(2); }
if (VS && POLICY !== 'ai') { console.error('--vs needs --policy ai'); process.exit(2); }

// diffs, when given, is [seat0Difficulty, seat1Difficulty] — the gauntlet.
function playGame(deck0, deck1, seed, diffs) {
  let s = SB.newGame({ deck0, deck1, seed });
  // The control draws uniformly from legalActions. Its rng is seeded per game so the
  // control run is as reproducible as the AI run.
  const rand = POLICY === 'random' ? SB.rng('ctrl|' + seed) : null;
  let n = 0;
  while (!SB.isTerminal(s)) {
    if (++n > CAP) return { winner: 'timeout', actions: n, round: s.round };
    if (rand) {
      const acts = SB.legalActions(s);
      s = SB.apply(s, acts[Math.floor(rand() * acts.length)]);
    } else {
      const seat = SB.whoActs(s);
      s = SB.apply(s, SB.ai.chooseAction(s, diffs ? diffs[seat] : DIFFICULTY));
    }
  }
  return { winner: s.winner, actions: n, round: s.round };
}

// ---- run the matrix -------------------------------------------------------
const stat = {};
decks.forEach(d => { stat[d] = { w: 0, l: 0, d: 0, asFirst: { w: 0, n: 0 }, asSecond: { w: 0, n: 0 } }; });
let seatFirstWins = 0, decided = 0, draws = 0, timeouts = 0, games = 0, actions = 0;
// Gauntlet tallies: wins for the CHALLENGER (--difficulty) against --vs, overall and
// per deck piloted.
const gaunt = { win: 0, loss: 0, byDeck: {} };
decks.forEach(d => { gaunt.byDeck[d] = { w: 0, l: 0 }; });
const pairings = [];
const started = process.hrtime.bigint();

for (const a of decks) {
  for (const b of decks) {
    if (a === b) continue;                       // both seats covered by the (b,a) pass
    let aw = 0, bw = 0, dr = 0;
    for (let k = 0; k < GAMES; k++) {
      if (VS) {
        // The same deck pairing and the same shuffle, played once with the challenger
        // on each seat: seat advantage cancels instead of being averaged over.
        [[DIFFICULTY, VS], [VS, DIFFICULTY]].forEach(function (diffs, side) {
          const g = playGame(a, b, SEED + '|' + a + '|' + b + '|' + k, diffs);
          games++; actions += g.actions;
          if (g.winner === 'timeout') { timeouts++; return; }
          if (g.winner === 'draw') { draws++; return; }
          decided++;
          if (g.winner === 0) seatFirstWins++;
          const challengerSeat = side === 0 ? 0 : 1;
          const challengerWon = g.winner === challengerSeat;
          const challengerDeck = challengerSeat === 0 ? a : b;
          if (challengerWon) { gaunt.win++; gaunt.byDeck[challengerDeck].w++; }
          else { gaunt.loss++; gaunt.byDeck[challengerDeck].l++; }
        });
        continue;
      }
      const r = playGame(a, b, SEED + '|' + a + '|' + b + '|' + k);
      games++; actions += r.actions;
      if (r.winner === 'timeout') { timeouts++; continue; }
      if (r.winner === 'draw') { dr++; draws++; stat[a].d++; stat[b].d++; continue; }
      decided++;
      const first = r.winner === 0;
      if (first) seatFirstWins++;
      const wd = first ? a : b, ld = first ? b : a;
      if (first) aw++; else bw++;
      stat[wd].w++; stat[ld].l++;
      stat[a].asFirst.n++; stat[b].asSecond.n++;
      if (first) stat[a].asFirst.w++; else stat[b].asSecond.w++;
    }
    pairings.push({ a, b, aw, bw, dr });
    if (!QUIET) process.stderr.write('.');
  }
}
const secs = Number(process.hrtime.bigint() - started) / 1e9;
if (!QUIET) process.stderr.write('\n');

// ---- report ---------------------------------------------------------------
const pct = (w, n) => n ? (100 * w / n).toFixed(1).padStart(5) + '%' : '    —';
const name = id => (SB.names.decks && SB.names.decks[id]) || id;
const rows = decks.map(d => {
  const s = stat[d], n = s.w + s.l;
  return { id: d, name: name(d), games: n + s.d, wins: s.w, losses: s.l, draws: s.d,
    winrate: n ? s.w / n : null,
    first: s.asFirst.n ? s.asFirst.w / s.asFirst.n : null,
    second: s.asSecond.n ? s.asSecond.w / s.asSecond.n : null };
}).sort((x, y) => (y.winrate ?? 0) - (x.winrate ?? 0));

const out = [];
if (VS) {
  const gpct = (w, n) => n ? (100 * w / n).toFixed(1) + '%' : '—';
  const gn = gaunt.win + gaunt.loss;
  out.push('Gauntlet — ' + DIFFICULTY + ' vs ' + VS + (GROUP ? ', group=' + GROUP : '') +
    ', ' + GAMES + ' pairings x2 seats, seed="' + SEED + '"');
  out.push(decks.length + ' decks, ' + games + ' games in ' + secs.toFixed(1) + 's');
  out.push('');
  out.push(DIFFICULTY + ' beat ' + VS + ' in ' + gpct(gaunt.win, gn) + ' of ' + gn + ' decided games');
  out.push('');
  out.push('deck piloted by ' + DIFFICULTY + '        games   win%');
  out.push('-'.repeat(46));
  Object.keys(gaunt.byDeck)
    .map(d => ({ d, ...gaunt.byDeck[d] }))
    .sort((x, y) => (y.w / Math.max(1, y.w + y.l)) - (x.w / Math.max(1, x.w + x.l)))
    .forEach(r => out.push(name(r.d).slice(0, 24).padEnd(25) + String(r.w + r.l).padStart(5) + '  ' +
      gpct(r.w, r.w + r.l).padStart(6)));
  out.push('');
  out.push('draws: ' + draws + '   timeouts (>' + CAP + ' actions): ' + timeouts);
  out.push('mean actions/game: ' + (games ? Math.round(actions / games) : 0));
  console.log(out.join(NEWLINE));
  if (OUT) {
    writeFileSync(OUT, JSON.stringify({ mode: 'gauntlet', challenger: DIFFICULTY, incumbent: VS,
      group: GROUP, games: GAMES, seed: SEED, decided, draws, timeouts, secs, gauntlet: gaunt }, null, 1));
    console.log(NEWLINE + 'wrote ' + OUT);
  }
  process.exit(0);
}

out.push('Deck-matrix balance — policy=' + POLICY + (POLICY === 'ai' ? ', difficulty=' + DIFFICULTY : '') +
  (GROUP ? ', group=' + GROUP : '') +
  ', ' + GAMES + ' games/pairing, seed="' + SEED + '"');
out.push(decks.length + ' decks, ' + pairings.length + ' ordered pairings, ' + games + ' games in ' + secs.toFixed(1) + 's');
out.push('');
out.push('deck                       games   win%   as-1st  as-2nd');
out.push('-'.repeat(58));
for (const r of rows) {
  out.push(r.name.slice(0, 24).padEnd(25) + String(r.games).padStart(5) + '  ' +
    pct(r.wins, r.wins + r.losses) + '  ' + pct(Math.round((r.first ?? 0) * 1000), r.first == null ? 0 : 1000) +
    '  ' + pct(Math.round((r.second ?? 0) * 1000), r.second == null ? 0 : 1000));
}
out.push('');
out.push('seat 1 (initiative) win rate: ' + pct(seatFirstWins, decided) + '   over ' + decided + ' decided games');
out.push('draws: ' + draws + '   timeouts (>' + CAP + ' actions): ' + timeouts);
out.push('mean actions/game: ' + (games ? Math.round(actions / games) : 0));
const best = rows[0], worst = rows[rows.length - 1];
out.push('spread: ' + best.name + ' ' + pct(best.wins, best.wins + best.losses).trim() +
  '  ..  ' + worst.name + ' ' + pct(worst.wins, worst.wins + worst.losses).trim());

console.log(out.join('\n'));
if (OUT) {
  writeFileSync(OUT, JSON.stringify({ policy: POLICY, difficulty: DIFFICULTY, games: GAMES, seed: SEED,
    decided, draws, timeouts, seatFirstWins, secs, rows, pairings }, null, 1));
  console.log('\nwrote ' + OUT);
}
