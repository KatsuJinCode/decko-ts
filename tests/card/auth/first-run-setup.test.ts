// The first-run journey (src/card/auth/first-run-setup.ts +
// src/server/first-run-routes.ts): the create-owner happy path, the
// window-closed path, and the disabled-by-default path.
//
//   prototype/lib/card/auth/setup.rb:33-52      the census
//   the create-side abort (the User type's setup hook)
//   the account card shape (the account mod's seed)
//   the email/password/salt field events
//
// Storage: the render suite's in-memory core-schema storage (it carries BOTH
// the driver and a FetchEngine over the same database, which is what the
// create needs — it runs a real CardActionEngine). All seeded content is
// SYNTHETIC.
//
// The load-bearing fixture detail: the fixture seeds the bot-CREATED
// +*account rows a real deck ships with (auth/setup.rb:44, "every deck
// starts with two accounts: DeckoBot and Anonymous", both authored by the
// seeder as Card::DeckoBotID). This tree's own shipped seeds carry no
// `*account` codename at all (the "account_system_absent" test below
// measures exactly that on both of them), so the fixture supplies the rows
// to stand in for a real deck's. A census test without them would pass on
// a plain COUNT(*) and prove nothing about the `creator_id <> DeckoBotID`
// arm.

import { afterEach, describe, expect, it } from "vitest";
import type { SQLDatabaseDriver } from "../../../src/server/driver.js";
import {
  checkNewAccountPassword,
  countUserAccounts,
  createOwnerAccount,
  firstRunEnabled,
  normalizeNewAccountEmail,
  resolveAccountCodenameIds,
  runAuthMigrations,
  SessionStore,
  setupWindowState,
  sha1Hex,
  signinAccount,
} from "../../../src/card/auth/index.js";
import { checkPassword, isPbkdf2Hash } from "../../../src/card/auth/password-hash.js";
import {
  handleFirstRunRequest,
  parseSetupForm,
  SETUP_PATH,
} from "../../../src/server/first-run-routes.js";
import { createRenderTestStorage, type RenderTestStorage } from "../render/render-test-storage.js";

// ---------------------------------------------------------------------------
// fixture
// ---------------------------------------------------------------------------

const IDS = {
  account: 9001,
  email: 9002,
  password: 9003,
  salt: 9004,
  status: 9005,
  anonymous: 9006,
  deckoBot: 9007,
  user: 9008,
} as const;

const BOT = { id: IDS.deckoBot, name: "Decko Bot" };
const ANON = { id: IDS.anonymous, name: "*anonymous" };
const TS = "2026-10-02 05:00:00.000";

async function insertRow(driver: SQLDatabaseDriver, sql: string): Promise<void> {
  await driver.query(sql, []);
}

async function insertCodename(
  driver: SQLDatabaseDriver,
  id: number,
  codename: string,
  name: string,
): Promise<void> {
  await insertRow(
    driver,
    `INSERT INTO cards
       (id, name, key, codename, left_id, right_id, current_revision_id,
        created_at, updated_at, creator_id, updater_id,
        read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
     VALUES (${id}, '${name}', '${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}',
        '${codename}', NULL, NULL, NULL, '${TS}', '${TS}', ${BOT.id}, ${BOT.id},
        NULL, NULL, NULL, 0, 1, NULL)`,
  );
}

async function insertHolder(
  driver: SQLDatabaseDriver,
  id: number,
  name: string,
): Promise<void> {
  await insertRow(
    driver,
    `INSERT INTO cards
       (id, name, key, codename, left_id, right_id, current_revision_id,
        created_at, updated_at, creator_id, updater_id,
        read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
     VALUES (${id}, '${name}', '${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}',
        NULL, NULL, NULL, NULL, '${TS}', '${TS}', ${BOT.id}, ${BOT.id},
        NULL, NULL, NULL, 0, 3, NULL)`,
  );
}

/** A `+*account` junction — the row the census counts. `creatorId` and `trash`
 *  are the census's two load-bearing columns. */
async function insertJunction(
  driver: SQLDatabaseDriver,
  args: { id: number; holderId: number; holderName: string; creatorId: number | null; trash?: number },
): Promise<void> {
  await insertRow(
    driver,
    `INSERT INTO cards
       (id, name, key, codename, left_id, right_id, current_revision_id,
        created_at, updated_at, creator_id, updater_id,
        read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
     VALUES (${args.id}, '${args.holderName}+*account', NULL, NULL,
        ${args.holderId}, ${IDS.account}, NULL, '${TS}', '${TS}',
        ${args.creatorId === null ? "NULL" : args.creatorId},
        ${args.creatorId === null ? "NULL" : args.creatorId},
        NULL, NULL, NULL, ${args.trash ?? 0}, 1, NULL)`,
  );
}

