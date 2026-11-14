// The anonymous-create permission arm (the captcha guard's missing
// reach): the create permission chain has NO signed-in clause — an
// anonymous session's Auth.as_id IS the Anonymous card, and ok_to_create?
// runs for it exactly as for any other actor: permit(:create) ->
// permitted? -> Auth.as_card.among? who_can(:create), where among? passes
// when the rule's item ids include AnyoneID or the actor's own id
// (Anonymous's parties are just itself — all_enabled_roles is []).
//
// The arm is not hypothetical: a real deck's history carries hundreds of
// cards whose creator is the anonymous codename card, many of type Signup —
// whose "<signup name>+*type+*create" rule grants Anyone. Until this arm,
// the engine's write path was signed-in-only and the captcha guard's
// !Auth.signed_in? arm was seam-proven but unreachable through the public
// engine.
//
// Deck layout (mirrors that signup arm; ids arbitrary):
//    1 *all      codename all    typeId 2 (Set)
//    2 Set       codename set
//    4 *create   codename create
//    6 Anyone    codename anyone        - the rule party AnyoneID
//    7 Editor                           - a party Anonymous is NOT in
//    8 *type     codename type
//   10 *all+*create  left 1 right 4 [[Editor]]   - fallback: members only
//   11 Anonymous codename anonymous      - the acting card (Auth.as_card)
//   12 Signup                           - the signup type card
//   13 Signup+*type left 12 right 8 typeId 2 (Set)
//   14 Signup+*type+*create left 13 right 4 [[Anyone]]  - the granting rule
//   15 *captcha codename captcha         - the guard's codename check

import { describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  seedCard,
  type ActionsTestStorage,
} from "./actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import type { CardActionError } from "../../../src/card/actions/types.js";
import { ModLoader } from "../../../src/card/mod-loader.js";
import cardModRecaptcha, {
  recaptchaModEventPredicates,
} from "../../../src/card/mod-loader/mods/card-mod-recaptcha.js";
import type { ModEventRuntime } from "../../../src/card/mod-loader/mod-event-dispatch.js";

const SET_TYPE_ID = 2;

/** The siteverify stub: records the query and returns the canned body. */
function stubVerify(body: unknown): {
  verify: (url: string, query: { secret: string; response: string }) => Promise<string>;
  calls: Array<{ url: string; query: { secret: string; response: string } }>;
} {
  const calls: Array<{ url: string; query: { secret: string; response: string } }> = [];
  return {
    calls,
    verify: async (url, query) => {
      calls.push({ url, query });
      return JSON.stringify(body);
    },
  };
}

async function seedReference(
  storage: ActionsTestStorage,
  refererId: number,
  refereeId: number,
  refereeKey: string,
): Promise<void> {
  await storage.driver.query(
    `INSERT INTO card_references (referer_id, referee_key, referee_id, ref_type, is_present)
     VALUES (?, ?, ?, 'L', NULL)`,
    [refererId, refereeKey, refereeId],
  );
}

/** The deck of the module doc. `signupRuleParty` is who
 *  Signup+*type+*create grants — Anyone for the open-signup arms,
 *  Editor for the closed-signup deny arms. */
async function seedSignupDeck(
  signupRuleParty: { id: number; key: string },
): Promise<ActionsTestStorage> {
  const s = await createActionsTestStorage();
  await seedCard(s, { id: 1, name: "*all", codename: "all", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 2, name: "Set", codename: "set" });
  await seedCard(s, { id: 4, name: "*create", codename: "create" });
  await seedCard(s, { id: 6, name: "Anyone", codename: "anyone" });
  await seedCard(s, { id: 7, name: "Editor" });
  await seedCard(s, { id: 8, name: "*type", codename: "type" });
  await seedCard(s, { id: 10, leftId: 1, rightId: 4, dbContent: "[[Editor]]" });
  await seedReference(s, 10, 7, "editor");
  await seedCard(s, { id: 11, name: "Anonymous User", codename: "anonymous" });
  await seedCard(s, { id: 12, name: "Signup", typeId: SET_TYPE_ID + 1 });
  await seedCard(s, { id: 13, leftId: 12, rightId: 8, typeId: SET_TYPE_ID });
  await seedCard(s, { id: 14, leftId: 13, rightId: 4, dbContent: `[[${signupRuleParty.key}]]` });
  await seedReference(s, 14, signupRuleParty.id, signupRuleParty.key);
  return s;
}

const ANYONE = { id: 6, key: "anyone" };
const EDITOR = { id: 7, key: "editor" };

