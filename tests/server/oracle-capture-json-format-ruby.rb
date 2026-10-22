# oracle-capture-json-format-ruby.rb - the PINNED MOD's own json format, its
# own set block, and the PINNED DECK's own suffix/Accept negotiation.
#
# WHY THIS SCRIPT EXISTS: the completeness register's D2 row ([Family]) is
# the json format, and the row's own name says the two doors it is reached
# through: "json (suffix / Accept)". The register's port evidence for the
# row names the port's arms (the edge's .json arms, the engine's json
# format view dispatch, the staging record JSON, the writes that honour
# Accept json) but it does not say what the PINNED side answers for either
# door, and the door order is the part a port can get wrong.
#
# The pinned pieces this row measures:
#
#   1. THE CLASS. card-mod-format-0.20.0/lib/card/format/json_format.rb
#      registers :json, answers "application/json" for its mime type, and
#      overrides expand_stubs so a Hash or an Array is walked.
#   2. THE SET BLOCK. card-mod-format-0.20.0/set/all/json.rb carries the
#      json format's own show (whose default view is :molecule), the page
#      details merge (url + requested_at), and the stringify arm that
#      pretty-prints UNLESS the params ask for compression.
#   3. THE DECK'S NEGOTIATION. decko-0.20.0/lib/card_controller/response.rb
#      carries requested_format (:111-113), which is the SUFFIX door
#      (params[:format]) and the ACCEPT door (request.format) in one
#      expression, format_name_from_params (:102-105), implicit_html?
#      (:98-100) and load_format (:93-96).
#
# THE DOOR ORDER IS THE POINT. `params[:format].present? ? params[:format]
# .to_s : request.format` means the SUFFIX WINS over the Accept header
# whenever the suffix is present, and the Accept header answers only when
# there is no suffix at all. The capture measures both doors together, so
# a request that carries BOTH is measured, not assumed.
#
# The DSL is stood in and the set BLOCK is the pinned bytes: the file is
# evaluated with a recording `format` method that keeps the block, and the
# kept block is class_eval'd onto a probe class that SUBCLASSES the pinned
# json format class.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-json-format-ruby.rb \
#     > fixtures/captured/json-format-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The case list is fixed and the ONE wall-clock value the pinned
# page_details merge writes is masked before it is recorded, so a re-run on
# the same gemset is byte-stable.

require "json"

require_relative "pinned-format-set-block-loader-ruby"

# ---------------------------------------------------------------------------
# the PINNED MOD's own format files, loaded: the registry and the json
# format's own class body
# ---------------------------------------------------------------------------
registry = load_pinned_format_registry!
raise "the pinned registry did not load" unless registry.is_a?(Hash)

json_format_class = Card::Format::REGISTRY_CLASSES["json"]
raise "the pinned mod did not register a json format class" if json_format_class.nil?

# The card gem's own nesting modules and render module, on the base (see
# the shared loader). The render module carries the base's own
# expand_stubs, which the json format's own expand_stubs reaches through
# `super` for every leaf that is not a Hash or an Array.
load_pinned_format_nesting!
load_pinned_format_render!

# ---------------------------------------------------------------------------
# the probe: the pinned json format with the pinned set block on it
# ---------------------------------------------------------------------------
class Card
  class JsonFormatProbe < Card::Format::JsonFormat
    include PinnedFormatProbeStands
  end
end

PinnedFormatSetBlocks.apply!("card-mod-format-0.20.0/set/all/json.rb", "json", Card::JsonFormatProbe)

