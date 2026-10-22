// The deck's read-by-id shapes, named once.
//
// The save path reads a card by id in three shapes, and the transport
// packing (docs/reports/live-save-transport-design-2026-10-18.md) prefetches
// all three at once: the block's constant-id reads ride one round trip
// instead of one round trip per read.
//
// THE SHAPES ARE THE DECK'S, NOT ONE CALLER'S: the card row is read by the
// write path's fetchRowById, the codename column by the mod event state's
// codenameOfId, and the live row by the fetch layer's retrieve path. A
// prefetch only answers a reader whose statement string is IDENTICAL to the
// one it prefetched, so the strings live here and every reader uses them —
// a shape that drifts apart stops being answered by the prefetch, and the
// block's read falls back to the blocking path (correct, one round trip
// later, but a round trip the packing was supposed to remove).

/** The card row, whatever its trash state. The write path's card fetch. */
export const CARD_ROW_BY_ID_SQL = "SELECT * FROM cards WHERE id = ? LIMIT 1";

/** The codename column alone. The mod event state's codename read. */
export const CARD_CODENAME_BY_ID_SQL = "SELECT codename FROM cards WHERE id = ?";

/** The live (not trashed) card row. The fetch layer's retrieve path. */
export const LIVE_CARD_ROW_BY_ID_SQL = "SELECT * FROM cards WHERE id = ? AND trash = 0 LIMIT 1";
