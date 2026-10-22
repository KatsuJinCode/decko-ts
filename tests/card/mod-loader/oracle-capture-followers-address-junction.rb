# oracle-capture-followers-address-junction.rb - capture what the Ruby oracle
# answers at the FOLLOWERS LIST address, in both spellings.
#
# This settles the ACT-155 instrument disagreement the full-candidate v10 roll
# receipt left open (docs/runs/full-candidate-v10-tranche-roll-2026-10-21.md).
# Two lanes read the same address on different engines: the candidate lane read
# the un-asterisked `<card>+followers` as the plain create form on the stock
# Ruby oracle; matrix tranche-6 read the same address as a FOLLOWERS LIST on the
# LOCAL TypeScript engine. Ruby is the parity target, so the question is what the
# live Ruby app answers there.
#
# Run (from tools/oracle/decko-oracle-app):
#   RAILS_ENV=development bundle exec decko runner \
#     REPO_ROOT/decko-ts/tests/card/mod-loader/oracle-capture-followers-address-junction.rb
#
# Records to fixtures/captured/followers-address-junction.json:
#   1. per spelling, a real HTTP GET through the full Rack stack and the real
#      Decko router (ActionDispatch::Integration::Session): status, title,
#      body byte count, and a text digest. A name lookup would answer a
#      different question - the disagreement is about which SURFACE an ADDRESS
#      resolves to, and only a request that runs routing, junction resolution,
#      permissions and view rendering can answer that;
#   2. the object-level fact behind those answers: `virtual?` on the card each
#      spelling instantiates. Ruby matches a set module only where `virtual?` is
#      true, and card-mod-follow-0.20.0/set/right/followers.rb:20-22 defines
#      `def virtual?; new?; end` for the Followers set;
#   3. the mod's own set inventory for the Follow/Followers family, so the
#      address in the record is the mod's, not this script's.
#
# Determinism contract (mirrors oracle-capture-list-mod.rb): the probe card is
# create-if-missing and DELETED (trashed) after the run so the shared deck
# returns to its prior state. The card's numeric id and any timestamp are
# stripped from the captured rows; the name-keyed values are the parity target.
#
# What this capture CANNOT show: the HTTP GET is anonymous, because an
# ActionDispatch::Integration::Session starts with no cookies. An anonymous
# reader gets 404 at the un-asterisked address; a reader with create rights
# gets the create form there instead (firstView=new, as the port's committed
# oracle fixtures record at tests/card/set-modules/virtual-set-modules.test.ts:7).
# Both are "not a followers list", which is what the settlement turns on.

require "json"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "followers-address-junction.json")

PROBE_CARD = "Oracle Followers Address Probe"
PROBE_TYPE = "RichText"

def deep_sort(obj)
  case obj
  when Hash  then obj.sort.to_h.transform_values { |v| deep_sort(v) }
  when Array then obj.map { |v| deep_sort(v) }
  else obj
  end
end

def strip_html(html)
  html.to_s.gsub(%r{<script.*?</script>}m, " ")
      .gsub(%r{<style.*?</style>}m, " ")
      .gsub(/<[^>]*>/, " ")
      .gsub(/&nbsp;/, " ")
      .gsub(/\s+/, " ")
      .strip
end

def title_of(html)
  m = html.to_s.match(%r{<title>(.*?)</title>}m)
  m ? strip_html(m[1]) : nil
end

def read_address(path)
  session = ActionDispatch::Integration::Session.new(Rails.application)
  session.host! "localhost"
  status = nil; body = ""; ctype = nil; error = nil
  begin
    session.get path
    status = session.response.status
    body   = session.response.body.to_s
    ctype  = session.response.content_type
  rescue StandardError => e
    error = "#{e.class}: #{e.message}"
  end
  text = body.empty? ? nil : strip_html(body)
  {
    "status" => status,
    "contentType" => ctype,
    "bodyBytes" => body.bytesize,
    "title" => body.empty? ? nil : title_of(body),
    # the whole page as one whitespace-reduced line, so a reader can classify
    # the surface without trusting any label in this file
    "textDigest" => text.nil? ? nil : text[0, 600],
    "error" => error
  }
end

# ── fixture, created as the deck's own bot account ─────────────────────────
Card::Auth.signin Card["decko_bot"].id

created = false
unless Card[PROBE_CARD].present?
  Card.create!(name: PROBE_CARD, type_code: PROBE_TYPE, db_content: "followers address probe")
  created = true
end

Card::Env.reset_session

key = PROBE_CARD.tr(" ", "_")
SPELLINGS = {
  "un_asterisked" => "/#{key}+followers",
  "asterisked"    => "/#{key}+*followers",
  "card_itself"    => "/#{key}"
}.freeze

http = SPELLINGS.transform_values { |path| read_address(path).merge("path" => path) }

# ── the object-level fact behind the two answers ───────────────────────────
junction = SPELLINGS.keys.reject { |k| k == "card_itself" }.to_h do |label|
  card = Card.new(name: "#{PROBE_CARD}+#{label == "asterisked" ? "*" : ""}followers")
  [label, {
    "virtual" => (card.virtual? rescue nil),
    "new" => (card.new? rescue nil),
    # a matched set module names its own file; an unmatched name does not
    "matchedSetModule" => begin
      klass = card.class
      (klass.instance_methods(false).include?(:item_names) || klass.instance_methods(false).include?(:content)) ? klass.name : nil
    rescue StandardError
      nil
    end
  }]
end

# ── the mod's own inventory of the follow-family sets ───────────────────────
inventory = {}
mod_path = Gem.loaded_specs["card-mod-follow"]&.full_gem_path
if mod_path
  ["set/right", "set/left"].each do |subdir|
    Dir[File.join(mod_path, subdir, "*.rb")].sort.each do |file|
      base = File.basename(file, ".rb")
      next unless base =~ /follow/i
      inventory["#{subdir}/#{base}.rb"] = {
        "rightSet" => subdir.end_with?("right"),
        "headerComment" => File.readlines(file).first(3).map(&:strip).reject(&:empty?)
      }
    end
  end
end

report = {
  "capture" => "followers-address-junction",
  "question" => "what does the Ruby oracle answer at <card>+followers and <card>+*followers?",
  "environment" => {
    "railsEnv" => Rails.env.to_s,
    "ruby" => RUBY_VERSION,
    "rails" => Rails.version.to_s,
    "card" => Gem.loaded_specs["card"]&.version.to_s,
    "cardModFollow" => Gem.loaded_specs["card-mod-follow"]&.version.to_s
  },
  "probeCard" => { "name" => PROBE_CARD, "type" => PROBE_TYPE, "trashedOnExit" => created },
  "httpAnonymous" => http,
  "junctionInstantiation" => junction,
  "followModSetFiles" => inventory
}

if created
  begin
    Card[PROBE_CARD].trash
  rescue StandardError
    # the deck keeps the probe card; the capture names it above
  end
end

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(report)) + "\n")
puts JSON.pretty_generate(deep_sort(report))
puts "WROTE #{OUT_PATH}"
puts "SEED_LOG probe card #{created ? 'created' : 'already present'}"

# The integration session leaves Rails' runner teardown unable to own its own
# exit on this platform: rails/application/finisher.rb:107 calls `exit` inside
# the execution wrapper and raises ThreadError "current fiber not owner", so a
# capture that wrote its fixture would still report a failure status. The
# fixture is written and flushed above; end the process explicitly instead.
STDOUT.flush
exit!(0)