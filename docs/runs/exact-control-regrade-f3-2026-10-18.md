# F3 exact-control re-grade

- Runner source: `reference-harness/browser/run-exhaustive.mjs` (sha256 `0980e8eec711`)
- Engine: `ts`, dist sha256 `2a24bb016442` (DIFFERS from prior run)
- Prior run: `.runtime\exhaustive\2026-10-18-regrade` at commit `776349b23e`, dist sha256 `ab8f16b4505e`
- Fixture sha256: `066062bd09c2` (prior run: `066062bd09c2`)
- Discrimination proof: all legs OK

| action | actor | prior | new | exact | witness | hint strategies |
|---|---|---|---|---|---|---|
| ACT-014 | admin | pass | **fail** | no | yes | Save: substring-fallback |
| ACT-044 | admin | pass | **fail** | no | yes | Account: text-locate, Account: text-locate, Account: text-locate |
| ACT-045 | admin | pass | **fail** | no | yes | Account: text-locate, Account: text-locate, Account: text-locate |
| ACT-061 | member | pass | **pass** | yes | no | Delete: exact-control* |
| ACT-062 | member | pass | **pass** | yes | no | Delete: exact-control* |
| ACT-077 | admin | pass | **fail** | no | yes | Account: text-locate, Account: text-locate, Account: text-locate |
| ACT-107 | (anonymous — cookies cleared) | pass | **pass** | yes | no | Sign in: exact-control* |
| ACT-108 | (anonymous — cookies cleared) | pass | **pass** | yes | no | Sign in: exact-control*, Reset password: exact-control*, Sign up: exact-control* |
| ACT-122 | admin | pass | **fail** | no | yes | Type: substring-fallback |
| ACT-162 | admin | pass | **pass** | yes | no | Sign in: exact-control* |

`hint strategies`: per hint, the deepest tier that hit; `*` marks the pass-carrying exact-control tier.

Failures (rule violations, measurement gaps, infrastructure): 0
