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
        # PROTOTYPE NOTE (2026-09-21): the recursive CTE in walk_closure_rows
        # below is the design target (single statement, ANY depth). It works
        # in the TS port because nest-syntax.ts is the semantic authority for
        # the boundary-under score key algorithm; the SQL extraction is a
        # best-effort prescan. In this Ruby port we don't have an equivalent
        # best-effort key transform in SQL (the letter/digit boundary
        # underscore insert is decko-specific and not a SQL primitive), so
        # the prototype uses a Ruby-side recursive bulk-SELECT walk
        # (walk_via_bulk_select below) that uses the real Card::Content
        # parser to extract refs and Card::Name[name].key to compute keys.
        # One SELECT per level until closure -- still O(depth) round trips,
        # each indexable, vs the depth-first O(depth) per-inclusion fetches
        # the patch replaces. The design doc
        # (docs/ruby-dividend-cte.md) describes the single-statement
        # target; the prototype demonstrates the cache-warming contract
        # that target will satisfy when ported.
        def prefetch_inclusion_closure root_card, _view
          return 0 unless root_card&.key

          # Depth guard: prefetch only at the top level (depth 0). Nested
          # render! calls come from Nesting#nest -> subformat.render ->
          # render!; the cache is already warm from the top-level prefetch,
          # so subsequent prefetches are wasted DB round trips.
          # See the perf doc note for the why.
          prefetch_depth += 1
          if prefetch_depth > 1
            return 0
          end

          begin
            stats = { rows: 0, statements: 0, fallback_rounds: 0 }

            # --- 1) Ruby-side closure walk, one SELECT per level -----------
            rows = walk_via_bulk_select(root_card.key, stats)
            if ENV["PREFETCH_DEBUG"]
              puts "  [prefetch] walk_via_bulk_select: #{rows.size} rows, " \
                   "#{stats[:statements]} statements"
            end

            # --- 2) hydrate Card::Cache[Card] + Card::Cache[Lexicon] -----
            hydrate_cache rows, stats
            if ENV["PREFETCH_DEBUG"]
              puts "  [prefetch] hydrate_cache: #{stats[:rows]} cache entries, " \
                   "#{stats[:statements]} statements total"
            end

            stats[:rows]
          ensure
            prefetch_depth -= 1
          end
        end

        # --- helpers --------------------------------------------------------

        private

        # PROTOTYPE bulk-SELECT closure walk. Walks the inclusion closure one
        # SELECT per level, using the real Card::Content parser for refs and
        # Card::Name[name].key for keys. O(depth) round trips, each bulk and
        # cacheable (vs O(depth) per-inclusion SELECTs the depth-first path
        # issues -- each one a single key lookup). The design target is the
        # walk_closure_rows recursive CTE (preserved below as the next-step
        # port when a SQL primitive for the underscore-at-boundary key
        # algorithm lands).
        def walk_via_bulk_select root_key, stats
          conn = ActiveRecord::Base.connection
          visited_keys = ::Set.new
          all_rows = []
          current_keys = ::Set[root_key]

          loop do
            break if current_keys.empty?
            new_keys = current_keys - visited_keys
            break if new_keys.empty?
            visited_keys.merge(new_keys)
            placeholders = (["?"] * new_keys.size).join(",")
            result = conn.exec_query(
              "SELECT id, name, key, left_id, right_id, type_id, db_content, " \
              "trash, read_rule_id, read_rule_class " \
              "FROM cards WHERE \"key\" IN (#{placeholders}) AND trash = 0",
              "Prefetch::walk_via_bulk_select", new_keys.to_a,
            )
            stats[:statements] += 1
            rows = result.to_a
            all_rows.concat rows
            # Collect refs from each row's db_content using the REAL parser.
            # Card::Content (card-1.110.0 lib/card/content.rb) yields chunks;
            # the Nest chunk (card-1.110.0 lib/card/chunk/nest.rb) carries
            # the parsed reference name. The TS port's nest-syntax.ts is
            # the analog -- the semantic authority. We use it here so the
            # keys we pass to the next SELECT are real (Card::Name[name].key
            # applies the underscore-at-boundary transform the SQL
            # best-effort path misses).
            next_set = ::Set.new
            for row in rows
              content = row["db_content"]
              next unless content.present?
              content.to_s.scan(/\{\{([^{}]*?)\}\}/) do |m|
                raw = m[0].to_s.split("|", 2).first.to_s.strip
                next if raw.empty?
                # Absolute name (deeper paths use Card::Name to absolutize).
                next_set << Card::Name[raw].key.to_s
              end
            end
            current_keys = next_set - visited_keys
            break if current_keys.empty?
            stats[:fallback_rounds] += 1
            break if stats[:fallback_rounds] > MAX_FALLBACK_ROUNDS
          end

          all_rows
        end

        # The recursive CTE walk. Kept as the next-step target -- see the
        # PROTOTYPE NOTE in prefetch_inclusion_closure. Activates once the
        # SQL primitive for the boundary-underscore key transform lands.
        def walk_closure_rows _root_key, _stats
          raise NotImplementedError,
                "Recursive CTE walk pending SQL primitive for " \
                "Card::Name.key underscore-at-boundary transform. " \
                "See walk_via_bulk_select for the working prototype path."
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