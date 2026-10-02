// Corpus pin for the sign-in slice's central storage finding: the real
// deck's +*account+*password cards store SALTED SHA-1 HEX DIGESTS (40
// lowercase hex chars — Digest::SHA1.hexdigest "#{salt}--#{password}--",
// card-1.110.0 lib/card/auth.rb:36-39), NOT bcrypt hashes. Every stored
// value was probed read-only when the finding was made (2026-09-27); this
// test re-pins the shape so a future corpus refresh that DID carry bcrypt
// would fail here loudly instead of silently breaking sign-in.
//
// Data rule: the test asserts SHAPES (lengths, character classes, prefix
// classes). No password content, salt content, or email content is ever
// selected into a string that outlives the query, printed, or embedded in
// an assertion message.
//
// The committed miniature corpus (fixtures/test-corpus/test-corpus.sqlite3)
// carries the pinned credential shapes by construction — the builder
// re-issues +*password/+*salt rows in Ruby's salted-SHA-1 form with
// deterministic generated values. The richer raw ground-truth corpus
// (a local gitignored build, tmp/raw-ground-truth/bench-corpus-raw.sqlite3)
// stays available as the explicit opt-in via DECKO_TS_RAW_CORPUS; no
// sibling-checkout fallback and no presence probing (self-contained-tests
// lane). The assertion is the same shape property at either scale.

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { CORPUS_DB_PATH } from "../../../src/testing/test-corpus-paths.js";

const RAW_CORPUS_PATH = process.env.DECKO_TS_RAW_CORPUS ?? CORPUS_DB_PATH;

const describeIfCorpus = describe;

describeIfCorpus("corpus +*password storage shape (fixture deck; raw opt-in via env)", () => {
  it("every stored digest is a 40-char lowercase SHA-1 hex string, zero bcrypt-shaped", () => {
    const db = new Database(RAW_CORPUS_PATH as string, { readonly: true });
    try {
      const passwordCodename = db
        .prepare("SELECT id FROM cards WHERE codename = 'password' AND trash = 0")
        .get() as { id: number } | undefined;
      expect(passwordCodename).toBeDefined();

      // The python-built corpus names the content column `content` (the
      // engine-standard build names it db_content — see
      // src/card/auth/signin.ts's column-convention note).
      const digests = db
        .prepare(
          "SELECT length(content) AS len, content NOT GLOB '*[^0-9a-f]*' AS allLowerHex, " +
            "substr(content, 1, 1) AS firstChar FROM cards WHERE right_id = ? AND trash = 0",
        )
        .all(passwordCodename?.id) as Array<{
        len: number;
        allLowerHex: number;
        firstChar: string;
      }>;

      expect(digests.length).toBeGreaterThan(0);
      for (const row of digests) {
        expect(row.len).toBe(40);
        expect(row.allLowerHex).toBe(1);
        expect(row.firstChar).not.toBe("$");
      }
    } finally {
      db.close();
    }
  });

  it("the matching +*salt cards exist for verification (40-char, SHA-1-shaped)", () => {
    const db = new Database(RAW_CORPUS_PATH as string, { readonly: true });
    try {
      const saltCodename = db
        .prepare("SELECT id FROM cards WHERE codename = 'salt' AND trash = 0")
        .get() as { id: number } | undefined;
      expect(saltCodename).toBeDefined();
      const salts = db
        .prepare(
          "SELECT length(content) AS len FROM cards WHERE right_id = ? AND trash = 0",
        )
        .all(saltCodename?.id) as Array<{ len: number }>;
      expect(salts.length).toBeGreaterThan(0);
      for (const row of salts) {
        expect(row.len).toBe(40);
      }
    } finally {
      db.close();
    }
  });
});
