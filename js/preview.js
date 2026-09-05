// preview.js — the three enlargements (CARD-PRESENTATION-SPEC §7): hover preview,
// tap inspector, and the played-card spotlight. UI-only file.
(function (SB) {
  'use strict';

  const OPEN_DELAY_MS = 300;
  const GAP = 12;
  let hoverTimer = null;
  let previewFor = null;   // cache key: iid or defId currently shown

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function ensure(id, cls) {
    let n = document.getElementById(id);
    if (!n) {
      n = el('div');
      n.id = id;
      if (cls) n.className = cls;
      document.body.appendChild(n);
    }
    return n;
  }

  function buildRow(cardId, unit, state) {
    const row = el('div', 'preview-row');
    const main = SB.renderCard({ cardId: cardId, unit: unit }, { size: 'preview', state: state });
    row.appendChild(main);

    const tokens = SB.cardTokens(cardId);
    if (tokens.length) {
      const side = el('div', 'preview-side preview-tokens');
      side.appendChild(el('div', 'preview-side-title', tokens.length === 1 ? 'Token created' : 'Tokens created'));
      const stack = el('div', 'preview-token-stack');
      tokens.forEach(function (tid) {
        // §9: scratch render — printed stats, no live state.
        stack.appendChild(SB.renderCard({ cardId: tid }, { size: 'hand' }));
      });
      side.appendChild(stack);
      row.appendChild(side);
    }

    const gloss = SB.cardGlossary(cardId, unit, state);
    if (gloss.length) {
      const side = el('div', 'preview-side preview-glossary');
      side.appendChild(el('div', 'preview-side-title', 'Keywords'));
      gloss.forEach(function (g) {
        const r = el('div', 'kw-row');
        r.appendChild(el('span', 'kw-name', g.name));
        r.appendChild(el('span', 'kw-text', g.text));
        side.appendChild(r);
      });
      row.appendChild(side);
    }
    return { row: row, main: main };
  }

  // ---- A. hover preview ----------------------------------------------------
  const Preview = SB.preview = {
    // The enlargement itself, for callers that place it themselves: the preview-size
    // card, the tokens it creates, and the keyword glossary. The deck picker shows two
    // of these (a list's leader and its base) before a match exists to hover in.
    face: function (cardId, unit, state) { return buildRow(cardId, unit, state).row; },
    show: function (anchorEl, cardId, unit, state) {
      const key = unit ? 'i' + unit.uid : 'd' + cardId;
      const box = ensure('preview');
      if (previewFor === key && box.classList.contains('open')) return;
      previewFor = key;
      box.textContent = '';
      const built = buildRow(cardId, unit, state);
      box.appendChild(built.row);
      box.classList.add('open');
      box.classList.remove('grown');
      // Position: center the MAIN CARD on the anchor, not the whole row (§7A).
      const rect = anchorEl.getBoundingClientRect();
      const bw = box.offsetWidth, bh = box.offsetHeight;
      const mainMid = built.main.offsetLeft + built.main.offsetWidth / 2;
      let left = rect.left + rect.width / 2 - mainMid;
      left = Math.max(GAP, Math.min(left, window.innerWidth - bw - GAP));
      let top = rect.top + rect.height / 2 - bh / 2;
      top = Math.max(GAP, Math.min(top, window.innerHeight - bh - GAP));
      box.style.left = left + 'px';
      box.style.top = top + 'px';
      box.style.transformOrigin = (mainMid) + 'px 50%';
      // Two nested rAFs so the browser commits the start value (§7A).
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { box.classList.add('grown'); });
      });
    },
    hide: function () {
      previewFor = null;
      const box = document.getElementById('preview');
      if (box) { box.classList.remove('open', 'grown'); }
    },
    // Hook a card node: hover + keyboard focus parity (§13).
    attach: function (node, cardId, getUnit, getState) {
      function arm() {
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(function () {
          if (SB.drag && SB.drag.active()) return;    // abort while dragging
          Preview.show(node, cardId, getUnit ? getUnit() : null, getState ? getState() : null);
        }, OPEN_DELAY_MS);
      }
      function disarm() { clearTimeout(hoverTimer); Preview.hide(); }
      node.addEventListener('mouseenter', arm);
      node.addEventListener('mouseleave', disarm);
      node.addEventListener('focus', arm);
      node.addEventListener('blur', disarm);
    },
  };

  // ---- B. inspector (tap) --------------------------------------------------
  SB.inspector = {
    open: function (cardId, unit, state) {
      const box = ensure('inspector');
      box.textContent = '';
      const body = el('div', 'inspect-body');
      body.addEventListener('click', function (e) { e.stopPropagation(); });
      const built = buildRow(cardId, unit, state);
      body.appendChild(built.row);
      box.appendChild(body);
      box.classList.add('open');
      box.onclick = SB.inspector.close;
      document.addEventListener('keydown', escClose);
    },
    close: function () {
      const box = document.getElementById('inspector');
      if (box) box.classList.remove('open');
      document.removeEventListener('keydown', escClose);
    },
  };
  function escClose(e) { if (e.key === 'Escape') SB.inspector.close(); }

  // ---- B2. zone browser (look through a pile) ------------------------------
  // Same overlay idiom as the inspector, but a grid of every card in a zone rather
  // than one card enlarged. Read-only: it never offers an action, so it cannot be
  // confused with the choice modal (LOG-AND-TARGETING §13), which does.
  //
  // Callers decide what may be browsed. This function will happily render whatever
  // it is handed, so the information boundary lives at the call site: the opponent's
  // resources are never passed here.
  SB.zoneBrowser = {
    open: function (title, cards, state, note) {
      const box = ensure('zone-browser', 'browse-overlay');
      box.textContent = '';
      const body = el('div', 'browse-body');
      body.addEventListener('click', function (e) { e.stopPropagation(); });

      const head = el('div', 'browse-head');
      head.appendChild(el('div', 'browse-title', title + ' (' + cards.length + ')'));
      if (note) head.appendChild(el('div', 'browse-note', note));
      const closeBtn = el('button', 'browse-close', SB.names.ui.browseClose);
      closeBtn.onclick = SB.zoneBrowser.close;
      head.appendChild(closeBtn);
      body.appendChild(head);

      if (!cards.length) {
        body.appendChild(el('div', 'browse-empty', SB.names.ui.browseEmpty));
      } else {
        const grid = el('div', 'browse-grid');
        cards.forEach(function (inst) {
          const cardId = inst.cardId || inst;
          const node = SB.renderCard({ cardId: cardId }, { size: 'hand', state: state });
          node.tabIndex = 0;
          // Hover for the full rules text — the hand-size face alone does not carry it.
          Preview.attach(node, cardId, null, function () { return state; });
          grid.appendChild(node);
        });
        body.appendChild(grid);
      }

      box.appendChild(body);
      box.classList.add('open');
      box.onclick = SB.zoneBrowser.close;
      document.addEventListener('keydown', escCloseBrowse);
      closeBtn.focus();
    },
    close: function () {
      const box = document.getElementById('zone-browser');
      if (box) box.classList.remove('open');
      Preview.hide();          // a preview armed from inside the overlay must not outlive it
      document.removeEventListener('keydown', escCloseBrowse);
    },
  };
  function escCloseBrowse(e) { if (e.key === 'Escape') SB.zoneBrowser.close(); }

  // ---- C. spotlight (played card) -----------------------------------------
  const TRAVEL_MS = 500, HOLD_MS = 1200, FADE_MS = 250;
  let spotTimer = null;

  SB.spotlight = function (cardId, fromEl) {
    const old = document.getElementById('spotlight');
    if (old) finish(old, true);              // a second play must finish the first
    const box = el('div');
    box.id = 'spotlight';
    box.appendChild(SB.renderCard({ cardId: cardId }, { size: 'preview' }));
    let dx = 0, dy = 0;
    if (fromEl && fromEl.getBoundingClientRect) {
      const r = fromEl.getBoundingClientRect();
      dx = r.left + r.width / 2 - window.innerWidth / 2;
      dy = r.top + r.height / 2 - window.innerHeight / 2;
    }
    box.style.transform = 'translate(-50%,-50%) translate(' + dx + 'px,' + dy + 'px) scale(.3)';
    box.style.opacity = '.35';
    box.onclick = function () { finish(box, true); };
    document.body.appendChild(box);
    // Flush start state with a forced LAYOUT READ, not rAF (§7C: rAF stalls in
    // background tabs and strands the card mid-screen).
    void box.getBoundingClientRect();
    box.style.transform = 'translate(-50%,-50%) scale(1)';
    box.style.opacity = '1';
    spotTimer = setTimeout(function () { finish(box, false); }, TRAVEL_MS + HOLD_MS);
  };

  function finish(box, immediate) {
    clearTimeout(spotTimer);
    if (immediate) { box.remove(); return; }
    box.style.opacity = '0';
    setTimeout(function () { box.remove(); }, FADE_MS);
  }
})(window.SB = window.SB || {});
