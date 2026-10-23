// The deck's read shapes, named once.
//
// The save path reads a card in a handful of shapes, and the transport
// packing (docs/reports/live-save-transport-design-2026-10-18.md, sections
// 3 and 5) prefetches all of them at once: a card block's constant-id
// reads ride one round trip instead of one round trip per read.
//
// THE SHAPES ARE THE DECK'S, NOT ONE CALLER'S: the card row is read by the
// write path's fetchRowById, the codename column by the mod event state's
// codenameOfId, the live row by the fetch layer's retrieve path, the name
// triple by the Lexicon's idToLex. A prefetch only answers a reader whose
// statement string is IDENTICAL to the one it prefetched, so the strings
// live here and every reader uses them: a shape that drifts apart stops
// being answered by the prefetch, and the block's read falls back to the
// blocking path (correct, one round trip later, but a round trip the
// packing was supposed to remove).
//
// THE SET IS EVERY SHAPE THE SAVE PATH READS A CARD BY, and the widening is
// the point: the card-block declaration reaches ONE reader per shape, and a
// reader the declaration cannot name is a reader the save pays a round trip
// for. The seams the shapes belong to:
//
//   by id     the write path's fetchRowById, the read-rule write path's
//             fetchCardsRow, the mod event state's codenameOfId, the fetch
//             layer's retrieve path, the Lexicon's idToLex
//   by key    the fetch layer's retrieve path (the key arm) and the
//             mod-event runtime's codename-by-key
//   by pair   the Lexicon's compound lookup, the write path's junction read,
//             the follower's junction and content reads
//   by type   the follower's type-membership read

/** The card row, whatever its trash state. The write path's card fetch, the
 *  read-rule write path's fetchCardsRow, the ancestor walk's batch. */
export const CARD_ROW_BY_ID_SQL = "SELECT * FROM cards WHERE id = ? LIMIT 1";

/** The live (not trashed) card row. The fetch layer's retrieve path, the
 *  referer-content path's row read. */
export const LIVE_CARD_ROW_BY_ID_SQL = "SELECT * FROM cards WHERE id = ? AND trash = 0 LIMIT 1";

/** The codename column alone. The mod event state's codename read, the
 *  read-rule write path's codename read. */
export const CARD_CODENAME_BY_ID_SQL = "SELECT codename FROM cards WHERE id = ?";

/** The name triple (the row's own name and its two sides). The Lexicon's
 *  idToLex: the read that answers "what is this id called". */
export const CARD_NAME_TRIPLE_BY_ID_SQL = "SELECT name, left_id, right_id FROM cards WHERE id = ? LIMIT 1";

/** The live card row by key. The fetch layer's retrieve path, the key arm:
 *  the one name-shaped read the Lexicon does not own. */
export const CARD_ROW_BY_KEY_SQL = "SELECT * FROM cards WHERE key = ? AND trash = 0 LIMIT 1";

/** The codename column by key. The mod-event runtime's codename lookup. */
export const CARD_CODENAME_BY_KEY_SQL = "SELECT codename FROM cards WHERE key = ? AND trash = 0";

/** The id a KEY names. The Lexicon's own simple-name lookup
 *  (lexicon.rb#lex_to_id with the trash filter merged in). */
export const CARD_ID_BY_KEY_SQL = "SELECT id FROM cards WHERE key COLLATE NOCASE = ? AND trash = 0 LIMIT 1";

/** The id a CODENAME names: the lowest-id live card carrying that codename.
 *  The read-rule write path's type lookups (the deck's rule type cards are
 *  resolved by their codename, one at a time), and the deck's standard-card
 *  declaration (which finds them in this shape, so the readers of it cost no
 *  round trip). */
export const CARD_ID_BY_CODENAME_SQL =
  "SELECT id FROM cards WHERE codename = ? AND trash = 0 ORDER BY id LIMIT 1";

/** The id a JUNCTION names (a left id and a right id). The Lexicon's
 *  compound-name lookup, and the write path's junction read. */
export const CARD_ID_BY_JUNCTION_SQL =
  "SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 LIMIT 1";

/** The content of the junction a left id and a right id name. The
 *  follower's junction-content read. */
export const CARD_DB_CONTENT_BY_JUNCTION_SQL =
  "SELECT db_content FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 ORDER BY id LIMIT 1";

/** The id of the junction a left id and a right id name, lowest id first.
 *  The follower's junction read. */
export const CARD_ID_BY_JUNCTION_ORDERED_SQL =
  "SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 ORDER BY id LIMIT 1";

/** The ids of the cards of a type. The follower's type-membership read. */
export const CARD_IDS_BY_TYPE_SQL = "SELECT id FROM cards WHERE type_id = ?";
