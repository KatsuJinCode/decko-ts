// The event :recaptcha validate wiring (card-mod-recaptcha-0.20.0
// set/all/recaptcha.rb:50-55), ported through the
// mod-event seam (the add_comment pattern, card-mod-comment-save-event.test.ts).
//
// Ruby:
//   event :recaptcha, :validate, when: :validate_recaptcha? do
//     handle_recaptcha_config_errors do
//       :captcha.card.captcha_used!
//       human?
//     end
//   end
// The event's deck-side inputs (the recaptcha config keys, the Auth state,
// the :captcha rule content) are NOT readable synchronously in this engine
// — the save path resolves them before the walk and rides them through
// ModEventSaveInput.recaptcha (mod-event-dispatch.ts), which
// CardActionEngine.prepareRecaptchaSaveInput builds from its recaptcha
// options port + the codename registry + the host's captcha-rule input.
//
// TWO EXECUTION LEVELS, mirroring what the engine can reach:
// 1. ENGINE level (createCard): the real wiring — the guard snapshot is
//    computed from the engine's OWN actor state, the walk consults the
//    registered event, and the guard-off arm (a signed-in actor is
//    Ruby-true: recaptcha_on? requires !Auth.signed_in?, recaptcha.rb:20)
//    skips the event. The guard-ON arms are NOT reachable through the
//    public engine: its write path is signed-in-only (actor null = the
//    read-only gate, types.ts:14-16), which is the named remainder on the
//    mod header — the anonymous-create permission surface is its own row.
// 2. SEAM level (runModEventStage with the mod's registered event): the
//    guard-on arms by execution — refusal bytes, the captcha_used! skip,
//    the config-error dispatch, the transport query shape and the success
//    pass. The same registry/predicate/body objects the engine's walk
//    fires; only the guard snapshot is composed by hand (signedIn false).

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

/** The recaptcha mod's registry (the same registration the SetLoader phase
 *  performs engine-wide when the mod is loaded). */
function recaptchaRegistry() {
  const loader = new ModLoader([{ manifest: cardModRecaptcha }]);
  loader.resolveOrder({ gemMods: ["recaptcha"] });
  loader.load();
  return loader.eventRegistry();
}

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

/** A guard-on snapshot (the anonymous signup shape): keys set, the *captcha
 *  rule "1" (Card::Rule.toggle("1"), rule.rb:11-13), codename present,
 *  anonymous, not supercard, per-instance used-flag. */
function guardOn(overrides: {
  minimumScore?: number;
  verifyUrl?: string;
  captchaRuleContent?: unknown;
} = {}): {
  guard: ModEventRecaptchaGuard;
  isUsed: () => boolean;
  markUsed: () => void;
} {
  let used = false;
  const guard: ModEventRecaptchaGuard = {
    siteKey: "site-key-from-config",
    secretKey: "secret-key-from-config",
    envController: true,
    signedIn: false,
    alwaysOk: false,
    needsSetup: false,
    captchaRuleContent: overrides.captchaRuleContent ?? "1",
    captchaCodenameExists: true,
    isSupercard: false,
    minimumScore: overrides.minimumScore ?? 0.5,
    verifyUrl: overrides.verifyUrl ?? "https://www.google.com/recaptcha/api/siteverify",
  };
  return {
    guard,
    isUsed: () => used,
    markUsed: () => {
      used = true;
    },
  };
}

/** A save input carrying one recaptcha context (the shape
 *  prepareRecaptchaSaveInput builds; the comment fields ride undefined). */
function buildSaveInput(recaptcha: {
  token?: string;
  guard: ReturnType<typeof guardOn>["guard"];
  isUsed: () => boolean;
  markUsed: () => void;
  verify: ReturnType<typeof stubVerify>["verify"];
}): ModEventSaveInput {
  return {
    comment: undefined,
    commentAuthor: undefined,
    signedInActorName: undefined,
    now: () => new Date("2026-10-01T12:00:00.000Z"),
    pendingContent: undefined,
    setContent: () => undefined,
    commentApplied: false,
    recaptcha: {
      token: recaptcha.token,
      guard: recaptcha.guard,
      isUsed: recaptcha.isUsed,
      markUsed: recaptcha.markUsed,
      verify: recaptcha.verify,
    },
  };
}

/** One validate-stage walk of the mod's registered event (exactly what
 *  CardActionEngine.dispatchEventStage("validate") runs against its
 *  composed runtime). */
