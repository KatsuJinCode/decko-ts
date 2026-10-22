# Row smell-prove-host-override-read-admission

Family row conversion, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-prove-host-override-read-admission` (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/prove-host-override-read-admission.mjs`
- What this lane did: Ran it with a fresh label, after the pinned checkout was restored.
- Command: `node prove-host-override-read-admission.mjs lane-host-override-20261022-r1`
- Observed: Exit 1 with ENOENT for C:/localProjects/decko-edge-verification-b00a4503/tmp/edge-signed-in-2026-10-18T06-33-24-416Z-40592-40592/runtime/edge/harness-key.pem, the disposable TLS fixture the proof needs.
- Gap, in one mechanism sentence: the disposable TLS fixture the proof reads is a throwaway artifact that git does not carry and the restored checkout does not hold, so the admission proof has no key material to serve.
- Pin: none; the row carries no pin of its own.

## Disposition

`WORKING ON IT`. The row's verification did not pass, and nothing here measures the port matching the source, so the row is not closed.
