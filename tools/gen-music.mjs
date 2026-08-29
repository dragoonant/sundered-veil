// gen-music.mjs — adaptive background-music generator (ElevenLabs Music API).
// Produces the tiered score js/sound.js crossfades between as base HP drops,
// plus the two game-over finales:
//   sfx/music-1.mp3  full-life tier (stately, restrained)
//   sfx/music-2.mp3  20-HP tier (urgent)
//   sfx/music-3.mp3  10-HP tier (frenzied duel)
//   sfx/end-win.mp3  triumphant major-key finale
//   sfx/end-loss.mp3 somber minor-key finale
// All five prompts share one verbatim musical brief (same key, motif, and
// orchestra) so the tiers read as one piece growing more intense, not three
// different songs. Idempotent per file; flags: --dry-run, --only <id[,id]>, --force.
// Key resolution: --key flag > ELEVENLABS_KEY env > .elevenlabs_key file.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const has = n => args.includes(n);
const key = flag('--key') || process.env.ELEVENLABS_KEY ||
  readFileSync(join(root, '.elevenlabs_key'), 'utf8').trim();

// The shared brief — byte-identical across all five prompts (same trick as the
// art style block): one motif, one key, one orchestra.
const BRIEF = 'cinematic orchestral duel score in D minor built on a four-note rising string ostinato motif (D-F-A-C), full symphony orchestra with taiko-like percussion, urgent low brass, and a dramatic choir chanting invented syllables, dark heroic sci-fi fantasy tone, instrumental only, no fade-out ending';

const TRACKS = {
  'music-1': ['Epic ' + BRIEF + ', moderate stately tempo around 110 BPM, the ostinato carried quietly by cellos with restrained percussion and distant choir, confident and ominous but held back, composed to loop seamlessly with the final bar flowing straight back into the first', 90000],
  'music-2': ['Epic ' + BRIEF + ', driving tempo around 135 BPM, the same ostinato now doubled by violas and violins with insistent percussion, brass stabs and fuller choir, urgent and escalating, composed to loop seamlessly with the final bar flowing straight back into the first', 90000],
  'music-3': ['Epic ' + BRIEF + ', relentless frenzied tempo around 160 BPM, the same ostinato hammered by the full string section with thunderous double-time percussion, screaming brass and full choir at maximum intensity, a desperate climactic duel, composed to loop seamlessly with the final bar flowing straight back into the first', 90000],
  'end-win': ['Concluding finale of an epic ' + BRIEF.replace(', no fade-out ending', '') + ': the ostinato rises through one last accelerating build into a triumphant D MAJOR resolution, victorious fanfare brass and jubilant choir, ending on a held glorious major chord with a cymbal crash, about ten seconds, a definitive victorious ending', 12000],
  'end-loss': ['Concluding finale of an epic ' + BRIEF.replace(', no fade-out ending', '') + ': the ostinato collapses through one last faltering build into a grave D MINOR resolution, low mournful brass and fading sorrowful choir, ending on a dark held minor chord that decays into stillness, about ten seconds, a definitive tragic ending', 12000],
};

const only = flag('--only') ? flag('--only').split(',') : null;
const plan = Object.entries(TRACKS).filter(([id]) => {
  if (only && !only.includes(id)) return false;
  return has('--force') || !existsSync(join(root, 'sfx', id + '.mp3'));
});
console.log('plan:', plan.map(p => p[0]).join(', ') || '(nothing — use --force to regenerate)');
if (has('--dry-run')) { plan.forEach(([id, [p]]) => console.log('\n' + id + ':\n  ' + p)); process.exit(0); }

let failed = 0;
for (const [id, [prompt, ms]] of plan) {
  try {
    const r = await fetch('https://api.elevenlabs.io/v1/music', {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt, music_length_ms: ms }),
    });
    if (r.status !== 200) {
      console.error('FAIL', id, r.status, (await r.text()).slice(0, 200));
      failed++;
      continue;
    }
    writeFileSync(join(root, 'sfx', id + '.mp3'), Buffer.from(await r.arrayBuffer()));
    console.log('ok', id);
  } catch (e) { console.error('ERR', id, e.message); failed++; }
}
process.exit(failed ? 1 : 0);