async function runValidate(saveInput: ModEventSaveInput): Promise<ModEventStageReport> {
  const storage = await createActionsTestStorage();
  const runtime: ModEventRuntime = {
    registry: recaptchaRegistry(),
    predicates: recaptchaModEventPredicates,
  };
  return runModEventStage(
    runtime,
    "validate",
    { name: "Sign up", act: { action: "create" } },
    { driver: storage.engine.driver, lexicon: storage.engine.lexicon },
    saveInput,
  );
}

describe("event :recaptcha — the engine-level wiring (guard computed from the real actor)", () => {
  it("a signed-in save with keys + rule '1' skips the event (recaptcha_on? requires !signed_in?, recaptcha.rb:20)", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    // Card::Codename.exist? :captcha (:69) — the codenamed *captcha card
    await seedCard(storage, { name: "*captcha", codename: "captcha" });
    const stub = stubVerify({ success: false, "error-codes": [] });
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
        captchaRuleContent: "1",
        verify: stub.verify,
      },
      modEvents: runtime,
    });
    const result = await engine.createCard({
      name: "Guarded Create",
      content: "body",
      recaptchaToken: "tok",
    });
    expect(result.cardId).toBeGreaterThan(0);
    // the siteverify endpoint was NEVER hit (the guard is off)
    expect(stub.calls).toHaveLength(0);
    // the walk consulted the event and skipped it on the when-false guard
    const validate = reports.find((r) => r.stage === "validate");
    expect(validate).toBeDefined();
    expect(validate?.skipped).toContainEqual({ event: "recaptcha", reason: "when-false" });
  });

  it("without a recaptcha config the save input carries no guard at all (recaptcha_keys? false, recaptcha.rb:46-48)", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    await seedCard(storage, { name: "*captcha", codename: "captcha" });
    const reports: ModEventStageReport[] = [];
    const runtime: ModEventRuntime = {
      registry: recaptchaRegistry(),
      predicates: recaptchaModEventPredicates,
      onReport: (r) => reports.push(r),
    };
    const engine = new CardActionEngine(storage.engine, {
      actor: JOE,
      ipAddress: "192.0.2.7",
      // NO recaptcha config — Ruby with no keys configured
      modEvents: runtime,
    });
    await engine.createCard({ name: "Unguarded", content: "body" });
    const validate = reports.find((r) => r.stage === "validate");
    // no guard snapshot -> the predicate answers false without consulting
    // the config, and the walk skips the event the same way
    expect(validate?.skipped).toContainEqual({ event: "recaptcha", reason: "when-false" });
  });
});

