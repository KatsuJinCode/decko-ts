// The card-level set-module content-override universe: the port of Ruby's
// set-module `def content` hook, i.e. every answer a card's #content gives
// from SET-MODULE CODE rather than from its DB row.
//
// Ruby mechanism (full derivation with file:line in
// WORK_DIR/
// the set-override fidelity note, "[relaunch t1] RUBY DERIVATION COMPLETE"):
//
// 1. Base: Card::Content::All#content = `structured_content || standard_content`
//    (card-1.110.0 lib/card/content/all.rb:5-7) — the row path the port's
//    structuredCardContent (src/card/rules/structure.ts) already carries.
// 2. Runtime inclusion: Card#include_set_modules (mod/core/set/all/
//    initialize.rb:61-74) includes each applicable set module into the card's
//    SINGLETON class (initialize.rb:72-74), on fetch (lib/card/fetch/
//    results.rb:12). Singleton ancestors precede the Card class, so any
//    `def content` in an applicable set module shadows the base for EVERY
//    card.content caller.
// 3. Applicability + precedence: set_modules = concrete_patterns[0..-2]
//    .reverse.map(&:module_list) (lib/card/set/pattern/all.rb:44-46); the
//    pattern list registers insert-at-0 over load order 01_all..09_self
//    (mod/core/set_pattern/), so concrete = [Self, TypePlusRight, Right,
//    Rule, RStar, Star, Type, AllPlus, All], set_modules excludes All and
//    includes in reverse — Self LAST, i.e. HIGHEST method precedence:
//    Self > TypePlusRight > Right > Rule > RStar > Star > Type > AllPlus.
// 4. Qualification: module_key (set/pattern/class_methods.rb:45-49) exists
//    only when EVERY anchor name part carries a codename (anchor_codenames,
//    set/pattern/base.rb:46-49: `part.cardname&.codename || break`). Pattern
//    anchors: Self = the full name (09_self.rb), Right = the tag part,
//    compound_only (07_right.rb), Type = the type, applies iff type_id
//    (03_type.rb).
//
// This module is the RESOLUTION seam the record path consults
// (dual-$1direct-runner-core.ts card-engine handler via
// structuredCardContent's setModuleOverride parameter). It is NOT a feature
// flag: for every wired module below, the Ruby answer IS the spec; cards
// matching no wired module resolve undefined and fall through to the
// unchanged row path (byte-identical to pre-change behavior).
//
// Deliberately-loud divergences (each documented in this pass recorded result):
// - Self::Mod: Ruby interpolates a Cardio::Mod OBJECT ("#{mod}_mod",
//   mod/core/set/self/mod.rb:4-6) and Cardio::Mod defines no #to_s
//   (lib/cardio/mod.rb), so Ruby emits Object#to_s — "#<Cardio::Mod:0xADDR>"
//   — with a per-process heap address. The SHAPE is reproduced exactly
//   (modObjectToS below: Ruby's own template, the same 16-hex-digit width,
//   one distinct id per mod, assigned in the bundle order). The
//   VALUE is a genuine per-process opaque id, because Ruby's value is
//   a genuine per-process value: it is not comparable across languages and
//   not across Ruby runs, and pretending otherwise would be the lie. The
//   comparator canonicalizes it on both sides (src/testing/diff.ts
//   normalizeModObjectAddresses), so the graded record view passes on the
//   shape and on every other byte — not as an accepted exception.
// - Self::Now / Right::WhenCreated / Right::WhenLastEdited:
//   I18n.localize(..., format: :card_dayofwk_min_tz) renders the wall clock /
//   row timestamp in the deck's Rails Time.zone, with %Z the zone's
//   abbreviation at that instant. Both now come from the deck's configured
//   zone (src/card/deck-time-zone.ts) rather
   //   than from a hard-coded host zone and a Windows display-name
   //   literal; "now" still comes from the injectable wall clock (the
   //   reference bytes are a frozen sample of a time-varying answer).
