# THE RUBY ORACLE, semantics lane.
#
# Reads the shared question set (tools/oracle/semantics-questions.rb wrote it
# from this same deck) and answers every question id. The TypeScript probe
# answers the identical ids; the comparator diffs the two answer files.
#
# Run: decko runner semantics-answer.rb
#   SEMANTICS_QUESTIONS=<questions.json>
#   SEMANTICS_ANSWERS=<answers-ruby.json>

require "json"

QUESTIONS = JSON.parse(File.read(ENV.fetch("SEMANTICS_QUESTIONS")))
OUT_PATH = ENV.fetch("SEMANTICS_ANSWERS")

def safe
  yield
rescue StandardError => e
  "ERR:#{e.class}:#{e.message.to_s[0, 120]}"
end

# Name algebra, engine-neutral: what any implementation must derive from a
# name string alone.
def name_algebra(s)
  n = s.to_name
  {
    "s" => n.s,
    "key" => n.key,
    "parts" => n.parts,
    "num_parts" => n.num_parts,
    "trunk" => (n.trunk.to_s rescue "ERR"),
    "tag" => (n.tag.to_s rescue "ERR"),
    "left" => (n.left&.to_s),
    "right" => (n.right&.to_s),
    "stripped" => n.stripped.to_s,
    "fully_stripped" => n.fully_stripped.to_s,
    "url_key" => (n.url_key rescue "ERR"),
    "simple" => n.simple?,
    "compound" => n.compound?,
    "relative" => (n.relative? rescue "ERR"),
    "absolute" => (n.absolute? rescue "ERR"),
    "starts_with_joint" => n.starts_with_joint?,
    "star" => n.star?,
    "rstar" => n.rstar?
  }
end

answers = {}

# Optional: answer only these kinds (comma-separated), e.g. to re-answer one
# category on a cold cache.
ONLY_KINDS = ENV["SEMANTICS_ONLY_KINDS"]&.split(",")

# The event-name census, read out of the loaded set modules: every
# `<event>_without_callbacks` method Card::Set::Event defined.
EVENT_NAMES = (
  begin
    Card.instance_methods.grep(/_without_callbacks\z/).map { |m| m.to_s.sub(/_without_callbacks\z/, "") }.sort
  rescue StandardError
    []
  end
)

