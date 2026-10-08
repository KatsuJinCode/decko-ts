# Haml 5.2.2 semantics probe.
#
# The engine's compiler must reproduce the bytes the REAL Haml engine emits
# (decko calls `Haml::Engine.new(haml).render(binding, locals)` -
# card-1.110.0/lib/card/set/format/haml_paths.rb:8-14 - with NO options hash,
# so every default below is what the deck actually gets).
#
# Read-only. No Rails, no DB.
# Usage: bundle exec ruby <this file> <out json>

require "json"
require "haml"

OUT = ARGV[0] || "C:/localProjects/decko-ts-lane-hamlslice/tmp/haml-slice/haml-semantics.json"

def list_group items
  Array(items).map { |i| "<li class=\"list-group-item\">#{i}</li>" }.join("\n")
end

def card_name
  "Mod"
end

def t src, locals = {}
  Haml::Engine.new(src).render(binding, locals)
rescue StandardError => e
  "ERR #{e.class}: #{e.message}"
end

cases = {
  # ---- the slice template itself -----------------------------------------
  "group_list" => ["- groups.each do |(title, items)|\n  %p\n    %h5\n      =title\n    =list_group(items)\n",
                   { "groups" => [%w[group: local a.scss b.js]] }],
  "group_list_empty" => ["- groups.each do |(title, items)|\n  %p\n    %h5\n      =title\n    =list_group(items)\n",
                         { "groups" => [] }],
  "group_list_no_trailing_nl" => ["- groups.each do |(title, items)|\n  %p\n    %h5\n      =title\n    =list_group(items)",
                                  { "groups" => [%w[a b]] }],

  # ---- doctypes -----------------------------------------------------------
  "doctype_html5" => ["!!!\n%p x\n", {}],
  "doctype_1_1" => ["!!! 1.1\n%p x\n", {}],
  "doctype_xml" => ["!!! XML\n%p x\n", {}],
  "doctype_5" => ["!!! 5\n%p x\n", {}],
  "doctype_dashed" => ["!!!- doctype html\n%p x\n", {}],

  # ---- tag shapes ---------------------------------------------------------
  "tag_bare" => ["%p\n", {}],
  "tag_nested" => ["%p\n  %span x\n", {}],
  "tag_void" => ["%meta\n%input\n%br\n%img\n%hr\n", {}],
  "tag_div_dot" => ["%div\n  .a\n", {}],
  "tag_class_short" => ["%p.a.b x\n", {}],
  "tag_id_short" => ["%p#a x\n", {}],
  "tag_attrs_hash" => ["%a{ href: 'x', class: 'y z' } t\n", {}],
  "tag_attrs_hash_dq" => ["%a{ href: \"x\", class: \"y z\" } t\n", {}],
  "tag_attrs_nospace" => ["%a{href: 'x'} t\n", {}],
  "tag_attrs_ternary" => ["%a{ class: (x ? 'y' : 'z') } t\n", {}],
  "tag_attrs_false" => ["%a{ hidden: true, disabled: false, 'data-x': nil } t\n", {}],
  "tag_attrs_num" => ["%a{ tabindex: 3 } t\n", {}],
  "tag_attrs_interp" => ["%a{ title: \"a#{1}b\" } t\n", {}],
  "tag_attrs_class_underscore" => ["%a{ data: { x: 1 } } t\n", {}],
  "tag_attrs_dash" => ["%a{ 'aria-label' => 'q' } t\n", {}],
  "tag_attrs_amp" => ["%a{ href: '/x?a=1&b=2' } t\n", {}],
  "tag_selfclose" => ["%img{src: 'a.png'}\n", {}],
  "tag_custom" => ["%my-thing x\n", {}],

  # ---- inline text / output ----------------------------------------------
  "text" => ["%p hello world\n", {}],
  "text_after_tag" => ["%p= 1 + 1\n", {}],
  "output_escape" => ["= '<b>&\"x</b>'\n", {}],
  "output_unescape" => ["== '<b>x</b>'\n", {}],
  "output_number" => ["= 42\n", {}],
  "output_nil" => ["= nil\n", {}],
  "escaped_html" => ["/ <b>x</b>\n", {}],
  "unescaped_html" => ["& <b>x</b>\n", {}],

  # ---- silent lines / blocks ---------------------------------------------
  "silent_if" => ["- if true\n  %p yes\n", {}],
  "silent_if_false" => ["- if false\n  %p yes\n%p no\n", {}],
  "silent_each" => ["- [1, 2].each do |i|\n  %li= i\n", {}],
  "silent_unless" => ["- unless false\n  %p y\n", {}],
  "silent_case" => ["- x = 1\n- case x\n- when 1\n  %p one\n- else\n  %p other\n", {}],
  "silent_multiline_if" => ["- if true &&\n  - false\n  %p y\n", {}],
  "silent_comment" => ["%p a\n-# hidden\n%p b\n", {}],
  "silent_comment_indent" => ["%p\n  -# hidden\n  %span y\n", {}],
  "interpolation" => ["%p a #{1 + 1} b\n", {}],
  "interpolation_only" => ["#{1 + 1}\n", {}],
  "not_tag" => ["~ 'text'\n", {}],
  "not_tag_tag" => ["~ foo\n", {}],

  # ---- comments / filters -------------------------------------------------
  "html_comment" => ["-# a comment\n", {}],
  "html_comment_indent" => ["%p x\n  -# c\n", {}],
  "filter_css" => [":css\n  .a { color: red; }\n", {}],
  "filter_javascript" => [":javascript\n  var x = 1;\n", {}],
  "filter_plain" => [":plain\n  raw text\n", {}],
  "filter_escaped" => [":escaped\n  <%= x %>\n", {}],
  "filter_preserve" => [":preserve\n  \#{1}\n", {}],
  "filter_markdown" => [":markdown\n  # head\n", {}],

  # ---- whitespace / indentation ------------------------------------------
  "indent_two" => ["%p\n    %span deep\n", {}],
  "nested_text" => ["%p\n  line one\n  line two\n", {}],
  "empty_line_between" => ["%p a\n\n%p b\n", {}],
  "trailing_ws" => ["%p a   \n", {}],
  "crlf" => ["%p a\r\n%p b\r\n", {}],
}


