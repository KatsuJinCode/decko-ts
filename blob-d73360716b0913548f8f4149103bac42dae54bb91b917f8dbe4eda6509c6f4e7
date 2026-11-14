# Generates the semantics question set from the REAL deck (every card in the
# captured corpus) plus targeted edge cases.
#
# The output is engine-neutral JSON: every probe (Ruby and TypeScript) reads
# the SAME questions file and answers the SAME ids, so the comparison is a
# pure diff of answers with no per-engine question generation to drift.
#
# Run: decko runner semantics-questions.rb  > questions.json

require "json"

OUT = ENV.fetch("SEMANTICS_QUESTIONS_OUT")

questions = []

def q(questions, category, kind, payload)
  questions << { "id" => questions.length, "category" => category, "kind" => kind, "payload" => payload }
end

# ---------------------------------------------------------------- population
# Every live card in the deck, in a deterministic order (id asc). The probes
# sample from this same list, so both engines see identical cards.
live_ids = Card.where(trash: false).order(:id).pluck(:id)
live_names = Card.where(trash: false).order(:id).map(&:name)

q(questions, "population", "counts", {})
q(questions, "population", "live_ids", {})

# Every live card's identity + type, so naming/keys and type inheritance are
# checked across the WHOLE corpus, not a sample.
live_ids.each_slice(2000) do |slice|
  rows = Card.where(id: slice).order(:id).map do |c|
    { "id" => c.id, "name" => c.name, "key" => c.key, "type" => c.type_name.to_s,
      "codename" => c.codename.to_s, "trash" => c.trash? }
  end
  q(questions, "identity", "cards", { "rows" => rows })
end

# Every rule card: its set, its setting, whether Ruby calls it a rule, and a
# preference. Rule lookup / rule membership is the heart of semantics.
rule_ids = Card.where(trash: false).where.not(codename: true)
  .where("type_id = ?", Card.fetch_type_id("Setting")).order(:id).pluck(:id)
rule_ids.each_slice(2000) do |slice|
  rows = Card.where(id: slice).order(:id).map do |c|
    is_rule = begin
      c.rule?
    rescue StandardError
      "ERR"
    end
    is_std = begin
      c.standard_rule?
    rescue StandardError
      "ERR"
    end
    is_pref = begin
      c.preference?
    rescue StandardError
      "ERR"
    end
    { "id" => c.id, "name" => c.name, "key" => c.key, "left" => c.left&.name.to_s,
      "right" => c.right&.name.to_s, "trunk" => c.name.trunk.to_s, "tag" => c.name.tag.to_s,
      "rule?" => is_rule, "standard_rule?" => is_std, "preference?" => is_pref,
      "content" => c.db_content.to_s }
  end
  q(questions, "rules", "rule_cards", { "rows" => rows })
end

# ------------------------------------------------------- naming and key rules
# Every live card's name algebra: the same questions both engines answer from
# the NAME alone (no storage), so a name/key difference shows up here.
q(questions, "naming", "all_names", { "names" => live_names })

# Targeted naming edge cases, over and above the corpus.
EDGE_NAMES = [
  "*all", "*type", "+*type", "*type+*create", "*all+*type+*read",
  "my name", "My Name", "MY NAME", "a+b+c+d", "A+B+C",
  "participant(s)", "Participant (s)", "Participant(s) Child",
  "CM 20110527-28", "20120918+CM+Thoughts", "x's card", "X'S Card",
  "*rstar", "*star", "Jordan Sample", "david_william",
  "  leading space", "trailing space  ", "double  space",
  "under_score", "dash-name", "period.name", "comma,name",
  "semi;colon", "paren(name)", "name+number", "name+number two",
  "RichText", "rich_text", "*all+*self+*read",
  "20140113+CM+Time Tracking", "nested+deeper+deepest",
  "This one's got an apostrophe", "quote\"inside",
  "emoji 😀 card", "über name", "naïve",
  "*following", "*followed", "*followers", "*followees",
  "3 + 4", "a++b", "+leading joint", "trailing+",
  "Team+Members", "Team+*members"
]
q(questions, "naming", "edge_names", { "names" => EDGE_NAMES })

