// THE CQL ACCOUNT-FIELD EXCLUSION LIST. On a deck that carries no catch-all
// read rule, RenderEngine.cqlPermissionOptions answers `alwaysOk: true` — the
// rule-less allowance — and narrows it by refusing to serve the account field
// rows. That list is the only thing standing between a rule-less deck and a
// /api/query that hands a stranger somebody's credentials, so the codenames on
// it are pinned here.
//
// WHY A UNIT TEST AND NOT THE END-TO-ONE: the end-to-end exposure suite
// (tests/deploy/demo-account-anonymous-exposure.test.ts) builds the REAL
// deploy chain, which ends at 0009 and therefore HAS the catch-all — so it
// takes the ordinary filtered branch and never reaches this list at all. This
// test builds a deck with the account substrate and NO read rules, which is
// the shape the allowance exists for, and reads the list the engine computes.
//
// WHAT IS PROVEN HERE:
//   * every codename on ACCOUNT_RIGHT_CODENAMES resolves to a right id the
//     engine excludes, including `api_key` — card-mod-api_key's account field
//     (set/right/api_key.rb:1, `include_set Abstract::AccountField`), whose
//     content authenticates as the account and so is the same kind of secret;
//   * a non-account right is NOT excluded, so the list stays a list of account
//     fields rather than a blanket denial;
//   * a deck with no account substrate excludes nothing and does not fail, so
//     the resolution's skip-when-absent behaviour is pinned too.

import { afterEach, describe, expect, it } from "vitest";

import { FetchEngine } from "../../../src/card/fetch.js";
import { RenderEngine } from "../../../src/card/render.js";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import { scratchDir, cleanupScratch } from "../../support/scratch-dir.mjs";

/** The right codenames the account substrate hangs its secrets on, and the
 *  gem each one comes from. `api_key` is card-mod-api_key rather than
 *  card-mod-account, and it is on the list on the account-field argument: it
 *  is `include_set Abstract::AccountField`, hangs off the same `*account`
 *  junction, and its content is a bearer credential. */
const ACCOUNT_FIELD_CODENAMES = [
  { codename: "account", gem: "card-mod-account" },
  { codename: "email", gem: "card-mod-account" },
  { codename: "password", gem: "card-mod-account" },
  { codename: "salt", gem: "card-mod-account" },
  { codename: "status", gem: "card-mod-account" },
  { codename: "api_key", gem: "card-mod-api_key" },
] as const;

/** A right that is NOT an account field, so the test can tell "excluded every
 *  account field" from "excluded every right". */
const ORDINARY_CODENAME = "read";

/** A deck with the account substrate's right cards and NO read rules: the
 *  shape the allowance exists for. `withAccountSubstrate: false` leaves the
 *  right cards out entirely, which is the 0001..0003 deck. */
async function ruleLessDeck(prefix: string, withAccountSubstrate: boolean): Promise<LocalSqliteDriver> {
  const driver = new LocalSqliteDriver({ path: `${scratchDir(prefix)}/deck.sqlite` });
  await driver.query(
    `CREATE TABLE cards (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       name TEXT, "key" TEXT, codename TEXT, db_content TEXT,
       left_id INTEGER, right_id INTEGER, type_id INTEGER, trash INTEGER DEFAULT 0
     )`,
    [],
  );
  await driver.query(
    `CREATE TABLE card_references (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       referer_id INTEGER, referee_id INTEGER, ref_type TEXT, referee_key TEXT
     )`,
    [],
  );
  const codenames = withAccountSubstrate
    ? [...ACCOUNT_FIELD_CODENAMES.map((f) => f.codename), ORDINARY_CODENAME]
    : [ORDINARY_CODENAME];
  for (const codename of codenames) {
    await driver.query(
      `INSERT INTO cards (name, "key", codename, db_content, trash) VALUES (?, ?, ?, ?, 0)`,
      [`*${codename}`, `*${codename}`, codename, null],
    );
  }
  return driver;
}

async function excludedRightIds(driver: LocalSqliteDriver): Promise<number[]> {
  const engine = new RenderEngine(new FetchEngine(driver));
  return (await engine.cqlPermissionOptions()).excludedRightIds;
}

async function rightIdOf(driver: LocalSqliteDriver, codename: string): Promise<number> {
  const rows = await driver.query<{ id: number }>(
    `SELECT id FROM cards WHERE codename = ? AND trash = 0 ORDER BY id LIMIT 1`,
    [codename],
  );
  const id = rows.rows[0]?.id;
  if (typeof id !== "number") throw new Error(`deck has no ${codename} right card`);
  return id;
}

describe("the CQL account-field exclusion list", () => {
  it("excludes every account field codename, api_key among them", async () => {
    const driver = await ruleLessDeck("decko-cql-exclusion-", true);
    try {
      const excluded = await excludedRightIds(driver);
      for (const field of ACCOUNT_FIELD_CODENAMES) {
        const id = await rightIdOf(driver, field.codename);
        expect(
          excluded,
          `*${field.codename} (${field.gem}) is an account field and must be excluded`,
        ).toContain(id);
      }
    } finally {
      driver.close();
    }
  });

  it("api_key is excluded exactly as the password digest is, not as a special case", async () => {
    const driver = await ruleLessDeck("decko-cql-exclusion-pair-", true);
    try {
      const excluded = await excludedRightIds(driver);
      const apiKey = await rightIdOf(driver, "api_key");
      const password = await rightIdOf(driver, "password");
      // Both arrive through one list and one resolution; neither is resolved
      // by a rule or a hardcoded id.
      expect(excluded).toContain(apiKey);
      expect(excluded).toContain(password);
    } finally {
      driver.close();
    }
  });

  it("excludes no right that is not an account field", async () => {
    const driver = await ruleLessDeck("decko-cql-exclusion-scope-", true);
    try {
      const excluded = await excludedRightIds(driver);
      const ordinary = await rightIdOf(driver, ORDINARY_CODENAME);
      expect(
        excluded,
        "the exclusion is a list of account fields, not a blanket denial of every right",
      ).not.toContain(ordinary);
    } finally {
      driver.close();
    }
  });

  it("a deck with no account substrate excludes nothing and still answers", async () => {
    const driver = await ruleLessDeck("decko-cql-exclusion-empty-", false);
    try {
      expect(await excludedRightIds(driver)).toEqual([]);
    } finally {
      driver.close();
    }
  });

  afterEach(cleanupScratch);
});