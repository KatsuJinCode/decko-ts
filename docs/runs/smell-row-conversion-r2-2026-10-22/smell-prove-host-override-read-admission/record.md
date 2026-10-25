# Row smell-prove-host-override-read-admission

Smell-test row conversion, round two, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-prove-host-override-read-admission`
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/prove-host-override-read-admission.mjs`
- What this lane did: established which of the row's dependencies are in place now, and read
  the measured verdict that the 2026-10-20 dependency-restoration lane left on file.
- Command: not run by this lane; the row's recorded verdict is a faithful reproduction of
  the recorded red attempt, and a re-run cannot close the row.
- Observed, first hand: the instrument's harness dependencies resolve in the restored pinned
  checkout. `C:/localProjects/decko-edge-verification-b00a4503/tools/edge-signed-in-exercise/lib/harness-browser.mjs`
  and `C:/localProjects/decko-edge-verification-b00a4503/reference-harness/browser/lib/live-walk-profile.mjs`
  are both present at the pinned commit
  `b00a450329af801915ae9dbc4668cf9a08ef628c`, so the two blockers round one recorded as
  first-named are gone. The remaining input is the throwaway TLS fixture under the pinned
  checkout's `tmp/edge-signed-in-2026-10-18T06-33-24-416Z-40592-40592/runtime/edge/`, which
  is an input-shaped fixture rather than a hash-pinned artifact of record.
- The measured verdict on file: the 2026-10-20 dependency-restoration lane's receipt at
  `C:/localProjects/brandonDojoTech/tmp/smell-dep-restore-20261020/verdicts.json`, under the
  row id `smell-prove-host-override-read-admission`, records that the instrument launched
  the real headless browser and bound both 127.0.0.2 TLS listeners and then failed, and its
  verdict is `RAN - verdict RED (faithful reproduction of the recorded red attempt; red-to-green
  fix not reconstructible)`.
- Gap, in one mechanism sentence: the host-override read admission still refuses the
  request after the harness and the TLS fixture are in place, so the red-to-green step this
  row exists to prove is still missing, and the fix that would turn it green is not
  reconstructible from the material on disk.

## What this lane did not do

This lane did not re-run the instrument, did not regenerate the TLS fixture, and did not
modify the pinned checkout's `tmp` tree. The red verdict cited here is the 2026-10-20
measurement, and this receipt does not present it as a measurement of this session.
