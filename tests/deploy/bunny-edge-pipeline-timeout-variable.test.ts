// The per-pipeline timeout variable (P1 incident 2026-10-03,
// edge-incident-fix lane): deploy/bunny-worker-src/bunny-edge-engine-request.ts
// — EDGE_PIPELINE_TIMEOUT_ENV_VAR / resolveEdgePipelineTimeoutMs — and the
// raised default in src/card/drivers/bunny-db.ts —
// DEFAULT_PIPELINE_TIMEOUT_MS.
//
// WHAT HAPPENED: release 1126057 shipped the cold-render safety bounds (a
// 5,000 ms per-pipeline abort) while the render still ran whole-deck
// recursive walks (one measured 1.87 MB / 3.8 s warm from the edge, longer
// for a visitor at network distance). Real visitors' hops legitimately
// exceeded the 5 s bound, the abort surfaced as "Pipeline Transport failed
// ... signal timed out", and the site was unloadable — reproducible on
// every refresh.
//
// WHAT IS BEING PINNED, and why each case is red without the change:
//
//  1. The default is 15,000 ms — the incident fix literal. Red at 5,000.
//  2. The hop bound sits BELOW the whole-request render budget
//     (DEFAULT_EDGE_RENDER_BUDGET_MS, 20,000 ms) — the relationship that
//     keeps a slow hop the request's own deadline problem rather than the
//     platform's. Red if anyone raises the hop default past the budget.
//  3. The resolver fails SAFE: absent, empty, whitespace, unparseable, and
//     negative all keep the measured default; a typo in the edge variable
//     must not turn into "no per-hop bound" (the pre-lane behavior).
//  4. An explicit "0" passes 0 through, which the driver maps to "no abort
//     signal" — the operator's rollback that needs no republish.
//  5. The driver default and the resolver default CANNOT DRIFT: a driver
//     built with no timeoutMs option carries exactly what an absent edge
//     variable resolves to.
//  6. Fractional values truncate — the variable carries whole milliseconds,
//     same semantics as the render budget resolver.

import { describe, expect, it } from "vitest";

import {
  DEFAULT_EDGE_RENDER_BUDGET_MS,
  EDGE_PIPELINE_TIMEOUT_ENV_VAR,
  resolveEdgePipelineTimeoutMs,
} from "../../deploy/bunny-worker-src/bunny-edge-engine-request.js";
import {
  BunnyDbDriver,
  DEFAULT_PIPELINE_TIMEOUT_MS,
} from "../../src/card/drivers/bunny-db.js";

function driverTimeoutMs(options: ConstructorParameters<typeof BunnyDbDriver>[0]): number | undefined {
  return (new BunnyDbDriver(options) as unknown as { timeoutMs?: number }).timeoutMs;
}

describe("bunny edge — per-pipeline timeout variable (edge-incident-fix)", () => {
  it("the default per-pipeline timeout is 15,000 ms — the incident fix literal (was 5,000)", () => {
    expect(DEFAULT_PIPELINE_TIMEOUT_MS).toBe(15_000);
  });

  it("the hop bound sits below the whole-request render budget", () => {
    expect(DEFAULT_PIPELINE_TIMEOUT_MS).toBeLessThan(DEFAULT_EDGE_RENDER_BUDGET_MS);
  });

  it("the env var is named DECKO_EDGE_PIPELINE_TIMEOUT_MS", () => {
    expect(EDGE_PIPELINE_TIMEOUT_ENV_VAR).toBe("DECKO_EDGE_PIPELINE_TIMEOUT_MS");
  });

  it("the resolver fails safe: absent, empty, whitespace, garbage, negative all keep the default", () => {
    expect(resolveEdgePipelineTimeoutMs({})).toBe(DEFAULT_PIPELINE_TIMEOUT_MS);
    expect(resolveEdgePipelineTimeoutMs({ [EDGE_PIPELINE_TIMEOUT_ENV_VAR]: undefined })).toBe(
      DEFAULT_PIPELINE_TIMEOUT_MS,
    );
    expect(resolveEdgePipelineTimeoutMs({ [EDGE_PIPELINE_TIMEOUT_ENV_VAR]: "" })).toBe(
      DEFAULT_PIPELINE_TIMEOUT_MS,
    );
    expect(resolveEdgePipelineTimeoutMs({ [EDGE_PIPELINE_TIMEOUT_ENV_VAR]: "   " })).toBe(
      DEFAULT_PIPELINE_TIMEOUT_MS,
    );
    expect(resolveEdgePipelineTimeoutMs({ [EDGE_PIPELINE_TIMEOUT_ENV_VAR]: "garbage" })).toBe(
      DEFAULT_PIPELINE_TIMEOUT_MS,
    );
    expect(resolveEdgePipelineTimeoutMs({ [EDGE_PIPELINE_TIMEOUT_ENV_VAR]: "-1" })).toBe(
      DEFAULT_PIPELINE_TIMEOUT_MS,
    );
    expect(resolveEdgePipelineTimeoutMs({ [EDGE_PIPELINE_TIMEOUT_ENV_VAR]: "Infinity" })).toBe(
      DEFAULT_PIPELINE_TIMEOUT_MS,
    );
  });

  it("an explicit value retunes; an explicit 0 is the no-republish rollback", () => {
    expect(resolveEdgePipelineTimeoutMs({ [EDGE_PIPELINE_TIMEOUT_ENV_VAR]: "9000" })).toBe(9_000);
    expect(resolveEdgePipelineTimeoutMs({ [EDGE_PIPELINE_TIMEOUT_ENV_VAR]: "0" })).toBe(0);
  });

  it("fractional values truncate to whole milliseconds, same as the budget resolver", () => {
    expect(resolveEdgePipelineTimeoutMs({ [EDGE_PIPELINE_TIMEOUT_ENV_VAR]: "12.9" })).toBe(12);
  });

  it("driver default and resolver default cannot drift", () => {
    expect(driverTimeoutMs({ url: "https://db.example", authToken: "t" })).toBe(
      resolveEdgePipelineTimeoutMs({}),
    );
  });

  it("a resolver-returned 0 reaches the driver as no abort signal", () => {
    expect(driverTimeoutMs({ url: "https://db.example", authToken: "t", timeoutMs: 0 })).toBeUndefined();
  });
});
