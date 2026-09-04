// boardart.js — the play surface, drawn rather than photographed. UI-only file.
//
// This replaces a raster mat whose twelve zone rectangles were hand-measured off the
// image. Here ONE table (LAYOUT) is both the geometry the DOM zones are positioned
// with and the geometry the decoration is drawn from, so a painted outline and the
// hitbox inside it are the same numbers and cannot drift apart.
//
// Everything is expressed in a 2048x1280 board space. That is a coordinate system,
// not a resolution: the SVG carries it as a viewBox and renders as vectors at whatever
// size #mat takes, so the same board is sharp on a phone and on a television.
(function (SB) {
  'use strict';

  const W = 2048, H = 1280;

  // ---- the geometry table --------------------------------------------------
  // Slot widths differ because the zones hold different things: a resource row fans
  // twenty cards, a leader holds one. Gaps are wider BETWEEN groups than within them,
  // which is what makes the row read as "cards | piles | resources" rather than five
  // equal boxes.
  const MARGIN = 40;         // board edge to first slot
  const ROW_Y = 44;          // top of the opponent's slot row
  const ROW_H = 232;
  const LABEL_GAP = 26;      // slot edge to its label band
  const SLOT = [             // YOUR row, left to right. The opponent's is this mirrored.
    { id: 'base',        w: 235, gapAfter: 24 },
    { id: 'leader',      w: 209, gapAfter: 90 },
    { id: 'deck',        w: 244, gapAfter: 24 },
    { id: 'discard',     w: 274, gapAfter: 90 },
    { id: 'resources',   w: 778, gapAfter: 0 },
  ];
  const LABEL_KEY = { base: 'base', leader: 'leader', deck: 'drawDeck',
    discard: 'discardPile', resources: 'resources' };

  const ARENA_Y = 336, ARENA_H = 608;
  const ARENA_MARGIN = 24, ARENA_SPLIT = 48;   // gutter down the middle
  const ARENA_W = (W - ARENA_MARGIN * 2 - ARENA_SPLIT) / 2;

  function buildRow(mine) {
    // Your row is laid out left to right; theirs is the same row reflected about the
    // board's centre line, so it reads in ITS OWN order from the far side of the table
    // exactly as yours does from here. Reflecting rather than typing a second array is
    // what keeps the two rows from drifting when a slot is resized or reordered.
    const out = {};
    let x = MARGIN;
    SLOT.forEach(function (s) {
      const rect = { x: x, y: mine ? H - ROW_Y - ROW_H : ROW_Y, w: s.w, h: ROW_H };
      if (!mine) rect.x = W - x - s.w;
      out[s.id] = rect;
      x += s.w + s.gapAfter;
    });
    // The Current token gets the gap between the leader and the draw deck rather than
    // a slot of its own: it is one bit of state, not a pile, and it belongs beside the
    // leader whose abilities spend it. Derived from the two neighbouring rects, so it
    // lands in the right half of the row on the mirrored side too.
    const A = out.leader, B = out.deck;
    const lo = A.x < B.x ? A.x + A.w : B.x + B.w;
    const hi = A.x < B.x ? B.x : A.x;
    const d = 76;
    out.force = { x: (lo + hi) / 2 - d / 2, y: A.y + A.h / 2 - d / 2, w: d, h: d };
    return out;
  }

  const LAYOUT = SB.boardLayout = {
    w: W, h: H,
    mine: buildRow(true),
    theirs: buildRow(false),
    arenas: {
      ground: { x: ARENA_MARGIN, y: ARENA_Y, w: ARENA_W, h: ARENA_H },
      space:  { x: ARENA_MARGIN + ARENA_W + ARENA_SPLIT, y: ARENA_Y, w: ARENA_W, h: ARENA_H },
    },
  };

  // DOM zone id -> its rect. The ids are the ones index.html already uses.
  const ZONE_EL = {
    'enemy-res': LAYOUT.theirs.resources, 'enemy-discard': LAYOUT.theirs.discard,
    'enemy-deck': LAYOUT.theirs.deck, 'enemy-leader': LAYOUT.theirs.leader,
    'enemy-base': LAYOUT.theirs.base,
    'enemy-force': LAYOUT.theirs.force,
    'my-base': LAYOUT.mine.base, 'my-leader': LAYOUT.mine.leader,
    'my-force': LAYOUT.mine.force,
    'my-deck': LAYOUT.mine.deck, 'my-discard': LAYOUT.mine.discard,
    'my-res': LAYOUT.mine.resources,
    'arena-ground': LAYOUT.arenas.ground, 'arena-space': LAYOUT.arenas.space,
  };

  // ---- scenery -------------------------------------------------------------
  // Four zones are painted with a scene instead of left empty: the two arenas and the
  // two slots that hold a loose pile. Each has a set of interchangeable shots, and
  // which one you get is rolled per game rather than fixed, so a long session does not
  // play out against the same board. Both players' resource rows draw the SAME roll —
  // one board, one location, seen from two sides — but the two arenas roll separately.
  const SCENES = 5;                      // shots per set; files are <key>-1..5.webp
  const SLOT_SCENE = { resources: 'slot-res', discard: 'slot-disc' };
  // The two discard piles roll SEPARATELY, and never to the same shot as each other:
  // they are small, they sit one above the other, and identical art in both read as
  // one zone mirrored rather than as two piles belonging to two players. The resource
  // rows keep a shared scene on purpose — the whole row IS mirrored, deliberately.
  const PER_SIDE = { discard: 1 };

  // Each entry is one roll: a file key (the art set), a seed key (what the
  // no-repeat memory is kept under) and the image nodes that take the result.
  function sceneTargets() {
    const t = [
      { key: 'arena-ground', seed: 'arena-ground', ids: ['arena-art-ground'] },
      { key: 'arena-space', seed: 'arena-space', ids: ['arena-art-space'] },
    ];
    for (const slot in SLOT_SCENE) {
      const key = SLOT_SCENE[slot];
      const ids = ['slot-art-mine-' + slot, 'slot-art-theirs-' + slot];
      if (PER_SIDE[slot]) {
        t.push({ key: key, seed: key + '#mine', ids: [ids[0]], group: key });
        t.push({ key: key, seed: key + '#theirs', ids: [ids[1]], group: key });
      } else {
        t.push({ key: key, seed: key, ids: ids });
      }
    }
    return t;
  }
  const lastScene = {};
  // Rerolled away from the shot just used, and from anything already taken this game
  // by a slot in the same group: a random pick that repeats itself back to back reads
  // as a bug rather than as chance, and so do two identical piles side by side.
  function roll(key, seed, avoid) {
    let n = 1 + Math.floor(Math.random() * SCENES);
    const taken = function (x) {
      return x === lastScene[seed] || (avoid && avoid.indexOf(x) >= 0);
    };
    for (let guard = 0; guard < SCENES && SCENES > 1 && taken(n); guard++) n = 1 + (n % SCENES);
    lastScene[seed] = n;
    return { href: 'art/' + key + '-' + n + '.webp', n: n };
  }

  // ---- drawing -------------------------------------------------------------

  const NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  const pct = (v, total) => (v / total * 100) + '%';

  // A zone frame: rounded outline plus the four corner brackets that give the board
  // its console look. The brackets are drawn as open paths, not a second rectangle,
  // so they read as hardware rather than as a double border.
  function frame(rect, cls, radius) {
    const g = svgEl('g', { class: 'bz ' + cls });
    const r = radius == null ? 18 : radius;
    g.appendChild(svgEl('rect', { x: rect.x, y: rect.y, width: rect.w, height: rect.h,
      rx: r, ry: r, class: 'bz-fill' }));
    g.appendChild(svgEl('rect', { x: rect.x, y: rect.y, width: rect.w, height: rect.h,
      rx: r, ry: r, class: 'bz-line' }));
    const b = Math.min(34, rect.w / 5, rect.h / 5), i = 10;
    [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(function (s) {
      const cx = s[0] > 0 ? rect.x + i : rect.x + rect.w - i;
      const cy = s[1] > 0 ? rect.y + i : rect.y + rect.h - i;
      g.appendChild(svgEl('path', { class: 'bz-bracket',
        d: 'M' + (cx + s[0] * b) + ',' + cy + ' L' + cx + ',' + cy + ' L' + cx + ',' + (cy + s[1] * b) }));
    });
    return g;
  }

  // An empty image layer sized and rounded to a zone, filled in later by rollScenes.
  // Clipped rather than merely sized because the art is cropped with "slice" to cover
  // the box, and the overflow has to stop at the rounded corner the frame draws.
  function artLayer(rect, id, radius) {
    const g = svgEl('g', { class: 'bz-artlayer' });
    const clipId = 'bz-clip-' + id;
    const cp = svgEl('clipPath', { id: clipId });
    cp.appendChild(svgEl('rect', { x: rect.x, y: rect.y, width: rect.w, height: rect.h,
      rx: radius, ry: radius }));
    g.appendChild(cp);
    g.appendChild(svgEl('image', { id: id, x: rect.x, y: rect.y, width: rect.w,
      height: rect.h, preserveAspectRatio: 'xMidYMid slice',
      'clip-path': 'url(#' + clipId + ')', class: 'bz-zone-art' }));
    return g;
  }

  function label(text, x, y, cls) {
    // Caps is a styling decision, applied here rather than stored that way in names.js.
    const t = svgEl('text', { x: x, y: y, class: 'bz-label ' + (cls || ''), 'text-anchor': 'middle' });
    t.textContent = String(text).toUpperCase();
    return t;
  }

  function defs() {
    const d = svgEl('defs', {});
    // Circuit traces: a repeating tile rather than a drawn-out spaghetti of paths, so
    // the pattern costs a few lines regardless of how large the board is rendered.
    const p = svgEl('pattern', { id: 'bz-traces', width: 256, height: 256,
      patternUnits: 'userSpaceOnUse' });
    const path = svgEl('path', { class: 'bz-trace', d:
      'M0,64 H96 L128,96 H256 M0,192 H64 L96,160 H192 L224,192 H256 ' +
      'M128,0 V32 L160,64 V128 M32,256 V208 L64,176 M224,0 V48 L192,80' });
    p.appendChild(path);
    p.appendChild(svgEl('circle', { class: 'bz-trace-node', cx: 96, cy: 160, r: 5 }));
    p.appendChild(svgEl('circle', { class: 'bz-trace-node', cx: 160, cy: 64, r: 5 }));
    d.appendChild(p);

    // The seam between the arenas: a cool edge, a warm edge, and a flare where they meet.
    const gr = svgEl('linearGradient', { id: 'bz-seam', x1: '0', y1: '0', x2: '1', y2: '0' });
    [['0%', 'seam-a'], ['46%', 'seam-mid'], ['54%', 'seam-mid'], ['100%', 'seam-b']]
      .forEach(function (s) { gr.appendChild(svgEl('stop', { offset: s[0], class: s[1] })); });
    d.appendChild(gr);

    // Two glow strengths: a broad one for the frame rail, a tighter one for zone
    // outlines. The bloom is the part of the photographed board hardest to match, and
    // a blur-and-merge is the honest approximation of it.
    [['bz-glow', 14], ['bz-glow-soft', 6]].forEach(function (g) {
      const f = svgEl('filter', { id: g[0], x: '-40%', y: '-40%', width: '180%', height: '180%' });
      f.appendChild(svgEl('feGaussianBlur', { stdDeviation: g[1], result: 'b' }));
      const m = svgEl('feMerge', {});
      m.appendChild(svgEl('feMergeNode', { in: 'b' }));
      m.appendChild(svgEl('feMergeNode', { in: 'b' }));
      m.appendChild(svgEl('feMergeNode', { in: 'SourceGraphic' }));
      f.appendChild(m);
      d.appendChild(f);
    });

    // The table edge. A three-stop warm gradient stands in for wood grain — agreed
    // approximation: structure exact, textures suggested.
    const wood = svgEl('linearGradient', { id: 'bz-wood', x1: '0', y1: '0', x2: '0', y2: '1' });
    [['0%', '#4a3524'], ['18%', '#6b4c33'], ['50%', '#3d2b1d'], ['82%', '#6b4c33'], ['100%', '#43301f']]
      .forEach(function (s) { wood.appendChild(svgEl('stop', { offset: s[0], 'stop-color': s[1] })); });
    d.appendChild(wood);
    return d;
  }

  function grid(rect) {
    const g = svgEl('g', { class: 'bz-grid' });
    const step = 96;
    for (let x = rect.x + step; x < rect.x + rect.w; x += step) {
      g.appendChild(svgEl('line', { x1: x, y1: rect.y, x2: x, y2: rect.y + rect.h }));
    }
    for (let y = rect.y + step; y < rect.y + rect.h; y += step) {
      g.appendChild(svgEl('line', { x1: rect.x, y1: y, x2: rect.x + rect.w, y2: y }));
    }
    const clip = svgEl('g', { class: 'bz-grid-wrap' });
    clip.appendChild(g);
    return clip;
  }

  function build() {
    const svg = svgEl('svg', { id: 'board-svg', viewBox: '0 0 ' + W + ' ' + H,
      'aria-hidden': 'true', focusable: 'false' });
    svg.appendChild(defs());

    // Table edge, the glowing rail set into it, then the panel inside that. The rail is
    // the board's signature: a bright warm line with a wide bloom, drawn between the
    // wood and the panel so it reads as lit rather than painted on.
    const B = 30;                      // width of the table band
    svg.appendChild(svgEl('rect', { x: 0, y: 0, width: W, height: H, rx: 30, class: 'bz-table' }));
    svg.appendChild(svgEl('rect', { x: B, y: B, width: W - B * 2, height: H - B * 2, rx: 20,
      class: 'bz-rail', filter: 'url(#bz-glow)' }));
    const P = B + 8;
    svg.appendChild(svgEl('rect', { x: P, y: P, width: W - P * 2, height: H - P * 2, rx: 14, class: 'bz-panel' }));
    svg.appendChild(svgEl('rect', { x: P, y: P, width: W - P * 2, height: H - P * 2, rx: 14,
      class: 'bz-traces-fill' }));

    // Arenas. Each gets an empty image layer behind its frame so ground/space art can
    // be dropped in later without touching the frame or the zone geometry.
    ['ground', 'space'].forEach(function (which) {
      const r = LAYOUT.arenas[which];
      const g = svgEl('g', { class: 'bz-arena bz-arena-' + which });
      g.appendChild(artLayer(r, 'arena-art-' + which, 20));
      g.appendChild(grid(r));
      g.appendChild(frame(r, 'bz-arena-frame', 20));
      g.appendChild(label(SB.names.ui.zones[which === 'ground' ? 'groundArena' : 'spaceArena'],
        r.x + r.w / 2, r.y + r.h / 2 + 16, 'bz-arena-label'));
      svg.appendChild(g);
    });

    // The seam down the middle of the arenas.
    const sx = ARENA_MARGIN + ARENA_W, sw = ARENA_SPLIT;
    svg.appendChild(svgEl('rect', { x: sx + sw / 2 - 3, y: ARENA_Y + 30, width: 6,
      height: ARENA_H - 60, class: 'bz-seam', filter: 'url(#bz-glow)' }));

    // Slot rows. Labels sit on the INNER side of each row, facing the arenas, so both
    // players read their own row the same way.
    [['mine', true], ['theirs', false]].forEach(function (pair) {
      const side = pair[0], mine = pair[1];
      const g = svgEl('g', { class: 'bz-row bz-row-' + side });
      SLOT.forEach(function (s) {
        const r = LAYOUT[side][s.id];
        // The two slots that hold a loose PILE rather than a single card get a scene
        // behind them, for the same reason the arenas do. The deck and leader slots
        // don't: a card covers them completely, so art there would never be seen.
        if (SLOT_SCENE[s.id]) g.appendChild(artLayer(r, 'slot-art-' + side + '-' + s.id, 12));
        g.appendChild(frame(r, 'bz-slot'));
        const ly = mine ? r.y - LABEL_GAP : r.y + r.h + LABEL_GAP + 22;
        g.appendChild(label(SB.names.ui.zones[LABEL_KEY[s.id]], r.x + r.w / 2, ly));
      });
      // The Current's socket. No painted label: it sits in a 90-unit gap between two
      // slots that already have one, and a third caption there would read as theirs.
      const f = LAYOUT[side].force;
      g.appendChild(svgEl('circle', { cx: f.x + f.w / 2, cy: f.y + f.h / 2, r: f.w / 2,
        class: 'bz-force-socket' }));
      svg.appendChild(g);
    });
    return svg;
  }

  // ---- public --------------------------------------------------------------

  SB.boardArt = {
    // Draw the board into #mat and place every DOM zone on its painted slot.
    init: function (mat) {
      if (!mat || mat.querySelector('#board-svg')) return;
      mat.insertBefore(build(), mat.firstChild);
      for (const id in ZONE_EL) {
        const el = document.getElementById(id);
        if (!el) continue;
        const r = ZONE_EL[id];
        el.style.left = pct(r.x, W);
        el.style.top = pct(r.y, H);
        el.style.width = pct(r.w, W);
        el.style.height = pct(r.h, H);
      }
      this.rollScenes();
    },
    // Deal every painted zone a fresh scene. Called on init and at every new game.
    rollScenes: function () {
      const used = {};                 // group -> shots already dealt this game
      sceneTargets().forEach(function (t) {
        const r = roll(t.key, t.seed, t.group ? used[t.group] : null);
        if (t.group) (used[t.group] = used[t.group] || []).push(r.n);
        t.ids.forEach(function (id) {
          const img = document.getElementById(id);
          if (img) img.setAttribute('href', r.href);
        });
      });
    },
  };
})(window.SB = window.SB || {});
