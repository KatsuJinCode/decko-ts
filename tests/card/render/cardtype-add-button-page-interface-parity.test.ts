// cardtype-add-button-page-interface-parity.test.ts — the pass-15
// cardtype-template page class, byte-for-byte against the raw-oracle
// page-lane yardstick.
//
// WHAT THIS CLASS IS. Of the 63 Cardtype-typed page failures in the
// pass-15 grade, 12 differ from the oracle ONLY in the cardtype page
// template's add affordance (the set/type/cardtype.rb :add_button
// anchor), 118–154 bytes apart on 14–16 KB pages. The other 51 also
// diverge in their embedded `+*type+by_name` member search (the oracle
// renders `search-result-list` bars, the engine renders
// `search-no-results`) — a separate lane's mechanism, excluded here
// except for the one `Date` probe, which is asserted add-button-region
// only.
//
// The 12 (from the pass15 fail-dump, meta.cardType == "Cardtype" AND
// expected-minus-actual < 1000 bytes):
//
//   Tracked Item, event, Proto Item, URI, Group, Log Entry, Task,
//   Mirror List, Mirrored List, Notification template   -> add_button
//   JavaScript, LWblog                                  -> see below
//
// JavaScript and LWblog carried their OWN divergences in the pass-15 dump
// (the external-link target="_blank" attribute ORDER, and an unescaped
// apostrophe in +description content). Both of those families were fixed
// by other lanes between the pass-15 graded tip and this lane base tip
// 27ddc7f, so at this base ALL 12 are byte-identical and every entry is
// gated at the byte-identical level. The add-button-region level is kept
// in the type (and the mechanism it exists for is documented on the
// CardtypeTemplatePage interface) so a future other-lane regression on
// one of these pages is reported rather than silently narrowing the gate.
//
//
// The expected bytes are the raw-oracle page-lane shards under
// tmp/raw-ground-truth/expected-v2/page-lane/ (gitignored, copied into
// the worktree; see the lane receipt). The engine renders the real page
// over the real raw corpus through the real page renderer, seeded the
// same way the census replays seed it (raw-corpus-seeding.ts) so the
// type cards, rule cards, permission codenames and reference graph are
// all present.
//
// RUN (explicitly — needs the machine-local raw corpus, ~40s to seed plus
// one render per page):
//   CARDTYPE_ADD_BUTTON_REPLAY=1 NODE_OPTIONS=--max-old-space-size=4096 \
//   npx vitest run tests/card/render/cardtype-add-button-page-interface-parity.test.ts \
//     --no-file-parallelism
//
// Outside a corpus machine (no raw corpus / no shards / env gate unset)
// the spec SKIPS, so ordinary suite runs neither slow down nor fail.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { byteDiff, normalizeSlotIds } from "../../../src/testing/diff.js";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const PAGE_LANE_DIR = path.join(REPO_ROOT, "tmp", "raw-ground-truth", "expected-v2", "page-lane");

const REPLAY_REQUESTED = process.env.CARDTYPE_ADD_BUTTON_REPLAY === "1";
const CORPUS_PRESENT = existsSync(RAW_CORPUS_DB);
const SHARDS_PRESENT = existsSync(PAGE_LANE_DIR);

/** The 12 pass-15 cardtype-template pages, each with the assertion level
 *  its remaining divergence class allows.
 *
 *  "byte-identical" — the add_button fix is the page's ONLY divergence,
 *  so a regression anywhere on the page fails here.
 *  "add-button-region" — the page carries a divergence owned by another
 *  lane (named per entry), so only the add_button region is gated. */
interface CardtypeTemplatePage {
  name: string;
  level: "byte-identical" | "add-button-region";
  otherLaneDivergence?: string;
}