describe("event :recaptcha — the guard-on arms (seam level, the registered event the engine fires)", () => {
  it("a failed verify refuses the save with the default human message", async () => {
    const g = guardOn();
    const stub = stubVerify({ success: false });
    // validate stages do not rescue a failing body (card.rb:163-171
    // rescues /integrate/ only) — the walk rejects with the refusal
    const attempt = runValidate(
      buildSaveInput({ token: "tok-1", ...g, verify: stub.verify }),
    );
    const err = (await attempt.then(
      () => undefined,
      (e: CardActionError) => e,
    )) as CardActionError | undefined;
    expect(err?.code).toBe("recaptcha");
    expect(err?.message).toBe("Looks like you are not a human");
    // captcha_used! was marked BEFORE the verify (recaptcha.rb:52)
    expect(g.isUsed()).toBe(true);
    // the transport rode the Ruby query shape (Recaptcha.get,
    // recaptcha-4.13.2 lib/recaptcha.rb:63-77)
    expect(stub.calls[0]?.url).toBe("https://www.google.com/recaptcha/api/siteverify");
    expect(stub.calls[0]?.query).toEqual({ secret: "secret-key-from-config", response: "tok-1" });
  });

  it("a human verdict (success + score >= minimum + action match) lets the save pass", async () => {
    const stub = stubVerify({ success: true, score: 0.9, action: "create" });
    const report = await runValidate(
      buildSaveInput({ token: "tok-2", ...guardOn(), verify: stub.verify }),
    );
    expect(report.fired).toContain("recaptcha");
  });

  it("the score below the configured minimum fails (recaptcha.rb:37)", async () => {
    const failing = runValidate(
      buildSaveInput({
        token: "tok",
        ...guardOn({ minimumScore: 0.5 }),
        verify: stubVerify({ success: true, score: 0.2, action: "create" }).verify,
      }),
    );
    const err = (await failing.then(
      () => undefined,
      (e: CardActionError) => e,
    )) as CardActionError;
    expect(err.code).toBe("recaptcha");
    expect(err.message).toBe("Looks like you are not a human");
  });

  it("the response action must match the save's own action (recaptcha.rb:38 — Card#action)", async () => {
    const failing = runValidate(
      buildSaveInput({
        token: "tok",
        ...guardOn(),
        verify: stubVerify({ success: true, score: 0.9, action: "update" }).verify,
      }),
    );
    const err = (await failing.then(
      () => undefined,
      (e: CardActionError) => e,
    )) as CardActionError;
    expect(err.code).toBe("recaptcha");
  });

  it("error-codes map through RECAPTCHA_ERROR_CODES with unknown codes passing through (recaptcha.rb:25-33)", async () => {
    const failing = runValidate(
      buildSaveInput({
        token: "tok",
        ...guardOn(),
        verify: stubVerify({
          success: false,
          "error-codes": ["invalid-input-response", "some-future-code"],
        }).verify,
      }),
    );
    const err = (await failing.then(
      () => undefined,
      (e: CardActionError) => e,
    )) as CardActionError;
    expect(err.message).toBe(
      "response parameter is invalid or malformed\nsome-future-code",
    );
  });

  it("a save with NO token still validates — the verify posts response: nil and Google answers missing-input-response (recaptcha.rb:41-44)", async () => {
    const stub = stubVerify({ success: false, "error-codes": ["missing-input-response"] });
    const failing = runValidate(
      buildSaveInput({ token: undefined, ...guardOn(), verify: stub.verify }),
    );
    const err = (await failing.then(
      () => undefined,
      (e: CardActionError) => e,
    )) as CardActionError;
    expect(err.message).toBe("response parameter is missing");
    expect(stub.calls[0]?.query.response).toBe("");
  });

  it("the grecaptcha-undefined token adds the v3-config error without any verify call (recaptcha.rb:59-60)", async () => {
    const stub = stubVerify({ success: true });
    const failing = runValidate(
      buildSaveInput({ token: "grecaptcha-undefined", ...guardOn(), verify: stub.verify }),
    );
    const err = (await failing.then(
      () => undefined,
      (e: CardActionError) => e,
    )) as CardActionError;
    expect(err.message).toBe("needs correct v3 configuration");
    expect(stub.calls).toHaveLength(0);
  });

  it("the recaptcha-token-field-missing token raises without any verify call (recaptcha.rb:61-62)", async () => {
    const stub = stubVerify({ success: true });
    const failing = runValidate(
      buildSaveInput({ token: "recaptcha-token-field-missing", ...guardOn(), verify: stub.verify }),
    );
    const err = (await failing.then(
      () => undefined,
      (e: CardActionError) => e,
    )) as CardActionError;
    expect(err.message).toBe("recaptcha token field missing");
    expect(stub.calls).toHaveLength(0);
  });

  it("a used *captcha captcha skips the event for the second card in the request (validate_recaptcha? :71)", async () => {
    const g = guardOn();
    g.markUsed(); // the first card's validation marked :captcha.card.captcha_used!
    const stub = stubVerify({ success: false });
    const report = await runValidate(
      buildSaveInput({ token: "tok", ...g, verify: stub.verify }),
    );
    expect(report.fired).not.toContain("recaptcha");
    expect(report.skipped).toContainEqual({ event: "recaptcha", reason: "when-false" });
    expect(stub.calls).toHaveLength(0);
  });

  it("a missing :captcha codename fails the guard (validate_recaptcha? :69)", async () => {
    const g = guardOn();
    const guardNoCodename: ModEventRecaptchaGuard = {
      ...g.guard,
      captchaCodenameExists: false,
    };
    const stub = stubVerify({ success: false });
    const report = await runValidate(
      buildSaveInput({
        token: "tok",
        guard: guardNoCodename,
        isUsed: g.isUsed,
        markUsed: g.markUsed,
        verify: stub.verify,
      }),
    );
    expect(report.fired).not.toContain("recaptcha");
    expect(stub.calls).toHaveLength(0);
  });

  it("a *captcha rule content of 'yes' is NOT toggle-on (Card::Rule.toggle, rule.rb:11-13 — strip == '1')", async () => {
    const g = guardOn({ captchaRuleContent: "yes" });
    const stub = stubVerify({ success: false });
    const report = await runValidate(
      buildSaveInput({ token: "tok", ...g, verify: stub.verify }),
    );
    expect(report.fired).not.toContain("recaptcha");
    expect(stub.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// validate_recaptcha_field (set/abstract/recaptcha_setting.rb:1-5) - the
// real body: the grammar predicate + the errors.add :content refusal
// ---------------------------------------------------------------------------

import {
  validateRecaptchaFieldFn,
} from "../../../src/card/mod-loader/mods/card-mod-recaptcha.js";
import type { ModEventCard } from "../../../src/card/mod-loader/mod-manifest.js";

describe("validate_recaptcha_field - the :validate refusal (recaptcha_setting.rb:1-5)", () => {
  const card: ModEventCard = {
    name: "*recaptcha settings+site key",
    dbContent: "bad key!",
    recaptchaSettingChild: true,
    act: { action: "update" },
  };

  it("unit: invalid content throws the :content error (errors.add :content, 'invalid key')", async () => {
    // Ruby: `return if content.match?(/^[a-zA-Z0-9\-_]*$/)` then
    // `errors.add :content, "invalid key"` (recaptcha_setting.rb:2-4).
    const err = await validateRecaptchaFieldFn({ ...card, dbContent: "bad key!" }).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(CardActionError);
    const actionError = err as CardActionError;
    expect(actionError.code).toBe("validation-failed");
    expect(actionError.errorsByAttribute).toEqual({ content: "invalid key" });
    expect(actionError.userMessage).toBe("CONTENT: invalid key");
  });

  it("unit: valid content passes (the grammar's /m line-anchor semantics)", async () => {
    // "ok\nbad!" MATCHES in Ruby (the /m flag makes ^$ line anchors; one
    // passing line suffices - the oracle-pinned quirk on the predicate).
    await expect(
      validateRecaptchaFieldFn({ ...card, dbContent: "ok\nbad!" }),
    ).resolves.toBeUndefined();
    await expect(
      validateRecaptchaFieldFn({ ...card, dbContent: "ok-key_1" }),
    ).resolves.toBeUndefined();
    await expect(
      validateRecaptchaFieldFn({ ...card, dbContent: undefined }),
    ).resolves.toBeUndefined(); // nil content -> "" -> matches
  });

  it("seam: the validate walk REFUSES - the throw propagates (non-integrate stages re-throw, dispatch 536-546)", async () => {
    const storage = await createActionsTestStorage();
    const runtime: ModEventRuntime = {
      registry: recaptchaRegistry(),
      predicates: recaptchaModEventPredicates,
      // the scoped event's set membership, composed by hand: the walk's card
      // IS an Abstract::RecaptchaSetting child (recaptchaSettingChild true).
      setMember: (setPath) => setPath === "abstract/recaptcha_setting",
    };
    const walk = runModEventStage(
      runtime,
      "validate",
      card,
      { driver: storage.engine.driver, lexicon: storage.engine.lexicon },
      undefined,
    );
    await expect(walk).rejects.toBeInstanceOf(CardActionError);
    await walk.catch((e: CardActionError) => {
      expect(e.code).toBe("validation-failed");
      expect(e.errorsByAttribute).toEqual({ content: "invalid key" });
    });
    storage.close();
  });

  it("seam: valid content FIRES and the walk completes", async () => {
    const storage = await createActionsTestStorage();
    const runtime: ModEventRuntime = {
      registry: recaptchaRegistry(),
      predicates: recaptchaModEventPredicates,
      setMember: (setPath) => setPath === "abstract/recaptcha_setting",
    };
    const report = await runModEventStage(
      runtime,
      "validate",
      { ...card, dbContent: "ok-key_1" },
      { driver: storage.engine.driver, lexicon: storage.engine.lexicon },
      undefined,
    );
    expect(report.fired).toContain("validate_recaptcha_field");
    storage.close();
  });

  it("right/captcha.rb:1 assign_type :toggle rides the manifest's assignsType field", () => {
    const entry = (cardModRecaptcha.setModules ?? []).find(
      (f) => f.setPath === "right/captcha",
    );
    expect(entry?.assignsType).toBe("toggle");
  });
});
