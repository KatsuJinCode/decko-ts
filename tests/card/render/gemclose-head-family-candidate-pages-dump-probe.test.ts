// gemclose-head-family-candidate-pages-dump-probe.test.ts -- the gem-anchored-
// closure port's flip-candidate probe: renders the four FURTHER *head-family
// pages the page-lane carries (FrAi+*right+*head, GBA+*right+*head,
// *head+*self, *head+*right) so the suite can adjudicate whether the
// Right::Head/Self::Head core overrides moved them onto the oracle bytes.
// Diagnostic only (dumps bytes; asserts presence) -- env-gated like the
// three-page byte-parity suite.
//
// RUN (test queue only):
//   ... --env GEMCLOSE_PROBE=1 --cmd "npx vitest run
//   tests/card/render/gemclose-head-family-candidate-pages-dump-probe.test.ts
//   --no-file-parallelism" --timeout-min 3

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import { skipLoud } from "../../support/describe-with-corpus.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const OUT_DIR = path.join(REPO_ROOT, "tmp", "gemclose-probe");
const PROBE_REQUESTED = process.env.GEMCLOSE_PROBE === "1";

const PAGES = ["FrAi+*right+*head", "GBA+*right+*head", "*head+*self", "*head+*right"];

function safeFileName(name: string): string {
  return name.replaceAll("*", "STAR").replaceAll("+", "P").replaceAll(" ", "_").replaceAll("/", "_");
}

describe("gem-anchored closure: further *head-family candidate pages", () => {
  it(
    "renders the four candidate pages and writes the bytes",
    { timeout: 240_000 },
    async (ctx) => {
      if (!PROBE_REQUESTED) {
        skipLoud(ctx, "tests/card/render/gemclose-head-family-candidate-pages-dump-probe.test.ts", "PROBE_REQUESTED");
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
          writeFileSync(path.join(OUT_DIR, `cand-${safeFileName(name)}.html`), html);
        }
      } finally {
        storage.close();
      }
    },
  );
});
