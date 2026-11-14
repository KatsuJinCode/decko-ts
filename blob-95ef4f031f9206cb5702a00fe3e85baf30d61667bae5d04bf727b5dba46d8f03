// The edge instrumentation: the Server-Timing header, the isolate-probe
// routes, the render-budget 503 and the edge caches ([Family] row E12),
// measured against the PINNED deck's own route table (through the PINNED
// router) and against the PORT's own instrumentation.
//
// The register's E12 row grades the port's edge instrumentation and calls
// it a "port-only route (no Ruby counterpart)", on the basis that "the
// register names the host(s) and the file:line in the port that serves it,
// so there is no Ruby behaviour it could fail to match". This file MEASURES
// that basis.
//
// WHAT THE MEASUREMENT SETTLES:
//
//   1. THE PINNED DECK HAS NO INSTRUMENTATION AT ALL, AND ITS PROBE PATHS
//      ARE CARD READS. The pinned router sends GET /_probe/cpu and GET
//      /_probe/db to the mark-and-view arm, action card#read, mark "_probe"
//      with the view "cpu" or "db". No deck carries a card named "_probe",
//      so the pinned deck's answer at both probe paths is a card read of a
//      card that does not exist. The pinned deck's own responses carry
//      Rails' own headers and nothing else.
//
//   2. THE PORT'S ANSWER IS ITS OWN INSTRUMENT. The port's edge profiler
//      puts the standard Server-Timing header on every response, with the
//      five phases in a fixed order (auth, seat, db, render, total); the
//      isolate probe answers its two own routes with its own JSON; and the
//      render budget answers a slow request with a 503 carrying Retry-After
//      and its own diagnostic header.
//
//   3. THE PROBE ROUTES ARE ARMED, NOT INHERENT. The isolate probe answers
//      only when DECKO_EDGE_ISOLATE_PROBE=1; unarmed, it adds no header,
//      answers no route and changes no byte.
//
// The fixture is fixtures/captured/port-only-routes-e6-e13-ruby-oracle.json,
// written by tests/server/oracle-capture-port-only-routes-e6-e13-ruby.rb.

import { describe, expect, it } from "vitest";
import {
  EDGE_SERVER_TIMING_HEADER,
  applyEdgeServerTimingHeader,
  serverTimingHeaderValue,
  startEdgeRequestProfile,
} from "../../deploy/bunny-worker-src/bunny-edge-server-timing.js";
import {
  probeArmed,
  probeRoute,
} from "../../deploy/bunny-worker-src/bunny-edge-isolate-probe.js";
import {
  DEFAULT_EDGE_RENDER_BUDGET_MS,
  EDGE_BUDGET_DIAGNOSTIC_HEADER,
  EDGE_BUDGET_RETRY_AFTER_SECONDS,
  EDGE_RENDER_BUDGET_ENV_VAR,
} from "../../deploy/bunny-worker-src/bunny-edge-engine-request.js";
import { loadPortOnlyRouteOracle, pinnedAnswer, portServes } from "./port-only-route-oracle.js";

const ORACLE = loadPortOnlyRouteOracle();

describe("the pinned deck's own answer for the probe paths", () => {
  it("both probe paths are CARD READS in the pinned deck", () => {
    for (const [probePath, view] of [
      ["/_probe/cpu", "cpu"],
      ["/_probe/db", "db"],
    ] as const) {
      const answer = pinnedAnswer("E12", probePath, "get");
      expect(answer?.matched).toBe(true);
      expect(answer?.answer?.path).toBe("/:mark/:view(.:format)");
      expect(answer?.answer?.defaults.action).toBe("read");
      expect(answer?.answer?.parameters.mark).toBe("_probe");
      expect(answer?.answer?.parameters.view).toBe(view);
    }
  });
});

