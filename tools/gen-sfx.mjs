// gen-sfx.mjs — sound-effect generator (ElevenLabs sound-generation API).
// One clip per structured-log sound tag (js/sound.js plays them). Idempotent:
// skips existing files. Flags: --dry-run, --only <id[,id]> (exact), --force.
// Key resolution: --key flag > ELEVENLABS_KEY env > .elevenlabs_key file.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const has = n => args.includes(n);
const key = flag('--key') || process.env.ELEVENLABS_KEY ||
  readFileSync(join(root, '.elevenlabs_key'), 'utf8').trim();

// SFX models do ambience and effects, not music (CARD-GAME-LESSONS §5).
const SFX = {
  play:    ['soft sci-fi holographic card materialize whoosh, short, clean', 0.8],
  attack:  ['aggressive sci-fi engine lunge whoosh with metallic edge, short', 0.8],
  hit:     ['punchy sci-fi energy impact thud, arcade game hit, very short', 0.6],
  destroy: ['small sci-fi explosion with metallic debris, short game sound', 1.0],
  shield:  ['crystalline energy shield shimmer pop, bright, very short', 0.6],
  heal:    ['warm ascending healing chime sparkle, gentle, short', 0.8],
  buff:    ['rising power-up synth glimmer, positive, very short', 0.6],
  claim:   ['decisive metallic token clack with low sub thump, very short', 0.6],
  deploy:  ['heavy heroic mechanical deployment slam with steam hiss, short', 1.0],
  discard: ['quick paper-card flick with airy whoosh, very short', 0.5],
  draw:    ['soft quick card slide draw, very short', 0.5],
  capture: ['energy net snare with descending hum lock, short', 0.9],
  ability: ['activating console beep sequence with soft synth swell, very short', 0.7],
  ambience: ['distant starship interior hum with faint engine rumble, seamless ambient loop', 10.0],
};

mkdirSync(join(root, 'sfx'), { recursive: true });
const only = flag('--only') ? flag('--only').split(',') : null;
const plan = Object.entries(SFX).filter(([id]) => {
  if (only && !only.includes(id)) return false;
  return has('--force') || !existsSync(join(root, 'sfx', id + '.mp3'));
});
console.log('plan:', plan.map(p => p[0]).join(', ') || '(nothing)');
if (has('--dry-run')) process.exit(0);

let failed = 0;
for (const [id, [text, dur]] of plan) {
  try {
    const r = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, duration_seconds: dur }),
    });
    if (r.status !== 200) {
      console.error('FAIL', id, r.status, (await r.text()).slice(0, 160));
      failed++;
      continue;
    }
    writeFileSync(join(root, 'sfx', id + '.mp3'), Buffer.from(await r.arrayBuffer()));
    console.log('ok', id);
  } catch (e) { console.error('ERR', id, e.message); failed++; }
}
process.exit(failed ? 1 : 0);
