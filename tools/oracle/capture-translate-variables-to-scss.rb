# frozen_string_literal: true

# Oracle capture for event :translate_variables_to_scss (entry E-A32 of the
# completeness register's events section; landed on
# port/events-middle-third-20261019)
# (card-mod-bootstrap-0.20.0 set/type_plus_right/bootswatch_skin/colors.rb:116-146).
#
# The harness loads the GEM'S OWN METHOD SOURCE verbatim (extracted from the
# pinned gem file below), binds it to a stub `content` accessor + a stub
# Card::Env.params, and runs the event body's two replace_values calls over
# test vectors. The captured outputs are the golden bytes the TS port's
# tests pin (tests/card/mod-loader/card-mod-bootstrap-translate-variables.test.ts).

require "json"

GEM_FILE = File.expand_path(
  "../../../../decko-ruby-oracle-gems/ruby/3.4.0/gems/" \
  "card-mod-bootstrap-0.20.0/set/type_plus_right/bootswatch_skin/colors.rb",
  __FILE__
)

source = File.read(GEM_FILE)

# The gem's exact segments, extracted verbatim by line range:
#   VARIABLE_NAMES  colors.rb:3-9
#   event body      colors.rb:116-119 (replace_values :colors / :theme_colors)
#   private methods colors.rb:36-38 (definition_regex) + 123-136 (replace_values /
#   variable_values_from_params)
def extract(source, start_line, end_line)
  source.lines[(start_line - 1)...end_line].join
end

variable_names_src = extract(source, 3, 9)
methods_src = extract(source, 36, 38) + extract(source, 123, 136) # definition_regex + replace_values + variable_values_from_params

harness = <<~RUBY
  # frozen_string_literal: true

  module Card
    # Rails' Env.params is HashWithIndifferentAccess: symbol and string lookups
    # hit the same entries. The stub reproduces the two operations the gem's
    # code performs: Env.params[group] and .slice(*names).
    class IndifferentParams < Hash
      def self.wrap(value)
        case value
        when Hash
          h = new
          value.each_pair { |k, v| h[k.to_s] = wrap(v) }
          h
        else
          value
        end
      end

      def [](key)
        super(key.to_s)
      end

      def slice(*keys)
        super(*keys.map(&:to_s))
      end
    end

    class Env
      def self.params
        @params ||= IndifferentParams.new
      end

      def self.params=(hash)
        @params = IndifferentParams.wrap(hash)
      end
    end
  end

  # The gem resolves Env lexically inside Card (the set module lives in
  # Card::Set::*), so the oracle module nests under Card too.
  module Card
  module TranslateOracle
    #{variable_names_src}

    attr_accessor :content

    #{methods_src}

    def run_event(params, content)
      Card::Env.params = params
      @content = content
      # colors.rb:116-119 — the event body, verbatim:
      replace_values :colors
      replace_values :theme_colors
      @content
    end
  end
  end
RUBY

# The gem's methods read `content` off self and call Env.params — the harness
# object includes the verbatim source, so the gem's own lines execute.
# (The heredoc carries the gem's lines verbatim; the eval is what loads them.)
eval(harness, TOPLEVEL_BINDING.dup, GEM_FILE)

oracle_class = Class.new do
  include Card::TranslateOracle
end

VECTORS_FILE = File.expand_path("../tests/card/mod-loader/fixtures/ruby-translate-variables-goldens.json", __FILE__)
# vectors live beside this script; the goldens the TS test pins are the byte
# output of this run, committed at
# tests/card/mod-loader/fixtures/ruby-translate-variables-goldens.json
vectors = JSON.parse(File.read(File.join(__dir__, "translate-variables-vectors.json")))

out = vectors.map do |vector|
  instance = oracle_class.new
  result = instance.run_event(vector["params"], vector["content"])
  { "name" => vector["name"], "result" => result }
end

puts JSON.pretty_generate(out)
