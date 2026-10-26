# Receipt 2: the 12-of-13 byte equality, attacked through the mask

Claim attacked (Decision 2 evidence, FORMAT-19-SURFACES.md, Layer 2):
"12 of 13 normalize-equal (the normalization is the capture's own documented
one: DB-local ids, slot ids and relative times are masked on BOTH sides)".
The receipt itself flags the open item: "the port renders `about 1 months
ago` ... Ruby's own wording is NOT recoverable from these fixtures ... this
lane could not verify Ruby's side from recorded material."

## Verdict: BROKE (the mask hides a real, reader-visible difference)

The relative-time mask hides a pluralization divergence that is live in the
shipped engine: for relative ages of one month or one year the port prints
"1 months" / "1 years" where Ruby prints the singular. Ruby's side, which
the receipt could not recover from the masked fixtures, is recoverable from
the repo's own UNMASKED Ruby captures of the same helper family, and the
port's side is verified by direct execution of the shipped build.

## The evidence chain, each link run or read in this lane

1. **The masked region, from the receipt's own artifact.**
   `decision-evidence-d1-d2-2026-10-25/view-bytes-dump.json`, entry
   `Format Views Probe#view_list`: Ruby's captured bytes carry
   `... TIME_AGO ago</div>` where the port's bytes carry
   `... about 1 months ago</div>`. Entry `Conflict Probe#conflict`: Ruby
   `TIME_AGO ago`, port `28 days ago`; the same entry's one residual
   difference is the slot's deck-local `action_id` (5098 vs 2), as the
   receipt says. The `28 days` wording is correct Rails wording (the
   x_days bucket, count 28) - no difference there. The month bucket is the
   difference.

2. **Ruby's real wording, from the repo's own unmasked capture.**
   `fixtures/captured/board-views.json` (the board-views capture, Ruby's
   recorded bytes, ages NOT masked) carries, from the same Rails helper
   family on the same surfaces:
   - `Created by ... 10 days ago` (Oracle Basics history_tab),
   - `#1 Decko Bot <small>1 day ago</small>` (singular, correct),
   - `Created by ... about 1 year ago` (Home history_tab; singular,
     correct).
   Ruby's captured wording pluralizes correctly in every recorded bucket.

3. **The port's shipped wording, by direct execution.** Nothing in the
   shipping source loads the actionview locale that would supply the
   plural forms: `loadLocaleFromString` / `loadLocaleFile` /
   `setDefaultLocale` have no caller in `src/` (only tests import them,
   e.g. `tests/card/render/text-helpers.test.ts:59`; the one src mention in
   `card-mod-date.ts:67` is a comment pointing at the test). So the
   fallback literals at `src/card/render/text-helpers.ts:147,152,178`
   are the shipped bytes. Executed against the tip's built distribution:

       node -e "import('./dist/src/card/render/text-helpers.js').then(m=>{ ... })"
       40 days  -> about 1 months
       28 days  -> 28 days
       1 day    -> 1 day
       400 days -> about 1 years

   The test suite's own embedded copy of actionview's en.yml
   (`tests/card/render/text-helpers.test.ts:18-52`) documents what the
   locale would say: `about_x_months: one: "about 1 month"`,
   `about_x_years: one: "about 1 year"` - the singulars the fallback never
   produces.

4. **Why the suites cannot see it.** The pinned suites normalize the age to
   a `TIME_AGO` token on both sides (the capture writes Ruby's bytes with
   the mask already applied; the dump test masks the port's side the same
   way), and the raw dump table grades normalized equality. The 12-of-13
   number is true at the masked level; it is also the number that hides the
   month-bucket and year-bucket wording, which a reader of any page
   rendering such an age (view_list credits, history stamps) sees directly.

## What an author would take from this

The 12-of-13 claim should carry the pluralization caveat as a measured
difference with Ruby's side established, not as an open eyeball item. A fix
exists on a branch (`port/timeago-plural-20261026`, commit `beef55009`:
"the timeago fallback renders Ruby's singular bytes"); it is NOT an
ancestor of the tip the receipts cite (`git merge-base --is-ancestor`
exits non-zero), so the tip ships the divergent wording. The right closure
is landing that branch and re-pinning the fallback bytes.
