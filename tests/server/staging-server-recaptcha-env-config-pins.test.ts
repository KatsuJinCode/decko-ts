// Pins for the staging server's recaptcha host wiring. The write-route
// recaptcha seat originally armed the guard only when a HOST passed the
// config, and no production host did — these pins hold the env-config
// source and the boot wiring that close that gap.
//
// Two layers are pinned here, matching what can execute:
//
//   1. THE EXECUTABLE LAYER — src/server/staging-server-recaptcha-env-config.ts,
//      the env -> CardActionRecaptchaConfig source vm-staging-server.mjs calls
//      once at boot. Pinned as real calls: inert when the host supplies
//      nothing (undefined -> the host composes NO recaptcha field), pass-
//      through-UNCHANGED when it does (the route seat's contract),
//      blank-equals-unset, half-config arms through and lets the guard's own
//      recaptcha_keys? disarm it (recaptcha.rb:46-48), and a malformed
//      minimum_score fails loud at boot.
//
//   2. THE WIRING SITE — vm-staging-server.mjs. That file boots an HTTP
//      server unconditionally at import (server.listen at module top level),
//      so the composition cannot be called from a test; it is pinned as
//      source text instead: the exact import, the boot-time env read, and
//      the conditional spread inside dispatchWriteRequest's
//      handleWriteRequest context (the same engine-inputs bag as
//      attachmentStore). Single-line substrings, so line endings cannot
//      flip a pin.
//
// The armed guard's WIRE behavior (422 refusal on a failed verify, 303 on a
// human verdict, the rule-walk default resolving the deck's real *captcha
// rule) is the route seat's own mock-free proof —
// tests/server/write-routes-recaptcha-seat.test.ts; nothing here
// duplicates it.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { recaptchaConfigFromHostEnv } from "../../src/server/staging-server-recaptcha-env-config.js";
import { recaptchaKeysPresent } from "../../src/card/mod-loader/mods/card-mod-recaptcha.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const STAGING_SERVER_PATH = path.join(REPO_ROOT, "vm-staging-server.mjs");

describe("recaptchaConfigFromHostEnv (the staging server's env-config source)", () => {
  it("(1) INERT default: no env keys -> undefined — the host composes no recaptcha field", () => {
    expect(recaptchaConfigFromHostEnv({})).toBeUndefined();
    expect(recaptchaConfigFromHostEnv({ DECKO_FILES_DIR: "/somewhere" })).toBeUndefined();
  });

  it("(2) both keys present -> the config passes through UNCHANGED; the engine defaults stand (no captchaRuleContent, no verify, no minimumScore, no verifyUrl keys)", () => {
    const config = recaptchaConfigFromHostEnv({
      DECKO_RECAPTCHA_SITE_KEY: "site-6Lc",
      DECKO_RECAPTCHA_SECRET_KEY: "secret-0x4",
    });
    expect(config).toEqual({ siteKey: "site-6Lc", secretKey: "secret-0x4" });
    expect(config).not.toHaveProperty("captchaRuleContent"); // the deck's rule walk is the source
    expect(config).not.toHaveProperty("verify"); // the real siteverify GET is the transport
    expect(config).not.toHaveProperty("minimumScore"); // engine default 0.5 stands
    expect(config).not.toHaveProperty("verifyUrl"); // engine default URL stands
  });

  it("(3) blank / whitespace-only values are UNSET — a blank key can never arm the guard", () => {
    expect(
      recaptchaConfigFromHostEnv({ DECKO_RECAPTCHA_SITE_KEY: "", DECKO_RECAPTCHA_SECRET_KEY: "" }),
    ).toBeUndefined();
    expect(
      recaptchaConfigFromHostEnv({
        DECKO_RECAPTCHA_SITE_KEY: "   ",
        DECKO_RECAPTCHA_SECRET_KEY: "\t\n",
      }),
    ).toBeUndefined();
  });

  it("(4) half config arms THROUGH (Ruby's config model): siteKey alone composes, and the guard's own recaptcha_keys? disarms it", () => {
    const siteOnly = recaptchaConfigFromHostEnv({ DECKO_RECAPTCHA_SITE_KEY: "site-6Lc" });
    expect(siteOnly).toEqual({ siteKey: "site-6Lc", secretKey: undefined });
    // recaptcha.rb:46-48 (card-mod-recaptcha.ts:228-235): keys? = site && secret
    expect(recaptchaKeysPresent(siteOnly?.siteKey, siteOnly?.secretKey)).toBe(false);
    const secretOnly = recaptchaConfigFromHostEnv({ DECKO_RECAPTCHA_SECRET_KEY: "secret-0x4" });
    expect(recaptchaKeysPresent(secretOnly?.siteKey, secretOnly?.secretKey)).toBe(false);
    // ...and the fully-keyed config reads as armed to the same predicate.
    const both = recaptchaConfigFromHostEnv({
      DECKO_RECAPTCHA_SITE_KEY: "k",
      DECKO_RECAPTCHA_SECRET_KEY: "s",
    });
    expect(recaptchaKeysPresent(both?.siteKey, both?.secretKey)).toBe(true);
  });

  it("(5) the optional Cardio.config keys ride through when set: minimumScore parses to a number, verifyUrl passes trimmed", () => {
    const config = recaptchaConfigFromHostEnv({
      DECKO_RECAPTCHA_SITE_KEY: "k",
      DECKO_RECAPTCHA_SECRET_KEY: "s",
      DECKO_RECAPTCHA_MINIMUM_SCORE: "0.7",
      DECKO_RECAPTCHA_VERIFY_URL: "https://proxy.example/recaptcha/siteverify",
    });
    expect(config?.minimumScore).toBe(0.7);
    expect(config?.verifyUrl).toBe("https://proxy.example/recaptcha/siteverify");
  });

  it("(6) malformed minimum score fails LOUD (boot-fail contract, never a silently mis-armed guard)", () => {
    expect(() =>
      recaptchaConfigFromHostEnv({
        DECKO_RECAPTCHA_SITE_KEY: "k",
        DECKO_RECAPTCHA_SECRET_KEY: "s",
        DECKO_RECAPTCHA_MINIMUM_SCORE: "half",
      }),
    ).toThrowError(/DECKO_RECAPTCHA_MINIMUM_SCORE="half"/);
    expect(() =>
      recaptchaConfigFromHostEnv({
        DECKO_RECAPTCHA_SITE_KEY: "k",
        DECKO_RECAPTCHA_SECRET_KEY: "s",
        DECKO_RECAPTCHA_MINIMUM_SCORE: "Infinity",
      }),
    ).toThrowError(/not a finite number/);
  });
});

