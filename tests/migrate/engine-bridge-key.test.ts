// engine-bridge-key.test.ts — the importer's key derivation uses the deployed
// deck's inflection table, as every serving boot and the Ruby deck do.
//
// A key derived under the gem's default tables differs for names containing
// "Anonymous", "this" or a lone "s" (Anonymous -> anonymou, Participant(s) ->
// participant_), and a card stored under such a key cannot be found by name.
// The expected keys are the ones the Ruby deck stores for these names.

import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LocalSqliteToolDriver, importDump } from "../../tools/migrate/import.mjs";
import { deriveKeyWithEngine } from "../../tools/migrate/engine-bridge.mjs";
import { resetDeckInflections } from "../../src/card/name/inflect.js";
import { dumpFile, cardsInsert } from "./synthetic-dump.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DDL_PATH = join(REPO_ROOT, "db", "schema.sqlite.sql");

/** Name -> the key the Ruby deck stores for it. */
const RUBY_KEYS: [string, string][] = [
  ["Anonymous", "anonymous"],
  ["Participant(s)", "participant_s"],
  ["Project(s) Participating", "project_s_participating"],
  ["Talk Like It's Casey's Birth Day", "talk_like_it_s_casey_s_birth_day"],
  ["How this may be different from what you know", "how_this_may_be_different_from_what_you_know"],
  // Ordinary plurals still singularize as Ruby does.
  ["Participants", "participant"],
];

const dirs: string[] = [];
afterAll(() => {
  resetDeckInflections();
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
// Each case starts from the gem's default tables, as a fresh import process does.
beforeEach(() => resetDeckInflections());

describe("deriveKeyWithEngine", () => {
  it.each(RUBY_KEYS)("keys %s as the deck does", (name, key) => {
    expect(deriveKeyWithEngine(name)).toBe(key);
  });
});

describe("importDump key repair", () => {
  it("stores deck-table keys for simple cards missing their key", async () => {
    const dir = mkdtempSync(join(tmpdir(), "decko-import-key-"));
    dirs.push(dir);
    const dumpPath = join(dir, "dump.sql");
    writeFileSync(
      dumpPath,
      dumpFile([cardsInsert(RUBY_KEYS.map(([name], i) => ({ id: i + 1, name, key: null })))]),
      "utf8",
    );
    const driver = new LocalSqliteToolDriver(join(dir, "out.sqlite"));
    try {
      const stats = await importDump({ dumpPath, driver, ddlPath: DDL_PATH, deriveKey: deriveKeyWithEngine });
      expect(stats.keyRepair.derived).toBe(RUBY_KEYS.length);
      const rows = await driver.query<{ name: string; key: string }>("SELECT name, key FROM cards ORDER BY id", []);
      expect(rows.rows.map((r) => [r.name, r.key])).toEqual(RUBY_KEYS);
    } finally {
      driver.close();
    }
  }, 30000);
});
