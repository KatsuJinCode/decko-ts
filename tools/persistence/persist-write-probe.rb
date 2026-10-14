# persist-write-probe.rb -- RUBY ORACLE half of the persistence parity probe.
#
# Runs ONE operation per process against a copy of the real oracle deck and
# dumps the normalised state of every table Decko writes into
# <outdir>/step-<n>.json. The driver (run-ruby-steps.sh) invokes it once per
# step, in order, against the SAME deck file; the sqlite file carries all
# state between steps exactly as a live deck would.
#
#   RAILS_ENV=development DATABASE_URL=sqlite3:<copy> \
#     bundle exec decko runner <this file> <outdir> <stepIndex>
#
# WHY ONE PROCESS PER STEP. Decko's compound-name resolution recurses deep
# enough that a SystemStackError mid-op leaves Ruby's stack permanently
# degraded for the rest of that process: every later op then fails the same
# way, on the same deck, with the same op list — measured, and the reason
# several earlier runs looked like sixteen engine findings and were really
# one environment fault. A fresh process per step makes each measurement
# independent and each retry honest. On a machine with headroom the whole
# list runs in one process; the two routes produce the same state.
#
# DETERMINISM
# - No clock stub. Overriding Time.now/Date.today in a runner script sends
#   ActiveRecord's type casting into a recursion, and freezing buys nothing:
#   created_at/updated_at/acted_at are normalised to a token by the
#   comparator, and the TS side injects its own clock.
# - Ids are NOT normalised here. The comparator maps both sides through a
#   name-keyed index so an id difference cannot mask a content difference,
#   while an id COUNT or ORDER difference is still a fault.
# - The deck copy must be freshly made for the run; the driver does that.

require "json"

OUTDIR = ARGV[0] or abort "usage: persist-write-probe.rb <outdir> <stepIndex 1..32>"
STEP = Integer(ARGV[1] || "0")
abort "step index must be >= 1" if STEP < 1

PREFIX = "PersistProbe"

# Uploads (steps 68-70) go to a run-scoped directory the driver owns
# (PERSIST_FILES_DIR), never into the app's own files or public trees, and
# never to a cloud bucket. Windows grants File.symlink only with a special
# privilege, so the public-link step uses hard links, as on the POSIX hosts
# Decko targets (the same arrangement as the side-effects harness).
FILES_DIR = ENV["PERSIST_FILES_DIR"]
if FILES_DIR
  require "fileutils"
  FileUtils.mkdir_p(File.join(FILES_DIR, "files"))
  FileUtils.mkdir_p(File.join(FILES_DIR, "public", "files"))
  Cardio.config.file_buckets = {}
  Cardio.config.file_default_storage = :local
  Cardio.paths["files"] = File.join(FILES_DIR, "files")
  Cardio.paths["public"] = File.join(FILES_DIR, "public")
  # The uploader's cache resolves Cardio.paths["tmp"]
  # (carrier_wave/file_card_uploader/path.rb cache_dir): an app whose own
  # tmp/ directory does not exist resolves it to nil and the upload steps
  # fail on "no implicit conversion of nil into String", so provide it in
  # the run-scoped directory (harness_env.rb configure_files! makes the
  # same arrangement for the builder and the adapter).
  FileUtils.mkdir_p(File.join(FILES_DIR, "tmp", "files"))
  Cardio.paths["tmp"] = File.join(FILES_DIR, "tmp")
  File.singleton_class.prepend(Module.new do
    def symlink(src, dest) = File.link(src, dest)
    def symlink?(path) = File.exist?(path)
  end)
end
UPLOAD_TEXT = "persistence probe file\n"
UPLOAD_TEXT_2 = "persistence probe file, second version\n"
# A 1x1 PNG.
UPLOAD_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

def upload_file(name, bytes)
  dir = File.join(FILES_DIR || abort("uploads need PERSIST_FILES_DIR"), "uploads")
  FileUtils.mkdir_p(dir)
  path = File.join(dir, name)
  File.binwrite(path, bytes)
  File.open(path, "rb")
end

# The stored files of the probe's cards: card id, file name, and the SHA-1
# of each file's bytes (image versions are listed by name only: their bytes
# are the image encoder's, compared by the side-effects measurement).
def probe_files(ids)
  return [] unless FILES_DIR

  require "digest"
  ids.flat_map do |id|
    Dir.glob(File.join(FILES_DIR, "files", id.to_s, "*")).sort.map do |path|
      name = File.basename(path)
      version = name =~ /-(icon|small|medium|large|original)\./
      { "card_id" => id, "file" => name,
        "sha1" => version && !name.include?("-original.") ? nil : Digest::SHA1.file(path).hexdigest }
    end
  end
