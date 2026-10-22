// GET /<name> record-JSON, the masked record surface ([Family] row E3),
// measured against the PINNED deck's own route table and the PORT's own
// minimal reader.
//
// The register's E3 row grades the port's record-JSON surface, and the
// register's own basis is that "the register names the host(s) and the
// file:line in the port that serves it, so there is no Ruby behaviour it
// could fail to match". This file MEASURES that basis.
//
// fixtures/captured/port-only-routes-ruby-oracle.json is what
// tests/server/oracle-capture-port-only-routes-ruby.rb recorded: the
// PINNED deck's own route table, EXECUTED, reduced for this row's probe
// path, and the PORT's own serving source quoted with line numbers.
//
// WHAT THE MEASUREMENT SETTLES:
//
//   THE PINNED DECK ANSWERS /Alpha.json WITH THE JSON FORMAT READ, NOT
//   WITH A RECORD DUMP. The executed table's mark arm carries the
//   (.:format) segment, so the path is a read of the card named "Alpha"
//   in the json format, and the answer there is that format's own view
//   (the molecule). The port's record JSON is a DIFFERENT surface at the
//   same path: the card's metadata, with its stored content WITHHELD.
//
//   So E3 is a port-only SEMANTIC at a path the pinned table does route,
//   and the distinction is worth measuring rather than asserting: the
//   pinned deck's answer at that path is a content-bearing render, and
//   the port's answer is a metadata record whose content is masked.

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
  reductions: Record<
    string,
    Array<{
      path: string;
      candidates: Array<{ order: number; verb: string; patterns: string[]; action: string }>;
      firstRouteAdmittingGet: number | null;
    }>
  >;
  portSurface: Record<
    string,
    Array<{ host: string; file: string; lines: Array<{ line: number; text: string }> }>
  >;
};

const recordPath = ORACLE.reductions["E3"][0];

describe("the port-only record-JSON surface (E3), against the pinned deck's own table", () => {
  it("the pinned deck answers /Alpha.json with a CARD READ in the json format", () => {
    expect(recordPath.firstRouteAdmittingGet).toBe(2);
    const first = recordPath.candidates.find((entry) => entry.order === 2);
    expect(first?.action).toBe("card#read");
    // The mark arm that carries the (.:format) segment is among the
    // candidates: that is the route the pinned deck answers /Alpha.json
    // with.
    const formatArm = recordPath.candidates.find((entry) =>
      entry.patterns.includes("/:mark(.:format)"),
    );
    expect(formatArm?.action).toBe("card#read");
    expect(formatArm?.verb).toBe("get");
  });

  it("every candidate the reduction found for /Alpha.json is a card surface", () => {
    for (const candidate of recordPath.candidates) {
      expect(candidate.action.startsWith("card#"), candidate.action).toBe(true);
    }
  });
});

describe("the port's own record-JSON surface (E3)", () => {
  it("the minimal reader answers /Alpha.json with a metadata record and NO content", async () => {
    const cards: Record<string, Record<string, unknown>> = {
      Alpha: {
        id: 7,
        name: "Alpha",
        key: "alpha",
        codename: null,
        type_id: 2,
        left_id: null,
        right_id: null,
        db_content: "THE STORED CONTENT",
        trash: 0,
        created_at: "2026-10-22 00:00:00",
        updated_at: "2026-10-22 00:00:00",
      },
    };
    const client: CardClient = {
      async execute(statement, args) {
        const sql = typeof statement === "string" ? statement : statement.sql;
        const bound = typeof statement === "string" ? (args ?? []) : (statement.args ?? []);
        if (/COUNT\(\*\)/i.test(sql)) return { rows: [{ n: 1 }] };
        const name = String(bound[0] ?? "");
        const row = cards[name];
        return { rows: row ? [row] : [] };
      },
    };
    const factory: CardClientFactory = () => client;
    const response = await handleRequest(
      new Request("https://minimal-reader.test/Alpha.json"),
      { BUNNY_DB_URL: "https://db.test", BUNNY_DB_TOKEN: "token" },
      factory,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = await response.text();
    // The record carries the card's metadata.
    expect(body).toContain("Alpha");
    // And the card's STORED CONTENT is withheld: the JSON record carries
    // the metadata and no content field at all, so the stored content
    // cannot leak through it.
    expect(body).not.toContain("THE STORED CONTENT");
    expect(body).not.toContain("db_content");
    // The withheld marker is the HTML record view's own line (the port's
    // own source quotes it below): the JSON record has no content field
    // to mark.
  });

  it("the port's own source carries the record arm and the withheld-content line", () => {
    const surface = ORACLE.portSurface["E3"];
    const hosts = surface.map((entry) => entry.host);
    expect(hosts).toContain("the minimal reader");
    expect(hosts).toContain("the minimal reader's masked content");
    const masked = surface.find((entry) => entry.host === "the minimal reader's masked content");
    const text = masked?.lines.map((line) => line.text).join("\n") ?? "";
    expect(text).toContain("withheld");
  });
});
