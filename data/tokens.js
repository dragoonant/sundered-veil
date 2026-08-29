// tokens.js — token units created by effects. Hand-maintained; ids are stable
// internal ids (tok-*). Trait ids follow the generated trait map (see names files
// for display). token:true keeps them out of hands/discards when they leave play.
(function (SB) {
  'use strict';
  Object.assign(SB.cards, {
    'tok-gv1': { id: 'tok-gv1', type: 'unit', token: true, cost: 0, power: 1, hp: 1, arena: 'ground',
      aspects: ['villainy'], traits: ['tr34', 'tr08', 'tr43'] },
    'tok-gh2': { id: 'tok-gh2', type: 'unit', token: true, cost: 0, power: 2, hp: 2, arena: 'ground',
      aspects: ['heroism'], traits: ['tr33', 'tr05', 'tr43'] },
    'tok-sv1': { id: 'tok-sv1', type: 'unit', token: true, cost: 0, power: 1, hp: 1, arena: 'space',
      aspects: ['villainy'], traits: ['tr46', 'tr10'] },
    'tok-sh2': { id: 'tok-sh2', type: 'unit', token: true, cost: 0, power: 2, hp: 2, arena: 'space',
      aspects: ['heroism'], traits: ['tr46', 'tr10'] },
    'tok-spy': { id: 'tok-spy', type: 'unit', token: true, cost: 0, power: 0, hp: 2, arena: 'ground',
      aspects: [], traits: ['tr29'], keywords: [{ k: 'raid', n: 2 }] },
    'tok-mnd': { id: 'tok-mnd', type: 'unit', token: true, cost: 0, power: 2, hp: 2, arena: 'ground',
      aspects: ['vigilance'], traits: ['tr25'], keywords: [{ k: 'shielded' }] },
  });
  SB.names.cards['tok-gv1'] = { name: 'P-TOK-GV1' };
  SB.names.cards['tok-gh2'] = { name: 'P-TOK-GH2' };
  SB.names.cards['tok-sv1'] = { name: 'P-TOK-SV1' };
  SB.names.cards['tok-sh2'] = { name: 'P-TOK-SH2' };
  SB.names.cards['tok-spy'] = { name: 'P-TOK-SPY' };
  SB.names.cards['tok-mnd'] = { name: 'P-TOK-MND' };
})(window.SB = window.SB || {});
