// The one-key runner's two-script shape and its served-variable limits, checked
// offline (no Bunny contact; the plan and the validators are pure).
//
// WHAT THE RUNNER MUST DO, from the 2026-10-14 deployment receipt:
//   - a single 7.5 MB script answered empty HTTP 400s under cold starts; the
//     deck ran on a 1.6 MB read front for anonymous reads plus the full
//     engine for sign-in and writes. The runner provisions both by default,
//     and the plan names both.
//   - a 3.6 KB DECKO_SERVED_DELTAS value made both scripts answer HTTP 400 on
//     every request; Bunny stores at most 2 KB per script variable value. The
//     runner refuses an oversized served value before any account write.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  validatePayload,
  validateServedVariables,
  buildSteps,
  servedVariablesDocumentedLimit,
  BUNNY_VARIABLE_VALUE_MAX_BYTES,
  BUNNY_SCRIPT_VARIABLES_MAX,
  ProvisionRefusal,
  REFUSAL,
} from "../../deploy/provisioning/provision-bunny-deck.mjs";

const FIXTURES = join(import.meta.dirname, "fixtures", "one-key-provisioning");
const sample = () => JSON.parse(readFileSync(join(FIXTURES, "sample-payload.json"), "utf8"));

function refusalOf(fn: () => unknown): ProvisionRefusal {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ProvisionRefusal);
    return e as ProvisionRefusal;
  }
  throw new Error("expected a refusal, nothing was thrown");
}

describe("Bunny's documented script-variable limits are the runner's constants", () => {
  it("2048 bytes per value and 128 variables per script", () => {
    expect(BUNNY_VARIABLE_VALUE_MAX_BYTES).toBe(2048);
    expect(BUNNY_SCRIPT_VARIABLES_MAX).toBe(128);
    expect(servedVariablesDocumentedLimit()).toEqual({ valueBytes: 2048, variables: 128 });
  });
});

describe("validateServedVariables — the 3.6 KB blob is refused, the loose form passes", () => {
  it("refuses a DECKO_SERVED_DELTAS blob over 2 KB, naming the variable, its size and the limit", () => {
    const blob = JSON.stringify({ assetHost: "https://assets.example.org", filler: "x".repeat(3600) });
    const refusal = refusalOf(() => validateServedVariables({ DECKO_SERVED_DELTAS: blob }));
    expect(refusal.marker).toBe(REFUSAL.SERVED_INVALID);
    expect(refusal.message).toContain("DECKO_SERVED_DELTAS is");
    expect(refusal.message).toContain("2048 bytes per script variable");
    expect(refusal.message).toContain("HTTP 400");
  });

  it("measures bytes, not characters", () => {
    // 1100 two-byte characters: 1100 characters but 2200 bytes, over the limit.
    const refusal = refusalOf(() => validateServedVariables({ DECKO_SERVED_FOOTER_CARD_ID: "é".repeat(1100) }));
    expect(refusal.message).toContain("2200 bytes");
  });

  it("accepts loose values each within the limit, as the receipt's largest (1.6 KB) was", () => {
    const vars = validateServedVariables({
      DECKO_SERVED_ASSET_HOST: "https://assets.example.org",
      DECKO_SERVED_HEAD_SCRIPTS: JSON.stringify(["<script>x</script>".repeat(90)]),
    });
    expect(vars.map((v: { Name: string }) => v.Name)).toEqual([
      "DECKO_SERVED_ASSET_HOST",
      "DECKO_SERVED_HEAD_SCRIPTS",
    ]);
    expect(vars[1].DefaultValue.length).toBeLessThanOrEqual(BUNNY_VARIABLE_VALUE_MAX_BYTES);
  });

  it("reports every problem at once, not just the first", () => {
    const refusal = refusalOf(() => validateServedVariables({
      DECKO_SERVED_A: "x".repeat(2100),
      DECKO_SERVED_B: "y".repeat(2100),
    }));
    expect((refusal.detail as { errors: string[] }).errors.length).toBe(2);
  });

  it("refuses a name the runner sets itself, and a name outside DECKO_", () => {
    const managed = refusalOf(() => validateServedVariables({ DECKO_TRUSTED_ORIGINS: "https://x.example" }));
    expect(managed.message).toContain("the runner sets this variable itself");
    const outside = refusalOf(() => validateServedVariables({ lowercase: "v" }));
    expect(outside.message).toContain("named DECKO_");
  });

  it("refuses a non-object", () => {
    expect(refusalOf(() => validateServedVariables(["DECKO_X"])).marker).toBe(REFUSAL.SERVED_INVALID);
  });
});

describe("the read front is part of the default plan", () => {
  it("validatePayload names the front from the full engine's names when the payload does not", () => {
    const p = validatePayload(sample());
    expect(p.bunny.read_script_name).toBe(`${p.bunny.script_name}-read`);
    expect(p.bunny.read_pull_zone_name).toBe(`${p.bunny.pull_zone_name}-read`);
  });

  it("buildSteps plans both scripts, the read-only token and the front's wiring", () => {
    const p = validatePayload(sample());
    const steps = buildSteps(p, { sourcePath: null, writePathAllowed: false, served: [] });
    const names = steps.map((s: { name: string }) => s.name);
    expect(names.some((n: string) => n.includes(`create edge script "${p.bunny.script_name}"`))).toBe(true);
    expect(names.some((n: string) => n.includes(`create read front "${p.bunny.script_name}-read"`))).toBe(true);
    expect(names).toContain("issue a read-only database token for the read front");
    const publish = steps.find((s: { name: string }) => s.name === "publish both scripts");
    expect(publish).toBeDefined();
    expect(publish?.describe()).toContain("the read front first");
  });

  it("the plan says how many served variables it will carry", () => {
    const p = validatePayload(sample());
    const served = validateServedVariables({ DECKO_SERVED_ASSET_HOST: "https://assets.example.org" });
    const steps = buildSteps(p, { sourcePath: null, writePathAllowed: false, served });
    const vars = steps.find((s: { name: string }) => s.name === "apply edge options as script variables on both scripts");
    expect(vars).toBeDefined();
    expect(vars?.describe()).toContain("1 served variable(s) from --served");
  });
});
