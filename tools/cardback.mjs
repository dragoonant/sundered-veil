// Build art/cardback.webp from art-masters/cardback-master.jpg.
//
// The master is a product shot: the card sits on a white ground with rounded
// corners and a drop shadow. The game draws the back with object-fit: cover
// inside a card box that already has its own rounded corners, so the white
// must come out here or it shows as a frame around a shrunken card. Trim the
// white, inset past the rounded corners and shadow, then encode at the same
// 512x704 the card faces use.
//
//   node tools/cardback.mjs
import sharp from 'sharp';

const MASTER = 'art-masters/cardback-master.jpg';
const OUT = 'art/cardback.webp';
const W = 512, H = 704;
const INSET = 0.03; // fraction of the trimmed width shaved off each edge

const trimmed = await sharp(MASTER)
  .trim({ background: '#ffffff', threshold: 40 })
  .toBuffer({ resolveWithObject: true });
const { width, height } = trimmed.info;
const dx = Math.round(width * INSET), dy = Math.round(height * INSET);

await sharp(trimmed.data)
  .extract({ left: dx, top: dy, width: width - 2 * dx, height: height - 2 * dy })
  .resize(W, H, { fit: 'cover', position: 'centre' })
  .webp({ quality: 90 })
  .toFile(OUT);

const img = sharp(OUT);
const { data } = await img.raw().toBuffer({ resolveWithObject: true });
const px = (x, y) => { const i = (y * W + x) * 3; return [data[i], data[i + 1], data[i + 2]]; };
const bright = ([r, g, b]) => r > 200 && g > 200 && b > 200;
const corners = [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]].filter(([x, y]) => bright(px(x, y)));
console.log(`${OUT}: ${W}x${H} from ${width}x${height} trimmed, inset ${dx}x${dy}` +
  (corners.length ? `; WARNING white at corners ${JSON.stringify(corners)}` : '; corners clean'));
