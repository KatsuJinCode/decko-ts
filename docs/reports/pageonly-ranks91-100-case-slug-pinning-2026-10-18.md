# Page-only witnessed actions, ranks 91-100 — batch report

Lane: `probe-pageonly-ranks91-100.mjs`, the 91-100 window of the canonical
witnessed-only list. Receipts: `.runtime/exhaustive/probe-pageonly-ranks91-100/`.

## The id list, verbatim

Ranks 91-100 (10 ids) of the 2026-10-18 re-grade's 101 page-only ids in id
order — `tmp/pageonly-101-ids.json`, positions 91..100:

```
ACT-178, ACT-179, ACT-180, ACT-181, ACT-184, ACT-185, ACT-186, ACT-187, ACT-188, ACT-189
```

Boundary: these ten ids and no others. Sibling windows are disjoint and are
recorded here as a dedup claim, not a re-claim — ranks 1-10 `bc81fbb5`, 11-20
`5bdda29f`, 21-30 `cacce253`, 31-40 `93771deb`, 41-50 `7deabd7e`, 51-60
`d69c2369`, 61-70 `47915f69`.

All ten ids were **exercised**. None was skipped. (The canonical list lives on
the coordination tree at `C:/localProjects/brandonDojoTech/tmp/pageonly-101-ids.json`,
not in this repo — the ask's path was off by one repo. The same set is
`.runtime/exhaustive/2026-10-18-regrade/actions/*.json` graded `page-only` in
this repo; both were read and compared, and they agree.)

## Engine provenance — a disposable pure-tip worktree

The shared checkout carries other lanes' uncommitted writes, so the engine was
built and booted from a **disposable clean detached worktree of the tip**, and
removed after the receipts were preserved.

- worktree: `C:/localProjects/decko-pageonly-ranks91-100-tip`, detached at
  `d69c2369ba8efdd29e2d58e933e8ab613e117755`
- build: `node tools/dist/build-engine.mjs --browser-hosts` — "Engine
  distribution built; static snapshot and compiler imports verified."
- `sourceCommit`: `d69c2369ba8efdd29e2d58e933e8ab613e117755`
- `sourceDiffSha256`: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
  (sha256 of the empty string — the clean-tree value)
- `distSha256`: `e35ad4a29cf4bc2166e22d1a23a7d83403e6f95d91b1bf941c583ba5a024480b`,
  **recomputed by the probe** from the engine worktree's `dist` tree and
  asserted equal to the build record's own value (`engineDistSha256MatchesBuildRecord: true`)
- `engineIsPureTip: true` in both receipts — the worktree's own
  `git status --porcelain` was empty at run time
- fixture: `reference-harness/fixtures/synthetic-v1`,
  `fixtureSha256 066062bd09c25629d43691461a23bf37…`

Every receipt records `sourceDiffSha256` **and** `distSha256` under
`source.engineBuild`, plus the recomputed `source.engineDistSha256Recomputed`
and the clean-tree check. The engine build record is copied out of the worktree
to `engine-build-pure-tip-d69c2369.json` beside the receipts so the provenance
survives the worktree's removal.

A fresh worktree lacks the mods' public dir — a gitignored Ruby-setup artifact,
not engine code — and `ts-server.mjs:76` refuses to boot without it. The probe
builds the same wrapper manifest `probe-pageonly-batch6` builds, pointing
`DECKO_MOD_PUBLIC_DIR` at this repo's copy while the engine's own `dist` stays
the target checkout's build.

## Result: 21 of 22 legs GREEN, twice consecutively; ONE GENUINE RED

The batch proof bar is **all legs green twice consecutively**. That bar is
**not met**: 21 of 22 legs are green in both consecutive runs, and one leg —
pinned deliberately — is RED in both, with a measured cause. The RED is a real
product defect, not an instrument artifact; it is reported as `unfixed` rather
than weakened to reach a green bar.

| run | legs | green | red | exit |
|---|---|---|---|---|
| run1 | 22 | 21 | 1 (ACT-185) | 1 |
| run2 | 22 | 21 | 1 (ACT-185) | 1 |

### Fixed — 21 legs GREEN in both runs

| id | legs | evidence |
|---|---|---|
| ACT-178 | 2 | `run1/probe-ranks91-100-result.json` |
| ACT-179 | 1 | same |
| ACT-180 | 2 | same |
| ACT-181 | 2 | same |
| ACT-184 | 3 | same |
| ACT-185 | 2 of 3 | same |
| ACT-186 | 2 | same |
| ACT-187 | 3 | same |
| ACT-188 | 1 | same |
| ACT-189 | 3 | same |

