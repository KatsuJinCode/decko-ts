import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SESSION_COOKIE_NAME } from "../../src/server/write-routes.js";
import { READ_EDGE_SESSION_COOKIE, readEdgeForwards } from "../../deploy/bunny-worker-src/bunny-edge-read-handler.js";
import { edgeNameMatchResponse } from "../../deploy/bunny-worker-src/bunny-edge-deck-config.js";
import type { SQLDatabaseDriver, QueryResult } from "../../src/server/driver.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

describe("bunny-edge-read-handler additive lazy-loading contract", () => {
  it("pins READ_EDGE_SESSION_COOKIE equal to SESSION_COOKIE_NAME", () => {
    expect(READ_EDGE_SESSION_COOKIE).toBe(SESSION_COOKIE_NAME);
  });

  it("answers card-name autocomplete (name_match) in 1 DB trip cold and 1 DB trip warm without booting Deck", async () => {
    let trips = 0;
    const evalQuery = <T = Record<string, unknown>>(sql: string): QueryResult<T> => {
      if (sql.includes("deck_data_version")) {
        return { rows: [{ version: 1 }] as unknown as T[], rowCount: 1 };
      }
      if (sql.includes("SELECT id, codename, key, left_id FROM cards WHERE codename IN")) {
        return { rows: [{ id: 1, codename: "anyone", key: "anyone", left_id: null }] as unknown as T[], rowCount: 1 };
      }
      if (sql.includes("SELECT refs.referee_id AS partyId, read_rules.id AS readRuleId")) {
        return { rows: [{ partyId: 1, readRuleId: 200 }] as unknown as T[], rowCount: 1 };
      }
      if (sql.includes("SELECT COUNT(*) AS c")) {
        return { rows: [{ c: 1, catchAll: 1 }] as unknown as T[], rowCount: 1 };
      }
      if (sql.toLowerCase().includes("from cards where trash = 0 and name is not null")) {
        return {
          rows: [
            { id: 10, name: "Home", read_rule_id: 200 },
            { id: 11, name: "Show Home", read_rule_id: 200 },
          ] as unknown as T[],
          rowCount: 2,
        };
      }
      return { rows: [], rowCount: 0 };
    };
    const driver: SQLDatabaseDriver = {
      dialect: "sqlite",
      async query<T = Record<string, unknown>>(sql: string): Promise<QueryResult<T>> {
        trips += 1;
        return evalQuery<T>(sql);
      },
      async batch(statements) {
        trips += 1;
        return statements.map((s) => evalQuery(s.sql));
      },
      async execute() {
        return { rowsAffected: 0 };
      },
      async transaction(fn) {
        return fn(this);
      },
      async close() {},
    };
    let deckBooted = false;
    const url = new URL("https://example.com/Home+by_name.json?view=name_match&term=Ho");
    const coldRes = await edgeNameMatchResponse(
      new Request(url, { method: "GET" }),
      url,
      driver,
      async () => {
        deckBooted = true;
        throw new Error("should not boot Deck");
      },
    );
    expect(coldRes).not.toBeNull();
    expect(coldRes!.status).toBe(200);
    expect(deckBooted).toBe(false);
    expect(trips).toBe(1);
    expect(await coldRes!.json()).toEqual(["Home", "Show Home"]);

    trips = 0;
    const warmRes = await edgeNameMatchResponse(
      new Request(url, { method: "GET" }),
      url,
      driver,
      async () => {
        deckBooted = true;
        throw new Error("should not boot Deck");
      },
    );
    expect(warmRes).not.toBeNull();
    expect(warmRes!.status).toBe(200);
    expect(deckBooted).toBe(false);
    expect(trips).toBe(1);
    expect(await warmRes!.json()).toEqual(["Home", "Show Home"]);
  });

  it("serves BOTH anonymous and signed-in page reads, admin views, edit forms, autocomplete, API-key/token reads, and sign-out on the lean worker", () => {
    for (const url of [
      "https://example.com/",
      "https://example.com/Home",
      "https://example.com/Home/edit",
      "https://example.com/new/Sign_up",
      "https://example.com/*admin",
      "https://example.com/_status",
      "https://example.com/api/status",
      "https://example.com/api/card/Home",
      "https://example.com/Home+by_name.json?view=name_match&term=ho",
      "https://example.com/files/1234/image.png",
    ]) {
      expect(readEdgeForwards(new Request(url, { method: "GET" }))).toBe(false);
      expect(readEdgeForwards(new Request(url, { method: "HEAD" }))).toBe(false);
      expect(readEdgeForwards(new Request(url, {
        method: "GET",
        headers: { cookie: `${READ_EDGE_SESSION_COOKIE}=tok123` },
      }))).toBe(false);
    }
    expect(readEdgeForwards(new Request("https://example.com/Home", {
      method: "GET",
      headers: { authorization: "Bearer tok123" },
    }))).toBe(false);
    expect(readEdgeForwards(new Request("https://example.com/Home", {
      method: "GET",
      headers: { "x-api-key": "key123" },
    }))).toBe(false);
    expect(readEdgeForwards(new Request("https://example.com/Home?token=tok123", { method: "GET" }))).toBe(false);
    expect(readEdgeForwards(new Request("https://example.com/Home?api_key=key123", { method: "GET" }))).toBe(false);
    expect(readEdgeForwards(new Request("https://example.com/_signout", { method: "GET" }))).toBe(false);
    expect(readEdgeForwards(new Request("https://example.com/_signout", { method: "POST" }))).toBe(false);
  });

  it("forwards only actual card mutations, /_signin, /setup, remote GET write actions, and /mod/ vendor packs on demand", () => {
    expect(readEdgeForwards(new Request("https://example.com/Home", { method: "POST" }))).toBe(true);
    expect(readEdgeForwards(new Request("https://example.com/_signin", { method: "GET" }))).toBe(true);
    expect(readEdgeForwards(new Request("https://example.com//_signin", { method: "GET" }))).toBe(true);
    expect(readEdgeForwards(new Request("https://example.com/setup", { method: "GET" }))).toBe(true);
    expect(readEdgeForwards(new Request("https://example.com//setup", { method: "GET" }))).toBe(true);
    expect(readEdgeForwards(new Request("https://example.com/mod/bootstrap/fontawesome-6.7.2/css/all.min.css", { method: "GET" }))).toBe(true);
    expect(readEdgeForwards(new Request("https://example.com//mod/bootstrap/fontawesome-6.7.2/css/all.min.css", { method: "GET" }))).toBe(true);
    expect(readEdgeForwards(new Request("https://example.com/mod/tinymce_editor/plugins/nest/plugin.min.js", { method: "GET" }))).toBe(true);
    expect(readEdgeForwards(new Request("https://example.com/delete/*signin", { method: "GET" }))).toBe(true);
    expect(readEdgeForwards(new Request("https://example.com//delete/*signin", { method: "GET" }))).toBe(true);
    expect(readEdgeForwards(new Request("https://example.com/update/Home", { method: "GET" }))).toBe(true);
    expect(readEdgeForwards(new Request("https://example.com/card/update/Home", { method: "GET" }))).toBe(true);
    expect(readEdgeForwards(new Request("https://example.com/files/:style_mods/style-123.css", { method: "GET" }))).toBe(true);
  });

  it("enforces the <= 1.34 MiB (1,400,000-byte) lean read worker budget and zero dormant admin compilers or base64 favicon rasters", () => {
    const bundlePath = resolve(REPO_ROOT, "deploy/dist/cf-edge-engine.bundle.js");
    const bundleText = readFileSync(bundlePath, "utf8");
    const bytes = Buffer.byteLength(bundleText, "utf8");
    expect(bytes).toBeGreaterThan(500_000);
    expect(bytes).toBeLessThanOrEqual(1_400_000);
    for (const forbidden of [
      ":favicon/carrierwave.png",
      "libsass-3.6.4-wasm",
      "photon_rs_bg.wasm",
      "CoffeeScript Compiler",
    ]) {
      expect(bundleText.includes(forbidden)).toBe(false);
    }
  });
});
