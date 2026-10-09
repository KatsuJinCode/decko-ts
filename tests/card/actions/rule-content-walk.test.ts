// The *captcha rule candidate walk (card-mod-recaptcha-0.20.0
// set/all/recaptcha.rb:22 `Card::Rule.toggle(rule(:captcha))`) - the
// captcha-remainders lane's port of the named remainder. The walk is
// Card#rule's storage half (card-1.110.0 lib/card/rule/all.rb:5-15 + 66-73
// over the set-patterns port's ruleNamesForCard precedence):
//
//   rule(setting_code) -> rule_card(setting_code) -> rule_card_id ->
//   rule_id_lookup(rule_cache, setting_code) - the card's rule lookup keys
//   in PATTERN-PRECEDENCE ORDER (self > type_plus_right > right > rule >
//   rstar > star > type > all_plus > all; registry.ts's front-insert
//   mechanism), first key the cache answers wins.
//
// The port walks candidate rule NAMES (set name + "*captcha") and fetches
// each; rule-names.ts's header oracle-verified the two forms agree
// (candidate lists + the resolved "*all+*read" rule for a plain card).
//
// Deck fixture mirrors the gem's own seed (card-mod-recaptcha data/real.yml):
// "*all+*captcha" = '1' and "Sign up+*type+*captcha" = '1' - the shipped
// default that makes *captcha-on the deck default and signup captcha-on.

import { describe, expect, it, vi } from "vitest";
import {
  createActionsTestStorage,
  seedCard,
  seedStandardDeck,
  SET_TYPE_ID,
  JOE,
  RICH_TEXT_ID,
  CARDTYPE_ID,
  type ActionsTestStorage,
} from "./actions-test-storage.js";
import { DeckoName } from "../../../src/card/name.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import {
  isPreferenceName,
  isStandardRuleName,
  ruleContentForCard,
  ruleWalkPatternInput,
} from "../../../src/card/actions/rule-content-walk.js";
import { ModLoader } from "../../../src/card/mod-loader.js";
import cardModRecaptcha, {
  recaptchaModEventPredicates,
} from "../../../src/card/mod-loader/mods/card-mod-recaptcha.js";
import {
  runModEventStage,
  type ModEventRecaptchaGuard,
  type ModEventRuntime,
  type ModEventSaveInput,
  type ModEventStageReport,
} from "../../../src/card/mod-loader/mod-event-dispatch.js";

// Fixed ids for the fixture's rule machinery. SET_TYPE_ID (the "Set"
// cardtype, codename set) comes from the shared fixture now —
// seedStandardDeck seeds it, and cards.codename is UNIQUE, so this file
// reuses that row instead of seeding a second codename-'set' card.
const SETTING_TYPE_ID = 61; // the "Setting" cardtype (codename setting)
const TOGGLE_TYPE_ID = 62; // the "Toggle" cardtype (codename toggle)
const STAR_TYPE_ID = 63; // the "*type" set-pattern card (codename type)
const SELF_CARD_ID = 64; // the "*self" set-pattern card (codename self)
const RULE_CARD_ID = 65; // the "*rule" set-pattern card (codename rule)
const CAPTCHA_CARD_ID = 66; // the "*captcha" setting card (codename captcha)
const SIGNUP_TYPE_ID = 100; // the "Sign up" cardtype (codename signup)
const HOME_ID = 110; // an existing plain card

