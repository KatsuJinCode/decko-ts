# oracle-capture-recaptcha-controller-include-ruby.rb - the PINNED recaptcha
# mod's controller include and its keying ladder.
#
# WHY THIS SCRIPT EXISTS: the completeness register's B14 row grades the port
# on the recaptcha mod's controller include -
# `CardController.include ::Recaptcha::Verify`
# (card-mod-recaptcha-0.20.0/config/late/recaptcha.rb:70) - and on the
# keying that include rides: the site/secret config comes from card
# content, from the config, from the deprecated config name, or from the
# development defaults (the same file at :26-68).
#
# THE MECHANISM, from the PINNED files:
#
#   the include  config/late/recaptcha.rb:70
#                  CardController.include ::Recaptcha::Verify
#                The pinned gem's Verify module
#                (recaptcha-4.13.2/lib/recaptcha/verify.rb:5-53) carries
#                verify_recaptcha and verify_recaptcha!, so after the
#                include the controller can verify a recaptcha response.
#                The include is the DECK's own line, and it is REDUNDANT in
#                a Rails boot: the gem's own railtie
#                (recaptcha-4.13.2/lib/recaptcha/railtie.rb:10-13) already
#                includes Verify into ActionController::Base through
#                ActiveSupport.on_load(:action_controller), and
#                CardController is a subclass of it. The capture measures
#                both facts.
#
#   the keying   config/late/recaptcha.rb:26-34 and :39-44
#                  def recaptcha_setting_value setting, full_setting
#                    card_value(full_setting) ||             # card content
#                      config_value(full_setting) ||         # application.rb
#                      config_value(@deprecated[setting]) || # deprecated name
#                      @defaults[setting]
#                  end
#                FOUR rungs, in that order. The capture executes the ladder
#                four times and records WHICH rung won - never a value.
#
#   the arming   the same file's using_defaults? (:32-34) and the card
#                gem's recaptcha_keys? (set/all/recaptcha.rb:46-48)
#                decide whether the deck is running on the development
#                pair, and whether the guard is armed at all.
#
# NO VALUE LEAVES THIS CAPTURE. The development defaults are deployment
# configuration, so the fixture records the defaults' KEYS and never their
# values; every keying case records the winning SOURCE and the
# using_defaults? boolean, and the values it compares are the capture's own
# placeholders.
#
# THE BOOT PATH, executed: the pinned recaptcha gem's own entry point takes
# the Rails railtie branch when Rails is defined
# (recaptcha-4.13.2/lib/recaptcha.rb:7-12), and the railtie inherits
# Rails::Railtie, which the loading rig's Rails stand-in does not define.
# The capture therefore supplies the Railtie constant, lets the PINNED
# gem's own on_load hook run (ActiveSupport.run_load_hooks over the rig's
# ActionController::Base, the way a Rails boot fires it), and only then
# evaluates the PINNED deck mod's file, whose last line is the include.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-recaptcha-controller-include-ruby.rb \
#     > fixtures/captured/recaptcha-controller-include-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The boot path and the case list are fixed, so a re-run on the
# same gemset is byte-stable.

require_relative "oracle-capture-pinned-deck-harness-ruby"

PinnedDeck.load_pinned_libs!
# ActiveSupport's load hooks are the whole of what this row needs from it
# (the deck mod file registers an :after_card hook, and the pinned gem's
# railtie registers an :action_controller hook), so the hooks file is
# loaded on its own - the full active_support needs the whole Rails
# i18n/concurrent stack, which this rig has no use for.
require "active_support/lazy_load_hooks"
# The pinned card_value asks `value.present?` (config/late/recaptcha.rb:56),
# so ActiveSupport's blank extension is needed for the card rung.
require "active_support/core_ext/object/blank"

# ---------------------------------------------------------------------------
# the PINNED recaptcha gem's own boot path
# ---------------------------------------------------------------------------

# The rig's Rails stand-in has no Railtie, and the PINNED gem's railtie
# inherits it (recaptcha-4.13.2/lib/recaptcha/railtie.rb:4). The constant
# is supplied here so the PINNED gem's own entry point can take its Rails
# branch; the gem's own files are the ones that run.
class Rails::Railtie; end

