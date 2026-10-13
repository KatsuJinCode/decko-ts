# The backtrace frame canonical form (N6): evidence

Rule N6 (backtrace frame lines inside debug-page titles) in
`reference-harness/runner/normalize.mjs`, specified in `reference-harness/SPEC.md`
section 4. Evidence shape as N4/N5's: the field the rule covers is a pure
function of the host VM's identity (its language, its paths, its boot
history), constant between two runs on one machine — the committed capture
bytes themselves are the receipt, and the measurement is over
oracle-vs-engine pairs on the fixture.

## Mechanism: the two sides run different languages' stacks

Ruby's `error.rb` debug page embeds `exception.backtrace * "<br>\n"`. The
oracle's frames are Ruby's: `path:line:in \`method'`, boot-inclusive —
every backtrace runs from the raise site up through the gems, the railtie
boot and `script/decko`, dozens of frames per op. The engine's raise
posture (the port of the same `error.rb` arm) embeds the engine's own
stack: V8's `at fn (file:///path:line:col)` lines, throw-path only. A
frame line's text is the host VM's identity — in N5's class (capture-host
content), not the oracle's semantics: no port can emit the other
language's stack, and replaying the capture's frames would be byte replay,
not porting (the raise-posture receipt's words). What IS port-owned
structure is the frame COUNT: a faithful port raises through a call chain
it controls, and the debug page's shape (heading, message, div, the
`<br>\n` separators) is compared byte for byte by the existing rules. N6
therefore replaces each `<br>`-separated frame line inside the title's
backtrace div with the single placeholder `N6#frame`; the count survives
as the repetition count and the div's anchors stay exact.

## Measurement (2026-10-10, tip = int-100 98596a07 (raise-posture via the
line's own merge 6b9972cf, styleform closures, the fixture phrase-codename
fix) + rules N4/N5/N6; oracle capture committed at
`fixtures/synthetic-v2/expected`)

8 oracle ops carry the debug page. Frame counts, counted from each side's
raw render bytes (the committed oracle lines; the engine run under the
gate at the tip):

| op | oracle Ruby frames | engine V8 frames |
|---|---|---|
| view:admin:Ada Admin+*account:verify_url | 63 | 10 |
| view:admin:Ada Admin+*account:reset_password_url | 63 | 10 |
| view:admin:Ada Admin+*account:closure | 59 | 8 |
| view:admin:Report 1:preview_editor | 60 | 8 |
| view:admin:Note 001:debug_server_error | 51 | 8 |
| view:admin:*all+*script:asset_output_url | 53 | 8 |
| view:admin:Topic 001:edit_structure | 168 | (no debug title) |
| view:admin:All Topics:search_error | 51 | 8 |

(The last two rows carry the page inside divergences that start earlier —
`edit_structure`'s page follows structural gaps (the engine renders no
debug page there at all), `search_error`'s message differs (the engine's
BadQuery guard vs Ruby's Array#message NoMethodError) — so N6 does not
reach their first difference.)

Oracle-vs-engine over every op, before and after the rules:

    baseline (N1+N3+N4+N5) at the int tip 98596a07:
        2,450 identical, 0 not_identical, 107 pinned, 24 oracle_errors,
        same true - the line's own committed numbers
    with N6: identical stays 2,450 - no op closes and none breaks.
        The six raise-posture rows' first difference moves to the frame
        count boundary (the oracle's `N6#frame` run continues where the
        engine's div has closed): 63 vs 10, 63 vs 10, 59 vs 8, 60 vs 8,
        51 vs 8, 53 vs 8. The residual is now exactly the count - the
        instrument's tightening - and closing it is port work (the raise
        sites must emit a Ruby-shaped frame structure), not an instrument
        question. On the pre-rebase composition (int 6c16ef7c + the lane's
        own raise-posture merge) the same measurement read 2,436
        identical / 121 pinned, with the same six residuals - the ruling's
        outcome is base-independent.
    monotonicity: 0 identical ops break (identical is a fixpoint of a
        deterministic normalizer applied to both sides; measured on both
        trees).

Per-rule pair accounting (`runner/compare-runs.mjs <oracle-run> <engine-run>`,
the same oracle-vs-engine shape the N4/N5 receipt used):

    N1 slot ids: 13,449 of 13,449 paired values differ
    N3 collapse ids: 84 of 84 differ
    N4 relative-time spans: 0 of 173 differ (the time-history lane closed
        these by real bytes; N4's pairs now agree)
    N5 capture-host tokens in debug titles: 55 of 55 differ
    N6 backtrace frame lines: 60 of 60 paired frame lines differ
        (sum over diverging ops of min(oracle, engine) frame lines)
    render kind: 2,581 items - 507 raw identical, 1,943 equal after masks,
        131 unexplained (= the 107 pinned divergences + the 24
        oracle_errors; the tool's "unexplained" exit is expected for an
        oracle-vs-engine comparison - its empty-unexplained contract is
        for two runs of one engine)

## The compare-runs.mjs defect this lane fixed

The committed `compare-runs.mjs` regex for debug titles carried an
unterminated group since the N4/N5 commit — the module could not load at
all, so the "committed compare-runs.mjs reports the same accounting" claim
in the N4/N5 receipt was never executed against the committed bytes (the
lane's numbers came from a scratch simulator, deleted). Fixed here (the
capture group is the title body); the accounting above is the committed
tool's own output.

## Commands

    node $ZCODE_HOME/tools/lane-job.mjs --lane corpus-inst --wait \
         --job "corpus gate" -- \
         node benchmarks/seconds-corpus/seconds-corpus-gate.mjs --keep --work <dir>

`<dir>/report.json` holds every failing op's first difference at the
current rules. The oracle side needs no new capture: the committed
`expected/` outputs are the host-VM bytes. Ledger at this tip: the int
line's own 107 live pins (its raise-posture merge carried the branch's
evidence rewrites; its prunes deleted the closed blocks) with the six
debug rows' records refreshed under N6 - family naming the frame-count
residual, evidence at the after-N6 first difference, the counted frames
in the recorded line. 101 composed-mod-view-gap + 6 debug rows, zero
unpinned.
