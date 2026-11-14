# Builds a reference deck: applies a fixture's deck.json to a freshly seeded
# stock deck, as Decko Bot, under the fixture clock.
#
#   DECK_JSON=<fixture>/deck.json bundle exec decko runner build-deck.rb
#
# DATABASE_URL names the freshly seeded deck (written in place) and
# DECKO_FILES_DIR the directory uploaded files are stored under. Cards are
# created in the order deck.json lists them, through Card.create!, so every row
# the deck holds is a row stock Decko wrote.

require_relative "lib/harness_env"

spec = JSON.parse(File.read(ENV.fetch("DECK_JSON")))
fixture_dir = File.dirname(File.expand_path(ENV.fetch("DECK_JSON")))
raise "unknown deck format #{spec['format']}" unless spec["format"] == "decko-reference-deck/1"

HarnessEnv.freeze_clock!(spec["clock"])
HarnessEnv.apply_environment!(spec["environment"])

def subcards_for(fields)
  fields.to_h.transform_values do |value|
    if value.is_a?(Hash)
      { subcards: subcards_for(value["fields"]) }.merge(value.except("fields").transform_keys(&:to_sym))
    else
      { content: value.to_s }
    end
  end
end

def create_args(card, fixture_dir)
  args = { name: card["name"] }
  if card["type"]
    args[:type_id] = Card.fetch(card["type"])&.id || raise("unknown type #{card['type']} for #{card['name']}")
  end
  args[:content] = card["content"] if card.key?("content")
  args[:subcards] = subcards_for(card["fields"]) if card["fields"]
  if card["file"]
    # Image cards mount their attachment as `image` (card-mod-carrierwave
    # set/type/image.rb: `attachment :image`), File cards as `file`.
    image_type_id = Card.fetch("Image")&.id
    attr = card["type"] && Card.fetch(card["type"])&.id == image_type_id ? :image : :file
    args[attr] = File.open(File.join(fixture_dir, card["file"]), "rb")
  end
  args
end

# The seed was written at wall-clock time; restamp it to the fixture clock so
# a rebuilt deck is row-for-row reproducible.
Card.update_all(created_at: HarnessEnv.clock, updated_at: HarnessEnv.clock)
Card::Act.update_all(acted_at: HarnessEnv.clock)

created = 0
HarnessEnv.on_stack do
  Card::Auth.as_bot do
    spec["cards"].each do |card|
      Card::Env.reset
      warn "[build] #{created + 1} #{card['name']}" if ENV["HARNESS_TRACE"]
      # Entries are upserts: a card the seed already holds is updated.
      existing = Card.fetch(card["name"])
      if existing&.real?
        existing.update!(create_args(card, fixture_dir).except(:name))
      else
        Card.create!(create_args(card, fixture_dir))
      end
      created += 1
    rescue StandardError => e
      raise "deck build failed at card #{created + 1} (#{card['name']}): #{e.class}: #{e.message}"
    end
  end
end

# Compile the script and style asset outputs now, so they are part of the
# deck every engine reads, rather than written by the first render.
Card::Cache.reset_all
Card::Auth.as_bot { Card::Assets.refresh(force: true) }

Card::Cache.reset_all
ActiveRecord::Base.connection.execute("PRAGMA wal_checkpoint(TRUNCATE)") rescue nil
total = Card.where(trash: false).count
puts JSON.generate(built: spec["name"], created: created, live_cards: total)
