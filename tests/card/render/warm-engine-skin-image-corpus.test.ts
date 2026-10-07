// Bootswatch skins listed on a WARM engine still show their +Image —
// corpus replay on the key-repaired deck.
//
// A bootswatch skin's bar_left nests its +Image child (card-mod-bar_and_box
// media_snippet.haml); Ruby's nest fetches it live. The engine fetches the
// child in the prepare phase, but only for skins THIS render seated. On the
// key-repaired deck an earlier render (any page) already stores the skins,
// so the `Bootswatch skin` cardtype page lists them from its search without
// seating them, the +Image children are never fetched, and every skin bar
// renders an empty image box. The page passes as an engine's first render.
// Same class as the warm-engine verdict and item-host walks.
//
// Gate: opt-in via WARM_SKIN_IMAGE_REPLAY=1 (needs the key-repaired bench,
// sha 305caac1, staged at tmp/raw-ground-truth).
import Database from "better-sqlite3";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import type { RenderTestStorage } from "./render-test-storage.js";

const REPLAY_REQUESTED = process.env.WARM_SKIN_IMAGE_REPLAY === "1";
const describeIfCorpus = REPLAY_REQUESTED ? describe : describe.skip;

describeIfCorpus("warm engine: listed bootswatch skins keep their +Image", () => {
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

  it("Bootswatch skin after Anyone With Role: cerulean skin's bar carries its image", async () => {
    await storage!.engine.renderPage("Anyone With Role");
    const html = await storage!.engine.renderPage("Bootswatch skin");
    expect(html).toContain(
      '<div title="cerulean skin" class="image-box medium"><img alt="cerulean skin+Image" src="/files/:cerulean_skin+:image/bootstrap-small.png" /></div>',
    );
  }, 300_000);

  it("a list item naming a gone id (CB_role+*self's `~861`) does not break the skin walk", async () => {
    const html = await storage!.engine.render("CB_role+*self", "content");
    expect(html.startsWith('<div id="cb_role-Xself-content-view"')).toBe(true);
  }, 300_000);
});
