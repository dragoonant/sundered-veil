// dekeystone.mjs — flatten a perspective (keystoned) photo of a flat surface into
// a straight-on rectangle. Written for the board art: Nano Banana renders the play
// surface as if seen from a chair, and the UI needs it square-on so DOM zones can
// sit on the painted slots.
//
// Zero dependencies, like the rest of tools/: PNG in, PNG out, via ./png.mjs.
//
//   node tools/dekeystone.mjs --in board-raw.png --out art/board.png \
//     --tl 152,28 --tr 872,28 --br 1010,530 --bl 14,530 --size 1024x1024
//
// Corners are the source-image pixel coords of the region to flatten, in the order
// top-left, top-right, bottom-right, bottom-left. They map to the four corners of
// the output. --size is the output rectangle (default: square, side = longest edge).
//
//   --probe   print the input's dimensions and exit (use it to pick corners)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { decodePNG, encodePNG } from './png.mjs';

const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const has = n => args.includes(n);

/* ---------- projective transform ---------- */

// Solve the 8-unknown homography taking the four dst corners back to the four src
// corners, so every output pixel can be sampled directly (inverse mapping — no holes).
function homography(dst, src) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = dst[i], [u, v] = src[i];
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v]); b.push(v);
  }
  // Gaussian elimination with partial pivoting.
  for (let col = 0; col < 8; col++) {
    let piv = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]]; [b[col], b[piv]] = [b[piv], b[col]];
    if (Math.abs(A[col][col]) < 1e-12) throw new Error('degenerate corners — are all four distinct?');
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      for (let c = col; c < 8; c++) A[r][c] -= f * A[col][c];
      b[r] -= f * b[col];
    }
  }
  const h = b.map((v, i) => v / A[i][i]);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

function sample(img, x, y, out, o) {
  if (x < 0 || y < 0 || x > img.w - 1 || y > img.h - 1) { out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0; return; }
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, img.w - 1), y1 = Math.min(y0 + 1, img.h - 1);
  const fx = x - x0, fy = y - y0;
  for (let c = 0; c < 4; c++) {
    const p00 = img.rgba[(y0 * img.w + x0) * 4 + c], p10 = img.rgba[(y0 * img.w + x1) * 4 + c];
    const p01 = img.rgba[(y1 * img.w + x0) * 4 + c], p11 = img.rgba[(y1 * img.w + x1) * 4 + c];
    out[o + c] = Math.round(p00 * (1 - fx) * (1 - fy) + p10 * fx * (1 - fy) + p01 * (1 - fx) * fy + p11 * fx * fy);
  }
}

/* ---------- main ---------- */

const inPath = flag('--in');
if (!inPath) { console.error('usage: node tools/dekeystone.mjs --in <src.png> --out <dst.png> --tl x,y --tr x,y --br x,y --bl x,y [--size WxH] [--ss 2]'); process.exit(1); }
const img = decodePNG(readFileSync(inPath));
if (has('--probe')) { console.log(`${inPath}: ${img.w} x ${img.h}`); process.exit(0); }

const pt = n => {
  const v = flag(n);
  if (!v) throw new Error(`missing ${n}`);
  const [x, y] = v.split(',').map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`bad ${n}: ${v}`);
  return [x, y];
};
const src = [pt('--tl'), pt('--tr'), pt('--br'), pt('--bl')];

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
let W, H;
if (flag('--size')) [W, H] = flag('--size').split('x').map(Number);
else { W = H = Math.round(Math.max(dist(src[0], src[1]), dist(src[3], src[2]), dist(src[0], src[3]), dist(src[1], src[2]))); }

// Supersample: the bottom of a keystoned image is stretched, so sampling 2x and
// box-averaging keeps the compressed top edge from aliasing into mush.
const ss = Number(flag('--ss') || 2);
const dst = [[0, 0], [W * ss, 0], [W * ss, H * ss], [0, H * ss]];
const h = homography(dst, src);

const big = Buffer.alloc(W * ss * H * ss * 4);
for (let y = 0; y < H * ss; y++) {
  for (let x = 0; x < W * ss; x++) {
    const w = h[6] * x + h[7] * y + h[8];
    sample(img, (h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w, big, (y * W * ss + x) * 4);
  }
}

const out = Buffer.alloc(W * H * 4);
const n = ss * ss;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const acc = [0, 0, 0, 0];
    for (let dy = 0; dy < ss; dy++) for (let dx = 0; dx < ss; dx++) {
      const o = ((y * ss + dy) * W * ss + (x * ss + dx)) * 4;
      for (let c = 0; c < 4; c++) acc[c] += big[o + c];
    }
    const o = (y * W + x) * 4;
    for (let c = 0; c < 4; c++) out[o + c] = Math.round(acc[c] / n);
  }
}

const outPath = flag('--out') || 'board.png';
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, encodePNG(W, H, out));
console.log(`wrote ${outPath} (${W} x ${H}) from ${inPath} (${img.w} x ${img.h})`);
