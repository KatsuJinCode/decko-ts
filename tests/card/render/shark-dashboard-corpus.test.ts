// Shark's dashboard page matches the corpus of record — corpus replay on the
// key-repaired deck. Three causes, each a Ruby-grounded change:
//   - set/type/role.rb view :configs returns an Array, which output joins
//     with a newline between its sections;
//   - the getting-started Rules section nests `{{:all|bar_setting_list; …}}`,
//     and setting_list_item fetches each stored `*all+*<setting>` rule; the
//     engine preloaded set rules only for a Set-typed ROOT;
//   - `{{:getting_started|demo}}`: the set/all :demo view was registered only
//     through the mod loader, so the loader-less page lane could not
//     dispatch it; its form bytes now follow the capture.
//
// Gate: opt-in via SHARK_DASHBOARD_REPLAY=1 (needs the key-repaired bench,
// sha 305caac1, staged at tmp/raw-ground-truth).
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import type { RenderTestStorage } from "./render-test-storage.js";
import { compareNormalized } from "../../../src/testing/diff.js";
import { describeWithCorpus } from "../../support/describe-with-corpus.js";
import { setDeploymentCloudAssetHost } from "../../../src/card/render/views.js";

const REPLAY_REQUESTED = process.env.SHARK_DASHBOARD_REPLAY === "1";
const describeIfCorpus = describeWithCorpus(REPLAY_REQUESTED, "tests/card/render/shark-dashboard-corpus.test.ts", "corpus replay was not requested (set DECKO_TS_CORPUS_REPLAY=1)");

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

describeIfCorpus("Shark dashboard page", () => {
  let storage: RenderTestStorage | undefined;

  beforeAll(async () => {
    setDeploymentCloudAssetHost("https://example.com-production-storage.fra1.cdn.digitaloceanspaces.com");
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

  it("Shark page: role sections, nested rule list and demo view", async () => {
    const html = await storage!.engine.renderPage("Shark");
    expect(html).toContain('<div id="Xgetting_started-demo-view" class="card-slot demo-view');
    expect(html).toContain('data-card-id="34754" data-card-name="*all+*head"');
    expect(compareNormalized(expectedPage("Shark"), html).equal).toBe(true);
  }, 300_000);
});
