# oracle-capture-card-gem-row-methods-ruby.rb - the [Family] rows' METHOD
# capture, driven by the row's own disposition.
#
# WHAT THIS IS. A method-based row in this family grades the port on the
# `def`s in a set of pinned card-gem files. This capture is the row's
# ORACLE side: it runs the PINNED method body and records what the method
# asked for, so the port side can be compared against the pinned bytes
# rather than against a reading of them.
#
# THE RIG IS SHARED. The method extraction, the recording double and the
# comparison helper live in
# tests/server/oracle-capture-pinned-card-gem-methods-ruby.rb, and this
# file is the row-level driver over that rig.
#
# WHY THE PINNED BODY IS EXTRACTED BY LINE, and not required: the card
# gem cannot be loaded standalone. card-1.110.0/lib/card.rb opens
# `class Card < Cardio::Record`, and Cardio::Record is an ActiveRecord
# model, so requiring it pulls Rails in and needs a database. Measured:
# with the gemset's lib directories on the load path, i18n's
# `require "set"` (i18n-1.15.2/lib/i18n/config.rb:3) loads
# card-1.110.0/lib/card/set.rb and dies at
# card-1.110.0/lib/card/set.rb:122 with
# `uninitialized constant Card::Set::Event` - the card gem SHADOWS Ruby's
# stdlib `set` on that load path. A line-extraction rig has no load path,
# so it cannot be shadowed, and the executed bytes are the gem's own
# rather than a transcription of them.
#
# THE STUBBING RULE, the family's own: every double RECORDS. A pinned
# method that cannot be stood up is recorded as raising, never replaced
# with a plausible value. A method that raises is not a FAILURE of the
# port: it is a fact about the pinned method, and the row receipt reads
# it.
#
# THE PROBE LIST is fixed per row, so a re-run on the same gemset is
# byte-stable.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-card-gem-row-methods-ruby.rb <row-id> \
#     > fixtures/captured/<row-slug>-ruby-oracle.json

require "json"
require_relative "oracle-capture-pinned-card-gem-methods-ruby.rb"

ROW_ID = ARGV[0]
raise "usage: oracle-capture-card-gem-row-methods-ruby.rb <row-id>" if ROW_ID.nil?

# The row's file set and per-def dispositions, read from the rig's own
# instrument so the capture and the instrument cannot disagree.
DISPOSITION_TOOL = File.expand_path("../../tools/treewalk-family-row-disposition.mjs", __dir__)
unless File.exist?(DISPOSITION_TOOL)
  raise "the disposition tool is missing at #{DISPOSITION_TOOL}; the capture cannot be trusted without it"
end

# The row's file set and per-def dispositions, read from the rig's own
# instrument so the capture and the instrument cannot disagree.
#
# The instrument is a NODE script, so it is run with node - not with
# ruby. A first cut shelled out through `ruby -e` with a JavaScript
# payload, which of course died with a JavaScript syntax error; the
# capture now runs the tool the way the tool is meant to be run.
def row_file_set(row_id)
  raw = IO.popen(
    ["node", DISPOSITION_TOOL, row_id, "--json"],
    err: %i[child out],
    &:read
  )
  parsed = JSON.parse(raw)
  parsed.first
end

# ── the probe list ──────────────────────────────────────────────────────────
#
# A probe is a name, the pinned method it exercises, the arguments it
# passes, and the collaborators the method needs as doubles. The probe
# list is the row's own, and it is FIXED: the same list, the same
# arguments, every run.
#
# The default probe for a method: call it with no arguments over a
# recording receiver, and record what it asked for. Most of the card gem's
# instance methods read their own attributes, so a no-argument call
# records the attribute reads, which is the method's own behaviour and
# not a fabrication.
# The row's own probe list, where the row has one. A probe is a name, the
# pinned method it exercises, and the arguments it passes.
#
# A row with no entry here gets the DEFAULT PROBE SET: every def in the
# row's file set, called with no arguments and with one representative
# argument, over the recording receiver. The default set is what makes
# this capture usable for every row in the family; a row whose behaviour
# turns on a specific argument (the mark row's `id_or_name` with an
# Integer, a Symbol and a String) names its own.
PROBES = {
  # The mark row: Card::Mark's class methods. The argument shapes matter
  # here - Ruby's id_from_mark dispatches on the mark's TYPE - so this
  # row names its own probes.
  "reg-treewalk-c2-mark-rb" => [
    { "name" => "cardish with a String mark", "method" => "cardish", "args" => ["Example"] },
    { "name" => "id_or_name with one Integer mark", "method" => "id_or_name", "args" => [[42]] },
    { "name" => "id_or_name with a Symbol mark", "method" => "id_or_name", "args" => [[:example]] },
    { "name" => "id_or_name with a String mark", "method" => "id_or_name", "args" => [["Example"]] },
    { "name" => "id_or_name with two marks", "method" => "id_or_name", "args" => [["Example", "Other"]] },
    { "name" => "id_from_mark with an Integer", "method" => "id_from_mark", "args" => [42] },
  ],
}.freeze

# The DEFAULT probe for a def: called with no arguments, and with one
# representative argument. The second form is what exercises a def whose
# body reads its argument, and a def that cannot take one is recorded as
# raising - which is a fact about the pinned method, not a failure of the
# capture.
def default_probes(row)
  probes = []
  row["defs"].each do |d|
    probes << { "name" => "#{d['name']} with no arguments", "method" => d["name"], "args" => [] }
    probes << { "name" => "#{d['name']} with one argument", "method" => d["name"], "args" => ["Example"] }
  end
  probes
end

# The recording receiver: a method_missing double that records every
# message it receives and answers with another recorder.
#
# THE CALLS ARE RECORDED ON THE RECEIVER THAT RECEIVED THEM, and the
# probe reads the receiver's OWN list. A first cut kept a separate
# `receiver` variable and read that, so the list was always empty: the
# probe called the method on a DIFFERENT instance than the one holding
# the recorder. The recording has to be on the object the method runs
# on.
class ProbeReceiver
  attr_reader :calls

  def initialize
    @calls = []
  end

  def method_missing(sym, *args, &block)
    @calls << {
      "call" => sym.to_s,
      "args" => args.map { |a| a.is_a?(Symbol) || a.is_a?(String) || a.nil? || a.is_a?(Numeric) || a == true || a == false ? a : a.class.name },
    }
    ProbeReceiver.new
  end

  def respond_to_missing?(_sym, _include_private = false)
    true
  end