/** The gem's data/real.yml shape: *captcha + the two shipped '1' rules. */
async function seedCaptchaDeck(storage: ActionsTestStorage): Promise<void> {
  await seedStandardDeck(storage); // provides the codename-'set' card (SET_TYPE_ID)
  await seedCard(storage, {
    id: SETTING_TYPE_ID,
    name: "Setting",
    codename: "setting",
    typeId: CARDTYPE_ID,
  });
  await seedCard(storage, { id: TOGGLE_TYPE_ID, name: "Toggle", codename: "toggle", typeId: CARDTYPE_ID });
  await seedCard(storage, { id: STAR_TYPE_ID, name: "*type", codename: "type", typeId: SET_TYPE_ID });
  await seedCard(storage, { id: SELF_CARD_ID, name: "*self", codename: "self", typeId: SET_TYPE_ID });
  await seedCard(storage, { id: RULE_CARD_ID, name: "*rule", codename: "rule", typeId: SET_TYPE_ID });
  await seedCard(storage, {
    id: CAPTCHA_CARD_ID,
    name: "*captcha",
    codename: "captcha",
    typeId: SETTING_TYPE_ID,
  });
  // data/real.yml rows 5-6: "*all+*captcha" toggle '1' (the deck default)
  const all = await storage.selectOne<{ id: number }>("SELECT id FROM cards WHERE key = '*all'");
  await seedCard(storage, {
    leftId: all!.id,
    rightId: CAPTCHA_CARD_ID,
    typeId: TOGGLE_TYPE_ID,
    dbContent: "1",
  });
  // data/real.yml rows 7-10: "Sign up+*type+*captcha" toggle '1'
  await seedCard(storage, {
    id: SIGNUP_TYPE_ID,
    name: "Sign up",
    codename: "signup",
    typeId: CARDTYPE_ID,
  });
  const signupSet = await seedCard(storage, {
    leftId: SIGNUP_TYPE_ID,
    rightId: STAR_TYPE_ID,
    typeId: SET_TYPE_ID,
  });
  await seedCard(storage, {
    leftId: signupSet.id,
    rightId: CAPTCHA_CARD_ID,
    typeId: TOGGLE_TYPE_ID,
    dbContent: "1",
  });
}

/** The acting-card inputs the save paths build (create: new + resolved
 *  type; update: the row). */
function createInput(name: string, typeId: number | null) {
  return { name: DeckoName.parse(name), isNew: true, typeId };
}
function updateInput(name: string, id: number, typeId: number | null) {
  return { name: DeckoName.parse(name), id, isNew: false, typeId };
}

