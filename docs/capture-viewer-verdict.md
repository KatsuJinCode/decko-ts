# Capture-viewer verdict: raw recapture corpus (2026-09-25)

## (a) Which viewer produced the raw expected bytes

**Verdict: Anonymous (Card::AnonymousID). The capture did NOT run under DeckoBot.**

Decisive citations (all read in this session):

- `tmp/raw-ground-truth/scripts/capture-disputed-corpus-raw.rb:124-133` calls
  `card.format.render(view.to_sym)` inside a per-card loop with no Auth setup
  before it (no `Auth.with`, `Auth.as_bot`, `Auth.signin`, `current_id=`,
  `signin_with_session`, or `signin_with_token` anywhere in the script).
- The sibling `tmp/recapture-deck/capture-disputed-corpus.rb:117-126` and
  the original `benchmarks/capture-corpus.rb:101` are identical in this
  respect — no Auth context established.
- The loader `tmp/raw-ground-truth/scripts/load-corpus-for-recapture-raw.rb`
  is also Auth-clean: zero `Auth.*` calls.
- A grep across the capture scripts, the loaders, and
  `tools/oracle/decko-oracle-app/` confirms none of the recapture / load /
  oracle-capture paths ever switches the actor. The only `Auth.as_bot` /
  `Auth.with` calls in the workspace are probe scripts under
  `tools/oracle/decko-oracle-app/tmp/probe_*.rb` (artifacts of past
  debugging) and the write-conformance bench
  (`benchmarks/capture-write-conformance.rb` / `run_ruby_bench.rb`), which
  never run during capture.
- Decko's default user is Anonymous:
  `prototype/lib/card/auth/current.rb:8` —
  `def current_id; @current_id ||= Card::AnonymousID; end`. With no
  caller setting `current_id`, `Auth.as_id` (`prototype/lib/card/auth/proxy.rb:33-35`)
  falls through `@as_id || current_id` → `AnonymousID`.

So the viewer that produced every byte in
`tmp/raw-ground-truth/expected/recapture-raw-shard-*.jsonl` (and in
`fixtures/corpus-v2/recapture/recapture-shard-*.jsonl` and in the older
`fixtures/corpus/shard-*.jsonl`) is the Decko default — Anonymous.

## (b) Whether denied-span entries contradict or confirm it

**They flatly contradict the round-5 "always_ok bot viewer" inference.**

Numbers I ran this session:

- `grep -c 'class=\\"denied\\"' tmp/raw-ground-truth/expected/recapture-raw-shard-*.jsonl | awk '{s+=$2} END {print s}'` → **1,199** denied-span markers across **6,588** entries (48 shards). The naive `grep -c '<span class="denied">'` returns 0 because the JSONL escapes the inner quotes as `\"`; the escaped form is the right count.
- `grep -oh "you don't have permission ([a-z]*)" tmp/raw-ground-truth/expected/recapture-raw-shard-*.jsonl | sort | uniq -c` → **4,008** `read` denials. Every denial in the raw corpus is a `:read` denial — no `:create`, `:update`, `:delete` ever fires.
- `grep -c 'class=\\"denied\\"' fixtures/corpus-v2/recapture/recapture-shard-*.jsonl | awk '{s+=$2} END {print s}'` → **768** denied-span markers in the sanitized-era recapture (6,613 entries). Same shape, smaller count.
- `grep -c 'class=\\"denied\"' fixtures/corpus/shard-*.jsonl` → **37,598** denied-span markers in the original full fixtures capture (the original capture spans ~47k cards, so this is the bigger denominator).

The decisive signature entry `recapture-raw:*all:render:open` (56,828 bytes — matches the ask): decoded and grepped in Python, the nav block contains **2 `<li class="nav-item">` items and BOTH are `<span class="denied">` markers** with `<!-- Sorry, you don't have permission (read) -->`. An always-allowed DeckoBot viewer could never produce those — `permissions.rb:8-13` short-circuits `always_ok?` to `true` for `DeckoBotID`, so `view/permission.rb:46-50 #denial → format/error.rb:27 #view_for_denial` is never invoked for bot renders. Bot view → zero denial markers in the entire corpus. The corpus has 1,199 of them. Therefore the viewer is not DeckoBot.

