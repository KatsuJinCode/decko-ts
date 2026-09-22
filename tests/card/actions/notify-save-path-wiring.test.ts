// Save-path notify wiring, end to end: a card saved through the REAL
// CardActionEngine dispatches the act's events to the registered
// follow-notify hook, whose template resolves from THIS deck's
// follower_notification_email children (deckEmailTemplateResolver) and
// whose mail lands in the injected CaptureTransport.
//
// Proven here (the wiring per docs/notify-port-notes.md "save-path
// registration line"):
//   - no integrationHooks configured -> saves dispatch nothing (engine
//     behavior unchanged for every pre-existing caller);
//   - hooks configured -> updating a followed card fires the hook once
//     with the deck-resolved template bytes (the interpolation vars the
//     first mechanism supports: {{follower}}, {{followed_set}},
//     {{follow_option}} — mail.ts renderMail);
//   - an anonymous actor dispatches nothing (notifications carry the
//     acting user; anonymous writes throw before any dispatch).
// The follower rule-algebra walk is a deferred stream: the follower
// resolver here is the fixed sugar (deck-resolvers.ts header).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { splitSqlStatements, seedCard } from "../render/render-test-storage.js";
import type { RenderTestStorage } from "../render/render-test-storage.js";
import {
  buildFollowNotifyHook,
  fixedAuthAs,
  fixedFollowerResolver,
  CaptureTransport,
  deckEmailTemplateResolver,
  type SavePathIntegrationHook,
} from "../../../src/card/notify/index.js";
import type { Actor } from "../../../src/card/actions/types.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const ACTOR: Actor = { id: 7, name: "John" };

async function makeHarness(
  extra: Partial<Parameters<typeof CardActionEngine.prototype.applyAction>> = {},
): Promise<{
  engine: CardActionEngine;
  fetch: FetchEngine;
  transport: CaptureTransport;
  storage: RenderTestStorage;
  close: () => void;
}> {
  const driver = new LocalSqliteDriver({ path: ":memory:" });
  for (const statement of splitSqlStatements(
    readFileSync(`${REPO_ROOT}db/schema.sqlite.sql`, "utf8"),
  )) {
    await driver.query(statement, []);
  }
  const fetch = new FetchEngine(driver);
  const transport = new CaptureTransport();
  const engine = new CardActionEngine(fetch, {
    actor: ACTOR,
    ...extra,
  } as never);
  const storage = { counting: { query: (s: string, p: unknown[]) => driver.query(s, p) } } as never;
  void storage;
  return {
    engine,
    fetch,
    transport,
    storage: { counting: { query: (s: string, p: unknown[]) => driver.query(s, p) } } as RenderTestStorage,
    close: () => driver.close(),
  };
}

/** The template triple, seeded as REAL cards through the storage helper
 *  (the children are the names M6's capture proved:
 *  follower notification email+*subject / +*text message). */
async function seedTemplateCards(storage: RenderTestStorage): Promise<void> {
  await seedCard(storage, {
    id: 556,
    name: "follower notification email",
    typeId: 2,
  });
  await seedCard(storage, {
    id: 557,
    name: "follower notification email+*subject",
    typeId: 2,
    dbContent: "{{followed_set}} on {{follow_option}}",
  });
  await seedCard(storage, {
    id: 558,
    name: "follower notification email+*text message",
    typeId: 2,
    dbContent: "Hi! {{follower}} — {{followed_set}} changed.",
  });
}

function followHook(fetch: FetchEngine): SavePathIntegrationHook {
  return buildFollowNotifyHook({
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
    authAs: fixedAuthAs({ id: 9, name: "Sara", email: "sara@example.com" }),
  });
}

describe("save-path notify wiring (CardActionEngine -> integration hooks)", () => {
  it("dispatches nothing when no integrationHooks are configured", async () => {
    const { engine, transport, close } = await makeHarness();
    await engine.createCard({ name: "Plain Card", content: "x" });
    expect(transport.captured()).toEqual([]);
    close();
  });

  it("fires the follow hook with the deck-resolved template on update", async () => {
    const { engine, fetch, transport, storage, close } = await makeHarness({
      integrationHooks: [followHook(fetch)],
    } as never);
    await seedTemplateCards(storage);
    const created = await engine.createCard({ name: "Watched Card", content: "first" });
    transport.drain(); // the create's own act is not the target here
    await engine.updateCard({ cardId: created.cardId, content: "second" });
    const mails = transport.captured();
    expect(mails.length).toBe(1);
    expect(mails[0]?.to).toBe("sara@example.com");
    expect(mails[0]?.subject).toBe("Watched Card+*followed on always");
    expect(mails[0]?.textBody).toBe("Hi! Sara — Watched Card+*followed changed.");
    close();
  });

  it("dispatches nothing for an anonymous actor even with hooks configured", async () => {
    const driver = new LocalSqliteDriver({ path: ":memory:" });
    for (const statement of splitSqlStatements(
      readFileSync(`${REPO_ROOT}db/schema.sqlite.sql`, "utf8"),
    )) {
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
    expect(transport.captured()).toEqual([]);
    driver.close();
  });
});
