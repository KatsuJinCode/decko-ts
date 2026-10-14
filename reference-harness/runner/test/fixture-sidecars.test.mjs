// A SQLite handle on a WAL database leaves -wal and -shm files beside the
// database, and the fixture manifest reads them as residue. The shipped decks
// must never carry them: the harness opens only copies (runner/run.mjs stages a
// private, rollback-journal copy for each session).
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { HARNESS } from "./helpers.mjs";

describe("the shipped fixture decks carry no journal sidecars", () => {
  for (const fixture of ["synthetic-v1", "synthetic-v2"]) {
    it(`${fixture}/deck holds no -wal or -shm file beside deck.sqlite3`, () => {
      const dir = path.join(HARNESS, "fixtures", fixture, "deck");
      assert.ok(existsSync(path.join(dir, "deck.sqlite3")), "the committed deck is present");
      const residue = readdirSync(dir).filter((f) => /\.sqlite3?-(wal|shm)$/.test(f));
      assert.deepEqual(residue, [], "open decks only through a copy; delete the sidecars");
    });
  }
});
