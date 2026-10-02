# read-rule-union-and-codename-reset-probe.rb - P1.4.b + E4.2.a oracle probe
#
# Ruby truth pinned (runs on a DISPOSABLE COPY of the oracle deck's
# db/development.sqlite3 via the DATABASE_URL override; the copy is mutated
# BY DESIGN - every write is enumerated in the fixture's provenance block;
# the canonical oracle deck is never opened for write):
#
#   P1.4.b (card-mod-permissions set/all/permissions.rb:139-144 ok_to_read?):
#     `self.read_rule_id ||= permission_rule_id :read` - a card row with
#     read_rule_id NULL does NOT mean "public"; Ruby DERIVES the rule live
#     and the verdict equals the stored-rule twin. The corpus has zero
#     trash=0 rows with read_rule_id NULL, which is why this arm was
#     pinned-synthetic; this probe manufactures the rows on the copy.
#   E4.2.a (card-1.110.0 lib/card/codename.rb:80-84 reset_cache +
#     mod/core/set/all/codename.rb:9-13 event :reset_codename_cache,
#     :integrate, changed: :codename): the codehash is an in-process memo
#     (@codehash ||= load_codehash, codename.rb:118-120) with NO db
#     fallthrough in []/id, so a raw-SQL codename change stays STALE until a
#     real save fires the event and reset_cache nils the memo and rebuilds.
#
# Run (Git Bash, from the oracle app dir):
#   cd C:/localProjects/decko-ts/tools/oracle/decko-oracle-app
#   RAILS_ENV=development \
#   DATABASE_URL=sqlite3:C:/localProjects/decko-ts-lane-skipped/tmp/read-rule-union-and-codename-reset-ruby-probe/deck-copy.sqlite3 \
#   bundle exec decko runner \
#     C:/localProjects/decko-ts-lane-skipped/tools/oracle/read-rule-union-and-codename-reset-probe.rb
#
# Output: fixtures/captured/codename-reset-and-read-rule-union-oracle.json
# (in the decko-ts-lane-skipped repo).

require "json"

REPO_ROOT = "/c/localProjects/decko-ts-lane-skipped".sub("/c/", "C:/")
OUT_PATH = File.join(REPO_ROOT, "fixtures", "captured",
                     "codename-reset-and-read-rule-union-oracle.json")
