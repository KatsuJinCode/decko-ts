require "set"

class Card
  class Format
    class Nest
      # Batched inclusion-closure prefetch (the deck-1282 / KatsuJinCode/decko-ts
      # #9 dividend -- see docs/ruby-dividend-cte.md in that repo).
      #
      # Replaces Ruby's depth-first per-inclusion Card.fetch (card-1.110.0
      # lib/card/format/nest/fetch.rb) with a single recursive-CTE walk of
      # the ENTIRE {{...}} closure before the renderer starts. Render path is
      # then a sequence of warm-cache reads.
      #
      # Schema verified on the oracle app's db/development.sqlite3 via
      # EXPLAIN QUERY PLAN:
      #   SELECT * FROM cards WHERE "key"=? AND trash=0
      #     -> SEARCH cards USING INDEX cards_key_index (key=?)
      # cards_key_index is a UNIQUE index on "key" (BINARY collation), the
      # same collation the Card.where(key:) lookup uses
      # (card-1.110.0 lib/card/lexicon.rb:53-58). The CTE therefore uses
      # BINARY equality on "key" -- lossless for decko's lowercase-ASCII
      # keys, and the planner can seek cards_key_index (no schema patch
      # needed).
      module Prefetch
        # Ruby's Card::Name joint (canonical separator). Mirrors
        # card-1.110.0/lib/card/name.rb (Card::Name.joint).
        JOINT = "+".freeze

        # Content scan cap. Past this, content rides the per-level fallback
        # the same way src/card/render/prefetch.ts does
        # (SQL_CONTENT_SCAN_CAP at prefetch.ts:57).
        CONTENT_SCAN_CAP = 10_000

        # Safety bound for the per-level fallback rounds.
        MAX_FALLBACK_ROUNDS = 25

        # Public entry. Idempotent (warm-cache writes are no-ops when the
        # card is already cached). Called from Card::Format::Render#render!
        # (patched in render.rb). Returns the row count for telemetry.
        def prefetch_inclusion_closure root_card, _view
          return 0 unless root_card&.key

          stats = { rows: 0, statements: 0, fallback_rounds: 0 }

          # --- 1) the SQL closure walk, one statement ------------------------
          rows = walk_closure_rows(root_card.key, stats)
          if ENV["PREFETCH_DEBUG"]
            puts "  [prefetch] walk_closure_rows: #{rows.size} rows, " \
                 "#{stats[:statements]} statements"
          end

          # --- 2) hydrate Card::Cache[Card] + Card::Cache[Lexicon] ---------
          hydrate_cache rows, stats
          if ENV["PREFETCH_DEBUG"]
            puts "  [prefetch] hydrate_cache: #{stats[:rows]} cache entries, " \
                 "#{stats[:statements]} statements total"
          end
          return stats[:rows] if rows.empty?

          # --- 3) JS-level verification (cheap, no recursion on small sets) -
          pending = collect_pending rows
          fallback_warm_cache root_card.key, pending, stats
          if ENV["PREFETCH_DEBUG"]
            puts "  [prefetch] fallback_warm_cache: #{stats[:fallback_rounds]} " \
                 "rounds, #{stats[:statements]} statements grand total"
          end

          stats[:rows]
        end

        # --- helpers --------------------------------------------------------

        private

        # Issue the recursive CTE. Two WITH clauses: resolved (composed-key
        # closure, simple + junction, mirror for both orientations) and
        # frontier (span-chained {{...}} scan). Returns a list of card-row
        # hashes (id, name, key, left_id, right_id, type_id, db_content,
        # trash, read_rule_id, read_rule_class).
        def walk_closure_rows root_key, stats
          sql = +""
          sql << "WITH RECURSIVE\n"
          # Composed-key closure (DbLexicon.nameToLex in SQL):
          # simple cards by their key column; junction rows one joint per
          # pass, both orientations, UNION dedups.
          sql << "  resolved(id, ckey) AS (\n"
          sql << "    SELECT id, \"key\" FROM cards WHERE \"key\" IS NOT NULL AND trash = 0\n"
          sql << "    UNION\n"
          sql << "    SELECT j.id, l.ckey || '#{JOINT}' || r.\"key\" "
          sql << "        FROM resolved l "
          sql << "        JOIN cards j ON j.left_id = l.id AND j.trash = 0 "
          sql << "        JOIN cards r ON r.id = j.right_id AND r.\"key\" IS NOT NULL\n"
          sql << "    UNION\n"
          sql << "    SELECT j.id, l.\"key\" || '#{JOINT}' || r.ckey "
          sql << "        FROM resolved r "
          sql << "        JOIN cards j ON j.right_id = r.id AND j.trash = 0 "
          sql << "        JOIN cards l ON l.id = j.left_id AND l.\"key\" IS NOT NULL\n"
          sql << "  ),\n"
          # frontier(t, rest): target key + content cursor. Four recursive
          # arms -- seed scan, advance, emit best-effort key, terminate.
          at = "instr(f.rest, '{{')"
          sql << "  frontier(t, rest) AS (\n"
          sql << "    SELECT ?, NULL\n"
          sql << "    UNION\n"
          sql << "    SELECT f.t, substr(c.db_content, 1, #{CONTENT_SCAN_CAP})\n"
          sql << "      FROM frontier f\n"
          sql << "      JOIN resolved rs ON rs.ckey = f.t\n"
          sql << "      JOIN cards c ON c.id = rs.id AND c.trash = 0\n"
          sql << "      WHERE f.rest IS NULL AND c.db_content LIKE '%{{%'\n"
          sql << "    UNION\n"
          sql << "    SELECT f.t, substr(f.rest, #{at} + 2)\n"
          sql << "      FROM frontier f\n"
          sql << "      WHERE f.rest IS NOT NULL AND #{at} > 0\n"
          sql << "    UNION\n"
          sql << "    SELECT DISTINCT lower(replace(trim(\n"
          sql << "             CASE WHEN instr(substr(f.rest, #{at} + 2), '}}') = 0\n"
          sql << "                  THEN substr(f.rest, #{at} + 2)\n"
          sql << "                  ELSE substr(substr(f.rest, #{at} + 2), 1,\n"
          sql << "                              instr(substr(f.rest, #{at} + 2), '}}') - 1)\n"
          sql << "             END), ' ', '_')), NULL\n"
          sql << "      FROM frontier f\n"
          sql << "      WHERE f.rest IS NOT NULL AND #{at} > 0\n"
          sql << "    UNION\n"
          sql << "    SELECT f.t, NULL FROM frontier f\n"
          sql << "      WHERE f.rest IS NOT NULL AND #{at} = 0\n"
          sql << "  )\n"
          sql << "SELECT c.id, c.name, c.key, c.left_id, c.right_id, c.type_id, "
          sql << "       c.db_content, c.trash, c.read_rule_id, c.read_rule_class "
          sql << "  FROM cards c "
          sql << "  WHERE c.trash = 0 AND c.id IN ("
          sql << "    SELECT rs.id FROM resolved rs JOIN frontier f ON f.t = rs.ckey"
          sql << "  )"
          conn = ActiveRecord::Base.connection
          result = conn.exec_query sql, "Prefetch::walk_closure_rows", [root_key]
          stats[:statements] += 1
          result.to_a
        end

        # Write every row into Card::Cache[Card] and Card::Cache[Lexicon]
        # so the per-inclusion fetch_card calls in the depth-first render
        # path hit the temp cache instead of issuing a DB query.
        # Mirrors the TS composeAndCache contract at
        # src/card/render/prefetch.ts:288-334 (card-by-card CacheRecord).
        #
        # The temp cache is a plain Hash (card-1.110.0
        # lib/card/cache/temporary.rb). We write directly to .store to
        # bypass Cache#write's after_write_to_temp_cache callback chain
        # (which would call card.write_lexicon and other expensive paths).
        # The keys/values are exactly what the per-inclusion
        # Card::Cache::CardClass writes would have produced.
        def hydrate_cache rows, stats
          conn = ActiveRecord::Base.connection
          card_cache = Card.cache
          lex_cache  = Card::Lexicon.cache
          return if rows.empty?

          # 1) Build Card objects from the CTE rows in ONE bulk SELECT (the
          #    CTE already returned id/key/name/left_id/right_id; we still
          #    need the full card for retrieve_by_key to return a usable
          #    object). One SELECT for the entire closure (vs N in the
          #    depth-first path).
          ids = rows.map { |r| r["id"] }.compact.uniq
          return if ids.empty?
          placeholders = (["?"] * ids.size).join(",")
          hydrated = conn.exec_query(
            "SELECT * FROM cards WHERE id IN (#{placeholders}) AND trash = 0",
            "Prefetch::hydrate_cache::hydrate_cards", ids,
          ).to_a
          stats[:statements] += 1

          # 2) Write each hydrated Card into Card::Cache[Card].temp.store
          #    keyed by card.key (matching lib/card/cache/card_class.rb:28-34
          #    write_to_cache contract). Skip the Cache#write API to avoid
          #    the after_write_to_temp_cache callback chain.
          for row in hydrated
            key = row["key"]
            next unless key.present?
            card = Card.instantiate(row)
            card_cache.temp.store[key.to_s] = card
            lex_cache.temp.store[row["id"].to_s] = row["name"].to_s
            left_id = row["left_id"]
            right_id = row["right_id"]
            if left_id && right_id
              lex_cache.temp.store["L-#{left_id}-#{right_id}"] = row["id"]
            else
              # Simple card: lex cache_key is "L-<name.key>" where name.key
              # is the underscored/singularized form.
              name = row["name"].to_s
              key_simple = name.downcase.gsub(/[^a-z0-9]+/, "_").singularize
              lex_cache.temp.store["L-#{key_simple}"] = row["id"]
            end
            stats[:rows] += 1
          end
        end

        def write_card_cache_entry _card_cache, _row
          # Kept for call compatibility with hydrate_cache; the actual write
          # is the bulk-SELECT path above (Card::Cache[Card].temp.store[]=).
          nil
        end

        def write_lex_cache_entry lex_cache, row
          # Card::Cache[Lexicon] keys: "<id>" -> name and "L-<lex>" -> id
          # (card-1.110.0 lib/card/lexicon.rb:49-50 cache_key).
          id = row["id"]
          name = row["name"]
          if id && name.present?
            lex_cache.temp.write id.to_s, name
          end
          left_id = row["left_id"]
          right_id = row["right_id"]
          if left_id && right_id
            lex_cache.temp.write "L-#{left_id}-#{right_id}", id
          elsif name.present?
            # Simple card: lex key is "L-<name.key>" via Lexicon.cache_key.
            # (We compute name.key directly; Card::Name.key is the
            # underscored/singularized form. card-1.110.0 lib/card/name.rb)
            lex_cache.temp.write "L-#{name.to_s.downcase.gsub(/[^a-z0-9]+/, "_").singularize}",
                                id
          end
        end

        # Re-derive references from each row's db_content using Card::Chunk
        # (card-1.110.0 lib/card/chunk.rb -- the renderer-side semantic
        # authority). Anything the CTE could not resolve is fetched in
        # per-level rounds (the prescribed one-batch-per-level shape).
        def collect_pending rows
          pending = ::Set.new
          for row in rows
            content = row["db_content"]
            next unless content.present?
            # Card::Content#chunk_list(:nest) yields Nest chunks; for prototype
            # simplicity we parse {{...}} spans directly (the same span rule
            # the CTE uses -- the JS verification parser is the analog of
            # this scan).
            content.to_s.scan(/\{\{([^{}]*?)\}\}/) do |m|
              ref = m[0].to_s.split("|", 2).first.to_s.strip
              ref = ref.downcase.gsub(" ", "_")
              pending.add ref unless ref.empty?
            end
          end
          pending
        end

        def fallback_warm_cache root_key, pending, stats
          return if pending.empty?
          conn = ActiveRecord::Base.connection
          # Map each pending name to its row (one SELECT batch).
          keys = pending.to_a
          placeholders = (["?"] * keys.size).join(",")
          result = conn.exec_query(
            "SELECT id, name, key, left_id, right_id, type_id, " \
            "db_content, trash, read_rule_id, read_rule_class " \
            "FROM cards WHERE \"key\" IN (#{placeholders}) AND trash = 0",
            "Prefetch::fallback_warm_cache", keys,
          )
          stats[:statements] += 1
          fetched = result.to_a
          hydrate_cache fetched, stats
          new_pending = collect_pending fetched
          if new_pending.size < pending.size && stats[:fallback_rounds] < MAX_FALLBACK_ROUNDS
            stats[:fallback_rounds] += 1
            fallback_warm_cache root_key, new_pending, stats
          end
        end
      end
    end
  end
end