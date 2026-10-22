// register-events-core-reg-evt-core-remove-previously-stored-image-event-oracle-parity.test.ts - the
// remove_previously_stored_image_event row of the sixteen core template-expansion rows, tied to the
// EXECUTED Ruby oracle capture.
//
// The register's core section lists sixteen events with "no single Ruby
// declaration": they are template expansions. The family's audit (commit
// b1d68fd1) closed them from the SOURCE and said so. The capture
// (tests/server/oracle-capture-core-template-expansion-events-ruby.rb)
// reads the pinned template out of the pinned gemset, records the
// EXPANDED declaration it produces, and the case below pins the port's own
// registration against that expansion, clause for clause.
//
// DISPOSITION: INERT-GATED - the event fires only when the card has no history, and the port's no-history set lists right codenames only, never the mount types, so the port's event is structurally inert for an Image card.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import cardModCarrierwave from "../../../src/card/mod-loader/mods/card-mod-carrierwave.js";
import { readOracle } from "./register-events-oracle-helpers.js";

function portSource(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("reg-evt-core-remove-previously-stored-image-event against the EXECUTED Ruby oracle", () => {
  it("the port's declaration is the template's expansion, clause for clause", () => {
    const captured = readOracle("core-template-expansion-events");
    const row = [...captured.mount_rows, ...captured.observer_rows, ...captured.email_rows].find(
      (entry: any) => entry.row === "reg-evt-core-remove-previously-stored-image-event",
    );
    expect(row, "captured row missing").toBeDefined();

    // the pinned expansion, with the column substituted
    expect(row.declaration).toContain("event :remove_previously_stored_image_event");
    expect(row.declaration).toContain(":finalize");
    expect(row.declaration).toContain("when: :no_history?");
    for (const trigger of ["update"]) {
      expect(row.declaration).toContain(`on: :${trigger}`);
    }
    // the pinned gate the declaration names
    expect(captured.pinned_no_history_gate).toBeDefined();
    expect(captured.pinned_no_history_gate.body).toContain("!history?");

    // the port's own declaration
    const decl = (cardModCarrierwave.setModules ?? [])
      .flatMap((file) => (file.events ?? []).map((event) => ({ setPath: file.setPath, ...event })))
      .find((event: any) => event.event === "remove_previously_stored_image_event");
    expect(decl, "remove_previously_stored_image_event not declared by the port").toBeDefined();
    expect(decl!.setPath).toBe("type/image");
    expect(decl!.at).toBe("finalize");
      expect(decl!.when).toBe("no_history?");
      expect(decl!.on).toEqual(["update"]);

    // and the port's registration cites the pinned line it came from
    const carrierwave = portSource("../../../src/card/mod-loader/mods/card-mod-carrierwave.ts");
    expect(carrierwave).toContain("card_mount.rb:50-53");
    // and the port has no counterpart for the body: the port's engine
    // carries no such call, which is the row's disposition.
    const engine = portSource("../../../src/card/actions/card-action-engine.ts");
    expect(engine).not.toContain("remove_previously_stored_image_event");
  });
});
