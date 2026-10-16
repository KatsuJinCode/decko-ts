// notify/follow-notify.ts — the follow-rule email trigger.
//
// Ruby analogue:
//   card-mod-follow set/all/notify.rb:8-11
//     event :notify_followers_after_save, :integrate_with_delay,
//            on: :save, priority: 20, when: :notable_change? do
//       notify_followers
//     end
//   card-mod-follow set/all/notify.rb:13-25 (silence + notable_change?)
//   card-mod-follow set/all/notify.rb:41-60 (notify_followers +
//     notify_followers_of + notify_follower)
//
//   card-mod-follow set/right/account.rb:1-7  (send_change_notice)
//   card-mod-follow set/right/account.rb:9-21 (notify_of_act)
//
// The TS port reproduces the shape: the trigger evaluates a "who follows
// this card?" lookup, renders one MailMessage per follower with a
// delivery-target email, and hands each message to the transport. The
// lookup is a function the trigger accepts (FollowerResolver); callers own
// that lookup against the rule algebra — this file carries no DB driver
// dependency.

import {
  interpolateTemplate,
  renderMail,
  type EmailTemplate,
  type StockMailExtras,
  type FollowNotice,
  type FollowNoticeAct,
} from "./mail.js";
import { FollowerStash } from "./follower-stash.js";
import type {
  MailMessage,
  NotifyActor,
  NotifyContext,
  SavePathAct,
  SavePathEvent,
  SavePathIntegrationHook,
} from "./types.js";

/** The minimum a follow rule returns from its lookup. Mirrors Ruby's
 *  `each_direct_follower_id_with_reason` (card-mod-follow
 *  set/all/follow/followed_by.rb:79-84): the follower's user-id, the
 *  followed SET card's name, and the option name (always / created /
 *  edited / never — with brackets stripped, notify.rb:69-70). */
export interface FollowerRef {
  readonly followerId: number;
  readonly followerName: string;
  /** Pre-resolved delivery target. The follow rule resolves to a user
   *  card with `+email`; this string is that field's content (or the
   *  decko default when none). The trigger skips the message if null —
   *  Ruby's `return unless email.present?` (set/right/account.rb:2). */
  readonly followerEmail: string | null;
  readonly followedSetName: string;
  readonly followOption: string;
}

/** Resolves the followers of one card. The caller supplies this against
 *  the rule algebra; tests supply an inline resolver so the trigger is
 *  deterministic. Async allowed: a real resolver
 *  (follower-resolver.ts) reads the deck's rule storage. Rendering is
 *  unaffected — fire() awaits before rendering. */
export type FollowerResolver = (
  cardId: number | null,
  event: SavePathEvent,
) => readonly FollowerRef[] | Promise<readonly FollowerRef[]>;

/** Where the email template comes from. Ruby reads
 *  `Card[:follower_notification_email]` + its `+subject` /
 *  `+text_message` / `+html_message` children, all stamped as
 *  `*content` views; the TS port treats the template as a triple of
 *  literals (the resolver may rewrite those literals from the deck). May
 *  be async: a deck-backed resolver reads those children through the async
 *  fetch engine (test sugar stays sync). */
export type EmailTemplateResolver = () => EmailTemplate | Promise<EmailTemplate>;

/** Build the follow-notify integration hook. The returned
 *  SavePathIntegrationHook is a registration the host attaches to the
 *  action engine via CardActionEngineOptions.integrationHooks. */
export interface FollowNotifyDeps {
  /** Stock Act#card and changes_visible? resolved before Auth.as(recipient).
   * The primary card may have no action when only its fields changed. */
  readonly actContext?: (act: SavePathAct) => Promise<{
    cardId: number | null;
    cardName: string | null;
    changesVisible: boolean;
  }>;
  /** The "who follows the saved card?" lookup. The caller supplies this
   *  against the rule algebra (card-mod-follow set/all/follow.rb —
   *  direct/indirect follower walks). */
  readonly followers: FollowerResolver;
  /** The "what is the email template" lookup. The caller supplies this
   *  against the EmailTemplate type card (card-mod-email
   *  set/type/email_template.rb); a literal triple of strings is the
   *  fallback, and production wiring loads it from a card. */
  readonly template: EmailTemplateResolver;
  /** Authenticated-actor resolver. Ruby does `Auth.as(left.id)` for each
   *  follower (set/right/account.rb:15-21); the port mirrors that with a
   *  per-fire actor swap. The dep returns the actor the template runs
   *  as. */
  readonly authAs: (followerId: number, followerName: string) => NotifyActor;
  /** The deck's configured from address; the template's from field
   *  wins when set (card-mod-email set/type/email_template.rb:80-88). */
  readonly defaultFrom: string;
  /** The per-follower nest values (follow-mail-views.ts). When present the
   *  mail is rendered as Ruby delivers it: every nest filled per format,
   *  the html part in the email document wrapper. Absent: placeholders
   *  fall back to their bare names. */
  readonly views?: (input: {
    act: SavePathAct;
    actCardId: number;
    ref: FollowerRef;
  }) => Promise<{ text: Record<string, string>; html: Record<string, string> }>;
  /** The Decko Bot account's address: the template's "Decko Bot" from
   *  field resolves to it (safe_from_and_reply_to!). */
  readonly deckoBotEmail?: string;
}

