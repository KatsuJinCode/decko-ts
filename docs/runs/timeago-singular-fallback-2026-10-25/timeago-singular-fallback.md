# Timeago singular wording: the pinned Ruby answer and the port's fallback fix

The Decision 2 evidence left one item open: the port prints
"about 1 months ago" on a singular count, and the recorded captures mask
`time_ago_in_words` output by design, so Ruby's exact wording was not
recoverable from them. This lane answers it from the pinned oracle gems
and fixes the port's pluralization at the point that produces the wrong
bytes. The draft question to Ethan about what his code prints is
answered by this receipt: Ruby prints the singular forms below, no boot
required to prove it.

## The pinned-source answer

Oracle: C:/localProjects/decko-ruby-oracle-gems (card-1.110.0 stack,
actionview 7.2.4). The helper is plain, deterministic Ruby; no boot is
needed.

`ruby/3.4.0/gems/actionview-7.2.4/lib/action_view/helpers/date_helper.rb:95-165`
`#distance_of_time_in_words` picks an i18n key per distance band:

- line 131: 30..60 days -> `locale.t :about_x_months, count: (distance_in_minutes.to_f / 43200.0).round`
- line 133: 60..365 days -> `locale.t :x_months, count: (distance_in_minutes.to_f / 43200.0).round`
- line 183-185: `#time_ago_in_words` is `distance_of_time_in_words(from_time, Time.now, options)`

The strings come from
`ruby/3.4.0/gems/actionview-7.2.4/lib/action_view/locale/en.yml`:

- lines 24-26: `about_x_months: one: "about 1 month"` / `other: "about %{count} months"`
- lines 27-29: `x_months: one: "1 month"` / `other: "%{count} months"`

i18n's English rule (count == 1 picks the `:one` leaf) makes the exact
rendered strings for the decko render sites:

- 30..45 days (count rounds to 1): **"about 1 month ago"**
- 45..60 days: "about 2 months ago"
- 60 days..1 year: "N months ago" (count 2..12, never singular)

The decko render sites append " ago" around the helper:

- `card-mod-history-0.20.0/set/all/history_board.rb:2-8` (`view :creator_credit`,
  the view_list creator credit): `"Created by #{nest card.creator, view: :link} #{time_ago_in_words(card.created_at)} ago"`
- `card-mod-history-0.20.0/lib/card/act/act_renderer.rb:105-109`
  (`#edited_ago`, the act stamp): `"#{time_ago_in_words(@act.acted_at)} ago"`
- `card-1.110.0/mod/core/set/self/trash.rb:18`: `"#{time_ago_in_words(card.updated_at)} ago"`

Version note: the port cites actionview 7.2.3.2 and the oracle carries
7.2.4. The `datetime.distance_in_words` block is byte-identical between
the in-repo fixture
`fixtures/vendor/actionview-7.2.3.2-locale-en.yml` and the pinned 7.2.4
gem file (diffed this session, empty diff).

## The port's mechanism

All relative-time rendering funnels into
`src/card/render/text-helpers.ts` `distanceOfTimeInWords` (the
card-mod-history `timeAgoInWords` at
`src/card/mod-loader/mods/card-mod-history.ts:1278` delegates to it).
Each band returns through `lookupOrFallback(key, opts, fallback)`:
translate when the locale carries the key, otherwise render the
hardcoded fallback literal.

No production code loads any locale: `loadLocaleFile` /
`loadLocaleFromString` (`src/card/i18n/i18n.ts:72,78`) have test-only
callers (`tests/card/i18n/i18n.test.ts`,
`tests/card/mod-loader/card-mod-edit-views.test.ts`). In every live
render the translations map is empty, `tExists` fails, and the fallback
literal IS the rendered bytes. The fallbacks hardcoded the plural form
unconditionally, so a singular count rendered "about 1 months". The
byte-pinned view suite knew this and routed around it: its harness loads
the actionview locale explicitly with the comment "the distance_in_words
:one forms the creator_credit/act pills read - 'about 1 year', not the
fallback's 'about 1 years'" (`tests/card/mod-loader/card-mod-edit-views.test.ts:232-246`).

