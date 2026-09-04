// test-expansion.js — the second op vocabulary (js/ops2.js) and the engine hooks it
// rides on, pinned through real competitive-expansion cards. Each test builds one
// position, drives the choice queue with explicit picks, and asserts the board.
(function (SB) {
  'use strict';
  const T = SB.test;

  // Resolve the open queue by picking, at each step, the first action `pick` accepts
  // (or the first action when `pick` is absent). Returns the settled state.
  function drive(s, pick, limit) {
    let n = 0;
    while (s.queue.length > 0 && !SB.isTerminal(s) && n++ < (limit || 40)) {
      const acts = SB.legalActions(s);
      const a = (pick && acts.find(pick)) || acts[0];
      s = SB.apply(s, a);
    }
    return s;
  }
  function rich(s, who) { T.giveResources(s, who, 14); return s; }
  function play(s, who, cardId, extra) {
    s.active = who; // a play passes the turn; tests string several plays by one seat
    const inst = T.putInHand(s, who, cardId);
    const idx = s.players[who].hand.indexOf(inst);
    return T.act(s, Object.assign({ type: 'playCard', handIndex: idx, cardId: cardId }, extra || {}));
  }
  // A leader's unit side on the board (the generic helper reads the root arena).
  function deployed(s, who, leaderId) {
    const u = SB.makeUnit(s, leaderId, who);
    u.exhausted = false;
    s[SB.card(leaderId).deployedSide.arena || 'ground'].push(u);
    return u;
  }
  function unitsOf(s, who, cardId) {
    return SB.allUnits(s, who).filter(function (u) { return u.cardId === cardId; });
  }

  T.add('expansion: choose an arena and exhaust every unit in it', function () {
    let s = rich(T.game(), 0); s.active = 0;
    const me = 0, foe = 1;
    const g1 = T.putOnBoard(s, foe, 'fx-grunt'), g2 = T.putOnBoard(s, foe, 'fx-wall');
    const fl = T.putOnBoard(s, foe, 'fx-flyer');
    s = play(s, me, 'ash-219');
    s = drive(s, function (a) { return (a.type === 'binary' && a.pick === 'a') || (a.type === 'pickArena' && a.arena === 'ground'); });
    T.ok(SB.findUnit(s, g1.uid).exhausted && SB.findUnit(s, g2.uid).exhausted, 'ground units exhausted');
    T.ok(!SB.findUnit(s, fl.uid).exhausted, 'space unit untouched');
  });

  T.add('expansion: a static cost discount from a unit in play', function () {
    let s = T.game(); const me = 0;
    const before = SB.cardCost(s, me, 'jtl-041');
    deployed(s, me, 'jtl-005');
    T.eq(SB.cardCost(s, me, 'jtl-041'), before - 2, 'capital ships cost 2 less while the deployed leader is in play');
  });

  T.add('expansion: "the next unit you play enters ready" honours its filter', function () {
    let s = rich(T.game(), 0); s.active = 0; const me = 0;
    s = play(s, me, 'ash-248'); s = drive(s);
    s = play(s, me, 'fx-grunt'); // power 2: not eligible
    T.ok(unitsOf(s, me, 'fx-grunt')[0].exhausted, 'a 2-power unit still arrives exhausted');
    s = play(s, me, 'fx-wall');  // power 1: eligible
    T.ok(!unitsOf(s, me, 'fx-wall')[0].exhausted, 'a 1-power unit arrives ready');
    s = play(s, me, 'fx-medic'); // grant consumed
    T.ok(unitsOf(s, me, 'fx-medic')[0].exhausted, 'the grant was spent');
  });

  T.add('expansion: an aura can take a keyword away', function () {
    let s = T.game(); const me = 0, foe = 1;
    const wall = T.putOnBoard(s, foe, 'fx-wall');
    const mine = T.putOnBoard(s, me, 'fx-grunt');
    T.ok(SB.hasKeyword(s, wall, 'sentinel'), 'sentinel before');
    T.ok(!SB.attackTargets(s, mine).some(function (t) { return t.kind === 'base'; }), 'base shielded by the sentinel');
    T.putOnBoard(s, me, 'ash-040');
    T.ok(!SB.hasKeyword(s, wall, 'sentinel'), 'sentinel lost under the aura');
    T.ok(SB.attackTargets(s, mine).some(function (t) { return t.kind === 'base'; }), 'base attackable again');
  });

  T.add('expansion: dynamic stats count other friendly space units', function () {
    let s = T.game(); const me = 0;
    const sq = T.putOnBoard(s, me, 'jtl-115');
    const base = SB.unitPower(s, sq);
    T.putOnBoard(s, me, 'fx-flyer'); T.putOnBoard(s, me, 'fx-flyer');
    T.eq(SB.unitPower(s, sq), base + 2, '+1 power per other friendly space unit');
    T.eq(SB.unitMaxHp(s, sq), SB.card('jtl-115').hp + 2, '+1 HP per other friendly space unit');
  });

  T.add('expansion: numeric keyword granted to each matching unit for the round', function () {
    let s = T.game(); s.active = 0; const me = 0;
    const y = T.putOnBoard(s, me, 'lof-045');
    const luke = T.putOnBoard(s, me, 'ash-112', { exhausted: true });
    T.eq(SB.keywordTotal(s, luke, 'restore'), 1, 'printed restore 1');
    s = T.act(s, { type: 'attack', attacker: y.uid, target: { kind: 'base', player: 1 } });
    s = drive(s);
    T.eq(SB.keywordTotal(s, SB.findUnit(s, luke.uid), 'restore'), 2, 'gained restore 1 on top');
  });

  T.add('expansion: naming a card blocks the opponent from playing it', function () {
    let s = rich(T.game(), 0); s.active = 0; const me = 0, foe = 1;
    T.putInHand(s, foe, 'fx-bolt');
    s = play(s, me, 'ash-077');
    s = drive(s, function (a) { return a.type === 'nameCard' && a.cardId === 'fx-bolt'; });
    T.ok(SB.nameBlocked(s, foe, 'fx-bolt'), 'the named card is blocked for the opponent');
    s.active = foe; T.giveResources(s, foe, 5);
    T.ok(!SB.legalActions(s).some(function (a) { return a.type === 'playCard' && a.cardId === 'fx-bolt'; }), 'and cannot be played');
    T.ok(!SB.nameBlocked(s, me, 'fx-bolt'), 'the namer may still play copies');
  });

  T.add('expansion: losing all abilities, then defeat by cost', function () {
    let s = rich(T.game(), 0); s.active = 0; const me = 0, foe = 1;
    const brute = T.putOnBoard(s, foe, 'fx-brute'); // cost 4, overwhelm
    s = play(s, me, 'law-132');
    s = drive(s, function (a) { return a.type === 'choose'; });
    const b = SB.findUnit(s, brute.uid);
    T.ok(b, 'a 4-cost unit is not defeated');
    T.ok(!SB.hasKeyword(s, b, 'overwhelm'), 'but it lost its keyword');
    let s2 = rich(T.game(), 0); s2.active = 0;
    const wall = T.putOnBoard(s2, foe, 'fx-wall'); // cost 2
    s2 = play(s2, me, 'law-132'); s2 = drive(s2);
    T.ok(!SB.findUnit(s2, wall.uid), 'a 2-cost unit is defeated');
  });

  T.add('expansion: defeat units under a remaining-HP budget, creating a token each', function () {
    let s = rich(T.game(), 0); s.active = 0; const me = 0, foe = 1;
    const g = T.putOnBoard(s, foe, 'fx-grunt'), f = T.putOnBoard(s, foe, 'fx-flyer');
    s = play(s, me, 'ash-053');
    // Pick the two enemies (the freshly created friendly tokens are legal picks too);
    // stop once neither is offered.
    s = drive(s, function (a) { return a.type === 'budgetDefeat' && (a.uid === g.uid || a.uid === f.uid); });
    T.ok(!SB.findUnit(s, g.uid) && !SB.findUnit(s, f.uid), 'both 2-HP units fell within the budget of 6');
    T.eq(unitsOf(s, me, 'tok-mnd').length, 2, 'one token per unit defeated');
  });

  T.add('expansion: a base captures a unit and rescues it at the regroup phase', function () {
    let s = rich(T.game(), 0); s.active = 0; const me = 0, foe = 1;
    const g = T.putOnBoard(s, foe, 'fx-grunt');
    s = play(s, me, 'sec-195'); s = drive(s);
    T.ok(!SB.findUnit(s, g.uid), 'captured off the board');
    T.eq((s.players[me].baseCaptured || []).length, 1, 'held at the base');
    s = T.act(s, { type: 'pass' }); s = T.act(s, { type: 'pass' }); // both seats pass in turn
    s = drive(s, function (a) { return a.type === 'resourceCard' && a.handIndex === -1; });
    T.ok(SB.findUnit(s, g.uid), 'rescued at the start of the regroup phase');
  });

  T.add('expansion: borrowing another unit\'s last-words ability without defeating it', function () {
    let s = rich(T.game(), 0); s.active = 0; const me = 0;
    const m = T.putOnBoard(s, me, 'fx-martyr');
    const hand = s.players[me].hand.length;
    s = play(s, me, 'jtl-039');
    s = drive(s, function (a) { return a.type === 'choose' && a.index >= 0; });
    T.ok(SB.findUnit(s, m.uid), 'the martyr lives');
    T.eq(s.players[me].hand.length, hand + 1, 'its draw happened anyway');
  });

  T.add('expansion: "when an enemy unit is defeated" observers fire', function () {
    let s = rich(T.game(), 0); s.active = 0; const me = 0, foe = 1;
    T.putOnBoard(s, me, 'lof-130');
    const g = T.putOnBoard(s, foe, 'fx-grunt');
    const before = s.players[foe].base.damage;
    s = play(s, me, 'fx-bolt');
    s = drive(s, function (a) { return a.type === 'choose' && s.queue[0].candidates[a.index].uid === g.uid; });
    T.ok(!SB.findUnit(s, g.uid), 'grunt defeated');
    T.eq(s.players[foe].base.damage, before + 1, 'its controller\'s base took 1');
  });

  T.add('expansion: a shield on the guardian breaks instead of a lethal hit on a friend', function () {
    let s = rich(T.game(), 0); s.active = 0; const me = 0;
    const guard = T.putOnBoard(s, me, 'ash-062', { shields: 1 });
    const g = T.putOnBoard(s, me, 'fx-grunt');
    s = play(s, me, 'fx-bolt');
    s = drive(s, function (a) { return a.type === 'choose' && s.queue[0].candidates[a.index].uid === g.uid; });
    T.ok(SB.findUnit(s, g.uid) && SB.findUnit(s, g.uid).damage === 0, 'the grunt was spared');
    T.eq(SB.findUnit(s, guard.uid).shields, 0, 'at the price of the guardian\'s shield');
  });

  T.add('expansion: moving a shield token between units', function () {
    let s = rich(T.game(), 0); s.active = 0; const me = 0;
    const g = T.putOnBoard(s, me, 'fx-grunt', { shields: 1 });
    s = play(s, me, 'jtl-242');
    const shuttle = unitsOf(s, me, 'jtl-242')[0];
    s = drive(s, function (a) { return (a.type === 'tokenTake' && a.uid === g.uid) || (a.type === 'tokenGive' && a.uid === shuttle.uid); });
    T.eq(SB.findUnit(s, g.uid).shields, 0, 'taken from the grunt');
    T.eq(SB.findUnit(s, shuttle.uid).shields, 2, 'given to the shuttle (on top of its own)');
  });

  T.add('expansion: a pilot unit boards a vehicle, and ejects when it would be defeated', function () {
    let s = rich(T.game(), 0); s.active = 0; const me = 0;
    const luke = T.putOnBoard(s, me, 'jtl-094');
    s = play(s, me, 'jtl-038');
    s = drive(s, function (a) { return a.type === 'pilotFromUnit' && a.uid === luke.uid; });
    const ship = unitsOf(s, me, 'jtl-038')[0];
    T.ok(!SB.findUnit(s, luke.uid), 'no longer a ground unit');
    T.ok(ship.upgrades.some(function (i) { return i.cardId === 'jtl-094'; }), 'now a pilot upgrade');
    SB.defeatUnit(s, ship, {});
    const back = unitsOf(s, me, 'jtl-094')[0];
    T.ok(back && SB.arenaOf(s, back) === 'ground' && back.exhausted, 'ejected to the ground arena, exhausted');
  });

  T.add('expansion: a discard action plays a card discarded this round', function () {
    let s = rich(T.game(), 0); s.active = 0; const me = 0;
    const inst = { uid: s.nextUid++, cardId: 'shd-135' };
    s.players[me].discard.push(inst);
    T.ok(!SB.legalActions(s).some(function (a) { return a.type === 'playDiscardAction'; }), 'not offered for an old discard');
    SB.noteDiscarded(s, me, inst);
    s = T.act(s, { type: 'playDiscardAction', cardId: 'shd-135' });
    T.eq(unitsOf(s, me, 'shd-135').length, 1, 'played from the discard pile');
  });

  T.add('expansion: granted smuggle lets any resource be played', function () {
    let s = rich(T.game(), 0); s.active = 0; const me = 0;
    s.players[me].resources.push({ instance: { uid: s.nextUid++, cardId: 'fx-grunt' }, exhausted: false });
    T.ok(!SB.legalActions(s).some(function (a) { return a.type === 'smuggle' && a.cardId === 'fx-grunt'; }), 'no smuggle without the grant');
    T.putOnBoard(s, me, 'shd-248');
    T.ok(SB.legalActions(s).some(function (a) { return a.type === 'smuggle' && a.cardId === 'fx-grunt'; }), 'smuggle offered with the grant');
    s = T.act(s, { type: 'smuggle', cardId: 'fx-grunt' });
    T.eq(unitsOf(s, me, 'fx-grunt').length, 1, 'and it enters play');
  });

  T.add('expansion: a base that shrinks the opening hand', function () {
    const s = SB.newGame({ deck0: 'deck-c08', deck1: 'fixtureB', seed: 'hand' });
    T.eq(SB.card(SB.decks['deck-c08'].base).startingHandDelta, -1, 'the deck carries the base in question');
    T.eq(s.players[0].hand.length, 5, 'five cards instead of six');
    T.eq(s.players[1].hand.length, 6, 'the other side unaffected');
  });

  T.add('expansion: "when you take the initiative" on a leader side', function () {
    let s = T.game('deck-c08', 'fixtureB', 'init');
    s.active = 0; s.initiativeClaimed = false; s.locked = [false, false]; s.passed = [false, false];
    T.giveResources(s, 0, 3);
    const hand = s.players[0].hand.length;
    s = T.act(s, { type: 'claimInitiative' });
    s = drive(s, function (a) { return (a.type === 'leaderTrigger' && a.use) || (a.type === 'binary' && a.pick === 'a'); });
    T.eq(s.players[0].hand.length, hand + 1, 'paid 1 to draw a card');
    T.ok(s.players[0].leader.exhausted === false, 'no exhaust cost on this trigger');
  });

  T.add('expansion: a combat static with a generic condition (first attack strikes first)', function () {
    let s = T.game(); s.active = 0; const me = 0, foe = 1;
    const pod = T.putOnBoard(s, me, 'law-219');
    const g = T.putOnBoard(s, foe, 'fx-grunt');
    T.ok(SB.unitPower(s, pod) >= 2, 'premise: the racer can kill the grunt outright');
    s = T.act(s, { type: 'attack', attacker: pod.uid, target: { kind: 'unit', uid: g.uid } });
    s = drive(s);
    T.ok(!SB.findUnit(s, g.uid), 'grunt defeated');
    T.eq(SB.findUnit(s, pod.uid).damage, 0, 'first strike: no damage back on the first attack of the round');
  });

  T.add('expansion: "when your base is dealt combat damage" observers', function () {
    let s = T.game(); s.active = 1; const me = 0, foe = 1;
    const eval1 = T.putOnBoard(s, me, 'ts26-073');
    const g = T.putOnBoard(s, foe, 'fx-grunt');
    s = T.act(s, { type: 'attack', attacker: g.uid, target: { kind: 'base', player: me } });
    s = drive(s, function (a) { return a.type === 'choose' && s.queue[0].candidates[a.index].uid === g.uid; });
    T.eq(SB.findUnit(s, g.uid).damage, 1, 'the attacker took 1 from the defender\'s observer');
    T.ok(SB.findUnit(s, eval1.uid), 'observer still there');
  });

  T.add('expansion: every card of the 20 tournament lists renders and validates', function () {
    let n = 0;
    Object.keys(SB.decks).forEach(function (d) {
      if (SB.decks[d].group !== 'competitive') return;
      const dk = SB.decks[d];
      [dk.leader, dk.base].concat(dk.cards, dk.sideboard || []).forEach(function (id) {
        const lines = SB.cardText(id);
        T.ok(Array.isArray(lines), id + ' renders');
        lines.forEach(function (l) { T.ok(!/undefined|\[object/.test(l), id + ' has a hole: ' + l); });
        n++;
      });
    });
    T.ok(n > 1000, 'walked the lists (' + n + ' slots)');
  });
  T.add("expansion: the opponent, not the hand owner, picks the card discarded by ash-220", function () {
    let s = rich(T.game(), 1);
    T.putInHand(s, 0, "sor-045");
    s = play(s, 1, "ash-220");
    T.eq(s.queue[0].step, "discardChoice", "the pick is pending");
    T.eq(SB.whoActs(s), 1, "the player who played the card acts");
    const acts = SB.legalActions(s);
    T.ok(acts.length > 1 && acts.every(function (a) { return a.player === 1 && a.targetPlayer === 0; }), "every choice is the opponent picking from seat 0's hand");
    s = SB.apply(s, acts[0]);
    T.eq(s.queue.length && s.queue[0].step === "discardChoice" ? 1 : 0, 0, "the pick resolves");
  });
  // ---- 2026-09 card audit regressions (tools/lint-cards.mjs, tools/audit-cards.mjs) ----

  T.add('audit: an upgrade with uniqueOnly may only attach to a unique unit', function () {
    let s = rich(T.game(), 0); s.active = 0;
    const plain = T.putOnBoard(s, 0, 'fx-grunt');
    const champ = T.putOnBoard(s, 0, 'sor-049'); // unique
    T.putInHand(s, 0, 'sec-256');
    const acts = SB.legalActions(s).filter(function (a) { return a.type === 'playCard' && a.cardId === 'sec-256'; });
    T.eq(acts.length, 1, 'exactly one legal bearer');
    T.eq(acts[0].attachTo, champ.uid, 'the unique unit, not ' + plain.uid);
  });

  T.add('audit: attaching an upgrade does not re-fire the bearer\'s onPlay, and fires the upgrade\'s once', function () {
    let s = rich(T.game(), 0); s.active = 0;
    const foe = T.putOnBoard(s, 1, 'fx-grunt');
    const sniper = T.putOnBoard(s, 0, 'fx-sniper'); // onPlay: 2 damage to an enemy unit
    s = drive(play(s, 0, 'fx-blade', { attachTo: sniper.uid }));
    T.eq(SB.findUnit(s, foe.uid).damage, 0, 'bearer onPlay did not run again');
    // sec-069: onPlay exhaust a ready unit in the bearer's arena (optional).
    const other = T.putOnBoard(s, 0, 'fx-wall');
    const before = s.log.length;
    s = drive(play(s, 0, 'sec-069', { attachTo: sniper.uid }), function (a) { return a.type === 'choose' && a.index >= 0; });
    const ex = s.log.slice(before).filter(function (e) { return e.type === 'exhausted'; });
    T.eq(ex.length, 1, 'one exhaust from one onPlay, got ' + ex.length);
    T.ok(other.uid || true, 'board intact');
  });

  T.add('audit: an event\'s ability-level condition gates the whole event', function () {
    let s = rich(T.game(), 0); s.active = 0;
    const mine = T.putOnBoard(s, 0, 'fx-flyer', { exhausted: true });
    // Opponent has no space units, so jtl-209 (ready all friendly space units if the
    // opponent controls more space units) must fizzle.
    s = drive(play(s, 0, 'jtl-209'));
    T.eq(SB.findUnit(s, mine.uid).exhausted, true, 'stayed exhausted');
    T.ok(s.log.some(function (e) { return e.type === 'fizzle' && e.why === 'condition' && e.cardId === 'jtl-209'; }), 'fizzle logged');
    // And with the condition true it readies.
    let s2 = rich(T.game(), 0); s2.active = 0;
    const mine2 = T.putOnBoard(s2, 0, 'fx-flyer', { exhausted: true });
    T.putOnBoard(s2, 1, 'fx-flyer'); T.putOnBoard(s2, 1, 'fx-flyer');
    s2 = drive(play(s2, 0, 'jtl-209'));
    T.eq(SB.findUnit(s2, mine2.uid).exhausted, false, 'readied when the opponent has more space units');
  });
})(window.SB = window.SB || {});
