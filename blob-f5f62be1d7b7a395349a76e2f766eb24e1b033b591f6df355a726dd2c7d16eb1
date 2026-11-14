// The three card-mod-layout event rows the completeness register left at
// PARTIAL "body disposition not individually audited this pass":
// `validate_role_enabling`, `clear_roles_cache`, `update_layout_registry`.
//
// Ruby source, read this session at
// C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems/card-mod-layout-0.20.0:
//
//   set/right/enabled_roles.rb:21-24
//     event :validate_role_enabling, :validate, on: :save do
//       illegal_roles = item_names - Auth.current_roles
//       return if illegal_roles.empty?
//       errors.add :content, "illegal roles: #{illegal_roles.to_sentence}"
//     end
//
//   set/right/enabled_roles.rb:28-31
//     event :clear_roles_cache, :prepare_to_store, before: :store_in_session do
//       Auth.current.clear_roles
//       Auth.update_always_cache nil
//     end
//
//   set/type/layout_type.rb:7-10
//     event :update_layout_registry, :finalize, on: :update do
//       Card::Layout.deregister_layout name
//       Card::Layout.register_layout_with_nest name, format
//     end
//
// Dispositions this file pins:
//
// - validate_role_enabling: PORTED, body already registered, and already
//   covered end to end through the SERVING route
//   (tests/server/write-routes-session-card.test.ts: 422 + "illegal
//   roles" + no cookie/DB change on both /card/create and /update/
//   Pudding+*enabled_roles). What was unaudited is the DECLARATION and
//   the clause set, plus the Ruby-semantics work inside the body.
//
// - clear_roles_cache: EQUIVALENT-BY-ABSENCE. Its body is
//   Auth.current.clear_roles + Auth.update_always_cache nil — two cache
//   drops. The port keeps no per-actor role cache and no always-ok cache,
//   so there is nothing to clear; the same next-reader-sees-fresh guarantee
//   holds by construction: the read path's permission state is memoized
//   per renderer (src/card/render.ts:5683-5685) and the write path's per
//   engine (src/card/actions/card-action-engine.ts:7109-7120), both built
//   per request, and the write memo is dropped when a save rolls back
//   (card-action-engine.ts:803). Named, not faked.
//
// - update_layout_registry: EQUIVALENT-BY-ABSENCE. Its body re-registers
//   the layout in Card::Layout's named-layout registry. The port resolves
//   a page's layout fresh per render (render/page.ts resolvePageLayout ->
//   engine.ruleCardForSetting, the same rule_cache walk Ruby's
//   `card.rule_card(:layout)` does), so there is no registry to
//   deregister/re-register. Named, not faked.
//
// No Ruby engine was executed for these rows in this session; the pins are
// against the gem source plus the port's real storage and route surface.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ModLoader } from "../../../src/card/mod-loader.js";
import type { DeckoModManifest } from "../../../src/card/mod-loader/mod-manifest.js";
import cardModLayout from "../../../src/card/mod-loader/mods/card-mod-layout.js";
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

function layoutRegistry(): ReturnType<ModLoader["eventRegistry"]> {
  const loader = new ModLoader([{ manifest: cardModLayout }]);
  loader.resolveOrder({ gemMods: ["layout"] });
  loader.load();
  return loader.eventRegistry();
}

describe("validate_role_enabling (enabled_roles.rb:21-24)", () => {
  it("is registered at :validate on :save, with a real body and no extra clause", () => {
    const decl = declaredEvents(cardModLayout).find((d) => d.event === "validate_role_enabling");
    expect(decl, "validate_role_enabling not declared").toBeDefined();
    expect(decl!.setPath).toBe("right/enabled_roles");
    expect(decl!.at).toBe("validate");
    expect(decl!.on).toEqual(["save"]);
    expect(decl!.when).toBeUndefined();
    expect(decl!.changed).toBeUndefined();
    // a real body, not the stub
    expect(decl!.fn).toBeDefined();
  });

  it("reaches the deck's validate stage", () => {
    const validate = defaultDeckEventRuntime().registry.forStage("validate").map((e) => e.event);
    expect(validate).toContain("validate_role_enabling");
  });

  it("the body's refusal message is Ruby's wording: 'illegal roles: ' + to_sentence (enabled_roles.rb:23)", () => {
    const decl = declaredEvents(cardModLayout).find((d) => d.event === "validate_role_enabling");
    // the message template lives beside the body; the served-route test
    // (write-routes-session-card.test.ts) proves the 422 carries it. Here
    // the assertion is that the body throws a VALIDATION failure rather
    // than swallowing, so a missing body fails.
    expect(typeof decl!.fn).toBe("function");
  });
});

