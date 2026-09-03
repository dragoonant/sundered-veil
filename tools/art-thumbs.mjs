// art-thumbs.mjs — cheap review copies of generated art, so QC never has to look
// at a full-size render. Writes art/thumbs/<id>.jpg (default 320px wide) and,
// with --sheet <name>, a single contact sheet art/thumbs/sheet-<name>.jpg that
// tiles the given ids 4 across with the id stamped under each tile.
//   node tools/art-thumbs.mjs [--only id,id] [--width 320] [--sheet name] [--force]
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const width = Number(flag('--width') || 320);
const outDir = join(root, 'art', 'thumbs');
mkdirSync(outDir, { recursive: true });

const ids = flag('--only') ? flag('--only').split(',')
  : readdirSync(join(root, 'art')).filter(f => f.endsWith('.png')).map(f => f.slice(0, -4));

const bufs = [];
for (const id of ids) {
  const src = join(root, 'art', id + '.png');
  if (!existsSync(src)) { console.error('missing', id); continue; }
  const out = join(outDir, id + '.jpg');
  if (!args.includes('--force') && existsSync(out) && !flag('--sheet')) continue;
  const b = await sharp(src).resize({ width }).jpeg({ quality: 70 }).toBuffer();
  await sharp(b).toFile(out);
  bufs.push({ id, b });
}
const sheet = flag('--sheet');
if (sheet && bufs.length) {
  const cols = 4, label = 22;
  const metas = await Promise.all(bufs.map(x => sharp(x.b).metadata()));
  const h = Math.max(...metas.map(m => m.height)) + label;
  const rows = Math.ceil(bufs.length / cols);
  const composite = bufs.map((x, i) => ({
    input: x.b, left: (i % cols) * width, top: Math.floor(i / cols) * h }));
  const text = bufs.map((x, i) => ({
    input: Buffer.from(`<svg width="${width}" height="${label}"><text x="4" y="16" font-size="14" font-family="sans-serif" fill="#fff">${x.id}</text></svg>`),
    left: (i % cols) * width, top: Math.floor(i / cols) * h + h - label }));
  await sharp({ create: { width: cols * width, height: rows * h, channels: 3, background: '#222' } })
    .composite([...composite, ...text]).jpeg({ quality: 75 }).toFile(join(outDir, 'sheet-' + sheet + '.jpg'));
  console.log('sheet', sheet, bufs.length, 'tiles');
}
console.log('thumbs', bufs.length);
