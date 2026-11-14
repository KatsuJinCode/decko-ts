Gem::Specification.new do |s|
  s.name        = "card-mod-batched-nests"
  s.version     = "0.1.0"
  s.summary     = "Batched nest loading for Decko 0.20.0 (card 1.110.0)"
  s.description = "Loads the cards a rendered content nests and links to a level " \
                  "at a time, and the cards Decko's own machinery needs in batches, " \
                  "so a nest tree costs a few queries per level instead of a few per card. " \
                  "Rendered output is unchanged."
  s.authors     = ["decko-ts contributors"]
  s.license     = "GPL-3.0-or-later"
  s.files       = Dir["lib/**/*.rb", "config/**/*.rb"]
  s.required_ruby_version = ">= 3.0"
  s.add_dependency "card", "1.110.0"
  s.metadata = { "card-mod" => "batched_nests" }
end
