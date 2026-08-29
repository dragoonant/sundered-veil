# Card Presentation & Interaction Spec

A transferable, implementation-ready spec for how cards should **look** and **behave**, derived
from a shipped browser card game. Copy this into the new project. It assumes plain DOM + CSS with
no framework, but every technique translates.

Companion: `CARD-GAME-LESSONS.md` (architecture, engine, AI, pipelines).

---

## 0. The five principles

1. **Art is the card.** The illustration covers the entire card face edge to edge. There is no
   art window, no frame inset, no separate text box.
2. **Text floats on the art.** No opaque or translucent text plate. Legibility comes from a
   gradient scrim on only the bands that carry text, plus multi-stop text shadows.
3. **The small card shows identity; the big view shows everything.** Name, cost, level, stats and
   keyword *names* on the face. Full rules text, keyword *explanations*, tokens created, and the
   linked pilot only in the enlarged view.
4. **One renderer, three sizes.** The same function draws hand, board, and preview. Size is a
   parameter, all typography is in `em`, and the only content difference is a detail block that
   renders at preview size only.
5. **Tap inspects, drag commits.** Tapping a card never changes game state.

---

## 1. DOM structure

Exactly three stacked layers plus absolutely positioned badges. Build this in one `render()`
function that takes `(state, instanceOrDef, {size})`.

```
div.card .card-{board|hand|preview} .color-{faction}
        [data-iid] [data-def-id]                  position: relative
├── div.card-art                                  z-index 0   position:absolute; inset:0
│   ├── img.art.art-painted   (or svg.art)
│   └── ::after   ← the scrim                     z-index 1   pointer-events:none
├── div.card-corners                              z-index 3   absolute, top row
│   ├── span.pip.lv                                            (level / rarity)
│   └── span.pip.cost                                          (cost)
├── div.card-plate                                z-index 2   in flow, margin-top:auto
│   ├── div.card-name
│   ├── div.card-type   → span.type-tag + span.traits
│   ├── div.card-kw     ← keyword NAMES only, joined "  ·  "
│   ├── div.card-detail ← PREVIEW SIZE ONLY
│   │     div.ability   → span.trigger + span.ability-text
│   │     div.link-req[.active] → span.trigger + span.ability-text
│   └── div.card-stats  → span.stat.ap + span.stat.hp[.damaged]
├── div.pilot-badge[.linked]                      z-index 3
└── div.damage-marker                             z-index 3
```

Why this ordering works: the card is `display:flex; flex-direction:column; justify-content:flex-end`.
The art is absolutely positioned so it fills the card and takes no flow space; the text plate is
**in flow with `margin-top:auto`**, so it hugs the bottom and grows upward as text gets longer,
without any absolute positioning math.

Variants: `div.card.card-back > div.back-mark` for face-down; `div.card.card-missing` for an
instance that no longer exists (defensive — render something rather than throw).

A separate `decorate()` step adds state-dependent classes (`.is-rested`), the pilot badge, and the
damage marker by reading the live instance. Keep it separate from `render()` so the same renderer
serves a hypothetical/scratch card (see §7) with no state.

---

## 2. Sizing and aspect ratio

Define size as CSS custom properties on `:root` so responsive breakpoints override one place.

```css
:root {
  --card-board-w:   6.6rem;
  --card-hand-w:    8rem;
  --card-preview-w: 19rem;
  --res-card-w:     2.1rem;   /* the tiny ~34px face */
}
.card-board   { width: var(--card-board-w);   aspect-ratio: 5 / 7; }
.card-hand    { width: var(--card-hand-w);    aspect-ratio: 5 / 7; }
.card-preview { width: var(--card-preview-w); min-height: 26rem; } /* NO aspect-ratio */
```

**The preview must not have a fixed aspect ratio.** It carries variable-length rules text and has
to grow. Give it a `min-height` instead so short cards don't look stunted.

