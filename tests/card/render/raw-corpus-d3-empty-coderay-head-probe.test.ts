// raw-corpus-d3-empty-coderay-head-probe.test.ts -- the D3 suite's
// VERIFICATION + PIN for the empty-CodeRay head family.
//
// MECHANISM (card-mod-layout-0.20.0 set/self/head.rb:9-17):
//   view :core, cache: :never do
//     escape_in_main { nest root.card, view: :head }
//   end
// The *head setting card's own core renders the RENDER ROOT's head tag.
// A head RULE whose dbContent is the codename inclusion `{{:head|core}}`
// (card 34754 `*all+*head`) or `{{*head|core}}` (card 34758
// `PCTS+*self+*head`) reaches that view through set/right/head.rb:16-18
//   view :core { process_content ::CodeRay.scan(render_raw, :html).div }
// whose <pre> therefore carries the expanded head bytes. The bare
// single-card VIEW LANE never seated the head bytes, so the pre was empty.
// The literal-content sibling (34764 `FrAi+*right+*head`) nests nothing and
// was byte-equal through the same path - that is why the divergence looked
// inclusion-specific.
//
// ORACLE (expected-v2/view-lane, sha-verified shards):
//   34754 views.content / views.open  pre 2441 B
//   34758 views.content / views.open  pre 2447 B
//   34764 views.content               pre  975 B  (the byte-equal control)
//   314 / 2575 (Layout-typed, `{{*head|core}}` in a :template nest mode) keep
//   the nest LITERAL inside their pres - the carve-out the fix must respect.
//
// RUN (explicitly; needs the machine-local raw corpus -- see RAW_CORPUS_DB):
//   D3_EMPTY_CODERAY_PROBE=1 NODE_OPTIONS=--max-old-space-size=4096 \
//   npx vitest run tests/card/render/raw-corpus-d3-empty-coderay-head-probe.test.ts \
//     --maxWorkers=2 --no-file-parallelism

