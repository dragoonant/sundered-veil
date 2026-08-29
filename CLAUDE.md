# CLAUDE.md

Read these before doing anything:

1. **CARD-GAME-LESSONS.md** — architecture, testing, AI, pipeline, and legal rules carried
   over from the previous project (MegaRobotWar). Every rule in it applies here.
2. **PLAN.md** — the phased build plan and scope for this project.
3. **NOTICE.md** — the legal posture. Update it in the same commit as any change affecting
   its claims.

## Hard rules

- No build step. Plain browser JS, IIFEs on the single `SB` namespace
  (`(function (SB) { ... })(window.SB = window.SB || {})`). `index.html` and `tests.html`
  load scripts in commented dependency order — a new data/engine file must be added to BOTH.
- Engine surface is exactly `SB.legalActions(state)`, `SB.apply(state, action)`,
  `SB.isTerminal(state)`. `apply` never mutates.
- All display text lives in `names.js`. Everywhere else uses stable internal ids.
- Card rules text is GENERATED from effect data, never stored.
- Never write third-party card names anywhere except the gitignored `scratch/` dir.
- API keys: `.hf_token`, `.elevenlabs_key` are gitignored; resolution order is
  flag → env var → key file.
- Run the headless tests (`node tools/run-tests.mjs --quiet`) before any commit.
