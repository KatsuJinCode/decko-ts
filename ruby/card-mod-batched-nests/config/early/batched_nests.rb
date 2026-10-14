# Defaults for the two settings, as card/lib/cardio/railtie.rb sets them in the
# proposed decko-commons/decko change. An app's own setting wins.
Cardio.config.tap do |c|
  c.prefetch_nests = true unless c.respond_to? :prefetch_nests
  c.prefetch_machinery = true unless c.respond_to? :prefetch_machinery
end
