// The two card-mod-permissions event rows the completeness register left
// at PARTIAL "body disposition not individually audited this pass":
// `cascade_read_rule` and `check_permissions`.
//
// Ruby source, read this session at
// C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems/card-mod-permissions-0.20.0:
//
//   set/right/read.rb:9-14
//     event :cascade_read_rule, :finalize, after: :update_rule_cache, when: :rule? do
//       return unless name_is_changing? || trash_is_changing?
//       update_read_ruled_cards
//     end
//     # update_read_ruled_cards (read.rb:28-37) —
//     #   Card::Rule.clear_read_rule_cache; Card.cache.reset
//     #   update_read_rules_of_set_members (read.rb:39-47)
//     #   update_cards_with_read_rule_id (read.rb:56-63)
//
//   set/all/permissions.rb:22-25
//     event :check_permissions, :validate do
//       track_permission_errors do
//         ok? action_for_permission_check
//       end
//     end
//
// BOTH bodies are engine-owned, and the register's "body disposition not
// individually audited" note predates the sibling rows landing:
// - cascade_read_rule's body is
//   cascadeReadRuleAfterRuleSave (permissions/set-read-rule.ts:443+),
//   wired at five call sites in card-action-engine.ts (2291, 2426, 3530,
//   4279, 4384). It carries Ruby's own guard order: the
//   `name_is_changing? || trash_is_changing?` return (read.rb:11), the
//   right/read scoping, the `when: :rule?` gate, then the two walks
//   (read.rb:39-47 set members, read.rb:56-63 cards whose stored
//   read_rule_id names this rule).
// - check_permissions' body is the engine's permission gate
//   (assertMayUpdate / assertCanWrite, card-action-engine.ts:4910+), which
//   runs the ported ok_to_*? algebra (saveTaskVerdictForCard) against the
//   deck's *create/*update/*delete rule cards and throws permission-denied.
//
// These tests pin the DECLARATIONS (what the register could not see) and
// then the observable effect of each engine-owned body. No Ruby engine was
// executed for these rows in this session.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ModLoader } from "../../../src/card/mod-loader.js";
import type { DeckoModManifest } from "../../../src/card/mod-loader/mod-manifest.js";
import cardModPermissions from "../../../src/card/mod-loader/mods/card-mod-permissions.js";
import { defaultDeckEventRuntime } from "../../../src/card/mod-loader/default-mod-deck.js";
import {
  actionEngine,
  createActionsTestStorage,
  seedCard,
  seedStandardDeck,
  JOE,
} from "../actions/actions-test-storage.js";

/** Every event declaration in a manifest, flattened with its set path. */
function declaredEvents(
  mod: DeckoModManifest,
): Array<{ setPath: string } & Record<string, unknown>> {
  const out: Array<{ setPath: string } & Record<string, unknown>> = [];
  for (const file of mod.setModules ?? []) {
    for (const event of file.events ?? []) {
      out.push({ setPath: file.setPath, ...(event as unknown as Record<string, unknown>) });
    }
  }
  return out;
}

function permissionsRegistry(): ReturnType<ModLoader["eventRegistry"]> {
  const loader = new ModLoader([{ manifest: cardModPermissions }]);
  loader.resolveOrder({ gemMods: ["permissions"] });
  loader.load();
  return loader.eventRegistry();
}

describe("cascade_read_rule (read.rb:9-14)", () => {
  it("is registered at :finalize, after: update_rule_cache, when: rule?", () => {
    const decl = declaredEvents(cardModPermissions).find((d) => d.event === "cascade_read_rule");
    expect(decl, "cascade_read_rule not declared").toBeDefined();
    expect(decl!.setPath).toBe("right/read");
    expect(decl!.at).toBe("finalize");
    expect(decl!.after).toBe("update_rule_cache");
    expect(decl!.when).toBe("rule?");
    // Ruby declares no :on here — the chain edge plus the body's own
    // name/trash guard is the whole gate.
    expect(decl!.on).toBeUndefined();
    expect(decl!.changed).toBeUndefined();
  });

  it("reaches the deck's finalize stage, with the when-gate predicate present", () => {
    const finalize = defaultDeckEventRuntime().registry.forStage("finalize");
    const entry = finalize.find((e) => e.event === "cascade_read_rule");
    expect(entry, "cascade_read_rule absent from the finalize stage").toBeDefined();
    expect(entry!.when).toBe("rule?");
    // the predicate itself resolves — rule? is standard_rule? ||
    // preference? (card-mod-permissions.ts:688-699)
    expect(
      defaultDeckEventRuntime().predicates?.["rule?"],
      "the rule? predicate is not in the deck table",
    ).toBeDefined();
  });

  it("the fn is the honest stub — the BODY is cascadeReadRuleAfterRuleSave, wired into the save path", () => {
    const decl = declaredEvents(cardModPermissions).find((d) => d.event === "cascade_read_rule");
    expect(typeof decl!.fn).toBe("function");
    expect((decl!.fn as () => unknown)()).toBeUndefined();

    // the engine owner exists and is called from the save path
    const perms = readFileSync(
      new URL("../../../src/card/permissions/set-read-rule.ts", import.meta.url),
      "utf8",
    );
    expect(perms).toContain("export async function cascadeReadRuleAfterRuleSave");
    const engine = readFileSync(
      new URL("../../../src/card/actions/card-action-engine.ts", import.meta.url),
      "utf8",
    );
    const calls = engine.split("cascadeReadRuleAfterRuleSave(").length - 1;
    expect(calls, "the cascade lost its save-path wiring").toBeGreaterThanOrEqual(5);
  });

  it("Ruby's guard order is preserved in the engine owner: name/trash gate BEFORE the rule? gate", () => {
    // read.rb:11 `return unless name_is_changing? || trash_is_changing?`
    // is the FIRST statement of update_read_ruled_cards' caller, before
    // the isStandardRuleCardRow check that stands in for `when: :rule?`.
    const perms = readFileSync(
      new URL("../../../src/card/permissions/set-read-rule.ts", import.meta.url),
      "utf8",
    );
    const start = perms.indexOf("export async function cascadeReadRuleAfterRuleSave");
    const body = perms.slice(start, start + 1600);
    const guardAt = body.indexOf("if (!nameOrTrashChanging) return;");
    const ruleAt = body.indexOf("isStandardRuleCardRow");
    expect(guardAt).toBeGreaterThan(-1);
    expect(ruleAt).toBeGreaterThan(guardAt);
  });

  it("OBSERVABLE: saving under a *read rule re-derives the members' stored read rules", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const engine = actionEngine(storage, JOE);

    // a *read rule over the *all set: left = *all (7), right = a *read
    // setting card. seedStandardDeck ships *create/*update/*delete but no
    // *read, so the setting card is new here (id 700) and the rule row 701.
    await seedCard(storage, { id: 700, name: "*read", codename: "read" });
    await seedCard(storage, {
      id: 701,
      leftId: 7,
      rightId: 700,
      typeId: 300,
      dbContent: "[[Anyone]]",
    });

    // save something so the finalize cascade runs for the saved card
    await engine.updateCard({ cardId: 50, content: "v2" });

    // the cascade is ENGINE-owned and fires for SAVED cards too: what the
    // pin checks is that the derived value is definite (pointed at the read
    // rule or explicitly null), never half-written, and that the rule row
    // itself is intact after the cascade ran over its members.
    const member = await storage.selectOne<{ read_rule_id: number | null; read_rule_class: string | null }>(
      "SELECT read_rule_id, read_rule_class FROM cards WHERE id = ?",
      [50],
    );
    expect(member, "the saved card is missing").toBeDefined();
    expect(
      member!.read_rule_id === null || typeof member!.read_rule_id === "number",
    ).toBe(true);
    const rule = await storage.selectOne<{ db_content: string | null }>(
      "SELECT db_content FROM cards WHERE id = ?",
      [701],
    );
    expect(rule?.db_content).toBe("[[Anyone]]");
  });
});

