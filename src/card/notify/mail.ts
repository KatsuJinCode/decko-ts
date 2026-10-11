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
// Inclusions are a stretch goal

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
   *  follow notification subjects can read "Jonas changed Jonas Following".
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
 *                   `{{` and `}}` are dropped)
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

/** The stock follower_notification_email template (card-mod-follow
 *  data/real.yml:65-99) carries more placeholders than the act trio:
 *  `{{_|link}}`, `{{_|url}}`, `{{_|list_of_changes}}`, `{{_|subedits}}`,
 *  `{{_|followed}}`, `{{_|unfollow_url}}` — the base_views.rb view
 *  bodies (set/all/notify/base_views.rb). Their VALUES are resolved from
 *  the act/act-stream (the render stream owns the view bytes: card
 *  links, history anchors, list rows); the mail renderer takes them
 *  per FORMAT (the same placeholder name resolves to different bytes in
 *  the text and html bodies — measured by the six-mail oracle:
 *  {{_|last_action_verb}} is the plain verb in text and the history
 *  anchor in html; the six-mail capture pins both).
 *
 *  `botAccountEmail` switches the From: to Ruby's
 *  safe_from_and_reply_to! rule (email_config.rb:52-79): the template's
 *  from FIELD is rendered through the email_text address machinery
 *  FIRST, so a NAME like "Decko Bot" resolves to the named card's
 *  account email before the name-parity check — the delivered From: is
 *  the BARE address (the six-mail oracle pins exactly this for all six
 *  mails; a "Name <email>" field keeps the quoted-name form). */
export interface StockMailExtras {
  readonly text?: Readonly<Record<string, string>>;
  readonly html?: Readonly<Record<string, string>>;
  readonly botAccountEmail?: string;
  /** Wrap the html part in the email_document envelope (card-mod-email
   *  set/all/email_html.rb:2-14) — the stock template's html_message
   *  renders THROUGH the EmailHtmlFormat#show wrapper, never as a bare
   *  div (the six-mail oracle pins every html body wearing it). */
  readonly wrapHtmlDocument?: boolean;
}

/** The email_document wrapper bytes (set/all/email_html.rb:2-14). The
 *  `<style>` block is the email stylesheet card's :compiled render —
 *  empty for an empty stylesheet (the capture app's state; a processor
 *  landing behind this constant changes nothing else). */
const EMAIL_DOCUMENT_HEAD =
  '<!DOCTYPE html>\n<html>\n  <head>\n    <meta http-equiv="Content-type" content="text/html;charset=UTF-8"/>\n    <style></style>\n  </head>\n  <body class="d0-email-body">\n    ';
const EMAIL_DOCUMENT_TAIL = "\n  </body>\n</html>\n";

/** The bare address of a From value ("Name" <addr> -> addr). */
export function addressOf(from: string): string {
  const m = /<([^>]*)>\s*$/.exec(from);
  return (m !== null ? m[1] : from).trim();
}

/** safe_from_and_reply_to! (email_config.rb:52-79), over the ALREADY
 *  address-resolved field content: `configured_from_name_and_email`
 *  splits "Name <email>"; `actual_email` = Mailer.default[:from]
 *  (defaultFrom, when the host configures one) || the resolved field
 *  email; the final fallback is the DeckoBot account email. The
 *  caller supplies the name->email resolution for the named-field case
 *  ("Decko Bot" -> the DeckoBot account's email) — the account ladder is
 *  the host's surface. */
export function resolveFromAddress(
  templateFrom: string | undefined,
  opts: { deckoBotEmail: string; defaultFrom?: string },
): string {
  const raw = templateFrom?.trim() ?? "";
  let confName: string | undefined;
  let confEmail: string | undefined;
  const bracket = /^([^<]*)<([^>]*)>$/.exec(raw);
  if (bracket !== null) {
    confName = bracket[1].trim() === "" ? undefined : bracket[1].trim();
    confEmail = bracket[2].trim();
  } else if (raw !== "" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
    confEmail = raw;
  } else if (raw !== "") {
    // a NAME field: the email_text renderer resolves it through the
    // named card's account email (email_field.rb:20-30); the caller
    // hands us that resolution for the Decko Bot card.
    confEmail = opts.deckoBotEmail;
  }
  const actual = opts.defaultFrom !== undefined && opts.defaultFrom !== "" ? opts.defaultFrom : (confEmail ?? opts.deckoBotEmail);
  const confText = confName ?? confEmail;
  if (confText !== undefined && confText !== actual) {
    return `"${confText}" <${actual}>`;
  }
  return actual;
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
  extras?: StockMailExtras,
): MailMessage {
  const baseVars: Record<string, string> = {
    follower: notice.follower,
    followed_set: notice.followedSet,
    follow_option: notice.followOption,
  };
  if (act !== undefined) {
    // The stock template's act-relative placeholders (mod/follow
    // data/real.yml subject; citations on interpolateTemplate).
    baseVars["_|name"] = act.cardName;
    baseVars["_|last_action_verb"] = act.verb;
    baseVars["_user|name"] = act.userName;
  }
  const subject = interpolateTemplate(
    template.subject,
    { ...baseVars, ...(extras?.text ?? {}) },
  );
  const textBody = interpolateTemplate(
    template.textBody ?? "",
    { ...baseVars, ...(extras?.text ?? {}) },
  );
  const htmlBody =
    template.htmlBody === undefined
      ? undefined
      : interpolateTemplate(template.htmlBody, { ...baseVars, ...(extras?.html ?? {}) });
  const wrappedHtml =
    htmlBody !== undefined && extras?.wrapHtmlDocument === true
      ? EMAIL_DOCUMENT_HEAD + htmlBody + EMAIL_DOCUMENT_TAIL
      : htmlBody;
  const from =
    extras?.botAccountEmail !== undefined
      ? resolveFromAddress(template.from, { deckoBotEmail: extras.botAccountEmail })
      : template.from;

  // email_config.rb:65: reply_to ||= actual_email, the bare address the
  // From rule settled on.
  const replyTo = extras?.botAccountEmail !== undefined ? addressOf(from) : undefined;
  return {
    to: template.to,
    from,
    ...(replyTo !== undefined ? { replyTo } : {}),
    subject,
    textBody,
    ...(wrappedHtml !== undefined && wrappedHtml.length > 0 ? { htmlBody: wrappedHtml } : {}),
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
