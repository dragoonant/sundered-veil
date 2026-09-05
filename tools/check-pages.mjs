// check-pages.mjs — what the deployed GitHub Pages site would be missing.
//
// Pages serves the repo root as-is, so the live game has exactly the assets that are
// committed. This lists every asset file index.html's scripts can ask for, says which
// are absent from the working tree and which are present but untracked by git, and
// prints the `git add` that fixes the second. It never generates anything.
//
// Usage: node tools/check-pages.mjs [--verbose]
// Exit 1 if a REQUIRED asset is missing or untracked, so it can gate a commit.
//
// Required = a card image for every card a registered deck can put on the table
// (leader, base, main deck; sideboards are deliberately excluded, the game plays single
// duels and never sideboards), the card back, the arena and slot scenes, the bolt
// sprites, the title art and the two end-of-match clips.
// Optional = sound. js/sound.js degrades to silence for any clip it cannot fetch.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('--verbose');

// ---- load the data files exactly as tests.html does (no fs in the game code) --------
// Only the engine-side files are needed for SB.decks and SB.cards; the script list is
// read out of tests.html so a new set is picked up without editing this file.
const window = {};
window.window = window;
const ctx = vm.createContext({ window, console });
const html = readFileSync(join(root, 'tests.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1])
  .filter(s => /^(js\/(util|data|rules|state|effects|engine|text|ops|ops2|validate)\.js|names\.js|data\/.*\.js)$/.test(s));
for (const s of srcs) vm.runInContext(readFileSync(join(root, s), 'utf8'), ctx, { filename: s });
const SB = window.SB;

// ---- the asset list -----------------------------------------------------------------
const required = new Set(), optional = new Set();
for (const d of Object.values(SB.decks)) {
  required.add('art/' + d.leader + '.webp');
  required.add('art/' + d.base + '.webp');
  for (const c of d.cards || []) required.add('art/' + (c.id || c) + '.webp');
}
for (const c of Object.values(SB.cards)) if (c.token) required.add('art/' + c.id + '.webp'); // tokens enter play from effects
required.add('art/cardback.webp');
required.add('art/title-duel.webp');                       // styles.css title screen
for (const key of ['arena-ground', 'arena-space', 'slot-res', 'slot-disc'])
  for (let n = 1; n <= 5; n++) required.add('art/' + key + '-' + n + '.webp');   // js/boardart.js SCENES
required.add('art/victory.mp4'); required.add('art/defeat.mp4');                      // js/endvideo.js
// js/sound.js: tier music + finales, plus whatever clip names js/anim.js and ui emit.
for (const n of ['music-1', 'music-2', 'music-3', 'end-win', 'end-loss']) optional.add('sfx/' + n + '.mp3');
// Clip names are the keys of the SFX table in tools/gen-sfx.mjs (what js/anim.js asks
// SB.sound.sfx for); read them from there so a new clip is picked up automatically.
const sfxSrc = readFileSync(join(root, 'tools/gen-sfx.mjs'), 'utf8');
const table = sfxSrc.slice(sfxSrc.indexOf('const SFX = {'));
for (const m of table.slice(0, table.indexOf('\n};')).matchAll(/^\s*([a-zA-Z0-9_-]+):/gm)) optional.add('sfx/' + m[1] + '.mp3');
// The board-art scenes also have sprites for melee/impacts: art/fx/<name>.webp from
// tools/gen-fx.mjs, whose table keys are the file names.
const fxSrc = readFileSync(join(root, 'tools/gen-fx.mjs'), 'utf8');
for (const m of fxSrc.matchAll(/^\s*'([a-z-]+)':\s*\[/gm)) required.add('art/fx/' + m[1] + '.webp');

// ---- compare with disk and with git -------------------------------------------------
const tracked = new Set(execFileSync('git', ['ls-files', 'art', 'sfx'], { cwd: root, encoding: 'utf8' })
  .split('\n').filter(Boolean));
const classify = set => {
  const missing = [], untracked = [], ok = [];
  for (const f of [...set].sort()) {
    if (!existsSync(join(root, f))) missing.push(f);
    else if (!tracked.has(f)) untracked.push(f);
    else ok.push(f);
  }
  return { missing, untracked, ok };
};
const R = classify(required), O = classify(optional);

// Card art on disk that no deck uses is fine to ship but worth knowing about.
const onDisk = existsSync(join(root, 'art')) ? readdirSync(join(root, 'art')).filter(f => f.endsWith('.webp')).map(f => 'art/' + f) : [];
const extra = onDisk.filter(f => !required.has(f));

const show = (label, list) => {
  if (!list.length) return;
  console.log(label + ' (' + list.length + ')');
  (VERBOSE ? list : list.slice(0, 12)).forEach(f => console.log('  ' + f));
  if (!VERBOSE && list.length > 12) console.log('  … ' + (list.length - 12) + ' more (--verbose)');
};
console.log('required: ' + R.ok.length + ' tracked, ' + R.untracked.length + ' untracked, ' + R.missing.length + ' missing of ' + required.size);
console.log('optional: ' + O.ok.length + ' tracked, ' + O.untracked.length + ' untracked, ' + O.missing.length + ' missing of ' + optional.size);
show('REQUIRED, missing from disk — generate first', R.missing);
show('REQUIRED, on disk but not committed', R.untracked);
show('optional, missing from disk', O.missing);
show('optional, on disk but not committed', O.untracked);
show('extra card art on disk (no deck uses it; ships anyway)', extra);

const toAdd = [...R.untracked, ...O.untracked];
if (toAdd.length) {
  console.log('\nTo ship them (the .gitignore allowlist admits only delivery formats):');
  console.log('  git add art sfx && git status --short | head');
}
process.exit(R.missing.length || R.untracked.length ? 1 : 0);
