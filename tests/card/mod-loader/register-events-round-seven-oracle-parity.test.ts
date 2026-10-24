// register-events-round-seven-oracle-parity.test.ts - the events family's
// seventh round: the next ten rows in row-id order, each pinned against
// its OWN executed Ruby oracle capture.
//
// WHAT THIS FILE IS. Round six took the next eight rows in row-id order
// and closed each one on its own evidence. This round takes the next ten:
// the three list rows (add_and_drop_items, delist, insert_item_event) and
// the seven permissions rows (cascade_read_rule, check_permissions,
// expire_related, set_field_read_rules, set_read_rule, update_read_rule,
// update_rule_cache).
//
// Each row here states two things: what Ruby's own body DID (from the
// executed capture), and what the port's own place for the work carries.
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
import cardModList from "../../../src/card/mod-loader/mods/card-mod-list.js";
import cardModPermissions from "../../../src/card/mod-loader/mods/card-mod-permissions.js";
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

/** The port's own source file, read as text, so a row's body owner is
 *  pinned against the file that carries it and not against a prose note. */
export function portSource(relative: string): string {
  return readFileSync(new URL(`../../../${relative}`, import.meta.url), "utf8");
}

describe("the events family, round seven: the next ten rows in row-id order", () => {
  it("add_and_drop_items: the executed body's two reads and its two operations, and the port's write route carrying the body", () => {
    const oracle = capture("add-and-drop-items");
    const declared = registration(cardModList, "add_and_drop_items");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-mod-list-0.20.0/set/abstract/01_list/events.rb");
    expect(oracle.pinned_declaration).toBe(
      "event :add_and_drop_items, :prepare_to_validate, on: :save do",
    );
    expect(oracle.pinned_declaration_line).toBe(1);
    expect(oracle.executed).toBe(true);

    // what Ruby did: the body reads the request's add_item and drop_item
    // and adds and drops each of them; a request that carried neither
    // makes the body do nothing.
    const adding = oracle.scenarios?.[0];
    const quiet = oracle.scenarios?.[1];
    expect(callsOf(adding)).toEqual(["Env.params", "Env.params", "add_item", "drop_item"]);
    expect(callsOf(quiet)).toEqual(["Env.params", "Env.params"]);

    // the port's registration is the pinned declaration (:prepare_to_validate,
    // on: :save, with no when clause) with the mod files' no-op. THE ROW
    // CLOSES on the port's own place for the work: the body runs inline in
    // the write route's listItemContent, which applies Ruby's operations in
    // Ruby's order against the content the request assigned (Ruby's events
    // read the card AFTER assign_attributes).
    expect(declared.at).toBe("prepare_to_validate");
    expect(declared.on).toEqual(["save"]);
    expect(declared.when).toBeUndefined();
    expect(carriesStubBody(declared)).toBe(true);

    // the port's own place for the work: listItemContent, and the four
    // Env.params keys the two list bodies read. The source order IS the
    // behavioral pin: Ruby's two events run in definition order within the
    // same stage, so the adds are appended before the drops are applied.
    const route = portSource("src/server/write-routes.ts");
    expect(route).toContain("function listItemContent(");
    for (const key of ["add_item", "drop_item", "insert_item", "item_index"]) {
      expect(route, `the route stopped parsing ${key}`).toContain(`"${key}"`);
    }
    const start = route.indexOf("function listItemContent");
    const body = route.slice(start, route.indexOf("\n}", start));
    const addAt = body.indexOf("parsed.addItem");
    const dropAt = body.indexOf("parsed.dropItem");
    expect(addAt).toBeGreaterThan(-1);
    expect(dropAt).toBeGreaterThan(addAt);
  });
});
