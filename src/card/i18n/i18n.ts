// Minimal I18n port for the render layer: TypeScript port of the gem en.yml
// loader + lookup + interpolation Ruby ships with (i18n-1.15.2 + the card
// gems' config/locales/en.yml files). Mods' missing views currently emit
// bare locale tokens ("format.server_error", "format.denial", etc.) - a
// documented divergence in card-mod-format.ts. This module closes that
// divergence by resolving the tokens to the bytes the YAML files specify.
//
// Truth source (Ruby):
// - i18n-1.15.2/lib/i18n/exceptions.rb:46-70 MissingTranslation#message:
//   "Translation missing: <locale>.<scope parts>.<key>" (no scope: just
//   "<locale>.<key>"). With array defaults: "Translation missing. Options
//   considered were:\n- key1\n- key2".
// - i18n-1.15.2/lib/i18n/backend/simple.rb:93-107 #lookup: walks the
//   normalized keys list, splitting on "." and treating each segment as a
//   hash key; returns nil when any segment is missing. The translate
//   pipeline (base.rb:28-69) then throws :exception with MissingTranslation
//   when the entry is nil.
// - i18n-1.15.2/lib/i18n/backend/base.rb:182-189 #pluralize: English rules
//   (count == 1 picks :one, otherwise :other; :zero for count == 0 when
//   present). The datetime.distance_in_words entries have :one/:other
//   pairs that this must honor.
// - i18n-1.15.2/lib/i18n/backend/base.rb:201-210 #interpolate: only
//   strings interpolate; %{name} placeholders replaced by values, %% is
//   a literal %.
//
// The en.yml files the loader needs (byte-exact byte values; loaded lazily
// from the gem paths, no npm install):
//   card-1.110.0/config/locales/en.yml
//   card-mod-format-0.20.0/config/locales/en.yml
//   actionview-7.2.3.2/lib/action_view/locale/en.yml
//
// === EXPORTED API (consumed by mod porters and the existing views) ===
//
//   function t(key: string, opts?: TOpts): string
//   function tExists(key: string, opts?: { scope?: string }): boolean
//   function l(date: Date, opts: { format: string }): string
//   function loadLocaleFile(locale: string, path: string): void
//   function loadLocaleFromString(locale: string, yaml: string): void
//   function resetI18n(): void
//   function missingTranslationMessage(locale: string, key: string, scope?: string): string
//
//   interface TOpts { scope?: string; default?: string | string[];
//                     count?: number; locale?: string; vars?: Record<string, string|number> }

import { parseYaml, type YamlValue } from "./yaml.js";

/** Lookup options. `scope` prefixes the key with a dotted path (I18n.t's
 *  scope option - i18n.rb:147-149); `default` is the fallback string or
 *  array of fallback keys tried in order (i18n.rb:191-194); `count` picks
 *  the plural form (:one / :other / :zero); `vars` substitutes %{name}
 *  placeholders in the leaf string. */
export interface TOpts {
  scope?: string;
  default?: string | string[];
  count?: number;
  locale?: string;
  vars?: Record<string, string | number>;
}

/** Active locales: keyed by locale string ("en"), each value is the parsed
 *  YAML tree (nested object). Lazily populated by loadLocaleFile. */
const translations = new Map<string, { [k: string]: YamlValue }>();

/** The active locale for unqualified lookups (I18n.config.locale). The
 *  card render layer only ever needs "en" today; the seam stays so a deck
 *  that boots another locale (de.yml/es.yml exist) can switch. */
let defaultLocale: string | undefined;

/** Load a YAML locale file from disk. Async because the module uses
 *  dynamic import for fs. Called from the boot-time prepareEngine hook the
 *  same way the Ruby loader loads files at I18n.load_path. */
export async function loadLocaleFile(locale: string, path: string): Promise<void> {
  return loadLocaleFileAsync(locale, path);
}

/** Load a YAML locale from an in-memory string (tests use this to avoid
 *  touching disk). The YAML must have the locale as the top-level key. */
