// cardview.js — THE card renderer (CARD-PRESENTATION-SPEC §1–§9): one function,
// three sizes (board/hand/preview). Art fills the face; text floats on a scrim;
// the preview adds the detail block, glossary and token data. UI-only file.
(function (SB) {
  'use strict';

  // ---- art cache (§11): one decoded prototype per file, cloned per render ----
  const artProtos = {};   // cardId -> HTMLImageElement (painted) | 'failed'
  const svgProtos = {};   // cardId -> SVGElement prototype

  function paintedProto(cardId) {
    if (artProtos[cardId]) return artProtos[cardId];
    const proto = new Image();
    proto.className = 'art art-painted';
    proto.alt = '';
    proto.draggable = false;                 // load-bearing: native image drag kills pointer drags
    proto.setAttribute('aria-hidden', 'true');
    proto.decoding = 'sync';                 // NOT lazy/async — they defer paint past the clone frame
    proto.src = (SB.artUrl ? SB.artUrl(cardId) : 'art/' + cardId + '.png');
    artProtos[cardId] = proto;
    return proto;
  }

  // Deterministic SVG fallback seeded from the card id (§3): consistent across
  // runs, distinct between neighbors, faction-tinted.
  function svgFallback(cardId) {
    if (svgProtos[cardId]) return svgProtos[cardId].cloneNode(true);
    const rand = SB.rng('art|' + cardId);
    const card = SB.cards[cardId] || {};
    const hue = Math.floor(rand() * 360);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 50 70');
    svg.setAttribute('class', 'art');
    svg.setAttribute('aria-hidden', 'true');
    let inner = '<rect width="50" height="70" fill="hsl(' + hue + ',30%,16%)"/>';
    for (let i = 0; i < 5; i++) {
      const cx = 8 + rand() * 34, cy = 8 + rand() * 44, r = 4 + rand() * 12;
      inner += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + r.toFixed(1) +
        '" fill="hsl(' + ((hue + 30 + i * 25) % 360) + ',45%,' + (30 + i * 8) + '%)" opacity=".55"/>';
    }
    inner += '<polygon points="25,14 36,34 25,54 14,34" fill="hsl(' + ((hue + 180) % 360) +
      ',55%,62%)" opacity=".85"/>';
    svg.innerHTML = inner;
    svgProtos[cardId] = svg;
    return svg.cloneNode(true);
  }

  const ASPECT_CLASS = { vigilance: 'color-vigilance', command: 'color-command',
    aggression: 'color-aggression', cunning: 'color-cunning', heroism: 'color-heroism',
    villainy: 'color-villainy' };

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // Facing definition for display (leaders on the board show their unit side).
  function faceDef(card, unit) {
    if (card.type === 'leader' && unit) return card.deployedSide;
    return card;
  }

  // ---- the renderer (§1) ---------------------------------------------------
  // ref: {cardId, unit?, hidden?} — unit is a live board instance when present.
  // opts: {size: 'board'|'hand'|'preview', state?, basePlayer?}
  //   basePlayer — the seat a base card belongs to, so its HP reads from the right
  //   player when both decks run the same base.
  SB.renderCard = function (ref, opts) {
    const size = opts.size || 'board';
    const state = opts.state || null;
    const cardId = ref.cardId;
    const root = el('div', 'card card-' + size);
    root.dataset.defId = cardId;
    if (ref.unit) root.dataset.iid = ref.unit.uid;

    if (ref.hidden) {                       // face-down variant
      root.classList.add('card-back');
      root.appendChild(el('div', 'back-mark', '✦'));
      return root;
    }
    let card;
    try { card = SB.card(cardId); } catch (e) {
      root.classList.add('card-missing');   // render something rather than throw
      root.appendChild(el('div', 'card-name', '—'));
      return root;
    }
    const def = faceDef(card, ref.unit);
    const aspects = card.aspects || [];
    if (aspects.length) root.classList.add(ASPECT_CLASS[aspects[0]] || 'color-heroism');

    // Layer 0: art + scrim (scrim is .card-art::after in CSS).
    const artWrap = el('div', 'card-art');
    // Once a card's art has 404'd its slot holds the 'failed' sentinel, not an <img>.
    // Every later render of that card must take the SVG fallback path rather than try
    // to clone a string — otherwise one missing art file breaks the whole board.
    const failed = artProtos[cardId] === 'failed';
    const img = failed ? null : paintedProto(cardId).cloneNode(false);
    if (img) {
      img.onerror = function () {
        artProtos[cardId] = 'failed';
        const holder = img.closest('[data-def-id]');
        if (holder) {
          const wrap = holder.querySelector('.card-art');
          if (wrap) { wrap.replaceChild(svgFallback(cardId), img); }
        }
      };
    }
    artWrap.appendChild(img || svgFallback(cardId));
    root.appendChild(artWrap);

    // Layer 3 (top row): cost + aspect pips.
    const corners = el('div', 'card-corners');
    if (card.type !== 'base' && card.type !== 'leader') {
      const cost = state && opts.costFor != null
        ? SB.cardCost(state, opts.costFor, cardId) : card.cost;
      const pip = el('span', 'pip cost', String(cost));
      pip.title = 'Cost — this many ready resources are exhausted to play it';
      corners.appendChild(pip);
    }
    if (card.type === 'leader') {
      const pip = el('span', 'pip cost', String(card.deployCost));
      pip.title = 'Deploy threshold — resources you must control';
      corners.appendChild(pip);
    }
    const asp = el('span', 'pip aspects');
    aspects.forEach(function (a) {
      const dot = el('span', 'aspect-dot aspect-' + a);
      dot.title = SB.names.aspects[a] || a;
      asp.appendChild(dot);
    });
    corners.appendChild(asp);
    root.appendChild(corners);

    // Layer 2: text plate (in flow, hugs the bottom).
    const plate = el('div', 'card-plate');
    const n = SB.names.cards[cardId] || { name: cardId };
    plate.appendChild(el('div', 'card-name', n.name + (n.subtitle && size === 'preview' ? ' — ' + n.subtitle : '')));

    const typeLine = el('div', 'card-type');
    const typeLabel = card.type === 'unit' ? (card.arena === 'space' ? 'Space unit' : 'Ground unit') :
      card.type.charAt(0).toUpperCase() + card.type.slice(1);
    typeLine.appendChild(el('span', 'type-tag', typeLabel));
    const traits = (card.traits || []).map(function (t) { return SB.names.traits[t] || t; });
    if (traits.length) typeLine.appendChild(el('span', 'traits', traits.join(' · ')));
    plate.appendChild(typeLine);

    const kws = collectKeywords(card, ref.unit, state);
    if (kws.length) {
      plate.appendChild(el('div', 'card-kw', kws.map(function (k) { return k.label; }).join('  ·  ')));
    }

    if (size === 'preview') {               // §8: the entire content difference
      const detail = el('div', 'card-detail');
      let lines = [];
      try { lines = SB.cardText(cardId); } catch (e) { lines = []; }
      lines.forEach(function (line) {
        const row = el('div', 'ability');
        const ci = line.indexOf(':');
        if (ci > 0 && ci < 40) {
          row.appendChild(el('span', 'trigger', line.slice(0, ci)));
          row.appendChild(el('span', 'ability-text', line.slice(ci + 1).trim()));
        } else {
          row.appendChild(el('span', 'ability-text', line));
        }
        detail.appendChild(row);
      });
      if (lines.length) plate.appendChild(detail);
    }

    const stats = statLine(card, def, ref.unit, state, opts.basePlayer);
    if (stats) plate.appendChild(stats);
    root.appendChild(plate);

    // Decoration from live instance state.
    if (ref.unit) decorate(root, ref.unit, state);
    return root;
  };

  function statLine(card, def, unit, state, basePlayer) {
    if (card.type === 'base') {
      const row = el('div', 'card-stats');
      const dmg = state ? findBaseDamage(state, card.id, basePlayer) : 0;
      row.appendChild(el('span', 'stat hp' + (dmg > 0 ? ' damaged' : ''), (card.hp - dmg) + '/' + card.hp));
      return row;
    }
    if (def.power == null && def.hp == null) return null;
    const row = el('div', 'card-stats');
    if (unit && state) {
      row.appendChild(el('span', 'stat ap', String(SB.unitPower(state, unit))));
      const rem = SB.unitRemainingHp(state, unit);
      row.appendChild(el('span', 'stat hp' + (unit.damage > 0 ? ' damaged' : ''), String(rem)));
    } else {
      if (def.power != null) row.appendChild(el('span', 'stat ap', String(def.power)));
      if (def.hp != null) row.appendChild(el('span', 'stat hp', String(def.hp)));
    }
    return row;
  }

  // Which player's base this is cannot be inferred from the card id: the two decks may
  // run the SAME base card (deck-p6a and deck-p6b both use sec-022), and matching by id
  // alone reports player 0's damage on both boards. Callers that know the seat pass it.
  function findBaseDamage(state, cardId, basePlayer) {
    if (basePlayer != null && state.players[basePlayer]) return state.players[basePlayer].base.damage;
    for (let i = 0; i < state.players.length; i++) {
      if (state.players[i].base.cardId === cardId) return state.players[i].base.damage;
    }
    return 0;
  }

  function decorate(root, unit, state) {
    if (unit.exhausted) root.classList.add('is-rested');
    if (unit.shields > 0) root.appendChild(el('div', 'badge shield-badge', '◈' + (unit.shields > 1 ? unit.shields : '')));
    if (unit.experience > 0) root.appendChild(el('div', 'badge xp-badge', '+' + unit.experience));
    if (unit.advantage > 0) root.appendChild(el('div', 'badge adv-badge', '▲' + unit.advantage));
    if (unit.upgrades.length > 0) {
      const names = unit.upgrades.map(function (i2) { return SB.names.card(i2.cardId); }).join(', ');
      const b = el('div', 'pilot-badge' + (SB.pilotCount && SB.pilotCount(state, unit) > 0 ? ' linked' : ''), names);
      root.appendChild(b);
    }
    if (unit.damage > 0) root.appendChild(el('div', 'damage-marker', String(unit.damage)));
  }

  // ---- glossary collection (§8): walk the WHOLE definition -----------------
  function collectKeywords(card, unit, state) {
    const found = {};
    function addKw(kw) {
      if (!kw || !kw.k || found[kw.k]) return;
      const nm = SB.names.keywords[kw.k] || kw.k;
      found[kw.k] = { k: kw.k, n: kw.n, label: kw.n != null ? nm + ' ' + kw.n : nm };
    }
    function walk(o) {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) { o.forEach(walk); return; }
      (o.keywords || []).forEach(addKw);
      (o.grantKeywords || []).forEach(addKw);
      if (o.op === 'giveKeyword' && o.k) addKw({ k: o.k });
      if (o.grant && o.grant.keywords) o.grant.keywords.forEach(addKw);
      Object.keys(o).forEach(function (key) {
        if (key === 'keywords' || key === 'grantKeywords') return;
        walk(o[key]);
      });
    }
    walk(card);
    // Live keywords granted to the instance this round.
    if (unit && unit.tempKeywords) unit.tempKeywords.forEach(function (k) { addKw({ k: k }); });
    return Object.keys(found).map(function (k) { return found[k]; });
  }

  SB.cardGlossary = function (cardId, unit, state) {
    const card = SB.cards[cardId];
    if (!card) return [];
    return collectKeywords(card, unit, state).map(function (kw) {
      let text = SB.names.keywordHelp[kw.k] || '';
      if (kw.n != null) text = text.split('X').join(String(kw.n));
      return { name: kw.label, text: text || kw.label };
    }).filter(function (g) { return g.text; });
  };

  // ---- token walker (§9): every createToken op at any depth ----------------
  SB.cardTokens = function (cardId) {
    const card = SB.cards[cardId];
    if (!card) return [];
    const seen = {};
    const out = [];
    (function walk(o) {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) { o.forEach(walk); return; }
      if (o.op === 'createToken' && o.token && !seen[o.token]) {
        seen[o.token] = true;
        out.push(o.token);
      }
      Object.keys(o).forEach(function (k) { walk(o[k]); });
    })(card);
    return out;
  };
})(window.SB = window.SB || {});
