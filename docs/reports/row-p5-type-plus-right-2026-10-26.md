# The P5 type_plus_right set leg: the rule card stores, the port applies the rule, the leg's fixture put the member outside the rule's set

Branch `port/p5-type-plus-right-20261026` (lane checkout
`C:/localProjects/decko-ts-p5-20261026`, a linked worktree of
`C:/localProjects/decko-ts-release-lead` created by the lane-copy tool,
node_modules shared through a junction), from the newest pushed tip of
`deploy/full-candidate-20261103`, `5131d2ac40` (verified with `git ls-remote`
before the worktree was created: `5131d2ac40dacc64c45530941e82937caef86137`).
The anchor-regression receipt named this residual: a *type_plus_right set leg,
"the rule card stores, but the port does not apply a type_plus_right structure
rule to the member's render", failing identically at base and newest tip.

## 1. The reproduction, on the recorded shapes

The recorded shapes are the P5 leg of the caps-legs module
(`tools/edge-signed-in-exercise/checks-capability-legs.mjs`, check
`capabilityChecks.P5[1]`). Two runs at the base tip, on the local stack the
harness boots itself (loopback database and object storage, a local copy of the
deck on the engine schema, two throwaway local accounts, headless Chromium with
a throwaway profile; nothing reached any live system):

    node tools/edge-signed-in-exercise.mjs --only caps-legs --out .runtime/p5/base-caps-legs/report.md
    node tools/edge-signed-in-exercise.mjs --only caps-legs --keep --out .runtime/p5/base-caps-legs-keep/report.md

Both record the base commit `5131d2ac40` and the same bundle SHA-256
(`a5eb575222f7c9d5670061de4d0ee84899e89c140374df75e25437e93410ca45`). The
grades are **24 / 26** and **23 / 26**. The *type_plus_right leg fails in both,
with the member's page answering 200 but rendering without the rule's header
(`showsHeader: false`); the negative control also renders without it. The
second run's third failure is the P6 leg, which passes in the first base run
and in every run after this lane's change: an unstable instrument result at
the base tip, not a residual.

The second run was asked to keep its working copy (`--keep`), and its local
deck copy is the evidence the next section reads.

## 2. The mechanism, measured on the kept deck

The rule the leg creates is `RichText+<right>+*type_plus_right+*structure`
(the deck's default cardtype card is the one carrying codename `basic`; this
deck names it `RichText`). In the kept deck the rows are:

| id | row | what it is |
|---|---|---|
| 53084 | `Harness_Leg_tpright_mvpmemuc` | the right card |
| 53088 | left_id 3, right_id 53084 | `RichText+<right>`, type 3 (`RichText`) |
| 53089 | left_id 53088, right_id 262 | the set card; 262 is `*type plus right` |
| 53090 | left_id 53089, right_id 317 | the rule card; 317 is `*structure`, content "Harness type-plus-right header" |
| 53083 | `Harness_Leg_tpinset_mvpmemuc`, **type_id 22281** | the member's LEFT card |
| 53085 | left_id 53083, right_id 53084 | the member junction, type 3 |

Row 22281 is the deck's DEFAULT type card: named `BasicCs`, keyed `basic_c`,
itself of the Cardtype cardtype, and 2,414 live rows carry it. It is the type
Ruby and the port give a new card whose name has no type of its own.

Where Ruby applies the rule during a member's render: the set-pattern registry
resolves the member's *type plus right set from the LEFT card's type plus the
right tag (card-1.110.0 `mod/core/set_pattern/08_type_plus_right.rb:30-32`,
`anchor_name` = `"#{left_type(card)}+#{card.name.tag}"`, with `left_type` =
`card.superleft&.type_name || quick_type(left_name)` in `card/lib/card/set/
pattern/class_methods.rb:59-61`); the set's own membership says the same
(mod/rules `set/right/type_plus_right.rb:5-7`: `left: { type: "_LL" }, right:
"_LR"`); the rule lookup walks the card's set candidates in precedence order
and reads the first existing `<set>+*structure` card (`mod/content/set/all/
templating.rb:44-48`, `lib/card/content/all.rb:8-10`).

