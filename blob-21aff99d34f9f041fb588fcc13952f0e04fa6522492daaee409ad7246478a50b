// Scratch probe (delete after reading): bisects the first-fetch hang by
// name shape and by skipping modules. Times four fetches on the seeded full
// deck: a simple known name, the deep corpus name, both with skipModules.
import { describe, expect, it, afterAll } from "vitest";
import Database from "better-sqlite3";
import {
  createStructureSeededStorageFor,
} from "../../tests/card/render/structure-corpus-seeding.js";
import { readShardLines, CORPUS_DB } from "../../tests/card/render/permission-corpus-seeding.js";

let storage: Awaited<ReturnType<typeof createStructureSeededStorageFor>> | undefined;
afterAll(() => {
  storage?.close();
});

describe("first-fetch bisect (seeded full deck)", () => {
  it(
    "times simple vs deep fetch with and without modules",
    { timeout: 3_600_000 },
    async () => {
      const t0 = Date.now();
      const db = new Database(CORPUS_DB, { readonly: true });
      const everyLiveId = (
        db.prepare("SELECT id FROM cards WHERE trash = 0").all() as Array<{ id: number }>
      ).map((r) => r.id);
      db.close();
      storage = await createStructureSeededStorageFor(new Set(everyLiveId));
      console.log(`SEED_MS ${Date.now() - t0}`);

      const lines = readShardLines();
      const simple = lines.find((l) => !(l.name ?? "").includes("+")) as { name: string };
      const deep = lines.find((l) => (l.name ?? "").split("+").length >= 4) as
        | { name: string }
        | undefined;

      let t = Date.now();
      await storage.fetcher.fetchByName(simple.name, { skipModules: true });
      console.log(`SIMPLE_SKIPMOD_MS ${Date.now() - t} name=${simple.name}`);

      t = Date.now();
      await storage.fetcher.fetchByName(simple.name);
      console.log(`SIMPLE_FULL_MS ${Date.now() - t}`);

      if (deep !== undefined) {
        t = Date.now();
        await storage.fetcher.fetchByName(deep.name, { skipModules: true });
        console.log(`DEEP_SKIPMOD_MS ${Date.now() - t} name=${deep.name}`);
      }
      expect(true).toBe(true);
    },
  );
});
