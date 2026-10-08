// Pins for the relnames lane (2026-10-04): the view-lane BAR-slot context
// seat (census M1, view-lane-bar-slot-root-context-seat-pins.test.ts) fires on
// EVERY `view === "bar"` dispatch under a view-lane root, and the seat writes
// the format's WORKING context list (format.ts renderView), which is what
// RenderFormat#standardTitle relativizes the bar title against.
//
// GRADED-CORPUS LAW (own survey, an internal work log,
// the sha-verified expected-v2 view lane: 6,588 records / 3,686 surfaces):
//   RELATIVE card-title: 60 with name_context / 0 without.
//   ABSOLUTE card-title: 49 with name_context / 45,437 without.
// A relative bar title appears ONLY inside a slot that carries
// name_context. So the seat's firing condition IS the title's relativization
// condition, and a bar the corpus shows ctx-less must render its ABSOLUTE
// compound name.
//
// THE RUBY-SIDE CONDITION. The seat is FITTED to the census M1 shape — the
// pointer-list ITEM bar (tmp/serializer-followup/probe-green5
// expected--Guns__open.html: the Guns+rifles / Guns+pistols / Standards item
// bars of a List host). Its own grounding note names the exclusion directly:
// "the 0.20 walk has NO context seat on the accordion :open chain (bar.rb:40
// build_accordion_bar -> wrap; the only cold add_name_context sites are the
// titled naming, frames, the edit views, nest_editor, rss)"
// (format.ts#viewLaneBarSeatParts doc block). The set card's Rules section
// bars ARE that accordion chain — set/type/set/html_views.rb:6-11 `view
// :core` -> filtered_rule_list(:accordion_bar_list) -> rule_lists.rb, reached
// in the port through renderCategoryAccordion -> renderSettingListItems ->
// fmt.nestRecord(rule, "bar", ...), NOT through renderPointerListItem.
//
// Pin 1 (RED against the pre-fix engine): on the *input type+*right set
// card's :content walk the *default rule bar renders the ABSOLUTE compound
// name and carries NO name_context, where the pre-fix engine emitted
// title="+*default" and `name_context:"*input_type,*right"`.
// Pin 2 (BLAST RADIUS): the pointer-list item bar renders ctx-less with an
// absolute title too (the fitted seat was removed on 2026-10-06; see the pin).
//
// Oracles: the committed fixture (fixtures/test-corpus/
// test-corpus-shard-000000.jsonl entry 268, `views.content`) carries
// title="*input type+*right+*default" ctx-less; the graded view-lane capture
// (expected-v2 recapture-raw-shard-000000.jsonl:268) carries the SAME
// absolute title on that bar (its ctx there is "*default", a context the
// name does not start with, so title_in_context's `from` returns the name
// unchanged — contextual.rb:46-51/50). Both oracles agree the *default bar is
// absolute; the engine was the outlier.

import { describe, it, expect, afterAll } from "vitest";
import Database from "better-sqlite3";
import {
  CORPUS_DB,
  createCorpusSeededStorage,
  readShardLines,
  type ShardLine,
} from "./permission-corpus-seeding.js";
import { installHelpRules } from "../../../src/card/render/help-popover.js";
import type { RenderTestStorage } from "./render-test-storage.js";

const SET_CARD_ID = 268;
const SET_CARD_NAME = "*input type+*right";

let storage: RenderTestStorage | undefined;
afterAll(() => {
  storage?.close();
});

/** The parity suite's own seeding walk, reduced to the one set card: the id
 *  closure over (id, left_id, right_id, type_id) plus the help-rule universe
 *  and the codenames the engine needs. Same walk the closure proof uses, so
 *  the two suites render the identical bytes. */
