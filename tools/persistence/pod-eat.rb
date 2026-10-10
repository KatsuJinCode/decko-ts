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

# Attachments (Eat::Edibles#handle_attachments): POD_FILES_DIR stands in for
# the mod's data/files directory; each :file / :image value is opened from
# it. Stored uploads go to PERSIST_FILES_DIR (never the app's own files or
# public trees, never a cloud bucket), with hard links for the public links
# as in persist-write-probe.rb.
POD_FILES_DIR = ENV["POD_FILES_DIR"]
if (store = ENV["PERSIST_FILES_DIR"])
  require "fileutils"
  FileUtils.mkdir_p(File.join(store, "files"))
  FileUtils.mkdir_p(File.join(store, "public", "files"))
  Cardio.config.file_buckets = {}
  Cardio.config.file_default_storage = :local
  Cardio.paths["files"] = File.join(store, "files")
  Cardio.paths["public"] = File.join(store, "public")
  File.singleton_class.prepend(Module.new do
    def symlink(src, dest) = File.link(src, dest)
    def symlink?(path) = File.exist?(path)
  end)
end

def handle_attachments edible
  return edible unless POD_FILES_DIR

  Card.uploaders.each_key do |key|
    next unless edible.key?(key)

    path = File.join(POD_FILES_DIR, edible[key])
    raise StandardError, "#{edible[key]} not found. Should be in data/files." unless File.exist?(path)

    edible[key] = File.open(path, "rb")
  end
  edible
end

# An upload runs its integrate_with_delay job inline, entering the app
# executor the runner's main thread holds, so pods with attachments are eaten
# on the main thread (see persist-write-probe.rb run_on_op_thread).
def on_eat_thread(&block)
  POD_FILES_DIR ? block.call : Thread.new(&block).value
end

report = on_eat_thread do
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
      edible = handle_attachments(edible.dup)
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
end
File.binwrite(report_path, JSON.pretty_generate(report))
warn "[pod] ate #{report['items']} items: created=#{report['created']} updated=#{report['updated']} " \
     "unchanged=#{report['unchanged']} skipped=#{report['skippedNotPristine'].size} errors=#{report['errors'].size}"
