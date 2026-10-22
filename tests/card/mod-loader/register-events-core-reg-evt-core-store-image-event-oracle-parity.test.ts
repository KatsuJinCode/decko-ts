// register-events-core-reg-evt-core-store-image-event-oracle-parity.test.ts - the
// store_image_event row of the sixteen core template-expansion rows, tied to the
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
// DISPOSITION: ENGINE-OWNED - the same one AttachmentStore call serves both mount columns, decided from the card's type codename, which is what separates store_image_event from store_file_event.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import cardModCarrierwave from "../../../src/card/mod-loader/mods/card-mod-carrierwave.js";
import { readOracle } from "./register-events-oracle-helpers.js";

function portSource(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("reg-evt-core-store-image-event against the EXECUTED Ruby oracle", () => {
  it("the port's declaration is the template's expansion, clause for clause", () => {
    const captured = readOracle("core-template-expansion-events");
    const row = [...captured.mount_rows, ...captured.observer_rows, ...captured.email_rows].find(
      (entry: any) => entry.row === "reg-evt-core-store-image-event",
    );
    expect(row, "captured row missing").toBeDefined();

    // the pinned expansion, with the column substituted
    expect(row.declaration).toContain("event :store_image_event");
    expect(row.declaration).toContain(":finalize");
    expect(row.declaration).toContain("when: :store_image_event?");
    // the pinned gate the declaration names
    expect(captured.pinned_no_history_gate).toBeDefined();
    expect(captured.pinned_no_history_gate.body).toContain("!history?");

    // the port's own declaration
    const decl = (cardModCarrierwave.setModules ?? [])
      .flatMap((file) => (file.events ?? []).map((event) => ({ setPath: file.setPath, ...event })))
      .find((event: any) => event.event === "store_image_event");
    expect(decl, "store_image_event not declared by the port").toBeDefined();
    expect(decl.setPath).toBe("type/image");
    expect(decl.at).toBe("finalize");
      expect(decl!.when).toBe("store_image_event?");
      expect(decl!.on).toBeUndefined();

    // and the port's registration cites the pinned line it came from
    const carrierwave = portSource("../../../src/card/mod-loader/mods/card-mod-carrierwave.ts");
    expect(carrierwave).toContain("card_mount.rb:32-34");
    // and the port's owner of the body, read from the port's own source
    const owner = portSource("../../../src/card/actions/card-action-engine.ts");
    expect(owner).toContain("finalizeAttachment");
  });
});
