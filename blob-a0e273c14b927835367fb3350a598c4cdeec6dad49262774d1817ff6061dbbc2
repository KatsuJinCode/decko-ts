# Defaults for the settings, as card/lib/cardio/railtie.rb sets them in the
# proposed decko-commons/decko change. An app's own setting (including an
# explicit `false` set in config/application.rb before this initializer runs)
# always wins.
Cardio.config.tap do |c|
  {
    prefetch_nests: true,
    prefetch_machinery: true,
    live_page_bundles: false,
    lazy_rule_watermarks: false
  }.each do |key, default|
    c.singleton_class.attr_reader(key) unless c.respond_to?(key)
    c.singleton_class.attr_writer(key) unless c.respond_to?("#{key}=")
    val = c.public_send(key)
    c.public_send("#{key}=", default) if val.nil?
  end
end
