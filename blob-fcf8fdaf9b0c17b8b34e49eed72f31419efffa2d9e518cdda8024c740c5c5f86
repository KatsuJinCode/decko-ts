# oracle-capture-rss-format-ruby.rb - the PINNED MOD's own rss format, the
# PINNED MOD's own rss set block, and the PINNED DECK's own answer for the
# rss suffix.
#
# WHY THIS SCRIPT EXISTS: the completeness register's D3 row ([Family]) is
# the rss format, and the register's own port evidence says the port
# answered rss on the edge host only. This row measures the PINNED side:
# what the rss format IS, and what the pinned deck answers for an rss
# request.
#
# The pinned pieces this row measures:
#
#   1. THE CLASS. card-mod-format-0.20.0/lib/card/format/rss_format.rb is
#      a three-line class: `class RssFormat < HtmlFormat` and
#      `register :rss`. It declares NO mime type of its own, so the mime
#      type it answers is HtmlFormat's. The capture records the OWNER of
#      the method, not only its answer, because "the rss format answers
#      text/html" and "the rss format answers application/rss+xml" are
#      different claims and the owner is what settles which one the pinned
#      code makes.
#   2. THE SET BLOCK. card-mod-format-0.20.0/set/all/rss.rb carries the
#      rss format's own show (whose default view is :feed) and the :feed
#      view's own body, whose first line is the config gate:
#      `return "RSS feeds disabled" unless Cardio.config.rss_enabled`.
#      That body is EXECUTED here, both with the stock config value and
#      with the gate open.
#   3. THE CONFIG DEFAULT. card-mod-format-0.20.0/lib/card/mod/format.rb:3
#      is `config.rss_enabled = false`, so the stock answer to a feed
#      request is that sentence.
#   4. THE DECK'S ANSWER. response.rb's own format_name_from_params
#      (decko-0.20.0/lib/card_controller/response.rb:102-105) keeps the
#      rss suffix as :rss, because rss is a REGISTERED format.
#
# The DSL is stood in and the set BLOCK is the pinned bytes: the file is
# evaluated with a recording `format` method that keeps the block, and the
# kept block is class_eval'd onto a probe class that SUBCLASSES the pinned
# rss format class.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-rss-format-ruby.rb \
#     > fixtures/captured/rss-format-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The case list is fixed, so a re-run on the same gemset is
# byte-stable.

require "json"

require_relative "pinned-format-set-block-loader-ruby"

# ---------------------------------------------------------------------------
# the PINNED MOD's own format files, loaded: the registry and the rss
# format's own class body
# ---------------------------------------------------------------------------
registry = load_pinned_format_registry!
raise "the pinned registry did not load" unless registry.is_a?(Hash)

rss_format_class = Card::Format::REGISTRY_CLASSES["rss"]
raise "the pinned mod did not register an rss format class" if rss_format_class.nil?

html_format_class = Card::Format::REGISTRY_CLASSES["html"]
raise "the pinned mod did not register an html format class" if html_format_class.nil?

load_pinned_format_nesting!

# The pinned rss set file opens with `require "builder"`, and the rebuilt
# gemset's load path is REVERSED: the rig unshifts each gem's lib
# directory in sorted order, so the LAST one ends up first and rack's lib
# directory sits ahead of builder's. `require "builder"` would then resolve
# to rack/builder.rb, and rack's own `require "set"` would resolve to the
# card gem's set.rb (the card gem's nested lib/card is on the path too).
# The builder gem's OWN lib directory is put at the front of the load path
# here, so the pinned set file's require resolves to the pinned builder.
$LOAD_PATH.unshift(PinnedDeck.pinned_path("builder-3.3.0/lib"))

# ---------------------------------------------------------------------------
# the probe: the pinned rss format with the pinned set block on it
# ---------------------------------------------------------------------------
class Card
  class RssFormatProbe < Card::Format::RssFormat
    include PinnedFormatProbeStands
  end
end

PinnedFormatSetBlocks.apply!("card-mod-format-0.20.0/set/all/rss.rb", "rss", Card::RssFormatProbe)

# The pinned rss set block declares an initializer of its own
# (set/all/rss.rb:6-9): `def initialize card, args; super; @xml = @parent
# ? @parent.xml : ::Builder::XmlMarkup.new; end`. The rig's Card::Format
# carries no initializer, so the pinned `super` would reach
# Object#initialize with two arguments. The probe's initializer therefore
# sets up the recording stands and the pinned @xml line itself, and the
# pinned initializer's own bytes are quoted in the fixture's sources.
class Card::RssFormatProbe
  def initialize(_card = nil, _args = nil)
    setup_probe_stands
    @parent = nil
    @xml = @parent ? @parent.xml : ::Builder::XmlMarkup.new
  end
