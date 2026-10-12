// The ModEventFn EXECUTION SEAM wired into the save path (CardActionEngine's
// modEvents option): the core mod's five reference-janitor events run as
// REAL ModEventFn bodies through the dispatcher during create/rename/delete,
// skip conditions included.
//
// Sources every expectation derives from (upstream source, card-1.110.0):
// - the five events: mod/core/set/all/reference_events.rb (:2-4
//   refresh_references_out on: :save changed: :content; :6-10
//   update_referer_content on: :update changed: :name skip: :allowed;
//   :15-19 update_referer_references_out when: :skip_update_referers?;
//   :21-25 refresh_references_in changed: :name on: :save — its unmap arm
//   gated `action == :update && skip_update_referers?`; :27-31
//   clear_references on: :delete).
// - skip_update_referers? (:34-36) = skip_event? :update_referer_content
//   (set/event/skip_and_trigger.rb:68-70) — the skip list drives the twin.
// - takeover contract: when an event name is registered at the engine's
//   modEvents runtime, the engine's built-in call site for that behavior
//   stands down (the declaration takes over, exactly the upstream shape
//   where the event IS the code); unregistered names keep the built-in
//   fallback.
//
// Deck expectations mirror the proven built-in suites
// (refresh-references-in.test.ts), re-exercised through the seam.

import { describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  seedStandardDeck,
  JOE,
  fakeClock,
  type ActionsTestStorage,
} from "./actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { ModLoader, ModEventRegistry } from "../../../src/card/mod-loader.js";
import coreMod, {
  coreModEventPredicates,
} from "../../../src/card/mod-loader/mods/core-mod.js";
import type { ModEventRuntime } from "../../../src/card/mod-loader/mod-event-dispatch.js";
import type { ModEventStageReport } from "../../../src/card/mod-loader/mod-event-dispatch.js";

interface RefRow {
  id: number;
  referer_id: number;
  referee_key: string | null;
  referee_id: number | null;
  ref_type: string;
}

async function refsForReferer(
  storage: ActionsTestStorage,
  refererId: number,
): Promise<RefRow[]> {
  return storage.selectAll<RefRow>(
    `SELECT id, referer_id, referee_key, referee_id, ref_type
     FROM card_references WHERE referer_id = ? ORDER BY id`,
    [refererId],
  );
}

async function contentOf(
  storage: ActionsTestStorage,
  cardId: number,
): Promise<string | null> {
  const row = await storage.selectOne<{ db_content: string | null }>(
    "SELECT db_content FROM cards WHERE id = ?",
    [cardId],
  );
  return row?.db_content ?? null;
}

/** The core mod's manifest loaded standalone -> its event registry (the
 *  same registration the SetLoader phase performs engine-wide). */
function coreRegistry() {
  const loader = new ModLoader([{ manifest: coreMod }]);
  loader.resolveOrder({ gemMods: ["core"] });
  loader.load();
  return loader.eventRegistry();
}

interface ReportLog {
  reports: ModEventStageReport[];
}

/** A save engine bound to the core registry; records every dispatch report. */
function seamEngine(
  storage: ActionsTestStorage,
  opts: { skip?: string[] } = {},
): { engine: CardActionEngine; log: ReportLog } {
  const log: ReportLog = { reports: [] };
  const runtime: ModEventRuntime = {
    registry: coreRegistry(),
    predicates: coreModEventPredicates,
    skip: opts.skip,
    onReport: (report) => log.reports.push(report),
  };
  const engine = new CardActionEngine(storage.engine, {
    actor: JOE,
    ipAddress: "192.0.2.7",
    now: fakeClock(),
    modEvents: runtime,
  });
  return { engine, log };
}

function reportsFor(log: ReportLog, stage: string): ModEventStageReport[] {
  return log.reports.filter((r) => r.stage === stage);
}

