// raw-corpus-type-plus-right-left-type-verdict.test.ts -- the RED pin for
// the missing-pattern-side set-key fabrication unit's VERDICT arm (the
// censustail3 worktree; receipts tmp/wrong-goal-hunt/cd-smalls-lane.md class 2
// and cql-found-by-lane.md section 3):
//
//   Ruby's TYPE_PLUS_RIGHT anchor (card-1.110.0
//   mod/core/set_pattern/08_type_plus_right.rb#anchor_name) reads
//   `left_type(card)` (lib/card/set/pattern/class_methods.rb:58-72):
//   `card.superleft&.type_name || quick_type(card.name.left_name)` — at
//   render time superleft is nil (no in-memory supercard), so the LEFT
//   CARD's type decides, fetched `new: {}` (found_by.rb:35-39's
//   never-miss fabrication: a missing left fabricates through the
//   *structure template machinery and lands Set-typed; an existing left
//   answers its stored type). The render engine's TASK-VERDICT inputs
//   (render.ts updateVerdictForCard / ensureTaskVerdicts) built
//   PatternCardInputs WITHOUT leftTypeName, so the set-pattern registry
//   anchored every compound card's type_plus_right candidate on RichText:
//   the walk computed `rich_text+discussion+*type plus right+*update`
//   where Ruby resolves `image+discussion+*type plus right+*update` —
//   rule 16985 (`Image+*discussion+*type plus right+*update` = "Anyone")
//   was missed and the head's universal_edit_button
//   (card-mod-format set/all/html/head.rb:46-51, perms: :update) rendered
//   its denial blank on the 7 `Very Rosie July 4 in 2013+Gallery10vert
//   +imageNN+discussion` pages whose oracle heads carry the edit link.
//
//   The PlainText population (cql-found-by receipt section 3: the
//   `+*type+by name` slot's chrome token read
//   TYPE_PLUS_RIGHT-cardtype-by_name over the oracle's -set-by_name) is
//   ALREADY GREEN at the pass-17 tip through the enrich path's virtual
//   left (resolveVirtualCardStructure answers Set off the
//   `*type+*right+*structure` rule card); this spec pins it as a
//   regression guard so the verdict-arm fix cannot re-break it.
//
// RUN (explicitly; needs the machine-local raw corpus via
// tmp/raw-ground-truth and the page-lane shards):
//   CENSUSTAIL3_SWEEP=1 NODE_OPTIONS=--max-old-space-size=6144 \
//   npx vitest run tests/card/render/raw-corpus-type-plus-right-left-type-verdict.test.ts \
//     --no-file-parallelism
//
// Outside a census machine (no corpus, or the env gate unset) the spec
// skips, so ordinary suite runs neither slow down nor fail on absent data.

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, it, expect } from "vitest";
import {
  RAW_CORPUS_DB,
  createRawStructureSeededStorage,
} from "./raw-corpus-seeding.js";
import type { RenderTestStorage } from "./render-test-storage.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const PAGE_LANE_DIR = path.join(
  REPO_ROOT,
  "tmp",
  "raw-ground-truth",
  "expected-v2",
  "page-lane",
);

const SWEEP_REQUESTED = process.env.CENSUSTAIL3_SWEEP === "1";
const CORPUS_PRESENT = existsSync(RAW_CORPUS_DB);
const SHARDS_PRESENT = existsSync(PAGE_LANE_DIR);

/** The cd-smalls head-asset class's 7 `Very Rosie +discussion` pages: the
 *  junction's LEFT side (`...+Gallery10vert+imageNN`) is Image-typed in the
 *  corpus (type_id 19), so Ruby's type_plus_right update rule 16985
 *  ("Anyone") applies and the anonymous-capture head renders the edit
 *  link. Page ids 16982 (image01) and 16994-16999 (image07..image02). */
const VERY_ROSIE_PAGES = [
  { id: 16982, name: "Very Rosie July 4 in 2013+Gallery10vert+image01+discussion" },
  { id: 16999, name: "Very Rosie July 4 in 2013+Gallery10vert+image02+discussion" },
  { id: 16998, name: "Very Rosie July 4 in 2013+Gallery10vert+image03+discussion" },
  { id: 16997, name: "Very Rosie July 4 in 2013+Gallery10vert+image04+discussion" },
  { id: 16996, name: "Very Rosie July 4 in 2013+Gallery10vert+image05+discussion" },
  { id: 16995, name: "Very Rosie July 4 in 2013+Gallery10vert+image06+discussion" },
  { id: 16994, name: "Very Rosie July 4 in 2013+Gallery10vert+image07+discussion" },
] as const;

