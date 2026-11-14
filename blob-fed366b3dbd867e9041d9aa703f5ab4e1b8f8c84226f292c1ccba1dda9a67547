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

        # Thread-local depth counter for the prefetch. Ruby's render path
        # recurses through Card::Format#render! per nested subformat
        # (Nesting#nest -> subformat.render -> render! -> prefetch -> ...).
        # Without this guard, the prototype's prefetch would walk the full
        # closure at every level -- 8 walks for a depth-8 chain. The TS
        # port's prefetchInclusionClosure runs ONCE per top-level render;
        # this counter gives us the same shape: prefetch only at depth 0.
        def prefetch_depth
          Thread.current[:prefetch_render_depth] ||= 0
        end

        # Public entry. Idempotent (warm-cache writes are no-ops when the
        # card is already cached). Called from Card::Format::Render#render!
        # (patched in render.rb). Returns the row count for telemetry.
        #
        # PROTOTYPE NOTE (2026-09-21): the recursive CTE in walk_closure
        # below walks card_references (the inclusion edges) directly. This
        # is the ONE-statement design target from the TS port: the entire
        # {{...}} closure reaches the cache in one round trip regardless of
        # depth. The CTE is index-friendly (referer_id + ref_type='I'
        # narrows to inclusion edges) and relies on the fact that
        # Card.create! populates card_references as part of the act
        # machinery (verified: card_references INSERT follows
        # card_actions/card_acts on every Card.create!).
        def prefetch_inclusion_closure root_card, _view
          return 0 unless root_card&.key

          # Depth guard: prefetch only at the top level. Nested render!
          # calls come from Nesting#nest -> subformat.render -> render!;
          # the cache is already warm from the top-level prefetch, so
          # subsequent prefetches are wasted DB round trips.
          # See the perf doc note for the why.
          STDOUT.puts "  [prefetch] enter depth=#{prefetch_depth} root=#{root_card.key}" if ENV["PREFETCH_DEBUG"]
          if prefetch_depth >= 1
            STDOUT.puts "  [prefetch] SKIP (depth>=#{prefetch_depth})" if ENV["PREFETCH_DEBUG"]
            return 0
          end

          stats = { rows: 0, statements: 0, fallback_rounds: 0 }

          # --- 1) the recursive-CTE closure walk, ONE statement ---------
          rows = walk_closure_cte(root_card.key, stats)
          if ENV["PREFETCH_DEBUG"]
            puts "  [prefetch] walk_closure_cte: #{rows.size} rows, " \
                 "#{stats[:statements]} statements"
          end

          # --- 2) hydrate Card::Cache[Card] + Card::Cache[Lexicon] -----
          hydrate_cache rows, stats
          if ENV["PREFETCH_DEBUG"]
            puts "  [prefetch] hydrate_cache: #{stats[:rows]} cache entries, " \
                 "#{stats[:statements]} statements total"
          end

          stats[:rows]
        end

        # --- helpers --------------------------------------------------------

        private

        # The single-statement recursive-CTE closure walk. Walks
        # card_references (the inclusion edges, ref_type='I') recursively
        # from the root card id. Returns the full set of cards reachable
        # through any chain of inclusions. ONE statement regardless of depth
        # -- the prototype's whole point.
        #
        # Verified on the oracle app's development.sqlite3 (decko-commons/
        # decko#1282 R1 measurement scale, ~1180 cards). card_references
        # schema: id, referer_id, referee_key, referee_id, ref_type,
        # is_present. We follow referee_id (NOT referee_key) -- it's the
        # indexed integer FK and resolves to the card row directly.
        # The CTE's two recursive arms handle the two reference modes:
        #   1. junction targets reached by walking card junction sides
        #      (left_id/right_id)
        #   2. side-key resolution for compound names (idempotent on cycles
        #      via UNION dedup).
        def walk_closure_cte root_key, stats
          sql = +""
          sql << "WITH RECURSIVE\n"
          # resolved(id, ckey) -- same shape as the TS port's
          # src/card/render/prefetch.ts:152-162. simple cards by key,
          # junction rows by composed-side key (both orientations).
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
          # closure(id) -- the {{inclusion}} reachability walk via
          # card_references. Seed = root card id; recurse by following
          # ref_type='I' edges to their referee_id. UNION dedups so
          # cycles terminate (a diamond pattern through a single referee
          # hits the same id multiple times, all dedup to one row).
          sql << "  closure(id) AS (\n"
          sql << "    SELECT id FROM cards WHERE \"key\" = ? AND trash = 0\n"
          sql << "    UNION\n"
          sql << "    SELECT cr.referee_id FROM closure c "
          sql << "        JOIN card_references cr ON cr.referer_id = c.id "
          sql << "        WHERE cr.ref_type = 'I' AND cr.referee_id IS NOT NULL\n"
          sql << "  )\n"
          # Final: the closure's card rows + their junction sides (so
          # junction-key composition works in the hydrate step), plus
          # junction sides of any junction reached.
          sql << "SELECT c.id, c.name, c.key, c.left_id, c.right_id, c.type_id, "
          sql << "       c.db_content, c.trash, c.read_rule_id, c.read_rule_class "
          sql << "  FROM cards c WHERE c.trash = 0 AND c.id IN ("
          sql << "    SELECT id FROM closure"
          sql << "    UNION "
          sql << "    SELECT j.left_id FROM closure cl "
          sql << "        JOIN cards j ON j.id = cl.id AND j.trash = 0 "
          sql << "        WHERE j.left_id IS NOT NULL "
          sql << "    UNION "
          sql << "    SELECT j.right_id FROM closure cl "
          sql << "        JOIN cards j ON j.id = cl.id AND j.trash = 0 "
          sql << "        WHERE j.right_id IS NOT NULL"
          sql << "  )"
          conn = ActiveRecord::Base.connection
          result = conn.exec_query sql, "Prefetch::walk_closure_cte", [root_key]
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
          #
          #    Pre-call include_set_modules so the depth-first path's
          #    Card.fetch#finalize_result_card finds @set_mods_loaded=true
          #    and returns the card with no further pattern work. The TS
          #    port's prefetch.ts:328-330 cacheRecord(...) chain does the
          #    same (cards are "composed" before being written).
          for row in hydrated
            key = row["key"]
            next unless key.present?
            card = Card.instantiate(row)
            # Pre-load set modules -- this DOES cost queries (pattern walks
            # may query), but they happen ONCE here, in batch, vs the
            # depth-first path's per-inclusion scatter. Net: same total
            # queries; the saving is the depth-first per-inclusion SELECT.
            # See lib/card/mod/core/set/all/initialize.rb:61-72.
            card.include_set_modules if card.respond_to?(:include_set_modules)
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