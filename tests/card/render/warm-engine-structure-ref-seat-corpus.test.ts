// A *structure template's nest of a card an EARLIER render stored is still
// this render's nest — corpus replay on the key-repaired deck.
//
// `sabrina mejias` nests `+agree`, and `agree+*right+*structure` substitutes
// `{{Intellectual Property+Statement}}` into it. The engine's sweep surface
// (renderSeats) gained that statement card only when this render inserted it
// into the map. On a warm engine an earlier render had already stored it, the
// closure walk ran before the substitution and never saw the edge, so the
// card was rendered without being seated: the link-target pass never scanned
// it, and its links to existing cards (`[[Embody Nonviolence]]`,
// `[[Process Arts]]`) came out wanted-card. The same four views (sabrina
// mejias, Dan Williams, Marc Sacks, Anthony Gonzales) pass as a fresh
// engine's first render.
//
// Gate: opt-in via WARM_STRUCTURE_REF_SEAT_REPLAY=1 (needs the key-repaired
// bench, sha 305caac1, staged at tmp/raw-ground-truth).
import Database from "better-sqlite3";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import { describeWithCorpus } from "../../support/describe-with-corpus.js";
import type { RenderTestStorage } from "./render-test-storage.js";

const REPLAY_REQUESTED = process.env.WARM_STRUCTURE_REF_SEAT_REPLAY === "1";
const describeIfCorpus = describeWithCorpus(REPLAY_REQUESTED, "tests/card/render/warm-engine-structure-ref-seat-corpus.test.ts", "corpus replay was not requested (set DECKO_TS_CORPUS_REPLAY=1)");

describeIfCorpus("warm engine: structure-template nests of stored cards are seated", () => {
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

  it("sabrina mejias after another view: the statement's links stay known", async () => {
    await storage!.engine.render("*all+*default html view", "content");
    const html = await storage!.engine.render("sabrina mejias", "content");
    expect(html).toContain(
      '<a class="known-card" href="/Embody_Nonviolence"><span class="card-title" title="Embody Nonviolence">Embody Nonviolence</span></a>',
    );
    expect(html).toContain(
      '<a class="known-card" href="/Process_Arts"><span class="card-title" title="Process Arts">Process Arts</span></a>',
    );
    // a target with no card stays wanted (the People Green pin)
    expect(html).toContain('<a class="wanted-card" href="/People_Green">');
  }, 300_000);
});