# ---- attribute ordering / merging (the class-hoist rule) ----------------
cases["attr_order_id_after"] = ["%a{ href: 'x', id: 'i' } t
", {}]
cases["attr_order_class_after"] = ["%a{ href: 'x', class: 'c' } t
", {}]
cases["attr_rocket"] = ["%a{ :href => 'x' } t
", {}]
cases["attr_str_key"] = ["%a{ 'href' => 'x' } t
", {}]
cases["attr_merge_short_and_hash"] = ["%a.b{ href: 'x' } t
", {}]
cases["attr_merge_short_class"] = ["%a.b{ class: 'c' } t
", {}]
cases["attr_merge_id_short"] = ["%a#i.c t
", {}]
cases["attr_merge_id_and_hash"] = ["%a#i{ id: 'j' } t
", {}]
cases["attr_empty"] = ["%a{} t
", {}]
cases["attr_style_semicolon"] = ["%a{ style: 'color: red; top: 0' } t
", {}]
cases["attr_dq_escape"] = ["%a{ title: \"a'b\" } t
", {}]
cases["attr_selfclose_slash"] = ["%img/ 
", {}]
cases["tag_selfclose_slash_attr"] = ["%img{src: 'a'}/ 
", {}]
cases["tag_multiline_attr"] = ["%a{ href: 'x',
    class: 'y' } t
", {}]
cases["tag_nested_after_inline"] = ["%p text
  %span s
", {}]
cases["tag_children_mixed"] = ["%div
  = 1
  text
", {}]
cases["div_dot_only"] = [".
  .b
", {}]
cases["div_dot_inline"] = [".a hello
", {}]
cases["div_class_only_no_tag"] = [".a
  .b
", {}]
cases["output_in_attr_nested"] = ["%a{ href: \"/x\#{1}\" } t
", {}]
cases["silent_comment_after_text"] = ["%p a
-# c
", {}]
cases["comment_between_tags"] = ["%p a
  -# c
%p b
", {}]
cases["silent_begin_end"] = ["- begin
  %p a
- end
", {}]
cases["silent_ternary"] = ["- x = true ? 1 : 2
%p= x
", {}]
cases["silent_and_or"] = ["- x = 1 && 2
%p= x
", {}]
cases["output_string_concat"] = ["= 'a' + 'b'
", {}]
cases["output_array_join"] = ["= [1,2].join(', ')
", {}]
cases["output_ivar"] = ["= @x
", {}]
cases["output_method"] = ["= card_name
", {}]
cases["output_math"] = ["= 2 * 3 + 1
", {}]
cases["output_string_interp"] = [%q{= "a#{1}b"
}, {}]
cases["filter_nested"] = [":plain
  a
  b
", {}]
cases["filter_javascript_multi"] = [":javascript
  a();
  b();
", {}]
cases["filter_indent_preserved"] = [":plain
    deep
", {}]
cases["whitespace_preserve_multiline_text"] = ["%p
  a

  b
", {}]


# ---- class-merge ordering (the runtime build path) ----------------------
cases["class_merge_short_then_hash"] = ["%a.b{ class: 'c' } d
", {}]
cases["class_merge_short2_then_hash"] = ["%a.b.c{ class: 'z' } d
", {}]
cases["class_merge_hash_first"] = ["%a{ class: 'z' }.b d
", {}]
cases["class_merge_dedupe"] = ["%a.b{ class: 'b a' } d
", {}]
cases["class_merge_dedupe2"] = ["%a.b.c{ class: 'c' } d
", {}]
cases["class_merge_array"] = ["%a{ class: ['x', 'y'] } d
", {}]
cases["id_merge_two"] = ["%a#i{ id: 'j', class: 'k' } d
", {}]
cases["class_hash_nested_merge"] = ["%a.b{ class: 'c d', href: 'h' } d
", {}]

out = { "haml_version" => Haml::VERSION, "cases" => {} }
cases.each { |k, (src, locals)| out["cases"][k] = { "src" => src, "bytes" => t(src, locals) } }

# what the deck's default options ARE
out["default_options"] = Haml::Options.instance_methods(false).sort.each_with_object({}) { |m, h| h[m.to_s] = (Haml::Options.new.public_send(m) rescue "n/a") }
out["default_options_summary"] = Haml::Options.instance_methods(false).sort.each_with_object({}) { |m, h| h[m.to_s] = (Haml::Options.new.public_send(m) rescue "n/a") }

File.write OUT, JSON.pretty_generate(out)
puts "WROTE #{OUT} (#{cases.size} cases)"
