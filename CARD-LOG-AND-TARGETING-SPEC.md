# Game Log & Targeting Spec

How a card game should **narrate what happened** and **ask the player who to hit**. Derived from
a shipped browser card game; every number and rule below was paid for by a real bug or playtest.

Companions: `CARD-GAME-LESSONS.md` (architecture), `CARD-PRESENTATION-SPEC.md` (card rendering).

---

# PART ONE — THE LOG

## 1. The core decision: log entries are structured, not strings

This is the single most load-bearing choice in the whole document. **Every log entry carries a
`data` object alongside its prose.**

```js
function log(state, message, data) {
  state.log.push({
    turn: state.turn, phase: state.phase, step: state.step,
    message: message,
    data: data || null
  });
}
```

Call sites tag what the line is *about*, not just what it says:

```js
S.log(state, labelOf(state, iid) + ' is destroyed.', { iid: iid, sound: 'destroy' });
S.log(state, 'Player ' + p + ' loses a shield.',     { iid: iid, sound: 'shield_break' });
S.log(state, labelOf(state, src) + ' finds no legal target.', { iid: src, notice: true });
S.log(state, 'Player ' + p + ' pairs ' + labelOf(state, pilot) + '.', { iid: pilot, unit: unitIid });
```

Three separate subsystems then read the log instead of being separately notified:

| Consumer | Reads | Why it matters |
|---|---|---|
| **Log panel** | `message` + `data.iid` | Card names become hover targets |
| **Audio** | `data.sound` | The opponent's turn is audible for free |
| **AI** | `data.notice` | Tells a *spent* card from a *wasted* one |

**If the engine only logged English, none of these would work without pattern-matching prose.**
That is the failure mode this design exists to prevent. Adopt it on day one — retrofitting means
touching every log call site.

### Recognised `data` keys

| Key | Meaning |
|---|---|
| `iid` | The card this line is about (primary subject) |
| `attacker`, `blocker`, `unit`, `source` | Secondary subjects, checked in that order as fallbacks |
| `sound` | Cue name for the audio layer |
| `notice` | This line must not be scrolled past (see §4) |
| `silent` | Carries a cue only; render nothing |

## 2. Log by player index; translate to second person at the last moment

The engine writes `Player 0 draws 2.` — correct for tests, replays, and AI, and unreadable in play.
**Do not let the engine know who the human is.** Translate in the view layer, at render time:

```js
function humanise(message, human) {
  var them = 1 - human, out = message;
  for (var f = 0; f < forms.length; f++) {          // ['Player ', 'player ']
    out = swap(out, forms[f] + human + "'s", 'your');
    out = swap(out, forms[f] + them  + "'s", "the opponent's");
    out = swap(out, forms[f] + human, ME);          // sentinel \x01
    out = swap(out, forms[f] + them,  THEM);        // sentinel \x02
  }
  // "You draws 1" -> "You draw 1"
  var parts = out.split(ME);
  for (var i = 1; i < parts.length; i++) parts[i] = bareVerb(parts[i]);
  out = swap(parts.join('you'), THEM, 'the opponent');
  out = swap(out, 'you spend their', 'you spend your');
  return capitalise(out);
}
```

Three details that are easy to miss and each produced a visible bug:

1. **Use sentinel characters** (`\x01`, `\x02`) between substitution passes. Replacing directly
   with `"you"` means the next pass can match text you just inserted.
2. **Second person takes the bare verb.** Strip a trailing `s` from the verb following a
   substituted "you", with an irregular table for the ones that don't follow the rule:
   `{ has: 'have', goes: 'go', does: 'do', is: 'are', was: 'were' }`. Handle trailing punctuation
   (`draws.` → `draw.`) before the check, and never strip from `-ss` words.
3. **Re-capitalise afterwards.** Substitution can drop a lowercase "you" at the start of a
   sentence *or* mid-string after a period. Walk the string and capitalise at every sentence start,
   not just index 0.

