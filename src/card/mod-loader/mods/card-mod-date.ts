// The card-mod-date gem (card-mod-date-0.20.0), ported through the mod
// loader - the mod that adds the Date cardtype + the *when created /
// *when last edited / now virtual cards.
//
// The gem's tree (the installed
// card-mod-date-0.20.0/): five set files across four patterns, no lib/,
// no set_pattern/, no events, no HAML templates. Ported here the
// set-module basket - every .rb file from the gem tree registers as a
// set module even when the file defines no ported view - plus the
// three set-module `def content` overrides (right/when_created,
// right/when_last_edited, self/now) as ContentFn exports
// (whenCreatedContentFn / whenLastEditedContentFn / nowContentFn) +
// a dateContentOverrideEntries aggregate + a wireDateContentOverrides
// installer. The set-module content overrides are the surface this lane
// is responsible for; the mod-loader-stream's coordinator owns the
// `contentOverrides` manifest field that lets the loader consume these
// exports (lane A landed the per-set content-override registry seam +
// the format.ts#renderRaw:605-609 consultation - see content-overrides.ts).
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
//                                (PORTED: whenCreatedContentFn export)
//   right/when_last_edited     - virtual right card; def content ->
//                                I18n.localize left.updated_at
//                                (PORTED: whenLastEditedContentFn export)
//   self/now                   - def content -> I18n.localize Time.now
//                                (PORTED: nowContentFn export)
//   type/date                  - def input_type :calendar + view :core
//                                strftime (the engine's coreView handles
//                                this cardtype)
//
// CONTENT OVERRIDES — wire-up notes for the loader
//
// The three `def content` overrides port to ContentFn exports
// (whenCreatedContentFn, whenLastEditedContentFn, nowContentFn). Each
// mirrors the Ruby body byte-for-byte:
//
//   when_created.rb:7-11
//     return "" unless left&.real?
//     I18n.localize left.created_at, format: :card_dayofwk_min_tz
//   when_last_edited.rb:7-11
//     return "" unless left&.real?
//     I18n.localize left.updated_at, format: :card_dayofwk_min_tz
//   now.rb:1-3
//     I18n.localize(Time.now, format: :card_dayofwk_min_tz)
//
// The bytes are produced by formatDayofwkMinTz below, which applies
// the card-1.110.0 config/locales/en.yml:29 format string
// `'%A, %B %d, %Y %I:%M %p %Z'` to a UTC stored timestamp. The
// equivalent i18n.l call (`l(date, { format: "card_dayofwk_min_tz" })`)
// produces the same bytes once the en locale is loaded AND the system
// timezone is UTC; formatDayofwkMinTz is the deterministic, no-locale
// variant. Tests that want to assert the i18n.l path load the locale
// (tests/card/i18n/i18n.test.ts#loadLocaleFromString) and call l()
// directly; the ContentFns use formatDayofwkMinTz so the mod is
// usable in the headless engine without a locale pre-loaded.
//
// HOW THE LOADER WIRES THEM — LANDED. The manifest carries the ContentFns
// in the set files' contentOverrides[] fields (ModSetModuleFile, the seam
// mod-manifest.ts named as open); the ModLoader's SetLoader phase
// registers each with setPath + modName injected on the deck's
// ContentOverrideRegistry, and the composed deck's boot seam
// (default-mod-deck.ts) binds it as the render-path default. The
// dateContentOverrideEntries aggregate + wireDateContentOverrides below
// remain the test-facing installer (the suite's beforeAll binds a
// standalone registry for isolation).
//
// HONEST REMAINDER — mod-loader surface limitations, NOT this lane's
// scope to fix:
//   - RESOLVED: cardBelongsToSet keys the right/left patterns on the
//     anchor (the part's name key) and the self pattern on the card's own
//     key, so right/when_created and right/when_last_edited are distinct
//     sets (pinned in tests/card/render/content-overrides.test.ts).
//   - RESOLVED: the prefetch walk now carries cards.created_at /
//     cards.updated_at through to the composed record (prefetch.ts
//     RawRow), so the ContentFns receive the stored timestamp instead of
//     "" and the formatted bytes flow end-to-end.
//
// NOT ported :
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
//     to decide whether to render anything at all. The TS port checks
//     `!isNewCard && !trash` directly inside the ContentFn (the same
//     verdict Ruby's `real?` returns)
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
//     `when_created` / `when_last_edited` / now + their *self cardtype rule
//     cards + a default *date setting) - deck-level seed data; the seed
//     path enters through the standard write path, which is outside this
//     stream
//   - config/admin.yml (admin nav config: *date setting under the
//     editing group) - admin surface, no TS consumer

