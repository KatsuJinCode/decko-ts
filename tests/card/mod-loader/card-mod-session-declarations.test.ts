// Register entry 29 (card-mod-session): the gem's declaration surface.
//
// card-mod-session-0.20.0 is the smallest mod in the pinned set: two set
// files, FOUR event declarations, ZERO views. Its only format block is a
// `before :core` HOOK (set/type/session.rb:59-63), which is not a view.
//
// Ground truth is extracted from the gem's own files by the committed script
// tests/card/mod-loader/oracle-capture-session-declarations.rb, which reads
// the `event :`, `view :` and `include_set` lines out of
// set/all/location_history.rb and set/type/session.rb. The measured result
// is committed as fixtures/session-declarations.json.
//
// What this pins:
//  1. The set-module set matches the gem tree exactly (2 paths).
//  2. Every Ruby event declaration is registered, on the right module, with
//     the stage and trigger Ruby gives it.
//  3. ZERO views - the gem declares none, so a view registration here would
//     be fabrication.
//  4. The register's claim that "the `before :core` hook itself is registered
//     in the same file" is FALSE against this tree, and there is no seam it
//     could be registered into: RenderFormat#runBeforeHook
//     (src/card/render/format.ts:1726) is a hardcoded per-view-name switch,
//     not a mod-registration surface. The gem's hook - and the effect Ruby
//     gives it, a Session card's :core rendering its pointer items as NAMES -
//     is a named remainder.
//
// Ruby lines, read this session:
//   set/all/location_history.rb:1  event :discard_deleted_locations, :finalize, on: :delete
//   set/all/location_history.rb:6  event :save_current_location, before: :show_page, on: :read
//   set/type/session.rb:37          event :store_in_session, :prepare_to_store, on: :save
//   set/type/session.rb:42          event :delete_in_session, :prepare_to_store, on: :delete
//   set/type/session.rb:60          before :core do voo.items[:view] = :name end

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import cardModSession, { ALLOW_ANONYMOUS_COOKIES } from "../../../src/card/mod-loader/mods/card-mod-session.js";

interface DeclarationFile {
  file: string;
  set_path: string;
  events: { line: number; name: string; args: string }[];
  views: { line: number; name: string }[];
  includes: { line: number; target: string }[];
}

const DECLARED: DeclarationFile[] = JSON.parse(
  readFileSync(new URL("fixtures/session-declarations.json", import.meta.url), "utf8"),
);

function setModule(setPath: string) {
  const m = cardModSession.setModules!.find((s) => s.setPath === setPath);
  if (m === undefined) throw new Error(`no set module for ${setPath}`);
  return m;
}

describe("session register entry 29: the declared surface matches the gem's files", () => {
  it("the gem tree is two set files, four events, zero views - measured from the gem source", () => {
    expect(DECLARED.map((f) => f.set_path)).toEqual(["all/location_history", "type/session"]);
    expect(DECLARED.flatMap((f) => f.events).map((e) => e.name)).toEqual([
      "discard_deleted_locations",
      "save_current_location",
      "store_in_session",
      "delete_in_session",
    ]);
    expect(DECLARED.flatMap((f) => f.views)).toEqual([]);
  });

  it("the port registers exactly those two set modules", () => {
    expect(cardModSession.setModules!.map((m) => m.setPath).sort()).toEqual([
      "all/location_history",
      "type/session",
    ]);
  });

  it("every Ruby event declaration is registered on its own module, with Ruby's stage and trigger", () => {
    const registered: string[] = [];
    for (const file of DECLARED) {
      const module = setModule(file.set_path);
      expect(module.events ?? []).toHaveLength(file.events.length);
      for (const [i, ruby] of file.events.entries()) {
        const port = module.events![i]!;
        expect(port.event).toBe(ruby.name);
        registered.push(`${file.set_path} ${ruby.name}`);
        // the stage clause: Ruby writes `:finalize` / `:prepare_to_store`
        // first; a `before:`-only event declares none (Ruby clears @stage).
        const stage = ruby.args.match(/^:([a-z_]+)/)?.[1];
        expect(port.at).toBe(stage);
        // the on: clause: Ruby's `:delete` / `:save` become the port's
        // trigger list, verbatim. The ONE exception is the read trigger -
        // save_current_location declares `on: :read` (location_history.rb:6)
        // and the port's trigger union has no read arm, so the arm is DROPPED
        // and the read path runs the save elsewhere
        // (card-mod-session.ts:132-138, Env.save_location ported as
        // visitor-session.ts saveLocation). Named, not silent.
        const on = ruby.args.match(/on:\s*:([a-z_]+)/)?.[1];
        if (on === "read") {
          expect(port.on).toBeUndefined();
          expect(ruby.name).toBe("save_current_location");
        } else if (on === undefined) {
          expect(port.on).toBeUndefined();
        } else {
          expect(port.on).toEqual([on]);
        }
        // before: relative ordering, the one clause Ruby puts first here.
        const before = ruby.args.match(/before:\s*:([a-z_]+)/)?.[1];
        expect(port.before).toBe(before);
      }
    }
    expect(registered).toEqual([
      "all/location_history discard_deleted_locations",
      "all/location_history save_current_location",
      "type/session store_in_session",
      "type/session delete_in_session",
    ]);
  });

  it("no set module registers a view: the gem declares none", () => {
    for (const m of cardModSession.setModules!) {
      const formats = m.formats ?? {};
      for (const [key, block] of Object.entries(formats)) {
        expect(block?.views ?? []).toEqual([]);
        expect(key).not.toBe("html");
      }
    }
  });

  it("the gem's include_set Pointer has no manifest slot, and the port does not fake one", () => {
    const includes = DECLARED.flatMap((f) => f.includes.map((i) => i.target));
    expect(includes).toEqual(["Pointer"]);
    // no set-module field exists for an include target, so nothing can
    // smuggle one in
    for (const m of cardModSession.setModules!) {
      expect(Object.keys(m)).not.toContain("includeSet");
    }
  });

  it("CORRECTION: the before :core hook is NOT registered, and has no seam to register into", () => {
    // The register (2026-10-18, entry 29) states "The `before :core` hook
    // itself is registered in the same file." Read against this tree that is
    // false: set/type/session.rb registers events only. RenderFormat's
    // before-hook runner is a hardcoded switch over view names
    // (src/card/render/format.ts:1726, runBeforeHook) - there is no
    // mod-registration surface for a before: hook, and the ModFormatBlock
    // type carries views only.
    const typeSession = setModule("type/session");
    expect(typeSession.events!.map((e) => e.event)).toEqual(["store_in_session", "delete_in_session"]);
    expect(typeSession.formats).toBeUndefined();
    // the field itself does not exist on ModSetModuleFile
    expect(Object.keys(typeSession)).not.toContain("views");
    expect((typeSession as unknown as Record<string, unknown>).views).toBeUndefined();
    expect(cardModSession.setPatterns).toBeUndefined();
  });

  it("lib/card/mod/session.rb's config value is preserved as an exported constant", () => {
    // lib/card/mod/session.rb:1-3 Cardio::Railtie.config.tap { |c|
    // c.allow_anonymous_cookies = true }
    expect(ALLOW_ANONYMOUS_COOKIES).toBe(true);
  });
});