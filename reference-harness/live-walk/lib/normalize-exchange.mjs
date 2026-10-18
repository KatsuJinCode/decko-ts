// The walk instrument's normalisation, stated once and applied in the open
// (the sibling statement is reference-harness/SPEC.md section 4, whose
// discipline this follows). Every rule the walk comparison can apply is
// listed in WALK_RULES below with its name, its kind (mask / canonical form /
// capture redaction), its exact scope and its about-text. The report prints
// the whole table — rules applied zero times included — and every application
// is counted per side, so nothing is normalized away silently and the raw
// evidence stays on disk beside the verdict.
//
// Two namespaces, per the house convention (SPEC.md section 4):
// - W1..W8: this instrument's own rules (walk comparison).
// - N*: the corpus instrument's html rules (runner/normalize.mjs), borrowed
//   for html response bodies and named as borrowed at every call site here.
//
// Capture redaction (R1) is not a comparison rule and cannot be disabled:
// passwords and session-cookie values are redacted when an exchange is
// STORED, before disk, so the evidence directory never holds a live
// credential even when the walk runs against a real host.

import { normalizeHtml } from "../../runner/normalize.mjs";

// RFC 1123 http-date, the shape HTTP date-valued fields use (RFC 9110 5.6.7):
// `Tue, 15 Nov 1994 08:12:31 GMT`.
export const HTTP_DATE = /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/;
// RFC 3339 / ISO 8601 datetime with a time part, plus Ruby's Time#to_s shape
// (`2026-10-18 12:34:56 +0000`: space separator, space before the zone). A
// bare date 2011-12-14 is content, never masked — the N5 discipline: absolute
// dates are an encoding the engine must get right.
export const ISO_DATETIME = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z| ?[+-]\d{2}:?\d{2})?/g;
// An RFC 2822-ish datetime as Ruby/Rails prints one inside a body
// (`Tue, 15 Nov 1994 08:12:31 UTC +00:00`).
export const RUBY_DATETIME = /[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} [A-Z]{2,5}(?: [+/-]\d{2}:?\d{2})?/g;

export const WALK_RULES = [
  {
    id: "W1", name: "session-cookie-value", kind: "mask", enabled: true,
    scope: "Set-Cookie header values whose cookie name contains \"session\" or is decko_visit (extend with --session-cookie-name)",
    about: "A walk issues a fresh session per side; two walks can never share a session token, so the value says nothing about what is compared. Cookie NAMES always compare exactly — a name difference is a finding.",
  },
  {
    id: "W2", name: "csrf-token", kind: "mask", enabled: true,
    scope: "values of hidden inputs named authenticity_token (attribute value=), meta[name=csrf-token] content, X-CSRF-Token headers, and token/authenticity_token query params (>= 12 chars)",
    about: "A per-session/per-render request-forgery token differs between any two walks by design, including between two walks of one host.",
  },
  {
    id: "W3", name: "nonce", kind: "mask", enabled: true,
    scope: "nonce=\"...\" attribute values in attribute position, 16+ chars",
    about: "A per-response content-security nonce differs on every response, on both hosts.",
  },
  {
    id: "W4", name: "timestamp", kind: "canonical-form-over-walk-time", enabled: true,
    scope: "ISO 8601 / RFC 3339 datetimes and Ruby printed datetimes in JSON and text bodies, and in html attributes whose name contains time or date or ends in at; NOT free text inside an html page (a printed date is content) and NOT bare dates (2011-12-14)",
    about: "A walk's wall clock differs between the sides; a stored timestamp a page prints says when the record was written, not which host wrote it. The surrounding bytes still count.",
  },
  {
    id: "W5", name: "http-date", kind: "canonical-form-over-walk-time", enabled: true,
    scope: "Date / Expires / Last-Modified response header values and Expires= attributes inside Set-Cookie, in exact http-date shape",
    about: "The response clock: two walks seconds apart differ here while saying the same thing.",
  },
  {
    id: "W6", name: "etag", kind: "mask", enabled: true,
    scope: "ETag header values (presence and weak/strong shape still compare)",
    about: "An ETag is a fingerprint of one deployment's bytes and cache policy, not of page behavior; two distinct hosts never agree on it. Disabling W6 puts raw ETags back into the verdict.",
  },
  {
    id: "W7", name: "url-token", kind: "mask", enabled: true,
    scope: "values of query params named token / authenticity_token / confirmation / reset_password_token / reset_token (>= 12 chars), in request URLs; query param order never counts, presence and values do",
    about: "A one-time mailed-link token differs per walk. The param's presence and every other param still compare exactly.",
  },
  {
    id: "W8", name: "host-address", kind: "canonical-form", enabled: true,
    scope: "each side's own origin (host:port, hostname:port) in the Host / Origin / Referer request headers, the Location response header, and in its own html/json/text bodies",
    about: "The walked host's own address is where the walk pointed, not what the site says: two walks run on different ports (and the live walk on different hostnames) while saying the same thing. The convention is the sibling form stable() applies in runner/normalize.mjs (N2's port canonicalisation), named here as borrowed and given its own rule id so its applications are counted.",
  },
  {
    id: "N*", name: "corpus-instrument html rules (borrowed)", kind: "canonical-form, borrowed", enabled: true,
    scope: "html response bodies: N1 slot ids, N3 class-token order, N4 collapse ids, N5 relative-time spans, N6 backtrace frames, N7 capture-host paths, N9 object addresses — runner/normalize.mjs, unmodified",
    about: "Borrowed, not renumbered (SPEC.md section 4.1): two renders of one engine differ in slot ids and relative times, and a live walk renders at two different clocks. Reported as one N* total with the applied rule set named.",
  },
  {
    id: "R1", name: "capture-redaction", kind: "capture-time, always on", enabled: true, alwaysOn: true,
    scope: "values of form fields named password/password_confirmation and of session-named cookies, redacted when the exchange is stored, before disk",
    about: "Not a comparison rule: the evidence directory must never hold a live credential, so the redaction happens at capture and cannot be disabled. Comparison still runs on every other byte.",
  },
];

