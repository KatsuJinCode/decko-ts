# session-sticky-comment-author.rb — static-ruby oracle capture for
# card-mod-comment's event :add_comment author resolution (the behavior the
# mod-porting-harness lane demonstrates end to end).
#
# WHAT RUNS: the gem's own source lines, extracted VERBATIM from
# <gem>/set/all/comment.rb by line range (1-indexed, inclusive) and
# evaluated into minimal doubles. The BEHAVIOR is the gem's; the ENVIRONMENT
# is stubbed, and every stub is listed here:
#
#   Env            - Decko's Env (lib/card/env.rb): a per-request params
#                    hash + a session hash. Stubbed as plain hashes; the
#                    real semantics (env.rb:21-23) are modeled: session is
#                    a Hash (empty when no request), never nil.
#   Auth           - Decko's Auth (lib/card/auth.rb): signed_in? +
#                    Auth.current.name. Stubbed with explicit state.
#   Time.zone.now  - Rails' TimeWithZone clock. Frozen to
#                    "2026-10-02 12:00:00 UTC" (Ruby Time#to_s shape).
#   String#present?- ActiveSupport's blankness extension (the event body
#                    calls comment.present?). Stubbed as !empty? — the same
#                    semantics AS core_ext/object/blank gives non-blank
#                    strings (whitespace-only is present? in AS too).
#   wrap_with      - Decko's format helper (lib/card/format.rb): wraps the
#                    yielded bytes in the tag + class. Stubbed to the div
#                    shape the live capture (fixtures/oracle-surfaces/
#                    comment.jsonl) shows: <div class="...">...</div>.
#   CardDouble     - the save's card: content accessor (Ruby's self.content=),
#                    comment accessor, format -> FormatDouble, action :update.
#   FormatDouble   - the html format instance the event body calls
#                    comment_with_signature on; carries the gem's three
#                    format methods verbatim.
#
# Each JSONL line on stdout carries its gemSource line range so the
# harness's provenance discipline (capture command) can cite exactly which
# verbatim bytes produced the oracle.
#
# Usage: ruby session-sticky-comment-author.rb <gem-path>
#   (stdout: JSONL; scratch state: none beyond memory)

require "json"
require "ostruct"

gem_path = ARGV[0] or abort "usage: ruby #{File.basename(__FILE__)} <gem-path>"
source_file = File.join(gem_path, "set", "all", "comment.rb")
abort "gem source not found: #{source_file}" unless File.file?(source_file)
src_lines = File.readlines(source_file)

# 1-indexed inclusive region extraction (verbatim).
region = lambda do |a, b|
  src_lines[(a - 1)...b].join
end

# --- the stubbed environment ------------------------------------------------

class StubEnv
  class << self
    attr_accessor :session, :params
  end
  self.params = {}
end
Env = StubEnv

class StubAuth
  class << self
    attr_accessor :signed_in_state, :current_name
    def signed_in?
      @signed_in_state
    end
    def current
      OpenStruct.new(name: @current_name)
    end
  end
end
Auth = StubAuth

class StubZoneClock
  def self.now
    "2026-10-02 12:00:00 UTC"
  end
end

# Time.zone.now — the signature's clock (comment.rb:34).
def Time.zone
  StubZoneClock
end

class String
  # ActiveSupport core_ext/object/blank for plain strings: present? == !empty?
  def present?
    !empty?
  end
end

# --- the doubles that host the verbatim gem code -----------------------------

class FormatDouble
  attr_reader :card
  def initialize(card)
    @card = card
  end

  # Decko's wrap_with (lib/card/format.rb) — the div shape the live capture
  # shows for the comment signature (fixtures/oracle-surfaces/comment.jsonl:
  # <div class="w-comment-author">...</div>).
  def wrap_with(tag, **opts)
    class_attr = opts[:class] ? " class=\"#{opts[:class]}\"" : ""
    "<#{tag}#{class_attr}>#{yield}</#{tag}>"
  end
end

# verbatim: comment.rb:28-30, 32-36, 38-44 (the format block's three defs;
# class_eval at top level so the `region` extractor is in scope).
FormatDouble.class_eval region.call(28, 30) + "\n" + region.call(32, 36) + "\n" + region.call(38, 44)

class CardDouble
  attr_accessor :content, :comment

  def initialize(content, comment)
    @content = content
    @comment = comment
  end

  def action
    :update
  end

  def format
    FormatDouble.new(self)
  end
end

# verbatim: comment.rb:14-25 (attr_writer :comment_author +
# comment_author reader + clean_comment) and comment.rb:6-11 — the
# event :add_comment BODY (the
# `event :add_comment, :prepare_to_store, on: :save, when: :comment do`
# wrapper stays in the gem; the port under test carries the wrapper's
# options in its registration, this capture pins the body's semantics).
CardDouble.class_eval region.call(14, 25)
CardDouble.class_eval "def run_add_comment_event\n" + region.call(6, 11) + "  end\n"

# --- drive the scenarios ------------------------------------------------------

def emit(obj)
  puts JSON.generate(obj)
