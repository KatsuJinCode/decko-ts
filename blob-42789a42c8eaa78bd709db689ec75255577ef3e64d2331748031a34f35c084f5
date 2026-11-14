// BUILD 5 of the one-trip precompute: THE SEARCH-NEST POSTURE STORE.
//
// The research verdict's honest wall (§2.2): a search nest whose value is
// computed at render time can ride a precomputed page only if its result
// rows were completed BEFORE the read — MediaWiki's DynamicPageList
// execute-and-cache shape. Strict per-request freshness and precomputation
// are mutually exclusive; an operator picks where each search sits between
// them. This module is that pick, as ONE config seam:
//
//   SearchNestPosture = "write-time" | "live"
//   DEFAULT_SEARCH_NEST_POSTURE = "write-time"
//
// The write-time default is the research verdict's recommendation for a
// read-mostly deck with rare controlled writes: every search
// nest executes once when the closure is built (or when a write invalidates
// it) and its result rows are stored as data. The "live" posture leaves the
// store empty and lets the render execute the CQL per render (the current
// engine's behavior — always fresh, more round trips). Nothing here
// depends on the default staying: flipping the constant flips the posture
// for builder and invalidation alike, and both postures are pinned by
// tests/card/one-trip/search-nest-posture.test.ts.
//
// RESULT-IDENTITY INVARIANT: the stored rows are EXACTLY what the live CQL
// execution returns (same executor, same statement bytes, same order) —
// pinned by the posture test. Permission-filter parity is a documented
// limitation: the write-time executor runs with the anonymous/default
// options this module's probes render under; a deployment whose viewers see
// permission-filtered results must run the write-time execution under the
// SERVING policy (SPEC: "the write-time execution runs under the same read
// scope the read will serve").
//
// Byte-safety note (why posture parity is not load-bearing for the
// acceptance pin): in replay the render still executes its searches live —
// the materialized rows only pre-seat the RESULT CARDS' records. A
// divergence between stored and live results therefore costs residue trips,
// never bytes.

import type { SQLDatabaseDriver } from "../../server/driver.js";
import { executeQuery } from "../../cql/execute.js";
import { DeckoName } from "../name.js";

export type SearchNestPosture = "write-time" | "live";

/** THE config seam. Write-time execution is the default per the research
 *  verdict (SOLVED-BY-COMBINATION §2.2) and this deck's read-mostly regime.
 *  A deployment's owner chooses the final default; flipping this constant (or passing
 *  an explicit posture to the builder) is the whole switch. */
export const DEFAULT_SEARCH_NEST_POSTURE: SearchNestPosture = "write-time";

/** Execute ONE search nest NOW (the write-time posture's unit of work) and
 *  store its result rows as data. Reads truth from the CORPUS (the search
 *  card's CQL content, the search card's name as the CQL context), writes
 *  the side store, returns the result id sequence.
 *
 *  Execution options deliberately mirror the render's shape minus the
 *  viewer permission filter (see the RESULT-IDENTITY note above): context =
 *  the search card's own name (cql_search.rb passes `context: name`), and
 *  the CQL name resolver reads the corpus synchronously-by-query — the
 *  offline build has no warm lexicon, so the resolver is a direct key
 *  lookup (the same answer the render's ensureCardId path produces for a
 *  cold cache). */
export async function executeSearchNestNow(
  corpus: SQLDatabaseDriver,
  side: SQLDatabaseDriver,
  searchCardId: number,
): Promise<number[]> {
  const cardRows = await corpus.query<{ db_content: string | null; name: string | null }>(
    "SELECT db_content, name FROM cards WHERE id = ? AND trash = 0",
    [searchCardId],
  );
  const row = cardRows.rows[0];
  if (row === undefined || row.db_content === null || row.db_content === "") return [];

  let statement: unknown;
  try {
    statement = JSON.parse(row.db_content);
  } catch {
    return []; // bad query: the render raises search_error; the store stores nothing
  }
  if (statement === null || typeof statement !== "object" || Array.isArray(statement)) return [];

  const contextName = row.name ?? "";
  // RENDER-PARITY CLAMP: the render's runSearch clamps every search to its
  // paging limit (card-mod-search: the cql's own limit when declared, else
  // 20) before reading result rows — the render never reads more than
  // limit+count rows per nest. The write-time store materializes the SAME
  // window (the clamp rides the statement exactly as runSearch applies it),
  // so a deck-wide search stores ~21 rows, not every card in the deck — an
  // unclamped store turns one deck-wide nest into a whole-deck payload.
  let statementClamped = statement as Record<string, unknown>;
  {
    const declared = (statementClamped as Record<string, unknown>)["limit"];
    const cqlLimit =
      typeof declared === "number" && Number.isFinite(declared) ? declared : undefined;
    const limit = cqlLimit ?? 20;
    statementClamped = { ...statementClamped, limit };
  }

  const keyToId = new Map<string, number>();
  const idToKey = new Map<number, string>();
  {
    const all = await corpus.query<{ id: number; name: string | null; "key": string | null }>(
      'SELECT id, name, "key" FROM cards WHERE trash = 0 AND name IS NOT NULL',
      [],
    );
    for (const r of all.rows) {
      if (r.key !== null) keyToId.set(r.key, r.id);
      if (r.id !== undefined) {
        try {
          idToKey.set(r.id, r.name ? DeckoName.parse(r.name).key : (r.key ?? ""));
        } catch {
          // skip unparseable names
        }
      }
    }
  }
  void idToKey;

  const result = await executeQuery(corpus, statementClamped, {
    parse: {
      context: contextName,
      ensureCardId: async (nameish: string) => {
        try {
          return keyToId.get(DeckoName.parse(nameish).key);
        } catch {
          return undefined;
        }
      },
      resolveCardId: (nameish: string) => {
        try {
          return keyToId.get(DeckoName.parse(nameish).key);
        } catch {
          return undefined;
        }
      },
    },
  }).catch(() => undefined);

  const rows = result && "rows" in result ? result.rows : [];
  const ids = rows.map((r) => r.id);
  await side.query("DELETE FROM one_trip_search_results WHERE search_card_id = ?", [searchCardId]);
  // chunked to stay under SQLite's parameter ceiling on big result sets
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const placeholders = chunk.map(() => "(?, ?, ?)").join(", ");
    await side.query(
      `INSERT INTO one_trip_search_results (search_card_id, position, card_id) VALUES ${placeholders}`,
      chunk.flatMap((cardId, offset) => [searchCardId, i + offset, cardId]),
    );
  }
  return ids;
}