## 3. Card names in the log are live hover targets

This is what makes a log worth reading. A line about a card several turns ago should let you *see*
that card.

```js
function logLine(state, entry, human) {
  var line = el('div', 'log-line');
  if (entry.message.indexOf('---') === 0) line.classList.add('log-turn');
  if (entry.data && entry.data.notice) line.classList.add('log-notice');

  var text = humanise(entry.message, human);
  var iid = logSubject(state, entry);            // first key that still exists
  if (!iid) { line.textContent = text; return line; }

  var label = labelOf(state, iid);
  var at = text.indexOf(label);
  if (at === -1) {
    // The name did not survive rewriting -> make the WHOLE LINE the target.
    line.textContent = text;
    line.classList.add('has-card');
    Preview.attach(line, state, iid);
    return line;
  }
  line.appendChild(document.createTextNode(text.slice(0, at)));
  var ref = el('span', 'card-ref', label);
  ref.tabIndex = 0;                              // keyboard reachable
  Preview.attach(ref, state, iid);
  line.appendChild(ref);
  line.appendChild(document.createTextNode(text.slice(at + label.length)));
  return line;
}
```

**The `at === -1` fallback is not optional.** Humanising rewrites text, and a card name can be
swallowed or shifted. Degrading to a whole-line hover target is far better than silently dropping
the affordance.

```js
function logSubject(state, entry) {
  var data = entry.data;
  if (!data) return null;
  var keys = ['iid', 'attacker', 'blocker', 'unit', 'source'];
  for (var i = 0; i < keys.length; i++) {
    var v = data[keys[i]];
    if (v && typeof v === 'string' && state.cards[v]) return v;   // must still EXIST
  }
  return null;
}
```

Note `state.cards[v]` — a destroyed card may be gone from state, and attaching a preview to a
missing instance throws.

```css
.card-ref { color: #cfe0ff; border-bottom: 1px dotted rgba(207,224,255,.5); cursor: help; }
.card-ref:hover { color: #fff; border-bottom-color: #fff; }
.log-line.has-card { cursor: help; }
.log-line.has-card:hover { color: #cfe0ff; }
```

`cursor: help` (not `pointer`) — the correct signal for "this explains itself", and it doesn't
promise a click that does nothing.

## 4. The fizzle notice — the most important line in the log

**When a card is paid for and does nothing, say so.** An ability that vanishes without a word reads
as a broken game rather than a bad play.

```js
if (pool.length === 0) {
  S.log(state, labelOf(state, entry.sourceIid) + ' finds no legal target.',
        { iid: entry.sourceIid, notice: true });
  return [];
}
if (selector.minCount !== undefined && pool.length < selector.minCount) {
  S.log(state, labelOf(state, entry.sourceIid) + ' finds too few legal targets.',
        { iid: entry.sourceIid, notice: true });
  return [];
}
```

Two subtleties:

- **Check this before any "affects everything" shortcut**, so `destroy all` against an empty board
  announces itself exactly like a whiffed single target.
- **The AI reads `notice: true`** to distinguish a card that was spent from a card that was wasted.
  This one flag is what makes the "don't throw cards away" evaluation penalty possible at all
  (see `CARD-GAME-LESSONS.md` §3).

```css
.log-line.log-notice {
  color: var(--role-actable); font-weight: 600;
  border-left: 2px solid var(--role-actable); padding-left: .4rem;
}
```

**Never auto-resolve a forced target silently.** When the pool exactly fills the requirement,
it is tempting to skip the prompt and save a click. Don't. It costs the player the knowledge that
anything was targeted at all — a card resolves against the only legal unit with nothing on screen
to say so. Confirming is cheap; not knowing what your card hit is not.

## 5. Log panel rendering