describe("the reference janitors run THROUGH the seam (real bodies)", () => {
  it("a create save fires refresh_references_out from the registered body", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const { engine, log } = seamEngine(storage);

    const referer = await engine.createCard({
      name: "Seam Fan",
      content: "[[Ghost Page]] and {{WCC Ghost+child}}",
    });

    const rows = await refsForReferer(storage, referer.cardId);
    // Content order: the [[Ghost Page]] link scans first, then the
    // junction nest with its two partials (refresh-references-out.ts
    // chunk walk).
    expect(rows.map((r) => ({ key: r.referee_key, type: r.ref_type }))).toEqual([
      { key: "ghost_page", type: "L" },
      { key: "wcc_ghost+child", type: "I" },
      { key: "wcc_ghost", type: "P" },
      { key: "child", type: "P" },
    ]);
    // The SEAM fired it (the report proves the dispatcher ran the body —
    // not the engine's built-in fallback, which stood down for the
    // registered name).
    const fired = reportsFor(log, "finalize").flatMap((r) => r.fired);
    expect(fired).toContain("refresh_references_out");
    expect(fired).toContain("refresh_references_in");
    storage.close();
  });

  it("a rename fires update_referer_content + refresh_references_in from the registered bodies", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const { engine, log } = seamEngine(storage);

    const blue = await engine.createCard({ name: "Blue", content: "color body" });
    const referer = await engine.createCard({
      name: "Blue Includer",
      content: "{{Blue}} and [[blue]]",
    });

    await engine.updateCard({ cardId: blue.cardId, name: "Red" });

    // The rename rewrite happened (parity with the built-in suite's pinned
    // bytes, refresh-references-in.test.ts "swaps links and nests").
    await expect(contentOf(storage, referer.cardId)).resolves.toBe(
      "{{Red}} and [[Red]]",
    );
    // Exactly one finalize dispatch for the renamed card's save, with both
    // janitor names fired through the seam.
    const fired = reportsFor(log, "finalize").flatMap((r) => r.fired);
    expect(fired).toContain("update_referer_content");
    expect(fired).toContain("refresh_references_in");
    // changed: :content is false on a name-only save: refresh_references_out
    // was skipped by its own condition, with the reason recorded.
    const refOut = reportsFor(log, "finalize").flatMap((r) => r.skipped);
    expect(refOut).toContainEqual({
      event: "refresh_references_out",
      reason: "changed",
    });
    storage.close();
  });

  it("a delete fires clear_references from the registered body", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const { engine, log } = seamEngine(storage);

    const doomed = await engine.createCard({ name: "Doomed", content: "[[Ghost Page]]" });
    expect((await refsForReferer(storage, doomed.cardId)).length).toBe(1);

    await engine.deleteCard({ cardId: doomed.cardId });

    expect(await refsForReferer(storage, doomed.cardId)).toEqual([]);
    const fired = reportsFor(log, "finalize").flatMap((r) => r.fired);
    expect(fired).toContain("clear_references");
    storage.close();
  });
});

describe("the skip machinery is alive on the save path (skip_event?)", () => {
  it("a skipped rename keeps referer content, fires the skip twin, and unmaps stale rows", async () => {
    // reference_events.rb:7-10 skipped; :15-19 fires (when:
    // skip_update_referers?); :21-25's unmap arm opens
    // (action == :update && skip_update_referers?).
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const { engine, log } = seamEngine(storage, { skip: ["update_referer_content"] });

    const blue = await engine.createCard({ name: "Blue", content: "body" });
    const skipFan = await engine.createCard({ name: "Skip Fan", content: "[[Blue]]" });
    const newFan = await engine.createCard({ name: "New Fan", content: "[[Red]]" });
    // A stale row still pointing at Blue's id (the "past tense" target) —
    // planted with a DANGLING referer (no live card 9999): referersOf maps
    // to live cards only (update-referer-content.ts:186-192), so the skip
    // twin's rebuild cannot sweep this row and the unmap arm's effect is
    // observable on it.
    await storage.driver.query(
      `INSERT INTO card_references (referer_id, referee_key, referee_id, ref_type)
       VALUES (?, ?, ?, ?)`,
      [9999, "stale_thing", blue.cardId, "L"],
    );

    await engine.updateCard({ cardId: blue.cardId, name: "Red" });

    // update_referer_content skipped: Skip Fan's content is untouched.
    await expect(contentOf(storage, skipFan.cardId)).resolves.toBe("[[Blue]]");
    // The skip twin fired and rebuilt Skip Fan's rows from UNCHANGED
    // content; the old name lost its Lexicon id, so referee_id lands NULL.
    const fired = reportsFor(log, "finalize").flatMap((r) => r.fired);
    expect(fired).toContain("update_referer_references_out");
    const skipRows = await refsForReferer(storage, skipFan.cardId);
    expect(skipRows.map((r) => ({ key: r.referee_key, id: r.referee_id }))).toContainEqual({
      key: "blue",
      id: null,
    });
    // refresh_references_in's unmap arm: the stale row lost Blue's id...
    const stale = await storage.selectAll<{ referee_id: number | null }>(
      "SELECT referee_id FROM card_references WHERE referee_key = 'stale_thing'",
    );
    expect(stale.map((r) => r.referee_id)).toEqual([null]);
    // ...and its map arm: New Fan's dangling red row adopts Blue's id.
    const newRows = await refsForReferer(storage, newFan.cardId);
    expect(newRows.map((r) => ({ key: r.referee_key, id: r.referee_id }))).toEqual([
      { key: "red", id: blue.cardId },
    ]);
    storage.close();
  });
});

describe("the built-in fallback stands when the name is not registered", () => {
  it("an EMPTY registry keeps today's engine behavior (built-ins run, seam fires nothing)", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    // A runtime whose registry carries NO janitor events: every built-in
    // call site stands (name-level takeover only), the dispatch walks fire
    // nothing.
    const log: ReportLog = { reports: [] };
    const engine = new CardActionEngine(storage.engine, {
      actor: JOE,
      ipAddress: "192.0.2.7",
      now: fakeClock(),
      modEvents: {
        registry: new ModEventRegistry(),
        onReport: (report) => log.reports.push(report),
      },
    });

    const blue = await engine.createCard({ name: "Blue", content: "color body" });
    const referer = await engine.createCard({
      name: "Blue Includer",
      content: "{{Blue}}",
    });
    await engine.updateCard({ cardId: blue.cardId, name: "Red" });
    // The rename rewrite still happened — through the engine's built-in
    // update_referer_content fallback, exactly today's behavior.
    await expect(contentOf(storage, referer.cardId)).resolves.toBe("{{Red}}");
    expect(log.reports.flatMap((r) => r.fired)).toEqual([]);
    storage.close();
  });
});
