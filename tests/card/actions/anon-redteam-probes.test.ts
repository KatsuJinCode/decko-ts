// RED-TEAM PROBES — attack suite for the anonymous write surface. Every
// test here is an ATTEMPTED BYPASS: the test names state the attack;
// passing assertions document the ENGINE's actual answer (a bypass test
// that SUCCEEDS is a finding, not a green pin).
//
// Two arms — the draft-seam captcha skip and the anonymous canWrite skip —
// cover behaviour that arrived broken and was fixed: their names still
// state the attack, their assertions are flipped to the CONTROL outcome
// and now pin the fixed engine (see the FIXED comments in those tests).

import { describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  seedCard,
  type ActionsTestStorage,
} from "./actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import {
  ANONYMOUS_ACTOR_NAME,
  type Actor,
  type CardActionError,
} from "../../../src/card/actions/types.js";
import { ModLoader } from "../../../src/card/mod-loader.js";
import cardModRecaptcha, {
  recaptchaModEventPredicates,
} from "../../../src/card/mod-loader/mods/card-mod-recaptcha.js";
import type { ModEventRuntime } from "../../../src/card/mod-loader/mod-event-dispatch.js";

const SET_TYPE_ID = 2;

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

const ANON_CARD_ID = 11;

/** Codename + structure skeleton shared by every probe deck.
 *  `defaultTypeId` names the card the *all+*default rule points at. */
async function seedSkeleton(s: ActionsTestStorage, defaultTypeId: number): Promise<void> {
  await seedCard(s, { id: 1, name: "*all", codename: "all", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 2, name: "Set", codename: "set" });
  await seedCard(s, { id: 4, name: "*create", codename: "create" });
  await seedCard(s, { id: 5, name: "*update", codename: "update" });
  await seedCard(s, { id: 16, name: "*delete", codename: "delete" });
  await seedCard(s, { id: 6, name: "Anyone", codename: "anyone" });
  await seedCard(s, { id: 7, name: "Editor" });
  await seedCard(s, { id: 8, name: "*type", codename: "type" });
  await seedCard(s, { id: 17, name: "*default", codename: "default" });
  await seedCard(s, { id: 11, name: "Anonymous User", codename: "anonymous" });
  await seedCard(s, { id: 42, name: "Rich Text", typeId: 3 });
  await seedCard(s, { id: 33, name: "*all+*default", leftId: 1, rightId: 17, typeId: defaultTypeId });
}

/** Deck where the DEFAULT type (Basic) is create-protected (Editor-only)
 *  but *all+*create grants Anyone and Signup-type creates grant Anyone —
 *  the recorded corpus's shape (6580 -> Anyone over tighter siblings). */
async function seedBypassDeck(): Promise<ActionsTestStorage> {
  const s = await createActionsTestStorage();
  await seedSkeleton(s, 30);
  await seedCard(s, { id: 30, name: "Basic", typeId: 3 });
  await seedCard(s, { id: 10, name: "*all+*create", leftId: 1, rightId: 4, typeId: SET_TYPE_ID, dbContent: "[[Anyone]]" });
  await seedReference(s, 10, 6, "anyone");
  await seedCard(s, { id: 12, name: "Signup", typeId: 3 });
  await seedCard(s, { id: 13, name: "Signup+*type", leftId: 12, rightId: 8, typeId: SET_TYPE_ID });
  await seedCard(s, { id: 14, name: "Signup+*type+*create", leftId: 13, rightId: 4, dbContent: "[[Anyone]]" });
  await seedReference(s, 14, 6, "anyone");
  // the protection: Basic (the default type) is Editor-only on create
  await seedCard(s, { id: 31, name: "Basic+*type", leftId: 30, rightId: 8, typeId: SET_TYPE_ID });
  await seedCard(s, { id: 32, name: "Basic+*type+*create", leftId: 31, rightId: 4, dbContent: "[[Editor]]" });
  await seedReference(s, 32, 7, "editor");
  return s;
}

/** Deck for the depth-horizon probe: *all+*create -> Anyone, *star+*create
 *  -> Editor (protects the *-named LEFTMOST part), no type-scoped rules. */