end
# The withheld step set (reference-harness/fixtures/write-battery-v1/
# withheld/steps.json). Those steps are NOT part of the public run: they
# reproduce a Ruby content-cleaner defect the public material is not cleared
# to carry, and every step after them would record the content they store. A
# release package excludes that directory, so when it is absent this half runs
# the public op list only and says so out loud rather than skipping silently.
WITHHELD_DIR = File.expand_path("../../reference-harness/fixtures/" \
                                 "write-battery-v1/withheld", __dir__)
WITHHELD_STEPS_FILE = ENV["PERSIST_WITHHELD_STEPS"] || File.join(WITHHELD_DIR, "steps.json")
# The op list's withheld steps. The set file declares them and is excluded from
# a release package, so the numbers live here: an absent file must withhold the
# same steps, not silently widen the run to all 70.
WITHHELD_STEP_NUMBERS = [20, 22, 31].freeze
WITHHELD_SET_PRESENT = File.exist?(WITHHELD_STEPS_FILE)
WITHHELD_STEPS = WITHHELD_SET_PRESENT ? [] : WITHHELD_STEP_NUMBERS
if WITHHELD_SET_PRESENT
  warn "[withheld until disclosure] RUN: #{WITHHELD_STEP_NUMBERS.length} steps (#{WITHHELD_STEPS_FILE})"
else
  warn "[withheld until disclosure] NOT RUN: #{WITHHELD_STEP_NUMBERS.length} steps (#{WITHHELD_STEPS_FILE})"
end

# Markup Card::Content.clean! must rewrite: an event handler attribute, a
# script element, a script-capable link target, and allowed markup that must
# survive. Only the withheld steps use it, so it lives in the withheld set
# (withheld/unsafe-html.txt, the same bytes the TypeScript half reads) and the
# public source carries no copy.
UNSAFE_HTML_FILE = File.join(WITHHELD_DIR, "unsafe-html.txt")
UNSAFE_HTML = File.exist?(UNSAFE_HTML_FILE) ? File.read(UNSAFE_HTML_FILE).strip : ""
# The new content step 32 gives an existing, nested deck card.
NESTED_DECK_CONTENT = "<p>Number cards hold numbers. (persistence probe)</p>"
# Step 37's referer: links and a nest naming the rename subject, its child,
# its grandchild and a card that has it as its right side.
LINKER_CONTENT = "[[PersistProbe Mv]] [[PersistProbe Mv+PersistProbe Kid]] " \
                 "{{PersistProbe Mv+PersistProbe Kid+PersistProbe Grand}} [[PersistProbe Host+PersistProbe Mv]]"
# Step 51's pointer content: bracketed items, an id mark, a codename mark,
# a blank line and surrounding spaces.
LIST_CONTENT = "[[PersistProbe Typed]]\n\n  [[PersistProbe Typed+PersistProbe Field]]  \n~1\n:anyone\nPersistProbe Loose"

# The probe's own cards: the simple ones by name, and everything reachable
# from them through left_id/right_id (compound cards carry NULL name/key).
PROBE_SQL = <<~SQL.freeze
  WITH RECURSIVE probe(id) AS (
    SELECT id FROM cards WHERE name LIKE '#{PREFIX}%'
    UNION
    SELECT c.id FROM cards c JOIN probe p ON c.left_id = p.id OR c.right_id = p.id
  ) SELECT id FROM probe
SQL

def probe_ids
  ActiveRecord::Base.connection.select_values(PROBE_SQL).map(&:to_i).sort
end