end

FROZEN_NOW = "2026-10-02 12:00:00 UTC"

def run_save(content_before, params, session, signed_in:, signed_name: nil)
  Env.params = params
  Env.session = session
  Auth.signed_in_state = signed_in
  Auth.current_name = signed_name
  card = CardDouble.new(content_before, params[:comment])
  card.run_add_comment_event
  card
end

# Scenario 1: first anonymous save, the commenter declares a name
# (params[:comment_author]); the event resolves the author, writes it to the
# session (comment.rb:6), and the signature carries "Name (Not signed in)".
s1_session = {}
c1 = run_save("body before comment",
              { comment: "hello", comment_author: "the project owner" }, s1_session,
              signed_in: false)
emit(behaviorId: "event:add_comment",
     kind: "event-state-machine",
     scenario: "first_save_anonymous_declares_name",
     gemSource: "set/all/comment.rb:5-12,14-25,28-44",
     request: { comment: "hello", comment_author: "the project owner" },
     auth: { signedIn: false, name: nil },
     sessionBefore: { comment_author: nil },
     contentBefore: "body before comment",
     contentAfter: c1.content,
     sessionAfter: s1_session)

# Scenario 2 (THE session-sticky pin): a SECOND save with NO author param,
# same session — Ruby's reader (comment.rb:16-19) takes the session arm
# first, so the second comment signs "the project owner (Not signed in)" again.
s2_session = { comment_author: "the project owner" }
c2 = run_save("body before comment\n<hr>\n<p>hello</p>\n<div class=\"w-comment-author\">the project owner (Not signed in).....#{FROZEN_NOW}</div>",
              { comment: "again" }, s2_session,
              signed_in: false)
emit(behaviorId: "event:add_comment",
     kind: "event-state-machine",
     scenario: "second_save_session_sticky",
     gemSource: "set/all/comment.rb:6,16-19",
     request: { comment: "again" },
     auth: { signedIn: false, name: nil },
     sessionBefore: { comment_author: "the project owner" },
     contentBefore: "body before comment\n<hr>\n<p>hello</p>\n<div class=\"w-comment-author\">the project owner (Not signed in).....#{FROZEN_NOW}</div>",
     contentAfter: c2.content,
     sessionAfter: s2_session)

# Scenario 3 (control): EMPTY session (the real "no session" shape —
# card-1.110.0 lib/card/env.rb:21-23 `@session ||= request&.session || {}`
# is never nil, so the event's `if Env.session` write guard passes with an
# empty hash too; the author falls to params, else "Anonymous").
c3 = run_save("body", { comment: "x" }, {}, signed_in: false)
emit(behaviorId: "event:add_comment",
     kind: "event-state-machine",
     scenario: "no_session_control_anonymous",
     gemSource: "set/all/comment.rb:6,16-19",
     request: { comment: "x" },
     auth: { signedIn: false, name: nil },
     sessionBefore: { },
     contentBefore: "body",
     contentAfter: c3.content,
     sessionAfter: Env.session)

# Scenario 4: signed-in save — the SIGNATURE uses the format's signed-in arm
# ("[[Joe User]]", comment.rb:38-44) while the session write records the
# CARD-level resolution (session/params/Anonymous, comment.rb:16-19) — the
# two resolutions are different methods and the verbatim code shows both.
s4_session = {}
c4 = run_save("body", { comment: "hi" }, s4_session,
              signed_in: true, signed_name: "Joe User")
emit(behaviorId: "event:add_comment",
     kind: "event-state-machine",
     scenario: "signed_in_signature_vs_card_level_session_write",
     gemSource: "set/all/comment.rb:6,16-19,38-44",
     request: { comment: "hi" },
     auth: { signedIn: true, name: "Joe User" },
     sessionBefore: { comment_author: nil },
     contentBefore: "body",
     contentAfter: c4.content,
     sessionAfter: s4_session)

# Scenario 5: blank comment body — `return unless comment.present?`
# (comment.rb:7): the session write ALREADY happened (line 6), the content
# does NOT change. The sticky write is not gated on a non-blank comment.
s5_session = {}
c5 = run_save("body", { comment: "", comment_author: "the project owner" }, s5_session,
              signed_in: false)
emit(behaviorId: "event:add_comment",
     kind: "event-state-machine",
     scenario: "blank_comment_still_sticks_author",
     gemSource: "set/all/comment.rb:6-7",
     request: { comment: "", comment_author: "the project owner" },
     auth: { signedIn: false, name: nil },
     sessionBefore: { comment_author: nil },
     contentBefore: "body",
     contentAfter: c5.content,
     sessionAfter: s5_session)

# Scenario 6: clean_comment's multiline wrap (comment.rb:21-25) — the bytes
# the appended block rides on (blank line -> &nbsp;).
c6 = CardDouble.new("body", "line one\n\nline three")
emit(behaviorId: "event:add_comment",
     kind: "pure-bytes",
     scenario: "clean_comment_multiline",
     gemSource: "set/all/comment.rb:21-25",
     bytes: c6.clean_comment)