async function seedDepthDeck(): Promise<ActionsTestStorage> {
  const s = await createActionsTestStorage();
  await seedSkeleton(s, 42);
  await seedCard(s, { id: 18, name: "*star", codename: "star", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 10, name: "*all+*create", leftId: 1, rightId: 4, typeId: SET_TYPE_ID, dbContent: "[[Anyone]]" });
  await seedReference(s, 10, 6, "anyone");
  await seedCard(s, { id: 41, name: "*star+*create", leftId: 18, rightId: 4, dbContent: "[[Editor]]" });
  await seedReference(s, 41, 7, "editor");
  return s;
}

/** Rule-less deck: codenames only, ZERO create/update/delete rule cards. */
async function seedRulelessDeck(): Promise<ActionsTestStorage> {
  const s = await createActionsTestStorage();
  await seedSkeleton(s, 42);
  await seedCard(s, { id: 50, name: "Free Seed", typeId: 42 });
  return s;
}

/** Partial-seed deck: exactly ONE update rule, scoped to an unrelated
 *  type; nothing covers the victim card. */
async function seedPartialDeck(): Promise<ActionsTestStorage> {
  const s = await createActionsTestStorage();
  await seedSkeleton(s, 42);
  await seedCard(s, { id: 50, name: "Victim", typeId: 42 });
  await seedCard(s, { id: 60, name: "Unrelated", typeId: 3 });
  await seedCard(s, { id: 61, name: "Unrelated+*type", leftId: 60, rightId: 8, typeId: SET_TYPE_ID });
  await seedCard(s, { id: 62, name: "Unrelated+*type+*update", leftId: 61, rightId: 5, dbContent: "[[Editor]]" });
  await seedReference(s, 62, 7, "editor");
  return s;
}

/** Junction-rename deck: the update verdict reads the ASSIGNED name's
 *  anchors (Ruby: name= + reset_patterns rebuild rule_lookup_keys before
 *  the validate-stage check — name/all.rb:21-28,
 *  assign_attributes.rb:63-68, pattern/all.rb:66-68). Right A carries a
 *  looser *right+*update (Anyone) than Right B (Editor); Right C is
 *  Anyone-ruled for the rename-ALLOW positive arm. */
async function seedJunctionRenameDeck(): Promise<ActionsTestStorage> {
  const s = await createActionsTestStorage();
  await seedSkeleton(s, 42);
  await seedCard(s, { id: 54, name: "*right", codename: "right", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 10, name: "*all+*update", leftId: 1, rightId: 5, typeId: SET_TYPE_ID, dbContent: "[[Editor]]" });
  await seedReference(s, 10, 7, "editor");
  await seedCard(s, { id: 60, name: "Right A", typeId: 42 });
  await seedCard(s, { id: 61, name: "Right B", typeId: 42 });
  await seedCard(s, { id: 75, name: "Right C", typeId: 42 });
  await seedCard(s, { id: 62, name: "Holder", typeId: 42 });
  await seedCard(s, { id: 70, name: null, key: null, leftId: 62, rightId: 60, typeId: 42 });
  await seedCard(s, { id: 71, name: "Right A+*right", leftId: 60, rightId: 54, typeId: SET_TYPE_ID });
  await seedCard(s, { id: 72, name: "Right A+*right+*update", leftId: 71, rightId: 5, dbContent: "[[Anyone]]" });
  await seedReference(s, 72, 6, "anyone");
  await seedCard(s, { id: 73, name: "Right B+*right", leftId: 61, rightId: 54, typeId: SET_TYPE_ID });
  await seedCard(s, { id: 74, name: "Right B+*right+*update", leftId: 73, rightId: 5, dbContent: "[[Editor]]" });
  await seedReference(s, 74, 7, "editor");
  await seedCard(s, { id: 76, name: "Right C+*right", leftId: 75, rightId: 54, typeId: SET_TYPE_ID });
  await seedCard(s, { id: 77, name: "Right C+*right+*update", leftId: 76, rightId: 5, dbContent: "[[Anyone]]" });
  await seedReference(s, 77, 6, "anyone");
  return s;
}