### Retracted 2026-10-19 — the RED leg was a mis-specified instrument, not a defect

**ACT-185, "the all-caps spelling of a name ending digit+C resolves to that
same card."** RED in run1 and run2. **That leg was wrong and has been
re-graded.** The engine is oracle-faithful; the expectation it asserted was
never a property of Ruby Decko. Everything this section originally claimed as
a cause is corrected below.

The observed behaviour, which stands: for a card named
`Harness Plurality Digit 9c <stamp>`, the canonical address
`/Harness_Plurality_Digit_9c_<stamp>` serves the card (`data-card-id 916`,
200). The all-caps address `/HARNESS_PLURALITY_DIGIT_9C_<STAMP>` also answers
**200** — but `data-card-id` is **null** and `data-card-name` echoes the
shouted spelling. That page is the **create form** served at the unknown card's
address (`servedCreateFormInstead: true`).

The original section attributed this to a spurious `_` injected by the
`NOT_OK_FOR_KEY` fold in `simpleKeyUncached` (`src/card/name.ts:128-135`), and
cited the `cards.key` column's missing `COLLATE NOCASE` as the reason the
by-key lookup missed. **Both attributions were wrong.** Measured against the
pinned gemset (cardname-0.20.0 + activesupport-7.2.4, via card-1.110.0's
`Card::Name`), and confirmed by a 678-name cross-check that found zero `key`,
`underscore`, `url_key`, `safe_key`, `decoded`, `stripped` and `partNames`
differences between Ruby and the port:

1. **Ruby produces the same keys.** `Card::Name.new("MVEMONUT31C").key ==
   "mvemonut31_c"` and `Card::Name.new("mvemonut31c").key == "mvemonut31c"` —
   byte-for-byte what `DeckoName` produces. In Ruby those are **two different
   names**, so the engine's by-key lookup misses for exactly the reason Ruby's
   does.
2. **The separator comes from `underscore`, not the fold.** `Cardname#key`
   (`cardname-0.20.0 lib/cardname.rb:106` `#simple_key`) runs
   ActiveSupport's `underscore` first, and that inserts `_` between a lowercase
   letter or digit and a following capital
   (`activesupport-7.2.4 lib/active_support/inflector/methods.rb:100`,
   `word.gsub!(/([a-z\d])([A-Z])/,'\1_\2')`) before downcasing. The port of that
   step is `src/card/name/inflect.ts:271-278`. The `NOT_OK_FOR_KEY` fold at
   `src/card/name.ts:128` cannot be the source: on the word `underscore`
   already returned, that fold is inert for any input built only from characters
   it allows — `_` is `\p{Pc}` and is inside its own allowed class.
3. **`COLLATE NOCASE` was never the operative difference.** The two keys differ
   by an *underscore*, not by case, so a case-insensitive column would not have
   matched them either.
4. **The page is the faithful answer.** Ruby Decko renders `:new` at status 200
   for an unknown card whose actor may create
   (`card-mod-format-0.20.0 set/all/html/error.rb:81-86`), so the engine's
   unknown-card branch (`src/card/render/page.ts:309-351`) answers as Ruby does.

The original section also said the trigger was "uppercase AND a final digit+C".
**That is too narrow.** The rule is any digit before **any** capital:

| input | `.key` (Ruby and the port agree) | |
|---|---|---|
| `AB1C` | `ab1_c` | DIFFERS from `ab1c` |
| `AB99C` | `ab99_c` | DIFFERS from `ab99c` |
| `MVEMONUT31C` | `mvemonut31_c` | DIFFERS from `mvemonut31c` |
| `CARD 3X` | `card_3_x` | DIFFERS from `card_3x` — digit + a letter that is not `C` |
| `CARD 2ND` | `card_2_nd` | DIFFERS from `card_2nd` |
| `CARD 1ST` | `card_1_st` | DIFFERS from `card_1st` |
| `ABC` | `abc` | same |
| `CARDC` | `cardc` | same |
| `STATUSC` | `statusc` | same |
| `mvemonut31c` | `mvemonut31c` | same (lowercase is fine) |
| `HOME` | `home` | same (case folding works) |
| `FOCUS` | `focu` | same (`focus`→`focu` is correct singularization) |

