// notify/mail.ts — render an email template into a MailMessage.
//
// Ruby analogue:
//   card-mod-email set/type/email_template.rb:1-50
//     EMAIL_FIELDS = [:to, :from, :cc, :bcc, :attach, :subject,
//                     :text_message, :html_message]
//     def email_config context, fields={}, opts={} ...
//
//   card-mod-email set/type/email_template.rb:9-19  (format { def mail ... })
//     mail = Card::Mailer.new_mail config do
//       fmt.message_body self, config
//       fmt.add_attachments self, config.delete(:attach)
//     end
//
//   card-1.110.0 lib/card/mailer.rb:9-16 (Card::Mailer.new_mail)
//     Mail.new(args, &block).tap do |mail|
//       method = Card::Mailer.delivery_method
//       mail.delivery_method(method, send(:"#{method}_settings"))
//       ...
//     end
//
// The TS port reproduces the EMAIL_FIELDS shape minus :attach (file
// attachments ride on the FileCard machinery, which is a later stream).
// Each field value is the literal string stored on the corresponding
// `+field` card — for the first mechanism (follow notification) the
// subject + text_message are literal strings, no inclusions or views.
// Inclusions are a stretch goal documented in docs/notify-port-notes.md.

import type { MailMessage } from "./types.js";

/** Subject + text body + html body from the email template card structure.
 *  Mirrors Ruby's EMAIL_FIELDS (card-mod-email
 *  set/type/email_template.rb:24-26). */
export interface EmailTemplate {
  /** The explicit To: field (the follower's email). Ruby passes this
   *  in via `fields[:to]`; set/right/to.rb:1-2 default-renders a list
   *  when no override. For our first mechanism the caller owns the to. */
  readonly to: string;
  /** The From: field. Card "from" with no per-template override is the
   *  deck's Card.config.email_defaults[:from], with a "Name <email>"
   *  construction (set/type/email_template.rb:55-79). */
  readonly from: string;
  /** The Subject: field — INTERPOLATED against the active_notice hash so
   *  follow notification subjects can read "John changed John Following".
   *  Ruby's `contextual_content` walks inclusions; the first-mechanism
   *  port uses simple {{name}} substitution (extension point for the
   *  render module). */
  readonly subject: string;
  /** The plain-text body. May be empty (the renderer will skip text_body
   *  when empty and prefer html, matching body_method_and_args' html
   *  branch — set/type/email_template.rb:21-30). */
  readonly textBody: string;
  /** The HTML body. Optional. */
  readonly htmlBody?: string;
}

/** The hash passed via `opts[:active_notice]` from card-mod-follow
 *  set/right/account.rb:16-21. Three keys: follower (user name as string),
 *  followed_set (followed set's name as string), and follow_option
 *  ("always" / "created" / "edited" / "never", with brackets stripped —
 *  notify.rb:69-70). The TS port uses camelCase keys for the in-memory
 *  notice; the substitution vars fold both spellings together so the
 *  email template may use either form. */
export interface FollowNotice {
  readonly follower: string;
  readonly followedSet: string;
  readonly followOption: string;
}

/** The act the notification is about — the values behind the stock
 *  template's act-relative placeholders. `verb` is the rendered verb
 *  (base_views.rb:45-47: main action_type + "d" — created/updated/
 *  deleted); `cardName` is the act card's name (account.rb:18 delivers
 *  with context = act.card); `userName` the act actor's name. */
export interface FollowNoticeAct {
  readonly userName: string;
  readonly verb: string;
  readonly cardName: string;
}