async function seedSetCardWalk(): Promise<RenderTestStorage> {
  const ids = new Set<number>([SET_CARD_ID]);
  const corpus = new Database(CORPUS_DB, { readonly: true });
  try {
    const setTypeId = (corpus
      .prepare(`SELECT id FROM cards WHERE codename='set' AND trash=0`)
      .get() as { id: number } | undefined)?.id;
    const settingTypeId = (corpus
      .prepare(`SELECT id FROM cards WHERE codename='setting' AND trash=0`)
      .get() as { id: number } | undefined)?.id;
    if (setTypeId === undefined || settingTypeId === undefined) {
      throw new Error("corpus deck missing set/setting codename cards");
    }
    const queue: number[] = [SET_CARD_ID];
    const visited = new Set<number>([SET_CARD_ID]);
    while (queue.length > 0) {
      const id = queue.shift() as number;
      const rows = corpus
        .prepare(
          `SELECT id, left_id, right_id, type_id FROM cards WHERE (id=? OR left_id=?) AND trash=0`,
        )
        .all(id, id) as Array<{ id: number; left_id: number | null; right_id: number | null; type_id: number }>;
      for (const r of rows) {
        for (const side of [r.id, r.left_id, r.right_id, r.type_id]) {
          if (side !== null && !visited.has(side)) {
            visited.add(side);
            ids.add(side);
            queue.push(side);
          }
        }
      }
    }
    const helpRules = corpus
      .prepare(
        `SELECT r.id, r.left_id, r.right_id, r.type_id FROM cards r
         JOIN cards sets ON r.left_id = sets.id
         JOIN cards settings ON r.right_id = settings.id
         WHERE sets.type_id = ? AND settings.type_id = ?
           AND settings.codename = 'help' AND r.trash = 0
           AND sets.trash = 0 AND settings.trash = 0`,
      )
      .all(setTypeId, settingTypeId) as Array<{ id: number; left_id: number | null; right_id: number | null; type_id: number }>;
    for (const r of helpRules) {
      ids.add(r.id);
      const queue2: number[] = [r.left_id, r.right_id, r.type_id].filter((x): x is number => x !== null);
      const visited2 = new Set<number>(queue2);
      while (queue2.length > 0) {
        const id = queue2.shift() as number;
        const rows = corpus
          .prepare(
            `SELECT id, left_id, right_id, type_id FROM cards WHERE (id=? OR left_id=?) AND trash=0`,
          )
          .all(id, id) as Array<{ id: number; left_id: number | null; right_id: number | null; type_id: number }>;
        for (const row of rows) {
          for (const side of [row.id, row.left_id, row.right_id, row.type_id]) {
            if (side !== null && !visited2.has(side)) {
              visited2.add(side);
              ids.add(side);
              queue2.push(side);
            }
          }
        }
      }
    }
    for (const cn of ["anyone", "anyone_signed_in", "anonymous", "read", "set", "setting", "help", "input_type"]) {
      const row = corpus.prepare(`SELECT id FROM cards WHERE codename=? AND trash=0`).get(cn) as
        | { id: number }
        | undefined;
      if (row !== undefined) ids.add(row.id);
    }
  } finally {
    corpus.close();
  }
  return createCorpusSeededStorage(ids);
}

/** The fixture's own recorded name for the set card, read back from the
 *  committed shard so the pin cannot drift from the oracle it cites. */
function fixtureSetCardName(): string {
  const lines: ShardLine[] = readShardLines();
  const line = lines.find((l) => l.id === SET_CARD_ID);
  if (line === undefined) throw new Error(`shard-000000.jsonl missing id ${SET_CARD_ID}`);
  return line.name;
}

