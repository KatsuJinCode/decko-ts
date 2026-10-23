// register-events-recaptcha-validate-recaptcha-field-oracle-parity.test.ts
// - the card-mod-recaptcha `validate_recaptcha_field` event row, tied to
// the EXECUTED Ruby oracle capture.
//
// The family's own audit (commit fa42552b) ran the grammar on a live Ruby
// interpreter against seven probes and named the results in the commit
// message. This file is that measurement, committed as a fixture and pinned
// against the port: the capture
// (tests/server/oracle-capture-recaptcha-validate-recaptcha-field-ruby.rb)
// runs the PINNED body over a recording errors bag, and the case below
// pins the port's own grammar to the recorded answer, probe for probe.
//
// WHAT THE CAPTURE RECORDED. A content the pinned grammar refuses adds ONE
// error whose attribute is :content and whose message is the pinned literal
// "invalid key"; a content it accepts adds nothing. Ruby's ^ and $ are LINE
// anchors, so "bad\nkey" and "abc\n\n" are accepted, line by line.

import { describe, expect, it } from "vitest";
import { recaptchaFieldContentError } from "../../../src/card/mod-loader/mods/card-mod-recaptcha.js";
import { readOracle } from "./register-events-oracle-helpers.js";

describe("card-mod-recaptcha validate_recaptcha_field against the EXECUTED Ruby oracle", () => {
  it("the port's grammar is the pinned grammar's answer, probe for probe", () => {
    const captured = readOracle("recaptcha-validate-recaptcha-field");

    expect(captured.pinned_declaration).toBe(
      "event :validate_recaptcha_field, :validate, when: :recaptcha_setting? do",
    );
    expect(captured.pinned_body).toContain("content.match?(/^[a-zA-Z0-9\\-_]*$/)");
    expect(captured.pinned_body).toContain('errors.add :content, "invalid key"');

    expect(captured.probes.length).toBe(7);
    for (const probe of captured.probes) {
      const portError = recaptchaFieldContentError(probe.content);
      if (probe.errors_added.length === 0) {
        expect(
          portError,
          `port refused a content the pinned grammar accepted: ${JSON.stringify(probe.content)}`,
        ).toBeUndefined();
        continue;
      }
      expect(
        portError,
        `port accepted a content the pinned grammar refused: ${JSON.stringify(probe.content)}`,
      ).toBe("invalid key");
      expect(probe.errors_added[0].attribute).toBe("content");
      expect(probe.errors_added[0].message).toBe("invalid key");
    }
  });
});
