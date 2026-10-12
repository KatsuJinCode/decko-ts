// THE ANONYMOUS EXPOSURE REGRESSION. The demo deck's account substrate must
// not serve password digests, salts or email addresses to a viewer who is not
// signed in - on EITHER read surface the shipped Cloudflare Worker exposes:
// the rendered page path (GET /:mark/:view) and the CQL API (POST /api/query).
//
// WHY THIS FILE EXISTS (round-8 adversarial review, verified in workerd with
// DECKO_FIRST_RUN=1 DECKO_WRITE_PATH=1 after setup):
//   * GET /victim+*account+*password/input returned the pbkdf2 digest,
//   * GET /victim+*account+*salt returned the salt,
//   * POST /api/query {"cql":{"right":"*password"}} returned every digest and
//     {"right":"*email"} returned every address.
// Three causes, each fixed where it lives:
//   1. deploy/migrations/0004-demo-account-substrate.sql shipped the account
//      field cards with NO read rule, where card-mod-account-0.20.0
//      data/real.yml:82-160 gives every one of them a `:right + *read`
//      rule naming the :help_desk role.
//   2. src/card/mod-loader/mods/card-mod-account.ts registered only the
//      :raw and :core views for right/password; Ruby's :input arm
//      (all/password_input.rb + password_input.haml) renders a password field
//      with NO value attribute, so the digest was never in the bytes.
//   3. src/card/render.ts cqlPermissionOptions returned alwaysOk:true on a
//      deck with no catch-all read rule, which turned the CQL permission
//      filter off wholesale.
//
// WHAT IS PROVEN HERE, and how:
//   * The deck is the REAL deploy chain — every migration in
//     DEPLOY_MIGRATION_ORDER that carries demo content, applied with
//     node:sqlite in manifest order — and the owner is created by the REAL
//     first-run engine write (createOwnerAccount). Nothing about the rows is
//     hand-assembled.
//   * The reads go through the REAL deploy/worker.ts fetch handler over a
//     D1-shaped binding, so this exercises the shipped routing, the shipped
//     read gate and the shipped CQL executor — not a test double.
//   * The assertions are on the BYTES: the digest, the salt and the address
//     are read back out of the database first, so a leak is detected no
//     matter which surface leaked it, and no assertion can pass by matching
//     something the test itself wrote.
//
// NOT IN tests/standing-net.json — recorded in the receipt.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import { FetchEngine } from "../../src/card/fetch.js";
import {
  createOwnerAccount,
  runAuthMigrations,
} from "../../src/card/auth/index.js";
import { splitSqlStatements } from "../card/render/render-test-storage.js";
import { scratchDir } from "../support/scratch-dir.mjs";
import type {
  D1BindValue,
  D1DatabaseLike,
  D1PreparedStatementLike,
  D1ResultLike,
} from "../../src/server/drivers/d1.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** deploy/README.md:37 + src/server/deploy-migrations.ts DEPLOY_MIGRATION_ORDER
 *  — the whole chain a fresh Cloudflare deploy applies, in the lexical order
 *  the external runner walks. 0009 is last for a reason the file states: its
 *  rules name the Help Desk role card, which 0006 creates. */
const CHAIN = [
  "deploy/migrations/0001-schema.sql",
  "deploy/migrations/0002-card-text-binary-lookup-indexes.sql",
  "deploy/migrations/0003-demo-seed.sql",
  "deploy/migrations/0004-demo-account-substrate.sql",
  "deploy/migrations/0006-demo-role-substrate.sql",
  "deploy/migrations/0009-demo-account-read-rules.sql",
] as const;

const OWNER_EMAIL = "victim@demo.invalid";
const OWNER_PASSWORD = "Demo-Setup-1";
/** The setup form's card[name] field (user.rb:14) - the reviewer's /victim. */
const OWNER_NAME = "victim";

/** The D1 binding the worker expects, backed by the local sqlite driver.
 *  D1's prepare/bind/all/run/batch shape, nothing else. */
function d1Shim(driver: LocalSqliteDriver): D1DatabaseLike {
  const run = async (sql: string, params: D1BindValue[]): Promise<D1ResultLike> => {
    const result = await driver.query(sql, params as unknown[]);
    return {
      success: true,
      results: result.rows as Record<string, unknown>[],
      meta: { changes: 0, rows_read: result.rowsRead, rows_written: 0 },
    };
  };
  return {
    prepare(sql: string): D1PreparedStatementLike {
      let bound: D1BindValue[] = [];
      const statement = {
        bind(...values: D1BindValue[]) {
          bound = values;
          return statement;
        },
        all: () => run(sql, bound),
        run: () => run(sql, bound),
      };
      return statement as unknown as D1PreparedStatementLike;
    },
    batch(statements: D1PreparedStatementLike[]): Promise<D1ResultLike[]> {
      return Promise.all(
        statements.map((statement) =>
          (statement as unknown as { all: () => Promise<D1ResultLike> }).all(),
        ),
      );
    },
  };
}

