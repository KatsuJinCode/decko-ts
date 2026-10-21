// The KNOWN-virtual-card registry: the set modules that override
// `virtual?` and therefore make a card with NO database row KNOWN.
//
// Ruby truth:
// - card-1.110.0 mod/core/set/all/states.rb:44-50 `virtual?`:
//   `real? || name.simple? ? false : structure.present?` - the
//   STRUCTURE-rule arm (the port models it in fetch/virtual-cards.ts).
//   A set module that overrides the method (the gem's
//   `def virtual?; new?; end`) replaces that arm for its own cards: the
//   card is new (no row) AND virtual, so it is KNOWN.
// - card-1.110.0 mod/core/set/all/states.rb:60-62 `known?`:
//   `real? || virtual?` - the fetch layer returns such a card
//   (fetch/results.rb:19-21: `card if new_opts || card.known?`).
// - The gem files that override it:
//   card-mod-follow-0.20.0/set/right/followers.rb:22-24
//   card-mod-follow-0.20.0/set/type_plus_right/user/follow.rb:9-11
//
// WHY THE PORT NEEDS IT: a KNOWN card renders as a card. The render
// layer's unknown-card gate (format.ts#viewForUnknown) substitutes the
// create form ("new") or the not-found page for an UNKNOWN main card
// (card-mod-format set/all/html/error.rb:81-86 page_view_for_unknown -
// `ok?(:create) ? :new : super`). A virtual-but-known card must NOT take
// that arm: Ruby renders its own :core view (the followers pointer list
// for the +*followers junction; the follow/ignore tabs for the
// User+*follow dashboard).
//
// THE MEMBERSHIP PREDICATE: the registry is keyed by SET PATH - the same
// key the content overrides and the view registrations use - and matched
// through cardBelongsToSet (content-overrides.ts), the port's set
// membership predicate. That predicate answers the right-pattern arm by
// the anchor card's CODENAME (the shape a real Decko field card carries:
// the right part is the card "*followers", whose codename is "followers"),
// so a real "X+*followers" junction matches the "right/followers" path.

import { cardBelongsToSet } from "./content-overrides.js";
import type { RenderCard } from "./format.js";

/** One registered virtual set: the set path (the manifest's setPath) and
 *  the contributing mod (bookkeeping - the same shape the content
 *  override registry carries). */
export interface RegisteredVirtualCardSet {
  readonly setPath: string;
  readonly modName: string;
}

/** The set modules whose cards are known without a row. */
export class VirtualCardRegistry {
  private readonly byPath = new Map<string, RegisteredVirtualCardSet>();

  /** Register a virtual set (last registration per path wins, Ruby's
   *  module reopening). */
  register(entry: RegisteredVirtualCardSet): void {
    this.byPath.set(entry.setPath, entry);
  }

  /** Drop every registration (the mod loader's reset/reload seam). */
  clear(): void {
    this.byPath.clear();
  }

  /** Every registered set path, in registration order. */
  paths(): string[] {
    return [...this.byPath.keys()];
  }

  /** The card belongs to one of the registered virtual sets - the Ruby
   *  `known?` answer for a card with no row. */
  matches(card: RenderCard): boolean {
    for (const setPath of this.byPath.keys()) {
      if (cardBelongsToSet(card, setPath)) return true;
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// process-wide default
// ---------------------------------------------------------------------------

let defaultRegistry: VirtualCardRegistry | undefined = new VirtualCardRegistry();

/** Bind the registry the render layer reads (the mod loader's SetLoader
 *  phase). undefined unbinds - no virtual sets, every absent card is
 *  unknown (the pre-mod-loader shape). */
export function setDefaultVirtualCardRegistry(
  registry: VirtualCardRegistry | undefined,
): void {
  defaultRegistry = registry;
}

/** The bound registry (undefined when unbound). */
export function virtualCardRegistry(): VirtualCardRegistry | undefined {
  return defaultRegistry;
}

/** Ruby `known?` for a card with no row: is the card in a set whose module
 *  overrides `virtual?`? The port's answer for the ordinary absent card
 *  is false (the structure-rule arm lives in the fetch layer's virtual
 *  lookup, fetch/virtual-cards.ts). */
export function isKnownVirtualCard(card: RenderCard): boolean {
  return defaultRegistry?.matches(card) === true;
}
