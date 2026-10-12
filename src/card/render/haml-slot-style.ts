// The Haml serialization style for the slot id, per deck.
//
// Stock Decko 0.20.0's bar.haml passes the slot id inside the one Haml
// `data:` hash, so every data-* attribute is emitted sorted and
// single-quoted (measured: 552 of 552 slot ids single-quoted). The
// production-lineage app's bar template
// instead emits the slot id as its own DOUBLE-quoted attribute alongside
// the single-quoted Haml attrs.
//
// Which form a deck shows follows the deck's own template, so it is a
// deck-level setting, not a global constant. Default: the stock form
// (in-hash). Hosts serving a separate-attribute deck set
// DECKO_HAML_SLOT_STYLE=separate in their environment (read once at module
// load), or call setHamlSlotStyle directly.

let inHamlHash =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
    ?.DECKO_HAML_SLOT_STYLE !== "separate";

/** Hosts with their own settings bag set the style explicitly. */
export function setHamlSlotStyle(style: "hash" | "separate"): void {
  inHamlHash = style === "hash";
}

export function hamlSlotInHash(): boolean {
  return inHamlHash;
}
