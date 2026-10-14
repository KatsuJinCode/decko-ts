# Batched nest loading for card 1.110.0. This file is card/lib/card/cache/prefetch.rb as written
# in the proposed decko-commons/decko change (prefetch-combined, based on v0.20.0).

class Card
  class Cache
    # Loads many cards from the database at once and stores them in the card
    # cache, so that the fetches that follow find them there instead of each
    # issuing its own queries.
    module Prefetch
      BATCH_SIZE = 250

      # Load the cards with the given names that are not cached yet. Costs one
      # query per name length (simple names, then two-part names, and so on),
      # where fetching the cards one at a time costs one to four queries each.
      # Names with no card are recorded in the lexicon, as a fetch would record
      # them, so they are not looked up again.
      #
      # @param names [Array<Card::Name, String>]
      # @return [Array<Card>] the requested cards that were loaded
      def prefetch_names names
        requested = uncached_names names
        return [] if requested.empty?

        wanted = requested.to_set(&:key)
        load_by_length(requested + unknown_pieces(requested))
          .select { |card| wanted.include? card.key }
      end

      private

      # shorter names first, so the parts of compound names are known by id
      def load_by_length names
        names.uniq(&:key).group_by { |name| name.part_names.size }.sort
             .flat_map { |_length, group| load_names group }
      end

      def uncached_names names
        names.map(&:to_name).uniq(&:key).reject { |name| Card.cache.read name.key }
      end

      # the parts of compound names whose ids the lexicon cannot supply yet
      def unknown_pieces names
        names.select(&:compound?).flat_map(&:ancestor_pieces).reject do |piece|
          if piece.simple?
            Lexicon.cache.exist? Lexicon.cache_key(piece)
          else
            Card.cache.read piece.key
          end
        end
      end

      def load_names names
        names.first.simple? ? load_simple_names(names) : load_compound_names(names)
      end

      def load_simple_names names
        cards = names.each_slice(BATCH_SIZE).flat_map do |batch|
          Card.where(key: batch.map(&:key), trash: false).to_a
        end
        found = cards.to_set(&:key)
        names.each do |name|
          Lexicon.write_to_temp_cache nil, nil, name unless found.include? name.key
        end
        cache_loaded cards
      end

      def load_compound_names names
        lexes = names.filter_map { |name| lex_for name }
        cards = lexes.each_slice(BATCH_SIZE).flat_map do |batch|
          Card.where(trash: false).where(lex_condition(batch)).to_a
        end
        (lexes - cards.map { |card| [card.left_id, card.right_id] }).each do |lex|
          Lexicon.write_to_temp_cache nil, nil, lex
        end
        cache_loaded cards
      end

      # @return [Array<Integer>, nil] [left_id, right_id] when both parts exist
      def lex_for name
        return unless (left_id = Lexicon.id name.left_name)
        return unless (right_id = Lexicon.id name.right_name)

        [left_id, right_id]
      end

      def lex_condition lexes
        [Array.new(lexes.size, "(left_id = ? AND right_id = ?)").join(" OR "),
         *lexes.flatten]
      end

      # store cards the way a fetch stores a card it read from the database
      def cache_loaded cards
        cards.each do |card|
          card.prep_modules_for_caching
          Card.write_to_cache card
        end
      end
    end
  end
end