export function loadLocaleFromString(locale: string, yaml: string): void {
  const parsed = parseYaml(yaml);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`i18n: top-level YAML must be a map, got ${typeof parsed}`);
  }
  // The YAML's top-level key is the locale name (e.g. "en" or "de"). Pull
  // the subtree under that key as the data for this locale; this matches
  // Ruby's I18n.backend.store_translations(locale, data, ...) where `data`
  // is the subtree under the locale key (i18n/backend/base.rb:247).
  const subtree = (parsed as { [k: string]: YamlValue })[locale];
  if (subtree === undefined) {
    throw new Error(`i18n: top-level key "${locale}" not found in YAML`);
  }
  if (typeof subtree !== "object" || subtree === null || Array.isArray(subtree)) {
    throw new Error(`i18n: top-level "${locale}" must be a map, got ${typeof subtree}`);
  }
  const existing = translations.get(locale) ?? {};
  translations.set(locale, deepMerge(existing, subtree as { [k: string]: YamlValue }));
}

/** Drop every loaded locale (the test isolation seam + the mod loader's
 *  reset). The default locale binding is also cleared. */
export function resetI18n(): void {
  translations.clear();
  defaultLocale = undefined;
}

/** Set the default locale for unqualified lookups. */
export function setDefaultLocale(locale: string): void {
  defaultLocale = locale;
}

/** Resolve a translation. Mirrors I18n.t's behavior:
 *  - key may be a dotted path ("format.server_error") or a single segment
 *    - scope prepends a dotted path to the key
 *  - the missing-key behavior is byte-exact: returns "Translation missing:
 *    <locale>.<key>" per MissingTranslation#message (exceptions.rb:63-70)
 *    - this is what Ruby's default ExceptionHandler returns for a missing
 *    key (i18n.rb:5-11). The render layer surfaces this string in the same
 *    slot a real translation would have filled.
 *  - default (string) returns that literal when the key is missing
 *  - default (array) tries each entry as a key, returns the first hit
 *  - count picks the plural form on hash entries with :one/:other/:zero
 *  - vars interpolates %{name} placeholders in the leaf string
 *  - returns the raw subtree (object) when the entry is an object and no
 *    count is supplied - matches Ruby's I18n.t behavior (the docstring
 *    at i18n.rb:135-136: "I18n.t :date returns the whole translations
 *    hash {:formats => {:short => ...}}").
 */
export function t(key: string, opts: TOpts = {}): string | YamlValue {
  const locale = opts.locale ?? defaultLocale ?? "en";
  const fullKey = opts.scope !== undefined && opts.scope !== ""
    ? `${opts.scope}.${key}`
    : key;

  // Try the explicit key first.
  let entry = lookup(translations.get(locale), fullKey);
  let resolvedKey = fullKey;

  // Default fallback (string or array of keys).
  if (entry === undefined && opts.default !== undefined) {
    if (typeof opts.default === "string") {
      if (opts.default.length > 0) {
        return interpolate(opts.default, opts.vars ?? {});
      }
    } else {
      for (const alt of opts.default) {
        entry = lookup(translations.get(locale), alt);
        if (entry !== undefined) {
          resolvedKey = alt;
          break;
        }
      }
    }
  }

  if (entry === undefined) {
    return missingTranslationMessage(locale, key, opts.scope);
  }

  // Pluralize when the entry is a hash with one/other/zero subkeys.
  if (typeof entry === "object" && entry !== null && !Array.isArray(entry)) {
    if (opts.count !== undefined) {
      const form = pluralizationKey(entry as { [k: string]: YamlValue }, opts.count);
      const formEntry = (entry as { [k: string]: YamlValue })[form];
      if (typeof formEntry === "string") {
        // Pluralization merges the count into vars (mirrors Ruby's
        // backend/base.rb:189 #pluralize: "entry[key]" followed by
        // interpolate with count in values). The card en.yml strings
        // reference %{count}.
        return interpolate(formEntry, { ...(opts.vars ?? {}), count: opts.count });
      }
    }
    // No count (or no plural subkey): return the raw hash. The render
    // layer never reaches this branch for the documented en.yml files
    // (every count-bearing leaf has one/other); I18n.t returns the
    // subtree when the caller asks for a node without specifying count.
    return entry;
  }

  if (typeof entry !== "string") {
    return missingTranslationMessage(locale, key, opts.scope);
  }

  return interpolate(entry, opts.vars ?? {});
}

/** True iff the key resolves to a non-missing entry. Mirrors
 *  i18n.rb#exists? (returns true) and lookup miss (returns false). */
export function tExists(key: string, opts: { scope?: string; locale?: string } = {}): boolean {
  const locale = opts.locale ?? defaultLocale ?? "en";
  const fullKey = opts.scope !== undefined && opts.scope !== ""
    ? `${opts.scope}.${key}`
    : key;
  return lookup(translations.get(locale), fullKey) !== undefined;
}

