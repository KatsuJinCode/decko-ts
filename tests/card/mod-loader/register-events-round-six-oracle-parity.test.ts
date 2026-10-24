// register-events-round-six-oracle-parity.test.ts - the events family's
// sixth round: the next eight rows in row-id order, each pinned against
// its OWN executed Ruby oracle capture.
//
// WHAT THIS FILE IS. Rounds three, four and five closed the rows whose
// port-side prerequisite LANDED. This round takes the next eight rows in
// row-id order and closes each one on its own evidence: the pinned gem's
// own body is EXECUTED, the port's registration is pinned against that
// execution, and the row's verdict is either parity (the port's body
// produces the capture's own bytes) or a measured skip with the
// mechanism named.
//
// Each row here states two things: what Ruby's own body DID (from the
// executed capture), and what the port's registration carries.
//
// EVERY capture this file reads was produced by RUNNING the pinned gem's
// own body: the pinned file, declaration and body come out of the pinned
// gemset by line, and the body is executed by
// tests/server/oracle-capture-register-events-generic-ruby.rb over the
// recording doubles, driven by the row's own spec in
// tests/server/register-events-specs/. Nothing here was produced by
// reading the Ruby and transcribing what it looks like it would do. The
// re-run of each row's rig is byte-identical to the committed fixture.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import coreMod from "../../../src/card/mod-loader/mods/core-mod.js";
import cardModCarrierwave from "../../../src/card/mod-loader/mods/card-mod-carrierwave.js";
import type { DeckoModManifest } from "../../../src/card/mod-loader/mod-manifest.js";

type Capture = {
  row: string;
  event: string;
  pinned_file: string;
  pinned_declaration: string;
  pinned_declaration_line: number;
  pinned_body: string;
  executed?: boolean;
  scenarios?: Array<Record<string, any>>;
  [key: string]: any;
};

/** One executed Ruby capture, read from the committed fixture. */
export function capture(slug: string): Capture {
  const path = new URL(`../../../fixtures/captured/${slug}-ruby-oracle.json`, import.meta.url);
  return JSON.parse(readFileSync(path, "utf8"));
}

/** The port's own registration of the event, out of the mod's manifest. */
export function registration(mod: DeckoModManifest, event: string): Record<string, any> {
  for (const file of mod.setModules ?? []) {
    for (const declared of file.events ?? []) {
      if ((declared as Record<string, any>).event === event) return declared as Record<string, any>;
    }
  }
  throw new Error(`no registration for ${event}`);
}

/** The stub body, as the mod files hand it out: the core mod's stub
 *  factory, the mod files' own no-op arrow, or a body that is only a
 *  comment (the no-op each mod writes with its reason). */
export function carriesStubBody(declared: Record<string, any>): boolean {
  if (typeof declared.fn !== "function") return false;
  const text = String(declared.fn);
  if (/stubEvent/.test(text)) return true;
  if (/^\s*\(\)\s*=>\s*undefined/.test(text)) return true;
  // a body that is nothing but a comment does nothing.
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\([^)]*\)\s*=>/g, "")
    .replace(/[{}()=>\s;]/g, "");
  if (stripped.length === 0) return true;
  // a body that only VOIDS what it was handed does nothing.
  return /^(void[A-Za-z0-9_]*)+$/.test(stripped);
}

/** The calls one executed scenario made, by name, each qualified by the
 *  double it was made on ("each_child.include_set_modules"). */
export function callsOf(scenario: Record<string, any> | undefined): string[] {
  return ((scenario?.calls ?? []) as Array<Record<string, any>>).map((call) =>
    call.under ? `${call.under}.${call.call}` : String(call.call),
  );
}

/** The errors one executed scenario added, by message. */
export function errorsOf(scenario: Record<string, any> | undefined): unknown[] {
  return ((scenario?.errors_added ?? []) as Array<Record<string, any>>).map((e) => e.message);
}

