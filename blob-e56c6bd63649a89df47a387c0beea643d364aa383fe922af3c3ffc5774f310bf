// The rename-referers staleness boundary: a rename's referer rewrite must
// leave the referer's PRE-rewrite card in the shared fetch cache (Ruby's
// Card[card_id] inside referers, reference/all.rb:15) while update_column
// rewrites the row behind it (content_quietly=, reference_events.rb:52-58 —
// no expire), so the next render serves the pre-rename bytes — the
// rename-referers oracle's pinned staleness — AND that staleness clears the
// way Ruby's clears it: the next legitimate write to the referer expires
// the entry (after_commit expire, cache/all.rb:17-24) and the render serves
// fresh. Synthetic fixtures only.

import { describe, expect, it } from "vitest";
import {
  actionEngine,
  createActionsTestStorage,
  seedCard,
  seedReference,
  seedStandardDeck,
} from "./actions-test-storage.js";

async function refererFixture() {
  const storage = await createActionsTestStorage();
  await seedStandardDeck(storage);
  const topic = await seedCard(storage, { name: "Topic 001", dbContent: "" });
  const note = await seedCard(storage, {
    name: "Note 001",
    dbContent: "<p>Topic: [[Topic 001]]</p>",
  });
  await seedReference(storage, note.id, topic.id, "topic_001");
  return { storage, topic, note };
}

describe("rename — the unexpired referer cache (update_column staleness)", () => {
  it("warms the referer's pre-rewrite card on the rename, serves it stale while the row is rewritten", async () => {
    const { storage, topic, note } = await refererFixture();
    const engine = actionEngine(storage);

    await engine.updateCard({ cardId: topic.id, name: "Topic Zero One" });

    // The row beneath: rewritten (update_column, no expire).
    const row = await storage.selectOne<{ db_content: string | null }>(
      "SELECT db_content FROM cards WHERE id = ?",
      [note.id],
    );
    expect(row?.db_content).toBe("<p>Topic: [[Topic Zero One]]</p>");

    // The cache the render path reads: the PRE-rewrite card (the Card[id]
    // fetch inside referers warmed it before the update_column).
    const served = await storage.engine.fetchByName("Note 001");
    expect(served?.dbContent).toBe("<p>Topic: [[Topic 001]]</p>");
  });

  it("the staleness clears on the next legitimate write to the referer", async () => {
    const { storage, topic, note } = await refererFixture();
    const engine = actionEngine(storage);

    await engine.updateCard({ cardId: topic.id, name: "Topic Zero One" });
    await expect(storage.engine.fetchByName("Note 001")).resolves.toMatchObject({
      dbContent: "<p>Topic: [[Topic 001]]</p>",
    });

    // Any write to the referer runs the post-commit expire (cache/all.rb
    // :17-24) — the stale entry drops and the render reads the rewritten row.
    await engine.updateCard({ cardId: note.id, content: "fresh" });
    await expect(storage.engine.fetchByName("Note 001")).resolves.toMatchObject({
      dbContent: "fresh",
    });
  });

  it("the pinned staleness survives the freshness gate's resetCaches (the TS-only reset Ruby does not have)", async () => {
    const { storage, topic, note } = await refererFixture();
    const engine = actionEngine(storage);

    await engine.updateCard({ cardId: topic.id, name: "Topic Zero One" });

    // The freshness gate (render.ts, delivery contract:79) resets every
    // derived cache when deck_data_version moves — the rename just moved it.
    // The reset wipes the plain cache but NOT the pinned entry: Ruby's
    // unexpired card cache has no such reset, and the graded oracle freezes
    // the stale bytes across it.
    storage.engine.resetCaches();
    await expect(storage.engine.fetchByName("Note 001")).resolves.toMatchObject({
      dbContent: "<p>Topic: [[Topic 001]]</p>",
    });
    // The row beneath stays the rewritten one the whole time.
    await expect(
      storage.selectOne<{ db_content: string }>("SELECT db_content FROM cards WHERE id = ?", [
        note.id,
      ]),
    ).resolves.toMatchObject({ db_content: "<p>Topic: [[Topic Zero One]]</p>" });

    // And the exit is the same one the reset arm above proves: a legitimate
    // write to the referer drops the pinned entry — the staleness clears the
    // way Ruby's clears it, it never accumulates.
    await engine.updateCard({ cardId: note.id, content: "fresh" });
    await expect(storage.engine.fetchByName("Note 001")).resolves.toMatchObject({
      dbContent: "fresh",
    });
  });

  it("the renamed card itself is not stale — the rename's own expire covers it", async () => {
    const { storage, topic } = await refererFixture();
    const engine = actionEngine(storage);

    await engine.updateCard({ cardId: topic.id, name: "Topic Zero One", content: "" });

    await expect(storage.engine.fetchByName("Topic Zero One")).resolves.toMatchObject({
      id: topic.id,
    });
    await expect(storage.engine.fetchByName("Topic 001")).resolves.toBeUndefined();
  });
});
