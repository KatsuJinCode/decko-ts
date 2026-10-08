#!/usr/bin/env ruby
# Oracle capture for lane templatenest-coderay.
#
# Two mechanisms are pinned here:
#
#   (1) card-mod-layout-0.20.0 set/type/layout_type.rb:12-18
#         format :html do
#           view :core do
#             with_nest_mode :template do
#               process_content ::CodeRay.scan(_render_raw, :html).div
#             end
#           end
#         end
#       The CodeRay bytes are a pure function of the card content, so they
#       are captured here directly; the `with_nest_mode :template` half is
#       the chunker + :template_nest view, which lives in the card gem and
#       needs a Rails runtime - its byte consequence (a nest re-emitted as
#       its own `{{nest_syntax}}` literal) is captured by re-emitting the
#       chunked nests in the same order the parser would, which is what
#       the TS test asserts against the full page oracle.
#
#   (2) CodeRay's html scanner span fidelity: encoders/html.rb's
#       @span_for_kinds[kind-path] lookup, driven by TokenKinds and the
#       alpha theme's TOKEN_COLORS stylesheet. Every token kind the html
#       scanner can emit is exercised by the cases below.
#
# Writes fixtures/captured/coderay/*.html next to the existing captures.

require "json"
require "fileutils"
require "sqlite3"
require "coderay"

GATE_DIR =
  File.expand_path("../fixtures/captured/coderay", __dir__)
# Real oracle bytes that the port does NOT reproduce, kept beside the gates
# so the divergence has bytes on disk instead of a claim in a comment. The
# <script>/<style> body sub-scanners (coderay scanners/javascript.rb +
# scanners/css.rb, reached from html.rb:203-206 and 237-244) are not
# ported; the engine emits the body as one :ident token, which is exact
# for an identifier-only body (every corpus fixture) and coarse for
# anything else.
DIVERGENCE_DIR =
  File.expand_path("../fixtures/captured/coderay-known-divergence", __dir__)
FileUtils.mkdir_p GATE_DIR
FileUtils.mkdir_p DIVERGENCE_DIR

# The corpus card 22747 "Default Layout" (type_id 11746 = Layout) - the
# card whose cardtype is layout_type, i.e. the one `with_nest_mode
# :template` guards. Read live from the raw ground-truth sqlite (the same
# db the page oracle rendered from) so the capture cannot drift from it.
def corpus_22747_content
  db = File.expand_path("../tmp/raw-ground-truth/bench-corpus-raw.sqlite3", __dir__)
  conn = SQLite3::Database.new db, readonly: true
  content = conn.get_first_value "SELECT content FROM cards WHERE id = 22747"
  conn.close
  raise "card 22747 missing from #{db}" unless content

  content
end

CARD_22747_CONTENT = corpus_22747_content

# Every branch the html scanner can reach, one per case, so the TS port's
# kind->span table is pinned per kind rather than per shape.
CASES = {
  # the card 22747 layout body - attribute_name + string group delimiters
  # and content, :plain between tags, and the nest marks that stay
  # literal under with_nest_mode :template.
  "layout-type-template-22747" => [CARD_22747_CONTENT, :html],

  # attribute shapes: unquoted value, single-quoted value, entity inside a
  # value, boolean attribute with no '=', ':operator' on '=', ':space'
  # inside the tag.
  "html-scanner-attributes" => [
    %(<div class=x data-y='z' hidden empty= >text</div>),
    :html
  ],

  # :comment, :doctype, :preprocessor (<?xml ...?>), PI (<?php ...?>),
  # and :entity - the remaining :initial-state kinds.
  "html-scanner-initial-kinds" => [
    %q{<!-- c --><!DOCTYPE html><?xml version="1.0"?><?php echo 1; ?>) &amp;&#65;&#x42;tail},
    :html
  ],

  # :tag on an open tag, a self-closing tag and a close tag; the
  # :attribute_value kind on an unquoted value; :error on a stray '<'.
  "html-scanner-tag-shapes" => [
    %(<img src="x"/>a<br />b< c & d>),
    :html
  ],

  # :in_special_tag - <script> and <style> bodies get the :inline group
  # wrapper, and a style="" attribute starts the same group by a different
  # route (html.rb:178-200 begin_group :string around the value).
  "coderay-known-divergence/html-scanner-script-style-body-subscanner-not-ported" => [
    %(<style>a{b:c}</style><script>var x = 1;</script>) +
    %(<p style="color:red">t</p>),
    :html
  ],

  # an unterminated quoted attribute value: the scanner falls out of the
  # :string group at the newline and tokenizes the rest as :error.
  "html-scanner-unterminated-value" => [
    %(<div class="oops\nnext>tail</div>),
    :html
  ],
}.freeze

CASES.each do |name, (content, lang)|
  html = CodeRay.scan(content, lang).div
  dir = name.start_with?("coderay-known-divergence/") ? DIVERGENCE_DIR : GATE_DIR
  name = name.delete_prefix("coderay-known-divergence/")
  path = "#{dir}/#{name}.html"
  File.binwrite path, html
  puts "wrote #{path} (#{html.bytesize} bytes; lang=#{lang})"
end

puts "done"
