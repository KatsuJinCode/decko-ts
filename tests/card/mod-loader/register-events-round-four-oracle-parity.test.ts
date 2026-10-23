// register-events-round-four-oracle-parity.test.ts - the events family's
// fourth round: the rows whose port-side prerequisite LANDED, each pinned
// against its OWN executed Ruby oracle capture.
//
// WHAT THIS FILE IS. Round three closed the rows whose write order could
// carry the body. Round four closes the rows the CALLBACK-CHAIN ORDER
// observation and the port's own seams allow: the registration now carries
// a REAL body, and the body answers the executed capture.
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

describe("the events family, round four: the rows the port now carries", () => {
  it("notable_exception_raised: the executed body's log line, and the port's body that writes the same line", async () => {
    const oracle = capture("notable-exception-raised");
    const declared = registration(coreMod, "notable_exception_raised");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/result.rb");
    expect(oracle.pinned_declaration_line).toBe(1);
    expect(oracle.executed).toBe(true);

    // what Ruby did: the body read the error in flight and handed the
    // logger ONE debug line — the message, a newline, and the backtrace's
    // frames joined by a newline and two spaces. That joined string is the
    // capture's, not a transcription: the pinned bytes built it.
    const reported = oracle.scenarios?.[0];
    expect(callsOf(reported)).toEqual(["Card::Error.current", "Rails.logger", "debug"]);
    const debugCall = (reported?.calls ?? []).find((c: any) => c.call === "debug");
    expect(debugCall?.arguments).toEqual([
      "something went wrong\nfirst frame\n  second frame",
    ]);

    // the port's registration is the pinned declaration — no stage, no
    // trigger: the body hangs on the ERROR-REPORT chain, not on a stage —
    // and it now carries a REAL body, not the stub factory's.
    expect(declared.at).toBeUndefined();
    expect(carriesStubBody(declared)).toBe(false);

    // and the port's body, run against the SAME error, writes the capture's
    // own line, byte for byte.
    const written: string[] = [];
    await declared.fn(
      { name: "Decko" } as never,
      undefined as never,
      {
        driver: undefined as never,
        lexicon: undefined as never,
        stage: "integrate",
        skipEvent: () => false,
        logger: {
          debug: (line: string) => written.push(line),
          info: () => undefined,
        },
        currentError: {
          message: "something went wrong",
          backtrace: ["first frame", "second frame"],
        },
      } as never,
    );
    expect(written).toEqual(debugCall?.arguments);
  });

  it("prepare_left_and_right: the executed body's two arms, and the port's body that prepares the same two sides", async () => {
    const oracle = capture("prepare-left-and-right");
    const declared = registration(coreMod, "prepare_left_and_right");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/name_events.rb");
    expect(oracle.pinned_declaration_line).toBe(67);
    expect(oracle.executed).toBe(true);

    // what Ruby did: a simple name returns before either side is prepared;
    // a compound name prepares the left side and then the right, in that
    // order.
    const simple = oracle.scenarios?.[0];
    const compound = oracle.scenarios?.[1];
    expect(callsOf(simple)).toEqual(["name"]);
    expect(callsOf(compound)).toEqual(["name", "prepare_side", "prepare_side"]);
    expect((compound?.calls ?? []).slice(1).map((c: any) => c.arguments[0])).toEqual([
      "left",
      "right",
    ]);

    // the port's registration is the pinned declaration with a REAL body:
    // Ruby's clauses (the store stage, on: :save, changed: :name) are the
    // dispatcher's own gates.
    expect(declared.at).toBe("store");
    expect(declared.on).toEqual(["save"]);
    expect(declared.changed).toEqual(["name"]);
    expect(carriesStubBody(declared)).toBe(false);

    // and the port's body prepares the SAME two sides, in the SAME order.
    const prepared: string[] = [];
    const seam = async (side: "left" | "right"): Promise<number | null> => {
      prepared.push(side);
      return side === "left" ? 11 : 22;
    };
    await declared.fn(
      { name: "Joe User+Account" } as never,
      undefined as never,
      {
        driver: undefined as never,
        lexicon: undefined as never,
        stage: "store",
        skipEvent: () => false,
        simpleName: false,
        prepareSide: seam,
      } as never,
    );
    expect(prepared).toEqual(["left", "right"]);

    // a SIMPLE name prepares nothing at all: Ruby's own early return
    // (`return if name.simple?`).
    prepared.length = 0;
    await declared.fn(
      { name: "Decko" } as never,
      undefined as never,
      {
        driver: undefined as never,
        lexicon: undefined as never,
        stage: "store",
        skipEvent: () => false,
        simpleName: true,
        prepareSide: seam,
      } as never,
    );
    expect(prepared).toEqual([]);
  });
});
