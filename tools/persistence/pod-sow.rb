# pod-sow.rb -- export cards as a Decko pod, exactly as `decko sow` builds it.
#
#   RAILS_ENV=development DATABASE_URL=sqlite3:<deck> \
#     bundle exec decko runner tools/persistence/pod-sow.rb <out.yml> <cql-json> [field_tags] [options-json]
#
# Cardio::Mod::Sow with a CQL selection (`decko sow -c`), the YAML written to
# <out.yml> instead of a mod's data/<podtype>.yml (Sow#dump writes the same
# `hash.to_yaml` there; without a mod it prints the same YAML colourised).
#
# options-json selects Sow's other sources and outputs instead of the CQL
# (pass "" as the CQL): {"name": "A,B", "items": "only"|true} (`-n` with
# `--items`), {"url": "<path or url>"} (`--url`), and {"merge_into": "<file>"},
# which merges the new data into that existing data file as `decko sow -m`
# merges into a mod's data/<podtype>.yml (Sow#output_hash; the file stands in
# for the mod's, so no mod directory is written). The result goes to <out.yml>.

require "json"

usage = "usage: pod-sow.rb <out.yml> <cql-json> [field_tags] [options-json]"
out = ARGV[0] or abort usage
cql = ARGV[1] or abort usage
field_tags = ARGV[2].to_s.empty? ? nil : ARGV[2]
options = ARGV[3].to_s.empty? ? {} : JSON.parse(ARGV[3])

yaml = Thread.new do
  Card::Auth.as_bot do
    Card::Cache.reset_all
    items = options["items"] == "only" ? :only : options["items"]
    sow = Cardio::Mod::Sow.new(cql: cql.empty? ? nil : cql, podtype: :real, field_tags: field_tags,
                               name: options["name"], items: items, url: options["url"])
    if (target = options["merge_into"])
      sow.define_singleton_method(:filename) { target }
      sow.send(:output_hash).to_yaml
    else
      sow.send(:new_data).to_yaml
    end
  end
end.value
File.binwrite(out, yaml) # binary: the exact to_yaml bytes (text mode would add CR on Windows)
warn "[pod] sowed #{YAML.safe_load(yaml, permitted_classes: [Symbol]).size} items to #{out}"
