// import-resolve.mjs — merges deck sources (dotgg API decks + official decklist-image
// transcriptions) against the dotgg card DB, verifies totals, and writes
// resolved-decks.json + unique-cards.json to the SCRATCH dir. Reads/writes ONLY the
// scratch dir (third-party names never enter the repo). Usage:
//   node tools/import-resolve.mjs <scratchDir>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SCRATCH = process.argv[2];
if (!SCRATCH) { console.error('usage: node tools/import-resolve.mjs <scratchDir>'); process.exit(2); }

const db = JSON.parse(readFileSync(join(SCRATCH, 'dotgg-cards.json'), 'utf8'));
const F = {}; db.names.forEach((n, i) => F[n] = i);
const MAIN_SETS = ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'SEC', 'LAW', 'ASH', 'IBH'];

const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Index: dotgg id -> row; and name+number -> rows
const isCanonical = row => row[F.printing] === 'Standard' && MAIN_SETS.includes(row[F.setId]);

const byId = new Map(), byNameNum = new Map();
for (const row of db.data) {
  byId.set(row[F.id], row);
  if (!isCanonical(row)) continue; // only canonical printings
  const key = norm(row[F.name] + (row[F.subtitle] ? ' ' + row[F.subtitle] : '')) + '|' + Number(row[F.number]);
  const key2 = norm(row[F.name]) + '|' + Number(row[F.number]);
  for (const k of new Set([key, key2])) {
    if (!byNameNum.has(k)) byNameNum.set(k, []);
    byNameNum.get(k).push(row);
  }
}

// Map any printing to its canonical Standard row (same name+subtitle+type), if one
// exists — dotgg deck ids sometimes point at foil/special printings.
const canonKey = r => norm(r[F.name] + '|' + (r[F.subtitle] || '') + '|' + r[F.type]);
const canonIndex = new Map();
for (const row of db.data) {
  if (!isCanonical(row)) continue;
  const k = canonKey(row);
  if (!canonIndex.has(k)) canonIndex.set(k, row);
}

// Fields like traits/arenas are sometimes a JSON array string, sometimes a plain
// comma-separated string, sometimes already an array.
function parseList(v) {
  if (Array.isArray(v)) return v.map(String);
  const s = String(v == null ? '' : v).trim();
  if (!s) return [];
  if (s.startsWith('[')) { try { return JSON.parse(s).map(String); } catch (e) { /* fall through */ } }
  return s.split(',').map(x => x.trim().replace(/^\[?"?|"?\]?$/g, '')).filter(Boolean);
}

function rowInfo(row0) {
  const row = canonIndex.get(canonKey(row0)) || row0;
  return {
    set: row[F.setId], number: Number(row[F.number]), name: row[F.name],
    subtitle: row[F.subtitle] || null, type: row[F.type], type2: row[F.type2] || null,
    cost: row[F.cost] === '' ? null : Number(row[F.cost]),
    hp: row[F.hp] === '' ? null : Number(row[F.hp]),
    power: row[F.power] === '' ? null : Number(row[F.power]),
    aspects: [row[F.color], row[F.color2]].filter(Boolean),
    traits: parseList(row[F.traits]),
    arenas: parseList(row[F.arenas]),
    unique: row[F.uni] === '1' || row[F.uni] === 1 || row[F.uni] === true,
    text: row[F.text] || '', deployBox: row[F.deployBox] || '', epicAction: row[F.epicAction] || '',
    dotggId: row[F.id],
  };
}

// Name-only index for fallback (collector numbers on decklist images are sometimes
// misread or refer to variant printings).
const byName = new Map();
for (const row of db.data) {
  if (!isCanonical(row)) continue;
  const k = norm(row[F.name]);
  if (!byName.has(k)) byName.set(k, []);
  byName.get(k).push(row);
}

function resolveByNameNum(name, number, prefSet, prevSet) {
  let cands = (byNameNum.get(norm(name) + '|' + Number(number)) || [])
    .filter(r => MAIN_SETS.includes(r[F.setId]));
  if (cands.length === 0) {
    // Fallback: name only. Prefer prefSet for non-prevSet; else prefer non-prefSet.
    const all = byName.get(norm(name)) || [];
    const pool = prevSet ? all.filter(r => r[F.setId] !== prefSet) : all.filter(r => r[F.setId] === prefSet);
    const chosen = pool.length ? pool : all;
    if (chosen.length === 0) return { error: 'no match: ' + name + ' #' + number };
    if (new Set(chosen.map(r => r[F.setId] + '-' + r[F.number])).size > 1)
      console.warn('NAME-ONLY ambiguous', name, '#' + number, '→', chosen.map(r => r[F.setId] + '-' + r[F.number]).join(','), 'picked first');
    console.warn('NAME-ONLY resolved', name, '#' + number, '→', chosen[0][F.setId] + '-' + chosen[0][F.number]);
    return rowInfo(chosen[0]);
  }
  let pick;
  if (!prevSet) {
    pick = cands.find(r => r[F.setId] === prefSet) || null;
    if (!pick) return { error: 'not in ' + prefSet + ': ' + name + ' #' + number + ' (found ' + cands.map(r => r[F.setId]).join(',') + ')' };
  } else {
    const notPref = cands.filter(r => r[F.setId] !== prefSet);
    if (notPref.length === 1) pick = notPref[0];
    else if (notPref.length > 1) {
      pick = notPref[0];
      console.warn('AMBIGUOUS prevSet', name, number, '→', notPref.map(r => r[F.setId]).join(','), 'picked', pick[F.setId]);
    } else return { error: 'prevSet but only found in ' + prefSet + ': ' + name };
  }
  return rowInfo(pick);
}

