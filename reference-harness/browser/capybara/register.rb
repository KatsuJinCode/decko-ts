# frozen_string_literal: true

# Load with `cucumber -r <this file>` (or require it from a spec helper) to
# run JavaScript scenarios in a hidden, installed browser instead of
# Selenium with a downloaded WebDriver binary.

require_relative "playwright_driver"

Capybara.register_driver(:playwright) { |app| Capybara::Playwright::Driver.new(app) }
Capybara.javascript_driver = :playwright
Capybara.default_max_wait_time = Integer(ENV.fetch("CAPYBARA_WAIT", "5"))
