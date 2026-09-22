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
# approach. The Mail objects stay in ActionMailer::Base.deliveries.
ActionMailer::Base.delivery_method = :test
ActionMailer::Base.perform_deliveries = true

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
  # The follower's account. We need a User with +account +email.
  sara = Card.fetch "Sara", new: { type_id: Card::UserID }
  if sara.new_card?
    Card.create! name: "Sara", type: "User", subcards: {
      "+account" => { content: "" },
      "+*email"  => { content: "sara@example.com" },
    }
    seed_log["Sara"] = "created"
  else
    seed_log["Sara"] = "present"
  end
  # Refresh (the create flow may have changed sara.id).
  sara = Card.fetch("Sara")

  # The followed SET. Sara follows "*all", meaning Sara follows every
  # card. The follow rule "*all+*self+ Sara +follow" carries "*always".
  all_set = Card.fetch("*all")
  raise "missing *all seed" unless all_set

  follow_rule_name = Card::Name[*all_set.name, :self, "Sara", :follow]
  rule = Card.fetch(follow_rule_name, new: {})
  if rule.new_card?
    Card.create! name: follow_rule_name, type: :list, content: "*always"
    seed_log["follow_rule"] = "created"
  else
    seed_log["follow_rule"] = "present"
  end

  # The EmailTemplate carrying the notification template. The trio of
  # child cards (+subject, +text_message, +html_message) carry the
  # literal templates — chosen for byte-determinism with the TS port.
  notify = Card.fetch("follower notification email", new: { type_id: Card::EmailTemplateID })
  if notify.new_card?
    Card.create!(
      name: "follower notification email",
      type: "Email template",
      subcards: {
        "+subject" => { content: "{{follower}} changed {{followed_set}} on {{follow_option}}" },
        "+text_message" => { content: "Hi! {{follower}} changed {{followed_set}}." },
        "+*to" => { content: "{{_self|email_addresses;user: Sara}}" },
      },
    )
    seed_log["follower_notification_email"] = "created"
  else
    seed_log["follower_notification_email"] = "present"
  end

  # A card Sara created and Sara will edit — the act's primary card.
  sara_card = Card.fetch("Sara Test Card", new: { type_id: Card::BasicID })
  if sara_card.new_card?
    Card.create! name: "Sara Test Card", type: "Basic", content: "original",
                  creator_id: sara.id, updater_id: sara.id
    seed_log["Sara Test Card"] = "created"
  else
    seed_log["Sara Test Card"] = "present"
  end

  # ----- Trigger a save that the follow rule observes ----------------------
  # Force notifications (the runner has no controller).
  Card.force_notifications = true
  begin
    Card.fetch("Sara Test Card").update! content: "updated by test"
  ensure
    Card.force_notifications = false
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
