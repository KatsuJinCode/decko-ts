// card-mod-history's act_legend / last_action / change views
// (surfaces-batch3 — the R18/D4 ladder batch-2 named as its remainder).
//
//   - views.rb:15-23 :act_legend — the bs_layout legend row; the bytes are
//     ORACLE-PINNED against the legend row inside the LIVE capture's
//     probe#history render (fixtures/captured/history-views.json) — the
//     registrar note's "the ORACLE truth could be captured from any history
//     page's legend bytes", already on disk.
//   - views.rb:46-53 :last_action — the last-update span (verb + acted_at
//     time_ago + the actor :link nest). GEM-SOURCE-DERIVED
//     (RENDERED-UNPINNED — no capture shard renders the name), the same
//     disclosed basis as batch-2's :last_action_verb.
//   - views.rb:36-43 :change — voo.show :title_link, voo.hide :menu, the
//     default slot wrap around [title, menu, last_action].
//
// The act family is built through the REAL write path (ActWriter), the same
// shape card-mod-history-views.test.ts uses, so cardLastAct and the actor
// rows are real rows.
//
// board_act stays the mod's one named unported view (the board act renderer
// + overlay chain).

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { UnsupportedViewError } from "../../../src/card/render/format.js";
import { ModLoader, modEngineHost } from "../../../src/card/mod-loader.js";
import cardModHistory from "../../../src/card/mod-loader/mods/card-mod-history.js";
import { ActWriter } from "../../../src/card/history/write-path.js";

const FIXTURE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../fixtures/captured/history-views.json", import.meta.url)),
    "utf8",
  ),
) as { rendered: Record<string, string> };

/** The captured legend row: probe#history's `<div class="row pb-3">` block
 *  (act_legend's bs_layout expansion — action_legend + content_legend). */
function capturedLegendRow(): string {
  const history = FIXTURE.rendered["probe#history"];
  const start = history.indexOf('<div class="row pb-3">');
  const endMarker = "Subtractions</del></small></div></div>";
  const end = history.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error("legend row not found in capture");
  return history.slice(start, end + endMarker.length);
}

function normalize(html: string): string {
  return html
    .replace(/data-slot-id=(["'])[0-9a-fA-F]+\1/g, 'data-slot-id="RANDOMIZED"')
    .replace(/data-card-id=(["'])\d+\1/g, 'data-card-id="N"')
    .replace(
      /(less than a minute|less than \d+ seconds|\d+ seconds?|about \d+ (hours?|days?|months?|years?)|\d+ (minutes?|hours?|days?|months?|years?)) ago/g,
      "TIME_AGO ago",
    );
}

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;
let probeName = "Ladder Probe";

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  await seedCard(s, { id: 1, name: "Decko Bot", typeId: 2 }); // the acts' actor
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

  // the two-act family through the REAL write path: create + content update
  // (so cardLastAct is an UPDATE act -> the :edited anchor arm)
  const T0 = Date.parse("2026-09-28T06:00:00.000Z");
  let ticks = 0;
  const clock = () => new Date(T0 + ticks++ * 1000);
  const request = () =>
    new ActWriter({ driver: s.counting, actorId: 1, ipAddress: "127.0.0.1", now: clock });

  const created = await request().createCard({
    name: "Ladder Probe",
    key: "ladder_probe",
    type_id: 2,
    db_content: "first body",
  });
  const state = async () =>
    (await s.counting.query("SELECT * FROM cards WHERE id = ?", [created.cardId])).rows[0]!;
  let before = await state();
  const { cardFieldStateFromRow } = await import("../../../src/card/history/write-path.js");
  const beforeState = cardFieldStateFromRow(before as never);
  await request().updateCard({
    cardId: created.cardId,
    before: beforeState,
    after: { ...beforeState, db_content: "second body" },
  });

}, 60_000);

/** Install the mod loader (per WITH-test — the WITHOUT test must run on the
 *  bare engine, so the install cannot live in beforeAll). Idempotent per
 *  test: each WITH test re-installs on its own engine instance. */
async function installLoader(): Promise<void> {
  const s = storage!;
  loader = new ModLoader([{ manifest: cardModHistory }]);
  loader.load();
  await loader.installInto(modEngineHost(s.engine, s.fetcher));
  s.fetcher.installNameEnvironment();
  await s.fetcher.codenames.ensureLoaded();
}

afterAll(() => {
  loader?.reset();
  storage?.close();
});

describe("card-mod-history ladder views (act_legend / last_action / change)", () => {
  it("WITHOUT the mod: all three views raise UnsupportedViewError", async () => {
    const s = storage!;
    for (const view of ["act_legend", "last_action", "change"]) {
      await expect(s.engine.render(probeName, view)).rejects.toThrow(
        UnsupportedViewError,
      );
    }
  });

  it("WITH the mod: :act_legend matches the captured legend row byte-for-byte", async () => {
    const s = storage!;
    await installLoader();
    const mine = normalize(await s.engine.render(probeName, "act_legend"));
    expect(mine).toBe(normalize(capturedLegendRow()));
  });

  it("WITH the mod: :last_action renders the last-update span (views.rb:46-53)", async () => {
    const s = storage!;
    await installLoader();
    const html = normalize(await s.engine.render(probeName, "last_action"));
    // the %() literal's shape: leading newline + 6-space indent, the verb
    // anchor (the update act's :edited arm), the time_ago + "ago by", the
    // actor :link nest (Decko Bot's known-card anchor), the closing indent.
    expect(html).toBe(
      '\n      <span class="last-update">\n        ' +
        '<a class="last-edited slotter" rel="nofollow" href="/Ladder_Probe?view=history" data-remote="true">edited</a>' +
        " TIME_AGO ago by\n        " +
        '<a class="known-card" href="/Decko_Bot">Decko Bot</a>\n      </span>\n    ',
    );
  });

  it("WITH the mod: :change wraps title + (hidden) menu + last_action (views.rb:36-43)", async () => {
    const s = storage!;
    await installLoader();
    const html = normalize(await s.engine.render(probeName, "change"));
    // the default slot wrap (wrap.rb:6-9 slot=true): id <safe-key>-change-view
    expect(html).toContain('id="ladder_probe-change-view"');
    // title_link SHOWN: the title renders as the known-card link
    expect(html).toContain('<a class="known-card" href="/Ladder_Probe">');
    // menu HIDDEN: no card-menu div anywhere in the wrap
    expect(html).not.toContain("card-menu");
    // the last_action composition rides inside
    expect(html).toContain('<span class="last-update">');
  });

  it("REGRESSION: :history still carries the same legend row (the composition is shared)", async () => {
    const s = storage!;
    await installLoader();
    const html = normalize(await s.engine.render(probeName, "history"));
    expect(html).toContain(normalize(capturedLegendRow()));
  });
});