Consuming surfaces (all through the shared helper):

- `src/card/render/views.ts:6332` (view_list creator credit)
- `src/card/mod-loader/mods/card-mod-history.ts:1301` and `:1891`
  (`edited_ago`, the act stamp the conflict view shows)
- `src/card/mod-loader/mods/card-mod-history.ts:2290` (act list stamp)

## Before / after

Before (unfixed source, this session, `npx vitest run
tests/card/render/text-helpers.test.ts`, one assertion per pin):

- expected '1 minute', received "1 minutes"
- expected 'about 1 month', received "about 1 months"
- expected 'about 1 year', received "about 1 years"
- expected 'over 1 year', received "over 1 years"

After: the same run passes (38 of 38; the file grew from 34 to 38
tests). The fix makes every count-bearing fallback singular-aware with
an `englishPlural(count, one, other)` selector
(`src/card/render/text-helpers.ts:291`) that applies the same English
rule the i18n layer uses (`count === 1` picks the `:one` leaf), so the
no-locale path now renders the exact bytes the pinned en.yml carries:

- `text-helpers.ts:109,132` "1 minute"
- `text-helpers.ts:144` "about 1 hour"
- `text-helpers.ts:154` "1 day"
- `text-helpers.ts:160-162` "about 1 month" (the Decision 2 case)
- `text-helpers.ts:168` "1 month"
- `text-helpers.ts:197,204,210` "about 1 year" / "over 1 year" /
  "almost 1 year"

## The pinned test

`tests/card/render/text-helpers.test.ts` (extended in place; the file
was already gate-classified):

- `:186` locale path, 30..45 days -> "about 1 month"
- `:258-282` five no-locale fallback pins: "1 minute" (60..89s),
  "about 1 month" (35 days), "about 1 year" (365 days), and the leap-span
  pair "over 1 year" (2024-01-15 + 660000 min) / "almost 1 year"
  (+526000 min, minutesWithOffset 524560). The year examples reproduce
  the Ruby leap-year discount (date_helper.rb:140-145) so the singular
  `:one` forms are reachable deterministically.

## Verification this session

- `npx vitest run tests/card/render/text-helpers.test.ts`: before 4
  failed / 32 passed, after 38 passed.
- `npx vitest run tests/card/mod-loader/card-mod-edit-views.test.ts`
  (byte-exact captured views through creator credit and act pills):
  14 passed.
- `npx vitest run tests/card/mod-loader/card-mod-history-views.test.ts
  tests/card/mod-loader/card-mod-history-ladder-views.test.ts`: 15 passed.
- Full correctness gate (`npm test`, tools/test-gates.mjs run
  correctness): exit code 0 (the gate exits nonzero on any failure);
  its captured tail carries no nonzero failed counts and ends
  `"pass":true`.

## Ripple statement

With a locale loaded (the byte-pin harnesses) nothing changes: the
lookup path was already byte-exact. Without a locale (production), the
five singular forms change from the wrong bytes to the oracle bytes;
plural forms are untouched. No other rendered surface computes
relative-time wording outside this helper (repo-wide grep for hardcoded
month strings in src/ hits only text-helpers.ts).

The deeper seam stays open for a later lane: production boots no i18n
locale at all, which is why a fallback path carries render bytes in the
first place. After this fix the fallback and the en.yml agree for
English, so loading the locale at boot is behaviorally inert for these
strings; the harness workaround at card-mod-edit-views.test.ts:232-246
is now redundant but harmless.

## Provenance

Branch `port/timeago-plural-20261026`, base
86e147b676f95dba89f369a8d5ee97b4b8fe543e
(`port/d1d2-verify-20261025`, the newest pushed tip of the Decision 2
line; it sits directly on the v23 candidate roll
`deploy/full-candidate-20261102` at c29e4c3f4). The brief's "fresh
exclusive clone" could not be a clone: the machine's clone guard blocks
a second clone of this repository. The exclusive workspace is instead a
diskSteward-leased worktree at C:/localProjects/decko-ts-timeago-20261026
sharing the decko-ts-release-lead object store, on the same pushed base
(verified with ls-remote plus a per-tip committer-date sort over all 654
pushed heads).
