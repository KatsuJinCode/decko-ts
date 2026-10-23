// register-events-round-two-oracle-parity.test.ts - the register-events
// working rows round two adjudicated, each pinned against its OWN executed
// Ruby oracle capture.
//
// WHAT THIS FILE IS. Round one closed the rows whose port registration
// carries a real body, by executing the pinned gem's own event body over
// recording doubles and pinning the port against what the execution
// recorded. The rows round one left WORKING are the ones whose port
// registration carries the mod files' stub body, a named skip, or a body
// that stands down because the engine owns the behaviour.
//
// This file carries those rows. For each one it states, from the executed
// capture, what Ruby's own body does, and from the port, what the
// registration carries. A row whose port body answers the capture CLOSES
// here. A row whose port body does not answer it stays WORKING, and the
// divergence is pinned HERE, so the gap is visible in the suite and not
// only in the register's prose.
//
// EVERY capture this file reads was produced by RUNNING the pinned gem's
// own body: the pinned file, declaration and body come out of the pinned
// gemset by line, and the body is executed by
// tests/server/oracle-capture-register-events-generic-ruby.rb over the
// recording doubles, driven by the row's own spec in
// tests/server/register-events-specs/. Nothing here was produced by
// reading the Ruby and transcribing what it looks like it would do.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import coreMod from "../../../src/card/mod-loader/mods/core-mod.js";
import type { DeckoModManifest } from "../../../src/card/mod-loader/mod-manifest.js";

type Capture = {
  row: string;
  event: string;
  pinned_file: string;
  pinned_declaration: string;
  pinned_declaration_line: number;
  pinned_body: string;
  scenarios?: Array<Record<string, any>>;
  [key: string]: any;
};

/** One executed Ruby capture, read from the committed fixture. */
export function capture(slug: string): Capture {
  const path = new URL(`../../../fixtures/captured/${slug}-ruby-oracle.json`, import.meta.url);
  return JSON.parse(readFileSync(path, "utf8"));
}

/** The port's own registration of the event, out of the mod's manifest. */
export function registration(mod: DeckoModManifest, event: string): Record<string, any> {
  for (const file of mod.setModules ?? []) {
    for (const declared of file.events ?? []) {
      if ((declared as Record<string, any>).event === event) return declared as Record<string, any>;
    }
  }
  throw new Error(`no registration for ${event}`);
}

/** The stub factory's own body, as the mod files hand it out. */
export function carriesStubBody(declared: Record<string, any>): boolean {
  return typeof declared.fn === "function" && /stubEvent/.test(String(declared.fn));
}

/** The calls one executed scenario made, by name, each qualified by the
 *  double it was made on ("each_child.include_set_modules"). */
export function callsOf(scenario: Record<string, any> | undefined): string[] {
  return ((scenario?.calls ?? []) as Array<Record<string, any>>).map((call) =>
    call.under ? `${call.under}.${call.call}` : String(call.call),
  );
}

/** The error messages one executed scenario added. */
export function errorsOf(scenario: Record<string, any> | undefined): unknown[] {
  return ((scenario?.errors_added ?? []) as Array<Record<string, any>>).map((e) => e.message);
}

