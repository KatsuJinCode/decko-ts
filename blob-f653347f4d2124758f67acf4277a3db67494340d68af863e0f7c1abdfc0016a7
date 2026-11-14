// Shared fixtures for the perm-overdeny page-parity pin and its attribution
// probe: the two named residual pages, the frozen page-lane yardstick
// loader, and the raw-corpus storage seeder both run over.
import { createReadStream, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import readline from "node:readline";
import Database from "better-sqlite3";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
export const PAGE_LANE_DIR = path.join(REPO_ROOT, "tmp", "raw-ground-truth", "expected-v2", "page-lane");
export const OUT_DIR = path.join(REPO_ROOT, "tmp", "p22-perm-overdeny");

export const CORPUS_PRESENT = existsSync(RAW_CORPUS_DB);
export const SHARDS_PRESENT = existsSync(PAGE_LANE_DIR);

/** The two named perm-overdeny residual pages the parity pin covers. */
export const PAGES = ["Anonymous+*account", "signup alert email+*from"];

export interface PageLaneLine {
  lane: string;
  name: string;
  page_html?: string;
  error?: unknown;
}

/** Loads the frozen page-lane yardstick entries for the given page names. */
export async function loadYardstick(names: Set<string>): Promise<Map<string, PageLaneLine>> {
  const found = new Map<string, PageLaneLine>();
  const files = existsSync(PAGE_LANE_DIR)
    ? readdirSync(PAGE_LANE_DIR).filter((f) => /^recapture-raw-shard-\d{6}\.jsonl$/.test(f))
    : [];
  for (const file of files) {
    const rl = readline.createInterface({
      input: createReadStream(path.join(PAGE_LANE_DIR, file)),
    });
    for await (const line of rl) {
      if (line.trim() === "") continue;
      if (!line.includes("page")) continue;
      let obj: PageLaneLine;
      try {
        obj = JSON.parse(line) as PageLaneLine;
      } catch {
        continue;
      }
      if (obj.lane !== "page") continue;
      if (names.has(obj.name) && !found.has(obj.name)) found.set(obj.name, obj);
    }
  }
  return found;
}

/** Seeds a storage instance from the raw ground-truth corpus. */
export async function seedRawCorpusStorage(): Promise<ReturnType<typeof createRawStructureSeededStorage>> {
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
  return storage;
}
