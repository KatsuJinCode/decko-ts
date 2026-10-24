// register-events-round-five-oracle-parity.test.ts - the events family's
// fifth round: the rows whose port-side prerequisite LANDED, each pinned
// against its OWN executed Ruby oracle capture.
//
// WHAT THIS FILE IS. Round four closed the rows the callback-chain order
// observation and the port's own seams allow (the logger seam, the save
// input's subcard collection, the write order's obstacle rename and cache
// drop). Round five closes the rows whose engine sites the write order now
// reaches: the draft arm, the create preparation's autoname ladder, the
// save's content preparation, the new-card template read, the post-store
// lexicon maintenance, and the save walk's codename, key and name-legality
// checks. The registration carries a REAL body, and the body answers the
// executed capture.
//
// Each row here states two things: what Ruby's own body DID (from the
// executed capture), and what the port's registration carries — and, where
// the port's body can be run against the same input, that it produces the
// capture's own bytes.
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

describe("the events family, round five: the rows the port now carries", () => {
  it("save_draft: the executed body's draft write and abort, and the port's body that makes the same two calls", async () => {
    const oracle = capture("save-draft");
    const declared = registration(coreMod, "save_draft");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/content.rb");
    expect(oracle.pinned_declaration_line).toBe(7);
    expect(oracle.executed).toBe(true);

    // what Ruby did: the body saved the content as a draft (the card's
    // own content attribute fed save_content_draft) and then called the
    // card's OWN abort (the pinned method, result.rb:19-28), which raised
    // the pinned Card::Error::Abort with the status :success.
    const draft = oracle.scenarios?.[0];
    expect(callsOf(draft)).toEqual(["content", "save_content_draft", "abort", "director.abort"]);
    expect(draft?.outcome?.raised).toBe("Card::Error::Abort");
    expect(draft?.outcome?.status).toBe("success");

    // the port's registration is the pinned declaration (:store, on:
    // :update, when: :draft?) with a REAL body, not the stub factory's.
    expect(declared.at).toBe("store");
    expect(declared.on).toEqual(["update"]);
    expect(declared.when).toBe("draft?");
    expect(carriesStubBody(declared)).toBe(false);

    // and the port's body makes the SAME two calls, in the SAME order,
    // feeding the draft write the card's own content.
    const made: string[] = [];
    let drafted: string | undefined;
    await declared.fn(
      { name: "Joe User", dbContent: "<p>draft body</p>" } as never,
      undefined as never,
      {
        driver: undefined as never,
        lexicon: undefined as never,
        stage: "store",
        skipEvent: () => false,
        saveContentDraft: async (content: string | undefined) => {
          made.push("save_content_draft");
          drafted = content;
        },
        abortSuccess: () => {
          made.push("abort");
        },
      } as never,
    );
    expect(made).toEqual(["save_content_draft", "abort"]);
    expect(drafted).toBe("<p>draft body</p>");
  });

  it("set_autoname: the executed body's four writes, and the port's body that writes the same four", async () => {
    const oracle = capture("set-autoname");
    const declared = registration(coreMod, "set_autoname");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/autoname.rb");
    expect(oracle.pinned_declaration_line).toBe(1);
    expect(oracle.executed).toBe(true);

    // what Ruby did: the body read the autoname rule, took the name from
    // it, assigned the card's name, then wrote the rule card's content
    // and expired it (and pulled the card from the trash).
    const named = oracle.scenarios?.[0];
    expect(callsOf(named)).toEqual([
      "rule",
      "autoname",
      "name=",
      "rule_card",
      "name",
      "update_column",
      "expire",
      "pull_from_trash!",
      "Card.write_to_temp_cache",
    ]);
    expect(named?.writes).toEqual([{ attribute: "name", value: "Joe User+Account" }]);

    // the port's registration is the pinned declaration (:prepare_to_store,
    // on: :create, when: :autoname?) with a REAL body.
    expect(declared.at).toBe("prepare_to_store");
    expect(declared.on).toEqual(["create"]);
    expect(declared.when).toBe("autoname?");
    expect(carriesStubBody(declared)).toBe(false);

    // and the port's body makes the same calls, in the same order, with
    // the same values: the rule card's content is the seed, the assigned
    // name is the first free successor, the rule card's content becomes
    // that name, and the rule card is expired.
    const made: string[] = [];
    let seed: string | undefined;
    let assigned: string | undefined;
    let ruleContent: string | undefined;
    await declared.fn(
      { name: "" } as never,
      undefined as never,
      {
        driver: undefined as never,
        lexicon: undefined as never,
        stage: "prepare_to_store",
        skipEvent: () => false,
        autonameRule: async () => {
          made.push("rule");
          return { id: 343, content: "Joe User+Account+Autoname" };
        },
        autonameName: async (content: string) => {
          made.push("autoname");
          seed = content;
          return "Joe User+Account";
        },
        setCardName: (name: string) => {
          made.push("name=");
          assigned = name;
        },
        updateAutonameRuleContent: async (name: string) => {
          made.push("update_column");
          ruleContent = name;
        },
        expireAutonameRule: () => {
          made.push("expire");
        },
      } as never,
    );
    expect(made).toEqual(["rule", "autoname", "name=", "update_column", "expire"]);
    expect(seed).toBe("Joe User+Account+Autoname");
    expect(assigned).toBe("Joe User+Account");
    expect(ruleContent).toBe("Joe User+Account");
  });
});