# --------------------------------------------------------------- set membership
# Which cards belong to which set, in the order Ruby's pattern walk gives.
SAMPLE_SETS = [
  "*all", "*self", "*type", "*rstar", "*star", "*type plus right", "*right",
  "*left", "*rule", "*type plus right", "Person", "Set", "Setting", "Cardtype",
  "Role", "Search", "List", "Pointer", "Image", "File", "Basic", "BasicCs",
  "RichText", "Topic", "Project", "Task", "Date", "Number", "Toggle", "HTML",
  "Shark", "Administrator", "Wagneer", "CB_role", "Team", "Anyone",
  "Anyone Signed In", "Anyone With Role"
]
q(questions, "sets", "set_definitions", { "sets" => SAMPLE_SETS })

# Set ORDER: the ordered list of subcard keys each set holds. Ruby's
# `set.subcards.keys` is the authored order the rules board renders in.
# The probe answers it per set; the payload only names the sets.
q(questions, "sets", "set_subcard_order", { "sets" => SAMPLE_SETS })

# ------------------------------------------------------------------ rule lookup
# For every live card, which rule answers each of the four permission settings,
# and which read rule its row names.
lookup_ids = live_ids
lookup_ids.each_slice(500) do |slice|
  rows = Card.where(id: slice).order(:id).map do |c|
    per = {}
    %w[read create update delete].each do |setting|
      rc = begin
        c.rule_card(setting)
      rescue StandardError => e
        "ERR:#{e.class}"
      end
      per[setting] = rc&.name&.to_s
    end
    { "id" => c.id, "name" => c.name, "type" => c.type_name.to_s,
      "rule" => per,
      "read_rule_id" => c.read_rule_id,
      "read_rule_class" => c.read_rule_class,
      "set_names" => (begin; c.set_names; rescue StandardError; "ERR"; end) }
  end
  q(questions, "rulelookup", "per_card", { "rows" => rows })
end

# ------------------------------------------------------------------ permissions
# Read/create/update/delete for every role the deck has, over a real card
# population: every live card whose stored read rule is not "Anyone".
ROLES = Card.search(type: "Role", return: :name).sort
q(questions, "permissions", "roles", { "roles" => ROLES })

# Card population for permission probes: every live card, chunked.
q(questions, "permissions", "read_all", {})

# ------------------------------------------------------------------- CQL battery
CQL_QUERIES = [
  { "label" => "type_person", "query" => { "type" => "Person", "sort" => "name" } },
  { "label" => "type_role", "query" => { "type" => "Role", "sort" => "name" } },
  { "label" => "type_cardtype", "query" => { "type" => "Cardtype", "sort" => "name" } },
  { "label" => "type_set", "query" => { "type" => "Set", "sort" => "name" } },
  { "label" => "type_rich_text", "query" => { "type" => "RichText", "sort" => "name", "limit" => 50 } },
  { "label" => "type_pointer", "query" => { "type" => "Pointer", "sort" => "name", "limit" => 50 } },
  { "label" => "type_list", "query" => { "type" => "List", "sort" => "name", "limit" => 50 } },
  { "label" => "type_toggle", "query" => { "type" => "Toggle", "sort" => "name", "limit" => 50 } },
  { "label" => "type_search", "query" => { "type" => "Search", "sort" => "name", "limit" => 50 } },
  { "label" => "type_date", "query" => { "type" => "Date", "sort" => "name", "limit" => 50 } },
  { "label" => "type_number", "query" => { "type" => "Number", "sort" => "name", "limit" => 50 } },
  { "label" => "left_all", "query" => { "left" => "*all", "sort" => "name" } },
  { "label" => "left_star", "query" => { "left" => "*star", "sort" => "name" } },
  { "label" => "left_rstar", "query" => { "left" => "*rstar", "sort" => "name" } },
  { "label" => "left_self", "query" => { "left" => "*self", "sort" => "name" } },
  { "label" => "right_read", "query" => { "right" => "*read", "sort" => "name" } },
  { "label" => "right_create", "query" => { "right" => "*create", "sort" => "name" } },
  { "label" => "right_update", "query" => { "right" => "*update", "sort" => "name" } },
  { "label" => "right_delete", "query" => { "right" => "*delete", "sort" => "name" } },
  { "label" => "plus_star", "query" => { "plus" => "*star", "sort" => "name" } },
  { "label" => "plus_rstar", "query" => { "plus" => "*rstar", "sort" => "name" } },
  { "label" => "plus_type", "query" => { "plus" => "*type", "sort" => "name" } },
  { "label" => "name_star", "query" => { "name" => "*all" } },
  { "label" => "name_person_any", "query" => { "name" => "Bridget Castellan" } },
  { "label" => "not_cardtype", "query" => { "not" => { "type" => "Cardtype" }, "type" => "Person", "sort" => "name" } },
  { "label" => "type_desc", "query" => { "type" => "Person", "sort" => "name", "dir" => "desc" } },
  { "label" => "type_create_desc", "query" => { "type" => "Person", "sort" => "create", "dir" => "desc", "limit" => 30 } },
  { "label" => "type_update", "query" => { "type" => "Person", "sort" => "update", "limit" => 30 } },
  { "label" => "trash_off", "query" => { "type" => "Person", "trash" => "trash off", "sort" => "name" } },
  { "label" => "refer_to", "query" => { "refer_to" => "*left", "sort" => "name", "limit" => 30 } },
  { "label" => "linked_to", "query" => { "linked_to" => "*left", "sort" => "name", "limit" => 30 } },
  { "label" => "no_results", "query" => { "name" => "No Such Card At All" } },
  { "label" => "nonexistent_type", "query" => { "type" => "Nonexistent Type XYZ" } },
  { "label" => "empty", "query" => { "type" => "Person", "sort" => "name", "limit" => 0 } }
]
q(questions, "cql", "queries", { "queries" => CQL_QUERIES })

