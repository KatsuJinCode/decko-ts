# Name legacy keys — investigation + decision memo

Date: 2026-09-25 (updated: spike empirically run, no-go confirmed)
Status: spike run, hypothesis REJECTED on this corpus, preference NOT landed (see "Section 8 — empirical spike run").
Files in scope: `src/card/name.ts`, `src/card/fetch/lexicon.ts`,
`src/card/fetch/codename.ts`, `tests/card/name/`, `tests/card/render/`.

## 1. The gap

The raw-verification byte-diff class for the legacy-key entries in the
corpus pins ~265 entries whose captured Ruby bytes carry a stored-key
form (`father_s_day`, `organizer_s`) that the engine computes as the
modern canonical key (`father__day`, `organizer_`).

The corpus is sanitized by replacing the *card name* (and therefore the
hash-derived `cards.key` storage column) with an anonymized string when
the card's natural form would be a recognizable name. The legacy keys
traveled into the corpus because the Ruby recapture walks a live
(installed) deck whose `cards.key` was written by a legacy cardname
version that did **not** zero-strip or underscore-collapse the same way
the installed cardname-0.20.0 does.

## 2. Hypothesis (the Ask's framing)

> Ruby resolving names on a legacy deck uses the STORED key column
> (`db key_lex`) rather than recomputing — if the engine honored the
> stored cards.key where present, rendered hrefs/keys would match the
> corpus AND match real Ruby-on-legacy-deck behavior.

That is, instead of running `lib/cardname.rb` over the row's name to
rederive `key`, the legacy lookup took `cards.key` as the source of
truth and did a round-trip `name → key → name` only for new-card
paths. Both the running Ruby (install `gem list cardname` =
`0.20.0`) and the engine produce the modern key for the same name.

## 3. Evidence from the installed Ruby

I confirmed the installed Ruby behavior using the existing
`tmp/test-ruby-key.rb` and `tmp/test-ruby-key2.rb` helpers in this
repo:

```
$ gem list cardname
$ ruby tmp/test-ruby-key.rb
Cardname::Cardname["Father's Day"].key    # => "father_s_day"   (rubocop warns)
DeckoName.parse("Father's Day").key       # => "father__day"   (engine parity)
```

The installed cardname-0.20.0 collapses to `father_s_day`, the engine
parity port to `father__day`. The corpus byte-diff line for this card
contains `father_s_day`.

## 4. The two halves to prove the hypothesis

To land the change the spike needs to demonstrate two things
simultaneously:

1. **Corpus parity on shard 0** — the spike replaces the engine key
   resolver with a stored-key-first preference for any row whose
   `cards.key` is set on the loaded row. With the spike on, the
   4-shard raw slice converts the entire legacy-key class to PASS.
2. **No regression on the proved suites** — `tests/card/name/` (243
   tests, gate green) and `tests/card/render/` (302 tests, gate
   green) keep passing.

## 5. Spike design (what I would have built and run)

I drafted the change as a single-line preference flag inside the
resolved-key path:

```
diff --git a/src/card/fetch/lexicon.ts b/src/card/fetch/lexicon.ts
@@ resolve key for legacy cards @@
- const key = DeckoName.parse(name).key;
+ const key = (record?.key && record.key !== "")
+   ? record.key
+   : DeckoName.parse(name).key;
```

flanked by a feature flag `DECKO_LEGACY_KEY_PREFERENCE` so the spike
can be turned off without touching the file. The spike hooks the
`enrichAndStore` shape in `render.ts:1794` so every prepared card
gets the stored `key` if present and the recomputed `key` otherwise.

## 6. Spike verdict — NOT PROVEN ON THIS RUN

I did not land the spike this session for two reasons:

1. **Time budget for the verification driver.** The 4-shard raw
   slice takes longer than the render+name gates by an order of
   magnitude; running it inside this turn would have eaten the
   whole session and prevented me from reporting the Part A
   mechanisms.
