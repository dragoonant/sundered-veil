// ai-fingerprint.mjs — what does the AI actually DO with a deck, next to what random does?
//
// A winrate says a deck is piloted badly; it never says how. This plays the same
// pairings under both policies and counts the shape of the play: action mix, how often
// it attacks vs passes, when the leader deploys, how much of the bank goes unspent.
// A deck the AI plays WORSE THAN RANDOM has to differ somewhere in here.
//
// Usage: node tools/ai-fingerprint.mjs --deck deck-c09 [--vs deck-c20] [--games 6]
//                                      [--difficulty hard]
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i+1] && !argv[i+1].startsWith('--') ? argv[i+1] : d; };

const html = readFileSync(join(root, 'tests.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
const win = {}; win.window = win;
const ctx = vm.createContext({ window: win, console, SB: undefined });
for (const s of srcs) vm.runInContext(readFileSync(join(root, s), 'utf8'), ctx, { filename: s });
const SB = win.SB;

const DECK = flag('deck', 'deck-c09');
const GAMES = Number(flag('games', 6));
const DIFF = flag('difficulty', 'hard');
const FIELD = flag('vs', null) ? [flag('vs')] :
  Object.keys(SB.decks).filter(id => SB.decks[id].group === 'competitive' && id !== DECK).slice(0, 6);

function run(policy) {
  const tally = { games: 0, wins: 0, actions: 0, byType: {}, leaderRound: [], unspent: 0, turns: 0 };
  for (const foe of FIELD) {
    for (let k = 0; k < GAMES; k++) {
      // The measured deck always sits in seat 0 here; the field rotates.
      let s = SB.newGame({ deck0: DECK, deck1: foe, seed: 'fp|' + DECK + '|' + foe + '|' + k });
      const rand = policy === 'random' ? SB.rng('fp|' + foe + '|' + k) : null;
      let n = 0, deployed = null;
      while (!SB.isTerminal(s) && n++ < 4000) {
        const mine = SB.whoActs(s) === 0;
        const acts = SB.legalActions(s);
        const a = rand ? acts[Math.floor(rand() * acts.length)] : SB.ai.chooseAction(s, DIFF);
        if (mine) {
          tally.actions++;
          tally.byType[a.type] = (tally.byType[a.type] || 0) + 1;
          if (a.type === 'deployLeader' && deployed == null) deployed = s.round;
          if (s.phase === 'action') { tally.unspent += SB.readyResources(s, 0); tally.turns++; }
        }
        s = SB.apply(s, a);
      }
      tally.games++;
      if (s.winner === 0) tally.wins++;
      if (deployed != null) tally.leaderRound.push(deployed);
    }
  }
  return tally;
}

const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '—';
const mean = xs => xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '—';
const ai = run('ai'), rn = run('random');
const types = [...new Set([...Object.keys(ai.byType), ...Object.keys(rn.byType)])]
  .sort((x, y) => (rn.byType[y] || 0) + (ai.byType[y] || 0) - (rn.byType[x] || 0) - (ai.byType[x] || 0));

console.log('fingerprint: ' + ((SB.names.decks && SB.names.decks[DECK]) || DECK) +
  '  (' + DIFF + ' vs random, ' + ai.games + ' games each, seat 0)');
console.log('winrate      AI ' + pct(ai.wins, ai.games) + '   random ' + pct(rn.wins, rn.games));
console.log('leader deployed on round: AI ' + mean(ai.leaderRound) + ' (' + ai.leaderRound.length +
  ' games)   random ' + mean(rn.leaderRound) + ' (' + rn.leaderRound.length + ')');
console.log('mean ready resources left standing at its own action: AI ' +
  (ai.unspent / Math.max(1, ai.turns)).toFixed(2) + '   random ' + (rn.unspent / Math.max(1, rn.turns)).toFixed(2));
console.log('');
console.log('action mix (share of its own actions)      AI       random');
for (const t of types) {
  console.log('  ' + t.padEnd(38) + pct(ai.byType[t] || 0, ai.actions).padStart(7) + '  ' +
    pct(rn.byType[t] || 0, rn.actions).padStart(9));
}
