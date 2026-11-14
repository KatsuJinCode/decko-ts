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
 * blank. The caller supplies the actor — the engine resolves it from the
 * session (src/card/auth) or a system job passes one explicitly; this
 * helper only encodes the ||= fill order for callers that have an optional
 * actor.
 */
export function assignActor(
  actorId: number | null | undefined,
  currentActorId: number,
): number {
  return actorId ?? currentActorId;
}

/**
 * UTC datetime TEXT for SQLite storage, in exactly the form ActiveRecord
 * writes: `quoted_date` (activerecord-7.2 connection_adapters/abstract/
 * quoting.rb:184-198) is `value.to_fs(:db)`, "YYYY-MM-DD HH:MM:SS", plus
 * "." and six microsecond digits only when the microseconds are not zero.
 * A JavaScript Date carries milliseconds, so the fraction, when present, is
 * the milliseconds followed by "000". Rows the port and Ruby write to one
 * deck therefore hold the same text for the same instant, and compare and
 * sort the same way as text.
 */
export function sqlDateTime(date: Date): SQLDateTime {
  const iso = date.toISOString();
  const seconds = `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
  const ms = date.getUTCMilliseconds();
  return ms === 0 ? seconds : `${seconds}.${String(ms).padStart(3, "0")}000`;
}
