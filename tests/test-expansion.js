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
  // Top the bank up to EXACTLY n ready resources: T.game() already deals a starting
  // few, so an affordability test cannot just hand over a count and hope.
  function fund(s, who, n) {
    const have = SB.readyResources(s, who);
    if (n > have) T.giveResources(s, who, n - have);
    return s;
  }
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
  T.add('expansion: a paid branch is not offered when the cost cannot be met', function () {
    // jtl-096 costs 3 and its "when played" branch charges 2 more. Played on exactly
    // 3 resources there is nothing left to pay with, so only the free branch stands.
    let s = T.game();
    fund(s, 0, SB.card('jtl-096').cost);   // exactly the card, nothing spare
    s = play(s, 0, 'jtl-096');
    T.eq(SB.readyResources(s, 0), 0, 'the play emptied the bank');
    T.eq(s.queue[0].step, 'binaryPick', 'the choice is pending');
    const acts = SB.legalActions(s);
    T.eq(acts.length, 1, 'one branch only');
    T.eq(acts[0].pick, 'b', 'and it is the branch that costs nothing');
    s = SB.apply(s, acts[0]);
    const u = unitsOf(s, 0, 'jtl-096')[0];
    T.ok(u && SB.arenaOf(s, u) === 'space', 'it never moved arena');
    T.eq(u.experience, 0, 'and gained nothing it did not pay for');
  });

  T.add('expansion: with the resources spare, the paid branch is offered and charged', function () {
    let s = T.game();
    fund(s, 0, SB.card('jtl-096').cost + 2);  // the card, plus the branch's price
    s = play(s, 0, 'jtl-096');
    const acts = SB.legalActions(s);
    T.eq(acts.length, 2, 'both branches stand');
    s = drive(SB.apply(s, acts.find(function (a) { return a.pick === 'a'; })));
    const u = unitsOf(s, 0, 'jtl-096')[0];
    T.eq(SB.readyResources(s, 0), 0, 'paid 3 for the card and 2 for the branch');
    T.eq(SB.arenaOf(s, u), 'ground', 'moved arena');
    T.eq(u.experience, 2, 'and took its two experience');
  });

  T.add('expansion: an unpayable cost drops the effects it was buying', function () {
    // The guard above keeps this off the table in play, so pin the last line of
    // defence directly: a cost that cannot be met takes its own invocation with it
    // rather than fizzling alone and letting the rest resolve for free.
    let s = T.game();
    const u = T.putOnBoard(s, 0, 'fx-grunt');
    s.players[0].resources.forEach(function (r) { r.exhausted = true; });
    SB.queueEffects(s, 0, [
      { op: 'spendResources', amount: 2 },
      { op: 'experience', amount: 2, target: { self: true } },
    ], { sourceUid: u.uid, cardId: 'fx-grunt' });
    SB.drainQueue(s);
    T.eq(SB.findUnit(s, u.uid).experience, 0, 'the effect behind the cost never ran');
    T.ok(s.log.some(function (l) { return l.why === 'cantPay'; }), 'and the log says why');
  });

  T.add("expansion: an upgrade's when-played ability resolves once, not twice", function () {
    // lof-091 deals damage equal to its bearer's power, itself included. On a 2-power
    // bearer that is 4 — once. It used to fire twice, because the upgrade was already
    // attached when the bearer's own triggers were fired.
    let s = rich(T.game(), 0);
    const mine = T.putOnBoard(s, 0, 'fx-grunt');      // 2 power, 4 with the upgrade
    const foe = T.putOnBoard(s, 1, 'fx-gritty');      // 2/6: survives 4, dies to 8
    s = play(s, 0, 'lof-091', { attachTo: mine.uid });
    s = drive(s);
    const hit = SB.findUnit(s, foe.uid);
    T.ok(hit, 'the target survived a single hit');
    T.eq(hit.damage, 4, "took the bearer's power exactly once");
    T.eq(s.log.filter(function (l) { return l.type === 'unitDamage' && l.uid === foe.uid; }).length, 1,
      'and the log records one hit');
  });

  T.add("expansion: attaching an upgrade does not re-fire the bearer's own play ability", function () {
    // fx-sniper deals 2 when IT is played. Putting an upgrade on it later is not a
    // second play of the sniper.
    let s = rich(T.game(), 0);
    const foe = T.putOnBoard(s, 1, 'fx-gritty');
    s = play(s, 0, 'fx-sniper');
    s = drive(s);
    const after = SB.findUnit(s, foe.uid).damage;
    const sniper = unitsOf(s, 0, 'fx-sniper')[0];
    s = play(s, 0, 'fx-blade', { attachTo: sniper.uid });
    s = drive(s);
    T.eq(SB.findUnit(s, foe.uid).damage, after, 'the sniper did not shoot again');
  });

  T.add('expansion: an upgrade that bounces the OTHER upgrades leaves itself alone', function () {
    // ash-199 needs to know which upgrade it is; it learns that from its own play ctx,
    // which the duplicate trigger path used to be the only source of.
    let s = rich(T.game(), 0);
    const mine = T.putOnBoard(s, 0, 'fx-grunt');
    s = play(s, 0, 'fx-blade', { attachTo: mine.uid });
    s = drive(s);
    s = play(s, 0, 'ash-199', { attachTo: mine.uid });
    s = drive(s);
    const worn = SB.findUnit(s, mine.uid).upgrades.map(function (i) { return i.cardId; });
    T.eq(worn.join(','), 'ash-199', 'it stayed and the other one went');
    T.ok(s.players[0].hand.some(function (i) { return i.cardId === 'fx-blade'; }), 'the other one is back in hand');
  });

  // ---- a leader piloting a ship belongs to whoever DEPLOYED it -----------------
  // Seize the enemy ship their leader is flying, kill it, and it must be THEIR leader
  // that goes back to the sideline. Every consumer used to read the bearer's controller,
  // so this sidelined the wrong player's leader and marked it defeated for the game.
  function leaderAboard(s, seat, bearerCardId) {
    const p = s.players[seat];
    p.leader.cardId = 'jtl-009';                 // a leader with a pilot side
    const bearer = T.putOnBoard(s, seat, bearerCardId);
    p.leader.deployed = 'pilot';
    const inst = { uid: s.nextUid++, cardId: p.leader.cardId, leaderPilot: true, owner: seat };
    p.leader.uid = inst.uid;
    bearer.upgrades.push(inst);
    return bearer;
  }

  T.add('expansion: killing a seized ship sidelines ITS leader, not yours', function () {
    let s = rich(T.game(), 0);
    const bearer = leaderAboard(s, 1, 'fx-grunt');   // their leader, aboard their unit
    s.players[0].leader.deployed = false;
    // Seize it, exactly as the event in the report did, then defeat it.
    SB.ops.takeControl(s, { controller: 0, op: {}, ctx: {} }, { kind: 'unit', uid: bearer.uid });
    T.eq(SB.findUnit(s, bearer.uid).owner, 0, 'the ship changed hands');
    SB.defeatUnit(s, SB.findUnit(s, bearer.uid), {});
    T.eq(s.players[1].leader.deployed, false, 'THEIR leader left the board');
    T.ok(s.players[1].leader.defeated, 'and is out for the game, having died aboard');
    T.eq(s.players[0].leader.deployed, false, 'your leader was never deployed');
    T.ok(!s.players[0].leader.defeated, 'and is emphatically not defeated');
    T.ok(!s.players[0].leader.exhausted, 'nor exhausted');
    const sidelined = s.log.filter(function (l) { return l.type === 'leaderReturned'; });
    T.eq(sidelined.length, 1, 'one leader was sidelined');
    T.eq(sidelined[0].player, 1, 'and the log names the right player');
  });

  T.add('expansion: the ordinary case still works — your own ship, your own leader', function () {
    let s = rich(T.game(), 0);
    const bearer = leaderAboard(s, 0, 'fx-grunt');
    SB.defeatUnit(s, SB.findUnit(s, bearer.uid), {});
    T.eq(s.players[0].leader.deployed, false, 'your leader left the board');
    T.ok(s.players[0].leader.defeated, 'out for the game');
    T.ok(!s.players[1].leader.defeated, 'theirs untouched');
  });

  // ---- a deployed leader costs its DEPLOY cost -------------------------------
  // law-132 defeats the unit it hits only if that unit costs 3 or less. A leader card
  // has no `cost` field at all, so the test read undefined, || 0 made it the cheapest
  // thing on the board, and a 5-cost leader died to it.
  function deployLeaderUnit(s, seat, leaderId) {
    s.players[seat].leader.cardId = leaderId;
    const u = SB.makeUnit(s, leaderId, seat);
    u.exhausted = false;
    s[SB.card(leaderId).deployedSide.arena || 'ground'].push(u);
    s.players[seat].leader.deployed = true;
    s.players[seat].leader.uid = u.uid;
    return u;
  }

  T.add('expansion: a deployed leader is priced at its deploy cost, not at nothing', function () {
    T.eq(SB.costOf('jtl-005'), 5, 'the leader costs its deploy cost');
    T.eq(SB.costOf('fx-grunt'), SB.card('fx-grunt').cost, 'an ordinary unit is unchanged');
  });

  T.add('expansion: "defeat it if it costs 3 or less" does not defeat a 5-cost leader', function () {
    let s = T.game();
    s.active = 1; s.initiative = 1;
    const lead = deployLeaderUnit(s, 0, 'jtl-005');
    s.players[1].hand = [];
    T.putInHand(s, 1, 'law-132');
    T.giveResources(s, 1, 8);
    s = T.act(s, { type: 'playCard', cardId: 'law-132' });
    s = drive(s);
    const still = SB.findUnit(s, lead.uid);
    T.ok(still, 'the leader survived');
    T.ok(still.abilitiesSuppressed, 'and still lost its abilities, which is the rest of the card');
  });

  T.add('expansion: ...but it still defeats a unit that really does cost 3 or less', function () {
    let s = T.game();
    s.active = 1; s.initiative = 1;
    const cheap = T.putOnBoard(s, 0, 'fx-ambusher');   // cost 3
    T.eq(SB.card('fx-ambusher').cost, 3, 'the fixture is the cost the test assumes');
    s.players[1].hand = [];
    T.putInHand(s, 1, 'law-132');
    T.giveResources(s, 1, 8);
    s = T.act(s, { type: 'playCard', cardId: 'law-132' });
    s = drive(s);
    T.ok(!SB.findUnit(s, cheap.uid), 'the 3-cost unit died');
  });

  T.add('expansion: a two-hit event still finds its second target after the first hit kills the saved unit', function () {
    // sec-180: 3 damage to a unit, then (with initiative) 2 damage to another unit
    // in the same arena. The 3 damage defeated the first target, so the "same
    // arena as the chosen unit" lookup found nothing and the 2 damage fizzled
    // with an enemy still sitting in that arena.
    let s = T.game();
    s.active = 1; s.initiative = 1;
    const first = T.putOnBoard(s, 0, 'fx-flyer');     // space, hp 2: dies to the 3
    const second = T.putOnBoard(s, 0, 'fx-flyer');    // space: the legal follow-up
    const grounded = T.putOnBoard(s, 0, 'fx-grunt');  // ground: never legal for the 2
    s = rich(s, 1);
    s = play(s, 1, 'sec-180');
    const pick = function (st, uid) {
      const i = st.queue[0].candidates.findIndex(function (c) { return c.uid === uid; });
      T.ok(i >= 0, 'unit ' + uid + ' is offered');
      return T.act(st, { type: 'choose', index: i });
    };
    s = pick(s, first.uid);
    T.ok(!SB.findUnit(s, first.uid), 'the first hit killed its target');
    T.eq(s.queue[0] && s.queue[0].step, 'effect', 'the second hit is asking for a target');
    const uids = s.queue[0].candidates.map(function (c) { return c.uid; });
    T.deepEq(uids, [second.uid], 'the other space unit is the one legal target');
    T.ok(uids.indexOf(grounded.uid) < 0, 'the ground unit is not offered');
    s = pick(s, second.uid);
    T.ok(!SB.findUnit(s, second.uid), 'and the 2 damage defeats it (hp 2)');
    T.ok(SB.findUnit(s, grounded.uid), 'the ground unit was never touched');
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
})(window.SB = window.SB || {});