const out = {}; const problems = [];

// ---- dotgg-sourced decks -------------------------------------------------
const dotgg = JSON.parse(readFileSync(join(SCRATCH, 'dotgg-decks.json'), 'utf8'));
// Correction verified against the official decklist image: one SEC spotlight deck in
// the dotgg data is missing its 50th card (SEC #111 x1, present on the printed list).
{
  const pal = dotgg['sec-spotlight-palpatine'];
  const sec111 = db.data.find(r => r[F.setId] === 'SEC' && Number(r[F.number]) === 111 && isCanonical(r));
  if (pal && sec111 && !pal.deck[sec111[F.id]]) pal.deck[sec111[F.id]] = '1';
}
for (const [key, d] of Object.entries(dotgg)) {
  const deck = { humanname: d.humanname, leader: null, base: null, cards: [] };
  for (const [id, cnt] of Object.entries(d.deck)) {
    const row = byId.get(id);
    if (!row) { problems.push(key + ': unknown dotgg id ' + id); continue; }
    const info = rowInfo(row);
    if (id === d.leader) deck.leader = info;
    else if (id === d.base) deck.base = info;
    else deck.cards.push({ ...info, count: Number(cnt) });
  }
  out[key] = deck;
}

// ---- image-transcribed decks ---------------------------------------------
const IMG_SOURCES = [
  ['twi-starter-decks.json', 'TWI'],
  ['lof-spotlight-decks.json', 'LOF'],
  ['law-spotlight-decks.json', 'LAW'],
  ['ash-spotlight-decks.json', 'ASH'],
  ['sec-spotlight-decks.json', 'SEC'],
];
for (const [file, set] of IMG_SOURCES) {
  const src = JSON.parse(readFileSync(join(SCRATCH, file), 'utf8'));
  for (const [key, d] of Object.entries(src)) {
    if (key === 'note') continue;
    const deck = { humanname: d.humanname, leader: null, base: null, cards: [] };
    // leader/base resolve by number within the set (image may lack names for these).
    for (const [slot, ref] of [['leader', d.leader], ['base', d.base]]) {
      const want = slot === 'leader' ? 'Leader' : 'Base';
      let cands = db.data.filter(r => r[F.setId] === set && Number(r[F.number]) === Number(ref.number) &&
        isCanonical(r) && r[F.type] === want);
      if (cands.length > 1) cands = [cands[0]]; // duplicate printings of the same card
      if (cands.length !== 1) problems.push(key + ': ' + slot + ' #' + ref.number + ' matched ' + cands.length);
      else deck[slot] = rowInfo(cands[0]);
    }
    for (const c of d.cards) {
      const info = resolveByNameNum(c.name, c.number, set, !!c.prevSet);
      if (info.error) { problems.push(key + ': ' + info.error); continue; }
      deck.cards.push({ ...info, count: c.count });
    }
    out[key] = deck;
  }
}

// ---- verification ---------------------------------------------------------
for (const [key, d] of Object.entries(out)) {
  const total = d.cards.reduce((a, c) => a + c.count, 0);
  const flag = total === 50 ? '' : '  <-- NOT 50';
  console.log(key.padEnd(28), 'total', total, flag, d.leader ? '' : 'NO LEADER', d.base ? '' : 'NO BASE');
}
// SEC cross-check dotgg vs image
for (const pair of [['sec-spotlight-padme', 'sec-spotlight-padme-img'], ['sec-spotlight-palpatine', 'sec-spotlight-palpatine-img']]) {
  const [a, b] = pair.map(k => out[k]);
  if (!a || !b) continue;
  const m = d => Object.fromEntries(d.cards.map(c => [c.set + '-' + c.number, c.count]));
  const ma = m(a), mb = m(b);
  for (const k of new Set([...Object.keys(ma), ...Object.keys(mb)])) {
    if (ma[k] !== mb[k]) console.log('SEC DIFF', pair[0], k, 'dotgg=' + ma[k], 'image=' + mb[k]);
  }
}

if (problems.length) { console.log('\nPROBLEMS:'); problems.forEach(p => console.log(' -', p)); }

// ---- outputs --------------------------------------------------------------
// The *-img decks exist only to cross-check the dotgg versions; drop them.
delete out['sec-spotlight-padme-img'];
delete out['sec-spotlight-palpatine-img'];
// Neutral internal deck ids (a = the deck listed first in the product / heroism side).
// The mapping lives in scratch (its keys carry third-party references); the repo only
// ever sees the neutral ids on the right-hand side.
const DECK_IDS = JSON.parse(readFileSync(join(SCRATCH, 'deck-ids.json'), 'utf8'));
const renamed = {};
for (const [k, v] of Object.entries(out)) renamed[DECK_IDS[k] || k] = v;
writeFileSync(join(SCRATCH, 'resolved-decks.json'), JSON.stringify(renamed, null, 1));
const uniq = new Map();
for (const d of Object.values(out)) {
  for (const c of [d.leader, d.base, ...d.cards]) {
    if (c) uniq.set(c.set + '-' + String(c.number).padStart(3, '0'), c);
  }
}
writeFileSync(join(SCRATCH, 'unique-cards.json'),
  JSON.stringify(Object.fromEntries([...uniq.entries()].sort()), null, 1));
console.log('\nunique cards:', uniq.size, ' decks:', Object.keys(out).length);
