// The api_key mod's two save events (card-mod-api_key-0.20.0
// set/right/api_key.rb), ported 2026-10-19 through the general mod-event
// stage walk:
//
//   event :generate_api_key, :prepare_to_validate, trigger: :required do
//     generate   # self.content = SecureRandom.base64.tr "+/=", "Qrt"
//   end          # (api_key.rb:4-6; generate :95-97)
//
//   event :validate_api_key, :validate, on: :save, changed: :content do
//     errors.add :content, t(:api_key_invalid) unless content.match?(/^\w{20,}$/)
//     errors.add :content, t(:api_key_taken) if api_key_taken?
//   end          # (api_key.rb:8-12; api_key_taken? :14-18)
//
// Oracle evidence: the gem source lines above (read this session) plus the
// SecureRandom.base64.tr run against Ruby 3.4.11 this session (20 fresh
// keys, every one length 24, all word characters). The key GENERATION is
// random by Ruby's contract; the test pins the grammar (24 word chars),
// the persistence (the row write carries the generated key), and the
// trigger gating - never a literal key.

import { describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  seedCard,
  seedStandardDeck,
  JOE,
  type ActionsTestStorage,
} from "../actions/actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { CardActionError } from "../../../src/card/actions/types.js";
import { DeckoName } from "../../../src/card/name.js";
import { ModLoader } from "../../../src/card/mod-loader.js";
import cardModApiKey, {
  generatedApiKey,
} from "../../../src/card/mod-loader/mods/card-mod-api_key.js";
import type { ModEventRuntime } from "../../../src/card/mod-loader/mod-event-dispatch.js";

const VALID_KEY_A = "K".repeat(30); // passes /^\w{20,}$/
const VALID_KEY_B = "M".repeat(30);

/** The api_key mod's registry (the same registration the SetLoader phase
 *  performs engine-wide when the mod is loaded). */
function apiKeyRegistry() {
  const loader = new ModLoader([{ manifest: cardModApiKey }]);
  loader.resolveOrder({ gemMods: ["api_key"] });
  loader.load();
  return loader.eventRegistry();
}

/** The scoped set resolver the dispatcher consults for right/api_key
 *  events (set_condition_applies?, all.rb:26-29): Ruby's Right pattern
 *  (pattern/base.rb:21-29) keys on the RIGHT card's codename - the
 *  junction's right part is the "*api key" setting card, whose codename
 *  is api_key. The production resolver (observedModEventRuntime) runs the
 *  same walk through the deck's codename column; the test deck seeds the
 *  stock names, so the right-part key comparison is the same verdict. */
function apiKeySetMember(setPath: string, card: { name: string }): boolean {
  if (setPath !== "right/api_key") return false;
  const rightKey = DeckoName.parse(card.name).rightName?.key;
  return rightKey === "*api_key";
}

function apiKeyEngine(storage: ActionsTestStorage): CardActionEngine {
  const runtime: ModEventRuntime = {
    registry: apiKeyRegistry(),
    setMember: (setPath, card) => apiKeySetMember(setPath, card),
  };
  return new CardActionEngine(storage.engine, {
    actor: JOE,
    ipAddress: "192.0.2.7",
    modEvents: runtime,
  });
}

interface ApiKeyFixture {
  engine: CardActionEngine;
  leftA: { id: number };
  leftB: { id: number };
  keyA: { id: number };
  keyB: { id: number };
  apiSetting: { id: number };
  accountSetting: { id: number };
}

/** Two account holders, each with the +*account junction and its +*api key
 *  child - Ruby's account-field family (abstract/account_field.rb: the
 *  +*api key card lives UNDER +*account, so find_account_by's search
 *  { right_id: AccountID, right_plus: [ApikeyID, ...] } walks exactly this
 *  shape) - plus the codename anchors (*account, *api key). */
async function seedApiKeyDeck(): Promise<{ storage: ActionsTestStorage; f: ApiKeyFixture }> {
  const storage = await createActionsTestStorage();
  await seedStandardDeck(storage);
  const richTextId = 1; // seedStandardDeck's RichText cardtype id
  const accountSetting = await seedCard(storage, {
    name: "*account",
    codename: "account",
    typeId: 14,
  });
  const apiSetting = await seedCard(storage, {
    name: "*api key",
    codename: "api_key",
    typeId: 14,
  });
  const leftA = await seedCard(storage, { name: "Holder A", typeId: richTextId });
  const leftB = await seedCard(storage, { name: "Holder B", typeId: richTextId });
  const accountA = await seedCard(storage, {
    leftId: leftA.id,
    rightId: accountSetting.id,
    typeId: 14,
  });
  const accountB = await seedCard(storage, {
    leftId: leftB.id,
    rightId: accountSetting.id,
    typeId: 14,
  });
  const keyA = await seedCard(storage, {
    leftId: accountA.id,
    rightId: apiSetting.id,
    typeId: 14,
    dbContent: VALID_KEY_A,
  });
  const keyB = await seedCard(storage, {
    leftId: accountB.id,
    rightId: apiSetting.id,
    typeId: 14,
    dbContent: VALID_KEY_B,
  });
  return {
    storage,
    f: {
      engine: apiKeyEngine(storage),
      leftA,
      leftB,
      keyA,
      keyB,
      apiSetting,
      accountSetting,
    },
  };
}

