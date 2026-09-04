// shrink-video.mjs — re-encode the end-of-match clips (art/victory.mp4,
// art/defeat.mp4) for delivery.
//
// They arrive from the generator at ~4-5 Mbps for 720p24, which is several times
// what this footage needs. H.264 CRF 25 with faststart is visually indistinguishable
// at roughly half the bytes, and every browser plays it without a fallback source.
//
// The originals are NOT regenerable by anything in tools/, so the first run copies
// each one to art-masters/<name>-master.mp4 (gitignored, never deployed) before
// overwriting. Re-run with --from-master to try another quality against the original
// rather than compounding a lossy re-encode.
//
// Flags:
//   --crf <n>       H.264 quality, default 25 (higher = smaller; 27 is still clean)
//   --audio <rate>  AAC bitrate, default 96k
//   --from-master   encode from art-masters/, not from what is in art/
//   --only <name>   just 'victory' or 'defeat'
//   --dry-run       print what would happen
import ffmpeg from 'ffmpeg-static';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const has = n => args.includes(n);

const crf = flag('--crf') || '25';
const audio = flag('--audio') || '96k';
const only = flag('--only');
const names = ['victory', 'defeat'].filter(n => !only || n === only);
const mb = n => (n / 1048576).toFixed(2) + ' MB';

mkdirSync(join(root, 'art-masters'), { recursive: true });
let before = 0, after = 0;

for (const name of names) {
  const live = join(root, 'art', name + '.mp4');
  const master = join(root, 'art-masters', name + '-master.mp4');
  if (!existsSync(live) && !existsSync(master)) { console.error('missing', name); continue; }
  // Keep one pristine copy: a second pass must never re-encode a re-encode.
  if (!existsSync(master)) copyFileSync(live, master);
  const src = has('--from-master') || !existsSync(live) ? master : live;
  const size = statSync(src).size;
  before += size;
  const tmp = join(root, 'art', name + '.tmp.mp4');
  console.log(name + ': ' + mb(size) + ' from ' + (src === master ? 'master' : 'art/'));
  if (has('--dry-run')) continue;
  execFileSync(ffmpeg, ['-y', '-v', 'error', '-i', src,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', audio, '-movflags', '+faststart', tmp], { stdio: 'inherit' });
  copyFileSync(tmp, live);
  execFileSync(process.execPath, ['-e', 'require("fs").unlinkSync(process.argv[1])', tmp]);
  after += statSync(live).size;
  console.log('  -> ' + mb(statSync(live).size) + '  (crf ' + crf + ')');
}
if (!has('--dry-run')) {
  console.log('total', mb(before), '->', mb(after),
    before ? '(' + (100 * after / before).toFixed(0) + '%)' : '');
}