# ---------------------------------------------------------------------------
# 1 - the format's own class, measured
# ---------------------------------------------------------------------------
class_rows = {
  "registered" => registry["registered"].include?("json"),
  "mimeType" => json_format_class.allocate.mime_type,
  "baseMimeType" => Card::Format.allocate.mime_type,
  # The json format's own expand_stubs walks a Hash and an Array; anything
  # else falls through to the base's own expand_stubs
  # (card-1.110.0/lib/card/format/render.rb:138-151), which needs the
  # card gem's content machinery. The walk is measured; the fall-through
  # is recorded as the call it would make.
  "expandStubs" => begin
    json_format_class.allocate.expand_stubs({ "a" => { "b" => [1, { "c" => 2 }] } })
  rescue StandardError => e
    "RAISED: #{e.class}: #{e.message}"
  end,
  "expandStubsString" => begin
    json_format_class.allocate.expand_stubs("plain text")
  rescue StandardError => e
    "RAISED: #{e.class}: #{e.message}"
  end
}

# ---------------------------------------------------------------------------
# 2 - the set block's own answers
# ---------------------------------------------------------------------------
def json_probe(params: {}, render_answer: nil, request_url: "https://example.test/Alpha")
  probe = Card::JsonFormatProbe.new
  probe.probe_params = params
  probe.probe_render_answer = render_answer
  probe.probe_request_url = request_url
  Card::Env.ajax_answer = false
  probe
end

# The wall clock the pinned page_details merge writes is masked before it
# is recorded, so the fixture stays byte-stable and the mask itself is
# visible in the output.
TIMESTAMP_PATTERN = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC/.freeze

def mask_timestamp(text)
  text.gsub(TIMESTAMP_PATTERN, "<TIMESTAMP>")
end

set_block_rows = [
  { "label" => "the default nest view", "ask" => :default_nest_view },
  { "label" => "the default item view", "ask" => :default_item_view }
].map do |spec|
  probe = json_probe
  {
    "label" => spec["label"],
    "answer" => probe.public_send(spec["ask"]).to_s
  }
end

max_depth_rows = [
  { "label" => "no max_depth param", "params" => {} },
  { "label" => "a max_depth param", "params" => { max_depth: "3" } },
  { "label" => "a blank max_depth param", "params" => { max_depth: "" } },
  { "label" => "a max_depth param that is not a number", "params" => { max_depth: "abc" } }
].map do |spec|
  probe = json_probe(params: spec["params"])
  {
    "label" => spec["label"],
    "params" => spec["params"].transform_keys(&:to_s),
    "answer" => probe.max_depth
  }
end

# The show arm. The pinned show (set/all/json.rb:22-27) defaults the view
# to :molecule and wraps the answer in the page details.
show_rows = [
  {
    "label" => "no view named: the default is :molecule",
    "view" => nil,
    "params" => {},
    "renderAnswer" => { "id" => 1, "name" => "Alpha" }
  },
  {
    "label" => "a view named",
    "view" => :open,
    "params" => {},
    "renderAnswer" => { "id" => 1, "name" => "Alpha" }
  },
  {
    "label" => "the answer is a String: the page details do not touch it",
    "view" => nil,
    "params" => {},
    "renderAnswer" => "RENDERED(:molecule)"
  },
  {
    "label" => "the params ask for compression",
    "view" => nil,
    "params" => { compress: "1" },
    "renderAnswer" => { "id" => 1, "name" => "Alpha" }
  }
].map do |spec|
  probe = json_probe(params: spec["params"], render_answer: spec["renderAnswer"])
  returned = probe.show(spec["view"], {})
  {
    "label" => spec["label"],
    "params" => spec["params"].transform_keys(&:to_s),
    "returned" => mask_timestamp(returned.to_s),
    "calls" => probe.calls
  }
end

# The page details merge on its own: only a Hash is merged, and the merge
# adds url and requested_at.
page_details_rows = [
  { "label" => "a Hash", "value" => { "id" => 1 } },
  { "label" => "an Array", "value" => [1, 2] },
  { "label" => "a String", "value" => "text" }
].map do |spec|
  probe = json_probe
  merged = probe.send(:page_details, spec["value"])
  {
    "label" => spec["label"],
    "valueClass" => spec["value"].class.name,
    "answerClass" => merged.class.name,
    "answerKeys" => merged.is_a?(Hash) ? merged.keys.map(&:to_s) : nil,
    "answer" => merged.is_a?(Hash) ? mask_timestamp(merged.inspect) : merged.to_s
  }
