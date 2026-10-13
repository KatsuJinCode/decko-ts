# The capture-clock and capture-host canonical forms (N4, N5): evidence

Rules N4 (relative-time spans) and N5 (capture-host content inside debug
page titles) in `reference-harness/runner/normalize.mjs`, specified in
`reference-harness/SPEC.md` section 4. This file records the evidence both
rules require: the fields they cover are a pure function of the capture
moment (the clock the harness freezes) and the capture machine (the
filesystem the oracle ran on), not of the oracle's semantics.

These two differ from N1/N3's evidence shape and the SPEC says so: N1/N3
cover values that vary between two runs of the oracle on one machine. The
frozen clock and the capture host's filesystem are CONSTANT between two
runs on one machine — no two-run comparison can show them varying. The
volatility lives between the capture and everything that is not the
capture: an engine whose clock is live, a capture from another host, the
same host after a checkout move. The committed capture bytes themselves
are the receipt.

## N4 mechanism: the oracle's clock is frozen, the engine's is live

`oracle/lib/harness_env.rb` `freeze_clock!` pins `Time.now` to the fixture
clock (synthetic-v2's `deck.json`: `2026-09-19T12:00:00Z`) for the whole
oracle process. Every relative time the oracle renders is
`time_ago_in_words(stored_timestamp, frozen_clock)`. The cards were built
moments before the capture, so the oracle's spans read "less than a
minute" and always will. An engine rendering the same stored timestamps
through a live clock reads "20 days" — and a different number every day.
The span's value is capture-moment noise; its presence, position and
surrounding sentence are oracle bytes and still count (N4 keeps anchors
exact).

The engine side is not even self-consistent — some views take the capture
wall clock the adapter freezes (`setCaptureWallClock` in
`adapters/ts-composed/adapter.ts`), others call `timeAgoInWords` with a
live `new Date()` default — which is exactly why the value must not be
graded while the span must: the port has not settled which clock these
views read, and the instrument should not grade it until it does.

## N4 measurement (2026-10-10, base ef9c9157, ruby capture committed at
`fixtures/synthetic-v2/expected`)

Census over all 2,557 oracle render results: 22 ops carry a relative-time
span — "less than a minute" ×179, "2 days" ×1 (the `+*account` token
expiry line). The engine run at the same commit carries the same spans
with live-clock values ("20 days", "21 days").

Oracle-vs-engine over every op, before and after the rules:

    node reference-harness/runner/run.mjs \
         --adapter reference-harness/adapters/ts-composed/adapter.json \
         --fixture reference-harness/fixtures/synthetic-v2 \
         --out <work>/results
    # the lane's simulator (tmp scratch, deleted; the committed
    # compare-runs.mjs reports the same accounting per pair)

    baseline (N1+N3 only):  2,383 identical, 174 pinned divergences, 0 unpinned
    with N4:                4 pinned ops become fully equal —
                            view:admin:Topic 001:box,
                            view:admin:Note 001:conflict,
                            view:admin:Topic 001:creator_credit,
                            view:admin:Topic 001:view_list
    monotonicity:           0 identical ops break (canonical forms can only
                            add equality, never remove it — asserted over
                            all 2,548 comparable pairs)

The other time-bearing pins keep their pins because their divergence is
NOT only the clock, and N4 must not hide it:

- `Topic 001:created_at` / `updated_at` — the oracle renders
  time-ago words (`date_view`, card-mod-format `set/all/base.rb:61-71`:
  `voo.variant ? strftime : time_ago_in_words`); the engine's non-variant
  arm renders the ISO date (`2026-09-19`, `card-mod-format.ts` `dateView`,
  a documented divergence). The port gap is now one line to close — the
  byte-exact `timeAgoInWords` exists in `src/card/render/text-helpers.ts`
  and `creator_credit` already uses it.
- `Topic 001:history` / `history_tab` (admin, anonymous), `act`,
  `last_action` — the first difference is the span, but structural gaps
  follow it (for example `last_action`'s credit link lacks the
  `<span class="card-title" title="...">` wrapper the oracle emits).

## N5 mechanism: the debug pages embed the capture host

`card-mod-format`'s `set/all/html/error.rb` renders the exception's
backtrace inside the quiet error span's `title` attribute. The committed
oracle bytes carry this machine's frames verbatim — `C:/Ruby33-x64/...`
gem paths, the capture-time harness checkout path
(`$REPO_ROOT/../decko-ts-corpus/reference-harness/oracle/adapter.rb`),
`script/decko`, and where an object lands in the message, its heap
address. Those bytes are the capturing machine's filesystem, not oracle
semantics: a capture from any other host (or after moving the checkout)
differs in them while saying the same thing. N5 replaces drive-letter
paths with `N5#path` and `0x`-hex addresses with `N5#addr`, only inside a
title that begins with the debug page's own first bytes, and only there.
The frame's `:line:` separator stays outside the placeholder (the path
token ends at the colon), so frame lines and methods still count, as do
the error message and every byte outside the title.

## N5 measurement (same commit, same runs)

8 oracle ops carry the debug page — 554 path tokens, 2 heap addresses.
N5 closes no op: the six rows whose recorded divergence is the embedded
debug page (`Report 1:preview_editor`, `Note 001:debug_server_error`,
`Ada Admin+*account:verify_url`, `Ada Admin+*account:reset_password_url`,
`Ada Admin+*account:closure`, `*all+*script:asset_output_url`) are
STRUCTURAL — the oracle raises on those views and renders the error span;
the engine does not raise (it renders its own content: an empty string, a
Wild Card 500 page, the working view). That is a real port gap the pins
honestly record, and N5 does not and must not hide it. The rule exists so
that when the raise-posture gap closes, the comparison does not then
demand the capture machine's filesystem; the pins stay until then.

## Commands

The gate run regenerates both measurements:

    node $ZCODE_HOME/tools/lane-job.mjs --lane corpus-inst --wait \
         --job "corpus gate" -- \
         node benchmarks/seconds-corpus/seconds-corpus-gate.mjs --keep --work <dir>

`<dir>/report.json` holds every failing op's first difference at the
current rules; `runner/compare-runs.mjs <oracle-run> <engine-run>` prints
the per-rule pair accounting (N1/N3/N4/N5). The oracle side needs no new
capture: the committed `expected/` outputs are the volatile bytes.