/** Signup deck + a seeded existing page, for the captcha-draft probes.
 *  Carries the *all+*update [[Anyone]] fallback so the update verdict
 *  ALLOWS and the save reaches the captcha guard (a deck without it now
 *  denies at ok_to_update? before :validate — the deny-on-empty fix —
 *  leaving the guard untestable; a real deck has the fallback). */
async function seedDraftDeck(): Promise<ActionsTestStorage> {
  const s = await createActionsTestStorage();
  await seedSkeleton(s, 42);
  await seedCard(s, { id: 15, name: "*captcha", codename: "captcha" });
  await seedCard(s, { id: 12, name: "Signup", typeId: 3 });
  await seedCard(s, { id: 13, name: "Signup+*type", leftId: 12, rightId: 8, typeId: SET_TYPE_ID });
  await seedCard(s, { id: 14, name: "Signup+*type+*create", leftId: 13, rightId: 4, dbContent: "[[Anyone]]" });
  await seedReference(s, 14, 6, "anyone");
  await seedCard(s, { id: 21, name: "*all+*update", leftId: 1, rightId: 5, typeId: SET_TYPE_ID, dbContent: "[[Anyone]]" });
  await seedReference(s, 21, 6, "anyone");
  await seedCard(s, { id: 20, name: "Journal Page", typeId: 42, dbContent: "original" });
  return s;
}

function anonEngine(s: ActionsTestStorage): CardActionEngine {
  return new CardActionEngine(s.engine, { actor: null, ipAddress: "192.0.2.7" });
}

function stubVerify(body: unknown): {
  verify: (url: string, query: { secret: string; response: string }) => Promise<string>;
  calls: unknown[];
} {
  const calls: unknown[] = [];
  return {
    calls,
    verify: async (url, query) => {
      calls.push({ url, query });
      return JSON.stringify(body);
    },
  };
}

function recaptchaEngine(s: ActionsTestStorage, verify: (url: string, query: { secret: string; response: string }) => Promise<string>): CardActionEngine {
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
    actor: null,
    ipAddress: "192.0.2.7",
    recaptcha: { siteKey: "k", secretKey: "s", captchaRuleContent: "1", verify },
    modEvents: runtime,
  });
}

async function asError(p: Promise<unknown>): Promise<CardActionError | undefined> {
  return (await p.then(
    () => undefined,
    (e: CardActionError) => e,
  )) as CardActionError | undefined;
}

describe("anonred: side-part create checks drop *type+*create candidates (CLOSED: sides carry their would-be type)", () => {
  it("CONTROL: direct create of a default-type (Basic) card is denied by Basic+*type+*create (Editor)", async () => {
    const s = await seedBypassDeck();
    const engine = anonEngine(s);
    const err = await asError(engine.createCard({ name: "New Person" }));
    expect(err?.code).toBe("permission-denied");
    expect(await s.count("cards")).toBe(19); // nothing written
  });

  it("BYPASS (now denied): a Signup-typed junction create hits the side-part *type+*create check", async () => {
    const s = await seedBypassDeck();
    const engine = anonEngine(s);
    const err = await asError(engine.createCard({ name: "Junk Pad+New Person", typeId: 12 }));
    // the missing side "New Person" is judged as a virtual new card WITH its
    // would-be type — the deck-default Basic (resolveTypeId, the same call
    // createInWriter makes when creating the side) — so Basic+*type+*create
    // (Editor) denies it exactly like the CONTROL direct create
    expect(err?.code).toBe("permission-denied");
    // nothing written: neither the protected side nor its trunk
    expect(await s.count("cards")).toBe(19);
    const side = await s.selectOne<{ id: number }>(
      "SELECT id FROM cards WHERE `key` = ?",
      ["new_person"],
    );
    expect(side).toBeUndefined();
    const left = await s.selectOne<{ id: number }>(
      "SELECT id FROM cards WHERE `key` = ?",
      ["junk_pad"],
    );
    expect(left).toBeUndefined();
  });
});

