// The DEFAULT EdgeDeriver (ENGINE SEAM 2 of types.ts): this engine's own
// nest parser (render/nest-syntax.ts — the same parser the render resolves
// nests with at view time) plus this engine's link chunk grammar.
//
// THE INVARIANT the spec pins: the edges must match EXACTLY the references
// the render resolves. That is why the deriver delegates to the render's
// parser instead of re-implementing one: builder drift from the render is
// structurally impossible while both import the same chunker.
//
// - Nest chunks ({{name|view}}): comment nests contribute nothing; relative
//   references (leading "_") are EXCLUDED — their resolution depends on the
//   render-time context card, so no stored edge can represent them (SPEC
//   edge case: context-relative nests are the render-plan residue's job).
// - Link chunks ([[name|label]]): the existence-anchor class. Ordinary
//   content links never render, but the layout/navbar machinery turns
//   link targets into rendered nests (navbar-views.ts), so the closure
//   carries them as "link" edges (superset direction; harmless surplus is
//   proven harmless by the byte-identity pin).
//
// A Ruby implementation swaps this module for Chunk::Reference interpretation
// over the same invariant (the portability spec's "edge derivation" seam).

import { DeckoName } from "../name.js";
import { stripTags, scanNests } from "../render/nest-syntax.js";

/** Link chunk scan: the same left-to-right walk discipline the chunker
 *  uses (leftmost prefix wins, [^[]] char class — links cannot nest
 *  brackets), ported from chunk/link.rb's full_re /\A\[\[([^\[\]]*)\]\]/. */
const LINK_FULL_REGEXP = /\[\[([^\[\]]*)\]\]/g;

export interface DerivedReference {
  /** The ABSOLUTE canonical key of the referenced name. */
  key: string;
  /** The nest's requested view when the parse saw one. */
  view?: string;
}

function absolutizeKey(raw: string, contextName: string): string | undefined {
  const stripped = stripTags(raw).trim();
  if (stripped === "") return undefined;
  try {
    const parsed = DeckoName.parse(stripped);
    if (parsed.s === "") return undefined;
    const absolute = parsed.isAbsolute
      ? parsed
      : parsed.absoluteName(DeckoName.parse(contextName));
    const key = absolute.key;
    return key === "" ? undefined : key;
  } catch {
    // Unresolvable mark (codename mark for an unknown codename, broken
    // "~id"): the render's nest path reports it at view time; the graph
    // records nothing (SPEC edge case: unresolved marks are not edges).
    return undefined;
  }
}

export function deriveReferenceEdges(
  content: string,
  referencingCardName: string,
): DerivedReference[] {
  const out: DerivedReference[] = [];
  for (const piece of scanNests(content)) {
    const nest = piece.nest;
    if (nest === undefined || nest.comment !== undefined) continue;
    if (nest.name.startsWith("_")) continue; // context-relative: not an edge
    const key = absolutizeKey(nest.name, referencingCardName);
    if (key === undefined) continue;
    out.push({ key, view: nest.options.view });
  }
  return out;
}

export function deriveLinkEdges(
  content: string,
  referencingCardName: string,
): DerivedReference[] {
  const out: DerivedReference[] = [];
  for (const match of content.matchAll(LINK_FULL_REGEXP)) {
    const inner = match[1] ?? "";
    // [[name|label]]: the part BEFORE the first pipe is the target
    const target = inner.split("|")[0] ?? "";
    if (target.trim().startsWith("_")) continue;
    const key = absolutizeKey(target, referencingCardName);
    if (key === undefined) continue;
    out.push({ key });
  }
  return out;
}