end

# The pinned method's OWN SIBLINGS. A method in a module calls its
# module's other methods by name, and those are on the SAME receiver. So
# the receiver carries the row's whole def set: every def of the row's
# file, extracted by line and defined on the receiver's class. Then a
# method that calls its sibling calls the PINNED sibling.
#
# The pinned CONSTANTS the card gem's methods reference are stood up too,
# because they do: the card gem's methods say `cardish.is_a? Card`, a
# `Card::Name[mark]` lookup, a `Codename.id! mark`, a `Name.id_from_string!
# mark`. Without those constants the pinned body raises before it does
# anything, and the probe would record a raise that says nothing about
# the method.
#
# Each constant is a RECORDING DOUBLE: a reference to it is recorded, and
# the call on it is recorded with the call's name. The recording is what
# makes the probe a measurement of the pinned method rather than a
# measurement of the harness.
#
# A STAND-UP THAT CANNOT BE DONE IS RECORDED, not replaced with a
# plausible value: the probe records the raise and the row receipt reads
# it.
# A constant the pinned methods reference, stood up as a recording
# double. `Card` is a CLASS (the methods ask `is_a? Card`), so it is a
# class; `Codename` and `Name` are MODULES, so they are modules. The
# difference matters: `is_a? Card` raises a TypeError if Card is not a
# class.
def stand_up_constants
  card = Class.new(ProbeReceiver)
  def card.[](*args)
    ProbeReceiver.new
  end

  codename = Module.new
  def codename.method_missing(sym, *args, &block)
    ProbeReceiver.new
  end

  def codename.respond_to_missing?(_sym, _include_private = false)
    true
  end

  name = Module.new
  def name.method_missing(sym, *args, &block)
    ProbeReceiver.new
  end

  def name.respond_to_missing?(_sym, _include_private = false)
    true
  end

  # Card::Name is a NESTED constant: the card gem's methods say
  # `Card::Name[mark]`, so Name must hang off Card, not off Object.
  card.const_set(:Name, name) unless card.const_defined?(:Name)
  card.const_set(:Codename, codename) unless card.const_defined?(:Codename)
  Object.send(:remove_const, :Card) if Object.const_defined?(:Card)
  Object.const_set(:Card, card)
  Object.send(:remove_const, :Codename) if Object.const_defined?(:Codename)
  Object.const_set(:Codename, codename)
  Object.send(:remove_const, :Name) if Object.const_defined?(:Name)
  Object.const_set(:Name, name)
end

def define_row_defs(klass, row)
  row["defs"].each do |d|
    source = begin
      PinnedCardGem.pinned_method(d["file"], d["name"])
    rescue StandardError
      nil
    end
    next if source.nil? || source["source"].to_s.empty?

    begin
      klass.class_eval(source["source"], source["file"], source["startLine"])
    rescue StandardError, SyntaxError
      # A def whose body will not parse on its own (a def that opens a
      # block the file closes) is left undefined; the probe that needs it
      # records the NoMethodError.
      nil
    end
  end
end

# One probe's result: the calls the pinned method made, or the raise it
# produced.
def run_probe(probe, method_source, row)
  klass = Class.new(ProbeReceiver)
  # The constants are stood up FIRST, and the receiver's class gets them
  # BEFORE any pinned body is defined. The pinned body is evaluated
  # INSIDE the receiver's class, so a bare `Card` in it resolves
  # LEXICALLY - to the receiver's own namespace, not to Object - and a
  # body defined before the constant exists raises NameError at CALL
  # time with "uninitialized constant Card::Name" even though the
  # constant was set afterwards. A capture that raises for that reason
  # measures the harness, not the method.
  # The receiver's class gets the SAME Card object Object has, so a
  # `Card::Name` in the pinned body resolves to the same Name the deck
  # would see. The set is UNGUARDED on purpose: a guard that skips the
  # set because an ancestor already answers `const_defined?` leaves the
  # receiver pointing at a DIFFERENT Card, and the pinned body then
  # raises "uninitialized constant Card::Name" for a reason that is
  # about the harness and not about the method.
  klass.const_set(:Card, Object.const_get(:Card))
  klass.const_set(:Codename, Object.const_get(:Codename))
  klass.const_set(:Name, Object.const_get(:Name))
  define_row_defs(klass, row)
  # The pinned method under test is defined LAST, so it wins over any
  # earlier definition of the same name.
  klass.class_eval(method_source["source"], method_source["file"], method_source["startLine"])
  instance = klass.new
  begin
    result = instance.public_send(probe["method"], *probe["args"])
    {
      "probe" => probe["name"],
      "method" => probe["method"],
      "rubyFile" => method_source["file"],
      "rubyStartLine" => method_source["startLine"],
      "rubyEndLine" => method_source["endLine"],
      "outcome" => "returned",
      "calls" => instance.calls,
      "resultClass" => result.class.name,
    }
  rescue StandardError, NotImplementedError, ScriptError, LoadError => e
    {
      "probe" => probe["name"],
      "method" => probe["method"],
      "rubyFile" => method_source["file"],
      "rubyStartLine" => method_source["startLine"],
      "rubyEndLine" => method_source["endLine"],
      "outcome" => "raised",
      "raised" => e.class.name,
      "raisedMessage" => e.message.to_s.lines.first.to_s.strip,
      "raisedBacktrace" => e.backtrace.first(6),
      "calls" => instance.calls,
    }
  end
end

row = row_file_set(ROW_ID)
probes = PROBES[ROW_ID] || default_probes(row)
if probes.empty?
  raise "the row #{ROW_ID} has no defs to probe; a row with no probes is a row with no measurement"
end

# The constants are stood up ONCE, before any probe runs. A capture that
# stood them up per probe replaced Object::Card each time, and a receiver
# class bound to an EARLIER Card then resolved `Card::Name` against a
# Card that no longer had Name - so the probe raised "uninitialized
# constant Card::Name" for a reason that was about the harness.
stand_up_constants

