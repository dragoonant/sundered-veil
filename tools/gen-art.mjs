// gen-art.mjs — card art generator. Reads tools/art-prompts.json (id -> subject
// line), combines each subject with the byte-identical STYLE block, and writes
// art/<id>.png at 512x512 via the HF router (nscale / FLUX.1-schnell).
//
// Idempotent: skips existing files. Flags:
//   --dry-run          print the full plan, generate nothing (free)
//   --only <id[,id]>   exact-match ids only
//   --limit <n>        stop after n generations
//   --force            regenerate even if the file exists
// Key resolution: --key flag > HF_TOKEN env > .hf_token file.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const has = n => args.includes(n);

const key = flag('--key') || process.env.HF_TOKEN ||
  readFileSync(join(root, '.hf_token'), 'utf8').trim();

// The STYLE block must stay byte-identical across every prompt — it is what makes
// 400+ generations read as one set (CARD-GAME-LESSONS §5).
const STYLE = 'chibi super-deformed style, big head small body, bold clean outlines, cel shading, vibrant saturated colors, space-opera science fiction setting, used-future technology, blaster rifles, durasteel plating, starships, detailed environment background with depth and atmosphere, cinematic lighting, wordless image, blank unmarked surfaces, no lettering, no signage, no logos, no captions, no symbols, no watermark, no signature, high quality game card illustration';

const promptFile = flag('--prompts') || join(root, 'tools', 'art-prompts.json');
const outDir = join(root, flag('--out') || 'art');
const prompts = JSON.parse(readFileSync(promptFile, 'utf8'));
const only = flag('--only') ? flag('--only').split(',') : null;
const limit = flag('--limit') ? Number(flag('--limit')) : Infinity;

mkdirSync(outDir, { recursive: true });

const plan = [];
for (const [id, subject] of Object.entries(prompts)) {
  if (only && !only.includes(id)) continue; // exact match only — no substrings
  const out = join(outDir, id + '.png');
  if (existsSync(out) && !has('--force')) continue;
  plan.push({ id, subject, out });
}
console.log('plan:', plan.length, 'of', Object.keys(prompts).length, 'cards');
if (has('--dry-run')) {
  plan.forEach(p => console.log(' ', p.id, '—', p.subject));
  process.exit(0);
}

let done = 0, failed = 0;
for (const p of plan) {
  if (done >= limit) break;
  const prompt = p.subject + ', ' + STYLE;
  try {
    const r = await fetch('https://router.huggingface.co/nscale/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'black-forest-labs/FLUX.1-schnell', prompt,
        size: '512x704', response_format: 'b64_json' }),
    });
    if (r.status !== 200) {
      const body = await r.text();
      console.error('FAIL', p.id, r.status, body.slice(0, 160));
      failed++;
      if (r.status === 429) { await new Promise(res => setTimeout(res, 15000)); }
      continue;
    }
    const j = await r.json();
    writeFileSync(p.out, Buffer.from(j.data[0].b64_json, 'base64'));
    done++;
    console.log('ok', p.id, '(' + done + '/' + plan.length + ')');
  } catch (e) {
    console.error('ERR', p.id, e.message);
    failed++;
    await new Promise(res => setTimeout(res, 5000));
  }
}
console.log('done:', done, 'failed:', failed);
process.exit(failed > 0 ? 1 : 0);
