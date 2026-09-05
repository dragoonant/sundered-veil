// pull-upgrade-stats.mjs — fills in the power/hp bonus of upgrade cards.
//
// Neither card database we pull from (swu-db, dotgg) records an upgrade's printed
// stat bonus; the official card API does, as upgradePower / upgradeHp. This reads
// those two numbers for every Standard upgrade in the given sets and inserts
// "power"/"hp" into any data/cards-<set>.js line that has neither. Existing values
// are never touched. Only the two numbers are taken from the API; no text, no names.
//   node tools/pull-upgrade-stats.mjs [set ...]      (default: every data/cards-*.js)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://admin.starwarsunlimited.com/api/card-list';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0';
const sets = process.argv.slice(2).length ? process.argv.slice(2)
  : readdirSync(join(root, 'data')).filter(f => /^cards-[a-z0-9]+\.js$/.test(f)).map(f => f.slice(6, -3));

let changed = 0, seen = 0;
for (const set of sets) {
  const file = join(root, 'data', 'cards-' + set + '.js');
  let src = readFileSync(file, 'utf8');
  if (!/"type":"upgrade"/.test(src)) continue;
  const stats = {};
  for (let page = 1; ; page++) {
    const url = API + '?locale=en&pagination[pageSize]=100&pagination[page]=' + page +
      '&filters[expansion][code][$eq]=' + set.toUpperCase() + '&filters[type][value][$eq]=Upgrade';
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!r.ok) { console.error(set, 'HTTP', r.status); process.exit(2); }
    const j = await r.json();
    for (const c of j.data) {
      const a = c.attributes;
      if (a.variantOf && a.variantOf.data) continue;
      stats[set + '-' + String(a.cardNumber).padStart(3, '0')] = [a.upgradePower || 0, a.upgradeHp || 0];
    }
    if (page >= j.meta.pagination.pageCount) break;
  }
  src = src.replace(/^(\s*"([a-z0-9]+-\d{3})":\s*\{[^\n]*"type":"upgrade"[^\n]*)$/gm, (line, _, id) => {
    seen++;
    if (!(id in stats) || /"power"|"hp"/.test(line)) return line;
    const [p, h] = stats[id];
    if (!p && !h) return line;
    changed++;
    return line.replace(/("cost":-?\d+)/, '$1,"power":' + p + ',"hp":' + h);
  });
  writeFileSync(file, src);
  console.log(set, Object.keys(stats).length, 'upgrades from API');
}
console.log('upgrade lines seen:', seen, 'patched:', changed);
