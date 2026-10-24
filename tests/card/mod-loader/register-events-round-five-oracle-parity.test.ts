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
});