```js
function renderLog(state, node, human) {
  node.innerHTML = '';
  var entries = state.log.slice(-60);             // window, not the whole game
  for (var i = entries.length - 1; i >= 0; i--) { // NEWEST FIRST
    if (entries[i].data && entries[i].data.silent) continue;
    node.appendChild(logLine(state, entries[i], human));
  }
}
```

- **Newest first**, so the player never scrolls to find what just happened.
- **Window to the last 60 entries.** A long game's log is thousands of lines and rebuilding it every
  redraw is wasted work nobody reads.
- **Skip `silent` entries.** Some entries exist only to carry a sound cue (a beam firing mid-battle).
  The log is the transport that makes the opponent audible, so a cue with nothing to say still has
  to travel through it — but it is not a line anyone should read.
- Turn dividers (`--- Turn 4 ---`) get `.log-turn`, accent-coloured and bold.

```css
#log { height: 12rem; overflow-y: auto; padding: .5rem .8rem .9rem;
       font-size: .78em; color: var(--muted); }
.log-line { padding: .1rem 0; border-bottom: 1px solid rgba(255,255,255,.03); }
.log-line.log-turn { color: var(--accent); font-weight: 700; }
```

## 6. The audio layer rides the log

Because entries are tagged, the sound system knows nothing about the rules:

```js
function playCuesSince(state, from) {
  if (muted || !state || !state.log) return;
  var heard = {};
  for (var i = Math.max(0, from); i < state.log.length; i++) {
    var e = state.log[i];
    if (!e || !e.data || !e.data.sound) continue;
    if (heard[e.data.sound]) continue;    // dedupe within one batch
    heard[e.data.sound] = true;
    play(e.data.sound);
  }
}
```

- **Dedupe by cue name per batch.** Several units can die to one attack; a stack of identical
  sounds is a mess rather than emphasis.
- **Unknown cue names are ignored**, so the engine can tag entries with sounds that have not been
  generated yet. Failing loudly because a sound is missing is worse than a silent game.
- **Reading the log is what makes the opponent audible** — their moves are written there exactly
  like yours, so no separate opponent-action notification is needed.

## 7. "Recently played" — the durable record the log can't be

A spotlight animation is gone the moment you look away. A log line is text. Neither answers
*"what did they just play?"* at a glance. So keep a **strip of actual card faces**, newest first.

```js
var RECENT_MAX = 5;
function noteRecent(action) {
  if (!action || action.type !== 'play' || !action.iid) return;
  app.recent.unshift(action.iid);
  if (app.recent.length > RECENT_MAX) app.recent.length = RECENT_MAX;
}
```

```css
#recent { display: flex; gap: .3rem; flex-wrap: wrap; padding: .15rem .6rem .5rem; }
#recent .recent-card { width: 3.1rem; cursor: help; }
.recent-empty { color: var(--muted); font-size: .78em; font-style: italic; }
```

Render each with the normal card renderer at board size and attach the hover preview. **Record it
separately from the spotlight animation on purpose**: a drag skips the animation, but the play must
still appear in the strip. Empty state gets real words (`"Nothing played yet."`), not a blank box.

## 8. Battle line and status prompt

Above the log, one line of *current* state — what the log can't give you because it is history:

```js
if (state.battle) {
  var attacker = nameOrFallback(b.attackerIid, 'a destroyed unit');
  var target = b.target.kind === 'player' ? 'the shield area'
                                          : nameOrFallback(b.target.iid, 'a destroyed unit');
  node.appendChild(el('div', 'battle-line', attacker + '  →  ' + target));
}
```

Note the `'a destroyed unit'` fallbacks — a unit can die mid-battle and the line must still render.

---

# PART TWO — TARGETING

## 9. The model: targeting is a `pendingChoice` on state

Targeting is **not** UI state. The engine parks a question on the state object and stops:

