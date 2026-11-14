// event :update_structurees_references (card-mod-content-0.20.0
// set/right/structure.rb:25-32, :integrate, when:
// :update_structurees_references? at :34-36) — a *structure rule save whose
// content changed (or the rule's delete) re-runs update_references_out
// (card-1.110.0 lib/card/reference/all.rb:47-50 = delete_references_out +
// create_references_out) on EVERY structuree the set card's query selects,
// under Auth.as_bot.
//
// The port: updateStructureesReferencesEvent walks the trunk set card's CQL
// through executeQuery (structuree_query -> fetch_query, cql_search.rb:58-64)
// and runs refreshReferencesOut (actions/refresh-references-out.ts) per row —
// the same delete+create pair the engine's own refresh_references_out takes.
// Ruby reaches the same walk with the change information RESTORED for the
// integrate stage (director/phases.rb:48 restore_changes_information), which
// the port mirrors by threading updateChangedFields into the update path's
// integrate dispatch (card-action-engine.ts, the changedFieldsSink).
//
// ORACLE (synthetic deck): a referer card whose db_content moved OUT OF BAND
// (direct UPDATE, no engine save — so its reference rows stayed stale) gets
// its card_references rows rebuilt by the CASCADE, not by its own save —
// exactly what each(&:update_references_out) does in Ruby.

import { describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  seedCard,
  seedStandardDeck,
  JOE,
  type ActionsTestStorage,
} from "../actions/actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { ModLoader } from "../../../src/card/mod-loader.js";
import cardModContent, {
  contentModEventPredicates,
  updateStructureesReferencesEvent,
} from "../../../src/card/mod-loader/mods/card-mod-content.js";
import { rightSetMember } from "../../../src/card/mod-loader/mod-event-set-membership.js";
import type { ModEventRuntime, ModEventStageReport } from "../../../src/card/mod-loader/mod-event-dispatch.js";

function contentRuntime(driver: Parameters<typeof rightSetMember>[0]): {
  runtime: ModEventRuntime;
  reports: ModEventStageReport[];
} {
  const loader = new ModLoader([{ manifest: cardModContent }]);
  loader.resolveOrder({ gemMods: ["content"] });
  loader.load();
  const reports: ModEventStageReport[] = [];
  return {
    runtime: {
      registry: loader.eventRegistry(),
      predicates: contentModEventPredicates,
      setMember: rightSetMember(driver),
      onReport: (r) => reports.push(r),
    },
    reports,
  };
}

async function structureDeck(): Promise<{
  storage: ActionsTestStorage;
  ruleId: number;
  refererId: number;
  engine: CardActionEngine;
  reports: ModEventStageReport[];
}> {
  const storage = await createActionsTestStorage();
  await seedStandardDeck(storage);
  // The set card's own content IS the cascade's CQL (cql_content,
  // cql_search.rb:6-11) — the oracle decks' *all carries "{}" (match all).
  // The generic fixture leaves it null; a null content would raise
  // "can't run search with empty content" inside the event (parse_json_cql's
  // empty_query_error!, cql_search.rb:39-45) and land in report.failed —
  // Ruby's rescuing_if_integration shape, not this event's oracle.
  await storage.driver.query("UPDATE cards SET db_content = '{}' WHERE id = 7", []);
  const structure = await seedCard(storage, { name: "*structure", codename: "structure" });
  // *all is the standard fixture's Set-typed card at fixed id 7.
  const rule = await seedCard(storage, {
    name: "*all+*structure",
    leftId: 7,
    rightId: structure.id,
    dbContent: "{}",
  });
  const widget = await seedCard(storage, { name: "Widget", dbContent: "hello" });
  const gadget = await seedCard(storage, { name: "Gadget", dbContent: "part" });
  // The referer's content ALREADY names both links, but its reference rows
  // are STALE: only the widget row exists (the content moved out of band, so
  // no refresh_references_out ever ran for the gadget link).
  const referer = await seedCard(storage, {
    name: "Ref Doc",
    dbContent: "[[Widget]] and [[Gadget]]",
  });
  await storage.driver.query(
    "INSERT INTO card_references (referer_id, referee_key, referee_id, ref_type) VALUES (?, ?, ?, ?)",
    [referer.id, widget.key, widget.id, "L"],
  );
  const { runtime, reports } = contentRuntime(storage.engine.driver);
  const engine = new CardActionEngine(storage.engine, {
    actor: JOE,
    ipAddress: "192.0.2.7",
    modEvents: runtime,
  });
  return {
    storage,
    ruleId: rule.id,
    refererId: referer.id,
    engine,
    reports,
  };
}