describe("anonred: the depth-4 horizon in createSidesAllowed skips the leftmost parts (CLOSED: unbounded recursion)", () => {
  it("CONTROL: shallow junction with a *star-protected left part is denied", async () => {
    const s = await seedDepthDeck();
    const engine = anonEngine(s);
    const err = await asError(engine.createCard({ name: "*Lock+Bb Part" }));
    expect(err?.code).toBe("permission-denied");
  });

  it("BYPASS (now denied): the same protected part as the leftmost of six is verdict-checked too", async () => {
    const s = await seedDepthDeck();
    const engine = anonEngine(s);
    const err = await asError(
      engine.createCard({
        name: "*Lock+Bb Part+Cc Part+Dd Part+Ee Part+Ff Part",
      }),
    );
    // the depth horizon is gone (Ruby's ok_to_create_side recursion is
    // unbounded; part names strictly shrink): the *Lock part is checked
    // through the left trunk and *star+*create (Editor) denies
    expect(err?.code).toBe("permission-denied");
    expect(await s.count("cards")).toBe(15); // nothing written
    const lock = await s.selectOne<{ id: number }>(
      "SELECT id FROM cards WHERE `key` = ?",
      ["*lock"],
    );
    expect(lock).toBeUndefined();
    // no side of the deep name exists either
    for (const key of ["bb_part", "cc_part", "dd_part", "ee_part", "ff_part"]) {
      const row = await s.selectOne<{ id: number }>(
        "SELECT id FROM cards WHERE `key` = ?",
        [key],
      );
      expect(row).toBeUndefined();
    }
  });
});

describe("anonred: the rule-less / partial-seed verdict now DENIES (verdict-semantics lane)", () => {
  // MEDIUM-2 fix (2026-10-01): these two arms were BYPASSes at ba00146 —
  // the port allowed on `undefined` (no applicable rule -> allow). Ruby
  // fail-closes: permitted? -> who_can -> among? on [] -> false
  // (permissions.rb:100-118, :47-49; a missing rule raises,
  // :77-85). Both arms flipped to the CONTROL outcome by the fix; they
  // now double as the standing deny-on-empty pins.
  it("CONTROL: deck with ZERO create/update/delete rules denies anonymous create+update+delete", async () => {
    const s = await seedRulelessDeck();
    const engine = anonEngine(s);
    const createErr = await asError(engine.createCard({ name: "Blank Check", content: "mine" }));
    expect(createErr?.code).toBe("permission-denied");
    const updateErr = await asError(engine.updateCard({ cardId: 50, content: "hijacked" }));
    expect(updateErr?.code).toBe("permission-denied");
    const deleteErr = await asError(engine.deleteCard({ cardId: 50 }));
    expect(deleteErr?.code).toBe("permission-denied");
    // nothing written: no new card (skeleton 12 + Free Seed), the seed row
    // untouched, zero acts
    expect(await s.count("cards")).toBe(13);
    const seed = await s.selectOne<{ db_content: string | null; trash: number }>(
      "SELECT db_content, trash FROM cards WHERE id = 50",
    );
    expect(seed?.db_content).toBeNull();
    expect(seed?.trash).toBe(0);
    expect(await s.count("card_acts")).toBe(0);
  });

  it("CONTROL: partial seed — anonymous denied on the card an unrelated type's rule does not cover", async () => {
    const s = await seedPartialDeck();
    const engine = anonEngine(s);
    const updateErr = await asError(engine.updateCard({ cardId: 50, content: "uncovered" }));
    expect(updateErr?.code).toBe("permission-denied");
    const seed = await s.selectOne<{ db_content: string; updater_id: number }>(
      "SELECT db_content, updater_id FROM cards WHERE id = 50",
    );
    expect(seed?.db_content).toBeNull(); // untouched
    expect(await s.count("card_acts")).toBe(0);
  });
});

