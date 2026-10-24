# Routes round eight, 2026-10-24: two rows close on a landed change, one closes on a measured gap, three close with their subject pinned

Lane: `port/routes-round8-20261024` in the exclusive lane checkout
`C:/localProjects/decko-ts-routes-round8-20261024`, branched at
`c3dbe428086b7df0481d9f7c7979efef881b0cf7` (the round-seven tip, the newest
pushed routes tip: `git ls-remote origin 'refs/heads/port/routes-*'`
reads `port/routes-round7-20261024` at that hash). The checkout was created
with `git init` plus a targeted fetch of that one tip and an unshallow, and
node_modules came across from the round-seven checkout (robocopy, 834 MB,
no network). Every commit is pushed forward-only to origin
(KatsuJinCode/decko-ts, private: `gh repo view KatsuJinCode/decko-ts
--json isPrivate` reads `true`).

Family state at the start of this round, read from the completeness
roster's own file (`C:/localProjects/brandonDojoTech/docs/registry/
completeness-roster.json`, `at` stamp 2026-10-24T07:19:46.942Z): 72 rows,
53 DONE, 19 WORKING ON IT, 0 BLOCKED. The ask's own count (about 22 open)
was read from the roster's earlier stamp, before the fold of the earlier
rounds' rows; the difference is the fold, not a change in the rows.

## The six rows this round took, and how they were chosen

The rows are the next six open rows in row-id order, with A12 and C10
excluded: A12 carries its operator-decision flag and C10 its measured-skip
flag, and neither is closed here. Rounds three to seven took A2, A4, A7,
A8, A9, A12, A13, A17, A18, A22, A23, B5, B6, B7, B8, B9, B10, B11, B13,
C3, C4, C5, C6, C7, C8, C10, C14, C15, C16, C17, D1 and D2. The next six
open rows in row-id order are therefore A17, A22, A23, B5, B6 and B7.

| Row | Commit | Disposition |
| --- | --- | --- |
| A17 the GET action routes | `a4830392` | CLOSE with the subject measured on the port's own write surface. The create and delete GET arms are NAMED with their dependency: the operator's yes (they change what a plain link does to a live deck, the same class as row A12's named remainder), and the gate they would run behind is already in place. |
| A22 the wildcard route | `cb8a68d2` | CLOSE, and the cell that was named UNPINNABLE is now PINNED: the known-junction leg resolves because the harness can run the port's own boot step. Two claims on the record are corrected by that measurement. |
| A23 the Jasmine engine mount | `8741baf4` | CLOSE as a measured skip: the mount cannot fire on the pin this machine carries, and the pin's drift (151 gems against 68) is now pinned rather than described. |
| B5 the `card#asset` action | `c0e7f35e` | CLOSE ON PARITY, on a landed change: the port's stub now writes the pinned method's log line, so the method's behaviour matches in every part and not only in the HTTP-visible one. |
| B6 the `setup` before_action | `ad0bd8f1` | CLOSE with the subject measured: the refresh POLICY behind the method's second call is measured for the first time, and the port's marker lifetime is NAMED. The edge host's missing seam stays named with its price. |
| B7 the `authenticate` before_action | `5678e9f7` | CLOSE ON PARITY, on a landed change: the write path reads the pinned actionpack header grammar, so the two paths agree with Ruby on every header shape. |

**Six rows closed, five named remainders inside the closed rows** (A17's
create and delete GET arms; A22's may-create `:new-form` arm and the
staging host's status posture; B6's edge seam and the port's marker
lifetime).

