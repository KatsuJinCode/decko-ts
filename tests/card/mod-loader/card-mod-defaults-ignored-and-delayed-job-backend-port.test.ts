// The two card-mod-* gems with no set/ tree, pinned against the tree and the
// public mod registry.
//
// WHY THIS FILE EXISTS
// Neither gem declares set modules, views or events, so neither has a
// manifest under src/card/mod-loader/mods/ and no view-level behavior suite
// can exist for them. Without a test, that empty manifest surface would be an
// unguarded claim. This file pins what each gem's port actually is:
//
//   card-mod-defaults-0.20.0 = config/admin.yml + data fixtures/files + a
//   one-line mod definition (lib/card/mod/defaults.rb:
//   "Cardio::Railtie.config.seed_mods.unshift :defaults"). There is no view
//   or event behavior to reproduce: the registry records it compatStatus
//   "ignored", and no source file outside the registry bookkeeping names it.
//
//   card-mod-delayed_job-0.20.0 = config/late/delayed_job_config.rb + lib
//   loaders for Delayed::Job. Its behavior is engine machinery, ported in
//   src/card/delayed-job/delayed-job.ts (integrate_with_delay events become
//   delayed_jobs rows) and guarded by tests/card/delayed-job/. The registry
//   records it compatStatus "declared-complete" with no manifest.

import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const MODS_DIR = `${REPO}src/card/mod-loader/mods`;
const REGISTRY = `${REPO}tools/mod-porting-harness/public-mod-registry.json`;
const DELAYED_JOB_PORT = `${REPO}src/card/delayed-job/delayed-job.ts`;

const NO_SET_TREE_MODS = ["card-mod-defaults", "card-mod-delayed_job"] as const;

type RegistryRow = { mod: string; compatStatus: string; manifest: boolean; status: string; statusEvidence: string };

const registryRow = (mod: string): RegistryRow => {
  const registry = JSON.parse(readFileSync(REGISTRY, "utf-8")) as { mods: RegistryRow[] };
  const row = registry.mods.find((m) => m.mod === mod);
  expect(row, `${mod} row in the public registry`).toBeDefined();
  return row!;
};

const sourceFilesNaming = (needle: string): string[] => {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".ts") && !full.includes("mod-loader/mods")) {
        if (readFileSync(full, "utf-8").includes(needle)) found.push(full);
      }
    }
  };
  walk(`${REPO}src`);
  return found;
};

describe("card-mod gems with no set/ tree: defaults (ignored) and delayed_job (backend port)", () => {
  it("the tree carries no set-module manifest for either gem", () => {
    const manifests = readdirSync(MODS_DIR).filter((f) => f.endsWith(".ts"));
    for (const mod of NO_SET_TREE_MODS) {
      expect(
        manifests.filter((f) => f.startsWith(mod)),
        `${mod} must have no manifest in src/card/mod-loader/mods/`,
      ).toEqual([]);
    }
  });

  it("card-mod-defaults: the registry records it ignored, and no source surface names it", () => {
    const row = registryRow("card-mod-defaults");
    expect(row.compatStatus).toBe("ignored");
    expect(row.manifest).toBe(false);
    expect(row.status).toBe("ported");
    expect(sourceFilesNaming("card-mod-defaults"), "no ported surface may name card-mod-defaults").toEqual([]);
  });

  it("card-mod-delayed_job: the registry records a backend port, and that port exists and names the gem", () => {
    const row = registryRow("card-mod-delayed_job");
    expect(row.compatStatus).toBe("declared-complete");
    expect(row.manifest).toBe(false);
    expect(row.status).toBe("ported");
    expect(row.statusEvidence).toContain("src/card/delayed-job/delayed-job.ts");
    expect(existsSync(DELAYED_JOB_PORT)).toBe(true);
    expect(readFileSync(DELAYED_JOB_PORT, "utf-8")).toContain("card-mod-delayed_job 0.20.0");
  });
});
