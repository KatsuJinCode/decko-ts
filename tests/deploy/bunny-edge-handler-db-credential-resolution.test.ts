// Unit tests for the FULL-ENGINE handler's database credential resolution
// order (deploy/bunny-worker-src/bunny-edge-engine-handler.ts resolveDbConfig
// — the handler carries its OWN copy of the pair list, separate from the
// lightweight reader's bunny-worker.ts, so this file pins THIS copy).
//
// Why these exist (db-repoint lane, 2026-10-05): the deployed edge worker
// read its database endpoint ONLY from dashboard-injected secrets
// (BUNNY_DATABASE_URL / BUNNY_DATABASE_AUTH_TOKEN, then the repo-historical
// BUNNY_DB_URL / BUNNY_DB_TOKEN) — names the management API never exposes,
// which made repointing the serving database (decko-edge -> restore-deck-synthetic)
// a secrets round-trip. The resolution now checks the PLAIN edge-script
// variable pair DECKO_DB_URL / DECKO_DB_TOKEN FIRST (settable through the
// management API by name), falling back to the two secret pairs unchanged.
// These tests pin the ORDER — plain wins, secrets remain the fallback in
// their documented order, and a half-set pair still errors by name — plus
// the no-value-echo rule (names only, never values).

import { describe, expect, it } from "vitest";

import {
  DB_CREDENTIAL_VAR_NAMES,
  resolveDbConfig,
} from "../../deploy/bunny-worker-src/bunny-edge-engine-handler.js";

const PLAIN = {
  DECKO_DB_URL: "libsql://01SYNTHETICULID0000000000000-restore-deck-synthetic-synthetic.lite.bunnydb.net/",
  DECKO_DB_TOKEN: "plain-token",
};
const SECRETS = {
  BUNNY_DATABASE_URL: "libsql://secrets-pair.lite.bunnydb.net/",
  BUNNY_DATABASE_AUTH_TOKEN: "secrets-token",
};
const LEGACY = {
  BUNNY_DB_URL: "libsql://legacy-pair.lite.bunnydb.net/",
  BUNNY_DB_TOKEN: "legacy-token",
};

describe("bunny edge engine handler — db credential resolution order", () => {
  it("the PLAIN variable pair is the FIRST documented pair", () => {
    expect(DB_CREDENTIAL_VAR_NAMES[0].url).toBe("DECKO_DB_URL");
    expect(DB_CREDENTIAL_VAR_NAMES[0].token).toBe("DECKO_DB_TOKEN");
  });

  it("prefers the plain DECKO_DB_* pair over the dashboard-injected secrets when both are set", () => {
    const resolved = resolveDbConfig({ ...PLAIN, ...SECRETS });
    expect("error" in resolved).toBe(false);
    if ("error" in resolved) return;
    expect(resolved.url).toBe(PLAIN.DECKO_DB_URL.replace(/^libsql:\/\//i, "https://"));
    expect(resolved.authToken).toBe(PLAIN.DECKO_DB_TOKEN);
    expect(resolved.urlVar).toBe("DECKO_DB_URL");
    expect(resolved.tokenVar).toBe("DECKO_DB_TOKEN");
  });

  it("falls back to the bunny.net-injected secret pair when no plain pair is set", () => {
    const resolved = resolveDbConfig({ ...SECRETS });
    expect("error" in resolved).toBe(false);
    if ("error" in resolved) return;
    expect(resolved.urlVar).toBe("BUNNY_DATABASE_URL");
    expect(resolved.tokenVar).toBe("BUNNY_DATABASE_AUTH_TOKEN");
  });

  it("falls back to the legacy BUNNY_DB_* secret pair when it is the only one set", () => {
    const resolved = resolveDbConfig({ ...LEGACY });
    expect("error" in resolved).toBe(false);
    if ("error" in resolved) return;
    expect(resolved.urlVar).toBe("BUNNY_DB_URL");
    expect(resolved.tokenVar).toBe("BUNNY_DB_TOKEN");
  });

  it("reports a half-set PLAIN pair by name instead of silently falling through to the secrets", () => {
    const resolved = resolveDbConfig({ DECKO_DB_URL: PLAIN.DECKO_DB_URL, ...SECRETS });
    expect("error" in resolved).toBe(true);
    if (!("error" in resolved)) return;
    expect(resolved.error).toBe(
      "DECKO_DB_URL is set but its partner (DECKO_DB_TOKEN) is not",
    );
  });

  it("names the first documented pair when nothing is set", () => {
    const resolved = resolveDbConfig({});
    expect("error" in resolved).toBe(true);
    if (!("error" in resolved)) return;
    expect(resolved.error).toBe(
      `no database credentials in env; set ${DB_CREDENTIAL_VAR_NAMES[0].url} and ${DB_CREDENTIAL_VAR_NAMES[0].token}`,
    );
  });

  it("never echoes a credential VALUE — the resolved shape carries the token only for the driver, the reported fields are names", () => {
    const resolved = resolveDbConfig({ ...PLAIN });
    expect("error" in resolved).toBe(false);
    if ("error" in resolved) return;
    const reported = JSON.stringify({ urlVar: resolved.urlVar, tokenVar: resolved.tokenVar });
    expect(reported).not.toContain(PLAIN.DECKO_DB_TOKEN);
    expect(reported).not.toContain("bunnydb.net");
  });
});
