# Receipt 4: the timeago plural fix, in the rendered bytes at the rolled tip

Claim attacked: the timeago lane (`port/timeago-plural-20261026`, absorbed
into the roll as `594db3493`) claims the port's no-locale fallback renders the
singular form where a count is one, so the shipped bytes read "about 1 month"
and not "about 1 months"
(`docs/runs/timeago-singular-fallback-2026-10-25/timeago-singular-fallback.md`).

Attacked tree: `deploy/full-candidate-20261103` at `5131d2ac40dacc64c45530941e82937caef86137`.

The brief asks for the RENDERED BYTES, not the source. The first attack
(adversarial-port, receipt 02) found this exact class: the port rendered
"about 1 months" where the recording masked the phrase, so the byte equality
was true and the wording was wrong. The check below is therefore about the
bytes a page carries.

## Verdict: HELD

The rendered bytes carry the singular form in every band, and the pre-fix
bytes are on record for comparison.

## The rendered bytes

The probe (`probes/timeago-render-bytes.probe.ts`, run with
`probes/vitest.probe.config.ts`) renders the board's creator credit (the
`box_bottom` view, the surface the timeago receipt names) for a card whose
`created_at` sits in each band the English plural rule distinguishes, and
reads the bytes the page carries. The seed set is the format-remaining-views
bytes-dump suite's own, so the page is the one the recorded Ruby renders were
captured from.

    npx vitest run --config docs/runs/adversarial-port-v2-20261026/probes/vitest.probe.config.ts

One test, passed. The rendered credits, verbatim:

| age | the rendered credit |
|---|---|
| 0 days | `Created by <a class="known-card" href="/Decko_Bot">...Decko Bot</a> less than a minute ago` |
| 1 day | `... 1 day ago` |
| 2 days | `... 2 days ago` |
| 35 days | `... about 1 month ago` |
| 60 days | `... 2 months ago` |
| 330 days | `... 11 months ago` |
| 366 days | `... about 1 year ago` |
| 500 days | `... over 1 year ago` |
| 1000 days | `... over 2 years ago` |

The brief's case, "about 1 month" singular, is in the rendered bytes. The
year case the first attack also named ("about 1 years") is singular too
("about 1 year", "over 1 year"), and the counts above one stay plural. The
probe's own assertion, that no rendered band carries a plural of one, passes;
the per-band report is committed at `artifacts/timeago-render-bytes.json`.

## The same surface before the fix, on record

The decision-evidence dump at the pre-fix tree
(`docs/runs/decision-evidence-d1-d2-2026-10-25/view-bytes-dump.json`, the
`Format Views Probe#view_list` entry) holds the port's own rendered bytes
from before the fix:

    port: ... <span class="card-title" title="Decko Bot">Decko Bot</span></a> about 1 months ago</div>

and the Ruby side of the same entry holds the recording's normalised phrase
(`TIME_AGO ago`), with `normalizedEqual: true`: the mask on the recording's
side is exactly what hid the divergence. At the rolled tip the same dump
(`DECKO_DUMP_FORMAT_VIEW_BYTES=1 npx vitest run
tests/card/mod-loader/card-mod-format-remaining-views-bytes-dump.test.ts`)
reads:

    port: ... <span class="card-title" title="Decko Bot">Decko Bot</span></a> about 1 month ago</div>

The committed copy of that dump is `artifacts/format-view-bytes-rolled-tip.json`.

## The source-level pins, also run here

    npx vitest run tests/card/render/text-helpers.test.ts

38 tests passed. The file carries the no-locale fallback pins the receipt
names ("1 minute", "about 1 month" at 35 days, "about 1 year" at 365 days,
and the leap-span pair "over 1 year" / "almost 1 year").

## What the fix is, in the source

`src/card/render/text-helpers.ts` - every count-bearing fallback now goes
through `englishPlural(count, one, other)`, which applies the English rule
the i18n layer uses (`count === 1` picks the `:one` leaf). The month band is
`:160-162` ("about 1 month"), the year bands `:197`, `:204`, `:210` ("about 1
year" / "over 1 year" / "almost 1 year"). The consuming surfaces are the
view_list creator credit (`src/card/render/views.ts:6332`) and the act stamps
(`src/card/mod-loader/mods/card-mod-history.ts`).

## What was tried that did not break the claim

- The rendered bytes were read from a real render (the engine's own render
  surface, the same one the recorded Ruby renders were captured from), not
  from the helper's return value.
- The scan for a surviving plural was run over the whole rendered page, not
  over one field: the only count phrase in the rendered bytes is "about 1
  month" (and the plural forms for counts above one). No "1 months", no
  "1 years", no "1 days".
- The end-to-end path was probed too: a card created through the write path
  on the local edge stack, its copy's row backdated into each band, and the
  card's page fetched. The creator credit does not render on that card's
  page in the local stack (the board's credit is a slot the page defers), so
  the end-to-end probe produced no phrase to read; the render-surface probe
  above is the one that reads the bytes. This is stated as a boundary of the
  check, not as a result.

## Artifacts

- `artifacts/timeago-render-bytes.json` - the per-band rendered credits.
- `artifacts/format-view-bytes-rolled-tip.json` - the rolled tip's own
  format-view byte dump (the port's bytes and the recording's, per view).
