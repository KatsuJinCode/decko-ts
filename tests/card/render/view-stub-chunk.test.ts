// Register A20 (decko-completeness-register-2026-10-18.md:764): the
// ViewStub chunk — the (StUb…sTuB placeholders the Ruby view cache writes
// into cached container content. The register found "No StUb anywhere in
// the port"; this file pins the ported chunk (src/card/render/view-stub.ts).
//
// RUBY ORACLE (run this session, Ruby 3.4.11, verbatim stub.rb:15-31
// producer + view_stub.rb:27-49 interpret semantics):
//   stub_hash = { cast: {name: "Home", type_id: 2},
//                 view_opts: {view: "content", show: ["content"]},
//                 format_opts: {nest_mode: "normal", override: true,
//                               context_names: ["Home"]} }
//   "(StUb#{stub_hash.to_json}sTuB)"
//     => (StUb{"cast":{"name":"Home","type_id":2},"view_opts":{"view":
//        "content","show":["content"]},"format_opts":{"nest_mode":"normal",
//        "override":true,"context_names":["Home"]}}sTuB)
//   JSON.parse + interpret_format_opts' `hash[:override] == "true"`
//     => false   (the STRING comparison fails a JSON boolean — faithfully)
//   nest_mode => :normal (the JSON string symbolized)

import { describe, expect, it } from "vitest";
import { DeckoName } from "../../../src/card/name.js";
import {
  expandViewStubs,
  interpretViewStub,
  scanViewStubs,
} from "../../../src/card/render/view-stub.js";

/** The captured wire bytes (see the oracle above). */
const STUB_BYTES =
  '(StUb{"cast":{"name":"Home","type_id":2},"view_opts":{"view":"content",' +
  '"show":["content"]},"format_opts":{"nest_mode":"normal","override":true,' +
  '"context_names":["Home"]}}sTuB)';

describe("A20: the ViewStub chunk (:stub chunk list)", () => {
  it("scans the captured stub bytes and interprets the three arms", () => {
    const chunks = scanViewStubs(`cached head ${STUB_BYTES} cached tail`);
    expect(chunks.length).toBe(1);
    const { hash, start, end } = chunks[0]!;
    expect(hash.cast).toEqual({ name: "Home", type_id: 2 });
    expect(hash.viewOpts).toEqual({ view: "content", show: ["content"] });
    expect(hash.formatOpts.nestMode).toBe("normal");
    // interpret_format_opts' `hash[:override] == "true"`: a JSON boolean
    // true FAILS the string comparison — the Ruby oracle run above pins
    // `override_json_true_eq_string_true: false`.
    expect(hash.formatOpts.override).toBe(false);
    expect(hash.formatOpts.contextNames).toEqual([DeckoName.parse("Home")]);
    // the span covers exactly the token
    expect(`cached head ${STUB_BYTES} cached tail`.slice(start, end)).toBe(STUB_BYTES);
  });

  it("override:'true' as a STRING reads true (the comparison's other arm)", () => {
    const hash = interpretViewStub(
      '{"cast":{},"view_opts":{},"format_opts":{"nest_mode":"compact","override":"true","context_names":[]}}',
    );
    expect(hash.formatOpts.override).toBe(true);
    expect(hash.formatOpts.nestMode).toBe("compact");
  });

  it("scans multiple stubs and stays verbatim around them", () => {
    const second =
      '(StUb{"cast":{"name":"Tova"},"view_opts":{},"format_opts":{"nest_mode":"edit","override":"false","context_names":["Home","Tova"]}}sTuB)';
    const content = `a${STUB_BYTES}b${second}c`;
    const chunks = scanViewStubs(content);
    expect(chunks.length).toBe(2);
    expect(chunks[1]!.hash.cast).toEqual({ name: "Tova" });
    expect(chunks[1]!.hash.formatOpts.override).toBe(false);
    expect(chunks[1]!.hash.formatOpts.contextNames.map((n) => n.s)).toEqual(["Home", "Tova"]);
    // the wire format's escaped newline survives the round trip (to_json
    // escapes control characters, so the dot-dotall `.*?` never sees a raw
    // newline inside a JSON string — the /m flag is defensive)
    const escaped = '(StUb{"cast":{"name":"A\\nB"},"view_opts":{},"format_opts":{}}sTuB)';
    expect(scanViewStubs(`x${escaped}y`)[0]!.hash.cast).toEqual({ name: "A\nB" });
    // a half-written token without the closer stays verbatim (parser.rb:53)
    expect(scanViewStubs("text (StUbx more text")).toEqual([]);
  });

  it("expandViewStubs: stubs become stub_nest answers, text rides verbatim", () => {
    const html = expandViewStubs(
      `head ${STUB_BYTES} tail`,
      (hash) => `<div data-cast="${JSON.stringify(hash.cast)}"></div>`,
    );
    expect(html).toBe('head <div data-cast="{\"name\":\"Home\",\"type_id\":2}"></div> tail');
  });

  it("expandViewStubs: a single stub answers its value un-stringified (render.rb:144-148)", () => {
    // the json format's lone stub converts back to its original type
    const value = { restored: true, rows: [1, 2] };
    const out = expandViewStubs(
      '(StUb{"cast":{},"view_opts":{},"format_opts":{}}sTuB)',
      () => value,
    );
    expect(out).toBe(value);
    // no stubs at all: the original string
    expect(expandViewStubs("plain cached text", () => "never")).toBe("plain cached text");
  });
});