end

# ---------------------------------------------------------------------------
# 3 - the DECK's own negotiation: the suffix door and the Accept door
# ---------------------------------------------------------------------------
#
# response.rb's own methods, executed. The request double answers
# request.format, which is the Accept door, and records the assignment
# load_format makes to it.
PinnedDeck.load_pinned_controller!

class JsonNegotiationRequestDouble
  attr_reader :format
  attr_accessor :writes

  def initialize(format)
    @format = format
    @writes = []
  end

  def format=(value)
    @writes << value.to_s
    @format = value
  end
end

class JsonNegotiationHarness
  include CardController::Response

  attr_accessor :params, :request

  def initialize(params, request)
    @params = params
    @request = request
  end
end

def negotiation_case(label, accept, params: {}, ajax: false)
  request = JsonNegotiationRequestDouble.new(accept)
  harness = JsonNegotiationHarness.new(params, request)
  Card::Env.ajax_answer = ajax
  requested = harness.send(:requested_format)
  format_name = harness.send(:format_name_from_params)
  implicit = harness.send(:implicit_html?)
  {
    "label" => label,
    "accept" => accept.to_s,
    "params" => params.transform_keys(&:to_s),
    "ajax" => ajax,
    "requestedFormat" => requested.to_s,
    "formatNameFromParams" => format_name.to_s,
    "implicitHtml" => implicit ? true : false
  }
end

negotiation_rows = [
  negotiation_case("the Accept door alone, as the format NAME", "json"),
  negotiation_case("the Accept door alone, as a MIME TYPE", "application/json"),
  negotiation_case("the Accept door alone, as a SYMBOL", :json),
  negotiation_case("the suffix door alone", "html", params: { format: "json" }),
  negotiation_case("BOTH doors: the suffix wins", "text/html", params: { format: "json" }),
  negotiation_case("BOTH doors, the Accept door asks for json", "application/json", params: { format: "html" }),
  negotiation_case("a browser door", "text/html"),
  negotiation_case("the wildcard Accept door", "*/*"),
  negotiation_case("an ajax request with no suffix", "application/json", ajax: true),
  negotiation_case("an ajax request with a suffix", "application/json", params: { format: "json" }, ajax: true)
]

# THE REGISTRY'S ELEMENT TYPE, and what the membership test therefore
# answers. The pinned registration (card-1.110.0/lib/card/format/
# registration.rb:6-9) stores the format NAME AS A STRING, and the pinned
# explicit_file_format? (response.rb:107-109) compares the registry
# against the RAW requested format, before format_name_from_params
# symbolizes it. So the membership test succeeds only for the STRING the
# registry holds, and a Symbol of the same name is NOT a member.
registry_rows = {
  "elementTypes" => Card::Format.registered.map { |name| name.class.name }.uniq,
  "elementSample" => Card::Format.registered.first(3),
  "memberOfString" => Card::Format.registered.member?("json"),
  "memberOfSymbol" => Card::Format.registered.member?(:json),
  "memberOfMimeTypeString" => Card::Format.registered.member?("application/json")
}

# The load_format arm: it writes :html onto request.format when the request
# is an implicit html one, and then asks the card for the format the
# negotiation chose.
# The format the card hands back. The deck's load_format writes the status
# onto it (response.rb:95), so the double RECORDS that write.
class JsonFormatDouble
  attr_reader :calls
  attr_accessor :error_status

  def initialize
    @calls = []
  end

  def error_status=(value)
    @calls << { "ask" => "error_status=", "value" => value }
    @error_status = value
  end

  def to_s
    "FORMAT"
  end
end

