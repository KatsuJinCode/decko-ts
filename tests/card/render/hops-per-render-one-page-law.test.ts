// THE HOPS GATE — one page, one database hit (the project's page-render
// law): "one page, one database hit. If you need more than one trip to the
// database when rendering a page, you need to explain why to me. Or it's
// illegal."
//
// WHAT THIS TEST DOES: renders a fixture page through the REAL engine over
// the counting driver (every driver.query and driver.batch = ONE round
// trip) and FAILS when the page's cold render spends more round trips than
// the law's ceiling: 1 (the page's own fused batch) + the justified
// exception trips enumerated below. Any future engine change that
// re-inflates hop counts — a new per-name point query, a wave that stopped
// riding the batch, a second closure pass — crosses the ceiling and fails
// the build mechanically. The warm re-render must stay at its enumerated
// floor (the freshness stamp + the late-seat type ask — see the exceptions
// note at the end of this header), which is what makes the constant
// permanent and not a lucky cold shape.
//
// THE ENUMERATED EXCEPTIONS (the round-trip classes a cold page render
// legitimately spends beyond its one fused batch; each carries its
// justification in this header). On this fixture (nested inclusion +
// pointer list with an unknown item + wiki link) the measured constant is
// 14 round trips:
//
//  1. THE PAGE BATCH (the law's 1): the prepare phase's closure/warm
//     statements fuse into as few driver.batch calls as the round
//     structure allows — the recursive `resolved` CTE closure walks,
//     the rule-universe folds (WITH RECURSIVE name_walk), the codename
//     census, the type census, the mod-warm shapes, the permission
//     party fold.
//  2. CLOSURE ROUNDS: the inclusion closure and the wave seating resolve
//     level-by-level (a junction's ids are only known once its sides
//     seated; a reference stratum is only known once the previous
//     stratum fetched) — each round is ONE round trip carrying that
//     round's whole statement set. O(depth) batched rounds, never
//     per-name point queries. Cannot join into fewer statements without
//     the whole-deck walk the scoping design deliberately omits.
//  3. WAVE SEATING ROUNDS: seatNamesByWave's chunked key IN-lists,
//     side-key joins, and side-id tuple asks ride the same rounds as (2)
//     when the round structure allows; a name whose sides resolve late
//     costs its own round.
//  4. THE LADDER RESIDUE: point queries the seating cannot predict —
//     the root card's own key-row fetch, id-row fetches for rows the
//     closure never seated, the idToLex name compositions on the fetch
//     path. Distinct-per-render questions (distinct == calls on every
//     family measured), so no memo helps; the waves
//     PREDICT the asks instead, and each prediction removes its ladder
//     residue.
//  5. VIEW-TIME RESOLVED SETTINGS + SESSION STATE: the *content options /
//     *help / *structure / *default rules and the session actor's
//     permission fold resolve during the view walk; their ladders answer
//     from the seats the waves primed, and a shape the waves never ask
//     spends its real db ask here.
//
// The ceiling encodes 1 + the exceptions' fixture maxima = 14. The WARM
// re-render carries TWO documented exceptions: (a) the FRESHNESS STAMP —
// one PK point SELECT of deck_data_version at every render entry
// (render.ts DECK_DATA_VERSION_STATEMENT; the schema header documents
// "warm-render cost is ONE statement, not zero") — and (b) the LATE-SEAT
// TYPE ask (a type card whose holder entered the prepared map after the
// cold render's last priming pass costs its one-row ask on the next
// render, once per engine) — every other warm question must answer from
// engine state.
// Raising ANY class requires its justification documented FIRST, then a
// ceiling change in the SAME commit, so the law's envelope cannot drift
// silently.