/** Anonymous-session engine (actor null — the signed-out request), with
 *  optional recaptcha config + the mod event runtime. */
function anonEngine(
  s: ActionsTestStorage,
  opts: {
    recaptcha?: ConstructorParameters<typeof CardActionEngine>[1]["recaptcha"];
  } = {},
): CardActionEngine {
  const runtime: ModEventRuntime = {
    registry: (() => {
      const loader = new ModLoader([{ manifest: cardModRecaptcha }]);
      loader.resolveOrder({ gemMods: ["recaptcha"] });
      loader.load();
      return loader.eventRegistry();
    })(),
    predicates: recaptchaModEventPredicates,
  };
  return new CardActionEngine(s.engine, {
    actor: null, // the signed-out session: Auth.current_id -> AnonymousID
    ipAddress: "192.0.2.7",
    recaptcha: opts.recaptcha,
    modEvents: runtime,
  });
}

async function asError(p: Promise<unknown>): Promise<CardActionError> {
  return (await p.then(
    () => undefined,
    (e: CardActionError) => e,
  )) as CardActionError;
}

describe("anonymous create rides the create RULE check (no signed-in clause)", () => {
  it("allows the open-signup arm (Signup+*type+*create -> Anyone) and records the act under the Anonymous card", async () => {
    const s = await seedSignupDeck(ANYONE);
    const engine = anonEngine(s);
    const result = await engine.createCard({ name: "Sign Me Up", typeId: 12, content: "hi" });
    expect(result.cardId).toBeGreaterThan(0);
    const card = await s.selectOne<{ creator_id: number }>(
      "SELECT creator_id FROM cards WHERE id = ?",
      [result.cardId],
    );
    // set_stamper: creator_id = updater_id = Auth.as_id (write-path.ts:229)
    expect(card?.creator_id).toBe(11);
    const act = await s.selectOne<{ actor_id: number }>(
      "SELECT actor_id FROM card_acts WHERE card_id = ?",
      [result.cardId],
    );
    // assign_actor: the act's actor_id IS the Anonymous card (a real deck's
    // anonymous-created rows are exactly this shape)
    expect(act?.actor_id).toBe(11);
  });

  it("denies with permission-denied when the applicable rule grants only a role Anonymous lacks (ok_to_create? :121)", async () => {
    const s = await seedSignupDeck(EDITOR);
    const engine = anonEngine(s);
    const err = await asError(engine.createCard({ name: "Sign Me Up", typeId: 12 }));
    expect(err.code).toBe("permission-denied");
    expect(err.message).toContain("may not create card");
    expect(await s.count("cards")).toBe(11); // nothing written
    expect(await s.count("card_acts")).toBe(0);
  });

  it("keys the session by ID, not by name: an actor NAMED *anonymous with an account id acts as THAT account", async () => {
    // Identity is the ID, not the name: the earlier pin here asserted the
    // name-keyed behavior — any actor named "*anonymous" wrote as the
    // Anonymous card. The engine's identity is the id (`@as_id =
    // Card.id given_user`, auth/proxy.rb:11; signed_in? = current_id !=
    // AnonymousID, auth/current.rb:43-47); only the real Anonymous card
    // (id 11) is the anonymous session.
    const s = await seedSignupDeck(ANYONE);
    const engine = new CardActionEngine(s.engine, {
      actor: { id: 9, name: "*anonymous" },
      ipAddress: "192.0.2.7",
    });
    const result = await engine.createCard({ name: "Named Anon Signup", typeId: 12 });
    const card = await s.selectOne<{ creator_id: number }>(
      "SELECT creator_id FROM cards WHERE id = ?",
      [result.cardId],
    );
    expect(card?.creator_id).toBe(9); // its own id, never the Anonymous card (11)
  });

  it("keeps the legacy anonymous-actor rejection when the deck cannot form the Anonymous card (fragment seed)", async () => {
    const s = await createActionsTestStorage();
    // no codename-anonymous row seeded: Ruby could not form
    // Card[AnonymousID] here either (auth/current.rb:8 reads the constant)
    const engine = anonEngine(s);
    const err = await asError(engine.createCard({ name: "Nope" }));
    expect(err.code).toBe("anonymous-actor");
    expect(await s.count("cards")).toBe(0);
  });
});