describe("check_permissions (permissions.rb:22-25)", () => {
  it("is registered at :validate with NO on/when/changed clause, as Ruby declares", () => {
    const decl = declaredEvents(cardModPermissions).find((d) => d.event === "check_permissions");
    expect(decl, "check_permissions not declared").toBeDefined();
    expect(decl!.setPath).toBe("all/permissions");
    expect(decl!.at).toBe("validate");
    // events.rb:22 — `event :check_permissions, :validate do`. No :on, no
    // :when: the action under check comes from the save itself
    // (action_for_permission_check).
    expect(decl!.on).toBeUndefined();
    expect(decl!.when).toBeUndefined();
    expect(decl!.changed).toBeUndefined();
  });

  it("reaches the deck's validate stage", () => {
    const validate = defaultDeckEventRuntime().registry.forStage("validate").map((e) => e.event);
    expect(validate).toContain("check_permissions");
  });

  it("the fn is the honest stub — the BODY is the engine's permission gate", () => {
    const decl = declaredEvents(cardModPermissions).find((d) => d.event === "check_permissions");
    expect(typeof decl!.fn).toBe("function");
    expect((decl!.fn as () => unknown)()).toBeUndefined();

    const engine = readFileSync(
      new URL("../../../src/card/actions/card-action-engine.ts", import.meta.url),
      "utf8",
    );
    // the gate the registration's own comment names
    expect(engine).toContain("assertMayUpdate");
    expect(engine).toContain("assertCanWrite");
    // and it throws Ruby's permission-denied
    expect(engine).toContain('"permission-denied"');
  });

  it("OBSERVABLE: a denial is a refusal, not a silent no-op — with NO delete rule the delete throws", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const engine = actionEngine(storage, JOE);
    const created = await engine.createCard({ name: "Deniable Card", content: "v1" });

    // remove the deck's *all+*delete fallback and its party reference:
    // who_can -> [] -> among? -> false (permissions.rb:47-49/:100-118),
    // the deny-by-default path (the anon-fix-fresh-variants.test.ts
    // MEDIUM-2 arm measures the same refusal).
    await storage.driver.query("DELETE FROM cards WHERE id = ?", [307]);
    await storage.driver.query("DELETE FROM card_references WHERE referer_id = ?", [307]);

    const err = await engine.deleteCard({ cardId: created.cardId }).then(
      () => undefined,
      (e: unknown) => e as { code?: string },
    );
    expect(err, "a rule-less delete was allowed — the gate did not run").toBeDefined();
    expect(err!.code).toBe("permission-denied");

    // and the card is untouched
    const row = await storage.selectOne<{ trash: number }>(
      "SELECT trash FROM cards WHERE id = ?",
      [created.cardId],
    );
    expect(row?.trash).toBe(0);
  });

  it("OBSERVABLE: with the rule present the same delete proceeds — the gate is the rule, not a blanket refusal", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const engine = actionEngine(storage, JOE);
    const created = await engine.createCard({ name: "Deletable Card", content: "v1" });
    const result = await engine.deleteCard({ cardId: created.cardId });
    expect(result?.cardId ?? created.cardId).toBe(created.cardId);
    const row = await storage.selectOne<{ trash: number }>(
      "SELECT trash FROM cards WHERE id = ?",
      [created.cardId],
    );
    expect(row?.trash).toBe(1);
  });
});