require "recaptcha"

# The PINNED gem's own railtie hook, fired the way a Rails boot fires it:
# ActiveSupport.on_load(:action_controller) { require 'recaptcha/verify';
# include Recaptcha::Verify } (railtie.rb:10-13). The block is the PINNED
# gem's own; the run_load_hooks call is the boot step the rig has to
# perform for it.
ActiveSupport.run_load_hooks(:action_controller, ActionController::Base)

# The PINNED DECK's own controller, loaded (the deck's controller class
# exists before the mod's include line runs).
PinnedDeck.load_pinned_controller!

# The PINNED deck mod's own file, evaluated: its last line is the include
# this row is about.
PinnedDeck.eval_pinned("card-mod-recaptcha-0.20.0/config/late/recaptcha.rb")

include_row = {
  "controllerIncludesVerify" => CardController.include?(::Recaptcha::Verify),
  "verifyRecaptchaOwner" => CardController.instance_method(:verify_recaptcha).owner.to_s,
  "verifyRecaptchaBangOwner" => CardController.instance_method(:verify_recaptcha!).owner.to_s,
  # The gem's own railtie already included Verify into the base class, so
  # the deck's include is redundant in a Rails boot - and it still runs.
  "baseIncludesVerify" => ActionController::Base.include?(::Recaptcha::Verify),
  "includeLine" => "CardController.include ::Recaptcha::Verify"
}

# ---------------------------------------------------------------------------
# the keying ladder, executed, with no value leaving the capture
# ---------------------------------------------------------------------------

# The PINNED card gem's own core extensions, so the pinned card_value can
# ask the setting symbol for its card (PersistentIdentifier#card ->
# Card[self]). The card gem's initializer does the include step
# (config/initializers/core_extensions.rb:11, `::Symbol.include Symbol`);
# the capture performs that one step, because the initializer's other lines
# need the rest of the card gem's core extensions, which are not this row's
# subject.
PinnedDeck.eval_pinned("card-1.110.0/config/initializers/01_core_extensions/persistent_identifier.rb")
PinnedDeck.eval_pinned("card-1.110.0/config/initializers/01_core_extensions/symbol.rb")
Symbol.include CoreExtensions::Symbol

# The card the codename lookup answers: a stand-in for the pinned card
# gem's model, carrying the CONTENT the pinned card_value asks for.
class ContentCardDouble
  attr_reader :content

  def initialize(content)
    @content = content
  end
end

# The codename registry, stood in for: the pinned card_value guards its
# card read behind two Codename.exist? checks (config/late/recaptcha.rb:52-53,
# "prevent breakage in migrations"), and the pinned registry needs the
# database this rig does not have. The stand-in answers a CONFIGURED list.
class Card
  class Codename
    class << self
      attr_accessor :existing

      def exist?(codename)
        (existing || []).include?(codename.to_sym)
      end
    end
  end
end

# The card lookup, stood in for: the rig's own Card[] answers a RuleCard
# (which carries db_content, not the content the pinned card_value asks
# for), so the capture prepends a lookup that answers a content-bearing
# double for the configured names and records every lookup.
module CardContentLookup
  def [](mark)
    @lookups ||= []
    @lookups << mark
    entry = (lookup_table || {})[mark.to_s]
    entry.nil? ? nil : ContentCardDouble.new(entry)
  end
end

Card.singleton_class.prepend(CardContentLookup)

# The development defaults, read from the PINNED module's own table. The
# VALUES never leave the capture: only the keys are recorded.
DEFAULTS = RecaptchaCard.instance_variable_get(:@defaults)
DEPRECATED = RecaptchaCard.instance_variable_get(:@deprecated)

