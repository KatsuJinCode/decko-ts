// D2 lane scratch probe: render the two dangling-description surfaces and
// write the engine's page bytes to tmp/d2-lane-dump/ so the byte regions can
// be inspected next to the sha-verified oracle. Report-only, gated on the env
// var so ordinary suite runs skip it.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const OUT_DIR = path.join(REPO_ROOT, "tmp", "d2-lane-dump");
const REQUESTED = process.env.D2_LANE_DUMP === "1";

describe("D2 lane page dump", () => {
  it(
    "writes the engine page bytes for the two description-nest surfaces",
    { timeout: 1_800_000 },
    async (ctx) => {
      if (!REQUESTED) {
        ctx.skip();
        return;
      }
      expect(existsSync(RAW_CORPUS_DB), `raw corpus missing: ${RAW_CORPUS_DB}`).toBe(true);
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
      mkdirSync(OUT_DIR, { recursive: true });
      for (const name of ["Role+*type+*default", "Cardtype+*type+*default"]) {
        const html = await storage.engine.renderPage(name);
        const file = path.join(OUT_DIR, `${name.replace(/[^A-Za-z0-9]+/g, "_")}.html`);
        writeFileSync(file, html);
        // eslint-disable-next-line no-console
        console.log(`[d2] ${name} -> ${file} (${html.length} chars)`);
      }
    },
  );
});
