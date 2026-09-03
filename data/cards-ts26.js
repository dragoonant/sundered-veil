// cards-ts26.js — GENERATED skeleton (tools/pull-sets.mjs), then hand-edited:
// abilities are authored manually from the scratch workpackets.
(function (SB) {
  'use strict';
  Object.assign(SB.cards, {
  // ---- competitive-expansion skeletons (tools/pull-sets.mjs); abilities authored by hand ----
  "ts26-002": {"id":"ts26-002","type":"leader","aspects":["vigilance","heroism"],"traits":["tr12","tr21","tr33"],"unique":true,"deployCost":5,"leaderSide":{"abilities":[{"trigger":"action","effects":[{"op":"shield","amount":1,"target":{"who":"friendly","what":"unit","playedThisRound":true}}],"cost":0,"condition":{"if":"enteredThisPhaseAtLeast","n":2}}]},"deployedSide":{"arena":"ground","power":4,"hp":5,"keywords":[{"k":"sentinel"}],"abilities":[{"trigger":"onAttack","effects":[{"op":"shield","amount":1,"target":{"who":"friendly","what":"unit","playedThisRound":true,"notSelf":true}}]}]}},
  "ts26-014": {"id":"ts26-014","type":"unit","aspects":["vigilance","command","heroism"],"traits":["tr12","tr21","tr33"],"unique":true,"cost":5,"power":4,"hp":4,"arena":"ground","costMod":{"if":"resourcesAtLeast","n":7,"delta":-2},"abilities":[{"trigger":"onPlay","effects":[{"op":"createToken","token":"tok-gh2","saveAs":"t"},{"op":"giveKeyword","k":"sentinel","useTarget":"t"}]},{"trigger":"whenDefeated","effects":[{"op":"createToken","token":"tok-gh2","saveAs":"t"},{"op":"giveKeyword","k":"sentinel","useTarget":"t"}]}]},
  "ts26-017": {"id":"ts26-017","type":"unit","aspects":["vigilance","command"],"traits":["tr34","tr29"],"unique":true,"cost":2,"power":2,"hp":3,"arena":"ground","keywords":[{"k":"restore","n":2},{"k":"ambush"}]},
  "ts26-018": {"id":"ts26-018","type":"unit","aspects":["vigilance","command"],"traits":["tr33","tr46","tr41"],"unique":true,"cost":4,"power":1,"hp":5,"arena":"space","keywords":[{"k":"restore","n":1}],"abilities":[{"trigger":"onPlay","effects":[{"op":"searchDeck","depth":8,"filter":{},"resourceIt":true}]}]},
  "ts26-029": {"id":"ts26-029","type":"unit","aspects":["aggression","cunning","villainy"],"traits":["tr45"],"unique":true,"cost":4,"power":4,"hp":4,"arena":"ground","keywords":[{"k":"ambush"}],"abilities":[{"trigger":"onAttack","effects":[{"op":"damage","amount":1,"target":{"who":"enemy","what":"unit"}},{"op":"damage","amount":1,"target":{"who":"friendly","what":"unit"}}]}]},
  "ts26-073": {"id":"ts26-073","type":"unit","aspects":["cunning","villainy"],"traits":["tr45"],"unique":true,"cost":3,"power":3,"hp":2,"arena":"ground","keywords":[{"k":"shielded"}],"abilities":[{"trigger":"onOwnBaseCombatDamaged","effects":[{"op":"damage","amount":1,"target":{"who":"any","what":"unit","optional":true}}]}]},
  });
})(window.SB = window.SB || {});
