# GitHub Pages plan — the full game, real names, public repo

Goal: `https://dragoonant.github.io/sundered-veil/` plays every registered deck (36 today:
16 precon halves + 20 tournament lists, 641 distinct cards) with the source material's card,
deck and trait names, with art, sound and the end-of-match clips, served straight from `main`.

This file is the plan to get there and the honest account of what each step exposes. It is
written to be executed top to bottom; each phase ends in a working site.

## Decisions (2026-09-05)

- **Art: the project's own AI art, committed.** Official card images are out of scope
  entirely, so Phase C below is reduced to finishing coverage; the art-pack loader and the
  scan discussion are dropped.
- **Printed rules text ships by default**, alongside the real names, under one toggle.
- **Sideboard cards get no art.** The game plays single duels and never sideboards, so
  `tools/check-pages.mjs` requires art only for leader, base and main-deck cards.

## Where things stand (2026-09-05)

| Fact | Consequence |
|---|---|
| No build step; every path in `index.html` is relative | Pages can serve the repo root as-is. No workflow, no bundler. |
| Repo is 110 files / 3.6 MB; `art/*`, `sfx/`, the two `.mp4`s are all gitignored | A Pages deploy from `main` today has one card back and no other art or sound. The assets exist only on the dev machine. |
| Real names + printed text are a single generated, gitignored file, `data/source-local.js`, loaded last by `index.html` and never by `tests.html` | Shipping real names is a one-file decision, and reverting is a one-commit decision. |
| `SB.artUrl(cardId)` in `index.html:138` is the only place a card image path is built | Any other art source (a local pack, a remote host) is a one-function swap. |
| `git log --all` contains no key file, no `scratch/`, no `source-local.js` | The history is safe to make public as it stands. |
| 21 deck card ids (sideboard skeletons) have no art prompt yet | Those cards will render as text-only until prompts are added. |

## The copyright and trademark question, plainly

You asked for a plan "given my hesitation". Here is the hesitation, ranked, so you can decide
per tier instead of all-or-nothing. The engine, decks-as-id-lists, and the AI are functional
and not the issue. Three kinds of third-party expression are:

1. **Card, deck, trait names (low risk).** Individual card titles are generally not
   copyrightable, and using a name to identify the card it identifies is the classic
   descriptive use of a trademark, provided the site does not present itself as official.
   Every community deck builder and simulator does this. Ship it, with the non-affiliation
   notice kept visible.
2. **Printed rules text verbatim (moderate risk).** Short and functional, so weakly protected,
   but it is the publisher's text, reproduced in full for hundreds of cards. The generated
   text already exists and is tested, so this is a convenience, not a requirement. Plan
   below ships it behind the same toggle as the names so it can be switched off in one
   commit if it is ever the thing complained about.
3. **Official card images (high risk, and the different kind of risk).** Scans of the cards
   are straightforwardly copyrighted artwork owned by Lucasfilm/Disney and licensed to FFG.
   "Other emulators do it" is true and is not a defence: they run at the rights holder's
   tolerance, which FFG has so far extended to the community, and tolerance is revocable
   without notice. What changes on GitHub Pages specifically is the *mechanism*: a DMCA
   notice to GitHub disables the repository (the whole site, not one file) until the content
   is removed, and repeated notices can affect the account. Self-hosted emulators do not have
   that single switch. The project's own AI art is original and carries none of this.

**What this plan builds:** the project's own AI-generated art in the repo, and real names
plus printed text as the default with a one-click toggle back to the original theme. Tier 3
is not in play at all (see Decisions).

## Phase A — publish what is already public-safe (site is live at the end)

Status: steps 1 (repo side), 2 (gitignore), 3, 5 landed on `claude/game-github-pages-plan-3a8qii`.
Left for you: the Pages setting, `git add art sfx` on the machine that holds the renders,
the visibility flip.

1. **Turn Pages on.** Settings → Pages → Build and deployment → Source: *Deploy from a
   branch* → `main`, `/ (root)`. Add an empty `.nojekyll` at the root so Pages serves files
   verbatim (no Jekyll pass, no surprises with future `_`-prefixed paths). First deploy
   takes a minute; later ones follow each push to `main` within ~1–10 minutes (Pages caches
   for 10 minutes; asset filenames are stable ids, so this is fine).
2. **Bring the generated assets into the repo.** Change `.gitignore` from "ignore `art/*`"
   to ignore only masters, PNG intermediates and logs, so `art/<id>.webp`, `art/fx/*.webp`,
   `art/arena-*.webp`, `art/victory.mp4`, `art/defeat.mp4` and `sfx/*.mp3` are tracked.
   Run `tools/shrink-video.mjs` first so the two clips are a few MB each. Then, on the
   machine with the renders: `node tools/check-pages.mjs` (lists missing and untracked),
   `git add art sfx`, commit, push. Commit the whole
   batch once, after QC, not per regeneration: every regenerated file stays in history
   forever, and this is where repo growth would come from.
   Budget: ~626 card WebPs at 512×704 ≈ 40–60 MB, plus arenas, sprites, audio and clips.
   Well inside Pages' 1 GB site limit and the 100 MB per-file hard limit.