One commit outside the six rows is in the branch:
`ec12835c` re-points the port's own surface quotes, because this round's
two landings moved the quoted lines (the asset stub's new constants and the
write path's new grammar). The capture was re-run and its fixture
committed, so every quoted line in it is the line the file carries now.

## What landed, row by row

### A17: the plain-link GET arms, measured on the port's write surface

The row's pins read the port's GRAMMAR. This round measures what the port
DOES with the plain-link GET spellings, over HTTP, on the write-routes
suites' own rule deck:

- the port's write surface owns NO GET create or delete arm
  (`matchRoute` answers null for `/create/New`, `/card/create/New`,
  `/delete/Target` and `/card/delete/Target`, and `handleWriteRequest`
  answers null for each), while the pinned deck's table answers every one
  of them with the mutating action (orders 19 and 22);
- the consequence: a plain-link GET to those spellings creates NO card and
  deletes NO card, and the card under test still carries its own bytes
  afterwards;
- CLOSED, a cell nobody had measured: the port DOES admit the update
  alternative on a GET, and it answers what the pinned update action
  answers. The pinned action (`card.new_card? ? create : handle {
  card.update! params[:card]&.to_unsafe_h }`) is two-armed, and the capture
  recorded both arms: an existing card answers `new_card?` then
  `update!` with a 303, and a missing card answers `new_card?` then
  `save!` (the create arm) with a 303. The port answers the 303 for both,
  with the target card in the Location, and the missing card is saved.

WHAT STAYS NAMED: the create and delete GET arms. What admitting them
would need is named so the next reader does not have to re-derive it: the
operator's yes, because a link to `/create/New` would create a card and a
link to `/delete/Front` would delete one, which is the same class of change
as row A12's named remainder; and the register's own suggested fix, to
admit the plain-link GET verbs BEHIND THE WRITE-PATH GATE, is mechanically
available now, because the write path's origin check runs on every write
route. So the cell is not blocked on machinery. It is blocked on the
operator's yes.

### A22: the known-junction leg is PINNED, and two claims are corrected

A wildcard address is a COMPOUND name: the pinned route's glob mark
carries the whole path and the slashes become the junction `+`, so
`/deep/such/card` is the card `deep+such+card`.

The pin this row carried said the compound name could not be registered in
the test harness, so the known-junction leg was unpinnable, and the deploy
wildcard suite recorded the same limit at the same place. That was wrong.
The port composes junction names at BOOT
(`src/server/worker-shared-surface.ts`, `installDeckNameEnvironment`, the
step both entries run), and the harness can run that same boot step. With
it, the compound name resolves, the page render reaches the card, and the
bad_address view renders with the PINNED body (`404: Bad Address`,
card-mod-format-0.20.0/config/locales/en.yml:3) and the pinned status
(the engine's `pageErrorStatus` = 404, the port's `root.error_status`).

SO THE LEG IS PINNED, on three surfaces: the row's own file, the edge host
(404 with the pinned text in the page chrome, not the unknown-card arm's
not_found page) and the staging host (the seeded fixture deck now carries
the junction). TWO CLAIMS ARE CORRECTED ON THE RECORD, because this
measurement falsifies them: the C15 row's pin that the compound name
cannot be resolved in the harness, and its named cell that the
known-junction leg needs a name the harness cannot register.

WHAT STAYS NAMED: the signed-in may-create `:new-form` arm (Ruby 200) at
wildcard addresses. Ruby's view gate replaces the view for an unknown main
card with `:new` for a viewer who may create and `:not_found` otherwise
(card-1.110.0 lib/card/view/permission.rb:33-44 -> format/error.rb:17-22).
The port's own counterpart carries that branch (`src/card/render/format.ts`,
`canCreate ? 200 : 404`), but it is UNREACHABLE from the render entry
points, which refuse the card first (`card not found: <name>`). That is
row C10's own named remainder, and it is this cell's dependency. Also
named: the staging host's status posture on a non-stock deck (it carries
the page's own error status only on a stock deck, so the same answer is
200 there where the pinned deck answers 404; the port's engine and the
edge host both carry it).

### A23: the mount's inertness, measured on the pin this machine carries

The mount sits behind two conjuncts, and the second one is a constant no
gem in the pin defines: the scan of the whole gemset finds the constant in
three places, all of them the pinned card gem's own files, and no gem in
the pin is named jasmine. For every deck the pin can build, the mount never
fires, so the port needs no mount.

WHAT MOVED: the pin was rebuilt smaller. The committed capture was taken
against a 151-gem gemset; the gemset this machine carries now has 68
gems. The capture's own answer does not move with the count, but the
recorded count did, so the capture was re-run and committed beside the
older one. The drift is no longer prose: the test reads BOTH captures and
asserts that they differ in the gem count ALONE, and the gem count is
cross-checked against a second capture over the same pin (the round-seven
forgery-posture capture, which records 68 gems for it), which replaces the
old floor assertion on the 151-gem count.

### B5: the asset stub logs the symlink hint

The pinned `card#asset` method does three things: it builds the fixed
body, it LOGS the symlink hint through `Rails.logger`, and it renders that
body at 404. The port answered the same body at the same status and logged
nothing, so the row's answer matched on everything HTTP-visible and the log
line was the one named divergence left.

The port's shared stub now writes the same line through the port's server
log (`src/server/server-log.ts` is the one place the port writes a server
log line, so a reader can find every line the port logs and a test can
watch them). The line is byte-identical to the one the pinned method
writes. The dependency-free Bunny reader keeps its own copy of the stub,
so it logs the same line there too, for the same reason it keeps its own
prefix list: the reader carries no imports. The Cloudflare host, the Bunny
edge and the staging host all answer the stub through the shared function,
so they log it as well.

