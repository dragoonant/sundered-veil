// targeting.js — how the game ASKS (CARD-LOG-AND-TARGETING-SPEC part two).
// The question itself lives on the state (state.queue[0].candidates); this file only
// decides how to show it, and never mutates a choice — it finds the matching legal
// action and hands it to UI.doAction. Three interfaces, chosen in code, never per card:
//
//   options are cards on the board  -> highlight in place, click the real card
//   options are cards the board does not draw -> centre-screen modal of real faces
//   options are not cards at all    -> the button bar
//
// UI-only file. Loaded after preview.js/cardview.js, before ui.js.
(function (SB) {
  'use strict';

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function $(id) { return document.getElementById(id); }

  // §11: a rebuilt node restarts its animation, so a board redrawn every second
  // stutters. Every pulse and dash-crawl starts at the SAME wall-clock phase.
  SB.animationPhase = function (periodMs) {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    return '-' + ((now % periodMs) / 1000).toFixed(3) + 's';
  };

  // ---- what kind of question is open? --------------------------------------

  function openChoice(state) {
    if (!state || state.queue.length === 0) return null;
    const item = state.queue[0];
    return item.candidates ? item : null;
  }

  // A candidate the board already draws is answered by clicking the real card.
  function isOnBoard(state, cand) {
    if (!cand) return false;
    if (cand.kind === 'base') return true;
    if (cand.kind === 'unit') return !!SB.findUnit(state, cand.uid);
    return false;
  }

  // §10: decided in code, from whether the player can SEE the options.
  SB.choiceInteraction = function (state) {
    const item = openChoice(state);
    if (!item) return null;
    let cardBacked = item.candidates.length > 0;
    for (let i = 0; i < item.candidates.length; i++) {
      if (!isOnBoard(state, item.candidates[i])) { cardBacked = false; break; }
    }
    return { item: item, cardBacked: cardBacked };
  };

  // ---- §16: the prompt line ------------------------------------------------
  // The card says WHAT (generated in text.js); this says HOW. A card author never
  // has to know the input model.

  SB.promptLine = function (state, humanSeat, acting) {
    if (SB.isTerminal(state)) return { text: 'Game over.', cls: 'over' };
    if (acting !== humanSeat) return { text: 'Waiting for the opponent…', cls: 'waiting' };

    const item = state.queue.length > 0 ? state.queue[0] : null;
    if (item) {
      let text = SB.targetPrompt(state, item);
      const inter = SB.choiceInteraction(state);
      if (inter && inter.cardBacked) text += ' Click a highlighted card.';
      else if (inter) text += ' Pick one of the cards shown.';
      else if (item.step === 'setupResources' || item.step === 'regroupResource') {
        text += ' Tap a card in your hand.';
      }
      return { text: text, cls: 'asking' };
    }
    return { text: 'Drag a card onto an arena to play it, or drag a unit onto an enemy to attack.', cls: '' };
  };

  // ---- §13: the choice modal, and the peek ---------------------------------

  // Peek lives in the VIEW layer, never in game state: it is a way of looking at the
  // game, not a move in it, and undo must never bring it back.
  let peekedKey = null;

  // §13: keyed to the choice's identity so a NEW prompt is never hidden on arrival.
  function choiceKey(state, item) {
    return (item.step || '') + '|' + ((item.op && item.op.op) || '') + '|' +
      ((item.ctx && item.ctx.cardId) || '') + '|' +
      item.candidates.map(function (c) {
        return c.kind === 'base' ? 'b' + c.player : 'u' + c.uid;
      }).join(',');
  }

  function wantsModal(state, humanSeat, acting, inter) {
    if (!inter) return false;
    if (SB.isTerminal(state)) return false;
    if (acting !== humanSeat) return false;
    if (inter.cardBacked) return false;                 // the board handles it
    if (inter.item.candidates.length === 0) return false;
    // Every option must be a card we can actually render; otherwise it is a button list.
    return inter.item.candidates.every(function (c) {
      return c.kind === 'unit' || c.kind === 'base' || c.cardId;
    });
  }

  function candidateCardId(state, cand) {
    if (cand.cardId) return cand.cardId;
    if (cand.kind === 'unit') {
      const u = SB.findUnit(state, cand.uid);
      return u ? u.cardId : null;
    }
    if (cand.kind === 'base') return state.players[cand.player].base.cardId;
    return null;
  }

  function setPeek(on) {
    const modal = $('choice-modal');
    if (!modal) return;
    // Toggled straight on the DOM, never through a redraw: nothing about the game moves.
    modal.classList.toggle('peek', on);
  }

  function escPeek(e) {
    if (e.key !== 'Escape') return;
    const modal = $('choice-modal');
    if (!modal || !modal.classList.contains('open')) return;
    e.preventDefault();
    const nowPeeking = !modal.classList.contains('peek');
    setPeek(nowPeeking);
    peekedKey = nowPeeking ? modal.dataset.choiceKey : null;
  }
  document.addEventListener('keydown', escPeek);

  SB.renderChoiceModal = function (state, acts, humanSeat, acting, onAction) {
    const modal = $('choice-modal');
    if (!modal) return false;
    const inter = SB.choiceInteraction(state);
    if (!wantsModal(state, humanSeat, acting, inter)) {
      modal.classList.remove('open', 'peek');
      modal.dataset.choiceKey = '';
      return false;
    }
    const item = inter.item;
    const key = choiceKey(state, item);
    modal.textContent = '';
    modal.dataset.choiceKey = key;

    const content = el('div', 'choice-modal-content');
    content.appendChild(el('div', 'choice-modal-prompt', SB.targetPrompt(state, item)));
    content.appendChild(el('div', 'choice-modal-hint',
      'Hover a card to read it in full, or hide this to check the board.'));

    const cards = el('div', 'choice-modal-cards');
    item.candidates.forEach(function (cand, i) {
      const cardId = candidateCardId(state, cand);
      const act = acts.find(function (a) { return a.type === 'choose' && a.index === i; });
      if (!cardId || !act) return;
      const unit = cand.kind === 'unit' ? SB.findUnit(state, cand.uid) : null;
      const wrap = el('div', 'choice-option');
      // Same wiring as a board card, or these cannot be READ before one is picked —
      // which is the entire point of revealing them.
      wrap.appendChild(SB.renderCard({ cardId: cardId, unit: unit }, { size: 'board', state: state }));
      wrap.tabIndex = 0;
      SB.preview.attach(wrap, cardId, unit ? function () { return SB.findUnit(SB.ui.state, cand.uid); } : null,
        function () { return SB.ui.state; });
      wrap.onclick = function () { peekedKey = null; onAction(act); };
      wrap.onkeydown = function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); peekedKey = null; onAction(act); }
      };
      cards.appendChild(wrap);
    });
    content.appendChild(cards);

    const controls = el('div', 'choice-modal-controls');
    // Decline is only offered when the engine offers it — never synthesised here.
    const decline = acts.find(function (a) { return a.type === 'choose' && a.index === -1; });
    if (decline) {
      const b = el('button', 'action-btn', SB.names.ui.decline);
      b.onclick = function () { peekedKey = null; onAction(decline); };
      controls.appendChild(b);
    }
    const hide = el('button', 'peek-btn', 'Hide — check the board');
    hide.onclick = function () { setPeek(true); peekedKey = key; };
    controls.appendChild(hide);
    content.appendChild(controls);
    modal.appendChild(content);

    // Lives OUTSIDE the panel so it survives while the panel is hidden.
    const restore = el('button', 'choice-peek-restore', 'Show the cards');
    restore.onclick = function () { setPeek(false); peekedKey = null; };
    modal.appendChild(restore);

    modal.classList.add('open');
    setPeek(peekedKey === key);
    return true;
  };

  // Generic-question popup: the same panel and hide/restore machinery, but the
  // caller (ui.js) builds the body — used for choices whose options are buttons
  // and revealed piles rather than `choose` candidates. Shares peekedKey so Esc
  // and the restore button behave identically.
  SB.renderGenericModal = function (key, nodes, restoreLabel) {
    const modal = $('choice-modal');
    if (!modal) return false;
    modal.textContent = '';
    modal.dataset.choiceKey = key;
    const content = el('div', 'choice-modal-content');
    nodes.forEach(function (n) { content.appendChild(n); });
    const controls = el('div', 'choice-modal-controls');
    const hide = el('button', 'peek-btn', 'Hide — check the board');
    hide.onclick = function () { setPeek(true); peekedKey = key; };
    controls.appendChild(hide);
    content.appendChild(controls);
    modal.appendChild(content);
    const restore = el('button', 'choice-peek-restore', restoreLabel || 'Show the choices');
    restore.onclick = function () { setPeek(false); peekedKey = null; };
    modal.appendChild(restore);
    modal.classList.add('open');
    setPeek(peekedKey === key);
    return true;
  };

  // ---- §14: the attack arrow -----------------------------------------------
  // Aiming and resolution are the same relationship, so they are the same picture:
  // amber while it is a proposal, danger red once it is a fact.

  const NS = 'http://www.w3.org/2000/svg';

  function layer() {
    let svg = $('arrow-layer');
    if (!svg) {
      svg = document.createElementNS(NS, 'svg');
      svg.id = 'arrow-layer';
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      document.body.appendChild(svg);
    }
    return svg;
  }

  // Bowed sideways on purpose: with two player mats stacked vertically, a straight
  // arrow runs along the same axis as every divider on screen and reads as one more line.
  function pathFor(from, to) {
    const midX = (from.x + to.x) / 2, midY = (from.y + to.y) / 2;
    const bow = Math.min(120, Math.abs(to.y - from.y) * 0.45) + 20;
    return 'M' + from.x + ',' + from.y + ' Q' + (midX + bow) + ',' + midY + ' ' + to.x + ',' + to.y;
  }

  SB.arrow = {
    // aiming=true while a drag is still looking for something to land on.
    draw: function (from, to, aiming) {
      const svg = layer();
      svg.textContent = '';
      svg.classList.add('open');
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('class', 'attack-arrow' + (aiming ? ' is-aiming' : ''));
      p.setAttribute('d', pathFor(from, to));
      p.style.animationDelay = SB.animationPhase(700);   // shared phase, no snap-back
      svg.appendChild(p);
      const head = document.createElementNS(NS, 'path');
      head.setAttribute('class', 'attack-arrow-head' + (aiming ? ' is-aiming' : ''));
      const ang = Math.atan2(to.y - ((from.y + to.y) / 2), to.x - ((from.x + to.x) / 2 + Math.min(120,
        Math.abs(to.y - from.y) * 0.45) + 20));
      const size = 11;
      const pts = [
        [to.x, to.y],
        [to.x - size * Math.cos(ang - 0.4), to.y - size * Math.sin(ang - 0.4)],
        [to.x - size * Math.cos(ang + 0.4), to.y - size * Math.sin(ang + 0.4)],
      ];
      head.setAttribute('d', 'M' + pts.map(function (q) { return q[0] + ',' + q[1]; }).join(' L') + ' z');
      svg.appendChild(head);
    },
    clear: function () {
      const svg = $('arrow-layer');
      if (svg) { svg.textContent = ''; svg.classList.remove('open'); }
    },
    centreOf: function (node) {
      const r = node.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },
  };

  // A declared attack that has stopped to ask a question keeps its arrow up, so the
  // question is answered while looking at the battle it is about.
  SB.redrawDeclaredArrow = function (state, humanSeat) {
    const b = SB.logPanel.pendingBattle(state);
    if (!b) { SB.arrow.clear(); return; }
    const fromNode = document.querySelector('.card[data-iid="' + b.attackerUid + '"]');
    // Target resolution cascades: the aimed unit, else the base standing behind it.
    const toNode = b.target.kind === 'unit'
      ? document.querySelector('.card[data-iid="' + b.target.uid + '"]')
      : document.querySelector('[data-base-player="' + b.target.player + '"]');
    if (!fromNode || !toNode) { SB.arrow.clear(); return; }
    SB.arrow.draw(SB.arrow.centreOf(fromNode), SB.arrow.centreOf(toNode), false);
  };
})(window.SB = window.SB || {});
