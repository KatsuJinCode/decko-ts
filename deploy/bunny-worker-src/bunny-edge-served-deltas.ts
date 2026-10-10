// deploy/bunny-worker-src/bunny-edge-served-deltas.ts — the deployment
// configuration that carries ONE deck's private identity into the edge's
// served bytes, EMPTY by default.
//
// WHY THIS EXISTS (review round 4, finding 9): the edge path used to
// hard-code a single private deck's identity as module constants, so EVERY
// deployment of the engine served that deck's version string, asset
// revisions, SRI hashes, corpus card ids and phantom type:
//
//   - bunny-edge-page-shell.ts rewrote `>Decko v0.20.0</a>` to
//     `>Decko v0.19.1</a>`, rewrote one deck's stylesheet revision, and
//     injected that site's SRI attributes on every page of every deck;
//   - bunny-edge-error-page.ts pinned corpus card ids, a `files/…js` path
//     and FOOTER_VERSION_PIN "0.19.1";
//   - src/card/render/pointer-list.ts fell back to PHANTOM_TYPE_ID 22281 /
//     "BasicCs" for every deck's unknown pointer items.
//
// A deck is not identified by the engine's source. It is identified by what
// its operator configures. So every one of those values is a DEPLOYMENT
// CONFIGURATION value here, and the default is EMPTY: a deployment that
// configures nothing is a stock 0.20.0 deck with no private identity, and
// every delta pass becomes a no-op.
//
// HOW A DEPLOYMENT SETS THEM (two equivalent forms, this module reads both):
//
//   1. One JSON blob: DECKO_SERVED_DELTAS='{"footerVersionPin":"0.19.1",…}'
//   2. Individual plain variables, one per value:
//        DECKO_SERVED_ASSET_HOST
//        DECKO_SERVED_FOOTER_VERSION_PIN
//        DECKO_SERVED_STYLESHEET_FROM / DECKO_SERVED_STYLESHEET_TO
//        DECKO_SERVED_SCRIPT_INTEGRITY   (JSON array of {src, withIntegrity})
//        DECKO_SERVED_NOT_FOUND_TYPE_ID / _NAME / _CLASS_TOKEN
//        DECKO_SERVED_FOOTER_CARD_ID / _TYPE_ID / _TYPE_NAME
//        DECKO_SERVED_ALL_CARD_ID / _LAYOUT_POINTER_ID / _POINTER_TYPE_ID
//        DECKO_SERVED_MAIN_CSS_URL / _MAIN_JS_URL
//        DECKO_SERVED_ROOT_URL
//        DECKO_SERVED_HEAD_SCRIPTS      (JSON array of complete <script> tags)
//        DECKO_SERVED_LOGO_URL / _FAVICON_URL / _SITE_TITLE_DEFAULT
//        DECKO_SERVED_PHANTOM_TYPE_ID / _NAME / _KEY
//
// The JSON blob wins field-by-field where both forms are present (an
// operator who sets one JSON blob and one loose variable gets the JSON
// value, and the loose one still fills the fields the blob omits). Either
// form alone is complete.
//
// WHAT THIS IS NOT: this is not a Ruby's config/application.rb port. Ruby
// reads those values from the deck's own environment; this engine has no
// Rails initializer at the edge, so the operator supplies them out of band,
// exactly like DECKO_DB_URL beside it. The production migration deployment
// sets them explicitly in deploy/bunny-edge-trial-runbook.md, which is
// excluded from the export — the shipped code carries no deck's identity.
//
// SDK-free by construction (plain object/string handling), so vitest loads
// it directly — the same testability pattern as bunny-edge-page-shell.ts.

/** The environment bag; on the edge this is process.env, in tests a plain
 *  object (the same convention as EdgeEnv in bunny-edge-deck-config.ts).
 *  Declared structurally so this module stays importable on its own. */
export type ServedDeltasEnv = Record<string, string | undefined>;

/** One remote script's before/after bytes for the SRI pass: the engine's own
 *  pinned manifest form -> the form that carries the integrity attribute. */
export interface ScriptIntegrityDelta {
  src: string;
  withIntegrity: string;
}

/** The not-found card's TYPE identity as a deck's error chrome renders it
 *  (the class chip token, the display name and the type card id). */
export interface NotFoundTypeDelta {
  id: string;
  name: string;
  classToken: string;
}