//   The pinned deck's zone remains the default so those bytes do not move —
//   only the %Z LABEL changes, from the Windows display name
//   "Pacific Standard Time" to the abbreviation Ruby prints ("PDT" for a
//   September instant, "PST" for a winter one).
//
// Named remainders (derivation complete, NOT wired — see the recorded result):
// - Type::BootswatchSkin (card-mod-bootstrap set/type/bootswatch_skin.rb:44-48):
//   CONTENT_PARTS assembly resolves a mod-style subtree ("style: mods" →
//   18 "mod: X+*style" rule cards) whose ~222KB of deck scss
   //   rides an untraced rule-card item mechanism; wiring it would be a guess.
// - Right::GroupRemote (card-mod-assets set/right/group_remote.rb:29-31) and
//   Right::Followers (card-mod-follow set/right/followers.rb:13-15): zero
//   presence (no live junction carries these tag codenames);
//   both need machinery nothing here exercises (manifest-group config
//   parsing / the follow-set surface).
// - Abstract::HamlFile and Abstract::CodenameList define `def content` but
//   have ZERO includers in the installed gems (verified); CodeFile's other
//   descendant abstracts (AssetScript/AssetStyle chains) likewise have zero
//   concrete includers. Dead code in the universe — no registration.

import { randomBytes } from "node:crypto";
import { cardWallClockNow, setCaptureWallClock } from "./wall-clock.js";
import {
  CORPUS_CAPTURE_TIME_ZONE,
  formatCardDayofwkMinTz,
} from "./deck-time-zone.js";

import { ORACLE_BUNDLE_ORDER } from "./mod-loader/default-mod-deck.js";
import {
  bootstrapCoreContent,
  bootstrapFunctionsContent,
} from "./render/bootstrap-code-files.js";
// The pointer-content helper + the input-type catalog live in the render
// override seam (render/content-overrides.ts) — owning them HERE closed an
// import cycle (this module -> mod-loader/default-mod-deck -> mods ->
// render) that broke five suites at module-evaluation time. Re-exported so
// the record-path consumers are unchanged.
import { listInputOptionsContent, toPointerContent } from "./render/content-overrides.js";

export { listInputOptionsContent, toPointerContent };

// ---------------------------------------------------------------------------
// the pinned deck environment (documented constants, deck_origin precedent)
// ---------------------------------------------------------------------------

/**
 * The instant a Self::Now record's bytes photograph:
 * "Monday, September 28, 2026 03:12 PM" (15:12 in the deck's zone =
 * 22:12:00Z). The %I:%M format is minute-precision, so the exact second is
 * unobservable; :00 is the canonical choice.
 */
export const CAPTURE_WALL_CLOCK_CAPTURE_INSTANT: Date = new Date(
  "2026-09-28T22:12:00Z",
);

/** The *now record.content bytes (the pin target), as the port now
 *  renders them: the same wall clock, with %Z as the zone's ABBREVIATION at
 *  that instant. A Windows host prints the display name
 *  "Pacific Standard Time" for this September (PDT) instant; Ruby prints the
 *  abbreviation, so the port does
 *  too (see src/card/deck-time-zone.ts). */
export const ORACLE_CAPTURE_NOW_BYTES = "Monday, September 28, 2026 03:12 PM PDT";

/** The zone the reference bytes are in. Not the engine default (that is
 *  UTC, the deck's own setting)
 *  and not a claim about any deck: it is what reproducing those bytes
 *  requires, so a fixture or test that reproduces them sets it explicitly. */
export const ORACLE_DECK_TIME_ZONE = {
  /** The IANA zone the instant arithmetic uses. */
  ianaTimeZone: CORPUS_CAPTURE_TIME_ZONE,
  /** The abbreviation %Z renders for a September (PDT) instant in it — what
   *  Ruby's %Z produces, and what ORACLE_CAPTURE_NOW_BYTES carries. */
  zoneName: "PDT",
} as const;

export { setCaptureWallClock, cardWallClockNow };

// ---------------------------------------------------------------------------
// Ruby helpers the override bodies call
// ---------------------------------------------------------------------------

// toPointerContent + listInputOptionsContent moved to
// render/content-overrides.ts (import-cycle break, see the import block
// above); re-exported there and imported above for the bodies below.

/**
 * I18n.localize(..., format: :card_dayofwk_min_tz) — the en.yml:29 format
 * string '%A, %B %d, %Y %I:%M %p %Z', rendered in the DECK's configured zone
 * with the abbreviation computed from that zone. Re-exported from
 * src/card/deck-time-zone.ts, which owns both; the `zone` argument is what
 * lets one instant be rendered in two zones without moving the deck-wide
 * setting.
 */