end

# ---------------------------------------------------------------------------
# 1 - the format's own class, measured
# ---------------------------------------------------------------------------
#
# The OWNER of the mime type method is the measurement: the rss format
# class declares none, so the method it answers is the html format's, and
# the html format's own answer is text/html.
class_rows = {
  "registered" => registry["registered"].include?("rss"),
  "superclass" => rss_format_class.superclass.to_s,
  "superclassIsHtmlFormat" => rss_format_class.superclass == html_format_class,
  "mimeType" => rss_format_class.allocate.mime_type,
  "mimeTypeOwner" => rss_format_class.instance_method(:mime_type).owner.to_s,
  "declaresItsOwnMimeType" => rss_format_class.instance_method(:mime_type).owner == rss_format_class,
  "htmlMimeType" => html_format_class.allocate.mime_type,
  "baseMimeType" => Card::Format.allocate.mime_type,
  "registryMimeType" => registry["mimeTypes"]["rss"]
}

# ---------------------------------------------------------------------------
# 2 - the config default, from the PINNED mod's own file
# ---------------------------------------------------------------------------
#
# card-mod-format-0.20.0/lib/card/mod/format.rb sets the config values
# when the mod is loaded. The capture loads that file and reads the
# config it wrote, so the default is the pinned file's own value and not a
# value written down here.
PinnedDeck.eval_pinned("card-mod-format-0.20.0/lib/card/mod/format.rb")
config_rows = {
  "rssEnabled" => Cardio.config.rss_enabled,
  "defaultHtmlView" => Cardio.config.default_html_view.to_s,
  "source" => PinnedDeck.pinned_lines("card-mod-format-0.20.0/lib/card/mod/format.rb")
}

# ---------------------------------------------------------------------------
# 3 - the set block's own show arm
# ---------------------------------------------------------------------------
def rss_probe(params: {}, render_answer: nil)
  probe = Card::RssFormatProbe.new
  probe.probe_params = params
  probe.probe_render_answer = render_answer
  probe
end

show_rows = [
  { "label" => "no view named: the default is :feed", "view" => nil },
  { "label" => "a view named", "view" => :open }
].map do |spec|
  probe = rss_probe
  returned = probe.show(spec["view"], {})
  {
    "label" => spec["label"],
    "returned" => returned.to_s,
    "calls" => probe.calls
  }
end

# ---------------------------------------------------------------------------
# 4 - the :feed view's own body, EXECUTED
# ---------------------------------------------------------------------------
#
# The view's block is the pinned bytes. A `return` inside a block is a
# LocalJumpError unless the block is a method body, so the block is
# installed as a singleton method (define_method) and called as one: the
# `return` then returns from the method, exactly as it does in the gem.
feed_block = Card::RssFormatProbe.view_declarations.find { |decl| decl["name"] == "feed" }
raise "the pinned rss set block did not declare a :feed view" if feed_block.nil?

raise "the pinned rss set block did not declare a :feed view" if feed_block["name"] != "feed"

def feed_answer(rss_enabled)
  Cardio.config.rss_enabled = rss_enabled
  probe = rss_probe
  # The declaration's block, installed AS THE METHOD BODY, so the `return`
  # inside it is a method return and not a LocalJumpError. (Wrapping the
  # block in another block and instance_exec'ing it would make the
  # `return` try to return from the place the block was created, which is
  # where the LocalJumpError on the first run came from.)
  block = Card::RssFormatProbe.view_blocks["feed"]
  raise "the pinned :feed view body was not kept" if block.nil?

  probe.define_singleton_method(:feed, &block)
  begin
    { "answer" => probe.feed.to_s }
  rescue StandardError => e
    { "errorClass" => e.class.name, "errorMessage" => e.message }
  ensure
    Cardio.config.rss_enabled = false
  end
end

