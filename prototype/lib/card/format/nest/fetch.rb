class Card
  class Format
    class Nest
      # Fetch card for a nest
      #
      # PROTOTYPE PATCH (KatsuJinCode/decko-ts #9 / docs/ruby-dividend-cte.md):
      # the original fetch_card is unchanged. The prefetch lives in
      # Card::Format::Nest::Prefetch (prefetch.rb) and runs once at the top
      # of Card::Format::Render#render! (patched in render.rb). The per-
      # inclusion fetch_card here is expected to be a warm-cache hit after
      # the prefetch; if the prefetch wasn't run (older caller, or the
      # prefetch opt-out), fetch_card still works depth-first exactly as
      # before. No behavior change for non-prefetched code paths.
      module Fetch
        require_relative "prefetch"
        include Prefetch

        private

        def fetch_card cardish
          case cardish
          when Card            then cardish
          when Symbol, Integer then Card.fetch cardish
          when "_", "_self"    then format.context_card
          else                      new_card cardish
          end
        rescue Card::Error::CodenameNotFound
          not_found_codename cardish
        end

        def not_found_codename cardish
          @view = :not_found
          c = Card.new name: Array.wrap(cardish).join(Card::Name.joint).to_s
          c.errors.add :codename, not_found_codename_error(cardish)
          c
        end

        def not_found_codename_error codename
          ::I18n.t :lib_exception_unknown_codename, codename: codename
        end

        def new_card cardish
          view_opts[:nest_name] = Card::Name[cardish].to_s
          Card.fetch cardish, new: new_card_args
        end

        def new_card_args
          args = { name: view_opts[:nest_name] }
          args[:type] = view_opts[:type] if view_opts[:type]
          args.merge(new_supercard_args)
              .merge(new_main_args)
              .merge(new_content_args)
        end

        def new_supercard_args
          # special case.  gets absolutized incorrectly. fix in name?
          return {} if view_opts[:nest_name].strip.blank?

          { supercard: format.context_card }
        end

        def new_main_args
          nest_name = view_opts[:nest_name]
          return {} unless nest_name =~ /main/

          { name: nest_name.gsub(/^_main\+/, "+"),
            supercard: format.root.card }
        end

        def new_content_args
          content = content_from_shorthand_param || content_from_subcard_params
          content ? { content: content } : {}
        end

        def content_from_shorthand_param
          # FIXME: this is a lame shorthand; could be another card's key
          # should be more robust and managed by Card::Name
          shorthand_param = view_opts[:nest_name].tr "+", "_"
          Env.params[shorthand_param]
        end

        def content_from_subcard_params
          Env.params.dig "subcards", view_opts[:nest_name], "content"
        end
      end
    end
  end
end
