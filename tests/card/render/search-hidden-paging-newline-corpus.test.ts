// A search list nested with `hide: paging` closes with no trailing newline —
// corpus replay on the key-repaired deck.
//
// search_result_list is `with_paging { wrap_with :div, … }`, and with_paging
// is `output [list, render_paging]`. When the nest hides :paging,
// render_paging answers nil, output compacts it, and nothing is joined after
// the list. media+GBA+YouTube Browser nests its two video searches with
// `hide:paging`; the engine always added the newline (2 bytes).
//
// Gate: opt-in via HIDDEN_PAGING_REPLAY=1 (needs the key-repaired bench,
// sha 305caac1, staged at tmp/raw-ground-truth).
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import type { RenderTestStorage } from "./render-test-storage.js";
import { compareNormalized } from "../../../src/testing/diff.js";
import { setDeploymentCloudAssetHost } from "../../../src/card/render/views.js";

const REPLAY_REQUESTED = process.env.HIDDEN_PAGING_REPLAY === "1";
const describeIfCorpus = REPLAY_REQUESTED ? describe : describe.skip;

function expectedPage(name: string): string {
  const dir = path.join(path.dirname(RAW_CORPUS_DB), "expected-v2", "page-lane");
  for (const f of fs.readdirSync(dir)) {
    for (const line of fs.readFileSync(path.join(dir, f), "utf8").split("\n")) {
      if (!line) continue;
      const row = JSON.parse(line) as { name: string; page_html: string };
      if (row.name === name) return row.page_html;
    }
  }
  throw new Error(`no page-lane row for ${name}`);
}

describeIfCorpus("search list with hidden paging", () => {
  let storage: RenderTestStorage | undefined;

  beforeAll(async () => {
    setDeploymentCloudAssetHost("https://culturesmith-production-storage.fra1.cdn.digitaloceanspaces.com");
    const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
    const ids = (
      idLister.prepare("SELECT id FROM cards WHERE trash = 0 ORDER BY id").all() as Array<{ id: number }>
    ).map((r) => r.id);
    idLister.close();
    storage = await createRawStructureSeededStorage(new Set(ids));
    storage.fetcher.installNameEnvironment();
    await storage.fetcher.warmLexicon(ids);
  }, 600_000);

  afterAll(() => {
    storage?.close();
  });

  it("media+GBA+YouTube Browser page matches the corpus of record", async () => {
    const html = await storage!.engine.renderPage("media+GBA+YouTube Browser");
    expect(compareNormalized(expectedPage("media+GBA+YouTube Browser"), html).equal).toBe(true);
  }, 300_000);
});
