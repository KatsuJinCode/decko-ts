# Row smell-widget-single-statement-cas-test

Smell-test row conversion, round two, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-widget-single-statement-cas-test`
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/widget-single-statement-cas.test.mjs`
- What this lane did: tried to run the row's own test.
- Command: `node --test widget-single-statement-cas.test.mjs` was refused before it ran, by
  the session's file-deletion gate, because the suite removes its own temporary
  directories as it finishes.
- Observed, first hand: the test file and the module it drives,
  `widget-single-statement-cas.mjs`, are both present in the evidence tree, and the
  recorded controls logs beside them
  (`widget-single-statement-cas-controls.log` and
  `widget-single-statement-cas-controls-red.log`) are on file.
- Gap, in one mechanism sentence: the suite's own cleanup deletes directories as it runs,
  so the session's file-deletion gate refuses to run it, and the standing 2026-10-20
  receipt remains the record.

## What the standing record says

The row was recorded as a FAIL with the reason that the snapshot deck admits none of the
twelve ids against the pre-apply capture. That measurement is the 2026-10-20 one; this
lane did not re-measure it, because the gate refused the run, and this receipt does not
present it as a measurement of this session.

## What would close it

Either the suite's cleanup rewritten so that it leaves its temporary directories in place,
or a lane authorised to let the suite delete its own scratch. Either way the row's
verification has to run before the row can be adjudicated on its own evidence.
