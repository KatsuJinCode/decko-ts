// set_recaptcha_site_key (completeness register, events table row
// card-mod-recaptcha; register verdict PARTIAL "body disposition not
// individually audited this pass").
//
// Ruby source, read this session at
// C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems/card-mod-recaptcha-0.20.0/set/abstract/recaptcha_setting.rb:
//
//   recaptcha_setting.rb:7-9
//     event :set_recaptcha_site_key, :finalize, when: :recaptcha_setting? do
//       Card.config.send "recaptcha_#{codename}=", content
//     end
//
//   recaptcha_setting.rb:11-13
//     def recaptcha_setting?
//       left&.codename == :recaptcha_settings
//     end
//
// DISPOSITION: SKIPPED BY NAME — a real divergence, not a stub-shaped gap.
//
// Ruby's body writes the setting card's content into the deck's RUNTIME
// config at :finalize. In Ruby that is load-bearing: the :recaptcha event's
// own guard reads `recaptcha_keys?` off the same config on the next
// anonymous save (set/all/recaptcha.rb:46-48), so saving the setting card
// arms or disarms the guard with no restart. Ruby's Card.config is
// process-global mutable state.
//
// The port has no such state. The guard's config is COMPOSITION INPUT,
// passed unchanged into every write engine the host builds
// (write-routes.ts CardActionRecaptchaConfig) and sourced at BOOT from the
// host environment (staging-server-recaptcha-env-config.ts:
// DECKO_RECAPTCHA_SITE_KEY / _SECRET_KEY / _MINIMUM_SCORE / _VERIFY_URL).
// Nothing on a card save writes it — grepping the engine for a
// card-driven recaptcha_* assignment returns nothing but the read sites.
//
// So the fn is the honest no-op and the divergence is NAMED, not faked: a
// body here would either be unreachable (writing to a config object the
// guard does not read) or would require re-architecting the host
// composition from boot-time input to live mutable state. Per the parity
// law: name it and skip it.
//
// What this test DOES pin is the part that is Ruby-faithful and could
// still rot: the declaration, the gate predicate's semantics, and the fact
// that the guard still reads the port's own config surface — so if a future
// lane wires live card-driven config, this test breaks and the disposition
// is re-examined instead of silently rotting.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ModLoader } from "../../../src/card/mod-loader.js";
import type { DeckoModManifest } from "../../../src/card/mod-loader/mod-manifest.js";
import cardModRecaptcha from "../../../src/card/mod-loader/mods/card-mod-recaptcha.js";
import { defaultDeckEventRuntime } from "../../../src/card/mod-loader/default-mod-deck.js";

/** Every event declaration in a manifest, flattened with its set path. */
function declaredEvents(
  mod: DeckoModManifest,
): Array<{ setPath: string } & Record<string, unknown>> {
  const out: Array<{ setPath: string } & Record<string, unknown>> = [];
  for (const file of mod.setModules ?? []) {
    for (const event of file.events ?? []) {
      out.push({ setPath: file.setPath, ...(event as unknown as Record<string, unknown>) });
    }
  }
  return out;
}

function recaptchaSource(): string {
  return readFileSync(
    new URL("../../../src/card/mod-loader/mods/card-mod-recaptcha.ts", import.meta.url),
    "utf8",
  );
}

describe("set_recaptcha_site_key (recaptcha_setting.rb:7-9)", () => {
  it("is registered at :finalize, gated on recaptcha_setting?, with no on clause", () => {
    const decl = declaredEvents(cardModRecaptcha).find((d) => d.event === "set_recaptcha_site_key");
    expect(decl, "set_recaptcha_site_key not declared").toBeDefined();
    expect(decl!.setPath).toBe("abstract/recaptcha_setting");
    expect(decl!.at).toBe("finalize");
    expect(decl!.when).toBe("recaptcha_setting?");
    // Ruby declares no :on on this event.
    expect(decl!.on).toBeUndefined();
  });

  it("reaches the deck's finalize stage", () => {
    const finalize = defaultDeckEventRuntime().registry.forStage("finalize");
    expect(finalize.some((e) => e.event === "set_recaptcha_site_key")).toBe(true);
  });

  it("the gate predicate keeps Ruby's semantics: the LEFT card's codename is recaptcha_settings (recaptcha_setting.rb:11-13)", () => {
    const runtime = defaultDeckEventRuntime();
    const predicate = runtime.predicates?.["recaptcha_setting?"];
    expect(predicate, "the recaptcha_setting? predicate is missing from the deck table").toBeDefined();
    expect(predicate!({ name: "Whatever" }, undefined)).toBe(false);
    expect(
      predicate!({ name: "Whatever", recaptchaSettingChild: true } as never, undefined),
      "the predicate ignored the recaptcha_settings left card",
    ).toBe(true);
  });
});

describe("the SKIP-BY-NAME divergence, pinned so it cannot rot silently", () => {
  it("the fn is the honest no-op — no faked partial implementation", () => {
    const decl = declaredEvents(cardModRecaptcha).find((d) => d.event === "set_recaptcha_site_key");
    expect(typeof decl!.fn).toBe("function");
    expect((decl!.fn as () => unknown)()).toBeUndefined();
  });

  it("the divergence is NAMED at the registration, with the mechanism", () => {
    const src = recaptchaSource();
    expect(src).toMatch(/SKIPPED BY NAME|DIVERGENCE/);
    // the reason must name the real mechanism: boot-time env composition
    // vs Ruby's process-global mutable Card.config.
    expect(src).toMatch(/Card\.config|config\.send/);
    expect(src).toMatch(/boot|environment|composition input/i);
  });

  it("no card-driven write to the recaptcha config exists anywhere in the engine", () => {
    // The DIVERGENCE's own falsification condition: if a lane ever adds an
    // assignment of recaptcha_site_key / recaptcha_secret_key from a saved
    // card, this test fails and the skip must be re-examined.
    const engine = readFileSync(
      new URL("../../../src/card/actions/card-action-engine.ts", import.meta.url),
      "utf8",
    );
    const assignments = engine.match(
      /\.(?:recaptcha_site_key|recaptcha_secret_key)\s*=\s*(?!=)/g,
    );
    expect(assignments, "a card-driven recaptcha config write appeared — re-examine the skip").toBeNull();
  });

  it("the guard still reads the port's own config surface (so the skip has a stated substitute)", () => {
    // recaptcha_keys? stands in for Card.config's presence: with no
    // configured keys the guard is disarmed, which is the port's
    // equivalent of Ruby's config simply not holding a key yet.
    const src = recaptchaSource();
    expect(src).toMatch(/recaptcha_keys\?/);
    const engine = readFileSync(
      new URL("../../../src/card/actions/card-action-engine.ts", import.meta.url),
      "utf8",
    );
    expect(engine).toMatch(/siteKey/);
    expect(engine).toMatch(/secretKey/);
  });

  it("the boot-time provenance is still the environment, as documented", () => {
    const boot = readFileSync(
      new URL("../../../src/server/staging-server-recaptcha-env-config.ts", import.meta.url),
      "utf8",
    );
    expect(boot).toContain("DECKO_RECAPTCHA_SITE_KEY");
    expect(boot).toContain("DECKO_RECAPTCHA_SECRET_KEY");
  });
});
