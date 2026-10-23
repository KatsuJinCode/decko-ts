# Routes tranche 10, 2026-10-22: the eight rows no tranche had landed

Lane: `port/routes-tranche10-20261022` in the exclusive lane checkout
`C:/localProjects/decko-ts-routes-tranche10-20261022`, a git worktree of the
tranche 9 lane's clone `C:/localProjects/decko-ts-routes-tranche9-20261022`,
branched at that branch's tip `fe7b1669a` (the tranche 9 landing and cleanup
receipt). The worktree was created through the machine's own sanctioned entry
point, `C:/localProjects/diskSteward/agent/create_worktree.py`, which admits
the checkout against the disk reserve and records custody. Every commit is
pushed forward-only to origin (KatsuJinCode/decko-ts, private).

## Why this tranche is not the tranche the ask named

The ask this lane was handed said: "the register-routes family (72 rows) has
64 adjudicated; the last eight are E6 through E13", and it named the branch
`port/routes-tranche9-20261022` from `eb02e31fd`.

**BOTH of those were already done before this lane started, and the second one
is wrong.**

1. The branch the ask named was ALREADY LANDED, by a concurrent lane, three
   and a half hours before this lane's first commit. `git log` on
   `origin/port/routes-tranche9-20261022` at this lane's start showed nine
   commits on top of `eb02e31fd`: rows E6, E7, E8, E9, E10, E11, E12 and E13
   (one commit each, `82c17f0d2` through `cb948981b`) and the tranche 9
   landing and cleanup receipt (`fe7b1669a`). This lane's own first push was
   refused as a non-fast-forward, and force is forbidden, so this lane did
   not push to that branch and did not try to.

2. The row list the ask carried is WRONG, and this lane re-derived it. The
   family has 72 rows. Reading the family's OWN commit subjects (the commits
   whose subject begins with "[Family]") and counting the DISTINCT
   register-routes row ids they name gives:

   | Branch tip | Distinct row ids named by the family's own commits |
   | --- | --- |
   | `port/routes-tranche5-20261021` | 32 |
   | `port/routes-tranche6-20261021` | 40 |
   | `port/routes-tranche7-20261021` | 48 |
   | `port/routes-tranche8-20261022` | 56 |
   | `port/routes-tranche9-20261022` | 64 |

   So the tranche 8 receipt's "64 of the family's 72 rows are adjudicated" is
   one tranche early: at the tranche 8 tip the count is 56, not 64. The
   earlier receipts' arithmetic comes from a LOOSER pattern (every commit
   subject in the history, not only the family's own), and that looseness
   counts OTHER families' rows ("E18: pin the measured same-account stale
   edit replay", "Credit E11 and E15", "E21 board History tab", and so on),
   which is why it cannot say which register-routes rows are adjudicated.

   The eight rows that NO tranche has landed are therefore **A23, B7, B10,
   B11, C16, C17, D4 and D5** - and they are NOT the E rows the ask named.
   This tranche landed those eight, one commit each.

The E rows the ask named are adjudicated on the branch the ask named. This
lane's own work is on a NEW branch (`port/routes-tranche10-20261022`) so the
two never collide, and the ask's intent (close the register-routes family)
is served by closing the eight rows that are actually open.

## The eight rows, one landing each