```js
state.pendingChoice = {
  id: 'effect-target',
  player: chooser,                 // controller, or 1 - controller for "opponent chooses"
  prompt: effect.prompt || describeTargeting(effect),
  min: Math.min(minWanted, pool.length),
  max: count,
  contextKey: key,                 // identity, for resume/dedupe
  options: pool.map(function (iid) { return { value: iid, label: labelOf(state, iid) }; })
};
```

Consequences that all fall out for free:
- The **AI answers targeting through the same path as the human** — it is just another legal action.
- Undo works, because the question is part of the state snapshot.
- Tests can assert on targeting without touching the DOM.
- A saved/replayed game resumes mid-prompt.

`min`/`max` express every shape at once: `min:1,max:1` forced single, `min:0,max:1` optional,
`min:1,max:3` "choose 1 to 3", `min:0,max:n` optional multi.

**`min` is clamped to the pool size** (`Math.min(minWanted, pool.length)`) so a card asking for more
targets than exist still resolves against what's there — *except* when the card declares an explicit
`minCount`, which is a hard requirement that fizzles instead (§4).

**Answering is an action**: `{type:'choose', selection:[iid, ...]}`. Declining is
`selection: []`. The UI never mutates the choice — it finds the matching legal action and applies it.

## 10. Three targeting UIs, chosen automatically

The right interface depends on **whether the player can see the options**. Decide it in code, not
per card.

```js
function computeChoiceInteraction(state, out) {
  var choice = state.pendingChoice;
  var cardBacked = choice.options.length > 0;
  for (var i = 0; i < choice.options.length; i++) {
    if (!isRenderedZone(state, choice.options[i].value)) { cardBacked = false; break; }
  }
  if (cardBacked) {
    var isMulti = choice.max > 1;
    for (var j = 0; j < choice.options.length; j++) {
      var v = choice.options[j].value;
      out.roles[v] = (isMulti && app.multiPicks.indexOf(v) !== -1) ? 'picked' : 'target';
    }
  }
  out.cardBackedChoice = cardBacked;
  return out;
}
```

| Situation | UI |
|---|---|
| **All options are cards visible on the board** | Highlight them in place; click the real card |
| **Options are cards the board does not draw** (deck top, trash, a shield) | Centre-screen modal showing the real card faces |
| **Options aren't cards at all** (mulligan, yes/no) | Short button list in the side panel |
| **Yes/no *about* a hidden card** (a triggered ability on a broken shield) | Modal, showing the card being decided over |

That last row is the one people get wrong. **Answering "activate this" without being shown what
"this" is is not a decision.** If the choice names a revealed card, show it — at *preview* size,
because only the preview face carries the ability text the answer turns on.

```js
function choiceWantsModal(state, ctx) {
  var c = state.pendingChoice;
  if (!c) return false;
  if (Engine.isTerminal(state)) return false;
  if (Engine.actingPlayer(state) !== ctx.human) return false;
  if (ctx.cardBackedChoice) return false;                 // board handles it
  if (!c.options || c.options.length === 0) return false; // nothing to show
  if (revealedIid(state, c)) return true;                 // yes/no about a card
  for (var i = 0; i < c.options.length; i++) {
    if (!state.cards[c.options[i].value]) return false;   // not cards -> buttons
  }
  return true;
}
```

## 11. Role colours — the whole targeting vocabulary

Four states, four colours, defined once as CSS variables and applied by the renderer from
`legalActions` + `pendingChoice`. Nothing else.

