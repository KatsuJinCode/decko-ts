# capture-view-registry-directives.rb - R3.1.a / R3.1.b / R3.4.b oracle
# capture: the live html view registry's directive table, the skip_perms /
# underscore render forms, and the denial-substitution behavior.
#
# Ruby truth pinned by this capture:
#   - card-1.110.0 lib/card/view/permission.rb:13-15 (view_perms =
#     setting(:perms) || :read), :25-27 (skip_check? = skip_perms option or
#     perms :none), :46-64 (denial -> format.view_for_denial with
#     crud?(task) && task).
#   - card-1.110.0 lib/card/format/render.rb:55-57 (view_setting = `try` of
#     the directive method), :59-66 (view_method -> the `_view_<name>`
#     Method - R3.1.a's "callable").
#   - card-1.110.0 lib/card/format/error.rb:27-31 (view_for_denial =
#     view_setting(:denial, view) || :denial).
#   - card-1.110.0 lib/card/format/method_delegation.rb:5-9,48-55
#     (RENDER_METHOD_RE: `_render_<view>` sets skip_perms).
#   - card-mod-format-0.20.0 set/all/html/menu.rb:8 (`view :menu,
#     denial: :blank` - R3.4.b's substitution registry).
#
# READ-ONLY: no card is saved; renders are GET-equivalent view dispatches.
# The probe asserts card_actions/Card counts are unchanged across the run.
#
# Run (from the oracle app dir):
#   RAILS_ENV=development bundle exec decko runner \
#     C:/localProjects/decko-ts-lane-skipped/tools/oracle/capture-view-registry-directives.rb

require "json"