The port implements exactly that walk, and it answers: the depth-3 rule key
composes in the structure universe (`src/card/rules/structure.ts:110-146`,
the recursive composed-key CTE that exists so "depth-3 anchored sets ...
exactly the shape *type plus right rules take" compose 139/139), the candidate
walk emits `RichText+<right>+*type plus right+*structure` for a member whose
left card is of type RichText (`src/card/set-patterns/rule-names.ts:46-59` and
`src/card/set-patterns/registry.ts:180-189`), and the render applies the
winning rule's content (`src/card/render.ts:4094` applyStructureContent ->
`src/card/rules/structure.ts:318` resolveStructuredContent). An engine-level
seeding of the same shapes renders the rule's template for the member and
leaves the Phrase-typed control outside it (the lane's probe,
`.tools-tmp/p5-type-plus-right.test.ts`, 3 of 3 tests: the member's slot
carries `TYPE_PLUS_RIGHT-rich_text-<right>` and the template bytes, the
control's slot carries `TYPE_PLUS_RIGHT-phrase-<right>` and its own body).

So the port does not skip the rule. The member the leg visited was not IN the
rule's set: the fixture created only the compound cards
(`${inSet}+${right}` with type Basic, `${wrongType}+${right}` with type
Phrase), so the create route prepared the missing LEFT sides as new cards, as
Ruby does (`card/mod/core/set/all/name_events.rb:137-142`,
`prepare_new_side`), and those carry the deck's DEFAULT type. The member's
anchor was therefore `BasicCs+<right>` while the rule's set was
`RichText+<right>+*type plus right`. Two different sets: the rule could not
answer, and the negative control "passed" for the same reason. The member's
OWN type (Basic) never decided the set; the leg's own comment ("default-typed
left + right -> in the set") named the left card, and the fixture never
created it.

## 3. The fix

`047d75189`, `tools/edge-signed-in-exercise/checks-capability-legs.mjs` only:
the fixture creates the two left cards first, typed as the leg's own comment
says (the member's left of the rule's left type, through the deck's `basic`
codename card; the control's left of type Phrase), and the leg now reads the
cards' own set keys (`cardSlotSetKeys` from the module the cover-b legs use),
so the record separates "the rule did not answer" from "the card is not in
the rule's set": the PASS requires the member's own TYPE_PLUS_RIGHT token to
name the rule's left type and the control's token not to. The engine is not
touched; no port behavior changes.

## 4. Before and after, on the recorded shapes

The same module, same deck, same recipe; the only change between the runs is
the fixture commit.

| run | commit | grade | the *type_plus_right leg |
|---|---|---|---|
| `.runtime/p5/base-caps-legs/report.md` | 5131d2ac40 (base tip) | 24 / 26 | FAIL, member `showsHeader: false` |
| `.runtime/p5/base-caps-legs-keep/report.md` | 5131d2ac40 (base tip) | 23 / 26 | FAIL (plus the P6 flake named in section 1) |
| `.runtime/p5/after-caps-legs/report.md` | 047d75189 (this lane) | **25 / 26** | PASS, member `showsHeader: true`, its own token names `rich_text` |
| `.runtime/p5/whole-family/report.md` | 047d75189 (this lane) | **330 / 332** | PASS |

## 5. The proofs

1. **The P5 leg is green.** The caps-legs module at the fix commit reads
   25 / 26 with the *type_plus_right leg PASS (section 4).
2. **The rule's own suite is green.** At the fix commit,
   `npx vitest run tests/card/rules tests/card/set-patterns` answers
   9 files passed, 2 skipped, 188 tests passed, 2 skipped (the corpus-gated
   census probe and the raw-corpus legacy self-rule suite, which this checkout
   has no data for; both report themselves as not run). The lane's
   engine-level probe of the repaired shapes passes 3 of 3.
3. **The whole-family exercise holds with N9 and server-time the only named
   residuals.** `node tools/edge-signed-in-exercise.mjs --out
   .runtime/p5/whole-family/report.md` at the fix commit reads
   **330 / 332 passed**, 2 failed: the N9 applied-layout leg and the
   "no signed-in page exceeded 3 s of server time" budget leg. The P5 rows
   (the caps-legs legs and the cover-b legs) all PASS, and the family's P5
   capability row reads covered. Both residuals fail the same way at the base
   tip and are named with their mechanisms in the anchor-regression receipt
   (`docs/reports/row-full-signed-in-exercise-anchor-regression-2026-10-26.md`,
   its section 7); this lane did not touch them.
4. **The row's pin battery is green.** `node --test` over
   `tools/edge-signed-in-exercise/test/rule-set-legs.test.mjs`,
   `p5-fixture.test.mjs`, `p5-visited-card-and-own-slot.test.mjs`,
   `check-bindings.test.mjs` and `check-modules.test.mjs` answers
   36 tests, 0 failures (24 across the three P5 pin files, 12 across the two
   harness audits).

## 6. What this round does NOT claim

- No live deployment, no live request: every measurement is the local stack
  over a copy of the source deck.
- The N9 leg and the server-time budget leg stay red, unchanged from the base
  tip; their mechanisms are named in the anchor-regression receipt, and this
  lane neither confirmed nor changed them.
- The engine-level probe lives in `.tools-tmp/` (gitignored) and is reported
  here rather than committed; its shapes are recorded in section 2 so the
  next reader can rebuild it.
- A change to `tests/card/rules/structure-templates.test.ts` appeared in this
  lane's checkout after this lane's runs were measured (the file's mtime is
  later than the whole-family run's start, and the run's own provenance
  records its source files clean). It is not this lane's work: a concurrent
  writer in this shared lane wrote it and then committed it as `bf721c2ed`
  ("The rule suite pins the *type_plus_right structure rule: the anchor is
  the left card's type"). It adds one engine-level test of the same shapes
  this receipt proves; that test passes (the suite reads 189 passed with it,
  188 without it), so nothing here depends on it, and this lane committed
  neither it nor anything of the concurrent writer's.
