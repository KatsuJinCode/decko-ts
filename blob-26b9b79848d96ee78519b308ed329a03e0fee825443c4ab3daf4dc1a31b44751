# Batched nest loading for card 1.110.0. This file is card/lib/card/cache/prefetch_related.rb as written
# in the proposed decko-commons/decko change (prefetch-combined, based on v0.20.0).

class Card
  class Cache
    # Loads, in batches, cards that are needed because of other cards: the
    # cards that computing their set patterns fetches, and their fields.
    #
    # Computing a card's set patterns fetches its type, its left and right
    # parts, the type of its left part, and the id of its type-plus-right set
    # anchor ("Type+right"). For cards loaded with {Prefetch#prefetch_names},
    # and for a card a fetch reads from the database, all of those are loaded
    # at once before the patterns are computed, so computing them finds
    # everything in the cache.
    module PrefetchRelated
      # Load the cards with the given ids that are not cached yet, in one query,
      # together with the names of their parts. The cards are stored as a fetch
      # with skip_modules stores them, without computing their set modules.
      #
      # @param ids [Array<Integer>]
      # @return [Array<Card>] the cards that were loaded
      def prefetch_ids ids
        ids = ids.compact.uniq.reject { |id| cached_card_by_id id }
        return [] if ids.empty?

        cards = load_ids ids
        Lexicon.prefetch_cards cards
        cards.each { |card| Card.write_to_cache card }
      end

      # Load the given fields of each card in the list, like {#prefetch_names}.
      # The database counterpart of {Populate#populate_fields}.
      #
      # @param list [Array<Card, Card::Name, String>]
      # @param fields [Array<Symbol, String>] codenames or names of the fields
      # @return [Array<Card>] the fields that were loaded
      def prefetch_fields list, *fields
        prefetch_names(list.product(fields.flatten).map { |parts| Card::Name[parts] })
      end

      # Load what computing the set patterns of the given cards fetches, for all
      # of them at once.
      #
      # @param cards [Array<Card>]
      # @param new_lexes [Array<Array<Integer>>] [left_id, right_id] of compound
      #   names with no card, for which new cards will be instantiated
      def prefetch_for_patterns cards, new_lexes=[]
        return unless Card.config.prefetch_machinery

        lexes = cards.filter_map { |card| card.lex if card.left_id } + new_lexes
        prefetch_ids cards.map(&:type_id) + lexes.flatten
        prefetch_left_types lexes
      end

      private

      # codename cards come from their shared-cache entry (see {KnownRows})
      def load_ids ids
        codenamed, others = ids.partition { |id| Codename[id] }
        codenamed.filter_map { |id| codename_card id: id, trash: false } +
          load_rows(others)
      end

      def load_rows ids
        ids.each_slice(Prefetch::BATCH_SIZE).flat_map do |batch|
          Card.where(id: batch, trash: false).to_a
        end
      end

      # simple names already found to have no card are not looked up again
      def uncached_names names
        return super unless Card.config.prefetch_machinery

        super.reject { |name| name.simple? && known_missing?(key: name.key) }
      end

      # the types of the left parts, and the type-plus-right set anchors
      def prefetch_left_types lexes
        prefetch_ids(lexes.map { |left_id, _right_id| cached_type_id left_id })
        Lexicon.prefetch_lexes(lexes.filter_map { |lex| type_plus_right_lex lex })
      end

      def cache_loaded cards
        prefetch_for_patterns cards
        super
      end

      # compound names with no card become new cards, whose patterns need the
      # same cards as those of existing cards
      def load_compound_names names
        super.tap do |cards|
          found = cards.map(&:lex)
          prefetch_for_patterns [], names.filter_map { |name| lex_for name } - found
        end
      end

      # [id of the left part's type, id of the right part]: the lex of the
      # anchor of the type-plus-right set
      def type_plus_right_lex lex
        return unless (left_type_id = cached_type_id lex.first)

        [left_type_id, lex.last]
      end

      def cached_type_id id
        cached_card_by_id(id)&.type_id
      end

      # reads the card cache without querying the database
      def cached_card_by_id id
        (name = cached_name id) && Card.cache.read(name.key)
      end

      def cached_name id
        return unless id && Lexicon.cache.exist?(id.to_s)

        case (lex = Lexicon.cache.read id.to_s)
        when Array then cached_compound_name lex
        when nil then nil
        else lex.to_name
        end
      end

      def cached_compound_name lex
        parts = lex.map { |side_id| cached_name(side_id) || (return nil) }
        parts.join(Card::Name.joint).to_name
      end
    end
  end
end
