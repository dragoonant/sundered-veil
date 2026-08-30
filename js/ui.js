// ui.js — board rendering + interaction (CARD-PRESENTATION-SPEC §10):
// tap INSPECTS, drag COMMITS. Every affordance is a filter over SB.legalActions;
// the UI cannot invent a rule. Cards render through SB.renderCard (one renderer,
// three sizes). UI-only file, loaded last in index.html.
(function (SB) {
  'use strict';

  const UI = SB.ui = { state: null, history: [], humanSeat: 0, aiThinking: false };
  const DRAG_THRESHOLD_PX = 8;
  const CLICK_GRACE_MS = 350;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // ---- game flow -----------------------------------------------------------

  UI.start = function (opts) {
    UI.humanSeat = 0;
    UI.history = [];
    UI.state = SB.newGame({ deck0: opts.deck0, deck1: opts.deck1,
      seed: opts.seed || ('g' + Math.floor(Math.random() * 1e9)) });
    UI.aiDifficulty = opts.difficulty || 'mid';
    UI.render();
    UI.maybeAI();
  };

  UI.doAction = function (action) {
    UI.history.push(UI.state);
    const before = UI.state.log.length;
    UI.state = SB.apply(UI.state, action);
    SB.sound && SB.sound.play(UI.state);
    spotlightNewPlays(before);
    UI.render();
    UI.maybeAI();
  };

  UI.undo = function () {
    while (UI.history.length > 0) {
      const prev = UI.history.pop();
      if (whoActs(prev) === UI.humanSeat) { UI.state = prev; break; }
    }
    UI.render();
  };

  function whoActs(state) {
    if (state.queue.length > 0) {
      const item = state.queue[0];
      if (item.player != null) return item.player;
      if (item.controller != null) return item.controller;
    }
    return state.active;
  }

  UI.maybeAI = function () {
    const s = UI.state;
    if (SB.isTerminal(s)) return;
    if (whoActs(s) === UI.humanSeat) return;
    if (UI.aiThinking) return;
    UI.aiThinking = true;
    setTimeout(function () {
      UI.aiThinking = false;
      const action = SB.ai.chooseAction(UI.state, UI.aiDifficulty);
      UI.history.push(UI.state);
      const before = UI.state.log.length;
      UI.state = SB.apply(UI.state, action);
      SB.sound && SB.sound.play(UI.state);
      spotlightNewPlays(before);
      UI.render();
      UI.maybeAI();
    }, 450);
  };

  function spotlightNewPlays(fromLog) {
    UI.state.log.slice(fromLog).forEach(function (l) {
      if ((l.type === 'playCard' || l.type === 'smuggled' || l.type === 'plotPlayed') && SB.spotlight) {
        SB.spotlight(l.cardId, null);
      }
    });
  }

  // ---- drag manager (§10) --------------------------------------------------
  // One Pointer Events path. 8px distance disambiguates tap from drag. Cards from
  // hand clone into a drag layer; attacking units stay put and draw an arrow.
  const Drag = SB.drag = (function () {
    let live = null;          // {node, kind, actions, startX, startY, moved, clone, arrow, pointerId}
    let lastDragEnd = 0;

    function justDragged() { return Date.now() - lastDragEnd < CLICK_GRACE_MS; }

    function begin(node, e, spec) {
      if (live) finish(false);              // fresh press proves the old gesture is over (§10)
      live = { node: node, spec: spec, startX: e.clientX, startY: e.clientY,
        moved: false, pointerId: e.pointerId };
      try { node.setPointerCapture(e.pointerId); } catch (err) {}
      node.addEventListener('pointermove', onMove);
      node.addEventListener('pointerup', onUp);
      node.addEventListener('pointercancel', onCancel);
    }

    function onMove(e) {
      if (!live) return;
      const dx = e.clientX - live.startX, dy = e.clientY - live.startY;
      if (!live.moved) {
        if (Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD_PX) return;   // still a tap
        live.moved = true;
        SB.preview && SB.preview.hide();
        if (live.spec.targets.length === 0) return;  // undraggable stays tappable
        markTargets(true);
        if (live.spec.kind === 'hand') {
          const clone = live.node.cloneNode(true);
          clone.className += ' drag-clone';
          clone.style.width = live.node.offsetWidth + 'px';
          document.body.appendChild(clone);
          live.clone = clone;
          live.node.classList.add('is-dragging-source');
        } else {
          live.arrow = true;      // §14: same picture as a declared attack, amber
        }
      }
      if (live.clone) {
        live.clone.style.left = (e.clientX - live.clone.offsetWidth / 2) + 'px';
        live.clone.style.top = (e.clientY - live.clone.offsetHeight * 0.85) + 'px';
      }
      if (live.arrow) {
        SB.arrow.draw(SB.arrow.centreOf(live.node), { x: e.clientX, y: e.clientY }, true);
      }
      hotTarget(e.clientX, e.clientY);
    }

    function onUp(e) {
      if (!live) return;
      const wasDrag = live.moved;
      if (wasDrag && live.spec.targets.length > 0) {
        const drop = findDrop(e.clientX, e.clientY);
        if (drop) { lastDragEnd = Date.now(); armClickSwallow(); commitDrop(drop); }
        // released over nothing: silent cancel (§10)
        lastDragEnd = Date.now();
        armClickSwallow();
      }
      finish(!wasDrag);
      if (!wasDrag && live === null) { /* tap resolved by click handler */ }
    }
    function onCancel() { finish(false); }

    function finish(wasTap) {
      if (!live) return;
      live.node.removeEventListener('pointermove', onMove);
      live.node.removeEventListener('pointerup', onUp);
      live.node.removeEventListener('pointercancel', onCancel);
      live.node.classList.remove('is-dragging-source');
      if (live.clone) live.clone.remove();
      // Clearing the aiming arrow must restore the declared one if a battle is live.
      if (live.arrow) { SB.arrow.clear(); if (UI.state) SB.redrawDeclaredArrow(UI.state, UI.humanSeat); }
      markTargets(false);
      const spec = live.spec;
      const node = live.node;
      const moved = live.moved;
      live = null;
      if (wasTap && !moved && spec.onTap) spec.onTap(node);
    }

    function markTargets(on) {
      document.querySelectorAll('.drop-ok, .drop-hot').forEach(function (n) {
        n.classList.remove('drop-ok', 'drop-hot');
      });
      if (!on || !live) return;
      live.spec.targets.forEach(function (t) {
        const n = t.el();
        if (n) n.classList.add('drop-ok');
      });
    }

    function hotTarget(x, y) {
      document.querySelectorAll('.drop-hot').forEach(function (n) { n.classList.remove('drop-hot'); });
      const d = findDrop(x, y);
      if (d) {
        const n = d.el();
        if (n) n.classList.add('drop-hot');
      }
    }

    function findDrop(x, y) {
      const under = document.elementFromPoint(x, y);
      if (!under || !live) return null;
      for (const t of live.spec.targets) {
        const n = t.el();
        if (n && (n === under || n.contains(under))) return t;
      }
      return null;
    }

    function commitDrop(t) {
      if (t.actions.length === 1) { UI.doAction(t.actions[0]); return; }
      // Multiple variants at one drop point (e.g. plain play vs exploit): offer buttons.
      UI.pendingVariants = t.actions;
      UI.render();
    }

    // Capture-phase synthetic-click swallow, self-removing (§10: belt AND braces).
    function armClickSwallow() {
      function swallow(e) {
        e.stopPropagation(); e.preventDefault();
        document.removeEventListener('click', swallow, true);
      }
      document.addEventListener('click', swallow, true);
      setTimeout(function () { document.removeEventListener('click', swallow, true); }, CLICK_GRACE_MS);
    }

    return {
      begin: begin,
      active: function () { return !!(live && live.moved); },
      justDragged: justDragged,
    };
  })();

  // ---- rendering -----------------------------------------------------------

  UI.render = function () {
    const s = UI.state;
    if (!s) return;
    const acts = SB.isTerminal(s) ? [] : SB.legalActions(s);
    renderStatus(s, acts);
    renderBase($('enemy-base'), s, SB.other(UI.humanSeat), acts);
    renderBase($('my-base'), s, UI.humanSeat, acts);
    renderLeader($('enemy-leader'), s, SB.other(UI.humanSeat));
    renderLeader($('my-leader'), s, UI.humanSeat);
    renderArena($('arena-space'), s, 'space', acts);
    renderArena($('arena-ground'), s, 'ground', acts);
    renderHand(s, acts);
    renderResources(s);
    renderChoices(s, acts);
    SB.logPanel.renderBattle(s, $('battle-line'), UI.humanSeat);
    SB.logPanel.renderRecent(s, $('recent'), UI.humanSeat);
    SB.logPanel.renderLog(s, $('log'));
    renderPrompt(s, acts);
    // §13: the modal owns input whenever the board cannot show the options.
    SB.renderChoiceModal(s, acts, UI.humanSeat, whoActs(s), UI.doAction);
    // §14: a battle that stopped to ask a question keeps its arrow up.
    SB.redrawDeclaredArrow(s, UI.humanSeat);
    $('undo-btn').disabled = UI.history.length === 0;
  };

  function renderStatus(s, acts) {
    const st = $('status');
    st.textContent = '';
    if (SB.isTerminal(s)) {
      st.appendChild(el('span', 'big', s.winner === UI.humanSeat ? SB.names.ui.youWin : SB.names.ui.youLose));
      return;
    }
    st.appendChild(el('span', null, SB.names.ui.round + ' ' + s.round + ' — '));
    st.appendChild(el('span', 'turn', whoActs(s) === UI.humanSeat ? SB.names.ui.yourTurn : SB.names.ui.enemyTurn));
    st.appendChild(el('span', 'chip' + (s.initiative === UI.humanSeat ? ' held' : ''), SB.names.ui.initiative));
    const btns = $('turn-buttons');
    btns.textContent = '';
    acts.forEach(function (a) {
      let label = null;
      if (a.type === 'pass') label = SB.names.ui.pass;
      if (a.type === 'claimInitiative') label = SB.names.ui.claim;
      if (a.type === 'deployLeader') label = SB.names.ui.deploy;
      if (a.type === 'deployLeaderPilot') label = SB.names.ui.deploy + ' → ' + unitName(s, a.attachTo);
      if (a.type === 'leaderAction') label = SB.names.ui.leaderAbility;
      if (a.type === 'baseEpic') label = 'Base epic action';
      if (a.type === 'smuggle') label = 'Smuggle: ' + SB.names.card(a.cardId);
      if (label) btns.appendChild(actionButton(s, a, label));
    });
  }

  // §11: a rebuilt node restarts its animation, so a board redrawn once a second
  // stutters. Every actable card starts its pulse at the same wall-clock phase.
  function markActable(node) {
    node.classList.add('role-actable', 'is-draggable');
    node.style.animationDelay = SB.animationPhase(1700);
  }

  function unitName(s, uid) {
    const u = SB.findUnit(s, uid);
    return u ? SB.names.card(u.cardId) : '?';
  }

  function renderBase(node, s, playerIdx, acts) {
    node.textContent = '';
    const base = s.players[playerIdx].base;
    const card = SB.card(base.cardId);
    node.dataset.basePlayer = playerIdx;
    node.appendChild(el('div', 'card-name', SB.names.card(base.cardId)));
    node.appendChild(el('div', 'hp', (card.hp - base.damage) + '/' + card.hp));
    const choice = choiceFor(s, acts, { kind: 'base', player: playerIdx });
    node.classList.toggle('role-target', !!choice);
    node.onclick = choice ? function () { if (!Drag.justDragged()) UI.doAction(choice); } : null;
  }

  function renderLeader(node, s, playerIdx) {
    node.textContent = '';
    const L = s.players[playerIdx].leader;
    node.appendChild(el('div', 'card-name', SB.names.card(L.cardId)));
    const bits = [];
    bits.push(L.deployed ? SB.names.ui.deployed : (L.exhausted ? SB.names.ui.exhausted : SB.names.ui.ready));
    if (s.players[playerIdx].force) bits.push(SB.names.ui.forceToken);
    if (s.players[playerIdx].credits > 0) bits.push('¢' + s.players[playerIdx].credits);
    node.appendChild(el('div', 'sub', bits.join(' · ')));
    node.tabIndex = 0;
    SB.preview && SB.preview.attach(node, L.cardId, null, function () { return UI.state; });
  }

  function choiceFor(s, acts, targetLike) {
    if (s.queue.length === 0 || !s.queue[0].candidates) return null;
    if (whoActs(s) !== UI.humanSeat) return null;
    const idx = s.queue[0].candidates.findIndex(function (c) {
      return JSON.stringify(c) === JSON.stringify(targetLike);
    });
    if (idx < 0) return null;
    return acts.find(function (a) { return a.type === 'choose' && a.index === idx; }) || null;
  }

  // Attack targets for the arrow drag, resolved fresh at drop time.
  function attackSpec(s, u, acts) {
    const mine = acts.filter(function (a) { return a.type === 'attack' && a.attacker === u.uid; });
    const targets = mine.map(function (a) {
      return {
        actions: [a],
        el: a.target.kind === 'base'
          ? function () { return document.querySelector('[data-base-player="' + a.target.player + '"]'); }
          : function () { return document.querySelector('.card[data-iid="' + a.target.uid + '"]'); },
      };
    });
    return targets;
  }

  function unitNode(s, u, acts) {
    const node = SB.renderCard({ cardId: u.cardId, unit: u }, { size: 'board', state: s });
    node.classList.add(u.owner === UI.humanSeat ? 'mine' : 'theirs');
    node.tabIndex = 0;

    const canAttack = acts.some(function (a) { return a.type === 'attack' && a.attacker === u.uid; });
    const choice = choiceFor(s, acts, { kind: 'unit', uid: u.uid });
    const unitActs = acts.filter(function (a) { return a.type === 'unitAction' && a.uid === u.uid; });
    if (canAttack || unitActs.length) markActable(node);
    if (choice) node.classList.add('role-target');

    node.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      Drag.begin(node, e, {
        kind: 'unit',
        targets: canAttack ? attackSpec(s, u, acts) : [],
        onTap: function () {
          if (choice) { UI.doAction(choice); return; }         // modal choice context
          if (unitActs.length === 1) { UI.doAction(unitActs[0]); return; }
          if (unitActs.length > 1) { UI.pendingVariants = unitActs; UI.render(); return; }
          SB.inspector.open(u.cardId, u, s);                    // tap inspects
        },
      });
    });
    SB.preview && SB.preview.attach(node, u.cardId,
      function () { return SB.findUnit(UI.state, u.uid); },
      function () { return UI.state; });
    return node;
  }

  function renderArena(node, s, arena, acts) {
    let theirs = node.querySelector('.theirs-row');
    node.textContent = '';
    node.appendChild(el('div', 'arena-label', arena === 'space' ? 'Space' : 'Ground'));
    theirs = el('div', 'arena-row theirs-row');
    const mine = el('div', 'arena-row mine-row');
    s[arena].forEach(function (u) {
      (u.owner === UI.humanSeat ? mine : theirs).appendChild(unitNode(s, u, acts));
    });
    node.appendChild(theirs);
    node.appendChild(mine);
    node.dataset.arena = arena;
  }

  function handSpec(s, i, inst, acts) {
    const plays = acts.filter(function (a) { return a.type === 'playCard' && a.handIndex === i; });
    const targets = [];
    // Plays with an attach target (upgrades / piloting): drop on that unit.
    plays.filter(function (a) { return a.attachTo != null; }).forEach(function (a) {
      targets.push({ actions: [a],
        el: function () { return document.querySelector('.card[data-iid="' + a.attachTo + '"]'); } });
    });
    // Plain plays (incl. exploit variants): drop on either arena.
    const plain = plays.filter(function (a) { return a.attachTo == null; });
    if (plain.length) {
      ['arena-ground', 'arena-space'].forEach(function (id) {
        targets.push({ actions: plain, el: function () { return $(id); } });
      });
    }
    return { plays: plays, targets: targets };
  }

  function renderHand(s, acts) {
    const node = $('hand');
    node.textContent = '';
    const p = s.players[UI.humanSeat];
    p.hand.forEach(function (inst, i) {
      const cardNode = SB.renderCard({ cardId: inst.cardId }, { size: 'hand', state: s, costFor: UI.humanSeat });
      const spec = handSpec(s, i, inst, acts);
      const resource = acts.find(function (a) {
        return a.type === 'resourceCard' && a.player === UI.humanSeat && a.handIndex === i;
      });
      if (spec.plays.length || resource) markActable(cardNode);
      cardNode.tabIndex = 0;
      cardNode.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        Drag.begin(cardNode, e, {
          kind: 'hand',
          targets: spec.targets,
          onTap: function () {
            if (resource) { UI.doAction(resource); return; }    // setup/regroup banking
            SB.inspector.open(inst.cardId, null, s);            // tap inspects
          },
        });
      });
      SB.preview && SB.preview.attach(cardNode, inst.cardId, null, function () { return UI.state; });
      node.appendChild(cardNode);
    });

    const decline = acts.find(function (a) {
      return a.type === 'resourceCard' && a.player === UI.humanSeat && a.handIndex === -1;
    });
    const db = $('decline-btn');
    db.style.display = decline ? '' : 'none';
    db.onclick = decline ? function () { UI.doAction(decline); } : null;

    const mull = acts.filter(function (a) { return a.type === 'mulligan' && a.player === UI.humanSeat; });
    const mb = $('mulligan-bar');
    mb.style.display = mull.length ? '' : 'none';
    if (mull.length) {
      $('keep-btn').onclick = function () { UI.doAction(mull.find(function (a) { return a.keep; })); };
      $('mull-btn').onclick = function () { UI.doAction(mull.find(function (a) { return !a.keep; })); };
    }
  }

  function renderResources(s) {
    [['my-res', UI.humanSeat], ['enemy-res', SB.other(UI.humanSeat)]].forEach(function (pair) {
      const res = s.players[pair[1]].resources;
      const ready = res.filter(function (r) { return !r.exhausted; }).length;
      $(pair[0]).textContent = ready + '/' + res.length +
        (s.players[pair[1]].credits > 0 ? ' +¢' + s.players[pair[1]].credits : '');
    });
    $('enemy-hand-count').textContent = String(s.players[SB.other(UI.humanSeat)].hand.length);
    $('my-deck-count').textContent = String(s.players[UI.humanSeat].deck.length);
  }

  // Action types with spatial affordances elsewhere in the UI.
  const SPATIAL = { playCard: 1, attack: 1, pass: 1, claimInitiative: 1, deployLeader: 1,
    deployLeaderPilot: 1, leaderAction: 1, mulligan: 1, resourceCard: 1, choose: 1,
    unitAction: 1, baseEpic: 1, smuggle: 1 };

  function actionLabel(s, a) {
    const cardName = function (id) { return SB.names.card(id); };
    switch (a.type) {
      case 'discardCard': return 'Discard: ' + cardName(s.players[a.targetPlayer != null ? a.targetPlayer : a.player].hand[a.handIndex].cardId);
      case 'playHandCard': return a.handIndex === -1 ? SB.names.ui.decline : 'Play: ' + cardName(a.cardId);
      case 'searchTake': return a.deckIndex === -1 ? SB.names.ui.decline : 'Take: ' + cardName(s.players[a.player].deck[a.deckIndex].cardId);
      case 'binary': return a.pick === 'a' ? 'Option 1' : 'Option 2';
      case 'effectAttack': return a.target ? (a.target.kind === 'base' ? 'Attack the base' : 'Attack ' + unitName(s, a.target.uid)) : SB.names.ui.decline;
      case 'exploitUnit': return 'Sacrifice: ' + unitName(s, a.uid);
      case 'peekAct': return a.mode === 'play' ? 'Play: ' + cardName(a.cardId) : 'Top card: ' + a.mode;
      case 'indirectTo': case 'dividedTo': return a.target.kind === 'base' ? 'Assign 1 to base' : 'Assign 1 to ' + unitName(s, a.target.uid);
      case 'mayReady': return a.uid == null ? SB.names.ui.decline : 'Ready: ' + unitName(s, a.uid);
      case 'takeFromDiscard': return a.index === -1 ? SB.names.ui.decline : 'Return: ' + cardName(s.players[a.player].discard[a.index].cardId);
      case 'plotPlay': return a.resourceIndex === -1 ? SB.names.ui.decline : 'Scheme: ' + cardName(a.cardId);
      case 'plotAttach': return 'Attach to: ' + unitName(s, a.uid);
      case 'leaderTrigger': return a.use ? SB.names.ui.leaderAbility : SB.names.ui.decline;
      case 'massExhaust': case 'budgetExhaust': return a.uid == null ? 'Stop' : 'Exhaust: ' + unitName(s, a.uid);
      case 'massAttackChoose': case 'supportChoose': return a.uid == null ? 'Stop' : 'Attack with: ' + unitName(s, a.uid);
      case 'defeatOwn': return 'Defeat: ' + unitName(s, a.uid);
      case 'swapPick': return 'Trade away: ' + unitName(s, a.uid);
      case 'captureBudget': return a.uid == null ? 'Stop' : 'Capture: ' + unitName(s, a.uid);
      case 'oppOffer': return 'Offer: ' + unitName(s, a.uid);
      case 'tokenDouble': return a.use ? 'Sacrifice to double' : 'Keep the unit';
      case 'readyTax': return a.pay ? 'Pay to stay ready' : 'Stay exhausted';
      case 'payXp': return a.pay ? 'Pay 1 (gain a token)' : 'Stop paying';
      case 'bottomCard': return 'Bottom: ' + cardName(s.players[a.player].hand[a.handIndex].cardId);
      case 'bottomDiscard': return a.index === -1 ? 'Done' : 'Bottom: ' + cardName(s.players[a.player].discard[a.index].cardId);
      case 'bottomUnit': return 'Bottom: ' + cardName(s.players[a.player].discard[a.index].cardId);
      case 'arrange2': return 'Order: ' + a.mode;
      case 'moveUpgrade': return a.from == null ? SB.names.ui.decline : 'Move upgrade to ' + unitName(s, a.to);
      case 'defeatUpgrade': return 'Defeat upgrade on ' + unitName(s, a.uid);
      case 'auctionPick': return 'Reveal ' + (a.who === UI.humanSeat ? 'your' : 'their') + ' deck';
      case 'auctionPlay': return a.play ? 'Play it free' : SB.names.ui.decline;
      default: return a.type;
    }
  }

  // §17: a button list must never be a set of unexplained verbs. Hovering one lights
  // up the card it concerns — the reverse of clicking a card to act on it.
  function highlight(iid) {
    document.querySelectorAll('.card.role-hinted').forEach(function (n) {
      n.classList.remove('role-hinted');
    });
    if (iid == null) return;
    const n = document.querySelector('.card[data-iid="' + iid + '"]');
    if (n) n.classList.add('role-hinted');
  }

  function actionButton(s, a, label) {
    const b = el('button', 'action-btn', label);
    b.onclick = function () { UI.doAction(a); };
    const focusIid = a.uid != null ? a.uid : (a.attacker != null ? a.attacker : a.attachTo);
    if (focusIid != null) {
      b.addEventListener('mouseenter', function () { highlight(focusIid); });
      b.addEventListener('mouseleave', function () { highlight(null); });
      b.addEventListener('focus', function () { highlight(focusIid); });
      b.addEventListener('blur', function () { highlight(null); });
    }
    return b;
  }

  // Cards a queue step lets you LOOK at that no button carries (peeked deck tops).
  // Spec §13: a choice about a card the board does not draw must show the card face.
  function revealedCards(s) {
    if (s.queue.length === 0) return [];
    const it = s.queue[0];
    const deck = it.player != null ? s.players[it.player].deck : null;
    switch (it.step) {
      case 'peekDecide':
        return deck && deck[0] ? [{ cardId: deck[0].cardId, label: 'Top card' }] : [];
      case 'arrangeTop2': {
        const out = [];
        if (deck && deck[0]) out.push({ cardId: deck[0].cardId, label: 'First (top)' });
        if (deck && deck[1]) out.push({ cardId: deck[1].cardId, label: 'Second' });
        return out;
      }
      case 'auctionPlay':
        return it.cardId ? [{ cardId: it.cardId, label: 'Revealed' }] : [];
      default: return [];
    }
  }

  // The card face a generic action concerns, when it lives in a pile the board
  // does not draw (deck / discard / an opponent's hand being looked at).
  function actionCardId(s, a) {
    const p = a.player != null ? s.players[a.player] : null;
    switch (a.type) {
      case 'searchTake': return a.deckIndex >= 0 ? p.deck[a.deckIndex].cardId : null;
      case 'takeFromDiscard': return a.index >= 0 ? p.discard[a.index].cardId : null;
      case 'bottomDiscard': case 'bottomUnit': return a.index >= 0 ? p.discard[a.index].cardId : null;
      case 'playHandCard': return a.handIndex === -1 ? null : (a.cardId || null);
      case 'peekAct': return a.mode === 'play' ? a.cardId : null;
      case 'plotPlay': return a.resourceIndex === -1 ? null : (a.cardId || null);
      case 'bottomCard': return p.hand[a.handIndex].cardId;
      case 'discardCard':
        return s.players[a.targetPlayer != null ? a.targetPlayer : a.player].hand[a.handIndex].cardId;
      default: return null;
    }
  }

  // A card face + its action button, previewable like any board card.
  function choiceChip(s, cardId, label, action) {
    const chip = el('div', 'choice-chip');
    if (label) chip.appendChild(el('div', 'choice-chip-label', label));
    const face = SB.renderCard({ cardId: cardId }, { size: 'hand', state: s });
    face.tabIndex = 0;
    SB.preview && SB.preview.attach(face, cardId, null, function () { return UI.state; });
    chip.appendChild(face);
    if (action) {
      chip.appendChild(actionButton(s, action, actionLabel(s, action)));
      face.style.cursor = 'pointer';
      face.addEventListener('click', function () { UI.doAction(action); });
    }
    return chip;
  }

  function renderChoices(s, acts) {
    const bar = $('choice-bar');
    bar.textContent = '';
    // Multi-variant drop resolution (e.g. play plain vs exploit levels).
    if (UI.pendingVariants) {
      const variants = UI.pendingVariants;
      UI.pendingVariants = null;
      variants.forEach(function (a) {
        const label = a.exploit ? 'Play, sacrificing ' + a.exploit :
          a.type === 'unitAction' ? 'Use ability' : 'Play: ' + SB.names.card(a.cardId);
        const b = el('button', 'action-btn', label);
        b.onclick = function () { UI.doAction(a); };
        bar.appendChild(b);
      });
      const cancel = el('button', null, SB.names.ui.decline);
      cancel.onclick = function () { UI.render(); };
      bar.appendChild(cancel);
      bar.style.display = '';
      return;
    }
    const mineToAct = whoActs(s) === UI.humanSeat;
    if (mineToAct && s.queue.length > 0 && s.queue[0].candidates) {
      // The prompt line says what is being asked and the board (or the modal) carries
      // the picks; the bar is left with the one thing neither can be: declining.
      const inter = SB.choiceInteraction(s);
      if (inter && !inter.cardBacked) { bar.style.display = 'none'; return; }   // modal owns it
      const decline = acts.find(function (a) { return a.type === 'choose' && a.index === -1; });
      if (decline) bar.appendChild(actionButton(s, decline, SB.names.ui.decline));
      bar.style.display = decline ? '' : 'none';
      return;
    }
    const generic = mineToAct ? acts.filter(function (a) { return !SPATIAL[a.type]; }) : [];
    if (generic.length > 0) {
      // Show the faces of any cards this choice is about (peeked tops first, then
      // one face per card-referencing action) — a button list must never ask the
      // player to decide about a card they cannot see.
      const shown = {};
      revealedCards(s).forEach(function (r) {
        shown[r.cardId] = true;
        bar.appendChild(choiceChip(s, r.cardId, r.label, null));
      });
      generic.slice(0, 24).forEach(function (a) {
        const cid = actionCardId(s, a);
        if (cid && !shown[cid]) {
          shown[cid] = true;
          bar.appendChild(choiceChip(s, cid, null, a));
        } else {
          bar.appendChild(actionButton(s, a, actionLabel(s, a)));
        }
      });
      bar.style.display = '';
    } else {
      bar.style.display = 'none';
    }
  }

  // §16: always say what the game is waiting for. The card supplies WHAT (generated
  // in text.js); this appends HOW.
  function renderPrompt(s, acts) {
    const node = $('prompt');
    const p = SB.promptLine(s, UI.humanSeat, whoActs(s));
    node.textContent = p.text;
    node.className = 'prompt ' + (p.cls || '');
  }
})(window.SB = window.SB || {});
