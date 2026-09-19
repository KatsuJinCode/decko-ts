# Oracle replay harness

Replays the Ruby oracle's captured fixtures (`fixtures/captured/smoke.json`,
`fixtures/captured/cql-basic.json`) through the TypeScript engine as it
lands, byte-diffing TS output against Ruby truth. The fixtures are the
executable specification; this harness is the machinery. Capture side is
documented in `docs/oracle-harness.md`; this doc is the consumption side.

Code lives in `src/testing/` (imported by streams, never importing them),
tests in `tests/testing/`.

- `src/testing/fixture-schema.ts` — types + load-time validation for the
  captured format. Exact schema: unknown keys or wrong-typed values fail
  loudly at load, so a re-capture that changes format forces a deliberate
  schema update instead of silent drift.
- `src/testing/diff.ts` — `normalizeSlotIds` (the mirrored recording-layer
  normalization, a small separately-tested function) and `byteDiff`
  (exact bytes, first-difference context).
- `src/testing/replay.ts` — the handler contract, `HandlerRegistry`,
  fixture-to-entry flattener, replay runner, structured report.

## Engine areas and what each fixture section feeds

| Fixture section | Area | Entries today |
|---|---|---|
| smoke `cards` → name-derived fields (`key`, `left`, `right`) | `name-engine` | 10 |
| smoke `cards` → full record minus `id` | `card-engine` | 10 |
| smoke `rendered` | `render-engine` | 20 |
| smoke `read_rule` | `rules-engine` | 1 |
| cql-basic `queries` | `cql-engine` | 11 |

Total: 52 entries. The `id` field of card records is DB-local and
informational (docs/oracle-harness.md, "id stability"); the harness strips
it from BOTH sides before comparison. Embedded `data-card-id` values inside
rendered HTML are NOT stripped — they are part of the captured bytes.

**smoke `cql_search` is validated but deliberately NOT replayable**: the
capture recorded bare `Card.search(...)` result arrays without the
canonical query JSON, so there is no machine-usable handler input.
`cql-basic.json` (which records the canonical query per case) is the
replayable CQL spec and supersedes those 3 entries.

Areas without a registered handler report **PENDING** — a missing stream is
a status, never a failure.

## The handler contract

Handlers are plain functions registered in the registry; the harness
references engine streams by INTERFACE ONLY (no imports of `src/card`,
`src/cql`, or any other engine area from `src/testing/`).

```ts
import type { HandlerOutcome } from "../src/testing/replay.js";

type Handler<Input> = (input: Input) => HandlerOutcome | Promise<HandlerOutcome>;
```

Per-area exact signatures (from `AreaHandlerMap` in replay.ts):

```ts
// name-engine  (src/card/name.ts stream)
(input: { name: string }) => HandlerOutcome
//   must return: jsonValue({ key, left, right })   // exactly these three keys

// card-engine  (card fetch/cache layer, wave 2+)
(input: { name: string }) => HandlerOutcome
//   must return: jsonValue(cardRecord)             // full record; id may be present (stripped)

// cql-engine  (src/cql stream)
(input: { query: { [key: string]: unknown } }) => HandlerOutcome
//   query is the CANONICAL query JSON from the fixture.
//   success: jsonValue(names: string[])            // the name-only result, in order
//   raise:   raisedError(rubyClassName, message)

// render-engine  (renderer, wave 3)
(input: { cardName: string; view: string }) => HandlerOutcome
//   success: renderBytes(html)                     // exact output bytes
//   raise:   raisedError(rubyClassName, message)

// rules-engine  (sets/rules/permissions, wave 2+)
(input: { target: string }) => HandlerOutcome
//   must return: jsonValue(readRuleRecord)         // the 8 captured read_rule fields
```

### HandlerOutcome rules

