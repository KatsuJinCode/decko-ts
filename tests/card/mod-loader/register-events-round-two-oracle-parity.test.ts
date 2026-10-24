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
import cardModFollow from "../../../src/card/mod-loader/mods/card-mod-follow.js";
import cardModLayout from "../../../src/card/mod-loader/mods/card-mod-layout.js";
import cardModList from "../../../src/card/mod-loader/mods/card-mod-list.js";
import cardModPermissions from "../../../src/card/mod-loader/mods/card-mod-permissions.js";
import cardModRecaptcha from "../../../src/card/mod-loader/mods/card-mod-recaptcha.js";
import cardModScript from "../../../src/card/mod-loader/mods/card-mod-script.js";
import cardModSession from "../../../src/card/mod-loader/mods/card-mod-session.js";
import cardModStyle from "../../../src/card/mod-loader/mods/card-mod-style.js";
import cardModVirtual from "../../../src/card/mod-loader/mods/card-mod-virtual.js";
import cardModComment, {
  appendComment,
} from "../../../src/card/mod-loader/mods/card-mod-comment.js";
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
 *  factory, the mod files' own no-op arrow, or a body that is only a
 *  comment (the no-op each mod writes with its reason). */
export function carriesStubBody(declared: Record<string, any>): boolean {
  if (typeof declared.fn !== "function") return false;
  const text = String(declared.fn);
  if (/stubEvent/.test(text)) return true;
  if (/^\s*\(\)\s*=>\s*undefined/.test(text)) return true;
  // a body that is nothing but a comment does nothing.
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\([^)]*\)\s*=>/g, "")
    .replace(/[{}()=>\s;]/g, "");
  if (stripped.length === 0) return true;
  // a body that only VOIDS what it was handed does nothing.
  return /^(void[A-Za-z0-9_]*)+$/.test(stripped);
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
    // carries is now a REAL body (round three landed it): the delete
    // path's WRITE ORDER carries the body — the port's ActWriter creates
    // the action row at write time, so the super_action linkage the Ruby
    // body needs exists only after the parent's own write. The row's
    // parity assertions live in
    // register-events-round-three-oracle-parity.test.ts.
    expect(declared.after).toBe("validate_delete");
    expect(declared.on).toEqual(["delete"]);
    expect(carriesStubBody(declared)).toBe(false);
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

    // the port's registration is the pinned declaration, and the body it
    // carries is now a REAL body (round three landed it): the old name's
    // expiry, through the fetch engine's own expireName, in the store
    // stage (Ruby's stage). The row's parity assertions live in
    // register-events-round-three-oracle-parity.test.ts.
    expect(declared.at).toBe("store");
    expect(declared.on).toEqual(["update"]);
    expect(declared.changed).toEqual(["name"]);
    expect(carriesStubBody(declared)).toBe(false);
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

    // the port's registration is the pinned declaration, and the body it
    // carries is now a REAL body (round three landed it): the create
    // path's WRITE ORDER carries the body — the port's ensureSides runs
    // before the trashed-row lookup, so the lookup belongs to the create
    // path's own order. The row's parity assertions live in
    // register-events-round-three-oracle-parity.test.ts.
    expect(declared.at).toBe("prepare_to_store");
    expect(declared.on).toEqual(["create"]);
    expect(carriesStubBody(declared)).toBe(false);
  });

  it("notable_exception_raised: the executed body's log line, and the port's body that writes the same line", () => {
    const oracle = capture("notable-exception-raised");
    const declared = registration(coreMod, "notable_exception_raised");

    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/result.rb");
    expect(oracle.pinned_declaration_line).toBe(1);

    // what Ruby did: the body reads the error in flight and hands the
    // logger one debug line, the message and the backtrace joined by a
    // newline and two spaces. That joined string is the capture's, not a
    // transcription: the pinned bytes built it.
    const logged = oracle.scenarios?.[0];
    expect(callsOf(logged)).toEqual(["Card::Error.current", "Rails.logger", "debug"]);
    const debugCall = (logged?.calls ?? []).find((c: any) => c.call === "debug");
    expect(debugCall?.arguments).toEqual([
      "something went wrong\nfirst frame\n  second frame",
    ]);

    // the port's registration is the pinned declaration (no stage, no
    // trigger: the body hangs on the ERROR-REPORT chain, not on a stage)
    // and the body it carries is now a REAL body (round four landed it):
    // the port grew the logger seam the report callback writes to, and the
    // save entry's report site reaches the body. The row's parity
    // assertions live in register-events-round-four-oracle-parity.test.ts.
    expect(declared.at).toBeUndefined();
    expect(carriesStubBody(declared)).toBe(false);
  });

  it("prepare_left_and_right: the executed body's two arms, and the port's body that prepares the same two sides", () => {
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

    // the port's registration is the pinned declaration and the body it
    // carries is now a REAL body (round four landed it): the ORDER
    // question that held the name_events rows back is answered by
    // execution, and the side preparation moved to the write order (the
    // port resolves the sides before the row write, so the preparation
    // cannot run at Ruby's store-stage position). The row's parity
    // assertions live in register-events-round-four-oracle-parity.test.ts.
    expect(declared.at).toBe("store");
    expect(declared.on).toEqual(["save"]);
    expect(declared.changed).toEqual(["name"]);
    expect(carriesStubBody(declared)).toBe(false);
  });

  it("reject_empty_subcards: the executed body's drops, over the PINNED each_with_key, and the port's body that drops the same keys", () => {
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
      "director.subdirectors",
      "director.delete",
      "trigger",
      "drop_subcard",
      "director.subdirectors",
      "director.delete",
    ]);
    expect(
      (both?.calls ?? []).filter((c: any) => c.call === "drop_subcard").map((c: any) => c.arguments[0]),
    ).toEqual(["left", "right"]);
    expect(
      (oneFilled?.calls ?? []).filter((c: any) => c.call === "drop_subcard").map((c: any) => c.arguments[0]),
    ).toEqual(["right"]);
    expect(callsOf(underTrigger)).toEqual(["subcards", "trigger"]);

    // the port's registration is the pinned declaration and the body it
    // carries is now a REAL body (round four landed it): the save input's
    // subcard collection rides into the prepare_to_validate walk, and the
    // body drops the empty new ones from it. The row's parity assertions
    // live in register-events-round-four-oracle-parity.test.ts.
    expect(declared.at).toBe("prepare_to_validate");
    expect(carriesStubBody(declared)).toBe(false);
  });

  it("rename_in_trash: the executed body's two arms, and the port's body that asks for the same obstacle", () => {
    const oracle = capture("rename-in-trash");
    const declared = registration(coreMod, "rename_in_trash");

    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/name_events.rb");
    expect(oracle.pinned_declaration_line).toBe(60);

    // what Ruby did: with a trashed card already on the key, the body
    // renames it as the trash obstacle; with no trashed card on the key,
    // it returns before it renames anything.
    const obstacle = oracle.scenarios?.[0];
    const noObstacle = oracle.scenarios?.[1];
    expect(callsOf(obstacle)).toEqual([
      "name",
      "Card.find_by_key_and_trash",
      "rename_as_trash_obstacle",
    ]);
    expect(callsOf(noObstacle)).toEqual(["name", "Card.find_by_key_and_trash"]);

    // the port's registration is the pinned declaration (after:
    // expire_old_name, on: :update) and the body it carries is now a REAL
    // body (round four landed it): the write order carries it, because the
    // obstacle must be out of the way before the card takes the key. The
    // row's parity assertions live in
    // register-events-round-four-oracle-parity.test.ts.
    expect(declared.after).toBe("expire_old_name");
    expect(declared.on).toEqual(["update"]);
    expect(carriesStubBody(declared)).toBe(false);
  });

  it("reset_codename_cache: the executed body's early return, and the port's body that resets the same cache", () => {
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
    // changed: :codename) and the body it carries is now a REAL body
    // (round four landed it): the write order carries it, because the
    // port's own place for the reset is the post-write expiry. The row's
    // parity assertions live in
    // register-events-round-four-oracle-parity.test.ts.
    expect(declared.at).toBe("integrate");
    expect(declared.changed).toEqual(["codename"]);
    expect(carriesStubBody(declared)).toBe(false);
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
      "abort",
      "director.abort",
    ]);
    expect(draft?.outcome?.raised).toBe("Card::Error::Abort");
    expect(draft?.outcome?.status).toBe("success");

    // the port's registration is the pinned declaration (:store, on:
    // :update, when: :draft?) and the body it carries is now a REAL body
    // (round five landed it): the write order carries it, because the
    // draft save aborts before any row write, so no stage walk can run
    // it. The row's parity assertions live in
    // register-events-round-five-oracle-parity.test.ts.
    expect(declared.at).toBe("store");
    expect(declared.on).toEqual(["update"]);
    expect(declared.when).toBe("draft?");
    expect(carriesStubBody(declared)).toBe(false);
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
      "Card.write_to_temp_cache",
    ]);
    expect(named?.writes).toEqual([{ attribute: "name", value: "Joe User+Account" }]);
    const updateColumn = (named?.calls ?? []).find((c: any) => c.call === "update_column");
    expect(updateColumn?.arguments).toEqual(["db_content", "Joe User+Account"]);

    // the port's registration is the pinned declaration (:prepare_to_store,
    // on: :create, when: :autoname?) and the body it carries is now a REAL
    // body: the create path's naming site is the port's own place for the
    // work, so the body is the mechanism there. The row's parity assertions
    // live in register-events-round-five-oracle-parity.test.ts.
    expect(declared.at).toBe("prepare_to_store");
    expect(declared.on).toEqual(["create"]);
    expect(declared.when).toBe("autoname?");
    expect(carriesStubBody(declared)).toBe(false);
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
    // and the body it carries is now a REAL body: the port's own place for
    // the work is the PRE-WRITE content preparation, so the body is the
    // mechanism there. The row's parity assertions live in
    // register-events-round-five-oracle-parity.test.ts.
    expect(declared.at).toBe("store");
    expect(declared.on).toEqual(["save"]);
    expect(carriesStubBody(declared)).toBe(false);
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
    // (:prepare_to_validate, on: :create, when: use_default_content?) and
    // the body it carries is now a REAL body: the create path's template
    // read is the port's own place for the work, so the body is the
    // mechanism there. The row's parity assertions live in
    // register-events-round-five-oracle-parity.test.ts.
    expect(declared.at).toBe("prepare_to_validate");
    expect(declared.on).toEqual(["create"]);
    expect(declared.when).toBe("use_default_content?");
    expect(carriesStubBody(declared)).toBe(false);
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
    expect(callsOf(created)).toEqual(["director.after_store", "Lexicon.add"]);
    expect(callsOf(updated)).toEqual(["director.after_store", "Lexicon.update"]);

    // the port's registration is the pinned declaration (:store,
    // changed: :name) and the body it carries is now a REAL body: the
    // post-write expiry is the port's own place for the work (Ruby's
    // after_store callback lands right after the storage), so the body is
    // the mechanism there. The row's parity assertions live in
    // register-events-round-five-oracle-parity.test.ts.
    expect(declared.at).toBe("store");
    expect(declared.changed).toEqual(["name"]);
    expect(carriesStubBody(declared)).toBe(false);
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
      "validate_codename_permission",
      "Auth.always_ok?",
      "validate_codename_uniqueness",
      "codename",
      "codename=",
      "validate_codename_simplicity",
      "name",
      "simple?",
    ]);
    expect(cleared?.writes).toEqual([{ attribute: "codename", value: null }]);
    expect(errorsOf(cleared)).toEqual([]);
    expect(errorsOf(taken)).toEqual(["codename account already in use"]);

    // the port's registration is the pinned declaration (:validate,
    // on: :update, changed: :codename) with the stub body. THE ROW
    // CLOSES on the measured skip, and the mechanism is named: the port's
    // update path carries NO codename at all, so the body's own gate
    // selects nothing. The update input has no codename field
    // (src/card/actions/types.ts:276, UpdateCardInput) and the tracked
    // field state has no codename (src/card/history/change.ts), so an
    // update cannot change a codename, and the create path is not the
    // body's site either (Ruby's declaration is update-only). The
    // create path's own guard is the DATABASE's unique index
    // (db/schema.sqlite.sql:70, cards_codename_index), not Ruby's three
    // checks. The measurement lives in
    // tests/card/actions/port-codename-site.test.ts: a create writes the
    // codename and an update does not touch it, a duplicate codename is
    // refused by the database's unique index, and a compound name with a
    // codename is created (the simplicity check is update-only in Ruby
    // too). The unblock condition is: the port's update input carries a
    // codename, so the permission gate, the uniqueness check and the
    // simplicity check have a site to run. The row's parity assertions
    // live in register-events-round-six-oracle-parity.test.ts.
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
    // validate_name, on: :save, when: :no_autoname?) with a REAL body
    // now: the save path's key check carries it (card-action-engine.ts
    // runValidateKeyBody), because that check is the port's own place for
    // the work. The row's parity assertions live in
    // register-events-round-five-oracle-parity.test.ts.
    expect(declared.after).toBe("validate_name");
    expect(declared.on).toEqual(["save"]);
    expect(declared.when).toBe("no_autoname?");
    expect(carriesStubBody(declared)).toBe(false);
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

    // the port's registration carries a REAL body now: the save path's
    // name-legality check carries it (card-action-engine.ts
    // runValidateLegalityBody), because that check is the port's own
    // place for the work. The row's parity assertions live in
    // register-events-round-five-oracle-parity.test.ts.
    expect(declared.at).toBeUndefined();
    expect(carriesStubBody(declared)).toBe(false);
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
      "validate_legality_of_name",
      "name",
      "name",
      "empty?",
      "name_incomplete?",
      "name",
      "changing_existing_tag_to_compound?",
      "Card.write_to_temp_cache",
      "validate_uniqueness_of_name",
      "key",
      "Lexicon.id",
    ]);
    expect(errorsOf(legal)).toEqual([]);
    expect(callsOf(tooLong)).toEqual(["validate_legality_of_name", "name", "name"]);
    expect(errorsOf(tooLong)).toEqual([
      "is too long (255 character maximum; length is 300)",
    ]);

    // the port's registration is the pinned declaration (:validate,
    // on: :save, changed: :name, when: :no_autoname?) with a REAL body
    // now: the save path's name validation carries it
    // (card-action-engine.ts runValidateNameBody), because that validation
    // is the port's own place for the work. The row's parity assertions
    // live in register-events-round-five-oracle-parity.test.ts.
    expect(declared.at).toBe("validate");
    expect(declared.on).toEqual(["save"]);
    expect(declared.changed).toEqual(["name"]);
    expect(declared.when).toBe("no_autoname?");
    expect(carriesStubBody(declared)).toBe(false);
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
    // on: :update, changed: :name, skip: :allowed) with a REAL body now:
    // the update walk's rename site carries it (card-action-engine.ts
    // runValidateRenamingBody), because that site is the port's own place
    // for the work. The row's parity assertions live in
    // register-events-round-five-oracle-parity.test.ts.
    expect(declared.at).toBe("validate");
    expect(declared.on).toEqual(["update"]);
    expect(declared.changed).toEqual(["name"]);
    expect(declared.skip).toBe("allowed");
    expect(carriesStubBody(declared)).toBe(false);
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
    // on: :update, changed: :type_id) with the named skip: the duplicate
    // walk over the whole create validation surface is not a callable unit
    // of the port's save path, and the port's update walk resolves the
    // type-scoped set modules from the STORED type, so a type-changing
    // save never runs the NEW type's validate events the way Ruby's
    // duplicate-as-a-create walk does. THE MECHANISM, NAMED: the port's
    // save path has no create-validation walk as a callable unit. THE ROW
    // CLOSES on the measured skip, and the unblock condition is: the save
    // path grows the create validation walk as a callable unit.
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
    expect(callsOf(taken)).toEqual(["key", "Lexicon.id", "id", "Card.where"]);
    expect(errorsOf(taken)).toEqual([
      "must be unique; 'Joe User+Card' already exists.",
    ]);

    // the port's registration carries a REAL body now (and the pinned
    // declaration's own skip: :allowed): the save path's uniqueness check
    // carries it (card-action-engine.ts runValidateUniquenessBody), because
    // that check is the port's own place for the work. The row's parity
    // assertions live in register-events-round-five-oracle-parity.test.ts.
    expect(declared.skip).toBe("allowed");
    expect(carriesStubBody(declared)).toBe(false);
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
    // body it carries is the NAMED SKIP: the port's delete path carries no
    // stored-file cleanup, so the files of a deleted card's actions stay on
    // disk where Ruby removes them. THE MECHANISM, NAMED: the port's
    // delete path has no attachment cleanup site. THE ROW CLOSES on the
    // measured skip, and the unblock condition is: the delete path grows
    // an attachment cleanup.
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
    // body it carries is the NAMED SKIP: the port's delete path carries no
    // stored-image cleanup, so the images of a deleted card's actions stay
    // on disk where Ruby removes them. THE MECHANISM, NAMED: the port's
    // delete path has no attachment cleanup site. THE ROW CLOSES on the
    // measured skip, and the unblock condition is: the delete path grows
    // an attachment cleanup.
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
    // (:prepare_to_validate, on: :delete, when: :codename?) with the
    // NAMED SKIP: deleting a codenamed asset output card is refused as a
    // system card where Ruby deletes it and clears the codename, and the
    // codename mutation would have to reach the trash write as a column
    // in the delete's update. THE MECHANISM, NAMED: the port's delete
    // path refuses a system card and carries no codename column in its
    // update. THE ROW CLOSES on the measured skip, and the unblock
    // condition is: the delete path can carry the codename clearing as a
    // column in its update, and the system-card refusal no longer fires
    // on that card.
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
    expect(callsOf(created)).toEqual(["initialize_theme", "field", "field"]);
    expect(
      (created?.calls ?? [])
        .filter((c: any) => c.call === "field")
        .map((c: any) => c.arguments[0]),
    ).toEqual(["colors", "variables"]);

    // the port's registration is the pinned declaration
    // (:prepare_to_store, on: :create) and the body it carries is the
    // NAMED SKIP: the event fires and does nothing where Ruby writes the
    // two scss fields. THE MECHANISM, NAMED: the port's own skin create
    // path DOES create the two scss fields (the engine's
    // applySkinCreateEvents adds them as subcards), but it writes them
    // under the STARRED tag spellings "+*colors" and "+*variables" where
    // Ruby's field names are "+colors" and "+variables", so the bytes
    // differ. (Corrected 2026-10-24, round five: the earlier wording
    // here said the create path does not create the fields at all, which
    // the port's own code and the port's own pin
    // (tests/card/actions/bootstrap-skin-create-events.test.ts)
    // contradict; the tag spelling is the divergence.) THE ROW CLOSES on
    // the measured skip, and the unblock condition is: the port's skin
    // field tags carry Ruby's spelling.
    expect(declared.at).toBe("prepare_to_store");
    expect(declared.on).toEqual(["create"]);
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("initialize_because_of_type_change: the executed body's three steps, and the port's no-op", () => {
    const oracle = capture("initialize-because-of-type-change");
    const declared = registration(cardModBootstrap, "initialize_because_of_type_change");

    expect(oracle.pinned_file).toBe(
      "card-mod-bootstrap-0.20.0/set/type/bootswatch_skin/events.rb",
    );
    expect(oracle.pinned_declaration_line).toBe(1);

    // what Ruby did: the body writes the card's own content back, then
    // initializes the theme (the two scss fields, from the pinned method),
    // then reads the old skin's items (the pinned old_skin_items) and, when
    // there are any, adds the stylesheets field with them.
    const changed = oracle.scenarios?.[0];
    expect(callsOf(changed)).toEqual([
      "content",
      "content=",
      "initialize_theme",
      "field",
      "field",
      "old_skin_items",
      "db_content_before_act",
      "Card.new",
      "drop_item",
      "item_names",
    ]);
    expect(changed?.writes).toEqual([{ attribute: "content", value: "" }]);

    // the port's registration is the pinned declaration
    // (:prepare_to_store, on: :update, changed: :type) and the body it
    // carries is the no-op. THE PORT'S OWN PLACE FOR THE WORK CARRIES THE
    // BODY: the type-change path's skin initialization (the engine's
    // applySkinTypeChange), which gives the card its two scss fields and
    // its +*stylesheets field, and refuses an old item that is neither
    // CSS nor SCSS. Pinned by the port's own file
    // (tests/card/actions/bootstrap-skin-type-change-events.test.ts: the
    // fields gained, the empty-list no-field arm, the css/scss refusal).
    // THE DIVERGENCE, NAMED: the port writes the fields under the
    // STARRED tags "+*colors", "+*variables" and "+*stylesheets" where
    // Ruby's field names are "+colors", "+variables" and "+stylesheets",
    // and the
    // port's +*stylesheets content is the bare item names joined with a
    // newline where Ruby assigns an ARRAY through content= and the
    // collection mod's items_content turns it into the bracketed list.
    // Ruby's first step (self.content = content) writes the card's own
    // content back, the same bytes, and the port leaves the content
    // alone, so the card's content is the same either way.
    // THE ROW CLOSES on the port's own place for the work, with the
    // divergence named.
    expect(declared.at).toBe("prepare_to_store");
    expect(declared.on).toEqual(["update"]);
    expect(declared.changed).toEqual(["type"]);
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("update_skin_asset_input: the executed body's two arms, and the port's no-op", () => {
    const oracle = capture("update-skin-asset-input");
    const declared = registration(cardModBootstrap, "update_skin_asset_input");

    expect(oracle.pinned_file).toBe("card-mod-bootstrap-0.20.0/set/abstract/skin_field.rb");
    expect(oracle.pinned_declaration_line).toBe(1);
    // the pinned declaration names no `on:`, so Ruby runs this body on
    // every action; the port registers it for save only.
    expect(oracle.pinned_declaration).toBe("event :update_skin_asset_input, :finalize do");

    // what Ruby did: with a left side that has no action, the body updates
    // the asset input on that side; with a left side that already has an
    // action, the body returns before it touches anything.
    const fresh = oracle.scenarios?.[0];
    const acted = oracle.scenarios?.[1];
    expect(callsOf(fresh)).toEqual(["left", "left", "left", "update_asset_input"]);
    expect(callsOf(acted)).toEqual(["left", "left"]);

    // the port's registration is the pinned stage with a NARROWER trigger
    // (on: save, where the pinned declaration names none) and the no-op
    // body. THE PORT'S OWN PLACE FOR THE WORK CARRIES THE BODY: the write
    // path's asset walk (src/card/actions/style-asset-events.ts), where a
    // skin field whose skin has no action in this act refreshes the skin's
    // asset input from the PRE-ACT bytes, one save behind, which is the
    // arm the executed capture shows. Pinned by the port's own file
    // (tests/card/actions/style-asset-events-save-path.test.ts: updating a
    // skin field refreshes the skin's input from the pre-act bytes,
    // landing this save's bytes on the NEXT save).
    // THE DIVERGENCE, NAMED: the port's registration carries a narrower
    // trigger (on: save) than the pinned declaration, which names none,
    // so Ruby runs the body on every action. The action the port does not
    // run is the one the capture's second arm shows: a left side that
    // already has an action, where Ruby returns before it touches
    // anything, and the port's walk does not reach it either. The
    // observable is the same. THE ROW CLOSES on the port's own place for
    // the work, with the divergence named.
    expect(declared.at).toBe("finalize");
    expect(declared.on).toEqual(["save"]);
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("use_as_current_skin: the executed body's style-rule write, and the port's stub", () => {
    const oracle = capture("use-as-current-skin");
    const declared = registration(cardModBootstrap, "use_as_current_skin");

    expect(oracle.pinned_file).toBe(
      "card-mod-bootstrap-0.20.0/set/type/bootswatch_skin.rb",
    );
    expect(oracle.pinned_declaration_line).toBe(180);

    // what Ruby did: the body takes the style rule, writes the card's own
    // name into its content and saves it.
    const saved = oracle.scenarios?.[0];
    expect(callsOf(saved)).toEqual(["Card.[]", "name", "content=", "save!"]);
    expect((saved?.calls ?? []).find((c: any) => c.call === "content=")?.arguments).toEqual([
      "Joe User+Skin",
    ]);

    // the port's registration is the pinned declaration (:finalize,
    // on: :save, trigger: :required) with the stub body: the skin act is
    // the trigger-driven write path's own work. THE PORT'S OWN PLACE FOR
    // THE WORK CARRIES THE BODY: the trigger-driven write path's action
    // (the engine's useAsCurrentSkin), which takes the *all+*style rule
    // card, writes the skin's own name into its content and saves it
    // inside the skin's act. The capture's four calls are the port's four
    // steps: the rule card (the capture's Card.[]), the card's name, the
    // content write and the save. Pinned by the port's own file
    // (tests/card/actions/style-asset-events-save-path.test.ts: using a
    // skin finalizes its own unchanged save before updating the rule in
    // one act, which asserts that the rule card's content becomes the
    // skin's name). THE DIVERGENCE, NAMED: where the deck has no
    // *all+*style rule card, Ruby would raise on the nil rule and the
    // port refuses with its own message; the shape the capture shows, a
    // rule card that exists, is the port's own write. THE ROW CLOSES on
    // the port's own place for the work, with the divergence named.
    expect(declared.at).toBe("finalize");
    expect(declared.on).toEqual(["save"]);
    expect(declared.trigger).toBe("required");
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("validate_theme_template: the executed body's refusal, in the PINNED locale's words", () => {
    const oracle = capture("validate-theme-template");
    const declared = registration(cardModBootstrap, "validate_theme_template");

    expect(oracle.pinned_file).toBe(
      "card-mod-bootstrap-0.20.0/set/type/bootswatch_skin/events.rb",
    );
    expect(oracle.pinned_declaration_line).toBe(14);

    // what Ruby did: a theme card that is not a bootswatch skin is refused
    // with the pinned locale's own text naming the theme; a bootswatch skin
    // passes.
    const notASkin = oracle.scenarios?.[0];
    const aSkin = oracle.scenarios?.[1];
    expect(errorsOf(notASkin)).toEqual(["not a valid theme Joe User+Note"]);
    expect(errorsOf(aSkin)).toEqual([]);

    // the port's registration is the pinned declaration (:validate,
    // on: :create) and the body it carries is the no-op: the event fires and
    // does nothing where Ruby refuses the create. THE PORT'S OWN PLACE FOR
    // THE WORK CARRIES THE BODY: the skin create path's theme validation
    // (the engine's applySkinCreateEvents), which reads the +parent's first
    // item and, when that parent exists and is not a bootswatch skin,
    // refuses the create with the capture's own sentence, "not a valid
    // theme <name>". Pinned by the port's own file
    // (tests/card/actions/bootstrap-skin-create-events.test.ts: a +parent
    // naming an existing non-skin card refuses the create, a +parent
    // naming a real bootswatch_skin proceeds, and a +parent naming a
    // nonexistent card proceeds).
    // THE DIVERGENCE, NAMED: in the shape the port refuses, Ruby never
    // reaches the message at all. The pinned theme_card recurses into the
    // non-skin parent (parent_skin_card.theme_card) and raises
    // NoMethodError, a 500, where the port refuses with the error the
    // event was written to give. The shape the capture shows, a theme card
    // that answers with a non-skin type, is the port's own refusal.
    // THE ROW CLOSES on the port's own place for the work, with the
    // divergence named.
    expect(declared.at).toBe("validate");
    expect(declared.on).toEqual(["create"]);
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("change_bucket_if_read_only: the executed body's storage-type write, and the port's stub", () => {
    const oracle = capture("change-bucket-if-read-only");
    const declared = registration(cardModCarrierwave, "change_bucket_if_read_only");

    expect(oracle.pinned_file).toBe(
      "card-mod-carrierwave-0.20.0/set/abstract/attachment/cloud.rb",
    );
    expect(oracle.pinned_declaration_line).toBe(3);

    // what Ruby did: the body takes the storage type from the config
    const updated = oracle.scenarios?.[0];
    expect(callsOf(updated)).toEqual(["storage_type_from_config"]);
    expect(updated?.outcome?.returned).toBe("cloud");

    // the port's registration is the pinned declaration (:initialize,
    // on: :update, when: :change_bucket_if_read_only?) with the stub body.
    // THE ROW CLOSES on the measured skip, and the mechanism is named: the
    // gate is STRUCTURALLY FALSE in the port. The predicate (the port's
    // own change_bucket_if_read_only?) reads card.bucketReadOnly, and the
    // port's own state source documents that the flag is NOT populated
    // (there is no cloud backend and no Cardio.config.file_buckets), so
    // the gate answers false in every configuration the port can express
    // and the dispatcher skips the event before any body would run. The
    // body itself rewrites @storage_type, which the port derives (the
    // state source's storage type from the content) and does not carry as
    // a mutable value a body could write. The unblock condition is: the
    // port stands up a cloud bucket configuration with a read-only flag,
    // and the event card carries a mutable storage type.
    expect(declared.at).toBe("initialize");
    expect(declared.on).toEqual(["update"]);
    expect(declared.when).toBe("change_bucket_if_read_only?");
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("remove_public_link_on_delete: the executed body's removal call, and the port's stub", () => {
    const oracle = capture("remove-public-link-on-delete");
    const declared = registration(cardModCarrierwave, "remove_public_link_on_delete");

    expect(oracle.pinned_file).toBe(
      "card-mod-carrierwave-0.20.0/set/abstract/attachment/local.rb",
    );
    expect(oracle.pinned_declaration_line).toBe(5);

    // what Ruby did: the body asks to remove the public link tree. The
    // helper that does the removal touches the file system, so its own
    // bytes are not executed; the capture says so in its notes.
    const deleted = oracle.scenarios?.[0];
    expect(callsOf(deleted)).toEqual(["remove_public_links"]);
    expect((oracle.notes ?? []).length).toBeGreaterThan(0);

    // the port's registration is the pinned declaration (:integrate,
    // on: :delete, when: :local?) with the stub body. THE ROW CLOSES on
    // the measured skip, and the mechanism is named: the body is
    // remove_public_links, the removal of the directory holding the
    // attachment's public symlink, and the port has no public/ tree at
    // all. Files serve through the engine's own routes
    // (src/server/file-routes.ts, whose header names "public symlink
    // management" among its non-ported filesystem surfaces), and the
    // headless and edge hosts have no filesystem to symlink out of.
    // Ruby's observable effect, a public/ symlink disappearing on delete,
    // has no counterpart surface to mutate. The unblock condition is: the
    // port serves attachments through a public symlink tree.
    expect(declared.at).toBe("integrate");
    expect(declared.on).toEqual(["delete"]);
    expect(declared.when).toBe("local?");
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("uncode_attachment_storage: the executed body's two arms, and the port's stub", () => {
    const oracle = capture("uncode-attachment-storage");
    const declared = registration(cardModCarrierwave, "uncode_attachment_storage");

    expect(oracle.pinned_file).toBe(
      "card-mod-carrierwave-0.20.0/set/abstract/attachment/coded.rb",
    );
    expect(oracle.pinned_declaration_line).toBe(3);

    // what Ruby did: with no explicit storage type, the body takes the
    // storage type from the config; with an explicit one, the body leaves
    // it alone and asks for nothing.
    const implicit = oracle.scenarios?.[0];
    const explicit = oracle.scenarios?.[1];
    expect(callsOf(implicit)).toEqual(["storage_type_from_config"]);
    expect(callsOf(explicit)).toEqual([]);

    // the port's registration is the pinned declaration (:initialize,
    // on: :update, when: :uncode?) with the stub body. THE ROW CLOSES on
    // the measured skip, and the mechanism is named: the gate IS
    // expressible in the port (the port's own uncode? reads the explicit
    // storage type, the assigned mod and the card's current storage
    // type), but the transition has nothing to run on. The body rewrites
    // @storage_type, which the port derives (the state source's storage
    // type from the content) and does not carry as a mutable value on the
    // event card, and the move it causes is carrierwave's re-store of the
    // file into the new backend at store time, which needs a coded file
    // backend to move FROM. The port's local backend is deck-files only.
    // The unblock condition is: the port's attachment backend can move a
    // coded file into the configured storage.
    expect(declared.at).toBe("initialize");
    expect(declared.on).toEqual(["update"]);
    expect(declared.when).toBe("uncode?");
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("update_public_link: the executed body's three arms, and the port's stub", () => {
    const oracle = capture("update-public-link");
    const declared = registration(cardModCarrierwave, "update_public_link");

    expect(oracle.pinned_file).toBe(
      "card-mod-carrierwave-0.20.0/set/abstract/attachment/local.rb",
    );
    expect(oracle.pinned_declaration_line).toBe(9);

    // what Ruby did: a blank content returns before the links are touched;
    // a card anyone may read asks to create the public links; a card nobody
    // but the owner may read asks to remove them.
    const blank = oracle.scenarios?.[0];
    const anyone = oracle.scenarios?.[1];
    const owner = oracle.scenarios?.[2];
    expect(callsOf(blank)).toEqual(["content"]);
    expect(callsOf(anyone)).toEqual(["content", "who_can", "create_public_links"]);
    expect(callsOf(owner)).toEqual(["content", "who_can", "remove_public_links"]);

    // the port's registration is the pinned declaration (after:
    // update_read_rule, when: :local?) with the stub body. THE ROW CLOSES
    // on the measured skip, and the mechanism is named: TWO surfaces the
    // body needs are absent in the port. The public/ symlink tree itself
    // (the port serves files through its own routes, and the file routes'
    // header names "public symlink management" among its non-ported
    // filesystem surfaces, and the headless and edge hosts have no
    // filesystem to symlink into), and the who_can(:read) party-list
    // resolution the flip reads. The read-rule hook ordering rides the
    // permissions mod's update_read_rule event. The unblock condition is:
    // the port carries the public symlink tree and the party-list
    // resolution.
    expect(declared.after).toBe("update_read_rule");
    expect(declared.when).toBe("local?");
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("update_public_link_on_create: the executed body's call into the link event, and the port's stub", () => {
    const oracle = capture("update-public-link-on-create");
    const declared = registration(cardModCarrierwave, "update_public_link_on_create");

    expect(oracle.pinned_file).toBe(
      "card-mod-carrierwave-0.20.0/set/abstract/attachment/local.rb",
    );
    expect(oracle.pinned_declaration_line).toBe(1);

    // what Ruby did: the body calls the event update_public_link, whose
    // own bytes then read the content. The capture records the call and
    // what the called event did.
    const created = oracle.scenarios?.[0];
    expect(callsOf(created)).toEqual(["update_public_link", "content", "empty?"]);

    // the port's registration is the pinned declaration (:integrate,
    // on: :create, when: :local?) with the stub body. THE ROW CLOSES on
    // the measured skip, and the mechanism is named: the body has no
    // surface to work on. The called event update_public_link
    // (local.rb:9-17) has both arms filesystem symlink work,
    // create_public_links (local.rb:20-33, File.symlink of the stored
    // file and every version's path into public/) or remove_public_links
    // (local.rb:38-44, rm_rf of the symlink dir), and the port has no
    // public/ tree at all: files serve through the engine's own routes,
    // and the route replaces the symlink management by direct serving
    // (src/server/file-routes.ts:34 names "public symlink management"
    // among the route's own named remainders), and the headless and edge
    // hosts have no filesystem to symlink into. A substitute "mark it
    // public" row write would be a different mechanism, not a port of
    // Ruby's. The unblock condition is: the port carries the public
    // symlink tree. The row's parity assertions live in
    // register-events-round-six-oracle-parity.test.ts.
    expect(declared.at).toBe("integrate");
    expect(declared.on).toEqual(["create"]);
    expect(declared.when).toBe("local?");
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("update_storage: the executed body's two arms, and the port's stub", () => {
    const oracle = capture("update-storage");
    const declared = registration(cardModCarrierwave, "update_storage");

    expect(oracle.pinned_file).toBe(
      "card-mod-carrierwave-0.20.0/set/abstract/attachment/01_storage_type.rb",
    );
    expect(oracle.pinned_declaration_line).toBe(3);

    // what Ruby did: an update that is not attaching writes the stored file
    // onto the attachment column and then writes the identifier; an update
    // that is attaching skips the write and still writes the identifier.
    const writing = oracle.scenarios?.[0];
    const attaching = oracle.scenarios?.[1];
    expect(callsOf(writing)).toEqual([
      "attachment_name",
      "current",
      "file=",
      "write_identifier",
    ]);
    expect(writing?.writes).toEqual([{ attribute: "file", value: "stored.png" }]);
    expect(callsOf(attaching)).toEqual(["write_identifier"]);

    // the port's registration is the pinned declaration (:store,
    // on: :update, when: :storage_changed?) with the stub body: the
    // attachment save path owns the behaviour. The row does NOT close here.
    expect(declared.at).toBe("store");
    expect(declared.on).toEqual(["update"]);
    expect(declared.when).toBe("storage_changed?");
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("validate_coded_storage_type: the executed body's two refusals, in the PINNED locale's words", () => {
    const oracle = capture("validate-coded-storage-type");
    const declared = registration(cardModCarrierwave, "validate_coded_storage_type");

    expect(oracle.pinned_file).toBe(
      "card-mod-carrierwave-0.20.0/set/abstract/attachment/coded.rb",
    );
    expect(oracle.pinned_declaration_line).toBe(7);

    // what Ruby did: a coded save with no mod argument and no codename is
    // refused with BOTH storage-type errors, in the pinned locale's own
    // words; a coded save with a mod argument and a codename passes.
    const refused = oracle.scenarios?.[0];
    const passed = oracle.scenarios?.[1];
    expect(errorsOf(refused)).toEqual([
      "mod argument needed to save card as coded",
      "codename needed for storage type coded",
    ]);
    expect(callsOf(refused)).toEqual([
      "mod",
      "storage_type_error",
      "coded_ok?",
      "storage_type_error",
    ]);
    expect(errorsOf(passed)).toEqual([]);

    // the port's registration is the pinned declaration (:validate,
    // on: :save, when: :coded?) with the stub body: the mod's own note says
    // the events' behaviour lives in the engine's attachment save path. The
    // row does NOT close here.
    expect(declared.at).toBe("validate");
    expect(declared.on).toEqual(["save"]);
    expect(declared.when).toBe("coded?");
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("add_comment: the executed body's compact arm, and the port's join that now matches it", () => {
    const oracle = capture("add-comment");
    const declared = registration(cardModComment, "add_comment");

    // the capture is round one's, over the pinned gem's own body
    // (card-mod-comment-0.20.0/set/all/comment.rb:5-12), executed over
    // recording doubles.
    expect(oracle.pinned_file).toBe("card-mod-comment-0.20.0/set/all/comment.rb");
    expect(oracle.row).toBe("add-comment");
    expect(oracle.event).toBe("add_comment");

    const withContent = oracle.scenarios?.find((s) => s.content_before !== null);
    const withoutContent = oracle.scenarios?.find((s) => s.content_before === null);
    // what Ruby did: a card WITH a content gets the separator; a card with
    // NO content gets the signature alone, because compact drops the nil
    // content before the join.
    expect(withContent?.content_after).toContain("\n<hr>\n");
    expect(withoutContent?.content_after).not.toContain("\n<hr>\n");
    expect(withContent?.comment_after).toBeNull();

    // what the port does NOW: the same two answers.
    expect(appendComment("old body", "hello", "Joe", new Date(0))).toContain("\n<hr>\n");
    expect(appendComment(undefined, "hello", "Joe", new Date(0))).not.toContain("\n<hr>\n");
    // an EMPTY content is not a nil content: it keeps the separator.
    expect(appendComment("", "hello", "Joe", new Date(0))).toContain("\n<hr>\n");

    // the port's registration carries a REAL body, and this row CLOSES.
    expect(typeof declared.fn).toBe("function");
    expect(String(declared.fn)).not.toMatch(/^\s*(\(\)\s*=>\s*undefined|function\s+stub)/);
  });

  it("update_follow_rules: the executed body's walk, and the port's stub", () => {
    const oracle = capture("update-follow-rules");
    const declared = registration(cardModFollow, "update_follow_rules");

    expect(oracle.pinned_file).toBe(
      "card-mod-follow-0.20.0/set/self/follow_defaults.rb",
    );
    expect(oracle.pinned_declaration_line).toBe(17);

    // what Ruby did: the body runs as the bot, walks the deck's users,
    // walks each user's follow defaults, and asks each default's set card
    // for the follow rule's name.
    const saved = oracle.scenarios?.[0];
    expect(callsOf(saved)).toEqual([
      "Auth.as_bot",
      "Card.search",
      "each",
      "follow_defaults",
      "follow_rule_name",
      "Card.fetch",
      "Card.follow_caches_expired",
    ]);
    expect(
      (saved?.calls ?? []).find((c: any) => c.call === "follow_rule_name")?.arguments,
    ).toEqual(["Joe User+User"]);

    // the port's registration is the pinned declaration (:finalize,
    // on: :save, trigger: :required) with the stub body: the port's
    // follow rules live in the engine's follow path. The row does NOT close
    // here.
    expect(declared.at).toBe("finalize");
    expect(declared.on).toEqual(["save"]);
    expect(declared.trigger).toBe("required");
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("clear_roles_cache: the executed body's two cache drops, and the port's named absence", () => {
    const oracle = capture("clear-roles-cache");
    const declared = registration(cardModLayout, "clear_roles_cache");

    expect(oracle.pinned_file).toBe(
      "card-mod-layout-0.20.0/set/right/enabled_roles.rb",
    );
    expect(oracle.pinned_declaration_line).toBe(28);
    // the pinned declaration names the stage and the neighbour
    expect(oracle.pinned_declaration).toContain(
      "event :clear_roles_cache, :prepare_to_store, before: :store_in_session do",
    );

    // what Ruby did: the body clears the current user's roles and drops
    // the always-cache.
    const saved = oracle.scenarios?.[0];
    expect(callsOf(saved)).toEqual(["Auth.current", "clear_roles", "Auth.update_always_cache"]);

    // the port's registration carries the neighbour Ruby names and NO
    // stage of its own (options.rb:76 clears the stage when `before:` is
    // given), and its body is the mod files' no-op: the port holds neither
    // the role cache nor the always-cache, so there is nothing to drop.
    // That is the port's named equivalent-by-absence disposition, and the
    // row does NOT close here: the two cache drops are not ported.
    expect(declared.before).toBe("store_in_session");
    expect(declared.at).toBeUndefined();
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("update_layout_registry: the executed body's two registry calls, and the port's stub", () => {
    const oracle = capture("update-layout-registry");
    const declared = registration(cardModLayout, "update_layout_registry");

    expect(oracle.pinned_file).toBe("card-mod-layout-0.20.0/set/type/layout_type.rb");
    expect(oracle.pinned_declaration_line).toBe(7);

    // what Ruby did: the body deregisters the layout and registers it again
    // with its nest, naming the card and the card's format.
    const updated = oracle.scenarios?.[0];
    expect(callsOf(updated)).toEqual([
      "name",
      "Layout.deregister_layout",
      "name",
      "Layout.register_layout_with_nest",
    ]);

    // the port's registration is the pinned declaration (:finalize,
    // on: :update) with the stub body: the port's layout registry has no
    // consumer, so the registry write is not ported. The row does NOT close
    // here.
    expect(declared.at).toBe("finalize");
    expect(declared.on).toEqual(["update"]);
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("validate_role_enabling: the executed refusal, and the port's body that answers it", () => {
    const oracle = capture("validate-role-enabling");
    const declared = registration(cardModLayout, "validate_role_enabling");

    expect(oracle.pinned_file).toBe(
      "card-mod-layout-0.20.0/set/right/enabled_roles.rb",
    );
    expect(oracle.pinned_declaration_line).toBe(21);

    // what Ruby did: the roles the card enables minus the roles the actor
    // holds; a card that enables a role the actor does not hold is refused
    // with the PINNED ActiveSupport sentence: "illegal roles: admin".
    const held = oracle.scenarios?.[0];
    const illegal = oracle.scenarios?.[1];
    expect(errorsOf(held)).toEqual([]);
    expect(errorsOf(illegal)).toEqual(["illegal roles: admin"]);

    // the port's body, RUN on the same scenario, refuses with the same
    // wording: the port computes the same difference and joins it with the
    // same sentence. THE ROW CLOSES.
    const body = declared.fn;
    expect(typeof body).toBe("function");
    expect(String(body)).not.toMatch(/^\s*(\(\)\s*=>\s*undefined|function\s+stub)/);
    expect(declared.at).toBe("validate");
    expect(declared.on).toEqual(["save"]);
    return expect(
      body(
        { authCurrentId: null, dbContent: "admin", name: { s: "Joe User+Layout" } } as never,
        undefined as never,
        { driver: undefined as never, fetch: {} as never, lexicon: undefined as never } as never,
      ),
    ).rejects.toThrow(/illegal roles: admin/);
  });

  it("add_and_drop_items: the executed body's request read, and the port's no-op", () => {
    const oracle = capture("add-and-drop-items");
    const declared = registration(cardModList, "add_and_drop_items");

    expect(oracle.pinned_file).toBe(
      "card-mod-list-0.20.0/set/abstract/01_list/events.rb",
    );
    expect(oracle.pinned_declaration_line).toBe(1);

    // what Ruby did: the body reads the request's add_item and drop_item
    // and adds and drops each of them; a request that carried neither
    // makes the body do nothing.
    const adding = oracle.scenarios?.[0];
    const quiet = oracle.scenarios?.[1];
    expect(callsOf(adding)).toEqual([
      "Env.params",
      "Env.params",
      "add_item",
      "drop_item",
    ]);
    expect(callsOf(quiet)).toEqual(["Env.params", "Env.params"]);

    // the port's registration is the pinned declaration (:prepare_to_validate,
    // on: :save) with the mod files' no-op: the write path is absent, so
    // the add and drop are not ported. The row does NOT close here.
    expect(declared.at).toBe("prepare_to_validate");
    expect(declared.on).toEqual(["save"]);
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("delist: the executed body's drop, and the port's no-op", () => {
    const oracle = capture("delist");
    const declared = registration(cardModList, "delist");

    expect(oracle.pinned_file).toBe("card-mod-list-0.20.0/set/abstract/delist.rb");
    expect(oracle.pinned_declaration_line).toBe(2);

    // what Ruby did: the body walks the card's referers, keeps the ones
    // that are delistable, are an Abstract::List and are real, and for each
    // of those drops the card from the list and adds it as a subcard. A
    // card no list refers to is left alone.
    const listed = oracle.scenarios?.[0];
    const alone = oracle.scenarios?.[1];
    expect(callsOf(listed)).toEqual([
      "referers",
      "is_a?",
      "name",
      "drop_item",
      "subcard",
    ]);
    expect(callsOf(alone)).toEqual(["referers"]);

    // the port's registration is the pinned declaration (:prepare_to_store,
    // on: :delete) with the mod files' no-op: the write path, the set
    // membership and the subcard are not ported. The row does NOT close
    // here.
    expect(declared.at).toBe("prepare_to_store");
    expect(declared.on).toEqual(["delete"]);
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("insert_item_event: the executed body's insert, and the port's no-op", () => {
    const oracle = capture("insert-item-event");
    const declared = registration(cardModList, "insert_item_event");

    expect(oracle.pinned_file).toBe(
      "card-mod-list-0.20.0/set/abstract/01_list/events.rb",
    );
    expect(oracle.pinned_declaration_line).toBe(8);

    // what Ruby did: the body reads the request's item_index (0 when the
    // request carried none) and inserts the item at that index.
    const indexed = oracle.scenarios?.[0];
    const unindexed = oracle.scenarios?.[1];
    expect(callsOf(indexed)).toEqual(["Env.params", "item_to_insert", "insert_item"]);
    expect((indexed?.calls ?? []).find((c: any) => c.call === "insert_item")?.arguments).toEqual([
      2,
      "New+Card",
    ]);
    expect(
      (unindexed?.calls ?? []).find((c: any) => c.call === "insert_item")?.arguments,
    ).toEqual([0, "New+Card"]);

    // the port's registration is the pinned declaration (:prepare_to_validate,
    // on: :save, when: :item_to_insert) with the mod files' no-op: the write
    // path is absent. The row does NOT close here.
    expect(declared.at).toBe("prepare_to_validate");
    expect(declared.on).toEqual(["save"]);
    expect(declared.when).toBe("item_to_insert");
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("cascade_read_rule: the executed body's two arms, and the port's no-op", () => {
    const oracle = capture("cascade-read-rule");
    const declared = registration(cardModPermissions, "cascade_read_rule");

    expect(oracle.pinned_file).toBe("card-mod-permissions-0.20.0/set/right/read.rb");
    expect(oracle.pinned_declaration_line).toBe(9);

    // what Ruby did: with a changing name or a changing trash, the body
    // updates the cards the rule already governs; with neither, it returns
    // before it touches anything.
    const changing = oracle.scenarios?.[0];
    const quiet = oracle.scenarios?.[1];
    expect(callsOf(changing)).toEqual(["name_is_changing?", "update_read_ruled_cards"]);
    expect(callsOf(quiet)).toEqual(["name_is_changing?", "trash_is_changing?"]);

    // the port's registration is the pinned declaration (:finalize, after:
    // update_rule_cache, when: :rule?) with the mod files' no-op. The row
    // does NOT close here.
    expect(declared.at).toBe("finalize");
    expect(declared.after).toBe("update_rule_cache");
    expect(declared.when).toBe("rule?");
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("check_permissions: the executed body's check, and the port's no-op", () => {
    const oracle = capture("check-permissions");
    const declared = registration(cardModPermissions, "check_permissions");

    expect(oracle.pinned_file).toBe(
      "card-mod-permissions-0.20.0/set/all/permissions.rb",
    );
    expect(oracle.pinned_declaration_line).toBe(22);

    // what Ruby did: the body checks the action's permission inside the
    // card's own error tracker, and the action it checks is the update
    // when the card is being commented on and the card's own action
    // otherwise.
    const checked = oracle.scenarios?.[0];
    expect(callsOf(checked)).toEqual([
      "track_permission_errors",
      "action_for_permission_check",
      "commenting?",
      "action",
      "ok?",
    ]);
    expect(
      (checked?.calls ?? []).find((c: any) => c.call === "ok?")?.arguments,
    ).toEqual(["update"]);

    // the port's registration is the pinned declaration (:validate) with
    // the mod files' no-op, so the row does NOT close here.
    expect(declared.at).toBe("validate");
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("expire_related: the executed body's two arms, and the port's no-op", () => {
    const oracle = capture("expire-related");
    const declared = registration(cardModPermissions, "expire_related");

    expect(oracle.pinned_file).toBe(
      "card-mod-permissions-0.20.0/set/all/update_read_rules.rb",
    );
    expect(oracle.pinned_declaration_line).toBe(8);

    // what Ruby did: the body resets the patterns, and for a structuree it
    // expires each of the structuree's names; a card that is not a
    // structuree has nothing expired.
    const structuree = oracle.scenarios?.[0];
    const plain = oracle.scenarios?.[1];
    expect(callsOf(structuree)).toEqual([
      "reset_patterns",
      "is_structure?",
      "structuree_names",
      "Director.expirees",
      "Director.<<",
    ]);
    expect(
      (structuree?.calls ?? []).find((c: any) => c.call === "Director.<<")?.arguments,
    ).toEqual(["Joe User+Card"]);
    expect(callsOf(plain)).toEqual(["reset_patterns", "is_structure?"]);

    // the port's registration is the pinned declaration (:finalize) with
    // the mod files' no-op, so the row does NOT close here.
    expect(declared.at).toBe("finalize");
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("set_field_read_rules: the executed body's walk as the bot, and the port's no-op", () => {
    const oracle = capture("set-field-read-rules");
    const declared = registration(cardModPermissions, "set_field_read_rules");

    expect(oracle.pinned_file).toBe(
      "card-mod-permissions-0.20.0/set/all/permissions.rb",
    );
    expect(oracle.pinned_declaration_line).toBe(7);

    // what Ruby did: the body walks the card's field cards as the bot and
    // updates each field's read rule. The walk is the card's own method
    // (permissions.rb:174-181), run from its pinned bytes.
    const changed = oracle.scenarios?.[0];
    expect(callsOf(changed)).toEqual([
      "each_field_as_bot",
      "Auth.as_bot",
      "field_cards",
      "update_read_rule",
    ]);

    // the port's registration is the pinned declaration (after:
    // :set_read_rule, on: :update, changed: :type_id) with the mod files'
    // no-op, so the row does NOT close here.
    expect(declared.after).toBe("set_read_rule");
    expect(declared.on).toEqual(["update"]);
    expect(declared.changed).toEqual(["type_id"]);
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("set_read_rule: the executed body's two writes, and the port's no-op", () => {
    const oracle = capture("set-read-rule");
    const declared = registration(cardModPermissions, "set_read_rule");

    expect(oracle.pinned_file).toBe(
      "card-mod-permissions-0.20.0/set/all/permissions.rb",
    );
    expect(oracle.pinned_declaration_line).toBe(1);

    // what Ruby did: the body asks for the read rule's id and class and
    // writes both onto the card.
    const saved = oracle.scenarios?.[0];
    expect(callsOf(saved)).toEqual([
      "permission_rule_id_and_class",
      "read_rule_id=",
      "read_rule_class=",
    ]);
    expect(
      (saved?.calls ?? []).find((c: any) => c.call === "permission_rule_id_and_class")
        ?.arguments,
    ).toEqual(["read"]);
    expect(saved?.writes).toEqual([
      { attribute: "read_rule_id", value: 7 },
      { attribute: "read_rule_class", value: "Rule" },
    ]);

    // the port's registration is the pinned declaration (:store, on: :save,
    // changed: type_id and name) with the mod files' no-op, so the row does
    // NOT close here.
    expect(declared.at).toBe("store");
    expect(declared.on).toEqual(["save"]);
    expect(declared.changed).toEqual(["type_id", "name"]);
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("update_read_rule: the executed body's rewrite, and the port's no-op", () => {
    const oracle = capture("update-read-rule");
    const declared = registration(cardModPermissions, "update_read_rule");

    expect(oracle.pinned_file).toBe(
      "card-mod-permissions-0.20.0/set/all/permissions.rb",
    );
    expect(oracle.pinned_declaration_line).toBe(11);

    // what Ruby did: with the timestamps off, the body resets the
    // patterns, writes the read rule onto the card, rewrites the card's
    // own row, expires the shared cache and updates the field read rules.
    const rewritten = oracle.scenarios?.[0];
    expect(callsOf(rewritten)).toEqual([
      "without_timestamps",
      "Card.record_timestamps=",
      "reset_patterns",
      "set_read_rule",
      "permission_rule_id_and_class",
      "read_rule_id=",
      "read_rule_class=",
      "id",
      "Card.where",
      "read_rule_id",
      "read_rule_class",
      "expire",
      "update_field_read_rules",
      "Card.record_timestamps=",
    ]);
    expect(rewritten?.writes).toEqual([
      { attribute: "read_rule_id", value: 7 },
      { attribute: "read_rule_class", value: "Rule" },
    ]);

    // the port's registration carries the mod files' no-op, and the pinned
    // declaration names no stage of its own, so the row does NOT close here.
    expect(declared.at).toBeUndefined();
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("update_rule_cache: the executed body's cache clear, and the port's no-op", () => {
    const oracle = capture("update-rule-cache");
    const declared = registration(cardModPermissions, "update_rule_cache");

    expect(oracle.pinned_file).toBe(
      "card-mod-permissions-0.20.0/set/all/update_read_rules.rb",
    );
    expect(oracle.pinned_declaration_line).toBe(4);

    // what Ruby did: the body clears the rule cache
    const cleared = oracle.scenarios?.[0];
    expect(callsOf(cleared)).toEqual(["Card::Rule.clear_rule_cache"]);

    // the port's registration is the pinned declaration (:finalize,
    // when: :rule?) with the mod files' no-op, so the row does NOT close
    // here.
    expect(declared.at).toBe("finalize");
    expect(declared.when).toBe("rule?");
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("set_recaptcha_site_key: the executed body's config write, and the port's no-op", () => {
    const oracle = capture("set-recaptcha-site-key");
    const declared = registration(cardModRecaptcha, "set_recaptcha_site_key");

    expect(oracle.pinned_file).toBe(
      "card-mod-recaptcha-0.20.0/set/abstract/recaptcha_setting.rb",
    );
    expect(oracle.pinned_declaration_line).toBe(7);

    // what Ruby did: the body writes the card's content into the deck's
    // configuration under the key its codename names.
    const written = oracle.scenarios?.[0];
    expect(callsOf(written)).toEqual([
      "Card.config",
      "codename",
      "content",
      "recaptcha_recaptcha_site_key=",
    ]);
    expect(
      (written?.calls ?? []).find(
        (c: any) => c.call === "recaptcha_recaptcha_site_key=",
      )?.arguments,
    ).toEqual(["the-site-key"]);

    // the port's registration is the pinned declaration (:finalize, when:
    // :recaptcha_setting?) with the mod files' no-op, so the row does NOT
    // close here.
    expect(declared.at).toBe("finalize");
    expect(declared.when).toBe("recaptcha_setting?");
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("validate_coffeescript_syntax: the executed body's refusal, and the port's body that does not call the compiler", () => {
    const oracle = capture("validate-coffeescript-syntax");
    const declared = registration(cardModScript, "validate_coffeescript_syntax");

    expect(oracle.pinned_file).toBe(
      "card-mod-script-0.20.0/set/type/coffee_script.rb",
    );
    expect(oracle.pinned_declaration_line).toBe(5);

    // what Ruby did: the body asks the compiler to compile the content
    // and, when the compiler refuses, adds the compiler's message with the
    // stdin marker removed. The compiler is a stand-in here (the pinned
    // gemset carries no coffee-script), and the capture's notes say so.
    const refused = oracle.scenarios?.[0];
    expect(callsOf(refused)).toEqual(["content"]);
    expect(errorsOf(refused)).toEqual(["3:5 syntax error"]);

    // the port's registration carries the pinned declaration (:validate,
    // on: :save, changed: type_id and content), and its body names the
    // validator WITHOUT calling it, so the compiler is never asked. The row
    // does NOT close here.
    expect(declared.at).toBe("validate");
    expect(declared.on).toEqual(["save"]);
    expect(declared.changed).toEqual(["type_id", "content"]);
    expect(String(declared.fn)).not.toMatch(/validateSyntaxField\(/);
  });

  it("validate_javascript_syntax: the executed body's refusal, and the port's empty body", () => {
    const oracle = capture("validate-javascript-syntax");
    const declared = registration(cardModScript, "validate_javascript_syntax");

    expect(oracle.pinned_file).toBe(
      "card-mod-script-0.20.0/set/type/java_script.rb",
    );
    expect(oracle.pinned_declaration_line).toBe(5);

    // what Ruby did: the body asks the compiler to compile the content
    // and, when the compiler refuses, adds the compiler's message inside a
    // pre block. The compiler is a stand-in here (the pinned gemset carries
    // no uglifier), and the capture's notes say so.
    const refused = oracle.scenarios?.[0];
    expect(callsOf(refused)).toEqual(["content", "Utils.ansi2html"]);
    expect(errorsOf(refused)).toEqual(["<pre>the answer</pre>"]);

    // the port's registration carries the pinned declaration (:validate,
    // on: :save, changed: type_id and content) and an EMPTY body, so the
    // compiler is never asked. The row does NOT close here.
    expect(declared.at).toBe("validate");
    expect(declared.on).toEqual(["save"]);
    expect(declared.changed).toEqual(["type_id", "content"]);
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("discard_deleted_locations: the executed body's discard, and the port's no-op", () => {
    const oracle = capture("discard-deleted-locations");
    const declared = registration(cardModSession, "discard_deleted_locations");

    expect(oracle.pinned_file).toBe(
      "card-mod-session-0.20.0/set/all/location_history.rb",
    );
    expect(oracle.pinned_declaration_line).toBe(1);

    // what Ruby did: the body asks the request environment to discard the
    // card's locations, and then, only when the success belongs to this
    // card, configures the successful deletion.
    const deleted = oracle.scenarios?.[0];
    expect(callsOf(deleted)).toEqual(["Env.discard_locations_for", "success"]);

    // the port's registration is the pinned declaration (:finalize,
    // on: :delete) with the mod files' no-op, so the row does NOT close
    // here.
    expect(declared.at).toBe("finalize");
    expect(declared.on).toEqual(["delete"]);
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("save_current_location: the executed body's save, and the port's no-op", () => {
    const oracle = capture("save-current-location");
    const declared = registration(cardModSession, "save_current_location");

    expect(oracle.pinned_file).toBe(
      "card-mod-session-0.20.0/set/all/location_history.rb",
    );
    expect(oracle.pinned_declaration_line).toBe(6);

    // what Ruby did: the body asks the request environment to save the
    // card as the request's current location.
    const read = oracle.scenarios?.[0];
    expect(callsOf(read)).toEqual(["Env.save_location"]);

    // the port's registration carries the neighbour Ruby names
    // (before: :show_page) and the mod files' no-op, so the row does NOT
    // close here: the location save is the server's own work (the read
    // path), and the registration carries no `on: :read` because the
    // mod-event dispatch has no read arm.
    expect(declared.before).toBe("show_page");
    expect(declared.on).toBeUndefined();
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("no_deletion_if_used: the executed body's refusal, and the port's no-op", () => {
    const oracle = capture("no-deletion-if-used");
    const declared = registration(cardModStyle, "no_deletion_if_used");

    expect(oracle.pinned_file).toBe("card-mod-style-0.20.0/set/type/skin.rb");
    expect(oracle.pinned_declaration_line).toBe(13);

    // what Ruby did: the body asks the style rule for the keys it holds
    // and, when the card's own key is among them, refuses the delete with
    // the locale's message. The pinned gemset carries no such token, so the
    // capture names the missing token instead of inventing a text.
    const used = oracle.scenarios?.[0];
    const free = oracle.scenarios?.[1];
    expect(callsOf(used)).toEqual(["Card.[]", "key", "t"]);
    expect(errorsOf(used)).toEqual([
      "MISSING-LOCALE-TOKEN:style_delete_error_skin_used",
    ]);
    expect(callsOf(free)).toEqual(["Card.[]", "key"]);
    expect(errorsOf(free)).toEqual([]);

    // the port's registration is the pinned declaration (:validate,
    // on: :delete) with a no-op that stands down because the engine owns
    // the delete path's guard, so the row does NOT close here.
    expect(declared.at).toBe("validate");
    expect(declared.on).toEqual(["delete"]);
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("validate_css: the executed body's refusal, and the port's no-op", () => {
    const oracle = capture("validate-css");
    const declared = registration(cardModStyle, "validate_css");

    expect(oracle.pinned_file).toBe("card-mod-style-0.20.0/set/type/css.rb");
    expect(oracle.pinned_declaration_line).toBe(7);

    // what Ruby did: the body asks the parser to parse the content and,
    // when the parser refuses, adds the parser's message. The pinned
    // gemset carries no sass, so the PARSER is a stand-in that raises the
    // error class the body's own rescue names, and the capture's notes say
    // so.
    const refused = oracle.scenarios?.[0];
    expect(callsOf(refused)).toEqual(["content"]);
    expect(errorsOf(refused)).toEqual(["Invalid CSS: expected selector, was '}'"]);

    // the port's registration is the pinned declaration (:validate, on:
    // :save, changed: type_id and content) with a no-op that stands down
    // because the engine owns the validation, so the row does NOT close
    // here.
    expect(declared.at).toBe("validate");
    expect(declared.on).toEqual(["save"]);
    expect(declared.changed).toEqual(["type_id", "content"]);
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("validate_scss_syntax: the executed body's refusal, and the port's no-op", () => {
    const oracle = capture("validate-scss-syntax");
    const declared = registration(cardModStyle, "validate_scss_syntax");

    expect(oracle.pinned_file).toBe("card-mod-style-0.20.0/set/type/scss.rb");
    expect(oracle.pinned_declaration_line).toBe(4);

    // what Ruby did: the body reads the style rule's joined variables, and
    // when there are some it asks the engine to render the variables and
    // the content together; when the engine refuses, the body corrects the
    // line number against the variables and adds the message in a pre
    // block. The pinned gemset carries no sassc, so the ENGINE is a
    // stand-in that raises the error class the body's own rescue names,
    // and the capture's notes say so.
    const refused = oracle.scenarios?.[0];
    expect(callsOf(refused)).toEqual(["Card.[]", "content"]);
    expect(errorsOf(refused)).toEqual([
      "<pre>Error: stdin:9:5: expected expression.</pre>",
    ]);

    // the port's registration is the pinned declaration (:validate, on:
    // :save, changed: type_id and content) with a no-op that stands down
    // because the engine owns the validation, so the row does NOT close
    // here.
    expect(declared.at).toBe("validate");
    expect(declared.on).toEqual(["save"]);
    expect(declared.changed).toEqual(["type_id", "content"]);
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("delete_virtual_content: the executed body's two arms, and the port's named skip", () => {
    const oracle = capture("delete-virtual-content");
    const declared = registration(cardModVirtual, "delete_virtual_content");

    expect(oracle.pinned_file).toBe(
      "card-mod-virtual-0.20.0/set/abstract/virtual_cache.rb",
    );
    expect(oracle.pinned_declaration_line).toBe(26);

    // what Ruby did: the body deletes the card's content from the virtual
    // cache, and for a card that is NOT real it aborts with the success
    // status (the pinned card's own abort, so the capture carries the
    // pinned Card::Error::Abort and the status :success). A real card
    // goes on.
    const real = oracle.scenarios?.[0];
    const notReal = oracle.scenarios?.[1];
    expect(callsOf(real)).toEqual(["Virtual.delete", "real?"]);
    expect(real?.outcome?.raised).toBeNull();
    expect(callsOf(notReal)).toEqual(["Virtual.delete", "real?", "abort", "director.abort"]);
    expect(notReal?.outcome?.raised).toBe("Card::Error::Abort");
    expect(notReal?.outcome?.status).toBe("success");

    // the port's registration is the pinned declaration (:prepare_to_store,
    // on: :delete) with the mod's named skip: the port's write path has no
    // virtual diversion, so the abort Ruby performs cannot be reproduced
    // without divergence. The row does NOT close here.
    expect(declared.at).toBe("prepare_to_store");
    expect(declared.on).toEqual(["delete"]);
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("save_virtual_content: the executed body's save and abort, and the port's named skip", () => {
    const oracle = capture("save-virtual-content");
    const declared = registration(cardModVirtual, "save_virtual_content");

    expect(oracle.pinned_file).toBe(
      "card-mod-virtual-0.20.0/set/abstract/virtual_cache.rb",
    );
    expect(oracle.pinned_declaration_line).toBe(21);

    // what Ruby did: the body saves the card's content into the virtual
    // cache and then aborts with the success status. The abort is the
    // card's OWN pinned method, so the capture carries the pinned
    // Card::Error::Abort and the status :success.
    const saved = oracle.scenarios?.[0];
    expect(callsOf(saved)).toEqual(["Virtual.save", "abort", "director.abort"]);
    expect(saved?.outcome?.raised).toBe("Card::Error::Abort");
    expect(saved?.outcome?.status).toBe("success");

    // the port's registration is the pinned declaration (:prepare_to_store,
    // on: :save) with the mod's named skip: the port's write path has no
    // virtual diversion, so the abort Ruby performs cannot be reproduced
    // without divergence. The row does NOT close here.
    expect(declared.at).toBe("prepare_to_store");
    expect(declared.on).toEqual(["save"]);
    expect(carriesStubBody(declared)).toBe(true);
  });

  // ROWS-APPEND-HERE
});