const STAGE: SavePathIntegrationHook["stage"] = "integrate_with_delay";

/** Mirrors Ruby's `notable_change?` (card-mod-follow notify.rb:16-25):
 *   !silent_change? && current_act_card? && auth != DeckoBot && followable?
 * This port drops `followable?` (the per-card-type opt-out) — add it back
 * once the rule algebra is wired. */
function isNotable(event: SavePathEvent): boolean {
  if (event.silent === true) return false;
  if (event.actor.name === "*Decko Bot") return false;
  return true;
}

/** One-follower delivery. Mirrors card-mod-follow notify.rb:55-58 +
 *  set/right/account.rb:1-21. The follow rule's `changes_visible?`
 *  check (set/right/account.rb:9-11) is upstream — the trigger assumes
 *  it has already been done (tests may skip it). */
async function notifyFollower(
  ref: FollowerRef,
  template: EmailTemplate,
  ctx: NotifyContext,
  act: FollowNoticeAct,
  extras?: StockMailExtras,
): Promise<void> {
  if (ref.followerEmail === null) return; // return unless email.present?
  const notice: FollowNotice = {
    follower: ref.followerName,
    followedSet: ref.followedSetName,
    followOption: ref.followOption,
  };
  const msg = renderMail({ ...template, to: ref.followerEmail }, notice, act, extras);
  try {
    await ctx.transport.sendMail(msg);
    ctx.logger?.(`[notify] sent follow mail to ${ref.followerEmail} (${ref.followerName})`);
  } catch (err) {
    // Ruby's Net::SMTPError rescue (card-mod-email
    // set/type/email_template.rb:6). Surface the error rather than
    // silently dropping — the action engine already finished the save,
    // so the failure is async-only.
    ctx.logger?.(`[notify] FAIL to=${ref.followerEmail} subject=${JSON.stringify(msg.subject)} err=${(err as Error).message}`);
  }
}

/** The act-level delivery (notify_followers_of, set/all/notify.rb:49-55 +
 *  notify_follower :57-59 + account.rb:9-21): the stash's followers, each
 *  ONCE, the mail about THE ACT (act.card context — {{_|name}} = the act
 *  card's name, {{_|last_action_verb}} = the act's main action's verb,
 *  {{_user|name}} = the act actor). */
async function notifyFollowersOfAct(
  act: SavePathAct,
  deps: FollowNotifyDeps,
  ctx: NotifyContext,
  stash: FollowerStash,
  mainAction: SavePathEvent,
): Promise<void> {
  const actContext = await deps.actContext?.(act);
  if (actContext !== undefined && !actContext.changesVisible) return;
  const template = await deps.template();
  if (template.subject.length === 0 && template.textBody.length === 0 && (template.htmlBody?.length ?? 0) === 0) {
    // Empty template — Ruby's `Card[:follower_notification_email]`
    // defaults carry a stocked subject + body. A blank template
    // here means the deck hasn't configured one yet; skip silently
    // rather than send blank mail.
    return;
  }
  // The act the templates render against: account.rb:18 delivers with
  // context = act.card; the verb is the act's MAIN action's action_type
  // + "d" (base_views.rb:44-46 — action_on(card_id) || actions.first,
  // mod/history lib/card/act.rb; the caller resolves mainAction). The
  // multi-action act machinery: one mail per follower about the act,
  // never one per action.
  const followAct: FollowNoticeAct = {
    userName: act.actor.name,
    verb: `${mainAction.verb}d`,
    cardName: actContext?.cardName ?? act.actCardName ?? mainAction.card?.name ?? "",
  };
  for (const ref of stash.followers()) {
    if (ref.followerId === act.actor.id) continue; // notify.rb:51 `next if follower == act.actor`
    // Ruby wraps each follower's delivery in Auth.as(left.id)
    // (card-mod-follow set/right/account.rb:15-21); the port runs the
    // per-follower resolver at the same swap point. Rendering is
    // actor-independent, so the resolved actor is not consumed
    // downstream.
    deps.authAs(ref.followerId, ref.followerName);
    const actCardId = actContext?.cardId ?? mainAction.card?.id ?? null;
    let extras: StockMailExtras | undefined;
    if (deps.views !== undefined && actCardId !== null) {
      const views = await deps.views({ act, actCardId, ref });
      extras = {
        text: views.text,
        html: views.html,
        wrapHtmlDocument: true,
        ...(deps.deckoBotEmail !== undefined ? { botAccountEmail: deps.deckoBotEmail } : {}),
      };
    }
    await notifyFollower(ref, template, ctx, followAct, extras);
  }
}

