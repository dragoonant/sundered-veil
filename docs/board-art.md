# The board

The play surface is **drawn, not photographed**. `js/boardart.js` renders it as an SVG.
There is no board image to regenerate, re-measure, or ship.

## Why it is drawn

It used to be a raster mat (`art/board.png`), de-keystoned from a generated photo of a
card table, with each of the twelve zone rectangles hand-measured off the image and
written into `styles.css`. That arrangement had three problems, all of which the drawn
board removes:

- **The geometry was duplicated.** A painted outline and the DOM hitbox inside it were
  two independent sets of numbers that had to agree. They drifted twice — the bottom row
  sat 2% too high, so cards rode over the lettering, and the resources fan was sized from
  a slot height that had been guessed rather than measured.
- **The board was not in the repo.** `art/` is gitignored, so a fresh clone rendered the
  zones over an empty background, and the mat could not be rebuilt from anything
  committed — the recipe needed a source file that lived on one machine.
- **Board text was pixels.** `DRAW DECK`, `GROUND ARENA` and the rest were baked into the
  image, which put display text outside `names.js` and made it un-themeable.

## How it works

`js/boardart.js` holds **one geometry table** and uses it twice: to draw each painted
slot, and to place the DOM zone onto it. An outline and its hitbox are therefore the same
numbers by construction, and the drift class of bug is gone rather than fixed.

Everything is expressed in a **2048x1280 board space**. That is a coordinate system, not
a resolution — the SVG carries it as a `viewBox` and renders as vectors at whatever size
`#mat` takes, so the same board is sharp on a phone, a laptop and a television. Nothing
in the board pins a pixel size.

### The row mirror

One array (`SLOT`) describes *your* row, left to right:

    base · leader · draw deck · discard pile · resources

The opponent's row is that array reflected about the board's centre line
(`x' = W - x - w`), which yields:

    resources · discard pile · draw deck · leader · base

So each player reads their own row in the same order from their own side of the table.
Reordering or resizing a slot means editing `SLOT` alone; the two rows cannot fall out of
step, because there is only one of them.

### Colour

Your zones are Current-blue, the opponent's Hegemony-red (see `THEME.md`). With the rows
mirrored, that is what tells you whose row you are looking at without reading a label.

The arenas therefore **cannot** use blue or red: they are shared ground that holds both
players' units, and either colour would read as one side's territory. They take a neutral
warm/cool pair instead — ground amber, space violet.

## Arena art

Each arena has an empty `<image>` layer behind its drawn frame, so art drops in without
touching the frame or the geometry:

```js
SB.boardArt.setArenaArt('ground', 'art/arena-ground.jpg');
SB.boardArt.setArenaArt('space', 'art/arena-space.jpg');
```

The image is clipped to the arena's rounded rect and covers it (`xMidYMid slice`), so the
source only needs to be roughly the right shape. `art/` is gitignored, so arena art is a
build product like card art.

`tools/dekeystone.mjs`, `tools/pngpatch.mjs` and `tools/png.mjs` are kept for preparing
that art — they are general-purpose (flatten a perspective photo, clone or smooth-fill a
region, read/write PNG with no dependencies) and no longer specific to the board.

## Changing the layout

Edit the constants at the top of `js/boardart.js`: `MARGIN`, `ROW_Y`, `ROW_H`,
`LABEL_GAP`, the `SLOT` array, and the arena block. Nothing in `styles.css` needs to
change — it styles the board (colours, stroke weights, glow) but owns none of its
geometry.

One thing that *does* need re-deriving if slot sizes change: the resources fan's
`--card-w` and `--row-w` in `styles.css`, which are stated in `cqw` and computed from the
slot's height and width in board units. The comment there shows the arithmetic.
