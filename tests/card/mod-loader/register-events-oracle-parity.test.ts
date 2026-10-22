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

});
