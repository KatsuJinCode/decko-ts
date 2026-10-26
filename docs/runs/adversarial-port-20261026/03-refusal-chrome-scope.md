# Receipt 3: the refusal-chrome fix's scope, measured against every refusal step

Claim attacked: the refusal-chrome finding (TRACE-COMPARISONS.md item 5,
FORMAT-19-SURFACES.md item 3) reads as one difference on one step ("the
type-change refusal's page body"), and the fix branch
(`port/refusal-chrome-20261026`, commit `1fb083f9e`) is described as closing
"the 381-byte bare document". The brief's attack question: does the fix hold
for OTHER write refusals, or only the type change?

## Verdict: BROKE (the difference is a class of 25 steps; the fix closes 4)

The bare refusal is not specific to the type change. At the tip, EVERY
refusal step in the recorded battery answers a bare document or an empty
body where Ruby renders the full 16,000-plus-byte site page. The fix branch
closes exactly the non-ajax 422 class and leaves the 403 denials, the 404s
and the excluded 422 arms bare, measured with the fix branch's own build.
None of this is visible to any pinned suite, because the comparator
normalizes it away by its own documented rule.

## Method

The comparator's own header states the normalization
(`tools/parity-side-effects/compare.mjs`, the "Normalisations" block):
"error pages: Ruby renders errors inside the deck layout, the port as a bare
page; only the message text is compared." So the battery's PASS verdicts say
nothing about refusal-page bytes. This lane compared the RAW bodies instead:
the recorded Ruby oracle
(`reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json`)
holds every step's full response body; the port's trace from the receipt's
own driver holds the port's. Both sides' bytes were compared per step
(length, then byte equality), at the tip and again at the fix branch.

Commands (attack worktree, tip dist; both exit 0):

    node tools/parity-side-effects/ts-drive.mjs \
      reference-harness/fixtures/write-battery-v1/deck/deck.sqlite3 \
      tmp/attack-20261026/tip-work > tmp/attack-20261026/ts-trace-tip.json
    node tools/parity-side-effects/compare.mjs \
      reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json \
      tmp/attack-20261026/ts-trace-tip.json tmp/attack-20261026/compare-tip.json

Comparator headline reproduced at the tip: `80 pass / 7 declared / 0
mismatch` (and event order 81/81) - the receipts' numbers are real. The raw
table underneath them is not: full per-step table committed at
`artifacts/raw-body-table-tip.json` (49 of 87 bodies byte-identical).

## The tip's raw facts (oracle body vs port body)

25 of the 87 steps carry refusal statuses. Sample, all at status parity:

| step | status | Ruby body | port body |
| --- | --- | --- | --- |
| get-missing | 404 | 16,756 | 0 (empty) |
| anon-session-card-read | 404 | 16,796 | 0 (empty) |
| anon-create-card | 403 | 16,760 | 212 |
| anon-update-card | 403 | 16,760 | 212 |
| anon-create-type | 403 | 16,732 | 208 |
| after-signout-write | 403 | 16,778 | 215 |
| leaver-close-account | 403 | 4,695 | 214 |
| anon-delete-missing | 422 | 16,033 | 322 |
| create-duplicate-name | 422 | 16,555 | 425 |
| signin-unknown | 422 | 16,063 | 383 |
| signup-short-password | 422 | 16,208 | 468 |
| upload-corrupt-image | 422 | 16,511 | 384 |
| admin-skin-type-change | 422 | 18,722 | 381 |

(the full 25-row list is in the artifacts). That is 24 refusal steps beyond
the one instance the receipts enumerate. The register draft
(`ethan-divergence-register-2026-10-26.md`) lists no refusal-chrome entry,
so by the register's own rule ("anything not listed here is meant to behave
exactly as Ruby Decko does; an unlisted difference is a defect") these are
defects, not declared divergences. The remaining 13 body differences are
read/other steps (bundle URLs, page-assembly sizes, the declared
one-segment `.json` step); they are the format fixtures' normal territory
and are not claimed as new findings here.

## The fix branch, measured

The fix branch's build (`npm run build:engine` at
`C:/localProjects/decko-ts-attack-fixrun-20261026`, worktree at `1fb083f9e`)
was driven through the identical 87 steps. Comparator headline unchanged:
80/7/0, and `admin-skin-type-change` now PASS with an empty diff bag. Raw
bodies (full table at `artifacts/raw-body-table-fix.json`, 49 of 87
byte-identical):

- Grew to full pages (the fix working): `admin-skin-type-change` 381 ->
  18,318 (Ruby 18,722; the fix's receipt accounts for the residue as
  engine-local head/asset bytes), `rename-to-existing` 425 -> 16,213 (Ruby
  16,619), `anon-approve-signup` 362 -> 15,624 (Ruby 16,028),
  `admin-update-layout-no-main` 416 -> 2,933 (Ruby 3,976; closer, not
  byte-equal, not claimed byte-identical by anyone).
- Still bare at the fix commit: every 403 (212-215 bytes vs Ruby's
  4,695-16,778), every 404 (0 bytes vs 16,756-16,796), and the 422 arms the
  fix's own gate excludes (`signin-*` 351-383, `signup-*` 322-468,
  `create-*` 315-426, the delete refusals 322, `upload-corrupt-image` 384,
  and the JSON arms).

The scope is exactly what the fix's code says: the page arm fires only for
`!json && !isAjax && errorStatus(error.code) === 422 && route.mark !==
undefined` with an existing acted-on card (`write-routes.ts` at `1fb083f9e`,
the `renderRefusalPage` gate). So the answer to the attack question is: the
fix holds for its own class only. A reader who hits a permission-denied
write (403), an unknown-card write (404), a sign-in or sign-up validation
failure, or any ajax save refusal still sees the site vanish into a bare
alert document, where the recorded Ruby site renders every one of them
inside the full page.

## What an author would take from this

Before posting, either land the page arm for the whole refusal class (the
403 and 404 lanes and the excluded 422 arms each need the same rescue
render Ruby's `handle_exception` gives every error) or list the remaining
bare classes in the register as declared divergences with the
reader-visibility stated. Posting the current receipts' reading ("the
refusal chrome" as one fixed item) invites exactly this measurement from
the other side.
