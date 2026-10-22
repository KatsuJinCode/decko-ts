// register-events-core-reg-evt-core-send-password-reset-email-oracle-parity.test.ts - the
// send_password_reset_email row of the sixteen core template-expansion rows, tied
// to the EXECUTED Ruby oracle capture.
//
// The register's core section lists sixteen events with "no single Ruby
// declaration": they are template expansions. The family's audit (commit
// b1d68fd1) closed them from the SOURCE and said so. The capture
// (tests/server/oracle-capture-core-template-expansion-events-ruby.rb)
// reads the pinned each-loop out of the pinned gemset, records the
// EXPANDED declaration, and EXECUTES the body over recording doubles.
//
// DISPOSITION: ENGINE-OWNED - the port sends the mail from the account
// flows (account-verify-reset-flows.ts), which is the same place Ruby's
// send_account_email runs.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import cardModAccount from "../../../src/card/mod-loader/mods/card-mod-account.js";
import { readOracle } from "./register-events-oracle-helpers.js";

function portSource(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("reg-evt-core-send-password-reset-email against the EXECUTED Ruby oracle", () => {
  it("the executed body is the port's account-mail send", () => {
    const captured = readOracle("core-template-expansion-events");
    const row = captured.email_rows.find((entry: any) => entry.row === "reg-evt-core-send-password-reset-email");
    expect(row, "captured row missing").toBeDefined();

    // the pinned expansion
    expect(row.declaration).toBe(
      "event :send_password_reset_email, :integrate, trigger: :required do",
    );
    // the EXECUTED body: one call, with the email name
    expect(row.executed.raised).toBeNull();
    expect(row.executed.recorded).toEqual([
      { call: "send_account_email", arguments: ["password_reset_email"] },
    ]);

    // the port's own declaration carries the same clauses
    const decl = (cardModAccount.setModules ?? [])
      .flatMap((file) => (file.events ?? []).map((event) => ({ setPath: file.setPath, ...event })))
      .find((event: any) => event.event === "send_password_reset_email");
    expect(decl, "send_password_reset_email not declared by the port").toBeDefined();
    expect(decl.at).toBe("integrate");
    expect(decl.trigger).toBe("required");

    // and the port's owner sends the mail from the account flows
    const flows = portSource("../../../src/card/auth/account-verify-reset-flows.ts");
    expect(flows).toContain("send_password_reset_email");
  });
});