QUESTIONS["questions"].each do |question|
  id = question["id"]
  kind = question["kind"]
  next if ONLY_KINDS && !ONLY_KINDS.include?(kind)

  payload = question["payload"]

  answer =
    case kind
    when "counts"
      {
        "live" => Card.where(trash: false).count,
        "trashed" => Card.where(trash: true).count,
        "total" => Card.count,
        "cardtypes" => Card.where(type_id: Card.fetch_type_id("Cardtype"), trash: false).count,
        "sets" => Card.where(type_id: Card.fetch_type_id("Set"), trash: false).count,
        "settings" => Card.where(type_id: Card.fetch_type_id("Setting"), trash: false).count,
        "roles" => Card.where(type_id: Card.fetch_type_id("Role"), trash: false).count,
        "users" => Card.where(type_id: Card.fetch_type_id("User"), trash: false).count
      }

    when "live_ids"
      Card.where(trash: false).order(:id).pluck(:id)

    when "cards"
      # The payload already carries the oracle's own view of the row; both
      # engines answer the SAME shape from their own storage.
      payload["rows"].map do |row|
        c = Card[row["id"]]
        next { "id" => row["id"], "missing" => true } if c.nil?
        {
          "id" => c.id,
          "name" => c.name.to_s,
          "key" => c.key.to_s,
          "type" => c.type_name.to_s,
          "codename" => c.codename.to_s,
          "trash" => c.trash?
        }
      end

    when "rule_cards"
      payload["rows"].map do |row|
        c = Card[row["id"]]
        next { "id" => row["id"], "missing" => true } if c.nil?
        {
          "id" => c.id,
          "name" => c.name.to_s,
          "key" => c.key.to_s,
          "left" => safe { c.left&.name&.to_s },
          "right" => safe { c.right&.name&.to_s },
          "trunk" => safe { c.name.trunk.to_s },
          "tag" => safe { c.name.tag.to_s },
          "rule?" => safe { c.rule? },
          "standard_rule?" => safe { c.standard_rule? },
          "preference?" => safe { c.preference? },
          "content" => c.db_content.to_s
        }
      end

    when "all_names"
      payload["names"].map { |n| name_algebra(n) }

    when "edge_names"
      payload["names"].map { |n| name_algebra(n) }

    when "set_definitions"
      payload["sets"].map do |sname|
        c = Card[sname]
        next { "set" => sname, "missing" => true } if c.nil?
        {
          "set" => sname,
          "id" => c.id,
          "type" => c.type_name.to_s,
          "codename" => c.codename.to_s,
          "safe_set_keys" => safe { c.safe_set_keys },
          "concrete_patterns" => safe { c.concrete_patterns.map(&:to_s) },
          "set_names" => safe { c.set_names },
          "rule_lookup_keys" => safe { c.rule_lookup_keys }
        }
      end

    when "set_subcard_order"
      # Set ORDER. Ruby's set board lists a set's rule cards in the order
      # the deck holds them: Card.search(left: set) with no sort is the
      # natural id order, and `set.visible_setting_codenames` is the
      # settings ordering a set module's rule board renders. Both are
      # asked; both are engine-neutral.
      payload["sets"].map do |sname|
        c = Card[sname]
        next { "set" => sname, "missing" => true } if c.nil?
        {
          "set" => sname,
          "rule_cards" => safe { Card.search(left: sname).map { |r| r.name.to_s } },
          "rule_cards_by_name" => safe { Card.search(left: sname).map { |r| r.name.to_s }.sort },
          "visible_setting_codenames" => safe do
            c.visible_setting_codenames.map { |x| x.to_s }.sort
          end
        }
      end

    when "per_card"
      payload["rows"].map do |row|
        c = Card[row["id"]]
        next { "id" => row["id"], "missing" => true } if c.nil?
        per = {}
        %w[read create update delete].each do |setting|
          per[setting] = safe { c.rule_card(setting)&.name&.to_s }
        end
        {
          "id" => c.id,
          "name" => c.name.to_s,
          "type" => c.type_name.to_s,
          "rule" => per,
          "read_rule_id" => c.read_rule_id,
          "read_rule_class" => c.read_rule_class.to_s,
          "set_names" => safe { c.set_names }
        }
      end

    when "roles"
      payload["roles"].map do |rname|
        r = Card[rname]
        next { "role" => rname, "missing" => true } if r.nil?
        { "role" => rname, "id" => r.id, "type" => r.type_name.to_s }
      end

    when "read_all"
      # ok_to_read? for Anonymous over EVERY live card, plus the write tasks.
      # Written per chunk so a single raise cannot lose the whole population.
      Card.where(trash: false).order(:id).pluck(:id).each_slice(2000) do |slice|
        slice.map do |cid|
          c = Card[cid]
          next { "id" => cid, "missing" => true } if c.nil?
          entry = { "id" => c.id, "name" => c.name.to_s }
          %i[read create update delete].each do |task|
            entry[task.to_s] = safe { c.ok?(task) }
          end
          entry
        end
      end

    when "queries"
      payload["queries"].map do |qq|
        label = qq["label"]
        query = qq["query"].transform_keys(&:to_sym)
        names = safe { Card.search(**query, return: "name") }
        count = safe { Card.search(**query, return: "count") }
        { "label" => label, "count" => count, "names" => names }
      end

    when "new_card_type"
      # What type does Ruby give a card that does not exist yet? Card.fetch
      # with new: {} is the read-only construction path (never stored).
      payload["names"].map do |n|
        card = safe { Card.fetch(n, new: {}) }
        if card.is_a?(String)
          { "name" => n, "error" => card }
        else
          {
            "name" => n,
            "type" => safe { card.type_name.to_s },
            "type_id" => safe { card.type_id },
            "new_card" => safe { card.new_card? },
            "exists" => safe { Card.exist?(n) }
          }
        end
      end

    when "structure_rules"
      payload["rows"].map do |row|
        c = Card[row["id"]]
        next { "id" => row["id"], "missing" => true } if c.nil?
        {
          "id" => c.id,
          "name" => c.name.to_s,
          "left" => safe { c.left&.name&.to_s },
          "content" => c.db_content.to_s,
          "rule?" => safe { c.rule? }
        }
      end

    when "default_rules"
      payload["rows"].map do |row|
        c = Card[row["id"]]
        next { "id" => row["id"], "missing" => true } if c.nil?
        { "id" => c.id, "name" => c.name.to_s, "left" => safe { c.left&.name&.to_s } }
      end

    when "view_defs"
      payload["sets"].map do |sname|
        c = Card[sname]
        next { "set" => sname, "missing" => true } if c.nil?
        fmt = c.format
        present = payload["views"].select { |v| fmt.respond_to?(:"render_#{v}") }
        { "set" => sname, "views" => present, "set_keys" => safe { c.safe_set_keys } }
      end

    when "event_defs"
      # Event names PER SET, not globally. Card::Set::Event#define_simple_method
      # defines "<event>_without_callbacks" on the DECLARING set module, and
      # define_standard_event_method defines the bare name there too. So the
      # engine-neutral question is: of the deck's registered event names,
      # which are defined by a set module this card is actually a member of?
      # That is the membership walk set_condition_card/set_condition_applies?
      # performs (event/all.rb:22-24: singleton_class.include?(set_module)).
      names = EVENT_NAMES
      payload["sets"].map do |sname|
        c = Card.fetch(sname, new: {})
        next { "set" => sname, "missing" => true } if c.nil?
        mods = c.singleton_class.ancestors
        {
          "set" => sname,
          "events" => names.select do |e|
            mods.any? { |m| m.instance_methods(false).include?(:"#{e}_without_callbacks") }
          end.sort
        }
      end

    else
      { "unsupported_kind" => kind }
    end

  answers[id.to_s] = answer
  $stdout.puts "ANSWERED #{id} #{kind}"
  $stdout.flush
end

File.write(OUT_PATH, JSON.generate({ "engine" => "ruby", "answers" => answers }))
$stdout.puts "WROTE #{OUT_PATH}"
$stdout.flush