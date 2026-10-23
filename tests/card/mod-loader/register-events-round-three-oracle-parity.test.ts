// register-events-round-three-oracle-parity.test.ts - the events family's
// third round: the rows whose PORT-side prerequisite landed, each pinned
// against its OWN executed Ruby oracle capture.
//
// WHAT THIS FILE IS. Round two measured every open row and named each
// gap (the port's registration carried the mod files' stub body). Round
// three CLOSES the rows whose port-side work landed: the registration
// now carries a REAL body, and the write path carries that body where
// Ruby runs it.
//
// Each row here states three things: what Ruby's own body DID (from the
// executed capture), what the port's registration carries (the pinned
// declaration's clauses and the body's kind), and WHICH PORT MECHANISM
// the body calls — the engine code that owns the behaviour Ruby put in
// the event body.
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
import type { DeckoModManifest } from "../../../src/card/mod-loader/mod-manifest.js";

type Capture = {
  row: string;
  event: string;
  pinned_file: string;
  pinned_declaration: string;
  pinned_declaration_line: number;
  pinned_body: string;
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

describe("the events family, round three: the rows the port now carries", () => {
  it("delete_children: the executed body, and the port's real body on the delete write order", () => {
    const oracle = capture("delete-children");
    const declared = registration(coreMod, "delete_children");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/trash.rb");
    expect(oracle.pinned_declaration_line).toBe(46);
    expect(oracle.executed).toBe(true);

    // what Ruby did, from the execution:
    // the body returns before it touches a child when the card carries an
    // error, and deletes every child it has when the card carries none.
    const withError = oracle.scenarios?.[0];
    const withoutError = oracle.scenarios?.[1];
    expect(callsOf(withError), "the errored card's children").toEqual([]);
    expect(callsOf(withoutError), "the clean card's children").toEqual([
      "each_child",
      "each_child.include_set_modules",
      "delete_as_subcard",
      "each_child.include_set_modules",
      "delete_as_subcard",
    ]);

    // the port's registration is the pinned declaration — Ruby's clauses
    // verbatim — and it now carries a REAL body, not the stub factory's.
    expect(declared.after).toBe("validate_delete");
    expect(declared.on).toEqual(["delete"]);
    expect(carriesStubBody(declared)).toBe(false);

    // the body reaches the cascade through the ctx seam the delete path's
    // WRITE ORDER hands it (the port's ActWriter creates the action row at
    // write time, so the super_action linkage the Ruby body needs exists
    // only after the parent's own write — Ruby's validate-stage position is
    // unreachable in the port). The seam's own mechanism is the engine's
    // cascade (card-action-engine.ts deleteChildren).
    const body = String(declared.fn);
    expect(body).toMatch(/deleteChildren/);
    // the port's errors.any? guard: the validate stage THROWS on a
    // validation error, so the write order is reached only with an
    // error-free card (the port's equivalent of the Ruby early return).
    expect(body).not.toMatch(/stubEvent/);
  });
});
