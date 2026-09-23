# Set-keys parity: slot class attribute + prefetch codename

Stream: set-keys-parity (render slot-class set-key derivation).
Scope of the fix: `src/card/render/**` only. The corpus before/after numbers
below are shard-000000 (`fixtures/corpus/shard-000000.jsonl`, replayed by
`benchmarks/corpus-v2/replay-shard.test.ts`, results in
`benchmarks/results/corpus-v2/replay-full-results.json`).

## 1. The render real-fail class: anchored STAR/RSTAR + missing RULE

### Symptom (before)

516 render real-fails on shard 0; the sampled first-diffs were all the slot
wrapper's class attribute, e.g. corpus:53 (`*tiny_mce`):

- Ruby expected: `class="card-slot closed-view ALL TYPE-jlkv STAR SELF-Xtiny_mce"`
- TS actual: `class="card-slot closed-view ALL TYPE-jlkv STAR-Xtiny_mce SELF-Xtiny_mce"`

Same class for RSTAR (Ruby bare `RSTAR`, TS `RSTAR-<anchor>`) and RULE
(Ruby bare `RULE`; TS omitted the key entirely).

### Ruby mechanism (the truth, file + line)

- `lib/card/set/pattern/all.rb:40-42` — `safe_set_keys`:
  `patterns.map(&:safe_key).reverse * " "`.
- `lib/card/set/pattern/base.rb:70-73` — `safe_key`:
  `caps_part = pattern_code.to_s.tr(" ", "_").upcase;
   anchorless? ? caps_part : "#{caps_part}-#{@anchor_name.safe_key}"`.
- `lib/card/set/pattern/class_methods.rb:16` — `register`:
  `self.anchorless = !respond_to?(:anchor_name)`. A pattern is anchorless
  exactly when its `mod/core/set_pattern/NN_*.rb` file defines no
  `anchor_name` method.
- `mod/core/set_pattern/04_star.rb`, `05_rstar.rb`, `06_rule.rb` define only
  `label`/`short_label`/`prototype_args`/`pattern_applies?` — no
  `anchor_name` — so STAR, RSTAR and RULE are ANCHORLESS: their class
  fragments are the bare caps codes. The anchored patterns (03 type,
  07 right, 08 type plus right, 09 self) define `anchor_name` and emit
  `CODE-<anchor safe key>`.
