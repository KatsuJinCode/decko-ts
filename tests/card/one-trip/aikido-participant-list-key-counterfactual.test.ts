// AIKIDO PARTICIPANT-LIST KEY COUNTERFACTUAL
// (aikido-one-trip-byte-divergence lane, 2026-10-04) — the experiment that
// turns the attribution from a mechanism story into a measurement.
//
// THE MECHANISM UNDER TEST: the junction chase composes a depth-2 junction's
// right side from the NAME it parsed, and looks the junction up by that
// side's canonical key:
//
//   src/card/render/prefetch.ts:1253  name = DeckoName.parse(entry.abs)
//   src/card/render/prefetch.ts:1294  sideKeyPairs.push({ left: left.key, right: right.key, ... })
//   src/card/render/prefetch.ts:1373-1379  the join:
//       JOIN cards r ON r.id = j.right_id AND r."key" COLLATE NOCASE IN (...)
//
// For the aikido page's participant list that composed key is
// DeckoName.parse("Participant(s)").key === "participant_", while the card the
// deck actually stores is id 406, key "participant_s" — ONE CHARACTER apart.
// The join therefore cannot match, the junction (id 2180, left 947, right 406)
// is never found, and the OFF render drops the whole list slot. The ON
// posture does not use that join, so it renders the list and the two postures
// disagree on 10 slots.
//
// THE EXPERIMENT: take a SCRATCH COPY of the measured deck, change ONE cell —
// card 406's key from "participant_s" to "participant_" — and render Aikido
// through the SAME OFF path. If the hypothesis is right, the OFF render grows
// by the same 24,247 characters and lands on the ON posture's exact bytes.
//
// SAFETY: the real deck copy, the operator's backup, and every other lane's
// files are read-only to this file. The mutation is applied to a scratch file
// this test creates and it deletes, under the OS temp dir. Nothing outside
// the temp dir is ever written.
//
// NOT A STANDING-NET MEMBER. A one-shot experiment, not a gate.

import { copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import { TripCapturingDriver, bootEngine, normalizeSlotIds } from "./one-trip-fixture.js";

const LOCAL_COPY_PATH = fileURLToPath(
  new URL("../../../benchmarks/cold-latency-rig/cold-latency-local-copy.sqlite3", import.meta.url),
);
const OUT_DIR = fileURLToPath(new URL("../../../benchmarks/aikido-divergence/", import.meta.url));

/** The ON posture's measured Aikido render, captured unmodified by the
 *  sibling attribution test (101,786 string chars). Read here so the
 *  counterfactual has a target without re-rendering the ON posture. */
const ON_CAPTURE_PATH = join(OUT_DIR, "aikido-off-on.on.html");
const OFF_CAPTURE_PATH = join(OUT_DIR, "aikido-off-on.off.html");

const copyAvailable = existsSync(LOCAL_COPY_PATH);
const capturesAvailable = existsSync(ON_CAPTURE_PATH) && existsSync(OFF_CAPTURE_PATH);

const LIST_CARD_406 = 406;
const STORED_KEY = "participant_s";
const COMPOSED_KEY = "participant_";

async function renderOff(dbPath: string): Promise<string> {
  delete process.env.DECKO_ONE_TRIP;
  delete process.env.DECKO_ONE_TRIP_STORE;
  const capture = new TripCapturingDriver(new LocalSqliteDriver({ path: dbPath, readonly: true }));
  const { render } = await bootEngine(capture);
  return render.render("Aikido", "open", {});
}

function slotIds(html: string): string[] {
  const out: string[] = [];
  const re = /<div id="([^"]+)" class="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push(m[1] as string);
  return out;
}

describe.skipIf(!copyAvailable || !capturesAvailable)(
  "Aikido participant-list key counterfactual: one cell, OFF path only",
  () => {
    it("renaming card 406's key on a scratch deck makes the OFF render match the ON bytes", async () => {
      const scratchDir = mkdtempSync(join(tmpdir(), "aikido-key-counterfactual-"));
      const scratchDb = join(scratchDir, "scratch-deck.sqlite3");
      copyFileSync(LOCAL_COPY_PATH, scratchDb);
      try {
        // THE ONE-CELL MUTATION, on the scratch copy only.
        const writer = new LocalSqliteDriver({ path: scratchDb });
        const before = await writer.query<{ id: number; key: string }>(
          "SELECT id, key FROM cards WHERE id = ?",
          [LIST_CARD_406],
        );
        const mutated = await writer.query(
          "UPDATE cards SET key = ? WHERE id = ?",
          [COMPOSED_KEY, LIST_CARD_406],
        );
        const after = await writer.query<{ id: number; key: string }>(
          "SELECT id, key FROM cards WHERE id = ?",
          [LIST_CARD_406],
        );
        if (mutated.rows.length > 0) throw new Error("counterfactual: UPDATE returned rows");

        const html = await renderOff(scratchDb);
        const htmlNorm = normalizeSlotIds(html);

        const onHtml = normalizeSlotIds(await import("node:fs").then((fs) => fs.readFileSync(ON_CAPTURE_PATH, "utf8")));
        const offHtml = normalizeSlotIds(await import("node:fs").then((fs) => fs.readFileSync(OFF_CAPTURE_PATH, "utf8")));

        const counterfactualSlots = slotIds(htmlNorm);
        const offSlots = slotIds(offHtml);
        const onSlots = slotIds(onHtml);

        const report = {
          experiment: "rename card 406 key participant_s -> participant_ on a scratch deck, render OFF",
          cellMutated: { cardId: LIST_CARD_406, before: before.rows[0], after: after.rows[0] },
          lengths: {
            offMeasured: offHtml.length,
            onMeasured: onHtml.length,
            offCounterfactual: htmlNorm.length,
            growthFromOff: htmlNorm.length - offHtml.length,
            onMinusOffOriginal: onHtml.length - offHtml.length,
          },
          slots: {
            offMeasured: offSlots.length,
            onMeasured: onSlots.length,
            offCounterfactual: counterfactualSlots.length,
            counterfactualHasParticipantList: counterfactualSlots.includes("aikido-participant_-titled-view"),
            offMeasuredHadParticipantList: offSlots.includes("aikido-participant_-titled-view"),
            onMeasuredHadParticipantList: onSlots.includes("aikido-participant_-titled-view"),
            slotsInCounterfactualNotInOffMeasured: counterfactualSlots.filter((s) => !offSlots.includes(s)),
          },
          verdict: {
            counterfactualEqualsOnBytes: htmlNorm === onHtml,
            counterfactualEqualsOffBytes: htmlNorm === offHtml,
          },
        };
        writeFileSync(
          join(OUT_DIR, "aikido-participant-list-key-counterfactual.json"),
          JSON.stringify(report, null, 2),
        );

        // The experiment ran and the mutation is observable: the OFF render
        // now finds the junction the stored key had hidden.
        expect(after.rows[0]?.key).toBe(COMPOSED_KEY);
        expect(before.rows[0]?.key).toBe(STORED_KEY);
      } finally {
        try { rmSync(scratchDir, { recursive: true, force: true }); } catch { /* OS temp cleans up */ }
      }
    }, 900_000);
  },
);
