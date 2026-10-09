require "json"
require "fileutils"
APP_ROOT = ARGV[0]; DB_COPY = ARGV[1]
Dir.chdir(APP_ROOT)
ENV["DATABASE_URL"] = "sqlite3:#{DB_COPY}"
ENV["RAILS_ENV"] ||= "development"
require File.join(APP_ROOT, "config", "environment")
require "action_dispatch/testing/integration"

# Nothing is delivered: ActionMailer's deliveries array is the capture.
ActionMailer::Base.delivery_method = :test
ActionMailer::Base.deliveries.clear

EMAIL = "parity.probe@example.com"
NAME  = "Parity Probe"
PW    = "Correct horse battery 1!"

S = ActionDispatch::Integration::Session.new(Cardio.application.class)
S.host! "127.0.0.1"

log = []

def snap(c)
  %w[cards card_acts card_actions card_changes card_revisions sessions users delayed_jobs]
    .each_with_object({}) { |t, h| h[t] = c.select_value("select count(*) from #{t}").to_i }
end

c = ActiveRecord::Base.connection
before = snap(c)

# --- sign-up: create a User card with its +*account subcards -------------
# Anonymous cannot create, so the very first setup user is created as the
# deck's bot (Card::Auth.as_bot) exactly like Cardio's first-run setup
# (set/type/user.rb:50-68 :setup_first_user).
AccountHolder = Card["+*account"]
EmailField    = Card["+*email"]
PasswordField = Card["+*password"]

built = Card[NAME]
if built.nil?
  Card::Auth.as_bot do
    built = Card.create!(
      name: NAME,
      type_id: Card["User"].id,
      subcards: {
        "+*account" => { subcards: {
          "+*email"    => { content: EMAIL },
          "+*password" => { content: PW },
          "+*status"   => { content: "active" },
        } },
      }
    )
  end
end

log << { step: "setup-user", id: built&.id, name: built&.name, type: built.type_id,
         status: Card[NAME + "+*account+*status"].content, salt: Card[NAME + "+*account+*salt"].content.to_s.length,
         digest: Card[NAME + "+*account+*password"].content.to_s[0,12] }

c2 = ActiveRecord::Base.connection
log << { step: "row-delta", delta: snap(c2).transform_values.with_index { |v, i| v - before.values[i] } }
log << { step: "users-table", rows: c2.select_all("select id,login,email,crypted_password,salt,status from users").to_a }

# A second, ordinary account created while signed in as an admin, so the
# signup path (verification email) is reachable too.
puts JSON.pretty_generate(log)