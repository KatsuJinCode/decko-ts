// The deploy/migrations numbering-collision contract: canonical total order,
// applied-set compatibility alias, and directory/manifest drift guard.
//
// WHY THIS FILE EXISTS. The assembled trunk carries TWO migrations numbered
// 0003 — `0003-deck-data-version-stamp.sql` (trunk's stamp backfill for
// already-provisioned databases) and `0003-demo-seed.sql` (the generated
// demo deck, deploy/sync-migrations.mjs:38). The seat branch had numbered the
// same stamp backfill 0007 (its lineage never had the demo-seed 0003), so
// provisioned databases exist whose applied-migration ledgers carry
// "0007-deck-data-version-stamp.sql" while this trunk's directory carries
// "0003-deck-data-version-stamp.sql" (seat-branch-merge-map.md §2; the r5
// assembly receipt escalated the collision to the deploy/edge lane).
//
// The deploy chain's runner is EXTERNAL (package.json:18,
// `wrangler d1 migrations apply`, migrations_dir at wrangler.toml:104), and
// its behavior was verified first-hand at wrangler 4.148.0 --local (probe
// receipt: tmp/wrong-goal-hunt/migration-0003-collision-lane.md §1): it
// enumerates *.sql in lexical filename order, records full filenames in
// d1_migrations, dedupes by exact filename, silently ignores recorded names
// that no longer match a file, and re-runs any file whose name is not
// recorded. Consequences this contract pins:
//
//   1. Every filename in deploy/migrations is a LOAD-BOOKKEEPING KEY: the
//      fix for the collision must rename NOTHING (a rename re-keys every
//      provisioned database's ledger and re-runs the renamed file).
//   2. The pair's mutual order is defined by the lexical filename sort
//      (stamp before seed). This file pins that order in-repo so the
//      in-repo consumers and the external runner can never disagree, and
//      so the end-state-safety of the pair is a named, tested fact rather
//      than luck.
//   3. Applied-set INTERPRETATION must be alias-complete: a ledger that
//      recorded the seat-lineage name (0007-deck-data-version-stamp.sql)
//      has the stamp migration applied. Old name recorded = new name
//      considered applied — no re-run, no skip, no re-key.
//
// STORAGE. No database is opened; the tests read the deploy/migrations
// directory (the collision shape itself) and exercise the pure contract
// functions over ledger arrays.

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DECK_DATA_VERSION_STAMP_APPLIED_ALIASES,
  DECK_DATA_VERSION_STAMP_FILENAME,
  DEPLOY_MIGRATION_ORDER,
  assertDeployMigrationsMatchManifest,
  canonicalAppliedFilenames,
  unappliedDeployMigrations,
} from "../../src/server/deploy-migrations.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const MIGRATIONS_DIR = join(REPO_ROOT, "deploy", "migrations");

describe("deploy/migrations collision shape (the defect, as found)", () => {
  it("carries exactly two migrations numbered 0003 — the stamp backfill and the demo seed", () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    const numbered0003 = files.filter((f) => f.startsWith("0003-"));
    expect(numbered0003).toEqual([
      "0003-deck-data-version-stamp.sql",
      "0003-demo-seed.sql",
    ]);
  });
});

