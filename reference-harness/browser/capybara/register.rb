# frozen_string_literal: true

# Load with `cucumber -r <this file>` (or require it from a spec helper) to
# run JavaScript scenarios in a hidden, installed browser instead of
# Selenium with a downloaded WebDriver binary.

require_relative "playwright_driver"

Capybara.register_driver(:playwright) { |app| Capybara::Playwright::Driver.new(app) }
Capybara.javascript_driver = :playwright
Capybara.default_max_wait_time = Integer(ENV.fetch("CAPYBARA_WAIT", "5"))

# Decko's upload steps look for their sample files beside the decko gem's
# features (attachment_steps.rb find_file), which an installed gem does not
# ship. When the features come from a source checkout, look there too.
# Defined from a Before hook, so it replaces the step files' own definition
# whatever order cucumber loaded them in.
if ENV["DECKO_FEATURES_DIR"] && respond_to?(:Before, true)
  Before do
    next if Object.private_method_defined?(:harness_find_file)

    Object.class_eval do
      private

      def harness_find_file filename
        local = File.join(ENV.fetch("DECKO_FEATURES_DIR"), "support", filename)
        return local if File.exist?(local)

        roots = "{#{Cardio.root}/mod/**,#{Cardio.gem_root}/mod/**,#{Decko.gem_root}}"
        paths = Dir.glob(File.join(roots, "features", "support", filename))
        raise ArgumentError, "couldn't find file '#{filename}'" if paths.empty?

        paths.first
      end
      alias_method :find_file, :harness_find_file
    end
  end
end

# Decko's cucumber support loads the webdrivers gem, which fetches a
# WebDriver binary when a Selenium driver starts. Nothing here starts one;
# should anything try, it fails instead of downloading.
if defined?(Webdrivers)
  %w[Chromedriver Edgedriver Geckodriver IEdriver].each do |name|
    next unless Webdrivers.const_defined?(name)

    Webdrivers.const_get(name).define_singleton_method(:update) do |*|
      raise "WebDriver download refused: the harness drives an installed browser"
    end
  end
end