export function walkRulesEnabled(disabledIds) {
  const disabled = new Set(disabledIds ?? []);
  const unknown = [...disabled].filter((id) => !WALK_RULES.some((r) => r.id === id));
  if (unknown.length > 0) throw new Error(`--disable: unknown rule id(s) ${unknown.join(", ")}; known: ${WALK_RULES.map((r) => r.id).join(" ")}`);
  if (disabled.has("R1")) throw new Error("R1 (capture-redaction) is always on and cannot be disabled");
  return WALK_RULES.filter((r) => !r.alwaysOn).map((r) => ({ ...r, enabled: !disabled.has(r.id) }));
}

/** A fresh accounting ledger. `note(id)` records an application;
 *  `explain(id)` records an application that also absorbed a raw difference
 *  between the sides (the value differed before the rule, equals after). */
export function newApplied() {
  return {
    counts: new Map(), explained: new Map(), appliedSet: new Set(),
    note(id) { this.counts.set(id, (this.counts.get(id) ?? 0) + 1); this.appliedSet.add(id); },
    explain(id) { this.explained.set(id, (this.explained.get(id) ?? 0) + 1); },
    snapshot() {
      return Object.fromEntries([...this.counts.entries()].map(([id, n]) => {
        const e = this.explained.get(id) ?? 0;
        return e > 0 ? [id, { applied: n, explained: e }] : [id, { applied: n }];
      }));
    },
    appliedRuleIds() { return [...this.appliedSet].sort(); },
  };
}

export const SESSION_COOKIE_DEFAULT_NAMES = ["decko_visit"];
const isSessionCookieName = (name, extra) =>
  extra.includes(name) || SESSION_COOKIE_DEFAULT_NAMES.includes(name) || name.includes("session");

/** "name=value; attrs" -> "name=<placeholder>;attrs" (attrs kept, compared). */
function redactCookieValue(cookiePair, placeholder) {
  const eq = cookiePair.indexOf("=");
  if (eq === -1) return cookiePair;
  const semi = cookiePair.indexOf(";");
  const attrs = semi === -1 ? "" : cookiePair.slice(semi);
  return `${cookiePair.slice(0, eq)}=${placeholder}${attrs}`;
}

/** R1, at capture time: session-named cookie values (request Cookie header and
 *  response Set-Cookie) and password form fields are redacted before disk. */
