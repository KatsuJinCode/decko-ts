// The one-key Bunny provisioning for a writable deck: the plan names the
// storage zone, the first-run gate and the setup token, and the token SQL
// stores only a sha256 that the edge's gate (src/server/setup-token.ts)
// accepts for the printed token. Offline: no Bunny account is contacted.

import { describe, it, expect } from "vitest";
import { buildSteps, setupTokenIssue } from "../../deploy/provisioning/provision-bunny-deck.mjs";
import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import { verifySetupToken } from "../../src/server/setup-token.js";
import { readFileSync } from "node:fs";

const payload = (writePath: boolean) => ({
  bunny: {
    script_name: "deck",
    db_name: "deck-db",
    db_group_name: "deck-group",
    storage_region: "DE",
    primary_region: "DE",
    replica_regions: [],
    db_token_authorization: "full-access",
    pull_zone_name: "deck-zone",
  },
  deck: { limit: 0 },
  edge: { cache_enabled: false, render_budget_ms: 1000, write_path: writePath },
});

describe("Bunny provisioning for a writable deck", () => {
  it("plans a storage zone, the first-run gate and the setup token when writes are on", () => {
    const steps = buildSteps(payload(true) as never, { sourcePath: "deck.sqlite", writePathAllowed: true });
    const names = steps.map((s) => s.name);
    expect(names).toContain('create storage zone "deck-files"');
    expect(names).toContain("issue the first-run setup token");
    const vars = steps.find((s) => s.name === "apply edge options as script variables")!.describe();
    expect(vars).toMatch(/DECKO_FIRST_RUN=1/);
    expect(vars).toMatch(/DECKO_STORAGE_ZONE/);
    // The token is issued after the deck answers, so the printed link works.
    expect(names.indexOf("issue the first-run setup token")).toBeGreaterThan(names.indexOf("verify the new deck responds"));
  });

  it("plans none of them for a read-only deck", () => {
    const names = buildSteps(payload(false) as never, { sourcePath: "deck.sqlite", writePathAllowed: false }).map((s) => s.name);
    expect(names.some((n) => /storage zone|setup token/.test(n))).toBe(false);
  });

  it("stores a digest the edge gate accepts for the printed token, and only that token", async () => {
    const driver = new LocalSqliteDriver();
    await driver.query(readFileSync("deploy/migrations/0010-first-run-setup-token.sql", "utf8").replace(/^--.*$/gm, ""), []);
    const issue = setupTokenIssue();
    for (const sql of issue.statements) await driver.query(sql, []);
    expect(issue.path).toBe(`/setup?token=${issue.token}`);
    expect(issue.statements.join(" ")).not.toContain(issue.token);
    expect(await verifySetupToken(driver, issue.token)).toEqual({ ok: true, token: issue.token });
    expect(await verifySetupToken(driver, "not-the-token")).toEqual({ ok: false, reason: "mismatch" });
    // A second issue replaces the first.
    const next = setupTokenIssue();
    for (const sql of next.statements) await driver.query(sql, []);
    expect((await verifySetupToken(driver, issue.token)).ok).toBe(false);
    expect((await verifySetupToken(driver, next.token)).ok).toBe(true);
  });
});