class JsonCardDouble
  attr_reader :calls, :formats

  def initialize
    @calls = []
    @formats = []
  end

  def format(name)
    @calls << { "ask" => "format", "name" => name.to_s }
    fmt = JsonFormatDouble.new
    @formats << fmt
    fmt
  end
end

def load_format_case(label, accept, params: {}, ajax: false)
  request = JsonNegotiationRequestDouble.new(accept)
  harness = JsonNegotiationHarness.new(params, request)
  card = JsonCardDouble.new
  harness.define_singleton_method(:card) { card }
  Card::Env.ajax_answer = ajax
  result = harness.send(:load_format, 200)
  {
    "label" => label,
    "accept" => accept.to_s,
    "params" => params.transform_keys(&:to_s),
    "ajax" => ajax,
    "result" => result.to_s,
    "requestFormatAfter" => request.format.to_s,
    "requestFormatWrites" => request.writes,
    "cardCalls" => card.calls,
    "formatErrorStatusWrites" => card.formats.flat_map(&:calls)
  }
end

load_format_rows = [
  load_format_case("a plain json request", "application/json"),
  load_format_case("a suffix json request", "text/html", params: { format: "json" }),
  load_format_case("the wildcard Accept door", "*/*"),
  load_format_case("an ajax request with no suffix", "application/json", ajax: true),
  load_format_case("an ajax request with a suffix", "application/json", params: { format: "json" }, ajax: true)
]

# ---------------------------------------------------------------------------
# the sources, quoted with line numbers
# ---------------------------------------------------------------------------
sources = {
  "jsonFormatClass" => PinnedDeck.pinned_lines("card-mod-format-0.20.0/lib/card/format/json_format.rb"),
  "jsonSet" => PinnedDeck.pinned_lines("card-mod-format-0.20.0/set/all/json.rb"),
  "baseExpandStubs" => PinnedDeck.pinned_lines("card-1.110.0/lib/card/format/render.rb")
                            .select { |row| row["line"].between?(138, 151) },
  "response" => PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/response.rb")
                       .select { |row| row["line"].between?(93, 113) }
}

puts JSON.pretty_generate(
  "row" => "reg-routes-D2",
  "gemset" => "decko-0.20.0 + card-1.110.0 + card-mod-format-0.20.0 (pinned)",
  "registry" => {
    "registered" => registry["registered"],
    "mimeTypes" => registry["mimeTypes"]
  },
  "jsonFormat" => class_rows,
  "defaultViews" => set_block_rows,
  "maxDepth" => max_depth_rows,
  "show" => show_rows,
  "pageDetails" => page_details_rows,
  "negotiation" => negotiation_rows,
  "registryTypes" => registry_rows,
  "loadFormat" => load_format_rows,
  "rigArtifacts" => [
    "the mod's set DSL is stood in and the set BLOCK is the pinned bytes: card-mod-format-0.20.0/set/all/json.rb is evaluated with a recording `format` method that keeps the block, and the kept block is class_eval'd onto a probe class that SUBCLASSES the pinned json format class. Every `def` in the block is therefore the pinned method.",
    "the card gem's own nesting modules are loaded and included ON THE BASE (Card::Format), because the pinned card gem includes them there and a format class SUBCLASSES Card::Format. On the probe they would shadow the format class's own answers.",
    "the ONE wall-clock value the pinned page_details merge writes (Time.now.utc.to_s) is MASKED before it is recorded, as <TIMESTAMP>, so the fixture is byte-stable and the mask is visible in the output. The key ORDER the merge produces is not masked and is the measurement.",
    "the deck's own negotiation is executed with a request double that answers request.format (the Accept door) and RECORDS the assignment load_format makes to it. The card's own format method is a recording stand that records the format name the deck asked for.",
    "the json format's own expand_stubs is measured over a Hash and an Array. Its fall-through to the base's own expand_stubs (card-1.110.0/lib/card/format/render.rb:138-151) needs the card gem's content machinery, so that call is recorded as raising and the pinned line is quoted in the sources."
  ],
  "sources" => sources
)
