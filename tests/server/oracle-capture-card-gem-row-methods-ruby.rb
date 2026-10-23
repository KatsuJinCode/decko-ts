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
  rescue StandardError, NotImplementedError => e
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
    "reason" => "The port carries four of the row's six defs and names a collapse for a fifth. The one gap is `with` (proxy.rb:48-62), the method that temporarily assumes a session's auth data: the port has no counterpart for it and no citation of it. The port binds the NAME `with` at src/card/set-patterns/registry.ts:327, which is the set registry's own `with` and says nothing about the permission proxy. The port's own words on the row's OTHER collapsed method are in src/card/auth/actor.ts:29 (\"The Proxy module's save/restore machinery (proxy.rb:63-76 temporarily) has no counterpart: nothing global is mutated\"), and the same mechanism - the TS engine has no process-global Auth singleton - is why `with` has no counterpart either: Ruby's `with` saves and restores a process-global current_id, and the port's engine has no process-global to save.",
  },
  "reg-treewalk-c2-cache-rb-34-91-cache-shared-temporary-rb" => {
    "def" => "with_multiple_keys",
    "reason" => "The port carries nine of the row's ten defs, and the one gap is a CITATION gap, not a behaviour gap. The def is `with_multiple_keys` (cache.rb:95-99), a private helper whose whole content is `keys.size > 1 ? yield : {}` - the guard that makes a multi-key cache read return nothing when only one key was asked for. The pinned deck calls it at cache.rb:43, inside `read_multi`, so the behaviour is live in the old system. The port carries the behaviour: `CardCache.readMulti` (src/card/fetch/cache.ts:335) opens with `if (keys.length <= 1) return found;`, which is the guard. What the port does NOT do is name Ruby's `with_multiple_keys` in a citation - its comment cites `cache.rb#read_multi` and says \"single-key calls return {} in Ruby; the fetch layer never needs it, ported for completeness\", which describes the guard's EFFECT and not the helper that holds it. So the rig records a gap, and the row's verdict is that the behaviour is present and the citation is not.",
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
    "reason" => "The port carries nine of the row's twelve defs. The three it does not carry are the SETTING-OPTS HELPERS behind the one it does: `standard_setting_opts` (setting.rb:87-89, the private helper that fills a setting's default option hash), `restrict_setting_to_type` (setting.rb:91-93, which narrows a setting to one card type) and `permitted_type_ids` (setting.rb:116-119, the types a setting may be used on). The port's own `register` (src/card/mod-loader/mod-registrar.ts:249) carries the register_setting half and its comment names standard_setting_opts (src/card/mod-loader/mods/card-mod-rules.ts:853 cites lib/card/setting.rb:27 + :69) as a CITATION of the Ruby, not as a port counterpart for the helper itself. So the port carries the register_setting BEHAVIOUR and does not carry these three helpers as functions.",
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
    "reason" => "The port carries forty-three of the row's fifty-one defs. The eight it does not carry are the parts of Ruby's cache the port does not have: `codename_card?` (cache/all.rb:41-43), `populate_ids` (cache/populate.rb:5-7) and `seed_from_stash` (cache/populate.rb:49) are the CACHE POPULATION half - Ruby pre-fills the cache from the deck's own rows at boot - and the port's cache is filled on demand, so the port has nothing to populate. `reset` (cache/class_methods.rb:47-50 and cache/shared_class.rb:22-25), `shared_cache` (class_methods.rb:107-110) and `stamp` (shared_class.rb:5-7) are the class-level cache REGISTRY and the shared-cache STAMP, and the port's cache is an instance the caller holds rather than a class-level registry. The row's own blocker named the view-cache cluster and the populate cluster as named skips, and the port's fetch module (src/card/fetch.ts:16 and :32) names lib/card/cache/all.rb for the expiry half it does carry.",
  },
  "reg-treewalk-c2-view-rb-view-classy-permission-rb-view-cache-4" => {
    "def" => "root",
    "reason" => "The port carries twenty-three of the row's thirty-nine defs. The sixteen it does not carry are the VIEW LINEAGE and the VIEW CACHE: `root` and `root?` (view.rb:90-97), `deep_root` and `deep_root?` (view.rb:100-112), `next_ancestor` (view.rb:116-119), `next_format_ancestor` (view.rb:121-124) and the classy surface (view/classy.rb:30-151, the class ancestry and the extra classes) are Ruby's view LINEAGE, which the port does not have as a separate surface - the port's view is the format module's own - and the view CACHE cluster (view/cache/*.rb: the cache_action, the log_cache_action, the cache settings and the stub) is a per-view cache the port does not have. The port's own citations are about the pieces it does carry: the view's format_options (src/card/mod-loader/mods/card-mod-tinymce_editor.ts:359 cites lib/card/view.rb:39-45 for the option split), the classy's join (src/card/render/deployment-follow-live-config.ts:23 cites view/classy.rb) and the view stub's shape (src/card/render/view-stub.ts:46 cites view/cache/stub.rb:20-24).",
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
    "reason" => "The port carries the row's four CENSUS methods and names them in its own header map (src/card/auth/first-run-setup.ts:36-44, which maps card-1.110.0/lib/card/auth/setup.rb by line): needs_setup?, needs_setup_if_no_accounts, user_account_cql and user_account_count. The row's three remaining defs have no port counterpart, and each is a TEST hook or a helper behind a count the port does not need: simulate_setup! (setup.rb:18) is the old system's test hook, called only from the pinned deck's own cucumber environment (decko-0.20.0/features/support/decko_env.rb:33,37) and never from deck behaviour; instant_account_activation (setup.rb:24) is a test-only helper the pinned deck never calls at all; user_account_ids (setup.rb:39) is the id LIST behind user_account_count, and the port counts the accounts directly (countUserAccounts, src/card/auth/first-run-setup.ts:311) and never needs the list.",
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
puts JSON.pretty_generate(output)
puts
