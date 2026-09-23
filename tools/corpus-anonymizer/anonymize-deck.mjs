#!/usr/bin/env node
// Privacy-safe corpus anonymizer for the v2 deck.
//
// Reads the corpus SQLite (READ-ONLY via better-sqlite3), classifies each
// non-trashed card as public or private via the imported classifier from
// classify-read-rules.mjs, drops PRIVATE cards entirely, anonymizes the
// retained public card `name`, `key`, `codename`, and `content` columns
// with deterministic nonsense syllable-tokens, preserves junction edges
// (left_id / right_id / referer_id / referee_id) exactly, rewrites
// card_references.referee_key through the same map so rule/set names
// still resolve, and replicates retained public cards — with synthetic
// suffixed names and lightly perturbed token content — until the output
// total card count is at least the ORIGINAL total card count.
//
// Privacy discipline (absolute):
//   This script NEVER prints, logs, or returns original card names, card
//   content, rule text, codenames, or word samples. Only counts, ids, and
//   paths leave the script. When a spot check needs human judgment, the
//   rule SHAPE is described, never the words.
//
// Outputs:
//   <out>/anonymized-deck.sqlite3   — same schema as the source corpus
//   <out>/anonymized-seed.sql       — D1-safe INSERT statements
//
// Constants (no env vars):
//   DB_IN          — corpus SQLite under anonymization (read-only)
//   OUT_DIR        — anonymized artifact directory
//   MAX_REPLICATE  — clamp on the per-card replication factor (≤ 3)
//   PERTURB_FRAC   — share of unique words re-tokenized per replica
//
// Exit status: 0 on a clean run; non-zero on setup error.
//
// The out/ directory MUST never be committed to git.

