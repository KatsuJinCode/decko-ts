# Supplemental production browser acceptance

All six unfiltered journeys in `acceptance-account-date.json` completed on clean source **f0c91b5a6432c28f091fe37091ce698395286fc5**, 2026-10-15 23:10:49–23:15:11 UTC. The committed JSON receipt records input/build hashes, raw result hashes, observations, runtime settings, and durations. Raw HTML/results/logs remain in `tmp/journey-complete-stable-provider/ts-production`; retries must use another directory.

| Complete journey | Duration |
|---|---:|
| Email change, new login, old credential refusal, restart | 27.356s |
| Password change, new login, old credential refusal, restart | 34.074s |
| Reset request, actual captured token, password change, fresh login/restart | 26.790s |
| Anonymous signup, administrator approval, verification mail/token, activation, fresh login/restart | 49.213s |
| Date save, reload, fresh session/restart, editor value | 62.149s |
| Initialized rich editor, save, reload, fresh session/restart, editor value | 62.083s |

This used the production Node host: PBKDF2, cautious asset refresh, stock deck profile, Chromium 154.0.8037.98, Node v24.19.0. The existing shared-cache LibSass executable SHA-256 was `ca84a1f0c254e4f9b1a40b232258ed599724fceaf532f0da003caeb641539ac2`. The public asset provider was this checkout's existing `reference-harness/oracle/app/public` gem junction tree. No Ruby, hosted database, live Bunny, or external mail provider was used. The mail transport captures the actual application-composed envelopes locally.

The runner now refuses a missing gem-public/TinyMCE provider and an uninitialized rich editor. Its browser instrument negative controls prove that an uninitialized editor does not silently fall back to writing a textarea. Product assertions verify persisted values and successful authentication; the run does not infer success from matching an error page. Known failed logo/font requests remain in raw network records. A 30.465s rich-editor fill step remains an avoidable settle delay; it is visible in the raw timing and is not described as fast. This is local Node acceptance, not an exact six-case Ruby comparison or Bunny browser acceptance. The earlier Ruby six-case run had signup setup and Date restart failures and cannot serve as the complete matching reference.

## Preserved provider-deletion incident

The previous frozen e2cfcff4 attempt completed five journeys but failed rich persistence: the editor theme returned 404 and the saved card content was empty. Its configured provider was `C:/localProjects/decko-ruby-reference`. Both expected TinyMCE theme layouts were absent when diagnosed. That failed attempt remains at `tmp/journey-complete-e2cfcff4/ts-production`.

The independently verified `C:/localProjects/diskSteward/agent/ledger.jsonl` line **85348** records `action: push-and-remove`, `at: 1792104971` (2026-10-15T22:56:11Z), path `C:\\localProjects\\decko-ruby-reference`, bytes 20306940, branch main, head `b3eb1fbe021a16a4ba86b0bbfd51aeaef079a5cf`, origin `https://github.com/decko-commons/decko.git`, and null backup_ref/snapshot. The failed browser attempt's script stamp was 1792105040, after that removal. Root owns repair of this cleanup bypass. The separate partial removal of browser-evidence remains unattributed; this ledger entry does not establish its cause. No manual deletion or unrelated process control was performed to repair the browser run.