describe("ruleContentForCard - the rule(:captcha) candidate walk (rule/all.rb:5-15 + 66-73)", () => {
  it("a Sign up CREATE resolves the TYPE rule first (pattern precedence: type beats all)", async () => {
    const storage = await createActionsTestStorage();
    try {
      await seedCaptchaDeck(storage);
      // new-card candidates skip *self (pattern/all.rb:27-29); Sign up has
      // no compound name, so type_plus_right/right/rstar/star do not apply:
      // the walk is [type, all_plus, all] and "Sign up+*type+*captcha" hits.
      const pattern = await ruleWalkPatternInput(storage.engine, createInput("Sign up", SIGNUP_TYPE_ID));
      expect(pattern.typeName).toBe("Sign up");
      const content = await ruleContentForCard(storage.engine, pattern, "captcha");
      expect(content).toBe("1");
    } finally {
      storage.close();
    }
  });

  it("a type-less card falls through to the *all rule (data/real.yml's deck default)", async () => {
    const storage = await createActionsTestStorage();
    try {
      await seedCaptchaDeck(storage);
      const pattern = await ruleWalkPatternInput(storage.engine, createInput("Plain Thing", null));
      const content = await ruleContentForCard(storage.engine, pattern, "captcha");
      expect(content).toBe("1");
    } finally {
      storage.close();
    }
  });

  it("an EXISTING card resolves its *self rule before the type/all rules (most-specific wins)", async () => {
    const storage = await createActionsTestStorage();
    try {
      await seedCaptchaDeck(storage);
      await seedCard(storage, { id: HOME_ID, name: "Home", typeId: RICH_TEXT_ID });
      const puddingSet = await seedCard(storage, {
        leftId: HOME_ID,
        rightId: SELF_CARD_ID,
        typeId: SET_TYPE_ID,
      });
      await seedCard(storage, {
        leftId: puddingSet.id,
        rightId: CAPTCHA_CARD_ID,
        typeId: TOGGLE_TYPE_ID,
        dbContent: "0",
      });
      const pattern = await ruleWalkPatternInput(
        storage.engine,
        updateInput("Home", HOME_ID, RICH_TEXT_ID),
      );
      const content = await ruleContentForCard(storage.engine, pattern, "captcha");
      expect(content).toBe("0");
    } finally {
      storage.close();
    }
  });

  it("a NEW card with the same name skips the *self candidate (pattern/all.rb:27-29 concrete_patterns[1..])", async () => {
    const storage = await createActionsTestStorage();
    try {
      await seedCaptchaDeck(storage);
      // The *self rule EXISTS for this name, but a create cannot see it.
      await seedCard(storage, { id: HOME_ID, name: "Home", typeId: RICH_TEXT_ID });
      const homeSet = await seedCard(storage, {
        leftId: HOME_ID,
        rightId: SELF_CARD_ID,
        typeId: SET_TYPE_ID,
      });
      await seedCard(storage, {
        leftId: homeSet.id,
        rightId: CAPTCHA_CARD_ID,
        typeId: TOGGLE_TYPE_ID,
        dbContent: "0",
      });
      const pattern = await ruleWalkPatternInput(storage.engine, createInput("Home", RICH_TEXT_ID));
      const content = await ruleContentForCard(storage.engine, pattern, "captcha");
      // falls through *self to the *all deck default
      expect(content).toBe("1");
    } finally {
      storage.close();
    }
  });

  it("a rule-card name engages the *rule candidate through isRule (standard_rule?, rule/all.rb:37-40)", async () => {
    const storage = await createActionsTestStorage();
    try {
      await seedCaptchaDeck(storage);
      // "*rule+*captcha" exists; ONLY a card that IS a rule card walks that
      // candidate (06_rule.rb pattern_applies? card.rule?). Saving the
      // "Sign up+*type+*captcha" rule card itself: its left part
      // "Sign up+*type" is a Set card and its right part "*captcha" a
      // Setting card -> isRule true -> the *rule candidate ("*rule+*captcha")
      // resolves.
      const signupSet = await storage.selectOne<{ id: number }>(
        "SELECT id FROM cards WHERE left_id = ? AND right_id = ?",
        [SIGNUP_TYPE_ID, STAR_TYPE_ID],
      );
      const signupTypeCaptcha = await storage.selectOne<{ id: number }>(
        "SELECT id FROM cards WHERE left_id = ? AND right_id = ?",
        [signupSet!.id, CAPTCHA_CARD_ID],
      );
      await seedCard(storage, {
        leftId: RULE_CARD_ID,
        rightId: CAPTCHA_CARD_ID,
        typeId: TOGGLE_TYPE_ID,
        dbContent: "0",
      });
      const pattern = await ruleWalkPatternInput(
        storage.engine,
        updateInput("Sign up+*type+*captcha", signupTypeCaptcha!.id, TOGGLE_TYPE_ID),
      );
      expect(pattern.isRule).toBe(true);
      // the type_plus_right anchor enrichment rode the live left-type fetch
      // (class_methods.rb:59-71): the left card "Sign up+*type" is a Set
      expect(pattern.leftTypeName).toBe("Set");
      const content = await ruleContentForCard(storage.engine, pattern, "captcha");
      expect(content).toBe("0");
    } finally {
      storage.close();
    }
  });

  it("a non-rule card never walks the *rule candidate (isRule false), even when *rule+*captcha exists", async () => {
    const storage = await createActionsTestStorage();
    try {
      await seedCaptchaDeck(storage);
      await seedCard(storage, {
        leftId: RULE_CARD_ID,
        rightId: CAPTCHA_CARD_ID,
        typeId: TOGGLE_TYPE_ID,
        dbContent: "0",
      });
      const pattern = await ruleWalkPatternInput(
        storage.engine,
        updateInput("Pudding", 50, RICH_TEXT_ID),
      );
      expect(pattern.isRule).toBe(false);
      const content = await ruleContentForCard(storage.engine, pattern, "captcha");
      expect(content).toBe("1"); // the *all default, not the *rule '0'
    } finally {
      storage.close();
    }
  });

  it("no rule card in storage -> undefined (Card::Rule.toggle(nil) false, rule.rb:11-13)", async () => {
    const storage = await createActionsTestStorage();
    try {
      await seedStandardDeck(storage);
      const pattern = await ruleWalkPatternInput(storage.engine, createInput("Sign up", null));
      const content = await ruleContentForCard(storage.engine, pattern, "captcha");
      expect(content).toBeUndefined();
    } finally {
      storage.close();
    }
  });

  it("an existing rule card with BLANK content returns \"\" (raw db_content; toggle(\"\") false)", async () => {
    const storage = await createActionsTestStorage();
    try {
      await seedStandardDeck(storage);
      await seedCard(storage, { id: CAPTCHA_CARD_ID, name: "*captcha", codename: "captcha", typeId: CARDTYPE_ID });
      const all = await storage.selectOne<{ id: number }>("SELECT id FROM cards WHERE key = '*all'");
      await seedCard(storage, {
        leftId: all!.id,
        rightId: CAPTCHA_CARD_ID,
        typeId: RICH_TEXT_ID,
        dbContent: "",
      });
      const pattern = await ruleWalkPatternInput(storage.engine, createInput("Any", null));
      const content = await ruleContentForCard(storage.engine, pattern, "captcha");
      expect(content).toBe("");
    } finally {
      storage.close();
    }
  });
});

