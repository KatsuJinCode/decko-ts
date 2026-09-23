// Per-set content-override registry: TypeScript port of the Ruby set-module
// `def content` hook (card-mod-date-0.20.0 set/right/when_created.rb:7-11,
// when_last_edited.rb:7-11; set/self/now.rb:1-3). Set modules register a
// method that, given the format, returns the bytes that should stand in for
// the card's dbContent in renderRaw.
//
// Truth source (Ruby):
// - set/right/when_created.rb:7-11: `def content; return "" unless left&.real?;
//   I18n.localize left.created_at, format: :card_dayofwk_min_tz; end`
// - set/right/when_last_edited.rb:7-11: same shape on left.updated_at
// - set/self/now.rb:1-3: `def content; I18n.localize(Time.now, format:
//   :card_dayofwk_min_tz); end`
// - lib/card/content/all.rb:5-7 #content: `structured_content ||
//   standard_content`. The set modules' `def content` overrides hook in via
//   Ruby's singleton-class include chain (one method definition per set
//   module; the last included wins, which mirrors module-reopening order).
// - The TS render path reads `card.dbContent` unconditionally in
//   src/card/render/format.ts renderRaw (format.ts:600-602). The registry
//   here is the lookup seam the mod loader populates and the format layer
//   consults BEFORE falling through to dbContent; cards without an override
//   produce byte-identical output to the existing renderRaw path (the corpus
//   suites under tests/card/render/ pin them; they MUST not change).
//
// SetPath is the path-key the mod loader already uses for view registration
// (mod-loader/mod-registrar.ts#setPathPattern: "right/when_created" ->
// "right"). Content overrides are keyed the same way set modules register
// views - one set path per override, last-wins on duplicates (mirroring
// Ruby's module reopening where the later `def content` wins).
//
// === EXPORTED API (consumed by mod porters) ===
//
//   class ContentOverrideRegistry
//     register(entry: RegisteredContentOverride): void
//     forPath(setPath: string): RegisteredContentOverride | undefined
//     clear(): void
//     paths(): string[]
//
//   function setDefaultContentOverrideRegistry(reg: ContentOverrideRegistry): void
//   function contentOverrideFor(setPath: string): RegisteredContentOverride | undefined
//   function resolveContentOverride(fmt: RenderFormat): string | undefined
//
//   type ContentFn = (fmt: RenderFormat) => string
//   interface RegisteredContentOverride { setPath, modName, fn }

import type { RenderFormat, RenderCard } from "./format.js";

/** A content override: returns the bytes that stand in for dbContent for a
 *  card matched by `setPath`. Mirrors Ruby's `def content; ...; end` body:
 *  the set module defines a method that returns a string, the card's
 *  #content method consults the registered overrides BEFORE falling through
 *  to db_content. */
export type ContentFn = (fmt: RenderFormat) => string;

/** One registered override - the set path that registered it, the
 *  contributing mod (set-loader bookkeeping, parallel to view registration's
 *  RegisteredSetModule), and the ContentFn. */
export interface RegisteredContentOverride {
  /** The set module path the override applies to ("right/when_created").
   *  Matches the view-registration key shape (mod-loader/mod-registrar.ts
   *  setPathPattern + setModuleShortname). */
  readonly setPath: string;
  /** The mod that contributed the override (bookkeeping - same shape
   *  RegisteredSetModule.modName). */
  readonly modName: string;
  readonly fn: ContentFn;
}

/** The registry mod porters write into. register() replaces a previous
 *  registration for the same setPath (Ruby's module reopening - last
 *  registration wins). */
export class ContentOverrideRegistry {
  private readonly byPath = new Map<string, RegisteredContentOverride>();

  /** Register a content override. The mod loader calls this from the
   *  SetLoader phase the same way it calls the view-registration table. */
  register(entry: RegisteredContentOverride): void {
    this.byPath.set(entry.setPath, entry);
  }

  /** The content override for a set path (undefined = no override). The
   *  render path consults this via resolveContentOverride before falling
   *  through to dbContent. */
  forPath(setPath: string): RegisteredContentOverride | undefined {
    return this.byPath.get(setPath);
  }

  /** Drop every registration (the mod loader's reset/reload seam). */
  clear(): void {
    this.byPath.clear();
  }

  /** Every registered set path, in insertion order (registration order is
   *  the lookup order - module reopening's "last included wins" matches
   *  Map.set's last-wins semantics). */
  paths(): string[] {
    return [...this.byPath.keys()];
  }

  /** Number of registered overrides. */
  size(): number {
    return this.byPath.size;
  }
}

// ---------------------------------------------------------------------------
// process-wide default instance
// ---------------------------------------------------------------------------

let defaultRegistry: ContentOverrideRegistry | undefined;

/** Bind a registry as the render-path default (call after the mod loader's
 *  SetLoader phase). The render layer reads from this seam; mod porters do
 *  NOT need to know about the engine - they hand their ContentFn to the
 *  loader, the loader registers it here. */
export function setDefaultContentOverrideRegistry(registry: ContentOverrideRegistry): void {
  defaultRegistry = registry;
}

/** The render-layer consultation seam by set path. Returns the registered
 *  content override for the given set path (or undefined when no mod
 *  registered one). Mirrors mod-loader.ts#modViewUnknown / modViewPerms -
 *  the same process-wide-default pattern. */