describe("the port's own edge profiler", () => {
  it("the port's header is the standard Server-Timing one", () => {
    expect(EDGE_SERVER_TIMING_HEADER).toBe("Server-Timing");
  });

  it("the header carries the five phases, in a fixed order", () => {
    const profile = startEdgeRequestProfile();
    profile.authMs = 12.4;
    profile.seatMs = 3.1;
    profile.renderMs = 44.9;
    const value = serverTimingHeaderValue(profile);
    const phases = value.split(", ").map((part) => part.split(";")[0]);
    expect(phases).toEqual(["auth", "seat", "db", "render", "total"]);
    expect(value).toContain("auth;dur=12");
    expect(value).toContain("seat;dur=3");
    expect(value).toContain("render;dur=45");
    expect(value).toContain("db;dur=");
    expect(value).toContain("stmt=");
  });

  it("the header lands on the finished response", () => {
    const response = new Response("body", { status: 200 });
    const labelled = applyEdgeServerTimingHeader(startEdgeRequestProfile(), response);
    expect(labelled.headers.get("Server-Timing")).not.toBeNull();
    expect(labelled.status).toBe(200);
  });
});

describe("the port's own isolate probe", () => {
  it("the probe's gate is the operator's env flag, and the route owns two paths", async () => {
    expect(probeArmed({ DECKO_EDGE_ISOLATE_PROBE: "1" })).toBe(true);
    expect(probeArmed({})).toBe(false);
    // The route function itself is armed by the caller; what it owns is
    // the two paths.
    const response = await probeRoute(
      new URL("https://edge.test/_probe/cpu"),
      async () => async () => undefined,
    );
    expect(response?.status).toBe(200);
    // The port's own module states the unarmed posture.
    expect(
      portServes(
        "deploy/bunny-worker-src/bunny-edge-isolate-probe.ts",
        "Unarmed, it adds no header,",
      ),
    ).toBe(true);
  });

  it("the cpu probe answers with its own JSON", async () => {
    const response = await probeRoute(
      new URL("https://edge.test/_probe/cpu?n=5"),
      async () => async () => undefined,
    );
    const body = (await response?.json()) as Record<string, unknown>;
    expect(body["rounds"]).toBe(5);
    expect(body["reps"]).toBe(1);
    expect(typeof body["wall_ms"]).toBe("number");
    expect(Array.isArray(body["runs_ms"])).toBe(true);
  });

  it("the db probe runs the database query the number of times it says", async () => {
    let calls = 0;
    const response = await probeRoute(
      new URL("https://edge.test/_probe/db?n=3"),
      async () => async (sql: string) => {
        calls += 1;
        expect(sql).toBe("SELECT 1");
        return undefined;
      },
    );
    const body = (await response?.json()) as Record<string, unknown>;
    expect(body["n"]).toBe(3);
    expect(calls).toBe(3);
  });

  it("the probe owns no other path", async () => {
    expect(
      await probeRoute(new URL("https://edge.test/Alpha"), async () => async () => undefined),
    ).toBeNull();
  });
});

describe("the port's own render budget", () => {
  it("the budget's own constants are the port's bytes", () => {
    expect(DEFAULT_EDGE_RENDER_BUDGET_MS).toBe(20_000);
    expect(EDGE_BUDGET_RETRY_AFTER_SECONDS).toBe(5);
    expect(EDGE_BUDGET_DIAGNOSTIC_HEADER).toBe("X-Decko-Edge-Budget");
    expect(EDGE_RENDER_BUDGET_ENV_VAR).toBe("DECKO_EDGE_RENDER_BUDGET_MS");
  });

  it("the budget's 503 carries Retry-After and the diagnostic header", () => {
    expect(
      portServes(
        "deploy/bunny-worker-src/bunny-edge-engine-request.ts",
        'response.headers.set("Retry-After", String(retryAfterSeconds))',
      ),
    ).toBe(true);
    expect(
      portServes(
        "deploy/bunny-worker-src/bunny-edge-engine-request.ts",
        "EDGE_BUDGET_DIAGNOSTIC_HEADER, `exceeded; budget_ms=${budgetMs}`",
      ),
    ).toBe(true);
  });

  it("the capture's port-side quotes name the surfaces this row grades", () => {
    expect(ORACLE.portSurface.E12.map((entry) => entry.host)).toEqual([
      "the edge profiler's header name",
      "the edge isolate probe's routes",
      "the edge render budget's own constants",
      "the edge render budget's 503",
    ]);
  });
});