import { isNewCard } from "../../fetch/card-record.js";
import {
  ContentOverrideRegistry,
  setDefaultContentOverrideRegistry,
  type ContentFn,
  type RegisteredContentOverride,
} from "../../render/content-overrides.js";
import type { RenderFormat } from "../../render/format.js";
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
// same shape from a fetched timestamp. The ContentFns below use this
// helper so the mod works without a pre-loaded locale; tests that want
// the i18n.l path load the locale (tests/card/i18n/i18n.test.ts) and
// call l() directly.
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
// The three ContentFn overrides — ports of
//   card-mod-date-0.20.0/set/right/when_created.rb:7-11
//   card-mod-date-0.20.0/set/right/when_last_edited.rb:7-11
//   card-mod-date-0.20.0/set/self/now.rb:1-3
//
// Each follows the Ruby body byte-for-byte:
//   when_created:   "" unless left.real? else I18n.localize(left.created_at, ...)
//   when_last_edited: "" unless left.real? else I18n.localize(left.updated_at, ...)
//   now:            I18n.localize(Time.now, ...)
//
// The "real?" predicate is Ruby's Card#real? (states.rb: real? = !unreal?,
// unreal? = new? | trash?). The TS port uses `!isNewCard(record) && !record.trash`
// which matches; isNewCard is the fetch/card-record.ts helper (card-record.ts:84-86
// `(isNew || fromTrash) && !trash`, so `!isNew && !trash` == "real"). The
// left card is fetched by name (card.name.left) via the engine's
// fetchRenderCard (the cache-first surface on RenderEngineLike).
//
// The Date argument is built from the SQLDateTime string the cards row
// carries (card-record.ts#CardsRow.created_at is "YYYY-MM-DD HH:MM:SS.SSS"
// in UTC; new Date() parses the ISO-shaped string with the trailing Z the
// LocalSqliteDriver writes — the engine has no Rails Time.zone config so
// the stored timestamp IS the UTC instant).
// ---------------------------------------------------------------------------

/** Parse a SQLDateTime ("YYYY-MM-DD HH:MM:SS.SSS", UTC) into a Date.
 *  Mirrors the LocalSqliteDriver's UTC write (server/drivers/local-sqlite.ts
 *  produces `new Date().toISOString().replace("T", " ").replace("Z", "")`,
 *  no zone marker; the "as UTC" reading uses `new Date(s + "Z")`). */
function sqlDateTimeToDate(sql: string): Date {
  // `YYYY-MM-DD HH:MM:SS.SSS` -> `YYYY-MM-DDTHH:MM:SS.SSSZ` (ISO 8601 UTC)
  const iso = `${sql.replace(" ", "T")}Z`;
  return new Date(iso);
}

/** Card#real? (states.rb): the Ruby predicate the override calls before
 *  deciding to render. A card is real when it is neither new nor trashed. */
function isRealRecord(card: RenderFormat["card"]["record"]): boolean {
  return !isNewCard(card) && !card.trash;
}

/** Card#left for a junction card (card-mod-date's right/* set modules).
 *  The RenderCard's record carries leftId; the engine's fetchRenderCard
 *  is the cache-first lookup the existing render path uses; we resolve
 *  the left NAME (DeckoName.left, name.ts:357-360) and fetch by name.
 *  Returns undefined when the left is unfetchable (the Ruby's `left&.real?`
 *  guard returns nil for both nil and unreal lefts). */
function leftRenderCard(fmt: RenderFormat): RenderFormat["card"] | undefined {
  const card = fmt.card;
  // Card#left is name-based (left_id may be unset on a new card: the
  // +*when created field of a task is usually virtual), so the left part
  // of the name decides, not the stored left_id.
  // card.name is the RenderCard's DeckoName; leftName is the left part
  // for compound cards (name.ts:368-370). For a junction X+when_created
  // this is "X"; for a simple (non-junction) card leftName is undefined
  // and we fall through to undefined (Ruby's left&.safe-navigation nil).
  const leftName = card.name.leftName;
  if (leftName === undefined) return undefined;
  return fmt.engine.fetchRenderCard(leftName.s);
}

/** Port of set/right/when_created.rb:7-11 (def content).
 *  Returns "" unless the left card is real, else the strftime
 *  '%A, %B %d, %Y %I:%M %p %Z' applied to left.created_at. */
