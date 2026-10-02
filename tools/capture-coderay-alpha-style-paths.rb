#!/usr/bin/env ruby
# Oracle capture for the alpha theme's kind-PATH style lookup
# (lane templatenest-coderay).
#
# encoders/html.rb resolves a token through TWO steps:
#
#   css_class = TokenKinds[kinds.first]        # token_kinds.rb
#   style     = css.get_style_for_css_classes( # encoders/html/css.rb
#                 kinds.map { |c| TokenKinds[c] })
#
# and a nil span means NO WRAPPER while "" means `<span style="">`. Both
# outcomes are bytes, so the port has to reproduce them exactly - which is
# what this dump pins. Writes one JSON file; the vitest gate
# (tests/card/render/code-highlighting/html-scanner-span-fidelity.test.ts)
# asserts the TS lookup against it.

require "json"
require "coderay"

OUT_PATH =
  "C:/localProjects/decko-ts-lane-templatenest/fixtures/captured/coderay/alpha-style-kind-paths.json"

css = CodeRay::Encoders::HTML::CSS.new :alpha

def class_for kind
  # token_kinds.rb's Hash.new(false): an unregistered kind reads false.
  CodeRay::TokenKinds[kind.to_sym]
end

KINDS = %w[
  error tag doctype inline inline_delimiter comment entity preprocessor
  attribute_name attribute_value string key content delimiter char modifier
  integer float value constant class id definition function keyword
  reserved predefined predefined_type predefined_constant namespace property
  color directive escape annotation label pseudo_class exception docstring
  decorator done imaginary debug change delete head insert eyecatcher
  filename binary local_variable instance_variable class_variable
  global_variable symbol variable type hex octal regexp map shell important
  include operator space plain ident unknown
].freeze

PATHS = [
  # one-class paths: the depth-0 rule, or the "family with no bare rule"
  # case that must resolve to nil.
  *KINDS.map { |k| [k] },
  # the paths the html scanner actually builds: a token inside a group.
  %w[content string], %w[delimiter string], %w[char string],
  %w[modifier string], %w[error string], %w[space string],
  %w[plain string], %w[content key], %w[delimiter key], %w[char key],
  %w[inline_delimiter string], %w[delimiter inline],
  # deeper-than-two paths the CSS/JS sub-scanners build inside :inline.
  %w[content shell], %w[delimiter shell], %w[content regexp],
  %w[delimiter regexp], %w[content map], %w[delimiter map],
  %w[content char], %w[delimiter char], %w[char key],
  %w[content function], %w[delimiter function],
  # a family the theme never styles at all.
  %w[no_such_class], %w[no_such_class string],
].freeze

rows = PATHS.map do |kinds|
  classes = kinds.map { |k| class_for(k) }
  {
    "kinds" => kinds,
    "classes" => classes,
    # get_style_for_css_classes returns '' when the first class has no
    # rules and nil when the family has none at this depth. JSON has no
    # nil-vs-empty distinction once serialized through a string, so the
    # value is tagged explicitly.
    "style" => css.get_style_for_css_classes(classes),
    "style_is_nil" => css.get_style_for_css_classes(classes).nil?,
  }
end

File.write OUT_PATH, JSON.pretty_generate(rows)
puts "wrote #{OUT_PATH} (#{rows.length} kind paths)"
puts "sample: #{rows.select { |r| r['kinds'] == ['content', 'string'] }.first.inspect}"
puts "sample: #{rows.select { |r| r['kinds'] == ['content'] }.first.inspect}"
puts "sample: #{rows.select { |r| r['kinds'] == ['no_such_class'] }.first.inspect}"
