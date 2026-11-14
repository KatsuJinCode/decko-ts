// AIKIDO CLOSURE MEMBERSHIP INSPECTION (aikido-one-trip-byte-divergence
// lane, 2026-10-04) — the membership half of the OFF/ON divergence
// attribution.
//
// WHAT THIS IS: the render-path diff showed the ON posture emits a slot the
// OFF posture does not (the `aikido-participant_` titled-view list and its
// nine person bars), and that card 2180 (`aikido+Participant(s)`, the
// junction 947 -> 406) is absent from the OFF posture's entire SQL read set.
// This file asks the one question that separates "the ON posture seats
// DIFFERENT ROWS" from every other class: is card 2180 in the one-trip
// closure the ON posture seats, when the OFF posture's own discovery SQL
// provably does not return it?
//
// The answer is read from two places and both are written to
// benchmarks/aikido-divergence/: the derived store the closure builder
// produces (what the ON posture would seat), and the one-trip fetch's own
// bundle document for page "Aikido" (what the ON posture actually seats).
//
// NOT A STANDING-NET MEMBER. A one-shot attribution probe, not a gate.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import { buildOneTripClosure } from "../../../src/card/one-trip/closure-builder.js";
import { attachDerivedStore, fetchPageBundle, DERIVED_STORE_ATTACH } from "../../../src/card/one-trip/one-trip-fetch.js";

const LOCAL_COPY_PATH = fileURLToPath(
  new URL("../../../benchmarks/cold-latency-rig/cold-latency-local-copy.sqlite3", import.meta.url),
);
const OUT_DIR = fileURLToPath(new URL("../../../benchmarks/aikido-divergence/", import.meta.url));
const STORE_PATH = fileURLToPath(
  new URL("../../../benchmarks/aikido-divergence/aikido-closure-side-store.sqlite3", import.meta.url),
);

const copyAvailable = existsSync(LOCAL_COPY_PATH);

/** The card the OFF render is missing, and the shape around it. */
const JUNCTION_2180 = 2180; // aikido + Participant(s)  (left 947, right 406)
const LIST_406 = 406; // key "participant_s" — note: NOT "participant_"
const ANALOG_JUNCTION_2174 = 2174; // aikido + Central Places (renders in BOTH)
const CENTRAL_PLACE_LIST_520 = 520; // key "central_place" — IS in the discovery key set
const PERSON_CARDS = [1263, 393, 742, 743, 1301, 741, 2844, 2842, 2812];

describe.skipIf(!copyAvailable)("Aikido one-trip closure membership", () => {
  it("reports whether the seated closure carries the card the OFF render never reads", async () => {
    mkdirSync(OUT_DIR, { recursive: true });
    const corpus = new LocalSqliteDriver({ path: LOCAL_COPY_PATH, readonly: true });
    const side = new LocalSqliteDriver({ path: STORE_PATH });
    await buildOneTripClosure({ corpus, side, pageNames: ["Aikido"] });

    // What the derived store itself holds for page 947.
    const closureRows = await side.query<{ card_id: number }>(
      `SELECT card_id FROM one_trip_page_closure WHERE page_id = 947 ORDER BY card_id`,
      [],
    );
    const closureIds = closureRows.rows.map((r) => r.card_id);

    // What the ONE-TRIP FETCH actually returns for page "Aikido" — the exact
    // document the ON posture seats.
    const corpus2 = new LocalSqliteDriver({ path: LOCAL_COPY_PATH, readonly: true });
    await attachDerivedStore(corpus2, STORE_PATH, DERIVED_STORE_ATTACH);
    const bundle = await fetchPageBundle(corpus2, "Aikido", DERIVED_STORE_ATTACH);
    const bundleIds = new Set(bundle.cardIds);

    const report = {
      pageKey: bundle.pageKey,
      pageId: bundle.pageId,
      closureMemberCount: closureIds.length,
      bundleCardCount: bundle.cardIds.length,
      in: {
        junction2180_aikidoParticipantList: {
          inDerivedClosure: closureIds.includes(JUNCTION_2180),
          inSeatedBundle: bundleIds.has(JUNCTION_2180),
        },
        listCard406_participant_s: {
          inDerivedClosure: closureIds.includes(LIST_406),
          inSeatedBundle: bundleIds.has(LIST_406),
        },
        analogJunction2174_aikidoCentralPlaces: {
          inDerivedClosure: closureIds.includes(ANALOG_JUNCTION_2174),
          inSeatedBundle: bundleIds.has(ANALOG_JUNCTION_2174),
          note: "renders in BOTH postures — the structural analog of 2180",
        },
        analogListCard520_central_place: {
          inDerivedClosure: closureIds.includes(CENTRAL_PLACE_LIST_520),
          inSeatedBundle: bundleIds.has(CENTRAL_PLACE_LIST_520),
          note: "key 'central_place' IS in the OFF discovery key set; 406's key 'participant_s' is not",
        },
        personCards: Object.fromEntries(
          PERSON_CARDS.map((id) => [String(id), { inDerivedClosure: closureIds.includes(id), inSeatedBundle: bundleIds.has(id) }]),
        ),
      },
    };
    writeFileSync(join_OUT("aikido-one-trip-closure-membership.json"), JSON.stringify(report, null, 2));

    // The measurement itself must have run.
    expect(bundle.cardIds.length).toBeGreaterThan(0);
    expect(closureIds.length).toBeGreaterThan(0);
  }, 900_000);
});

function join_OUT(name: string): string {
  return OUT_DIR.replace(/[\\/]$/, "") + "/" + name;
}
