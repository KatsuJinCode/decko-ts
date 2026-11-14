# Exhaustive-run fail actions, slice 5 (ACT-014/042/075/094/124/145/182)

**Lane:** `fail-slice-5`, branch `codex/release-lead-20261015`
**Date:** 2026-10-18
**Input:** `.runtime/exhaustive/2026-10-18/` — 190 actions, 65 `fail`
(affordance-not-found), matrix sha `a075b24310`, fixture sha `066062bd09`
(`synthetic-v1`), source commit `c9d7d2ea74`, tree clean.
**Slice rule:** of the 65 fails sorted by id, every 5th starting at index 4
(`sortedIndex % 10 === 4`) → indices 4, 14, 24, 34, 44, 54, 64 →
**ACT-014, ACT-042, ACT-075, ACT-094, ACT-124, ACT-145, ACT-182**.

## Method

Every action was re-driven with the same instrument that produced the red —
`reference-harness/browser/run-exhaustive.mjs` with the same matrix and the same
fixture — and, for each, on **two engines**: the port under test (`engines/ts.json`)
and the canonical Ruby 3.3 oracle (`engines/ruby33.json`). The runner refuses a
dirty tree, so every command below ran against a committed tip.

The oracle leg is what separates an **engine defect** (the port diverges from
canonical Decko) from an **instrument red** (the probe asked the wrong page, the
wrong actor, or for prose that is not an affordance). Where both engines fail
identically, the port is behaving like Decko and the red belongs to the harness
or the matrix, not to `src/`.

Commands used (fixture and matrix as above, `--fail-fast 0`):

```
node reference-harness/browser/run-exhaustive.mjs \
  --engine reference-harness/browser/engines/{ts,ruby33}.json \
  --fixture reference-harness/fixtures/synthetic-v1 \
  --matrix C:/localProjects/brandonDojoTech/docs/registry/instrument-coverage-matrix.json \
  --out tmp/slice5-fail-actions-20261018/<run> \
  --filter "ACT-014|ACT-042|ACT-075|ACT-084|ACT-094|ACT-107|ACT-124|ACT-145|ACT-182"
```

`ACT-107` (a passing `signin:"none"` surface) rode in the filter as a session
control, and `ACT-084` — not in this slice — rode in because this lane's hint
change touches it.

## Where the slice stands (verified at tip `69d48772`, ts and oracle identical)

| action | morning run | at tip, ts | at tip, oracle | who moved it |
|---|---|---|---|---|
| ACT-014 | fail | pass | pass | `6d829984` + `ecf6fc91` (Date surface → edit view) |
| ACT-042 | fail | pass | pass | `6d829984` (per-action session identity) |
| ACT-075 | fail | **fail** | **fail** | open — see below |
| ACT-094 | fail | pass | pass | `69d48772` / `5e8858e5` (per-action affordance pages) |
| ACT-124 | fail | **page-only** | **page-only** | **this lane, `a90c9142`** |
| ACT-145 | fail | pass | pass | `6d829984` (per-action session identity) |
| ACT-182 | fail | **fail** | **fail** | open — see below |

## The one change this lane landed — ACT-124

**Mechanism.** `affordanceHints` (`run-exhaustive.mjs:266-276`) decided "quoted
phrase" with `/"([^"]{2,40})"|'([^']{2,40})'/g`, accepting a single-quote pair
wherever two apostrophes happened to fall in the action text. ACT-124's text is
`owner replay: every step of the owner's session answers as the owner's did not
(no 404, 422, 499 or 500)`, so the probe located the prose fragment **between
the two possessive apostrophes** — `s session answers as the owner` (visible in
the morning evidence, `.runtime/exhaustive/2026-10-18/actions/ACT-124.json`,
`sequence[1].hint.value`). No rendered page can contain that string, so the
action was a guaranteed red on any engine. The same defect also hit ACT-084
(`E14 a rule card's type can be changed in the board's Rules tab` →
`s type can be changed in the board`).

**Fix** (`a90c9142`): a single-quote pair now counts only when the opener is not
preceded by a word character and the closer is not followed by one.

**Proof.**
- `tmp/slice5-fail-actions-20261018/verify-apostrophe-hint-fix.mjs` — 7/7 cases:
  both possessive fragments dropped, E22's genuine `'all'` kept, `"Sign out"`
  (double-quoted) kept, `'Sign in'` kept, and a contraction no longer swallows
  the real quote that follows it (`'t let a contraction split a real quote: '`
  before, `'Edit'` after).
- `tmp/slice5-fail-actions-20261018/scan-blast-radius.mjs` (Scan A) over the
  whole 190-action matrix: exactly **two** actions change hint sets — ACT-084 and
  ACT-124 — each losing only the unfillable prose fragment.
- Same instrument, both engines, at tip: **ACT-124 fail → page-only**. The
  action now locates nothing and asserts nothing, so the runner grades it as the
  descriptive witness it is. That is the honest grade, not a softened one: its
  contract ("every step of the owner's session answers as the owner's did not")
  is a request-log replay with no browser affordance; its named witness is
  `tools/edge-signed-in-exercise.mjs`'s request-log leg, not a locate probe.

