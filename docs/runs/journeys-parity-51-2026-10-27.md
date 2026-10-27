# The journey parity oracle on the VM: 51 of 51 at strict parity

The 51-journey comparison the completeness roster row smell-compare-journeys
asks for, graded with the reference engine running on the operator's VM and
with the strict-parity switches on (the operator's two settled orders:
the Ruby reference runs on the VM, never local; exact parity via the legacy
flags, improved behaviour with them off). The graded number:

**Strict mode: journeys: 51 / 51 pass (0 not graded).**

- Date: 2026-10-27 (run window recorded in the run metadata, runId
  ae85cd60-2c23-4bab-9ef5-a92fe4115b23)
- Commit: 467fce81f902d2662b4afcd67c36104f367ac95f, branch
  port/oracle-vm-parity-51-20261027 (pushed to origin; the tree was clean
  for both captures: provenance source.dirty false,
  source.diffSha256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855,
  the empty diff; the build receipt binds the same commit,
  dist sha256 c9961edaabdfa3b17c17...)
- Command: `HARNESS_STEP_TIMEOUT=120000 node reference-harness/browser/run-all.mjs
  --out tmp/journeys-parity-51-strict-20261027 --reference-target vm
  --strict-parity 1 --build 0 --shards 1 --ts-shards 2 --summary
  tmp/journeys-parity-51-strict-20261027-summary.md`
- Strict-parity switches (recorded in both sides' provenance
  runner.strictParity): DECKO_STRICT_PARITY_SIGNIN_DETAILED_ERRORS=on,
  DECKO_STRICT_PARITY_REVISION_RESTORE_500=on,
  DECKO_STRICT_PARITY_SKIN_CREATE_500=on,
  DECKO_STRICT_PARITY_SCRIPT_BUNDLE_CLOCK_NAMES=on,
  DECKO_STRICT_PARITY_MAIL_UNFOLLOW_REFUSAL=on (the fifth switch is new on
  this branch, see the fixes below).
- Deck fingerprint: fixture sha256
  e5798f2cc72905e5a5e4d581ba107e6177a8d36eba02923ac4a207056b0da93c; the
  journeys hash 2f4dc0bc216e77e8dde229bc4e2cfc1462f789af21c3f31c2c66feb27934bc20
  is byte-identical to the 2026-10-27 rerun's, so this is the same 51
  journeys over the same synthetic deck. The contracts hash changed
  (05671700... -> 1a8aa9a4d16e7ac9992334e0feb7fe29d493f561964a720a5097d30c6fcd222a):
  the one contract surface the parity ruling touches (unfollow-from-mail's
  "after unfollow link" expectation) gained its parity expectation beside
  the improved one.
- Reference target: the operator's VM (brandon-portal-vm), reached by the
  documented recipe `ssh -J juc-vm -i ~/.ssh/oci-agents
  ubuntu@170.9.231.182`. Each journey stages a private session there (its
  own copy of the fixture deck, its own server process, its own stop-file
  lifecycle), the harness tunnels one port per shard (local and remote port
  numbers equal, so the deck origin matches what the browser visits), and
  the seed's sha256 is checked against the fixture's before anything boots.
- THE BROWSER STAYED LOCAL: one Chromium (155.0.8059.85) visits both
  engines' pages, the reference through the tunnel, the port on a local
  port. No browser runs on the VM.
- Reference runtime: Ruby 3.2.3, stock Ruby Decko (decko 0.20.0,
  card 1.110.0) on the VM, from the harness's stock oracle app provisioned
  on the VM against the same gem set the deployed vm-ruby application
  carries (rails 7.2.3.2, sqlite3 2.9.6, thin 2.0.1). The prior runs'
  local oracle was Ruby 3.3.12; the identity that matters (stock decko
  0.20.0 / card 1.110.0) is unchanged and is checked by the evidence
  validator on every journey.
- Port runtime: node host v24.22.1, serving this tree's dist build.
- Raw results: tmp/journeys-parity-51-strict-20261027/ (not committed). The
  comparison report is committed beside this record as
  docs/runs/journeys-parity-51-2026-10-27.json.

## Per graded item

| item | pass | total |
|---|---|---|
| completion | 51 | 51 |
| address | 89 | 89 |
| text | 89 | 89 |
| structure | 89 | 89 |
| fields | 89 | 89 |
| mail | 51 | 51 |
| rows | 51 | 51 |
| editor | 13 | 13 |
| journeys | 51 | 51 |

## The improved-behaviour number beside it

