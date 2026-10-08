# THE RUBY ORACLE, semantics lane, second wave.
#
# Re-answers the first-wave questions whose Ruby probe was wrong, and answers
# the second-wave questions (tools/oracle/semantics-extend-questions.mjs):
#
#   counts          type counts by codename id (the first wave resolved type
#                   ids through fetch_type_id on display names, which returned
#                   one id for Set, Setting and Role)
#   read_all        the per-card verdicts (the first wave returned the id
#                   slices instead of the verdicts)
#   queries         unchanged, re-run so the viewer it ran under is recorded
#   view_defs_full  every _view_<name> method a set's html format defines, with
#                   the winning module and the mod its source file belongs to
#                   (the first wave asked respond_to?(:render_<name>), which is
#                   true for every name through method_missing)
#   event_defs_full every <event>_without_callbacks method on the card's
#                   singleton ancestry, per module (the first wave read only
#                   the methods on Card itself, i.e. the all-set events)
#   id_fetch        fetch-by-id, explained step by step
#   inflection_rows the rows whose key depends on the inflection table, under
#                   the stock inflector and the deck's table, with the stored
#                   key as captured and as a mirror computed without the table
#   role_permissions ok_to_* per role, through one member of each role
#
# Every write here runs inside a transaction that is rolled back.
#
# Run: decko runner semantics-answer-wave2.rb
#   SEMANTICS_QUESTIONS=<questions.json>  SEMANTICS_ANSWERS=<answers-ruby-wave2.json>

require "json"

QUESTIONS = JSON.parse(File.read(ENV.fetch("SEMANTICS_QUESTIONS")))
OUT_PATH = ENV.fetch("SEMANTICS_ANSWERS")
KINDS = (ENV["SEMANTICS_ONLY_KINDS"]&.split(",") || %w[counts read_all queries view_defs_full event_defs_full id_fetch inflection_rows role_permissions]).freeze

def safe
  yield
rescue StandardError => e
  "ERR:#{e.class}:#{e.message.to_s[0, 120]}"
end

def say(msg)
  $stdout.puts msg
  $stdout.flush
end

# The mod a source file belongs to: a card-mod gem, the card gem's core mod,
# or a deck-local mod directory.
def mod_of(file)
  f = file.to_s.tr("\\", "/")
  return Regexp.last_match(1) if f =~ %r{/gems/(card-mod-[a-z0-9_]+)-\d}
  return "core" if f =~ %r{/gems/card-\d[^/]*/mod/core/}
  return "card-lib" if f =~ %r{/gems/card-\d[^/]*/lib/}
  return "deck:#{Regexp.last_match(1)}" if f =~ %r{/mod/([^/]+)/}
  f.empty? ? "unknown" : "other:#{File.basename(f)}"
end

def source_of(mod, meth)
  loc = mod.instance_method(meth).source_location&.first.to_s
  if loc.empty? || loc.include?("/lib/card/set/event") || loc.include?("/lib/card/set/format")
    alt = (Object.const_source_location(mod.name)&.first.to_s rescue "")
    loc = alt unless alt.to_s.empty?
  end
  loc
end

def reset_caches
  Card::Cache.reset_all
  Card::Name.reset if Card::Name.respond_to?(:reset)
  Cardname.reset
end

def codename_id(code)
  Card::Codename.id(code)
rescue StandardError
  nil
end

answers = {}
meta = {
  "auth_current_id" => (Card::Auth.current_id rescue nil),
  "auth_always_ok" => (Card::Auth.always_ok? rescue nil),
  "anonymous_id" => codename_id(:anonymous)
}