export function redactForStorage(exchange, extraSessionNames = []) {
  const out = { ...exchange };
  if (typeof out.requestHeaders?.cookie === "string") {
    out.requestHeaders = {
      ...out.requestHeaders,
      cookie: String(out.requestHeaders.cookie)
        .split(";").map((s) => s.trim()).filter(Boolean)
        .map((pair) => (isSessionCookieName(pair.slice(0, pair.indexOf("=")).trim(), extraSessionNames) ? redactCookieValue(pair, "R1#redacted") : pair))
        .join("; "),
    };
  }
  if (Array.isArray(out.setCookieRaw)) {
    out.setCookieRaw = out.setCookieRaw.map((value) =>
      isSessionCookieName(value.slice(0, value.indexOf("=")).trim(), extraSessionNames) ? redactCookieValue(value, "R1#redacted") : value);
  }
  if (typeof out.postData === "string") {
    // Any urlencoded field whose NAME contains "password" is redacted,
    // structure first so the surrounding form stays comparable. Over-redaction
    // is the safe direction for credentials; the field names stay compared.
    out.postData = out.postData.replace(/([A-Za-z0-9_%[\]()+*.-]*password[A-Za-z0-9_%[\]()+*.-]*=)[^&\n]*/gi, "$1R1%23redacted");
  }
  return out;
}

const TOKEN_QUERY_PARAMS = new Set(["token", "authenticity_token", "confirmation", "reset_password_token", "reset_token"]);

/** W-rule normalisation of a request URL: W7 masks volatile token params so
 *  two walks' one-time links match; param order never counts; presence and
 *  other values do. The walk host's own address inside a URL is that side's
 *  origin, not a difference — the sibling form is stable()'s 127.0.0.1:PORT
 *  canonicalisation in runner/normalize.mjs, named here as borrowed. */
export function normalizeUrl(urlString, { on, note }) {
  let parsed;
  try { parsed = new URL(urlString); } catch { return urlString; }
  const out = `${parsed.pathname}${parsed.search}`;
  let pathAndQuery = out;
  if (on("W7") && parsed.search) {
    const params = [...parsed.searchParams.entries()]
      .map(([k, v]) => (TOKEN_QUERY_PARAMS.has(k) && v.length >= 12 ? (note("W7"), [k, "W7#url-token"]) : [k, v]))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    pathAndQuery = `${parsed.pathname}?${params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")}`;
  }
  return pathAndQuery.replace(/127\.0\.0\.1:\d+|localhost:\d+/g, "HOST:PORT");
}

/** W8: each side's own host address (host:port, or its full origin) is the
 *  walk's pointing, not the site's statement — canonicalized wherever it
 *  appears in that side's own headers and bodies. Borrowed convention from
 *  stable() in runner/normalize.mjs, named as its own rule so it counts. */
const HOST_ADDRESS = /(127\.0\.0\.1|localhost|0\.0\.0\.0)(:\d+)?/g;
export function maskHostAddress(text, ownOrigin, note, on) {
  let changed = false;
  let out = String(text);
  if (on("W8")) {
    if (ownOrigin) {
      const escaped = ownOrigin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      out = out.replace(new RegExp(escaped, "g"), () => { changed = true; return "W8#host-address"; });
    }
    out = out.replace(HOST_ADDRESS, () => { changed = true; return "W8#host-address"; });
  }
  if (changed) note("W8");
  return out;
}

/** The comparison form of one exchange under the enabled W rules. Returns a
 *  canonical object whose equality with the other side's is the byte verdict.
 *  The raw exchange is never modified — it stays on disk untouched (R1
 *  redaction happened at capture, before disk, and is named in the report). */