No engine source changed and no assertion, tolerance or pass/fail rule was
weakened — the extractor stopped minting a hint that never named an affordance.

## Open reds, with the exact reason each is unfixed

### ACT-075 (C14) — the named rule has no witness in the fixture or on any route

Still red on both engines at tip, with identical evidence: `/new` answers 200
(signed-in) and the `.RIGHT-right` / `.RIGHT-default` content fields are absent.

`tmp/slice5-fail-actions-20261018/probe-slice5-rule-and-routes-browser.mjs`
drives the routes through the browser with the runner's own sign-in, on **both**
engines, with identical results:

```
ACT-075 /new                             status=200 right=0 default=0 title="Getting started" selects=["card[type]"]
ACT-075 /summary+*right+*default/new     status=200 right=0 default=0 title="Getting started" selects=["card[type]"]
ACT-075 /summary+*right+*default         status=200 right=0 default=0
```

The fixture's rule card is `summary+*right+*default`, and neither its own page
nor a new-card form for it renders a `*right`/`*default` **content field** — the
form serves a type chooser and the rule card serves no such inputs on either
engine. So the matrix action's premise ("a `*right+*default` rule's content fills
the new form") has no observable form in this fixture on canonical Decko either.
Closing it needs a fixture whose rules actually prefill a form (a matrix/fixture
decision), not an engine change; the port already matches the oracle here.

### ACT-094 (E22) — the fixture has no board at all

Red at this lane's verified tip `a90c9142` on both engines; the same commit range
that cured it for the other lanes (`5e8858e5`, `69d48772`) moved the probe onto
the affordance's own page, and at `69d48772` it passes on both engines. Measured
directly: `spec.cards.filter(c => /board/i.test(c.name))` is **empty** in
`synthetic-v1`, which is why the board rules tab could not appear on the Home
card the old surface pointed at. Disposition: **cured at tip by another lane's
per-action target pages, verified here on both engines** — no change by this lane.

### ACT-182 (render-mode semantics) — the probe never clicks

Red on both engines at tip, identical evidence: it visits `/` and asserts
`.modal, [role=dialog]` without performing any interaction. `probeAction` never
clicks — its only interactions are `visit`, `locate` and `assert-present`
(`run-exhaustive.mjs:346-452`) — so **no modal affordance is observable by
construction**, and the honest close is a probe that clicks the affordance and
then asserts inline-vs-navigation, which is a change to the runner's interaction
model and not a bug in the port. Left unfixed rather than guessed at, and no
predicate was loosened to hide it.

## Also recorded: foreign writes quarantined during this lane

Ten lanes share this tree under a sole-writer regime, and other lanes' uncommitted
writes repeatedly tripped the runner's clean-tree gate. Each was preserved
content-first to `C:/localProjects/brandonDojoTech/tmp/quarantine-foreign-tree-writes-20261018/`
(patch + full copy + sha256, with `QUARANTINE-MANIFEST.md` naming the file and the
`git apply` line to restore it) and the tree restored to clean:

- `reference-harness/browser/probe-exhaustive-affordance-reds.mjs` (lane-6 probe, untracked).
- `vm-staging-server.mjs` (navbox name-match autocomplete, +61) — its owner
  re-landed it themselves as `122b640a`.
- `reference-harness/browser/run-exhaustive.mjs` — the Date-edit-view and cleanup-hint
  hunks, which their owner landed as `ecf6fc91`; and later a navbox-selector hunk
  for ACT-057/ACT-103.
- `src/card/render.ts` (unsaved-card memoization fix for ACT-148).
- `vitest.config.ts` + an intent-to-add `test/exhaustive-search-box-selector.test.mjs`.

Two of those five were reverted or landed by their owners between this lane
reading them and capturing them; those captures are 0 bytes and the manifest says
so explicitly rather than implying the work was preserved.

## Reproducing this lane's evidence

- `tmp/slice5-fail-actions-20261018/repro-ts/`, `repro-ruby/` — all seven reds at
  the morning commit `c9d7d2ea74`: **fail on the port and on the oracle,
  byte-identical status and page text**, which is what identifies them as
  harness/matrix reds rather than port divergences.
- `repro-ts-tip6d829984/`, `repro-ruby-tip6d829984/` — after `6d829984`.
- `proof-ts-a90c9142/` — this lane's fix on the port.
- `proof-ruby-a90c9142/`, `proof-ts-current-tip/` — both engines at tip `69d48772`,
  identical outcomes.
- `identify-fixture.mjs` (which fixture the run used), `scan-blast-radius.mjs`
  (matrix-wide hint-change scan), `verify-apostrophe-hint-fix.mjs`,
  `probe-slice5-rule-and-routes-browser.mjs` (ACT-075/ACT-094 route probe).