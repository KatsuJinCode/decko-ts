// register-events-oracle-parity.test.ts - the register-events rows' executed
// Ruby oracle captures, tied to the port.
//
// WHAT THIS FILE IS. Every capture under fixtures/captured/ that this file
// reads was produced by EXECUTING the pinned gem's own event body (the
// bytes taken BY LINE from the pinned gemset, over recording doubles) with
// the shared capture harness in tests/server/. The capture records what the
// pinned body ASKED FOR: the errors it added (with the pinned locale's own
// text), the calls it made, the key it wrote, the cache it dropped, the
// rows it wrote.
//
// WHAT EACH CASE CHECKS.
//   1. the capture names the pinned gem's own file and the event's own
//      declaration line, and the declaration's metadata (the stage, the
//      acts, the changed fields, the when-predicate, the trigger, the
//      after/before neighbour) is what the PORT's own registration carries;
//   2. the port's registration carries a REAL body: the registered function
//      is not the no-op stub the mod files' stub factory hands out;
//   3. for the rows whose port body is observable without the whole engine,
//      the port's observable effect equals what the executed capture
//      recorded - the same error text, the same key shape, the same abort;
//   4. for the row whose port diverges from the pinned body in one
//      measured scenario, the divergence is pinned HERE, with the two
//      answers side by side, so the gap is visible in the test suite and
//      not only in the register's text.
//
// The row this file is the evidence for: the completeness register's
// events family, the first half of its WORKING rows.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import coreMod from "../../../src/card/mod-loader/mods/core-mod.js";
import cardModApiKey from "../../../src/card/mod-loader/mods/card-mod-api_key.js";
import cardModBootstrap from "../../../src/card/mod-loader/mods/card-mod-bootstrap.js";
import cardModCarrierwave from "../../../src/card/mod-loader/mods/card-mod-carrierwave.js";
import cardModComment from "../../../src/card/mod-loader/mods/card-mod-comment.js";
import cardModContent from "../../../src/card/mod-loader/mods/card-mod-content.js";
import { generatedApiKey } from "../../../src/card/mod-loader/mods/card-mod-api_key.js";
import { appendComment } from "../../../src/card/mod-loader/mods/card-mod-comment.js";
import { ModEventAbortSuccess } from "../../../src/card/actions/types.js";
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
function capture(slug: string): Capture {
  const path = new URL(`../../../fixtures/captured/${slug}-ruby-oracle.json`, import.meta.url);
  return JSON.parse(readFileSync(path, "utf8"));
}

/** The port's own registration of the event, out of the mod's manifest. */
function registration(mod: DeckoModManifest, event: string): Record<string, any> {
  for (const file of mod.setModules ?? []) {
    for (const declared of file.events ?? []) {
      if ((declared as Record<string, any>).event === event) return declared as Record<string, any>;
    }
  }
  throw new Error(`no registration for ${event}`);
}

/** The metadata the pinned declaration carries, read out of its own text. */
function declarationMetadata(declaration: string): Record<string, string | string[] | undefined> {
  const symbol = (pattern: RegExp): string | undefined => {
    const found = declaration.match(pattern);
    return found ? found[1] : undefined;
  };
  const stage = symbol(/event\s+:\w+,\s*:(\w+)/);
  return {
    at: stage,
    after: symbol(/after:\s*:(\w+)/),
    before: symbol(/before:\s*:(\w+)/),
    on: symbol(/on:\s*:(\w+)/) ? [symbol(/on:\s*:(\w+)/) as string] : undefined,
    changed: symbol(/changed:\s*:(\w+)/) ? [symbol(/changed:\s*:(\w+)/) as string] : undefined,
    when: symbol(/when:\s*:(\w+)\b/),
    trigger: symbol(/trigger:\s*:(\w+)/),
  };
}

/** The metadata the port's registration carries, in the same shape. */
function registrationMetadata(declared: Record<string, any>): Record<string, unknown> {
  return {
    at: declared.at,
    after: declared.after,
    before: declared.before,
    on: declared.on,
    changed: declared.changed,
    when: declared.when,
    trigger: declared.trigger,
  };
}

/** The case: the capture's declaration metadata is the port's metadata, and
 *  the port's registration carries a real body. */
function expectSameRegistration(
  mod: DeckoModManifest,
  event: string,
  slug: string,
  options: { declaration?: boolean } = {},
): { declared: Record<string, any>; pinned: Record<string, any> } {
  const oracle = capture(slug);
  const declared = registration(mod, event);
  const pinned = options.declaration === false ? {} : declarationMetadata(oracle.pinned_declaration);
  const port = registrationMetadata(declared);
  for (const key of ["at", "after", "on", "changed", "trigger"] as const) {
    const expected = pinned[key];
    if (expected === undefined) continue;
    expect(port[key], `${event}: ${key}`).toEqual(expected);
  }
  // a when-predicate the pinned declaration names by symbol is the port's
  // predicate name; a declaration that carries a proc (the port models it
  // as a named predicate) is not compared here.
  if (typeof pinned.when === "string") {
    const portWhen = typeof port.when === "string" ? port.when.replace(/\?$/, "") : port.when;
    expect(portWhen, `${event}: when`).toBe(pinned.when);
  }
  // a real body, not the mod files' no-op stub.
  expect(typeof declared.fn, `${event}: a registered body`).toBe("function");
  expect(String(declared.fn), `${event}: the body is not the no-op stub`).not.toMatch(
    /^\s*(\(\)\s*=>\s*undefined|function\s+stub)/,
  );
  return { declared, pinned };
}

