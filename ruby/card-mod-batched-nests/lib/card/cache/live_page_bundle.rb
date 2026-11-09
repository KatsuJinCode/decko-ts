# 1-trip page closure bundle (`live_page_bundles`) for card 1.110.0 / decko 0.20.0.
#
# Shares the portable SQLite/D1 SQL schema (`live_page_bundles` + `deck_data_version`,
# `BUNDLE_SCHEMA_VERSION = 2`) and `SerializedLivePageBundle` JSON payload shape
# (`store.fullRows`, `store.identityRows`, `store.keyKnown`, `store.idKnown`) with
# the TypeScript and edge engines so that a cold Ruby worker or a cold edge
# isolate can hydrate the full card + lexicon closure of a page (including
# 20-level linear nest chains) in 1 SQL query.

require "json"
require "set"

class Card
  class Cache
    module LivePageBundle
      BUNDLE_SCHEMA_VERSION = 2
      SUBSTRATE_PREFIX = "__SUBSTRATE__:"

      # Exact 17-column projection matching TypeScript `CARDS_COLUMNS` in
      # `src/card/live/store-row-evaluator.ts`.
      CARDS_COLUMNS = %w[
        id
        name
        key
        codename
        left_id
        right_id
        current_revision_id
        created_at
        updated_at
        creator_id
        updater_id
        read_rule_class
        read_rule_id
        references_expired
        trash
        type_id
        db_content
      ].freeze

      FRESHNESS_STAMPED_TABLES = %w[
        cards
        card_acts
        card_actions
        card_changes
        card_references
        card_virtuals
      ].freeze

      # 5-column query projection extending TypeScript's 4-column `LIVE_BUNDLE_LOAD_STATEMENT`
      # (`version`, `home_mark`, `sub_json`, `payload_json`) with `latest_rule_epoch` so
      # Ruby seeds the lazy watermark epoch in the same single round trip.
      LOAD_SQL = <<~SQL.squish.freeze
        SELECT COALESCE((SELECT "version" FROM "deck_data_version" WHERE "id" = 1), 1) AS version,
               (SELECT db_content FROM cards WHERE codename = 'home' AND trash = 0 ORDER BY id LIMIT 1) AS home_mark,
               (SELECT payload_json FROM live_page_bundles WHERE keep_key = ? AND stamp = COALESCE((SELECT "version" FROM "deck_data_version" WHERE "id" = 1), 1)) AS sub_json,
               (SELECT payload_json FROM live_page_bundles WHERE keep_key = ? AND stamp = COALESCE((SELECT "version" FROM "deck_data_version" WHERE "id" = 1), 1)) AS payload_json,
               COALESCE((SELECT MAX("epoch") FROM "deck_rule_flags"), 0) AS latest_rule_epoch
      SQL

      def live_page_bundle_key page_mark, view: nil, scope: nil
        norm_scope = scope.nil? || scope == "viewer:anonymous::default" ? "" : scope.to_s
        norm_view = view.nil? ? "" : view.to_s
        page_key = page_mark.to_name.key
        "#{norm_scope}|#{page_key}|#{norm_view}|{}|false|{}"
      end

      def live_substrate_bundle_key scope=nil
        norm_scope = scope.nil? || scope == "viewer:anonymous::default" ? "" : scope.to_s
        "#{SUBSTRATE_PREFIX}#{norm_scope}"
      end

      # Render a page with 1-trip closure hydration when a valid bundle row exists
      # for the current `deck_data_version.version`, or record and persist the
      # discovered card + lexicon closure after a cold render.
      def with_live_page_bundle page_mark, view: nil, scope: nil
        return yield unless config_enabled?(:live_page_bundles)
        return yield unless ensure_live_page_bundle_schema!

        page_key = page_mark.to_name.key
        keep_key = live_page_bundle_key page_mark, view: view, scope: scope
        sub_key = live_substrate_bundle_key scope

        row = select_bundle_row sub_key, keep_key
        stamp = (row && row["version"] || 1).to_i
        if row && row.key?("latest_rule_epoch") && defined?(Card::Rule::LazyWatermark)
          Card::Rule::LazyWatermark.seed_request_epoch!(row["latest_rule_epoch"].to_i)
        end

        if row && row["payload_json"]
          sub_payload = parse_bundle_json row["sub_json"]
          page_payload = parse_bundle_json row["payload_json"]
          # Orphan delta safeguard (matches TypeScript live-render.ts): a delta bundle
          # requires a valid substrate bundle at the same freshness stamp.
          if page_payload && (page_payload["kind"] != "delta" || valid_substrate_bundle?(sub_payload))
            hydrate_bundle_into_cache sub_payload if sub_payload
            hydrate_bundle_into_cache page_payload
            return yield
          end
        end

        before_keys = current_temp_cache_keys
        result = yield
        post_row = select_bundle_row sub_key, keep_key
        post_stamp = (post_row && post_row["version"] || stamp).to_i
        # S2 / R7-M2 safeguard: if a concurrent write advanced deck_data_version mid-render
        # or the bundle-row read failed (`row` / `post_row` nil), do not persist.
        persist_discovered_bundle! keep_key, page_key, stamp, before_keys if row && post_row && post_stamp == stamp
        result
      end

      def valid_substrate_bundle? bundle
        bundle.is_a?(Hash) &&
          bundle["v"] == BUNDLE_SCHEMA_VERSION &&
          bundle["store"].is_a?(Hash) &&
          bundle["store"]["fullRows"].is_a?(Array)
      end

      def hydrate_bundle_into_cache bundle
        return unless bundle.is_a?(Hash) && bundle["v"] == BUNDLE_SCHEMA_VERSION
        return if bundle["kind"] == "delta" && !bundle["store"].is_a?(Hash)

        store = bundle["store"].is_a?(Hash) ? bundle["store"] : {}
        full_rows = Array(store["fullRows"] || bundle["cards"])
        identity_rows = Array(store["identityRows"])
        known_keys = Set.new

        # Pass 1: Hydrate Lexicon temporary cache for ALL identity_rows and full_rows
        # first so that compound cards (`left_id` + `right_id`) can resolve `card.name`
        # and `card.key` in memory with 0 database queries regardless of row order.
        (identity_rows + full_rows).each do |attrs|
          next unless attrs.is_a?(Hash) && attrs["id"]

          id = attrs["id"].to_i
          left_id = attrs["left_id"]&.to_i
          right_id = attrs["right_id"]&.to_i
          name = attrs["name"]
          key = attrs["key"]
          known_keys << key if key.present?

          if left_id && right_id
            lex = [left_id, right_id]
            Lexicon.cache.temp.write id.to_s, lex
            Lexicon.cache.temp.write Lexicon.cache_key(lex), id
          elsif name.present?
            Lexicon.cache.temp.write id.to_s, name
            Lexicon.cache.temp.write Lexicon.cache_key(name), id
          end
        end

        # Pass 2: Instantiate full Card rows, reconcile lazy rule watermarks if stale,
        # prep set modules, and write to Card.cache via the unified post-load helper.
        full_rows.each do |attrs|
          next unless attrs.is_a?(Hash) && attrs["id"]

          card = Card.instantiate attrs.stringify_keys
          write_loaded_card_to_cache(card, prep_modules: true)
          known_keys << card.key if card.key.present?
        end

        # Pass 3: Record known-missing simple keys in Lexicon temp cache so negative
        # lookups do not query the database.
        Array(store["keyKnown"] || bundle["missingKeys"]).each do |key_str|
          next if key_str.blank? || known_keys.include?(key_str)

          Lexicon.write_to_temp_cache nil, nil, key_str.to_name
        end
      end

      def persist_discovered_bundle! keep_key, page_key, stamp, before_keys=nil
        full_rows, identity_rows = cached_cards_snapshot(before_keys: before_keys, seed_key: page_key)
        return if full_rows.empty?

        id_known = (full_rows.map { |r| r["id"].to_i } + identity_rows.map { |r| r["id"].to_i }).uniq
        key_known = (full_rows.filter_map { |r| r["key"] } + identity_rows.filter_map { |r| r["key"] }).uniq
        payload = {
          "v" => BUNDLE_SCHEMA_VERSION,
          "kind" => "full",
          "store" => {
            "fullRows" => full_rows,
            "identityRows" => identity_rows,
            "keyKnown" => key_known,
            "idKnown" => id_known,
            "leftComplete" => [],
            "expanded" => [],
            "contentExpanded" => []
          },
          "exact" => [],
          "ruleExpanded" => [],
          "ruleSetsAsked" => [],
          "globalRulesSent" => [],
          "firstTripDone" => true,
          "seeds" => [page_key],
          "eagerRefs" => []
        }
        conn = ActiveRecord::Base.connection
        conn.execute(
          ActiveRecord::Base.sanitize_sql_array([
            "DELETE FROM live_page_bundles WHERE stamp != ?",
            stamp.to_i
          ])
        )
        sql = ActiveRecord::Base.sanitize_sql_array([
          "INSERT OR REPLACE INTO live_page_bundles (keep_key, page_key, stamp, payload_json) VALUES (?, ?, ?, ?)",
          keep_key,
          page_key,
          stamp.to_i,
          JSON.generate(payload)
        ])
        conn.execute(sql)
      rescue StandardError => e
        log_bundle_error(:persist_discovered_bundle!, e)
        nil
      end

      def ensure_live_page_bundle_schema!
        return true if @live_page_bundle_schema_ensured
        return false if @live_page_bundle_schema_unsupported

        conn = ActiveRecord::Base.connection
        unless conn.adapter_name.to_s.match?(/sqlite/i)
          warn "[card-mod-batched-nests] live_page_bundles trigger DDL requires SQLite/D1 (adapter: #{conn.adapter_name}); skipping automatic schema install"
          @live_page_bundle_schema_unsupported = true
          return false
        end

        conn.execute <<~SQL
          CREATE TABLE IF NOT EXISTS "deck_data_version" (
            "id" INTEGER PRIMARY KEY CHECK ("id" = 1),
            "version" INTEGER NOT NULL DEFAULT 0
          )
        SQL
        conn.execute 'INSERT OR IGNORE INTO "deck_data_version" ("id", "version") VALUES (1, 0)'

        existing_tables = conn.select_values("SELECT name FROM sqlite_master WHERE type = 'table'").to_set
        FRESHNESS_STAMPED_TABLES.each do |table|
          next unless existing_tables.include?(table)

          [["ins", "INSERT"], ["upd", "UPDATE"], ["del", "DELETE"]].each do |op, event|
            conn.execute <<~SQL
              CREATE TRIGGER IF NOT EXISTS "#{table}_bump_deck_data_version_#{op}"
              AFTER #{event} ON "#{table}" BEGIN
                UPDATE "deck_data_version" SET "version" = "version" + 1 WHERE "id" = 1;
              END
            SQL
          end
        end

        conn.execute <<~SQL
          CREATE TABLE IF NOT EXISTS "live_page_bundles" (
            "keep_key" TEXT PRIMARY KEY,
            "page_key" TEXT NOT NULL,
            "stamp" INTEGER NOT NULL,
            "payload_json" TEXT NOT NULL
          )
        SQL
        if defined?(Card::Rule::LazyWatermark)
          Card::Rule::LazyWatermark.ensure_rule_flags_schema!
        else
          conn.execute <<~SQL
            CREATE TABLE IF NOT EXISTS "deck_rule_flags" (
              "epoch" INTEGER PRIMARY KEY AUTOINCREMENT,
              "rule_id" INTEGER NOT NULL,
              "set_id" INTEGER,
              "pattern_code" TEXT NOT NULL,
              "anchor_id" INTEGER,
              "anchor_left_id" INTEGER,
              "anchor_right_id" INTEGER,
              "anchor_key" TEXT,
              "is_delete" INTEGER NOT NULL DEFAULT 0,
              "created_at" TEXT NOT NULL
            )
          SQL
          conn.execute <<~SQL
            CREATE INDEX IF NOT EXISTS "deck_rule_flags_epoch_idx"
              ON "deck_rule_flags"("epoch")
          SQL
        end
        conn.execute <<~SQL
          CREATE TRIGGER IF NOT EXISTS "trg_live_page_bundles_card_ins"
          AFTER INSERT ON "cards" BEGIN
            DELETE FROM "live_page_bundles";
          END
        SQL
        # Trigger ordering & compensation contract:
        # `cards_bump_deck_data_version_upd` increments `deck_data_version.version` by +1
        # on every `UPDATE ON "cards"`. When an `UPDATE` on `cards` either:
        #   (a) leaves all 15 non-rule bundle payload columns AND `read_rule_id` /
        #       `read_rule_class` unchanged (a pure no-op UPDATE), or
        #   (b) changes only `read_rule_id`/`read_rule_class` while lazy rule flags are
        #       active (`EXISTS (SELECT 1 FROM "deck_rule_flags")`),
        # `trg_live_page_bundles_card_upd` preserves `live_page_bundles` and applies a
        # compensating `-1` to `deck_data_version.version` within the same statement
        # transaction so the net `deck_data_version` delta is `0` regardless of SQLite's
        # `AFTER UPDATE` trigger firing order.
        conn.execute <<~SQL
          DROP TRIGGER IF EXISTS "trg_live_page_bundles_card_upd"
        SQL
        conn.execute <<~SQL
          CREATE TRIGGER IF NOT EXISTS "trg_live_page_bundles_card_upd"
          AFTER UPDATE ON "cards" BEGIN
            DELETE FROM "live_page_bundles"
            WHERE NOT (
              OLD.id IS NEW.id AND
              OLD.name IS NEW.name AND
              OLD."key" IS NEW."key" AND
              OLD.codename IS NEW.codename AND
              OLD.left_id IS NEW.left_id AND
              OLD.right_id IS NEW.right_id AND
              OLD.type_id IS NEW.type_id AND
              OLD.db_content IS NEW.db_content AND
              OLD.trash IS NEW.trash AND
              OLD.creator_id IS NEW.creator_id AND
              OLD.updater_id IS NEW.updater_id AND
              OLD.created_at IS NEW.created_at AND
              OLD.updated_at IS NEW.updated_at AND
              OLD.current_revision_id IS NEW.current_revision_id AND
              OLD.references_expired IS NEW.references_expired AND
              (
                (OLD.read_rule_id IS NEW.read_rule_id AND OLD.read_rule_class IS NEW.read_rule_class) OR
                EXISTS (SELECT 1 FROM "deck_rule_flags")
              )
            );
            UPDATE "deck_data_version"
            SET "version" = "version" - 1
            WHERE "id" = 1 AND (
              OLD.id IS NEW.id AND
              OLD.name IS NEW.name AND
              OLD."key" IS NEW."key" AND
              OLD.codename IS NEW.codename AND
              OLD.left_id IS NEW.left_id AND
              OLD.right_id IS NEW.right_id AND
              OLD.type_id IS NEW.type_id AND
              OLD.db_content IS NEW.db_content AND
              OLD.trash IS NEW.trash AND
              OLD.creator_id IS NEW.creator_id AND
              OLD.updater_id IS NEW.updater_id AND
              OLD.created_at IS NEW.created_at AND
              OLD.updated_at IS NEW.updated_at AND
              OLD.current_revision_id IS NEW.current_revision_id AND
              OLD.references_expired IS NEW.references_expired AND
              (
                (OLD.read_rule_id IS NEW.read_rule_id AND OLD.read_rule_class IS NEW.read_rule_class) OR
                EXISTS (SELECT 1 FROM "deck_rule_flags")
              )
            );
          END
        SQL
        conn.execute <<~SQL
          CREATE TRIGGER IF NOT EXISTS "trg_live_page_bundles_card_del"
          AFTER DELETE ON "cards" BEGIN
            DELETE FROM "live_page_bundles";
          END
        SQL
        if existing_tables.include?("card_references")
          conn.execute <<~SQL
            CREATE TRIGGER IF NOT EXISTS "trg_live_page_bundles_ref_ins"
            AFTER INSERT ON "card_references" BEGIN
              DELETE FROM "live_page_bundles";
            END
          SQL
          conn.execute <<~SQL
            CREATE TRIGGER IF NOT EXISTS "trg_live_page_bundles_ref_upd"
            AFTER UPDATE ON "card_references" BEGIN
              DELETE FROM "live_page_bundles";
            END
          SQL
          conn.execute <<~SQL
            CREATE TRIGGER IF NOT EXISTS "trg_live_page_bundles_ref_del"
            AFTER DELETE ON "card_references" BEGIN
              DELETE FROM "live_page_bundles";
            END
          SQL
        end
        conn.execute <<~SQL
          CREATE TABLE IF NOT EXISTS "edge_render_cache" (
            "cache_key" TEXT PRIMARY KEY,
            "stamp" INTEGER NOT NULL,
            "status" INTEGER NOT NULL,
            "content_type" TEXT NOT NULL,
            "body" TEXT NOT NULL,
            "updated_at" INTEGER NOT NULL
          )
        SQL
        conn.execute <<~SQL
          CREATE TABLE IF NOT EXISTS "decko_edge_render_cache" (
            "url" TEXT PRIMARY KEY,
            "epoch" INTEGER NOT NULL,
            "content_type" TEXT NOT NULL,
            "body" TEXT NOT NULL,
            "stored_at" INTEGER NOT NULL
          )
        SQL
        conn.execute <<~SQL
          CREATE TRIGGER IF NOT EXISTS "trg_edge_render_cache_rule_flag_ins"
          AFTER INSERT ON "deck_rule_flags" BEGIN
            DELETE FROM "edge_render_cache";
            DELETE FROM "decko_edge_render_cache";
          END
        SQL
        @live_page_bundle_schema_ensured = true
      rescue StandardError => e
        log_bundle_error(:ensure_live_page_bundle_schema!, e)
        false
      end

      private

      def select_bundle_row sub_key, keep_key
        conn = ActiveRecord::Base.connection
        sql = ActiveRecord::Base.sanitize_sql_array([LOAD_SQL, sub_key, keep_key])
        conn.select_one(sql)
      rescue StandardError => e
        log_bundle_error(:select_bundle_row, e)
        nil
      end

      def parse_bundle_json raw
        return nil if raw.nil? || raw.empty?

        parsed = JSON.parse(raw)
        parsed.is_a?(Hash) && parsed["v"] == BUNDLE_SCHEMA_VERSION ? parsed : nil
      rescue JSON::ParserError => e
        log_bundle_error(:parse_bundle_json, e)
        nil
      end

      def log_bundle_error context, err
        warned = (Thread.current[:decko_live_bundle_warned] ||= Set.new)
        return if warned.include?(context)

        warned.add(context)
        warn "[card-mod-batched-nests] LivePageBundle##{context} error: #{err.class}: #{err.message}"
      end

      def temp_cache_store
        temp = Card.cache&.temp
        temp.respond_to?(:store) && temp.store.is_a?(Hash) ? temp.store : {}
      end

      def current_temp_cache_keys
        temp_cache_store.keys.to_set
      end

      def cached_cards_snapshot before_keys: nil, seed_key: nil
        store = temp_cache_store
        return [[], []] if store.empty?

        entries =
          if before_keys && !before_keys.empty?
            store.each_with_object([]) do |(k, v), acc|
              acc << v if !before_keys.include?(k) || (seed_key && k.to_s == seed_key.to_s)
            end
          else
            store.values
          end

        cards = entries.grep(Card).select { |c| c.id && !c.trash }.uniq(&:id)
        full_ids = cards.map(&:id).to_set
        full_rows = cards.map do |card|
          attrs = card.attributes
          CARDS_COLUMNS.each_with_object({}) do |col, row|
            row[col] = attrs.key?(col) ? attrs[col] : (card.respond_to?(col) ? card.public_send(col) : nil)
          end
        end

        # Ensure any ancestor part IDs needed to compose compound names in full_rows
        # are included in identity_rows if not already in full_rows.
        identity_rows = []
        pending_part_ids = cards.flat_map { |c| [c.left_id, c.right_id] }.compact.uniq - full_ids.to_a
        seen_part_ids = full_ids.dup
        lex_temp = Lexicon.cache&.temp
        lex_store = lex_temp.respond_to?(:store) && lex_temp.store.is_a?(Hash) ? lex_temp.store : {}

        while (part_id = pending_part_ids.shift)
          next if seen_part_ids.include?(part_id)

          seen_part_ids << part_id
          lex = lex_store[part_id.to_s]
          if lex.is_a?(Array) && lex.size == 2
            identity_rows << {
              "id" => part_id,
              "name" => nil,
              "key" => nil,
              "left_id" => lex[0],
              "right_id" => lex[1]
            }
            pending_part_ids.concat(lex.compact)
          elsif lex.is_a?(String) && lex.present?
            identity_rows << {
              "id" => part_id,
              "name" => lex,
              "key" => lex.to_name.key,
              "left_id" => nil,
              "right_id" => nil
            }
          end
        end

        [full_rows, identity_rows]
      end
    end
  end
end
