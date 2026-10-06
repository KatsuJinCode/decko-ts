// raw-corpus-d8-layout-chunk-list-probe.test.ts -- the D8 suite's
// VERIFICATION + PIN for the Classic Layout (card 314) CodeRay autolink
// divergence.
//
// MECHANISM (this is a CHUNK-LIST divergence, not a scanner one):
//   card-mod-layout-0.20.0 set/type/layout_type.rb:5 is `include_set
//   Type::Html`, and card-mod-format-0.20.0 set/type/html.rb:14-16 defines
//   `def chunk_list; :references; end` on that Type set. A layout card's
//   format therefore answers :references, and
//   card-1.110.0 lib/card/content/chunk.rb:87 registers
//     register_list :references, %i[EscapedLiteral Nest Link]
//   -- NO Uri / HostUri / EmailUri. The layout core view
//   (layout_type.rb:12-18) hands the CodeRay div to
//   `process_content` (card-1.110.0 lib/card/format/content.rb:4-8 ->
//   content.rb:77-82, `opts[:chunk_list] || @format.chunk_list`), so the
//   highlighted JavaScript body is chunked as references-only: the bare
//   hosts `culturesmith.uservoice.com` and
//   `cdn.uservoice.com/javascripts/widgets/tab.js` stay highlighted source
//   text. The ONE anchor the oracle emits inside the whole card is
//   `[[http://www.wagn.org|Wagn]]` at offset 3439 -- a Link chunk, and Link
//   IS in :references.
//
//   The port's general processContent path already used the gem's table
//   (format.ts rubyChunkListForCardType, `layout_type -> "references"`), but
//   the CodeRay :core override path carried its OWN narrower inline table
//   naming only css/scss (views.ts), so a layout card's highlighted body ran
//   the :default list and autolinked the two bare hosts.
//
// ORACLE (expected-v2/view-lane, sha-verified shards):
//   314  Classic Layout  views.content  8203 B, ZERO external-link anchors
//        inside the <pre> (the only anchor is the wagn.org wiki link at 3439,
//        before the <pre> at 422..8177)
//   2575 home-layout     views.content  byte-equal control (no script body)
//   2339 / 2347          the two other layout cards carrying a URL -- and
//                        their only URL is inside a `[[...]]` Link chunk, so
//                        the pin proves they are byte-neutral across the fix
//
// RUN (explicitly; needs the machine-local raw corpus -- see RAW_CORPUS_DB):
//   D8_LAYOUT_CHUNK_LIST_PROBE=1 NODE_OPTIONS=--max-old-space-size=4096 \
//   npx vitest run \
//     tests/card/render/raw-corpus-d8-layout-chunk-list-probe.test.ts \
//     --maxWorkers=2 --no-file-parallelism

