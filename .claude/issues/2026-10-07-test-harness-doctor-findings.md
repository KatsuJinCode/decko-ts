# Test harness: jec-test doctor findings (2026-10-07)

Found by `jec-test doctor` on branch cf-hosting-2026-10-07. They predate that
branch; none is caused by it.

1. 119 of 572 test files are run by no package script (`test` runs only
   `tests/card/`; the rest run only through benchmarks/speed-ship/run-suite-chunks.mjs).
   Done when every test file belongs to a named tier (`test`, `test:deploy`,
   `test:server`, ...) or is archived, and the doctor's coverage check passes.
2. Vitest writes no JUnit XML. Done when vitest.config.ts adds the junit
   reporter to `.test-results/vitest.xml` and `.test-results/.gitignore` exists.
3. `dangerouslyIgnoreUnhandledErrors: true` in vitest.config.ts hides errors
   outside tests. Done when it is removed and the errors it hid are fixed.
4. Recommended: fast-check for property tests, Stryker for mutation tests.

The cf-hosting tests run as `npm run test:cf-hosting`.
