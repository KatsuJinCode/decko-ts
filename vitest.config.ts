import { defineConfig } from "vitest/config";
import { purgeStaleVitestTemp } from "./tests/support/purge-stale-vitest-temp";

purgeStaleVitestTemp();

// A standalone CPU benchmark favored sixteen workers, but that setting did
// not bound memory during concurrent release checks on the shared host.
// Keep the default at two; an explicit CLI --maxWorkers budget may override it.
// Fork isolation remains in place. Persist compiled transforms between runs;
// this caches compilation, not test results or runtime database state.
// `dist/` is excluded because it holds the tsc-compiled copy of the suite.
export default defineConfig({
  test: {
    testTimeout: 30000,
    hookTimeout: 15000,
    teardownTimeout: 5000,
    setupFiles: ["tests/support/scratch-setup.ts"],
    pool: "forks",
    maxWorkers: 2,
    fsModuleCache: true,
    // The second reporter lists every suite that skipped for lack of data.
    reporters: ["default", "./tests/support/skip-summary-reporter.ts"],
    // Suites written for Node's own runner (`node --test`) are not vitest
    // files: vitest would report them as files without a suite.
    exclude: [
      "**/node_modules/**",
      "**/.git/**",
      // Scratch: the gate's own working directories, and the vendored gem
      // tree an oracle checkout leaves under tmp/ (bootstrap's jQuery specs
      // are `.spec.js`, which vitest collects as suites). A suite is never
      // written here, so nothing of the project's is excluded with them.
      "tmp/**",
      ".runtime/**",
      "**/dist/**",
      "tools/oracle/corpus-deck-pairing-gate.test.mjs",
      "tools/oracle/capture-stores-raw-slot-ids.test.mjs",
      "reference-harness/runner/test/**",
      // Optional private policy controls are Node tests when that tool is present.
      "tools/edge-signed-in-exercise/test/*.test.mjs",
      // These browser files use node:test. Full/harness gates run
      // them with the real Node runner and retain its independent report.
      "reference-harness/browser/test/editor-readiness.test.mjs",
      "reference-harness/browser/test/engine-lifecycle.test.mjs",
      "reference-harness/browser/test/evidence-integrity.test.mjs",
      "reference-harness/browser/test/follow-operation-contracts.test.mjs",
      "reference-harness/browser/test/network-recording.test.mjs",
      "reference-harness/browser/test/network-timing.test.mjs",
      "reference-harness/browser/test/output-admission.test.mjs",
      "reference-harness/browser/test/signup-mail-host.test.mjs",
    ],
  },
});
