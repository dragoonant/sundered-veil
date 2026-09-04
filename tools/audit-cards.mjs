// audit-cards.mjs — behavioural audit: exercise every authored card through the real
// engine (play, attack, defeat, deploy, leader action) on a stocked board, auto-answering
// every queued choice. Prints one line per card that is not clean. Usage:
//   node tools/audit-cards.mjs [--all] [--id sor-005]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'tests.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]).filter(s => !/^tests\/test-/.test(s));
const window = {}; window.window = window;
const ctx = vm.createContext({ window, console, SB: undefined });
for (const s of srcs) vm.runInContext(readFileSync(join(root, s), 'utf8'), ctx, { filename: s });
const SB = window.SB, T = SB.test;
SB.validateContent();
const args = process.argv.slice(2);
const only = args.includes('--id') ? args[args.indexOf('--id') + 1] : null;
const showAll = args.includes('--all');
const FRAME = new Set(['playCard', 'attackDeclared', 'attack', 'combatDamage', 'exhausted', 'resourcesSpent', 'pass', 'actionPhase',
  'attached', 'deployLeader', 'leaderAction', 'unitAction', 'autoTarget']);

function drain(s, rec) {
  let n = 0;
  while (!SB.isTerminal(s) && s.queue.length > 0) {
    if (++n > 80) { rec.notes.push('drain>80'); break; }
    const acts = SB.legalActions(s);
    if (acts.length === 0) { rec.dead = s.queue[0].step; break; }
    // Prefer a real choice over declining/skipping so optional effects get exercised.
    const pick = acts.find(a => a.type === 'choose' && !a.skip && !a.decline && !a.none && !a.pass) || acts[0];
    s = SB.apply(s, pick);
  }
  return s;
}
function stock(s) {
  T.giveResources(s, 0, 12); T.giveResources(s, 1, 12);
  T.putOnBoard(s, 0, 'fx-grunt'); T.putOnBoard(s, 0, 'fx-flyer'); T.putOnBoard(s, 0, 'fx-wall', { damage: 2 });
  T.putOnBoard(s, 1, 'fx-grunt', { damage: 1 }); T.putOnBoard(s, 1, 'fx-flyer'); T.putOnBoard(s, 1, 'fx-gritty');
  T.putInHand(s, 0, 'fx-bolt'); T.putInHand(s, 0, 'fx-grunt'); T.putInHand(s, 1, 'fx-bolt');
  s.players[0].discard.push({ uid: s.nextUid++, cardId: 'fx-supply' }, { uid: s.nextUid++, cardId: 'fx-grunt' });
  return s;
}
function fresh(seed) {
  let s = T.game('fixtureA', 'fixtureB', seed);
  s = stock(s);
  if (SB.whoActs(s) !== 0) { const p = SB.legalActions(s).find(a => a.type === 'pass'); if (p) s = SB.apply(s, p); }
  return s;
}
function phase(rec, name, s, fn) {
  const before = s.log.length;
  let out = null;
  s.active = 0; s.passed = [false, false];
  try { out = fn(s); } catch (e) { rec.threw = name + ': ' + (e.message || e).toString().slice(0, 160); return null; }
  const st = out || s;
  const added = st.log.slice(before);
  const fz = added.filter(e => e.type === 'fizzle').map(e => e.why);
  const eff = added.filter(e => !FRAME.has(e.type) && e.type !== 'fizzle').length;
  rec.phases[name] = { eff, fz, dead: rec.dead };
  rec.dead = null;
  return st;
}
function abilityTriggers(def) { return (def.abilities || []).map(a => a.trigger); }
function audit(id) {
  const c = SB.cards[id];
  const rec = { id, type: c.type, phases: {}, notes: [], threw: null, dead: null };
  let s = fresh('audit|' + id);
  const me = 0;
  if (c.type === 'unit' || c.type === 'event' || c.type === 'upgrade') {
    const inst = T.putInHand(s, me, id);
    s = phase(rec, 'play', s, st => {
      const acts = SB.legalActions(st).filter(a => a.type === 'playCard' && a.cardId === id);
      if (acts.length === 0) { rec.notes.push('unplayable'); return st; }
      // Prefer attaching to a friendly non-token bearer; upgrades default to first.
      return drain(SB.apply(st, acts[0]), rec);
    });
    if (!s) return rec;
    if (c.type === 'unit') {
      const u = SB.findUnit(s, [...s.ground, ...s.space].find(x => x.cardId === id && x.owner === me)?.uid);
      if (!u) { rec.notes.push('not on board after play'); return rec; }
      if (abilityTriggers(c).some(t => /attack|Attack|combat/i.test(t)) || (c.keywords || []).length) {
        u.exhausted = false;
        s = phase(rec, 'attack', s, st => {
          const acts = SB.legalActions(st).filter(a => a.type === 'attack' && a.attacker === u.uid);
          if (acts.length === 0) { rec.notes.push('no attack action'); return st; }
          const unitTarget = acts.find(a => a.target && a.target.kind === 'unit') || acts[0];
          return drain(SB.apply(st, unitTarget), rec);
        });
        if (!s) return rec;
      }
      if (abilityTriggers(c).includes('action')) {
        s = phase(rec, 'unitAction', s, st => {
          const cur = SB.findUnit(st, u.uid); if (cur) cur.exhausted = false;
          const acts = SB.legalActions(st).filter(a => a.type === 'unitAction' && a.uid === u.uid);
          if (acts.length === 0) { rec.notes.push('no unitAction'); return st; }
          return drain(SB.apply(st, acts[0]), rec);
        });
        if (!s) return rec;
      }
      if (abilityTriggers(c).includes('whenDefeated')) {
        s = phase(rec, 'defeat', s, st => {
          const cur = SB.findUnit(st, u.uid);
          if (!cur) { rec.notes.push('gone before defeat'); return st; }
          cur.damage = Math.max(0, SB.unitDef(cur).hp + (cur.hpBonus || 0) - 1); cur.shields = 0;
          T.putInHand(st, me, 'fx-bolt');
          const play = SB.legalActions(st).find(a => a.type === 'playCard' && a.cardId === 'fx-bolt');
          if (!play) { rec.notes.push('cannot play bolt'); return st; }
          let st2 = SB.apply(st, play);
          const head = st2.queue[0];
          const idx = head && head.candidates ? head.candidates.findIndex(c => c.uid === u.uid) : -1;
          if (idx < 0) { rec.notes.push('bolt cannot target it'); return st2; }
          st2 = SB.apply(st2, { type: 'choose', player: me, index: idx });
          st2 = drain(st2, rec);
          if (SB.findUnit(st2, u.uid)) rec.notes.push('survived bolt');
          return st2;
        });
      }
    }
  } else if (c.type === 'leader') {
    const lead = s.players[me].leader;
    if (abilityTriggers(c.leaderSide).includes('action')) {
      s = phase(rec, 'leaderAction', s, st => {
        const acts = SB.legalActions(st).filter(a => a.type === 'leaderAction');
        if (acts.length === 0) { rec.notes.push('no leaderAction'); return st; }
        return drain(SB.apply(st, acts[0]), rec);
      });
      if (!s) return rec;
    }
    s.players[me].leader = Object.assign({}, lead, { cardId: id, exhausted: false, deployed: false });
    s = phase(rec, 'deploy', s, st => {
      const acts = SB.legalActions(st).filter(a => a.type === 'deployLeader');
      if (acts.length === 0) { rec.notes.push('no deploy action'); return st; }
      return drain(SB.apply(st, acts[0]), rec);
    });
    if (!s) return rec;
    const du = [...s.ground, ...s.space].find(x => x.cardId === id && x.owner === me);
    if (du && abilityTriggers(c.deployedSide).some(t => /attack|Attack|combat/i.test(t))) {
      du.exhausted = false;
      s = phase(rec, 'attack', s, st => {
        const acts = SB.legalActions(st).filter(a => a.type === 'attack' && a.attacker === du.uid);
        if (acts.length === 0) { rec.notes.push('no attack action'); return st; }
        return drain(SB.apply(st, acts.find(a => a.target && a.target.kind === 'unit') || acts[0]), rec);
      });
    } else if (!du) rec.notes.push('leader not on board after deploy');
  }
  return rec;
}
const ids = Object.keys(SB.cards).filter(id => !/^(fx|tok)-/.test(id)).filter(id => {
  const c = SB.cards[id];
  if (only) return id === only;
  if (c.type === 'base') return false;
  const has = d => (d.abilities || []).length || (d.keywords || []).length;
  return c.type === 'leader' ? has(c.leaderSide) || has(c.deployedSide) : has(c);
});
let bad = 0;
for (const id of ids) {
  const r = audit(id);
  const flags = [];
  if (r.threw) flags.push('THROW ' + r.threw);
  for (const p of Object.keys(r.phases)) {
    const ph = r.phases[p];
    if (ph.dead) flags.push('DEAD@' + p + ':' + ph.dead);
    if (ph.fz.length) flags.push('FIZZLE@' + p + ':' + ph.fz.join(','));
    const want = { play: 'onPlay', deploy: 'onDeploy', leaderAction: 'action', unitAction: 'action', attack: 'onAttack', defeat: 'whenDefeated' }[p];
    const def = r.type === 'leader' ? (p === 'leaderAction' ? SB.cards[r.id].leaderSide : SB.cards[r.id].deployedSide) : SB.cards[r.id];
    if (ph.eff === 0 && want && abilityTriggers(def).includes(want)) flags.push('NOEFFECT@' + p);
  }
  if (r.notes.length) flags.push('NOTE ' + r.notes.join(';'));
  if (flags.length || showAll) { bad++; console.log(r.id.padEnd(9) + r.type.padEnd(8) + flags.join(' | ')); }
}
console.log(ids.length + ' cards exercised, ' + bad + ' flagged');
