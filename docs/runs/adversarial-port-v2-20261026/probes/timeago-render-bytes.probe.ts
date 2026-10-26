// timeago-render-bytes.probe.ts - the adversarial port attack v2 probe for
// the timeago plural claim, in the RENDERED BYTES.
//
// It renders the board's creator credit (the box_bottom view: the surface
// the timeago receipt names) for a card whose created_at sits in each band
// the English plural rule distinguishes, and reads the bytes the page
// carries. The seed set is the format-remaining-views bytes-dump suite's own
// (the same deck shape), so the rendered page is the one the recorded Ruby
// renders were captured from.
//
//   npx vitest run --config docs/runs/adversarial-port-v2-20261026/probes/vitest.probe.config.ts
//
// The probe file is named .probe.ts, not .test.ts, so the project's own
// vitest include pattern (which collects every *.test.ts in the tree) does
// not pick it up: only the scratch config below collects it.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  bindModLoaderToEngine,
  type RenderTestStorage,
} from "../../../../tests/card/render/render-test-storage.js";
import { ModLoader, modEngineHost } from "../../../../src/card/mod-loader.js";
import { ActWriter, cardFieldStateFromRow } from "../../../../src/card/history/write-path.js";
import cardModHistory from "../../../../src/card/mod-loader/mods/card-mod-history.js";
import cardModFormat from "../../../../src/card/mod-loader/mods/card-mod-format.js";

const REPO = fileURLToPath(new URL("../../../../", import.meta.url));
const OUT = join(REPO, "tmp", "attack2-20261026", "timeago-render-bytes.json");

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
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
  await seedCard(s, { id: 506, name: "Text Probe", dbContent: "Caf&eacute; &amp; <b>bold</b> tail" });
  await seedCard(s, { id: 507, name: "Toggle Views Probe", typeId: 24, dbContent: "1" });
  await seedCard(s, { id: 508, name: "Configure Probe", typeId: 22 });

  const T0 = Date.parse("2026-09-28T06:00:00.000Z");
  let ticks = 0;
  const clock = () => new Date(T0 + ticks++ * 1000);
  const request = () => new ActWriter({ driver: s.counting, actorId: 1, ipAddress: "127.0.0.1", now: clock });
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
}, 120_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

const PROBE = "Format Views Probe";

// The ages under test, as a day count back from the render clock. The bands
// come from the pinned actionview locale (en.yml, the one: leaves) and the
// date_helper bands the timeago receipt names.
const AGES = [
  { label: "0 days (less than a minute)", days: 0 },
  { label: "1 day (x_days, count 1)", days: 1 },
  { label: "2 days (x_days, count 2)", days: 2 },
  { label: "35 days (about_x_months, count rounds to 1)", days: 35 },
  { label: "60 days (x_months, count 2)", days: 60 },
  { label: "330 days (the year band)", days: 330 },
  { label: "366 days (the year band, a leap year)", days: 366 },
  { label: "500 days (over 1 year)", days: 500 },
  { label: "1000 days (over 1 year)", days: 1000 },
];

describe("the rendered bytes of the creator credit, every relative-time band", () => {
  it("carries the singular form for every count of one", async () => {
    const s = storage!;
    // Warm the lexicon with the creator card, the way the dump suite's own render order does.
    await s.engine.render("Decko Bot", "content");
    const cases: unknown[] = [];
    for (const age of AGES) {
      const when = new Date(Date.now() - age.days * 86400 * 1000)
        .toISOString()
        .replace("T", " ")
        .slice(0, 19);
      await s.counting.query("UPDATE cards SET created_at = ?, updated_at = ? WHERE name = ?", [when, when, PROBE]);
      const html = await s.engine.render(PROBE, "box_bottom");

      const credit = html.match(/<div class="text-muted creator-credit">([\s\S]*?)<\/div>/);
      const phrases = [...new Set([...html.matchAll(/[^<>]{0,40}\bago\b[^<>]{0,12}/g)].map((m) => m[0].trim()))];
      cases.push({
        label: age.label,
        days: age.days,
        createdAt: when,
        bytes: html.length,
        creatorCredit: credit ? credit[0] : null,
        agoPhrases: phrases.slice(0, 8),
        hasPluralOfOne: /(?<![a-z])(about|over|almost|1) 1 (month|year|day|hour|minute)s\b/.test(html),
      });
    }
    mkdirSync(join(REPO, "tmp", "attack2-20261026"), { recursive: true });
    writeFileSync(OUT, JSON.stringify(cases, null, 2) + "\n");
    for (const c of cases as Array<Record<string, unknown>>) {
      console.log(`${String(c.label).padEnd(48)} ${String(c.creatorCredit)}`);
    }
    // No rendered band may carry a plural of one.
    expect((cases as Array<Record<string, unknown>>).filter((c) => c.hasPluralOfOne)).toEqual([]);
  }, 120_000);
});
