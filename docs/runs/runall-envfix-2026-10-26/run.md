# run-all environment fix, 2026-10-26

Roster row smell-run-all (docs/registry/completeness-roster.json of
brandonDojoTech) was BLOCKED: run-all.mjs step 1, "link the mods' public
files into the oracle app" (bash ruby-server.sh --link-mods), exited 1 on
this machine. This run unblocks it per the row's own acceptance and
records the full-instrument run.

## The defect and its mechanism

The oracle app's gems are installed for Ruby 3.3
(C:/Ruby33-x64/lib/ruby/gems/3.3.0; docs/parity-method.md declares Ruby
3.3 the oracle runtime), but the machine's PATH carries Ruby 3.4
(C:/Ruby34-x64/bin) ahead of Ruby 3.3, so the ambient `bundle` dispatches
to the wrong interpreter and gem home. Two recorded faces of the same
defect:

- Today's reproduction (fresh clone at 34c31a71, no public/mod links):
  Ruby 3.4's bundler 2.5.22 (chosen through the lockfile's BUNDLED WITH)
  cannot find the oracle gems in Ruby 3.4's gem home and exits 1 with
  Bundler::GemNotFound ("Could not find decko-0.20.0, ... in locally
  installed gems").
- The 2026-10-19 investigation (run-all-r2.console.log of the row's
  evidence): Ruby 3.4's bundler exports BUNDLER_SETUP pointing into its
  own installation (bundler/shared_helpers.rb set_bundle_variables), Ruby
  3.3's rubygems requires it at startup (rubygems.rb "require
  ENV[BUNDLER_SETUP]"), and bundler 2.6.9 then demands itself from Ruby
  3.3's gem dir, which carries only 2.5.22 ("can't find gem bundler
  (= 2.6.9) with executable bundle"). Prepending the 3.3 bin to PATH
  changed only the child interpreter, never the exported path, so it did
  not change the dispatch.

## The fix (branch port/runall-envfix-20261026)

- b818322a: ruby-server.sh pins the dispatch the way engines/ruby33.json
  already does. On Windows it pins the interpreter
  (HARNESS_ORACLE_RUBY overrides; the default is the canonical
  C:/Ruby33-x64/bin/ruby.exe, with a loud exit 2 naming the exact path
  when it is missing) and its Gem.default_dir as GEM_HOME/GEM_PATH,
  clears inherited bundler variables, and resolves bundled gem paths
  through bundler/setup inside that interpreter. The server boot runs the
  app's script/decko binstub under the same pinned Ruby
  (config/boot.rb requires bundler/setup), the shape
  engines/ruby33-server.rb proves on this machine. Non-Windows dispatch
  is unchanged.
- 577b377f: run-all.mjs's summary writer asks the same pinned interpreter
  for RUBY_VERSION instead of the ambient bundle (which answered nothing
  and recorded "Ruby (unknown)" in the first run's summary). Outside
  Windows the bundle probe is unchanged.

## Verification, step 1

Failing command before (in this tree at 34c31a71, before the fix):

    bash reference-harness/browser/engines/ruby-server.sh --link-mods
    exit 1, Bundler::GemNotFound (trace quoted above)

Passing command after:

    bash reference-harness/browser/engines/ruby-server.sh --link-mods
    exit 0

The four links (ace_editor, bootstrap, style, tinymce_editor) are NTFS
junctions, not symlinks: `cmd /c dir public\mod` shows `<JUNCTION>` for
each, targeting
C:\Ruby33-x64\lib\ruby\gems\3.3.0\gems\card-mod-<mod>-0.20.0\public.
They were created without elevation. A rerun exits 0 idempotently
(existing links are skipped). With HARNESS_ORACLE_RUBY pointing at a
missing path the script exits 2 and names the exact path. A gem whose
public directory is missing still fails loudly naming the exact gem dir
(unchanged line of the script).

## End-to-end run

    node reference-harness/browser/run-all.mjs --out tmp/runall-envfix-r1 \
      --summary docs/runs/runall-envfix-2026-10-26/browser-journeys.md

- Tree: branch port/runall-envfix-20261026, base 34c31a71 (the newest
  pushed tip carrying reference-harness; main does not contain it), fix
  commits b818322a and 577b377f. Build receipt
  .runtime/browser-build.json: sourceCommit b818322a, built
  2026-10-26T02:13:35.568Z.
- Every step ran: build ok; link-mods ok (the fixed step, silent inside
  the instrument where it previously threw "exited 1"); ruby journeys 4
  shards and the port's single shard; comparison; summary; cucumber
  skipped with run-all's own note (no --decko checkout given; unchanged
  from the row's prior accepted shape).
- Result numbers: 51 journeys; ruby completed 46/51, port 51/51;
  comparison 31/46 graded journeys pass (5 not graded: a journey that
  fails on the reference is not graded). Reference runtime: Ruby 3.3.12
  (summary line, read from the pinned interpreter).
- Exit code 1 is the comparison's grading outcome, not a step failure.

## Residual, named precisely

The comparison residual of this run is not an environment defect and not
the class this lane fixes. It resolves into two parts:

1. The known parity root cause, already adjudicated by the fleet's
   compare-journeys lane today. That lane's same-day rerun at the newer
   journeys-rerun line (tip 3e4791cb, receipt commit c62486ae5 on
   port/journeys-rerun-20261026, roster row smell-compare-journeys)
   reports all 51 journeys completing on both engines, 36/51 pass, 0 not
   graded, with ONE root cause left: the port's follow-notification
   unfollow link differs from Ruby's, failing 14 mail items and the
   unfollow-from-mail journey end to end. This run's causes list matches
   item for item: 15 mail fails (11 of "1 vs 1 messages", 3 of "3 vs 3",
   1 of "2 vs 2"), the address diff showing that root cause's two URL
   shapes (/update/Mira_Member+*follow?card[subcards][*all+Mira
   Member+*follow]=*never versus /*all+Mira_Member+*follow), and
   unfollow-from-mail failing address, text, structure, mail and rows.

2. Five reference journeys lost to "page.goto: Timeout 30000ms exceeded"
   on freshly booted servers (denied-member-edit,
   denied-member-delete, unfollow-from-board-member,
   account-change-password-member, read-pages-anonymous). These are run
   contention, not a standing property: the parity lane's same-day rerun
   completes all 51 on both engines, and in this run four ruby shards,
   the port shard, the engine build and a cold npm install ran
   concurrently on one machine. They are this run's only ungraded loss
   (46 of 51 graded).

Line note: this run measured 34c31a71, the tip of the release-lead line
the roster row's sourceParent points at. The parity lane measured the
newer journeys-rerun line. The two lines are divergent (34c31a71 is not
an ancestor of 3e4791cb), but the two files this lane fixes are
byte-identical between them (git diff across the lines is empty), so the
fix merges or cherry-picks cleanly wherever the lines join. For
historical context, the row's 2026-10-19 accepted evidence at the frozen
tree a25329a8 showed the same 46-of-51-graded shape (5 reference-broken,
mail 34/46), superseded by today's parity adjudication.

## Grade

Row smell-run-all: verdict PASS, bucket DONE, per the row's own
acceptance ("Unblocks when: the bundler dispatch is fixed so
ruby-server.sh --link-mods runs on this machine"): the failing command
exits 1 before and 0 after, and the full instrument ran end to end on
this machine. The comparison residual above belongs to the parity lanes
(root cause one, already adjudicated) and to run contention (the five
timeouts), not to this row's environment blocker.

## Receipt contents

- run.md (this file)
- browser-journeys.md, the instrument's summary, rewritten via
  --report-only 1 after the runtime probe fix; comparison numbers
  identical to the first run's
- report.json, copy of tmp/runall-envfix-r1/report.json
- run-all-r1.console.txt, the first run's full console output (copied
  from the .log the repo's gitignore keeps out of version control)
