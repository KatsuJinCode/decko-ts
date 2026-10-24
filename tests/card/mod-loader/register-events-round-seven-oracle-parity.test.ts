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
import cardModRecaptcha from "../../../src/card/mod-loader/mods/card-mod-recaptcha.js";
import cardModScript from "../../../src/card/mod-loader/mods/card-mod-script.js";
import cardModSession from "../../../src/card/mod-loader/mods/card-mod-session.js";
import cardModStyle from "../../../src/card/mod-loader/mods/card-mod-style.js";
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

  it("set_read_rule: the executed body's two writes, and the port's own place for the work", () => {
    const oracle = capture("set-read-rule");
    const declared = registration(cardModPermissions, "set_read_rule");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-mod-permissions-0.20.0/set/all/permissions.rb");
    expect(oracle.pinned_declaration).toBe(
      "event :set_read_rule, :store, on: :save, changed: %i[type_id name] do",
    );
    expect(oracle.pinned_declaration_line).toBe(1);
    expect(oracle.executed).toBe(true);

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
    // changed: type_id and name) with the mod files' no-op. THE ROW CLOSES
    // on the port's own place for the work: the body is the engine's
    // deriveReadRuleRecord, run at the row-write sites.
    expect(declared.at).toBe("store");
    expect(declared.on).toEqual(["save"]);
    expect(declared.changed).toEqual(["type_id", "name"]);
    expect(carriesStubBody(declared)).toBe(true);

    // the port's own place for the work: the derivation of the read rule's
    // id AND its class (the two columns Ruby's body writes), and the
    // changed: type_id and name GATE, which the update path keeps: a
    // content-only save keeps its stored read-rule columns, exactly as in
    // Ruby.
    const rules = portSource("src/card/permissions/set-read-rule.ts");
    expect(rules).toContain("export async function deriveReadRuleRecord(");
    const fnAt = rules.indexOf("export async function deriveReadRuleRecord(");
    const fnBody = rules.slice(fnAt, rules.indexOf("\n}", fnAt));
    expect(fnBody).toContain("const readRuleId = await permissionRuleId(");
    expect(fnBody).toContain("const readRuleClass = await directRuleClassName(");
    expect(fnBody).toContain("return { readRuleId, readRuleClass };");

    const engine = portSource("src/card/actions/card-action-engine.ts");
    expect(engine).toContain("nameChanged || typeChanged");
    expect(engine).toContain("? await deriveReadRuleRecord(this.readRuleDeps(), {");
    const sites = engine.split("await deriveReadRuleRecord(").length - 1;
    expect(sites).toBe(3); // the revival, the create and the update path
  });

  it("update_read_rule: the executed body's rewrite without timestamps, and the port's own place for the work", () => {
    const oracle = capture("update-read-rule");
    const declared = registration(cardModPermissions, "update_read_rule");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-mod-permissions-0.20.0/set/all/permissions.rb");
    expect(oracle.pinned_declaration).toBe("event :update_read_rule do");
    expect(oracle.pinned_declaration_line).toBe(11);
    expect(oracle.executed).toBe(true);

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
    // declaration names no stage of its own. THE ROW CLOSES on the port's
    // own place for the work: the body is the engine's updateReadRule,
    // driven per member by the cascade the rule-save seam runs.
    expect(declared.at).toBeUndefined();
    expect(declared.on).toBeUndefined();
    expect(declared.when).toBeUndefined();
    expect(declared.changed).toBeUndefined();
    expect(carriesStubBody(declared)).toBe(true);

    // the port's own place for the work: the re-derivation and the BARE
    // column UPDATE (no history rows, no timestamps), plus the field read
    // rules tail.
    const rules = portSource("src/card/permissions/set-read-rule.ts");
    expect(rules).toContain("export async function updateReadRule(");
    const fnAt = rules.indexOf("export async function updateReadRule(");
    const fnBody = rules.slice(fnAt, rules.indexOf("\n}", fnAt));
    expect(fnBody).toContain("const derived = await deriveReadRuleRecord(");
    expect(fnBody).toContain(
      '"UPDATE cards SET read_rule_id = ?, read_rule_class = ? WHERE id = ?"',
    );
    // the BARE column update: the statement itself touches no timestamp
    // column, which is what Ruby's without_timestamps does.
    const updateAt = fnBody.indexOf(
      '"UPDATE cards SET read_rule_id = ?, read_rule_class = ? WHERE id = ?"',
    );
    const statement = fnBody.slice(updateAt, fnBody.indexOf(");", updateAt));
    expect(statement).not.toContain("updated_at");
    expect(statement).not.toContain("updater_id");
    expect(fnBody).toContain("await cascadeLeftRuleFieldReadRules(deps, cardId, changed, overlay);");

    // reset_patterns is ARCHITECTURALLY ABSORBED: the port keeps no
    // cross-act pattern memo, so there is nothing to reset.
  });

  it("update_rule_cache: the executed body's cache clear, and the port's own place for the work", () => {
    const oracle = capture("update-rule-cache");
    const declared = registration(cardModPermissions, "update_rule_cache");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-mod-permissions-0.20.0/set/all/update_read_rules.rb");
    expect(oracle.pinned_declaration).toBe(
      "event :update_rule_cache, :finalize, when: :rule? do",
    );
    expect(oracle.pinned_declaration_line).toBe(4);
    expect(oracle.executed).toBe(true);

    // what Ruby did: the body clears the rule cache
    const cleared = oracle.scenarios?.[0];
    expect(callsOf(cleared)).toEqual(["Card::Rule.clear_rule_cache"]);

    // the port's registration is the pinned declaration (:finalize, when:
    // :rule?) with the mod files' no-op. THE ROW CLOSES on the port's own
    // place for the work: the body is the engine's rule-cache drop, and it
    // reaches BOTH memos the port keeps: the per-driver rule-resolution
    // memo (expireRuleResolutionCache, src/card/permissions/read-rules.ts)
    // and the render engines' deck-wide rule lookup hash
    // (RenderEngine#expireRuleCache, src/card/render.ts, reached through
    // the host's post-save gate).
    expect(declared.at).toBe("finalize");
    expect(declared.when).toBe("rule?");
    expect(carriesStubBody(declared)).toBe(true);

    // the port's own place for the work: the per-driver memo drop, the
    // engine's invalidation path, and the render engines' drop.
    const rules = portSource("src/card/permissions/read-rules.ts");
    expect(rules).toContain(
      "export function expireRuleResolutionCache(driver: SQLDatabaseDriver): void {",
    );
    const engine = portSource("src/card/actions/card-action-engine.ts");
    expect(engine).toContain("expireRuleResolutionCache(this.fetch.driver);");
    const render = portSource("src/card/render.ts");
    expect(render).toContain("expireRuleCache(): void {");
    const gate = portSource("src/server/post-save-cache-expiry.ts");
    expect(gate).toContain("engines.renderEngine.expireRuleCache?.();");
    expect(gate).toContain("engine.expireRuleCache?.();");

    // THE DIVERGENCE, NAMED: Ruby clears the rule cache on a RULE card's
    // save only, because the event's gate is when: :rule? (rule? is
    // standard_rule? || preference?, card/lib/card/rule/all.rb:33-35), and
    // the event body is the ONLY caller of Card::Rule.clear_rule_cache in
    // the pinned gemset. The port drops the memos on EVERY committed save.
    // The observable behaviour is the same, because the dropped state is a
    // pure memo of rule resolution: the port is strictly fresher, and pays
    // a rebuild it does not have to.
  });

  it("set_recaptcha_site_key: the executed body's config write, and the port's named skip with its mechanism", () => {
    const oracle = capture("set-recaptcha-site-key");
    const declared = registration(cardModRecaptcha, "set_recaptcha_site_key");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe(
      "card-mod-recaptcha-0.20.0/set/abstract/recaptcha_setting.rb",
    );
    expect(oracle.pinned_declaration).toBe(
      "event :set_recaptcha_site_key, :finalize, when: :recaptcha_setting? do",
    );
    expect(oracle.pinned_declaration_line).toBe(7);
    expect(oracle.executed).toBe(true);

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
      (written?.calls ?? []).find((c: any) => c.call === "recaptcha_recaptcha_site_key=")
        ?.arguments,
    ).toEqual(["the-site-key"]);

    // the port's registration is the pinned declaration (:finalize, when:
    // :recaptcha_setting?) with the mod files' no-op. THE ROW CLOSES on
    // the measured skip, and the mechanism is named: the body writes into
    // process-global mutable state, and the port has none. Ruby's
    // Card.config is a process-global store, and writing the setting
    // card's content under the key its codename names is load-bearing
    // there: the :recaptcha event's own guard reads recaptcha_keys? off
    // the same config on the next anonymous save (set/all/recaptcha.rb:
    // 46-48), so saving the setting card arms or disarms the guard with no
    // restart. The port's recaptcha config is COMPOSITION INPUT
    // (ModEventRecaptchaGuard), built per save and passed unchanged into
    // every write engine the host builds, sourced at BOOT from the host
    // environment; the engine's recaptcha_* sites are all reads and there
    // is no config-write seam an event body could drive.
    expect(declared.at).toBe("finalize");
    expect(declared.when).toBe("recaptcha_setting?");
    expect(carriesStubBody(declared)).toBe(true);

    // THE DIVERGENCE'S OWN FALSIFICATION CONDITION, PINNED HERE: a
    // card-driven assignment of a recaptcha config key in the engine would
    // make this skip stale, so this row fails if one ever appears.
    const engine = portSource("src/card/actions/card-action-engine.ts");
    const assignments = engine.match(
      /\.(?:recaptcha_site_key|recaptcha_secret_key)\s*=\s*(?!=)/g,
    );
    expect(
      assignments,
      "a card-driven recaptcha config write appeared: re-examine the skip",
    ).toBeNull();

    // and the port's stated substitute holds: the guard reads the port's
    // own config surface, and with no configured keys the guard is
    // disarmed, which is the port's equivalent of Ruby's config simply not
    // holding a key yet.
    const mod = portSource("src/card/mod-loader/mods/card-mod-recaptcha.ts");
    expect(mod).toContain("recaptcha_keys?");
    expect(engine).toContain("siteKey");
    expect(engine).toContain("secretKey");

    // The unblock condition is: the port's recaptcha config is live mutable
    // state that a card save can write, and the guard reads it.
  });

  it("validate_coffeescript_syntax: the executed body's refusal, and the port's own place for the work", () => {
    const oracle = capture("validate-coffeescript-syntax");
    const declared = registration(cardModScript, "validate_coffeescript_syntax");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-mod-script-0.20.0/set/type/coffee_script.rb");
    expect(oracle.pinned_declaration).toBe(
      "event :validate_coffeescript_syntax, :validate, on: :save, changed: %i[type_id content] do",
    );
    expect(oracle.pinned_declaration_line).toBe(5);
    expect(oracle.executed).toBe(true);

    // what Ruby did: the body asks the compiler to compile the content
    // and, when the compiler refuses, adds the compiler's message with the
    // stdin marker removed. The COMPILER is a stand-in in this capture (the
    // pinned gemset carries no coffee-script and no execjs, so the stand-in
    // raises the error class the body's own rescue names); the BODY is the
    // gem's own bytes.
    const refused = oracle.scenarios?.[0];
    expect(callsOf(refused)).toEqual(["content"]);
    expect(errorsOf(refused)).toEqual(["3:5 syntax error"]);

    // the port's registration carries the pinned declaration (:validate, on:
    // :save, changed: type_id and content). THE ROW CLOSES on the port's
    // own place for the work: the body is the engine's validate walk, and
    // the registered fn stays the honest stub because the walk is the
    // body's owner and a mod-side compile would double-run it.
    expect(declared.at).toBe("validate");
    expect(declared.on).toEqual(["save"]);
    expect(declared.changed).toEqual(["type_id", "content"]);
    expect(String(declared.fn)).not.toMatch(/validateSyntaxField\(/);

    // the port's own place for the work: the coffee_script arm of the
    // engine's validate walk, with the type gate, the skip-list gate
    // honouring this event's name, the compile itself, and the [stdin]:
    // strip (Ruby's e.message.remove("[stdin]:")) on the diagnostic.
    const engine = portSource("src/card/actions/card-action-engine.ts");
    expect(engine).toContain('typeCode === "coffee_script" &&');
    expect(engine).toContain('this.skipsEvent("validate_coffeescript_syntax")');
    expect(engine).toContain("this.coffeeCompiler(content, false);");
    expect(engine).toContain('message = message.replace("[stdin]:", "");');

    // and the refusal is the :content CardActionError, which is the
    // errors.add :content seam.
    expect(engine).toContain('"validation-failed"');
    expect(engine).toContain("{ content: message },");
  });

  it("validate_javascript_syntax: the executed body's refusal in a pre block, and the port's own place for the work", () => {
    const oracle = capture("validate-javascript-syntax");
    const declared = registration(cardModScript, "validate_javascript_syntax");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-mod-script-0.20.0/set/type/java_script.rb");
    expect(oracle.pinned_declaration).toBe(
      "event :validate_javascript_syntax, :validate, on: :save, changed: %i[type_id content] do",
    );
    expect(oracle.pinned_declaration_line).toBe(5);
    expect(oracle.executed).toBe(true);

    // what Ruby did: the body asks the compiler to compile the content
    // and, when the compiler refuses, adds the compiler's message inside a
    // pre block. The COMPILER is a stand-in in this capture (the pinned
    // gemset carries no uglifier, so the stand-in raises the error class
    // the body's own rescue names); the BODY is the gem's own bytes.
    const refused = oracle.scenarios?.[0];
    expect(callsOf(refused)).toEqual(["content", "Utils.ansi2html"]);
    expect(errorsOf(refused)).toEqual(["<pre>the answer</pre>"]);

    // the port's registration carries the pinned declaration (:validate, on:
    // :save, changed: type_id and content) with the empty body. THE ROW
    // CLOSES on the port's own place for the work: the body is the
    // engine's validate walk (the java_script arm of the action engine's
    // validate tree, src/card/actions/card-action-engine.ts:4005-4014),
    // which validates the content, honours the act's skip lists under this
    // event's name, wraps the diagnostic in <pre> exactly as the Ruby body
    // wraps ansi2html(e.message), and refuses with the :content
    // CardActionError.
    expect(declared.at).toBe("validate");
    expect(declared.on).toEqual(["save"]);
    expect(declared.changed).toEqual(["type_id", "content"]);
    expect(carriesStubBody(declared)).toBe(true);

    // the port's own place for the work: the type gate, the skip-list
    // gate, the validator, and the <pre> wrap.
    const engine = portSource("src/card/actions/card-action-engine.ts");
    expect(engine).toContain('typeCode === "java_script"');
    expect(engine).toContain('this.skipsEvent("validate_javascript_syntax")');
    expect(engine).toContain("const diagnostic = this.javascriptValidator(content);");
    expect(engine).toContain("const message = `<pre>${diagnostic}</pre>`;");

    // THE DIVERGENCE, NAMED: the diagnostic TEXT is the host parser's
    // vocabulary, as Ruby's is its ExecJS runtime's. The port's node
    // production boot and harness use the same real vendored parser
    // provider; the edge hosts pass its static-initialization equivalent.
    // And the engine arm is CONDITIONAL on a host wiring a validator: a
    // host that wires none stands the arm down rather than compiling with
    // a different parser.
  });

  it("discard_deleted_locations: the executed body's discard, and the port's own place for the work", () => {
    const oracle = capture("discard-deleted-locations");
    const declared = registration(cardModSession, "discard_deleted_locations");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-mod-session-0.20.0/set/all/location_history.rb");
    expect(oracle.pinned_declaration).toBe(
      "event :discard_deleted_locations, :finalize, on: :delete do",
    );
    expect(oracle.pinned_declaration_line).toBe(1);
    expect(oracle.executed).toBe(true);

    // what Ruby did: the body asks the request environment to discard the
    // card's locations, and then, only when the success belongs to this
    // card, configures the successful deletion.
    const deleted = oracle.scenarios?.[0];
    expect(callsOf(deleted)).toEqual(["Env.discard_locations_for", "success"]);

    // the port's registration is the pinned declaration (:finalize,
    // on: :delete) with the mod files' no-op. THE ROW CLOSES on the port's
    // own place for the work: the body is the request layer's, where Ruby
    // runs it too (Env is request state), and the write route's delete path
    // runs it BEFORE resolving the deletion success target.
    expect(declared.at).toBe("finalize");
    expect(declared.on).toEqual(["delete"]);
    expect(carriesStubBody(declared)).toBe(true);

    // the port's own place for the work: the discard itself (every history
    // entry that names the card goes), and Ruby's ORDER, which the route
    // follows on both of its delete arms.
    const session = portSource("src/card/session/visitor-session.ts");
    expect(session).toContain(
      "export function discardLocationsFor(state: VisitorSession, cardName: string): void {",
    );
    expect(session).toContain("state.history = locationHistory(state).filter(");

    const route = portSource("src/server/write-routes.ts");
    const discards = route.split("discardLocationsFor(visit, name);").length - 1;
    expect(discards).toBe(2);
    // the no-mark delete resolves :previous AFTER the discard, so the
    // target is read post-discard, exactly as Ruby's own read is.
    const discardAt = route.indexOf('if (saved.verb === "delete") discardLocationsFor(visit, name);');
    const previousAt = route.indexOf("previousLocation(visit)", discardAt);
    expect(discardAt).toBeGreaterThan(-1);
    expect(previousAt).toBeGreaterThan(discardAt);
  });

  it("save_current_location: the executed body's save, and the port's own place for the work", () => {
    const oracle = capture("save-current-location");
    const declared = registration(cardModSession, "save_current_location");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-mod-session-0.20.0/set/all/location_history.rb");
    expect(oracle.pinned_declaration).toBe(
      "event :save_current_location, before: :show_page, on: :read do",
    );
    expect(oracle.pinned_declaration_line).toBe(6);
    expect(oracle.executed).toBe(true);

    // what Ruby did: the body asks the request environment to save the
    // card as the request's current location.
    const read = oracle.scenarios?.[0];
    expect(callsOf(read)).toEqual(["Env.save_location"]);

    // the port's registration carries the neighbour Ruby names
    // (before: :show_page) and the mod files' no-op. THE ROW CLOSES on the
    // port's own place for the work: the mechanism is the visitor
    // session's saveLocation plus its guard, and the READ PATH IS WIRED
    // SERVER-SIDE, so a plain GET of a card page DOES grow the history,
    // where Ruby's before: :show_page hook would. The declaration records
    // Ruby's shape only: the mod-event dispatch has no read arm, so the
    // entry resolves to no save stage.
    expect(declared.before).toBe("show_page");
    expect(declared.on).toBeUndefined();
    expect(declared.at).toBeUndefined();
    expect(carriesStubBody(declared)).toBe(true);

    // the port's own place for the work: the guard (a page view of a known
    // card, as HTML and not by ajax, other than the sign-in card) and the
    // save itself (the URL is pushed, then duplicates are dropped keeping
    // the FIRST occurrence).
    const session = portSource("src/card/session/visitor-session.ts");
    expect(session).toContain("export function shouldSaveLocation(view: {");
    expect(session).toContain(
      "return !view.ajax && view.html && view.known && view.codename !== \"signin\";",
    );
    expect(session).toContain("export function saveLocation(state: VisitorSession, url: string): void {");
    expect(session).toContain("state.history = [...new Set(history)];");

    // and the three live callers, each under the same guard: the
    // CF/worker page GET arm, the Bunny edge page dispatch and the write
    // route's error-page arm.
    const worker = portSource("worker.ts");
    expect(worker).toContain("shouldSaveLocation({");
    expect(worker).toContain("saveLocation(visit, `${proto}://${host}${url.pathname}${url.search}`);");
    const bunny = portSource("deploy/bunny-worker-src/bunny-edge-engine-request.ts");
    expect(bunny).toContain("saveLocation(visit, `${proto}://${host}${url.pathname}${url.search}`);");
    const route = portSource("src/server/write-routes.ts");
    expect(route).toContain("saveLocation(visit, requestUrl(req));");
  });

  it("no_deletion_if_used: the executed body's refusal, and the port's own place for the work", () => {
    const oracle = capture("no-deletion-if-used");
    const declared = registration(cardModStyle, "no_deletion_if_used");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-mod-style-0.20.0/set/type/skin.rb");
    expect(oracle.pinned_declaration).toBe(
      "event :no_deletion_if_used, :validate, on: :delete do",
    );
    expect(oracle.pinned_declaration_line).toBe(13);
    expect(oracle.executed).toBe(true);

    // what Ruby did: if the deck's *all+*style pointer lists the card's key
    // among its item keys, the body refuses the delete; a card the style
    // rule does not use is left alone.
    const used = oracle.scenarios?.[0];
    const unused = oracle.scenarios?.[1];
    expect(callsOf(used)).toEqual(["Card.[]", "key", "t"]);
    expect(callsOf(unused)).toEqual(["Card.[]", "key"]);
    expect(used?.errors_added).toEqual([
      { attribute: "delete", message: "MISSING-LOCALE-TOKEN:style_delete_error_skin_used" },
    ]);
    expect(unused?.errors_added).toEqual([]);

    // the port's registration is the pinned declaration (:validate,
    // on: :delete) with the mod files' no-op. THE ROW CLOSES on the port's
    // own place for the work: the body is the engine's delete validate
    // guard, which runs the item-keys check for every Skin-typed delete
    // and refuses with the :delete CardActionError.
    expect(declared.at).toBe("validate");
    expect(declared.on).toEqual(["delete"]);
    expect(carriesStubBody(declared)).toBe(true);

    // the port's own place for the work: the same check (the item keys of
    // the *all+*style pointer) and the same refusal.
    const engine = portSource("src/card/actions/card-action-engine.ts");
    expect(engine).toContain('this.fetch.fetchByName("*all+*style")');
    expect(engine).toContain("itemKeys.includes(cardKey)");
    expect(engine).toContain('"protected-card"');
    expect(engine).toContain("{ delete: message },");

    // THE DIVERGENCE, NAMED, WITH ITS CAUSE: the check agrees on both
    // sides, the MESSAGE does not. Ruby's body asks the locale for
    // style_delete_error_skin_used (card-mod-style set/type/skin.rb:15),
    // and the pinned gem's own locale file carries
    // style_delete_error_skin_in_use (config/locales/en.yml:2) - the key
    // the body asks for appears nowhere else in the pinned gemset, so in
    // Ruby this refusal's message is a translation-missing string. The
    // port refuses with the locale's own English text, "Can't delete skin
    // because it's used.", which is what the gem intended.
    const mod = portSource("src/card/mod-loader/mods/card-mod-style.ts");
    expect(mod).toContain("Can't delete skin because it's used.");
  });

  it("validate_css: the executed body's refusal, and the port's own place for the work", () => {
    const oracle = capture("validate-css");
    const declared = registration(cardModStyle, "validate_css");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-mod-style-0.20.0/set/type/css.rb");
    expect(oracle.pinned_declaration).toBe(
      "event :validate_css, :validate, on: :save, changed: %i[type_id content] do",
    );
    expect(oracle.pinned_declaration_line).toBe(7);
    expect(oracle.executed).toBe(true);

    // what Ruby did: the body parses the content and, when the parser
    // refuses, adds the parser's message.
    const refused = oracle.scenarios?.[0];
    expect(callsOf(refused)).toEqual(["content"]);
    expect(errorsOf(refused)).toEqual(["Invalid CSS: expected selector, was '}'"]);

    // the port's registration is the pinned declaration (:validate, on:
    // :save, changed: type_id and content) with the mod files' no-op. THE
    // ROW CLOSES on the port's own place for the work: the body is the
    // engine's validate walk, the css arm of the action engine's validate
    // tree.
    expect(declared.at).toBe("validate");
    expect(declared.on).toEqual(["save"]);
    expect(declared.changed).toEqual(["type_id", "content"]);
    expect(carriesStubBody(declared)).toBe(true);

    // the port's own place for the work: the type gate, the skip-list
    // gate, the changed gate (a create, a type change or a content
    // change), the source (the content's own chunk links expanded), the
    // compile, and the :content refusal.
    const engine = portSource("src/card/actions/card-action-engine.ts");
    expect(engine).toContain('typeCode === "css" && !this.skipsEvent("validate_css")');
    expect(engine).toContain('renderStyleChunks(content)');
    expect(engine).toContain('await this.scssCompiler!(source, typeCode === "scss" ? "nested" : "compressed");');
    expect(engine).toContain("{ content: message },");

    // THE DIVERGENCE, NAMED: the PARSER is not the same one. Ruby's css
    // body parses the raw content with the deprecated Sass 3.x SCSS
    // parser (::Sass::SCSS::Parser.new(content, nil, nil).parse, the sass
    // gem the file's own require "sass" declares), while the port compiles
    // through the engine's LibSass compiler. The diagnostic TEXT is
    // therefore the LibSass vocabulary, as Ruby's is the Sass 3.x
    // vocabulary. The port's own note already records that this gem is the
    // sassgem and not SassC (the scss row's body is the SassC one).
  });
});
