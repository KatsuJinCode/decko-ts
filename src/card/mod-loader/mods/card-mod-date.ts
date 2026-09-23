// The card-mod-date gem (card-mod-date-0.20.0), ported through the mod
// loader - the mod that adds the Date cardtype + the *when created /
// *when last edited / now virtual cards.
//
// The gem's tree (C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems/
// card-mod-date-0.20.0/): five set files across four patterns, no lib/,
// no set_pattern/, no events, no HAML templates. Ported here the
// set-module basket - every .rb file from the gem tree registers as a
// set module even when the file defines no ported view.
//
// The single html view the gem declares (:core) is already implemented
// in the engine's core view (src/card/render/views.ts#coreView + the
// `typeName === "Date"` branch's formatDateCore at views.ts:235-248 -
// `::Date.parse(card.content).strftime "%B %-d, %Y"`). The
// mod-compat-report.json verdict for this gem is "1/1 html views in
// HTML_VIEWS (0/0 mod-specific)" and "htmlViewsMissing": [], so the
// faithful move is to NOT register :core here - a mod-side registration
// would shadow the engine's correct impl (the mod-registrar's
// last-wins rule, loader.ts:199 `this.views.register(view.view,
// view.viewFn)` does `views[view.view] = view.viewFn`).
//
// Set-module structure (every set file from the gem, recorded so the
// basket reflects the gem's tree):
//   all/calendar               - basket[:list_input_options] << "calendar" +
//                                format :html calendar_input helper method
//   right/when_created         - virtual right card; def content ->
//                                I18n.localize left.created_at
//   right/when_last_edited     - virtual right card; def content ->
//                                I18n.localize left.updated_at
//   self/now                   - def content -> I18n.localize Time.now
//   type/date                  - def input_type :calendar + view :core
//                                strftime (the engine's coreView handles
//                                this cardtype)
//
// NOT ported (honest remainder, see docs/mod-loader-port-notes.md):
//   - the right/when_created, right/when_last_edited, self/now
//     content-override behavior. Ruby's standard :core view (the
//     commented-out `view :core, :raw` at each file's tail) renders
//     `card.content`, which dispatches through the set module's `def
//     content`. The TS engine now consults per-set content overrides
//     before falling through to dbContent - format.ts#renderRaw:605-609
//     calls `resolveContentOverride(this)` and returns the override
//     when one is registered, else `this.card.dbContent`; the registry
//     seam lives at src/card/render/content-overrides.ts (the
//     ContentOverrideRegistry + cardBelongsToSet membership check + the
//     process-wide default setDefaultContentOverrideRegistry). BUT the
//     mod loader has no manifest field for content overrides today
//     (the DeckoModManifest shape at mod-manifest.ts:187-216 carries
//     only setPatterns, setModules, prepareEngine, etc. - no
//     `contentOverrides` array), and the loader's SetLoader phase does
//     not populate the registry from any manifest field. The
//     engine-surface gap has been CLOSED; the mod-loader-surface gap
//     remains. Adding the field is owned by the mod-loader stream, not
//     this one. The engine's :core for these virtual right cards still
//     returns "" (no dbContent, no override registered); the mod port
//     cannot change that without the missing manifest surface
//   - basket[:list_input_options] << "calendar" (calendar.rb:1) and
//     basket[:script_calls]["setDatepickerConfig"] = :datepicker_config
//     (calendar.rb:2 - the file's other basket op, even commented out in
//     the gem). These set-module-level basket writes register the
//     calendar input option in the admin form + the JS asset-pipeline
//     callback; the TS engine has neither surface
//   - def calendar_input (calendar.rb:9-14) - a helper method consumed by
//     the input-type renderer that card-mod-format provides (a separate
//     mod, not ported). It is not itself a `view :x` declaration and
//     renders no bytes independently; the Ruby file's `text_field :content,
//     class: "date-editor", type: "date"` is what the form input renderer
//     calls
//   - assign_type :phrase (when_created.rb:1, when_last_edited.rb:1) - the
//     Ruby's "this set's cards are phrase-typed" annotation. The TS engine
//     has no `assign_type` surface; the right-side cards' type derives
//     from their fetched CardRecord.typeId
//   - def virtual?; new?; end (when_created.rb:3-5, when_last_edited.rb:3-5)
//     - the predicate Ruby calls before deciding to render the content.
//     In Ruby the same predicate is also called by the standard :core view
//     to decide whether to render anything at all
//   - I18n.localize format: :card_dayofwk_min_tz (the actual i18n format
//     string, card-1.110.0 config/locales/en.yml:29 '%A, %B %d, %Y %I:%M
//     %p %Z') - the TS port implements the format byte shape in the
//     helper below for tests and downstream consumers that need to render
//     the same shape from a fetched timestamp. The i18n surface IS now
//     available (src/card/i18n/i18n.ts:199-212 #l(date, opts) wraps
//     I18n.localize; the format strings live at time.formats.<format> in
//     the en locale loaded via loadLocaleFileAsync), so callers that
//     have loaded the locale can use `l(date, { format:
//     "card_dayofwk_min_tz" })` and get the same bytes the helper
//     produces. The helper here stays as the documented TS equivalent
//     that does NOT depend on a pre-loaded locale - tests use the helper
//     directly without touching the i18n registry, and the helper's
//     output is byte-identical to what i18n.l() would produce once the
//     locale is loaded (locale is fixed to en + UTC, no Rails Time.zone
//     config exists in the headless engine)
//   - the type/date.rb :core view itself: src/card/render/views.ts#coreView
//     already implements `::Date.parse(card.content).strftime "%B %-d, %Y"`
//     (views.ts:186-214 + formatDateCore:227-248). The mod-registrar's
//     last-wins rule (loader.ts:199) would let a duplicate registration
//     shadow the engine's correct impl; the faithful move is to NOT
//     register :core here and rely on the engine-side impl
//   - def input_type; :calendar; end (date.rb:2-4) - the input-type method
//     the form renderer reads to pick the input widget. The TS engine has
//     no input-type registry today; the mod-registrar's ModSetModuleFile
//     surface carries no such method either
//   - data/test.yml + data/real.yml (seed cards: codenames date /
//     when_created / when_last_edited / now + their *self cardtype rule
//     cards + a default *date setting) - deck-level seed data; the seed
//     path enters through the standard write path, which is outside this
//     stream
//   - config/admin.yml (admin nav config: *date setting under the
//     editing group) - admin surface, no TS consumer