results = probes.map do |probe|
  source = begin
    PinnedCardGem.pinned_method(
      row["defs"].find { |d| d["name"] == probe["method"] }&.fetch("file", nil) || "",
      probe["method"]
    )
  rescue StandardError => e
    { "file" => "unknown", "startLine" => 0, "endLine" => 0, "source" => "", "error" => e.message }
  end
  if source["source"].to_s.empty?
    {
      "probe" => probe["name"],
      "method" => probe["method"],
      "outcome" => "not-extractable",
      "error" => source["error"] || "the pinned method could not be extracted",
    }
  else
    run_probe(probe, source, row)
  end
end

# The row's gap reason, when the row has gaps. A gap with no named
# reason is a gap with no claim on the reader, so the capture refuses to
# write a row that has one and no reason.
#
# The reason is the row's own, written in the row's receipt, and the
# capture CHECKS it against the rig's own gap list: a reason that names
# a def the rig does not flag as a gap is a reason for a different row.
GAP_REASONS = {
  "reg-treewalk-c2-auth-proxy-rb-6-29-48-59" => {
    "def" => "with",
    "reason" => "The port carries four of the row's six defs by citation (as and as_bot collapse into \"pass a different actor object\", and as_id and as_card are the port's own actor resolution) and its own source names the two save/restore defs as collapses. `with` (proxy.rb:48-59) and `temporarily` (proxy.rb:63-76) both save and restore a process-global current_id around the block, and the port has no process-global to save: the actor is an explicit parameter, so a block that runs as another actor is written as a call with a different actor object. The port states this in its own words (src/card/auth/actor.ts:7), and the rig measures the def as NAMED-COLLAPSE against that statement rather than against a guess. The pinned bytes were executed to confirm the two methods' shapes: `with` needs its argument and resolves it through Card.id, and `temporarily` reads the current_id it saves.",
  },
  "reg-treewalk-c2-cache-rb-34-91-cache-shared-temporary-rb" => {
    "def" => "with_multiple_keys",
    "reason" => "The port carries the row's ten defs, and the tenth is the guard the port carries INLINE. The def is `with_multiple_keys` (cache.rb:95-99), a private helper whose whole content is `keys.size > 1 ? yield : {}` - the guard that makes a multi-key cache read return nothing when only one key was asked for. The pinned deck calls it at cache.rb:43, inside `read_multi`, so the behaviour is live in the old system. The port carries the behaviour: `CardCache.readMulti` (src/card/fetch/cache.ts:335) opens with `if (keys.length <= 1) return found;`, which is the guard, and the port's own suite pins it (tests/card/fetch/cache.test.ts:186). What the port did NOT do was name Ruby's helper in its own source - its comment described the guard's EFFECT (\"single-key calls return {} in Ruby\") and not the helper that holds it - and the port's source now names the helper and its line range, so the rig measures the def against the port's own citation and not against a guess. The pinned bytes were executed to confirm the helper's shape: with no arguments it raises ArgumentError at cache.rb:95, and with one argument it raises LocalJumpError at cache.rb:96, the yield inside the one-line guard.",
  },
  "reg-treewalk-c2-mailer-rb-9-26" => {
    "def" => "defaults_from_config",
    "reason" => "The port carries the row's `new_mail` (src/card/notify/mail.ts, which quotes card-1.110.0/lib/card/mailer.rb:9-16 and names Card::Mailer.new_mail). The one gap is `defaults_from_config` (mailer.rb:18-22), whose content is three defaults: `return_path ||= from`, `charset ||= \"utf-8\"` and the email_defaults hash itself. The port carries the CHARSET half - src/card/notify/mail.ts:202 cites `lib/card/mailer.rb:21-22` for it - but the port does not claim the method, and Ruby's `default defaults_from_config` is the class-level declaration that makes ActionMailer apply those defaults to every mail the deck sends. The port builds its mail headers in renderMail and its transport separately, so there is no single method the port could match.",
  },
  "reg-treewalk-e4" => {
    "def" => "assert_rename",
    "reason" => "The row's six defs are all RSPEC SPEC HELPERS, not runtime behaviour: assert_rename, expect_successful_rename, name_invariant_attributes and card_to_rename (card-1.110.0/mod/core/spec/set/all/name_events_spec.rb), run_admin_task (mod/core/spec/set/self/admin_spec.rb) and card_subject (mod/core/spec/set/all/trash_spec.rb). The pinned deck calls them only from the deck's own spec files, so the old system's RUNTIME never reaches them. The port's counterpart for a spec file is the port's own TEST SUITE, and the port carries the behaviour the specs check - the rename invariants, the admin task and the trash subject - in its own vitest files (tests/card/actions/renamegate-rename-created-sides-verdicts.test.ts, tests/card/actions/rename-referer-cache-staleness.test.ts, tests/card/actions/obstructed-self-side-rename-write.test.ts). The rig records a gap because the port does not bind a function with the spec helper's name, and a spec helper is not something a port SHOULD bind.",
  },
  "reg-treewalk-c2-content-all-rb-5-56" => {
    "def" => "last_draft_content",
    "reason" => "The port carries ten of the row's thirteen defs. The three it does not carry are the DRAFT half of Ruby's content surface: `refresh_content` (all.rb:30-32, which re-reads a card's content from the database and resets its content caches), `last_draft_content` (all.rb:42-44, the content of the card's most recent draft) and `blank_content?` (all.rb:46-48, whether a card's content is empty). The port's draft surface is a different mechanism - the port's save path carries a draft action and the draft's stored bytes (src/card/actions/types.ts:168-172) - and the port binds no function for these three defs under any name. The port's own `content/all.rb` citations name the content READ path (the standard-content and structured-content composition at src/card/render.ts:991 and :1023, and the content/all.rb:8-10 structure rule), not the draft half.",
  },
  "reg-treewalk-c2-setting-rb-63-114" => {
    "def" => "standard_setting_opts",
    "reason" => "NONE: this row has no gap. The port carries the setting registry and now names the three option helpers behind register_setting in its own source (src/card/mod-loader/mod-registrar.ts, the SettingRegistry block): the option-fill helper (setting.rb:87-89 standard_setting_opts) collapses into register's literal field initialization, because Ruby walks the option names with send and fills rule_type_editable, short_help_text and the applies proc, and the port writes the same fields as the typed members of the RegisteredSetting literal, with the one proc the schema does not carry named where the deck's one proc-carrying registration lives (src/card/mod-loader/mods/card-mod-list.ts); the type-restriction store (setting.rb:91-93 restrict_setting_to_type) collapses into the restrictedToType field, because Ruby resolves the restricted cardtypes to type ids at registration while the port stores the codename strings and the visible-settings gate resolves the prototype's type code when the settings render (src/card/render/views.ts, visibleSettingsForGroup); and the registration-time id set (setting.rb:116-119 permitted_type_ids) collapses into that same query-time resolution, since the port never materializes an id set at registration. The pinned bytes were executed for the row's probes, and the rig re-measures the three defs as NAMED-COLLAPSE against the port's own statements.",
  },
  "reg-treewalk-c2-model-save-helper-rb-3" => {
    "def" => "create_card",
    "reason" => "The row's seven defs are the deck's EXTERNAL-SCRIPTING library API - Card::Model::SaveHelper is documented in its own file as \"an API to create and update cards... intended as a helper for external scripts (seeding, testing, migrating, etc) and not for internal application code\". The pinned deck's RUNTIME calls none of them: `create_card`, `create_card!`, `update_card`, `update_card!` and `delete_card` have NO caller anywhere in the pinned gemset, and the deck's own red-team audit (docs/reports/reg-redteam-a12-unclaimed-ruby-surfaces-audit-2026-10-20.md row 8) records the same measurement - a grep for \"Card.create_card|Card.update_card\" over card-1.110.0/lib, decko-0.20.0/lib and every card-mod-*/lib returns zero hits outside the file's own aliases - and names the port's equivalent API: \"CardActionEngine#createCard / #updateCard\". The port carries the CAPABILITY under its own names (src/card/actions/card-action-engine.ts:1643 createCard, :2735 updateCard, :4493 deleteCard) but cites no Ruby source for them, so the rig finds no counterpart to bind. The one def whose ONLY callers are the deck's own spec tree (with_user, called from card-1.110.0/spec/support/card_spec_loader.rb:53 and :59) measures INERT-API for the same reason. The row's remaining gaps are the defs with no port counterpart under any name.",
  },
  "reg-treewalk-c2-reference-rb-reference-all-rb" => {
    "def" => "referer",
    "reason" => "The port carries seventeen of the row's twenty-six defs, and names a collapse for one. The seven gaps are the defs the port does not carry under any name: `referer` (reference.rb:8-11, the method that collects a card's referers), `recreate_all` (reference.rb:54, the reference-repair sweep), `each_card` (reference.rb:67), `referer_cards_from_references` (reference/all.rb:22), `nestees` (reference/all.rb:32), `referees_from_references` (reference/all.rb:36) and `name_referers` (reference/all.rb:42). The defs the port DOES carry are cited, one by one: referee, map_referees, unmap_referees, insert_in_slices, referers, nesters, referees, update_references_out, create_references_out, swap_names, interpret_reference, with_normalized_referee, reference_values_array, each_reference_type, each_reference_out and interpret_partial_references.",
  },
  "reg-treewalk-c2-content-clean-rb-37-95" => {
    "def" => "clean!",
    "reason" => "The port carries NONE of the row's seven defs, and the reason is that the port's content pipeline does not have Ruby's clean half. `clean!` (clean.rb:37-45, the method that removes the HTML tags, the comments and the style attributes from a card's content), `clean_tags` (clean.rb:47-63), `html_attribs` (clean.rb:65-84) and `process_attribute_match` (clean.rb:86-95) are the content CLEANING surface, and no port file cites lib/card/content/clean.rb at all - a grep for clean.rb over the port tree returns no hits. The port's own content handling (src/card/render.ts and the nest-syntax module) parses and renders content; it does not clean it, because the port has no surface that would need cleaning.",
  },
  "reg-treewalk-c2-dirty-rb-dirty-method-factory-rb" => {
    "def" => "attribute_before_act",
    "reason" => "The port carries six of the row's eleven defs. The five it does not carry are the DIRTY-TRACKING HALF that Ruby's method factory generates: `attribute_before_act` (dirty.rb:23-33, the attribute's value before the current act), `not_in_callback?` (dirty.rb:35-38), `attribute_is_changing?` (dirty.rb:40-42), `dirty_name` (dirty.rb:64-66) and `define_dirty_methods` (dirty/method_factory.rb:5-13, the factory that DEFINES the dirty methods on Card). The port carries the dirty tracking by a different mechanism - the port's write path computes the before-values it needs rather than defining dirty methods on the record - and the port's own citations name the Ruby it reads (src/card/actions/update-referer-content.ts:72 and :467 cite lib/card/dirty.rb:60-70 for the before-names, and src/card/fetch/card-record.ts:78 cites name_before_act) without binding these five as port functions.",
  },
  "reg-treewalk-c2-rule-rb-rule-all-cache-preference-cache-read-rule-" => {
    "def" => "clear_preference_cache",
    "reason" => "The port carries thirty-one of the row's thirty-nine defs. The eight it does not carry are the RULE-CACHE MAINTENANCE surface: `clear_preference_cache` (rule.rb:31-33), `clear_rule_cache` (rule.rb:36-38) and the rest of the cache-clearing surface, plus the preference helpers behind them. The port carries the cache READ path - the rule cache, the read-rule cache and the preference lookups are all cited (src/card/rules/rule-cache.ts and src/card/follow/follow-rule-walk.ts:21 and :78 cite card-1.110.0 lib/card/rule.rb:39-45 for preference_names) - but the cache INVALIDATION half is the write path's job in the port, and the port binds no function for these eight under their Ruby's names.",
  },
  "reg-treewalk-c2-cache-all-card-class-class-methods-populate-shared" => {
    "def" => "codename_card?",
    "reason" => "The port carries the row's fifty-one defs, and the eight it does not carry are the parts of Ruby's cache the port does not have, each named with the mechanism in the port's own source (src/card/fetch/cache.ts). `codename_card?` (cache/all.rb:41-43) collapses into the port's own registry: the cards table's codename column IS the codename registry (the unique index cards_codename_index, db/schema.sqlite.sql:70), and the port reads it by codename. `populate_ids` (cache/populate.rb:5-7) and `seed_from_stash` (cache/populate.rb:49) are the CACHE POPULATION half - Ruby pre-fills the cache from the deck's own rows at boot, and the second is Rails code-reloading dev machinery - and the port's cache is filled on demand, so the port has nothing to populate; the pinned bytes show both bodies reaching for Rails-only constants (Lexicon and Cardio) that the port does not have. `reset` (cache/class_methods.rb:47-50 and cache/shared_class.rb:22-25), `shared_cache` (class_methods.rb:107-110) and `stamp` (shared_class.rb:5-7) are the class-level cache REGISTRY and the shared-cache STAMP; the port's reset family (resetCaches and its per-family arms) does the same two steps, the port's shared cache is the per-instance field the caller holds, and the port's SharedCache stamps every shared key and rotates the stamp on a reset, which is the stamp's own mechanism. The row's own blocker named the view-cache cluster and the populate cluster as named skips, and the port's fetch module (src/card/fetch.ts:16 and :32) names lib/card/cache/all.rb for the expiry half it does carry.",
  },
  "reg-treewalk-c2-view-rb-view-classy-permission-rb-view-cache-4" => {
    "def" => "root",
    "reason" => "NONE: this row has no gap. The port carries the voo surface it rendered for and names the rest in its own source (src/card/render/format.ts, the Voo block): the top-of-chain accessor (view.rb:90-92 root) collapses into the render entry's own handle on the first voo, because the port's Voo carries the parent chain and the render entries hold the voo they created; the top-of-chain test (view.rb:95-97 root?) collapses into the deepExtraClasses walk's recursion stop at the parentless voo; the cross-format hops (view.rb:100-102 deep_root, view.rb:106-109 deep_root?, view.rb:121-123 next_format_ancestor) have no port counterpart because the port's formats do not chain; the ancestor hop (view.rb:116-119 next_ancestor) collapses into the voo chain walk; the removal family (classy.rb:30-32 class_down, classy.rb:43-49 without_upped_class, classy.rb:61-76 remove_extra_classes) has no port counterpart because no deck file calls the temporary-up form, so the port's class-ups live for the whole render; the extra-class write is carried by classUp, whose body is classy.rb:55-58 add_extra_classes' merge; the ancestor walk (classy.rb:94-101 ancestor_extra_classes) collapses into deepExtraClasses over the voo chain; the storage-site table (classy.rb:103-114 storage_voo) collapses into the voo-stored class-up, which is the one scope the deck's calls use; the privacy-list read (classy.rb:116-121 self_extra_classes) and the scope-to-privacy table (classy.rb:151-153 class_list_type) collapse into the port's single class-list map; and the per-view cache dispatch (cache_action.rb:18-22 cache_action) collapses into the port's always-render path (the port runs no per-view cache, the pinned default is view caching off, and Ruby's off status answers :yield), with the dispatch logger (cache_action.rb:24-27 log_cache_action) collapsing to nothing because the pinned body's log line is commented out. The pinned bytes were executed for the row's probes.",
  },
  "reg-treewalk-c2-content-rb-20-120" => {
    "def" => "find_chunks",
    "reason" => "The port carries five of the row's sixteen defs. The eleven it does not carry are the CHUNK-QUERY surface: `find_chunks` (content.rb:38-41, the chunks of a given type in a content), `has_chunk?` (content.rb:43-45), `custom_process_chunks` (content.rb:54-62), `each_chunk` (content.rb:64-71), `without_nests` (content.rb:99-101), `without_references` (content.rb:103-105), `without_chunks` (content.rb:107-109), `strip_chunks` (content.rb:118-122) and the private helpers behind them (interpret_chunk_type at :124, stash_chunks at :137, resolve_format at :154). The port's chunk surface is the RENDERER's nest syntax (src/card/render/nest-syntax.ts, which cites card-mod-content-0.20.0 lib/card/content/chunk/nest.rb and reproduces Ruby's chunker for the nest class) and it does not carry Ruby's chunk QUERY API, so the port binds no function for these eleven. The port's own citations of lib/card/content.rb name the parts it does carry (src/card/follow/follow-form-shapes.ts:31 and :34 cite lib/card/content.rb:68-70 for the content output).",
  },
  "reg-treewalk-c2-subcards-rb-subcards-add-all-args-relate-remove-rb" => {
    "def" => "add_hash",
    "reason" => "NONE: this row has no gap. The port saves a card's subcards by walking the posted tree, and it now names where each piece of Ruby's Subcards collection API lives in its own source (src/card/actions/card-action-engine.ts, the block after blankNewSubcard): the stage catch-up walk (subcards.rb:44-48 catch_up_to_stage) collapses into the engine's own staging (dispatchSubcardEarlyPhases fires each posted entry's early-stage dispatches at the branch position Ruby's director would); the keys-set delegation (subcards.rb:57-59 respond_to_missing?) has no port counterpart because there is no collection object to delegate from; the entry iteration (subcards.rb:77-79 each_card) and the keyed iteration (subcards.rb:83-88 each_with_key) collapse into the engine's Object.entries walk over the posted tree; the fetch-or-new per key (subcards.rb:90-92 fetch_subcard) collapses into fetchByName plus the create path per entry; the key normalization and name absolutization (subcards.rb:96-110 subcard_key, absolutize_subcard_name) collapse into the engine's leading-plus parse against the main name; the three-way entry dispatch (subcards/add.rb:32-38 add), the hash form (add.rb:40-46 add_hash), the joint-prepend form (add.rb:48-51 add_child), the staged constructions (add.rb:54-76 new_by_card, new_by_attributes, initialize_by_attributes) and the many-entry dispatch (add.rb:81-93 multi_add) collapse into the posted field shape, the tree walk, subcardCreateInput's superActionId chain and blankNewSubcard's blank skip; the staged-content reader (subcards/all.rb:24-26 subcard_content) collapses into the entry's content field; the drop-by-field form (subcards/all.rb:61-63 drop_field) and the staged-removal family (subcards/remove.rb:5-40 remove_child, remove, clear, clear_key, deep_clear) have no port counterpart because the port has no staged collection to edit - a posted trash arm routes to trashInWriter, which is the deck's own deletion semantics; and the args extraction (subcards/args.rb:5-39 extract_subcard_args!, safe_subcard_args, extract_explicit_fields, extract_implicit_fields) collapses into the request parser's subcardTree and plus-key grammar (write-routes.ts:449-456). The pinned bytes were executed for the row's probes.",
  },
  "reg-treewalk-d3" => {
    "def" => "run",
    "reason" => "NONE: this row has no gap. The port is not Rails and has no generator, and the port's provisioning surface now names where each generator def went in its own source (src/server/first-run-routes.ts, the generator-surface block): the install menu (interactive.rb:17-31 run, :34-36 dev_options?, :38-40 config_path, :42-47 bundle_exec, the menu-entry family :59-125) collapses to absence because the port provisions a deck through the first-run journey plus the boot seed (src/card/auth/boot-seed.ts), not an interactive installer; the deck generator's step methods (deck_generator.rb:19-21 databases, :52-54 banner, :58-66 core_files, :69-71 empty_dirs, :73-78 dotfiles, :80-93 config, :95-100 public, :102-104 spring, :106-109 script, :111-122 spec, :124-135 seed_data) collapse to absence because there is no Rails app to scaffold - no Gemfile, config.ru, Rakefile, database.yml, puma, spring, public or spec tree; the migration generator (migration_generator.rb:19-23 create_migration_file, :27-29 mod_object, :31-33 migration_path, :35-37 migration_type, :39-41 migration_object, :43-45 set_local_assigns!) collapses into the deploy migrations (src/server/deploy-migrations.ts); and the mod and set generators (mod_generator.rb:7-16 create_mod, :18-20 root_files, :31-35 data_dir, set_generator.rb:17-20 create_files) collapse to absence because the port's mods and set modules are read from the deck corpus, not scaffolded. The pinned bytes were executed for the row's probes."
  },
  "reg-treewalk-e3" => {
    "def" => "up",
    "reason" => "NONE: this row has no gap. The port never replays the pinned migration history, and its schema module now says so in its own source (src/server/schema.ts, the migration-history block): each migration entrypoint (up, and the two change-method files 20200718051236 and 20200805200729) collapses into the folded schema, because db/schema.sqlite.sql (what the engine runs; the fetch test storage installs it) IS the history's result, the deck corpus arrived already migrated by the old system, and a fresh provisioned database receives the folded schema from the deploy chain's first migration; the migration-scoped connection accessor (20200805200729:38 connection) collapses into the engine's driver layer; the inflection transform's word list (20120611203506:4 word) and the user-data transform's field helper (20140307231621:30 field_content) collapse into the corpus; the layout migration's helpers (20180905061537:26 body_tag and :56 missing) collapse into the render layer; and the history-cleanup helper (20191115160748:18 create_only_actions) collapses into the folded schema. Forward schema changes are the deploy migrations' numbered SQL files (src/server/deploy-migrations.ts). The pinned bytes were executed for the row's probes."
  },
  "reg-treewalk-e5" => {
    "def" => "add_opt",
    "reason" => "The row is the deck's RAKE TASKS and its admin config - the six rake task files under mod/core/lib/tasks/ and config/admin.yml with the two locales. The port has no rake task runner: its equivalents are commands the deploy scripts invoke (the seed path at src/card/auth/boot-seed.ts) and the admin configuration is the port's own admin runtime (src/card/mod-loader/mods/core-admin-runtime.ts), which reads the deck's admin config by its own mechanism. The seventeen defs the port does not carry are the rake task CLI and its option parsing (add_opt, key_to_option_description, failing_loudly and the rest of card.rake's surface, plus the seed and migrate tasks' own methods), and the nine that measure SKIP are their private helpers.",
  },
  "reg-treewalk-d1" => {
    "def" => "initialize_nested",
    "reason" => "NONE: this row has no gap. The port is not Rails and has no monkey patches, and the port's own source names where each core extension and patch went: the ActiveRecord batching patch collapses into the port's chunked-row reads (src/server/chunked-row-reads.ts: active_record.rb:20-37 pluck_in_batches and its four helpers :39-76 are the chunk walker, cursor step, column selection and filtering); the better_errors tmp-frame patch collapses to absence because the port generates no tmp set files (src/server/server-error-debugger-arm.ts: better_errors.rb:16-19 corrections, :21-32 real_filename_and_line_offset, :41-43 tmp_file?, :45-50 correct_tmp_file, :10-14 included); the Kaminari URL patch collapses into the paging module's own link composition (src/card/render/search-paging.ts: kaminari.rb:11-17 page_url_for, :21-38 params_for, :5-9 included); the callback-condition patch collapses into the event dispatcher's own condition walk (src/card/mod-loader/mod-event-dispatch.ts: active_support.rb:7-9 applies?); the I18n demarcation hook collapses to the identity path the port always runs (src/card/i18n/i18n.ts: internationalization.rb:24-30 transform_text); the Hash nested-write patch collapses to absence with its one runtime caller named - the board view the port's own card-mod-edit file lists as not ported (src/card/mod-loader/mods/card-mod-edit.ts: hash.rb:64-76 bury, :78-82 validate_bury_key!); and the Hash, Module, Kernel and Object core extensions collapse into the port's Map registries and typed records (src/card/mod-loader/mod-registrar.ts: hash.rb:36-61 css_merge, css_merge!, string_merge, string_merge!, :17-22 initialize_nested, kernel.rb:3-10 suppress_warnings, module.rb:3-13 const_get_if_defined, const_remove_if_defined, const_get_or_set, object.rb:9-27 deep_clone, :60-64 deep_clone_instance_variables). The pinned bytes were executed for the row's probes."
  },
  "reg-treewalk-d2" => {
    "def" => "gem_root",
    "reason" => "NONE: this row has no gap. The port is not Rails and has no cardio host, and the port's own source names where each host def went: the set-loader machinery collapses into the mod loader's manifest-driven phases and the wasm route for unported Ruby mods (src/card/mod-loader.ts, the set-loader block: loader.rb:30-77, set_loader.rb, set_pattern_loader.rb, set_template.rb, module_template.rb, load_strategy.rb, tmp_files.rb, pattern_tmp_files.rb, set_tmp_files.rb, set_binding_magic.rb, eval.rb, dirs.rb, mod/class_methods.rb, mod/card_source.rb, mod/remote_source.rb, yaml_dump.rb, mod.rb - the tmp-file codegen, the constant surgery, the asset-card installer and the pod sources have no job left when registrations are parsed or evaluated directly); the seed, dump and cleanup machinery collapses into the boot seed and the engine's delete path (src/card/auth/boot-seed.ts: seed.rb:48-104, eat.rb:38-74, sow.rb:76-88, utils.rb:34-71, version.rb:13-15); the migration bookkeeping collapses into the folded schema and the deploy ledger (src/server/schema.ts: migration.rb:14-72, assumption.rb:5-27, port.rb:5-36, stamp.rb:25-27, transform.rb:15-21); and the Rails CLI layer collapses to absence because the port's runtime is its own worker and server (src/server/first-run-routes.ts: cardio.rb, the command/ directory, deck_helper.rb, mod_base.rb, rails_overrides.rb, generators.rb, railtie.rb:111 require_mod_gem, script_loader.rb). The pinned bytes were executed for the row's probes."
  },
  "reg-treewalk-c2-set-rb-set-28" => {
    "def" => "ensure_set",
    "reason" => "The port carries one hundred and forty-two of the row's two hundred and forty defs. The ninety-eight it does not carry are the SET-MODULE DSL's own generators and registries: the set definition surface (ensure_set, define_set_from_error, stage_method, define_set, the event and view method factories, the format-module registration, the inheritance and pattern lookups) and the options surface (the required_field helpers, the trait helpers, the i18n scope, the haml paths, the skip_and_trigger surface). The port carries the set-module DECLARATION surface by a different mechanism - the mod loader reads the deck's set files and the mod manifest records the registrations (src/card/mod-loader/mod-registrar.ts and src/card/mod-loader.ts, which cite lib/card/set/event.rb and lib/card/set/trait.rb) - and the port binds no generator function under Ruby's names.",
  },
  "reg-treewalk-c2-director-rb-director-rb-9" => {
    "def" => "act_director",
    "reason" => "The port carries seventy-one of the row's one hundred and nineteen defs. The forty-eight it does not carry are the act-lifecycle machinery of the nine director/ sub-files: the run and stage walk (director/run.rb, director/stages.rb), the store (director/store.rb), the phases (director/phases.rb), the class methods (director/class_methods.rb), the card-class helpers (director/card_class.rb), the event-delay pair (director/event_delay.rb), the act entry points (director/all.rb) and the subdirector array (director/subdirector_array.rb). The row's own director.rb surface is CLOSED: the port's own source names all eleven of its methods (src/card/history/write-path.ts, the ActWriter class doc), and the port carries the act's main director, the act's sharing and the joining card by the writer's two pointers (the act card id and the act id), while the registry methods and the per-card stage index have no counterpart because the port holds no director registry and no director chain. The port's action engine runs the act's stages in one call (src/card/actions/card-action-engine.ts).",
  },
  "reg-treewalk-c2-format-rb-format-content-context-names-render-regi" => {
    "def" => "require_card_to_initialize!",
    "reason" => "The port carries fifty-six of the row's seventy-six defs. The twenty it does not carry are the FORMAT MODULE's own Rails-facing surface: require_card_to_initialize! (the guard that forces a card to load before a format renders), the mime_type and the context_names_to_params round trip, the render and wrapper methods, and the registration helpers. The port carries the format surface by a different mechanism - the port's format module is the renderer's own (src/card/render/format.ts) and its registrations are the mod loader's - and the port binds no Rails-facing format function under Ruby's names.",
  },
  "reg-treewalk-c2-fetch-rb-fetch-all-card-class-results-retrieve-sto" => {
    "def" => "validate_opts!",
    "reason" => "The port carries forty-eight of the row's fifty-seven defs. The nine it does not carry are the FETCH OPTIONS and the result helpers: validate_opts! (fetch.rb:34-38, the guard that refuses a contradictory options pair), the newish and the refresh helpers (fetch/card_class.rb), the results helpers (fetch/results.rb) and the fetch/all.rb field traversal. The port carries the fetch path's own guard by a different mechanism - src/card/fetch.ts:223-226 checks the same contradiction (a `new` option with skip_virtual) - and the port binds no function under Ruby's names.",
  },
  "reg-treewalk-c2-name-rb-name-all-all-descendants-all-parts-card-cl" => {
    "def" => "update_superleft",
    "reason" => "The port carries forty-seven of the row's fifty-five defs. The eight it does not carry are the SAVE-TIME supercard/subcard GRAPH and the write-path id hooks: update_superleft's @superleft memo and update_subcard_names' walk over the unsaved subcards (name/all.rb:47-56), superize_name, the parts writer's id resolution with its after-store hook (write_card_or_id, when_id_exists, with_id_after_store, name/all/parts.rb:43-62), and the field readers field_cards and field_names (name/all/descendants.rb:9-14). The port's save path carries the rename cascade through its own name events and the subcard act (src/card/actions/card-action-engine.ts, the name_events map in its header), so the in-memory graph those defs serve has no port counterpart to update; the construction half the reason used to name (new_from_parts, codename_or_string) now measures PORTED-INLINE against src/card/name.ts.",
  },
  "reg-treewalk-e1" => {
    "def" => "section_title",
    "reason" => "NONE: this row has no gap. The port carries the core mod by a different mechanism and now names where each def went in its own source: the write-path set modules are named in the action engine (src/card/actions/card-action-engine.ts, the core-mod block: assign_attributes.rb:23-31 assign_or_newish, :41-48 prepare_assignment_args, :51-54 assign_with_set_modules, :57-62 assign_with_subcards; initialize.rb:11-33 with_normalized_new_args, delete_junk_args, normalize_type_args, normalize_content_args, :45-50 handle_set_modules, :72-74 include_set_module, :57-59 initial_name; autoname.rb:14-17 autoname?; result.rb:30-33 aborting; states.rb:99-101 user_changes?; content.rb:38-40 blank_comment?; subcards.rb:15-19 trashed_left?, :22-25 same_field?; trash.rb:74-76 db_attributes, :78-88 delete_as_subcard; type.rb:40-46 type_name_or_default, type_cardname, :82-86 normalize_type_attributes - each collapsing into the engine's create-or-update resolution, typed inputs, posted-tree walk, set_autoname carry, event walk and delete path), and the admin-config and mod-card surface is named in the core admin runtime (src/card/mod-loader/mods/core-admin-runtime.ts, the admin block: mod.rb:201-211 load_admin_config, :216-218 admin_config_path, :176-178 admin_config_section, :196-200 admin_config_objects_by_category, admin.rb:71-73 section_title, :109-124 admin_config_group_by_properties, mod.rb:110-112 styles?, cardtype.rb:7-9 create_ok?, utils.rb:1-3 mod_path - each collapsing into the ADMIN_CONFIG transcription, the mod-asset tables, the permission layer and MOD_SPECS that runtime already carries). The pinned bytes were executed for the row's probes."
  },
  "reg-treewalk-c2-mark-rb" => {
    "def" => "cardish",
    "reason" => "The port carries two of the row's three defs: id_or_name (src/card/mod-loader/mods/card-mod-virtual.ts:400, which cites card-1.110.0 lib/card/mark.rb:20-23 by line, and src/card/fetch/retrieve.ts, whose `normalizeMark` carries the same behaviour) and id_from_mark (src/card/fetch/retrieve.ts:135, cited as lib/card/mark.rb). The one gap is `cardish` (mark.rb:9-15), the method that returns a Card instance UNCHANGED and fetches anything else with an empty options hash. The port's fetch path carries the BEHAVIOUR - a Card record mark resolves through src/card/fetch/retrieve.ts:154, `if (isCardRecord(mark)) return mark.id;`, which is the `is_a? Card` arm - but the port's own map does not claim mark.rb#cardish anywhere, and a name match in an unrelated file is not a claim. The row's verdict is that the behaviour is present and the citation is not.",
  },
  "reg-treewalk-c2-auth-token-rb-10-33" => {
    "def" => "encode",
    "reason" => "NONE: this row has no gap. The port carries all five of the row's defs and cites the Ruby in each case: encode is the port's `encodeAuthToken` (src/card/auth/token.ts:309), validate! is at token.ts:466, decode at token.ts:370 and expiration at token.ts:169, all in the file whose first line says it is \"the port of card-1.110.0/lib/card/auth/token.rb\"; and signin_with_token is the port's `signinFromToken` (src/server/request-authenticators.ts:123), which cites card-1.110.0/lib/card/auth/token.rb:38-41 by name.",
  },
  "reg-treewalk-c2-auth-setup-rb-9-15-39-51" => {
    "def" => "instant_account_activation",
    "reason" => "The port carries the row's four CENSUS methods and names them in its own header map (src/card/auth/first-run-setup.ts:36-44, which maps card-1.110.0/lib/card/auth/setup.rb by line): needs_setup?, needs_setup_if_no_accounts, user_account_cql and user_account_count. The row's three remaining defs are the deck's own TEST surface, and the port names the two of them it does not carry, with the mechanism, in its own source (src/card/auth/first-run-setup.ts): simulate_setup! (setup.rb:18) is the old system's test hook, called only from the pinned deck's own cucumber environment (decko-0.20.0/features/support/decko_env.rb:33,37) and never from deck behaviour, so the rig measures it as the deck's inert library API; instant_account_activation (setup.rb:24) is a test-only helper the pinned deck never calls at all, and the pinned bytes show why it cannot run outside a test harness - with no arguments it calls simulate_needs_setup!, which no gem defines; user_account_ids (setup.rb:39) is the id LIST behind user_account_count, and the port counts the accounts directly (countUserAccounts, src/card/auth/first-run-setup.ts:311) and never needs the list.",
  },
}.freeze

