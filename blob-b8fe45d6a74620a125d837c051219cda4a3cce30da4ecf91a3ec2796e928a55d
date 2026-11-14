# PER-MOD BEHAVIOUR, Ruby answers.
#
# Run: decko runner semantics-mod-answer.rb

require "json"

QUESTIONS = JSON.parse(File.read(ENV.fetch("SEMANTICS_MOD_QUESTIONS")))
OUT_PATH = ENV.fetch("SEMANTICS_MOD_ANSWERS")

def safe
  yield
rescue StandardError => e
  "ERR:#{e.class}:#{e.message.to_s[0, 120]}"
end

EVENT_NAMES = (
  begin
    Card.instance_methods.grep(/_without_callbacks\z/).map { |m| m.to_s.sub(/_without_callbacks\z/, "") }.sort
  rescue StandardError
    []
  end
)

answers = {}

QUESTIONS["questions"].each do |question|
  id = question["id"]
  kind = question["kind"]
  payload = question["payload"]
  view_census = payload["views"] || []

  answer =
    case kind
    when "mod_census"
      payload["mods"].map do |mname|
        card = Card[mname]
        next { "mod" => mname, "missing" => true } if card.nil?
        { "mod" => mname, "id" => card.id, "type" => card.type_name.to_s,
          "codename" => card.codename.to_s }
      end

    when "mod_depends_on"
      payload["depends"].keys.map do |mname|
        mc = Card[mname]
        next { "mod" => mname, "missing" => true } if mc.nil?
        { "mod" => mname }.merge(payload["depends"][mname])
      end

    when "mod_set_tokens"
      payload["modules"].map do |mname, entry|
        { "mod" => mname }.merge(entry)
      end

    when "mod_views"
      # Per-mod view surface: for each mod's set-module token, which census
      # views resolve on a card whose safe-set-keys carry that token. Read off
      # a real card of the mod's own type where the deck has one, else off the
      # mod card itself.
      payload["mods"].map do |mname|
        mc = Card[mname]
        next { "mod" => mname, "missing" => true } if mc.nil?
        tag = mname.sub(/\Amod: /, "")
        probe_names = [tag, tag.gsub(/ /, "_"), tag.gsub(/ /, ""), tag.split.map(&:capitalize).join]
        probe = probe_names.uniq.map { |n| Card[n] }.compact.first
        probe_name = probe_names.uniq.find { |n| !Card[n].nil? }
        unless probe.nil?
          fmt = probe.format
          present = view_census.select { |v| fmt.respond_to?(:"render_#{v}") }
          {
            "mod" => mname,
            "probe" => probe_name,
            "views" => present,
            "set_keys" => safe { probe.safe_set_keys }
          }
        else
          { "mod" => mname, "probe" => nil, "views" => [], "set_keys" => "MISSING" }
        end
      end

    when "mod_events"
      payload["mods"].map do |mname|
        mc = Card[mname]
        next { "mod" => mname, "missing" => true } if mc.nil?
        tag = mname.sub(/\Amod: /, "")
        probe_names = [tag, tag.gsub(/ /, "_"), tag.gsub(/ /, ""), tag.split.map(&:capitalize).join]
        probe = probe_names.uniq.map { |n| Card[n] }.compact.first
        if probe.nil?
          { "mod" => mname, "events" => [] }
        else
          mods = probe.singleton_class.ancestors
          {
            "mod" => mname,
            "events" => EVENT_NAMES.select do |e|
              mods.any? { |m| m.instance_methods(false).include?(:"#{e}_without_callbacks") }
            end.sort
          }
        end
      end

    when "mod_type_cards"
      payload["cards"].keys.map do |mname|
        { "mod" => mname }.merge(payload["cards"][mname])
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