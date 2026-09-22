# follow_capture.rb — capture the rendered follow-notification mail bytes
# from a real Deco's follow-notification pipeline. RUN ONLY with the
# oracle app booted into the development environment with mod-email,
# mod-follow, mod-account loaded; the scenario builds its own fixtures
# (see "Fixture shape" below).
#
# Run (from tools/oracle/decko-oracle-app, after `RAILS_ENV=development
# bundle exec decko setup`):
#
#   RAILS_ENV=development bundle exec rails runner \
#     C:/localProjects/decko-ts/tools/oracle/follow_capture.rb
#
# Output: fixtures/captured/follow-notification.json
#
# Determinism contract:
#   - Seeding is create-if-missing; re-runs converge, no duplication.
#   - Captured envelope is the structured Mail object body+headers; the
#     wire-format bytes (MIME-encoded by Mail gem) are NOT captured —
#     transport-layer encoding is out of scope for the notify module
#     port. The TS port's MailMessage carries the same structured fields
#     the capture records.
#   - Timestamps (created_at, updated_at) and the ActionMailer
#     self-generated Message-ID are not captured.
#
# This script requires a working Deco's mod-email + mod-follow +
# mod-account loaded deck. The oracle app that ships in
# tools/oracle/decko-oracle-app did not have these mods at capture time,
# so the script must be run after `gem "card-mod-email"` (and the
# follow/account counterparts) are added to that app's Gemfile and the
# app is re-bootstrapped. The capture cannot run against a stock
# oracle-app DB because the follower_notification_email EmailTemplate
# type card does not exist there.
#
# Fixture shape (one entry per scenario; one scenario per run):
#
#   {
#     "scenario": "follow_notification_email_for_update",
#     "seed_log": { ... },                        # stdout-only summary
#     "delivered": [{
#       "to": "...",
#       "from": "...",
#       "subject": "...",
#       "text_body": "...",
#       "html_body": "..." | null,
#       "delivery_method": "test",
#       "delivered_at": "2026-09-21T..."          # ISO, treated as
#                                                # clock-dependent
#     }]
#   }

require "json"
require "fileutils"

REPO_ROOT = "C:/localProjects/decko-ts"
OUT_DIR = File.join(REPO_ROOT, "fixtures", "captured")
OUT_PATH = File.join(OUT_DIR, "follow-notification.json")

FileUtils.mkdir_p OUT_DIR

# ActionMailer.test delivery is the canonical "capture without sending"
# approach. The Mail objects stay in ActionMailer::Base.deliveries
# (which delegates to Mail::TestMailer.deliveries — mail-2.9.1
# lib/mail/network/delivery_methods/test_mailer.rb:12-14 +
# actionmailer-7.2.3.2 lib/action_mailer/delivery_methods.rb:43).
#
# NOTE: Card::Mailer is a subclass of ActionMailer::Base but `class_attribute
# :delivery_method` (lib/action_mailer/delivery_methods.rb:19) gives each
# subclass its OWN value, not the parent's. Setting only
# `ActionMailer::Base.delivery_method` does NOT change Card::Mailer's
# method. We set it on both.
ActionMailer::Base.delivery_method = :test
ActionMailer::Base.perform_deliveries = true
Card::Mailer.delivery_method = :test
Card::Mailer.perform_deliveries = true

# Disable the notify.rb silence gate — controller is nil in runner; the
# orchestrator's `silence_notifications?` predicate defaults to true
# when no controller exists (notify.rb:11-13).
ENV["DECKO_NOTIFY_FORCE"] = "true" if false # left as documentation

seed_log = {}
delivered = []

scenario = {
  scenario: "follow_notification_email_for_update",
  captured_at: Time.now.utc.iso8601,
}

