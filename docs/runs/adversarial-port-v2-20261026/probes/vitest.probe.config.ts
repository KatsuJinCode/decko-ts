// vitest.probe.config.ts - the scratch config for the adversarial port attack
// v2 probes.
//
// The project's own vitest.config.ts excludes tmp/** and collects every
// *.test.ts in the tree; the probes under this folder are named *.probe.ts
// so the project's suites stay untouched, and this config collects them.
//
//   npx vitest run --config docs/runs/adversarial-port-v2-20261026/probes/vitest.probe.config.ts

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["docs/runs/adversarial-port-v2-20261026/probes/**/*.probe.ts"],
    pool: "forks",
    maxWorkers: 2,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
