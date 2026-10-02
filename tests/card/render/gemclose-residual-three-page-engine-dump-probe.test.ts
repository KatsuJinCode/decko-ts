// gemclose-residual-three-page-engine-dump-probe.test.ts -- the gem-anchored-
// closure port's diagnostic probe: renders EXACTLY the three nest-selection
// residual pages the replays-adjudication left red
// (tmp/wrong-goal-hunt/replays-adjudication-lane.md verdict table, b2 sweep)
// on a COPIED raw corpus database (tmp/raw-ground-truth/bench-corpus-raw.sqlite3
// staged into this worktree; the pass20-int original is never opened for
// writes) and dumps the engine's page bytes to tmp/gemclose-probe/ for the
// port's byte-level adjudication. No assertions beyond presence -- this is a
// probe, not a pin; the per-family pin suites carry the verdicts.
//
// RUN (through the machine test queue only; env-gated so ordinary suite
// runs skip the ~40s corpus seed -- the PERMANENT verdict lives in
// gem-anchored-residual-pages-byte-parity.test.ts):
//   node C:/localProjects/decko-ts/tools/test-queue/submit-test-job.mjs \
//     --name gemclose-probe --cwd <worktree> \
//     --env GEMCLOSE_PROBE=1 \
//     --cmd "npx vitest run tests/card/render/gemclose-residual-three-page-engine-dump-probe.test.ts --no-file-parallelism" \
//     --timeout-min 3

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const OUT_DIR = path.join(REPO_ROOT, "tmp", "gemclose-probe");
const PROBE_REQUESTED = process.env.GEMCLOSE_PROBE === "1";

/** The three residual pages, named by the replays-adjudication lane's
 *  nest-miss sweep (its tmp/nest-sel-replay/sweep-results.jsonl):
 *  GIV missing the *referred_to_by content-view slot; the two *head rule
 *  pages with phantom rule bars. */
const PAGES = ["GIV-the god of intimate violence", "*all+*head", "PCTS+*self+*head"];

function safeFileName(name: string): string {
  return name.replaceAll("*", "STAR").replaceAll("+", "P").replaceAll(" ", "_").replaceAll("/", "_");
}

describe("gem-anchored closure: three residual pages, engine byte dump", () => {
  it(
    "renders the three pages on the copied corpus and writes the bytes",
    { timeout: 240_000 },
    async (ctx) => {
      if (!PROBE_REQUESTED) {
        ctx.skip();
        return;
      }
      expect(existsSync(RAW_CORPUS_DB), `raw corpus missing: ${RAW_CORPUS_DB}`).toBe(true);
      mkdirSync(OUT_DIR, { recursive: true });
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
      try {
        for (const name of PAGES) {
          const html = await storage.engine.renderPage(name);
          writeFileSync(path.join(OUT_DIR, `actual-${safeFileName(name)}.html`), html);
        }
        // The dispatch probe: the *head rule page's body bytes are the
        // setting-listing shape — render the two candidate cores directly
        // so the suite can attribute the dispatch (rule card's own core vs
        // the *head setting card's core).
        for (const [label, cardName, view] of [
          ["core-all-head", "*all+*head", "core"],
          ["core-head-setting", "*head", "core"],
          ["content-all-head", "*all+*head", "content"],
        ] as const) {
          const rendered = await storage.engine.render(cardName, view);
          writeFileSync(path.join(OUT_DIR, `probe-${label}.html`), rendered);
        }
        // The typeCode dump: the dispatch runs when typeCode === "setting";
        // record what the enriched render cards actually carry.
        const typeDump: Record<string, unknown> = {};
        for (const cardName of ["*all+*head", "*head", "PCTS+*self+*head"]) {
          const rc = storage.engine.fetchRenderCard(cardName);
          typeDump[cardName] =
            rc === undefined
              ? "ABSENT"
              : {
                  typeCode: rc.typeCode,
                  typeName: rc.typeName,
                  typeId: rc.typeId,
                  setKeys: rc.setKeys,
                  id: rc.id,
                  dbContent: rc.dbContent,
                  recordDbContent: rc.record.dbContent,
                };
        }
        writeFileSync(path.join(OUT_DIR, "probe-typedump.json"), JSON.stringify(typeDump, null, 2));
      } finally {
        storage.close();
      }
    },
  );
});
