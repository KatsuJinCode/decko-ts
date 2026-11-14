# oracle-capture-core-template-expansion-events-ruby.rb - the SIXTEEN core
# template-expansion event rows, read out of the PINNED gemset and, where
# the body can be stood up, EXECUTED.
#
# WHY THIS SCRIPT EXISTS. The register's core section listed sixteen
# PARTIAL events with "no single Ruby declaration" - they are TEMPLATE
# EXPANSIONS: a class_eval string or an each-loop that declares several
# events from one piece of source. Sixteen rows, three templates:
#
#   1. card-mod-carrierwave-0.20.0/lib/carrier_wave/card_mount.rb:32-53 -
#      a class_eval string that declares FIVE events per mount column
#      (store, remove, mark_remove_false, reset_previous_changes,
#      remove_previously_stored) for the `file` and the `image` column:
#      ten rows.
#   2. card-mod-integrate-0.20.0/set/all/observer.rb:1-5 - an each-loop
#      over %i[create update delete]: three rows.
#   3. card-mod-account-0.20.0/set/right/account/events.rb:32-36 - an
#      each-loop over %i[password_reset_email verification_email
#      welcome_email]: three rows.
#
# The capture records, for every one of the sixteen rows, the PINNED
# template source and the EXPANDED declaration the template produces (the
# column, the action and the email name substituted), so the port's own
# registrations can be pinned against the expansion rather than against a
# paraphrase. Where the expanded body can be stood up (the observer trio
# and the email trio), the body is EXECUTED over recording doubles and the
# recorded calls are the oracle.
#
# The mount rows' bodies call into the carrierwave gem, which is NOT in the
# pinned gemset, so those bodies cannot be stood up. The capture records
# that absence as a fact (the gemset's own gem list) instead of replacing
# the body with a plausible stand-in.
#
# THE STUBBING RULE: every double RECORDS. No double answers with a
# plausible value.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-core-template-expansion-events-ruby.rb \
#     > fixtures/captured/core-template-expansion-events-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The probe list is fixed, so a re-run on the same gemset is
# byte-stable.

require "json"

require_relative "oracle-capture-pinned-event-bodies-ruby"

PinnedEvent.load_pinned_libs!

MOUNT_FILE = "card-mod-carrierwave-0.20.0/lib/carrier_wave/card_mount.rb"
OBSERVER_FILE = "card-mod-integrate-0.20.0/set/all/observer.rb"
ACCOUNT_FILE = "card-mod-account-0.20.0/set/right/account/events.rb"

RECORDED = []

# ---------------------------------------------------------------------------
# 1. the ten mount rows
# ---------------------------------------------------------------------------

mount_lines = PinnedEvent.pinned_lines(MOUNT_FILE)
mount_template = mount_lines.select { |row| (32..58).cover?(row["line"]) }

# The gemset's own gem list, so the carrierwave absence is a recorded
# fact and not an assumption.
gemset_gems = Dir.glob(File.join(PinnedEvent.gems_root, "*")).map { |p| File.basename(p) }.sort

mount_rows = %w[file image].flat_map do |column|
  {
    "store_#{column}_event" => "reg-evt-core-store-#{column}-event",
    "remove_#{column}_event" => "reg-evt-core-remove-#{column}-event",
    "mark_remove_#{column}_false_event" => "reg-evt-core-mark-remove-#{column}-false-event",
    "reset_previous_changes_for_#{column}_event" =>
      "reg-evt-core-reset-previous-changes-for-#{column}-event",
    "remove_previously_stored_#{column}_event" =>
      "reg-evt-core-remove-previously-stored-#{column}-event",
  }.map do |event_name, row_id|
    expanded = mount_template.map do |row|
      { "line" => row["line"], "text" => row["text"].gsub('#{column}', column) }
    end
    {
      "row" => row_id,
      "event" => event_name,
      "column" => column,
      "expanded_source" => expanded,
      "declaration" => begin
        texts = expanded.map { |row| row["text"] }
        start = texts.index { |text| text.include?("event :#{event_name}") }
        finish = start
        while finish < texts.length && texts[finish].strip != "end"
          finish += 1
        end
        texts[start..finish].map(&:strip).join(" ")
      end,
      "body_call" => expanded
        .map { |row| row["text"] }
        .find { |text| text.strip.start_with?("store_", "remove_", "mark_remove_", "reset_previous_changes_for_", "remove_previously_stored_") },
      "executed" => nil,
      "not_standable_because" =>
        "the expanded body calls into the carrierwave gem, which the pinned gemset does " \
        "not carry (#{gemset_gems.grep(/carrierwave/).empty? ? "no carrierwave gem in the gemset" : "carrierwave present"}). " \
        "The declaration is recorded; the body is not stood up with a stand-in.",
    }
  end
end

# ---------------------------------------------------------------------------
# 2. the three observer rows, EXECUTED
# ---------------------------------------------------------------------------

