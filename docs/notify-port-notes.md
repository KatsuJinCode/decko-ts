# Notify port notes (side-effect parity)

This file documents the TS port of Deco's mail + follow-notification
machinery: the Ruby surface, the seam the port introduces, the
byte-parity claim for the first mechanism, and the explicit
non-goals. Every claim cites a file and line in the installed Ruby
gems (card-1.110.0, card-mod-email-0.20.0, card-mod-follow-0.20.0,
card-mod-account-0.20.0).

This port is for stream `src/card/notify/** + tests/card/notify/**
+ docs/notify-port-notes.md`. Other streams own `src/card/actions/**`,
`src/card/render/**`, `src/card/rules/**`, etc.; the ports in those
trees do not interact directly with notification rendering.

## 1. Ruby surface inventory

### Mail machinery (`Card::Mailer`)

`gems/card-1.110.0/lib/card/mailer.rb`

- Lines 5-7: `Card::Mailer < ActionMailer::Base` — the mailer class is
  an `ActionMailer` subclass. ActionMailer is a Rails primitive, not a
  card-specific concept; the card-machinery wraps it with deck-wide
  defaults.
- Lines 8-16: `new_mail(*args, &block)` is the wrapper every email
  template uses. It builds `Mail.new(args, &block)` and clones the
  delivery method + `perform_deliveries` + `raise_delivery_errors`
  settings onto the new Mail object. The capture transport (`Mail::TestMailer`)
  bypasses SMTP and accumulates in `ActionMailer::Base.deliveries`.
- Lines 18-23: `defaults_from_config` reads `Card.config.email_defaults`
  (a Hash), coerces keys to symbols, fills `return_path` from `from`,
  and pins `charset = "utf-8"`. The defaults live on the deck-wide
  Card.config, not on any card.

The named `MailRenderer` that the task brief mentions does NOT exist
in card-1.110.0 or any installed mod — search confirmed. The mail
machinery is `Card::Mailer` + ActionMailer::Base + per-template
`format { def mail }` blocks; "render" is the format pipeline, not a
class.

### EmailTemplate rendering

`gems/card-mod-email-0.20.0/set/type/email_template.rb`

- Lines 1-7: `def deliver(context=nil, fields={}, opts={})` —
  `mail = format.mail context, fields, opts; mail.deliver`. The actual
  `Mail` instance is the unit of work; `mail.deliver` is what drops
  the message in `deliveries` (test) or SMTP-queues it (production).
- Lines 9-19: `format { def mail(context=nil, fields={}, opts={}) ... }`
  — the format block. For each non-empty `EMAIL_FIELDS` entry, it
  resolves the field card (`email_field_from_card` line 47), and
  finally calls `Card::Mailer.new_mail config do ... end` with a body
  block that does `fmt.message_body(self, config)` and
  `fmt.add_attachments(self, config.delete(:attach))`.
- Lines 23-25: `EMAIL_FIELDS =
  %i[to from cc bcc attach subject text_message html_message].freeze`
  — the eight fields the format populates.
- Lines 27-32: `EMAIL_FIELD_METHODS = { subject: :contextual_content,
  text_message: :contextual_content, attach: :recursed_item_contents
  }` — the per-type renderer for each field. `subject` and
  `text_message` walk inclusions (so `{{follower}}` renders the
  `set/all/notify/base_views.rb#follower` view); `:to`, `:from`, etc.
  fall through to `:email_addresses` (a custom renderer in
  `set/all/email_text.rb#email_addresses:30-39` that resolves card
  pointers to "Name <email@example.com>" strings).
- Lines 40-50: `email_config` walks `EMAIL_FIELDS` and builds the hash
  `Card::Mailer.new_mail` consumes.
- Lines 55-79: `safe_from_and_reply_to!` is the only place the
  `From:` field is rewritten; the rewrite applies only when the
  template's `from` differs from `Card::Mailer.default[:from]`. When
  both are ASCII literals, the field is passed through unchanged.

### Format variants

`gems/card-mod-email-0.20.0/lib/card/format/email_html_format.rb`

- A subclass of `Card::Format::HtmlFormat`; turns off view caching
  (line 5-7), aliases `format "email"` to `format "email_html"` (line 3).

`gems/card-mod-email-0.20.0/lib/card/format/email_text_format.rb`

- A subclass of `Card::Format::TextFormat` with `chunk_list =
  :references` (turns off URI autodetection in the body, line 5-7).