# Every query is scoped by the probe's ids IN SQL: pulling whole tables and
# filtering in Ruby costs a 32,000-row card_changes scan per step.
def probe_state
  keep = probe_ids
  return { "probe_card_ids" => [], "cards" => [], "card_acts" => [],
           "card_actions" => [], "card_changes" => [], "card_references" => [],
           "card_virtuals" => [] } if keep.empty?
  c = ActiveRecord::Base.connection
  list = keep.join(",")
  actions = c.select_all(<<~SQL).to_a
    SELECT id, card_id, card_act_id, super_action_id, action_type, draft, comment
    FROM card_actions WHERE card_id IN (#{list}) ORDER BY id
  SQL
  action_ids = actions.map { |a| a["id"] }.join(",")
  changes =
    if action_ids.empty?
      []
    else
      c.select_all(<<~SQL).to_a
        SELECT id, card_action_id, field, value FROM card_changes
        WHERE card_action_id IN (#{action_ids}) ORDER BY id
      SQL
    end
  {
    "probe_card_ids" => keep,
    "cards" => c.select_all(<<~SQL).to_a,
      SELECT id, name, key, codename, left_id, right_id, trash, type_id, db_content,
             creator_id, updater_id, read_rule_class, read_rule_id,
             current_revision_id, references_expired, created_at, updated_at
      FROM cards WHERE id IN (#{list}) ORDER BY id
    SQL
    "card_acts" => c.select_all(<<~SQL).to_a,
      SELECT id, card_id, actor_id, ip_address, acted_at FROM card_acts
      WHERE card_id IN (#{list}) ORDER BY id
    SQL
    "card_actions" => actions,
    "card_changes" => changes,
    "card_references" => c.select_all(<<~SQL).to_a,
      SELECT id, referer_id, referee_key, referee_id, ref_type, is_present
      FROM card_references
      WHERE referer_id IN (#{list}) OR referee_key LIKE '#{PREFIX.downcase}%'
      ORDER BY id
    SQL
    "card_virtuals" => c.select_all(<<~SQL).to_a,
      SELECT id, left_id, right_id, left_key, content FROM card_virtuals
      WHERE left_id IN (#{list}) ORDER BY id
    SQL
    "files" => probe_files(keep)
  }
end

# Resolve a probe card by composed name INCLUDING trashed rows — the probe
# has to address the rows it just trashed.
def id_of(name)
  by_id = {}
  ActiveRecord::Base.connection.select_all(
    "SELECT id, name, left_id, right_id FROM cards"
  ).each { |r| by_id[r["id"].to_i] = r }
  memo = {}
  composed = lambda do |id|
    return memo[id] if memo.key?(id)
    row = by_id[id]
    return nil if row.nil?
    if row["left_id"].nil? && row["name"].is_a?(String) && !row["name"].empty?
      return memo[id] = row["name"]
    end
    return nil if row["left_id"].nil?
    left = composed.call(row["left_id"].to_i)
    right = composed.call(row["right_id"].to_i)
    memo[id] = (left && right) ? "#{left}+#{right}" : nil
  end
  by_id.keys.each do |id|
    n = composed.call(id)
    by_id[:names] ||= {}
    by_id[:names][n] = id if n
  end
  by_id[:names][name]
end

# The id of a card's Nth action (1-based, id order, drafts included), or of
# its last action when n is :last. Both engines number a card's actions the
# same way while their rows match, so an ordinal names the same action.
def nth_action_id(name, n)
  ids = Card::Action.where(card_id: id_of(name)).order(:id).pluck(:id)
  n == :last ? ids.last : ids[n - 1]
end

def act_of_action(action_id)
  Card::Action.find(action_id).card_act_id
end

# A revert request exactly as the history pane's links send it
# (card-mod-history set/all/history/actions.rb revert_actions_link): an
# update of the card fetched with look_in_trash, the card hash assigned, and
# the revert parameters in Env.params, which the :rollback_actions event
# reads. Mirrors CardController#update over Card.uri_fetch.
def revert_request(name, revert_params)
  params = ActiveSupport::HashWithIndifferentAccess.new(
    revert_params.merge("mark" => name, "look_in_trash" => "true", "assign" => "true",
                        "card" => { "skip" => "validate_renaming" })
  )
  Card::Env.params = params
  card = Card.uri_fetch(params)
  raise "revert target not found: #{name}" unless card
  card.update! params[:card].to_h
  card
ensure
  Card::Env.params = {}
end

# One op per label, in order. Each returns the value or raises; the caller
# records what happened either way, because a raised op IS a finding.
#
# Steps 7 and 8 revive through the route path (a create whose name matches a
# trashed row); step 19 revives through the model API. Keep this table in
# lockstep with tests/tools/persist-write-probe.test.ts.
def run_op(step)
  case step
  when 1
    [:create, "create simple", -> { Card.create!(name: "PersistProbe A", type: "RichText", content: "alpha") }]
  when 2
    [:create, "create compound", -> { Card.create!(name: "PersistProbe A+PersistProbe B", type: "RichText", content: "beta") }]
  when 3
    [:update, "update content", -> { Card.find(id_of("PersistProbe A")).update!(content: "alpha beta") }]
  when 4
    [:update, "update with link", -> { Card.find(id_of("PersistProbe A")).update!(content: "alpha beta [[PersistProbe B]]") }]
  when 5
    [:rename, "rename", -> { Card.find(id_of("PersistProbe A")).update!(name: "PersistProbe Renamed") }]
  when 6
    [:trash, "trash (delete!)", -> { Card.find(id_of("PersistProbe Renamed")).delete! }]
  when 7
    [:create, "revive child (route path: create same name)", -> { Card.create!(name: "PersistProbe Renamed+PersistProbe B", type: "RichText", content: "beta") }]
  when 8
    [:create, "revive parent (route path: create same name)", -> { Card.create!(name: "PersistProbe Renamed", type: "RichText", content: "alpha beta [[PersistProbe B]]") }]
  when 9
    [:noop, "no-op update", lambda {
      card = Card.find(id_of("PersistProbe Renamed"))
      before = Card::Action.count
      card.update!(content: card.db_content)
      { "actions_before" => before, "actions_after" => Card::Action.count }
    }]
  when 10
    [:create, "create over existing name", -> { Card.create!(name: "PersistProbe Renamed", type: "RichText", content: "dup") }]
  when 11
    [:create, "create with cardtype", -> { Card.create!(name: "PersistProbe Type Probe", type: "Cardtype") }]
  when 12
    [:update, "update add nest", lambda {
      Card.find(id_of("PersistProbe Renamed")).update!(
        content: "alpha beta [[PersistProbe B]] {{{PersistProbe Renamed|rich_text}}}}"
      )
    }]
  when 13
    [:update, "update remove nest and link", -> { Card.find(id_of("PersistProbe Renamed")).update!(content: "alpha beta") }]
  when 14
    [:draft, "save draft", -> { Card.find(id_of("PersistProbe Renamed")).save_content_draft("drafted text") }]
  when 15
    [:update, "real save after draft", -> { Card.find(id_of("PersistProbe Renamed")).update!(content: "alpha beta final") }]
  when 16
    [:create, "create parent", -> { Card.create!(name: "PersistProbe Parent", type: "RichText", content: "p") }]
  when 17
    [:create, "create child", -> { Card.create!(name: "PersistProbe Parent+PersistProbe Child", type: "RichText", content: "c") }]
  when 18
    [:delete, "delete parent (trash cascade)", -> { Card.find(id_of("PersistProbe Parent")).delete! }]
  when 19
    # The MODEL-API revival: Card#update!(trash: false) on a trashed row,
    # which Card.find reaches because find has no trash filter. Last in the
    # list on purpose: in Ruby it revives the child alone under a trashed
    # parent, and every later op would inherit that state.
    [:trash, "revive child (model path: update trash=false)", -> { Card.find(id_of("PersistProbe Parent+PersistProbe Child")).update!(trash: false) }]
  when 20
    [:update, "update with unsafe html", -> { Card.find(id_of("PersistProbe Renamed")).update!(content: UNSAFE_HTML) }]
  when 21
    [:create, "create without type or content", -> { Card.create!(name: "PersistProbe Bare") }]
  when 22
    [:create, "create plain text with html", -> { Card.create!(name: "PersistProbe Plain", type: "PlainText", content: UNSAFE_HTML) }]
  # 23-31: the history pane's revert and restore requests.
  when 23
    [:create, "create revert subject", -> { Card.create!(name: "PersistProbe Rev", type: "RichText", content: "one [[PersistProbe B]]") }]
  when 24
    [:update, "update revert subject", -> { Card.find(id_of("PersistProbe Rev")).update!(content: "two") }]
  when 25
    [:rename, "rename revert subject", -> { Card.find(id_of("PersistProbe Rev")).update!(name: "PersistProbe Rev Renamed") }]
  when 26
    [:revert, "revert to this (undoes the rename)", lambda {
      revert_request("PersistProbe Rev Renamed", "revert_actions" => [nth_action_id("PersistProbe Rev Renamed", 2).to_s])
    }]
  when 27
    [:revert, "revert to this (the create's content)", lambda {
      revert_request("PersistProbe Rev", "revert_actions" => [nth_action_id("PersistProbe Rev", 1).to_s])
    }]
  when 28
    [:revert, "revert to previous (the last act)", lambda {
      act = act_of_action(nth_action_id("PersistProbe Rev", :last))
      revert_request("PersistProbe Rev", "revert_to" => "previous", "revert_act" => act.to_s)
    }]
  when 29
    [:delete, "delete revert subject", -> { Card.find(id_of("PersistProbe Rev")).delete! }]
  when 30
    [:revert, "restore from history (revert a trashed card)", lambda {
      ids = Card::Action.where(card_id: id_of("PersistProbe Rev")).order(:id).pluck(:id)
      revert_request("PersistProbe Rev", "revert_actions" => [ids[-2].to_s])
    }]
  when 31
    [:revert, "revert to previous of a create (trashes it)", lambda {
      act = act_of_action(nth_action_id("PersistProbe Plain", 1))
      revert_request("PersistProbe Plain", "revert_to" => "previous", "revert_act" => act.to_s)
    }]
  # 32: a save of an existing deck card that another existing card nests
  # (Number nests Number+description): its writes land outside the probe's
  # rows, including the nester's update_ancestor_timestamps bump. Measured
  # by tools/persistence/compare-decks.mjs.
  when 32
    [:update, "update a nested deck card", lambda {
      Card.fetch("Number+description").update!(content: NESTED_DECK_CONTENT)
    }]
  # 33-42: renames that move descendants, rewrite referers, create sides.
  when 33
    [:create, "create rename subject", -> { Card.create!(name: "PersistProbe Mv", type: "RichText", content: "m") }]
  when 34
    [:create, "create rename subject's child", lambda {
      Card.create!(name: "PersistProbe Mv+PersistProbe Kid", type: "RichText", content: "k")
    }]
  when 35
    [:create, "create rename subject's grandchild", lambda {
      Card.create!(name: "PersistProbe Mv+PersistProbe Kid+PersistProbe Grand", type: "RichText", content: "g")
    }]
  when 36
    [:create, "create card with subject as right side", lambda {
      Card.create!(name: "PersistProbe Host+PersistProbe Mv", type: "RichText", content: "h")
    }]
  when 37
    [:create, "create referer of the subject's family", lambda {
      Card.create!(name: "PersistProbe Linker", type: "RichText", content: LINKER_CONTENT)
    }]
  when 38
    [:rename, "rename with descendants (referers updated)", lambda {
      Card.find(id_of("PersistProbe Mv")).update!(name: "PersistProbe Moved")
    }]
  when 39
    [:rename, "rename with descendants (referers kept)", lambda {
      Card.find(id_of("PersistProbe Moved")).update!(name: "PersistProbe Moved Again",
                                                     skip: :update_referer_content)
    }]
  when 40
    [:rename, "rename compound to new sides", lambda {
      Card.find(id_of("PersistProbe Moved Again+PersistProbe Kid"))
          .update!(name: "PersistProbe Far+PersistProbe Kid2")
    }]
  when 41
    [:rename, "rename simple to compound", lambda {
      Card.find(id_of("PersistProbe Linker")).update!(name: "PersistProbe Lnk+PersistProbe Side")
    }]
  when 42
    [:rename, "rename a tag in use to compound (refused)", lambda {
      Card.find(id_of("PersistProbe Kid2")).update!(name: "PersistProbe X+PersistProbe Y")
    }]
  # 43-50: type changes.
  when 43
    [:create, "create type-change subject", lambda {
      Card.create!(name: "PersistProbe Typed", type: "RichText", content: "<p>t [[PersistProbe B]]</p>")
    }]
  when 44
    [:update, "change type", -> { Card.find(id_of("PersistProbe Typed")).update!(type: "PlainText") }]
  when 45
    [:update, "change type and content", lambda {
      Card.find(id_of("PersistProbe Typed")).update!(type: "Pointer", content: "[[PersistProbe B]]")
    }]
  when 46
    [:create, "create field of type-change subject", lambda {
      Card.create!(name: "PersistProbe Typed+PersistProbe Field", type: "RichText", content: "f")
    }]
  when 47
    [:update, "change type of a card with a field", lambda {
      Card.find(id_of("PersistProbe Typed")).update!(type: "RichText")
    }]
  when 48
    [:update, "change to an unknown type", lambda {
      Card.find(id_of("PersistProbe Bare")).update!(type: "PersistProbe No Such Type")
    }]
  when 49
    [:create, "create instance of probe cardtype", lambda {
      Card.create!(name: "PersistProbe Instance", type: "PersistProbe Type Probe", content: "i")
    }]
  when 50
    [:update, "change type of a cardtype with instances", lambda {
      Card.find(id_of("PersistProbe Type Probe")).update!(type: "RichText")
    }]
  # 51-52: list content (standardized items, item references, item swaps).
  when 51
    [:create, "create pointer with marks", lambda {
      Card.create!(name: "PersistProbe List", type: "Pointer", content: LIST_CONTENT)
    }]
  when 52
    [:rename, "rename a card a pointer lists", lambda {
      Card.find(id_of("PersistProbe Typed")).update!(name: "PersistProbe Typed2")
    }]
  # 53-56: form saves with subcards.
  when 53
    [:create, "create with subcards", lambda {
      Card.create!(name: "PersistProbe Form", type: "RichText", content: "main",
                   subcards: { "+PersistProbe Sub" => { content: "s" },
                               "PersistProbe Other" => { type: "PlainText", content: "o" } })
    }]
  when 54
    [:update, "update subcards only (one changed, one new)", lambda {
      Card.find(id_of("PersistProbe Form")).update!(
        subcards: { "+PersistProbe Sub" => { content: "s2" },
                    "+PersistProbe New Sub" => { content: "n" } }
      )
    }]
  when 55
    [:update, "update main with an unchanged subcard", lambda {
      Card.find(id_of("PersistProbe Form")).update!(
        content: "main2", subcards: { "+PersistProbe Sub" => { content: "s2" } }
      )
    }]
  when 56
    [:create, "create with a list subcard", lambda {
      Card.create!(name: "PersistProbe Form2", type: "RichText", content: "f2",
                   subcards: { "+PersistProbe Tags" => { type: "Pointer",
                                                         content: "[[PersistProbe B]]\n[[PersistProbe Form]]" } })
    }]
  # 57-60: account and role cards.
  when 57
    [:create, "create user with account", lambda {
      Card.create!(name: "PersistProbe User", type: "User",
                   subcards: { "+*account" => { subcards: { "+*email" => { content: "persist-probe@example.com" },
                                                           "+*password" => { content: "Probe-pass-123" } } } })
    }]
  when 58
    [:update, "change account password", lambda {
      Card.fetch("PersistProbe User+*account+*password").update!(content: "Probe-pass-456")
    }]
  when 59
    [:create, "create role", -> { Card.create!(name: "PersistProbe Role", type: "Role") }]
  when 60
    [:create, "add user to role", lambda {
      Card.create!(name: "PersistProbe Role+*members", content: "[[PersistProbe User]]")
    }]
  # 61-64: rules that change read permissions.
  when 61
    [:create, "create *self read rule", lambda {
      Card.create!(name: "PersistProbe Form+*self+*read", content: "[[PersistProbe Role]]")
    }]
  when 62
    [:create, "create *type read rule", lambda {
      Card.create!(name: "PersistProbe Type Probe+*type+*read", content: "[[Anyone Signed In]]")
    }]
  when 63
    [:update, "change a read rule's content", lambda {
      Card.fetch("PersistProbe Form+*self+*read").update!(content: "[[Administrator]]")
    }]
  when 64
    [:delete, "delete a read rule", -> { Card.fetch("PersistProbe Form+*self+*read").delete! }]
  # 65-67: reverts whose act renames or trashes another card.
  when 65
    [:update, "update with a subcard rename", lambda {
      Card.find(id_of("PersistProbe Form")).update!(
        content: "main3", subcards: { "PersistProbe Other" => { name: "PersistProbe Other Renamed" } }
      )
    }]
  when 67
    [:revert, "revert to previous (act renamed another card)", lambda {
      # The act of step 65 (the card's action before step 66's).
      ids = Card::Action.where(card_id: id_of("PersistProbe Form")).order(:id).pluck(:id)
      act = act_of_action(ids[-2])
      revert_request("PersistProbe Form", "revert_to" => "previous", "revert_act" => act.to_s)
    }]
  when 66
    [:revert, "revert to previous of a create act with subcards (trashes them)", lambda {
      act = act_of_action(nth_action_id("PersistProbe Form", 1))
      revert_request("PersistProbe Form", "revert_to" => "previous", "revert_act" => act.to_s)
    }]
  # 68-70: file and image uploads.
  when 68
    [:create, "create file card with an upload", lambda {
      Card.create!(name: "PersistProbe File", type: "File", file: upload_file("probe.txt", UPLOAD_TEXT))
    }]
  when 69
    [:update, "replace a file card's upload", lambda {
      Card.find(id_of("PersistProbe File")).update!(file: upload_file("probe-2.txt", UPLOAD_TEXT_2))
    }]
  when 70
    [:create, "create image card with an upload", lambda {
      Card.create!(name: "PersistProbe Image", type: "Image",
                   image: upload_file("probe.png", UPLOAD_PNG_BASE64.unpack1("m")))
    }]
  else
    abort "unknown step #{step}"
  end
end

# A withheld step is not part of this run at all: it writes nothing, and no
# state file is recorded for it, so the public dumps carry only the public
# list's own steps.
if WITHHELD_STEPS.include?(STEP)
  warn "[persist] step #{STEP} withheld until disclosure; not run"
  exit 0
end

# PERSIST_WATCHDOG=<seconds>: a step still running after that long prints
# every thread's backtrace and exits, so a hang is diagnosed, not waited on.
if (watchdog = ENV["PERSIST_WATCHDOG"])
  Thread.new do
    sleep Integer(watchdog)
    Thread.list.each do |t|
      warn "[persist] thread #{t.inspect}"
      (t.backtrace || []).first(60).each { |line| warn "[persist] | #{line}" }
    end
    exit! 3
  end
end

kind, label, fn = run_op(STEP)
# The op runs on its own Thread: on Windows the main thread's stack is fixed
# by the executable, and Decko's compound-name save recurses past it. A Thread
# takes RUBY_THREAD_VM_STACK_SIZE / RUBY_THREAD_MACHINE_STACK_SIZE (the driver
# sets both), which is what removes the SystemStackError.
#
# An upload (steps 68-70) runs its integrate_with_delay job inline, and the
# job enters the app executor, which the runner's main thread holds (a
# monitor, reentrant only for its own thread): on the op thread that
# deadlocks. Those saves have simple names and need no large stack, so they
# run on the main thread.
MAIN_THREAD_STEPS = [68, 69, 70].freeze

def run_on_op_thread(&block)
  return block.call if MAIN_THREAD_STEPS.include?(STEP)

  ActiveSupport::Dependencies.interlock.permit_concurrent_loads { Thread.new(&block).value }
end

detail = run_on_op_thread do
  begin
    value = Card::Auth.as_bot { fn.call }
    { "ok" => true, "kind" => kind, "value" => value.respond_to?(:id) ? value.id : value }
  rescue SystemStackError, StandardError => e
    warn "[persist] step #{STEP} #{label}: #{e.class}: #{e.message}"
    { "ok" => false, "kind" => kind, "error" => "#{e.class}: #{e.message}" }
  end
end

# The rendered result of a revert: the reverted card's core view, fetched as
# the request's soft redirect re-fetches it (fresh from the database, trash
# included so a revert that trashes the card still reports its name and
# type; a trashed card has no core view to render).
render = nil
if kind == :revert && detail["ok"] && detail["value"].is_a?(Integer)
  render = run_on_op_thread do
    Card::Auth.as_bot do
      Card::Cache.reset_all
      card = Card.fetch(detail["value"], look_in_trash: true)
      { "name" => card.name.to_s, "trash" => card.trash, "type" => card.type_name.to_s,
        "core" => card.trash ? nil : card.format(:html).render(:core).to_s }
    rescue StandardError => e
      { "error" => "#{e.class}: #{e.message}" }
    end
  end
end

state = probe_state
warn "[persist] #{STEP} #{label} ok=#{detail['ok']} " \
     "cards=#{state['cards'].size} acts=#{state['card_acts'].size} " \
     "actions=#{state['card_actions'].size} changes=#{state['card_changes'].size} " \
     "refs=#{state['card_references'].size}"

require "fileutils"
FileUtils.mkdir_p(OUTDIR)
File.write(
  File.join(OUTDIR, format("step-%02d.json", STEP)),
  JSON.pretty_generate({ "step" => STEP, "label" => label, "detail" => detail, "state" => state,
                         # The account fields whose content is random or
                         # derived from it (compare-persist.mjs normalises them).
                         "codename_ids" => { "salt" => Card::Codename.id(:salt),
                                             "password" => Card::Codename.id(:password) },
                         **(render ? { "render" => render } : {}) })
)