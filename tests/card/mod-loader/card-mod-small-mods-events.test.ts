// Event declarations for the nine small mods: assets (5), content (3),
// layout (3), session (3), follow (3), recaptcha (2), api_key (2),
// bootstrap (2), rules (1) - every event these mods ship.
//
// Shape (per mod):
//   WITHOUT the mod: a mod-less loader's event registry holds none of the
//     names (the declarations live in the manifests; a bare loader fails
//     here).
//   WITH the mod: the names declare from their gem set files with the
//     gem's verbatim metadata. Engine-owned events cite the engine
//     runner at the declaration; stubs carry per-event reasons there.
//   BEHAVIOR: recaptcha's validate_recaptcha_field pure predicate
//     (recaptchaFieldContentError - the portable half the manifest's
//     header names) is pinned against the Ruby grammar.

import { describe, it, expect, afterAll } from "vitest";
import { ModLoader } from "../../../src/card/mod-loader.js";
import type { DeckoModManifest } from "../../../src/card/mod-loader/mod-manifest.js";
import cardModAssets from "../../../src/card/mod-loader/mods/card-mod-assets.js";
import cardModContent from "../../../src/card/mod-loader/mods/card-mod-content.js";
import cardModLayout from "../../../src/card/mod-loader/mods/card-mod-layout.js";
import cardModSession from "../../../src/card/mod-loader/mods/card-mod-session.js";
import cardModFollow from "../../../src/card/mod-loader/mods/card-mod-follow.js";
import cardModRecaptcha, {
  recaptchaFieldContentError,
} from "../../../src/card/mod-loader/mods/card-mod-recaptcha.js";
import cardModApiKey from "../../../src/card/mod-loader/mods/card-mod-api_key.js";
import cardModBootstrap from "../../../src/card/mod-loader/mods/card-mod-bootstrap.js";
import cardModRules from "../../../src/card/mod-loader/mods/card-mod-rules.js";

/** Every event declaration in a manifest, flattened with the set path. */
function declaredEvents(mod: DeckoModManifest): Array<{ setPath: string } & Record<string, unknown>> {
  const out: Array<{ setPath: string } & Record<string, unknown>> = [];
  for (const file of mod.setModules ?? []) {
    for (const event of file.events ?? []) {
      out.push({ setPath: file.setPath, ...(event as unknown as Record<string, unknown>) });
    }
  }
  return out;
}

/** The empty manifest stand-in for the WITHOUT arm. */
const EMPTY_MANIFEST: DeckoModManifest = { name: "eventless", group: "gem-defaults", setModules: [] };

let loader: ModLoader | undefined;
afterAll(() => {
  loader?.reset();
});

/** The shared A/B: without the mod none of the names register; with it
 *  all do (from the right files, with the right metadata, asserted by the
 *  caller). */
function abPins(mod: DeckoModManifest, names: readonly string[]) {
  const bare = new ModLoader([{ manifest: EMPTY_MANIFEST }]);
  bare.load();
  const bareNames = bare.eventRegistry().all().map((e) => e.event);
  for (const name of names) expect(bareNames).not.toContain(name);
  bare.reset();

  const decls = declaredEvents(mod);
  const have = decls.map((d) => d.event as string);
  for (const name of names) {
    expect(have, `${name} missing from ${mod.name}`).toContain(name);
  }
  // no duplicate declarations of the pinned names (mods may carry OTHER,
  // earlier-landed events beyond this batch)
  for (const name of names) {
    expect(have.filter((n) => n === name).length).toBe(1);
  }

  loader = new ModLoader([{ manifest: mod }]);
  loader.load();
  const registry = loader.eventRegistry();
  for (const name of names) {
    const reg = registry.all().find((e) => e.event === name);
    expect(reg, `${name} not registered by the loader`).toBeDefined();
    expect(reg!.modName).toBe(mod.name);
  }
  loader.reset();
  return new Map(decls.map((d) => [d.event as string, d]));
}