import type { DeckoModManifest } from "../mod-manifest.js";

// ---------------------------------------------------------------------------
// The :card_dayofwk_min_tz I18n format - the en.yml format string a
// downstream consumer might apply to a timestamp.
//
// Source: card-1.110.0 config/locales/en.yml:29:
//   en:
//     time:
//       formats:
//         card_dayofwk_min_tz: '%A, %B %d, %Y %I:%M %p %Z'
// Ruby I18n.localize applies the strftime spec to the timestamp. The
// components the spec requires:
//   %A  -> full weekday name      ("Monday", "Tuesday", ...)
//   %B  -> full month name        ("January", "February", ...)
//   %d  -> day-of-month, zero-padded ("01".."31")
//   %Y  -> 4-digit year           ("2026")
//   %I  -> hour 12-hour, zero-padded ("01".."12")
//   %M  -> minute, zero-padded    ("00".."59")
//   %p  -> AM / PM                ("AM", "PM")
//   %Z  -> timezone abbreviation  (the engine has no Rails Time.zone config,
//          so the stored timestamp is UTC and %Z renders "UTC")
//
// Exported for tests and any downstream consumer that needs to render the
// same shape from a fetched timestamp. The mod's set-module content
// overrides (right/when_created, right/when_last_edited, self/now) cannot
// fire through the engine's :core view today (no per-card content override
// surface) - the helper here is the documented TS equivalent of Ruby's
// I18n.localize(format: :card_dayofwk_min_tz) for callers that already
// have a timestamp in hand.
// ---------------------------------------------------------------------------

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Ruby's strftime '%A, %B %d, %Y %I:%M %p UTC' applied to a UTC Date.
 *  Ruby I18n.localize for a UTC stored timestamp produces the same shape
 *  (the engine's cards.created_at column is the UTC ISO string the
 *  LocalSqliteDriver writes; no zone conversion). */
export function formatDayofwkMinTz(date: Date): string {
  const weekday = WEEKDAY_NAMES[date.getUTCDay()];
  const month = MONTH_NAMES[date.getUTCMonth()];
  const day = String(date.getUTCDate()).padStart(2, "0");
  const year = date.getUTCFullYear();
  const hour24 = date.getUTCHours();
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const hour = String(hour12).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  const ampm = hour24 < 12 ? "AM" : "PM";
  return `${weekday}, ${month} ${day}, ${year} ${hour}:${minute} ${ampm} UTC`;
}

// ---------------------------------------------------------------------------
// the manifest (one entry per gem file; setPaths as in the gem tree)
// ---------------------------------------------------------------------------

const cardModDate: DeckoModManifest = {
  name: "date",
  gemName: "card-mod-date",
  group: "gem-defaults",
  setModules: [
    {
      // card-mod-date-0.20.0/set/all/calendar.rb
      // Lines 1-2 are basket ops (list_input_options, script_calls) the
      // TS engine has no surface for. Lines 4-15 are `format :html do; def
      // calendar_input ... end; end` - a helper method the form's
      // input-type renderer calls; no `view :x` declarations, no bytes
      // emitted by this file alone. The set module still enters the basket.
      setPath: "all/calendar",
      formats: {
        html: {
          views: [],
        },
      },
    },
    {
      // card-mod-date-0.20.0/set/right/when_created.rb
      // `def content` (when_created.rb:7-11) is a set-module content
      // override; the engine has no per-card content override surface
      // today (see module doc), so no view is registered. The set module
      // still enters the basket.
      setPath: "right/when_created",
      formats: {
        html: {
          views: [],
        },
      },
    },
    {
      // card-mod-date-0.20.0/set/right/when_last_edited.rb
      // Same shape as right/when_created; no view registered (engine
      // surface gap for set-module content overrides).
      setPath: "right/when_last_edited",
      formats: {
        html: {
          views: [],
        },
      },
    },
    {
      // card-mod-date-0.20.0/set/self/now.rb
      // `def content` (now.rb:1-3) is a set-module content override;
      // no view registered (engine surface gap for set-module content
      // overrides). The set module still enters the basket.
      setPath: "self/now",
      formats: {
        html: {
          views: [],
        },
      },
    },
    {
      // card-mod-date-0.20.0/set/type/date.rb
      // The `view :core do; ::Date.parse(card.content).strftime "%B %-d,
      // %Y"; end` (date.rb:6-8) is ALREADY implemented in
      // src/card/render/views.ts#coreView (the typeName === "Date"
      // branch, views.ts:186-214 + formatDateCore:227-248). The
      // mod-registrar's last-wins rule (loader.ts:199) would let a
      // duplicate registration shadow the engine's correct impl; the
      // faithful move is to leave the view registration empty here and
      // rely on the engine-side impl that the compat report counts as
      // "covered" (1/1 html views in HTML_VIEWS).
      setPath: "type/date",
      formats: {
        html: {
          views: [],
        },
      },
    },
  ],
};

export default cardModDate;