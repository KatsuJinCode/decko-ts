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
//   or event behavior to reproduce, so the registry records compatStatus
//   "ignored" and there is no manifest.
//
//   [re-pinned 2026-10-20, register entry 12] the assertion below used to
//   be "no ported surface may name card-mod-defaults" (sourceFilesNaming
//   ... toEqual []) - which contradicted this file's own header four lines
//   up, where the gem's port is described as "data fixtures/files + a
//   one-line mod definition". The seed SOURCE selection is that gem's only
//   registrable surface, and it is now ported and named: seed-source.ts
//   (the ordering + db_path resolution + both corpora's row counts, read
//   from the generated seed-corpus-census.ts), its generator, and the
//   boot-seed.ts header correction. So the assertion is now the SAME SHAPE
//   as the delayed_job arm - the port exists, it names the gem, and here
//   is what it is - rather than a blanket "nothing names it".
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

  it("card-mod-defaults: no MANIFEST, and the seed-source port that replaced the blanket claim", () => {
    const row = registryRow("card-mod-defaults");
    // compatStatus "ignored" is still exactly right, and for the reason it
    // always was: no sets, no views, no events. What changed is that the
    // gem is not thereby surface-less - it moves which gem's fixture a
    // fresh deck seeds from, and that surface is ported.
    expect(row.compatStatus).toBe("ignored");
    expect(row.manifest).toBe(false);
    expect(row.status).toBe("ported");

    // Normalise separators FIRST: sourceFilesNaming builds its paths with
    // `${dir}/${entry.name}` (forward slashes) on top of a REPO root that
    // is a Windows path, so the result is mixed. Matching "\\src\\" first
    // finds nothing and slice(-1) yields "s" - measured, not guessed.
    const naming = sourceFilesNaming("card-mod-defaults").map((f) => {
      const posix = f.replace(/\\/g, "/");
      return posix.slice(posix.indexOf("/src/"));
    });
    // The ported surfaces are exactly the seed-source mechanism and the
    // two files that document/correct it. An unlisted file naming the gem
    // is a NEW surface and must be adjudicated here, not absorbed.
    expect(naming.sort()).toEqual([
      "/src/card/auth/boot-seed.ts",
      "/src/card/auth/seed-corpus-census.ts",
      "/src/card/auth/seed-source.ts",
    ]);

    // ...and each of them is the seed source, not an unrelated mention.
    const seedSource = readFileSync(`${REPO}src/card/auth/seed-source.ts`, "utf-8");
    expect(seedSource).toContain("card-mod-defaults");
    expect(seedSource).toContain("seed_mods.unshift :defaults");
    expect(seedSource).toContain("DEFAULT_PATH_SOURCE");
    // boot-seed.ts's layer A cites Ruby's db_path rule; the correction
    // states that the rule resolves index 0, not the corpus transcribed.
    const bootSeed = readFileSync(`${REPO}src/card/auth/boot-seed.ts`, "utf-8");
    expect(bootSeed).toMatch(/register entry 12/);
    expect(bootSeed).toContain("seed_mods.unshift :defaults");
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
