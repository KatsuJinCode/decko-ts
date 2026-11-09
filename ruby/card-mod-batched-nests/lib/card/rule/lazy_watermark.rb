# O(1) lazy permission-rule watermarks (`deck_rule_flags`, `deck_card_rule_watermarks`,
# `deck_rule_watermark_meta`) for card 1.110.0 / decko 0.20.0.
#
# Shares the portable SQLite/D1 SQL schema (`0015-live-page-bundles.sql` and
# `src/card/permissions/lazy-rule-watermark.ts`) with the TypeScript and edge
# engines. Stock Decko's `Card::Set::Right::Read#update_read_ruled_cards` scans
# and updates every card in the deck whenever a `*read` rule card is created,
# updated, or deleted (`O(N)` row writes per rule save). With
# `Card.config.lazy_rule_watermarks = true`, saving a `*read` rule inserts a
# single `O(1)` epoch row into `deck_rule_flags` (and updates the rule card's
# own `read_rule_id` in `O(1)`), while `reconcile_read_rule_if_stale!` lazily
# re-derives `read_rule_id` / `read_rule_class` on read whenever a card's
# watermark in `deck_card_rule_watermarks` is older than `MAX(epoch)` in
# `deck_rule_flags`.

require "set"
require "time"

class Card
  module Rule
    module LazyWatermark
      DEFAULT_COMPACTION_INTERVAL_MS = 2_592_000_000 # 30 days
      MAX_PENDING_FLAGS_BEFORE_COMPACTION = 1_000
      DEFAULT_COMPACTION_BATCH_SIZE = 500
      SEARCH_COMPACTION_BATCH_SIZE = 250
      WATERMARK_STATE_KEY = "LAZY-RULE-WATERMARK-STATE".freeze
      COMPACTION_MUTEX = Mutex.new

      def read_only_mode?
        Card.respond_to?(:config) && Card.config.respond_to?(:read_only) && Card.config.read_only ? true : false
      end

      def ensure_rule_flags_schema!
        return true if @rule_flags_schema_ensured
        return false if @rule_flags_schema_unsupported
        return false if read_only_mode?

        conn = ActiveRecord::Base.connection
        unless conn.adapter_name.to_s.match?(/sqlite/i)
          warn "[card-mod-batched-nests] lazy_rule_watermarks DDL requires SQLite/D1 (adapter: #{conn.adapter_name}); falling back to stock read-rule cascade"
          @rule_flags_schema_unsupported = true
          return false
        end

        conn.execute <<~SQL
          CREATE TABLE IF NOT EXISTS deck_rule_flags (
            epoch INTEGER PRIMARY KEY AUTOINCREMENT,
            rule_id INTEGER NOT NULL,
            set_id INTEGER,
            pattern_code TEXT NOT NULL,
            anchor_id INTEGER,
            anchor_left_id INTEGER,
            anchor_right_id INTEGER,
            anchor_key TEXT,
            is_delete INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
          )
        SQL
        conn.execute <<~SQL
          CREATE INDEX IF NOT EXISTS deck_rule_flags_epoch_idx
            ON deck_rule_flags(epoch)
        SQL
        conn.execute <<~SQL
          CREATE TABLE IF NOT EXISTS deck_card_rule_watermarks (
            card_id INTEGER PRIMARY KEY,
            epoch INTEGER NOT NULL
          )
        SQL
        conn.execute <<~SQL
          CREATE TABLE IF NOT EXISTS deck_rule_watermark_meta (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            last_full_compaction_at_ms INTEGER NOT NULL DEFAULT 0,
            compaction_interval_ms INTEGER NOT NULL DEFAULT #{DEFAULT_COMPACTION_INTERVAL_MS}
          )
        SQL
        conn.execute <<~SQL
          INSERT OR IGNORE INTO deck_rule_watermark_meta (id, last_full_compaction_at_ms, compaction_interval_ms)
          VALUES (1, 0, #{DEFAULT_COMPACTION_INTERVAL_MS})
        SQL
        @rule_flags_schema_ensured = true
      rescue StandardError => e
        log_watermark_error(:ensure_rule_flags_schema!, e)
        false
      end

      # Seeds the request-scoped temporary cache with the latest rule epoch
      # (for example from `Card::Cache::LivePageBundle::LOAD_SQL`) so steady-state
      # renders with `latest_epoch == 0` execute zero extra SQL queries.
      def seed_request_epoch! epoch
        state = request_watermark_state(fetch_latest: false)
        state[:latest_epoch] = epoch.to_i
        persist_request_watermark_state!(state)
        state
      end

      def raise_read_rule_flag! rule_card, is_delete: false
        return nil if read_only_mode?
        return nil unless ensure_rule_flags_schema!

        rule_id = rule_card.respond_to?(:id) ? rule_card.id.to_i : rule_card.to_i
        set_id = rule_card.respond_to?(:left_id) ? rule_card.left_id : nil
        pattern_code, anchor_id, anchor_left_id, anchor_right_id, anchor_key =
          extract_set_pattern_details(rule_card)
        created_at = Time.now.utc.iso8601(3)

        conn = ActiveRecord::Base.connection
        sql = ActiveRecord::Base.sanitize_sql_array([
          "INSERT INTO deck_rule_flags (" \
          "rule_id, set_id, pattern_code, anchor_id, anchor_left_id, anchor_right_id, anchor_key, is_delete, created_at" \
          ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          rule_id,
          set_id,
          pattern_code,
          anchor_id,
          anchor_left_id,
          anchor_right_id,
          anchor_key,
          is_delete ? 1 : 0,
          created_at
        ])
        conn.execute(sql)
        reset_request_watermark_state!
        epoch = latest_rule_flag_epoch

        # Purge any L3 global rendered-HTML caches (`edge_render_cache` and
        # `decko_edge_render_cache`) when present so runtime `*read` rule mutations
        # never leave stale pre-tightening HTML rows in L3 (C1).
        %w[edge_render_cache decko_edge_render_cache].each do |cache_tbl|
          conn.execute("DELETE FROM \"#{cache_tbl}\"") if conn.data_source_exists?(cache_tbl)
        rescue StandardError
          nil
        end

        # Reconcile the live rule card's own read_rule_id / read_rule_class in O(1)
        # and watermark it, matching TypeScript's raiseReadRuleFlag tail.
        # Isolated in its own rescue block (M7) so a tail failure after the flag row
        # is already durable in `deck_rule_flags` does not return nil and trigger a
        # duplicate stock O(N) cascade via `super`.
        begin
          if !is_delete && rule_id.positive? && rule_card.respond_to?(:permission_rule_id_and_class)
            rule_card.instance_variable_set(:@reconciling_read_rule, true)
            begin
              rule_card.reset_patterns if rule_card.respond_to?(:reset_patterns)
              own_rule_id, own_rule_class = rule_card.permission_rule_id_and_class(:read)
              cur_id = rule_card.respond_to?(:read_attribute) ? rule_card.read_attribute(:read_rule_id) : rule_card[:read_rule_id]
              cur_class = rule_card.respond_to?(:read_attribute) ? rule_card.read_attribute(:read_rule_class) : rule_card[:read_rule_class]
              if cur_id != own_rule_id || cur_class != own_rule_class
                assign_reconciled_read_rule!(rule_card, own_rule_id, own_rule_class)
                Card.where(id: rule_id).update_all(read_rule_id: own_rule_id, read_rule_class: own_rule_class)
              end
              record_card_rule_watermark!(rule_id, epoch) if epoch.positive?
            ensure
              clear_reconciling_ivar!(rule_card)
            end
          end
          run_scheduled_compaction_if_due!
        rescue StandardError => tail_err
          log_watermark_error(:raise_read_rule_flag_tail!, tail_err)
        end
        epoch
      rescue StandardError => e
        log_watermark_error(:raise_read_rule_flag!, e)
        nil
      end

      def latest_rule_flag_epoch
        return 0 unless ensure_rule_flags_schema!

        state = request_watermark_state(fetch_latest: true)
        state[:latest_epoch].to_i
      rescue StandardError => e
        log_watermark_error(:latest_rule_flag_epoch, e)
        0
      end

      def card_rule_watermark_epoch card_id
        return 0 unless ensure_rule_flags_schema!

        cid = card_id.to_i
        state = request_watermark_state(fetch_latest: true)
        cached = state[:card_epochs][cid]
        return cached if cached && (state[:latest_epoch].zero? || cached >= state[:latest_epoch])

        conn = ActiveRecord::Base.connection
        val = conn.select_value(
          ActiveRecord::Base.sanitize_sql_array([
            "SELECT epoch FROM deck_card_rule_watermarks WHERE card_id = ?",
            cid
          ])
        )
        epoch = val ? val.to_i : 0
        state[:card_epochs][cid] = epoch
        persist_request_watermark_state!(state)
        epoch
      rescue StandardError => e
        log_watermark_error(:card_rule_watermark_epoch, e)
        0
      end

      def record_card_rule_watermark! card_id, epoch
        return nil unless ensure_rule_flags_schema!

        cid = card_id.to_i
        ep = epoch.to_i
        unless read_only_mode?
          conn = ActiveRecord::Base.connection
          sql = ActiveRecord::Base.sanitize_sql_array([
            "INSERT INTO deck_card_rule_watermarks (card_id, epoch) VALUES (?, ?) " \
            "ON CONFLICT(card_id) DO UPDATE SET epoch = MAX(deck_card_rule_watermarks.epoch, excluded.epoch)",
            cid,
            ep
          ])
          conn.execute(sql)
        end
        state = request_watermark_state(fetch_latest: false)
        prev = state[:card_epochs][cid] || 0
        state[:card_epochs][cid] = [prev, ep].max
        persist_request_watermark_state!(state)
        ep
      rescue StandardError => e
        log_watermark_error(:record_card_rule_watermark!, e)
        nil
      end

      # Lazily reconciles a card's `read_rule_id` and `read_rule_class` when
      # `Card.config.lazy_rule_watermarks` is enabled and `deck_rule_flags` has a
      # newer epoch than the card's watermark in `deck_card_rule_watermarks`, or
      # heals a cached `Card` instance whose in-memory stamp predates the latest
      # full compaction (`last_full_compaction_at_ms`, matching TypeScript S2).
      def reconcile_read_rule_if_stale! card
        return card unless Card::Cache.config_enabled?(:lazy_rule_watermarks)
        return card unless card.respond_to?(:id) && card.id && !card.instance_variable_get(:@reconciling_read_rule)
        return card if card.respond_to?(:trash?) && card.trash?
        return card unless ensure_rule_flags_schema!

        state = request_watermark_state(fetch_latest: true)
        last_compaction_ms = state[:last_compaction_at_ms].to_i
        card_compaction_ms = card.instance_variable_defined?(:@_rule_compaction_stamp_ms) ? card.instance_variable_get(:@_rule_compaction_stamp_ms) : nil
        if card_compaction_ms.nil?
          card.instance_variable_set(:@_rule_compaction_stamp_ms, last_compaction_ms)
        elsif last_compaction_ms > card_compaction_ms.to_i
          refresh_card_read_rule_from_db!(card, last_compaction_ms)
        end

        latest_epoch = state[:latest_epoch].to_i
        return card unless latest_epoch.positive?

        run_scheduled_compaction_if_due!
        latest_epoch = latest_rule_flag_epoch
        if latest_epoch.zero?
          post_state = request_watermark_state(fetch_latest: true)
          refresh_card_read_rule_from_db!(card, post_state[:last_compaction_at_ms].to_i)
          return card
        end

        card_epoch = card_rule_watermark_epoch(card.id)
        return card if card_epoch >= latest_epoch

        card.instance_variable_set(:@reconciling_read_rule, true)
        begin
          flags = pending_flags_since(card_epoch)
          might_match = flags.any? { |flag| flag_may_affect_card?(flag, card) }

          if might_match && card.respond_to?(:permission_rule_id_and_class)
            card.reset_patterns if card_needs_pattern_reset?(card)
            new_id, new_class = card.permission_rule_id_and_class(:read)
            cur_id = card.respond_to?(:read_attribute) ? card.read_attribute(:read_rule_id) : card[:read_rule_id]
            cur_class = card.respond_to?(:read_attribute) ? card.read_attribute(:read_rule_class) : card[:read_rule_class]
            if cur_id != new_id || cur_class != new_class
              assign_reconciled_read_rule!(card, new_id, new_class)
              Card.where(id: card.id).update_all(read_rule_id: new_id, read_rule_class: new_class) unless read_only_mode?
            end
          end
          record_card_rule_watermark!(card.id, latest_epoch)
          card.instance_variable_set(:@_rule_compaction_stamp_ms, last_compaction_ms)
          card
        ensure
          clear_reconciling_ivar!(card)
        end
      rescue StandardError => e
        log_watermark_error(:reconcile_read_rule_if_stale!, e)
        card
      end

      def compaction_schedule_state now_ms: nil
        now = now_ms || (Time.now.to_f * 1000).to_i
        return { last_full_compaction_at_ms: 0, compaction_interval_ms: DEFAULT_COMPACTION_INTERVAL_MS, pending_flag_count: 0, due: false } unless ensure_rule_flags_schema!

        conn = ActiveRecord::Base.connection
        meta = conn.select_one("SELECT last_full_compaction_at_ms, compaction_interval_ms FROM deck_rule_watermark_meta WHERE id = 1") || {}
        last_ms = (meta["last_full_compaction_at_ms"] || 0).to_i
        interval_ms = (meta["compaction_interval_ms"] || DEFAULT_COMPACTION_INTERVAL_MS).to_i
        pending_count = conn.select_value("SELECT COUNT(*) FROM deck_rule_flags").to_i
        due = pending_count.positive? && (
          pending_count >= MAX_PENDING_FLAGS_BEFORE_COMPACTION ||
          (now - last_ms) >= interval_ms
        )
        {
          last_full_compaction_at_ms: last_ms,
          compaction_interval_ms: interval_ms,
          pending_flag_count: pending_count,
          due: due
        }
      rescue StandardError => e
        log_watermark_error(:compaction_schedule_state, e)
        { last_full_compaction_at_ms: 0, compaction_interval_ms: DEFAULT_COMPACTION_INTERVAL_MS, pending_flag_count: 0, due: false }
      end

      def run_scheduled_compaction_if_due! now_ms: nil
        return false if read_only_mode? || Thread.current[:decko_compacting_pending_rule_flags]
        return false unless ensure_rule_flags_schema!

        state = request_watermark_state(fetch_latest: false)
        return false if state[:compaction_checked] && now_ms.nil?

        state[:compaction_checked] = true
        persist_request_watermark_state!(state)
        sched = compaction_schedule_state(now_ms: now_ms)
        return false unless sched[:due]

        compact_pending_rule_flags!(now_ms: now_ms)
      end

      # Compacts pending rule flags in `deck_rule_flags` in bounded `batch_size`
      # chunks (default 500; 250 on the CQL search path) with durable per-slice
      # watermark progress and per-card error isolation (S3) so neither a large
      # deck nor a poison card can block a user request or loop forever.
      # Mirrors TypeScript's `compactPendingRuleFlags` / `reconcilePendingRuleFlagsForSearch`.
      def compact_pending_rule_flags! now_ms: nil, batch_size: DEFAULT_COMPACTION_BATCH_SIZE
        return false unless Card::Cache.config_enabled?(:lazy_rule_watermarks)
        return false if read_only_mode? || Thread.current[:decko_compacting_pending_rule_flags]
        return false unless ensure_rule_flags_schema!

        COMPACTION_MUTEX.synchronize do
          reset_request_watermark_state!
          target_epoch = latest_rule_flag_epoch
          return false unless target_epoch.positive?

          Thread.current[:decko_compacting_pending_rule_flags] = true
          begin
            conn = ActiveRecord::Base.connection
            flags = pending_flags_since(0)
            reconciled_epoch = flags.map { |f| f[:epoch].to_i }.max || target_epoch
            limit = [batch_size.to_i, 1].max

            stale_ids = conn.select_values(
              ActiveRecord::Base.sanitize_sql_array([
                "SELECT c.id FROM cards c " \
                "LEFT JOIN deck_card_rule_watermarks w ON w.card_id = c.id " \
                "WHERE c.trash = 0 AND COALESCE(w.epoch, 0) < ? " \
                "ORDER BY c.id ASC LIMIT ?",
                reconciled_epoch,
                limit
              ])
            ).map(&:to_i)

            updates_by_rule = Hash.new { |h, k| h[k] = [] }
            watermarked_ids = []
            Card::Auth.as_bot do
              stale_ids.each_slice(250) do |batch_ids|
                batch_cards = Card.where(id: batch_ids, trash: false).to_a
                Card::Cache.prefetch_for_patterns(batch_cards) if Card::Cache.respond_to?(:prefetch_for_patterns)
                batch_cards.each do |card|
                  watermarked_ids << card.id
                  next unless flags.empty? || flags.any? { |flag| flag_may_affect_card?(flag, card) }

                  card.instance_variable_set(:@reconciling_read_rule, true)
                  begin
                    card.reset_patterns if card_needs_pattern_reset?(card)
                    new_id, new_class = card.permission_rule_id_and_class(:read)
                    cur_id = card.respond_to?(:read_attribute) ? card.read_attribute(:read_rule_id) : card[:read_rule_id]
                    cur_class = card.respond_to?(:read_attribute) ? card.read_attribute(:read_rule_class) : card[:read_rule_class]
                    if cur_id != new_id || cur_class != new_class
                      updates_by_rule[[new_id, new_class]] << card.id
                    end
                  rescue StandardError => card_err
                    log_watermark_error(:compact_card_eval, card_err)
                  ensure
                    clear_reconciling_ivar!(card)
                  end
                end
              end
            end

            updates_by_rule.each do |(new_id, new_class), ids|
              ids.each_slice(500) do |batch_ids|
                Card.where(id: batch_ids).update_all(read_rule_id: new_id, read_rule_class: new_class)
              end
            end

            # Persist durable watermark progress for evaluated cards even when more
            # chunks remain (S3) so partial compaction progress is never lost.
            watermarked_ids.each_slice(200) do |chunk_ids|
              values_sql = chunk_ids.map { |cid| "(#{cid.to_i}, #{reconciled_epoch.to_i})" }.join(", ")
              conn.execute(
                "INSERT INTO deck_card_rule_watermarks (card_id, epoch) VALUES #{values_sql} " \
                "ON CONFLICT(card_id) DO UPDATE SET epoch = MAX(deck_card_rule_watermarks.epoch, excluded.epoch)"
              )
            end

            remaining_unwatermarked = conn.select_value(
              ActiveRecord::Base.sanitize_sql_array([
                "SELECT COUNT(*) FROM cards c " \
                "LEFT JOIN deck_card_rule_watermarks w ON w.card_id = c.id " \
                "WHERE c.trash = 0 AND COALESCE(w.epoch, 0) < ?",
                reconciled_epoch
              ])
            ).to_i

            if remaining_unwatermarked.zero?
              stamp_ms = now_ms || (Time.now.to_f * 1000).to_i
              conn.execute(
                ActiveRecord::Base.sanitize_sql_array([
                  "DELETE FROM deck_rule_flags WHERE epoch <= ?",
                  reconciled_epoch
                ])
              )
              conn.execute(
                ActiveRecord::Base.sanitize_sql_array([
                  "DELETE FROM deck_card_rule_watermarks WHERE epoch <= ?",
                  reconciled_epoch
                ])
              )
              conn.execute(
                ActiveRecord::Base.sanitize_sql_array([
                  "UPDATE deck_rule_watermark_meta SET last_full_compaction_at_ms = ? WHERE id = 1",
                  stamp_ms
                ])
              )
            end
            reset_request_watermark_state!
            remaining_epoch = latest_rule_flag_epoch
            seed_request_epoch!(remaining_epoch)
            true
          ensure
            Thread.current[:decko_compacting_pending_rule_flags] = false
          end
        end
      rescue StandardError => e
        log_watermark_error(:compact_pending_rule_flags!, e)
        false
      end

      # Prepended to `Card::Set::Right::Read` (`card-mod-permissions/set/right/read.rb`),
      # where Decko 0.20.0 defines `update_read_ruled_cards`.
      module ReadRuleSaveHook
        def update_read_ruled_cards
          return super if respond_to?(:rule?) && name.present? && !rule?

          if !Thread.current[:decko_compacting_pending_rule_flags] &&
             Card::Cache.config_enabled?(:lazy_rule_watermarks)
            epoch = Card::Rule::LazyWatermark.raise_read_rule_flag!(self, is_delete: trash?)
            if epoch
              Card::Rule.clear_read_rule_cache if defined?(Card::Rule) && Card::Rule.respond_to?(:clear_read_rule_cache)
              Card::Rule.clear_rule_cache if defined?(Card::Rule) && Card::Rule.respond_to?(:clear_rule_cache)
              expire if respond_to?(:expire, true)
              return nil
            end
          end
          super
        end
      end

      # Prepended to `Card::Set::All::Permissions` (or `Card` if `Permissions` is
      # not yet loaded) so reads of `card.read_rule_id`, `card.read_rule_class`,
      # and `card.ok_to_read?` lazily reconcile when `deck_rule_flags` has advanced.
      module ReadRuleReaderHook
        def ok_to_read?
          Card::Rule::LazyWatermark.reconcile_read_rule_if_stale!(self)
          super
        end

        def read_rule_id
          Card::Rule::LazyWatermark.reconcile_read_rule_if_stale!(self)
          super
        end

        def read_rule_class
          Card::Rule::LazyWatermark.reconcile_read_rule_if_stale!(self)
          super
        end
      end

      # Prepended to `Card::Query::SqlStatement::Where` so non-bot CQL queries
      # filtering on `#{table}.read_rule_id IN (...)` compact pending rule
      # flags in bounded slices (`SEARCH_COMPACTION_BATCH_SIZE`) before executing
      # the SQL query.
      module QueryWhere
        def permission_conditions table
          if !Card::Auth.always_ok? &&
             Card::Cache.config_enabled?(:lazy_rule_watermarks)
            Card::Rule::LazyWatermark.compact_pending_rule_flags!(batch_size: SEARCH_COMPACTION_BATCH_SIZE)
          end
          super
        end
      end

      private

      def refresh_card_read_rule_from_db! card, compaction_ms
        return unless card.respond_to?(:id) && card.id

        conn = ActiveRecord::Base.connection
        row = conn.select_one(
          ActiveRecord::Base.sanitize_sql_array([
            "SELECT read_rule_id, read_rule_class FROM cards WHERE id = ?",
            card.id.to_i
          ])
        )
        if row
          new_id = row["read_rule_id"]&.to_i
          new_class = row["read_rule_class"]
          assign_reconciled_read_rule!(card, new_id, new_class)
        end
        card.instance_variable_set(:@_rule_compaction_stamp_ms, compaction_ms.to_i)
      rescue StandardError => e
        log_watermark_error(:refresh_card_read_rule_from_db!, e)
      end

      def assign_reconciled_read_rule! card, new_id, new_class
        if card.respond_to?(:write_attribute, true)
          card.send(:write_attribute, :read_rule_id, new_id)
          card.send(:write_attribute, :read_rule_class, new_class)
        else
          card[:read_rule_id] = new_id
          card[:read_rule_class] = new_class
        end
        [:@ok, :@rule_ids, :@read_rule_id, :@read_rule_class].each do |ivar|
          card.remove_instance_variable(ivar) if card.instance_variable_defined?(ivar)
        end
      end

      def clear_reconciling_ivar! card
        return unless card.respond_to?(:instance_variable_defined?)

        card.remove_instance_variable(:@reconciling_read_rule) if card.instance_variable_defined?(:@reconciling_read_rule)
      end

      def card_needs_pattern_reset? card
        card.respond_to?(:reset_patterns) && (!card.respond_to?(:patterns?) || card.patterns?)
      end

      def log_watermark_error context, err
        warned = (Thread.current[:decko_lazy_watermark_warned] ||= Set.new)
        return if warned.include?(context)

        warned.add(context)
        warn "[card-mod-batched-nests] LazyWatermark##{context} error: #{err.class}: #{err.message}"
      end

      def persist_request_watermark_state! state
        Thread.current[:decko_lazy_watermark_state] = state
        temp = Card.respond_to?(:cache) && Card.cache&.temp
        temp.write(WATERMARK_STATE_KEY, state, callback: false) if temp
      end

      def request_watermark_state fetch_latest: true
        temp = Card.respond_to?(:cache) && Card.cache&.temp
        state = temp ? temp.read(WATERMARK_STATE_KEY) : Thread.current[:decko_lazy_watermark_state]
        unless state.is_a?(Hash)
          state = { latest_epoch: nil, last_compaction_at_ms: nil, card_epochs: {}, flags: nil, compaction_checked: false }
          persist_request_watermark_state!(state)
        end
        if fetch_latest && (state[:latest_epoch].nil? || state[:last_compaction_at_ms].nil?)
          conn = ActiveRecord::Base.connection
          row = conn.select_one(
            "SELECT COALESCE((SELECT MAX(epoch) FROM deck_rule_flags), 0) AS latest_epoch, " \
            "COALESCE((SELECT last_full_compaction_at_ms FROM deck_rule_watermark_meta WHERE id = 1), 0) AS last_compaction_at_ms"
          ) || {}
          state[:latest_epoch] = (row["latest_epoch"] || 0).to_i
          state[:last_compaction_at_ms] = (row["last_compaction_at_ms"] || 0).to_i
          persist_request_watermark_state!(state)
        end
        state
      end

      def reset_request_watermark_state!
        Thread.current[:decko_lazy_watermark_state] = nil
        Thread.current[:decko_lazy_watermark_warned] = nil
        temp = Card.respond_to?(:cache) && Card.cache&.temp
        temp&.delete(WATERMARK_STATE_KEY)
      end

      def pending_flags_since card_epoch
        state = request_watermark_state(fetch_latest: true)
        if state[:flags].nil?
          conn = ActiveRecord::Base.connection
          rows = conn.select_all("SELECT * FROM deck_rule_flags ORDER BY epoch ASC").to_a
          state[:flags] = rows.map do |r|
            {
              epoch: r["epoch"].to_i,
              rule_id: r["rule_id"].to_i,
              set_id: r["set_id"]&.to_i,
              pattern_code: r["pattern_code"].to_s,
              anchor_id: r["anchor_id"]&.to_i,
              anchor_left_id: r["anchor_left_id"]&.to_i,
              anchor_right_id: r["anchor_right_id"]&.to_i,
              anchor_key: r["anchor_key"]
            }
          end
          persist_request_watermark_state!(state)
        end
        state[:flags].select { |f| f[:epoch] > card_epoch.to_i }
      end

      def flag_may_affect_card? flag, card
        cur_rule_id = card.respond_to?(:read_attribute) ? card.read_attribute(:read_rule_id) : card[:read_rule_id]
        return true if cur_rule_id && cur_rule_id.to_i == flag[:rule_id]
        # Compound cards may inherit their left ancestor's read_rule_id via [[_left]]
        # or match *type plus right based on their left card's type.
        return true if card.left_id.present?

        case flag[:pattern_code]
        when "all"
          true
        when "all_plus", "right", "type_plus_right"
          false
        when "type"
          flag[:anchor_id] && card.type_id.to_i == flag[:anchor_id]
        when "self"
          (flag[:anchor_id] && card.id.to_i == flag[:anchor_id]) ||
            (flag[:anchor_key] && card.key.to_s == flag[:anchor_key].to_s)
        when "star"
          card.key.to_s.start_with?("*")
        else
          true
        end
      end

      def extract_set_pattern_details rule_card
        return ["all", nil, nil, nil, nil] unless rule_card.respond_to?(:left) && (set_card = rule_card.left)

        pattern_code =
          if set_card.respond_to?(:right) && set_card.right&.codename.present?
            set_card.right.codename.to_s
          elsif set_card.respond_to?(:codename) && set_card.codename.present?
            set_card.codename.to_s
          else
            "all"
          end
        anchor_id = set_card.respond_to?(:left_id) ? set_card.left_id : nil
        anchor = set_card.respond_to?(:left) ? set_card.left : nil
        anchor_left_id = anchor.respond_to?(:left_id) ? anchor.left_id : nil
        anchor_right_id = anchor.respond_to?(:right_id) ? anchor.right_id : nil
        anchor_key = anchor.respond_to?(:key) ? anchor.key : nil
        pattern_code = "type_plus_right" if pattern_code == "type" && anchor_left_id.present? && anchor_right_id.present?
        [pattern_code, anchor_id, anchor_left_id, anchor_right_id, anchor_key]
      end
    end
  end
end

Card::Rule::LazyWatermark.extend Card::Rule::LazyWatermark
