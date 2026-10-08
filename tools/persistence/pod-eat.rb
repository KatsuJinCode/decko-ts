# pod-eat.rb -- import a Decko pod exactly as `decko eat` does.
#
#   RAILS_ENV=development DATABASE_URL=sqlite3:<deck> \
#     bundle exec decko runner tools/persistence/pod-eat.rb <pod.yml> <report.json>
#
# Cardio::Mod::Eat reads its pods from mods' data directories; this reads one
# pod file instead and runs Eat#run's own steps on each item, in order:
# handle_up (cache reset, mail off, as Decko Bot), then per item
# current_user (item :user), time_machine (item :time) and Card.ensure!, with
# an error on one item reported and the run going on (Eat#rescuing). The
# report records each item's outcome so the TypeScript port's can be compared.

require "json"

pod = ARGV[0] or abort "usage: pod-eat.rb <pod.yml> <report.json>"
report_path = ARGV[1] or abort "usage: pod-eat.rb <pod.yml> <report.json>"

report = Thread.new do
  eat = Cardio::Mod::Eat.new(podtype: :real)
  items = YAML.load_file(pod, permitted_classes: [Symbol])
  out = { "items" => items.size, "created" => 0, "updated" => 0, "unchanged" => 0,
          "skippedNotPristine" => [], "errors" => [] }
  label = lambda do |item|
    name = item[:name]
    show = ->(p) { p.is_a?(Symbol) ? ":#{p}" : p.to_s }
    if name.is_a?(Array) then name.map(&show).join("+")
    elsif name then name.to_s
    elsif item[:codename] then show.call(item[:codename])
    else "(unnamed)"
    end
  end
  Card::Cache.reset_all
  Card::Mailer.perform_deliveries = false
  Card::Auth.as_bot do
    items.each do |edible|
      edible = edible.dup
      mark = edible[:codename]&.to_sym || edible[:name]
      existed = !Card.fetch(mark).nil? rescue false
      acts_before = Card::Act.count
      begin
        eat.send(:current_user, edible.delete(:user))
        card = eat.send(:time_machine, edible.delete(:time)) { Card.ensure! edible }
        saved = Card::Act.count > acts_before
        if !existed then out["created"] += 1
        elsif saved then out["updated"] += 1
        elsif card && !card.pristine? then out["skippedNotPristine"] << label.call(edible)
        else out["unchanged"] += 1
        end
      rescue StandardError => e
        out["errors"] << { "item" => label.call(edible), "error" => e.message }
      end
    end
  end
  out
end.value
File.binwrite(report_path, JSON.pretty_generate(report))
warn "[pod] ate #{report['items']} items: created=#{report['created']} updated=#{report['updated']} " \
     "unchanged=#{report['unchanged']} skipped=#{report['skippedNotPristine'].size} errors=#{report['errors'].size}"