Other contexts, all reusing the same renderer:
- **Builder grid**: render at `hand` size in
  `grid-template-columns: repeat(auto-fill, minmax(var(--card-hand-w), 1fr))`. Mark owned copies
  with `outline: 2px solid var(--accent); outline-offset: 2px` — outline, not border, so it doesn't
  shift layout.
- **Side panels in the preview** (pilot, tokens): `width: 13rem; min-height: 0`.
- **Modal choice prompts**: `width: calc(var(--card-board-w) * 1.55)`, bumped to `1.9` on narrow.
- **Resource/tiny chips**: `width: var(--res-card-w); height: auto; aspect-ratio: 5/7`.

---

## 3. Art covering the card

```css
.card-art { position: absolute; inset: 0; z-index: 0; }
.card-art .art { width: 100%; height: 100%; display: block; }
.card-art .art-painted { object-fit: cover; object-position: 50% 25%; }
```

- Generate art at the card aspect ratio (768×1088 for 5:7). One size, no `srcset` — a card is
  never large enough to need art direction.
- **`object-position: 50% 25%` is not cosmetic.** Generative art reliably fills more of the frame
  than the prompt asks for, pushing the subject's head toward the top edge. Biasing the crop
  upward keeps faces in frame when the bottom is covered by the text plate. Tune this once,
  globally, after you have ~20 real images.
- **Always ship a procedural fallback.** A deterministic SVG generator seeded from the card id
  means a half-generated art folder still plays, and every card looks consistent across runs but
  distinct from its neighbors. On image load failure, swap the SVG in via
  `closest('[data-def-id]')`.

---

## 4. The scrim — legibility without a text box

**Do not use an opaque or translucent plate behind text.** It costs you the art you paid to
generate. Instead, put a two-gradient pseudo-element between the art and the text, darkening only
the bands that actually carry text.

```css
.card-art::after {
  content: ''; position: absolute; inset: 0; z-index: 1;
  pointer-events: none;                       /* CRITICAL — see §9 */
  background:
    /* bottom band: name, type, keywords, stats */
    linear-gradient(to top,
      rgba(5,8,14,.94) 0%,  rgba(5,8,14,.86) 12%,
      rgba(5,8,14,.55) 26%, rgba(5,8,14,0)   44%),
    /* top band: level and cost pips */
    linear-gradient(to bottom,
      rgba(5,8,14,.80) 0%,  rgba(5,8,14,.45) 8%,
      rgba(5,8,14,0)   17%);
}
/* the preview's rules text runs higher, so its bands are taller */
.card-preview .card-art::after {
  background:
    linear-gradient(to top,
      rgba(5,8,14,.94) 0%,  rgba(5,8,14,.88) 22%,
      rgba(5,8,14,.60) 38%, rgba(5,8,14,0)   56%),
    linear-gradient(to bottom,
      rgba(5,8,14,.78) 0%,  rgba(5,8,14,.42) 6%,
      rgba(5,8,14,0)   14%);
}
```

**These numbers were derived by measurement, not taste.** Sample the mean luminance of the actual
pixel bands behind the text across your whole card set. In the source project, 47 of 169 cards
were brighter than luma 140 in the bottom third, and 55 had near-white top corners exactly where
the cost and level pips sit. A single flat overlay lost text on about a quarter of the set.
**Do this sampling pass once your art exists** — it turns an endless opinion argument into a number.

Rule to adopt: *if a background starts fighting its cards, raise the scrim — never lighten the art.*

---

## 5. Text plate — shadow only, zero background

```css
.card-plate {
  position: relative; z-index: 2; margin-top: auto;
  padding: .3rem .38rem .32rem;
  text-shadow:
    0 1px 2px  rgba(0,0,0,.95),   /* tight edge: separates glyph from art */
    0 0 4px    rgba(0,0,0,.9),
    0 0 10px   rgba(0,0,0,.8),
    0 0 18px   rgba(0,0,0,.6);    /* wide halo: knocks back bright art */
}
.card-preview .card-plate { padding: .6rem .75rem .65rem; }
```

