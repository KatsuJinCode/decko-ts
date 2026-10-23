// register-events-format-oracle-parity.test.ts - the card-mod-format event
// rows, tied to the EXECUTED Ruby oracle captures.
//
// The family's own audit (commit 37f37f1f) closed these rows from the
// SOURCE and said so: "no Ruby engine was executed for these rows in this
// session". Each case below reads the oracle capture the shared capture
// harness ran over the pinned gemset
// (tests/server/oracle-capture-format-*-ruby.rb, output committed under
// fixtures/captured/) and pins the port's own implementation against what
// that capture RECORDED.
//
// WHAT THE CAPTURES RECORD.
//   validate_json: the PINNED json parser's message bytes, as the PINNED
//   body puts them in the errors bag, with the pinned locale token as the
//   attribute.
//   validate_number: the PINNED `number?` answer for each probed content
//   (Kernel#Float string grammar, card-1.110.0's initializer), and the
//   pinned locale token interpolated with the content.

import { describe, expect, it } from "vitest";
import {
  jsonValidationMessage,
  numberValidationMessage,
  rubyFloatParsable,
} from "../../../src/card/mod-loader/mods/format-validations.js";
import { readOracle } from "./register-events-oracle-helpers.js";

describe("card-mod-format event rows against the EXECUTED Ruby oracle", () => {
  it("validate_json: the port's parser messages are the PINNED parser's message bytes", () => {
    const captured = readOracle("format-validate-json");

    // the capture ran the PINNED parser, and recorded which one.
    expect(captured.json_version_loaded).toBe("3.1.0");
    expect(captured.json_parser_implementation).toBe("JSON::Ext::Parser");
    expect(captured.json_native_extension).toContain("json-3.1.0");
    expect(captured.pinned_declaration).toBe(
      "event :validate_json, :validate, on: :save, changed: :content do",
    );
    expect(captured.pinned_body.trim()).toBe("check_json_syntax if content.present?");
    expect(captured.pinned_locale_token).toBe("invalid json");

    // Every probe the capture ran: the port's message must be the
    // captured message, and a content the capture accepted must be
    // accepted by the port.
    expect(captured.probes.length).toBeGreaterThan(0);
    for (const probe of captured.probes) {
      const portMessage = jsonValidationMessage(probe.content);
      if (probe.errors_added.length === 0) {
        expect(
          portMessage,
          `port refused a content the pinned parser accepted: ${JSON.stringify(probe.content)}`,
        ).toBeNull();
        continue;
      }
      expect(
        portMessage,
          `port accepted a content the pinned parser refused: ${JSON.stringify(probe.content)}`,
      ).not.toBeNull();
      // the port's message is the errors-view form: the KEY upcased, then
      // the captured message bytes
      expect(portMessage).toBe(`INVALID JSON: ${probe.errors_added[0].message}`);
      // the captured attribute is the pinned locale token
      expect(probe.errors_added[0].attribute).toBe(captured.pinned_locale_token);
    }
  });

  it("validate_number: the port's float grammar is the PINNED number? answer, case for case", () => {
    const captured = readOracle("format-validate-number");

    // the capture ran the deck's own Ruby (3.3.12, the line the oracle
    // bundle runs) and the PINNED number? implementation.
    expect(captured.ruby_version).toBe("3.3.12");
    expect(captured.pinned_number_implementation.file).toBe(
      "card-1.110.0/config/initializers/01_core_extensions/object.rb",
    );
    expect(captured.pinned_number_implementation.body).toContain("Float(self)");
    expect(captured.pinned_declaration).toBe(
      "event :validate_number, :validate, on: :save do",
    );
    expect(captured.pinned_locale_token).toBe("'%{content}' is not numeric");

    expect(captured.probes.length).toBeGreaterThan(0);
    for (const probe of captured.probes) {
      // the accept/reject answer, case for case
      expect(
        rubyFloatParsable(probe.content),
        `port disagrees with the pinned number? on ${JSON.stringify(probe.content)}`,
      ).toBe(probe["number?"]);

      const portMessage = numberValidationMessage(probe.content);
      if (probe["number?"]) {
        expect(portMessage).toBeNull();
        expect(probe.errors_added).toEqual([]);
        continue;
      }
      // the port's message is the errors-view form of the pinned token;
      // the bare message is the token interpolated with the content
      expect(portMessage).toBe(`CONTENT: '${probe.content}' is not numeric`);
      expect(probe.errors_added.length).toBe(1);
      expect(probe.errors_added[0].attribute).toBe("content");
      expect(probe.errors_added[0].message).toBe(`'${probe.content}' is not numeric`);
    }
  });
});