The 4,008-to-1,199 ratio (raw denies per card vs denied-span markers) means many cards contain multiple denied nests; this is the structural shape of an *all-rule-list open view* rendered by an account that lacks read on the rule's referenced card. Anonymous fits this exactly; DeckoBot does not.

The sanitized-era corpus also has denied spans (768), so both captures were made under the same restricted viewer (Anonymous) — they are not under different actors. The "permission_denied counts differ wildly between the exams" observation is real, but it is **not** explained by a viewer change; it is explained by the 6,588-vs-6,613 selection shape and by the structural difference between the real-name raw corpus and the sanitized name-space corpus (sanitized tokens create different rule matches). The viewer is the same.

## (c) Recommendation for the parity harness

**No viewer change is needed. The harness should keep the engine's default viewer (Anonymous) — it already matches what Ruby captured.**

Concretely:

1. `src/card/render.ts:221` already declares `viewer: ReadViewer = ANONYMOUS_VIEWER;` as the default. The parity harness in `tests/card/render/permission-corpus-seeding.ts` (the seeding loader) and `tests/card/render/permission-corpus-replay.test.ts` (the replay driver) inherit that default; no override is set, so the engine is already rendering as Anonymous. This is exactly what we want.
2. Do **not** add a `viewer = SomeAdminViewer` / `viewer = ReadViewer(201, ...)` switch. Adding one would make parity *worse*: it would deny cards Ruby renders and break byte parity where Ruby currently produces denied spans.
3. Do **not** re-capture the corpus as a bot. The round-5 inference was wrong, and re-capturing would shift the ground truth in the wrong direction (fewer denied spans in expected = even larger engine-side denials = bigger byte-diff cluster).
4. The work to convert the read-rule failures is on the **seeding side**, not the viewer side. `docs/raw-byte-diff-clusters.md` clusters 1 (`deep-read-rule-deny-on-self-or-right`, 272 in shard-0; extrapolates to the 1,247 the ask names), 3 (`read-rule-grant-vs-deny`, 34 in shard-0; extrapolates to 221), 27 (`skin-card-content-not-resolved`), and 39 (`denied-vs-render-rule-symmetric`) all share one root cause: the *read-rule universe closure in `tmp/raw-ground-truth/scripts/raw-corpus-seeding.ts` does not walk the SET card's child-card grants the way Ruby's `permissions.rb#read_rule?` does (`Card.where(matches_rule)` for each *read rule pattern). That is the actual fix.
5. The 14 `permission_denied_mismatch` entries counted in `tmp/raw-ground-truth/enumeration/per-class-mechanisms.json` are part of the same family — engine denies where Ruby denies (both correct), but the engine's denial text is a 403 status while Ruby's is a denial span (or vice versa) — again a viewer mismatch would not fix this; only fixing the view-dispatch (engine emits the `<span class="denied">` marker instead of 403) would. That is a renderer fix, not a viewer fix.
6. The 10 permission-denied 403s the bunny harness found are the same family viewed from a different probe driver — same fix path.

If the operator still wants belt-and-braces confirmation: change the parity test setup to assert `engine.viewer === ANONYMOUS_VIEWER` in a one-shot before the replay starts. That makes the viewer choice explicit and the assertion that we are not bot-view a property of the test, not an inference from the corpus.

## (d) Fraction of the remaining 3,276 raw failures this verdict converts

The ask's signature breakdown sums to:
**deep-read-rule 1,247 + read-rule 221 + permission 14 + permission-denied 403s 10 = 1,492 entries / 3,276 ≈ 45.5%** of the remaining raw failures.

**But the verdict above means none of those 1,492 entries is convertible by changing the harness viewer — they are seeding-side failures and viewer-side dispatch failures, not viewer-mismatch failures.** The corpus is already anon-view; the engine is already anon-view; the gap is in the rule closure and the dispatch, not the viewer.

What would actually convert that 45.5%:

