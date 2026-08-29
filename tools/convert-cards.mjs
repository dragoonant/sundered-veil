// convert-cards.mjs — turns scratch/unique-cards.json into:
//   1) data/cards-<set>.js skeletons in the REPO: id, type, stats, aspects, arena,
//      neutral trait ids, parsed keywords. NO rules text, NO third-party names.
//   2) scratch/workpackets/<set>.json — per-card packets carrying the original rules
//      text for the manual effects-conversion pass. Scratch only, never committed.
//   3) scratch/trait-map.json — trait slug -> neutral id mapping (repo uses tr-ids).
//   4) data/names-placeholder.js — placeholder display names until the naming pass.
// Cards whose behavior is fully expressed by stats+keywords are marked done:true in
// their packet; everything else needs abilities authored by hand in the data file.
// Usage: node tools/convert-cards.mjs <scratchDir>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRATCH = process.argv[2];
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cards = JSON.parse(readFileSync(join(SCRATCH, 'unique-cards.json'), 'utf8'));
const decks = JSON.parse(readFileSync(join(SCRATCH, 'resolved-decks.json'), 'utf8'));

// ---- traits ---------------------------------------------------------------
const traitSet = new Set();
Object.values(cards).forEach(c => c.traits.forEach(t => traitSet.add(t)));
const traits = [...traitSet].sort();
const traitMap = {};
traits.forEach((t, i) => traitMap[t] = 'tr' + String(i + 1).padStart(2, '0'));
writeFileSync(join(SCRATCH, 'trait-map.json'), JSON.stringify(traitMap, null, 1));

// ---- keyword parsing ------------------------------------------------------
// Match the behavior, not the wording: we only extract the keyword tokens the game
// itself prints in bold; everything else stays in the scratch packet as TODO text.
const KW_NUM = ['Raid', 'Restore', 'Exploit', 'Grit']; // Grit is non-numeric in SWU; kept for safety
const KW_FLAG = ['Sentinel', 'Saboteur', 'Ambush', 'Overwhelm', 'Shielded', 'Grit', 'Hidden', 'Coordinate', 'Piloting'];

function parseKeywords(text) {
  const kws = [];
  let rest = text;
  // Strip reminder parentheticals BEFORE keyword matching — "Sentinel (Units...)"
  // is a bare keyword with reminder text, not an ability sentence.
  rest = rest.replace(/\(([^()]|\([^()]*\))*\)/g, '').replace(/[ \t]+\n/g, '\n');
  for (const k of ['Raid', 'Restore', 'Exploit']) {
    const re = new RegExp(k + '\\s+(\\d+)', 'g');
    rest = rest.replace(re, (m, n) => { kws.push({ k: k.toLowerCase(), n: Number(n) }); return ''; });
  }
  for (const k of KW_FLAG) {
    const re = new RegExp('(^|[^A-Za-z])' + k + '($|[^A-Za-z0-9])');
    if (re.test(rest)) {
      // Only strip a BARE keyword line/token; keyword referenced inside a sentence
      // (e.g. "gains Sentinel") stays TODO for the ability author.
      const bare = new RegExp('(^|\\n)\\s*' + k + '\\s*(?=$|\\n|,)', 'g');
      if (bare.test(rest)) {
        rest = rest.replace(bare, '$1');
        kws.push({ k: k.toLowerCase() });
      }
    }
  }
  // Comma-separated bare keyword lists ("Sentinel, Overwhelm")
  const parts = rest.split('\n').filter(line => {
    const items = line.split(',').map(s => s.trim()).filter(Boolean);
    if (items.length && items.every(i => KW_FLAG.includes(i) || /^(Raid|Restore|Exploit)\s+\d+$/.test(i))) {
      items.forEach(i => {
        const m = i.match(/^(\w+)\s*(\d+)?$/);
        kws.push(m[2] ? { k: m[1].toLowerCase(), n: Number(m[2]) } : { k: m[1].toLowerCase() });
      });
      return false;
    }
    return true;
  });
  return { kws: dedupe(kws), rest: parts.join('\n').trim() };
}
function dedupe(kws) {
  const seen = new Set();
  return kws.filter(k => { const key = k.k + '|' + (k.n || ''); if (seen.has(key)) return false; seen.add(key); return true; });
}

// ---- conversion -----------------------------------------------------------
const bySets = {};
const packets = {};
const placeholderNames = {};