gaps = row["defs"].select { |d| d["disposition"] == "GAP" }
gap_reason = nil
if gaps.empty?
  # A row with no gap still has a note: the dispositions it DID reach,
  # so a reader sees what the row measured and not only that it is
  # clean. The note is the row's own, and the capture checks it against
  # the rig: a note that names a def the rig did not classify that way
  # is a note for a different row.
  entry = GAP_REASONS[ROW_ID]
  if entry
    unless row["defs"].any? { |d| d["name"] == entry["def"] }
      raise "the note for #{ROW_ID} names #{entry['def'].inspect}, which the rig did not measure"
    end
    gap_reason = entry.merge("note" => true)
  end
else
  entry = GAP_REASONS[ROW_ID]
  if entry.nil?
    raise "the row #{ROW_ID} has #{gaps.length} gap(s) and no named reason in this capture; a gap with no named reason is a gap with no claim on the reader"
  end
  flagged = gaps.map { |g| g["name"] }
  unless flagged.include?(entry["def"])
    raise "the gap reason for #{ROW_ID} names #{entry['def'].inspect}, which the rig does not flag as a gap (the rig flags: #{flagged.inspect})"
  end
  gap_reason = entry
end

output = {
  "row" => ROW_ID,
  "rubyFiles" => row["rubyFiles"],
  "rubySources" => row["rubySources"],
  "defCount" => row["defCount"],
  "counts" => row["counts"],
  "probeCount" => results.length,
  "gapReason" => gap_reason,
  "probes" => results,
  "defs" => row["defs"].map do |d|
    {
      "name" => d["name"],
      "file" => d["file"],
      "line" => d["line"],
      "disposition" => d["disposition"],
      "portBinding" => d["portBinding"],
      "portBindingCited" => d["portBindingCited"],
      "inlineSite" => d["inlineSite"],
      "visibility" => d["visibility"],
      "collapse" => d["collapse"],
      "headerCitation" => d["headerCitation"],
      "reachability" => d["reachability"],
      "pinnedCallSites" => d["pinnedCallSites"],
      "pinnedCallCount" => d["pinnedCallCount"],
    }
  end,
}
# The capture WRITES its own output when an output path is given, and
# prints it otherwise. The write exists because some pinned methods
# shell out (the Rails host's generator prompts run a command), and a
# shell-out writes its own text to stdout - which would land in the
# middle of the JSON.
if ENV["DECKO_TREEWALK_CAPTURE_OUT"] && !ENV["DECKO_TREEWALK_CAPTURE_OUT"].empty?
  File.write(ENV["DECKO_TREEWALK_CAPTURE_OUT"], JSON.pretty_generate(output))
else
  puts JSON.pretty_generate(output)
  puts
end