describe("anonred: name-changing updates are judged under the ASSIGNED name's anchors (verdict-semantics lane)", () => {
  // MEDIUM-4 fix (2026-10-01): the rename arm below was a BYPASS at
  // ba00146 — the permission walk read the OLD row's anchors, so a
  // one-shot rename smuggled a card from an Anyone-ruled anchor into an
  // Editor-locked one. Ruby rebuilds the rule lookup keys from the
  // ASSIGNED name before the validate-stage check (name= +
  // assign_side_ids, name/all.rb:21-28/:76-84; refresh_set_modules ->
  // reset_patterns, assign_attributes.rb:63-68; patterns from the card,
  // pattern/all.rb:22-29/:66-68; event :check_permissions at :validate,
  // permissions.rb:22-26) — the fix reads the assigned anchors and both
  // arms below are CONTROLs now.
  it("CONTROL: junction rename into an Editor-locked anchor is denied by the NEW anchor's rule", async () => {
    const s = await seedJunctionRenameDeck();
    const engine = anonEngine(s);
    // CONTROL first: anonymous cannot update a card LIVING under Right B
    await seedCard(s, { id: 63, name: "Holder Two", typeId: 42 });
    await seedCard(s, { id: 80, name: null, key: null, leftId: 63, rightId: 61, typeId: 42 });
    const denied = await asError(engine.updateCard({ cardId: 80, content: "x" }));
    expect(denied?.code).toBe("permission-denied"); // Right B+*right+*update -> Editor
    // the rename: judged under the ASSIGNED anchor (Right B -> Editor),
    // not the old one (Right A -> Anyone) — denied, nothing moved
    const renameErr = await asError(engine.updateCard({ cardId: 70, name: "Holder+Right B" }));
    expect(renameErr?.code).toBe("permission-denied");
    const row = await s.selectOne<{ left_id: number; right_id: number; updater_id: number }>(
      "SELECT left_id, right_id, updater_id FROM cards WHERE id = 70",
    );
    expect(row?.right_id).toBe(60); // still under Right A
    expect(row?.left_id).toBe(62);
    expect(await s.count("card_acts")).toBe(0); // the one-shot rename wrote nothing
    // post-rename reality (unchanged by the fix): updates under Right A stay allowed
    const stillAllowed = await engine.updateCard({ cardId: 70, content: "fine here" });
    expect(stillAllowed?.cardId).toBe(70);
  });

  it("CONTROL (allow direction): rename into an Anyone-ruled anchor is allowed by the NEW anchor's rule", async () => {
    // the mirror proof that the verdict reads the ASSIGNED anchor and not
    // a blanket deny: the card lives under Right B (Editor-only OLD
    // anchor — the same save judged by the old row would be denied); the
    // assigned anchor Right C grants Anyone, so the rename lands.
    const s = await seedJunctionRenameDeck();
    const engine = anonEngine(s);
    await seedCard(s, { id: 63, name: "Holder Two", typeId: 42 });
    await seedCard(s, { id: 80, name: null, key: null, leftId: 63, rightId: 61, typeId: 42 });
    const result = await engine.updateCard({ cardId: 80, name: "Holder Two+Right C" });
    expect(result?.cardId).toBe(80);
    const row = await s.selectOne<{ right_id: number; updater_id: number }>(
      "SELECT right_id, updater_id FROM cards WHERE id = 80",
    );
    expect(row?.right_id).toBe(75); // now under Right C
    expect(row?.updater_id).toBe(ANON_CARD_ID);
  });
});