for (const [key, c] of Object.entries(cards)) {
  const set = c.set.toLowerCase();
  const id = set + '-' + String(c.number).padStart(3, '0');
  const type = c.type.toLowerCase();
  const entry = { id, type };
  const packet = { id, type, name: c.name, subtitle: c.subtitle, text: c.text, deployBox: c.deployBox, epicAction: c.epicAction, done: false };

  // 'Colorless' marks a neutral card (no aspect icons) — represented as [].
  entry.aspects = c.aspects.map(a => a.toLowerCase()).filter(a => a !== 'colorless');
  if (c.traits.length) entry.traits = c.traits.map(t => traitMap[t]);
  if (c.unique) entry.unique = true;

  if (type === 'unit') {
    entry.cost = c.cost; entry.power = c.power; entry.hp = c.hp;
    // arenas is usually ["Ground"] but some DB rows store it as a JSON-encoded string
    entry.arena = String(c.arenas[0] || 'Ground').replace(/[^A-Za-z]/g, '').toLowerCase();
    const { kws, rest } = parseKeywords(c.text || '');
    if (kws.length) entry.keywords = kws;
    packet.todoText = rest;
    packet.done = rest === '';
  } else if (type === 'leader') {
    const m = (c.epicAction || '').match(/(\d+)\s+resources/i);
    entry.deployCost = m ? Number(m[1]) : 5;
    const back = parseKeywords(c.deployBox || '');
    entry.leaderSide = { abilities: [] };
    entry.deployedSide = { arena: 'ground', power: c.power, hp: c.hp };
    if (back.kws.length) entry.deployedSide.keywords = back.kws;
    packet.todoText = ('LEADER SIDE:\n' + (c.text || '') + '\nUNIT SIDE:\n' + back.rest).trim();
    packet.done = false; // every leader needs a manual pass
  } else if (type === 'base') {
    entry.hp = c.hp;
    packet.todoText = c.text || '';
    packet.done = !c.text;
  } else if (type === 'event') {
    entry.cost = c.cost;
    packet.todoText = c.text || '';
    packet.done = false; // events are all abilities
  } else if (type === 'upgrade') {
    entry.cost = c.cost;
    if (c.power) entry.power = c.power;
    if (c.hp) entry.hp = c.hp;
    entry.attachTo = 'friendly'; // default; manual pass corrects (some attach to any/enemy)
    const { kws, rest } = parseKeywords(c.text || '');
    if (kws.length) entry.grantKeywords = kws;
    packet.todoText = rest;
    packet.done = rest === '';
  } else {
    packet.todoText = 'UNKNOWN TYPE ' + c.type;
  }

  (bySets[set] = bySets[set] || []).push(entry);
  (packets[set] = packets[set] || []).push(packet);
  placeholderNames[id] = { name: 'P-' + id.toUpperCase() };
}

// ---- emit -----------------------------------------------------------------
mkdirSync(join(root, 'data'), { recursive: true });
mkdirSync(join(SCRATCH, 'workpackets'), { recursive: true });
for (const [set, list] of Object.entries(bySets)) {
  list.sort((a, b) => a.id < b.id ? -1 : 1);
  const body = list.map(e => '  ' + JSON.stringify(e.id) + ': ' + JSON.stringify(e) + ',').join('\n');
  writeFileSync(join(root, 'data', 'cards-' + set + '.js'),
    '// cards-' + set + '.js — GENERATED skeleton (tools/convert-cards.mjs), then hand-edited:\n' +
    '// abilities are authored manually from the scratch workpackets. Regenerating this file\n' +
    '// OVERWRITES hand-authored abilities — only regenerate before the effects pass.\n' +
    '(function (SB) {\n  \'use strict\';\n  Object.assign(SB.cards, {\n' + body + '\n  });\n})(window.SB = window.SB || {});\n');
  writeFileSync(join(SCRATCH, 'workpackets', set + '.json'), JSON.stringify(packets[set], null, 1));
}

// deck registry (neutral ids; leader/base/card refs by internal id)
const deckEntries = Object.entries(decks).map(([deckId, d]) => {
  const ref = c => c.set.toLowerCase() + '-' + String(c.number).padStart(3, '0');
  const cardsFlat = [];
  d.cards.forEach(c => { for (let i = 0; i < c.count; i++) cardsFlat.push(ref(c)); });
  return '  ' + JSON.stringify(deckId) + ': ' + JSON.stringify({ leader: ref(d.leader), base: ref(d.base), cards: cardsFlat }) + ',';
});
writeFileSync(join(root, 'data', 'decks.js'),
  '// decks.js — GENERATED (tools/convert-cards.mjs). The 16 precon decks by internal id.\n' +
  '(function (SB) {\n  \'use strict\';\n  Object.assign(SB.decks, {\n' + deckEntries.join('\n') + '\n  });\n})(window.SB = window.SB || {});\n');

// placeholder names until the naming pass (original codenames, no third-party text)
const nameLines = Object.entries(placeholderNames).map(([id, n]) =>
  '  SB.names.cards[' + JSON.stringify(id) + '] = ' + JSON.stringify(n) + ';').join('\n');
const traitNameLines = Object.values(traitMap).sort().map(t =>
  '  SB.names.traits[' + JSON.stringify(t) + '] = ' + JSON.stringify(t.toUpperCase()) + ';').join('\n');
const deckNameLines = Object.keys(decks).map(d =>
  '  SB.names.decks[' + JSON.stringify(d) + '] = ' + JSON.stringify(d.toUpperCase()) + ';').join('\n');
writeFileSync(join(root, 'data', 'names-placeholder.js'),
  '// names-placeholder.js — GENERATED placeholder display names. Replaced by the theme\n// naming pass; safe to regenerate until then.\n' +
  '(function (SB) {\n  \'use strict\';\n' + nameLines + '\n' + traitNameLines + '\n' + deckNameLines + '\n})(window.SB = window.SB || {});\n');

const todo = Object.values(packets).flat().filter(p => !p.done).length;
console.log('sets:', Object.keys(bySets).map(s => s + '(' + bySets[s].length + ')').join(' '),
  '\ntotal cards:', Object.values(bySets).flat().length, ' packets needing manual effects:', todo);