export { formatCardDayofwkMinTz };

/** Parse a SQLDateTime ("YYYY-MM-DD HH:MM:SS.SSS", UTC — the LocalSqliteDriver
 *  write shape) into the Date the deck-zone render reads. Same reading as
 *  card-mod-date.ts#sqlDateTimeToDate. */
function sqlDateTimeToDate(sql: string): Date {
  const iso = `${sql.replace(" ", "T")}Z`;
  return new Date(iso);
}

// ---------------------------------------------------------------------------
// the override bodies (one per wired set module; Ruby citation per entry)
// ---------------------------------------------------------------------------

/** card-mod-date-0.20.0 set/self/now.rb:1-3 — I18n.localize(Time.now, ...). */
function nowContent(): string {
  return formatCardDayofwkMinTz(cardWallClockNow());
}

/** card-1.110.0 mod/core set/self/version.rb:7-9 — Cardio::Version.release
 *  (lib/cardio/version.rb:9-11 reads the card gem's VERSION file: 0.20.0). */
const CARDIO_VERSION_RELEASE = "0.20.0";

/** card-mod-layout-0.20.0 set/self/alerts.rb:1-3 — the deprecation literal. */
const ALERTS_CONTENT = "<!-- *alerts is deprecated. please remove from layout -->";

/** card-mod-layout-0.20.0 set/self/foot.rb:1-3 — the deprecation literal. */
const FOOT_CONTENT = "<!-- *foot is deprecated. please remove from layout -->";

/**
 * card-1.110.0 mod/core set/self/mod.rb:9-11 —
 * `item_codes.map(&:cardname).compact.to_pointer_content` where
 * `item_codes = Cardio.mods.map { |mod| "#{mod}_mod" }`. LOUD DIVERGENCE: the
 * port emits "<mod name>_mod" (see the module header) — the "#<Cardio::Mod:0xADDR>"
 * prefix is Object#to_s of a Cardio::Mod with no
 * #to_s, process-bound and unreproducible. The mod LIST and its order are the
 * bundle order (ORACLE_BUNDLE_ORDER).
 */
/**
 * Ruby Object#to_s as Cardio::Mod receives it. Ruby's default is "#<" + the
 * class name + ":0x" + the object's address in hex + ">", so shape fidelity
 * means reproducing the template, the 0x prefix, the hex width and the
 * closing bracket — NOT the value. Only the value is process-bound;
 * the comparator masks that (normalizeModObjectAddresses).
 *
 * The addresses on the reference deck are 16 lowercase hex digits, all 34
 * distinct, so the port holds itself to that same width.
 */
export const CARDIO_MOD_ADDRESS_HEX_DIGITS = 16;

/** The class Ruby prints — Cardio::Mod (lib/cardio/mod.rb), the class whose
 *  absence of #to_s is the whole reason Object#to_s runs. */
const CARDIO_MOD_CLASS_NAME = "Cardio::Mod";

/**
 * Per-process identity for the port's mod objects. Seeded ONCE per process
 * from the OS entropy source and advanced per mod, so two renders inside one
 * process agree — a warm re-render is stable — while the sequence differs
 * between processes, which is exactly Ruby's property here.
 *
 * Deliberately NOT a hash of the mod name. Ruby's value is a heap address:
 * an opaque per-process id. A name-derived value would be reproducible and
 * therefore would pretend the two are comparable when they are not; the
 * comparator would then be masking a lie instead of an artifact.
 */
let modIdentityCursor: bigint | undefined;
let modIdentityMask: bigint | undefined;

function nextModIdentity(): bigint {
  if (modIdentityCursor === undefined || modIdentityMask === undefined) {
    let seed = 0n;
    for (const byte of randomBytes(8)) seed = (seed << 8n) | BigInt(byte);
    // Keep 56 bits so the printed value is exactly 16 hex digits wide, matching
    // Ruby, and advance from there so the all-zero id is unreachable.
    modIdentityMask = (1n << 56n) - 1n;
    modIdentityCursor = (seed >> 8n) & modIdentityMask;
  }
  modIdentityCursor = (modIdentityCursor + 1n) & modIdentityMask;
  return modIdentityCursor;
}

