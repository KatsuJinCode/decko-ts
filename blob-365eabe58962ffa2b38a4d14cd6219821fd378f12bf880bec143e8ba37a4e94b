// A search's `"append"` result is typed by its *type plus right structure,
// and the structure's links resolve as Ruby's Link chunk does — corpus replay
// on the key-repaired deck.
//
// `Collection+Item+*type plus right+*structure` is the search
// `{"type":"Item", ..., "append":"short"}`, so the `Ellery` collection
// lists the virtual `<item>+short` cards. Their template is
// `Item+short+*type plus right+*structure` (HTML-typed):
//   - the virtual card's type is the structure rule card's (type.rb
//     type_id_from_template), which needs the LEFT card's type for the
//     *type plus right candidate; the engine read the RichText default;
//   - `[[_left]]` has no label, so its title is `"_left".fully_stripped`, "";
//   - `[[_left|{{_left+image}}]]` names the absolutized `<item>`, its title
//     attribute keeps the nest's html (only quotes escaped), and the inner
//     text is wrapped_title's joint split.
//
// Gate: opt-in via CQL_APPEND_ITEM_SHORT_REPLAY=1 (needs the key-repaired
// bench, sha 305caac1, staged at tmp/raw-ground-truth).
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import type { RenderTestStorage } from "./render-test-storage.js";
import { compareNormalized } from "../../../src/testing/diff.js";
import { describeWithCorpus } from "../../support/describe-with-corpus.js";
import { setDeploymentCloudAssetHost } from "../../../src/card/render/views.js";

const REPLAY_REQUESTED = process.env.CQL_APPEND_ITEM_SHORT_REPLAY === "1";
const describeIfCorpus = describeWithCorpus(REPLAY_REQUESTED, "tests/card/render/cql-append-virtual-item-short-corpus.test.ts", "corpus replay was not requested (set DECKO_TS_CORPUS_REPLAY=1)");

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

describeIfCorpus("search append: virtual <item>+short cards", () => {
  let storage: RenderTestStorage | undefined;

  beforeAll(async () => {
    // the grade boot's asset-host seam (image srcs in the page body)
    setDeploymentCloudAssetHost("https://production-storage.r1.cdn.objectstore.example");
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

  it("Ellery page matches the corpus of record", async () => {
    const html = await storage!.engine.renderPage("Ellery");
    expect(html).toContain(
      'class="card-slot content-view ALL ALL_PLUS TYPE-html RIGHT-short TYPE_PLUS_RIGHT-item-short d0-card-content"',
    );
    expect(html).toContain('<h2><a class="known-card" href="/Oregon_Thanksgiving_HDW_TL_20131128_3417"><span class="card-title" title=""></span></a></h2>');
    expect(compareNormalized(expectedPage("Ellery"), html).equal).toBe(true);
  }, 300_000);
});