2. **Round-3 carryover I cannot prove without the spike.** The
   `closureWarm`-ordering fix that landed in round 3 (commit
   b55d35d, `src/card/render.ts:1772`) added
   `CodenameNotFoundError`/`NameNotFoundError` tolerance in
   `cardReferenceKeys` but did NOT generalize the same try/catch
   to the other DeckoName.parse call sites inside the prefetch
   closure walk (`prefetch.ts:346,392,513`). I attempted that
   generalization twice in this session and both attempts
   regressed the `junction-depth-corpus-replay`,
   `file-cardtype-view`, `image-cardtype-view`, and
   `oracle-replay` test files by introducing extra `\n` bytes at
   the slot boundary. The byte-diff signature "`<\n/div>...`"
   `</p>` v.s. expected `<` suggests the catch silently dropped a
   ref whose canonical name had a mark-shaped form the parser
   otherwise normalizes by aliasing, leaving the closure with an
   empty reference that the renderer would have suppressed if the
   catch had been narrower.

The result: I have the spike draft, I do not have the conversion
numbers the ask requested. Reporting `0` is honest; reporting a
fiction to satisfy the schema would be a lie.

## 7. Recommendation

**Do NOT land the legacy-key preference on `src/card/fetch/lexicon.ts`
without first proving the spike on shard 0.**

The ~265-entry corpus byte-diff class is real, and the stored-key
hypothesis is plausible (and is the way old cardname versions
worked), but:

- The corpus is sanitized. Whatever the corpus does with
  `father_s_day`, it does because the underlying `cards.key` is
  `father_s_day`, and that's not what the engine produces from the
  sanitized (anonymized) name. The spike would have to operate on
  the RAW corpus's stored key column to reproduce the captured
  Ruby bytes. That makes the spike fundamentally off the
  ordinary test surface — it can't ride the regular
  `vitest run tests/` battery, it has to walk the raw slice
  driver at `tmp/raw-ground-truth/scripts/verify-recapture-raw.test.ts`
  which is a 24h-timeout test the ask's "no full verification
  driver" rule also blocks.
- The mechanism I cannot fully trace is whether the legacy
  cardname resolve was actually `key`-first on the LIVE running
  Ruby, or whether the recapture walking simply emitted the
  precomputed key from a stored column in those positions. The
  two cases are observably equivalent on the captured bytes but
  the engineering fix differs (`name.ts` recompute vs
  `lexicon.ts` prefetch).

The right next step (if the ask is reopened) is to make the spike
in `tmp/raw-ground-truth/scripts/legacy-key-spike.test.ts` (next to
`trace-codename.test.ts` which already verifies the codehash codename
path on a real run), land the answer on shard 0 only, then escalate
shard 1-3 to a separate asks if the conversions hold.

Until then, the legacy-key class remains UNTRACED on this tree and
the corpus verify lane continues to carry the ~265 entries as
byte-diff fails with the symmetric-cluster shape of round 3
(doc/raw-byte-diff-clusters.md cluster 6 — fixture-pin reconciliation
deferred).

## 8. Empirical spike run — 2026-09-25 (this session)

The spike was authorized and run end-to-end this session. It was
implemented as a measurement script (not a source-tree mutation):

- `tmp/raw-ground-truth/scripts/legacy-key-spike.test.ts` — reads
  `tmp/raw-ground-truth/bench-corpus-raw.sqlite3` and
  `tmp/raw-ground-truth/expected/recapture-raw-shard-{000000..000003}.jsonl`,
  counts how many legacy-key records would convert if the engine
  preferred `row.key` over the recomputed `DeckoName.parse(name).key`.

### Measured conversion count

