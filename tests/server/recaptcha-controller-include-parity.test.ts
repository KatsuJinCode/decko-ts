// The recaptcha mod's controller include and its keying ladder, measured
// against the PINNED DECK's own mod file and the PINNED recaptcha gem.
//
// The completeness register's B14 row grades the port on
// `CardController.include ::Recaptcha::Verify`
// (card-mod-recaptcha-0.20.0/config/late/recaptcha.rb:70) and on the keying
// that include rides: the site/secret config comes from card content, from
// the config, from the deprecated config name, or from the development
// defaults (the same file at :26-68).
//
// This file pins both sides:
//
//   fixtures/captured/recaptcha-controller-include-ruby-oracle.json is what
//   oracle-capture-recaptcha-controller-include-ruby.rb (tests/server/)
//   recorded by EXECUTING the PINNED boot path and the PINNED keying:
//
//     the include  the capture fires the PINNED recaptcha gem's own
//                  on_load(:action_controller) hook (railtie.rb:10-13) the
//                  way a Rails boot fires it, then evaluates the PINNED
//                  deck mod's file, whose last line is the include. The
//                  recorded facts: CardController includes
//                  Recaptcha::Verify, verify_recaptcha and
//                  verify_recaptcha! are owned by Recaptcha::Verify, and
//                  the BASE class already includes it - so in a Rails boot
//                  the deck's include is REDUNDANT and still runs.
//     the keying   the ladder runs four times and the fixture records
//                  WHICH rung won each time, never a value: the default
//                  (with using_defaults? true), the config, the deprecated
//                  config name, and the card content (with the card lookup
//                  it caused recorded).
//
//   NO VALUE LEAVES THE CAPTURE: the development defaults are deployment
//   configuration, so the fixture records their KEYS only.
//
//   The port's side: the port carries the same keying ladder
//   (src/card/mod-loader/mods/card-mod-recaptcha.ts,
//   recaptchaSettingValue), the same using_defaults? check
//   (usingDefaults), the same recaptcha_keys? (recaptchaKeysPresent) and a
//   host-env key source (src/server/staging-server-recaptcha-env-config.ts,
//   recaptchaConfigFromHostEnv) that is INERT by default - no keys means no
//   config, and no config means the guard is disarmed.
//
//   The port carries the guard as a SAVE-TIME guard, not as a controller
//   filter - that is the port's own structural choice, and the armed
//   behavior is the port's own suite
//   (tests/server/write-routes-recaptcha-seat.test.ts and
//   tests/server/write-routes-recaptcha-armed-update-delete.test.ts). This
//   row pins the keying and the arming predicate, which is what the pinned
//   side of the row measures.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  RECAPTCHA_DEPRECATED_CONFIG_NAMES,
  recaptchaKeysPresent,
  recaptchaSettingValue,
  usingDefaults,
} from "../../src/card/mod-loader/mods/card-mod-recaptcha.js";
import { recaptchaConfigFromHostEnv } from "../../src/server/staging-server-recaptcha-env-config.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/recaptcha-controller-include-ruby-oracle.json"), "utf8"),
) as {
  include: {
    controllerIncludesVerify: boolean;
    verifyRecaptchaOwner: string;
    verifyRecaptchaBangOwner: string;
    baseIncludesVerify: boolean;
    includeLine: string;
  };
  keying: Array<{
    label: string;
    error: string | null;
    source: string;
    usingDefaults: boolean;
    codenamesPresent: string[];
    cardLookups: string[];
  }>;
  defaultsKeys: string[];
  deprecatedNames: { site_key: string; secret_key: string };
  rigArtifacts: string[];
  sources: Record<string, Array<{ line: number; text: string }>>;
};

describe("the recaptcha controller include, against the pinned deck gem", () => {
  it("the pinned include gives the controller the PINNED gem's verify methods", () => {
    expect(ORACLE.include.controllerIncludesVerify).toBe(true);
    expect(ORACLE.include.verifyRecaptchaOwner).toBe("Recaptcha::Verify");
    expect(ORACLE.include.verifyRecaptchaBangOwner).toBe("Recaptcha::Verify");
    // The line itself, quoted from the PINNED mod file.
    const boot = ORACLE.sources["includeAndBoot"]!.map((row) => row.text).join("\n");
    expect(boot).toContain("CardController.include ::Recaptcha::Verify");
  });

  it("the include is REDUNDANT in a Rails boot, and it still runs", () => {
    // The PINNED gem's own railtie includes Verify into ActionController::Base
    // through ActiveSupport.on_load(:action_controller) (railtie.rb:10-13),
    // and CardController is a subclass of it.
    expect(ORACLE.include.baseIncludesVerify).toBe(true);
    const railtie = ORACLE.sources["pinnedRailtie"]!.map((row) => row.text).join("\n");
    expect(railtie).toContain("ActiveSupport.on_load(:action_controller)");
    expect(railtie).toContain("include Recaptcha::Verify");
  });

  it("the pinned verify method is the gem's own, and it is the one the include brings", () => {
    const verify = ORACLE.sources["pinnedVerify"]!.map((row) => row.text).join("\n");
    expect(verify).toContain("def verify_recaptcha(options = {})");
    expect(verify).toContain("def verify_recaptcha!(options = {})");
  });
});