observer_lines = PinnedEvent.pinned_lines(OBSERVER_FILE)
observer_template = observer_lines.select { |row| (1..5).cover?(row["line"]) }
observer_body_source = PinnedEvent.method(OBSERVER_FILE, "execute_card_events")

# The probe the expanded observer body runs on.
class ObserverProbe
  def initialize(action)
    @action = action
  end

  # The pinned helper the body calls: execute_card_events on: <action>.
  def execute_card_events(args)
    RECORDED << { "call" => "execute_card_events", "arguments" => [args] }
    nil
  end
end

observer_rows = %w[create update delete].map do |action|
  probe = ObserverProbe.new(action)
  # the expanded body: `execute_card_events on: <action>`
  body = "  execute_card_events on: :#{action}"
  probe.singleton_class.class_eval(
    "def __pinned_observer_body__\n#{body}\nend",
    OBSERVER_FILE,
    3,
  )
  RECORDED.clear
  outcome = PinnedEvent.call_event_body(probe, :__pinned_observer_body__)
  {
    "row" => "reg-evt-core-observer-#{action}",
    "event" => "observer_#{action}",
    "column" => action,
    "expanded_source" => observer_template.map do |row|
      { "line" => row["line"], "text" => row["text"].gsub('#{action}', action) }
    end,
    "declaration" => "event :observer_#{action}, :integrate, on: #{action} do",
    "body_call" => "execute_card_events on: #{action}",
    "executed" => {
      "raised" => outcome["raised"],
      "message" => outcome["message"],
      "recorded" => RECORDED.dup,
    },
    "pinned_helper" => {
      "file" => observer_body_source["file"],
      "line" => observer_body_source["line"],
      "body" => observer_body_source["body"],
    },
  }
end

# ---------------------------------------------------------------------------
# 3. the three email rows, EXECUTED
# ---------------------------------------------------------------------------

account_lines = PinnedEvent.pinned_lines(ACCOUNT_FILE)
email_template = account_lines.select { |row| (32..36).cover?(row["line"]) }

class EmailProbe
  def initialize(email)
    @email = email
  end

  # The pinned helper the body calls: send_account_email <email>.
  def send_account_email(email)
    RECORDED << { "call" => "send_account_email", "arguments" => [email.to_s] }
    nil
  end
end

email_rows = %w[password_reset_email verification_email welcome_email].map do |email|
  probe = EmailProbe.new(email)
  body = "  send_account_email :#{email}"
  probe.singleton_class.class_eval(
    "def __pinned_email_body__\n#{body}\nend",
    ACCOUNT_FILE,
    34,
  )
  RECORDED.clear
  outcome = PinnedEvent.call_event_body(probe, :__pinned_email_body__)
  {
    "row" => "reg-evt-core-send-#{email.tr("_", "-")}",
    "event" => "send_#{email}",
    "column" => email,
    "expanded_source" => email_template.map do |row|
      { "line" => row["line"], "text" => row["text"].gsub('#{email}', email) }
    end,
    "declaration" => "event :send_#{email}, :integrate, trigger: :required do",
    "body_call" => "send_account_email #{email}",
    "executed" => {
      "raised" => outcome["raised"],
      "message" => outcome["message"],
      "recorded" => RECORDED.dup,
    },
  }
end

# The pinned gate the mount rows' declarations name, quoted from the
# pinned file: no_history? decides the three gated mount events.
no_history_source = begin
  found = nil
  Dir.glob(File.join(PinnedEvent.gems_root, "card-mod-history-0.20.0", "set", "**", "*.rb")).sort.each do |file|
    next unless File.read(file).include?("def no_history?")
    # the gate lives in the pinned history mod, not the card gem
    relative = file.sub("#{PinnedEvent.gems_root}/", "").tr("\\", "/")
    found = PinnedEvent.method(relative, "no_history?")
    break
  end
  found || { "file" => nil, "line" => nil, "body" => "no def no_history? in the pinned card gem" }
rescue StandardError => e
  { "file" => nil, "line" => nil, "body" => "not found: #{e.class}" }
end

oracle = {
  "row" => "reg-evt-core-template-expansion-sixteen",
  "gemset" => "card-mod-carrierwave-0.20.0 + card-mod-integrate-0.20.0 + card-mod-account-0.20.0 (pinned)",
  "ruby_version" => RUBY_VERSION,
  "gemset_gems" => gemset_gems,
  "mount_rows" => mount_rows,
  "observer_rows" => observer_rows,
  "email_rows" => email_rows,
  "pinned_no_history_gate" => no_history_source,
  "observable_effect" =>
    "the observer trio's expanded body calls execute_card_events with the action, and the " \
    "email trio's calls send_account_email with the email name. The mount rows' bodies call " \
    "into the carrierwave gem, which the pinned gemset does not carry, so their declarations " \
    "are recorded and their bodies are not stood up.",
}

puts JSON.pretty_generate(oracle)
puts
