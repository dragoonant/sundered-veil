// run-tests.mjs — headless test runner. Parses the <script src> tags out of
// tests.html (ONE script list, no drift) and runs them under node:vm with a bare
// window shim. Usage: node tools/run-tests.mjs [--quiet] [--filter <substr>]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const quiet = args.includes('--quiet');
const fi = args.indexOf('--filter');
const filter = fi >= 0 ? args[fi + 1] : null;

const html = readFileSync(join(root, 'tests.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
if (srcs.length === 0) { console.error('no scripts parsed from tests.html'); process.exit(2); }

const window = {};
window.window = window;
const context = vm.createContext({ window, console, SB: undefined });
for (const src of srcs) {
  const code = readFileSync(join(root, src), 'utf8');
  try {
    vm.runInContext(code, context, { filename: src });
  } catch (e) {
    console.error(`load error in ${src}: ${e.stack}`);
    process.exit(2);
  }
}
const SB = window.SB;
try {
  SB.validateContent();
} catch (e) {
  console.error('content validation failed: ' + e.stack);
  process.exit(2);
}
if (quiet) {
  SB.test.report = (status, msg) => { if (status !== 'ok' || /passed/.test(msg)) console.log(`[${status}] ${msg}`); };
}
const res = SB.test.run({ quiet, filter });
process.exit(res.fail ? 1 : 0);
