Gem::Specification.new do |s|
  s.name        = "card-mod-batched-nests"
  s.version     = "0.2.0"
  s.summary     = "Batched nest loading, 1-trip live_page_bundles, and O(1) lazy rule watermarks for Decko 0.20.0 (card 1.110.0)"
  s.description = "Loads the cards a rendered content nests and links to a level " \
                  "at a time, batches Decko's own machinery lookups, hydrates full " \
                  "page closures in 1 SQL query via live_page_bundles, and turns " \
                  "*read rule saves into O(1) lazy watermarks via deck_rule_flags. " \
                  "Rendered output is byte-identical to stock Decko across bot and non-bot renders."
  s.authors     = ["decko-ts contributors"]
  s.license     = "GPL-3.0-or-later"
  s.files       = Dir["lib/**/*.rb", "config/**/*.rb"]
  s.required_ruby_version = ">= 3.1"
  s.add_dependency "card", "1.110.0"
  s.metadata = { "card-mod" => "batched_nests" }
end