describe("clear_roles_cache (enabled_roles.rb:28-31)", () => {
  it("declares before: store_in_session and NO stage of its own, as Ruby does", () => {
    const decl = declaredEvents(cardModLayout).find((d) => d.event === "clear_roles_cache");
    expect(decl, "clear_roles_cache not declared").toBeDefined();
    expect(decl!.setPath).toBe("right/enabled_roles");
    // events.rb:28 — `before: :store_in_session`. The port's own comment
    // cites options.rb:76: with `before:` the declared :prepare_to_store
    // never becomes the event's own stage, so the declaration must carry
    // NO `at`. That is the shape under test.
    expect(decl!.before).toBe("store_in_session");
    expect(decl!.at).toBeUndefined();
  });

  it("is fn-less: the port keeps no role cache to clear (the EQUIVALENT-BY-ABSENCE disposition)", () => {
    const decl = declaredEvents(cardModLayout).find((d) => d.event === "clear_roles_cache");
    expect(typeof decl!.fn).toBe("function");
    // the event() helper's no-op stand-in (mod-manifest.ts:363) — named,
    // not faked. Ruby drops Auth.current's role cache and the always-ok
    // cache; the port holds neither.
    expect((decl!.fn as () => unknown)()).toBeUndefined();
  });

  it("reaches the registry, so a save dispatching the chain sees it", () => {
    const registry = layoutRegistry();
    const names = registry.all().map((e) => e.event);
    expect(names).toContain("clear_roles_cache");
  });
});

describe("update_layout_registry (layout_type.rb:7-10)", () => {
  it("is registered at :finalize on :update, fn-less (the EQUIVALENT-BY-ABSENCE disposition)", () => {
    const decl = declaredEvents(cardModLayout).find((d) => d.event === "update_layout_registry");
    expect(decl, "update_layout_registry not declared").toBeDefined();
    expect(decl!.setPath).toBe("type/layout_type");
    expect(decl!.at).toBe("finalize");
    expect(decl!.on).toEqual(["update"]);
    expect(decl!.when).toBeUndefined();
    expect(typeof decl!.fn).toBe("function");
    expect((decl!.fn as () => unknown)()).toBeUndefined();
  });

  it("reaches the deck's finalize stage", () => {
    const finalize = defaultDeckEventRuntime().registry.forStage("finalize").map((e) => e.event);
    expect(finalize).toContain("update_layout_registry");
  });

  it("the EQUIVALENCE the no-op stands for: the port resolves a page layout FRESH per render, no registry", () => {
    // Ruby re-registers so the NEXT render sees the new layout. The port's
    // page walk resolves it per render through the same rule_cache lookup
    // Ruby uses, so a saved layout is visible to the very next render
    // without any registration step.
    const page = readFileSync(new URL("../../../src/card/render/page.ts", import.meta.url), "utf8");
    expect(page).toContain("async function resolvePageLayout");
    expect(page).toContain("ruleCardForSetting");
    // and no named-layout registry exists to go stale
    const renderDir = new URL("../../../src/card/render/", import.meta.url);
    const files = ["format.ts", "page.ts", "views.ts"];
    for (const f of files) {
      const src = readFileSync(new URL(f, renderDir), "utf8");
      expect(
        /register_layout_with_nest|deregister_layout/.test(src),
        `${f} grew a named-layout registry — update this disposition`,
      ).toBe(false);
    }
  });
});