import { existsSync, createReadStream, readdirSync } from "node:fs";
import { createInterface } from "node:readline";
import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import { byteDiff, normalizeSlotIds } from "../../../src/testing/diff.js";
import { RAW_CORPUS_DB, RAW_CORPUS_VIEW_LANE_DIR, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import { highlight } from "../../../src/card/render/code-highlighting/index.js";
import { RenderFormat } from "../../../src/card/render/format.js";
import { DeckoName } from "../../../src/card/name.js";

const CORPUS_PRESENT = existsSync(RAW_CORPUS_DB);
// The view-lane yardstick shards, resolved from the private raw-corpus leg's
// own contract module beside RAW_CORPUS_DB — the same leg, same capture. This
// literal used to name the per-lane worktree
// `decko-ts-lane-fix-d8-classic-layout-js-autolink`, which no longer exists on
// this machine; the sibling d3 probe carried its own copy of the same dead path.
const SHARD_DIR = RAW_CORPUS_VIEW_LANE_DIR;

const LAYOUT_TYPE_ID = 11746;

const PROBE_CARDS = [
  // [id, name, the views the oracle captured]
  { id: 314, name: "Classic Layout", views: ["content", "open"] },
  // the two sibling layout cards that also carry a URL: byte-neutral proof
  { id: 2339, name: "PCTS main layout", views: ["content"] },
  { id: 2347, name: "Golden_Bears_Aikido_at_UC_Berkeley main layout", views: ["content"] },
  // the byte-equal control: a layout with no script body and no URL
  { id: 2575, name: "home-layout", views: ["content"] },
] as const;

async function readShardEntry(id: number): Promise<any | undefined> {
  for (const file of readdirSync(SHARD_DIR)) {
    const rl = createInterface({ input: createReadStream(`${SHARD_DIR}/${file}`) });
    try {
      for await (const line of rl) {
        if (line.trim() === "" || !line.includes(`"id":${id},`)) continue;
        const obj = JSON.parse(line);
        if (obj.id === id) return obj;
      }
    } finally {
      rl.close();
    }
  }
  return undefined;
}

/** The D1 origin pin, projected out on BOTH sides -- the same symmetric
 *  shape format.ts's own comment and the D3 pin use. 314's content
 *  nests `{{*head|core}}`, so the head rule's own bytes ride in and carry
 *  the D1 `decko.rootUrl` value. Projecting it (rather than hand-pinning the
 *  origin bytes) keeps the pin asserting the D8 property. */
function normalizeD1Origin(s: string): string {
  return s.replace(/decko.rootUrl='[^']*'/g, "decko.rootUrl='<ORIGIN>'");
}

/** Count the autolink anchors the :default list would have emitted. */
function countExternalLinkAnchors(s: string): number {
  return (s.match(/<a target="_blank" class="external-link"/g) ?? []).length;
}

describe("D8 Classic Layout (314) CodeRay body runs the :references chunk list", () => {
  it(
    "a layout card's highlighted source keeps its bare hosts verbatim",
    { timeout: 1_800_000 },
    async (ctx) => {
      if (process.env.D8_LAYOUT_CHUNK_LIST_PROBE !== "1") {
        ctx.skip();
        return;
      }
      expect(CORPUS_PRESENT, `raw corpus missing: ${RAW_CORPUS_DB}`).toBe(true);

      const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
      const everyLiveId = (
        idLister.prepare("SELECT id FROM cards WHERE trash = 0 ORDER BY id").all() as Array<{
          id: number;
        }>
      ).map((r) => r.id);
      // The whole layout-typed class, so the pin names the blast radius
      // rather than only the card that was reported.
      const layoutIds = (
        idLister
          .prepare("SELECT id FROM cards WHERE trash = 0 AND type_id = ? ORDER BY id")
          .all(LAYOUT_TYPE_ID) as Array<{ id: number }>
      ).map((r) => r.id);
      const typeCard = idLister
        .prepare("SELECT id, name, codename FROM cards WHERE id = ?")
        .get(LAYOUT_TYPE_ID) as { id: number; name: string; codename: string | null };
      idLister.close();
      console.log(
        `[corpus] type ${typeCard.id} ${typeCard.name} codename=${typeCard.codename} ` +
          `-> layout-typed cards: ${layoutIds.join(",")}`,
      );

      const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
      storage.fetcher.installNameEnvironment();
      await storage.fetcher.warmLexicon(everyLiveId);
      const { engine } = storage;

      // The gate's own name resolution, measured (RenderFormat#contentNestsHeadCore
      // runs exactly this): `{{:head|core}}` must absolutize onto `*head`.
      console.log(
        `[mark] DeckoName.parse(":head").s = ${JSON.stringify(DeckoName.parse(":head").s)} ` +
          `key = ${JSON.stringify(DeckoName.parse(":head").key)}`,
      );

      const rows: string[] = [];
      const anchorRows: string[] = [];
      for (const probe of PROBE_CARDS) {
        const card = await engine.prepareItemForRender(probe.name);
        expect(card, `${probe.name} is not fetchable`).toBeDefined();
        const fmt = new RenderFormat(card!, engine);
        console.log(
          `[gate] ${probe.name} typeCode=${card!.typeCode ?? "?"} ` +
            `contentNestsHeadCore=${fmt.contentNestsHeadCore()} ` +
            `dbContent=${JSON.stringify(card!.dbContent.slice(0, 60))}`,
        );
        console.log(
          `[highlight] ${probe.name} highlight(dbContent,"html") pre = ` +
            JSON.stringify(highlight(card!.dbContent, "html").slice(0, 80)),
        );

        const oracle = await readShardEntry(probe.id);
        expect(oracle, `no view-lane yardstick for id ${probe.id}`).toBeDefined();
        for (const view of probe.views) {
          const expectedRaw = (oracle?.views?.[view] as string | undefined) ?? "";
          const actual = await engine.render(probe.name, view);
          // A RAW byte comparison is unattainable here by construction, and
          // saying so beats pretending otherwise: the recording layer
          // rewrote every `data-slot-id="<20 lowercase hex>"` to the
          // literal `data-slot-id="RANDOMIZED"` (src/testing/diff.ts:15-30,
          // mirrored from docs/oracle-harness.md). The oracle bytes carry
          // the 10-char placeholder where the port emits 20 hex chars, so
          // the raw lengths differ by 10 per slot and the raw first
          // difference is always inside the token. normalizeSlotIds IS
          // that rule applied to both sides, and it is the standing shape
          // every corpus pin in this repo uses.
          //
          // The D8 property therefore gets asserted TWICE, once in bytes
          // and once in a projection-free count: the anchor census below
          // reads the RAW strings and counts
          // `<a target="_blank" class="external-link"` -- the exact markup
          // the :default chunk list emits and :references cannot. It is
          // untouched by either projection.
          const rawDiff = byteDiff(expectedRaw, actual);
          const expected = normalizeSlotIds(expectedRaw);
          const got = normalizeSlotIds(actual);
          const diff = byteDiff(normalizeD1Origin(expected), normalizeD1Origin(got));
          const actualAnchors = countExternalLinkAnchors(actual);
          const oracleAnchors = countExternalLinkAnchors(expectedRaw);
          console.log(
            `[pin] ${probe.name}:${view} equal=${diff.equal} ` +
              `actualLen=${got.length} oracleLen=${expected.length} ` +
              `rawActualLen=${actual.length} rawOracleLen=${expectedRaw.length} ` +
              `rawSlotIdOnly=${rawDiff.firstDifference?.codeUnitOffset} ` +
              `actualAnchors=${actualAnchors} oracleAnchors=${oracleAnchors}` +
              (diff.equal
                ? ""
                : ` firstDiff@${diff.firstDifference?.codeUnitOffset} ` +
                  `oracle=${JSON.stringify(diff.firstDifference?.expectedExcerpt?.slice(0, 200))} ` +
                  `actual=${JSON.stringify(diff.firstDifference?.actualExcerpt?.slice(0, 200))}`),
          );
          rows.push(
            `${probe.name}:${view} equal=${diff.equal} actualLen=${got.length} ` +
              `oracleLen=${expected.length} actualAnchors=${actualAnchors} ` +
              `oracleAnchors=${oracleAnchors}`,
          );
          anchorRows.push(
            `${probe.name}:${view} actualAnchors=${actualAnchors} oracleAnchors=${oracleAnchors}`,
          );
        }
      }

      expect(
        rows.every((r) => r.includes("equal=true")),
        `every pinned layout view must equal the oracle (slot ids + D1 origin ` +
          `projected out):\n${rows.join("; ")}`,
      ).toBe(true);
      // The projection-free D8 assertion: the census of autolink anchors
      // reads the raw bytes on both sides. Before the fix 314 emitted 5
      // against the oracle's 1.
      expect(
        anchorRows.every((r) => {
          const a = Number(/actualAnchors=(\d+)/.exec(r)?.[1]);
          const o = Number(/oracleAnchors=(\d+)/.exec(r)?.[1]);
          return a === o;
        }),
        `every pinned layout view must emit the oracle's own count of ` +
          `external-link anchors, read from the RAW bytes:\n${anchorRows.join("; ")}`,
      ).toBe(true);
      expect(rows.length, "the pin set must not silently shrink").toBe(5);

      storage.close();
    },
  );
});
