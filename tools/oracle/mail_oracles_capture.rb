# mail_oracles_capture.rb — the SIX ORACLE MAILS capture (row8-parity-gaps
# lane, 2026-10-03). Closes the side-effects parity hole named in
# deliverables/four-parity-proof-inventory-and-plan-2026-10-03.md §D:
# "Exactly one real-captured mail is pinned" — this capture pins the other
# six named flows against the REAL Ruby machinery:
#
#   1. signup verification  card-mod-account set/type/signup.rb:31-33 ->
#      request_verification -> send_verification_email -> verification_email
#      template (data/real.yml)
#   2. password reset       set/self/signin.rb:78-84's own arm ->
#      Auth.as_bot { account.send_password_reset_email } (the exact call the
#      request ladder makes after its lookup; the lookup itself is pinned by
#      the signin tests) -> password_reset_email template
#   3. welcome email        right/account/events.rb:19-24 verify_and_activate
#      -> :87-92 success -> activate_account (:40-43) ->
#      trigger_event! :send_welcome_email -> welcome_email template (seed
#      carries NO fields — real.yml:207-209)
#   4. watcher-on-type notify  notify.rb:13-15 notify_followers_after_save;
#      follow rule on a TYPE set (Basic+*type+Sara+*follow)
#   5. delete notify           notify.rb:22-29 stash_followers (store) +
#      notify_followers_after_delete (integrate)
#   6. includer/template notify  FollowerStash over EVERY act action's card
#      (notify.rb:66-73 + lib/card/follower_stash.rb) — a subcard field's
#      follower gets ONE mail per act naming the act card (the
#      update_includers "Templated cards one email" semantics)
#
# Run (from the oracle app):
#   RAILS_ENV=development bundle exec decko runner \
#     C:/localProjects/decko-ts-lane-row8-parity/tools/oracle/mail_oracles_capture.rb
#
# Output: fixtures/captured/six-oracle-mails.json (repo root of the
# decko-ts-lane-row8-parity worktree).
#
# Determinism contract:
#   - delivery_method :test on BOTH ActionMailer::Base AND Card::Mailer
#     (class_attribute is per-subclass; follow_capture.rb:62-66). NO SMTP,
#     NO live sending, NO network — the mails land in
#     Mail::TestMailer.deliveries and are read back as structured fields.
#   - delivered_at and the ActionMailer Message-ID are NOT captured
#     (clock/instance-dependent — the follow-notification.json contract).
#   - The token inside verify/reset URLs is captured AS DELIVERED (real
#     jwt gem, the app's real secret and clock at capture time) and ALSO
#     recorded with its DECODED payload; the TS pin normalizes the token
#     segment (shape-pinned) — its byte parity is owned by
#     fixtures/captured/auth-token.json + tests/card/auth/token.test.ts.
#   - Act-guarantee: every scenario forces a REAL change act on re-runs
#     (bot sets seed content v1, John updates to v2 — always a diff), so
#     consecutive runs deliver byte-identical mails.
#   - The follower_notification_email template is RESTORED to the STOCK
#     seed bytes (card-mod-follow data/real.yml, parsed with the real YAML
#     engine) before scenarios 4-6. The M6 capture had rewritten it in
#     place with the simple-substitution triple (documented in
#     follow_capture.rb:262-266); that rewrite's simple template remains
#     pinned by fixtures/captured/follow-notification.json (frozen bytes,
#     not re-run). The stock restore is recorded in seed_log.
#   - The M6 follow rule "*all+Sara+*follow" is trashed so the reasons
#     behind each notification are single-valued and deterministic.

require "json"
require "yaml"

REPO_ROOT = "C:/localProjects/decko-ts-lane-row8-parity"
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "six-oracle-mails.json")
FOLLOW_GEM = "C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems/card-mod-follow-0.20.0"
ACCOUNT_GEM = "C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems/card-mod-account-0.20.0"

