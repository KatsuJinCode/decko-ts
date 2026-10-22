# oracle-capture-card-class-declarations-ruby.rb - the [Family] row's
# capture for the Card CLASS BODY.
#
# WHAT THIS IS. The register row reg-treewalk-c1 grades the port on the
# Card class itself: card-1.110.0/lib/card.rb's mixin roster, its
# action_specific_attributes list, its ActiveRecord associations, and its
# three Rails callback chains.
#
# The row's own blocker said: "1 Ruby file(s) in this row define 0 methods,
# 0 of which have a port counterpart by name and 0 do not. Fix: port the
# named methods." That sentence is empty - the file defines NO METHODS, so
# no method can be named. It was written by an instrument that could not
# see the row's subject, and it left a false REAL-GAP on the roster.
#
# So this capture measures the row's ACTUAL subject: the class body's
# declarations, read from the pinned bytes by line, and the port's
# counterpart for each one.
#
# WHAT THE PORT SIDE IS MEASURED AGAINST. The port is not Rails and not
# ActiveRecord, so "the port has no `has_many`" is not a gap - it is a
# different mechanism for the same behaviour. The question each
# declaration is graded on is: does the port carry the BEHAVIOUR the
# declaration gives the Card class? The capture records the port's own
# counterpart site for each, and where the port has none, it records the
# named reason with the citation that makes it a reason rather than a
# gap.
#
# THE PORT SITES ARE READ FROM THE PORT TREE, NOT WRITTEN DOWN. Each
# entry in PORT_COUNTERPARTS names a port file and a token; the capture
# asserts the file exists, locates the token in it, and records the line
# number it found. A port site that does not exist is recorded as MISSING
# rather than reported as a site - so a stale citation cannot make a gap
# look closed.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-card-class-declarations-ruby.rb \
#     > fixtures/captured/card-class-declarations-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a
# trailing newline.

require "json"
require_relative "oracle-capture-card-gem-class-declarations-ruby.rb"

PINNED = "card-1.110.0/lib/card.rb"
PORT_ROOT = ENV["DECKO_TS_PORT_SRC"] || File.expand_path("../../src", __dir__)

