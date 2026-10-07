# capture-name-env-main-params.rb - S2.2.b oracle capture: `_main` contextual
# resolution through Card::Env.params[:main_name].
#
# Ruby truth pinned by this capture:
#   - card-1.110.0 lib/card/name.rb#params (Card::Name.params -> Card::Env.params)
#   - cardname-0.20.0 lib/cardname/contextual.rb#absolutize_contextual_parts
#     (`when /^_main$/i then self.class.params[:main_name]`, line 108; the
#     case result goes through `.to_s.strip`) and #absolute (blank-extreme
#     fill through absolutize_extremes, lines 102-110).
#
# This runs inside the booted decko oracle app (the `english`-loaded app
# path - the bare-gem `_main`-with-nil-params crash that kept S2.2.b
# pinned-synthetic does not exist here), so the captured rows are the app
# truth the contract statement names.
#
# Run (from the oracle app dir):
#   RAILS_ENV=development bundle exec decko runner \
#     REPO_ROOT//tools/oracle/capture-name-env-main-params.rb
#
# READ-ONLY: the probe mutates only the in-process Card::Env.params hash; no
# card is saved. The probe itself asserts the card_actions count is unchanged
# across the capture and records that as the no-write proof.

require "json"

REPO_ROOT = File.expand_path("../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "name-env-main-params-oracle.json")

def deep_sort(obj)
  case obj
  when Hash  then obj.sort.to_h.transform_values { |v| deep_sort(v) }
  when Array then obj.map { |v| deep_sort(v) }
  else obj
  end
end

actions_before = Card::Action.count
cards_before   = Card.count

# main_name values: nil (the param unset case the statement names), blank,
# a simple name, a compound, a whitespace-padded name (exercises the
# `.to_s.strip` on the case result).
MAIN_NAMES = [nil, "", "Home Page", "A+B", " Padded Home "].freeze

# [relative name, context (nil = no context argument)]
ROWS = [
  ["_main",          "A+B"],
  ["_main+extra",    "A+B"],
  ["extra+_main",    "A+B"],
  ["_Main",          "A+B"],   # directive is case-insensitive (/^_main$/i)
  ["_main+_right",   "A+B"],
  ["_left+_main",    "A+B"],
  ["_main",          nil],     # context = "" (absolute's `context || ""` arm)
].freeze

scenarios = MAIN_NAMES.map do |main_name|
  if main_name.nil?
    Card::Env.params.delete(:main_name)
  else
    Card::Env.params[:main_name] = main_name
  end

  rows = ROWS.map do |name_str, context_str|
    name = Card::Name[name_str]
    { "name" => name_str,
      "context" => context_str,
      "relative?" => name.relative?,
      # contextual.rb#absolute takes exactly one argument; nil is the
      # no-context arm (`context = (context || "").to_name`).
      "absolute" => name.absolute(context_str) }
  end

  { "main_name" => main_name,
    "params_echo" => Card::Env.params[:main_name],
    "rows" => rows }
end

Card::Env.params.delete(:main_name)

actions_after = Card::Action.count
cards_after   = Card.count
if actions_after != actions_before || cards_after != cards_before
  raise "no-write proof FAILED: card_actions #{actions_before}->#{actions_after}, " \
        "cards #{cards_before}->#{cards_after}"
end

payload = {
  "capture" => "name-env-main-params",
  "purpose" => "contract S2.2.b: _main resolves through Card::Env.params[:main_name] " \
               "with blank-extreme fill when the param is nil",
  "ruby_truth" => {
    "params" => "card-1.110.0 lib/card/name.rb#params (Card::Name.params -> Card::Env.params)",
    "directive" => "cardname-0.20.0 lib/cardname/contextual.rb:108 " \
                   "(absolutize_contextual_parts `when /^_main$/i`, result `.to_s.strip`)",
    "blank_extremes" => "cardname-0.20.0 lib/cardname/contextual.rb:102-110 " \
                        "(#absolute -> absolutize_extremes over the resolved parts)",
    "app_path" => "decko oracle app boots english - the bare-gem _main-with-nil-params " \
                  "crash (S2.2.b's pinned-synthetic reason) does not exist on this path",
  },
  "no_write_proof" => {
    "card_actions_unchanged" => true,
    "card_actions" => actions_before,
    "cards" => cards_before,
  },
  "scenarios" => scenarios,
}

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "WROTE #{OUT_PATH} (#{File.size(OUT_PATH)} bytes)"
puts "no-write proof: card_actions #{actions_before} before == #{actions_after} after; " \
     "cards #{cards_before} == #{cards_after}"
$stdout.flush
