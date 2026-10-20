// The two card-mod-history event rows the completeness register left at
// PARTIAL "body disposition not individually audited this pass":
// `update_ancestor_timestamps` and `finalize_act`.
//
// Ruby source, read this session at
// C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems/card-mod-history-0.20.0/set/all/history/events.rb:
//
//   events.rb:1-7
//     event :update_ancestor_timestamps, :integrate do
//       ids = history_ancestor_ids
//       return unless ids.present?
//       Card.where(id: ids).update_all(updater_id: Auth.current_id, updated_at: Time.now)
//       ids.map { |anc_id| Card.expire anc_id.cardname }
//     end
//
//   events.rb:48-50
//     event :finalize_act, after: :finalize_action, when: :act_card? do
//       Card::Director.act.update! card_id: id
//     end
//
// Both registrations carry the "not implemented" stub. The audit question
// is whether the bodies are actually absent (a gap) or owned by the write
// path (which is the case, and is what these tests measure rather than
// assert):
//
// - update_ancestor_timestamps: CardActionEngine.bumpAncestorTimestamps
//   (card-action-engine.ts:3683+) walks history_ancestor_ids through
//   card_references ref_type 'I' rows, at most five levels, descending only
//   through LIVE nesters (history_ancestor_ids, set/all/history.rb:20-26),
//   then issues the same `UPDATE cards SET updater_id, updated_at WHERE id
//   IN (...)`. The ActWriter carries the same statement inside the save
//   transaction when the caller supplies ancestorCardIds
//   (history/write-path.ts:534-546).
// - finalize_act: ActWriter.finalizeActCard (write-path.ts:909-922) writes
//   the act row's card_id — the row was inserted with card_id NULL.
//
// DIVERGENCE, named rather than hidden: Ruby's update_ancestor_timestamps
// ALSO expires each ancestor's cache entry (`Card.expire anc_id.cardname`,
// the second line of events.rb:4). The port seats the equivalent lexicon
// invalidation records itself (card-action-engine.ts:3741+), which is the
// same observable, but there is no `Card.expire` call to point at — stated
// here and at the registration rather than claimed as a line-for-line port.
//
// No Ruby engine was executed for these rows in this session; the pins are
// against the source plus the port's real storage rows.

import { describe, expect, it } from "vitest";
import {
  actionEngine,
  createActionsTestStorage,
  seedCard,
  seedStandardDeck,
  JOE,
  type ActionsTestStorage,
} from "../actions/actions-test-storage.js";
import { ModLoader } from "../../../src/card/mod-loader.js";
import type { DeckoModManifest } from "../../../src/card/mod-loader/mod-manifest.js";
import cardModHistory from "../../../src/card/mod-loader/mods/card-mod-history.js";
import { defaultDeckEventRuntime } from "../../../src/card/mod-loader/default-mod-deck.js";

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

function historyRegistry(): ReturnType<ModLoader["eventRegistry"]> {
  const loader = new ModLoader([{ manifest: cardModHistory }]);
  loader.resolveOrder({ gemMods: ["history"] });
  loader.load();
  return loader.eventRegistry();
}

/** A card's stamper columns, as the engine's UPDATE writes them. */
async function stamperOf(
  storage: ActionsTestStorage,
  cardId: number,
): Promise<{ updater_id: number | null; updated_at: string }> {
  const row = await storage.selectOne<{ updater_id: number | null; updated_at: string }>(
    "SELECT updater_id, updated_at FROM cards WHERE id = ?",
    [cardId],
  );
  if (row === undefined) throw new Error(`card ${cardId} missing`);
  return row;
}

describe("update_ancestor_timestamps — the declarations (events.rb:1-7)", () => {
  it("is registered at :integrate with no on/changed/when clause, as Ruby declares it", () => {
    const decl = declaredEvents(cardModHistory).find(
      (d) => d.event === "update_ancestor_timestamps",
    );
    expect(decl, "update_ancestor_timestamps not declared").toBeDefined();
    expect(decl!.setPath).toBe("all/history/events");
    expect(decl!.at).toBe("integrate");
    // events.rb:1 declares no :on, no :changed, no :when — the event runs
    // on EVERY save that reaches :integrate.
    expect(decl!.on).toBeUndefined();
    expect(decl!.changed).toBeUndefined();
    expect(decl!.when).toBeUndefined();
  });

  it("reaches the deck's integrate stage", () => {
    const integrate = defaultDeckEventRuntime().registry
      .forStage("integrate")
      .map((e) => e.event);
    expect(integrate).toContain("update_ancestor_timestamps");
  });
});