/** The deck's phantom (unknown pointer/list item) type identity: the fallback
 *  a deck's unknown items carry when no host item type resolves one. */
export interface PhantomTypeDelta {
  typeId: number;
  typeName: string;
  typeKey: string;
}

/** Everything ONE deployment overrides about the served bytes. Every field
 *  is optional; the empty object is the stock-deck default and every delta
 *  pass it drives is a no-op. */
export interface ServedEnvironmentDeltas {
  /** The asset host this deployment serves /files/ URLs from. undefined =
   *  the engine's own host-relative /files/ form (RenderEngine#imageCdnHost
   *  left unset), which is what a deck with no CDN configured renders. */
  assetHost?: string;
  /** The version string the footer credits. undefined = no rewrite; the
   *  deck's own stored credit bytes stand. */
  footerVersionPin?: string;
  /** The stylesheet revision rewrite: the corpus-stored revision the engine
   *  resolves -> the revision this deployment actually serves. undefined =
   *  no rewrite. */
  stylesheetRevision?: { from: string; to: string };
  /** Script integrity attributes to inject. Empty/absent = none. */
  scriptIntegrity?: ScriptIntegrityDelta[];
  /** The error chrome's not-found card type identity. undefined = the
   *  not-found slot renders with NO type chip and NO type attributes. */
  notFoundType?: NotFoundTypeDelta;
  /** The deck's *footer card id / type id / type name — the identity the
   *  error chrome's credit-block slot wrapper carries. Unset, the wrapper
   *  carries no card id or type attributes. */
  footerCardId?: string;
  footerTypeId?: string;
  footerTypeName?: string;
  /** The deck's *all card id (the default-layout rule's left anchor). */
  allCardId?: number;
  /** The deck's *layout pointer id (the default-layout rule's right anchor). */
  layoutPointerId?: number;
  /** The deck's Pointer TYPE id (the navbar dropdown branch). */
  pointerTypeId?: number;
  /** The compiled site CSS URL the error chrome links. */
  mainCssUrl?: string;
  /** The main decko script URL the error chrome links. */
  mainJsUrl?: string;
  /** The deck's public root URL, emitted as the inline `decko.rootUrl`
   *  variable the error chrome's script block carries. Unset, the variable
   *  is emitted with an empty value rather than another deck's domain. */
  rootUrl?: string;
  /** The extra remote <script> tags the error chrome's head carries, in the
   *  order the deployment wants them. Each entry is a COMPLETE tag, verbatim
   *  (the SRI attributes a deployment's CDN requires are part of the tag it
   *  supplies). Empty/absent = no remote scripts — a stock deck's chrome
   *  links only its own compiled CSS and main script. */
  headScripts?: string[];
  /** The *logo fallback URL (used when the deck stores none). */
  logoUrl?: string;
  /** The *favicon fallback URL (used when the deck stores none). */
  faviconUrl?: string;
  /** The *title fallback (used when the deck stores none). */
  siteTitleDefault?: string;
  /** The deck's phantom item type identity. undefined = unknown pointer/list
   *  items carry NO type chip and NO type attributes. */
  phantomType?: PhantomTypeDelta;
}

/** THE DEFAULT: a stock deck. Every delta pass this drives is a no-op, and
 *  no served byte carries any deck's private identity. */
export const EMPTY_SERVED_DELTAS: ServedEnvironmentDeltas = Object.freeze({});

function trimmed(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  return t.length === 0 ? undefined : t;
}