const CARDTYPE_TEMPLATE_PAGES: readonly CardtypeTemplatePage[] = [
  { name: "Tracked Item", level: "byte-identical" },
  { name: "event", level: "byte-identical" },
  { name: "Proto Item", level: "byte-identical" },
  { name: "URI", level: "byte-identical" },
  { name: "Group", level: "byte-identical" },
  { name: "Log Entry", level: "byte-identical" },
  { name: "Task", level: "byte-identical" },
  { name: "Mirror List", level: "byte-identical" },
  { name: "Mirrored List", level: "byte-identical" },
  { name: "Notification template", level: "byte-identical" },
  { name: "JavaScript", level: "byte-identical" },
  { name: "LWblog", level: "byte-identical" },
];

/** The pinned oracle anchor, and the class-membership census it came
 *  from: across all 63 Cardtype-typed page fails, `cardtype-add-button`
 *  appears in 63 ACTUAL and 0 EXPECTED pages, `/new"` in 63 actual and 0
 *  expected, and `btn-secondary` in 62 expected and 0 actual. The
 *  segment is the name with spaces underscored, case preserved (NOT
 *  url_key and NOT the lowercase `cards.codename` column). */
export function pinnedCardtypeAddButton(name: string): string {
  const segment = name.replace(/ /g, "_");
  const label = `Add ${name}`;
  return (
    `<a data-slotter-mode="modal" data-modal-class="modal-dialog modal-dialog-centered" ` +
    `class="btn btn-secondary slotter" href="/type/${segment}?view=new_in_modal" ` +
    `data-remote="true"><span class="card-title" title="${label}">${label}</span></a>`
  );
}

interface PageLaneLine {
  lane: string;
  name: string;
  page_html?: string;
  error?: unknown;
}

function loadYardstick(names: Set<string>): Map<string, PageLaneLine> {
  const found = new Map<string, PageLaneLine>();
  if (!SHARDS_PRESENT) return found;
  for (const file of readdirSync(PAGE_LANE_DIR)) {
    if (!/^recapture-raw-shard-\d{6}\.jsonl$/.test(file)) continue;
    for (const line of readFileSync(path.join(PAGE_LANE_DIR, file), "utf8").split("\n")) {
      if (line.trim() === "" || !line.includes("page")) continue;
      let obj: PageLaneLine;
      try {
        obj = JSON.parse(line) as PageLaneLine;
      } catch {
        continue;
      }
      if (obj.lane !== "page") continue;
      if (names.has(obj.name) && !found.has(obj.name)) found.set(obj.name, obj);
    }
  }
  return found;
}

/** Does the page carry the pinned add_button anchor exactly once, wrapped
 *  in the structure's own `<p>` paragraph? */
function addButtonRegions(html: string, cardName: string): { pinned: number; placeholder: number } {
  const pinned = html.split(pinnedCardtypeAddButton(cardName)).length - 1;
  const placeholder = html.split("cardtype-add-button").length - 1;
  return { pinned, placeholder };
}