| Row | Commit | Disposition |
| --- | --- | --- |
| A23 the deck app template's Jasmine mount | 69c0c1e19 | MEASURED SKIP-AND-NAME, and the skip is now a measurement. The pinned card gem's own generator template mounts a second engine (`mount JasmineRails::Engine => "#{rel_root}/specs"`) in the generated deck APP's routes, behind two conjuncts, one of which is a constant. The capture SCANS the whole pinned gemset (151 gems) for that constant: it appears in three places, all of them the pinned card gem's own files (the template's own two lines and the card gem's test environment's asset line), and NO gem in the gemset is a jasmine gem, so `Object.const_defined?(:JasmineRails)` is false and the mount line is never reached. The pinned router's own answer at the mount's path is a card read; /jasmine/... is the deck's own deprecated asset arm. The port has no spec-runner engine and names none in its serving code. |
| B7 the read path's Token authenticator | 511201b46 | PORTED, measured, with TWO NAMED REMAINDERS. The pinned actionpack's own Token module over fifteen header shapes and the pinned card gem's own Card::Auth::Token over six tokens are the committed capture; this row adds the port's own read path (the shared module, the edge read path, the staging host, all three running the pinned grammar) and pins the two remainders the row left open: the WRITE path's own header grammar is case-INSENSITIVE and implements none of Ruby's pair delimiters, and the CLOUDFLARE SHELL has no session surface at all. |
| B10 initial_setup? -> prepare_setup_card! | badc716a1 | PORTED, measured, with the DIVERGENCE NAMED. The capture EXECUTES the pinned deck's own implicit_mark (mark.rb:28-40) over four cells: with the census open and an HTML request the method answers the EMPTY mark and puts the setup card and the "setup" view in the params; with the census closed, or with a non-HTML request, it answers the HOME mark. The pinned setup surface is therefore the IMPLICIT MARK (the root), not a path: the pinned router answers /setup with the mark arm, a card read of a card named "setup" that no deck carries. The port's surface is a dedicated path behind an operator's env gate, and the port's own source says so ("Ruby has no env gate: needs_setup? is purely the census"). |
| B11 load_action and the edit draft | 4ad74abed | MEASURED SKIP-AND-NAME, with the seam named. The pinned load_action, EXECUTED over four cells, loads the last draft only when params[:edit_draft] is TRUTHY and the card has drafts; the string "false" is a truthy string, so the cell that passes edit_draft=false LOADS THE DRAFT, and with two drafts it is the SECOND one's content. The port has the emitter (the history mod's "continue editing" anchor) and the helper (draftActs), and NO file under src/ reads the parameter back. The row's fix is NOT landed and this commit says so. |
| C16 the CSRF/origin posture | 13034bd7d, a7f289d99 | PINNED DIVERGENCE, the accepted one. The measurement behind the Ruby cell: over the whole pinned gemset the deck's own gems carry FOUR forgery references in TWO files and every one of them DISABLES protection, and no protect_from_forgery or verify_authenticity_token appears in the deck's own gems at all; the machinery (67 further references) is in the framework gems. The port's half is RUN: a cross-site request is refused with a reason, a same-origin request passes, and DECKO_ORIGIN_CHECK=off restores Ruby's behaviour exactly - the switch docs/SECURITY.md's approved-divergences table names. The second commit is a correction the tsc run found: the test had passed a `method` the port's own OriginRequest type does not carry. |
| C17 Token auth and X-API-Key on reads | ec54933c5 | MEASURED SKIP-AND-NAME, with the two missing pieces named. The pinned api_key gem's own authenticators and sign-in: the order is token, then api_key, then session (a token AND a key together answer the TOKEN arm), and a key with no account is a REFUSAL with the gem's own message. The port's arm is not written, and the two pieces are named at the source: the READER (no file under src/ reads the X-API-Key header; the header is named in two files, both in prose) and the CARD-SIDE LOOKUP (the pinned gem finds the account by CONTENT, and the port's fetch layer reads by id and by name and has no content search). |
| D4 the file sender for an unregistered suffix | 5a4363f4e | MEASURED SKIP-AND-NAME, with the port's grammar RUN. The pinned dispatch sends an unregistered suffix to the FILE format and the file format at 200 IS the file sender, sending the bytes; the deck's own explicit file route is the /files/ shape. The port's read grammar, run over the paths, does NOT split the .bin suffix (it is the card named "Alpha.bin", which no deck carries, so the request 404s) and splits the .json suffix only when the request names a json view. The row's arm is not landed. |
| D5 the URL format registry and its negotiation | fe3d825fa | MEASURED SKIP-AND-NAME, with the port's grammar RUN. The pinned registry carries THIRTEEN names, each answering its own format with its own mime type (css is text/css, scss is text/x-scss, jsonld is application/ld+json), and the pinned router's own answer at every one of those card URLs is the SAME card read arm. The port's grammar splits NONE of the row's ten names, and knows two suffixes (rss, and json with an explicit view). The port DOES carry the format views, so the missing piece is the DISPATCH, not the formats. |

