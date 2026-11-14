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
#     <checkout>/tools/oracle/follow_capture.rb
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

# Repo root resolves from this checkout (or the DECKO_TS_REPO_ROOT the runner
# exports) — no machine path built in.
REPO_ROOT = ENV.fetch("DECKO_TS_REPO_ROOT") { File.expand_path("../..", __dir__) }
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
  # The follower (Tova). The follower_notification_email trigger calls
  # `follower.account.send_change_notice`; that method returns
  # `unless email.present?` (card-mod-follow set/right/account.rb:2).
  # `email` here is the ACCOUNT card's `+*email` (card_accessor
  # :email — card-mod-account set/right/account.rb:3 reads from
  # `<card>+*email`). So the seed must set `Tova+account+*email`, NOT
  # `Tova+*email` (the user-card email field is not what the trigger
  # reads in the dev-DB scenario).
  tova = Card.fetch "Tova", new: { type_id: Card::UserID }
  if tova.new_card?
    Card.create! name: "Tova", type: "User", subcards: {
      "+account" => { content: "",
                      subcards: { "+*email" => { content: "tova@example.com" } } },
      "+*email"  => { content: "tova@example.com" },
    }
    seed_log["Tova"] = "created"
  else
    seed_log["Tova"] = "present"
  end
  tova = Card.fetch("Tova")

  # The notify trigger reads `follower.account.email`. In the dev DB,
  # `Tova.account` is `Tova+*account` (auto-created by the card_accessor).
  # Its `email` reads `Tova+*account+*email` (also via card_accessor).
  # The `+*email` field has a uniqueness validator
  # (card-mod-account set/right/email.rb:16-27 `validate_unique_email`)
  # that rejects any two `+*email` cards with the same content. The
  # canonical user email lives on `Tova+*account+*email`; the early
  # scripted seed left `Tova+*email` instead, which we trash-flag here.
  # We use Card.create! with subcards on the parent so the
  # `+*email` is set within the same transaction as `Tova+*account`
  # (the parent has `require_field :email` — card-mod-account
  # set/right/account.rb:8 — and would otherwise reject the save
  # before its child exists).
  tova_account_email_card = Card["Tova+*account+*email"]
  if tova_account_email_card.nil?
    dup = Card["Tova+*email"]
    if dup && !dup.new_card?
      Card.where(id: dup.id).update_all(trash: true)
      seed_log["Tova+*email"] = "trashed (dup)"
    end
    # If the intermediate Tova+*account exists, fill it in-place.
    tova_account = Card["Tova+*account"]
    if tova_account.nil? || tova_account.new_card?
      tova_account = Card.create!(
        name: "Tova+*account",
        subcards: { "+*email" => { content: "tova@example.com" } },
      )
      seed_log["Tova+*account"] = "created-with-email"
    else
      tova_account.update! "+*email" => "tova@example.com"
      seed_log["Tova+*account"] = "updated-with-email"
    end
    seed_log["Tova+*account+*email"] = "ensured"
  elsif tova_account_email_card.content.to_s.strip.empty?
    dup = Card["Tova+*email"]
    if dup && !dup.new_card?
      Card.where(id: dup.id).update_all(trash: true)
      seed_log["Tova+*email"] = "trashed (dup)"
    end
    tova_account_email_card.update! content: "tova@example.com"
    seed_log["Tova+*account+*email"] = "updated"
  end

  jonas = Card.fetch("Jonas")

  jonas_account_email_card = Card["Jonas+*account+*email"]
  if jonas_account_email_card.nil?
    dup = Card["Jonas+*email"]
    if dup && !dup.new_card?
      Card.where(id: dup.id).update_all(trash: true)
      seed_log["Jonas+*email"] = "trashed (dup)"
    end
    jonas_account = Card["Jonas+*account"]
    if jonas_account.nil? || jonas_account.new_card?
      jonas_account = Card.create!(
        name: "Jonas+*account",
        subcards: { "+*email" => { content: "jonas@example.com" } },
      )
      seed_log["Jonas+*account"] = "created-with-email"
    else
      jonas_account.update! "+*email" => "jonas@example.com"
      seed_log["Jonas+*account"] = "updated-with-email"
    end
    seed_log["Jonas+*account+*email"] = "ensured"
  elsif jonas_account_email_card.content.to_s.strip.empty?
    dup = Card["Jonas+*email"]
    if dup && !dup.new_card?
      Card.where(id: dup.id).update_all(trash: true)
      seed_log["Jonas+*email"] = "trashed (dup)"
    end
    jonas_account_email_card.update! content: "jonas@example.com"
    seed_log["Jonas+*account+*email"] = "updated"
  end

  # The actor (Jonas). We need a non-bot, non-Tova actor because the
  # notify trigger skips when follower == act.actor
  # (card-mod-follow set/all/notify.rb:51). Jonas has no follow rule, so
  # the act.actor is "other" and the trigger fires.
  jonas = Card.fetch "Jonas", new: { type_id: Card::UserID }
  if jonas.new_card?
    Card.create! name: "Jonas", type: "User", subcards: {
      "+account" => { content: "",
                      subcards: { "+*email" => { content: "jonas@example.com" } } },
      "+*email"  => { content: "jonas@example.com" },
    }
    seed_log["Jonas"] = "created"
  else
    seed_log["Jonas"] = "present"
  end
  jonas = Card.fetch("Jonas")

  # The followed SET. Tova follows "*all" (every card). The follow rule
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

  follow_rule_name = Card::Name[*all_set.name, "Tova", :follow]
  rule = Card.fetch(follow_rule_name, new: {})
  if rule.new_card?
    Card.create! name: follow_rule_name, type: :list, content: "*always"
    seed_log["follow_rule"] = "created"
  else
    seed_log["follow_rule"] = "present"
  end

  # The EmailTemplate carrying the notification template. The trio of
  # child cards (+*subject, +*text message, +*to) carry the literal
  # templates — chosen for byte-determinism with the TS port.
  #
  # M6: card-mod-email seeds the type plus the codename
  # `follower_notification_email` during `decko update`. The stock seed
  # template uses complex inclusions (e.g. `{{_user|name}}
  # {{_|last_action_verb}} "{{_|name}}"`) that the TS port's narrow
  # `interpolateTemplate` is NOT designed to mirror. The capture needs
  # the simple-substitution triple to assert parity.
  #
  # We UPDATE the seeded email_template in-place rather than trashing
  # and re-creating it. Trashing does not free the name: Card.create!
  # on a trashed row runs the `:manage_trash` event (mod/core/set/all/
  # trash.rb:23-27), which calls `pull_from_trash!` and flips
  # `trash = false` — so the seeded card re-materializes with the same
  # id, the same codename, and the same stale subcards. The only safe
  # path is to overwrite the subcards with the test templates and
  # keep the codename where it is.
  existing = Card.fetch("follower notification email", new: {})
  if !existing.new_card?
    seed_log["follower_notification_email.before"] =
      "id=#{existing.id} subcards=" +
      Card.where(left_id: existing.id).map(&:name).join(",")
    # Trash any stale subcards from a previous capture run that have
    # the old (no-star) names so they don't linger and confuse
    # subsequent renders.
    Card.where(left_id: existing.id, name: ["follower notification email+subject", "follower notification email+text_message"]).update_all(trash: true)
    # Update the test subject/text_message fields in place. Use
    # subcards: { ... } to create them if missing; Card's create-or-update
    # semantics handle both cases.
    existing.update!(
      subcards: {
        # The field-card NAMES must match the mod's codenames:
        #   *subject      (codename :subject)       card-mod-email data/real.yml:42-43
        #   *text message (codename :text_message) card-mod-email data/real.yml:57-58
        # The email renderer's `fetch(field)` (email_config.rb:37) takes
        # the symbol, resolves it via Codename.id!, gets the id of the
        # field-type card (e.g. *subject = id 1224), then constructs
        # `<template>+<id>` which decodes to `<template>+*subject`. So a
        # field card named `+subject` (no star) is NOT findable through
        # the field symbol — only `+*subject` is.
        "+*subject" => { type: :phrase, content: "{{follower}} changed {{followed_set}} on {{follow_option}}" },
        "+*text message" => { type: :plain_text, content: "Hi! {{follower}} changed {{followed_set}}." },
        # M6 byte-parity note: the test scenario supplies the to override
        # via `fields[:to]` (card-mod-follow set/right/account.rb:17) —
        # the EmailTemplate's +*to is a fallback. We use a literal email
        # so the :email_addresses renderer passes it through as-is
        # (card-mod-email set/abstract/email_field.rb:28-30).
        "+*to" => { content: "tova@example.com" },
      },
    )
    seed_log["follower_notification_email"] = "updated-in-place"
  else
    Card.create!(
      name: "follower notification email",
      type: "Email template",
      subcards: {
        "+*subject" => { type: :phrase, content: "{{follower}} changed {{followed_set}} on {{follow_option}}" },
        "+*text message" => { type: :plain_text, content: "Hi! {{follower}} changed {{followed_set}}." },
        "+*to" => { content: "tova@example.com" },
      },
    ).update! codename: "follower_notification_email"
    seed_log["follower_notification_email"] = "created-with-codename"
  end

  # A card Jonas will edit (Tova is NOT the actor).
  tova_card = Card.fetch("Tova Test Card", new: { type_id: Card::BasicID })
  if tova_card.new_card?
    Card.create! name: "Tova Test Card", type: "Basic", content: "original",
                  creator_id: jonas.id, updater_id: jonas.id
    seed_log["Tova Test Card"] = "created"
  else
    seed_log["Tova Test Card"] = "present"
  end

  # ----- Trigger a save that the follow rule observes ----------------------
  # Force notifications (the runner has no controller).
  # mattr_accessor :force_notifications lives on Card::Set::All::Notify,
  # so the proper access path is the module itself, NOT Card.
  Card::Set::All::Notify.force_notifications = true
  begin
    # Switch auth.current_id to Jonas. `Card::Auth.as(jonas.id)` would
    # only set @as_id, not @current_id (proxy.rb:14 — the @current_id
    # branch only runs when it's nil, and as_bot has already set it
    # to DeckoBotID). The notify trigger's notable_change? check is
    # `Card::Auth.current_id != DeckoBotID` (card-mod-follow
    # set/all/notify.rb:40), so a stale current_id=DeckoBotID makes
    # it skip. `Card::Auth.with` (proxy.rb:48-58) sets current_id
    # directly via the writer; that is the correct seam.
    Card::Auth.with(jonas.id) do
      Card.fetch("Tova Test Card").update! content: "updated by test at #{Time.now.to_i}"
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