- Applies predicates: `04_star.rb` `card.name.star?`
  (`lib/card/name.rb:115`, simple name starting with `*`);
  `05_rstar.rb` `card.name.rstar?` + compound_only (`name.rb:119`, compound
  with `*`-headed right part); `06_rule.rb` `card.rule?`
  (`lib/card/rule/all.rb:33` — `standard_rule? || preference?`:
  `standard_rule?` = the right part's fetched type is Setting AND the left
  part's fetched type is Set; `preference?` = the >2-part shape).
- Oracle cross-check already in-tree: `src/card/set-patterns/instance.ts`
  records the captured `safe_set_keys` of `*all+*read`:
  `ALL ALL_PLUS TYPE-list RSTAR RULE RIGHT-Xread TYPE_PLUS_RIGHT-set-Xread
  SELF-Xall-Xread`.

### TS bug

`src/card/render/set-keys.ts` carried a hand-rolled copy of the pattern
table that (a) made STAR/RSTAR anchored (`STAR-<name key>`), and (b)
omitted the RULE pattern entirely (its old header called `card.rule?` a
"rules-wave predicate" and dropped the key). The oracle-verified registry
port (`src/card/set-patterns/**`, landed by the set-patterns stream)
already encodes the correct table — anchorless flags, RULE with an
`isRule` input, and the 08-type-plus-right `RichText` quick_type fallback —
but the render path was not using it.

### Fix (in `src/card/render/set-keys.ts`)

`safeSetKeys` now delegates to the registry's `safeSetKeysForCard`
(`src/card/set-patterns/card-patterns.ts`), passing the render-side inputs;
the duplicated table is deleted. `SetKeysInput` gains an optional
`isRule?: boolean` (the `06_rule.rb` predicate, see the gap below) and the
left-type-unknown case now follows Ruby's quick_type default
(`TYPE_PLUS_RIGHT-rich_text-<tag>`) instead of dropping the key.

### Remaining gap: the RULE key needs `isRule` from the enrichment call site

`card.rule?` resolves the TYPES of the card's left/right parts through
storage (`lib/card/rule/all.rb:33-45`). The render-side derivation is
synchronous and receives only `{name, typeId, typeName, leftTypeName}` —
the enrichment lives at `src/card/render.ts` `enrichAndStore` (line ~252),
which is OUTSIDE this stream's directories (`src/card/render/**`), so the
supplier was not changed here. Until it is, rule cards render without the
bare RULE key and those views stay real-fails.

The minimal patch (for whoever owns `src/card/render.ts`) — in
`enrichAndStore`, after `leftTypeName` is computed:

```ts
// Card#rule? (lib/card/rule/all.rb:33): standard_rule? = right part's
// type is Setting AND left part's type is Set (preference? = the >2-part
// shape). IDs resolve through the codename registry (cards.codename).
let isRule: boolean | undefined;
if (name.isCompound) {
  const [settingId, setId] = await Promise.all([
    this.fetcher.codenames.id("setting"),
    this.fetcher.codenames.id("set"),
  ]);
  const rightId = record.rightId;
  const leftIdOf = record.leftId;
  const rightType =
    rightId === undefined ? undefined :
      (await this.fetcher.fetchById(rightId))?.typeId;
  // preference? (rule/all.rb:41-45) additionally needs the third-level
  // trunk's type; corpus rule cards are the standard two-part shape.
  isRule =
    settingId !== undefined &&
    ((rightType === settingId &&
      leftIdOf !== undefined &&
      (await this.fetcher.fetchById(leftIdOf))?.typeId === setId) ||
     (name.parts.length > 2 && rightType === settingId));
}
```

then add `isRule` to the `safeSetKeys({...})` call. (Exact shape is for the
owning stream to review; the semantics that must hold: bare RULE appears
iff Ruby's `rule?` fires. The two part-type fetches are cache-first and, on
a warm closure, cost zero queries; on a cold render they ride the existing
fetch ladder.)

Note: the left type is ALREADY fetched by `enrichAndStore` (it computes
`leftTypeName`), so a leaner patch reuses that record's `typeId` instead of
re-fetching; only the right part's type is genuinely new work.

## 2. The record real-fail: corpus:274 codename null

### Symptom (before)

Single card-engine real-fail on shard 0. Expected record for `*all`
(id 274): `"codename":"all"`; TS replayed `"codename":null`. Every other
field byte-identical (116 vs 115 bytes = exactly the `all`/`null` delta).

### Mechanism

`src/card/render/prefetch.ts` composed every card reached by the inclusion
closure into records that were written into the FETCH cache
(`PrefetchContext.cacheRecord` → `FetchEngine#writeToCache`). Its internal
`RawRow` shape had no `codename` field, and `rowToCardsRow` hardcoded
`codename: null` before `composeCardRecord` (which faithfully passes
`row.codename ?? undefined` through). So ANY card the prefetch touched was
cached codename-less, and a later `fetchByName` (the replay's card-engine
handler) served the poisoned record. Concrete trigger in shard 0: line 28
is the junction `*all+*default`, whose LEFT side is id 274; rendering it
(line order precedes 274) pulls id 274 through the prefetch's side-card
expansion (`SELECT_TYPE_AND_SIDE`'s `reached` CTE) and caches it without
the codename; `corpus:274:record` then fetches the poisoned record. The
isolated fetch path was never wrong — `retrieve.ts` SELECTs `*` and
`seedCard` writes the column — which is why the failure only appeared in
the corpus replay (render before fetch) and not in direct fetch tests.

### Fix (in `src/card/render/prefetch.ts`)

`codename` is threaded through `RawRow` / `toRawRow` /
`recordToRawRow` / `rowToCardsRow` so cached records keep the column.
Regression tests: `tests/card/render/prefetch-cache-codename-parity.test.ts`
(fetch-only control + render-then-fetch poisoning order).

## 3. Tests

- `tests/card/render/render-engine.test.ts` — set-key shapes: bare STAR,
  bare RSTAR, RULE insertion order (between RSTAR and RIGHT), RULE-absent
  while `isRule` is unsupplied (pins the documented gap), RichText
  TYPE_PLUS_RIGHT fallback; plus an end-to-end slot-class test rendering a
  synthetic star card (`*tiny_mce` closed view →
  `class="card-slot closed-view ALL TYPE-exi STAR SELF-Xtiny_mce"`, no
  `STAR-X` fragment). All fixtures are synthetic (no SourceDeck content).
- `tests/card/render/prefetch-cache-codename-parity.test.ts` — codename
  survives the render-then-fetch order (corpus:274 mechanism).

## 4. Before/after (shard-000000 replay)

Before (2026-09-21 pre-fix):

- renders: total 2426 — pass 1650, structurePending 148, nestGap 112,
  permissionPending 816, realFail 516
- records: total 999 — pass 728, structurePending 270, permissionPending 0,
  realFail 1

After (this stream's fixes):

- renders: total 2426 — pass 1698, structurePending 106, nestGap 112,
  permissionPending 816, realFail 510
- records: total 999 — pass 734, structurePending 265, permissionPending 0,
  realFail 0  ← corpus:274 closed

Attribution of the deltas (numbers reconcile exactly):

- records: 6 improvements — corpus:274 out of realFail, plus 5 records that
  had been failing only on the poisoned codename and were sitting in the
  structurePending classification (its membership is computed from
  card-engine failures); they now pass outright.
- renders: 48 improvements — 6 entries whose only divergence was the
  set-key class string (the anchored-STAR/RSTAR fix), plus 42 render
  entries of cards whose record was codename-poisoned; with the record
  fixed they left the structurePending class and pass on judgment.

## 5. Honest remainder (the 510 render real-fails, classified)

From the post-fix failure samples (the results file stores 25; classes
extrapolate to the 510):

- ~60 entries: the bare RULE key is still missing — rule cards render
  `... RSTAR RIGHT-...` where Ruby renders `... RSTAR RULE RIGHT-...`
  (first diff `expected "U" but got "I"`). This is section 1's gap: the
  derivation is landed and tested (`safeSetKeys(isRule)`), the enrichment
  call site in `src/card/render.ts` must supply `isRule` (patch above).
- ~40% of samples: menu help-popover content — the port hardcodes
  `data-bs-content="&amp;nbsp;"` (src/card/render/views.ts menuView)
  where Ruby renders the card's `*help` rule content (escaped HTML, e.g.
  `&lt;span class=&#39;d-none&#39;&gt;...`). This class was MASKED behind
  the class-attribute first-diff before this stream's fix; it needs the
  help-rule lookup threaded through the prepare phase (async plumbing
  crosses `src/card/render.ts`), a separate work item.
- capture-error expectations: Ruby itself raised (e.g.
  `Card::Error::BadQuery: Invalid JS...`) on search-content cards; the TS
  handler renders output instead. Capture/judgment-layer class.
- other deeper content diffs (structure content, nested-render depth).

None of the remaining classes are set-key derivations: for every sampled
failure the slot class attribute now matches Ruby's bytes up to the first
non-set-key divergence.
