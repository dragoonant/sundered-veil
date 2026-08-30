# DEVIATIONS

Deliberate, minor divergences from printed behavior (all logged here per the
"faithful, no cuts" instruction — each is a digital-model simplification, not a
missing mechanic):

- Deck searches shuffle the whole deck instead of bottoming the unseen window in
  random order (indistinguishable for hidden zones).
- "Name a card, then look at the opponent's hand and discard a card with that
  name" is modeled as: reveal the hand, then the caster chooses one card to
  discard (slightly stronger than naming blind).
- "For this attack" stat changes granted by on-attack abilities last until end of
  round when granted as temporary keywords/stats (relevant only if the same unit
  is readied and attacks again in the same round).
- Multi-unit "give X to up to N distinct units" effects granted through repeated
  single-target picks can, for one card (Luminous-Beings analogue), pick the same
  unit twice.
- Abilities lent to another attacker by a support-style unit last until end of
  round rather than only for that one attack.

## From CARD-LOG-AND-TARGETING-SPEC.md

- **§4, "never auto-resolve a forced target silently."** The engine still resolves a
  sole forced target without a prompt. Raising a confirm-only dialog for a decision
  with one possible answer would make the AI and every fuzz game pay for a click that
  decides nothing, and `SB.legalActions` would have to offer an action that cannot be
  refused. The knowledge the rule protects — *that something was targeted, and what* —
  is restored instead by an `autoTarget` log entry carrying `notice: true`, so the
  play is announced on a highlighted line with a card preview attached.
  Guarded by `tests/test-log.js`.
- **§2, second-person rewriting.** The spec humanises engine prose (`Player 0 draws 2.`)
  with sentinel substitution and a bare-verb table. This engine never writes prose at
  all — log entries are pure structured data and `js/logtext.js` generates the sentence
  at render time, already in the right person. The substitution machinery, and the
  three bugs the spec warns about, have nothing to act on here.
- **§12, multi-pick targeting.** The engine has no `min`/`max` multi-select choice:
  "choose up to N" is modeled as repeated single picks with a Stop action. The
  `multiPicks` toggle list, Confirm/Clear buttons and set-equality matching therefore
  have no counterpart to drive, and are not implemented.
