# Renders every card of a deck from a cold cache and records the bytes.
#
#   DATABASE_URL=sqlite3:<deck> DIGEST_OUT=<file.json> \
#     bundle exec decko runner <this file>
#
# Run it once in a stock Decko 0.20.0 app and once in the same app with this
# gem in its Gemfile, on copies of the same deck; byte_identity.rb compares the
# two files. In an app that has the gem, DIGEST_SETTINGS=off renders with both
# settings false. DIGEST_SHARD=i/n renders only the cards whose id is i modulo
# n, so a run can be split across processes and the files given to
# byte_identity.rb together.
#
# Each card is rendered in the views a page shows it in (open, core, titled)
# and as JSON, after Card::Cache.reset, so every render starts cold and the
# batched loading is exercised from the first fetch. Rendering errors are
# recorded as the error's class and message: they must match too.

require "json"
require "digest"

VIEWS = { html: %i[open core titled], json: %i[molecule] }.freeze

gem_loaded = defined?(Cardio::BatchedNests) ? true : false
if gem_loaded && ENV["DIGEST_SETTINGS"] == "off"
  Card.config.prefetch_nests = false
  Card.config.prefetch_machinery = false
end

def render_bytes card, format, view
  Card::Cache.reset
  Card.fetch(card.id).format(format).render(view).to_s
rescue StandardError => e
  "#{e.class}: #{e.message}"
end

renders = {}
queries = 0
counter = ->(*, payload) { queries += 1 unless payload[:name] == "SCHEMA" }
Card::Auth.as_bot do
  ActiveSupport::Notifications.subscribed(counter, "sql.active_record") do
    shard, shards = ENV.fetch("DIGEST_SHARD", "0/1").split("/").map(&:to_i)
    Card.where(trash: false).order(:id).pluck(:id).each do |id|
      next unless (id % shards) == shard

      card = Card.fetch id
      next unless card

      VIEWS.each do |format, views|
        views.each do |view|
          renders["#{card.name} #{format}/#{view}"] = render_bytes(card, format, view)
        end
      end
    end
  end
end

out = {
  gem_loaded: gem_loaded,
  prefetch_nests: Card.config.respond_to?(:prefetch_nests) && Card.config.prefetch_nests,
  prefetch_machinery: Card.config.respond_to?(:prefetch_machinery) && Card.config.prefetch_machinery,
  render_count: renders.size,
  queries: queries,
  renders: renders.transform_values { |bytes| Digest::SHA256.hexdigest bytes },
  bytes: renders
}
File.write ENV.fetch("DIGEST_OUT"), JSON.pretty_generate(out)
puts "#{renders.size} renders, #{queries} queries -> #{ENV.fetch('DIGEST_OUT')}"