```css
:root {
  --role-actable:  #f5c34d;   /* this card can do something (your turn, no prompt open) */
  --role-selected: #5b9dff;   /* you have picked this up */
  --role-target:   #ff6bcb;   /* legal answer to the open prompt */
  --role-picked:   #45c98b;   /* already chosen in a multi-pick */
}
.card.role-actable { border-color: var(--role-actable);
                     animation: role-actable-pulse 1.7s ease-in-out infinite; }
.card.role-target  { border-color: var(--role-target);
                     box-shadow: 0 0 0 3px var(--role-target), 0 0 18px rgba(255,107,203,.55); }
.card.role-picked  { border-color: var(--role-picked);
                     box-shadow: 0 0 0 3px var(--role-picked), 0 0 16px rgba(69,201,139,.55); }
.card.role-selected{ border-color: var(--role-selected);
                     box-shadow: 0 0 0 3px var(--role-selected), 0 0 20px rgba(91,157,255,.6); }
.card.role-selected:hover { transform: translateY(-5px); }

@keyframes role-actable-pulse {
  0%,100% { box-shadow: 0 0 0 2px var(--role-actable), 0 0 8px  rgba(245,195,77,.3); }
  50%     { box-shadow: 0 0 0 2px var(--role-actable), 0 0 20px rgba(245,195,77,.7); }
}
```

Reuse the same four variables for non-card targets so the language stays consistent — resource
chips take `outline: 2px solid var(--role-*)`, and a targetable zone takes
`outline: 3px solid var(--role-target); outline-offset: 4px`.

**Actable is marked; destinations are not.** A card with something to do glows. *Where* it can go is
revealed by the drop zones once a drag begins — not by a persistent selection state that clutters
the board before the player has committed to anything.

```js
// Anything with a legal action gets 'actable'; that's the entire rule.
var actions = Engine.legalActions(state);
for (var i = 0; i < actions.length; i++) {
  if (actions[i].iid) bySource[actions[i].iid] = true;
}
for (var iid in bySource) out.roles[iid] = 'actable';
```

**Pulse phase must be shared across redraws.** A rebuilt node restarts its animation, so a board
redrawn once a second produces a stuttering pulse. Set a negative delay computed from the wall clock:

```js
function animationPhase(periodMs) {
  var now = performance.now ? performance.now() : Date.now();
  return '-' + ((now % periodMs) / 1000).toFixed(3) + 's';
}
node.style.animationDelay = animationPhase(1700);
```

## 12. Answering by clicking the card

```js
function onCardClick(iid) {
  if (!state || Engine.isTerminal(state)) return;
  if (Drag.isDragging() || Drag.justDragged()) return;      // see presentation spec §10
  if (!app.busy && state.pendingChoice && Engine.actingPlayer(state) === app.human) {
    handleChoiceClick(iid);
    return;
  }
  inspect(iid);                                             // tapping never changes the game
}
```

**Answering a prompt is the one exception to "tap never changes state."** It is legitimate because
it is a deliberate response to a question the game just asked, and it is the documented way to
answer targeting.

```js
function handleChoiceClick(iid) {
  var choice = state.pendingChoice;
  var isValid = false;
  for (var i = 0; i < choice.options.length; i++) {
    if (choice.options[i].value === iid) { isValid = true; break; }
  }
  if (!isValid) return;                       // clicking a non-option does nothing, silently

  if (choice.max <= 1) {                      // single pick commits immediately
    var actions = Engine.legalActions(state);
    for (var j = 0; j < actions.length; j++) {
      var a = actions[j];
      if (a.type === 'choose' && a.selection.length === 1 && a.selection[0] === iid) {
        onAction(a); return;
      }
    }
    return;
  }
  // multi: toggle, respecting max, and redraw
  var idx = app.multiPicks.indexOf(iid);
  if (idx !== -1) app.multiPicks.splice(idx, 1);
  else if (app.multiPicks.length < choice.max) app.multiPicks.push(iid);
  draw();
}
```

**Multi-pick rules:**
- Clicking a picked card **un-picks** it. Always. No modifier keys.
- Silently refuse picks past `max` rather than swapping or erroring.
- Confirm is **disabled**, not hidden, until `picks.length >= min`. A disabled button explains why
  nothing is happening; a missing one doesn't.
- Show the count explicitly: `"2 of 1–3 selected"`.
- Offer **Clear** once anything is picked.
- Match the answer to a legal action by **set equality**, not order.
- **Reset `multiPicks` on undo, on new game, and after every committed action.** A stale pick list
  applied to a new prompt is a real bug.