SLOT_ID_RE = /data-slot-id=(["'])\h+\1/.freeze

def normalize(html)
  html.gsub(SLOT_ID_RE, 'data-slot-id="RANDOMIZED"')
end

def raw_sql(sql)
  Card.connection.select_all(sql).to_a
end

def deep_sort(obj)
  case obj
  when Hash  then obj.sort.to_h.transform_values { |v| deep_sort(v) }
  when Array then obj.map { |v| deep_sort(v) }
  else obj
  end
end

counts_before = { card_actions: Card::Action.count, cards: Card.count, card_acts: Card::Act.count }
fixture = {
  "capture" => "codename-reset-and-read-rule-union",
  "provenance" => {
    "deck" => "DISPOSABLE COPY of decko-oracle-app db/development.sqlite3",
    "mechanism" => "DATABASE_URL=sqlite3:<copy> decko runner; canonical deck untouched",
    "writes" => ["raw UPDATE cards SET read_rule_id=NULL (2 rows)",
                 "raw UPDATE cards SET codename='probestalecodename' (1 row)",
                 "Card#update! codename='probelivecodename' on card 605 (1 act)"],
  },
}

# ---- P1.4.b: the read-rule derive arm ---------------------------------------

TARGET_ID = 605 # "Oracle Basics" - Anonymous read-DENIED (stored rule)

p14b = {}
stored = raw_sql("SELECT read_rule_id FROM cards WHERE id = #{TARGET_ID}")
p14b["target_stored_read_rule_id"] = stored[0] && stored[0]["read_rule_id"]

Card::Auth.as(Card::AnonymousID) do
  card = Card.fetch(TARGET_ID)
  card.reload
  p14b["stored_ok_read"] = card.ok?(:read)
  p14b["stored_titled"] = normalize(card.format(:html).render(:titled))

  raw_sql("UPDATE cards SET read_rule_id = NULL WHERE id = #{TARGET_ID}")
  card = Card.fetch(TARGET_ID)
  card.reload
  p14b["nulled_read_rule_id_row"] = raw_sql("SELECT read_rule_id FROM cards WHERE id = #{TARGET_ID}")[0]["read_rule_id"]
  p14b["derived_ok_read"] = card.ok?(:read)
  p14b["derived_titled"] = normalize(card.format(:html).render(:titled))
  p14b["derived_matches_stored_verdict"] = p14b["stored_ok_read"] == p14b["derived_ok_read"]
  p14b["derived_matches_stored_bytes"] = p14b["stored_titled"] == p14b["derived_titled"]
end

# the public side of the same arm: a governed card Anonymous CAN read, then
# its read_rule_id NULLed - the derive arm must reach the same verdict+bytes
readable = nil
Card::Auth.as(Card::AnonymousID) do
  candidates = raw_sql("SELECT id FROM cards WHERE trash = 0 AND read_rule_id IS NOT NULL AND type_id IS NOT NULL LIMIT 400")
  candidates.each do |row|
    c = Card.fetch(row["id"]) rescue next
    next unless c.ok?(:read) rescue next
    readable = c
    break
  end
end
if readable
  rid = readable.id
  p14b["public_card_id"] = rid
  Card::Auth.as(Card::AnonymousID) do
    readable.reload
    p14b["public_stored_ok_read"] = readable.ok?(:read)
    p14b["public_stored_titled"] = normalize(readable.format(:html).render(:titled))
    raw_sql("UPDATE cards SET read_rule_id = NULL WHERE id = #{rid}")
    fresh = Card.fetch(rid)
    fresh.reload
    p14b["public_derived_ok_read"] = fresh.ok?(:read)
    p14b["public_derived_titled"] = normalize(fresh.format(:html).render(:titled))
    p14b["public_derived_matches_stored"] =
      p14b["public_stored_ok_read"] == p14b["public_derived_ok_read"] &&
      p14b["public_stored_titled"] == p14b["public_derived_titled"]
  end
else
  p14b["public_card_id"] = nil
  p14b["public_note"] = "no Anonymous-readable governed card in the first 400 governed rows"
end

p14b["deck_null_read_rule_rows"] =
  raw_sql("SELECT COUNT(*) AS n FROM cards WHERE trash = 0 AND read_rule_id IS NULL")[0]["n"]
fixture["p1_4_b"] = p14b

# ---- E4.2.a: the in-memory codename cache reset -----------------------------

e42a = {}
e42a["warm_read_codename_id"] = Card::Codename.id("read")
memo_before = Card::Codename.instance_variable_get(:@codehash)
e42a["memo_present_before"] = !memo_before.nil?
e42a["memo_object_id_before"] = memo_before.object_id
e42a["codename_ids_size_before"] = Card::Codename.ids.size

# 1. raw SQL codename change BYPASSES the event: the memo must go STALE
raw_sql("UPDATE cards SET codename = 'probestalecodename' WHERE id = #{TARGET_ID}")
e42a["row_codename_after_raw_update"] = raw_sql("SELECT codename FROM cards WHERE id = #{TARGET_ID}")[0]["codename"]
e42a["stale_id_lookup"] = Card::Codename.id("probestalecodename")
memo_after_raw = Card::Codename.instance_variable_get(:@codehash)
e42a["memo_object_id_after_raw_update"] = memo_after_raw.object_id
e42a["memo_unchanged_by_raw_sql"] = memo_after_raw.object_id == memo_before.object_id

# 2. the REAL save fires event :reset_codename_cache (:integrate, changed:
#    :codename) -> reset_cache nils the memo, drops the shared cache entry,
#    regenerates the id constants
Card::Auth.as_bot do
  card = Card.fetch(TARGET_ID)
  card.update! codename: "probelivecodename"
end
e42a["row_codename_after_save"] = raw_sql("SELECT codename FROM cards WHERE id = #{TARGET_ID}")[0]["codename"]
e42a["fresh_id_lookup_after_save"] = Card::Codename.id("probelivecodename")
e42a["stale_key_after_reset"] = Card::Codename.id("probestalecodename")
memo_after_save = Card::Codename.instance_variable_get(:@codehash)
e42a["memo_object_id_after_save"] = memo_after_save.nil? ? nil : memo_after_save.object_id
e42a["memo_was_reset"] = memo_after_save.nil? || memo_after_save.object_id != memo_before.object_id
e42a["codename_ids_size_after"] = Card::Codename.ids.size
fixture["e4_2_a"] = e42a

counts_after = { card_actions: Card::Action.count, cards: Card.count, card_acts: Card::Act.count }
fixture["probe_write_receipt"] = { before: counts_before, after: counts_after }

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(fixture)) + "\n")
puts "WROTE #{OUT_PATH}"
puts "P1.4.b derived==stored: denied arm #{p14b['derived_matches_stored_bytes']}, public arm #{p14b['public_derived_matches_stored'].inspect}"
puts "E4.2.a stale=#{e42a['stale_id_lookup'].inspect} memo_unchanged_by_raw_sql=#{e42a['memo_unchanged_by_raw_sql']} fresh_after_save=#{e42a['fresh_id_lookup_after_save'].inspect} memo_was_reset=#{e42a['memo_was_reset']}"
puts "probe writes: card_actions #{counts_before[:card_actions]}->#{counts_after[:card_actions]}, acts #{counts_before[:card_acts]}->#{counts_after[:card_acts]}"
$stdout.flush
