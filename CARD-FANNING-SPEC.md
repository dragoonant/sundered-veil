# Card Fanning Spec

How to lay out a hand as a fan — the arc math, the overlap math, hover behaviour, and every
place a fan collides with drag, preview, and hit testing.

> **Provenance.** Unlike the other three specs in this set, this one is not extracted from shipped
> code: MegaRobotWar deliberately uses a **flat centred flex row** for the hand, not a fan (see §1).
> The layout math here is new design work. The integration rules in §7–§11 are *not* new — they are
> the constraints that project proved the hard way, restated for a fanned hand, and they are the
> parts most likely to bite you.

Companions: `CARD-GAME-LESSONS.md`, `CARD-PRESENTATION-SPEC.md`, `CARD-LOG-AND-TARGETING-SPEC.md`.

---

## 1. First: decide whether to fan at all

The previous game shipped this instead, and it is a legitimate answer:

```css
#hand {
  display: flex; gap: .45rem; padding: .5rem; overflow-x: auto;
  min-height: 12.2rem; align-items: flex-start; justify-content: center;
}
```

What a flat row buys you, all of which a fan spends:

- **Hit testing is trivial.** Every card is a plain axis-aligned rect with nothing on top of it.
- **`overflow-x: auto` works.** A big hand scrolls instead of compressing into slivers.
- **The hover-lift (`translateY(-3px)`) is the entire interaction language.** No z-index management.
- **Drag needs no un-transforming.** The clone matches the source exactly.
- **Responsive is one line.** Switch `justify-content` to `flex-start` and let it scroll.

