// Save-time maintenance of the stored nest index (card_references 'I' rows).
//
// The save path rewrites a card's reference rows whenever its content
// changes (card-action-engine.ts maybeRefreshReferencesOut, Ruby's
// refresh_references_out :finalize on: :save, changed: :content). This suite
// drives real creates and updates through CardActionEngine and checks two
// things:
//   1. each save leaves the 'I' rows describing the content it just wrote;
//   2. the rows the saves left are exactly the rows ensureNestIndex derives
//      from the same content from scratch, so the save path and the boot
//      build agree and a deck is never "current" by one and "stale" by the
//      other.

import { describe, expect, it } from "vitest";
import {
  actionEngine,
  createActionsTestStorage,
  seedStandardDeck,
  type ActionsTestStorage,
} from "./actions-test-storage.js";
import { ensureNestIndex } from "../../../src/card/nest-index.js";

// A referee's stored key is its canonical key: the name with its spaces
// turned to underscores and lowercased ("Index Target" -> "index_target"),
// the key column's own form (Ruby Card::Name#key).
interface IndexRow {
  referer_id: number;
  referee_id: number | null;
  referee_key: string | null;
}

async function indexRows(storage: ActionsTestStorage): Promise<IndexRow[]> {
  return storage.selectAll<IndexRow>(
    `SELECT referer_id, referee_id, referee_key FROM card_references
      WHERE ref_type = 'I' ORDER BY referer_id, referee_key, referee_id`,
  );
}

async function indexRowsFor(storage: ActionsTestStorage, refererId: number): Promise<IndexRow[]> {
  return (await indexRows(storage)).filter((r) => r.referer_id === refererId);
}

describe("nest index: save-time maintenance", () => {
  it("a create writes the rows its content nests", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const engine = actionEngine(storage);
    const target = await engine.createCard({ name: "Index Target", content: "target body" });
    const includer = await engine.createCard({ name: "Index Includer", content: "{{Index Target}}" });

    const rows = await indexRowsFor(storage, includer.cardId);
    expect(rows).toEqual([
      { referer_id: includer.cardId, referee_id: target.cardId, referee_key: "index_target" },
    ]);
  });

  it("an update that changes the nests rewrites the rows; one that keeps them does not touch them", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const engine = actionEngine(storage);
    const first = await engine.createCard({ name: "Nest First", content: "first body" });
    const second = await engine.createCard({ name: "Nest Second", content: "second body" });
    const includer = await engine.createCard({ name: "Nest Holder", content: "{{Nest First}}" });

    await engine.updateCard({ cardId: includer.cardId, content: "{{Nest Second}} and more text" });
    expect(await indexRowsFor(storage, includer.cardId)).toEqual([
      { referer_id: includer.cardId, referee_id: second.cardId, referee_key: "nest_second" },
    ]);

    // Same nests, different prose: the rows are not rewritten (changed: :content
    // is true, so the event runs, and the rows come out identical).
    await engine.updateCard({ cardId: includer.cardId, content: "{{Nest Second}} with new prose" });
    expect(await indexRowsFor(storage, includer.cardId)).toEqual([
      { referer_id: includer.cardId, referee_id: second.cardId, referee_key: "nest_second" },
    ]);

    // No nests left: the index holds no 'I' row for the card.
    await engine.updateCard({ cardId: includer.cardId, content: "plain text only" });
    expect(await indexRowsFor(storage, includer.cardId)).toEqual([]);
    expect(first.cardId).toBeGreaterThan(0);
  });

  it("the rows the saves leave equal the rows a from-scratch build derives", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const engine = actionEngine(storage);
    const a = await engine.createCard({ name: "Chain A", content: "a body" });
    const b = await engine.createCard({ name: "Chain B", content: "{{Chain A}}" });
    const c = await engine.createCard({ name: "Chain C", content: "{{Chain B}} {{Chain A}}" });
    await engine.updateCard({ cardId: b.cardId, content: "{{Chain C}}" });
    await engine.updateCard({ cardId: a.cardId, content: "a now nests {{Chain C}}" });
    await engine.updateCard({ cardId: c.cardId, content: "{{Chain A}}" });

    const afterSaves = await indexRows(storage);
    expect(afterSaves.length).toBeGreaterThan(0);

    // A build from the same content, from nothing: the save path and the
    // build must agree row for row.
    const install = await ensureNestIndex(storage.driver, storage.engine.lexicon);
    expect(install.state).toBe("built");
    expect(await indexRows(storage)).toEqual(afterSaves);
  });
});
