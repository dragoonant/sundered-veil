// names.js — ALL display text lives here, keyed by stable internal id or slug.
// Nothing else in the repo may contain display names. Populated per set by the
// content phase; fixtures used by tests register their names in the test files
// via SB.names.register.
(function (SB) {
  'use strict';

  SB.names = {
    cards: {},     // cardId -> {name, subtitle?}
    traits: {},    // trait slug -> display
    aspects: {
      command: 'Command', aggression: 'Aggression', cunning: 'Cunning',
      vigilance: 'Vigilance', heroism: 'Heroism', villainy: 'Villainy',
    },
    keywords: {
      sentinel: 'Sentinel', saboteur: 'Saboteur', ambush: 'Ambush',
      overwhelm: 'Overwhelm', raid: 'Raid', restore: 'Restore',
      shielded: 'Shielded', grit: 'Grit', hidden: 'Hidden',
      bounty: 'Bounty', smuggle: 'Smuggle', exploit: 'Exploit',
      piloting: 'Piloting', coordinate: 'Coordinate', plot: 'Plot',
      unkillableThisRound: 'Deathless (this round)',
      support: 'Support',
    },
    // Reminder text for the preview/inspector glossary (js/cardview.js).
    keywordHelp: {
      sentinel: 'Enemy units in this arena must attack this unit before any non-sentinel target or your base.',
      saboteur: 'When attacking, this unit ignores sentinels and destroys the defender’s shields first.',
      ambush: 'When played, this unit may immediately ready and attack an enemy unit.',
      overwhelm: 'Damage beyond the defender’s remaining HP carries over to the enemy base.',
      raid: 'This unit gets +X power while it is attacking.',
      restore: 'When this unit attacks, heal X damage from your base.',
      shielded: 'Enters play with a shield token; a shield absorbs one full hit, then breaks.',
      grit: 'This unit gets +1 power for each damage on it.',
      hidden: 'Cannot be attacked during the round it entered play.',
      bounty: 'When this unit is defeated or captured, the OTHER player collects the listed reward.',
      smuggle: 'While face-down as a resource, you may play this card for its smuggle cost; the top card of your deck replaces it.',
      exploit: 'You may defeat up to X friendly units while playing this; each pays 2 of the cost.',
      piloting: 'May instead be played for its piloting cost as an upgrade aboard a friendly vehicle without a pilot.',
      coordinate: 'Active while you control 3 or more units.',
      plot: 'While face-down as a resource, you may play this card (paying its cost) when you deploy a leader.',
      support: 'When played, you may attack with another friendly unit, lending it this unit’s attack abilities.',
      unkillableThisRound: 'This round, running out of HP does not defeat this unit.',
    },
    decks: {},     // deckId -> display name
    ui: {
      round: 'Round', yourTurn: 'Your move', enemyTurn: 'Opponent is acting…',
      initiative: 'Initiative', pass: 'Pass', claim: 'Take initiative',
      deploy: 'Deploy leader', leaderAbility: 'Leader ability',
      exhausted: 'Exhausted', ready: 'Ready', deployed: 'Deployed',
      youWin: 'Victory!', youLose: 'Defeat', skip: 'Skip', chooseTarget: 'Choose a target',
      decline: 'Decline', keep: 'Keep hand', mulligan: 'Mulligan', undo: 'Undo',
      newGame: 'New game', helpBtn: 'How to play',
      // The log/history drawer (collapsed at the start of a game) and its controls.
      logDrawer: 'Battle log', logOpen: 'Log', logClose: 'Close',
      muteOn: 'Sound: on', muteOff: 'Sound: off',
      // The title screen and its deck picker.
      gameTitle: 'Starbound Legions',
      gameTagline: 'Two fleets. One war. Only one base left standing.',
      titleHint: 'Click to continue',
      chooseDeck: 'Choose your legion', chooseDifficulty: 'Opponent skill',
      startGame: 'Start the battle',
      difficulty: { easy: 'Easy', mid: 'Medium', hard: 'Hard' },
      // The per-turn banner and the initiative marker on a leader.
      initiativeYours: 'You hold the initiative',
      initiativeTheirs: 'The opponent holds the initiative',
      // The leader popover: deploy and abilities live on the leader card itself.
      leaderClose: 'Close', leaderNoActions: 'Nothing to do with your leader right now.',
      theirLeader: 'Opponent leader', baseEpicAction: 'Base epic action',
      theirHand: 'Opponent hand',
      // The Current token, in its own slot between the leader and the draw deck.
      forceHeld: 'The Current — held, ready to spend',
      forceSpent: 'The Current — not held',
      // Zone browser (click a pile to look through it).
      browseClose: 'Close',
      browseEmpty: 'Nothing here yet.',
      yourDiscard: 'Your discard pile', theirDiscard: 'Opponent discard pile',
      yourResources: 'Your resources',
      browseNewestFirst: 'Most recent first',
      browseResourceNote: 'Face down on the board — only you may look.',
      // Board zone labels. The board draws these itself now (js/boardart.js); they
      // were pixels baked into the old mat image, which put display text outside
      // this file. Rendered in caps by the board, so written here in normal case.
      zones: {
        drawDeck: 'Draw Deck', discardPile: 'Discard Pile', resources: 'Resources',
        base: 'Base', leader: 'Leader', force: 'The Current',
        groundArena: 'Ground Arena', spaceArena: 'Space Arena',
      },
    },
    // How-to-play text (rendered by js/help.js). Original tutorial wording.
    help: {
      title: 'How to Play',
      close: 'Close',
      sections: [
        ['Goal', 'Reduce the enemy base from 30 HP to 0 before yours falls. Your leader, base, and a 50-card deck are your side of the war.'],
        ['Setup', 'You draw 6 cards and may mulligan once (redraw all 6). Then you pick 2 cards from your hand to lay face-down as your starting resources — they are fuel, not cards you will play.'],
        ['Rounds', 'Each round has an action phase and a regroup phase. In the action phase you and the opponent alternate taking ONE action at a time. When both players pass in a row, the round moves to regroup: both draw 2 cards, each may bank 1 card from hand as a new resource, and everything readies for the next round.'],
        ['Your actions', 'On your turn you may: play a card (paying its cost by exhausting that many ready resources), attack with a ready unit, use an ability, take the initiative token, or pass. Passing does not lock you out — if the opponent acts, you may act again.'],
        ['Costs & aspects', 'Every card shows a cost and colored aspect icons. Your leader and base provide your aspect icons; each icon on a card you cannot match costs 2 extra resources. Neutral cards have no icons and never cost extra.'],
        ['Initiative', 'One player holds the initiative token and acts first each round. Taking the initiative as your action claims the token for next round — but you take no more actions this phase, so time it well.'],
        ['Arenas & combat', 'Units fight in two arenas: ground and space. A unit attacks only enemy units in its own arena, or either base. Attacking exhausts the unit; attacker and defender strike each other simultaneously with their power, and damage stays on units between rounds. Sentinels must be attacked first. Units enter play exhausted unless an effect says otherwise.'],
        ['Leaders', 'Your leader sits in its own slot with a usable ability — click the leader card to see it enlarged and to use it. Once you control enough resources, deploy them as a powerful unit (some can instead board a friendly vehicle as its pilot). If defeated, the leader flips back — bruised but not gone.'],
        ['Keywords', 'Common unit keywords: Sentinel (must be attacked first) · Ambush (may attack immediately when played) · Overwhelm (extra damage spills onto the base) · Raid X (+X power while attacking) · Restore X (attacking heals your base) · Shielded (arrives with a shield that absorbs one hit) · Saboteur (ignores sentinels and shields) · Grit (+1 power per damage on it) · Hidden (cannot be attacked the round it arrives) · Bounty (defeating it rewards the OTHER player) · Smuggle (playable from your resource row) · Plot (playable from resources when you deploy a leader) · Exploit (sacrifice friendly units to pay part of the cost) · Piloting (playable as an upgrade aboard a vehicle).'],
        ['The Current & tokens', 'Some decks channel the Current: attacking with an Attuned unit grants your power token, spent to fuel potent abilities. Other decks mint credit tokens (each pays 1 resource when spent) or advantage tokens (+1 power that expires after the unit fights).'],
        ['Reading the board', 'Numbers on a unit are power/remaining HP. A tilted card is exhausted. Blue-edged cards can act; red-glowing things are legal targets after you select an attacker or card. When an effect needs a decision, a panel opens in the middle of the screen with a button for every legal choice; hide it to study the board, then bring it back. Hover a card in hand to read its full rules text, and open the battle log from the tab on the left edge.'],
        ['Tips', 'Bank spare cards as resources early — economy wins long games. Do not feed weak attackers into big defenders; hit the base when their board cannot punish you. Watch the initiative: claiming it before a big round can matter more than one extra play.'],
      ],
    },
    register: function (kind, id, value) { SB.names[kind][id] = value; },
    card: function (cardId) {
      const n = SB.names.cards[cardId];
      return n ? n.name : ('[' + cardId + ']');
    },
  };
})(window.SB = window.SB || {});
