// Convert a card's `safe_set_keys` string into the per-card set-module
// shortname chain Ruby's MRO walk produces (lib/card/set/format.rb:146-150
// + lib/card/format.rb:62-68: `self.class.format_ancestry.reverse_each
// do |klass|; card.set_format_modules(klass).each do |m|;
// singleton_class.send :include, m; end; end`).
//
// safe_set_keys is "ALL TYPE-rich_text SELF-basic" -
// most-general-FIRST (render/set-keys.ts:63, the registry reverses
// concrete lookup order). The set-module chain Ruby walks is the
// reverse: most-specific-FIRST (the same instance list
// concretePatternsForCard returns, with no reversal).
//
// The conversion is per-token: each safeKey ("ALL", "TYPE-rich_text",
// "RSTAR", "RIGHT-Xread", "TYPE_PLUS_RIGHT-set-Xread",
// "SELF-Xall-Xread") splits into a code segment ("ALL", "TYPE",
// "RSTAR", "RIGHT", "TYPE_PLUS_RIGHT", "SELF") and an anchor segment
// ("", "rich_text", "", "Xread", "set+Xread", "Xall+Xread"). The code
// uppercases the pattern name (ALL -> All, TYPE -> Type,
// TYPE_PLUS_RIGHT -> TypePlusRight); the anchor camelizes and joins
// "+" segments with "+" (Xread -> Xread, set+Xread -> Set+Xread).
// The two segments join with "::" (All, Type::RichText, Rstar,
// Right::Xread, TypePlusRight::Set+Xread, Self::Xall+Xread).
//
// Anchorless patterns (star/rstar/rule) carry just the code
// (set-patterns/instance.ts: anchorless = !respond_to?(:anchor_name)).

import { getNameEnvironment } from "../name/environment.js";

/** Camelize the underscore-joined pattern code: "all" -> "All",
 *  "type_plus_right" -> "TypePlusRight". Mirrors Rails camelize on the
 *  underscore-separated form (mod-order.ts:46-51). */
function camelizeCode(code: string): string {
  return code
    .split("_")
    .map((word) => (word === "" ? "" : word[0]!.toUpperCase() + word.slice(1)))
    .join("");
}

/** Camelize each "+"-separated anchor fragment, AND each underscore
 *  WITHIN a fragment: "xread" -> "Xread", "set+xread" -> "Set+Xread",
 *  "rich_text" -> "RichText", "set+x_all+yread" -> "Set+XAll+Yread".
 *  Mirrors setModuleShortname (mod-registrar.ts:37-51) so a card's
 *  safe_set_keys tokens resolve to the same shortnames the loader
 *  emits from set/PATTERN/ANCHOR.rb paths.
 *
 *  Ruby's safe_key converts the anchor name's "+" to "-" (the
 *  pattern's anchor_name for 08_type_plus_right.rb is
 *  `left_type + "+" + card.name.tag`; the safe_key normalizes "+" to
 *  "-"). The set module's Ruby constant preserves the original "+"
 *  (Card::Set::TypePlusRight::Set+Xread). The conversion reverses
 *  the safe_key normalization: "-" inside the anchor becomes "+". */
function camelizeAnchor(anchor: string): string {
  if (anchor === "") return "";
  return anchor
    .split("-")
    .map((frag) => (frag === "" ? "" : camelizeCode(frag)))
    .join("+");
}

/** One safeKey -> one set module shortname. Examples:
 *   "ALL" -> "All"
 *   "TYPE-rich_text" -> "Type::RichText"
 *   "RSTAR" -> "Rstar"
 *   "RIGHT-Xread" -> "Right::Xread"
 *   "TYPE_PLUS_RIGHT-set-Xread" -> "TypePlusRight::Set+Xread"
 *   "SELF-Xall-Xread" -> "Self::Xall+Xread"
 *
 * The hyphen/plus split is positional: the FIRST "-" separates code
 * from anchor (TYPE_PLUS_RIGHT's underscores stay intact); "+" splits
 * multi-anchor fragments INSIDE the anchor (TYPE_PLUS_RIGHT's anchor
 * is "set+Xread" with the "+" preserved). */
/**
 * Registered-name candidates for one anchored safeKey, EXACT conversion
 * first. The X-stripped variants exist because Ruby's safe_key renders a
 * leading "*" as "X" (pattern/all.rb#safe_key) while a set module's PATH
 * anchor carries the name WITHOUT the star (card-mod-api_key
 * set/right/api_key.rb -> Right::ApiKey, but the rule card's token is
 * "RIGHT-Xapi_key" -> the exact conversion answers "Right::XapiKey",
 * which no registered module uses). The chain walker tries the variants
 * against the registered table, so the star-marker ambiguity resolves by
 * lookup, never by guessing: exact hit wins, then X-stripped combinations
 * (each "-"-separated anchor fragment may independently carry the marker).
 * Bounded: fragments^n variants, fragments <= 3 in practice.
 *
 * Multi-fragment anchors ALSO carry a "::"-joined variant: Ruby's
 * TypePlusRight constant for a set/type_plus_right/set/style.rb file is
 * Card::Set::TypePlusRight::Set+Style (the anchor's "+" survives in the
 * Ruby constant) — and this conversion's "Set+Style" form matches that —
 * but the registration table's shortnames come from the module PATH
 * (mod-registrar.ts setModuleShortname: "type_plus_right/set/style" ->
 * "TypePlusRight::Set::Style"), so the walker needs the path-join form as
 * a candidate too. Without it every type_plus_right (and self) chain
 * token misses its registered module (measured live:
 * `*all+*style`'s chain for asset_output_url was EMPTY while the
 * load report listed TypePlusRight::Set::Style). Candidate ORDER: exact
 * Ruby-constant form first, path form after. */
