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
//   "ignored", and no ported BEHAVIOR surface names it. Naming it in a
//   provenance citation is a different thing - see the note on the scan below.
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

/** src/ .ts files, excluding the mod manifests (whose absence is the other
 *  half of this file's claim). */
const sourceFiles = (): string[] => {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts") && !full.includes("mod-loader/mods")) found.push(full);
    }
  };
  walk(`${REPO}src`);
  return found;
};

/**
 * Strip comments, keeping string literals intact.
 *
 * A `//` opens a comment only outside a string and only when it does not
 * follow a `:` - that is what keeps `http://decko.org` a string rather than
 * the start of a comment that would swallow the rest of the line. Regex
 * literals are not tracked: a regex containing `//` is the one shape this
 * could misread, and the failure mode is over-stripping (less text scanned),
 * never under-stripping, so a real code-level match still trips the pin.
 */
const stripComments = (source: string): string => {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const c = source[i]!;
    const next = source[i + 1];
    if (c === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end < 0 ? source.length : end + 2;
      continue;
    }
    if (c === "/" && next === "/" && source[i - 1] !== ":") {
      const nl = source.indexOf("\n", i);
      i = nl < 0 ? source.length : nl;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c;
      i++;
      while (i < source.length) {
        out += source[i];
        if (source[i] === "\\") {
          out += source[i + 1] ?? "";
          i += 2;
          continue;
        }
        i++;
        if (source[i - 1] === quote) break;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
};

/** src/ files naming `needle` in CODE - the half of the pin that no comment
 *  can satisfy. */
const sourceFilesNamingInCode = (needle: string): string[] =>
  sourceFiles().filter((f) => stripComments(readFileSync(f, "utf-8")).includes(needle));

/** src/ files naming `needle` in a COMMENT, with the comment lines. */
const commentMentions = (needle: string): Array<{ file: string; line: string }> => {
  const hits: Array<{ file: string; line: string }> = [];
  for (const file of sourceFiles()) {
    for (const line of readFileSync(file, "utf-8").split("\n")) {
      if (line.includes(needle) && !stripComments(line).includes(needle)) hits.push({ file, line });
    }
  }
  return hits;
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

  it("card-mod-defaults: the registry records it ignored, and no ported behavior surface names it", () => {
    const row = registryRow("card-mod-defaults");
    expect(row.compatStatus).toBe("ignored");
    expect(row.manifest).toBe(false);
    expect(row.status).toBe("ported");
    // The guard that matters, and the one nothing may soften: no src/ file
    // may NAME this gem in code - no import of its set/ paths, no set
    // module, view or event registration. A comment cannot satisfy it.
    expect(
      sourceFilesNamingInCode("card-mod-defaults"),
      "no ported behavior surface may name card-mod-defaults in code",
    ).toEqual([]);
  });

  it("card-mod-defaults: comment mentions are provenance citations of its data, in the one file allowed to carry them", () => {
    // A comment may name the gem only to say which real.yml a seeded row
    // came from - Cardio::Mod::Eat reads data/real.yml for EVERY mod, so
    // consuming this gem's data does not port its behavior. Anything else
    // (a comment claiming the mod is ported, a second file citing it) fails
    // here. The named exception is the seed table, and the reason is here:
    // reg-star-getting-started ports *getting started, which this gem's
    // real.yml seeds and the seeded Home card nests.
    const SEED_TABLE = `${REPO}src/card/mod-loader/mod-realyml-seed-cards.ts`;
    const mentions = commentMentions("card-mod-defaults");
    expect([...new Set(mentions.map((m) => m.file))]).toEqual([SEED_TABLE]);
    for (const { line } of mentions) {
      expect(line, "every comment mention must cite the gem's data file").toMatch(
        /card-mod-defaults-0\.20\.0\/data\/real\.yml/,
      );
    }
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
