# The [Family] family, tranche 7: closure evidence and three re-verified rows

Date: 2026-10-21.
Branch: `port/mods-tranche7-20261020`, based on `f90b190b` (the tranche 6 tip).
Register: `C:/localProjects/brandonDojoTech/docs/reports/decko-completeness-register-2026-10-18.md`
(the lead documentation repository holds the register; the port repository does not).
Pinned gems: `C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems`.

## The answer

**No WORKING entries remain in [Family].** Every open entry of the register's
[Family] section carries a disposition commit on one of the six family
branches, and the six entries that never carried work were graded PORTED in
the register itself. The family is closed, so this tranche ports nothing and
spends its lane re-verifying three randomly drawn closed rows.

The closure is a mechanical fact, not a reading of the commit subjects. The
audit tool committed by this lane
(`tools/audit-register-entry-dispositions.mjs`) takes the register's 33
numbered entries, takes the commits each of the six branches carries on top
of the family base commit, matches the two by the register entry number and
the mod's own port file, and prints the difference. It exits 0 only when no
open entry is left without a disposition.

## How the answer was computed

Command, run in the lane's clone at the tranche 7 tip:

```
node tools/audit-register-entry-dispositions.mjs \
  --register C:/localProjects/brandonDojoTech/docs/reports/decko-completeness-register-2026-10-18.md \
  --base 2303df28 \
  --branch origin/port/mods-first-half-20261019 \
  --branch origin/port/mods-second-half-20261019 \
  --branch origin/port/mods-tranche3-20261020 \
  --branch origin/port/mods-tranche4-20261020 \
  --branch origin/port/mods-tranche5-20261020 \
  --branch origin/port/mods-tranche6-20261020
```

Exit code 0. Verbatim summary lines:

```
entries: 33
open entries in the register (PARTIAL or UNPORTED): 27 (1, 3, 4, 6, 7, 8, 9, 10, 12, 14, 15, 16, 17, 19, 20, 21, 22, 23, 24, 25, 27, 28, 29, 30, 31, 32, 33)
open entries WITH a disposition: 27
open entries WITHOUT a disposition: 0
closed-verdict entries (PORTED) with no disposition: 6
open entries whose disposition is tier 3 (file-touch only, read it): 1
open entries whose disposition commit does not touch the mod's own file: 2
FAMILY CLOSED: every open register entry carries a disposition.
```