## The instrument: what was shared, what was added, what was not touched

The shared loading rig
(`tests/server/oracle-capture-pinned-deck-harness-ruby.rb`), the shared
candidate reduction
(`tests/server/pinned-route-table-candidate-reduction-ruby.rb`) and the
port-only rows' support file
(`tests/server/pinned-port-only-route-absence-ruby.rb`) are UNTOUCHED by
every commit in this tranche. The pinned-rails route recognition support file
(landed by the tranche 9 lane) is also untouched.

One new SUPPORT-CAPTURE landed with row A23:
`tests/server/oracle-capture-register-routes-remaining-eight-ruby.rb` (with
its fixture `fixtures/captured/register-routes-remaining-eight-ruby-oracle.json`).
It draws the PINNED deck's own route table into a REAL pinned-rails route set
(the pinned actionpack-7.2.4 that carries Journey) and asks the PINNED router
to recognize each probe path with each probe verb, and it EXECUTES the two
pinned methods the family had no capture for: the card gem's own generator
template (with the whole-gemset scan for the constant the mount is
conditional on) and the pinned deck's own implicit_mark.

The rows whose pinned method was ALREADY captured keep that capture: B7
(`oracle-capture-request-authenticators-ruby.rb`), B11
(`oracle-capture-load-action-ruby.rb`), C16
(`oracle-capture-forgery-posture-ruby.rb`), C17
(`oracle-capture-api-key-authenticators-ruby.rb`), D4 and D5
(`oracle-capture-format-registry-ruby.rb`,
`oracle-capture-explicit-file-route-ruby.rb`).

## Captures (byte-stable on re-run, verified this session)

The tranche's own capture regenerates byte-identically: the fixture's md5 is
`e2d703a6b2e7c1218b3f16615a3a1706` before and after a second run, and
`git status` is clean afterwards.

## Battery (final state, run this session, exit codes and counts read directly)

- **The touched-file battery** (the ask's own named check): the eight rows'
  eight new test files -> **8 files passed, 75 tests passed, 0 failed**
  (4.5s). Re-run after the row C16 correction: **1 file passed, 9 tests
  passed, 0 failed** for that file.
- `npx vitest run tests/server/`: **124 files passed, 1 skipped (125); 1220
  tests passed, 14 skipped.** The one skipped file is
  `tests/server/edit-session-replay.test.ts`, which the runner reports as
  "needs data or setup that a clean clone does not have". NO failure
  appeared in this run.
- `npx tsc --noEmit`: **exit 0, clean, read directly from tsc**, at the
  tranche tip. The FIRST tsc run in this lane was NOT clean: it found three
  real type errors in the row C16 test (the port's `OriginRequest` carries a
  headers bag and a host, and no method), which is why the row C16
  correction commit exists.
- Nothing deployed. No live host was contacted, and no metered database was
  touched: every measurement in this tranche ran against the local pinned
  gemset or the port's own source.

## What this tranche did NOT land, named

- **B11** the edit-draft consumer in the read path.
- **C17** the X-API-Key read arm (the reader and the card-side content
  lookup).
- **D4** the file-sender arm for an unregistered suffix in the read path.
- **D5** the format-negotiation arm for the ten names the row names.
- **B7** the write path's header grammar and the Cloudflare shell's session
  surface (named remainders of a ported row).
- **C16** the operator's ruling on the forgery posture (the pin and the
  switch are on the record; the decision is the operator's).

Each of those is a PORT change, not a measurement, and each is named with
the exact seam in the row's own commit message.