describe("the canonical manifest (order the external runner already applies)", () => {
  it("names every file in deploy/migrations exactly once — no drift, no missing entry", () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    expect(DEPLOY_MIGRATION_ORDER.map((m) => m.filename).sort()).toEqual(files);
  });

  it("is a deterministic total order: numeric prefix ascending, filename tiebreak ascending", () => {
    const keys = DEPLOY_MIGRATION_ORDER.map((m) => `${m.number}~${m.filename}`);
    expect([...keys].sort()).toEqual(keys);
    // And the parse is real: every filename's number prefix was extracted.
    for (const m of DEPLOY_MIGRATION_ORDER) {
      expect(m.filename.startsWith(`${m.number}-`)).toBe(true);
    }
  });

  it("pins the exact filenames in order — they are provisioned databases' bookkeeping keys", () => {
    expect(DEPLOY_MIGRATION_ORDER.map((m) => m.filename)).toEqual([
      "0001-schema.sql",
      "0002-card-text-binary-lookup-indexes.sql",
      "0003-deck-data-version-stamp.sql",
      "0003-demo-seed.sql",
      "0004-demo-account-substrate.sql",
      "0005-auth-sessions.sql",
      "0006-demo-role-substrate.sql",
      "0008-cards-serving-path-indexes.sql",
    ]);
  });

  it("orders the two 0003s stamp-before-seed (the lexical order wrangler applies)", () => {
    const names = DEPLOY_MIGRATION_ORDER.map((m) => m.filename);
    expect(names.indexOf("0003-deck-data-version-stamp.sql")).toBeLessThan(
      names.indexOf("0003-demo-seed.sql"),
    );
  });
});

describe("applied-set compatibility alias (old name recorded = new name applied)", () => {
  it("declares the seat-lineage stamp name as an alias of the current stamp filename", () => {
    expect(DECK_DATA_VERSION_STAMP_FILENAME).toBe("0003-deck-data-version-stamp.sql");
    expect(DECK_DATA_VERSION_STAMP_APPLIED_ALIASES).toContain(
      "0007-deck-data-version-stamp.sql",
    );
  });

  it("a seat-lineage ledger (0007 recorded) resolves stamp-applied and needs no re-run", () => {
    const seatLineageLedger = [
      "0001-schema.sql",
      "0002-card-text-binary-lookup-indexes.sql",
      "0007-deck-data-version-stamp.sql",
      "0003-demo-seed.sql",
    ];
    const resolved = canonicalAppliedFilenames(seatLineageLedger);
    expect(resolved.applied.has("0003-deck-data-version-stamp.sql")).toBe(true);
    expect(resolved.unknownRecorded).toEqual([]);
    expect(unappliedDeployMigrations(seatLineageLedger)).toEqual([
      "0004-demo-account-substrate.sql",
      "0005-auth-sessions.sql",
      "0006-demo-role-substrate.sql",
      "0008-cards-serving-path-indexes.sql",
    ]);
  });

  it("a fully current ledger needs nothing re-run and nothing skipped (stamped upgrade)", () => {
    const currentLedger = DEPLOY_MIGRATION_ORDER.map((m) => m.filename);
    const resolved = canonicalAppliedFilenames(currentLedger);
    expect(resolved.applied.size).toBe(DEPLOY_MIGRATION_ORDER.length);
    expect(resolved.unknownRecorded).toEqual([]);
    expect(unappliedDeployMigrations(currentLedger)).toEqual([]);
  });

  it("an execute-path ledger (no stamp record at all) still owes the stamp file", () => {
    const preStampLedger = [
      "0001-schema.sql",
      "0002-card-text-binary-lookup-indexes.sql",
      "0003-demo-seed.sql",
    ];
    expect(unappliedDeployMigrations(preStampLedger)).toEqual([
      "0003-deck-data-version-stamp.sql",
      "0004-demo-account-substrate.sql",
      "0005-auth-sessions.sql",
      "0006-demo-role-substrate.sql",
      "0008-cards-serving-path-indexes.sql",
    ]);
  });

  it("reports unknown ledger names instead of swallowing them", () => {
    const resolved = canonicalAppliedFilenames([
      "0001-schema.sql",
      "0009-does-not-exist.sql",
    ]);
    expect(resolved.unknownRecorded).toEqual(["0009-does-not-exist.sql"]);
  });
});

describe("directory/manifest drift guard", () => {
  it("the real deploy/migrations directory matches the manifest (guard passes)", () => {
    expect(() => assertDeployMigrationsMatchManifest()).not.toThrow();
  });
});
