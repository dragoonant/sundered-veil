// gen-source-names.mjs — builds data/source-local.js, a LOCAL-ONLY override layer that
// swaps our original display names and generated rules text for the source material's,
// so playtesting shows which real card each internal id actually is.
//
// The output file is gitignored and loaded LAST by index.html (never by tests.html —
// the text tests must keep exercising the generated describers). When the file is
// absent, the game falls back to the committed original names: nothing in the repo,
// and nothing deployed from the repo, carries third-party expression.
//
// Usage:
//   node tools/gen-source-names.mjs <scratchDir>
// Reads, in preference order:
//   <scratchDir>/unique-cards.json   (written by tools/import-resolve.mjs — exact card set)
//   <scratchDir>/dotgg-cards.json    (raw DB dump; indexed by set + number)
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRATCH = process.argv[2];
if (!SCRATCH || SCRATCH.startsWith('--')) {
  console.error('usage: node tools/gen-source-names.mjs <scratchDir> [--fetch] [--diff]');
  process.exit(2);
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FETCH = process.argv.includes('--fetch');

// ---- --fetch: pull the card database into scratch --------------------------
// Downloads to the SCRATCH dir only — the dump carries third-party names and text and
// must never reach the repo. The endpoint rejects the default node UA, so a browser UA
// is sent; WebFetch-style clients are Cloudflare-blocked against this host.
const DB_URL = 'https://api.dotgg.gg/cgfw/getcards?game=starwars&mode=indexed';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
if (FETCH) {
  mkdirSync(SCRATCH, { recursive: true });
  console.log('fetching ' + DB_URL);
  const res = await fetch(DB_URL, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
  if (!res.ok) { console.error('fetch failed: HTTP ' + res.status + ' ' + res.statusText); process.exit(2); }
  const raw = await res.text();
  let parsed;
  try { parsed = JSON.parse(raw); } catch { console.error('fetch returned non-JSON (' + raw.length + ' bytes); first 200:\n' + raw.slice(0, 200)); process.exit(2); }
  // Indexed mode returns {names:[columns], data:[rows]}; anything else means the API
  // changed shape and the column indexing below would silently produce garbage.
  if (!Array.isArray(parsed.names) || !Array.isArray(parsed.data)) {
    console.error('unexpected payload shape: expected {names:[], data:[]}, got keys ' + Object.keys(parsed).join(', '));
    process.exit(2);
  }
  const dest = join(SCRATCH, 'dotgg-cards.json');
  writeFileSync(dest, raw);
  console.log('wrote ' + dest + ' (' + (statSync(dest).size / 1048576).toFixed(1) + ' MB, ' +
    parsed.data.length + ' rows, ' + parsed.names.length + ' columns)');
}

// ---- our card ids, straight out of the repo data files --------------------
// Parsed textually rather than executed: these files are plain object literals and we
// only need the key set, not the effect data.
const SETS = ['sor', 'shd', 'twi', 'jtl', 'lof', 'sec', 'law', 'ash', 'ts26', 'ibh'];
const ourIds = new Set();
const isLeaderId = new Set();
for (const set of SETS) {
  const p = join(root, 'data', 'cards-' + set + '.js');
  if (!existsSync(p)) continue;
  const src = readFileSync(p, 'utf8');
  for (const m of src.matchAll(/^\s*"([a-z0-9]{3,4}-\d{3})":/gm)) ourIds.add(m[1]);
  for (const m of src.matchAll(/^\s*"([a-z0-9]{3,4}-\d{3})":\s*\{"id":"[^"]+","type":"leader"/gm)) isLeaderId.add(m[1]);
}
if (!ourIds.size) { console.error('no card ids found in data/cards-*.js'); process.exit(2); }

// ---- source rows, normalised to one shape ---------------------------------
const idOf = (set, num) => String(set).toLowerCase() + '-' + String(num).padStart(3, '0');
// Fields arrive as arrays, JSON-encoded arrays, or comma-separated strings depending on
// the dump — the same tolerance import-resolve.mjs needs.
function asList(v) {
  if (Array.isArray(v)) return v;
  if (typeof v !== 'string' || !v.trim()) return [];
  if (v.trim().startsWith('[')) { try { return JSON.parse(v); } catch { /* fall through */ } }
  return v.split(',').map(s => s.trim()).filter(Boolean);
}

const rows = new Map(); // our id -> {name, subtitle, text, deployBox, epicAction, traits}
const uniquePath = join(SCRATCH, 'unique-cards.json');
const dbPath = join(SCRATCH, 'dotgg-cards.json');
let source;

// unique-cards.json is the better source when present — it is exactly our card set,
// already resolved. A --fetch run means the caller wants the dump just downloaded,
// so it wins over a possibly stale resolve.
if (existsSync(uniquePath) && !FETCH) {
  source = 'unique-cards.json';
  for (const c of Object.values(JSON.parse(readFileSync(uniquePath, 'utf8')))) {
    rows.set(idOf(c.set, c.number), {
      name: c.name, subtitle: c.subtitle, text: c.text,
      deployBox: c.deployBox, epicAction: c.epicAction, traits: asList(c.traits),
    });
  }
} else if (existsSync(dbPath)) {
  source = 'dotgg-cards.json';
  const db = JSON.parse(readFileSync(dbPath, 'utf8'));
  const F = {}; db.names.forEach((n, i) => F[n] = i);
  const MAIN_SETS = ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'SEC', 'LAW', 'ASH', 'IBH', 'TS26'];
  // Rules text lives under a different key from dump to dump; take the first present.
  const TEXT_KEYS = ['text', 'rulesText', 'cardText', 'ability', 'abilities', 'body'];
  const textKey = TEXT_KEYS.find(k => k in F);
  if (!textKey) console.warn('! no rules-text column found; names only (columns: ' + db.names.join(', ') + ')');
  for (const row of db.data) {
    if (row[F.printing] !== 'Standard' || !MAIN_SETS.includes(row[F.setId])) continue;
    const id = idOf(row[F.setId], row[F.number]);
    if (!ourIds.has(id) || rows.has(id)) continue;
    rows.set(id, {
      name: row[F.name], subtitle: row[F.subtitle],
      text: textKey ? row[F[textKey]] : '',
      deployBox: F.deployBox != null ? row[F.deployBox] : '',
      epicAction: F.epicAction != null ? row[F.epicAction] : '',
      traits: asList(row[F.traits]),
    });
  }
} else {
  console.error('no source dump found. Expected one of:\n  ' + uniquePath + '\n  ' + dbPath);
  process.exit(2);
}

// ---- unescape the dump's text fields --------------------------------------
// The card database stores rules text ESCAPED rather than raw: a line break arrives as
// the two characters backslash-n, and an apostrophe as backslash-apostrophe. Left alone
// that puts stray backslashes on the card face AND defeats the line split below, so a
// multi-line card collapses into one run-on line. One pass, so an escaped backslash is
// not re-read as the start of the next escape.
const UNESCAPE = { n: '\n', r: '\r', t: '\t' };
const unescape = v => typeof v === 'string'
  ? v.replace(/\\(.)/g, (m, c) => (Object.prototype.hasOwnProperty.call(UNESCAPE, c) ? UNESCAPE[c] : c))
  : v;
// ---- aspect icons ---------------------------------------------------------
// The dump renders an aspect ICON as its bare name with no separator, so a card asking
// for three icons arrives as "disclose CommandCommandHeroism". Split the run into
// bracketed icons; this project already substitutes names for the printed insignias.
// Only runs of 2+ are touched — a lone aspect name is ordinary prose ("a Command unit").
const ASPECT = '(?:Command|Aggression|Vigilance|Cunning|Heroism|Villainy)';
const icons = v => typeof v === 'string'
  ? v.replace(new RegExp('(?:' + ASPECT + '){2,}', 'g'),
      run => run.match(new RegExp(ASPECT, 'g')).map(a => '[' + a + ']').join(''))
  : v;

// ---- inline markup --------------------------------------------------------
// The dump marks up some rules text with pseudo-XML the printed card renders as layout
// or as a symbol. Left alone the tags reach the card face literally ("</bullet>"), so
// each one is translated into this project's own vocabulary here:
//   <bullet>..</bullet>  a bulleted list. Runs ACROSS line breaks, so it is resolved
//                        before the text is split into lines: every line of the block
//                        gets the bullet the tag stood for.
//   <uq>                 the unique insignia. This game calls that a CHAMPION
//                        (js/text.js), and a card face carries no third-party symbol.
const markup = v => typeof v !== 'string' ? v
  : v.replace(/<bullet>([\s\S]*?)<\/bullet>/g, (m, block) => block.split('\n')
        .map(l => (l.trim() ? '• ' + l.trim() : l)).join('\n'))
     .replace(/<\/?uq>/g, 'champion');

for (const r of rows.values()) {
  for (const k of ['name', 'subtitle', 'text', 'deployBox', 'epicAction']) r[k] = markup(icons(unescape(r[k])));
  r.traits = r.traits.map(unescape);
}

// ---- trait ids ------------------------------------------------------------
// tr01.. are assigned by tools/convert-cards.mjs as the sorted union of every trait
// across the imported cards. Rebuilding it the same way here reproduces that mapping
// exactly, so no committed map is needed.
const traitSet = new Set();
for (const [id, r] of rows) if (ourIds.has(id)) r.traits.forEach(t => traitSet.add(t));
const traitNames = {};
[...traitSet].sort().forEach((t, i) => { traitNames['tr' + String(i + 1).padStart(2, '0')] = t; });

// ---- rules text -----------------------------------------------------------
// Printed text verbatim, split into the line array SB.cardText returns. Leaders carry
// two faces plus the deploy action; label them the way the generated text does, so the
// preview's trigger/text split still lands.
function toLines(r, isLeader) {
  const out = [];
  const push = (label, blob) => String(blob || '').split(/\r?\n+/).map(s => s.trim()).filter(Boolean)
    .forEach(s => out.push(label ? label + ': ' + s : s));
  if (isLeader) {
    push('Leader', r.text);
    push('', r.epicAction);
    push('Unit', r.deployBox);
  } else {
    push('', r.text);
  }
  return out;
}

// ---- emit -----------------------------------------------------------------
const cards = {}, text = {};
const missing = [];
for (const id of [...ourIds].sort()) {
  const r = rows.get(id);
  if (!r) { missing.push(id); continue; }
  cards[id] = r.subtitle ? { name: r.name, subtitle: r.subtitle } : { name: r.name };
  const l = toLines(r, isLeaderId.has(id));
  if (l.length) text[id] = l;
}

// ---- deck names -----------------------------------------------------------
// The 16 decks are the two halves of a precon PRODUCT, so each is named for its product
// plus the leader that distinguishes it from the other half. Every part is sourced:
//   product name — the official product list, admin.starwarsunlimited.com/api/products
//   product kind — the internal deck id prefix (s = two-player starter, p = spotlight),
//                  matching tools/import-resolve.mjs's own *-starter-decks.json and
//                  *-spotlight-decks.json inputs, and the 6-starter/10-spotlight split
//                  the decks were imported under
//   leader       — the card database, via the names resolved above
const SET_PRODUCT = {
  sor: 'Spark of Rebellion', shd: 'Shadows of the Galaxy', twi: 'Twilight of the Republic',
  jtl: 'Jump to Lightspeed', lof: 'Legends of the Force', sec: 'Secrets of Power',
  law: 'A Lawless Time', ash: 'Ashes of the Empire',
};
const decks = {};
{
  const src = readFileSync(join(root, 'data', 'decks.js'), 'utf8');
  for (const m of src.matchAll(/"(deck-([sp])[0-9]+[ab])":\s*\{"leader":"([a-z0-9]{3,4}-\d{3})"/g)) {
    const [, deckId, kind, leaderId] = m;
    const leader = cards[leaderId];
    const product = SET_PRODUCT[leaderId.slice(0, 3)];
    if (!leader || !product) continue;      // unknown leader or set; keep the original name
    decks[deckId] = product + (kind === 's' ? ' Two-Player Starter' : ' Spotlight Deck') +
      ' – ' + leader.name;
  }
  // Tournament lists (deck-cNN) have no product name; a list is known by its leader
  // and base, so name it that way from the same card database.
  for (const m of src.matchAll(/"(deck-c[0-9]+)":\s*\{"leader":"([a-z0-9]{3,4}-\d{3})","base":"([a-z0-9]{3,4}-\d{3})"/g)) {
    const [, deckId, leaderId, baseId] = m;
    if (!cards[leaderId] || !cards[baseId]) continue;
    const L = cards[leaderId];
    decks[deckId] = L.name + (L.subtitle ? ", " + L.subtitle : "") + " – " + cards[baseId].name;
  }
  // Two lists can share leader and base; keep them apart by list number.
  Object.keys(decks).filter(k => k.startsWith("deck-c")).forEach(k => {
    if (Object.values(decks).filter(v => v === decks[k]).length > 1) decks[k] += " (" + k.slice(-2) + ")";
  });
  const dupes = Object.values(decks).filter((v, i, a) => a.indexOf(v) !== i);
  if (dupes.length) { console.error('! deck names are not unique: ' + dupes.join(', ')); process.exit(2); }
}

// A stray backslash on a card face means the dump gained an escape the unescape pass
// above does not know about. Fail loudly rather than shipping it to the card.
const escaped = Object.entries(text).filter(([, ls]) => ls.some(l => l.includes('\\')));
if (escaped.length) {
  console.error('! ' + escaped.length + ' card(s) still carry a backslash after unescaping, e.g.');
  escaped.slice(0, 3).forEach(([id, ls]) => console.error('    ' + id + ': ' + ls.find(l => l.includes('\\')).slice(0, 110)));
  process.exit(2);
}

// Same for an unsplit aspect-icon run ("CommandCommandHeroism"): if one survives, the
// aspect list above has fallen behind the game's and the card would ship unreadable.
const RUN = new RegExp('(?:' + ASPECT + '){2,}');
const glued = Object.entries(text).filter(([, ls]) => ls.some(l => RUN.test(l)));
if (glued.length) {
  console.error('! ' + glued.length + ' card(s) still show a run-together aspect icon, e.g.');
  glued.slice(0, 3).forEach(([id, ls]) => console.error('    ' + id + ': ' + ls.find(l => RUN.test(l)).slice(0, 110)));
  process.exit(2);
}

// Same again for a surviving pseudo-XML tag. Listing the known ones above and failing
// on anything else is deliberate: a dump that gains a tag we have never seen should
// stop the build, not quietly print "</bullet>" on a card.
const TAG = /<\/?[a-zA-Z][a-zA-Z0-9-]*>/;
const tagged = [
  ...Object.entries(text),
  ...Object.entries(cards).map(([id, c]) => [id, [c.name, c.subtitle].filter(Boolean)]),
].filter(([, ls]) => ls.some(l => TAG.test(l)));
if (tagged.length) {
  console.error('! ' + tagged.length + ' card(s) still carry an untranslated markup tag, e.g.');
  tagged.slice(0, 3).forEach(([id, ls]) => console.error('    ' + id + ': ' + ls.find(l => TAG.test(l)).slice(0, 110)));
  process.exit(2);
}

const body = [
  '  var C = ' + JSON.stringify(cards, null, 1) + ';',
  '  var T = ' + JSON.stringify(traitNames, null, 1) + ';',
  '  var D = ' + JSON.stringify(decks, null, 1) + ';',
  '  var X = ' + JSON.stringify(text, null, 1) + ';',
  '  Object.keys(C).forEach(function (id) { SB.names.cards[id] = C[id]; });',
  '  Object.keys(T).forEach(function (id) { SB.names.traits[id] = T[id]; });',
  '  Object.keys(D).forEach(function (id) { SB.names.decks[id] = D[id]; });',
  '  SB.sourceText = X;',
].join('\n');

writeFileSync(join(root, 'data', 'source-local.js'),
  '// source-local.js — GENERATED, GITIGNORED, LOCAL PLAYTESTING ONLY.\n' +
  '// Source-material display names and printed rules text, keyed by our internal ids.\n' +
  '// Built by tools/gen-source-names.mjs; loaded last by index.html so it wins over the\n' +
  '// committed original names. Never commit this file and never deploy it: the public\n' +
  '// build has no copy and falls back to the original names in data/names-*.js.\n' +
  "(function (SB) {\n  'use strict';\n" + body + '\n})(window.SB = window.SB || {});\n');

console.log('source: ' + source);
console.log('named:  ' + Object.keys(cards).length + '/' + ourIds.size + ' cards');
console.log('text:   ' + Object.keys(text).length + ' cards');
console.log('traits: ' + Object.keys(traitNames).length);
console.log('decks:  ' + Object.keys(decks).length);
if (missing.length) {
  // The full list belongs in scratch, not scrolled off the top of a terminal.
  writeFileSync(join(SCRATCH, 'unmatched-ids.txt'), missing.join('\n') + '\n');
  console.log('UNMATCHED (' + missing.length + '): ' + missing.slice(0, 10).join(' ') +
    (missing.length > 10 ? ' … full list -> ' + join(SCRATCH, 'unmatched-ids.txt') : ''));
}

// ---- --diff: audit the transcription pass ---------------------------------
// The abilities in data/cards-*.js were authored BY HAND from the scratch work packets.
// SB.validateContent proves every one of them is implemented; nothing proves each was
// transcribed correctly. The generated text is a paraphrase of our effect data, so it
// describes a mistranscription just as faithfully as a correct one — the only way to
// catch a dropped clause is to read printed text against generated text, card by card.
// This writes that comparison to the SCRATCH dir (it carries printed text; never commit).
if (!process.argv.includes('--diff')) process.exit(0);

// Generated text comes from the real engine, loaded exactly the way the test runner
// loads it — via tests.html, which deliberately excludes data/source-local.js, so
// SB.cardText here is the describer output and not the override we just wrote.
const vm = await import('node:vm');
const testHtml = readFileSync(join(root, 'tests.html'), 'utf8');
const srcs = [...testHtml.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
const win = {}; win.window = win;
const ctx = vm.createContext({ window: win, console, SB: undefined });
for (const s of srcs) vm.runInContext(readFileSync(join(root, s), 'utf8'), ctx, { filename: s });
const SB = win.SB;

// Reminder text in parens restates a keyword the card already prints in bold; it is
// pure noise for this comparison, and convert-cards.mjs stripped it on the way in too.
// Printed text writes negative stats with an en dash (–2/–0) and uses U+00A0 inside
// phrases like "control 6 or more resources". Normalise both before tokenising, or every
// negative modifier reads as a missing number and buries the real findings in noise.
const normalise = s => String(s || '').replace(/[‒-―−]/g, '-').replace(/ /g, ' ');
const stripReminders = s => normalise(s).replace(/\(([^()]|\([^()]*\))*\)/g, ' ');
const STOP = new Set(('a an the of to for or and if is are be by on in it its this that with' +
  ' you your they their may can not each other another when while then than as at from').split(' '));
// Salient = the tokens that carry rules meaning. A clause lost in transcription almost
// always takes a number or a keyword with it, so those are weighted separately below.
const KEYWORDS = Object.keys(SB.names.keywords).map(k => String(SB.names.keywords[k]).toLowerCase());
function tokens(s) {
  // Keep a leading sign on a number ("-2") but split hyphenated words, so a stat
  // modifier stays comparable against our own signed rendering.
  const t = stripReminders(s).toLowerCase()
    .replace(/([a-z])-(?=[a-z])/g, '$1 ')
    .replace(/[^a-z0-9+\-]+/g, ' ').split(' ').filter(Boolean);
  return {
    nums: new Set(t.filter(w => /^[+-]?\d+$/.test(w))),
    kws: new Set(t.filter(w => KEYWORDS.includes(w))),
    words: new Set(t.filter(w => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w))),
  };
}
const diffSet = (a, b) => [...a].filter(x => !b.has(x));

const report = [];
for (const id of Object.keys(text).sort()) {
  if (!SB.cards[id]) continue;
  const printed = text[id].join(' ');
  let generated;
  try { generated = SB.cardText(id).join(' '); } catch (e) { generated = '!! cardText threw: ' + e.message; }
  const P = tokens(printed), G = tokens(generated);
  const lostNums = diffSet(P.nums, G.nums);
  const lostKws = diffSet(P.kws, G.kws);
  const addedNums = diffSet(G.nums, P.nums);
  const shared = [...P.words].filter(w => G.words.has(w)).length;
  const overlap = P.words.size ? shared / P.words.size : 1;
  // Rank worst-first: a missing number or keyword is the strong signal, low word
  // overlap the weak one. Wording always differs, so overlap alone proves nothing.
  const score = lostNums.length * 10 + lostKws.length * 10 + addedNums.length * 4 + (1 - overlap) * 3;
  report.push({ id, score, lostNums, lostKws, addedNums, overlap, printed, generated });
}
report.sort((a, b) => b.score - a.score);

const flagged = report.filter(r => r.lostNums.length || r.lostKws.length || r.addedNums.length || r.overlap < 0.34);
const md = [
  '# Transcription audit — printed text vs generated text',
  '',
  'SCRATCH ONLY: carries source-material printed text. Never commit.',
  'Generated by `node tools/gen-source-names.mjs <scratch> --diff`.',
  '',
  'Wording always differs — ours is a paraphrase of the effect data. What matters is a',
  'number or keyword that appears on the card and NOT in our text (a likely dropped',
  'clause), or one in our text and not on the card (a likely wrong value).',
  '',
  '- cards compared: ' + report.length,
  '- flagged for review: ' + flagged.length,
  '',
  '| card | id | lost # | lost kw | added # | word overlap |',
  '|---|---|---|---|---|---|',
  ...flagged.map(r => '| ' + (cards[r.id] ? cards[r.id].name : r.id) + ' | ' + r.id + ' | ' +
    (r.lostNums.join(' ') || '—') + ' | ' + (r.lostKws.join(' ') || '—') + ' | ' +
    (r.addedNums.join(' ') || '—') + ' | ' + Math.round(r.overlap * 100) + '% |'),
  '',
  '---',
  '',
  ...flagged.flatMap(r => [
    '## ' + (cards[r.id] ? cards[r.id].name : r.id) + '  `' + r.id + '`',
    '',
    '**printed**   ' + r.printed,
    '',
    '**generated** ' + r.generated,
    '',
  ]),
].join('\n');
writeFileSync(join(SCRATCH, 'text-diff.md'), md);
writeFileSync(join(SCRATCH, 'text-diff.json'), JSON.stringify(report, null, 1));
console.log('');
console.log('diff:   ' + report.length + ' compared, ' + flagged.length + ' flagged');
console.log('        ' + join(SCRATCH, 'text-diff.md'));