# The port's counterpart for each declaration, and the reason when there
# is none. The reason is the citation that makes it a reason.
#
# The reasons are NOT "the port has no Rails here". They name what the
# port DOES instead, because a named mechanism is checkable and "not
# Rails" is not.
PORT_COUNTERPARTS = {
  "extend Mark" => {
    "port" => "src/card/fetch/card-record.ts",
    "token" => "composes",
    "reason" => "The port's mark-to-card translation is Card::Mark's `cardish`/`fetch cardish`; the port carries it as the card record the fetch path composes."
  },
  "extend Dirty::MethodFactory" => {
    "port" => "src/card/mod-loader/mod-event-dispatch.ts",
    "token" => "define",
    "reason" => "The port's dirty-tracking is the write path's before/after snapshot, not a method factory: Ruby's Dirty::MethodFactory DEFINES the dirty methods on Card, and the port computes the same dirty set in the write path."
  },
  "extend Name::CardClass" => {
    "port" => "src/card/name.ts",
    "token" => "export class DeckoName",
    "reason" => "Ruby's Name::CardClass extends Card with the name-variants class methods; the port carries them as DeckoName's class surface."
  },
  "extend Cache::CardClass" => {
    "port" => "src/card/fetch/cache.ts",
    "token" => "export class",
    "reason" => "Ruby's Cache::CardClass extends Card with the cache class methods; the port carries them as the cache module's class surface."
  },
  "extend Director::CardClass" => {
    "port" => "src/card/actions/card-action-engine.ts",
    "token" => "export class",
    "reason" => "Ruby's Director::CardClass extends Card with the director class methods; the port carries them as the action engine's class surface."
  },
  "extend Fetch::CardClass" => {
    "port" => "src/card/fetch.ts",
    "token" => "export",
    "reason" => "Ruby's Fetch::CardClass extends Card with the fetch class methods; the port carries them as the fetch module's class surface."
  },
  "extend Query::CardClass" => {
    "port" => "src/card/fetch/retrieve.ts",
    "token" => "export",
    "reason" => "Ruby's Query::CardClass extends Card with the query class methods; the port carries them as the retrieval module's class surface."
  },
  "include Dirty" => {
    "port" => "src/card/mod-loader/mods/card-mod-history.ts",
    "token" => "changed",
    "reason" => "The port carries the dirty-tracking as the history mod's change capture, which is where the deck's dirty state is read."
  },
  "include DirtyNames" => {
    "port" => "src/card/mod-loader/mods/card-mod-history.ts",
    "token" => "name",
    "reason" => "The port carries the name-change detection as the history mod's name-change rows (the CHANGELOG's name entries)."
  },
  "include Name::All" => {
    "port" => "src/card/fetch/card-record.ts",
    "token" => "name",
    "reason" => "Ruby's Name::All gives Card its name/key/id_string surface; the port carries it as the card record's composed name/key."
  },
  "include Content::All" => {
    "port" => "src/card/fetch/card-record.ts",
    "token" => "dbContent",
    "reason" => "Ruby's Content::All gives Card its content surface; the port carries it as the card record's dbContent plus the content module's read surface."
  },
  "include Set::CardMethods" => {
    "port" => "src/card/rules/lookup.ts",
    "token" => "export",
    "reason" => "Ruby's Set::CardMethods gives Card the set-lookup methods; the port carries them as the rule lookup module."
  },
  "include Cache::All" => {
    "port" => "src/card/fetch/cache.ts",
    "token" => "export class",
    "reason" => "Ruby's Cache::All gives Card the cache instance methods; the port carries them as the cache module's instance surface."
  },
  "include Director::All" => {
    "port" => "src/card/actions/card-action-engine.ts",
    "token" => "export class",
    "reason" => "Ruby's Director::All gives Card the director instance methods; the port carries them as the action engine's instance surface."
  },
  "include Reference::All" => {
    "port" => "src/card/actions/refresh-references-out.ts",
    "token" => "export",
    "reason" => "Ruby's Reference::All gives Card the reference instance methods; the port carries them as the reference refresh module."
  },
  "include Rule::All" => {
    "port" => "src/card/rules/index.ts",
    "token" => "export",
    "reason" => "Ruby's Rule::All gives Card the rule instance methods; the port carries them as the rules module."
  },
  "include Fetch::All" => {
    "port" => "src/card/fetch.ts",
    "token" => "export",
    "reason" => "Ruby's Fetch::All gives Card the fetch instance methods; the port carries them as the fetch module's instance surface."
  },
  "include Subcards::All" => {
    "port" => "src/card/actions/card-action-engine.ts",
    "token" => "subcard",
    "reason" => "Ruby's Subcards::All gives Card the subcard instance methods; the port carries them as the action engine's subcard surface."
  },
  "cattr_accessor :action_specific_attributes, :set_specific_attributes" => {
    "port" => "src/card/fetch/card-record.ts",
    "token" => "action_specific_attributes",
    "reason" => "The port names the list in the card record's own header (card-record.ts:36 cites lib/card.rb:146)."
  },
  "attr_accessor(*action_specific_attributes)" => {
    "port" => "src/card/fetch/card-record.ts",
    "token" => "action_specific_attributes",
    "reason" => "The port names the list in the card record's own header (card-record.ts:36 cites lib/card.rb:146)."
  },
  "has_many :references_in" => {
    "port" => "src/card/actions/refresh-references-in.ts",
    "token" => "referee_id",
    "reason" => "The port reads the same rows (referee_id = this card's id); the ActiveRecord association is the ORM's way of saying it."
  },
  "has_many :references_out" => {
    "port" => "src/card/actions/refresh-references-out.ts",
    "token" => "referer_id",
    "reason" => "The port writes and reads the same rows (referer_id = this card's id); the ActiveRecord association is the ORM's way of saying it."
  },
  "has_many :acts" => {
    "port" => "src/card/actions/card-action-engine.ts",
    "token" => "card_acts",
    "reason" => "The port reads the same table; the ActiveRecord association is the ORM's way of saying it."
  },
  "has_many :actions" => {
    "port" => "src/card/history/write-path.ts",
    "token" => "card_actions",
    "reason" => "The port reads the same table with the same draft filter; the ActiveRecord association is the ORM's way of saying it."
  },
  "has_many :drafts" => {
    "port" => "src/card/history/write-path.ts",
    "token" => "draft",
    "reason" => "The port reads the same table with the same draft filter; the ActiveRecord association is the ORM's way of saying it."
  },
  "alias_method :card_id, :id" => {
    "port" => "src/card/fetch/card-record.ts",
    "token" => "id: number",
    "reason" => "The port's card record carries `id`; the alias is the deck's second name for it."
  },
  "delegate :config, :paths, to: Cardio" => {
    "port" => nil,
    "token" => nil,
    "reason" => "NAMED GAP: Ruby's Card.config and Card.paths reach the RAILS APPLICATION's configuration and its file paths. The port has no Rails application, and the port's own config surface is the deck manifest (src/card/mod-loader/mod-manifest.ts), which is a different object: Ruby's Cardio.config carries the deck's Rails config, and the port's manifest carries the mod registry. There is no port counterpart and the port is not Rails, so there is nothing to make match."
  },
  "define_callbacks :select_action, :show_page, :act" => {
    "port" => "src/card/mod-loader/mod-event-dispatch.ts",
    "token" => "select_action",
    "reason": "The port names the three chains in the dispatcher's own table (mod-event-dispatch.ts:432-434 cites lib/card.rb:181)."
  },
}.freeze