describe("the events family, round six: the next eight rows in row-id order", () => {
  it("validate_codename: the executed body's three checks, and the port's named skip with its mechanism", () => {
    const oracle = capture("validate-codename");
    const declared = registration(coreMod, "validate_codename");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/codename.rb");
    expect(oracle.pinned_declaration).toBe(
      "event :validate_codename, :validate, on: :update, changed: :codename do",
    );
    expect(oracle.pinned_declaration_line).toBe(1);
    expect(oracle.executed).toBe(true);

    // what Ruby did: the body ran the card's OWN three checks (the pinned
    // helper methods, codename.rb:17-45, run from their pinned bytes). A
    // cleared codename is cleared again and no error is added; a codename
    // another card already owns is refused with the PINNED locale's own
    // text.
    const cleared = oracle.scenarios?.[0];
    const taken = oracle.scenarios?.[1];
    expect(callsOf(cleared)).toEqual([
      "validate_codename_permission",
      "Auth.always_ok?",
      "validate_codename_uniqueness",
      "codename",
      "codename=",
      "validate_codename_simplicity",
      "name",
      "simple?",
    ]);
    expect(cleared?.writes).toEqual([{ attribute: "codename", value: null }]);
    expect(errorsOf(cleared)).toEqual([]);
    expect(errorsOf(taken)).toEqual(["codename account already in use"]);

    // the port's registration is the pinned declaration (:validate, on:
    // :update, changed: :codename) with the stub body. THE ROW CLOSES on
    // the measured skip, and the mechanism is named: the port's update
    // path carries NO codename at all, so the body's own gate selects
    // nothing. The update input has no codename field
    // (src/card/actions/types.ts:276, UpdateCardInput) and the tracked
    // field state has no codename (src/card/history/change.ts), so an
    // update cannot change a codename. The create path's own guard is the
    // DATABASE's unique index (db/schema.sqlite.sql:70,
    // cards_codename_index), not Ruby's three checks, and the port's own
    // measurement of both facts is pinned by
    // tests/card/actions/port-codename-site.test.ts. The unblock
    // condition is: the port's update input carries a codename, so the
    // permission gate, the uniqueness check and the simplicity check have
    // a site to run.
    expect(declared.at).toBe("validate");
    expect(declared.on).toEqual(["update"]);
    expect(declared.changed).toEqual(["codename"]);
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("update_public_link_on_create: the executed body's call into the link event, and the port's named skip with its mechanism", () => {
    const oracle = capture("update-public-link-on-create");
    const declared = registration(cardModCarrierwave, "update_public_link_on_create");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe(
      "card-mod-carrierwave-0.20.0/set/abstract/attachment/local.rb",
    );
    expect(oracle.pinned_declaration).toBe(
      "event :update_public_link_on_create, :integrate, on: :create, when: :local? do",
    );
    expect(oracle.pinned_declaration_line).toBe(1);
    expect(oracle.executed).toBe(true);

    // what Ruby did: the body calls the event update_public_link, and the
    // called event's own bytes then read the content. The capture records
    // the call and what the called event did.
    const created = oracle.scenarios?.[0];
    expect(callsOf(created)).toEqual(["update_public_link", "content", "empty?"]);

    // the port's registration is the pinned declaration (:integrate, on:
    // :create, when: :local?) with the stub body. THE ROW CLOSES on the
    // measured skip, and the mechanism is named: the body has no surface
    // to work on. The called event update_public_link (local.rb:9-17) has
    // both arms filesystem symlink work, create_public_links (local.rb:20-33,
    // File.symlink of the stored file and every version's path into
    // public/) or remove_public_links (local.rb:38-44, rm_rf of the symlink
    // dir), and the port has no public/ tree at all: files serve through
    // the engine's own routes, and the route replaces the symlink
    // management by direct serving (src/server/file-routes.ts:34 names
    // "public symlink management" among the route's own named
    // remainders), and the headless and edge hosts have no filesystem to
    // symlink into. A substitute "mark it public" row write would be a
    // different mechanism, not a port of Ruby's. The unblock condition is:
    // the port carries the public symlink tree.
    expect(declared.at).toBe("integrate");
    expect(declared.on).toEqual(["create"]);
    expect(declared.when).toBe("local?");
    expect(carriesStubBody(declared)).toBe(true);
  });
});