describe("relnames: the view-lane bar context seat is scoped to pointer-list item bars", () => {
  it("the set card's accordion rule bar renders the ABSOLUTE compound name, ctx-less", { timeout: 600_000 }, async () => {
    expect(fixtureSetCardName()).toBe(SET_CARD_NAME);
    storage = await seedSetCardWalk();
    const helpResolver = installHelpRules(storage.engine, storage.fetcher);
    await helpResolver.prepare();
    const html = await storage.engine.render(SET_CARD_NAME, "content");

    // The *default rule bar is present (sanity: the walk reached the rules).
    const barAt = html.indexOf('id="Xinput_type-Xright-Xdefault-bar-view"');
    expect(barAt).toBeGreaterThan(-1);
    const barRegion = html.slice(barAt, barAt + 1600);

    // THE PIN. Fixture entry 268 and the graded view-lane capture both carry
    // the absolute compound name on this bar; the pre-fix engine emitted the
    // relativized "+*default" (2.6-2.8KB shorter per surface across the 11
    // parity surfaces).
    expect(barRegion).toContain('title="*input type+*right+*default"');
    expect(barRegion).not.toContain('title="+*default"');
    // And the seat must not fire, so the slot JSON carries no name_context.
    expect(barRegion).not.toContain("&quot;name_context&quot;");

    // No bar anywhere in this accordion walk relativizes: the graded law is
    // relative-implies-ctx, and this walk is ctx-less throughout.
    const relativeTitles = [...html.matchAll(/<span class="card-title" title="(\+[^"]*)"/g)].map(
      (m) => m[1] ?? "",
    );
    expect(relativeTitles).toEqual([]);
  });

  it("BLAST RADIUS: the pointer-list item bar renders ctx-less with an absolute title", async () => {
    // CORPUS-OF-RECORD CORRECTION (2026-10-06): the fitted view-lane seat
    // is removed. The corpus of record carries name_context on no
    // view-lane pointer-item bar (Guns:open reads title="Guns+rifles"), so
    // the item bar now matches the set card's rule bars: ctx-less, absolute.
    // The census M1 shape this seat exists for (Guns:open): the ROOT card is
    // itself the List host whose item names extend the root part.
    // renderPointerListItem's bar arm.
    //
    // SEATFIX CORRECTION (2026-10-04, lane-seatfix-2026-10-04): this test
    // previously rendered "Weapons+articles" (the +articles child) as the
    // view root — a junction HOST card whose items share only the host's
    // first part. The graded corpus pins that shape ctx-LESS (the tags/+Pages
    // class — the 71 grade-10 name_context regressions the seatfix gate
    // fixes); the corpus seats item bars under single-part roots the item
    // extends (Guns/Wikirate/Work Week) or on rule-part divergence
    // (democracy+*referred_to_by), measured over all 2,547 bar-view
    // pointer-item slots in the 48 view shards. Updated to the graded
    // root-as-host shape; the seat's fitted behavior on that shape is
    // unchanged.
    const s = await (async () => {
      const { createRenderTestStorage, seedCard } = await import("./render-test-storage.js");
      const store = await createRenderTestStorage();
      await seedCard(store, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
      await seedCard(store, { id: 3, name: "List", codename: "list", typeId: 2 });
      await seedCard(store, { id: 4, name: "RichText", codename: "rich_text", typeId: 2 });
      await seedCard(store, {
        id: 20,
        name: "Weapons",
        typeId: 3,
        dbContent: "Weapons+rifles\nStandards\n",
      });
      await seedCard(store, { id: 21, name: "Articles", typeId: 2 });
      await seedCard(store, { id: 22, name: "Rifles", typeId: 2 });
      await seedCard(store, { id: 24, name: "Standards", typeId: 2 });
      await seedCard(store, { id: 31, leftId: 20, rightId: 22, typeId: 4 });
      return store;
    })();
    try {
      const html = await s.engine.render("Weapons", "open");
      expect(html).not.toContain("&quot;name_context&quot;:&quot;weapon&quot;");
      expect(html).toContain('title="Weapons+Rifles"');
      // The part filter still keeps a bar whose name lacks the root part
      // ctx-less (the census control) — unchanged by this lane.
      const standardsAt = html.indexOf('id="standard-bar-view"');
      expect(standardsAt).toBeGreaterThan(-1);
      expect(html.slice(standardsAt, standardsAt + 1200)).not.toContain("&quot;name_context&quot;");
    } finally {
      s.close();
    }
  });
});
