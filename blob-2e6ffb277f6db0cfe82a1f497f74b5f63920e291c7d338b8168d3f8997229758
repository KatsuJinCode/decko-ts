// Boot smoke: can the TS engine answer semantic questions against the staged
// key-repaired deck? Prints one line per question so a failure is visible.
import Database from "better-sqlite3";
import { createRawStructureSeededStorage, RAW_CORPUS_DB } from "../../tests/card/render/raw-corpus-seeding.js";

const db = new Database(RAW_CORPUS_DB, { readonly: true });
const ids = (db.prepare("SELECT id FROM cards WHERE trash = 0").all() as Array<{ id: number }>).map(r => r.id);
db.close();
console.log(`LIVE_IDS ${ids.length}`);

const t0 = Date.now();
const storage = await createRawStructureSeededStorage(new Set(ids));
storage.fetcher.installNameEnvironment();
await storage.fetcher.warmLexicon(ids);
console.log(`SEEDED ms=${Date.now() - t0}`);

const all = await storage.fetcher.fetchByName("*all");
console.log(`*all id=${all?.id} key=${all?.key} type=${all?.name}`);

const readRule = await storage.fetcher.fetchByName("*all+*read");
console.log(`*all+*read id=${readRule?.id}`);

const people = await storage.fetcher.driver.query<{ n: number }>(
  `SELECT count(*) n FROM cards WHERE trash = 0 AND type_id = (SELECT id FROM cards WHERE name = 'Person' AND trash = 0)`,
  [],
);
console.log(`PERSONS ${JSON.stringify((await people).rows)}`);
storage.close();