describe("isPreferenceName / rule? - per-user setting cards (rule/all.rb:32-54)", () => {
  // SET+PREFERER+SETTING: the right part a Setting, the name without its
  // last two parts a Set, and the preferer User-typed or the *all card.
  const USER_TYPE_ID = 71;
  async function seedPreferenceDeck(storage: ActionsTestStorage): Promise<void> {
    await seedCaptchaDeck(storage);
    await seedCard(storage, { id: USER_TYPE_ID, name: "User", codename: "user", typeId: CARDTYPE_ID });
    await seedCard(storage, { id: 72, name: "Jane Doe", typeId: USER_TYPE_ID });
    await seedCard(storage, { id: 73, name: "*follow", codename: "follow", typeId: SETTING_TYPE_ID });
    await seedCard(storage, { id: HOME_ID, name: "Home", typeId: RICH_TEXT_ID });
    await seedCard(storage, { leftId: HOME_ID, rightId: SELF_CARD_ID, typeId: SET_TYPE_ID }); // Home+*self
  }

  it("a User preferer or the *all preferer makes a preference, and rule? follows", async () => {
    const storage = await createActionsTestStorage();
    try {
      await seedPreferenceDeck(storage);
      const userPref = DeckoName.parse("Home+*self+Jane Doe+*follow");
      expect(await isPreferenceName(storage.engine, userPref)).toBe(true);
      expect(await isStandardRuleName(storage.engine, userPref)).toBe(false);
      expect((await ruleWalkPatternInput(storage.engine, createInput(userPref.s, null))).isRule).toBe(true);
      expect(await isPreferenceName(storage.engine, DeckoName.parse("Home+*self+*all+*follow"))).toBe(true);
    } finally {
      storage.close();
    }
  });

  it("a non-User preferer, a non-Set trunk or a two-part name is not a preference", async () => {
    const storage = await createActionsTestStorage();
    try {
      await seedPreferenceDeck(storage);
      await seedCard(storage, { id: 74, name: "Pudding Two", typeId: RICH_TEXT_ID });
      expect(await isPreferenceName(storage.engine, DeckoName.parse("Home+*self+Pudding Two+*follow"))).toBe(false);
      expect(await isPreferenceName(storage.engine, DeckoName.parse("Home+Jane Doe+*follow"))).toBe(false);
      expect(await isPreferenceName(storage.engine, DeckoName.parse("Home+*self+*follow"))).toBe(false);
      const plain = await ruleWalkPatternInput(storage.engine, createInput("Home+*self+Pudding Two+*follow", null));
      expect(plain.isRule).toBe(false);
    } finally {
      storage.close();
    }
  });
});