/** Format a Date/Time using a named strftime format from the locale's
 *  `time.formats` (or `date.formats`) key. Mirrors I18n.l (i18n.rb:365-373)
 *  + backend/base.rb#localize (78-93) + the strftime call. The format
 *  string is the byte-exact value loaded from the en.yml file. */
export function l(date: Date, opts: { format: string; locale?: string }): string {
  const locale = opts.locale ?? defaultLocale ?? "en";
  const data = translations.get(locale) ?? {};
  // Look up `time.formats.<format>` first (matches the card en.yml shape),
  // then `date.formats.<format>` as a fallback.
  let fmt = lookupString(data, `time.formats.${opts.format}`);
  if (fmt === undefined) {
    fmt = lookupString(data, `date.formats.${opts.format}`);
  }
  if (fmt === undefined) {
    return missingTranslationMessage(locale, `time.formats.${opts.format}`);
  }
  return formatStrftime(date, fmt);
}

/** The byte-exact missing-translation string Ruby returns per
 *  I18n::MissingTranslation#message (exceptions.rb:63-70). */
export function missingTranslationMessage(locale: string, key: string, scope?: string): string {
  const parts = [locale];
  if (scope !== undefined && scope !== "") parts.push(...scope.split("."));
  parts.push(...key.split("."));
  // Ruby's key list includes "no key" if size < 2 (exceptions.rb:59); the
  // documented format is "Translation missing: a.b.c". With >= 2 parts
  // every render lands in this branch.
  return `Translation missing: ${parts.join(".")}`;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Walk a dotted path through nested maps. Returns undefined on any miss.
 *  Mirrors backend/simple.rb:93-107 #lookup: each "." segment is a hash
 *  key, missing segment = nil (which becomes the catch in translate). */
function lookup(data: { [k: string]: YamlValue } | undefined, key: string): YamlValue | undefined {
  if (data === undefined) return undefined;
  const parts = key.split(".").filter((p) => p.length > 0);
  let cur: YamlValue | undefined = data;
  for (const part of parts) {
    if (typeof cur !== "object" || cur === null || Array.isArray(cur)) return undefined;
    cur = (cur as { [k: string]: YamlValue })[part];
    if (cur === undefined) return undefined;
  }
  return cur;
}

function lookupString(data: { [k: string]: YamlValue }, key: string): string | undefined {
  const v = lookup(data, key);
  return typeof v === "string" ? v : undefined;
}

/** English pluralization rules (i18n/backend/base.rb:308-311 #pluralization_key):
 *  count == 1 picks :one, otherwise :other; :zero is selected for count == 0
 *  when the entry explicitly carries it. */
function pluralizationKey(entry: { [k: string]: YamlValue }, count: number): string {
  const hasZero = "zero" in entry;
  if (count === 0 && hasZero) return "zero";
  return count === 1 ? "one" : "other";
}

/** I18n.interpolate (i18n/interpolate/ruby.rb). Substitutes %{name} with
 *  the value from vars; %% is a literal %. Reserved keys (cascade, scope,
 *  default, etc. - i18n.rb:19-35) raise a ReservedInterpolationKey
 *  exception in Ruby - the render layer doesn't pass those, so the check
 *  is omitted (a missing-key message would be a clearer error than an
 *  uncaught exception for a reserved key the caller typo'd).
 *
 *  NOTE: %% -> % runs even when no vars are passed (the Ruby runtime
 *  always runs the escape pass on the string). */
function interpolate(template: string, vars: Record<string, string | number>): string {
  if (Object.keys(vars).length === 0) {
    // No substitution needed, but %% still collapses to % (Ruby's
    // interpolation pass always runs).
    return template.replace(/%%/g, "%");
  }
  return template.replace(/%(%|\{([^}]+)\})/g, (_match, body: string, name: string | undefined) => {
    if (body === "%") return "%";
    if (name === undefined) return body;
    const v = vars[name];
    return v === undefined ? `{${name}}` : String(v);
  });
}

/** Strftime for the subset of directives the card en.yml files use:
 *   %A %B %d %e %H %I %M %p %S %Y %Z %-d %m
 *  Plus a few extras the locale might use (a/b - abbr day/month names).
 *  Locale-independent names come from toLocaleString("en-US", ...) which
 *  matches Ruby's strftime with the C locale (the captured oracle uses
 *  English day/month names). */