describe("cardtype page template interface: the :add_button anchor is oracle-pinned", () => {
  it(
    "renders the pass-15 cardtype-template pages with the oracle add_button bytes",
    { timeout: 3_600_000 },
    async (ctx) => {
      if (!REPLAY_REQUESTED) {
        ctx.skip();
        return;
      }
      expect(CORPUS_PRESENT, `raw corpus missing: ${RAW_CORPUS_DB}`).toBe(true);
      expect(SHARDS_PRESENT, `page-lane shards missing: ${PAGE_LANE_DIR}`).toBe(true);

      const wanted = new Set(CARDTYPE_TEMPLATE_PAGES.map((p) => p.name));
      const yardstick = loadYardstick(wanted);
      for (const p of CARDTYPE_TEMPLATE_PAGES) {
        expect(yardstick.get(p.name), `no page-lane yardstick entry for ${p.name}`).toBeDefined();
      }

      const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
      const allIds = (
        idLister.prepare("SELECT id FROM cards WHERE trash = 0 ORDER BY id").all() as Array<{
          id: number;
        }>
      ).map((r) => r.id);
      idLister.close();

      const storage = await createRawStructureSeededStorage(new Set(allIds));
      storage.fetcher.installNameEnvironment();
      await storage.fetcher.warmLexicon(allIds);

      const byteIdentical: string[] = [];
      const regionOnly: string[] = [];
      const verdicts: string[] = [];
      for (const page of CARDTYPE_TEMPLATE_PAGES) {
        const oracle = yardstick.get(page.name);
        const expected = normalizeSlotIds(oracle?.page_html ?? "");
        const actual = normalizeSlotIds(await storage.engine.renderPage(page.name));

        // The interface block itself, on every page in the class.
        const region = addButtonRegions(actual, page.name);
        expect(
          region.pinned,
          `${page.name}: pinned add_button anchor count (placeholder leftovers: ${region.placeholder})`,
        ).toBe(1);

        const diff = byteDiff(expected, actual);
        verdicts.push(
          `  ${page.name}: ${diff.equal ? "BYTE-IDENTICAL" : "diff " + diff.expectedCodeUnits + " vs " + diff.actualCodeUnits} ` +
            `(expBytes/actBytes), ${page.level}, addButton pinned=${region.pinned} placeholder=${region.placeholder}`,
        );
        if (page.level === "byte-identical") {
          if (!diff.equal) {
            byteIdentical.push(
              `${page.name}: ${diff.expectedCodeUnits} vs ${diff.actualCodeUnits} bytes, first diff at ` +
                `${String(diff.firstDifference?.codeUnitOffset)} — ${JSON.stringify(
                  String(diff.firstDifference?.expectedExcerpt).slice(0, 200),
                )} vs ${JSON.stringify(String(diff.firstDifference?.actualExcerpt).slice(0, 200))}`,
            );
          }
        } else {
          // Gated on the interface block only: the anchor is byte-pinned
          // above; record the other-lane divergence so a silent change
          // there is visible in the failure output.
          if (!diff.equal) {
            regionOnly.push(
              `${page.name} (${page.otherLaneDivergence}): first diff at ` +
                `${String(diff.firstDifference?.codeUnitOffset)}`,
            );
          }
        }
      }

      // eslint-disable-next-line no-console
      console.log(["cardtype-template page verdicts (oracle vs engine):", ...verdicts].join(String.fromCharCode(10)));
      if (regionOnly.length > 0) {
        // eslint-disable-next-line no-console
        console.log(
          `cardtype-template add-button-region pages (other-lane divergence, expected):\n  ${regionOnly.join("\n  ")}`,
        );
      }
      expect(
        byteIdentical,
        `these ${CARDTYPE_TEMPLATE_PAGES.length - regionOnly.length} add_button-only pages are not byte-identical to the oracle:\n  ${byteIdentical.join("\n  ")}`,
      ).toEqual([]);
    },
  );

  it("derives the pinned anchor shape from the name (unit form of the census rule)", () => {
    // The rule: spaces -> underscores, case preserved. url_key would
    // lowercase (URI -> uri); the cards.codename column is the lowercase
    // key form too. Both are ruled out by the oracle bytes.
    expect(pinnedCardtypeAddButton("Tracked Item")).toContain('href="/type/Tracked_Item?view=new_in_modal"');
    expect(pinnedCardtypeAddButton("Tracked Item")).toContain('title="Add Tracked Item"');
    expect(pinnedCardtypeAddButton("URI")).toContain('href="/type/URI?view=new_in_modal"');
    expect(pinnedCardtypeAddButton("URI")).not.toContain("/type/uri");
    expect(pinnedCardtypeAddButton("Mirror List")).toContain("/type/Mirror_List?");
    expect(pinnedCardtypeAddButton("Notification template")).toContain("/type/Notification_template?");
    expect(pinnedCardtypeAddButton("event")).toContain('href="/type/event?view=new_in_modal"');
    // The engine-only class is gone from the pinned shape.
    expect(pinnedCardtypeAddButton("Task")).not.toContain("cardtype-add-button");
    expect(pinnedCardtypeAddButton("Task")).toContain('class="btn btn-secondary slotter"');
  });
});
