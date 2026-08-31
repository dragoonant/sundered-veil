// pngpatch.mjs — clone one rectangle of a PNG over another, with a feathered edge.
//
// Written to erase the placeholder text Nano Banana baked into the board art
// ("4/6" in the resources slot, "HEALTH: 30" under the base): the live UI draws
// those values now, so the painted ones have to go, and the cleanest source of
// replacement pixels is an empty stretch of the same slot.
//
//   node tools/pngpatch.mjs --in art/board.png --out art/board.png \
//     --copy sx,sy,w,h,dx,dy [--copy ...] [--feather 8]
//     --smooth x,y,w,h [--smooth ...]
//
// --copy: sx,sy is the top-left of the patch to copy FROM; dx,dy where it lands.
// Use it where the background around the text is flat.
//
// --smooth: no source rect at all — the region is refilled by interpolating inward
// from its own four borders. Use it where the background is a gradient, which a
// copied block cannot match: the copy lands at the wrong brightness and the seam
// reads as a pasted rectangle.
//
// Both apply in order, each reading the already-patched image.
import { readFileSync, writeFileSync } from 'node:fs';
import { decodePNG, encodePNG } from './png.mjs';

const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };

const inPath = flag('--in');
const outPath = flag('--out');
const ops = args.reduce((acc, a, i) =>
  (a === '--copy' || a === '--smooth' ? acc.concat([{ op: a, spec: args[i + 1] }]) : acc), []);
if (!inPath || !outPath || !ops.length) {
  console.error('usage: node tools/pngpatch.mjs --in <src.png> --out <dst.png> [--copy sx,sy,w,h,dx,dy] [--smooth x,y,w,h] [--feather n]');
  process.exit(1);
}
const feather = Number(flag('--feather') || 8);

const img = decodePNG(readFileSync(inPath));
const px = img.rgba;
const at = (x, y) => (y * img.w + x) * 4;

function copyRect(spec) {
  const [sx, sy, w, h, dx, dy] = spec.split(',').map(Number);
  if ([sx, sy, w, h, dx, dy].some(v => !Number.isFinite(v))) throw new Error(`bad --copy ${spec}`);

  // Snapshot the source first: a copy whose source and destination overlap would
  // otherwise read pixels it has already overwritten.
  const src = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) px.copy(src, y * w * 4, at(sx, sy + y), at(sx + w, sy + y));

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tx = dx + x, ty = dy + y;
      if (tx < 0 || ty < 0 || tx >= img.w || ty >= img.h) continue;
      // Feather: full strength in the middle, fading to nothing at the patch border,
      // so the seam does not read as a rectangle pasted onto the art.
      const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
      const a = feather > 0 ? Math.min(1, edge / feather) : 1;
      const s = (y * w + x) * 4, d = at(tx, ty);
      for (let c = 0; c < 3; c++) px[d + c] = Math.round(px[d + c] * (1 - a) + src[s + c] * a);
    }
  }
}

function smoothRect(spec) {
  const [x0, y0, w, h] = spec.split(',').map(Number);
  if ([x0, y0, w, h].some(v => !Number.isFinite(v))) throw new Error(`bad --smooth ${spec}`);

  // Read the ring of pixels just outside the region, then fill each interior pixel by
  // blending its row's two neighbours and its column's two neighbours, weighted by how
  // near each is. Distance weighting is what keeps a gradient a gradient: a pixel one
  // step in from the left border comes out almost exactly its left neighbour's color.
  const L = [], R = [], T = [], B = [];
  for (let y = 0; y < h; y++) {
    L.push(at(Math.max(0, x0 - 1), y0 + y));
    R.push(at(Math.min(img.w - 1, x0 + w), y0 + y));
  }
  for (let x = 0; x < w; x++) {
    T.push(at(x0 + x, Math.max(0, y0 - 1)));
    B.push(at(x0 + x, Math.min(img.h - 1, y0 + h)));
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const wl = 1 / (x + 1), wr = 1 / (w - x), wt = 1 / (y + 1), wb = 1 / (h - y);
      const tot = wl + wr + wt + wb;
      const d = at(x0 + x, y0 + y);
      for (let c = 0; c < 3; c++) {
        px[d + c] = Math.round(
          (px[L[y] + c] * wl + px[R[y] + c] * wr + px[T[x] + c] * wt + px[B[x] + c] * wb) / tot);
      }
    }
  }
}

for (const { op, spec } of ops) (op === '--copy' ? copyRect : smoothRect)(spec);

writeFileSync(outPath, encodePNG(img.w, img.h, px));
console.log(`wrote ${outPath} (${img.w} x ${img.h}) — ${ops.length} patch(es)`);
