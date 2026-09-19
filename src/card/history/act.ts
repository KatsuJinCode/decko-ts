// Card::Act write-side semantics, ported from the Ruby truth:
// card-mod-history-0.20.0/lib/card/act.rb plus the Director machinery that
// creates act rows (card-1.110.0/lib/card/director/class_methods.rb).

import type { SQLDateTime } from "../../server/schema.js";

/** One card_acts row: "Each act records the actor_id, the card_id of the
 *  act's primary card, acted_at, and the ip_address of the actor where
 *  applicable" (act.rb:14-17). */
export interface ActAttributes {
  /** The act's primary card (the card the request started on), set at
   *  finalize time — event :finalize_act
   *  (card-mod-history set/all/history/events.rb:48-50,
   *  `Card::Director.act.update! card_id: id`). NULLable in the schema; the
   *  Ruby insert can happen before finalize_act knows the primary card. */
  card_id: number | null;
  /** Account id responsible for the act. */
  actor_id: number | null;
  /** Rails create-timestamp: "timestamp is set by rails on create"
   *  (act.rb:64-68, timestamp_attributes_for_create << "acted_at"). */
  acted_at: SQLDateTime | null;
  /** Captured from Env.ip at act creation
   *  (director/class_methods.rb:27-29, `Card::Act.new ip_address: Env.ip`). */
  ip_address: string | null;
}

/**
 * act.rb:131-134 — the before_save hook `assign_actor`:
 *
 *   def assign_actor
 *     self.actor_id ||= Auth.current_id
 *   end
 *
 * i.e. an explicitly provided actor wins; the current user only fills a
 * blank. The port has no auth layer yet (wave 3), so the writer takes a
 * required actorId; this helper encodes the ||= fill order for callers that
 * have an optional actor (e.g. system jobs that may pre-assign one).
 */
export function assignActor(
  actorId: number | null | undefined,
  currentActorId: number,
): number {
  return actorId ?? currentActorId;
}

/**
 * Canonical UTC datetime TEXT for SQLite storage — "YYYY-MM-DD HH:MM:SS.mmm"
 * (db/schema.sqlite.sql mapping decision: space separator, fixed width,
 * lexicographic order == chronological order). Ruby writes Rails datetime
 * timestamps (microsecond precision in MySQL); the SQLite schema stores
 * milliseconds.
 */
export function sqlDateTime(date: Date): SQLDateTime {
  return date.toISOString().replace("T", " ").replace("Z", "").slice(0, 23);
}