### B6: the refresh POLICY, measured for the first time

The setup method's second call answers a POLICY question before it
refreshes anything: `Card::Assets.refresh` returns unless `force ||
refresh?`, so the policy is part of what the method does on a request. The
capture now quotes the pinned policy in full: the three modes (eager,
cautious, never), the unknown-option raise, and the cautious rule (the
shared cache must exist, and the `REFRESHED` marker is read from and
written to the shared cache).

The port's seam answers the three modes the way the pinned policy does,
and that is now pinned: eager refreshes on every request, never refreshes
on none, and cautious refreshes once and then not again, refusing without
a shared cache.

WHAT STAYS NAMED: the port's marker is held by the HOST PROCESS, while the
pinned cautious rule keeps its marker in the shared cache, where it
expires with the cache's entry and a cache clear takes it away. So the
port refreshes LESS often than the pinned deck does, and it refreshes at
least once; closing it means moving the marker into the shared cache the
port's hosts keep, which is a change to the hosts. Also named, unchanged:
the edge serving host wires no asset-input refresh seam, and its price is
named in the test (the edge's read path builds no card action engine, and
the refresh runs through it).

### B7: the write path reads the pinned header grammar

The port had TWO grammars for the same Authorization header. The read path
read the pinned actionpack one and the write path kept a grammar of its
own: case-insensitive, the header trimmed before it was matched, and a
pair grammar that read only a quoted `token="..."` pair with no pair
delimiters at all. Ruby runs ONE authenticate before_action on every
request, so the header has ONE grammar there, on the read path and the
write path alike; the port's two grammars therefore differed from Ruby in
three ways, each measured (a lower-case scheme carried a token on the
write path and carries none in Ruby; the pair delimiters split
`Token abc123, opt=1` into the token `abc123` and not the whole
remainder).

The write path now reads the shared pinned grammar, so the two paths
cannot drift apart again without a test failing. The row's own test runs
the capture's own fifteen header shapes through the WRITE path and through
the READ path, and both answer the capture's token column. Two pins
changed on purpose with the landing: the one that held the write path's
own regex on the record and the one that named the same difference.

## Captures: re-run in this lane, against the pinned gemset

Every capture below was executed against the pinned gemset at
`C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems` with Ruby
3.4.11 on PATH, no Rails and no database, and compared with its committed
fixture.

