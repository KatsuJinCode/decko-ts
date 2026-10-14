# Batched nest loading for card 1.110.0. This file is card/lib/card/cache/prefetch_rules.rb as written
# in the proposed decko-commons/decko change (prefetch-combined, based on v0.20.0).

class Card
  class Cache
    # Loads a rule card together with its set card, and what computing their
    # set patterns fetches, before the rule is fetched by id.
    #
    # Fetching a rule card by id on a cold cache looks up its name (the rule's
    # set and setting), the name of its set (anchor and pattern), and the
    # rule's row, and computing its set patterns then fetches the set card, the
    # setting card and the "Set+setting" anchor: up to six queries per rule.
    # The rule cache already knows each rule's anchor, pattern and setting, so
    # the rule's and its set's rows are loaded in one query, and the
    # "Set+setting" anchors of all settings in another, once per request.
    module PrefetchRules
      RULE_KEYS = "RULE-KEYS".freeze

      # @param rule_id [Integer] the id of a card that may be a rule
      def prefetch_rule rule_id
        return unless Card.config.prefetch_machinery
        return unless (lookup_key = rule_keys&.dig(:keys, rule_id))
        return if cached_card_by_id rule_id

        cards = load_rule rule_id, *rule_set_parts(lookup_key)
        Lexicon.prefetch_cards cards
        cards.each { |card| Card.write_to_cache card }
        prefetch_setting_anchors
        prefetch_for_patterns cards
      end

      private

      # rule id => "anchor_id+pattern_code+setting_code" (no anchor_id for
      # anchorless sets), the inverse of the rule cache, kept for the request.
      # Nil until the rule cache is loaded: a rule id comes from the rule cache,
      # and fetching a card by id should not load it.
      def rule_keys
        Card.cache.temp.read(RULE_KEYS) || build_rule_keys
      end

      def build_rule_keys
        return unless (rules = Card.cache.read Card::Rule::Cache.cache_key)

        Card.cache.temp.write RULE_KEYS, { keys: rules.invert }
      end

      # @return [Array] anchor id (nil for anchorless sets) and pattern id
      def rule_set_parts lookup_key
        parts = lookup_key.split "+"
        anchor_id = parts.first.to_i if parts.size > 2
        [anchor_id, Codename.id(parts[-2].to_sym)]
      end

      # the rule's row, and its set's unless that is cached already
      def load_rule rule_id, anchor_id, pattern_id
        if anchor_id && !cached_set?(anchor_id, pattern_id)
          return Card.where(trash: false)
                     .where("id = ? OR (left_id = ? AND right_id = ?)",
                            rule_id, anchor_id, pattern_id).to_a
        end

        # an anchorless set is the pattern card itself
        set_id = pattern_id unless anchor_id || cached_card_by_id(pattern_id)
        load_ids [rule_id, set_id].compact
      end

      def cached_set? anchor_id, pattern_id
        lex_key = Lexicon.cache_key [anchor_id, pattern_id]
        Lexicon.cache.exist?(lex_key) && cached_card_by_id(Lexicon.cache.read(lex_key))
      end

      # the "Set+setting" anchors of the type-plus-right sets of all rules
      def prefetch_setting_anchors
        state = rule_keys
        return if state[:setting_anchors]

        state[:setting_anchors] = true
        Lexicon.prefetch_lexes(setting_ids(state[:keys]).map { |id| [SetID, id] })
      end

      def setting_ids keys
        keys.each_value.map { |key| key.split("+").last }.uniq
            .filter_map { |code| Codename.id code.to_sym }
      end
    end
  end
end