/** Build the hook. The hook fires once per SavePathEvent in the
 *  just-completed act; for every follower of the affected card we
 *  render and send one MailMessage.
 *
 *  The hook SKIPS the delete path (Ruby uses a separate event —
 *  notify.rb:25-26 `event :notify_followers_after_delete, :integrate,
 *  on: :delete`). That arm can be wired separately; this file is the SAVE
 *  path only. */
export function buildFollowNotifyHook(deps: FollowNotifyDeps): SavePathIntegrationHook {
  /** The per-act walk (notify_followers, set/all/notify.rb:37-41 +
   *  act_followers :66-73): ONE FollowerStash over the act's actions'
   *  cards (skip delete-path events — the delete arm is a separate hook;
   *  skip card-less actions, :69), then one mail per stashed follower
   *  about the act. The main action resolves as act.rb's does:
   *  action_on(card_id) — the act-card event by NAME, actCardName being
   *  the engine's act.card — falling back to the act's first action when
   *  the act card itself recorded no action (a no-op main card's
   *  multiedit; mod/history lib/card/act.rb main_action). */
  const fireActOnce = async (act: SavePathAct, ctx: NotifyContext): Promise<void> => {
    if (act.events.length === 0) return;
    // A delete act (notify.rb:20-31): stash_followers checks every deleted
    // card into the act's stash at :store, before the trash flag lands, and
    // notify_followers_after_delete mails at :integrate. The resolver reads
    // a delete-path card from the trash for that reason. A save act keeps
    // skipping its incidental delete actions.
    const deleteAct = act.events[0].isDeletePath === true;
    const stash = new FollowerStash(deps.followers);
    for (const event of act.events) {
      if (event.isDeletePath === true && !deleteAct) continue;
      await stash.checkCard(event.card?.id ?? null, event);
    }
    if (stash.followers().length === 0) return;
    const mainAction =
      act.events.find((e) => act.actCardName != null && e.card?.name === act.actCardName) ??
      act.events[0];
    await notifyFollowersOfAct(act, deps, ctx, stash, mainAction);
  };

  return {
    stage: STAGE,
    name: "follow_notification_after_save",
    // card-mod-follow set/all/notify.rb: `event :notify_followers_after_save`
    event: "notify_followers_after_save",
    priority: 20,
    notable: isNotable,
    async fire(event: SavePathEvent, ctx: NotifyContext): Promise<void> {
      // Single-event act (the legacy per-event seam): the stash over one
      // event's card is the pre-act-machinery behavior, byte-for-byte.
      await fireActOnce(
        {
          actId: event.actId,
          actor: event.actor,
          silent: event.silent === true,
          events: [event],
          actCardName: event.card?.name ?? null,
        },
        ctx,
      );
    },
    fireAct: fireActOnce,
  };
}

/** Test sugar: a `FollowerResolver` that returns a fixed array. */
export function fixedFollowerResolver(
  followers: readonly FollowerRef[],
): FollowerResolver {
  return () => followers;
}

/** Test sugar: a `EmailTemplateResolver` that returns a fixed triple. */
export function fixedTemplateResolver(
  template: EmailTemplate,
): EmailTemplateResolver {
  return () => template;
}

/** Test sugar: a `NotifyActor` resolver that returns the literal. */
export function fixedAuthAs(actor: NotifyActor): (id: number, name: string) => NotifyActor {
  return () => actor;
}

export { interpolateTemplate };
export type { MailMessage };
