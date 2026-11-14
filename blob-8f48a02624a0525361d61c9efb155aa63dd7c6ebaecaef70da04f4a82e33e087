# Batched nest loading for card 1.110.0. This file is card/lib/card/lexicon/prefetch.rb as written
# in the proposed decko-commons/decko change (prefetch-combined, based on v0.20.0).

class Card
  module Lexicon
    # Batch forms of the lexicon's lookups: many names by id, or many ids by
    # left and right id, in one query each, cached as the one-at-a-time
    # lookups cache them.
    module Prefetch
      # most ids or pairs looked up in one query
      BATCH_SIZE = 250

      # Caches the lexes of cards just read from the database, and loads the
      # lexes of their name parts that are not cached yet.
      # @param cards [Array<Card>]
      def prefetch_cards cards
        prefetch_ids(cards.flat_map do |card|
          cache_row card.id, card.read_attribute(:name), card.left_id, card.right_id
        end)
      end

      # Loads the lexes of the given ids, and of their name parts, that are not
      # cached yet: one query per level of name nesting.
      # @param ids [Array<Integer>]
      def prefetch_ids ids
        while (ids = uncached_ids ids).present?
          rows = ids.each_slice(BATCH_SIZE).flat_map do |batch|
            Card.where(id: batch).pluck(:id, :name, :left_id, :right_id)
          end
          ids = rows.flat_map { |row| cache_row(*row) }
        end
      end

      # Looks up the ids of the given [left_id, right_id] pairs that are not
      # cached yet. Pairs with no card are recorded as misses.
      # @param lexes [Array<Array<Integer>>]
      def prefetch_lexes lexes
        lexes = lexes.uniq.reject { |lex| cache.exist? cache_key(lex) }
        found = lexes.each_slice(BATCH_SIZE).flat_map { |batch| pair_rows batch }
        found.each { |id, left_id, right_id| cache_row id, nil, left_id, right_id }
        record_misses lexes - found.map { |row| row.drop(1) }
      end

      private

      def uncached_ids ids
        ids = ids.compact.uniq
        ids.each { |id| prefetch_codename_lexes id }
        ids.reject { |id| cache.exist? id.to_s }
      end

      def record_misses lexes
        lexes.each { |lex| write_to_temp_cache nil, nil, lex }
      end

      def pair_rows lexes
        condition = Array.new(lexes.size, "(left_id = ? AND right_id = ?)").join(" OR ")
        Card.where(trash: false).where(condition, *lexes.flatten)
            .pluck(:id, :left_id, :right_id)
      end

      # caches a lex as #id_to_lex does
      # @return [Array<Integer>] the ids of the name parts of a compound lex
      def cache_row id, name, left_id, right_id
        lex = name || [left_id, right_id]
        cache.write id.to_s, lex
        cache.write cache_key(lex), id
        name ? [] : lex
      end

      # Codename cards' names are looked up often and from everywhere. When one
      # of them is not cached, all of them are put in the temporary cache, as
      # building the codename cache does (see Codename.process_codenames). They
      # come from the single shared-cache entry of codename cards (see
      # Card::Cache::KnownRows), so this costs one shared read, or one query
      # and one shared write when that entry is missing.
      def prefetch_codename_lexes id
        return unless Card.config.prefetch_machinery && Codename[id.to_i]
        return if cache.exist? id.to_s

        Card::Cache.codename_lexes.each { |card_id, lex| write_to_temp_lex card_id, lex }
      end

      def write_to_temp_lex id, lex
        cache.temp.write id.to_s, lex
        cache.temp.write cache_key(lex), id
      end

      # a codename card's name changed or it was deleted
      def expire_codename_lexes card
        Card::Cache.expire_codename_cards if Codename[card.id]
      end
    end
  end
end
