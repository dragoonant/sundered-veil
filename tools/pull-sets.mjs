// pull-sets.mjs — incremental card puller for the competitive-deck expansion.
//
// Unlike convert-cards.mjs (which regenerates whole data files and therefore cannot run
// after abilities have been hand-authored), this tool APPENDS skeleton entries for cards
// that are not yet in data/cards-<set>.js and leaves every existing line untouched.
//
// Sources (all in the SCRATCH dir, never the repo — they carry third-party text):
//   swudb-<set>.json   per-set dumps from api.swu-db.com (primary: aspects, traits,
//                      keywords, stats, front/back text are authoritative here)
//   dotgg-cards.json   fallback for any card the swudb dump lacks
//   decks.json         the 20 competitive lists (from the hub/melee scrape)
//   trait-map.json     trait slug -> neutral id; rebuilt from data/source-local.js when
//                      missing, extended here for new traits
// Outputs:
//   data/cards-<set>.js         new skeleton lines inserted before the closing "});"
//   data/decks.js               20 competitive decks appended (format + sideboard fields)
//   data/names-placeholder.js   placeholder names for new cards, traits, decks
//   <scratch>/workpackets/<set>.json   printed text per new card for the authoring pass
//   <scratch>/pull-report.json  what was added
// Usage: node tools/pull-sets.mjs <scratchDir> [--dry-run]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRATCH = process.argv[2];
const DRY = process.argv.includes('--dry-run');
if (!SCRATCH) { console.error('usage: node tools/pull-sets.mjs <scratchDir> [--dry-run]'); process.exit(2); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Sets pulled in full; anything else enters only if one of the 20 lists uses it.
const FULL_SETS = ['ash', 'law', 'lof', 'sec', 'jtl'];
const ASPECTS = ['vigilance', 'command', 'aggression', 'cunning', 'heroism', 'villainy'];
const idOf = (set, num) => String(set).toLowerCase() + '-' + String(num).padStart(3, '0');

// ---- existing ids ---------------------------------------------------------
const dataFiles = {};
const have = new Set();
for (const f of ['sor', 'shd', 'twi', 'jtl', 'lof', 'sec', 'law', 'ash', 'ts26', 'ibh']) {
  const p = join(root, 'data', 'cards-' + f + '.js');
  if (!existsSync(p)) continue;
  const src = readFileSync(p, 'utf8');
  dataFiles[f] = src;
  for (const m of src.matchAll(/^\s*"([a-z0-9]+-\d{3})":/gm)) have.add(m[1]);
}

// ---- trait map ------------------------------------------------------------
const traitPath = join(SCRATCH, 'trait-map.json');
let traitMap = {};
if (existsSync(traitPath)) traitMap = JSON.parse(readFileSync(traitPath, 'utf8'));
else {
  // Rebuild from the local source-name file: its T map is id -> source trait name.
  const sl = readFileSync(join(root, 'data', 'source-local.js'), 'utf8');
  const m = sl.match(/var T = \{([\s\S]*?)\};/);
  if (!m) { console.error('no trait map and no T map in data/source-local.js'); process.exit(2); }
  const T = JSON.parse('{' + m[1] + '}');
  for (const [id, name] of Object.entries(T)) traitMap[slug(name)] = id;
}
function slug(s) { return String(s).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
const newTraits = [];
function traitId(name) {
  const k = slug(name);
  if (!traitMap[k]) {
    const n = Object.keys(traitMap).length + 1;
    traitMap[k] = 'tr' + String(n).padStart(2, '0');
    newTraits.push([k, traitMap[k]]);
  }
  return traitMap[k];
}

// ---- source rows ----------------------------------------------------------
const rows = new Map(); // id -> normalised row
function addSwudb(set) {
  const p = join(SCRATCH, 'swudb-' + set + '.json');
  if (!existsSync(p)) return 0;
  let n = 0;
  for (const c of JSON.parse(readFileSync(p, 'utf8'))) {
    if (c.VariantType !== 'Normal') continue;
    if (/Token/i.test(c.Type)) continue;
    const id = idOf(c.Set, c.Number);
    if (rows.has(id)) continue;
    rows.set(id, {
      id, set: c.Set.toLowerCase(), number: Number(c.Number), name: c.Name, subtitle: c.Subtitle || null,
      type: c.Type.toLowerCase(), aspects: (c.Aspects || []).map(a => a.toLowerCase()),
      traits: (c.Traits || []).map(t => t.toLowerCase()), arenas: (c.Arenas || []).map(a => a.toLowerCase()),
      cost: num(c.Cost), power: num(c.Power), hp: num(c.HP), unique: !!c.Unique,
      text: c.FrontText || '', backText: c.BackText || '', epicAction: c.EpicAction || '',
      keywords: c.Keywords || [], source: 'swudb',
    });
    n++;
  }
  return n;
}
function num(v) { return v === '' || v == null ? null : Number(v); }
for (const s of ['ash', 'law', 'lof', 'sec', 'jtl', 'sor', 'shd', 'twi', 'ts26', 'ibh']) addSwudb(s);

// dotgg fallback: only for ids the swudb dumps do not have.
{
  const p = join(SCRATCH, 'dotgg-cards.json');
  if (existsSync(p)) {
    const db = JSON.parse(readFileSync(p, 'utf8'));
    const F = {}; db.names.forEach((n, i) => F[n] = i);
    const list = v => { if (Array.isArray(v)) return v; const s = String(v || '').trim(); if (!s) return []; if (s.startsWith('[')) { try { return JSON.parse(s); } catch { /* */ } } return s.split(',').map(x => x.trim()).filter(Boolean); };
    for (const r of db.data) {
      if (r[F.printing] !== 'Standard' || r[F.variantOf]) continue;
      if (/Token/i.test(r[F.type])) continue;
      const id = idOf(r[F.setId], r[F.number]);
      if (rows.has(id)) continue;
      rows.set(id, {
        id, set: r[F.setId].toLowerCase(), number: Number(r[F.number]), name: r[F.name], subtitle: r[F.subtitle] || null,
        type: String(r[F.type]).toLowerCase(), aspects: [r[F.color], r[F.color2]].filter(Boolean).map(a => a.toLowerCase()),
        traits: list(r[F.traits]).map(t => t.toLowerCase()), arenas: list(r[F.arenas]).map(a => a.toLowerCase()),
        cost: num(r[F.cost]), power: num(r[F.power]), hp: num(r[F.hp]), unique: r[F.uni] === '1' || r[F.uni] === 1,
        text: r[F.text] || '', backText: r[F.deployBox] || '', epicAction: r[F.epicAction] || '', keywords: [], source: 'dotgg',
      });
    }
  }
}

// ---- which ids to pull ----------------------------------------------------
const wanted = new Set();
for (const [id, r] of rows) if (FULL_SETS.includes(r.set)) wanted.add(id);
// Deck cards are resolved by NAME: the scrape's set/number came from whichever dotgg
// printing matched first (often a hyperspace/foil number), so only the name is trustworthy.
// Resolution order: name+subtitle among canonical rows, then name only; among candidates
// prefer an id already in the game, then the scrape's set, then the lowest id.
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const byFull = new Map(), byName = new Map();
for (const [id, r] of rows) {
  const k1 = norm(r.name + ' ' + (r.subtitle || '')), k2 = norm(r.name);
  if (!byFull.has(k1)) byFull.set(k1, []); byFull.get(k1).push(id);
  if (!byName.has(k2)) byName.set(k2, []); byName.get(k2).push(id);
}
function resolveDeckCard(c) {
  const [name, sub] = c.name.split(' | ');
  let cands = byFull.get(norm(name + ' ' + (sub || ''))) || [];
  if (!cands.length) cands = byName.get(norm(name)) || [];
  if (!cands.length) return null;
  const pref = String(c.db.set).toLowerCase();
  cands = cands.slice().sort((a, b) => (have.has(b) - have.has(a)) || ((b.startsWith(pref)) - (a.startsWith(pref))) || (a < b ? -1 : 1));
  return cands[0];
}
const decks = JSON.parse(readFileSync(join(SCRATCH, 'decks.json'), 'utf8'));
const deckCardId = new Map(); // deckIndex|catTitle|name -> id
for (const [di, d] of decks.entries()) for (const cat of d.cats) for (const c of cat.cards) {
  const id = resolveDeckCard(c);
  if (!id) { console.error('deck card not in any source dump: ' + c.name + ' (' + c.db.set + '-' + c.db.num + ')'); process.exit(2); }
  deckCardId.set(di + '|' + cat.title + '|' + c.name, id);
  wanted.add(id);
}
const toAdd = [...wanted].filter(id => !have.has(id)).sort();

// ---- keyword parsing (behaviour, not wording) -----------------------------
const KW_FLAG = ['Sentinel', 'Saboteur', 'Ambush', 'Overwhelm', 'Shielded', 'Grit', 'Hidden', 'Coordinate', 'Support', 'Plot'];
function parseKeywords(text) {
  const kws = [];
  let rest = (text || '').replace(/ /g, ' ');
  rest = rest.replace(/\(([^()]|\([^()]*\))*\)/g, '').replace(/[ \t]+\n/g, '\n');
  // Bracketed cost keywords: Piloting [2 resources Command Heroism], Smuggle [4 resources Heroism]
  rest = rest.replace(/(^|\n)\s*(Piloting|Smuggle)\s*\[([^\]]*)\]\s*(?=\n|$)/g, (m, pre, k, inner) => {
    const cm = inner.match(/(\d+)\s*resources?/i);
    const asp = ASPECTS.filter(a => new RegExp(a, 'i').test(inner));
    kws.push({ k: k.toLowerCase(), cost: cm ? Number(cm[1]) : 0, aspects: asp });
    return pre;
  });
  for (const k of ['Raid', 'Restore', 'Exploit']) {
    rest = rest.replace(new RegExp('(^|\\n|, )' + k + '\\s+(\\d+)\\s*(?=\\n|$|,)', 'g'), (m, pre, n) => { kws.push({ k: k.toLowerCase(), n: Number(n) }); return pre; });
  }
  for (const k of KW_FLAG) {
    const bare = new RegExp('(^|\\n|, )' + k + '\\s*(?=$|\\n|,)', 'g');
    if (bare.test(rest)) { rest = rest.replace(bare, '$1'); kws.push({ k: k.toLowerCase() }); }
  }
  rest = rest.split('\n').map(l => l.replace(/^(,\s*)+|(\s*,)+$/g, '').trim()).filter(Boolean).join('\n');
  const seen = new Set();
  return { kws: kws.filter(x => { const key = x.k + '|' + (x.n || x.cost || ''); if (seen.has(key)) return false; seen.add(key); return true; }), rest };
}

// ---- skeletons ------------------------------------------------------------
const bySet = {}; const packets = {}; const report = { added: [], perSet: {}, newTraits: [], decks: [] };
for (const id of toAdd) {
  const c = rows.get(id);
  const e = { id, type: c.type };
  e.aspects = c.aspects.filter(a => ASPECTS.includes(a));
  if (c.traits.length) e.traits = c.traits.map(traitId);
  if (c.unique) e.unique = true;
  const packet = { id, type: c.type, name: c.name, subtitle: c.subtitle, text: c.text, backText: c.backText, epicAction: c.epicAction, source: c.source, done: false };
  if (c.type === 'unit') {
    e.cost = c.cost; e.power = c.power; e.hp = c.hp;
    e.arena = (c.arenas[0] || 'ground').replace(/[^a-z]/g, '');
    const { kws, rest } = parseKeywords(c.text);
    if (kws.length) e.keywords = kws;
    packet.todoText = rest; packet.done = rest === '';
  } else if (c.type === 'leader') {
    const m = (c.epicAction || '').match(/(\d+)\s+or more resources/i) || (c.epicAction || '').match(/\[(\d+)\s+resources\]/i) || (c.text || '').match(/(\d+)\s+or more resources/i);
    e.deployCost = m ? Number(m[1]) : (c.cost != null ? c.cost : 5);
    const back = parseKeywords(c.backText);
    e.leaderSide = { abilities: [] };
    e.deployedSide = { arena: (c.arenas[0] || 'ground').replace(/[^a-z]/g, ''), power: c.power, hp: c.hp };
    if (back.kws.length) e.deployedSide.keywords = back.kws;
    packet.todoText = ('LEADER SIDE:\n' + c.text + '\nUNIT SIDE:\n' + back.rest + '\nEPIC:\n' + c.epicAction).trim();
  } else if (c.type === 'base') {
    e.hp = c.hp;
    packet.todoText = c.text; packet.done = !c.text;
  } else if (c.type === 'event') {
    e.cost = c.cost;
    packet.todoText = c.text;
  } else if (c.type === 'upgrade') {
    e.cost = c.cost;
    if (c.power) e.power = c.power;
    if (c.hp) e.hp = c.hp;
    // attachTo is omitted (unrestricted) unless the printed text says "friendly"; the
    // combat test pins that only upgrades that SAY friendly refuse an enemy bearer.
    if (/attach to (a|an) friendly/i.test(c.text)) e.attachTo = 'friendly';
    const { kws, rest } = parseKeywords(c.text);
    if (kws.length) e.grantKeywords = kws;
    packet.todoText = rest; packet.done = rest === '';
  } else { console.error('unknown type', id, c.type); process.exit(2); }
  (bySet[c.set] = bySet[c.set] || []).push(e);
  (packets[c.set] = packets[c.set] || []).push(packet);
  report.added.push(id);
}

// ---- decks ----------------------------------------------------------------
const deckLines = [];
const deckNames = {};
decks.forEach((d, i) => {
  const did = 'deck-c' + String(i + 1).padStart(2, '0');
  const main = [], side = [];
  let leader = null, base = null;
  for (const cat of d.cats) for (const c of cat.cards) {
    const id = deckCardId.get(i + '|' + cat.title + '|' + c.name);
    if (/^Leader/.test(cat.title)) leader = id;
    else if (/^Base/.test(cat.title)) base = id;
    else if (/Sideboard/.test(cat.title)) { for (let k = 0; k < c.n; k++) side.push(id); }
    else { for (let k = 0; k < c.n; k++) main.push(id); }
  }
  const entry = { leader, base, cards: main, sideboard: side, format: d.format.toLowerCase(), group: 'competitive' };
  deckLines.push('  ' + JSON.stringify(did) + ': ' + JSON.stringify(entry) + ',');
  deckNames[did] = did.toUpperCase();
  report.decks.push({ id: did, leader, base, main: main.length, side: side.length, format: entry.format });
});

// ---- emit -----------------------------------------------------------------
const MARK = '  // ---- competitive-expansion skeletons (tools/pull-sets.mjs); abilities authored by hand ----';
// Keeps the file's own line-ending style: the checked-out data files are CRLF on
// Windows (core.autocrlf) and a mixed file leaves a bare CR at the join.
function insertBeforeClose(src, lines, closeRe) {
  const crlf = (src.match(/\r\n/g) || []).length > (src.match(/[^\r]\n/g) || []).length;
  const lf = src.replace(/\r\n/g, '\n');
  const idx = lf.lastIndexOf(closeRe);
  if (idx < 0) throw new Error('closing marker not found');
  const out = lf.slice(0, idx) + lines.join('\n') + '\n' + lf.slice(idx);
  return crlf ? out.replace(/\n/g, '\r\n') : out;
}
const scriptTagsNeeded = [];
for (const [set, list] of Object.entries(bySet)) {
  list.sort((a, b) => a.id < b.id ? -1 : 1);
  const lines = list.map(e => '  ' + JSON.stringify(e.id) + ': ' + JSON.stringify(e) + ',');
  report.perSet[set] = list.length;
  const p = join(root, 'data', 'cards-' + set + '.js');
  let out;
  if (dataFiles[set]) {
    out = insertBeforeClose(dataFiles[set], (dataFiles[set].includes(MARK) ? [] : [MARK]).concat(lines), '\n  });');
  } else {
    out = '// cards-' + set + '.js — GENERATED skeleton (tools/pull-sets.mjs), then hand-edited:\n' +
      '// abilities are authored manually from the scratch workpackets.\n' +
      '(function (SB) {\n  \'use strict\';\n  Object.assign(SB.cards, {\n' + MARK + '\n' + lines.join('\n') + '\n  });\n})(window.SB = window.SB || {});\n';
    scriptTagsNeeded.push('data/cards-' + set + '.js');
  }
  if (!DRY) writeFileSync(p, out);
  mkdirSync(join(SCRATCH, 'workpackets'), { recursive: true });
  if (!DRY) writeFileSync(join(SCRATCH, 'workpackets', set + '.json'), JSON.stringify(packets[set], null, 1));
}

// decks.js: append after the last deck line
{
  const p = join(root, 'data', 'decks.js');
  let src = readFileSync(p, 'utf8');
  if (!/deck-c01/.test(src)) {
    src = insertBeforeClose(src, ['  // ---- competitive decks (tools/pull-sets.mjs): format = premier|eternal, sideboard = 10 cards ----'].concat(deckLines), '\n  });');
    if (!DRY) writeFileSync(p, src);
  } else console.log('decks.js already has competitive decks; not re-adding');
}

// names-placeholder.js: cards, traits, decks
{
  const p = join(root, 'data', 'names-placeholder.js');
  let src = readFileSync(p, 'utf8');
  const lines = [];
  for (const id of toAdd) if (!src.includes('SB.names.cards[' + JSON.stringify(id) + ']')) lines.push('  SB.names.cards[' + JSON.stringify(id) + '] = ' + JSON.stringify({ name: 'P-' + id.toUpperCase() }) + ';');
  for (const [, tid] of newTraits) if (!src.includes('SB.names.traits[' + JSON.stringify(tid) + ']')) lines.push('  SB.names.traits[' + JSON.stringify(tid) + '] = ' + JSON.stringify(tid.toUpperCase()) + ';');
  for (const [did, n] of Object.entries(deckNames)) if (!src.includes('SB.names.decks[' + JSON.stringify(did) + ']')) lines.push('  SB.names.decks[' + JSON.stringify(did) + '] = ' + JSON.stringify(n) + ';');
  if (lines.length) {
    src = insertBeforeClose(src, lines, '\n})(window.SB');
    if (!DRY) writeFileSync(p, src);
  }
}

report.newTraits = newTraits;
if (!DRY) {
  writeFileSync(traitPath, JSON.stringify(traitMap, null, 1));
  writeFileSync(join(SCRATCH, 'pull-report.json'), JSON.stringify(report, null, 1));
}
console.log((DRY ? '[dry-run] ' : '') + 'added ' + toAdd.length + ' cards:', Object.entries(report.perSet).map(([s, n]) => s + '(' + n + ')').join(' '));
console.log('new traits:', newTraits.map(t => t[1] + '=' + t[0]).join(', ') || 'none');
console.log('decks:', report.decks.map(d => d.id + ' ' + d.format + ' ' + d.main + '+' + d.side).join(' | '));
if (scriptTagsNeeded.length) console.log('ADD SCRIPT TAGS to index.html AND tests.html:', scriptTagsNeeded.join(', '));
const todo = Object.values(packets).flat().filter(p => !p.done).length;
console.log('packets needing manual effects:', todo, 'of', toAdd.length);