describe("ruleWalkPatternInput - the left type of a compound whose left is missing (quick_type)", () => {
  // class_methods.rb#quick_type: `Card.fetch name, new: {}` - a missing or
  // trashed left is a NEW card, typed by the new-card chain (here the
  // deck's *all+*default rule); only a blank left answers "RichText".
  const BASIC_CS_ID = 70;
  async function seedDefaultTypedDeck(storage: ActionsTestStorage): Promise<void> {
    await seedStandardDeck(storage);
    await seedCard(storage, { id: BASIC_CS_ID, name: "BasicCs", typeId: CARDTYPE_ID });
    await storage.engine.driver.query(
      "UPDATE cards SET type_id = ? WHERE left_id = 7 AND right_id = 8",
      [BASIC_CS_ID],
    );
    await seedCard(storage, { id: 120, name: "Gone Left", typeId: RICH_TEXT_ID, trash: true });
  }

  it("an absent left answers the new-card type from *all+*default", async () => {
    const storage = await createActionsTestStorage();
    try {
      await seedDefaultTypedDeck(storage);
      const pattern = await ruleWalkPatternInput(storage.engine, createInput("Never Existed+watermark", null));
      expect(pattern.leftTypeName).toBe("BasicCs");
    } finally {
      storage.close();
    }
  });

  it("a trashed left answers the new-card type, not its stored type", async () => {
    const storage = await createActionsTestStorage();
    try {
      await seedDefaultTypedDeck(storage);
      const pattern = await ruleWalkPatternInput(storage.engine, createInput("Gone Left+watermark", null));
      expect(pattern.leftTypeName).toBe("BasicCs");
    } finally {
      storage.close();
    }
  });

  it("an existing left answers its own type", async () => {
    const storage = await createActionsTestStorage();
    try {
      await seedDefaultTypedDeck(storage);
      const pattern = await ruleWalkPatternInput(storage.engine, createInput("Pudding+watermark", null));
      expect(pattern.leftTypeName).toBe("RichText");
    } finally {
      storage.close();
    }
  });
});

// ---------------------------------------------------------------------------
// The engine wiring: prepareRecaptchaSaveInput resolves rule(:captcha)
// through the walk when the config carries no explicit override.
// ---------------------------------------------------------------------------

function recaptchaRegistry() {
  const loader = new ModLoader([{ manifest: cardModRecaptcha }]);
  loader.resolveOrder({ gemMods: ["recaptcha"] });
  loader.load();
  return loader.eventRegistry();
}

function stubVerify(body: unknown) {
  const calls: Array<{ url: string; query: { secret: string; response: string } }> = [];
  return {
    calls,
    verify: async (url: string, query: { secret: string; response: string }) => {
      calls.push({ url, query });
      return JSON.stringify(body);
    },
  };
}

/** The validate-stage walk of the mod's registered event with a guard
 *  snapshot whose rule content IS the walk's return - the seam proof that
 *  walk output engages the event (the same registry/predicate/body objects
 *  the engine's walk fires). */
async function runValidateWithRuleContent(ruleContent: unknown, token = "tok"): Promise<ModEventStageReport> {
  const storage = await createActionsTestStorage();
  try {
    const guard: ModEventRecaptchaGuard = {
      siteKey: "site-key",
      secretKey: "secret-key",
      envController: true,
      signedIn: false,
      alwaysOk: false,
      needsSetup: false,
      captchaRuleContent: ruleContent,
      captchaCodenameExists: true,
      isSupercard: false,
      minimumScore: 0.5,
      verifyUrl: "https://www.google.com/recaptcha/api/siteverify",
    };
    let used = false;
    const saveInput: ModEventSaveInput = {
      comment: undefined,
      commentAuthor: undefined,
      signedInActorName: undefined,
      now: () => new Date("2026-10-01T12:00:00.000Z"),
      pendingContent: undefined,
      setContent: () => undefined,
      commentApplied: false,
      recaptcha: {
        token,
        guard,
        isUsed: () => used,
        markUsed: () => {
          used = true;
        },
        verify: async (url, query) => JSON.stringify({ success: true, score: 0.9, action: "create", url, query }),
      },
    };
    const runtime: ModEventRuntime = {
      registry: recaptchaRegistry(),
      predicates: recaptchaModEventPredicates,
    };
    return await runModEventStage(
      runtime,
      "validate",
      { name: "Sign up", act: { action: "create" } },
      { driver: storage.engine.driver, lexicon: storage.engine.lexicon },
      saveInput,
    );
  } finally {
    storage.close();
  }
}

