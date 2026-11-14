// event :update_structurees_type (card-mod-content-0.20.0
// set/right/structure.rb:44-47, :finalize, changed: :type_id, when: proc
// { |c| c.assigns_type? }) — a type-changing *structure rule save cascades
// the rule card's NEW type onto every structuree: update_structurees
// (:57-69) runs structuree_query(return: :id) and writes the rows DIRECTLY —
// Card.where(id: id_batch).update_all(type_id: ...) in slices of 100, no
// validations, no callbacks (Auth.as_bot).
//
// The when-proc's card method assigns_type? (set/all/templating.rb:30-38):
// pattern_code = Card.quick_fetch(name.trunk_name.tag_name)&.codename — the
// rule's trunk's TAG names the set-pattern card ("Widget+*right+*structure"
// -> "*right"), and only the right (07_right.rb:3) and type_plus_right
// (08_type_plus_right.rb:5) patterns carry assigns_type: true. A
// "X+*type+*structure" rule governs CONTENT, not type — Ruby's own comment
// example — so its type-changing save cascades nothing.
//
// ORACLE (synthetic deck): the members of the Widget+*right set ("Alpha+
// Widget", "Beta+Widget", rows with right_id = Widget) come out of a
// type-changing save of "Widget+*right+*structure" with type_id = Pointer —
// a DIRECT row write, the update_all shape.

import { describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  seedCard,
  seedStandardDeck,
  JOE,
  RICH_TEXT_ID,
  CARDTYPE_ID,
  SET_TYPE_ID,
  type ActionsTestStorage,
} from "../actions/actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { ModLoader } from "../../../src/card/mod-loader.js";
import cardModContent, {
  contentModEventPredicates,
  updateStructureesTypeEvent,
} from "../../../src/card/mod-loader/mods/card-mod-content.js";
import { rightSetMember } from "../../../src/card/mod-loader/mod-event-set-membership.js";
import type { CardsRow } from "../../../src/server/schema.js";
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

/** The right-set deck: "*structure" + "*right" + "*type" codename cards, the
 *  Widget+*right set card (its content IS the structuree query —
 *  {"right":"Widget"}), two members of the set, and the rule card. */
async function rightSetDeck(storage: ActionsTestStorage): Promise<{
  ruleId: number;
  ruleName: string;
  memberIds: number[];
  pointerId: number;
}> {
  await seedStandardDeck(storage);
  const structure = await seedCard(storage, { name: "*structure", codename: "structure" });
  const rightStar = await seedCard(storage, { name: "*right", codename: "right" });
  const typeStar = await seedCard(storage, { name: "*type", codename: "type" });
  const pointer = await seedCard(storage, {
    name: "Pointer",
    codename: "pointer",
    typeId: CARDTYPE_ID,
  });
  const widget = await seedCard(storage, { name: "Widget", dbContent: "w" });
  const setCard = await seedCard(storage, {
    leftId: widget.id,
    rightId: rightStar.id,
    typeId: SET_TYPE_ID,
    dbContent: '{"right":"Widget"}',
  });
  const alpha = await seedCard(storage, { name: "Alpha", dbContent: "a" });
  const beta = await seedCard(storage, { name: "Beta", dbContent: "b" });
  const memberA = await seedCard(storage, {
    leftId: alpha.id,
    rightId: widget.id,
    typeId: RICH_TEXT_ID,
  });
  const memberB = await seedCard(storage, {
    leftId: beta.id,
    rightId: widget.id,
    typeId: RICH_TEXT_ID,
  });
  const rule = await seedCard(storage, {
    leftId: setCard.id,
    rightId: structure.id,
    typeId: RICH_TEXT_ID,
    dbContent: "template",
  });
  return {
    ruleId: rule.id,
    ruleName: "Widget+*right+*structure",
    memberIds: [memberA.id, memberB.id],
    pointerId: pointer.id,
  };
}

async function cardRow(storage: ActionsTestStorage, id: number): Promise<CardsRow | undefined> {
  return storage.selectOne<CardsRow>("SELECT * FROM cards WHERE id = ?", [id]);
}

