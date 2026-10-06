// The boot-seed pin (R-3b, OPERATOR-SCOPE-RULINGS-2026-10-05.md §R-3):
// a fresh empty deck run through the boot-seed capability must come out
// with a WORKING account system.
//
//   Ruby order being ported (card-1.110.0 mod/core/lib/tasks/card.rake:4-6):
//     task setup: %w[db:setup card:mod:symlink]
//   db:setup = schema create + schema:load + db:seed, and db/seeds.rb:3
//   calls Cardio::Seed.load — SEED RUNS AFTER SCHEMA INIT, at install time.
//   The mod-yaml cards then arrive through `card:eat` (card.rake:22, "Ingests
//   card data from mod yaml", Cardio::Mod::Eat) under `card:update` (:14).
//
//   THE PIN'S THREE LEGS (mission R-3b):
//     1. Anonymous/DeckoBot resolvable      (actor.ts actorAnonymous/actorBot)
//     2. the 17 role/account cards present  (the list below, each member
//        either named in the ruling — administrator, shark, help_desk,
//        anyone, anyone_signed_in, anonymous, enabled_roles, salt,
//        account_settings — or READ BY ENGINE SOURCE: account/email/
//        password/status are signin.ts's ACCOUNT_CODENAMES (:124), decko_bot
//        is the as_bot actor (actor.ts:47), user is first-run-setup.ts's
//        default_accounted_type_id resolution (:733), role is the role
//        cardtype the role cards are typed by, *members is the role
//        membership right the party walk reads (read-permission-actors
//        instrument, A1-S-19))
//     3. anyone_signed_in grantable          (a rule grant naming the card
//        goes through the engine's own write path on the seeded deck)
//
//   THE RED-FIRST LEG ("the base engine cannot create them") is the first
//   case: a schema-only deck (the fresh state every storage builder makes)
//   has NO codename cards at all — actorBot throws ActorNotFoundError,
//   resolveAccountCodenameIds returns null, and the first-run gate reports
//   account_system_absent. Nothing in the base engine creates them; that is
//   the gap first-run-setup.ts:204-208 documents.
//
// Storage: the render suite's in-memory core-schema storage (REAL
// LocalSqliteDriver over db/schema.sqlite.sql), the same fresh-deck state
// the first-run suite uses.

import { afterEach, describe, expect, it } from "vitest";
import { actorAnonymous, actorBot } from "../../../src/card/auth/actor.js";
import { resolveAccountCodenameIds as resolveAccountIds } from "../../../src/card/auth/signin.js";
import { bootstrapFreshDeck } from "../../../src/card/auth/boot-seed.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import {
  createRenderTestStorage,
  type RenderTestStorage,
} from "../render/render-test-storage.js";

const RULING_NINE = [
  "administrator",
  "shark",
  "help_desk",
  "anyone",
  "anyone_signed_in",
  "anonymous",
  "enabled_roles",
  "salt",
  "account_settings",
] as const;

/** The eight the ENGINE reads by codename, added to the ruling's nine to
 *  make the 17. Each cites its reader. */
const ENGINE_READ_EIGHT = [
  "account", // signin.ts:124 ACCOUNT_CODENAMES
  "email", // signin.ts:124
  "password", // signin.ts:124
  "status", // signin.ts:124
  "decko_bot", // actor.ts:47 — the as_bot actor
  "user", // first-run-setup.ts:733 default_accounted_type_id
  "role", // the cardtype the role cards are typed by (real.yml :type: :role)
  "members", // the role-membership right the A1-S-19 party walk reads
] as const;

const SEVENTEEN = [...RULING_NINE, ...ENGINE_READ_EIGHT];

let storage: RenderTestStorage | undefined;

afterEach(() => {
  storage?.close();
  storage = undefined;
});

async function freshSchemaDeck(): Promise<RenderTestStorage> {
  storage = await createRenderTestStorage();
  return storage;
}

describe("boot-seed: the base engine cannot create the account system (the RED-first leg)", () => {
  it("a schema-only fresh deck has no system actors, no account codenames, and the first-run gate reports the absence", async () => {
    const deck = await freshSchemaDeck();
    const count = await deck.fetcher.driver.query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM cards",
      [],
    );
    expect(Number(count.rows[0]?.n ?? 0)).toBe(0);

    await expect(actorBot(deck.fetcher.driver)).rejects.toThrow(/no card with codename "decko_bot"/);
    await expect(actorAnonymous(deck.fetcher.driver)).rejects.toThrow(
      /no card with codename "anonymous"/,
    );
    expect(await resolveAccountIds(deck.fetcher.driver)).toBeNull();
  });
});

describe("boot-seed: a fresh empty deck bootstrapped through the capability", () => {
  it("the capability creates a deck whose account system exists", async () => {
    const deck = await freshSchemaDeck();
    const outcome = await bootstrapFreshDeck({ driver: deck.fetcher.driver });
    expect(outcome.ok).toBe(true);

    // leg 1 — the system actors resolve
    const bot = await actorBot(deck.fetcher.driver);
    const anon = await actorAnonymous(deck.fetcher.driver);
    expect(bot.name).toBe("Decko Bot");
    expect(anon.name).toBe("Anonymous");

    // leg 2 — the 17 role/account cards present, by codename
    for (const codename of SEVENTEEN) {
      const row = await deck.fetcher.driver.query<{ id: number }>(
        "SELECT id FROM cards WHERE codename = ? AND trash = 0",
        [codename],
      );
      expect(row.rows[0]?.id, `codename card "${codename}" must exist`).toBeDefined();
    }

    // the first-run flow's own precondition now holds
    expect(await resolveAccountIds(deck.fetcher.driver)).not.toBeNull();
  });

  it("anyone_signed_in is grantable through the engine's own write path on the seeded deck", async () => {
    const deck = await freshSchemaDeck();
    const outcome = await bootstrapFreshDeck({ driver: deck.fetcher.driver });
    expect(outcome.ok).toBe(true);

    const bot = await actorBot(deck.fetcher.driver);
    const engine = new CardActionEngine(deck.fetcher, { actor: bot });
    // THE GRANT: *all+*read ships (cardio/seed.rb core fixture, card 10)
    // naming Decko Bot; re-granting it to Anyone Signed In is a real rule
    // write through the seeded deck.
    const rule = await engine.fetch.fetchByName("*all+*read");
    expect(rule?.id).toBeDefined();
    await engine.updateCard({ cardId: rule!.id!, content: "Anyone Signed In" });
    const reread = await engine.fetch.fetchByName("*all+*read");
    expect(reread?.dbContent).toBe("Anyone Signed In");
  });
});