Four stops, tight to wide. The tight ones give hard glyph separation; the wide ones create a soft
local darkening that follows the text instead of a rectangle. This costs zero opacity of the art,
which is the whole point.

**Corner pips get a heavier shadow than body text**, because they sit on raw art with no plate and
no surrounding context to disambiguate a misread number:

```css
.pip {
  min-width: 1.2rem; text-align: center; font-size: .72em; font-weight: 700;
  border-radius: 4px; padding: .08rem .25rem;
  text-shadow: 0 1px 2px rgba(0,0,0,.95), 0 0 4px rgba(0,0,0,.9), 0 0 9px rgba(0,0,0,.75);
}
.pip.lv   { color: #cfe0ff; }
.pip.cost { color: #ffd9a0; }
.card-preview .pip { font-size: .85em; }
```

---

## 6. Typography, color coding, state

**All font sizes in `em`** so the whole card scales with its container width. Only the preview
overrides in `rem` where an absolute size is wanted.

| Element | small | preview | color |
|---|---|---|---|
| `.card-name` | `.74em` / 700 / lh 1.2 | `1.05rem` | inherit |
| `.type-tag` | `.58em`, ls `.1em` | `.72em` | muted |
| `.traits` | `.6em` | `.72em` | muted |
| `.card-kw` | `.61em` / 700, ls `.02em` | `.78em` | `#a9c6ff` |
| `.card-detail` | *not rendered* | `.82em` | `#d6dbe6` |
| `.card-stats` | `.8em` / 700 | `1rem` | see below |

Stats: attack `#ff9f87`, health `#8ee0ac`, damaged health `#ffcf6b`. `.card-detail` and
`.card-stats` each get `border-top: 1px solid rgba(255,255,255,.1)` — a hairline is enough
separation on top of art; a solid rule looks heavy.

**Faction/color coding is border-only** — `border-color` per faction, e.g. blue `#35548a`,
green `#2f6b4a`, red `#8c3a35`, white `#7d8595`, purple `#60449a`. Do not tint the card body; the
art already carries the color. Feed the same palette into the procedural art generator so
fallbacks match their faction.

**Chips vs inline.** Keyword names and trigger names are chips; their explanations are plain
inline text:

```css
.kw-name, .card-detail .trigger {
  font-weight: 700; padding: .05rem .32rem; border-radius: 3px; margin-right: .3rem;
}
.kw-name { color: #a9c6ff; background: rgba(169,198,255,.12); }
.card-detail .trigger { color: #ffd9a0; background: rgba(255,217,160,.12); font-size: .88em; }
```
12%-alpha tint of the text's own color. Reads as a label without becoming a button.

**Interaction/state treatments** (border + ring, never a filter that hides art):

```css
.card { transition: transform .12s, box-shadow .12s, border-color .12s; }
.card:hover { transform: translateY(-3px); box-shadow: 0 8px 22px rgba(0,0,0,.5); }
.is-rested  { transform: rotate(4deg); opacity: .72; }        /* hover keeps the rotation */
.is-attacking, .is-defending, .highlighted { box-shadow: 0 0 0 2px <tint>; }
```

Four **role** colors for what the player may do, as CSS variables:
`--role-actable #f5c34d`, `--role-selected #5b9dff`, `--role-target #ff6bcb`, `--role-picked #45c98b`.
`.role-actable` pulses (`0 0 8px` ↔ `0 0 20px` at 30%↔70% alpha, `1.7s ease-in-out infinite`);
`.role-selected` also lifts `translateY(-5px)`. Derive all of these from `legalActions` — never
from ad-hoc UI state.

**Badges**: a pilot/attachment badge is a full-width strip near the top
(`position:absolute; top:1.7rem; left:0; right:0; background:rgba(6,10,18,.85); font-size:.58em`,
`::before { content: '▸ ' }`), recolored when active. A damage marker is a centered pill
(`top/left 50%; translate(-50%,-50%); min-width 1.7rem; height 1.7rem; border-radius 999px;
border: 2px solid rgba(255,255,255,.35)`), so it reads at any card size.

