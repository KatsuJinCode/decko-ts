import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { createTestRunScratch } from "./tests/support/test-run-scratch.mjs";
import { globsMatchingExactly, splitTestFilesByIsolation } from "./tests/support/test-isolation-routing.mjs";

// Configuration loading never reclaims another run's scratch.
const testRunScratch = createTestRunScratch();

// Each test file either runs in a fresh process of its own or shares a worker
// process with other files; tests/support/test-isolation-routing.mjs decides
// from the file's text. The two projects below each exclude the other's files,
// so whatever `include` a run sets (the default, or a gate's file list merged
// in by tools/test-gates.mjs) still selects each file exactly once.
const testFiles = splitTestFilesByIsolation();
const isolatedFileGlobs = globsMatchingExactly([...testFiles.isolated.keys()]);
const sharedProcessFileGlobs = globsMatchingExactly(testFiles.shared);
const setupFiles = ["tests/support/scratch-setup.ts", "tests/support/native-runtime-setup.ts"];

// Suites written for Node's own runner (`node --test`) are not vitest
// files: vitest would report them as files without a suite.
const excludedFromVitest = [
  "**/node_modules/**",
  "**/.git/**",
  // Scratch: the gate's own working directories, and the vendored gem
  // tree an oracle checkout leaves under tmp/ (bootstrap's jQuery specs
  // are `.spec.js`, which vitest collects as suites). A suite is never
  // written here, so nothing of the project's is excluded with them.
  "tmp/**",
  ".runtime/**",
  "**/dist/**",
  "tools/oracle/capture-stores-raw-slot-ids.test.mjs",
  "reference-harness/runner/test/**",
  "reference-harness/browser/test/engine-pinned-port.test.mjs",
  "tests/deploy/staging-shutdown-drain.test.mjs",
  "tests/card/auth/adversarial-security.test.mjs",
  // The gate detects its node:test import and executes it with Node.
  "tests/card/permissions/error-format-reference-contract.test.mjs",
  "tests/card/permissions/format-super-reference-contract.test.mjs",
  "tests/deploy/node-profile-new-card-routes.test.mjs",
  "tests/deploy/node-nest-cache-startup.test.mjs",
  "tests/tools/node-host-package.test.mjs",
  "tests/tools/cleanup-test-scratch.test.mjs",
  "tests/tools/test-run-scratch.test.mjs",
  "tests/tools/two-minute-test-limit.test.mjs",
  "tests/tools/runtime-db-matrix-bun.test.mjs",
  "tests/tools/bunny-runtime-import-check.test.mjs",
  "tests/tools/api-key-view-capture-evidence.test.mjs",
  "tests/tools/release-check-evidence.test.mjs",
  "tests/tools/release-check-runner.test.mjs",
  "tests/tools/test-file-inventory.test.mjs",
  "tests/tools/source-qualification-grade.test.mjs",
  "tests/tools/handover-export-allocation.test.mjs",
  "tests/tools/shadow/retained-http-observation.test.mjs",
  "tests/card/actions/mod-event-type-change.source.test.mjs",
  "tests/card/actions/persistence-find-receiver.source.test.mjs",
  "tests/card/mod-loader/mod-event-dirty-conditions.source.test.mjs",
  "tests/card/mod-loader/mod-event-override-precedence.source.test.mjs",
  // Optional private policy controls are Node tests when that tool is present.
  "tools/edge-signed-in-exercise/test/*.test.mjs",
  // These browser files use node:test. Full/harness gates run
  // them with the real Node runner and retain its independent report.
  "reference-harness/browser/test/editor-readiness.test.mjs",
  "reference-harness/browser/test/engine-lifecycle.test.mjs",
  "reference-harness/browser/test/evidence-integrity.test.mjs",
  "reference-harness/browser/test/capture-admission.test.mjs",
  "reference-harness/browser/test/comparison-artifacts.test.mjs",
  "reference-harness/browser/test/journey-lifecycle-failure.test.mjs",
  "reference-harness/browser/test/orphan-browser-reaping.test.mjs",
  "reference-harness/browser/test/signin-failure-evidence.test.mjs",
  "reference-harness/browser/test/signin-response-metadata.test.mjs",
  "reference-harness/browser/test/signin-trace-bootstrap.test.mjs",
  "reference-harness/browser/test/observation-normalization.test.mjs",
  "reference-harness/browser/test/exhaustive-search-box-selector.test.mjs",
  "reference-harness/browser/test/follow-dashboard-expectations.test.mjs",
  "reference-harness/browser/test/follow-operation-contracts.test.mjs",
  "reference-harness/browser/test/follow-preference-read.test.mjs",
  "reference-harness/browser/test/network-recording.test.mjs",
  "reference-harness/browser/test/network-timing.test.mjs",
  "reference-harness/browser/test/output-admission.test.mjs",
  "reference-harness/browser/test/signup-mail-host.test.mjs",
];

// A standalone CPU benchmark favored sixteen workers, but that setting did
// not bound memory during concurrent release checks on the shared host.
// Keep the default at two; an explicit CLI --maxWorkers budget may override it.
// Persist compiled transforms between runs; this caches compilation, not test
// results or runtime database state.
// `dist/` is excluded because it holds the tsc-compiled copy of the suite.
export default defineConfig({
  test: {
    env: { DECKO_TEST_TEMP_ROOT: testRunScratch },
    testTimeout: 30000,
    hookTimeout: 15000,
    teardownTimeout: 5000,
    pool: "forks",
    maxWorkers: 2,
    fsModuleCache: true,
    projects: [
      // Files that change process-wide state: a fresh process per file.
      {
        extends: true,
        test: { name: "isolated", isolate: true, setupFiles, exclude: [...excludedFromVitest, ...sharedProcessFileGlobs] },
      },
      // Every other file shares its worker process with the files before it,
      // which skips starting Node, Vitest and the node_modules packages again
      // for each file. The first setup file gives each file fresh copies of
      // the project's own modules, so no module-level state carries over.
      {
        extends: true,
        test: {
          name: "shared-process",
          isolate: false,
          setupFiles: ["tests/support/fresh-modules-per-file-setup.ts", ...setupFiles],
          exclude: [...excludedFromVitest, ...isolatedFileGlobs],
        },
      },
    ],
    // The second reporter lists every suite that skipped for lack of data.
    // The streaming profile reporter appends each file's timing the moment the
    // file finishes (DECKO_TEST_PROFILE_FILE, set by the two-minute runner in
    // tools/testing/run-tests-with-two-minute-limit.mjs), so a killed run still
    // leaves its profile. junit writes only at the end of a run.
    reporters: [
      "default",
      fileURLToPath(new URL("./tests/support/skip-summary-reporter.ts", import.meta.url)),
      fileURLToPath(new URL("./tools/testing/streaming-profile-reporter.mjs", import.meta.url)),
      "junit",
    ],
    outputFile: { junit: ".test-results/vitest.xml" },
    exclude: excludedFromVitest,
  },
});
