// Read verdicts on a WARM engine — corpus replay.
//
// ensureVerdicts judged only the cards the current render seated
// (renderSeats), then recorded the whole render map's size as "judged" and
// skipped the next pass whenever the map size was unchanged. A card that
// entered the map during an earlier render without being one of its seats
// was never judged, yet counted; when a later page made that card its root,
// the map did not grow, the pass was skipped, isDenied found no verdict and
// read it as allowed, and the page rendered the card's content to the
// anonymous reader.
//
// Reproducer (found by the leak scan): `tags` (card 128, stored read rule
// BasicCs+*type+*read = "Anyone Signed In") renders its body anonymously
// after these five pages render in the same engine; on a fresh engine it is
// denied.
//
// Gate: opt-in via PERM_WARM_VERDICT_REPLAY=1 (raw bench corpus).
import Database from "better-sqlite3";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  RAW_CORPUS_DB,
  createRawStructureSeededStorage,
} from "../render/raw-corpus-seeding.js";
import { describeWithCorpus } from "../../support/describe-with-corpus.js";
import type { RenderTestStorage } from "../render/render-test-storage.js";

const REPLAY_REQUESTED = process.env.PERM_WARM_VERDICT_REPLAY === "1";
const describeIfCorpus = describeWithCorpus(REPLAY_REQUESTED, "tests/card/permissions/read-verdict-warm-engine-corpus.test.ts", "corpus replay was not requested (set DECKO_TS_CORPUS_REPLAY=1)");

const WARMUP_PAGES = [
  "Eileen Cavendish+*account",
  "20160420+CM+Time Tracking+1015",
  "20201230+CM+Time Tracking",
  "Len Forfang memorial service prep+Project",
  "20120728+RQ+game notes",
];

describeIfCorpus("warm engine: a card already in the render map is still judged", () => {
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

  it("denies `tags` to the anonymous reader after five unrelated page renders", async () => {
    for (const page of WARMUP_PAGES) await storage!.engine.renderPage(page);
    const html = await storage!.engine.renderPage("tags");
    expect(html).not.toContain("the reference deck uses two methods to tag");
    expect(storage!.engine.isDenied({ id: 128, key: "tags" } as never)).toBe(true);
  }, 300_000);
});
