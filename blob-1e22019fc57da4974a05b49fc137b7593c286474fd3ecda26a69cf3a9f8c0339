// The card_references IN-direction write path: the REFEREE side of the
// reference table — backfilling the referee_id column when the card a set
// of rows points at is created or renamed. This is the rename/create twin
// of refresh-references-out.ts (which owns the referer side: delete +
// rebuild of a card's own out-rows).
//
// Ruby trail (card-1.110.0; every behavior cites its source):
// - event :refresh_references_in, :finalize, changed: :name, on: :save
//   (mod/core/set/all/reference_events.rb:22-25):
//     Reference.unmap_referees id if action == :update && skip_update_referers?
//     Reference.map_referees key, id
// - unmap_referees (lib/card/reference.rb:31-33): UPDATE ... SET
//   referee_id = NULL WHERE referee_id = id — the "past tense" write. Rows
//   that pointed at this card stop pointing, because the card's name LEFT
//   its key: the event fires only when the referer-content rewrite
//   (update_referer_content) is skipped, and skipped renames keep stale
//   rows whose key no longer belongs to this id.
// - map_referees (reference.rb:26-28): UPDATE ... SET referee_id = id
//   WHERE referee_key = key — the "present tense" write. EVERY row keyed
//   to the card's current key picks up the id with NO ref_type filter:
//   "L" links, "I" inclusions, "P" partials (all.rb:10) — and Ruby's "Q"
//   query-reference rows — all backfill alike. This is the arm that lets
//   a card created AFTER its referers (or a renamed card) adopt rows that
//   were written with referee_id NULL.
// - `changed: :name, on: :save` fires on creates AND renames; the unmap
//   arm additionally needs action == :update (a create has no stale rows
//   of its own) plus the update_referer_content skip; the engine passes
//   unmapExisting: true when the rename's skip list names that event
//   (UpdateCardInput.skip, the rename form's card[skip]).
// - Descendants do NOT run this event: rename_as_descendant
//   (reference_events.rb:39-46) invokes method bodies directly — the
//   commented-out "# refresh_references_in" there (lines 42-43) marks the
//   deliberate omission — so only the renamed card itself backfills.
//
// Known non-wired corner (documented, not ported): the trashed
// rename-obstacle save (rename_as_trash_obstacle, name_events.rb:83-87)
// runs the event in Ruby, but map_referees keyed "<name>*trash" has no
// matching rows in practice; the TS obstacle rename in
// card-action-engine.ts omits it.

import type { SQLDatabaseDriver } from "../../server/driver.js";

/** Reference.unmap_referees (lib/card/reference.rb:31-33): rows pointing
 *  at this id lose the id ("past tense"). */
export async function unmapReferees(driver: SQLDatabaseDriver, refereeId: number): Promise<void> {
  await driver.query("UPDATE card_references SET referee_id = NULL WHERE referee_id = ?", [
    refereeId,
  ]);
}

/** Reference.map_referees (lib/card/reference.rb:26-28): every row keyed
 *  to referee_key adopts referee_id ("present tense"), all ref_types. */
export async function mapReferees(
  driver: SQLDatabaseDriver,
  refereeKey: string,
  refereeId: number,
): Promise<void> {
  await driver.query("UPDATE card_references SET referee_id = ? WHERE referee_key = ?", [
    refereeId,
    refereeKey,
  ]);
}

/** event :refresh_references_in body (reference_events.rb:22-25). Callers
 *  gate on the `changed: :name` condition; `unmapExisting` is the
 *  `action == :update && skip_update_referers?` arm. */
export async function refreshReferencesIn(
  driver: SQLDatabaseDriver,
  cardId: number,
  cardKey: string,
  opts: { unmapExisting?: boolean } = {},
): Promise<void> {
  if (opts.unmapExisting === true) {
    await unmapReferees(driver, cardId);
  }
  await mapReferees(driver, cardKey, cardId);
}