function positiveInt(value: string | undefined): number | undefined {
  const t = trimmed(value);
  if (t === undefined) return undefined;
  const n = Number(t);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/** Parse the DECKO_SERVED_DELTAS JSON blob. A malformed blob yields no
 *  fields rather than throwing: a deployment whose config is malformed must
 *  still serve its pages, and serving them WITHOUT private identity is the
 *  safe reading of a config we could not parse. Named so the behavior is
 *  greppable if a deployment needs to diagnose it. */
function parseDeltasBlob(raw: string | undefined): ServedEnvironmentDeltas {
  const t = trimmed(raw);
  if (t === undefined) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(t);
  } catch {
    return {};
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const blob = parsed as Record<string, unknown>;
  const str = (key: string): string | undefined => {
    const v = blob[key];
    return typeof v === "string" && v.length > 0 ? v : undefined;
  };
  const int = (key: string): number | undefined => {
    const v = blob[key];
    return typeof v === "number" && Number.isInteger(v) ? v : undefined;
  };
  const out: ServedEnvironmentDeltas = {};
  const assetHost = str("assetHost");
  if (assetHost !== undefined) out.assetHost = assetHost;
  const footerVersionPin = str("footerVersionPin");
  if (footerVersionPin !== undefined) out.footerVersionPin = footerVersionPin;
  const cssFrom = str("stylesheetRevisionFrom");
  const cssTo = str("stylesheetRevisionTo");
  if (cssFrom !== undefined && cssTo !== undefined) {
    out.stylesheetRevision = { from: cssFrom, to: cssTo };
  } else {
    // The NESTED blob form — `{"stylesheetRevision": {"from", "to"}}` —
    // which is what the runbook example and the test fixture carry; the
    // flat `stylesheetRevisionFrom`/`_To` pair above is the loose-variable
    // spelling. Both are accepted.
    const css = blob["stylesheetRevision"];
    if (css !== null && typeof css === "object" && !Array.isArray(css)) {
      const c = css as Record<string, unknown>;
      const from = typeof c["from"] === "string" ? c["from"] : undefined;
      const to = typeof c["to"] === "string" ? c["to"] : undefined;
      if (from !== undefined && to !== undefined) {
        out.stylesheetRevision = { from, to };
      }
    }
  }
  const integrity = blob["scriptIntegrity"];
  if (Array.isArray(integrity)) {
    const pairs: ScriptIntegrityDelta[] = [];
    for (const entry of integrity) {
      if (entry === null || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      if (typeof e["src"] === "string" && typeof e["withIntegrity"] === "string") {
        pairs.push({ src: e["src"], withIntegrity: e["withIntegrity"] });
      }
    }
    if (pairs.length > 0) out.scriptIntegrity = pairs;
  }
  const nfId = str("notFoundTypeId");
  const nfName = str("notFoundTypeName");
  const nfToken = str("notFoundTypeClassToken");
  if (nfId !== undefined && nfName !== undefined && nfToken !== undefined) {
    out.notFoundType = { id: nfId, name: nfName, classToken: nfToken };
  } else {
    // The NESTED blob form — `{"notFoundType": {"id", "name",
    // "classToken"}}` — which is what the runbook's example blob and the
    // test fixture carry. The flat `notFoundTypeId`/`_NAME`/`_CLASS_TOKEN`
    // keys above are the loose-variable spelling; both are accepted so an
    // operator can paste either.
    const nf = blob["notFoundType"];
    if (nf !== null && typeof nf === "object" && !Array.isArray(nf)) {
      const n = nf as Record<string, unknown>;
      const id = typeof n["id"] === "string" ? n["id"] : undefined;
      const name = typeof n["name"] === "string" ? n["name"] : undefined;
      const token = typeof n["classToken"] === "string" ? n["classToken"] : undefined;
      if (id !== undefined && name !== undefined && token !== undefined) {
        out.notFoundType = { id, name, classToken: token };
      }
    }
  }
  const footerCardId = str("footerCardId");
  if (footerCardId !== undefined) out.footerCardId = footerCardId;
  const footerTypeId = str("footerTypeId");
  if (footerTypeId !== undefined) out.footerTypeId = footerTypeId;
  const footerTypeName = str("footerTypeName");
  if (footerTypeName !== undefined) out.footerTypeName = footerTypeName;
  const allCardId = int("allCardId");
  if (allCardId !== undefined) out.allCardId = allCardId;
  const layoutPointerId = int("layoutPointerId");
  if (layoutPointerId !== undefined) out.layoutPointerId = layoutPointerId;
  const pointerTypeId = int("pointerTypeId");
  if (pointerTypeId !== undefined) out.pointerTypeId = pointerTypeId;
  const mainCssUrl = str("mainCssUrl");
  if (mainCssUrl !== undefined) out.mainCssUrl = mainCssUrl;
  const mainJsUrl = str("mainJsUrl");
  if (mainJsUrl !== undefined) out.mainJsUrl = mainJsUrl;
  const rootUrl = str("rootUrl");
  if (rootUrl !== undefined) out.rootUrl = rootUrl;
  const headScripts = blob["headScripts"];
  if (Array.isArray(headScripts)) {
    const tags = headScripts.filter((t): t is string => typeof t === "string" && t.length > 0);
    if (tags.length > 0) out.headScripts = tags;
  }
  const logoUrl = str("logoUrl");
  if (logoUrl !== undefined) out.logoUrl = logoUrl;
  const faviconUrl = str("faviconUrl");
  if (faviconUrl !== undefined) out.faviconUrl = faviconUrl;
  const siteTitleDefault = str("siteTitleDefault");
  if (siteTitleDefault !== undefined) out.siteTitleDefault = siteTitleDefault;
  const phId = int("phantomTypeId");
  const phName = str("phantomTypeName");
  const phKey = str("phantomTypeKey");
  if (phId !== undefined && phName !== undefined && phKey !== undefined) {
    out.phantomType = { typeId: phId, typeName: phName, typeKey: phKey };
  } else {
    // The NESTED blob form — `{"phantomType": {"typeId", "typeName",
    // "typeKey"}}` — matching the runbook example and the test fixture.
    const ph = blob["phantomType"];
    if (ph !== null && typeof ph === "object" && !Array.isArray(ph)) {
      const p = ph as Record<string, unknown>;
      const typeId = typeof p["typeId"] === "number" ? p["typeId"] : undefined;
      const typeName = typeof p["typeName"] === "string" ? p["typeName"] : undefined;
      const typeKey = typeof p["typeKey"] === "string" ? p["typeKey"] : undefined;
      if (typeId !== undefined && typeName !== undefined && typeKey !== undefined) {
        out.phantomType = { typeId, typeName, typeKey };
      }
    }
  }
  return out;
}

/** Parse a JSON array of strings (the loose-variable form of a string list).
 *  Same malformed-input contract as the blob: a config we cannot parse
 *  contributes nothing. */
function parseStringArray(raw: string | undefined): string[] | undefined {
  const t = trimmed(raw);
  if (t === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(t);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed)) return undefined;
  const items = parsed.filter((v): v is string => typeof v === "string" && v.length > 0);
  return items.length > 0 ? items : undefined;
}

/** Parse the DECKO_SERVED_SCRIPT_INTEGRITY JSON array (the loose-variable
 *  form of the SRI map). Same malformed-input contract as the blob: a config
 *  we cannot parse contributes nothing. */
function parseIntegrityPairs(raw: string | undefined): ScriptIntegrityDelta[] | undefined {
  const t = trimmed(raw);
  if (t === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(t);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed)) return undefined;
  const pairs: ScriptIntegrityDelta[] = [];
  for (const entry of parsed) {
    if (entry === null || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e["src"] === "string" && typeof e["withIntegrity"] === "string") {
      pairs.push({ src: e["src"], withIntegrity: e["withIntegrity"] });
    }
  }
  return pairs.length > 0 ? pairs : undefined;
}