export function normalizeExchange(exchange, { rules, ledger, sessionCookieNames = [], ownOrigin = null }) {
  const on = (id) => rules.find((r) => r.id === id)?.enabled !== false;
  const note = (id) => ledger?.note(id);
  const out = {
    method: exchange.method,
    status: exchange.status,
    url: normalizeUrl(exchange.url, { on, note }),
    bodyKind: exchange.bodyKind,
    contentSha256: exchange.contentSha256 ?? null,
    requestHeaders: {},
    headers: {},
    bodyText: exchange.bodyText ?? null,
  };
  // Request headers after R1: compared exactly, except W8's host-address
  // canonical form on the address-bearing headers. (Cookie values were
  // redacted at capture because they are session-named.)
  for (const [name, value] of Object.entries(exchange.requestHeaders ?? {})) {
    const v = Array.isArray(value) ? value.join(", ") : String(value);
    out.requestHeaders[name.toLowerCase()] = ["host", "origin", "referer"].includes(name.toLowerCase()) ? maskHostAddress(v, ownOrigin, note, on) : v;
  }
  // Response headers, one name -> values map; set-cookie entries stay
  // separate (they never join into one comma value).
  const map = new Map();
  const add = (name, value) => {
    const list = map.get(name.toLowerCase()) ?? [];
    list.push(value);
    map.set(name.toLowerCase(), list);
  };
  if (Array.isArray(exchange.headersArray)) for (const { name, value } of exchange.headersArray) add(name, value);
  else if (exchange.headers) for (const [name, value] of Object.entries(exchange.headers)) for (const v of Array.isArray(value) ? value : [value]) add(name, v);
  if (Array.isArray(exchange.setCookieRaw)) map.set("set-cookie", exchange.setCookieRaw);
  for (const [lname, values] of map) {
    out.headers[lname] = values.map((value) => {
      if (lname === "set-cookie") {
        const cookieName = value.slice(0, value.indexOf("=")).trim();
        let v = value;
        if (on("W1") && isSessionCookieName(cookieName, sessionCookieNames)) {
          note("W1");
          v = redactCookieValue(v, "W1#session");
        }
        if (on("W5")) {
          v = v.replace(/(Expires=)([^;]+)/i, (_, p, d) => (HTTP_DATE.test(d) ? (note("W5"), `${p}W5#http-date`) : `${p}${d}`));
        }
        return v;
      }
      if (on("W5") && ["date", "expires", "last-modified"].includes(lname) && HTTP_DATE.test(value)) {
        note("W5");
        return "W5#http-date";
      }
      if (on("W6") && lname === "etag") {
        note("W6");
        return value.startsWith("W/") ? "W/\"W6#etag\"" : "\"W6#etag\"";
      }
      if (on("W2") && lname === "x-csrf-token" && value.length >= 12) {
        note("W2");
        return "W2#csrf";
      }
      if (on("W8") && lname === "location") {
        return maskHostAddress(value, ownOrigin, note, on);
      }
      return value;
    });
  }
  // Body: html goes through the borrowed N* rules first, then the walk's own
  // structural walk; JSON and text bodies take W4 only; binary bodies were
  // compared by their content hash (out.contentSha256), never decoded.
  if (out.bodyKind === "html" && typeof out.bodyText === "string") {
    const nApplied = new Set();
    out.bodyText = normalizeHtml(out.bodyText, { applied: nApplied });
    for (const id of nApplied) note("N*");
    out.bodyText = normalizeHtmlBodyWalk(out.bodyText, { on, note });
    out.bodyText = maskHostAddress(out.bodyText, ownOrigin, note, on);
  } else if ((out.bodyKind === "json" || out.bodyKind === "text") && typeof out.bodyText === "string") {
    if (on("W4")) {
      out.bodyText = out.bodyText.replace(ISO_DATETIME, (m) => (note("W4"), "W4#time")).replace(RUBY_DATETIME, (m) => (note("W4"), "W4#time"));
    }
    out.bodyText = maskHostAddress(out.bodyText, ownOrigin, note, on);
  }
  return out;
}

const TAG_NAME_CHARS = /[A-Za-z0-9:_-]/;
const RAW_TEXT_ELEMENTS = new Set(["script", "style", "textarea", "title", "xmp"]);
const WHITESPACE = (c) => c === " " || "\n\r\t\f".includes(c);

/** The walk's own structural walk of an html body (ported from
 *  runner/normalize.mjs's grammar walk — same discipline: masks land only
 *  where the html grammar puts an attribute, never inside script/style
 *  bodies, comments, or look-alike text). Applies:
 *  - W3: a nonce attribute's value (16+ chars), in attribute position;
 *  - W2: the value of an input named authenticity_token (its value=
 *    attribute), and a meta csrf-token's content=, in attribute position
 *    with tag context;
 *  - W4: an ISO/Ruby datetime inside an attribute whose NAME contains time
 *    or date or ends in at (data-created-at, datetime=...).
 *  Text regions: nothing is masked — a printed date in page text is content
 *  (the N5 discipline), and the walk says so in W4's scope. */