---

## 7. The blow-up view

Ship **three** distinct enlargements. They are not interchangeable.

### A. Hover preview (mouse/keyboard)

**Trigger**: `mouseenter` **and** `focus` (keyboard parity). Dismiss on `mouseleave`/`blur`.

```js
var OPEN_DELAY_MS = 300;   // 90ms chases the pointer across the hand; 1000ms feels like waiting
var GAP = 12;              // min px from viewport edge
```

The timer callback must **abort if a drag is in progress**.

**Structure** — a fixed overlay, because the hand and battle area clip overflow and an in-place
scale would be cut off:

```
#preview                                       position: fixed; z-index: 60
└── .preview-row                               display:flex; align-items:flex-start; gap:.5rem
    ├── .preview-side.preview-pilot            (only if a pilot/attachment is linked)
    ├── .card.card-preview   ← the main card
    ├── .preview-side.preview-tokens           (only if the card creates tokens)
    └── .preview-side.preview-glossary         (only if it has keywords/triggers)
```

**Positioning**: center the **main card** on the anchor's rect, not the whole row — otherwise the
card visibly jumps sideways when a side panel appears.

```js
left = rect.left + rect.width / 2 - mainCardMidX;
left = Math.max(GAP, Math.min(left, window.innerWidth - width - GAP));
```

Set `transform-origin` to where the real card sits inside the box so the side panels unfold
outward from the card the player is pointing at.

**Animation**:
```css
#preview { position: fixed; z-index: 60; display: none; pointer-events: none;
           filter: drop-shadow(0 12px 32px rgba(0,0,0,.65));
           transform: scale(.35); opacity: 0;
           transition: transform .13s ease-out, opacity .13s ease-out; }
#preview.open  { display: block; }
#preview.grown { transform: scale(1); opacity: 1; }
@media (prefers-reduced-motion: reduce) { #preview { transition: none; } }
```
Add `.grown` after **two nested `requestAnimationFrame`s** so the browser has committed a start
value; one frame is not reliably enough after a `display` change.

**Side panels**:
```css
.preview-side { width: 15rem; max-height: 26rem; overflow-y: auto;
                background: rgba(10,14,22,.95); border: 1px solid var(--line);
                border-radius: 10px; padding: .6rem .7rem; }
.preview-side-title { font-size:.62rem; text-transform:uppercase; letter-spacing:.14em;
                      font-weight:700; color: var(--muted); margin-bottom:.45rem; }
.preview-pilot, .preview-tokens { width: auto; padding: .5rem; }
.preview-token-stack { display:flex; flex-direction:column; gap:.5rem; }
@media (max-width: 620px) { .preview-side { display: none; } }   /* card only on a phone */
```

**Cache by instance id** and skip rebuilding the row for the same card; expose an
`invalidate()` that the board render calls, so a card whose state changed re-renders.

### B. Inspector (tap / click) — the touch equivalent

A full-screen modal, because on touch there is no hover.

```css
#inspector { position: fixed; inset: 0; z-index: 50; display: none;
             background: rgba(4,7,13,.72); place-items: center;
             backdrop-filter: blur(2px); }
#inspector.open { display: grid; }
.inspect-body { max-width: min(92vw, 22rem); max-height: 94dvh; overflow-y: auto; }
```

Body stacks: **card → tokens created → glossary → available actions**. `max-height: 94dvh` with
scroll (`dvh`, not `vh` — mobile browser chrome) so action buttons stay reachable when a token
panel is present. Dismiss by clicking the backdrop; the body stops propagation.

Below ~420px, turn it sideways so the card and text share the screen:
```css
@media (max-width: 420px) {
  .inspect-body { display: grid; grid-template-columns: auto minmax(0, 14rem); }
  .inspect-body .card-preview { grid-row: 1 / -1; min-height: 0; width: 11rem; }
}
```