Card::Auth.as_bot do
  # ----- Seed follow + email-template machinery ---------------------------
  # The follower (Sara). The follower_notification_email trigger calls
  # `follower.account.send_change_notice`; that method returns
  # `unless email.present?` (card-mod-follow set/right/account.rb:2).
  # `email` here is the ACCOUNT card's `+*email` (card_accessor
  # :email — card-mod-account set/right/account.rb:3 reads from
  # `<card>+*email`). So the seed must set `Sara+account+*email`, NOT
  # `Sara+*email` (the user-card email field is not what the trigger
  # reads in the dev-DB scenario).
  sara = Card.fetch "Sara", new: { type_id: Card::UserID }
  if sara.new_card?
    Card.create! name: "Sara", type: "User", subcards: {
      "+account" => { content: "",
                      subcards: { "+*email" => { content: "sara@example.com" } } },
      "+*email"  => { content: "sara@example.com" },
    }
    seed_log["Sara"] = "created"
  else
    seed_log["Sara"] = "present"
  end
  sara = Card.fetch("Sara")

  # The notify trigger reads `follower.account.email`. In the dev DB,
  # `Sara.account` is `Sara+*account` (auto-created by the card_accessor).
  # Its `email` reads `Sara+*account+*email` (also via card_accessor).
  # The `+*email` field has a uniqueness validator
  # (card-mod-account set/right/email.rb:16-27 `validate_unique_email`)
  # that rejects any two `+*email` cards with the same content. The
  # canonical user email lives on `Sara+*account+*email`; the early
  # scripted seed left `Sara+*email` instead, which we trash-flag here.
  # We use Card.create! with subcards on the parent so the
  # `+*email` is set within the same transaction as `Sara+*account`
  # (the parent has `require_field :email` — card-mod-account
  # set/right/account.rb:8 — and would otherwise reject the save
  # before its child exists).
  sara_account_email_card = Card["Sara+*account+*email"]
  if sara_account_email_card.nil?
    dup = Card["Sara+*email"]
    if dup && !dup.new_card?
      Card.where(id: dup.id).update_all(trash: true)
      seed_log["Sara+*email"] = "trashed (dup)"
    end
    # If the intermediate Sara+*account exists, fill it in-place.
    sara_account = Card["Sara+*account"]
    if sara_account.nil? || sara_account.new_card?
      sara_account = Card.create!(
        name: "Sara+*account",
        subcards: { "+*email" => { content: "sara@example.com" } },
      )
      seed_log["Sara+*account"] = "created-with-email"
    else
      sara_account.update! "+*email" => "sara@example.com"
      seed_log["Sara+*account"] = "updated-with-email"
    end
    seed_log["Sara+*account+*email"] = "ensured"
  elsif sara_account_email_card.content.to_s.strip.empty?
    dup = Card["Sara+*email"]
    if dup && !dup.new_card?
      Card.where(id: dup.id).update_all(trash: true)
      seed_log["Sara+*email"] = "trashed (dup)"
    end
    sara_account_email_card.update! content: "sara@example.com"
    seed_log["Sara+*account+*email"] = "updated"
  end

  john = Card.fetch("John")

  john_account_email_card = Card["John+*account+*email"]
  if john_account_email_card.nil?
    dup = Card["John+*email"]
    if dup && !dup.new_card?
      Card.where(id: dup.id).update_all(trash: true)
      seed_log["John+*email"] = "trashed (dup)"
    end
    john_account = Card["John+*account"]
    if john_account.nil? || john_account.new_card?
      john_account = Card.create!(
        name: "John+*account",
        subcards: { "+*email" => { content: "john@example.com" } },
      )
      seed_log["John+*account"] = "created-with-email"
    else
      john_account.update! "+*email" => "john@example.com"
      seed_log["John+*account"] = "updated-with-email"
    end
    seed_log["John+*account+*email"] = "ensured"
  elsif john_account_email_card.content.to_s.strip.empty?
    dup = Card["John+*email"]
    if dup && !dup.new_card?
      Card.where(id: dup.id).update_all(trash: true)
      seed_log["John+*email"] = "trashed (dup)"
    end
    john_account_email_card.update! content: "john@example.com"
    seed_log["John+*account+*email"] = "updated"
  end

  # The actor (John). We need a non-bot, non-Sara actor because the
  # notify trigger skips when follower == act.actor
  # (card-mod-follow set/all/notify.rb:51). John has no follow rule, so
  # the act.actor is "other" and the trigger fires.
  john = Card.fetch "John", new: { type_id: Card::UserID }
  if john.new_card?
    Card.create! name: "John", type: "User", subcards: {
      "+account" => { content: "",
                      subcards: { "+*email" => { content: "john@example.com" } } },
      "+*email"  => { content: "john@example.com" },
    }
    seed_log["John"] = "created"
  else
    seed_log["John"] = "present"
  end
  john = Card.fetch("John")

  # The followed SET. Sara follows "*all" (every card). The follow rule
  # naming convention (card-mod-follow data/test/rules.yml:97-103) is
  # "*all + <user> + *follow"; the set_card `*all` is already a Set, so
  # the preference-cache SQL can resolve the user_ids
  # (Card::Rule.all_user_ids_with_rule_for — lib/card/rule.rb:47-51).
  # The earlier "*all+*self+<user>+*follow" naming (with *self) requires
  # the intermediate *self+junction card to also be a Set, which is not
  # what Card.create! produces by default — the alternative naming avoids
  # that whole class.
  all_set = Card.fetch("*all")
  raise "missing *all seed" unless all_set

  follow_rule_name = Card::Name[*all_set.name, "Sara", :follow]
  rule = Card.fetch(follow_rule_name, new: {})
  if rule.new_card?
    Card.create! name: follow_rule_name, type: :list, content: "*always"
    seed_log["follow_rule"] = "created"
  else
    seed_log["follow_rule"] = "present"
  end

  # The EmailTemplate carrying the notification template. The trio of
  # child cards (+subject, +text_message, +*to) carry the literal
  # templates — chosen for byte-determinism with the TS port.
  #
  # M6: card-mod-email seeds the type plus the codename
  # `follower_notification_email` during `decko update`. The stock seed
  # template uses complex inclusions (e.g. `{{_user|name}}
  # {{_|last_action_verb}} "{{_|name}}"`) that the TS port's narrow
  # `interpolateTemplate` is NOT designed to mirror. The capture needs
  # the simple-substitution triple to assert parity, so we trash the
  # existing card first (dev DB is throwaway) and recreate it with the
  # test templates. The trigger in card-mod-follow
  # set/right/account.rb:17 hard-codes `Card[:follower_notification_email]`
  # so we cannot point the capture at a different card without
  # monkey-patching.
  existing = Card.fetch("follower notification email", new: {})
  if !existing.new_card?
    seed_log["follower_notification_email.before"] =
      "trashing existing id=#{existing.id} subcards=" +
      Card.where(left_id: existing.id).map(&:name).join(",")
    # Hard-trash the existing card + subcards by setting trash=true
    # directly. destroy! runs the director's full event pipeline and
    # raises on EmailTemplate cards because the finalize stage is
    # skipped; update_attributes! with trash=true avoids that and
    # leaves the card in the trash table (trash flag set, not deleted).
    Card.where(left_id: existing.id).update_all(trash: true) # children
    existing.update_columns(trash: true) # the email template card itself
    seed_log["follower_notification_email"] = "trashed-and-recreated"
  end
  Card.create!(
    name: "follower notification email",
    type: "Email template",
    subcards: {
      "+subject" => { content: "{{follower}} changed {{followed_set}} on {{follow_option}}" },
      "+text_message" => { content: "Hi! {{follower}} changed {{followed_set}}." },
      # M6 byte-parity note: the test scenario supplies the to override
      # via `fields[:to]` (card-mod-follow set/right/account.rb:17) —
      # the EmailTemplate's +*to is a fallback. We use a literal email
      # so the :email_addresses renderer passes it through as-is
      # (card-mod-email set/abstract/email_field.rb:28-30).
      "+*to" => { content: "sara@example.com" },
    },
  )

  # Re-attach the `follower_notification_email` codename. The trigger
  # hardcodes `Card[:follower_notification_email]`
  # (card-mod-follow set/right/account.rb:17); the codename is the
  # actual lookup key (lib/card/codename.rb:161 raises
  # Card::Error::CodenameNotFound when no card has it). The seed card
  # `card-mod-follow/data/real.yml:67` declares the codename; trashing
  # the seed row via `trash=true` left the codename column unset on
  # the new card, so the integration phase was raising and skipping
  # deliveries silently.
  Card["follower notification email"].update! codename: "follower_notification_email"

  # A card John will edit (Sara is NOT the actor).
  sara_card = Card.fetch("Sara Test Card", new: { type_id: Card::BasicID })
  if sara_card.new_card?
    Card.create! name: "Sara Test Card", type: "Basic", content: "original",
                  creator_id: john.id, updater_id: john.id
    seed_log["Sara Test Card"] = "created"
  else
    seed_log["Sara Test Card"] = "present"
  end

  # ----- Trigger a save that the follow rule observes ----------------------
  # Force notifications (the runner has no controller).
  # mattr_accessor :force_notifications lives on Card::Set::All::Notify,
  # so the proper access path is the module itself, NOT Card.
  Card::Set::All::Notify.force_notifications = true
  begin
    # Switch auth.current_id to John. `Card::Auth.as(john.id)` would
    # only set @as_id, not @current_id (proxy.rb:14 — the @current_id
    # branch only runs when it's nil, and as_bot has already set it
    # to DeckoBotID). The notify trigger's notable_change? check is
    # `Card::Auth.current_id != DeckoBotID` (card-mod-follow
    # set/all/notify.rb:40), so a stale current_id=DeckoBotID makes
    # it skip. `Card::Auth.with` (proxy.rb:48-58) sets current_id
    # directly via the writer; that is the correct seam.
    Card::Auth.with(john.id) do
      Card.fetch("Sara Test Card").update! content: "updated by test"
    end
  ensure
    Card::Set::All::Notify.force_notifications = false
  end
end

# ----- Pull delivered mails from ActionMailer -----------------------------
ActionMailer::Base.deliveries.each do |mail|
  delivered << {
    "to" => Array(mail.to).join(", "),
    "from" => Array(mail.from).join(", "),
    "subject" => mail.subject.to_s,
    "text_body" => (mail.text_part ? mail.text_part.body.to_s : mail.body.to_s),
    "html_body" => (mail.html_part ? mail.html_part.body.to_s : nil),
    "delivery_method" => ActionMailer::Base.delivery_method.to_s,
    "delivered_at" => mail[:date]&.to_s,
    "message_id" => mail.message_id.to_s,
  }
end

scenario[:seed_log] = seed_log.sort.to_h
scenario[:delivered] = delivered

File.write(OUT_PATH, JSON.pretty_generate(scenario.sort.to_h) + "\n")
puts "WROTE #{OUT_PATH} (#{File.size(OUT_PATH)} bytes)"
puts "seed_log: #{JSON.generate(seed_log.sort.to_h)}"
puts "delivered: #{delivered.size} mail(s)"