# The gate-open arm's answer carries the pinned rescue's ERROR text, which
# includes a backtrace with absolute paths and an object address, so the
# raw text is NOT recorded (it would not be byte-stable). What IS recorded
# is the shape: the document the pinned body built, the presence of the
# pinned error marker, and the class of the error the rescue caught.
def feed_answer_open
  raw = feed_answer(true)
  answer = raw["answer"].to_s
  {
    "answerKind" => answer.start_with?("<?xml") ? "xml-document" : "not-xml",
    "containsErrorMarker" => answer.include?("ERROR rendering RSS"),
    "rescuedErrorClass" => answer[/ERROR rendering RSS: #&lt;([A-Za-z]+)/, 1],
    "errorClass" => raw["errorClass"]
  }
end

feed_rows = [
  { "label" => "the stock config value (rss_enabled false)", **feed_answer(false) },
  { "label" => "the gate open (rss_enabled true)", **feed_answer_open }
]

# The view declarations the pinned set block made, by name.
declaration_rows = Card::RssFormatProbe.view_declarations.map do |decl|
  {
    "name" => decl["name"],
    "aliases" => decl["aliases"],
    "opts" => decl["opts"],
    "hasBlock" => decl["hasBlock"]
  }
end

# ---------------------------------------------------------------------------
# 5 - the DECK's own answer for the rss suffix
# ---------------------------------------------------------------------------
PinnedDeck.load_pinned_controller!

class RssNegotiationRequestDouble
  attr_reader :format

  def initialize(format)
    @format = format
  end
end

class RssNegotiationHarness
  include CardController::Response

  attr_accessor :params, :request

  def initialize(params, request)
    @params = params
    @request = request
  end
end

def rss_negotiation_case(label, requested, params: {})
  harness = RssNegotiationHarness.new(params, RssNegotiationRequestDouble.new(requested))
  {
    "label" => label,
    "requested" => requested.to_s,
    "params" => params.transform_keys(&:to_s),
    "requestedFormat" => harness.send(:requested_format).to_s,
    "formatNameFromParams" => harness.send(:format_name_from_params).to_s
  }
end

negotiation_rows = [
  rss_negotiation_case("the rss suffix", "html", params: { format: "rss" }),
  rss_negotiation_case("the rss query door", "html", params: { format: "rss" }),
  rss_negotiation_case("a browser door", "text/html"),
  rss_negotiation_case("an unregistered suffix", "html", params: { format: "rssx" })
]

# ---------------------------------------------------------------------------
# the sources, quoted with line numbers
# ---------------------------------------------------------------------------
sources = {
  "rssFormatClass" => PinnedDeck.pinned_lines("card-mod-format-0.20.0/lib/card/format/rss_format.rb"),
  "rssSet" => PinnedDeck.pinned_lines("card-mod-format-0.20.0/set/all/rss.rb")
                  .select { |row| row["line"].between?(1, 35) },
  "formatModConfig" => PinnedDeck.pinned_lines("card-mod-format-0.20.0/lib/card/mod/format.rb"),
  "dispatch" => PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/response.rb")
                       .select { |row| row["line"].between?(99, 113) }
}

puts JSON.pretty_generate(
  "row" => "reg-routes-D3",
  "gemset" => "decko-0.20.0 + card-1.110.0 + card-mod-format-0.20.0 (pinned)",
  "registry" => {
    "registered" => registry["registered"],
    "mimeTypes" => registry["mimeTypes"]
  },
  "rssFormat" => class_rows,
  "config" => config_rows,
  "show" => show_rows,
  "feed" => feed_rows,
  "viewDeclarations" => declaration_rows,
  "negotiation" => negotiation_rows,
  "rigArtifacts" => [
    "the mod's set DSL is stood in and the set BLOCK is the pinned bytes: card-mod-format-0.20.0/set/all/rss.rb is evaluated with a recording `format` method that keeps the block, and the kept block is class_eval'd onto a probe class that SUBCLASSES the pinned rss format class. Every `def` in the block is therefore the pinned method.",
    "the :feed view's own body is EXECUTED, and it is the pinned bytes. A `return` inside a block is a LocalJumpError unless the block is a method body, so the kept block is installed on the probe as a singleton method (define_method) and called as one: the `return` then returns from the method, the way it does in the gem.",
    "the config default is read from the PINNED mod's own file (card-mod-format-0.20.0/lib/card/mod/format.rb), which the capture loads, so `rss_enabled` is the pinned file's own value and not a value written down here. The capture restores it to false after the open-gate row.",
    "the rss format's own mime type is the html format's, and the capture records the OWNER of the method as well as its answer, because the owner is what settles whether the pinned code declares a mime type of its own.",
    "the rebuilt gemset's load path is REVERSED (the shared rig unshifts each gem's lib directory in sorted order, so the last one ends up first), which puts rack's lib directory ahead of builder's. The capture puts the builder gem's OWN lib directory at the front of the load path, so the pinned set file's own `require \"builder\"` resolves to the pinned builder instead of to rack/builder.rb, whose own `require \"set\"` would resolve to the card gem's set.rb."
  ],
  "sources" => sources
)
