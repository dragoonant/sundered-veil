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
//   node tools/ai-balance.mjs [--games N] [--difficulty easy|mid|hard] [--seed TAG]
//                             [--policy ai|random] [--out FILE] [--quiet] [--cap N]
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
if (POLICY !== 'ai' && POLICY !== 'random') { console.error('--policy must be ai or random'); process.exit(2); }
const QUIET = argv.includes('--quiet');

// Load the engine the way tools/run-tests.mjs does — one script list, no drift.
const html = readFileSync(join(root, 'tests.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
const win = {}; win.window = win;
const ctx = vm.createContext({ window: win, console, SB: undefined });
for (const s of srcs) vm.runInContext(readFileSync(join(root, s), 'utf8'), ctx, { filename: s });
const SB = win.SB;
SB.validateContent();

// Fixtures are test scaffolding, not playable decks; measuring them would skew the table.
const decks = Object.keys(SB.decks).filter(id => !/^fixture/.test(id)).sort();
if (decks.length < 2) { console.error('need at least 2 real decks'); process.exit(2); }

function playGame(deck0, deck1, seed) {
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
      s = SB.apply(s, SB.ai.chooseAction(s, DIFFICULTY));
    }
  }
  return { winner: s.winner, actions: n, round: s.round };
}

// ---- run the matrix -------------------------------------------------------
const stat = {};
decks.forEach(d => { stat[d] = { w: 0, l: 0, d: 0, asFirst: { w: 0, n: 0 }, asSecond: { w: 0, n: 0 } }; });
let seatFirstWins = 0, decided = 0, draws = 0, timeouts = 0, games = 0, actions = 0;
const pairings = [];
const started = process.hrtime.bigint();

for (const a of decks) {
  for (const b of decks) {
    if (a === b) continue;                       // both seats covered by the (b,a) pass
    let aw = 0, bw = 0, dr = 0;
    for (let k = 0; k < GAMES; k++) {
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
out.push('Deck-matrix balance — policy=' + POLICY + (POLICY === 'ai' ? ', difficulty=' + DIFFICULTY : '') +
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