export function safeKeyToModuleShortnameCandidates(safeKey: string): string[] {
  const first = safeKeyToModuleShortname(safeKey);
  const dashIdx = safeKey.indexOf("-");
  if (dashIdx === -1) return [first];
  const code = safeKey.slice(0, dashIdx).toLowerCase();
  const anchor = safeKey.slice(dashIdx + 1);
  const frags = anchor.split("-");
  const optionsPerFrag = frags.map((f) =>
    f.startsWith("X") && f.length > 1 ? [f, f.slice(1)] : [f],
  );
  const out = new Set<string>([first]);
  // The module-PATH join for the EXACT fragments, X markers or not.
  // Registrations key on the module PATH (mod-registrar.ts
  // setModuleShortname "::"-joins every segment), so a multi-fragment
  // anchor must offer the "::" form even when NO fragment carries the
  // star marker: a "User+email" card anchors "TYPE_PLUS_RIGHT-user-email"
  // (the tag card is not star-named, so there is no X to strip and the
  // mask loop below never runs) and must still reach the registered
  // "TypePlusRight::User::Email". Measured live:
  // the X-marked case dispatched (the fix) while this
  // no-X case returned a one-candidate list that no registered module
  // carries. Lookup still decides - the candidate is tried against the
  // registered table, never assumed.
  if (frags.length > 1) {
    out.add(`${camelizeCode(code)}::${frags.map(camelizeCode).join("::")}`);
  }
  const total = optionsPerFrag.reduce((a, o) => a * o.length, 1);
  for (let mask = 1; mask < total; mask++) {
    let m = mask;
    const chosen: string[] = [];
    for (const opts of optionsPerFrag) {
      const idx = m % opts.length;
      m = Math.floor(m / opts.length);
      chosen.push(opts[idx]);
    }
    const camelFragments = chosen.map((frag) => camelizeCode(frag));
    out.add(`${camelizeCode(code)}::${camelFragments.join("+")}`);
    if (camelFragments.length > 1) {
      // the module-PATH join (setModuleShortname): segments join "::".
      out.add(`${camelizeCode(code)}::${camelFragments.join("::")}`);
    }
  }
  return [...out];
}

/** A SELF token as Ruby keys its set module. Pattern::Base#module_key
 *  (set/pattern/base.rb:21-25, anchor_codenames :39-43) uses the anchor
 *  card's CODENAME and builds no key at all when the card has none, so
 *  Card::Set::Self::Search belongs to the card whose codename is search
 *  ("*search"), never to a card named "Search". Returns the token rewritten
 *  to the anchor's codename ("SELF-Xsearch" -> "SELF-search"), null when
 *  the anchor card has no codename (no self module applies), or the token
 *  unchanged when it is not a simple SELF token or the installed name
 *  environment cannot resolve its anchor. */
export function rubySelfToken(token: string): string | null {
  if (!token.startsWith("SELF-")) return token;
  const anchor = token.slice("SELF-".length);
  if (anchor === "" || anchor.includes("-")) return token;
  const env = getNameEnvironment();
  if (env?.lexicon === undefined || env.codename === undefined) return token;
  const key = anchor.startsWith("X") && anchor.length > 1 ? `*${anchor.slice(1)}` : anchor;
  const id = env.lexicon.id(key);
  if (id === undefined) return token;
  const codename = env.codename.nameForId(id);
  if (codename === undefined || codename === "") return null;
  return `SELF-${codename}`;
}

/** The anchor parts' codenames for an anchored (non-SELF) token, as
 *  Pattern::Base#anchor_codenames builds them (set/pattern/base.rb:39-43:
 *  `anchor_parts.map { |part| part.cardname&.codename || break }`), resolved
 *  through the installed name environment (key -> id -> codename):
 *  - `{ codenames }` when every part has a codename: the module key is
 *    their camelized join, and the set files live at
 *    `<pattern>/<codename>/...`;
 *  - `null` when some part's card exists without a codename: Ruby builds no
 *    module key, so no anchored module applies;
 *  - `undefined` when the environment cannot answer (no environment, or a
 *    part the sync lexicon has not seen): the caller falls back to the
 *    name-derived spelling and must not memoize the answer. */
