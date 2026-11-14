# PER-MOD BEHAVIOUR, questions.
#
# The DSL a mod author depends on is per-mod: each Mod card declares its
# "Depends on" set, its script/style assets, and each installed mod
# contributes set modules, views and events. This reads that surface off the
# real deck so both engines answer the same per-mod questions.
#
# Written into a SECOND questions file so the main file's ids stay stable and
# the already-measured categories do not have to be re-run.
#
# Run: decko runner semantics-mod-questions.rb

require "json"

OUT = ENV.fetch("SEMANTICS_MOD_QUESTIONS_OUT")

questions = []

def q(questions, category, kind, payload)
  questions << { "id" => questions.length, "category" => category, "kind" => kind, "payload" => payload }
end

# Every Mod card the deck holds, plus its simple-name tag.
mod_cards = Card.where(type_id: Card.fetch_type_id("Mod"), trash: false).order(:id).to_a
mod_names = mod_cards.map { |c| c.name.to_s }

q(questions, "mods", "mod_census", { "mods" => mod_names })

# "Depends on": the +*depends_on member list every mod card carries. This is
# the set a mod author reads to know what loads first.
depends = {}
mod_cards.each do |mc|
  entry = mc.subcards&.keys&.to_a || []
  content = begin
    (Card.fetch("#{mc}+*depends on", new: {}) || Card.fetch("#{mc}+*depends_on", new: {}))&.db_content.to_s
  rescue StandardError => e
    "ERR:#{e.class}"
  end
  depends[mc.name.to_s] = {
    "subcard_keys" => entry.sort,
    "depends_on_content" => content,
    "depends_on_items" => content.to_s.split(/\r?\n/).map(&:strip).reject(&:empty?).sort
  }
end
q(questions, "mods", "mod_depends_on", { "depends" => depends })

# Per-mod set modules: which Set-typed cards exist for each mod's set paths.
# Asked through the deck, so a mod whose set module did not load shows up.
mod_set_modules = {}
mod_cards.each do |mc|
  key = mc.name.to_s.sub(/\Amod: /, "").gsub(/[^a-z0-9_]/, "_")
  mod_set_modules[mc.name.to_s] = {
    "set_key_token" => key,
    "type" => mc.type_name.to_s,
    "id" => mc.id
  }
end
q(questions, "mods", "mod_set_tokens", { "modules" => mod_set_modules })

# Per-mod view surface: for each mod's set module token, which of the 79
# census views the deck resolves through a set whose safe-key carries that
# token. A mod's `view :name do` inside set/type/<mod>.rb lands here.
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
q(questions, "mods", "mod_views", { "views" => VIEW_NAMES, "mods" => mod_names })

# Per-mod events: the deck's event census, asked per mod so a mod whose set
# module registers an event is distinguishable from one that does not.
q(questions, "mods", "mod_events", { "mods" => mod_names })

# Per-mod type registration: does each mod's cardtype exist, and is it a
# Cardtype, and what does a new card of that type get?
mod_type_cards = {}
mod_cards.each do |mc|
  tag = mc.name.to_s.sub(/\Amod: /, "")
  candidates = [tag, tag.gsub(/ /, "_"), tag.gsub(/ /, ""), tag.split.map(&:capitalize).join]
  found = nil
  found_name = nil
  candidates.uniq.each do |cand|
    card = Card[cand]
    next if card.nil?
    found = card
    found_name = cand
    break
  end
  mod_type_cards[mc.name.to_s] =
    if found.nil?
      { "exists" => false }
    else
      {
        "exists" => true,
        "probe" => found_name,
        "id" => found.id,
        "type" => found.type_name.to_s,
        "codename" => found.codename.to_s
      }
    end
end
q(questions, "mods", "mod_type_cards", { "cards" => mod_type_cards })

File.write(OUT, JSON.generate({ "questions" => questions }))
$stdout.puts "WROTE #{OUT}: #{questions.length} questions"
$stdout.flush