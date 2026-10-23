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

  it("update_follow_rules: the executed Ruby body is a bulk write under Auth.as_bot, and the port parses no such trigger", () => {
    const captured = readOracle("follow-update-follow-rules");

    expect(captured.executed.raised).toBeNull();
    // the recorded call sequence is the bulk write, in Ruby's order
    expect(captured.executed.recorded_calls).toEqual([
      "Auth.as_bot",
      "Card.search",
      "Card.fetch",
      "follow_rule.drop_item",
      "follow_rule.drop_item",
      "follow_rule.add_item",
      "follow_rule.save!",
      "Card.follow_caches_expired",
    ]);
    // the two drops are the pinned ones, in the pinned order
    const drops = captured.executed.recorded_arguments.filter(
      (entry: any) => entry.call === "follow_rule.drop_item",
    );
    expect(drops.map((entry: any) => entry.arguments[0])).toEqual(["*never", "*always"]);
    // the search is the pinned one: every user in the deck
    const search = captured.executed.recorded_arguments.find(
      (entry: any) => entry.call === "Card.search",
    );
    expect(search.arguments[0]).toEqual({ type: "user" });
    expect(captured.pinned_declaration).toBe(
      "event :update_follow_rules, :finalize, on: :save, trigger: :required do",
    );
    // and the pinned trigger rule the event's reachability rests on
    expect(captured.pinned_trigger_rule.file).toBe(
      "card-1.110.0/lib/card/set/event/skip_and_trigger.rb",
    );
    expect(captured.pinned_trigger_rule.lines.length).toBeGreaterThan(0);

    // the port keeps Ruby's clauses and the honest stub
    const decl = declaredEvents(cardModFollow).find((d) => d.event === "update_follow_rules");
    expect(decl, "update_follow_rules not declared").toBeDefined();
    expect(decl!.setPath).toBe("self/follow_defaults");
    expect(decl!.at).toBe("finalize");
    expect(decl!.on).toEqual(["save"]);
    expect(decl!.trigger).toBe("required");
    expect(typeof decl!.fn).toBe("function");
    expect((decl!.fn as () => unknown)()).toBeUndefined();

    // and the reachability half: the serving write route parses no
    // update_follow_rules trigger, so trigger: :required can never fire.
    const triggers = parsedWriteRouteTriggers(writeRoutesSource());
    expect(triggers.length).toBeGreaterThan(0);
    expect(triggers).not.toContain("update_follow_rules");
  });
});