/** A port stand-in for one Cardio::Mod: the mod's name (Cardio::Mod#name,
 *  lib/cardio/mod.rb:38-44) and the per-process identity its heap address
 *  stands in for. */
export interface CardioModObject {
  /** The mod's name — the value Object#to_s does NOT print, but the value
   *  the port must still emit in the same order Ruby enumerates the mods. */
  readonly name: string;
  /** The per-process opaque id standing in for the heap address. */
  readonly identity: bigint;
}

/** Ruby Object#to_s for a Cardio::Mod (mod/core/set/self/mod.rb:5
 *  interpolates the object; the class defines no #to_s). */
export function modObjectToS(mod: CardioModObject): string {
  const address = mod.identity
    .toString(16)
    .padStart(CARDIO_MOD_ADDRESS_HEX_DIGITS, "0");
  return `#<${CARDIO_MOD_CLASS_NAME}:0x${address}>`;
}

/** The 34 mods a deck has loaded, as port objects, in the
 *  bundle order (ORACLE_BUNDLE_ORDER) — the order mod/core/set/self/mod.rb:4
 *  enumerates Cardio.mods in. Exported so the ORDER is observable from
 *  outside: the emitted bytes are all Object#to_s strings, which carry no
 *  mod name, so nothing in the rendered content could otherwise pin which
 *  mod produced which line. */
export function capturedModObjects(): readonly CardioModObject[] {
  return ORACLE_BUNDLE_ORDER.map((name) => ({ name, identity: nextModIdentity() }));
}

/**
 * card-1.110.0 mod/core/set/self/mod.rb:9-11 —
 * `item_codes.map(&:cardname).compact.to_pointer_content`, where
 * `item_codes = Cardio.mods.map { |mod| "#{mod}_mod" }` (mod.rb:4-6).
 *
 * The interpolation is the whole mechanism: `mod` is the OBJECT, not its
 * name, so each line is Object#to_s of a Cardio::Mod followed by "_mod".
 * to_pointer_content (config/initializers/01_core_extensions/array.rb:4-12)
 * strips one leading "[[" and one trailing "]]" — neither is present here,
 * so all 34 lines survive byte-for-byte, which is what Ruby emits.
 */
export function modItemCodesContentForMods(
  mods: readonly CardioModObject[],
): string {
  return toPointerContent(mods.map((mod) => `${modObjectToS(mod)}_mod`));
}

export function modItemCodesContent(): string {
  return modItemCodesContentForMods(capturedModObjects());
}

// listInputOptionsContent lives in render/content-overrides.ts (import-cycle
// break); re-exported above.

/** card-mod-session-0.20.0 set/type/session.rb:33-35 —
 *  `db_content || session_content`. The bare engine has no session store
 *  (session_content reads Env.session, empty outside a request), so the row
 *  is the whole answer — identical bytes to the base fall-through. */
function sessionContent(dbContent: string | null | undefined): string {
  return dbContent ?? "";
}

/** card-mod-date-0.20.0 set/right/when_created.rb:7-11 —
 *  `return "" unless left&.real?; I18n.localize left.created_at, ...`. */
function whenCreatedContent(card: SetModuleContentCard): string {
  if (card.leftIsReal !== true || card.leftCreatedAt === undefined) return "";
  return formatCardDayofwkMinTz(sqlDateTimeToDate(card.leftCreatedAt));
}

/** card-mod-date-0.20.0 set/right/when_last_edited.rb:7-11 — same shape on
 *  left.updated_at. */
function whenLastEditedContent(card: SetModuleContentCard): string {
  if (card.leftIsReal !== true || card.leftUpdatedAt === undefined) return "";
  return formatCardDayofwkMinTz(sqlDateTimeToDate(card.leftUpdatedAt));
}

// ---------------------------------------------------------------------------
// the qualification walk (derivation item 3/4: precedence + anchor codenames)
// ---------------------------------------------------------------------------

/** A card's resolution input. `partCodenames` is the right-spine codename
 *  chain (one entry per name part, null where the part carries no codename) —
 *  Ruby anchor_codenames over the card's name parts. The left fields feed the
 *  Right-pattern bodies (left&.real? and the left timestamps). */