import { describe, it, expect, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";

let storage: RenderTestStorage | undefined;
afterAll(() => {
  storage?.close();
});

/** The law's ceiling: 1 (the page batch) + the enumerated exceptions'
 *  fixture maxima = 14. See the header — change ONLY with the
 *  justification documented in the same commit. */
const HOPS_LAW_CEILING = 14;

async function seedLawFixtureDeck(s: RenderTestStorage): Promise<void> {
  // The type cards + the settings the page walk resolves.
  await seedCard(s, { id: 2, name: "Basic", codename: "basic", typeId: 5 });
  await seedCard(s, { id: 5, name: "Cardtype", codename: "cardtype", typeId: 5 });
  await seedCard(s, { id: 47, name: "List", codename: "list", typeId: 5 });
  await seedCard(s, { id: 259, name: "Set", codename: "set", typeId: 5 });
  await seedCard(s, { id: 708, name: "*self", typeId: 2 });
  await seedCard(s, { id: 701, name: "*content options", typeId: 2 });
  await seedCard(s, { id: 274, name: "*all", codename: "all", typeId: 259 });
  await seedCard(s, { id: 10, name: "Anyone", codename: "anyone", typeId: 2 });
  await seedCard(s, { id: 704, name: "*read", codename: "read", typeId: 2 });
  // The deck's readable rule: *all+*read = "Anyone".
  await seedCard(s, {
    id: 800,
    name: "*all+*read",
    leftId: 274,
    rightId: 704,
    typeId: 2,
    dbContent: "Anyone",
  });
  await seedCard(s, { id: 810, name: "Anyone+*self", leftId: 10, rightId: 708, typeId: 259 });
  await seedCard(s, {
    id: 811,
    name: "Anyone+*self+*read",
    leftId: 810,
    rightId: 704,
    typeId: 2,
    dbContent: "Anyone",
  });
  // The page, its included child, a pointer list with an unknown item,
  // and a wiki-link target.
  await seedCard(s, {
    id: 900,
    name: "law fixture page",
    typeId: 2,
    dbContent: "{{law fixture child}}\n[[law fixture link target]]",
  });
  await seedCard(s, { id: 901, name: "law fixture page+*self", leftId: 900, rightId: 708, typeId: 259 });
  await seedCard(s, {
    id: 910,
    name: "law fixture child",
    typeId: 2,
    dbContent: "the child body",
  });
  await seedCard(s, { id: 911, name: "law fixture child+*self", leftId: 910, rightId: 708, typeId: 259 });
  await seedCard(s, {
    id: 920,
    name: "law fixture list",
    typeId: 47,
    dbContent: "law fixture unknown item",
  });
  await seedCard(s, { id: 921, name: "law fixture list+*self", leftId: 920, rightId: 708, typeId: 259 });
  await seedCard(s, { id: 930, name: "law fixture link target", typeId: 2, dbContent: "link body" });
  await seedCard(s, { id: 931, name: "law fixture link target+*self", leftId: 930, rightId: 708, typeId: 259 });
  await seedCard(s, {
    id: 902,
    name: "law fixture page+*self+*read",
    leftId: 901,
    rightId: 704,
    typeId: 2,
    dbContent: "Anyone",
  });
}

describe("the hops gate: one page, one database hit (plus the enumerated exceptions)", () => {
  it("cold render of the fixture page stays under the law's ceiling; warm re-render stays at its enumerated floor (freshness stamp + late-seat type)", async () => {
    storage = await createRenderTestStorage();
    await seedLawFixtureDeck(storage);

    // COLD: the seeded INSERTs paid their own round trips; reset before the
    // page render so the snapshot is the PAGE's cost alone.
    storage.counting.reset();
    await storage.engine.render("law fixture page", "open");
    const cold = storage.counting.snapshot();

    expect(
      cold.roundTrips,
      `the cold page render spent ${cold.roundTrips} round trips; the law allows ${HOPS_LAW_CEILING} ` +
        `(1 page batch + the enumerated exceptions — see this file's header and the ` +
        `db-roundtrip-elimination lane receipt's per-hop justifications). A jump means ` +
        `a hop family lost its batch or a new one appeared: name it in the receipt FIRST.`,
    ).toBeLessThanOrEqual(HOPS_LAW_CEILING);

    // WARM: the law's permanence half — every question the cold render
    // asked is answered from engine state now.
    // The ceiling is 2, from TWO legitimate warm classes: the LATE-SEAT
    // TYPE exception set the first ceiling, and the deck_data_version
    // stamp read at every render entry (render.ts
    // DECK_DATA_VERSION_STATEMENT; db/schema.sqlite.sql [ENGINE-FRESHNESS]
    // header: "the render contract's warm-render cost is ONE statement,
    // not zero") is the second, added by the freshness repair. More than
    // 2 means a question is being RE-ASKED.
    storage.counting.reset();
    await storage.engine.render("law fixture page", "open");
    const warm = storage.counting.snapshot();
    expect(
      warm.roundTrips,
      `the warm re-render spent ${warm.roundTrips} round trips; the law allows 2: the ` +
        `FRESHNESS STAMP (one PK point SELECT at every render entry, d19ec179 — ` +
        `render.ts DECK_DATA_VERSION_STATEMENT) + the LATE-SEAT TYPE exception — a type ` +
        `card whose holder record entered the prepared map after the priming pass's ` +
        `last run of the COLD render costs its one-row ask on the next render, once ` +
        `per engine (both enumerated in the header + the receipts). More than 2 means ` +
        `a question is being RE-ASKED.`,
    ).toBeLessThanOrEqual(2);
  });
});