let driver: LocalSqliteDriver | undefined;
let worker: { fetch: (request: Request, env: unknown) => Promise<Response> };
/** The three secrets an anonymous viewer must never see, read back out of the
 *  database so the assertions search for the real values. */
let digest: string;
let salt: string;

beforeAll(async () => {
  process.env.DECKO_FIRST_RUN = "1";
  process.env.DECKO_WRITE_PATH = "1";
  const dir = scratchDir("decko-demo-anonymous-exposure-");
  const path = join(dir, "demo.sqlite");
  driver = new LocalSqliteDriver({ path });
  for (const file of CHAIN) {
    for (const statement of splitSqlStatements(readFileSync(join(REPO_ROOT, file), "utf8"))) {
      await driver.query(statement, []);
    }
  }
  await runAuthMigrations(driver);

  // The setup write, through the real engine.
  const created = await createOwnerAccount(
    { driver, fetcher: new FetchEngine(driver) },
    { email: OWNER_EMAIL, password: OWNER_PASSWORD, cardName: OWNER_NAME },
  );
  expect(created.ok, `owner create failed: ${JSON.stringify(created)}`).toBe(true);
  if (!created.ok) throw new Error("owner create failed");

  const stored = await driver.query<{ db_content: string | null }>(
    "SELECT db_content FROM cards WHERE id = ?",
    [created.fieldCardIds.password],
  );
  digest = stored.rows[0]?.db_content ?? "";
  expect(digest.length).toBeGreaterThan(20);
  const storedSalt = await driver.query<{ db_content: string | null }>(
    "SELECT db_content FROM cards WHERE id = ?",
    [created.fieldCardIds.salt],
  );
  salt = storedSalt.rows[0]?.db_content ?? "";
  expect(salt.length).toBeGreaterThan(20);

  const module = await import("../../deploy/worker.js");
  worker = (module.default ?? module) as unknown as {
    fetch: (request: Request, env: unknown) => Promise<Response>;
  };
}, 120_000);

afterAll(() => {
  delete process.env.DECKO_FIRST_RUN;
  delete process.env.DECKO_WRITE_PATH;
  driver?.close();
});

function get(path: string): Promise<Response> {
  return worker.fetch(new Request(`https://decko-demo.test${path}`), {
    DB: d1Shim(driver!),
  });
}

function postQuery(cql: unknown): Promise<Response> {
  return worker.fetch(
    new Request("https://decko-demo.test/api/query", {
      method: "POST",
      body: JSON.stringify({ cql }),
      headers: { "Content-Type": "application/json" },
    }),
    { DB: d1Shim(driver!) },
  );
}

/** Every anonymous surface that can reach one of the three secrets. */
function anonymousSurfaces(): { label: string; body: () => Promise<string> }[] {
  const account = `${OWNER_NAME}+*account`;
  return [
    { label: "GET /account+*password/input", body: async () => await (await get(`/${account}+*password/input`)).text() },
    { label: "GET /account+*password", body: async () => await (await get(`/${account}+*password`)).text() },
    { label: "GET /account+*password.json", body: async () => await (await get(`/${account}+*password.json`)).text() },
    { label: "GET /account+*salt", body: async () => await (await get(`/${account}+*salt`)).text() },
    { label: "GET /account+*salt/input", body: async () => await (await get(`/${account}+*salt/input`)).text() },
    { label: "GET /account+*salt.json", body: async () => await (await get(`/${account}+*salt.json`)).text() },
    { label: "GET /account+*email", body: async () => await (await get(`/${account}+*email`)).text() },
    { label: "GET /account+*email/input", body: async () => await (await get(`/${account}+*email/input`)).text() },
    { label: "GET /account+*email.json", body: async () => await (await get(`/${account}+*email.json`)).text() },
    { label: "POST /api/query right=*password", body: async () => await (await postQuery({ right: "*password" })).text() },
    { label: "POST /api/query right=*salt", body: async () => await (await postQuery({ right: "*salt" })).text() },
    { label: "POST /api/query right=*email", body: async () => await (await postQuery({ right: "*email" })).text() },
  ];
}