async function seedAccountSystem(
  driver: SQLDatabaseDriver,
  opts: { trashedAccount?: boolean } = {},
): Promise<void> {
  // the five codename cards the account shape is built from, plus the
  // two system actors every deck has (auth/setup.rb:44).
  await insertCodename(driver, IDS.account, "account", "*account");
  await insertCodename(driver, IDS.email, "email", "*email");
  await insertCodename(driver, IDS.password, "password", "*password");
  await insertCodename(driver, IDS.salt, "salt", "*salt");
  await insertCodename(driver, IDS.status, "status", "*status");
  await insertCodename(driver, IDS.anonymous, "anonymous", "*anonymous");
  await insertCodename(driver, IDS.deckoBot, "decko_bot", "Decko Bot");
  await insertCodename(driver, IDS.user, "user", "User");
  // The deck type skeleton. The engine resolves a new card's type through
  // Card.default_type_id (type-resolution.ts:207, :275 — the `default`
  // codename and the *all+*default card's type_id), so a deck without these
  // rows cannot create ANY card; every actions test in this repo seeds the
  // same three for the same reason. Deck bootstrap data, NOT something the
  // first-run flow supplies.
  await insertCodename(driver, 1, "all", "*all");
  await insertCodename(driver, 17, "default", "*default");
  await insertRow(
    driver,
    `INSERT INTO cards
       (id, name, key, codename, left_id, right_id, current_revision_id,
        created_at, updated_at, creator_id, updater_id,
        read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
     VALUES (33, '*all+*default', NULL, NULL, 1, 17, NULL,
        '${TS}', '${TS}', ${BOT.id}, ${BOT.id}, NULL, NULL, NULL, 0, 1, NULL)`,
  );
  // The two shipped accounts. The DeckoBot and Anonymous CARDS are the
  // codename rows just inserted (Card::AnonymousID / Card::DeckoBotID are
  // const_get_or_set'd from those codenames, codename.rb:108 — a card, not
  // a separate row), so only their `+*account` junctions are added here,
  // both authored by the seeder as the bot.
  await insertJunction(driver, { id: 9101, holderId: BOT.id, holderName: BOT.name, creatorId: BOT.id });
  await insertJunction(driver, { id: 9102, holderId: ANON.id, holderName: ANON.name, creatorId: BOT.id });
  if (opts.trashedAccount === true) {
    await insertHolder(driver, 9200, "Gone User");
    await insertJunction(driver, { id: 9201, holderId: 9200, holderName: "Gone User", creatorId: ANON.id, trash: 1 });
  }
}

interface Fixture {
  readonly render: RenderTestStorage;
  readonly driver: SQLDatabaseDriver;
}

async function fixture(
  opts: { trashedAccount?: boolean; withAccountSystem?: boolean } = {},
): Promise<Fixture> {
  // No bootstrap: this fixture applies Ruby's OWN first-run seed
// (src/card/auth/boot-seed.ts), which creates the codename cards AND the
// default *all+*read rule itself. Seeding the stock read substrate first
// would collide with every codename row it writes.
const render = await createRenderTestStorage({ bootstrapReadRules: false });
  // The auth_sessions table, through the real migration runner — the sign-in
  // assertion at the end of the happy path needs it (signin.ts:364 creates a
  // session row). The render storage loads only the CORE schema
  // (render-test-storage.ts:52-57), so the auth migration is this fixture's job.
  await runAuthMigrations(render.counting);
  if (opts.withAccountSystem !== false) await seedAccountSystem(render.counting, opts);
  return { render, driver: render.counting };
}

