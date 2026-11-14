# Wires batched nest loading into a stock card 1.110.0 / decko 0.20.0 install.
#
# The proposed decko-commons/decko change (prefetch-combined, based on v0.20.0)
# edits eleven existing files. This gem cannot edit them, so each edit is
# applied here as a module prepended to the class or set module it changes.
# Every method below names the upstream file and the change it carries; the
# new modules themselves (Card::Cache::Prefetch and the rest) are in this
# gem's lib/card tree under the same names and paths as upstream.
#
# Two settings control the behaviour, as upstream:
#   Card.config.prefetch_nests     nests and links loaded a level at a time
#   Card.config.prefetch_machinery list items, asset groups, pattern cards and
#                                  rule cards loaded in batches; codename cards
#                                  kept in one cache entry
# With both false, rendering takes the stock code paths.
module Cardio
  module BatchedNests
    # card/lib/card/cache/all.rb: a saved codename card expires the codename
    # card entry
    module CacheAll
      def expire cache_type=nil
        result = super
        cache_class = cache_class_from_type cache_type
        Card::Cache.expire_codename_cards cache_class if cache_class && codename_card?
        result
      end

      private

      # has a codename, or is one of the cards the codename cache lists
      def codename_card?
        codename.present? || (id && Card::Codename[id])
      end
    end

    # card/lib/card/codename.rb: Codename.reset_cache expires the codename
    # card entry
    module CodenameClass
      def reset_cache
        ::Card::Cache.expire_codename_cards
        super
      end
    end

    # card/lib/card/fetch/retrieve.rb and card/lib/card/fetch/store.rb
    module Fetch
      def retrieve_existing
        return unless mark.present?

        prefetch_rule
        super
      end

      # a rule card fetched by id is loaded together with its set
      def prefetch_rule
        Card::Cache.prefetch_rule mark if mark_type == :id && !look_in_trash?
      end

      def retrieve_from_db
        query = retrieval_from_db_query
        @card = query ? Card::Cache.retrieve_from_db(query) : nil
        @fresh_from_db = true if card.present? && !card.trash
        card
      end

      def update_cache
        return unless update_cache?

        prep_modules unless skip_modules?
        Card.write_to_cache card, local_only?
      end

      def prep_modules
        Card::Cache.prefetch_for_patterns [card] if fresh_from_db?
        card.prep_modules_for_caching
      end
    end

    # card/lib/card/format/content.rb: the references in a content are loaded
    # before its chunks are processed
    module Content
      def process_content(override_content=nil, content_opts=nil, &)
        content_obj = content_object override_content, content_opts
        prefetch_references content_obj
        content_obj.process_chunks(&)
        content_obj.to_s
      end
    end

    # card/lib/card/lexicon.rb
    module LexiconClass
      def update card
        super
        expire_codename_lexes card
      end

      def delete card
        super
        expire_codename_lexes card
      end

      private

      def id_to_lex id
        prefetch_codename_lexes id
        super
      end
    end

    # card-mod-collection set/all/item.rb: list items loaded in one batch
    module Item
      def known_item_cards args={}
        prefetch_item_cards item_names(args)
        super
      end

      def all_item_cards args={}
        prefetch_item_cards(args[:item_names] || item_names(args))
        super
      end

      # load the item cards in one batch before they are fetched one at a time
      def prefetch_item_cards names
        return unless Card.config.prefetch_machinery && names.size > 1

        Card::Cache.prefetch_names(names.map(&:to_name).select { |n| prefetchable_item? n })
      end

      def prefetchable_item? name
        name.absolute? && name.valid? && !name.s.start_with?("~", ":")
      end
    end

    # card-mod-rules set/type/set/html_views/rule_lists.rb: a set's rule cards
    # for the listed settings loaded in one batch
    module RuleLists
      def category_accordion_item(view, &)
        prefetch_rules(Card::Setting.groups.keys.flat_map { |key| card.group_settings key })
        super
      end

      def category_setting_list_items(category, item_view, options={})
        prefetch_rules card.category_settings(category)
        super
      end

      # load the set's rule cards for these settings in one batch
      def prefetch_rules settings
        return unless Card.config.prefetch_machinery

        Card::Cache.prefetch_fields [card], settings.compact
      end
    end

    # card-mod-script set/type_plus_right/set/script.rb
    module ScriptTags
      define_method Card::Set::Format.view_method_name(:remote_script_tags) do
        mod_script_cards = card.item_cards
        if Card.config.prefetch_machinery
          Card::Cache.prefetch_fields mod_script_cards, :group_remote
        end
        mod_script_cards.map do |mod|
          remote_script_tags mod
        end.compact
      end
    end

    # card-mod-style set/self/style_mods.rb
    module StyleTags
      define_method Card::Set::Format.view_method_name(:remote_style_tags) do
        mod_style_cards = card.item_cards
        if Card.config.prefetch_machinery
          Card::Cache.prefetch_fields mod_style_cards, :group_remote
        end
        mod_style_cards.map do |mod_style_card|
          nest mod_style_card, view: :remote_include_tags
        end.select(&:present?)
      end
    end

    SET_PATCHES = {
      "Card::Set::All::Item" => Item,
      "Card::Set::Type::Set::HtmlViews::RuleLists::HtmlFormat" => RuleLists,
      "Card::Set::TypePlusRight::Set::Script::HtmlFormat" => ScriptTags,
      "Card::Set::Self::StyleMods::HtmlFormat" => StyleTags
    }.freeze

    class << self
      # Called from config/late, after the mods' sets are loaded.
      def install!
        install_core
        install_sets
      end

      private

      def install_core
        return if @core_installed

        # card/lib/card/cache/class_methods.rb includes Prefetch,
        # PrefetchRelated, KnownRows and PrefetchRules in turn; one include
        # listing them last-first gives the same ancestor order
        Card::Cache::ClassMethods.include Card::Cache::PrefetchRules,
                                          Card::Cache::KnownRows,
                                          Card::Cache::PrefetchRelated,
                                          Card::Cache::Prefetch
        Card::Cache::All.prepend CacheAll
        Card::Codename.singleton_class.prepend CodenameClass
        Card::Fetch.prepend Fetch
        # card/lib/card/format/nesting.rb includes Nesting::Prefetch
        Card::Format::Nesting.include Card::Format::Nesting::Prefetch
        Card::Format::Content.prepend Content
        Card::Lexicon.extend Card::Lexicon::Prefetch
        Card::Lexicon.singleton_class.prepend LexiconClass
        @core_installed = true
      end

      # sets are rebuilt when they reload, so each set module is patched once
      def install_sets
        SET_PATCHES.each do |name, patch|
          set_module = name.safe_constantize
          next unless set_module
          next if set_module.ancestors.include? patch

          set_module.prepend patch
        end
      end
    end
  end
end
