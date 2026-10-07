import { defineConfig } from "vitest/config";

// Test files run in forked workers, at most four at a time, so a hung test
// cannot keep the run alive and peak memory stays bounded. `dist/` is
// excluded because it holds the tsc-compiled copy of the suite.
export default defineConfig({
  test: {
    testTimeout: 30000,
    hookTimeout: 15000,
    teardownTimeout: 5000,
    setupFiles: ["tests/support/scratch-setup.ts"],
    pool: "forks",
    maxWorkers: 4,
    // The second reporter lists every suite that skipped for lack of data.
    reporters: ["default", "./tests/support/skip-summary-reporter.ts"],
    exclude: ["**/node_modules/**", "**/.git/**", "**/dist/**"],
  },
});
