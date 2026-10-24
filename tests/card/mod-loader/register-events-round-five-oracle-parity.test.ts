// register-events-round-five-oracle-parity.test.ts - the events family's
// fifth round: the rows whose port-side prerequisite LANDED, each pinned
// against its OWN executed Ruby oracle capture.
//
// WHAT THIS FILE IS. Round four closed the rows the callback-chain order
// observation and the port's own seams allow (the logger seam, the save
// input's subcard collection, the write order's obstacle rename and cache
// drop). Round five closes the rows whose engine sites the write order now
// reaches: the draft arm, the create preparation's autoname ladder, the
// save's content preparation, the new-card template read, the post-store
// lexicon maintenance, and the save walk's codename, key and name-legality
// checks. The registration carries a REAL body, and the body answers the
// executed capture.
//
// Each row here states two things: what Ruby's own body DID (from the
// executed capture), and what the port's registration carries — and, where
// the port's body can be run against the same input, that it produces the
// capture's own bytes.
//
// EVERY capture this file reads was produced by RUNNING the pinned gem's
// own body: the pinned file, declaration and body come out of the pinned
// gemset by line, and the body is executed by
// tests/server/oracle-capture-register-events-generic-ruby.rb over the
// recording doubles, driven by the row's own spec in
// tests/server/register-events-specs/. Nothing here was produced by
// reading the Ruby and transcribing what it looks like it would do. The
// re-run of each row's rig is byte-identical to the committed fixture.

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
  executed?: boolean;
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

/** The errors one executed scenario added, by message. */
export function errorsOf(scenario: Record<string, any> | undefined): unknown[] {
  return ((scenario?.errors_added ?? []) as Array<Record<string, any>>).map((e) => e.message);
}

