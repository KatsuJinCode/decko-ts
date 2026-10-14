// The Bunny edge's file storage and periodic sweep (deploy/bunny-worker-src/
// bunny-edge-files.ts), over the local mock of the Bunny Storage HTTP API
// (tests/server/mock-bunny-storage.mjs). No network: the mock is a local
// server, and the driver's fetch is the mock's.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startMockBunnyStorage } from "./mock-bunny-storage.mjs";
import {
  BUNNY_EDGE_SWEEP_INTERVAL_MS,
  EdgeSweepClock,
  bunnyEdgeAttachmentStore,
  bunnyEdgeFilesDriver,
  maybeRunEdgeSweep,
} from "../../deploy/bunny-worker-src/bunny-edge-files.js";
import type { SQLDatabaseDriver } from "../../src/server/driver.js";

type Mock = Awaited<ReturnType<typeof startMockBunnyStorage>>;

/** A driver that records statements and reports a fixed rowsAffected. */
function recordingDriver(rowsAffected = 0): { driver: SQLDatabaseDriver; sql: string[] } {
  const sql: string[] = [];
  const driver = {
    async query(statement: string) {
      sql.push(statement);
      return { rows: [], rowsAffected };
    },
  } as unknown as SQLDatabaseDriver;
  return { driver, sql };
}

describe("Bunny edge file storage (mock Storage API)", () => {
  let mock: Mock;

  beforeAll(async () => {
    mock = await startMockBunnyStorage();
  });
  afterAll(async () => {
    await mock?.stop();
  });
  beforeEach(() => {
    mock.reset();
  });

  function env(): Record<string, string> {
    return { DECKO_STORAGE_ZONE: mock.zone, DECKO_STORAGE_PASSWORD: mock.password, DECKO_STORAGE_HOST: mock.host };
  }

  it("is off when no storage zone is configured", () => {
    expect(bunnyEdgeFilesDriver({})).toBeUndefined();
    expect(bunnyEdgeAttachmentStore({})).toBeUndefined();
  });

  it("refuses a half-configured zone instead of running without files", () => {
    expect(() => bunnyEdgeFilesDriver({ DECKO_STORAGE_ZONE: "z" })).toThrow(/DECKO_STORAGE_PASSWORD/);
    expect(() => bunnyEdgeFilesDriver({ DECKO_STORAGE_PASSWORD: "p" })).toThrow(/DECKO_STORAGE_ZONE/);
  });

  it("stores and reads back bytes through the configured zone", async () => {
    const files = bunnyEdgeFilesDriver(env(), mock.fetch)!;
    await files.put("assets/style.css", new TextEncoder().encode("body{}"), { contentType: "text/css" });
    const got = await files.getBytes("assets/style.css");
    expect(new TextDecoder().decode(got)).toBe("body{}");
  });

  it("sweeps expired sessions and abandoned upload drafts, leaving stored files", async () => {
    const files = bunnyEdgeFilesDriver(env(), mock.fetch)!;
    await files.put("tmp/draft-1/a.png", new Uint8Array([1]));
    await files.put("tmp/draft-2/b.png", new Uint8Array([2]));
    await files.put("123/kept.png", new Uint8Array([3]));
    const { driver, sql } = recordingDriver(2);
    // Two days on, both drafts are past the one-day limit.
    const now = new Date(Date.now() + 2 * BUNNY_EDGE_SWEEP_INTERVAL_MS);
    const outcome = await maybeRunEdgeSweep(new EdgeSweepClock(), { driver, files }, now);
    expect(outcome).toEqual({ sessionsDeleted: 2, draftsDeleted: 2 });
    expect(sql.some((s) => /DELETE FROM "auth_sessions"/.test(s))).toBe(true);
    expect((await files.list("tmp/")).length).toBe(0);
    expect(await files.getBytes("123/kept.png")).toEqual(new Uint8Array([3]));
  });

  it("keeps drafts younger than a day", async () => {
    const files = bunnyEdgeFilesDriver(env(), mock.fetch)!;
    await files.put("tmp/draft-1/a.png", new Uint8Array([1]));
    const outcome = await maybeRunEdgeSweep(new EdgeSweepClock(), { driver: recordingDriver().driver, files }, new Date());
    expect(outcome).toEqual({ sessionsDeleted: 0, draftsDeleted: 0 });
    expect((await files.list("tmp/")).length).toBe(1);
  });
});

describe("Bunny edge sweep clock", () => {
  it("runs at most once per interval per isolate", async () => {
    const clock = new EdgeSweepClock();
    const { driver, sql } = recordingDriver();
    const t0 = new Date("2026-10-14T00:00:00Z");
    expect(await maybeRunEdgeSweep(clock, { driver }, t0)).not.toBeNull();
    expect(await maybeRunEdgeSweep(clock, { driver }, new Date(t0.getTime() + 60_000))).toBeNull();
    expect(await maybeRunEdgeSweep(clock, { driver }, new Date(t0.getTime() + BUNNY_EDGE_SWEEP_INTERVAL_MS))).not.toBeNull();
    expect(sql.length).toBe(2);
  });

  it("reports a failed sweep without failing the request that carried it", async () => {
    const failing = {
      async query() {
        throw new Error("database unreachable");
      },
    } as unknown as SQLDatabaseDriver;
    const reports: string[] = [];
    const outcome = await maybeRunEdgeSweep(new EdgeSweepClock(), { driver: failing }, new Date(), (m) => reports.push(m));
    expect(outcome).toBeNull();
    expect(reports).toEqual(["bunny edge: periodic sweep failed: database unreachable"]);
  });
});
