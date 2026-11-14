// register-events-history-oracle-parity.test.ts - the card-mod-history
// event rows, tied to the EXECUTED Ruby oracle captures.
//
// The family's own audit (commit 1652ab14) closed these rows from the
// SOURCE and said so: "no Ruby engine was executed for these rows in this
// session". Each case below reads the oracle capture the shared capture
// harness ran over the pinned gemset
// (tests/server/oracle-capture-history-*-ruby.rb, output committed under
// fixtures/captured/) and pins the port against what that capture
// RECORDED.
//
// WHAT THE CAPTURES RECORD.
//   update_ancestor_timestamps: one bulk UPDATE over exactly the ancestor
//   ids, carrying updater_id and updated_at, then one cache expiry per
//   ancestor; nothing at all when the ancestor list is empty.
//   finalize_act: one write of the act row's card_id, and nothing else.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import cardModHistory from "../../../src/card/mod-loader/mods/card-mod-history.js";
import { declaredEvents, readOracle } from "./register-events-oracle-helpers.js";

function portSource(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("card-mod-history event rows against the EXECUTED Ruby oracle", () => {
  it("update_ancestor_timestamps: the executed Ruby effect is one bulk UPDATE over the ancestors plus one expiry each", () => {
    const captured = readOracle("history-update-ancestor-timestamps");

    expect(captured.pinned_declaration).toBe(
      "event :update_ancestor_timestamps, :integrate do",
    );
    expect(captured.pinned_body).toContain("Card.where(id: ids).update_all");
    expect(captured.pinned_body).toContain("updater_id: Auth.current_id");
    expect(captured.pinned_body).toContain("updated_at: Time.now");
    expect(captured.pinned_body).toContain("Card.expire anc_id.cardname");

    const three = captured.probes.find((p: any) => p.label === "three ancestors");
    expect(three.raised).toBeNull();
    const update = three.recorded.find(
      (entry: any) => entry.call === "Card.where(id:).update_all",
    );
    // the SAME set of ancestors the walk found
    expect(update.ids).toEqual([11, 12, 13]);
    // the SAME two columns, with the acting account and the clock
    expect(Object.keys(update.attributes).sort()).toEqual(["updated_at", "updater_id"]);
    expect(update.attributes.updater_id).toBe(42);
    expect(update.attributes.updated_at).toBe("Time.now");
    // and ONE expiry per ancestor, by cardname
    const expiries = three.recorded
      .filter((entry: any) => entry.call === "Card.expire")
      .map((entry: any) => entry.arguments[0]);
    expect(expiries).toEqual(["Host", "Child", "Grandchild"]);

    // the guard: an empty ancestor list writes nothing at all
    const none = captured.probes.find((p: any) => p.label === "no ancestors");
    expect(none.raised).toBeNull();
    expect(none.recorded).toEqual([]);

    // the port's own declaration carries Ruby's clauses
    const decl = declaredEvents(cardModHistory).find(
      (d) => d.event === "update_ancestor_timestamps",
    );
    expect(decl, "update_ancestor_timestamps not declared").toBeDefined();
    expect(decl!.setPath).toBe("all/history/events");
    expect(decl!.at).toBe("integrate");
    expect(decl!.on).toBeUndefined();
    expect(decl!.changed).toBeUndefined();
    expect(decl!.when).toBeUndefined();

    // and the port's owner issues the SAME statement, read from the port's
    // own source: one UPDATE over the ancestor ids, carrying updater_id
    // and updated_at.
    const engine = portSource("../../../src/card/actions/card-action-engine.ts");
    expect(engine).toContain("bumpAncestorTimestamps");
    expect(engine).toContain(
      "UPDATE cards SET updater_id = ?, updated_at = ? WHERE id IN (",
    );
  });

  it("finalize_act: the executed Ruby effect is one write of the act row's card_id, and the port's writer issues that write", () => {
    const captured = readOracle("history-finalize-act");

    expect(captured.pinned_declaration).toBe(
      "event :finalize_act, after: :finalize_action, when: :act_card? do",
    );
    expect(captured.pinned_body).toContain("Card::Director.act.update! card_id: id");
    expect(captured.pinned_gate.name).toBe("act_card?");
    expect(captured.pinned_gate.file).toBe("card-1.110.0/lib/card/director/all.rb");

    const probe = captured.probes[0];
    expect(probe.raised).toBeNull();
    const update = probe.recorded.find(
      (entry: any) => entry.call === "Card::Director.act.update!",
    );
    expect(update.attributes).toEqual({ card_id: probe.id });

    // the port's declaration: a chain edge (after:), not a stage
    const decl = declaredEvents(cardModHistory).find((d) => d.event === "finalize_act");
    expect(decl, "finalize_act not declared").toBeDefined();
    expect(decl!.setPath).toBe("all/history/events");
    expect(decl!.after).toBe("finalize_action");
    expect(decl!.when).toBe("act_card?");
    expect(decl!.at).toBeUndefined();

    // and the port's writer issues the same write, read from the port's
    // own source.
    const writePath = portSource("../../../src/card/history/write-path.ts");
    expect(writePath).toContain("finalizeActCard");
    expect(writePath).toContain("UPDATE card_acts SET card_id = ? WHERE id = ?");
  });
});