describe("card-mod-assets events (5)", () => {
  const NAMES = [
    "update_asset_output_file",
    "validate_asset_inputs",
    "remove_codename",
    "asset_input_changed",
    "asset_input_changed_on_delete",
  ] as const;
  it("declares all five, A/B, verbatim metadata", () => {
    const byName = abPins(cardModAssets, NAMES);
    // asset_outputter.rb:6/:10
    expect(byName.get("update_asset_output_file")).toMatchObject({ at: "finalize", on: ["save"] });
    expect(byName.get("validate_asset_inputs")).toMatchObject({
      at: "validate",
      on: ["save"],
      skip: "allowed",
    });
    // asset_output.rb:13
    expect(byName.get("remove_codename")).toMatchObject({
      at: "prepare_to_validate",
      on: ["delete"],
      when: "codename?",
    });
    // asset_inputter.rb:24/:20
    expect(byName.get("asset_input_changed")).toMatchObject({
      at: "finalize",
      on: ["save"],
      when: "asset_inputter?",
      changed: ["content"],
      skip: "allowed",
    });
    expect(byName.get("asset_input_changed_on_delete")).toMatchObject({
      at: "finalize",
      on: ["delete"],
      when: "asset_inputter?",
    });
  });
  it("declares from the gem's set files", () => {
    const byFile = new Map(declaredEvents(cardModAssets).map((e) => [e.event as string, e.setPath as string]));
    expect(byFile.get("update_asset_output_file")).toBe("abstract/asset_outputter");
    expect(byFile.get("validate_asset_inputs")).toBe("abstract/asset_outputter");
    expect(byFile.get("remove_codename")).toBe("right/asset_output");
    expect(byFile.get("asset_input_changed")).toBe("abstract/asset_inputter");
    expect(byFile.get("asset_input_changed_on_delete")).toBe("abstract/asset_inputter");
  });
});

describe("card-mod-content events (3)", () => {
  it("declares all three, A/B, verbatim metadata", () => {
    const byName = abPins(cardModContent, [
      "update_structurees_references",
      "reset_cache_to_use_new_structure",
      "update_structurees_type",
    ]);
    // structure.rb:25/:38/:44
    expect(byName.get("update_structurees_references")).toMatchObject({
      at: "integrate",
      when: "update_structurees_references?",
    });
    expect(byName.get("reset_cache_to_use_new_structure")).toMatchObject({ at: "integrate" });
    expect(byName.get("update_structurees_type")).toMatchObject({ at: "finalize", changed: ["type_id"] });
  });
});

describe("card-mod-layout events (3)", () => {
  it("declares all three, A/B, verbatim metadata", () => {
    const byName = abPins(cardModLayout, [
      "update_layout_registry",
      "validate_role_enabling",
      "clear_roles_cache",
    ]);
    // layout_type.rb:7 / enabled_roles.rb:21/:28
    expect(byName.get("update_layout_registry")).toMatchObject({ at: "finalize", on: ["update"] });
    expect(byName.get("validate_role_enabling")).toMatchObject({ at: "validate", on: ["save"] });
    expect(byName.get("clear_roles_cache")).toMatchObject({ at: "prepare_to_store" });
  });
});

describe("card-mod-session events (3)", () => {
  it("declares all three, A/B, verbatim metadata", () => {
    const byName = abPins(cardModSession, [
      "delete_in_session",
      "discard_deleted_locations",
      "save_current_location",
    ]);
    // session.rb:42 / location_history.rb:1/:6
    expect(byName.get("delete_in_session")).toMatchObject({ at: "prepare_to_store", on: ["delete"] });
    expect(byName.get("discard_deleted_locations")).toMatchObject({ at: "finalize", on: ["delete"] });
    // save_current_location is a read-path event: no stage, no save trigger
    const read = byName.get("save_current_location")!;
    expect(read.at).toBeUndefined();
    expect(read.on).toBeUndefined();
  });
});

