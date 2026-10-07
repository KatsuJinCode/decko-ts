// A bare view render of a Role dashboard builds the admin runtime its
// `{{_L|configs}}` nest reads — corpus replay.
//
// card-mod-account set/type/role.rb view :configs lists the admin configs
// whose responsible_role includes the role. The engine's sync view body reads
// the core mod's admin runtime, which is built asynchronously. The page lane
// built it before its sync render (page.ts), but a bare view render
// (engine.render, the view lane) did not, so Administrator+Dashboard's
// content and open views rendered an empty paragraph where Ruby renders the
// Configurations section. The page of the same card passed.
//
// Gate: opt-in via VIEW_LANE_CONFIGS_REPLAY=1 (raw bench corpus).
import Database from "better-sqlite3";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import type { RenderTestStorage } from "./render-test-storage.js";

const REPLAY_REQUESTED = process.env.VIEW_LANE_CONFIGS_REPLAY === "1";
const describeIfCorpus = REPLAY_REQUESTED ? describe : describe.skip;

describeIfCorpus("view lane: a Role dashboard's configs nest reads a built admin runtime", () => {
  let storage: RenderTestStorage | undefined;

  beforeAll(async () => {
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

  it("Administrator+Dashboard content renders the Configurations section", async () => {
    const html = await storage!.engine.render("Administrator+Dashboard", "content");
    expect(html).toContain("<p><p><h3>Configurations</h3>");
  }, 300_000);
});