describe("update_structurees_type — a type-changing *right+*structure save cascades the new type", () => {
  it("the set's members come out of the save with the rule card's new type (update_all, direct write)", async () => {
    const storage = await createActionsTestStorage();
    const { ruleId, memberIds, pointerId } = await rightSetDeck(storage);
    const { runtime, reports } = contentRuntime(storage.engine.driver);
    const engine = new CardActionEngine(storage.engine, {
      actor: JOE,
      ipAddress: "192.0.2.7",
      modEvents: runtime,
    });

    const result = await engine.updateCard({ cardId: ruleId, typeId: pointerId });
    expect(result).not.toBeNull();

    // the finalize walk fired the event (changed: :type_id + assigns_type?)
    const finalize = reports.find((r) => r.stage === "finalize");
    expect(finalize?.fired).toContain("update_structurees_type");

    // update_structurees wrote the members' rows DIRECTLY: type_id = the
    // rule card's NEW type, in slices of 100, nothing else touched.
    for (const id of memberIds) {
      const row = await cardRow(storage, id);
      expect(row?.type_id).toBe(pointerId);
    }
  });

  it("a content-only save of the same rule cascades nothing (the changed: :type_id gate)", async () => {
    const storage = await createActionsTestStorage();
    const { ruleId, memberIds, pointerId } = await rightSetDeck(storage);
    const { runtime, reports } = contentRuntime(storage.engine.driver);
    const engine = new CardActionEngine(storage.engine, {
      actor: JOE,
      ipAddress: "192.0.2.7",
      modEvents: runtime,
    });

    await engine.updateCard({ cardId: ruleId, content: "new template" });
    const finalize = reports.find((r) => r.stage === "finalize");
    const entry = finalize?.skipped.find((s) => s.event === "update_structurees_type");
    expect(entry?.reason).toBe("changed");
    for (const id of memberIds) {
      expect((await cardRow(storage, id))?.type_id).toBe(RICH_TEXT_ID);
    }
  });

  it("a type-changing X+*type+*structure save cascades nothing (assigns_type? is false for the type pattern)", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const structure = await seedCard(storage, { name: "*structure", codename: "structure" });
    const typeStar = await seedCard(storage, { name: "*type", codename: "type" });
    const pointer = await seedCard(storage, {
      name: "Pointer",
      codename: "pointer",
      typeId: CARDTYPE_ID,
    });
    const book = await seedCard(storage, { name: "Book", dbContent: "b" });
    const bookTypeSet = await seedCard(storage, {
      leftId: book.id,
      rightId: typeStar.id,
      typeId: SET_TYPE_ID,
      dbContent: '{"type":"Book"}',
    });
    // a member of the Book+*type set: a card whose TYPE is Book is not
    // seedable here (Book is not a cardtype in the fixture) — the cascade is
    // gated off BEFORE the query runs, so the plain card pins the no-op.
    const member = await seedCard(storage, { name: "Plain Member", typeId: RICH_TEXT_ID });
    const rule = await seedCard(storage, {
      leftId: bookTypeSet.id,
      rightId: structure.id,
      typeId: RICH_TEXT_ID,
      dbContent: "template",
    });
    const { runtime, reports } = contentRuntime(storage.engine.driver);
    const engine = new CardActionEngine(storage.engine, {
      actor: JOE,
      ipAddress: "192.0.2.7",
      modEvents: runtime,
    });

    await engine.updateCard({ cardId: rule.id, typeId: pointer.id });
    const finalize = reports.find((r) => r.stage === "finalize");
    const entry = finalize?.skipped.find((s) => s.event === "update_structurees_type");
    expect(entry?.reason).toBe("when-false");
    expect((await cardRow(storage, member.id))?.type_id).toBe(RICH_TEXT_ID);
  });

  it("the registered body cascades the type when invoked directly (the fn the walk fires)", async () => {
    const storage = await createActionsTestStorage();
    const { ruleName, memberIds, pointerId } = await rightSetDeck(storage);
    await updateStructureesTypeEvent(
      { name: ruleName, action: "update", typeId: pointerId },
      undefined,
      {
        driver: storage.engine.driver,
        lexicon: storage.engine.lexicon,
        stage: "finalize",
        skipEvent: () => false,
        fetch: storage.engine,
      },
    );
    for (const id of memberIds) {
      expect((await cardRow(storage, id))?.type_id).toBe(pointerId);
    }
  });
});

describe("assigns_type? — the when-proc's card method (templating.rb:30-38)", () => {
  const predicate = contentModEventPredicates["assigns_type?"];

  it("the right pattern assigns type", async () => {
    const storage = await createActionsTestStorage();
    await rightSetDeck(storage);
    const ctx = {
      driver: storage.engine.driver,
      lexicon: storage.engine.lexicon,
      stage: "finalize" as const,
      skipEvent: () => false,
    };
    await expect(predicate({ name: "Widget+*right+*structure" }, ctx)).resolves.toBe(true);
  });

  it("the type pattern governs content, not type — false (Ruby's own comment example)", async () => {
    const storage = await createActionsTestStorage();
    await rightSetDeck(storage);
    const ctx = {
      driver: storage.engine.driver,
      lexicon: storage.engine.lexicon,
      stage: "finalize" as const,
      skipEvent: () => false,
    };
    await expect(predicate({ name: "Book+*type+*structure" }, ctx)).resolves.toBe(false);
  });

  it("the all pattern is false, and no context answers false", async () => {
    const storage = await createActionsTestStorage();
    await rightSetDeck(storage);
    const ctx = {
      driver: storage.engine.driver,
      lexicon: storage.engine.lexicon,
      stage: "finalize" as const,
      skipEvent: () => false,
    };
    await expect(predicate({ name: "*all+*structure" }, ctx)).resolves.toBe(false);
    await expect(predicate({ name: "Widget+*right+*structure" }, undefined)).resolves.toBe(false);
  });
});