```js
function confirmMultiPick() {
  var actions = Engine.legalActions(app.state);
  for (var i = 0; i < actions.length; i++) {
    var a = actions[i];
    if (a.type === 'choose' && sameSet(a.selection, app.multiPicks)) { onAction(a); return; }
  }
}
```

## 13. The choice modal — and the peek

When options are revealed cards, show them big enough to read and put the controls next to them.

```css
#choice-modal { position: fixed; inset: 0; background: rgba(0,0,0,.78);
                display: none; place-items: center; z-index: 58; backdrop-filter: blur(3px); }
#choice-modal.open { display: grid; }
.choice-modal-content { background: var(--panel); border: 1px solid var(--line);
  border-radius: 12px; padding: 1.1rem 1.3rem;
  max-width: min(92vw, 46rem); max-height: 90vh; overflow: auto; text-align: center;
  box-shadow: 0 20px 80px rgba(0,0,0,.6); }
.choice-modal-prompt { font-weight: 700; font-size: 1rem; margin-bottom: .2rem; }
.choice-modal-hint   { color: var(--muted); font-size: .8em; margin-bottom: .6rem; }
.choice-modal-cards  { display: flex; flex-wrap: wrap; gap: .8rem;
                       justify-content: center; align-items: flex-start; margin: .8rem 0 1rem; }
/* Bigger than a board card: these are being read, not just located. */
.choice-modal-cards .card { width: calc(var(--card-board-w) * 1.55); }
/* A single revealed card is the whole subject of the question -> preview proportions. */
.choice-reveal .card { width: var(--card-preview-w); }
@media (max-width: 620px) { .choice-modal-cards .card { width: calc(var(--card-board-w) * 1.9); } }
```

Cards in the modal go through the **same wiring as board cards** so they keep the hover preview and
inspector — without which they cannot be read before picking one, which is the whole point of
revealing them.

### Peek: the modal must be able to get out of the way

**This is the feature everyone forgets.** Picking a target usually depends on what is already on the
table — which the modal is covering. So let the player push it aside *without answering*.

```css
.choice-peek-restore { display: none; }
#choice-modal.peek {
  background: transparent; backdrop-filter: none;
  pointer-events: none;                 /* cards underneath stay hoverable */
  place-items: start center;
}
#choice-modal.peek .choice-modal-content { display: none; }
#choice-modal.peek .choice-peek-restore {
  display: inline-flex; align-items: center; pointer-events: auto;
  margin-top: .5rem; background: var(--accent); color: #06101f;
  border: 0; border-radius: 999px; padding: .45rem 1.1rem;
  font-size: .85rem; font-weight: 700; cursor: pointer;
  box-shadow: 0 6px 20px rgba(0,0,0,.55);
}
```

Requirements:
- A **"Hide — check the board"** button in the controls, and a floating **"Show the cards"** pill
  that lives *outside* the panel so it survives while the panel is hidden.
- **Escape toggles peek**, both directions.
- Toggle it **straight on the DOM**, not through a redraw — nothing about the game should move.
- Hold peek state in the **view layer, not game state**: it is a way of looking at the game, not a
  move in it, and undo must never bring it back.
- **Key the peek state to the choice's identity** so a new prompt is never hidden on arrival:

```js
function choiceKey(choice) {
  // Two shields lost to one attack raise two prompts whose options are both yes/no;
  // without the revealed card in the key, the second inherits the first's peek state.
  return choice.contextKey + '|' + (choice.revealIid || '') + '|' +
         choice.options.map(function (o) { return o.value; }).join(',');
}
```

## 14. The attack arrow — aiming and resolution are the same picture

Declaring an attack and watching one resolve are the same relationship, so draw the same thing.
A drag is simply the moment before the arrow has something to land on.