def deep_sort(obj)
  case obj
  when Hash  then obj.sort.to_h.transform_values { |v| deep_sort(v) }
  when Array then obj.map { |v| deep_sort(v) }
  else obj
  end
end

# ActionMailer.test delivery is the canonical "capture without sending"
# approach (follow_capture.rb:57-66 — Card::Mailer is a subclass with its
# OWN class_attribute delivery_method; both must be set).
ActionMailer::Base.delivery_method = :test
ActionMailer::Base.perform_deliveries = true
Card::Mailer.delivery_method = :test
Card::Mailer.perform_deliveries = true

def read_deliveries
  ActionMailer::Base.deliveries.map do |mail|
    {
      "to" => Array(mail.to).join(", "),
      "from" => Array(mail.from).join(", "),
      "subject" => mail.subject.to_s,
      "text_body" => (mail.text_part ? mail.text_part.body.to_s : mail.body.to_s),
      "html_body" => (mail.html_part ? mail.html_part.body.to_s : nil)
    }
  end
end

seed_log = {}
scenarios = {}

Card::Auth.as_bot do
  # --------------------------------------------------------------------
  # Shared actors: Sara (the follower), John (the actor). The M6 capture
  # already created both with +*account+*email; create-if-missing keeps
  # re-runs convergent. (follow_capture.rb:74-199 is the machinery these
  # seeds ride; the +*email uniqueness validator is why the email lives
  # under +*account+*email.)
  # --------------------------------------------------------------------
  [["Sara", "sara@example.com"], ["John", "john@example.com"]].each do |name, email|
    if Card[name].nil? || Card[name].new_card?
      Card.create! name: name, type: "User", subcards: {
        "+account" => { content: "", subcards: { "+*email" => { content: email } } }
      }
      seed_log["#{name}"] = "created"
    else
      seed_log["#{name}"] = "present"
    end
  end
  sara = Card.fetch("Sara")
  john = Card.fetch("John")

  # -- Actor account repair (measured states of this capture app) --------
  # 1. The no-star "+account" junctions from earlier capture attempts hold
  #    the capture emails on +*email rows whose parent is NOT the +*account
  #    junction — the `account` accessor misses them AND their email rows
  #    block the starred creates via the +*email uniqueness validator.
  #    Purge: +*email rows with the capture addresses whose parent junction
  #    is not right_id=*account, plus those parent junctions.
  conn = ActiveRecord::Base.connection
  email_id = Card::Codename.id!(:email)
  account_id = Card::Codename.id!(:account)
  %w[sara@example.com john@example.com rose.oracle@example.com].each do |addr|
    rows = conn.select_values(
      "SELECT id FROM cards WHERE right_id = #{email_id} AND db_content = '#{addr}'"
    ).map(&:to_i)
    next if rows.empty?

    parents = conn.select_values(
      "SELECT DISTINCT left_id FROM cards WHERE id IN (#{rows.join(',')})"
    ).map(&:to_i)
    bad_parents = parents - conn.select_values(
      "SELECT id FROM cards WHERE right_id = #{account_id}"
    ).map(&:to_i)
    del = (rows + bad_parents) - [Card["Rose Oracle+*account+*email"]&.id].compact
    conn.execute("DELETE FROM cards WHERE id IN (#{del.join(',')})") unless del.empty?
    seed_log["email-debris #{addr}"] = "purged #{del.size}"
  end
  # 2. The +*account junctions must EXIST with populated +*email — a User
  #    without one has `account` = a new-card ghost with a blank email and
  #    send_change_notice's `email.present?` gate silently drops the mail.
  #    The FIELD CHILDREN are created DIRECTLY by name: a subcard update on
  #    a pre-existing junction can silently drop them (measured: Rose's
  #    +*email never materialized via update! subcards, while direct
  #    creates persist — the CQL right_plus join reads the real rows).
  [["Sara", "sara@example.com"], ["John", "john@example.com"], ["Rose Oracle", "rose.oracle@example.com"]].each do |name, email|
    acct = Card["#{name}+*account"]
    if acct.nil? || acct.new_card?
      Card.create! name: "#{name}+*account"
      seed_log["#{name}+*account"] = "created directly"
    end
    em = Card["#{name}+*account+*email"]
    if em.nil? || em.new_card? || em.content.to_s.strip.empty?
      Card.where(id: em.id).delete_all if em && !em.new_card? && em.trash?
      Card.create! name: "#{name}+*account+*email", content: email
      seed_log["#{name}+*account+*email"] = "created directly (#{email})"
    end
    # The status child: `account_for(email)&.active?` reads +*status — a
    # junction created without it answers nil (not active) and the reset
    # arm takes its silent not-active failure. The account_holder default
    # (account_field.rb default_account_status) is "active" for plain Users.
    status = Card["#{name}+*account+*status"]
    if status.nil? || status.new_card? || status.content.to_s.strip.empty?
      Card.where(id: status.id).delete_all if status && !status.new_card? && status.trash?
      Card.create! name: "#{name}+*account+*status", content: "active"
      seed_log["#{name}+*account+*status"] = "created directly (active)"
    end
  end
  # 3. The email stylesheet card must be SCSS (the mod seed's type) — this
  #    app had it RichText+empty, and the stock template's html_message
  #    render (email_document -> stylesheet :compiled) raised
  #    "view (compiled) not supported" on it, killing every stock-template
  #    html mail (the M6 capture's rewritten template was text-only and
  #    never hit this path).
  stylesheet = Card["email stylesheet"]
  if stylesheet && stylesheet.type_name != "SCSS"
    stylesheet.update! type: "SCSS"
    seed_log["email stylesheet"] = "type fixed to SCSS (per card-mod-email data/real.yml:61)"
  end

  # --------------------------------------------------------------------
  # Restore the STOCK follower_notification_email template
  # (card-mod-follow data/real.yml:65-99) — the real YAML parse is the
  # byte provenance. The M6 rewrite had put the simple-substitution
  # triple on this card; the stock restore is itself recorded.
  # --------------------------------------------------------------------
  follow_seed = YAML.load_file(File.join(FOLLOW_GEM, "data", "real.yml"))
  tmpl_row = follow_seed.find { |r| r[:name] == "follower notification email" }
  raise "follower notification email seed row missing" unless tmpl_row
  tmpl_fields = tmpl_row[:fields]
  stock = {
    "from" => tmpl_fields[:from],
    "subject" => tmpl_fields[:subject],
    "text_message" => tmpl_fields[:text_message],
    "html_message" => tmpl_fields[:html_message]
  }

  tmpl = Card.fetch("follower notification email", new: {})
  if tmpl.new_card?
    raise "follower notification email card missing (email mod not seeded?)"
  end
  seed_log["follower_notification_email.before"] =
    Card.where(left_id: tmpl.id).map(&:name).sort.join(",")

  tmpl.update!(
    subcards: {
      "+*from" => { type: :phrase, content: stock["from"] },
      "+*subject" => { type: :phrase, content: stock["subject"] },
      "+*text message" => { type: :plain_text, content: stock["text_message"] },
      "+*html message" => { type: :plain_text, content: stock["html_message"] }
    }
  )
  # The M6 scenario's +*to override is not part of the stock seed; the
  # deliver call passes the follower's email via fields[:to].
  m6_to = Card["follower notification email+*to"]
  if m6_to
    Card.where(id: m6_to.id).update_all(trash: true)
    seed_log["follower notification email+*to"] = "trashed (M6 override)"
  end
  seed_log["follower_notification_email"] = "restored-stock"

  # The M6 rule "*all+Sara+*follow" (*always) stays live otherwise and
  # would co-fire on every act; trash it so scenarios 4-6 have exactly
  # one rule each.
  m6_rule = Card["*all+Sara+*follow"]
  if m6_rule && !m6_rule.trash?
    Card.where(id: m6_rule.id).update_all(trash: true)
    seed_log["*all+Sara+*follow"] = "trashed (M6 rule)"
  end

  # --------------------------------------------------------------------
  # SCENARIO 1 — signup verification email (see the arm details above).
  # --------------------------------------------------------------------
  ActionMailer::Base.deliveries.clear
  jane_name = "Jane Oracle Signup"
  jane_email = "jane.oracle@example.com"
  # Act-guarantee for the signup create: HARD-delete the subtree rows plus
  # any stray +*email row carrying the capture address (the +*email
  # uniqueness validator is global, and prior-run debris can hold the
  # address after its parent junction is gone; measured, runs 3-5).
  # Raw SQL closure walk — cards only; orphaned act rows are harmless in
  # this disposable capture db and never read by the mail machinery.
  conn = ActiveRecord::Base.connection
  ids = conn.select_values(
    "SELECT id FROM cards WHERE name = #{conn.quote(jane_name)}"
  ).map(&:to_i)
  until (more = conn.select_values(
    "SELECT id FROM cards WHERE left_id IN (#{ids.empty? ? 'NULL' : ids.join(',')})
     AND id NOT IN (#{ids.empty? ? 'NULL' : ids.join(',')})".squish
  ).map(&:to_i)).empty?
    ids += more
  end
  email_codename_id = Card::Codename.id!(:email)
  stray = conn.select_values(
    "SELECT id FROM cards WHERE right_id = #{email_codename_id}
     AND db_content = #{conn.quote(jane_email)}".squish
  ).map(&:to_i) - ids
  all_del = ids + stray
  conn.execute("DELETE FROM cards WHERE id IN (#{all_del.join(',')})") unless all_del.empty?
  seed_log["#{jane_name} prior rows"] = "hard-deleted #{all_del.size}"
  # --------------------------------------------------------------------
  # SCENARIO 1 — signup verification email, via the ADMIN-APPROVAL arm
  # (signup.rb:36-39 `event :approve_with_verification, :validate,
  # on: :update, trigger: :required` -> request_verification :48-52 ->
  # +*status "unverified" + trigger_event! :send_verification_email ->
  # the integrate event (events.rb:32-35) delivers the verification_email
  # template with context = the +*account card, to = its +*email).
  #
  # Seeding shape (the M6-verified pattern): the +*account junction is
  # created DIRECTLY — two-level subcard staging under a structure-ruled
  # junction silently drops +*email (measured, probes verify_probe /
  # verify_probe2: "Validation failed: Email required"); the direct
  # junction create with a +*email subcard is exactly what M6's fix block
  # uses. The junction create auto-creates the holder; the holder then
  # becomes a Sign up in the SAME update that triggers approval.
  # --------------------------------------------------------------------
  Card::Auth.as_bot do
    Card.create! name: jane_name # the holder (Basic); the account junction
    # does NOT auto-create its left (measured, run 7 — fetch returned nil)
    Card.create! name: "#{jane_name}+*account",
                 subcards: { "+*email" => { content: jane_email } }
  end
  seed_log["#{jane_name}+*account"] = "created directly (with +*email)"
  Card::Auth.as_bot do
    Card.fetch(jane_name).update! type: "Sign up", trigger: :approve_with_verification
  end
  seed_log[jane_name] = "Sign up + approve_with_verification (trigger arm)"
  scenarios["signup_verification_email"] = {
    "seed_log" => { "arm" => "approve_with_verification trigger on the Sign up holder" },
    "input" => {
      "template_codename" => "verification_email",
      "template_fields" => {
        "from" => Card["verification email+*from"]&.content,
        "subject" => Card["verification email+*subject"]&.content,
        "text_message" => Card["verification email+*text message"]&.content,
        "html_message" => Card["verification email+*html message"]&.content
      },
      "site_title" => Card["*title"]&.content,
      "to" => "jane.oracle@example.com"
    },
    "delivered" => read_deliveries
  }

  # --------------------------------------------------------------------
  # SCENARIO 2 — welcome email (via the REAL verify_and_activate ladder)
  # The confirm arm: account card update with trigger: :verify_and_activate
  # (events.rb:19-24) + the token param (views.rb:2-4 builds it with
  # {anonymous: true}). Success signs in, activates (+*status "active"),
  # and trigger_event! :send_welcome_email (events.rb:40-43).
  # --------------------------------------------------------------------
  ActionMailer::Base.deliveries.clear
  jane_acct = Card["#{jane_name}+*account"]
  raise "jane +*account missing" unless jane_acct
  token = Card::Auth::Token.encode(jane_acct.accounted_id, anonymous: true)
  old_params_token = Card::Env.params[:token]
  Card::Env.params[:token] = token
  begin
    jane_acct.update! trigger: :verify_and_activate
  ensure
    Card::Env.params[:token] = old_params_token
    Card::Auth.current_id = Card::DeckoBotID
  end
  decoded = begin
    Card::Auth::Token.decode(token)
  rescue StandardError => e
    { "decode_error" => e.message }
  end
  scenarios["welcome_email"] = {
    "seed_log" => { "verify_and_activate" => "ran (trigger arm; status now active)" },
    "input" => {
      "template_codename" => "welcome_email",
      "template_fields" => { "note" => "welcome_email seed carries NO fields (real.yml:207-209)" },
      "token_payload" => decoded,
      "to" => "jane.oracle@example.com"
    },
    "delivered" => read_deliveries
  }

  # --------------------------------------------------------------------
  # SCENARIO 3 — password reset email, via the request arm's own delivery
  # call (signin.rb:78-84): `Auth.as_bot { account.send_password_reset_email }`
  # — the exact call the *signin trigger ladder makes after its lookup.
  # The LOOKUP arm (find_account_by_email -> a right_plus CQL query) is
  # not runnable in this scratch app: the right_plus CQL returns [] for
  # every row including the stock Decko Bot seed (measured; an app-level
  # defect — the lookup itself is pinned by the CQL + signin suites). The
  # mail bytes do not depend on it.
  # --------------------------------------------------------------------
  ActionMailer::Base.deliveries.clear
  rose_name = "Rose Oracle"
  if Card[rose_name].nil? || Card[rose_name].new_card?
    Card.create! name: rose_name, type: "User", subcards: {
      "+*account" => { content: "", subcards: { "+*email" => { content: "rose.oracle@example.com" } } }
    }
    seed_log[rose_name] = "created"
  else
    seed_log[rose_name] = "present"
  end
  Card::Auth.as_bot { Card["#{rose_name}+*account"].send_password_reset_email }
  reset_token_in_url = nil
  read_deliveries.each do |row|
    next unless row["text_body"] =~ /token=([A-Za-z0-9_\-.]+)/

    reset_token_in_url ||= Regexp.last_match(1)
  end
  scenarios["password_reset_email"] = {
    "seed_log" => { "arm" => "signin.rb:83 Auth.as_bot { account.send_password_reset_email } (direct delivery arm)" },
    "input" => {
      "template_codename" => "password_reset_email",
      "template_fields" => {
        "from" => Card["password reset email+*from"]&.content,
        "subject" => Card["password reset email+*subject"]&.content,
        "text_message" => Card["password reset email+*text message"]&.content,
        "html_message" => Card["password reset email+*html message"]&.content
      },
      "site_title" => Card["*title"]&.content,
      "token_payload" => (reset_token_in_url ? Card::Auth::Token.decode(reset_token_in_url) : nil),
      "to" => "rose.oracle@example.com"
    },
    "delivered" => read_deliveries
  }
  # --------------------------------------------------------------------
  # SCENARIOS 4-6 — the follower_notification_email stock template.
  # Act-guarantee pattern: bot pins seed content v1 (convergent), John's
  # act moves it to v2 (always a real change act).
  # The runner silence gate must be OFF: notify.rb:10-13
  # silence_notifications? = !(Card::Env.controller || force_notifications)
  # — no controller in a runner, so force_notifications is REQUIRED for
  # the follow machinery to fire (the follow_capture.rb:296 precedent;
  # the accessor lives on Card::Set::All::Notify, not Card).
  # --------------------------------------------------------------------
  Card::Set::All::Notify.force_notifications = true

  # SCENARIO 4 — watcher-on-type notify (the SAVE arm, a TYPE-set rule)
  ActionMailer::Base.deliveries.clear
  rule_name = Card::Name["Basic+*type", "Sara", :follow]
  rule = Card.fetch(rule_name, new: {})
  if rule.new_card?
    Card.create! name: rule_name, type: :list, content: "*always"
    seed_log["Basic+*type+Sara+*follow"] = "created"
  else
    rule.update! content: "*always"
    seed_log["Basic+*type+Sara+*follow"] = "present"
  end
  watch_name = "Oracle Follow Card"
  watch = Card.fetch(watch_name, new: { type_id: Card::BasicID })
  if watch.new_card?
    Card::Auth.with(john.id) do
      Card.create! name: watch_name, type: "Basic", content: "row8 seed v1"
    end
    seed_log[watch_name] = "created-by-john"
  else
    watch.update! content: "row8 seed v1"
    seed_log[watch_name] = "present"
  end
  ActionMailer::Base.deliveries.clear # the seed steps themselves notify
  Card::Auth.with(john.id) do
    Card.fetch(watch_name).update! content: "row8 update v2"
  end
  scenarios["watcher_on_type_notify"] = {
    "seed_log" => { "act" => "John updated #{watch_name} v1->v2 (notify_followers_after_save)" },
    "input" => {
      "template_codename" => "follower_notification_email",
      "template_fields" => stock,
      "follow_rule" => { "name" => rule_name.to_s, "set_card" => "Basic+*type", "option" => "*always" },
      "act" => { "actor" => "John", "card" => watch_name, "verb" => "updated" },
      "follower" => "Sara"
    },
    "delivered" => read_deliveries
  }

  # SCENARIO 5 — delete notify (stash_followers at store +
  # notify_followers_after_delete at integrate; verb "deleted", the
  # content row reads the PREVIOUS value, base_views.rb:84-89).
  ActionMailer::Base.deliveries.clear
  del_name = "Oracle Delete Card"
  del = Card.fetch(del_name, new: { type_id: Card::BasicID })
  if del.new_card?
    Card::Auth.with(john.id) do
      Card.create! name: del_name, type: "Basic", content: "row8 seed v1"
    end
    seed_log[del_name] = "created-by-john"
  else
    del.update! content: "row8 seed v1" # revives from trash when needed
    seed_log[del_name] = "present"
  end
  ActionMailer::Base.deliveries.clear # the seed steps themselves notify
  Card::Auth.with(john.id) do
    Card.fetch(del_name).delete!
  end
  scenarios["delete_notify"] = {
    "seed_log" => { "act" => "John deleted #{del_name} (stash + notify_followers_after_delete)" },
    "input" => {
      "template_codename" => "follower_notification_email",
      "template_fields" => stock,
      "follow_rule" => { "name" => rule_name.to_s, "set_card" => "Basic+*type", "option" => "*always" },
      "act" => { "actor" => "John", "card" => del_name, "verb" => "deleted" },
      "follower" => "Sara"
    },
    "delivered" => read_deliveries
  }

  # SCENARIO 6 — includer/template notify: ONE act whose actions include a
  # SUBCARD change; the subcard's follower (Sara follows
  # "Oracle Recipe Card+ingredient") gets ONE mail per act naming the ACT
  # card (FollowerStash checked-set dedupe, follower_stash.rb:10-18;
  # notify.rb:66-73 walks every act action's card).
  ActionMailer::Base.deliveries.clear
  recipe_name = "Oracle Recipe Card"
  ing_name = "#{recipe_name}+ingredient"
  recipe_rule_name = Card::Name["#{ing_name}+*self", "Sara", :follow]
  # a *self follow's SET is "<card>+*self" — the rule name carries the
  # +*self segment (card-mod-follow data/test/rules.yml:25-31 "All Eyes On
  # Me + *self + John + *follow"); without it the rule never matches.
  recipe_rule = Card.fetch(recipe_rule_name, new: {})
  if recipe_rule.new_card?
    Card.create! name: recipe_rule_name, type: :list, content: "*always"
    seed_log["#{ing_name} rule"] = "created"
  else
    recipe_rule.update! content: "*always"
    seed_log["#{ing_name} rule"] = "present"
  end
  recipe = Card.fetch(recipe_name, new: { type_id: Card::BasicID })
  if recipe.new_card?
    Card::Auth.with(john.id) do
      Card.create! name: recipe_name, type: "Basic", content: "row8 seed v1",
                   subcards: { "+ingredient" => { content: "row8 ingredient v1" } }
    end
    seed_log[recipe_name] = "created-by-john"
  else
    recipe.update! content: "row8 seed v1",
                   subcards: { "+ingredient" => { content: "row8 ingredient v1" } }
    seed_log[recipe_name] = "present"
  end
  ActionMailer::Base.deliveries.clear # the seed steps themselves notify
  # The act changes BOTH the main content and the subcard in ONE save: a
  # no-change main card runs NO notify event (measured — on: :save does not
  # apply to a card with no action, and the subcard's own event is
  # current_act_card?-gated off), while the one-act-two-actions shape is
  # exactly the update_includers dedupe (one mail per act via the stash).
  Card::Auth.with(john.id) do
    Card.fetch(recipe_name).update!(
      content: "row8 update v2",
      subcards: { "+ingredient" => { content: "row8 ingredient v2" } }
    )
  end
  scenarios["includer_template_notify"] = {
    "seed_log" => { "act" => "John updated #{recipe_name} subcard +ingredient v1->v2 (one act)" },
    "input" => {
      "template_codename" => "follower_notification_email",
      "template_fields" => stock,
      "follow_rule" => { "name" => recipe_rule_name.to_s, "set_card" => "#{ing_name}+*self", "option" => "*always" },
      "act" => { "actor" => "John", "card" => recipe_name, "subcard" => ing_name, "verb" => "updated" },
      "follower" => "Sara"
    },
    "delivered" => read_deliveries
  }

  Card::Set::All::Notify.force_notifications = false
end

payload = {
  "captured_by" => "tools/oracle/mail_oracles_capture.rb",
  "captured_at_note" => "clock excluded by contract; see the module header",
  "oracle" => {
    "ruby" => RUBY_VERSION,
    "card" => "1.110.0",
    "decko" => "0.20.0",
    "app" => "C:/localProjects/decko-oracle-app-2026-10-03 (dev sqlite)",
    "delivery" => "ActionMailer test delivery (Card::Mailer + ActionMailer::Base both :test); no SMTP, no network"
  },
  "mailer_defaults" => {
    "Card::Mailer.default" => (Card::Mailer.default rescue nil).to_s,
    "decko_bot_account_email" => (Card[Card::DeckoBotID].account&.email rescue nil).to_s
  },
  "seed_log" => seed_log,
  "scenarios" => scenarios
}

# binwrite, not write: the committed fixture blobs are pure LF (the repo
# convention) and Windows text-mode File.write would emit CRLF, churning
# every line on re-runs.
File.binwrite(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "WROTE #{OUT_PATH} (#{File.size(OUT_PATH)} bytes)"
scenarios.each do |k, v|
  puts "  #{k}: #{v['delivered'].size} mail(s)"
end
$stdout.flush