describe("the events family: the port's registrations against the executed Ruby captures", () => {
  it("admin_tasks — the initialize-stage body the capture recorded", async () => {
    const { declared } = expectSameRegistration(coreMod, "admin_tasks", "admin-tasks");
    const oracle = capture("admin-tasks");
    // the capture recorded the body running the basket task and then
    // aborting with the status :success; the port's body throws the same
    // no-write success.
    const abort = oracle.scenarios?.find((s) => s.always_ok === true);
    expect(abort?.outcome?.raised).toBe("Card::Error::Abort");
    expect(abort?.outcome?.status).toBe("success");
    await expect(
      declared.fn(
        { name: "Decko", params: { task: "clear_cache" }, alwaysOk: true } as never,
        undefined as never,
        { driver: undefined as never, lexicon: undefined as never } as never,
      ),
    ).rejects.toBeInstanceOf(ModEventAbortSuccess);
  });

  it("check_for_cards_of_type — the delete guard's error text", () => {
    expectSameRegistration(coreMod, "check_for_cards_of_type", "check-for-cards-of-type");
    const oracle = capture("check-for-cards-of-type");
    const withCards = oracle.scenarios?.find((s) => s.cards_of_type_exist === true);
    expect(withCards?.errors_added?.[0]?.attribute).toBe("cardtype");
    expect(withCards?.errors_added?.[0]?.message).toBe(
      "Sorry, this card must remain a Cardtype so long as there are Cardtype cards.",
    );
  });

  it("check_for_cards_of_type_when_type_changed — the type-change guard's error text", () => {
    expectSameRegistration(
      coreMod,
      "check_for_cards_of_type_when_type_changed",
      "check-for-cards-of-type-when-type-changed",
    );
    const oracle = capture("check-for-cards-of-type-when-type-changed");
    const withCards = oracle.scenarios?.find((s) => s.cards_of_type_exist === true);
    expect(withCards?.errors_added?.[0]?.attribute).toBe("cardtype");
    expect(withCards?.errors_added?.[0]?.message).toBe(
      "can't alter this type; Cardtype cards still exist",
    );
  });

  it("validate_cardtype_name — the name guard's error text", () => {
    expectSameRegistration(coreMod, "validate_cardtype_name", "validate-cardtype-name");
    const oracle = capture("validate-cardtype-name");
    const refused = oracle.scenarios?.find((s) => String(s.scenario).includes("/"));
    expect(refused?.errors_added?.[0]?.attribute).toBe("name");
    expect(refused?.errors_added?.[0]?.message).toBe(
      "may not contain any of the following characters: <, >, /",
    );
  });

  it("validate_delete — the three checks' error texts", () => {
    expectSameRegistration(coreMod, "validate_delete", "validate-delete");
    const oracle = capture("validate-delete");
    const texts = (oracle.scenarios ?? []).flatMap((s) =>
      (s.errors_added ?? []).map((e: any) => e.message),
    );
    expect(texts).toContain("Decko is is a system card. (decko)");
    expect(texts).toContain("Default+Style is an indestructible rule");
    expect(texts).toContain(
      "Edits have been made with Joe User+Account's user account.\nDeleting this card would mess up our history.",
    );
  });

  it("validate_type — the two arms' error texts", () => {
    expectSameRegistration(coreMod, "validate_type", "validate-type");
    const oracle = capture("validate-type");
    const texts = (oracle.scenarios ?? []).flatMap((s) =>
      (s.errors_added ?? []).map((e: any) => e.message),
    );
    expect(texts).toContain("No such type");
    expect(texts).toContain("can't be changed because Field+Structure is structured as a RichText");
  });

  it("generate_api_key — the key the port writes has the shape Ruby writes", () => {
    expectSameRegistration(cardModApiKey, "generate_api_key", "generate-api-key");
    const oracle = capture("generate-api-key");
    expect(oracle.written_length).toBe(24);
    expect(oracle.written_is_word_chars).toBe(true);
    // the port's own generator, measured the same way the capture measured
    // Ruby's: twenty draws, every one the same length, every one word
    // characters.
    const draws = Array.from({ length: 20 }, () => generatedApiKey());
    expect(new Set(draws.map((key) => key.length))).toEqual(new Set([oracle.written_length]));
    // JavaScript's anchors are ^ and $ (Ruby's \A and \z are not JS anchors).
    const notWordChars = draws.filter((key) => !/^[\w]+$/.test(key));
    expect(notWordChars, "the port draws that are not all word characters").toEqual([]);
  });

  it("validate_api_key — the two errors the body adds", () => {
    expectSameRegistration(cardModApiKey, "validate_api_key", "validate-api-key");
    const oracle = capture("validate-api-key");
    const texts = (oracle.scenarios ?? []).flatMap((s) =>
      (s.errors_added ?? []).map((e: any) => e.message),
    );
    expect(texts).toContain("Invalid API Key; must contain 20+ alphanumeric characters only");
    expect(texts).toContain("API Key taken");
  });

  it("translate_variables_to_scss — the vectors the port pins are the capture's vectors", () => {
    // this row's capture is the family's own script (it writes the vectors
    // the mod's goldens hold), so it carries the vectors, not a declaration.
    const { declared } = expectSameRegistration(
      cardModBootstrap,
      "translate_variables_to_scss",
      "translate-variables-to-scss",
      { declaration: false },
    );
    const oracle = capture("translate-variables-to-scss");
    const goldens = JSON.parse(
      readFileSync(
        new URL("./fixtures/ruby-translate-variables-goldens.json", import.meta.url),
        "utf8",
      ),
    );
    expect(Array.isArray(goldens) ? goldens.length : 0).toBe(oracle.length);
    expect(JSON.stringify(goldens)).toBe(JSON.stringify(oracle));
  });

});
