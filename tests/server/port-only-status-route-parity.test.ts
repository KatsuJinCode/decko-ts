// GET /_status, the first of the port-only surfaces ([Family] row E1),
// measured against the PINNED deck's own route table and the PORT's own
// three hosts.
//
// The register's E1 row grades the port's health route, and the register's
// own basis is that "the register names the host(s) and the file:line in
// the port that serves it, so there is no Ruby behaviour it could fail to
// match". This file MEASURES that basis instead of restating it.
//
// fixtures/captured/port-only-routes-ruby-oracle.json is what
// tests/server/oracle-capture-port-only-routes-ruby.rb recorded: the
// PINNED deck's own route table, EXECUTED, reduced for this row's probe
// path, and the PORT's own serving source quoted with line numbers.
//
// WHAT THE MEASUREMENT SETTLES:
//
//   THE PINNED DECK ROUTES /_status TO A CARD READ, NOT TO A HEALTH
//   ANSWER. The executed table's first route that admits a GET for
//   /_status is the mark arm, and its action is card#read. So the pinned
//   deck's answer at that path is a card render of a card named
//   "_status" (which no deck has), and the health JSON the port serves
//   there is a PORT-ONLY SURFACE at a path the pinned table does route.
//   The distinction matters: the register's claim is that there is no
//   Ruby behaviour to match, and the measurement shows the Ruby behaviour
//   at that path is a card read, not a health answer.
//
//   THE PORT SERVES IT ON THREE HOSTS, and the three answers are the
//   port's own: the minimal reader's status JSON (measured here over its
//   own handler, with an injected card client), the edge engine's arm and
//   the staging server's arm (the port's own source, quoted in the
//   fixture).

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  handleRequest,
  type CardClient,
  type CardClientFactory,
} from "../../deploy/bunny-worker-src/bunny-worker.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/port-only-routes-ruby-oracle.json"), "utf8"),
) as {
  rows: Record<string, string>;
  reductions: Record<
    string,
    Array<{
      path: string;
      candidates: Array<{ order: number; verb: string; patterns: string[]; action: string }>;
      firstRouteAdmittingGet: number | null;
      firstRouteAdmittingPost: number | null;
      pinnedRouteCount: number;
    }>
  >;
  portSurface: Record<
    string,
    Array<{ host: string; file: string; lines: Array<{ line: number; text: string }> }>
  >;
};

const e1 = ORACLE.reductions["E1"][0];

describe("the port-only health route (E1), against the pinned deck's own table", () => {
  it("the pinned deck's own table is the one the reduction ran over", () => {
    expect(e1.pinnedRouteCount).toBe(29);
  });

  it("the pinned deck ROUTES /_status, and it routes it to a CARD READ", () => {
    // The first route that admits a GET for /_status is the mark arm,
    // and its action is card#read: the pinned deck's answer at that path
    // is a card render, never a health JSON.
    expect(e1.firstRouteAdmittingGet).toBe(2);
    const first = e1.candidates.find((entry) => entry.order === e1.firstRouteAdmittingGet);
    expect(first?.action).toBe("card#read");
    expect(first?.verb).toBe("get");
  });

  it("every candidate the reduction found for /_status is a card surface", () => {
    for (const candidate of e1.candidates) {
      expect(
        candidate.action.startsWith("card#"),
        `${candidate.patterns.join(",")} -> ${candidate.action}`,
      ).toBe(true);
    }
    // And no candidate carries a health or status action at all.
    expect(e1.candidates.some((candidate) => candidate.action.includes("status"))).toBe(false);
  });
});

describe("the port's own health route (E1)", () => {
  it("the minimal reader answers /_status with its own status JSON", async () => {
    // The port's own handler, with an injected card client: the answer is
    // the port's own bytes and no socket is opened.
    const client: CardClient = {
      async execute() {
        return { rows: [{ n: 3 }] };
      },
    };
    const factory: CardClientFactory = () => client;
    const response = await handleRequest(
      new Request("https://minimal-reader.test/_status"),
      {
        BUNNY_DB_URL: "https://db.test",
        BUNNY_DB_TOKEN: "token",
      },
      factory,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["ok"]).toBe(true);
    expect(body["engine"]).toBe("decko-ts");
    // The card count is the port's own database read, answered by the
    // injected client's COUNT.
    const database = body["database"] as Record<string, unknown>;
    expect(database["ok"]).toBe(true);
    expect(database["card_count"]).toBe(3);
  });

  it("the port's own three hosts each serve the route, and the port's own source says so", () => {
    const hosts = ORACLE.portSurface["E1"];
    expect(hosts.map((entry) => entry.host)).toEqual([
      "the minimal reader",
      "the edge engine",
      "the staging server",
    ]);
    for (const entry of hosts) {
      const text = entry.lines.map((line) => line.text).join("\n");
      expect(text, entry.host).toContain("/_status");
      expect(entry.lines.length, entry.host).toBeGreaterThan(0);
    }
  });
});