// env gate — set and restored per case, never cached at module load.
const ENV_KEYS = ["DECKO_FIRST_RUN", "DECKO_WRITE_PATH"] as const;
const priorEnv = new Map<string, string | undefined>();
afterEach(() => {
  for (const key of ENV_KEYS) {
    const prior = priorEnv.get(key);
    if (prior === undefined) delete process.env[key];
    else process.env[key] = prior;
    priorEnv.delete(key);
  }
});
function setEnv(key: (typeof ENV_KEYS)[number], value: string | undefined): void {
  if (!priorEnv.has(key)) priorEnv.set(key, process.env[key]);
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
/** The demo profile from the flow module's env contract. */
function armDemoProfile(): void {
  setEnv("DECKO_FIRST_RUN", "1");
  setEnv("DECKO_WRITE_PATH", "1");
}

/**
 * A compound field CHILD's content, addressed STRUCTURALLY by its
 * (left_id, right_id) pair.
 *
 * NOT by name: the engine writes compound rows with name = NULL and a
 * populated cards.key. account-verify-reset-flows.ts's
 * holderIdForAccountName notes the same convention. The right_id is the
 * codename card's id, which is what makes this a named field read.
 */
async function selectField(
  driver: SQLDatabaseDriver,
  leftId: number,
  fieldCodenameId: number,
): Promise<string | undefined> {
  const result = await driver.query<{ db_content: string | null }>(
    "SELECT db_content FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0",
    [leftId, fieldCodenameId],
  );
  return result.rows[0]?.db_content ?? undefined;
}

// ---------------------------------------------------------------------------
// 1. THE CENSUS — needs_setup?
// ---------------------------------------------------------------------------

describe("the census (auth/setup.rb:33-52)", () => {
  it("reads zero on a stock deck: the two shipped accounts are bot-created", async () => {
    const { driver, render } = await fixture();
    const ids = await resolveAccountCodenameIds(driver);
    expect(ids).not.toBeNull();
    // Two `+*account` rows exist; the census still reads 0 because
    // `creator_id: ["ne", Card::DeckoBotID]` (auth/setup.rb:43-46) excludes
    // them.
    const rows = await driver.query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM cards WHERE right_id = ?",
      [IDS.account],
    );
    expect(Number(rows.rows[0]?.n ?? 0)).toBe(2);
    expect(await countUserAccounts(driver, ids!, [BOT.id, ANON.id])).toBe(0);
    render.close();
  });

  it("counts a human-created account", async () => {
    const { driver, render } = await fixture();
    await insertHolder(driver, 9400, "Real User");
    await insertJunction(driver, { id: 9401, holderId: 9400, holderName: "Real User", creatorId: ANON.id });
    const ids = await resolveAccountCodenameIds(driver);
    expect(await countUserAccounts(driver, ids!, [BOT.id, ANON.id])).toBe(1);
    render.close();
  });

  it("ignores a trashed account — where.rb:75-77 makes every search `trash is false`", async () => {
    const { driver, render } = await fixture({ trashedAccount: true });
    const ids = await resolveAccountCodenameIds(driver);
    expect(await countUserAccounts(driver, ids!, [BOT.id, ANON.id])).toBe(0);
    armDemoProfile();
    // And the window stays open: a deleted account does not re-arm setup.
    expect((await setupWindowState({ driver })).reason).toBe("needs_setup");
    render.close();
  });

  it("excludes the SHIPPED accounts by HOLDER, and counts everything else — auth/setup.rb:44", async () => {
    // The reference's own rule is stated in full: "every deck starts with
    // two accounts: DeckoBot and Anonymous". Its CQL proxies for that with
    // `creator_id: ["ne", Card::DeckoBotID]` (auth/setup.rb:43-46); this
    // census counts on the HOLDER instead, because this engine has one actor
    // where that implementation splits authority (as_id) from authorship
    // (current_id) — see
    // countUserAccounts's header for the whole mechanism. What matters is that
    // the two shipped rows are excluded and a human row is not.
    const { driver, render } = await fixture();
    const ids = await resolveAccountCodenameIds(driver);
    // Both shipped junctions exist and both are EXCLUDED.
    const shipped = await driver.query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM cards WHERE right_id = ?",
      [IDS.account],
    );
    expect(Number(shipped.rows[0]?.n ?? 0)).toBe(2);
    expect(await countUserAccounts(driver, ids!, [BOT.id, ANON.id])).toBe(0);
    // A human account is counted.
    await insertHolder(driver, 9400, "Real User");
    await insertJunction(driver, { id: 9401, holderId: 9400, holderName: "Real User", creatorId: ANON.id });
    expect(await countUserAccounts(driver, ids!, [BOT.id, ANON.id])).toBe(1);
    render.close();
  });

  it("counts an account the SETUP FLOW created, which is the bug the holder rule exists to fix", async () => {
    // The literal CQL filter cannot see this row: this engine stamps
    // a bot-authored create with the bot's id (one actor, where the reference
    // splits as_id from current_id), so `creator_id <> DeckoBotID`
    // (auth/setup.rb:43-46) would read zero and the window would never
    // close. The holder rule sees it.
    armDemoProfile();
    const { driver, render } = await fixture();
    const outcome = await createOwnerAccount(
      { driver, fetcher: render.fetcher },
      { email: "owner@example.com", password: "Abcdef1!" },
    );
    expect(outcome.ok, JSON.stringify(outcome)).toBe(true);
    if (outcome.ok) {
      const junction = await driver.query<{ creator_id: number }>(
        "SELECT creator_id FROM cards WHERE left_id = ? AND right_id = ?",
        [outcome.owner.id, IDS.account],
      );
      // The stamp really IS the bot's — the whole reason the literal CQL breaks.
      expect(Number(junction.rows[0]?.creator_id ?? 0)).toBe(BOT.id);
      // And the census still sees the account, so the window closes.
      const after = await setupWindowState({ driver });
      expect(after.reason).toBe("setup_complete");
      expect(after.accountCount).toBe(1);
    }
    render.close();
  });

  it("reports account_system_absent on a deck with no account cards", async () => {
    // The real condition of BOTH shipped seeds: db/seed.sql has 4
    // `INSERT INTO cards`, deploy/seed/seed.sql has 15, and `grep -i account`
    // over each returns nothing — neither carries an `*account` codename.
    armDemoProfile();
    const { driver, render } = await fixture({ withAccountSystem: false });
    const state = await setupWindowState({ driver });
    expect(state.reason).toBe("account_system_absent");
    expect(state.open).toBe(false);
    render.close();
  });

  it("reports bot_card_absent when the deck has no decko_bot card", async () => {
    armDemoProfile();
    const { driver, render } = await fixture();
    // Delete the bot row: the census has no DeckoBot to exclude, so it
    // cannot be computed at all. Reported, not guessed around.
    await insertHolder(driver, 9500, "Temp Bot");
    await driver.query("UPDATE cards SET trash = 1 WHERE id = ?", [IDS.deckoBot]);
    const state = await setupWindowState({ driver });
    expect(state.reason).toBe("bot_card_absent");
    expect(state.open).toBe(false);
    render.close();
  });
});