export function normalizeHtmlBodyWalk(html, { on, note }) {
  const maskValue = (tagNameLower, tagTextLower, name, value) => {
    const lname = name.toLowerCase();
    if (on("W3") && lname === "nonce" && value.length >= 16) {
      note("W3");
      return "W3#nonce";
    }
    if (on("W2") && value.length >= 12) {
      if (tagNameLower === "input" && lname === "value" && tagTextLower.includes("authenticity_token")) {
        note("W2");
        return "W2#csrf";
      }
      if (tagNameLower === "meta" && lname === "content" && tagTextLower.includes("csrf-token")) {
        note("W2");
        return "W2#csrf";
      }
    }
    if (on("W4") && (/time|date/.test(lname) || /(^|-)at$/.test(lname))) {
      const after = value.replace(ISO_DATETIME, (m) => (note("W4"), "W4#time")).replace(RUBY_DATETIME, (m) => (note("W4"), "W4#time"));
      if (after !== value) return after;
    }
    return value;
  };
  let out = "";
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) { out += html.slice(i); break; }
    out += html.slice(i, lt);
    i = lt;
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      i = end === -1 ? html.length : end + 3;
      out += html.slice(lt, i);
      continue;
    }
    if (html.startsWith("<!", i) || html.startsWith("<?", i)) {
      const gt = html.indexOf(">", i);
      i = gt === -1 ? html.length : gt + 1;
      out += html.slice(lt, i);
      continue;
    }
    let k = i + 1;
    const closing = html[k] === "/";
    if (closing) k++;
    if (!/[A-Za-z]/.test(html[k] ?? "")) { out += "<"; i++; continue; }
    const nameStart = k;
    while (k < html.length && TAG_NAME_CHARS.test(html[k])) k++;
    const tagName = html.slice(nameStart, k).toLowerCase();
    let quote = null;
    let j = k;
    while (j < html.length) {
      const c = html[j];
      if (quote) { if (c === quote) quote = null; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === ">") break;
      j++;
    }
    const tagEnd = j >= html.length ? html.length : j + 1;
    const tagText = html.slice(i, tagEnd);
    out += closing ? tagText : walkTagAttributes(tagText, tagName, maskValue);
    i = tagEnd;
    if (!closing && RAW_TEXT_ELEMENTS.has(tagName) && !tagText.endsWith("/>")) {
      const closeAt = html.toLowerCase().indexOf(`</${tagName}`, i);
      const bodyEnd = closeAt === -1 ? html.length : (() => { const gt = html.indexOf(">", closeAt); return gt === -1 ? html.length : gt + 1; })();
      out += html.slice(i, bodyEnd);
      i = bodyEnd;
    }
  }
  return out;
}

function walkTagAttributes(tagText, tagName, maskValue) {
  const tagTextLower = tagText.toLowerCase();
  let out = "";
  let k = 1; // past `<`
  while (k < tagText.length && !WHITESPACE(tagText[k]) && tagText[k] !== ">" && tagText[k] !== "/") k++;
  out += tagText.slice(0, k);
  while (k < tagText.length) {
    const c = tagText[k];
    if (WHITESPACE(c) || c === ">" || c === "/" || c === "=") { out += c; k++; continue; }
    const nameStart = k;
    while (k < tagText.length && !WHITESPACE(tagText[k]) && !"=/>".includes(tagText[k])) k++;
    const name = tagText.slice(nameStart, k);
    if (k === nameStart) { out += tagText.slice(k); break; }
    let e = k;
    while (e < tagText.length && WHITESPACE(tagText[e])) e++;
    if (tagText[e] !== "=") { out += name; continue; }
    let v = e + 1;
    while (v < tagText.length && WHITESPACE(tagText[v])) v++;
    out += tagText.slice(nameStart, v);
    const q = tagText[v];
    if (q === '"' || q === "'") {
      const closeQ = tagText.indexOf(q, v + 1);
      const value = closeQ === -1 ? tagText.slice(v + 1) : tagText.slice(v + 1, closeQ);
      const next = maskValue(tagName, tagTextLower, name, value);
      out += q + next + (closeQ === -1 ? "" : q);
      k = closeQ === -1 ? tagText.length : closeQ + 1;
    } else {
      // An unquoted value: no walk rule applies (every rule's shape needs
      // quotes), so it still counts byte for byte — the corpus walk's rule.
      let u = v;
      while (u < tagText.length && !WHITESPACE(tagText[u]) && tagText[u] !== ">") u++;
      out += tagText.slice(v, u);
      k = u;
    }
  }
  return out;
}

/** Content-kind from a content-type header value. */
export function bodyKindFor(contentType) {
  const ct = String(contentType ?? "").toLowerCase();
  if (ct.includes("html")) return "html";
  if (ct.includes("json")) return "json";
  if (ct.startsWith("text/") || ct.includes("javascript") || ct.includes("xml")) return "text";
  return "binary";
}
