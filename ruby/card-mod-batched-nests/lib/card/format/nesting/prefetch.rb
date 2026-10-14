# Batched nest loading for card 1.110.0. This file is card/lib/card/format/nesting/prefetch.rb as written
# in the proposed decko-commons/decko change (prefetch-combined, based on v0.20.0).

class Card
  class Format
    module Nesting
      # Loads the cards a content nests and links to before its chunks are
      # rendered one at a time, so that each nest and link finds its card in the
      # cache. The cards those cards nest are loaded the same way, one level at
      # a time, so a nest tree costs a few queries per level instead of a few
      # queries per card.
      module Prefetch
        NEST_NAME_RE = /\A\s*([^|]*)/

        private

        def prefetch_references content_obj
          return unless Card.config.prefetch_nests

          names = content_obj.each_chunk.filter_map { |chunk| reference_name chunk }
          Card.config.max_depth.times do
            break if names.empty?

            names = Card::Cache.prefetch_names(names).flat_map { |c| nested_names c }
          end
        end

        def reference_name chunk
          return unless chunk.is_a?(Card::Content::Chunk::Reference) &&
                        chunk.name.is_a?(String)

          prefetchable chunk.referee_name
        rescue Card::Error
          nil
        end

        # names nested in a card's stored content, as they will be fetched when
        # that content is rendered
        def nested_names card
          names = []
          Card::Content::Chunk::Nest.gsub card.db_content.to_s do |nest|
            raw = nest.gsub(/<[^>]*>/, "")[NEST_NAME_RE, 1].strip
            names << prefetchable(raw.to_name.absolute_name(card.name)) if plain? raw
            nest
          end
          names.compact
        end

        # leave out comments, ids, codenames and names that need a context
        def plain? raw
          raw.present? && !raw.start_with?("#", "~", ":")
        end

        def prefetchable name
          name if name.present? && name.absolute? && name.valid?
        end
      end
    end
  end
end
