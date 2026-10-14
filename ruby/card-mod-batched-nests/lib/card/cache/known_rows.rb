# Batched nest loading for card 1.110.0. This file is card/lib/card/cache/known_rows.rb as written
# in the proposed decko-commons/decko change (prefetch-combined, based on v0.20.0).

class Card
  class Cache
    # Answers, without a query, the database reads of a fetch whose answer is
    # already known: codename cards, and simple names found to have no card.
    #
    # Codename cards are fetched often and from everywhere, and a cold cache
    # reads each of them from the database on its own. Their rows are kept in
    # the shared cache as a single entry instead, so that a codename card
    # missing from the card cache is instantiated from its row there, exactly
    # as the query would have instantiated it. Building the entry costs one
    # query for all of them; it is deleted whenever a codename card is saved,
    # and when codenames change.
    #
    # A simple name with no card is recorded in the lexicon's temporary cache,
    # as Lexicon.lex_to_id records it, and is not looked up again in the same
    # request. (Compound names are resolved through the lexicon, which already
    # remembers them.)
    module KnownRows
      CODENAME_CARDS = "CODENAME-CARDS".freeze

      # The card a fetch reads from the database: Card.where(query).take.
      # @param query [Hash] { id: } or { key: }, with trash: false unless the
      #   fetch looks in the trash
      # @return [Card, nil]
      def retrieve_from_db query
        return Card.where(query).take unless known_rows? query
        return if known_missing? query

        codename_card(query) || Card.where(query).take.tap do |card|
          record_missing query unless card
        end
      end

      # @return [Hash] id => lex of every codename card not in the trash
      def codename_lexes
        codename_cards[:lexes]
      end

      def expire_codename_cards cache=Card.cache
        cache.delete CODENAME_CARDS
      end

      private

      def known_rows? query
        Card.config.prefetch_machinery && query[:trash] == false
      end

      def codename_card query
        return unless (id = codename_card_id query)
        return unless (row = codename_cards[:rows][id])

        Card.instantiate row.dup
      end

      def codename_card_id query
        if query[:id]
          query[:id] if Codename[query[:id]]
        elsif query[:key]
          codename_cards[:keys][query[:key]]
        end
      end

      # @return [Hash] the rows of every codename card not in the trash, as read
      #   from the database, by id; their ids by key; and their lexes by id
      def codename_cards
        Card.cache.fetch(CODENAME_CARDS) { load_codename_cards }
      end

      def load_codename_cards
        cards = Card.where(id: Codename.ids, trash: false).where.not(codename: nil).to_a
        { rows: cards.to_h { |card| [card.id, card.attributes_before_type_cast] },
          keys: cards.to_h { |card| [card.read_attribute(:key), card.id] },
          lexes: cards.to_h { |card| [card.id, stored_lex(card)] } }
      end

      # the lex as the lexicon reads it from the database
      def stored_lex card
        card.read_attribute(:name) || [card.left_id, card.right_id]
      end

      def known_missing? query
        return false unless (key = query[:key])

        temp = Lexicon.cache.temp
        lex_key = Lexicon.cache_key key
        temp.exist?(lex_key) && temp.read(lex_key).nil?
      end

      def record_missing query
        Lexicon.write_to_temp_cache nil, nil, query[:key] if query[:key]
      end
    end
  end
end