export interface SetModuleContentCard {
  /** The card's simple/composed KEY (Ruby simple_key). */
  readonly key: string;
  /** The card's composed name. */
  readonly name: string;
  /** The card's own codename, when it has one. */
  readonly codename?: string | null;
  /** The type's codename (the Type pattern's anchor). */
  readonly typeCode?: string | null;
  /** The stored db_content (cards.db_content). */
  readonly dbContent: string | null | undefined;
  /** Per-part codename chain, outermost part first. */
  readonly partCodenames?: readonly (string | null)[];
  /** left&.real? for the Right-pattern bodies. */
  readonly leftIsReal?: boolean;
  /** left.created_at (SQLDateTime, UTC). */
  readonly leftCreatedAt?: string | undefined;
  /** left.updated_at (SQLDateTime, UTC). */
  readonly leftUpdatedAt?: string | undefined;
}

/** Self-pattern module chains (module_key anchor codenames, joined "+").
 *  Derivation "[relaunch t1]" table; bootstrap_core/bootstrap_functions ride
 *  Abstract::BootstrapCodeFile (set/abstract/bootstrap_code_file.rb:4-6
 *  includes CodeFile + OverrideCodeFile whose `def content` wins). */
const SELF_MODULE_CHAINS: ReadonlyMap<string, (card: SetModuleContentCard) => string> =
  new Map([
    ["now", () => nowContent()],
    ["version", () => CARDIO_VERSION_RELEASE],
    ["alerts", () => ALERTS_CONTENT],
    ["foot", () => FOOT_CONTENT],
    ["mod", () => modItemCodesContent()],
    [
      "input_type+right+content_options",
      () => listInputOptionsContent(),
    ],
    // set/self/bootstrap_core.rb:1 (Abstract::BootstrapCodeFile →
    // OverrideCodeFile#content, bootstrap_code_file.rb:8-10)
    ["bootstrap_core", () => bootstrapCoreContent(undefined as never)],
    // set/self/bootstrap_functions.rb:1 (same abstract)
    ["bootstrap_functions", () => bootstrapFunctionsContent(undefined as never)],
  ]);

/** Right-pattern tag codenames with WIRED bodies. group_remote / followers
 *  are derivation-complete remainders (module header) — unregistered. */
const RIGHT_MODULE_TAGS: ReadonlyMap<string, (card: SetModuleContentCard) => string> =
  new Map([
    ["when_created", whenCreatedContent],
    ["when_last_edited", whenLastEditedContent],
  ]);

/** Type-pattern codenames with WIRED bodies. bootswatch_skin is the named
 *  remainder (module header) — unregistered. */
const TYPE_MODULE_CODENAMES: ReadonlyMap<
  string,
  (card: SetModuleContentCard) => string
> = new Map([["session", (card) => sessionContent(card.dbContent)]]);

/**
 * The card-level resolution: Ruby's singleton-include precedence as a walk —
 * Self first (last included, highest precedence), then Right, then Type
 * (derivation item 3; TypePlusRight/Rule/RStar/Star/AllPlus have no wired
 * `def content` modules in the installed gems). Returns the override answer
 * for the FIRST matching pattern, or undefined when no wired module matches
 * (the caller falls through to the unchanged structured/standard row path).
 * Qualification follows Ruby exactly: the Self chain needs EVERY part
 * codenamed (anchor_codenames break, set/pattern/base.rb:46-49); Right is
 * compound-only with the tag part's codename (07_right.rb); Type matches on
 * the type's codename (03_type.rb).
 */
export function resolveSetModuleContent(
  card: SetModuleContentCard,
): string | undefined {
  const parts = card.partCodenames;
  if (parts !== undefined && parts.length > 0 && parts.every((p) => p !== null)) {
    const selfFn = SELF_MODULE_CHAINS.get(parts.join("+"));
    if (selfFn !== undefined) return selfFn(card);
  }
  if (parts !== undefined && parts.length > 1) {
    const tag = parts[parts.length - 1];
    if (tag !== null) {
      const rightFn = RIGHT_MODULE_TAGS.get(tag);
      if (rightFn !== undefined) return rightFn(card);
    }
  }
  if (card.typeCode != null) {
    const typeFn = TYPE_MODULE_CODENAMES.get(card.typeCode);
    if (typeFn !== undefined) return typeFn(card);
  }
  return undefined;
}