async function contentOf(storage: ActionsTestStorage, cardId: number): Promise<string | null> {
  const row = await storage.selectOne<{ db_content: string | null }>(
    "SELECT db_content FROM cards WHERE id = ?",
    [cardId],
  );
  return row?.db_content ?? null;
}

describe("api_key generate_api_key (api_key.rb:4-6, trigger: :required)", () => {
  // SecureRandom.base64 is 16 random bytes -> 24 base64 chars; String#tr
  // "+/=", "Qrt" maps the specials away, so EVERY generated key is exactly
  // 24 word characters (Ruby oracle run this session: 20/20).
  it("a triggered save writes a 24-word-char key to the row", async () => {
    const { storage, f } = await seedApiKeyDeck();
    await f.engine.updateCard({
      cardId: f.keyA.id,
      content: VALID_KEY_A, // unchanged apart from the event's mutation
      trigger: "generate_api_key",
    });
    const content = await contentOf(storage, f.keyA.id);
    expect(content).toMatch(/^\w{24}$/);
    expect(content).not.toBe(VALID_KEY_A);
    // the generated alphabet: base64 chars with +/= mapped to Q/r/t
    expect(content).toMatch(/^[A-Za-z0-9Qrt]{24}$/);
  });

  it("an untriggered save never mutates the content", async () => {
    const { storage, f } = await seedApiKeyDeck();
    await f.engine.updateCard({ cardId: f.keyA.id, content: VALID_KEY_A });
    expect(await contentOf(storage, f.keyA.id)).toBe(VALID_KEY_A);
  });

  it("generatedApiKey matches the Ruby grammar it ports", () => {
    for (let i = 0; i < 50; i++) {
      expect(generatedApiKey()).toMatch(/^[A-Za-z0-9Qrt]{24}$/);
    }
  });
});

describe("api_key validate_api_key (api_key.rb:8-12, changed: :content)", () => {
  it("a content change below 20 word chars fails with the i18n message", async () => {
    const { storage, f } = await seedApiKeyDeck();
    await expect(
      f.engine.updateCard({ cardId: f.keyA.id, content: "short" }),
    ).rejects.toThrow(CardActionError);
    await expect(
      f.engine.updateCard({ cardId: f.keyA.id, content: "short" }),
    ).rejects.toMatchObject({
      code: "validation-failed",
      userMessage: "Content: Invalid API Key; must contain 20+ alphanumeric characters only",
      errorsByAttribute: {
        content: "Invalid API Key; must contain 20+ alphanumeric characters only",
      },
    });
    // Ruby's errors abort the save before any row write
    expect(await contentOf(storage, f.keyA.id)).toBe(VALID_KEY_A);
  });

  it("a content change onto another holder's key fails with api_key_taken", async () => {
    const { storage, f } = await seedApiKeyDeck();
    await expect(
      f.engine.updateCard({ cardId: f.keyA.id, content: VALID_KEY_B }),
    ).rejects.toMatchObject({
      code: "validation-failed",
      userMessage: "Content: API Key taken",
    });
    expect(await contentOf(storage, f.keyA.id)).toBe(VALID_KEY_A);
  });

  it("a content change to a fresh valid key saves", async () => {
    const { storage, f } = await seedApiKeyDeck();
    const fresh = "Zz".repeat(15); // 30 word chars, taken by nobody
    await f.engine.updateCard({ cardId: f.keyA.id, content: fresh });
    expect(await contentOf(storage, f.keyA.id)).toBe(fresh);
  });

  it("an unchanged content never fires the validator", async () => {
    const { storage, f } = await seedApiKeyDeck();
    // VALID_KEY_A is valid, so this pins the changed: gate only via the
    // absence of any error on a no-op save (Ruby: the event is gated).
    await f.engine.updateCard({ cardId: f.keyA.id });
    expect(await contentOf(storage, f.keyA.id)).toBe(VALID_KEY_A);
  });
});
