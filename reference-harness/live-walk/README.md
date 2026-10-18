# reference-harness/live-walk — the byte + pixel walk comparison

A harness for the single live walk: given two base URLs (ours + theirs) and a
journey list, it walks every journey on both hosts and produces, per journey:

1. **a byte-level response diff** of every exchange, with an honest, EXPLICIT
   normalization table — session tokens, CSRF tokens, nonces, timestamps,
   http-dates, ETags, url tokens, each side's own host address, plus the
   corpus instrument's html rules (slot ids, relative times, ...) borrowed and
   named as borrowed. Every rule is listed in the report with per-side
   application counts and how many raw differences it absorbed. Nothing is
   normalized silently, and the raw evidence stays on disk beside every
   verdict.
2. **full-page screenshots of every journey page on both hosts** with a pixel
   diff — per page: `identical` / `pixel-delta` (count + bounding regions) /
   `structural-difference`, plus a red-on-white mask image of where the
   difference lives.
3. **a report a human can read**: `<out>/report.md` (verdict lines linking the
   evidence) and `<out>/report.json` (the machine record).

## Run it

Local engines (boots both engines itself, one fresh deck copy per journey):

```
node reference-harness/live-walk/walk-and-compare.mjs \
  --journeys reference-harness/live-walk/prove/journeys.engines.json \
  --engine-a reference-harness/browser/engines/ts.json \
  --fixture-a reference-harness/fixtures/synthetic-v1 \
  --out tmp/live-walk/<run-name> --offline
```

Pre-running hosts (the live-walk shape; both examples here are loopback):

```
node reference-harness/live-walk/walk-and-compare.mjs \
  --journeys <journey-list.json> \
  --base-a http://127.0.0.1:3000 --base-b http://127.0.0.1:4000 \
  --label-a ours --label-b theirs \
  --out tmp/live-walk/<run-name>
```

Journey lists are the browser-journeys format (`decko-browser-journeys/1`,
see `../browser/journeys/`); actor credentials come from the list's `actors`
block, `--actors-json`, or the fixture's `deck.json`. Useful flags:
`--filter <regex>`, `--disable W6` (any rule id), `--session-cookie-name <n>`,
`--pixel-tolerance <n>`, `--structural-fraction <f>`, `--include-third-party`,
`--offline` (refuse the stock layout CDNs in the walked browser too).

## Safety contract

- **Engine mode** only ever listens on 127.0.0.1 ports the harness picks.
- **Base-URL mode refuses every non-loopback host** unless that exact hostname
  is passed as `--allow-live-walk <hostname>` on the command line — the
  operator's explicit, per-host, in-the-open yes. No config file, environment
  variable or default arms live traffic. The gate runs before any byte leaves
  the process and before the output directory is created.
- The walked browser carries a route guard: only the loopback, the two named
  hosts and the stock layout CDNs are reachable; `--offline` refuses the CDNs
  too, so a walked page cannot wander to a third host.
- **R1 (always on)**: passwords and session-cookie values are redacted when an
  exchange is stored, before disk. The evidence tree never holds a live
  credential.

## Layout

```
walk-and-compare.mjs          the CLI (usage in its header)
lib/normalize-exchange.mjs    W1..W8 + borrowed N* rules + R1; the rule table
lib/png.mjs                   minimal fail-closed PNG codec (decode/encode)
lib/pixel-diff.mjs            pixel verdicts, bounding regions, mask images
lib/walker.mjs                the browser walk: exchanges, screenshots, gate
lib/compare-walks.mjs         matching, byte verdicts, explain attribution
lib/report.mjs                report.md + report.json
test/                         unit tests (node --test "reference-harness/live-walk/test/*.test.mjs")
prove/                        the local proofs (no live host is contacted)
  two-local-engines-proof.mjs   two local ts-engines, side B's deck seeded with
                                one Note-001 difference; asserts the seeded byte
                                and pixel diffs are found and everything else is
                                explained by named rules
  base-url-mock-proof.mjs       two local mock hosts via --base-a/--base-b; also
                                proves the live-host refusal fires before any
                                request
  mock-walk-host.mjs            the canned local host the mock proof walks
  journeys.*.json               the proofs' journey lists
```

## Proven (all local, nothing live)

```
node --test "reference-harness/live-walk/test/*.test.mjs"
node reference-harness/live-walk/prove/two-local-engines-proof.mjs
node reference-harness/live-walk/prove/base-url-mock-proof.mjs
node reference-harness/live-walk/prove/search-order-two-local-engines-proof.mjs
node reference-harness/live-walk/prove/search-order-default-invocation-proof.mjs
```

The proofs seed differences they then require the harness to find (a mutated
card on engine B, a mutated paragraph on mock host B), and require identical
pages to come out `identical` or `normalization-explained` with the named
rules doing visible, counted work.
