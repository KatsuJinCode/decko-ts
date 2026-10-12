# THE RUBY ORACLE, synthetic cards.
#
# Creates the cards listed in SEMANTICS_SYNTHETIC ({"cards": [{name,
# type_code?, content}]}) as Decko Bot, answers the question file through
# semantics-answer-wave2.rb, and rolls every write back. Used for mods no card
# in the deck exercises: the cards exist only inside this transaction, on a
# local deck copy.
#
# Run: decko runner semantics-synthetic.rb
#   SEMANTICS_SYNTHETIC=<cards.json> SEMANTICS_QUESTIONS=<questions.json>
#   SEMANTICS_ANSWERS=<answers.json> SEMANTICS_ONLY_KINDS=<kinds>

require "json"

spec = JSON.parse(File.read(ENV.fetch("SEMANTICS_SYNTHETIC")))
created = []

ActiveRecord::Base.transaction do
  Card::Auth.as_bot do
    spec["cards"].each do |c|
      args = { name: c["name"], content: c["content"].to_s }
      args[:type_code] = c["type_code"].to_sym if c["type_code"]
      card = Card.create! args
      created << { "name" => card.name.to_s, "type" => card.type_name.to_s, "id" => card.id }
    end
  end
  Card::Cache.reset_all
  # Answer as the anonymous viewer, like the other probes (as_bot leaves the
  # bot as the current user when no one was signed in).
  Card::Auth.signin Card::AnonymousID
  $stdout.puts "CREATED #{JSON.generate(created)}"
  load File.join(__dir__, "semantics-answer-wave2.rb")
  raise ActiveRecord::Rollback
end

$stdout.puts "ROLLED BACK #{created.length} synthetic cards"
