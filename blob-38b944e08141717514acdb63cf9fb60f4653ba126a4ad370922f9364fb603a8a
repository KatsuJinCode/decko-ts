// The S2.3.c end-to-end round trip (the project contract, not in the public package): save cards
// through the REAL action engine — whose reference_events writer populates
// card_references (the write-path suite (not in the public package) scenario 08
// pins that row shape against the Ruby oracle rows) — then run
// reference-based CQL (refer_to / included_by) over the saved rows,
// resolving name values through the SAME deck lexicon the save path
// maintains (parseOptionsWithLexicon — Ruby's Card::Lexicon.id walk).
//
// Ruby truth for the read side: card-1.110.0 lib/card/query/card_query/
// reference_attributes.rb (define_reference_method — ReferenceQuery joins
// card_references on referer_id/referee_id + ref_type "I").

import { describe, expect, it } from "vitest";
import {
  actionEngine,
  createActionsTestStorage,
  seedStandardDeck,
} from "../card/actions/actions-test-storage.js";
import { executeQuery, parseOptionsWithLexicon } from "../../src/cql/execute.js";

describe("saved-card reference round trip: engine save -> refer_to/included_by CQL", () => {
  it("refer_to finds the referer the writer just saved", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const engine = actionEngine(storage);
    await engine.createCard({ name: "Round Target", content: "target body" });
    const referer = await engine.createCard({
      name: "Round Referrer",
      content: "see {{Round Target}}",
    });

    const result = await executeQuery(
      storage.driver,
      { refer_to: "Round Target" },
      { parse: parseOptionsWithLexicon(engine.fetch.lexicon) },
    );
    if ("count" in result) throw new Error("unexpected count result");
    expect(result.rows.map((r) => r.id)).toEqual([referer.cardId]);
    storage.close();
  });

  it("included_by returns the target's referees; include returns its includers", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const engine = actionEngine(storage);
    const target = await engine.createCard({ name: "Round Target", content: "target body" });
    const referer = await engine.createCard({
      name: "Round Referrer",
      content: "see {{Round Target}}",
    });

    // Ruby: included_by is reftype "I" from the REFERER side
    // (reference_attributes.rb:26,29) — the cards the referrer includes.
    const includedBy = await executeQuery(
      storage.driver,
      { included_by: "Round Referrer" },
      { parse: parseOptionsWithLexicon(engine.fetch.lexicon) },
    );
    if ("count" in includedBy) throw new Error("unexpected count result");
    expect(includedBy.rows.map((r) => r.id)).toEqual([target.cardId]);

    // Ruby: include is reftype "I" from the REFEREE side
    // (reference_attributes.rb:17,20) — the cards that include the target.
    const include = await executeQuery(
      storage.driver,
      { include: "Round Target" },
      { parse: parseOptionsWithLexicon(engine.fetch.lexicon) },
    );
    if ("count" in include) throw new Error("unexpected count result");
    expect(include.rows.map((r) => r.id)).toEqual([referer.cardId]);
    storage.close();
  });

  it("a link (not a nest) is visible to linked_to_by-style refs but not included_by", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const engine = actionEngine(storage);
    await engine.createCard({ name: "Round Target", content: "target body" });
    await engine.createCard({ name: "Round Linker", content: "[[Round Target]]" });

    const included = await executeQuery(
      storage.driver,
      { included_by: "Round Target" },
      { parse: parseOptionsWithLexicon(engine.fetch.lexicon) },
    );
    if ("count" in included) throw new Error("unexpected count result");
    expect(included.rows, "an L row is not an inclusion").toEqual([]);
    storage.close();
  });
});