# inflection_rows runs last: it installs the deck's inflection table in this
# process, which would change every key computed after it.
ordered = QUESTIONS["questions"].sort_by { |q| [q["kind"] == "inflection_rows" ? 1 : 0, q["id"]] }
ordered.each do |question|
  kind = question["kind"]
  next unless KINDS.include?(kind)

  id = question["id"]
  payload = question["payload"]
  answer =
    case kind
    when "counts"
      typed = lambda do |code|
        tid = codename_id(code)
        tid.nil? ? -1 : Card.where(type_id: tid, trash: false).count
      end
      {
        "live" => Card.where(trash: false).count,
        "trashed" => Card.where(trash: true).count,
        "total" => Card.count,
        "cardtypes" => typed.call(:cardtype),
        "sets" => typed.call(:set),
        "settings" => typed.call(:setting),
        "roles" => typed.call(:role),
        "users" => typed.call(:user)
      }

    when "read_all"
      Card.where(trash: false).order(:id).pluck(:id).map do |cid|
        c = Card[cid]
        next { "id" => cid, "missing" => true } if c.nil?

        entry = { "id" => c.id, "name" => c.name.to_s }
        %i[read create update delete].each { |task| entry[task.to_s] = safe { c.ok?(task) } }
        entry
      end

    when "queries"
      payload["queries"].map do |qq|
        query = qq["query"].transform_keys(&:to_sym)
        {
          "label" => qq["label"],
          "count" => safe { Card.search(**query, return: "count") },
          "names" => safe { Card.search(**query, return: "name") }
        }
      end

    when "view_defs_full"
      payload["sets"].map do |sname|
        c = Card[sname]
        next { "set" => sname, "missing" => true } if c.nil?

        fmt = c.format(:html)
        names = fmt.methods.map(&:to_s).grep(/\A_view_/).reject { |m| m.include?("__") }
        views = names.map { |m| m.sub(/\A_view_/, "") }.sort.map do |v|
          meth = fmt.method(:"_view_#{v}")
          owner = meth.owner
          { "view" => v, "owner" => owner.name.to_s, "mod" => mod_of(source_of(owner, :"_view_#{v}")) }
        end
        { "set" => sname, "set_keys" => safe { c.safe_set_keys }, "views" => views }
      end

    when "render_core"
      payload["names"].map do |n|
        { "name" => n, "core" => safe { Card.fetch(n).format(:html).render(:core) } }
      end

    when "event_defs_full"
      payload["sets"].map do |sname|
        c = Card[sname]
        next { "set" => sname, "missing" => true } if c.nil?

        events = {}
        c.singleton_class.ancestors.each do |m|
          next if m.name.nil?

          m.instance_methods(false).each do |im|
            s = im.to_s
            next unless s.end_with?("_without_callbacks")

            e = s.sub(/_without_callbacks\z/, "")
            next if events.key?(e)

            events[e] = { "event" => e, "owner" => m.name.to_s, "mod" => mod_of(source_of(m, im)) }
          end
        end
        { "set" => sname, "events" => events.values.sort_by { |x| x["event"] } }
      end

    when "id_fetch"
      payload["ids"].map do |cid|
        row = Card.where(id: cid).pluck(:name, :key, :left_id, :right_id, :trash).first
        lex_name = safe { Card::Lexicon.name(cid).to_s }
        by_id = safe { Card[cid] }
        by_name = lex_name.is_a?(String) && !lex_name.empty? && !lex_name.start_with?("ERR:") ? safe { Card[lex_name] } : nil
        side = lambda do |sid|
          next nil if sid.nil?

          r = Card.where(id: sid).pluck(:name, :key, :trash).first
          r && { "id" => sid, "name" => r[0], "key" => r[1], "trash" => [true, 1].include?(r[2]) }
        end
        {
          "id" => cid,
          "row" => row && { "name" => row[0], "key" => row[1], "left_id" => row[2], "right_id" => row[3],
                            "trash" => [true, 1].include?(row[4]) },
          "left" => row && side.call(row[2]),
          "right" => row && side.call(row[3]),
          "lexicon_name" => lex_name,
          "fetch_by_id" => by_id.is_a?(String) ? by_id : by_id&.id,
          "fetch_by_lexicon_name" => by_name.is_a?(String) ? by_name : by_name&.id
        }
      end

    when "role_permissions"
      card_ids = payload["card_ids"]
      anon = codename_id(:anonymous)
      members_of = lambda do |rname|
        role = Card[rname]
        next [] if role.nil?

        ids = safe { Card.fetch(role, :members, new: {})&.item_ids || [] }
        ids = [] if ids.is_a?(String)
        if ids.empty?
          ids = safe do
            Card.search(right_plus: [{ codename: "roles" }, { refer_to: role.id }], return: "id", limit: 1)
          end
          ids = [] if ids.is_a?(String)
        end
        ids
      end
      actors = [{ "role" => "(anonymous)", "actor_id" => anon }]
      payload["roles"].each do |rname|
        actor = members_of.call(rname).first
        actors << { "role" => rname, "actor_id" => actor }
      end
      actors.map do |a|
        if a["actor_id"].nil?
          a.merge("verdicts" => nil, "note" => "no member found")
        else
          verdicts = Card::Auth.as(a["actor_id"]) do
            card_ids.map do |cid|
              c = Card[cid]
              next [cid, "missing"] if c.nil?

              [cid] + %i[read create update delete].map { |t| safe { c.ok?(t) } }
            end
          end
          a.merge("actor_name" => Card::Lexicon.name(a["actor_id"]).to_s, "verdicts" => verdicts)
        end
      end

    when "inflection_rows"
      # The rows of a mirror deck (SEMANTICS_MIRROR, read-only) whose stored
      # key differs from the key Ruby computes for the stored name. Ruby
      # computes keys with the card gem's own inflection initializer
      # (card-1.110.0 config/initializers/inflections.rb: "this", "anonymous"
      # and "s" uncountable). Each row is then probed in the capture deck
      # under four states: the card gem's inflections or none, and the
      # capture deck's stored key or the mirror's.
      require "sqlite3"
      reset_caches
      mirror_path = ENV.fetch("SEMANTICS_MIRROR")
      mdb = SQLite3::Database.new(mirror_path, readonly: true)
      mrows = mdb.execute("SELECT id, name, key FROM cards WHERE trash = 0 AND name IS NOT NULL AND key IS NOT NULL")
      mdb.close
      checked = mrows.length
      divergent = mrows.reject { |_, name, key| name.to_name.key == key }.map do |mid, name, mkey|
        deck = Card.where(id: mid).pluck(:name, :key, :trash).first
        deck_id = mid
        if deck.nil? || deck[0] != name
          alt = Card.where(name: name, trash: false).pluck(:id, :name, :key, :trash).first
          deck_id = alt&.first
          deck = alt && alt[1..]
        end
        { "mirror_id" => mid, "deck_id" => deck_id, "name" => name, "mirror_key" => mkey,
          "ruby_key" => name.to_name.key, "captured_key" => deck && deck[1] }
      end
      probe_rows = divergent.reject { |d| d["deck_id"].nil? }
      uncountables = %w[this anonymous s]

      probe_state = lambda do |label, mirror_keys, renames|
        reset_caches
        out = nil
        ActiveRecord::Base.transaction do
          probe_rows.each { |d| Card.where(id: d["deck_id"]).update_all(key: d["mirror_key"]) } if mirror_keys
          reset_caches
          out = probe_rows.each_with_index.map do |d, i|
            cid = d["deck_id"]
            name = d["name"]
            stored = Card.where(id: cid).pluck(:key).first
            computed = name.to_name.key
            by_id = safe { Card[cid] }
            entry = {
              "id" => cid, "name" => name, "stored_key" => stored, "computed_key" => computed,
              "fetch_by_name" => safe { Card.fetch(name)&.id },
              "fetch_by_stored_key" => safe { Card.fetch(stored)&.id },
              "row_by_computed_key" => safe { Card.where(key: computed, trash: false).pluck(:id).first },
              "exist_by_name" => safe { Card.exist?(name) },
              "fetch_by_id" => by_id.is_a?(String) ? by_id : by_id&.id,
              "fetch_by_id_name" => by_id.is_a?(String) || by_id.nil? ? nil : by_id.name.to_s
            }
            if i < renames
              entry["rename"] = safe do
                result = nil
                ActiveRecord::Base.transaction(requires_new: true) do
                  Card::Auth.as_bot do
                    c = Card.find(cid)
                    c.name = "#{name} probe renamed"
                    c.save!
                    after = Card.where(id: cid).pluck(:name, :key).first
                    back = Card.find(cid)
                    back.name = name
                    back.save!
                    restored = Card.where(id: cid).pluck(:key).first
                    result = { "renamed_name" => after[0], "renamed_key" => after[1], "restored_key" => restored }
                  end
                  raise ActiveRecord::Rollback
                end
                reset_caches
                result
              end
              entry["create_same_name"] = safe do
                result = nil
                ActiveRecord::Base.transaction(requires_new: true) do
                  Card::Auth.as_bot do
                    dup = Card.create(name: name, type_id: Card::Codename.id(:basic) || Card::BasicID)
                    result = if dup.errors.any?
                               { "created" => false, "errors" => dup.errors.full_messages.first(3) }
                             else
                               { "created" => true, "new_id" => dup.id, "new_key" => dup.key.to_s }
                             end
                  end
                  raise ActiveRecord::Rollback
                end
                reset_caches
                result
              end
            end
            entry
          end
          raise ActiveRecord::Rollback
        end
        reset_caches
        say "INFLECTION state #{label} done"
        { "state" => label, "rows" => out }
      end

      states = []
      states << probe_state.call("card_gem_inflections+captured_keys", false, 12)
      states << probe_state.call("card_gem_inflections+mirror_keys", true, 12)
      inflections = ActiveSupport::Inflector.inflections(:en)
      uncountables.each { |w| inflections.uncountables.delete(w) }
      reset_caches
      no_table_check = { "anonymous" => "Anonymous".to_name.key, "this" => "delete this".to_name.key }
      states << probe_state.call("no_inflections+captured_keys", false, 12)
      states << probe_state.call("no_inflections+mirror_keys", true, 12)
      { "mirror" => File.basename(mirror_path), "checked_rows" => checked, "divergent" => divergent,
        "no_table_check" => no_table_check, "states" => states }
    end

  answers[id.to_s] = answer
  say "ANSWERED #{id} #{kind}"
end

File.write(OUT_PATH, JSON.generate({ "engine" => "ruby", "meta" => meta, "answers" => answers }))
say "WROTE #{OUT_PATH}"
