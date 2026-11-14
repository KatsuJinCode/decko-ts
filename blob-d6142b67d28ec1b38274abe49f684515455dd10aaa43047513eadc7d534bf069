# Kramdown oracle regeneration for card-mod-markdown.test.ts.
#
# Emits the REAL kramdown bytes for a list of markdown sources, using the
# exact option hash the Ruby view passes (card-mod-markdown-0.20.0
# set/type/markdown.rb:7-12):
#
#   Kramdown::Document.new(content,
#                          syntax_highlighter: :coderay,
#                          syntax_highlighter_opts: {
#                            line_numbers: false,
#                            default_lang: :ruby
#                          }).to_html
#
# Usage (Ruby 3.3 with kramdown-2.5.2, kramdown-syntax-coderay-1.0.1,
# coderay-1.1.3 installed):
#   ruby tests/card/mod-loader/oracle-capture-markdown-views.rb cases.json
# where cases.json is a JSON array of markdown source strings. Output on
# stdout: a JSON array of { source, html } objects — byte-compare `html`
# against the ORACLE table pinned in card-mod-markdown.test.ts to
# regenerate/verify the oracle pins.

require "json"
require "kramdown"
require "kramdown-syntax-coderay"

sources = JSON.parse(File.read(ARGV[0]))
unless sources.is_a?(Array)
  warn "input must be a JSON array of strings"
  exit 2
end

out = sources.map do |source|
  html = Kramdown::Document.new(
    source,
    syntax_highlighter: :coderay,
    syntax_highlighter_opts: {
      line_numbers: false,
      default_lang: :ruby
    }
  ).to_html
  { "source" => source, "html" => html }
end

puts JSON.pretty_generate(out)
