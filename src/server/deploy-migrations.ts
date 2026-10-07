// deploy-migrations.ts — the in-repo contract for deploy/migrations: the
// canonical total order, the applied-set compatibility alias, and the
// directory drift guard.
//
// WHY THIS EXISTS. The directory carries TWO migrations numbered 0003 —
// 0003-deck-data-version-stamp.sql (the freshness-stamp backfill for
// already-provisioned databases; fresh databases get the stamp from the
// regenerated 0001) and 0003-demo-seed.sql (the generated demo deck,
// deploy/sync-migrations.mjs:38). The seat lineage numbered the identical
// stamp backfill 0007, so provisioned databases exist whose applied-migration
// ledger carries "0007-deck-data-version-stamp.sql" while this directory
// carries "0003-deck-data-version-stamp.sql" (seat-branch-merge-map.md §2).
//
// The deploy chain's runner is EXTERNAL: `wrangler d1 migrations apply`
// (package.json:18, migrations_dir at wrangler.toml:104). Verified first-hand
// at wrangler 4.148.0 --local (an internal work log
// §1): migrations are enumerated in lexical filename order, applied
// unrecorded files in that order, recorded in `d1_migrations` by FULL
// FILENAME, deduped by exact filename, recorded names that no longer match a
// file are silently ignored, and any file whose name is not recorded is
// applied again. Therefore:
//
//   1. EVERY filename below is a load-bearing bookkeeping key on provisioned
//      databases. Renaming any migration file re-keys those ledgers and
//      re-runs the renamed file — the collision is NOT fixed by renumbering
//      (that was the r5 escalation's finding and it holds here).
//   2. The pair's mutual order is the lexical filename sort (stamp before
//      seed), which the external runner applies. The manifest below declares
//      the same order so in-repo consumers never disagree with it, and the
//      contract suite pins it.
//   3. Applied-set INTERPRETATION must be alias-complete: a ledger that
//      recorded the seat-lineage name (0007-deck-data-version-stamp.sql) has
//      the stamp migration applied — old name recorded = new name considered
//      applied. The stamp backfill's SQL body is byte-identical between the
//      0003 and 0007 versions modulo comments (merge map §2), so the alias is
//      sound.
//
// Node-side lazy path resolution follows src/card/auth/migrations.ts:44-57
// (no import-time URL resolution — the Workers graph imports this module's
// siblings and an import-time `new URL` threw on the Deploy button's worker).
// Nothing here reads or writes any database.

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** One deploy migration: its load-bearing filename and its number prefix. */
export interface DeployMigration {
  readonly filename: string;
  readonly number: string;
}

/**
 * The canonical manifest, in the total order migrations apply: numeric
 * prefix ascending, filename ascending as the tiebreak — which is exactly
 * the lexical filename order the external runner enumerates with. A new
 * migration file MUST be added here in the same step it is added to
 * deploy/migrations; the drift guard (assertDeployMigrationsMatchManifest)
 * fails loudly on any mismatch.
 */
export const DEPLOY_MIGRATION_ORDER: readonly DeployMigration[] = [
  { filename: "0001-schema.sql", number: "0001" },
  { filename: "0002-card-text-binary-lookup-indexes.sql", number: "0002" },
  // The numbering collision, declared: two 0003 files, ordered by filename
  // (the order the deploy chain applies them). Renaming either is a
  // bookkeeping break on provisioned databases — do not "fix" the collision
  // by renumbering. See the module header.
  { filename: "0003-deck-data-version-stamp.sql", number: "0003" },
  { filename: "0003-demo-seed.sql", number: "0003" },
  { filename: "0004-demo-account-substrate.sql", number: "0004" },
  { filename: "0005-auth-sessions.sql", number: "0005" },
  { filename: "0006-demo-role-substrate.sql", number: "0006" },
];

/** The stamp backfill's current (trunk-lineage) filename. */
export const DECK_DATA_VERSION_STAMP_FILENAME = "0003-deck-data-version-stamp.sql";