```css
#arrow-layer { position: fixed; inset: 0; z-index: 45;
               display: none; pointer-events: none; width: 100%; height: 100%; }
#arrow-layer.open { display: block; }
.attack-arrow { fill: none; stroke: var(--danger); stroke-width: 3; stroke-linecap: round;
                filter: drop-shadow(0 2px 6px rgba(0,0,0,.8));
                stroke-dasharray: 10 7;
                animation: attack-arrow-crawl 700ms linear infinite; }
.attack-arrow-head { fill: var(--danger); }
/* While still aiming, the arrow is a proposal rather than a fact. */
.attack-arrow.is-aiming { stroke: var(--role-actable); opacity: .95; }
#arrow-layer:has(.is-aiming) .attack-arrow-head { fill: var(--role-actable); }
@keyframes attack-arrow-crawl { to { stroke-dashoffset: -17; } }
@media (prefers-reduced-motion: reduce) {
  .attack-arrow { animation: none; stroke-dasharray: none; }
}
```

- **z-index 45**: above the board, below every overlay, so a preview or picker still covers it.
  `pointer-events: none` — it is a label, not a control.
- **Colour encodes commitment**: accent/amber while aiming (a proposal), danger red once declared
  (a fact). Same shape, so the transition reads as the same object being confirmed.
- **The dash crawl is what makes it a direction** rather than a line joining two cards. Give the
  path the same shared `animationPhase()` negative delay as the actable pulse, or a redraw snaps
  the crawl back to the start.
- **Curve it, don't straighten it.** With two player mats stacked vertically, a straight arrow runs
  along the same axis as every divider on screen and reads as one more line. Bow it sideways:

```js
var bow = Math.min(120, Math.abs(to.y - from.y) * 0.45) + 20;
path.setAttribute('d', 'M' + from.x + ',' + from.y +
                       ' Q' + (midX + bow) + ',' + midY + ' ' + to.x + ',' + to.y);
```

- **Target resolution cascades**: aimed unit → the base standing in front → the shield area.
  Draw to whatever actually exists.
- Coordinates are **viewport-based**, so recompute on `resize` — and after clearing the aiming
  arrow, restore the declared one if a battle is still live.

## 15. Drop zones as targeting

For the common case — play this card *there*, attack *that* — a drag is the targeting UI, and it is
derived wholly from the engine.

```js
function dropTargetsFor(iid) {
  if (!state || app.busy || Engine.isTerminal(state)) return [];
  if (Engine.actingPlayer(state) !== app.human) return [];
  if (state.pendingChoice) return [];            // a prompt owns the input
  var out = [];
  var actions = actionsFor(state, iid);
  for (var i = 0; i < actions.length; i++) {
    var el = dropZoneFor(actions[i]);            // zones carry data-drop markers
    if (el) out.push({ el: el, action: actions[i] });
  }
  return out;
}
```

**This never decides what a card *is*.** It maps engine actions to zones, so it cannot drift as cards
are added, and a card with no legal actions simply will not drag.

```css
[data-drop].drop-ok, .card.drop-ok  { outline: 2px dashed var(--role-actable); }
[data-drop].drop-hot, .card.drop-hot { outline-color: var(--role-picked); }  /* solid + green */
```

Dashed amber = *possible*; solid green = *this one, right now*. Same colour language as the roles.

**While a prompt is open, drag is disabled.** One targeting modality at a time.

## 16. The prompt line — always say what the game is waiting for

There is never a state where the player can be uncertain whose move it is or what is expected.

```js
if (Engine.isTerminal(state))              text = 'Game over.';
else if (acting !== human)                 text = 'Waiting for the opponent…';   // .waiting, italic
else if (state.pendingChoice) {
  text = state.pendingChoice.prompt;
  if (ctx.cardBackedChoice) text += state.pendingChoice.max > 1
      ? ' Click cards on the board to pick them.'
      : ' Click a highlighted card.';
}
else if (state.step === 'block')  text = 'Incoming attack — tap a highlighted unit to block, or press space to let it through.';
else if (state.step === 'action') text = 'Response window. Drag a card to play it, or press space to pass.';
else if (endStepDiscard)          text = 'Discard down to ' + LIMITS.HAND_SIZE + ' cards — tap one.';
else                              text = 'Drag a card onto the board to play it, or a unit onto an enemy to attack.';
```