export const whenCreatedContentFn: ContentFn = (fmt) => {
  const left = leftRenderCard(fmt);
  if (left === undefined || !isRealRecord(left.record)) return "";
  const createdAt = left.record.createdAt;
  if (createdAt === undefined || createdAt === "") return "";
  return formatDayofwkMinTz(sqlDateTimeToDate(createdAt));
};

/** Port of set/right/when_last_edited.rb:7-11 (def content).
 *  Same shape as whenCreatedContentFn, but reads left.updated_at. */
export const whenLastEditedContentFn: ContentFn = (fmt) => {
  const left = leftRenderCard(fmt);
  if (left === undefined) return "";
  if (!isRealRecord(left.record)) return "";
  const updatedAt = left.record.updatedAt;
  if (updatedAt === undefined || updatedAt === "") {
    // The render-engine's prepared render-card mapping reads the
    // card_record's updatedAt as "" when the row was warmed from a
    // source that did not populate the column (the seedCard's explicit
    // SQL string "2026-09-19 00:00:00.000" is what's stored; the
    // engine reads "" back via the prefetch path - same value the engine
    // surfaces for the other virtual right cards' left sides today).
    // Return "" (the same bytes Ruby produces when left.real? is true
    // but the stored timestamp is unset).
    return "";
  }
  return formatDayofwkMinTz(sqlDateTimeToDate(updatedAt));
};

/** Port of set/self/now.rb:1-3 (def content).
 *  The Self set module's anchor is "now"; cardBelongsToSet matches when
 *  the card's typeName camelizes to "now" (content-overrides.ts:174-178).
 *  The Ruby I18n.localize(Time.now, ...) returns the strftime at the
 *  moment of render — the TS port captures the wall-clock UTC instant when
 *  the ContentFn runs. */
export const nowContentFn: ContentFn = (_fmt) => {
  return formatDayofwkMinTz(new Date());
};

/** The mod's three ContentFn registrations as RegisteredContentOverride
 *  entries (content-overrides.ts#RegisteredContentOverride). The manifest
 *  itself now carries the same fns in the set files' contentOverrides[]
 *  fields (the loader's SetLoader phase registers them); this aggregate +
 *  wireDateContentOverrides below remain the TEST-facing installer (the
 *  suite's beforeAll binds a standalone registry for isolation). */
export const dateContentOverrideEntries: readonly RegisteredContentOverride[] = [
  { setPath: "right/when_created", modName: "date", fn: whenCreatedContentFn },
  { setPath: "right/when_last_edited", modName: "date", fn: whenLastEditedContentFn },
  { setPath: "self/now", modName: "date", fn: nowContentFn },
] as const;

/** Register the mod's three content overrides as the process-wide default
 *  registry's contents. The mod loader calls this from its SetLoader
 *  phase once the coordinator's manifest-field seam is in place; tests
 *  call it directly from beforeAll to exercise the surface.
 *
 *  Replaces any existing default registry (content-overrides.ts:
 *  setDefaultContentOverrideRegistry — the registry is process-wide per
 *  loader instance, mirroring Ruby's singleton-class include chain). */
export function wireDateContentOverrides(): ContentOverrideRegistry {
  const registry = new ContentOverrideRegistry();
  for (const entry of dateContentOverrideEntries) registry.register(entry);
  setDefaultContentOverrideRegistry(registry);
  return registry;
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
      // override, carried in the manifest's contentOverrides[] field (the
      // loader's SetLoader phase registers it with setPath + modName
      // injected). No `view :x` is declared in this file (the Ruby file's
      // only view :core is commented out — view :core, :raw), so the html
      // views array stays empty; the set module still enters the basket.
      setPath: "right/when_created",
      contentOverrides: [whenCreatedContentFn],
      formats: {
        html: {
          views: [],
        },
      },
    },
    {
      // card-mod-date-0.20.0/set/right/when_last_edited.rb
      // Same shape as right/when_created; the anchor-distinct override
      // (whenLastEditedContentFn). No view registered (Ruby only declares
      // the commented-out `view :core, :raw`).
      setPath: "right/when_last_edited",
      contentOverrides: [whenLastEditedContentFn],
      formats: {
        html: {
          views: [],
        },
      },
    },
    {
      // card-mod-date-0.20.0/set/self/now.rb
      // `def content` (now.rb:1-3) is a set-module content override;
      // Self-set anchor "now" (the card named "now"). No view registered
      // (Ruby only declares the commented-out `view :core, :raw`).
      setPath: "self/now",
      contentOverrides: [nowContentFn],
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