import { existsSync, createReadStream } from "node:fs";
import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import { byteDiff, normalizeSlotIds } from "../../../src/testing/diff.js";
import { RAW_CORPUS_DB, RAW_CORPUS_VIEW_LANE_DIR, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import { highlight } from "../../../src/card/render/code-highlighting/index.js";
import { RenderFormat } from "../../../src/card/render/format.js";
import { DeckoName } from "../../../src/card/name.js";
import { skipLoud } from "../../support/describe-with-corpus.js";

const CORPUS_PRESENT = existsSync(RAW_CORPUS_DB);
// The view-lane yardstick shards, resolved from the private raw-corpus leg's
// own contract module beside RAW_CORPUS_DB — the same leg, same capture. This
// literal used to name the per-lane worktree
// ``, which no longer exists on this
// machine; the sibling d8 probe carried its own copy of the same dead path.
const SHARD_DIR = RAW_CORPUS_VIEW_LANE_DIR;

const PROBE_CARDS = [
  // [id, name, the views the oracle captured, pin?]
  { id: 34754, name: "*all+*head", views: ["content", "open"], pin: true },
  { id: 34758, name: "PCTS+*self+*head", views: ["content", "open"], pin: true },
  { id: 34764, name: "FrAi+*right+*head", views: ["content"], pin: true },
  // the :template-nest-mode carve-out: the nest must stay LITERAL. 2575 is
  // byte-equal and is pinned as the control that the carve-out preserves.
  { id: 2575, name: "home-layout", views: ["content"], pin: true },
  // 314 is RECORDED, not pinned, and the assertion beside it is the proof
  // that this suite did not move it: `Classic Layout` is Layout-typed, so
  // contentNestsHeadCore() returns false, the seat in RenderEngine#render
  // never runs, and no head bytes exist for its key. Its remaining
  // divergence is a DIFFERENT mechanism this suite did not touch — a bare URL
  // inside the CodeRay JavaScript sub-scanner body is autolinked by the port
  // where the oracle leaves it as highlighted source text (first diff at
  // offset 4666, deep past the literal `{{*head|core}}`). Logged, not pinned.
  { id: 314, name: "Classic Layout", views: ["content"], pin: false },
] as const;

async function readShardEntry(id: number): Promise<any | undefined> {
  const { createInterface } = await import("node:readline");
  const { readdirSync } = await import("node:fs");
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

/**
 * The D1 origin pin, projected out on BOTH sides (the same symmetric shape as
 * normalizeSlotIds, applied to oracle and port alike). m4verify D1 records the
 * disagreement: card-mod-format's `decko.rootUrl' reads `DECK_ORIGIN`
 * (src/card/render/deck-origin.ts), and the port pins it unconditionally while
 * the web-format captures ran with origin ABSENT. The two oracle surfaces
 * disagree; that needs a surface-scoped origin policy, not a flip, and it is
 * NOT this suite's to shift. Projecting the value out is the only way to
 * assert the D3 property (the CodeRay pre carries the resolved head) without
 * either hand-pinning the origin bytes or silently shipping D1's flip.
 */
function normalizeD1Origin(s: string): string {
  return s.replace(/decko.rootUrl='[^']*'/g, "decko.rootUrl='<ORIGIN>'");
}

/** The bytes between <pre> and </pre> - the CodeRay content region. */
function preOf(s: string): string {
  const a = s.indexOf("<pre>");
  const b = s.indexOf("</pre>");
  return a === -1 || b === -1 ? "<NO PRE>" : s.slice(a + 5, b);
}

describe("D3 empty-CodeRay head family (*all+*head / PCTS+*self+*head :core)", () => {
  it(
    "the inclusion-carrying head rules carry the resolved head inside their CodeRay pre",
    { timeout: 1_800_000 },
    async (ctx) => {
      if (process.env.D3_EMPTY_CODERAY_PROBE !== "1") {
        skipLoud(ctx, "tests/card/render/raw-corpus-d3-empty-coderay-head-probe.test.ts", "not (process.env.D3_EMPTY_CODERAY_PROBE !== \"1\")");
        return;
      }
      expect(CORPUS_PRESENT, `raw corpus missing: ${RAW_CORPUS_DB}`).toBe(true);

      const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
      const everyLiveId = (
        idLister.prepare("SELECT id FROM cards WHERE trash = 0 ORDER BY id").all() as Array<{
          id: number;
        }>
      ).map((r) => r.id);
      idLister.close();

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

      const pinned: string[] = [];
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
          `[step] ${probe.name} highlight(dbContent,"html") pre = ` +
            JSON.stringify(preOf(highlight(card!.dbContent, "html")).slice(0, 80)),
        );

        const oracle = await readShardEntry(probe.id);
        expect(oracle, `no view-lane yardstick for id ${probe.id}`).toBeDefined();
        for (const view of probe.views) {
          const expectedRaw = (oracle?.views?.[view] as string | undefined) ?? "";
          const actual = await engine.render(probe.name, view);
          const expected = normalizeSlotIds(expectedRaw);
          const got = normalizeSlotIds(actual);
          const diff = byteDiff(normalizeD1Origin(expected), normalizeD1Origin(got));
          const a = preOf(actual);
          const b = preOf(expectedRaw);
          console.log(
            `[pin] ${probe.name}:${view} equal=${diff.equal} actualLen=${got.length} ` +
              `oracleLen=${expected.length} actualPreLen=${a.length} oraclePreLen=${b.length}` +
              (diff.equal
                ? ""
                : ` firstDiff@${diff.firstDifference?.codeUnitOffset} ` +
                  `oracle=${JSON.stringify(diff.firstDifference?.expectedExcerpt?.slice(0, 200))} ` +
                  `actual=${JSON.stringify(diff.firstDifference?.actualExcerpt?.slice(0, 200))}`),
          );
          // Collect, then assert once: a byte failure on the first card must not
          // hide the rest of the family.
          const row = `${probe.name}:${view} equal=${diff.equal} actualLen=${got.length} oracleLen=${expected.length} actualPre=${a.length} oraclePre=${b.length}`;
          console.log(`[result] ${row}${probe.pin ? "" : " (RECORDED, not pinned)"}`);
          if (probe.pin) pinned.push(row);
        }
        if (!probe.pin) {
          // THE NO-REGRESSION PROOF for a recorded row: the seat in
          // RenderEngine#render is the only behavioral change this suite makes,
          // and it is gated on contentNestsHeadCore(). A Layout-typed card
          // answers false, so the seat never runs and no head bytes exist for
          // its key — this card's bytes are exactly what the base tip emits.
          expect(
            engine.pageHeadBytesFor(probe.name),
            `${probe.name} must have NO seated head bytes (the :template carve-out)`,
          ).toBeUndefined();
        }
      }

      expect(
        pinned.every((r) => r.includes("equal=true")),
        `every PINNED *head-family view must equal the oracle (D1 origin projected out):\n${pinned.join("; ")}`,
      ).toBe(true);
      expect(pinned.length, "the pin set must not silently shrink").toBe(6);

      storage.close();
    },
  );
});
