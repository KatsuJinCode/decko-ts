// The Decision 2 evidence dumper for the format layer's captured views: an
// env-gated companion to card-mod-format-remaining-views.test.ts. The pinned
// suite asserts equality; this file, run with
// DECKO_DUMP_FORMAT_VIEW_BYTES=1, additionally WRITES both sides' bytes to
// tmp/format-view-bytes/format-remaining-views.json so the side-by-side
// comparisons (docs/runs/decision-evidence-d1-d2-2026-10-25/) carry the raw
// material. Outside that env var it reports one skipped test and writes
// nothing - the regular suite run stays side-effect free.
//
// The setup below is the pinned suite's own (the same seeds, the same
// normalization), so the port side dumped here is the same rendering the
// pinned assertions grade.

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { setDeckEnvironment } from "../../../src/card/render/deck-origin.js";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  bindModLoaderToEngine,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { RenderEngine } from "../../../src/card/render.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { ModLoader, modEngineHost } from "../../../src/card/mod-loader.js";
import cardModHistory from "../../../src/card/mod-loader/mods/card-mod-history.js";
import cardModFormat from "../../../src/card/mod-loader/mods/card-mod-format.js";
import { ActWriter, cardFieldStateFromRow } from "../../../src/card/history/write-path.js";