// ---------------------------------------------------------------------------
// 2. DISABLED BY DEFAULT — the additive-surface gate
// ---------------------------------------------------------------------------

describe("disabled by default", () => {
  it("firstRunEnabled() is false with no env set", () => {
    setEnv("DECKO_FIRST_RUN", undefined);
    expect(firstRunEnabled()).toBe(false);
  });

  it("is false for every value other than exactly \"1\"", () => {
    for (const value of ["0", "", "true", "yes", "1 ", " 1", "01"]) {
      setEnv("DECKO_FIRST_RUN", value);
      expect(firstRunEnabled()).toBe(false);
    }
  });

  it("the route returns null for GET and POST when unarmed, so the host's own surface is untouched", async () => {
    setEnv("DECKO_FIRST_RUN", undefined);
    const { driver, render } = await fixture();
    for (const method of ["GET", "POST"]) {
      const response = await handleFirstRunRequest(
        { driver, fetcher: render.fetcher },
        {
          method,
          pathname: SETUP_PATH,
          host: "127.0.0.1:3011",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: "email=a%40b.com&password=Abcdef1%21",
        },
      );
      // null = "not my request" — the host falls through unchanged. This is
      // the byte-identity guarantee: the unarmed module invents no response.
      expect(response).toBeNull();
    }
    render.close();
  });

  it("with the first-run gate on but the write path off, it reports write_path_disabled instead of a form that cannot submit", async () => {
    setEnv("DECKO_FIRST_RUN", "1");
    setEnv("DECKO_WRITE_PATH", undefined);
    const { driver, render } = await fixture();
    expect((await setupWindowState({ driver })).reason).toBe("write_path_disabled");
    const response = await handleFirstRunRequest(
      { driver, fetcher: render.fetcher },
      { method: "GET", pathname: SETUP_PATH, host: "h", headers: {}, body: "" },
    );
    expect(response?.status).toBe(404);
    expect(response?.body).toContain("read-only");
    render.close();
  });
});

// ---------------------------------------------------------------------------
// 3. WINDOW CLOSED — the create-side abort
// ---------------------------------------------------------------------------

describe("window closed (user.rb:51 `abort :failure unless Auth.needs_setup?`)", () => {
  it("the route 404s on GET once an account exists", async () => {
    armDemoProfile();
    const { driver, render } = await fixture();
    await insertHolder(driver, 9600, "Real User");
    await insertJunction(driver, { id: 9601, holderId: 9600, holderName: "Real User", creatorId: ANON.id });
    const state = await setupWindowState({ driver });
    expect(state.reason).toBe("setup_complete");
    expect(state.open).toBe(false);
    expect(state.accountCount).toBe(1);
    const response = await handleFirstRunRequest(
      { driver, fetcher: render.fetcher },
      { method: "GET", pathname: SETUP_PATH, host: "h", headers: {}, body: "" },
    );
    expect(response?.status).toBe(404);
    expect(response?.body).toContain("already has an account");
    render.close();
  });

  it("the create refuses a second owner even when the form is posted directly", async () => {
    // Load-bearing: the create-side abort runs as an EVENT
    // `before: :check_permissions`, so the gate is not a view permission a
    // crafted post can walk around.
    armDemoProfile();
    const { driver, render } = await fixture();
    await insertHolder(driver, 9600, "Real User");
    await insertJunction(driver, { id: 9601, holderId: 9600, holderName: "Real User", creatorId: ANON.id });
    const outcome = await createOwnerAccount(
      { driver, fetcher: render.fetcher },
      { email: "second@example.com", password: "Abcdef1!" },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("setup_complete");
      expect(outcome.message).toContain("already has an account");
    }
    // The refused attempt wrote no holder card.
    const rows = await driver.query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM cards WHERE name = ?",
      ["second"],
    );
    expect(Number(rows.rows[0]?.n ?? 0)).toBe(0);
    render.close();
  });

  it("a trashed account does NOT re-open the window", async () => {
    armDemoProfile();
    const { driver, render } = await fixture({ trashedAccount: true });
    expect((await setupWindowState({ driver })).reason).toBe("needs_setup");
    const response = await handleFirstRunRequest(
      { driver, fetcher: render.fetcher },
      { method: "GET", pathname: SETUP_PATH, host: "h", headers: {}, body: "" },
    );
    expect(response?.status).toBe(200);
    render.close();
  });
});