### C. Spotlight — the card that was just played

Not hover-driven. When a card is played (by either player), fly it to the center at full preview
size, hold, fade.

```js
TRAVEL_MS = 500; HOLD_MS = 1200; FADE_MS = 250;
// start: translate(-50%,-50%) translate(dx,dy) scale(.3), opacity .35
// end:   translate(-50%,-50%) scale(1),          opacity 1
// transition: transform 500ms cubic-bezier(.22,.72,.3,1), opacity 300ms ease-out
```

Two non-obvious requirements:
- **Flush the start state with a forced layout read (`void el.getBoundingClientRect()`), NOT
  `requestAnimationFrame`.** rAF does not fire in a background tab, and the card would be stranded
  mid-screen forever.
- A second play must call `finish(true)` on the first, or cards pile up.

Click anywhere on the overlay to skip. Under `prefers-reduced-motion`, collapse to
`transition: opacity .25s ease-out !important`.

**Z-order stack**: board < drag layer < inspector (50) < preview (60), with spotlight
*below* the preview so a card can still be hovered during a spotlight.

---

## 8. What the enlarged view adds

This is the payoff for having a preview at all. On the card face, **keyword names only** — a
crowded board must stay scannable. Everything else appears when enlarged.

| Shown | Small card | Enlarged |
|---|---|---|
| Name, cost, level, stats | ✅ | ✅ |
| Type, traits | ✅ (hidden < 900px) | ✅ |
| Keyword **names** | ✅ (hidden < 900px) | ✅ |
| Full ability text with trigger chips | ❌ | ✅ `.card-detail` |
| Link/attachment requirement, live "active" state | badge only | ✅ full line |
| Keyword/trigger **explanations** | ❌ | ✅ glossary panel |
| Tokens this card creates | ❌ | ✅ token panel |
| The linked pilot's own full card | badge only | ✅ pilot panel |

**Render `.card-detail` only when `size === 'preview'`.** One conditional; it is the entire
content difference between the sizes.

**Keyword glossary — put it beside the card, not on it.** Reminder text inside the detail block
crowded out the actual abilities on any card with two or more keywords. A side panel of
`.kw-row > span.kw-name + span.kw-text` solves it and is reusable verbatim in the inspector.

**Glossary collection must be exhaustive — walk the whole card definition**, not just top-level
abilities. Collect:
- live keywords (from the instance, so granted keywords appear) else printed keywords;
- any keyword mentioned at any depth by a `modify` op, a `filter.hasKeyword`, or a bare
  `hasKeyword` condition — a card that *grants* Blocker must explain Blocker;
- every trigger on the card, plus triggers an effect grants for the turn;
- a synthesized `Link` entry when the card declares a link requirement.

Substitute numeric values into reminder text:
`rule.text.split('X').join(value || 'the listed amount')`, using `'X'` when the amount is
non-numeric.

Name lookup fallback chain: names table → the rule's own `.name` → the raw id. Never render an
empty label.

---

## 9. Token preview

**Data**: walk the *entire* card definition object graph for `{op: 'deployToken', defId}`,
dedupe, preserve order. Walking the whole graph (not just top-level abilities) catches tokens
created from inside a condition branch, a "choose one" effect, or a turn-granted ability.

**Rendering**: token defs are ordinary card definitions — nothing in the data marks them as
tokens. Render each with the normal renderer at preview size, using a **fabricated scratch
instance** inside a **shallow copy of state**:

```js
var iid = 'scratch-' + defId;
// { isToken: true, damage: 0, deployedTurn: -1 } in a shallow-copied state
```

Two reasons this matters: previews leave nothing behind for undo snapshots, and a token that is
in no zone picks up no continuous bonuses — so you show its **printed** stats, not a
board-specific number that would mislead.

Panel titles pluralize: `'Token created'` / `'Tokens created'`. Same data, same markup in the
inspector.

---

## 10. Interaction rules