const FIXTURE_PATH = "../../../fixtures/captured/format-remaining-views.json";
const OUT_PATH = "../../../tmp/format-view-bytes/format-remaining-views.json";
const DUMP = process.env.DECKO_DUMP_FORMAT_VIEW_BYTES === "1";

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  if (!DUMP) return;
  storage = await createRenderTestStorage();
  const s = storage;

  await seedCard(s, { id: 1, name: "Decko Bot", typeId: 2 });
  await seedCard(s, { id: 2, name: "RichText" });
  await seedCard(s, { id: 8, name: "*type", codename: "type", typeId: 14 });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
  await seedCard(s, { id: 12, name: "*update", codename: "update", typeId: 14 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  await seedCard(s, { id: 15, name: "*anon", codename: "anonymous", typeId: 14 });
  await seedCard(s, { id: 16, name: "*read", codename: "read", typeId: 14 });
  await seedCard(s, { id: 17, name: "*all+*read", leftId: 10, rightId: 16, typeId: 14, dbContent: "[[Anyone]]" });
  await seedCard(s, { id: 18, name: "Anyone", codename: "anyone", typeId: 2 });
  await seedReference(s, 17, 18, "anyone");
  await seedCard(s, { id: 21, name: "*home", codename: "home", typeId: 14 });
  await seedCard(s, { id: 22, name: "Cardtype", codename: "cardtype", typeId: 2 });
  await seedCard(s, { id: 23, name: "Cardtype Probe Type", typeId: 22 });
  await seedCard(s, { id: 24, name: "Toggle", typeId: 2 });

  await seedCard(s, { id: 500, name: "Format Views Probe", dbContent: "probe body" });
  await seedCard(s, { id: 501, name: "Short Probe", dbContent: "1234567" });
  await seedCard(s, { id: 502, name: "Lines Probe", dbContent: "line1\nline2\nline3" });
  await seedCard(s, { id: 503, name: "Empty Probe", dbContent: "" });
  await seedCard(s, { id: 504, name: "Five Probe", dbContent: "12345" });
  await seedCard(s, { id: 505, name: "Nest Probe", dbContent: "before {{Nope Missing}} after" });
  await seedCard(s, {
    id: 506,
    name: "Text Probe",
    dbContent: "Caf&eacute; &amp; <b>bold</b> tail",
  });
  await seedCard(s, { id: 507, name: "Toggle Views Probe", typeId: 24, dbContent: "1" });
  await seedCard(s, { id: 508, name: "Configure Probe", typeId: 22 });

  const T0 = Date.parse("2026-09-28T06:00:00.000Z");
  let ticks = 0;
  const clock = () => new Date(T0 + ticks++ * 1000);
  const request = () =>
    new ActWriter({ driver: s.counting, actorId: 1, ipAddress: "127.0.0.1", now: clock });
  const probeState = async (cardId: number) =>
    cardFieldStateFromRow(
      (await s.counting.query("SELECT * FROM cards WHERE id = ?", [cardId])).rows[0]! as never,
    );
  const created = await request().createCard({
    name: "Conflict Probe",
    key: "conflict_probe",
    type_id: 2,
    db_content: "first body",
  });
  const conflictProbeId = created.cardId;
  const before = await probeState(conflictProbeId);
  await request().updateCard({
    cardId: conflictProbeId,
    before,
    after: { ...before, db_content: "second body" },
  });

  loader = new ModLoader([
    { manifest: cardModHistory },
    { manifest: cardModFormat },
  ]);
  loader.load();
  await loader.installInto(modEngineHost(s.engine, s.fetcher));
  bindModLoaderToEngine(storage, loader);
  s.fetcher.installNameEnvironment();
  await s.fetcher.codenames.ensureLoaded();
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

/** The capture's id/slot normalizations (the pinned suite's own). */
function normalize(html: string): string {
  return html
    .replace(/data-slot-id=(["'])[0-9a-fA-F]+\1/g, 'data-slot-id="RANDOMIZED"')
    .replace(/act-id-\d+/g, "act-id-N")
    .replace(/revision-\d+/g, "revision-N")
    .replace(/act_id=\d+/g, "act_id=N")
    .replace(/action_id=\d+/g, "action_id=N")
    .replace(/(new-current-revision-id">)\d+/g, "$1N")
    .replace(/data-card-id=(["'])\d+\1/g, 'data-card-id="N"')
    .replace(
      /(less than a minute|less than \d+ seconds|\d+ seconds?|about \d+ (hours?|days?|months?|years?)|\d+ (minutes?|hours?|days?|months?|years?)) ago/g,
      "TIME_AGO ago",
    );
}

const PROBE = "Format Views Probe";

describe("format remaining views — byte dump for the decision evidence", () => {
  it("dumps both engines' bytes for the captured views (env-gated)", async () => {
    if (!DUMP) {
      console.log("[byte dump] skipped: set DECKO_DUMP_FORMAT_VIEW_BYTES=1");
      return;
    }
    const FIXTURE = JSON.parse(
      (await import("node:fs")).readFileSync(
        fileURLToPath(new URL(FIXTURE_PATH, import.meta.url)),
        "utf8",
      ),
    ) as { rendered: Record<string, string> };
    const s = storage!;
    // [card, view, fixtureKey, pinnedInSuite]
    const checks: Array<[string, string, string, boolean]> = [
      [PROBE, "edit_link", PROBE + "#edit_link", true],
      [PROBE, "edit_button", PROBE + "#edit_button", true],
      [PROBE, "full_page_link", PROBE + "#full_page_link", true],
      [PROBE, "board_link", PROBE + "#board_link", true],
      [PROBE, "help_link", PROBE + "#help_link", true],
      [PROBE, "menu_block", PROBE + "#menu_block", true],
      [PROBE, "content_panel", PROBE + "#content_panel", true],
      [PROBE, "content_with_title", PROBE + "#content_with_title", true],
      ["Short Probe", "short_content", "Short Probe#short_content", true],
      ["Configure Probe", "configure_link", "Configure Probe#configure_link", true],
      // The three captures the pinned suite names but excludes from its
      // equality block, each for a named reason (see that suite's comment):
      // these are exactly the ACTUAL differences the decision evidence
      // enumerates, so their bytes are dumped too.
      ["Conflict Probe", "conflict", "Conflict Probe#conflict", false],
      [PROBE, "view_list", PROBE + "#view_list", false],
      ["*home", "home_url", "*home#home_url", false],
    ];
    const out: Record<string, { ruby: string; port: string; normalizedEqual: boolean }> = {};
    for (const [card, view, key] of checks) {
      const ruby = FIXTURE.rendered[key];
      if (ruby === undefined) throw new Error("fixture arm missing: " + key);
      const port = await s.engine.render(card, view);
      out[key] = { ruby, port, normalizedEqual: normalize(port) === normalize(ruby) };
    }
    mkdirSync(fileURLToPath(new URL("../../../tmp/format-view-bytes/", import.meta.url)), {
      recursive: true,
    });
    writeFileSync(
      fileURLToPath(new URL(OUT_PATH, import.meta.url)),
      JSON.stringify(out, null, 1),
    );
    expect(Object.keys(out).length).toBe(13);
  });
});
