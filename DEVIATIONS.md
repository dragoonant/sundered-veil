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
