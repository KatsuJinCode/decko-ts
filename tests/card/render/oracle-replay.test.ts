// Oracle replay registration for the render-engine area: replays every
// captured rendered-view entry in fixtures/captured/smoke.json (20 entries:
// :open/:closed/:content/:title per card + the unknown-view sentinel) through
// the RenderEngine against a seeded SQLite deck, byte-diffing TS output
// against Ruby truth. Handler contract: docs/parity-method.md
// ("render-engine ... success: renderBytes(html) / raise: raisedError").
//
// Slot-id normalization is the harness's job (both sides, strict 20-hex);
// this renderer's job is Ruby-shaped HTML: same classes, same structure,
// same slot markup with a 20-hex id.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_FIXTURE_PATHS,
  HandlerRegistry,
  collectReplayEntries,
  formatReplayFailure,
  raisedError,
  renderBytes,
  replayEntries,
} from "../../../src/testing/replay.js";
import { loadFixtureFile } from "../../../src/testing/fixture-schema.js";
import { UnsupportedViewError } from "../../../src/card/render.js";
import { createRenderTestStorage, seedCard, type RenderTestStorage } from "./render-test-storage.js";

/** Seed the captured deck exactly as the fetch stream's replay does (the
 *  captured ids/contents; junction part cards for the lexicon; the cardtype
 *  cards whose names the capture's `type` field records).
 *
 *  Every captured row carries its STORED read rule, as a real deck does: Ruby
 *  stamps `cards.read_rule_id` on save (the set_read_rule store event,
 *  card-mod-permissions set/all/permissions.rb:1-5). It is load-bearing here
 *  for the search: the CQL engine filters every result row by
 *  `read_rule_id IN (the viewer's readable rules)` (card-1.110.0
 *  set/all/permissions.rb Where#permission_conditions, ported at
 *  src/cql/sql.ts:277-306), so an unstamped row is filtered out for every
 *  viewer and Oracle Search renders no_search_results instead of the
 *  captured card_list. The two `Oracle Restricted` rows carry their OWN
 *  rule (`Oracle Restricted+*self+*read`, granted to Administrator), which is
 *  what the capture shows as a denial for the anonymous viewer. */
async function seedCapturedDeck(storage: RenderTestStorage): Promise<void> {
  const CATCH_ALL = storage.bootstrapRule;
  if (CATCH_ALL === undefined) {
    throw new Error("oracle-replay: the stock read substrate's *all+*read rule is required");
  }
  const readable = { readRuleId: CATCH_ALL, readRuleClass: "*all" };
  // cardtype cards (1.110 renamed Basic -> RichText; type_code :basic)
  await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
  await seedCard(storage, { id: 98, name: "Search", codename: "search_type", typeId: 2 });
  await seedCard(storage, { id: 6, name: "Set", codename: "set", typeId: 2 });
  await seedCard(storage, { id: 7, name: "List", codename: "list", typeId: 2 });
  // The Setting TYPE card: Ruby's stock seed types `*read` with it (a
  // setting card is a Setting), and the read substrate this deck layers
  // over is what grants the anonymous viewer every card below. `*read`
  // takes the `read` codename with its typeId, so this deck's `*read` IS
  // the deck's read setting (it displaces the stock one, repointing the
  // stock `*all+*read` rule onto it — see render-test-storage.ts seedCard).
  await seedCard(storage, { id: 8, name: "Setting", codename: "setting", typeId: 2 });
  // junction part cards
  await seedCard(storage, { id: 701, name: "child_one", typeId: 2 });
  await seedCard(storage, { id: 702, name: "child_two", typeId: 2 });
  await seedCard(storage, { id: 703, name: "rich_child", typeId: 2 });
  await seedCard(storage, { id: 704, name: "*self", typeId: 6 });
  await seedCard(storage, { id: 705, name: "*read", codename: "read", typeId: 8 });
  // the captured cards (ids/contents from smoke.json)
  await seedCard(storage, { id: 605, name: "Oracle Basics", typeId: 2, dbContent: "A plain basic card for oracle capture.", ...readable });
  await seedCard(storage, { id: 606, name: "Oracle Junction", typeId: 2, dbContent: "Junction parent card.", ...readable });
  await seedCard(storage, { id: 608, name: "Oracle Junction+child_one", leftId: 606, rightId: 701, typeId: 2, dbContent: "first child", ...readable });
  await seedCard(storage, { id: 610, name: "Oracle Junction+child_two", leftId: 606, rightId: 702, typeId: 2, dbContent: "second child", ...readable });
  await seedCard(storage, {
    id: 611,
    name: "Oracle Rich",
    typeId: 2,
    dbContent: "<p>Rich text with an inclusion: {{Oracle Rich+rich_child}}</p>",
    ...readable,
  });
  await seedCard(storage, { id: 613, name: "Oracle Rich+rich_child", leftId: 611, rightId: 703, typeId: 2, dbContent: "the nested child body", ...readable });
  await seedCard(storage, { id: 614, name: "Oracle Search", typeId: 98, dbContent: '{"left":"Oracle Junction","sort":"name"}', ...readable });
  // The restricted pair: `Oracle Restricted+*self+*read` is the winning read
  // rule for the card and for its `+*self` child (permission_rule_id walks
  // the candidates in precedence order and this is the only one present), and
  // it grants Administrator — a party the anonymous viewer is not. Both rows
  // therefore carry it, which is the stored-rule half of the denial the
  // capture pins.
  const restricted = { readRuleId: 617, readRuleClass: "*self" };
  await seedCard(storage, { id: 615, name: "Oracle Restricted", typeId: 2, dbContent: "Only administrators can read me.", ...restricted });
  await seedCard(storage, { id: 616, name: "Oracle Restricted+*self", leftId: 615, rightId: 704, typeId: 6, dbContent: "", ...restricted });
  await seedCard(storage, { id: 617, name: "Oracle Restricted+*self+*read", leftId: 616, rightId: 705, typeId: 7, dbContent: "Administrator", ...readable });
}

describe("oracle replay: render-engine (card renderer)", () => {
  it("replays the captured smoke rendered views byte-exactly", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedCapturedDeck(storage);

      const registry = new HandlerRegistry();
      registry.register("render-engine", async ({ cardName, view }) => {
        try {
          const html = await storage.engine.render(cardName, view);
          return renderBytes(html);
        } catch (error) {
          if (error instanceof UnsupportedViewError) {
            // render.rb#view_method raises Card::Error::UserError; the
            // capture recorded the en.yml message verbatim.
            return raisedError("Card::Error::UserError", error.message);
          }
          throw error;
        }
      });

      const fixtures = DEFAULT_FIXTURE_PATHS.map(loadFixtureFile);
      const report = await replayEntries(collectReplayEntries(fixtures), registry);

      const renderEntries = report.entries.filter((entry) => entry.area === "render-engine");
      expect(renderEntries.length).toBe(20);
      const failures = renderEntries.filter((entry) => entry.status !== "pass");
      expect(failures.map(formatReplayFailure)).toEqual([]);
    } finally {
      storage.close();
    }
  });
});