export function anchorCodenames(token: string): { codenames: string[] } | null | undefined {
  const dashIdx = token.indexOf("-");
  if (dashIdx === -1 || token.startsWith("SELF-")) return undefined;
  const env = getNameEnvironment();
  if (env?.lexicon === undefined || env.codename === undefined) return undefined;
  const codenames: string[] = [];
  let missing = false;
  for (const frag of token.slice(dashIdx + 1).split("-")) {
    if (frag === "") return undefined;
    const key = frag.startsWith("X") && frag.length > 1 ? `*${frag.slice(1)}` : frag;
    const id = env.lexicon.id(key);
    if (id === undefined) return undefined;
    const codename = env.codename.nameForId(id);
    if (codename === undefined || codename === "") missing = true;
    else codenames.push(codename);
  }
  return missing ? null : { codenames };
}

/** The set-module shortname Ruby's module key names for a pattern code and
 *  its anchor codenames ("type", ["search_type"] -> "Type::SearchType";
 *  "type_plus_right", ["cardtype", "account"] ->
 *  "TypePlusRight::Cardtype::Account"). */
export function moduleShortnameForCodenames(code: string, codenames: readonly string[]): string {
  return `${camelizeCode(code.toLowerCase())}::${codenames.map(camelizeCode).join("::")}`;
}

/** The set modules a set-key token names, as Ruby keys them
 *  (set/pattern/base.rb module_key over anchor_codenames): for an anchored
 *  token, the camelized codenames of the anchor parts, so a Person-typed
 *  card whose type codename is user belongs to Type::User, and a part whose
 *  card has no codename ("email"; "Roles", whose codename role is not the
 *  roles of *roles) gives no module at all. `paths` is the set-file path the
 *  nested modules sit under ("type_plus_right/cardtype/account"). A SELF
 *  token is expected already rewritten to its codename (rubySelfToken).
 *
 *  When the name environment cannot answer (none installed, or an anchor
 *  part the sync lexicon has not seen) the name-derived spellings stand in,
 *  and `definitive` is false: the answer must not be memoized. */
export function anchoredModuleCandidates(token: string): {
  candidates: string[];
  paths: string[] | undefined;
  definitive: boolean;
} {
  const named = safeKeyToModuleShortnameCandidates(token);
  if (token.startsWith("SELF-") || !token.includes("-")) {
    return { candidates: named, paths: undefined, definitive: true };
  }
  const resolved = anchorCodenames(token);
  if (resolved === null) return { candidates: [], paths: [], definitive: true };
  if (resolved !== undefined) {
    const code = token.slice(0, token.indexOf("-")).toLowerCase();
    return {
      candidates: [moduleShortnameForCodenames(code, resolved.codenames)],
      paths: [`${code}/${resolved.codenames.join("/")}`],
      definitive: true,
    };
  }
  const out = [...named];
  for (const c of codenameModuleShortnames(token)) if (!out.includes(c)) out.push(c);
  return { candidates: out, paths: undefined, definitive: false };
}

/** Ruby's module key for an anchored token: Pattern::Base#module_key
 *  (set/pattern/base.rb:21-29) camelizes the anchor parts' CODENAMES, not
 *  their name keys, so a Search-typed card (token "TYPE-search", type
 *  codename search_type) belongs to Card::Set::Type::SearchType. Each
 *  anchor fragment is resolved through the installed name environment
 *  (key -> id -> codename); a fragment with no codename keeps its key. Empty
 *  when no fragment resolves to a codename different from its key. */
export function codenameModuleShortnames(safeKey: string): string[] {
  const dashIdx = safeKey.indexOf("-");
  if (dashIdx === -1) return [];
  const env = getNameEnvironment();
  if (env?.lexicon === undefined || env.codename === undefined) return [];
  const code = safeKey.slice(0, dashIdx).toLowerCase();
  let changed = false;
  const parts = safeKey
    .slice(dashIdx + 1)
    .split("-")
    .map((frag) => {
      const key = frag.startsWith("X") && frag.length > 1 ? `*${frag.slice(1)}` : frag;
      const id = env.lexicon!.id(key);
      const codename = id === undefined ? undefined : env.codename!.nameForId(id);
      if (codename === undefined || codename === "") return frag.replace(/^X/, "");
      if (codename !== frag) changed = true;
      return codename;
    });
  if (!changed) return [];
  return [`${camelizeCode(code)}::${parts.map(camelizeCode).join("::")}`];
}

export function safeKeyToModuleShortname(safeKey: string): string {
  const dashIdx = safeKey.indexOf("-");
  if (dashIdx === -1) return camelizeCode(safeKey.toLowerCase());
  const code = safeKey.slice(0, dashIdx).toLowerCase();
  const anchor = safeKey.slice(dashIdx + 1);
  return `${camelizeCode(code)}::${camelizeAnchor(anchor)}`;
}

/** Convert a safe_set_keys string to the per-card set module shortname
 *  chain, MOST-SPECIFIC-FIRST (Ruby's MRO walk). The input is
 *  most-general-FIRST, so the result reverses it. An empty input
 *  returns [] (the "no set applies" case). */
export function setKeysToModuleChain(setKeys: string): string[] {
  if (setKeys.trim() === "") return [];
  const generalFirst = setKeys.split(/\s+/).filter((s) => s !== "");
  return generalFirst.slice().reverse().map(safeKeyToModuleShortname);
}
