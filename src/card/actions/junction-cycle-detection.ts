// Junction-graph cycle detection for the action layer: reject a Set/Save
// that would make a card its own ancestor.
//
// The graph: a compound (junction) card "L+R" is a CHILD of L and of R —
// its cards row carries left_id/right_id and its name is composed from the
// side cards' names (post-2020 virtual names,
// 20200718051236_compound_names_do_not_store_name_and_key.rb). Ancestors of
// a card are therefore everything reachable from its left_id/right_id
// through the same edges — lib/card/name/all/descendants.rb:26-31
// (`each_child`: "(left_id = id or right_id = id) and trash is false").
//
// RUBY DIVERGENCE: Ruby does
// not reject self-ancestry at save time. The direct case (a side resolving
// to the card's own id) is RESTRUCTURED by prepare_obstructed_side
// (mod/core/set/all/name_events.rb:143-150 — the card's own name is cleared
// and a fresh subcard takes the side), and an indirect cycle (rename a part
// so an existing junction becomes its own ancestor) is not detected at all.
// The port rejects both with a "cycle" error: a graph that makes a card its
// own ancestor makes composed-name reads diverge (the recursive Lexicon
// walk never terminates), so the guard is a correctness requirement of the
// virtual-name design, not gold-plating.

import type { SQLDatabaseDriver } from "../../server/driver.js";
import type { CardsRow } from "../../server/schema.js";
import { CardActionError } from "./types.js";

/** Walk the junction graph upward from the PROPOSED side ids; throw a
 *  "cycle" CardActionError when `cardId` is reachable (it would become its
 *  own descendant). Trashed rows are skipped — they are invisible to the
 *  name composition the cycle would corrupt. */
export async function assertNotOwnAncestor(
  driver: SQLDatabaseDriver,
  cardId: number,
  sideIds: readonly (number | null | undefined)[],
): Promise<void> {
  const visited = new Set<number>();
  let frontier = sideIds.filter(
    (id): id is number => typeof id === "number" && Number.isInteger(id),
  );
  while (frontier.length > 0) {
    if (frontier.includes(cardId)) {
      throw new CardActionError(
        "cycle",
        `save rejected: card ${cardId} would become its own ancestor`,
      );
    }
    const next: number[] = [];
    for (const id of frontier) {
      if (visited.has(id)) continue;
      visited.add(id);
      const result = await driver.query<Pick<CardsRow, "left_id" | "right_id" | "trash">>(
        "SELECT left_id, right_id, trash FROM cards WHERE id = ? LIMIT 1",
        [id],
      );
      const row = result.rows[0];
      if (row === undefined || row.trash === 1) continue;
      if (row.left_id !== null) next.push(row.left_id);
      if (row.right_id !== null) next.push(row.right_id);
    }
    frontier = next;
  }
}