describe("the walk engages the event (guard from the walk's return)", () => {
  it("the walk's resolved content rides the guard: '1' fires the event (verify called)", async () => {
    const report = await runValidateWithRuleContent("1");
    expect(report.fired).toContain("recaptcha");
  });

  it("the walk's ABSENCE (undefined) keeps the guard off (toggle(nil) false)", async () => {
    const report = await runValidateWithRuleContent(undefined);
    expect(report.fired).not.toContain("recaptcha");
    expect(report.skipped).toContainEqual({ event: "recaptcha", reason: "when-false" });
  });

  it("the walk's non-'1' content keeps the guard off (Card::Rule.toggle, rule.rb:11-13)", async () => {
    const report = await runValidateWithRuleContent("yes");
    expect(report.fired).not.toContain("recaptcha");
  });
});

describe("prepareRecaptchaSaveInput - the engine resolves rule(:captcha) through the walk", () => {
  it("a signed-in save over the seeded rules skips the event at the signed-in arm (the walk fed the guard; report-visible)", async () => {
    const storage = await createActionsTestStorage();
    try {
      await seedCaptchaDeck(storage);
      const stub = stubVerify({ success: false });
      const reports: ModEventStageReport[] = [];
      const runtime: ModEventRuntime = {
        registry: recaptchaRegistry(),
        predicates: recaptchaModEventPredicates,
        onReport: (r) => reports.push(r),
      };
      const engine = new CardActionEngine(storage.engine, {
        actor: JOE,
        ipAddress: "192.0.2.7",
        recaptcha: {
          siteKey: "k",
          secretKey: "s",
          // NO captchaRuleContent: the walk resolves "Sign up+*type+*captcha"
          verify: stub.verify,
        },
        modEvents: runtime,
      });
      // the signup-shaped create: a NEW card of the Sign up type (the walk's
      // *type candidate reads the resolved type), with the account Sign up
      // requires (require_field :account)
      const result = await engine.createCard({
        name: "Jane Doe",
        typeCode: "signup",
        content: "body",
        recaptchaToken: "tok",
        subcards: {
          "+*account": {
            subcards: {
              "+*email": { content: "jane.doe@example.com" },
              "+*password": { content: "Jane horse battery 7!" },
            },
          },
        },
      });
      expect(result.cardId).toBeGreaterThan(0);
      expect(stub.calls).toHaveLength(0); // the signed-in arm refused first (recaptcha.rb:20)
      const validate = reports.find((r) => r.stage === "validate");
      expect(validate?.skipped).toContainEqual({ event: "recaptcha", reason: "when-false" });
    } finally {
      storage.close();
    }
  });

  it("the host's explicit override still wins and receives the acting card's name (back-compat)", async () => {
    const storage = await createActionsTestStorage();
    try {
      await seedCaptchaDeck(storage);
      const hostRead = vi.fn(async (cardName: string) => "1");
      const stub = stubVerify({ success: false });
      const reports: ModEventStageReport[] = [];
      const runtime: ModEventRuntime = {
        registry: recaptchaRegistry(),
        predicates: recaptchaModEventPredicates,
        onReport: (r) => reports.push(r),
      };
      const engine = new CardActionEngine(storage.engine, {
        actor: JOE,
        ipAddress: "192.0.2.7",
        recaptcha: {
          siteKey: "k",
          secretKey: "s",
          captchaRuleContent: hostRead,
          verify: stub.verify,
        },
        modEvents: runtime,
      });
      await engine.createCard({ name: "Guarded Create", content: "body", recaptchaToken: "tok" });
      expect(hostRead).toHaveBeenCalledWith("Guarded Create");
      expect(validateSkippedRecaptcha(reports)).toBe(true);
    } finally {
      storage.close();
    }
  });
});

function validateSkippedRecaptcha(reports: ModEventStageReport[]): boolean {
  const validate = reports.find((r) => r.stage === "validate");
  return (
    validate?.skipped.some((s) => s.event === "recaptcha" && s.reason === "when-false") ?? false
  );
}