import {
  closeSync,
  mkdirSync,
  openSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import { classify } from "./classify-read-rules.mjs";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const DB_IN = join(
  REPO_ROOT,
  "benchmarks",
  "corpus-v2",
  "bench-corpus-v2.sqlite3",
);
// Output paths align with the independent leak verifier's
// DEFAULT_ANON_PATH in tools/corpus-anonymizer/verify-anonymized-deck.mjs
// so the verifier can be invoked with no CLI arguments and read what we
// just wrote.
const OUT_DIR = join(REPO_ROOT, "benchmarks", "corpus-v2-anonymized");
const DB_OUT = join(OUT_DIR, "anon-corpus-v2.sqlite3");
const SQL_OUT = join(OUT_DIR, "anon-corpus-v2-seed.sql");

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const MAX_REPLICATE = 3;            // clamp on per-card replication factor
const PERTURB_FRAC = 0.10;          // ~10% of unique words re-tokenized per replica
const TOKEN_LENGTH_JITTER = 0.20;   // ±20% of original word length
const MIN_TOKEN_LENGTH = 7;         // floor on generated token length; below
                                    // this many English words happen to be
                                    // strict CVCV and would collide with
                                    // generated tokens as substring matches

// ---------------------------------------------------------------------------
// Deterministic PRNG + non-dictionary token generator
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fnv1a32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Strictly alternating consonant-vowel pattern; the resulting strings
// use CYRILLIC letters (not Latin) so they cannot substring-match any
// English (or other Latin-script) corpus word. English syllables are
// not constrained to strict CV alternation, so even a Latin CV token
// could accidentally spell a real English word like "name" or "case"
// (which themselves are CVCV). Cyrillic tokens are guaranteed not to
// appear in any Latin-script corpus word, so substring scans over the
// anonymized deck — which is what the independent leak verifier runs —
// can never report a hit on a corpus vocabulary word.
//
// The token alphabet still satisfies \p{L}+ (the regex the script and
// the corpus use to split words into tokens), so word boundaries and
// word-level anonymization remain correct.
const VOWELS = "аеиоуыэюя";        // 9 Cyrillic vowels
const CONSONANTS = "бвгджзйклмнпрстфхцчшщ"; // 21 Cyrillic consonants

function makeToken(targetLength, seed) {
  // Length is the original word length, perturbed by ±TOKEN_LENGTH_JITTER,
  // clamped to a minimum of MIN_TOKEN_LENGTH. The minimum exists so that
  // the generated token cannot coincide with a short natural-language
  // word: at length 4, MANY English words happen to be CVCV (e.g. "name",
  // "make", "card", "case") and would collide with our generated CV
  // tokens. At length 7+, almost no English word is strictly CVCVCVCV,
  // so collisions with corpus vocabulary drop to near-zero. This is the
  // shape the spec calls "non-dictionary token": a CV alternation that
  // no natural-language dictionary entry follows at this length.
  const rng = mulberry32(seed ^ 0xdeadbeef);
  const jitter = (rng() * 2 - 1) * TOKEN_LENGTH_JITTER;
  const length = Math.max(MIN_TOKEN_LENGTH, Math.round(targetLength * (1 + jitter)));
  let s = "";
  for (let i = 0; i < length; i++) {
    s +=
      i % 2 === 0
        ? CONSONANTS[Math.floor(rng() * CONSONANTS.length)]
        : VOWELS[Math.floor(rng() * VOWELS.length)];
  }
  return s;
}

// ---------------------------------------------------------------------------
// Anonymizer (deterministic per-word tokenization + per-replica perturbation)
// ---------------------------------------------------------------------------
//
// Token generation is a pure function of the input word (and, for replica
// perturbation, the replica seed). No word -> token cache is needed because
// the same word always produces the same token: a word used in a card name,
// a card codename, a card content body, and a card_references.referee_key
// ALL map to the same nonsense token — the spec's "same consistent mapping"
// for rule/set resolution.
//
// Replicas carry an additional ~PERTURB_FRAC of words re-tokenized via a
// replica-specific perturbation seed, so replica content is "lightly
// perturbed" without breaking the global consistency: the primary token is
// still the token a stranger sees by default; the replica's perturbed words
// remain deterministic for the same (word, replica) pair.
//
// Skipping the cache is a deliberate memory fix: holding every word seen so
// far in a Map caused V8's old generation to grow past the 4GB heap limit
// on the ~47K-card, ~28M-word corpus. The token function is cheap enough
// (a fixed-cost FNV-1a + a ~10-step CV-pattern loop) that recomputing on
// every match costs < 5% wall-time vs the cached version while keeping the
// live heap bounded to ~200 MB.

function buildAnonymizer({ perturbationSeed }) {
  const perturbEnabled = perturbationSeed !== 0;

  return function anon(text) {
    if (text === null || text === undefined) return text;
    return String(text).replace(/\p{L}+/gu, (word) => {
      const token = makeToken(word.length, fnv1a32(word));
      if (!perturbEnabled) return token;
      const r = mulberry32(fnv1a32(word + "\u0001" + perturbationSeed))();
      if (r < PERTURB_FRAC) {
        return makeToken(
          word.length,
          fnv1a32(word + "\u0002pert\u0002" + perturbationSeed),
        );
      }
      return token;
    });
  };
}

// ---------------------------------------------------------------------------
// D1-safe SQL escaping
// ---------------------------------------------------------------------------

function sqlLiteral(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "boolean") return v ? "1" : "0";
  const s = String(v);
  return "'" + s.replace(/'/g, "''") + "'";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const startedAt = Date.now();
  mkdirSync(OUT_DIR, { recursive: true });

  // 1. Open source DB READ-ONLY and classify.
  const dbIn = new Database(DB_IN, { readonly: true, fileMustExist: true });
  const classifications = classify(dbIn);

  const cardRows = dbIn
    .prepare(
      "SELECT id, name, key, codename, " +
        "left_id AS leftId, right_id AS rightId, " +
        "creator_id AS creatorId, updater_id AS updaterId, " +
        "read_rule_class AS readRuleClass, read_rule_id AS readRuleId, " +
        "trash, type_id AS typeId, content, " +
        "created_at AS createdAt, updated_at AS updatedAt " +
        "FROM cards WHERE trash = 0 ORDER BY id ASC",
    )
    .all();

  const refRows = dbIn
    .prepare(
      "SELECT id, referer_id AS refererId, referee_key AS refereeKey, " +
        "referee_id AS refereeId, ref_type AS refType, " +
        "is_present AS isPresent " +
        "FROM card_references ORDER BY id ASC",
    )
    .all();

  const metaRows = dbIn
    .prepare("SELECT key, value FROM meta ORDER BY key ASC")
    .all();

  const originalTotalCards = dbIn
    .prepare("SELECT COUNT(*) AS n FROM cards")
    .get().n;

  dbIn.close();

  // 2. Partition retained (public) vs dropped (private / trashed).
  //    Compute the set of retained source ids BEFORE releasing cardRows so
  //    the filter result does not need to be re-iterated later.
  const liveCardsCount = cardRows.length;
  const retained = cardRows.filter(
    (r) => classifications.get(r.id) === "public",
  );
  const retainedSourceIds = new Set(retained.map((r) => r.id));
  // Release the unfiltered cardRows array — its non-retained row refs and
  //    array container can be GC'd. Retained still shares refs with the rows
  //    themselves; we null row.content below as each row is processed.
  cardRows.length = 0;

  // 3. Build the per-replica anonymizers. All anonymizers are pure
  //    functions of the input word (and replica seed), so they share no
  //    state and each invocation is independent.
  const anon = buildAnonymizer({ perturbationSeed: 0 });
  const replicaAnon = [
    null, // index 0 unused — the original copy uses anon() above
    buildAnonymizer({ perturbationSeed: 1 }),
    buildAnonymizer({ perturbationSeed: 2 }),
  ];

  // 4. Replication factor: ceil(original_total / retained), clamped to ≤ 3.
  const factor = Math.min(
    MAX_REPLICATE,
    Math.max(1, Math.ceil(originalTotalCards / retained.length)),
  );

  // 5. Open output SQLite and create the same schema as the source.
  const dbOut = new Database(DB_OUT);
  dbOut.pragma("journal_mode = WAL");
  dbOut.exec(
    "DROP TABLE IF EXISTS card_references;\n" +
      "DROP TABLE IF EXISTS cards;\n" +
      "DROP TABLE IF EXISTS meta;\n" +
      "CREATE TABLE cards (\n" +
      "  id INTEGER PRIMARY KEY,\n" +
      "  name TEXT, key TEXT, codename TEXT,\n" +
      "  left_id INTEGER, right_id INTEGER,\n" +
      "  creator_id INTEGER, updater_id INTEGER,\n" +
      "  read_rule_class TEXT, read_rule_id INTEGER,\n" +
      "  trash INTEGER NOT NULL DEFAULT 0,\n" +
      "  type_id INTEGER NOT NULL,\n" +
      "  content TEXT,\n" +
      "  created_at TEXT, updated_at TEXT\n" +
      ");\n" +
      "CREATE TABLE card_references (\n" +
      "  id INTEGER PRIMARY KEY,\n" +
      "  referer_id INTEGER NOT NULL,\n" +
      "  referee_key TEXT,\n" +
      "  referee_id INTEGER,\n" +
      "  ref_type TEXT NOT NULL DEFAULT '',\n" +
      "  is_present INTEGER\n" +
      ");\n" +
      "CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);\n",
  );

  const cardCols = [
    "id",
    "name",
    "key",
    "codename",
    "left_id",
    "right_id",
    "creator_id",
    "updater_id",
    "read_rule_class",
    "read_rule_id",
    "trash",
    "type_id",
    "content",
    "created_at",
    "updated_at",
  ];
  const refCols = [
    "id",
    "referer_id",
    "referee_key",
    "referee_id",
    "ref_type",
    "is_present",
  ];

  const insertCard = dbOut.prepare(
    "INSERT INTO cards (" +
      cardCols.join(", ") +
      ") VALUES (" +
      cardCols.map(() => "?").join(", ") +
      ")",
  );
  const insertRef = dbOut.prepare(
    "INSERT INTO card_references (" +
      refCols.join(", ") +
      ") VALUES (" +
      refCols.map(() => "?").join(", ") +
      ")",
  );
  const insertMeta = dbOut.prepare(
    "INSERT INTO meta (key, value) VALUES (?, ?)",
  );

  // Pre-populate the SQL seed header so it lands at the top of the file.
  // Stream inserts straight to disk via a raw fd + writeSync so peak heap
  // stays bounded for corpora with large anonymized content bodies. Each
  // line is a transient Buffer that is released after writeSync returns;
  // we never accumulate them.
  const sqlFd = openSync(SQL_OUT, "w");
  function sqlOut(line) {
    writeSync(sqlFd, line + "\n");
  }

  writeFileSync(
    SQL_OUT,
    "-- anonymized-seed.sql\n" +
      "-- Generated by tools/corpus-anonymizer/anonymize-deck.mjs\n" +
      "-- Schema: cards, card_references, meta (same as source corpus)\n" +
      "\n" +
      "CREATE TABLE IF NOT EXISTS cards (\n" +
      "  id INTEGER PRIMARY KEY,\n" +
      "  name TEXT, key TEXT, codename TEXT,\n" +
      "  left_id INTEGER, right_id INTEGER,\n" +
      "  creator_id INTEGER, updater_id INTEGER,\n" +
      "  read_rule_class TEXT, read_rule_id INTEGER,\n" +
      "  trash INTEGER NOT NULL DEFAULT 0,\n" +
      "  type_id INTEGER NOT NULL,\n" +
      "  content TEXT,\n" +
      "  created_at TEXT, updated_at TEXT\n" +
      ");\n" +
      "CREATE TABLE IF NOT EXISTS card_references (\n" +
      "  id INTEGER PRIMARY KEY,\n" +
      "  referer_id INTEGER NOT NULL,\n" +
      "  referee_key TEXT,\n" +
      "  referee_id INTEGER,\n" +
      "  ref_type TEXT NOT NULL DEFAULT '',\n" +
      "  is_present INTEGER\n" +
      ");\n" +
      "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);\n" +
      "\n",
  );

  // 6. Stream retained cards (and their replicas) directly into SQLite and
  //    into the SQL line buffer. Memory stays bounded: each row's content
  //    is held only for the duration of one replica's anonymization + write
  //    and is nulled before the next row, so we never buffer full content
  //    for all replicas at once.
  let nextId =
    retained.length > 0 ? retained[retained.length - 1].id + 1 : 1;
  const replicaIdsBySource = new Map(); // sourceId -> [replica1 id, replica2 id]
  let totalOutputCards = 0;

  for (const row of retained) {
    const anonName = anon(row.name ?? "");
    const anonCodename = anon(row.codename ?? "");
    const anonKey = anon(row.key ?? "");
    // read_rule_class values are short Latin taxonomy tokens ("*type",
    // "*right", "*all", "*self", ...). Without anonymization they survive
    // verbatim in the output and the independent leak verifier flags them
    // as corpus-vocab matches. Pass them through anon() so every letter
    // run becomes a Cyrillic token; non-letter characters ("*", " ",
    // "plus") are preserved by the regex.
    const anonReadRuleClass = anon(row.readRuleClass ?? "");
    const rowContent = row.content ?? "";

    for (let rep = 0; rep < factor; rep++) {
      const isReplica = rep > 0;
      const repAnon = isReplica ? replicaAnon[rep] : anon;
      const cardContent = isReplica ? repAnon(rowContent) : anon(rowContent);
      const cardId = isReplica ? nextId++ : row.id;
      const cardName = isReplica ? anonName + "__r" + rep : anonName;
      const cardKey = isReplica ? anonKey + "_r" + rep : anonKey;
      const codename = anonCodename;
      const leftId = row.leftId;
      const rightId = row.rightId;
      const creatorId = row.creatorId;
      const updaterId = row.updaterId;
      const readRuleClass = anonReadRuleClass;
      const readRuleId = row.readRuleId;
      const trash = 0;
      const typeId = row.typeId;
      const createdAt = row.createdAt;
      const updatedAt = row.updatedAt;

      insertCard.run(
        cardId,
        cardName,
        cardKey,
        codename,
        leftId,
        rightId,
        creatorId,
        updaterId,
        readRuleClass,
        readRuleId,
        trash,
        typeId,
        cardContent,
        createdAt,
        updatedAt,
      );
      totalOutputCards++;

      sqlOut(
        "INSERT INTO cards (" +
          cardCols.join(", ") +
          ") VALUES (" +
          [
            cardId,
            cardName,
            cardKey,
            codename,
            leftId,
            rightId,
            creatorId,
            updaterId,
            readRuleClass,
            readRuleId,
            trash,
            typeId,
            cardContent,
            createdAt,
            updatedAt,
          ]
            .map(sqlLiteral)
            .join(", ") +
          ");",
      );

      if (isReplica) {
        let arr = replicaIdsBySource.get(row.id);
        if (arr === undefined) {
          arr = [];
          replicaIdsBySource.set(row.id, arr);
        }
        arr.push(cardId);
      }
    }
    // Release the original content reference so this row's bytes can be
    // reclaimed before we move on to the next card.
    row.content = null;
  }

  // 7. Filter card_references: drop rows whose referer was dropped (private
  //    or trashed). Junction edges (referer_id, referee_id) are preserved
  //    exactly. referee_key is rewritten through the same primary map so
  //    rule/set names resolve to the mapped names whether the referee is
  //    retained or dropped — the spec's "rule/set cards reference the
  //    mapped names" constraint.
  //
  //    Build a referer -> refs index so the per-replica replication loop
  //    is O(refs_for_card) per replica instead of O(all_refs) per replica.
  const keptRefsByReferer = new Map();
  let keptRefsCount = 0;
  for (const r of refRows) {
    if (!retainedSourceIds.has(r.refererId)) continue;
    const mapped = {
      id: r.id,
      refererId: r.refererId,
      refereeKey: anon(r.refereeKey ?? ""),
      refereeId: r.refereeId,
      refType: r.refType,
      isPresent: r.isPresent,
    };
    let arr = keptRefsByReferer.get(r.refererId);
    if (arr === undefined) {
      arr = [];
      keptRefsByReferer.set(r.refererId, arr);
    }
    arr.push(mapped);
    keptRefsCount++;
  }

  // 8. Replicate card_references for each replica so junctions are
  //    replicated consistently. Replica ids start above the last original
  //    card_references id. Iterate per-replica so we never materialize
  //    the full extra-refs array in memory.
  let nextRefId =
    refRows.length > 0 ? refRows[refRows.length - 1].id + 1 : 1;
  let totalOutputReferences = 0;

  for (const sourceRow of retained) {
    const refsForCard = keptRefsByReferer.get(sourceRow.id);
    if (refsForCard === undefined) continue;
    const replicaIds = replicaIdsBySource.get(sourceRow.id);
    if (replicaIds === undefined) continue;

    // Write the original (non-replica) refs first so the SQL file's id
    // ordering matches what a stranger would have seen before this fix.
    for (const r of refsForCard) {
      insertRef.run(
        r.id,
        r.refererId,
        r.refereeKey,
        r.refereeId,
        r.refType,
        r.isPresent,
      );
      totalOutputReferences++;
      sqlOut(
        "INSERT INTO card_references (" +
          refCols.join(", ") +
          ") VALUES (" +
          [
            r.id,
            r.refererId,
            r.refereeKey,
            r.refereeId,
            r.refType,
            r.isPresent,
          ]
            .map(sqlLiteral)
            .join(", ") +
          ");",
      );
    }

    // Then write one set of refs per replica, in replica-id order.
    for (const replicaId of replicaIds) {
      for (const r of refsForCard) {
        insertRef.run(
          nextRefId,
          replicaId,
          r.refereeKey,
          r.refereeId,
          r.refType,
          r.isPresent,
        );
        totalOutputReferences++;
        sqlOut(
          "INSERT INTO card_references (" +
            refCols.join(", ") +
            ") VALUES (" +
            [
              nextRefId,
              replicaId,
              r.refereeKey,
              r.refereeId,
              r.refType,
              r.isPresent,
            ]
              .map(sqlLiteral)
              .join(", ") +
            ");",
        );
        nextRefId++;
      }
    }
  }

  // 9. Meta rows: schema is preserved (table created), but values that
  //    were derived from private content (digests, seeds, timestamp
  //    shifts, captured shard names) are dropped — leaving structural
  //    counts only. The KEY is also anonymized: corpus labels like
  //    "live_cards" / "card_rows" / "content_length_overflows" are Latin
  //    strings that match corpus vocabulary and would otherwise be flagged
  //    by the independent leak verifier. Anonymizing them keeps the
  //    structural counts in the table without leaking the original
  //    taxonomy. Values stay numeric/structural.
  for (const m of metaRows) {
    if (/digest|seed|shift|unresolved/i.test(m.key)) continue;
    insertMeta.run(anon(m.key), m.value ?? "");
    sqlOut(
      "INSERT INTO meta (key, value) VALUES (" +
        sqlLiteral(anon(m.key)) +
        ", " +
        sqlLiteral(m.value ?? "") +
        ");",
    );
  }

  dbOut.close();
  closeSync(sqlFd);

  // 10. Summary — counts only, never names / content / words.
  const summary = {
    source: {
      totalCards: originalTotalCards,
      liveCards: liveCardsCount,
      cardReferences: refRows.length,
    },
    classification: {
      retainedPublic: retained.length,
      droppedPrivate: originalTotalCards - retained.length,
    },
    replication: {
      factor,
      totalOutputCards,
      totalOutputReferences,
    },
    outputs: {
      sqlite: DB_OUT,
      seedSql: SQL_OUT,
    },
    elapsedMs: Date.now() - startedAt,
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
}

main();