| Capture | Committed fixture md5 | Re-run |
| --- | --- | --- |
| get-action-routes (A17) | `3385ee47f540b9f3ac5f52916bf97f8a` | IDENTICAL |
| wildcard-bad-address (A22) | `e6a136ada973c35968999b4ffcc79cca` | IDENTICAL |
| jasmine-mount (A23) | `a4bfa45732795a19a56d76622e00b8b9` | DIFFERS: the gemset was rebuilt smaller (68 gems against the recorded 151), so the gem count differs. The mount's answer does not: the re-run is committed as fixtures/captured/jasmine-mount-rebuilt-gemset-ruby-oracle.json, md5 `9b9f6d81846f06dceac743fd41a2ada7`. |
| card-asset-action (B5) | `db21fd884f8243ae423c5ae7da77dadb` | IDENTICAL |
| setup-before-action (B6) | `02211ccd0f1b2d90d24b2b36558de732` | IDENTICAL to the fixture this round committed, which grew the policy section (the capture now quotes the pinned policy). The fixture before this round was md5 `8f7e340211d489fce0544f159f3fcf92`. |
| request-authenticators (B7) | `3827a7da07f0074b6e878c640462ca57` | IDENTICAL |
| register-routes-remaining-eight (the port's own surface quotes) | `1a9c7e8d00ce73300397b9b6c2c58f77` | RE-RUN and COMMITTED after the quote re-point. The fixture before the re-point was md5 `8498436ce515126b57e7625e996e33d2`, and the diff walk over the two files reports the quoted lines alone. |

## The battery (final state, run in this lane)

- **The full `tests/server/` suite**: **124 files passed, 1 skipped (125);
  1293 tests passed, 14 skipped, 0 failed**. The one skipped file is
  `tests/server/edit-session-replay.test.ts` ("needs data or setup that a
  clean clone does not have"), the same skip the round-three, round-four,
  round-five, round-six and round-seven receipts record. The count is the
  round-seven tip's 1278 passed plus this round's fifteen new legs.
- **Per row**, the touched-file battery at that row's own commit:
  - A17: `npx vitest run tests/server/get-action-routes-parity.test.ts`
    -> 1 file passed, 15 tests passed, 0 failed.
  - A22: `npx vitest run tests/server/wildcard-bad-address-parity.test.ts
    tests/server/bad-address-wildcard-view-parity.test.ts
    tests/deploy/bunny-edge-bad-address-wildcard.test.ts
    tests/deploy/staging-bad-address-wildcard-endpoint.test.ts`
    -> 4 files passed, 33 tests passed, 0 failed.
  - A23: `npx vitest run tests/deploy/jasmine-mount-inertness.test.ts
    tests/server/jasmine-engine-mount-template-parity.test.ts`
    -> 2 files passed, 14 tests passed, 0 failed.
  - B5: `npx vitest run tests/server/card-asset-action-parity.test.ts
    tests/server/deprecated-asset-routes-parity.test.ts
    tests/deploy/bunny-edge-deprecated-asset-stub.test.ts
    tests/deploy/staging-deprecated-asset-stub-endpoint.test.ts`
    -> 4 files passed, 22 tests passed, 0 failed.
  - B6: `npx vitest run tests/server/setup-before-action-parity.test.ts`
    -> 1 file passed, 13 tests passed, 0 failed.
  - B7: `npx vitest run tests/server/request-authenticators-parity.test.ts
    tests/server/read-token-authenticator-row-parity.test.ts`
    -> 2 files passed, 28 tests passed, 0 failed.
- **The full `tests/deploy/` suite**: **1 file failed, 83 passed, 1
  skipped (85); 1 failed, 678 passed, 10 skipped**. The one failure is
  `tests/deploy/worker-edge-cache-runtime.test.ts`, the pre-existing
  environmental failure this lineage's receipts record from tranche three
  onward. It is NOT this round's doing: the same file fails the same way
  at the round-seven tip (`git rev-parse HEAD` reads `c3dbe428` there, and
  `npx vitest run tests/deploy/worker-edge-cache-runtime.test.ts` answers
  1 failed, 3 passed). The suite's counts are the round-seven tip's plus
  this round's three new legs.
- `npx tsc --noEmit`: **exit 0, zero output lines**. `npx tsc -p
  tsconfig.json` (the staging bootstrap's own recipe): **exit 0**.
- The date gate on this receipt: `node
  C:/localProjects/brandonDojoTech/tools/meeting-date-gate.mjs
  docs/reports/routes-round8-2026-10-24.md --today "Saturday 2026-10-24"`
  -> **DATE GATE PASS** (the machine clock reads 2026-10-24 in UTC).

## The family count after this round

72 rows. **65 DONE, 7 open**: A12 (untouched, kept named with its
operator-decision flag), C10 (untouched, kept named with its measured-skip
flag), and B9, B10, D3, D4 and D5 (not taken this round). The six rows this
round took are closed, and the four named remainders from round seven
stay named.

## What this round did NOT land, named

- **A17's create and delete GET arms**: the operator's yes belongs to
  them, because admitting them changes what a plain link does to a live
  deck. The gate they would run behind is already in place.
- **A22's signed-in may-create `:new-form` arm** at wildcard addresses: it
  rides the single-segment new-card machinery only, and the port's own
  counterpart branch (`canCreate ? 200 : 404`) is unreachable from the
  render entry points. That is row C10's own named remainder.
- **A22's staging-host status posture**: the staging host carries the
  page's own error status only on a stock deck.
- **B6's edge asset-input refresh seam**: the edge's read path builds no
  card action engine, and the refresh runs through it.
- **B6's marker lifetime**: the port's marker is held by the host process,
  the pinned one by the shared cache.
- **A12**: untouched, kept named with its operator-decision flag.
- **C10**: untouched, kept named with its measured-skip flag.
- **Round seven's four named remainders**: untouched, still named.

## Disk

Added: the lane's own checkout `C:/localProjects/decko-ts-routes-round8-20261024`
(a `git init` plus one targeted fetch, an unshallow, node_modules copied
in from the round-seven checkout, no network) at 1.3 GB in total (97 MB of
.git, 914 MB of node_modules, 27 MB of rebuilt dist, which is gitignored),
seven commits, this report and the round's test pins. The system drive
reads 20 GB free after the lane.

Moved out of the checkout: this lane's scratch directory
`.tools-tmp-round8/` (the capture re-runs, the two probe files and the
copy script), ARCHIVED to
`C:/localProjects/decko-ts-lane-archives/routes-round8-20261024-tools-tmp/tools-tmp`
rather than deleted, so the checkout carries none of it and none of its
bytes is lost.

Nothing deployed. No live host was contacted and no metered database was
touched: every measurement in this round ran against the local pinned
gemset, the port's own source, the port's own test storage, or a locally
booted host.