// ---------------------------------------------------------------------------
// 4. THE VALIDATION LADDERS
// ---------------------------------------------------------------------------

describe("the create-time validation ladders", () => {
  it("downcases before validating the address (email.rb:29-33 then :7-14)", () => {
    // downcase_email is :prepare_to_validate and validate_email is :validate,
    // so the regex sees the DOWNCASED string — an uppercase domain is legal.
    expect(normalizeNewAccountEmail("  Owner@Example.COM  ")).toEqual({
      ok: true,
      email: "owner@example.com",
    });
    expect(normalizeNewAccountEmail("   ")).toMatchObject({
      ok: false,
      reason: "email_blank",
      message: "can't be blank",
    });
    // the email event's own regex: the domain needs a dotted suffix.
    expect(normalizeNewAccountEmail("owner@example")).toMatchObject({
      ok: false,
      reason: "email_invalid",
      message: "must be valid address",
    });
  });

  it("applies right/password.rb's rules with the gem's own message wording", () => {
    expect(checkNewAccountPassword("Abcdef1!")).toEqual({ ok: true });
    expect(checkNewAccountPassword("Ab1!")).toMatchObject({
      ok: false,
      reason: "password_too_short",
      message: "must be 8 characters or longer",
    });
    // the config'd list in order, consolidated "X, Y, and Z" / "X and Y" /
    // "X".
    expect(checkNewAccountPassword("abcdefgh")).toMatchObject({
      ok: false,
      reason: "password_missing_char_types",
      message:
        "must contain an upper case letter, a special character (like !@$%&#), and a number",
    });
    expect(checkNewAccountPassword("ABCDEFGH")).toMatchObject({
      message: "must contain a lower case letter, a special character (like !@$%&#), and a number",
    });
    expect(checkNewAccountPassword("Abcdefgh")).toMatchObject({
      message: "must contain a special character (like !@$%&#) and a number",
    });
  });
});

// ---------------------------------------------------------------------------
// 5. THE CREATE — the happy path, over the real engine
// ---------------------------------------------------------------------------