/** Ruby's universal_edit_button href: the page card's url (name with
 *  spaces underscored, parts joined with "+") + /edit. Verified byte-for-
 *  byte against all 7 oracle page_html records. */
function expectedEditLink(name: string): string {
  return (
    `<link rel="alternate" type="application/x-wiki" title="Edit this page!" ` +
    `href="/${name.replace(/ /g, "_")}/edit" />`
  );
}

describe("raw-corpus type_plus_right left-type task verdict (cd-smalls 7 + PlainText guard)", () => {
  let storage: RenderTestStorage;

  beforeAll(async () => {
    if (!SWEEP_REQUESTED) return;
    const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
    const everyLiveId = (
      idLister.prepare("SELECT id FROM cards WHERE trash = 0 ORDER BY id").all() as Array<{
        id: number;
      }>
    ).map((r) => r.id);
    idLister.close();
    storage = await createRawStructureSeededStorage(new Set(everyLiveId));
    storage.fetcher.installNameEnvironment();
    await storage.fetcher.warmLexicon(everyLiveId);
  }, 1_800_000);

  afterAll(() => {
    if (storage !== undefined) storage.close();
  });

  for (const page of VERY_ROSIE_PAGES) {
    it(
      `renders the universal edit link on ${page.name} (${page.id})`,
      { timeout: 600_000 },
      async (ctx) => {
        if (!SWEEP_REQUESTED) {
          ctx.skip();
          return;
        }
        expect(CORPUS_PRESENT, `raw corpus missing: ${RAW_CORPUS_DB}`).toBe(true);
        expect(SHARDS_PRESENT, `page-lane shards missing: ${PAGE_LANE_DIR}`).toBe(true);

        const actual = await storage.engine.renderPage(page.name);
        const link = expectedEditLink(page.name);

        // fixture sanity: the oracle head carries the link
        expect(
          actual,
          "engine page rendered empty",
        ).not.toBe("");
        // THE FLIP: the engine head carries the same edit link the oracle
        // carries (RED while the type_plus_right update verdict denies).
        expect(actual).toContain(link);
        // the slot chrome's type_plus_right token anchors on the LEFT's
        // Image type (the enrich arm — already green at this tip; pinned
        // so the verdict fix cannot regress it)
        expect(actual).toContain("TYPE_PLUS_RIGHT-image-discussion");
      },
    );
  }

  it(
    "resolves the image01 +discussion update verdict as allowed",
    { timeout: 600_000 },
    async (ctx) => {
      if (!SWEEP_REQUESTED) {
        ctx.skip();
        return;
      }
      const card = storage.engine.fetchRenderCard(VERY_ROSIE_PAGES[0].name);
      expect(card, "image01+discussion card not fetchable").toBeDefined();
      expect(card!.id).toBeDefined();
      const verdict = await storage.engine.updateVerdictForCard(card!);
      // Ruby: rule 16985 = "Anyone" -> anonymous ok?(:update) is TRUE; the
      // port's contract marks unverifiable as undefined (allow) — either
      // non-false answer is Ruby-parity, `false` is the defect.
      expect(verdict).not.toBe(false);
    },
  );

  it(
    "keeps the PlainText +*type+by name slot chrome on the virtual Set anchor (page 22)",
    { timeout: 600_000 },
    async (ctx) => {
      if (!SWEEP_REQUESTED) {
        ctx.skip();
        return;
      }
      const actual = await storage.engine.renderPage("PlainText");
      // the oracle's by_name slot reads TYPE_PLUS_RIGHT-set-by_name (the
      // virtual left `PlainText+*type` is Set-typed through the
      // *type+*right+*structure rule card); the pre-fix context-card
      // fallback produced -cardtype-by_name. Already green at this tip —
      // pinned as the found-by receipt's named remainder, regression guard.
      expect(actual).toContain("TYPE_PLUS_RIGHT-set-by_name");
      expect(actual).not.toContain("TYPE_PLUS_RIGHT-cardtype-by_name");
    },
  );
});