describe("the keying ladder, against the pinned deck gem", () => {
  it("four rungs, in order: card content, config, deprecated config, default", () => {
    const keying = ORACLE.sources["keying"]!.map((row) => row.text).join("\n");
    expect(keying).toContain("card_value(full_setting) ||");
    expect(keying).toContain("config_value(full_setting) ||");
    expect(keying).toContain("config_value(@deprecated[setting]) ||");
    expect(keying).toContain("@defaults[setting]");
  });

  it("the measured rungs: the default, the config, the deprecated config name, the card content", () => {
    expect(ORACLE.keying.map((row) => row.source)).toEqual([
      "default",
      "config",
      "deprecatedConfig",
      "cardContent",
    ]);
    expect(ORACLE.keying.every((row) => row.error === null)).toBe(true);
    // The card rung's guard: the pinned card_value asks for TWO codenames
    // (the settings card and the setting's own name) before it reads the
    // card, and the recorded card lookup is the setting's name.
    const cardRung = ORACLE.keying[3]!;
    expect(cardRung.codenamesPresent).toEqual(["recaptcha_settings", "recaptcha_site_key"]);
    expect(cardRung.cardLookups).toEqual(["recaptcha_site_key"]);
  });

  it("using_defaults? is true only for the development default", () => {
    expect(ORACLE.keying[0]!.usingDefaults).toBe(true);
    expect(ORACLE.keying[1]!.usingDefaults).toBe(false);
    expect(ORACLE.keying[2]!.usingDefaults).toBe(false);
    expect(ORACLE.keying[3]!.usingDefaults).toBe(false);
  });

  it("the deprecated config NAMES and the defaults' KEYS are recorded, and no value is", () => {
    expect(ORACLE.deprecatedNames).toEqual({
      site_key: "recaptcha_public_key",
      secret_key: "recaptcha_private_key",
    });
    expect(ORACLE.defaultsKeys).toEqual(["site_key", "secret_key"]);
    const serialized = JSON.stringify(ORACLE);
    // The development pair is deployment configuration and never reaches
    // the fixture; the capture compares it and records only the source.
    expect(serialized).not.toContain("6Lc");
  });

  it("the guard is armed by BOTH keys (recaptcha.rb:46-48), and the fixture quotes it", () => {
    const keys = ORACLE.sources["pinnedKeysGuard"]!.map((row) => row.text).join("\n");
    expect(keys).toContain("def recaptcha_keys?");
    expect(keys).toContain("Card.config.recaptcha_site_key && Card.config.recaptcha_secret_key");
  });
});

describe("the port's keying, against the pinned keying", () => {
  it("the port's ladder has the same precedence: card content, config, deprecated config, default", () => {
    expect(recaptchaSettingValue("FROM-CARD", "FROM-CONFIG", "FROM-DEPRECATED")).toBe("FROM-CARD");
    expect(recaptchaSettingValue(undefined, "FROM-CONFIG", "FROM-DEPRECATED")).toBe("FROM-CONFIG");
    expect(recaptchaSettingValue(undefined, undefined, "FROM-DEPRECATED")).toBe("FROM-DEPRECATED");
    expect(recaptchaSettingValue(undefined, undefined, undefined, "site_key", {
      site_key: "FROM-DEFAULT",
    })).toBe("FROM-DEFAULT");
  });

  it("the port's ladder skips blank values, the pinned `value if value.present?`", () => {
    expect(recaptchaSettingValue("", "FROM-CONFIG", "FROM-DEPRECATED")).toBe("FROM-CONFIG");
    expect(recaptchaSettingValue(null, null, "")).toBeUndefined();
  });

  it("the port's using_defaults? is the pinned comparison", () => {
    expect(usingDefaults("FROM-DEFAULT", "FROM-DEFAULT")).toBe(true);
    expect(usingDefaults("FROM-CONFIG", "FROM-DEFAULT")).toBe(false);
    // The port's own note: an absent resolution still counts as using the
    // default (Ruby's nil == nil).
    expect(usingDefaults(undefined, undefined)).toBe(true);
  });

  it("the port's recaptcha_keys? needs BOTH keys, so an absent config disarms the guard", () => {
    expect(recaptchaKeysPresent(undefined, undefined)).toBe(false);
    expect(recaptchaKeysPresent("SITE", undefined)).toBe(false);
    expect(recaptchaKeysPresent(undefined, "SECRET")).toBe(false);
    expect(recaptchaKeysPresent("SITE", "SECRET")).toBe(true);
  });

  it("the port's key source is INERT by default: no host keys means no config at all", () => {
    expect(recaptchaConfigFromHostEnv({})).toBeUndefined();
    expect(recaptchaConfigFromHostEnv({ DECKO_RECAPTCHA_SITE_KEY: "   " })).toBeUndefined();
    const armed = recaptchaConfigFromHostEnv({
      DECKO_RECAPTCHA_SITE_KEY: "SITE",
      DECKO_RECAPTCHA_SECRET_KEY: "SECRET",
    });
    expect(armed?.siteKey).toBe("SITE");
    expect(armed?.secretKey).toBe("SECRET");
    // The half-configured host composes the config unchanged; the guard's
    // own recaptcha_keys? disarms it.
    expect(recaptchaKeysPresent(armed?.siteKey, armed?.secretKey)).toBe(true);
  });

  it("the port carries the deprecated config names the pinned ladder falls back to", () => {
    expect(RECAPTCHA_DEPRECATED_CONFIG_NAMES.site_key).toBe("recaptcha_public_key");
    expect(RECAPTCHA_DEPRECATED_CONFIG_NAMES.secret_key).toBe("recaptcha_private_key");
    expect(ORACLE.deprecatedNames.site_key).toBe(RECAPTCHA_DEPRECATED_CONFIG_NAMES.site_key);
    expect(ORACLE.deprecatedNames.secret_key).toBe(RECAPTCHA_DEPRECATED_CONFIG_NAMES.secret_key);
  });
});