The whole gesture vocabulary, and nothing more:

| Gesture | Meaning |
|---|---|
| **Drag** | Commit an action |
| **Tap / click** | Inspect (never changes game state) |
| **Hover (300ms)** | Preview |
| **Right-click** | Secondary/contextual (e.g. remove one copy in the builder) |
| **Long-press** | **Not used.** Deliberately. |

**Use Pointer Events only.** One code path covers mouse, touch, pen, and gaze-and-pinch. No
platform branching, no `touchstart`/`mousedown` pairs.

**Disambiguate tap from drag by DISTANCE, never time**: `DRAG_THRESHOLD_PX = 8`. Eight pixels
survives the hand tremor of a touch tap and the gaze jitter of a pinch, and — critically — a tap
never has to wait for a timer to expire.

```js
if (Math.sqrt(dx*dx + dy*dy) < 8) { /* still a tap */ }
```

**Call `setPointerCapture` on pointerdown** so a fast flick doesn't lose the gesture.

**Recover stale gestures**: if a fresh `pointerdown` arrives while a drag is still live, finish
the old one first. A fresh press is proof the old one is over. Without this, a drag whose
`pointerup` never arrived (alt-tab, OS gesture) wedges *every* later drag.

**Undraggable cards must stay tappable.** If a card has no legal drop targets, end the drag
immediately but **keep the move/up listeners attached** so the tap still fires.

**Two drag styles**: a card from hand *clones its node* into a drag layer and genuinely moves;
an attacking unit stays put and draws an **arrow** to the target. The card that isn't moving
shouldn't move.

**Synthetic-click suppression — belt and braces.** A synthetic `click` follows every pointer
gesture. After a drop, the board has re-rendered, so that click lands on a detached node.

```js
CLICK_GRACE_MS = 350;
// 1. timestamp:  lastDragEnd = Date.now(); onCardClick returns early if justDragged()
// 2. capture:    document.addEventListener('click', swallow, true) — stopPropagation +
//                preventDefault on exactly one click, self-removing after 350ms
//                (touch/pinch don't always send one)
```
You need **both**. The capture listener misses clicks on detached nodes; the timestamp misses
nothing but is coarse.

**Nothing may eat drops.** Every overlay and decorative layer gets `pointer-events: none`:
```css
#preview { pointer-events: none; }
.card-art::after { pointer-events: none; }
.is-draggable img { pointer-events: none; }
.drag-clone { pointer-events: none; }   /* so elementFromPoint sees the board */
```
Also hide the preview explicitly when a drag starts.

**Touch requires `touch-action: none`** — this is the single line that makes drag work on a phone.
Without it the browser claims the gesture to scroll the hand sideways.
```css
.is-draggable { touch-action: none; user-select: none; -webkit-user-drag: none; }
```
And suppress hover preview entirely on touch:
```css
@media (hover: none) { #preview { display: none !important; } }
```
Touch devices get the inspector, which is strictly better there anyway.

**Drop feedback**: on drag start, mark every valid target `.drop-ok`; mark the one under the
pointer `.drop-hot`; fade the source `.is-dragging-source { opacity: .28 }`. Clear all three in
one `finish()`.

**Released over nothing is a silent cancel**, not an error message.

**Native `title` tooltips are enough for the numbers**: `"Level 3 — you must own this many
resources to play it"`, `"Cost 2 — this many resources are rested to play it"`, `"Attack power"`,
`"Remaining health"`. Give card references in the log `cursor: help`.

---

## 11. Performance: the flicker fix

If the board rebuilds from scratch on every draw (which is the simple, correct model), a freshly
created `<img>` **is not painted in the frame it is inserted** — you get a blank frame per redraw,
which reads as flicker.

**Fix: cache one decoded prototype `<img>` per file and clone it.** A clone of a loaded image
paints in the same frame.