Case-insensitivity is not broken. ACT-184's own case-insensitivity legs
(lowercase name, percent-encoded slug, lower/upper keyword search) are GREEN,
and ACT-185's other variants — underscore slug, lowercase slug, percent-encoded
spaces, uppercase slug of a name ending in a plain word — all pin to one card
id, because those names have no digit-before-capital adjacency.

The probe leg now asserts the oracle's answer: the engine's keys equal the
measured Ruby keys across the trigger table, the canonical and shouted keys
**differ**, the shouted address answers 200 with the create form and no card id,
and exactly one live row exists for the canonical name. A case-insensitive or
underscore-stripping fetch fallback for shouted addresses would be a deliberate
divergence from Ruby, not a fix. The measured values are pinned as unit tests in
`tests/card/name/ruby-oracle-key-algebra-parity.test.ts`.

## Selectors were pinned from bytes, not memory

Three discovery passes against this engine preceded the graded runs, because two
of the claims needed instruments that could not be assumed:

- the `not_found` error view renders `.card-slot.not_found-view`, an h1 "Not
  Found", "Could not find <em>name</em>", and the signin/signup line **only**
  when signed out (`src/card/render/format.ts:1584-1591` gates that line on
  `signedIn !== true`);
- a **signed-in actor with create rights** is answered the `:new` page at an
  unknown address with status 200. That is the oracle-pinned
  `page_view_for_unknown` branch (`src/card/render/page.ts:309-351`), **not** an
  error-page defect — `unknownCardCreatable` is `card.ok?(:create)`
  (`src/card/render/views.ts:5787-5792`), and both fixture actors hold create
  rights. ACT-178 is therefore graded on the branches that really are error
  pages (anonymous, and the `.json` error answer), and the signed-in
  create-form is recorded as a **witness** in `report.witnesses` with its
  source citation, not reported as a RED. Had this been graded naively it would
  have been a false positive;
- the `/*recent` act rows are `#main .card-slot .card-slot` inside
  `ul.action-list > li.create`, each carrying its act's identity as
  `action_id` inside its `data-slot` JSON. That is the dedup instrument for
  ACT-187. The feed's own `*recent` titled-view slot is excluded by
  `data-card-name`.

## Two probe defects found and corrected mid-lane (both recorded)

1. **ACT-181 feed reader read the wrong nodes.** The card-name sequence was
   collected by looking for a **descendant** `[data-card-name]`, but the act
   slot carries the attribute **on itself** (discovery pass 3). Run 1 read zero
   rows off a perfectly good feed and REDed with `indexA: -1, indexB: -1`.
   Corrected to read the attribute off the act slot; ACT-181 is GREEN in both
   final runs.
2. **Navbox-search legs were racing the render.** They read the result list after
   a fixed 800 ms sleep. In one run they returned `rows: []` on a correctly
   navigated `/*search` page whose URL carried the right query — the list had
   not rendered yet — while the same legs were green in the run before. The
   reader now **waits for `#main .search-result-list`** (bounded) and records
   `listAppeared`/`waitedMs`, so a zero-row result is a measurement, not a race.
   The same wait hardened ACT-189's empty-search leg — where the wait revealed
   that a **zero-match search renders no result-list container at all**
   (`resultListRendered: false`). That is the empty surface's own correct shape,
   so requiring the container there would have failed correct behaviour; it is
   recorded as evidence, not asserted.

The digit+C leg was itself reshaped by run 1: it first REDed because the card
name carried a random stamp suffix that happened to end in digit+C, making the
leg nondeterministic. The plurality leg now uses a fixed name
(`Harness Plurality Caseprobe 91`), and the digit+C case is pinned deliberately
in its own leg. (Pinning it made the leg's expectation checkable — and checking
it against the Ruby oracle is what showed the expectation, not the engine, was
wrong. See the retraction above.)

## Files

- `reference-harness/browser/probe-pageonly-ranks91-100.mjs` — the probe
- `.runtime/exhaustive/probe-pageonly-ranks91-100/run1/probe-ranks91-100-result.json`
- `.runtime/exhaustive/probe-pageonly-ranks91-100/run2/probe-ranks91-100-result.json`
- `.runtime/exhaustive/probe-pageonly-ranks91-100/engine-build-pure-tip-d69c2369.json`
- `.runtime/exhaustive/probe-pageonly-ranks91-100/pageonly-ranks91-100-batch-report.md`
- `.runtime/exhaustive/probe-pageonly-ranks91-100/discovery-dom3.mjs` — the
  discovery pass whose findings the ACT-178/ACT-187 instruments rest on,
  preserved because the worktree it ran in was removed