describe("createOwnerAccount — the happy path", () => {
  it("writes the account card shape signin.ts reads, and the owner can then sign in", async () => {
    armDemoProfile();
    const { driver, render } = await fixture();

    const outcome = await createOwnerAccount(
      { driver, fetcher: render.fetcher, now: () => new Date("2026-10-02T05:30:57Z") },
      { email: "  Owner@Example.COM ", password: "Abcdef1!" },
    );
    expect(outcome.ok, JSON.stringify(outcome)).toBe(true);
    if (!outcome.ok) {
      render.close();
      return;
    }

    // (a) the name is derived from the address's local part — the
    //     reference's own setup form takes a real name field instead.
    expect(outcome.owner.name).toBe("owner");
    // (b) the stored address is the downcased, stripped one.
    expect(outcome.email).toBe("owner@example.com");
    // (c) the salt is a 40-char lowercase hex — the shape every real
    //     deck's +*salt carries.
    expect(outcome.salt).toMatch(/^[0-9a-f]{40}$/);

    // (d) the account subtree, in the shape signin.ts:169-184 reads: the
    //     junction (left = the User card,
    //     right = the *account card) plus four field children. Addressed
    //     structurally — the engine writes compound rows with name = NULL.
    const junction = await driver.query<{ id: number; left_id: number; right_id: number }>(
      "SELECT id, left_id, right_id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0",
      [outcome.owner.id, IDS.account],
    );
    expect(Number(junction.rows[0]?.id ?? 0)).toBe(outcome.accountId);
    expect(Number(junction.rows[0]?.left_id ?? 0)).toBe(outcome.owner.id);
    expect(Number(junction.rows[0]?.right_id ?? 0)).toBe(IDS.account);
    // The holder is User-typed: `default_accounted_type_id` = UserID.
    const holder = await driver.query<{ type_id: number }>(
      "SELECT type_id FROM cards WHERE id = ?",
      [outcome.owner.id],
    );
    expect(Number(holder.rows[0]?.type_id ?? 0)).toBe(IDS.user);

    expect(await selectField(driver, outcome.accountId, IDS.email)).toBe("owner@example.com");
    expect(await selectField(driver, outcome.accountId, IDS.salt)).toBe(outcome.salt);
    // (e) set_default_status's "active" fallback arm — the
    //     owner is born signable, which is the whole point of the journey.
    expect(await selectField(driver, outcome.accountId, IDS.status)).toBe("active");

    // (f) the password is stored the way encrypt_password stores it under
    //     the deck's policy (docs/SECURITY.md, "Passwords"): a PBKDF2 hash by
    //     default; Ruby's salted digest (Card::Auth.encrypt, auth.rb:36-39,
    //     over the salt just written) in legacy-sha1 mode, pinned in
    //     tests/card/auth/password-hash.test.ts.
    const storedPassword = (await selectField(driver, outcome.accountId, IDS.password)) ?? "";
    expect(isPbkdf2Hash(storedPassword)).toBe(true);
    expect((await checkPassword(storedPassword, "Abcdef1!", outcome.salt)).ok).toBe(true);
    expect(storedPassword).not.toBe(await sha1Hex(`${outcome.salt}--Abcdef1!--`));

    // (g) the whole point of the journey: the brand-new owner signs in
    //     through the EXISTING signin flow, unchanged. Both shipped seeds
    //     create zero accounts, so without the create the journey would
    //     dead-end at sign-in.
    const sessions = new SessionStore({ driver });
    const signedIn = await signinAccount(driver, sessions, "Owner@Example.COM", "Abcdef1!");
    expect(signedIn.ok).toBe(true);
    if (signedIn.ok) {
      expect(signedIn.actor.id).toBe(outcome.owner.id);
      expect(signedIn.actor.name).toBe("owner");
    }
    // A wrong password still fails through the same ladder.
    const wrong = await signinAccount(driver, sessions, "owner@example.com", "Wrongpass1!");
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.reason).toBe("wrong_password");

    // (h) the window is now CLOSED — the census sees the new row.
    const after = await setupWindowState({ driver });
    expect(after.reason).toBe("setup_complete");
    expect(after.accountCount).toBe(1);

    render.close();
  });

  it("puts the owner in each first-user role's *members setting, not a +members subcard", async () => {
    armDemoProfile();
    const { driver, render } = await fixture();
    const outcome = await createOwnerAccount(
      { driver, fetcher: render.fetcher, now: () => new Date("2026-10-02T05:30:57Z") },
      { email: "owner@example.com", password: "Abcdef1!" },
    );
    expect(outcome.ok, JSON.stringify(outcome)).toBe(true);

    // The setting the role hash hangs off is `*members` (right_id: MembersID) —
    // read-rules.ts:247 builds the actor's roles from exactly those rows.
    // A write to `+members` lands on a card no permission statement reads,
    // so the owner held no role and was never an admin.
    //
    // Compound rows carry name = NULL, so resolve structurally: the row is
    // (role card) x (the `*members` setting card). The setting is created
    // here as a plain card, so it is matched by NAME, not by codename.
    for (const role of ["Help Desk", "Shark", "Administrators"]) {
      const starred = await driver.query<{ db_content: string | null }>(
        `SELECT c.db_content FROM cards c
           JOIN cards l ON l.id = c.left_id
           JOIN cards r ON r.id = c.right_id
          WHERE l.name = ? AND r.name = '*members' AND c.trash = 0`,
        [role],
      );
      expect(starred.rows.length, `${role}+*members is missing`).toBe(1);
      expect(starred.rows[0]?.db_content).toBe("owner");

      // And the wrong card is no longer written at all: no row joins this
      // role to a plain `members` card.
      const unstarred = await driver.query<{ id: number }>(
        `SELECT c.id FROM cards c
           JOIN cards l ON l.id = c.left_id
           JOIN cards r ON r.id = c.right_id
          WHERE l.name = ? AND r.name = 'members' AND c.trash = 0`,
        [role],
      );
      expect(unstarred.rows.length, `${role}+members must not exist`).toBe(0);
    }

    render.close();
  });

  it("de-duplicates a derived owner name instead of raising a name collision the human cannot act on", async () => {
    armDemoProfile();
    const { driver, render } = await fixture();
    // A card named "owner" already exists (no account), so the derived name
    // must move on rather than colliding.
    await insertHolder(driver, 9700, "owner");
    const outcome = await createOwnerAccount(
      { driver, fetcher: render.fetcher },
      { email: "owner@example.com", password: "Abcdef1!" },
    );
    expect(outcome.ok, JSON.stringify(outcome)).toBe(true);
    if (outcome.ok) {
      expect(outcome.owner.name).toBe("owner 2");
      const sessions = new SessionStore({ driver });
      expect((await signinAccount(driver, sessions, "owner@example.com", "Abcdef1!")).ok).toBe(true);
    }
    render.close();
  });

  it("writes nothing when the form input fails validation", async () => {
    armDemoProfile();
    const { driver, render } = await fixture();
    const before = await driver.query<{ n: number }>("SELECT COUNT(*) AS n FROM cards", []);
    const outcome = await createOwnerAccount(
      { driver, fetcher: render.fetcher },
      { email: "owner@example.com", password: "short" },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("password_too_short");
      expect(outcome.field).toBe("password");
    }
    const after = await driver.query<{ n: number }>("SELECT COUNT(*) AS n FROM cards", []);
    expect(Number(after.rows[0]?.n ?? 0)).toBe(Number(before.rows[0]?.n ?? 0));
    render.close();
  });

  it("refuses a duplicate address (email.rb:16-27 validate_unique_email)", async () => {
    armDemoProfile();
    const { driver, render } = await fixture();
    // Pre-seed a LIVE +*email child carrying the address, on an account whose
    // junction is the only one the census counts.
    await insertHolder(driver, 9800, "Taken");
    await insertJunction(driver, { id: 9801, holderId: 9800, holderName: "Taken", creatorId: ANON.id });
    await insertRow(
      driver,
      `INSERT INTO cards
         (id, name, key, codename, left_id, right_id, current_revision_id,
          created_at, updated_at, creator_id, updater_id,
          read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
       VALUES (9802, 'Taken+*account+*email', NULL, NULL, 9801, ${IDS.email}, NULL,
        '${TS}', '${TS}', ${BOT.id}, ${BOT.id}, NULL, NULL, NULL, 0, 1,
        'taken@example.com')`,
    );
    // The census now counts one account, so the window is closed before the
    // duplicate ladder is even reachable — which is itself the stronger
    // property. Assert both.
    expect((await setupWindowState({ driver })).reason).toBe("setup_complete");
    const outcome = await createOwnerAccount(
      { driver, fetcher: render.fetcher },
      { email: "Taken@Example.com", password: "Abcdef1!" },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("setup_complete");
    render.close();
  });
});

