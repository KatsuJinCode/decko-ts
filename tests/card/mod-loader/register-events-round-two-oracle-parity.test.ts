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
import cardModCarrierwave from "../../../src/card/mod-loader/mods/card-mod-carrierwave.js";
import cardModAssets from "../../../src/card/mod-loader/mods/card-mod-assets.js";
import cardModBootstrap from "../../../src/card/mod-loader/mods/card-mod-bootstrap.js";
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

/** The stub body, as the mod files hand it out: the core mod's stub
 *  factory, or the mod files' own no-op arrow. */
export function carriesStubBody(declared: Record<string, any>): boolean {
  if (typeof declared.fn !== "function") return false;
  const text = String(declared.fn);
  return /stubEvent/.test(text) || /^\s*\(\)\s*=>\s*undefined/.test(text);
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

  it("set_content: the executed body's content write, and the port's stub", () => {
    const oracle = capture("set-content");
    const declared = registration(coreMod, "set_content");

    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/content.rb");
    expect(oracle.pinned_declaration_line).toBe(1);

    // what Ruby did: the body writes the PREPARED content (not the posted
    // one) onto the card and clears the drafts.
    const saved = oracle.scenarios?.[0];
    expect(callsOf(saved)).toEqual(["prepare_db_content", "content=", "clear_drafts"]);
    expect(saved?.writes).toEqual([{ attribute: "content", value: "<p>prepared body</p>" }]);

    // the port's registration is the pinned declaration (:store, on: :save)
    // with the stub body: the content preparation and the draft clear are
    // the writer's own work. The row does NOT close here.
    expect(declared.at).toBe("store");
    expect(declared.on).toEqual(["save"]);
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("set_default_content: the executed body's template write, and the port's stub", () => {
    const oracle = capture("set-default-content");
    const declared = registration(coreMod, "set_default_content");

    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/content.rb");
    expect(oracle.pinned_declaration_line).toBe(12);
    // the gem writes this declaration over two lines, and the capture
    // carries both of the gem's own lines
    expect(oracle.pinned_declaration).toContain(
      "event :set_default_content, :prepare_to_validate,",
    );
    expect(oracle.pinned_declaration).toContain("on: :create, when: :use_default_content? do");

    // what Ruby did: the body writes the type's default content as the
    // card's db_content.
    const created = oracle.scenarios?.[0];
    expect(callsOf(created)).toEqual(["default_content", "db_content="]);
    expect(created?.writes).toEqual([
      { attribute: "db_content", value: "<p>template body</p>" },
    ]);

    // the port's registration is the pinned declaration
    // (:prepare_to_validate, on: :create, when: :use_default_content?) with
    // the stub body: the template read is the create validation's own arm.
    // The row does NOT close here.
    expect(declared.at).toBe("prepare_to_validate");
    expect(declared.on).toEqual(["create"]);
    expect(declared.when).toBe("use_default_content?");
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("update_lexicon: the executed body's lexicon action, and the port's stub", () => {
    const oracle = capture("update-lexicon");
    const declared = registration(coreMod, "update_lexicon");

    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/name_events.rb");
    expect(oracle.pinned_declaration_line).toBe(76);

    // what Ruby did: the body schedules the lexicon work in an
    // after_store callback, and the action it schedules is the ACTION the
    // card was saved under: add on a create, the action itself otherwise.
    const created = oracle.scenarios?.[0];
    const updated = oracle.scenarios?.[1];
    expect(callsOf(created)).toEqual(["director", "after_store", "Lexicon.add"]);
    expect(callsOf(updated)).toEqual(["director", "after_store", "Lexicon.update"]);

    // the port's registration is the pinned declaration (:store,
    // changed: :name) with the stub body: the lexicon maintenance is the
    // post-store work of the save path. The row does NOT close here.
    expect(declared.at).toBe("store");
    expect(declared.changed).toEqual(["name"]);
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("validate_codename: the executed body's three checks and the PINNED helper methods", () => {
    const oracle = capture("validate-codename");
    const declared = registration(coreMod, "validate_codename");

    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/codename.rb");
    expect(oracle.pinned_declaration_line).toBe(1);

    // what Ruby did, with the card's OWN helper methods (codename.rb:17-45)
    // run from their pinned bytes: a cleared codename is cleared again and
    // no error is added; a codename another card owns is refused with the
    // PINNED locale's own text.
    const cleared = oracle.scenarios?.[0];
    const taken = oracle.scenarios?.[1];
    expect(callsOf(cleared)).toEqual([
      "Auth.always_ok?",
      "codename",
      "codename=",
      "name",
      "simple?",
    ]);
    expect(cleared?.writes).toEqual([{ attribute: "codename", value: null }]);
    expect(errorsOf(cleared)).toEqual([]);
    expect(errorsOf(taken)).toEqual(["codename account already in use"]);

    // the port's registration is the pinned declaration (:validate,
    // on: :update, changed: :codename) with the stub body: the codename
    // handling is the create/update input's own work. The row does NOT
    // close here.
    expect(declared.at).toBe("validate");
    expect(declared.on).toEqual(["update"]);
    expect(declared.changed).toEqual(["codename"]);
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("validate_key: the executed body's two refusals, in the PINNED locale's words", () => {
    const oracle = capture("validate-key");
    const declared = registration(coreMod, "validate_key");

    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/name_events.rb");
    expect(oracle.pinned_declaration_line).toBe(38);

    // what Ruby did: a key that matches the name's key passes; an empty
    // key is refused with the blank-key text; a key that is not the name's
    // key is refused with the wrong-key text, and the text names both.
    const matching = oracle.scenarios?.[0];
    const blank = oracle.scenarios?.[1];
    const wrong = oracle.scenarios?.[2];
    expect(errorsOf(matching)).toEqual([]);
    expect(errorsOf(blank)).toEqual(["cannot be blank"]);
    expect(errorsOf(wrong)).toEqual(["wrong key 'other' for name Decko"]);

    // the port's registration is the pinned declaration (after:
    // validate_name, on: :save, when: :no_autoname?) with the stub body:
    // the computed-key check is the update walk's own work. The row does
    // NOT close here.
    expect(declared.after).toBe("validate_name");
    expect(declared.on).toEqual(["save"]);
    expect(declared.when).toBe("no_autoname?");
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("validate_legality_of_name: the executed body's chain, in the PINNED locale's words", () => {
    const oracle = capture("validate-legality-of-name");
    const declared = registration(coreMod, "validate_legality_of_name");

    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/name_events.rb");
    expect(oracle.pinned_declaration_line).toBe(23);

    // what Ruby did: a legal name passes the whole chain; a name over 255
    // characters is refused with the too-long text; a blank name is refused
    // with the blank-name text.
    const legal = oracle.scenarios?.[0];
    const tooLong = oracle.scenarios?.[1];
    const blank = oracle.scenarios?.[2];
    expect(errorsOf(legal)).toEqual([]);
    expect(errorsOf(tooLong)).toEqual([
      "is too long (255 character maximum; length is 300)",
    ]);
    expect(errorsOf(blank)).toEqual(["can't be blank"]);

    // the port's registration carries the stub body: the name-legality
    // chain is the validate walk's own work. The row does NOT close here.
    expect(declared.at).toBeUndefined();
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("validate_name: the executed body's two stages, over the PINNED event bodies it calls", () => {
    const oracle = capture("validate-name");
    const declared = registration(coreMod, "validate_name");

    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/name_events.rb");
    expect(oracle.pinned_declaration_line).toBe(3);

    // what Ruby did: the body runs the legality chain, and only when the
    // chain added no error does it write the temp cache and run the
    // uniqueness check. The two bodies it calls are the deck's own event
    // bodies (name_events.rb:22-35 and :12-20), run from their pinned
    // bytes.
    const legal = oracle.scenarios?.[0];
    const tooLong = oracle.scenarios?.[1];
    expect(callsOf(legal)).toEqual([
      "name",
      "name",
      "empty?",
      "name_incomplete?",
      "name",
      "changing_existing_tag_to_compound?",
      "key",
      "Lexicon.id",
    ]);
    expect(errorsOf(legal)).toEqual([]);
    expect(callsOf(tooLong)).toEqual(["name", "name"]);
    expect(errorsOf(tooLong)).toEqual([
      "is too long (255 character maximum; length is 300)",
    ]);

    // the port's registration is the pinned declaration (:validate,
    // on: :save, changed: :name, when: :no_autoname?) with the stub body:
    // the name validation is the save walk's own work. The row does NOT
    // close here.
    expect(declared.at).toBe("validate");
    expect(declared.on).toEqual(["save"]);
    expect(declared.changed).toEqual(["name"]);
    expect(declared.when).toBe("no_autoname?");
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("validate_renaming: the executed body's early return and its two refusals", () => {
    const oracle = capture("validate-renaming");
    const declared = registration(coreMod, "validate_renaming");

    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/name_events.rb");
    expect(oracle.pinned_declaration_line).toBe(46);

    // what Ruby did: a rename to a new variant of the same name returns
    // before it checks anything; a rename that changes the content is
    // refused with the content text; a rename that changes the type is
    // refused with the type text. Both refusals then run the compound-name
    // check.
    const variant = oracle.scenarios?.[0];
    const content = oracle.scenarios?.[1];
    const type = oracle.scenarios?.[2];
    expect(callsOf(variant)).toEqual(["name_before_act", "name"]);
    expect(errorsOf(variant)).toEqual([]);
    expect(callsOf(content)).toEqual([
      "name_before_act",
      "name",
      "content_is_changing?",
      "type_is_changing?",
      "detect_illegal_compound_names",
    ]);
    expect(errorsOf(content)).toEqual(["cannot change content while changing name"]);
    expect(errorsOf(type)).toEqual(["cannot change type while changing name"]);

    // the port's registration is the pinned declaration (:validate,
    // on: :update, changed: :name, skip: :allowed) with the stub body:
    // the rename guards are the update walk's own work. The row does NOT
    // close here.
    expect(declared.at).toBe("validate");
    expect(declared.on).toEqual(["update"]);
    expect(declared.changed).toEqual(["name"]);
    expect(declared.skip).toBe("allowed");
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("validate_type_change: the executed body's duplicate walk and its refusal", () => {
    const oracle = capture("validate-type-change");
    const declared = registration(coreMod, "validate_type_change");

    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/type.rb");
    expect(oracle.pinned_declaration_line).toBe(8);

    // what Ruby did: the body duplicates the card, treats the duplicate as
    // a new card of the new type, and refuses the change when that
    // duplicate does not validate. A duplicate that validates passes.
    const refused = oracle.scenarios?.[0];
    const passed = oracle.scenarios?.[1];
    expect(callsOf(refused)).toEqual(["action", "valid?", "name", "type_id"]);
    expect(errorsOf(refused)).toEqual([
      "of Decko can't be changed; errors creating new 3: []",
    ]);
    expect(callsOf(passed)).toEqual(["action", "valid?"]);
    expect(errorsOf(passed)).toEqual([]);

    // the port's registration is the pinned declaration (:validate,
    // on: :update, changed: :type_id) with the stub body: the duplicate
    // walk over the whole create validation surface is not a callable unit
    // of the port's save path. The row does NOT close here.
    expect(declared.at).toBe("validate");
    expect(declared.on).toEqual(["update"]);
    expect(declared.changed).toEqual(["type_id"]);
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("validate_uniqueness_of_name: the executed body's two lookups and its refusal", () => {
    const oracle = capture("validate-uniqueness-of-name");
    const declared = registration(coreMod, "validate_uniqueness_of_name");

    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/name_events.rb");
    expect(oracle.pinned_declaration_line).toBe(12);

    // what Ruby did: the body asks the lexicon for the card on the key,
    // and only when a LIVE card owns it does it refuse with the pinned
    // locale's own text naming the card that owns the name.
    const free = oracle.scenarios?.[0];
    const taken = oracle.scenarios?.[1];
    expect(callsOf(free)).toEqual(["key", "Lexicon.id"]);
    expect(errorsOf(free)).toEqual([]);
    expect(callsOf(taken)).toEqual(["key", "Lexicon.id", "id"]);
    expect(errorsOf(taken)).toEqual([
      "must be unique; 'Joe User+Card' already exists.",
    ]);

    // the port's registration carries the stub body (and the pinned
    // declaration's own skip: :allowed): the name uniqueness check is the
    // update walk's own work. The row does NOT close here.
    expect(declared.skip).toBe("allowed");
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("remove_file_event: the TEMPLATE expansion, executed, and the port's stub", () => {
    const oracle = capture("remove-file-event");
    const declared = registration(cardModCarrierwave, "remove_file_event");

    // the event is a TEMPLATE expansion: the gem writes it inside a
    // class_eval string (card-mod-carrierwave-0.20.0/lib/carrier_wave/
    // card_mount.rb:23-58) and the column names it. The capture reads the
    // expansion out of that pinned file by line.
    expect(oracle.pinned_file).toBe(
      "card-mod-carrierwave-0.20.0/lib/carrier_wave/card_mount.rb",
    );
    expect(oracle.pinned_declaration_line).toBe(37);
    expect(oracle.pinned_declaration).toContain(
      "event :remove_file_event, :finalize, on: :delete, when: :no_history? do",
    );

    // what Ruby did: the expanded body asks the mounter to remove the file
    const expanded = oracle.scenarios?.[0];
    expect(callsOf(expanded)).toEqual(["remove_file!"]);

    // the port's registration is the expansion, clause for clause, and the
    // body it carries is the stub: the port's delete path carries no
    // stored-file cleanup, so the files of a deleted card's actions stay on
    // disk where Ruby removes them. The row does NOT close here.
    expect(declared.at).toBe("finalize");
    expect(declared.on).toEqual(["delete"]);
    expect(declared.when).toBe("no_history?");
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("remove_image_event: the TEMPLATE expansion, executed, and the port's stub", () => {
    const oracle = capture("remove-image-event");
    const declared = registration(cardModCarrierwave, "remove_image_event");

    // the same TEMPLATE, expanded for the image column: the gem writes the
    // event inside a class_eval string
    // (card-mod-carrierwave-0.20.0/lib/carrier_wave/card_mount.rb:23-58)
    // and the column names it.
    expect(oracle.pinned_file).toBe(
      "card-mod-carrierwave-0.20.0/lib/carrier_wave/card_mount.rb",
    );
    expect(oracle.pinned_declaration_line).toBe(37);
    expect(oracle.pinned_declaration).toContain(
      "event :remove_image_event, :finalize, on: :delete, when: :no_history? do",
    );

    // what Ruby did: the expanded body asks the mounter to remove the
    // IMAGE, never the file
    const expanded = oracle.scenarios?.[0];
    expect(callsOf(expanded)).toEqual(["remove_image!"]);

    // the port's registration is the expansion, clause for clause, and the
    // body it carries is the stub: the port's delete path carries no
    // stored-image cleanup. The row does NOT close here.
    expect(declared.at).toBe("finalize");
    expect(declared.on).toEqual(["delete"]);
    expect(declared.when).toBe("no_history?");
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("remove_codename: the executed body's attachment load and codename clear", () => {
    const oracle = capture("remove-codename");
    const declared = registration(cardModAssets, "remove_codename");

    expect(oracle.pinned_file).toBe("card-mod-assets-0.20.0/set/right/asset_output.rb");
    expect(oracle.pinned_declaration_line).toBe(13);

    // what Ruby did: the body loads the attachment (so the file is there
    // before the codename goes) and clears the codename.
    const deleted = oracle.scenarios?.[0];
    expect(callsOf(deleted)).toEqual(["attachment", "codename="]);
    expect(deleted?.writes).toEqual([{ attribute: "codename", value: null }]);

    // the port's registration is the pinned declaration
    // (:prepare_to_validate, on: :delete, when: :codename?) with the stub
    // body: deleting a codenamed asset output card is refused as a system
    // card where Ruby deletes it and clears the codename, and the codename
    // mutation would have to reach the trash write as a column in the
    // delete's update. The row does NOT close here.
    expect(declared.at).toBe("prepare_to_validate");
    expect(declared.on).toEqual(["delete"]);
    expect(declared.when).toBe("codename?");
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("copy_theme: the executed body's theme initialization, and the port's no-op", () => {
    const oracle = capture("copy-theme");
    const declared = registration(cardModBootstrap, "copy_theme");

    expect(oracle.pinned_file).toBe(
      "card-mod-bootstrap-0.20.0/set/type/bootswatch_skin/events.rb",
    );
    expect(oracle.pinned_declaration_line).toBe(10);

    // what Ruby did: the body initializes the theme, and the pinned
    // initialize_theme (events.rb:28-31) adds the two scss fields.
    const created = oracle.scenarios?.[0];
    expect(callsOf(created)).toEqual(["field", "field"]);
    expect((created?.calls ?? []).map((c: any) => c.arguments[0])).toEqual([
      "colors",
      "variables",
    ]);

    // the port's registration is the pinned declaration
    // (:prepare_to_store, on: :create) and the body it carries is the
    // no-op: the event fires and does nothing where Ruby writes the two
    // scss fields. The row does NOT close here.
    expect(declared.at).toBe("prepare_to_store");
    expect(declared.on).toEqual(["create"]);
    expect(carriesStubBody(declared)).toBe(true);
  });

  // ROWS-APPEND-HERE
});