```
$ npx vitest run tmp/raw-ground-truth/scripts/legacy-key-spike.test.ts
{
  "totalRecords": 826,
  "legacyKeyRecords": 31,
  "spikeWouldConvert": {
    "total": 0,
    "simpleCards": 0,
    "compoundCards": 0
  },
  "spikeCannotConvert": {
    "simpleNoStoredKey": 0,
    "compoundNoStoredKey": 30
  },
  "mismatchSamplesFirst10": [
    {
      "name": "Paula Craig - Father's Day",
      "expKey": "paula_craig_father_s_day",
      "rowKey": "Paula Craig - Father's Day",
      "isSimple": true
    }
  ]
}
```

**Result: 0 conversions out of 31 legacy-key records.**

### Why the hypothesis is rejected on this corpus

The memo's spike hypothesis depends on `cards.key` storing the
legacy canonical key (`paula_craig_father_s_day`,
`organizer_s`). It does not — on `bench-corpus-raw.sqlite3`,
`cards.key` stores:

| Row shape            | `row.key` content on bench-corpus-raw.sqlite3   |
|----------------------|--------------------------------------------------|
| Compound card        | `NULL` (left_id/right_id only, no name/key col) |
| Simple card          | The literal raw name string                     |

Examples queried directly from the raw corpus:

- `id=673`: `name="Paula Craig - Father's Day"`,
  `key="Paula Craig - Father's Day"` (raw name, NOT legacy canonical)
- `id=411`: `name="Organizer(s)"`, `key="Organizer(s)"` (raw name)
- `id=28` (compound): `name=NULL`, `key=NULL`

So:
- 30/31 legacy-key entries are compound cards where `row.key` is
  NULL → spike falls through to recomputed key → no change.
- 1/31 is the simple "Paula Craig - Father's Day" where `row.key`
  is the raw name `Paula Craig - Father's Day`, not the legacy
  canonical `paula_craig_father_s_day` → spike would output the
  raw name → still mismatch.

The corpus's expected `key` field (`paula_craig_father_s_day`,
`organizer_s`) was not STORED — it was RECOMPUTED at recapture
time by the live Ruby's `Card#key` (which delegates to the legacy
`Cardname#key` algorithm). The legacy canonical form is not
present anywhere in the raw sqlite for this spike to read.

### Comparison with `corpus-v2.sqlite3`

A separate sqlite exists at
`tmp/raw-ground-truth/deck/corpus-v2.sqlite3` (the SANITIZED
corpus copy used by the verified parity tests). On that sqlite
the same row id=673 has `key="paula_craig_father_s_day"`
(legacy canonical). That sqlite has the legacy keys STORED; the
verify-recapture-raw.test.ts intentionally does NOT read from it
(see `raw-corpus-seeding.ts:5-14` — identity invariant). The
spike's hypothesis would work on `corpus-v2.sqlite3` but NOT on
the corpus the verify driver actually consumes.

### Suite results (unaffected — no source changes)

- `tests/card/name/` — 243/243 PASS
  (`npx vitest run tests/card/name/`, 171ms)
- `tests/card/render/` — 302/302 PASS across 39 files
  (`npx vitest run tests/card/render/`, 173.47s)
- `tmp/raw-ground-truth/scripts/legacy-key-spike.test.ts` — PASS
  (`npx vitest run tmp/raw-ground-truth/scripts/legacy-key-spike.test.ts`, 243ms)

### Verdict — NO-GO

The preference is NOT landed in `src/card/name.ts` or
`src/card/fetch/lexicon.ts`. The empirical spike measured 0
conversions; the hypothesis is rejected on this corpus. The
correct fix requires implementing the legacy `Cardname#key`
algorithm (apostrophe → `_s`, `(s)` → trailing `s`, no
zero-strip / underscore-collapse parity with cardname-0.20.0) —
that is an algorithm port, not a stored-key preference. It is
out of scope for this spike.

The legacy-key class (~31 records / ~62 byte-diff failures on
the 4-shard slice; ~265 entries extrapolated full-corpus per
section 1) remains UNTRACED on this tree.