describe("anonred: the captcha guard never consults the draft seam", () => {
  it("BYPASS: draft:true records attacker content with ZERO captcha consult", async () => {
    // FIXED (lane-guardfix): save_draft is a :store-stage event in Ruby
    // (mod/core/set/all/content.rb:7-10), so the whole :validate stage —
    // event :recaptcha included (recaptcha.rb:50-55) — has already run
    // when the draft aborts. The draft seam now runs the same validate
    // walk as the full save. This arm EXECUTED the attack at 8f50230
    // (draft stored, zero siteverify calls); its assertions are flipped to
    // the CONTROL outcome and now pin the fixed engine: the guarded draft
    // is refused whole.
    const s = await seedDraftDeck();
    const stub = stubVerify({ success: false });
    const engine = recaptchaEngine(s, stub.verify);
    const err = await asError(engine.updateCard({ cardId: 20, content: "spam draft", draft: true }));
    expect(err?.code).toBe("recaptcha");
    expect(stub.calls).toHaveLength(1); // the guard was consulted
    expect(await s.count("card_acts")).toBe(0); // the refusal persists nothing
    const draftAction = await s.selectOne<{ id: number; draft: number }>(
      "SELECT id, draft FROM card_actions WHERE card_id = 20 AND draft = 1",
    );
    expect(draftAction).toBeUndefined(); // no draft action survived
    const change = await s.selectOne<{ value: string }>(
      "SELECT c.value FROM card_changes c JOIN card_actions a ON a.id = c.card_action_id WHERE a.card_id = 20 AND a.draft = 1 AND c.field = 2",
    );
    expect(change).toBeUndefined(); // no attacker content anywhere
    const row = await s.selectOne<{ db_content: string | null }>(
      "SELECT db_content FROM cards WHERE id = 20",
    );
    expect(row?.db_content).toBe("original"); // the row is untouched
  });

  it("CONTROL: the same guarded engine refuses a NON-draft update (the guard is live on this actor)", async () => {
    const s = await seedDraftDeck();
    const stub = stubVerify({ success: false });
    const engine = recaptchaEngine(s, stub.verify);
    const err = await asError(engine.updateCard({ cardId: 20, content: "real edit", recaptchaToken: "tok" }));
    expect(err?.code).toBe("recaptcha");
    expect(stub.calls).toHaveLength(1);
    expect(await s.count("card_acts")).toBe(0);
  });
});

describe("anonred: fragment-seed + host hook", () => {
  it("fragment-seed deck rejects the DRAFT seam too (anonymous-actor before any row)", async () => {
    const s = await createActionsTestStorage(); // no codename rows at all
    const engine = anonEngine(s);
    const err = await asError(engine.updateCard({ cardId: 1, content: "x", draft: true }));
    expect(err?.code).toBe("anonymous-actor");
    expect(await s.count("cards")).toBe(0);
  });

  it("BYPASS: a canWrite hook that refuses EVERYONE is never consulted for the anonymous session", async () => {
    // FIXED (lane-guardfix): assertCanWrite now consults the hook for the
    // anonymous session too, passing the anonymous codename card as the
    // hook's actor (the id the write is attributed to). canWrite is a
    // port-only seam — Ruby's permission chain is the :check_permissions
    // event walk alone (permissions.rb:100-157; no host hook in
    // card-1.110.0 or the perms mod) — so the engine's contract is the
    // only contract. This arm EXECUTED the skip at 8f50230 (create
    // succeeded, hook calls = 0); its assertions are flipped to the
    // CONTROL outcome and now pin the fixed engine.
    const s = await seedBypassDeck();
    const seenActors: Actor[] = [];
    const engine = new CardActionEngine(s.engine, {
      actor: null,
      ipAddress: "192.0.2.7",
      canWrite: async (_card, actor) => {
        seenActors.push(actor);
        return false;
      },
    });
    const err = await asError(engine.createCard({ name: "Hook Dodge", typeId: 12 }));
    expect(err?.code).toBe("permission-denied");
    expect(seenActors).toHaveLength(1); // the host gate ran
    expect(seenActors[0]?.name).toBe(ANONYMOUS_ACTOR_NAME); // the anonymous actor shape
    expect(seenActors[0]?.id).toBe(ANON_CARD_ID); // the id writes are attributed to
    expect(await s.count("cards")).toBe(19); // nothing written
  });
});