async function refererRows(
  storage: ActionsTestStorage,
  refererId: number,
): Promise<Array<{ referee_key: string | null; ref_type: string }>> {
  return storage.selectAll(
    "SELECT referee_key, ref_type FROM card_references WHERE referer_id = ? ORDER BY referee_key",
    [refererId],
  );
}

describe("update_structurees_references — the *structure save refreshes every structuree's outgoing references", () => {
  it("a content-changing *structure save rebuilds a stale structuree's reference rows from its content", async () => {
    const { storage, ruleId, refererId, engine, reports } = await structureDeck();
    expect(await refererRows(storage, refererId)).toEqual([
      { referee_key: "widget", ref_type: "L" },
    ]);

    const result = await engine.updateCard({
      cardId: ruleId,
      content: '{"type":"Basic"}',
    });
    expect(result).not.toBeNull();

    // the integrate walk fired the event (the when: gate saw the changed
    // db_content — phases.rb:48's restore_changes_information arm)
    const integrate = reports.find((r) => r.stage === "integrate");
    expect(integrate?.fired).toContain("update_structurees_references");

    // update_references_out = delete_references_out + create_references_out:
    // the referer's rows are rebuilt from its CURRENT content — the stale
    // lone widget row is gone; both links the content carries are present.
    expect(await refererRows(storage, refererId)).toEqual([
      { referee_key: "gadget", ref_type: "L" },
      { referee_key: "widget", ref_type: "L" },
    ]);
  });

  it("the delete arm fires the cascade too (when: ... || action == :delete)", async () => {
    const { storage, ruleId, refererId, engine, reports } = await structureDeck();
    const deleted = await engine.deleteCard({ cardId: ruleId });
    expect(deleted).not.toBeNull();
    const integrate = reports.find((r) => r.stage === "integrate");
    expect(integrate?.fired).toContain("update_structurees_references");
    // the walk ran over every structuree: the referer's stale row was
    // rebuilt from its content by the cascade.
    expect(await refererRows(storage, refererId)).toEqual([
      { referee_key: "gadget", ref_type: "L" },
      { referee_key: "widget", ref_type: "L" },
    ]);
  });

  it("cards outside right/structure stay skipped set-not-applicable", async () => {
    const { storage, refererId, engine, reports } = await structureDeck();
    const plain = await seedCard(storage, { name: "Plain Card", dbContent: "x" });
    await engine.updateCard({ cardId: plain.id, content: "y" });
    const integrate = reports.find((r) => r.stage === "integrate");
    const entry = integrate?.skipped.find((s) => s.event === "update_structurees_references");
    expect(entry?.reason).toBe("set-not-applicable");
    // no cascade ran: the referer's rows are untouched.
    expect(await refererRows(storage, refererId)).toEqual([
      { referee_key: "widget", ref_type: "L" },
    ]);
  });

  it("the registered body rebuilds the rows when invoked directly (the fn the walk fires)", async () => {
    const { storage, refererId } = await structureDeck();
    await updateStructureesReferencesEvent(
      { name: "*all+*structure", action: "update" },
      undefined,
      {
        driver: storage.engine.driver,
        lexicon: storage.engine.lexicon,
        stage: "integrate",
        skipEvent: () => false,
        fetch: storage.engine,
      },
    );
    expect(await refererRows(storage, refererId)).toEqual([
      { referee_key: "gadget", ref_type: "L" },
      { referee_key: "widget", ref_type: "L" },
    ]);
  });
});

describe("update_structurees_references? — the when: predicate (structure.rb:34-36)", () => {
  const predicate = contentModEventPredicates["update_structurees_references?"];

  it("db_content_changed? is the changedFields membership arm", () => {
    expect(predicate({ name: "R", changedFields: ["db_content"], action: "update" })).toBe(true);
    expect(predicate({ name: "R", changedFields: ["name", "type_id"], action: "update" })).toBe(false);
    expect(predicate({ name: "R", changedFields: [], action: "update" })).toBe(false);
  });

  it("action == :delete is the delete arm", () => {
    expect(predicate({ name: "R", changedFields: [], action: "delete" })).toBe(true);
  });
});
