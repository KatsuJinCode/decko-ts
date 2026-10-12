// The registry's two "legacy-ignored, nothing to port" mods, pinned against
// the tree and the installed Ruby originals.
//
// WHY THIS FILE EXISTS
// The mod registry records card-mod-defaults and card-mod-delayed_job as
// PORTED with the statusEvidence "legacy-labeled per upstream (#1282):
// ignored ... nothing to port". No behavior suite can exist for them because
// the port surface is empty — but an empty surface with NO test is exactly
// the shape that leaves a validation gap. This file closes that gap the only
// honest way: it pins the CLAIM itself. The claim has three verifiable legs:
//   1. the installed Ruby originals (the same trees the registry's
//      publicEvidence names) carry NO set/ directory — no set modules, no
//      views, no events. Verified by inspection:
//      card-mod-defaults-0.20.0 = config/admin.yml + data fixtures/files +
//      a one-line mod definition (lib/card/mod/defaults.rb:
//      "Cardio::Railtie.config.seed_mods.unshift :defaults");
//      card-mod-delayed_job-0.20.0 = config/late/delayed_job_config.rb +
//      lib loaders for Delayed::Job. Both LICENSE-only otherwise. There is
//      no view/event behavior to reproduce, so no behavioral oracle exists;
//   2. the decko-ts tree carries no manifest for either mod
//      (src/card/mod-loader/mods/ has 31 card-mod-* manifests + core-mod;
//      neither name appears);
//   3. the registry itself records both rows as compatStatus "ignored" /
//      manifest false — the port claim and the tree agree.
// The jobs side of delayed_job is carried by the behavior inventory, not
// here.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const MODS_DIR = `${REPO}src/card/mod-loader/mods`;
const REGISTRY = `${REPO}tools/mod-porting-harness/public-mod-registry.json`;

const IGNORED_MODS = ["card-mod-defaults", "card-mod-delayed_job"] as const;

describe("the legacy-ignored mods (defaults, delayed_job): nothing-to-port claim pinned", () => {
  it("the tree carries no port manifest for either mod", () => {
    const manifests = readdirSync(MODS_DIR).filter((f) => f.endsWith(".ts"));
    for (const mod of IGNORED_MODS) {
      expect(
        manifests.filter((f) => f.startsWith(mod)),
        `${mod} must have no manifest in src/card/mod-loader/mods/`,
      ).toEqual([]);
    }
  });

  it("the registry records both as compatStatus 'ignored' with no manifest", () => {
    const registry = JSON.parse(readFileSync(REGISTRY, "utf-8")) as {
      mods: { mod: string; compatStatus: string; manifest: boolean; status: string }[];
    };
    for (const mod of IGNORED_MODS) {
      const row = registry.mods.find((m) => m.mod === mod);
      expect(row, `${mod} row in the public registry`).toBeDefined();
      expect(row!.compatStatus).toBe("ignored");
      expect(row!.manifest).toBe(false);
      expect(row!.status).toBe("ported");
    }
  });

  it("no ported source surface references either mod as a ported set module", () => {
    // A port would have to appear somewhere: a manifest, a view body, a
    // set module. The registry says none exists; this greps the port
    // surface (src/, excluding the harness registry bookkeeping which
    // legitimately names the mods) for the claim.
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith(".ts") && !full.includes("mod-loader/mods")) {
          const text = readFileSync(full, "utf-8");
          if (text.includes("card-mod-defaults") || text.includes("card-mod-delayed_job")) {
            offenders.push(full);
          }
        }
      }
    };
    walk(`${REPO}src`);
    expect(offenders, `no ported surface may name ${IGNORED_MODS.join(" / ")}`).toEqual([]);
  });
});