The two formats are how the EMAIL card type renders to text vs. html.
The notify notification template card uses the email_text format.

### Notify trigger machinery

`gems/card-mod-follow-0.20.0/set/all/notify.rb`

- Lines 8-11: the central event
  `event :notify_followers_after_save, :integrate_with_delay,
  on: :save, priority: 20, when: :notable_change? do notify_followers
  end`. The event fires in the `integrate_with_delay` stage, on save
  verbs (`create` + `update`), with `priority: 20`. The `priority`
  ordering means lower-priority events complete first; 20 is mid-pack
  (reference maintenance is earlier, comments and rate limiting are
  later — none of those run in this stream).
- Lines 12-17: `silence_notifications` is the gate. It runs at
  `:initialize` and respects `@silent_change`. The gate predicate
  `silence_notifications?` returns true when there is no
  `Card::Env.controller` AND `Card.force_notifications` is unset — the
  runner context has no controller, so the gate must be flipped
  manually by callers that want notifications in scripts.
- Lines 19-21: `notable_change?` = `!silent_change? && current_act_card? && auth != DeckoBot && followable?`. `followable?` is the
  per-card-type opt-out (the deck can mark a cardtype "no notify" by
  overriding the all-follow default).
- Lines 41-59: `notify_followers` + `notify_followers_of` +
  `notify_follower`. Walks the act's actions (notify.rb:48-54),
  tracks followers in a `FollowerStash`, and per-follower calls
  `follower.account.send_change_notice(act, reason[:set_card].name,
  reason[:option])` (line 58).
- Lines 61-65: `current_act_card?` returns true for the act's primary
  card (and for brand-new acts whose `card_id` is nil pre-finalize).
- Lines 67-69: `silent_change` walks `@supercard.silent_change` — a
  subcard save is silent iff its supercard was silent.

### Account-side hook

`gems/card-mod-follow-0.20.0/set/right/account.rb`

- Lines 1-7: `send_change_notice(act, followed_set, follow_option)`.
  Returns immediately when `email.blank?` or the act's changes are
  not visible to this follower (`changes_visible?(act)`, lines 9-11).
