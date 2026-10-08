# pod-sow.rb -- export cards as a Decko pod, exactly as `decko sow` builds it.
#
#   RAILS_ENV=development DATABASE_URL=sqlite3:<deck> \
#     bundle exec decko runner tools/persistence/pod-sow.rb <out.yml> <cql-json> [field_tags]
#
# Cardio::Mod::Sow with a CQL selection (`decko sow -c`), the YAML written to
# <out.yml> instead of a mod's data/<podtype>.yml (Sow#dump writes the same
# `hash.to_yaml` there; without a mod it prints the same YAML colourised).

out = ARGV[0] or abort "usage: pod-sow.rb <out.yml> <cql-json> [field_tags]"
cql = ARGV[1] or abort "usage: pod-sow.rb <out.yml> <cql-json> [field_tags]"
field_tags = ARGV[2]

yaml = Thread.new do
  Card::Auth.as_bot do
    Card::Cache.reset_all
    sow = Cardio::Mod::Sow.new(cql: cql, podtype: :real, field_tags: field_tags)
    sow.send(:new_data).to_yaml
  end
end.value
File.binwrite(out, yaml) # binary: the exact to_yaml bytes (text mode would add CR on Windows)
warn "[pod] sowed #{YAML.safe_load(yaml, permitted_classes: [Symbol]).size} items to #{out}"