export function contentOverrideFor(setPath: string): RegisteredContentOverride | undefined {
  return defaultRegistry?.forPath(setPath);
}

// ---------------------------------------------------------------------------
// card-in-set membership check (the seam that turns a registered setPath
// into a render-time "this card belongs to that set" verdict)
// ---------------------------------------------------------------------------

/** Does the card belong to the set named by `setPath`? Mirrors Ruby's
 *  Card#in_set? (card/set/pattern/all.rb:62-64) for the patterns the
 *  existing TS render layer can identify without walking the full set
 *  module tree. Pattern codes here match the frozen PATTERN_TABLE in
 *  src/card/set-patterns (pattern/all.rb: anchor_name is the set
 *  module's anchor; setModuleShortname camelizes it).
 *
 *  Supported setPath shapes for the documented use cases:
 *  - "right/when_created"   -> Right pattern + rightId set + anchor "when_created"
 *  - "right/when_last_edited" -> same shape on a different anchor
 *  - "self/now"             -> Self pattern + anchor "now"
 *  - "type/<X>/..."         -> Type pattern + typeName matching anchor prefix
 *  - "abstract/..."         -> Abstract pattern (matches every card)
 *  - "all/..."              -> All pattern (matches every card)
 *  - "rstar/..."            -> Rstar pattern + compound card + rightId set
 *  - "star/..."             -> Star pattern + card.name.star? (DeckoName.isStar)
 *  - "rule/..."             -> Rule pattern + card.rule?
 *  - "plus/..."             -> Plus pattern + compound card
 *
 *  Unrecognized setPaths default to "no match" (returns false); cards
 *  without a matching override fall through to dbContent unchanged. */
export function cardBelongsToSet(card: RenderCard, setPath: string): boolean {
  const slash = setPath.indexOf("/");
  const pattern = slash === -1 ? setPath : setPath.slice(0, slash);
  const anchor = slash === -1 ? "" : setPath.slice(slash + 1);

  switch (pattern) {
    case "all":
    case "abstract":
      // both patterns apply to every card; anchor presence is irrelevant
      return true;
    case "type":
      // 03_type.rb anchor is the type's codename (TYPE pattern's anchor_name).
      // Match when the card's typeName camelizes to the same anchor.
      return anchor.length > 0 && card.typeName !== undefined
        && camelizeAnchor(card.typeName) === camelizeAnchor(anchor);
    case "right":
      // 09_right.rb anchor_name is the right part's NAME (not codename);
      // a compound card with a right part satisfies the RIGHT pattern.
      return card.name.isCompound === true && card.name.rightName !== undefined;
    case "left":
      return card.name.isCompound === true && card.name.leftName !== undefined;
    case "self":
      // The Self pattern matches when the card IS its own type (anchor is
      // the type's codename; a Self card's typeName equals that codename).
      return anchor.length > 0 && card.typeName !== undefined
        && camelizeAnchor(card.typeName) === camelizeAnchor(anchor);
    case "plus":
      return card.name.isCompound === true;
    case "star":
      return card.name.isStar === true;
    case "rstar":
      return card.name.isRStar === true;
    case "rule":
      // 06_rule.rb card.rule? is owned by the engine (card.rule? checks the
      // set+setting shape via storage); the render layer asks the engine.
      // Format.ts doesn't have direct access here - the rule pattern's
      // content overrides consult the engine via a process-wide default
      // resolver hook below. Returning false here keeps the byte contract:
      // a Rule-pattern override that the engine did not approve falls
      // through to dbContent (same shape as a card without an override).
      return false;
    default:
      return false;
  }
}

/** Camelcase one underscore-separated anchor ("when_created" ->
 *  "WhenCreated"). Mirrors setModuleShortname's per-segment camelization
 *  (mod-loader/mod-registrar.ts:38-43) for single-segment anchors. */
function camelizeAnchor(anchor: string): string {
  return anchor
    .split("_")
    .map((word) => (word === "" ? "" : word[0]!.toUpperCase() + word.slice(1)))
    .join("");
}

// ---------------------------------------------------------------------------
// the render-path consultation
// ---------------------------------------------------------------------------

/** The render-layer's renderRaw consultation seam. Walks the registered
 *  overrides in registration order, returns the FIRST one whose setPath
 *  matches the card (Ruby's method dispatch: the LAST `def content` wins
 *  because Map.set is last-wins; here we walk in insertion order which is
 *  the order mods registered them - last inserted is at the end, and the
 *  last included set module wins in Ruby too). Returns undefined when no
 *  override matches; format.ts renderRaw falls through to dbContent.
 *
 *  Cards without an override produce byte-identical output to the existing
 *  renderRaw path - the corpus suites under tests/card/render/ pin them
 *  and they MUST not change. */
export function resolveContentOverride(fmt: RenderFormat): string | undefined {
  if (defaultRegistry === undefined) return undefined;
  const card = fmt.card;
  let lastMatch: RegisteredContentOverride | undefined;
  for (const setPath of defaultRegistry.paths()) {
    if (!cardBelongsToSet(card, setPath)) continue;
    const reg = defaultRegistry.forPath(setPath);
    if (reg !== undefined) lastMatch = reg;
  }
  return lastMatch?.fn(fmt);
}
