# What stock Ruby Decko does when :debug_server_error renders.
#
# Run under `decko runner` in the oracle app (tools/oracle/semantics-run-ruby.mjs)
# against a private copy of the capture deck. Nothing is written.
#
# card-mod-format set/all/html/error.rb builds BetterErrors::ErrorPage in the
# view body. better_errors reaches a deck only through card-mod-monkey (the
# development group); a stock Gemfile (decko + card-mod-defaults) does not
# bundle it, so the constant is undefined.
Card::Auth.signin Card::AnonymousID
puts "BUNDLED better_errors=#{Gem.loaded_specs.key?('better_errors')}"
puts "DEFINED BetterErrors=#{defined?(BetterErrors).inspect}"
puts "RAILS_ENV=#{Rails.env} raise_all_rendering_errors=#{Card.config.raise_all_rendering_errors.inspect}"

card = Card["Home"]

# The focal render: a root format renders the view itself (loud_error).
begin
  out = card.format(:html).render(:debug_server_error)
  puts "FOCAL rendered #{out.to_s[0, 300].inspect}"
rescue Exception => e # rubocop:disable Lint/RescueException
  puts "FOCAL raised #{e.class}: #{e.message}"
  puts "FOCAL card_errors=#{card.errors.full_messages.inspect}"
end
card.errors.clear

# A nest: the subformat is not focal (quiet_error).
puts "NESTED #{card.format(:html).nest('Home', view: :debug_server_error).inspect}"

# With a current server error, as the error report scope sets it.
Card::Error.current = Card::Error::ServerError.new("boom")
begin
  out = card.format(:html).render(:debug_server_error)
  puts "CURRENT rendered #{out.to_s[0, 300].inspect}"
rescue Exception => e # rubocop:disable Lint/RescueException
  puts "CURRENT raised #{e.class}: #{e.message}"
end
card.errors.clear
puts "CURRENT NESTED #{card.format(:html).nest('Home', view: :debug_server_error).inspect}"

# The error class a server error report picks this view for.
puts "SERVER_ERROR_VIEW debugger_on=#{Card::Error::ServerError.debugger_on?.inspect} view=#{Card::Error::ServerError.view.inspect}"