# Type and structure inheritance: what type does a NEW card of this name get,
# and what does a *structure rule do.
STRUCTURE_NAMES = [
  "my new card", "My New Card", "*all", "Person+*self", "Person+new field",
  "Shark+new field", "*all+new field", "Team+new field",
  "a+b+c", "20140113+CM+Time Tracking", "*type", "+*type",
  "Anyone+new field", "Administrator+new field"
]
q(questions, "inheritance", "new_card_type", { "names" => STRUCTURE_NAMES })

# The structure rules the deck actually holds.
structure_card = Card["*structure"]
structure_rows = structure_card ? Card.where(right_id: structure_card.id, trash: false).order(:id).map do |c|
  { "id" => c.id, "name" => c.name, "left" => c.left&.name.to_s, "content" => c.db_content.to_s }
end : []
q(questions, "inheritance", "structure_rules", { "rows" => structure_rows })

# *default rules the deck holds.
default_card = Card["*default"]
default_rows = default_card ? Card.where(right_id: default_card.id, trash: false).order(:id).map do |c|
  { "id" => c.id, "name" => c.name, "left" => c.left&.name.to_s }
end : []
q(questions, "inheritance", "default_rules", { "rows" => default_rows })

# ------------------------------------------------------------------- the DSL
# View definitions and events per set: what a mod author would rely on.
# VIEW_NAMES is the census list; the probe answers "does set S respond to
# render_<view> for each", which is the membership question a set module's
# `view :name do ... end` block answers.
VIEW_NAMES = %w[
  content open core title head body raw name key link linkname url url_link
  codename id type created_at updated_at children subcards left right settings
  rules types table_of_contents search bar mini_bar bars btm_left btm_right
  filtered_list list_items items nest_guide each_card each_content group_names
  group set_guide recent_changes history account_link sign_in sign_up
  forgot_password signed_up email new_password reset_password dashboard header
  footer sidebar getting_started wrap layout style script default_html_view
  content_options content_option_view demo form rich_text json csv yaml text
  basic pointer toggle date number image file cacheable cached_data cite
  default_reference_layout default_text_layout
]
q(questions, "dsl", "view_defs", { "sets" => SAMPLE_SETS, "views" => VIEW_NAMES })

# Event definitions: the event names the deck's set modules register.
q(questions, "dsl", "event_defs", { "sets" => SAMPLE_SETS })

File.write(OUT, JSON.generate({ "questions" => questions }))
$stdout.puts "WROTE #{OUT}: #{questions.length} questions"
$stdout.flush