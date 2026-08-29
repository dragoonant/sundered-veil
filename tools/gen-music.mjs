// gen-music.mjs — background battle-music generator (ElevenLabs Music API).
// Produces sfx/music.mp3: an original epic orchestral duel track that js/sound.js
// loops during play. Idempotent (skips if the file exists). Flags: --force.
// Key resolution: --key flag > ELEVENLABS_KEY env > .elevenlabs_key file.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const key = flag('--key') || process.env.ELEVENLABS_KEY ||
  readFileSync(join(root, '.elevenlabs_key'), 'utf8').trim();

const out = join(root, 'sfx', 'music.mp3');
if (existsSync(out) && !args.includes('--force')) {
  console.log('sfx/music.mp3 exists — use --force to regenerate');
  process.exit(0);
}

// Original composition brief: high-energy orchestral duel scoring (no reference
// to any existing piece).
const PROMPT = 'Epic cinematic orchestral battle music for a fateful sword duel: driving aggressive string ostinato, thunderous taiko-like percussion, urgent brass stabs, soaring dramatic choir chanting invented syllables, relentless fast tempo, heroic and dark themes clashing, climactic and intense throughout, designed to loop seamlessly, instrumental only';

const r = await fetch('https://api.elevenlabs.io/v1/music', {
  method: 'POST',
  headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: PROMPT, music_length_ms: 120000 }),
});
if (r.status !== 200) {
  console.error('FAIL', r.status, (await r.text()).slice(0, 300));
  process.exit(1);
}
writeFileSync(out, Buffer.from(await r.arrayBuffer()));
console.log('ok sfx/music.mp3');