describe("the demo deck's account substrate is invisible to an anonymous viewer", () => {
  it("CONTROL: the secrets really are stored, so the per-surface assertions below are searching for live values", async () => {
    expect(digest).toMatch(/^pbkdf2_sha256\$/);
    expect(digest).not.toContain(OWNER_PASSWORD);
    expect(salt).toMatch(/^[0-9a-f]{40}$/);
    expect(OWNER_EMAIL).toBe("victim@demo.invalid");
  });

  it("CONTROL: the deck carries the read rules, so the denials below are the RULES denying and not an empty deck", async () => {
    // A test that passes because the deck is empty proves nothing. These are
    // the rows 0009 ships, read back as data: the catch-all (which is what
    // turns the rule walk on at all) and one `<field>+*right+*read` per field
    // card, each with the party reference that makes it grant somebody.
    const rules = await driver!.query<{
      id: number;
      leftName: string | null;
      content: string | null;
      leftIsSet: number;
    }>(
      `SELECT rules.id AS id, sets.name AS leftName, rules.db_content AS content,
              CASE WHEN sets.type_id =
                (SELECT id FROM cards WHERE codename = 'set' AND trash = 0 ORDER BY id LIMIT 1)
              THEN 1 ELSE 0 END AS leftIsSet
         FROM cards rules
         JOIN cards sets ON sets.id = rules.left_id
        WHERE rules.right_id =
                (SELECT id FROM cards WHERE codename = 'read' AND trash = 0 ORDER BY id LIMIT 1)
          AND rules.trash = 0 AND sets.trash = 0
        ORDER BY rules.id`,
      [],
    );
    // Six rule cards: the catch-all plus one per field card real.yml gives a
    // `:read` field. Every one of them hangs off a Set-typed left — the
    // filter read_rule_cache's statement applies (read-rules.ts:210-211).
    expect(rules.rows).toHaveLength(6);
    expect(rules.rows.every((row) => row.leftIsSet === 1)).toBe(true);
    // The catch-all is the one whose left is `*all`; it grants Anyone, and it
    // is the row that makes every OTHER card of the deck readable.
    expect(rules.rows.filter((row) => row.leftName === "*all")).toEqual([
      expect.objectContaining({ content: "Anyone" }),
    ]);
    // The five field rules grant Help Desk and nobody else.
    expect(rules.rows.filter((row) => row.leftName !== "*all")).toHaveLength(5);
    expect(
      rules.rows.filter((row) => row.leftName !== "*all").map((row) => row.content),
    ).toEqual(Array(5).fill("Help Desk"));

    // And each rule card has the card_references row that makes it grant
    // somebody: a rule with no party grants nobody, catch-all included.
    const parties = await driver!.query<{ refererId: number; refereeId: number | null }>(
      `SELECT refs.referer_id AS refererId, refs.referee_id AS refereeId
         FROM card_references refs
         JOIN cards rules ON rules.id = refs.referer_id
        WHERE rules.right_id =
                (SELECT id FROM cards WHERE codename = 'read' AND trash = 0 ORDER BY id LIMIT 1)
          AND rules.trash = 0`,
      [],
    );
    const anyone = await driver!.query<{ id: number }>(
      "SELECT id FROM cards WHERE codename = 'anyone' AND trash = 0",
      [],
    );
    const helpDesk = await driver!.query<{ id: number }>(
      "SELECT id FROM cards WHERE codename = 'help_desk' AND trash = 0",
      [],
    );
    const byRule = new Map(parties.rows.map((row) => [row.refererId, row.refereeId]));
    for (const rule of rules.rows) {
      expect(byRule.get(rule.id), `rule ${rule.id} grants nobody`).toBeDefined();
    }
    // Exactly the real.yml split: five grants to Help Desk, one to Anyone.
    const granted = rules.rows.map((rule) => byRule.get(rule.id));
    expect(granted.filter((id) => id === helpDesk.rows[0]?.id)).toHaveLength(5);
    expect(granted.filter((id) => id === anyone.rows[0]?.id)).toHaveLength(1);
  });

  for (const surface of anonymousSurfaces()) {
    it(`${surface.label} carries neither the digest, the salt, nor the email`, async () => {
      const body = await surface.body();
      expect(body, `${surface.label} leaked the pbkdf2 digest`).not.toContain(digest);
      expect(body, `${surface.label} leaked the salt`).not.toContain(salt);
      expect(body, `${surface.label} leaked the email`).not.toContain(OWNER_EMAIL);
    });
  }
});