def port_site(port_file, token)
  return nil if port_file.nil? || token.nil?

  abs = File.join(PORT_ROOT, port_file.sub(%r{\Asrc/}, ''))
  return { "status" => "missing-file", "port" => port_file } unless File.exist?(abs)

  lines = File.readlines(abs)
  lines.each_with_index do |line, index|
    return { "status" => "found", "port" => port_file, "line" => index + 1, "text" => line.strip } if line.include?(token)
  end
  { "status" => "missing-token", "port" => port_file, "token" => token }
end

ledger = PinnedCardGemClass.declaration_ledger(PINNED)
body = PinnedCardGemClass.class_body(PINNED)

# The lookup key for a declaration. The register's port table is written
# in the declaration's SIMPLEST SPELLING, because the pinned file's own
# text carries options this row does not grade:
#
#   "has_many :references_in,  class_name: :Reference, foreign_key: :referee_id"
#   is the same declaration as "has_many :references_in".
#
# So the key is the declaration's kind plus its FIRST argument, with
# whitespace collapsed. A key that does not match the table is reported
# NOT-GRADED, which is honest: an ungraded declaration is not a verdict.
def lookup_key(declaration)
  kind = declaration["kind"]
  args = declaration["arguments"]
  case kind
  when "has_many"
    "has_many :#{args.first}"
  when "alias_method"
    "alias_method :#{args[0]}, :#{args[1]}"
  when "define_callbacks"
    "define_callbacks #{args.first.to_s.split(',').map { |a| a.strip }.join(', ')}"
  when "attr_accessor"
    "attr_accessor(*action_specific_attributes)"
  when "cattr_accessor"
    "cattr_accessor :action_specific_attributes, :set_specific_attributes"
  when "delegate"
    "delegate :config, :paths, to: Cardio"
  else
    "#{kind} #{args.first.to_s.split(',').map { |a| a.strip }.join(', ')}"
  end
end

declarations = ledger.map do |d|
  key = lookup_key(d)
  entry = PORT_COUNTERPARTS[key]
  {
    "kind" => d["kind"],
    "line" => d["line"],
    "rubyText" => d["text"],
    "arguments" => d["arguments"],
    "portSite" => entry ? port_site(entry["port"], entry["token"]) : nil,
    "portReason" => entry ? entry["reason"] : "NOT GRADED: this declaration has no entry in the capture's port table, so no port counterpart was looked for. It is not a verdict.",
    "disposition" => if entry.nil?
      "NOT-GRADED"
    elsif entry["port"].nil?
      "NAMED-SKIP"
    else
      site = port_site(entry["port"], entry["token"])
      site && site["status"] == "found" ? "PORTED" : "SITE-MISSING"
    end,
  }
end

graded = declarations.reject { |d| d["disposition"] == "NOT-GRADED" }
output = {
  "row" => "reg-treewalk-c1",
  "pinnedFile" => PINNED,
  "classBody" => {
    "startLine" => body["startLine"],
    "endLine" => body["endLine"],
  },
  "declarationCount" => declarations.length,
  "gradedCount" => graded.length,
  "counts" => graded.group_by { |d| d["disposition"] }.transform_values(&:length),
  "declarations" => declarations,
}
puts JSON.pretty_generate(output)
puts
