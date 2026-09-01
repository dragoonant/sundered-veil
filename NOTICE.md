# NOTICE

This is a personal, non-commercial fan project implementing the *game mechanics* of a
trading card game. Game mechanics and rules are functional systems and are not subject to
copyright.

All **expression** in this project is original:

- Every card, leader, base, faction, and setting name is an original invention, stored
  solely in `names.js`.
- All card rules text is **generated at runtime from mechanical effect data**; no published
  card wording is stored or reproduced anywhere in this repository.
- All artwork is original, AI-generated in an original style from prompts written for this
  project. No third-party artwork is included or imitated.
- All audio is original, AI-generated for this project.
- Import tooling reads only mechanical fields (numeric stats, cost, type, keyword behavior,
  deck composition) from community databases; any intermediate files that could carry
  third-party names are written to a gitignored scratch directory and never committed.

This project is not affiliated with, endorsed by, or connected to Fantasy Flight Games,
Lucasfilm Ltd., or The Walt Disney Company.

A local, gitignored override layer (`data/source-local.js`, built by
`tools/gen-source-names.mjs` from a scratch database dump) may substitute source-material
display names and printed rules text on a developer machine, so implemented mechanics can
be checked against the cards they were derived from. That file is never committed and is
absent from any published build, which falls back to the original names above.

Maintenance rule: any behavior change that affects the claims above must update this file
in the same commit.