Fan when: the hand is a *presented object* the player looks at (a physical-feeling game, a hand
that's rarely above ~8 cards, a strong visual identity). Don't fan when: hands regularly exceed
10 cards, touch is the primary platform, or cards carry text meant to be read in place.

**A fan is a presentation of the hand, never the source of truth.** DOM order stays hand order;
the fan is transforms on top. Everything downstream (drag, preview, roles, tests) reads the
underlying list.

---

## 2. The two fan models

### Model A — Arc fan (rotation)

Cards rotate around a pivot far below the hand. This is the "held in one hand" look.

### Model B — Overlap fan (translation only)

Cards stay upright and slide over each other. This is the "spread on a table" look — easier to
read, easier to hit, and it degrades to the flat row for free.

**Model B is the safer default.** Use A when the physicality is the point. They compose: a small
rotation on top of an overlap fan (±6° max) reads as a fan without the hit-testing pain.

---

## 3. The arc math (Model A)

The whole trick is **`transform-origin`**. Put the pivot far below the card and a plain `rotate()`
produces the arc lift and dip for free — no per-card `translateY` needed, and no trigonometry in JS.

```css
.hand-card {
  position: absolute;                 /* fan positions explicitly */
  transform-origin: 50% var(--fan-radius);   /* e.g. 50% 620px — well below the card */
  transition: transform .18s ease-out;
  will-change: transform;
}
```

```js
var FAN = {
  radius: 620,        // px below the card's top edge; larger = flatter arc
  stepDeg: 5,         // degrees between adjacent cards
  maxSpreadDeg: 34,   // total arc, compressed into when the hand is large
  stepX: 62,          // px between card centres before compression
  minStepX: 26        // never overlap tighter than this
};

function fanAngle(i, n) {
  var step = Math.min(FAN.stepDeg, FAN.maxSpreadDeg / Math.max(1, n - 1));
  return (i - (n - 1) / 2) * step;    // symmetric about centre
}
```

The dip that makes it read as an arc is `radius * (1 - cos(angle))` — but you never compute it,
because the transform-origin already applies it. That is the entire reason to do it this way.

**Horizontal placement is separate from rotation.** Rotation alone around a distant pivot spaces
cards too, but you lose control of the width. Set `left` per card, then rotate:

```js
function layoutFan(container, cards) {
  var n = cards.length;
  var avail = container.clientWidth - CARD_W - PAD * 2;
  var stepX = n > 1 ? Math.min(FAN.stepX, avail / (n - 1)) : 0;
  stepX = Math.max(FAN.minStepX, stepX);
  var totalW = CARD_W + stepX * (n - 1);
  var startX = (container.clientWidth - totalW) / 2;

  for (var i = 0; i < n; i++) {
    var el = cards[i];
    el.style.left = (startX + i * stepX) + 'px';
    el.style.zIndex = String(10 + i);                  // later cards on top
    el.dataset.fanAngle = fanAngle(i, n);              // remembered for hover math
    el.style.transform = 'rotate(' + fanAngle(i, n) + 'deg)';
  }
}
```

**Order of composition matters.** With `transform-origin` below the card, a `translateY` written
*after* the rotate moves along the card's own axis — perpendicular to the arc. That is exactly what
you want for a hover lift, and it is why the lift is composed into the same transform rather than
applied as a separate property.

### Reserve the height the arc needs

A rotated card's bounding box is taller and wider than the card. The hand container must reserve
it or the top corners clip:

```
extraHeight ≈ (CARD_W / 2) * sin(maxAngle) + CARD_H * (1 - cos(maxAngle)) + liftPx
```

For a 128×179 card at 17° and a 22px lift, that's roughly 40px of headroom. Measure it once at
your maximum spread and bake it into the container's `min-height`.

**The container must be `overflow: visible`.** This is the fan's biggest structural cost: it is
directly incompatible with `overflow-x: auto`. A fan cannot scroll. Compression (§4) is the only
answer to a large hand, which is why hands above ~10 cards are a reason not to fan.

---

## 4. Compression: fixed spacing until it doesn't fit

Never scale the fan continuously with hand size — a 3-card hand should look identical whether the
game usually holds 3 or 12.

```js
// stepX = min(preferred, available / (n - 1)), floored at minStepX
```

Three regimes fall out:

| Hand size | Behaviour |
|---|---|
| Small (fits at `stepX`) | Preferred spacing; the fan is narrow and centred |
| Medium | `stepX` shrinks; cards begin to overlap |
| Large (past `minStepX`) | Spacing stops shrinking; the fan **overflows its container** |

That third regime is the one to design for deliberately. Options, in order of preference:
1. **Reduce `stepDeg` first** — a flatter fan packs tighter than a steep one at the same `stepX`.
2. **Let it overflow symmetrically** past the container's padding, since the hand usually has
   margin around it.
3. **Fall back to the flat scrolling row** past a hard threshold (see §12). This is the honest
   answer and costs one class toggle.

**Always keep the last card fully visible.** With left-to-right stacking, the newest card is on
top and fully readable; earlier cards show only a `stepX`-wide sliver. Make sure `minStepX` is wide
enough for that sliver to carry the card's most identifying feature — with the art-covers-the-card
model from the presentation spec, that means the left edge of the illustration, so keep
`minStepX` ≥ ~20% of card width.

---

## 5. Hover: lift, and push the neighbours apart

A card in a fan is mostly covered. Hovering must reveal it, and the neighbours have to make room —
otherwise the lift just moves the card behind the same occluder.

```js
function applyHover(cards, hoverIndex) {
  for (var i = 0; i < cards.length; i++) {
    var el = cards[i];
    var angle = Number(el.dataset.fanAngle);
    var t = 'rotate(' + angle + 'deg)';

    if (hoverIndex === -1) {
      el.style.zIndex = String(10 + i);
    } else if (i === hoverIndex) {
      // Lift along the card's own axis, and stand it up a little.
      t = 'rotate(' + (angle * 0.35) + 'deg) translateY(' + -HOVER_LIFT + 'px) scale(1.06)';
      el.style.zIndex = '200';
    } else {
      // Neighbours slide away, nearest moving most.
      var d = i - hoverIndex;
      var push = SPREAD_PUSH * (d > 0 ? 1 : -1) / Math.abs(d);
      t = 'translateX(' + push + 'px) rotate(' + angle + 'deg)';
      el.style.zIndex = String(10 + i);
    }
    el.style.transform = t;
  }
}
```

Numbers that work: `HOVER_LIFT` 26–34px, `scale` 1.05–1.10, `SPREAD_PUSH` 18–26px,
transition `.18s ease-out`.

- **Straighten partially, not fully.** Multiplying the angle by ~0.35 reads as the card being
  tipped toward the player. Snapping to 0° detaches it from the fan.
- **Push falls off as `1/distance`**, so only the immediate neighbours move much. A uniform push
  slides the whole hand and looks like a layout bug.
- **Raise `z-index` on the hovered card**, and restore it on exit. Set it in the same pass, not in
  a separate handler that can be missed.
- **`translateX` before `rotate`** for neighbours: you want them to slide in screen space, not
  along their own tilted axis.

### Hover state must be owned, not inferred

Do not put this in `:hover`. With overlapping rotated elements, CSS `:hover` fires on whatever the
browser hit-tests, which during a push animation is a moving target — cards flicker between states
as they slide out from under the pointer. Track the hovered index in JS from `pointerover` on the
container, and **do not recompute it while a push transition is running**.

Reuse the preview timing from the presentation spec: hover lift is immediate, the **300 ms**
preview delay is separate and unchanged.

---

## 6. Entering, leaving, and reflow (FLIP)

Every draw and every play re-lays the whole fan. Animating that badly is worse than not animating.

Use **FLIP** — First, Last, Invert, Play:

```js
function reflow(container, cards, layoutFn) {
  var first = cards.map(function (el) { return el.getBoundingClientRect(); });
  layoutFn();                                            // write new left/transform
  cards.forEach(function (el, i) {
    var last = el.getBoundingClientRect();
    var dx = first[i].left - last.left;
    var dy = first[i].top - last.top;
    if (!dx && !dy) return;
    el.style.transition = 'none';
    el.style.transform += ' translate(' + dx + 'px,' + dy + 'px)';
    void el.getBoundingClientRect();                     // flush — NOT rAF (see below)
    el.style.transition = 'transform .22s ease-out';
    el.style.transform = el.style.transform.replace(/ translate\([^)]*\)$/, '');
  });
}
```

**Flush with a forced layout read, never `requestAnimationFrame`.** This is carried over verbatim
from the spotlight animation in the previous project: rAF does not fire in a background tab, and a
hand reflowed while the tab is hidden would strand every card at its inverted offset — a visibly
broken hand the moment the player comes back.

- **Draw**: new card enters from the deck position at `scale(.7)`, opacity 0 → 1, and the fan
  reflows around it in the same pass.
- **Play**: the card leaves via the drag/spotlight path (it is already out of the hand), so the
  fan just reflows. Don't animate the played card twice.
- **Cap the reflow.** If more than ~6 cards move at once (opening hand, a big draw), skip FLIP and
  fade the whole hand in. Twelve simultaneous FLIP animations look like debris.

---

## 7. Hit testing — the part that bites

Browsers hit-test transformed elements correctly: a rotated card's clickable area *is* the rotated
quad. The problem is not rotation, it's **occlusion**.

- A card's clickable region is only the sliver not covered by the card after it. That is correct
  and matches physical cards — but it means **the sliver must be big enough to hit**, which is the
  real constraint behind `minStepX`. Below ~26px the hand becomes frustrating with a mouse and
  unusable with a thumb.
- **Never widen the hit area with an invisible `::after` overlay.** It will sit on top of the
  neighbouring card and steal its clicks — a bug that presents as "the wrong card gets selected,
  but only sometimes." If you need a larger target, increase `minStepX`.
- **The hovered card's raised `z-index` changes hit testing mid-gesture.** Once a card is lifted it
  covers more of its neighbours, so the pointer can end up over a different card than the one under
  the cursor when the lift started. Mitigate by keeping the lift mostly *vertical* (which moves the
  card away from its neighbours' area) rather than scaling it up a lot.
- **`pointer-events: none` on everything decorative** — the scrim pseudo-element, art images, any
  glow overlay. This is the same rule as the presentation spec, and it matters more here because
  the layers overlap.

---

## 8. Drag integration

The fan must not fight the drag model. Carried over unchanged from the previous project:

- **8px distance threshold, never a timer.** A fan tempts you to add a long-press to "pull a card
  out" — don't. Distance already distinguishes a tap from a pull, and a timer makes every tap wait.
- **`touch-action: none` on the cards**, or the browser claims the gesture to scroll the hand.
- **On drag start, the card leaves the fan.** Clone it into the drag layer as before — and the
  **clone must be un-rotated and un-scaled**. Reset the transform on the clone explicitly; a clone
  that inherits `rotate(12deg)` and a distant `transform-origin` will fly to a bizarre place.

```js
clone.style.transform = 'none';
clone.style.transformOrigin = '50% 50%';
```

- **The source card fades in place** (`opacity: .28`) and the fan **does not reflow during the
  drag**. Closing the gap while the player is still aiming makes the drop position move under them,
  and a cancelled drag then has to animate back into a hand that changed shape. Reflow on `finish`.
- **Grab offset must account for rotation.** Compute the pointer's offset from the card using
  `getBoundingClientRect()` (which is already post-transform) so the clone doesn't jump under the
  cursor at pickup.

---

## 9. Hover preview integration

`getBoundingClientRect()` returns the *transformed* bounding box, so anchoring mostly works — with
two adjustments:

- **The rect of a rotated card is bigger than the card**, so centring the preview on
  `rect.left + rect.width / 2` is slightly off for cards at the ends of the fan. Anchor to the
  card's true centre instead — for a pure rotation, the untransformed centre is preserved, so
  compute it from `offsetLeft/offsetTop` and the card's own size, then map through the same
  rotation.
- **Anchor to the lifted position, not the resting one.** The preview opens 300 ms after hover
  begins, by which time the lift has finished. Read the rect at open time, not at hover time.
- The preview is `pointer-events: none` and lives at z-index 60, well above the fan's 200. No
  conflict — but do **hide the preview when a drag starts**, same as before.

---

## 10. Role highlighting inside a fan

The four role colours (`actable`, `selected`, `target`, `picked`) are ring-based
(`box-shadow: 0 0 0 3px …`), which is a problem in a fan: **a ring on an occluded card is mostly
hidden**, and the visible part reads as a stripe on its neighbour.

Fixes, in order:
1. **Raise `z-index` for roled cards** above their unroled neighbours, so at least the ring's own
   card wins the overlap.
2. If several cards are roled at once, **spread the fan slightly** while the role is active — more
   `stepX` means more ring visible per card.
3. For `actable` specifically (the common case — several playable cards at once), consider a
   **top-edge marker** instead of a full ring, since the top edge is the part of an occluded card
   that's always visible.

Keep the shared `animationPhase()` negative-delay trick for the actable pulse, so cards re-laid by
a reflow don't restart their pulse out of sync with each other.

---

## 11. The opponent's hand

Fan it too, face down, but **clip it rather than reserving height** — the previous project's
treatment translates directly:

```css
#enemy-hand {
  height: 3.3rem; overflow: hidden;          /* only the top sliver shows */
  display: flex; align-items: flex-start; justify-content: center;
}
#enemy-hand .card { cursor: default; }
#enemy-hand .card:hover { transform: none; box-shadow: none; }
```

The cards are full size; the row clips them, the way a real hand held just above the table edge
shows only its top edge. **Turn off the hover lift** — it isn't interactive and a lift implies it
is. A fan reads especially well here, because the top edge of an arc is unmistakably a hand.

---

## 12. Responsive and touch

**Fanning is worse on touch**, for two compounding reasons: fingers are imprecise against thin
slivers, and there is no hover to reveal an occluded card.

Fall back to the flat scrolling row — the same rule the previous project applies at its phone
breakpoint:

```css
@media (max-width: 620px), (hover: none) {
  #hand { position: static; display: flex; flex-wrap: nowrap;
          overflow-x: auto; justify-content: flex-start; }
  #hand .card { position: static; transform: none !important; flex: none; }
}
```

Note `position: static` and `transform: none` — the fan is absolutely positioned with inline
styles, so the fallback has to override both. Keep the JS layout pass aware of the breakpoint and
**skip it entirely** in row mode rather than writing styles the CSS then has to fight.

Also honour reduced motion:

```css
@media (prefers-reduced-motion: reduce) {
  .hand-card { transition: none; }
}
```
Cards still fan and still lift — they just arrive instantly. Removing the fan itself would be
removing information, not motion.

---

## 13. Accessibility

- **DOM order is hand order**, always. The fan is transforms; tab order must not depend on
  z-index or visual position.
- Cards are `tabindex="0"`; **`focus` applies the same lift as hover** and opens the preview, so a
  keyboard user can reveal an occluded card. Without this, a fanned hand is unusable by keyboard.
- `:focus-visible` needs a ring that survives occlusion — pair it with the same z-index raise as
  hover.
- The lift/push animation is decorative; the reduced-motion path above covers it.

---

## 14. Performance

- **Animate `transform` and `opacity` only.** Never animate `left` — that's layout on every frame
  for every card.
- Set `will-change: transform` on hand cards **only while the hand is interactive**, and remove it
  otherwise. Left on permanently across a large hand it costs real memory.
- **Batch the layout pass.** Read all rects first, then write all styles (the FLIP structure in §6
  already does this). Interleaving reads and writes across n cards is n forced reflows.
- The **decoded-image-prototype clone** rule from the presentation spec still applies and matters
  more here: a fan reflows more often than a flat row, and an undecoded `<img>` costs a blank frame
  each time.

---

## 15. Don't-fan checklist

Fan only if all of these hold. If two or more fail, ship the flat row.

- [ ] Typical hand ≤ 8 cards, hard maximum ≤ 12
- [ ] Mouse or pointer is the primary platform (touch has a designed fallback)
- [ ] Cards are identified by art/name, not by reading their rules text in place
- [ ] The hand container can afford `overflow: visible` and ~40px of extra headroom
- [ ] There is a hover-preview or inspector so occluded cards can be read
- [ ] You are willing to own hover state in JS rather than CSS `:hover`

---

## 16. Build order

1. Flat row first, working end to end — drag, preview, roles, responsive. **The fan is a layer on
   top of a hand that already works.**
2. Absolute positioning + `layoutFan()` with `left` and `z-index` only (Model B, no rotation).
   Verify drag and preview still work.
3. Add `transform-origin` + `rotate()`. Re-verify drag (clone un-rotation) and preview anchoring.
4. Compression: `stepX` clamping, `minStepX` floor, and the overflow regime.
5. Hover lift + neighbour push, with hover state owned in JS.
6. z-index management for hover and for roles.
7. FLIP reflow, with the forced-layout-read flush and the >6-card cap.
8. Focus parity, reduced motion, and the touch/narrow fallback to the flat row.
