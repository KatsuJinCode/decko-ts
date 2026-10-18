// Shared corpus fixture for the reset-flow suites: a DISPOSABLE COPY of the
// anonymized corpus-v2 with the engine-standard column name, the write
// engine's history tables, and test-issued credentials for the REAL corpus
// account card (holder 583, the signin suite's proven roleful member).
//
// Discipline is the signin-endpoint suite's: the corpus source file stays
// untouched (copy only), the python-built `content` column is renamed to
// db_content IN THE COPY, the browse-built copy gains the missing history
// tables from the repo's own DDL, and +*password/+*status are re-issued in
// the copy with Ruby's exact salted-SHA-1 formula (auth.rb:36-39). Nothing
// is printed (emails, salts, digests, tokens stay in memory).

import { copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { splitSqlStatements } from "../fetch/fetch-test-storage.js";
import { CORPUS_DB_PATH } from "../../../src/testing/test-corpus-paths.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

// The committed miniature corpus (fixtures/test-corpus/test-corpus.sqlite3)
// by default; the richer machine-local bench corpus only under the explicit
// DECKO_TS_CORPUS_V2 opt-in (test-corpus-paths.ts). No sibling-checkout
// fallback: a clone never reaches into another checkout's private files.
export const CORPUS_PATH = CORPUS_DB_PATH;

/** The corpus-proven account the flow journeys run against. */
export const HOLDER_ID = 900360;

/** The resolved fixture rows the tests need (all strings read from the
 *  COPY — no secrets, just deck-shaped data). */
export interface CorpusFixtureInfo {
  /** The +*account+*email content (the reset request's key). */
  email: string;
  holderName: string;
  /** The +*account junction name ("holder+*account"). */
  junctionName: string;
  /** The URL mark of the +account card (url_key form). */
  accountMark: string;
  /** The *title card's content ({{:title|core}}). */
  siteTitle: string;
}

/**
 * Prepare the disposable copy at `fixturePath` (parent dirs created; any
 * previous file removed) and return the resolved rows. Closes its db
 * handle before returning — callers open their own driver.
 */
export function prepareResetFlowCorpusFixture(
  fixturePath: string,
  testPassword: string,
): CorpusFixtureInfo {
  if (CORPUS_PATH === null) {
    throw new Error("no corpus available (DECKO_TS_CORPUS_V2 unset, no bench corpus found)");
  }
  mkdirSync(path.dirname(fixturePath), { recursive: true });
  rmSync(fixturePath, { force: true });
  copyFileSync(CORPUS_PATH, fixturePath);

  // Torn-copy guard. The copy is the suite's foundation, and a malformed
  // image surfaces only later as "database disk image is malformed" at the
  // first prepared statement (observed in the 2026-10-18 correctness gate:
  // the copy opened, then PRAGMA table_info failed). The committed source
  // is never written here, so a bad image is a filesystem-level copy tear —
  // possible on a machine running many concurrent lanes. Verify the copy
  // actually answers, re-copy ONCE if it does not, and fail loudly naming
  // both paths if the retry is bad too; a corrupt SOURCE still fails, and
  // nothing about the fixture's content contract changes.
  let copyVerified = false;
  for (let attempt = 0; attempt < 2 && !copyVerified; attempt++) {
    const probe = new Database(fixturePath);
    try {
      copyVerified = probe.pragma("quick_check", { simple: true }) === "ok";
    } catch {
      copyVerified = false;
    } finally {
      probe.close();
    }
    if (!copyVerified && attempt === 0) {
      rmSync(fixturePath, { force: true });
      copyFileSync(CORPUS_PATH, fixturePath);
    }
  }
  if (!copyVerified) {
    throw new Error(
      `corpus fixture copy is malformed even after one re-copy (copy: ${fixturePath}, source: ${CORPUS_PATH})`,
    );
  }

  const db = new Database(fixturePath);
  try {
    const columns = (db.prepare("PRAGMA table_info(cards)").all() as Array<{ name: string }>).map(
      (c) => c.name,
    );
    if (columns.includes("content") && !columns.includes("db_content")) {
      db.exec("ALTER TABLE cards RENAME COLUMN content TO db_content");
    }

    // The write engine needs the history tables (card_acts/card_actions/
    // card_changes, write-path.ts:487-561); the browse-built bench corpus
    // carries only cards/card_references/meta. Apply the core schema DDL
    // idempotently: existing tables are skipped (checked per name), missing
    // ones are created from the repo's own DDL. Index statements are
    // best-effort (a UNIQUE index the anonymized data violates is
    // non-fatal; indexes are optimization-only for this flow).
    const schemaDdl = readFileSync(path.join(REPO_ROOT, "db", "schema.sqlite.sql"), "utf8");
    for (const rawStatement of splitSqlStatements(schemaDdl)) {
      if (/^CREATE INDEX|^CREATE UNIQUE INDEX/i.test(rawStatement)) {
        try {
          db.exec(
            rawStatement.replace(/^CREATE (UNIQUE )?INDEX /i, (m) => `${m.trim()} IF NOT EXISTS `),
          );
        } catch {
          // non-fatal
        }
        continue;
      }
      if (!/^CREATE TABLE/i.test(rawStatement)) continue;
      const table = /"([a-z_]+)"/i.exec(rawStatement)?.[1];
      const hasTable = table
        ? db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)
        : undefined;
      if (table && !hasTable) db.exec(rawStatement);
    }

    const codenameId = (code: string): number =>
      (
        db.prepare("SELECT id FROM cards WHERE codename = ? AND trash = 0").get(code) as
          | { id: number }
          | undefined
      )?.id ?? -1;
    const ids = {
      account: codenameId("account"),
      email: codenameId("email"),
      password: codenameId("password"),
      salt: codenameId("salt"),
      status: codenameId("status"),
    };
    if (ids.account <= 0) throw new Error("corpus fixture: no *account codename card");

    const junction = db
      .prepare("SELECT id, name FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0")
      .get(HOLDER_ID, ids.account) as { id: number; name: string } | undefined;
    if (junction === undefined) throw new Error(`corpus fixture: no +*account for holder ${HOLDER_ID}`);
    const junctionId = junction.id;

    const fieldChild = (fieldId: number): { id: number; content: string | null } =>
      db
        .prepare(
          "SELECT id, db_content AS content FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0",
        )
        .get(junctionId, fieldId) as { id: number; content: string | null };

    const emailChild = fieldChild(ids.email);
    const passwordChild = fieldChild(ids.password);
    const saltChild = fieldChild(ids.salt);
    const statusChild = fieldChild(ids.status);
    if (!emailChild?.content) throw new Error("corpus fixture: account email child empty");

    // Test-issued credentials for the REAL account card, in the COPY only:
    // Ruby's exact formula with the account's own salt.
    const salt = saltChild?.content ?? "";
    const digest = createHash("sha1").update(`${salt}--${testPassword}--`).digest("hex");
    db.prepare("UPDATE cards SET db_content = ? WHERE id = ?").run(digest, passwordChild?.id);
    db.prepare("UPDATE cards SET db_content = 'active' WHERE id = ?").run(statusChild?.id);

    const holder = db
      .prepare("SELECT name FROM cards WHERE id = ? AND trash = 0")
      .get(HOLDER_ID) as { name: string } | undefined;
    if (!holder?.name) throw new Error(`corpus fixture: holder ${HOLDER_ID} unnamed`);

    // Deck-chrome restoration (the signin-endpoint fixture's block): the
    // anonymizer renamed the Default Layout card and left *layout rule
    // targets unresolvable. The render-polish pages serve Default Layout
    // chrome, so the fixture copy restores the layout identity or every
    // chromed page 500s. Source corpus files stay untouched.
    const layoutCard = db
      .prepare("SELECT id FROM cards WHERE codename = 'default_layout' AND trash = 0")
      .get() as { id: number } | undefined;
    if (layoutCard !== undefined) {
      db.prepare("UPDATE cards SET name = 'Default Layout', key = 'default_layout' WHERE id = ?").run(
        layoutCard.id,
      );
      // The anonymizer also left scrub junk between the layout's
      // </footer> and </body> (the oracle deck's tail is exactly
      // "</footer>\n</body>"); normalize it — identity on a clean tail.
      const layoutRow = db
        .prepare("SELECT db_content AS c FROM cards WHERE id = ?")
        .get(layoutCard.id) as { c: string | null };
      if (typeof layoutRow?.c === "string" && layoutRow.c.includes("</footer>")) {
        const cleaned = layoutRow.c.replace(
          /<\/footer>[\s\S]*?<\/body>/,
          "</footer>\n</body>",
        );
        db.prepare("UPDATE cards SET db_content = ? WHERE id = ?").run(cleaned, layoutCard.id);
      }
      const layoutRules = db
        .prepare(
          "SELECT id, db_content AS target FROM cards WHERE right_id = (SELECT id FROM cards WHERE codename = 'layout' AND trash = 0) AND trash = 0",
        )
        .all() as Array<{ id: number; target: string }>;
      const repoint = db.prepare("UPDATE cards SET db_content = 'Default Layout' WHERE id = ?");
      for (const rule of layoutRules) {
        const target = db
          .prepare("SELECT length(db_content) AS blen FROM cards WHERE name = ? AND trash = 0")
          .get(rule.target) as { blen: number } | undefined;
        if (target === undefined || !target.blen) repoint.run(rule.id);
      }
    }

    const title = db
      .prepare("SELECT db_content AS t FROM cards WHERE codename = 'title' AND trash = 0")
      .get() as { t: string | null } | undefined;

    const junctionName = junction.name;
    return {
      email: emailChild.content,
      holderName: holder.name,
      junctionName,
      accountMark: junctionName.replace(/ /g, "_"),
      siteTitle: title?.t ?? "",
    };
  } finally {
    db.close();
  }
}
