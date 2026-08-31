# Art prompt rules (from the 20-card test run, art-test/)

The STYLE block in `tools/gen-art.mjs` is byte-identical across every card and now
carries the sci-fi grounding + background mandate. Per-card subject lines must follow:

1. **Never name the card.** `art-prompts.json` used to open with the card's own title
   ("Waylay trap surprise") — FLUX renders titles as on-image text. Describe only what
   is visible.
2. **Never use text-magnet nouns**: sign, signage, neon sign, banner, poster, flag,
   insignia, markings, regalia, label, screen/monitor/display *showing* anything,
   holotable, holographic readout, nameplate. Say "blank glowing panel", "unmarked
   hanging cloth", "plain hull plating".
3. **Sci-fi nouns only.** No knight, robe, cloak, princess, thief, crone, magic,
   mystical, jewelry, sword (use: adept, mantle/synthweave, plasma blade, augmented
   elder, energy). Also avoid stone-brick walls, cathedrals, wooden workshops — they
   drag the render medieval.
4. **Always state the environment** in the subject line (hangar bay, canyon spaceport,
   reactor shaft, jungle). No "plain background".
5. **Events are situations, not portraits.** Name at most 2–3 fully-visible figures,
   give each one an explicit body action, and state the contact ("driving a blade into",
   "tackling to the ground"). More than three actors produces disembodied limbs.
6. **Ships/locations**: end with "no people visible".
7. **Don't reproduce recognizable third-party costume design.** Flag any render whose
   armor reads as a specific existing franchise helmet (see NOTICE.md).

## Round-2 findings (art-test2/)

8. **Never negate.** "plain violet drapes **with no writing on them**" still produced ghost
   lettering. Negation summons the concept. Describe positively: "smooth violet cloth
   drapes". The STYLE block's blanket "no lettering" clause is fine; per-card negations
   are not.
9. **Corridors, alleys and cantinas spawn wall plaques** unprompted (jtl-209 grew "AA/AA"
   and "NTL AE" placards on bare bulkheads). If a card must be set in one, add "smooth
   featureless bulkhead walls". Prefer open settings where the card allows.
10. **FLUX signs its work.** A faint scribble appears in a bottom corner of roughly a
    third of renders. Prompt wording does not stop it. Fix at the pipeline level —
    crop ~4% off the bottom edge before writing the PNG.
11. **Don't use the word "sword"** even for an energy blade — it pulls a medieval
    crossguard and a solid metal blade every time. Say "cylindrical metal grip emitting
    a straight beam of blue plasma, blade made of light only, no crossguard".
12. **Exact counts above two are unreliable.** "three elders" rendered two, twice. For
    count-sensitive cards write "a group of" and let the number float, or restage the
    card around one or two figures.
13. **Restate chibi proportions in the subject line** for any card with humanoid figures
    in a detailed environment — the environment detail outcompetes the style block and
    the figures drift realistic.

## Full-run findings (414-card run, v2 → v3 fix pass)

14. **Crowded public settings are the single biggest text source.** `market`, `concourse`,
    `cantina`, `alley`, `plaza`, `spaceport`, `city street` — FLUX fills all of these with
    shop fronts and glyph signage regardless of the STYLE block. Describe the space
    physically instead: "a bare metal walkway", "a dim room of smooth riveted walls lit by
    colored light strips". Crowds are fine; storefronts are not.
15. **Naming a room with an institutional English word prints that word.** "cold blue
    hearing chamber" rendered a lit sign reading HEARIING. Never name a room by its
    function; describe its shape, material and light.
16. **The working energy-blade phrasing is "an ignited plasma blade, a straight glowing
    <color> beam extending from a short machined metal grip".** "Grip emitting a beam"
    produces either a metal dagger plus a stray light streak, or a flame-tipped cylinder
    with no blade. The word `sword` remains banned (rule 11).
17. **Formal or political dress defaults to present-day Earth** — business suits, shirts
    and neckties, ordinary casinos with standard playing cards. Every court, senate or
    officialdom card needs explicit alien-formal vocabulary: "high-collared court mantle",
    "floor-length court wrap with a tall stiff collar", "glowing translucent chit tiles".
18. **Regeneration is not monotonic.** Seed variance means re-rolling an image that already
    passed can make it worse (`sor-220` regressed between two runs of an identical prompt).
    Only regenerate cards that actually failed, and keep the previous version archived so a
    good render can be restored.