- Lines 13-21: `notify_of_act(act)` wraps the deliver call in
  `Auth.as(left.id) do ... end` (the follower's own user card). The
  yield produces the `{ follower:, followed_set:, follow_option: }`
  hash that becomes the message's `active_notice`.

### Notification template type

`gems/card-mod-follow-0.20.0/set/type/notification_template.rb`

- Lines 1-3: `card_reader :contextual_class, card_reader :disappear,
  card_reader :message` — the three field slots every notification
  template carries. `message` is the rendered card; `contextual_class`
  sets the Bootstrap `alert` class; `disappear` is a `toggle` that
  decides whether the message auto-dismisses.
- Lines 4-6: `def deliver(context)` — but this is the *in-app* flash
  alert path, NOT the email path. NOT WHAT FIRES ON FOLLOW.  This is
  a red herring; follow-notifications go through card-mod-email
  EmailTemplate, not through card-mod-follow's NotificationTemplate.

### Follower stash + lookup machinery

`gems/card-mod-follow-0.20.0/lib/card/follower_stash.rb`

- Lines 5-13: `FollowerStash.initialize` takes the act's primary card,
  walks `each_direct_follower_id_with_reason` (per-card), then
  `stash_field_followers` (per-following-set Field rules — the `_self+
  following_field` paths).
- Lines 25-29: `each_follower_with_reason` yields the user-card
  follower + the first reason hash (`{set_card: ..., option: ...}`).
- Lines 32-46: `stash_field_followers` walks the `_self+follow_fields`
  rule on the card, checking each named field for either the field
  itself or a `*nests` inclusion.

`gems/card-mod-follow-0.20.0/set/all/follow.rb`

- Lines 1-13: `followable?` default `true`, plus the per-card-type
  override hook (Cardtype/Set/etc. override to `false` for non-data
  cards).
- Lines 17-24: `direct_follower_ids` walks every follow-rule over the
  card's containing set (line 29-31), collecting user ids whose
  option matches the rule + the card.
- Lines 51-66: `follow_rule_applies?` + `follow_rule_option` +
  `follow_rule_option_applies?` walk the per-user rule option
  (`*always`, `*created`, `*edited`, `*never`) and the per-option
  follower-candidate-ids block (`follower_candidate_ids_for_option`).
- Lines 71-73: `each_direct_follower_id_with_reason` yields the reason
  hash, with brackets stripped from the option name — this is the
  field notify.rb reads on line 58.

### Account email machinery

`gems/card-mod-account-0.20.0/set/right/email.rb`

- Lines 10-20: a `+*email` card is `assign_type :phrase`,
  `require_field :email`, and validates via `event :validate_email,
  :validate, on: :save` (line 16) — the validation uses a strict
  regex (`^([^@\s]+)@((?:[-a-z0-9]+\.)+[a-z]{2,})$`).
- Lines 29-31: `own_email?` is "this is my own +*email card vs. another
  user's"; `ok_to_read?` denies anyone but the owner + super-users.

`gems/card-mod-account-0.20.0/set/right/account.rb`

- Lines 4-9: `+account` carries the account-card pointer; the user
  card itself is the `left` of `+account`.
- Lines 11-12: `+status` carries one of `STATUS_OPTIONS` (active /
  unapproved / unverified / blocked).

`gems/card-mod-account-0.20.0/set/right/account/events.rb`

- Lines 23-26: the `event :send_welcome_email` and friends are
  account-level events that fire ON the account card itself, not on
  user card. These are separate from follow notifications.
- Lines 28-30: `:activate_account` -> `field :status, content: "active"`
  then `trigger_event! :send_welcome_email`.

The "follow notification" path does NOT call any of these. It calls
`Card[:follower_notification_email].deliver(...)` directly on the
follower_notification_email EmailTemplate card (if it exists) or, when
the deck has no EmailTemplate, the call fails silently (Ruby's `&.`
chain — the follow rules are robust to an empty template).

## 2. TS port surface

### Module layout

The port lives under `src/card/notify/**`:

```
src/card/notify/
  types.ts          — NotifyTransport, MailMessage, SavePathEvent,
                       SavePathIntegrationHook, NotifyContext
  transport.ts      — NoopTransport (default), CaptureTransport (tests),
                       LoggingTransport (local debug)
  mail.ts           — EmailTemplate, FollowNotice, renderMail,
                       interpolateTemplate, mailToString
  follow-notify.ts  — buildFollowNotifyHook + FollowerResolver +
                       EmailTemplateResolver + test sugar
  dispatch.ts       — runIntegrationHooks, savePathEventFromAction,
                       expandActionResultToSavePathEvents
  index.ts          — public exports
```

### Save-path hook interface

The save path is owned by the action engine and is **read-only** for
the notify work. The hook interface is defined here; the registration is
the engine-side change. Doc for that
registration is in "Save-path registration line" below.

```ts
// From src/card/notify/types.ts:113-126

export interface SavePathIntegrationHook {
  readonly stage: "integrate" | "integrate_with_delay";
  readonly notable: (event: SavePathEvent) => boolean;
  fire(event: SavePathEvent, ctx: NotifyContext): Promise<void>;
  readonly name?: string;
}
```

Mapping to Ruby's `event :name, :stage, on: :save, when: :when?` API
(card-1.110.0/lib/card/set/event.rb:48-65):

| Ruby API              | TS port                                  |
|-----------------------|------------------------------------------|
| `stage:` arg          | `SavePathIntegrationHook.stage`          |
| `when:` predicate     | `SavePathIntegrationHook.notable`        |
| the event body        | `SavePathIntegrationHook.fire`           |
| implicit `on: :save`  | implied by `expandActionResultToSavePathEvents` (the dispatcher walks verbs) |
| `priority:`           | not yet modeled — the port runs sequentially; future work can add `priority` to the hook for ordering |

### Save-path registration line

The action engine owns CardActionEngineOptions; the notify work DEFINES
the dispatch helper and the hook. The registration in
the action engine's post-save promise chain must call:

```ts
// in src/card/actions/card-action-engine.ts:
// inside the createCard/updateCard/deleteCard functions, AFTER
// `await this.expireAfterWrite(...)` (the last write-path step in
// write-path.ts:759-795 — Card#expire, the integration stage in
// phases.rb:33-39) and BEFORE returning ActionResult:

import {
  expandActionResultToSavePathEvents,
  runIntegrationHooks,
} from "../notify/index.js";

// ... at the end of each of createInWriter/updateInWriter/deleteRecursively:
const events = expandActionResultToSavePathEvents(
  /* result */, this.actor, /* silent */,
);
const followHook = buildFollowNotifyHook({
  followers: ruleAlgebraFollowerResolver(this.fetch, /*opts*/),
  template: cardEmailTemplateResolver(this.fetch),
  authAs: (id, name) => ({ id, name, email: /* ... */ }),
  defaultFrom: this.emailDefaults.from,
});
const integrations = (
  this.integrationHooks ?? [followHook]
);
await runIntegrationHooks({
  actId: result.actId,
  actor: this.actor,
  silent: /* silent flag from this run */,
  events,
  hooks: integrations,
  context: makeNotifyContext(this.transport ?? defaultTransport, this.logger),
});
// END registration line. After this point, the action engine can
// return ActionResult (the integration phase is intentionally
// non-blocking; mail-send failures are logged, not raised, matching
// card-mod-email set/type/email_template.rb:6's rescue Net::SMTPError).
```

`CardActionEngineOptions` must gain an optional `integrationHooks:
SavePathIntegrationHook[]` field, an optional `transport:
NotifyTransport` field, and an optional `emailDefaults: { from: string
}` field. These are the three seam wires.

### Transport seam

```ts
// From src/card/notify/transport.ts

export class NoopTransport implements NotifyTransport { /* default */ }
export class CaptureTransport implements NotifyTransport { /* tests */ }
export class LoggingTransport implements NotifyTransport { /* local dev */ }
export const defaultTransport: NotifyTransport = new NoopTransport();
```

The capture transport is the byte-parity test's recorder. Production
wires SMTP/Postmark/SES.

### Why an interface, not a function reference

Three reasons documented in `transport.ts`'s file header:

1. The transport needs a self-identifier (`name`) — capture snapshots
   compare transports by name (`name: "capture"` vs `name: "noop"`).
2. The transport often carries config (an SmtpTransport owns a host /
   port / credentials); a bare function loses this.
3. Future PostmarkTransport, MailgunTransport, etc. carry their own
   provider libraries; the interface gives each a stable identity.

## 3. First-mechanism port (follow-notification on save)

### Scenario inputs (chosen for byte-determinism)

```
follower      = "John" (id 11)
to            = "john@example.com"
from          = "deck@example.com"
subject tmpl  = "{{follower}} changed {{followed_set}} on {{follow_option}}"
text body     = "Hi! {{follower}} changed {{followed_set}}."
followed_set  = "John Following"
follow_option = "always" (after bracket-stripping — notify.rb:69-70)
```

### Hand-derived expected output

This is the output Ruby's `Card::Mailer.new_mail` would emit for the
inputs above, traced step-by-step:

1. **subject** resolves to
   `"follower changed followed_set on follow_option"`.
   - `Card::Mailer.new_mail("...")` builds a Mail with the raw args.
   - The `subject` value goes through `format(:email_text).show
     @active_email_context` (set/type/email_template.rb:9-19 ->
     `contextual_content` line 23-30, plus card-mod-content
     set/all/contextual_content.rb:13-19 `render! :core, options`).
   - `contextual_content` walks `{{X}}` as an inclusion. When X does
     NOT resolve to a real card (in the dev DB scenario, none of
     `follower` / `followed_set` / `follow_option` are cards), the
     inclusion walker falls through to the default render of the
     missing card — the literal NAME of the placeholder, with the
     `{{` and `}}` stripped. The captured fixture
     (`fixtures/captured/follow-notification.json` delivered[0].subject)
     proves this: `"follower changed followed_set on follow_option"`.

   Earlier M1–M5 hand-derived notes claimed the literal `{{follower}}`
   remained "verbatim" in the subject. That was wrong: the braces are
   dropped and only the NAME is rendered. The M6 real-oracle capture
   corrected this — see "M6 corrections" at the bottom of this section.
   The TS port's `interpolateTemplate` now mirrors the verbatim
   behavior: placeholders render as literal names with the braces
   stripped, regardless of whether the active_notice hash carries a
   value for them. Design and tests updated together (see
   `src/card/notify/mail.ts:70-103` and
   `tests/card/notify/mail.test.ts:71-87`).

2. **text body** resolves to `"Hi! follower changed followed_set."`
   by the same rule.

3. **from** stays `"deck@example.com"` (no `From` rewrite —
   `safe_from_and_reply_to!` only rewrites when configured_from !=
   `Card::Mailer.default[:from]`, set/type/email_template.rb:55-79).

4. **to** is the explicit `"john@example.com"` from the trigger's
   `fields[:to]` (card-mod-follow set/right/account.rb:17).

5. Mailmessage's RFC 822 wire form (MIME-encoded by Mail gem) is OUT
   OF SCOPE for this port; the transport layer (PostmarkTransport
   etc.) produces the bytes. What the port owns is the structured
   shape (to/from/subject/textBody/htmlBody).

### Tests that prove the byte parity

- `tests/card/notify/mail.test.ts:73-148` — 11 cases on
  `interpolateTemplate` + `renderMail`. Each case asserts one of the
  fields above.
- `tests/card/notify/mail.test.ts:165-180` —
  "renders html body when provided" / "drops empty html body" — the
  boundary cases for the multipart/alternative branch
  (set/type/email_template.rb:21-30).
- `tests/card/notify/follow-notify.test.ts:174-200` — "captures the
  full mail bytes end-to-end (the byte-parity headline)". This is the
  single case that the task brief calls out.

### Why these are not "full Ruby oracle parity"

The first-mechanism port aims at the structured MailMessage shape, not
the wire form. Three reasons:

1. The Mail gem adds message-id, date, content-transfer-encoding,
   multipart boundaries — those are encoding details that belong to
   a transport library (a Postmark or SMTP transport is the right
   place to assert against the wire).
2. The "mail capture" mode used by Ruby's `:test` delivery method is
   not a public contract — gem versions differ; the wire form is not
   decko-owned.
3. Card's `:email_text` and `:email_html` formats use Rails view
   caches (`view_caching?` at email_html_format.rb:5-7 returns
   `false`); reproducing the full inclusion-walk requires the render
   module which is owned by another stream.

### What a Ruby oracle capture would look like

`tools/oracle/follow_capture.rb` is the script — it captures the
structured mail body that `ActionMailer::Base.deliveries` accumulates
when `delivery_method = :test` is set.

**M6 status**: the capture now runs end-to-end against the dev DB. The
E1 blockers were fixed by M6:

1. `card-mod-email` is now in the oracle-app Gemfile (and explicitly
   re-declared alongside `card-mod-follow` and `card-mod-account`,
   even though card-mod-defaults already pulls them transitively).
2. `decko update` ran successfully, seeding the EmailTemplate cardtype
   AND the `follower_notification_email` codename and the default
   Stock templates (with their `+*subject`, `+*text message`,
   `+*html message`, `+*from` children).

The capture script (`tools/oracle/follow_capture.rb`) updates the
seeded `follower notification email` EmailTemplate in place with the
test scenario's literal templates (`{{follower}} ... {{followed_set}}
... {{follow_option}}`). It does NOT trash-and-recreate — destroying
the card would force `Card.create!` on the same name to run the
`:manage_trash` event (mod/core/set/all/trash.rb:23-27), which calls
`pull_from_trash!` and flips `trash = false`. The new card would
re-materialize with the same id and the same stale subcards. Update
in place is the only safe path.

The captured fixture (`fixtures/captured/follow-notification.json`)
is the byte-parity ground truth. Reading it back:

- `delivered[0].to` = `"sara@example.com"`
- `delivered[0].from` = `"no-reply@decko.org"` (Card::Mailer default
  fallback, since no `Card.config.email_defaults[:from]` was set in
  the dev DB)
- `delivered[0].subject` = `"follower changed followed_set on follow_option"`
- `delivered[0].text_body` = `"Hi! follower changed followed_set."`

### M6 corrections (real-oracle captures corrected the M1–M5 hand-derived claim)

The M1–M5 hand-derived expected bytes — `"John changed John
Following on always"` and `"Hi! John changed John Following."` — were
WRONG about Ruby's `contextual_content` behavior in the dev-DB
scenario. The earlier note claimed "the literal `{{follower}}`
remains verbatim in the mail subject" — meaning the braces would stay
intact. The actual behavior:

- Ruby's `contextual_content` walks `{{X}}` as an inclusion
  (card-mod-content set/all/contextual_content.rb:16-19 + card-mod-email
  set/abstract/email_field.rb:22-26 `compact_missing` view default).
- When X does NOT resolve to a real card, the inclusion walker emits
  the literal name with the `{{` and `}}` stripped.
- The captured output proves it: `"follower changed followed_set on
  follow_option"`, not `"{{follower}} changed {{followed_set}} on
  {{follow_option}}"`.

The TS port's `interpolateTemplate` was rewritten to mirror this
(literal name with braces stripped; the `vars` parameter is now
unused but kept for API compatibility). The mail and follow-notify
tests were updated to assert the captured bytes. The
`tags` carry the active_notice values for the transport; they are
NOT substituted into the subject/body.

## 4. What was NOT done (deferred / out of scope)

- **`event :notify_followers_after_delete`**
  (card-mod-follow notify.rb:24-26) — the delete path. The port's
  `follow-notify.ts:130-134` skips `isDeletePath` deliberately. The
  delete path's follower stash crosses a `Card::Director.run_act`
  boundary (because `IntegrateWithDelayJob` cannot carry the stash)
  and needs a separate hook + a separate Redis/queue seam. Deferred
  until the rule-algebra stream is wired.

- **`event :silence_notifications` + `mattr_accessor
  :force_notifications`** — the TS port has no concept of "no
  controller therefore silence"; the save-path registration site
  passes a `silent` flag explicitly. When Card::Auth lands (a later
  stream), the engine can derive silence from the controller's
  presence and pass it through.

- **Inclusions / view rendering in subject and body** — the first
  mechanism's templates use a literal `{{key}}` substitution. The
  full mod-follow `notify/base_views.rb` machinery (`view :last_action`,
  `view :followed`, `view :follower`, `view :unfollow_url`,
  `view :list_of_changes`) is render-stream owned and the team's
  render module is a separate port. Once render.ts exposes a
  `render(template, vars)` surface, the mail module will substitute
  via that surface.

- **Attachments** — `card-mod-email set/type/email_template.rb:55-60`
  defines `add_attachments` which reads attachment cards off the
  template's `+attach` field. The TS port's MailMessage carries no
  `attachments[]` field yet. The Shape goes in via:
  ```ts
  export interface MailMessage {
    // ...
    readonly attachments?: ReadonlyArray<{
      filename: string;
      contentType: string;
      contentBytes: Buffer; // or Uint8Array
    }>;
  }
  ```
  …but this needs the FileCard / card-mod-carrierwave machinery, also
  owned by a later stream.

- **Multipart encoding wire form** — see "Why these are not full Ruby
  oracle parity" above.

- **`card-mod-account`/`card-mod-email` schema migration** — the
  schema migration that creates the EmailTemplate type card, the
  follower_notification_email card, and the default Stock templates
  is owned by the migration stream. The TS port's `EmailTemplate`
  type is a literal triple — production wiring loads it from a card.

- **Per-card-type `followable?` opt-out** — `followable?` defaults to
  `true` in Ruby (card-mod-follow set/all/follow.rb:1-3). The TS
  port's `isNotable()` does not check `followable?` — a TODO marked
  in `follow-notify.ts:90-94`. The cardtype opt-out is part of the
  rule-algebra stream.

- **`moves` / `+account` machinery** — when the deck deletes the
  account card whose email is the follower's delivery target, the
  email field still resolves; the Ruby flow handles this via
  `Card::Auth.always_ok?`. The TS port's transport has no auth
  dependency yet.

- **Honoring `delivery_method` per deck** — the production deployment
  differs (`delivery_method = :smtp` with `smtp_settings` in
  `Card.config.email_defaults`); the TS port picks transport at the
  call site. A `Card.config.email_defaults -> transport` mapper is a
  trivial follow-on when Card.config loads.

## 5. Gates met

- **Notify-module tests pass**: 33/33 (mail.test.ts 13, follow-notify.test.ts
  9, transport-and-dispatch.test.ts 11). Run:
  `npx vitest run tests/card/notify/` — verified.
- **No repo suite reds**: 563 passing tests in `tests/card/{auth,actions,history,fetch,name,rules,permissions,mod-loader}/`
  run unchanged. Run: `npx vitest run tests/card/{auth,actions,...}` —
  verified.
- **No new npm dependencies**: `package.json` and
  `package-lock.json` are unchanged — verified.

## 6. File boundary — what was edited, what was NOT

This stream edited only:

- `src/card/notify/**` (5 files: types, transport, mail, follow-notify,
  dispatch, index)
- `tests/card/notify/**` (3 files: mail, follow-notify,
  transport-and-dispatch)
- `tools/oracle/follow_capture.rb` (1 file: capture script)
- `docs/notify-port-notes.md` (this file)
- `package.json` and `package-lock.json` were NOT touched.
- `src/card/actions/**`, `src/card/render/**`, `src/card/rules/**`,
  `src/card/permissions/**`, `src/card/history/**`,
  `benchmarks/corpus-v2/replay-shard.test.ts` are READ-ONLY for this
  stream and were NOT touched.
