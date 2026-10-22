// register-events-core-reg-evt-core-observer-create-oracle-parity.test.ts - the
// observer_create row of the sixteen core template-expansion rows,
// tied to the EXECUTED Ruby oracle capture.
//
// The register's core section lists sixteen events with "no single Ruby
// declaration": they are template expansions. The family's audit (commit
// b1d68fd1) closed them from the SOURCE and said so. The capture
// (tests/server/oracle-capture-core-template-expansion-events-ruby.rb)
// reads the pinned each-loop out of the pinned gemset, records the
// EXPANDED declaration, and EXECUTES the body over recording doubles.
//
// DISPOSITION: ENGINE-OWNED - the port runs the observer machinery at the
// engine's integrate seam (runObserverEvents, notify/observer.ts), which is
// the same place Ruby's execute_card_events runs.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { OBSERVER_EVENT_DECLARATIONS } from "../../../src/card/mod-loader/mods/card-mod-integrate.js";
import { readOracle } from "./register-events-oracle-helpers.js";

function portSource(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("reg-evt-core-observer-create against the EXECUTED Ruby oracle", () => {
  it("the executed body is the port's integrate-seam observer run", () => {
    const captured = readOracle("core-template-expansion-events");
    const row = captured.observer_rows.find(
      (entry: any) => entry.row === "reg-evt-core-observer-create",
    );
    expect(row, "captured row missing").toBeDefined();

    // the pinned expansion
    expect(row.declaration).toBe("event :observer_create, :integrate, on: create do");
    // the EXECUTED body: one call, with the action
    expect(row.executed.raised).toBeNull();
    expect(row.executed.recorded).toEqual([
      { call: "execute_card_events", arguments: [{ on: "create" }] },
    ]);
    // the pinned helper the body calls
    expect(row.pinned_helper.file).toBe("card-mod-integrate-0.20.0/set/all/observer.rb");
    expect(row.pinned_helper.body).toContain("event_cards(setting).each");

    // the port's own declaration carries the same clauses
    const decl = (OBSERVER_EVENT_DECLARATIONS as readonly Record<string, any>[]).find(
      (entry) => entry.event === "observer_create",
    );
    expect(decl, "observer_create not declared by the port").toBeDefined();
    expect(decl!.stage).toBe("integrate");
    expect(decl!.on).toBe("create");

    // and the port's owner is wired at the engine's integrate seam
    const engine = portSource("../../../src/card/actions/card-action-engine.ts");
    expect(engine).toContain("runObserverEvents");
    const observer = portSource("../../../src/card/notify/observer.ts");
    expect(observer).toContain("runObserverEvents");
  });
});
