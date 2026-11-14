// The event :validate_recaptcha_field wiring (card-mod-recaptcha-0.20.0
// set/abstract/recaptcha_setting.rb:1-5), ported through the mod-event
// seam (the add_comment pattern; sibling: card-mod-recaptcha-validate-event
// .test.ts for the all/recaptcha event).
//
// Ruby:
//   event :validate_recaptcha_field, :validate, when: :recaptcha_setting? do
//     return if content.match?(/^[a-zA-Z0-9\-_]*$/)
//     errors.add :content, "invalid key" # LOCALIZE
//   end
//   def recaptcha_setting?; left&.codename == :recaptcha_settings; end
//
// The grammar is the oracle-pinned line-anchor semantics (Ruby's ^/$ are
// line anchors by default; JS needs /m — RECAPTCHA_SETTING_CONTENT_PATTERN
// above, oracle-run on the gem's interpreter shape).
//
// TWO EXECUTION LEVELS:
// 1. SEAM level (runModEventStage with the mod's registered event + a
//    setMember resolver): the guard-on arms by execution — the invalid-key
//    refusal, the grammar pass, and the when-false skip for a non-setting
//    child.
// 2. ENGINE posture: the ModEventCard.recaptchaSettingChild guard input is
//    composition the engine does not populate yet, and the abstract set
//    has no engine-side setMember resolver — the walk skips the event
//    set-not-applicable. Pinned here so the wiring gap is visible, the
//    same honesty as the recaptcha event's guard-on remainder.

import { describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  seedStandardDeck,
  JOE,
} from "../actions/actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import type { CardActionError } from "../../../src/card/actions/types.js";
import { ModLoader } from "../../../src/card/mod-loader.js";
import cardModRecaptcha, {
  recaptchaModEventPredicates,
} from "../../../src/card/mod-loader/mods/card-mod-recaptcha.js";
import {
  runModEventStage,
  type ModEventRuntime,
  type ModEventStageReport,
} from "../../../src/card/mod-loader/mod-event-dispatch.js";

function recaptchaRegistry() {
  const loader = new ModLoader([{ manifest: cardModRecaptcha }]);
  loader.resolveOrder({ gemMods: ["recaptcha"] });
  loader.load();
  return loader.eventRegistry();
}

/** The setMember resolver the abstract set needs: Ruby's include of
 *  Abstract::RecaptchaSetting puts the event on every card whose left is
 *  the *recaptcha settings card; the seam models that with the guard
 *  input the engine will supply (ModEventCard.recaptchaSettingChild). */
function settingChildRuntime(): ModEventRuntime {
  return {
    registry: recaptchaRegistry(),
    predicates: recaptchaModEventPredicates,
    setMember: (setPath, card) =>
      setPath === "abstract/recaptcha_setting" && card.recaptchaSettingChild === true,
  };
}

function runValidate(
  runtime: ModEventRuntime,
  card: { name: string; dbContent?: string; recaptchaSettingChild?: boolean },
): Promise<ModEventStageReport> {
  return runModEventStage(
    runtime,
    "validate",
    { name: card.name, dbContent: card.dbContent, recaptchaSettingChild: card.recaptchaSettingChild, act: { action: "update" } },
    { driver: undefined as never, lexicon: undefined as never },
  );
}

describe("event :validate_recaptcha_field — the guard-on arms (seam level)", () => {
  it("an invalid key refuses the save with the :content 'invalid key' error", async () => {
    const attempt = runValidate(settingChildRuntime(), {
      name: "*recaptcha+*site_key",
      dbContent: "bad key!",
      recaptchaSettingChild: true,
    });
    const err = (await attempt.then(() => undefined, (e: CardActionError) => e)) as CardActionError;
    expect(err?.code).toBe("validation-failed");
    expect(err?.message).toBe("invalid key");
    expect(err?.cardName).toBe("*recaptcha+*site_key");
  });

  it("a grammar-passing key fires the event (alphanumerics, hyphens, underscores)", async () => {
    const report = await runValidate(settingChildRuntime(), {
      name: "*recaptcha+*site_key",
      dbContent: "6Lc-abc_123",
      recaptchaSettingChild: true,
    });
    expect(report.fired).toContain("validate_recaptcha_field");
  });

  it("a multi-line content passes when ANY line is a valid key (Ruby's line anchors)", async () => {
    const report = await runValidate(settingChildRuntime(), {
      name: "*recaptcha+*site_key",
      dbContent: "ok\nbad!",
      recaptchaSettingChild: true,
    });
    expect(report.fired).toContain("validate_recaptcha_field");
  });

  it("a card the set resolver excludes skips the event (set membership gates first, all.rb:16-22)", async () => {
    const report = await runValidate(settingChildRuntime(), {
      name: "*recaptcha+*site_key",
      dbContent: "bad key!",
      recaptchaSettingChild: false,
    });
    expect(report.fired).not.toContain("validate_recaptcha_field");
    expect(report.skipped).toContainEqual({
      event: "validate_recaptcha_field",
      reason: "set-not-applicable",
    });
  });

  it("a card IN the set whose guard input is absent skips on the when gate (recaptcha_setting? false)", async () => {
    const runtime: ModEventRuntime = {
      registry: recaptchaRegistry(),
      predicates: recaptchaModEventPredicates,
      setMember: (setPath) => setPath === "abstract/recaptcha_setting",
    };
    const report = await runValidate(runtime, {
      name: "*recaptcha+*site_key",
      dbContent: "bad key!",
      recaptchaSettingChild: undefined,
    });
    expect(report.fired).not.toContain("validate_recaptcha_field");
    expect(report.skipped).toContainEqual({
      event: "validate_recaptcha_field",
      reason: "when-false",
    });
  });

  it("ENGINE posture: without a setMember resolver the abstract-set event is skipped set-not-applicable", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const reports: ModEventStageReport[] = [];
    const runtime: ModEventRuntime = {
      registry: recaptchaRegistry(),
      predicates: recaptchaModEventPredicates,
      onReport: (r) => reports.push(r),
    };
    const engine = new CardActionEngine(storage.engine, {
      actor: JOE,
      ipAddress: "192.0.2.7",
      modEvents: runtime,
    });
    await engine.createCard({ name: "Plain Probe", content: "body" });
    const validate = reports.find((r) => r.stage === "validate");
    expect(validate?.skipped).toContainEqual({
      event: "validate_recaptcha_field",
      reason: "set-not-applicable",
    });
  });
});