# One keying case: the PINNED ladder runs, and the capture records WHICH
# rung won. The placeholders are the capture's own; the defaults are
# compared, never printed.
def keying_case(label, site_key:, secret_key:, deprecated_site_key: nil, card_content: nil,
                codenames: [])
  Cardio.config.recaptcha_site_key = site_key
  Cardio.config.recaptcha_secret_key = secret_key
  Cardio.config.recaptcha_public_key = deprecated_site_key
  Cardio.config.recaptcha_private_key = nil
  Card::Codename.existing = codenames
  Card.lookup_table = card_content.nil? ? {} : { "recaptcha_site_key" => card_content }

  error = nil
  begin
    RecaptchaCard.load_recaptcha_config(:site_key)
  rescue StandardError => e
    error = "#{e.class}: #{e.message}"
  end

  resolved = Cardio.config.recaptcha_site_key
  source =
    if error
      "raised"
    elsif card_content && resolved == card_content
      "cardContent"
    elsif site_key && resolved == site_key
      "config"
    elsif deprecated_site_key && resolved == deprecated_site_key
      "deprecatedConfig"
    else
      "default"
    end

  {
    "label" => label,
    "error" => error,
    "source" => source,
    "usingDefaults" => RecaptchaCard.using_defaults?,
    "codenamesPresent" => codenames.map(&:to_s),
    "cardLookups" => (Card.instance_variable_get(:@lookups) || []).map(&:to_s)
  }
end

keying_rows = [
  keying_case("nothing configured: the development default wins",
              site_key: nil, secret_key: nil),
  keying_case("the config name set: the config wins over the default",
              site_key: "SITE-FROM-CONFIG", secret_key: "SECRET-FROM-CONFIG"),
  keying_case("only the DEPRECATED config name set: the deprecated name wins over the default",
              site_key: nil, secret_key: nil, deprecated_site_key: "SITE-FROM-DEPRECATED"),
  keying_case("the card content present: the card content wins over every config name",
              site_key: "SITE-FROM-CONFIG", secret_key: "SECRET-FROM-CONFIG",
              card_content: "SITE-FROM-CARD",
              codenames: %i[recaptcha_settings recaptcha_site_key])
]

# The pinned sources, quoted with line numbers. The development defaults
# (lines 20-23) are NOT quoted: they are deployment configuration, and no
# value from them reaches the fixture.
mod_source = PinnedDeck.pinned_lines("card-mod-recaptcha-0.20.0/config/late/recaptcha.rb")
include_source = mod_source.select { |row| row["line"].between?(61, 70) }
keying_source = mod_source.select { |row| row["line"].between?(15, 19) || row["line"].between?(25, 58) }
verify_source = PinnedDeck.pinned_lines("recaptcha-4.13.2/lib/recaptcha/verify.rb")
                          .select { |row| row["line"].between?(5, 21) || row["line"].between?(55, 57) }
railtie_source = PinnedDeck.pinned_lines("recaptcha-4.13.2/lib/recaptcha/railtie.rb")
                           .select { |row| row["line"].between?(10, 13) }
keys_source = PinnedDeck.pinned_lines("card-mod-recaptcha-0.20.0/set/all/recaptcha.rb")
                         .select { |row| row["line"].between?(46, 48) }

puts JSON.pretty_generate(
  "row" => "reg-routes-B14",
  "gemset" => "decko-0.20.0 + card-1.110.0 + card-mod-recaptcha-0.20.0 + recaptcha-4.13.2 (pinned)",
  "include" => include_row,
  "keying" => keying_rows,
  "defaultsKeys" => DEFAULTS.keys.map(&:to_s),
  "deprecatedNames" => DEPRECATED.transform_values(&:to_s),
  "rigArtifacts" => [
    "the codename registry is stood in for: the pinned card_value guards its card read behind two Codename.exist? checks (config/late/recaptcha.rb:52-53) and the pinned registry needs the database this rig does not have. The stand-in answers a CONFIGURED list, and the capture records that list and the card lookups it caused.",
    "the card lookup is stood in for: the rig's own Card[] answers a RuleCard, which carries db_content and not the content the pinned card_value asks for, so the capture prepends a lookup that answers a content-bearing double.",
    "the Rails::Railtie constant is supplied by the capture, because the rig's Rails stand-in has none and the PINNED gem's railtie inherits it; the gem's own files are the ones that run, and the PINNED gem's own on_load hook is fired the way a Rails boot fires it."
  ],
  "sources" => {
    "includeAndBoot" => include_source,
    "keying" => keying_source,
    "pinnedVerify" => verify_source,
    "pinnedRailtie" => railtie_source,
    "pinnedKeysGuard" => keys_source
  }
)