3. **Add the asset gate.** `tools/check-pages.mjs`: every `art/` and `sfx/` file the
   scripts can ask for (deck cards excluding sideboards, card back, title, arena and slot
   scenes, sprites, clips, music), which are missing from disk and which are on disk but
   untracked; exit 1 on a required gap so it can guard a commit. The test runner has no
   filesystem, so the gate is a tool rather than a test.
4. **Pre-publication sweep, then flip the repo to public.** Commands worth running once
   before Settings → General → Danger Zone → Change visibility:
   ```
   git log --all --diff-filter=A --name-only --pretty=format: | sort -u | grep -Ei 'scratch|source-local|hf_token|elevenlabs|\.key$'
   git log --all -p | grep -c 'hf_[A-Za-z0-9]\{20,\}'
   ```
   Both come back empty today. Also check `package.json` `name` (currently
   `star-wars-unlimited`) and the `<title>`: name the site as an unofficial fan simulator,
   never as the game itself.
5. **README.** A short one: what it is, the live URL, the non-affiliation line from
   NOTICE.md, how to run tests. The repo has none.

End state: the game plays on Pages with the original *Sundered Veil* names and the AI art.

## Phase B — real names and printed text on the site

1. **Promote the override from gitignored to committed.** `tools/gen-source-names.mjs`
   writes `data/names-source.js` (new name; the "local" in the old one described a
   deployment rule that no longer holds). Remove `data/source-local.js` from `.gitignore`
   and from `index.html`; load `data/names-source.js` in its place. `tests.html` keeps NOT
   loading it, so the text-quality test still exercises the generated describers; add a
   test asserting exactly that (parse `tests.html`'s script list, fail if the file is in it).
2. **Generate and commit the file.** This runs on your machine, because its inputs
   (`scratch/unique-cards.json` or `scratch/dotgg-cards.json`, `scratch/trait-map.json`)
   exist only there:
   ```
   node tools/gen-source-names.mjs scratch
   node tools/run-tests.mjs --quiet
   git add data/names-source.js && git commit
   ```
   The generator already covers card names and subtitles, trait names, precon product
   names and tournament-list names, and printed text including leader faces. It fails
   loudly on stray escapes, glued aspect icons and untranslated markup, so a clean run is
   a shippable file.
3. **A names toggle, not a hard switch.** The override currently overwrites
   `SB.names.cards` in place. Change it to keep both tables and expose
   `SB.namesMode` (`'source'` | `'original'`), persisted in `localStorage['sb.names']`,
   defaulting to `'source'` when the source file is present. `SB.cardText` already
   prefers `SB.sourceText`; gate that on the same mode. Add the button to the HUD drawer
   beside the animation and mute toggles (`js/hud.js`), re-rendering on change. This is
   also the "one commit to revert" lever: flipping the default is one constant.
4. **Update the legal posture in the same commit** (CLAUDE.md hard rule). Rewrite
   `NOTICE.md` to say what is then true: mechanics functional; names, deck names and
   printed rules text are those of the published game, used to identify the cards they
   identify; artwork and audio original and AI-generated; not affiliated with or endorsed
   by FFG, Lucasfilm or Disney; non-commercial; takedown contact. Amend the CLAUDE.md
   rule "never write third-party card names anywhere except `scratch/`" to "only in
   `data/names-source.js`, only via the generator, never in card data, engine, tests or
   art prompts". Update HANDOFF.md's *Real names vs original names* section.
5. **Keep art prompts clean.** `tools/art-prompts.json` is committed and today describes
   subjects in original terms. Leave it that way; it is the reason the art is defensible.

End state: the site shows real card names, real deck names and printed text by default,
with the original theme one click away.

## Phase C — art coverage

Own AI art only, covered by Phase A. `check-pages.mjs` reports any main-deck card without
a render; generate and QC those with the contact-sheet flow in HANDOFF.md. Sideboard-only
cards stay text-only by decision.

## Phase D — hardening for a public site

- **Title screen line:** an "unofficial fan simulator; not affiliated with…" sentence
  from `names.js`, on the title screen and in the How to Play modal, so the notice is on
  the page a visitor sees, not only in a repo file.
- **Traffic:** Pages' soft bandwidth limit is 100 GB/month. Card WebPs are ~60 KB; a full
  game touches maybe 100 of them plus the two clips, so this is thousands of games a
  month before it matters. If it ever does, move `art/` and `sfx/` to a Release asset and
  point `SB.artUrl` at it.
- **Mobile pass** on the live URL: touch targets and the drawer, since Pages is the first
  time the game is reached from a phone.
- **A `.github/workflows/tests.yml`** that runs `node tools/run-tests.mjs --quiet` on
  every push to `main`, so a broken deploy is a red check, not a discovery.

## Order and effort

| Step | Where it runs | Rough size |
|---|---|---|
| A1, A3, A5, B1, B3, B4, D | this repo, by me | two sessions |
| A2 (asset commit), B2 (names file) | your machine, the assets and scratch inputs live there | an hour, mostly QC |
| A4 (visibility flip), Pages setting | GitHub settings, you | minutes |

Phase A first: the site exists and is public-safe before any real names land. Phase B is
one generated file plus a toggle.
