# oracle-capture-comment-event-rows-ruby.rb - the PINNED comment mod's own event
# body, EXECUTED over recording doubles.
#
# WHAT THIS IS. One register row in the events family grades the port on ONE
# pinned event body:
#
#   card-mod-comment-0.20.0/set/all/comment.rb:5-12 add_comment
#     event :add_comment, :prepare_to_store, on: :save, when: :comment do
#       Env.session[:comment_author] = comment_author if Env.session
#       return unless comment.present?
#
#       self.content =
#         [content, format.comment_with_signature].compact.join "\n<hr>\n"
#       self.comment = nil
#     end
#
# The capture EXECUTES those bytes over recording doubles and records what
# the body ASKED FOR: the content it wrote (and the join it wrote it with),
# the comment it cleared, and the session author it set.
#
# THE PINNED HELPERS. The body's `comment_author` (comment.rb:16-19) is the
# PINNED method, defined on the probe with its own signature and body, so the
# author the body writes into the session is the gem's own answer. The
# body's `format.comment_with_signature` is a FORMAT method (the mod's
# `format do ... end` block, comment.rb:27-37); the format's own bytes are
# pinned by the mod's committed capture (fixtures/oracle-surfaces/comment.jsonl),
# so the double here RECORDS the call and answers with a marker, and the
# capture says so in its own record.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-comment-event-rows-ruby.rb <row-slug> \
#     > fixtures/captured/<row-slug>-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The probe list is fixed, so a re-run on the same gemset is
# byte-stable.

require "json"

require_relative "oracle-capture-pinned-event-bodies-ruby"

EVENT_FILE = "card-mod-comment-0.20.0/set/all/comment.rb"

SLUG = ARGV[0]
abort("usage: ruby oracle-capture-comment-event-rows-ruby.rb <row-slug>") if SLUG.nil? || SLUG.empty?

PinnedEvent.load_pinned_libs!
require "active_support/core_ext/object/blank" # the pinned `comment.present?`

# The deck's request-scoped environment. The body reads Env.session and
# Env.params.
module Env
  module_function

  def session
    @session
  end

  def session=(value)
    @session = value
  end

  def params
    @params ||= {}
  end

  def params=(value)
    @params = value
  end
end

# The card's format: the body asks it for the comment's signature. The
# double RECORDS the call and answers with a marker, because the format's
# own bytes are pinned by the mod's committed capture.
class FormatProbe
  include RecordingCalls

  def comment_with_signature
    record_call("comment_with_signature")
    "<signature>"
  end
end

# The card-side probe.
class CommentProbe
  include RecordingCalls

  attr_reader :errors

  def initialize(comment:, content:)
    @comment = comment
    @content = content
    @errors = RecordingErrors.new
  end

  def errors
    @errors
  end

  def comment
    @comment
  end

  def comment=(value)
    record_call("comment=", value)
    @comment = value
  end

  def content
    @content
  end

  def content=(value)
    record_call("content=", value)
    @content = value
  end

  def format
    @format ||= FormatProbe.new
  end
end

# The pinned method, defined on the probe with the pinned SIGNATURE and body.
def define_pinned(probe, relative, name)
  source = PinnedEvent.method(relative, name)
  declaration = PinnedEvent.pinned_lines(source["file"]).find do |line|
    line["line"] == source["line"]
  end["text"]
  probe.singleton_class.class_eval(
    "#{declaration}\n#{source["body"]}\nend",
    source["file"],
    source["line"]
  )
  source
end

def capture(slug)
  event_source = PinnedEvent.event(EVENT_FILE, "add_comment")
  scenarios = [
    {
      "name" => "a comment on a card with content, no session",
      "comment" => "hello",
      "content" => "old body",
      "session" => nil,
      "params" => {},
    },
    {
      "name" => "an empty comment",
      "comment" => "",
      "content" => "old body",
      "session" => nil,
      "params" => {},
    },
    {
      "name" => "a comment on a card with NO content",
      "comment" => "hello",
      "content" => nil,
      "session" => nil,
      "params" => {},
    },
    {
      "name" => "a comment with a session",
      "comment" => "hello",
      "content" => "old body",
      "session" => {},
      "params" => { "comment_author" => "Joe User" },
    },
  ].freeze
  probes = scenarios.map do |scenario|
    Env.session = scenario["session"]
    Env.params = (scenario["params"] || {}).each_with_object({}) { |(k, v), out| out[k.to_sym] = v }
    probe = CommentProbe.new(comment: scenario["comment"], content: scenario["content"])
    PinnedEvent.define_event_body(probe, event_source)
    define_pinned(probe, EVENT_FILE, "comment_author")
    outcome = PinnedEvent.call_event_body(probe)
    {
      "scenario" => scenario["name"],
      "comment" => scenario["comment"],
      "content_before" => scenario["content"],
      "session_present" => !scenario["session"].nil?,
      "params" => scenario["params"],
      "errors_added" => probe.errors.added,
      "calls" => probe.calls,
      "content_after" => probe.content,
      "comment_after" => probe.comment,
      "session_after" => Env.session,
      "outcome" => outcome,
    }
  end
  {
    "row" => slug,
    "event" => "add_comment",
    "pinned_file" => EVENT_FILE,
    "pinned_declaration" => event_source["declaration"],
    "pinned_declaration_line" => event_source["line"],
    "pinned_body" => event_source["body"],
    "pinned_body_lines" => event_source["body_lines"],
    "pinned_author_method" => PinnedEvent.method(EVENT_FILE, "comment_author")["body"],
    "not_executed" => {
      "method" => "format.comment_with_signature",
      "why" => "the format's own bytes are pinned by the mod's committed capture (fixtures/oracle-surfaces/comment.jsonl), so the double records the call and answers with a marker",
    },
    "scenarios" => probes,
  }
end

puts JSON.pretty_generate(capture(SLUG))