describe("the events family, round five: the rows the port now carries", () => {
  it("save_draft: the executed body's draft write and abort, and the port's body that makes the same two calls", async () => {
    const oracle = capture("save-draft");
    const declared = registration(coreMod, "save_draft");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/content.rb");
    expect(oracle.pinned_declaration_line).toBe(7);
    expect(oracle.executed).toBe(true);

    // what Ruby did: the body saved the content as a draft (the card's
    // own content attribute fed save_content_draft) and then called the
    // card's OWN abort (the pinned method, result.rb:19-28), which raised
    // the pinned Card::Error::Abort with the status :success.
    const draft = oracle.scenarios?.[0];
    expect(callsOf(draft)).toEqual(["content", "save_content_draft", "abort", "director.abort"]);
    expect(draft?.outcome?.raised).toBe("Card::Error::Abort");
    expect(draft?.outcome?.status).toBe("success");

    // the port's registration is the pinned declaration (:store, on:
    // :update, when: :draft?) with a REAL body, not the stub factory's.
    expect(declared.at).toBe("store");
    expect(declared.on).toEqual(["update"]);
    expect(declared.when).toBe("draft?");
    expect(carriesStubBody(declared)).toBe(false);

    // and the port's body makes the SAME two calls, in the SAME order,
    // feeding the draft write the card's own content.
    const made: string[] = [];
    let drafted: string | undefined;
    await declared.fn(
      { name: "Joe User", dbContent: "<p>draft body</p>" } as never,
      undefined as never,
      {
        driver: undefined as never,
        lexicon: undefined as never,
        stage: "store",
        skipEvent: () => false,
        saveContentDraft: async (content: string | undefined) => {
          made.push("save_content_draft");
          drafted = content;
        },
        abortSuccess: () => {
          made.push("abort");
        },
      } as never,
    );
    expect(made).toEqual(["save_content_draft", "abort"]);
    expect(drafted).toBe("<p>draft body</p>");
  });

  it("set_autoname: the executed body's four writes, and the port's body that writes the same four", async () => {
    const oracle = capture("set-autoname");
    const declared = registration(coreMod, "set_autoname");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/autoname.rb");
    expect(oracle.pinned_declaration_line).toBe(1);
    expect(oracle.executed).toBe(true);

    // what Ruby did: the body read the autoname rule, took the name from
    // it, assigned the card's name, then wrote the rule card's content
    // and expired it (and pulled the card from the trash).
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

    // the port's registration is the pinned declaration (:prepare_to_store,
    // on: :create, when: :autoname?) with a REAL body.
    expect(declared.at).toBe("prepare_to_store");
    expect(declared.on).toEqual(["create"]);
    expect(declared.when).toBe("autoname?");
    expect(carriesStubBody(declared)).toBe(false);

    // and the port's body makes the same calls, in the same order, with
    // the same values: the rule card's content is the seed, the assigned
    // name is the first free successor, the rule card's content becomes
    // that name, and the rule card is expired.
    const made: string[] = [];
    let seed: string | undefined;
    let assigned: string | undefined;
    let ruleContent: string | undefined;
    await declared.fn(
      { name: "" } as never,
      undefined as never,
      {
        driver: undefined as never,
        lexicon: undefined as never,
        stage: "prepare_to_store",
        skipEvent: () => false,
        autonameRule: async () => {
          made.push("rule");
          return { id: 343, content: "Joe User+Account+Autoname" };
        },
        autonameName: async (content: string) => {
          made.push("autoname");
          seed = content;
          return "Joe User+Account";
        },
        setCardName: (name: string) => {
          made.push("name=");
          assigned = name;
        },
        updateAutonameRuleContent: async (name: string) => {
          made.push("update_column");
          ruleContent = name;
        },
        expireAutonameRule: () => {
          made.push("expire");
        },
      } as never,
    );
    expect(made).toEqual(["rule", "autoname", "name=", "update_column", "expire"]);
    expect(seed).toBe("Joe User+Account+Autoname");
    expect(assigned).toBe("Joe User+Account");
    expect(ruleContent).toBe("Joe User+Account");
  });

  it("set_content: the executed body's three calls, and the port's body that makes the same three", async () => {
    const oracle = capture("set-content");
    const declared = registration(coreMod, "set_content");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/content.rb");
    expect(oracle.pinned_declaration_line).toBe(1);
    expect(oracle.executed).toBe(true);

    // what Ruby did: the body prepared the stored content, assigned it,
    // and cleared the drafts.
    const saved = oracle.scenarios?.[0];
    expect(callsOf(saved)).toEqual(["prepare_db_content", "content=", "clear_drafts"]);
    expect(saved?.writes).toEqual([{ attribute: "content", value: "<p>prepared body</p>" }]);

    // the port's registration is the pinned declaration (:store, on: :save)
    // with a REAL body.
    expect(declared.at).toBe("store");
    expect(declared.on).toEqual(["save"]);
    expect(carriesStubBody(declared)).toBe(false);

    // and the port's body makes the same calls, in the same order, with
    // the same value: the prepared content is what the card stores.
    const made: string[] = [];
    let stored: string | undefined;
    await declared.fn(
      { name: "Decko", dbContent: "<p>posted body</p>" } as never,
      undefined as never,
      {
        driver: undefined as never,
        lexicon: undefined as never,
        stage: "store",
        skipEvent: () => false,
        prepareDbContent: async (content: string) => {
          made.push("prepare_db_content");
          return "<p>prepared body</p>";
        },
        setContent: (content: string) => {
          made.push("content=");
          stored = content;
        },
        clearDrafts: () => {
          made.push("clear_drafts");
        },
      } as never,
    );
    expect(made).toEqual(["prepare_db_content", "content=", "clear_drafts"]);
    expect(stored).toBe("<p>prepared body</p>");
  });

  it("set_default_content: the executed body's two calls, and the port's body that makes the same two", async () => {
    const oracle = capture("set-default-content");
    const declared = registration(coreMod, "set_default_content");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/content.rb");
    expect(oracle.pinned_declaration_line).toBe(12);
    expect(oracle.executed).toBe(true);

    // what Ruby did: the body read the type's template content and wrote
    // it as the card's db_content.
    const created = oracle.scenarios?.[0];
    expect(callsOf(created)).toEqual(["default_content", "db_content="]);
    expect(created?.writes).toEqual([
      { attribute: "db_content", value: "<p>template body</p>" },
    ]);

    // the port's registration is the pinned declaration
    // (:prepare_to_validate, on: :create, when: use_default_content?) with
    // a REAL body.
    expect(declared.at).toBe("prepare_to_validate");
    expect(declared.on).toEqual(["create"]);
    expect(declared.when).toBe("use_default_content?");
    expect(carriesStubBody(declared)).toBe(false);

    // and the port's body makes the same calls, in the same order, with
    // the same value.
    const made: string[] = [];
    let stored: string | undefined;
    await declared.fn(
      { name: "Decko" } as never,
      undefined as never,
      {
        driver: undefined as never,
        lexicon: undefined as never,
        stage: "prepare_to_validate",
        skipEvent: () => false,
        defaultContent: async () => {
          made.push("default_content");
          return "<p>template body</p>";
        },
        setDbContent: (content: string) => {
          made.push("db_content=");
          stored = content;
        },
      } as never,
    );
    expect(made).toEqual(["default_content", "db_content="]);
    expect(stored).toBe("<p>template body</p>");
  });

  it("update_lexicon: the executed body's two actions, and the port's body that picks the same one", async () => {
    const oracle = capture("update-lexicon");
    const declared = registration(coreMod, "update_lexicon");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/name_events.rb");
    expect(oracle.pinned_declaration_line).toBe(76);
    expect(oracle.executed).toBe(true);

    // what Ruby did: the body scheduled the lexicon work for after the
    // store, adding on a create and updating on an update.
    const created = oracle.scenarios?.[0];
    const updated = oracle.scenarios?.[1];
    expect(callsOf(created)).toEqual(["director.after_store", "Lexicon.add"]);
    expect(callsOf(updated)).toEqual(["director.after_store", "Lexicon.update"]);

    // the port's registration is the pinned declaration (:store, changed:
    // :name) with a REAL body.
    expect(declared.at).toBe("store");
    expect(declared.changed).toEqual(["name"]);
    expect(carriesStubBody(declared)).toBe(false);

    // and the port's body picks the same action from the card's own
    // action: a create ADDS, an update REPLACES.
    const onCreate: string[] = [];
    await declared.fn(
      { name: "Decko", action: "create" } as never,
      undefined as never,
      {
        driver: undefined as never,
        lexicon: undefined as never,
        stage: "store",
        skipEvent: () => false,
        lexiconAdd: () => {
          onCreate.push("add");
        },
        lexiconUpdate: () => {
          onCreate.push("update");
        },
      } as never,
    );
    expect(onCreate).toEqual(["add"]);

    const onUpdate: string[] = [];
    await declared.fn(
      { name: "Decko", action: "update" } as never,
      undefined as never,
      {
        driver: undefined as never,
        lexicon: undefined as never,
        stage: "store",
        skipEvent: () => false,
        lexiconAdd: () => {
          onUpdate.push("add");
        },
        lexiconUpdate: () => {
          onUpdate.push("update");
        },
      } as never,
    );
    expect(onUpdate).toEqual(["update"]);
  });

  it("validate_key: the executed body's two refusals, and the port's body that refuses the same two ways", async () => {
    const oracle = capture("validate-key");
    const declared = registration(coreMod, "validate_key");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/name_events.rb");
    expect(oracle.pinned_declaration_line).toBe(38);
    expect(oracle.executed).toBe(true);

    // what Ruby did: a key that matches the name's key passes; an empty
    // key is refused with the blank-key text; a key that is not the
    // name's key is refused with the wrong-key text, and that text names
    // both the key and the name.
    const matching = oracle.scenarios?.[0];
    const blank = oracle.scenarios?.[1];
    const wrong = oracle.scenarios?.[2];
    expect(callsOf(matching)).toEqual(["key", "key", "name"]);
    expect(callsOf(blank)).toEqual(["key"]);
    expect(callsOf(wrong)).toEqual(["key", "key", "name", "key", "name"]);
    expect(errorsOf(blank)).toEqual(["cannot be blank"]);
    expect(errorsOf(wrong)).toEqual(["wrong key 'other' for name Decko"]);

    // the port's registration is the pinned declaration (after:
    // validate_name, on: :save, when: no_autoname?) with a REAL body.
    expect(declared.after).toBe("validate_name");
    expect(declared.on).toEqual(["save"]);
    expect(declared.when).toBe("no_autoname?");
    expect(carriesStubBody(declared)).toBe(false);

    // and the port's body makes the SAME calls, in the SAME order, and
    // refuses with the capture's own words.
    const drive = async (key: string, nameKey: string, name: string) => {
      const made: string[] = [];
      let refused: string | undefined;
      await declared
        .fn(
          { name } as never,
          undefined as never,
          {
            driver: undefined as never,
            lexicon: undefined as never,
            stage: "validate",
            skipEvent: () => false,
            // key — the card's key column
            cardKey: () => {
              made.push("key");
              return key;
            },
            // name.key — the key the name computes
            nameKey: () => {
              made.push("name");
              return nameKey;
            },
            // name — the card's name
            cardName: () => {
              made.push("name");
              return name;
            },
            // errors.add :key, message
            refuseKey: (message: string) => {
              refused = message;
              throw new Error("refused");
            },
          } as never,
        )
        .catch(() => undefined);
      return { made, refused };
    };

    const pass = await drive("decko", "decko", "Decko");
    expect(pass.made).toEqual(["key", "key", "name"]);
    expect(pass.refused).toBeUndefined();

    const empty = await drive("", "decko", "Decko");
    expect(empty.made).toEqual(["key"]);
    expect(empty.refused).toBe("cannot be blank");

    const other = await drive("other", "decko", "Decko");
    expect(other.made).toEqual(["key", "key", "name", "key", "name"]);
    expect(other.refused).toBe("wrong key 'other' for name Decko");
  });

  it("validate_legality_of_name: the executed body's chain, and the port's body that runs the same chain", async () => {
    const oracle = capture("validate-legality-of-name");
    const declared = registration(coreMod, "validate_legality_of_name");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/name_events.rb");
    expect(oracle.pinned_declaration_line).toBe(23);
    expect(oracle.executed).toBe(true);

    // what Ruby did: a legal name passes the whole chain; a name over 255
    // characters is refused with the too-long text; a blank name is
    // refused with the blank-name text.
    const legal = oracle.scenarios?.[0];
    const tooLong = oracle.scenarios?.[1];
    const blank = oracle.scenarios?.[2];
    // The rig's String#blank? asks the name double for empty?, and the
    // double records that call only when the scenario did not supply it
    // (the blank scenario supplies empty?: true, the legal one does not).
    // That call is the double's own internal step, so the comparison
    // drops it from the capture.
    expect(callsOf(legal).filter((call) => call !== "empty?")).toEqual([
      "name",
      "name",
      "name_incomplete?",
      "name",
      "changing_existing_tag_to_compound?",
    ]);
    expect(callsOf(tooLong)).toEqual(["name", "name"]);
    expect(callsOf(blank)).toEqual(["name", "name"]);
    expect(errorsOf(legal)).toEqual([]);
    expect(errorsOf(tooLong)).toEqual([
      "is too long (255 character maximum; length is 300)",
    ]);
    expect(errorsOf(blank)).toEqual(["can't be blank"]);

    // the port's registration is the pinned declaration (no stage, no
    // gate) with a REAL body.
    expect(declared.at).toBeUndefined();
    expect(carriesStubBody(declared)).toBe(false);

    // and the port's body runs the same chain: it asks the same questions
    // in the same order, and refuses with the capture's own words.
    const drive = async (input: {
      name: string;
      blank?: boolean;
      incomplete?: boolean;
      valid?: boolean;
      tagInUse?: boolean;
    }) => {
      const made: string[] = [];
      let refused:
        | { message: string; arm?: string; tagInUse?: boolean }
        | undefined;
      await declared
        .fn(
          { name: input.name } as never,
          undefined as never,
          {
            driver: undefined as never,
            lexicon: undefined as never,
            stage: "validate",
            skipEvent: () => false,
            // name — the card's name
            cardName: () => {
              made.push("name");
              return input.name;
            },
            // name.blank?
            nameBlank: () => {
              made.push("name");
              return input.blank === true;
            },
            // name_incomplete?
            nameIncomplete: () => {
              made.push("name_incomplete?");
              return input.incomplete === true;
            },
            // name.valid?
            nameValid: () => {
              made.push("name");
              return input.valid !== false;
            },
            // Card::Name.banned_array * " "
            bannedCharacters: () => "",
            // changing_existing_tag_to_compound?
            changingExistingTagToCompound: () => {
              made.push("changing_existing_tag_to_compound?");
              return input.tagInUse === true;
            },
            // errors.add :name, message
            refuseName: (message: string, arm: string) => {
              refused = { message, arm };
              throw new Error("refused");
            },
            // errors.add :name, t(:core_error_name_tag, name: name)
            refuseNameTagInUse: (message: string) => {
              refused = { message, tagInUse: true };
              throw new Error("refused");
            },
          } as never,
        )
        .catch(() => undefined);
      return { made, refused };
    };

    const legalRun = await drive({ name: "Decko" });
    expect(legalRun.made).toEqual([
      "name",
      "name",
      "name_incomplete?",
      "name",
      "changing_existing_tag_to_compound?",
    ]);
    expect(legalRun.refused).toBeUndefined();

    const longRun = await drive({ name: "a".repeat(300) });
    expect(longRun.made).toEqual(["name", "name"]);
    expect(longRun.refused?.message).toBe(
      "is too long (255 character maximum; length is 300)",
    );
    expect(longRun.refused?.arm).toBe("too-long");

    const blankRun = await drive({ name: "", blank: true });
    expect(blankRun.made).toEqual(["name", "name"]);
    expect(blankRun.refused?.message).toBe("can't be blank");
    expect(blankRun.refused?.arm).toBe("blank");

    // the tag-in-use arm is the chain's last one, and it is the only arm
    // that waits on a question the port answers from the card's own row.
    // The message names the card, so the name is read once more for it
    // (Ruby's `t(:core_error_name_tag, name: name)` reads it too).
    const tagRun = await drive({ name: "Pudding+cake", tagInUse: true });
    expect(tagRun.made).toEqual([
      "name",
      "name",
      "name_incomplete?",
      "name",
      "changing_existing_tag_to_compound?",
      "name",
    ]);
    expect(tagRun.refused?.message).toBe("Pudding+cake in use as a tag");
    expect(tagRun.refused?.tagInUse).toBe(true);
  });

  it("validate_name: the executed body's two stages, and the port's body that runs the same two", async () => {
    const oracle = capture("validate-name");
    const declared = registration(coreMod, "validate_name");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/name_events.rb");
    expect(oracle.pinned_declaration_line).toBe(3);
    expect(oracle.executed).toBe(true);

    // what Ruby did: the body runs the legality chain, and only when the
    // chain added no error does it write the temp cache and run the
    // uniqueness check. A name the chain refuses stops the body there: the
    // temp cache and the uniqueness check never run.
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
    // on: :save, changed: :name, when: :no_autoname?) with a REAL body.
    expect(declared.at).toBe("validate");
    expect(declared.on).toEqual(["save"]);
    expect(declared.changed).toEqual(["name"]);
    expect(declared.when).toBe("no_autoname?");
    expect(carriesStubBody(declared)).toBe(false);

    // and the port's body runs the same two stages, in the capture's
    // order: the legality chain first, then the error bag, then the
    // uniqueness check. The capture's one call with no port counterpart is
    // Card.write_to_temp_cache, the caching remainder the port's own note
    // names (the port's render cache is invalidated by its write path
    // rather than warmed by the validation walk).
    const drive = async (input: { errorsAny?: boolean }) => {
      const made: string[] = [];
      await declared
        .fn(
          { name: "Decko" } as never,
          undefined as never,
          {
            driver: undefined as never,
            lexicon: undefined as never,
            stage: "validate",
            skipEvent: () => false,
            // validate_legality_of_name
            validateLegality: async () => {
              made.push("validate_legality_of_name");
            },
            // errors.any?
            errorsAny: () => {
              made.push("errors.any?");
              return input.errorsAny === true;
            },
            // validate_uniqueness_of_name
            validateUniqueness: async () => {
              made.push("validate_uniqueness_of_name");
            },
          } as never,
        )
        .catch(() => undefined);
      return made;
    };

    expect(await drive({})).toEqual([
      "validate_legality_of_name",
      "errors.any?",
      "validate_uniqueness_of_name",
    ]);
    expect(await drive({ errorsAny: true })).toEqual([
      "validate_legality_of_name",
      "errors.any?",
    ]);
  });
  it("validate_renaming: the executed body's early return and its two refusals, and the port's body that refuses the same two ways", async () => {
    const oracle = capture("validate-renaming");
    const declared = registration(coreMod, "validate_renaming");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/name_events.rb");
    expect(oracle.pinned_declaration_line).toBe(46);
    expect(oracle.executed).toBe(true);

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
    expect(callsOf(type)).toEqual([
      "name_before_act",
      "name",
      "content_is_changing?",
      "type_is_changing?",
      "detect_illegal_compound_names",
    ]);
    expect(errorsOf(type)).toEqual(["cannot change type while changing name"]);

    // the port's registration is the pinned declaration (:validate,
    // on: :update, changed: :name, skip: :allowed) with a REAL body.
    expect(declared.at).toBe("validate");
    expect(declared.on).toEqual(["update"]);
    expect(declared.changed).toEqual(["name"]);
    expect(declared.skip).toBe("allowed");
    expect(carriesStubBody(declared)).toBe(false);

    // and the port's body asks the capture's questions in the capture's
    // order and refuses with the capture's own words. The port refuses at
    // the first refusal (the way its own built-in guards refuse today),
    // where Ruby's body collects its errors and runs on: the save is
    // refused either way.
    const drive = async (input: {
      sameNameAsBefore?: boolean;
      contentChanging?: boolean;
      typeChanging?: boolean;
    }) => {
      const made: string[] = [];
      let refused: { attribute: string; message: string } | undefined;
      await declared
        .fn(
          { name: "Decko" } as never,
          undefined as never,
          {
            driver: undefined as never,
            lexicon: undefined as never,
            stage: "validate",
            skipEvent: () => false,
            // name_before_act&.to_name == name
            sameNameAsBefore: () => {
              made.push("name_before_act");
              return input.sameNameAsBefore === true;
            },
            // content_is_changing?
            contentIsChanging: () => {
              made.push("content_is_changing?");
              return input.contentChanging === true;
            },
            // type_is_changing?
            typeIsChanging: () => {
              made.push("type_is_changing?");
              return input.typeChanging === true;
            },
            // errors.add :content, t(:core_cannot_change_content)
            refuseContentChange: (message: string) => {
              made.push("errors.add :content");
              refused = { attribute: "content", message };
              throw new Error("refused");
            },
            // errors.add :type, t(:core_cannot_change_type)
            refuseTypeChange: (message: string) => {
              made.push("errors.add :type");
              refused = { attribute: "type", message };
              throw new Error("refused");
            },
            // detect_illegal_compound_names
            detectIllegalCompoundNames: async () => {
              made.push("detect_illegal_compound_names");
            },
          } as never,
        )
        .catch(() => undefined);
      return { made, refused };
    };

    const variantRun = await drive({ sameNameAsBefore: true });
    expect(variantRun.made).toEqual(["name_before_act"]);
    expect(variantRun.refused).toBeUndefined();

    const contentRun = await drive({ contentChanging: true });
    expect(contentRun.made).toEqual([
      "name_before_act",
      "content_is_changing?",
      "errors.add :content",
    ]);
    expect(contentRun.refused).toEqual({
      attribute: "content",
      message: "cannot change content while changing name",
    });

    const typeRun = await drive({ typeChanging: true });
    expect(typeRun.made).toEqual([
      "name_before_act",
      "content_is_changing?",
      "type_is_changing?",
      "errors.add :type",
    ]);
    expect(typeRun.refused).toEqual({
      attribute: "type",
      message: "cannot change type while changing name",
    });

    const cleanRun = await drive({});
    expect(cleanRun.made).toEqual([
      "name_before_act",
      "content_is_changing?",
      "type_is_changing?",
      "detect_illegal_compound_names",
    ]);
    expect(cleanRun.refused).toBeUndefined();
  });

  it("validate_type_change: the executed body's duplicate walk, and the port's named skip with its mechanism", () => {
    const oracle = capture("validate-type-change");
    const declared = registration(coreMod, "validate_type_change");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/type.rb");
    expect(oracle.pinned_declaration_line).toBe(8);
    expect(oracle.executed).toBe(true);

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
    // on: :update, changed: :type_id) with the NAMED SKIP: the port's
    // save path has no create-validation walk as a callable unit, and the
    // port's update walk resolves the type-scoped set modules from the
    // STORED type (the pattern type), so a type-changing save never runs
    // the NEW type's validate events the way Ruby's duplicate-as-a-create
    // walk does.
    expect(declared.at).toBe("validate");
    expect(declared.on).toEqual(["update"]);
    expect(declared.changed).toEqual(["type_id"]);
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("validate_uniqueness_of_name: the executed body's two lookups, and the port's body that makes the same two", async () => {
    const oracle = capture("validate-uniqueness-of-name");
    const declared = registration(coreMod, "validate_uniqueness_of_name");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/name_events.rb");
    expect(oracle.pinned_declaration_line).toBe(12);
    expect(oracle.executed).toBe(true);

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

    // the port's registration is the pinned declaration's own skip:
    // :allowed, with a REAL body now.
    expect(declared.skip).toBe("allowed");
    expect(carriesStubBody(declared)).toBe(false);

    // and the port's body makes the same two lookups in the same order:
    // the key, the lexicon's id, then the card's own id, and only a live
    // row refuses.
    const drive = async (input: {
      key?: string;
      existingId?: number;
      selfId?: number;
      liveName?: string;
    }) => {
      const made: string[] = [];
      let refused: string | undefined;
      await declared
        .fn(
          { name: "Decko" } as never,
          undefined as never,
          {
            driver: undefined as never,
            lexicon: undefined as never,
            stage: "validate",
            skipEvent: () => false,
            // key
            cardKey: () => {
              made.push("key");
              return input.key ?? "decko";
            },
            // Lexicon.id key
            lexiconId: async (key: string) => {
              made.push("Lexicon.id");
              return input.existingId;
            },
            // id
            cardId: () => {
              made.push("id");
              return input.selfId;
            },
            // Card.where(id: existing_id, trash: false).take
            liveCardName: async (id: number) => {
              made.push("Card.where");
              return input.liveName;
            },
            // errors.add :name, t(:core_error_name_exists, name: ...)
            refuseNameTaken: (existingName: string) => {
              made.push("errors.add :name");
              refused = existingName;
              throw new Error("refused");
            },
          } as never,
        )
        .catch(() => undefined);
      return { made, refused };
    };

    // a free name: the fast lookup finds nothing and the body stops.
    const freeRun = await drive({});
    expect(freeRun.made).toEqual(["key", "Lexicon.id"]);
    expect(freeRun.refused).toBeUndefined();

    // the card's own id: the guard lets a card keep its own name.
    const ownRun = await drive({ existingId: 7, selfId: 7 });
    expect(ownRun.made).toEqual(["key", "Lexicon.id", "id"]);
    expect(ownRun.refused).toBeUndefined();

    // a live card owns the name: the re-check finds the row and the body
    // refuses with the existing card's name.
    const takenRun = await drive({ existingId: 9, selfId: 7, liveName: "Joe User+Card" });
    expect(takenRun.made).toEqual([
      "key",
      "Lexicon.id",
      "id",
      "Card.where",
      "errors.add :name",
    ]);
    expect(takenRun.refused).toBe("Joe User+Card");

    // a trashed card owns the name: the re-check finds no live row and the
    // body stops, the way Ruby stops.
    const trashedRun = await drive({ existingId: 9, selfId: 7 });
    expect(trashedRun.made).toEqual(["key", "Lexicon.id", "id", "Card.where"]);
    expect(trashedRun.refused).toBeUndefined();
  });

  it("remove_file_event: the TEMPLATE expansion, executed, and the port's named skip with its mechanism", () => {
    const oracle = capture("remove-file-event");
    const declared = registration(cardModCarrierwave, "remove_file_event");

    // the event is a TEMPLATE expansion: the gem writes it inside a
    // class_eval string (card-mod-carrierwave-0.20.0/lib/carrier_wave/
    // card_mount.rb:23-58) and the column names it.
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

    // the port's registration is the expansion, clause for clause, with
    // the NAMED SKIP: the port's delete path carries no stored-file
    // cleanup at all, so the files of a deleted card's actions stay on disk
    // where Ruby removes them. THE MECHANISM, NAMED: the port's delete
    // path has no attachment cleanup site. THE ROW CLOSES on the measured
    // skip, and the unblock condition is: the delete path grows an
    // attachment cleanup.
    expect(declared.at).toBe("finalize");
    expect(declared.on).toEqual(["delete"]);
    expect(declared.when).toBe("no_history?");
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("remove_image_event: the TEMPLATE expansion, executed, and the port's named skip with its mechanism", () => {
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

    // the port's registration is the expansion, clause for clause, with
    // the NAMED SKIP: the port's delete path carries no stored-image
    // cleanup, so the images of a deleted card's actions stay on disk
    // where Ruby removes them. THE MECHANISM, NAMED: the port's delete
    // path has no attachment cleanup site. THE ROW CLOSES on the measured
    // skip, and the unblock condition is: the delete path grows an
    // attachment cleanup.
    expect(declared.at).toBe("finalize");
    expect(declared.on).toEqual(["delete"]);
    expect(declared.when).toBe("no_history?");
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("remove_codename: the executed body's attachment load and codename clear, and the port's named skip with its mechanism", () => {
    const oracle = capture("remove-codename");
    const declared = registration(cardModAssets, "remove_codename");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-mod-assets-0.20.0/set/right/asset_output.rb");
    expect(oracle.pinned_declaration_line).toBe(13);
    expect(oracle.executed).toBe(true);

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

  it("copy_theme: the executed body's theme initialization, and the port's named skip with its mechanism", () => {
    const oracle = capture("copy-theme");
    const declared = registration(cardModBootstrap, "copy_theme");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe(
      "card-mod-bootstrap-0.20.0/set/type/bootswatch_skin/events.rb",
    );
    expect(oracle.pinned_declaration_line).toBe(10);
    expect(oracle.executed).toBe(true);

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
    // path checks the field permissions (the engine's checkSkinFieldPermissions)
    // but does not create the +*colors and +*variables fields themselves,
    // the port's own note at that check says so. THE ROW CLOSES on the
    // measured skip, and the unblock condition is: the skin create path
    // creates the two scss fields.
    expect(declared.at).toBe("prepare_to_store");
    expect(declared.on).toEqual(["create"]);
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("initialize_because_of_type_change: the executed body's three steps, and the port's own place for the work with the divergence named", () => {
    const oracle = capture("initialize-because-of-type-change");
    const declared = registration(cardModBootstrap, "initialize_because_of_type_change");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe(
      "card-mod-bootstrap-0.20.0/set/type/bootswatch_skin/events.rb",
    );
    expect(oracle.pinned_declaration_line).toBe(1);
    expect(oracle.executed).toBe(true);

    // what Ruby did: the body writes the card's own content back, then
    // initializes the theme (the two scss fields, from the pinned method),
    // then reads the old skin's items (the pinned old_skin_items) and,
    // when there are any, adds the stylesheets field with them.
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
    // applySkinTypeChange), pinned by the port's own file
    // (tests/card/actions/bootstrap-skin-type-change-events.test.ts: the
    // fields gained, the empty-list no-field arm, the css/scss refusal).
    // THE DIVERGENCE, NAMED: the port writes the fields under the
    // STARRED tags "+*colors", "+*variables" and "+*stylesheets" where
    // Ruby's field names are "+colors", "+variables" and "+stylesheets",
    // and the port's +*stylesheets content is the bare item names joined
    // with a newline where Ruby assigns an ARRAY through content= and the
    // collection mod's items_content turns it into the bracketed list.
    // Ruby's first step (self.content = content) writes the card's own
    // content back, the same bytes, and the port leaves the content
    // alone, so the card's content is the same either way. THE ROW
    // CLOSES on the port's own place for the work, with the divergence
    // named.
    expect(declared.at).toBe("prepare_to_store");
    expect(declared.on).toEqual(["update"]);
    expect(declared.changed).toEqual(["type"]);
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("update_skin_asset_input: the executed body's two arms, and the port's own place for the work", () => {
    const oracle = capture("update-skin-asset-input");
    const declared = registration(cardModBootstrap, "update_skin_asset_input");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-mod-bootstrap-0.20.0/set/abstract/skin_field.rb");
    expect(oracle.pinned_declaration_line).toBe(1);
    expect(oracle.executed).toBe(true);
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

  it("use_as_current_skin: the executed body's style-rule write, and the port's own place for the work", () => {
    const oracle = capture("use-as-current-skin");
    const declared = registration(cardModBootstrap, "use_as_current_skin");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe(
      "card-mod-bootstrap-0.20.0/set/type/bootswatch_skin.rb",
    );
    expect(oracle.pinned_declaration_line).toBe(180);
    expect(oracle.executed).toBe(true);

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

  it("validate_theme_template: the executed body's refusal in the PINNED locale's words, and the port's own place for the work", () => {
    const oracle = capture("validate-theme-template");
    const declared = registration(cardModBootstrap, "validate_theme_template");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe(
      "card-mod-bootstrap-0.20.0/set/type/bootswatch_skin/events.rb",
    );
    expect(oracle.pinned_declaration_line).toBe(14);
    expect(oracle.executed).toBe(true);

    // what Ruby did: a theme card that is not a bootswatch skin is refused
    // with the pinned locale's own text naming the theme; a bootswatch skin
    // passes.
    const notASkin = oracle.scenarios?.[0];
    const aSkin = oracle.scenarios?.[1];
    expect(errorsOf(notASkin)).toEqual(["not a valid theme Joe User+Note"]);
    expect(errorsOf(aSkin)).toEqual([]);

    // the port's registration is the pinned declaration (:validate,
    // on: :create) and the body it carries is the no-op. THE PORT'S OWN
    // PLACE FOR THE WORK CARRIES THE BODY: the skin create path's theme
    // validation (the engine's applySkinCreateEvents), which reads the
    // +parent's first item and, when that parent exists and is not a
    // bootswatch skin, refuses the create with the capture's own sentence,
    // "not a valid theme <name>". Pinned by the port's own file
    // (tests/card/actions/bootstrap-skin-create-events.test.ts: a +parent
    // naming an existing non-skin card refuses the create, a +parent
    // naming a real bootswatch_skin proceeds, and a +parent naming a
    // nonexistent card proceeds).
    // THE DIVERGENCE, NAMED: in the shape the port refuses, Ruby never
    // reaches the message at all. The pinned theme_card recurses into the
    // non-skin parent (parent_skin_card.theme_card) and raises
    // NoMethodError, a 500, where the port refuses with the error the
    // event was written to give. The shape the capture shows, a theme card
    // that answers with a non-skin type, is the port's own refusal. THE
    // ROW CLOSES on the port's own place for the work, with the
    // divergence named.
    expect(declared.at).toBe("validate");
    expect(declared.on).toEqual(["create"]);
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("change_bucket_if_read_only: the executed body's storage-type write, and the port's named skip with its mechanism", () => {
    const oracle = capture("change-bucket-if-read-only");
    const declared = registration(cardModCarrierwave, "change_bucket_if_read_only");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe(
      "card-mod-carrierwave-0.20.0/set/abstract/attachment/cloud.rb",
    );
    expect(oracle.pinned_declaration_line).toBe(3);
    expect(oracle.executed).toBe(true);

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
});
