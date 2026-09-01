// ai-trace.mjs — replay ONE game with the AI and show where its decisions go wrong.
//
// tools/ai-balance.mjs says WHICH deck the AI misplays; this says WHERE. It replays a
// single seeded game, records every candidate action's score via the AI.trace hook in
// js/ai.js, and reports the turns that matter: the decisions with the narrowest margin,
// the ones the wasted-play penalty or the one-ply reply term flipped, and the point where
// the traced player's evaluation falls off a cliff.
//
// Usage:
//   node tools/ai-trace.mjs --deck0 ID --deck1 ID --seed TAG [--side 0|1]
//                           [--difficulty hard] [--top N] [--out FILE]
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] != null && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const DECK0 = flag('deck0', null), DECK1 = flag('deck1', null), SEED = flag('seed', null);
if (!DECK0 || !DECK1 || !SEED) { console.error('usage: --deck0 ID --deck1 ID --seed TAG [--side 0|1] [--top N] [--out FILE]'); process.exit(2); }
const SIDE = Number(flag('side', 1));
const DIFFICULTY = flag('difficulty', 'hard');
const TOP = Number(flag('top', 8));
const OUT = flag('out', null);

const html = readFileSync(join(root, 'tests.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
const win = {}; win.window = win;
const ctx = vm.createContext({ window: win, console, SB: undefined });
for (const s of srcs) vm.runInContext(readFileSync(join(root, s), 'utf8'), ctx, { filename: s });
const SB = win.SB;

const label = a => {
  const c = a.cardId ? (SB.names.card(a.cardId) || a.cardId) : null;
  return a.type + (c ? ' ' + c : '') + (a.attacker != null ? ' #' + a.attacker : '') +
    (a.target != null ? ' -> ' + JSON.stringify(a.target) : '');
};

SB.ai.trace = true;
let s = SB.newGame({ deck0: DECK0, deck1: DECK1, seed: SEED });
const steps = [];
let n = 0;
while (!SB.isTerminal(s)) {
  if (++n > 4000) break;
  const before = s;
  const act = SB.ai.chooseAction(s, DIFFICULTY);
  const sc = SB.ai.lastScores;
  // Only decisions made BY the traced side, and only real choices (one legal action is
  // not a decision — chooseAction short-circuits and records nothing).
  if (sc && sc.me === SIDE && sc.all.length > 1) {
    const ranked = sc.all.slice().sort((x, y) => y.value - x.value);
    steps.push({
      i: n, round: before.round, phase: before.phase,
      eval: SB.ai.evaluate(before, SIDE),
      chosen: label(act), chosenV: ranked[0].value,
      margin: ranked[0].value - ranked[1].value,
      wasted: ranked[0].wasted, swing: ranked[0].swing,
      // Would the pick change without each correction term? That is the term's fault.
      flippedByWasted: bestBy(sc.all, r => r.value + r.wasted) !== ranked[0],
      flippedBySwing: bestBy(sc.all, r => r.value + 0.5 * r.swing) !== ranked[0],
      alts: ranked.slice(1, 4).map(r => ({ a: label(r.action), v: r.value })),
    });
  }
  s = SB.apply(s, act);
}
function bestBy(list, f) { let b = null, bv = -Infinity; list.forEach(r => { const v = f(r); if (v > bv) { bv = v; b = r; } }); return b; }

const winner = s.winner;
const name = id => (SB.names.decks && SB.names.decks[id]) || id;
console.log('trace: ' + name(DECK0) + ' (seat 1) vs ' + name(DECK1) + ' (seat 2), seed "' + SEED + '"');
console.log('tracing side ' + SIDE + ' = ' + name(SIDE === 0 ? DECK0 : DECK1) +
  ' — winner: side ' + winner + (winner === SIDE ? ' (TRACED SIDE WON)' : ' (traced side LOST)'));
console.log(steps.length + ' real decisions over ' + n + ' actions\n');

// Where did the position collapse? Largest drop in the traced side's own evaluation.
const drops = steps.map((st, i) => ({ st, d: i ? st.eval - steps[i - 1].eval : 0 }))
  .filter(x => x.d < 0).sort((a, b) => a.d - b.d).slice(0, TOP);
console.log('=== biggest drops in the traced side\'s evaluation ===');
for (const { st, d } of drops) {
  console.log('  r' + st.round + ' #' + st.i + '  eval ' + st.eval.toFixed(0).padStart(5) + '  (' + d.toFixed(0) + ')  chose: ' + st.chosen);
  st.alts.forEach(a => console.log('        alt ' + a.v.toFixed(1).padStart(8) + '  ' + a.a));
}

const byTerm = steps.filter(st => st.flippedByWasted || st.flippedBySwing);
console.log('\n=== decisions a correction term FLIPPED (' + byTerm.length + ' of ' + steps.length + ') ===');
for (const st of byTerm.slice(0, TOP)) {
  console.log('  r' + st.round + ' #' + st.i + '  ' + (st.flippedByWasted ? 'wastedPlay' : '') +
    (st.flippedBySwing ? (st.flippedByWasted ? '+replySwing' : 'replySwing') : '') +
    '  wasted=' + st.wasted.toFixed(0) + ' swing=' + st.swing.toFixed(1) + '  chose: ' + st.chosen);
  st.alts.slice(0, 2).forEach(a => console.log('        over ' + a.v.toFixed(1).padStart(8) + '  ' + a.a));
}

const close = steps.slice().sort((a, b) => a.margin - b.margin).slice(0, TOP);
console.log('\n=== narrowest margins (coin-flips the weights decided) ===');
for (const st of close) console.log('  r' + st.round + ' #' + st.i + '  margin ' + st.margin.toFixed(2).padStart(6) + '  chose: ' + st.chosen + '   over: ' + (st.alts[0] ? st.alts[0].a : '—'));

const acts = {};
steps.forEach(st => { const k = st.chosen.split(' ')[0]; acts[k] = (acts[k] || 0) + 1; });
console.log('\naction mix chosen by the traced side: ' + JSON.stringify(acts));
if (OUT) { writeFileSync(OUT, JSON.stringify({ deck0: DECK0, deck1: DECK1, seed: SEED, side: SIDE, winner, steps }, null, 1)); console.log('wrote ' + OUT); }