describe("card-mod-follow events (3)", () => {
  it("declares all three, A/B, verbatim metadata", () => {
    const byName = abPins(cardModFollow, [
      "cache_expired_for_new_preference",
      "follow_fields_changed",
      "update_follow_rules",
    ]);
    // right/follow.rb:7 / right/follow_fields.rb:3 / self/follow_defaults.rb:17
    expect(byName.get("cache_expired_for_new_preference")).toMatchObject({
      at: "integrate",
      when: "preference?",
    });
    expect(byName.get("follow_fields_changed")).toMatchObject({ at: "integrate" });
    expect(byName.get("update_follow_rules")).toMatchObject({
      at: "finalize",
      on: ["save"],
      trigger: "required",
    });
  });
});

describe("card-mod-recaptcha events (2)", () => {
  it("declares both, A/B, verbatim metadata", () => {
    const byName = abPins(cardModRecaptcha, ["validate_recaptcha_field", "set_recaptcha_site_key"]);
    // recaptcha_setting.rb:1/:7
    expect(byName.get("validate_recaptcha_field")).toMatchObject({ at: "validate", when: "recaptcha_setting?" });
    expect(byName.get("set_recaptcha_site_key")).toMatchObject({ at: "finalize", when: "recaptcha_setting?" });
  });
  it("validate_recaptcha_field's portable predicate matches the Ruby grammar", () => {
    // recaptcha_setting.rb:2-5: /^[a-zA-Z0-9\-_]*$/ passes; anything else
    // errors.add :content, "invalid key"
    expect(recaptchaFieldContentError("AIzaSyA1bC2dE3fG4hI5jK6lM7nO8pQ9rS0tU1v")).toBeUndefined();
    expect(recaptchaFieldContentError("6Lc-abC_dEfGhIjKlMnOpQrStUvWxYz0123456789")).toBeUndefined();
    expect(recaptchaFieldContentError("")).toBeUndefined(); // * matches empty
    expect(recaptchaFieldContentError("key with spaces")).toBe("invalid key");
    expect(recaptchaFieldContentError("key/with/slashes")).toBe("invalid key");
  });
});

describe("card-mod-api_key events (2)", () => {
  it("declares both, A/B, verbatim metadata", () => {
    const byName = abPins(cardModApiKey, ["generate_api_key", "validate_api_key"]);
    // api_key.rb:4/:8 (generate_api_key has NO on: — every action)
    expect(byName.get("generate_api_key")).toMatchObject({ at: "prepare_to_validate", trigger: "required" });
    expect(byName.get("generate_api_key")!.on).toBeUndefined();
    expect(byName.get("validate_api_key")).toMatchObject({
      at: "validate",
      on: ["save"],
      changed: ["content"],
    });
  });
});

describe("card-mod-bootstrap events (2)", () => {
  it("declares both, A/B, verbatim metadata", () => {
    const byName = abPins(cardModBootstrap, ["translate_variables_to_scss", "use_as_current_skin"]);
    // colors.rb:116 / type/bootswatch_skin.rb:180
    expect(byName.get("translate_variables_to_scss")).toMatchObject({
      at: "prepare_to_validate",
      on: ["update"],
    });
    expect(byName.get("use_as_current_skin")).toMatchObject({
      at: "finalize",
      on: ["save"],
      trigger: "required",
    });
  });
});

describe("card-mod-rules event (1)", () => {
  it("declares it, A/B, verbatim metadata, engine-owned", () => {
    const byName = abPins(cardModRules, ["save_recently_edited_settings"]);
    // rules.rb:1 `event :save_recently_edited_settings, :integrate,
    // on: :save, changed: %i[type content]` — engine:
    // card-action-engine.ts saveRecentlyEditedSettings.
    expect(byName.get("save_recently_edited_settings")).toMatchObject({
      at: "integrate",
      on: ["save"],
      changed: ["type", "content"],
    });
    const byFile = new Map(declaredEvents(cardModRules).map((e) => [e.event as string, e.setPath as string]));
    expect(byFile.get("save_recently_edited_settings")).toBe("rule/rules");
  });
});