- `{ kind: "bytes", bytes }` — compared as-is (render HTML).
- `{ kind: "json", value }` — canonicalized (deeply key-sorted, compact —
  the capture's own convention) then byte-compared. Extra or missing keys
  in the object fail; the contract is exact.
- `{ kind: "error", errorClass, message }` — rebuilt as the recorded
  sentinel `` `CAPTURE_ERROR: ${errorClass}: ${message}` `` and
  byte-compared. `errorClass` must be the FULL Ruby class name (e.g.
  `"Card::Error::UserError"`, `"RuntimeError"`) because the sentinel bytes
  are the parity target. `message` must be the exact recorded message —
  note the capture truncated unknown-view messages to 200 chars
  (`e.message[0, 200]` in capture.rb); supply the form you want compared.
- Reporting the sentinel string as `json` output is NOT equivalent to
  reporting the error; the harness treats that as a shape mismatch and
  fails the entry with a hint. Use `raisedError`.

Helpers exported for stream use: `renderBytes(s)`, `jsonValue(v)`,
`raisedError(cls, msg)`.

### Render-input convention for the unknown-view sentinel

Fixture rendered keys are `"Card Name#viewLabel"`. For the four
`#unknown_view_sentinel` entries the label is a capture label, not a view:
capture.rb actually rendered `format.render(:definitely_not_a_view)`. The
flattener maps that label to the executable input via
`renderedViewInput()` in fixture-schema.ts (`unknown_view_sentinel` →
`definitely_not_a_view`; every other label passes through unchanged). A
handler therefore only ever sees real views.

## Registration

Streams register in their OWN test files (nothing in `src/testing/` wires
engines in). One registry per test; double registration for an area throws.

```ts
// tests/card/name/oracle-replay.test.ts (name stream example)
import { describe, expect, it } from "vitest";
import {
  DEFAULT_FIXTURE_PATHS, HandlerRegistry, collectReplayEntries,
  jsonValue, replayEntries,
} from "../../../src/testing/replay.js";
import { loadFixtureFile } from "../../../src/testing/fixture-schema.js";
import { keyOf, leftOf, rightOf } from "../../../src/card/name.js"; // your engine

const registry = new HandlerRegistry();
registry.register("name-engine", ({ name }) =>
  jsonValue({ key: keyOf(name), left: leftOf(name), right: rightOf(name) }));

it("replays the captured name fixtures", async () => {
  const fixtures = DEFAULT_FIXTURE_PATHS.map(loadFixtureFile);
  const report = await replayEntries(collectReplayEntries(fixtures), registry);
  // your area must be fully replayed and green:
  const area = report.entries.filter((e) => e.area === "name-engine");
  expect(area.every((e) => e.status === "pass")).toBe(true);
});
```

`replayFixtureFiles(paths, registry)` is the one-call equivalent (load +
flatten + replay). On failure, `formatReplayFailure(result)` renders the
useful context; `formatReplayReport(report)` renders every entry.

## How to run

```bash
npx vitest run tests/testing        # harness machinery only
npm run replay                      # machinery + every stream's oracle-replay suite
```

`npm run replay` filters vitest on `oracle-replay` (the convention for
stream-owned replay suites) plus `tests/testing`. When a stream lands its
handler it should name its suite file `oracle-replay.test.ts` so the
aggregate command picks it up.

## The normalization rule (normative definition)

`normalizeSlotIds(html)` (src/testing/diff.ts) implements the recording
layer's rule (docs/oracle-harness.md, capture.rb):

- `data-slot-id=<quote><exactly 20 lowercase hex><quote>` →
  `data-slot-id="RANDOMIZED"`, for both quote styles (Ruby emits double
  quotes in most views, single quotes inside search-result bars; the
  capture canonicalizes both to double-quoted placeholder).
- Exactly 20 lowercase hex because Ruby emits `SecureRandom.hex(10)`. The
  length is a deliberate replay-side strictness beyond capture.rb's looser
  `\h+`: a TS engine emitting a wrong-length id survives normalization and
  fails the byte diff, which is the point. Uppercase hex also survives
  (Ruby output is lowercase; uppercase would be a divergence).
- Idempotent: the placeholder is never re-matched. Attribute presence is
  preserved — only the value is rewritten.

Replay applies this to BOTH sides (`compareNormalized`), then diffs exact
bytes: no whitespace tolerance, no case folding. Any non-slot difference
is a real mismatch and is reported with the first differing position
(code-unit offset + UTF-8 byte offset + escaped characters + surrounding
excerpts from both sides).

## Failure surface

`ReplayEntryResult` (per entry): `status` (`pass`/`fail`/`pending`), and on
fail a `diff` (`ByteDiffResult`) plus an optional `detail` hinting at
outcome/expectation shape mismatches (e.g. "handler raised ... but the
fixture expects a successful result"). On pending a `pendingReason`.

## Known gaps (honest)

- `card-engine` and `rules-engine` have no implementing stream yet
  (wave 2+ backlog: card fetch/cache layer, sets/rules/permissions); their
  11 entries report PENDING until then.
- smoke `cql_search` (3 entries) is validated, typed, and intentionally not
  replayable (no canonical query input recorded); cql-basic carries the
  replayable coverage.
- The replay only covers what the capture recorded. Views beyond
  :open/:closed/:content/:title, deeper CQL operators, and mod-level
  behavior need new capture rungs (and a MySQL rung for CQL `match`
  parity — see docs/oracle-harness.md).
- `byteDiff` reports byte offsets by UTF-8-encoding the JS string prefix;
  fixture bytes round-trip through JSON, so byte counts are exact for the
  committed fixtures (all BMP characters).
