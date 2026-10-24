// register-events-round-seven-oracle-parity.test.ts - the events family's
// seventh round: the next ten rows in row-id order, each pinned against
// its OWN executed Ruby oracle capture.
//
// WHAT THIS FILE IS. Round six took the next eight rows in row-id order
// and closed each one on its own evidence. This round takes the next ten:
// the three list rows (add_and_drop_items, delist, insert_item_event) and
// the seven permissions rows (cascade_read_rule, check_permissions,
// expire_related, set_field_read_rules, set_read_rule, update_read_rule,
// update_rule_cache).
//
// Each row here states two things: what Ruby's own body DID (from the
// executed capture), and what the port's own place for the work carries.
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
import cardModList from "../../../src/card/mod-loader/mods/card-mod-list.js";
import cardModPermissions from "../../../src/card/mod-loader/mods/card-mod-permissions.js";
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

/** The port's own source file, read as text, so a row's body owner is
 *  pinned against the file that carries it and not against a prose note. */
export function portSource(relative: string): string {
  return readFileSync(new URL(`../../../${relative}`, import.meta.url), "utf8");
}

describe("the events family, round seven: the next ten rows in row-id order", () => {
  it("add_and_drop_items: the executed body's two reads and its two operations, and the port's write route carrying the body", () => {
    const oracle = capture("add-and-drop-items");
    const declared = registration(cardModList, "add_and_drop_items");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-mod-list-0.20.0/set/abstract/01_list/events.rb");
    expect(oracle.pinned_declaration).toBe(
      "event :add_and_drop_items, :prepare_to_validate, on: :save do",
    );
    expect(oracle.pinned_declaration_line).toBe(1);
    expect(oracle.executed).toBe(true);

    // what Ruby did: the body reads the request's add_item and drop_item
    // and adds and drops each of them; a request that carried neither
    // makes the body do nothing.
    const adding = oracle.scenarios?.[0];
    const quiet = oracle.scenarios?.[1];
    expect(callsOf(adding)).toEqual(["Env.params", "Env.params", "add_item", "drop_item"]);
    expect(callsOf(quiet)).toEqual(["Env.params", "Env.params"]);

    // the port's registration is the pinned declaration (:prepare_to_validate,
    // on: :save, with no when clause) with the mod files' no-op. THE ROW
    // CLOSES on the port's own place for the work: the body runs inline in
    // the write route's listItemContent, which applies Ruby's operations in
    // Ruby's order against the content the request assigned (Ruby's events
    // read the card AFTER assign_attributes).
    expect(declared.at).toBe("prepare_to_validate");
    expect(declared.on).toEqual(["save"]);
    expect(declared.when).toBeUndefined();
    expect(carriesStubBody(declared)).toBe(true);

    // the port's own place for the work: listItemContent, and the four
    // Env.params keys the two list bodies read. The source order IS the
    // behavioral pin: Ruby's two events run in definition order within the
    // same stage, so the adds are appended before the drops are applied.
    const route = portSource("src/server/write-routes.ts");
    expect(route).toContain("function listItemContent(");
    for (const key of ["add_item", "drop_item", "insert_item", "item_index"]) {
      expect(route, `the route stopped parsing ${key}`).toContain(`"${key}"`);
    }
    const start = route.indexOf("function listItemContent");
    const body = route.slice(start, route.indexOf("\n}", start));
    const addAt = body.indexOf("parsed.addItem");
    const dropAt = body.indexOf("parsed.dropItem");
    expect(addAt).toBeGreaterThan(-1);
    expect(dropAt).toBeGreaterThan(addAt);
  });

  it("delist: the executed body's walk, and the port's named skip with its mechanism", () => {
    const oracle = capture("delist");
    const declared = registration(cardModList, "delist");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-mod-list-0.20.0/set/abstract/delist.rb");
    expect(oracle.pinned_declaration).toBe(
      "event :delist, :prepare_to_store, on: :delete do",
    );
    expect(oracle.pinned_declaration_line).toBe(2);
    expect(oracle.executed).toBe(true);

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
    // on: :delete) with the mod files' no-op. THE ROW CLOSES on the
    // measured skip, and the mechanism is named: the event is UNREACHABLE
    // in the pinned gemset, and the port's walk mirrors that deadness
    // exactly. The set file (set/abstract/delist.rb) becomes the set module
    // Card::Set::Abstract::Delist, and the only reference to that module
    // name in the pinned gemset is the gem's own RSpec file
    // (card-mod-list-0.20.0/spec/set/abstract/delist_spec.rb:1): no
    // runtime file includes it. The gem's set entry point
    // (card-mod-list-0.20.0/set/abstract/01_list.rb:1-2) includes only
    // Abstract::Paging and Abstract::Items, and a set module reaches a
    // card's singleton class only through include_set
    // (card-1.110.0 lib/card/set/inheritance.rb:32-41). The set registrar
    // (card-1.110.0 lib/card/set/registrar.rb:24-32) registers the
    // module, and set_condition_applies? (card-1.110.0
    // lib/card/set/event/all.rb:26-29) fires the event only when the
    // declaring set module is in the card's set-module chain. Declared,
    // never fires, for any card.
    expect(declared.at).toBe("prepare_to_store");
    expect(declared.on).toEqual(["delete"]);
    expect(carriesStubBody(declared)).toBe(true);

    // the port's own place for the work: the serving runtime's setMember
    // resolver, which answers for self/*, abstract/attachment*, right/*,
    // right/enabled_roles, type_plus_right/* and type/* only. The
    // registration's set path is "abstract/delist", so the dispatcher
    // answers set-not-applicable for every save, the same observable
    // behavior as Ruby's dead event. An arm that answers for that path
    // would fail this pin.
    const route = portSource("src/server/write-routes.ts");
    const memberAt = route.indexOf("setMember: (setPath, card) => {");
    expect(memberAt).toBeGreaterThan(-1);
    const memberBody = route.slice(memberAt, route.indexOf("...(ctx.onModEventReport", memberAt));
    expect(memberBody).toContain('setPath.startsWith("abstract/attachment")');
    expect(memberBody).not.toContain("abstract/delist");

    // THE BODY IS ALSO NOT PORTABLE WITHOUT DIVERGENCE: `subcard referer`
    // folds the referer's content rewrite into the ACT as its own save
    // (validations, reference janitors, act rows), the port's event seam is
    // single-card (the context carries the staged subcard collection for
    // READ only, mod-event-dispatch.ts:313-315, and no way to save a card
    // as a subcard), and a substitute direct content UPDATE would bypass
    // exactly the machinery Ruby's subcard save runs. The unblock
    // condition is: the port's event seam can save another card as a
    // subcard within the same act.
  });

  it("insert_item_event: the executed body's insert at the requested index, and the port's write route carrying the body", () => {
    const oracle = capture("insert-item-event");
    const declared = registration(cardModList, "insert_item_event");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-mod-list-0.20.0/set/abstract/01_list/events.rb");
    expect(oracle.pinned_declaration).toBe(
      "event :insert_item_event, :prepare_to_validate, on: :save, when: :item_to_insert do",
    );
    expect(oracle.pinned_declaration_line).toBe(8);
    expect(oracle.executed).toBe(true);

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
    // on: :save, when: :item_to_insert) with the mod files' no-op. THE ROW
    // CLOSES on the port's own place for the work: the body runs inline in
    // the write route's listItemContent, which removes the name wherever it
    // sits and then inserts it at the requested index, which is what Ruby's
    // insert_item does (card-mod-collection set/all/item_assignment.rb:47-51:
    // new_names = item_names; new_names.delete name; new_names.insert index,
    // name). The registration stays the honest stub because moving it into
    // the dispatch would run it after the content it acts on is fixed.
    expect(declared.at).toBe("prepare_to_validate");
    expect(declared.on).toEqual(["save"]);
    expect(declared.when).toBe("item_to_insert");
    expect(carriesStubBody(declared)).toBe(true);

    // the port's own place for the work: the route's insert arm, which
    // removes the name by identity and then splices it in at the index.
    const route = portSource("src/server/write-routes.ts");
    const start = route.indexOf("function listItemContent");
    expect(start).toBeGreaterThan(-1);
    const body = route.slice(start, route.indexOf("\n}", start));
    const removeAt = body.indexOf("items = items.filter((item) => itemIdentity(item) !== identity);");
    const insertAt = body.indexOf("items.splice(");
    expect(removeAt).toBeGreaterThan(-1);
    expect(insertAt).toBeGreaterThan(removeAt);
    expect(body).toContain('parsed.itemIndex ?? "0"');

    // THE DIVERGENCE, NAMED: Ruby's Array#insert counts a NEGATIVE index
    // from the end of the list, so item_index=-1 inserts the name BEFORE
    // the last item, while the port clamps a negative index to 0 and
    // inserts at the front. A request that carried no index agrees on both
    // sides (Ruby's `Env.params["item_index"] || 0`, the port's
    // `parsed.itemIndex ?? "0"`), and an index at or past the end agrees
    // too (Ruby's Array#insert appends, the port's splice clamps).
  });

  it("cascade_read_rule: the executed body's guard and its cascade, and the port's own place for the work", () => {
    const oracle = capture("cascade-read-rule");
    const declared = registration(cardModPermissions, "cascade_read_rule");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-mod-permissions-0.20.0/set/right/read.rb");
    expect(oracle.pinned_declaration).toBe(
      "event :cascade_read_rule, :finalize, after: :update_rule_cache, when: :rule? do",
    );
    expect(oracle.pinned_declaration_line).toBe(9);
    expect(oracle.executed).toBe(true);

    // what Ruby did: with a changing name or a changing trash, the body
    // updates the cards the rule already governs; with neither, it returns
    // before it touches anything.
    const changing = oracle.scenarios?.[0];
    const quiet = oracle.scenarios?.[1];
    expect(callsOf(changing)).toEqual(["name_is_changing?", "update_read_ruled_cards"]);
    expect(callsOf(quiet)).toEqual(["name_is_changing?", "trash_is_changing?"]);

    // the port's registration is the pinned declaration (:finalize, after:
    // update_rule_cache, when: :rule?) with the mod files' no-op. THE ROW
    // CLOSES on the port's own place for the work: the body is the engine's
    // cascadeReadRuleAfterRuleSave, wired into the save path.
    expect(declared.at).toBe("finalize");
    expect(declared.after).toBe("update_rule_cache");
    expect(declared.when).toBe("rule?");
    expect(carriesStubBody(declared)).toBe(true);

    // the port's own place for the work, and Ruby's GUARD ORDER: the
    // name/trash return (read.rb:11) comes BEFORE the rule? gate, and the
    // cascade walks the rule set's members and then the cards whose stored
    // read_rule_id names this rule (read.rb:39-47 and :56-63).
    const rules = portSource("src/card/permissions/set-read-rule.ts");
    expect(rules).toContain("export async function cascadeReadRuleAfterRuleSave(");
    const fnAt = rules.indexOf("export async function cascadeReadRuleAfterRuleSave(");
    const fnBody = rules.slice(fnAt, rules.indexOf("\n}", fnAt));
    const guardAt = fnBody.indexOf("if (!nameOrTrashChanging) return;");
    const ruleGateAt = fnBody.indexOf("isStandardRuleCardRow(deps, ruleCardRow)");
    expect(guardAt).toBeGreaterThan(-1);
    expect(ruleGateAt).toBeGreaterThan(guardAt);
    expect(fnBody).toContain("setMemberIds(deps, setRow)");
    expect(fnBody).toContain("read_rule_id = ? AND trash = 0");

    // and the engine calls it at its save-path call sites: the import plus
    // five calls, so a call site that goes away fails this pin.
    const engine = portSource("src/card/actions/card-action-engine.ts");
    const calls = engine.split("await cascadeReadRuleAfterRuleSave(").length - 1;
    expect(calls).toBe(5);
  });

  it("check_permissions: the executed body's action check, and the port's own place for the work", () => {
    const oracle = capture("check-permissions");
    const declared = registration(cardModPermissions, "check_permissions");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-mod-permissions-0.20.0/set/all/permissions.rb");
    expect(oracle.pinned_declaration).toBe("event :check_permissions, :validate do");
    expect(oracle.pinned_declaration_line).toBe(22);
    expect(oracle.executed).toBe(true);

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
    expect((checked?.calls ?? []).find((c: any) => c.call === "ok?")?.arguments).toEqual([
      "update",
    ]);

    // the port's registration is the pinned declaration (:validate, with no
    // on/when/changed clause) with the mod files' no-op. THE ROW CLOSES on
    // the port's own place for the work: the body is the engine's write
    // permission gate (assertCanWrite, and the saveTaskVerdictForCard
    // walk behind it), which runs the same algebra and refuses with the
    // permission-denied error instead of a silent no-op.
    expect(declared.at).toBe("validate");
    expect(declared.on).toBeUndefined();
    expect(declared.when).toBeUndefined();
    expect(declared.changed).toBeUndefined();
    expect(carriesStubBody(declared)).toBe(true);

    // the port's own place for the work: the engine's gate. The update
    // path checks "update", the create path checks "create", and a denial
    // throws the permission-denied error.
    const engine = portSource("src/card/actions/card-action-engine.ts");
    expect(engine).toContain("async assertMayUpdate(cardId: number)");
    expect(engine).toContain('assertCanWrite(await composeCardRecord(row, this.fetch.lexicon), "update")');
    expect(engine).toContain('await this.assertCanWrite(placeholder, "create")');
    expect(engine).toContain("await saveTaskVerdictForCard(");
    expect(engine).toContain("throw new CardActionError(");
    expect(engine).toContain('"permission-denied"');

    // THE DIVERGENCE, NAMED: Ruby's action_for_permission_check returns
    // :update for a commenting save (commenting? is `comment && action !=
    // :delete`, card-mod-comment set/all/comment.rb:1-3), so a CREATE that
    // carries a comment is checked against the UPDATE rule in Ruby, while
    // the port's create path checks the CREATE rule. The update path
    // agrees on both sides: a comment is an update of the card's content,
    // and the port checks "update" there. The unblock condition is: the
    // port's create path checks the update rule when the request carries a
    // comment.
  });

  it("expire_related: the executed body's structuree expiry, and the port's own place for the work", () => {
    const oracle = capture("expire-related");
    const declared = registration(cardModPermissions, "expire_related");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-mod-permissions-0.20.0/set/all/update_read_rules.rb");
    expect(oracle.pinned_declaration).toBe("event :expire_related, :finalize do");
    expect(oracle.pinned_declaration_line).toBe(8);
    expect(oracle.executed).toBe(true);

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

    // the port's registration is the pinned declaration (:finalize, with no
    // on/when clause) with the mod files' no-op. THE ROW CLOSES on the
    // port's own place for the work: the body is the engine's
    // expireRelatedStructurees, run from the engine's expireAfterWrite on
    // every committed save.
    expect(declared.at).toBe("finalize");
    expect(declared.on).toBeUndefined();
    expect(declared.when).toBeUndefined();
    expect(carriesStubBody(declared)).toBe(true);

    // the port's own place for the work: the is_structure? gate (the tag
    // card's codename is :structure), the structuree_names walk (the set's
    // members, as bot), and the expiry of each member, plus the expiry
    // names the host render maps drop.
    const engine = portSource("src/card/actions/card-action-engine.ts");
    expect(engine).toContain("private async expireRelatedStructurees(");
    expect(engine).toContain("await this.expireRelatedStructurees(nameAfter);");
    const fnAt = engine.indexOf("private async expireRelatedStructurees(");
    const fnBody = engine.slice(fnAt, engine.indexOf("\n  }", fnAt));
    expect(fnBody).toContain('this.fetch.codenames.id("structure")');
    expect(fnBody).toContain("readRuleSetMemberIds(deps, trunkRow)");
    expect(fnBody).toContain("this.fetch.expireCard(record); // Director.expirees -> Card#expire");
    expect(fnBody).toContain("this.relatedExpiryNames.push(memberName);");

    // reset_patterns is ARCHITECTURALLY ABSORBED: the port keeps no
    // cross-act pattern memo (every save resolves its set modules fresh),
    // so the reset has no site to call and nothing to reset.
  });

  it("set_field_read_rules: the executed body's field walk as the bot, and the port's own place for the work", () => {
    const oracle = capture("set-field-read-rules");
    const declared = registration(cardModPermissions, "set_field_read_rules");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-mod-permissions-0.20.0/set/all/permissions.rb");
    expect(oracle.pinned_declaration).toBe(
      "event :set_field_read_rules, after: :set_read_rule, on: :update, changed: :type_id do",
    );
    expect(oracle.pinned_declaration_line).toBe(7);
    expect(oracle.executed).toBe(true);

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
    // no-op. THE ROW CLOSES on the port's own place for the work: the body
    // is the engine's cascadeAllFieldReadRules, run from the update path's
    // STORE tail exactly when the save changed the card's type, which is
    // the changed: :type_id gate.
    expect(declared.after).toBe("set_read_rule");
    expect(declared.on).toEqual(["update"]);
    expect(declared.changed).toEqual(["type_id"]);
    expect(carriesStubBody(declared)).toBe(true);

    // the port's own place for the work: the field walk with NO "_left"
    // filter (that filter is update_read_rule's own tail only), and the
    // type-change gate that runs it.
    const rules = portSource("src/card/permissions/set-read-rule.ts");
    expect(rules).toContain("export async function cascadeAllFieldReadRules(");
    const fnAt = rules.indexOf("export async function cascadeAllFieldReadRules(");
    const fnBody = rules.slice(fnAt, rules.indexOf("\n}", fnAt));
    expect(fnBody).toContain("fieldCardIds(deps, cardId)");
    expect(fnBody).toContain("await updateReadRule(deps, fieldId);");
    expect(fnBody).not.toContain("LEFT_RULE_CONTENT");

    const engine = portSource("src/card/actions/card-action-engine.ts");
    expect(engine).toContain("await cascadeAllFieldReadRules(this.readRuleDeps(), row.id);");
    const gateAt = engine.indexOf("await cascadeAllFieldReadRules(this.readRuleDeps(), row.id);");
    const gateBody = engine.slice(engine.lastIndexOf("if (", gateAt), gateAt);
    expect(gateBody).toContain("typeChanged");
  });
});
