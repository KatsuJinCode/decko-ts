// Save-path notify wiring, end to end: a card saved through the REAL
// CardActionEngine (create/update) dispatches the act's events to the
// registered follow-notify hook, whose template resolves from THIS deck's
// follower_notification_email children (deckEmailTemplateResolver) and
// whose mail lands in the injected CaptureTransport.
//
// Proven here (the wiring, per docs/notify-port-notes.md "save-path
// registration line"):
//   - no integrationHooks configured -> saves dispatch nothing (the
//     engine's behavior is unchanged for every pre-existing caller);
//   - hooks configured -> an update to a followed card fires the hook once
//     per event with the deck-resolved template bytes;
//   - an anonymous actor dispatches nothing (notifications carry the
//     acting user).
// The follower rule-algebra walk is a deferred stream: the follower
// resolver here is the fixed sugar (see deck-resolvers.ts header).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import {
  CardActionEngine,
  type CardActionEngineOptions,
} from "../../../src/card/actions/card-action-engine.js";
import { splitSqlStatements } from "../render/render-test-storage.js";
import { seedCard, seedReference } from "../render/render-test-storage.js";
import {
  buildFollowNotifyHook,
  fixedAuthAs,
  fixedFollowerResolver,
  CaptureTransport,
  deckEmailTemplateResolver,
  type NotifyTransport,
  type SavePathIntegrationHook,
} from "../../../src/card/notify/index.js";
import type { Actor } from "../../../src/card/actions/types.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const DDL_PATH = `${REPO_ROOT}db/schema.sqlite.sql`;
const ACTOR: Actor = { id: 7, name: "John" };

function makeEngine(extra: Partial<CardActionEngineOptions> = {}): {
  engine: CardActionEngine;
  fetch: FetchEngine;
  transport: CaptureTransport;
  close: () => void;
} {
  const driver = new LocalSqliteDriver({ path: ":memory:" });
  const ddl = readFileSync(`${REPO_ROOT}db/schema.sqlite.sql`, "utf8");
  const close = () => driver.close();
  const statements = splitSqlStatements(ddl);
  const run = async (): Promise<void> => {
    for (const statement of statements) await driver.query(statement, []);
  };
  const fetch = new FetchEngine(driver);
  const transport = new CaptureTransport();
  const engine = new CardActionEngine(fetch, {
    actor: ACTOR,
    ...extra,
  } as CardActionEngineOptions);
  // DDL is applied synchronously before the engine is used (better-sqlite3
  // is sync under the async wrapper; awaiting in the test body below).
  void run;
  return { engine, fetch, transport, close };
}

/** The deck fixture: a followed card + the follower_notification_email
 *  template triple (M6's real-capture shape) + a from override. */
async function seedDeck(fetch: FetchEngine): Promise<void> {
  await seedCard(fetch as never, {
    id: 555,
    name: "Watched Card",
    typeId: 2,
    dbContent: "first revision",
  } as never);
  await seedCard(fetch as never, {
    id: 556,
    name: "follower notification email",
    typeId: 2,
  } as never);
  await seedCard(fetch as never, {
    id: 557,
    name: "follower notification email+*subject",
    typeId: 2,
    dbContent: "{{card_name}} changed {{followed_set}} on {{follow_option}}",
  } as never);
  await seedCard(fetch as never, {
    id: 558,
    name: "follower notification email+*text message",
    typeId: 2,
    dbContent: "Hi! {{card_name}} changed {{followed_set}}.",
  } as never);
}

describe("save-path notify wiring (CardActionEngine -> integration hooks)", () => {
  it("dispatches nothing when no integrationHooks are configured", async () => {
    const driver = new LocalSqliteDriver({ path: ":memory:" });
    for (const statement of splitSqlStatements(readFileSync(`${REPO_ROOT}db/schema.sqlite.sql`, "utf8"))) {
      await driver.query(statement, []);
    }
    const fetch = new FetchEngine(driver);
    const transport = new CaptureTransport();
    const engine = new CardActionEngine(fetch, { actor: ACTOR, notifyTransport: transport });
    await engine.createCard({ name: "Plain Card", content: "x" });
    expect(transport.captured).toEqual([]);
    driver.close();
  });

  it("fires the follow hook with the deck-resolved template on update of a followed card", async () => {
    const driver = new LocalSqliteDriver({ path: ":memory:" });
    for (const statement of splitSqlStatements(readFileSync(`${REPO_ROOT}db/schema.sqlite.sql`, "utf8"))) {
      await driver.query(statement, []);
    }
    const fetch = new FetchEngine(driver);
    const transport = new CaptureTransport();
    const hooks: SavePathIntegrationHook[] = [
      buildFollowNotifyHook({
        followers: fixedFollowerResolver([
          {
            followerId: 9,
            followerName: "Sara",
            followerEmail: "sara@example.com",
            followedSetName: "Watched Card+*followed",
            followOption: "always",
          },
        ]),
        template: deckEmailTemplateResolver(fetch),
        authAs: fixedAuthAs({ id: 9, name: "Sara" }),
      }),
    ];
    const engine = new CardActionEngine(fetch, {
      actor: ACTOR,
      integrationHooks: hooks,
      notifyTransport: transport,
    });
    const { seedCard: seed } = await import("../render/render-test-storage.js");
    await seed(engine as never, {
      id: 556,
      name: "follower notification email",
      typeId: 2,
    } as never);
    await seed(engine as never, {
      id: 557,
      name: "follower notification email+*subject",
      typeId: 2,
      dbContent: "{{card_name}} changed {{followed_set}} on {{follow_option}}",
    } as never);
    await seed(engine as never, {
      id: 558,
      name: "follower notification email+*text message",
      typeId: 2,
      dbContent: "Hi! {{card_name}} changed {{followed_set}}.",
    } as never);
    const created = await engine.createCard({ name: "Watched Card", content: "first" });
    expect(created.cardId).toBeGreaterThan(0);
    transport.captured.length = 0; // the create's own act is not the target
    await engine.updateCard({ cardId: created.cardId, content: "second" });
    expect(transport.captured.length).toBe(1);
    const mail = transport.captured[0] as { to: string; subject: string; textBody: string };
    expect(mail.to).toBe("sara@example.com");
    expect(mail.subject).toBe("Watched Card changed Watched Card+*followed on always");
    expect(mail.textBody).toBe("Hi! Watched Card changed Watched Card+*followed.");
    driver.close();
  });

  it("dispatches nothing for an anonymous actor even with hooks configured", async () => {
    const driver = new LocalSqliteDriver({ path: ":memory:" });
    for (const statement of splitSqlStatements(readFileSync(`${REPO_ROOT}db/schema.sqlite.sql`, "utf8"))) {
      await driver.query(statement, []);
    }
    const fetch = new FetchEngine(driver);
    const transport = new CaptureTransport();
    const engine = new CardActionEngine(fetch, {
      actor: null,
      integrationHooks: [
        buildFollowNotifyHook({
          followers: fixedFollowerResolver([]),
          template: deckEmailTemplateResolver(fetch),
          authAs: fixedAuthAs({ id: 1, name: "x" }),
        }),
      ],
      notifyTransport: transport,
    });
    await expect(engine.createCard({ name: "Nope" })).rejects.toThrow();
    expect(transport.captured).toEqual([]);
    driver.close();
  });
});