function formatStrftime(date: Date, fmt: string): string {
  // Locale-independent English day/month names (matching Ruby's C strftime
  // for the captured en.yml format strings).
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const abbrDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const abbrMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad2 = (n: number): string => (n < 10 ? "0" + n : "" + n);
  // Ruby's %-d = unpadded day; JS getDate() already returns unpadded.
  // Ruby's %e = space-padded day; mirror that here.
  const spacePad2 = (n: number): string => (n < 10 ? " " + n : "" + n);

  let out = "";
  let i = 0;
  while (i < fmt.length) {
    const c = fmt[i]!;
    if (c !== "%") {
      out += c;
      i++;
      continue;
    }
    // Next char: optional '-' flag, then directive
    i++;
    if (i >= fmt.length) break;
    const flag = fmt[i]!;
    if (flag === "-") {
      i++;
      const directive = fmt[i]!;
      i++;
      switch (directive) {
        case "d": out += String(date.getDate()); break;
        default: out += "%-" + directive; break;
      }
      continue;
    }
    switch (flag) {
      case "A": out += days[date.getDay()] ?? ""; break;
      case "a": out += abbrDays[date.getDay()] ?? ""; break;
      case "B": out += months[date.getMonth()] ?? ""; break;
      case "b": out += abbrMonths[date.getMonth()] ?? ""; break;
      case "d": out += pad2(date.getDate()); break;
      case "e": out += spacePad2(date.getDate()); break;
      case "H": out += pad2(date.getHours()); break;
      case "I": out += pad2(((date.getHours() + 11) % 12) + 1); break;
      case "M": out += pad2(date.getMinutes()); break;
      case "m": out += pad2(date.getMonth() + 1); break;
      case "p": out += date.getHours() < 12 ? "AM" : "PM"; break;
      case "S": out += pad2(date.getSeconds()); break;
      case "Y": out += String(date.getFullYear()); break;
      case "y": out += String(date.getFullYear()).slice(-2); break;
      case "Z":
        // %Z returns the timezone abbreviation; Intl.DateTimeFormat with
        // timeZoneName: "short" gives e.g. "EST" or "PST" or "UTC". The
        // captured oracle doesn't pin a specific value (the time format is
        // locale-aware); we return the short form.
        try {
          const parts = new Intl.DateTimeFormat("en-US", {
            timeZoneName: "short",
          }).formatToParts(date);
          const tz = parts.find((p) => p.type === "timeZoneName");
          out += tz?.value ?? "";
        } catch {
          out += "";
        }
        break;
      case "z":
        out += " ";
        break;
      case "%": out += "%"; break;
      default: out += "%" + flag; break;
    }
    i++;
  }
  return out;
}

/** Deep merge two parsed YAML trees. The second wins on key collisions
 *  (matches Ruby's Utils.deep_merge! used by Simple#store_translations
 *  - backend/simple.rb:44-45). */
function deepMerge(
  a: { [k: string]: YamlValue },
  b: { [k: string]: YamlValue },
): { [k: string]: YamlValue } {
  const out: { [k: string]: YamlValue } = { ...a };
  for (const k of Object.keys(b)) {
    const av = a[k];
    const bv = b[k];
    if (
      typeof av === "object" && av !== null && !Array.isArray(av) &&
      typeof bv === "object" && bv !== null && !Array.isArray(bv)
    ) {
      out[k] = deepMerge(av as { [k: string]: YamlValue }, bv as { [k: string]: YamlValue });
    } else {
      out[k] = bv;
    }
  }
  return out;
}

/** Lazy fs loader - the render layer at boot time uses loadLocaleFile
 *  (which needs fs); tests use loadLocaleFromString and never touch this.
 *  The lazy import keeps the i18n module graph small for the test-only
 *  path. */
let fsModule: typeof import("node:fs") | undefined;
function loadFs(): { readFileSync(path: string, encoding: string): string } {
  if (fsModule === undefined) {
    // The module uses an async import for portability (ESM doesn't expose
    // require); the caller awaits via the public loadLocaleFileAsync when
    // it needs disk access. The synchronous variant below is for the rare
    // case where require is injected via a global - tests don't use it.
    throw new Error("i18n: loadLocaleFile requires the async variant");
  }
  return { readFileSync: (p, enc) => fsModule!.readFileSync(p, enc as BufferEncoding) };
}

/** Async loader for YAML files on disk. Used by the boot-time
 *  prepareEngine hook. */
export async function loadLocaleFileAsync(locale: string, path: string): Promise<void> {
  if (fsModule === undefined) {
    fsModule = await import("node:fs");
  }
  const text = fsModule.readFileSync(path, "utf8");
  loadLocaleFromString(locale, text);
}