describe("vm-staging-server.mjs wiring (source pins — the file boots on import)", () => {
  const source = readFileSync(STAGING_SERVER_PATH, "utf8");

  it("(7) imports the env-config source from the compiled module", () => {
    expect(source).toContain(
      `import { recaptchaConfigFromHostEnv } from "./dist/src/server/staging-server-recaptcha-env-config.js";`,
    );
  });

  it("(8) reads the host env ONCE at boot, beside the other engine inputs (attachmentStore)", () => {
    // the read rides the boot composition: env keys when ops sets them, the
    // gem's DEVELOPMENT default pair otherwise (lib/card/mod/recaptcha.rb
    // @defaults through recaptcha_setting_value's card -> config ->
    // deprecated -> default chain) — a stock decko boot is armed, and the
    // anonymous create journeys hit the captcha guard exactly as the
    // recorded oracle journey pins.
    expect(source).toContain(
      "const recaptchaConfig =\n  recaptchaConfigFromHostEnv(process.env) ?? {",
    );
    expect(source).toContain("siteKey: \"6Lc3c-EoAAAAALnzfnHIWb5Rqy-rNui8l8qsguYG\"");
    // the read sits in the boot block, after the attachment store it peers at
    const attachmentStoreAt = source.indexOf("const attachmentStore = new LocalAttachmentStore(");
    const bootReadAt = source.indexOf("recaptchaConfigFromHostEnv(process.env)");
    expect(attachmentStoreAt).toBeGreaterThan(-1);
    expect(bootReadAt).toBeGreaterThan(attachmentStoreAt);
    // the FORM side of the guard reads the same config through the render
    // seam (card-mod-edit createCardForm's gate); absent, no form arms.
    expect(source).toContain("setRenderRecaptchaConfig(recaptchaConfig);");
  });

  it("(9) dispatchWriteRequest composes the seat into handleWriteRequest's context — present when armed, ABSENT (byte-identical shape) when inert", () => {
    const dispatchAt = source.indexOf("async function dispatchWriteRequest(");
    const handleAt = source.indexOf("return handleWriteRequest(", dispatchAt);
    const spreadAt = source.indexOf(
      "...(recaptchaConfig === undefined ? {} : { recaptcha: recaptchaConfig }),",
      handleAt,
    );
    const storeAt = source.indexOf("attachmentStore,", handleAt);
    const renderSlotAt = source.indexOf("renderSlot:", handleAt);
    for (const [name, at] of [
      ["dispatchWriteRequest", dispatchAt],
      ["handleWriteRequest call", handleAt],
      ["recaptcha spread", spreadAt],
      ["attachmentStore in the same bag", storeAt],
      ["renderSlot after the spread", renderSlotAt],
    ] as const) {
      expect(at).toBeGreaterThan(-1);
    }
    // the seat rides the SAME engine-inputs bag: attachmentStore first, the
    // spread before renderSlot closes the object
    expect(storeAt).toBeLessThan(spreadAt);
    expect(spreadAt).toBeLessThan(renderSlotAt);
  });
});
