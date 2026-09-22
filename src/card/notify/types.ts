// notify/types.ts — shared types for the notify module.
//
// Cross-stream contract (the save path is read-only for this stream; the
// SavePathIntegrationHook interface is the seam the actions stream wires
// in. See docs/notify-port-notes.md, "save-path hook interface"):
//
//   - Each save creates one act with N actions (the act's primary card's
//     action plus its subcard actions). The hook is invoked once per
//     action-shaped result in the act, with that action's payload.
//
// Ruby's source shape, named for the same concept:
//   - card-mod-follow set/all/notify.rb:8-11
//     event :notify_followers_after_save, :integrate_with_delay,
//            on: :save, priority: 20, when: :notable_change? do notify_followers end
//   - card-1.110.0 lib/card/director/phases.rb:33-39 (integration_phase)
//   - card-1.110.0 lib/card/director/stages.rb:8 (SYMBOLS table — the
//     integration phases listed)

import type { CardRecord } from "../fetch/card-record.js";
import type { Actor } from "../actions/types.js";

/** One minimal card-shaped record a follow notification needs. The fields
 *  are deliberately minimal — this is the trigger's view of "what was
 *  acted on", not the fetch engine's full shape. Storing a record (not an
 *  id) lets the trigger resolve the follower's account card + address
 *  without a second round-trip in tests; production callers may still
 *  pass null and re-fetch. */
export interface NotifyCardRef {
  readonly id: number | null;
  readonly name: string | null;
  readonly leftName: string | null;
  readonly rightName: string | null;
  readonly type: string | null;
  readonly content: string | null;
  readonly trashed: boolean;
}

/** The sign-in context at the time the trigger fires. Ruby authenticates
 *  the follower for `Auth.as(left.id)` (card-mod-follow set/right/account.rb:15-21);
 *  we pass the resolved actor through so the transport can include it in
 *  the message. */
export interface NotifyActor {
  readonly id: number;
  readonly name: string;
  readonly email: string | null;
}

/** One receipt from the save path that the notify module can act on.
 *  Mirrors Ruby's `Card::Act.actions(false)` walk
 *  (card-mod-follow set/all/notify.rb:48-54): for each action in the
 *  just-completed act we hand the trigger the affected card + a one-line
 *  description of what changed. */
export interface SavePathEvent {
  /** The card being acted on (the action's primary card or a subcard).
   *  null means the action's record could not be resolved (rare: a side
   *  card was deleted mid-flight). Ruby treats this as "silently skip"
   *  (notify.rb:49-50). */
  readonly card: NotifyCardRef | null;
  /** The verb: create / update / delete. Ruby's `action.action_type`
   *  (card-mod-history lib/card/action.rb:42, TYPE_OPTIONS). */
  readonly verb: "create" | "update" | "delete";
  /** The act id. Multiple actions in one save share the same act id
   *  (card-mod-follow notify.rb:43 — act.reload walks the same act). */
  readonly actId: number;
  /** The action id — useful for stable references in captures
   *  (notify.rb:71 — `notification_action` accepts an action_id). */
  readonly actionId: number;
  /** The actor responsible for this act. */
  readonly actor: NotifyActor;
  /** When true, the engine considers this a "silent" change (Ruby
   *  `card.silent_change?`, notify.rb:16-25). The default trigger skips
   *  silent events entirely. */
  readonly silent?: boolean;
  /** When the trigger runs at integrate_with_delay (card-mod-follow
   *  notify.rb:9) this is true; at integrate (delete path, notify.rb:25)
   *  it is false. The follow-notify trigger uses the flag only to
   *  distinguish between save-side and delete-side stashing. */
  readonly isDeletePath?: boolean;
}

/** The save-path integration hook (Ruby's `event :name, :stage, on: :save`
 *  + a `when:` predicate). The action engine will call fire() once per
 *  SavePathEvent in the just-completed act. The hook returns when it has
 *  done its work; the engine ignores the return value (errors propagate
 *  via throw — same contract as Ruby's RescuingInvalid). */
export interface SavePathIntegrationHook {
  /** Which Ruby stage this hook replaces. Used only for diagnostics;
   *  the engine doesn't schedule by stage (no delayed-job queue here). */
  readonly stage: "integrate" | "integrate_with_delay";
  /** Card-level guard. Returns true to fire, false to skip. Replaces
   *  `when: :notable_change?` (card-mod-follow notify.rb:16). */
  readonly notable: (event: SavePathEvent) => boolean;
  /** The work. Receives the full SavePathEvent and a per-call context
   *  (the transport; see below). */
  fire(event: SavePathEvent, ctx: NotifyContext): Promise<void>;
  /** Optional name for debug + capture diagnostics. */
  readonly name?: string;
}

/** Per-fire context handed to the hook. Carries the transport + a small
 *  amount of session metadata. */
export interface NotifyContext {
  /** Where the resulting MailMessage goes. The default (NoopTransport)
   *  drops messages — nothing mails by default. */
  readonly transport: NotifyTransport;
  /** Logger hook for diagnostics. The capture transport wires this; the
   *  no-op transport drops it. */
  readonly logger?: (line: string) => void;
}

/** The transport seam. One sendMail() per triggered message. The default
 *  (NoopTransport) discards; tests use CaptureTransport to record bytes.
 *  Real deployments wire an SMTP/Postmark/SES transport here. */
export interface NotifyTransport {
  /** Send one rendered MailMessage. May throw; the hook catches and logs
   *  (matching Ruby's Net::SMTPError rescue in
   *  card-mod-email set/type/email_template.rb:3-7). */
  sendMail(msg: MailMessage): Promise<void>;
  /** Human-readable name for capture diagnostics. */
  readonly name: string;
}

/** One rendered email. The shape is deliberately RFC-822-like: the
 *  transport decides whether to send plain text only, plain + html
 *  multipart, or convert to its provider's format. The mail-rendering
 *  layer populates the structured fields; the transport stringifies. */
export interface MailMessage {
  /** Recipient(s). A single string for the common case; the array form
   *  matches Ruby's `to:` when the destination is a list pointer
   *  (card-mod-email set/right/to.rb). Comma-separated, per RFC 5322. */
  readonly to: string;
  /** Sender (RFC 822 From:). */
  readonly from: string;
  /** Optional Cc / Bcc. */
  readonly cc?: string;
  readonly bcc?: string;
  /** Subject — already template-interpolated. */
  readonly subject: string;
  /** Text/plain body. */
  readonly textBody: string;
  /** Text/html body. Optional; when present the resulting wire format is
   *  multipart/alternative (card-mod-email set/type/email_template.rb:32-39). */
  readonly htmlBody?: string;
  /** Free-form tags — used by triggers to attach their context. The
   *  transport ignores them. */
  readonly tags?: Readonly<Record<string, string>>;
}

/** Re-export for adjacent consumers that want to type a stub CardRecord
 *  without depending on the fetch engine's full surface. */
export type { CardRecord };
export type { Actor };
