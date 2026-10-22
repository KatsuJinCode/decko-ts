// register-events-follow-oracle-parity.test.ts - the card-mod-follow event
// rows, tied to the EXECUTED Ruby oracle captures.
//
// The family's own audit (commit 804a7c99) closed these rows from the
// SOURCE and said so: "no Ruby engine was executed for these rows in this
// session". Each case below reads the oracle capture the shared capture
// harness ran over the pinned gemset
// (tests/server/oracle-capture-follow-*-ruby.rb, output committed under
// fixtures/captured/) and pins the port against what that capture
// RECORDED, so the row rests on an execution and not on a reading.

import { describe, expect, it } from "vitest";
import cardModFollow from "../../../src/card/mod-loader/mods/card-mod-follow.js";
import {
  declaredEvents,
  parsedWriteRouteTriggers,
  readOracle,
  writeRoutesSource,
} from "./register-events-oracle-helpers.js";

describe("card-mod-follow event rows against the EXECUTED Ruby oracle", () => {
  it("follow_fields_changed: the same two cache drops, and the declaration carries no when clause", () => {
    const captured = readOracle("follow-follow-fields-changed");

    expect(captured.executed.raised).toBeNull();
    expect(captured.executed.recorded_calls).toEqual([
      "Card.clear_follower_ids_cache",
      "Card::Rule.clear_preference_cache",
    ]);
    expect(captured.executed.recorded_call_count).toBe(2);

    // the pinned declaration the capture read out of the gemset: the
    // sibling's `when: :preference?` gate is NOT this event's gate.
    expect(captured.pinned_declaration).toBe("event :follow_fields_changed, :integrate do");
    expect(captured.pinned_declaration).not.toContain("when:");
    expect(captured.pinned_body.trim()).toBe("Card.follow_caches_expired");
    expect(captured.pinned_cache_read.body).toContain("Card.cache.read");

    const decl = declaredEvents(cardModFollow).find((d) => d.event === "follow_fields_changed");
    expect(decl, "follow_fields_changed not declared").toBeDefined();
    expect(decl!.setPath).toBe("right/follow_fields");
    expect(decl!.at).toBe("integrate");
    expect(decl!.when).toBeUndefined();
    expect(decl!.on).toBeUndefined();
    // Ruby's effect is cache drops; the port holds no cache, so the
    // registered body stays the honest no-op.
    expect(typeof decl!.fn).toBe("function");
    expect((decl!.fn as () => unknown)()).toBeUndefined();
  });
});