```js
proto.className = 'art art-painted';
proto.alt = '';
proto.draggable = false;                    // load-bearing, see below
proto.setAttribute('aria-hidden', 'true');
proto.decoding = 'sync';                    // NOT 'lazy', NOT 'async'
// then: return proto.cloneNode(false);
```

`lazy` and `async` both defer the paint past the frame the clone is inserted in — which is exactly
the flicker the cache exists to remove.

Cache procedural fallbacks the same way, keyed by card id (they're deterministic).

**`draggable="false"` on card art is not optional.** `<img>` is natively draggable, and the
browser's own image drag *cancels* a pointer-events drag — producing the maddening bug where cards
fail to drag **only when grabbed over the artwork**. Pair it with `-webkit-user-drag: none` in CSS.

**Asset weight**: check encoding quality before downscaling. Re-encoding a 2816×1536 background at
its original dimensions took it from 3.7 MB to 918 KB — the weight was quality, not pixels. This
matters most for images containing text, where downscaling is the thing you can't undo.

---

## 12. Responsive strategy: remove content, don't shrink it

There is no minimum-font-size mechanism. Below ~900px, **delete the secondary content** rather
than scale it into illegibility — the inspector carries the rest.

```css
@media (max-width: 900px) {
  .card:not(.card-preview) .traits,
  .card:not(.card-preview) .card-kw,
  .card:not(.card-preview) .pilot-badge { display: none; }
  .type-tag { font-size: .52em; letter-spacing: .04em; }
  .card-name { font-size: .68em; }
}
```

And keep hand cards at a readable thumb width instead of letting flex squeeze them:
```css
#hand { justify-content: flex-start; }   /* narrow screens */
#hand .card { flex: none; }
```

**Design your art for the smallest render size.** If a card face appears at ~34px anywhere
(resource chips, mini-strips), that size dictates the art brief: one bold centered object filling
the frame, hard silhouette, high contrast, almost no detail. Pick an illustration style that
survives the smallest size, not the largest.

---

## 13. Accessibility

- Card art is decorative: `alt=""` and `aria-hidden="true"` (on the SVG fallback too). The card's
  text is the accessible content.
- Give cards `tabindex="0"` wherever they're interactive (at minimum the builder).
- **Open the preview on `focus` and close on `blur`** — keyboard parity with hover, for free.
- Honor `prefers-reduced-motion` on both the preview transition and the spotlight travel.
- `aria-label` on icon-only buttons (+/− steppers, etc.).

---

## 14. Gotchas that will cost you an afternoon each

- The CSS `background` **shorthand silently wipes `background-image`** — a later shorthand rule
  removes a texture set earlier.
- A CSS **grid with no explicit width shrink-wraps its tracks** and stacks everything into one
  column.
- **Overlays eat drops** unless `pointer-events: none`; conversely, an overlay you dismiss by
  clicking needs them **on**.
- `requestAnimationFrame` **does not fire in a background tab.** Any animation whose end state is
  set in a rAF callback will strand. Force a layout read instead.
- **Clear transient UI state before drawing, not after.**
- Handler-per-card closures must take the card id as a **parameter**, not close over a loop
  variable.

---

## 15. Build order

1. `render(state, card, {size})` producing the 3-layer DOM; hard-code one card, one size.
2. Art layer + `object-fit: cover` + procedural fallback + the prototype-clone cache.
3. Scrim + text shadows. **Sample luminance across the real art set** and tune the gradient stops.
4. Sizes via custom properties; verify the same renderer at board/hand/preview.
5. `.card-detail` at preview size only; the generated-rules-text path (see `CARD-GAME-LESSONS.md`
   §2 — and build the text-quality test with it).
6. Glossary collection walker + preview side panels.
7. Token walker + scratch-instance rendering.
8. Hover preview with the 300ms delay and fixed-overlay positioning.
9. Inspector modal (this is what touch users actually get).
10. Pointer-events drag with the 8px threshold, capture-phase click swallowing, `touch-action: none`.
11. Spotlight.
12. Responsive content-removal pass + reduced-motion + focus/blur parity.