describe("anonred: actor attribution", () => {
  it("signed-out write records under the anonymous codename card even when that card is corpus-renamed", async () => {
    const s = await seedBypassDeck();
    // rename the anonymous card to the corpus's recorded name shape
    await s.driver.query("UPDATE cards SET name = 'tkmbewlur', `key` = 'tkmbewlur' WHERE id = 11", []);
    const engine = anonEngine(s);
    const result = await engine.createCard({ name: "Attribution Probe", typeId: 12 });
    const card = await s.selectOne<{ creator_id: number; updater_id: number }>(
      "SELECT creator_id, updater_id FROM cards WHERE id = ?",
      [result.cardId],
    );
    expect(card?.creator_id).toBe(11);
    expect(card?.updater_id).toBe(11);
  });

  it("CONTROL (LOW-1 fix): a host-supplied actor NAMED *anonymous but carrying a real account id acts as THAT account", async () => {
    // was a BYPASS at ba00146: actingIdForWrite keyed on the actor NAME,
    // so any actor named "*anonymous" had its writes recorded under the
    // Anonymous codename card and judged by the anonymous parties. Ruby
    // keys identity on the id (`@as_id = Card.id given_user`,
    // auth/proxy.rb:11; signed_in? = current_id != AnonymousID,
    // auth/current.rb:43-47) — only the real Anonymous card (by id) is
    // the anonymous session now.
    const s = await seedBypassDeck();
    const engine = new CardActionEngine(s.engine, {
      actor: { id: 7, name: "*anonymous" }, // id 7 is "Editor" in this deck
      ipAddress: "192.0.2.7",
    });
    const result = await engine.createCard({ name: "Id Keyed", typeId: 12 });
    const card = await s.selectOne<{ creator_id: number }>(
      "SELECT creator_id FROM cards WHERE id = ?",
      [result.cardId],
    );
    expect(card?.creator_id).toBe(7); // its OWN id — never the Anonymous card (11)
  });

  it("an actor carrying the Anonymous codename card's id IS the anonymous session (id-keyed both directions)", async () => {
    const s = await seedBypassDeck();
    const anonRow = await s.selectOne<{ id: number }>(
      "SELECT id FROM cards WHERE codename = 'anonymous'",
    );
    const anonId = anonRow?.id ?? ANON_CARD_ID;
    const engine = new CardActionEngine(s.engine, {
      actor: { id: anonId, name: "Some Other Name" }, // right id, wrong name: still anonymous
      ipAddress: "192.0.2.7",
    });
    const result = await engine.createCard({ name: "Anonymous By Id", typeId: 12 });
    const card = await s.selectOne<{ creator_id: number }>(
      "SELECT creator_id FROM cards WHERE id = ?",
      [result.cardId],
    );
    expect(card?.creator_id).toBe(anonId); // attribution AND verdict run as the Anonymous card
  });
});


/** Left-rename deck: the *type plus right candidates of a junction read
 *  the ASSIGNED left part's TYPE (Ruby 08_type_plus_right.rb:30-32
 *  anchor_name = "#{left_type(card)}+#{card.name.tag}"; left_type =
 *  superleft&.type_name || quick_type(name.left_name),
 *  set/pattern/class_methods.rb:59-69). The left cards are typed so the
 *  anchor flips with the rename: Left One/Left Four are Basic-typed (the
 *  Anyone-ruled anchor), Left Two/Left Three are Signup-typed (the
 *  Editor-locked one). A LEFT rename's verdict must follow the ASSIGNED
 *  left anchor. Every rename target below is a FREE name — the single
 *  divergence under test is the anchor reading, never a name conflict. */
async function seedLeftRenameDeck(): Promise<ActionsTestStorage> {
  const s = await createActionsTestStorage();
  await seedSkeleton(s, 42);
  await seedCard(s, { id: 30, name: "Basic", typeId: 3 });
  await seedCard(s, { id: 12, name: "Signup", typeId: 3 });
  await seedCard(s, { id: 50, name: "Left One", typeId: 30 }); // Basic-typed
  await seedCard(s, { id: 51, name: "Left Two", typeId: 12 }); // Signup-typed
  await seedCard(s, { id: 52, name: "Left Three", typeId: 12 }); // Signup-typed
  await seedCard(s, { id: 53, name: "Left Four", typeId: 30 }); // Basic-typed
  await seedCard(s, { id: 60, name: "Right A", typeId: 42 });
  await seedCard(s, { id: 90, name: "*type plus right", typeId: SET_TYPE_ID });
  // the Basic-typed left anchor: *type plus right set + Anyone update rule
  await seedCard(s, { id: 81, name: "Basic+Right A", leftId: 30, rightId: 60, typeId: SET_TYPE_ID });
  await seedCard(s, { id: 80, name: "Basic+Right A+*type plus right", leftId: 81, rightId: 90, typeId: SET_TYPE_ID });
  await seedCard(s, { id: 82, name: "Basic+Right A+*type plus right+*update", leftId: 80, rightId: 5, dbContent: "[[Anyone]]" });
  await seedReference(s, 82, 6, "anyone");
  // the Signup-typed left anchor: same shape, Editor-locked
  await seedCard(s, { id: 84, name: "Signup+Right A", leftId: 12, rightId: 60, typeId: SET_TYPE_ID });
  await seedCard(s, { id: 83, name: "Signup+Right A+*type plus right", leftId: 84, rightId: 90, typeId: SET_TYPE_ID });
  await seedCard(s, { id: 85, name: "Signup+Right A+*type plus right+*update", leftId: 83, rightId: 5, dbContent: "[[Editor]]" });
  await seedReference(s, 85, 7, "editor");
  // the junctions under test: 70 lives at "Left One+Right A" (Anyone
  // anchor), 71 at "Left Three+Right A" (Editor anchor)
  await seedCard(s, { id: 70, name: null, key: null, leftId: 50, rightId: 60, typeId: 42 });
  await seedCard(s, { id: 71, name: null, key: null, leftId: 52, rightId: 60, typeId: 42 });
  return s;
}