describe("the events family, round two: the working rows against their own executed captures", () => {
  it("delete_children: the executed body, and the port's stub that stands down from it", () => {
    const oracle = capture("delete-children");
    const declared = registration(coreMod, "delete_children");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/trash.rb");
    expect(oracle.pinned_declaration_line).toBe(46);
    expect(oracle.executed).toBe(true);

    // what Ruby did, from the execution:
    // the body returns before it touches a child when the card carries an
    // error, and deletes every child it has when the card carries none.
    const withError = oracle.scenarios?.[0];
    const withoutError = oracle.scenarios?.[1];
    expect(callsOf(withError), "the errored card's children").toEqual([]);
    expect(callsOf(withoutError), "the clean card's children").toEqual([
      "each_child",
      "each_child.include_set_modules",
      "delete_as_subcard",
      "each_child.include_set_modules",
      "delete_as_subcard",
    ]);

    // the port's registration is the pinned declaration, and the body it
    // carries is the stub factory's own, so the row does NOT close here:
    // the port's delete path owns the recursive child delete, not this
    // registration. Pinned so the stub cannot drift unnoticed.
    expect(declared.after).toBe("validate_delete");
    expect(declared.on).toEqual(["delete"]);
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("expire_old_name: the executed body, and the port's stub that stands down from it", () => {
    const oracle = capture("expire-old-name");
    const declared = registration(coreMod, "expire_old_name");

    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/name_events.rb");
    expect(oracle.pinned_declaration_line).toBe(56);

    // what Ruby did: the body pushes the name the card had BEFORE the act
    // onto the director's expirees, and pushes nil on a create, where the
    // name before the act is nil.
    const renamed = oracle.scenarios?.[0];
    const created = oracle.scenarios?.[1];
    expect(callsOf(renamed)).toEqual(["Director.expirees", "name_before_act", "Director.<<"]);
    expect((renamed?.calls ?? []).at(-1)?.arguments).toEqual(["Old+Name"]);
    expect((created?.calls ?? []).at(-1)?.arguments).toEqual([null]);

    // the port's registration is the pinned declaration, with the stub
    // body, so the row does NOT close here: the port's save path owns the
    // expire machinery (both key versions), not this registration.
    expect(declared.at).toBe("store");
    expect(declared.on).toEqual(["update"]);
    expect(declared.changed).toEqual(["name"]);
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("manage_trash: the executed body, and the port's stub that stands down from it", () => {
    const oracle = capture("manage-trash");
    const declared = registration(coreMod, "manage_trash");

    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/trash.rb");
    expect(oracle.pinned_declaration_line).toBe(23);

    // what Ruby did: the create-stage body pulls the card back out of the
    // trash, writes trash = false, and answers true.
    const revived = oracle.scenarios?.[0];
    expect(callsOf(revived)).toEqual(["pull_from_trash!", "trash="]);
    expect(revived?.writes).toEqual([{ attribute: "trash", value: false }]);
    expect(revived?.outcome?.raised).toBeNull();
    expect(revived?.outcome?.returned).toBe(true);

    // the port's registration is the pinned declaration with the stub
    // body: the revival is the create write path's own work, which a
    // registered body cannot reach without re-designing the write order.
    expect(declared.at).toBe("prepare_to_store");
    expect(declared.on).toEqual(["create"]);
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("notable_exception_raised: the executed body's log line, and the port's stub that stands down from it", () => {
    const oracle = capture("notable-exception-raised");
    const declared = registration(coreMod, "notable_exception_raised");

    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/result.rb");
    expect(oracle.pinned_declaration_line).toBe(1);

    // what Ruby did: the body reads the error in flight and hands the
    // logger one debug line, the message and the backtrace joined by a
    // newline and two spaces. That joined string is the capture's, not a
    // transcription: the pinned bytes built it.
    const logged = oracle.scenarios?.[0];
    expect(callsOf(logged)).toEqual(["debug"]);
    expect((logged?.calls ?? [])[0]?.arguments).toEqual([
      "something went wrong\nfirst frame\n  second frame",
    ]);

    // the port's registration carries the stub body: the report callback
    // chain is an error-reporting surface the headless port has no logger
    // equivalent for, so the row does NOT close here.
    expect(declared.at).toBeUndefined();
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("prepare_left_and_right: the executed body's two arms, and the port's stub", () => {
    const oracle = capture("prepare-left-and-right");
    const declared = registration(coreMod, "prepare_left_and_right");

    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/name_events.rb");
    expect(oracle.pinned_declaration_line).toBe(67);

    // what Ruby did: a simple name returns before either side is
    // prepared; a compound name prepares the left side and then the
    // right, in that order.
    const simple = oracle.scenarios?.[0];
    const compound = oracle.scenarios?.[1];
    expect(callsOf(simple)).toEqual(["name"]);
    expect(callsOf(compound)).toEqual(["name", "prepare_side", "prepare_side"]);
    expect((compound?.calls ?? []).slice(1).map((c: any) => c.arguments[0])).toEqual([
      "left",
      "right",
    ]);

    // the port's registration is the pinned declaration with the stub
    // body: the junction side preparation is engine-owned, and moving it
    // into the dispatch would reorder it against the validate-stage checks
    // the walk interleaves. The row does NOT close here.
    expect(declared.at).toBe("store");
    expect(declared.on).toEqual(["save"]);
    expect(declared.changed).toEqual(["name"]);
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("reject_empty_subcards: the executed body's drops, over the PINNED each_with_key", () => {
    const oracle = capture("reject-empty-subcards");
    const declared = registration(coreMod, "reject_empty_subcards");

    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/subcards.rb");
    expect(oracle.pinned_declaration_line).toBe(5);

    // what Ruby did, with the collection's OWN pinned method
    // (card-1.110.0/lib/card/subcards.rb:83-88) walking the spec's keys:
    // a new, unfilled subcard under no trigger is dropped from the
    // director; a filled one is kept; one under a trigger is kept.
    const both = oracle.scenarios?.[0];
    const oneFilled = oracle.scenarios?.[1];
    const underTrigger = oracle.scenarios?.[2];
    expect(callsOf(both)).toEqual([
      "subcards",
      "trigger",
      "drop_subcard",
      "director",
      "subdirectors",
      "delete",
      "trigger",
      "drop_subcard",
      "director",
      "subdirectors",
      "delete",
    ]);
    expect(
      (both?.calls ?? []).filter((c: any) => c.call === "drop_subcard").map((c: any) => c.arguments[0]),
    ).toEqual(["left", "right"]);
    expect(
      (oneFilled?.calls ?? []).filter((c: any) => c.call === "drop_subcard").map((c: any) => c.arguments[0]),
    ).toEqual(["right"]);
    expect(callsOf(underTrigger)).toEqual(["subcards", "trigger"]);

    // the port's registration is the pinned declaration with the stub
    // body: the save input's subcard-tree handling owns the drop, and the
    // director.subdirectors mutation is a mutable collection the save input
    // model does not carry. The row does NOT close here.
    expect(declared.at).toBe("prepare_to_validate");
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("rename_in_trash: the executed body's two arms, and the port's stub", () => {
    const oracle = capture("rename-in-trash");
    const declared = registration(coreMod, "rename_in_trash");

    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/name_events.rb");
    expect(oracle.pinned_declaration_line).toBe(60);

    // what Ruby did: with a trashed card already on the key, the body
    // renames it as the trash obstacle; with no trashed card on the key,
    // it returns before it renames anything.
    const obstacle = oracle.scenarios?.[0];
    const noObstacle = oracle.scenarios?.[1];
    expect(callsOf(obstacle)).toEqual(["name", "rename_as_trash_obstacle"]);
    expect(callsOf(noObstacle)).toEqual(["name"]);

    // the port's registration is the pinned declaration (after:
    // expire_old_name, on: :update) with the stub body: the obstacle
    // rename is the save path's own work. The row does NOT close here.
    expect(declared.after).toBe("expire_old_name");
    expect(declared.on).toEqual(["update"]);
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("reset_codename_cache: the executed body's early return, and the port's stub", () => {
    const oracle = capture("reset-codename-cache");
    const declared = registration(coreMod, "reset_codename_cache");

    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/codename.rb");
    expect(oracle.pinned_declaration_line).toBe(7);

    // what Ruby did: an update that sets a codename resets the codename
    // cache; a create with no codename returns before it resets anything.
    const updated = oracle.scenarios?.[0];
    const created = oracle.scenarios?.[1];
    expect(callsOf(updated)).toEqual(["action", "Codename.reset_cache"]);
    expect(callsOf(created)).toEqual(["action", "codename"]);

    // the port's registration is the pinned declaration (:integrate,
    // changed: :codename) with the stub body: the reset is the save path's
    // own work. The row does NOT close here.
    expect(declared.at).toBe("integrate");
    expect(declared.changed).toEqual(["codename"]);
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("save_draft: the executed body's draft write and the PINNED abort it ends with", () => {
    const oracle = capture("save-draft");
    const declared = registration(coreMod, "save_draft");

    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/content.rb");
    expect(oracle.pinned_declaration_line).toBe(7);

    // what Ruby did: the body saves the content as a draft and then calls
    // the card's OWN abort, which is the pinned method
    // (card-1.110.0/mod/core/set/all/result.rb:19-28), and that raises the
    // pinned Card::Error::Abort with the status :success.
    const draft = oracle.scenarios?.[0];
    expect(callsOf(draft)).toEqual([
      "content",
      "save_content_draft",
      "director",
      "abort",
    ]);
    expect(draft?.outcome?.raised).toBe("Card::Error::Abort");
    expect(draft?.outcome?.status).toBe("success");

    // the port's registration is the pinned declaration (:store, on:
    // :update, when: :draft?) with the stub body: the draft seam is the
    // update path's own work. The row does NOT close here.
    expect(declared.at).toBe("store");
    expect(declared.on).toEqual(["update"]);
    expect(declared.when).toBe("draft?");
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("set_autoname: the executed body's four writes, and the port's stub", () => {
    const oracle = capture("set-autoname");
    const declared = registration(coreMod, "set_autoname");

    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/autoname.rb");
    expect(oracle.pinned_declaration_line).toBe(1);

    // what Ruby did: the body names the card from the autoname rule,
    // writes that name into the rule card's content, expires the rule
    // card, pulls the card out of the trash and writes it to the temp
    // cache. The name the body writes is read back by the body itself,
    // which is why the rule card's content carries the new name.
    const named = oracle.scenarios?.[0];
    expect(callsOf(named)).toEqual([
      "rule",
      "autoname",
      "name=",
      "rule_card",
      "name",
      "update_column",
      "expire",
      "pull_from_trash!",
    ]);
    expect(named?.writes).toEqual([{ attribute: "name", value: "Joe User+Account" }]);
    const updateColumn = (named?.calls ?? []).find((c: any) => c.call === "update_column");
    expect(updateColumn?.arguments).toEqual(["db_content", "Joe User+Account"]);

    // the port's registration is the pinned declaration (:prepare_to_store,
    // on: :create, when: :autoname?) with the stub body: the port's
    // autoname? predicate reads a rule card that is always false, so a
    // registered body would be unreachable. The row does NOT close here.
    expect(declared.at).toBe("prepare_to_store");
    expect(declared.on).toEqual(["create"]);
    expect(declared.when).toBe("autoname?");
    expect(carriesStubBody(declared)).toBe(true);
  });

  // ROWS-APPEND-HERE
});