The base commit `2303df28` is the first parent of the first family merge
(`c1a2e30b`, "Merge port/mods-first-half-20261019 into
integration/premerge-20261020"), so every commit a family branch carries on
top of it belongs to that family's lane, and the six branches are credited
in build order.

The 27 open entries are exactly the 27 entries the register grades PARTIAL.
The 6 PORTED entries (2 ace_editor, 5 bar_and_box, 11 date, 13 delayed_job,
18 help, 26 rules) never carried work, so they carry no disposition and need
none.

### Which branch dispositioned which entries

| branch | tip | entries dispositioned |
| --- | --- | --- |
| `port/mods-first-half-20261019` | `dee6ef76` | 1 account, 3 api_key, 4 assets, 7 carrierwave, 8 collection, 9 comment |
| `port/mods-second-half-20261019` | `78b92418` | 20 integrate, 21 layout, 24 permissions, 25 recaptcha |
| `port/mods-tranche3-20261020` | `4eef4f06` | 10 content, 15 email, 22 list |
| `port/mods-tranche4-20261020` | `50436719` | 30 style, 31 tabs |
| `port/mods-tranche5-20261020` | `eceb5627` | 6 bootstrap, 12 defaults, 14 edit |
| `port/mods-tranche6-20261020` | `f90b190b` | 16 follow, 17 format, 19 history, 23 markdown, 27 script, 28 search, 29 session, 32 tinymce_editor, 33 virtual |

All six tips are on the private remote, read with
`git ls-remote --heads origin "port/mods*"` (2026-10-21), and match the
tips the tranche 6 report names.

### The one attribution the audit flagged, read and confirmed

The audit reports entry 7 with a "file-touch only" attribution, because the
disposition commit `30d6b613` ("Complete the carrierwave set basket: paths,
web, file_utils") does not name the register entry in its message. Read in
full, it is a real disposition: it registers the gem's three remaining set
files (`abstract/attachment/paths`, `abstract/attachment/web`,
`all/file_utils`), cites the gem's own files, and adds a test
(`tests/card/mod-loader/card-mod-carrierwave.test.ts`).

Two dispositions do not change their mod's own port file, because the
remainder they closed was engine-side: entry 9 (`dee6ef76`, the comment
author's `Env.session` carry, landed in the action engine, the session bag
and the write routes) and entry 12 (`d9d33513`, the seed-source census,
landed in `src/card/auth/boot-seed.ts` and `src/card/auth/seed-source.ts`).
Both name their register entry explicitly in the commit message.

## The three random closed rows

The draw, over the 33 register rows, with `node:crypto` randomInt and a
Fisher-Yates shuffle:

```
node -e "const c=require('crypto');const a=Array.from({length:33},(_,i)=>i+1);for(let i=a.length-1;i>0;i--){const j=c.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}console.log(a.slice(0,3).join(','));"
```

Draw: **7, 16, 15** (carrierwave, follow, email).

Each row was re-verified with the second audit tool committed by this lane,
`tools/audit-mod-declaration-coverage.mjs`, which reads the pinned gem's set
tree and the port's mod file and compares them declaration by declaration.
The three coverage runs are in `tmp/tranche7-reverification/coverage-*.txt`
in the lane's working directory (scratch, not committed).

### Row 7, carrierwave

What the register claims (register line 151): the gem has 17 set files, 16
views and 19 events; the port registers 14 of 17 setPaths, the view list and
all 19 event declarations, with the uploader, fog, mini_magick and public
symlink surfaces named as absent.

Measured against the current tree:

- The gem has 17 set files (`find .../card-mod-carrierwave-0.20.0/set -name
  "*.rb"`), 11 unique view names and 19 unique event names.
- The port registers **17 of 17** set paths. The register's "14 of 17" is
  stale: the tranche 1 commit `30d6b613` closed the basket.
- All 19 gem event names are registered port side, plus the 10 card-mount
  dynamic event names the gem declares by template.
- 10 of the 11 unique view names are registered. The one that is not is
  `content`, whose only Ruby declaration is the css-format pair at
  `card-mod-carrierwave-0.20.0/set/type/image.rb:100-107`. See the finding
  below.
- The named absences still hold and are still named in the port file's own
  NOT-ported block (`src/card/mod-loader/mods/card-mod-carrierwave.ts`).

Tests run (this lane, at the tranche 7 tip):

```
npx vitest run tests/card/mod-loader/card-mod-carrierwave.test.ts \
  tests/card/mod-loader/card-mod-carrierwave-events.test.ts \
  tests/card/mod-loader/card-mod-carrierwave-when-predicates.test.ts \
  tests/card/mod-loader/card-mod-carrierwave-css-format-views.test.ts
```

Result: 4 files passed, 86 tests passed.

### Row 15, email

What the register claims (register line 233): the gem has 14 set files and 6
views; the port registers 14 of 14 setPaths; the one remainder the file
still named was `abstract/test_context`'s `format :email_html` view `:core`
(`process_content render_raw`), which the register recorded as NOT ported.

Measured against the current tree:

- The gem has 14 set files and 6 unique view names, no events.
- The port registers **14 of 14** set paths and all 6 view names. The
  coverage run reports no gaps at all.
- The register's named remainder is closed: the port registers
  `abstract/test_context` with an `email_html` format block carrying
  `:core` (`src/card/mod-loader/mods/card-mod-email.ts:357-360`), which is
  the tranche 3 commit `99483a6a`. The port file documents the seam at
  lines 50-62 and 190-199.
- The register's per-entry text still says that view is NOT ported. That
  text is stale (see "The register is one tranche behind" below).

Tests run (this lane, at the tranche 7 tip):

```
npx vitest run tests/card/mod-loader/card-mod-email.test.ts \
  tests/card/mod-loader/card-mod-email-raw-oracle.test.ts \
  tests/card/mod-loader/card-mod-email-test-context-email-html-core.test.ts
```

Result: 3 files passed, 27 tests passed.

### Row 16, follow

What the register claims (register line 253): the gem has 32 set files, 10
events and about 26 views; the port registers 23 of 32 setPaths, 19 views and
all 10 event names; the named absences are the follow link's bootstrap modal
machinery and the json `follow_status`, where the gem body itself calls a
missing method.

Measured against the current tree:

- The gem has 32 set files, 21 unique view names and 10 unique event names.
- The port registers **23 of 32** set paths, exactly the register's number.
- The port registers **19** unique view names, exactly the register's
  number. The two gem view names with no port registration are `followed`
  and `unfollow_url`, and both are named in the port file's NOT-ported block
  (`src/card/mod-loader/mods/card-mod-follow.ts:82-99`).
- All 10 gem event names are registered port side.
- The register's modal absence is withdrawn by the tranche 6 commit
  `86035d8f`: the port file now states that `follow_modal_link` has no
  caller in the pinned gemset, and the json `follow_status` stays a named
  skip because both concrete classes raise `NoMethodError` on the class
  call. The Ruby-source capture that pins that fact is committed
  (`tests/card/mod-loader/oracle-capture-follow-link-remainder.rb`, with
  its fixture `tests/card/mod-loader/fixtures/follow-link-remainder.json`).
- The register's read-path claim holds: `src/card/follow/follow-rule-walk.ts`
  and `src/card/notify/follower-resolver.ts` are present in the tree.

Tests run (this lane, at the tranche 7 tip):

```
npx vitest run tests/card/mod-loader/card-mod-follow.test.ts \
  tests/card/mod-loader/card-mod-follow-views.test.ts \
  tests/card/mod-loader/card-mod-follow-remainder-census.test.ts \
  tests/card/mod-loader/card-mod-follow-harness-probe.test.ts
```

Result: 4 files passed, 37 tests passed.

## The one finding this lane landed

The row 7 re-verification found one thing the register and the port file
both left unnamed: the carrierwave gem's `set/type/image.rb:100-107`
declares a `format :css` block with two views, `:core` (`handle_source`)
and `:content` (`render_core`). The port registers no css-format view for
`type/image`, and no file named the surface.

The lane measured whether any pinned path reaches it. A committed Ruby
capture
(`tests/card/mod-loader/oracle-capture-carrierwave-css-format-views.rb`,
run against the pinned gems, output committed as
`tests/card/mod-loader/fixtures/carrierwave-css-format-views.json`) reports
every css-format render site in the pinned gemset: five of them, the
AssetInputter and AssetOutputter `include_set` lines on `type/css`,
`type/scss`, `type/skin`, `type/bootswatch_skin` and
`type_plus_right/set/style`, plus card-mod-email's
`:email_stylesheet.card.format(:css).render_compiled`. Every one of them
renders a css, scss, skin, bootswatch_skin or stylesheet card. No pinned
path renders an image card in the css format, so the two declarations are a
latent surface.

Landed: the port file names the surface in its NOT-ported block
(`src/card/mod-loader/mods/card-mod-carrierwave.ts:72-83`), and a new test
(`tests/card/mod-loader/card-mod-carrierwave-css-format-views.test.ts`, 3
tests) pins both halves of the measurement, so the name cannot quietly
disappear and the port's `type/image` registration is checked to carry no
css format. The finding is a named remainder, not a ported surface: no
Ruby bytes were captured for a css render of an image card, because no
pinned path produces one.

## The register is one tranche behind

The register file itself was last edited on 2026-10-19
(`git log --oneline -- docs/reports/decko-completeness-register-2026-10-18.md`
in the lead documentation repository). The tranche 3 to tranche 6
dispositions of 2026-10-20 were never folded back into it, so its per-entry
text still carries pre-tranche claims for at least entries 7, 15 and 16.
The corrections live in the port repository: in each disposition commit's
message and in the port file's own header. This lane did not edit the lead
documentation repository; that file belongs to the lead documentation lane,
and the finding is reported here instead.

## What this lane did not run

- The full correctness gate (`npm test`, `node tools/test-gates.mjs run
  correctness`) was not run. The mod-loader directory was run instead:
  `npx vitest run tests/card/mod-loader/` gives 148 files passed, 2112
  tests passed, 1 skipped. The skip is the corpus-gated block in
  `tests/card/mod-loader/parityfix-row7-mod-edit-gemspec-summary.test.ts`,
  which needs the raw-ground-truth corpus a clean clone does not have.
- `npx tsc --noEmit` reports 3 errors, all in
  `tests/card/actions/write-path-races.test.ts`, a file this lane did not
  touch and which is unchanged from the base commit (`git diff --stat
  f90b190b -- tests/card/actions/write-path-races.test.ts` is empty). No
  error is in a file this lane added or changed.
- No view was rendered against a live Ruby deck. The Ruby side of every
  measurement in this report is a read of the pinned gem source, and the
  one Ruby capture that was run is the committed source-reading script
  above.

## Layout

The ask named a worktree directory, `git worktree add` is gate-blocked on
this machine, and the work therefore ran in a local clone:

- Clone: `C:/localProjects/decko-ts-mods-tranche7-20261020`, created with
  `git clone --local C:/localProjects/decko-ts-release-lead
  C:/localProjects/decko-ts-mods-tranche7-20261020`.
- The clone's `origin` was repointed at the private remote
  (`https://github.com/KatsuJinCode/decko-ts`) and a `local` remote was
  added for the source repository.
- Branch: `port/mods-tranche7-20261020`, created from `f90b190b` with
  `git switch -c port/mods-tranche7-20261020 f90b190b`.
- `node_modules` in the clone is a directory junction to
  `C:/localProjects/decko-ts-release-lead/node_modules`, so the tests run
  against the same dependency tree the lead repository uses.
- The clone directory is scratch and is retired when the tranche merges.
