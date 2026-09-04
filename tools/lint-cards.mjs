// lint-cards.mjs — static audit of card data against the engine's real vocabulary.
// validate.js checks op names; this checks everything else a rename could silently
// break: condition names, target-selector keys and values, amountRef names, saved-target
// references, attachFilter keys, keyword grants. Prints one line per finding, nothing
// when clean. Usage: node tools/lint-cards.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'tests.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]).filter(s => !s.startsWith('tests/'));
const window = {}; window.window = window;
const ctx = vm.createContext({ window, console, SB: undefined });
const src = {};
for (const s of srcs) { src[s] = readFileSync(join(root, s), 'utf8'); vm.runInContext(src[s], ctx, { filename: s }); }
const SB = window.SB;
const eng = src['js/effects.js'] + src['js/engine.js'] + src['js/ops.js'] + src['js/ops2.js'] + src['js/rules.js'];
const set = (re, s) => new Set([...s.matchAll(re)].map(m => m[1]));
const conds = set(/case '(\w+)'/g, src['js/effects.js'].slice(src['js/effects.js'].indexOf('SB.checkCondition = function')));
for (const k of Object.keys(SB.extraConditions || {})) conds.add(k); conds.add('saved'); for (const k of set(/ci === '(\w+)'/g, src['js/engine.js'])) conds.add(k);
const amounts = set(/amountRef === '(\w+)'/g, eng); for (const k of set(/ref === '(\w+)'/g, eng)) amounts.add(k);
const selKeys = new Set([...set(/\bsel\.(\w+)/g, eng), ...set(/\b(?:f|filter|scope)\.(\w+)/g, eng), ...set(/itemStep\.filter\.(\w+)/g, eng), 'optional', 'who', 'what']);
const whats = set(/sel\.what === '(\w+)'/g, eng); for (const k of set(/what: '(\w+)'/g, eng)) whats.add(k);
const whos = new Set(['any', 'friendly', 'enemy', ...set(/sel\.who === '(\w+)'/g, eng)]);
const attachKeys = set(/\bf\.(\w+)/g, src['js/ops2.js'].slice(src['js/ops2.js'].indexOf('SB.attachAllowed = function'), src['js/ops2.js'].indexOf('SB.attachAllowed = function') + 800));
const condKeys = set(/\bcond\.(\w+)/g, eng);
const kws = new Set(Object.keys(SB.names.keywords));
const out = [];
const rep = (id, m) => out.push(id + ': ' + m);
function checkSel(id, sel, where) {
  if (!sel || typeof sel !== 'object') return;
  for (const k of Object.keys(sel)) if (!selKeys.has(k)) rep(id, where + ' unknown selector key "' + k + '"');
  if (sel.what && !whats.has(sel.what)) rep(id, where + ' unknown what "' + sel.what + '"');
  if (sel.who && !whos.has(sel.who)) rep(id, where + ' unknown who "' + sel.who + '"');
  if (sel.trait && !SB.names.traits[sel.trait]) rep(id, where + ' unknown trait ' + sel.trait);
}
function checkCond(id, c, where) {
  if (!c) return;
  if (!conds.has(c.if)) rep(id, where + ' unknown condition "' + c.if + '"');
  for (const k of Object.keys(c)) if (!condKeys.has(k) && k !== 'if') rep(id, where + ' condition field "' + k + '" never read by engine');
  if (c.target) checkSel(id, c.target, where + ' cond');
}
function checkOps(id, ops, saved, where) {
  ops.forEach((op, i) => {
    const w = where + '/' + op.op + '#' + i;
    if (op.target) checkSel(id, op.target, w);
    if (op.scope) checkSel(id, op.scope, w);
    if (op.filter) checkSel(id, op.filter, w);
    if (op.amountRef != null && !amounts.has(op.amountRef) && !/^(stored|powerOf|remHpOf):/.test(op.amountRef)) rep(id, w + ' unknown amountRef "' + op.amountRef + '"');
    if (op.useTarget && !saved.has(op.useTarget) && !/^@/.test(op.useTarget)) rep(id, w + ' useTarget "' + op.useTarget + '" never saved');
    const ns = op.target && op.target.notSavedAs;
    if (ns) (Array.isArray(ns) ? ns : [ns]).forEach(n => { if (!saved.has(n)) rep(id, w + ' notSavedAs "' + n + '" never saved'); });
    if (op.condition) checkCond(id, op.condition, w);
    if (op.k && !kws.has(op.k)) rep(id, w + ' unknown keyword ' + op.k);
    ['saveTargetAs','saveAs','savePlayedAs','saveBearerAs'].forEach(k => { if (op[k]) saved.add(op[k]); });
    if (op.then) checkOps(id, op.then, saved, w + '.then');
    if (op.else) checkOps(id, op.else, saved, w + '.else');
  });
}
function checkSide(id, def, where) {
  (def.abilities || []).forEach((ab, i) => {
    const w = where + ab.trigger + '#' + i;
    if (ab.condition) checkCond(id, ab.condition, w);
    if (ab.scope) checkSel(id, ab.scope, w);
    if (ab.target) checkSel(id, ab.target, w);
    if (ab.grant) { (ab.grant.keywords || []).forEach(k => { if (!kws.has(k.k)) rep(id, w + ' grant unknown kw ' + k.k); }); if (ab.grant.condition) checkCond(id, ab.grant.condition, w); }
    if (ab.effects) checkOps(id, ab.effects, new Set(), w);
  });
  (def.keywords || []).forEach(k => { if (!kws.has(k.k)) rep(id, where + ' unknown keyword ' + k.k); });
  (def.traits || []).forEach(t => { if (!SB.names.traits[t]) rep(id, where + ' unknown trait ' + t); });
  if (def.attachFilter) for (const k of Object.keys(def.attachFilter)) if (!attachKeys.has(k)) rep(id, where + ' attachFilter key "' + k + '" never read');
}
for (const id of Object.keys(SB.cards)) {
  const c = SB.cards[id];
  if (!SB.names.cards[id]) rep(id, 'no display name');
  if (c.type === 'leader') { checkSide(id, c.leaderSide, 'L:'); checkSide(id, c.deployedSide, 'D:'); (c.traits || []).forEach(t => { if (!SB.names.traits[t]) rep(id, 'unknown trait ' + t); }); }
  else checkSide(id, c, '');
}
console.log('vocab: conds ' + conds.size + ' amounts ' + amounts.size + ' selKeys ' + selKeys.size + ' whats ' + [...whats].join(',') + ' whos ' + [...whos].join(','));
console.log(out.join('\n'));
console.log(out.length + ' findings over ' + Object.keys(SB.cards).length + ' cards');
