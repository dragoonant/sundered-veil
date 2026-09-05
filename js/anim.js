// anim.js — the battle animation layer. Every shot, lunge and defeat is DRAWN before
// the board redraws, so a player watches the hit leave one card and land on another
// instead of numbers changing and cards vanishing. Two halves:
//
//   plan(prev, next, fromLog, humanSeat) — PURE. Reads the log entries one apply
//     added and returns the steps to draw. Runs headless (tests/test-anim.js).
//   run(steps, next, done) — DOM. Plays the steps on the OLD board (the caller has
//     not rendered `next` yet, so a defeated card is still on screen to die), then
//     hands control back for the redraw.
//
// Sound tags on animated entries (attack / hit / destroy) are voiced HERE, at the
// moment of the picture, not by js/sound.js at apply time — see the `animated` flag
// on SB.sound.play. Sprites live in art/fx/ (tools/gen-fx.mjs); a missing sprite
// falls back to a CSS-drawn bolt / flash so a fresh clone still animates.
//
// Melee vs ranged: card data has no such field. A ground unit whose traits include a
// force-wielding or blade-bearing trait (see MELEE_TRAITS) lunges; everything else,
// and every space unit, fires a bolt. Ability damage is always a bolt.
(function (SB) {
  'use strict';

  // Trait ids from the data (display names live in names.js): the force-user, the two
  // orders of force-user, the blade upgrade trait, the hunter order and the night clan.
  const MELEE_TRAITS = ['tr13', 'tr22', 'tr40', 'tr26', 'tr20', 'tr31'];

  // Durations at full speed, ms. The whole point is that these are SLOW enough to
  // read: a bolt is in the air for half a second, the impact holds, then the next
  // beat starts. 'quick' mode scales them by RATE_QUICK.
  const D = {
    travel: 520,      // bolt in flight
    impact: 460,      // burst / slash on the target, numbers update at its start
    lunge: 480,       // melee card rushing the target
    recoil: 380,      // melee card returning
    stagger: 150,     // between bolts of one volley
    beatGap: 180,     // between steps
    defeatHold: 320,  // smoke on the dying card before it leaves
    defeatFly: 850,   // shrinking into the discard pile
    discardFly: 650,  // an event / hand card sliding to the pile
    spotWait: 700,    // let a played card's spotlight land before firing from it
    blastCharge: 750, // the doomed base glowing and cracking open before it goes
    blastBoom: 1300,  // the flash, the shockwave ring and the debris
    blastHold: 1000,  // the beat of quiet after the planet, before the end video
  };
  const RATE_QUICK = 0.45;

  // ======================= planning (pure) =======================

  function aspectColor(card) {
    const a = (card && card.aspects) || [];
    if (a.indexOf('villainy') >= 0) return 'red';
    if (a.indexOf('heroism') >= 0) return 'blue';
    return 'gold';
  }

  function unitIn(prev, next, uid) {
    return SB.findUnit(prev, uid) || SB.findUnit(next, uid) || null;
  }

  function isMelee(state, unit) {
    if (!unit) return false;
    if (SB.arenaOf(state, unit) !== 'ground') return false;
    const ts = SB.unitTraits(state, unit);
    return MELEE_TRAITS.some(function (t) { return ts.indexOf(t) >= 0; });
  }

  function fromKey(from) { return from.kind + ':' + (from.uid != null ? from.uid : from.player); }

  SB.anim = SB.anim || {};

  // Returns [] when nothing in the slice is worth drawing.
  SB.anim.plan = function (prev, next, fromLog, humanSeat) {
    const fresh = next.log.slice(fromLog);
    const strikes = [];
    const gones = [];
    let blast = null;              // the base that died, when this apply ended the match
    let spot = null, spotPlayer = null;
    const actor = SB.whoActs(prev);

    function sourceFor(l) {
      if (l.source != null) {
        const u = unitIn(prev, next, l.source);
        if (u) {
          const state = SB.findUnit(prev, l.source) ? prev : next;
          return { from: { kind: 'unit', uid: l.source, owner: u.owner },
            color: aspectColor(SB.card(u.cardId)),
            melee: !!l.combat && isMelee(state, u) };
        }
      }
      if (spot) return { from: { kind: 'spot', cardId: spot, owner: spotPlayer }, color: aspectColor(SB.card(spot)), melee: false };
      const p = actor != null ? actor : 0;
      return { from: { kind: 'base', player: p, owner: p },
        color: aspectColor(SB.card(prev.players[p].leader.cardId)), melee: false };
    }

    function addHit(l) {
      if (l.type === 'baseDamage' && l.why === 'decked') return;   // no attacker to draw
      const src = sourceFor(l);
      const hit = {
        to: l.type === 'baseDamage' ? { kind: 'base', player: l.player } : { kind: 'unit', uid: l.uid },
        amount: l.type === 'shieldPopped' ? 0 : (l.amount || 0),
        shield: l.type === 'shieldPopped',
      };
      const key = fromKey(src.from);
      const last = strikes[strikes.length - 1];
      // Several hits from one source in a row are one volley (an "each enemy unit"
      // effect); an overwhelm spill-over rejoins the strike that caused it even
      // though the defender's return fire was logged in between.
      let home = last && last.key === key ? last : null;
      if (!home && l.why === 'overwhelm') {
        for (let i = strikes.length - 1; i >= 0 && !home; i--) if (strikes[i].key === key) home = strikes[i];
      }
      if (home) { home.hits.push(hit); return; }
      strikes.push({ kind: 'strike', key: key, from: src.from, color: src.color,
        style: src.melee ? 'melee' : 'ranged', hits: [hit] });
    }

    fresh.forEach(function (l) {
      switch (l.type) {
        case 'playCard': case 'smuggled': case 'plotPlayed':
          spot = l.cardId; spotPlayer = l.player; break;
        case 'unitDamage': case 'shieldPopped': case 'baseDamage':
          addHit(l); break;
        case 'defeated': {
          const u = SB.findUnit(prev, l.uid);
          if (!u) break;                       // arrived and died inside one apply: never drawn
          const card = SB.card(l.cardId);
          gones.push({ kind: 'defeat', uid: l.uid, cardId: l.cardId, owner: u.owner,
            leader: card.type === 'leader', token: !!card.token });
          break;
        }
        case 'upgradeDefeated': {
          const u = SB.findUnit(prev, l.uid);
          if (!u) break;
          gones.push({ kind: 'upgradeGone', bearerUid: l.uid, cardId: l.cardId, owner: u.owner });
          break;
        }
        case 'discarded':
          gones.push({ kind: 'handDiscard', cardId: l.cardId, player: l.player });
          break;
        // The killing blow: a base is destroyed, so its planet goes with it.
        case 'gameOver':
          if (l.winner === 0 || l.winner === 1) blast = { kind: 'baseBlast', player: 1 - l.winner };
          break;
      }
    });

    const steps = [];
    strikes.forEach(function (s) { delete s.key; steps.push(s); });
    gones.forEach(function (g) { steps.push(g); });
    if (spot && SB.card(spot).type === 'event') steps.push({ kind: 'eventToDiscard', cardId: spot, player: spotPlayer });
    if (blast) steps.push(blast);      // always last: nothing follows a dead planet
    // A spotlight is landing at the same time: let it arrive before anything fires
    // from it, or the bolt leaves a card that is still flying to the middle.
    if (steps.length && spot) steps.unshift({ kind: 'wait', ms: D.spotWait });
    return steps;
  };

  // ======================= playback (DOM) =======================

  const STORE = 'sb.anim';
  let mode = null;            // 'full' | 'quick' | 'off'
  let job = null;             // the running sequence

  function readMode() {
    if (mode) return mode;
    let saved = null;
    try { saved = window.localStorage && localStorage.getItem(STORE); } catch (e) { /* private mode */ }
    if (saved === 'full' || saved === 'quick' || saved === 'off') mode = saved;
    else mode = (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) ? 'off' : 'full';
    return mode;
  }

  SB.anim.mode = readMode;
  SB.anim.setMode = function (m) {
    mode = m;
    try { localStorage.setItem(STORE, m); } catch (e) { /* ignore */ }
    if (m === 'off') SB.anim.skip();
  };
  SB.anim.cycleMode = function () {
    const order = ['full', 'quick', 'off'];
    SB.anim.setMode(order[(order.indexOf(readMode()) + 1) % order.length]);
    return mode;
  };
  SB.anim.busy = function () { return !!job; };
  // Would run() draw anything for these steps? (sound.js asks, to leave the clips to us.)
  SB.anim.willAnimate = function (steps) { return !!(steps && steps.length) && readMode() !== 'off'; };

  function $(id) { return document.getElementById(id); }
  function el(tag, cls) { const n = document.createElement(tag); if (cls) n.className = cls; return n; }
  let debugRate = null;       // SB.anim._debugRate(4) plays everything 4x slower (inspection only)
  function ms(n) { return Math.round(n * (debugRate || (readMode() === 'quick' ? RATE_QUICK : 1))); }
  SB.anim._debugRate = function (r) { debugRate = r || null; };
  function sfx(name) { if (SB.sound && SB.sound.sfx) SB.sound.sfx(name); }

  function layer() {
    let n = $('fx-layer');
    if (!n) { n = el('div'); n.id = 'fx-layer'; document.body.appendChild(n); }
    return n;
  }
  function lock(on) {
    let n = $('fx-lock');
    if (!n) {
      n = el('div'); n.id = 'fx-lock'; n.title = SB.names.ui.animSkip || '';
      n.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); SB.anim.skip(); });
      document.body.appendChild(n);
    }
    n.classList.toggle('open', !!on);
    document.body.classList.toggle('is-animating', !!on);
  }
  function onKey(e) { if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); SB.anim.skip(); } }

  // ---- node lookup on the old board ----
  function nodeFor(ref, humanSeat) {
    if (!ref) return null;
    if (ref.kind === 'unit') return document.querySelector('.card[data-iid="' + ref.uid + '"]');
    if (ref.kind === 'base') return document.querySelector('[data-base-player="' + ref.player + '"]');
    if (ref.kind === 'spot') return $('spotlight') || slot('leader', ref.owner, humanSeat);
    if (ref.kind === 'leader') return slot('leader', ref.player, humanSeat);
    return null;
  }
  function slot(what, player, humanSeat) {
    return $((player === humanSeat ? 'my-' : 'enemy-') + what);
  }
  // A unit created by this very apply has no node yet: fall back down the cascade so
  // the shot still comes from somewhere on that player's side.
  function originNode(from, humanSeat) {
    return nodeFor(from, humanSeat) || $('spotlight') ||
      (from.owner != null ? slot('leader', from.owner, humanSeat) : null);
  }
  function centre(node) {
    const r = node.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, r: r };
  }

  // ---- in-place number patching, so the redraw later changes nothing ----
  function patchTarget(to, next) {
    const node = nodeFor(to, job.humanSeat);
    if (!node) return;
    if (to.kind === 'base') {
      const b = next.players[to.player].base;
      const hp = SB.card(b.cardId).hp;
      const st = node.querySelector('.stat.hp');
      if (st) { st.textContent = (hp - b.damage) + '/' + hp; st.classList.toggle('damaged', b.damage > 0); }
      return;
    }
    const u = SB.findUnit(next, to.uid);
    const st = node.querySelector('.stat.hp');
    if (u) {
      if (st) { st.textContent = String(SB.unitRemainingHp(next, u)); st.classList.toggle('damaged', u.damage > 0); }
      let m = node.querySelector('.damage-marker');
      if (u.damage > 0) {
        if (!m) { m = el('div', 'damage-marker'); node.appendChild(m); }
        m.textContent = String(u.damage);
      } else if (m) m.remove();
      const sh = node.querySelector('.shield-badge');
      if (sh) { if (u.shields > 0) sh.textContent = '◈' + (u.shields > 1 ? u.shields : ''); else sh.remove(); }
    } else {
      if (st) { st.textContent = '0'; st.classList.add('damaged'); }
    }
  }

  function floatNumber(node, text, cls) {
    const c = centre(node);
    const n = el('div', 'fx-number ' + (cls || ''));
    n.textContent = text;
    n.style.left = c.x + 'px'; n.style.top = (c.y - c.h * 0.15) + 'px';
    layer().appendChild(n);
    n.style.setProperty('--dur', ms(900) + 'ms');
    job.trash.push(n);
    later(ms(950), function () { n.remove(); });
  }

  function shake(node) {
    node.classList.remove('fx-hit');
    void node.offsetWidth;                    // restart the keyframes on a repeat hit
    node.classList.add('fx-hit');
    later(ms(420), function () { node.classList.remove('fx-hit'); });
  }

  function sprite(name, cls) {
    const wrap = el('div', 'fx-sprite ' + cls);
    const img = el('img');
    img.src = 'art/fx/' + name + '.webp';
    img.alt = '';
    img.draggable = false;
    img.onerror = function () { wrap.classList.add('no-sprite'); img.remove(); };
    wrap.appendChild(img);
    return wrap;
  }

  // Burst or slash on a target: scale up, fade out, gone.
  function impact(node, kind, color) {
    const c = centre(node);
    const size = Math.max(c.w, c.h) * (kind === 'slash' ? 1.5 : 1.7);
    const s = sprite(kind === 'slash' ? 'slash' : 'burst', 'fx-impact fx-' + kind + ' is-' + color);
    s.style.left = (c.x - size / 2) + 'px'; s.style.top = (c.y - size / 2) + 'px';
    s.style.width = size + 'px'; s.style.height = size + 'px';
    s.style.setProperty('--dur', ms(D.impact) + 'ms');
    layer().appendChild(s);
    job.trash.push(s);
    later(ms(D.impact) + 40, function () { s.remove(); });
  }

  // The moment a hit lands: sound, flash, shake, number, and the card's stats change.
  function land(hit, next, color, melee) {
    const node = nodeFor(hit.to, job.humanSeat);
    if (hit.to.kind === 'base') sfx('baseHit');
    else if (hit.shield) sfx('shield');
    else sfx(melee ? 'slash' : 'laserHit');
    if (!node) { return; }
    impact(node, hit.shield ? 'shield' : (melee ? 'slash' : 'burst'), color);
    shake(node);
    if (hit.shield) floatNumber(node, SB.names.ui.animShield || '◈', 'is-shield');
    else if (hit.amount > 0) floatNumber(node, '−' + hit.amount, hit.to.kind === 'base' ? 'is-base' : '');
    patchTarget(hit.to, next);
  }

  // ---- a bolt from A to B ----
  function fireBolt(fromNode, hit, next, color, cb) {
    const a = centre(fromNode);
    const toNode = nodeFor(hit.to, job.humanSeat);
    if (!toNode) { land(hit, next, color, false); cb(); return; }
    const b = centre(toNode);
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const ang = Math.atan2(dy, dx) * 180 / Math.PI;
    const len = Math.min(150, Math.max(90, a.w * 1.6));
    const bolt = sprite('bolt-' + color, 'fx-bolt is-' + color);
    bolt.style.width = len + 'px'; bolt.style.height = (len * 0.3125) + 'px';
    bolt.style.left = (a.x - len / 2) + 'px'; bolt.style.top = (a.y - len * 0.156) + 'px';
    bolt.style.transform = 'rotate(' + ang + 'deg) translateX(' + (-a.w * 0.15) + 'px)';
    const muzzle = el('div', 'fx-muzzle is-' + color);
    muzzle.style.left = a.x + 'px'; muzzle.style.top = a.y + 'px';
    layer().appendChild(muzzle);
    layer().appendChild(bolt);
    job.trash.push(bolt, muzzle);
    sfx('laser');
    // Forced layout read, then the end state: transitions, not rAF (LESSONS §7).
    void bolt.getBoundingClientRect();
    const t = ms(D.travel);
    bolt.style.transition = 'transform ' + t + 'ms cubic-bezier(.5,0,.9,.6)';
    bolt.style.transform = 'rotate(' + ang + 'deg) translateX(' + (dist - b.w * 0.2) + 'px)';
    later(ms(220), function () { muzzle.remove(); });
    later(t, function () {
      bolt.remove();
      land(hit, next, color, false);
      cb();
    });
  }

  // ---- the melee lunge: the attacker's card itself rushes the target ----
  function lunge(fromNode, hit, next, color, cb) {
    const toNode = nodeFor(hit.to, job.humanSeat);
    if (!toNode) { land(hit, next, color, true); cb(); return; }
    const a = centre(fromNode), b = centre(toNode);
    const clone = fromNode.cloneNode(true);
    clone.className = fromNode.className.replace(/\b(role-\S+|is-dragging-source|drop-\S+)\b/g, '') + ' fx-clone';
    clone.removeAttribute('data-iid'); clone.removeAttribute('tabindex');
    clone.style.left = a.r.left + 'px'; clone.style.top = a.r.top + 'px';
    clone.style.width = a.w + 'px'; clone.style.height = a.h + 'px';
    layer().appendChild(clone);
    fromNode.classList.add('fx-hidden');
    job.trash.push(clone);
    job.unhide.push(fromNode);
    sfx('lunge');
    void clone.getBoundingClientRect();
    // Stop just short of the target's centre so the slash reads as landing ON it.
    const dx = b.x - a.x, dy = b.y - a.y;
    const k = 1 - Math.min(0.35, (b.w * 0.45) / Math.max(1, Math.sqrt(dx * dx + dy * dy)));
    const t1 = ms(D.lunge), t2 = ms(D.recoil);
    clone.style.transition = 'transform ' + t1 + 'ms cubic-bezier(.6,-.1,.9,.5)';
    clone.style.transform = 'translate(' + (dx * k) + 'px,' + (dy * k) + 'px) scale(1.08)';
    later(t1, function () {
      land(hit, next, color, true);
      clone.style.transition = 'transform ' + t2 + 'ms cubic-bezier(.2,.7,.4,1)';
      clone.style.transform = 'translate(0,0) scale(1)';
      later(t2 + 20, function () {
        clone.remove();
        fromNode.classList.remove('fx-hidden');
        cb();
      });
    });
  }

  function playStrike(step, next, cb) {
    const from = originNode(step.from, job.humanSeat);
    if (!from) {
      // Nowhere to draw from: still show the hits landing, so the numbers never
      // change silently.
      step.hits.forEach(function (h) { land(h, next, step.color, false); });
      later(ms(D.impact), cb); return;
    }
    if (step.style === 'melee' && step.hits.length === 1) { lunge(from, step.hits[0], next, step.color, cb); return; }
    let pending = step.hits.length;
    step.hits.forEach(function (h, i) {
      later(i * ms(D.stagger), function () {
        fireBolt(from, h, next, step.color, function () { if (--pending === 0) later(ms(D.impact) - ms(200), cb); });
      });
    });
  }

  // ---- leaving the board: shrink into the pile ----
  function flyTo(cardNode, rect, destNode, dur, sound, cb) {
    const clone = cardNode.cloneNode(true);
    clone.className = cardNode.className.replace(/\b(role-\S+|is-dragging-source|drop-\S+|fx-hidden)\b/g, '') + ' fx-clone fx-flyer';
    clone.removeAttribute('data-iid'); clone.removeAttribute('tabindex');
    clone.style.left = rect.left + 'px'; clone.style.top = rect.top + 'px';
    clone.style.width = rect.width + 'px'; clone.style.height = rect.height + 'px';
    layer().appendChild(clone);
    job.trash.push(clone);
    if (sound) sfx(sound);
    void clone.getBoundingClientRect();
    let tx = 0, ty = -rect.height * 0.3, sc = 0.05;
    if (destNode) {
      const d = destNode.getBoundingClientRect();
      tx = (d.left + d.width / 2) - (rect.left + rect.width / 2);
      ty = (d.top + d.height / 2) - (rect.top + rect.height / 2);
      sc = Math.max(0.12, (d.width / rect.width) * 0.55);
    }
    clone.style.transition = 'transform ' + dur + 'ms cubic-bezier(.4,0,.8,.3), opacity ' + dur + 'ms ease-in';
    clone.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + sc + ') rotate(' + (tx > 0 ? 18 : -18) + 'deg)';
    clone.style.opacity = '0';
    later(dur, function () {
      clone.remove();
      if (destNode) {
        destNode.classList.remove('fx-received'); void destNode.offsetWidth; destNode.classList.add('fx-received');
        later(ms(500), function () { destNode.classList.remove('fx-received'); });
      }
      cb();
    });
  }

  function playDefeat(step, next, cb) {
    const node = nodeFor({ kind: 'unit', uid: step.uid }, job.humanSeat);
    if (!node) { cb(); return; }
    const c = centre(node);
    // A leader goes home to its slot, a token just dissolves, a card is discarded.
    const dest = step.leader ? slot('leader', step.owner, job.humanSeat)
      : (step.token ? null : slot('discard', step.owner, job.humanSeat));
    const size = Math.max(c.w, c.h) * 1.9;
    const smoke = sprite('shatter', 'fx-impact fx-smoke');
    smoke.style.left = (c.x - size / 2) + 'px'; smoke.style.top = (c.y - size / 2) + 'px';
    smoke.style.width = size + 'px'; smoke.style.height = size + 'px';
    smoke.style.setProperty('--dur', ms(D.defeatHold + D.defeatFly) + 'ms');
    layer().appendChild(smoke);
    job.trash.push(smoke);
    sfx('defeat');
    shake(node);
    later(ms(D.defeatHold), function () {
      node.classList.add('fx-hidden');
      job.unhide.push(node);
      flyTo(node, c.r, dest, ms(D.defeatFly), null, function () { smoke.remove(); cb(); });
    });
  }

  function freshCard(cardId, rect) {
    const n = SB.renderCard({ cardId: cardId }, { size: 'board' });
    n.style.position = 'fixed';
    return n;
  }

  function playUpgradeGone(step, next, cb) {
    const bearer = nodeFor({ kind: 'unit', uid: step.bearerUid }, job.humanSeat);
    if (!bearer) { cb(); return; }
    const r = bearer.getBoundingClientRect();
    const rect = { left: r.left + r.width * 0.15, top: r.top - r.height * 0.1, width: r.width * 0.9, height: r.height * 0.9 };
    flyTo(freshCard(step.cardId), rect, slot('discard', step.owner, job.humanSeat), ms(D.discardFly), 'discard', cb);
  }

  function playEventToDiscard(step, next, cb) {
    const spot = $('spotlight');
    let rect;
    if (spot) {
      const inner = spot.firstElementChild || spot;
      rect = inner.getBoundingClientRect();
      spot.remove();                         // we take over from the spotlight's own fade
    } else {
      const hand = step.player === job.humanSeat ? $('hand') : $('enemy-hand');
      if (!hand) { cb(); return; }
      const h = hand.getBoundingClientRect();
      rect = { left: h.left + h.width / 2 - 40, top: h.top, width: 80, height: 112 };
    }
    flyTo(freshCard(step.cardId), rect, slot('discard', step.player, job.humanSeat), ms(D.discardFly), 'discard', cb);
  }

  function playHandDiscard(step, next, cb) {
    const bar = step.player === job.humanSeat ? $('hand') : $('enemy-hand');
    if (!bar) { cb(); return; }
    const h = bar.getBoundingClientRect();
    const rect = { left: h.left + h.width / 2 - 40, top: h.top + 4, width: 80, height: 112 };
    flyTo(freshCard(step.cardId), rect, slot('discard', step.player, job.humanSeat), ms(D.discardFly), 'discard', cb);
  }

  // ---- the planet goes: the finishing blow on a base ----
  // Drawn in front of the dead base, not on top of a card that leaves: the base
  // stays where it is and the planet blows apart over it. Composed from CSS layers
  // (glowing core, white flash, the equatorial shockwave ring, debris shards) so it
  // needs no sprite; the pieces read the two durations off the wrapper.
  function playBaseBlast(step, cb) {
    const node = nodeFor({ kind: 'base', player: step.player }, job.humanSeat);
    const charge = ms(D.blastCharge), boom = ms(D.blastBoom);
    // The hold is the caller's one second of quiet, deliberately NOT scaled by the
    // speed setting: it is a pause to let the picture land, not part of the picture.
    const after = boom + D.blastHold;
    if (!node) { later(after, cb); return; }
    const c = centre(node);
    const size = Math.max(c.w, c.h) * 2.6;
    const wrap = el('div', 'fx-planet-blast');
    wrap.style.left = (c.x - size / 2) + 'px'; wrap.style.top = (c.y - size / 2) + 'px';
    wrap.style.width = size + 'px'; wrap.style.height = size + 'px';
    wrap.style.setProperty('--charge', charge + 'ms');
    wrap.style.setProperty('--boom', boom + 'ms');
    ['pb-planet', 'pb-cracks', 'pb-flash', 'pb-ring', 'pb-ring pb-ring-2'].forEach(function (cls) {
      wrap.appendChild(el('div', cls));
    });
    for (let i = 0; i < 10; i++) {
      const sh = el('div', 'pb-shard');
      sh.style.setProperty('--a', (i * 36 + (i % 3) * 7) + 'deg');
      wrap.appendChild(sh);
    }
    layer().appendChild(wrap);
    job.trash.push(wrap);
    sfx('baseHit');
    shake(node);
    later(charge, function () { sfx('defeat'); shake(node); });
    later(after, function () { wrap.remove(); cb(); });
  }

  // ---- the sequencer ----
  function later(delay, fn) {
    if (!job) return;
    const t = setTimeout(function () {
      if (!job) return;
      const i = job.timers.indexOf(t); if (i >= 0) job.timers.splice(i, 1);
      fn();
    }, delay);
    job.timers.push(t);
  }

  function finish() {
    if (!job) return;
    const j = job;
    job = null;
    j.timers.forEach(clearTimeout);
    j.trash.forEach(function (n) { if (n && n.parentNode) n.remove(); });
    j.unhide.forEach(function (n) { n.classList.remove('fx-hidden', 'fx-hit'); });
    const l = $('fx-layer'); if (l) l.textContent = '';
    lock(false);
    document.removeEventListener('keydown', onKey, true);
    j.done();
  }

  SB.anim.skip = function () { finish(); };

  SB.anim.run = function (steps, next, humanSeat, done) {
    if (job) finish();                       // a new action ends the old picture
    if (!SB.anim.willAnimate(steps)) { done(); return; }
    job = { timers: [], trash: [], unhide: [], done: done, humanSeat: humanSeat };
    lock(true);
    document.addEventListener('keydown', onKey, true);
    let i = 0;
    function step() {
      if (!job) return;
      if (i >= steps.length) { finish(); return; }
      const s = steps[i++];
      const next2 = function () { later(ms(D.beatGap), step); };
      switch (s.kind) {
        case 'wait': later(ms(s.ms), step); break;
        case 'strike': playStrike(s, next, next2); break;
        case 'defeat': playDefeat(s, next, next2); break;
        case 'upgradeGone': playUpgradeGone(s, next, next2); break;
        case 'eventToDiscard': playEventToDiscard(s, next, next2); break;
        case 'handDiscard': playHandDiscard(s, next, next2); break;
        case 'baseBlast': playBaseBlast(s, step); break;   // last step: no beat gap after it
        default: step();
      }
    }
    step();
  };
})(window.SB = window.SB || {});