describe("anonred: LEFT-part renames are judged under the ASSIGNED left part's type anchor (semantics-followups lane)", () => {
  // The verdict-semantics lane pinned the RIGHT-part rename direction
  // only; limitation 3 left the assigned LEFT part's type resolution
  // (patternInputFor's fetchByName arm) code-read-covered. Ruby rebuilds
  // the patterns from the new name before the validate-stage check
  // (name/all.rb:21-28 + :76-84; assign_attributes.rb:63-68), so the
  // *type plus right anchor is "#{left_type}+#{tag}" of the ASSIGNED name
  // (08_type_plus_right.rb:30-32; class_methods.rb:59-69). Both
  // directions pinned here; each arm carries a same-anchor control so a
  // deny can never pass for deny-on-empty's reason.
  it("DENY: junction rename from an Anyone-ruled left anchor into an Editor-locked one is refused; nothing moves", async () => {
    const s = await seedLeftRenameDeck();
    const engine = anonEngine(s);
    // control: LIVING under the Basic-typed left anchor the update is
    // allowed (Basic+Right A+*type plus right+*update -> Anyone) — the
    // deck's Anyone rule resolves, so the deny below is the assigned
    // anchor's answer, never deny-on-empty's
    const allowed = await engine.updateCard({ cardId: 70, content: "fine here" });
    expect(allowed?.cardId).toBe(70);
    // the left rename: the ASSIGNED left part "Left Two" is Signup-typed
    // -> the Editor-locked anchor's rule denies
    const renameErr = await asError(engine.updateCard({ cardId: 70, name: "Left Two+Right A" }));
    expect(renameErr?.code).toBe("permission-denied");
    const row = await s.selectOne<{ left_id: number; right_id: number }>(
      "SELECT left_id, right_id FROM cards WHERE id = 70",
    );
    expect(row?.left_id).toBe(50); // still under Left One
    expect(row?.right_id).toBe(60);
    expect(await s.count("card_acts")).toBe(1); // the control's act only — the rename wrote nothing
  });

  it("ALLOW (mirror): junction rename from the Editor-locked left anchor into the Anyone-ruled one lands under the ASSIGNED anchor", async () => {
    const s = await seedLeftRenameDeck();
    const engine = anonEngine(s);
    // control: LIVING under the Signup-typed left anchor the update is
    // denied (Signup+Right A+*type plus right+*update -> Editor) — the
    // same save judged by the OLD row's anchor would be refused
    const denied = await asError(engine.updateCard({ cardId: 71, content: "blocked" }));
    expect(denied?.code).toBe("permission-denied");
    // the mirror rename: the ASSIGNED left part "Left Four" is
    // Basic-typed -> the Anyone-ruled anchor allows (a blanket deny or an
    // old-anchor reading would fail this arm)
    const result = await engine.updateCard({ cardId: 71, name: "Left Four+Right A" });
    expect(result?.cardId).toBe(71);
    const row = await s.selectOne<{ left_id: number; updater_id: number }>(
      "SELECT left_id, updater_id FROM cards WHERE id = 71",
    );
    expect(row?.left_id).toBe(53); // now under Left Four
    expect(row?.updater_id).toBe(ANON_CARD_ID);
  });
});
