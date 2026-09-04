// gen-fx.mjs — battle-effect sprite generator (laser bolts, impact burst, slash).
// Same router/model/key resolution as gen-art.mjs. Each sprite is asked for on a
// PURE BLACK background and then turned into a transparent WebP by treating the
// brightest channel as alpha (black -> clear, glow -> opaque), which is exactly
// right for additive light effects. Output: art/fx/<id>.webp. Idempotent: skips
// existing files. Flags: --dry-run, --only <id[,id]> (exact), --force.
// Key resolution: --key flag > HF_TOKEN env > .hf_token file.
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const has = n => args.includes(n);
const key = flag('--key') || process.env.HF_TOKEN ||
  readFileSync(join(root, '.hf_token'), 'utf8').trim();

const STYLE = 'isolated on a pure solid black background, nothing else in frame, centered, glowing energy with a white-hot core and soft bloom, crisp, high contrast, wordless, no text, no watermark, game visual effect sprite';

// id -> [subject, kind]. Bolts are generated square and cropped to the middle band
// so the router never sees an unusual aspect ratio.
const SPRITES = {
  'bolt-red':  ['a single horizontal elongated red laser blaster bolt streak, bright crimson energy with white-hot center, thin and long, pointing right', 'bolt'],
  'bolt-blue': ['a single horizontal elongated blue-green laser blaster bolt streak, bright teal energy with white-hot center, thin and long, pointing right', 'bolt'],
  'bolt-gold': ['a single horizontal elongated pale gold laser blaster bolt streak, bright yellow-white energy with white-hot center, thin and long, pointing right', 'bolt'],
  'burst':     ['a bright explosive energy impact burst, radial flash with flying orange and white sparks and small debris, round overall shape', 'square'],
  'slash':     ['two crossed glowing diagonal energy slash marks forming an X, bright cyan-white blades with sparks flying off the edges', 'square'],
  'shatter':   ['a dim ring of grey smoke and small scattered glowing embers drifting outward, soft, round overall shape', 'square'],
};

const outDir = join(root, 'art', 'fx');
mkdirSync(outDir, { recursive: true });
const only = flag('--only') ? flag('--only').split(',') : null;
const plan = Object.entries(SPRITES).filter(([id]) => {
  if (only && !only.includes(id)) return false;
  return has('--force') || !existsSync(join(outDir, id + '.webp'));
});
console.log('plan:', plan.map(p => p[0]).join(', ') || '(nothing)');
if (has('--dry-run')) { plan.forEach(([id, [s]]) => console.log(' ', id, '—', s)); process.exit(0); }

// Brightest channel becomes alpha; colour is un-premultiplied so thin glow edges
// keep their hue instead of fading to grey.
async function blackToAlpha(png, kind) {
  let img = sharp(png).removeAlpha();
  if (kind === 'bolt') img = img.extract({ left: 0, top: 176, width: 512, height: 160 });
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    let a = Math.max(r, g, b);
    if (a < 18) a = 0;                          // kill the router's near-black noise
    const k = a ? 255 / a : 0;
    out[j] = Math.min(255, r * k); out[j + 1] = Math.min(255, g * k); out[j + 2] = Math.min(255, b * k);
    out[j + 3] = a;
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .webp({ quality: 90, effort: 5 }).toBuffer();
}

let failed = 0;
for (const [id, [subject, kind]] of plan) {
  try {
    const r = await fetch('https://router.huggingface.co/nscale/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'black-forest-labs/FLUX.1-schnell', prompt: subject + ', ' + STYLE,
        size: '512x512', response_format: 'b64_json' }),
    });
    if (r.status !== 200) { console.error('FAIL', id, r.status, (await r.text()).slice(0, 160)); failed++; continue; }
    const j = await r.json();
    const buf = await blackToAlpha(Buffer.from(j.data[0].b64_json, 'base64'), kind);
    await sharp(buf).toFile(join(outDir, id + '.webp'));
    console.log('ok', id);
  } catch (e) { console.error('ERR', id, e.message); failed++; }
}
process.exit(failed ? 1 : 0);