/** The deployment's served-environment deltas, read from its environment.
 *
 *  Both configuration forms are read (see the module header): the JSON blob
 *  field-by-field, then every loose variable fills what the blob left unset.
 *  With neither form set the answer is EMPTY_SERVED_DELTAS' shape — the
 *  stock deck. */
export function resolveServedEnvironmentDeltas(env: ServedDeltasEnv | undefined): ServedEnvironmentDeltas {
  const src = env ?? {};
  const out: ServedEnvironmentDeltas = { ...parseDeltasBlob(src["DECKO_SERVED_DELTAS"]) };

  const assetHost = trimmed(src["DECKO_SERVED_ASSET_HOST"]);
  if (out.assetHost === undefined && assetHost !== undefined) out.assetHost = assetHost;

  const footerVersionPin = trimmed(src["DECKO_SERVED_FOOTER_VERSION_PIN"]);
  if (out.footerVersionPin === undefined && footerVersionPin !== undefined) {
    out.footerVersionPin = footerVersionPin;
  }

  if (out.stylesheetRevision === undefined) {
    const from = trimmed(src["DECKO_SERVED_STYLESHEET_FROM"]);
    const to = trimmed(src["DECKO_SERVED_STYLESHEET_TO"]);
    if (from !== undefined && to !== undefined) out.stylesheetRevision = { from, to };
  }

  if (out.scriptIntegrity === undefined) {
    const pairs = parseIntegrityPairs(src["DECKO_SERVED_SCRIPT_INTEGRITY"]);
    if (pairs !== undefined) out.scriptIntegrity = pairs;
  }

  if (out.notFoundType === undefined) {
    const id = trimmed(src["DECKO_SERVED_NOT_FOUND_TYPE_ID"]);
    const name = trimmed(src["DECKO_SERVED_NOT_FOUND_TYPE_NAME"]);
    const classToken = trimmed(src["DECKO_SERVED_NOT_FOUND_TYPE_CLASS_TOKEN"]);
    if (id !== undefined && name !== undefined && classToken !== undefined) {
      out.notFoundType = { id, name, classToken };
    }
  }

  const footerCardId = trimmed(src["DECKO_SERVED_FOOTER_CARD_ID"]);
  if (out.footerCardId === undefined && footerCardId !== undefined) out.footerCardId = footerCardId;
  const footerTypeId = trimmed(src["DECKO_SERVED_FOOTER_TYPE_ID"]);
  if (out.footerTypeId === undefined && footerTypeId !== undefined) out.footerTypeId = footerTypeId;
  const footerTypeName = trimmed(src["DECKO_SERVED_FOOTER_TYPE_NAME"]);
  if (out.footerTypeName === undefined && footerTypeName !== undefined) {
    out.footerTypeName = footerTypeName;
  }
  const allCardId = positiveInt(src["DECKO_SERVED_ALL_CARD_ID"]);
  if (out.allCardId === undefined && allCardId !== undefined) out.allCardId = allCardId;
  const layoutPointerId = positiveInt(src["DECKO_SERVED_LAYOUT_POINTER_ID"]);
  if (out.layoutPointerId === undefined && layoutPointerId !== undefined) {
    out.layoutPointerId = layoutPointerId;
  }
  const pointerTypeId = positiveInt(src["DECKO_SERVED_POINTER_TYPE_ID"]);
  if (out.pointerTypeId === undefined && pointerTypeId !== undefined) out.pointerTypeId = pointerTypeId;

  const mainCssUrl = trimmed(src["DECKO_SERVED_MAIN_CSS_URL"]);
  if (out.mainCssUrl === undefined && mainCssUrl !== undefined) out.mainCssUrl = mainCssUrl;
  const mainJsUrl = trimmed(src["DECKO_SERVED_MAIN_JS_URL"]);
  if (out.mainJsUrl === undefined && mainJsUrl !== undefined) out.mainJsUrl = mainJsUrl;
  const rootUrl = trimmed(src["DECKO_SERVED_ROOT_URL"]);
  if (out.rootUrl === undefined && rootUrl !== undefined) out.rootUrl = rootUrl;
  if (out.headScripts === undefined) {
    const tags = parseStringArray(src["DECKO_SERVED_HEAD_SCRIPTS"]);
    if (tags !== undefined) out.headScripts = tags;
  }
  const logoUrl = trimmed(src["DECKO_SERVED_LOGO_URL"]);
  if (out.logoUrl === undefined && logoUrl !== undefined) out.logoUrl = logoUrl;
  const faviconUrl = trimmed(src["DECKO_SERVED_FAVICON_URL"]);
  if (out.faviconUrl === undefined && faviconUrl !== undefined) out.faviconUrl = faviconUrl;
  const siteTitleDefault = trimmed(src["DECKO_SERVED_SITE_TITLE_DEFAULT"]);
  if (out.siteTitleDefault === undefined && siteTitleDefault !== undefined) {
    out.siteTitleDefault = siteTitleDefault;
  }

  if (out.phantomType === undefined) {
    const typeId = positiveInt(src["DECKO_SERVED_PHANTOM_TYPE_ID"]);
    const typeName = trimmed(src["DECKO_SERVED_PHANTOM_TYPE_NAME"]);
    const typeKey = trimmed(src["DECKO_SERVED_PHANTOM_TYPE_KEY"]);
    if (typeId !== undefined && typeName !== undefined && typeKey !== undefined) {
      out.phantomType = { typeId, typeName, typeKey };
    }
  }

  return out;
}

/** True when the deltas carry no field at all — the stock-deck case, and the
 *  answer `/_status` reports so an operator can confirm at a glance that a
 *  deployment is serving unconfigured (stock) bytes. */
export function servedDeltasAreEmpty(deltas: ServedEnvironmentDeltas): boolean {
  return Object.keys(deltas).length === 0;
}