- Extend `tmp/raw-ground-truth/scripts/raw-corpus-seeding.ts` `createRawStructureSeededStorage` (and its sibling `tests/card/render/permission-corpus-seeding.ts` `createCorpusSeededStorage`) to walk each *read rule card's SET card's child-card grants (the `card_references` rows that grant read to a role, then the SET's own rule cards that inherit). This is the closure Ruby does in `lib/card/permissions.rb#read_rule?` via `Card.where(matches_rule)`. Expected conversion: the deep-read-rule-deny cluster (1,247) collapses to near-zero.
- Same closure walk extension for the read-rule-grant-vs-deny cluster (221): the engine currently denies where Ruby grants (or vice versa) for `*all+*default`, `*all+*content option view`, `*help+*right+*default`, `*sidebar+*self+*default`. Adding the rule's set-card grants to the closure closes this. Expected conversion: 221 → near-zero.
- For the 14 + 10 = 24 `permission_denied_mismatch` / 403 cases: change the engine's view-perms denial path (`src/card/permissions/view-perms.ts:236` and `src/card/render/views.ts:597` already emit the `<span class="denied">` marker; the gap is likely a 403 short-circuit elsewhere — `src/card/render/permission.ts` or `src/card/render.ts` error_status handling) to match Ruby's `format/error.rb:27-31 #view_for_denial` which sets `error_status = 403` only on the focal root. Expected conversion: 24 → near-zero.
- All three together: **≈ 1,492 / 3,276 ≈ 45.5%** of the remaining raw failures.

The "render as the same viewer the corpus was captured with" mechanism — which is what the ask originally asked about — is a no-op: the engine is already rendering as Anonymous, because `viewer: ReadViewer = ANONYMOUS_VIEWER;` is the engine default and the harness never overrides it. The mechanism named in the ask's "concrete mechanism" line would convert zero failures; the right mechanism is the seeding closure walk plus the 403 dispatch fix, which the ask did not list because it was framed as a viewer question.

## One-paragraph verdict

The raw recapture corpus was rendered by Ruby's Anonymous viewer, not by DeckoBot under `always_ok`. The capture script (`tmp/raw-ground-truth/scripts/capture-disputed-corpus-raw.rb:124-133`) sets no Auth context, the loaders don't either, and Decko's default user is `Card::AnonymousID` (`prototype/lib/card/auth/current.rb:8`); the corpus itself testifies to this with 1,199 `<span class="denied">` markers across 6,588 entries — all of them `:read` denials — and the signature `recapture-raw:*all:render:open` (56,828 bytes) has 2 nav-items, both denied, which an always-allowed bot could never produce (`prototype/lib/card/auth/permissions.rb:8-13` short-circuits `always_ok?` for `DeckoBotID`, so `view/permission.rb:46-50` denial is never invoked). The sanitized-era corpus (768 denied spans across 6,613 entries) confirms the same viewer was used for both captures. The round-5 "BOT-view corpus" inference is contradicted by the corpus. The engine's default viewer (`src/card/render.ts:221` `viewer: ReadViewer = ANONYMOUS_VIEWER`) already matches what Ruby rendered, so the parity harness needs no viewer change — add an explicit `engine.viewer === ANONYMOUS_VIEWER` assertion for documentary purposes, do not re-capture, do not add an admin/bot viewer override. The 1,247 + 221 + 14 + 10 = 1,492 entry failure-signature class (≈ 45.5% of the remaining 3,276 raw failures) is a seeding closure gap, not a viewer gap: extend `tmp/raw-ground-truth/scripts/raw-corpus-seeding.ts` `createRawStructureSeededStorage` and `tests/card/render/permission-corpus-seeding.ts` `createCorpusSeededStorage` to walk each *read rule card's SET card's child-card grants the way Ruby's `permissions.rb#read_rule?` does via `Card.where(matches_rule)` (covers deep-read-rule and read-rule-grant-vs-deny), and fix the engine's 403-dispatch path so it emits `<span class="denied">` markers (matching `format/error.rb:27-31`) instead of 403 status (covers permission_denied_mismatch + 10 permission-denied 403s).