# The collapse-id mask (N3): two-oracle-run evidence

Rule N3 (canonical form over a volatile value) in
`reference-harness/runner/normalize.mjs`, specified in
`reference-harness/SPEC.md` section 4, normalizes the numeric context of
`card-<safe-key>-<n>-collapse-id` tokens. This file records the evidence the
mask rule requires: the field varies between two runs of the same oracle on
the same fixture, and the masks cover exactly that variance.

## Mechanism

The mod-card admin pages render one accordion per cardtype group
(`card/mod/core/set/all/admin.rb:88-98`), and `accordion_sections` seeds each
item's collapse id with `context: title.hash` (`admin.rb:96`). The
card-mod-bootstrap `accordion_item` (`mod/bootstrap/set/all/bootstrap/
accordion.rb:6-17`) interpolates the context verbatim:
`collapse_id: "card-#{card.name.safe_key}-#{args[:context]}-collapse-id"`.
Ruby hashes strings with a per-process seed (verified directly: two
`ruby 3.3.12 -e "puts 'Admin'.hash"` processes print different values), so
the digits are process noise rather than oracle bytes. The engine's emitter
(`src/card/mod-loader/mods/core-mod.ts` `stringHash`) emits a shape-stable
stand-in for the same slot; with N3 both sides compare equal placeholders
and the button-target/panel-id pairing still counts.

## Procedure

Two stock-oracle processes rendered the same fixture subset — every
`synthetic-v2` operation whose id matches the five mod admin cards
(`:mod: (account|style|script|search|email)`). That selection contains every
op of the fixture that carries a numbered collapse id (30 of 2,557; 84
tokens), so the evidence is complete over the field's population.

    node reference-harness/runner/run.mjs \
         --adapter reference-harness/adapters/ruby/adapter.json \
         --fixture reference-harness/fixtures/synthetic-v2 \
         --out <work>/run-1 --kinds render \
         --filter ":mod: (account|style|script|search|email)"
    # (repeat into <work>/run-2; each run boots its own Ruby process and its
    #  own private deck copy)
    # renders-only runs hold zero other kinds; create the empty kind files
    # so compare-runs reads them:
    #   : > run-1/semantics.jsonl; : > run-1/scenarios.jsonl  (and run-2)
    node reference-harness/runner/compare-runs.mjs <work>/run-1 <work>/run-2

## Measured result (2026-10-10, base 8008f893, ruby 3.3.12, decko 0.20.0)

    render     44 items: 6 identical, 38 equal after masks, 0 unexplained
    N1 slot ids: 442 of 442 paired values differ between the runs
    N3 collapse ids: 84 of 84 paired values differ between the runs

Every raw difference between the two oracle processes is a slot id or a
collapse-id digit run; nothing else varies (unexplained: 0). The raw run
directories are regenerable scratch and were not kept; the receipt of the
recorded comparison is in the lane's report and reproducible with the
commands above.
