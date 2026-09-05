// webp-art.mjs — re-encode art/<id>.png as art/<id>.webp.
//
// The generator hands back PNG, which for these illustrations is ~10x larger than
// a visually identical WebP (a 512x704 card: ~480 KB PNG vs ~55 KB WebP q90).
// art/ is gitignored and regenerated, so this is a lossless-enough one-way step:
// the PNG is removed once its WebP is written, unless --keep is given.
//
// Flags:
//   --quality <n>   WebP quality, default 90 (82 halves the size again)
//   --keep          leave the .png next to the .webp
//   --only <id,..>  exact ids only
//   --force         re-encode even when the .webp already exists
//   --dry-run       report the plan and the projected saving, write nothing
import sharp from 'sharp';
import { readdirSync, statSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const has = n => args.includes(n);

const dir = join(root, flag('--dir') || 'art');
const quality = Number(flag('--quality') || 90);
const only = flag('--only') ? flag('--only').split(',') : null;

const ids = readdirSync(dir).filter(f => f.endsWith('.png')).map(f => f.slice(0, -4))
  .filter(id => !only || only.includes(id));

const mb = n => (n / 1048576).toFixed(1) + ' MB';
let before = 0, after = 0, done = 0, skipped = 0;

for (const id of ids) {
  const src = join(dir, id + '.png');
  const out = join(dir, id + '.webp');
  if (existsSync(out) && !has('--force')) { skipped++; continue; }
  const size = statSync(src).size;
  before += size;
  if (has('--dry-run')) { after += size / 10; done++; continue; }
  const buf = await sharp(src).webp({ quality, effort: 5 }).toBuffer();
  await sharp(buf).toFile(out);
  after += buf.length;
  if (!has('--keep')) unlinkSync(src);
  done++;
  if (done % 50 === 0) console.log(done + '/' + ids.length + '  ' + mb(before) + ' -> ' + mb(after));
}

console.log('converted:', done, 'skipped:', skipped, 'quality:', quality);
console.log(mb(before), '->', mb(after),
  before ? '(' + (100 * after / before).toFixed(0) + '% of the original)' : '');
