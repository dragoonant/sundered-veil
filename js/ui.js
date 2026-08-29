// ui.js — board rendering + input. Every affordance is a FILTER over
// SB.legalActions(state); the UI can never invent a rule. Click-based core
// (tap a card/unit → legal uses highlight → tap a highlighted target).
// Depends on: everything. Loaded last in index.html only.
(function (SB) {
  'use strict';

  const UI = SB.ui = {
    state: null, history: [], selected: null, humanSeat: 0,
    aiThinking: false,
  };

  function $(id) { return document.getElementById(id); }

  UI.start = function (opts) {
    UI.humanSeat = 0;
    UI.history = [];
    UI.state = SB.newGame({
      deck0: opts.deck0, deck1: opts.deck1,
      seed: opts.seed || ('g' + Math.floor(Math.random() * 1e9)),
    });
    UI.aiDifficulty = opts.difficulty || 'mid';
    UI.render();
    UI.maybeAI();
  };

  UI.doAction = function (action) {
    UI.history.push(UI.state);
    UI.state = SB.apply(UI.state, action);
    UI.selected = null;
    SB.sound && SB.sound.play(UI.state);
    UI.render();
    UI.maybeAI();
  };

  UI.undo = function () {
    // Undo to the last point the human was to act (skips over AI replies).
    while (UI.history.length > 0) {
      const prev = UI.history.pop();
      if (whoActs(prev) === UI.humanSeat) { UI.state = prev; break; }
    }
    UI.selected = null;
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
      UI.state = SB.apply(UI.state, action);
      SB.sound && SB.sound.play(UI.state);
      UI.render();
      UI.maybeAI();
    }, 450);
  };

  // ---- rendering ----------------------------------------------------------

  UI.render = function () {
    const s = UI.state;
    if (!s) return;
    const acts = SB.isTerminal(s) ? [] : SB.legalActions(s);
    const mine = acts.filter(function (a) {
      return whoActs(s) === UI.humanSeat;
    });

    renderStatus(s, acts);
    renderBase($('enemy-base'), s, SB.other(UI.humanSeat), acts);
    renderBase($('my-base'), s, UI.humanSeat, acts);
    renderLeader($('enemy-leader'), s, SB.other(UI.humanSeat), acts);
    renderLeader($('my-leader'), s, UI.humanSeat, acts);
    renderArena($('arena-space'), s, 'space', acts);
    renderArena($('arena-ground'), s, 'ground', acts);
    renderHand(s, acts);
    renderResources(s, acts);
    renderChoices(s, acts);
    renderLog(s);
    $('undo-btn').disabled = UI.history.length === 0;
  };

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function renderStatus(s, acts) {
    const st = $('status');
    st.textContent = '';
    if (SB.isTerminal(s)) {
      st.appendChild(el('span', 'big', s.winner === UI.humanSeat ? SB.names.ui.youWin : SB.names.ui.youLose));
      return;
    }
    st.appendChild(el('span', null, SB.names.ui.round + ' ' + s.round + ' — '));
    const turn = whoActs(s) === UI.humanSeat ? SB.names.ui.yourTurn : SB.names.ui.enemyTurn;
    st.appendChild(el('span', 'turn', turn));
    st.appendChild(el('span', 'chip' + (s.initiative === UI.humanSeat ? ' held' : ''),
      SB.names.ui.initiative));
    // Phase-level buttons.
    const btns = $('turn-buttons');
    btns.textContent = '';
    acts.forEach(function (a) {
      if (a.type === 'pass' || a.type === 'claimInitiative' || a.type === 'deployLeader') {
        const label = a.type === 'pass' ? SB.names.ui.pass :
          a.type === 'claimInitiative' ? SB.names.ui.claim : SB.names.ui.deploy;
        const b = el('button', 'action-btn', label);
        b.onclick = function () { UI.doAction(a); };
        btns.appendChild(b);
      }
      if (a.type === 'leaderAction') {
        const b = el('button', 'action-btn', SB.names.ui.leaderAbility);
        b.onclick = function () { UI.doAction(a); };
        btns.appendChild(b);
      }
    });
  }

  function renderBase(node, s, playerIdx, acts) {
    node.textContent = '';
    const base = s.players[playerIdx].base;
    const card = SB.card(base.cardId);
    node.appendChild(el('div', 'card-name', SB.names.card(base.cardId)));
    node.appendChild(el('div', 'hp', (card.hp - base.damage) + '/' + card.hp));
    // Attack-the-base affordance.
    const attack = acts.find(function (a) {
      return a.type === 'attack' && UI.selected && a.attacker === UI.selected &&
        a.target.kind === 'base' && a.target.player === playerIdx;
    });
    node.classList.toggle('targetable', !!attack);
    node.onclick = attack ? function () { UI.doAction(attack); } : null;
    // Choice targets on bases.
    const choice = choiceFor(s, acts, { kind: 'base', player: playerIdx });
    if (choice) {
      node.classList.add('targetable');
      node.onclick = function () { UI.doAction(choice); };
    }
  }

  function choiceFor(s, acts, targetLike) {
    if (s.queue.length === 0 || !s.queue[0].candidates) return null;
    const idx = s.queue[0].candidates.findIndex(function (c) {
      return JSON.stringify(c) === JSON.stringify(targetLike);
    });
    if (idx < 0) return null;
    return acts.find(function (a) { return a.type === 'choose' && a.index === idx; }) || null;
  }

  function renderLeader(node, s, playerIdx, acts) {
    node.textContent = '';
    const L = s.players[playerIdx].leader;
    node.appendChild(el('div', 'card-name', SB.names.card(L.cardId)));
    node.appendChild(el('div', 'sub', L.deployed ? SB.names.ui.deployed :
      (L.exhausted ? SB.names.ui.exhausted : SB.names.ui.ready)));
  }

  function unitNode(s, u, acts) {
    const def = SB.unitDef(u);
    const n = el('div', 'unit' + (u.exhausted ? ' exhausted' : '') +
      (u.owner === UI.humanSeat ? ' mine' : ' theirs'));
    n.dataset.uid = u.uid;
    const art = el('div', 'unit-art');
    const img = SB.artUrl && SB.artUrl(u.cardId);
    if (img) {
      art.style.backgroundImage = 'url("' + img + '")';
    }
    n.appendChild(art);
    n.appendChild(el('div', 'card-name', SB.names.card(u.cardId)));
    n.appendChild(el('div', 'stats', SB.unitPower(s, u) + '/' + SB.unitRemainingHp(s, u)));
    if (u.shields > 0) n.appendChild(el('div', 'badge shield-badge', '◈' + (u.shields > 1 ? u.shields : '')));
    if (u.experience > 0) n.appendChild(el('div', 'badge xp-badge', '+' + u.experience));
    if (u.upgrades.length > 0) n.appendChild(el('div', 'badge upg-badge', '⚙' + u.upgrades.length));

    // Selectable attacker?
    const canAttack = acts.some(function (a) { return a.type === 'attack' && a.attacker === u.uid; });
    if (canAttack) n.classList.add('can-act');
    if (UI.selected === u.uid) n.classList.add('selected');

    // Attack target?
    const attack = acts.find(function (a) {
      return a.type === 'attack' && UI.selected && a.attacker === UI.selected &&
        a.target.kind === 'unit' && a.target.uid === u.uid;
    });
    // Upgrade target for a selected hand card?
    const attach = acts.find(function (a) {
      return a.type === 'playCard' && UI.selectedHand != null && a.handIndex === UI.selectedHand &&
        a.attachTo === u.uid;
    });
    const choice = choiceFor(s, acts, { kind: 'unit', uid: u.uid });
    if (attack || attach || choice) n.classList.add('targetable');

    n.onclick = function () {
      if (choice) return UI.doAction(choice);
      if (attack) return UI.doAction(attack);
      if (attach) return UI.doAction(attach);
      if (canAttack) {
        UI.selected = UI.selected === u.uid ? null : u.uid;
        UI.selectedHand = null;
        UI.render();
      }
    };
    return n;
  }

  function renderArena(node, s, arena, acts) {
    node.textContent = '';
    const theirs = el('div', 'arena-row theirs-row');
    const mine = el('div', 'arena-row mine-row');
    s[arena].forEach(function (u) {
      (u.owner === UI.humanSeat ? mine : theirs).appendChild(unitNode(s, u, acts));
    });
    node.appendChild(theirs);
    node.appendChild(mine);
  }

  function renderHand(s, acts) {
    const node = $('hand');
    node.textContent = '';
    const p = s.players[UI.humanSeat];
    p.hand.forEach(function (inst, i) {
      const card = SB.card(inst.cardId);
      const n = el('div', 'hand-card');
      n.appendChild(el('div', 'cost', String(SB.cardCost(s, UI.humanSeat, inst.cardId))));
      n.appendChild(el('div', 'card-name', SB.names.card(inst.cardId)));
      if (card.type === 'unit') n.appendChild(el('div', 'stats', card.power + '/' + card.hp));
      const text = SB.cardText(inst.cardId);
      if (text.length) n.title = text.join('\n');

      const plays = acts.filter(function (a) { return a.type === 'playCard' && a.handIndex === i; });
      const resource = acts.find(function (a) {
        return a.type === 'resourceCard' && a.player === UI.humanSeat && a.handIndex === i;
      });
      if (plays.length > 0 || resource) n.classList.add('can-act');
      if (UI.selectedHand === i) n.classList.add('selected');
      n.onclick = function () {
        if (resource) return UI.doAction(resource);
        if (plays.length === 1 && plays[0].attachTo == null) return UI.doAction(plays[0]);
        if (plays.length > 0) { // upgrade: select, then click a highlighted unit
          UI.selectedHand = UI.selectedHand === i ? null : i;
          UI.selected = null;
          UI.render();
        }
      };
      node.appendChild(n);
    });
    // Decline regroup resourcing.
    const decline = acts.find(function (a) {
      return a.type === 'resourceCard' && a.player === UI.humanSeat && a.handIndex === -1;
    });
    const db = $('decline-btn');
    db.style.display = decline ? '' : 'none';
    db.onclick = decline ? function () { UI.doAction(decline); } : null;
    // Mulligan buttons.
    const mull = acts.filter(function (a) { return a.type === 'mulligan' && a.player === UI.humanSeat; });
    const mb = $('mulligan-bar');
    mb.style.display = mull.length ? '' : 'none';
    if (mull.length) {
      $('keep-btn').onclick = function () { UI.doAction(mull.find(function (a) { return a.keep; })); };
      $('mull-btn').onclick = function () { UI.doAction(mull.find(function (a) { return !a.keep; })); };
    }
  }

  function renderResources(s, acts) {
    [['my-res', UI.humanSeat], ['enemy-res', SB.other(UI.humanSeat)]].forEach(function (pair) {
      const node = $(pair[0]);
      const res = s.players[pair[1]].resources;
      const ready = res.filter(function (r) { return !r.exhausted; }).length;
      node.textContent = ready + '/' + res.length;
    });
    $('enemy-hand-count').textContent = String(s.players[SB.other(UI.humanSeat)].hand.length);
    $('my-deck-count').textContent = String(s.players[UI.humanSeat].deck.length);
  }

  function renderChoices(s, acts) {
    // Non-spatial choices (e.g. optional effects with only a decline) get a bar.
    const bar = $('choice-bar');
    bar.textContent = '';
    if (s.queue.length > 0 && s.queue[0].candidates && whoActs(s) === UI.humanSeat) {
      bar.appendChild(el('span', null, SB.names.ui.chooseTarget));
      const decline = acts.find(function (a) { return a.type === 'choose' && a.index === -1; });
      if (decline) {
        const b = el('button', 'action-btn', SB.names.ui.decline);
        b.onclick = function () { UI.doAction(decline); };
        bar.appendChild(b);
      }
      bar.style.display = '';
    } else {
      bar.style.display = 'none';
    }
  }

  function renderLog(s) {
    const node = $('log');
    node.textContent = '';
    s.log.slice(-14).forEach(function (l) {
      node.appendChild(el('div', 'log-line', SB.describeLog ? SB.describeLog(l) : l.type));
    });
    node.scrollTop = node.scrollHeight;
  }
})(window.SB = window.SB || {});
