// event :validate_api_key (card-mod-api_key-0.20.0 set/right/api_key.rb:8-12)
// runs through the ModEventFn execution seam with its REAL body — both Ruby
// arms:
//
//   errors.add :content, t(:api_key_invalid) unless content.match?(/^\w{20,}$/)
//   errors.add :content, t(:api_key_taken) if api_key_taken?
//
// - en.yml: "Invalid API Key; must contain 20+ alphanumeric characters only"
//   and "API Key taken".
// - api_key_taken? (:14-17): Auth.find_account_by_api_key content
//   (lib/card/auth/api_key.rb:30-32 -> card/auth/current.rb:92-97) is the
//   search for live +*account cards having a +*api_key child whose content
//   equals the STRIPPED value; taken iff the found account card's id
//   differs from the saving card's left_id (its own +*account).
// - Set membership: Right::ApiKey applies to cards whose right card is
//   *api_key — the resolver arms (dispatcher fallback + the serving
//   runtime's resolver) answer right/<codename> by the right card's
//   codename, keys keeping the star.

import { describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  seedStandardDeck,
  seedCard,
  fakeClock,
  type ActionsTestStorage,
} from "../actions/actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { ModLoader } from "../../../src/card/mod-loader.js";
import apiKeyMod from "../../../src/card/mod-loader/mods/card-mod-api_key.js";
import { registerDeckModEventCardStateSources } from "../../../src/card/mod-loader/mod-event-state-sources.js";

registerDeckModEventCardStateSources();

function apiKeyRegistry() {
  const loader = new ModLoader([{ manifest: apiKeyMod }]);
  loader.resolveOrder({ gemMods: [] });
  loader.load();
  return loader.eventRegistry();
}

function engine(storage: ActionsTestStorage): CardActionEngine {
  return new CardActionEngine(storage.engine, {
    actor: { id: 9, name: "Joe User" },
    ipAddress: "192.0.2.7",
    now: fakeClock(),
    modEvents: { registry: apiKeyRegistry() },
  });
}

const GOOD_KEY = "QrtAbCdEfGhIjKlMnOpQr1";

/** Two account holders, each with a +*account card; the first also has a
 *  +*api_key child holding GOOD_KEY. Shape: <holder>+*account (right
 *  account), <holder>+*account+*api_key (right api_key). */
async function apiKeyDeck(
  storage: ActionsTestStorage,
): Promise<{ apiKeyCardId: number; twoKeyId: number }> {
  await seedCard(storage, { id: 90, name: "Holder One", typeId: 2 });
  await seedCard(storage, { id: 91, name: "Holder Two", typeId: 2 });
  const acctCodename = await seedCard(storage, { id: 92, name: "*account", codename: "account", typeId: 14 });
  const apiKeyCodename = await seedCard(storage, { id: 93, name: "*api_key", codename: "api_key", typeId: 14 });
  void acctCodename;
  void apiKeyCodename;
  const acctOne = await seedCard(storage, { id: 94, leftId: 90, rightId: 92, typeId: 2 });
  const acctTwo = await seedCard(storage, { id: 95, leftId: 91, rightId: 92, typeId: 2 });
  void acctTwo;
  const apiKeyCard = await seedCard(storage, {
    id: 96,
    leftId: 94,
    rightId: 93,
    typeId: 2,
    dbContent: GOOD_KEY,
  });
  // Holder Two's own api_key card starts with a DIFFERENT key
  const twoKeyCard = await seedCard(storage, {
    id: 97,
    leftId: 95,
    rightId: 93,
    typeId: 2,
    dbContent: "Other_Key_1234567890abc",
  });
  return { apiKeyCardId: apiKeyCard.id, twoKeyId: twoKeyCard.id };
}

describe("validate_api_key — through the seam (right/api_key.rb:8-12)", () => {
  it("a short content refuses with the en.yml invalid message", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const { apiKeyCardId } = await apiKeyDeck(storage);
    await expect(
      engine(storage).updateCard({ cardId: apiKeyCardId, content: "short" }),
    ).rejects.toMatchObject({
      code: "validation-failed",
      errorsByAttribute: {
        content: "Invalid API Key; must contain 20+ alphanumeric characters only",
      },
    });
    storage.close();
  });

  it("a value another account already holds refuses as taken (content stripped)", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const { twoKeyId } = await apiKeyDeck(storage);
    // Holder Two's api_key card takes Holder One's key. Ruby's $ anchor
    // matches before ONE final newline (so the grammar arm passes) and
    // find_account_by_api_key strips the value for the search
    // (lib/card/auth/api_key.rb:31-32) — the newline case is the
    // observable strip.
    await expect(
      engine(storage).updateCard({ cardId: twoKeyId, content: `${GOOD_KEY}\n` }),
    ).rejects.toMatchObject({
      code: "validation-failed",
      errorsByAttribute: { content: "API Key taken" },
    });
    storage.close();
  });

  it("a well-formed unique value saves", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const { apiKeyCardId } = await apiKeyDeck(storage);
    const result = await engine(storage).updateCard({
      cardId: apiKeyCardId,
      content: "Zz0_Yy1_Xx2_Ww3_Vv4_Uu5",
    });
    expect(result).not.toBeNull();
    storage.close();
  });

  it("the same account re-saving its own key is not taken", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const { apiKeyCardId } = await apiKeyDeck(storage);
    // a DIFFERENT valid key on the card's own account: not taken (the
    // found account is its own left — acct.id == left_id)
    const result = await engine(storage).updateCard({
      cardId: apiKeyCardId,
      content: "Own_Account_New_Key_0001",
    });
    expect(result).not.toBeNull();
    storage.close();
  });
});
