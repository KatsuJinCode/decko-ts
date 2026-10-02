// navbar-cr-main-menu-crlf-source-probe.test.ts -- the navbar-cr suite's
// diagnostic probe. The four *head-family rule pages (FrAi+*right+*head,
// GBA+*right+*head, *head+*self, *head+*right) each differ from their oracle
// shard by exactly ONE byte: a CR the oracle keeps in the navbar join
// (between </li></li> and the first nav-item li) and the engine drops. The
// CR's source card is corpus 22752 "*main menu" whose db content is
// "[[*Opportunities|Opportunities]]\r\n[[*search|Changes]]" -- exactly one
// CRLF. This probe adjudicates WHERE the engine loses it: it dumps (a) the
// ENGINE deck's stored dbContent bytes for *main menu (CRLF loss there =
// storage/seed bug; intact there = render-path bug), and (b) the four
// rendered pages for byte-diffing against the oracle shards. Diagnostic only
// (writes bytes; asserts presence) -- env-gated like the sibling probes.
//
// RUN (test queue only):
//   node C:/localProjects/decko-ts/tools/test-queue/submit-test-job.mjs \
//     --name navbarcr-probe --cwd <worktree> \
//     --cmd "npx vitest run tests/card/render/navbar-cr-main-menu-crlf-source-probe.test.ts --no-file-parallelism" \
//     --env NAVBARCR_PROBE=1 --timeout-min 3

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const OUT_DIR = path.join(REPO_ROOT, "tmp", "navbarcr-probe");
const PROBE_REQUESTED = process.env.NAVBARCR_PROBE === "1";

const PAGES = ["FrAi+*right+*head", "GBA+*right+*head", "*head+*self", "*head+*right"];

function safeFileName(name: string): string {
  return name.replaceAll("*", "STAR").replaceAll("+", "P").replaceAll(" ", "_").replaceAll("/", "_");
}

describe("navbar-cr: where the *main menu CRLF dies (storage vs render)", () => {
  it(
    "dumps engine *main menu dbContent + the four candidate pages",
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
      // The corpus row's own bytes, for the storage-vs-render adjudication.
      const corpusRow = idLister
        .prepare(`SELECT content FROM cards WHERE name = '*main menu' AND trash = 0 LIMIT 1`)
        .get() as { content: string | null } | undefined;
      idLister.close();
      const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
      storage.fetcher.installNameEnvironment();
      await storage.fetcher.warmLexicon(everyLiveId);
      try {
        // (a) the ENGINE deck's OWN stored bytes for *main menu.
        const menuCard = await storage.fetcher.fetch("*main menu");
        const engineBytes = menuCard?.dbContent ?? "<card-not-found>";
        writeFileSync(
          path.join(OUT_DIR, "engine-main-menu-dbcontent.json"),
          JSON.stringify(
            {
              corpusRowContent: corpusRow?.content ?? "<row-not-found>",
              engineDbContent: engineBytes,
              corpusCrCount: ((corpusRow?.content ?? "").match(/\r/g) ?? []).length,
              engineCrCount: (engineBytes.match(/\r/g) ?? []).length,
            },
            null,
            2,
          ),
        );
        // (b) the four candidate pages, engine bytes.
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