**Append the interaction hint to the card's own prompt text.** The card says *what* ("Choose an
enemy unit"); the UI says *how* ("Click a highlighted card"). The card author should never have to
know the input model.

**Give every effect a default prompt** so an unnamed one is never blank:
`effect.prompt || describeTargeting(effect)`. Make `describeTargeting` produce real English from
the effect data (see `CARD-GAME-LESSONS.md` §2 — the same generate-don't-store rule applies, and the
same test should catch empty output).

### Auto-pass: a window with nothing in it says so

```js
if (ctx.autoPass) {
  var n = ctx.autoPass.secondsLeft;
  auto.appendChild(el('span', 'auto-pass-line', 'No playable cards.'));
  auto.appendChild(el('span', 'auto-pass-count',
    'Passing in ' + n + ' second' + (n === 1 ? '' : 's') + '…'));
}
```

```css
.auto-pass { display: flex; flex-direction: column; gap: .1rem;
             margin-top: .45rem; padding: .4rem .55rem;
             border-left: 2px solid var(--role-actable);
             background: rgba(245,195,77,.08); border-radius: 0 6px 6px 0; }
.auto-pass-count { font-size: .8em; color: var(--muted); font-variant-numeric: tabular-nums; }
```

Show the clock running down so passing never looks like the game skipped the player.
`font-variant-numeric: tabular-nums` stops the countdown from jittering as digits change width.

## 17. Buttons are the fallback, not the interface

Only things that are *not* a card get buttons: end turn, pass, decline, clear, confirm.

```js
var actions = Engine.legalActions(state);
for (var i = 0; i < actions.length; i++) {
  if (!actions[i].iid) node.appendChild(actionButton(actions[i], ctx));  // no card -> button
}
```

That `if (!actions[i].iid)` is the entire rule: an action attached to a card is performed on the
card. **Hovering an action button highlights the card it concerns** — the reverse link, so a button
list is never a set of unexplained verbs:

```js
var focusIid = action.iid || (action.selection && action.selection[0]);
if (focusIid) {
  button.addEventListener('mouseenter', function () { ctx.onHighlight(focusIid); });
  button.addEventListener('mouseleave', function () { ctx.onHighlight(null); });
}
```

Decline is only offered when `choice.min === 0`, and it is found by looking for the legal action
with `selection.length === 0` — never synthesised by the UI.

---

## 18. Build order

1. `log(state, message, data)` with the `data` object — **before writing a second log call**.
2. Tag every existing call site with `iid` and `sound` as you write it.
3. Log panel: newest-first, 60-entry window, skip `silent`.
4. `humanise()` with sentinels, bare-verb table, re-capitalisation.
5. `logSubject()` + `.card-ref` hover targets, with the whole-line fallback.
6. Fizzle `notice: true` on empty and undersized target pools.
7. Recently-played strip (5 cards, newest first).
8. Audio riding `data.sound`, deduped per batch, unknown names ignored.
9. `state.pendingChoice` + `{type:'choose', selection}` actions in the engine.
10. Role colours as four CSS variables; `actable` from `legalActions`.
11. Click-to-answer on the board for visible options; `multiPicks` toggle + Confirm/Clear.
12. Choice modal for options the board doesn't draw, **including peek + Escape**.
13. Drop zones derived from actions; dashed-amber `drop-ok` / solid-green `drop-hot`.
14. Attack arrow, curved, dash-crawling, amber-while-aiming.
15. Prompt line covering every state, plus auto-pass countdown.