The same comparison without the switches (the improved behaviours are what
hosts serve by default) reads **36 of 51 pass, 0 not graded**
(tmp/journeys-parity-51-improved-20261027/, runId recorded in its run
metadata). That number is the improved-behaviour mode, reported beside the
parity score, never as it: with the switches off the port deliberately
differs from the reference in exactly the 15 journeys the improvements
touch - 14 on their mail item (the notification mail carries the
`success[redirect]=soft` parameter the reference's mail does not) and
unfollow-from-mail on the link's answer (the owner's dashboard write lands
at 200 where the reference refuses with 403). Those are the port's
default posture, and the strict run above is the parity score.

## What landed for the reference to move to the VM

1. reference-target vm (the harness): run-all.mjs and run-journeys.mjs
   carry --reference-target vm|local (default vm). vm mode runs the
   reference through engines/vm.json and lib/vm-engines.mjs: a private
   session per journey on the VM (browser/engines/vm-session.sh stage /
   stop / cleanup; the stop-file lifecycle ends the server), the seed sha
   checked against the fixture before anything boots, mail and ready
   through the tunnel, and the session deck copied back (after a WAL
   checkpoint route the reference server serves at /__harness/checkpoint)
   so the row delta reads the committed bytes. --strict-parity 1 sets the
   five switches and marks the run's mode in the provenance
   (runner.strictParityMode) and for the contract grader.
2. The VM's reference application is the stock oracle app
   (reference-harness/oracle/app) provisioned at
   /home/ubuntu/oracle-journeys/oracle-stock/app with its lockfile
   re-resolved --local against the gems the deployed vm-ruby application
   carries (no downloads). The deployed vm-ruby application itself was
   never modified: it carries 15 custom library mods and a custom root
   route (its "/" is Brandon's demo landing page), so its pages are not
   the stock Decko pages the journeys grade; its code, database, service
   and port are untouched, and the reference sessions run as a different
   user on different ports with their own fixture seeds.
3. Image processing on the VM: brandon-portal-vm had no ImageMagick (the
   deployed application carries a 00_stub_mini_magick.rb that pins
   mini_magick to ImageMagick 7's `magick` binary to survive boot). The
   stock app copy dropped the stub and the VM gained ImageMagick 6.9.12
   (apt install imagemagick, additive), which mini_magick auto-detects;
   upload-image-admin completes on the reference since then.

## What landed for the port (the residual the row named)

The 2026-10-27 rerun named the residual in three parts; all three are
closed on this branch, and a fourth surfaced and closed in the same work:

1. The mailed unfollow link and the owner's dashboard write are now the
   fifth strict-parity switch, DECKO_STRICT_PARITY_MAIL_UNFOLLOW_REFUSAL
   (strict-parity-flags.ts). On: the reference's bare link in every
   notification mail and the owner's dashboard write refused by the
   standard rules (403 "Sorry! You need permission to do that.", nothing
   applied - the fixture's *rstar+*update names the Shark role alone,
   verified against the live oracle by Card#update! raising
   permission_denied for the member on both the dashboard card and its
   *all rule subcard). Off: the improved bytes the follow-operation
   contracts name. The two-part permit arm moved behind the switch
   (view-task-rules.ts followPreferencePermit); the soft redirect append
   left the mail link (follow-mail-views.ts).
2. The member board unfollow regains the reference's trunk-part
   permission fold (card-action-engine.ts): the act's own Right::Follow
   permit passing no longer skips the parts the save materializes; a
   denied part folds its part-named error and the save fails with the
   errors-view class (422), applying nothing - the reference's recorded
   shape, re-verified live on the VM oracle.
3. The explicit GET update refusal renders the card's DENIAL view
   (write-routes.ts): the card exists (the refusal is the permission
   check), and the reference's 403 body is the loud denial frame with the
   card's title and "Sorry! You need permission to do that."; the port
   rendered the :unknown view there, which produced an empty body.
4. The ajax refusal answers the ALERT ALONE (write-routes.ts
   errorAlertFragmentHtml): Ruby renders the refused card's error bag
   with no page chrome, and the deck script injects that fragment into
   the card's slot; the port answered the whole page, so the script
   injected a full page into the slot (the doubled chrome and the lost
   "SIGNIN: Wrong password" the sign-in journey recorded). The port's
   fragment is now byte-identical to the reference's 284 bytes.

## Receipt chain

- Graded strict run: tmp/journeys-parity-51-strict-20261027/
  (report committed beside this record as
  docs/runs/journeys-parity-51-2026-10-27.json).
- Improved-behaviour run: tmp/journeys-parity-51-improved-20261027/.
- Prior evidence this lane started from:
  docs/runs/browser-journeys-rerun-candidate-20261027.md (34 of 51, local
  engines, improved-behaviour mode), whose three residual parts this lane
  closed.
- The VM provisions this lane left in place (the reference's home, reused
  by the next run): /home/ubuntu/oracle-journeys/ (oracle-stock/app, seed,
  browser/engines, sessions). The deployed vm-ruby application is
  untouched.