// ---------------------------------------------------------------------------
// 5b. THE CONCURRENCY BOUNDARY — measured, not asserted
// ---------------------------------------------------------------------------
//
// The census (createOwnerAccount step 0) is a READ that gates a sequence of
// six separate WRITES. Nothing wraps that sequence in a transaction: the
// driver seam (src/server/driver.ts:28-31) offers only `query` and `batch`,
// and the six creates go through CardActionEngine, which interleaves reads
// and writes per card. So the read-then-write is not atomic.
//
// These two pins MEASURE what that costs, so the claim in
// src/server/first-run-routes.ts is whatever the code actually does rather
// than whatever the comment hoped. If a transaction or a UNIQUE constraint
// is ever added to close this, the first pin FAILS and says so — which is
// the signal to reword the comment upward rather than leave it alone.

describe("createOwnerAccount — the concurrency boundary", () => {
  it("two creates issued back to back: the second is refused by the census", async () => {
    armDemoProfile();
    const { driver, render } = await fixture();
    const deps = { driver, fetcher: render.fetcher, now: () => new Date("2026-10-02T05:30:57Z") };

    const first = await createOwnerAccount(deps, { email: "owner@example.com", password: "Abcdef1!" });
    expect(first.ok, JSON.stringify(first)).toBe(true);

    // Sequential: the census re-counts, sees the first owner's committed
    // junction row, and the create aborts at step 0. This half of the
    // at-most-once story is real and is what the window is for.
    const second = await createOwnerAccount(deps, { email: "other@example.com", password: "Abcdef1!" });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("setup_complete");

    render.close();
  });

  it("two creates issued CONCURRENTLY: both pass the census and both owners are written", async () => {
    armDemoProfile();
    const { driver, render } = await fixture();
    const deps = { driver, fetcher: render.fetcher, now: () => new Date("2026-10-02T05:30:57Z") };

    // Started in the same tick, so both run the census before either has
    // written its junction row. Distinct addresses, so the duplicate-email
    // ladder does not catch them either — and even the same address would
    // not help, since that ladder is a separate SELECT with its own race.
    const [a, b] = await Promise.all([
      createOwnerAccount(deps, { email: "owner@example.com", password: "Abcdef1!" }),
      createOwnerAccount(deps, { email: "other@example.com", password: "Abcdef1!" }),
    ]);

    // Both succeed — this is the gap the route's comment used to deny. The
    // pin names it so the behavior cannot drift silently.
    expect([a.ok, b.ok]).toEqual([true, true]);

    // ...and the deck really does end up with two owners, which is the part
    // that matters: the guarantee is not just unenforced, it does not hold.
    const owners = await driver.query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM cards
       WHERE right_id = ? AND trash = 0 AND NOT (left_id IN (?, ?))`,
      [IDS.account, BOT.id, IDS.anonymous],
    );
    expect(Number(owners.rows[0]?.n ?? 0)).toBe(2);

    render.close();
  });
});
// ---------------------------------------------------------------------------

describe("the /setup route", () => {
  it("renders a minimal form carrying Ruby's own button label (user.rb:36)", async () => {
    armDemoProfile();
    const { driver, render } = await fixture();
    const response = await handleFirstRunRequest(
      { driver, fetcher: render.fetcher },
      { method: "GET", pathname: SETUP_PATH, host: "deck.example", headers: {}, body: "" },
    );
    expect(response?.status).toBe(200);
    expect(response?.headers["Content-Type"]).toBe("text/html; charset=utf-8");
    // Minimal: exactly the two fields the form carries.
    expect(response?.body).toContain('name="email"');
    expect(response?.body).toContain('name="password"');
    expect(response?.body).toContain('action="/setup"');
    expect(response?.body).toContain('method="post"');
    // `submit_button text: "Set up"` — the reference's own words.
    expect(response?.body).toContain(">Set up</button>");
    // No card-hash grammar: this form posts to the route, not to a card.
    expect(response?.body).not.toContain("card[subcards]");
    render.close();
  });

  it("re-renders with the en.yml message and 422 on a bad input (Ruby's UserError status)", async () => {
    armDemoProfile();
    const { driver, render } = await fixture();
    const response = await handleFirstRunRequest(
      { driver, fetcher: render.fetcher },
      {
        method: "POST",
        pathname: SETUP_PATH,
        host: "deck.example",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "email=owner%40example.com&password=short",
      },
    );
    expect(response?.status).toBe(422);
    expect(response?.body).toContain("must be 8 characters or longer");
    expect(response?.body).toContain('data-field="password"');
    // The form is still there, so the human can correct and resubmit.
    expect(response?.body).toContain('name="password"');
    render.close();
  });

  it("redirects to sign in with 303 on a successful create (cud_success, response.rb:25-33)", async () => {
    armDemoProfile();
    const { driver, render } = await fixture();
    const response = await handleFirstRunRequest(
      { driver, fetcher: render.fetcher },
      {
        method: "POST",
        pathname: SETUP_PATH,
        host: "deck.example",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "email=owner%40example.com&password=Abcdef1%21",
      },
    );
    expect(response?.status).toBe(303);
    expect(response?.headers["Location"]).toBe("http://deck.example/_signin");
    // The expiry name reaches the host's cache fan-out, as the write path's does.
    expect(response?.expiryName).toBe("owner");
    // And the journey's end state is real: the owner signs in.
    const sessions = new SessionStore({ driver });
    expect((await signinAccount(driver, sessions, "owner@example.com", "Abcdef1!")).ok).toBe(true);
    render.close();
  });

  // Security divergence (docs/SECURITY.md, "Cross-site requests"): the setup
  // POST creates the owner account, so a page on another site cannot submit it.
  it("refuses a setup POST from another site with 403 and creates no account", async () => {
    armDemoProfile();
    const { driver, render } = await fixture();
    const post = (headers: Record<string, string>) =>
      handleFirstRunRequest(
        { driver, fetcher: render.fetcher },
        {
          method: "POST",
          pathname: SETUP_PATH,
          host: "deck.example",
          headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
          body: "email=owner%40example.com&password=Abcdef1%21",
        },
      );
    const refused = await post({ origin: "https://attacker.example" });
    expect(refused?.status).toBe(403);
    expect(refused?.body).toContain("came from another site");
    expect((await setupWindowState({ driver })).open).toBe(true);
    expect((await post({ origin: "http://deck.example" }))?.status).toBe(303);
    render.close();
  });

  it("returns null for a method it does not serve and for any other path", async () => {
    armDemoProfile();
    const { driver, render } = await fixture();
    const cases: ReadonlyArray<readonly [string, string]> = [
      ["DELETE", SETUP_PATH],
      ["PUT", SETUP_PATH],
      ["PATCH", SETUP_PATH],
      ["GET", "/some/other/path"],
      ["GET", "/setup/extra"],
      ["POST", "/"],
      // NOT a card mark: the write path's own grammar must be untouched.
      ["POST", "/update/*signin"],
    ];
    for (const [method, pathname] of cases) {
      const response = await handleFirstRunRequest(
        { driver, fetcher: render.fetcher },
        { method, pathname, host: "h", headers: {}, body: "" },
      );
      expect(response, `${method} ${pathname}`).toBeNull();
    }
    render.close();
  });

  it("parses both body types and refuses the ones it does not read", () => {
    expect(parseSetupForm("email=a%40b.com&password=x", "application/x-www-form-urlencoded")).toEqual({
      email: "a@b.com",
      password: "x",
    });
    expect(parseSetupForm('{"email":"a@b.com","password":"x"}', "application/json")).toEqual({
      email: "a@b.com",
      password: "x",
    });
    expect(parseSetupForm("nope", "multipart/form-data")).toBeNull();
    expect(parseSetupForm("not json", "application/json")).toBeNull();
  });
});
