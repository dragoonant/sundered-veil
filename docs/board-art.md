# Regenerating the board mat (`art/board.png`)

`art/` is gitignored, so the mat is a build product like every other asset: the
generated source lives at `art/gameboard.png` and these two commands turn it into the
file `styles.css` loads. Run both, in order, after any change to the source art.

## 1. Flatten the perspective

The generator renders the play surface in perspective — as if photographed from a
chair. The UI cannot use that: every DOM zone would need its own skew to sit on its
painted slot, and a card dropped into an arena would not match the box it landed in.
`tools/dekeystone.mjs` solves the projective transform taking the four corners of the
play surface to the four corners of a rectangle, and resamples through it.

```bash
node tools/dekeystone.mjs --in art/gameboard.png --out art/board.png --tl 378,22 --tr 2466,20 --br 2714,1476 --bl 78,1476 --size 2048x1280
```

The four corners are the **inner** edge of the glowing gold frame, in source pixels,
clockwise from top-left. Re-measure them if the art is regenerated — `--probe` prints
the input's dimensions, and passing an axis-aligned rectangle as the four corners is a
usable way to crop a region out for a closer look.

`--size 2048x1280` is a judgement call, not a measurement. The surface is foreshortened,
so its true proportions are not recoverable from one view; 16:10 is the average of the
flattened edge lengths and it keeps the two arenas square-ish. **The board is not a
literal 1:1 square** — forcing that would stretch everything vertically by 60%.

## 2. Erase the baked-in placeholder text

The generator painted sample values into two slots — `4/6` in the player's resources and
`HEALTH: 30` under the player's base. The live UI draws those numbers now, so the
painted ones have to go or the mat shows a permanently stale value underneath.

```bash
node tools/pngpatch.mjs --in art/board.png --out art/board.png --feather 6 --copy 58,1092,206,54,58,1196 --smooth 1632,1128,126,74
```

`--copy` clones a clean stretch of the same slot over the text; `--smooth` refills the
region by interpolating in from its own borders. The base slot takes a copy because its
background is flat there. The resources slot takes a smooth fill because its background
is a left-to-right gradient — a copied block lands at the wrong brightness and the seam
reads as a pasted rectangle.

## Known limitation

The bottom row of slots (base / leader / draw deck / discard / resources) is clipped by
the source image's own bottom edge: the generator cut those boxes off. The zones are
laid out to run to the mat's bottom edge, which reads as "tall slots" rather than as
damage, but the outlines genuinely have no bottom. Fixing it means regenerating the art
with headroom below the near edge, not patching the PNG.

## Zone coordinates

`styles.css` positions each `.mat-zone` as a percentage of the mat, measured off the
flattened image. If step 1's `--size` or corners change, every one of those percentages
has to be re-measured against the new file.