REPO_ROOT = File.expand_path("../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "view-registry-directives-oracle.json")

# Decko stamps every rendered slot with a random DOM id (wrap.rb ->
# SecureRandom.hex(10)); normalized at the recording layer per the
# capture.rb convention (attribute presence preserved).
SLOT_ID_RE = /data-slot-id=(["'])\h+\1/.freeze

def normalize(html)
  html.gsub(SLOT_ID_RE, 'data-slot-id="RANDOMIZED"')
end

def deep_sort(obj)
  case obj
  when Hash  then obj.sort.to_h.transform_values { |v| deep_sort(v) }
  when Array then obj.map { |v| deep_sort(v) }
  else obj
  end
end

actions_before = Card::Action.count
cards_before   = Card.count

# ---- 1. directive survey ---------------------------------------------------
# Set-module inclusion is auth-independent; run under as_bot so fetches never
# read-fail. view_setting returns the directive literal (nil when the view
# definition carries none -> permission.rb falls back to :read / :denial).

SURVEY_CARDS = ["Oracle Basics", "Joe Admin", "*all+*read", "*read", "*all",
                "RichText", "Sign In"].select { |n| Card.exists?(n) }.freeze

def survey_card(card)
  fmt = card.format(:html)
  views = {}
  fmt.methods.grep(/^_view_(?!.*__)/).sort.each do |m|
    view = m.to_s.sub(/^_view_/, "")
    next if view.empty?

    sym = view.to_sym
    views[view] = {
      "perms"   => fmt.view_setting(:perms, sym),
      "denial"  => fmt.view_setting(:denial, sym),
      "unknown" => fmt.view_setting(:unknown, sym),
      # R3.1.a "resolves to a callable": the Method object's parameters -
      # the voo argument the view dispatches with.
      "method_parameters" => fmt.view_method(sym).parameters.map { |p| p.map(&:to_s) },
    }
  end
  { "name" => card.name, "type" => card.type_name,
    "view_count" => views.size, "views" => views }
end

survey = Card::Auth.as_bot do
  SURVEY_CARDS.map { |n| survey_card(Card.fetch(n)) }
end

# ---- 2. behavior arms ------------------------------------------------------
#
# DECK ARTIFACT (probed by probe-rule-card-fetch-and-guarded-views.rb and the
# dead session's probe-scratch-bisect.rb bisect): this oracle deck carries no
# usable name lexicon for JUNCTION names - Card.fetch("*all+*read") returns
# nil even though the rule row exists (cards.id 10, left *all right *read;
# the codename-registry lane's rule seeds cite the same ids). Simple-name
# fetches are unaffected. Arms therefore pin on cards that fetch: the
# "Oracle Basics" rich-text card (Anonymous read-DENIED, so every guarded
# view denies) and the "*update" set card (also Anonymous read-denied; its
# :menu view carries the :blank denial override). The update-permission
# CHECK itself (card.ok?(:update)) raises NoMethodError (item_cards on nil)
# on this deck for a card Anonymous cannot read - recorded under
# deck_artifacts, NOT under behavior: it is the anonymized deck's fetch
# gap, not Ruby's view-registry contract, and the port must not replay it.

def render_outcome(card_name, view, opts = {})
  card = Card.fetch(card_name)
  fmt  = card.format(:html)
  normalize(fmt.render(view, opts))
rescue StandardError => e
  "CAPTURE_ERROR: #{e.class}: #{e.message[0, 200]}"
end

behavior = {}
deck_artifacts = {}

Card::Auth.as_bot do
  behavior["none_perms_admin_title"]        = render_outcome("Oracle Basics", :title)
  behavior["guarded_update_admin_edit_inline"] = render_outcome("Oracle Basics", :edit_inline)
end

Card::Auth.as(Card::AnonymousID) do
  # R3.1.b arm 2 (perms :none -> skip_check?): :title's directive is
  # perms :none (captured in the survey), so BOTH viewers render it with no
  # permission check at all.
  behavior["none_perms_anonymous_title"] = render_outcome("Oracle Basics", :title)
  behavior["none_perms_anonymous_url"]   = render_outcome("Oracle Basics", :url)

  # R3.1.a's view_perms fallback (setting(:perms) || :read) exercised
  # end-to-end: a plain content view (:titled carries no perms directive ->
  # :read) on a read-denied card denies, through the DEFAULT denial view
  # (R3.4.b's non-substituted arm -> quiet_denial span). Both a basic card
  # and a set card (whose own *self read rule denies too).
  behavior["guarded_read_anonymous_titled_denial_basic"]    = render_outcome("Oracle Basics", :titled)
  behavior["guarded_read_anonymous_titled_denial_set_card"] = render_outcome("*update", :titled)

  # R3.4.b's SUBSTITUTED arm: the five views with `denial: :blank`
  # (menu.rb:8 et al) render the empty string instead of the denial frame.
  behavior["denial_blank_substitution_menu"]                 = render_outcome("*update", :menu)
  behavior["denial_blank_substitution_edit_link"]            = render_outcome("*update", :edit_link)
  behavior["denial_blank_substitution_universal_edit_button"] = render_outcome("*update", :universal_edit_button)

  # R3.1.b arm 1: the explicit skip_perms render option bypasses the
  # :update check on the guarded :edit_inline view ...
  behavior["guarded_update_anonymous_skip_perms"] =
    render_outcome("Oracle Basics", :edit_inline, { skip_perms: true })
  # ... and the UNDERSCORE render form (method_delegation.rb sets
  # skip_perms for `_render_<view>`).
  begin
    card = Card.fetch("Oracle Basics")
    fmt  = card.format(:html)
    behavior["guarded_update_anonymous_underscore_form"] = normalize(fmt._render_edit_inline)
  rescue StandardError => e
    behavior["guarded_update_anonymous_underscore_form"] =
      "CAPTURE_ERROR: #{e.class}: #{e.message[0, 200]}"
  end

  # The DEFAULT (non-bypassed) guarded-update render crashes on THIS deck
  # (see the deck-artifact note above) - pinned separately from behavior.
  deck_artifacts["guarded_update_anonymous_default_denial"] =
    render_outcome("Oracle Basics", :edit_inline)
  begin
    deck_artifacts["update_permission_check_itself"] =
      Card.fetch("Oracle Basics").ok?(:update).inspect
  rescue StandardError => e
    deck_artifacts["update_permission_check_itself"] =
      "CAPTURE_ERROR: #{e.class}: #{e.message[0, 200]}"
  end
end

# ---- no-write proof --------------------------------------------------------

actions_after = Card::Action.count
cards_after   = Card.count
if actions_after != actions_before || cards_after != cards_before
  raise "no-write proof FAILED: card_actions #{actions_before}->#{actions_after}, " \
        "cards #{cards_before}->#{cards_after}"
end

payload = {
  "capture" => "view-registry-directives",
  "purpose" => "contract R3.1.a/R3.1.b/R3.4.b: live html view registry - " \
               "directive table (perms/denial/unknown), view_method callables, " \
               "skip_perms + underscore render forms, denial substitution",
  "ruby_truth" => {
    "view_perms" => "card-1.110.0 lib/card/view/permission.rb:13-15",
    "skip_check" => "permission.rb:25-27",
    "denial" => "permission.rb:46-50 -> lib/card/format/error.rb:27-31",
    "view_method" => "lib/card/format/render.rb:59-66",
    "underscore_form" => "lib/card/format/method_delegation.rb:5-9,48-55",
    "menu_denial_blank" => "card-mod-format-0.20.0 set/all/html/menu.rb:8",
  },
  "normalizations" => ["data-slot-id 20-hex -> RANDOMIZED (capture.rb convention)"],
  "no_write_proof" => {
    "card_actions_unchanged" => true,
    "card_actions" => actions_before,
    "cards" => cards_before,
  },
  "survey" => survey,
  "behavior" => behavior,
  "deck_artifacts" => deck_artifacts,
}

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "WROTE #{OUT_PATH} (#{File.size(OUT_PATH)} bytes)"
puts "surveyed cards: #{survey.map { |c| "#{c['name']}(#{c['view_count']})" }.join(', ')}"
puts "no-write proof: card_actions #{actions_before} before == #{actions_after} after"
$stdout.flush