/** Single-pass rendering of `{{key}}` placeholders, mirroring Ruby's
 *  `contextual_content` semantics for cards that do NOT resolve to a
 *  real card name. The M6 real-oracle capture
 *  (fixtures/captured/follow-notification.json) proves the rule:
 *
 *    subject tmpl  `{{follower}} changed {{followed_set}} on {{follow_option}}`
 *    real Ruby     `follower changed followed_set on follow_option`
 *                   (no braces; the placeholder NAME is rendered, the
 *                    `{{` and `}}` are dropped)
 *    doc reference card-mod-content set/all/contextual_content.rb:13-19
 *                   + card-mod-email set/abstract/email_field.rb:22-26
 *                   (compact_missing view → default render of card-name)
 *
 *  `vars` maps placeholder text (including any |view suffix, verbatim) to
 *  the resolved value; an absent key renders the placeholder's BARE name
 *  (braces dropped), the captured rule.
 *
 *  The act-relative shapes the stock template carries
 *  (mod/follow/data/real.yml follower_notification_email subject
 *  `{{_user|name}} {{_|last_action_verb}} "{{_|name}}"`) resolve through
 *  the same map: `_|name` -> the act card's name (account.rb:18 delivers
 *  with context = act.card), `{{_|last_action_verb}}` -> the act verb
 *  (base_views.rb:45-47 last_action_verb = main action_type + "d"),
 *  `{{_user|name}}` -> the act actor's name (the resolved output the
 *  features pin: update_includers.feature:19 "Joe User created ..."). */
export function interpolateTemplate(
  template: string,
  vars: Readonly<Record<string, string>>,
): string {
  return template.replace(/\{\{\s*([a-zA-Z_]+(?:\|[a-zA-Z_]+)?)\s*\}\}/g, (_whole, key: string) => {
    const value = vars[key];
    return value !== undefined ? value : key.split("|")[0];
  });
}

/** Render one MailMessage from an EmailTemplate + the active_notice
 *  substitution vars. The function is pure — no side effects, no
 *  transport call — so it can be tested against the hand-derived Ruby
 *  output without any DB or fetch context.
 *
 *  Defaults that match Ruby when no per-template override is set
 *  (set/type/email_template.rb:80-88):
 *   - `reply_to` is set to the actual `from` address unless overridden
 *     (we do not expose reply_to yet — it is in the MailMessage but the
 *     transport decides whether to write a Reply-To header).
 *   - `charset` defaults to "utf-8" (lib/card/mailer.rb:21-22).
 */
export function renderMail(
  template: EmailTemplate,
  notice: FollowNotice,
  act?: FollowNoticeAct,
): MailMessage {
  const vars: Record<string, string> = {
    follower: notice.follower,
    followed_set: notice.followedSet,
    follow_option: notice.followOption,
  };
  if (act !== undefined) {
    // The stock template's act-relative placeholders (mod/follow
    // data/real.yml subject; citations on interpolateTemplate).
    vars["_|name"] = act.cardName;
    vars["_|last_action_verb"] = act.verb;
    vars["_user|name"] = act.userName;
  }
  const subject = interpolateTemplate(template.subject, vars);
  const textBody = interpolateTemplate(template.textBody ?? "", vars);
  const htmlBody = template.htmlBody === undefined
    ? undefined
    : interpolateTemplate(template.htmlBody, vars);

  return {
    to: template.to,
    from: template.from,
    subject,
    textBody,
    ...(htmlBody !== undefined && htmlBody.length > 0 ? { htmlBody } : {}),
    tags: {
      trigger: "follow_notification",
      follower: notice.follower,
      followed_set: notice.followedSet,
      follow_option: notice.followOption,
    },
  };
}

/** Build a one-line plain text envelope for tests/CLI. NOT what the
 *  transport sends — transports own their own envelope. Used by the
 *  capture snapshot test to assert "everything that was rendered, in
 *  one place". */
export function mailToString(msg: MailMessage): string {
  const headers = [
    `From: ${msg.from}`,
    `To: ${msg.to}`,
    msg.cc ? `Cc: ${msg.cc}` : null,
    msg.bcc ? `Bcc: ${msg.bcc}` : null,
    `Subject: ${msg.subject}`,
  ].filter((l): l is string => l !== null);
  const body = msg.textBody;
  const html = msg.htmlBody ? `\n---html---\n${msg.htmlBody}` : "";
  return `${headers.join("\n")}\n\n${body}${html}`;
}