/**
 * Ledger names that mean the stamp migration is already applied. The seat
 * lineage provisioned mirrors with the stamp numbered 0007; their recorded
 * name never matches this directory's file, and the external runner would
 * re-run the file on them on every apply. Resolution is in-repo only — this
 * module never writes any ledger.
 */
export const DECK_DATA_VERSION_STAMP_APPLIED_ALIASES: readonly string[] = [
  "0007-deck-data-version-stamp.sql",
];

const CANONICAL_FILENAMES: ReadonlySet<string> = new Set(
  DEPLOY_MIGRATION_ORDER.map((m) => m.filename),
);

const ALIAS_TO_CANONICAL: ReadonlyMap<string, string> = new Map(
  DECK_DATA_VERSION_STAMP_APPLIED_ALIASES.map((alias) => [alias, DECK_DATA_VERSION_STAMP_FILENAME]),
);

/**
 * Resolve a database's recorded applied-migration names onto the canonical
 * manifest. `applied` holds canonical filenames (aliases folded in, deduped);
 * `unknownRecorded` holds ledger names that match neither a manifest file nor
 * a declared alias — reported, never swallowed, so census tooling can see a
 * diverged ledger instead of guessing.
 */
export function canonicalAppliedFilenames(recorded: readonly string[]): {
  applied: Set<string>;
  unknownRecorded: string[];
} {
  const applied = new Set<string>();
  const unknownRecorded: string[] = [];
  for (const name of recorded) {
    const canonical = ALIAS_TO_CANONICAL.get(name);
    if (canonical !== undefined) {
      applied.add(canonical);
    } else if (CANONICAL_FILENAMES.has(name)) {
      applied.add(name);
    } else {
      unknownRecorded.push(name);
    }
  }
  return { applied, unknownRecorded };
}

/**
 * Manifest migrations not covered by the recorded ledger — alias-aware, in
 * canonical order. This is "what an apply would owe this database" under the
 * compatibility semantics; the external runner's own answer can differ
 * exactly where the alias exists (a 0007-ledger database would be re-run the
 * stamp file by wrangler, and this function says the truth: it is applied).
 */
export function unappliedDeployMigrations(recorded: readonly string[]): string[] {
  const { applied } = canonicalAppliedFilenames(recorded);
  return DEPLOY_MIGRATION_ORDER.map((m) => m.filename).filter((f) => !applied.has(f));
}

let migrationsDirCache: string | undefined;
function DEFAULT_MIGRATIONS_DIR(): string {
  migrationsDirCache ??= fileURLToPath(new URL("../../deploy/migrations", import.meta.url));
  return migrationsDirCache;
}

/**
 * The drift guard: the deploy/migrations directory must name exactly the
 * manifest's files — no unmanifested file (a migration that would order by
 * runner luck), no missing file. Throws naming the drift. Call this anywhere
 * the migration set is consumed as a whole.
 */
export function assertDeployMigrationsMatchManifest(dir: string = DEFAULT_MIGRATIONS_DIR()): void {
  const onDisk = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const declared = DEPLOY_MIGRATION_ORDER.map((m) => m.filename).sort();
  const extra = onDisk.filter((f) => !declared.includes(f));
  const missing = declared.filter((f) => !onDisk.includes(f));
  if (extra.length > 0 || missing.length > 0) {
    throw new Error(
      `deploy/migrations does not match the manifest (src/server/deploy-migrations.ts):` +
        (extra.length > 0 ? ` on disk but not manifested: ${extra.join(", ")}` : "") +
        (missing.length > 0 ? ` manifested but not on disk: ${missing.join(", ")}` : "") +
        `. A new migration file must be added to DEPLOY_MIGRATION_ORDER in the same commit.`,
    );
  }
  // The manifest order itself must be the deterministic total order.
  const keys = DEPLOY_MIGRATION_ORDER.map((m) => `${m.number}~${m.filename}`);
  const sorted = [...keys].sort();
  if (keys.some((k, i) => k !== sorted[i])) {
    throw new Error(
      "DEPLOY_MIGRATION_ORDER is not in canonical order (numeric prefix ascending, " +
        "filename ascending tiebreak) — fix the manifest order.",
    );
  }
}