describe("anonymous create through the captcha guard, end-to-end at the engine seam", () => {
  it("a failed verify refuses the save (event :recaptcha, recaptcha.rb:50-55) and writes nothing", async () => {
    const s = await seedSignupDeck(ANYONE);
    await seedCard(s, { id: 15, name: "*captcha", codename: "captcha" });
    const stub = stubVerify({ success: false });
    const engine = anonEngine(s, {
      recaptcha: {
        siteKey: "k",
        secretKey: "s",
        captchaRuleContent: "1", // Card::Rule.toggle("1") — rule.rb:11-13
        verify: stub.verify,
      },
    });
    const err = await asError(
      engine.createCard({ name: "Guarded Signup", typeId: 12, recaptchaToken: "tok-1" }),
    );
    expect(err.code).toBe("recaptcha");
    expect(err.message).toBe("Looks like you are not a human");
    // the siteverify query rode the transport shape recaptcha.rb:41-44 defines
    expect(stub.calls[0]?.query).toEqual({ secret: "s", response: "tok-1" });
    // the guard was ON: !signed_in? — the arm this suite opens (the walk
    // rejects with the refusal, so the stage report does not record it)
    // the refusal is whole: no card, no act
    expect(await s.count("cards")).toBe(12);
    expect(await s.count("card_acts")).toBe(0);
  });

  it("captcha_used! skips the verify for the same engine's second card (recaptcha.rb:52 + validate_recaptcha? :71)", async () => {
    const s = await seedSignupDeck(ANYONE);
    await seedCard(s, { id: 15, name: "*captcha", codename: "captcha" });
    const stub = stubVerify({ success: false });
    const engine = anonEngine(s, {
      recaptcha: { siteKey: "k", secretKey: "s", captchaRuleContent: "1", verify: stub.verify },
    });
    await asError(engine.createCard({ name: "First Try", typeId: 12, recaptchaToken: "tok-a" }));
    expect(stub.calls).toHaveLength(1);
    // same engine instance = same request lifetime: the used-flag skips
    // the event entirely, so the second save completes unguarded
    const second = await engine.createCard({ name: "Second Try", typeId: 12 });
    expect(second.cardId).toBeGreaterThan(0);
    expect(stub.calls).toHaveLength(1); // no second verify
  });

  it("a human verdict (success + score + action match) lets the anonymous signup through", async () => {
    const s = await seedSignupDeck(ANYONE);
    await seedCard(s, { id: 15, name: "*captcha", codename: "captcha" });
    const stub = stubVerify({ success: true, score: 0.9, action: "create" });
    const engine = anonEngine(s, {
      recaptcha: { siteKey: "k", secretKey: "s", captchaRuleContent: "1", verify: stub.verify },
    });
    const result = await engine.createCard({
      name: "Human Signup",
      typeId: 12,
      recaptchaToken: "tok-ok",
    });
    expect(result.cardId).toBeGreaterThan(0);
    expect(stub.calls[0]?.query.response).toBe("tok-ok");
    const card = await s.selectOne<{ creator_id: number }>(
      "SELECT creator_id FROM cards WHERE id = ?",
      [result.cardId],
    );
    expect(card?.creator_id).toBe(11);
  });

  it("the grecaptcha-undefined token adds the v3-config error without a verify call (recaptcha.rb:59-60)", async () => {
    const s = await seedSignupDeck(ANYONE);
    await seedCard(s, { id: 15, name: "*captcha", codename: "captcha" });
    const stub = stubVerify({ success: true });
    const engine = anonEngine(s, {
      recaptcha: { siteKey: "k", secretKey: "s", captchaRuleContent: "1", verify: stub.verify },
    });
    const err = await asError(
      engine.createCard({
        name: "Bad Config Signup",
        typeId: 12,
        recaptchaToken: "grecaptcha-undefined",
      }),
    );
    expect(err.code).toBe("recaptcha");
    expect(err.message).toBe("needs correct v3 configuration");
    expect(stub.calls).toHaveLength(0);
    expect(await s.count("card_acts")).toBe(0);
  });

  it("permission-denied outranks the captcha event (the engine's gate runs before the validate-stage walk)", async () => {
    const s = await seedSignupDeck(EDITOR); // closed signup
    await seedCard(s, { id: 15, name: "*captcha", codename: "captcha" });
    const stub = stubVerify({ success: false });
    const engine = anonEngine(s, {
      recaptcha: { siteKey: "k", secretKey: "s", captchaRuleContent: "1", verify: stub.verify },
    });
    const err = await asError(
      engine.createCard({ name: "Closed Signup", typeId: 12, recaptchaToken: "tok" }),
    );
    expect(err.code).toBe("permission-denied");
    expect(stub.calls).toHaveLength(0); // never reached the validate stage
  });
});