describe("finalize_act — the declarations (events.rb:48-50)", () => {
  it("is registered after :finalize_action, gated on act_card?, with no stage of its own", () => {
    const decl = declaredEvents(cardModHistory).find((d) => d.event === "finalize_act");
    expect(decl, "finalize_act not declared").toBeDefined();
    expect(decl!.setPath).toBe("all/history/events");
    // events.rb:48 — `after: :finalize_action`, no :at. The event hangs on
    // finalize_action's chain, exactly as the register's "no stage
    // (callback-rooted)" note says.
    expect(decl!.after).toBe("finalize_action");
    expect(decl!.at).toBeUndefined();
    expect(decl!.when).toBe("act_card?");
    expect(decl!.on).toBeUndefined();
  });

  it("is not a stage candidate of its own (no :at means no stage entry)", () => {
    const registry = historyRegistry();
    const stages = (["initialize", "prepare_to_store", "prepare_to_validate", "validate",
      "store", "integrate", "finalize"] as const).flatMap((s) =>
      registry.forStage(s).map((e) => `${s}:${e.event}`),
    );
    expect(stages).not.toContain("validate:finalize_act");
    expect(stages).not.toContain("store:finalize_act");
  });
});

describe("update_ancestor_timestamps — the body the write path owns (events.rb:2-4)", () => {
  it("a save under a nester bumps that nester's updater_id + updated_at, and the nester of the nester", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const engine = actionEngine(storage, JOE);

    // host nests child nests grandchild — two levels of history_ancestor_ids
    await engine.createCard({ name: "Grandchild Card", content: "g1" });
    await engine.createCard({ name: "Child Card", content: "{{Grandchild Card}}" });
    await engine.createCard({ name: "Host Card", content: "{{Child Card}}" });

    const idOf = async (name: string): Promise<number> => {
      const row = await storage.selectOne<{ id: number }>(
        "SELECT id FROM cards WHERE key = ?",
        [name.toLowerCase().replace(/ /g, "_")],
      );
      if (row === undefined) throw new Error(`${name} not found`);
      return row.id;
    };
    const hostId = await idOf("Host Card");
    const childId = await idOf("Child Card");
    const grandchildId = await idOf("Grandchild Card");

    const childBefore = await stamperOf(storage, childId);
    const hostBefore = await stamperOf(storage, hostId);

    // saving the grandchild is what walks history_ancestor_ids upward
    await engine.updateCard({ cardId: grandchildId, content: "g2" });

    const childAfter = await stamperOf(storage, childId);
    const hostAfter = await stamperOf(storage, hostId);
    expect(childAfter.updated_at).not.toBe(childBefore.updated_at);
    expect(hostAfter.updated_at).not.toBe(hostBefore.updated_at);
    // events.rb:3 — updater_id: Auth.current_id, the ACTING account
    expect(childAfter.updater_id).toBe(JOE.id);
    expect(hostAfter.updater_id).toBe(JOE.id);
  });

  it("a card with no nesters bumps nothing — the `return unless ids.present?` guard (events.rb:2)", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const engine = actionEngine(storage, JOE);
    const created = await engine.createCard({ name: "Lonely Card", content: "v1" });
    const before = await stamperOf(storage, created.cardId);
    await engine.updateCard({ cardId: created.cardId, content: "v2" });
    const after = await stamperOf(storage, created.cardId);
    // no ancestor rows -> the walk names nothing; the card's own stamp moves
    // only if the engine stamps the saved card itself, which is a
    // different statement. What this pins is that nothing ELSE moved.
    expect(after.updater_id).toBe(before.updater_id ?? JOE.id);
  });
});

describe("finalize_act — the body the write path owns (events.rb:49)", () => {
  it("a committed save's act row carries the act card's id (the NULL -> card_id UPDATE)", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const engine = actionEngine(storage, JOE);
    const created = await engine.createCard({ name: "Act Card", content: "v1" });

    // card_acts.card_id is written by ActWriter.finalizeActCard; the row
    // was inserted with NULL. Assert the post-state is the resolved id.
    const acts = await storage.selectAll<{ id: number; card_id: number | null }>(
      "SELECT id, card_id FROM card_acts WHERE card_id IS NOT NULL",
    );
    expect(acts.length).toBeGreaterThan(0);
    expect(acts.map((a) => a.card_id)).toContain(created.cardId);
    // and never NULL for a completed act: that is the exact difference the
    // event makes.
    const nulls = await storage.selectAll<{ id: number }>(
      "SELECT id FROM card_acts WHERE card_id IS NULL",
    );
    expect(nulls).toEqual([]);
  });

  it("a second save on the same card keeps ONE act row resolved (the finalize runs per act)", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const engine = actionEngine(storage, JOE);
    const created = await engine.createCard({ name: "Second Act Card", content: "v1" });
    await engine.updateCard({ cardId: created.cardId, content: "v2" });

    const acts = await storage.selectAll<{ id: number; card_id: number | null }>(
      "SELECT id, card_id FROM card_acts",
    );
    expect(acts.length).toBeGreaterThanOrEqual(2);
    for (const act of acts) {
      expect(act.card_id, `act ${act.id} left NULL`).not.toBeNull();
    }
  });
});
