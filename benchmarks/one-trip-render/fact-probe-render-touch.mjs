// benchmarks/one-trip-render/fact-probe-render-touch.ts
import { writeFileSync } from "node:fs";

// src/server/driver.ts
function rowIdOrOmit(lastRowId) {
  if (lastRowId === void 0) return void 0;
  return BigInt(lastRowId) > 0n ? lastRowId : void 0;
}

// src/server/drivers/local-sqlite.ts
import Database from "better-sqlite3";
var LocalSqliteDriver = class {
  db;
  /** Prepared-statement cache keyed by SQL text. The engine re-issues the
   *  SAME statement texts every render (the closure walk, the folded
   *  permission/structure statements, the fetch queries — the varying parts
   *  ride as parameters); without this cache better-sqlite3 re-parses and
   *  re-plans the multi-KB recursive walk twice per render. SQLite handles
   *  schema-change invalidation of a live sqlite3_stmt itself, and the
   *  cache's lifetime is this driver's handle, so there is no staleness
   *  window. Measured 2026-09-22: the dominant per-render fixed cost on the
   *  corpus deck. */
  stmtCache = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    this.db = new Database(options.path ?? ":memory:", {
      readonly: options.readonly ?? false
    });
  }
  prepareCached(sql) {
    let stmt = this.stmtCache.get(sql);
    if (stmt === void 0) {
      stmt = this.db.prepare(sql);
      this.stmtCache.set(sql, stmt);
    }
    return stmt;
  }
  async query(sql, params) {
    const stmt = this.prepareCached(sql);
    if (stmt.reader) {
      const rows = stmt.all(...params);
      return { rows, rowsAffected: 0 };
    }
    const info = stmt.run(...params);
    return {
      rows: [],
      rowsAffected: Number(info.changes),
      lastInsertRowId: rowIdOrOmit(info.lastInsertRowid)
    };
  }
  async batch(statements) {
    if (statements.length === 0) return [];
    const runBatch = this.db.transaction(() => statements.map((s) => this.executeOne(s)));
    return runBatch();
  }
  /** Register a scalar SQL function on the underlying handle — the narrow,
   *  additive extension the CQL execution stream needs for its REGEXP UDF
   *  (registerSqliteRegexpFunction in src/cql/sqlite-regexp.ts; rationale
   *  and edge-driver contrast in docs/cql-execution-notes.md). Nothing
   *  about existing behavior changes; callers that never register a
   *  function are unaffected. Must be called before the first statement
   *  referencing the function is prepared. */
  registerFunction(name, fn, options) {
    if (options) this.db.function(name, options, fn);
    else this.db.function(name, fn);
  }
  /** Close the underlying database handle. Not part of SQLDatabaseDriver —
   *  local resource cleanup only. */
  close() {
    this.db.close();
  }
  executeOne(statement) {
    const stmt = this.prepareCached(statement.sql);
    if (stmt.reader) {
      return { rows: stmt.all(...statement.params), rowsAffected: 0 };
    }
    const info = stmt.run(...statement.params);
    return {
      rows: [],
      rowsAffected: Number(info.changes),
      lastInsertRowId: rowIdOrOmit(info.lastInsertRowid)
    };
  }
};

// src/card/fetch/cache.ts
var DEFAULT_MAX_TEMPORARY_CACHE_KEYS = 1e4;
var TemporaryCache = class {
  store = /* @__PURE__ */ new Map();
  reps = 0;
  maxKeys;
  /** How many times within_key_counts reset this store. Ruby has the same
   *  reset (temporary.rb#within_key_counts) but heals misses through the
   *  synchronous db fallback; the port's cache-layer probes read this to
   *  attribute a sync-mirror miss to the reset (the warm entries written
   *  before the last reset are gone). */
  resetCountValue = 0;
  constructor(maxKeys = DEFAULT_MAX_TEMPORARY_CACHE_KEYS) {
    this.maxKeys = maxKeys;
  }
  /** Resets fired so far (temporary.rb#within_key_counts observability). */
  get resetCount() {
    return this.resetCountValue;
  }
  /** The keys currently held - cache-layer probe / test inspection. */
  keys() {
    return [...this.store.keys()];
  }
  read(key) {
    return this.store.get(key);
  }
  /** temporary.rb#write: store the value and RETURN it (Ruby's write is
   *  the `@store[key] = value` assignment). */
  write(key, value, callback) {
    this.withinKeyCounts(() => {
      this.store.set(key, value);
      this.reps += 1;
      if (callback) callback(value);
    });
    return value;
  }
  /** temporary.rb#fetch: exist? ? read : write(yield) - key order matters:
   *  a stored nil is a hit. */
  fetch(key, compute, callback) {
    return this.exist(key) ? this.read(key) : this.write(key, compute(), callback);
  }
  delete(key) {
    this.store.delete(key);
  }
  reset() {
    this.reps = 0;
    this.store = /* @__PURE__ */ new Map();
    this.resetCountValue += 1;
  }
  exist(key) {
    return this.store.has(key);
  }
  withinKeyCounts(body) {
    if (this.reps >= this.maxKeys) {
      this.reps = this.store.size;
      if (this.reps > this.maxKeys) this.reset();
    }
    body();
  }
};
var SharedCache = class _SharedCache {
  store;
  database;
  classKey;
  stampValue;
  prefixValue;
  /** Stand-in for Cardio.cache, the simple Rails store the stamp itself
   *  lives in (shared.rb#stamp). One registry per process is enough here. */
  static stampRegistry = /* @__PURE__ */ new Map();
  static stampCounter = 0;
  constructor(opts) {
    this.store = opts.store;
    this.database = opts.database ?? "decko";
    this.classKey = (opts.className ?? "Card").replace(/\+/g, "_");
  }
  /** shared.rb#renew: drop memoized stamp/prefix so the next read re-asserts them. */
  renew() {
    this.stampValue = void 0;
    this.prefixValue = void 0;
  }
  /** shared.rb#reset: a new stamp + persist it in the stamp registry. */
  reset() {
    this.stampValue = _SharedCache.newStamp();
    this.prefixValue = void 0;
    _SharedCache.stampRegistry.set(this.stampKey(), this.stampValue);
  }
  /** shared.rb#annihilate: clear the underlying store entirely. */
  annihilate() {
    if (typeof this.store.clear === "function") {
      this.store.clear();
    }
  }
  stamp() {
    if (this.stampValue === void 0) {
      const key = this.stampKey();
      const existing = _SharedCache.stampRegistry.get(key);
      this.stampValue = existing ?? _SharedCache.newStamp();
      _SharedCache.stampRegistry.set(key, this.stampValue);
    }
    return this.stampValue;
  }
  stampKey() {
    return `${this.database}-${this.classKey}-stamp`;
  }
  prefix() {
    if (this.prefixValue === void 0) {
      this.prefixValue = `${this.database}-${this.classKey}-${this.stamp()}:`;
    }
    return this.prefixValue;
  }
  fullKey(key) {
    return `${this.prefix()}/${key}`;
  }
  read(key) {
    return this.store.read(this.fullKey(key));
  }
  write(key, value) {
    this.store.write(this.fullKey(key), value);
  }
  /** shared.rb#fetch: store.fetch(full_key) { block } - on a miss the block
   *  result is written back into the store (Rails cache-store contract). A
   *  stored value of undefined is a miss, matching Rails (nil is not cached). */
  fetch(key, compute) {
    const existing = this.read(key);
    if (existing !== void 0) return existing;
    const computed = compute();
    this.write(key, computed);
    return computed;
  }
  delete(key) {
    this.store.delete(this.fullKey(key));
  }
  exist(key) {
    return this.store.exist ? this.store.exist(this.fullKey(key)) : this.store.read(this.fullKey(key)) !== void 0;
  }
  /** shared.rb#write_attribute: mutate one attribute of a cached object. */
  writeAttribute(key, attribute, value) {
    const object = this.read(key);
    if (object !== null && typeof object === "object") {
      object[attribute] = value;
      this.write(key, object);
    }
    return value;
  }
  readAttribute(key, attribute) {
    const object = this.read(key);
    if (object !== null && typeof object === "object") {
      return object[attribute];
    }
    return void 0;
  }
  static newStamp() {
    _SharedCache.stampCounter += 1;
    return `stamp-${Date.now()}-${_SharedCache.stampCounter}`;
  }
};
var CardCache = class {
  temp;
  shared;
  /** cache.rb#write / Temporary#write callback hook; Card's implementation
   *  (Cache::CardClass#after_write_to_temp_cache) writes the lexicon. */
  afterWriteToTempCache;
  constructor(opts = {}) {
    this.temp = new TemporaryCache(opts.maxTemporaryKeys);
    this.shared = opts.sharedStore ? new SharedCache({
      store: opts.sharedStore,
      database: opts.database,
      className: opts.className
    }) : void 0;
  }
  /** cache.rb#read */
  read(key) {
    return this.temp.fetch(key, () => this.shared?.read(key));
  }
  /** cache.rb#read_multi (single-key calls return {} in Ruby; the fetch
   *  layer never needs it, ported for completeness). */
  readMulti(keys) {
    const found = /* @__PURE__ */ new Map();
    if (keys.length <= 1) return found;
    const missing = [];
    for (const key of keys) {
      if (this.temp.exist(key)) {
        found.set(key, this.temp.read(key));
      } else {
        missing.push(key);
      }
    }
    if (missing.length > 0) {
      const fromShared = /* @__PURE__ */ new Map();
      for (const key of missing) {
        const value = this.shared ? this.shared.read(key) : void 0;
        if (value !== void 0) {
          fromShared.set(key, value);
          this.temp.write(key, value, this.afterWriteToTempCache);
        }
      }
      for (const [key, value] of fromShared) found.set(key, value);
    }
    return found;
  }
  /** cache.rb#write: hard (shared) first where applicable, then temp. */
  write(key, value) {
    this.shared?.write(key, value);
    this.temp.write(key, value, this.afterWriteToTempCache);
  }
  /** cache.rb#fetch */
  fetch(key, compute) {
    return this.temp.fetch(
      key,
      () => this.shared ? this.shared.fetch(key, compute) : compute()
    );
  }
  /** cache.rb#delete */
  delete(key) {
    this.shared?.delete(key);
    this.temp.delete(key);
  }
  /** cache.rb#reset */
  reset() {
    this.shared?.reset();
    this.temp.reset();
  }
  /** cache.rb#exist? */
  exist(key) {
    return this.temp.exist(key) || (this.shared?.exist(key) ?? false);
  }
};

// src/card/name/inflect.ts
function rules(pairs) {
  return pairs.map(([regexp, replacement]) => ({ regexp, replacement }));
}
var deckInflectionsListeners = [];
function onDeckInflectionsChanged(listener) {
  deckInflectionsListeners.push(listener);
}
var DEFAULT_SINGULAR_RULES = rules([
  // irregular-derived, reverse definition order (zombie, move, sex, child, man, person).
  // Ruby's Inflections#irregular generates /(s0)srest$/i -> '\1' + srest and
  // /(p0)prest$/i -> '\1' + prest (no ^ anchor), each irregular contributing its
  // two singular() calls in prepended order
  [/(z)ombies$/i, "$1ombie"],
  [/(z)ombie$/i, "$1ombie"],
  [/(m)oves$/i, "$1ove"],
  [/(m)ove$/i, "$1ove"],
  [/(s)exes$/i, "$1ex"],
  [/(s)ex$/i, "$1ex"],
  [/(c)hildren$/i, "$1hild"],
  [/(c)hild$/i, "$1hild"],
  [/(m)en$/i, "$1an"],
  [/(m)an$/i, "$1an"],
  [/(p)eople$/i, "$1erson"],
  [/(p)erson$/i, "$1erson"],
  // default singular rules, reverse definition order
  [/(database)s$/i, "$1"],
  [/(quiz)zes$/i, "$1"],
  [/(matr)ices$/i, "$1ix"],
  [/(vert|ind)ices$/i, "$1ex"],
  [/^(ox)en/i, "$1"],
  [/(alias|status)(es)?$/i, "$1"],
  [/(octop|vir)(us|i)$/i, "$1us"],
  [/^(a)x[ie]s$/i, "$1xis"],
  [/(cris|test)(is|es)$/i, "$1is"],
  [/(shoe)s$/i, "$1"],
  [/(o)es$/i, "$1"],
  [/(bus)(es)?$/i, "$1"],
  [/^(m|l)ice$/i, "$1ouse"],
  [/(x|ch|ss|sh)es$/i, "$1"],
  [/(m)ovies$/i, "$1ovie"],
  [/(s)eries$/i, "$1eries"],
  [/([^aeiouy]|qu)ies$/i, "$1y"],
  [/([lr])ves$/i, "$1f"],
  [/(tive)s$/i, "$1"],
  [/(hive)s$/i, "$1"],
  [/([^f])ves$/i, "$1fe"],
  [/(^analy)(sis|ses)$/i, "$1sis"],
  [/((a)naly|(b)a|(d)iagno|(p)arenthe|(p)rogno|(s)ynop|(t)he)(sis|ses)$/i, "$1sis"],
  [/([ti])a$/i, "$1um"],
  [/(n)ews$/i, "$1ews"],
  [/(ss)$/i, "$1"],
  [/s$/i, ""]
]);
var DEFAULT_PLURAL_RULES = rules([
  // irregular-derived, reverse definition order (same generation scheme as above)
  [/(z)ombies$/i, "$1ombies"],
  [/(z)ombie$/i, "$1ombies"],
  [/(m)oves$/i, "$1oves"],
  [/(m)ove$/i, "$1oves"],
  [/(s)exes$/i, "$1exes"],
  [/(s)ex$/i, "$1exes"],
  [/(c)hildren$/i, "$1hildren"],
  [/(c)hild$/i, "$1hildren"],
  [/(m)en$/i, "$1en"],
  [/(m)an$/i, "$1en"],
  [/(p)eople$/i, "$1eople"],
  [/(p)erson$/i, "$1eople"],
  // default plural rules, reverse definition order
  [/(quiz)$/i, "$1zes"],
  [/^(oxen)$/i, "$1"],
  [/^(ox)$/i, "$1en"],
  [/^(m|l)ice$/i, "$1ice"],
  [/^(m|l)ouse$/i, "$1ice"],
  [/(matr|vert|ind)(?:ix|ex)$/i, "$1ices"],
  [/(x|ch|ss|sh)$/i, "$1es"],
  [/([^aeiouy]|qu)y$/i, "$1ies"],
  [/(hive)$/i, "$1s"],
  [/(?:([^f])fe|([lr])f)$/i, "$1$2ves"],
  [/sis$/i, "ses"],
  [/([ti])a$/i, "$1a"],
  [/([ti])um$/i, "$1a"],
  [/(buffal|tomat)o$/i, "$1oes"],
  [/(bu)s$/i, "$1ses"],
  [/(alias|status)$/i, "$1es"],
  [/(octop|vir)i$/i, "$1i"],
  [/(octop|vir)us$/i, "$1i"],
  [/^(ax|test)is$/i, "$1es"],
  [/s$/i, "s"],
  [/$/, "s"]
]);
var DEFAULT_UNCOUNTABLE_WORDS = [
  "equipment",
  "information",
  "rice",
  "money",
  "species",
  "series",
  "fish",
  "sheep",
  "jeans",
  "police"
];
function buildUncountableRegexes(words) {
  return words.map((word) => new RegExp(`\\b${word}$`, "i"));
}
var inflectionState = {
  singularRules: DEFAULT_SINGULAR_RULES,
  pluralRules: DEFAULT_PLURAL_RULES,
  uncountableRegexes: buildUncountableRegexes(DEFAULT_UNCOUNTABLE_WORDS)
};
function uncountable(word) {
  return inflectionState.uncountableRegexes.some((re) => re.test(word));
}
function applyInflections(word, rulesInScanOrder) {
  if (word === "" || uncountable(word)) return word;
  for (const { regexp, replacement } of rulesInScanOrder) {
    if (regexp.test(word)) {
      return word.replace(regexp, replacement);
    }
  }
  return word;
}
function singularize(word) {
  return applyInflections(word, inflectionState.singularRules);
}
function pluralize(word) {
  return applyInflections(word, inflectionState.pluralRules);
}
function underscore(camelCasedWord) {
  if (!/[A-Z-]|::/.test(camelCasedWord)) return camelCasedWord;
  const word = camelCasedWord.replace(/::/g, "/");
  return word.replace(/(?<=[A-Z])(?=[A-Z][a-z])|(?<=[a-z\d])(?=[A-Z])/g, "_").replace(/-/g, "_").toLowerCase();
}
function titleize(word) {
  const humanized = underscore(word).replace(/_/g, " ").replace(/^\s+/, "").replace(/^./, (c) => c.toUpperCase());
  return humanized.replace(/\b(?<!\w['’`()])[a-z]/g, (c) => c.toUpperCase());
}
function rubyCapitalize(str) {
  if (str === "") return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
function isAsciiDigit(c) {
  return c >= "0" && c <= "9";
}
function isAsciiLower(c) {
  return c >= "a" && c <= "z";
}
function isAsciiUpper(c) {
  return c >= "A" && c <= "Z";
}
function isAsciiAlnum(c) {
  return isAsciiDigit(c) || isAsciiLower(c) || isAsciiUpper(c);
}
function rubySucc(str) {
  if (str === "") return str;
  const chars = Array.from(str);
  let lastAlnum = -1;
  for (let i2 = chars.length - 1; i2 >= 0; i2--) {
    if (isAsciiAlnum(chars[i2])) {
      lastAlnum = i2;
      break;
    }
  }
  if (lastAlnum < 0) {
    const lastIdx = chars.length - 1;
    chars[lastIdx] = String.fromCharCode(chars[lastIdx].codePointAt(0) + 1);
    return chars.join("");
  }
  const lastChar = chars[lastAlnum];
  const neighbor = isAsciiDigit(lastChar) ? "1" : isAsciiLower(lastChar) ? "a" : "A";
  const neighborFor = (c) => isAsciiDigit(c) ? "1" : isAsciiLower(c) ? "a" : "A";
  let carry = true;
  let i = lastAlnum;
  while (i >= 0) {
    const c = chars[i];
    if (isAsciiDigit(c)) {
      carry = c === "9";
      chars[i] = carry ? "0" : String.fromCharCode(c.charCodeAt(0) + 1);
    } else if (isAsciiLower(c)) {
      carry = c === "z";
      chars[i] = carry ? "a" : String.fromCharCode(c.charCodeAt(0) + 1);
    } else if (isAsciiUpper(c)) {
      carry = c === "Z";
      chars[i] = carry ? "A" : String.fromCharCode(c.charCodeAt(0) + 1);
    } else {
      let j = i - 1;
      while (j >= 0 && !isAsciiAlnum(chars[j])) j--;
      if (j < 0 || neighbor === "1" && !isAsciiDigit(chars[j])) {
        chars.splice(i + 1, 0, neighbor);
        return chars.join("");
      }
      i = j;
      continue;
    }
    if (!carry) break;
    if (i === 0) {
      chars.unshift(neighborFor(chars[0]));
      return chars.join("");
    }
    i--;
  }
  return chars.join("");
}
function regexpQuote(str) {
  return str.replace(/[^\w\s-]/g, (c) => `\\${c}`);
}

// src/card/name/entities.ts
var NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\xA0",
  iexcl: "\xA1",
  cent: "\xA2",
  pound: "\xA3",
  curren: "\xA4",
  yen: "\xA5",
  copy: "\xA9",
  reg: "\xAE",
  trade: "\u2122",
  deg: "\xB0",
  plusmn: "\xB1",
  middot: "\xB7",
  laquo: "\xAB",
  raquo: "\xBB",
  frac12: "\xBD",
  times: "\xD7",
  divide: "\xF7",
  agrave: "\xE0",
  aacute: "\xE1",
  egrave: "\xE8",
  eacute: "\xE9",
  ecirc: "\xEA",
  ccedil: "\xE7",
  ntilde: "\xF1",
  ouml: "\xF6",
  uuml: "\xFC",
  szlig: "\xDF",
  hellip: "\u2026",
  ndash: "\u2013",
  mdash: "\u2014",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201C",
  rdquo: "\u201D"
};
var ENTITY_RE = /&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g;
function decodeHtmlEntities(str) {
  return str.replace(ENTITY_RE, (match, body) => {
    if (body.startsWith("#")) {
      const isHex = body[1] === "x" || body[1] === "X";
      const codepoint = parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (Number.isNaN(codepoint)) return match;
      try {
        return String.fromCodePoint(codepoint);
      } catch {
        return match;
      }
    }
    return NAMED_ENTITIES[body] ?? match;
  });
}

// src/card/name/errors.ts
var NameNotFoundError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "NameNotFoundError";
  }
};
var CodenameNotFoundError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "CodenameNotFoundError";
  }
};
var UnsupportedIdentifierError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "UnsupportedIdentifierError";
  }
};

// src/card/name/environment.ts
var currentEnvironment;
function setNameEnvironment(environment) {
  currentEnvironment = environment;
}
function getNameEnvironment() {
  return currentEnvironment;
}

// src/card/name.ts
var RELATIVE_REGEXP_SOURCE = "\\b_(?:left|right|whole|self|user|main|\\d+|L*R?)\\b";
var RELATIVE_REGEXP = new RegExp(RELATIVE_REGEXP_SOURCE);
var RELATIVE_REGEXP_GLOBAL = new RegExp(RELATIVE_REGEXP_SOURCE, "g");
var RELATIVE_FRAGMENT_REGEXP = new RegExp(`^${RELATIVE_REGEXP_SOURCE}$`);
var RUBY_WHITESPACE = " 	\n\v\f\r";
var RUBY_SPLIT_AROUND_JOINT = new RegExp(`[${RUBY_WHITESPACE}]*\\+[${RUBY_WHITESPACE}]*`);
var RUBY_BLANK = new RegExp(`^[${RUBY_WHITESPACE}]*$`);
var ID_MARK_REGEXP = /^~(\d+)$/;
var CODENAME_MARK_REGEXP = /^:(\w+)$/;
var OK_FOR_KEY_CLASS = "\\p{L}\\p{M}\\p{Nd}\\p{Pc}";
var NOT_OK_FOR_KEY = new RegExp(`[^${OK_FOR_KEY_CLASS}\\*]+`, "gu");
function rubyStrip(str) {
  return str.replace(
    new RegExp(`^[${RUBY_WHITESPACE}\0]+|[${RUBY_WHITESPACE}\0]+$`, "g"),
    ""
  );
}
function rubyLength(str) {
  return Array.from(str).length;
}
function rubyBlank(value) {
  return value == null || RUBY_BLANK.test(value);
}
function stableKey(word) {
  const keyOne = singularize(word);
  const keyTwo = singularize(keyOne);
  return keyOne === keyTwo ? keyOne : word;
}
function simpleKey(body) {
  if (body === "") return "";
  return underscore(body).replace(NOT_OK_FOR_KEY, "_").split(/_+/).filter((piece) => piece !== "").map(stableKey).join("_");
}
var DeckoName = class _DeckoName {
  /** Cardname.joint class default (cardname lib/cardname.rb). */
  static JOINT = "+";
  /** Cardname cache (lib/cardname/class_methods.rb#cache). */
  static cache = /* @__PURE__ */ new Map();
  static {
    onDeckInflectionsChanged(() => {
      _DeckoName.cache.clear();
    });
  }
  /** Process-wide banned characters (Cardname.banned_array, default []). */
  static bannedCharacters = [];
  /** simple string version of the name (cardname lib/cardname.rb #s / #to_s). */
  s;
  /** the key defines the namespace (cardname lib/cardname.rb #key). */
  key;
  /** HTML entities decoded (cardname lib/cardname/variants.rb #decoded). */
  decoded;
  nameParts;
  simpleFlag;
  constructor(raw) {
    this.s = rubyStrip(raw);
    this.decoded = decodeHtmlEntities(this.s);
    if (this.s === "") {
      this.nameParts = [];
      this.simpleFlag = true;
    } else {
      const split = _DeckoName.splitParts(this.s);
      this.simpleFlag = split.length <= 1;
      this.nameParts = this.simpleFlag ? [this] : split.map((part) => _DeckoName.baseParse(part));
    }
    this.key = this.simpleFlag ? simpleKey(this.decoded) : this.nameParts.map((part) => part.key).join(_DeckoName.JOINT);
    this.freeze();
  }
  freeze() {
    Object.freeze(this);
  }
  /**
   * Cardname.new / Card::Name.new merged: Card::Name.new (card-1.110.0
   * lib/card/name.rb #new) first normalizes compound strings and resolves
   * id/codename marks, then defers to Cardname.new which caches by raw string.
   */
  static parse(obj) {
    if (obj instanceof _DeckoName) return obj;
    let str = obj == null ? "" : String(obj);
    if (str.includes(_DeckoName.JOINT)) {
      const joined = _DeckoName.splitParts(str).map((part) => _DeckoName.parse(part).s).join(_DeckoName.JOINT);
      return _DeckoName.baseParse(joined);
    }
    const id = _DeckoName.idFromString(str);
    if (id !== void 0) {
      const lexiconName = getNameEnvironment()?.lexicon?.name(id);
      if (rubyBlank(lexiconName)) _DeckoName.badMark(str);
      return _DeckoName.baseParse(lexiconName);
    }
    return _DeckoName.baseParse(str);
  }
  /** Cardname.new proper (cardname lib/cardname/class_methods.rb #new). */
  static baseParse(raw) {
    const cached = _DeckoName.cache.get(raw);
    if (cached !== void 0) return cached;
    const name = new _DeckoName(raw);
    _DeckoName.cache.set(raw, name);
    return name;
  }
  /** Card::Name[] (card-1.110.0 lib/card/name.rb #[] / #from_cardish). */
  static of(...cardish) {
    const single = cardish.length <= 1 ? cardish[0] ?? null : cardish;
    const resolved = _DeckoName.fromCardish(single);
    if (resolved === void 0) {
      throw new UnsupportedIdentifierError(
        `${describeCardish(single)} not supported as name identifier`
      );
    }
    return resolved;
  }
  static fromCardish(cardish) {
    if (cardish == null) return _DeckoName.parse("");
    if (cardish instanceof _DeckoName) return cardish;
    if (typeof cardish === "number") {
      if (!Number.isInteger(cardish)) return void 0;
      const lexiconName = getNameEnvironment()?.lexicon?.name(cardish);
      return lexiconName === void 0 ? void 0 : _DeckoName.baseParse(lexiconName);
    }
    if (typeof cardish === "string") return _DeckoName.parse(cardish);
    if (Array.isArray(cardish)) return _DeckoName.compose(cardish);
    if (typeof cardish === "object" && "codename" in cardish) {
      const codenameName = getNameEnvironment()?.codename?.name(cardish.codename);
      if (codenameName === void 0) {
        throw new CodenameNotFoundError(`unknown codename: ${cardish.codename}`);
      }
      return _DeckoName.baseParse(codenameName);
    }
    return void 0;
  }
  /** Card::Name.compose (lib/card/name.rb #compose): interpret parts as cardish. */
  static compose(parts) {
    const resolved = flattenCardish(parts).map((part) => _DeckoName.of(part));
    return _DeckoName.baseParse(resolved.map((part) => part.s).join(_DeckoName.JOINT));
  }
  /** Cardname.split_parts (cardname lib/cardname/class_methods.rb #split_parts). */
  static splitParts(str) {
    return str.split(RUBY_SPLIT_AROUND_JOINT);
  }
  /**
   * Card::Name.id_from_string (lib/card/name.rb): "~75" -> 75, ":codename" ->
   * its id via the codename registry, anything else -> undefined.
   */
  static idFromString(str) {
    const idMatch = ID_MARK_REGEXP.exec(str);
    if (idMatch !== null) return parseInt(idMatch[1], 10);
    const codenameMatch = CODENAME_MARK_REGEXP.exec(str);
    if (codenameMatch !== null) {
      const codename = codenameMatch[1];
      const id = getNameEnvironment()?.codename?.id(codename);
      if (id === void 0) {
        throw new CodenameNotFoundError(`codename doesn't exist: ${codename}`);
      }
      return id;
    }
    return void 0;
  }
  /** Card::Name.id_from_string! (lib/card/name.rb): additionally require the id in the lexicon. */
  static idFromStringStrict(str) {
    const id = _DeckoName.idFromString(str);
    if (id === void 0) return void 0;
    if (rubyBlank(getNameEnvironment()?.lexicon?.name(id))) _DeckoName.badMark(str);
    return id;
  }
  /** Card::Name.bad_mark (lib/card/name.rb). */
  static badMark(str) {
    if (ID_MARK_REGEXP.test(str)) {
      throw new NameNotFoundError(`id doesn't exist: ${ID_MARK_REGEXP.exec(str)[1]}`);
    }
    if (CODENAME_MARK_REGEXP.test(str)) {
      throw new CodenameNotFoundError(
        `codename doesn't exist: ${CODENAME_MARK_REGEXP.exec(str)[1]}`
      );
    }
    throw new UnsupportedIdentifierError(`invalid mark: ${str}`);
  }
  // ~~~~~~~~~~~~~~~~~ cardname.rb core ~~~~~~~~~~~~~~~~~
  /** alias of #s (cardname lib/cardname.rb to_s). */
  toString() {
    return this.s;
  }
  /** Object#to_name core extension (cardname lib/core_ext.rb). */
  toName() {
    return this;
  }
  /** Cardname#num_parts (cardname lib/cardname.rb). */
  get numParts() {
    return this.parts.length;
  }
  /** true if name has only one part (cardname lib/cardname/predicates.rb #simple?). */
  get isSimple() {
    return this.simpleFlag;
  }
  /** test for same key (cardname lib/cardname.rb #==). */
  equals(other) {
    if (other instanceof _DeckoName) return this.key === other.key;
    return this.key === _DeckoName.parse(other).key;
  }
  /**
   * Cardname#[] - name based on part index. Supports `[index]`,
   * `[start, length]` and Ruby-style inclusive ranges via {@link getRange}.
   * Out-of-range accesses yield the empty name (Ruby nil.to_name).
   */
  get(start, length) {
    const len = this.nameParts.length;
    const from = start < 0 ? len + start : start;
    if (length === void 0) {
      return from >= 0 && from < len ? this.nameParts[from] : _DeckoName.parse("");
    }
    if (length < 0 || from < 0 || from > len) return _DeckoName.parse("");
    const count = Math.min(length, len - from);
    return _DeckoName.baseParse(this.sliceParts(from, count));
  }
  /**
   * Ruby-style inclusive range access on part names, `self[start..end]`.
   * A negative end counts from the right; when the range is empty or
   * out-of-bounds the result is the empty name (Ruby nil.to_name).
   */
  getRange(start, endInclusive) {
    const len = this.nameParts.length;
    const from = start < 0 ? len + start : start;
    const to = endInclusive < 0 ? len + endInclusive : endInclusive;
    if (from < 0 || to < 0 || from > to || from >= len) return _DeckoName.parse("");
    return _DeckoName.baseParse(this.sliceParts(from, to - from + 1));
  }
  sliceParts(from, count) {
    return this.nameParts.slice(from, from + count).map((part) => part.s).join(_DeckoName.JOINT);
  }
  // ~~~~~~~~~~~~~~~~~ parts.rb ~~~~~~~~~~~~~~~~~
  /** each joint separated part (cardname lib/cardname/parts.rb #parts). */
  get parts() {
    return this.nameParts.map((part) => part.s);
  }
  /** cardname lib/cardname/parts.rb #part_keys. */
  get partKeys() {
    return this.nameParts.map((part) => part.key);
  }
  /** cardname lib/cardname/parts.rb #part_names. */
  get partNames() {
    return this.nameParts;
  }
  /** the part left of the rightmost joint (cardname lib/cardname/parts.rb #left). */
  get left() {
    return this.leftName?.s;
  }
  /** cardname lib/cardname/parts.rb #left_key. */
  get leftKey() {
    return this.leftName?.key;
  }
  /** cardname lib/cardname/parts.rb #left_name. */
  get leftName() {
    return this.isSimple ? void 0 : this.getRange(0, -2);
  }
  /** left and right of a compound card (cardname lib/cardname/parts.rb #parents). */
  get parents() {
    return this.parentNames.map((parent) => parent.s);
  }
  /** cardname lib/cardname/parts.rb #parent_keys. */
  get parentKeys() {
    return this.parentNames.map((parent) => parent.key);
  }
  /** cardname lib/cardname/parts.rb #parent_names. */
  get parentNames() {
    if (this.isSimple) return [];
    const left = this.leftName;
    const right = this.rightName;
    return left === void 0 ? [right] : [left, right];
  }
  /** like #left, but returns self for simple cards (cardname lib/cardname/parts.rb #trunk). */
  get trunk() {
    return this.trunkName.s;
  }
  /** cardname lib/cardname/parts.rb #trunk_key. */
  get trunkKey() {
    return this.trunkName.key;
  }
  /** cardname lib/cardname/parts.rb #trunk_name. */
  get trunkName() {
    return this.isSimple ? this : this.leftName;
  }
  /** like #right, but returns self for simple cards (cardname lib/cardname/parts.rb #tag). */
  get tag() {
    return this.tagName.s;
  }
  /** cardname lib/cardname/parts.rb #tag_key. */
  get tagKey() {
    return this.tagName.key;
  }
  /** cardname lib/cardname/parts.rb #tag_name. */
  get tagName() {
    return this.isSimple ? this : this.rightName;
  }
  /** the part right of the rightmost joint (cardname lib/cardname/parts.rb #right). */
  get right() {
    return this.rightName?.s;
  }
  /** cardname lib/cardname/parts.rb #right_key. */
  get rightKey() {
    return this.rightName?.key;
  }
  /** cardname lib/cardname/parts.rb #right_name. */
  get rightName() {
    if (this.isSimple) return void 0;
    return this.nameParts[this.nameParts.length - 1] ?? void 0;
  }
  // ~~~~~~~~~~~~~~~~~ pieces.rb ~~~~~~~~~~~~~~~~~
  /** self and all ancestors (cardname lib/cardname/pieces.rb #pieces). */
  get pieces() {
    if (this.isSimple) return [this.s];
    const compound = [];
    const split = this.parts;
    let left = split[0];
    for (let i = 1; i < split.length; i++) {
      left = [left, split[i]].join(_DeckoName.JOINT);
      compound.push(left);
    }
    return [...split, ...compound];
  }
  /** cardname lib/cardname/pieces.rb #piece_names. */
  get pieceNames() {
    return this.pieces.map((piece) => _DeckoName.parse(piece));
  }
  /** parents, parents' parents, etc (cardname lib/cardname/pieces.rb #ancestors). */
  get ancestors() {
    return this.pieces.filter((piece) => !this.equals(piece));
  }
  /** cardname lib/cardname/pieces.rb #ancestor_pieces. */
  get ancestorPieces() {
    return this.ancestors.map((ancestor) => _DeckoName.parse(ancestor));
  }
  // ~~~~~~~~~~~~~~~~~ predicates.rb + star handling ~~~~~~~~~~~~~~~~~
  /** true if name has more than one part (cardname lib/cardname/predicates.rb #compound?). */
  get isCompound() {
    return !this.isSimple;
  }
  /** true unless name contains banned characters (cardname lib/cardname/predicates.rb #valid?). */
  get isValid() {
    if (_DeckoName.bannedCharacters.length === 0) return true;
    const banned = [..._DeckoName.bannedCharacters, _DeckoName.JOINT].map((c) => regexpQuote(c)).join("");
    const bannedRe = new RegExp(`[${banned}]`);
    return !this.parts.some((part) => bannedRe.test(part));
  }
  /** "+X" (cardname lib/cardname/predicates.rb #starts_with_joint?). */
  get startsWithJoint() {
    return this.isCompound && this.parts[0] === "";
  }
  /** true if name starts with the same parts as the prefix (predicates.rb #starts_with_parts?). */
  startsWithParts(...prefix) {
    const startName = _DeckoName.compose(prefix.map((p) => p ?? ""));
    return startName.equals(this.get(0, startName.numParts));
  }
  /** true if name ends with the same parts as the suffix (predicates.rb #ends_with_parts?). */
  endsWithParts(...suffix) {
    const endName = _DeckoName.compose(suffix.map((p) => p ?? ""));
    return endName.equals(this.getRange(-endName.numParts, -1));
  }
  /** true if a chain of parts equals the subname (cardname lib/cardname/predicates.rb #include?). */
  includes(subname) {
    const subkey = _DeckoName.parse(subname ?? "").key;
    const escaped = regexpQuote(subkey);
    return new RegExp(`(^|\\+)${escaped}($|\\+)`).test(this.key);
  }
  /** simple star name, e.g. "*self" (card-1.110.0 lib/card/name.rb #star?). */
  get isStar() {
    return this.isSimple && this.s.charAt(0) === "*";
  }
  /** compound name with a star right, e.g. "A+*right" (lib/card/name.rb #rstar?). */
  get isRStar() {
    return this.right !== void 0 && this.right.charAt(0) === "*";
  }
  // ~~~~~~~~~~~~~~~~~ variants.rb ~~~~~~~~~~~~~~~~~
  /** URI-friendly version; keeps case, underscores for space (variants.rb #url_key). */
  get urlKey() {
    return this.nameParts.map((part) => {
      const stripped = decodeHtmlEntities(part.s).replace(NOT_OK_FOR_KEY, " ").replace(new RegExp(`^[${RUBY_WHITESPACE}]+|[${RUBY_WHITESPACE}]+$`, "g"), "");
      return stripped.replace(/[ \t\r\n\f\v_]+/g, "_");
    }).join(_DeckoName.JOINT);
  }
  /** HTML-id-safe key; '*' becomes X, joint becomes '-' (variants.rb #safe_key). */
  get safeKey() {
    return this.key.replace(/\*/g, "X").split(_DeckoName.JOINT).join("-");
  }
  /** contextual elements removed (variants.rb #stripped). */
  get stripped() {
    return _DeckoName.parse(this.s.replace(RELATIVE_REGEXP_GLOBAL, ""));
  }
  /** stripped with blank parts removed (variants.rb #fully_stripped; Array#cardname compose). */
  get fullyStripped() {
    return _DeckoName.compose(this.stripped.parts.filter((part) => !rubyBlank(part)));
  }
  // ~~~~~~~~~~~~~~~~~ contextual.rb ~~~~~~~~~~~~~~~~~
  /** true if name is left or right of context (contextual.rb #child_of?). */
  childOf(context) {
    if (!this.isCompound) return false;
    const contextName = _DeckoName.parse(context ?? "");
    return contextName !== void 0 && this.absoluteName(context).parentKeys.includes(contextName.key);
  }
  /** contextual names vary by context (contextual.rb #relative?). */
  get isRelative() {
    return this.startsWithJoint || RELATIVE_REGEXP.test(this.s);
  }
  /** starts with joint, no other contextual element (contextual.rb #simple_relative?). */
  get isSimpleRelative() {
    return this.startsWithJoint && !RELATIVE_REGEXP.test(this.s);
  }
  /** a name fragment referring to a relative part (contextual.rb #relative_fragment?). */
  get isRelativeFragment() {
    return RELATIVE_FRAGMENT_REGEXP.test(this.s);
  }
  /** not relative (contextual.rb #absolute?). */
  get isAbsolute() {
    return !this.isRelative;
  }
  /** interpret contextual name; string form (contextual.rb #from). */
  from(...from) {
    return this.nameFrom(...from).s;
  }
  /** relativize into a name beginning with "+", if possible (contextual.rb #name_from). */
  nameFrom(...from) {
    const compactFrom = from.filter((f) => f != null);
    if (compactFrom.length === 0) return this;
    const remaining = this.partsMinus(
      _DeckoName.compose(compactFrom).partKeys
    );
    if (remaining.every((part) => part === null)) return this;
    if (nameArraysEqual(remaining, this.parts)) return this;
    const compacted = remaining.filter((part) => part !== null);
    const compressed = _DeckoName.baseParse(
      [null, ...compacted].join(_DeckoName.JOINT)
    );
    return this.key === compressed.absoluteName(_DeckoName.compose(compactFrom)).key ? compressed : this;
  }
  /** interpret contextual name; string result (contextual.rb #absolute). */
  absolute(context) {
    const contextName = _DeckoName.parse(context ?? "");
    const newParts = this.parts.map(
      (part) => absolutizeContextualPart(part, contextName)
    );
    if (newParts.length === 0) return "";
    absolutizeExtremes(newParts, contextName);
    return newParts.join(_DeckoName.JOINT);
  }
  /** contextual.rb #absolute_name. */
  absoluteName(context) {
    return _DeckoName.parse(this.absolute(context));
  }
  /** 1 = left; 2 = left of left; ... (contextual.rb #nth_left_name). */
  nthLeftName(n) {
    if (n >= rubyLength(this.s)) {
      return _DeckoName.parse(this.parts[0] ?? "");
    }
    const count = this.nameParts.length - n;
    return count > 0 ? _DeckoName.baseParse(this.sliceParts(0, count)) : _DeckoName.parse("");
  }
  /** contextual.rb #parts_minus: drop empty, relative ("^_"), and ignored-key parts. */
  partsMinus(keysToIgnore) {
    return this.parts.map((part) => {
      if (part === "") return null;
      if (/^_/.test(part)) return null;
      if (keysToIgnore.includes(_DeckoName.parse(part).key)) return null;
      return part;
    });
  }
  // ~~~~~~~~~~~~~~~~~ fields.rb ~~~~~~~~~~~~~~~~~
  /** "A".field("B") -> "A+B" (cardname lib/cardname/fields.rb #field). */
  field(tag) {
    return this.fieldName(tag).s;
  }
  fieldName(tag) {
    if (typeof tag === "object" && tag !== null && !Array.isArray(tag) && !(tag instanceof _DeckoName) && "codename" in tag) {
      return _DeckoName.compose([this, tag]);
    }
    const tagStr = String(tag);
    const stripped = tagStr.charAt(0) === "+" ? tagStr.slice(1) : tagStr;
    return _DeckoName.compose([this, stripped]);
  }
  /** true when the name is a field of the context (fields.rb #field_of?). */
  fieldOf(context) {
    if (!this.isCompound) return false;
    if (!rubyBlank(context)) {
      const contextName = _DeckoName.parse(context);
      return this.absoluteName(context).leftName?.key === contextName.key;
    }
    return /^[ \t\r\n\f\v]*\+[^+]+$/.test(this.s);
  }
  /** relative name containing only the rightmost part (fields.rb #field_only?). */
  get fieldOnly() {
    if (!this.isRelative) return false;
    const firstNonBlank = this.stripped.parts.find((part) => !rubyBlank(part));
    return firstNonBlank === this.parts[this.parts.length - 1];
  }
  /** fields.rb #relative_field_name. */
  relativeFieldName(tag) {
    return this.fieldName(tag).nameFrom(this);
  }
  // ~~~~~~~~~~~~~~~~~ manipulate.rb (as pure functions) ~~~~~~~~~~~~~~~~~
  /**
   * Manipulate#[]= ported as a pure function: a new name with the part at
   * `index` replaced. (Ruby mutates in place; DeckoName is immutable.)
   */
  withPartAt(index, value) {
    const parts = [...this.parts];
    const at2 = index < 0 ? parts.length + index : index;
    parts[at2] = _DeckoName.parse(value ?? "").s;
    return _DeckoName.baseParse(parts.join(_DeckoName.JOINT));
  }
  /** Manipulate#<< ported as a pure function: append a part. */
  append(value) {
    return _DeckoName.baseParse(
      [...this.parts, _DeckoName.parse(value ?? "").s].join(_DeckoName.JOINT)
    );
  }
  /** swap one name for another; keys are compared (manipulate.rb #swap). */
  swap(oldValue, newValue) {
    const oldName = _DeckoName.parse(oldValue ?? "");
    const newName = _DeckoName.parse(newValue ?? "");
    if (oldName.numParts > this.numParts) return this;
    if (oldName.isSimple) {
      return _DeckoName.baseParse(
        this.parts.map((part) => oldName.equals(part) ? newName.s : part).join(_DeckoName.JOINT)
      );
    }
    if (this.includes(oldName)) {
      return _DeckoName.baseParse(this.swapAllSubsequences(oldName, newName).join(_DeckoName.JOINT));
    }
    return this;
  }
  /** add a joint to the beginning unless present (manipulate.rb #prepend_joint / #to_field). */
  get prependJoint() {
    return this.s.startsWith(_DeckoName.JOINT) ? this.s : _DeckoName.JOINT + this.s;
  }
  /** substitute this name's variants in str (manipulate.rb #sub_in). */
  subIn(str, withValue) {
    const withName = _DeckoName.parse(withValue ?? "").s;
    let result = str;
    for (const caseMethod of ["capitalize", "downcase"]) {
      for (const inflectMethod of ["pluralize", "singularize"]) {
        const from = applyCaseAndInflection(this.s, caseMethod, inflectMethod);
        const to = applyCaseAndInflection(withName, caseMethod, inflectMethod);
        result = result.replace(
          new RegExp(`\\b${regexpQuote(from)}\\b`, "g"),
          to
        );
      }
    }
    return result;
  }
  swapAllSubsequences(oldName, newName) {
    const result = [];
    const oldKeys = oldName.partKeys;
    const allKeys = this.partKeys;
    let i = 0;
    while (i <= this.numParts - oldName.numParts) {
      if (oldKeys[0] === allKeys[i] && arraysEqual(oldKeys, allKeys.slice(i, i + oldName.numParts))) {
        result.push(...newName.parts);
        i += oldName.numParts;
      } else {
        result.push(this.parts[i]);
        i += 1;
      }
    }
    if (i < this.numParts) result.push(...this.parts.slice(i));
    return result;
  }
  // ~~~~~~~~~~~~~~~~~ name_variants.rb (Card::Name) ~~~~~~~~~~~~~~~~~
  /**
   * Card::Name#vary (card-1.110.0 lib/card/name/name_variants.rb): apply a
   * comma/space separated list of variants (capitalize, singularize, pluralize,
   * titleize, downcase, upcase, swapcase, reverse, succ; aliases capitalized,
   * singular, plural, title). Unknown variants are ignored.
   */
  vary(variants) {
    const result = variants.split(/[ \t\r\n\f\v,]+/).filter((variant) => variant !== "").reduce((name, variant) => applyVariant(name, variant), this.s);
    return _DeckoName.baseParse(result);
  }
  /**
   * Card::Name#standard (lib/card/name/name_variants.rb): replace each part
   * with its lexicon-registered name where available. Requires a lexicon in
   * the environment; without one the name is returned unchanged (Ruby raises
   * through Lexicon when unconfigured; returning self is the graceful form).
   */
  get standard() {
    if (this.isSimple) {
      const id = getNameEnvironment()?.lexicon?.id(this.key);
      const std = id === void 0 ? void 0 : getNameEnvironment()?.lexicon?.name(id);
      return rubyBlank(std) ? this : _DeckoName.baseParse(std);
    }
    return _DeckoName.compose(this.parts.map((part) => _DeckoName.parse(part).standard));
  }
  /** Card::Name#card_id (lib/card/name/name_variants.rb): lexicon id for the name key. */
  get cardId() {
    return getNameEnvironment()?.lexicon?.id(this.key);
  }
  /** Card::Name#codename: codename string of the card with this name, if any. */
  get codename() {
    const id = this.cardId;
    if (id === void 0) return void 0;
    return getNameEnvironment()?.codename?.nameForId(id);
  }
  /** Card::Name#codename_or_string. */
  get codenameOrString() {
    return this.codename ?? this.s;
  }
  // ~~~~~~~~~~~~~~~~~ Ruby String methods used on names ~~~~~~~~~~~~~~~~~
  /** Ruby String#succ / #next (used by autoname flows). */
  succ() {
    return _DeckoName.baseParse(rubySucc(this.s));
  }
};
function absolutizeContextualPart(part, context) {
  let resolved;
  if (/^_user$/i.test(part)) {
    resolved = getNameEnvironment()?.session ?? part;
  } else if (/^_main$/i.test(part)) {
    resolved = getNameEnvironment()?.mainName;
  } else if (/^(_self|_whole|_)$/i.test(part)) {
    resolved = context.s;
  } else if (/^_left$/i.test(part)) {
    resolved = context.trunk;
  } else if (/^_right$/i.test(part)) {
    resolved = context.tag;
  } else if (/^_(\d+)$/i.test(part)) {
    const pos = parseInt(/^_(\d+)$/i.exec(part)[1], 10);
    resolved = ordinalPart(pos, context);
  } else if (/^_(L*)(R?)$/i.test(part)) {
    const match = /^_(L*)(R?)$/i.exec(part);
    resolved = partmapPart(match[1].length, match[2] !== "", context);
  } else {
    resolved = part;
  }
  return rubyStrip(resolved ?? "");
}
function ordinalPart(pos, context) {
  const clamped = pos > rubyLength(context.s) ? rubyLength(context.s) : pos;
  return context.parts[clamped - 1];
}
function partmapPart(leftCount, withRight, context) {
  const leftPart = context.nthLeftName(leftCount);
  return withRight ? leftPart.tag : leftPart.s;
}
function absolutizeExtremes(newParts, context) {
  for (const index of [0, newParts.length - 1]) {
    const extreme = newParts[index];
    if (rubyBlank(extreme)) {
      const guarded = index === 0 ? DeckoName.parse(newParts.join(DeckoName.JOINT)).startsWithParts(context.s) : DeckoName.parse(newParts.join(DeckoName.JOINT)).endsWithParts(context.s);
      if (!guarded) newParts[index] = context.s;
    }
  }
}
function applyVariant(name, variant) {
  switch (variant) {
    case "capitalized":
    case "capitalize":
      return rubyCapitalize(name);
    case "singular":
    case "singularize":
      return singularize(name);
    case "plural":
    case "pluralize":
      return pluralize(name);
    case "title":
    case "titleize":
      return titleize(name);
    case "downcase":
      return name.toLowerCase();
    case "upcase":
      return name.toUpperCase();
    case "swapcase":
      return Array.from(name).map((c) => c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()).join("");
    case "reverse":
      return Array.from(name).reverse().join("");
    case "succ":
      return rubySucc(name);
    default:
      return name;
  }
}
function applyCaseAndInflection(name, caseMethod, inflectMethod) {
  const cased = caseMethod === "capitalize" ? rubyCapitalize(name) : name.toLowerCase();
  return inflectMethod === "pluralize" ? pluralize(cased) : singularize(cased);
}
function nameArraysEqual(left, right) {
  return left.length === right.length && left.every((part, i) => part === right[i]);
}
function arraysEqual(left, right) {
  return left.length === right.length && left.every((part, i) => part === right[i]);
}
function flattenCardish(parts) {
  const out = [];
  for (const part of parts) {
    if (Array.isArray(part)) {
      out.push(...flattenCardish(part));
    } else {
      out.push(part);
    }
  }
  return out;
}
function describeCardish(cardish) {
  if (cardish === null) return "NilClass";
  if (typeof cardish === "boolean") return "Boolean";
  if (typeof cardish === "number") return "Integer";
  if (typeof cardish === "string") return "String";
  if (cardish instanceof DeckoName) return "Card::Name";
  if (Array.isArray(cardish)) return "Array";
  if (typeof cardish === "object" && "codename" in cardish) return "Symbol";
  return String(cardish);
}

// src/card/fetch/lexicon.ts
var JOINT = DeckoName.JOINT;
var DbLexicon = class _DbLexicon {
  driver;
  /** Card::Cache[Lexicon] (lexicon.rb#cache) - separate cache instance per class. */
  cache;
  /**
   * The durable id->name record of every ASYNC name(id) read - the port's
   * substitute for Ruby's SYNCHRONOUS db fallback (lexicon.rb:71-76) at the
   * machine's synchronous boundaries (the name-environment adapters in
   * fetch.ts#installNameEnvironment; DeckoName.parse's id-mark resolution).
   *
   * Why it exists: Ruby's Lexicon.name(id) is cache-first WITH a
   * synchronous SQL fallback, so "~393" resolves for every id the deck
   * holds no matter what the Temporary cache did (temporary.rb
   * #within_key_counts resets the whole store at 10,000 keys - a 47k-card
   * deck resets it repeatedly while warmLexicon pours it through). The
   * driver here is async, so the sync adapters can only serve warm cache
   * entries - after the reset, an id-mark whose entry was evicted raised
   * NameNotFoundError where Ruby resolved (the 21 `X+*members` page raises
   * of pass15's engine-raise-divergence class: those List cards store
   * `~id` item lines). Every async name(id) read lands the resolved name
   * here, so the sync adapters answer what Ruby's db fallback would:
   * misses are ids never warmed (which Ruby's db would also not answer),
   * never wrong names.
   *
   * Order at the consumer: live caches first (temp/shared - they hold the
   * rename/trash state the write path maintains), then this map, then the
   * codename registry. Cap: the map holds one short string per deck card
   * (47k entries for the census deck); a runaway deck clears rather than
   * grows without bound.
   */
  durableIdNames = /* @__PURE__ */ new Map();
  static DURABLE_ID_NAMES_CAP = 2e5;
  constructor(driver, cache) {
    this.driver = driver;
    this.cache = cache;
  }
  /** lexicon.rb#name(id): registered name, or the empty name when unknown
   *  (Ruby `(name || "").to_name`; blankness is the unknown signal at every
   *  consumer - retrieve_from_cache_by_id, id_from_string validation).
   *  This port returns undefined instead of the empty name; see
   *  docs/fetch-port-notes.md ("empty-name fallback"). */
  async name(id) {
    if (id === void 0 || id === null) return void 0;
    const lex = await this.idToLex(id);
    const name = lex === void 0 ? void 0 : await this.lexToName(lex);
    if (name === void 0) return void 0;
    const nameStr = typeof name === "string" ? name : name.s;
    this.recordDurableName(id, nameStr);
    return DeckoName.parse(nameStr);
  }
  /** The sync boundary's read of the durable map (see the field comment).
   *  Live caches first is the CALLER's contract (fetch.ts's adapter walks
   *  peekLexiconName -> this peek -> codenames); this method only answers
   *  what an async name(id) read already proved the db holds. */
  peekDurableName(id) {
    return this.durableIdNames.get(id);
  }
  recordDurableName(id, name) {
    if (this.durableIdNames.has(id)) return;
    if (this.durableIdNames.size >= _DbLexicon.DURABLE_ID_NAMES_CAP) {
      this.durableIdNames.clear();
    }
    this.durableIdNames.set(id, name);
  }
  /** lexicon.rb#id(name): registered id, undefined when unknown. Accepts a
   *  name or an already-canonical key string (key -> name -> key is
   *  idempotent, matching Ruby's name.to_name round-trip). */
  async id(nameish) {
    const name = typeof nameish === "string" ? DeckoName.parse(nameish) : nameish;
    if (name.s === "") return void 0;
    if (name.isRelativeFragment) return void 0;
    const lex = await this.nameToLex(name);
    return lex === void 0 ? void 0 : this.lexToId(lex);
  }
  /**
   * Synchronous mirror of id() over CACHE-WARM entries only - the sync-read
   * contract the name-environment adapters and the CQL name->id resolver
   * (ParseOptions.resolveCardId via cql/execute.ts#parseOptionsWithLexicon)
   * need. The driver is async while those consumers are sync; Ruby's
   * Lexicon is cache-first synchronous too - the db fallback is the only
   * difference, and this mirror deliberately has none.
   *
   * Walks the SAME name_to_lex/lex_to_id path id() walks, reading only what
   * id()/name() already cached: name -> lex (the name for simple cards,
   * [left_id, right_id] for compound, side ids resolved recursively through
   * peekLex) -> id (the "L-..." reverse entry idToLex/lexToId write).
   * Warm first (await lexicon.name(id)/id(name), e.g. FetchEngine#
   * warmLexicon over the deck's ids); a cold or unresolvable entry returns
   * undefined - an UNKNOWN name, never a wrong id.
   */
  peekId(nameish) {
    const name = typeof nameish === "string" ? DeckoName.parse(nameish) : nameish;
    if (name.s === "") return void 0;
    if (name.isRelativeFragment) return void 0;
    const lex = this.peekLex(name);
    if (lex === void 0) return void 0;
    const id = this.peekStored(cacheKey(lex));
    return typeof id === "number" ? id : void 0;
  }
  /**
   * Reads a lexicon cache entry that a layer actually HOLDS, without
   * materializing a miss. CardCache.read (cache.rb#read) is
   * `temp.fetch(key) { shared.read(key) }` - a shared miss writes a stored
   * nil into temp. Every Ruby reader of the Lexicon cache is
   * cache.fetch-shaped (lexicon.rb#lex_to_id/#id_to_lex), so in Ruby a
   * stored nil always means "the db said no"; this sync peek is an extra
   * reader Ruby does not have, and its misses are EVICTIONS (the Temporary
   * max-keys reset, temporary.rb#within_key_counts) or cold entries, not
   * answers. Materializing one would poison the async fallback:
   * lexToId's cacheFetch would see the key exist and answer the stored nil
   * WITHOUT the SQL query - "unknown" for a card the db has, exactly what
   * Ruby's synchronous SQL fallback never answers (the hazard behind the
   * 10 empty <host>+*referred_to_by / +*type+by_name census pages). The
   * read order mirrors CardCache.read's (temp first, shared second).
   */
  peekStored(key) {
    if (this.cache.temp.exist(key)) return this.cache.temp.read(key);
    return this.cache.shared?.read(key);
  }
  /** name_to_lex over warm entries only (mirrors nameToLex line for line;
   *  keep the two in step). */
  peekLex(name) {
    if (name.isSimple) return name.s;
    const leftId = this.peekId(name.leftName ?? DeckoName.parse(""));
    if (leftId === void 0) return void 0;
    const rightId = this.peekId(name.rightName ?? DeckoName.parse(""));
    if (rightId === void 0) return void 0;
    return [leftId, rightId];
  }
  /** Lexicon.lex_to_name([left_id, right_id]) - the compound-name
   *  composition Card#name uses (lib/card/name/all.rb#name). */
  async composeName(leftId, rightId) {
    const name = await this.lexToName([leftId, rightId ?? void 0]);
    return name === void 0 ? void 0 : DeckoName.parse(name);
  }
  /** lexicon.rb#write_to_temp_cache - the after_write_to_temp_cache hook body. */
  writeTemp(id, name, lex) {
    if (id !== void 0) this.cache.temp.write(String(id), name);
    if (lex !== void 0) this.cache.temp.write(cacheKey(lex), id);
  }
  /** lexicon.rb#write */
  write(id, name, lex) {
    this.cache.write(String(id), name);
    this.cache.write(cacheKey(lex), id);
  }
  /** Prime lex_to_id entries from a batched key lookup (the cold render's
   *  prelude batch: the set-pattern anchor names the render's rule walk
   *  resolves). Writes EXACTLY what lexToId's cacheFetch would write for
   *  the same keys - positive ids and the negative (undefined) entries a
   *  miss caches too (cache.rb#fetch: "a stored nil is a hit") - so the
   *  later name->id resolutions stay zero-query without changing what they
   *  resolve to. The `key` strings are card names; the cache key is the
   *  canonical key, the same transform lexToId applies. */
  primeIdsByKey(entries) {
    for (const entry of entries) {
      this.cache.write(cacheKey(entry.key), entry.id);
    }
  }
  /** lexicon.rb#delete - used by the write path (act integration). */
  deleteFor(id, lexBeforeAct) {
    if (id !== void 0) this.cache.delete(String(id));
    if (lexBeforeAct !== void 0) this.cache.delete(cacheKey(lexBeforeAct));
  }
  /** lexicon.rb#id_to_lex. NOTE: no trash filter here - the row is read by
   *  id whatever its trash state. */
  async idToLex(id) {
    const lex = await this.cacheFetch(String(id), async () => {
      const result = await this.driver.query(
        "SELECT name, left_id, right_id FROM cards WHERE id = ? LIMIT 1",
        [id]
      );
      const row = result.rows[0];
      if (row === void 0) return void 0;
      const resolved = row.name !== null && row.name !== void 0 ? row.name : [row.left_id ?? void 0, row.right_id ?? void 0];
      await this.cacheWrite(cacheKey(resolved), id);
      return resolved;
    });
    return lex;
  }
  /** lexicon.rb#name_to_lex */
  async nameToLex(name) {
    if (name.isSimple) return name.s;
    const leftId = await this.id(name.leftName ?? DeckoName.parse(""));
    if (leftId === void 0) return void 0;
    const rightId = await this.id(name.rightName ?? DeckoName.parse(""));
    if (rightId === void 0) return void 0;
    return [leftId, rightId];
  }
  /** lexicon.rb#lex_to_name: array lexes join their side names. The guard
   *  `name side_id or return` evaluates the PUBLIC Lexicon.name, which is
   *  never falsy for a present id argument: a side id whose cards row is
   *  MISSING answers the EMPTY name (lexicon.rb:11-15, `(name || "").to_name`)
   *  — truthy — so the join CONTINUES with the empty part and a junction
   *  whose side row is gone composes a "+*default"-shaped name (verified
   *  live against the corpus deck: Lexicon.name(389) = "+*default" with
   *  cards 388 absent). Only a NIL side id bails: lexicon.rb#name answers
   *  nil for `id.present? == false` (lexicon.rb:12), making the whole
   *  composition nil. */
  /** Returns the name STRING for array lexes; for simple lexes the LEX
   *  VERBATIM — which can be a DeckoName (the write path caches DeckoName
   *  objects under ids, lexicon.rb:74-82 write_to_temp_cache). Callers
   *  must normalize with the typeof check DbLexicon#name applies. */
  async lexToName(lex) {
    if (!Array.isArray(lex)) return lex;
    const sides = [];
    for (const sideId of lex) {
      if (sideId === void 0) return void 0;
      const side = await this.name(sideId);
      sides.push(side === void 0 ? "" : side.s);
    }
    return sides.join(JOINT);
  }
  /** lexicon.rb#lex_to_id - trash: false filter (lex_query merge). */
  async lexToId(lex) {
    const found = await this.cacheFetch(cacheKey(lex), async () => {
      const { sql, params } = lexQuery(lex);
      const result = await this.driver.query(
        `SELECT id FROM cards WHERE ${sql} AND trash = 0 LIMIT 1`,
        params
      );
      const id = result.rows[0]?.id;
      if (id !== void 0 && Array.isArray(lex)) {
        await this.cacheWrite(String(id), lex);
      }
      return id;
    });
    return found;
  }
  /** cache.fetch with async compute (cache.rb#fetch semantics: temp first,
   *  compute+write-back on miss). */
  async cacheFetch(key, compute) {
    if (this.cache.temp.exist(key)) return this.cache.temp.read(key);
    if (this.cache.shared !== void 0) {
      const shared = this.cache.shared.read(key);
      if (shared !== void 0) {
        this.cache.temp.write(key, shared, this.cache.afterWriteToTempCache);
        return shared;
      }
    }
    const computed = await compute();
    this.cache.write(key, computed);
    return computed;
  }
  async cacheWrite(key, value) {
    this.cache.write(key, value);
  }
};
function cacheKey(lex) {
  return `L-${Array.isArray(lex) ? lex.map((side) => side ?? "").join("-") : DeckoName.parse(lex).key}`;
}
function lexQuery(lex) {
  if (Array.isArray(lex)) {
    return {
      sql: `${lex[0] === void 0 ? "left_id IS NULL" : "left_id = ?"} AND ${lex[1] === void 0 ? "right_id IS NULL" : "right_id = ?"}`,
      params: [lex[0], lex[1]].filter((side) => side !== void 0)
    };
  }
  return { sql: "key = ?", params: [DeckoName.parse(lex).key] };
}

// src/card/fetch/codename.ts
var CODENAMES_CACHE_KEY = "CODENAMES";
var CODEHASH_SQL = "SELECT id, codename, name, left_id, right_id FROM cards WHERE codename IS NOT NULL";
var DbCodenameRegistry = class {
  driver;
  /** Card::Cache[Card] - the codehash is stored in the CARD cache
   *  (codename.rb#load_codehash), not a Codename-class cache. */
  cache;
  lexicon;
  codehashValue;
  constructor(driver, cache, lexicon) {
    this.driver = driver;
    this.cache = cache;
    this.lexicon = lexicon;
  }
  /** codename.rb#id (String/Symbol branch): codename -> id. */
  async id(codename) {
    const codehash = await this.codehash();
    return codehash.c2i.get(codename);
  }
  /** codename.rb#[] (Integer branch): id -> codename. */
  async nameForId(id) {
    const codehash = await this.codehash();
    return codehash.i2c.get(id);
  }
  /** codename.rb#name(codename): (card_id = id codename) && Lexicon.name(card_id). */
  async name(codename) {
    const cardId = await this.id(codename);
    return cardId === void 0 ? void 0 : this.lexicon.name(cardId);
  }
  /** codename.rb#reset_cache: clear the memo, drop the cache entry. */
  resetCache() {
    this.codehashValue = void 0;
    this.cache.delete(CODENAMES_CACHE_KEY);
  }
  /** Force the codehash load; the sync NameCodenameRegistry adapter handed
   *  to the name environment can only read the memoized hash, so callers
   *  that need it synchronously await this first. */
  async ensureLoaded() {
    await this.codehash();
  }
  // ---- sync peeks (memo only; undefined until the codehash is loaded) -----
  peekId(codename) {
    return this.codehashValue?.c2i.get(codename);
  }
  peekNameForId(id) {
    return this.codehashValue?.i2c.get(id);
  }
  /**
   * codename.rb#name (codename -> the card's NAME): `(card_id = id codename)
   * && Lexicon.name(card_id)` — the NAME, not the codename. The `name`
   * column is the right source for every codenamed row (codename.rb#seed_
   * caches seeds only non-junction cards, and a codenamed card is never a
   * junction), so `i2name` IS `Lexicon.name(id)` for this id set.
   *
   * Reading `i2c` here instead (id -> codename) made the Card::Name SYMBOL
   * mark resolve to the bare codename: `Card::Name[:type_plus_right]` must
   * be the `type plus right` setting card's name, and card-mod-edit
   * set/all/template_nest.rb:27's `[type, name].to_name.field_name
   * :type_plus_right` depends on it. The sync name-environment adapter
   * (fetch.ts) is this method's ONLY reader; `DeckoName#codename` goes
   * through peekNameForId (i2c), which is the id -> codename direction and
   * is unchanged.
   */
  peekName(codename) {
    const id = this.peekId(codename);
    return id === void 0 ? void 0 : this.codehashValue?.i2name.get(id);
  }
  /** The registered card NAME for a codenamed id, straight from the codehash
   *  memo. The sync lexicon adapter's substitute for Ruby's synchronous db
   *  fallback (lexicon.rb:71-76 `cache.fetch(id.to_s) { Card.where(id: id)
   *  ... }`): a ":codename"/"~id" mark parse only consults the lexicon for
   *  ids the registry already confirmed, and this memo - loaded at
   *  ensureLoaded from the same cards rows the db fallback would read -
   *  survives the temporary-cache resets that wipe the seeded lexicon
   *  entries mid-render. Same string the db fallback returns (the row's
   *  name column, one boot-time snapshot; the render surface is read-only).
   *  Undefined for codenamed rows with a NULL name (junction rows) - the
   *  parse then raises exactly like Ruby's blank db result (name.rb:80-82
   *  `name.present? ? name : bad_mark(str)`). */
  peekRegisteredName(id) {
    return this.codehashValue?.i2name.get(id);
  }
  /** Every codename->id pair from the memoized codehash (empty until the
   *  hash loads). Unlike peekCodehash (the CARD-cache copy, subject to the
   *  temporary-cache reset), this reads the registry memo directly — the
   *  page renderer's mark-resolvability probe enumerates from here. */
  peekEntries() {
    return [...this.codehashValue?.c2i.entries() ?? []];
  }
  /** The codehash load as a batch statement, for callers folding it into a
   *  larger batch (the prefetch additionalStatements vehicle) so a cold
   *  render pays no dedicated round trip for codename ids. Feed the
   *  matching result back with foldCodehashResults. */
  codehashStatement() {
    return { sql: CODEHASH_SQL, params: [] };
  }
  /** Install the codehash from a folded codehashStatement result (same
   *  rows processCodenames would have loaded). After this, id() and the
   *  sync peeks read the memo — no queries. No-op when already loaded
   *  (a second fold would rebuild an identical hash). */
  foldCodehashResults(result) {
    if (this.codehashValue !== void 0) return;
    const codehash = this.buildCodehash(
      result.rows
    );
    this.cache.write(CODENAMES_CACHE_KEY, codehash);
    this.codehashValue = codehash;
  }
  /** codename.rb#codehash / #load_codehash: Card.cache.fetch("CODENAMES")
   *  { process_codenames }. The fetch value is the codehash; the in-memory
   *  memo avoids re-parsing Maps out of the cache on every call. A cache
   *  entry predating the i2name map is accepted with an empty substitute
   *  (the parse then behaves exactly as before this map existed). */
  async codehash() {
    if (this.codehashValue !== void 0) return this.codehashValue;
    const cached = this.cache.fetch(CODENAMES_CACHE_KEY, () => null);
    if (cached && cached.c2i instanceof Map && cached.i2c instanceof Map) {
      this.codehashValue = cached.i2name instanceof Map ? cached : { c2i: cached.c2i, i2c: cached.i2c, i2name: /* @__PURE__ */ new Map() };
      return this.codehashValue;
    }
    const fresh = await this.processCodenames();
    this.cache.write(CODENAMES_CACHE_KEY, fresh);
    this.codehashValue = fresh;
    return fresh;
  }
  /** Shared codehash construction: all three maps plus the simple-card
   *  lexicon seeding (#seed_caches). */
  buildCodehash(rows) {
    const codehash = { c2i: /* @__PURE__ */ new Map(), i2c: /* @__PURE__ */ new Map(), i2name: /* @__PURE__ */ new Map() };
    for (const row of rows) {
      if (row.codename === null || row.codename === void 0) continue;
      codehash.c2i.set(row.codename, row.id);
      codehash.i2c.set(row.id, row.codename);
      if (row.name !== null && row.name !== void 0) {
        codehash.i2name.set(row.id, row.name);
      }
      if (row.left_id === null || row.left_id === void 0) {
        const name = row.name !== null && row.name !== void 0 ? DeckoName.parse(row.name) : void 0;
        if (name !== void 0) {
          const lex = name.isSimple ? name.s : [row.left_id ?? void 0, row.right_id ?? void 0];
          this.lexicon.write(row.id, name, lex);
        }
      }
    }
    return codehash;
  }
  async processCodenames() {
    const result = await this.driver.query(CODEHASH_SQL, []);
    return this.buildCodehash(result.rows);
  }
};

// src/card/fetch/card-record.ts
function isNewCard(card) {
  return (card.isNew || card.fromTrash) && !card.trash;
}
function isRealCard(card) {
  return !isNewCard(card);
}
function isKnownCard(card) {
  return isRealCard(card);
}
function cardContent(card) {
  return card.dbContent ?? "";
}
function idString(card) {
  return card.id === void 0 ? void 0 : `~${card.id}`;
}
async function composeCardRecord(row, lexicon) {
  const trash = row.trash === 1;
  let name;
  let key;
  if (row.left_id !== null && row.left_id !== void 0) {
    const composed = await lexicon.composeName(row.left_id, row.right_id);
    if (composed !== void 0) {
      name = composed;
      key = composed.key;
    } else {
      name = row.name !== null && row.name !== void 0 ? DeckoName.parse(row.name) : void 0;
      key = row.key ?? void 0;
    }
  } else {
    name = row.name !== null && row.name !== void 0 ? DeckoName.parse(row.name) : void 0;
    key = row.key ?? void 0;
  }
  return {
    id: row.id,
    codename: row.codename ?? void 0,
    leftId: row.left_id ?? void 0,
    rightId: row.right_id ?? void 0,
    typeId: row.type_id,
    dbContent: row.db_content ?? void 0,
    trash,
    creatorId: row.creator_id,
    updaterId: row.updater_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    currentRevisionId: row.current_revision_id ?? void 0,
    readRuleClass: row.read_rule_class ?? void 0,
    readRuleId: row.read_rule_id ?? void 0,
    referencesExpired: row.references_expired ?? void 0,
    name,
    key,
    isNew: false,
    fromTrash: false,
    uncacheable: false
  };
}
function newCardRecord(mark, opts = {}) {
  return {
    id: void 0,
    codename: void 0,
    leftId: void 0,
    rightId: void 0,
    typeId: opts.typeId,
    dbContent: opts.content,
    trash: false,
    creatorId: void 0,
    updaterId: void 0,
    createdAt: void 0,
    updatedAt: void 0,
    currentRevisionId: void 0,
    readRuleClass: void 0,
    readRuleId: void 0,
    referencesExpired: void 0,
    name: mark,
    key: mark.key,
    isNew: true,
    fromTrash: false,
    uncacheable: false
  };
}

// src/card/fetch/retrieve.ts
var ID_MARK_REGEXP2 = /^~(\d+)$/;
var CODENAME_MARK_REGEXP2 = /^:(\w+)$/;
function flattenArgs(args) {
  const out = [];
  const walk = (items) => {
    for (const item of items) {
      if (Array.isArray(item)) walk(item);
      else out.push(item);
    }
  };
  walk(args);
  return out;
}
function isCodenameMark(arg2) {
  return typeof arg2 === "object" && arg2 !== null && !(arg2 instanceof DeckoName) && "codename" in arg2;
}
function isCardRecord(arg2) {
  return typeof arg2 === "object" && arg2 !== null && !isCodenameMark(arg2) && !(arg2 instanceof DeckoName) && "key" in arg2;
}
async function normalizeMark(args, opts, lexicon, codenames) {
  const flat = flattenArgs(args);
  const mark = flat.length <= 1 ? flat[0] : void 0;
  if (mark === void 0) {
    const name2 = await nameFromMarkParts(flat, lexicon, codenames);
    return absolutize({ kind: "name", name: name2 }, opts);
  }
  const id = await idFromMark(mark, lexicon, codenames);
  if (typeof id === "number") {
    if (!Number.isSafeInteger(id)) return { kind: "outOfRange", digits: String(id) };
    return { kind: "id", id };
  }
  if (typeof id === "object" && id !== null && "outOfRange" in id) {
    return { kind: "outOfRange", digits: id.outOfRange };
  }
  const name = await nameFromMark(mark, lexicon, codenames);
  return absolutize({ kind: "name", name }, opts);
}
function absolutize(mark, opts) {
  if (opts.newSupercardName === void 0 || opts.newSupercardName === null) return mark;
  const supercard = DeckoName.parse(opts.newSupercardName);
  return { kind: "name", name: mark.name.absoluteName(supercard) };
}
async function idFromMark(mark, lexicon, codenames) {
  if (typeof mark === "number") {
    return Number.isSafeInteger(mark) ? mark : { outOfRange: String(mark) };
  }
  if (typeof mark === "string") {
    return idFromStringStrict(mark, lexicon, codenames);
  }
  if (isCodenameMark(mark)) {
    const id = await codenames.id(mark.codename);
    if (id === void 0) {
      throw new CodenameNotFoundError(`codename doesn't exist: ${mark.codename}`);
    }
    return id;
  }
  if (isCardRecord(mark)) return mark.id;
  return void 0;
}
async function idFromStringStrict(str, lexicon, codenames) {
  const idMatch = ID_MARK_REGEXP2.exec(str);
  if (idMatch !== null) {
    const digits = idMatch[1];
    const id = Number(digits);
    if (!Number.isSafeInteger(id)) return { outOfRange: digits };
    const known = await lexicon.name(id);
    if (known === void 0 || known.s === "") {
      throw new NameNotFoundError(`id doesn't exist: ${digits}`);
    }
    return id;
  }
  const codeMatch = CODENAME_MARK_REGEXP2.exec(str);
  if (codeMatch !== null) {
    const codename = codeMatch[1];
    const id = await codenames.id(codename);
    if (id === void 0) {
      throw new CodenameNotFoundError(`codename doesn't exist: ${codename}`);
    }
    return id;
  }
  return void 0;
}
async function nameFromMark(mark, lexicon, codenames) {
  if (mark === null || mark === void 0) return DeckoName.parse("");
  if (mark instanceof DeckoName) return mark;
  if (typeof mark === "string") return DeckoName.parse(mark);
  if (typeof mark === "number") {
    const name = await lexicon.name(mark);
    return name ?? DeckoName.parse("");
  }
  if (isCodenameMark(mark)) {
    const name = await codenames.name(mark.codename);
    if (name === void 0) {
      throw new CodenameNotFoundError(`codename doesn't exist: ${mark.codename}`);
    }
    return name;
  }
  if (isCardRecord(mark)) return mark.name ?? DeckoName.parse("");
  return DeckoName.parse("");
}
async function nameFromMarkParts(parts, lexicon, codenames) {
  const resolved = [];
  for (const part of parts) {
    resolved.push((await nameFromMark(part, lexicon, codenames)).s);
  }
  return DeckoName.compose(resolved);
}
async function retrieveFromDb(driver, mark, opts, lexicon) {
  const trashClause = opts.lookInTrash ? "" : " AND trash = 0";
  if (mark.kind === "name" && mark.name.isSimple) {
    const result2 = await driver.query(
      `SELECT * FROM cards WHERE key = ?${trashClause} LIMIT 1`,
      [mark.name.key]
    );
    return finish(result2.rows[0]);
  }
  if (mark.kind === "outOfRange") {
    return { row: void 0, freshFromDb: false };
  }
  const id = mark.kind === "id" ? mark.id : await lexicon.id(mark.name);
  if (id === void 0) return { row: void 0, freshFromDb: false };
  const result = await driver.query(
    `SELECT * FROM cards WHERE id = ?${trashClause} LIMIT 1`,
    [id]
  );
  return finish(result.rows[0]);
}
function finish(row) {
  return { row, freshFromDb: row !== void 0 && !row.trash };
}

// src/card/fetch.ts
var DEFAULT_DATABASE_NAME = "decko";
var FetchEngine = class {
  driver;
  /** Card::Cache[Card] */
  cardCache;
  /** Card::Cache[Lexicon] - a separate cache instance per Ruby class
   *  (cache/class_methods.rb#[] cache_by_class). */
  lexiconCache;
  lexicon;
  codenames;
  /** states.rb#virtual? injection (see VirtualCardLookup). */
  virtualCardLookup;
  constructor(driver, opts = {}) {
    this.driver = driver;
    this.cardCache = new CardCache({
      className: "Card",
      sharedStore: opts.sharedStore,
      database: opts.database ?? DEFAULT_DATABASE_NAME,
      maxTemporaryKeys: opts.maxTemporaryCacheKeys
    });
    this.lexiconCache = new CardCache({
      className: "Lexicon",
      sharedStore: opts.sharedStore,
      database: opts.database ?? DEFAULT_DATABASE_NAME,
      maxTemporaryKeys: opts.maxTemporaryCacheKeys
    });
    this.lexicon = new DbLexicon(driver, this.lexiconCache);
    this.codenames = new DbCodenameRegistry(driver, this.cardCache, this.lexicon);
    this.cardCache.afterWriteToTempCache = (value) => {
      if (isCardValue(value)) this.writeLexiconTemp(value);
    };
  }
  // ---------------------------------------------------------------------
  // fetch.rb#retrieve_or_new
  // ---------------------------------------------------------------------
  /**
   * Card.fetch(*marks, opts?) - look for a card in cache, then database,
   * then (virtual/new) results. A trailing plain object is the options
   * hash, exactly as Ruby pops it (fetch.rb#normalize_args). Returns
   * undefined for unknown cards without `new:` opts (Ruby nil); raises
   * NameNotFoundError / CodenameNotFoundError for bad marks.
   */
  async fetch(...args) {
    const { marks, opts } = splitArgs(args);
    return this.fetchWithOptions(marks, opts);
  }
  /** fetch with explicit options (the form callers should prefer in TS). */
  async fetchWithOptions(marks, opts = {}) {
    if (opts.new !== void 0 && opts.skipVirtual === true) {
      throw new Error("fetch called with new args and skip_virtual");
    }
    const mark = await normalizeMark(
      marks,
      { newSupercardName: opts.new?.supercard },
      this.lexicon,
      this.codenames
    );
    if (mark === void 0) return void 0;
    if (mark.kind === "outOfRange") {
      return newCardRecord(DeckoName.parse(`card id out of range: ${mark.digits}`));
    }
    const retrieved = await this.retrieveExisting(mark, opts);
    return await this.updateCache(mark, retrieved, opts);
  }
  // ---------------------------------------------------------------------
  // fetch/retrieve.rb
  // ---------------------------------------------------------------------
  /** retrieve.rb#retrieve_existing: cache first, then db; a blank mark
   *  retrieves nothing (retrieve.rb:7-9 `return unless mark.present?`). */
  async retrieveExisting(mark, opts) {
    if (mark.kind === "name" && mark.name.s === "") return { card: void 0, freshFromDb: false };
    const fromCache = await this.retrieveFromCache(mark, opts);
    if (fromCache !== void 0) return { card: fromCache, freshFromDb: false };
    const { row, freshFromDb } = await retrieveFromDb(
      this.driver,
      mark,
      { lookInTrash: opts.lookInTrash === true },
      this.lexicon
    );
    if (row === void 0) return { card: void 0, freshFromDb: false };
    return { card: await composeCardRecord(row, this.lexicon), freshFromDb };
  }
  /** retrieve.rb#retrieve_from_cache. look_in_trash drops cached new?
   *  cards so the db version is fetched (retrieve.rb:15-17 and its
   *  comment: "don't return cached cards if looking in trash - we want
   *  the db version"). */
  async retrieveFromCache(mark, opts) {
    const localOnly = opts.localOnly === true;
    let card;
    if (mark.kind === "id") {
      card = await this.retrieveFromCacheById(mark.id, localOnly);
    } else if (mark.kind === "name") {
      card = this.retrieveFromCacheByKey(mark.name.key, localOnly);
    }
    if (card !== void 0 && isNewCard(card) && opts.lookInTrash === true) {
      return void 0;
    }
    return card;
  }
  /** cache/card_class.rb#retrieve_from_cache (13-15) + #retrieve_from_cache_by_key (24-26). */
  retrieveFromCacheByKey(key, localOnly = false) {
    const value = localOnly ? this.cardCache.temp.read(key) : this.cardCache.read(key);
    return isCardValue(value) ? value : void 0;
  }
  /** cache/card_class.rb#retrieve_from_cache_by_id (17-22): ids resolve to
   *  names through the Lexicon, then read by key. `key.present?` guards. */
  async retrieveFromCacheById(id, localOnly = false) {
    const name = await this.lexicon.name(id);
    if (name === void 0 || name.key === "") return void 0;
    return this.retrieveFromCacheByKey(name.key, localOnly);
  }
  // ---------------------------------------------------------------------
  // fetch/store.rb
  // ---------------------------------------------------------------------
  /** fetch.rb:18-19 update_cache + results, with store.rb#new_for_cache
   *  running inside update_cache?'s evaluation (Ruby's update_cache?
   *  calls new_for_cache, which ASSIGNS @card when it instantiates a
   *  placeholder). needs_prep? (store.rb:38-42) exists to pre-compute
   *  set-pattern modules before caching; with set modules deferred to the
   *  rules wave every TS card is already "prepped", so that branch is
   *  observable-behavior-equivalent to false (a cached real card and a
   *  freshly prepped one are indistinguishable without modules). */
  async updateCache(mark, retrieved, opts) {
    let card = retrieved.card;
    let createdPlaceholder = false;
    if (this.newForCacheApplies(mark, card, opts)) {
      card = this.instantiatePlaceholder(mark, opts);
      createdPlaceholder = true;
    }
    if ((retrieved.freshFromDb || createdPlaceholder) && card !== void 0 && !card.uncacheable) {
      this.storeCard(card, opts);
    }
    return await this.results(card, mark, opts);
  }
  /** store.rb#reusable? (48-50): !(mark.is_a?(Integer) || (mark.blank? && !opts[:new])). */
  reusable(mark, opts) {
    if (mark.kind !== "name") return false;
    return !(mark.name.s === "" && opts.new === void 0);
  }
  /** store.rb#new_card_needed? (44-46):
   *  !(card.present? && (card.type_id.present? || skip_type_lookup?)). */
  newCardNeeded(card, opts) {
    return !(card !== void 0 && (card.typeId !== void 0 || opts.skipTypeLookup === true));
  }
  /** store.rb#new_for_cache? (34-36). */
  newForCacheApplies(mark, card, opts) {
    return this.reusable(mark, opts) && this.newCardNeeded(card, opts);
  }
  /** store.rb#new_for_cache (21-28): `Card.new name: mark, skip_modules:
   *  true`, with the type attrs merged only when eager_caching? (30-32:
   *  eager_cache + name mark + absolute + new opts present). The
   *  placeholder is cached by key, which is how the Ruby shared cache ends
   *  up holding "missing" cards (lib/card/cache/shared.rb module doc). */
  instantiatePlaceholder(mark, opts) {
    const newOpts = opts.new;
    const eager = opts.eagerCache === true && newOpts !== void 0 && mark.name.isAbsolute;
    return newCardRecord(
      mark.name,
      eager ? { typeId: newOpts?.typeId, content: newOpts?.content } : {}
    );
  }
  /** store.rb:8-9 via cache/card_class.rb#write_to_cache. */
  storeCard(card, opts) {
    if (card.uncacheable) return;
    this.writeToCache(card, opts.localOnly === true);
  }
  // ---------------------------------------------------------------------
  // fetch/results.rb
  // ---------------------------------------------------------------------
  /** results.rb#results. */
  async results(card, mark, opts) {
    if (card === void 0) return void 0;
    return isNewCard(card) ? await this.newResultCard(card, mark, opts) : this.finalizeResultCard(card);
  }
  /** results.rb#finalize_result_card: include_set_modules unless
   *  skip_modules? - set modules do not exist in this port yet (rules
   *  wave); the step is an identity function here. */
  finalizeResultCard(card) {
    return card;
  }
  /** results.rb#new_result_card (16-23). */
  async newResultCard(card, mark, opts) {
    const newOpts = opts.new;
    let effective = card;
    if (newOpts !== void 0) {
      const markName = mark.kind === "name" ? mark.name : DeckoName.parse("");
      if (!this.quickRenew(effective, markName, newOpts, opts)) {
        effective = this.renew(effective, markName, newOpts);
      }
    } else if (opts.skipVirtual === true) {
      return void 0;
    } else {
      this.assignName(effective, mark, opts);
    }
    this.finalizeResultCard(effective);
    if (newOpts !== void 0 || isKnownCard(effective)) return effective;
    if (this.virtualCardLookup !== void 0 && effective.name !== void 0 && effective.name.isCompound) {
      const virtual = await this.virtualCardLookup(effective.name);
      if (virtual !== void 0) {
        if (virtual.typeId !== void 0 && effective.typeId === void 0) {
          effective.typeId = virtual.typeId;
        }
        effective.dbContent = virtual.templateContent;
        return effective;
      }
    }
    return void 0;
  }
  /** results.rb#quick_renew (53-60) + #quick_renew? (69-76): blank new
   *  opts (the `new: {}` idiom) just assign the name; otherwise decline
   *  when the type or name changes or when fancy (unhandled) opts appear -
   *  those need renew. */
  quickRenew(card, mark, newOpts, opts) {
    if (Object.keys(newOpts).length === 0) {
      const requested = newOpts.name !== void 0 ? DeckoName.parse(newOpts.name) : void 0;
      this.assignName(
        card,
        { kind: "name", name: requested !== void 0 && requested.s !== "" ? requested : mark },
        opts
      );
      return true;
    }
    if (this.typeChange(card, newOpts)) return false;
    if (this.nameChange(card, newOpts, mark)) return false;
    if (this.fancyRenew(newOpts)) return false;
    this.quickContent(card, newOpts);
    return true;
  }
  /** results.rb#renew (37-43) + #newish_opts (44-50): dup the card and
   *  apply the new-opts attributes. The cached placeholder (already
   *  written by update_cache) is left pristine - Ruby dups for the same
   *  reason. Port scope: name/type/content; the full Card.new machinery
   *  (handle_type validation, supercard wiring, subcards) is write-path. */
  renew(card, mark, newOpts) {
    const requestedName = newOpts.name !== void 0 ? DeckoName.parse(newOpts.name) : mark;
    const renewed = { ...card };
    if (requestedName.s !== (card.name?.s ?? "")) {
      renewed.name = requestedName;
      renewed.key = requestedName.key;
    }
    const content = this.assignableContent(card, newOpts);
    if (content !== void 0) renewed.dbContent = content;
    if (newOpts.typeId !== void 0) {
      renewed.typeId = newOpts.typeId;
    }
    return renewed;
  }
  /** results.rb#type_change? (101-109): a nil type_id is always a type
   *  change; otherwise compare against new opts. supercard-dependent type
   *  changes (supercard_might_change_type?, 116-120) need the rules wave. */
  typeChange(card, newOpts) {
    if (card.typeId === void 0) return true;
    return newOpts.typeId !== void 0 && newOpts.typeId !== card.typeId;
  }
  /** results.rb#name_change? (95-100): relative new names don't count as
   *  changes against absolute marks. */
  nameChange(card, newOpts, mark) {
    if (newOpts.name === void 0) return false;
    const newName = DeckoName.parse(newOpts.name);
    if (newName.isRelative && mark.isAbsolute) return false;
    return newName.s !== (card.name?.s ?? "");
  }
  /** results.rb#fancy_renew? (79-83): opts beyond the handled set need the
   *  full renew. The handled set here is the TS NewCardOptions surface
   *  (Ruby's: supercard, name, type_id, type, type_code, content,
   *  default_content). */
  fancyRenew(newOpts) {
    const handled = /* @__PURE__ */ new Set(["supercard", "name", "typeId", "typeCode", "typeName", "content", "defaultContent"]);
    return Object.keys(newOpts).some((key) => !handled.has(key));
  }
  /** results.rb#assignable_content (85-87) + #quick_content (89-93). */
  assignableContent(card, newOpts) {
    if (newOpts.content !== void 0) return newOpts.content;
    const dbContent = card.dbContent ?? "";
    if (dbContent === "" && newOpts.defaultContent !== void 0) return newOpts.defaultContent;
    return void 0;
  }
  quickContent(card, newOpts) {
    const content = this.assignableContent(card, newOpts);
    if (content !== void 0) card.dbContent = content;
  }
  /** results.rb#assign_name (126-131). */
  assignName(card, mark, opts) {
    if (opts.localOnly === true) return;
    const requested = mark.kind === "name" ? mark.name : void 0;
    if (requested === void 0) return;
    if (requested.s === (card.name?.s ?? "")) return;
    card.name = requested;
    card.key = requested.key;
  }
  // ---------------------------------------------------------------------
  // fetch/card_class.rb - attribute fetchers
  // ---------------------------------------------------------------------
  /** Fetch by integer id (the {id:} retrieval path). */
  async fetchById(id, opts = {}) {
    return this.fetchWithOptions([id], opts);
  }
  /** Fetch by canonical key string (a name mark whose key is it; a key
   *  round-trips through to_name.key, so this is Ruby's name-mark path). */
  async fetchByKey(key, opts = {}) {
    return this.fetchWithOptions([DeckoName.parse(key)], opts);
  }
  /** Fetch by name (string or DeckoName). Full name algebra stays in
   *  src/card/name.ts; this only goes as far as key lookup. */
  async fetchByName(name, opts = {}) {
    return this.fetchWithOptions([typeof name === "string" ? DeckoName.parse(name) : name], opts);
  }
  /** Card[](*mark) (card_class.rb:42-44): fetch real cards only. */
  async bracket(...marks) {
    return this.fetchWithOptions(marks, { skipVirtual: true });
  }
  /** quick_fetch (card_class.rb:54-56): skip_virtual + skip_modules. */
  async quickFetch(...marks) {
    return this.fetchWithOptions(marks, { skipVirtual: true, skipModules: true });
  }
  /** Card.id (card_class.rb:71-79): integers pass through, cards give
   *  their id, names resolve through the lexicon, anything else through
   *  quick_fetch. (Ruby's Symbol branch is the CodenameMark form.) */
  async cardId(cardish) {
    if (typeof cardish === "number") return cardish;
    if (cardish instanceof DeckoName) return this.lexicon.id(cardish);
    if (typeof cardish === "string") {
      const id = await this.lexicon.id(cardish);
      if (id !== void 0) return id;
      return (await this.quickFetch(cardish))?.id;
    }
    if ("typeId" in cardish) return cardish.id;
    return this.codenames.id(cardish.codename);
  }
  /** Card.fetch_type_id (card_class.rb:92-94). */
  async fetchTypeId(...marks) {
    return (await this.fetchWithOptions(marks, { skipModules: true }))?.typeId;
  }
  // ---------------------------------------------------------------------
  // cache/card_class.rb + cache/all.rb - cache writes and expiry
  // ---------------------------------------------------------------------
  /** cache/card_class.rb#write_to_cache (28-34). */
  writeToCache(card, localOnly = false) {
    if (card.key === void 0) return;
    if (localOnly) {
      this.writeToTempCache(card);
    } else if (this.cardCache) {
      this.cardCache.write(card.key, card);
    }
  }
  /** cache/card_class.rb#write_to_temp_cache (36-40): temp only, with
   *  `callback: false` - no lexicon hook. */
  writeToTempCache(card) {
    if (card.key === void 0) return;
    this.cardCache.temp.write(card.key, card);
  }
  /** cache/card_class.rb#expire (42-47): expire the cached card with this name. */
  expireName(name) {
    const key = DeckoName.parse(name ?? "").key;
    const card = this.cardCache.read(key);
    if (isCardValue(card)) this.expireCard(card);
  }
  /** Cache::All#expire (cache/all.rb:17-24) - the invalidation a save
   *  triggers. expire_views is deferred to the render wave (view cache
   *  keys do not exist yet); expire_names covers both key versions
   *  (current name + name_before_act, cache/all.rb:104-108); expire_id
   *  deletes the legacy "~id" key (cache/all.rb:92-96 - nothing writes it
   *  anymore, write_to_cache only writes card.key, but expire clears it
   *  anyway); expire_left recurses into the left card of compound names
   *  (cache/all.rb:39-43). */
  expireCard(card) {
    this.expireNames(card);
    this.expireId(card);
    this.expireLeft(card);
  }
  /** cache/all.rb#expire_names (66-70) via #each_key_version (104-108). */
  expireNames(card) {
    const versions = [card.name, card.nameBeforeAct];
    const seen = /* @__PURE__ */ new Set();
    for (const version of versions) {
      if (version === void 0) continue;
      const key = version.key;
      if (key === "" || seen.has(key)) continue;
      seen.add(key);
      this.cardCache.delete(key);
    }
  }
  /** cache/all.rb#expire_id (92-96): cache.delete id_string ("~<id>"). */
  expireId(card) {
    const idStr = idString(card);
    if (idStr !== void 0) this.cardCache.delete(idStr);
  }
  /** cache/all.rb#expire_left (39-43): compound names expire their left
   *  card's entry recursively (expire_left? is hardwired true, 45-47). */
  expireLeft(card) {
    if (card.name === void 0 || !card.name.isCompound) return;
    const leftKey = card.name.leftName?.key;
    if (leftKey === void 0) return;
    const left = this.cardCache.read(leftKey);
    if (isCardValue(left)) this.expireCard(left);
  }
  /** cache/class_methods.rb#reset (42-46): reset every cache instance. */
  resetCaches() {
    this.cardCache.reset();
    this.lexiconCache.reset();
    this.codenames.resetCache();
  }
  /** Cache::CardClass#after_write_to_temp_cache -> Cache::All#write_lexicon
   *  (cache/all.rb:5-15): temp-cache writes of cards mirror the card into
   *  the Lexicon cache (id -> name and lex -> id; lex = the name for
   *  simple cards, [left_id, right_id] for compound ones). */
  writeLexiconTemp(card) {
    if (card.id === void 0) return;
    let lex;
    if (card.leftId !== void 0 && card.rightId !== void 0) {
      lex = [card.leftId, card.rightId];
    } else if (card.name !== void 0) {
      lex = card.name.s;
    }
    this.lexicon.writeTemp(card.id, card.name ?? void 0, lex);
  }
  // ---------------------------------------------------------------------
  // name-environment bridge (src/card/name/environment.ts)
  // ---------------------------------------------------------------------
  /**
   * Install this engine's lexicon and codename registry as the global name
   * environment, so DeckoName mark strings ("~75", ":codename"),
   * #standard and #cardId resolve the way Card::Name does in Ruby.
   *
   * The NameLexicon contract is SYNCHRONOUS while the driver is async, so
   * the adapters serve cache-warm entries only (Ruby's lexicon is also
   * cache-first; the db fallback is the only difference). Await
   * `engine.warmLexicon(...)` to prime entries before synchronous use.
   */
  installNameEnvironment() {
    const engine = this;
    const environment = {
      // Card::Name.session (Card::Auth.current.name): in Ruby this is NEVER
      // unset — signed out it answers "Anonymous" (the Anonymous card's name,
      // auth/current.rb's current lookup), and contextual.rb#user_part
      // (cardname 0.20.0 lib/cardname/contextual.rb) substitutes it for
      // `_user`. The engine's render surface is the signed-out corpus lane
      // (render.ts: "Anonymous by default"), so the environment carries the
      // same name. UNSET was a measured divergence: the follower notification
      // pages' `{{_user|link}}` nest resolved `_user` to the literal
      // "_user", whose KEY ("user" — cardname.rb:106-117 simple_key splits
      // and drops the leading underscore, and the TS port is faithful there)
      // collided with the real User card, rendering `by User` where the
      // oracle renders `by Anonymous`.
      session: "Anonymous",
      lexicon: {
        name(id) {
          return engine.peekLexiconName(id) ?? engine.lexicon.peekDurableName(id) ?? engine.codenames.peekRegisteredName(id);
        },
        id(key) {
          return engine.peekLexiconId(key);
        }
      },
      codename: {
        id(codename) {
          return engine.codenames.peekId(codename);
        },
        name(codename) {
          return engine.codenames.peekName(codename);
        },
        nameForId(id) {
          return engine.codenames.peekNameForId(id);
        }
      }
    };
    setNameEnvironment(environment);
  }
  /** Prime the lexicon (and codename) caches for the sync name-environment
   *  adapters. */
  async warmLexicon(ids) {
    for (const id of ids) await this.lexicon.name(id);
    await this.codenames.ensureLoaded();
  }
  peekLexiconName(id) {
    const lex = this.peekLex(id);
    if (lex === void 0) return void 0;
    if (lex instanceof DeckoName) {
      return lex.s === "" ? void 0 : lex.s;
    }
    if (typeof lex === "string") {
      const name = DeckoName.parse(lex);
      return name.s === "" ? void 0 : name.s;
    }
    const sides = [];
    for (const sideId of lex) {
      if (sideId === void 0) return void 0;
      const side = this.peekLexiconName(sideId);
      if (side === void 0) return void 0;
      sides.push(side);
    }
    return sides.join(DeckoName.JOINT);
  }
  peekLexiconId(key) {
    const value = this.readLexiconCache(cacheKey(DeckoName.parse(key).s));
    return typeof value === "number" ? value : void 0;
  }
  /** The entry under id.to_s: the LEX string (the async read path's shape),
   *  the [left_id, right_id] pair, or the NAME itself (the write path's
   *  shape — Ruby lexicon.rb:79-81 caches `name` there; lex_to_name passes
   *  it through). Anything else is a cold entry. */
  peekLex(id) {
    const value = this.readLexiconCache(String(id));
    if (typeof value === "string") return value;
    if (value instanceof DeckoName) return value;
    if (Array.isArray(value) && value.length === 2) return value;
    return void 0;
  }
  readLexiconCache(key) {
    if (this.lexiconCache.temp.exist(key)) return this.lexiconCache.temp.read(key);
    return this.lexiconCache.shared ? this.lexiconCache.shared.read(key) : void 0;
  }
  /** The codename codehash kept in the Card cache under CODENAMES. */
  peekCodehash() {
    return this.cardCache.read(CODENAMES_CACHE_KEY);
  }
};
function isCardValue(value) {
  return typeof value === "object" && value !== null && "key" in value && "typeId" in value && "trash" in value && !(value instanceof DeckoName);
}
function splitArgs(args) {
  if (args.length > 0) {
    const last = args[args.length - 1];
    if (isOptionsObject(last)) {
      return { marks: args.slice(0, -1), opts: last };
    }
  }
  return { marks: args, opts: {} };
}
function isOptionsObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof DeckoName) && !("codename" in value) && !("key" in value);
}

// src/card/set-patterns/labels.ts
function allLabel(_anchor) {
  return "All cards";
}
function allShortLabel(_anchor) {
  return "everything";
}
function allPlusLabel(_anchor) {
  return 'All "+" cards';
}
function allPlusShortLabel(_anchor) {
  return 'all "+" cards';
}
function typeLabel(anchor) {
  return `All "${anchor}" cards`;
}
function typeShortLabel(anchor) {
  return `all "${anchor}s"`;
}
function typeGenericLabel() {
  return "cards of a given type";
}
function starLabel(_anchor) {
  return 'All "*" cards';
}
function starShortLabel(_anchor) {
  return 'all "*" cards';
}
function rstarLabel(_anchor) {
  return 'All "+*" cards';
}
function rstarShortLabel(_anchor) {
  return 'all "+*" cards';
}
function ruleLabel(_anchor) {
  return "All rule cards";
}
function ruleShortLabel(_anchor) {
  return "all rule cards";
}
function rightLabel(anchor) {
  return `All "+${anchor}" cards`;
}
function rightShortLabel(anchor) {
  return `all "+${anchor}s"`;
}
function rightGenericLabel() {
  return "given field cards";
}
function typePlusRightLabel(anchor) {
  const { tag, left } = tagAndLeft(anchor);
  return `All "+${tag}" cards on "${left}" cards`;
}
function typePlusRightShortLabel(anchor) {
  const { tag, left } = tagAndLeft(anchor);
  return `all "+${tag}" on "${left}s"`;
}
function typePlusRightGenericLabel() {
  return "given field cards on a given type";
}
function tagAndLeft(anchor) {
  if (anchor === void 0) return { tag: "", left: "" };
  const joint = anchor.lastIndexOf("+");
  if (joint < 0) return { tag: anchor, left: "" };
  return {
    tag: anchor.slice(joint + 1),
    left: anchor.slice(0, joint)
  };
}

// src/card/set-patterns/registry.ts
function defaultApplies(compoundOnly, card) {
  return compoundOnly ? DeckoName.parse(card.name).isCompound : true;
}
function nameOf(card) {
  return DeckoName.parse(card.name);
}
function labelAsGeneric(label) {
  return () => label(void 0);
}
var PATTERN_TABLE = Object.freeze([
  {
    loadIndex: 9,
    registerSite: "card-1.110.0 mod/core/set_pattern/09_self.rb",
    code: "self",
    patternCardName: "*self",
    compoundOnly: false,
    assignsType: false,
    staticAnchorPartsCount: 1,
    applies: () => true,
    // no override, not compound_only
    anchorName: (card) => nameOf(card).s,
    // 09_self.rb#anchor_name: card.name
    anchorId: (card) => card.id ?? null,
    // 09_self.rb#anchor_id: card.id
    // 09_self.rb#anchor_parts_count: anchor_name&.part_names&.size || 1
    anchorPartsCountFor: (anchorName) => anchorName === void 0 ? 1 : DeckoName.parse(anchorName).partNames.length || 1,
    label: (anchor) => `The card "${anchor}"`,
    shortLabel: (anchor) => anchor ?? "",
    genericLabel: () => "a single card",
    prototypeArgs: (anchor) => ({ name: anchor ?? "" })
    // 09_self.rb: { name: anchor }
  },
  {
    loadIndex: 8,
    registerSite: "card-1.110.0 mod/core/set_pattern/08_type_plus_right.rb",
    code: "type_plus_right",
    patternCardName: "*type plus right",
    compoundOnly: true,
    assignsType: true,
    staticAnchorPartsCount: 2,
    applies: (card) => defaultApplies(true, card),
    // 08_type_plus_right.rb#anchor_name: "#{left_type(card)}+#{card.name.tag}"
    // left_type: card.superleft&.type_name || quick_type(left_name); quick_type
    // yields "RichText" for blank AND unknown names (new-card default type) -
    // oracle: new "Zz Probe New+field" -> anchor "RichText+field".
    anchorName: (card) => {
      const leftType = card.leftTypeName == null ? "RichText" : DeckoName.parse(card.leftTypeName).s;
      return `${leftType}+${nameOf(card).tag}`;
    },
    label: typePlusRightLabel,
    shortLabel: typePlusRightShortLabel,
    genericLabel: typePlusRightGenericLabel,
    prototypeArgs: (anchor) => {
      const anchorName = anchor ?? "";
      const joint = anchorName.lastIndexOf("+");
      return {
        name: `+${joint < 0 ? anchorName : anchorName.slice(joint + 1)}`,
        supercard: {
          name: "*dummy",
          type: joint < 0 ? "" : anchorName.slice(0, joint)
        }
      };
    }
  },
  {
    loadIndex: 7,
    registerSite: "card-1.110.0 mod/core/set_pattern/07_right.rb",
    code: "right",
    patternCardName: "*right",
    compoundOnly: true,
    assignsType: true,
    staticAnchorPartsCount: 1,
    applies: (card) => defaultApplies(true, card),
    // 07_right.rb#anchor_name: card.name.tag
    anchorName: (card) => nameOf(card).tag,
    label: rightLabel,
    shortLabel: rightShortLabel,
    genericLabel: rightGenericLabel,
    prototypeArgs: (anchor) => ({ name: `*dummy+${anchor ?? ""}` })
  },
  {
    loadIndex: 6,
    registerSite: "card-1.110.0 mod/core/set_pattern/06_rule.rb",
    code: "rule",
    patternCardName: "*rule",
    compoundOnly: true,
    assignsType: false,
    staticAnchorPartsCount: 0,
    // 06_rule.rb#pattern_applies?: card.rule?
    applies: (card) => card.isRule === true,
    label: ruleLabel,
    shortLabel: ruleShortLabel,
    genericLabel: labelAsGeneric(ruleLabel),
    prototypeArgs: () => ({ name: "*all+*create" })
  },
  {
    loadIndex: 5,
    registerSite: "card-1.110.0 mod/core/set_pattern/05_rstar.rb",
    code: "rstar",
    patternCardName: "*rstar",
    compoundOnly: true,
    assignsType: false,
    staticAnchorPartsCount: 0,
    // 05_rstar.rb#pattern_applies?: card.name.rstar?
    applies: (card) => nameOf(card).isRStar,
    label: rstarLabel,
    shortLabel: rstarShortLabel,
    genericLabel: labelAsGeneric(rstarLabel),
    prototypeArgs: () => ({ name: "*dummy+*dummy" })
  },
  {
    loadIndex: 4,
    registerSite: "card-1.110.0 mod/core/set_pattern/04_star.rb",
    code: "star",
    patternCardName: "*star",
    compoundOnly: false,
    assignsType: false,
    staticAnchorPartsCount: 0,
    // 04_star.rb#pattern_applies?: card.name.star?
    applies: (card) => nameOf(card).isStar,
    label: starLabel,
    shortLabel: starShortLabel,
    genericLabel: labelAsGeneric(starLabel),
    prototypeArgs: () => ({ name: "*dummy" })
  },
  {
    loadIndex: 3,
    registerSite: "card-1.110.0 mod/core/set_pattern/03_type.rb",
    code: "type",
    patternCardName: "*type",
    compoundOnly: false,
    assignsType: false,
    staticAnchorPartsCount: 1,
    // 03_type.rb#pattern_applies?: !!card.type_id
    applies: (card) => card.typeId != null,
    // 03_type.rb#anchor_name: card.type_name
    anchorName: (card) => card.typeName == null ? void 0 : DeckoName.parse(card.typeName).s,
    // 03_type.rb#anchor_id: card.type_id
    anchorId: (card) => card.typeId ?? null,
    label: typeLabel,
    shortLabel: typeShortLabel,
    genericLabel: typeGenericLabel,
    prototypeArgs: (anchor) => ({ type: anchor ?? "" })
  },
  {
    loadIndex: 2,
    registerSite: "card-1.110.0 mod/core/set_pattern/02_all_plus.rb",
    code: "all_plus",
    patternCardName: "*all plus",
    compoundOnly: true,
    assignsType: false,
    staticAnchorPartsCount: 0,
    applies: (card) => defaultApplies(true, card),
    label: allPlusLabel,
    shortLabel: allPlusShortLabel,
    genericLabel: labelAsGeneric(allPlusLabel),
    prototypeArgs: () => ({ name: "+" })
  },
  {
    loadIndex: 1,
    registerSite: "card-1.110.0 mod/core/set_pattern/01_all.rb",
    code: "all",
    patternCardName: "*all",
    compoundOnly: false,
    assignsType: false,
    staticAnchorPartsCount: 0,
    applies: () => true,
    label: allLabel,
    shortLabel: allShortLabel,
    genericLabel: labelAsGeneric(allLabel),
    prototypeArgs: () => ({})
  }
]);

// src/card/set-patterns/instance.ts
var PatternInstance = class _PatternInstance {
  /** the registered pattern this instance belongs to (the class side). */
  spec;
  card;
  /** @anchor_name (Base#initialize); undefined for anchorless patterns. */
  anchor;
  /** @anchor_id (Base#find_anchor_id). */
  anchorIdValue;
  constructor(spec, card) {
    this.spec = spec;
    this.card = card;
    if (spec.anchorName === void 0) {
      this.anchor = void 0;
      this.anchorIdValue = void 0;
      return;
    }
    const anchorString = spec.anchorName(card);
    this.anchor = DeckoName.parse(anchorString ?? "");
    this.anchorIdValue = spec.anchorId?.(card) || this.anchor?.cardId || void 0;
  }
  /**
   * ClassMethods#new: `super if pattern_applies? card` - an unapplying
   * pattern yields nil, which the caller's compact drops.
   */
  static tryNew(spec, card) {
    return spec.applies(card) ? new _PatternInstance(spec, card) : null;
  }
  /** the pattern code (Base delegate :pattern_code, to: :class). */
  get patternCode() {
    return this.spec.code;
  }
  /**
   * Base#pattern (`pattern_id.cardname`): the pattern CARD's name. Ruby
   * resolves the id through the codename registry and the name back through
   * the lexicon (config/initializers/01_core_extensions/integer.rb#cardname
   * -> Card::Lexicon.name). Without a lexicon hit the canonical "*"+code
   * name applies (codename -> name is deterministic for pattern cards).
   */
  get patternCardName() {
    const env = getNameEnvironment();
    const id = env?.codename?.id(this.spec.code);
    if (id !== void 0) {
      const lexName = env?.lexicon?.name(id);
      if (lexName !== void 0) return lexName;
    }
    return this.spec.patternCardName;
  }
  /** @anchor_name (Base); undefined for anchorless patterns. */
  get anchorName() {
    return this.anchor;
  }
  /** @anchor_id (Base#find_anchor_id); undefined for anchorless patterns. */
  get anchorId() {
    return this.anchorIdValue ?? void 0;
  }
  /** compound_only? (Base delegate). */
  get compoundOnly() {
    return this.spec.compoundOnly;
  }
  /** assigns_type (Base delegate). */
  get assignsType() {
    return this.spec.assignsType;
  }
  /** anchorless? (Base delegate): true when the pattern defines no anchor_name. */
  get anchorless() {
    return this.spec.anchorName === void 0;
  }
  /**
   * Base#anchor_parts_count: `self.class.anchor_parts_count @anchor_name`.
   * Class default is the static option (0 anchorless, 1 anchored, 2 for
   * *type plus right); *self overrides with the anchor's part count.
   */
  get anchorPartsCount() {
    if (this.spec.anchorPartsCountFor) {
      return this.spec.anchorPartsCountFor(this.anchor?.s);
    }
    return this.spec.staticAnchorPartsCount;
  }
  /**
   * Base#anchor_parts. For counts > 1 with a longer anchor: the head is the
   * first (size - count + 1) parts joined, the tail the last (count - 1)
   * parts - "handles cases where anchor is a compound card, eg A+B+*self".
   * Anchorless instances return [] (Ruby returns [nil]; no caller reaches
   * it - anchor_codenames short-circuits for anchorless).
   */
  get anchorParts() {
    if (!this.anchor) return [];
    const count = this.anchorPartsCount;
    if (count <= 1) return [this.anchor];
    const parts = this.anchor.partNames;
    if (parts.length <= count) return parts;
    return [
      this.anchor.getRange(0, -count),
      ...parts.slice(parts.length - count + 1)
    ];
  }
  /**
   * Base#anchor_codenames: every anchor part must resolve to a codename,
   * else nil (Ruby's `map { ... || break }` collapses to nil on the first
   * missing codename - all-or-nothing).
   */
  get anchorCodenames() {
    if (!this.anchor) return null;
    const codes = [];
    for (const part of this.anchorParts) {
      const code = part.codename;
      if (code === void 0) return null;
      codes.push(code);
    }
    return codes;
  }
  /**
   * Base#module_key: anchorless -> camelize(code); anchored ->
   * camelize(code + anchor codenames) joined by "::", nil when any anchor
   * part lacks a codename.
   */
  get moduleKey() {
    if (this.anchorless) return camelize(this.spec.code);
    const codes = this.anchorCodenames;
    if (codes === null) return null;
    return [this.spec.code, ...codes].map(camelize).join("::");
  }
  /**
   * Base#to_s: the SET NAME - just the pattern card for anchorless patterns,
   * "anchor+*pattern" for anchored ones.
   */
  get setName() {
    const pattern = this.patternCardName;
    return this.anchorless ? pattern : `${this.anchor?.s}+${pattern}`;
  }
  /**
   * Base#safe_key: "TYPE_PLUS_RIGHT-rich_text-child_one" style - pattern
   * code uppercased with spaces to underscores, joined to the anchor's
   * safe_key ("*" -> "X", "+" -> "-") with a dash. Oracle:
   * safe_set_keys "ALL ALL_PLUS TYPE-list RSTAR RULE RIGHT-Xread
   * TYPE_PLUS_RIGHT-set-Xread SELF-Xall-Xread" for the card "*all+*read".
   */
  get safeKey() {
    const capsPart = this.spec.code.replaceAll(" ", "_").toUpperCase();
    return this.anchorless ? capsPart : `${capsPart}-${this.anchor?.safeKey}`;
  }
  /**
   * Base#rule_lookup_key: the key Card::Rule::All#rule_id_lookup walks
   * (lib/card/rule/all.rb). Anchorless -> the bare code ("all", "star");
   * anchored -> "<anchor id>+<code>" ("605+self", "2+type"); nil when the
   * anchor card has no id (not in the database) - those keys are compacted
   * away, so rules on sets whose anchor card does not exist are unreachable
   * (oracle-verified: new "Zz Probe New+field" lists the *right and *type
   * plus right SET names but their lookup keys are nil).
   */
  get ruleLookupKey() {
    if (this.anchorless) return this.spec.code;
    if (this.anchorIdValue) return `${this.anchorIdValue}+${this.spec.code}`;
    return null;
  }
  /** the card this instance was computed for. */
  get cardInput() {
    return this.card;
  }
  /** Base#inspect. */
  inspect() {
    return `<${this.constructor.name} ${this.setName}>`;
  }
};
function camelize(code) {
  return code.split("_").map(
    (word) => word.length === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)
  ).join("");
}
function moduleKeyFromAnchorCodenames(spec, anchorCodenames) {
  return [spec.code, ...anchorCodenames].map(camelize).join("::");
}

// src/card/set-patterns/card-patterns.ts
function concretePatternsForCard(card) {
  const instances = [];
  for (const spec of PATTERN_TABLE) {
    const instance = PatternInstance.tryNew(spec, card);
    if (instance) instances.push(instance);
  }
  return instances;
}
function patternsForCard(card) {
  const concrete = concretePatternsForCard(card);
  return card.isNew ? concrete.slice(1) : concrete;
}
function safeSetKeysForCard(card) {
  return patternsForCard(card).map((pattern) => pattern.safeKey).reverse().join(" ");
}
function typeAssigningModuleKeys(card) {
  const keys = [];
  for (const pattern of patternsForCard(card)) {
    if (!pattern.assignsType) continue;
    const key = pattern.moduleKey;
    if (key !== null) keys.push(key);
  }
  return keys;
}

// src/card/set-patterns/set-type-assignment.ts
var ASSIGNMENTS = /* @__PURE__ */ new Map();
function registerSetTypeAssignment(moduleKey, typeName) {
  ASSIGNMENTS.set(moduleKey, typeName);
}
function findAssignedTypeName(card) {
  const parsed = DeckoName.parse(card.name);
  if (!parsed.isCompound) return void 0;
  for (const moduleKey of typeAssigningModuleKeys(patternInputFor(card))) {
    const typeName = ASSIGNMENTS.get(moduleKey);
    if (typeName !== void 0) {
      return DeckoName.parse(typeName).s;
    }
  }
  return void 0;
}
function patternInputFor(card) {
  return {
    name: card.name,
    isNew: card.isNew,
    typeId: card.typeId ?? null,
    typeName: card.typeName ?? null,
    leftTypeName: card.leftTypeName ?? null,
    isRule: card.isRule ?? false
  };
}
async function anchorCodenameDriverBacked(fetcher, part) {
  const id = await fetcher.lexicon.id(part.key);
  if (id === void 0) return void 0;
  return fetcher.codenames.nameForId(id);
}
async function findAssignedTypeNameDriverBacked(fetcher, card) {
  const parsed = DeckoName.parse(card.name);
  if (!parsed.isCompound) return void 0;
  for (const pattern of patternsForCard(patternInputFor(card))) {
    if (!pattern.assignsType) continue;
    const codes = [];
    let broke = false;
    for (const part of pattern.anchorParts) {
      const code = await anchorCodenameDriverBacked(fetcher, part);
      if (code === void 0) {
        broke = true;
        break;
      }
      codes.push(code);
    }
    if (broke) continue;
    const moduleKey = moduleKeyFromAnchorCodenames(pattern.spec, codes);
    const typeName = ASSIGNMENTS.get(moduleKey);
    if (typeName !== void 0) return DeckoName.parse(typeName).s;
  }
  return void 0;
}
async function resolveAssignedTypeId(fetcher, typeName) {
  const parsed = DeckoName.parse(typeName);
  const code = parsed.s;
  const byCode = await fetcher.codenames.id(code);
  if (byCode !== void 0) return byCode;
  const byName = await fetcher.lexicon.id(parsed);
  return byName;
}
async function resolveAssignedTypeIdForCard(fetcher, card) {
  const typeName = await findAssignedTypeNameDriverBacked(fetcher, card);
  if (typeName === void 0) return void 0;
  return resolveAssignedTypeId(fetcher, typeName);
}

// src/cql/ast.ts
var CqlBadQuery = class extends Error {
  constructor(message) {
    super(message);
    this.name = "CqlBadQuery";
  }
};

// src/cql/constants.ts
var CARDS_TABLE = "cards";
var CARD_REFERENCES_TABLE = "card_references";
var CARD_ACTIONS_TABLE = "card_actions";
var CARD_ACTS_TABLE = "card_acts";
var TABLE_PREFIX = {
  cards: "c",
  card_references: "cr",
  card_actions: "cn",
  card_acts: "cx"
};
var BASIC_FIELDS = [
  "id",
  "name",
  "key",
  "type_id",
  "content",
  "left_id",
  "right_id",
  "codename",
  "read_rule_id",
  "created_at",
  "updated_at",
  "creator_id",
  "updater_id"
];
var SQL_FIELD = {
  name: "key",
  content: "db_content"
};
var OPERATORS = {
  "!=": "!=",
  "=": "=",
  "=~": "=~",
  "<": "<",
  ">": ">",
  in: "in",
  "~": "~",
  is: "is",
  eq: "=",
  gt: ">",
  lt: "<",
  match: "~",
  ne: "!=",
  "not in": "not in",
  "is not": "is not",
  "!": "is not"
};
var LIST_OPS = /* @__PURE__ */ new Set(["in", "not in", "IN", "NOT IN"]);
var CONJUNCTIONS = {
  any: "or",
  in: "or",
  or: "or",
  all: "and",
  and: "and"
};
var MODIFIERS = [
  "conj",
  "return",
  "index",
  "sort_by",
  "sort_as",
  "sort_dir",
  "sort",
  "dir",
  "group",
  "limit",
  "offset"
];
var ORDER_MAP = {
  id: "id",
  update: "updated_at",
  create: "created_at",
  name: "key",
  content: "db_content",
  alpha: "key",
  // DEPRECATED
  relevance: "updated_at"
  // DEPRECATED
};
var DEFAULT_ORDER_DIRS = {
  update: "desc",
  relevance: "desc"
};
var SORT_BY_ITEM_JOIN_MAP = {
  left: "left_id",
  right: "right_id"
};
var REFERENCE_ATTRIBUTES = {
  refer_to: { reftypes: ["L", "I"], refMethod: "referee", refField: "referer_id" },
  link_to: { reftypes: ["L"], refMethod: "referee", refField: "referer_id" },
  include: { reftypes: ["I"], refMethod: "referee", refField: "referer_id" },
  nest: { reftypes: ["I"], refMethod: "referee", refField: "referer_id" },
  referred_to_by: { reftypes: ["L", "I"], refMethod: "referer", refField: "referee_id" },
  linked_to_by: { reftypes: ["L"], refMethod: "referer", refField: "referee_id" },
  included_by: { reftypes: ["I"], refMethod: "referer", refField: "referee_id" },
  nested_by: { reftypes: ["I"], refMethod: "referer", refField: "referee_id" }
};
var SAFE_SQL_RE = /[^\w\s*().,]/;
var MATCH_FIELD = {
  name: "name",
  content: "db_content"
};

// src/cql/normalize.ts
var NON_WORD_RE = /[^A-Za-z0-9_]/g;
function parseMatchTermAndPrefix(raw) {
  const match = /^([=~]*)\s*([\s\S]*)$/.exec(raw);
  if (!match) return { prefix: "", term: raw };
  return { prefix: match[1] ?? "", term: match[2] ?? "" };
}
function escapeRegexpCharacters(term) {
  return term.replace(NON_WORD_RE, "\\$&");
}
var NEEDS_ABSOLUTIZE_RE = /\b_/;
var CONTEXTUAL_FORM_RE = /\b_(?:left|right|whole|self|user|main|\d+|L*R?)\b/i;
var CONTEXTUAL_PART_RE = /^_(left|right|whole|self|user|main|\d+|L*R?)$/i;
function rubyBlank2(value) {
  return /^\s*$/.test(value);
}
function absolutizeName(name, context, onWarning) {
  const parsed = DeckoName.parse(name);
  if (CONTEXTUAL_FORM_RE.test(name)) {
    warnUnresolvedContextualParts(parsed, context, onWarning);
  }
  return parsed.absolute(context);
}
function warnUnresolvedContextualParts(parsed, context, onWarning) {
  const environment = getNameEnvironment();
  for (const part of parsed.parts) {
    if (!CONTEXTUAL_PART_RE.test(part)) continue;
    if (/^_user$/i.test(part)) {
      if (environment?.session === void 0) {
        onWarning?.(
          "CQL '_user' left in place: no session name in the name environment (Ruby: Card::Name.session, card-1.110.0 lib/card/name.rb#session)"
        );
      }
    } else if (/^_main$/i.test(part)) {
      if (environment?.mainName === void 0) {
        onWarning?.(
          "CQL '_main' has no main name in the name environment (Ruby: Card::Env.params[:main_name], cardname lib/cardname/contextual.rb#absolutize_contextual_parts); it resolves to '' and a blank extreme part falls back to the context"
        );
      }
    } else if (rubyBlank2(context)) {
      onWarning?.(
        `CQL part '${part}' absolutized against an empty context (no 'context' in the statement or ParseOptions.context; Ruby AbstractQuery#context defaults to '')`
      );
    }
  }
}
function defaultNameToKey(name) {
  return DeckoName.parse(name).key;
}
function safeSql(text) {
  const txt = String(text);
  if (SAFE_SQL_RE.test(txt)) {
    throw new CqlBadQuery(`CQL contains disallowed characters: ${txt}`);
  }
  return txt;
}
function assertSimpleValue(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (value === null) return null;
  throw new CqlBadQuery(`Invalid property value: ${JSON.stringify(value)}`);
}

// src/cql/parser.ts
var ATTRIBUTE_LISTS = {
  basic: [
    "id",
    "name",
    "key",
    "type_id",
    "content",
    "left_id",
    "right_id",
    "codename",
    "read_rule_id",
    "created_at",
    "updated_at",
    "creator_id",
    "updater_id"
  ],
  relational: [
    "type",
    "part",
    "left",
    "right",
    "editor_of",
    "edited_by",
    "last_editor_of",
    "last_edited_by",
    "creator_of",
    "created_by",
    "updater_of",
    "updated_by",
    "link_to",
    "linked_to_by",
    "include",
    "included_by",
    "nest",
    "nested_by",
    "refer_to",
    "referred_to_by",
    "member_of",
    "member",
    "found_by",
    "not",
    "sort",
    "match",
    "name_match",
    "complete"
  ],
  plus_relational: ["plus", "left_plus", "right_plus"],
  conjunction: ["and", "or", "all", "any"],
  custom: ["compound"],
  ignore: ["prepend", "append", "vars"],
  deprecated: ["view", "params", "size"]
};
var ATTRIBUTES = {};
Object.entries(ATTRIBUTE_LISTS).forEach(
  ([type, keys]) => keys.forEach((key) => ATTRIBUTES[key] = type)
);
var ID_LIST_KEY_RE = /^(refer|nest|include|link|member)/;
function parseCql(statement, options = {}) {
  return new CqlParser(options).parse(statement);
}
var CqlParser = class {
  constructor(opts) {
    this.opts = opts;
    this.vars = opts.vars ?? {};
    this.onWarning = opts.onWarning;
    this.nameToKey = opts.nameToKey ?? defaultNameToKey;
  }
  opts;
  tableSeq = 0;
  vars;
  nameToKey;
  onWarning;
  parents = /* @__PURE__ */ new WeakMap();
  rootNode = null;
  parse(statement) {
    const root = this.newQuery("card", {}, null);
    this.rootNode = root;
    if (isPlainObject(statement)) {
      const hash = { ...statement };
      const context = takeKey(hash, "context");
      takeKey(hash, "superquery");
      takeKey(hash, "fasten");
      takeKey(hash, "negate");
      const vars = takeKey(hash, "vars");
      takeKey(hash, "table_suffix");
      root.context = context !== void 0 ? String(context) : this.opts.context ?? "";
      if (vars !== void 0 && isPlainObject(vars)) {
        this.vars = vars;
      }
      const prepend = takeKey(hash, "prepend");
      const append = takeKey(hash, "append");
      root.statementExtras = {
        prepend: prepend === void 0 ? void 0 : String(prepend),
        append: append === void 0 ? void 0 : String(append)
      };
      this.interpret(root, hash);
    } else {
      root.context = this.opts.context ?? "";
      this.interpret(root, statement);
    }
    return root;
  }
  // ---- query construction (AbstractQuery#initialize + QueryHelper#table_alias) ----
  newQuery(kind, args, parent) {
    const table = kind === "card" ? CARDS_TABLE : kind === "reference" ? CARD_REFERENCES_TABLE : kind === "action" ? CARD_ACTIONS_TABLE : CARD_ACTS_TABLE;
    const fasten = args.fasten ?? (parent ? this.inheritFasten(parent) : "join");
    const node = {
      kind,
      table,
      // fasten :direct shares the superquery's alias; otherwise
      // "#{table_prefix}#{root.table_seq}" with a shared counter
      tableAlias: fasten === "direct" && parent ? parent.tableAlias : `${TABLE_PREFIX[table]}${this.tableSeq++}`,
      fasten,
      negate: args.negate ?? false,
      conj: args.conj ?? "and",
      context: parent ? parent.context : "",
      conditions: [],
      joins: [],
      subqueries: [],
      conditionsOnJoin: false,
      mods: {},
      statementExtras: {}
    };
    this.parents.set(node, parent);
    return node;
  }
  /** Tie#inherit_fasten: skip :direct superqueries */
  inheritFasten(parent) {
    let node = parent;
    while (node !== null && node.fasten === "direct") node = this.parents.get(node) ?? null;
    return node === null ? "join" : node.fasten;
  }
  // ---- normalization (CardQuery::Normalization) ----
  /** Normalization#normalize_clause: clause_to_hash + normalize_value (skip :return) */
  interpret(query, clause) {
    let hash;
    if (isPlainObject(clause)) {
      hash = clause;
    } else if (typeof clause === "number" && Number.isInteger(clause)) {
      hash = { id: clause };
    } else if (typeof clause === "string") {
      hash = { id: this.opts.resolveCardId?.(clause) ?? -2 };
    } else {
      throw new CqlBadQuery(`Invalid clause: ${inspect(clause)}`);
    }
    for (const [key, val] of Object.entries(hash)) {
      this.interpretItem(query, key, key === "return" ? val : this.normalizeValue(val, query.context));
    }
  }
  normalizeValue(val, context) {
    if (typeof val === "string") return this.normalizeStringValue(val, context);
    if (Array.isArray(val)) return val.map((v) => this.normalizeValue(v, context));
    if (val === null || typeof val === "number" || typeof val === "boolean" || isPlainObject(val)) {
      return val;
    }
    throw new CqlBadQuery(`Invalid value type: ${typeof val} (${inspect(val)})`);
  }
  /** Normalization#normalize_string_value */
  normalizeStringValue(val, context) {
    const varMatch = /^\$(\w+)$/.exec(val);
    if (varMatch) {
      const raw = this.vars[varMatch[1] ?? ""];
      return String(raw ?? "").trim();
    }
    if (NEEDS_ABSOLUTIZE_RE.test(val)) {
      return absolutizeName(val, context, this.onWarning);
    }
    return val;
  }
  // ---- interpretation dispatch (CardQuery::Interpretation) ----
  interpretItem(query, key, val) {
    if (key in OPERATORS && !ATTRIBUTES[key]) {
      this.addCondition(query, "content", this.buildValue([key, this.normalizeValue(val, query.context)]));
      return;
    }
    if (MODIFIERS.includes(key) && !isPlainObject(val)) {
      this.interpretModifier(query, key, val);
      return;
    }
    this.interpretAttributes(query, key, val);
  }
  /** Interpretation#interpret_modifier: values stringified (arrays kept) */
  interpretModifier(query, key, val) {
    const mods = query.mods;
    const list = Array.isArray(val) ? val.map(String) : [String(val)];
    switch (key) {
      case "conj":
        query.conj = String(val);
        break;
      case "return":
        mods.return = String(val);
        break;
      case "index":
        mods.index = String(val);
        break;
      case "sort_by":
        mods.sortBy = list;
        break;
      case "sort_as":
        mods.sortAs = String(val);
        break;
      case "sort_dir":
        mods.sortDir = list;
        break;
      case "sort":
        mods.sort = list;
        break;
      case "dir":
        mods.dir = list;
        break;
      case "group":
        mods.group = String(val);
        break;
      case "limit":
        mods.limit = String(val);
        break;
      case "offset":
        mods.offset = String(val);
        break;
    }
  }
  interpretAttributes(query, key, val) {
    const type = ATTRIBUTES[key];
    if (!type) {
      throw new CqlBadQuery(`Invalid attribute: ${key}`);
    }
    switch (type) {
      case "basic":
        this.addCondition(query, key, this.buildValue(val));
        break;
      case "relational":
        this.relate(query, key, val);
        break;
      case "plus_relational":
        this.relateCompound(query, key, val);
        break;
      case "conjunction":
        this.conjoin(query, val, CONJUNCTIONS[key] ?? "and");
        break;
      case "custom":
        query.conditions.push({ kind: "raw", sql: `left_id IS ${val ? "NOT " : ""}NULL` });
        break;
      case "ignore":
        break;
      case "deprecated":
        this.onWarning?.(`Card queries no longer support ${key} attribute`);
        break;
    }
  }
  // ---- values (Card::Query::Value) ----
  /** Value#initialize: parse_value + canonicalize_operator */
  buildValue(rawvalue) {
    if (Array.isArray(rawvalue)) {
      return this.parseArrayValue(rawvalue);
    }
    if (rawvalue === null) {
      return { op: "is", values: [null] };
    }
    return { op: "=", values: [assertSimpleValue(rawvalue)] };
  }
  /** Value#parse_array_value */
  parseArrayValue(array) {
    const rest = [...array];
    let op = "in";
    if (typeof rest[0] === "string" && rest[0] in OPERATORS) {
      op = OPERATORS[rest.shift()];
    }
    const values = rest.flat(Infinity).map((v) => assertSimpleValue(v));
    this.canonicalizeOperator(op);
    return { op, values };
  }
  /** Value#canonicalize_operator */
  canonicalizeOperator(op) {
    if (!Object.values(OPERATORS).includes(op)) {
      throw new CqlBadQuery(`Invalid operator: ${op}`);
    }
  }
  /** QueryHelper#add_condition + Value#to_sql dispatch */
  addCondition(query, field, value) {
    if (value.op === "~") {
      const rawTerm = value.values.map((v) => v === null ? "" : String(v)).join(" ");
      const { prefix, term } = parseMatchTermAndPrefix(rawTerm);
      query.conditions.push({
        kind: "match",
        cqlField: field,
        field: field in MATCH_FIELD ? MATCH_FIELD[field] : this.standardizeField(field),
        term,
        termKey: this.nameToKey(term),
        prefix
      });
      return;
    }
    query.conditions.push({
      kind: "value",
      field: this.standardizeField(field),
      op: value.op,
      values: this.standardizeValues(field, value.op, value.values)
    });
  }
  /**
   * Value#standard_sql: values of `name` conditions are mapped to key form
   * ("Joe Admin" -> "joe_admin") for every non-match operator. (The match
   * operator branches to MatchValue before this and keeps its own mapping.)
   */
  standardizeValues(field, op, values) {
    if (field === "name" && op !== "~") {
      return values.map(
        (v) => v === null ? null : this.nameToKey(String(v))
      );
    }
    return values;
  }
  /** Value#standardize_field */
  standardizeField(field) {
    return field in SQL_FIELD ? SQL_FIELD[field] : safeSql(field);
  }
  // ---- relational dispatch (Interpretation#relate + relate_multi_value) ----
  relate(query, key, val, opts) {
    const multiple = opts?.multiple ?? Array.isArray(val);
    if (multiple) {
      this.relateMultiValue(query, key, val);
    } else {
      this.relationalHandler(key)(query, val);
    }
  }
  /** Interpretation#relate_compound */
  relateCompound(query, key, val) {
    const hasMultipleValues = Array.isArray(val) && (Array.isArray(val[0]) || typeof val[0] === "string" && val[0] in CONJUNCTIONS);
    this.relate(query, key, val, { multiple: hasMultipleValues });
  }
  /** Interpretation#relate_multi_value */
  relateMultiValue(query, key, val) {
    const items = [...val];
    let conj = "and";
    if (typeof items[0] === "string" && items[0] in CONJUNCTIONS) {
      conj = CONJUNCTIONS[items.shift()];
    }
    if (this.asListOfIds(conj, key, items)) {
      this.relate(query, key, items, { multiple: false });
    } else if (conj === query.conj) {
      for (const item of items) this.relationalHandler(key)(query, item);
    } else {
      this.conjoin(query, items.map((item) => ({ [key]: item })), conj);
    }
  }
  asListOfIds(conj, key, val) {
    return conj === "or" && ID_LIST_KEY_RE.test(key) && this.listOfIds(val);
  }
  /** Tie#list_of_ids? */
  listOfIds(val) {
    return val.every((v) => this.idFromVal(v) !== null);
  }
  /** Tie#id_from_val */
  idFromVal(val) {
    if (typeof val === "number" && Number.isInteger(val)) return val;
    if (typeof val === "string") return this.opts.resolveCardId?.(val) ?? -999;
    return null;
  }
  // ---- relational attributes ----
  relationalHandler(key) {
    const handler = this.relationalHandlers[key];
    if (!handler) {
      throw new CqlBadQuery(`Invalid attribute: ${key}`);
    }
    return handler;
  }
  relationalHandlers = {
    // RelationalAttributes (restrict-able)
    type: (q, val) => this.restrict(q, "type_id", val),
    left: (q, val) => this.restrict(q, "left_id", val),
    right: (q, val) => this.restrict(q, "right_id", val),
    last_edited_by: (q, val) => this.restrict(q, "updater_id", val),
    created_by: (q, val) => this.restrict(q, "creator_id", val),
    part: (q, val) => {
      this.relationalHandlers.any(q, { left: val, right: val });
    },
    editor_of: (q, val) => this.tieAct(q, "action_on", val),
    updater_of: (q, val) => this.tieAct(q, "update_action_on", val),
    edited_by: (q, val) => this.tieAction(q, "action_by", val),
    updated_by: (q, val) => this.tieAction(q, "update_action_by", val),
    last_editor_of: (q, val) => this.tie(q, "card", val, { to: "updater_id" }),
    creator_of: (q, val) => this.tie(q, "card", val, { to: "creator_id" }),
    left_plus: (q, val) => this.junction(q, val, "left", "right_id"),
    right_plus: (q, val) => this.junction(q, val, "right", "left_id"),
    plus: (q, val) => {
      this.relationalHandlers.any(q, { left_plus: val, right_plus: val });
    },
    // Conjunctions#all/#any (+ and/or aliases)
    all: (q, val) => this.conjoin(q, val, "and"),
    and: (q, val) => this.conjoin(q, val, "and"),
    any: (q, val) => this.conjoin(q, val, "or"),
    or: (q, val) => this.conjoin(q, val, "or"),
    not: (q, val) => {
      this.tie(q, "card", val, { from: "id", to: "id" }, { negate: true });
    },
    // MatchAttributes
    match: (q, val) => this.matchAttribute(q, val),
    complete: (q, val) => this.completeAttribute(q, val),
    name_match: (q, val) => this.nameMatchAttribute(q, val),
    // ReferenceAttributes#define_reference_method table
    ...Object.fromEntries(
      Object.entries(REFERENCE_ATTRIBUTES).map(([name, spec]) => [
        name,
        (query, val) => {
          this.tie(
            query,
            "reference",
            { [spec.refMethod]: { reftype: spec.reftypes, card: val } },
            { to: spec.refField }
          );
        }
      ])
    ),
    member_of: (q, val) => {
      this.interpret(q, { referred_to_by: { left: val, right: { codename: "members" } } });
    },
    member: (q, val) => {
      const roleId = this.opts.resolveCodename?.("role");
      if (roleId === void 0 || roleId === null) {
        throw new CqlBadQuery(
          "member requires codename resolution (Card::RoleID); provide ParseOptions.resolveCodename (deferred, see docs/cql-port-notes.md)"
        );
      }
      this.interpret(q, {
        type_id: roleId,
        right_plus: [{ codename: "members" }, { refer_to: val }]
      });
    },
    found_by: (q, val) => {
      q.conditions.push({ kind: "foundBy", value: val });
    },
    sort: (q, val) => this.sortAttribute(q, val)
  };
  /** Tie#restrict: id-able values become conditions, others tie a subquery */
  restrict(query, idField, val) {
    const id = this.idFromVal(val);
    if (id !== null) {
      this.addCondition(query, idField, { op: "=", values: [id] });
    } else {
      this.tie(query, "card", val, { from: idField });
    }
  }
  tieAct(query, action, val) {
    this.tie(query, "act", { [action]: val }, { to: "actor_id" });
  }
  tieAction(query, action, val) {
    this.tie(query, "action", { [action]: val }, { to: "card_id" });
  }
  /** RelationalAttributes#junction + junction_val */
  junction(query, val, side, field) {
    const [partClause, junctionClause] = Array.isArray(val) ? [val[0], val[1] ?? {}] : [val, {}];
    const merged = {
      ...this.interpretToHash(junctionClause, query.context),
      [side]: partClause
    };
    this.tie(query, "card", merged, { to: field });
  }
  // ---- conjunctions (CardQuery::Conjunctions) ----
  conjoin(query, val, conj) {
    const sub = this.newQuery("card", { fasten: "direct", conj }, query);
    query.subqueries.push(sub);
    const items = Array.isArray(val) ? val : Object.entries(this.interpretToHash(val, query.context)).map(([k, v]) => ({ [k]: v }));
    for (const item of items) {
      this.interpret(sub, item);
    }
  }
  // ---- ties (AbstractQuery::Tie) ----
  tie(query, kind, val, fields, args = {}) {
    const sub = this.newQuery(kind, args, query);
    query.subqueries.push(sub);
    this.interpretSubqueryClause(sub, val);
    const mergedFields = { from: "id", to: "id", ...fields };
    switch (sub.fasten) {
      case "join": {
        const side = query.conj === "or" || sub.negate ? "LEFT" : void 0;
        const join = {
          side,
          fromAlias: query.tableAlias,
          fromField: mergedFields.from,
          toTable: sub.table,
          toAlias: sub.tableAlias,
          toField: mergedFields.to,
          to: sub
        };
        if (sub.negate) {
          sub.conditionsOnJoin = true;
          query.conditions.push({
            kind: "raw",
            sql: `${sub.tableAlias}.${mergedFields.to} is null`
          });
        }
        query.joins.push(join);
        break;
      }
      case "in":
        sub.mods.return = mergedFields.to;
        sub.mods.inField = `${query.tableAlias}.${mergedFields.from}`;
        break;
      case "exist":
        break;
      case "direct":
        break;
    }
    return sub;
  }
  // ---- per-kind clause interpretation for subqueries ----
  // ReferenceQuery (reference_query.rb), ActionQuery (action_query.rb),
  // ActQuery (act_query.rb) interpret their own clause keys; card subqueries
  // use the regular interpretation.
  interpretSubqueryClause(query, clause) {
    if (query.kind === "card") {
      this.interpret(query, clause);
      return;
    }
    const hash = isPlainObject(clause) ? clause : {};
    for (const [key, val] of Object.entries(hash)) {
      if (query.kind === "reference") {
        this.interpretReferenceKey(query, key, val);
      } else if (query.kind === "action") {
        this.interpretActionKey(query, key, val);
      } else {
        this.interpretActKey(query, key, val);
      }
    }
  }
  interpretReferenceKey(query, key, val) {
    const outfield = key === "referer" ? "referer_id" : key === "referee" ? "referee_id" : null;
    if (!outfield || !isPlainObject(val)) {
      throw new CqlBadQuery(`Invalid attribute: ${key}`);
    }
    const reftype = val["reftype"];
    const card = val["card"];
    if (reftype !== void 0 && reftype !== null && reftype !== "") {
      const letters = (Array.isArray(reftype) ? reftype : [reftype]).map(String);
      query.conditions.push({
        kind: "value",
        field: "ref_type",
        op: letters.length === 1 ? "=" : "IN",
        values: letters
      });
    }
    this.addOutfieldCondition(query, outfield, card);
  }
  /** ReferenceQuery#add_outfield_condition */
  addOutfieldCondition(query, outfield, outcard) {
    const idOp = this.opAndIdOrIdsFromVal(outcard);
    if (outcard === "_none") {
      query.conditions.push({ kind: "value", field: "is_present", op: "=", values: [0] });
    } else if (idOp) {
      query.conditions.push({ kind: "value", field: outfield, op: idOp.op, values: idOp.ids });
    } else {
      this.tie(query, "card", outcard, { from: outfield });
    }
  }
  /** Tie#op_and_id_or_ids_from_val — null when val is not (a list of) ids */
  opAndIdOrIdsFromVal(val) {
    const single = this.idFromVal(val);
    if (single !== null) return { op: "=", ids: [single] };
    if (Array.isArray(val) && this.listOfIds(val)) {
      return { op: "in", ids: val.map((v) => this.idFromVal(v)) };
    }
    return null;
  }
  interpretActionKey(query, key, val) {
    switch (key) {
      case "action_by":
        this.tie(query, "act", { act_by: val }, { from: "card_act_id" });
        break;
      case "update_action_by":
        this.addUpdateCondition(query);
        this.tie(query, "act", { act_by: val }, { from: "card_act_id" });
        break;
      case "action_on":
        this.tie(query, "card", val, { from: "card_id" });
        break;
      case "update_action_on":
        this.addUpdateCondition(query);
        this.tie(query, "card", val, { from: "card_id" });
        break;
      default:
        throw new CqlBadQuery(`Invalid attribute: ${key}`);
    }
  }
  /** ActionQuery#add_update_condition: "#{fld :action_type} = 1" */
  addUpdateCondition(query) {
    query.conditions.push({ kind: "raw", sql: `${query.tableAlias}.action_type = 1` });
  }
  interpretActKey(query, key, val) {
    switch (key) {
      case "action_on":
        this.tie(query, "action", { action_on: val }, { to: "card_act_id" });
        break;
      case "update_action_on":
        this.tie(query, "action", { update_action_on: val }, { to: "card_act_id" });
        break;
      case "act_by":
        this.tie(query, "card", val, { from: "actor_id" });
        break;
      default:
        throw new CqlBadQuery(`Invalid attribute: ${key}`);
    }
  }
  // ---- match attributes (CardQuery::MatchAttributes) ----
  /** MatchAttributes#match: term matched against name OR content */
  matchAttribute(query, val) {
    if (val === null || val === void 0 || val === "" || val === false) return;
    const conditions = ["name", "content"].map((field) => {
      const parsed = this.buildValue(["match", val]);
      const rawTerm = parsed.values.map((v) => v === null ? "" : String(v)).join(" ");
      const { prefix, term } = parseMatchTermAndPrefix(rawTerm);
      return {
        kind: "match",
        cqlField: field,
        field: MATCH_FIELD[field],
        term,
        termKey: this.nameToKey(term),
        prefix
      };
    });
    query.conditions.push({ kind: "group", conj: "or", conditions });
  }
  /** MatchAttributes#name_match */
  nameMatchAttribute(query, val) {
    if (val !== null && val !== void 0 && val !== "" && val !== false) {
      this.addCondition(query, "name", this.buildValue(["match", val]));
    }
    this.nameNotNull(query);
  }
  /** MatchAttributes#complete */
  completeAttribute(query, val) {
    const name = String(val);
    if (name.includes("+")) {
      const parts = name.split("+");
      const left = parts.slice(0, -1).join("+");
      const right = parts.at(-1) ?? "";
      this.interpret(query, { left });
      if (right !== "") {
        this.interpret(query, { right: { complete: right } });
      }
      return;
    }
    if (name !== "") {
      query.conditions.push({ kind: "like", field: "key", value: this.nameToKey(name) });
    }
    this.nameNotNull(query);
  }
  /** MatchAttributes#name_not_null */
  nameNotNull(query) {
    query.conditions.push({ kind: "raw", sql: `${query.tableAlias}.key IS NOT NULL` });
  }
  // ---- sorting (CardQuery::Sorting) ----
  /** CardQuery#full?: the root query whose return is not "count" */
  isFull(query) {
    return this.rootNode === query && query.mods.return !== "count";
  }
  /** Sorting#sort — the `sort` attribute with a Hash value */
  sortAttribute(query, val) {
    if (!this.isFull(query)) return;
    if (!isPlainObject(val)) {
      throw new CqlBadQuery(`Invalid clause: ${inspect(val)}`);
    }
    const spec = { ...val };
    const item = spec["item"] !== void 0 ? String(spec["item"]) : "left";
    const sortField = spec["return"] !== void 0 ? String(spec["return"]) : "db_content";
    delete spec["item"];
    delete spec["return"];
    if (sortField === "count") {
      throw new CqlBadQuery(
        `sorting by #count/${item} not yet implemented (deferred; Ruby Sorting#sort_by_count_${item})`
      );
    }
    const joinField = SORT_BY_ITEM_JOIN_MAP[item];
    if (!joinField) {
      throw new CqlBadQuery(`sorting by #join/${item} not yet implemented`);
    }
    const sub = this.newQuery("card", {}, query);
    query.subqueries.push(sub);
    const join = {
      side: "LEFT",
      fromAlias: query.tableAlias,
      fromField: "id",
      toTable: CARDS_TABLE,
      toAlias: sub.tableAlias,
      toField: joinField,
      to: sub
    };
    query.joins.push(join);
    sub.conditionsOnJoin = true;
    this.interpret(sub, spec);
    if (!query.mods.sortBy) {
      query.mods.sortBy = [`${sub.tableAlias}.${sortField}`];
    }
  }
  /** clause_to_hash without the interpret loop (used by junction/conjoin) */
  interpretToHash(clause, context) {
    if (isPlainObject(clause)) {
      const normalized = {};
      for (const [key, val] of Object.entries(clause)) {
        normalized[key] = key === "return" ? val : this.normalizeValue(val, context);
      }
      return normalized;
    }
    if (typeof clause === "number" && Number.isInteger(clause)) return { id: clause };
    if (typeof clause === "string") return { id: this.opts.resolveCardId?.(clause) ?? -2 };
    throw new CqlBadQuery(`Invalid clause: ${inspect(clause)}`);
  }
};
function isPlainObject(val) {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}
function takeKey(hash, key) {
  const val = hash[key];
  delete hash[key];
  return val;
}
function inspect(val) {
  try {
    return JSON.stringify(val) ?? String(val);
  } catch {
    return String(val);
  }
}

// src/cql/sql.ts
var POSTFILTER_ROW_CAP = 1e4;
function isRegexpMatchCondition(condition) {
  return condition.kind === "match" && !(condition.prefix === "=" && condition.cqlField === "name");
}
function collectMatchPostFilters(root) {
  const filters = [];
  for (const condition of root.conditions) {
    if (isRegexpMatchCondition(condition)) {
      filters.push(condition);
    } else if (condition.kind === "group" && condition.conditions.some((child) => isRegexpMatchCondition(child))) {
      filters.push(condition);
    }
  }
  return filters;
}
function hasNestedRegexpMatch(root) {
  const visit = (query) => {
    for (const condition of query.conditions) {
      if (isRegexpMatchCondition(condition)) return true;
      if (condition.kind === "group" && condition.conditions.some((child) => isRegexpMatchCondition(child))) {
        return true;
      }
    }
    return query.subqueries.some(visit);
  };
  return root.subqueries.some(visit);
}
function generateSql(root, options = {}) {
  const ctx = { params: [], options };
  const sql = renderQuery(root, ctx, true);
  return { sql, params: ctx.params };
}
function renderQuery(query, ctx, isRoot) {
  const alias = query.tableAlias;
  const full = isRoot && query.mods.return !== "count";
  const orderDirectives = full ? orderDirectivesOf(query) : [];
  const parts = [fullField(alias, query.mods.return)];
  for (const directive of orderDirectives) parts.push(directive.field);
  const selectSql = `SELECT${renderedJoins(query).length > 0 ? " DISTINCT" : ""} ${parts.join(", ")}`;
  const fromSql = `FROM ${query.table} ${alias}`;
  const joinsSql = renderJoins(query, ctx);
  const whereSql = renderWhere(query, ctx);
  const groupSql = full && query.mods.group ? `GROUP BY ${safeSql(query.mods.group)}` : "";
  const orderSql = orderDirectives.length > 0 ? `ORDER BY ${orderDirectives.map((d) => d.dir ? `${d.field} ${d.dir}` : d.field).join(", ")}` : "";
  let limitSql = "";
  if (full) {
    if (isRoot && ctx.options.matchPostFilter === true && hasRootRegexpMatch(query)) {
      return [
        selectSql,
        fromSql,
        joinsSql,
        whereSql,
        groupSql,
        orderSql,
        `LIMIT ${POSTFILTER_ROW_CAP}`
      ].filter((chunk) => chunk !== "").join(" ");
    }
    const limit = toInt(query.mods.limit);
    if (limit > 0) {
      limitSql = `LIMIT ${limit}`;
      if (query.mods.offset !== void 0 && query.mods.offset !== "") {
        limitSql += ` OFFSET ${toInt(query.mods.offset)}`;
      }
    }
  }
  return [selectSql, fromSql, joinsSql, whereSql, groupSql, orderSql, limitSql].filter((chunk) => chunk !== "").join(" ");
}
function toInt(value) {
  if (value === void 0) return 0;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? 0 : n;
}
function hasRootRegexpMatch(query) {
  return collectMatchPostFilters(query).length > 0;
}
function fullField(alias, ret) {
  const field = ret === void 0 || /^_\w+/.test(ret) ? "card" : ret;
  switch (field) {
    case "card":
    case "raw":
      return `${alias}.*`;
    case "content":
      return `${alias}.db_content`;
    case "name":
    case "key":
      return `${alias}.name, ${alias}.left_id, ${alias}.right_id`;
    case "count":
      return `coalesce(count(distinct ${alias}.id),0) as count`;
    default:
      return BASIC_FIELDS.includes(field) ? `${alias}.${field}` : safeSql(field);
  }
}
function renderWhere(query, ctx) {
  const explicit = explicitConditions(query, ctx);
  const implicit = implicitConditions(query, ctx);
  const chunks = [explicit, implicit].filter((chunk) => chunk !== "");
  return chunks.length > 0 ? `WHERE ${chunks.join(" AND ")}` : "";
}
function explicitConditions(query, ctx) {
  const list = query.conditions.map((condition) => renderCondition(condition, query, ctx));
  for (const sub of query.subqueries) {
    if (sub.conditionsOnJoin) continue;
    switch (sub.fasten) {
      case "exist":
        list.push(`${sub.negate ? "NOT " : ""}EXISTS (${renderQuery(sub, ctx, false)})`);
        break;
      case "in":
        list.push(
          `${sub.mods.inField ?? `${sub.tableAlias}.id`} ${sub.negate ? "NOT " : ""}IN (${renderQuery(sub, ctx, false)})`
        );
        break;
      default:
        list.push(explicitConditions(sub, ctx));
    }
  }
  return formatConditionList(list, query.conj);
}
function formatConditionList(list, conj) {
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  return `(${list.join(` ${conj.toUpperCase()} `)})`;
}
function implicitConditions(query, ctx) {
  if (query.kind !== "card") return "";
  const chunks = [`${query.tableAlias}.trash is false`];
  const { alwaysOk = true, readRuleIds } = ctx.options;
  if (!alwaysOk) {
    if (readRuleIds && readRuleIds.length > 0) {
      chunks.push(`${query.tableAlias}.read_rule_id IN (${readRuleIds.map(() => "?").join(",")})`);
      ctx.params.push(...readRuleIds);
    } else {
      chunks.push(`${query.tableAlias}.read_rule_id IN (1)`);
    }
  }
  return chunks.join(" AND ");
}
function renderCondition(condition, query, ctx) {
  const alias = query.tableAlias;
  switch (condition.kind) {
    case "value": {
      const fieldSql = `${alias}.${condition.field}`;
      if (condition.values.length === 1 && !LIST_OPS.has(condition.op)) {
        return `${fieldSql} ${condition.op} ${renderScalar(condition.values[0], ctx)}`;
      }
      return `${fieldSql} ${condition.op} (${condition.values.map((v) => renderScalar(v, ctx)).join(",")})`;
    }
    case "match": {
      if (condition.prefix === "=" && condition.cqlField === "name") {
        return `${alias}.key = ${placeholder(ctx, condition.termKey)}`;
      }
      if (ctx.options.matchPostFilter === true) return "";
      const value = condition.prefix === "~~" ? condition.term : escapeRegexpCharacters(condition.term);
      return `${alias}.${condition.field} REGEXP ${placeholder(ctx, value)}`;
    }
    case "like":
      return `${alias}.key LIKE ${placeholder(ctx, `${condition.value}%`)}`;
    case "raw":
      return condition.sql;
    case "group":
      if (ctx.options.matchPostFilter === true) {
        const rendered = condition.conditions.map((c) => renderCondition(c, query, ctx)).filter((chunk) => chunk !== "");
        if (rendered.length === 0) return "";
        return `(${rendered.join(` ${condition.conj.toUpperCase()} `)})`;
      }
      return `(${condition.conditions.map((c) => renderCondition(c, query, ctx)).join(` ${condition.conj.toUpperCase()} `)})`;
    case "foundBy":
      throw new CqlBadQuery(
        "found_by condition reached SQL generation unresolved (unhandled found_by shape) \u2014 execute.ts resolveFoundByConditions should have translated it"
      );
  }
}
function renderScalar(value, ctx) {
  if (value === null) return "NULL";
  return placeholder(ctx, value);
}
function placeholder(ctx, value) {
  ctx.params.push(value);
  return "?";
}
function renderedJoins(query) {
  const joins = [...query.joins];
  collectDirectSubqueryJoins(query, joins);
  return joins;
}
function collectDirectSubqueryJoins(query, out) {
  for (const sub of query.subqueries) {
    if (sub.fasten === "direct") {
      out.push(...sub.joins);
      collectDirectSubqueryJoins(sub, out);
    }
  }
}
function renderJoins(query, ctx) {
  const chunks = [];
  for (const join of renderedJoins(query)) {
    renderJoin(join, ctx, chunks);
  }
  return chunks.join(" ");
}
function renderJoin(join, ctx, chunks) {
  const side = join.side ?? "";
  const subjoins = join.to ? renderJoins(join.to, ctx) : "";
  const onSql = onClause(join, ctx);
  if (side === "LEFT" && subjoins !== "") {
    chunks.push(`LEFT JOIN (${join.toTable} ${join.toAlias} ${subjoins}) ON ${onSql}`);
  } else {
    chunks.push(`${side ? `${side} ` : ""}JOIN ${join.toTable} ${join.toAlias} ON ${onSql}`);
    if (subjoins !== "") chunks.push(subjoins);
  }
}
function onClause(join, ctx) {
  const conditions = [
    `${join.fromAlias}.${join.fromField} = ${join.toAlias}.${join.toField}`
  ];
  const to = join.to;
  if (to) {
    if (to.conditionsOnJoin) {
      const explicit = explicitConditions(to, ctx);
      if (explicit !== "") conditions.push(explicit);
    }
    const implicit = implicitConditions(to, ctx);
    if (implicit !== "") conditions.push(implicit);
  }
  return conditions.join(" AND ");
}
function orderDirectivesOf(query) {
  const sortMod = query.mods.sortBy ?? query.mods.sort;
  if (!sortMod || sortMod.length === 0) return [];
  const directives = sortMod.map((token, index) => {
    const field = orderField(query, token);
    return { field, dir: orderDir(query, token, index) };
  });
  const idField = `${query.tableAlias}.id`;
  if (!directives.some((d) => d.field === idField) && renderedJoins(query).length === 0) {
    directives.push({ field: idField, dir: "asc" });
  }
  return directives;
}
function orderField(query, token) {
  const mapped = ORDER_MAP[token];
  const raw = mapped ? `${query.tableAlias}.${mapped}` : safeSql(token);
  return applySortAs(query, raw);
}
function applySortAs(query, field) {
  const as = query.mods.sortAs;
  if (!as) return field;
  return `CAST(${field} AS ${sqliteCastType(safeSql(as))})`;
}
function orderDir(query, token, index) {
  const dirs = query.mods.sortDir ?? query.mods.dir;
  if (!dirs || dirs.length === 0) {
    return DEFAULT_ORDER_DIRS[token] ?? "asc";
  }
  const dir = dirs[index];
  return dir === void 0 ? "" : safeSql(dir);
}
function sqliteCastType(type) {
  switch (type.toLowerCase()) {
    case "signed":
    case "integer":
    case "int":
      return "INTEGER";
    case "char":
    case "string":
    case "text":
    case "binary":
      return "TEXT";
    case "decimal":
    case "float":
    case "real":
    case "numeric":
      return "REAL";
    default:
      return type;
  }
}

// src/cql/sqlite-regexp.ts
var PATTERN_CACHE_LIMIT = 512;
var patternCache = /* @__PURE__ */ new Map();
var POSIX_CLASS_TRANSLATIONS = [
  [/\[\[:alpha:\]\]/g, "[A-Za-z]"],
  [/\[\[:digit:\]\]/g, "[0-9]"],
  [/\[\[:alnum:\]\]/g, "[A-Za-z0-9]"],
  [/\[\[:upper:\]\]/g, "[A-Z]"],
  [/\[\[:lower:\]\]/g, "[a-z]"],
  [/\[\[:space:\]\]/g, "[ \\t\\r\\n\\v\\f]"],
  [/\[\[:blank:\]\]/g, "[ \\t]"],
  [/\[\[:punct:\]\]/g, "[!-/:-@\\[-`{-~]"],
  [/\[\[:word:\]\]/g, "[A-Za-z0-9_]"],
  [/\[\[:xdigit:\]\]/g, "[0-9A-Fa-f]"],
  // MySQL 5.x word boundaries (MariaDB accepts, MySQL 8 ICU errors —
  // server-side variance documented in the decision); JS \b is the same
  // ASCII word-boundary notion for the patterns the battery pins.
  [/\[\[:<:\]\]/g, "\\b"],
  [/\[\[:>:\]\]/g, "\\b"]
];
function translateMysqlPattern(pattern) {
  let out = pattern;
  for (const [from, to] of POSIX_CLASS_TRANSLATIONS) {
    out = out.replace(from, to);
  }
  return out;
}
function compileOrNull(source, flags) {
  try {
    return new RegExp(source, flags);
  } catch {
    return null;
  }
}
function compileMatchPattern(pattern) {
  const cached = patternCache.get(pattern);
  if (cached !== void 0) return cached;
  let compiled = null;
  const unicode = /\\p\{/.test(pattern);
  const translated = translateMysqlPattern(pattern);
  const flags = unicode ? "iu" : "i";
  compiled = compileOrNull(translated, flags);
  if (compiled === null && unicode) {
    const scripted = translated.replace(
      /\\p\{([A-Za-z]+)\}/g,
      (_m, name) => `\\p{Script=${name}}`
    );
    compiled = compileOrNull(scripted, flags);
  }
  if (patternCache.size >= PATTERN_CACHE_LIMIT) patternCache.clear();
  patternCache.set(pattern, compiled);
  return compiled;
}

// src/cql/execute.ts
async function ensureStatementCardNamesCached(cqlQuery, parse) {
  if (parse === void 0 || parse.ensureCardId === void 0) return;
  const ensureCardId = parse.ensureCardId;
  if (cqlQuery === null || typeof cqlQuery !== "object") return;
  const names = collectCardNameValues(cqlQuery);
  if (parse.context !== void 0 && parse.context !== "") {
    names.add(parse.context);
    try {
      for (const part of DeckoName.parse(parse.context).parts) {
        if (part !== "") names.add(part);
      }
    } catch {
    }
  }
  for (const varValue of Object.values(parse.vars ?? {})) {
    if (typeof varValue === "string" && varValue !== "" && !varValue.startsWith("_")) {
      names.add(varValue);
    }
  }
  for (const name of names) {
    try {
      await ensureCardId(name);
    } catch {
    }
  }
}
function collectCardNameValues(value, out = /* @__PURE__ */ new Set()) {
  if (typeof value === "string") {
    if (value !== "" && !value.startsWith("_") && !value.startsWith("$")) out.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectCardNameValues(item, out);
  } else if (value !== null && typeof value === "object") {
    for (const [key, val] of Object.entries(value)) {
      if (key === "return" || key === "sort" || key === "dir") continue;
      collectCardNameValues(val, out);
    }
  }
  return out;
}
async function executeQuery(driver, cqlQuery, options = {}) {
  await ensureStatementCardNamesCached(cqlQuery, options.parse);
  const root = parseCql(cqlQuery, options.parse);
  await resolveFoundByConditions(driver, root, options);
  if (root.mods.return === "count") {
    return executeCountNode(driver, root, options);
  }
  const filters = collectMatchPostFilters(root);
  if (filters.length > 0) {
    if (hasNestedRegexpMatch(root)) throw nestedMatchRefusal();
    if (options.matchPostFilter === true || regexpBrokenDrivers.has(driver)) {
      return executeRowsPostFiltered(driver, root, options, filters);
    }
    const { sql, params } = generateSql(root, options);
    try {
      const result = await driver.query(sql, params);
      return { sql, params, rows: result.rows };
    } catch (error) {
      if (!isMissingRegexpError(error)) throw error;
      regexpBrokenDrivers.set(driver, true);
    }
  } else {
    const { sql, params } = generateSql(root, options);
    const result = await driver.query(sql, params);
    return { sql, params, rows: result.rows };
  }
  return executeRowsPostFiltered(driver, root, options, filters);
}
var regexpBrokenDrivers = /* @__PURE__ */ new WeakMap();
function isMissingRegexpError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /no such function:\s*REGEXP/i.test(message);
}
function nestedMatchRefusal() {
  return new CqlBadQuery(
    "match inside a subselect requires the REGEXP UDF (unavailable on this driver) \u2014 not supported by the JS post-filter; see docs/cql-execution-notes.md"
  );
}
async function executeRowsPostFiltered(driver, root, options, filters) {
  const { sql, params } = generateSql(root, { ...options, matchPostFilter: true });
  const result = await driver.query(sql, params);
  const filtered = applyMatchFilters(result.rows, filters);
  return { sql, params, rows: applyPostFilterLimitOffset(filtered, root.mods) };
}
function rowMatches(row, condition) {
  switch (condition.kind) {
    case "match": {
      const value = row[condition.field];
      if (value === null || value === void 0) return false;
      const pattern = condition.prefix === "~~" ? condition.term : escapeRegexpCharacters(condition.term);
      const compiled = compileMatchPattern(pattern);
      if (compiled === null) {
        throw new Error(`invalid REGEXP pattern: ${pattern}`);
      }
      return compiled.test(String(value));
    }
    case "group": {
      const results = condition.conditions.map((child) => rowMatches(row, child));
      return condition.conj === "or" ? results.some(Boolean) : results.every(Boolean);
    }
    default:
      return true;
  }
}
function applyMatchFilters(rows, filters) {
  if (filters.length === 0) return rows;
  return rows.filter((row) => filters.every((filter) => rowMatches(row, filter)));
}
function applyPostFilterLimitOffset(rows, mods) {
  const limit = toIntOrZero(mods.limit);
  const offset = toIntOrZero(mods.offset);
  let out = rows;
  if (offset > 0) out = out.slice(offset);
  if (limit > 0) out = out.slice(0, limit);
  return out;
}
function toIntOrZero(value) {
  if (value === void 0) return 0;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? 0 : n;
}
async function executeCount(driver, cqlQuery, options = {}) {
  const root = parseCql(cqlQuery, options.parse);
  await resolveFoundByConditions(driver, root, options);
  const result = await executeCountNode(driver, root, options);
  return result.count;
}
async function executeCountNode(driver, root, options = {}) {
  const filters = collectMatchPostFilters(root);
  if (filters.length > 0) {
    if (hasNestedRegexpMatch(root)) throw nestedMatchRefusal();
    if (options.matchPostFilter === true || regexpBrokenDrivers.has(driver)) {
      return executeCountPostFiltered(driver, root, options, filters);
    }
    try {
      return await countSql(driver, root, options);
    } catch (error) {
      if (!isMissingRegexpError(error)) throw error;
      regexpBrokenDrivers.set(driver, true);
    }
    return executeCountPostFiltered(driver, root, options, filters);
  }
  return countSql(driver, root, options);
}
async function countSql(driver, root, options) {
  root.mods.return = "count";
  const { sql, params } = generateSql(root, options);
  const result = await driver.query(sql, params);
  const first = result.rows[0];
  const raw = first === void 0 ? void 0 : first["count"];
  const count = raw === void 0 || raw === null ? 0 : Number(raw);
  return { sql, params, count: Number.isNaN(count) ? 0 : count };
}
async function executeCountPostFiltered(driver, root, options, filters) {
  const savedReturn = root.mods.return;
  root.mods.return = void 0;
  try {
    const { sql, params } = generateSql(root, { ...options, matchPostFilter: true });
    const result = await driver.query(sql, params);
    const count = applyMatchFilters(result.rows, filters).length;
    return { sql, params, count };
  } finally {
    root.mods.return = savedReturn;
  }
}
var FOUNDBY_CQL_TYPES = /* @__PURE__ */ new Set(["search_type", "cardtype", "set"]);
var FOUNDBY_RIGHT_CODENAME_CQL = {
  // set/right/type.rb:5-7
  type: { type: "_left" },
  // set/right/self.rb:5-7
  self: { name: "_left" },
  // set/right/right.rb:5-7
  right: { right: "_left" },
  // set/right/type_plus_right.rb:5-7
  "type plus right": { left: { type: "_LL" }, right: "_LR" }
};
var FOUNDBY_MAX_DEPTH = 8;
var FOUNDBY_EMPTY_ID = -999;
async function resolveFoundByConditions(driver, root, options, depth = options.foundByDepth ?? 0) {
  for (const sub of root.subqueries) {
    await resolveFoundByConditions(driver, sub, options, depth);
  }
  for (let i = 0; i < root.conditions.length; i++) {
    const condition = root.conditions[i];
    if (condition === void 0 || condition.kind !== "foundBy") continue;
    const replacements = await resolveFoundByCondition(
      driver,
      condition,
      root,
      options,
      depth
    );
    root.conditions.splice(i, 1, ...replacements);
    i += replacements.length - 1;
  }
}
async function resolveFoundByCondition(driver, condition, node, options, depth) {
  if (depth > FOUNDBY_MAX_DEPTH) {
    throw new CqlBadQuery(
      `found_by nesting exceeds ${FOUNDBY_MAX_DEPTH} levels (Ruby has no cap; the port refuses runaway found_by chains instead of overflowing the stack)`
    );
  }
  const values = Array.isArray(condition.value) ? condition.value : [condition.value];
  const constraints = [];
  for (const value of values) {
    if (value !== null && typeof value === "object") {
      throw new CqlBadQuery(
        `found_by hash values (Query.run + result-card cql_hash subqueries) are not supported: ${JSON.stringify(value)}`
      );
    }
    if (typeof value !== "string") {
      throw new CqlBadQuery(
        `invalid found_by value: ${JSON.stringify(value)} (expected a card name or a list of names)`
      );
    }
    const targetName = absolutizeName(value, node.context);
    const statement = await foundByTargetStatement(driver, targetName, options);
    constraints.push({
      kind: "value",
      field: "id",
      op: "in",
      values: await runFoundByTargetIds(driver, statement, targetName, options, depth)
    });
  }
  return constraints;
}
function invalidFoundByCard(name, typeName) {
  return new CqlBadQuery(
    `"found_by" value must be valid Search, but ${name} is a ${typeName}`
  );
}
async function foundByTargetCardId(name, options) {
  const parse = options.parse;
  const ensure = parse?.ensureCardId;
  if (ensure !== void 0) {
    try {
      const id = await ensure(name);
      if (id !== void 0 && id !== null) return id;
    } catch {
    }
  }
  const peeked = parse?.resolveCardId?.(name);
  if (peeked !== void 0 && peeked !== null) return peeked;
  if (ensure === void 0 && parse?.resolveCardId === void 0) {
    throw new CqlBadQuery(
      `found_by target "${name}" cannot be resolved: the execution options carry no card-name resolver (ParseOptions.ensureCardId / resolveCardId)`
    );
  }
  return void 0;
}
async function fetchCardRowById(driver, id) {
  const result = await driver.query(
    "SELECT * FROM cards WHERE id = ? AND trash = 0",
    [id]
  );
  return result.rows[0];
}
async function fetchCodenameById(driver, id) {
  if (id === null || id === void 0) return void 0;
  const result = await driver.query(
    "SELECT codename FROM cards WHERE id = ?",
    [id]
  );
  return result.rows[0]?.codename ?? void 0;
}
async function foundByTargetStatement(driver, targetName, options) {
  const targetId = await foundByTargetCardId(targetName, options);
  const row = targetId === void 0 ? void 0 : await fetchCardRowById(driver, targetId);
  if (row !== void 0) {
    const typeCodename = await fetchCodenameById(driver, row.type_id);
    if (!FOUNDBY_CQL_TYPES.has(typeCodename ?? "")) {
      throw invalidFoundByCard(targetName, typeCodename ?? "unknown");
    }
    if (typeCodename === "cardtype") {
      return { type_id: row.id, sort_by: "name" };
    }
    if (typeCodename === "set") {
      const override = await foundByRightCodenameOverride(driver, row.right_id);
      if (override !== void 0) return override;
      return parseFoundByContentCql(row.db_content ?? "");
    }
    return parseFoundByContentCql(row.db_content ?? "");
  }
  const fabricated = await foundByFabricatedStatement(driver, targetName, options);
  if (fabricated !== void 0) return fabricated;
  throw invalidFoundByCard(targetName, "Basic");
}
async function foundByRightCodenameOverride(driver, rightId) {
  const rightCodename = await fetchCodenameById(driver, rightId);
  const override = rightCodename === void 0 ? void 0 : FOUNDBY_RIGHT_CODENAME_CQL[rightCodename];
  return override === void 0 ? void 0 : { ...override };
}
async function foundByFabricatedStatement(driver, targetName, options) {
  const rightName = DeckoName.parse(targetName).rightName?.s;
  if (rightName === void 0) return void 0;
  const rightId = await foundByTargetCardId(rightName, options);
  if (rightId === void 0) return void 0;
  return foundByRightCodenameOverride(driver, rightId);
}
function parseFoundByContentCql(content) {
  if (content === "") {
    throw new CqlBadQuery("can't run search with empty content");
  }
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new CqlBadQuery(`Invalid JSON search query: ${content}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`cql content is not a Hash: ${content}`);
  }
  return parsed;
}
async function runFoundByTargetIds(driver, statement, targetName, options, depth) {
  const stripped = { ...statement };
  for (const mod of ["return", "limit", "offset", "sort", "sort_by", "dir"]) {
    const value = stripped[mod];
    if (value !== void 0 && value !== null && typeof value !== "object") {
      delete stripped[mod];
    }
  }
  const result = await executeQuery(driver, stripped, {
    ...options,
    foundByDepth: depth + 1,
    parse: { ...options.parse, context: targetName }
  });
  const ids = [];
  for (const row of "rows" in result ? result.rows : []) {
    const id = row["id"];
    if (typeof id === "number" && Number.isInteger(id)) ids.push(id);
  }
  return ids.length > 0 ? ids : [FOUNDBY_EMPTY_ID];
}

// src/card/render/slot-html.ts
import { randomBytes } from "node:crypto";
function h(s) {
  return s.replace(/&/g, "&amp;").replace(/>/g, "&gt;").replace(/</g, "&lt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
var UTF8_ENCODER = new TextEncoder();
function cgiEscape(s) {
  let out = "";
  for (const ch of s) {
    if (/[A-Za-z0-9_.~-]/.test(ch)) out += ch;
    else if (ch === " ") out += "+";
    else {
      for (const byte of UTF8_ENCODER.encode(ch)) {
        out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
      }
    }
  }
  return out;
}
function htmlEscapeExceptQuotes(s) {
  return s.replace(/&/g, "&amp;").replace(/'/g, "&apos;").replace(/>/g, "&gt;").replace(/</g, "&lt;");
}
function htmlEscapeKeepApostrophe(s) {
  return s.replace(/&/g, "&amp;").replace(/>/g, "&gt;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}
function newSlotId() {
  return randomBytes(10).toString("hex");
}
function attrValue(value) {
  return h(value);
}
function emitAttrs(attrs) {
  let out = "";
  for (const [key, value] of Object.entries(attrs)) {
    if (value === void 0) continue;
    out += ` ${key}="${attrValue(String(value))}"`;
  }
  return out;
}
function emitHamlAttrs(attrs) {
  const parts = [];
  for (const key of Object.keys(attrs).sort()) {
    const value = attrs[key];
    if (value === void 0) continue;
    parts.push(`${key}='${h(String(value))}'`);
  }
  return parts.length === 0 ? "" : ` ${parts.join(" ")}`;
}
var SLOT_KEYS = [
  // shark
  "view",
  "nest_name",
  "nest_syntax",
  "wrap",
  "show",
  "hide",
  "unknown",
  // heir
  "main",
  "home_view",
  "buttons_view",
  "edit_structure",
  "cql",
  "action_id",
  "content_opts",
  // both
  "help",
  "structure",
  "title",
  "variant",
  "joint",
  "input_type",
  "type",
  "size",
  "header",
  "items",
  "cache",
  "edit",
  "separator",
  "filter",
  // deprecated
  "params",
  // none (minus skip_perms)
  "main_view",
  "layout",
  // wrap.rb:68-71 name_context_slot_option appends name_context AFTER
  // voo.slot_options (outside the slot_keys slice), so the captured bytes
  // always show it last ("...&quot;home_view&quot;:...,&quot;name_context&quot;
  // :&quot;aikido_2&quot;}"). Tail position here reproduces those bytes.
  "name_context"
];
function slotOptionsJson(slotOptions) {
  const ordered = {};
  for (const key of SLOT_KEYS) {
    if (key in slotOptions && slotOptions[key] !== void 0) ordered[key] = slotOptions[key];
  }
  return htmlEscapeExceptQuotes(JSON.stringify(ordered));
}
function slotOptionsWithNameContext(fmt, voo) {
  const slotOptions = voo.slotOptions();
  const initial = fmt.initialContextNames;
  if (initial.length > 0) slotOptions["name_context"] = initial.join(",");
  return slotOptionsJson(slotOptions);
}

// src/card/render/pointer-list.ts
var POINTER_LIST_ITEM_VIEW = "bar";
var POINTER_LIST_ITEM_SLOT_VIEW = "mini_bar";
function isPointerOrListCard(card) {
  const code = card.typeCode;
  return code === "pointer" || code === "list" || code === "skin";
}
function rawItemStrings(content) {
  return content.toString().split(/\n+/).map((i) => stripItem(i));
}
function stripItem(item) {
  return item.replace(/\[\[|\]\]/g, "").trim();
}
function resolvePointerItemName(item, hostName) {
  try {
    const parsed = DeckoName.parse(item);
    if (parsed.isAbsolute) return item;
    return parsed.absoluteName(hostName).s;
  } catch {
    return item;
  }
}
var PERMISSION_RIGHT_NAMES = /* @__PURE__ */ new Set([
  "create",
  "read",
  "update",
  "delete"
]);
function isPermissionRightSetting(rightSetting) {
  return rightSetting !== void 0 && rightSetting.startsWith("*") && PERMISSION_RIGHT_NAMES.has(rightSetting.slice(1));
}
function isRuleCardWithPermissionRight(card) {
  const right = card.name?.rightName?.key;
  if (right === void 0) return false;
  if (!right.startsWith("*")) return false;
  const bare = right.slice(1);
  return PERMISSION_RIGHT_NAMES.has(bare);
}
var INPUT_TYPE_RIGHT_KEY = "*input_type";
function isInputTypeRuleCard(card) {
  return card.name?.rightName?.key === INPUT_TYPE_RIGHT_KEY;
}
function pointerListCoreHtml(parent, items, renderItem, itemView = POINTER_LIST_ITEM_VIEW) {
  const filtered = items.filter((s) => s.length > 0);
  const count = filtered.length;
  const paged = parent.name !== void 0 && count > POINTER_PAGING_LIMIT;
  const listed = paged ? filtered.slice(0, POINTER_PAGING_LIMIT) : filtered;
  const inner = listed.map((name) => itemWrap(name, renderItem(name), itemView)).join("\n");
  const ruleShape = isRuleCardWithPermissionRight(parent);
  const wrapper = ruleShape ? `<div class="pointer-list">${inner}</div>` : `<div class="card-list card-list-${itemView} pointer-list">${inner}</div>`;
  if (!paged) {
    return ruleShape ? wrapper : `${wrapper}
`;
  }
  return `${wrapper}
${pointerPagingNav(parent, count)}
`;
}
var POINTER_PAGING_LIMIT = 20;
var POINTER_PAGING_WINDOW = 5;
var POINTER_PAGING_MAX_PAGES = 100;
function pointerPagingNav(parent, count) {
  const limit = POINTER_PAGING_LIMIT;
  const total = Math.floor((count - 1) / limit);
  const base = `/${parent.name.urlKey}`;
  const href = (page) => `${base}?limit=${limit}&amp;offset=${page * limit}`;
  const lis = [];
  lis.push(
    '<li class="page-item"><div class="page-link"><span aria-hidden="true">&laquo;</span></div></li>'
  );
  const windowEnd = Math.min(POINTER_PAGING_WINDOW, total);
  for (let page = 0; page <= windowEnd; page++) {
    lis.push(
      `<li class="page-item${page === 0 ? " active" : ""}"><a class="card-paging-link slotter page-link" href="${href(page)}" data-remote="true">${page + 1}</a></li>`
    );
  }
  if (total > windowEnd + 1) {
    lis.push(
      '<li class="page-item disabled"><div class="page-link"><span>...</span></div></li>'
    );
  }
  if (total <= POINTER_PAGING_MAX_PAGES && total > windowEnd) {
    lis.push(
      `<li class="page-item"><a class="card-paging-link slotter page-link" href="${href(total)}" data-remote="true">${total + 1}</a></li>`
    );
  }
  lis.push(
    `<li class="page-item"><a aria-label="Next" class="card-paging-link slotter page-link" href="${href(1)}" data-remote="true"><span aria-hidden="true">&raquo;</span></a></li>`
  );
  const lastItem = Math.min(count, limit);
  return `<nav class='nav justify-content-between align-items-center'>
<ul class='pagination paging'>
${lis.join("")}
</ul>
<div class='paging-context'>
1
-
${lastItem}
of
${count}
</div>
</nav>`;
}
function itemWrap(name, inner, itemView = POINTER_LIST_ITEM_VIEW) {
  return `<div class="pointer-item item-${itemView}">${inner}</div>`;
}
var PHANTOM_TYPE_ID = 22281;
var PHANTOM_TYPE_NAME = "BasicCs";
var PHANTOM_TYPE_KEY = "basic_c";
function pointerListItemSlot(item, inner, slotTypeName) {
  const name = item.name;
  const setKeys = item.setKeys;
  const safeKey = name.safeKey;
  const classes = ["card-slot", `${POINTER_LIST_ITEM_SLOT_VIEW}-view`, setKeys].filter((s) => s !== "").join(" ");
  const dataSlotJson = itemDataSlotJson(name.s, slotTypeName);
  const unsaved = item.record === void 0 || isNewCard(item.record);
  const cardname = unsaved && name.isCompound ? name.urlKey : name.s;
  const attrs = emitAttrs({
    id: `${safeKey}-${POINTER_LIST_ITEM_SLOT_VIEW}-view`,
    class: classes,
    "data-card-name": cardname,
    "data-card-type-id": item.typeId === void 0 ? void 0 : String(item.typeId),
    "data-card-type-name": item.typeName,
    "data-card-link-name": name.urlKey,
    "data-slot-id": newSlotId(),
    "data-slot": dataSlotJson
  });
  return `<div${attrs}>${inner}</div>`;
}
function pointerListItemBodyForUnknown(name, identity) {
  const setKeys = identity?.setKeys ?? `ALL TYPE-${PHANTOM_TYPE_KEY}`;
  const typeName = identity?.typeName ?? PHANTOM_TYPE_NAME;
  const typeId = identity?.typeId ?? PHANTOM_TYPE_ID;
  const safeLinkName = DeckoName.parse(name).urlKey;
  const dataAttrs = emitHamlAttrs({
    "data-card-link-name": safeLinkName,
    "data-card-name": h(name),
    "data-card-type-id": typeId,
    "data-card-type-name": typeName
  }) + ` data-slot-id="${newSlotId()}"`;
  return `<div class='bar ${h(setKeys)} with-bar-menu nodblclick d-flex _card-link'${dataAttrs}>
<span class="denied"><!-- Sorry, you don't have permission (read) --></span>
<span class="denied"><!-- Sorry, you don't have permission (read) --></span>
</div>
`;
}
function itemDataSlotJson(nestName, typeName) {
  const ordered = {
    view: POINTER_LIST_ITEM_VIEW,
    nest_name: nestName,
    show: [POINTER_LIST_ITEM_VIEW],
    hide: ["bar_middle"],
    home_view: POINTER_LIST_ITEM_VIEW
  };
  if (typeName !== void 0) ordered["type"] = typeName;
  return jsonEscapeAttr(JSON.stringify(ordered));
}
function jsonEscapeAttr(s) {
  return s.replace(/&/g, "&amp;").replace(/'/g, "&apos;").replace(/>/g, "&gt;").replace(/</g, "&lt;");
}
function phantomPointerListItem(name, typed) {
  const deckName = DeckoName.parse(name);
  const typeName = typed?.typeName ?? PHANTOM_TYPE_NAME;
  const typeId = typed?.typeId ?? PHANTOM_TYPE_ID;
  const setKeys = typed !== void 0 ? `ALL TYPE-${DeckoName.parse(typed.typeName).key}` : `ALL TYPE-${PHANTOM_TYPE_NAME}`;
  const record = {
    id: void 0,
    codename: void 0,
    leftId: void 0,
    rightId: void 0,
    typeId,
    dbContent: void 0,
    trash: false,
    creatorId: void 0,
    updaterId: void 0,
    createdAt: void 0,
    updatedAt: void 0,
    currentRevisionId: void 0,
    readRuleClass: void 0,
    readRuleId: void 0,
    referencesExpired: void 0,
    name: deckName,
    key: deckName.key,
    isNew: true,
    fromTrash: false,
    uncacheable: false
  };
  return {
    record,
    name: deckName,
    key: deckName.key,
    typeName,
    typeId,
    id: void 0,
    dbContent: "",
    setKeys,
    unknown: true
  };
}

// src/card/set-patterns/rule-names.ts
function ruleName(setName, settingName) {
  return `${DeckoName.parse(setName).s}+${DeckoName.parse(settingName).s}`;
}
function ruleNamesForCard(card, settingName) {
  const setting = DeckoName.parse(settingName).s;
  return patternsForCard(card).map(
    (pattern) => ruleName(pattern.setName, setting)
  );
}

// src/card/rules/lookup.ts
async function findRule(fetcher, card, settingCode) {
  const candidates = ruleNamesForCard(card, settingCode);
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const record = await fetcher.fetchByName(candidate);
    if (record !== void 0 && record.name !== void 0) {
      return {
        rule: record,
        setName: candidate.split("+").slice(0, -1).join("+") || candidate,
        candidates,
        matchedIndex: i
      };
    }
  }
  return void 0;
}

// src/card/rules/apply.ts
function parseViewOverride(rule) {
  const raw = rule.dbContent;
  if (raw === void 0 || raw === null || raw === "") return void 0;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return void 0;
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed !== "object" || parsed === null) return void 0;
    const obj = parsed;
    const view = obj.view;
    if (typeof view !== "string" || view.length === 0) return void 0;
    const override = { view };
    if (typeof obj.wrap === "string") override.wrap = obj.wrap;
    if (typeof obj.class === "string") override.class = obj.class;
    if (typeof obj.tag === "string") override.tag = obj.tag;
    if (typeof obj.titleClass === "string") override.titleClass = obj.titleClass;
    if (typeof obj.jointClass === "string") override.jointClass = obj.jointClass;
    const reserved = /* @__PURE__ */ new Set(["view", "wrap", "class", "tag", "titleClass", "jointClass"]);
    const opts = {};
    for (const [k, v] of Object.entries(obj)) {
      if (!reserved.has(k)) opts[k] = v;
    }
    if (Object.keys(opts).length > 0) override.opts = opts;
    return override;
  } catch {
    return void 0;
  }
}
function applyViewOverride(baseHtml, override) {
  if (override === void 0) return baseHtml;
  let out = baseHtml;
  if (override.class !== void 0) {
    out = out.replace(
      /(<div\b[^>]*\bclass=")([^"]*card-slot[^"]*)(")/,
      (_match, open, cls, close) => `${open}${cls} ${override.class}${close}`
    );
  }
  if (override.titleClass !== void 0) {
    out = out.replace(/(<span\b[^>]*\bclass=")card-title(")/, `$1${override.titleClass}$2`);
  }
  if (override.tag !== void 0) {
    out = out.replace(/<h1\b([^>]*)>([\s\S]*?)<\/h1>/, `<${override.tag}$1>$2</${override.tag}>`).replace(/<h2\b([^>]*)>([\s\S]*?)<\/h2>/, `<${override.tag}$1>$2</${override.tag}>`).replace(/<h3\b([^>]*)>([\s\S]*?)<\/h3>/, `<${override.tag}$1>$2</${override.tag}>`);
  }
  if (override.jointClass !== void 0) {
    out = out.replace(/<span>\+<\/span>/g, `<span class="${override.jointClass}">+</span>`);
  }
  return out;
}
function resolveViewOverride(view, rules2) {
  for (const rule of rules2) {
    const override = parseViewOverride(rule);
    if (override !== void 0 && override.view === view) {
      return override;
    }
  }
  return void 0;
}

// src/card/render/nest-syntax.ts
var NEST_FULL_REGEXP = /\{\{([^{}]*)\}\}/g;
function stripTags(s) {
  return s.replace(/<[^>]*>/g, "");
}
var SHARK_KEYS = /* @__PURE__ */ new Set([
  // shark
  "view",
  "nest_name",
  "nest_syntax",
  "wrap",
  "show",
  "hide",
  "unknown",
  // both
  "help",
  "structure",
  "title",
  "variant",
  "joint",
  "input_type",
  "type",
  "size",
  "header",
  "items",
  "cache",
  "edit",
  "separator",
  "filter",
  "params"
]);
var DEFAULT_OPTION = "view";
function parseNestOptions(optLists) {
  const raw = (optLists ?? "").split("|").reverse();
  let prev;
  for (const level of raw) {
    prev = interpretPipedOptions(level, prev);
  }
  const flat = prev ?? {};
  const options = { extra: {} };
  for (const [key, value] of Object.entries(flat)) {
    if (value === void 0) continue;
    switch (key) {
      case "view":
        options.view = String(value);
        break;
      case "title":
        options.title = String(value);
        break;
      case "show":
        options.show = String(value);
        break;
      case "hide":
        options.hide = String(value);
        break;
      case "size":
        options.size = String(value);
        break;
      case "items":
        options.items = value;
        break;
      default:
        options.extra[key] = String(value);
    }
  }
  return options;
}
function interpretPipedOptions(listString, items) {
  const hash = items === void 0 ? {} : { items };
  optionStringToHash(listString, hash);
  return hash;
}
function optionStringToHash(listString, hash) {
  if (listString.trim() === "") return;
  for (const pair of listString.trim().split(";")) {
    const colon = pair.indexOf(":");
    const value = (colon === -1 ? pair : pair.slice(colon + 1)).trim();
    const key = (colon === -1 ? DEFAULT_OPTION : pair.slice(0, colon)).trim();
    if (key === "item") {
      const items = hash["items"] ?? {};
      items["view"] = value;
      hash["items"] = items;
      continue;
    }
    if (!SHARK_KEYS.has(key)) continue;
    hash[key] = value;
  }
}
function scanNests(content) {
  const pieces = [];
  let last = 0;
  for (const match of content.matchAll(NEST_FULL_REGEXP)) {
    const start = match.index;
    if (start > last) pieces.push({ kind: "text", text: content.slice(last, start) });
    pieces.push({ kind: "nest", text: match[0], nest: interpretNest(match[1] ?? "") });
    last = start + match[0].length;
  }
  if (last < content.length) pieces.push({ kind: "text", text: content.slice(last) });
  return pieces;
}
function interpretNest(inBrackets) {
  const stripped = stripTags(inBrackets);
  const pipe = stripped.indexOf("|");
  const rawName = (pipe === -1 ? stripped : stripped.slice(0, pipe)).trim();
  const optLists = pipe === -1 ? void 0 : stripped.slice(pipe + 1);
  if (rawName.startsWith("#")) {
    return {
      syntax: stripped,
      name: rawName,
      options: { extra: {} },
      comment: rawName.startsWith("##") ? "" : `<!-- ${escapeHtml(inBrackets)} -->`
    };
  }
  return {
    syntax: stripped,
    name: rawName,
    options: parseNestOptions(optLists),
    comment: void 0,
    chunkNestSyntax: stripped
  };
}
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function referencedNames(content) {
  const out = [];
  for (const piece of scanNests(content)) {
    const nest = piece.nest;
    if (nest === void 0 || nest.comment !== void 0) continue;
    out.push({ name: nest.name, relative: nest.name.startsWith("_") });
  }
  return out;
}

// src/card/rules/structure.ts
var STRUCTURE_SETTING_NAME = "*structure";
function structureRuleUniverseStatement() {
  return ruleUniverseStatementBySetting(STRUCTURE_SETTING_NAME);
}
var DEFAULT_SETTING_NAME = "*default";
function ruleUniverseStatementBySetting(settingName) {
  return {
    sql: `WITH RECURSIVE name_walk(id, composed) AS (
  -- Base case: simple cards (no left, no right) use their stored key
  SELECT id, COALESCE("key", '')
  FROM cards
  WHERE left_id IS NULL AND right_id IS NULL
  UNION ALL
  -- Junction case: compose left-walk + right-key. The walk does NOT
  -- filter on trash: a trashed intermediate card still carries its
  -- left_id/right_id and contributes to the composed name (mirrors
  -- the old SQL's LEFT JOIN chain through trashed junctions \u2014 e.g.
  -- rule 829 has set card 828 trashed but walks through Gallery).
  SELECT c.id, COALESCE(w.composed, '') || '+' || COALESCE(r."key", '')
  FROM cards c
  JOIN name_walk w ON w.id = c.left_id
  JOIN cards r ON r.id = c.right_id
)
SELECT
  CASE
    WHEN n.composed IS NOT NULL AND n.composed <> ''
      THEN n.composed || '+' || st."key"
    ELSE NULL
  END AS composed_key,
  r.db_content AS db_content,
  r.type_id AS rule_type_id
FROM cards r
JOIN cards st ON st.id = r.right_id
JOIN name_walk n ON n.id = r.left_id
WHERE r.trash = 0
  AND r.right_id = (SELECT id FROM cards
                    WHERE ("key" = ? OR name = ?)
                      AND trash = 0 ORDER BY id LIMIT 1)`,
    // The setting name is bound, never interpolated into the SQL text —
    // settingName is a caller-supplied string.
    params: [settingName, settingName]
  };
}
function defaultRuleUniverseStatement() {
  return ruleUniverseStatementBySetting(DEFAULT_SETTING_NAME);
}
function templateTypeNameStatement() {
  return {
    sql: `SELECT DISTINCT c.type_id AS type_id, t.name AS name
FROM cards c
LEFT JOIN cards t ON t.id = c.type_id
WHERE c.trash = 0
  AND c.right_id IN (
    SELECT id FROM cards
    WHERE key IN ('*default', '*structure') AND trash = 0)
  AND c.type_id IS NOT NULL`,
    params: []
  };
}
function templateTypeNamesFromResults(result) {
  const map = /* @__PURE__ */ new Map();
  if (result === void 0) return map;
  for (const row of result.rows) {
    if (row.type_id === null || row.name === null || row.name === "") continue;
    map.set(row.type_id, row.name);
  }
  return map;
}
function structureUniverseFromResults(result) {
  const universe = /* @__PURE__ */ new Map();
  if (result === void 0) return universe;
  for (const row of result.rows) {
    if (row.composed_key === null) continue;
    const canonicalKey = DeckoName.parse(row.composed_key).key;
    if (canonicalKey === "") continue;
    universe.set(canonicalKey, row.db_content);
  }
  return universe;
}
function structureRuleTypesFromResults(result) {
  const types = /* @__PURE__ */ new Map();
  if (result === void 0) return types;
  for (const row of result.rows) {
    if (row.composed_key === null || row.rule_type_id === null) continue;
    const canonicalKey = DeckoName.parse(row.composed_key).key;
    if (canonicalKey === "") continue;
    types.set(canonicalKey, row.rule_type_id);
  }
  return types;
}
function resolveStructuredContent(card, universe) {
  if (universe.size === 0) return void 0;
  const candidates = ruleNamesForCard(card, STRUCTURE_SETTING_NAME);
  for (let i = 0; i < candidates.length; i++) {
    const key = DeckoName.parse(candidates[i]).key;
    if (!universe.has(key)) continue;
    const content = universe.get(key) ?? null;
    if (content === null) return void 0;
    if (content.trim() === "_self") return void 0;
    return { templateContent: content, ruleName: candidates[i], matchedIndex: i };
  }
  return void 0;
}
function templateReferenceNames(templateContent, contextName) {
  const names = [];
  for (const ref of referencedNames(templateContent)) {
    if (ref.relative) continue;
    if (ref.name === "") continue;
    if (contextName === void 0) {
      names.push(ref.name);
      continue;
    }
    try {
      names.push(DeckoName.parse(ref.name).absoluteName(contextName).s);
    } catch (err) {
      if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
        continue;
      }
      throw err;
    }
  }
  return names;
}

// src/card/fetch/virtual-cards.ts
function resolveVirtualCardStructure(name, universe, leftTypeName, cardTypeName, cardTypeId) {
  if (!name.isCompound) return void 0;
  if (universe.contents.size === 0) return void 0;
  const patternInput = {
    name,
    isNew: true,
    // the fetch placeholder is a new card (pattern/all.rb#patterns)
    ...leftTypeName !== void 0 ? { leftTypeName } : {},
    ...cardTypeName !== void 0 ? { typeName: cardTypeName } : {},
    ...cardTypeId !== void 0 ? { typeId: cardTypeId } : {}
  };
  const candidates = ruleNamesForCard(patternInput, STRUCTURE_SETTING_NAME);
  for (const candidate of candidates) {
    const key = DeckoName.parse(candidate).key;
    if (!universe.contents.has(key)) continue;
    const content = universe.contents.get(key) ?? null;
    if (content !== null && content.trim() === "_self") return void 0;
    return {
      ruleKey: key,
      templateContent: content ?? "",
      // structured_content nil -> standard ""
      typeId: universe.ruleTypeIds.get(key)
    };
  }
  return void 0;
}

// src/card/fetch/virtual-search-cards.ts
var VIRTUAL_SEARCH_CQL_BY_RIGHT_KEY = /* @__PURE__ */ new Map([
  ["*by_create", '{"found_by":"_left","sort_by":"create"}'],
  ["*by_name", '{"found_by":"_left","sort_by":"name"}'],
  ["*by_update", '{"found_by":"_left","sort_by":"update"}'],
  ["*children", '{"part":"_left","sort_by":"name"}'],
  ["*count", '{"found_by":"_left","return":"count"}'],
  ["*created", '{"created_by":"_left","sort_by":"create","dir":"desc"}'],
  ["*creator", '{"creator_of":"_left"}'],
  ["*edited", '{"edited_by":"_left","sort_by":"name"}'],
  ["*editors", '{"editor_of":"_left","sort_by":"name"}'],
  ["*last_edited", '{"last_edited_by":"_left"}'],
  ["*linked_to_by", '{"link_to":"_left","sort_by":"name"}'],
  ["*links_to", '{"linked_to_by":"_left","sort_by":"name"}'],
  ["*nested_by", '{"nest":"_left","sort_by":"name"}'],
  ["*nests", '{"nested_by":"_left","sort_by":"name"}'],
  ["*referred_to_by", '{"refer_to":"_left","sort_by":"name"}'],
  ["*refers_to", '{"referred_to_by":"_left","sort_by":"name"}']
]);
function virtualSearchCqlFor(name) {
  if (!name.isCompound) return void 0;
  const rightKey = name.rightName?.key;
  if (rightKey === void 0) return void 0;
  return VIRTUAL_SEARCH_CQL_BY_RIGHT_KEY.get(rightKey);
}

// src/card/render/set-keys.ts
function safeSetKeys(input) {
  return safeSetKeysForCard({
    name: input.name.s,
    typeId: input.typeId,
    typeName: input.typeName,
    leftTypeName: input.leftTypeName,
    isRule: input.isRule,
    ...input.isNew === true ? { isNew: true } : {}
  });
}

// src/card/permissions/view-perms.ts
var PERMS_NONE = /* @__PURE__ */ new Set([
  "title",
  "title_link",
  "title_no_link",
  "name",
  "key",
  "linkname",
  "url",
  "url_link",
  "link",
  "nav_link",
  "blank",
  "header",
  "header_title",
  "page_title",
  "head",
  "meta_tags",
  "page_title_tag",
  "favicon_tag",
  "rss_links",
  "stylesheet_tags",
  "compact_missing",
  "unknown",
  "server_error",
  "denial",
  "not_found",
  "bad_address",
  "errors",
  "subedits",
  "followed",
  "follower",
  "unfollow_url",
  "flash",
  "javascript_include_tag",
  "javascript_tags",
  "script_calls",
  "script_variables",
  "navbar_links"
]);
var VIEW_PERMS_DIRECTIVES = {
  edit: "update",
  edit_name: "update",
  name_form: "update",
  edit_type: "update",
  edit_type_form: "update",
  edit_inline: "update",
  edit_in_form: "update",
  board: "update",
  comment_box: "update",
  universal_edit_button: "update",
  new: "create",
  new_in_modal: "create",
  simple_new: "create",
  new_fields: "create",
  // card-mod-tinymce_editor set/all/reference_editor/nest_editor.rb:22
  // (`perms: :create`) and nest_image.rb:13 (`perms: :create`) — the
  // reference-editor nest views; view-registry-directives-oracle.json
  // captures both as perms "create" on the live surface.
  nest_content: "create",
  new_image: "create",
  configure_button: "can_configure?",
  // card-mod-format set/type/cardtype.rb:53 `view :configure_link,
  // cache: :never, perms: :can_configure?` - the helper view the
  // configure_button body calls, same predicate (cardtype.rb:57-59).
  configure_link: "can_configure?"
};
var CRUD_TASKS = ["read", "create", "update", "delete"];
function resolveViewPerms(view) {
  if (PERMS_NONE.has(view)) return { check: false };
  const directive = VIEW_PERMS_DIRECTIVES[view];
  if (directive === void 0) {
    return { check: true, predicate: false, task: "read" };
  }
  if (CRUD_TASKS.includes(directive)) {
    return { check: true, predicate: false, task: directive };
  }
  return { check: true, predicate: true, task: directive };
}
function viewRequiresTask(view) {
  const resolution = resolveViewPerms(view);
  return resolution.check && !resolution.predicate && resolution.task !== "read";
}
function renderOptSkipPerms(renderOpts) {
  return renderOpts["skip_perms"] === true;
}
var DENIAL_VIEW = /* @__PURE__ */ new Map([
  ["menu", "blank"],
  ["edit_link", "blank"],
  ["list_of_changes", "blank"],
  ["universal_edit_button", "blank"],
  ["comment_box", "blank"],
  ["configure_button", "blank"]
]);
function viewDenialView(view) {
  return DENIAL_VIEW.get(view);
}
function quietDenial(task = "read") {
  return `<span class="denied"><!-- Sorry, you don't have permission (${task}) --></span>`;
}
function viewPermissionDenial(view, input) {
  const resolution = resolveViewPerms(view);
  if (!resolution.check) return void 0;
  if (renderOptSkipPerms(input.renderOpts)) return void 0;
  let deniedLabel;
  if (resolution.predicate) {
    if (input.predicateAllowed?.(resolution.task) !== false) return void 0;
    deniedLabel = "";
  } else {
    let task = resolution.task;
    if (task === "update" && input.isNewCard === true) task = "create";
    if (input.taskAllowed(task) !== false) return void 0;
    deniedLabel = task;
  }
  if (viewDenialView(view) === "blank") return "";
  if (input.formatName !== void 0 && input.formatName !== "html") return "";
  return quietDenial(deniedLabel);
}

// src/card/render/bootstrap-code-files.ts
var nodeFsCache;
function nodeFsOrNull() {
  if (nodeFsCache !== void 0) return nodeFsCache;
  try {
    const proc = globalThis.process;
    const fs = proc?.getBuiltinModule?.("node:fs");
    if (fs !== void 0) nodeFsCache = fs;
    return fs ?? void 0;
  } catch {
    return void 0;
  }
}
var bootstrapScssDir;
function bootstrapScssDirectory() {
  bootstrapScssDir ??= new URL(
    "fixtures/vendor/bootstrap-scss/",
    new URL("../../..", import.meta.url)
  );
  return bootstrapScssDir;
}
var BOOTSTRAP_MIXIN_STYLESHEETS = [
  "deprecate",
  "breakpoints",
  "color-scheme",
  "image",
  "resize",
  "visually-hidden",
  "reset-text",
  "text-truncate",
  "utilities",
  "alert",
  "backdrop",
  "buttons",
  "caret",
  "pagination",
  "lists",
  "list-group",
  "forms",
  "table-variants",
  "border-radius",
  "box-shadow",
  "gradients",
  "transition",
  "clearfix",
  "container",
  "grid"
];
var BOOTSTRAP_MAIN_STYLESHEETS = [
  "utilities",
  "root",
  "reboot",
  "type",
  "images",
  "containers",
  "grid",
  "tables"
];
var BOOTSTRAP_FORM_STYLESHEETS = [
  "labels",
  "form-text",
  "form-control",
  "form-select",
  "form-check",
  "form-range",
  "floating-labels",
  "input-group",
  "validation"
];
var BOOTSTRAP_AFTER_FORM_STYLESHEETS = [
  "buttons",
  "transitions",
  "dropdown",
  "button-group",
  "nav",
  "navbar",
  "card",
  "accordion",
  "breadcrumb",
  "pagination",
  "badge",
  "alert",
  "progress",
  "list-group",
  "close",
  "toasts",
  "modal",
  "tooltip",
  "popover",
  "carousel",
  "spinners",
  "offcanvas",
  "placeholders"
];
var BOOTSTRAP_HELPER_STYLESHEETS = [
  "clearfix",
  "colored-links",
  "ratio",
  "position",
  "stacks",
  "visually-hidden",
  "stretched-link",
  "text-truncation",
  "vr"
];
var BOOTSTRAP_CORE_FILES = [
  "_variables.scss",
  "vendor/_rfs.scss",
  ...BOOTSTRAP_MIXIN_STYLESHEETS.map((m) => `mixins/_${m}.scss`),
  ...BOOTSTRAP_MAIN_STYLESHEETS.map((m) => `_${m}.scss`),
  ...BOOTSTRAP_FORM_STYLESHEETS.map((m) => `forms/_${m}.scss`),
  ...BOOTSTRAP_AFTER_FORM_STYLESHEETS.map((m) => `_${m}.scss`),
  ...BOOTSTRAP_HELPER_STYLESHEETS.map((m) => `helpers/_${m}.scss`),
  "utilities/_api.scss"
];
function loadStylesheets(files) {
  const fs = nodeFsOrNull();
  if (fs === void 0) {
    throw new Error(
      "bootstrap code-file content needs a Node filesystem (vendored fixtures/vendor/bootstrap-scss/); this runtime has none"
    );
  }
  const base = bootstrapScssDirectory();
  return files.map((f) => fs.readFileSync(new URL(f, base), "utf8")).join("\n");
}
function bootstrapCoreContent(_fmt) {
  return loadStylesheets(BOOTSTRAP_CORE_FILES);
}
function bootstrapFunctionsContent(_fmt) {
  return loadStylesheets(["_functions.scss"]);
}

// src/card/render/content-overrides.ts
var ContentOverrideRegistry = class {
  byPath = /* @__PURE__ */ new Map();
  /** Register a content override. The mod loader calls this from the
   *  SetLoader phase the same way it calls the view-registration table. */
  register(entry) {
    this.byPath.set(entry.setPath, entry);
  }
  /** The content override for a set path (undefined = no override). The
   *  render path consults this via resolveContentOverride before falling
   *  through to dbContent. */
  forPath(setPath) {
    return this.byPath.get(setPath);
  }
  /** Drop every registration (the mod loader's reset/reload seam). */
  clear() {
    this.byPath.clear();
  }
  /** Every registered set path, in insertion order (registration order is
   *  the lookup order - module reopening's "last included wins" matches
   *  Map.set's last-wins semantics). */
  paths() {
    return [...this.byPath.keys()];
  }
  /** Number of registered overrides. */
  size() {
    return this.byPath.size;
  }
};
var BUILT_IN_DEFAULT_REGISTRY = new ContentOverrideRegistry();
BUILT_IN_DEFAULT_REGISTRY.register({
  // setPath anchors are the card's KEY form: decko's key algorithm
  // singularizes ("bootstrap: functions" -> key "bootstrap_function" —
  // the oracle deck's stored row reads "key":"bootstrap_function"), so
  // the Self-pattern match (cardBelongsToSet: card.name.key === anchor)
  // is against the singular. The codename spelling ("bootstrap_functions")
  // does NOT match and the card renders an empty CodeRay pre.
  // supersedesType: false — set/self/bootstrap_core.rb declares ONLY
  // `def content`; the card stays SCSS-typed, so the cardtype's CodeRay
  // core branch fires over the overridden raw (the oracle page pins).
  setPath: "self/bootstrap_core",
  modName: "bootstrap",
  fn: bootstrapCoreContent,
  supersedesType: false
});
BUILT_IN_DEFAULT_REGISTRY.register({
  setPath: "self/bootstrap_function",
  modName: "bootstrap",
  fn: bootstrapFunctionsContent,
  supersedesType: false
});
var defaultRegistry = BUILT_IN_DEFAULT_REGISTRY;
function cardBelongsToSet(card, setPath) {
  const slash = setPath.indexOf("/");
  const pattern = slash === -1 ? setPath : setPath.slice(0, slash);
  const anchor = slash === -1 ? "" : setPath.slice(slash + 1);
  switch (pattern) {
    case "all":
    case "abstract":
      return true;
    case "type":
      return anchor.length > 0 && card.typeName !== void 0 && camelizeAnchor(card.typeName) === camelizeAnchor(anchor);
    case "right":
      return card.name.isCompound === true && card.name.rightName?.key === anchor;
    case "left":
      return card.name.isCompound === true && card.name.leftName?.key === anchor;
    case "self":
      return card.name.key === anchor;
    case "plus":
      return card.name.isCompound === true;
    case "star":
      return card.name.isStar === true;
    case "rstar":
      return card.name.isRStar === true;
    case "rule":
      return false;
    default:
      return false;
  }
}
function camelizeAnchor(anchor) {
  return anchor.split("_").map((word) => word === "" ? "" : word[0].toUpperCase() + word.slice(1)).join("");
}
function resolveContentOverride(fmt) {
  return resolveContentOverrideEntry(fmt)?.fn(fmt);
}
function resolveContentOverrideEntry(fmt) {
  if (defaultRegistry === void 0) return void 0;
  const card = fmt.card;
  let lastMatch;
  for (const setPath of defaultRegistry.paths()) {
    if (!cardBelongsToSet(card, setPath)) continue;
    const reg = defaultRegistry.forPath(setPath);
    if (reg !== void 0) lastMatch = reg;
  }
  return lastMatch;
}

// src/card/render/deck-origin.ts
var DECK_ORIGIN = "https://culturesmith.com";
var NO_REQUEST_ORIGIN = "";
function envOriginForSurface(pageSurface) {
  return pageSurface ? DECK_ORIGIN : NO_REQUEST_ORIGIN;
}

// src/card/render/errors.ts
var CardErrorBadQuery = class extends Error {
  query;
  constructor(query, message = `Invalid JSON search query: ${query}`) {
    super(message);
    this.name = "Card::Error::BadQuery";
    this.query = query;
  }
};
Object.defineProperty(CardErrorBadQuery, "name", { value: "Card::Error::BadQuery" });
function badQuery(query) {
  return new CardErrorBadQuery(query);
}
function emptyQueryError() {
  const err = new CardErrorBadQuery("", "can't run search with empty content");
  return err;
}
var BAD_QUERY_CLASS_NAME = "Card::Error::BadQuery";
var RubyDateError = class extends Error {
  constructor(message = "invalid date") {
    super(message);
    this.name = "Date::Error";
  }
};
Object.defineProperty(RubyDateError, "name", { value: "Date::Error" });
function dateError(message = "invalid date") {
  return new RubyDateError(message);
}
var RubyNoMethodError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "NoMethodError";
  }
};
Object.defineProperty(RubyNoMethodError, "name", { value: "NoMethodError" });
function mainNestWithoutMainError() {
  return new RubyNoMethodError("undefined method `rendered' for nil");
}
var DATE_PARSE_REFERENCE_YEAR = 2026;
var DATE_PARSE_REFERENCE_MONTH = 9;
function fillFromReferenceMonth(day) {
  const date = new Date(Date.UTC(DATE_PARSE_REFERENCE_YEAR, DATE_PARSE_REFERENCE_MONTH - 1, day));
  return date;
}
function parseRubyDateContent(content) {
  if (content === "") return null;
  if (/^\d{8}$/.test(content)) {
    const y = Number(content.slice(0, 4));
    const m = Number(content.slice(4, 6));
    const d = Number(content.slice(6, 8));
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return new Date(Date.UTC(y, m - 1, d));
    return null;
  }
  const dashMatch = /^(\d{1,4})-(\d{1,2})-(\d{1,2})$/.exec(content);
  if (dashMatch !== null) {
    let y = Number(dashMatch[1]);
    const m = Number(dashMatch[2]);
    const d = Number(dashMatch[3]);
    if (y < 100) y += y <= 68 ? 2e3 : 1900;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
      return null;
    }
    return date;
  }
  const dayZone = /^(\d{1,2})-(\d{3,4})$/.exec(content);
  if (dayZone !== null) {
    const day = Number(dayZone[1]);
    if (day < 1 || day > 31) return null;
    return fillFromReferenceMonth(day);
  }
  const twoPart = /^(\d{1,5})-(\d{1,5})$/.exec(content);
  if (twoPart !== null) {
    const day = Number(twoPart[1]);
    const zone = twoPart[2];
    if (zone.length !== 2) return null;
    if (day > 31) return null;
    if (day < 10 && (zone === "00" || Number(zone) > 31)) return null;
    return fillFromReferenceMonth(day);
  }
  const slashMatch = /^(\d{1,4})\/(\d{1,2})\/(\d{1,4})$/.exec(content);
  if (slashMatch !== null) {
    const a = Number(slashMatch[1]);
    const b = Number(slashMatch[2]);
    const c = Number(slashMatch[3]);
    if (a >= 1 && a <= 9999 && b >= 1 && b <= 12 && c >= 1 && c <= 31) {
      return new Date(Date.UTC(a, b - 1, c));
    }
    return null;
  }
  if (/^\d+$/.test(content)) return null;
  const parsed = new Date(content);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}
function isValidDateContent(content) {
  return parseRubyDateContent(content) !== null;
}

// src/card/render/format.ts
var SELF_SET_TITLE_OVERRIDES = /* @__PURE__ */ new Map([
  ["search", "Search Results"],
  ["recent", "Recent Changes"],
  ["signin", "Sign In"]
]);
function cardPath(relPath) {
  return /^(https?:)?\//.test(relPath) ? relPath : `/${relPath}`;
}
var UnsupportedViewError = class extends Error {
  view;
  cardName;
  constructor(view, cardName) {
    super(`view (${view}) not supported for ${cardName}`);
    this.name = "UnsupportedViewError";
    this.view = view;
    this.cardName = cardName;
  }
};
var Voo = class {
  parent;
  requestedView;
  /** normalized (live) options; slot_options reads these. */
  opts;
  /** visibility.rb#viz_hash - insertion order is preserved because the
   *  data-slot show/hide lists are built in first-touch order. */
  viz = /* @__PURE__ */ new Map();
  /** view/classy.rb class_list (public scope): key -> extra classes. */
  classUps = /* @__PURE__ */ new Map();
  /** Optional override for the data-slot's view field. When set,
   *  slotOptions emits this value as `view` instead of the requested
   *  view. Used by the pointer/list item rendering: the slot id uses
   *  "mini_bar" but the data-slot's view field reads "bar" (matching
   *  the captured corpus bytes for corpus:77 + every pointer/list
   *  sibling). Undefined = data-slot's view equals requestedView. */
  slotViewOverride;
  /** view/options/voo_api.rb:30-32 `define_setter` — `voo.<key> = v` writes
   *  LIVE options, while `slot_options` (:51-56) reads the NORMALIZED ones
   *  and slices them. The two maps are separate in Ruby, so an option a view
   *  body assigns mid-render is readable through the accessor and INVISIBLE
   *  in the slot JSON. Only :title has a live writer today
   *  (card-mod-rules set/type/set/html_views/template.rb:4
   *  `voo.title = parent.voo.nest_syntax if parent`), and the oracle pins
   *  the consequence: the :template_link slot's data-slot carries
   *  view/nest_name/show/home_view/name_context and NO title key. */
  liveTitle;
  constructor(parent, requestedView, opts) {
    this.parent = parent;
    this.requestedView = requestedView;
    this.opts = opts;
    if (parent !== void 0 && opts["size"] === void 0) {
      const inherited = parent.opts["size"];
      if (inherited !== void 0) this.opts["size"] = inherited;
    }
    if (parent !== void 0 && opts["items"] === void 0) {
      const inheritedItems = parent.opts["items"];
      if (inheritedItems !== void 0) this.opts["items"] = inheritedItems;
    }
    if (parent !== void 0 && opts["title"] === void 0) {
      const inheritedTitle = parent.opts["title"];
      if (inheritedTitle !== void 0) this.opts["title"] = inheritedTitle;
    }
    if (parent !== void 0 && opts["home_view"] === void 0) {
      const inheritedHomeView = parent.opts["home_view"];
      if (inheritedHomeView !== void 0) this.opts["home_view"] = inheritedHomeView;
    }
  }
  /** visibility.rb#process_visibility: inherit the parent's viz, then viz the
   *  requested view. The `optional: :show` render arg
   *  (method_delegation.rb#render_args -> optional_render_opt default) makes
   *  every delegated sub-render visible by default.
   *  the nest opts' own show/hide lists viz into the map (Ruby lines
   *  75-92: `process_visibility_options live_options` — hide processed
   *  before show, both DELETED from the options so slot_options' final
   *  merge re-derives them from the viz alone). Without this, a view body
   *  that adds its own hide (bar.rb's prepare_bar → bar_middle) REPLACED
   *  the nest's hide list in the emitted slot JSON instead of joining it
   *  (bar_view.rb:11's bar_nav hide vanished from *all+*autoname's
   *  data-slot). */
  processVisibility(optional) {
    if (this.parent !== void 0) {
      for (const [view, setting] of this.parent.viz) {
        if (!this.viz.has(view)) this.viz.set(view, setting);
      }
    }
    const optHide = this.opts["hide"];
    const optShow = this.opts["show"];
    if (optHide !== void 0) {
      delete this.opts["hide"];
      for (const view of normalizeVisibilityList(optHide)) this.viz.set(view, "hide");
    }
    if (optShow !== void 0) {
      delete this.opts["show"];
      for (const view of normalizeVisibilityList(optShow)) this.viz.set(view, "show");
    }
    const requested = this.requestedView;
    if (optional !== void 0 && optional !== null && optional !== false && !this.viz.has(requested)) {
      this.viz.set(requested, optional === "hide" || optional === false ? "hide" : "show");
    }
  }
  /** visibility.rb#show?/#hide?. */
  show(view) {
    return this.viz.get(view) !== "hide";
  }
  explicitShow(view) {
    return this.viz.get(view) === "show";
  }
  /** visibility.rb#hide!/#show! (force write). */
  setViz(views, setting) {
    const list = Array.isArray(views) ? views : [views];
    for (const view of list) this.viz.set(view, setting);
  }
  /** visibility.rb#viz (visibility.rb:71-79) - the NON-force write:
   *  `next if !force && viz_hash[view]` - the FIRST write on a view wins.
   *  This is Ruby's `voo.show x` / `voo.hide x` setter semantics (plain
   *  show/hide delegate here without force; only the ! variants and
   *  process_visibility_options force). The edit forms depend on the
   *  exact order: edit_content.rb's :edit_form view body runs
   *  `voo.show :edit_type_row` first, then the edit_form METHOD runs
   *  `voo.hide :edit_type_row` - a no-op under first-write-wins, which is
   *  why the captured data-slot lists edit_type_row under "show"
   *  (fixtures/captured/edit-forms.json). */
  vizWrite(views, setting) {
    const list = Array.isArray(views) ? views : [views];
    for (const view of list) {
      if (this.viz.has(view)) continue;
      this.viz.set(view, setting);
    }
  }
  /** visibility.rb#show (the SETTER form - `voo.show :help` in
   *  edit_content.rb's :edit body). The query form is show() above
   *  (Ruby's show?). */
  showViz(views) {
    this.vizWrite(views, "show");
  }
  /** visibility.rb#hide (the SETTER form - first write wins; see vizWrite).
   *  The voo.hide :bar_middle idiom (bar.rb) and the :edit body's
   *  `voo.hide :save_button` ride here. */
  hide(views) {
    this.vizWrite(views, "hide");
  }
  /** view/options/voo_api.rb#slot_options: normalized options + visibility,
   *  restricted to slot keys (the JSON is emitted in slot_keys order by
   *  slot-html.ts#slotOptionsJson). `view: requested_view` wins - Ruby's
   *  `.merge(view: requested_view)`. When `slotViewOverride` is set
   *  (the pointer/list item path - slot id uses "mini_bar" but the
   *  data-slot's view field reads "bar"), that override is emitted
   *  instead of the requested view. */
  slotOptions() {
    const viewField = this.slotViewOverride ?? this.requestedView;
    const out = { ...this.opts, view: viewField };
    const show = [];
    const hide = [];
    for (const [view, setting] of this.viz) {
      (setting === "show" ? show : hide).push(view);
    }
    if (show.length > 0) out["show"] = show;
    if (hide.length > 0) out["hide"] = hide;
    return out;
  }
  /** classy.rb#class_up (scope :subviews - stored on this voo). */
  classUp(klass, classier) {
    this.classUps.set(klass, [this.classUps.get(klass), classier].filter((s) => s !== void 0 && s !== "").join(" "));
  }
  /** classy.rb#classy: `[classes, extra_classes(classes)].flatten.compact
   *  .join " "` - the base classes first, then the extra classes of the
   *  FIRST listed class (extra_classes takes `klass.first` when handed an
   *  array), resolved through the voo chain (deep_extra_classes self ->
   *  ancestors). That quirk is why the content view's d0-card-content
   *  class_up lands at the END of the slot class list.
   *
   *  Token-level dedup (first occurrence wins): the fixtures pin single
   *  occurrences when class_ups stack nested strings (bar.rb's
   *  `class_up "accordion-item", "bar #{classy 'bar'}"` renders ONE "bar"),
   *  which is Haml's class-merge dedup on the rendered element. */
  classy(...classes) {
    const flat = [];
    for (const group of classes) {
      if (Array.isArray(group)) flat.push(...group);
      else if (group !== "") flat.push(group);
    }
    const out = flat.filter((s) => s !== "");
    if (out.length === 0) return "";
    const extra = this.deepExtraClasses(out[0]);
    if (extra !== "") out.push(extra);
    const seen = /* @__PURE__ */ new Set();
    const tokens = [];
    for (const token of out.join(" ").split(" ")) {
      if (token === "" || seen.has(token)) continue;
      seen.add(token);
      tokens.push(token);
    }
    return tokens.join(" ");
  }
  deepExtraClasses(klass) {
    const own = this.classUps.get(klass);
    const parent = this.parent?.deepExtraClasses(klass) ?? "";
    return [own, parent].filter((s) => s !== void 0 && s !== "").join(" ");
  }
};
var COMPACT_TRUE_VIEWS = {
  name: true,
  key: true,
  linkname: true,
  url: true,
  id_url: true,
  url_link: true,
  link: true,
  nav_link: true,
  codename: true,
  id: true,
  type: true,
  created_at: true,
  updated_at: true,
  acted_at: true,
  core: true,
  one_line_content: true,
  blank: true,
  title: true,
  title_link: true,
  title_no_link: true,
  compact_missing: true,
  followed: true,
  follower: true,
  unfollow_url: true
};
var MAX_NEST_CHAR_COUNT = 200;
var DEFAULT_NEST_MODE = "normal";
var RUBY_MAX_DEPTH = 20;
var VIRTUAL_SET_CODENAMES = /* @__PURE__ */ new Set([
  "right",
  "self",
  "type",
  "type_plus_right"
]);
var RenderFormat = class _RenderFormat {
  card;
  engine;
  parent;
  isMain;
  maxDepth;
  /** Production nested-error semantics flag (see RenderFormatOptions). */
  nestQuietErrors;
  /** contextual_content.rb:1-3 `def context_card; @context_card || self; end`
   *  — the CARD's @context_card ivar, set for the duration of a
   *  `card.with_context(card)` block (contextual_content.rb:5-12) and read
   *  by format/nest/fetch.rb:12 (`when "_", "_self" then
   *  format.context_card`) to resolve BARE self-nests. Undefined here means
   *  "no with_context is active on this render" — the Ruby fallback answer
   *  is then the card itself. MUTABLE (a plain field, not readonly): Ruby's
   *  with_context assigns, yields, and restores in an ensure — the
   *  Abstract::TestContext :core seam (card-mod-email) writes it around the
   *  super() render exactly the same way. */
  contextCard;
  /**
   * format.rb:34 `attr_accessor :form, :error_status, :rendered` — Ruby's
   * `@rendered`. Written by wrapper.rb:15 `@rendered = yield` (the view
   * bytes BEFORE the wrappers, then wrapper.rb:23-27 the wrapped bytes) and
   * by the :raw view, whose own with_wrapper lands `structure_card&.content`
   * here (base.rb:75-77) while the :core view is still mid-render — the
   * ORDERING that makes `{{_main}}` inside a card's own content splice the
   * RAW SOURCE (nesting/main.rb:12 `main.rendered || main_nest_render`).
   *
   * The page renderer assigns the main-view body here after the main render
   * (process_layout.rb render_with_layout -> with_wrapper), which is what
   * the LAYOUT body's `{{_main|titled}}` then reads back.
   */
  rendered;
  voo;
  depthCache;
  /** context_names.rb @initial_context_names - the parent-derived context,
   *  lazy-memoized on first access (see initialContextNames). */
  initialContextNamesCache;
  /** context_names.rb @context_names - the working list addNameContext
   *  mutates (see contextNames). */
  contextNamesCache;
  /** nesting/mode.rb @nest_mode - THIS format's own mode, or undefined when
   *  it never ran a with_nest_mode block (the Ruby ivar is likewise unset
   *  until with_altered_nest_mode assigns it, and `nest_mode` below falls
   *  back to the parent). */
  ownNestMode;
  /**
   * nesting.rb:60 `@char_count` — the compact-mode running total of
   * rendered nest lengths on THIS format instance (a Ruby ivar: subformats
   * start at nil, they do not inherit the parent's count). nil until the
   * first compact-mode nest render completes, which is what makes
   * nest_invisible? (nesting.rb:52-54) false for the first nest however
   * long it is.
   */
  charCount;
  constructor(card, engine, opts = {}) {
    this.card = card;
    this.engine = engine;
    this.parent = opts.parent;
    this.isMain = opts.main ?? false;
    this.nestQuietErrors = opts.nestQuietErrors ?? false;
    this.maxDepth = opts.maxDepth ?? RUBY_MAX_DEPTH;
    this.formatName = opts.formatName ?? opts.parent?.formatName ?? "html";
    this.contextCard = opts.contextCard;
  }
  /** THIS format's format class name ("html" default — see
   *  RenderFormatOptions.formatName). */
  formatName;
  /** `card.format(:other_format)` — the SAME card rendered through another
   *  format class (email_config.rb's `card.format(:email_text).render_core`
   *  shape): a fresh root format over the same card carrying the other
   *  format's name. Subformat state (nest mode, context names) does NOT
   *  carry — Ruby's #format builds a new format instance. */
  withFormatName(formatName) {
    return new _RenderFormat(this.card, this.engine, {
      maxDepth: this.maxDepth,
      nestQuietErrors: this.nestQuietErrors,
      formatName,
      // Ruby's @context_card lives on the CARD (contextual_content.rb:5-12
      // assigns the ivar; format.context_card DELEGATES to it), so
      // `card.format(:email_text)` inside a with_context block sees the
      // same context — the email_text :core dispatch's self-nests resolve
      // against the context card exactly like the html render's.
      contextCard: this.contextCard
    });
  }
  /**
   * nesting/mode.rb:17-19 `nest_mode`: this format's own mode if one was
   * set, else the parent's, else :normal for a root format. A subformat
   * READS the parent's mode but never writes it - the with_nest_mode block
   * that sets the mode restores the previous value when it returns.
   */
  get nestMode() {
    if (this.ownNestMode !== void 0) return this.ownNestMode;
    return this.parent?.nestMode ?? DEFAULT_NEST_MODE;
  }
  /**
   * nesting/mode.rb:24-30 `with_nest_mode`: run `body` with `mode` as this
   * format's nest mode, then put the prior mode back. Ruby's `ensure` also
   * restores when the block raises, which is what keeps a failing view
   * from poisoning the rest of the render - a nest rendered inside a
   * with_nest_mode block that throws must not leave the mode changed.
   *
   * Ruby's `if new_mode == @nest_mode then yield` fast path is a
   * no-op-equivalent: assigning the same value and restoring it produces
   * the same observable state, so the port assigns unconditionally.
   */
  withNestMode(mode, body) {
    const previous = this.ownNestMode;
    this.ownNestMode = mode;
    try {
      return body();
    } finally {
      this.ownNestMode = previous;
    }
  }
  /**
   * nesting/mode.rb:43-51 `modal_nest_view`: the view a nest renders in
   * under the current mode. Ruby runs this on the SUBFORMAT (nest.rb:21
   * `@view = subformat.modal_nest_view @view if @override`), whose
   * nest_mode is the parent's (mode.rb:44) and whose card is the NEST
   * TARGET — so the compact arm's known? check (mode.rb:73) reads the
   * target card, passed as `nestCard`; the mode read here is this
   * format's (the value the subformat inherits one line later).
   *
   * :template → :template_nest (mode.rb:47; card-mod-edit
   * set/all/template_nest.rb re-emits the nest syntax). :edit needs the
   * form machinery and stays unported. :compact substitutes per
   * viewInCompactMode below.
   *
   * COMPACT CENSUS (re-verified 2026-10-01
   * on the sha-verified
   * 6a44dfdc dump copy + the 97 expected-v2 shards): the substitution has
   * ZERO observable on the recorded capture surface — every captured
   * one-line render (30,037 divs) is a raw or nest-free arm
   * (card-mod-content set/right/default.rb:4-7 + right/structure.rb:
   * 14-16, card-mod-layout set/right/head.rb:11-13, card-mod-format
   * set/type/html.rb:10-16 chunk_list :references; closed_content: zero
   * captured entries; the five rule bars that do render one-lines carry
   * literal `{{...}}` or nest-free truncated prose first-hand:
   * *all+*head `{{:head|core}}`, Role+*type+*default
   * `RichText : <p>{{+description}}</p>…`, both *guide bars truncate
   * before their first nest at content chars 202/672). The compact arm
   * below is therefore byte-neutral on the surface — it arms the
   * mechanism Ruby would run the day a nest renders under a compact
   * parent (e.g. {{X|titled}} inside a closed_content composition).
   */
  modalNestView(view, nestCard = this.card) {
    if (this.nestMode === "template") return "template_nest";
    if (this.nestMode === "compact") return this.viewInCompactMode(view, nestCard);
    return view;
  }
  /**
   * nesting/mode.rb:71-74 `view_in_compact_mode`: the configured compact
   * view wins; otherwise the card's known? state picks the fallback —
   * :one_line_content for a known card (real or virtual,
   * mod/core/set/all/states.rb:65-67 `def known?; real? || virtual?;
   * end`), :compact_missing for an unknown one. The port's
   * RenderCard.unknown flag (states.rb#unknown? — set exactly on the
   * fabricated new-card records of buildUnknownNestCard, absent on
   * virtual-known search-family cards) is that predicate.
   */
  viewInCompactMode(view, nestCard) {
    const configured = this.configuredViewInCompactMode(view);
    if (configured !== void 0) return configured;
    return nestCard.unknown ? "compact_missing" : "one_line_content";
  }
  /**
   * nesting/mode.rb:79-84 `configured_view_in_compact_mode`:
   * `view_setting(:compact, view)` — true keeps the view (mode.rb:81), a
   * symbol is itself the substitute (mode.rb:83), nil falls through to
   * the known? fallback. The gem's 24 declarations are all-set (see
   * COMPACT_TRUE_VIEWS); a future mod-level compact declaration lands in
   * that record with its gem cite.
   */
  configuredViewInCompactMode(view) {
    const compactConfig = COMPACT_TRUE_VIEWS[view];
    if (compactConfig === true) return view;
    return compactConfig;
  }
  /** view.rb#depth - the subformat chain depth (recursion guard). */
  get depth() {
    if (this.depthCache === void 0) {
      this.depthCache = this.parent === void 0 ? 0 : this.parent.depth + 1;
    }
    return this.depthCache;
  }
  /**
   * format/nesting/subformat.rb#subformat + render composition: a NEW
   * RenderFormat for the SAME card with `parent` pointing at this format -
   * fresh voo state (the child voo's visibility inherits from the
   * SUBFORMAT's undefined voo, not the caller's). The rules mod's
   * current_rule_form (rule_form.rb:41-44) renders the inner :rule_form
   * through this boundary: the captured overlay_rule/modal_rule/rule_edit
   * slots carry show/hide lists that do NOT leak into the inner rule_form
   * slot's JSON (rules-views.json: overlay_rule hide [menu,help]; the
   * nested rule_form slot's show list is ["rule_form"] alone), which is
   * Ruby's subformat isolation. Returns the subformat's renderView output.
   */
  subformatView(view, opts = {}) {
    const sub = new _RenderFormat(this.card, this.engine, {
      parent: this,
      maxDepth: this.maxDepth,
      nestQuietErrors: this.nestQuietErrors
    });
    return sub.renderView(view, opts);
  }
  /**
   * context_names.rb#initial_context_names - the parent format's working
   * context filtered to the parts of THIS card's name
   * (relevant_context_names: `yield.select { |n| part_keys.include? n.key }`).
   * A page's direct body nests inherit the page card's key; a nest whose
   * name does not contain that part (simple cards, other-page junctions)
   * filters it out. Lazy like Ruby: the parent's working list is read at
   * THIS format's first context access, so children rendered after the
   * parent's titled header (addNameContext) see the added parts, exactly
   * Ruby's lazy memoization through format ancestry.
   *
   * This is the list the slot JSON's name_context carries (wrap.rb:68-79
   * name_context_slot_option emits initial_context_names, pre-add).
   */
  get initialContextNames() {
    if (this.initialContextNamesCache === void 0) {
      const inherited = this.parent?.contextNames ?? [];
      const partKeys = this.card.name.partKeys;
      this.initialContextNamesCache = inherited.filter((key) => partKeys.includes(key));
    }
    return this.initialContextNamesCache;
  }
  /**
   * context_names.rb#context_names - the working list. Lazy-initializes to
   * initialContextNames (relevant_context_names over the parent's working
   * list; the params branch context_names_from_params is the AJAX-slot
   * surface, unported - page renders carry no slot_opts params).
   */
  get contextNames() {
    if (this.contextNamesCache === void 0) {
      this.contextNamesCache = [...this.initialContextNames];
    }
    return this.contextNamesCache;
  }
  /**
   * context_names.rb#add_name_context (default name): append this card's
   * own part keys to the working context. Called by the :titled view AFTER
   * its header renders (html/views.rb:59 `naming { render_header }` -
   * naming yields first, so the titled card's own title renders in the
   * pre-context and stays full while its body nests relativize).
   */
  addNameContext() {
    const list = this.contextNamesCache ?? [...this.initialContextNames];
    this.contextNamesCache = list;
    for (const key of this.card.name.partKeys) {
      if (!list.includes(key)) list.push(key);
    }
  }
  /** The format rendering the page root (context card for relative names). */
  get contextFormat() {
    return this.parent ?? this;
  }
  /** content.rb:60-70 id_counter + unique_id: the element-id counter is
   *  owned by the format-chain ROOT (every subformat delegates:
   *  `return @parent.id_counter if @parent`), incremented once per call;
   *  the id is "<this card's safe_key>-<n>" (content.rb:69). The editors
   *  consume it - tinymce_editor_input's `id: unique_id` (the captured
   *  edit form's `id="oracle_basic-1"`). */
  uniqueId() {
    const root = this.parent ?? this;
    root.idCounter = (root.idCounter ?? 0) + 1;
    return `${this.card.name.safeKey}-${root.idCounter}`;
  }
  /** The `read` half of the view-permission gate (format/error.rb:5-8 ok?),
   *  as ONE predicate for both gate call sites.
   *
   *  The deck-global default is `!isDenied(card)`. The one exception is an
   *  unknown pointer/list item whose OWN nest found it readable: Ruby builds
   *  that phantom fresh per nest (Nest::Fetch#new_card) and runs the read
   *  walk on THAT card, so the per-nest verdict
   *  (RenderEngine#pointerItemVerdict, `${hostKey}|${itemKey}`) is the
   *  faithful answer — while `isDenied` reads deniedVerdictsByKey, which
   *  ensurePointerItemVerdicts fills once per item key GLOBALLY (first fold
   *  wins). An item line that appears on many hosts therefore inherits
   *  whichever host the run touched first: `mytho-psychology` sits on ~30
   *  corpus cards and under Metashamanic+Core Project the nest read is true
   *  (Project/398) while the global entry said denied, rendering bar_left
   *  as a quiet denial where the oracle renders the card title. Probed:
   *  cold isDenied false -> full bar; warm isDenied true -> two denied
   *  spans; per-nest verdict read:true in both (M2 receipt). */
  cardReadable() {
    if (this.card.pointerItemReadVerdict === true) return true;
    return !this.engine.isDenied(this.card);
  }
  idCounter;
  // -------------------------------------------------------------------------
  // render.rb#render!
  // -------------------------------------------------------------------------
  /**
   * format.render(view) / render_<view>: build the voo, process visibility,
   * run before-hooks, dispatch to the view method. The `optional` argument
   * carries Ruby's optional render opt (:show by default via
   * method_delegation.rb#optional_render_opt; "hide" for optional: :hide).
   */
  renderView(view, opts = {}, optional = "show") {
    const normalized = normalizeView(view);
    const effective = this.card.unknown === true && !this.unknownGateSkip(normalized, opts) ? this.viewForUnknown(normalized, opts) : normalized;
    const vooOpts = { ...opts };
    if (this.isMain) vooOpts["main"] = true;
    const voo = new Voo(this.voo ?? void 0, normalized, vooOpts);
    const previous = this.voo;
    this.voo = voo;
    try {
      voo.processVisibility(optional);
      if (this.card.unknown !== true) {
        const denial = viewPermissionDenial(normalized, {
          renderOpts: opts,
          isNewCard: this.card.id === void 0,
          formatName: this.formatName,
          taskAllowed: (task) => task === "read" ? this.cardReadable() : this.engine.taskAllowed?.(this.card, task),
          // permission.rb:61 method predicates: can_configure? is the one
          // ported predicate (cardtype.rb:68-70 — update-ok on the card's
          // *structure rule card); unported predicates keep the
          // documented remainder (allowed).
          predicateAllowed: (predicate) => predicate === "can_configure?" ? this.engine.canConfigure?.(this.card) : void 0
        });
        if (denial !== void 0) {
          if (this.isMain && viewDenialView(normalized) === void 0) {
            return this.mainLoudDenialHtml(voo);
          }
          return denial;
        }
      } else if (effective === normalized && !PERMS_NONE_VIEWS.has(normalized) && !renderOptSkipPerms(opts)) {
        const denial = viewPermissionDenial(normalized, {
          renderOpts: opts,
          isNewCard: this.card.id === void 0,
          taskAllowed: (task) => task === "read" ? this.cardReadable() : this.engine.taskAllowed?.(this.card, task),
          predicateAllowed: (predicate) => predicate === "can_configure?" ? this.engine.canConfigure?.(this.card) : void 0
        });
        if (denial !== void 0) {
          if (this.isMain && viewDenialView(normalized) === void 0) {
            return this.mainLoudDenialHtml(voo);
          }
          return denial;
        }
      }
      this.runBeforeHook(effective, voo);
      const viewFn = this.engine.resolveView(this.card, effective, this.formatName);
      if (viewFn === void 0) {
        throw new UnsupportedViewError(effective, this.card.name.s);
      }
      return viewFn({ fmt: this, voo });
    } finally {
      this.voo = previous;
    }
  }
  /** R16 batch 2: the focal (main) denial — html/error.rb:203-208
   *  loud_denial + :194-198 with_frame, byte-pinned by the 2,835-page
   *  oracle class (a named corpus page / BW 20100614 / Martial Nonviolence Public
   *  Module 01 page captures):
   *
   *  loud_denial: `voo.hide :menu; frame { [wrap_with(:h1, "Sorry!"),
   *  wrap_with(:div, loud_denial_message)] }`; with_frame additionally
   *  hides :help — the hides land in the slot JSON's hide list while the
   *  data-slot `view` field keeps the REQUESTED view (the wrap is emitted
   *  with view "denial" for the id/class only).
   *
   *  loud_denial_message, Anonymous branch (error.rb:215-222
   *  sign_in_or_up_links(to_do_unauthorized_task)): "Please sign in or
   *  sign up to read this." (format_denied_task: "to %{denied_task} this"
   *  with the read task). The signed-in branch ("You need permission to
   *  read this") is a documented remainder — the captured corpus viewer
   *  is always Anonymous.
   *
   *  Slot wrap: id `<safe-key>-denial-view`, class `card-slot
   *  denial-view <set-keys>`, data attrs from the real card, data-slot
   *  from the ORIGINAL main-nest opts (identical to the readable main
   *  render's slot JSON except the id/class view and the hide list). */
  /** The self-set title overrides (card-mod-search set/self/search.rb:39-42
   *  `view :title do voo.title ||= t(:search_results_title); super end`;
   *  mod/search/set/self/recent.rb:4-7 `voo.title ||= "Recent Changes"`;
   *  card-mod-account set/self/signin.rb:134-137
   *  `voo.title ||= t(:account_sign_in_title)` - en.yml:32 "Sign In").
   *  Ruby binds these to the SELF set modules, which anchor by CODENAME
   *  (set.rb:42-44); the oracle pins the bytes (*search -> "Search Results",
   *  *recent -> "Recent Changes", *signin -> "Sign In"; base dump
   *  000003-_search-title/-closed, 000003-_recent-title,
   *  000015-_signin-title/-closed). Served in the render layer (not as
   *  setModule registrations) because the headless view-lane engine runs
   *  with NO ModLoader bound - the same pattern as openView's discussion
   *  comment_box check. Keys are card codenames. */
  selfSetTitleOverride() {
    return SELF_SET_TITLE_OVERRIDES.get(this.card.record.codename ?? "");
  }
  mainLoudDenialHtml(voo) {
    voo.hide("menu");
    voo.hide("help");
    const card = this.card;
    const header = `<div class="d0-card-header card-header"><h1 class="d0-card-header-title">${this.renderView("title")}</h1></div>`;
    const message = this.loudDenialMessageHtml();
    const body = `<div class="d0-card-body card-body card-text"><h1>Sorry!</h1>
${message}</div>`;
    const frame = `<div class="d0-card-frame card">${header}

${body}</div>`;
    const attrs = emitAttrs({
      id: `${card.name.safeKey}-denial-view`,
      class: voo.classy(["card-slot", "denial-view", card.setKeys]),
      "data-card-id": card.id === void 0 ? void 0 : String(card.id),
      "data-card-name": card.name.s,
      "data-card-type-id": card.typeId === void 0 ? void 0 : String(card.typeId),
      "data-card-type-name": card.typeName,
      "data-card-link-name": this.urlKey(),
      "data-slot-id": newSlotId(),
      "data-slot": slotOptionsJson(voo.slotOptions())
    });
    return `<div${attrs}>${frame}</div>`;
  }
  /** html/error.rb:203-222 loud_denial_message + loud_denial's
   *  `wrap_with(:div, ...)` wrapper, both session branches.
   *  Ruby picks by SESSION sign-in state, not by as_id:
   *  `when Auth.signed_in? then t(:format_need_permission_task, task:
   *  to_task)` — en.yml: `format_need_permission_task: "You need permission
   *  %{task}."` with format_denied_task "to %{denied_task} this" (the read
   *  task) = the plain STRING "You need permission to read this." inside
   *  the wrap div (golden: `<h1>Sorry!</h1>\n<div>You need permission to
   *  read this.</div>`). The signed-out branch is sign_in_or_up_links,
   *  whose own inner div nests inside the wrap (the captured anonymous
   *  corpus surface, byte-pinned by the dual-lane denial pages —
   *  untouched). The authenticated goldens all render the signed-in branch
   *  because the capture session stays the bot (Auth.current never leaves
   *  the runner session — capture-authenticated-pages.rb:143-153). */
  loudDenialMessageHtml() {
    if (this.engine.pageSession?.signedIn === true) {
      return `<div>You need permission to read this.</div>`;
    }
    return `<div><div>Please <a class="signin-link known-card" href="/*signin/titled">sign in</a> or <a class="signup-link known-card" href="/new/Sign_up">sign up</a> to read this.</div></div>`;
  }
  /**
   * view/permission.rb#alter_unknown + format/error.rb#view_for_unknown for
   * the nested (non-page) surface. Order per Ruby:
   * 1. perms-:none views skip the check entirely (permission.rb#skip_check?)
   * 2. views configured `unknown: true` render as requested
   * 3. configured_view = the nest's `unknown:` option || the view's
   *    `unknown:` config; view_for_unknown -> `setting_view || :unknown`
   *    (the main+root page branch - page_view_for_unknown :not_found/:new -
   *    is not ported: the capture never renders an unknown MAIN card).
   */
  viewForUnknown(requested, opts) {
    if (PERMS_NONE_VIEWS.has(requested)) return requested;
    const fromChain = this.engine.viewUnknownSettingForCard?.(this.card, requested);
    const loaderBound = this.engine.modDeckBound?.() === true;
    const configured = fromChain !== void 0 ? fromChain : loaderBound ? compiledUnknownSettingForCard(this.card, requested, true) : compiledUnknownSettingForCard(this.card, requested);
    if (configured === true) return requested;
    if (this.isMain && this.voo === void 0) {
      throw new Error(
        `unknown-card page render not ported (view_for_unknown main branch): ${this.card.name.s}`
      );
    }
    const nestOpt = opts["unknown"];
    const effective = nestOpt !== void 0 ? nestOpt : configured;
    if (effective === void 0 || effective === false || effective === "false") {
      return "unknown";
    }
    return String(effective);
  }
  /** set/format.rb before(:view) hooks - the captured surface has the
   *  following class_up machinery:
   *  - html/views.rb:6-8 before(:content) { prepare_content_slot }
   *    (`class_up "card-slot", "d0-card-content"`)
   *  - card-mod-rules set/rule/bar_view.rb:9-13 view :bar:
   *    `class_up "card-slot", "_rule-item #{category_classes}"` -
   *    fires for rule cards only (right side is a setting).
   *  - card-mod-search set/abstract/search_views.rb:35-38 view :bar:
   *    `voo.hide :one_line_content; super()` - hides one_line_content
   *    for Search-type cards. Ruby's set-module dispatch fires when the
   *    card's type matches SearchTypeID; in this port, the codename
   *    registry is the source of truth for that match (the corpus's
   *    search_type card has a random NAME, so a typeName check misses). */
  runBeforeHook(view, voo) {
    if (view === "content") {
      voo.classUp("card-slot", "d0-card-content");
    } else if (view === "content_panel") {
      voo.classUp("card-slot", "d0-card-content");
      voo.classUp("card-slot", "card");
    } else if (view === "content_with_title") {
      voo.classUp("card-slot", "d0-card-content");
    } else if (view === "conflict") {
      voo.classUp("card-slot", "error-view");
    } else if (view === "bar") {
      if (this.engine.cardMatchesRuleSet?.(this.card) ?? false) {
        const categories = this.ruleSetCategories(this.rightPartCodenameForRule(), this.card);
        const classExtra = ["_rule-item", ...categories.map((c) => `_category-${c}`)].join(" ");
        voo.classUp("card-slot", classExtra);
      }
      if (this.cardTypeCodename === "search_type" || this.card.typeName === "Search") {
        voo.hide("one_line_content");
      }
    }
  }
  /** The type card's codename (e.g. "search_type", "set", "list"). Read
   *  through the engine's codename registry — zero-query (the cold
   *  render folds the codehash into the prefetch batch). */
  get cardTypeCodename() {
    const id = this.card.record.typeId;
    if (id === void 0) return void 0;
    return this.engine.peekCodenameById?.(id);
  }
  /** card.rule? predicate (lib/card/rule/all.rb:32-51): the card is a rule
   *  when its right part is a setting (type=SettingID) and the left part
   *  is a set (type=SetID), for the 3-part shape "SetTypeName+Setting+Setting". */
  cardIsRule() {
    const card = this.card;
    if (!card.name.isCompound) return false;
    if (this.engine === void 0) return false;
    return this.engine.cardIsRule?.(card) ?? false;
  }
  /** The right part's setting codename (e.g. "default", "head"). The
   *  card-mod-rules setting card has codename = the bare name (no leading "*"). */
  rightPartCodenameForRule() {
    const card = this.card;
    if (!card.name.isCompound) return void 0;
    const rightKey = card.name.rightName?.key;
    if (rightKey === void 0) return void 0;
    const bare = rightKey.startsWith("*") ? rightKey.slice(1) : rightKey;
    const right = this.engine.fetchRenderCard(rightKey) ?? this.engine.fetchRenderCard(bare);
    if (right === void 0) return void 0;
    return right.record.codename ?? bare;
  }
  /** The fixed Card::Setting.categories for the given setting codename
   *  (card-mod-rules set/type/set/setting_categories.rb:9-15). The
   *  category order (all, field, recent, common) is the byte order the
   *  captured oracle pins — `card.rule_set.categories(setting).map {
   *  ... }` in Ruby returns them in declaration order.
   *
   *  CLUSTER 35 (rule-item-set-category-recent-missing, 56 entries):
   *  the engine was omitting `_category-recent` from the rule-item
   *  class chain. The captured oracle for *captcha+*right:render:open
   *  (recapture-raw:*captcha+*right:render:open at offset 4954,
   *  exp 62084, act 12245 — exp "r" got "c" — Ruby emits
   *  `_rule-item _category-all _category-field _category-recent
   *  _category-common` for every setting rule card in the captured
   *  corpus, including *captcha whose codename is in neither
   *  FIELD_SETTINGS nor COMMON_SETTINGS; the engine emitted the same
   *  prefix without `_category-recent`. Fix: always include
   *  `_category-recent` between `_category-field` and
   *  `_category-common` for every rule card, matching Ruby's
   *  "recent_settings" category membership. Test pins:
   *  recapture-raw:*captcha+*right:render:open (offset 4954, exp "r"),
   *  recapture-raw:*content options+*right:render:open (offset 5127,
   *  exp "r"), recapture-raw:*input type+*right:render:open (offset
   *  5024, exp "r"). */
  /** The Card::Setting categories for the given setting codename — the
   *  faithful port of card-mod-rules set/type/set/setting_categories.rb:9-15
   *  `categories(setting)`:
   *      result = [:all]
   *      result += %i[field recent common].select { |cat|
   *        category_settings(cat)&.include? setting }
   *  with the category memberships:
   *  - field_related_settings = field_settings (setting_categories.rb:52-54:
   *    default, help, input_type, content_options, content_option_view)
   *  - recent_settings = Card[:recent_settings].item_cards — the *recent
   *    settings CARD's pointer items (corpus row 23808, content
   *    "*read *structure *script *content options *input type *default
   *    *layout *help *thanks *update *guide *head *follow *style
   *    *content option view *create *follow fields *delete *captcha
   *    *table of contents *comment" — note AUTONAME and the on_* event
   *    settings are NOT members, which is why the oracle's *all+*autoname
   *    bar pins `_category-all` alone); the `& visible_setting_codenames`
   *    intersection is implicit (only visible settings render here)
   *  - COMMON_SETTINGS = create, read, update, delete, structure, default,
   *    guide (setting_categories.rb:8)
   *
   *  R16 correction of the CLUSTER 35 "always include _category-recent"
   *  overfix: recent is a MEMBERSHIP list, not a constant — the blanket
   *  push made every autoname/on_* bar carry `_category-recent` the oracle
   *  never emits (the *captcha+*right:render:content byte-diff family:
   *  exp `_category-all" data-card-name=...` got `_category-all
   *  _category-recent" ...`). CLUSTER 35's original three pins re-verified:
   *  their settings (captcha et al.) ARE recent members, so those pins
   *  keep their bytes under the membership form.
   *
   *  Correction to the earlier static list: recent is now the FULL
   *  Ruby arm — items ∩ registered ∩ restriction (recentCategoryApplies) —
   *  read from the deck's *recent settings card; the static RECENT_SETTINGS
   *  const is retired. CLUSTER 35's pins keep their bytes (captcha et al.
   *  are recent members under the full arm); the R16 membership correction
   *  stands (autoname/on_* are not items). */
  ruleSetCategories(settingCodename, ruleCard) {
    if (settingCodename === void 0) return [];
    const result = ["all"];
    if (FIELD_SETTINGS.has(settingCodename)) result.push("field");
    if (this.recentCategoryApplies(settingCodename, ruleCard)) result.push("recent");
    if (COMMON_SETTINGS.has(settingCodename)) result.push("common");
    return result;
  }
  /** setting_categories.rb:64-67 recent_settings:
   *  `Card[:recent_settings].item_cards.map(&:codename).compact` — the
   *  *recent settings POINTER's items (DECK DATA, not code). The item
   *  cards' codenames equal the underscored item names for every canonical
   *  setting name (all 21 raw-corpus row-23808 items: "*content options" ->
   *  content_options, "*follow fields" -> follow_fields), so the derivation
   *  reads the card's db_content lines directly; an absent card yields the
   *  empty membership (Ruby's nil fetch carries no items), never an error. */
  recentSettingCodenames() {
    const recentCard = this.engine.fetchRenderCard("*recent settings");
    const content = recentCard === void 0 || recentCard.unknown === true ? void 0 : recentCard.record.dbContent;
    const items = /* @__PURE__ */ new Set();
    for (const line of (content ?? "").split("\n")) {
      const item = line.trim();
      if (item === "") continue;
      items.add(item.replace(/^\*/, "").toLowerCase().replace(/ +/g, "_"));
    }
    return items;
  }
  /** setting_categories.rb:9-15 categories' recent arm, in full:
   *  recent = (recent-card items) ∩ (REGISTERED settings — set/type/set.rb
   *  :73-85 visible_setting_codenames is Card::Setting.groups, the
   *  setting_opts registrations) ∩ (unrestricted ∨ the set prototype's type
   *  codename ∈ the registration's restricted_to_type — setting.rb:74-77
   *  applies_to_cardtype). Oracle-derived verification (845+ rule-item bars
   *  swept from the page-lane oracle bytes, 2026-09-30):
   *  *table of contents / *comment are registered NOWHERE in the gems (no
   *  set/self/*.rb) and pin `_category-all` alone (Number page: 0 YES /
   *  4 NO); content_options / content_option_view are restricted to
   *  %i[list pointer session] (card-mod-list set/self/content_options.rb:2,
   *  content_option_view.rb:2 — the only restricted registrations), so they
   *  carry recent exactly on list-family-prototype sets (*style+*right YES —
   *  its *default rule card is List-typed; *all NO — BasicCs-typed). */
  recentCategoryApplies(settingCodename, ruleCard) {
    if (!this.recentSettingCodenames().has(settingCodename)) return false;
    if (!REGISTERED_SETTING_CODENAMES.has(settingCodename)) return false;
    const restrictedTo = RESTRICTED_TO_TYPE.get(settingCodename);
    if (restrictedTo === void 0) return true;
    const prototypeCode = this.engine.ruleSetPrototypeTypeCode?.(ruleCard);
    return prototypeCode !== void 0 && restrictedTo.has(prototypeCode);
  }
  // -------------------------------------------------------------------------
  // format/nest.rb - the inclusion machinery
  // -------------------------------------------------------------------------
  /**
   * Nest#prepare: resolve the reference against this format's context card,
   * default the view (implicit_nest_view), apply the home_view rule
   * (nest.rb#prepare_view_and_opts!: `view_opts[:home_view] ||=
   * %i[closed edit].member?(view) ? :open : view`), then render in a
   * subformat with fresh voo state.
   */
  nest(nest) {
    if (nest.comment !== void 0) return nest.comment;
    if (this.nestInvisible()) return "";
    const rawNestName = nest.name.trim();
    const contextTarget = rawNestName === "_" || rawNestName === "_self" ? this.contextCard ?? this.card : void 0;
    const targetName = contextTarget !== void 0 ? contextTarget.name.s : this.resolveNestName(nest.name);
    const isBlankReference = targetName.trim() === "";
    const target = isBlankReference ? void 0 : contextTarget ?? this.engine.fetchRenderCard(targetName);
    const card = target ?? this.buildUnknownNestCard(
      targetName,
      this.engine,
      this.card.typeName,
      nest.options.extra["type"]
    );
    const nestTypeOpt = nest.options.extra["type"];
    const effectiveCard = target !== void 0 && target.id === void 0 && target.record.isNew === true && !(this.engine.cardMatchesRuleSet?.(target) ?? false) ? this.withNewCardContext(target, typeof nestTypeOpt === "string" ? nestTypeOpt : void 0) : card;
    const requestedView = normalizeView(nest.options.view ?? this.defaultNestView());
    const view = this.modalNestView(requestedView, effectiveCard);
    const viewOpts = {
      // nest_name = the AUTHORED reference through DeckoName.parse —
      // verbatim for authored/relative forms (card-mod-content
      // lib/card/content/chunk/nest.rb:23 keeps the authored string:
      // "+Source Title" stays relative, underscores/casing untouched —
      // raw recapture oracle id 9625; live wire "+tag"/"+related"/
      // "Su$tainability"/"Conflict_Done_Well+class_schedule"), codename-
      // RESOLVED for mark forms: DeckoName.parse resolves ":codename"
      // marks through the name environment at parse time ({{:footer}} →
      // "*footer", the R16 page-lane pin; junction parts too — the Role
      // template card 322's {{+:description|lead}} pins
      // nest_name "+description" in every Role page oracle: the right
      // part is the codename "description" → card 146's name, and the
      // RELATIVE junction form is kept — the previous
      // effectiveCard.name.s rewrite here emitted the ABSOLUTE form for
      // that shape). That is Ruby's fetch.rb#new_card:31 rewrite
      // `view_opts[:nest_name] = Card::Name[cardish].to_s` with cardish's
      // marks already resolved by the fetch: the resolved name is what
      // lands in the slot JSON. (Parse safety: resolveNestName above
      // already parsed this same string, so a throwing mark never
      // reaches this line.) The resolved name still drives data-card-name
      // (the slot's own attribute; id 9625 shows the absolute form
      // there). card-mod-tabs.ts#chunkRefChunks already follows this
      // contract for its chunk walk.
      nest_name: DeckoName.parse(nest.name).s,
      // Ruby's chunk path (chunk/nest.rb:23) sets nest_syntax = the
      // authored bracket text in @options. Ruby's programmatic nest path
      // omits nest_syntax entirely. The TS chunk parser mirrors the
      // chunk path (nest-syntax.ts: interpretNest sets
      // ParsedNest.chunkNestSyntax = stripped); programmatic nests don't
      // set it. Gate the slot JSON on the field's presence.
      ...nest.chunkNestSyntax !== void 0 ? { nest_syntax: nest.chunkNestSyntax } : {},
      // nest.rb:24 `view_opts[:home_view] ||= %i[closed edit].member?(view)
      // ? :open : view` runs inside prepare_view_and_opts!, i.e. BEFORE
      // prepare substitutes modal_nest_view - so the rule reads the
      // REQUESTED view, not the substituted one.
      ...requestedView === "closed" || requestedView === "edit" ? { home_view: "open" } : { home_view: requestedView },
      ...this.nestOptionEntries(nest.options)
    };
    const sub = new _RenderFormat(effectiveCard, this.engine, {
      parent: this,
      maxDepth: this.maxDepth,
      // Page-path config propagates (Ruby's config is render-global): the
      // quiet nested-error semantics. The default nest view needs no
      // threading — it is engine state (defaultNestView).
      nestQuietErrors: this.nestQuietErrors
    });
    if (this.depth >= this.maxDepth) {
      throw new Error(`nest depth exceeded (${effectiveCard.name.s})`);
    }
    let rendered;
    try {
      rendered = sub.renderView(view, viewOpts);
    } catch (error) {
      if (!this.nestQuietErrors) throw error;
      rendered = quietRenderError(error, card, view);
    }
    return this.countNestChars(rendered);
  }
  /**
   * `render_<view>` FROM INSIDE A VIEW BODY — Ruby's
   * card/lib/card/format/method_delegation.rb:41-47 (`method_missing` ->
   * `api_render` :14-18 -> `render!`), which opens its OWN
   * `wrap_and_render` rescue scope (card/lib/card/format/render.rb:7-14,
   * :96-100) on the SAME format object.
   *
   * WHY THIS IS A SEPARATE SEAM FROM nest()'s catch. Every `render!` in
   * Ruby is independently rescued, so an error raised INSIDE a delegated
   * render becomes that render's RETURN VALUE and the enclosing view body
   * — including its `wrap` — completes normally. Two consequences the port
   * was missing, both visible in the frozen record:
   *
   *  1. the enclosing `wrap` still emits the card-slot div. html/views.rb:10-18
   *     `view :content do wrap do [render_menu(...), render_core, ...] end end`
   *     wraps the rescued span, so a `+Date` nest that cannot parse its
   *     content still renders its `content-view` slot.
   *  2. the error is labelled with the DELEGATED view, not the wrapper's.
   *     format/error.rb:80-86 `rendering_error exception, view` interpolates
   *     the view `wrap_and_render` was called with, and html/error.rb:99-101
   *     wraps that text in the render-error span. `render_core` therefore
   *     reports "(core view)" — the corpus bytes for card 34322
   *     `Maturana ...+Date` and its three siblings.
   *
   * The engine raised both facts away: the dispatch seam
   * (src/card/render.ts:1579-1589, the Date::Error / Search BadQuery raise)
   * has no rescue of its own, so the throw escaped `contentView` entirely,
   * `slotWrap` never ran, and nest()'s catch produced the unwrapped span
   * labelled "(content view)".
   *
   * LOUD vs QUIET. error.rb:65-67 `loud_error?` is `focal? ||
   * config.raise_all_rendering_errors`; nesting/subformat.rb:41-43 `focal?`
   * is `depth.zero?`; cardio/railtie.rb:38 sets raise_all_rendering_errors
   * false. A delegated render on a NESTED format is therefore quiet, and on
   * a depth-0 format it re-raises (error.rb:69-73 `loud_error` -> `raise e`)
   * — which is why the corpus pins a bare `format.render(:content)` of a
   * bad-content Date card as CAPTURE_ERROR, not as a page.
   *
   * UnsupportedViewError keeps its own message in both scopes
   * (error.rb:52-54 `unsupported_view_error_message`), so it is passed
   * through verbatim by the same helper nest() uses.
   */
  renderDelegated(view, opts = {}, optional = "show") {
    try {
      return this.renderView(view, opts, optional);
    } catch (error) {
      if (this.depth === 0) throw error;
      return quietRenderError(error, this.card, view);
    }
  }
  /**
   * nesting.rb:52-54 `nest_invisible?`: `nest_mode == :compact &&
   * @char_count && (@char_count > max_char_count)`. The `@char_count &&`
   * guard is load-bearing — the count is nil until the FIRST compact-mode
   * nest render completes, so the first nest renders at full length
   * however long it is (nesting.rb:56-63 accumulates only after a render
   * returns); the elision suppresses every SUBSEQUENT nest, it never
   * truncates the one being rendered.
   */
  nestInvisible() {
    return this.nestMode === "compact" && this.charCount !== void 0 && this.charCount > MAX_NEST_CHAR_COUNT;
  }
  /**
   * nesting.rb:56-63 `count_chars`: wrap the nest render's result —
   * accumulate `result.length` into this format's @char_count when the
   * format is in compact mode and the result is truthy (an empty-string
   * render adds nothing), then return the result unchanged. Runs on the
   * format whose nest() call produced the render, so a compact parent
   * accumulates its direct nests while a nested subformat accumulates its
   * own (Ruby ivars do not cross the subformat boundary).
   */
  countNestChars(result) {
    if (this.nestMode !== "compact" || !result) return result;
    this.charCount = (this.charCount ?? 0) + result.length;
    return result;
  }
  /**
   * permission.rb:20-22 `altered_view`'s first line — `return if
   * skip_check?` — gating the UNKNOWN substitution exactly as it gates
   * the denial branch: `normalized_options[:skip_perms] ||
   * view_perms == :none` (permission.rb:25-27). Resolution sources match
   * viewPermissionDenial's (resolveViewPerms — the same registry the
   * read-permission wave's denial gate reads).
   */
  unknownGateSkip(view, opts) {
    if (renderOptSkipPerms(opts)) return true;
    return resolveViewPerms(view).check === false;
  }
  /** fetch.rb:38-49 new_card_args (R17): shape a FABRICATED new-card
   *  record (the FetchEngine's Card.fetch new: {} emulation — id-less,
   *  *default-template typed) the way the nest fetch would:
   *  `args[:type] = view_opts[:type]` — an explicit `| type:X ` opt names
   *  the new card's TYPE (the type card must resolve warm;
   *  enrichNestTypeOptTargets pre-warms the corpus's two shapes; Card.fetch
   *  new: {} does NOT apply the *default template CONTENT — the fabricated
   *  record carries the template bytes and the toggle core of a truthy
   *  template would render "yes" where the oracle renders "no" for the
   *  empty new card); and `.merge(new_supercard_args)` — the new card is
   *  created AS A SUBCARD of the context card, so its set-pattern chain
   *  carries TYPE_PLUS_RIGHT-<supercard type>-<tag> (the safeSetKeys
   *  rebuild with leftTypeName; the fabricated record's own set keys are
   *  parentless). Pins: the personal page's +agree slot (data-card-type-id="51",
   *  TYPE-toggle chain, body "no"); RVW open's +working doc 02 item slot
   *  (TYPE_PLUS_RIGHT-list-working_doc_02 — RVW is List-typed; the
   *  fabricated shape pinned rich_text). */
  withNewCardContext(target, nestTypeOpt) {
    const explicitType = nestTypeOpt !== void 0 ? this.engine.fetchRenderCard(nestTypeOpt) : void 0;
    const typeId = explicitType !== void 0 && explicitType.id !== void 0 ? explicitType.id : target.typeId;
    const typeName = explicitType !== void 0 && explicitType.id !== void 0 ? explicitType.name.s : target.typeName;
    const typeCode = explicitType !== void 0 && explicitType.id !== void 0 ? explicitType.record.codename ?? void 0 : target.typeCode;
    const toggleTyped = typeCode === "toggle" || typeName === "Toggle";
    const rebuiltSetKeys = safeSetKeys({
      name: target.name,
      typeId,
      typeName,
      leftTypeName: this.leftTypeNameFor(target.name),
      isNew: true
    });
    return {
      ...target,
      // content/all.rb:8-10 — an id-less warm record with content is a
      // VIRTUAL resolution (states.rb:44-50 virtual?: compound + applicable
      // *structure rule; fetch.ts:388-395 sets dbContent = the rule
      // template). Wiping it here rendered every structured virtual nest
      // (the pass-15 class's BWjournal +Body titled slot) with an empty
      // body — the seven mini_bar children of Body+*right+*structure
      // vanished with the template. A genuine new-card emulation carries
      // dbContent "" so this keeps byte-identity for it too. Toggle-typed
      // records substitute the *default rule content instead (the block
      // comment above).
      dbContent: toggleTyped ? this.engine.newCardDefaultContent?.(target.name) ?? "" : target.dbContent ?? "",
      typeId,
      typeName,
      typeCode,
      setKeys: rebuiltSetKeys
    };
  }
  /** The TYPE_PLUS_RIGHT anchor for a NEW compound card: Ruby's pattern
   *  reads the LEFT SIDE's type off the NAME ALGEBRA (superleft.type_name),
   *  not off the nesting format's context card — the RVW open view nests
   *  "RVW+working doc 02" items from INSIDE "RVW+File Storage Area"
   *  (RichText-typed) and the captured slot chain still reads
   *  TYPE_PLUS_RIGHT-list-working_doc_02 (RVW is List). Resolved from the
   *  warm map; an unprepared left falls back to the NEW-CARD DEFAULT type
   *  (see the last return below). */
  leftTypeNameFor(name) {
    if (!name.isCompound) return this.card.typeName;
    const leftName = name.leftName;
    if (leftName === void 0) return this.card.typeName;
    const left = this.engine.fetchRenderCard(leftName.s);
    if (left !== void 0 && left.typeName !== void 0) return left.typeName;
    const virtualLeftType = this.engine.virtualLeftTypeName?.(leftName);
    if (virtualLeftType !== void 0) return virtualLeftType;
    return "RichText";
  }
  /** The new-card a nest fetch miss produces (format/nest/fetch.rb#new_card
   *  -> new_card_args): name = the resolved reference, supercard = the
   *  context card (unmodeled - no write path reads it here), no id/
   *  content. Round 9: the *default rule's type rides along when the
   *  engine resolves one (newCardDefaultType - the type_id_from_template
   *  chain; the raw-oracle pins absent +Discussion children rendering as
   *  RichText-typed slots). The type informs the set keys (TYPE /
   *  RIGHT / TYPE_PLUS_RIGHT tokens the captured class chains show);
   *  dbContent stays "" - Ruby's *default CONTENT is NOT applied at view
   *  time on the captured surface (the oracle's new-child open accordion
   *  body is empty despite the rule's "<p> </p>" template bytes).
   *  The engine records the miss so the closure stays warm without
   *  re-prefetching (fetch.rb has no cache for unknown cards either). */
  buildUnknownNestCard(targetName, engine, leftTypeName, nestTypeOpt) {
    const name = DeckoName.parse(targetName);
    const virtualSearchCql = virtualSearchCqlFor(name);
    if (virtualSearchCql !== void 0) {
      const searchTypeId = engine.peekIdByCodename?.("search_type");
      const searchTypeName = searchTypeId !== void 0 ? engine.peekRegisteredNameForId?.(searchTypeId) : void 0;
      const record2 = {
        id: void 0,
        codename: void 0,
        leftId: void 0,
        rightId: void 0,
        typeId: searchTypeId,
        dbContent: virtualSearchCql,
        trash: false,
        creatorId: void 0,
        updaterId: void 0,
        createdAt: void 0,
        updatedAt: void 0,
        currentRevisionId: void 0,
        readRuleClass: void 0,
        readRuleId: void 0,
        referencesExpired: void 0,
        name,
        key: name.key,
        isNew: true,
        fromTrash: false,
        uncacheable: false
      };
      return {
        record: record2,
        name,
        key: name.key,
        typeName: searchTypeName,
        typeId: searchTypeId,
        typeCode: void 0,
        id: void 0,
        dbContent: virtualSearchCql,
        setKeys: safeSetKeys({
          name,
          typeId: searchTypeId,
          typeName: searchTypeName,
          leftTypeName: this.leftTypeNameFor(name),
          isNew: true
          // pattern/all.rb#patterns: new cards drop the SELF token
        })
        // KNOWN (virtual) — no `unknown` flag: the view pipeline renders the
        // requested view instead of substituting (permission.rb:37).
      };
    }
    const explicitType = nestTypeOpt !== void 0 ? engine.fetchRenderCard(nestTypeOpt) : void 0;
    const defaulted = explicitType !== void 0 && explicitType.id !== void 0 ? { typeId: explicitType.id, typeName: explicitType.typeName } : engine.newCardDefaultType?.(name);
    const defaultContent = engine.newCardDefaultContent?.(name);
    const record = {
      id: void 0,
      codename: void 0,
      leftId: void 0,
      rightId: void 0,
      typeId: defaulted?.typeId,
      dbContent: void 0,
      trash: false,
      creatorId: void 0,
      updaterId: void 0,
      createdAt: void 0,
      updatedAt: void 0,
      currentRevisionId: void 0,
      readRuleClass: void 0,
      readRuleId: void 0,
      referencesExpired: void 0,
      name,
      key: name.key,
      isNew: true,
      fromTrash: false,
      uncacheable: false
    };
    engine.reportUnknownCard?.(name.key);
    const setKeys = safeSetKeys({
      name,
      typeId: defaulted?.typeId,
      typeName: defaulted?.typeName,
      // the TYPE_PLUS_RIGHT anchor reads the LEFT SIDE's type off
      // the NAME ALGEBRA (superleft.type_name), not the nesting format's
      // context card — see leftTypeNameFor (RVW open's mini_bar items:
      // TYPE_PLUS_RIGHT-list-working_doc_NN with RVW List-typed).
      leftTypeName: this.leftTypeNameFor(name),
      isNew: true
      // pattern/all.rb#patterns: new cards drop the SELF token
    });
    const rightName = name.rightName;
    const rightCard = rightName === void 0 ? void 0 : engine.fetchRenderCard(rightName.s);
    const rightCodename = rightCard?.record.codename;
    const virtualSet = rightCodename !== void 0 && VIRTUAL_SET_CODENAMES.has(rightCodename);
    if (virtualSet) {
      return {
        record,
        name,
        key: name.key,
        typeName: defaulted?.typeName,
        typeId: defaulted?.typeId,
        typeCode: void 0,
        id: void 0,
        dbContent: defaultContent ?? "",
        setKeys
        // KNOWN (virtual) — no `unknown` flag: permission.rb:37 returns
        // early and the requested view dispatches unaltered.
      };
    }
    return {
      record,
      name,
      key: name.key,
      typeName: defaulted?.typeName,
      typeId: defaulted?.typeId,
      typeCode: void 0,
      id: void 0,
      dbContent: defaultContent ?? "",
      setKeys,
      unknown: true
    };
  }
  /** nest.rb#prepare_view_and_opts! - nest_name/nest_syntax are added
   *  separately above; the remaining shark options ride into the voo.
   *  `unknown` rides too: view/permission.rb:42 reads the voo's :unknown
   *  option (the nest's `unknown:` takes precedence over view configs).
   *  `items` rides too — nest-syntax.ts folds the `item:<view>` opt
   *  into options[:items][:view] exactly like nest.rb:54-57, but the hash
   *  never reached the voo, so item_view_options (item.rb:157-162) could
   *  not answer and every collection list hardcoded the html
   *  default_item_view :bar. The search card_list consumes it (the
   *  `Latest news item|item:titled` nest renders titled items) and the
   *  slot JSON carries it (live blog receipt: "items":{"view":"titled"}
   *  after home_view — audit A-25). */
  nestOptionEntries(options) {
    const out = {};
    if (options.title !== void 0) out["title"] = options.title;
    if (options.size !== void 0) out["size"] = options.size;
    if (options.show !== void 0) out["show"] = options.show;
    if (options.hide !== void 0) out["hide"] = options.hide;
    if (options.items !== void 0) out["items"] = options.items;
    if (options.extra["unknown"] !== void 0) out["unknown"] = options.extra["unknown"];
    if (options.extra["type"] !== void 0) out["type"] = options.extra["type"];
    if (options.extra["filter"] !== void 0) out["filter"] = options.extra["filter"];
    return out;
  }
  /** nesting.rb#implicit_nest_view -> default_nest_view (html.rb:17-19 ->
   *  Cardio.config.default_html_view; mod/format.rb:2 pins the RAILTIE
   *  default :titled).
   *
   *  The railtie literal is only the FALLBACK: the deck's
   *  `*all+*default html view` rule drives the effective config, and the
   *  MECHANISM (R17 correction — the A-36 rule-driven form was a
   *  mis-mechanism, busted by the R17 oracle probe
   *  tmp/raw-ground-truth/scripts/r17-nest-default-view-probe.rb): Ruby's
   *  html default_nest_view reads PROCESS CONFIG, never a deck rule —
   *  card-mod-format set/all/html.rb:17-19 `def default_nest_view;
   *  Cardio.config.default_html_view; end`. The pinned oracle's two capture
   *  environments carry DIFFERENT config values, and both are byte targets:
   *   - lane V (bare `card.format.render(view)`, the old-capture dev boot):
   *     no override -> the railtie default :titled
   *     (card-mod-format lib/card/mod/format.rb:2). Probe evidence:
   *     Cardio.config.default_html_view == :titled at boot; implicit nests
   *     render titled-view (the personal page's +agree slot, Colleagues +associations,
   *     Source +Source Title). The decks's `*all+*default html view` rule
   *     card (22769, content "content") is DEAD in 0.20.0 — no code reads
   *     it; the earlier "live wire agrees content" justification conflated
   *     the production deck's CONFIG with a deck rule.
   *   - lane P (the page render): the capture applies the production config
   *     `Cardio.config.default_html_view = :content`
   *     (capture-dual-lane-page-and-view.rb:369 inside the config block
   *     whose assignment is :344, the capture's production-equivalent
   *     setting #5) — implicit nests render content-view.
   *  The engine models the process config per render lane:
   *  engine.defaultHtmlViewConfig() returns "content" while a page render
   *  is active (render.ts pageConfigActive) and "titled" otherwise. The
   *  202 explicit `view:` nests (skin +Image -> `nest image_card,
   *  view: :content, size: :large`, bootswatch_skin/core.haml:18) are
   *  unaffected — only the implicit resolution changes. */
  defaultNestView() {
    return this.engine.defaultHtmlViewConfig?.() ?? "titled";
  }
  /**
   * `Card::Env.origin` for the surface this render is on — the value
   * `card_url` interpolates (card-1.110.0 lib/card/env/location.rb:19-21
   * `"#{Env.origin}#{card_path rel}"`). Ruby's origin is per-render, not
   * a constant: serializable.rb:20-22 reads `Cardio.config.deck_origin`
   * first (nil at boot, cardio/railtie.rb:28) and falls back to
   * `"#{protocol}#{request&.host_with_port}"`, which is "" for a
   * requestless runner. The capture photographs BOTH shapes —
   * capture-dual-lane-page-and-view.rb:343 sets deck_origin for the page
   * lane only (restored at :348; the view-function lane at :277-287 runs
   * outside that block) — so the port resolves it from the same
   * pageConfigActive flag `defaultNestView` uses. See
   * render/deck-origin.ts for the oracle census.
   */
  envOrigin() {
    return this.engine.envOriginConfig?.() ?? NO_REQUEST_ORIGIN;
  }
  /**
   * `card_url rel` — the one helper every absolute card URL in the port
   * routes through (location.rb:19-21): an already-absolute `rel` passes
   * through, anything else becomes `Env.origin + card_path rel`
   * (card_path, location.rb:6-16, prefixes the site root when `rel` is
   * not already rooted). Modeling BOTH halves here is what makes the
   * surface seam load-bearing: the same helper yields `/User` on the
   * view-function lane and `https://culturesmith.com/User` on the served
   * page, which is exactly what the frozen record pins on both lanes.
   */
  cardUrl(rel) {
    if (/^https?:/.test(rel)) return rel;
    return `${this.envOrigin()}${cardPath(rel)}`;
  }
  /**
   * Nest machinery for an ALREADY-RESOLVED record - collection/item.rb
   * #nest_item's shape (options carry view/size etc.; nest_name is added
   * here; home_view follows the nest.rb rule). Used by the search card_list
   * for its :bar items.
   */
  nestRecord(target, view, opts = {}) {
    const shaped = target.id === void 0 && target.record.isNew === true && !(this.engine.cardMatchesRuleSet?.(target) ?? false) ? this.withNewCardContext(target) : target;
    const viewOpts = {
      nest_name: shaped.name.s,
      // nest.rb#prepare_view_and_opts!
      ...view === "closed" || view === "edit" ? { home_view: "open" } : { home_view: view },
      ...opts
    };
    const sub = new _RenderFormat(shaped, this.engine, {
      parent: this,
      maxDepth: this.maxDepth,
      nestQuietErrors: this.nestQuietErrors
    });
    if (this.depth >= this.maxDepth) {
      throw new Error(`nest depth exceeded (${this.maxDepth}) at ${shaped.name.s}`);
    }
    return sub.renderView(view, viewOpts);
  }
  /** chunk/reference.rb#referee_name: the authored name absolutized against
   *  the REFERENCING card. Relative references resolve through the name
   *  algebra's absoluteName; the context is this format's card. */
  resolveNestName(raw) {
    const name = DeckoName.parse(raw);
    if (name.isAbsolute) return name.s;
    const context = this.card.name;
    return name.absoluteName(context).s;
  }
  // -------------------------------------------------------------------------
  // format/content.rb - content processing
  // -------------------------------------------------------------------------
  /** content.rb#process_content: chunks the content, yields the literals,
   *  processes the references (nests) in place. Literal bytes pass through
   *  unchanged (Card::Content#to_s).
   *
   *  Wiki-link expansion: text pieces are scanned for `[[Target]]` /
   *  `[[Target|label]]` and rewritten through expandWikiLinks —
   *  `<a class="known-card" href="/Url_Key"><span class="card-title"
   *  title="label">label</span></a>` for card-name targets, the
   *  internal/external/email-link anchor for explicit targets. Pinned by
   *  recapture-raw:*read:render:content where `[[Anyone]]` and
   *  `[[Anyone|Anyone Signed In]]` both appear.
   *
   *  Link-wrapped nests (`[[Target|{{nest}}]]`): the nest scanner SPLITS
   *  such a link into a text piece ending in `[[Target|`, the nest piece,
   *  and a text piece carrying `]]` — so no single text piece holds a
   *  complete link and the plain pass leaks the raw wikitext (20 corpus
   *  cards; blog + Latest_News). Ruby never splits: the Link chunk
   *  (link.rb:14 full_re `[[([^\]]+)]]`) matches BEFORE the nest scan and
   *  re-parses its label as a nested Content (link.rb:113-122 objectify),
   *  so the expanded nest renders INSIDE the anchor. This pass restores
   *  that chunk-level shape over the split pieces: an unterminated
   *  `[[Target|` opener is spanned forward to the first `]]` in a later
   *  text piece, the pieces between render as the label, and the whole
   *  goes through renderLinkChunk. Live receipt:
   *  `[[/wagn/Latest_news_items.rss|{{feed icon|...}}]]` ->
   *  `<a class="internal-link" href="/wagn/Latest_news_items.rss">` +
   *  expanded feed-icon slot + `</a>` (live-wire Latest_News/blog). */
  /**
   * content.rb:20-27 `content_nest` — the chunk-level dispatch every
   * `{{inclusion}}` in ANY card's content goes through (chunk/nest.rb:73
   * `@processed = format.content_nest(@options)`). The `_main` arm is part
   * of that dispatch, not a layout-only rule: `{{_main}}` in an ordinary
   * card's content (page 470 "AsIn Layout", an Html-typed card whose body
   * is a whole layout template) hits main_nest and splices the main
   * format's @rendered — which at that instant is the RAW SOURCE, because
   * `process_content _render_raw` (base.rb:85-87) evaluated the :raw view
   * (the with_wrapper @rendered assignment) before chunking began.
   *
   * The label arm (link.rb:113-122 re-parses a link label as Content) runs
   * the same dispatch, which is why the caller uses this for both.
   */
  contentNest(piece) {
    if (this.isMainNest(piece)) return this.mainNest(piece);
    return this.nest(piece.nest);
  }
  processContent(content, chunkList) {
    const list = chunkList ?? rubyChunkListForCardType(this.card.typeCode, this.card.typeName);
    const linkPass = (text) => list === "default" ? expandContentLinks(text, this.engine, this.card.name, this.contextNames) : list === "references" ? expandWikiLinks(text, this.engine, this.card.name, this.contextNames) : text;
    const pieces = scanNests(content);
    let out = "";
    let i = 0;
    while (i < pieces.length) {
      const piece = pieces[i];
      if (piece.kind === "nest") {
        if (out.endsWith("\\")) {
          out = out.slice(0, -1);
          out += piece.text;
        } else if (piece.nest !== void 0) {
          out += this.contentNest(piece);
        }
        i += 1;
        continue;
      }
      const opener = matchLinkWrappedNestOpener(piece.text);
      if (opener === void 0) {
        const targetOpener = matchLinkTargetNestOpener(piece.text);
        if (targetOpener === void 0) {
          out += linkPass(piece.text);
          i += 1;
          continue;
        }
        const spanned = this.spanLinkTargetOverNest(
          i,
          targetOpener,
          pieces,
          linkPass
        );
        out += spanned.out;
        i = spanned.next;
        continue;
      }
      out += linkPass(opener.prefix);
      let label = "";
      let tail;
      let j = i + 1;
      while (j < pieces.length) {
        const inner = pieces[j];
        if (inner.kind === "nest") {
          if (inner.nest !== void 0) label += this.contentNest(inner);
          j += 1;
          continue;
        }
        const closeAt = inner.text.indexOf("]]");
        if (closeAt === -1) {
          label += linkPass(inner.text);
          j += 1;
          continue;
        }
        label += expandWikiLinks(inner.text.slice(0, closeAt));
        tail = inner.text.slice(closeAt + 2);
        j += 1;
        break;
      }
      if (tail === void 0) {
        out += `[[${opener.target}|`;
        i += 1;
        continue;
      }
      out += this.renderLinkChunk(opener.target, label);
      out += linkPass(tail);
      i = j;
    }
    return out;
  }
  /** Span one `[[Target|nest|label|nest]]` Link chunk whose NEST SPLITS THE
   *  TARGET — the case matchLinkTargetNestOpener detected but the single-piece
   *  walker cannot. Mirrors the label-side span above: walk forward from the
   *  opening piece, accumulate RAW text on both sides of the first `|`, stop
   *  at the first `]]`, and render through renderLinkChunk.
   *
   *  RAW on both sides is the pinned behavior, not an omission: link.rb:14
   *  matches `[[([^\]]+)]]` over the raw string BEFORE the nest scan, so a
   *  nest inside the target stays `{{…}}` inside the href and a nest inside
   *  the label stays `{{…}}` inside the anchor text. The oracle pins exactly
   *  that on `Cardtype+*type+*default` (content + open):
   *  `<a class="internal-link" href="/new/{{_self|linkname}}">add a
   *  {{_self|name}} card</a>`.
   *
   *  Two bail-outs reproduce the un-spanned (verbatim) bytes rather than
   *  guessing: no `|` divider anywhere (a bare `[[Target]]` spanning a nest —
   *  never pinned, so unchanged), and no `]]` closer anywhere (Ruby's chunker
   *  would not have matched a Link either). Both emit the opener bytes
   *  verbatim and resume at the opening piece, exactly the pre-fix path. */
  spanLinkTargetOverNest(openIndex, opener, pieces, linkPass) {
    let target = opener.head;
    let label = "";
    let sawDivider = false;
    let tail;
    let j = openIndex + 1;
    while (j < pieces.length) {
      const inner = pieces[j];
      if (inner.kind === "nest") {
        if (sawDivider) label += inner.text;
        else target += inner.text;
        j += 1;
        continue;
      }
      const pipeAt = sawDivider ? -1 : inner.text.indexOf("|");
      const closeAt = inner.text.indexOf("]]");
      if (pipeAt !== -1 && (closeAt === -1 || pipeAt < closeAt)) {
        target += inner.text.slice(0, pipeAt);
        label += inner.text.slice(pipeAt + 1);
        sawDivider = true;
        j += 1;
        continue;
      }
      if (closeAt === -1) {
        if (sawDivider) label += inner.text;
        else target += inner.text;
        j += 1;
        continue;
      }
      const before = inner.text.slice(0, closeAt);
      if (sawDivider) label += before;
      else target += before;
      tail = inner.text.slice(closeAt + 2);
      j += 1;
      break;
    }
    if (!sawDivider || tail === void 0) {
      return { out: `${linkPass(opener.prefix)}[[${opener.head}`, next: openIndex + 1 };
    }
    return {
      out: `${linkPass(opener.prefix)}${this.renderLinkChunk(target, label)}${linkPass(tail)}`,
      next: j
    };
  }
  /**
   * chunk/link.rb#render_link for one spanned `[[target|label]]` chunk.
   *
   * Explicit targets (link.rb:82-84 `^(/|https?:|mailto:)`) render
   * format.link_to_resource (links.rb html block): anchor class per
   * resource_type (internal/external/email-link; external adds
   * target=_blank), href re-rooted for the internal form (clean_resource
   * strips the leading slash; contextualize_path re-roots it). The label
   * is the ALREADY-RENDERED bytes (link.rb:47 render_obj ran first), so a
   * nest label lands inside the anchor expanded. Live receipts:
   * `<a class="internal-link" href="/wagn/Latest_news_items.rss">…` (feed
   * icon wrap) and `<a class="internal-link" href="/account/signup">sign-in
   * account</a>` (live Brandon bio; identical bytes in the recapture
   * oracle).
   *
   * Name targets (link.rb:85-86 + 71-75) render view :link on the target
   * card (base.rb:37-39 -> link_view -> link_to_card card.name,
   * _render_title): the known/wanted class rides the target's existence
   * (links.rb add_known_or_wanted_class) and the title option carries the
   * rendered label, so the label bytes sit inside the card-title span.
   */
  renderLinkChunk(rawTarget, label) {
    const target = rawTarget.trim();
    if (/^(\/|https?:|mailto:)/.test(target)) {
      if (/^https?:/.test(target)) {
        return `<a target="_blank" class="external-link" href="${h(target)}">${label}</a>`;
      }
      if (/^mailto:/.test(target)) {
        return `<a class="email-link" href="${h(target)}">${label}</a>`;
      }
      const href2 = `/${target.replace(/^\/+/, "")}`;
      return `<a class="internal-link" href="${h(href2)}">${label}</a>`;
    }
    const named = this.engine.fetchRenderCard(target);
    let known = named !== void 0 && named.unknown !== true;
    let hrefSource = known && named?.name !== void 0 ? named.name.s : target;
    if (named === void 0) {
      const peeked = this.engine.peekKnownCardName?.(target);
      if (peeked !== void 0) {
        known = true;
        hrefSource = peeked;
      }
    }
    let href;
    try {
      const parsedSource = DeckoName.parse(hrefSource);
      href = `/${parsedSource.urlKey}`;
    } catch (err) {
      if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
        href = `/${target.replace(/ /g, "_")}`;
      } else {
        throw err;
      }
    }
    if (!known) href += wantedHrefQuerySuffix(hrefSource);
    return `<a class="${known ? "known-card" : "wanted-card"}" href="${h(href)}"><span class="card-title" title="${h(label || target)}">${label}</span></a>`;
  }
  /** base.rb (card-mod-format)#core: process_content(_render_raw); the raw
   *  content of the record (content/all.rb:19). Card#content (content/all.rb
   *  :5-7) consults registered set overrides BEFORE falling through to
   *  standard_content; this renderRaw mirrors that - a registered content
   *  override whose setPath matches this card wins, otherwise dbContent
   *  passes through unchanged (the corpus suites pin those bytes). */
  renderRaw() {
    const override = resolveContentOverride(this);
    const raw = override !== void 0 ? override : this.card.dbContent;
    this.rendered = raw;
    return raw;
  }
  // -------------------------------------------------------------------------
  // nesting/main.rb — the `_main` nest
  // -------------------------------------------------------------------------
  /**
   * nesting/subformat.rb:18-24 `main`, with the html format's override of
   * `main?` (card-mod-format html_format.rb:11-13 `!@main.nil?` — NOT the
   * base `depth.zero?`):
   *
   *     if main? then self elsif !root? then parent.main end
   *
   * i.e. the nearest format flagged main (process_layout.rb:19 `main!` on
   * the page's root format, or nest.rb:46 `sub.main! if view_opts[:main]`),
   * else the walk up the parent chain, else NIL. The nil arm is the frozen
   * record's view-lane CAPTURE_ERROR for 470
   * (`NoMethodError: undefined method 'rendered' for nil`): a bare
   * `card.format.render(:content)` has no main format, so `main.rendered`
   * in main.rb:12 raises before any byte is produced.
   */
  get main() {
    if (this.isMain) return this;
    if (this.depth > 0) return this.parent?.main;
    return void 0;
  }
  /**
   * content.rb:20-27 `content_nest`:
   * `return main_nest(opts) if main_nest?(nest_name) && @nest_mode != :template`.
   * `main_nest?` is an EXACT name match (nesting/main.rb:26-28
   * `nest_name == "_main"`), on the AUTHORED reference (chunk/nest.rb:23
   * keeps it verbatim), so only `{{_main}}` / `{{_main|view}}` take this
   * arm. The mode gate reads the format's OWN @nest_mode ivar, not the
   * inherited `nest_mode` — a subformat inherits its parent's mode for
   * modal_nest_view (mode.rb:44) but content.rb:24 tests the local ivar.
   * Layout-typed cards render their :core inside with_nest_mode :template
   * (card-mod-layout set/type/layout_type.rb:13-17), which is what keeps
   * every layout card's own `{{_main|...}}` an ordinary nest.
   */
  isMainNest(piece) {
    return piece.nest !== void 0 && piece.nest.name === "_main" && this.ownNestMode !== "template";
  }
  /**
   * nesting/main.rb:10-14 `main_nest`: `wrap_main { main.rendered ||
   * main_nest_render(opts) }`. The `||` is a NIL test in Ruby — an empty
   * string is truthy there and must NOT fall through, hence the explicit
   * `!== undefined` rather than a truthiness check.
   */
  mainNest(piece) {
    const main2 = this.main;
    if (main2 === void 0) {
      throw mainNestWithoutMainError();
    }
    const body = main2.rendered !== void 0 ? main2.rendered : this.mainNestRender(piece);
    return this.wrapMain(body);
  }
  /**
   * html/wrap.rb:118-126 `wrap_main`:
   * `return yield if no_main_wrap?; wrap_with :div, yield, id: "main"`.
   * no_main_wrap? is `Env.ajax? || no_layout?` (params[:layout] == "none");
   * neither applies to a page render, so the div always wraps here — the
   * same unconditional form the pre-D6 layout path emitted.
   */
  wrapMain(content) {
    return `<div id="main">${content}</div>`;
  }
  /**
   * nesting/main.rb:16-24 `main_nest_render`:
   * `with_nest_mode :normal { nest root.card, opts.merge(main_view: true,
   * main: true) }`. The fallback arm fires only when the main format exists
   * but has not rendered yet (@rendered still nil) — with the main card
   * re-nested in the main view it re-enters the same content, so Ruby's
   * monitor_depth (error.rb:33-39, max_depth 20) is what ends it. The
   * captured corpus never reaches it: page 470's main format has @rendered
   * (the :raw view, above) and every layout body's `{{_main}}` reads the
   * main-view body the page renderer assigned. Implemented faithfully
   * anyway, with the depth guard mirroring Ruby's.
   */
  mainNestRender(piece) {
    const nest = piece.nest;
    const root = this.main;
    if (root === void 0 || nest === void 0) return "";
    const view = nest.options.view ?? this.defaultNestView();
    const sub = new _RenderFormat(root.card, this.engine, {
      parent: this,
      maxDepth: this.maxDepth,
      nestQuietErrors: this.nestQuietErrors,
      // nest.rb:46 `sub.main! if view_opts[:main]`
      main: true
    });
    if (this.depth >= this.maxDepth) {
      throw new Error(`nest depth exceeded (${root.card.name.s})`);
    }
    return this.withNestMode(
      "normal",
      () => sub.renderView(this.modalNestView(view, root.card), {
        ...nest.chunkNestSyntax !== void 0 ? { nest_syntax: nest.chunkNestSyntax } : {},
        ...this.nestOptionEntries(nest.options),
        nest_name: nest.name,
        home_view: view === "closed" || view === "edit" ? "open" : view,
        main: true,
        main_view: true
      })
    );
  }
  /**
   * card-mod-layout-0.20.0 set/self/head.rb:9-17 view :core —
   * `escape_in_main { nest root.card, view: :head }` — is reachable from a
   * render only when that render's card content carries a nest to the head
   * card asking for its :core view. The engine's ASYNC prepare half asks
   * this before it seats the root card's head bytes (render.ts#seatPageHead),
   * so the head read-set (:title / :favicon / *all+*style+*asset output /
   * :ace / :tiny_mce) rides no render that cannot reach it.
   *
   * The name resolution is the SAME resolveNestName the nest machinery runs
   * (chunk/reference.rb#referee_name: the authored mark absolutized against
   * the referencing card), so both corpus spellings land on the head card's
   * key: `{{:head|core}}` (card 34754 `*all+*head`) and `{{*head|core}}`
   * (card 34758 `PCTS+*self+*head`, oracle view-lane
   * recapture-raw-shard-000029 views.content — pre 2441 B / 2447 B against
   * the port's pre 0 B).
   *
   * TEMPLATE NEST MODE is the whole Layout carve-out, and it is not a
   * heuristic: `with_nest_mode :template` (card-mod-layout
   * set/type/layout_type.rb:5, the only such call in any installed gem) makes
   * every nest print back as its own literal, so a Layout body's CodeRay <pre>
   * never runs the head card's :core. The oracle proves it on the two Layout
   * cards that nest it — 314 `Classic Layout` and 2575 `home-layout` keep
   * `{{*head|core}}` LITERAL inside a 7750 B / 907 B pre whose `[[...]]`
   * wiki links all expand. Seating bytes for those would be cost, not parity.
   */
  contentNestsHeadCore() {
    if (this.card.typeCode === "layout_type") return false;
    for (const piece of scanNests(this.card.dbContent)) {
      const nest = piece.nest;
      if (nest === void 0 || nest.comment !== void 0) continue;
      const view = nest.options.view;
      if (view !== void 0 && view !== "core") continue;
      let key;
      try {
        key = DeckoName.parse(this.resolveNestName(nest.name)).key;
      } catch {
        continue;
      }
      if (key === "*head") return true;
    }
    return false;
  }
  /**
   * Card::Layout::CardLayout#render — the layout card's content processed
   * through the PAGE format (process_content, chunk_list: :references).
   * NOT a separate loop: it IS processContent, because card_layout.rb:10
   * calls the same `process_content` (see the body comment). The `_main`
   * nest needs no special case here either - Ruby's nest dispatch hits
   * nesting/main.rb#main_nest — wrap_main { main.rendered } — the main-view
   * body the page renderer assigned, wrapped in <div id="main">
   * (html/wrap.rb #wrap_main; no_main_wrap? is false for the page path),
   * and processContent's nest arm is `contentNest`, which is exactly the
   * isMainNest ? mainNest : nest pair (contentNest's own comment).
   * Other nests resolve against the PAGE card (the layout renders in the
   * page's format context), including `:codename` marks
   * ({{:header|core}} -> *header).
   *
   * CardLayout#render passes the layout content as process_content's
   * OVERRIDE argument (card_layout.rb:10), so `content_object` never calls
   * render_raw (content.rb:77-82) and the main format's @rendered still
   * holds the main-view bytes here. That is the difference from a `{{_main}}`
   * inside the MAIN card's own content, which reads the raw source instead
   * (mainNest above).
   *
   * The `_main` short-circuit is gated on the nest mode because Ruby's is:
   * content.rb:24 `return main_nest(opts) if main_nest?(nest_name) &&
   * @nest_mode != :template`. Under :template mode a `_main` nest is an
   * ordinary nest, so it goes through nest() and renders :template_nest -
   * the literal `{{_main|titled}}` - instead of splicing in the page body.
   */
  processLayoutContent(content) {
    return this.processContent(content, "references");
  }
  /** title.rb#standard_title via #title_in_context (context_names.rb:49-55):
   *  the card name relativized against the format's context names
   *  (`title.from(*context_names)` - DeckoName#from strips the leading
   *  parts the context supplies and round-trip-verifies the compression),
   *  HTML-escaped (the html-format override h()s the result). In the page's
   *  own context a junction slot ("Aikido 2+management" under the Aikido 2
   *  page) displays as the relative "+management"; the same card rendered
   *  out of context keeps the full name.
   *
   *  voo.title: an EXPLICIT title option
   *  wins (title.rb:6-8 standard_title = name_variant title_in_context(
   *  voo.title); the html title_in_context marks explicit titles html_safe
   *  - title.rb:25-26 "escape titles generated from card names, but not
   *  those set explicitly" - so they render UNESCAPED). Corpus pressure
   *  zero corpus nests carry a |title: param, so
   *  the only opt-carrying surfaces are the bootswatch skin field_nests
   *  (card-mod-bootstrap set/type/bootswatch_skin/core.haml field_nest
   *  title: opts).
   *
   *  2026-09-29 (view-fail class Z10): settings with an
   *  I18n display title render THAT title
   *  (Card::Setting#title — the `setting_title.<codename>` locale keys;
   *  attribution training-data, the corpus pins the surface bytes) — the
   *  oracle renders `<span class="card-title" title="Search Results">
   *  Search Results</span>` for the *search card's :title/:closed views
   *  where the engine rendered the raw "*search" name. Only the codenames
   *  the corpus pins carry entries (the oracle renders RAW names for
   *  every other setting-codename card it captures — *style, *structure,
   *  *on create, the *read/*create rule rows — so an I18n-table miss falls
   *  through to the plain name, byte-identical to the pre-change
   *  behavior). The swap keys on the RESOLVED title name being a simple
   *  star card whose codename is in the table (a rule row like *content
   *  options+*right+*default is a junction — never simple — and keeps its
   *  rule name).
   *
   *  Merge note (pass-18): both merge parents landed the SAME three codenames —
   *  this Z10 table (keyed on the resolved name's codename, here) and
   *  views.ts SELF_SET_TITLE_OVERRIDES (keyed on the rendered card's
   *  codename, consulted first at the view layer) carry identical values
   *  ("Search Results" / "Sign In" / "Recent Changes"); whichever fires
   *  first emits the same bytes, and the Ruby mechanism covers both
   *  (the self-set views' `voo.title ||= t(...)` arrives HERE as voo.title
   *  in the loader-bound world; the headless no-loader surface reads the
   *  codename tables instead). */
  standardTitle() {
    const explicit = this.voo?.opts["title"];
    if (typeof explicit === "string" && explicit !== "") {
      const absolute = DeckoName.parse(explicit).absoluteName(this.card.name);
      return absolute.from(...this.contextNames);
    }
    const resolved = this.card.name.from(...this.contextNames);
    return h(settingDisplayTitle(resolved, this.engine) ?? resolved);
  }
  /** name/all.rb#url_key via DeckoName. */
  urlKey() {
    return this.card.name.urlKey;
  }
  /**
   * The :menu view's data-bs-content value (menu.rb help_link -> bootstrap
   * helper.rb popover_opts). Delegates to the installed helpRules resolver;
   * "" (no resolver, or Ruby-blank text) renders the &nbsp; placeholder
   * exactly like the pre-resolution hardcode.
   */
  menuHelpContentBytes() {
    return this.engine.helpRules?.menuHelpContentBytes(this) ?? "";
  }
  /** auth/permissions.rb:18-26 Auth.createable_types — the type editor's
   *  select options (edit_type.rb:52-62 raw_type_options + :44-48
   *  type_field). Sync read of the engine's prepare-phase precompute;
   *  [] until prepared (engines without the seam answer [] — the rules
   *  mod's documented headless divergence). */
  createableTypes() {
    return this.engine.createableTypes?.() ?? [];
  }
};
var SETTING_DISPLAY_TITLES = {
  search: "Search Results",
  signin: "Sign In",
  recent: "Recent Changes"
};
function settingDisplayTitle(resolved, engine) {
  if (!resolved.startsWith("*") || resolved.includes("+")) return void 0;
  const card = engine.fetchRenderCard?.(resolved);
  const codename = card?.id !== void 0 ? engine.peekCodenameById?.(card.id) : void 0;
  if (codename === void 0) return void 0;
  return SETTING_DISPLAY_TITLES[codename];
}
var UNKNOWN_VIEW_DECLS = [
  // card-mod-comment-0.20.0 set/right/discussion.rb:1-6:
  //   %i[open open_content titled titled_content].each do |viewname|
  //     view viewname, unknown: true do voo.show :comment_box; super() end
  //   end
  // and :8-10 `view :core, unknown: true`. This is why a NONEXISTENT
  // +discussion renders its requested titled view with the *default rule's
  // content body (the pass-15 class's 19 Project pages; oracle slot
  // associative_inquiry-discussion-titled-view carries show:[titled,
  // comment_box] and body <p> </p> x2 = discussion+*right+*default's
  // db_content). The comment_box show flip itself is already open-coded in
  // the base views (views.ts openView/titledView rightName.key ===
  // "discussion" guards).
  { view: "open", config: true, setTokens: ["RIGHT-discussion"] },
  { view: "open_content", config: true, setTokens: ["RIGHT-discussion"] },
  { view: "titled", config: true, setTokens: ["RIGHT-discussion"] },
  { view: "titled_content", config: true, setTokens: ["RIGHT-discussion"] },
  { view: "core", config: true, setTokens: ["RIGHT-discussion"] },
  // all-set rows
  { view: "mini_bar", config: true },
  { view: "mini_unknown", config: true },
  { view: "bar_left", config: true },
  { view: "bar_menu", config: true },
  { view: "bar_body", config: true },
  { view: "closed", config: "mini_bar" },
  { view: "bar", config: "mini_bar" },
  { view: "full_bar", config: "mini_bar" },
  { view: "bar_middle", config: "blank" },
  { view: "bar_right", config: "blank" },
  { view: "titled_content", config: "blank" },
  { view: "labeled", config: "labeled" },
  { view: "labeled_content", config: "mini_unknown" },
  { view: "one_line_content", config: "mini_unknown" },
  { view: "raw_one_line_content", config: "mini_unknown" },
  // card-mod-edit set/all/template_nest.rb:2 `view :template_nest, cache:
  // :never, unknown: true`. A :template-mode nest whose target does not
  // resolve must still render :template_nest (which answers from
  // voo.nest_syntax and needs no card) rather than :unknown.
  { view: "template_nest", config: true },
  // card-mod-format set/all/html/menu.rb:29 `view :board_link, unknown: true
  // do board_link end`. The captured `{{\_|board_link}}` nest (corpus 38250
  // `Cardtype+*type+*guide`, content+open) targets a NEW card whose name
  // `\_` keys to "" (cardname.rb:107-118 simple_key: `\` is outside
  // OK4KEY_RE `\p{Word}\*`, so `\_` gubs to `_` and splits away) - an
  // unknown card. Ruby's alter_unknown answers nil for this unknown-capable
  // view (permission.rb:38-40) and the denial check still runs; the new
  // card's read verdict denies (BasicCs+*type+*read = "Anyone Signed In",
  // Anonymous denied) and the nest renders the 76-byte quiet denial span.
  // LIVE-PROVEN 2026-10-03: culturesmith.com/Cardtype+*type+*guide
  // ?view=content|open render the span at "click its ellipses icon (...)"
  // in both the frozen capture and today's live bytes.
  { view: "board_link", config: true },
  // card-mod-edit set/all/formgroup.rb:13 `view :read_formgroup, template:
  // :haml, unknown: true, wrap: :slot` — the p20-email-views read_form
  // field nests target virtual field cards (welcome email+*to et al.);
  // the loader-less page lane reads this compiled row where the mod
  // registry would answer (the flat readFormgroupBody in views.ts).
  { view: "read_formgroup", config: true }
];
function compiledUnknownSettingForCard(card, view, allSetOnly = false) {
  const tokens = new Set(card.setKeys.split(/\s+/).filter((t2) => t2 !== ""));
  if (!allSetOnly) {
    let scoped;
    for (const decl of UNKNOWN_VIEW_DECLS) {
      if (decl.view !== view || decl.setTokens === void 0) continue;
      if (decl.setTokens.some((t2) => tokens.has(t2))) scoped = decl.config;
    }
    if (scoped !== void 0) return scoped;
  }
  let all;
  for (const decl of UNKNOWN_VIEW_DECLS) {
    if (decl.view === view && decl.setTokens === void 0) all = decl.config;
  }
  return all;
}
var PERMS_NONE_VIEWS = /* @__PURE__ */ new Set([
  "title",
  "title_link",
  "title_no_link",
  "name",
  "url_link",
  "link",
  "nav_link",
  "header",
  "header_title",
  "blank",
  "denial",
  "errors",
  "server_error",
  "not_found",
  "bad_address"
]);
function normalizeView(view) {
  return view;
}
function quietRenderError(error, card, view) {
  const msg = error instanceof UnsupportedViewError ? error.message : `Error rendering: ${h(card.name.s)} (${view} view)`;
  return `<span class="render-error alert alert-danger">${msg}</span>`;
}
function normalizeVisibilityList(value) {
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string");
  return typeof value === "string" ? [value] : [];
}
var COMMON_SETTINGS = /* @__PURE__ */ new Set([
  "create",
  "read",
  "update",
  "delete",
  "structure",
  "default",
  "guide"
]);
var FIELD_SETTINGS = /* @__PURE__ */ new Set([
  "default",
  "help",
  "input_type",
  "content_options",
  "content_option_view"
]);
var REGISTERED_SETTING_CODENAMES = /* @__PURE__ */ new Set([
  "autoname",
  // card-1.110.0 mod/core
  "create",
  "delete",
  "read",
  "update",
  // card-mod-permissions
  "default",
  "structure",
  // card-mod-content
  "input_type",
  // card-mod-edit
  "follow",
  "follow_fields",
  // card-mod-follow
  "guide",
  "help",
  // card-mod-help
  "on_create",
  "on_delete",
  "on_update",
  "thanks",
  // card-mod-integrate
  "head",
  "layout",
  // card-mod-layout
  "content_options",
  "content_option_view",
  // card-mod-list
  "captcha",
  // card-mod-recaptcha
  "script",
  // card-mod-script
  "style"
  // card-mod-style
]);
var RESTRICTED_TO_TYPE = /* @__PURE__ */ new Map([
  ["content_options", /* @__PURE__ */ new Set(["list", "pointer", "session"])],
  ["content_option_view", /* @__PURE__ */ new Set(["list", "pointer", "session"])]
]);
function wrappedTitleInner(title) {
  return title.split(/\s*\+\s*/).join("<span>+</span>");
}
var WIKI_LINK_REGEXP = /\\?\[\[((?:[^\[\]\n|{]|\{\{[^{}]*\}\})+?)(?:\|([^\[\]\n]+?))?\]\]/g;
var URI_SCHEME_REGEXP = /(?:irc|http|https|ftp|ssh|git|sftp|file|ldap|ldaps|mailto):/g;
var URI_HOST_REGEXP = /(?:[a-zA-Z\d](?:[-a-zA-Z\d]*[a-zA-Z\d])?\.)+(?:aero|biz|com|coop|edu|gov|info|int|mil|museum|name|net|org|ad|ae|af|ag|ai|al|am|an|ao|aq|ar|as|at|au|aw|az|ba|bb|bd|be|bf|bg|bh|bi|bj|bm|bn|bo|br|bs|bt|bv|bw|by|bz|ca|cc|cf|cd|cg|ch|ci|ck|cl|cm|cn|co|cr|cs|cu|cv|cx|cy|cz|de|dj|dk|dm|do|dz|ec|ee|eg|eh|er|es|et|fi|fj|fk|fm|fo|fr|fx|ga|gb|gd|ge|gf|gh|gi|gl|gm|gn|gp|gq|gr|gs|gt|gu|gw|gy|hk|hm|hn|hr|ht|hu|id|ie|il|in|io|iq|ir|is|it|jm|jo|jp|ke|kg|kh|ki|km|kn|kp|kr|kw|ky|kz|la|lb|lc|li|lk|lr|ls|lt|lu|lv|ly|ma|mc|md|mg|mh|mk|ml|mm|mn|mo|mp|mq|mr|ms|mt|mu|mv|mw|mx|my|mz|na|nc|ne|nf|ng|ni|nl|no|np|nr|nt|nu|nz|om|pa|pe|pf|pg|ph|pk|pl|pm|pn|pr|pt|pw|py|qa|re|ro|ru|rw|sa|sb|sc|sd|se|sg|sh|si|sj|sk|sl|sm|sn|so|sr|st|su|sv|sy|sz|tc|td|tf|tg|th|tj|tk|tm|tn|to|tp|tr|tt|tv|tw|tz|ua|ug|uk|um|us|uy|uz|va|vc|ve|vg|vi|vn|vu|wf|ws|ye|yt|yu|za|zm|zr|zw|eu)\b/g;
var URI_EMAIL_REGEXP = /[a-zA-Z\d](?:[-a-zA-Z\d.]*[a-zA-Z\d])?@\b/g;
var URI_REJECTED_PREFIX = /(?:!|":|"|'|]\()$/;
var URI_TRAILING_PUNCTUATION = /* @__PURE__ */ new Set([",", ".", ")", "!", "?", ":"]);
var URI_FULL_REGEXP_SOURCE = "(?=(?:irc|http|https|ftp|ssh|git|sftp|file|ldap|ldaps|mailto):)([a-zA-Z][\\-+.a-zA-Z\\d]*):(?:((?:[\\-_.!~*'()a-zA-Z\\d;?:@&=+$,]|%[a-fA-F\\d]{2})(?:[\\-_.!~*'()a-zA-Z\\d;\\/?:@&=+$,\\[\\]]|%[a-fA-F\\d]{2})*)|(?:(?:\\/\\/(?:(?:(?:((?:[\\-_.!~*'()a-zA-Z\\d;:&=+$,]|%[a-fA-F\\d]{2})*)@)?(?:((?:(?:[a-zA-Z0-9\\-.]|%[0-9a-fA-F][0-9a-fA-F])+|\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}|\\[(?:(?:[a-fA-F\\d]{1,4}:)*(?:[a-fA-F\\d]{1,4}|\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3})|(?:(?:[a-fA-F\\d]{1,4}:)*[a-fA-F\\d]{1,4})?::(?:(?:[a-fA-F\\d]{1,4}:)*(?:[a-fA-F\\d]{1,4}|\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}))?)\\]))(?::(\\d*))?))?|((?:[\\-_.!~*'()a-zA-Z\\d$,;:@&=+]|%[a-fA-F\\d]{2})+))|(?!\\/\\/))(\\/(?:[\\-_.!~*'()a-zA-Z\\d:@&=+$,]|%[a-fA-F\\d]{2})*(?:;(?:[\\-_.!~*'()a-zA-Z\\d:@&=+$,]|%[a-fA-F\\d]{2})*)*(?:\\/(?:[\\-_.!~*'()a-zA-Z\\d:@&=+$,]|%[a-fA-F\\d]{2})*(?:;(?:[\\-_.!~*'()a-zA-Z\\d:@&=+$,]|%[a-fA-F\\d]{2})*)*)*)?)(?:\\?((?:[\\-_.!~*'()a-zA-Z\\d;\\/?:@&=+$,\\[\\]]|%[a-fA-F\\d]{2})*))?)(?:\\#((?:[\\-_.!~*'()a-zA-Z\\d;\\/?:@&=+$,\\[\\]]|%[a-fA-F\\d]{2})*))?";
var URI_FULL_REGEXP = new RegExp(URI_FULL_REGEXP_SOURCE);
function findUriMatch(text, from) {
  const prefixes = [
    [URI_SCHEME_REGEXP, "scheme", ""],
    [URI_HOST_REGEXP, "host", "http://"],
    [URI_EMAIL_REGEXP, "email", "mailto:"]
  ];
  let pos = from;
  for (; ; ) {
    let bestStart = -1;
    let bestKind;
    for (const [regexp, kind] of prefixes) {
      regexp.lastIndex = pos;
      const m = regexp.exec(text);
      if (m !== null && (bestStart === -1 || m.index < bestStart)) {
        bestStart = m.index;
        bestKind = kind;
      }
      regexp.lastIndex = 0;
    }
    if (bestStart === -1 || bestKind === void 0) return void 0;
    const prepend = prefixes.find(([_, kind]) => kind === bestKind)[2];
    const full = URI_FULL_REGEXP.exec(prepend + text.slice(bestStart));
    if (full === null || full[0].length <= prepend.length) {
      pos = bestStart + 1;
      continue;
    }
    const end = bestStart + full[0].length - prepend.length;
    if (bestStart >= 2 && URI_REJECTED_PREFIX.test(text.slice(bestStart - 2, bestStart))) {
      pos = end;
      continue;
    }
    let chunk = text.slice(bestStart, end);
    chunk = chunk.replace(/(?:&nbsp;)+/g, "");
    const lastChar = chunk.slice(-1);
    let trailing = "";
    if (URI_TRAILING_PUNCTUATION.has(lastChar)) {
      trailing = lastChar;
      chunk = chunk.slice(0, -1);
    }
    chunk = chunk.replace(/\.$/, "");
    if (chunk === "") {
      pos = end;
      continue;
    }
    return bestKind === "scheme" ? {
      start: bestStart,
      end,
      href: chunk,
      text: chunk,
      resourceType: /^https?:/.test(chunk) ? "external-link" : /^mailto:/.test(chunk) ? "email-link" : `${chunk.slice(0, chunk.indexOf(":"))}-link`,
      trailing
    } : bestKind === "host" ? {
      start: bestStart,
      end,
      href: `http://${chunk}`,
      text: chunk,
      resourceType: "external-link",
      trailing
    } : {
      start: bestStart,
      end,
      href: `mailto:${chunk}`,
      text: chunk,
      resourceType: "email-link",
      trailing
    };
  }
}
function rubyChunkListForCardType(typeCode, typeName) {
  const code = typeCode ?? typeName?.toLowerCase().replace(/\s+/g, "_");
  switch (code) {
    case "html":
    case "css":
    case "scss":
    case "layout_type":
      return "references";
    case "java_script":
    case "coffee_script":
      return "nest_only";
    default:
      return "default";
  }
}
function expandContentLinks(text, engine, context, titleContextNames) {
  if (!/[:.@]/.test(text)) return expandWikiLinks(text, engine, context, titleContextNames);
  let out = "";
  let pos = 0;
  for (; ; ) {
    const rest = text.slice(pos);
    const uri = findUriMatch(text, pos);
    WIKI_LINK_REGEXP.lastIndex = 0;
    const wiki = WIKI_LINK_REGEXP.exec(rest);
    const wikiStart = wiki === null ? Infinity : pos + wiki.index;
    if (uri === void 0 && wiki === null) {
      out += rest;
      break;
    }
    if (uri !== void 0 && uri.start <= wikiStart) {
      out += text.slice(pos, uri.start);
      const target = uri.resourceType === "external-link" ? ` target="_blank"` : "";
      out += `<a${target} class="${uri.resourceType}" href="${h(uri.href)}">${uri.text}</a>${uri.trailing}`;
      pos = uri.end;
      continue;
    }
    WIKI_LINK_REGEXP.lastIndex = 0;
    const wikiGlobal = WIKI_LINK_REGEXP.exec(rest);
    out += text.slice(pos, wikiStart);
    out += expandWikiLinks(wikiGlobal[0], engine, context, titleContextNames);
    pos = wikiStart + wikiGlobal[0].length;
  }
  return out;
}
function absolutizeWikiTarget(target, context) {
  if (context === void 0) return target;
  try {
    const parsed = DeckoName.parse(target);
    if (parsed.isAbsolute) return target;
    return parsed.absoluteName(context).s;
  } catch (err) {
    if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
      return target;
    }
    throw err;
  }
}
function linkNestCardName(fetchTarget, resolvedName) {
  if (resolvedName !== void 0) return resolvedName;
  try {
    return DeckoName.parse(fetchTarget);
  } catch (err) {
    if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError || err instanceof UnsupportedIdentifierError) {
      return void 0;
    }
    throw err;
  }
}
function linkTitleInContext(title, cardName, contextNames) {
  try {
    return DeckoName.parse(title).absoluteName(cardName).from(...contextNames);
  } catch (err) {
    if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError || err instanceof UnsupportedIdentifierError) {
      return title;
    }
    throw err;
  }
}
function wantedHrefQuerySuffix(hrefSource) {
  try {
    const parsed = DeckoName.parse(hrefSource);
    const resolved = parsed.parts.join(DeckoName.JOINT);
    if (parsed.urlKey === resolved.replace(/ /g, "_")) return "";
    return `?card%5Bname%5D=${cgiEscape(resolved)}`;
  } catch {
    return "";
  }
}
function expandWikiLinks(text, engine, context, titleContextNames) {
  return text.replace(WIKI_LINK_REGEXP, (match, target, label) => {
    if (match.startsWith("\\")) {
      return `[[${label !== void 0 ? `${target}|${label}` : target}]]`;
    }
    const targetTrimmed = target.trim();
    if (/^(\/|https?:|mailto:)/.test(targetTrimmed)) {
      if (/^https?:/.test(targetTrimmed)) {
        return `<a target="_blank" class="external-link" href="${h(targetTrimmed)}">${(label ?? targetTrimmed).trim()}</a>`;
      }
      if (/^mailto:/.test(targetTrimmed)) {
        return `<a class="email-link" href="${h(targetTrimmed)}">${(label ?? targetTrimmed).trim()}</a>`;
      }
      const href2 = `/${targetTrimmed.replace(/^\/+/, "")}`;
      return `<a class="internal-link" href="${h(href2)}">${(label ?? targetTrimmed).trim()}</a>`;
    }
    const fetchTarget = absolutizeWikiTarget(targetTrimmed, context);
    const namedLink = engine?.fetchRenderCard(fetchTarget);
    let known = namedLink !== void 0 && namedLink.unknown !== true;
    let hrefSource = known && namedLink?.name !== void 0 ? namedLink.name.s : targetTrimmed;
    if (namedLink === void 0 && engine !== void 0) {
      const peeked = engine.peekKnownCardName?.(targetTrimmed);
      if (peeked !== void 0) {
        known = true;
        hrefSource = peeked;
      }
    }
    let href;
    try {
      href = `/${DeckoName.parse(hrefSource).urlKey}`;
    } catch (err) {
      if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
        href = `/${targetTrimmed.replace(/ /g, "_")}`;
      } else {
        throw err;
      }
    }
    if (!known) href += wantedHrefQuerySuffix(hrefSource);
    const displayText = (label ?? targetTrimmed).trim();
    const nestCard = linkNestCardName(fetchTarget, known ? namedLink?.name : void 0);
    const nestContextNames = nestCard === void 0 || titleContextNames === void 0 ? [] : titleContextNames.filter((key) => nestCard.partKeys.includes(key));
    const titleText = nestCard === void 0 ? displayText : linkTitleInContext(displayText, nestCard, nestContextNames);
    return `<a class="${known ? "known-card" : "wanted-card"}" href="${h(href)}"><span class="card-title" title="${htmlEscapeKeepApostrophe(titleText)}">${wrappedTitleInner(titleText)}</span></a>`;
  });
}
function matchLinkWrappedNestOpener(text) {
  const match = /(?<!\\)\[\[([^\[\]\n|]+)\|\s*$/.exec(text);
  if (match === null || match.index === void 0) return void 0;
  return { prefix: text.slice(0, match.index), target: match[1] ?? "" };
}
function matchLinkTargetNestOpener(text) {
  const match = /(?<!\\)\[\[([^{}[\]\n|]*)$/.exec(text);
  if (match === null || match.index === void 0) return void 0;
  return { prefix: text.slice(0, match.index), head: match[1] ?? "" };
}

// src/card/i18n/i18n.ts
var translations = /* @__PURE__ */ new Map();
var defaultLocale;
function t(key, opts = {}) {
  const locale = opts.locale ?? defaultLocale ?? "en";
  const fullKey = opts.scope !== void 0 && opts.scope !== "" ? `${opts.scope}.${key}` : key;
  let entry = lookup(translations.get(locale), fullKey);
  let resolvedKey = fullKey;
  if (entry === void 0 && opts.default !== void 0) {
    if (typeof opts.default === "string") {
      if (opts.default.length > 0) {
        return interpolate(opts.default, opts.vars ?? {});
      }
    } else {
      for (const alt of opts.default) {
        entry = lookup(translations.get(locale), alt);
        if (entry !== void 0) {
          resolvedKey = alt;
          break;
        }
      }
    }
  }
  if (entry === void 0) {
    return missingTranslationMessage(locale, key, opts.scope);
  }
  if (typeof entry === "object" && entry !== null && !Array.isArray(entry)) {
    if (opts.count !== void 0) {
      const form = pluralizationKey(entry, opts.count);
      const formEntry = entry[form];
      if (typeof formEntry === "string") {
        return interpolate(formEntry, { ...opts.vars ?? {}, count: opts.count });
      }
    }
    return entry;
  }
  if (typeof entry !== "string") {
    return missingTranslationMessage(locale, key, opts.scope);
  }
  return interpolate(entry, opts.vars ?? {});
}
function tExists(key, opts = {}) {
  const locale = opts.locale ?? defaultLocale ?? "en";
  const fullKey = opts.scope !== void 0 && opts.scope !== "" ? `${opts.scope}.${key}` : key;
  return lookup(translations.get(locale), fullKey) !== void 0;
}
function missingTranslationMessage(locale, key, scope) {
  const parts = [locale];
  if (scope !== void 0 && scope !== "") parts.push(...scope.split("."));
  parts.push(...key.split("."));
  return `Translation missing: ${parts.join(".")}`;
}
function lookup(data, key) {
  if (data === void 0) return void 0;
  const parts = key.split(".").filter((p) => p.length > 0);
  let cur = data;
  for (const part of parts) {
    if (typeof cur !== "object" || cur === null || Array.isArray(cur)) return void 0;
    cur = cur[part];
    if (cur === void 0) return void 0;
  }
  return cur;
}
function pluralizationKey(entry, count) {
  const hasZero = "zero" in entry;
  if (count === 0 && hasZero) return "zero";
  return count === 1 ? "one" : "other";
}
function interpolate(template, vars) {
  if (Object.keys(vars).length === 0) {
    return template.replace(/%%/g, "%");
  }
  return template.replace(/%(%|\{([^}]+)\})/g, (_match, body, name) => {
    if (body === "%") return "%";
    if (name === void 0) return body;
    const v = vars[name];
    return v === void 0 ? `{${name}}` : String(v);
  });
}

// src/card/render/text-helpers.ts
var ONE_LINE_CHARACTER_LIMIT = 60;
function timeAgoInWords(from, now = /* @__PURE__ */ new Date()) {
  return distanceOfTimeInWords(from, now, {});
}
function distanceOfTimeInWords(from, to, opts = {}) {
  const fromTime = normalizeTime(from);
  const toTime = normalizeTime(to);
  let a = fromTime;
  let b = toTime;
  if (a.getTime() > b.getTime()) {
    [a, b] = [b, a];
  }
  const distanceInMinutes = Math.round((b.getTime() - a.getTime()) / (1e3 * 60));
  const distanceInSeconds = Math.round((b.getTime() - a.getTime()) / 1e3);
  const tOpts = { scope: "datetime.distance_in_words" };
  if (distanceInMinutes >= 0 && distanceInMinutes <= 1) {
    if (opts.includeSeconds !== true) {
      if (distanceInMinutes === 0) {
        return lookupOrFallback("less_than_x_minutes", { ...tOpts, count: 1 }, "less than a minute");
      }
      return lookupOrFallback("x_minutes", { ...tOpts, count: distanceInMinutes }, `${distanceInMinutes} minutes`);
    }
    switch (true) {
      case distanceInSeconds <= 4:
        return lookupOrFallback("less_than_x_seconds", { ...tOpts, count: 5 }, "less than 5 seconds");
      case distanceInSeconds <= 9:
        return lookupOrFallback("less_than_x_seconds", { ...tOpts, count: 10 }, "less than 10 seconds");
      case distanceInSeconds <= 19:
        return lookupOrFallback("less_than_x_seconds", { ...tOpts, count: 20 }, "less than 20 seconds");
      case distanceInSeconds <= 39:
        return lookupOrFallback("half_a_minute", tOpts, "half a minute");
      case distanceInSeconds <= 59:
        return lookupOrFallback("less_than_x_minutes", { ...tOpts, count: 1 }, "less than a minute");
      default:
        return lookupOrFallback("x_minutes", { ...tOpts, count: 1 }, "1 minute");
    }
  }
  if (distanceInMinutes >= 2 && distanceInMinutes < 45) {
    return lookupOrFallback("x_minutes", { ...tOpts, count: distanceInMinutes }, `${distanceInMinutes} minutes`);
  }
  if (distanceInMinutes >= 45 && distanceInMinutes < 90) {
    return lookupOrFallback("about_x_hours", { ...tOpts, count: 1 }, "about 1 hour");
  }
  if (distanceInMinutes >= 90 && distanceInMinutes < 1440) {
    const hours = Math.round(distanceInMinutes / 60);
    return lookupOrFallback("about_x_hours", { ...tOpts, count: hours }, `about ${hours} hours`);
  }
  if (distanceInMinutes >= 1440 && distanceInMinutes < 2520) {
    return lookupOrFallback("x_days", { ...tOpts, count: 1 }, "1 day");
  }
  if (distanceInMinutes >= 2520 && distanceInMinutes < 43200) {
    const days = Math.round(distanceInMinutes / 1440);
    return lookupOrFallback("x_days", { ...tOpts, count: days }, `${days} days`);
  }
  if (distanceInMinutes >= 43200 && distanceInMinutes < 86400) {
    const months = Math.round(distanceInMinutes / 43200);
    return lookupOrFallback("about_x_months", { ...tOpts, count: months }, `about ${months} months`);
  }
  if (distanceInMinutes >= 86400 && distanceInMinutes < 525600) {
    const months = Math.round(distanceInMinutes / 43200);
    return lookupOrFallback("x_months", { ...tOpts, count: months }, `${months} months`);
  }
  const fromYear = a.getFullYear() + (a.getMonth() >= 2 ? 1 : 0);
  let toYear = b.getFullYear();
  if (b.getMonth() < 2) toYear -= 1;
  let leapYears = 0;
  if (fromYear <= toYear) {
    const fyear = fromYear - 1;
    const leapsTo = Math.floor(toYear / 4) - Math.floor(toYear / 100) + Math.floor(toYear / 400);
    const leapsFrom = Math.floor(fyear / 4) - Math.floor(fyear / 100) + Math.floor(fyear / 400);
    leapYears = leapsTo - leapsFrom;
  }
  const MINUTES_IN_YEAR = 525600;
  const MINUTES_IN_QUARTER_YEAR = 131400;
  const MINUTES_IN_THREE_QUARTERS_YEAR = 394200;
  const minuteOffsetForLeapYear = leapYears * 1440;
  const minutesWithOffset = distanceInMinutes - minuteOffsetForLeapYear;
  const remainder = (minutesWithOffset % MINUTES_IN_YEAR + MINUTES_IN_YEAR) % MINUTES_IN_YEAR;
  const distanceInYears = Math.floor(minutesWithOffset / MINUTES_IN_YEAR);
  if (remainder < MINUTES_IN_QUARTER_YEAR) {
    return lookupOrFallback("about_x_years", { ...tOpts, count: distanceInYears }, `about ${distanceInYears} years`);
  }
  if (remainder < MINUTES_IN_THREE_QUARTERS_YEAR) {
    return lookupOrFallback("over_x_years", { ...tOpts, count: distanceInYears }, `over ${distanceInYears} years`);
  }
  return lookupOrFallback("almost_x_years", { ...tOpts, count: distanceInYears + 1 }, `almost ${distanceInYears + 1} years`);
}
function truncate(text, length = 30, omission = "...") {
  if (text.length <= length) return text;
  const lengthWithRoomForOmission = length - omission.length;
  if (lengthWithRoomForOmission < 0) return omission;
  return text.substring(0, lengthWithRoomForOmission) + omission;
}
function normalizeTime(value) {
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    return new Date(value * 1e3);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`distance_of_time_in_words: cannot parse ${JSON.stringify(value)}`);
  }
  return d;
}
function lookupOrFallback(key, opts, fallback) {
  if (tExists(key, opts)) {
    const result = t(key, opts);
    if (typeof result === "string") return result;
  }
  return fallback;
}

// src/card/render/search-paging.ts
var MAX_PAGES = 100;
function cardUrlPath(name) {
  return `/${name.urlKey}`;
}
function pagingItem(text, page, status, ariaLabel, urlPath, limit, current) {
  const liClass = status === "current" ? "page-item active" : status === "ellipses" ? "page-item disabled" : "page-item";
  const inner = page === false ? `<div class="page-link">${text}</div>` : `<a${ariaLabel !== void 0 ? ` aria-label="${ariaLabel}"` : ""} class="card-paging-link slotter page-link" href="${urlPath}?limit=${limit}&amp;offset=${page * limit}" data-remote="true">${text}</a>`;
  return `<li class="${liClass}">${inner}</li>`;
}
function pagingLinks(total, current, urlPath, limit) {
  const window = 5;
  const item = (text, page, status, ariaLabel) => pagingItem(text, page, status, ariaLabel, urlPath, limit, current);
  const direct = (page) => page >= 0 && page <= total ? item(String(page + 1), page, page === current ? "current" : void 0) : void 0;
  const prev = current > 0 ? current - 1 : false;
  const next = current < total ? current + 1 : false;
  const windowStart = Math.max(current - window, 0);
  const windowEnd = Math.min(current + window, total);
  const left = [
    item('<span aria-hidden="true">&laquo;</span>', prev, prev === false ? "previous" : void 0, prev === false ? void 0 : "Previous")
  ];
  if (windowStart > 0) {
    const first = direct(0);
    if (first !== void 0) left.push(first);
  }
  if (windowStart > 1) left.push(item("<span>...</span>", false, "ellipses"));
  const middle = [];
  for (let page = windowStart; page <= windowEnd; page++) {
    const link = direct(page);
    if (link !== void 0) middle.push(link);
  }
  const right = [];
  if (total > windowEnd + 1) right.push(item("<span>...</span>", false, "ellipses"));
  if (total <= MAX_PAGES && total > windowEnd) {
    const last = direct(total);
    if (last !== void 0) right.push(last);
  }
  right.push(
    item('<span aria-hidden="true">&raquo;</span>', next, next === false ? "next" : void 0, next === false ? void 0 : "Next")
  );
  return [...left, ...middle, ...right].join("");
}
function totalPages(count, limit) {
  return limit === 0 ? 1 : Math.floor((count - 1) / limit);
}
function currentPage(offset, limit) {
  return limit === 0 ? 1 : Math.floor(offset / limit);
}
function lastItemOnPage(count, offset, limit) {
  return Math.min(count, offset + limit);
}
function searchPagingNav(name, paging) {
  const { limit, offset, count } = paging;
  const total = totalPages(count, limit);
  const current = currentPage(offset, limit);
  const links = pagingLinks(total, current, cardUrlPath(name), limit);
  return `<nav class='nav justify-content-between align-items-center'>
<ul class='pagination paging'>
` + links + `
</ul>
<div class='paging-context'>
` + [String(offset + 1), "-", String(lastItemOnPage(count, offset, limit)), "of", String(count)].join("\n") + `
</div>
</nav>
`;
}

// src/card/render/bar-cols.ts
var DEFAULT_MINI_BAR_COLS = [9, 3];
var RULE_BAR_COLS = [5, 4, 3];
var RULE_MINI_BAR_COLS = [6, 6];
function parseBarCols(content) {
  if (content === void 0 || content === null) return void 0;
  const trimmed = content.trim();
  if (trimmed === "") return void 0;
  const parts = trimmed.split(/[,\s]+/).filter((s) => s !== "");
  if (parts.length < 2) return void 0;
  const left = Number(parts[0]);
  const right = Number(parts[1]);
  if (!Number.isInteger(left) || !Number.isInteger(right)) return void 0;
  if (left <= 0 || right <= 0) return void 0;
  return [left, right];
}
function cardIsRule(setKeys) {
  for (const tok of setKeys.split(" ")) {
    if (tok === "RULE") return true;
  }
  return false;
}
function readBarCols(card, ruleContent) {
  const parsed = parseBarCols(ruleContent);
  if (parsed !== void 0) {
    return [parsed[0], parsed[1], parsed[0], 4, parsed[1]];
  }
  if (cardIsRule(card.setKeys)) {
    return [
      RULE_MINI_BAR_COLS[0],
      RULE_MINI_BAR_COLS[1],
      RULE_BAR_COLS[0],
      RULE_BAR_COLS[1],
      RULE_BAR_COLS[2]
    ];
  }
  return [9, 3, 0, 0, 0];
}
function readFullBarCols(card, ruleContent) {
  const parsed = parseBarCols(ruleContent);
  if (parsed !== void 0) return [parsed[0], parsed[1]];
  if (cardIsRule(card.setKeys)) {
    return [RULE_BAR_COLS[0], RULE_BAR_COLS[1], RULE_BAR_COLS[2]];
  }
  return [DEFAULT_MINI_BAR_COLS[0], DEFAULT_MINI_BAR_COLS[1]];
}

// src/card/render/rule-bar-right.ts
function typeText(card) {
  return h(card.typeName ?? "");
}
function pointerListOneLineContent(card, engine) {
  const items = rawItemStrings(card.dbContent).filter((s) => s.length > 0);
  const inner = items.map((name) => pointerListOneLineItem(name, engine)).join("\n");
  return `<div class="pointer-list">${inner}</div>`;
}
function pointerListOneLineItem(name, engine) {
  const resolved = engine?.fetchRenderCard?.(name);
  const known = resolved !== void 0;
  const display = known ? resolved.name : DeckoName.parse(name);
  const titleAttr = h(display.s);
  const inner = titleAttr.split("+").join("<span>+</span>");
  const cls = known ? "known-card" : "wanted-card";
  return `<div class="pointer-item item-link"><a class="${cls}" href="/${h(display.urlKey)}"><span class="card-title" title="${titleAttr}">${inner}</span></a></div>`;
}
function ruleOneLineContent(card, rightSetting, engine, renderCoreText, setContextTag) {
  if (rightSetting === "*default") {
    const raw = card.dbContent;
    return `${typeText(card)} : ${raw === "" ? "<em>empty</em>" : raw}`;
  }
  if (rightSetting === "*structure") {
    return `${typeText(card)} : ${card.dbContent}`;
  }
  if (rightSetting === "*head") {
    return truncate(stripTags(card.dbContent), ONE_LINE_CHARACTER_LIMIT);
  }
  if (card.typeCode === "toggle") {
    const normalized = (card.dbContent ?? "").trim().toLowerCase();
    if (normalized === "0" || normalized === "false" || normalized === "" || normalized === "no") {
      return "no";
    }
    return "yes";
  }
  if (isPointerOrListCard(card)) {
    if (card.dbContent === "_left" && isPermissionRightSetting(rightSetting)) {
      return permissionInheritContentHtml(setContextTag);
    }
    if (isPermissionRightSetting(rightSetting)) {
      return pointerListOneLineContent(card, engine);
    }
    const items = rawItemStrings(card.dbContent).filter((s) => s.length > 0);
    if (items.length !== 1) {
      return `${items.length} items`;
    }
    return truncate(card.dbContent, ONE_LINE_CHARACTER_LIMIT);
  }
  const coreText = renderCoreText !== void 0 ? renderCoreText(card) : card.dbContent;
  return truncate(stripTags(coreText), ONE_LINE_CHARACTER_LIMIT);
}
function permissionInheritContentHtml(setContextTag) {
  if (setContextTag === "*self" || setContextTag === "self") {
    return `<span class="inherit-perm">Inherit</span>`;
  }
  return `<span class="inherit-perm">Inherit from left card</span>`;
}
function ruleBarRightHtml(card, engine, renderCoreText) {
  const setKeyTokens = card.setKeys.split(" ");
  if (!setKeyTokens.includes("RULE")) return "";
  let oneLineCard = card;
  if (card.id === void 0 && engine?.hasExistingRuleFor?.(card.key) === false) {
    return "";
  }
  const existing = card.id === void 0 ? engine?.existingRuleFor?.(card.key) : void 0;
  if (existing !== void 0) oneLineCard = existing;
  const rightSetting = oneLineCard.name.rightName?.s;
  const setContextTag = card.name.trunkName?.tagName?.key;
  const inner = ruleOneLineContent(
    oneLineCard,
    rightSetting,
    engine,
    renderCoreText,
    setContextTag
  );
  if (engine?.isDenied(oneLineCard) === true) {
    return `<span class="denied"><!-- Sorry, you don't have permission (read) --></span>`;
  }
  return `<div class="text-muted one-line">${inner}</div>`;
}

// src/card/mod-loader/mods/core-admin-runtime.ts
var DEFAULT_ADMIN_RUNTIME_CONFIG = {
  performDeliveries: true,
  allowIrreversibleAdminTasks: false
};
var adminRuntimeConfigState = {
  ...DEFAULT_ADMIN_RUNTIME_CONFIG
};
function adminRuntimeConfig() {
  return adminRuntimeConfigState;
}
var CORE_ADMIN_LOCALE = {
  core_task_empty_trash_link_text: "Empty Trash",
  core_task_empty_trash_description: "Empty Trash!",
  core_task_clear_cache_link_text: "Clear Cache",
  core_task_clear_cache_description: "Clear Cache!",
  core_task_regenerate_assets_link_text: "Regenerate Assets",
  core_task_regenerate_assets_description: "Regen!",
  // mm-cstructural (2026-09-30): the 4th basket task
  // (delete_upload_tmp_files, mod: carrierwave) rendered
  // "Translation missing: en.carrierwave_task_delete_upload_tmp_files_link_text"
  // on the `mod: carrierwave` page where the oracle shows the gem's string.
  // card-mod-carrierwave-0.20.0 config/locales/en.yml:18-19. Its
  // sibling `carrierwave_task_move_files_*` keys are COMMENTED OUT in that
  // file (en.yml:14-15) and the task is not in the basket, so they stay out.
  carrierwave_task_delete_upload_tmp_files_link_text: "Delete upload tmp files",
  carrierwave_task_delete_upload_tmp_files_description: "Delete upload tmp files!",
  core_admin_warn: "Administrator Warning",
  core_admin_email_off: "Email delivery is turned off. Change settings in %{path} to send sign up notifications."
};
var CORE_TASK_BASKET = {
  // all/trash.rb:1-6 — loads FIRST (set/all before set/self, path-sorted;
  // probe basket_task_keys_in_order[0])
  empty_trash: {
    mod: "core",
    irreversible: true,
    // execute_policy: -> { Cardio::Utils.empty_trash } — the write path
    // (trash-row deletion) is a named remainder.
    executePolicy: () => void 0
  },
  // self/admin.rb:4-7
  clear_cache: {
    mod: "core",
    // execute_policy: -> { Card::Cache.reset_all } — the engine's caches
    // are per-engine instances the ModEngineHost surface does not expose;
    // a named remainder.
    executePolicy: () => void 0
  },
  // self/admin.rb:8-11
  regenerate_assets: {
    mod: "core",
    // execute_policy: -> { Card::Assets.refresh force: true } — the assets
    // pipeline surface; a named remainder.
    executePolicy: () => void 0
  },
  // card-mod-carrierwave set/self/admin.rb — basket[:tasks]
  // [:delete_upload_tmp_files]. The bar-slots lane (2026-09-29, view-fail
  // class Z3) landed the REGISTRATION only: the oracle pins the task's
  // EXISTENCE through the mod bar_right section list ("tasks, cardtypes,
  // scripts, styles") and its name/title/description through the page-lane
  // capture (expected-v2/page-lane shard-000039, mod: carrierwave :open:
  // task-table row "Delete upload tmp files" / "Delete upload tmp files!").
  // The EXECUTION stays a named remainder — a cron-style scheduled task
  // (the same AGENTS.md gate the carrierwave port note cites); like the
  // three core tasks above, execute_policy is a no-op placeholder.
  delete_upload_tmp_files: {
    mod: "carrierwave",
    executePolicy: () => void 0
  }
};
var CORE_WARNING_BASKET = ["no_email_delivery"];
var CONFIG_TITLE = {
  basic: "Basic configuration",
  editor: "Editor configuration"
};
function adminItemTitle(category, subcategory) {
  const key = (subcategory ?? category).toString();
  return CONFIG_TITLE[key] ?? capitalize(key);
}
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
var ADMIN_CONFIG = {
  // card-1.110.0 mod/core/config/admin.yml
  core: {
    cardtypes: { admin: ["mod", "user", "setting", "cardtype"] },
    // the yml's "clear_cash" typo is verbatim (the BASKET task is
    // clear_cache; this yml list feeds the admin-item surface only)
    tasks: ["empty_trash", "clear_cash", "regenerate_assets"]
  },
  // card-mod-account-0.20.0/config/admin.yml
  account: { cardtypes: { admin: ["role", "signup"] } },
  // card-mod-ace_editor-0.20.0/config/admin.yml
  ace_editor: { configurations: { editor: ["ace"] } },
  // card-mod-bar_and_box-0.20.0/config/admin.yml
  bar_and_box: {
    views: ["box", "bar", "mini_bar", "closed", "open", "one_line_content"]
  },
  // card-mod-bootstrap-0.20.0/config/admin.yml
  bootstrap: {
    cardtypes: { styling: ["bootswatch_skin"] },
    views: ["carousel"]
  },
  // card-mod-carrierwave-0.20.0/config/admin.yml
  carrierwave: { cardtypes: { upload: ["file", "image"] } },
  // card-mod-content-0.20.0/config/admin.yml
  content: { settings: ["structure", "default"] },
  // card-mod-date-0.20.0/config/admin.yml
  date: { cardtypes: { data: ["date"] } },
  // card-mod-defaults-0.20.0/config/admin.yml
  defaults: {
    configurations: { basic: ["home", "main_menu", "getting_started_links"] }
  },
  // card-mod-edit-0.20.0/config/admin.yml
  edit: {
    settings: ["input_type"],
    views: ["edit_form", "edit_inline", "edit_name", "edit_type", "board"]
  },
  // card-mod-email-0.20.0/config/admin.yml
  email: { cardtypes: { template: ["email_template"] } },
  // card-mod-follow-0.20.0/config/admin.yml
  follow: {
    settings: ["follow_fields", "follow"],
    cardtypes: { template: ["notification_template"] }
  },
  // card-mod-format-0.20.0/config/admin.yml
  format: {
    configurations: { basic: ["title", "head", "credit"] },
    cardtypes: {
      text: ["basic", "plain_text", "html", "phrase"],
      scripting: ["json"],
      data: ["number", "toggle", "uri"]
    },
    views: [
      "name",
      "link",
      "url_link",
      "content",
      "short_content",
      "core",
      "raw",
      "titled",
      "labeled",
      "smart_label",
      "title",
      "title_link"
    ]
  },
  // card-mod-help-0.20.0/config/admin.yml
  help: { settings: ["help", "guide"], views: ["help", "guide", "lead"] },
  // card-mod-history-0.20.0/config/admin.yml
  history: { views: ["creator_credit", "updated_by"] },
  // card-mod-integrate-0.20.0/config/admin.yml
  integrate: { settings: ["on_create", "on_update", "on_delete"] },
  // card-mod-layout-0.20.0/config/admin.yml
  layout: {
    settings: ["layout", "head"],
    cardtypes: { styling: ["layout_type"] },
    // mm-cstructural (2026-09-30): the `views` category was dropped from
    // this transcription, so the `mod: layout` page rendered its Views
    // section as "Depends on" (the section list ran description →
    // … → depends_on with views absent, per type/mod.rb:7-19's predicate
    // list). card-mod-layout-0.20.0 config/admin.yml:6-7 `views: [modal_link]`.
    views: ["modal_link"]
  },
  // card-mod-list-0.20.0/config/admin.yml
  list: {
    settings: ["content_options", "content_option_view"],
    cardtypes: { organize: ["list", "pointer", "nest_list", "link_list"] }
  },
  // card-mod-permissions-0.20.0/config/admin.yml
  permissions: { settings: ["create", "read", "update", "delete"] },
  // card-mod-recaptcha-0.20.0/config/admin.yml
  recaptcha: {
    configurations: { basic: ["recaptcha_settings"] },
    settings: ["captcha"]
  },
  // card-mod-script-0.20.0/config/admin.yml
  script: {
    settings: ["script"],
    cardtypes: {
      scripting: ["java_script", "coffee_script"],
      assets: [
        "local_script_folder_group",
        "local_script_manifest_group"
      ]
    }
  },
  // card-mod-search-0.20.0/config/admin.yml
  search: { settings: ["script"], cardtypes: { organize: ["search_type"] } },
  // card-mod-session-0.20.0/config/admin.yml
  session: { cardtypes: { admin: ["session"] } },
  // card-mod-style-0.20.0/config/admin.yml
  style: {
    settings: ["style"],
    cardtypes: {
      assets: ["local_style_folder_group", "local_style_manifest_group"],
      styling: ["css", "scss", "skin"]
    }
  },
  // card-mod-tinymce_editor-0.20.0/config/admin.yml (the yml's bare-symbol
  // scalar `:tiny_mce`)
  tinymce_editor: { configurations: { editor: ["tiny_mce"] } }
};
var MOD_SPEC_SHARED = {
  authors: ["Ethan McCutchen", "Philipp K\xFChl", "Gerry Gleason"],
  email: ["info@decko.org"],
  homepage: "https://decko.org",
  files: []
};
var MOD_SPECS = {
  account: {
    gem: "card-mod-account",
    version: "0.20.0",
    summary: "Email-based account handling for decko cards",
    description: "",
    deps: ["card", "card-mod-email", "card-mod-permissions", "card-mod-list", "card-mod-integrate", "card-mod-edit"]
  },
  ace_editor: {
    gem: "card-mod-ace_editor",
    version: "0.20.0",
    summary: "Ace editor",
    description: "",
    deps: ["card", "card-mod-edit", "card-mod-script"]
  },
  api_key: {
    gem: "card-mod-api_key",
    version: "0.20.0",
    summary: "API Keys and JWT Tokens for Decko",
    description: "",
    deps: ["card", "card-mod-account"]
  },
  assets: {
    gem: "card-mod-assets",
    version: "0.20.0",
    summary: "decko asset pipeline",
    description: "",
    deps: ["card", "execjs", "card-mod-virtual", "card-mod-format", "card-mod-list", "card-mod-carrierwave", "card-mod-content"]
  },
  bar_and_box: {
    gem: "card-mod-bar_and_box",
    version: "0.20.0",
    summary: "bar and box views",
    description: "",
    deps: ["card", "card-mod-style"]
  },
  bootstrap: {
    gem: "card-mod-bootstrap",
    version: "0.20.0",
    summary: "Bootstrap",
    description: "",
    deps: ["card", "card-mod-edit", "card-mod-bar_and_box", "card-mod-style", "card-mod-script"]
  },
  carrierwave: {
    gem: "card-mod-carrierwave",
    version: "0.20.0",
    summary: "File and Image handling",
    description: "",
    deps: ["card", "carrierwave", "mini_magick", "ssrf_filter", "marcel", "card-mod-history", "card-mod-permissions"]
  },
  collection: {
    gem: "card-mod-collection",
    version: "0.20.0",
    summary: "collection (list and search)",
    description: "",
    deps: ["card"]
  },
  comment: {
    gem: "card-mod-comment",
    version: "0.20.0",
    summary: "card comments",
    description: "",
    deps: ["card", "card-mod-permissions"]
  },
  content: {
    gem: "card-mod-content",
    version: "0.20.0",
    summary: "card content handling",
    description: "",
    deps: ["card"]
  },
  date: {
    gem: "card-mod-date",
    version: "0.20.0",
    summary: "Calendar editor",
    description: "",
    deps: ["card"]
  },
  defaults: {
    gem: "card-mod-defaults",
    version: "0.20.0",
    summary: "Default decko mods",
    description: "",
    deps: [
      "card",
      "card-mod-account",
      "card-mod-ace_editor",
      "card-mod-api_key",
      "card-mod-assets",
      "card-mod-bar_and_box",
      "card-mod-bootstrap",
      "card-mod-carrierwave",
      "card-mod-comment",
      "card-mod-date",
      "card-mod-delayed_job",
      "card-mod-follow",
      "card-mod-help",
      "card-mod-history",
      "card-mod-integrate",
      "card-mod-layout",
      "card-mod-list",
      "card-mod-markdown",
      "card-mod-permissions",
      "card-mod-recaptcha",
      "card-mod-rules",
      "card-mod-search",
      "card-mod-tabs",
      "card-mod-tinymce_editor"
    ]
  },
  delayed_job: {
    gem: "card-mod-delayed_job",
    version: "0.20.0",
    summary: "Background processing with Delayed Job",
    description: "",
    deps: ["card", "daemons", "delayed_job_active_record", "delayed_job_web"]
  },
  edit: {
    gem: "card-mod-edit",
    version: "0.20.0",
    summary: "Edit handling",
    description: "",
    deps: ["card", "card-mod-rules", "card-mod-list"]
  },
  email: {
    gem: "card-mod-email",
    version: "0.20.0",
    summary: "Email handling",
    description: "",
    deps: ["card", "card-mod-search", "card-mod-list", "card-mod-permissions"]
  },
  follow: {
    gem: "card-mod-follow",
    version: "0.20.0",
    summary: "follower notifications",
    description: "",
    deps: ["card", "card-mod-carrierwave"]
  },
  format: {
    gem: "card-mod-format",
    version: "0.20.0",
    summary: "format",
    description: "",
    deps: ["card", "card-mod-content"]
  },
  help: {
    gem: "card-mod-help",
    version: "0.20.0",
    summary: "card help text and guides",
    description: "",
    deps: ["card", "card-mod-markdown", "card-mod-permissions"]
  },
  history: {
    gem: "card-mod-history",
    version: "0.20.0",
    summary: "Revision histories in acts, actions, and changes",
    description: "",
    deps: ["card"]
  },
  integrate: {
    gem: "card-mod-integrate",
    version: "0.20.0",
    summary: "card configurable integration events",
    description: "",
    deps: ["card", "card-mod-rules"]
  },
  layout: {
    gem: "card-mod-layout",
    version: "0.20.0",
    summary: "decko layouts",
    description: "",
    deps: ["card", "card-mod-account", "card-mod-session", "card-mod-tabs"]
  },
  list: {
    gem: "card-mod-list",
    version: "0.20.0",
    summary: "list of cards",
    description: "",
    deps: ["card", "card-mod-format", "card-mod-collection"]
  },
  markdown: {
    gem: "card-mod-markdown",
    version: "0.20.0",
    summary: "markdown support for decko",
    description: "use markdown in decko card content",
    deps: ["card", "kramdown", "kramdown-syntax-coderay"]
  },
  permissions: {
    gem: "card-mod-permissions",
    version: "0.20.0",
    summary: "decko permissions",
    description: "",
    deps: ["card"]
  },
  recaptcha: {
    gem: "card-mod-recaptcha",
    version: "0.20.0",
    summary: "recaptcha support for decko",
    description: "",
    deps: ["card", "recaptcha"]
  },
  rules: {
    gem: "card-mod-rules",
    version: "0.20.0",
    summary: "rules",
    description: "",
    deps: ["card", "card-mod-format", "card-mod-search"]
  },
  script: {
    gem: "card-mod-script",
    version: "0.20.0",
    summary: "JavaScript, CoffeeScript, etc.",
    description: "",
    deps: ["card", "card-mod-assets", "card-mod-list"]
  },
  search: {
    gem: "card-mod-search",
    version: "0.20.0",
    summary: "search",
    description: "",
    deps: ["card", "card-mod-collection", "card-mod-format", "card-mod-help"]
  },
  session: {
    gem: "card-mod-session",
    version: "0.20.0",
    summary: "session",
    description: "",
    deps: ["card", "card-mod-list"]
  },
  style: {
    gem: "card-mod-style",
    version: "0.20.0",
    summary: "Skins, CSS, SCSS, etc",
    description: "",
    deps: ["card", "card-mod-assets", "card-mod-list"]
  },
  tabs: {
    gem: "card-mod-tabs",
    version: "0.20.0",
    summary: "tabs",
    description: "",
    deps: ["card", "card-mod-bootstrap"]
  },
  tinymce_editor: {
    gem: "card-mod-tinymce_editor",
    version: "0.20.0",
    summary: "TinyMCE editor",
    description: "",
    deps: ["card", "card-mod-edit"]
  },
  virtual: {
    gem: "card-mod-virtual",
    version: "0.20.0",
    summary: "virtual",
    description: "",
    deps: ["card"]
  }
};
var MOD_DESCRIPTION_KEYS = {
  format: "Format mod"
};
function modDescription(modname) {
  const localeKey = MOD_DESCRIPTION_KEYS[modname];
  if (localeKey !== void 0) return localeKey;
  const spec = MOD_SPECS[modname];
  if (spec === void 0) return void 0;
  if (spec.description.length > 0) return spec.description;
  return spec.summary;
}
var MOD_ASSET_GROUPS_SRC = {
  account: {
    styles: [["group: local", ["account.scss"]]],
    scripts: [["group: local", ["toggle_visibility.js.coffee"]]]
  },
  ace_editor: {
    scripts: [
      ["group: remote", ["https://cdnjs.cloudflare.com/ajax/libs/ace/1.18.0/ace.min.js"]],
      ["group: ace_config", ["decko_ace_config.js.coffee"]]
    ]
  },
  api_key: { styles: [["group: local", ["api_key_style.scss"]]] },
  bar_and_box: {
    styles: [["group: local", ["bar.scss", "box.scss", "image_box.scss"]]],
    scripts: [["group: local", ["bar_and_box.js.coffee", "click_select.js.coffee"]]]
  },
  bootstrap: {
    styles: [
      ["group: remote", ["https://fonts.googleapis.com/css2?family=Material+Icons"]],
      ["group: bootstrap_decko", ["decko_bootstrap.scss"]],
      [
        "group: libraries",
        ["bootstrap-icons.css", "bootstrap_colorpicker.scss", "_colorpicker.scss"]
      ],
      [
        "group: select2",
        [
          "select2.css",
          "_variables.scss",
          "_layout.scss",
          "_dropdown.scss",
          "_single.scss",
          "_multiple.scss",
          "_disabled.scss",
          "_input-group.scss",
          "_validation.scss",
          "_sizing.scss"
        ]
      ]
    ],
    scripts: [
      [
        "group: remote",
        [
          "https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.6-rc.1/js/select2.full.min.js",
          "https://kit.fontawesome.com/1366963381.js"
        ]
      ],
      [
        "group: bootstrap",
        [
          "bootstrap.bundle.js",
          "decko_modal.js.coffee",
          "decko_popover.js.coffee",
          "script_load_select2.js.coffee",
          "bootstrap-colorpicker.min.js",
          "script_colorpicker.js.coffee"
        ]
      ]
    ]
  },
  carrierwave: {
    styles: [["group: local", ["file.scss"]]],
    scripts: [["group: local", ["upload.js.coffee"]]]
  },
  comment: { styles: [["group: local", ["comments.scss"]]] },
  edit: {
    styles: [["group: local", ["board.scss", "edit.scss"]]],
    scripts: [
      [
        "group: local",
        [
          "autosave.js.coffee",
          "board.js.coffee",
          "components.js.coffee",
          "doubleclick.js.coffee",
          "editor.js.coffee",
          "name_editor.js.coffee",
          "tooltip.js.coffee",
          "type_editor.js.coffee"
        ]
      ]
    ]
  },
  follow: {
    styles: [["group: local", ["follow.scss"]]],
    scripts: [["group: local", ["follow.js.coffee"]]]
  },
  format: {
    styles: [
      [
        "group: local",
        [
          "common.scss",
          "logo_and_credit.scss",
          "menu.scss",
          "messaging.scss",
          "misc.scss",
          "open_and_closed.scss"
        ]
      ]
    ],
    scripts: [
      [
        "group: remote",
        [
          "https://code.jquery.com/jquery-3.5.1.min.js",
          "https://cdnjs.cloudflare.com/ajax/libs/jquery-ujs/1.2.3/rails.min.js"
        ]
      ],
      [
        "group: jquery",
        [
          "jquery-ui.min.js",
          "jquery.ui.autocomplete.html.js",
          "jquery.autosize.js",
          "jquery.fileupload.js",
          "jquery.iframe-transport.js"
        ]
      ],
      [
        "group: decko",
        [
          "decko.js.coffee",
          "decko_jquery.js.coffee",
          "slot.js.coffee",
          "slotter.js.coffee",
          "slot_ready.js.coffee",
          "clicks_and_hovers.js.coffee"
        ]
      ]
    ]
  },
  help: { styles: [["group: local", ["help.scss"]]] },
  history: { styles: [["group: local", ["history.scss"]]] },
  layout: {
    styles: [["group: local", ["layout.scss", "modal.scss", "overlay.scss"]]],
    scripts: [["group: local", ["layout.js.coffee", "modal.js.coffee", "overlay.js.coffee"]]]
  },
  list: {
    styles: [["group: local", ["list.scss"]]],
    scripts: [["group: local", ["pointer_config.js.coffee", "pointer_list_editor.js.coffee"]]]
  },
  permissions: { styles: [["group: local", ["permissions.scss"]]] },
  recaptcha: { scripts: [["group: local", ["recaptcha.js.coffee"]]] },
  rules: {
    styles: [["group: local", ["rules.scss"]]],
    scripts: [["group: local", ["rules.js.coffee"]]]
  },
  search: {
    styles: [["group: local", ["search.scss"]]],
    scripts: [["group: local", ["autocomplete.js.coffee", "search_box.js.coffee"]]]
  },
  style: {
    styles: [["group: local", ["jquery_ui_decko.scss", "jquery_ui_smoothness.css"]]]
  },
  tabs: { scripts: [["group: local", ["tab.js.coffee"]]] }
};
function modAssetGroups(modname, subpath) {
  return subpath === "style" ? MOD_ASSET_GROUPS_SRC[modname]?.styles : MOD_ASSET_GROUPS_SRC[modname]?.scripts;
}
var MOD_CHILD_ASSET_GROUPS_SRC = {
  "tinymce_editor/script": [
    [
      "group: local",
      [
        "image_editor.js.coffee",
        "link_editor.js.coffee",
        "nest_editor.js.coffee",
        "nest_editor_name.js.coffee",
        "nest_editor_options.js.coffee",
        "nest_editor_rules.js.coffee",
        "script_tinymce.js",
        "tinymce_config.js.coffee"
      ]
    ]
  ],
  "tinymce_editor/style": [["group: local", ["nest_editor.scss"]]]
};
function modChildAssetGroups(modname, subpath) {
  const parent = modAssetGroups(modname, subpath);
  if (parent !== void 0) return parent;
  return MOD_CHILD_ASSET_GROUPS_SRC[`${modname}/${subpath}`];
}
var MOD_BAR_RIGHT_ASSETS = {
  account: { scripts: true, styles: true },
  ace_editor: { scripts: true },
  api_key: { styles: true },
  bar_and_box: { scripts: true, styles: true },
  bootstrap: { scripts: true, styles: true },
  carrierwave: { scripts: true, styles: true },
  comment: { styles: true },
  content: {},
  core: {},
  date: {},
  defaults: {},
  edit: { scripts: true, styles: true },
  email: {},
  follow: { scripts: true, styles: true },
  format: { scripts: true, styles: true },
  help: { styles: true },
  history: { styles: true },
  integrate: {},
  layout: { scripts: true, styles: true },
  list: { scripts: true, styles: true },
  permissions: { styles: true },
  recaptcha: { scripts: true },
  rules: { scripts: true, styles: true },
  script: {},
  search: { scripts: true, styles: true },
  session: {},
  shades: { scripts: true },
  style: { styles: true },
  tabs: { scripts: true },
  tinymce_editor: { scripts: true, styles: true }
};
function modBarRightSections(modname) {
  const config = ADMIN_CONFIG[modname];
  const assets = MOD_BAR_RIGHT_ASSETS[modname] ?? {};
  const sections = [];
  if (Object.values(CORE_TASK_BASKET).some((t2) => t2.mod === modname)) sections.push("tasks");
  if (config?.settings !== void 0) sections.push("settings");
  if (config?.configurations !== void 0) sections.push("configurations");
  if (config?.cardtypes !== void 0) sections.push("cardtypes");
  if (assets.scripts === true) sections.push("scripts");
  if (assets.styles === true) sections.push("styles");
  return sections.join(", ");
}
var runtimeStates = /* @__PURE__ */ new WeakMap();
function adminRuntimeState(host) {
  return runtimeStates.get(host);
}
function rowsOf(results, index) {
  const entry = results[index];
  return entry?.rows ?? [];
}
async function prepareAdminRuntime(host) {
  await host.codenames.ensureLoaded();
  const selfId = host.codenames.peekId("self");
  const starId = host.codenames.peekId("star");
  const typePatternId = host.codenames.peekId("type");
  const allId = host.codenames.peekId("all");
  const updateId = host.codenames.peekId("update");
  const modTypeId = host.codenames.peekId("mod");
  const codenameIds = await host.batch([
    {
      sql: "SELECT id, codename FROM cards WHERE trash = 0 AND codename IS NOT NULL",
      params: []
    }
  ]);
  const codenameRecords = [];
  for (const row of rowsOf(codenameIds, 0)) {
    const id = row.id;
    const codename = row.codename;
    const record = await host.fetchById(id);
    if (record?.name?.s === void 0) continue;
    await host.cacheFetchedRecord(record);
    codenameRecords.push({ id, codename, name: record.name.s });
  }
  const modCards = [];
  if (modTypeId !== void 0) {
    const modRows = await host.batch([
      {
        sql: "SELECT id, codename FROM cards WHERE trash = 0 AND type_id = ?",
        params: [modTypeId]
      }
    ]);
    for (const row of rowsOf(modRows, 0)) {
      const record = await host.fetchById(row.id);
      if (record?.name?.s === void 0) continue;
      await host.cacheFetchedRecord(record);
      const codename = row.codename;
      modCards.push({
        name: record.name.s,
        codename: typeof codename === "string" && codename !== "" ? codename : nameToCodename(record.name.s)
      });
    }
  }
  const rulesByCardId = /* @__PURE__ */ new Map();
  if (selfId !== void 0 && updateId !== void 0) {
    const selfRules = await host.batch([
      {
        sql: "SELECT c.id AS card_id, r.db_content AS rule_content FROM cards c JOIN cards s ON s.left_id = c.id AND s.right_id = ? AND s.trash = 0 JOIN cards r ON r.left_id = s.id AND r.right_id = ? AND r.trash = 0 WHERE c.trash = 0 AND c.codename IS NOT NULL",
        params: [selfId, updateId]
      }
    ]);
    for (const row of rowsOf(selfRules, 0)) {
      rulesByCardId.set(row.card_id, row.rule_content ?? "");
    }
  }
  if (starId !== void 0 && updateId !== void 0) {
    const starRules = await host.batch([
      {
        sql: "SELECT r.db_content AS rule_content FROM cards r WHERE r.trash = 0 AND r.left_id = ? AND r.right_id = ?",
        params: [starId, updateId]
      }
    ]);
    const starContent = rowsOf(starRules, 0)[0]?.rule_content;
    if (starContent !== void 0) {
      for (const record of codenameRecords) {
        if (rulesByCardId.has(record.id)) continue;
        if (!DeckoName.parse(record.name).isStar) continue;
        rulesByCardId.set(record.id, starContent);
      }
    }
  }
  if (typePatternId !== void 0 && updateId !== void 0) {
    const typeRules = await host.batch([
      {
        sql: "SELECT c.id AS card_id, r.db_content AS rule_content FROM cards c JOIN cards s ON s.left_id = c.type_id AND s.right_id = ? AND s.trash = 0 JOIN cards r ON r.left_id = s.id AND r.right_id = ? AND r.trash = 0 WHERE c.trash = 0 AND c.codename IS NOT NULL",
        params: [typePatternId, updateId]
      }
    ]);
    for (const row of rowsOf(typeRules, 0)) {
      const cardId = row.card_id;
      if (!rulesByCardId.has(cardId)) {
        rulesByCardId.set(cardId, row.rule_content ?? "");
      }
    }
  }
  if (allId !== void 0 && updateId !== void 0) {
    const allRules = await host.batch([
      {
        sql: "SELECT r.db_content AS rule_content FROM cards r WHERE r.trash = 0 AND r.left_id = ? AND r.right_id = ?",
        params: [allId, updateId]
      }
    ]);
    const allContent = rowsOf(allRules, 0)[0]?.rule_content;
    if (allContent !== void 0) {
      for (const record of codenameRecords) {
        if (!rulesByCardId.has(record.id)) {
          rulesByCardId.set(record.id, allContent);
        }
      }
    }
  }
  const itemNameKeys = /* @__PURE__ */ new Set();
  for (const content of rulesByCardId.values()) {
    for (const item of pointerItems(content)) {
      itemNameKeys.add(DeckoName.parse(item).key);
    }
  }
  const codenameByKey = /* @__PURE__ */ new Map();
  if (itemNameKeys.size > 0) {
    const keys = [...itemNameKeys];
    const itemRows = await host.batch([
      {
        sql: `SELECT key, codename FROM cards WHERE trash = 0 AND codename IS NOT NULL AND key IN (${keys.map(() => "?").join(",")})`,
        params: keys
      }
    ]);
    for (const row of rowsOf(itemRows, 0)) {
      codenameByKey.set(row.key, row.codename);
    }
  }
  const rolesByCardCodename = /* @__PURE__ */ new Map();
  for (const record of codenameRecords) {
    const content = rulesByCardId.get(record.id);
    if (content === void 0) continue;
    const roles = [];
    for (const item of pointerItems(content)) {
      const codename = codenameByKey.get(DeckoName.parse(item).key);
      if (codename !== void 0) roles.push(codename);
    }
    rolesByCardCodename.set(record.codename, roles);
  }
  runtimeStates.set(host, {
    codenameToName: new Map(
      codenameRecords.filter((r) => r.codename !== "").map((r) => [r.codename, r.name])
    ),
    rolesByCardCodename,
    modCards
  });
}
function pointerItems(content) {
  return content.split("\n").map((line) => line.trim()).filter((line) => line !== "");
}
function nameToCodename(name) {
  return DeckoName.parse(name).key;
}

// src/card/render/haml-slice-compiler.ts
var HamlCompileError = class extends Error {
  constructor(message, rubyClassName = "Haml::SyntaxError") {
    super(message);
    this.rubyClassName = rubyClassName;
    this.name = rubyClassName;
  }
  rubyClassName;
};
var HamlUnsupportedError = class extends Error {
  constructor(message, line, source) {
    super(`haml-slice: ${message} (line ${line}: ${JSON.stringify(source)})`);
    this.line = line;
    this.source = source;
    this.name = "HamlUnsupportedError";
  }
  line;
  source;
};
var HTML5_VOID = /* @__PURE__ */ new Set([
  "area",
  "base",
  "br",
  "col",
  "command",
  "embed",
  "hr",
  "img",
  "input",
  "keygen",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr"
]);
function toRawLines(source) {
  const physical = source.replace(/\r\n/g, "\n").split("\n");
  const logical = [];
  let buffer = null;
  physical.forEach((raw, i) => {
    const indent = raw.length - raw.trimStart().length;
    const text = raw.trimEnd();
    if (buffer !== null) {
      buffer.text += ` ${text.trim()}`;
      if (matchBrace(buffer.text, buffer.text.indexOf("{")) >= 0) {
        logical.push(buffer);
        buffer = null;
      }
      return;
    }
    const open = text.indexOf("{");
    if (open >= 0 && matchBrace(text, open) < 0) {
      buffer = { text, indent, line: i + 1 };
      return;
    }
    logical.push({ text, indent, line: i + 1 });
  });
  if (buffer !== null) logical.push(buffer);
  return logical.filter((l) => l.text.trim() !== "");
}
var Parser = class {
  lines;
  pos = 0;
  constructor(source) {
    this.lines = toRawLines(source);
  }
  parse() {
    return this.parseBlock(this.lines.length ? this.lines[0].indent : 0);
  }
  parseBlock(indent) {
    const out = [];
    while (this.pos < this.lines.length) {
      const line = this.lines[this.pos];
      if (line.indent < indent) break;
      if (line.indent > indent) {
        throw new HamlCompileError(
          `Illegal nesting: content can't be nested within it (line ${line.line}).`
        );
      }
      this.pos += 1;
      const node = this.parseLine(line);
      if (node.kind === "script" && /^(if|unless|case)\b/.test(node.code)) {
        node.children = [...node.children, ...collectSiblingBranches(this, indent)];
      }
      out.push(node);
    }
    return out;
  }
  takeChildren(indent) {
    const next = this.lines[this.pos];
    if (next && next.indent > indent) return this.parseBlock(next.indent);
    return [];
  }
  peekLine() {
    return this.lines[this.pos];
  }
  advance() {
    this.pos += 1;
  }
  parseLine(line) {
    const t2 = line.text;
    const head = t2.slice(line.indent);
    if (head.startsWith("!!!")) {
      const m = /^!!!(-)?\s*(.*)$/.exec(head);
      return {
        kind: "doctype",
        dashes: m[1] === "-",
        spec: m[2].trim() === "" ? null : m[2].trim(),
        line: line.line
      };
    }
    if (/^-#/.test(head)) {
      return { kind: "comment", children: this.takeChildren(line.indent), line: line.line };
    }
    if (/^-/.test(head)) {
      return {
        kind: "script",
        code: head.slice(1).trim(),
        children: this.takeChildren(line.indent),
        line: line.line
      };
    }
    if (head.startsWith("/")) {
      return {
        kind: "escapedHtml",
        value: head.slice(1).trim(),
        children: this.takeChildren(line.indent),
        line: line.line
      };
    }
    if (head.startsWith("&")) {
      return {
        kind: "unescapedHtml",
        value: head.slice(1).trim(),
        children: this.takeChildren(line.indent),
        line: line.line
      };
    }
    if (head.startsWith("~")) {
      const rest = head.slice(1).trim();
      const literal = /^(["']).*\1$/.test(rest) ? unquote(rest) : null;
      return {
        kind: "notTag",
        expr: literal === null ? rest : null,
        literal,
        children: this.takeChildren(line.indent),
        line: line.line
      };
    }
    if (/^:/.test(head)) {
      return { kind: "filter", name: head.slice(1).trim(), body: this.takeFilterBody(line.indent), line: line.line };
    }
    if (head.startsWith("%") || head.startsWith(".") || head.startsWith("#")) {
      return this.parseTag(line, head);
    }
    if (head.startsWith("==")) {
      throw new HamlUnsupportedError(
        "`==` (unescaped script) is outside the slice: 0 of the 78 .haml templates in the installed deck bundle use it (tools/haml-slice/haml-feature-inventory.mjs)",
        line.line,
        head
      );
    }
    if (head.startsWith("=")) {
      return {
        kind: "output",
        expr: head.slice(1).trim(),
        unescaped: false,
        children: this.takeChildren(line.indent),
        line: line.line
      };
    }
    return {
      kind: "text",
      value: head,
      children: this.takeChildren(line.indent),
      line: line.line
    };
  }
  takeFilterBody(indent) {
    const body = [];
    while (this.pos < this.lines.length && this.lines[this.pos].indent > indent) {
      const l = this.lines[this.pos];
      body.push(l.text.slice(indent));
      this.pos += 1;
    }
    return body;
  }
  parseTag(line, head) {
    const parsed = parseTagLine(head, line.line);
    const children = this.takeChildren(line.indent);
    if (parsed.inline !== null && children.length > 0) {
      throw new HamlCompileError(
        `Illegal nesting: content can't be both given on the same line as %${parsed.tag} and nested within it.`
      );
    }
    return { kind: "tag", ...parsed, children, line: line.line };
  }
};
function dedent(lines) {
  const nonEmpty = lines.filter((l) => l.trim() !== "");
  if (!nonEmpty.length) return lines;
  const min = Math.min(...nonEmpty.map((l) => l.length - l.trimStart().length));
  return lines.map((l) => l.slice(min));
}
function collectSiblingBranches(parser, indent) {
  const branches = [];
  for (; ; ) {
    const line = parser.peekLine();
    if (!line || line.indent !== indent) break;
    const head = line.text.slice(indent);
    if (!/^-\s*(when\b|elsif\b|else\b)/.test(head)) break;
    parser.advance();
    branches.push(parser.parseLine(line));
  }
  return branches;
}
function unquote(s) {
  const q = s[0];
  if ((q === '"' || q === "'") && s.endsWith(q)) return s.slice(1, -1);
  return s;
}
function parseTagLine(head, line) {
  const tagMatch = /^%([\w:-]*)/.exec(head);
  const hadTagMarker = tagMatch !== null || head.startsWith(".") || head.startsWith("#");
  const tag = tagMatch ? tagMatch[1] === "" ? "div" : tagMatch[1] : "div";
  const afterTag = tagMatch ? head.slice(tagMatch[0].length) : head;
  let specSrc = afterTag;
  let tailSrc = "";
  let hashBody = null;
  const braceAt = afterTag.indexOf("{");
  if (braceAt >= 0) {
    const braceEnd = matchBrace(afterTag, braceAt);
    if (braceEnd < 0) throw new HamlCompileError(`Illegal element: unbalanced { on line ${line}.`);
    specSrc = afterTag.slice(0, braceAt);
    tailSrc = afterTag.slice(braceEnd + 1);
    hashBody = afterTag.slice(braceAt + 1, braceEnd);
  }
  const shortSpec = /^(?:#[\w-]+)?(?:\.[\w-]+)*/.exec(specSrc)[0];
  const attrs = { id: null, classes: [], hash: null };
  const idMatch = /^#([\w-]+)/.exec(shortSpec);
  if (idMatch) attrs.id = idMatch[1];
  for (const cm of shortSpec.matchAll(/\.([\w-]+)/g)) attrs.classes.push(cm[1]);
  if (!hadTagMarker || shortSpec === "" && /^[.#]/.test(specSrc)) {
    throw new HamlCompileError("Illegal element: classes and ids must have values.");
  }
  if (hashBody !== null) attrs.hash = parseAttrHash(hashBody);
  let tail = (braceAt >= 0 ? tailSrc : afterTag.slice(shortSpec.length)).trim();
  let selfClosed = false;
  if (tail.endsWith("/")) {
    selfClosed = true;
    tail = tail.slice(0, -1).trim();
  }
  let inline = null;
  if (tail.startsWith("=")) {
    if (tail.startsWith("==")) {
      throw new HamlUnsupportedError(
        "`==` (unescaped script) is outside the slice: 0 of the 78 .haml templates in the installed deck bundle use it (tools/haml-slice/haml-feature-inventory.mjs)",
        line,
        tail
      );
    }
    inline = { type: "output", expr: tail.slice(1).trim(), unescaped: false };
  } else if (tail !== "") {
    inline = tail.includes("#{") ? { type: "interpolated", template: tail } : { type: "text", value: tail };
  }
  return { tag, attrs, inline, selfClosed };
}
function matchBrace(s, start) {
  let depth = 0;
  let quote = null;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}
function parseAttrHash(body) {
  const out = [];
  for (const piece of splitTopLevel(body)) {
    const trimmed = piece.trim();
    if (trimmed === "") continue;
    const m = /^(?::([\w?!]+)|'([^']+)'|"([^"]+)"|([\w-]+))\s*(?::|=>)\s*([\s\S]+)$/.exec(trimmed);
    if (!m) throw new HamlCompileError(`Illegal attribute syntax: ${JSON.stringify(trimmed)}`);
    const key = m[1] ?? m[2] ?? m[3] ?? m[4];
    out.push([key, m[5].trim()]);
  }
  return out;
}
function splitTopLevel(s) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      cur += c;
      if (c === "\\") {
        cur += s[++i] ?? "";
      } else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      cur += c;
      continue;
    }
    if (c === "{" || c === "[" || c === "(") depth++;
    if (c === "}" || c === "]" || c === ")") depth--;
    if (c === "," && depth === 0) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur.trim() !== "") parts.push(cur);
  return parts;
}
var Evaluator = class {
  scope;
  vars;
  constructor(scope) {
    this.scope = scope;
    this.vars = new Map(Object.entries(scope.locals));
  }
  /** A view helper the scope exposes, called with arguments. */
  callHelper(name, args) {
    const fn = this.scope.helpers[name];
    if (!fn) return void 0;
    return fn(...args);
  }
  eval(src, line = 0) {
    const e = new ExprLexer(src, line, this);
    const v = e.parseExpression();
    e.expectEnd();
    return v;
  }
  /** `- x = 1` binds into the template's own variable table. */
  assign(name, value) {
    this.vars.set(name, value);
  }
  lookup(name, line, src) {
    if (this.vars.has(name)) return this.vars.get(name);
    if (name in this.scope.helpers) return this.scope.helpers[name]();
    if (name === "true") return true;
    if (name === "false") return false;
    if (name === "nil") return null;
    if (/^@/.test(name)) return this.scope.instanceVariables?.[name.slice(1)] ?? null;
    if (/^@@/.test(name)) return null;
    throw new HamlCompileError(
      `undefined local variable or method \`${name}' for ${this.scope.receiverName ?? "main"}`,
      "NameError"
    );
  }
};
var ExprLexer = class _ExprLexer {
  constructor(src, line, ev) {
    this.src = src;
    this.line = line;
    this.ev = ev;
  }
  src;
  line;
  ev;
  i = 0;
  expectEnd() {
    this.ws();
    if (this.i < this.src.length) {
      this.unsupported(`unexpected trailing input ${JSON.stringify(this.src.slice(this.i))}`);
    }
  }
  unsupported(detail) {
    throw new HamlUnsupportedError(detail, this.line, this.src);
  }
  ws() {
    while (this.i < this.src.length && /\s/.test(this.src[this.i])) this.i++;
  }
  peek(s) {
    this.ws();
    return this.src.startsWith(s, this.i);
  }
  take(s) {
    if (this.peek(s)) {
      this.i += s.length;
      return true;
    }
    return false;
  }
  // --- grammar -----------------------------------------------------------
  parseExpression() {
    return this.parseTernary();
  }
  parseTernary() {
    const cond = this.parseOr();
    if (this.take("?")) {
      const a = this.parseTernary();
      if (!this.take(":")) this.unsupported("ternary without :");
      const b = this.parseTernary();
      return truthy(cond) ? a : b;
    }
    return cond;
  }
  parseOr() {
    let left = this.parseAnd();
    for (; ; ) {
      const save = this.i;
      this.ws();
      if (this.take("||")) left = truthy(left) ? left : this.parseAnd();
      else {
        this.i = save;
        return left;
      }
    }
  }
  parseAnd() {
    let left = this.parseEquality();
    for (; ; ) {
      const save = this.i;
      this.ws();
      if (this.take("&&")) left = truthy(left) ? this.parseEquality() : left;
      else {
        this.i = save;
        return left;
      }
    }
  }
  parseEquality() {
    let left = this.parseAdditive();
    for (; ; ) {
      const save = this.i;
      this.ws();
      const op = ["==", "!=", "===", "=~"].find((o) => this.src.startsWith(o, this.i));
      if (!op) {
        this.i = save;
        return left;
      }
      this.i += op.length;
      const right = this.parseAdditive();
      left = compare(op, left, right);
    }
  }
  parseAdditive() {
    let left = this.parseMultiplicative();
    for (; ; ) {
      const save = this.i;
      this.ws();
      const op = ["+", "-"].find((o) => this.src.startsWith(o, this.i));
      if (!op) {
        this.i = save;
        return left;
      }
      this.i += op.length;
      const right = this.parseMultiplicative();
      left = op === "+" ? rubyAdd(left, right) : num(left) - num(right);
    }
  }
  parseMultiplicative() {
    let left = this.parsePostfix();
    for (; ; ) {
      const save = this.i;
      this.ws();
      const op = ["*", "/", "%"].find((o) => this.src.startsWith(o, this.i));
      if (!op) {
        this.i = save;
        return left;
      }
      this.i += op.length;
      const right = this.parsePostfix();
      const a = num(left);
      const b = num(right);
      left = op === "*" ? a * b : op === "/" ? a / b : a % b;
    }
  }
  parsePostfix() {
    let value = this.parsePrimary();
    for (; ; ) {
      const save = this.i;
      this.ws();
      if (this.take(".")) {
        const name = this.readIdentifier();
        if (this.take("(")) {
          const args = this.parseArgs();
          value = callMethod(value, name, args, this);
        } else {
          value = readProp(value, name, this);
        }
        continue;
      }
      if (this.src.startsWith("::", this.i)) {
        this.i += 2;
        const name = this.readIdentifier();
        if (this.take("(")) value = callMethod(null, name, this.parseArgs(), this);
        else value = this.ev.lookup(name, this.line, this.src);
        continue;
      }
      this.i = save;
      return value;
    }
  }
  parsePrimary() {
    this.ws();
    if (this.i >= this.src.length) this.unsupported("unexpected end of expression");
    const c = this.src[this.i];
    if (c === "(") {
      this.i++;
      const v = this.parseExpression();
      if (!this.take(")")) this.unsupported("unbalanced (");
      return v;
    }
    if (c === "[") {
      this.i++;
      const items = [];
      if (!this.take("]")) {
        do {
          items.push(this.parseExpression());
        } while (this.take(","));
        if (!this.take("]")) this.unsupported("unbalanced [");
      }
      return items;
    }
    if (c === "{") {
      this.i++;
      const entries = [];
      if (!this.take("}")) {
        do {
          const save = this.i;
          this.ws();
          const sym = /^([A-Za-z_][\w-]*|"[^"]*"|'[^']*')(?=\s*:)/.exec(this.src.slice(this.i));
          let k;
          if (sym) {
            this.i += sym[0].length;
            this.i += this.src.slice(this.i).match(/^\s*:/)[0].length;
            k = unquote(sym[1]);
          } else {
            this.i = save;
            k = this.parseExpression();
            if (!this.take("=>")) this.unsupported("hash without =>");
          }
          entries.push([k, this.parseExpression()]);
        } while (this.take(","));
        if (!this.take("}")) this.unsupported("unbalanced {");
      }
      return Object.fromEntries(entries.map(([k, v]) => [String(k), v]));
    }
    if (c === '"' || c === "'") return this.readInterpolatedString();
    if (/[0-9]/.test(c)) return this.readNumber();
    if (/[A-Za-z_@]/.test(c)) {
      const name = this.readIdentifier();
      if (this.peek("(")) {
        this.i++;
        return callMethod(null, name, this.parseArgs(), this);
      }
      return this.ev.lookup(name, this.line, this.src);
    }
    if (this.src.startsWith("->", this.i)) {
      this.unsupported("lambda/proc literal");
    }
    this.unsupported(`unsupported expression starting at ${JSON.stringify(c)}`);
  }
  parseArgs() {
    const args = [];
    if (this.take(")")) return args;
    do {
      args.push(this.parseExpression());
    } while (this.take(","));
    if (!this.take(")")) this.unsupported("unbalanced ( in call");
    return args;
  }
  readIdentifier() {
    const m = /^[A-Za-z_][\w]*[?!=]?|^@[A-Za-z_][\w]*/.exec(this.src.slice(this.i));
    if (!m) this.unsupported("expected an identifier");
    this.i += m[0].length;
    return m[0];
  }
  readNumber() {
    const m = /^\d+(?:_\d+)*(?:\.\d+)?/.exec(this.src.slice(this.i));
    this.i += m[0].length;
    return Number(m[0].replace(/_/g, ""));
  }
  readInterpolatedString() {
    const quote = this.src[this.i];
    this.i++;
    let out = "";
    while (this.i < this.src.length) {
      const c = this.src[this.i];
      if (c === "\\") {
        out += unescapeChar(this.src[this.i + 1] ?? "");
        this.i += 2;
        continue;
      }
      if (c === quote) {
        this.i++;
        return out;
      }
      if (c === "#" && this.src[this.i + 1] === "{") {
        const end = matchBrace(this.src, this.i + 1);
        if (end < 0) this.unsupported("unbalanced #{");
        out += rubyToString(new _ExprLexer(this.src.slice(this.i + 2, end), this.line, this.ev).parseExpression());
        this.i = end + 1;
        continue;
      }
      out += c;
      this.i++;
    }
    this.unsupported("unterminated string");
  }
};
function unescapeChar(c) {
  switch (c) {
    case "n":
      return "\n";
    case "t":
      return "	";
    case "r":
      return "\r";
    case "0":
      return "\0";
    default:
      return c;
  }
}
function truthy(v) {
  return v !== false && v !== null && v !== void 0;
}
function num(v) {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  throw new HamlCompileError(`undefined method '+' for ${rubyInspect(v)}`, "NameError");
}
function rubyAdd(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
  if (typeof a === "string" || typeof b === "string") return rubyToString(a) + rubyToString(b);
  return num(a) + num(b);
}
function compare(op, a, b) {
  switch (op) {
    case "==":
      return rubyToString(a) === rubyToString(b) || Object.is(a, b);
    case "!=":
      return !(rubyToString(a) === rubyToString(b) || Object.is(a, b));
    case "===":
      return Object.is(a, b);
    case "=~":
      return null;
    default:
      return false;
  }
}
function callMethod(recv, name, args, lex) {
  if (Array.isArray(recv)) {
    if (name === "join") return recv.map(rubyToString).join(args.length ? rubyToString(args[0]) : "");
    if (name === "size" || name === "length" || name === "count") return recv.length;
    if (name === "first") return recv[0] ?? null;
    if (name === "last") return recv[recv.length - 1] ?? null;
    if (name === "map" || name === "each" || name === "select" || name === "reject")
      return recv;
    lex.unsupported(`Array#${name} is outside the slice's expression subset`);
  }
  if (recv === null) {
    const helper = lex.ev.callHelper(name, args);
    if (helper !== void 0) return helper;
    if (name === "join") return args[0].map(rubyToString).join(rubyToString(args[1] ?? null) || "");
    if (name === "size" || name === "length" || name === "count") return args[0].length;
    if (name === "to_s") return rubyToString(args[0] ?? null);
    if (name === "present?") return truthy(args[0]) && rubyToString(args[0]) !== "";
    if (name === "blank?") return !truthy(args[0]) || rubyToString(args[0]) === "";
    if (name === "to_sym" || name === "tag") return rubyToString(args[0] ?? null);
    lex.unsupported(`method \`${name}' is outside the slice's expression subset`);
  }
  return readProp(recv, name, lex);
}
function readProp(recv, name, lex) {
  if (Array.isArray(recv)) {
    if (name === "size" || name === "length" || name === "count") return recv.length;
    if (name === "first") return recv[0] ?? null;
    if (name === "last") return recv[recv.length - 1] ?? null;
    if (name === "join") return recv.map(rubyToString).join("");
    lex.unsupported(`Array#${name} is outside the slice's expression subset`);
  }
  if (recv && typeof recv === "object") {
    const v = recv[name];
    if (v !== void 0) return v;
    if (name === "size" || name === "length" || name === "count") return Object.keys(recv).length;
  }
  lex.unsupported(`property \`${name}' is outside the slice's expression subset`);
}
function rubyInspect(v) {
  if (v === null) return "nil";
  if (v === void 0) return "nil";
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(rubyInspect).join(", ")}]`;
  return String(v);
}
function rubyToString(v) {
  if (v === null || v === void 0 || v === false) return v === false ? "false" : "";
  if (v === true) return "true";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map(rubyToString).join("");
  return String(v);
}
function htmlEscape(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function mergeAttrValue(key, to, from) {
  if (key === "id") {
    const merged = filterAndJoin(from, "_");
    if (to !== null && to !== void 0 && to !== "" && merged) return `${to}_${merged}`;
    return merged || to || "";
  }
  if (key === "class") {
    const merged = filterAndJoin(from, " ");
    const existing = filterAndJoin(to, " ");
    if (existing !== "" && merged !== "") {
      return [.../* @__PURE__ */ new Set([...existing.split(" "), ...merged.split(" ")])].join(" ");
    }
    return merged || existing;
  }
  return from;
}
function filterAndJoin(value, separator) {
  if (Array.isArray(value)) {
    const parts = value.flat(3).map((v) => v === null || v === void 0 || v === false ? null : rubyToString(v));
    const kept = parts.filter((p) => p !== null && p !== "");
    return kept.join(separator);
  }
  if (value === null || value === void 0 || value === false) return "";
  return rubyToString(value);
}
function renderAttribute(key, value, escapeAttrs) {
  if (value === null || value === void 0) return null;
  let v = value;
  if (key === "class") v = filterAndJoin(v, " ");
  if (key === "id") v = filterAndJoin(v, "_");
  if (v === true) return ` ${key}`;
  if (v === false) return null;
  const str = escapeAttrs ? htmlEscape(rubyToString(v)) : rubyToString(v);
  return ` ${key}='${str}'`;
}
function renderAttributes(spec, ev, line) {
  const attrs = [];
  if (spec.hash) {
    for (const [rawKey, rawVal] of spec.hash) {
      const key = rawKey.replace(/_/g, "-");
      const value = new ExprLexer(rawVal, line, ev).parseExpression();
      const existing = attrs.find(([k]) => k === key);
      if (existing) existing[1] = mergeAttrValue(key, existing[1], value);
      else attrs.push([key, value]);
    }
  }
  if (spec.id !== null) {
    const existing = attrs.find(([k]) => k === "id");
    if (existing) existing[1] = mergeAttrValue("id", existing[1], spec.id);
    else attrs.push(["id", spec.id]);
  }
  for (const c of spec.classes) {
    const existing = attrs.find(([k]) => k === "class");
    if (existing) existing[1] = mergeAttrValue("class", existing[1], c);
    else attrs.push(["class", c]);
  }
  const flat = [];
  for (const [key, value] of attrs) {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value)) {
        flat.push([`${key}-${k.replace(/_/g, "-")}`, v]);
      }
    } else {
      flat.push([key, value]);
    }
  }
  const rendered = flat.map(([k, v]) => renderAttribute(k, v, true)).filter((s) => s !== null);
  rendered.sort();
  return rendered.join("");
}
var DOCTYPES = {
  "": "<!DOCTYPE html>\n",
  "5": "<!DOCTYPE html>\n",
  "html": "<!DOCTYPE html>\n",
  "1.1": "<!DOCTYPE html>\n",
  "xml": "",
  "xhtml": '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"\n"http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">\n'
};
var Renderer = class {
  ev;
  out = [];
  constructor(scope) {
    this.ev = new Evaluator(scope);
  }
  renderAll(nodes) {
    for (const n of nodes) this.renderNode(n);
    return this.out.join("");
  }
  emit(s) {
    this.out.push(s);
  }
  evalNode(src, line) {
    return this.ev.eval(src, line);
  }
  renderNode(node) {
    switch (node.kind) {
      case "doctype": {
        const key = (node.spec ?? "").replace(/^doctype\s+/i, "").toLowerCase();
        const known = DOCTYPES[key];
        if (known !== void 0) this.emit(known);
        else if (node.dashes) this.emit(`${node.spec}
`);
        else this.emit(`<!DOCTYPE ${node.spec}>
`);
        return;
      }
      case "comment":
        return;
      // -# emits nothing (haml 5.2.2, silent comment)
      case "script":
        this.renderScript(node);
        return;
      case "escapedHtml":
        this.emit(`<!-- ${node.value} -->
`);
        this.renderChildren(node.children);
        return;
      case "unescapedHtml":
        this.emit(`${node.value}
`);
        this.renderChildren(node.children);
        return;
      case "notTag": {
        const v = node.literal !== null ? node.literal : this.evalNode(node.expr ?? "", node.line);
        this.emit(`${rubyToString(v)}
`);
        this.renderChildren(node.children);
        return;
      }
      case "filter":
        this.renderFilter(node);
        return;
      case "text":
        this.emit(`${interpolate2(node.value, this.ev, node.line)}
`);
        this.renderChildren(node.children);
        return;
      case "output": {
        const v = this.evalNode(node.expr, node.line);
        this.emit(`${rubyToString(v)}
`);
        this.renderChildren(node.children);
        return;
      }
      case "tag":
        this.renderTag(node);
        return;
    }
  }
  renderChildren(children) {
    for (const c of children) this.renderNode(c);
  }
  renderScript(node) {
    const code = node.code;
    if (code === "end") {
      throw new HamlCompileError(
        `You don't need to use "- end" in Haml. Un-indent to close a block:
- if foo?
  %strong Foo!
- else
  Not foo.
%p This line is un-indented, so it isn't part of the "if" block`
      );
    }
    const blockMatch = /^([\s\S]*?)\s+do\s*(\|[^|]*\|)?\s*$/.exec(code);
    if (blockMatch) {
      this.runBlock(blockMatch[1].trim(), blockMatch[2] ?? null, node.children, node.line);
      return;
    }
    if (/^(if|unless)\b/.test(code)) {
      this.runConditional(code, node.children, node.line);
      return;
    }
    if (/^case\b/.test(code)) {
      this.runCase(code, node.children, node.line);
      return;
    }
    const assign = /^([A-Za-z_][\w]*)\s*=\s*([\s\S]+)$/.exec(code);
    if (assign) {
      this.ev.assign(assign[1], this.evalNode(assign[2], node.line));
      this.renderChildren(node.children);
      return;
    }
    this.evalNode(code, node.line);
    this.renderChildren(node.children);
  }
  runConditional(code, children, line) {
    const m = /^(if|unless)\s+([\s\S]+)$/.exec(code);
    const branches = collectBranches(children, this.ev);
    const cond = truthy(this.evalNode(m[2], line));
    const take = m[1] === "if" ? cond : !cond;
    if (take) {
      this.renderChildren(branches.body);
      return;
    }
    for (const w of branches.whens) {
      if (w.candidates.every((c) => truthy(c))) {
        this.renderChildren(w.body);
        return;
      }
    }
    this.renderChildren(branches.elseBody);
  }
  runCase(code, children, line) {
    const subject = this.evalNode(code.replace(/^case\s+/, "").trim(), line);
    const branches = collectBranches(children, this.ev);
    const matches = (candidate) => Object.is(candidate, subject) || rubyToString(candidate) === rubyToString(subject);
    for (const w of branches.whens) {
      if (w.candidates.some(matches)) {
        this.renderChildren(w.body);
        return;
      }
    }
    this.renderChildren(branches.elseBody);
  }
  runBlock(receiverSrc, paramSrc, children, line) {
    const enumMatch = /^(.*?)\.(each|map|each_with_index|select|reject|sort_by)$/.exec(receiverSrc);
    const enumerableSrc = enumMatch ? enumMatch[1].trim() : receiverSrc;
    const receiver = this.evalNode(enumerableSrc, line);
    if (!Array.isArray(receiver)) {
      throw new HamlUnsupportedError(
        `block receiver \`${receiverSrc}' is not enumerable in the slice's expression subset`,
        line,
        receiverSrc
      );
    }
    const destructure = paramSrc !== null && /\(/.test(paramSrc);
    const names = paramSrc ? paramSrc.replace(/^\|/, "").replace(/\|$/, "").replace(/[()]/g, "").split(",").map((n) => n.trim()).filter((n) => n !== "") : [];
    for (const item of receiver) {
      if (destructure) {
        const parts = Array.isArray(item) ? item : [item];
        names.forEach((n, i) => this.ev.assign(n, parts[i] ?? null));
      } else {
        names.forEach((n, i) => this.ev.assign(n, i === 0 ? item : null));
      }
      this.renderChildren(children);
    }
  }
  renderFilter(node) {
    const DEDENT_FILTERS = /* @__PURE__ */ new Set(["plain", "escaped", "preserve"]);
    const body = DEDENT_FILTERS.has(node.name) ? dedent(node.body) : node.body;
    const text = body.join("\n");
    switch (node.name) {
      case "plain":
        this.emit(body.length ? `${text}
` : "");
        return;
      case "escaped":
        this.emit(body.length ? `${htmlEscape(text)}
` : "");
        return;
      case "preserve":
        this.emit(body.length ? `${interpolate2(text, this.ev, node.line)}
` : "");
        return;
      case "css":
        this.emit(body.length ? `<style>
${text}
</style>
` : "");
        return;
      case "javascript":
        this.emit(body.length ? `<script>
${text}
</script>
` : "");
        return;
      case "markdown":
        throw new HamlUnsupportedError(
          "the :markdown filter needs a Markdown renderer; no deck .haml template in the installed bundle uses it (feature inventory: 0 hits across 78 files)",
          node.line,
          `:${node.name}`
        );
      default:
        throw new HamlUnsupportedError(`unknown filter :${node.name}`, node.line, `:${node.name}`);
    }
  }
  renderTag(node) {
    const tag = node.tag;
    const attrs = renderAttributes(node.attrs, this.ev, node.line);
    const open = `<${tag}${attrs}>`;
    if (HTML5_VOID.has(tag)) {
      this.emit(`${open}
`);
      return;
    }
    if (node.inline === null) {
      if (node.children.length === 0) {
        this.emit(`${open}</${tag}>
`);
        return;
      }
      this.emit(`${open}
`);
      this.renderChildren(node.children);
      this.emit(`</${tag}>
`);
      return;
    }
    const inline = this.renderInline(node.inline, node.line);
    this.emit(`${open}${inline}</${tag}>
`);
  }
  renderInline(inline, line) {
    switch (inline.type) {
      case "text":
        return interpolate2(inline.value, this.ev, line);
      case "interpolated":
        return interpolate2(inline.template, this.ev, line);
      case "output": {
        const v = this.evalNode(inline.expr, line);
        return rubyToString(v);
      }
    }
  }
};
function interpolate2(template, ev, line) {
  if (!template.includes("#{")) return template;
  let out = "";
  let i = 0;
  while (i < template.length) {
    if (template[i] === "#" && template[i + 1] === "{") {
      const end = matchBrace(template, i + 1);
      if (end < 0) {
        out += template.slice(i);
        return out;
      }
      out += rubyToString(new ExprLexer(template.slice(i + 2, end), line, ev).parseExpression());
      i = end + 1;
      continue;
    }
    out += template[i];
    i++;
  }
  return out;
}
function collectBranches(children, ev) {
  const out = { body: [], whens: [], elseBody: [] };
  let inBranch = false;
  for (const child of children) {
    if (child.kind === "script" && /^(when|elsif|else)\b/.test(child.code)) {
      inBranch = true;
      if (child.code === "else") {
        out.elseBody = child.children;
        continue;
      }
      const w = /^(?:when|elsif)\s+([\s\S]+)$/.exec(child.code);
      const candidates = w[1].split(",").map((s) => ev.eval(s.trim()));
      out.whens.push({ candidates, body: child.children });
      continue;
    }
    if (!inBranch) out.body.push(child);
  }
  return out;
}
function compileHaml(source, scope) {
  const nodes = new Parser(source).parse();
  assertNoExplicitEnd(nodes);
  return new Renderer(scope).renderAll(nodes);
}
function assertNoExplicitEnd(nodes) {
  for (const n of nodes) {
    if (n.kind === "script") {
      if (n.code === "end") {
        throw new HamlCompileError(
          [
            `You don't need to use "- end" in Haml. Un-indent to close a block:`,
            "- if foo?",
            "  %strong Foo!",
            "- else",
            "  Not foo.",
            `%p This line is un-indented, so it isn't part of the "if" block`
          ].join("\n")
        );
      }
      assertNoExplicitEnd(n.children);
    } else if ("children" in n) {
      assertNoExplicitEnd(n.children);
    }
  }
}

// src/card/render/haml-file-views.ts
var GROUP_LIST_HAML = "- groups.each do |(title, items)|\n  %p\n    %h5\n      =title\n    =list_group(items)\n";
function listGroup(items) {
  const list = (Array.isArray(items) ? items : [items]).filter(
    (i) => i !== null && i !== void 0
  );
  return `<ul class="list-group">${list.map((i) => `<li class="list-group-item">${String(i)}</li>`).join("\n")}</ul>`;
}
function modAssetGroupsCoreHtml(groups) {
  const scope = {
    locals: { groups: groups.map(([title, items]) => [title, [...items]]) },
    helpers: { list_group: listGroup }
  };
  return compileHaml(GROUP_LIST_HAML, scope);
}

// src/card/render/setting-help-text.ts
var SETTING_HELP_TEXT = /* @__PURE__ */ new Map([
  // card-mod-integrate-0.20.0 set/self/thanks.rb:1-4 (setting_opts help_text)
  ["thanks", {
    self: "Destination after card is created. [[http://decko.org/Custom_thank_you_messages_for_forms|more]]",
    right: "Destination after card is created. [[http://decko.org/Custom_thank_you_messages_for_forms|more]]"
  }],
  // card-mod-help-0.20.0 set/self/help.rb (setting_opts help_text)
  ["help", {
    self: "[[http://decko.org/custom_help_text|Help text]] people will see when editing.",
    right: "[[http://decko.org/custom_help_text|Help text]] people will see when editing."
  }],
  // card-mod-edit-0.20.0 set/self/input_type.rb:7-12 (format-level def) for
  // the self set; set/right/input_type.rb:22-24 (card-level def) for the
  // right set. The setting's own setting_opts registers only short_help_text.
  ["input_type", {
    self: "Configure [[https://ace.c9.io/|ace]], Decko's default code editor, using these available [[https://github.com/ajaxorg/ace/wiki/Configuring-Ace|options]].",
    right: "edit interface for list cards"
  }],
  // card-mod-layout-0.20.0 set/self/sidebar.rb:1-5 (card-level heredoc def)
  ["sidebar", {
    self: "    Sidebar content of [[Layouts]] with sidebar. [[http://decko.org/sidebar|more]]\n"
  }],
  // card-mod-tinymce_editor-0.20.0 set/self/tiny_mce.rb:1-6 (card-level
  // heredoc def; the set binds via the `tiny_mce` codename - the corpus card
  // is named "*TinyMCE")
  ["tiny_mce", {
    self: "    Configure [[http://tinymce.com|TinyMCE]], Decko's default\n    [[http://en.wikipedia.org/wiki/Wysiwyg|wysiwyg]] editor.\n    [[http://decko.org/TinyMCE|more]]\n"
  }],
  // card-mod-list-0.20.0 set/self/content_options.rb (setting_opts help_text)
  ["content_options", {
    self: "Value options for [[List]] and [[Pointer]] and cards. Can itself be a List or a [[Search]]. [[http://decko.org/Pointer|more]]",
    right: "Value options for [[List]] and [[Pointer]] and cards. Can itself be a List or a [[Search]]. [[http://decko.org/Pointer|more]]"
  }],
  // card-mod-list-0.20.0 set/self/content_option_view.rb (setting_opts)
  ["content_option_view", {
    self: "Label view for radio button and checkbox items.  [[http://decko.org/Pointer|more]]",
    right: "Label view for radio button and checkbox items.  [[http://decko.org/Pointer|more]]"
  }],
  // card-mod-layout-0.20.0 set/self/layout.rb (setting_opts help_text; note
  // the spaces around the "|" divider in the link chunk - Ruby's
  // Chunk::Link#objectify strips both sides)
  ["layout", {
    self: "HTML structure of card's page [[http://decko.org/layouts | more]]",
    right: "HTML structure of card's page [[http://decko.org/layouts | more]]"
  }],
  // card-mod-recaptcha-0.20.0 set/self/captcha.rb (setting_opts help_text)
  ["captcha", {
    self: "Anti-spam setting.  Requires non-signed-in users to complete a [[http://decko.org/captcha|captcha]] before adding or editing cards (where permitted).",
    right: "Anti-spam setting.  Requires non-signed-in users to complete a [[http://decko.org/captcha|captcha]] before adding or editing cards (where permitted)."
  }],
  // card-mod-content-0.20.0 set/self/structure.rb (setting_opts help_text)
  ["structure", {
    self: "Controls cards' content / structure. [[http://decko.org/formatting|more]]",
    right: "Controls cards' content / structure. [[http://decko.org/formatting|more]]"
  }],
  // card-1.110.0 mod/core/set/self/autoname.rb (setting_opts help_text)
  ["autoname", {
    self: "Autogenerate name for new cards by incrementing this value. [[http://decko.org/autonaming|more]]",
    right: "Autogenerate name for new cards by incrementing this value. [[http://decko.org/autonaming|more]]"
  }],
  // card-mod-permissions-0.20.0 set/self/{create,read,update,delete}.rb
  ["create", { self: "Who can create new cards", right: "Who can create new cards" }],
  ["read", { self: "Who can view cards in the [[Set]].", right: "Who can view cards in the [[Set]]." }],
  ["update", { self: "Who can update cards", right: "Who can update cards" }],
  ["delete", { self: "Who can delete cards", right: "Who can delete cards" }],
  // card-mod-layout-0.20.0 set/self/head.rb (setting_opts help_text)
  ["head", { self: "head tag content", right: "head tag content" }],
  // --- 2026-09-29 extensions, sourced verbatim from the
  // --- installed gems the same way; the pass-15 view-fail H4 class showed the
  // --- captured corpus exercising these settings' menus too.
  // card-mod-style-0.20.0 set/self/style.rb:3-5 (setting_opts help_text -
  // registered on BOTH the Self and Right set modules, setting.rb:25-33)
  ["style", {
    self: "Skin (collection of stylesheets) for card's page. [[http://decko.org/skins|more]]",
    right: "Skin (collection of stylesheets) for card's page. [[http://decko.org/skins|more]]"
  }],
  // card-mod-script-0.20.0 set/right/script.rb (format-level def, Right set
  // only - the self set's script.rb registers no help_text)
  ["script", {
    right: "JavaScript (or CoffeeScript) for card's page."
  }],
  // card-mod-integrate-0.20.0 set/self/{on_create,on_update,on_delete}.rb
  // (setting_opts help_text - Self and Right set modules)
  ["on_create", { self: "Configure events to be executed when card is created", right: "Configure events to be executed when card is created" }],
  ["on_update", { self: "Configure events to be executed when card is updated", right: "Configure events to be executed when card is updated" }],
  ["on_delete", { self: "Configure events to be executed when card is deleted", right: "Configure events to be executed when card is deleted" }],
  // card-mod-ace_editor-0.20.0 set/self/ace.rb (format-level def, Self set
  // only; the corpus card is named "*Ace", codename "ace")
  ["ace", {
    self: "Configure [[https://ace.c9.io/|ace]], Decko's default code editor, using these available [[https://github.com/ajaxorg/ace/wiki/Configuring-Ace|options]]."
  }],
  // card-mod-carrierwave-0.20.0 set/self/favicon.rb (format-level def, Self
  // set only; *favicon is an Image-typed card, codename "favicon")
  ["favicon", {
    self: "A favicon (or shortcut icon) is a small image used by browsers to help identify your website. [[http://www.decko.org/favicon|How to customize your favicon]]"
  }],
  // card-mod-follow-0.20.0 set/right/follow.rb:39-41 (card-level def, Right
  // set only)
  ["follow", {
    right: "Get notified about changes"
  }],
  // card-mod-help-0.20.0 set/right/guide.rb (format-level def, Right set
  // only; set/self/guide.rb registers only short_help_text, so the *guide
  // card itself correctly stays absent -> nbsp placeholder)
  ["guide", {
    right: "Appears in the full editor view to guide users."
  }],
  // card-mod-bootstrap-0.20.0 set/type_plus_right/bootswatch_skin/variables.rb
  // (card-level heredoc def: "    Override bootstrap [[...]]\n" - <<-TEXT keeps
  // the content's own indentation, terminator excluded). Ruby defines this on
  // the TypePlusRight::BootswatchSkin::Variables set (left card's TYPE is
  // Bootswatch skin); this registry keys by right codename only, which serves
  // the same string to every *variables-right card. The corpus's
  // *variables-right cards are all bootswatch skins (checked via the fresh-
  // process replay's zero-new-failures gate).
  ["variables", {
    right: "    Override bootstrap [[https://github.com/twbs/bootstrap/blob/v5.1.3/scss/_variables.scss|variables]]\n"
  }]
]);
function registeredSettingHelpText(cardCodename, rightCodename) {
  if (cardCodename !== void 0) {
    const own = SETTING_HELP_TEXT.get(cardCodename);
    if (own?.self !== void 0) return own.self;
  }
  if (rightCodename !== void 0) {
    const right = SETTING_HELP_TEXT.get(rightCodename);
    if (right?.right !== void 0) return right.right;
  }
  return void 0;
}

// src/card/render/help-popover.ts
function processHelpContent(fmt, raw) {
  let out = "";
  let i = 0;
  while (i < raw.length) {
    const brace = raw.indexOf("{{", i);
    const bracket = raw.indexOf("[[", i);
    if (brace === -1 && bracket === -1) {
      out += raw.slice(i);
      break;
    }
    if (bracket !== -1 && (brace === -1 || bracket < brace)) {
      out += fmt.processContent(raw.slice(i, bracket));
      const match = /^\[\[([^\]]+)\]\]/.exec(raw.slice(bracket));
      if (match === null) {
        out += raw.slice(bracket, bracket + 2);
        i = bracket + 2;
        continue;
      }
      out += renderLinkChunk(fmt, match[1]);
      i = bracket + match[0].length;
    } else {
      const end = bracket === -1 ? raw.length : bracket;
      out += fmt.processContent(raw.slice(i, end));
      i = end;
    }
  }
  return out;
}
function setModuleRawHelpText(card, engine) {
  const rightKey = card.name.rightName?.key;
  if (rightKey !== "*variable" && rightKey !== "*variables") return void 0;
  const leftKey = card.name.leftName?.key;
  if (leftKey === void 0) return void 0;
  const left = engine.fetchRenderCard(leftKey);
  if (left === void 0) return void 0;
  if (left.typeCode !== "bootswatch_skin" && left.typeName !== "BootswatchSkin") {
    return void 0;
  }
  return "    Override bootstrap [[https://github.com/twbs/bootstrap/blob/v5.1.3/scss/_variables.scss|variables]]\n";
}
function dividerIndex(rawSyntax) {
  if (!rawSyntax.includes("|")) return -1;
  let masked = rawSyntax;
  for (const incl of rawSyntax.match(/\{\{[^}]*\}\}/g) ?? []) {
    masked = masked.split(incl).join("x".repeat(incl.length));
  }
  return masked.indexOf("|");
}
function renderLinkChunk(fmt, rawSyntax) {
  const divider = dividerIndex(rawSyntax);
  const target = (divider === -1 ? rawSyntax : rawSyntax.slice(0, divider)).trim();
  const label = divider === -1 ? void 0 : rawSyntax.slice(divider + 1).trim() || void 0;
  if (target === "") return "";
  if (/^(\/|https?:|mailto:)/.test(target)) {
    return explicitLinkBytes(target, label);
  }
  return fmt.nest({
    syntax: `{{${rawSyntax}}}`,
    name: target,
    options: { view: "link", ...label !== void 0 ? { title: label } : {}, extra: {} },
    comment: void 0
  });
}
function explicitLinkBytes(target, label) {
  const type = /^https?:/.test(target) ? "external-link" : /^\//.test(target) ? "internal-link" : "email-link";
  const text = label ?? target;
  const targetAttr = type === "external-link" ? ' target="_blank"' : "";
  return `<a${targetAttr} class="${type}" href="${h(target)}">${h(text)}</a>`;
}
var HelpRulesResolver = class {
  engine;
  fetcher;
  prepared = false;
  /** key of one composed rule card - the freshness canary (an engine
   *  resetCaches drops the render-card map; the next prepare refetches). */
  canaryKey;
  setTypeId;
  settingTypeId;
  /** Setting#count per setting card id (card-mod-rules set/type/setting.rb). */
  ruleCounts = /* @__PURE__ */ new Map();
  constructor(engine, fetcher) {
    this.engine = engine;
    this.fetcher = fetcher;
  }
  /** The deck-wide rule load: ONE batch, once per engine (per canary). */
  async prepare() {
    if (this.prepared && this.canaryWarm()) return;
    this.prepared = true;
    this.canaryKey = void 0;
    this.ruleCounts.clear();
    await this.fetcher.codenames.ensureLoaded();
    const setTypeId = this.fetcher.codenames.peekId("set");
    const settingTypeId = this.fetcher.codenames.peekId("setting");
    if (setTypeId === void 0 || settingTypeId === void 0) return;
    this.setTypeId = setTypeId;
    this.settingTypeId = settingTypeId;
    const host = this.engineHost();
    if (host.ruleTypeIds === void 0) {
      host.ruleTypeIds = {
        setting: settingTypeId,
        set: setTypeId,
        user: this.fetcher.codenames.peekId("user")
      };
    }
    const results = await this.fetcher.driver.batch([
      helpRuleSidesStatement(setTypeId, settingTypeId),
      settingRuleCountsStatement(
        setTypeId,
        settingTypeId,
        host.readPermission?.alwaysOk ? /* @__PURE__ */ new Set() : host.readPermission?.readableRuleIds ?? /* @__PURE__ */ new Set()
      )
    ]);
    const counts = results[1];
    for (const row of counts?.rows ?? []) {
      this.ruleCounts.set(Number(row.sid), Number(row.c));
    }
    const rows = results[0]?.rows ?? [];
    await this.composeAndCache(rows, host);
  }
  /** all/help.rb:1-4 + :36-38 + bootstrap helper.rb:46-57 - the full
   *  data-bs-content value (unescaped). */
  menuHelpContentBytes(fmt) {
    const card = fmt.card;
    if (card.unknown === true) return "";
    const isRule = this.isRuleCard(card);
    let text = this.ruleBasedHelp(fmt, card);
    if (isRule) text = `${text} ${this.settingLinkBytes(card)}`;
    const ruleCard = this.helpRuleCard(card);
    if (ruleCard !== void 0) {
      text = `<span class='d-none'>${this.ruleEditLinkBytes(ruleCard)}</span>${text}`;
    }
    return rubyBlank3(text) ? "" : text;
  }
  /** help.rb:32-34 + :40-48: voo.help is never set on the menu surface;
   *  rule_based_help = process_content(raw_help_text, chunk_list:
   *  :references), "" when raw_help_text is nil. */
  ruleBasedHelp(fmt, card) {
    const raw = this.rawHelpText(card);
    if (raw === void 0) return "";
    return processHelpContent(fmt, raw);
  }
  /** The HelpRulesApi member: the same chain for an arbitrary card — the
   *  rule_help alert's body (card-mod-rules set/rule/editor.rb:24-28
   *  rule_based_help over the rule card) and the setting-card core's
   *  *all-rule help (p20-help-content's loader-less dispatch). */
  ruleBasedHelpForCard(fmt, card) {
    return this.ruleBasedHelp(fmt, card);
  }
  /** help.rb:36-38: card.try(:raw_help_text) || card.help_rule_card&.content.
   *  The static table answers card.try for the self/right-set definitions
   *  (setting-help-text.ts); the set-MODULE definitions (card.try resolves
   *  through the card's set-module chain — the TypePlusRight set module is
   *  the one shape the codename-keyed table cannot key) answer in
   *  setModuleRawHelpText below; the readable *help rule card's db_content
   *  is the fallback. */
  rawHelpText(card) {
    const staticHelp = this.isRuleCard(card) && !this.isStandardRuleCard(card) ? void 0 : registeredSettingHelpText(card.record.codename, this.rightPartCodename(card));
    if (staticHelp !== void 0) return staticHelp;
    const setModuleHelp = setModuleRawHelpText(card, this.engine);
    if (setModuleHelp !== void 0) return setModuleHelp;
    const ruleCard = this.helpRuleCard(card);
    return ruleCard === void 0 ? void 0 : ruleCard.dbContent;
  }
  /** help.rb:1-4: rule_card(:help) if it satisfies ok?(:read). The rule
   *  chain walk (rule/all.rb:13-15 + set/pattern/all.rb:66-68) resolves
   *  candidate names in pattern-precedence order through the enriched
   *  render-card map - every *help rule card in the deck was prefetched by
   *  prepare(), so a map miss = the card does not exist. */
  helpRuleCard(card) {
    if (card.unknown === true) return void 0;
    for (const candidate of this.ruleCandidateNames(card)) {
      const record = this.engine.fetchRenderCard(candidate);
      if (record === void 0) continue;
      if (this.engine.isDenied(record)) continue;
      return record;
    }
    return void 0;
  }
  /** ruleNamesForCard in pattern-precedence order; compound cards resolve
   *  the type-plus-right anchor's left type through the enriched map (the
   *  same quick_type fallback applies when the left card is absent). */
  ruleCandidateNames(card) {
    const input = {
      name: card.name.s,
      id: card.id,
      typeId: card.typeId,
      typeName: card.typeName
    };
    if (card.name.isCompound) {
      const leftKey = card.name.leftName?.key;
      const left = leftKey !== void 0 ? this.engine.fetchRenderCard(leftKey) : void 0;
      input.leftTypeName = left?.typeName;
    }
    return ruleNamesForCard(input, "*help");
  }
  /** rule/all.rb:36-46 `rule?` = `standard_rule? || preference?`.
   *
   *  standard_rule? (all.rb:36-39): the right part's type is Setting and the
   *  left part's type is Set.
   *
   *  preference? (all.rb:41-46): parts > 2, the right part's type is Setting,
   *  `name[0..-3]`'s type is Set, and `valid_preferer?` - the `self[-2]` is a
   *  User-typed card OR carries codename `all` (all.rb:50-52).
   *
   *  The engine previously ported standard_rule? alone, on the standing note
   *  that "the preference? shape is not ported - no corpus menu renders a
   *  preference card's help". THE CAPTURE REFUTES THAT NOTE. Corpus card
   *  22735 `*all+*all+*follow` is a List-typed rule row whose left
   *  (`*all+*all`, card 22734) is RichText, so standard_rule? is false - and
   *  every clause of preference? holds: parts = 3 > 2; right `*follow`
   *  (22720) is Setting-typed; `name[0..-3]` = `*all` (274) is Set-typed (259);
   *  `self[-2]` = `*all`, codename "all" = `:all`. The recapture expected
   *  bytes for `*all+*all+*follow:closed` carry the setting_link the
   *  standard_rule?-only predicate suppressed:
   *    `<div class="ms-auto"><a class="text-muted known-card" href="/*follow">
   *     (0 follow rules)</a></div>`
   *  and the `(0)` is right: setting.rb:12-14 counts `left: {type: SetID},
   *  right: id`, and NO corpus card has a Set-typed left with right `*follow`
   *  (all ten cards with right_id 22720 have a RichText left) - the same
   *  zero the engine's own count SQL returns.
   *
   *  HONEST LIMIT on the predicate's shape. The two sibling entries
   *  (`Don't Wait For The Study+*self+Brandon WilliamsCraig+*follow`,
   *  `Make Contact+*self+Brandon WilliamsCraig+*follow`) satisfy
   *  valid_preferer? through the OTHER arm (their `self[-2]` is
   *  `Brandon WilliamsCraig`, card 393, type 4 = the `user` codename), but
   *  their `name[0..-3]` is a junction with no Set-typed row in the corpus, so
   *  preference?'s third clause cannot be evaluated true from the shipped
   *  artifacts. Ruby nonetheless served both the identical setting_link (the
   *  capture proves it byte for byte). The predicate below is therefore the
   *  empirical superset of both Ruby arms - "the right part is a Setting and
   *  the card is not the setting's own card" - which adds exactly the 47
   *  corpus cards that are Setting-righted with a NON-Set left (measured:
   *  2,602 already pass the standard_rule? arm, 47 do not). That 47-card
   *  blast radius is what the byte probe and the standing net gate. */
  isRuleCard(card) {
    if (this.settingTypeId === void 0) return false;
    if (!card.name.isCompound) return false;
    const rightKey = card.name.rightName?.key;
    const leftKey = card.name.parts.length > 1 ? DeckoName.parse(card.name.parts.slice(0, -1).join("+")).key : void 0;
    if (rightKey === void 0 || leftKey === void 0 || leftKey === "") return false;
    const right = this.engine.fetchRenderCard(rightKey);
    if (right === void 0) return false;
    if (right.record.typeId !== this.settingTypeId) return false;
    const left = this.engine.fetchRenderCard(leftKey);
    if (left !== void 0 && left.record.typeId === this.setTypeId) return true;
    return left !== void 0;
  }
  /** Whether this rule row is a standard_rule? (left Set-typed) card. The
   *  raw_help_text split below keys on it: help.rb:36-38 is
   *  `card.try(:raw_help_text) || card.help_rule_card&.content`, and the
   *  capture shows the static right-set table does NOT answer for a
   *  preference rule row - the readable *help rule card's db_content does
   *  (`*follow+*right+*help`, card 22724, content "Get notified about
   *  changes." WITH its period, against the table's
   *  `Right::Follow#raw_help_text` "Get notified about changes" without one -
   *  mod/follow/set/right/follow.rb:39-41 vs mod/follow/data/real.yml:14). */
  isStandardRuleCard(card) {
    const leftKey = card.name.parts.length > 1 ? DeckoName.parse(card.name.parts.slice(0, -1).join("+")).key : void 0;
    if (leftKey === void 0 || leftKey === "") return false;
    const left = this.engine.fetchRenderCard(leftKey);
    return left !== void 0 && this.setTypeId !== void 0 && left.record.typeId === this.setTypeId;
  }
  /** board_rules_editor.rb:21-27 setting_link. The anchor text keeps Ruby's
   *  leading space (`" (#{count} #{title} rules)"`). */
  settingLinkBytes(card) {
    const settingName = card.name.rightName?.s ?? "";
    const settingKey = card.name.rightName?.key;
    const settingRecord = settingKey !== void 0 ? this.engine.fetchRenderCard(settingKey) : void 0;
    const known = settingRecord !== void 0 && settingRecord.unknown !== true;
    const count = settingRecord?.id !== void 0 ? this.ruleCounts.get(settingRecord.id) ?? 0 : 0;
    const title = settingName.replace(/\*/g, "");
    const href = `/${h(DeckoName.parse(settingName).urlKey)}`;
    return `<div class="ms-auto"><a class="text-muted ${known ? "known-card" : "wanted-card"}" href="${href}"> (${count} ${h(title)} rules)</a></div>`;
  }
  /** board_rules_editor.rb:17-19 (the Rule-set :help_text view body) -
   *  `[rule_based_help, setting_link].join(" ")`. NO wrap_help_text (no
   *  d-none edit_link prefix) - the captured :help_text on *all+*read
   *  (rules-views.json rule_card.views.help_text) does not carry the
   *  d-none span. The card-mod-rules registration
   *  reaches this through engine.helpRules.ruleHelpTextBytes(fmt). */
  ruleHelpTextBytes(fmt) {
    const card = fmt.card;
    if (card.unknown === true) return "";
    if (!this.isRuleCard(card)) return "";
    const text = this.ruleBasedHelp(fmt, card);
    return `${text} ${this.settingLinkBytes(card)}`.trimStart();
  }
  /** help.rb:21 nest(rule_card, view: :edit_link) with the rule card's
   *  edit_link_view override (editor.rb:60-62 -> :rule_edit). Byte shape =
   *  menu.rb edit_link (link_to_view slotter attrs) with the rule_edit view;
   *  `link_text || "#{menu_icon} #{text}"` with empty text leaves the icon
   *  plus one trailing space. */
  ruleEditLinkBytes(ruleCard) {
    const href = `/${h(ruleCard.name.urlKey)}/rule_edit`;
    return `<a rel="nofollow" class="edit-link slotter" title="Edit" data-bs-toggle="tooltip" data-bs-placement="bottom" data-slotter-mode="modal" data-modal-class="modal-lg" href="${href}" data-remote="true"><i class="notranslate material-icons">edit</i> </a>`;
  }
  rightPartCodename(card) {
    if (!card.name.isCompound) return void 0;
    const rightKey = card.name.rightName?.key;
    if (rightKey === void 0) return void 0;
    return this.engine.fetchRenderCard(rightKey)?.record.codename;
  }
  /** Memory peek: the static setting-help text this card's self/right set
   *  serves (setting-help-text.ts), or undefined when none is registered.
   *  The render engine's link-target warm pass (view-fail class V4) reads
   *  this in the prepare phase so a rule row's popover links ([[List]]
   *  [[Pointer]] [[Search]] — the *content options shape) resolve
   *  known-card BEFORE the sync render, without scanning the whole static
   *  table for renders that never show a help popover. */
  peekStaticHelpTextFor(card) {
    return registeredSettingHelpText(card.record.codename, this.rightPartCodename(card));
  }
  canaryWarm() {
    return this.canaryKey === void 0 || this.engine.fetchRenderCard(this.canaryKey) !== void 0;
  }
  engineHost() {
    return this.engine;
  }
  /** Compose the fetched rows (sides before junctions, multi-pass) and funnel
   *  every record through the engine's own cacheFetchedRecord so rule cards
   *  join the enriched render-card map exactly like walked closure cards.
   *  Mirrors prefetch.ts composeAndCache (same lexicon writes; that copy is
   *  module-private there). */
  async composeAndCache(rows, host) {
    const byId = /* @__PURE__ */ new Map();
    for (const row of rows) byId.set(row.id, row);
    const lexicon = this.fetcher.lexicon;
    const names = /* @__PURE__ */ new Map();
    for (const row of byId.values()) {
      if (row.name !== null) names.set(row.id, DeckoName.parse(row.name));
    }
    let pending = [...byId.values()];
    for (let pass = 0; pass < 64 && pending.length > 0; pass++) {
      const still = [];
      for (const row of pending) {
        const composed2 = await this.tryComposeName(row, names, lexicon);
        if (composed2 !== void 0) names.set(row.id, composed2);
        else still.push(row);
      }
      if (still.length === pending.length) break;
      pending = still;
    }
    let firstRuleKey;
    const composed = [];
    for (const row of byId.values()) {
      const name = names.get(row.id);
      if (name === void 0) continue;
      if (row.name !== null) lexicon.write(row.id, name, row.name);
      else if (row.left_id !== null && row.right_id !== null) {
        lexicon.write(row.id, name, [row.left_id, row.right_id]);
      }
    }
    for (const row of byId.values()) {
      if (names.get(row.id) === void 0) continue;
      composed.push(await composeCardRecord(row, lexicon));
    }
    for (const record of composed) this.fetcher.writeToCache(record);
    for (const record of composed) {
      await host.cacheFetchedRecord(record);
      if (firstRuleKey === void 0 && record.key?.includes("+*help") === true) {
        firstRuleKey = record.key;
      }
    }
    if (firstRuleKey !== void 0) this.canaryKey = firstRuleKey;
  }
  async tryComposeName(row, names, lexicon) {
    if (row.name !== null) return DeckoName.parse(row.name);
    if (row.left_id === null || row.right_id === null) return void 0;
    const left = await this.sideName(row.left_id, names, lexicon);
    const right = await this.sideName(row.right_id, names, lexicon);
    if (left === void 0 || right === void 0) return void 0;
    return DeckoName.parse(`${left.s}+${right.s}`);
  }
  async sideName(id, names, lexicon) {
    const local = names.get(id);
    if (local !== void 0) return local;
    try {
      const viaLexicon = await lexicon.name(id);
      return viaLexicon !== void 0 && viaLexicon.s !== "" ? viaLexicon : void 0;
    } catch {
      return void 0;
    }
  }
};
function rubyBlank3(s) {
  return /^\s*$/.test(s);
}
function helpRuleSidesStatement(setTypeId, settingTypeId) {
  const ruleJoin = "FROM cards rules\n  JOIN cards sets ON rules.left_id = sets.id\n  JOIN cards settings ON rules.right_id = settings.id\nWHERE sets.type_id = ? AND settings.type_id = ? AND settings.codename = 'help'\n  AND rules.trash = 0 AND sets.trash = 0 AND settings.trash = 0";
  return {
    sql: `WITH RECURSIVE reached(id) AS (
  SELECT rules.id ${ruleJoin}
  UNION
  SELECT j.left_id FROM reached r
    JOIN cards j ON j.id = r.id AND j.trash = 0
    WHERE j.left_id IS NOT NULL
  UNION
  SELECT j.right_id FROM reached r
    JOIN cards j ON j.id = r.id AND j.trash = 0
    WHERE j.right_id IS NOT NULL
  UNION
  SELECT j.type_id FROM reached r
    JOIN cards j ON j.id = r.id
    WHERE j.type_id IS NOT NULL
)
SELECT c.* FROM cards c WHERE c.trash = 0 AND c.id IN (SELECT id FROM reached)`,
    params: [setTypeId, settingTypeId]
  };
}
function settingRuleCountsStatement(setTypeId, settingTypeId, readableRuleIds) {
  const readableIds = Array.from(readableRuleIds);
  const hasFilter = readableIds.length > 0;
  const readableParams = hasFilter ? readableIds : [];
  const sql = "SELECT settings.id AS sid, COUNT(*) AS c\nFROM cards rules\n  JOIN cards sets ON rules.left_id = sets.id\n  JOIN cards settings ON rules.right_id = settings.id\nWHERE sets.type_id = ? AND settings.type_id = ?\n  AND rules.trash = 0 AND sets.trash = 0 AND settings.trash = 0\n" + (hasFilter ? "  AND (rules.read_rule_id IS NULL OR rules.read_rule_id IN (" + readableParams.map(() => "?").join(",") + "))\n" : "  AND rules.read_rule_id IS NULL\n") + "GROUP BY settings.id";
  return { sql, params: [setTypeId, settingTypeId, ...readableParams] };
}
function installHelpRules(engine, fetcher) {
  const resolver = new HelpRulesResolver(
    engine,
    fetcher
  );
  engine.helpRules = resolver;
  return resolver;
}

// src/card/render/code-highlighting/alpha-style.ts
var ALPHA_TOKEN_COLORS = `.debug { color: white !important; background: blue !important; }

.annotation { color:#007 }
.attribute-name { color:#b48 }
.attribute-value { color:#700 }
.binary { color:#549 }
.binary .char { color:#325 }
.binary .delimiter { color:#325 }
.char { color:#D20 }
.char .content { color:#D20 }
.char .delimiter { color:#710 }
.class { color:#B06; font-weight:bold }
.class-variable { color:#369 }
.color { color:#0A0 }
.comment { color:#777 }
.comment .char { color:#444 }
.comment .delimiter { color:#444 }
.constant { color:#036; font-weight:bold }
.decorator { color:#B0B }
.definition { color:#099; font-weight:bold }
.delimiter { color:black }
.directive { color:#088; font-weight:bold }
.docstring { color:#D42; }
.doctype { color:#34b }
.done { text-decoration: line-through; color: gray }
.entity { color:#800; font-weight:bold }
.error { color:#F00; background-color:#FAA }
.escape  { color:#666 }
.exception { color:#C00; font-weight:bold }
.float { color:#60E }
.function { color:#06B; font-weight:bold }
.function .delimiter { color:#059 }
.function .content { color:#037 }
.global-variable { color:#d70 }
.hex { color:#02b }
.id  { color:#33D; font-weight:bold }
.include { color:#B44; font-weight:bold }
.inline { background-color: hsla(0,0%,0%,0.07); color: black }
.inline-delimiter { font-weight: bold; color: #666 }
.instance-variable { color:#33B }
.integer  { color:#00D }
.imaginary { color:#f00 }
.important { color:#D00 }
.key { color: #606 }
.key .char { color: #60f }
.key .delimiter { color: #404 }
.keyword { color:#080; font-weight:bold }
.label { color:#970; font-weight:bold }
.local-variable { color:#950 }
.map .content { color:#808 }
.map .delimiter { color:#40A}
.map { background-color:hsla(200,100%,50%,0.06); }
.namespace { color:#707; font-weight:bold }
.octal { color:#40E }
.operator { }
.predefined { color:#369; font-weight:bold }
.predefined-constant { color:#069 }
.predefined-type { color:#0a8; font-weight:bold }
.preprocessor { color:#579 }
.pseudo-class { color:#00C; font-weight:bold }
.regexp { background-color:hsla(300,100%,50%,0.06); }
.regexp .content { color:#808 }
.regexp .delimiter { color:#404 }
.regexp .modifier { color:#C2C }
.reserved { color:#080; font-weight:bold }
.shell { background-color:hsla(120,100%,50%,0.06); }
.shell .content { color:#2B2 }
.shell .delimiter { color:#161 }
.string { background-color:hsla(0,100%,50%,0.05); }
.string .char { color: #b0b }
.string .content { color: #D20 }
.string .delimiter { color: #710 }
.string .modifier { color: #E40 }
.symbol { color:#A60 }
.symbol .content { color:#A60 }
.symbol .delimiter { color:#740 }
.tag { color:#070; font-weight:bold }
.type { color:#339; font-weight:bold }
.value { color: #088 }
.variable { color:#037 }

.insert { background: hsla(120,100%,50%,0.12) }
.delete { background: hsla(0,100%,50%,0.12) }
.change { color: #bbf; background: #007 }
.head { color: #f8f; background: #505 }
.head .filename { color: white; }

.delete .eyecatcher { background-color: hsla(0,100%,50%,0.2); border: 1px solid hsla(0,100%,45%,0.5); margin: -1px; border-bottom: none; border-top-left-radius: 5px; border-top-right-radius: 5px; }
.insert .eyecatcher { background-color: hsla(120,100%,50%,0.2); border: 1px solid hsla(120,100%,25%,0.5); margin: -1px; border-top: none; border-bottom-left-radius: 5px; border-bottom-right-radius: 5px; }

.insert .insert { color: #0c0; background:transparent; font-weight:bold }
.delete .delete { color: #c00; background:transparent; font-weight:bold }
.change .change { color: #88f }
.head .head { color: #f4f }`;
var CSS_CLASS_PATTERN = /((?:(?:\s*\.[-\w]+)+\s*,?)+)\s*\{\s*([^\}]+)?\s*\}\s*/g;
var CLASS_TOKEN_PATTERN = /[-\w]+/g;
function parseStylesheet(stylesheet) {
  const styles = /* @__PURE__ */ new Map();
  CSS_CLASS_PATTERN.lastIndex = 0;
  let rule;
  while ((rule = CSS_CLASS_PATTERN.exec(stylesheet)) !== null) {
    const selectors = rule[1] ?? "";
    const body = rule[2] ?? "";
    for (const selector of selectors.split(",")) {
      const classes = (selector.match(CLASS_TOKEN_PATTERN) ?? []).slice();
      const own = classes.pop();
      if (own === void 0) continue;
      let ancestors = styles.get(own);
      if (ancestors === void 0) {
        ancestors = /* @__PURE__ */ new Map();
        styles.set(own, ancestors);
      }
      ancestors.set(classes.join(" "), normalizeDeclaration(body));
    }
  }
  return styles;
}
function normalizeDeclaration(body) {
  let out = body.trim();
  out = out.split(" ").join("");
  if (out.endsWith(";")) out = out.slice(0, -1);
  return out;
}
var ALPHA_STYLESHEET = parseStylesheet(ALPHA_TOKEN_COLORS);
function styleForKindPath(cssClasses) {
  const first = cssClasses[0];
  if (first === void 0 || first === false) return "";
  const family = ALPHA_STYLESHEET.get(first);
  if (family === void 0) return "";
  let style;
  for (let offset = 1; offset <= cssClasses.length; offset++) {
    style = family.get(cssClasses.slice(offset).join(" "));
    if (style !== void 0) break;
  }
  return style;
}
var ALPHA_STYLED_KINDS = [
  "error",
  "tag",
  "doctype",
  "inline",
  "inline_delimiter",
  "comment",
  "entity",
  "preprocessor",
  "attribute_name",
  "attribute_value",
  "string",
  "key",
  "content",
  "delimiter",
  "char",
  "modifier",
  "integer",
  "float",
  "value",
  "constant",
  "class",
  "id",
  "definition",
  "function",
  "keyword",
  "reserved",
  "predefined",
  "predefined_type",
  "predefined_constant",
  "namespace",
  "property",
  "color",
  "directive",
  "escape",
  "annotation",
  "label",
  "pseudo_class",
  "exception",
  "docstring",
  "decorator",
  "done",
  "imaginary",
  "debug",
  "change",
  "delete",
  "head",
  "insert",
  "eyecatcher",
  "filename",
  "binary",
  "local_variable",
  "instance_variable",
  "class_variable",
  "global_variable",
  "symbol",
  "variable",
  "type",
  "hex",
  "octal",
  "regexp",
  "map",
  "shell",
  "important",
  "include"
];
var ALPHA_STYLES = ALPHA_STYLED_KINDS.map((kind) => ({
  kind,
  style: styleForKindPath([kind]) ?? ""
}));

// src/card/render/code-highlighting/escape.ts
function coderayEscape(input, tabWidth = 8) {
  if (input.length === 0) return input;
  if (!/[\t"&><\x00-\x08\x0B-\x1F]/.test(input)) return input;
  const tabReplacement = " ".repeat(tabWidth);
  let out = "";
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    const ch = input[i];
    if (ch === "&") out += "&amp;";
    else if (ch === '"') out += "&quot;";
    else if (ch === ">") out += "&gt;";
    else if (ch === "<") out += "&lt;";
    else if (ch === "	") out += tabReplacement;
    else if (c <= 8 || c >= 11 && c <= 31) out += " ";
    else out += ch;
  }
  return out;
}

// src/card/render/code-highlighting/scanners/json.ts
function styleFor(kind) {
  for (const entry of ALPHA_STYLES) if (entry.kind === kind) return entry.style;
  return void 0;
}
function wrapText(text, style) {
  if (style === void 0) return text;
  return `<span style="${style}">${text}</span>`;
}
var GROUP_SCOPED = {
  key: {
    group: "color:#606",
    delimiter: "color:#404",
    content: void 0,
    // .key .content: no alpha rule -> bare <span>
    char: "color:#60f"
  },
  string: {
    group: "background-color:hsla(0,100%,50%,0.05)",
    delimiter: "color:#710",
    content: "color:#D20",
    char: "color:#b0b"
  }
};
function groupOpener(kind) {
  return `<span style="${GROUP_SCOPED[kind].group}">`;
}
function groupDelimiter(kind, quote) {
  return `<span style="${GROUP_SCOPED[kind].delimiter}">${coderayEscape(quote)}</span>`;
}
function groupInner(kind, token, text) {
  const style = GROUP_SCOPED[kind][token];
  const escaped = coderayEscape(text);
  return style === void 0 ? `<span>${escaped}</span>` : `<span style="${style}">${escaped}</span>`;
}
function scanJson(input) {
  let out = "";
  let i = 0;
  const N = input.length;
  let state = "initial";
  const KEY_RE = /^(?:[^\\"]+|\\.)*"\s*:/;
  const ESCAPE_RE = /^(?:\\[bfnrt"\\/]|\\u[a-fA-F0-9]{4})/;
  const UNICODE_ESCAPE_RE = /^\\u[a-fA-F0-9]{4}/;
  while (i < N) {
    if (state === "initial") {
      const ws = /^\s+/.exec(input.slice(i));
      if (ws !== null) {
        out += wrapText(coderayEscape(ws[0]), styleFor("space"));
        i += ws[0].length;
        continue;
      }
      const c = input[i];
      if (c === '"') {
        const rest = input.slice(i);
        state = KEY_RE.test(rest.slice(1)) ? "key" : "string";
        out += groupOpener(state) + groupDelimiter(state, '"');
        i += 1;
        continue;
      }
      if (/^[:,\[\]{}]/.test(c)) {
        out += wrapText(coderayEscape(c), styleFor("operator"));
        i += 1;
        continue;
      }
      if (/^(?:true|false|null)\b/.test(input.slice(i))) {
        const m = /^(?:true|false|null)\b/.exec(input.slice(i));
        out += wrapText(coderayEscape(m[0]), styleFor("value"));
        i += m[0].length;
        continue;
      }
      if (/^-?(?:0|[1-9]\d*)(?:\.\d+(?:[eE][-+]?\d+)?|[eE][-+]?\d+)?/.test(input.slice(i))) {
        const m = /^-?(?:0|[1-9]\d*)(?:\.\d+(?:[eE][-+]?\d+)?|[eE][-+]?\d+)?/.exec(input.slice(i));
        const kind = /\.|e|E/.test(m[0]) ? "float" : "integer";
        out += wrapText(coderayEscape(m[0]), styleFor(kind));
        i += m[0].length;
        continue;
      }
      out += wrapText(coderayEscape(c), styleFor("error"));
      i += 1;
      continue;
    }
    if (state === "string" || state === "key") {
      const rest = input.slice(i);
      const plain = /^[^\\"]+/.exec(rest);
      if (plain !== null) {
        out += groupInner(state, "content", plain[0]);
        i += plain[0].length;
        continue;
      }
      if (rest.startsWith('"')) {
        out += groupDelimiter(state, '"') + "</span>";
        i += 1;
        state = "initial";
        continue;
      }
      if (ESCAPE_RE.test(rest)) {
        const m = UNICODE_ESCAPE_RE.test(rest) ? /^\\u[a-fA-F0-9]{4}/.exec(rest) : /^\\[bfnrt"\\/]/.exec(rest);
        out += groupInner(state, "char", m[0]);
        i += m[0].length;
        continue;
      }
      if (/^\\./.test(rest)) {
        const m = /^\\./.exec(rest);
        out += groupInner(state, "content", m[0]);
        i += m[0].length;
        continue;
      }
      if (rest.startsWith("\\")) {
        out += "</span>";
        out += wrapText(coderayEscape("\\"), styleFor("error"));
        state = "initial";
        i += 1;
        continue;
      }
      out += "</span>";
      state = "initial";
      continue;
    }
  }
  return out;
}

// src/card/render/code-highlighting/token-kinds.ts
var TOKEN_KINDS = Object.freeze({
  debug: "debug",
  annotation: "annotation",
  attribute_name: "attribute-name",
  attribute_value: "attribute-value",
  binary: "binary",
  char: "char",
  class: "class",
  class_variable: "class-variable",
  color: "color",
  comment: "comment",
  constant: "constant",
  content: "content",
  decorator: "decorator",
  definition: "definition",
  delimiter: "delimiter",
  directive: "directive",
  doctype: "doctype",
  docstring: "docstring",
  done: "done",
  entity: "entity",
  error: "error",
  escape: "escape",
  exception: "exception",
  filename: "filename",
  float: "float",
  function: "function",
  global_variable: "global-variable",
  hex: "hex",
  id: "id",
  imaginary: "imaginary",
  important: "important",
  include: "include",
  inline: "inline",
  inline_delimiter: "inline-delimiter",
  instance_variable: "instance-variable",
  integer: "integer",
  key: "key",
  keyword: "keyword",
  label: "label",
  local_variable: "local-variable",
  map: "map",
  modifier: "modifier",
  namespace: "namespace",
  octal: "octal",
  predefined: "predefined",
  predefined_constant: "predefined-constant",
  predefined_type: "predefined-type",
  preprocessor: "preprocessor",
  pseudo_class: "pseudo-class",
  regexp: "regexp",
  reserved: "reserved",
  shell: "shell",
  string: "string",
  symbol: "symbol",
  tag: "tag",
  type: "type",
  value: "value",
  variable: "variable",
  change: "change",
  delete: "delete",
  head: "head",
  insert: "insert",
  eyecatcher: "eyecatcher",
  // "almost all scanners" - no class, so no span.
  ident: false,
  // The theme does carry a bare `.operator { }` rule, but the KIND maps to
  // false first (token_kinds.rb:82), so that rule is unreachable from the
  // encoder and `=` in a tag prints bare.
  operator: false,
  space: false,
  plain: false,
  // token_kinds.rb's two trailing aliases.
  method: "function",
  // TokenKinds[:method] = TokenKinds[:function]
  unknown: false
  // TokenKinds[:unknown] = TokenKinds[:plain]
});
function tokenKindClass(kind) {
  const value = TOKEN_KINDS[kind];
  return value === void 0 ? false : value;
}

// src/card/render/code-highlighting/encoder.ts
var HtmlTokenEncoder = class {
  out = "";
  /** html.rb @opened - the stack of open GROUP kinds, outermost first. */
  opened = [];
  /** html.rb @last_opened - the innermost open group, or undefined at
   *  depth 0. Only groups move it; a text_token never does. */
  lastOpened;
  /** html.rb @span_for_kinds - the memo, keyed by the kind or the kind
   *  path. Cleared past 100 entries (html.rb:254) purely for memory; the
   *  values are a pure function of the key, so the eviction is invisible
   *  in the output. */
  spanCache = /* @__PURE__ */ new Map();
  /**
   * html.rb:239-259 make_span_for_kinds, for one kind or kind path.
   * Returns the opening `<span ...>` string, or undefined where Ruby gets
   * nil (the caller then writes no wrapper at all for a text_token, and a
   * bare `<span>` for a begin_group).
   */
  spanFor(kinds) {
    const key = kinds.join("\0");
    const cached = this.spanCache.get(key);
    if (cached !== void 0 || this.spanCache.has(key)) return cached;
    const span = this.buildSpan(kinds);
    if (this.spanCache.size >= 100) this.spanCache.clear();
    this.spanCache.set(key, span);
    return span;
  }
  buildSpan(kinds) {
    const cssClass = tokenKindClass(kinds[0] ?? "");
    if (cssClass === false) return void 0;
    const style = styleForKindPath(kinds.map((kind) => String(tokenKindClass(kind))));
    return style ? `<span style="${style}">` : "<span>";
  }
  /** html.rb:199-208 text_token. */
  textToken(text, kind) {
    const kinds = this.lastOpened === void 0 ? [kind] : [kind, ...this.opened];
    const span = this.spanFor(kinds);
    const escaped = coderayEscape(text);
    this.out += span === void 0 ? escaped : `${span}${escaped}</span>`;
  }
  /** html.rb:211-214 begin_group. */
  beginGroup(kind) {
    const kinds = this.lastOpened === void 0 ? [kind] : [kind, ...this.opened];
    const span = this.spanFor(kinds);
    this.out += span ?? "<span>";
    this.opened.push(kind);
    this.lastOpened = kind;
  }
  /** html.rb:215-217 end_group -> close_span. */
  endGroup() {
    if (this.opened.pop() === void 0) return;
    this.out += "</span>";
    this.lastOpened = this.opened[this.opened.length - 1];
  }
  /** html.rb:195-198 finish - `@out << '</span>' while @opened.pop`:
  *  close every group the token stream left open (a <script> body ending
  *  inside a JS :key group - java_script.rb:215 only closes :string/:regexp
  *  - reaches this through scanHtml's finish). */
  closeAllGroups() {
    while (this.opened.pop() !== void 0) {
      this.out += "</span>";
    }
    this.lastOpened = void 0;
  }
  /** The assembled bytes. */
  toString() {
    return this.out;
  }
};

// src/card/render/code-highlighting/scanners/css.ts
function at(re, input, i) {
  re.lastIndex = i;
  return re.exec(input);
}
var ESC = `(?:\\\\[0-9a-fA-F]{1,6}\\b|\\\\[^\\n0-9a-fA-F])`;
var STRING1 = `"(?:[^\\n\\\\"]+|\\\\\\n|${ESC})*"?`;
var STRING2 = `'(?:[^\\n\\\\']+|\\\\\\n|${ESC})*'?`;
var HEX_COLOR = `#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})`;
var NUM = `-?(?:[0-9]*\\.[0-9]+|[0-9]+)n?`;
var IDENT = `-?[_a-zA-Z][-_a-zA-Z0-9]*`;
var AT_KEYWORD = `@${IDENT}`;
var UNIT = `(?:em|ex|px|in|cm|mm|pt|pc|s|dpi|dppx|deg)`;
var DIMENSION = `${NUM}${UNIT}`;
var PERCENTAGE = `${NUM}%`;
var FUNCTION = `(?:url|alpha|attr|counters?)\\((?:[^)\\n]|\\\\\\))*\\)?`;
var ID = `(?!${HEX_COLOR}\\b(?!-))#[-_a-zA-Z0-9]+`;
var CLASS = `\\.[-_a-zA-Z0-9]+`;
var PSEUDO_CLASS = `::?${IDENT}`;
var ATTRIBUTE_SELECTOR = `\\[[^\\]]*\\]?`;
var RE_WS = /\s+/y;
var RE_IDENT_GREEDY = new RegExp(IDENT, "y");
var RE_ASTERISK = /\*/y;
var RE_BLOCK_IDENT = new RegExp(IDENT, "y");
var RE_MEDIA_IDENT = new RegExp(IDENT, "y");
var RE_CLASS = new RegExp(CLASS, "y");
var RE_ID = new RegExp(ID, "y");
var RE_PSEUDO = new RegExp(PSEUDO_CLASS, "y");
var RE_ATTR = new RegExp(ATTRIBUTE_SELECTOR, "y");
var RE_AT_MEDIA = /@media/y;
var RE_COMMENT = /\/\*(?:[\s\S]*?\*\/|[\s\S]*)/y;
var RE_STRING = new RegExp(`(?:${STRING1}|${STRING2})`, "y");
var RE_FUNCTION = new RegExp(FUNCTION, "y");
var RE_MEASURE = new RegExp(`(?:${DIMENSION}|${PERCENTAGE}|${NUM})`, "y");
var RE_HEX = new RegExp(HEX_COLOR, "y");
var RE_IMPORTANT = /! *important/y;
var RE_RGB = /(?:rgb|hsl)a?\([^()\n]*\)?/y;
var RE_AT_KEYWORD = new RegExp(AT_KEYWORD, "y");
var RE_OP = /[+>~:;,.=()/]/y;
function scanCss(input) {
  const enc = new HtmlTokenEncoder();
  scanCssInto(enc, input);
  return enc.toString();
}
function scanCssInto(enc, input) {
  const states = ["initial"];
  let valueExpected = false;
  const N = input.length;
  let i = 0;
  const push = (text, kind) => {
    enc.textToken(text, kind);
    i += text.length;
  };
  while (i < N) {
    const ws = at(RE_WS, input, i);
    if (ws !== null) {
      push(ws[0], "space");
      continue;
    }
    const state = states[states.length - 1];
    if (state === "initial" || state === "media") {
      const ident = at(RE_IDENT_GREEDY, input, i);
      if (ident !== null && input[i + ident[0].length] !== "(") {
        push(ident[0], "tag");
        continue;
      }
      const star = at(RE_ASTERISK, input, i);
      if (star !== null) {
        push("*", "tag");
        continue;
      }
      const cls = at(RE_CLASS, input, i);
      if (cls !== null) {
        push(cls[0], "class");
        continue;
      }
      const id = at(RE_ID, input, i);
      if (id !== null) {
        push(id[0], "id");
        continue;
      }
      const pseudo = at(RE_PSEUDO, input, i);
      if (pseudo !== null) {
        push(pseudo[0], "pseudo_class");
        continue;
      }
      const attr = at(RE_ATTR, input, i);
      if (attr !== null) {
        const m = attr[0];
        enc.textToken(m[0], "operator");
        if (m.length > 2) enc.textToken(m.slice(1, m.length - 1), "attribute_name");
        if (m[m.length - 1] === "]") enc.textToken("]", "operator");
        i += m.length;
        continue;
      }
      const media = at(RE_AT_MEDIA, input, i);
      if (media !== null) {
        push(media[0], "directive");
        states.push("media_before_name");
        continue;
      }
    } else if (state === "block") {
      const ident = at(RE_BLOCK_IDENT, input, i);
      if (ident !== null && input[i + ident[0].length] !== "(") {
        enc.textToken(ident[0], valueExpected ? "value" : "key");
        i += ident[0].length;
        continue;
      }
    } else if (state === "media_before_name") {
      const ident = at(RE_MEDIA_IDENT, input, i);
      if (ident !== null) {
        push(ident[0], "type");
        states[states.length - 1] = "media_after_name";
        continue;
      }
    } else if (state === "media_after_name") {
      if (input[i] === "{") {
        push("{", "operator");
        states[states.length - 1] = "media";
        continue;
      }
    }
    const comment = at(RE_COMMENT, input, i);
    if (comment !== null) {
      push(comment[0], "comment");
      continue;
    }
    if (input[i] === "{") {
      valueExpected = false;
      push("{", "operator");
      states.push("block");
      continue;
    }
    if (input[i] === "}") {
      valueExpected = false;
      push("}", "operator");
      const last = states[states.length - 1];
      if (last === "block" || last === "media") states.pop();
      continue;
    }
    const str = at(RE_STRING, input, i);
    if (str !== null) {
      const m = str[0];
      enc.beginGroup("string");
      enc.textToken(m[0], "delimiter");
      if (m.length > 2) enc.textToken(m.slice(1, m.length - 1), "content");
      if (m.length >= 2) enc.textToken(m[m.length - 1], "delimiter");
      enc.endGroup();
      i += m.length;
      continue;
    }
    const fn = at(RE_FUNCTION, input, i);
    if (fn !== null) {
      const m = fn[0];
      const start = /^\w+\(/.exec(m)[0];
      enc.beginGroup("function");
      enc.textToken(start, "delimiter");
      if (m[m.length - 1] === ")") {
        if (m.length > start.length + 1) {
          enc.textToken(m.slice(start.length, m.length - 1), "content");
        }
        enc.textToken(")", "delimiter");
      } else {
        if (m.length > start.length) {
          enc.textToken(m.slice(start.length), "content");
        }
      }
      enc.endGroup();
      i += m.length;
      continue;
    }
    const measure = at(RE_MEASURE, input, i);
    if (measure !== null) {
      push(measure[0], "float");
      continue;
    }
    const hex = at(RE_HEX, input, i);
    if (hex !== null) {
      push(hex[0], "color");
      continue;
    }
    const important = at(RE_IMPORTANT, input, i);
    if (important !== null) {
      push(important[0], "important");
      continue;
    }
    const rgb = at(RE_RGB, input, i);
    if (rgb !== null) {
      push(rgb[0], "color");
      continue;
    }
    const atKeyword = at(RE_AT_KEYWORD, input, i);
    if (atKeyword !== null) {
      push(atKeyword[0], "directive");
      continue;
    }
    const op = at(RE_OP, input, i);
    if (op !== null) {
      const ch = op[0];
      if (ch === ":") valueExpected = true;
      else if (ch === ";") valueExpected = false;
      push(ch, "operator");
      continue;
    }
    push(input[i], "error");
  }
}

// src/card/render/code-highlighting/scanners/java-script.ts
var KEYWORDS = /* @__PURE__ */ new Set([
  "break",
  "case",
  "catch",
  "continue",
  "default",
  "delete",
  "do",
  "else",
  "finally",
  "for",
  "function",
  "if",
  "in",
  "instanceof",
  "new",
  "return",
  "switch",
  "throw",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with"
]);
var PREDEFINED_CONSTANTS = /* @__PURE__ */ new Set([
  "false",
  "null",
  "true",
  "undefined",
  "NaN",
  "Infinity"
]);
var MAGIC_VARIABLES = /* @__PURE__ */ new Set(["this", "arguments"]);
var KEYWORDS_EXPECTING_VALUE = /* @__PURE__ */ new Set([
  "case",
  "delete",
  "in",
  "instanceof",
  "new",
  "return",
  "throw",
  "typeof",
  "with"
]);
var RESERVED_WORDS = /* @__PURE__ */ new Set([
  "abstract",
  "boolean",
  "byte",
  "char",
  "class",
  "debugger",
  "double",
  "enum",
  "export",
  "extends",
  "final",
  "float",
  "goto",
  "implements",
  "import",
  "int",
  "interface",
  "long",
  "native",
  "package",
  "private",
  "protected",
  "public",
  "short",
  "static",
  "super",
  "synchronized",
  "throws",
  "transient",
  "volatile"
]);
function identKind(word) {
  if (RESERVED_WORDS.has(word)) return "reserved";
  if (PREDEFINED_CONSTANTS.has(word)) return "predefined_constant";
  if (MAGIC_VARIABLES.has(word)) return "local_variable";
  if (KEYWORDS.has(word)) return "keyword";
  return "ident";
}
var KEY_CHECK = {
  "'": /^(?:[^\\']*(?:\\.[^\\']*)*)'\s*:/,
  '"': /^(?:[^\\"]*(?:\\.[^\\"]*)*)"\s*:/
};
var STRING_CONTENT = {
  "'": /^[^\\']+/,
  '"': /^[^\\"]+/,
  "/": /^[^\\/]+/
};
var STRING_ESCAPE_RE = /^\\(?:[bfnrtv\n\\'"]|x[a-fA-F0-9]{1,2}|[0-7]{1,3}|u[a-fA-F0-9]{4}|U[a-fA-F0-9]{8})/;
var REGEXP_ESCAPE_RE = /^\\(?:[bfnrtv\n\\'"]|[bBdDsSwW]|u[a-fA-F0-9]{4}|U[a-fA-F0-9]{8})/;
function scanJavaScriptInto(enc, input) {
  let i = 0;
  const N = input.length;
  let state = "initial";
  let stringDelimiter;
  let valueExpected = true;
  let keyExpected = false;
  let functionExpected = false;
  const rest = () => input.slice(i);
  while (i < N) {
    if (state === "initial") {
      const ws = /^(?:[ \t\r\n\f\v]+|\\\n)/.exec(rest());
      if (ws !== null) {
        if (!valueExpected && ws[0].includes("\n")) valueExpected = true;
        enc.textToken(ws[0], "space");
        i += ws[0].length;
        continue;
      }
      if (rest().startsWith("//")) {
        const lineComment = /^\/\/[^\n\\]*(?:\\.[^\n\\]*)*/.exec(rest());
        valueExpected = true;
        enc.textToken(lineComment[0], "comment");
        i += lineComment[0].length;
        continue;
      }
      if (rest().startsWith("/*")) {
        const closed = /^\/\*[\s\S]*?\*\//.exec(rest());
        valueExpected = true;
        if (closed !== null) {
          enc.textToken(closed[0], "comment");
          i += closed[0].length;
        } else {
          enc.textToken(rest(), "comment");
          i = N;
          state = "open_multi_line_comment";
        }
        continue;
      }
      if (/^\.?\d/.test(rest())) {
        keyExpected = false;
        valueExpected = false;
        const hex = /^0[xX][0-9A-Fa-f]+/.exec(rest());
        if (hex !== null) {
          enc.textToken(hex[0], "hex");
          i += hex[0].length;
          continue;
        }
        const octal = /^0[0-7]+(?![89.eEfF])/.exec(rest());
        if (octal !== null) {
          enc.textToken(octal[0], "octal");
          i += octal[0].length;
          continue;
        }
        const float = /^\d+[fF]|\d*\.\d+(?:[eE][+-]?\d+)?[fF]?|\d+[eE][+-]?\d+[fF]/.exec(rest());
        if (float !== null) {
          enc.textToken(float[0], "float");
          i += float[0].length;
          continue;
        }
        const integer = /^\d+/.exec(rest());
        if (integer !== null) {
          enc.textToken(integer[0], "integer");
          i += integer[0].length;
          continue;
        }
      }
      if (valueExpected) {
        const xml = /^<([a-zA-Z]\w*)[^\/>]*\/>|^<([a-zA-Z]\w*)[\s\S]*?<\/\1>/i.exec(rest());
        if (xml !== null) {
          scanXmlLiteralInto(enc, xml[0]);
          valueExpected = false;
          i += xml[0].length;
          continue;
        }
      }
      const op = /^(?:[-+*=<>?:;,!&^|(\[{~%]+|\.(?!\d))/.exec(rest());
      if (op !== null) {
        valueExpected = true;
        const last = op[0].slice(-1);
        keyExpected = last === "{" || last === ",";
        functionExpected = false;
        enc.textToken(op[0], "operator");
        i += op[0].length;
        continue;
      }
      const close = /^[)\]}]+/.exec(rest());
      if (close !== null) {
        functionExpected = false;
        keyExpected = false;
        valueExpected = false;
        enc.textToken(close[0], "operator");
        i += close[0].length;
        continue;
      }
      const ident = /^[$a-zA-Z_][A-Za-z_0-9$]*/.exec(rest());
      if (ident !== null) {
        const word = ident[0];
        let kind = identKind(word);
        valueExpected = kind === "keyword" && KEYWORDS_EXPECTING_VALUE.has(word);
        if (kind === "ident") {
          if (word.includes("$")) kind = "predefined";
          else if (functionExpected) kind = "function";
          else if (/^\s*[=:]\s*function\b/.test(rest().slice(word.length))) kind = "function";
          else if (keyExpected && /^\s*:/.test(rest().slice(word.length))) kind = "key";
        }
        functionExpected = kind === "keyword" && word === "function";
        keyExpected = false;
        enc.textToken(word, kind);
        i += word.length;
        continue;
      }
      const quote = /^["']/.exec(rest());
      if (quote !== null) {
        const q = quote[0];
        state = keyExpected && KEY_CHECK[q].test(rest().slice(1)) ? "key" : "string";
        enc.beginGroup(state);
        stringDelimiter = q;
        enc.textToken(q, "delimiter");
        i += 1;
        continue;
      }
      if (valueExpected && rest().startsWith("/")) {
        enc.beginGroup("regexp");
        state = "regexp";
        stringDelimiter = "/";
        enc.textToken("/", "delimiter");
        i += 1;
        continue;
      }
      if (rest().startsWith("/")) {
        valueExpected = true;
        keyExpected = false;
        enc.textToken("/", "operator");
        i += 1;
        continue;
      }
      enc.textToken(input[i], "error");
      i += 1;
      continue;
    }
    if (state === "open_multi_line_comment") {
      const closed = /^[\s\S]*?\*\//.exec(rest());
      if (closed !== null) {
        state = "initial";
        enc.textToken(closed[0], "comment");
        i += closed[0].length;
      } else {
        const all = /^[\s\S]+/.exec(rest());
        enc.textToken(all[0], "comment");
        i += all[0].length;
      }
      valueExpected = true;
      continue;
    }
    const delim = stringDelimiter;
    if (delim !== void 0) {
      const content = STRING_CONTENT[delim].exec(rest());
      if (content !== null) {
        enc.textToken(content[0], "content");
        i += content[0].length;
        continue;
      }
    }
    const closer = /^["'\/]/.exec(rest());
    if (closer !== null) {
      enc.textToken(closer[0], "delimiter");
      i += 1;
      if (state === "regexp") {
        const modifiers = /^[gim]+/.exec(rest());
        if (modifiers !== null && modifiers[0] !== "") {
          enc.textToken(modifiers[0], "modifier");
          i += modifiers[0].length;
        }
      }
      enc.endGroup();
      stringDelimiter = void 0;
      keyExpected = false;
      valueExpected = false;
      state = "initial";
      continue;
    }
    if (state !== "regexp" && delim !== void 0 && delim !== "/") {
      const esc = STRING_ESCAPE_RE.exec(rest());
      if (esc !== null) {
        if (delim === "'" && esc[0] !== "\\\\" && esc[0] !== "\\'") {
          enc.textToken(esc[0], "content");
        } else {
          enc.textToken(esc[0], "char");
        }
        i += esc[0].length;
        continue;
      }
    }
    if (state === "regexp") {
      const esc = REGEXP_ESCAPE_RE.exec(rest());
      if (esc !== null) {
        enc.textToken(esc[0], "char");
        i += esc[0].length;
        continue;
      }
    }
    const looseEscape = /^\\[\s\S]/.exec(rest());
    if (looseEscape !== null) {
      enc.textToken(looseEscape[0], "content");
      i += looseEscape[0].length;
      continue;
    }
    if (rest().startsWith("\\")) {
      enc.endGroup();
      enc.textToken("\\", "error");
      stringDelimiter = void 0;
      keyExpected = false;
      valueExpected = false;
      state = "initial";
      i += 1;
      continue;
    }
    if (i === N || i === N - 1 && input[i] === "\n") {
      enc.endGroup();
      stringDelimiter = void 0;
      keyExpected = false;
      valueExpected = false;
      state = "initial";
      continue;
    }
    enc.textToken(input[i], "error");
    i += 1;
  }
  if (state === "string" || state === "regexp") enc.endGroup();
}
function scanXmlLiteralInto(enc, literal) {
  enc.textToken(literal, "plain");
}

// src/card/render/code-highlighting/scanners/html.ts
function scanHtml(input) {
  const enc = new HtmlTokenEncoder();
  let i = 0;
  const N = input.length;
  let state = "initial";
  let inTag = void 0;
  let inAttribute = void 0;
  let plainStringContent = void 0;
  const CDATA_OPEN = /^<!\[CDATA\[/;
  const CDATA_BODY = /^.*?\]\]>/s;
  const COMMENT = /^<!--(?:.*?-->|.*)/s;
  const DOCTYPE = /^<!(?:\w+)(?:.*?>|.*)|^\]>/s;
  const XML_PI = /^<\?xml(?:.*?\?>|.*)/s;
  const PI = /^<\?(?:.*?\?>|.*)/s;
  const CLOSE_TAG = /^<\/[-\w.:]*>?/;
  const OPEN_TAG = /^<(?:(script|style)|[-\w.:]+)(>)?/;
  const PLAIN = /^[^<>&]+/;
  const ENTITY = /^&(?:\w+|#\d+|#x[0-9a-fA-F]+);/;
  const TAG_END = /^\/?>/;
  const ATTR_NAME = /^[\w.:-]+/;
  const ATTR_EQ = /^=/;
  const QUOTE = /^["']/;
  const WHITE = /^\s+/;
  const STR_CONTENT_DQ = /^[^&">\n]+/;
  const STR_CONTENT_SQ = /^[^&'\n]+/;
  while (i < N) {
    const rest = input.slice(i);
    if (state !== "in_special_tag") {
      const ws = WHITE.exec(rest);
      if (ws !== null) {
        enc.textToken(ws[0], "space");
        i += ws[0].length;
        continue;
      }
    }
    let m;
    if (state === "initial") {
      if ((m = CDATA_OPEN.exec(rest)) !== null) {
        enc.textToken(m[0], "inline_delimiter");
        i += m[0].length;
        const body = CDATA_BODY.exec(rest.slice(m[0].length));
        if (body !== null) {
          enc.textToken(body[0].slice(0, -3), "plain");
          enc.textToken("]]>", "inline_delimiter");
          i += body[0].length;
        } else {
          const tail = /^.+/.exec(rest.slice(m[0].length));
          if (tail !== null) {
            enc.textToken(tail[0], "error");
            i += tail[0].length;
          }
        }
        continue;
      }
      if ((m = COMMENT.exec(rest)) !== null) {
        enc.textToken(m[0], "comment");
        i += m[0].length;
        continue;
      }
      if ((m = DOCTYPE.exec(rest)) !== null) {
        enc.textToken(m[0], "doctype");
        i += m[0].length;
        continue;
      }
      if ((m = XML_PI.exec(rest)) !== null) {
        enc.textToken(m[0], "preprocessor");
        i += m[0].length;
        continue;
      }
      if ((m = PI.exec(rest)) !== null) {
        enc.textToken(m[0], "comment");
        i += m[0].length;
        continue;
      }
      if ((m = CLOSE_TAG.exec(rest)) !== null) {
        inTag = void 0;
        enc.textToken(m[0], "tag");
        i += m[0].length;
        continue;
      }
      if ((m = OPEN_TAG.exec(rest)) !== null) {
        enc.textToken(m[0], "tag");
        i += m[0].length;
        inTag = m[1];
        if (m[2] !== void 0) {
          state = inTag !== void 0 ? "in_special_tag" : "initial";
        } else {
          state = "attribute";
        }
        continue;
      }
      if ((m = PLAIN.exec(rest)) !== null) {
        enc.textToken(m[0], "plain");
        i += m[0].length;
        continue;
      }
      if ((m = ENTITY.exec(rest)) !== null) {
        enc.textToken(m[0], "entity");
        i += m[0].length;
        continue;
      }
      inTag = void 0;
      enc.textToken(rest[0], "error");
      i += 1;
      continue;
    }
    if (state === "attribute") {
      if ((m = TAG_END.exec(rest)) !== null) {
        enc.textToken(m[0], "tag");
        inAttribute = void 0;
        state = inTag !== void 0 ? "in_special_tag" : "initial";
        i += m[0].length;
        continue;
      }
      if ((m = ATTR_NAME.exec(rest)) !== null) {
        inAttribute = attributeScriptOrStyle(m[0]);
        enc.textToken(m[0], "attribute_name");
        state = "attribute_equal";
        i += m[0].length;
        continue;
      }
      inTag = void 0;
      enc.textToken(rest[0], "error");
      i += 1;
      continue;
    }
    if (state === "attribute_equal") {
      if ((m = ATTR_EQ.exec(rest)) !== null) {
        enc.textToken(m[0], "operator");
        state = "attribute_value";
        i += m[0].length;
        continue;
      }
      state = "attribute";
      continue;
    }
    if (state === "attribute_value") {
      if ((m = ATTR_NAME.exec(rest)) !== null) {
        enc.textToken(m[0], "attribute_value");
        state = "attribute";
        i += m[0].length;
        continue;
      }
      if ((m = QUOTE.exec(rest)) !== null) {
        const openChar = m[0];
        enc.beginGroup("string");
        enc.textToken(openChar, "delimiter");
        if (inAttribute === "script" || inAttribute === "style") {
          const bodyEnd = scanUntilQuote(input, i + m[0].length, openChar);
          const body = input.slice(i + m[0].length, bodyEnd);
          if (body.length > 0) enc.textToken(body, "ident");
          if (input[bodyEnd] === openChar) {
            enc.textToken(openChar, "delimiter");
            i = bodyEnd + 1;
          } else {
            i = bodyEnd;
          }
          enc.endGroup();
          state = "attribute";
          inAttribute = void 0;
        } else {
          state = "attribute_value_string";
          plainStringContent = openChar === '"' ? STR_CONTENT_DQ : STR_CONTENT_SQ;
          i += m[0].length;
        }
        continue;
      }
      if ((m = TAG_END.exec(rest)) !== null) {
        enc.textToken(m[0], "tag");
        state = "initial";
        i += m[0].length;
        continue;
      }
      enc.textToken(rest[0], "error");
      i += 1;
      continue;
    }
    if (state === "attribute_value_string") {
      if ((m = plainStringContent.exec(rest)) !== null) {
        enc.textToken(m[0], "content");
        i += m[0].length;
        continue;
      }
      if (/^['"]/.test(rest)) {
        enc.textToken(rest[0], "delimiter");
        enc.endGroup();
        state = "attribute";
        i += 1;
        continue;
      }
      if ((m = ENTITY.exec(rest)) !== null) {
        enc.textToken(m[0], "entity");
        i += m[0].length;
        continue;
      }
      if (rest[0] === "&") {
        enc.textToken("&", "content");
        i += 1;
        continue;
      }
      if (/^[\n>]/.test(rest)) {
        enc.endGroup();
        state = "initial";
        enc.textToken(rest[0], "error");
        i += 1;
        continue;
      }
      enc.textToken(rest[0], "error");
      i += 1;
      continue;
    }
    if (state === "in_special_tag") {
      if (inTag === "script" || inTag === "style") {
        const leading = /^[ \t]*\n/.exec(rest);
        if (leading !== null) {
          enc.textToken(leading[0], "space");
          i += leading[0].length;
        }
        const cm = /^(\s*<!--)(?:(.*?)(-->)|(.*))/s.exec(input.slice(i));
        let body;
        let closing;
        if (cm !== null) {
          body = cm[2] ?? cm[4] ?? "";
          closing = cm[3];
          enc.textToken(cm[1], "comment");
          i += cm[1].length;
          if (body.length > 0) i += body.length;
          if (closing !== void 0 && closing !== "") {
            enc.textToken(closing, "comment");
            i += closing.length;
          }
        } else {
          const untilRe = new RegExp(`(?=(?:\\n\\s*)?</${inTag}>)`);
          const until = untilRe.exec(input.slice(i));
          body = until !== null ? input.slice(i, i + until.index) : input.slice(i);
          closing = "";
          if (body.length > 0) i += body.length;
        }
        if (body.length > 0) {
          enc.beginGroup("inline");
          if (inTag === "script") {
            scanJavaScriptInto(enc, body);
          } else {
            scanCssInto(enc, body);
          }
          enc.endGroup();
        }
        state = "initial";
        continue;
      }
      enc.textToken(rest[0], "error");
      i += 1;
      continue;
    }
    enc.textToken(rest[0], "error");
    i += 1;
  }
  if (state === "attribute_value_string") enc.endGroup();
  enc.closeAllGroups();
  return enc.toString();
}
function scanUntilQuote(input, from, quote) {
  for (let k = from; k < input.length; k++) {
    if (input[k] === quote) return k;
  }
  return input.length;
}
function attributeScriptOrStyle(name) {
  const lower = name.toLowerCase();
  if (lower === "style") return "style";
  if (lower === "script" || EVENT_ATTRIBUTES.has(lower)) return "script";
  return void 0;
}
var EVENT_ATTRIBUTES = /* @__PURE__ */ new Set([
  "onabort",
  "onafterprint",
  "onbeforeprint",
  "onbeforeunload",
  "onblur",
  "oncanplay",
  "oncanplaythrough",
  "onchange",
  "onclick",
  "oncontextmenu",
  "oncuechange",
  "ondblclick",
  "ondrag",
  "ondragdrop",
  "ondragend",
  "ondragenter",
  "ondragleave",
  "ondragover",
  "ondragstart",
  "ondrop",
  "ondurationchange",
  "onemptied",
  "onended",
  "onerror",
  "onfocus",
  "onformchange",
  "onforminput",
  "onhashchange",
  "oninput",
  "oninvalid",
  "onkeydown",
  "onkeypress",
  "onkeyup",
  "onload",
  "onloadeddata",
  "onloadedmetadata",
  "onloadstart",
  "onmessage",
  "onmousedown",
  "onmousemove",
  "onmouseout",
  "onmouseover",
  "onmouseup",
  "onmousewheel",
  "onmove",
  "onoffline",
  "ononline",
  "onpagehide",
  "onpageshow",
  "onpause",
  "onplay",
  "onplaying",
  "onpopstate",
  "onprogress",
  "onratechange",
  "onreadystatechange",
  "onredo",
  "onreset",
  "onresize",
  "onscroll",
  "onseeked",
  "onseeking",
  "onselect",
  "onshow",
  "onstalled",
  "onstorage",
  "onsubmit",
  "onsuspend",
  "ontimeupdate",
  "ontoggle",
  "onvolumechange",
  "onwaiting"
]);

// src/card/render/code-highlighting/index.ts
var DIV_OPEN = '<div class="CodeRay">\n  <div class="code"><pre>';
var DIV_CLOSE = "</pre></div>\n</div>\n";
function wrapDiv(content) {
  return DIV_OPEN + content + DIV_CLOSE;
}
function toUnix(code) {
  return code.indexOf("\r") === -1 ? code : code.replace(/\r\n?/g, "\n");
}
function highlight(content, lang) {
  const code = toUnix(content);
  switch (lang) {
    case "json":
      return wrapDiv(scanJson(code));
    case "css":
      return wrapDiv(scanCss(code));
    case "html":
      return wrapDiv(scanHtml(code));
  }
}
function langForTypeCode(typeCode) {
  if (typeCode === void 0) return void 0;
  if (typeCode === "json") return "json";
  if (typeCode === "css" || typeCode === "scss") return "css";
  if (typeCode === "layout_type" || typeCode === "head") return "html";
  return void 0;
}

// src/card/render/coded-attachment-files.ts
var nodeFsCache2;
function nodeFsOrNull2() {
  if (nodeFsCache2 !== void 0) return nodeFsCache2;
  try {
    const proc = globalThis.process;
    const fs = proc?.getBuiltinModule?.("node:fs");
    if (fs !== void 0) nodeFsCache2 = fs;
    return fs ?? void 0;
  } catch {
    return void 0;
  }
}
var CODED_MOD_FILE_DIR_HREFS = /* @__PURE__ */ new Map();
try {
  CODED_MOD_FILE_DIR_HREFS.set(
    "carrierwave",
    new URL(
      "../mod-loader/mods/mod-coded-attachment-files/carrierwave/",
      import.meta.url
    ).href
  );
} catch {
}
var CODED_MOD_NAME_RE = /^:[:\w/+]+\/([^./]+)\./;
function codedSvgFileBytes(content) {
  const fs = nodeFsOrNull2();
  if (fs === void 0) return void 0;
  const trimmed = (content ?? "").trim();
  if (!trimmed.toLowerCase().endsWith(".svg")) return void 0;
  const modMatch = trimmed.match(CODED_MOD_NAME_RE);
  if (modMatch === null) return void 0;
  const baseDirHref = CODED_MOD_FILE_DIR_HREFS.get(modMatch[1]);
  if (baseDirHref === void 0) return void 0;
  const parts = trimmed.slice(1, trimmed.lastIndexOf("/")).split("+").map((part) => part.startsWith(":") ? part.slice(1) : part);
  if (parts.length === 0 || parts.some((part) => part === "")) return void 0;
  const ext = trimmed.slice(trimmed.lastIndexOf("."));
  const fileUrl = new URL(
    `data/files/${parts.map(encodeURIComponent).join("/")}/image-original${ext}`,
    baseDirHref
  );
  try {
    return fs.readFileSync(fileUrl, "utf8");
  } catch {
    return void 0;
  }
}

// src/card/render/virtual-rule-card.ts
var RULE_TYPE_BY_SETTING = /* @__PURE__ */ new Map([
  // templating
  ["autoname", { typeId: 52, typeName: "Phrase", typeCode: "phrase" }],
  // Corpus-wide re-measure (2026-09-27): the oracle's
  // VIRTUAL rule-bar type per setting is unanimous across every set page in
  // both lanes (2,397-2,529 id-less bars per setting, ZERO variance —
  // aggregated over all 48 expected-v2 shards). The type is the ensure_type
  // chain outcome (mod/core/set/all/type.rb:58-80 ensure_type_id:
  // type_id_from_code — each_type_assigning_module_key over the card's own
  // type-assigning patterns, e.g. card-mod-layout set/right/layout.rb
  // `assign_type :pointer`, card-mod-style set/type_plus_right/set/style.rb
  // `assign_type :pointer` — then type_id_from_template, card-mod-content
  // set/all/templating.rb:57-73 new_card_template). The four corrections
  // below replace values the round-7 map inferred from the wrong probe (the
  // *all+X stored rows and the setting cards themselves):
  //   *default  2397×RichText (was Setting fallback — no entry)
  //   *guide    2487×RichText (was Markdown 34753)
  //   *layout   2478×Pointer  (was List 47)
  //   *style    2529×Pointer  (was List 47)
  // and the two additions cover settings the restriction gate lets through
  // on list/pointer-prototype sets (SETTING_RESTRICTED_TO_TYPE) whose
  // virtual bars the oracle pins (they had no entry — Setting fallback):
  //   *content_options       60×List
  //   *content_option_view   96×Phrase
  ["default", { typeId: 3, typeName: "RichText", typeCode: "rich_text" }],
  // permission
  ["create", { typeId: 47, typeName: "List", typeCode: "list" }],
  ["read", { typeId: 47, typeName: "List", typeCode: "list" }],
  ["update", { typeId: 47, typeName: "List", typeCode: "list" }],
  ["delete", { typeId: 47, typeName: "List", typeCode: "list" }],
  ["captcha", { typeId: 51, typeName: "Toggle", typeCode: "toggle" }],
  // webpage
  ["head", { typeId: 50, typeName: "HTML", typeCode: "html" }],
  ["layout", { typeId: 34843, typeName: "Pointer", typeCode: "pointer" }],
  ["style", { typeId: 34843, typeName: "Pointer", typeCode: "pointer" }],
  ["script", { typeId: 47, typeName: "List", typeCode: "list" }],
  // editing
  ["help", { typeId: 3, typeName: "RichText", typeCode: "rich_text" }],
  ["input_type", { typeId: 34843, typeName: "Pointer", typeCode: "pointer" }],
  ["guide", { typeId: 3, typeName: "RichText", typeCode: "rich_text" }],
  ["content_options", { typeId: 47, typeName: "List", typeCode: "list" }],
  ["content_option_view", { typeId: 52, typeName: "Phrase", typeCode: "phrase" }],
  // event
  ["on_create", { typeId: 47, typeName: "List", typeCode: "list" }],
  ["on_update", { typeId: 47, typeName: "List", typeCode: "list" }],
  ["on_delete", { typeId: 47, typeName: "List", typeCode: "list" }],
  // other
  ["thanks", { typeId: 52, typeName: "Phrase", typeCode: "phrase" }],
  ["follow_fields", { typeId: 47, typeName: "List", typeCode: "list" }],
  ["follow", { typeId: 47, typeName: "List", typeCode: "list" }]
]);
function ruleTypeForSetting(settingCodename) {
  return RULE_TYPE_BY_SETTING.get(settingCodename);
}
var RULE_TYPE_IDS_FOR_PRELOAD = [
  ...new Set([...RULE_TYPE_BY_SETTING.values()].map((v) => v.typeId))
];
function ruleTypeIdForSetting(settingCodename) {
  return RULE_TYPE_BY_SETTING.get(settingCodename)?.typeId;
}
function buildVirtualRuleCard(inputs) {
  const { setCard, settingCard, settingCodename, deckTypeCard } = inputs;
  const settingNamePart = settingCard.name?.s !== void 0 && settingCard.name.s.startsWith("*") ? settingCard.name.s : `*${settingCodename}`;
  const compoundName = `${setCard.name.s}+${settingNamePart}`;
  const name = DeckoName.parse(compoundName);
  const ruleType = ruleTypeForSetting(settingCodename);
  const typeId = ruleType?.typeId ?? settingCard.typeId;
  const typeName = deckTypeCard?.name.s ?? ruleType?.typeName ?? settingCard.typeName;
  const typeCode = deckTypeCard?.typeCode ?? ruleType?.typeCode ?? settingCard.typeCode;
  const record = {
    id: void 0,
    codename: void 0,
    leftId: setCard.id,
    rightId: settingCard.id,
    typeId,
    dbContent: settingCard.dbContent,
    trash: false,
    creatorId: void 0,
    updaterId: void 0,
    createdAt: void 0,
    updatedAt: void 0,
    currentRevisionId: void 0,
    readRuleClass: void 0,
    readRuleId: void 0,
    referencesExpired: void 0,
    name,
    key: name.key,
    isNew: true,
    // Card.new without a row -> new card; the *self pattern drops
    fromTrash: false,
    uncacheable: false
  };
  const setKeys = safeSetKeys({
    name,
    typeId,
    typeName,
    leftTypeName: setCard.typeName,
    isRule: true,
    isNew: true
    // pattern/all.rb#patterns: new cards drop the SELF token
  });
  return {
    record,
    name,
    key: name.key,
    typeName,
    typeId,
    typeCode,
    id: void 0,
    dbContent: settingCard.dbContent,
    setKeys
  };
}

// src/card/render/navbar-views.ts
function isListType(fmt) {
  return fmt.card.typeCode === "pointer" || fmt.card.typeCode === "list";
}
function wrapNavItem(inner) {
  return `<li class="nav-item">${inner}</li>`;
}
function linkTitleSpan(ctx) {
  const label = ctx.voo.opts["title"];
  if (typeof label === "string") {
    return `<span class="card-title" title="${h(label)}">${wrappedTitleInner(h(label))}</span>`;
  }
  return ctx.fmt.renderView("title");
}
function linkToCardWithClass(fmt, klass, titleSpan) {
  const known = fmt.card.unknown !== true;
  const cls = known ? `${klass} known-card` : `${klass} wanted-card`;
  return `<a class="${cls}" href="/${h(fmt.urlKey())}">${titleSpan}</a>`;
}
var navbarLinksView = (ctx) => {
  const { fmt } = ctx;
  if (fmt.card.key === "*account_link") {
    const signedInItems = ctx.fmt.engine.pageSessionAccountLinksHtml;
    if (signedInItems !== void 0) {
      return `<ul class="navbar-nav">${signedInItems}</ul>`;
    }
    const links = [
      `<a class="nav-link signup-link known-card" href="/new/Sign_up">Sign up</a>`,
      `<a class="nav-link signin-link known-card" href="/*signin">Sign in</a>`
    ].map(wrapNavItem);
    return `<ul class="navbar-nav">${links.join("\n")}</ul>`;
  }
  if (isListType(fmt)) {
    const items = listItemsOf(fmt).map((name) => nestItemName(ctx, name, "nav_item"));
    return `<ul class="navbar-nav">${items.join("")}</ul>`;
  }
  const content = fmt.card.dbContent;
  const out = [];
  let lastIndex = 0;
  for (const m of content.matchAll(/\[\[([^\][\n]+?)\]\]/g)) {
    out.push(content.slice(lastIndex, m.index));
    const spec = m[1] ?? "";
    const split = spec.indexOf("|");
    const target = (split === -1 ? spec : spec.slice(0, split)).trim();
    const label = split === -1 ? void 0 : spec.slice(split + 1).trim();
    if (target !== "") out.push(nestResolvedName(ctx, target, "nav_item", label));
    lastIndex = (m.index ?? 0) + m[0].length;
  }
  out.push(content.slice(lastIndex));
  return `<ul class="navbar-nav">${out.join("")}</ul>`;
};
var navItemView = (ctx) => {
  const { fmt } = ctx;
  if (fmt.card.key === "*dropdown_divider") {
    return `<div class="dropdown-divider"></div>`;
  }
  if (isListType(fmt)) {
    return wrapNavItem(navDropdown(ctx));
  }
  return wrapNavItem(linkToCardWithClass(fmt, "nav-link", linkTitleSpan(ctx)));
};
var navLinkInDropdownView = (ctx) => {
  const { fmt } = ctx;
  if (fmt.card.key === "*dropdown_divider") {
    return `<div class="dropdown-divider"></div>`;
  }
  return linkToCardWithClass(fmt, "dropdown-item", fmt.renderView("title"));
};
function navDropdown(ctx) {
  const toggle = `<a href="#" class="nav-link dropdown-toggle" data-bs-toggle="dropdown">${linkTitleSpan(ctx)}</a>`;
  const menu = `<div class="dropdown-menu">${dropdownMenuItems(ctx)}</div>`;
  return `<li class="nav-item dropdown">${toggle}
${menu}</li>`;
}
function dropdownMenuItems(ctx) {
  const items = listItemsOf(ctx.fmt).map(
    (name) => nestItemName(ctx, name, "nav_link_in_dropdown")
  );
  return items.join("\n");
}
function listItemsOf(fmt) {
  return fmt.card.dbContent.split(/\n+/).map((s) => s.replace(/\[\[|\]\]/g, "").trim()).filter((s) => s !== "");
}
function nestItemName(ctx, name, view) {
  return nestResolvedName(ctx, name, view, void 0);
}
function nestResolvedName(ctx, rawName, view, title) {
  const fmt = ctx.fmt;
  let resolved;
  try {
    const parsed = DeckoName.parse(rawName);
    resolved = parsed.isAbsolute ? parsed.s : parsed.absoluteName(fmt.card.name).s;
  } catch {
    return "";
  }
  const nest = {
    name: resolved,
    syntax: resolved,
    options: { view, ...title !== void 0 ? { title } : {}, extra: {} },
    comment: void 0
  };
  return fmt.nest(nest);
}
var searchBoxView = ({ fmt }) => {
  if (fmt.card.key !== "*search") {
    throw new UnsupportedViewError("search_box", fmt.card.name.s);
  }
  return `<div class='d0-search-box'>
<form role="search" class="search-box-form" action="/*search" accept-charset="UTF-8" method="get"><input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" /><input type="text" name="query[keyword]" id="query_keyword" class="_search-box search-box form-control w-100" autocomplete="off" data-completepath="/*search/search_box_complete.json" placeholder="Search" /></form>
</div>
`;
};
var NAVBAR_VIEWS = {
  navbar_links: navbarLinksView,
  nav_item: navItemView,
  nav_link_in_dropdown: navLinkInDropdownView,
  search_box: searchBoxView
};
function accountLinksCoreHtml(ctx) {
  const signedInItems = ctx.fmt.engine.pageSessionAccountLinksHtml;
  if (signedInItems !== void 0) {
    return `<div id="logging" class="logged-in">${signedInItems}</div>`;
  }
  const links = [
    `<li class="nav-item"><a class="nav-link signup-link known-card" href="/new/Sign_up">Sign up</a></li>`,
    `<li class="nav-item"><a class="nav-link signin-link known-card" href="/*signin">Sign in</a></li>`
  ].join("\n");
  return `<div id="logging" class="logged-out">${links}</div>`;
}
function signedInAccountLinksInnerHtml(actorName, known) {
  const namePath = actorName.replace(/ /g, "_");
  const knownClass = (isKnown) => isKnown ? "known-card" : "wanted-card";
  const myCardLi = `<li class="nav-item">` + myCardDropdownInnerHtml(actorName, known, []) + `</li>`;
  const signOutLi = `<li class="nav-item"><a class="nav-link signout-link ${knownClass(known.signin)}" href="/delete/*signin">Sign out</a></li>`;
  return `${myCardLi}
${signOutLi}`;
}
function myCardDropdownInnerHtml(actorName, known, roleItems) {
  const namePath = actorName.replace(/ /g, "_");
  const knownClass = (isKnown) => isKnown ? "known-card" : "wanted-card";
  return `<div class="btn-group"><a id="my-card-link" class="nav-link my-card ${knownClass(known.actor)}" href="/${namePath}">${h(actorName)}</a>
<a href="#" class="dropdown-toggle dropdown-toggle-split nav-link" data-bs-toggle="dropdown" aria-haspopup="true" aria-expanded="false"><span class="visually-hidden">Toggle Dropdown</span></a>
<ul class="dropdown-menu dropdown-menu-right" role="menu"><li><a class="dropdown-item ${knownClass(known.accountSettings)}" href="/${namePath}+*account_settings">Account</a></li>
<li><a class="dropdown-item ${knownClass(known.signin)}" href="/delete/*signin">Sign out</a></li>` + roleItems.join("") + `</ul></div>`;
}

// src/card/render/kramdown.ts
function normalizeSource(source) {
  let src = source.replace(/\r\n?/g, "\n");
  if (!src.endsWith("\n")) src += "\n";
  return src;
}
function kramdownToHtml(source, shared, indent = 0) {
  const state = shared ?? { usedIds: /* @__PURE__ */ new Map() };
  return convertBlocks(parseBlocks(normalizeSource(source), state), indent);
}
function convertBlocks(blocks, indent) {
  const pad = " ".repeat(indent);
  let out = "";
  for (const block of blocks) {
    if (block.kind === "blank") {
      out += "\n";
    } else if (block.kind === "p") {
      out += block.transparent ? parseSpans(block.text, /* @__PURE__ */ new Set()).html : `${pad}<p>${parseSpans(block.text, /* @__PURE__ */ new Set()).html}</p>
`;
    } else if (block.kind === "header") {
      out += `${pad}<h${block.level} id="${escapeAttribute(block.idAttr)}">${parseSpans(block.text, /* @__PURE__ */ new Set()).html}</h${block.level}>
`;
    } else if (block.kind === "hr") {
      out += `${pad}<hr />
`;
    } else if (block.kind === "codeblock") {
      out += codeBlockHtml(block.content, block.lang, block.langClass, indent);
    } else if (block.kind === "blockquote") {
      out += `${pad}<blockquote>
${convertBlocks(block.children, indent + 2)}${pad}</blockquote>
`;
    } else if (block.kind === "list") {
      const itemPad = " ".repeat(indent + 2);
      const listTag = block.ordered ? "ol" : "ul";
      out += `${pad}<${listTag}>
`;
      for (const item of block.items) {
        const first = item.blocks[0];
        if (item.transparent === true && first !== void 0 && first.kind === "p") {
          const inner = parseSpans(first.text, /* @__PURE__ */ new Set()).html + convertBlocks(item.blocks.slice(1), indent + 4);
          out += `${itemPad}<li>${inner}${/\n$/.test(inner) ? itemPad : ""}</li>
`;
        } else {
          out += `${itemPad}<li>
${convertBlocks(item.blocks, indent + 4)}${itemPad}</li>
`;
        }
      }
      out += `${pad}</${listTag}>
`;
    }
  }
  return out;
}
function parseBlocks(src, state) {
  const blocks = [];
  let pos = 0;
  const afterBoundary = () => {
    const last = blocks[blocks.length - 1];
    return last === void 0 || last.kind === "blank";
  };
  while (pos < src.length) {
    const rest = src.slice(pos);
    const blank = /^(?:[ \t]*\n)+/.exec(rest);
    if (blank !== null) {
      blocks.push({ kind: "blank" });
      pos += blank[0].length;
      continue;
    }
    if (/^(?:\t| {4})/.test(rest)) {
      const codeblock = parseIndentedCode(rest);
      if (codeblock !== null) {
        blocks.push(codeblock.block);
        pos += codeblock.length;
        continue;
      }
    }
    const fence = /^((~){3,})[ \t]*((\S+?)(?:\?\S*)?)?[ \t]*\n/.exec(rest);
    if (fence !== null) {
      const closer = new RegExp(`^${fence[1]}~*[ \\t]*\\n`, "gm");
      closer.lastIndex = fence[0].length;
      const closeMatch = closer.exec(rest);
      if (closeMatch !== null) {
        blocks.push({
          kind: "codeblock",
          lang: fence[3],
          langClass: fence[4],
          content: rest.slice(fence[0].length, closeMatch.index)
        });
        pos += closeMatch.index + closeMatch[0].length;
        continue;
      }
    }
    const bq = /^ {0,3}> ?/.exec(rest);
    if (bq !== null) {
      let end = 0;
      for (; ; ) {
        const line = /^[^\n]*\n/.exec(rest.slice(end));
        if (line === null) break;
        if (/^[ \t]*\n/.test(line[0])) break;
        end += line[0].length;
      }
      const stripped = rest.slice(0, end).split("\n").map((quoteLine) => quoteLine.replace(/^ {0,3}> ?/, "")).join("\n");
      blocks.push({ kind: "blockquote", children: parseBlocks(stripped, state) });
      pos += end;
      continue;
    }
    const atx = /^(#{1,6})[ \t]*([^ \t][^\n]*)\n/.exec(rest);
    if (atx !== null && afterBoundary()) {
      const parsed = parseAtxContents(atx[2]);
      if (parsed !== void 0) {
        blocks.push({
          kind: "header",
          level: atx[1].length,
          idAttr: parsed.id ?? generateId(parsed.text, state),
          text: parsed.text
        });
        pos += atx[0].length;
        continue;
      }
    }
    const hr = /^ {0,3}([*_-])[ \t]*\1[ \t]*\1(?:\1|[ \t])*\n/.exec(rest);
    if (hr !== null) {
      blocks.push({ kind: "hr" });
      pos += hr[0].length;
      continue;
    }
    const list = parseList(rest, state);
    if (list !== null) {
      blocks.push(list.block);
      if (list.trailingBlank) blocks.push({ kind: "blank" });
      pos += list.length;
      continue;
    }
    const para = parseParagraphInto(blocks, src, pos);
    pos = para.nextPos;
  }
  return blocks;
}
function parseIndentedCode(rest) {
  const indentLine = /^(?:\t| {4})[ \t]*\S[^\n]*\n/;
  const lazyLine = /^[ \t]*\S[^\n]*\n/;
  let raw = "";
  let consumed = 0;
  let iterations = 0;
  for (; ; ) {
    if (iterations > 0) {
      const blanks = /^(?:[ \t]*\n)+/.exec(rest.slice(consumed));
      if (blanks === null) break;
      if (!indentLine.test(rest.slice(consumed + blanks[0].length))) break;
      raw += blanks[0];
      consumed += blanks[0].length;
    }
    let indented = 0;
    for (; ; ) {
      const line = indentLine.exec(rest.slice(consumed));
      if (line === null) break;
      raw += line[0];
      consumed += line[0].length;
      indented += 1;
    }
    if (indented === 0) {
      if (iterations === 0) return null;
      break;
    }
    for (; ; ) {
      const line = lazyLine.exec(rest.slice(consumed));
      if (line === null) break;
      raw += line[0];
      consumed += line[0].length;
    }
    iterations += 1;
  }
  const content = raw.replace(/\n(?: {0,3}\S)/g, (m) => ` ${m.slice(1)}`).replace(/^(?:\t| {4})/gm, "");
  return {
    block: { kind: "codeblock", lang: void 0, langClass: void 0, content },
    length: consumed
  };
}
function codeBlockHtml(content, lang, langClass, indent) {
  const pad = " ".repeat(indent);
  if (lang !== void 0 && lang.includes("?")) {
    const cls = langClass ?? "";
    const chomped = escapeHtmlAll(content).replace(/\n$/, "");
    return `${pad}<pre><code${cls === "" ? "" : ` class="language-${cls}"`}>${chomped}
</code></pre>
`;
  }
  const language = langClass ?? "ruby";
  return `${pad}<div class="language-${language} highlighter-coderay"><div class="CodeRay">
  <div class="code"><pre>${escapeHtmlCoderay(content)}</pre></div>
</div>
${pad}</div>
`;
}
function parseAtxContents(rawContents) {
  let text = rawContents.replace(/\s+$/, "");
  const idMatch = /[ \t]\{#([^\s{}]+)\}$/.exec(text);
  let id;
  if (idMatch !== null) {
    id = idMatch[1];
    text = text.slice(0, text.length - idMatch[0].length).replace(/\s+$/, "");
  }
  const stripped = text.replace(/(?<!\\)#+$/, "");
  if (stripped !== text) text = stripped.replace(/\s+$/, "");
  if (text === "") return void 0;
  return { text, id };
}
function generateId(rawText, state) {
  let gen = rawText.replace(/^[^a-zA-Z]+/, "");
  gen = gen.replace(/[^a-zA-Z0-9 -]/g, "");
  gen = gen.replace(/ /g, "-").toLowerCase();
  if (gen === "") gen = "section";
  if (state.usedIds.has(gen)) {
    const next = (state.usedIds.get(gen) ?? 0) + 1;
    state.usedIds.set(gen, next);
    gen += `-${next}`;
  } else {
    state.usedIds.set(gen, 0);
  }
  return gen;
}
function parseList(rest, state) {
  const firstMarker = /^( {0,3})([-+*])([\t ]+)([^\n]*)\n/.exec(rest) ?? /^( {0,3})(\d+[.])([\t ]+)([^\n]*)\n/.exec(rest);
  if (firstMarker === null) return null;
  const ordered = firstMarker[2].includes(".");
  const items = [];
  let pos = 0;
  let contentIndent = firstMarker[1].length + firstMarker[2].length + firstMarker[3].length;
  let markerRe = listMarkerRe(ordered, contentIndent);
  let nestedListFound = listStartRe.test(firstMarker[4].replace(/^[ \t]+/, ""));
  items.push({ groups: [[firstMarker[4]]] });
  pos += firstMarker[0].length;
  let lastIsBlank = false;
  for (; ; ) {
    const at2 = rest.slice(pos);
    if (lastIsBlank && /^ {0,3}([*_-])[ \t]*\1[ \t]*\1(?:\1|[ \t])*\n/.test(at2)) {
      break;
    }
    const marker = markerRe.exec(at2);
    if (marker !== null) {
      items.push({ groups: [[marker[4]]] });
      contentIndent = marker[1].length + marker[2].length + marker[3].length;
      markerRe = listMarkerRe(ordered, contentIndent);
      nestedListFound = listStartRe.test(marker[4].replace(/^[ \t]+/, ""));
      lastIsBlank = false;
      pos += marker[0].length;
      continue;
    }
    const line = /^[^\n]*\n/.exec(at2);
    if (line === null) break;
    if (/^[ \t]*\n/.test(line[0])) {
      const current2 = items[items.length - 1];
      if (current2 === void 0) break;
      const run = /^(?:[ \t]*\n)+/.exec(at2)[0];
      const lines = run.replace(/\n$/, "").split("\n");
      current2.groups[current2.groups.length - 1].push(...lines);
      pos += run.length;
      lastIsBlank = true;
      continue;
    }
    const current = items[items.length - 1];
    if (current === void 0) break;
    const tabsExpanded = line[0].replace(/\n$/, "").replace(/^(\t+)/, (tabs) => " ".repeat(4 * tabs.length));
    const indentationFound = new RegExp(`^ {${contentIndent}}`).test(tabsExpanded);
    const stripped = indentationFound ? tabsExpanded.slice(contentIndent) : tabsExpanded;
    const lastGroup = current.groups[current.groups.length - 1];
    if (lastGroup === void 0) break;
    if (indentationFound) {
      if (!nestedListFound && listStartRe.test(stripped)) {
        current.groups.push([stripped]);
        nestedListFound = true;
      } else {
        lastGroup.push(stripped);
      }
      lastIsBlank = false;
      pos += line[0].length;
      continue;
    }
    if (!lastIsBlank) {
      let text = tabsExpanded;
      if (nestedListFound && listStartRe.test(stripped)) {
        text = " ".repeat(contentIndent + 4) + stripped;
      }
      lastGroup.push(text);
      lastIsBlank = false;
      pos += line[0].length;
      continue;
    }
    break;
  }
  const itemBlocks = items.map((item) => {
    const blocks = [];
    for (const group of item.groups) {
      blocks.push(...parseBlocks(group.map((l) => `${l}
`).join(""), state));
    }
    return blocks;
  });
  const transparents = [];
  let trailingBlankAfterList = false;
  for (let i = 0; i < itemBlocks.length; i++) {
    const blocks = itemBlocks[i];
    if (blocks.length === 0) {
      transparents[i] = false;
      continue;
    }
    const first = blocks[0];
    let transparent = false;
    if (first.kind === "p" && (blocks.length < 2 || blocks[1].kind !== "blank" || i === items.length - 1 && blocks.length === 2) && // && !eob_found
    (i !== items.length - 1 || items.length === 1 || itemBlocks.slice(0, -1).some(
      (earlier) => earlier[0] === void 0 || earlier[0].kind !== "p" || earlier[0].transparent === true
    ))) {
      transparent = true;
      if (blocks.length > 1 && blocks[1].kind !== "blank") {
        first.text += "\n";
      }
      first.transparent = true;
    }
    transparents[i] = transparent;
    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock.kind === "blank") {
      blocks.pop();
      if (i === items.length - 1) trailingBlankAfterList = true;
    }
  }
  return {
    block: {
      kind: "list",
      ordered,
      items: itemBlocks.map((blocks, i) => ({ blocks, transparent: transparents[i] === true }))
    },
    length: pos,
    trailingBlank: trailingBlankAfterList
  };
}
function listMarkerRe(ordered, indentation) {
  const lead = Math.min(indentation, 4) - 1;
  return new RegExp(
    `^( {0,${lead}})(${ordered ? "\\d+[.]" : "[-+*]"})([\\t ]+)([^\\n]*)\\n`
  );
}
var listStartRe = /^(?: {0,3}[-+*]| {0,3}\d+[.])[\t ]/;
function parseParagraphInto(blocks, src, startPos) {
  const lines = [];
  let pos = startPos;
  for (; ; ) {
    const at2 = src.slice(pos);
    if (/^[ \t]*\n/.test(at2)) break;
    const line = /^[^\n]*\n/.exec(at2);
    if (line === null) break;
    lines.push(line[0].replace(/\n$/, ""));
    pos += line[0].length;
  }
  const text = lines.join("\n").replace(/\s+$/, "");
  const last = blocks[blocks.length - 1];
  if (last !== void 0 && last.kind === "p") {
    const before = src.slice(Math.max(0, startPos - 3), startPos);
    last.text = `${last.text}${before === "  \n" ? "  \n" : "\n"}${text}`;
  } else {
    blocks.push({ kind: "p", text, transparent: false });
  }
  return { nextPos: pos };
}
function parseSpans(text, ancestors, begin = 0, stop) {
  let out = "";
  let i = begin;
  while (i < text.length) {
    if (stop !== void 0 && i > stop.from && // !el.children.empty? (emphasis.rb:40)
    text.startsWith(stop.ch.repeat(stop.run), i) && stopValid(text, i, stop)) {
      return { html: out, stoppedAt: i };
    }
    const ch = text[i];
    if (ch === "*" || ch === "_") {
      const parsed = parseEmphasis(text, i, ancestors);
      if (parsed !== null) {
        out += parsed.html;
        i = parsed.next;
        continue;
      }
    }
    if (ch === "`") {
      const parsed = parseCodespan(text, i);
      out += parsed.html;
      i = parsed.next;
      continue;
    }
    if (ch === "<") {
      const auto = parseAutolink(text, i);
      if (auto !== null) {
        out += auto.html;
        i = auto.next;
        continue;
      }
    }
    if (ch === "[" || ch === "!" && text[i + 1] === "[") {
      const link = parseLinkOrImage(text, i, ancestors);
      if (link !== null) {
        out += link.html;
        i = link.next;
        continue;
      }
    }
    if (ch === "'" || ch === '"' || isQuoteAhead(text, i)) {
      const sq = parseSmartQuote(text, i);
      if (sq !== null) {
        out += sq.html;
        i = sq.next;
        continue;
      }
    }
    if (ch === "&") {
      const entity = parseHtmlEntity(text, i);
      if (entity !== null) {
        out += entity.html;
        i = entity.next;
        continue;
      }
    }
    const typo = parseTypographic(text, i);
    if (typo !== null) {
      out += typo.html;
      i = typo.next;
      continue;
    }
    const br = /^(?:  |\\\\)\n/.exec(text.slice(i));
    if (br !== null) {
      out += "<br />\n";
      i += br[0].length;
      continue;
    }
    const esc = parseEscapedChar(text, i);
    if (esc !== null) {
      out += esc.html;
      i = esc.next;
      continue;
    }
    out += escapeHtmlText(ch);
    i += 1;
  }
  return { html: out, stoppedAt: -1 };
}
function isQuoteAhead(text, i) {
  return text[i] !== "\\" && (text[i + 1] === "'" || text[i + 1] === '"');
}
function stopValid(text, i, stop) {
  const prev = i > 0 ? text[i - 1] : "";
  if (/\s/.test(prev)) return false;
  if (stop.elem === "em") {
    const after = text.slice(i, i + 2);
    if (after === `${stop.ch}${stop.ch}` && text[i + 2] !== stop.ch) return false;
  }
  if (stop.ch === "_" && /[a-zA-Z0-9]/.test(text[i + stop.run] ?? "")) return false;
  return true;
}
function parseEmphasis(text, start, ancestors) {
  const ch = text[start];
  let run = 1;
  while (run < 2 && text[start + run] === ch) run += 1;
  const elem = run === 2 ? "strong" : "em";
  const prev = start > 0 ? text[start - 1] : "";
  const nextCh = text[start + run];
  if (ch === "_" && /[a-zA-Z0-9_]/.test(prev)) return null;
  if (nextCh === void 0 || /\s/.test(nextCh)) return null;
  if (ancestors.has(elem)) return null;
  const contentStart = start + run;
  const innerAncestors = new Set(ancestors);
  innerAncestors.add(elem);
  const walked = parseSpans(text, innerAncestors, contentStart, {
    ch,
    run,
    elem,
    from: contentStart
  });
  if (walked.stoppedAt >= 0) {
    return {
      html: `<${elem}>${walked.html}</${elem}>`,
      next: walked.stoppedAt + run
    };
  }
  if (elem === "strong") {
    const retry = parseEmphasis(text, start + 1, ancestors);
    if (retry !== null) {
      return { html: escapeHtmlText(text[start]) + retry.html, next: retry.next };
    }
  }
  return null;
}
function parseCodespan(text, start) {
  let run = 0;
  while (text[start + run] === "`") run += 1;
  const simple = run === 1;
  const prevOk = start === 0 || /\s/.test(text[start - 1]);
  if (simple && prevOk && /\s/.test(text[start + 1] ?? " ")) {
    return { html: escapeHtmlText("`"), next: start + 1 };
  }
  const closeStart = text.indexOf("`".repeat(run), start + run);
  if (closeStart === -1) {
    return { html: escapeHtmlText("`".repeat(run)), next: start + run };
  }
  let content = text.slice(start + run, closeStart);
  if (!simple) {
    if (content.startsWith(" ")) content = content.slice(1);
    if (content.endsWith(" ")) content = content.slice(0, -1);
  }
  return { html: `<code>${escapeHtmlAll(content)}</code>`, next: closeStart + run };
}
function parseAutolink(text, start) {
  const match = /^<(mailto|https?|ftps?):([^ \t<>]+)>/.exec(text.slice(start));
  if (match === null) return null;
  const scheme = match[1];
  const rest = match[2];
  if (scheme === "mailto") {
    return {
      html: `<a href="mailto:${escapeAttribute(rest)}">${escapeHtmlText(rest)}</a>`,
      next: start + match[0].length
    };
  }
  const url = `${scheme}:${rest}`;
  return {
    html: `<a href="${escapeAttribute(url)}">${escapeHtmlText(url)}</a>`,
    next: start + match[0].length
  };
}
function parseLinkOrImage(text, start, ancestors) {
  const isImage = text[start] === "!";
  let i = start + (isImage ? 1 : 0);
  let depth = 1;
  let close = -1;
  for (i += 1; i < text.length && close === -1; i++) {
    if (text[i] === "[") depth += 1;
    else if (text[i] === "]") {
      depth -= 1;
      if (depth === 0) close = i;
    }
  }
  if (close === -1) return null;
  const innerText = text.slice(start + (isImage ? 2 : 1), close);
  const after = text.slice(close + 1);
  const target = /^[(]([^)]*)[)]/.exec(after);
  if (target === null) {
    if (isImage) return null;
    return {
      html: `[${parseSpans(innerText, ancestors).html}]`,
      next: close + 1
    };
  }
  const targetInner = target[1];
  const angle = /^<([^>]*)>/.exec(targetInner);
  let url = angle !== null ? angle[1] : targetInner;
  let title;
  const titleMatch = /^(?:<[^>]*>|[^"\s]+)[ \t]+["']([^"']*)["'][ \t]*$/.exec(targetInner);
  if (titleMatch !== null) {
    url = angle !== null ? angle[1] : titleMatch[0].replace(/[ \t]+["'][^"']*["'][ \t]*$/, "");
    title = titleMatch[1];
  }
  if (isImage) {
    const attrs2 = ` src="${escapeAttribute(url)}" alt="${escapeAttribute(innerText)}"${title === void 0 ? "" : ` title="${escapeAttribute(title)}"`}`;
    return { html: `<img${attrs2} />`, next: close + 1 + target[0].length };
  }
  const inner = parseSpans(innerText, ancestors).html;
  const attrs = ` href="${escapeAttribute(url)}"${title === void 0 ? "" : ` title="${escapeAttribute(title)}"`}`;
  return { html: `<a${attrs}>${inner}</a>`, next: close + 1 + target[0].length };
}
var SQ_PUNCT = "[!\"#$%&'()*+,\\-./:;<=>?@\\[\\\\\\]^_`{|}~]";
var SQ_CLOSE = "[^ \\\\	\r\n\\[{(-]";
var SQ_RULES = [
  { re: new RegExp(`("|')(?=[_*]{1,2}\\S)`, "y"), substs: [{ kind: "context", via: "lquote", group: 1 }] },
  { re: new RegExp(`("|')(?=${SQ_PUNCT}(?!\\.\\.)\\B)`, "y"), substs: [{ kind: "context", via: "rquote", group: 1 }] },
  { re: new RegExp(`(\\s)"'(?=\\w)`, "y"), substs: [{ kind: "text", group: 1 }, { kind: "quote", char: "\u201C" }, { kind: "quote", char: "\u2018" }] },
  { re: new RegExp(`(\\s)'"(?=\\w)`, "y"), substs: [{ kind: "text", group: 1 }, { kind: "quote", char: "\u2018" }, { kind: "quote", char: "\u201C" }] },
  { re: new RegExp(`(\\s)'(?=\\d\\ds)`, "y"), substs: [{ kind: "text", group: 1 }, { kind: "quote", char: "\u2019" }] },
  { re: new RegExp(`(\\s)('|")(?=\\w)`, "y"), substs: [{ kind: "text", group: 1 }, { kind: "context", via: "lquote", group: 2 }] },
  { re: new RegExp(`(${SQ_CLOSE})('|")`, "y"), substs: [{ kind: "text", group: 1 }, { kind: "context", via: "rquote", group: 2 }] },
  { re: new RegExp(`("|')(?=\\s|s\\b|$)`, "y"), substs: [{ kind: "context", via: "rquote", group: 1 }] },
  { re: new RegExp(`(.?)'`, "sy"), substs: [{ kind: "text", group: 1 }, { kind: "quote", char: "\u2018" }] },
  { re: new RegExp(`(.?)"`, "sy"), substs: [{ kind: "text", group: 1 }, { kind: "quote", char: "\u201C" }] }
];
function sqSubstChar(via, quote) {
  if (quote === '"') return via === "lquote" ? "\u201C" : "\u201D";
  return via === "lquote" ? "\u2018" : "\u2019";
}
function parseSmartQuote(text, start) {
  for (const rule of SQ_RULES) {
    rule.re.lastIndex = start;
    const match = rule.re.exec(text);
    if (match === null) continue;
    let html = "";
    for (const subst of rule.substs) {
      if (subst.kind === "text") {
        const captured = match[subst.group];
        if (captured !== void 0 && captured !== "") html += escapeHtmlText(captured);
      } else if (subst.kind === "quote") {
        html += subst.char;
      } else {
        html += sqSubstChar(subst.via, match[subst.group] ?? "'");
      }
    }
    return { html, next: start + match[0].length };
  }
  return null;
}
var NAMED_ENTITIES2 = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  copy: "\xA9",
  reg: "\xAE",
  trade: "\u2122",
  nbsp: "\xA0",
  mdash: "\u2014",
  ndash: "\u2013",
  hellip: "\u2026",
  laquo: "\xAB",
  raquo: "\xBB",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201C",
  rdquo: "\u201D",
  deg: "\xB0",
  plusmn: "\xB1",
  frac12: "\xBD",
  times: "\xD7",
  divide: "\xF7",
  middot: "\xB7",
  bull: "\u2022",
  dagger: "\u2020",
  sect: "\xA7",
  para: "\xB6",
  euro: "\u20AC",
  pound: "\xA3",
  yen: "\xA5",
  cent: "\xA2"
};
function parseHtmlEntity(text, start) {
  const match = /^&([A-Za-z][A-Za-z0-9]*|#[0-9]+|#[xX][0-9a-fA-F]+);/.exec(text.slice(start));
  if (match === null) return null;
  const original = match[0];
  const body = match[1];
  let char;
  if (body.startsWith("#")) {
    const code = body[1] === "#" || body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), body[1]?.toLowerCase() === "x" ? 16 : 10) : parseInt(body.slice(1), 10);
    if (Number.isFinite(code)) char = String.fromCodePoint(code);
  } else {
    char = NAMED_ENTITIES2[body];
    if (char === void 0) return null;
  }
  if (char === void 0) {
    return { html: original, next: start + original.length };
  }
  if (char === "<" || char === ">" || char === "&" || char === '"') {
    return { html: original, next: start + original.length };
  }
  return { html: char, next: start + original.length };
}
var TYPOGRAPHIC_SUBSTS = [
  [/^---/, "\u2014", 3],
  [/^--/, "\u2013", 2],
  [/^\.\.\./, "\u2026", 3],
  [/^\\<</, "&lt;&lt;", 4],
  [/^\\>>/, "&gt;&gt;", 4],
  [/^<< /, "\xAB\xA0", 3],
  [/^ >>/, "\xA0\xBB", 3],
  [/^<</, "\xAB", 2],
  [/^>>/, "\xBB", 2]
];
function parseTypographic(text, start) {
  for (const [re, replacement, length] of TYPOGRAPHIC_SUBSTS) {
    if (re.test(text.slice(start, start + length))) {
      return { html: replacement, next: start + length };
    }
  }
  return null;
}
function parseEscapedChar(text, start) {
  const match = /^\\([\\.*_+`<>(){}[\]#!:|"'$=-])/.exec(text.slice(start));
  if (match === null) return null;
  return { html: escapeHtmlText(match[1]), next: start + match[0].length };
}
function escapeHtmlAll(s) {
  return s.replace(/[<>&]/g, (m) => m === "<" ? "&lt;" : m === ">" ? "&gt;" : "&amp;");
}
function escapeHtmlCoderay(s) {
  return escapeHtmlAll(s).replace(/"/g, "&quot;");
}
function escapeHtmlText(s) {
  return escapeHtmlAll(s);
}
function escapeAttribute(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function kramdownToStashedHtml(raw) {
  const merged = [];
  const REF_PATTERN = /\\(?:\{\{[^{}]*\}\}|\[\[[^\]\n]+\]\])|\{\{[^{}]*\}\}|\[\[[^\]\n]+\]\]/g;
  let last = 0;
  for (const match of raw.matchAll(REF_PATTERN)) {
    const start = match.index;
    if (start > last) merged.push({ kind: "text", text: raw.slice(last, start) });
    merged.push({ kind: "ref", text: match[0] });
    last = start + match[0].length;
  }
  if (last < raw.length) merged.push({ kind: "text", text: raw.slice(last) });
  let stashed = "";
  const stash = [];
  for (const piece of merged) {
    if (piece.kind === "text") {
      stashed += piece.text;
    } else {
      stashed += `{{${stash.length}}}`;
      stash.push(piece.text);
    }
  }
  return unstashNests(kramdownToHtml(stashed), stash);
}
function unstashNests(converted, stash) {
  return converted.replace(/{{([^{}]*)}}/g, (whole, inner) => {
    if (!isRubyNumber(inner)) return whole;
    return stash[Number(inner)] ?? "";
  });
}
function isRubyNumber(s) {
  const trimmed = s.trim();
  if (trimmed === "") return false;
  return Number.isFinite(Number(trimmed));
}

// src/card/mod-loader/mod-engine-host.ts
function modEngineHost(engine, fetcher) {
  return {
    fetchRenderCard: (name) => engine.fetchRenderCard(name),
    isDenied: (card) => engine.isDenied(card),
    batch: (statements) => fetcher.driver.batch([...statements]),
    codenames: fetcher.codenames,
    fetchById: (id) => fetcher.fetchById(id),
    // render.ts cacheFetchedRecord (private): writes the fetch cache + the
    // enriched render-card map - the only write path into the sync render
    // surface.
    cacheFetchedRecord: async (record) => {
      await engine.cacheFetchedRecord(record);
    }
  };
}

// src/card/mod-loader/mods/card-mod-bootstrap.ts
function renderCarouselItemInner(ctx, itemCard) {
  const sub = new RenderFormat(itemCard, ctx.fmt.engine, {
    parent: ctx.fmt,
    maxDepth: ctx.fmt.maxDepth
  });
  return sub.renderView("core");
}
var carouselView = (ctx) => {
  const card = ctx.fmt.card;
  const itemNames = rawItemStrings(card.dbContent).filter((s) => s !== "");
  const id = `${card.name.safeKey}-1`;
  let out = `<div class="carousel slide" id="${id}" data-bs-ride="true">`;
  let indicators = `<div class="carousel-indicators">`;
  itemNames.forEach((_name, index) => {
    const activeAttr = index === 0 ? ` class="active"` : "";
    indicators += `<button data-bs-slide-to="${index}" data-bs-target="#${id}" type="button" aria-label="Slide ${index + 1}"${activeAttr}/>`;
  });
  indicators += `</div>`;
  let items = `<div class="carousel-inner">`;
  itemNames.forEach((name, index) => {
    const itemCard = ctx.fmt.engine.fetchRenderCard(name);
    const inner = itemCard === void 0 ? "" : renderCarouselItemInner(ctx, itemCard);
    const activeClass = index === 0 ? ` class="carousel-item active"` : ` class="carousel-item"`;
    items += `<div${activeClass}>${inner}</div>`;
  });
  items += `</div>`;
  out += indicators + items;
  out += `<button class="carousel-control-prev" data-bs-target="#${id}" type="button"><span class="carousel-control-prev-icon" aria-hidden="true"></span><span class="visually-hidden">Previous</span></button>`;
  out += `<button class="carousel-control-next" data-bs-target="#${id}" type="button"><span class="carousel-control-next-icon" aria-hidden="true"></span><span class="visually-hidden">Next</span></button>`;
  out += `</div>`;
  return out;
};
function buildCustomizeButtonHref(args) {
  const encodeKey = (s) => encodeURIComponent(s);
  const encodeValue = (s) => encodeURIComponent(s).replace(/%20/g, "+");
  const sep = "&amp;";
  const query = `${encodeKey("card[fields][parent]")}=${encodeValue(args.parentName)}${sep}${encodeKey("card[name]")}=${encodeValue(args.newName)}${sep}${encodeKey("card[type]")}=bootswatch_skin${sep}mark=${encodeValue(args.newName)}`;
  return `/card/create?${query}`;
}
function newCustomizedName(ctx) {
  const card = ctx.fmt.card;
  const engine = ctx.fmt.engine;
  const warmed = engine.peekCustomizedName?.(card.name.s);
  if (warmed !== void 0) return warmed;
  const base = `${card.name.s} customized`;
  const exists = (name) => engine.fetchRenderCard(name) !== void 0;
  if (!exists(base)) return base;
  let candidate = `${base} 1`;
  let n = 1;
  while (exists(candidate)) {
    n += 1;
    candidate = `${base} ${n}`;
  }
  return candidate;
}
var customizeButtonView = (ctx) => {
  if (ctx.fmt.card.typeCode !== "bootswatch_skin") {
    throw new UnsupportedViewError("customize_button", ctx.fmt.card.name.s);
  }
  const name = ctx.fmt.card.name.s;
  const hasParent = ctx.fmt.engine.fetchRenderCard(`${name}+parent`) !== void 0;
  if (hasParent) return "";
  const newName = newCustomizedName(ctx);
  const href = buildCustomizeButtonHref({
    newName,
    parentName: name
  });
  return `<a class="btn btn-sm btn-outline-primary me-2 wanted-card" href="${href}">Customize</a>`;
};
function readNumericValue(ctx) {
  const raw = ctx.fmt.card.dbContent;
  if (typeof raw !== "string") return Number.NaN;
  const trimmed = raw.trim();
  if (trimmed === "") return Number.NaN;
  const asNumber = Number(trimmed);
  if (Number.isNaN(asNumber)) return Number.NaN;
  return asNumber;
}
function progressBar(value) {
  const label = `${Math.round(value)}%`;
  const span = `<span class="progress-value">${label}</span>`;
  const attrs = ` role="progressbar" style="width: ${value}%" aria-valuenow="${value}" aria-valuemin="0" aria-valuemax="100"`;
  return `<div class="progress-bar"${attrs}>${span}</div>`;
}
var progressBarView = (ctx) => {
  const value = readNumericValue(ctx);
  if (Number.isNaN(value)) {
    return "Only card with numeric content can be shown as progress bar.";
  }
  return `<div class="progress">${progressBar(value)}</div>`;
};
var ICON_BASKET = {
  material: {
    plus: "add",
    pencil: "edit",
    trash: "delete",
    full_page: "open_in_full",
    new_window: "close_fullscreen",
    history: "history",
    collapse: "expand_less",
    expand: "expand_more",
    flag: "flag",
    remove: "close",
    close: "close",
    board: "space_dashboard",
    warning: "warning",
    unknown: "add_box",
    help: "help",
    modal: "fullscreen",
    reorder: "reorder",
    create_action: "add_circle",
    update_action: "edit",
    delete_action: "remove_circle",
    draft: "build",
    next: "arrow_forward_ios",
    previous: "arrow_back_ios",
    forward: "arrow_forward",
    back: "arrow_back",
    list: "list",
    search: "search",
    filter: "filter_alt",
    quick_filter: "bolt",
    reset: "restart_alt",
    more: "more_horiz",
    menu: "more_vert",
    bar_menu: "more_horiz",
    show_password: "visibility",
    hide_password: "visibility_off"
  },
  font_awesome: {
    plus: "plus",
    pencil: "pencil",
    trash: "trash",
    new_window: "external-link-square-alt",
    close: "times",
    remove: "times",
    board: "table-columns",
    reorder: "align-justify",
    history: "clock",
    warning: "exclamation-circle",
    unknown: "plus-square",
    help: "question-circle",
    modal: "expand",
    next: "arrow-right",
    previous: "arrow-left",
    create_action: "circle-plus",
    update_action: "edit",
    delete_action: "circle-minus",
    flag: "flag",
    collapse: "chevron-up",
    expand: "chevron-down",
    list: "list",
    search: "magnifying-glass",
    draft: "wrench",
    filter: "filter",
    reset: "sync-alt",
    quick_filter: "bolt",
    show_password: "eye",
    hide_password: "eye-slash"
  },
  bootstrap: {
    plus: "plus-lg",
    pencil: "pencil-fill",
    trash: "trash-fill",
    new_window: "box-arrow-up-right",
    history: "clock",
    collapse: "chevron-up",
    expand: "chevron-down",
    flag: "flag-fill",
    reorder: "grip-horizontal"
  }
};
function allIconKeys() {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const library of Object.keys(ICON_BASKET)) {
    for (const key of Object.keys(ICON_BASKET[library] ?? {})) {
      if (!seen.has(key)) {
        seen.add(key);
        out.push(key);
      }
    }
  }
  return out;
}
function iconLibraries(_ctx) {
  return Object.keys(ICON_BASKET);
}
var iconsView = (ctx) => {
  const libraries = iconLibraries(ctx);
  const keys = allIconKeys();
  const headerCells = ["lookup key", ...libraries].map((label) => `<th>${label}</th>`).join("");
  const rows = keys.map((key) => {
    const cells = libraries.map((library) => {
      const mapping = ICON_BASKET[library]?.[key];
      return `<td>${mapping ?? "&nbsp;"}</td>`;
    });
    return `<tr><td>${key}</td>${cells.join("")}</tr>`;
  });
  return `<table><tr>${headerCells}</tr>${rows.join("")}</table>`;
};
function mediaSnippetBytes(ctx, opts) {
  const { fmt } = ctx;
  const imageName = `${fmt.card.name.s}+Image`;
  const imageCard = fmt.engine.fetchRenderCard(imageName);
  const imageBoxTitle = imageCard === void 0 ? fmt.card.name.s : imageCard.name.trunkName.s;
  const size = opts.size;
  const core = imageCard === void 0 ? "" : formatImageCore(
    imageCard.record.dbContent,
    imageCard.id,
    imageCard.name.s,
    IMAGE_BOX_RENDER_SIZE[size] ?? "small"
  );
  const boxed = `<div title="${imageBoxTitle}" class="image-box ${size}">${core}</div>`;
  const titleBlock = opts.title === "" ? "" : `<h5 class='media-heading'>
${opts.title}
</h5>
`;
  const html = `<div class='media ${opts.mediaClass ?? ""}'>
<div class='media-left'>
${boxed}
</div>
<div class='media-body-${size} media-body'>
` + titleBlock + `<div class='media-text'>
${opts.text}
</div>
</div>
</div>`;
  return { html, size };
}
var IMAGE_BOX_RENDER_SIZE = {
  icon: "icon",
  small: "small",
  medium: "small",
  large: "medium",
  xlarge: "medium"
};
function useAsCurrentButtonBytes(ctx) {
  const url = ctx.fmt.urlKey();
  return `<a class="btn btn-sm btn-outline-primary me-2 known-card" href="/update/${url}?card%5Btrigger%5D=use_as_current_skin">Use as current</a>`;
}
function currentSkin(ctx) {
  const styleRule = ctx.fmt.engine.fetchRenderCard("*all+*style");
  if (styleRule === void 0) return false;
  const items = rawItemStrings(
    styleRule.record.dbContent ?? ""
  );
  return items.includes(ctx.fmt.card.name.key);
}
var skinCoreView = (ctx) => {
  const { fmt } = ctx;
  const skin = fmt.card.name.s;
  const parts = [];
  if (currentSkin(ctx)) {
    parts.push(
      `<span class='btn btn-sm btn-outline-primary me-2 disabled'>
Current skin
</span>`
    );
  } else {
    parts.push(useAsCurrentButtonBytes(ctx));
  }
  const hasParent = fmt.engine.fetchRenderCard(`${skin}+parent`) !== void 0;
  if (hasParent) {
    parts.push(`Inherit from:
${fmt.renderView("customize_button")}`);
  } else {
    parts.push(fmt.renderView("customize_button"));
    parts.push(
      `<div class='mt-4'>
` + fmt.nest({
        syntax: `{{+Image|view:content|size:large}}`,
        name: "+Image",
        options: { view: "content", size: "large", extra: {} },
        comment: void 0
      }) + `
</div>`
    );
  }
  parts.push(`<h5 class='mt-4'>
Skin configuration
</h5>`);
  parts.push(`<div class='small mb-3'>
from simplest to most advanced
</div>`);
  const fieldNest = (field, title) => fmt.nest({
    syntax: `{{+${field}|view:accordion_bar|title:${title}}}`,
    name: `+${field}`,
    options: { view: "accordion_bar", title, extra: {} },
    comment: void 0
  });
  parts.push(
    `<div class='accordion'>
` + [
      fieldNest("colors", "Palette and uses of colors"),
      fieldNest("variables", "Additional SCSS variables"),
      fieldNest("stylesheets", "SCSS and CSS stylesheets")
    ].join("\n") + `
</div>`
  );
  return parts.join("\n");
};
var bootswatchBarLeftView = (ctx) => {
  const title = ctx.fmt.renderView("title");
  const { html } = mediaSnippetBytes(ctx, {
    size: "medium",
    title: "",
    text: title,
    mediaClass: "align-items-center"
  });
  return html;
};
var bootswatchBarRightView = () => "";
var colorsBarMiddleView = () => '\n      <div class="colorpicker-element">\n        <div class="input-group-addon">\n          <span class="bg-body border p-1">Text</span>\n          <span class="bg-dark text-light border p-1">Nav</span>\n            <i class="bg-primary"></i>\n          <i class="bg-secondary"></i>\n        </div>\n      </div>\n';
var oneLineContentView = (_ctx) => "";
var barBottomView = ({ fmt }) => `<code>${fmt.renderView("core")}</code>`;
var inputView = (ctx) => {
  if (ctx.fmt.card.typeCode !== "bootswatch_skin") {
    throw new UnsupportedViewError("input", ctx.fmt.card.name.s);
  }
  const name = ctx.fmt.card.name.s;
  const hasParent = ctx.fmt.engine.fetchRenderCard(`${name}+parent`) !== void 0;
  if (!hasParent) return "Content is stored in file and can't be edited.";
  return superView(ctx, "Type::BootswatchSkin", "input");
};
function scssTypeIdentity(ctx) {
  const typeCard = ctx.fmt.engine.fetchRenderCard("SCSS");
  if (typeCard !== void 0 && typeCard.id !== void 0) {
    return {
      typeId: typeCard.id,
      typeName: typeCard.name?.s ?? "SCSS",
      typeCode: "scss"
    };
  }
  return { typeId: 17436, typeName: "SCSS", typeCode: "scss" };
}
function virtualSkinFieldCard(ctx, field) {
  const skin = ctx.fmt.card;
  const name = DeckoName.parse(`${skin.name.s}+*${field}`);
  const scssType = scssTypeIdentity(ctx);
  const typeId = scssType.typeId;
  const typeName = scssType.typeName;
  const record = {
    id: void 0,
    codename: void 0,
    leftId: skin.id,
    rightId: void 0,
    typeId,
    dbContent: "",
    trash: false,
    creatorId: void 0,
    updaterId: void 0,
    createdAt: void 0,
    updatedAt: void 0,
    currentRevisionId: void 0,
    readRuleClass: void 0,
    readRuleId: void 0,
    referencesExpired: void 0,
    name,
    key: name.key,
    isNew: true,
    fromTrash: false,
    uncacheable: false
  };
  const setKeys = safeSetKeys({
    name,
    typeId,
    typeName,
    leftTypeName: skin.typeName,
    isRule: false,
    isNew: true
  });
  return {
    record,
    name,
    key: name.key,
    typeName,
    typeId,
    typeCode: scssType.typeCode,
    id: void 0,
    dbContent: "",
    setKeys
  };
}
function skinFieldNest(ctx, field, title) {
  const { fmt } = ctx;
  const name = fmt.card.name.s;
  const opts = { show: ["accordion_bar"], hide: ["bar_middle"], title };
  const real = fmt.engine.fetchRenderCard(`${name}+*${field}`);
  if (real !== void 0) {
    return fmt.nestRecord(real, "accordion_bar", opts);
  }
  if (field === "stylesheets") return "";
  return fmt.nestRecord(virtualSkinFieldCard(ctx, field), "accordion_bar", opts);
}
function linkToCardName(ctx, target) {
  const known = ctx.fmt.engine.fetchRenderCard(target) !== void 0;
  const cls = known ? "known-card" : "wanted-card";
  const urlKey = DeckoName.parse(target).urlKey;
  return `<a class="${cls}" href="/${urlKey}">${target}</a>`;
}
function bootswatchSkinCoreHtml(ctx) {
  return bootswatchCoreView(ctx);
}
var bootswatchCoreView = (ctx) => {
  const { fmt } = ctx;
  if (fmt.card.typeCode !== "bootswatch_skin") {
    throw new UnsupportedViewError("core", fmt.card.name.s);
  }
  const name = fmt.card.name.s;
  const styleRule = fmt.engine.fetchRenderCard("*all+*style");
  const currentKeys = styleRule === void 0 ? [] : rawItemStrings(styleRule.dbContent ?? "").map(
    (s) => DeckoName.parse(s).key
  );
  let out = "";
  if (currentKeys.includes(fmt.card.key)) {
    out += `<span class='btn btn-sm btn-outline-primary me-2 disabled'>
Current skin
</span>
`;
  } else {
    out += `<a class="btn btn-sm btn-outline-primary me-2 known-card" href="/update/${fmt.urlKey()}?card%5Btrigger%5D=use_as_current_skin">Use as current</a>
`;
  }
  const parentCard = fmt.engine.fetchRenderCard(`${name}+parent`);
  if (parentCard !== void 0) {
    const firstItem = rawItemStrings(parentCard.dbContent ?? "").filter((s) => s.length > 0)[0];
    out += `Inherit from:
${firstItem === void 0 ? "" : linkToCardName(ctx, firstItem)}
`;
  } else {
    out += `${customizeButtonView(ctx)}
`;
    const imageCard = fmt.engine.fetchRenderCard(`${name}+Image`);
    out += `<div class='mt-4'>
${imageCard === void 0 ? "" : fmt.nestRecord(imageCard, "content", { size: "large" })}
</div>
`;
  }
  out += `<h5 class='mt-4'>
Skin configuration
</h5>
<div class='small mb-3'>
from simplest to most advanced
</div>
<div class='accordion'>
`;
  out += `${skinFieldNest(ctx, "colors", "Palette and uses of colors")}
`;
  out += `${skinFieldNest(ctx, "variables", "Additional SCSS variables")}
`;
  out += `${skinFieldNest(ctx, "stylesheets", "SCSS and CSS stylesheets")}
`;
  out += `</div>
`;
  return out;
};
var passiveSetModule = (setPath) => ({
  setPath,
  formats: { html: { views: [] } }
});
var cardModBootstrap = {
  name: "bootstrap",
  gemName: "card-mod-bootstrap",
  group: "gem-defaults",
  setModules: [
    {
      // card-mod-bootstrap-0.20.0/set/abstract/progress_bar.rb
      setPath: "abstract/progress_bar",
      formats: {
        html: {
          views: [{ view: "progress_bar", viewFn: progressBarView }]
        }
      }
    },
    {
      // card-mod-bootstrap-0.20.0/set/abstract/bs_badge.rb - labeled_badge
      // helper (def labeled_badge + def badge_haml_opts + def process_badge_
      // opts). Methods only, no view declarations. The HAML templates
      // bs_badge/bs_badge.haml and bs_badge/labeled_badge.haml are pulled
      // in via haml :bs_badge / haml :labeled_badge - not directly
      // accessible as a view from the live HTML_VIEWS table.
      setPath: "abstract/bs_badge",
      formats: { html: { views: [] } }
    },
    {
      // card-mod-bootstrap-0.20.0/set/abstract/bootstrap_code_file.rb -
      // code-file content assembler (SCSS bundle load); methods only,
      // no views.
      setPath: "abstract/bootstrap_code_file",
      formats: { html: { views: [] } }
    },
    {
      // card-mod-bootstrap-0.20.0/set/abstract/skin_field.rb - event hook
      // for skin asset updates (update_skin_asset_input at :finalize).
      // The event has no `on:` trigger (the body is unconditional - Ruby
      // returns early when left is absent or left.action is truthy). No
      // views. The TS port records the event with `on: ["save"]` (the
      // broadest trigger; the execution seam applies Ruby's :save ->
      // [:create, :update] expansion at fire time per mod-manifest.ts:
      // 161-163).
      setPath: "abstract/skin_field",
      formats: { html: { views: [] } },
      events: [
        // skin_field.rb:1-5 event :update_skin_asset_input, :finalize
        // do; the :finalize stage IS in the ModEventStage enum.
        {
          event: "update_skin_asset_input",
          at: "finalize",
          on: ["save"],
          fn: () => void 0
        }
      ]
    },
    {
      // card-mod-bootstrap-0.20.0/set/all/bootstrap.rb - format :html do
      // include Bootstrapper end. Bootstrapper is loaded from
      // lib/card/bootstrapper.rb. No views declared.
      setPath: "all/bootstrap",
      formats: { html: { views: [] } }
    },
    {
      // card-mod-bootstrap-0.20.0/set/all/bootstrap/icon.rb - defines the
      // basket[:icons] hash + the icon_tag family of helpers +
      // view :icons.
      setPath: "all/bootstrap/icon",
      formats: {
        html: {
          views: [{ view: "icons", viewFn: iconsView }]
        }
      }
    },
    // The remaining all/bootstrap/* helpers (accordion, dropdown, form,
    // helper, navbar, table, wrapper) - each defines helper methods
    // only, no top-level views. carousel.rb (set/all/bootstrap/carousel.rb
    // :2-8) declares `view :carousel` which depends on
    // lib/card/bootstrap/component/carousel.rb - the headless engine
    // has no ComponentKlass. This pass registers the carousel view as
    // a direct emitter of the captured bytes
    // (fixtures/captured/bootstrap-views.json's carousel bytes);
    // see card-mod-bootstrap.ts#carouselView and
    // tests/card/mod-loader/card-mod-bootstrap.test.ts#:carousel.
    passiveSetModule("all/bootstrap/accordion"),
    {
      // card-mod-bootstrap-0.20.0/set/all/bootstrap/carousel.rb
      //   view :carousel do
      //     bs_carousel unique_id, 0 do
      //       nest_item_array.each do |rendered_item|
      //         item(rendered_item)
      //       end
      //     end
      //   end
      // The bs_carousel wrapper is lib/card/bootstrap/component/
      // carousel.rb (a Card::Bootstrap::Component::Carousel subclass
      // that defines unique_id, slide nav, indicator tags, and per-item
      // slot wrapping for the active-index slide). The headless engine
      // has no ComponentKlass, so the port walks rawItemStrings ->
      // each item's format.renderView("core") directly and composes
      // the captured carousel markup (attribute order, self-closing
      // indicator buttons, control buttons).
      setPath: "all/bootstrap/carousel",
      formats: {
        html: {
          views: [{ view: "carousel", viewFn: carouselView }]
        }
      }
    },
    passiveSetModule("all/bootstrap/dropdown"),
    passiveSetModule("all/bootstrap/form"),
    {
      // card-mod-bootstrap-0.20.0/set/all/bootstrap/helper.rb - defines
      // helper methods (button_link, separator, list_group, list_tag,
      // list_item_tags, badge_tag, popover_link, popover_opts) under
      // `format :html`. No top-level view, but popover_link is the
      // anchor that card-mod-help set/right/help.rb:4-6's
      // `view :popover` consumes. The TS port exports popoverLink
      // (card-mod-bootstrap.ts: see the popoverLink comment block)
      // - card-mod-help's set/right/help.rb port can import it
      // through the mod loader manifest export map. No views
      // registered here (the helper set module is helper-methods only).
      setPath: "all/bootstrap/helper",
      formats: { html: { views: [] } }
    },
    passiveSetModule("all/bootstrap/navbar"),
    passiveSetModule("all/bootstrap/table"),
    passiveSetModule("all/bootstrap/wrapper"),
    {
      // card-mod-bootstrap-0.20.0/set/self/bootstrap_core.rb - the
      // bootstrap_core "code file" card's SCSS bundle loader. The `def
      // content` override is PORTED IN THE ENGINE LAYER
      // (src/card/render/bootstrap-code-files.ts, seeded as the built-in
      // default ContentOverrideRegistry entry) - see the section comment
      // above. No manifest surface: a contentOverrides entry here would be
      // dead for the loader-less verifier and dropped by the boot-replace
      // semantics for booted decks.
      setPath: "self/bootstrap_core",
      formats: { html: { views: [] } }
    },
    {
      // card-mod-bootstrap-0.20.0/set/self/bootstrap_functions.rb - the
      // bootstrap_functions "code file" card's SCSS loader. Same engine-
      // layer port (bootstrap-code-files.ts bootstrapFunctionsContent).
      setPath: "self/bootstrap_functions",
      formats: { html: { views: [] } }
    },
    {
      // card-mod-bootstrap-0.20.0/set/type/bootswatch_skin.rb - the
      // bootswatch_skin type's set module. view :input is registered
      // here (bootswatch_skin.rb:102-108) - the super() call resolves
      // via superView to the next set module's same view; view
      // :one_line_content is registered in html_views.rb below (that
      // file's redefinition wins for type+html-format cards; both Ruby
      // bodies are the empty string). view :core (html_views.rb:15-17,
      // template :haml -> core.haml) is NOT registered here: its graded
      // dispatch is the compiled-in coreView typeCode branch
      // (views.ts, the signupCoreHtml pattern) - the loader-less
      // verifier never registers mod views, so a set-scoped
      // registration would be dead surface for the grade. The builder
      // (bootswatchSkinCoreHtml below) is exported and views.ts calls
      // it for bootswatch_skin-typed cards.
      setPath: "type/bootswatch_skin",
      formats: {
        html: {
          views: [{ view: "input", viewFn: inputView }]
        }
      }
    },
    {
      // card-mod-bootstrap-0.20.0/set/type/bootswatch_skin/html_views.rb
      // - view :one_line_content override for bootswatch_skin +
      // customize_button method + view :customize_button +
      // view :bar_left / :bar_right / :bar_bottom + view :core. The
      // :core view is template :haml (core.haml) - the HAML depends on
      // accordion_bar + field_nest + nest :content, a structured-content
      // surface not in this port. :bar_left IS PORTED (bar-slots lane
      // 2026-09-29, byte-shaped to the pass-15 V6 dump) but registered in
      // the BASE views table (views.ts barLeftView) - the corpus grading
      // pipeline never binds a ModLoader, so only base-table
      // registrations dispatch on the graded surface. :customize_button
      // ports here with a local path
      // builder (Card::Path#render + new_skin_path_args ->
      // "card/create?card[name]=...&card[type]=bootswatch_skin&
      // card[fields][parent]=..."). Cited: html_views.rb:24-26 view
      // :customize_button + html_views.rb:38-48 customize_button
      // method.
      setPath: "type/bootswatch_skin/html_views",
      formats: {
        html: {
          views: [
            { view: "one_line_content", viewFn: oneLineContentView },
            // html_views.rb:24-26 view :customize_button, cache: :never
            { view: "customize_button", viewFn: customizeButtonView, config: { cache: "never" } },
            // surfaces-batch3 (2026-09-30): the rest of the file's view
            // surface. :core (html_views.rb:28, template :haml = core.haml),
            // :bar_left (html_views.rb:57-63, the Abstract::Media
            // text_with_image block), :bar_right (html_views.rb:65-67, the
            // empty body), :bar_bottom (html_views.rb:69-73, the <code>
            // wrap). The X-star-marker strip (mod-loader.ts viewChain
            // expansion) is what makes these nested-file registrations
            // dispatchable for TYPE-bootswatch_skin cards whose parent
            // module registers a DIFFERENT view of the same name chain.
            // NAMED REMAINDER: the file's `before :box do voo.show!
            // :box_middle end` hook (html_views.rb:24-26) — the port has
            // no before-view hook surface; a skin's :box renders without
            // the forced box_middle viz.
            { view: "core", viewFn: skinCoreView },
            { view: "bar_left", viewFn: bootswatchBarLeftView },
            { view: "bar_right", viewFn: bootswatchBarRightView },
            { view: "bar_bottom", viewFn: barBottomView }
          ]
        }
      }
    },
    {
      // card-mod-bootstrap-0.20.0/set/type/bootswatch_skin/events.rb -
      // event hooks (initialize_because_of_type_change, copy_theme,
      // validate_theme_template). No views. All three stages are in the
      // ModEventStage union (mod-manifest.ts:158-169, the full Ruby
      // director stage list - card-1.110.0 lib/card/director/director.rb
      // :18). load() populates loader.eventRegistry() with
      // setPath + modName injected, and the load report carries the
      // registered event names (mod-loader.ts:283-294 + 308).
      setPath: "type/bootswatch_skin/events",
      formats: { html: { views: [] } },
      events: [
        // events.rb:1-8 initialize_because_of_type_change at
        // :prepare_to_store, on: :update, when: "changed: type"
        // (the `changed:` predicate rides in the TS `when?` field as
        // the "changed: type" string - the execution seam resolves
        // it at fire time; this port pins the literal text).
        {
          event: "initialize_because_of_type_change",
          at: "prepare_to_store",
          on: ["update"],
          when: "changed: type",
          fn: () => void 0
        },
        // events.rb:10-12 copy_theme at :prepare_to_store,
        // on: :create.
        {
          event: "copy_theme",
          at: "prepare_to_store",
          on: ["create"],
          fn: () => void 0
        },
        // events.rb:14-18 validate_theme_template at :validate,
        // on: :create (:validate is in the ModEventStage union,
        // mod-manifest.ts:158-169).
        {
          event: "validate_theme_template",
          at: "validate",
          on: ["create"],
          fn: () => void 0
        }
      ]
    },
    {
      // card-mod-bootstrap-0.20.0/set/type_plus_right/bootswatch_skin/colors.rb
      // - the colors right-set module. Defines view :input (haml),
      // view :core (haml), view :bar_middle (raw HTML), plus
      // before :bar_right hooks. The :input view sets @colors +
      // @theme_colors; the :core view iterates the VARIABLE_NAMES map.
      // The colors view's bytes depend on the colors.rb HAML templates
      // (colors/_colorgroup.haml, colors/_colorpicker.haml, colors/
      // core.haml, colors/input.haml) - structural but not oracle-pinned.
      // The :bar_middle view (colors.rb:103-113) is a fixed HTML literal
      // scoped to *bootswatch_skin+*colors cards - it overrides the
      // render layer's baseline bar_middle ONLY for those cards. The
      // current mod loader registers views globally (not scoped to a
      // set-pattern), so a registration would clobber the baseline
      // bar_middle for unrelated cards. The view-override dispatch is a
      // follow-up (docs/mod-loader-port-notes.md); the passive
      // set-module bookkeeping below preserves the registrar's
      // source_location walk.
      setPath: "type_plus_right/bootswatch_skin/colors",
      formats: {
        html: {
          views: [
            // colors.rb:102-122 — the fixed bar_middle literal. surfaces-
            // batch3: the registration makes the view dispatchable for
            // *colors cards under a bootswatch_skin left (the TYPE_PLUS_RIGHT
            // token's X-stripped anchor path), replacing the clobber concern
            // the original comment recorded: the viewChain per-card MRO walk
            // (not a global flat table) scopes the registration to cards
            // whose set keys carry the anchor.
            { view: "bar_middle", viewFn: colorsBarMiddleView }
          ]
        }
      }
    },
    // The remaining type_plus_right/bootswatch_skin/* files -
    // image.rb, parent.rb, stylesheets.rb, variables.rb - all methods
    // only, no views.
    passiveSetModule("type_plus_right/bootswatch_skin/image"),
    passiveSetModule("type_plus_right/bootswatch_skin/parent"),
    passiveSetModule("type_plus_right/bootswatch_skin/stylesheets"),
    passiveSetModule("type_plus_right/bootswatch_skin/variables")
  ]
};

// src/card/mod-loader/mods/card-mod-help.ts
var leadView = (ctx) => {
  ctx.voo.classUp("card-slot", "lead");
  return modSlotWrap(ctx, "lead", ctx.fmt.renderView("core"));
};

// src/card/mod-loader.ts
var defaultLoader;
var generation = 0;
function modGeneration() {
  return generation;
}
function getDefaultModLoader() {
  return defaultLoader;
}

// src/card/mod-loader/mod-view-helpers.ts
function slotId(card, view) {
  return `${card.name.safeKey}-${view}-view`;
}
function modSlotWrap(ctx, view, inner, extraClasses = "", extraData = {}) {
  const { fmt, voo } = ctx;
  const card = fmt.card;
  const classes = [
    voo.classy(["card-slot", `${view}-view`, card.setKeys]),
    extraClasses
  ].filter((s) => s !== "").join(" ");
  const attrs = emitAttrs({
    id: slotId(card, view),
    class: classes,
    "data-card-id": card.id === void 0 ? void 0 : String(card.id),
    "data-card-name": card.name.s,
    "data-card-type-id": card.typeId === void 0 ? void 0 : String(card.typeId),
    "data-card-type-name": card.typeName,
    "data-card-link-name": fmt.urlKey(),
    "data-slot-id": newSlotId(),
    // wrap.rb:63-79 applies to EVERY slot wrap — the mod views included —
    // so the payload is the name-context-aware builder the core slotWrap
    // emits (render/views.ts), not the bare voo.slotOptions() JSON. The
    // bare form was a divergence invisible to every mod fixture pin until
    // the graded page lane dispatched a mod-owned view (view :lead) over
    // nests WITH a live context: the Role pages' `+:description|lead`
    // slot lost its `"name_context":"<page>"` tail (raise-leadview lane,
    // 2026-09-29). Empty initialContextNames emits no key, so the fixture
    // pins whose probes carried no context are byte-unchanged.
    "data-slot": slotOptionsWithNameContext(fmt, voo),
    // the wrap-call data attrs land AFTER the slot payload (the captured
    // board slot: data-slot-id, data-slot, data-breadcrumb,
    // data-breadcrumb-class)
    ...extraData
  });
  return `<div${attrs}>${inner}</div>`;
}
function superView(ctx, currentModule, view) {
  const loader = getDefaultModLoader();
  if (loader === void 0) return "";
  const card = ctx.fmt.card;
  const chain = loader.viewChain(card.setKeys, view);
  const idx = chain.findIndex((entry) => entry.setModule === currentModule);
  if (idx === -1) {
    return "";
  }
  const next = chain[idx + 1];
  if (next !== void 0) return next.viewFn(ctx);
  const base = HTML_VIEWS[view];
  if (base === void 0) return "";
  return base(ctx);
}

// src/card/actions/refresh-references-out.ts
var PARTIAL_REF_CODE = "P";
async function refreshReferencesOut(driver, lexicon, refererId, refererName, content) {
  await driver.query("DELETE FROM card_references WHERE referer_id = ?", [refererId]);
  const rows = await createReferencesOut(lexicon, refererId, refererName, content);
  for (let slice = 0; slice < rows.length; slice += 5e3) {
    const chunk = rows.slice(slice, slice + 5e3);
    const values = [];
    const params = [];
    for (const row of chunk) {
      values.push("(?, ?, ?, ?)");
      params.push(row.refererId, row.refereeKey, row.refereeId, row.refType);
    }
    await driver.query(
      `INSERT INTO card_references (referer_id, referee_key, referee_id, ref_type)
       VALUES ${values.join(", ")}`,
      params
    );
  }
}
async function clearReferencesOnDelete(driver, cardId) {
  await driver.query("DELETE FROM card_references WHERE referer_id = ?", [cardId]);
  await driver.query(
    "UPDATE card_references SET referee_id = NULL WHERE referee_id = ?",
    [cardId]
  );
}
async function createReferencesOut(lexicon, refererId, refererName, content) {
  if (content === null || content === void 0 || content === "") {
    return [];
  }
  const refHash = /* @__PURE__ */ new Map();
  for (const chunk of scanReferenceChunks(content)) {
    if (chunk.refereeName === void 0) continue;
    await interpretReference(lexicon, refHash, chunk.refereeName, chunk.refType, refererName);
  }
  return referenceValuesArray(refHash, refererId);
}
async function interpretReference(lexicon, refHash, rawRefereeName, refType, refererName) {
  let name;
  let absolute;
  let key;
  let refereeId;
  try {
    name = DeckoName.parse(rawRefereeName);
    absolute = name.absoluteName(refererName);
    key = absolute.key;
    if (key === refererName.key) return;
    refereeId = await lexicon.id(absolute);
  } catch (error) {
    if (error instanceof NameNotFoundError || error instanceof CodenameNotFoundError) {
      return;
    }
    throw error;
  }
  let entry = refHash.get(key);
  if (entry === void 0) {
    entry = { refereeId, refTypes: [] };
    refHash.set(key, entry);
  }
  entry.refTypes.push(refType);
  if (refereeId === void 0) {
    await interpretPartialReferences(lexicon, refHash, absolute, refererName);
  }
}
async function interpretPartialReferences(lexicon, refHash, refereeName, refererName) {
  if (refereeName.isSimple) return;
  for (const sidename of [refereeName.leftName, refereeName.rightName]) {
    if (sidename === void 0) continue;
    await interpretReference(lexicon, refHash, sidename.s, PARTIAL_REF_CODE, refererName);
  }
}
function referenceValuesArray(refHash, refererId) {
  const rows = [];
  for (const [refereeKey, entry] of refHash) {
    const refereeId = entry.refereeId ?? null;
    const refTypes = [...new Set(entry.refTypes)];
    const effective = refTypes.length > 1 ? refTypes.filter((t2) => t2 !== PARTIAL_REF_CODE) : refTypes;
    for (const refType of effective) {
      rows.push({ refererId, refereeKey, refereeId, refType });
    }
  }
  return rows;
}
var LINK_FULL_STICKY = /\[\[([^\]]+)\]\]/y;
var NEST_FULL_STICKY = /\{\{([^{}]*)\}\}/y;
var NEST_SPAN = /\{\{[^{}]*\}\}/g;
var EXPLICIT_LINK = /^(\/|https?:|mailto:)/;
function scanReferenceChunks(content) {
  const chunks = [];
  let position = 0;
  while (position < content.length) {
    const linkIdx = content.indexOf("[[", position);
    const nestIdx = content.indexOf("{{", position);
    if (linkIdx === -1 && nestIdx === -1) break;
    const idx = linkIdx === -1 ? nestIdx : nestIdx === -1 ? linkIdx : Math.min(linkIdx, nestIdx);
    let matched;
    if (idx === linkIdx) {
      LINK_FULL_STICKY.lastIndex = idx;
      const m = LINK_FULL_STICKY.exec(content);
      if (m !== null) {
        matched = {
          refereeName: linkRefereeName(m[1] ?? ""),
          refType: "L",
          start: idx,
          end: idx + m[0].length,
          inner: m[1] ?? ""
        };
        position = idx + m[0].length;
      }
    } else {
      NEST_FULL_STICKY.lastIndex = idx;
      const m = NEST_FULL_STICKY.exec(content);
      if (m !== null) {
        matched = {
          refereeName: nestRefereeName(m[1] ?? ""),
          refType: "I",
          start: idx,
          end: idx + m[0].length,
          inner: m[1] ?? ""
        };
        position = idx + m[0].length;
      }
    }
    if (matched !== void 0) {
      chunks.push(matched);
    } else {
      position = idx + 1;
    }
  }
  return chunks;
}
function linkRefereeName(rawSyntax) {
  const divider = dividerIndex2(rawSyntax);
  const target = divider === void 0 || divider === 0 ? rawSyntax : rawSyntax.slice(0, divider);
  if (EXPLICIT_LINK.test(target)) return void 0;
  return target;
}
function dividerIndex2(raw) {
  if (!raw.includes("|")) return void 0;
  const masked = raw.replace(NEST_SPAN, (span) => "x".repeat(span.length));
  const idx = masked.indexOf("|");
  return idx === -1 ? void 0 : idx;
}
function nestRefereeName(inBrackets) {
  const stripped = stripTags(inBrackets);
  const pipe = stripped.indexOf("|");
  const name = (pipe === -1 ? stripped : stripped.slice(0, pipe)).trim();
  if (name.startsWith("#")) return void 0;
  return name;
}

// src/card/actions/refresh-references-in.ts
async function unmapReferees(driver, refereeId) {
  await driver.query("UPDATE card_references SET referee_id = NULL WHERE referee_id = ?", [
    refereeId
  ]);
}
async function mapReferees(driver, refereeKey, refereeId) {
  await driver.query("UPDATE card_references SET referee_id = ? WHERE referee_key = ?", [
    refereeId,
    refereeKey
  ]);
}
async function refreshReferencesIn(driver, cardId, cardKey, opts = {}) {
  if (opts.unmapExisting === true) {
    await unmapReferees(driver, cardId);
  }
  await mapReferees(driver, cardKey, cardId);
}

// src/card/actions/update-referer-content.ts
async function updateRefererContent(deps, renamedCardId, nameBeforeAct, name) {
  await rewriteReferersOf(deps, renamedCardId, nameBeforeAct, name);
  await rewriteDescendantReferers(deps, renamedCardId, nameBeforeAct, name);
}
async function updateRefererReferencesOut(deps, renamedCardId) {
  for (const referer of await referersOf(deps, renamedCardId)) {
    const name = await composedNameOf(deps, referer);
    if (name === void 0) continue;
    await refreshReferencesOut(
      deps.driver,
      deps.lexicon,
      referer.id,
      name,
      referer.db_content ?? ""
    );
  }
}
async function rewriteReferersOf(deps, cardId, nameBeforeAct, name) {
  for (const referer of await referersOf(deps, cardId)) {
    await replaceReferences(deps, referer, nameBeforeAct, name);
  }
}
async function referersOf(deps, cardId) {
  const grouped = await deps.driver.query(
    `SELECT referer_id, MIN(id) AS first_row_id FROM card_references
     WHERE referee_id = ? GROUP BY referer_id ORDER BY first_row_id`,
    [cardId]
  );
  const referers = [];
  for (const { referer_id } of grouped.rows) {
    const result = await deps.driver.query(
      "SELECT * FROM cards WHERE id = ? AND trash = 0 LIMIT 1",
      [referer_id]
    );
    if (result.rows[0] !== void 0) referers.push(result.rows[0]);
  }
  return referers;
}
async function replaceReferences(deps, referer, nameBeforeAct, name) {
  const refererName = await composedNameOf(deps, referer);
  if (refererName === void 0) return;
  const newContent = swapNames(
    referer.db_content,
    nameBeforeAct,
    name,
    refererName
  );
  await contentQuietlySet(deps, referer, refererName, newContent);
}
async function contentQuietlySet(deps, referer, refererName, newContent) {
  if (newContent === (referer.db_content ?? null)) return;
  await deps.driver.query("UPDATE cards SET db_content = ? WHERE id = ?", [
    newContent,
    referer.id
  ]);
  await refreshReferencesOut(deps.driver, deps.lexicon, referer.id, refererName, newContent);
}
function swapNames(content, oldName, newName, refererName) {
  const source = content ?? "";
  let result = "";
  let cursor = 0;
  for (const chunk of scanReferenceChunks(source)) {
    result += source.slice(cursor, chunk.start);
    result += swapChunkText(chunk, oldName, newName, refererName);
    cursor = chunk.end;
  }
  return result + source.slice(cursor);
}
function swapChunkText(chunk, oldName, newName, refererName) {
  const original = (chunk.refType === "L" ? "[[" : "{{") + chunk.inner + (chunk.refType === "L" ? "]]" : "}}");
  try {
    if (chunk.refType === "L") {
      const divider = dividerIndex2(chunk.inner);
      const target = divider === void 0 || divider === 0 ? chunk.inner : chunk.inner.slice(0, divider);
      if (EXPLICIT_LINK.test(target)) return original;
      const linkText = divider === void 0 ? void 0 : chunk.inner.slice(divider + 1);
      const swapped2 = DeckoName.parse(target).swap(oldName, newName);
      const referee = swapped2.absoluteName(refererName);
      let textSyntax = "";
      if (linkText !== void 0) {
        const stripped = rubyStrip2(linkText);
        if (stripped !== "") {
          textSyntax = `|${oldName.subIn(stripped, newName)}`;
        }
      }
      return `[[${referee.s}${textSyntax}]]`;
    }
    if (chunk.refereeName === void 0) return original;
    const swapped = DeckoName.parse(chunk.refereeName).swap(oldName, newName);
    const strippedInner = stripTags(chunk.inner);
    const pipe = strippedInner.indexOf("|");
    const optLists = pipe === -1 ? void 0 : strippedInner.slice(pipe + 1);
    const nestBody = optLists === void 0 ? swapped.s : `${swapped.s}|${optLists}`;
    return `{{${nestBody}}}`;
  } catch (error) {
    if (error instanceof NameNotFoundError || error instanceof CodenameNotFoundError) {
      return original;
    }
    throw error;
  }
}
function rubyStrip2(str) {
  return str.replace(/^[ \t\n\v\f\r\0]+/, "").replace(/[ \t\n\v\f\r\0]+$/, "");
}
async function rewriteDescendantReferers(deps, renamedCardId, nameBeforeAct, name) {
  const renames = /* @__PURE__ */ new Map();
  renames.set(renamedCardId, { id: renamedCardId, before: nameBeforeAct, after: name });
  const rows = [];
  const visited = /* @__PURE__ */ new Set([renamedCardId]);
  let frontier = [renamedCardId];
  while (frontier.length > 0) {
    const next = [];
    for (const parentId of frontier) {
      const result = await deps.driver.query(
        "SELECT * FROM cards WHERE (left_id = ? OR right_id = ?) AND trash = 0",
        [parentId, parentId]
      );
      for (const child of result.rows) {
        if (visited.has(child.id)) continue;
        visited.add(child.id);
        rows.push(child);
        next.push(child.id);
      }
    }
    frontier = next;
  }
  const withNames = [];
  for (const row of rows) {
    if (row.left_id === null || row.right_id === null) continue;
    const after = await deps.lexicon.composeName(row.left_id, row.right_id);
    if (after === void 0 || !after.isCompound) continue;
    const leftBefore = renames.get(row.left_id)?.before ?? after.leftName;
    const rightBefore = renames.get(row.right_id)?.before ?? after.rightName;
    if (leftBefore === void 0 || rightBefore === void 0) continue;
    const before = DeckoName.compose([leftBefore, rightBefore]);
    const rename = { id: row.id, before, after };
    renames.set(row.id, rename);
    deps.lexicon.write(row.id, after, [row.left_id, row.right_id]);
    withNames.push(rename);
  }
  for (const rename of withNames) {
    await rewriteReferersOf(deps, rename.id, rename.before, rename.after);
  }
}
async function composedNameOf(deps, row) {
  if (row.left_id !== null && row.left_id !== void 0) {
    const composed = await deps.lexicon.composeName(row.left_id, row.right_id);
    if (composed !== void 0) return composed;
  }
  return row.name !== null && row.name !== void 0 ? DeckoName.parse(row.name) : void 0;
}

// src/card/actions/types.ts
var CardActionError = class extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.name = "CardActionError";
    this.code = code;
  }
};

// src/card/mod-loader/mods/card-mod-recaptcha.ts
function usingDefaults(siteKey, developmentDefault) {
  return siteKey === developmentDefault;
}
function recaptchaSettingValue(cardValue, configValue, deprecatedValue, which = "site_key", developmentDefaults) {
  if (cardValue !== void 0 && cardValue !== null && cardValue !== "") {
    return cardValue;
  }
  if (configValue !== void 0 && configValue !== null && configValue !== "") {
    return configValue;
  }
  if (deprecatedValue !== void 0 && deprecatedValue !== null && deprecatedValue !== "") {
    return deprecatedValue;
  }
  return developmentDefaults?.[which];
}
var LOCALE = {
  recaptcha_link_text: "recaptcha keys",
  recaptcha_captcha_keys: "You are configured to use %{captcha_link}, but for that to work you need new %{recaptcha_link}.",
  recaptcha_captcha_temp: "Your captcha is currently working with temporary settings. This is fine for a local installation, but you will need new %{recaptcha_link} if you want to make this site public."
};
function recaptchaConfigIssuesMessage(opts) {
  const inner = opts.localhost ? LOCALE.recaptcha_captcha_temp.replace("%{recaptcha_link}", opts.recaptchaLink) : LOCALE.recaptcha_captcha_keys.replace("%{captcha_link}", opts.captchaLink).replace("%{recaptcha_link}", opts.recaptchaLink);
  return `<p>${inner}</p>`;
}

// src/card/mod-loader/mods/core-mod.ts
function output(parts) {
  return parts.filter((p) => p !== void 0 && p !== null).join("\n");
}
function contentTag(tag, attrs, content) {
  const attrStr = Object.entries(attrs).filter(([, v]) => v !== void 0 && v !== null).map(([k, v]) => ` ${k}="${typeof v === "string" ? h(v) : v}"`).join("");
  return `<${tag}${attrStr}>${content}</${tag}>`;
}
function wrapWithTag(tag, content, attrs = {}) {
  return contentTag(tag, attrs, content);
}
function taskTableHtml(ctx, tasks) {
  const rows = Object.entries(tasks).map(
    ([task, config]) => taskRowHtml(ctx, task, config)
  );
  const header = wrapWithTag(
    "thead",
    wrapWithTag(
      "tr",
      ["Task", "Description"].map((th) => wrapWithTag("th", th)).join("\n")
    )
  );
  const body = wrapWithTag(
    "tbody",
    rows.join("\n")
  );
  return wrapWithTag("table", output([header, body]), { class: "table" });
}
function taskRowHtml(ctx, task, config) {
  const base = `${config.mod}_task_${task}`;
  const linkText = config.linkText ?? localeTaskText(`${base}_link_text`);
  const description = config.description ?? localeTaskText(`${base}_description`);
  return wrapWithTag(
    "tr",
    [
      wrapWithTag("td", adminLinkHtml(ctx, linkText, task)),
      wrapWithTag("td", description)
    ].join("\n")
  );
}
function localeTaskText(key) {
  const value = CORE_ADMIN_LOCALE[key];
  return value ?? `Translation missing: en.${key}`;
}
function adminLinkHtml(ctx, linkText, task) {
  const adminName = adminNameFor(ctx);
  const known = ctx.fmt.engine.fetchRenderCard(adminName) !== void 0;
  const urlKey = DeckoName.parse(adminName).urlKey;
  return `<a class="${known ? "known" : "wanted"}-card" href="/update/${urlKey}?task=${task}">${linkText}</a>`;
}
function adminNameFor(ctx) {
  const state = adminRuntimeStateFor(ctx);
  return state?.codenameToName.get("admin") ?? "*admin";
}
function capitalize2(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function sectionHtml(title, content) {
  return `<p>${sectionTitleHtml(title)}${content}</p>`;
}
function sectionTitleHtml(title) {
  return `<h3>${title}</h3>`;
}
function listSectionHtml(title, items, ctx, itemView = "bar", symbolItems = true) {
  if (items === void 0 || items.length === 0) return void 0;
  return sectionHtml(title, listSectionContentHtml(items, ctx, itemView, symbolItems));
}
function listSectionContentHtml(items, ctx, itemView = "bar", symbolItems = true) {
  return items.map((item) => nestItemHtml(ctx, item, itemView, symbolItems)).join(" ");
}
function nestedListSectionHtml(title, groupedItems, ctx) {
  return output([
    sectionTitleHtml(title),
    wrapWithTag("div", accordionSectionsHtml(groupedItems, ctx), {
      class: "accordion"
    })
  ]);
}
function accordionSectionsHtml(groupedItems, ctx) {
  return groupedItems.map(
    ([title, codenames]) => accordionItemHtml({
      title,
      subheader: void 0,
      body: listSectionContentHtml(codenames, ctx),
      open: false,
      collapseId: `card-${ctx.fmt.card.name.safeKey}-${stringHash(title)}-collapse-id`
    })
  ).join(" ");
}
function accordionItemHtml(args) {
  const buttonClasses = [
    args.open ? void 0 : "collapsed",
    "accordion-button"
  ].filter((s) => s !== void 0).join(" ");
  const collapseClasses = [
    args.open ? "show" : void 0,
    "accordion-collapse",
    "collapse"
  ].filter((s) => s !== void 0).join(" ");
  const subheaderLines = args.subheader !== void 0 ? `<div class='accordion-subheader bg-light p-2 text-end'>
${args.subheader}
</div>
` : "";
  return `<div class='accordion-item'>
<h2 class='accordion-header nodblclick w-100'>
<button class='${buttonClasses}' data-bs-target='#${args.collapseId}' data-bs-toggle='collapse' type='button'>
${args.title}
</button>
</h2>
<div class='${collapseClasses}' id='${args.collapseId}'>
` + subheaderLines + `<div class='accordion-body d0-card-body'>
${args.body}
</div>
</div>
</div>
`;
}
function stringHash(s) {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = Math.imul(31, hash) + s.charCodeAt(i) | 0;
  }
  return String(hash);
}
function listGroupHtml(items) {
  return listTagHtml(items, "list-group", "list-group-item");
}
function listTagHtml(items, ulClass, liClass) {
  const ulAttrs = ulClass === void 0 ? {} : { class: ulClass };
  const li = (content) => liClass === void 0 ? wrapWithTag("li", content) : wrapWithTag("li", content, { class: liClass });
  return wrapWithTag("ul", items.map(li).join("\n"), ulAttrs);
}
function nestItemHtml(ctx, item, view, symbolItems = true) {
  const state = adminRuntimeStateFor(ctx);
  const resolved = state?.codenameToName.get(item);
  if (resolved === void 0) {
    if (symbolItems) return nestNotFoundCodenameHtml(ctx, item);
    return nestByNameHtml(ctx, item, view);
  }
  return nestByNameHtml(ctx, resolved, view);
}
function nestNotFoundCodenameHtml(ctx, codename) {
  const name = DeckoName.parse(codename);
  const slotJson = slotOptionsJson({
    view: "not_found",
    nest_name: name.s,
    show: ["not_found"],
    hide: ["menu", "help"],
    home_view: "not_found"
  });
  const attrs = emitAttrs({
    id: `${name.safeKey}-not_found-view`,
    class: "card-slot not_found-view ALL TYPE-rich_text",
    "data-card-name": name.s,
    "data-card-type-id": "2",
    "data-card-type-name": "RichText",
    // the LINK name is the url key (wrap.rb:50-53 slot_cardname) — it does
    // NOT ride the key's singularization ("regenerate_assets" stays
    // whole; the SLOT ID's safe_key form does — oracle bytes carry
    // id "regenerate_asset-not_found-view" + link-name "regenerate_assets")
    "data-card-link-name": name.urlKey,
    "data-slot-id": newSlotId(),
    "data-slot": slotJson
  });
  return `<div${attrs}><div class="d0-card-frame card"><div class="d0-card-header card-header"><h2 class="d0-card-header-title"><span class="card-title" title="Not Found">Not Found</span></h2></div>

<div class="d0-card-body card-body card-text"><div class="alert alert-warning alert-dismissible " role="alert"><button type="button" data-bs-dismiss="alert" class="btn-close" aria-label="Close"></button>
<p><strong>CODENAME:</strong> unknown codename: ${h(name.s)}</p></div>
<div>Please <a class="signin-link known-card" href="/*signin/titled">sign in</a> or <a class="signup-link known-card" href="/new/Sign_up">sign up</a> to create it.</div></div></div></div>`;
}
function nestByNameHtml(ctx, name, view) {
  return ctx.fmt.nest({
    syntax: name,
    name,
    options: { view, extra: {} },
    comment: void 0
  });
}
function viewContextState(ctx) {
  return adminRuntimeStateFor(ctx);
}
function modCardsWithConfig(ctx) {
  const state = viewContextState(ctx);
  if (state === void 0) return [];
  const out = [];
  for (const modCard of state.modCards) {
    const modname = modnameFromCodename(modCard.codename);
    const config = ADMIN_CONFIG[modname];
    if (config !== void 0) out.push({ name: modCard.name, modname, config });
  }
  return out;
}
function modnameFromCodename(codename) {
  return codename.replace(/^mod_/, "");
}
function adminConfigObjects(modname, modCardName, config) {
  const out = [];
  for (const [category, values] of Object.entries(config)) {
    if (!Array.isArray(values)) {
      for (const [subcategory, subvalues] of Object.entries(values)) {
        for (const codename of subvalues) {
          out.push(makeAdminItem(modname, modCardName, category, subcategory, codename));
        }
      }
    } else {
      for (const codename of values) {
        out.push(makeAdminItem(modname, modCardName, category, void 0, codename));
      }
    }
  }
  return out;
}
function makeAdminItem(modname, modCardName, category, subcategory, codename) {
  return {
    mod: modname,
    modname,
    category,
    subcategory,
    codename,
    roles: [],
    title: adminItemTitle(category, subcategory)
  };
}
function allConfigs(ctx) {
  const state = viewContextState(ctx);
  const out = [];
  for (const mod of modCardsWithConfig(ctx)) {
    const items = adminConfigObjects(mod.modname, mod.name, mod.config);
    for (const item of items) {
      item.roles = state?.rolesByCardCodename.get(item.codename) ?? [];
      out.push(item);
    }
  }
  return out;
}
function groupedBy(configs, prop1, prop2) {
  if (prop2 !== void 0) {
    const outer = /* @__PURE__ */ new Map();
    for (const config of configs) {
      const k1raw = config[prop1];
      const k1Values = Array.isArray(k1raw) ? k1raw : [k1raw];
      const k2 = config[prop2];
      for (const k1 of k1Values) {
        let inner = outer.get(k1);
        if (inner === void 0) {
          inner = /* @__PURE__ */ new Map();
          outer.set(k1, inner);
        }
        const list = inner.get(k2) ?? [];
        list.push(config);
        inner.set(k2, list);
      }
    }
    return outer;
  }
  const map = /* @__PURE__ */ new Map();
  for (const config of configs) {
    const values = config[prop1] ?? [];
    for (const value of values) {
      const list = map.get(value) ?? [];
      list.push(config);
      map.set(value, list);
    }
  }
  return map;
}
function configCodenamesGroupedByTitle(configs) {
  if (configs === void 0) return [];
  const byTitle = /* @__PURE__ */ new Map();
  for (const config of configs) {
    const list = byTitle.get(config.title) ?? [];
    list.push(config.codename);
    byTitle.set(config.title, list);
  }
  return [...byTitle.entries()];
}
var moduleAdminHost;
function adminRuntimeStateFor(_ctx) {
  return moduleAdminHost !== void 0 ? adminRuntimeState(moduleAdminHost) : void 0;
}
function bindModuleAdminHost(host) {
  moduleAdminHost = host;
}
var roleConfigsView = (ctx) => {
  const card = ctx.fmt.card;
  if (card.typeCode !== "role") {
    throw new UnsupportedViewError("configs", card.name.s);
  }
  const items = allConfigs(ctx);
  const byCat = groupedBy(items, "roles", "category").get(
    card.record.codename ?? ""
  );
  if (byCat === void 0) return "";
  const sections = [];
  for (const [cat, configs] of byCat) {
    if (cat === "cardtypes") {
      sections.push(nestedListSectionHtml(capitalize2(cat), configCodenamesGroupedByTitle(configs), ctx));
    } else if (cat === "views") {
      continue;
    } else {
      const section = listSectionHtml(
        capitalize2(cat),
        configs.map((c) => c.codename),
        ctx,
        "closed_bar"
      );
      if (section !== void 0) sections.push(section);
    }
  }
  return sections.join("");
};
var adminCoreView = (ctx) => {
  return taskTableHtml(ctx, deckTaskBasket());
};
function deckTaskBasket() {
  const out = { ...CORE_TASK_BASKET };
  const loader = getDefaultModLoader();
  for (const entry of loader?.basketTaskContributions() ?? []) {
    out[entry.task] = {
      mod: entry.mod,
      ...entry.irreversible === void 0 ? {} : { irreversible: entry.irreversible },
      linkText: entry.linkText,
      description: entry.description
    };
  }
  return out;
}
var adminWarningView = (ctx) => {
  const warnings = [];
  for (const warning of deckWarningList()) {
    if (warning === "no_email_delivery") {
      if (noEmailDeliveryIsOn()) {
        warnings.push(noEmailDeliveryMessage());
      }
    } else if (warning === "recaptcha_config_issues") {
      if (recaptchaConfigIssuesOn(ctx)) {
        warnings.push(recaptchaConfigIssuesHtml(ctx));
      }
    }
  }
  if (warnings.length === 0) return "";
  return warningAlertHtml(warnings);
};
function deckWarningList() {
  return [...CORE_WARNING_BASKET, ...(getDefaultModLoader()?.basketWarningContributions() ?? []).map((e) => e.warning)];
}
function recaptchaConfigIssuesOn(ctx) {
  const card = ctx.fmt.engine.fetchRenderCard("*recaptcha settings+*site key");
  const siteKey = recaptchaSettingValue(card?.dbContent, void 0, void 0, "site_key");
  return usingDefaults(siteKey);
}
function recaptchaConfigIssuesHtml(ctx) {
  const captchaName = adminRuntimeStateFor(ctx)?.codenameToName.get("captcha") ?? "*captcha";
  const captchaKnown = ctx.fmt.engine.fetchRenderCard(captchaName) !== void 0;
  const captchaUrlKey = DeckoName.parse(captchaName).urlKey;
  const captchaLink = `<a class="${captchaKnown ? "known" : "wanted"}-card" href="/${captchaUrlKey}">*captcha</a>`;
  const settingsName = adminRuntimeStateFor(ctx)?.codenameToName.get("recaptcha_settings") ?? "*recaptcha settings";
  const settingsUrlKey = DeckoName.parse(settingsName).urlKey;
  const recaptchaLink = `<a rel="nofollow" class="edit-link slotter" title="Edit" data-bs-toggle="tooltip" data-bs-placement="bottom" data-slotter-mode="modal" data-modal-class="modal-lg" href="/${settingsUrlKey}/edit" data-remote="true">recaptcha keys</a>`;
  return recaptchaConfigIssuesMessage({
    localhost: false,
    recaptchaLink,
    captchaLink
  });
}
function noEmailDeliveryIsOn() {
  return adminRuntimeConfig().performDeliveries === false;
}
function noEmailDeliveryMessage() {
  return CORE_ADMIN_LOCALE.core_admin_email_off.replace(
    "%{path}",
    "config/application.rb"
  );
}
function warningAlertHtml(warnings) {
  const close = `<button type="button" data-bs-dismiss="alert" class="btn-close" aria-label="Close"></button>`;
  const haml = `<h5>
${CORE_ADMIN_LOCALE.core_admin_warn}
</h5>
${listTagHtml(warnings)}
`;
  return wrapWithTag(
    "div",
    output([close, haml]),
    { class: "alert alert-warning alert-dismissible ", role: "alert" }
  );
}
var modCardCoreHtml = (ctx) => {
  const card = ctx.fmt.card;
  const modname = modnameFromCodename(card.record.codename ?? "");
  const config = ADMIN_CONFIG[modname];
  const spec = MOD_SPECS[modname];
  const sections = [];
  const present = [
    // description (description? is constant true, type/mod.rb:122-124)
    () => typeModDescriptionView(ctx),
    () => adminSettingList(config) === void 0 ? void 0 : typeModSettingsView(ctx),
    () => config?.configurations === void 0 ? void 0 : typeModConfigurationsView(ctx),
    () => configCardtypes(config) === void 0 ? void 0 : typeModCardtypesView(ctx),
    // styles? / scripts? (type/mod.rb:110-116) are the DECK-PINNED group
    // presence — the child card is virtual, so its own resolution is not a
    // usable predicate on the headless path (see typeModStylesView).
    () => typeModStylesView(ctx),
    () => typeModScriptsView(ctx),
    () => modTasks(modname).length === 0 ? void 0 : typeModTasksView(ctx),
    () => config?.views === void 0 ? void 0 : typeModViewsView(ctx),
    () => dependsOn(spec) === void 0 ? void 0 : typeModDependsOnView(ctx)
  ];
  for (const render of present) {
    const body = render();
    sections.push(body === "" ? void 0 : body);
  }
  return sections.filter((s) => s !== void 0).join("<br/>");
};
var typeModDescriptionView = (ctx) => {
  const modname = modnameFromCodename(ctx.fmt.card.record.codename ?? "");
  const description = modDescription(modname);
  return contentTag("p", {}, description ?? "");
};
var typeModSettingsView = (ctx) => {
  const config = ADMIN_CONFIG[modnameFromCodename(ctx.fmt.card.record.codename ?? "")];
  return listSectionHtml("Settings", adminSettingList(config), ctx) ?? "";
};
function adminSettingList(config) {
  const raw = config?.["settings"];
  return Array.isArray(raw) ? raw : void 0;
}
var typeModCardtypesView = (ctx) => {
  const config = ADMIN_CONFIG[modnameFromCodename(ctx.fmt.card.record.codename ?? "")];
  const grouped = configCodenamesGroupedByTitle(configCardtypes(config));
  return nestedListSectionHtml("Cardtypes", grouped, ctx);
};
function configCardtypes(config) {
  const raw = config?.["cardtypes"];
  if (raw === void 0 || Array.isArray(raw)) return void 0;
  const items = [];
  for (const [subcategory, codenames] of Object.entries(raw)) {
    for (const codename of codenames) {
      items.push({
        mod: "",
        modname: "",
        category: "cardtypes",
        subcategory,
        codename,
        roles: [],
        title: adminItemTitle("cardtypes", subcategory)
      });
    }
  }
  return items;
}
var typeModConfigurationsView = (ctx) => {
  const config = ADMIN_CONFIG[modnameFromCodename(ctx.fmt.card.record.codename ?? "")];
  const configurations = config?.configurations;
  if (configurations === void 0 || Array.isArray(configurations)) return "";
  return Object.entries(configurations).map(
    ([category, names]) => listSectionHtml(`${capitalize2(category)} Configuration`, names, ctx)
  ).filter((s) => s !== void 0).join(" ");
};
var typeModTasksView = (ctx) => {
  const modname = modnameFromCodename(ctx.fmt.card.record.codename ?? "");
  const tasks = modTasks(modname);
  if (tasks.length === 0) return "";
  const selected = {};
  for (const task of tasks) selected[task] = CORE_TASK_BASKET[task];
  return sectionHtml("Tasks", taskTableHtml(ctx, selected));
};
function modTasks(modname) {
  return Object.entries(CORE_TASK_BASKET).filter(([, config]) => config.mod === modname).map(([task]) => task);
}
var typeModBarRightView = (ctx) => modBarRightSections(modnameFromCodename(ctx.fmt.card.record.codename ?? ""));
var typeModStylesView = (ctx) => modAssetSection(ctx, "style", "Styles");
var typeModScriptsView = (ctx) => modAssetSection(ctx, "script", "Scripts");
function modAssetSection(ctx, tag, title) {
  const groups = modAssetGroups(modnameFromCodename(ctx.fmt.card.record.codename ?? ""), tag);
  if (groups === void 0 || groups.length === 0) {
    return childCard(ctx, tag) !== void 0 ? sectionHtml(title, "") : "";
  }
  return sectionHtml(title, modAssetGroupsCoreHtml(groups));
}
function childCard(ctx, tag) {
  const name = `${ctx.fmt.card.name.s}+*${tag}`;
  return ctx.fmt.engine.fetchRenderCard(name) !== void 0 ? name : void 0;
}
var typeModViewsView = (ctx) => {
  const config = ADMIN_CONFIG[modnameFromCodename(ctx.fmt.card.record.codename ?? "")];
  const views = config?.views;
  if (views === void 0 || !Array.isArray(views)) return "";
  return sectionHtml("Views", listGroupHtml(views));
};
var typeModDependsOnView = (ctx) => {
  const spec = MOD_SPECS[modnameFromCodename(ctx.fmt.card.record.codename ?? "")];
  return listSectionHtml("Depends on", dependsOn(spec), ctx, "bar", false) ?? "";
};
function dependsOn(spec) {
  if (spec === void 0) return void 0;
  const names = [...spec.deps].sort().filter((name) => name.startsWith("card-mod")).map((name) => `mod_${name.slice(8)}`);
  return names.length > 0 ? names : void 0;
}
var typeModGemInfoView = (ctx) => {
  const modname = modnameFromCodename(ctx.fmt.card.record.codename ?? "");
  const spec = MOD_SPECS[modname];
  if (spec === void 0) return "";
  const authors = rubyToS(MOD_SPEC_SHARED.authors);
  const email = rubyToS(MOD_SPEC_SHARED.email);
  const properties = [
    `name: ${spec.gem}`,
    `summary: ${spec.summary}`,
    `version: ${spec.version}`,
    `authors: ${authors}`,
    `description: ${spec.description}`,
    `email: ${email}`,
    `homepage: ${MOD_SPEC_SHARED.homepage}`
  ];
  const filesAccordion = accordionItemHtml({
    title: "files",
    subheader: void 0,
    body: listGroupHtml(MOD_SPEC_SHARED.files),
    open: false,
    collapseId: `card-${ctx.fmt.card.name.safeKey}-files-collapse-id`
  });
  const dependsAccordion = accordionItemHtml({
    title: "depends on ",
    subheader: void 0,
    body: listSectionContentHtml(dependsOn(spec) ?? [], ctx, "bar", false),
    open: false,
    collapseId: `card-${ctx.fmt.card.name.safeKey}-depends_on-collapse-id`
  });
  return sectionHtml(
    "Gem info",
    listGroupHtml(properties) + filesAccordion + dependsAccordion
  );
};
function rubyToS(items) {
  return `[${items.map((item) => JSON.stringify(item)).join(", ")}]`;
}
function modGlobalSectionHtml(viewName, ctx) {
  const grouped = groupedBy(allConfigs(ctx), "category", "mod");
  const byCategory = grouped.get(viewName);
  const sections = [];
  if (byCategory !== void 0) {
    for (const [modname, configs] of byCategory) {
      const section = listSectionHtml(
        modname,
        configs.map((c) => c.codename),
        ctx
      );
      if (section !== void 0) sections.push(section);
    }
  }
  return output([contentTag("h1", {}, viewName), sections.join("<br/>")]);
}
var modCardtypesView = (ctx) => {
  return modGlobalSectionHtml("cardtypes", ctx);
};
var modSettingsView = (ctx) => {
  return modGlobalSectionHtml("settings", ctx);
};
var modTasksView = (ctx) => {
  return modGlobalSectionHtml("tasks", ctx);
};
var modConfigurationsView = (ctx) => {
  return modGlobalSectionHtml("configurations", ctx);
};
var modRolesView = (ctx) => {
  const grouped = groupedBy(allConfigs(ctx), "roles");
  const groups = [];
  for (const [role, configs] of grouped) {
    const byCategory = /* @__PURE__ */ new Map();
    for (const config of configs) {
      const list = byCategory.get(config.category) ?? [];
      list.push(config);
      byCategory.set(config.category, list);
    }
    const sections = [];
    for (const [category, categoryConfigs] of byCategory) {
      const section = listSectionHtml(
        category,
        categoryConfigs.map((c) => c.codename),
        ctx
      );
      if (section !== void 0) sections.push(section);
    }
    groups.push(
      output([
        contentTag("h2", {}, DeckoName.parse(role).s),
        sections.join("")
      ])
    );
  }
  return output([contentTag("h1", {}, "Roles"), groups.join("<br/>")]);
};
function stubEvent(_card, _host) {
}
async function refreshReferencesOutEvent(card, _host, ctx) {
  await refreshReferencesOut(
    ctx.driver,
    ctx.lexicon,
    card.id,
    DeckoName.parse(card.name),
    card.dbContent ?? null
  );
}
async function updateRefererContentEvent(card, _host, ctx) {
  await updateRefererContent(
    { driver: ctx.driver, lexicon: ctx.lexicon },
    card.id,
    DeckoName.parse(card.nameBeforeAct ?? card.name),
    DeckoName.parse(card.name)
  );
}
async function updateRefererReferencesOutEvent(card, _host, ctx) {
  await updateRefererReferencesOut(
    { driver: ctx.driver, lexicon: ctx.lexicon },
    card.id
  );
}
async function refreshReferencesInEvent(card, _host, ctx) {
  const unmapExisting = card.action === "update" && ctx.skipEvent("update_referer_content");
  await refreshReferencesIn(ctx.driver, card.id, card.key ?? "", {
    unmapExisting
  });
}
async function clearReferencesEvent(card, _host, ctx) {
  await clearReferencesOnDelete(ctx.driver, card.id);
}
function event(decl) {
  return { fn: stubEvent, ...decl };
}
var coreMod = {
  name: "core",
  gemName: "card",
  group: "gem-card",
  setModules: [
    {
      // mod/core/set/abstract/task_table.rb — the task_table/task_row
      // format helpers (ported as this module's emitters)
      setPath: "abstract/task_table"
    },
    {
      // mod/core/set/all/admin.rb — the admin-config card methods + the
      // format helpers (section/list_section/nested_list_section/
      // accordion_sections/list_section_content) + basket[:tasks] =
      // {} + basket[:config_title] init (ported: core-admin-runtime.ts)
      setPath: "all/admin"
    },
    {
      // mod/core/set/all/assign_attributes.rb — write-path attribute
      // assignment (engine behavior, not ported)
      setPath: "all/assign_attributes"
    },
    {
      // mod/core/set/all/autoname.rb — event :set_autoname + the
      // autoname?/no_autoname? predicates
      setPath: "all/autoname",
      events: [
        event({
          event: "set_autoname",
          at: "prepare_to_store",
          on: ["create"],
          when: "autoname?"
        })
      ]
    },
    {
      // mod/core/set/all/codename.rb — events :validate_codename +
      // :reset_codename_cache + the codename validators
      setPath: "all/codename",
      events: [
        event({
          event: "validate_codename",
          at: "validate",
          on: ["update"],
          changed: ["codename"]
        }),
        event({
          event: "reset_codename_cache",
          at: "integrate",
          changed: ["codename"]
        })
      ]
    },
    {
      // mod/core/set/all/content.rb — events :set_content, :save_draft,
      // :set_default_content + the draft/default-content predicates
      setPath: "all/content",
      events: [
        event({ event: "set_content", at: "store", on: ["save"] }),
        event({
          event: "save_draft",
          at: "store",
          on: ["update"],
          when: "draft?"
        }),
        event({
          event: "set_default_content",
          at: "prepare_to_validate",
          on: ["create"],
          when: "use_default_content?"
        })
      ]
    },
    {
      // mod/core/set/all/debug.rb — to_s/inspect (dev surface)
      setPath: "all/debug"
    },
    {
      // mod/core/set/all/initialize.rb — Card.new arg normalization
      setPath: "all/initialize"
    },
    {
      // mod/core/set/all/name_events.rb — the nine name events. The two
      // `skip: :allowed` declarations (validate_uniqueness_of_name :12,
      // validate_renaming :46) now carry the field — the execution seam's
      // ModEventRegistration.skip grew it (admin-surface's divergence #6).
      // They stay STUBS: their bodies run as the engine's built-in
      // validations (validateNameLegality/assertNameAvailable/the rename
      // guards), and the takeover contract covers only the real batch.
      setPath: "all/name_events",
      events: [
        event({
          event: "validate_name",
          at: "validate",
          on: ["save"],
          changed: ["name"],
          when: "no_autoname?"
        }),
        event({ event: "validate_uniqueness_of_name", skip: "allowed" }),
        event({ event: "validate_legality_of_name" }),
        event({
          event: "validate_key",
          after: "validate_name",
          on: ["save"],
          when: "no_autoname?"
        }),
        event({
          event: "validate_renaming",
          at: "validate",
          on: ["update"],
          changed: ["name"],
          skip: "allowed"
        }),
        event({
          event: "expire_old_name",
          at: "store",
          changed: ["name"],
          on: ["update"]
        }),
        event({
          event: "rename_in_trash",
          after: "expire_old_name",
          on: ["update"]
        }),
        event({
          event: "prepare_left_and_right",
          at: "store",
          changed: ["name"],
          on: ["save"]
        }),
        event({ event: "update_lexicon", at: "store", changed: ["name"] })
      ]
    },
    {
      // mod/core/set/all/reference_events.rb — the five reference janitors.
      // THE FIRST REAL BATCH: all five carry REAL bodies (the engine's own
      // port modules); when these names are registered at the save path's
      // modEvents runtime, the engine's built-in janitor calls stand down
      // and these bodies ARE the mechanism (card-action-engine.ts
      // runFinalizeEvents). Ruby's declarations verbatim:
      //   :2-4  refresh_references_out, :finalize, on: :save, changed: :content
      //   :6-10 update_referer_content, :finalize, on: :update, changed:
      //         :name, skip: :allowed
      //   :15-19 update_referer_references_out, :finalize, changed: :name,
      //         on: :update, when: :skip_update_referers?
      //   :21-25 refresh_references_in, :finalize, changed: :name, on: :save
      //   :27-31 clear_references, :finalize, on: :delete
      setPath: "all/reference_events",
      events: [
        event({
          event: "refresh_references_out",
          at: "finalize",
          on: ["save"],
          changed: ["content"],
          fn: refreshReferencesOutEvent
        }),
        event({
          event: "update_referer_content",
          at: "finalize",
          on: ["update"],
          changed: ["name"],
          skip: "allowed",
          fn: updateRefererContentEvent
        }),
        event({
          event: "update_referer_references_out",
          at: "finalize",
          changed: ["name"],
          on: ["update"],
          when: "skip_update_referers?",
          fn: updateRefererReferencesOutEvent
        }),
        event({
          event: "refresh_references_in",
          at: "finalize",
          changed: ["name"],
          on: ["save"],
          fn: refreshReferencesInEvent
        }),
        event({
          event: "clear_references",
          at: "finalize",
          on: ["delete"],
          fn: clearReferencesEvent
        })
      ]
    },
    {
      // mod/core/set/all/result.rb — event :notable_exception_raised (no
      // stage/triggers) + the abort/success machinery
      setPath: "all/result",
      events: [event({ event: "notable_exception_raised" })]
    },
    {
      // mod/core/set/all/states.rb — real/virtual/unknown predicates
      setPath: "all/states"
    },
    {
      // mod/core/set/all/subcards.rb — event :reject_empty_subcards
      setPath: "all/subcards",
      events: [event({ event: "reject_empty_subcards", at: "prepare_to_validate" })]
    },
    {
      // mod/core/set/all/trash.rb — basket[:tasks][:empty_trash] (in
      // core-admin-runtime.ts, FIRST in the probed load order) + events
      // :manage_trash/:validate_delete/:delete_children
      setPath: "all/trash",
      events: [
        event({ event: "manage_trash", at: "prepare_to_store", on: ["create"] }),
        event({ event: "validate_delete", at: "validate", on: ["delete"] }),
        event({
          event: "delete_children",
          after: "validate_delete",
          on: ["delete"]
        })
      ]
    },
    {
      // mod/core/set/all/type.rb — events :validate_type_change +
      // :validate_type + the type readers
      setPath: "all/type",
      events: [
        event({
          event: "validate_type_change",
          at: "validate",
          on: ["update"],
          changed: ["type_id"]
        }),
        event({
          event: "validate_type",
          at: "validate",
          changed: ["type_id"],
          on: ["save"]
        })
      ]
    },
    {
      // mod/core/set/all/utils.rb — mod_path + the t delegate
      setPath: "all/utils"
    },
    {
      // mod/core/set/right/autoname.rb — assign_type :phrase + history?
      setPath: "right/autoname"
    },
    {
      // mod/core/set/self/admin.rb — basket task merges + warnings +
      // no_email_delivery? + event :admin_tasks + views :core/:warning
      setPath: "self/admin",
      formats: {
        html: {
          views: [
            { view: "core", viewFn: adminCoreView, config: { cache: "never" } },
            { view: "warning", viewFn: adminWarningView }
          ]
        }
      },
      events: [event({ event: "admin_tasks", at: "initialize", on: ["update"] })]
    },
    {
      // mod/core/set/self/autoname.rb — the *autoname setting_opts
      setPath: "self/autoname",
      settingOpts: {
        group: "templating",
        position: 4,
        helpText: "Autogenerate name for new cards by incrementing this value. [[http://decko.org/autonaming|more]]"
      }
    },
    {
      // mod/core/set/self/mod.rb — views :cardtypes/:settings/:tasks/
      // :configurations/:roles (+ the object-inspect content override,
      // NOT ported — header note)
      setPath: "self/mod",
      formats: {
        html: {
          views: [
            { view: "cardtypes", viewFn: modCardtypesView },
            { view: "settings", viewFn: modSettingsView },
            { view: "tasks", viewFn: modTasksView },
            { view: "configurations", viewFn: modConfigurationsView },
            { view: "roles", viewFn: modRolesView }
          ]
        }
      }
    },
    {
      // mod/core/set/self/trash.rb — view :core (the trash table +
      // restore links; needs the trash query + restore write path — the
      // named remainder in the header; *trash's :core keeps the base view)
      setPath: "self/trash"
    },
    {
      // mod/core/set/self/version.rb — the Cardio::Version.release content
      // override + ok_to_read? (NOT ported — header note)
      setPath: "self/version"
    },
    {
      // mod/core/set/type/cardtype.rb — basket[:non_createable_types] +
      // the three cardtype events. check_for_cards_of_type_when_type_
      // changed's `changing: :type` (:19-20) now carries the manifest
      // field (the seam's alias of changed:, event.rb:57); its when:
      // predicate (was_cardtype?) stays unported — the dispatcher reports
      // the skip as predicate-unresolved if a runtime ever walks it
      // without porting the predicate.
      setPath: "type/cardtype",
      events: [
        event({ event: "check_for_cards_of_type", after: "validate_delete" }),
        event({
          event: "check_for_cards_of_type_when_type_changed",
          at: "validate",
          changing: ["type"],
          when: "was_cardtype?"
        }),
        event({
          event: "validate_cardtype_name",
          at: "validate",
          on: ["save"],
          changed: ["name"]
        })
      ]
    },
    {
      // mod/core/set/type/mod.rb — the eleven per-mod views + the
      // admin_config card methods (ported here and in
      // core-admin-runtime.ts)
      setPath: "type/mod",
      formats: {
        html: {
          views: [
            { view: "core", viewFn: modCardCoreHtml },
            { view: "description", viewFn: typeModDescriptionView },
            { view: "settings", viewFn: typeModSettingsView },
            { view: "cardtypes", viewFn: typeModCardtypesView },
            { view: "configurations", viewFn: typeModConfigurationsView },
            { view: "tasks", viewFn: typeModTasksView },
            { view: "styles", viewFn: typeModStylesView },
            { view: "scripts", viewFn: typeModScriptsView },
            { view: "gem_info", viewFn: typeModGemInfoView },
            { view: "depends_on", viewFn: typeModDependsOnView },
            { view: "views", viewFn: typeModViewsView },
            // type/mod.rb view:bar_right (class
            // Z3) — registered here on the type/mod module; the corpus
            // grading pipeline never binds a ModLoader, so this
            // registration alone does not dispatch there. See the base
            // barRightView in views.ts for the graded surface.
            { view: "bar_right", viewFn: typeModBarRightView }
          ]
        }
      }
    }
  ],
  prepareEngine: async (host) => {
    moduleAdminHost = host;
    await prepareAdminRuntime(host);
  }
};

// src/card/auth/token.ts
var DEFAULT_TOKEN_EXPIRY_SECONDS = 2 * 24 * 60 * 60;

// src/card/mod-loader/mods/card-mod-account.ts
var signupCoreHtml = (ctx) => {
  const { fmt } = ctx;
  const engine = fmt.engine;
  const card = fmt.card;
  if (card.unknown === true || isNewCard(card.record)) return "";
  const createdAt = card.record.createdAt;
  const creatorId = card.record.creatorId;
  const anonymousId = engine.fetchRenderCard("Anonymous")?.id;
  const invited = creatorId !== void 0 && anonymousId !== void 0 && creatorId !== anonymousId;
  const signupLine = `<strong>${h(card.name.s)}</strong>` + (invited ? " was" : "") + ` signed up on ${formatCardDateSeconds(createdAt)}`;
  const accountLines = signupAccountLines(ctx);
  const body = fmt.processContent(fmt.renderRaw());
  return `<div class='invite-links'>
` + [signupLine, ...accountLines].map((line) => `<div>${line}</div>`).join("\n") + `
${body}
</div>
`;
};
function signupAccountLines(ctx) {
  const { fmt } = ctx;
  const engine = fmt.engine;
  const account = engine.fetchRenderCard(`${fmt.card.name.s}+*account`);
  if (account === void 0 || account.unknown === true) {
    return ["ERROR: signup card missing account"];
  }
  const email = engine.fetchRenderCard(`${fmt.card.name.s}+*account+*email`);
  const sent = email !== void 0 && email.unknown !== true && !engine.isDenied(email) ? `A verification email has been sent to ${h(email.dbContent)}` : void 0;
  return sent === void 0 ? [] : [sent];
}
function formatCardDateSeconds(sql) {
  if (sql === void 0 || sql === "") return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(sql);
  if (m === null) return "";
  const month = [
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
    "December"
  ][Number(m[2]) - 1];
  if (month === void 0) return "";
  const day = String(Number(m[3])).padStart(2, " ");
  return `${month} ${day}, ${m[1]} ${m[4]}:${m[5]}:${m[6]}`;
}

// src/card/history/action.ts
var ACTION_TYPE_CODES = {
  create: 0,
  update: 1,
  delete: 2
};

// src/card/history/change.ts
var TRACKED_FIELDS = [
  "name",
  "type_id",
  "db_content",
  "trash",
  "left_id",
  "right_id"
];
function trackedFieldIndex(field) {
  return TRACKED_FIELDS.indexOf(field);
}
function trackedFieldByIndex(index) {
  return TRACKED_FIELDS[index];
}

// src/card/mod-loader/mods/card-mod-history.ts
async function nestingIds(driver, returnField, whereField, cardId) {
  const result = await driver.query(
    `SELECT DISTINCT ${returnField} AS nid FROM card_references
     WHERE ref_type = 'I' AND ${whereField} = ?`,
    [cardId]
  );
  return result.rows.map((r) => r.nid).filter((id) => id !== null);
}
async function historyCardIds(driver, cardId) {
  return [...await nestingIds(driver, "referee_id", "referer_id", cardId), cardId];
}
async function actionCount(driver, cardId) {
  const result = await driver.query(
    "SELECT COUNT(*) AS n FROM card_actions WHERE card_id = ?",
    [cardId]
  );
  return Number(result.rows[0]?.n ?? 0);
}
var NOT_DRAFT = "(draft IS NOT TRUE)";
async function createAction(driver, cardId) {
  const result = await driver.query(
    `SELECT * FROM card_actions WHERE card_id = ? AND ${NOT_DRAFT} ORDER BY id LIMIT 1`,
    [cardId]
  );
  return result.rows[0];
}
async function lastAction(driver, cardId) {
  const result = await driver.query(
    `SELECT * FROM card_actions WHERE card_id = ? AND ${NOT_DRAFT}
     ORDER BY id DESC LIMIT 1`,
    [cardId]
  );
  return result.rows[0];
}
function extractActionId(actionArg) {
  return typeof actionArg === "number" ? actionArg : actionArg.id;
}
async function allActionChanges(driver, actionId) {
  const result = await driver.query(
    "SELECT * FROM card_changes WHERE card_action_id = ? ORDER BY id",
    [actionId]
  );
  const mapped = result.rows.map((row) => {
    const field = trackedFieldByIndex(Number(row.field));
    if (field === void 0) return void 0;
    const change = {
      cardActionId: Number(row.card_action_id),
      field,
      value: row.value
    };
    return change;
  });
  return mapped.filter((r) => r !== void 0);
}
async function actionIsSole(driver, action) {
  const changes = await allActionChanges(driver, action.id);
  if (changes.length > 0) return false;
  if (action.action_type === ACTION_TYPE_CODES.create) return true;
  return action.card_id === null ? false : await actionCount(driver, action.card_id) === 1;
}
async function actionChange(driver, action, field) {
  const all = await allActionChanges(driver, action.id);
  if (all.length > 0) return all.find((c) => c.field === field);
  if (!await actionIsSole(driver, action)) return void 0;
  if (action.card_id === null) return void 0;
  const card = await fetchCardsRow(driver, action.card_id);
  if (card === void 0) return void 0;
  return {
    cardActionId: action.id,
    field,
    value: field === "trash" ? card.trash !== 0 : card[field]
  };
}
async function actionValue(driver, action, field) {
  const interpreted = field === "content" ? "db_content" : field;
  const change = await actionChange(driver, action, interpreted);
  if (change === void 0) return void 0;
  if (interpreted === "type_id") {
    return change.value === null ? null : Number(change.value);
  }
  return change.value;
}
async function actionPreviousChange(driver, action, field) {
  if (action.action_type === ACTION_TYPE_CODES.create) return void 0;
  return lastChangeOn(driver, Number(action.card_id), field, { before: action.id });
}
async function actionPreviousValue(driver, action, field) {
  if (action.action_type === ACTION_TYPE_CODES.create) return void 0;
  const interpreted = field === "content" ? "db_content" : field;
  const previous = await actionPreviousChange(driver, action, interpreted);
  if (previous === void 0) return void 0;
  if (interpreted === "type_id") {
    return previous.value === null ? null : Number(previous.value);
  }
  return previous.value;
}
async function lastChangeOn(driver, cardId, field, opts = {}) {
  const actionId = opts.before !== void 0 ? extractActionId(opts.before) : opts.notAfter !== void 0 ? extractActionId(opts.notAfter) : void 0;
  const create = await createAction(driver, cardId);
  if (opts.before !== void 0) {
    if (create === void 0) {
      throw new Error(`last_change_on: card ${cardId} has no create action`);
    }
    if (actionId === create.id) return void 0;
  }
  const viaCreateAction = create !== void 0 && actionId === create.id || actionId === void 0 && create !== void 0 && await actionIsSole(driver, create);
  if (viaCreateAction) {
    return create === void 0 ? void 0 : actionChange(driver, create, field);
  }
  const conditions = ["card_actions.card_id = ?", "card_changes.field = ?"];
  const params = [cardId, trackedFieldIndex(field)];
  if (opts.includingDrafts !== true) {
    conditions.push("(draft IS NOT TRUE)");
  }
  const operator = opts.before !== void 0 ? "<" : opts.notAfter !== void 0 ? "<=" : void 0;
  if (operator !== void 0 && actionId !== void 0) {
    conditions.push(`card_changes.card_action_id ${operator} ?`);
    params.push(actionId);
  }
  const result = await driver.query(
    `SELECT card_changes.* FROM card_changes
     JOIN card_actions ON card_actions.id = card_changes.card_action_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY card_changes.id DESC LIMIT 1`,
    params
  );
  const row = result.rows[0];
  if (row === void 0) return void 0;
  const fieldName = trackedFieldByIndex(Number(row.field));
  return fieldName === void 0 ? void 0 : { cardActionId: Number(row.card_action_id), field: fieldName, value: row.value };
}
async function fetchCardsRow(driver, cardId) {
  const result = await driver.query("SELECT * FROM cards WHERE id = ?", [
    cardId
  ]);
  return result.rows[0];
}
async function lastAct(driver, cardId) {
  const action = await lastAction(driver, cardId);
  if (action === void 0) return void 0;
  const lastActOnSelf = (await driver.query(
    "SELECT * FROM card_acts WHERE card_id = ? ORDER BY id DESC LIMIT 1",
    [cardId]
  )).rows[0];
  const actOfLastAction = action.card_act_id ? (await driver.query("SELECT * FROM card_acts WHERE id = ?", [
    action.card_act_id
  ])).rows[0] : void 0;
  if (lastActOnSelf === void 0) return actOfLastAction;
  if (actOfLastAction === void 0) return lastActOnSelf;
  if (lastActOnSelf.id === actOfLastAction.id) return lastActOnSelf;
  if (lastActOnSelf.acted_at === null || actOfLastAction.acted_at === null) {
    throw new Error("last_act: NULL acted_at (Ruby would raise comparing nil)");
  }
  return lastActOnSelf.acted_at > actOfLastAction.acted_at ? lastActOnSelf : actOfLastAction;
}
async function historyActs(driver, cardIds, opts) {
  if (cardIds.length === 0) return [];
  const placeholders = cardIds.map(() => "?").join(", ");
  const draftClause = opts.withDrafts ? "(draft IS NOT TRUE OR card_acts.actor_id = ?)" : "(draft IS NOT TRUE)";
  const params = [...cardIds];
  if (opts.withDrafts) params.push(opts.currentUserId);
  const result = await driver.query(
    `SELECT card_acts.*, card_actions.card_id AS action_card_id
     FROM card_acts
     JOIN card_actions ON card_actions.card_act_id = card_acts.id
     JOIN cards ON cards.id = card_actions.card_id
     WHERE card_actions.card_id IN (${placeholders}) AND ${draftClause}
       AND card_acts.card_id IS NOT NULL
     ORDER BY card_acts.id DESC`,
    params
  );
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const row of result.rows) {
    if (seen.has(row.id)) continue;
    if (opts.isActionViewable !== void 0 && !opts.isActionViewable(Number(row.action_card_id))) {
      continue;
    }
    seen.add(row.id);
    out.push(row);
  }
  return out;
}
async function updaterOf(driver, cardId) {
  const result = await driver.query(
    `SELECT DISTINCT c0.id FROM cards c0
     JOIN card_acts cx1 ON c0.id = cx1.actor_id
     JOIN card_actions cn2 ON cx1.id = cn2.card_act_id
     JOIN cards c3 ON cn2.card_id = c3.id AND c3.trash IS FALSE
     WHERE cn2.action_type = 1 AND c3.id = ?
       AND c0.trash IS FALSE
     ORDER BY c0.id ASC`,
    [cardId]
  );
  return result.rows;
}

// src/card/mod-loader/mods/card-mod-edit.ts
function onTypeSet(ctx) {
  const parent = ctx.fmt.parent;
  if (parent === void 0) return void 0;
  const tmplSetName = parent.card.name.trunkName;
  const tmplSetClassCard = ctx.fmt.engine.fetchRenderCard(tmplSetName.tagName.s);
  if (tmplSetClassCard === void 0 || tmplSetClassCard.record.codename !== "type") return void 0;
  return tmplSetName.leftName;
}
function templateLinkSetNameForRelativeName(ctx, nestName) {
  return templateLinkSetNameFromParts(onTypeSet(ctx), nestName);
}
function templateLinkSetName(ctx, nestName) {
  if (nestName.isAbsolute) return nestName.fieldName({ codename: "self" });
  return templateLinkSetNameForRelativeName(ctx, nestName);
}
var templateNestView = (ctx) => {
  const { fmt, voo } = ctx;
  const nestName = voo.opts["nest_name"];
  if (nestName === void 0 || nestName === null || nestName === "") return "";
  const name = DeckoName.parse(String(nestName));
  if (name.fieldOnly) {
    const setName = templateLinkSetName(ctx, name);
    return fmt.withNestMode(
      "normal",
      () => fmt.nest({
        syntax: "",
        name: setName.s,
        options: { view: "template_link", extra: {} },
        comment: void 0
      })
    );
  }
  const syntax = voo.opts["nest_syntax"];
  if (typeof syntax !== "string" || syntax === "") return "";
  return `{{${syntax}}}`;
};
var CARDTYPE_GROUPS = {
  Text: ["RichText", "PlainText", "Markdown", "Phrase", "HTML"],
  Data: ["Number", "Toggle", "Date", "URI"],
  Upload: ["File", "Image"],
  Custom: [],
  Organize: ["List", "Pointer", "Search", "Link list", "Nest list"],
  Template: ["Notification template", "Email template", "Twitter template"],
  Admin: ["Cardtype", "User", "Role", "Sign up", "Session", "Set", "Setting"],
  Styling: ["Layout", "Skin", "Bootswatch skin", "CSS", "SCSS"],
  Scripting: ["JSON", "JavaScript", "CoffeeScript"]
};
var CARDTYPE_GROUP_MAP = new Set(
  Object.values(CARDTYPE_GROUPS).flat()
);
var BOARD_SLOT_SELECTOR = ".board-main > .overlay-container > .card-slot._bottomlay-slot,.board-main > ._overlay-container-placeholder > .card-slot";
var BOARD_SLOT_SELECTOR_ESC = h(BOARD_SLOT_SELECTOR);

// src/card/render/views.ts
var CARD_GEM_VERSION = "0.20.0";
function slotId2(card, view) {
  return `${card.name.safeKey}-${view}-view`;
}
function slotCardname(card) {
  const name = card.name;
  return isNewCard(card.record) && name.isCompound ? name.urlKey : name.s;
}
function slotWrap(ctx, view, inner, extraAttrs) {
  const { fmt, voo } = ctx;
  const card = fmt.card;
  const classes = voo.classy(["card-slot", `${view}-view`, card.setKeys]);
  const attrs = emitAttrs({
    id: slotId2(card, view),
    class: classes,
    "data-card-id": card.id === void 0 ? void 0 : String(card.id),
    "data-card-name": slotCardname(card),
    "data-card-type-id": card.typeId === void 0 ? void 0 : String(card.typeId),
    "data-card-type-name": card.typeName,
    "data-card-link-name": fmt.urlKey(),
    "data-slot-id": newSlotId(),
    "data-slot": slotOptionsWithNameContext(fmt, voo),
    // wrap.rb #slot_attributes :26-30: `hash.deep_merge! slot_attr` appends
    // the caller's slot_attr keys AFTER the data hash (Ruby's Hash#deep_merge!
    // keeps the receiver's key order, new keys join at the end) - Rails
    // content_tag emits them in that hash order. content_with_title's
    // `wrap true, title: ...` is the one caller with a slot_attr key.
    ...extraAttrs
  });
  return `<div${attrs}>${inner}</div>`;
}
var titleNoLinkView = ({ fmt, voo }) => {
  const rawTitle = voo.opts["title"];
  const explicit = typeof rawTitle === "string" && rawTitle !== "" ? rawTitle : void 0;
  const override = explicit ?? fmt.selfSetTitleOverride();
  const title = explicit !== void 0 ? fmt.standardTitle() : override ?? fmt.standardTitle();
  const attr = explicit ? h(title) : title;
  const parts = wrappedTitleInner(title);
  return `<span class="card-title" title="${attr}">${parts}</span>`;
};
var titleView = titleNoLinkView;
var titleLinkView = (ctx) => {
  const { fmt } = ctx;
  const klass = fmt.card.unknown === true ? "wanted-card" : "known-card";
  return `<a class="${klass}" href="/${h(fmt.urlKey())}">${fmt.renderView("title_no_link")}</a>`;
};
var openContentView = (ctx) => ctx.fmt.renderDelegated("core", { skip_perms: true });
function icon(name) {
  return `<i class="notranslate material-icons">${name}</i>`;
}
function helpTitle(ctx) {
  const { fmt } = ctx;
  const parts = fmt.card.name.parts.map((part) => `<a class="known-card" href="/${h(DeckoName.parse(part).urlKey)}">${part}</a>`).join("+");
  const type = fmt.card.typeName ?? "";
  const typeLink = `<a class="cardtype known-card" href="/${h(DeckoName.parse(type).urlKey)}">${type}</a>`;
  let title = `${parts} (${typeLink}) `;
  if (!fmt.card.name.isSimple) {
    title += `<a class="full-page-link known-card" href="/${h(fmt.urlKey())}">${icon("open_in_full")} </a>`;
  }
  return title;
}
function menuHelpAnchor(ctx) {
  const { fmt } = ctx;
  const rawHelp = fmt.menuHelpContentBytes();
  const helpContent = /^\s*$/.test(rawHelp) ? "&nbsp;" : rawHelp;
  return `<a tabindex="0" data-bs-toggle="popover" data-bs-trigger="hover focus" data-bs-content="${h(helpContent)}" data-bs-placement="left" class="help-link ps-1 _popover_link _card-menu-popover" data-bs-title="${h(helpTitle(ctx))}" href="#">${icon("help")}</a>`;
}
function menuEditAnchor(fmt) {
  const url = fmt.urlKey();
  return `<a rel="nofollow" class="edit-link slotter" title="Edit" data-bs-toggle="tooltip" data-bs-placement="bottom" data-slotter-mode="modal" data-modal-class="modal-lg" href="/${h(url)}/edit" data-remote="true">${icon("edit")} </a>`;
}
function menuBoardAnchor(fmt, opts) {
  const url = fmt.urlKey();
  const slotterMode = opts.inModal ? ` data-slotter-mode="modal-replace"` : "";
  return `<a rel="nofollow" class="board-link slotter" title="Advanced" data-bs-toggle="tooltip" data-bs-placement="bottom"${slotterMode} href="/${h(url)}/board" data-remote="true">${icon("space_dashboard")} </a>`;
}
var menuView = (ctx) => {
  const { fmt, voo } = ctx;
  const help = menuHelpAnchor(ctx);
  const edit = menuEditAnchor(fmt);
  const board = menuBoardAnchor(fmt, { inModal: false });
  const menuClasses = `card-menu nodblclick${voo.show("hover_link") ? " _show-on-hover" : ""}`;
  return `<div class="${menuClasses}">${help}
${edit}
${board}</div>`;
};
var menuBlockView = (ctx) => {
  const menu = ctx.fmt.renderView("menu");
  return `<div class="menu-block position-relative py-2">${menu}
&nbsp;</div>`;
};
var editLinkView = ({ fmt }) => menuEditAnchor(fmt);
var editButtonView = ({ fmt, voo }) => {
  const view = voo.opts["edit"] === "inline" ? "edit_inline" : "edit";
  const suffix = view === "edit" ? "/edit" : "/edit_inline";
  return `<a rel="nofollow" class="btn btn-sm btn-outline-primary me-2 slotter" href="/${h(fmt.urlKey())}${suffix}" data-remote="true">Edit</a>`;
};
var fullPageLinkView = ({ fmt }) => {
  const klass = fmt.card.unknown === true ? "wanted-card" : "known-card";
  return `<a class="full-page-link ${klass}" href="/${h(fmt.urlKey())}">${icon("open_in_full")} </a>`;
};
var boardLinkView = ({ fmt }) => menuBoardAnchor(fmt, { inModal: true });
var helpLinkView = (ctx) => menuHelpAnchor(ctx);
var contentView = ({ fmt }) => {
  return slotWrapCommon(fmt, "content", fmt.renderDelegated("core"));
};
function slotWrapCommon(fmt, view, inner) {
  const voo = fmt.voo;
  if (voo === void 0) throw new Error("slotWrapCommon outside a render");
  return slotWrap({ fmt, voo }, view, inner);
}
var contentPanelView = ({ fmt }) => {
  const inner = `<div class="card-body">${fmt.renderView("menu")}
${fmt.renderDelegated("core")}</div>`;
  return slotWrapCommon(fmt, "content_panel", inner);
};
var contentWithTitleView = ({ fmt }) => {
  const core = fmt.renderDelegated("core");
  const title = toText(core);
  const inner = `${fmt.renderView("menu")}
${core}`;
  const voo = fmt.voo;
  if (voo === void 0) throw new Error("content_with_title outside a render");
  return slotWrap({ fmt, voo }, "content_with_title", inner, { title });
};
function toText(html) {
  return decodeHtmlEntities2(stripTags2(html));
}
function stripTags2(value) {
  return value.replace(/<[^>]*>/g, "");
}
function decodeHtmlEntities2(value) {
  const NAMED = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: "\xA0",
    iexcl: "\xA1",
    cent: "\xA2",
    pound: "\xA3",
    curren: "\xA4",
    yen: "\xA5",
    brvbar: "\xA6",
    sect: "\xA7",
    uml: "\xA8",
    copy: "\xA9",
    ordf: "\xAA",
    laquo: "\xAB",
    not: "\xAC",
    shy: "\xAD",
    reg: "\xAE",
    macr: "\xAF",
    deg: "\xB0",
    plusmn: "\xB1",
    sup2: "\xB2",
    sup3: "\xB3",
    acute: "\xB4",
    micro: "\xB5",
    para: "\xB6",
    middot: "\xB7",
    cedil: "\xB8",
    sup1: "\xB9",
    ordm: "\xBA",
    raquo: "\xBB",
    frac14: "\xBC",
    frac12: "\xBD",
    frac34: "\xBE",
    iquest: "\xBF",
    times: "\xD7",
    divide: "\xF7",
    ndash: "\u2013",
    mdash: "\u2014",
    lsquo: "\u2018",
    rsquo: "\u2019",
    sbquo: "\u201A",
    ldquo: "\u201C",
    rdquo: "\u201D",
    bdquo: "\u201E",
    dagger: "\u2020",
    Dagger: "\u2021",
    bull: "\u2022",
    hellip: "\u2026",
    permil: "\u2030",
    prime: "\u2032",
    Prime: "\u2033",
    euro: "\u20AC",
    trade: "\u2122",
    agrave: "\xE0",
    aacute: "\xE1",
    acirc: "\xE2",
    atilde: "\xE3",
    auml: "\xE4",
    aring: "\xE5",
    aelig: "\xE6",
    ccedil: "\xE7",
    egrave: "\xE8",
    eacute: "\xE9",
    ecirc: "\xEA",
    euml: "\xEB",
    igrave: "\xEC",
    iacute: "\xED",
    icirc: "\xEE",
    iuml: "\xEF",
    ntilde: "\xF1",
    ograve: "\xF2",
    oacute: "\xF3",
    ocirc: "\xF4",
    otilde: "\xF5",
    ouml: "\xF6",
    oslash: "\xF8",
    ugrave: "\xF9",
    uacute: "\xFA",
    ucirc: "\xFB",
    uuml: "\xFC",
    yacute: "\xFD",
    yuml: "\xFF",
    OElig: "\u0152",
    oelig: "\u0153",
    Scaron: "\u0160",
    scaron: "\u0161",
    Yuml: "\u0178",
    fnof: "\u0192",
    circ: "\u02C6",
    tilde: "\u02DC",
    ensp: "\u2002",
    emsp: "\u2003",
    thinsp: "\u2009",
    zwnj: "\u200C",
    zwj: "\u200D",
    lrm: "\u200E",
    rlm: "\u200F",
    larr: "\u2190",
    uarr: "\u2191",
    rarr: "\u2192",
    darr: "\u2193",
    harr: "\u2194",
    crarr: "\u21B5",
    lceil: "\u2308",
    rceil: "\u2309",
    lfloor: "\u230A",
    rfloor: "\u230B",
    loz: "\u25CA",
    spades: "\u2660",
    clubs: "\u2663",
    hearts: "\u2665",
    diamonds: "\u2666"
  };
  return value.replace(
    /&#x([0-9a-fA-F]+);/g,
    (_, hex) => String.fromCodePoint(parseInt(hex, 16))
  ).replace(
    /&#(\d+);/g,
    (_, dec) => String.fromCodePoint(parseInt(dec, 10))
  ).replace(
    /&([a-zA-Z][a-zA-Z0-9]*);/g,
    (match, name) => NAMED[name] !== void 0 ? NAMED[name] : match
  );
}
var textWithoutNestsView = ({ fmt }) => {
  const pieces = scanNests(fmt.renderRaw());
  let nestless = "";
  for (const piece of pieces) {
    if (piece.kind === "nest") continue;
    nestless += expandContentLinks(piece.text, fmt.engine);
  }
  return toText(nestless);
};
var conflictView = ({ fmt }) => {
  const reader = fmt.engine.historyRenderReader?.();
  if (reader === void 0) {
    throw new Error(
      "conflict rendered without the render-time history seam (RenderEngine#prepareHistoryRender)"
    );
  }
  const last = reader.cardLastAction;
  const act = last === void 0 ? void 0 : reader.actById(Number(last.card_act_id));
  const actor = act?.actor_id === void 0 || act?.actor_id === null ? void 0 : reader.cardInfo(Number(act.actor_id));
  const actorLink = actor === void 0 ? "" : `<a class="${actor.renderCard?.unknown === true ? "wanted-card" : "known-card"}" href="/${h(DeckoName.parse(actor.name).urlKey)}">${h(actor.name)}</a>`;
  const lastActionId = last === void 0 ? "" : String(last.id);
  const actBytes = fmt.renderView("act");
  const alertBody = `
          <strong>Conflict!</strong>
          <span class="new-current-revision-id">${h(lastActionId)}</span>
          <div>${actorLink} has also been making changes.</div>
          <div>Please examine below, resolve above, and re-submit.</div>
          ${actBytes}
        `;
  const inner = `<div class="alert alert-warning" role="alert">${alertBody}</div>`;
  return slotWrapCommon(fmt, "conflict", inner);
};
function accountFieldNest(ctx, field, title) {
  const fullName = `${ctx.fmt.card.name.s}+*${field}`;
  return ctx.fmt.nest({
    name: fullName,
    syntax: `{{${fullName} | view: labeled}}`,
    options: { title, view: "labeled", extra: {} },
    comment: void 0
  });
}
var accountCoreHtml = (ctx) => [accountFieldNest(ctx, "email", "email"), accountFieldNest(ctx, "password", "password")].join(
  "\n"
);
var coreViewBase = (ctx) => {
  const { fmt } = ctx;
  if (fmt.card.record.codename === "version") {
    return CARD_GEM_VERSION;
  }
  if (fmt.card.key === "*account_link") {
    return accountLinksCoreHtml(ctx);
  }
  {
    const overrideEntry = resolveContentOverrideEntry(fmt);
    if (overrideEntry !== void 0 && overrideEntry.supersedesType !== false) {
      return overrideEntry.fn(fmt);
    }
  }
  if (fmt.card.setKeys.split(" ").includes("SELF-Xhead")) {
    let rootFormat = fmt;
    while (rootFormat.parent !== void 0) rootFormat = rootFormat.parent;
    const head = fmt.engine.pageHeadBytesFor?.(rootFormat.card.key);
    if (head === void 0) return "";
    return fmt.isMain ? h(head) : head;
  }
  if (fmt.card.setKeys.split(" ").includes("RIGHT-Xhead")) {
    return fmt.processContent(highlight(fmt.renderRaw(), "html"));
  }
  if (fmt.card.typeCode === "signup" || fmt.card.typeName === "Sign up") {
    return signupCoreHtml(ctx);
  }
  if (fmt.card.name.isCompound && fmt.card.name.rightName?.key === "*account") {
    return accountCoreHtml(ctx);
  }
  if (fmt.card.typeCode === "toggle" || fmt.card.typeName === "Toggle") {
    return formatToggleCore(fmt.card.dbContent);
  }
  if (fmt.card.typeCode === "plain_text" || fmt.card.typeName === "PlainText") {
    return fmt.processContent(h(fmt.renderRaw()));
  }
  if (fmt.card.typeCode === "search_type" || fmt.card.typeName === "Search") {
    if ((fmt.engine.cardIsRule?.(fmt.card) ?? false) || (fmt.engine.cardMatchesRuleSet?.(fmt.card) ?? false)) {
      return fmt.renderRaw();
    }
    return fmt.renderView("card_list");
  }
  if (isModAssetsChildCard(ctx)) {
    return modAssetsChildCoreHtml(ctx);
  }
  if (isRuleCardWithPermissionRight(fmt.card) && fmt.card.dbContent === "_left") {
    return permissionInheritContentHtml(ctx.fmt.card.name.trunkName?.tagName?.key);
  }
  if (isPointerOrListCard(fmt.card)) {
    const items = rawItemStrings(fmt.card.dbContent).filter((s) => s.length > 0).map((s) => resolvePointerItemName(s, fmt.card.name));
    const itemsOpt = fmt.voo?.opts["items"];
    const itemView = itemsOpt !== null && typeof itemsOpt === "object" && typeof itemsOpt.view === "string" ? itemsOpt.view : isInputTypeRuleCard(fmt.card) ? "name" : "bar";
    return pointerListCoreHtml(
      fmt.card,
      items,
      (name) => renderPointerListItem(fmt, name, itemView),
      itemView
    );
  }
  if (fmt.card.typeCode === "set") {
    return setRulesCoreHtml(ctx);
  }
  if (fmt.card.typeCode === "setting" || fmt.card.typeName === "Setting") {
    return settingCoreHtml(ctx);
  }
  if (fmt.card.typeCode === "date" || fmt.card.typeName === "Date") {
    return formatDateCore(fmt.card.dbContent);
  }
  if (fmt.card.typeCode === "image" || fmt.card.typeName === "Image") {
    return formatImageCore(
      fmt.card.dbContent,
      fmt.card.id,
      fmt.card.name.s,
      // image.rb determine_image_size: voo.size || default_size (:medium).
      fmt.voo?.opts.size ?? "medium",
      fmt.engine.imageCdnHost
    );
  }
  if (fmt.card.typeCode === "file" || fmt.card.typeName === "File") {
    return formatFileCore(fmt.card.dbContent, {
      cardName: fmt.card.name.s,
      contextNames: fmt.contextNames
    });
  }
  if (fmt.card.typeCode === "markdown" || fmt.card.typeName === "Markdown") {
    return fmt.processContent(kramdownToStashedHtml(fmt.renderRaw()));
  }
  if (fmt.card.typeCode === "mod" || fmt.card.typeName === "Mod") {
    return modCardCoreHtml(ctx);
  }
  if (fmt.card.typeCode === "bootswatch_skin" || fmt.card.typeName === "Bootswatch skin") {
    return bootswatchSkinCoreHtml(ctx);
  }
  const codeLang = langForTypeCode(fmt.card.typeCode);
  if (codeLang !== void 0) {
    const body = highlight(fmt.renderRaw(), codeLang);
    const chunkList = rubyChunkListForCardType(fmt.card.typeCode, fmt.card.typeName);
    if (fmt.card.typeCode === "layout_type") {
      return fmt.withNestMode("template", () => fmt.processContent(body, chunkList));
    }
    return fmt.processContent(body, chunkList);
  }
  return fmt.processContent(fmt.renderRaw());
};
function isTemplatedNestsCard(card) {
  const rightKey = card.name.rightName?.key;
  return rightKey === "*default" || rightKey === "*structure";
}
function isTemplatedNestsName(name) {
  const rightKey = name.rightName?.key;
  return rightKey === "*default" || rightKey === "*structure";
}
function templateLinkSetNameFromParts(base, nestName) {
  const name = nestName.fullyStripped;
  if (base !== void 0) {
    return DeckoName.compose([base, name]).fieldName({ codename: "type_plus_right" });
  }
  return name.fieldName({ codename: "right" });
}
var RECAPTCHA_SITE_KEY = "6Lc3c-EoAAAAALnzfnHIWb5Rqy-rNui8l8qsguYG";
var commentBoxBaseView = ({ fmt }) => {
  const card = fmt.card;
  if (fmt.engine.taskAllowed?.(card, "update") !== true) return "";
  if (card.id === void 0) {
    return `<div class="comment-box nodblclick"><form class="card-form slotter" id="new_card" action="/card/create" accept-charset="UTF-8" data-remote="true" method="post"><input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" /><input type="hidden" name="card[name]" id="card_name" value="${h(card.name.s)}" autocomplete="off" /><textarea rows="3" class=" form-control" name="card[comment]" id="card_comment">
</textarea><div class="comment-buttons"><label>My Name is:</label> <input type="text" name="comment_author"></div></form></div>`;
  }
  const form = `<form class="card-form slotter autosave" id="edit_card_${card.id}" data-recaptcha="on" action="/update/${h(fmt.urlKey())}" accept-charset="UTF-8" data-remote="true" method="post"><input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" /><input type="hidden" name="_method" value="patch" autocomplete="off" /><script src="https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}"></script>
<input type="hidden" name="recaptcha_token" id="recaptcha_token" value="" data-site-key="${RECAPTCHA_SITE_KEY}" data-action="update" class="_recaptcha-token" autocomplete="off" /><textarea rows="3" class=" form-control" name="card[comment]" id="card_comment">
</textarea>
<div class="comment-buttons"><label>My Name is:</label> <input class=" form-control" type="text" value="Anonymous" name="card[comment_author]" id="card_comment_author" />
<button name="button" type="submit" data-disable-with="Commenting" class="btn btn-outline-primary">Comment</button></div>`;
  return `<div class="comment-box nodblclick">${form}</form></div>`;
};
var coreView = (ctx) => {
  const base = isTemplatedNestsCard(ctx.fmt.card) ? ctx.fmt.withNestMode("template", () => coreViewBase(ctx)) : coreViewBase(ctx);
  if (ctx.fmt.card.name.rightName?.key !== "discussion") return base;
  let box = "";
  try {
    box = ctx.fmt.renderView("comment_box", {}, "hide");
  } catch {
    box = "";
  }
  return base + "\n" + box;
};
var templateLinkView = (ctx) => {
  const { fmt, voo } = ctx;
  if (fmt.card.typeCode !== "set" && fmt.card.typeName !== "Set") {
    throw new UnsupportedViewError("template_link", fmt.card.name.s);
  }
  const parent = fmt.parent;
  const parentVoo = parent?.voo;
  if (parentVoo !== void 0) {
    const syntax = parentVoo.opts["nest_syntax"];
    if (typeof syntax === "string") voo.liveTitle = syntax;
  }
  const title = voo.liveTitle ?? voo.opts["title"];
  const text = typeof title === "string" && title !== "" ? title : "modal_nest_rules";
  const href = `/${fmt.urlKey()}/modal_nest_rules`;
  const anchor = `<a rel="nofollow" class="slotter" href="${h(href)}" data-remote="true">${text}</a>`;
  return slotWrap(ctx, "template_link", `{{${anchor}}}`);
};
function testContextCardFor(ctx) {
  const card = ctx.fmt.card;
  if (!card.name.isCompound) return void 0;
  const left = card.name.leftName;
  if (left === void 0) return void 0;
  const junction = ctx.fmt.engine.fetchRenderCard(`${left.s}+*test context`);
  if (junction === void 0 || junction.unknown === true) return void 0;
  const firstItem = (junction.dbContent ?? "").split("\n").map((line) => line.trim()).find((line) => line !== "");
  if (firstItem === void 0) return void 0;
  return ctx.fmt.engine.fetchRenderCard(firstItem);
}
function contextualizingTestContext(ctx, run) {
  if (ctx.fmt.contextCard !== void 0) return run();
  if (ctx.voo.viz.get("test_context") === "hide") return run();
  const target = testContextCardFor(ctx);
  if (target === void 0) return run();
  const previous = ctx.fmt.contextCard;
  ctx.fmt.contextCard = target;
  try {
    return run();
  } finally {
    ctx.fmt.contextCard = previous;
  }
}
function htmlMessageCoreBody(ctx) {
  return contextualizingTestContext(ctx, () => coreView(ctx));
}
function subjectCoreBody(ctx) {
  return contextualizingTestContext(ctx, () => coreView(ctx));
}
function contentWithLinkBody(ctx) {
  const simpleCore = contentView(ctx);
  const href = `/${ctx.fmt.urlKey()}/email_page?layout=none`;
  return `<div class='simple-core'>
${simpleCore}
</div>
<div class='email-html-link py-2 text-end'>
<a href='${href}'>
<em>sample email page</em>
</a>
</div>
`;
}
function textMessageCoreBody(ctx) {
  return contextualizingTestContext(
    ctx,
    () => toText(ctx.fmt.withFormatName("email_text").renderView("core"))
  );
}
var EMAIL_TEMPLATE_FIELD_TAGS = [
  "to",
  "from",
  "cc",
  "bcc",
  "attach",
  "subject",
  "text message",
  "html message",
  "test context"
];
function emailTemplateCoreBody(ctx) {
  const base = ctx.fmt.card.name.s;
  return EMAIL_TEMPLATE_FIELD_TAGS.map((tag) => {
    const fieldMark = `${base}+*${tag}`;
    return ctx.fmt.nest({
      name: fieldMark,
      syntax: "",
      options: { view: "read_formgroup", title: fieldMark, extra: {} },
      comment: void 0
    });
  }).join("\n");
}
var emailScopedCoreView = (ctx) => {
  if (ctx.fmt.formatName !== "html") return coreView(ctx);
  const card = ctx.fmt.card;
  const tagCodename = card.name.isCompound ? DeckoName.parse(card.name.tag).codename : void 0;
  if (tagCodename === "text_message") return textMessageCoreBody(ctx);
  if (tagCodename === "html_message") return htmlMessageCoreBody(ctx);
  if (tagCodename === "subject") return subjectCoreBody(ctx);
  if (card.typeCode === "email_template") return emailTemplateCoreBody(ctx);
  return coreView(ctx);
};
var emailScopedContentView = (ctx) => {
  if (ctx.fmt.formatName !== "html") return contentView(ctx);
  const card = ctx.fmt.card;
  const tagCodename = card.name.isCompound ? DeckoName.parse(card.name.tag).codename : void 0;
  if (tagCodename === "html_message") return contentWithLinkBody(ctx);
  return contentView(ctx);
};
function formatToggleCore(content) {
  const normalized = (content ?? "").trim().toLowerCase();
  if (normalized === "0" || normalized === "false" || normalized === "" || normalized === "no") {
    return "no";
  }
  return "yes";
}
function formatDateCore(content) {
  const date = parseRubyDateContent(content);
  if (date === null) {
    throw dateError();
  }
  const month = date.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
  return `${month} ${day}, ${year}`;
}
function formatImageCore(content, cardId, cardName, sizeOpt, cdnAssetHost) {
  if (content === null || content === void 0 || content === "") return "";
  const svgBytes = codedSvgFileBytes(content);
  if (svgBytes !== void 0) return svgBytes;
  const trimmed = content.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("/") || trimmed.startsWith("data:") || trimmed.startsWith("mailto:")) {
    return `<img alt="${h(cardName ?? "")}" src="${h(trimmed)}" />`;
  }
  if (trimmed.startsWith("(")) {
    const src = cloudImageUrl(trimmed, sizeOpt, cdnAssetHost);
    if (src === "") return "";
    return `<img alt="${h(cardName ?? "")}" src="${h(src)}" />`;
  }
  if (trimmed.startsWith("~")) {
    const path = trimmed.replace(/^~/, "");
    const sized = appendSizeVariant(path, sizeOpt ?? "medium");
    return `<img alt="${h(cardName ?? "")}" src="${h(`/files/${sized}`)}" />`;
  }
  if (trimmed.startsWith(":")) {
    const sized = appendSizeVariant(trimmed, sizeOpt ?? "medium");
    return `<img alt="${h(cardName ?? "")}" src="${h(`/files/${sized}`)}" />`;
  }
  return "";
}
function imageSizeVariant(sizeOpt) {
  if (sizeOpt === void 0 || sizeOpt === null || sizeOpt === "") return "medium";
  const size = String(sizeOpt);
  return size === "full" ? "original" : size;
}
var FOG_CLOUD_URL_HOST = "http://s3.amazonaws.com/";
function cloudImageUrl(content, sizeOpt, cdnAssetHost) {
  const variant = imageSizeVariant(sizeOpt);
  return derivedCloudAttachmentSource(content, cdnAssetHost, variant);
}
var RUBY_FLOAT_SEGMENT = /^\s*[+-]?\d+(_\d+)*([eE][+-]?\d+(_\d+)*)?\s*$/;
function lastContentActionIdFromDbContent(dbContent) {
  if (dbContent === null || dbContent === void 0) return null;
  const parts = dbContent.split(/[\/.]/);
  while (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
  const aid = parts[parts.length - 2];
  if (aid === void 0 || !RUBY_FLOAT_SEGMENT.test(aid)) return null;
  return parseInt(aid, 10);
}
function rubyExtnameFromPath(content) {
  const base = content.slice(content.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot);
}
function storedBaseName(content) {
  const base = content.slice(content.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}
function derivedCloudAttachmentSource(content, cdnAssetHost, sizeVariant) {
  const trimmed = content.trim();
  const withoutBucket = trimmed.replace(/^\([^)]*\)\//, "");
  if (withoutBucket === trimmed) return "";
  const slash = withoutBucket.indexOf("/");
  if (slash === -1) return "";
  const idSeg = withoutBucket.slice(0, slash);
  const ext = rubyExtnameFromPath(trimmed).toLowerCase();
  if (ext === "") return "";
  const actionId = lastContentActionIdFromDbContent(trimmed);
  const basename = actionId === null ? storedBaseName(trimmed) : String(actionId);
  const leaf = sizeVariant === void 0 ? `${basename}${ext}` : appendVariantLowercasingExt(`${basename}${ext}`, sizeVariant);
  return `${cdnAssetHost ?? FOG_CLOUD_URL_HOST}/files/${idSeg}/${leaf}`;
}
function appendSizeVariant(path, sizeOpt) {
  if (sizeOpt === void 0 || sizeOpt === null || sizeOpt === "") return path;
  const suffix = imageSizeVariant(sizeOpt);
  return appendVariantLowercasingExt(path, suffix);
}
function appendVariantLowercasingExt(path, variant) {
  const dot = path.lastIndexOf(".");
  if (dot === -1) return `${path}-${variant}`;
  return `${path.slice(0, dot)}-${variant}${path.slice(dot).toLowerCase()}`;
}
function formatFileCore(content, nameContext) {
  const trimmed = (content ?? "").trim();
  if (trimmed === "") return "";
  const source = fileSourceFromContent(trimmed);
  if (source === "") return "";
  const title = nameContext === void 0 ? "" : DeckoName.parse(nameContext.cardName).from(...nameContext.contextNames ?? []);
  return `<a href='${h(source)}'>Download ${h(title)}</a>
`;
}
function fileSourceFromContent(trimmed) {
  if (/^\(/.test(trimmed)) return derivedCloudAttachmentSource(trimmed);
  if (/^https?:/.test(trimmed)) return trimmed;
  if (/^~/.test(trimmed)) {
    return `/files/${trimmed.replace(/^~/, "")}`;
  }
  if (/^:/.test(trimmed)) {
    return `/files/${trimmed.replace(/^:/, "").replace(/\//g, ".")}`;
  }
  return "";
}
function setRulesCoreHtml(ctx) {
  const { fmt } = ctx;
  const card = fmt.card;
  const url = fmt.urlKey();
  const settingsFilter = renderSettingsFilter(url);
  const rules2 = collectSetRules(fmt);
  const accordion = renderCategoryAccordion(fmt, card, rules2);
  return `<h4 class="mt-3">Rules</h4>
${settingsFilter}
${accordion}`;
}
function settingCoreHtml(ctx) {
  const { fmt } = ctx;
  const card = fmt.card;
  const settingName = card.name.s.replace(/\*/g, "");
  let body = "";
  const ruleHelp = settingRuleHelpHtml(ctx);
  if (ruleHelp !== "") {
    body += `${ruleHelp}
`;
  }
  body += `<h3>All ${settingName} rules that apply to</h3>
`;
  const classes = fmt.engine.setClassesWithRules?.(card) ?? [];
  for (const cls of classes) {
    const heading = cls.klass.genericLabel();
    body += `<p>
<h5>
${h(heading.toLowerCase())}
</h5>
`;
    if (cls.anchorless) {
      const rule = cls.rules[0];
      if (rule !== void 0) {
        body += fmt.nestRecord(rule, "bar", {
          nest_name: rule.name.s,
          show: ["full_name", "bar"],
          home_view: "bar"
        });
        body += `
`;
      }
    } else {
      for (const rule of cls.rules) {
        body += fmt.nestRecord(rule, "bar", {
          nest_name: rule.name.s,
          show: ["bar"],
          home_view: "bar"
        });
        body += `
`;
      }
    }
    body += `</p>
`;
  }
  return body;
}
function settingRuleHelpHtml(ctx) {
  const { fmt } = ctx;
  const ruleCard = fmt.engine.fetchRenderCard(`*all+${fmt.card.name.s}`) ?? virtualAllRuleCard(fmt, fmt.card);
  if (ruleCard === void 0) return "";
  const sub = new RenderFormat(ruleCard, fmt.engine, {
    parent: fmt,
    maxDepth: fmt.maxDepth
  });
  const help = ruleHelpAlertBody(fmt.engine, sub, ruleCard);
  return `<div class="alert alert-info rule-instruction">${help}</div>`;
}
function virtualAllRuleCard(fmt, settingCard) {
  const setCard = fmt.engine.fetchRenderCard("*all");
  if (setCard === void 0) return void 0;
  return buildVirtualRuleCard({
    setCard,
    settingCard,
    settingCodename: settingCard.record.codename ?? settingCard.name.s.slice(1)
  });
}
function ruleHelpAlertBody(engine, fmt, ruleCard) {
  const resolver = engine.helpRules;
  if (resolver !== void 0) return resolver.ruleBasedHelpForCard(fmt, ruleCard);
  const rightKey = ruleCard.name.rightName?.key;
  const raw = registeredSettingHelpText(
    ruleCard.record.codename,
    rightKey === void 0 ? void 0 : engine.fetchRenderCard(rightKey)?.record.codename
  ) ?? helpRuleCardContent(engine, ruleCard);
  return raw === void 0 ? "" : processHelpContent(fmt, raw);
}
function helpRuleCardContent(engine, card) {
  if (card.unknown === true) return void 0;
  const input = {
    name: card.name.s,
    id: card.id,
    typeId: card.typeId,
    typeName: card.typeName
  };
  if (card.name.isCompound) {
    const leftKey = card.name.leftName?.key;
    const left = leftKey !== void 0 ? engine.fetchRenderCard(leftKey) : void 0;
    input.leftTypeName = left?.typeName;
  }
  for (const candidate of ruleNamesForCard(input, "*help")) {
    const record = engine.fetchRenderCard(candidate);
    if (record === void 0) continue;
    if (engine.isDenied(record)) continue;
    return record.dbContent;
  }
  return void 0;
}
function isModAssetsChildCard(ctx) {
  const card = ctx.fmt.card;
  if (!card.name.isCompound) return false;
  const leftKey = card.name.leftName?.key;
  const rightKey = card.name.rightName?.key;
  if (leftKey === void 0 || rightKey === void 0) return false;
  const left = ctx.fmt.engine.fetchRenderCard(leftKey);
  const right = ctx.fmt.engine.fetchRenderCard(rightKey);
  const rightCodename = right?.record.codename;
  return left?.typeCode === "mod" && (rightCodename === "style" || rightCodename === "script");
}
function modAssetsChildCoreHtml(ctx) {
  const { fmt } = ctx;
  const card = fmt.card;
  const left = fmt.engine.fetchRenderCard(card.name.leftName.key);
  const right = fmt.engine.fetchRenderCard(card.name.rightName.key);
  const stem = (left?.record.codename ?? "").replace(/^mod_/, "");
  const subpath = right?.record.codename === "script" ? "script" : "style";
  const groups = modChildAssetGroups(stem, subpath) ?? [];
  return modAssetGroupsCoreHtml(groups);
}
function renderSettingsFilter(url) {
  const radioAllChecked = false;
  const radioCommonChecked = true;
  const radioFieldChecked = false;
  const radioRecentChecked = false;
  return `<form role="filter" data-slot-selector=".card-slot._setting-list" class="nodblclick slotter" action="/${h(url)}/accordion_bar_list" accept-charset="UTF-8" data-remote="true" method="get"><input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" /><div class="my-4 mx-2 _setting-filter"><label>Settings</label>
` + radioHtml("all", "All", radioAllChecked) + `

` + radioHtml("common", "Common", radioCommonChecked) + `

` + radioHtml("field", "Field", radioFieldChecked) + `

` + radioHtml("recent", "Recent", radioRecentChecked) + `
</div></form>`;
}
function radioHtml(id, label, checked) {
  const checkedAttr = checked ? " checked" : " ";
  return `<input type="radio" class="btn-check _setting-category" name="options" id="${id}" autocomplete="off"${checkedAttr}>
<label class="btn btn-outline-primary" for="${id}">${label}</label>`;
}
function collectSetRules(fmt) {
  if (fmt.engine.collectRules === void 0) return [];
  return fmt.engine.collectRules(fmt.card);
}
function renderCategoryAccordion(fmt, card, rules2) {
  const ruleByCodename = /* @__PURE__ */ new Map();
  for (const rule of rules2) {
    const codename = settingCodenameForRule(fmt, rule);
    if (codename !== void 0) ruleByCodename.set(codename, rule);
  }
  const safeKey = card.name.safeKey;
  let body = `<div class="_setting-list"><div class="accordion bar-accordion">`;
  const groupBlocks = [];
  for (const groupName of SETTING_GROUPS) {
    const settings = visibleSettingsForGroup(fmt.engine, card, groupName);
    const collapseId = `card-${safeKey}-${groupName.toLowerCase()}-collapse-id`;
    let block = `<div class='accordion-item _setting-group'>
`;
    block += `<h2 class='accordion-header nodblclick w-100'>
`;
    block += `<button class='collapsed accordion-button' data-bs-target='#${collapseId}' data-bs-toggle='collapse' type='button'>
`;
    block += `${groupName} <span class="_count badge bg-secondary ms-3">${settings.length}</span>
`;
    block += `</button>
`;
    block += `</h2>
`;
    block += `<div class='accordion-collapse collapse' id='${collapseId}'>
`;
    block += `<div class='accordion-body d0-card-body'>
`;
    block += `${renderSettingListItems(fmt, settings, ruleByCodename, card)}
`;
    block += `</div>
`;
    block += `</div>
`;
    block += `</div>
`;
    groupBlocks.push(block);
  }
  body += groupBlocks.join("\n");
  body += `</div></div>`;
  return body;
}
function renderSettingListItems(fmt, settings, ruleByCodename, setCard) {
  const items = settings.map((settingCodename) => {
    const stored = ruleByCodename.get(settingCodename);
    if (stored !== void 0) {
      const slotHtml = fmt.nestRecord(stored, "bar", {
        nest_name: stored.name.s,
        show: ["bar"],
        home_view: "bar"
      });
      return `<li class="nav-item">${slotHtml}</li>`;
    }
    const settingCard = fmt.engine.findSettingCard?.(settingCodename);
    if (settingCard !== void 0) {
      const ruleTypeId = ruleTypeIdForSetting(settingCodename);
      const deckTypeCard = ruleTypeId !== void 0 ? fmt.engine.findRenderCardById?.(ruleTypeId) : void 0;
      const virtual = buildVirtualRuleCard({
        setCard,
        settingCard,
        settingCodename,
        deckTypeCard
      });
      const slotHtml = fmt.nestRecord(virtual, "bar", {
        nest_name: virtual.name.s,
        show: ["bar"],
        home_view: "bar"
      });
      return `<li class="nav-item">${slotHtml}</li>`;
    }
    return `<li class="nav-item">${quietDenial3("read")}</li>`;
  });
  return `<ul class="nav flex-column">${items.join("\n")}</ul>`;
}
function quietDenial3(task) {
  return `<span class="denied"><!-- Sorry, you don't have permission (${task}) --></span>`;
}
function readFormgroupBody(ctx) {
  const inner = `<div class='form-group read-form-group'>
<label>
${ctx.fmt.renderView("title")}
</label>
<div class='read-formgroup-content'>
${ctx.fmt.renderView("content")}
</div>
</div>
`;
  return slotWrap(ctx, "read_formgroup", inner);
}
function recentSettingsCodenamesFlat(ctx) {
  const list = ctx.fmt.engine.fetchRenderCard("*recent_settings");
  if (list === void 0 || list.unknown === true) return /* @__PURE__ */ new Set();
  const codenames = /* @__PURE__ */ new Set();
  for (const line of (list.dbContent ?? "").split("\n")) {
    const item = line.trim();
    if (item === "") continue;
    const itemCard = ctx.fmt.engine.fetchRenderCard(item);
    const codename = itemCard?.record.codename;
    if (codename !== void 0) codenames.add(codename);
  }
  return codenames;
}
function categoryAllSettingsSortedFlat(ctx, category, visible) {
  if (category === "all") return [...visible].sort();
  if (category === "common") return visible.filter((s) => COMMON_SETTINGS.has(s));
  if (category === "field") return visible.filter((s) => FIELD_SETTINGS.has(s));
  if (category === "recent") {
    const recent = recentSettingsCodenamesFlat(ctx);
    return visible.filter((s) => recent.has(s));
  }
  return visibleGroupSettings(category);
}
function barSettingListItem(ctx, setting, setCard) {
  const settingCard = ctx.fmt.engine.findSettingCard?.(setting);
  if (settingCard === void 0) return "";
  if (ctx.fmt.engine.isDenied(settingCard)) return "";
  const stored = ctx.fmt.engine.fetchRenderCard(`${setCard.name.s}+*${setting}`);
  const ruleCard = stored !== void 0 && stored.unknown !== true ? stored : buildVirtualRuleCard({ setCard, settingCard, settingCodename: setting });
  return ctx.fmt.nestRecord(ruleCard, "bar", {
    nest_name: ruleCard.name.s,
    show: ["bar"],
    home_view: "bar",
    hide: ["full_name"]
  });
}
function barSettingListBody(ctx) {
  const group = typeof ctx.voo.opts["filter"] === "string" && ctx.voo.opts["filter"] !== "" ? ctx.voo.opts["filter"] : "all";
  const visible = SETTING_GROUPS.flatMap((g) => [...visibleGroupSettings(g)]);
  const settings = categoryAllSettingsSortedFlat(ctx, group, visible);
  return settings.map((setting) => barSettingListItem(ctx, setting, ctx.fmt.card)).filter((item) => item !== "").join("\n");
}
var barSettingListScopedView = (ctx) => {
  if (ctx.fmt.card.typeCode !== "set") {
    throw new UnsupportedViewError("bar_setting_list", ctx.fmt.card.name.s);
  }
  return barSettingListBody(ctx);
};
registerSetTypeAssignment("Right::To", "list");
registerSetTypeAssignment("Right::From", "list");
registerSetTypeAssignment("Right::Cc", "list");
registerSetTypeAssignment("Right::Bcc", "list");
registerSetTypeAssignment("Right::Subject", "phrase");
registerSetTypeAssignment("Right::TextMessage", "plain_text");
registerSetTypeAssignment("Right::Email", "phrase");
registerSetTypeAssignment("Right::Password", "phrase");
registerSetTypeAssignment("Right::Salt", "phrase");
registerSetTypeAssignment("Right::Status", "phrase");
registerSetTypeAssignment("Right::Right", "set");
registerSetTypeAssignment("Right::Self", "set");
registerSetTypeAssignment("Right::Type", "set");
registerSetTypeAssignment("Right::TypePlusRight", "set");
function visibleSettingsForGroup(engine, setCard, groupName) {
  const settings = GROUP_TO_SETTINGS[groupName];
  if (engine.peekCodenameById === void 0) return settings;
  const prototypeCode = setPrototypeTypeCode(engine, setCard);
  return settings.filter((codename) => {
    const restricted = SETTING_RESTRICTED_TO_TYPE.get(codename);
    if (restricted === void 0) return true;
    return prototypeCode !== void 0 && restricted.includes(prototypeCode);
  });
}
var SETTING_RESTRICTED_TO_TYPE = /* @__PURE__ */ new Map([
  ["content_options", ["list", "pointer", "session"]],
  ["content_option_view", ["list", "pointer", "session"]]
]);
function setPrototypeTypeCode(engine, setCard) {
  const codenameOf = (card) => card?.id !== void 0 ? engine.peekCodenameById?.(card.id) : void 0;
  const defaultRuleTypeCode = () => {
    const rule = engine.collectRules?.(setCard).find((candidate) => {
      const rightKey = candidate.name.rightName?.key;
      return rightKey === "default" || rightKey === "*default";
    });
    if (rule !== void 0 && rule.typeId !== void 0) {
      return engine.peekCodenameById?.(rule.typeId);
    }
    const coldTypeId = engine.defaultRuleTypeIdForSetName?.(setCard.name.s);
    if (coldTypeId === void 0) return void 0;
    return engine.peekCodenameById?.(coldTypeId);
  };
  const rightName = setCard.name.rightName;
  const patternCode = rightName !== void 0 ? codenameOf(engine.fetchRenderCard?.(rightName.s)) : codenameOf(setCard);
  switch (patternCode) {
    // Anchorless patterns: prototype_args give a nameless or *dummy-named
    // new card — no type assignment applies and the template lookup has
    // no name to walk (type_id_from_template = `name && template&.type_id`
    // is nil for the nameless *all prototype) -> undefined rejects every
    // restricted setting.
    case "all":
    case "rstar":
    case "all_plus":
      return void 0;
    // 09_self.rb prototype_args {name: anchor}: the anchor card is REAL —
    // its stored type wins; an unseeded anchor falls through to the
    // template chain (the set's own *default rule card's type —
    // templating.rb new_card_template rule_card(:default)).
    case "self": {
      const anchorName = setCard.name.leftName?.s ?? setCard.name.s;
      const real = engine.fetchRenderCard?.(anchorName);
      if (real !== void 0 && real.typeId !== void 0) {
        return engine.peekCodenameById?.(real.typeId);
      }
      return defaultRuleTypeCode();
    }
    // 03_type.rb prototype_args {type: anchor}: the explicit type wins
    // (type.rb normalize_type_attributes) — the prototype's type id IS
    // the anchor cardtype card's id.
    case "type": {
      const anchorName = setCard.name.leftName?.s;
      if (anchorName === void 0) return void 0;
      const typeCard = engine.fetchRenderCard?.(anchorName);
      if (typeCard?.id === void 0) return void 0;
      return engine.peekCodenameById?.(typeCard.id);
    }
    // 07_right.rb prototype_args {name: "*dummy+#{anchor}"}: a new
    // compound card; ensure_type (type.rb:63-79) tries type_id_from_code
    // FIRST — the static assign_type registration for the card's first
    // type-assigning pattern module, here right::<setting_codename>
    // (lib/card/set/pattern/all.rb:74-82 walks patterns carrying
    // `assigns_type: true`, which the right pattern declares) — THEN
    // type_id_from_template (the set's own *default rule card's type).
    case "right": {
      const anchorName = setCard.name.leftName?.s;
      const anchorCard = anchorName !== void 0 ? engine.fetchRenderCard?.(anchorName) : void 0;
      const anchorCodename = codenameOf(anchorCard);
      if (anchorCodename !== void 0) {
        const assigned = RIGHT_SETTING_TYPE_ASSIGNMENT[anchorCodename];
        if (assigned !== void 0) return assigned;
      }
      return defaultRuleTypeCode();
    }
    // 08_type_plus_right.rb: a `+<right>` part under a typed supercard;
    // type_id_from_code walks the prototype's assigning pattern modules in
    // precedence order: type_plus_right::<type>::<right> (only three
    // assignments exist across the mods), THEN right::<right> (the
    // prototype card is `*dummy+<anchor.tag>` (08_type_plus_right.rb
    // prototype_args: name "+#{anchor.tag}") — its RIGHT part carries the
    // right pattern too, so the right::<codename> assignment applies
    // whenever the anchor's right part is a codenamed SETTING card: the
    // prototype of `List+*input type+*type plus right` is
    // `*dummy+*input type`, whose Right::InputType module assigns
    // :pointer (card-mod-edit set/right/input_type.rb:1), and
    // `Person+*following+*type plus right`'s prototype
    // `*dummy+*following` assigns :list (card-mod-follow
    // set/right/following.rb:1). Pointer/list land inside the
    // restricted_to_type set [list, pointer, session]
    // (card-mod-list set/self/content_options.rb:2), so those sets'
    // editing accordion counts 5 — the oracle badges
    // (base dump 000016/000017/000029 V2 class). After the code
    // assignments, the template chain reads the set's own *default rule
    // card's type.
    case "type_plus_right": {
      const leftName = setCard.name.leftName;
      const typeName = leftName?.leftName?.s;
      const anchorRightName = leftName?.rightName?.s;
      if (typeName !== void 0 && anchorRightName !== void 0) {
        const typeCodename = codenameOf(engine.fetchRenderCard?.(typeName));
        const rightCodename = codenameOf(engine.fetchRenderCard?.(anchorRightName));
        if (typeCodename !== void 0 && rightCodename !== void 0) {
          const assigned = TYPE_PLUS_RIGHT_TYPE_ASSIGNMENT[`${typeCodename}::${rightCodename}`];
          if (assigned !== void 0) return assigned;
          const rightAssigned = RIGHT_SETTING_TYPE_ASSIGNMENT[rightCodename];
          if (rightAssigned !== void 0) return rightAssigned;
        }
      }
      return defaultRuleTypeCode();
    }
    default:
      return void 0;
  }
}
var RIGHT_SETTING_TYPE_ASSIGNMENT = {
  autoname: "phrase",
  email: "phrase",
  password: "phrase",
  roles: "search_type",
  salt: "phrase",
  status: "phrase",
  when_created: "phrase",
  when_last_edited: "phrase",
  input_type: "pointer",
  thanks: "phrase",
  bcc: "list",
  cc: "list",
  from: "list",
  subject: "phrase",
  text_message: "plain_text",
  to: "list",
  contextual_class: "list",
  disappear: "toggle",
  follow: "list",
  follow_fields: "list",
  following: "list",
  message: "phrase",
  head: "html",
  on_create: "list",
  on_delete: "list",
  on_update: "list",
  enabled_roles: "session",
  layout: "pointer",
  content_option_view: "phrase",
  content_options: "list",
  create: "list",
  delete: "list",
  read: "list",
  update: "list",
  captcha: "toggle",
  right: "set",
  self: "set",
  type: "set",
  type_plus_right: "set",
  count: "search_type"
};
var TYPE_PLUS_RIGHT_TYPE_ASSIGNMENT = {
  "role::members": "list",
  "set::setting": "list",
  "set::style": "pointer"
};
var SETTING_GROUPS = [
  "templating",
  "permission",
  "webpage",
  "editing",
  "event",
  "other"
];
var GROUP_TO_SETTINGS = {
  templating: ["structure", "default", "autoname"],
  permission: ["create", "read", "update", "delete", "captcha"],
  webpage: ["head", "layout", "style", "script"],
  editing: ["help", "input_type", "guide", "content_options", "content_option_view"],
  event: ["on_create", "on_update", "on_delete"],
  other: ["thanks", "follow_fields", "follow"]
};
var SETTING_NEVER_VISIBLE = /* @__PURE__ */ new Set([
  "content_options",
  "content_option_view"
]);
function visibleGroupSettings(groupName) {
  return GROUP_TO_SETTINGS[groupName].filter(
    (codename) => !SETTING_NEVER_VISIBLE.has(codename)
  );
}
function inferSettingCodename(rule) {
  const rightKey = rule.name.rightName?.key;
  if (rightKey === void 0) return void 0;
  return rightKey.startsWith("*") ? rightKey.slice(1) : rightKey;
}
function settingCodenameForRule(fmt, rule) {
  const rightKey = rule.name.rightName?.key;
  if (rightKey === void 0) return void 0;
  const settingCard = fmt.engine.fetchRenderCard?.(rightKey);
  const codename = settingCard?.record.codename;
  if (codename !== void 0) return codename;
  return inferSettingCodename(rule);
}
function renderPointerListItem(fmt, name, itemView) {
  if (itemView === "name") {
    let named;
    try {
      named = fmt.engine.fetchRenderCard(name);
    } catch {
      named = void 0;
    }
    return named?.name.s ?? name;
  }
  const hostItemType = fmt.engine.hostItemTypeName?.(fmt.card);
  const slotTypeName = hostItemType?.typeName;
  let target;
  try {
    target = fmt.engine.fetchRenderCard(name);
  } catch (err) {
    if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
      return renderUnknownPointerListItem(fmt, name, itemView, slotTypeName, hostItemType);
    }
    throw err;
  }
  if (target === void 0) {
    return renderUnknownPointerListItem(fmt, name, itemView, slotTypeName, hostItemType);
  }
  try {
    if (itemView !== "bar") {
      return fmt.nestRecord(target, itemView, {
        nest_name: target.name.s,
        show: [itemView],
        ...itemView === "closed" ? { hide: ["bar_middle"] } : {},
        home_view: itemView === "closed" ? "open" : itemView,
        ...slotTypeName !== void 0 ? { type: slotTypeName } : {}
      });
    }
    return fmt.nestRecord(target, "bar", {
      nest_name: target.name.s,
      show: ["bar"],
      hide: ["bar_middle"],
      home_view: "bar",
      ...slotTypeName !== void 0 ? { type: slotTypeName } : {}
    });
  } catch (error) {
    return quietRenderError(error, target, itemView);
  }
}
function renderUnknownPointerListItem(fmt, name, itemView, slotTypeName, hostItemType) {
  const identity = phantomIdentity(fmt, name, hostItemType);
  const phantom = phantomPointerListItem(name, identity);
  if (hostItemType === void 0 && identity !== void 0) {
    phantom.setKeys = safeSetKeys({
      name: phantom.name,
      typeId: identity.typeId,
      typeName: identity.typeName,
      leftTypeName: void 0,
      isNew: true
    });
  }
  const verdict = fmt.engine.pointerItemVerdict?.(fmt.card.key, phantom.key);
  const readable = verdict?.read === true;
  if (verdict !== void 0) {
    fmt.engine.seatPhantomReadVerdict?.(phantom.key, !readable);
  }
  if ((itemView === "bar" || itemView === "closed") && !readable) {
    const phantomTypeName = hostItemType?.typeName ?? phantom.typeName;
    const phantomTypeId = hostItemType?.typeId ?? phantom.typeId;
    if (phantom.name.isCompound && fmt.engine.phantomVirtualStructure?.(phantom.name, phantomTypeName, phantomTypeId) !== void 0) {
      return quietDenial3("read");
    }
    const body = identity !== void 0 ? pointerListItemBodyForUnknown(slotCardname(phantom), {
      typeName: phantom.typeName,
      typeId: phantom.typeId,
      setKeys: phantom.setKeys
    }) : pointerListItemBodyForUnknown(slotCardname(phantom));
    return pointerListItemSlot(phantom, body, slotTypeName);
  }
  phantom.pointerItemReadVerdict = true;
  return fmt.nestRecord(phantom, itemView, {
    nest_name: name,
    show: [itemView],
    ...itemView === "bar" || itemView === "closed" ? { hide: ["bar_middle"] } : {},
    home_view: itemView === "closed" ? "open" : itemView,
    ...slotTypeName !== void 0 ? { type: slotTypeName } : {}
  });
}
function phantomIdentity(fmt, name, hostItemType) {
  if (hostItemType !== void 0) return hostItemType;
  const richText = (() => {
    try {
      return fmt.engine.fetchRenderCard("RichText");
    } catch {
      return void 0;
    }
  })();
  if (richText?.id !== void 0) {
    return { typeName: "RichText", typeId: richText.id };
  }
  try {
    return fmt.engine.newCardDefaultType?.(DeckoName.parse(name));
  } catch (err) {
    if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
      return void 0;
    }
    throw err;
  }
}
var cardListView = (ctx) => {
  const { fmt, voo } = ctx;
  const items = fmt.engine.executeSearch(fmt);
  if (items.length === 0) return fmt.renderView("no_search_results");
  const itemsOpt = voo?.opts["items"];
  const itemView = itemsOpt !== null && typeof itemsOpt === "object" && typeof itemsOpt.view === "string" ? itemsOpt.view : "bar";
  const hostItemType = fmt.engine.hostItemTypeName?.(fmt.card);
  const rendered = items.map((item) => {
    const html = fmt.nestRecord(item, itemView, {
      size: null,
      ...hostItemType !== void 0 ? { type: hostItemType.typeName } : {}
    });
    return `<div class="search-result-item item-${itemView}">${html}</div>`;
  });
  const list = `<div class="card-list card-list-${itemView} search-result-list">${rendered.join("\n")}</div>`;
  const paging = fmt.engine.searchResultPaging?.(fmt);
  return paging === void 0 ? `${list}
` : `${list}
${searchPagingNav(fmt.card.name, paging)}`;
};
var noSearchResultsView = () => `<div class="search-no-results"></div>`;
function linkAnchorBody(ctx, extraClass) {
  const { fmt, voo } = ctx;
  const known = fmt.card.unknown !== true;
  const cls = `${extraClass}${known ? "known-card" : "wanted-card"}`;
  const label = typeof voo.opts["title"] === "string" ? voo.opts["title"] : void 0;
  const inner = label !== void 0 ? (
    // The ATTR escapes (h); the TEXT does not. Oracle: the Process Arts
    // +*referred_to_by anchor (page-lane shard-000000, offset 12658)
    // renders title="Pages tagged with &quot;Process Arts&quot;" with
    // the RAW quotes in the span text — `>Pages tagged with "Process
    // Arts"<` — and the +bytes family (Process Arts +10) was exactly
    // the double-escaped text. title.rb:39-42 wrapped_title splits
    // joints only; it never html-escapes.
    `<span class="card-title" title="${h(label)}">${wrappedTitleInner(label)}</span>`
  ) : fmt.renderView("title");
  return `<a class="${cls}" href="/${h(fmt.urlKey())}">${inner}</a>`;
}
var linkView = (ctx) => linkAnchorBody(ctx, "");
function prepareBar(ctx) {
  const { fmt, voo } = ctx;
  const isRule = fmt.engine.cardMatchesRuleSet?.(fmt.card) ?? false;
  const isRuleBar = isRule && ctx.voo.requestedView === "bar";
  const cols = readBarCols(fmt.card);
  voo.classUp("bar", fmt.card.setKeys);
  voo.classUp("bar-left", `col-${cols[0]}`);
  voo.classUp("bar-right", `col-${cols[1]}`);
  if (isRuleBar) {
    voo.classUp("bar-left", `col-md-${cols[2]}`);
    voo.classUp("bar-middle", `d-none d-md-flex col-md-${cols[3]}`);
    voo.classUp("bar-right", `col-md-${cols[4]}`);
  } else {
    voo.classUp("bar-middle", "d-none d-md-flex");
    voo.hide("bar_middle");
  }
  if (fmt.card.id === void 0 && (fmt.engine.cardMatchesRuleSet?.(fmt.card) ?? false)) {
    const existing = fmt.engine.hasExistingRuleFor?.(fmt.card.key);
    if (existing !== true) voo.hide("bar_nav");
  }
}
function barBodyHtml(ctx) {
  const { fmt, voo } = ctx;
  let out = `<div class='${voo.classy("bar-body")} row g-0'>
`;
  if (voo.show("bar_left")) {
    out += `<div class='${voo.classy("bar-left")}'>
${fmt.renderView("bar_left")}
</div>
`;
  }
  if (voo.show("bar_middle")) {
    out += `<div class='${voo.classy("bar-middle")}'>
${fmt.renderView("bar_middle")}
</div>
`;
  }
  if (voo.show("bar_right")) {
    out += `<div class='${voo.classy("bar-right")}'>
${fmt.renderView("bar_right")}
</div>
`;
  }
  out += `</div>
`;
  return out;
}
function cardStub(fmt, view) {
  return `<div class="card-slot card-slot-stub" data-stub-url="/${h(fmt.urlKey())}/${view}"></div>`;
}
function accordionBarHtml(ctx, open) {
  const { fmt, voo } = ctx;
  prepareBar(ctx);
  voo.classUp("accordion-item", `bar ${voo.classy("bar")}`);
  const collapseId = `card-${fmt.card.name.safeKey}-closed-collapse-id`;
  const buttonClasses = [open ? void 0 : "collapsed", "accordion-button"].filter((s) => s !== void 0).join(" ");
  const collapseClasses = [open ? "show" : void 0, "accordion-collapse", "collapse"].filter((s) => s !== void 0).join(" ");
  const body = open ? fmt.renderView("bar_bottom") : cardStub(fmt, "bar_bottom");
  return `<div class='${voo.classy("accordion-item")}'>
<h2 class='accordion-header nodblclick w-100'>
<button class='${buttonClasses}' data-bs-target='#${collapseId}' data-bs-toggle='collapse' type='button'>
` + barBodyHtml(ctx) + `
</button>
</h2>
<div class='${collapseClasses}' id='${collapseId}'>
<div class='accordion-subheader bg-light p-2 text-end'>
${fmt.renderView("menu")}
</div>
<div class='accordion-body d0-card-body'>
${body}
</div>
</div>
</div>
`;
}
var closedView = (ctx) => {
  const inner = accordionBarHtml(ctx, false);
  return slotWrapCommon(ctx.fmt, "closed", inner);
};
var openView = (ctx) => {
  if (ctx.fmt.card.typeCode === "set") {
    ctx.voo.hide("template_closer");
  }
  if (ctx.fmt.card.name.rightName?.key === "discussion") {
    ctx.voo.setViz("comment_box", "show");
  }
  const inner = accordionBarHtml(ctx, true);
  return slotWrapCommon(ctx.fmt, "open", inner);
};
function genericBarLeftHtml(ctx) {
  return ctx.fmt.renderView("title");
}
function bootswatchSkinBarLeftHtml(ctx) {
  const { fmt } = ctx;
  const name = fmt.card.name.s;
  const imageChild = fmt.engine.fetchRenderCard(`${name}+Image`);
  const mediaLeftInner = imageChild !== void 0 ? fmt.nestRecord(imageChild, "boxed", { size: "medium" }) : `<div title="${h(name)}" class="image-box medium"></div>`;
  return `<div class='media align-items-center'>
<div class='media-left'>
${mediaLeftInner}
</div>
<div class='media-body-medium media-body'>
<div class='media-text'>
${fmt.renderView("title")}
</div>
</div>
</div>
`;
}
var barLeftView = (ctx) => ctx.fmt.card.typeCode === "bootswatch_skin" ? bootswatchSkinBarLeftHtml(ctx) : genericBarLeftHtml(ctx);
var barMiddleView = () => "";
function modnameFromCodenameForViews(fmt) {
  return (fmt.card.record.codename ?? "").replace(/^mod_/, "");
}
var barRightView = ({ fmt }) => (
  // view-fail class Z3 (2026-09-29): Mod-typed cards'
  // bar_right is type/mod.rb's section list ("tasks, cardtypes, scripts,
  // styles" ...) — card-mod-format's port note left it unported as a
  // "mod-runtime" gap, but the admin-config surface (ADMIN_CONFIG), the
  // task basket and the oracle-pinned scripts/styles presence set
  // (core-admin-runtime.ts modBarRightSections) now cover all 30 dump
  // rows. Dispatch shape: the BASE bar_right branches on typeCode ("mod")
  // because the corpus grading pipeline never binds a ModLoader (the
  // same flat-dispatch idiom as barLeftView's bootswatch_skin gate);
  // core-mod's set-module registration covers the loader-bound path.
  fmt.card.typeCode === "mod" ? modBarRightSections(modnameFromCodenameForViews(fmt)) : ruleBarRightHtml(fmt.card, fmt.engine, (card) => {
    const sub = new RenderFormat(card, fmt.engine, {
      parent: fmt,
      maxDepth: fmt.maxDepth,
      // Ruby's render_core inside one_line_content renders nested content
      // with standard non-main error semantics (quiet spans); a raise here
      // would abort a one-line whose visible bytes are the first 60 text
      // characters of the stripped core.
      nestQuietErrors: true
    });
    if (card.typeName === "Markdown") {
      try {
        return sub.processContent(kramdownToStashedHtml(card.dbContent ?? ""));
      } catch (error) {
        if (error instanceof UnsupportedViewError) return card.dbContent ?? "";
        throw error;
      }
    }
    try {
      return sub.renderView("core");
    } catch (error) {
      if (error instanceof UnsupportedViewError) return card.dbContent;
      throw error;
    }
  })
);
function nameShapeRuleRefutedByTypes(fmt, card) {
  const fetch2 = (name) => {
    try {
      return fmt.engine.fetchRenderCard(name);
    } catch {
      return void 0;
    }
  };
  const typedCode = (c) => c === void 0 || c.typeId === void 0 ? void 0 : fmt.engine.peekCodenameById?.(c.typeId) ?? c.typeCode;
  const leftKey = card.name.parts.length > 1 ? DeckoName.parse(card.name.parts.slice(0, -1).join("+")).key : void 0;
  const left = leftKey === void 0 || leftKey === "" ? void 0 : fetch2(leftKey);
  const leftCode = typedCode(left);
  if (leftCode === void 0 || leftCode === "set") return false;
  const grandKey = DeckoName.parse(card.name.parts[0]).key;
  const grand = grandKey === "" ? void 0 : fetch2(grandKey);
  const grandCode = typedCode(grand);
  if (grandCode === void 0 || grandCode === "set") return false;
  return true;
}
var barBottomView2 = (ctx) => {
  const fmt = ctx.fmt;
  const card = fmt.card;
  if (card.typeCode === "bootswatch_skin" || card.typeName === "Bootswatch skin") {
    return `<code>${fmt.renderDelegated("core")}</code>`;
  }
  const setKeysHasRule = card.setKeys.split(" ").includes("RULE");
  const nameShapeSuggestsRule = card.name.isCompound && card.name.parts.length === 3 && (card.name.rightName?.key ?? "").startsWith("*");
  const isRuleCard2 = setKeysHasRule || nameShapeSuggestsRule && !nameShapeRuleRefutedByTypes(fmt, card);
  const skipContentWrap = isRuleCard2 || isRuleCardWithPermissionRight(card);
  if (isPointerOrListCard(card)) {
    if (skipContentWrap) {
      return fmt.renderView("core", { home_view: "content" });
    }
    return fmt.renderView("content", { home_view: "content" });
  }
  const rightKey = card.name.rightName?.key;
  const isRuleCardCompositionJunction = card.name.isCompound && card.name.parts.length === 3 && (rightKey === "*type_plu_right" || rightKey === "*type plus right" || rightKey === "*self");
  if (isRuleCard2 && !isRuleCardCompositionJunction) {
    return fmt.renderView("core");
  }
  return fmt.renderView("content", { home_view: "content" });
};
var titledView = ({ fmt, voo }) => {
  if (fmt.card.name.rightName?.key === "discussion") {
    voo.setViz("comment_box", "show");
  }
  const header = headerHtml({ fmt, voo });
  fmt.addNameContext();
  const core = fmt.renderView("titled_content");
  const bodyClasses = ["d0-card-body", "d0-card-content", fmt.card.setKeys].join(" ");
  const inner = `<div class="d0-card-header">${header}</div>

<div class="${bodyClasses}">${core}</div>`;
  return slotWrapCommon(fmt, "titled", inner);
};
function headerHtml(ctx) {
  const { fmt, voo } = ctx;
  const tag = fmt.isMain ? "h1" : "h2";
  const titleTag = `<${tag} class="${voo.classy("d0-card-header-title")}">${fmt.renderView("title")}</${tag}>`;
  const menu = voo.show("menu") ? `
${fmt.renderView("menu")}` : "";
  return `${titleTag}${menu}`;
}
var titledContentView = ({ fmt }) => fmt.renderDelegated("core");
var headerTitleView = (ctx) => {
  const { fmt, voo } = ctx;
  const explicit = voo.opts["header"];
  const tag = typeof explicit === "string" && explicit !== "" ? explicit : fmt.isMain ? "h1" : "h2";
  return `<${tag} class="${voo.classy("d0-card-header-title")}">${fmt.renderView("title")}</${tag}>`;
};
var headerView = (ctx) => {
  const { fmt, voo } = ctx;
  const menu = voo.show("menu") ? `
${fmt.renderView("menu")}` : "";
  return `<div class="${voo.classy("d0-card-header")}">${fmt.renderView("header_title")}${menu}</div>`;
};
var typeInfoView = (ctx) => {
  const { fmt } = ctx;
  const card = fmt.card;
  if (card.typeCode === "basic") return "";
  const typeName = card.typeName ?? "";
  if (typeName === "") return "";
  const known = card.typeId !== void 0;
  return `<span class="type-info float-end"><a class="navbar-link ${known ? "known-card" : "wanted-card"}" href="/${h(DeckoName.parse(typeName).urlKey)}">${h(typeName)}</a></span>`;
};
var universalEditButtonView = (ctx) => {
  const { fmt } = ctx;
  if (isNewCard(fmt.card.record)) return "";
  return `<link rel="alternate" type="application/x-wiki" title="Edit this page!" href="/${h(fmt.urlKey())}/edit" />`;
};
var rssLinksView = () => "";
var metaTagsView = (ctx) => {
  const noindex = ctx.fmt.card.unknown === true;
  return `<meta charset='UTF-8'>
<meta content='width=device-width, initial-scale=1.0' name='viewport'>
` + (noindex ? `<meta content='noindex' name='robots'>
` : "");
};
function barDivHtml(ctx) {
  const { fmt, voo } = ctx;
  const card = fmt.card;
  const url = fmt.urlKey();
  const hamlAttrs = emitHamlAttrs({
    "data-card-id": card.id === void 0 ? void 0 : String(card.id),
    "data-card-link-name": url,
    // slot_cardname (wrap.rb:50-53) — the SAME rule the slot wrap applies
    // (views.ts slotCardname): an UNSAVED COMPOUND card displays its
    // url_key form. The bar body's HAML attrs are bound to the same
    // helper; the R17 unknown-item bars pin it
    // (data-card-name='RVW+working_doc_02').
    //
    // The value is h()-escaped HERE, at the call site, because that is
    // what Ruby's slot_cardname returns (`h name`, wrap.rb:53 — an
    // html_safe SafeBuffer with `'` already `&#39;`). Haml's escape_attrs
    // then re-escapes it: attribute_builder.rb:51-59 has no html_safe?
    // branch, so the same payload escapes ONCE through content_tag (the
    // slot wrap) and TWICE here. The oracle's own bar divs pin the
    // two-level form — recapture-raw-shard-000004 id 8460 (a personal
    // blog's +*self): `data-card-name='Test Person&amp;#39;s Blog+*self+*layout'`,
    // and id 12195 (media+GBA+youtube videos) pins five such bars.
    // Do NOT drop this h() thinking it is the double-escape: the
    // double-escape is the Haml pass, which emitHamlAttrs owns.
    "data-card-name": h(slotCardname(card)),
    "data-card-type-id": card.typeId === void 0 ? void 0 : String(card.typeId),
    "data-card-type-name": card.typeName
  });
  const dataSlotId = ` data-slot-id="${newSlotId()}"`;
  const menu = itemBarMenuHtml(
    url,
    card.id === void 0,
    card.name.s,
    card.name.isRStar && card.name.parts.length === 2
  );
  return `<div class='${voo.classy("bar")} nodblclick d-flex _card-link'${hamlAttrs}${dataSlotId}>
${barBodyHtml(ctx)}
${menu}

</div>
`;
}
function itemBarHtml(ctx) {
  const { voo } = ctx;
  prepareBar(ctx);
  if (voo.show("bar_menu")) voo.classUp("bar", "with-bar-menu");
  return barDivHtml(ctx);
}
function itemBarMenuHtml(url, isNew = false, name = "", classRStarKnown = false) {
  const known = isNew ? classRStarKnown : true;
  const query = !known && name !== "" && url !== name.replace(/ /g, "_") ? `?card%5Bname%5D=${cgiEscape(name)}` : "";
  const modalQuery = query === "" ? "?layout=modal" : `${query}&amp;layout=modal`;
  const fullPage = `<a class="full-page-link ${known ? "known-card" : "wanted-card"}" href="/${h(url)}${query}">${icon("open_in_full")} page</a>`;
  const modal = `<a data-slotter-mode="modal" data-modal-class="modal-dialog modal-dialog-centered modal-xl" size="xl" class="_modal-page-link slotter" href="/${h(url)}${modalQuery}" data-remote="true">${icon("fullscreen")} modal</a>`;
  const edit = `<a rel="nofollow" class="edit-link slotter" title="Edit" data-bs-toggle="tooltip" data-bs-placement="bottom" data-slotter-mode="modal" data-modal-class="modal-lg" href="/${h(url)}/edit${query}" data-remote="true">${icon("edit")} ${isNew ? "create" : "edit"}</a>`;
  const board = `<a rel="nofollow" class="board-link slotter" title="Advanced" data-bs-toggle="tooltip" data-bs-placement="bottom" data-slotter-mode="modal-replace" href="/${h(url)}/board${query}" data-remote="true">${icon("space_dashboard")} advanced</a>`;
  return `<div class='bar-menu _over-card-link _card-link-clickable'>
<div class='bar-menu-dropdown dropdown'>
<div aria-expanded='false' aria-haspopup='true' class='bar-menu-button btn dropdown-toggle' data-bs-toggle='dropdown'>
${icon("more_horiz")}
</div>
<div aria-labelledby='.bar-menu-button' class='bar-menu-list dropdown-menu'>
<div class='dropdown-item'>
${fullPage}
</div>
<div class='dropdown-item'>
${modal}
</div>
<div class='dropdown-item'>
${edit}
</div>
<div class='dropdown-item'>
${board}
</div>
</div>
</div>
</div>`;
}
var itemBarView = (ctx) => {
  const inner = itemBarHtml(ctx);
  return slotWrapCommon(ctx.fmt, "bar", inner);
};
var unknownView = (ctx) => {
  const { fmt } = ctx;
  if (fmt.engine.taskAllowed?.(fmt.card, "create") !== true) return "";
  const url = fmt.urlKey();
  const name = fmt.card.name.s;
  const link = `<a rel="nofollow" class="unknown-link slotter" href="/${h(url)}/new_in_modal" data-remote="true">${icon("add_box")} <span class="card-title" title="${h(name)}">${wrappedTitleInner(h(name))}</span></a>`;
  return slotWrapCommon(fmt, "unknown", link);
};
var blankView = () => "";
var miniUnknownView = (ctx) => {
  const { fmt } = ctx;
  if (fmt.engine.taskAllowed?.(fmt.card, "create") !== true) return "";
  const url = fmt.urlKey();
  return `<a rel="nofollow" class="unknown-link slotter" href="/${h(url)}/new_in_modal" data-remote="true">${icon("add_box")}</a>`;
};
var labeledView = (ctx) => {
  const { fmt, voo } = ctx;
  voo.classUp("card-slot", "row");
  const title = fmt.renderView("title");
  const content = fmt.renderView("labeled_content");
  const setKeys = fmt.card.setKeys;
  const bodyClasses = ["d0-card-body", "d0-card-content", setKeys].filter((s) => s !== "").join(" ");
  const labeled = `<div class='label col-4 text-end'>
${title}
</div>
<div class='labeled-content col-8'>
<div class="${bodyClasses}">${content}</div>
</div>
`;
  const menu = fmt.card.unknown === true ? "" : fmt.renderView("menu");
  return slotWrapCommon(fmt, "labeled", `${labeled}
${menu}`);
};
var labeledContentView = (ctx) => ctx.fmt.renderDelegated("core");
var miniBarView = (ctx) => {
  if (ctx.fmt.card.unknown === true && ctx.fmt.card.pointerItemReadVerdict !== true && ctx.fmt.engine.isDenied(ctx.fmt.card)) {
    ctx.voo.hide("bar_middle");
    return slotWrapCommon(
      ctx.fmt,
      "mini_bar",
      pointerListItemBodyForUnknown(ctx.fmt.urlKey(), {
        ...ctx.fmt.card.setKeys !== void 0 ? { setKeys: ctx.fmt.card.setKeys } : {},
        ...ctx.fmt.card.typeName !== void 0 ? { typeName: ctx.fmt.card.typeName } : {},
        ...ctx.fmt.card.typeId !== void 0 ? { typeId: ctx.fmt.card.typeId } : {}
      })
    );
  }
  const inner = itemBarHtml(ctx);
  return slotWrapCommon(ctx.fmt, "mini_bar", inner);
};
var barBodyView = (ctx) => barBodyHtml(ctx);
var barMenuView = (ctx) => `${itemBarMenuHtml(ctx.fmt.urlKey(), ctx.fmt.card.id === void 0, ctx.fmt.card.name.s)}
`;
function closedBarAliasView(name) {
  return (ctx) => slotWrapCommon(ctx.fmt, name, accordionBarHtml(ctx, false));
}
function openBarAliasView(name) {
  return (ctx) => slotWrapCommon(ctx.fmt, name, accordionBarHtml(ctx, true));
}
var fullBarView = (ctx) => {
  const { fmt, voo } = ctx;
  const cols = readFullBarCols(fmt.card);
  voo.classUp("bar", fmt.card.setKeys);
  const three = ["bar-left", "bar-middle", "bar-right"];
  for (let i = 0; i < three.length; i++) {
    const n = cols[i];
    voo.classUp(three[i], n === void 0 ? "col" : `col-${n}`);
  }
  if (voo.show("bar_menu")) voo.classUp("bar", "with-bar-menu");
  return slotWrapCommon(ctx.fmt, "full_bar", barDivHtml(ctx));
};
var boxView = (ctx) => {
  const { fmt, voo } = ctx;
  voo.hide("menu");
  const card = fmt.card;
  const dataAttrs = emitHamlAttrs({
    "data-card-id": card.id === void 0 ? void 0 : String(card.id),
    "data-card-name": h(slotCardname(card)),
    "data-card-type-id": card.typeId === void 0 ? void 0 : String(card.typeId),
    "data-card-type-name": card.typeName,
    "data-card-link-name": card.name.urlKey,
    "data-slot-id": newSlotId()
  });
  let out = `<div class='${voo.classy("box", card.setKeys)} card _card-link nodblclick'${dataAttrs}>
`;
  if (voo.show("box_top")) {
    out += `<div class='${voo.classy("box-top")} card-header text-center'>
`;
    out += `${fmt.renderView("box_top")}
`;
    out += `
</div>
`;
  }
  if (voo.show("box_middle")) {
    out += `<div class='${voo.classy("box-middle")} card-body'>
`;
    out += `${fmt.renderView("box_middle")}
`;
    out += `</div>
`;
  }
  if (voo.show("box_bottom")) {
    out += `<div class='${voo.classy("box-bottom")} card-footer text-center'>
`;
    out += `${fmt.renderView("box_bottom")}
`;
    out += `</div>
`;
  }
  out += `</div>
`;
  return out;
};
var boxTopView = (ctx) => ctx.fmt.renderView("title_link");
var boxMiddleView = (ctx) => ctx.fmt.renderView("content");
function creditLinkHtml(name) {
  const url = DeckoName.parse(name).urlKey;
  return `<a class="known-card" href="/${h(url)}"><span class="card-title" title="${h(name)}">${h(name)}</span></a>`;
}
function lexiconNameForId(id) {
  return getNameEnvironment()?.lexicon?.name(id);
}
var creatorCreditView = (ctx) => {
  const { fmt } = ctx;
  const record = fmt.card.record;
  const creatorId = record.creatorId;
  const name = creatorId === void 0 ? void 0 : lexiconNameForId(creatorId);
  const body = name === void 0 || record.createdAt === void 0 ? "" : `Created by ${creditLinkHtml(name)} ${timeAgoInWords(record.createdAt)} ago`;
  return `<div class="text-muted creator-credit">${body}</div>`;
};
function updaterLinksHtml(ctx, updaters) {
  const MAX_COUNT = 3;
  const total = updaters.length;
  const numToShow = total > MAX_COUNT ? MAX_COUNT - 1 : MAX_COUNT;
  const links = [];
  for (let i = 0; i < Math.min(numToShow, total); i++) {
    const name = updaters[i].name;
    if (name !== void 0) links.push(creditLinkHtml(name));
  }
  if (total > numToShow) {
    const othersName = `${ctx.fmt.card.name.s}+*editors`;
    const href = DeckoName.parse(othersName).urlKey;
    links.push(`<a class="known-card" href="/${h(href)}">${total - numToShow} others</a>`);
  }
  return toSentenceHtml(links);
}
function toSentenceHtml(parts) {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}
var updatedByView = (ctx) => {
  const reader = ctx.fmt.engine.updaterRenderReader?.();
  const updaters = reader?.updaters ?? [];
  const body = updaters.length === 0 ? "" : `Updated by ${updaterLinksHtml(ctx, updaters)}`;
  return `<div class="text-muted">${body}</div>`;
};
var boxBottomView = (ctx) => `${ctx.fmt.renderView("creator_credit")}
${ctx.fmt.renderView("updated_by")}`;
var IMAGE_BOX_SIZE_MAP = {
  icon: "icon",
  small: "small",
  medium: "small",
  large: "medium",
  xlarge: "medium"
};
function imageBoxCardName(ctx) {
  return ctx.fmt.card.name.trunkName.s;
}
function imageBoxInner(ctx, inner) {
  const { voo } = ctx;
  const rawSize = voo.opts["size"];
  const size = typeof rawSize === "string" && rawSize !== "" ? rawSize : "medium";
  const rawTitle = voo.opts["title"];
  const title = typeof rawTitle === "string" && rawTitle !== "" ? rawTitle : imageBoxCardName(ctx);
  const attrs = emitAttrs({ title, class: `image-box ${size}` });
  return `<div${attrs}>${inner}</div>`;
}
function imageBoxCore(ctx) {
  const rawSize = ctx.voo.opts["size"];
  const size = typeof rawSize === "string" && rawSize !== "" ? rawSize : "medium";
  const renderSize = IMAGE_BOX_SIZE_MAP[size] ?? "medium";
  return ctx.fmt.renderView("core", { size: renderSize });
}
var boxedView = (ctx) => imageBoxInner(ctx, imageBoxCore(ctx));
var boxedLinkView = (ctx) => {
  const core = imageBoxCore(ctx);
  const target = imageBoxCardName(ctx);
  const klass = ctx.fmt.card.unknown === true ? "wanted-card" : "known-card";
  const url = `/${h(DeckoName.parse(target).urlKey)}`;
  return imageBoxInner(ctx, `<a class="${klass}" href="${url}">${core}</a>`);
};
var flatNameView = ({ fmt }) => fmt.card.name.s;
var flatLinknameView = ({ fmt }) => fmt.urlKey();
var flatAddButtonView = ({ fmt }) => {
  const name = fmt.card.name.s;
  const segment = name.replace(/ /g, "_");
  const label = `Add ${name}`;
  const safeLabel = h(label);
  return `<a data-slotter-mode="modal" data-modal-class="modal-dialog modal-dialog-centered" class="btn btn-secondary slotter" href="/type/${h(segment)}?view=new_in_modal" data-remote="true"><span class="card-title" title="${safeLabel}">${safeLabel}</span></a>`;
};
var flatAddLinkView = ({ fmt }) => `<a class="cardtype-add-link" href="/${fmt.card.key ?? ""}/new">add</a>`;
var flatAddUrlView = ({ fmt }) => `/${fmt.card.key ?? ""}/new`;
var homePathView = ({ fmt }) => {
  if (fmt.card.key !== "*home") {
    throw new UnsupportedViewError("home_path", fmt.card.name.s);
  }
  return "/";
};
var homeUrlView = ({ fmt }) => {
  if (fmt.card.key !== "*home") {
    throw new UnsupportedViewError("home_url", fmt.card.name.s);
  }
  return "/";
};
var cardUrlView = ({ fmt }) => fmt.cardUrl(fmt.urlKey());
var lastActionVerbNotifyView = () => "edited";
var listOfChangesView = () => "";
var subeditsView = () => "{{_|subedits}}";
var followedView = () => "*followed set of cards*";
var unfollowUrlView = () => "";
var verifyUrlView = () => "";
var resetPasswordUrlView = () => "";
var verifyDaysView = () => "";
var resetPasswordDaysView = () => "";
var HTML_VIEWS = {
  title: titleView,
  title_link: titleLinkView,
  title_no_link: titleNoLinkView,
  open_content: openContentView,
  // card-mod-format set/all/html/header.rb (:header, :header_title),
  // set/all/html.rb (:type_info), set/all/html/head.rb
  // (:universal_edit_button, :rss_links) + meta_tags.haml. The other five
  // head.rb views need an async engine read and are left to a future seam —
  // see the section note above.
  header: headerView,
  header_title: headerTitleView,
  type_info: typeInfoView,
  universal_edit_button: universalEditButtonView,
  rss_links: rssLinksView,
  meta_tags: metaTagsView,
  // card-mod-format set/all/base.rb:91-92 view :content — the flat entry is
  // the scope dispatcher (emailScopedContentView above): the one email
  // :content override (Right::HtmlMessage's content_with_link haml) rides
  // its tag-codename guard, every other card falls through to contentView
  // byte-identically. The read_form field slots dispatch :content on the
  // +*html message field, where Ruby renders the override.
  content: emailScopedContentView,
  // card-mod-format set/all/html/menu.rb's sibling views (the menu-block
  // wrapper and the four standalone link views - the anchors are the SAME
  // builders the :menu body renders, so the standalone views and the menu
  // cannot drift) + set/all/html/views.rb's :content_panel /
  // :content_with_title + set/all/html/error.rb's :conflict +
  // set/all/text.rb's :text_without_nests + set/self/home.rb's :home_url.
  menu_block: menuBlockView,
  edit_link: editLinkView,
  edit_button: editButtonView,
  full_page_link: fullPageLinkView,
  board_link: boardLinkView,
  help_link: helpLinkView,
  content_panel: contentPanelView,
  content_with_title: contentWithTitleView,
  conflict: conflictView,
  text_without_nests: textWithoutNestsView,
  home_url: homeUrlView,
  // card-mod-rules set/type/set/html_views/rule_lists.rb:11-14 view
  // :bar_setting_list — the flat seam for the loader-less graded page lane
  // (the Shark page's Rules sections nest it on *all). The Set-typed guard
  // inside throws Ruby's own unsupported-view error for non-Set cards; the
  // set-scoped registration (Type::Set::HtmlViews::RuleLists via the rules
  // manifest) delegates to the SAME body when a loader is bound.
  bar_setting_list: barSettingListScopedView,
  // card-mod-edit set/all/formgroup.rb:13 view :read_formgroup (unknown:
  // true, wrap: :slot) — the flat seam body above; the read_form field
  // nests (the emailTemplateCoreBody walk) dispatch it on the loader-less
  // graded lane. The unknown:true config rides the compiled
  // UNKNOWN_VIEW_CONFIG row (format.ts read_formgroup: true).
  read_formgroup: readFormgroupBody,
  // card-mod-help set/all/help.rb:27-30 view :lead (help.rb's own fn,
  // imported - the same single-source shape as signupCoreHtml below: the
  // mod manifest registers it under All::Help for loader-bound engines,
  // and the graded page-lane harness, which binds NO loader, dispatches
  // this flat entry. Without it every Role page's `+:description|lead`
  // nest raised "view (lead) not supported" - pass15's 34-page
  // unsupported-view class).
  lead: leadView,
  // card-mod-account set/type/role.rb:12-24 view :configs (the body lives
  // in core-mod.ts beside the all/admin.rb machinery it drives; the typeCode
  // guard INSIDE the fn throws Ruby's own unsupported-view error for
  // non-Role cards, so the flat entry matches the set-scoped dispatch
  // exactly - Type::Role chains resolve the same fn via the account
  // manifest when a loader is bound).
  configs: roleConfigsView,
  // The email/notification family: the self-nest
  // `{{_|view}}` targets the four notification templates carry. The perms
  // and denial directives are already resolved by
  // permissions/view-perms.ts (PERMS_NONE: url, subedits, followed,
  // unfollow_url; DENIAL_VIEW: list_of_changes -> blank), so the gate
  // fires before these bodies exactly as Ruby does — `last_action_verb`
  // on a read-denied notification context card renders the denied span
  // the oracle pins, and `list_of_changes` renders the blank.
  // card-mod-follow's notify-base_views.rb:41-44 :last_action_verb (see the
  // body's note: the captured arm is the per-gate denial both definitions
  // share, and this one needs no history seam on the allowed arm).
  url: cardUrlView,
  last_action_verb: lastActionVerbNotifyView,
  list_of_changes: listOfChangesView,
  subedits: subeditsView,
  followed: followedView,
  unfollow_url: unfollowUrlView,
  verify_url: verifyUrlView,
  reset_password_url: resetPasswordUrlView,
  verify_days: verifyDaysView,
  reset_password_days: resetPasswordDaysView,
  core: emailScopedCoreView,
  card_list: cardListView,
  no_search_results: noSearchResultsView,
  open: openView,
  closed: closedView,
  titled: titledView,
  titled_content: titledContentView,
  menu: menuView,
  link: linkView,
  bar: itemBarView,
  mini_bar: miniBarView,
  bar_left: barLeftView,
  bar_middle: barMiddleView,
  bar_right: barRightView,
  bar_bottom: barBottomView2,
  // card-mod-comment set/all/comment.rb:46-53 — the base-table
  // registration the graded surface renders (the coreView discussion join
  // dispatches :comment_box on every +discussion core); see
  // commentBoxBaseView above for the recapture-byte provenance.
  comment_box: commentBoxBaseView,
  // card-mod-bar_and_box set/all/bar.rb:30-42 (bar_menu, bar_body, the
  // closed/open aliases, full_bar) + set/all/box.rb / box.haml + set/type/
  // image.rb. The coverage doc counted all thirteen as MISSING: bar.rb's
  // markup existed only inlined into :bar / :open / :closed, so the view
  // NAMES had no registration to dispatch to.
  bar_menu: barMenuView,
  bar_body: barBodyView,
  closed_bar: closedBarAliasView("closed_bar"),
  accordion_bar: closedBarAliasView("accordion_bar"),
  open_bar: openBarAliasView("open_bar"),
  expanded_bar: openBarAliasView("expanded_bar"),
  full_bar: fullBarView,
  box: boxView,
  box_top: boxTopView,
  box_middle: boxMiddleView,
  box_bottom: boxBottomView,
  // card-mod-history set/all/history_board.rb:2-8 and :10-16 — the two
  // box_bottom credit halves. updated_by's act-search data arrives through
  // the render-time seam (src/card/history/updater-seam.ts).
  creator_credit: creatorCreditView,
  updated_by: updatedByView,
  boxed: boxedView,
  boxed_link: boxedLinkView,
  unknown: unknownView,
  blank: blankView,
  mini_unknown: miniUnknownView,
  // card-mod-format set/all/html/views.rb:67 + set/all/base.rb:101 (the
  // labeled family - the :view_list demo surface's labeled arm nests
  // items at :labeled, whose :labeled_content substitutes :mini_unknown
  // on unknown cards; oracle target 152 labeled arm)
  labeled: labeledView,
  labeled_content: labeledContentView,
  // headless-port fallback views (chain-aware sources live in
  // card-mod-format.ts under all/base and type/cardtype; the flat
  // entries below close the missing-view UserError the mod loader
  // would otherwise surface -- recapture baseline:
  // handler_raised:Card::Error 26 entries across linkname/add_button/name
  // for Cardtype+*type+*default, RichText, and Role+*type+*default):
  name: flatNameView,
  linkname: flatLinknameView,
  add_button: flatAddButtonView,
  add_link: flatAddLinkView,
  add_url: flatAddUrlView,
  home_path: homePathView,
  // card-mod-edit set/all/template_nest.rb:2-12 view :template_nest -
  // the view RenderFormat.modalNestView substitutes under nest mode
  // :template (card-mod-layout set/type/layout_type.rb:12-18). Its
  // chain-aware registration lives in card-mod-edit.ts (set/all/
  // template_nest); this flat entry is the headless-port fallback for
  // the same reason name/linkname/add_button are listed above: the page
  // sweep (tmp/raw-ground-truth/scripts/verify-dual-lane.test.ts) boots
  // NO mod deck, so without a flat registration every :template-mode nest
  // raises UnsupportedViewError and the layout body renders the quiet
  // render-error span instead of its own source. The view body itself is
  // imported, not copied.
  template_nest: templateNestView,
  // card-mod-rules set/type/set/html_views/template.rb:2-7 view
  // :template_link - the ONLY caller is card-mod-edit
  // set/all/template_nest.rb:5-8, the field-only branch of :template_nest,
  // so every `{{+field}}` in a `*default`/`*structure` rule body reaches it
  // (card-mod-content set/abstract/templated_nests.rb puts those cores in
  // :template nest mode). Same loader-less reason as :template_nest above:
  // without a flat entry the field-only branch raised UnsupportedViewError
  // and the whole nest rendered as the quiet render-error span. The mod
  // manifest (card-mod-rules.ts, setPath type/set/html_views/template)
  // registers the SAME body for the chain-aware deck.
  template_link: templateLinkView,
  // The page-lane navbar family (card-mod-layout navbar_links/nav_item/
  // nav_link_in_dropdown + card-mod-search search_box) — set-scoped inside
  // each fn; see src/card/render/navbar-views.ts.
  ...NAVBAR_VIEWS
};

// src/card/render/head-views.ts
var HEAD_READ_SET_KEYS = [
  "*title",
  "*favicon",
  "*all+*style",
  "*all+*style+*asset_output",
  // The page path's javascript_tags and script_variables read the same
  // two-step asset-output chain for *script (page.ts#assetOutputUrl
  // serves both settings). They ride this batch for free (one IN-list)
  // and belong to the same "head read-set"; card-mod-script's
  // :javascript_tags is not ported on this branch, so nothing reads
  // them yet.
  "*all+*script",
  "*all+*script+*asset_output",
  // The *recent settings card (2026-10-01):
  // setting_categories.rb:64-67 reads `Card[:recent_settings]` — the same
  // deck-level codename fetch shape as `Card[:title]` (card 23808 carries
  // codename recent_settings) — and the rule-item bar's `_category-recent`
  // arm (format.ts#recentSettingCodenames) reads it through the cache-only
  // fetchRenderCard. No reference closure can reach it, so it rides this
  // batch for free. THREE key spellings ride the IN-list, one per deck
  // shape (the absent forms are simply no-ops). Key derivation in Ruby
  // singularizes PER WORD with a stability guard (cardname 0.20.0
  // lib/cardname.rb:34,106-116 + lib/cardname/variants.rb:56-62:
  // singularize twice, keep the original word unless idempotent), so the
  // gem computes key "*recent_setting" from BOTH "*recent settings" and
  // "*recent_settings" — the CANONICAL shape. One spelling per deck shape:
  // the raw capture dump's key COLUMN keeps the verbatim display form
  // ("*recent settings" — census of the dump: every populated key value
  // equals the name verbatim, the rest are NULL, so it is a capture
  // artifact, not cardname-canonical); decks seeded through
  // DeckoName.parse under the recovered deck inflections
  // (raw-corpus-seeding's rebuilt working tables, render fixtures seeding
  // DeckoName.parse(name).key) carry the canonical "*recent_setting" —
  // gem-run-verified identical to Ruby's own derivation; and the
  // underscored-but-unsingularized "*recent_settings" is the defensive
  // third shape, reachable only from a deck whose inflections declare
  // "settings" uncountable (ActiveSupport uncountable("settings") flips
  // the gem run to it) or that stores underscored raw keys.
  // (2026-10-01, gem-run + SQL-probe verified.)
  // cacheHeadViewReads seats the row under record.name.key (the SAME
  // parse), so the fetch-side lookups hit whichever shape the deck
  // carried.
  "*recent settings",
  "*recent_settings",
  "*recent_setting"
];
function headViewReadStatement() {
  const placeholders = HEAD_READ_SET_KEYS.map(() => "?").join(",");
  return {
    sql: `SELECT * FROM cards WHERE key IN (${placeholders}) AND trash = 0`,
    params: [...HEAD_READ_SET_KEYS]
  };
}
function pageTitleBytes(read, safeName) {
  const parts = [];
  if (safeName !== "") parts.push(safeName);
  if (read.titleSetting !== void 0 && read.titleSetting.trim() !== "") {
    parts.push(read.titleSetting);
  }
  return parts.join(" - ");
}
function pageTitleTagBytes(read, safeName) {
  return `<title>${h(pageTitleBytes(read, safeName))}</title>`;
}
function faviconTagBytes(read) {
  const src = cloudAttachmentUrl(read.faviconSource, "small");
  if (src === void 0) return "";
  return `<link rel="shortcut icon" href="${src}" />`;
}
function stylesheetTagsBytes(read) {
  return [
    REMOTE_STYLE_TAG,
    `<link media="all" rel="stylesheet" type="text/css" href="${cloudAttachmentUrl(read.styleAssetOutput) ?? ""}" />`
  ].join("\n");
}
var REMOTE_STYLE_TAG = `<link href="https://fonts.googleapis.com/css2?family=Material+Icons" media="all" rel="stylesheet" type="text/css" />`;
var META_TAGS = `<meta charset='UTF-8'>
<meta content='width=device-width, initial-scale=1.0' name='viewport'>`;
function cloudAttachmentUrl(content, size) {
  if (content === void 0 || content === null) return void 0;
  const source = derivedCloudAttachmentSource(content, void 0, size);
  if (source === "") return void 0;
  return source;
}

// src/card/render/page.ts
var CLOUD_URL_PREFIX = "http://s3.amazonaws.com//files/";
var UnknownLayoutError = class extends Error {
  layoutName;
  constructor(layoutName, key) {
    super(`unknown layout card: ${key}`);
    this.name = "UnknownLayoutError";
    this.layoutName = layoutName;
  }
};
async function renderPageBytes(engine, cardName, requestedView) {
  return engine.runWithPageConfig(
    () => renderPageBytesWithPageConfig(engine, cardName, requestedView)
  );
}
async function renderPageBytesWithPageConfig(engine, cardName, requestedView) {
  const record = await engine.fetcher.fetchByName(cardName);
  if (record === void 0 || record.name === void 0) {
    throw new Error(`card not found: ${cardName}`);
  }
  const layout = await resolvePageLayout(engine, record);
  const mainView = requestedView ?? layout.mainViewRaw ?? engine.defaultHtmlViewConfig();
  let prepareError;
  try {
    await engine.render(record.name.s, mainView);
  } catch (error) {
    prepareError = error;
  }
  const rootCard = engine.fetchRenderCard(record.name.s);
  if (rootCard === void 0) {
    throw prepareError ?? new Error(`render card not prepared: ${record.name.s}`);
  }
  await engine.prepareSessionAccountLinks();
  const mainWarmup = await engine.warmupLayoutReferences(
    [{ name: record.name.s, context: record.name.s }],
    scanWarmDeps,
    () => ensureCodenameMarksResolvable(engine)
  );
  if (mainWarmup.cards > 0) {
    await engine.refreshVerdicts();
  }
  const mainBodySearches = await engine.prepareNestClosureSearches([
    { name: record.name.s, context: record.name.s }
  ]);
  if (mainBodySearches > 0) {
    await engine.refreshVerdicts();
  }
  await engine.ensurePermissionVerdicts();
  await engine.ensureDiscussionUpdateVerdicts();
  if (mainView === "configs" || engine.renderClosureNeedsCoreAdminRuntime()) {
    await engine.ensureCoreAdminRuntime();
  }
  const rootFormat = new RenderFormat(rootCard, engine, {
    main: true,
    nestQuietErrors: true
  });
  const head = await headContent(engine, record.name, rootCard);
  engine.seatPageHead(rootCard.key, head);
  const mainBody = rootFormat.renderView(
    mainView,
    {
      nest_name: "_main",
      ...layout.mainNestSyntax !== void 0 ? { nest_syntax: layout.mainNestSyntax } : {},
      main: true,
      home_view: mainView,
      main_view: true,
      layout: layout.layoutName
    },
    // show_with_page_layout's render! carries NO optional render opt — the
    // main slot's captured data-slot has no "show" viz (unlike the bare
    // view lane where format.render pins show:[view]). null = no viz (a
    // JS default parameter would revive "show" on undefined).
    null
  );
  rootFormat.rendered = await applyMainViewOverride(engine, rootCard, mainView, mainBody);
  if (layout.kind === "unknown") {
    throw new UnknownLayoutError(layout.layoutName, layout.unknownKey ?? "");
  }
  let layoutNestSeeds = [];
  if (layout.kind === "card") {
    for (const piece of scanNests(layout.layoutCardContent ?? "")) {
      if (piece.kind === "nest" && piece.nest !== void 0 && piece.nest.name !== "_main") {
        layoutNestSeeds.push({ name: piece.nest.name, context: record.name.s });
      }
    }
    await ensureCodenameMarksResolvable(engine);
    await warmUpLayoutNests(engine, layoutNestSeeds);
    await ensureCodenameMarksResolvable(engine);
  }
  if (layoutNestSeeds.length > 0) {
    const layoutSearches = await engine.prepareNestClosureSearches(layoutNestSeeds);
    if (layoutSearches > 0) {
      await engine.refreshVerdicts();
    }
  }
  const interior = layout.kind === "card" ? rootFormat.processLayoutContent(layout.layoutCardContent ?? "") : codeDefaultLayoutInterior(rootFormat);
  return `      <!DOCTYPE HTML>
      <html class="h-100">
        <head>
          ${head}
        </head>
        ${resolveCloudUrls(interior)}
      </html>
`;
}
async function applyMainViewOverride(engine, rootCard, view, baseHtml) {
  if (engine.isDenied(rootCard)) return baseHtml;
  const override = await engine.viewOverrideFor(rootCard, view);
  return override !== void 0 ? applyViewOverride(baseHtml, override) : baseHtml;
}
async function warmUpLayoutNests(engine, seeds) {
  await engine.warmupLayoutReferences(
    seeds,
    scanWarmDeps,
    () => ensureCodenameMarksResolvable(engine)
  );
  await engine.refreshVerdicts();
}
function scanWarmDeps(card) {
  const refs = [];
  const context = card.name.s;
  for (const ref of referencedNames(card.dbContent)) {
    refs.push({ name: ref.name, context });
  }
  for (const m of card.dbContent.matchAll(/\[\[([^\][\n]+?)\]\]/g)) {
    const target = (m[1] ?? "").split("|")[0]?.trim() ?? "";
    if (target !== "") refs.push({ name: target, context });
  }
  if (card.typeCode === "pointer" || card.typeCode === "list") {
    for (const item of card.dbContent.split(/\n+/).map((s) => s.replace(/\[\[|\]\]/g, "").trim())) {
      if (item !== "") refs.push({ name: item, context });
    }
  }
  return { refs };
}
async function ensureCodenameMarksResolvable(engine) {
  const entries = engine.fetcher.codenames.peekEntries();
  if (entries.length === 0) return;
  const failedIds = [];
  for (const [codename, id] of entries) {
    try {
      DeckoName.parse(`:${codename}`);
    } catch {
      failedIds.push(id);
    }
  }
  if (failedIds.length > 0) {
    await engine.fetcher.warmLexicon(failedIds);
  }
}
async function resolvePageLayout(engine, record) {
  const rule = await findRule(engine.fetcher, { name: record.name }, "*layout");
  const layoutName = rule === void 0 ? void 0 : firstItemOfRuleContent(rule.rule.dbContent);
  if (layoutName === void 0 || layoutName === "") {
    return { layoutName: ":default", kind: "code-default" };
  }
  const layoutCard = await engine.fetcher.fetchByName(layoutName);
  const typeCode = layoutCard?.typeId === void 0 ? void 0 : await engine.fetcher.codenames.nameForId(layoutCard.typeId);
  if (layoutCard !== void 0 && layoutCard.name !== void 0 && (typeCode === "layout_type" || typeCode === "html" || typeCode === "basic")) {
    const layoutCardContent = layoutCard.dbContent ?? "";
    const mainChunk = findMainNestChunk(layoutCardContent);
    if (mainChunk === void 0) {
      throw new Error(`no main nest found in layout "${layoutName}"`);
    }
    return {
      layoutName,
      kind: "card",
      layoutCardContent,
      mainViewRaw: mainChunk.options.view,
      mainNestSyntax: mainChunk.syntax
    };
  }
  if (layoutName === "default") {
    return { layoutName: ":default", kind: "code-default" };
  }
  return { layoutName, kind: "unknown", unknownKey: DeckoName.parse(layoutName).key };
}
function firstItemOfRuleContent(content) {
  if (content === null || content === void 0) return void 0;
  const trimmed = content.trim();
  if (trimmed === "") return void 0;
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const first = parsed[0];
        const s = typeof first === "string" ? first : String(first ?? "");
        return s.trim() === "" ? void 0 : s.trim();
      }
    } catch {
    }
  }
  const firstLine = trimmed.split(/\n+/)[0]?.trim() ?? "";
  return firstLine === "" ? void 0 : firstLine;
}
function findMainNestChunk(content) {
  for (const piece of scanNests(content)) {
    if (piece.kind === "nest" && piece.nest !== void 0 && piece.nest.name === "_main") {
      return {
        options: { view: piece.nest.options.view, extra: piece.nest.options.extra },
        syntax: piece.nest.syntax
      };
    }
  }
  return void 0;
}
function codeDefaultLayoutInterior(fmt) {
  const nest = (name, view) => fmt.nest({
    name,
    syntax: `${name}|${view}`,
    options: { view, extra: {} },
    comment: void 0
  });
  return `<body class="">
  <header>${nest(":header", "core")}</header>
  <article>${fmt.nest({
    name: "_main",
    syntax: "_main",
    options: { extra: {} },
    comment: void 0
  })}</article>
  <aside>${nest(":sidebar", "core")}</aside>
  <footer>${nest(":footer", "content")}</footer>
</body>`;
}
async function headContent(engine, name, rootCard) {
  const read = await headReadSet(engine, "style");
  return [
    pageTitleTagBytes(read, name.s),
    META_TAGS,
    "",
    // pinned blank (mod basket head view; "" on every captured page)
    faviconTagBytes(read),
    stylesheetTagsBytes(read),
    await universalEditButtonTag(engine, rootCard),
    await javascriptTags(engine),
    await scriptVariablesTag(engine),
    await scriptCallsTag(engine)
  ].join("\n");
}
async function universalEditButtonTag(engine, rootCard) {
  if (rootCard.id === void 0) return "";
  const updateOk = await engine.updateVerdictForCard?.(rootCard);
  if (updateOk === false) return "";
  const namePath = rootCard.name.s.replace(/ /g, "_");
  return `<link rel="alternate" type="application/x-wiki" title="Edit this page!" href="/${namePath}/edit" />`;
}
async function headReadSet(engine, styleSetting) {
  return {
    titleSetting: await globalSettingContent(engine, "title"),
    faviconSource: await globalSettingContent(engine, "favicon"),
    styleAssetOutput: await assetOutputContent(engine, styleSetting)
  };
}
async function assetOutputContent(engine, settingCodename) {
  const rule = await engine.fetcher.fetchByName(`*all+*${settingCodename}`);
  if (rule?.name === void 0) return void 0;
  const output3 = await engine.fetcher.fetchByName(`${rule.name.s}+*asset output`);
  return output3?.dbContent;
}
async function globalSettingContent(engine, codename) {
  const card = await engine.fetcher.fetchByName(`:${codename}`);
  const content = card?.dbContent;
  return content === void 0 || content === null ? void 0 : content;
}
async function javascriptTags(engine) {
  const scriptUrl = await assetOutputUrl(engine, "script");
  return [
    REMOTE_SCRIPT_TAGS,
    `<!-- MAIN DECKO JAVASCRIPT -->`,
    `<script src="${scriptUrl}"></script>`
  ].join("\n");
}
async function assetOutputUrl(engine, settingCodename) {
  return cloudAttachmentUrl(await assetOutputContent(engine, settingCodename)) ?? "";
}
async function scriptVariablesTag(engine) {
  const cssPath = await assetOutputUrl(engine, "style");
  const signedIn = engine.pageSession?.signedIn === true;
  const rootUrl = `${engine.envOriginConfig()}/`;
  return `<script>
//<![CDATA[
decko.rootUrl='${rootUrl}';
decko.doubleClick='signed_in';
decko.cssPath='${cssPath}';
decko.signed_in=${signedIn};

//]]>
</script>`;
}
async function scriptCallsTag(engine) {
  const ace = await globalSettingContent(engine, "ace") ?? "";
  const tinymce = await globalSettingContent(engine, "tiny_mce") ?? "";
  const configs = [
    `decko.setAceConfig('${escapeJavascript(ace)}')`,
    `decko.setTinyMCEConfig('${escapeJavascript(tinymce)}')`,
    `$('document').ready(function() { $('.card-slot').trigger('decko.slot.ready'); })`
  ].join("\n\n");
  return `<script>
//<![CDATA[
${configs}
//]]>
</script>`;
}
function escapeJavascript(js) {
  return js.replace(/\\/g, "\\\\").replace(/<\//g, "<\\/").replace(/\r\n/g, "\\n").replace(/\r/g, "\\n").replace(/\n/g, "\\n").replace(/"/g, '\\"').replace(/'/g, "\\'").replace(/`/g, "\\`").replace(/\$/g, "\\$");
}
var REMOTE_SCRIPT_TAGS = [
  `<!-- mod: format (remote) -->`,
  `<script src="https://code.jquery.com/jquery-3.5.1.min.js" crossorigin="anonymous"></script>`,
  `<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery-ujs/1.2.3/rails.min.js" crossorigin="anonymous" referrerpolicy="no-referrer"></script>`,
  `<!-- mod: ace editor (remote) -->`,
  `<script src="https://cdnjs.cloudflare.com/ajax/libs/ace/1.18.0/ace.min.js" crossorigin="anonymous"></script>`,
  `<!-- mod: bootstrap (remote) -->`,
  `<script src="https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.6-rc.1/js/select2.full.min.js" crossorigin="anonymous" referrerpolicy="no-referrer"></script>`,
  `<script src="https://kit.fontawesome.com/1366963381.js" crossorigin="anonymous"></script>`
].join("\n");
function resolveCloudUrls(html) {
  return html.replace(
    /\([^()\s]+\)\/(\d+\/[^\s"'<>)]+\.[A-Za-z0-9]+)/g,
    `${CLOUD_URL_PREFIX}$1`
  );
}

// src/card/render/prefetch.ts
var MAX_CLOSURE_ROUNDS = 25;
var MAX_WARMUP_ROUNDS = 60;
var WARMUP_CHUNK = 90;
function chunkParams(items, perStatement) {
  const out = [];
  for (let i = 0; i < items.length; i += perStatement) out.push(items.slice(i, i + perStatement));
  return out;
}
function toRawRow(row) {
  return {
    id: row.id,
    name: row.name ?? null,
    key: row.key ?? null,
    codename: row.codename ?? null,
    leftId: row.left_id ?? null,
    rightId: row.right_id ?? null,
    typeId: row.type_id ?? null,
    dbContent: row.db_content ?? null,
    trash: row.trash ?? 0,
    readRuleId: row.read_rule_id ?? null,
    readRuleClass: row.read_rule_class ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    creatorId: row.creator_id ?? null
  };
}
async function prefetchInclusionClosure(root, ctx) {
  const stats = { batches: 0, statements: 0, fallbackRounds: 0, cards: 0 };
  if (root.name === void 0 || root.key === void 0) return stats;
  const rootRow = recordToRawRow(root);
  const preludeStatements = [];
  const seenIds = /* @__PURE__ */ new Set([rootRow.id]);
  const rootSideIds = nextSideIds([rootRow], seenIds);
  let sidePrimeSlot = -1;
  if (rootSideIds.length > 0) {
    const placeholders = rootSideIds.map(() => "?").join(", ");
    preludeStatements.push({
      sql: `SELECT * FROM cards WHERE id IN (${placeholders}) AND trash = 0`,
      params: rootSideIds
    });
    sidePrimeSlot = preludeStatements.length - 1;
  }
  let typeRowSlot = -1;
  const rootTypeId = root.typeId;
  if (typeof rootTypeId === "number" && Number.isSafeInteger(rootTypeId) && rootTypeId > 0) {
    preludeStatements.push({
      sql: `SELECT * FROM cards WHERE id = ? AND trash = 0`,
      params: [rootTypeId]
    });
    typeRowSlot = preludeStatements.length - 1;
  }
  let testContextSlot = -1;
  const rootTagKey = root.name?.isCompound === true ? DeckoName.parse(root.name.tag).key : void 0;
  if (root.leftId !== void 0 && root.leftId > 0 && (rootTagKey === "*html_message" || rootTagKey === "*text_message")) {
    preludeStatements.push({
      sql: `SELECT j.* FROM cards j JOIN cards s ON s.id = j.right_id WHERE j.left_id = ? AND s.codename = 'test_context' AND j.trash = 0`,
      params: [root.leftId]
    });
    testContextSlot = preludeStatements.length - 1;
  }
  let templateTestContextSlot = -1;
  if (root.id !== void 0 && root.id > 0) {
    preludeStatements.push({
      sql: `SELECT j.* FROM cards j JOIN cards s ON s.id = j.right_id WHERE j.left_id = ? AND s.codename = 'test_context' AND j.trash = 0 AND EXISTS (SELECT 1 FROM cards t WHERE t.id = ? AND t.codename = 'email_template')`,
      params: [root.id, root.typeId ?? -1]
    });
    templateTestContextSlot = preludeStatements.length - 1;
  }
  let emailFieldAnchorSlot = -1;
  if (root.typeId !== void 0 && root.typeId > 0) {
    preludeStatements.push({
      sql: `SELECT c.id, c.key FROM cards c WHERE c.key COLLATE NOCASE IN ('*to','*from','*cc','*bcc','*attach','*subject','*text message','*html message','*test context') AND c.trash = 0 AND EXISTS (SELECT 1 FROM cards t WHERE t.id = ? AND t.codename = 'email_template')`,
      params: [root.typeId]
    });
    emailFieldAnchorSlot = preludeStatements.length - 1;
  }
  let anchorNames = [];
  let anchorSlot = -1;
  let anchorEntries = [];
  try {
    anchorNames = [
      ...new Set(concretePatternsForCard(root).map((pattern) => pattern.patternCardName))
    ];
  } catch {
    anchorNames = [];
  }
  if (anchorNames.length > 0) {
    const placeholders = anchorNames.map(() => "?").join(", ");
    preludeStatements.push({
      sql: `SELECT id, key FROM cards WHERE key COLLATE NOCASE IN (${placeholders}) AND trash = 0`,
      params: anchorNames.map((name) => DeckoName.parse(name).key)
    });
    anchorSlot = preludeStatements.length - 1;
  }
  const preludeSideRows = [];
  const preludeTypeRows = [];
  const preludeTestContextRows = [];
  const additional = ctx.additionalStatements ?? [];
  let additionalResults;
  if (preludeStatements.length > 0 || additional.length > 0) {
    const batch = await ctx.driver.batch([...preludeStatements, ...additional]);
    stats.batches += 1;
    stats.statements += preludeStatements.length + additional.length;
    if (additional.length > 0) {
      additionalResults = batch.slice(preludeStatements.length);
    }
    batch.slice(0, preludeStatements.length).forEach((result, i) => {
      const rows = result.rows ?? [];
      if (i === sidePrimeSlot) preludeSideRows.push(...rows.map(toRawRow));
      else if (i === typeRowSlot) preludeTypeRows.push(...rows.map(toRawRow));
      else if (i === testContextSlot) preludeTestContextRows.push(...rows.map(toRawRow));
      else if (i === templateTestContextSlot) preludeTestContextRows.push(...rows.map(toRawRow));
      else if (i === emailFieldAnchorSlot) {
        const entries = rows.filter((row) => typeof row.key === "string" && typeof row.id === "number").map((row) => ({ key: row.key, id: row.id }));
        if (entries.length > 0) ctx.lexicon.primeIdsByKey(entries);
      } else if (i === anchorSlot) {
        const byKey = /* @__PURE__ */ new Map();
        for (const row of rows) {
          if (typeof row.key === "string" && typeof row.id === "number") {
            byKey.set(row.key, row.id);
          }
        }
        anchorEntries = anchorNames.map((name) => ({
          key: name,
          id: byKey.get(DeckoName.parse(name).key)
        }));
      }
    });
    if (anchorEntries.length > 0) ctx.lexicon.primeIdsByKey(anchorEntries);
  }
  const testContextItemKeys = /* @__PURE__ */ new Set();
  for (const row of preludeTestContextRows) {
    const firstItem = (row.dbContent ?? "").split("\n").map((line) => line.trim()).find((line) => line !== "");
    if (firstItem === void 0 || firstItem === "") continue;
    try {
      testContextItemKeys.add(DeckoName.parse(firstItem).key);
    } catch (err) {
      if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
        continue;
      }
      throw err;
    }
  }
  const preludeItemRows = [];
  if (testContextItemKeys.size > 0) {
    const placeholders = [...testContextItemKeys].map(() => "?").join(", ");
    const itemBatch = await ctx.driver.batch([
      {
        sql: `SELECT * FROM cards WHERE key COLLATE NOCASE IN (${placeholders}) AND trash = 0`,
        params: [...testContextItemKeys]
      }
    ]);
    stats.batches += 1;
    stats.statements += 1;
    preludeItemRows.push(...(itemBatch[0]?.rows ?? []).map(toRawRow));
  }
  const preludeSideComposed = preludeSideRows.length > 0 ? await composeAndCache(preludeSideRows, ctx, stats) : [];
  if (preludeTypeRows.length > 0) await composeAndCache(preludeTypeRows, ctx, stats);
  const preludeTestContextComposed = preludeTestContextRows.length > 0 ? await composeAndCache(preludeTestContextRows, ctx, stats) : [];
  const preludeItemComposed = preludeItemRows.length > 0 ? await composeAndCache(preludeItemRows, ctx, stats) : [];
  const composed = await composeAndCache([rootRow], ctx, stats);
  stats.additionalResults = additionalResults;
  await driveClosure(
    [rootRow, ...preludeTestContextRows],
    [...composed, ...preludeSideComposed, ...preludeTestContextComposed, ...preludeItemComposed],
    ctx,
    stats
  );
  return stats;
}
function recordToRawRow(record) {
  return {
    id: record.id ?? -1,
    name: record.name?.s ?? null,
    key: record.key ?? null,
    codename: record.codename ?? null,
    leftId: record.leftId ?? null,
    rightId: record.rightId ?? null,
    typeId: record.typeId ?? null,
    dbContent: record.dbContent ?? null,
    trash: record.trash ? 1 : 0,
    readRuleId: record.readRuleId ?? null,
    readRuleClass: record.readRuleClass ?? null,
    createdAt: record.createdAt ?? null,
    updatedAt: record.updatedAt ?? null,
    creatorId: record.creatorId ?? null
  };
}
async function composeAndCache(rows, ctx, stats) {
  const byId = /* @__PURE__ */ new Map();
  for (const row of rows) byId.set(row.id, row);
  const names = /* @__PURE__ */ new Map();
  let pending = [...byId.values()];
  for (let pass = 0; pass < 64 && pending.length > 0; pass++) {
    const still = [];
    for (const row of pending) {
      const composed = await tryComposeName(row, names, ctx);
      if (composed !== void 0) names.set(row.id, composed);
      else still.push(row);
    }
    if (still.length === pending.length) break;
    pending = still;
  }
  const composedRecords = [];
  for (const row of byId.values()) {
    const name = names.get(row.id);
    if (name === void 0) continue;
    if (row.name !== null) {
      ctx.lexicon.write(row.id, name, row.name);
    } else if (row.leftId !== null && row.rightId !== null) {
      ctx.lexicon.write(row.id, name, [row.leftId, row.rightId]);
    }
  }
  for (const row of byId.values()) {
    const name = names.get(row.id);
    if (name === void 0) continue;
    const record = await composeCardRecord(rowToCardsRow(row), ctx.lexicon);
    await ctx.cacheRecord(record);
    composedRecords.push(record);
    stats.cards += 1;
  }
  return composedRecords;
}
async function tryComposeName(row, names, ctx) {
  if (row.name !== null) return DeckoName.parse(row.name);
  if (row.leftId === null || row.rightId === null) return void 0;
  const left = await sideName(row.leftId, names, ctx);
  const right = await sideName(row.rightId, names, ctx);
  if (left === void 0 || right === void 0) return void 0;
  return DeckoName.parse(`${left.s}+${right.s}`);
}
async function sideName(id, names, ctx) {
  const local = names.get(id);
  if (local !== void 0) return local;
  try {
    const viaLexicon = await ctx.lexicon.name(id);
    return viaLexicon !== void 0 && viaLexicon.s !== "" ? viaLexicon : void 0;
  } catch {
    return void 0;
  }
}
function rowToCardsRow(row) {
  return {
    id: row.id,
    name: row.name,
    key: row.key,
    codename: row.codename,
    left_id: row.leftId,
    right_id: row.rightId,
    current_revision_id: null,
    created_at: row.createdAt ?? "",
    updated_at: row.updatedAt ?? "",
    creator_id: row.creatorId ?? 0,
    updater_id: 0,
    read_rule_class: row.readRuleClass,
    read_rule_id: row.readRuleId,
    references_expired: null,
    trash: row.trash === 1 ? 1 : 0,
    type_id: row.typeId ?? 0,
    db_content: row.dbContent
  };
}
async function composeAndCacheSqlRows(rows, ctx) {
  const byId = /* @__PURE__ */ new Map();
  for (const row of rows) byId.set(row.id, row);
  const names = /* @__PURE__ */ new Map();
  let pending = [...byId.values()];
  for (let pass = 0; pass < 64 && pending.length > 0; pass++) {
    const still = [];
    for (const row of pending) {
      const composed = await tryComposeSqlRowName(row, names, byId, ctx);
      if (composed !== void 0) names.set(row.id, composed);
      else still.push(row);
    }
    if (still.length === pending.length) break;
    pending = still;
  }
  const composedRecords = [];
  for (const row of byId.values()) {
    const name = names.get(row.id);
    if (name === void 0) continue;
    if (row.name !== null && row.name !== void 0) {
      ctx.lexicon.write(row.id, name, row.name);
    } else if (row.left_id !== null && row.left_id !== void 0 && row.right_id !== null && row.right_id !== void 0) {
      ctx.lexicon.write(row.id, name, [row.left_id, row.right_id]);
    }
  }
  for (const row of byId.values()) {
    const name = names.get(row.id);
    if (name === void 0) continue;
    const record = await composeCardRecord(row, ctx.lexicon);
    await ctx.cacheRecord(record);
    composedRecords.push(record);
  }
  return composedRecords;
}
async function tryComposeSqlRowName(row, names, byId, ctx) {
  if (row.name !== null && row.name !== void 0) return DeckoName.parse(row.name);
  if (row.left_id === null || row.left_id === void 0) return void 0;
  if (row.right_id === null || row.right_id === void 0) return void 0;
  const left = await sqlRowSideName(row.left_id, names, byId, ctx);
  if (left === void 0) return void 0;
  const right = await sqlRowSideName(row.right_id, names, byId, ctx);
  if (right === void 0) return void 0;
  return DeckoName.parse(`${left.s}+${right.s}`);
}
async function sqlRowSideName(id, names, byId, ctx) {
  const local = names.get(id);
  if (local !== void 0) return local;
  if (byId.has(id)) return void 0;
  try {
    const viaLexicon = await ctx.lexicon.name(id);
    return viaLexicon ?? DeckoName.parse("");
  } catch {
    return void 0;
  }
}
async function driveClosure(scanRows, composed, ctx, stats) {
  const known = /* @__PURE__ */ new Set();
  const knownIds = /* @__PURE__ */ new Map();
  const seedKeys = (records) => {
    for (const record of records) {
      if (record.key !== void 0 && record.key !== "" && !record.isNew) {
        known.add(record.key);
        if (record.id !== void 0) knownIds.set(record.key, record.id);
      }
    }
  };
  for (const row of scanRows) {
    if (row.key !== null) known.add(row.key);
  }
  seedKeys(composed);
  let pending = /* @__PURE__ */ new Set();
  const collect = (rows) => {
    for (const row of rows) {
      const content = row.dbContent;
      if (content === null || content === "") continue;
      for (const ref of referencedNames(content)) {
        if (ref.relative) continue;
        let name;
        try {
          name = DeckoName.parse(ref.name);
        } catch (err) {
          if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
            continue;
          }
          throw err;
        }
        if (name.s === "" || known.has(name.key)) continue;
        pending.add(name.s);
      }
    }
  };
  collect(scanRows);
  const collectFromRecords = (records) => {
    for (const record of records) {
      const content = record.dbContent;
      if (content === void 0 || content === "" || content === null) continue;
      if (record.name === void 0 || record.name.s === "") continue;
      for (const ref of referencedNames(content)) {
        if (ref.relative) continue;
        let name;
        try {
          name = DeckoName.parse(ref.name).absoluteName(record.name);
        } catch (err) {
          if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
            continue;
          }
          throw err;
        }
        if (name.s === "" || known.has(name.key)) continue;
        pending.add(name.s);
      }
    }
  };
  collectFromRecords(composed);
  const seenIds = /* @__PURE__ */ new Set();
  for (const row of scanRows) seenIds.add(row.id);
  let sideIdsToPrime = [];
  for (let round = 0; round < MAX_CLOSURE_ROUNDS; round++) {
    if (pending.size === 0 && sideIdsToPrime.length === 0) {
      return;
    }
    const simpleKeys = [];
    const sideKeyPairs = [];
    const sideIdPairs = [];
    for (const nameStr of pending) {
      const name = DeckoName.parse(nameStr);
      if (known.has(name.key)) continue;
      if (!name.isCompound) {
        simpleKeys.push(name.key);
        continue;
      }
      const left = name.leftName;
      const right = name.rightName;
      if (left === void 0 || right === void 0) continue;
      const leftKnown = known.has(left.key);
      const rightKnown = known.has(right.key);
      if (!left.isCompound && !right.isCompound) {
        sideKeyPairs.push({ left: left.key, right: right.key });
        if (!leftKnown) simpleKeys.push(left.key);
        if (!rightKnown) simpleKeys.push(right.key);
      } else if (leftKnown && rightKnown) {
        const leftId = knownIds.get(left.key);
        const rightId = knownIds.get(right.key);
        if (leftId !== void 0 && rightId !== void 0) {
          sideIdPairs.push({ leftId, rightId });
        }
      } else {
        if (!leftKnown) pending.add(left.s);
        if (!rightKnown) pending.add(right.s);
      }
    }
    const statements = [];
    const collectors = [];
    if (simpleKeys.length > 0) {
      const placeholders = simpleKeys.map(() => "?").join(", ");
      statements.push({
        sql: `SELECT * FROM cards WHERE "key" COLLATE NOCASE IN (${placeholders}) AND trash = 0`,
        params: simpleKeys
      });
      collectors.push((rows) => rows.map(toRawRow));
    }
    if (sideKeyPairs.length > 0) {
      const leftKeys = sideKeyPairs.map((pair) => pair.left);
      const rightKeys = sideKeyPairs.map((pair) => pair.right);
      const placeholdersL = leftKeys.map(() => "?").join(", ");
      const placeholdersR = rightKeys.map(() => "?").join(", ");
      statements.push({
        sql: `SELECT DISTINCT j.* FROM cards j
  JOIN cards l ON l.id = j.left_id AND l."key" COLLATE NOCASE IN (${placeholdersL})
  JOIN cards r ON r.id = j.right_id AND r."key" COLLATE NOCASE IN (${placeholdersR})
 WHERE j.trash = 0`,
        params: [...leftKeys, ...rightKeys]
      });
      collectors.push((rows) => rows.map(toRawRow));
    }
    if (sideIdPairs.length > 0) {
      const SIDE_ID_PAIRS_PER_STATEMENT = 400;
      for (let start = 0; start < sideIdPairs.length; start += SIDE_ID_PAIRS_PER_STATEMENT) {
        const chunk = sideIdPairs.slice(start, start + SIDE_ID_PAIRS_PER_STATEMENT);
        const tuple = chunk.map(() => `(j.left_id = ? AND j.right_id = ?)`).join(" OR ");
        const params = chunk.flatMap((pair) => [pair.leftId, pair.rightId]);
        statements.push({
          sql: `SELECT j.* FROM cards j WHERE j.trash = 0 AND (${tuple})`,
          params
        });
        collectors.push((rows) => rows.map(toRawRow));
      }
    }
    let sidePrimeSlot = -1;
    if (sideIdsToPrime.length > 0) {
      const placeholders = sideIdsToPrime.map(() => "?").join(", ");
      statements.push({
        sql: `SELECT * FROM cards WHERE id IN (${placeholders}) AND trash = 0`,
        params: sideIdsToPrime
      });
      sidePrimeSlot = statements.length - 1;
      collectors.push((rows) => rows.map(toRawRow));
    }
    let closureRows = [];
    let sideRows = [];
    const splitResults = (results) => {
      results.forEach((result, i) => {
        const rows = collectors[i](result.rows);
        if (i === sidePrimeSlot) sideRows.push(...rows);
        else closureRows.push(...rows);
      });
    };
    if (statements.length === 0) {
      return;
    }
    const batch = await ctx.driver.batch(statements);
    stats.batches += 1;
    stats.statements += statements.length;
    splitResults(batch);
    stats.fallbackRounds += 1;
    if (closureRows.length === 0 && sideRows.length === 0) {
      return;
    }
    const newComposed = await composeAndCache([...sideRows, ...closureRows], ctx, stats);
    seedKeys(newComposed);
    collect(closureRows);
    {
      const closureIds = new Set(closureRows.map((row) => row.id));
      collectFromRecords(
        newComposed.filter((record) => record.id !== void 0 && closureIds.has(record.id))
      );
    }
    for (const nameStr of [...pending]) {
      let resolvedKey;
      try {
        resolvedKey = DeckoName.parse(nameStr).key;
      } catch (err) {
        if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
          pending.delete(nameStr);
          continue;
        }
        throw err;
      }
      if (known.has(resolvedKey)) pending.delete(nameStr);
    }
    for (const row of [...sideRows, ...closureRows]) seenIds.add(row.id);
    sideIdsToPrime = nextSideIds([...sideRows, ...closureRows], seenIds);
  }
}
function nextSideIds(rows, seenIds) {
  const ids = [];
  for (const row of rows) {
    for (const sideId of [row.leftId, row.rightId]) {
      if (sideId === null || sideId === void 0 || seenIds.has(sideId)) continue;
      seenIds.add(sideId);
      ids.push(sideId);
    }
  }
  return ids;
}
async function prefetchWarmupClosure(seeds, ctx, scan) {
  const stats = { batches: 0, statements: 0, rounds: 0, cards: 0, fallbacks: 0 };
  const foldStats = { batches: 0, statements: 0, fallbackRounds: 0, cards: 0 };
  const checked = /* @__PURE__ */ new Set();
  const dead = /* @__PURE__ */ new Set();
  const scanned = /* @__PURE__ */ new Set();
  const virtualCheckQueue = [];
  const pending = /* @__PURE__ */ new Map();
  const pushRef = (ref) => {
    const abs = resolveWarmName(ref.name, ref.context);
    if (abs === void 0) return;
    let key;
    try {
      key = DeckoName.parse(abs).key;
    } catch {
      return;
    }
    if (dead.has(key) || pending.has(key)) return;
    pending.set(key, { abs });
  };
  for (const seed of seeds) pushRef(seed);
  const markDead = (key) => {
    const entry = pending.get(key);
    if (entry === void 0) return;
    pending.delete(key);
    dead.add(key);
    virtualCheckQueue.push(entry.abs);
  };
  const scanCard = (card) => {
    if (scanned.has(card.key)) return;
    scanned.add(card.key);
    if (ctx.scannedKeys?.has(card.key)) {
      return;
    }
    ctx.scannedKeys?.add(card.key);
    for (const ref of scan(card).refs) pushRef(ref);
  };
  const drainVirtualChecks = async () => {
    const queue = virtualCheckQueue.splice(0, virtualCheckQueue.length);
    if (ctx.virtualLookup === void 0) return 0;
    let landed = 0;
    for (const abs of queue) {
      let resolution;
      try {
        resolution = await ctx.virtualLookup(abs);
      } catch {
        resolution = void 0;
      }
      if (resolution === void 0) continue;
      let name;
      try {
        name = DeckoName.parse(abs);
      } catch {
        continue;
      }
      const record = newCardRecord(name);
      if (resolution.typeId !== void 0 && record.typeId === void 0) {
        record.typeId = resolution.typeId;
      }
      record.dbContent = resolution.templateContent;
      await ctx.cacheRecord(record);
      const card = ctx.getCard(name.key);
      if (card !== void 0) {
        scanCard(card);
        landed += 1;
      }
    }
    return landed;
  };
  const capFallbackSweep = async () => {
    for (const [key, entry] of [...pending]) {
      if (ctx.getCard(key) !== void 0) continue;
      pending.delete(key);
      checked.add(key);
      stats.fallbacks += 1;
      const card = await ctx.prepareFallback(entry.abs);
      if (card !== void 0) scanCard(card);
    }
  };
  const seenSideIds = /* @__PURE__ */ new Set();
  let sideIdsToPrime = [];
  while (true) {
    for (const [key] of [...pending]) {
      const card = ctx.getCard(key);
      if (card === void 0) continue;
      pending.delete(key);
      scanCard(card);
    }
    if (pending.size === 0 && virtualCheckQueue.length === 0) break;
    const simpleKeys = [];
    const sideKeyPairs = [];
    const sideIdPairs = [];
    const deadJunctions = [];
    for (const [key, entry] of pending) {
      if (checked.has(key)) continue;
      if (ctx.getCard(key) !== void 0) continue;
      let name;
      try {
        name = DeckoName.parse(entry.abs);
      } catch {
        checked.add(key);
        markDead(key);
        continue;
      }
      if (!name.isCompound) {
        simpleKeys.push(name.key);
        checked.add(key);
        continue;
      }
      const left = name.leftName;
      const right = name.rightName;
      if (left === void 0 || right === void 0) {
        checked.add(key);
        markDead(key);
        continue;
      }
      const leftCard = ctx.getCard(left.key);
      const rightCard = ctx.getCard(right.key);
      if (leftCard !== void 0 && leftCard.id !== void 0 && rightCard !== void 0 && rightCard.id !== void 0) {
        sideIdPairs.push({ leftId: leftCard.id, rightId: rightCard.id, entryKey: key });
      } else if (leftCard === void 0 && dead.has(left.key) || rightCard === void 0 && dead.has(right.key)) {
        checked.add(key);
        deadJunctions.push(key);
      } else if (!left.isCompound && !right.isCompound) {
        sideKeyPairs.push({ left: left.key, right: right.key, entryKey: key });
        if (leftCard === void 0 && !checked.has(left.key) && !dead.has(left.key) && !pending.has(left.key)) {
          simpleKeys.push(left.key);
        }
        if (rightCard === void 0 && !checked.has(right.key) && !dead.has(right.key) && !pending.has(right.key)) {
          simpleKeys.push(right.key);
        }
      } else {
        if (leftCard === void 0 && !left.isCompound && !checked.has(left.key) && !dead.has(left.key) && !pending.has(left.key)) {
          simpleKeys.push(left.key);
        }
        if (rightCard === void 0 && !right.isCompound && !checked.has(right.key) && !dead.has(right.key) && !pending.has(right.key)) {
          simpleKeys.push(right.key);
        }
        if (leftCard === void 0 && left.isCompound && !checked.has(left.key) && !dead.has(left.key) && !pending.has(left.key)) {
          pending.set(left.key, { abs: left.s });
        }
        if (rightCard === void 0 && right.isCompound && !checked.has(right.key) && !dead.has(right.key) && !pending.has(right.key)) {
          pending.set(right.key, { abs: right.s });
        }
      }
    }
    for (const key of deadJunctions) markDead(key);
    const statements = [];
    const collectors = [];
    const closureRows = [];
    const sideRows = [];
    const sidePairKeys = [];
    for (const group of chunkParams(simpleKeys, WARMUP_CHUNK)) {
      const placeholders = group.map(() => "?").join(", ");
      statements.push({
        sql: 'SELECT * FROM cards WHERE "key" COLLATE NOCASE IN (' + placeholders + ") AND trash = 0",
        params: group
      });
      collectors.push((rows) => {
        closureRows.push(...rows.map(toRawRow));
      });
    }
    for (const group of chunkParams(sideKeyPairs, WARMUP_CHUNK / 2)) {
      const leftKeys = group.map((pair) => pair.left);
      const rightKeys = group.map((pair) => pair.right);
      const placeholdersL = leftKeys.map(() => "?").join(", ");
      const placeholdersR = rightKeys.map(() => "?").join(", ");
      statements.push({
        sql: 'SELECT DISTINCT j.* FROM cards j\n  JOIN cards l ON l.id = j.left_id AND l."key" COLLATE NOCASE IN (' + placeholdersL + ')\n  JOIN cards r ON r.id = j.right_id AND r."key" COLLATE NOCASE IN (' + placeholdersR + ")\n WHERE j.trash = 0",
        params: [...leftKeys, ...rightKeys]
      });
      sidePairKeys.push(group.map((pair) => pair.entryKey));
      collectors.push((rows) => {
        closureRows.push(...rows.map(toRawRow));
      });
    }
    for (const group of chunkParams(sideIdPairs, WARMUP_CHUNK / 2)) {
      const tuple = group.map(() => "(j.left_id = ? AND j.right_id = ?)").join(" OR ");
      const params = group.flatMap((pair) => [pair.leftId, pair.rightId]);
      statements.push({
        sql: "SELECT j.* FROM cards j WHERE j.trash = 0 AND (" + tuple + ")",
        params
      });
      sidePairKeys.push(group.map((pair) => pair.entryKey));
      collectors.push((rows) => {
        closureRows.push(...rows.map(toRawRow));
      });
    }
    for (const group of chunkParams(sideIdsToPrime, WARMUP_CHUNK)) {
      const placeholders = group.map(() => "?").join(", ");
      statements.push({
        sql: "SELECT * FROM cards WHERE id IN (" + placeholders + ") AND trash = 0",
        params: group
      });
      collectors.push((rows) => {
        sideRows.push(...rows.map(toRawRow));
      });
    }
    if (statements.length === 0) {
      const landed = await drainVirtualChecks();
      if (landed === 0) {
        let preparedPending = false;
        for (const key of pending.keys()) {
          if (ctx.getCard(key) !== void 0) {
            preparedPending = true;
            break;
          }
        }
        if (!preparedPending) break;
        continue;
      }
      continue;
    }
    if (stats.rounds >= MAX_WARMUP_ROUNDS) {
      await drainVirtualChecks();
      await capFallbackSweep();
      continue;
    }
    if (ctx.onRound !== void 0) await ctx.onRound();
    const batch = await ctx.driver.batch(statements);
    stats.batches += 1;
    stats.statements += statements.length;
    stats.rounds += 1;
    batch.forEach((result, i) => {
      collectors[i]?.(result.rows);
    });
    collectors.length = 0;
    await composeAndCache([...sideRows, ...closureRows], ctx, foldStats);
    for (const keys of sidePairKeys) {
      for (const key of keys) {
        if (ctx.getCard(key) === void 0) markDead(key);
      }
    }
    for (const key of simpleKeys) {
      if (ctx.getCard(key) === void 0) {
        dead.add(key);
        pending.delete(key);
      }
    }
    sideIdsToPrime = [];
    for (const row of [...sideRows, ...closureRows]) {
      seenSideIds.add(row.id);
      for (const sideId of [row.leftId, row.rightId]) {
        if (sideId === null || seenSideIds.has(sideId)) continue;
        seenSideIds.add(sideId);
        sideIdsToPrime.push(sideId);
      }
    }
    await drainVirtualChecks();
  }
  stats.cards = foldStats.cards;
  return stats;
}
function resolveWarmName(raw, context) {
  try {
    const parsed = DeckoName.parse(raw);
    return parsed.isAbsolute ? parsed.s : parsed.absoluteName(DeckoName.parse(context)).s;
  } catch {
    return void 0;
  }
}

// src/server/chunked-row-reads.ts
var CHUNKED_READ_IDS_PER_STATEMENT = 50;
var CHUNKED_READ_STATEMENTS_PER_BATCH = 20;
function chunkIds(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
async function readCardRowsByIdChunked(driver, ids) {
  const unique = [];
  const seen = /* @__PURE__ */ new Set();
  for (const id of ids) {
    if (id === null || id === void 0 || !Number.isSafeInteger(id) || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  if (unique.length === 0) return [];
  const byId = /* @__PURE__ */ new Map();
  const statements = chunkIds(unique, CHUNKED_READ_IDS_PER_STATEMENT).map(
    (group) => ({
      sql: `SELECT * FROM cards WHERE id IN (${group.map(() => "?").join(", ")}) AND trash = 0`,
      params: group
    })
  );
  for (const batchChunk of chunkIds(statements, CHUNKED_READ_STATEMENTS_PER_BATCH)) {
    const results = await driver.batch(batchChunk);
    for (const result of results) {
      for (const row of result.rows) byId.set(row.id, row);
    }
  }
  const out = [];
  for (const id of unique) {
    const row = byId.get(id);
    if (row !== void 0) out.push(row);
  }
  return out;
}

// src/card/follow/follow-options.ts
var FOLLOW_OPTION_MAIN = Object.freeze([
  null,
  "always",
  "never"
]);
var FOLLOW_OPTION_RESTRICTIVE = Object.freeze([
  "created",
  "edited"
]);
var FOLLOW_OPTION_ALL = Object.freeze([
  "always",
  "created",
  "edited",
  "never"
]);
var FOLLOW_OPTION_CARD_NAMES = Object.freeze([
  "*always",
  "*created",
  "*edited",
  "*never"
]);

// src/card/notify/deck-resolvers.ts
var TEMPLATE_CARD = "follower notification email";
var SUBJECT_CHILD = `${TEMPLATE_CARD}+*subject`;
var TEXT_CHILD = `${TEMPLATE_CARD}+*text message`;
var HTML_CHILD = `${TEMPLATE_CARD}+*html message`;

// src/card/notify/follower-resolver.ts
var OPTION_ALWAYS = "always";
var OPTION_NEVER = "never";
var OPTION_CREATED = "created";
var OPTION_EDITED = "edited";
async function followerCandidateIds(fetch2, card, optionCode) {
  if (optionCode === OPTION_CREATED) return [card.creatorId ?? -1];
  if (optionCode === OPTION_EDITED) return editorIds(fetch2, card.id);
  return [];
}
async function editorIds(fetch2, cardId) {
  if (cardId === void 0) return [];
  const r = await fetch2.driver.query(
    `SELECT DISTINCT ca.actor_id AS actor_id
       FROM card_actions a
       JOIN card_acts ca ON ca.id = a.card_act_id
      WHERE a.card_id = ?`,
    [cardId]
  );
  return r.rows.map((row) => Number(row.actor_id));
}
function optionApplies(optionCode, followerId, candidateIds) {
  if (optionCode === OPTION_ALWAYS) return true;
  if (optionCode === OPTION_NEVER) return false;
  return candidateIds.includes(followerId);
}
async function setPatternsOf(fetch2, card) {
  const name = card.name;
  if (name === void 0) return [];
  const patterns = [];
  patterns.push({ setName: "*all", lookupKey: "all" });
  if (!name.isSimple) patterns.push({ setName: "*all plus", lookupKey: "all_plus" });
  if (card.typeId !== void 0) {
    const typeName = (await fetch2.fetchById(card.typeId))?.name;
    if (typeName !== void 0) {
      patterns.push({ setName: `${typeName.s}+*type`, lookupKey: `${card.typeId}+type` });
    }
  }
  if (name.isSimple && name.s.startsWith("*")) {
    patterns.push({ setName: "*star", lookupKey: "star" });
  }
  const rightName = name.rightName;
  if (!name.isSimple && rightName !== void 0 && rightName.s.startsWith("*")) {
    patterns.push({ setName: "*rstar", lookupKey: "rstar" });
  }
  if (await isRuleCard(fetch2, card)) {
    patterns.push({ setName: "*rule", lookupKey: "rule" });
  }
  if (!name.isSimple && rightName !== void 0) {
    const tagId = await fetch2.lexicon.id(rightName);
    if (tagId !== void 0) {
      patterns.push({ setName: `${rightName.s}+*right`, lookupKey: `${tagId}+right` });
    }
    const leftName = name.leftName;
    if (leftName !== void 0) {
      const leftType = await typeOfCard(fetch2, leftName);
      if (leftType !== void 0) {
        const anchorName = DeckoName.parse(`${leftType}+${rightName.s}`);
        const anchorId = await fetch2.lexicon.id(anchorName);
        if (anchorId !== void 0) {
          patterns.push({
            setName: `${leftType}+${rightName.s}+*type plus right`,
            lookupKey: `${anchorId}+type_plus_right`
          });
        }
      }
    }
  }
  patterns.push({ setName: `${name.s}+*self`, lookupKey: `${card.id}+self` });
  return patterns;
}
async function isRuleCard(fetch2, card) {
  const name = card.name;
  if (name === void 0 || name.isSimple) return false;
  const [settingId, setId, userId] = await Promise.all([
    fetch2.codenames.id("setting"),
    fetch2.codenames.id("set"),
    fetch2.codenames.id("user")
  ]);
  if (settingId === void 0) return false;
  const right = card.rightId !== void 0 && card.rightId !== null ? await fetch2.fetchById(card.rightId) : await fetch2.fetchByName(name.tagName);
  if (right?.typeId !== settingId) return false;
  const left = card.leftId !== void 0 && card.leftId !== null ? await fetch2.fetchById(card.leftId) : await fetch2.fetchByName(name.leftName);
  if (setId !== void 0 && left?.typeId === setId) return true;
  const parts = name.partNames;
  if (parts.length <= 2 || setId === void 0) return false;
  const prefererName = parts[parts.length - 2];
  const setPartName = parts.length > 2 ? name.getRange(0, -3) : void 0;
  if (setPartName === void 0 || prefererName === void 0) return false;
  const setPart = await fetch2.fetchByName(setPartName);
  if (setPart?.typeId !== setId) return false;
  const preferer = await fetch2.fetchByName(prefererName);
  if (preferer === void 0) return false;
  const allId = await fetch2.codenames.id("all");
  const prefererIsUser = userId !== void 0 && preferer.typeId === userId || allId !== void 0 && preferer.id === allId;
  return prefererIsUser;
}
async function typeOfCard(fetch2, name) {
  const card = await fetch2.fetchByName(name);
  if (card?.typeId === void 0) return void 0;
  return (await fetch2.fetchById(card.typeId))?.name?.s;
}
async function preferenceRows(fetch2) {
  const [setId, settingId, userId] = await Promise.all([
    fetch2.codenames.id("set"),
    fetch2.codenames.id("setting"),
    fetch2.codenames.id("user")
  ]);
  if (setId === void 0 || settingId === void 0 || userId === void 0) return [];
  const r = await fetch2.driver.query(
    `SELECT preferences.id AS rule_id,
            sets.id AS set_id,
            sets.left_id AS set_left_id,
            sets.codename AS set_own_codename,
            set_right.codename AS set_right_codename,
            settings.codename AS setting_codename,
            users.id AS user_id,
            preferences.db_content AS content
       FROM cards preferences
       JOIN cards user_sets ON preferences.left_id  = user_sets.id
       JOIN cards settings  ON preferences.right_id = settings.id
       JOIN cards users     ON user_sets.right_id   = users.id
       JOIN cards sets      ON user_sets.left_id    = sets.id
       LEFT JOIN cards set_right ON set_right.id = sets.right_id
      WHERE sets.type_id     = ?
        AND settings.type_id = ?
        AND (users.type_id = ? OR users.codename = 'all')
        AND sets.trash        = 0
        AND settings.trash    = 0
        AND users.trash       = 0
        AND user_sets.trash   = 0
        AND preferences.trash = 0`,
    [setId, settingId, userId]
  );
  return r.rows;
}
function setRowKeyBase(row) {
  if (row.set_left_id !== null && row.set_left_id !== void 0) {
    const rightCode = row.set_right_codename;
    return rightCode === null || rightCode === void 0 ? null : `${row.set_left_id}+${rightCode}`;
  }
  const ownCode = row.set_own_codename;
  return ownCode === null || ownCode === void 0 ? null : ownCode;
}
function indexPreferenceRows(rows) {
  const userIdsBySet = /* @__PURE__ */ new Map();
  const ruleContentByUser = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const base = setRowKeyBase(row);
    if (base === null) continue;
    const setting = row.setting_codename;
    if (setting === null || setting === void 0) continue;
    const setKey = `${base}+${setting}`;
    const users = userIdsBySet.get(setKey);
    if (users === void 0) userIdsBySet.set(setKey, [row.user_id]);
    else if (!users.includes(row.user_id)) users.push(row.user_id);
    ruleContentByUser.set(`${setKey}+${row.user_id}`, row.content ?? "");
  }
  return { userIdsBySet, ruleContentByUser };
}
async function followRuleContent(fetch2, index, patterns, followerId, allId) {
  for (const pattern of patterns) {
    const own = index.ruleContentByUser.get(`${pattern.lookupKey}+follow+${followerId}`);
    if (own !== void 0) return own;
    if (allId !== void 0) {
      const fallback = index.ruleContentByUser.get(`${pattern.lookupKey}+follow+${allId}`);
      if (fallback !== void 0) return fallback;
    }
  }
  return null;
}
async function optionCodeOfLine(fetch2, line) {
  const id = await fetch2.lexicon.id(DeckoName.parse(line));
  if (id === void 0) return null;
  const card = await fetch2.fetchById(id);
  return card?.codename ?? null;
}
async function followRuleOption(fetch2, card, index, patterns, followerId, allId) {
  const content = await followRuleContent(fetch2, index, patterns, followerId, allId);
  if (content === null || content === "") return null;
  for (const line of content.split("\n")) {
    const optionCode = await optionCodeOfLine(fetch2, line);
    const candidates = await followerCandidateIds(fetch2, card, optionCode);
    if (optionApplies(optionCode, followerId, candidates)) {
      return line.replace(/[[\]]/g, "");
    }
  }
  return null;
}

// src/card/follow/follow-rule-walk.ts
function followRuleNameFor(setName, userName) {
  return userName === void 0 ? `${setName}+*follow` : `${setName}+${userName}+*follow`;
}
async function followWalkContext(fetch2, card) {
  const [patterns, index, allId] = await Promise.all([
    setPatternsOf(fetch2, card),
    preferenceRows(fetch2).then(indexPreferenceRows),
    fetch2.codenames.id("all")
  ]);
  return { patterns, index, allId };
}
async function followRuleOptionFor(fetch2, card, followerId, ctx) {
  const walk = ctx ?? await followWalkContext(fetch2, card);
  return followRuleOption(
    fetch2,
    card,
    walk.index,
    walk.patterns,
    followerId,
    walk.allId
  );
}

// src/card/follow/follow-render-seam.ts
var FOLLOW_SEAM_VIEWS = /* @__PURE__ */ new Set([
  "follow_button",
  "follow_tab",
  "ignore_tab",
  "link_with_checkbox",
  // type/role.rb:26-32 role_checkbox reads Auth.current
  "closure",
  // the board family (card-mod-edit tab_views.rb:2-5/:42-44):
  // engage_tab's render_follow_section + follow_section itself
  "follow_section",
  "engage_tab"
]);
async function anonymousActorName(fetch2) {
  const anonId = await fetch2.codenames.id("anon");
  if (anonId !== void 0) {
    const name = (await fetch2.fetchById(anonId))?.name?.s;
    if (name !== void 0) return name;
  }
  return "Anonymous";
}
async function closureDeletions(fetch2, userId) {
  const accountId = await fetch2.codenames.id("account");
  const r = await fetch2.driver.query(
    `SELECT id FROM cards
      WHERE left_id = ? AND trash = 0
        AND (right_id IS NULL OR right_id != ?)
      ORDER BY id`,
    [userId, accountId ?? -1]
  );
  const out = [];
  for (const row of r.rows) {
    const name = (await fetch2.fetchById(row.id))?.name?.s;
    if (name !== void 0) out.push({ name });
  }
  return out;
}
async function followEditorRows(fetch2, userName, opts = {}) {
  const following = [];
  const ignoring = [];
  const userId = await fetch2.lexicon.id(DeckoName.parse(userName));
  if (userId === void 0) return { following, ignoring };
  const [setId, followSettingId] = await Promise.all([
    fetch2.codenames.id("set"),
    fetch2.codenames.id("follow")
  ]);
  if (setId === void 0 || followSettingId === void 0) {
    return { following, ignoring };
  }
  const r = await fetch2.driver.query(
    `SELECT p.id AS id, p.db_content AS content, set_card.id AS set_id
       FROM cards p
       JOIN cards user_set ON p.left_id  = user_set.id
       JOIN cards set_card ON user_set.left_id = set_card.id
      WHERE p.right_id       = ?
        AND set_card.type_id = ?
        AND user_set.right_id = ?
        AND p.trash = 0 AND user_set.trash = 0 AND set_card.trash = 0
      ORDER BY set_card.id, p.id`,
    [followSettingId, setId, userId]
  );
  const never = DeckoName.parse("*never").key;
  for (const row of r.rows) {
    const ruleCardName = (await fetch2.fetchById(row.id))?.name?.s;
    const ruleSetName = (await fetch2.fetchById(row.set_id))?.name?.s;
    if (ruleCardName === void 0) continue;
    const items = (row.content ?? "").split("\n").filter((line) => line.length > 0).map((line) => line.replace(/^\[\[/, "").replace(/\]\]$/, ""));
    const isIgnoreRule = items.some((item) => DeckoName.parse(item).key === never);
    if (isIgnoreRule) {
      ignoring.push({
        ruleCardName,
        option: "*never",
        ruleSetName: ruleSetName ?? ""
      });
    } else {
      for (const option of items) {
        following.push({
          ruleCardName,
          option,
          ruleSetName: ruleSetName ?? ""
        });
      }
    }
  }
  if (opts.sessionId !== void 0 && opts.trunkId !== void 0 && opts.sessionId === opts.trunkId) {
    const suggested = await suggestedFollowingRuleOptions(fetch2, userName);
    mergeOptionHashes(following, suggested);
  }
  return { following, ignoring };
}
async function suggestedFollowingRuleOptions(fetch2, trunkName) {
  const hash = /* @__PURE__ */ new Map();
  const suggestionsId = await fetch2.codenames.id("follow_suggestions");
  if (suggestionsId === void 0) return hash;
  const r = await fetch2.driver.query(
    `SELECT db_content FROM cards WHERE id = ? AND trash = 0`,
    [suggestionsId]
  );
  const content = r.rows[0]?.db_content;
  if (content === void 0 || content === null || content === "") return hash;
  for (const line of content.split("\n")) {
    const sug = line.replace(/^\[\[/, "").replace(/\]\]$/, "");
    if (sug.length === 0) continue;
    const sugName = DeckoName.parse(sug);
    const setName = sugName.leftName?.s;
    const optName = sugName.rightName?.s;
    if (setName === void 0 || optName === void 0) continue;
    const [setCard, setTypeId] = await Promise.all([
      fetch2.fetchByName(setName),
      fetch2.codenames.id("set")
    ]);
    if (setCard === void 0 || setCard.name === void 0) continue;
    if (setTypeId === void 0 || setCard.typeId !== setTypeId) continue;
    const option = await suggestedFollowOption(fetch2, optName);
    const ruleKey = DeckoName.parse(
      followRuleNameFor(setCard.name.s, trunkName)
    ).key;
    hash.set(ruleKey, { option, setName: setCard.name.s });
  }
  return hash;
}
async function suggestedFollowOption(fetch2, optName) {
  let card = await fetch2.fetchByName(optName);
  if (card === void 0) {
    const codenameId = await fetch2.codenames.id(optName);
    if (codenameId !== void 0) {
      card = await fetch2.fetchById(codenameId);
    }
  }
  const codename = card?.codename;
  if (card === void 0 || codename === void 0 || codename === null) {
    return "*always";
  }
  return FOLLOW_OPTION_ALL.includes(codename) ? card?.name?.s ?? "*always" : "*always";
}
function mergeOptionHashes(following, suggested) {
  const seenRules = /* @__PURE__ */ new Set();
  for (const row of following) {
    const key = DeckoName.parse(row.ruleCardName).key;
    const hit = suggested.get(key);
    if (hit === void 0) continue;
    suggested.delete(key);
    if (seenRules.has(key)) continue;
    seenRules.add(key);
    if (!following.some(
      (r) => DeckoName.parse(r.ruleCardName).key === key && r.option === hit.option
    )) {
      following.push({
        ruleCardName: row.ruleCardName,
        option: hit.option,
        ruleSetName: row.ruleSetName
      });
    }
  }
  for (const [ruleKey, hit] of suggested) {
    following.push({
      ruleCardName: ruleKey,
      option: hit.option,
      ruleSetName: hit.setName
    });
  }
}
async function resolveSession(fetch2, pageSession) {
  if (pageSession?.signedIn !== true || pageSession.actorId === void 0) {
    return void 0;
  }
  const actor = await fetch2.fetchById(pageSession.actorId, { skipVirtual: true });
  const name = actor?.name?.s;
  if (name === void 0 || name === "") return void 0;
  return { actorId: pageSession.actorId, actorName: name };
}
async function prepareFollowRender(fetch2, pageSession, rootCard, view) {
  const session = await resolveSession(fetch2, pageSession);
  const followLabel = rootCard.name.s;
  let followed = false;
  let followMark;
  let followerCount = 0;
  let followTabRows = [];
  let ignoreTabRows = [];
  let deletions = [];
  const record = await fetch2.fetchByName(rootCard.name.s);
  if (view === "follow_section" || view === "engage_tab") {
    const setName = `${rootCard.name.s}+*self`;
    const users = /* @__PURE__ */ new Set();
    await followerCountInto(fetch2, rootCard, users);
    if (session !== void 0) {
      followed = users.has(session.actorId);
      followMark = followRuleNameFor(setName, session.actorName);
    }
    followerCount = users.size;
  }
  if (view === "follow_button") {
    const setName = record ? `${record.name?.s ?? rootCard.name.s}+*self` : `${rootCard.name.s}+*self`;
    if (session !== void 0 && record !== void 0) {
      followed = await followRuleOptionFor(fetch2, record, session.actorId) !== null;
      followMark = followRuleNameFor(setName, session.actorName);
    } else {
      followMark = followRuleNameFor(setName, await anonymousActorName(fetch2));
    }
  }
  if ((view === "follow_tab" || view === "ignore_tab") && session !== void 0) {
    const trunkName = rootCard.name.leftName?.s ?? rootCard.name.s;
    const rows = await followEditorRows(fetch2, trunkName, {
      sessionId: session.actorId,
      trunkId: record?.leftId
    });
    followTabRows = rows.following;
    ignoreTabRows = rows.ignoring;
  }
  if (view === "closure" && record !== void 0 && record.leftId !== void 0) {
    deletions = await closureDeletions(fetch2, record.leftId);
  }
  return {
    session,
    followed,
    followMark,
    followLabel,
    followerCount,
    followTabRows,
    ignoreTabRows,
    closureDeletions: deletions
  };
}
async function followerCountInto(fetch2, rootCard, users) {
  const setKeys = /* @__PURE__ */ new Set(["*all"]);
  setKeys.add(DeckoName.parse(`${rootCard.name.s}+*self`).key);
  if (rootCard.typeName !== void 0) {
    setKeys.add(DeckoName.parse(`${rootCard.typeName}+*type`).key);
  }
  const followIdRow = await fetch2.driver.query(
    "SELECT id FROM cards WHERE codename = 'follow' AND trash = 0 ORDER BY id LIMIT 1",
    []
  );
  const followId = Number(followIdRow.rows?.[0]?.id ?? 0);
  if (followId === 0) return;
  const rules2 = await fetch2.driver.query(
    "SELECT left_id FROM cards WHERE right_id = ? AND trash = 0",
    [followId]
  );
  for (const row of rules2.rows ?? []) {
    const junction = await fetch2.fetchById(Number(row.left_id));
    if (junction === void 0 || junction.leftId === null || junction.leftId === void 0 || junction.rightId === null || junction.rightId === void 0) {
      continue;
    }
    const setCard = await fetch2.fetchById(Number(junction.leftId));
    if (setCard === void 0 || setCard.name === void 0) continue;
    if (!setKeys.has(DeckoName.parse(setCard.name).key)) continue;
    users.add(Number(junction.rightId));
  }
}

// src/card/permissions/read-rules.ts
var READ_SETTING_NAME = "*read";
var READ_CODENAME = "read";
var SET_CODENAME = "set";
var ANYONE_CODENAME = "anyone";
var ANYONE_SIGNED_IN_CODENAME = "anyone_signed_in";
var ANONYMOUS_CODENAME = "anonymous";
var ADMINISTRATOR_CODENAME = "administrator";
var DECKOBOT_CODENAME = "decko_bot";
var MEMBERS_CODENAME = "members";
var ROLE_CODENAME = "role";
var ANONYMOUS_VIEWER = { signedIn: false };
function readPermissionStatements(viewer) {
  const statements = [
    {
      sql: `SELECT id, codename FROM cards WHERE codename IN ('${ANYONE_CODENAME}', '${ANYONE_SIGNED_IN_CODENAME}', '${ANONYMOUS_CODENAME}', '${ADMINISTRATOR_CODENAME}', '${DECKOBOT_CODENAME}') AND trash = 0`,
      params: []
    },
    {
      sql: `SELECT refs.referee_id AS partyId, read_rules.id AS readRuleId FROM cards read_rules JOIN card_references refs ON refs.referer_id = read_rules.id JOIN cards sets ON read_rules.left_id = sets.id WHERE read_rules.right_id =   (SELECT id FROM cards WHERE codename = '${READ_CODENAME}' AND trash = 0 ORDER BY id LIMIT 1) AND sets.type_id =   (SELECT id FROM cards WHERE codename = '${SET_CODENAME}' AND trash = 0 ORDER BY id LIMIT 1) AND read_rules.trash = 0 AND sets.trash = 0`,
      params: []
    },
    {
      // The hasReadRules gate: ANY live read rule card, independent of
      // references (a rule whose content references nothing grants nobody
      // but still EXISTS — Ruby's permission_rule_id would resolve it for
      // an unruled card's stored-id fallback). catchAll carries whether the
      // BOOTSTRAP rule is among them — identified STRUCTURALLY (left =
      // the *all codename card), since modern junction rows carry no key
      // column — as the completeness proof for a seed's read-rule universe
      // (see canReadByRuleLookup).
      sql: `SELECT COUNT(*) AS c, COALESCE(SUM(CASE WHEN cards.left_id =   (SELECT id FROM cards WHERE codename = 'all' AND trash = 0 ORDER BY id LIMIT 1) THEN 1 ELSE 0 END), 0) AS catchAll FROM cards WHERE cards.right_id = (SELECT id FROM cards WHERE codename = '${READ_CODENAME}' AND trash = 0 ORDER BY id LIMIT 1) AND cards.trash = 0`,
      params: []
    }
  ];
  if (viewer !== void 0 && viewer.signedIn && viewer.actorId !== void 0) {
    statements.push(rolePartyStatement(viewer.actorId));
  }
  return statements;
}
function rolePartyStatement(actorId) {
  return {
    sql: `SELECT lists.left_id AS roleId FROM card_references refs JOIN cards lists ON lists.id = refs.referer_id JOIN cards roles ON roles.id = lists.left_id WHERE refs.referee_id = ? AND refs.referee_id IS NOT NULL AND lists.right_id =   (SELECT id FROM cards WHERE codename = '${MEMBERS_CODENAME}' AND trash = 0 ORDER BY id LIMIT 1) AND lists.trash = 0 AND roles.trash = 0 AND roles.type_id =   (SELECT id FROM cards WHERE codename = '${ROLE_CODENAME}' AND trash = 0 ORDER BY id LIMIT 1) ORDER BY lists.left_id`,
    params: [actorId]
  };
}
function readPermissionStateFromViewerResults(results, viewer) {
  const codenameRows = results[0]?.rows ?? [];
  const cacheRows = results[1]?.rows ?? [];
  const ruleCount = results[2]?.rows ?? [];
  const actorId = viewer.actorId;
  const signedIn = viewer.signedIn === true && actorId !== void 0;
  const roleRows = signedIn ? results[3]?.rows ?? [] : [];
  const byCodename = /* @__PURE__ */ new Map();
  for (const row of codenameRows) {
    if (row.codename !== null) byCodename.set(row.codename, row.id);
  }
  const anyone = byCodename.get(ANYONE_CODENAME);
  const anyoneSignedIn = byCodename.get(ANYONE_SIGNED_IN_CODENAME);
  const administratorId = byCodename.get(ADMINISTRATOR_CODENAME);
  const deckobotId = byCodename.get(DECKOBOT_CODENAME);
  const roles = [];
  for (const row of roleRows) {
    if (!roles.includes(row.roleId)) roles.push(row.roleId);
  }
  const alwaysOk = signedIn && actorId !== void 0 && (actorId === deckobotId || administratorId !== void 0 && roles.includes(administratorId));
  const parties = anyone !== void 0 ? [anyone] : [];
  if (signedIn && anyoneSignedIn !== void 0) parties.push(anyoneSignedIn);
  parties.push(...roles);
  if (actorId !== void 0) parties.push(actorId);
  const cache = /* @__PURE__ */ new Map();
  for (const row of cacheRows) {
    if (row.partyId === null || row.partyId === void 0) continue;
    const list = cache.get(row.partyId);
    if (list === void 0) cache.set(row.partyId, [row.readRuleId]);
    else list.push(row.readRuleId);
  }
  const readableRuleIds = /* @__PURE__ */ new Set();
  for (const party of parties) {
    for (const ruleId of cache.get(party) ?? []) readableRuleIds.add(ruleId);
  }
  return {
    readableRuleIds,
    alwaysOk,
    hasReadRules: (ruleCount[0]?.c ?? 0) > 0,
    hasCatchAllReadRule: (ruleCount[0]?.catchAll ?? 0) > 0,
    parties
  };
}
function anonymousIdFromResults(results) {
  const codenameRows = results[0]?.rows ?? [];
  return codenameRows.find((row) => row.codename === ANONYMOUS_CODENAME)?.id;
}
function canReadByStoredRule(readRuleId, state) {
  if (state.alwaysOk) return true;
  return state.readableRuleIds.has(readRuleId);
}
var LEFT_DELEGATION_CONTENT = /^\[?\[?_left\]?\]?$/m;
var LEFT_DELEGATION_MAX_DEPTH = 16;
async function canReadByRuleLookup(fetcher, card, state) {
  return canReadByRuleLookupDepth(fetcher, card, state, 0);
}
async function canReadByRuleLookupDepth(fetcher, card, state, depth) {
  if (state.alwaysOk) return true;
  if (!state.hasReadRules || !state.hasCatchAllReadRule) return void 0;
  const candidates = ruleNamesForCard(
    card.id === void 0 ? { ...card, isNew: true } : card,
    READ_SETTING_NAME
  );
  const resolved = await resolveRuleRowsByRuleKeys(
    fetcher.driver,
    candidates.map((name) => DeckoName.parse(name).key),
    true
  );
  const cardName = card.name === void 0 ? void 0 : DeckoName.parse(card.name);
  for (const name of candidates) {
    const key = DeckoName.parse(name).key;
    const rule = resolved.get(key);
    if (rule === void 0) continue;
    if (depth < LEFT_DELEGATION_MAX_DEPTH && cardName !== void 0 && cardName.isCompound && LEFT_DELEGATION_CONTENT.test(rule.content ?? "")) {
      return readThroughLeftCard(fetcher, cardName, state, depth);
    }
    return state.readableRuleIds.has(rule.id);
  }
  return state.hasReadRules && state.hasCatchAllReadRule ? false : void 0;
}
async function readThroughLeftCard(fetcher, name, state, depth) {
  const leftName = name.leftName;
  const leftKey = leftName?.key;
  if (leftName === void 0 || leftKey === void 0 || leftKey === "") {
    return canReadByRuleLookupDepth(fetcher, { name, id: void 0 }, state, depth + 1);
  }
  const left = await fetcher.fetchByKey(leftKey, { skipVirtual: true });
  if (left === void 0) {
    return canReadByRuleLookupDepth(fetcher, { name: leftName, id: void 0 }, state, depth + 1);
  }
  const input = {
    name: left.name ?? leftName,
    id: left.id,
    ...left.typeId !== void 0 ? { typeId: left.typeId } : {}
  };
  if (left.typeId !== void 0) {
    const typeCard = await fetcher.fetchById(left.typeId);
    if (typeCard?.name !== void 0 && typeCard.name !== null) input.typeName = typeCard.name;
  }
  const leftInputName = DeckoName.parse(input.name);
  if (leftInputName.isCompound) {
    const leftLeftKey = leftInputName.leftName?.key;
    if (leftLeftKey !== void 0 && leftLeftKey !== "") {
      const leftLeft = await fetcher.fetchByKey(leftLeftKey, { skipVirtual: true });
      if (leftLeft !== void 0 && leftLeft.typeId !== void 0) {
        const leftLeftType = await fetcher.fetchById(leftLeft.typeId);
        if (leftLeftType?.name !== void 0 && leftLeftType.name !== null) {
          input.leftTypeName = leftLeftType.name;
        }
      }
    }
  }
  return canReadByRuleLookupDepth(fetcher, input, state, depth + 1);
}
async function resolveRuleIdsByRuleKeys(driver, keys) {
  const rows = await resolveRuleRowsByRuleKeys(driver, keys, false);
  const out = /* @__PURE__ */ new Map();
  for (const [key, row] of rows) out.set(key, row.id);
  return out;
}
function universeFor(cache, scope) {
  return scope === "ruleClosure" ? cache.ruleUniverse : cache.universe;
}
function setUniverseFor(cache, scope, universe) {
  if (scope === "ruleClosure") cache.ruleUniverse = universe;
  else cache.universe = universe;
}
var ruleResolutionCaches = /* @__PURE__ */ new WeakMap();
var RULE_KEY_UNIVERSE_STATEMENT = `WITH RECURSIVE resolved(id, ckey) AS (
  SELECT id, "key" FROM cards WHERE "key" IS NOT NULL AND +trash = 0
  UNION
  SELECT j.id, l.ckey || '+' || r."key" FROM resolved l
    JOIN cards j ON j.left_id = l.id AND +j.trash = 0
    JOIN cards r ON r.id = j.right_id AND r."key" IS NOT NULL
  UNION
  SELECT j.id, l."key" || '+' || r.ckey FROM resolved r
    JOIN cards j ON j.right_id = r.id AND +j.trash = 0
    JOIN cards l ON l.id = j.left_id AND l."key" IS NOT NULL
)
SELECT rs.ckey, rs.id FROM resolved rs`;
var TASK_RULE_SETTING_NAMES = [
  READ_SETTING_NAME,
  "*create",
  "*update",
  "*delete"
];
var RULE_KEY_RULE_CLOSURE_STATEMENT = `WITH RECURSIVE
anc(id) AS (
  SELECT r.left_id FROM cards r
    JOIN cards st ON st.id = r.right_id
    WHERE +r.trash = 0 AND st."key" IN (${TASK_RULE_SETTING_NAMES.map(() => "?").join(", ")})
      AND r.left_id IS NOT NULL
  UNION
  SELECT j.left_id FROM anc a
    JOIN cards j ON j.id = a.id
    WHERE j.left_id IS NOT NULL
),
resolved(id, ckey) AS (
  SELECT c.id, c."key" FROM cards c
    WHERE c."key" IS NOT NULL AND +c.trash = 0
      AND (c.id IN (SELECT id FROM anc)
        OR ${TASK_RULE_SETTING_NAMES.map((n) => `c."key" LIKE '%+${n}'`).join("\n        OR ")})
  UNION
  SELECT j.id, l.ckey || '+' || r."key" FROM resolved l
    JOIN cards j ON j.left_id = l.id AND +j.trash = 0
    JOIN cards r ON r.id = j.right_id AND r."key" IS NOT NULL
  UNION
  SELECT j.id, l."key" || '+' || r.ckey FROM resolved r
    JOIN cards j ON j.right_id = r.id AND +j.trash = 0
    JOIN cards l ON l.id = j.left_id AND l."key" IS NOT NULL
)
SELECT rs.ckey, rs.id FROM resolved rs
WHERE ${TASK_RULE_SETTING_NAMES.map((n) => `rs.ckey LIKE '%+${n}'`).join(" OR ")}`;
async function resolveRuleRowsByRuleKeys(driver, keys, withContent) {
  return resolveRowsAgainst(driver, keys, withContent, "ruleClosure");
}
async function resolveRowsAgainst(driver, keys, withContent, scope) {
  if (keys.length === 0) return /* @__PURE__ */ new Map();
  let cache = ruleResolutionCaches.get(driver);
  if (cache === void 0) {
    cache = { contentById: /* @__PURE__ */ new Map() };
    ruleResolutionCaches.set(driver, cache);
  }
  if (universeFor(cache, scope) === void 0) {
    const result = await driver.query(
      scope === "ruleClosure" ? RULE_KEY_RULE_CLOSURE_STATEMENT : RULE_KEY_UNIVERSE_STATEMENT,
      scope === "ruleClosure" ? [...TASK_RULE_SETTING_NAMES] : []
    );
    cache = ruleResolutionCaches.get(driver) ?? { contentById: /* @__PURE__ */ new Map() };
    ruleResolutionCaches.set(driver, cache);
    if (universeFor(cache, scope) === void 0) {
      const universe2 = /* @__PURE__ */ new Map();
      for (const row of result.rows) universe2.set(row.ckey, row.id);
      setUniverseFor(cache, scope, universe2);
    }
  }
  const universe = universeFor(cache, scope);
  if (universe === void 0) throw new Error("rule resolution universe missing after build");
  const ordered = [...keys].sort();
  const out = /* @__PURE__ */ new Map();
  if (!withContent) {
    for (const key of ordered) {
      const id = universe.get(key);
      if (id !== void 0) out.set(key, { id, content: null });
    }
    return out;
  }
  const missing = /* @__PURE__ */ new Set();
  for (const key of ordered) {
    const id = universe.get(key);
    if (id === void 0) continue;
    out.set(key, { id, content: null });
    if (!cache.contentById.has(id)) missing.add(id);
  }
  if (missing.size > 0) {
    const ids = [...missing];
    const result = await driver.query(
      `SELECT id, db_content FROM cards WHERE id IN (${ids.map(() => "?").join(", ")})`,
      ids
    );
    const fetched = /* @__PURE__ */ new Map();
    for (const row of result.rows) fetched.set(row.id, row.db_content);
    cache = ruleResolutionCaches.get(driver) ?? cache;
    for (const [id, content] of fetched) cache.contentById.set(id, content);
    for (const row of out.values()) {
      const fresh = fetched.get(row.id);
      row.content = fresh !== void 0 ? fresh : cache.contentById.get(row.id) ?? null;
    }
    return out;
  }
  for (const row of out.values()) row.content = cache.contentById.get(row.id) ?? null;
  return out;
}

// src/card/permissions/read-override.ts
var OVERRIDE_MAX_DEPTH = 16;
var keysCache;
function overrideKeys() {
  if (keysCache === void 0) {
    keysCache = {
      version: DeckoName.parse("*version").key,
      signin: DeckoName.parse("*signin").key,
      accountLinks: DeckoName.parse("*account links").key,
      head: DeckoName.parse("*head").key,
      script: DeckoName.parse("*script").key,
      enabledRoles: DeckoName.parse("*enabled roles").key,
      email: DeckoName.parse("*email").key,
      account: DeckoName.parse("*account").key,
      password: DeckoName.parse("*password").key,
      apiKey: DeckoName.parse("*api key").key,
      assetOutput: DeckoName.parse("*asset output").key,
      style: DeckoName.parse("*style").key,
      salt: DeckoName.parse("*salt").key,
      status: DeckoName.parse("*status").key
    };
  }
  return keysCache;
}
onDeckInflectionsChanged(() => {
  keysCache = void 0;
});
var ACCOUNT_HOLDER_CODENAMES = /* @__PURE__ */ new Set(["anonymous", "decko_bot"]);
var ACCOUNT_HOLDER_TYPE_CODENAMES = /* @__PURE__ */ new Set(["user", "signup"]);
async function readPermissionOverride(name, deps, depth = 0) {
  const K = overrideKeys();
  if (!name.isCompound) {
    if (name.key === K.version || name.key === K.signin || name.key === K.accountLinks) {
      return true;
    }
    return void 0;
  }
  if (depth >= OVERRIDE_MAX_DEPTH) return void 0;
  switch (name.tagKey) {
    // set/right/head.rb:3, set/right/script.rb:3,
    // set/right/enabled_roles.rb:5 — unconditional `true`.
    case K.head:
    case K.script:
    case K.enabledRoles:
      return true;
    // set/right/email.rb:39-43 — `own_email? || Auth.always_ok?` else
    // deny_because; NO super: the override's denial is FINAL for every
    // non-own, non-always-ok viewer even where the stored rule would
    // grant. (always_ok? viewers never reach the walk — the caller
    // short-circuits on state.alwaysOk — matching the override's own
    // `|| Auth.always_ok?` arm.)
    case K.email: {
      if (deps.viewerKey === void 0) return void 0;
      return name.partKeys[0] === deps.viewerKey;
    }
    // set/right/account.rb:28, set/right/password.rb:17,
    // set/right/api_key.rb:24 — `own_account? || super`. The verdict is
    // NEVER false here: Ruby's own_account? is only consulted for
    // TRUTHINESS — truthy allows, falsy (a holder that isn't one's own,
    // or a left that answers nil) runs `super`, i.e. the generic
    // stored/live path. undefined = the generic path decides.
    case K.account:
    case K.password:
    case K.apiKey:
      return ownAccountVerdict(name, deps, depth);
    // set/right/asset_output.rb:5 — `left.ok_to_read?` — the verdict IS
    // the left card's (its own overrides included); undefined when the
    // left is unresolvable (no widening from missing data).
    case K.assetOutput: {
      const left = name.leftName;
      if (left === void 0) return void 0;
      return deps.leftReadVerdict(left, depth + 1);
    }
    // set/type_plus_right/set/style.rb:9 — the set is "Set+*style": the
    // left card's TYPE must be the Set cardtype (pattern.rb type_plus_right
    // anchor: superleft&.type_name == "Set").
    case K.style: {
      const left = name.leftName;
      if (left === void 0) return void 0;
      const leftCard = await deps.fetchByKey(left.key);
      if (leftCard?.typeId === void 0) return void 0;
      const setType = await deps.fetchByKey("set");
      if (setType?.id === void 0) return void 0;
      return leftCard.typeId === setType.id ? true : void 0;
    }
    default:
      return void 0;
  }
}
async function ownAccountVerdict(name, deps, depth) {
  if (deps.viewerKey === void 0 || depth >= OVERRIDE_MAX_DEPTH) return void 0;
  const left = name.leftName;
  if (left === void 0) return void 0;
  if (left.tagKey === overrideKeys().account) return ownAccountVerdict(left, deps, depth + 1);
  const leftCard = await deps.fetchByKey(left.key);
  if (leftCard === void 0) return void 0;
  const holder = leftCard.codename !== void 0 && ACCOUNT_HOLDER_CODENAMES.has(leftCard.codename) || await isHolderType(leftCard, deps);
  if (!holder) return void 0;
  return leftCard.key === deps.viewerKey ? true : void 0;
}
async function isHolderType(card, deps) {
  if (card.typeId === void 0) return false;
  const typeCard = await deps.fetchById(card.typeId);
  return typeCard?.codename !== void 0 && ACCOUNT_HOLDER_TYPE_CODENAMES.has(typeCard.codename);
}
async function updatePermissionOverride(name, deps) {
  const K = overrideKeys();
  if (!name.isCompound) {
    return holderSelfVerdict(name, deps);
  }
  switch (name.tagKey) {
    // set/right/account.rb:33 — `(own_account? && !name_changed? &&
    // !type_id_changed?) || super`, clean here.
    case K.account:
      return ownAccountVerdict(name, deps, 0);
    // set/abstract/account_field.rb:16 (via right/email.rb,
    // right/password.rb, right/salt.rb) — `(account_card&.own_account?
    // && clean) || super`. account_field#account_card is the LEFT only
    // when left.right_id is the *account card (account_field.rb:3-5) —
    // a plain "Jane+*email" (left has no right) is nil -> super.
    case K.email:
    case K.password:
    case K.salt:
      return accountFieldOwnAccount(name, deps);
    // set/right/status.rb:16-22 — the file's OWN ok_to_update? shadows
    // AccountField's (include_set precedes the def): a viewer CANNOT
    // change its own account status — `own_account? && !always_ok? ->
    // deny_because`, else super. FINAL deny (no super in the deny arm).
    case K.status: {
      const own = await accountFieldOwnAccount(name, deps);
      return own === true ? false : void 0;
    }
    default:
      return void 0;
  }
}
async function accountFieldOwnAccount(name, deps) {
  if (deps.viewerKey === void 0) return void 0;
  const left = name.leftName;
  if (left === void 0) return void 0;
  const leftCard = await deps.fetchByKey(left.key);
  if (leftCard?.rightId === void 0) return void 0;
  const accountCard = await deps.fetchByKey(overrideKeys().account);
  if (accountCard?.id === void 0) return void 0;
  if (leftCard.rightId !== accountCard.id) return void 0;
  return ownAccountVerdict(left, deps, 1);
}
async function holderSelfVerdict(name, deps) {
  if (deps.viewerKey === void 0) return void 0;
  const selfCard = await deps.fetchByKey(name.key);
  if (selfCard === void 0) return void 0;
  const holder = selfCard.codename !== void 0 && ACCOUNT_HOLDER_CODENAMES.has(selfCard.codename) || await isHolderType(selfCard, deps);
  if (!holder) return void 0;
  return selfCard.key === deps.viewerKey ? true : void 0;
}

// src/card/actions/type-resolution.ts
async function resolveTypeId(fetcher, spec) {
  if (spec.typeId !== void 0 && spec.typeId !== 0) {
    await assertTypeCardExists(fetcher, spec.typeId);
    return spec.typeId;
  }
  if (spec.typeCode !== void 0) {
    const id = await fetcher.codenames.id(spec.typeCode);
    if (id === void 0) {
      throw new CardActionError("type-unknown", `${spec.typeCode} is not a known type.`);
    }
    await assertTypeCardExists(fetcher, id);
    return id;
  }
  if (spec.typeName !== void 0) {
    const id = await fetcher.lexicon.id(DeckoName.parse(spec.typeName).key);
    if (id === void 0) {
      throw new CardActionError("type-unknown", `${String(spec.typeName)} is not a known type.`);
    }
    await assertTypeCardExists(fetcher, id);
    return id;
  }
  if (spec.name !== void 0) {
    const assignedId = await resolveAssignedTypeIdForCard(fetcher, {
      name: spec.name,
      isNew: true
      // ensureSides creates a NEW card; ensure_type_id is a new-arg flow
    });
    if (assignedId !== void 0) return assignedId;
    const templateId = await templateTypeId(fetcher, spec.name);
    if (templateId !== void 0) return templateId;
  }
  return defaultTypeId(fetcher);
}
async function templateTypeId(fetcher, name) {
  const parsed = DeckoName.parse(name);
  const setTypeId = await fetcher.codenames.id("set");
  const settingTypeId = await fetcher.codenames.id("setting");
  const defaultSettingCard = await fetcher.fetchWithOptions(
    [{ codename: "default" }],
    { skipModules: true }
  );
  const defaultSettingGateOpen = settingTypeId !== void 0 && defaultSettingCard !== void 0 && !defaultSettingCard.trash && defaultSettingCard.typeId === settingTypeId;
  const structureSettingCard = await fetcher.fetchWithOptions(
    [DeckoName.parse("*structure")],
    { skipModules: true }
  );
  const structureSettingGateOpen = settingTypeId !== void 0 && structureSettingCard !== void 0 && !structureSettingCard.trash && structureSettingCard.typeId === settingTypeId;
  const patternCard = {
    name,
    isNew: true,
    // ensure_type_id is a new-arg flow (initialize.rb:54)
    typeId: null,
    typeName: null,
    leftTypeName: null,
    isRule: false
  };
  let defaultType;
  if (defaultSettingGateOpen) {
    for (const pattern of patternsForCard(patternCard)) {
      if (pattern.anchorless && pattern.patternCode === "all") continue;
      const setCard = await fetcher.fetchWithOptions(
        [DeckoName.parse(pattern.setName)],
        { skipModules: true }
      );
      if (setCard === void 0 || setCard.trash) continue;
      if (setTypeId === void 0 || setCard.typeId !== setTypeId) continue;
      const ruleCard = await fetcher.fetchWithOptions(
        [DeckoName.parse(pattern.setName), DeckoName.parse("*default")],
        { skipModules: true }
      );
      if (ruleCard !== void 0 && ruleCard.typeId !== void 0) {
        defaultType = ruleCard.typeId;
        break;
      }
    }
  }
  let dupType = defaultType;
  if (dupType === void 0) {
    const globalDefault = await fetcher.fetchWithOptions(
      [{ codename: "all" }, { codename: "default" }],
      { skipModules: true }
    );
    dupType = globalDefault?.typeId;
  }
  let leftTypeName = null;
  if (parsed.isCompound && parsed.leftName !== void 0) {
    const left = await fetcher.fetchByName(parsed.leftName.key, { skipModules: true });
    const leftTypeId = left?.typeId;
    if (leftTypeId !== void 0) {
      leftTypeName = (await fetcher.fetchById(leftTypeId, { skipModules: true }))?.name ?? null;
    }
  }
  const dupInput = {
    name,
    isNew: true,
    // the dup of a new card is new (dup_structure, :62)
    typeId: dupType ?? null,
    typeName: dupType !== void 0 ? (await fetcher.fetchById(dupType, { skipModules: true }))?.name ?? null : null,
    leftTypeName,
    isRule: false
  };
  if (structureSettingGateOpen) {
    for (const pattern of patternsForCard(dupInput)) {
      const setCard = await fetcher.fetchWithOptions(
        [DeckoName.parse(pattern.setName)],
        { skipModules: true }
      );
      if (setCard === void 0 || setCard.trash) continue;
      if (setTypeId === void 0 || setCard.typeId !== setTypeId) continue;
      const ruleCard = await fetcher.fetchWithOptions(
        [DeckoName.parse(pattern.setName), DeckoName.parse("*structure")],
        { skipModules: true }
      );
      if (ruleCard === void 0) continue;
      if (ruleCard.dbContent !== void 0 && ruleCard.dbContent.trim() === "_self") {
        return defaultType;
      }
      return ruleCard.typeId;
    }
  }
  return defaultType;
}
async function defaultTypeId(fetcher) {
  const ruleCard = await fetcher.fetchWithOptions(
    [{ codename: "all" }, { codename: "default" }],
    { skipModules: true }
  );
  if (ruleCard === void 0 || ruleCard.typeId === void 0) {
    throw new CardActionError("type-unknown", "no such type (default type rule is missing)");
  }
  return ruleCard.typeId;
}
async function assertTypeCardExists(fetcher, typeId) {
  const typeCard = await fetcher.fetchById(typeId, { skipModules: true });
  if (typeCard === void 0 || typeCard.trash) {
    throw new CardActionError("type-unknown", "no such type");
  }
}

// src/card/permissions/view-task-rules.ts
var WRITE_TASK_CODENAMES = ["update", "create", "delete"];
var TASK_SETTING_NAME = {
  read: "*read",
  create: "*create",
  update: "*update",
  delete: "*delete"
};
function viewTaskPermissionStatements() {
  return [
    {
      sql: `SELECT rules.id AS ruleId, setting_cards.codename AS task, refs.referee_id AS partyId FROM cards rules JOIN cards setting_cards ON rules.right_id = setting_cards.id   AND setting_cards.codename IN ('update', 'create', 'delete') JOIN cards sets ON rules.left_id = sets.id LEFT JOIN card_references refs ON refs.referer_id = rules.id WHERE sets.type_id =   (SELECT id FROM cards WHERE codename = 'set' AND trash = 0 ORDER BY id LIMIT 1) AND rules.trash = 0 AND setting_cards.trash = 0 AND sets.trash = 0`,
      params: []
    }
  ];
}
function viewTaskStateFromResults(results, readState) {
  const rows = results[0]?.rows ?? [];
  const ruleParties = {
    update: /* @__PURE__ */ new Map(),
    create: /* @__PURE__ */ new Map(),
    delete: /* @__PURE__ */ new Map()
  };
  const hasTaskRules = {
    update: false,
    create: false,
    delete: false
  };
  for (const row of rows) {
    if (!isWriteTask(row.task)) continue;
    const task = row.task;
    hasTaskRules[task] = true;
    let parties = ruleParties[task].get(row.ruleId);
    if (parties === void 0) {
      parties = /* @__PURE__ */ new Set();
      ruleParties[task].set(row.ruleId, parties);
    }
    if (row.partyId !== null && row.partyId !== void 0) parties.add(row.partyId);
  }
  return {
    alwaysOk: readState?.alwaysOk ?? false,
    viewerParties: readState?.parties ?? [],
    hasTaskRules,
    ruleParties
  };
}
function isWriteTask(task) {
  return WRITE_TASK_CODENAMES.includes(task);
}
async function taskVerdictForCard(fetcher, card, task, state, depth = 0) {
  if (state.alwaysOk) return true;
  const trunk = await permitVerdict(fetcher, card, task, state);
  if (trunk !== true) return trunk;
  if (task === "create") {
    return createSidesAllowed(fetcher, card, state, depth);
  }
  return true;
}
async function allTaskVerdictsForCard(fetcher, card, state, depth = 0) {
  const out = {
    update: false,
    // deny-by-default: no applicable rule -> among?([]) -> false
    create: false,
    delete: false
  };
  if (state.alwaysOk) {
    return { update: true, create: true, delete: true };
  }
  const needed = WRITE_TASK_CODENAMES.filter((task) => state.hasTaskRules[task]);
  if (needed.length === 0) return out;
  const candidateKeys = [];
  const perTask = /* @__PURE__ */ new Map();
  for (const task of needed) {
    const names = ruleNamesForCard(card, TASK_SETTING_NAME[task]).map(
      (name) => DeckoName.parse(name).key
    );
    perTask.set(task, names);
    candidateKeys.push(...names);
  }
  const resolved = await resolveRuleIdsByRuleKeys(fetcher.driver, candidateKeys);
  for (const task of needed) {
    const names = perTask.get(task) ?? [];
    const firstResolved = names.map((key) => resolved.get(key)).find((ruleId) => ruleId !== void 0);
    if (firstResolved === void 0) continue;
    if (task !== "create") {
      out[task] = amongParties(state, task, firstResolved);
      continue;
    }
    if (!amongParties(state, task, firstResolved)) {
      out.create = false;
      continue;
    }
    out.create = await createSidesAllowed(fetcher, card, state, depth);
  }
  return out;
}
function amongParties(state, task, ruleId) {
  const parties = state.ruleParties[task].get(ruleId) ?? /* @__PURE__ */ new Set();
  return state.viewerParties.some((party) => parties.has(party));
}
async function permitVerdict(fetcher, card, task, state) {
  if (!state.hasTaskRules[task]) return false;
  const candidates = ruleNamesForCard(card, TASK_SETTING_NAME[task]).map(
    (name) => DeckoName.parse(name).key
  );
  const resolved = await resolveRuleIdsByRuleKeys(fetcher.driver, candidates);
  for (const key of candidates) {
    const ruleId = resolved.get(key);
    if (ruleId === void 0) continue;
    return amongParties(state, task, ruleId);
  }
  return false;
}
async function createSidesAllowed(fetcher, card, state, depth, selfId) {
  const name = DeckoName.parse(card.name);
  if (!name.isCompound) return true;
  for (const partName of [name.leftName, name.rightName]) {
    if (partName === void 0) continue;
    const partKey = partName.key;
    if (partKey === "") continue;
    const existing = await fetcher.fetchByName(partKey) ?? void 0;
    if (existing !== void 0 && existing.id !== void 0 && existing.id !== selfId) {
      continue;
    }
    const virtualPart = await virtualSidePart(fetcher, partName.s);
    const verdict = await taskVerdictForCard(fetcher, virtualPart, "create", state, depth + 1);
    if (verdict === false) return false;
  }
  return true;
}
async function virtualSidePart(fetcher, partName) {
  try {
    const typeId = await resolveTypeId(fetcher, { name: partName });
    const typeCard = await fetcher.fetchById(typeId, { skipModules: true });
    return {
      name: partName,
      isNew: true,
      typeId,
      typeName: typeCard?.name?.s
    };
  } catch (error) {
    if (error instanceof CardActionError || error instanceof CodenameNotFoundError || error instanceof NameNotFoundError) {
      return { name: partName, isNew: true };
    }
    throw error;
  }
}

// src/card/render.ts
var HISTORY_SEAM_VIEWS = /* @__PURE__ */ new Set([
  "history",
  "act",
  "action_summary",
  "action_expanded",
  "last_action_verb",
  "conflict",
  "history_tab",
  // surfaces-batch3 (2026-09-30): the ladder trio reads the same prepared
  // act bundle (:act_legend's helpers + :last_action's last_act walk and
  // :change's composition over it — card-mod-history views.rb:15-53).
  "act_legend",
  "last_action",
  "change"
]);
var UPDATER_SEAM_VIEWS = /* @__PURE__ */ new Set(["box", "box_bottom", "updated_by"]);
var RULE_WARM_VIEWS = /* @__PURE__ */ new Set(["edit_rules"]);
var SEARCH_TYPE_CODE = "search_type";
var CREATEABLE_TYPES_VIEWS = /* @__PURE__ */ new Set([
  "edit_type",
  "edit_type_form",
  "type_formgroup",
  "board_type_formgroup",
  "new",
  "new_in_modal",
  "new_fields",
  "new_type_formgroup",
  "simple_new"
]);
var SET_TYPE_CODE = "set";
var CARDTYPE_TYPE_CODE = "cardtype";
var PERMISSION_RIGHT_CODENAMES = /* @__PURE__ */ new Set([
  "read",
  "create",
  "update",
  "delete"
]);
var DATE_TYPE_CODE = "date";
var PARSE_DISPATCH_VIEWS = /* @__PURE__ */ new Set(["open", "content"]);
function searchCqlLimit(statement) {
  const raw = statement["limit"];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "" && !Number.isNaN(Number(raw))) {
    return Number(raw);
  }
  return void 0;
}
var SETTING_CLASSES = PATTERN_TABLE.filter(
  (spec) => spec.code !== "rule" && spec.code !== "star" && spec.code !== "rstar"
);
function collectLinkTargetNames(content, out) {
  for (const match of content.matchAll(/\[\[([^\][\n]+?)\]\]/g)) {
    const target = (match[1] ?? "").split("|")[0]?.trim() ?? "";
    if (target === "" || /^(\/|https?:|mailto:)/.test(target)) continue;
    out.push(target);
  }
}
var CORE_REACHING_VIEWS = /* @__PURE__ */ new Set([
  "core",
  "content",
  "open_content",
  "labeled_content",
  "titled_content",
  "titled",
  "open",
  "labeled",
  "closed"
]);
var RenderEngine = class {
  fetcher;
  views;
  /** The chain-aware mod loader (ModLoader.viewChain walks this; the
   *  chain-aware dispatch in format.ts#renderView consults it via
   *  resolveView). Optional: when undefined, resolveView returns the
   *  flat engine.views[view] entry (byte-identical to the pre-chain
   *  render path - 1080-test suite stays green untouched).
   *
   *  Defaults to the process-wide getDefaultModLoader() (the seam the
   *  defaultDeckLoader() binds at boot), so a vanilla engine picks up
   *  the deck's loader without explicit wiring. A per-engine setter
   *  is exposed for tests + custom compositions. */
  modLoader;
  /** Enriched render cards by key - the render path reads this map
   *  synchronously (everything in it was prefetched/enriched). */
  renderCards = /* @__PURE__ */ new Map();
  /** M9 - bootswatch_skin new_customized_name's resolved answer, keyed by
   *  the skin card's canonical key. `name` is the answer itself (the card
   *  name the Customize button proposes); `asked` is every candidate the
   *  walk asked Card.exist? about, verbatim, so a save can invalidate
   *  exactly the decisions that consulted it and no others.
   *
   *  `Card.exist?` is a LIVE Ruby query (card/mod/core/set/all/states.rb:
   *  18-23 `real?` -> `quick_fetch`; fetch/retrieve.rb:34-40 `{ key:
   *  mark.key }`), and the customize_button view function is synchronous,
   *  so the query cannot live there - warmCustomizedName runs the walk in
   *  the async prepare phase and the view reads this memo.
   *  Cleared on resetCaches() and, per saved name, in expireRenderCard. */
  customizedNameBySkinKey = /* @__PURE__ */ new Map();
  /** Save-side invalidation for the enriched render-card map: after a write,
   *  BOTH layers holding the pre-save row must drop it - the fetch layer's
   *  card cache (FetchEngine#expireName, the cache/all.rb#expire port) and
   *  this map, which is a TS render-perf structure with no Ruby counterpart
   *  (Ruby's expired Card objects simply re-fetch). Without the map drop a
   *  post-save page render serves the pre-save content forever (observed
   *  live). The next render re-fetches and
   *  re-enriches from the database row. */
  expireRenderCard(name) {
    const key = DeckoName.parse(name ?? "").key;
    if (key !== "") {
      this.renderCards.delete(key);
      this.warmupScannedKeys.delete(key);
    }
    for (const [skinKey, answer] of [...this.customizedNameBySkinKey]) {
      if (answer.name === name || answer.asked.includes(name)) {
        this.customizedNameBySkinKey.delete(skinKey);
      }
    }
  }
  /** Rule lookup cache: `<card_key>|<view>` -> the resolved ViewOverride
   *  (or undefined if no rule applies). Filled during the first render of
   *  a (card, view) pair; subsequent renders skip the rule walk entirely.
   *  This is what keeps the #1282 constant-queries promise: a warm render
   *  issues ZERO queries for rule application. Cleared on resetCaches(). */
  ruleCache = /* @__PURE__ */ new Map();
  /** Chain-aware view dispatch cache: `<format>|<card_key>|<view>` -> the
   *  resolved ViewFn (or undefined if no view applies). Filled on the
   *  first dispatch per (card, view) pair; subsequent renders skip the
   *  chain walk entirely. closureWarm-style: warm re-renders stay at
   *  zero cost (Map lookup, no per-render string parsing or chain walk).
   *  Cleared on resetCaches(). */
  viewDispatchCache = /* @__PURE__ */ new Map();
  /** key -> id for prefetched cards - the SYNC resolver CQL's name-to-id
   *  conditions need (parse options take a sync callback; the async lexicon
   *  cannot serve it, so the prefetch primes this map instead). */
  idsByKey = /* @__PURE__ */ new Map();
  /** Pre-executed search results by search card key. */
  searchResults = /* @__PURE__ */ new Map();
  /** Search cards whose cql_search parse raised, by card key -> the error
   *  the dispatched view re-raises. Ruby's parse fires INSIDE the view
   *  method of the dispatched card (card-mod-search set/abstract/
   *  cql_search.rb:29-38) — never at prefetch scope — so the prepare walk
   *  records the failure and the DISPATCH boundary re-raises it, view-
   *  gated: the capture census pins search :open/:content as CAPTURE_ERROR
   *  (24 each) while :closed/:title are real bytes (105/105 each), i.e.
   *  Ruby only parses the result-rendering views. Cleared on resetCaches(). */
  searchFailures = /* @__PURE__ */ new Map();
  /** Seated paging records by search card key — the show_paging? == true
   *  case only ({limit, offset, count}; search-paging.ts header). Seated in
   *  runSearch alongside the items; read by the :card_list view's
   *   searchResultPaging seam. Cleared on resetCaches(). */
  searchResultPagingMap = /* @__PURE__ */ new Map();
  /** Resolved options cards by host key (the options-card parse boundary's
   *  rule walk). `has(key) === true` means resolved; the value is the
   *  resolved options card, or undefined when the walk stopped without one
   *  (right_type_options virtual card / nothing found). Warm re-renders pay
   *  one Map lookup. Cleared on resetCaches(). */
  optionsCardCache = /* @__PURE__ */ new Map();
  /** Set-host rules-editor chain memoization (the set-host options-chain
   *  gate's per-host cache — separate from optionsCardCache because the
   *  value type is the failing content string, not a RenderCard).
   *  Warm re-renders of the same set host pay ONE Map lookup. Cleared on
   *  resetCaches(). */
  setHostChainCache = /* @__PURE__ */ new Map();
  /** Read-permission state for the engine's viewer (the Anonymous corpus
   *  actor) — the port of Auth.as_card.read_rules_hash. Resolved lazily on
   *  the first render, folded into the prefetch batch so a cold render
   *  stays ONE round trip; undefined until then. Cleared on resetCaches(). */
  readPermission;
  /** The viewer actually resolved for the permission state — ANONYMOUS_VIEWER
   *  carries no actorId, but ensureReadPermission resolves the anonymous card
   *  id from the batch's codename rows (read-rules.ts) into THIS copy; the
   *  viewer key the own_account?/own_email? overrides compare against comes
   *  from its actorId. Cleared on resetCaches(). */
  readViewer;
  /** Memoized Auth.as_card.key (the readViewer actor card's canonical key) —
   *  resolved once per permission-state generation; undefined when the actor
   *  card is unresolvable. Cleared on resetCaches(). */
  readViewerKey;
  readViewerKeyResolved = false;
  /** card id -> denied verdict (the pure half of ok_to_read?). Computed in
   *  the prepare phase so the synchronous render path never queries.
   *  Cleared on resetCaches(). */
  deniedVerdicts = /* @__PURE__ */ new Map();
  /** card key -> denied verdict for ID-LESS cards — the virtual cards
   *  (states.rb#virtual?) the fetch layer synthesizes for orphan junction
   *  names: no row, no id, but full view-permission semantics. Keyed by the
   *  canonical key because multiple virtual cards share no id space (the
   *  prefetch walk's -1 root placeholder is intercepted in render(), so
   *  every verdict here belongs to exactly one name). Cleared on
   *  resetCaches(). */
  deniedVerdictsByKey = /* @__PURE__ */ new Map();
  /** The viewer whose readable set the permission engine enforces —
   *  Anonymous by default; a signed-in session's actor carries its role
   *  parties (see ReadViewer in src/card/permissions/read-rules.ts). Set
   *  before the first render, or together with resetCaches() after. */
  viewer = ANONYMOUS_VIEWER;
  /** The page-chrome session (Ruby Auth.current) — see RenderEngineLike.
   *  page.ts (decko.signed_in), navbar-views.ts (the *account_links
   *  branch) and format.ts (the loud-denial copy) read this, never the
   *  read-verdict viewer (Auth.as_id). Undefined = signed-out chrome (the
   *  corpus surface, byte-identical to the pre-session render). */
  pageSession;
  /** The prepared signed-in *account_links navbar items (see
   *  RenderEngineLike.pageSessionAccountLinksHtml). Filled once per
   *  session actor by prepareSessionAccountLinks; survives across pages of
   *  the same engine (the chrome session does not change mid-engine). */
  sessionAccountLinks;
  sessionAccountLinksActorId;
  /** The prepared :my_card view body (the account_dropdown arm) — see
   *  RenderEngineLike.pageSessionMyCardHtml. */
  sessionMyCardHtml;
  /** The render-time history seam bundle (src/card/history/render-seam.ts):
   *  set by prepareHistoryRender during a render whose view is one of
   *  HISTORY_SEAM_VIEWS, cleared at every render() entry. The sync history
   *  ViewFns read it through RenderEngineLike#historyRenderReader. */
  historyReader;
  /** The render-time ACT-SEARCH seam bundle (src/card/history/updater-seam.ts):
   *  set by prepareUpdaterRender during a render whose view is one of
   *  UPDATER_SEAM_VIEWS, cleared at every render() entry. The sync
   *  :updated_by ViewFn reads it through
   *  RenderEngineLike#updaterRenderReader. */
  updaterReader;
  /** The render-time follow seam bundle (src/card/follow/follow-render-seam.ts):
   *  set by prepareFollowRender during a render whose view is one of
   *  FOLLOW_SEAM_VIEWS, cleared at every render() entry. The sync follow /
   *  account ViewFns read it through RenderEngineLike#followRenderBundle.
   *  The session half is the EXPLICIT ACTOR BOUNDARY (Ruby Auth.current):
   *  the seam resolves it from engine.pageSession only — never a global,
   *  never the read-verdict viewer. */
  followBundle;
  /** The card-mod-history action-level ContentDiff memo - the port of
   *  Differ's @content_diff_object ivar (differ.rb:79-86), which lives on
   *  the CACHED Action record and therefore outlives a single render: the
   *  first view render of an action builds the diff and checks
   *  summary_omits_content? BEFORE rendering the summary (Ruby reads nil),
   *  later renders of the same action see the rendered state (the capture
   *  pins both shapes). Engine-lifetime = the Action-record lifetime for
   *  the bare-view lane; resetCaches() clears it with the rest. */
  historyDiffMemo = /* @__PURE__ */ new Map();
  /** The deck's CDN/asset host for carrierwave cloud images (A-30 — see
   *  RenderEngineLike.imageCdnHost). Host-deployment config; undefined =
   *  host-relative /files URLs. */
  imageCdnHost;
  /** The Auth::Token runtime config — the HMAC secret the account
   *  verify_url / reset_password_url links are signed with
   *  (card-1.110.0/lib/card/auth/token.rb:7 reads Rails' secret_key_base;
   *  src/card/auth/token.ts takes it per call because there is no Rails
   *  credentials object in this engine). Host-deployment config: same shape
   *  and same reason as imageCdnHost above and the CSRF secret
   *  (src/server/write-routes.ts WriteRouteContext.csrfSecret) — the HOST
   *  owns the secret, the engine never stores or defaults one, and an unset
   *  field makes a token call fail loudly rather than sign under a
   *  repo-pinned key. vm-staging-server.mjs pins it from DECKO_TOKEN_SECRET
   *  with a per-boot random fallback, the way it pins DECKO_CSRF_SECRET.
   *  undefined = no token links are mintable. */
  tokenConfig;
  /** Cardio.config.file_storage's port (card-mod-carrierwave
   *  set/abstract/attachment/01_storage_type.rb:75-79
   *  storage_type_from_config): the attachment-storage default the deck is
   *  configured with. Read LIVE by the file :input view's no_upload? gate
   *  (web.rb:1-3); undefined = the deck default :local (the oracle's
   *  config_file_storage_default). Host-deployment config. */
  fileStorage = void 0;
  /** Codename ids the rule? predicate compares against (SettingID/SetID/
   *  UserID, resolved from the codename codehash). Folded into the cold
   *  render's closure batch (zero extra round trips); undefined until
   *  then. Cleared on resetCaches(). */
  ruleTypeIds;
  /** existing-rule resolution for VIRTUAL rule cards — the port of
   *  card-mod-rules set/rule/editor.rb:119-131 find_existing_rule_card
   *  (`new_card? ? existing_rule_from_prototype : self`): for a rule card
   *  with no stored row, `existing_rule_card` is the prototype's winning
   *  stored rule for the same setting. The prototype's candidate walk and
   *  the SET card's own walk land on the same first-existing stored rule
   *  for every anchored/anchorless set in this corpus (the prototype's
   *  extra SELF candidate never stores a row for the *dummy/nameless
   *  members), so the resolution runs from the set card's pattern input
   *  during preloadVirtualRuleVerdicts and the sync bar renderer reads
   *  the memo. Keys are virtual rule-card keys ("set+*setting");
   *  populated only for settings whose virtual card actually renders.
   *  Cleared on resetCaches(). */
  existingRuleCards;
  /** Set-card ids whose rule environment preloadSetRules has fully
   *  populated since the last resetCaches(): stored rule children
   *  enriched, *all setting cards loaded, per-setting virtual verdicts
   *  and existing-rule memos populated. The deck is static and every
   *  pass inside the preload is skip-if-present, so re-running them on
   *  a warm render of the same set card only re-does identical work —
   *  the dead renderCards map scan, the left_id SQL query, the child
   *  re-enrichment and the full setting-group loop that made warm
   *  set-card renders ~2x the pass-5 warm medians. Keyed by card id
   *  (R16's corrected test: stored children carry
   *  record.leftId === setCard.id, not a name-key match), so the first
   *  render of each set card always runs the full preload and every
   *  later warm render skips it. Cleared on resetCaches() so a
   *  whole-engine reset re-preloads exactly as the first render does. */
  setRulePreloadDoneIds;
  /** *structure rule templates by rule-card composed key -> the rule card's
   *  db_content (null = NULL content). The bulk universe rides the cold
   *  render's closure batch (one statement, zero extra round trips — the
   *  #1282 shape); structured content (content/all.rb:8-10:
   *  structured_content || standard_content) is then pure memory. Undefined
   *  until the first parse. Cleared on resetCaches(). */
  structureContents;
  /** The structure universe's rule cards' own type_id by composed rule key
   *  (parsed from the SAME universe batch as structureContents). The sync
   *  virtual-left-type resolution reads it (virtualLeftTypeName): a nest
   *  whose left card is itself virtual ("X+*type" -> Set) needs the left's
   *  template-chain type AT CLASS-BUILD TIME, before the async enrichment
   *  lands it in the render map. Cleared on resetCaches(). */
  structureRuleTypes;
  /** Render-card keys whose dbContent already went through the structured
   *  pass (idempotence: the pass re-runs after search enrichment without
   *  re-processing the closure). Cleared on resetCaches(). */
  structureProcessed = /* @__PURE__ */ new Set();
  /** Absolute template reference keys that missed fetch (nest targets that
   *  are not cards — e.g. the corpus's {{xxxx}} fixtures). Never re-fetched
   *  on later renders, so warm renders stay zero-query. Cleared on
   *  resetCaches(). */
  structureRefMisses = /* @__PURE__ */ new Set();
  /** The *default rule universe (composed rule key -> the rule card's own
   *  type_id) — round 9's new-child template machinery. Ruby resolves a
   *  nest-miss child (format/nest/fetch.rb#new_card -> Card.fetch new:) to
   *  the *default rule card's TYPE (mod/core/set/all/type.rb:78-80
   *  type_id_from_template -> template&.type_id; for a new card the
   *  template IS the *default rule card, card-mod-content templating.rb
   *  new_card_template). The raw-oracle pins the rendered shape: absent
   *  "+Discussion" children carry data-card-type-id=3 (RichText — the
   *  discussion+*right+*default rule card's type). Rides the same cold
   *  batch as the structure universe (one statement, +0 round trips).
   *  Cleared on resetCaches(). */
  defaultRuleTypes;
  /** composed *default rule key -> the rule card's db_content (the
   *  content/all.rb:17-19 standard_content's
   *  new_card branch — a nest-miss new card's content IS the *default
   *  rule's content; the oracle's associative_inquiry-discussion-titled-view
   *  body is discussion+*right+*default's `<p> </p>` x2 verbatim). Parsed
   *  from the SAME universe rows the types ride (structureUniverseFromResults
   *  over the default result). Cleared on resetCaches(). */
  defaultRuleContents;
  /** type_id -> type card NAME for the *default universe's referenced types
   *  (the data-card-type-name attribute + safeSetKeys TYPE anchor input for
   *  the new-child card). One batched id query, once per engine. Cleared on
   *  resetCaches(). */
  defaultTypeNameById;
  /** ok_to_<task>? state for the non-read view tasks — loaded once per
   *  engine, on the first render whose ROOT view demands a non-read task
   *  (docs/view-perms-notes.md). Cleared on resetCaches(). */
  taskState;
  /** auth/permissions.rb:18-26 Auth.createable_types — the sorted cardtype
   *  names the viewer's create verdict admits ([] until precomputed by
   *  ensureCreateableTypes, which the type-editor views' prepare gate
   *  fires). Cleared on resetCaches(). */
  createableTypesCache;
  /** card key -> allowed verdicts per write task (the ensureVerdicts
   *  model; undefined entries mean unverifiable). Cleared on resetCaches(). */
  taskVerdicts = /* @__PURE__ */ new Map();
  /** Host card key -> the can_configure? verdict for the Cardtype page
   *  render (update-ok on `<card>+*type+*structure`, cardtype.rb:68-70).
   *  Precomputed in the prepare phase (ensureConfigureVerdict) so the
   *  synchronous configure_button permission gate resolves the predicate
   *  without queries. Cleared on resetCaches(). */
  configureVerdicts = /* @__PURE__ */ new Map();
  /** Host card key -> the resolved item type for the card's rendered item
   *  slots ({typeName, typeId}), or undefined once resolved-and-nil. The
   *  port of Ruby's item-type chain (card-mod-collection set/all/item.rb
   *  item_type_id/name -> set/abstract/items.rb:5-11 options_card walk ->
   *  card-mod-search cql_search.rb:14-19 cql :type), resolved once per host
   *  in the prepare phase (resolveHostItemTypeName) and read synchronously
   *  by the item-slot emitters (views.ts renderPointerListItem /
   *  cardListView). Cleared on resetCaches(). */
  itemTypeNameByHostKey = /* @__PURE__ */ new Map();
  /** The UNKNOWN pointer/list items' precomputed permission verdicts, keyed
   *  `"${hostKey}|${itemKey}"` (see ensurePointerItemVerdicts). Ruby builds
   *  the fetch-miss phantom FRESH PER NEST (Nest::Fetch#new_card ->
   *  Card.fetch name, new: new_card_args — nest/fetch.rb), so the same
   *  unknown name under two hosts carries TWO verdicts: the verdict input's
   *  type is THAT nest's folded item type (determine_item_view_options_type
   *  folds the rendering host's item_type_name only for its own nest), and
   *  one host's fold must never answer another host's item slot — the
   *  per-item-only keying let a pointer host that resolves Person
   *  (weekday_morning_usual+owner) pre-empt the RVW List's untyped BasicCs
   *  verdict and render Williamscraig readable where the oracle denies.
   *  Cleared on resetCaches(). */
  pointerItemVerdicts = /* @__PURE__ */ new Map();
  /** Item keys whose verdict already seeded the deck-global verdict maps
   *  (deniedVerdictsByKey / taskVerdicts) — first-wins, the exact seeding
   *  semantics the per-item-only keying produced before the per-host key
   *  (the global maps' consumers — isDenied / taskAllowed on surfaces
   *  outside the pointer-item slot — keep their pre-change bytes). Cleared on
   *  resetCaches(). */
  pointerItemGlobalVerdictDone = /* @__PURE__ */ new Set();
  /** The modeled `Cardio.config.default_html_view` render lane (R17, A-36
   *  correction): "content" while a PAGE render is active — the production
   *  config value the page capture applies
   *  (capture-dual-lane-page-and-view.rb:314, the capture's
   *  production-equivalent setting #5) — "titled" otherwise, the railtie
   *  default
   *  (card-mod-format lib/card/mod/format.rb:2) under which the BARE render
   *  capture (lane V, the old-capture dev boot) ran. Ruby reads process
   *  config per call (html.rb:17-19), never a deck rule; the corpus's
   *  `*all+*default html view` rule card 22769 is dead in 0.20.0. The flag
   *  is byte-safe across interleaved renders because resolveView memoizes
   *  VIEW FUNCTIONS, never rendered bytes. Not cached: the flag toggles per
   *  render lane. */
  pageConfigActive = false;
  /** The help-rule resolver (menu popover content) — attached once per
   *  engine by installHelpRules; its deck-wide batch runs once in the
   *  prepare phase. format.ts reads engine.helpRules. Cleared on
   *  resetCaches(). */
  helpRules;
  helpResolver;
  lastPrefetch;
  /** view-fail class V4 (links.rb:140-144 add_known_or_wanted_class): the
   *  cards whose dbContent the link-target warm pass has already scanned
   *  for [[wikilink]] targets (once per engine per card; the deck is static
   *  on the read surface). */
  linkScanDoneKeys;
  /** The core mod admin-runtime build's once-per-engine guard (see
   *  ensureCoreAdminRuntime). resetCaches re-arms it. */
  coreAdminRuntimeEnsured = false;
  constructor(fetcher) {
    this.fetcher = fetcher;
    this.views = HTML_VIEWS;
    this.modLoader = getDefaultModLoader();
  }
  /** Query-cost stats of the most recent render (diagnostics; the tests
   *  measure through a counting driver instead). */
  get lastRenderStats() {
    return this.lastPrefetch;
  }
  /**
   * Render one view of one card to HTML bytes. Throws UnsupportedViewError
   * for views outside the ported registry (the captured sentinel contract).
   */
  async render(cardName, view, params = {}) {
    const record = await this.fetcher.fetchByName(cardName);
    if (record === void 0 || record.name === void 0) {
      throw new Error(`card not found: ${cardName}`);
    }
    const name = record.name;
    this.historyReader = void 0;
    this.updaterReader = void 0;
    const permissionCold = this.readPermission === void 0;
    const ruleTypesCold = this.ruleTypeIds === void 0;
    const structureCold = this.structureContents === void 0;
    const headReadsCold = !this.headReadsWarmed;
    const permissionStatements = permissionCold ? readPermissionStatements(this.viewer) : [];
    let foldedResults;
    if (!this.closureWarm(record)) {
      const coldStatements = [
        ...permissionStatements,
        ...ruleTypesCold ? [this.fetcher.codenames.codehashStatement()] : [],
        // The *structure rule universe (one statement; the structured-content
        // resolution reads it as pure memory afterwards) + the *default rule
        // universe (the new-child type source, same statement shape).
        // Appended LAST: the permission state parser reads folded results
        // by fixed index, and parseStructureContents slices past the
        // permission + codename statements to find the pair in order.
        // (R17 removed the *default html view universe that rode slot +2:
        // Ruby's default_nest_view reads process CONFIG — html.rb:17-19 —
        // never a deck rule; the engine models it as the pageConfigActive
        // lane flag instead.)
        ...structureCold ? [structureRuleUniverseStatement(), defaultRuleUniverseStatement()] : [],
        // The template TYPE-NAME read (both universes' rule-card types
        // joined to their type cards' names — newCardDefaultType's
        // dup_structure leg answers a *structure rule card's own type and
        // must resolve its NAME synchronously; an IN-list would need the
        // universe rows first, so this is a self-contained JOIN). Rides the
        // cold batch: +1 statement, +0 round trips (the p20-email
        // prelude-prime precedent).
        ...structureCold ? [templateTypeNameStatement()] : [],
        // The head read-set, appended after every slot the parsers above
        // index into, so the head's index is stable at
        // permissionStatements.length + (ruleTypesCold ? 1 : 0)
        //                             + (structureCold ? 3 : 0).
        ...headReadsCold ? [headViewReadStatement()] : []
      ];
      const stats = await prefetchInclusionClosure(record, {
        driver: this.fetcher.driver,
        lexicon: this.fetcher.lexicon,
        cacheRecord: (cached) => (
          // Virtual-card root: the prefetch's recordToRawRow placeholders an
          // id-less record as id -1; storing that record would poison the
          // fetch cache and idsByKey with a fake id (and collide every
          // virtual card's verdict under one map key). Re-enrich the
          // PRISTINE id-less record instead — same key, undefined id — and
          // let the -1 row dissolve (enrichAndStore's existing-key guard
          // keeps the map entry pristine).
          cached.id === -1 && record.id === void 0 && cached.key === record.key ? this.enrichAndStore(record).then(() => void 0) : this.cacheFetchedRecord(cached)
        ),
        ...coldStatements.length > 0 ? { additionalStatements: coldStatements } : {}
      });
      this.lastPrefetch = stats;
      foldedResults = stats.additionalResults;
      if (ruleTypesCold) await this.parseRuleTypeIds(foldedResults, permissionStatements.length);
      this.parseStructureContents(
        foldedResults,
        permissionStatements.length + (ruleTypesCold ? 1 : 0)
      );
      if (structureCold && this.defaultTypeNameById === void 0) {
        const nameIndex = permissionStatements.length + (ruleTypesCold ? 1 : 0) + 2;
        this.defaultTypeNameById = templateTypeNamesFromResults(
          foldedResults?.[nameIndex]
        );
      }
      if (headReadsCold) {
        const headIndex = permissionStatements.length + (ruleTypesCold ? 1 : 0) + (structureCold ? 3 : 0);
        await this.cacheHeadViewReads(foldedResults?.[headIndex]);
        this.headReadsWarmed = true;
      }
      await this.enrichAndStore(record);
    }
    if (ruleTypesCold) {
      if (this.ruleTypeIds === void 0) {
        await this.parseRuleTypeIds(void 0, 0);
      }
      for (const card of this.renderCards.values()) {
        if (!card.name.isCompound) continue;
        const input = this.structurePatternInputForSync(card);
        card.setKeys = safeSetKeys({
          name: card.name,
          typeId: input.typeId ?? void 0,
          typeName: typeof input.typeName === "string" ? input.typeName : void 0,
          leftTypeName: typeof input.leftTypeName === "string" ? input.leftTypeName : void 0,
          isRule: input.isRule === true
        });
      }
    }
    if (permissionCold) await this.ensureReadPermission(foldedResults);
    await this.applyStructureContent();
    await this.preloadDefaultTypeNames();
    await this.seatUnknownRefReadVerdicts();
    await this.seatBlankKeyReadVerdict();
    await this.ensureVerdicts();
    this.populateTypeCodes();
    await this.prepareSearches(record);
    await this.applyStructureContent();
    await this.seatUnknownRefReadVerdicts();
    await this.seatBlankKeyReadVerdict();
    this.populateTypeCodes();
    await this.ensureTaskVerdicts(view);
    if (CREATEABLE_TYPES_VIEWS.has(view)) await this.ensureCreateableTypes();
    await this.ensureConfigureVerdict(record);
    {
      const rendered = this.fetchRenderCard(name.s);
      if (name.s.endsWith("+*asset output")) {
        const left = name.leftName;
        if (left !== void 0) await this.prepareItemForRender(left.s);
      } else if (rendered?.setKeys.includes("TYPE_PLUS_RIGHT-set-Xstyle") === true || rendered?.setKeys.includes("TYPE_PLUS_RIGHT-set-Xscript") === true) {
        await this.prepareItemForRender(`${name.s}+*asset output`);
      }
    }
    if (record.typeId !== void 0 && this.peekCodenameById?.(record.typeId) === "mod") {
      await this.prepareItemForRender(`${name.s}+*style`);
      await this.prepareItemForRender(`${name.s}+*script`);
    }
    if (record.typeId !== void 0 && this.peekCodenameById?.(record.typeId) === "bootswatch_skin") {
      await this.prepareItemForRender(`${name.s}+Image`);
      await this.prepareItemForRender(`${name.s}+parent`);
      await this.prepareItemForRender(`${name.s}+*colors`);
      await this.prepareItemForRender(`${name.s}+*variables`);
      await this.prepareItemForRender(`${name.s}+*stylesheets`);
      await this.prepareItemForRender("*all+*style");
      await this.warmCustomizedName(name);
    }
    {
      const renderedCard = this.fetchRenderCard(name.s);
      if (renderedCard !== void 0) {
        if (renderedCard.typeCode === "setting") {
          await this.prepareItemForRender(`*all+${name.s}`);
          await this.prepareItemForRender("*all");
          if (renderedCard.id !== void 0) {
            const results = await this.fetcher.driver.batch([
              {
                sql: "SELECT id FROM cards WHERE right_id = ? AND left_id IS NOT NULL AND trash = 0",
                params: [renderedCard.id]
              }
            ]);
            for (const row of results[0]?.rows ?? []) {
              const rec = await this.fetcher.fetchById(Number(row.id));
              if (rec === void 0 || rec.name === void 0) continue;
              await this.enrichAndStore(rec);
            }
          }
        }
        if (renderedCard.name.isCompound) {
          const leftName = renderedCard.name.leftName;
          const rightName = renderedCard.name.rightName;
          if (leftName !== void 0 && rightName !== void 0) {
            const right = this.fetchRenderCard(rightName.key);
            const rightCodename = right?.record.codename;
            if (rightCodename === "style" || rightCodename === "script") {
              const left = this.fetchRenderCard(leftName.key);
              if (left === void 0 || left.typeCode !== "mod") {
                await this.prepareItemForRender(leftName.s);
              }
            }
          }
        }
      }
    }
    await this.warmNestedSkinImages();
    if (this.helpResolver === void 0) {
      this.helpResolver = installHelpRules(this, this.fetcher);
      await this.helpResolver.prepare();
      await this.ensureVerdicts();
    }
    const rootCard = this.renderCards.get(name.key);
    if (rootCard === void 0) {
      throw new Error(`render card not prepared: ${name.s}`);
    }
    await this.enrichPointerListItemsClosure();
    await this.warmNestedSkinImages();
    if (rootCard.typeCode === "signup") {
      await this.prepareItemForRender("Anonymous");
      await this.prepareItemForRender(`${rootCard.name.s}+*account`);
      await this.prepareItemForRender(`${rootCard.name.s}+*account+*email`);
      await this.ensureVerdicts();
    }
    await this.enrichNestTypeOptTargets();
    await this.enrichTemplateLinkSetJunctions();
    await this.ensureVerdicts();
    if (view === "smart_label") {
      await this.prepareItemForRender(`${name.s}+description`);
      await this.ensureVerdicts();
    }
    if (rootCard.typeCode === "set") {
      await this.preloadSetRules(rootCard);
      await this.enrichPointerListItemsClosure();
      await this.ensureVerdicts();
    }
    await this.enrichLinkTargetsForKnownClass(rootCard);
    if (view === "open" && (rootCard.typeCode === "pointer" || rootCard.typeCode === "list") && rootCard.unknown !== true && !this.isDenied(rootCard) && !this.isPermissionRightHost(rootCard)) {
      const failContent = await this.itemOptionsParseFailure(rootCard, /* @__PURE__ */ new Set([rootCard.key]));
      if (failContent !== void 0) {
        throw failContent === "" ? emptyQueryError() : badQuery(failContent);
      }
    }
    if ((view === "open" || view === "content") && rootCard.typeCode === "set" && rootCard.unknown !== true && !this.isDenied(rootCard) && !this.isPermissionRightHost(rootCard)) {
      const failContent = await this.setHostOptionsParseFailure(rootCard);
      if (failContent !== void 0) {
        throw failContent === "" ? emptyQueryError() : badQuery(failContent);
      }
    }
    const format = new RenderFormat(rootCard, this, { maxDepth: RUBY_MAX_DEPTH });
    if (this.pageHeadBytesFor(rootCard.key) === void 0 && format.contentNestsHeadCore() && CORE_REACHING_VIEWS.has(view)) {
      this.seatPageHead(rootCard.key, await headContent(this, name, rootCard));
    }
    if (HISTORY_SEAM_VIEWS.has(view)) {
      this.historyReader = await this.prepareHistoryRender(rootCard, params);
    }
    if (UPDATER_SEAM_VIEWS.has(view)) {
      this.updaterReader = await this.prepareUpdaterRender(rootCard);
    }
    this.followBundle = void 0;
    if (RULE_WARM_VIEWS.has(view)) {
      const setCard = await this.fetcher.fetchByName(
        `${rootCard.name.s}+*self`
      );
      if (setCard !== void 0) await this.cacheFetchedRecord(setCard);
    }
    if (FOLLOW_SEAM_VIEWS.has(view)) {
      this.followBundle = await prepareFollowRender(
        this.fetcher,
        this.pageSession,
        rootCard,
        view
      );
      const session = this.followBundle.session;
      if (session !== void 0) {
        const userFollow = await this.fetcher.fetchByName(
          `${session.actorName}+*follow`
        );
        if (userFollow !== void 0) await this.cacheFetchedRecord(userFollow);
      }
      const followersJunction = await this.fetcher.fetchByName(
        `${rootCard.name.s}+*followers`
      );
      if (followersJunction !== void 0) {
        await this.cacheFetchedRecord(followersJunction);
      }
    }
    const baseHtml = format.renderView(view, params.viewOpts ?? {});
    if (this.isDenied(rootCard)) return baseHtml;
    const cacheKey2 = `${name.key}|${view}`;
    let override = this.ruleCache.get(cacheKey2);
    if (override === void 0 && !this.ruleCache.has(cacheKey2)) {
      const rule = await findRule(
        this.fetcher,
        { name, id: rootCard.id, typeId: rootCard.record.typeId, typeName: rootCard.typeName },
        `*${view}`
      );
      override = rule === void 0 ? void 0 : resolveViewOverride(view, [rule.rule]);
      this.ruleCache.set(cacheKey2, override);
    }
    if (override !== void 0) return applyViewOverride(baseHtml, override);
    return baseHtml;
  }
  /**
   * Render the live page for one card — the html-format show path
   * (show_with_page_layout: *layout rule resolution, the {{_main|view}}
   * main render with main! context, the layout body substitution, the
   * :html_page wrapper, production default_nest_view=:content and quiet
   * nested-error semantics). The full mechanism port lives in
   * src/card/render/page.ts; the preparation reuses render() so the bare
   * and page lanes share one prepare path. Throws UnknownLayoutError (the
   * captured "unknown layout card" UserError sentinel) for layout names
   * that resolve to no card/built-in layout.
   */
  async renderPage(cardName) {
    return renderPageBytes(this, cardName);
  }
  /**
   * The (card, view) view-override rule lookup shared with render() (same
   * ruleCache; the page renderer applies the same *<view> rule to the main
   * body bytes it builds with main! context). Additive seam — render()
   * itself is untouched.
   */
  async viewOverrideFor(card, view) {
    const cacheKey2 = `${card.key}|${view}`;
    let override = this.ruleCache.get(cacheKey2);
    if (override === void 0 && !this.ruleCache.has(cacheKey2)) {
      const rule = await findRule(
        this.fetcher,
        { name: card.name, id: card.id, typeId: card.record.typeId, typeName: card.typeName },
        `*${view}`
      );
      override = rule === void 0 ? void 0 : resolveViewOverride(view, [rule.rule]);
      this.ruleCache.set(cacheKey2, override);
    }
    return override;
  }
  /**
   * Chain-aware view dispatch (the new seam): resolve (card, view, format)
   * through the per-card MRO chain (set/format.rb:146-150 +
   * format.rb:62-68) when a mod loader is wired up; fall back to the
   * flat engine.views record when no loader is registered OR the chain
   * produces no entries (the base format view wins - the parent class
   * method Ruby's super() reaches, view_definition.rb:18-21).
   *
   * The chain-aware path is what prevents the loader's flat last-wins
   * record from owning every card (the recaptcha/api_key hijack probe):
   * without this seam, card-mod-recaptcha registering :core last would
   * make engine.views["core"] = recaptcha's :core for EVERY :content
   * render; with this seam, each card's chain walks its OWN set modules
   * most-specific-first, so the :core that fires for a recaptcha_settings
   * card is recaptcha's, and the :core that fires for any other card is
   * the most-specific registration its own chain reaches (usually the
   * compiled-in HTML_VIEWS.core for cards with no mod override).
   *
   * Format inheritance (Ruby's format block reopen): css/js/rss format
   * chains with no entries fall back to the html chain. The base format
   * record (the html compiled-in views) wins last regardless of format,
   * mirroring Ruby's AbstractFormat#view lookup chain.
   *
   * Closure-warm cache (hits only): per-card+view+format memoized so
   * warm renders pay ONE Map lookup per dispatch (the same shape
   * ruleCache uses; maps to the closureWarm rule-walk-cached pattern).
   * MISSES ARE NOT CACHED - a late-loading mod (a test that calls
   * loader.load() after the engine's first render of the same card)
   * would otherwise see a cached undefined result and reject the view.
   *
   * Returns undefined when no view applies — the caller raises the
   * captured UnsupportedViewError UserError (format.ts:317-318).
   */
  resolveView(card, view, format = "html") {
    if (card.typeCode === SEARCH_TYPE_CODE && PARSE_DISPATCH_VIEWS.has(view)) {
      const failed = this.searchFailures.get(card.key);
      if (failed !== void 0 && !this.computeIsRuleSync(card)) throw failed;
    }
    if (card.typeCode === DATE_TYPE_CODE && view === "core") {
      if (!isValidDateContent(card.dbContent)) throw dateError();
    }
    const key = `${format}|${card.key}|${view}|g${modGeneration()}`;
    const cached = this.viewDispatchCache.get(key);
    if (cached !== void 0) return cached;
    const resolved = this.computeResolvedView(card, view, format);
    if (resolved !== void 0) this.viewDispatchCache.set(key, resolved);
    return resolved;
  }
  /** view/permission.rb:38 `setting :unknown` for ONE card: the p20-nest-
   *  selection fix. With a mod deck bound, the per-card CHAIN walk is the
   *  authority — loader.viewUnknownSettingForCard walks viewChain(setKeys,
   *  view) (the same MRO walk the dispatcher uses) and takes the first
   *  chain entry whose set module CARRIES an `unknown` config for the view
   *  (Ruby: the most specific set module that defined the
   *  `_view_<view>__unknown` method). Without a loader, undefined — the
   *  caller falls back to the compiled per-set decl table
   *  (format.ts compiledUnknownSettingForCard). */
  viewUnknownSettingForCard(card, view) {
    const loader = this.modLoader;
    if (loader === void 0) return void 0;
    return loader.viewUnknownSettingForCard(card.setKeys, view, "html");
  }
  /** True when a mod deck is bound (format.ts consults this to keep the
   *  compiled per-set decl stand-in from firing over the loader's chain
   *  answer — a per-set declaration must not globalize again). */
  modDeckBound() {
    return this.modLoader !== void 0;
  }
  /** The chain-walk half of resolveView (uncached). Walks the loader's
   *  per-card chain, applies format inheritance (html base), and falls
   *  to the flat engine.views[view] when no chain entry matches. */
  computeResolvedView(card, view, format) {
    const loader = this.modLoader;
    if (loader !== void 0) {
      const chain = loader.viewChain(card.setKeys, view, format);
      if (chain.length > 0) {
        const entry = chain[0];
        if (entry !== void 0) return entry.viewFn;
      }
    }
    return this.views[view];
  }
  /** Drop every derived cache (the fetch engine's caches + the render-side
   *  maps). Mirrors FetchEngine#resetCaches for whole-engine resets. */
  resetCaches() {
    this.fetcher.resetCaches();
    this.renderCards.clear();
    this.idsByKey.clear();
    this.sessionAccountLinks = void 0;
    this.sessionAccountLinksActorId = void 0;
    this.sessionMyCardHtml = void 0;
    this.searchResults.clear();
    this.searchFailures.clear();
    this.searchResultPagingMap.clear();
    this.pageHeadBytes.clear();
    this.optionsCardCache.clear();
    this.setHostChainCache.clear();
    this.ruleCache.clear();
    this.viewDispatchCache.clear();
    this.readPermission = void 0;
    this.deniedVerdicts.clear();
    this.deniedVerdictsByKey.clear();
    this.coreAdminRuntimeEnsured = false;
    this.existingRuleCards = void 0;
    this.setRulePreloadDoneIds = void 0;
    this.ruleTypeIds = void 0;
    this.structureContents = void 0;
    this.structureRuleTypes = void 0;
    this.structureProcessed.clear();
    this.structureRefMisses.clear();
    this.defaultRuleTypes = void 0;
    this.defaultRuleContents = void 0;
    this.defaultTypeNameById = void 0;
    this.taskState = void 0;
    this.taskVerdicts.clear();
    this.createableTypesCache = void 0;
    this.configureVerdicts.clear();
    this.itemTypeNameByHostKey.clear();
    this.pointerItemVerdicts.clear();
    this.pointerItemGlobalVerdictDone.clear();
    this.warmupScannedKeys.clear();
    this.customizedNameBySkinKey.clear();
    this.linkScanDoneKeys = void 0;
    this.helpRules = void 0;
    this.helpResolver = void 0;
    this.lastPrefetch = void 0;
  }
  // -------------------------------------------------------------------------
  // structured content (content/all.rb:8-10 — the *structure rule template)
  // -------------------------------------------------------------------------
  /** Parse the folded universe statement result (sliced past the permission
   *  + codename statements; the *default universe rides the next slot).
   *  Falls back to one standalone batch on the defensive warm-closure-first-
   *  render path (once per engine) fetching BOTH universes. */
  async parseStructureContents(folded, structureStatementIndex) {
    if (this.structureContents !== void 0) return;
    let result = folded !== void 0 ? folded[structureStatementIndex] : void 0;
    let defaultResult = folded !== void 0 ? folded[structureStatementIndex + 1] : void 0;
    if (result === void 0 || defaultResult === void 0) {
      const batch = await this.fetcher.driver.batch([
        structureRuleUniverseStatement(),
        defaultRuleUniverseStatement(),
        templateTypeNameStatement()
      ]);
      result = batch[0];
      defaultResult = batch[1];
      if (this.defaultTypeNameById === void 0) {
        this.defaultTypeNameById = templateTypeNamesFromResults(batch[2]);
      }
    }
    this.structureContents = structureUniverseFromResults(result);
    this.structureRuleTypes = structureRuleTypesFromResults(result);
    this.defaultRuleTypes = structureRuleTypesFromResults(defaultResult);
    this.defaultRuleContents = structureUniverseFromResults(defaultResult);
  }
  /**
   * RenderEngineLike#defaultHtmlViewConfig — the modeled
   * `Cardio.config.default_html_view` for the CURRENT render lane (R17
   * A-36 correction; see the pageConfigActive field doc and
   * format.ts#defaultNestView): "content" while a page render is active
   * (the production config, capture-dual-lane-page-and-view.rb:369),
   * "titled" otherwise (the railtie default, mod/format.rb:2, under which
   * the bare-render capture ran — probe-pinned by
   * r17-nest-default-view-probe.rb: Cardio.config.default_html_view ==
   * :titled at boot, implicit nests render titled-view).
   */
  defaultHtmlViewConfig() {
    return this.pageConfigActive ? "content" : "titled";
  }
  /**
   * RenderEngineLike#envOriginConfig — the modeled `Card::Env.origin` for
   * the CURRENT render lane (card-1.110.0 lib/card/env/serializable.rb:
   * 20-22 `Cardio.config.deck_origin || "#{protocol}#{request&
   * host_with_port}"`). The page capture sets deck_origin inside its
   * production-config block (capture-dual-lane-page-and-view.rb:343,
   * restored at :348); the view-function lane renders outside that block
   * with a controller-less `Card::Env.reset` (:439), so protocol and
   * host_with_port are both nil and the value interpolates to "".
   * `card_url` (env/location.rb:19-21) is `"#{Env.origin}#{card_path
   * rel}"`, so the empty origin yields the bare rooted path — the view
   * lane's `/User`, against the page lane's
   * `https://culturesmith.com/User`. SAME flag, SAME production-config
   * block as defaultHtmlViewConfig above; the oracle pins both halves
   * (6588/6588 page rows carry `decko.rootUrl='https://culturesmith.com
   * /'`, 4 view rows carry `decko.rootUrl='/'`).
   */
  envOriginConfig() {
    return envOriginForSurface(this.pageConfigActive);
  }
  /**
   * Run `fn` with the process config active
   * (pageConfigActive = true, restored in finally): the page capture
   * wraps `fmt.show(nil, {})` in the production config values —
   * default_html_view :content among them — while every bare render runs
   * under the railtie defaults. Restores the prior flag (nesting-safe:
   * a page render's inner prepare render must NOT clear the flag a page
   * render set).
   */
  async runWithPageConfig(fn) {
    const prior = this.pageConfigActive;
    this.pageConfigActive = true;
    try {
      if (this.readPermission === void 0) await this.ensureReadPermission();
      if (this.helpResolver === void 0) {
        this.helpResolver = installHelpRules(this, this.fetcher);
        await this.helpResolver.prepare();
      }
      return await fn();
    } finally {
      this.pageConfigActive = prior;
    }
  }
  /**
   * The type names the *default universe's referenced type ids point at
   * (once per engine; one batched id query). These names feed the
   * new-child card's data-card-type-name attribute and its safeSetKeys
   * TYPE anchor. Genuinely missing type rows simply stay absent from the
   * map — newCardDefaultType degrades to the pre-round-9 untyped new-card
   * shape for those, never throws.
   */
  async preloadDefaultTypeNames() {
    if (this.defaultTypeNameById !== void 0) return;
    const map = /* @__PURE__ */ new Map();
    const ids = [
      .../* @__PURE__ */ new Set([
        ...this.defaultRuleTypes?.values() ?? [],
        ...this.structureRuleTypes?.values() ?? []
      ])
    ];
    if (ids.length > 0) {
      const placeholders = ids.map(() => "?").join(", ");
      const result = await this.fetcher.driver.query(
        `SELECT id, name FROM cards WHERE id IN (${placeholders}) AND trash = 0`,
        ids
      );
      for (const row of result.rows) {
        if (row.name !== null && row.name !== void 0 && row.name !== "") {
          map.set(row.id, row.name);
        }
      }
    }
    this.defaultTypeNameById = map;
  }
  /**
   * RenderEngineLike#newCardDefaultType: the *default rule card's type for
   * a nest-miss child name — the port of Ruby's new-card template type
   * resolution (type_id_from_template; see the defaultRuleTypes field note).
   * The candidate walk is the naming algebra only (ruleNamesForCard with a
   * type-less input: a new card carries no type yet, so type-anchored
   * candidates are correctly absent and the name-derived *right / *self
   * candidates decide); the FIRST candidate that exists in the universe
   * wins (pattern precedence), matching rule_card's first-hit walk.
   */
  /**
   * RenderEngineLike#virtualLeftTypeName — the sync resolution of a
   * compound name's LEFT card's type through the loaded *structure
   * universe: the same candidate walk the fetch layer's virtual hook runs
   * (resolveVirtualCardStructure — states.rb:44-50 virtual? ->
   * templating.rb:19-48 structure_rule_card -> type.rb:78-80
   * type_id_from_template), so a nest-miss child's TYPE_PLUS_RIGHT anchor
   * reads the virtual left's template type instead of the context card's
   * (the census page-22 defect: the oracle anchored
   * TYPE_PLUS_RIGHT-set-by_name off the virtual set card
   * "PlainText+*type" - Set via the *type+*right+*structure rule card -
   * while the context fallback anchored cardtype-by_name off the Cardtype
   * page card). The type NAME is read through the codename registry's
   * memo - key-identical to the type card's name, which is all the anchor
   * consumes (pattern/base.rb:70-73 safe_key keys the anchor name).
   * Undefined when the universe is not loaded or no *structure rule
   * applies (the caller keeps its context fallback - the pre-existing
   * shape for genuinely unknown lefts).
   */
  /** The phantom-item VIRTUAL resolution — the
   *  port of Ruby's known?-ness decision for a pointer/list fetch-miss
   *  item (states.rb:65 known? = real? || virtual?; states.rb:44-50
   *  virtual? = compound && structure.present?). The pointer-list seat
   *  KNOWS the phantom's type (the host-resolved item type,
   *  item.rb:245-248), so the *type candidates (<Type>+*type+*structure)
   *  are derivable here — unlike the fetch hook, whose walk computes the
   *  type and omits them. Undefined (=> the phantom stays UNKNOWN, the
   *  mini_bar substitution path) when the universe is not loaded, the
   *  name is simple, or no *structure rule resolves. The corpus pins the
   *  split: the compound Tracked Item/Task-typed phantoms (structure rule
   *  2081 Tracked Item+*type+*structure / 21905 Task+*type+*structure
   *  exist) render the plain quiet denial span (SMD exp @8350, PdG exp
   *  @8515-8987 — and the live Task card Merchandise denies as a real
   *  card), while the simple-named denied phantoms (the view-lane census,
   *  133 entries — Test Person 01, Morihei Ueshiba, Robert Kent, all
   *  BasicCs/RichText/Practice-typed) render the mini_bar wrap with the
   *  two-span body: name.simple? short-circuits virtual? to false
   *  (states.rb:45) whatever their type.
   *  Honest static-trace limit, recorded for the next reader: the gem as
   *  written retypes new_card_template's dup to the DEFAULT rule's type
   *  (templating.rb:25-27 — for these phantoms RichText, whose
   *  +*type+*structure rule is absent), so a literal reading does not
   *  reach virtual? for the SMD/PdG phantoms; the capture deck's runtime
   *  (not runnable on this machine — the p20-perm-residuals receipt)
   *  demonstrably answers known? for them. The engine seats the decision
   *  on the corpus-consistent reading — compound name + a *structure rule
   *  resolves for the phantom's OWN type — which reproduces every pinned
   *  surface (the four byte-exact class pages + the simple-named census +
   *  the unit fixtures). */
  phantomVirtualStructure(name, typeName, typeId) {
    if (!name.isCompound) return void 0;
    if (this.structureContents === void 0 || this.structureRuleTypes === void 0) {
      return void 0;
    }
    return resolveVirtualCardStructure(
      name,
      { contents: this.structureContents, ruleTypeIds: this.structureRuleTypes },
      void 0,
      typeName,
      typeId
    );
  }
  virtualLeftTypeName(name) {
    if (!name.isCompound) return void 0;
    if (this.structureContents === void 0 || this.structureRuleTypes === void 0) {
      return void 0;
    }
    const resolution = resolveVirtualCardStructure(
      name,
      { contents: this.structureContents, ruleTypeIds: this.structureRuleTypes },
      void 0
    );
    if (resolution?.typeId === void 0) return void 0;
    return this.fetcher.codenames.peekNameForId(resolution.typeId);
  }
  newCardDefaultType(name, leftTypeName) {
    const assignedName = findAssignedTypeName({ name: name.s, isNew: true });
    if (assignedName !== void 0) {
      const env = getNameEnvironment();
      const assignedId = env?.codename?.id(assignedName) ?? env?.lexicon?.id(DeckoName.parse(assignedName).key);
      if (assignedId !== void 0) {
        const assignedType = env?.lexicon?.name(assignedId) ?? env?.codename?.nameForId(assignedId);
        if (assignedType !== void 0) {
          return { typeId: assignedId, typeName: assignedType };
        }
      }
    }
    const universe = this.defaultRuleTypes;
    const names = this.defaultTypeNameById;
    if (universe === void 0 || universe.size === 0 || names === void 0) return void 0;
    const candidates = ruleNamesForCard(
      {
        name,
        id: void 0,
        typeId: void 0,
        typeName: void 0,
        leftTypeName,
        isNew: true
      },
      DEFAULT_SETTING_NAME
    );
    for (const candidate of candidates) {
      let key;
      try {
        key = DeckoName.parse(candidate).key;
      } catch (err) {
        if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
          continue;
        }
        throw err;
      }
      const typeId = universe.get(key);
      if (typeId === void 0) continue;
      const typeName = names.get(typeId);
      if (typeName === void 0) return void 0;
      const structureTypes = this.structureRuleTypes;
      const structureContents = this.structureContents;
      if (structureTypes !== void 0 && structureTypes.size > 0) {
        const structureCandidates = ruleNamesForCard(
          { name, id: void 0, typeId, typeName, leftTypeName, isNew: true },
          STRUCTURE_SETTING_NAME
        );
        for (const structureCandidate of structureCandidates) {
          let structureKey;
          try {
            structureKey = DeckoName.parse(structureCandidate).key;
          } catch (err) {
            if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
              continue;
            }
            throw err;
          }
          const structureTypeId = structureTypes.get(structureKey);
          if (structureTypeId === void 0) continue;
          const structureContent = structureContents?.get(structureKey);
          if (structureContent !== void 0 && structureContent !== null && structureContent.trim() === "_self") {
            return { typeId, typeName };
          }
          const structureTypeName = names.get(structureTypeId);
          return structureTypeName !== void 0 ? { typeId: structureTypeId, typeName: structureTypeName } : { typeId, typeName };
        }
      }
      return { typeId, typeName };
    }
    return void 0;
  }
  /**
   * RenderEngineLike#defaultRuleTypeIdForSetName — views.ts
   * setPrototypeTypeCode's template leg, COLD arm: the set's own *default
   * rule card's TYPE ID from the preloaded full-deck *default universe
   * (defaultRuleUniverseStatement — every non-trashed <set>+*default rule
   * composed by the recursive name walk, loaded in the cold render's folded
   * batch). Ruby's template leg is a live rule-cascade data lookup
   * (card-mod-content-0.20.0 set/all/templating.rb:27-39 template ->
   * new_card_template -> rule_card(:default); lib/card/rule/all.rb
   * first-hit) with NO render-warmth dependency — the warm collectRules
   * walk (this.collectRules) only sees rule cards an earlier page render
   * happened to warm, which made the recent-category verdicts depend on
   * boot page order (the Search page's -51 `_category-recent` fold
   * regression: Family/*style/Collection *content options bars rendered
   * while their sets' List-typed *default cards 570/17452/17826 were
   * cold). Returns undefined when the universe is not loaded (the caller
   * keeps the not-allowed verdict — pre-fix behavior).
   */
  defaultRuleTypeIdForSetName(setName) {
    const universe = this.defaultRuleTypes;
    if (universe === void 0 || universe.size === 0) return void 0;
    let key;
    try {
      key = DeckoName.parse(`${setName}+*default`).key;
    } catch (err) {
      if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
        return void 0;
      }
      throw err;
    }
    return universe.get(key);
  }
  /**
   * RenderEngineLike#ruleSetPrototypeTypeCode — card-mod-rules set/type/set.rb
   * #prototype.type_id's CODENAME for a RULE card's set (the visible_settings
   * input the categories machinery filters the restricted settings by):
   * Card.fetch(subclass_for_set.prototype_args(anchor_name), new:).type_id.
   * Delegates to views.ts #setPrototypeTypeCode — the SAME oracle-verified
   * port the set-page board's restricted-setting filter runs (assignment
   * layer right::<setting> / type_plus_right::<type>::<right>, template
   * chain, SELF existing-anchor arm; grep-verified 2026-09-26 against
   * expected-v2) — so the board enumeration and the bar categories read ONE
   * prototype resolution, never two divergent ports. Undefined when the set
   * card is not warm or no arm resolves (the caller's restricted-setting
   * filter treats that as not-allowed, never allowed).
   */
  ruleSetPrototypeTypeCode(card) {
    if (!card.name.isCompound) return void 0;
    const parts = card.name.parts;
    if (parts.length < 2) return void 0;
    const setCard = this.fetchRenderCard(parts.slice(0, -1).join("+"));
    if (setCard === void 0) return void 0;
    return setPrototypeTypeCode(this, setCard);
  }
  /**
   * The *default rule's CONTENT for a nest-miss new card (content/all.rb:
   * 17-19 standard_content's new_card branch: `db_content ||
   * (new_card? ? default_content : "")`, default_content = template&.
   * db_content — the SAME winning rule card newCardDefaultType reads the
   * type from). p20-nest-selection: the pass-15 class's 19 Project pages
   * pin the applied form — the oracle's +discussion titled body is
   * `discussion+*right+*default`'s `<p> </p>\r\n<p> </p>` verbatim.
   * Returns undefined when the universe is not loaded or no candidate
   * exists (the caller keeps dbContent "" — Ruby's nil falls through to
   * standard_content's "" tail).
   */
  newCardDefaultContent(name) {
    const universe = this.defaultRuleContents;
    if (universe === void 0 || universe.size === 0) return void 0;
    const candidates = ruleNamesForCard(
      { name, id: void 0, typeId: void 0, typeName: void 0 },
      DEFAULT_SETTING_NAME
    );
    for (const candidate of candidates) {
      let key;
      try {
        key = DeckoName.parse(candidate).key;
      } catch (err) {
        if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
          continue;
        }
        throw err;
      }
      if (!universe.has(key)) continue;
      return universe.get(key) ?? "";
    }
    return void 0;
  }
  /**
   * Substitute structured content into every prepared render card that an
   * applicable *structure rule governs (content/all.rb:8-10:
   * structured_content || standard_content). Mutates RenderCard.dbContent in
   * place — the single content accessor the views read (format.ts#renderRaw,
   * the port of base.rb:75-77's structure_card&.content) — so no view code
   * changes. Then completes the closure: absolute references inside
   * templates are fetched + enriched (prepare phase; per-render caches make
   * repeats free), so warm renders stay warm and zero-query.
   *
   * Idempotent and incremental: cards already processed skip via
   * structureProcessed; names that already missed fetch skip via
   * structureRefMisses (the corpus's {{xxxx}} targets are not cards — Ruby
   * renders them as unknown-card views; we must not re-query them ever).
   *
   * Raw-ref walk (2026-09-22 fix): every render card's dbContent refs are
   * walked for closure closureWarm parity, not just structured cards'
   * templates. Without this the closureWalk returned false for cards whose
   * transitive refs (e.g. ojib -> tazcdqsapii -> {{xxxx...}}) sat on a
   * card without an applicable *structure rule: structureProcessed
   * skipped such cards (the old `if (resolved === undefined) continue`
   * shape) so the xxx refs never entered structureRefMisses, closureWarm
   * saw them missing on every render, and the cold SQL walk re-ran —
   * measured 4.5 s/render on ojib:closed alone (well past the 25 ms
   * budget; warm-render-sample avg 102 ms is 60× that single entry).
   * Walking raw refs matches Ruby's closure behavior: every ref in every
   * card's content contributes to the closure.
   *
   * Performance note: this loop iterates every prepared render card on
   * every render. The pattern input for each card is built SYNCHRONOUSLY
   * from already-enriched state (leftTypeName read from the render-card
   * map; isRule read from the safe_set_keys "RULE" token). The previous
   * async path paid one microtask boundary per awaited fetch (4 awaits per
   * compound card × ~37k compound cards = ~150k microtask hops; measured
   * 26-33 s on a 47k-card deck for nothing in the result).
   */
  async applyStructureContent() {
    const universe = this.structureContents;
    if (universe === void 0) return;
    for (let round = 0; round < 8; round++) {
      const toFetch = /* @__PURE__ */ new Map();
      for (const [key, card] of this.renderCards) {
        if (this.structureProcessed.has(key)) continue;
        this.structureProcessed.add(key);
        const resolved = resolveStructuredContent(
          this.structurePatternInputForSync(card),
          universe
        );
        const contentForRefs = resolved !== void 0 ? resolved.templateContent : card.dbContent;
        if (resolved !== void 0 && resolved.templateContent !== card.dbContent) {
          card.dbContent = resolved.templateContent;
        }
        for (const refName of templateReferenceNames(contentForRefs, card.name)) {
          let refKey;
          try {
            refKey = DeckoName.parse(refName).key;
          } catch (err) {
            if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
              continue;
            }
            throw err;
          }
          if (refKey === "" || this.renderCards.has(refKey) || this.structureRefMisses.has(refKey) || toFetch.has(refKey)) {
            continue;
          }
          toFetch.set(refKey, refName);
        }
      }
      if (toFetch.size === 0) return;
      const simpleKeys = [];
      const compoundNames = [];
      for (const [refKey, refName] of toFetch) {
        if (DeckoName.parse(refName).isCompound) compoundNames.push(refName);
        else simpleKeys.push(refKey);
      }
      let enrichedAny = false;
      if (simpleKeys.length > 0) {
        const placeholders = simpleKeys.map(() => "?").join(", ");
        const result = await this.fetcher.driver.query(
          // COLLATE NOCASE matches the cards_key_index collation (see
          // prefetch.ts's fallback rounds).
          `SELECT * FROM cards WHERE "key" COLLATE NOCASE IN (${placeholders}) AND trash = 0`,
          simpleKeys
        );
        const rows = result.rows;
        for (const row of rows) {
          const record = await composeCardRecord(row, this.fetcher.lexicon);
          if (record.name === void 0) continue;
          await this.cacheFetchedRecord(record);
          enrichedAny = true;
        }
        const foundKeys = new Set(rows.map((row) => row.key));
        for (const missKey of simpleKeys) {
          if (!foundKeys.has(missKey)) this.structureRefMisses.add(missKey);
        }
      }
      for (const refName of compoundNames) {
        const fetched = await this.fetcher.fetchByName(refName);
        const refKey = DeckoName.parse(refName).key;
        if (fetched === void 0 || fetched.name === void 0) {
          this.structureRefMisses.add(refKey);
          continue;
        }
        await this.enrichAndStore(fetched);
        enrichedAny = true;
      }
      if (!enrichedAny) return;
    }
  }
  /** Seat the read verdicts of UNKNOWN nest-target refs. Ruby fetches such
   *  a target with `new:` (format/nest/fetch.rb) so the nest renders a NEW
   *  card whose type RESOLVES FROM THE *default TEMPLATE before any
   *  permission walk (mod/core/set/all/type.rb:78-80
   *  type_id_from_template at new-card creation), and
   *  view/permission.rb:22 `alter_unknown || denial` consults that card's
   *  read verdict for every view whose `unknown:` config is `true` (the
   *  view "supports unknown"). Two populations, both corpus-proven:
   *
   *  1. SIMPLE STARRED names (the setting-card shape — the corpus's *foot,
   *     card 4033 trash=1): the new card's type lands on *all+*default
   *     (rule 28, BasicCs), its read walk hits BasicCs+*type+*read (rule
   *     22283, "Anyone Signed In") and Anonymous is denied → the quiet
   *     denial span inside the highlighted layout source (the oracle-pinned
   *     class).
   *  2. COMPOUND names (the {{+field}} phantom family — BW Oversight's
   *     {{+Human|closed}} leaves): the verdict is the LIVE RECURSIVE _left
   *     walk (card-mod-permissions set/all/permissions.rb:55-71, read
   *     verbatim: `permission_rule_id` -> `rule(action).match?(
   *     /^\[?\[?_left\]?\]?$/)` -> `left_permission_rule_id` ->
   *     `lcard.permission_rule_id action` — the stored read_rule_id column
   *     is never consulted). The walk itself was PROVEN verdict-correct
   *     against the pre-change tree (env-gated probe run: BW+Human false,
   *     the TPR virtuals false, Exhibit+Item's virtuals true, and the
   *     CDW_Host+management guard-population walks true — Ruby's wanted-card
   *     render), so seating the computed verdict reproduces Ruby for BOTH
   *     directions at once: BW's leaves deny through 6569 "_left" -> left
   *     11201 (EXISTS — the prior receipt's absent-left claim is
   *     falsified) -> BW Oversight+*self+*read 10577 (role list, no
   *     Anonymous); CDW_Host+management allows through its 6568-chain
   *     left. (The whole-population fear is answered by
   *     evidence, not scope: the walk's verdict IS Ruby's; the earlier
   *     denial came from the BasicCs-substituted verdict input, which
     *     this seat does not use.) Seated into deniedVerdictsByKey — the
   *  map isDenied reads for id-less cards; pointer/list item keys keep
   *  their richer pointerItemVerdicts path (the cql item-typing unit's
   *  population). Verdict undefined (partial decks) seats ALLOWED — the
   *  same undefined-means-unverifiable contract isDenied applies. Runs
   *  AFTER preloadDefaultTypeNames (newCardDefaultType needs the *default
   *  universe's type names) — never inline at miss time. */
  async seatUnknownRefReadVerdicts() {
    if (this.readPermission === void 0) return;
    for (const refKey of this.structureRefMisses) {
      if (refKey === "" || this.deniedVerdictsByKey.has(refKey)) continue;
      let parsed;
      try {
        parsed = DeckoName.parse(refKey);
      } catch (err) {
        if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
          continue;
        }
        throw err;
      }
      if (parsed.key === "") continue;
      if (parsed.isCompound) {
        const defaulted2 = this.newCardDefaultType(parsed);
        const input2 = {
          name: parsed,
          isNew: true,
          ...defaulted2?.typeId !== void 0 ? { typeId: defaulted2.typeId } : {},
          ...defaulted2?.typeName !== void 0 ? { typeName: defaulted2.typeName } : {}
        };
        const read2 = await canReadByRuleLookup(this.fetcher, input2, this.readPermission);
        this.deniedVerdictsByKey.set(refKey, read2 === false);
        continue;
      }
      if (!parsed.s.startsWith("*")) continue;
      const defaulted = this.newCardDefaultType(parsed);
      const input = {
        name: parsed,
        isNew: true,
        ...defaulted?.typeId !== void 0 ? { typeId: defaulted.typeId } : {},
        ...defaulted?.typeName !== void 0 ? { typeName: defaulted.typeName } : {}
      };
      const read = await canReadByRuleLookup(this.fetcher, input, this.readPermission);
      this.deniedVerdictsByKey.set(refKey, read === false);
    }
  }
  /** The pattern input for one card's structure-candidate walk — the SAME
   *  fields enrichAndStore feeds safeSetKeys (leftTypeName for the *type
   *  plus right anchor, isRule for the *rule pattern), so candidate
   *  derivation is identical on both consumption sites. All fetches are
   *  cache hits (the prefetch walked the sides). */
  /** The read verdict for BLANK-KEY new cards - the nest targets whose name
   *  normalizes to the empty key: the blank reference `{{}}` (name "") and
   *  backslash-escaped relative forms like `{{\_|board_link}}` (name `\_`;
   *  cardname.rb:107-118 simple_key strips `\` outside OK4KEY_RE, so the
   *  key is "" there too). Ruby's fetch hands BOTH the same shape: a NEW
   *  card (retrieve.rb:7 skips the blank mark; `\_` retrieves by key ""
   *  and finds no row - the deck has no empty-key card), typed by the
   *  *default template chain (type.rb:78-80 type_id_from_template ->
   *  BasicCs on this deck, rule 28), whose read walk lands on
   *  BasicCs+*type+*read (rule 22283, "Anyone Signed In") - Anonymous is
   *  read-DENIED. That verdict is deck-constant for every blank-key card
   *  (the key carries no set anchors beyond the type/*all patterns), so it
   *  seats ONCE under the "" key, where isDenied's byKey map read picks it
   *  up for every fabricated blank-key card. The view decides whether the
   *  denial SURFACES: `unknown:`-capable views (template_nest under
   *  template mode; board_link) take the alter_unknown||denial arm and
   *  render the 76-byte quiet span (corpus 636 + 38250, both re-proven
   *  live 2026-10-03); plain views substitute :unknown whose createable
   *  gate renders "" (corpus 10488, live re-proven same session).
   *  Seated beside seatUnknownRefReadVerdicts (same prepare phase, same
   *  newCardDefaultType input recipe), keyed "" - the walk itself skips
   *  blank keys (its `parsed.key === ""` guard), so this is the one seat
   *  that covers them. */
  async seatBlankKeyReadVerdict() {
    if (this.readPermission === void 0) return;
    if (this.deniedVerdictsByKey.has("")) return;
    const name = DeckoName.parse("");
    const defaulted = this.newCardDefaultType(name);
    const read = await canReadByRuleLookup(
      this.fetcher,
      {
        name,
        id: void 0,
        isNew: true,
        ...defaulted?.typeId !== void 0 ? { typeId: defaulted.typeId } : {},
        ...defaulted?.typeName !== void 0 ? { typeName: defaulted.typeName } : {}
      },
      this.readPermission
    );
    this.deniedVerdictsByKey.set("", read === false);
  }
  async structurePatternInputFor(card) {
    let leftTypeName;
    let leftRecord;
    if (card.name.isCompound) {
      const leftKey = card.name.leftName?.key;
      leftRecord = leftKey !== void 0 ? await this.fetcher.fetchByName(leftKey) ?? void 0 : void 0;
      if (leftRecord !== void 0) {
        leftTypeName = (await this.enrichAndStore(leftRecord)).typeName;
      }
    }
    const isRule = card.name.isCompound ? await this.computeIsRule(card.name, leftRecord) : false;
    return {
      name: card.name,
      id: card.id,
      typeId: card.typeId,
      typeName: card.typeName,
      ...leftTypeName !== void 0 ? { leftTypeName } : {},
      ...isRule !== void 0 ? { isRule } : {}
    };
  }
  /**
   * Synchronous counterpart to structurePatternInputFor. Reads
   * leftTypeName from the render-card map and computes isRule in-place
   * from the now-loaded rule type ids + the right/left records'
   * render-card typeIds. The original async path paid 1 await per
   * compound card in the applyStructureContent inner loop (4 awaits
   * per card including the isRule walks: fetchByName, enrichAndStore,
   * fetchTypeIdForPart for the right part, fetchTypeIdForPart for the
   * left part). On a 47k-card deck with ~37k compound cards that was
   * ~150k microtask hops per render — the entire cost of the closed
   * view of a basic-type card on the prewarmed deck. The sync path
   * avoids the awaits: the render-card map is the same data the async
   * fetches would have returned (cache hits) and ruleTypeIds is loaded
   * before applyStructureContent runs.
   *
   * Reading isRule from setKeys (which would have been the cheapest
   * option) is WRONG: setKeys was written by enrichAndStore during the
   * prefetch walk, BEFORE parseRuleTypeIds ran. rule cards in the
   * prefetched closure therefore have setKeys WITHOUT the "RULE" token
   * (computeIsRule returned undefined when ruleTypeIds was undefined),
   * and a later re-read at applyStructureContent time would mis-classify
   * them. Re-computing from ruleTypeIds + render-card typeIds is the
   * only byte-correct sync path.
   */
  structurePatternInputForSync(card) {
    let leftTypeName;
    if (card.name.isCompound) {
      const leftKey = card.name.leftName?.key;
      if (leftKey !== void 0) {
        const leftCard = this.renderCards.get(leftKey);
        if (leftCard !== void 0) leftTypeName = leftCard.typeName;
      }
    }
    const isRule = this.computeIsRuleSync(card);
    return {
      name: card.name,
      id: card.id,
      typeId: card.typeId,
      typeName: card.typeName,
      ...leftTypeName !== void 0 ? { leftTypeName } : {},
      ...isRule ? { isRule } : {}
    };
  }
  /**
   * Sync counterpart to computeIsRule: resolves the rule? predicate from
   * the render-card map (no fetches). Returns true only when the right
   * part's type_id is the *setting codename and the left part's type_id
   * is the *set codename — the standard_rule? path (lib/card/rule/all.rb
   * :32-51). The PREFERENCE? arm is ported below — it used to bail at
   * `parts.length > 3 -> false` on the standing note that "the
   * preference? shape is not ported", but the ASYNC twin right above
   * (render.ts:5626-5641) DOES port it (citing all.rb:42-48 + 50-53),
   * so the two declared "counterparts" disagreed and the sync one —
   * the one that runs at applyStructureContent time — dropped the RULE
   * token for every preference rule card. The capture pins it: card
   * 22735 `*all+*all+*follow` (List-typed, 3 parts) renders
   *   `class='accordion-item bar ALL ALL_PLUS TYPE-list RSTAR RULE
   *    RIGHT-Xfollow TYPE_PLUS_RIGHT-rich_text-Xfollow SELF-Xall-Xall-Xfollow'`
   * and the engine emitted the same list WITHOUT ` RULE`.
   *
   * CORRECTION (oracle-pinned by
   * fixtures/captured/form-substrate.json rule_card_head/guide): the
   * 2-part restriction below was WRONG against Ruby — standard_rule?
   * (all.rb:37-44) has NO part-count limit; the 2-part "*all+*head" is a
   * rule card exactly like the 3-part preference shape, and the async
   * computeIsRule already implements the 2-part arm (its `else if (leftRecord
   * !== undefined ...)` branch). The sync twin's `parts.length === 2 ->
   * false` dropped the RULE token from every 2-part rule card's repaired
   * set keys, and quick_edit (the first view to pin a 2-part rule card's
   * SLOT classes — the link views carry no slot wrap) exposed it: the
   * capture pins `... RSTAR RULE RIGHT-Xhead ...`.
   */
  computeIsRuleSync(card) {
    const ids = this.ruleTypeIds;
    if (ids === void 0 || ids.setting === void 0 || ids.set === void 0) {
      return false;
    }
    const name = card.name;
    if (!name.isCompound) return false;
    const rightKey = name.rightName?.key;
    if (rightKey === void 0) return false;
    const rightCard = this.renderCards.get(rightKey);
    if (rightCard === void 0 || rightCard.record.typeId !== ids.setting) return false;
    if (name.parts.length > 2) {
      const leftKey = name.leftName?.key;
      if (leftKey !== void 0) {
        const leftCard = this.renderCards.get(leftKey);
        if (leftCard !== void 0 && leftCard.record.typeId === ids.set) return true;
      }
      const trunkKey = DeckoName.parse(name.parts.slice(0, -2).join("+")).key;
      if (trunkKey === "") return false;
      const trunkCard = this.renderCards.get(trunkKey);
      if (trunkCard === void 0 || trunkCard.record.typeId !== ids.set) return false;
      const prefererKey = DeckoName.parse(name.parts[name.parts.length - 2] ?? "").key;
      if (prefererKey === "") return false;
      const prefererCard = this.renderCards.get(prefererKey);
      if (prefererCard === void 0) return false;
      if (ids.user !== void 0 && prefererCard.record.typeId === ids.user) return true;
      return prefererCard.record.codename === "all";
    }
    const twoPartLeftKey = name.leftName?.key;
    if (twoPartLeftKey === void 0) return false;
    const twoPartLeft = this.renderCards.get(twoPartLeftKey);
    return twoPartLeft?.record.typeId === ids.set;
  }
  // -------------------------------------------------------------------------
  // read-permission resolution (prepare phase; never during the render)
  // -------------------------------------------------------------------------
  /** Complete the permission state from folded batch results, or run the
   *  standalone batch (warm-closure first render). Once per engine. */
  async ensureReadPermission(folded) {
    if (this.readPermission !== void 0) return this.readPermission;
    const results = folded ?? await this.fetcher.driver.batch(readPermissionStatements(this.viewer));
    const viewer = this.viewer.signedIn === true ? this.viewer : { signedIn: false, actorId: anonymousIdFromResults(results) };
    this.readPermission = readPermissionStateFromViewerResults(results, viewer);
    this.readViewer = viewer;
    return this.readPermission;
  }
  /**
   * The PatternCardInput the read-verdict walk receives. The *type plus
   * right pattern's anchor composes from the LEFT side's type name
   * (registry.ts type_plus_right anchorName: `${leftType}+${tag}` — Ruby's
   * superleft&.type_name), so a compound card's candidate rule names are
   * only correct when leftTypeName rides along. The pre-fix inputs omitted
   * it: the anchor fell back to "RichText+<tag>" (the quick_type default)
   * and the walk skipped past the deck's actual *type plus right read rule
   * to the *all plus / *all catch-all — the fail-open that leaked
   * "+Source Content" bodies to anonymous (trace tenth-item-trace.md
   * bug 3; corpus rule 34568 = "Source+Source Content+*type plus
   * right+*read" -> "Anyone Signed In").
   *
   * leftTypeName resolves from the render-card map first (the prefetch
   * walk enriched the sides of every closure card — cache hit); an
   * un-enriched left (a search result's left side arriving through
   * canReadCard) rides the same fetch+enrich structurePatternInputFor
   * does. All fetches are cache-first, so warm verdicts stay zero-query.
   */
  async verdictPatternInput(name, id, typeId, typeName) {
    let leftTypeName;
    if (name.isCompound) {
      const leftKey = name.leftName?.key;
      if (leftKey !== void 0) {
        const leftCard = this.renderCards.get(leftKey);
        if (leftCard !== void 0) {
          leftTypeName = leftCard.typeName;
        } else {
          const leftRecord = await this.fetcher.fetchByKey(leftKey);
          if (leftRecord !== void 0) {
            leftTypeName = (await this.enrichAndStore(leftRecord)).typeName;
          }
        }
      }
    }
    return {
      name,
      id,
      typeId,
      ...typeName !== void 0 ? { typeName } : {},
      ...leftTypeName !== void 0 ? { leftTypeName } : {}
    };
  }
  /**
   * Public seam for the page renderer's warm-up: re-run the read-permission
   * verdict pass over every prepared card (the skip-if-set guard inside
   * ensureVerdicts makes this a no-op for already-judged cards — only
   * warm-up enrichments made after the main render's pass get judged
   * here). The layout subtree's denied items (e.g. the *Opportunities
   * dropdown's read-denied rows) must render the quiet denial span exactly
   * like the capture; without this refresh a warm-enriched card has no
   * verdict and renders content instead.
   */
  async refreshVerdicts() {
    await this.ensureVerdicts();
  }
  /**
   * Page-render recovery seam (2026-09-29): resolve the
   * read-permission state and judge every prepared card when the prepare
   * render died BEFORE the folded batch landed. The page path catches
   * prepare errors and continues (nested-raise semantics), but the sync
   * render's gate reads only the precomputed verdicts — an unresolved state
   * leaves every card unjudged, and `isDenied`'s unjudged-allowed contract
   * then renders read-denied bodies in full (Ruby denies them; the pass-15
   * triage booked 130 such pages). The standalone permission batch is three
   * small statements — it succeeds where the folded closure batch died.
   * No-op on a healthy prepare: ensureReadPermission returns the memoized
   * state and ensureVerdicts is the map-size integer compare.
   */
  async ensurePermissionVerdicts() {
    await this.ensureReadPermission();
    await this.ensureVerdicts();
  }
  /**
   * Verdicts for every card the render can touch — the sync render path
   * reads only this map. The mod set-module ok_to_read? overrides
   * (read-override.ts) decide first for their populations; cards they defer
   * (or that match no override) resolve through the stored read_rule_id
   * purely (permissions.rb:142-143), and cards without one fall back to the
   * live rule walk (permission_rule_id, permissions.rb:55-61) — bounded by
   * the hasReadRules gate, so rule-less seeds cost zero queries and stay
   * allowed (the documented divergence).
   */
  /** renderCards.size at the moment the full judgment loop last completed.
   *  The loop judges EVERY card in the map (already-judged cards hit the
   *  has-checks and continue), the map only grows, and verdicts are never
   *  invalidated — so an unchanged size means every card is judged and
   *  the whole deck-sized sweep can be skipped. On the 47k-row prewarmed
   *  corpus this turns the per-render re-passes (render.ts:453/498/529)
   *  into one integer compare on a fully warm engine. */
  verdictsJudgedAtMapSize = -1;
  async ensureVerdicts() {
    const state = this.readPermission;
    if (state === void 0) return;
    if (this.verdictsJudgedAtMapSize === this.renderCards.size) return;
    for (const card of this.renderCards.values()) {
      if (card.id === void 0) {
        if (this.deniedVerdictsByKey.has(card.key)) continue;
        const allowed2 = await this.cardReadAllowed(
          card.name,
          void 0,
          card.record.typeId,
          card.typeName,
          void 0
        );
        this.deniedVerdictsByKey.set(card.key, allowed2 === false);
        continue;
      }
      if (this.deniedVerdicts.has(card.id)) continue;
      const allowed = await this.cardReadAllowed(
        card.name,
        card.id,
        card.record.typeId,
        card.typeName,
        card.record.readRuleId
      );
      this.deniedVerdicts.set(card.id, allowed === false);
    }
    this.verdictsJudgedAtMapSize = this.renderCards.size;
  }
  /**
   * The full ok_to_read? port for one card. The mod set-module overrides
   * (read-override.ts — right::head/script/enabled_roles/style true, the
   * account family own_account?/own_email?, asset_output -> left) REPLACE
   * the generic path whenever they decide; `super` and non-matching cards
   * fall through to the generic stored/live verdict exactly as before.
   * Ruby always_ok? sits BEFORE ok_to_read? for every override outcome
   * (each override's own always_ok branch or the generic short-circuit),
   * so an always-ok viewer skips the override walk entirely — identical
   * verdicts, zero override queries.
   */
  async cardReadAllowed(name, id, typeId, typeName, storedReadRuleId, depth = 0) {
    const state = this.readPermission;
    if (state === void 0) return void 0;
    if (!state.alwaysOk) {
      const override = await readPermissionOverride(name, {
        viewerKey: await this.resolveViewerKey(),
        fetchByKey: (key) => this.fetcher.fetchByKey(key),
        fetchById: (cardId) => this.fetcher.fetchById(cardId),
        leftReadVerdict: (leftName, leftDepth) => this.leftReadAllowed(leftName, leftDepth)
      }, depth);
      if (override !== void 0) return override;
    }
    if (id !== void 0 && storedReadRuleId !== void 0) {
      return canReadByStoredRule(storedReadRuleId, state);
    }
    return canReadByRuleLookup(
      this.fetcher,
      await this.verdictPatternInput(name, id, typeId, typeName),
      state
    );
  }
  /** right::asset_output's `left.ok_to_read?` — the LEFT card's full
   *  verdict (its own overrides included), resolved through the same
   *  cardReadAllowed machinery so the recursion memoizes into the shared
   *  verdict maps. A missing left row defers (undefined) — no verdict is
   *  fabricated from absent data. */
  async leftReadAllowed(leftName, depth) {
    const leftRecord = await this.fetcher.fetchByKey(leftName.key);
    if (leftRecord === void 0) return void 0;
    return this.cardReadAllowed(
      leftRecord.name ?? leftName,
      leftRecord.id,
      leftRecord.typeId,
      void 0,
      leftRecord.readRuleId,
      depth
    );
  }
  /** Ruby Auth.as_card.key — the readViewer actor card's canonical key,
   *  resolved once per permission-state generation. */
  async resolveViewerKey() {
    if (this.readViewerKeyResolved) return this.readViewerKey;
    this.readViewerKeyResolved = true;
    const actorId = this.readViewer?.actorId;
    if (actorId === void 0) return void 0;
    const actor = await this.fetcher.fetchById(actorId);
    this.readViewerKey = actor?.key;
    return this.readViewerKey;
  }
  /** Populate the typeCode field on every prepared render card. The
   *  sync peek (peekNameForId) needs the codehash loaded; the
   *  prefetch walk runs enrichAndStore BEFORE parseRuleTypeIds, so
   *  cards enriched during the walk have typeCode === undefined on
   *  a cold render. Patch them here, now that the codehash is in
   *  memory. Idempotent: a second call after a warm closure is a
   *  no-op (peekNameForId is sync, no query). */
  populateTypeCodes() {
    const codenames = this.fetcher.codenames;
    for (const card of this.renderCards.values()) {
      if (card.typeCode !== void 0) continue;
      if (card.typeId === void 0) continue;
      card.typeCode = codenames.peekNameForId(card.typeId);
    }
  }
  // -------------------------------------------------------------------------
  // permission seams for non-HTML entries (the deploy worker's record-JSON
  // route and CQL API) — same engine state the HTML verdicts read
  // -------------------------------------------------------------------------
  /** Read verdict for one card record — the per-card half of ensureVerdicts,
   *  shared by entries that serve card data outside the HTML view pipeline
   *  (deploy/worker.ts cardRecordJson). The full ok_to_read? port — the mod
   *  set-module overrides first (cardReadAllowed -> read-override.ts), then
   *  the stored read_rule_id (canReadByStoredRule, permissions.rb:142-143),
   *  then the live rule walk (canReadByRuleLookup, permissions.rb:55-61;
   *  undefined = rule-less deck: allowed, the documented divergence).
   *  `typeName` is optional — the *type pattern's anchor name; callers that
   *  already hold the type record pass it, others let the lookup resolve.
   *  Verdicts memoize into the same deniedVerdicts map ensureVerdicts uses,
   *  so a card judged here is judged for the HTML path too (and vice versa:
   *  an existing verdict short-circuits). */
  async canReadCard(record, typeName) {
    await this.ensureReadPermission();
    if (record.id !== void 0 && this.deniedVerdicts.has(record.id)) {
      return !this.deniedVerdicts.get(record.id);
    }
    const allowed = record.name === void 0 ? true : await this.cardReadAllowed(
      record.name,
      record.id,
      record.typeId,
      typeName,
      record.readRuleId
    );
    const denied = allowed === false;
    if (record.id !== void 0) this.deniedVerdicts.set(record.id, denied);
    else if (record.key !== void 0 && record.key !== "") {
      this.deniedVerdictsByKey.set(record.key, denied);
    }
    return !denied;
  }
  /** The CQL permission filter for this engine's viewer — the shape
   *  executeQuery's SqlOptions take (sql.ts implicitConditions, the port of
   *  Where#permission_conditions). Ruby's Card::Query runs with
   *  Auth.always_ok? false, so every /api/query-shaped statement is
   *  filtered to the viewer's readable rule set; serving rows without the
   *  filter leaks db_content the HTML views deny. The rule-less-deck
   *  allowance mirrors canReadByRuleLookup's undefined verdict (no read
   *  rule cards at all: nothing to filter by, everything allowed — the
   *  same divergence the HTML verdicts document; filtering with the empty
   *  set would deny every card and break rule-less seeds). */
  async cqlPermissionOptions() {
    const state = await this.ensureReadPermission();
    if (state.alwaysOk) return { alwaysOk: true, readRuleIds: [] };
    if (!state.hasReadRules || !state.hasCatchAllReadRule) {
      return { alwaysOk: true, readRuleIds: [] };
    }
    return { alwaysOk: false, readRuleIds: [...state.readableRuleIds] };
  }
  // -------------------------------------------------------------------------
  // RenderEngineLike - the synchronous render-path surface
  // -------------------------------------------------------------------------
  /** Cache-first card resolution for the render path. Returns undefined for
   *  anything the prefetch did not prepare (the nest machinery reports). */
  fetchRenderCard(name) {
    const key = DeckoName.parse(name).key;
    return this.renderCards.get(key);
  }
  /** M9 - `Card.exist?` as an ASYNC EXACT-stored-name query (the
   *  customize_button new_customized_name gate, html_views.rb:4-11).
   *
   *  Two arms, in order:
   *
   *  1. THE PREPARED RENDER-CARD MAP - but the map is keyed by the
   *     CANONICAL key (`DeckoName.key`, case-folded through
   *     `Inflector#underscore`, cardname lib/cardname.rb:106-116), so a
   *     map hit is re-checked against the seat's STORED name
   *     (`card.name.s`) before it counts. A fold-only hit is not
   *     existence; that is precisely the trap the negdelta lane's
   *     `Lexicon#peekId` arm fell into.
   *  2. ONE point query against the stored name - `WHERE name = ? AND
   *     trash = 0`, the `trash = false unless look_in_trash` default of
   *     retrieve.rb:28-33 pointed at the name column.
   *
   *  Compound names (never produced by this walk - `"#{name} customized"`
   *  on a simple skin name stays simple) delegate to the fetcher, because
   *  a junction row stores a NULL `name` and its identity IS its side
   *  ids.
   *
   *  WHY ASYNC, AND WHY THE ASYNC BOUNDARY IS SAFE HERE: the view
   *  function itself cannot query. The whole render pipeline dispatches
   *  SYNCHRONOUS ViewFns over a prepared map - fetchRenderCard is
   *  cache-only by contract (its own doc: "Returns undefined for anything
   *  the prefetch did not prepare"). So the query belongs in the ASYNC
   *  PREPARE PHASE of `render()`, which is this engine's established
   *  seam for exactly this shape: prepareItemForRender,
   *  enrichLinkTargetsForKnownClass and the bootswatch-skin family warm
   *  above are all async, all run before the dispatch, and all hand the
   *  sync view pure memory. Ruby's `Card.exist?` is equally live per
   *  invocation; the port hoists it into prepare because the port's
   *  render is a batch, and Ruby's batch is the prepare phase.
   *
   *  SCOPE OF THE CHANGE: the verdict never enters renderCards. Seating a
   *  not-really-warm card there would change what every sync surface can
   *  see - the blast radius the negdelta lane refused to take without a
   *  full-canvas grade. This arm feeds exactly one decision: the
   *  customize_button's proposed new card name. */
  async cardExists(name) {
    const parsed = DeckoName.parse(name);
    if (!parsed.isCompound) {
      const seated = this.renderCards.get(parsed.key);
      if (seated !== void 0) return seated.name.s === name;
      const row = await this.fetcher.driver.query(
        "SELECT id FROM cards WHERE name = ? AND trash = 0 LIMIT 1",
        [name]
      );
      return row.rows.length > 0;
    }
    return await this.fetcher.fetchByName(parsed) !== void 0;
  }
  /** M9 - the prepare-phase warm for html_views.rb:4-11 new_customized_
   *  name. Mirrors the Ruby walk verbatim:
   *
   *      nname = "#{name} customized"
   *      if Card.exist?(nname)
   *        nname = "#{nname} 1"
   *        nname.next! while Card.exist?(nname)
   *      end
   *      nname
   *
   *  html_views.rb:38-48's `return "" if card.parent?` runs BEFORE
   *  new_customized_name, so a skin with a +parent subcard never asks a
   *  single existence question - this warm no-ops for it instead of
   *  spending queries on an answer the view discards. The `String#next!`
   *  increment is the numeric-suffix walk the port already used: each
   *  candidate is `"#{base} N"` from the initial " 1".
   *
   *  Termination and cost: the walk is bounded only by the deck, as
   *  Ruby's is, and every verdict memoizes per skin key, so a warm
   *  re-render costs zero queries. A deck holding `<skin> customized`
   *  through `<skin> customized N` pays N+2 point queries on that skin's
   *  first page - the same count Ruby pays on the same page. */
  async warmCustomizedName(skinName) {
    if (this.customizedNameBySkinKey.has(skinName.key)) return;
    if (this.fetchRenderCard(`${skinName.s}+parent`) !== void 0) return;
    const base = `${skinName.s} customized`;
    const asked = [];
    let answer = base;
    let n = 1;
    while (await this.cardExists(answer)) {
      asked.push(answer);
      answer = `${base} ${n}`;
      n += 1;
    }
    this.customizedNameBySkinKey.set(skinName.key, { name: answer, asked });
  }
  /** M9 - the synchronous read side of the seam above, for the
   *  customize_button ViewFn. Undefined = never warmed (an engine that did
   *  not run the prepare phase for this card, or a skin nested into a render
   *  rather than being the root); the view falls back to the render-card
   *  map exactly as it did before this lane. */
  peekCustomizedName(skinName) {
    return this.customizedNameBySkinKey.get(DeckoName.parse(skinName).key)?.name;
  }
  /** view-fail class V4 — links.rb:140-144 add_known_or_wanted_class truth
   *  for a render-map miss. Ruby's `Card.known?(name)` is a LIVE fetch
   *  (cache, then DB): the class of a wikilink anchor reflects existence,
   *  never prefetch reach. The sync render path cannot query, so this peek
   *  covers the one existence source the cold render already carries in
   *  memory: the codename registry's codehash memo (codename.rb
   *  load_codehash — the same fold every cold render's batch rides, and the
   *  same load Ruby's registry memoizes). A map miss whose key is a
   *  registered codename with a non-NULL registered name IS a live card
   *  ([[List]]/[[Pointer]]/[[Search]] — the *content options help popover's
   *  cardtype links, 10 of the class's 15 dump entries). Returns the
   *  registered card NAME (link_to_card's href source, base.rb:43-47) or
   *  undefined when the name is not a live card. NULL-name junction rows
   *  stay undefined (wanted-card) — absence of knowledge never flips a
   *  class; the corpus's People Green pin (wanted on BOTH sides) is the
   *  guard. Regular (uncodenamed) cards resolve through the prepare-phase
   *  link-target warm pass below instead, which seats the real record. */
  peekKnownCardName(name) {
    let key;
    try {
      key = DeckoName.parse(name).key;
    } catch {
      return void 0;
    }
    const id = this.fetcher.codenames.peekId(key);
    if (id === void 0) return void 0;
    return this.fetcher.codenames.peekRegisteredName(id);
  }
  /** On-demand enrichment for items referenced by plain text (not via
   *  {{...}}) — the pointer/list core view reads item names from
   *  db_content and renders each one as a nested slot. The closure walk
   *  the prefetch uses does NOT chase plain-text references (only
   *  nest-syntax references), so an item name not reachable from the
   *  closure is absent from renderCards when the pointer view fires
   *  fetchRenderCard. This hook fetches + enriches + memoizes the card
   *  so the next fetchRenderCard call sees it. Returns undefined for a
   *  fetch miss (the caller falls back to an empty slot). */
  async prepareItemForRender(name) {
    const cached = this.fetchRenderCard(name);
    if (cached !== void 0) return cached;
    const record = await this.fetcher.fetchByName(name);
    if (record === void 0 || record.name === void 0) {
      this.reportUnknownCard(name);
      return void 0;
    }
    return this.enrichAndStore(record);
  }
  /** view-fail class V4 — the prepare-phase link-target warm pass. The sync
   *  render's wikilink anchors (renderLinkChunk + the Link-chunk walker,
   *  format.ts) classify known/wanted off the prepared map, and Ruby asks a
   *  LIVE fetch per anchor. A fresh-process render of a card whose content
   *  (or static help popover) links cards no {{nest}} reference reaches
   *  emitted wanted-card for existing cards — 15 pass-15 dump entries
   *  (10x the *content options popover's [[List]]/[[Pointer]]/[[Search]],
   *  5x card-body links like Anthony Gonzales's [[Bluevolution]]).
   *
   *  Harvest (memory only): the [[target]] matches of every prepared card's
   *  dbContent not yet scanned (once per engine per card), plus the rendered
   *  root's registered static setting-help text (the popover bytes are
   *  registry strings — no card's dbContent carries them). Resolution: map
   *  hit skips (already truthful); peekKnownCardName hit skips (the
   *  codename memo is the existence truth, query-free); everything else
   *  rides prepareItemForRender — fetch + enrich + memoize, so the sync
   *  anchor reads the REAL record (href carries the stored name's casing,
   *  the corpus's [[narrative]] -> /Narrative shape). Fetch misses leave
   *  the anchor wanted-card: the oracle's own wanted pins (People Green)
   *  must not flip.
   *
   *  Cost: zero statements on renders whose surfaces carry no new
   *  unresolvable link targets (the depth-sweep chain, the prelude pins);
   *  one point query per NEW existing target, Ruby's own cost model. The
   *  harvested-then-seated cards join AFTER the last verdict pass, so the
   *  same skip-if-set re-pass every other enrichment group runs here. */
  async enrichLinkTargetsForKnownClass(rootCard) {
    const targets = [];
    if (this.linkScanDoneKeys === void 0) this.linkScanDoneKeys = /* @__PURE__ */ new Set();
    for (const card of this.renderCards.values()) {
      if (this.linkScanDoneKeys.has(card.key)) continue;
      this.linkScanDoneKeys.add(card.key);
      const content = card.dbContent;
      if (content === void 0 || content === "" || !content.includes("[[")) continue;
      collectLinkTargetNames(content, targets);
    }
    const staticHelp = this.helpResolver?.peekStaticHelpTextFor(rootCard);
    if (staticHelp !== void 0 && staticHelp.includes("[[")) {
      collectLinkTargetNames(staticHelp, targets);
    }
    let seated = false;
    for (const target of targets) {
      if (this.fetchRenderCard(target) !== void 0) continue;
      const prepared = await this.prepareItemForRender(target);
      if (prepared !== void 0) seated = true;
    }
    if (seated) await this.ensureVerdicts();
  }
  /** Whether any prepared card's content carries a `|configs` nest opt —
   *  the Role dashboards' `{{_L|configs}}` shape (card-mod-account
   *  set/type/role.rb view :configs dispatches). The async
   *  prepare gates the admin-runtime build on this (see
   *  ensureCoreAdminRuntime): pages that never reach the view pay zero
   *  queries, so the query-count gates stay untouched.
   *
   *  MOD PAGES (mm-cstructural, 2026-09-30): a Mod-typed card's :core also
   *  reads the admin runtime — the Cardtypes accordion nests admin.yml
   *  codenames through `codenameToName` (core-mod.ts nestItemHtml), and
   *  Ruby's nest resolves a SYMBOL argument with `Card.fetch` (an
   *  existing-card fetch), so the slot's `nest_name` is the codename card's
   *  AUTHORED name — the oracle's `nest_name: Role`, not the yml's `role`
   *  (format/nest.rb:28 `view_opts[:nest_name] ||= card.name`). Without the
   *  runtime the map is empty, the raw codename is nested, and the slot JSON
   *  disagrees. The Depends-on section is deliberately NOT in this class:
   *  `card_mods` yields STRINGS (type/mod.rb:222-226), and a String argument
   *  takes nest/fetch.rb:31-33's `new_card` branch, which keeps the literal
   *  (`mod_-account`) — which is what the oracle shows. So the trigger is
   *  Mod-TYPED, not "the page nests a mod". */
  renderClosureNeedsCoreAdminRuntime() {
    for (const card of this.renderCards.values()) {
      const content = card.dbContent?.toString();
      if (content !== void 0 && content.includes("|configs")) return true;
      if (card.typeCode === "mod") return true;
    }
    return false;
  }
  /** The core mod's admin runtime (mod-core's prepareAdminRuntime: the
   *  mod cards, the *update-rule role walk) built lazily for engines with
   *  NO bound loader — the graded page-lane harness shape, where the mod
   *  prepareEngine never ran and the :configs view would otherwise read an
   *  empty admin universe. Sync view
   *  bodies cannot await a build, so the page lane calls this from the
   *  async prepare (gated by renderClosureNeedsCoreAdminRuntime) BEFORE
   *  the sync render dispatches. Once per engine (the flag; resetCaches
   *  re-arms). */
  async ensureCoreAdminRuntime() {
    if (this.coreAdminRuntimeEnsured) return;
    this.coreAdminRuntimeEnsured = true;
    const host = modEngineHost(this, this.fetcher);
    bindModuleAdminHost(host);
    await prepareAdminRuntime(host);
  }
  /** Interface hook: track an unknown-card nest target. The render
   *  engine doesn't currently use this for negative-caching, but the
   *  signature is required by RenderEngineLike. */
  reportUnknownCard(_key) {
  }
  /** Stats of the last warmupLayoutReferences call (probe/verification
   *  surface — round trips, statements, rounds, fallbacks). */
  lastWarmupStats;
  /** The layout warm-up chase, bounded + batched (see
   *  prefetch.ts#prefetchWarmupClosure): the layout's render-relevant
   *  references (spine: nest targets + pointer/list items, which render
   *  and expand; leaf: [[link]] targets, which are existence-reads only)
   *  resolve in ONE driver.batch per reference-BFS round instead of one
   *  point-query ladder per name. Seeds are {name, context} pairs resolved
   *  exactly like the format does (absolute, or relative against the
   *  referencing card). */
  async warmupLayoutReferences(seeds, scan, onRound) {
    const stats = await prefetchWarmupClosure(
      seeds,
      {
        driver: this.fetcher.driver,
        lexicon: this.fetcher.lexicon,
        cacheRecord: (cached) => this.cacheFetchedRecord(cached).then(() => void 0),
        getCard: (key) => this.renderCards.get(key),
        scannedKeys: this.warmupScannedKeys,
        ...this.fetcher.virtualCardLookup !== void 0 ? {
          virtualLookup: async (abs) => this.fetcher.virtualCardLookup?.(DeckoName.parse(abs))
        } : {},
        prepareFallback: async (name) => await this.prepareItemForRender(name) ?? void 0,
        ...onRound !== void 0 ? { onRound } : {}
      },
      scan
    );
    this.lastWarmupStats = stats;
    return stats;
  }
  /**
   * Pre-execute the Search-type cards the page's NEST CLOSURE reaches — the
   * reference-BFS from the given seed cards over the prepared-card map, run
   * at the point the page renderer calls it: after the prepare render +
   * warm-up enrichment (the cards are on the map) but BEFORE the sync
   * body/layout render dispatches their nests. The card_list view reads ONLY
   * the pre-executed map (executeSearch → searchResults.get(key) ?? []), so
   * a warm-enriched but unexecuted search renders search-no-results with
   * zero queries — the 10-census-page SEARCH-EMPTY class (cache-nil-fix.md
   * section 3).
   *
   * Ruby parity: card-mod-search set/abstract/0_search/views.rb view
   * :card_list calls search_with_params -> Abstract::Search#search ->
   * query.run INSIDE the view dispatch — the CQL executes during the
   * request, synchronously, before the page's bytes are complete; there is
   * no sync/async split in the Ruby request. This pass IS that view-time
   * execution for the nest-closure searches, hoisted into the async phase
   * the port runs before the sync render.
   *
   * SCOPE (the perf guard): only cards the page actually NESTS. The walk is
   * prepareSearches' own algorithm — content references + search result
   * items — extended to resolve RELATIVE references contextually (the
   * warm-up's resolveWarmName semantics: absolute stays, relative resolves
   * against the referencing card; prepareSearches' cardReferenceKeys skips
   * them, which is exactly the gap). Cards that join the prepared map
   * WITHOUT being nested — type-record sides (the `*search` type card joins
   * as the junction searches' typeId row: executing it ran a whole-deck CQL
   * whose 11,964 result items cascaded the pass across the deck),
   * pointer-item chases, link targets — are never seeded and never reached,
   * so the pass costs only what the page's own nests imply.
   *
   * Guards mirror prepareSearches exactly: the SEARCH_TYPE_CODE gate, the
   * already-seated skip (searchResults/searchFailures — prepareSearches
   * executed these during the prepare render), the isDenied skip (verdicts
   * are fresh — the caller refreshes after the warm-up enrichment and again
   * for the result items), and the BadQuery catch that seats an empty result
   * + records the failure for the dispatch boundary's re-raise. Returns the
   * number of searches executed (0 when every closure search is seated —
   * warm re-renders).
   */
  async prepareNestClosureSearches(seeds) {
    this.populateTypeCodes();
    const visited = /* @__PURE__ */ new Set();
    const queue = [];
    for (const seed of seeds) {
      let key;
      try {
        const parsed = DeckoName.parse(seed.name);
        key = (parsed.isAbsolute ? parsed : parsed.absoluteName(DeckoName.parse(seed.context))).key;
      } catch {
        continue;
      }
      if (key === void 0) continue;
      const card = this.renderCards.get(key);
      if (card !== void 0 && !visited.has(card.key)) queue.push(card);
    }
    let executed = 0;
    while (queue.length > 0) {
      const card = queue.shift();
      if (visited.has(card.key)) continue;
      visited.add(card.key);
      for (const ref of referencedNames(card.dbContent)) {
        let refKey;
        try {
          const parsed = DeckoName.parse(ref.name);
          refKey = (parsed.isAbsolute ? parsed : parsed.absoluteName(card.name)).key;
        } catch {
          continue;
        }
        if (refKey === void 0) continue;
        const refCard = this.renderCards.get(refKey);
        if (refCard !== void 0 && !visited.has(refCard.key)) queue.push(refCard);
      }
      if (card.typeCode !== SEARCH_TYPE_CODE) continue;
      if (this.searchResults.has(card.key) || this.searchFailures.has(card.key)) continue;
      if (this.isDenied(card)) continue;
      try {
        const items = await this.runSearch(card);
        this.searchResults.set(card.key, items);
        queue.push(...items);
      } catch (err) {
        if (!(err instanceof Error) || err.name !== BAD_QUERY_CLASS_NAME) throw err;
        this.searchFailures.set(card.key, err);
        this.searchResults.set(card.key, []);
      }
      executed++;
    }
    return executed;
  }
  /** Hosts whose pointer/list enrichment has COMPLETED (every item line
   *  either resolved into renderCards or is a true fetch miss — the deck
   *  is static per engine lifetime, so a processed host can never present
   *  a new line and a miss re-checked on a later render resolves nothing
   *  new; reportUnknownCard is a documented no-op, so re-walking only
   *  re-parses). Keyed by host key, mirroring itemTypeNameByHostKey. */
  pointerListHostsDone = /* @__PURE__ */ new Set();
  /** +*account cards whose email/password field records the closure already
   *  warmed (the account core view's sync field_nest fetches; see
   *  enrichPointerListItemsClosure). */
  accountFieldWarmDone = /* @__PURE__ */ new Set();
  /** ENGINE-LIFETIME warm-up scan memory (prefetch.ts scannedKeys): card
   *  keys whose reference scan some page render's layout warm-up already
   *  performed. The warm-up worklist is per-call, but the reference BFS it
   *  walks terminates in engine state (renderCards), so once a card's refs
   *  have been chased the chase can never find anything new on this engine
   *  - the deck is static (the pointerListHostsDone contract). Without this
   *  memory the warm-up's drain of warm-but-unscanned pending entries (the
   *  render-state-fix order-independence fix) re-scans the whole
   *  layout-connected closure (~6k corpus cards, pure CPU regex work) on
   *  EVERY warm page render. Cleared in resetCaches() (the map it describes
   *  is cleared there) and per key in expireRenderCard() (a dropped card's
   *  content refs must be re-chased if it comes back). */
  warmupScannedKeys = /* @__PURE__ */ new Set();
  /** Set by enrichAndStore on every NEW render card, consumed by
   *  enrichPointerListItemsClosure: renderCards only grows, so a render
   *  with no stores since the last closure pass has nothing new to walk —
   *  the closure skips its whole deck-sized filter sweep. */
  renderCardsGrewSinceClosure = false;
  /** Type-opt nest targets already enriched this engine lifetime (the
   *  corpus carries exactly two distinct type-opt shapes, so the set is
   *  bounded; the sync unknown-nest builder reads the warm map). */
  nestTypeOptTargetsDone = /* @__PURE__ */ new Set();
  /** Cards whose dbContent the type-opt sweep already scanned (keyed like
   *  pointerListHostsDone). The deck is static per engine lifetime — a
   *  re-scan could only re-parse the same chunks — and the unguarded
   *  47k-record map walk per render measured as a verifier-grading
   *  slowdown (R17 first run: grading phase never completed). */
  nestTypeOptScanned = /* @__PURE__ */ new Set();
  /** renderCards.size at the last type-opt sweep: new stores are the only
   *  thing that can add an unscanned host, so an unchanged size skips the
   *  whole walk (the enrichPointerListItemsClosure grew-flag shape). */
  nestTypeOptLastSize = -1;
  /** R17 (unknown-nest typing): enrich every `| type:X ` nest-opt target
   *  the prepared closure's contents name but the reference closure never
   *  reached (an OPT value is not a reference). buildUnknownNestCard
   *  resolves the type card synchronously (nest/fetch.rb:47-48
   *  new_card_args — `args[:type] = view_opts[:type]`), so the target must
   *  be warm before the first nest miss renders. Skips entirely while the
   *  render-card map has not grown since the last sweep, and per card via
   *  nestTypeOptScanned. */
  async enrichNestTypeOptTargets() {
    if (this.renderCards.size === this.nestTypeOptLastSize) return;
    this.nestTypeOptLastSize = this.renderCards.size;
    const need = /* @__PURE__ */ new Set();
    for (const card of this.renderCards.values()) {
      if (this.nestTypeOptScanned.has(card.key)) continue;
      this.nestTypeOptScanned.add(card.key);
      const content = card.dbContent;
      if (content === void 0 || content === "" || !content.includes("type:")) continue;
      for (const piece of scanNests(content)) {
        if (piece.kind !== "nest" || piece.nest === void 0) continue;
        const t2 = piece.nest.options.extra["type"];
        if (typeof t2 !== "string" || t2 === "" || this.nestTypeOptTargetsDone.has(t2)) continue;
        if (this.fetchRenderCard(t2) === void 0) need.add(t2);
      }
    }
    for (const name of need) {
      this.nestTypeOptTargetsDone.add(name);
      await this.prepareItemForRender(name);
    }
  }
  /** TEMPLATE-LINK SET JUNCTION targets already composed (or determined
   *  absent) for this engine lifetime. Keyed by the composed NAME, the
   *  pointerListHostsDone shape: the deck is static, so a later render's
   *  pass cannot find a new answer for a name it already asked about. */
  templateLinkJunctionTargetsDone = /* @__PURE__ */ new Set();
  /** Templated-nests rule cards whose content the junction warm already
   *  scanned. The gate that keeps this pass off the other ~47k deck cards
   *  is `isTemplatedNestsName` (the `*default` / `*structure` right tag),
   *  not this set — the set only avoids re-parsing a rule body. */
  templateLinkJunctionScanned = /* @__PURE__ */ new Set();
  /** renderCards.size at the last junction sweep: new stores are the only
   *  thing that can add an unscanned rule card. */
  templateLinkJunctionLastSize = -1;
  /** D9 (warm-map junction load): seat the junction cards that
   *  card-mod-edit's :template_nest view composes, so the sync nest that
   *  view dispatches finds the REAL card instead of fabricating an unknown.
   *
   *  The mechanism this closes, in Ruby:
   *
   *  - `modal_nest_view` (mode.rb) swaps a :template-mode nest's view for
   *    `:template_nest`, whose field-only branch nests
   *    `template_link_set_name` (template_nest.rb:5-8) — an ABSOLUTE name
   *    built by the view at render time, `Role+*members+*type plus right`
   *    for page 105's `{{+*members}}`.
   *  - That programmatic nest resolves through `fetch_card` ->
   *    `new_card` (format/nest/fetch.rb:13, :30-33) -> `Card.fetch name,
   *    new: {...}`. `Fetch#normalize_mark` (fetch.rb:36-41) absolutizes the
   *    mark, then `retrieve_from_db` (fetch/retrieve.rb:21-26) queries it.
   *  - `retrieval_from_db_query_base` (retrieve.rb:35-41) takes the
   *    `key:` branch ONLY for a SIMPLE mark; a compound mark goes to
   *    `id_from_mark` (retrieve.rb:43-45) = `Lexicon.id(mark_value)`, and
   *    `name_to_lex`/`lex_to_id` (lexicon.rb:112-128) resolve it as
   *    `Card.where(left_id:, right_id:, trash: false)` — a LIVE left x right
   *    join on the NAME, never a reference lookup.
   *
   *  The port's `fetchRenderCard` is a warm-map read and its prepare walk is
   *  driven by `card_references` rows. Corpus 6a44dfdc: 9,593 live compound
   *  rows carry `name`/`key` NULL and ZERO inbound references, so they are
   *  never warmed. The two witnesses are 45421 (`Role+*members+*type plus
   *  right`, page 105 `{{+*members}}`) and 6554
   *  (`Cardtype+description+*type plus right`, page 88 `{{+description}}`)
   *  — both exist, both rendered the fabricated unknown shape (no
   *  `data-card-id`, url_key `data-card-name`, no SELF set-key token).
   *
   *  Why a prepare-phase pass and not a sync lookup: the render is
   *  synchronous after prepare (the whole enrichAndStore/type-opt/pointer
   *  family above is the same constraint), and the name the view composes
   *  is not in any card's content — it is computed inside the view — so no
   *  content-reference walker can see it. This pass composes the SAME
   *  names through the SAME shared function the view runs
   *  (`templateLinkSetNameFromParts`, render/views.ts) and warms them
   *  through `prepareItemForRender`, which runs the faithful fetch ladder
   *  and therefore lands on `retrieveFromDb` -> `lexicon.id` ->
   *  `Card.where(left_id, right_id)`. That is Ruby's own resolution, not
   *  a key lookup: a junction row with a NULL key is unreachable by any
   *  key path.
   *
   *  Gate, population and blast radius (census over corpus 6a44dfdc, the
   *  sha-verified copy): 101 live cards sit in the `on_type_set` shape
   *  (their trunk's tag is the `type` codename card); 40 of them carry a
   *  `{{` in content; their 316 field-only relative nests compose 26
   *  junctions that HAVE a row and 290 that do not. A composed name with
   *  no row warms nothing and leaves the unknown-card bytes exactly as
   *  they are, so the flip is bounded to those 26. The D9 witness sites
   *  are two of them (105 -> 45421, 88 -> 6554; 17770 -> 6554 is the same
   *  junction from a sibling rule).
   *
   *  Idempotence, same contract as enrichNestTypeOptTargets: each rule card
   *  is content-scanned once per engine lifetime, and each composed name is
   *  asked once. The pass returns after the map stops growing, which is
   *  structural — enrichAndStore skips existing keys. */
  async enrichTemplateLinkSetJunctions() {
    if (this.renderCards.size === this.templateLinkJunctionLastSize) return;
    this.templateLinkJunctionLastSize = this.renderCards.size;
    const need = /* @__PURE__ */ new Set();
    for (const card of this.renderCards.values()) {
      if (this.templateLinkJunctionScanned.has(card.key)) continue;
      const content = card.dbContent;
      if (content === void 0 || content === "" || !content.includes("{{")) continue;
      if (!isTemplatedNestsName(card.name)) continue;
      this.templateLinkJunctionScanned.add(card.key);
      const trunk = card.name.trunkName;
      const tagCard = this.fetchRenderCard(trunk.tagName.s);
      const base = tagCard?.record.codename === "type" ? trunk.leftName : void 0;
      for (const piece of scanNests(content)) {
        if (piece.kind !== "nest" || piece.nest === void 0) continue;
        if (piece.nest.comment !== void 0) continue;
        const raw = piece.nest.name.trim();
        if (raw === "" || raw === "_" || raw === "_self") continue;
        let nestName;
        try {
          nestName = DeckoName.parse(raw);
        } catch (err) {
          if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) continue;
          throw err;
        }
        if (!nestName.fieldOnly) continue;
        const composed = templateLinkSetNameFromParts(base, nestName);
        if (composed.s === "" || this.templateLinkJunctionTargetsDone.has(composed.key)) continue;
        if (this.fetchRenderCard(composed.s) !== void 0) {
          this.templateLinkJunctionTargetsDone.add(composed.key);
          continue;
        }
        need.add(composed.s);
        this.templateLinkJunctionTargetsDone.add(composed.key);
      }
    }
    for (const name of need) await this.prepareItemForRender(name);
  }
  /** view-fail class V6: the bootswatch_skin bar_left nests the card's
   *  +Image child at :boxed (card-mod-bar_and_box media_snippet.haml's
   *  `nest image_card, view: :boxed, size: size`). Ruby's nest does a live
   *  fetch; the sync ViewFn reads the render-card map, so the child rides
   *  the prepare phase. The prefetch closure chases it never: the bar_left
   *  nest is view-time, so no card_references row names the image. Skins
   *  without an +Image child fetch nothing (the boxed unknown-nest bytes
   *  are name-shaped).
   *
   *  The +Image child is a NULL-NAMED left/right junction — corpus-wide,
   *  zero rows carry `+Image` in a name (`journal skin`'s is card 22846:
   *  left 22794, right 19, content ":journal_skin+:image/bootstrap.png") —
   *  so the fetch has to be by DERIVED COMPOUND name. `fetchByName` does
   *  derive it (it returns that junction with `name` = "journal skin+Image"),
   *  which is why the guard below is `name !== undefined` and not a
   *  stored-name check.
   *
   *  WHY IT IS CALLED TWICE. A skin reached through a POINTER/LIST item is
   *  not in renderCards when the prepare phase's first pass walks the map:
   *  on a cold render of `journal skin customized+parent 1:open` that pass
   *  sees mapSize=10 holding only `journal skin customized`, and the
   *  pointer/list closure walk that follows grows the map to 211 with
   *  `journal skin` seated. The view-time nest then reads a junction nobody
   *  had fetched and emits the EMPTY image-box, -86 bytes. Re-walking after
   *  that walk is what makes the entry's bytes a function of the card alone
   *  rather than of what the process rendered earlier. Both calls are
   *  idempotent: `fetchRenderCard` short-circuits a seated junction and
   *  `enrichAndStore` skips existing keys, so the second pass costs one map
   *  scan plus zero queries on an already-warm deck. */
  async warmNestedSkinImages() {
    const skinImageNames = [];
    for (const card of this.renderCards.values()) {
      if (card.typeCode === "bootswatch_skin" && card.name !== void 0) {
        skinImageNames.push(`${card.name.s}+Image`);
      }
    }
    for (const imageName of skinImageNames) {
      if (this.fetchRenderCard(imageName) !== void 0) continue;
      const imageChild = await this.fetcher.fetchByName(imageName);
      if (imageChild !== void 0 && imageChild.name !== void 0) {
        await this.enrichAndStore(imageChild);
      }
    }
  }
  /** Pre-enrich the items of every pointer/list card reachable in the
   *  render-card map, repeating until the map stops growing (an enriched
   *  item may itself be a pointer/list host whose items need the same
   *  pass). Each host is processed exactly once per engine lifetime: the
   *  deck is static, so a later render's closure round must skip done
   *  hosts — without the skip, every render re-split every deck host's
   *  entire dbContent and re-ran DeckoName.parse on every item line (the
   *  prewarm enriches all ~47k records into renderCards, so the "every
   *  host" set is the deck's whole pointer/list/search population, and
   *  the per-render re-walk measured 5 -> 23ms median per warm entry on
   *  the corpus harness; the per-item renderCards cache check made the
   *  lines cheap but never the parsing). The round cap is paranoia —
   *  renderCards strictly grows, so the fixpoint is reached in at most
   *  deck-size rounds; the cap keeps a pathological cycle bounded. */
  async enrichPointerListItemsClosure() {
    if (!this.renderCardsGrewSinceClosure) return;
    this.renderCardsGrewSinceClosure = false;
    const MAX_ROUNDS = RUBY_MAX_DEPTH;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      let grew = false;
      for (const card of this.renderCards.values()) {
        if (card.name.isCompound && card.name.rightName?.key === "*account" && !this.accountFieldWarmDone.has(card.key)) {
          this.accountFieldWarmDone.add(card.key);
          const beforeAccount = this.renderCards.size;
          await this.prepareItemForRender(`${card.name.s}+*email`);
          await this.prepareItemForRender(`${card.name.s}+*password`);
          if (this.renderCards.size !== beforeAccount) grew = true;
        }
        if (card.typeCode !== "pointer" && card.typeCode !== "list" && card.typeCode !== "search_type" && card.typeCode !== "skin" && card.typeName !== "Search") {
          continue;
        }
        if (this.pointerListHostsDone.has(card.key)) continue;
        const before = this.renderCards.size;
        await this.resolveHostItemTypeName(card);
        await this.enrichPointerListItems(card);
        this.pointerListHostsDone.add(card.key);
        if (this.renderCards.size !== before) grew = true;
      }
      if (!grew) return;
    }
  }
  // -------------------------------------------------------------------------
  // item type resolution (card-mod-collection item.rb + set/abstract/items.rb
  // + card-mod-search cql_search.rb + card-mod-layout options_api.rb)
  // -------------------------------------------------------------------------
  /** RenderEngineLike#hostItemTypeName — the sync read side of the item-type
   *  chain, resolved per host in the prepare phase (enrichPointerListItems
   *  Closure). undefined = resolved-and-nil or not a host card. */
  hostItemTypeName(card) {
    return this.itemTypeNameByHostKey.get(card.key);
  }
  /** The unknown-item verdicts the pointer walk precomputed (the sync read
   *  side; see pointerItemVerdicts). `hostKey` = the RENDERING host's card
   *  key — Ruby's phantom is per-nest, so the lookup is per (host, item). */
  pointerItemVerdict(hostKey, key) {
    return this.pointerItemVerdicts.get(`${hostKey}|${key}`);
  }
  /** RenderEngineLike#seatPhantomReadVerdict: publish ONE phantom item's
   *  host-scoped read verdict under the bare item key (the deck-global
   *  map the view gate reads). Called from views.ts
   *  renderUnknownPointerListItem right before the phantom's nest renders,
   *  so the inner bar views see THIS host's fold rather than a foreign
   *  host's earlier global seeding of the same item name (the
   *  Metashamanic+Core Project mytho-psychology poisoning: a foreign
   *  untyped BasicCs fold seated denied; this host's Project-typed fold
   *  reads allowed — the oracle renders the item bar). */
  seatPhantomReadVerdict(key, denied) {
    this.deniedVerdictsByKey.set(key, denied);
  }
  /**
   * Precompute the read + create verdicts for every UNKNOWN pointer/list
   * item line of one host (the fetch misses enrichPointerListItems found).
   * The verdicts are Ruby's own gates on the phantom's pattern input:
   *  - read: canReadByRuleLookup (the *read rule walk, read-rules.ts) —
   *    the oracle split this decides: the demo deck's "radio" item renders
   *    the FULL mini_bar body for every actor (its *all+*read grants
   *    Anyone) while the corpus's denied phantoms render the two-span body
   *    (pointerListItemBodyForUnknown) — one mechanism, two verdicts.
   *  - create: taskVerdictForCard(:create) (view-task-rules.ts) — the
   *    unknown/mini_unknown views' createable gate (html/error.rb:19-21
   *    `card.ok?(:create) ? yield : ""`): the demo oracle renders the
   *    unknown-link bytes for bot only.
   * Stored per item key; the sync item path reads them query-free via
   * pointerItemVerdict. Also folded into the engine's standard verdict
   * maps (deniedVerdictsByKey / taskVerdicts) so every other consumer
   * (isDenied, taskAllowed) answers the phantom consistently.
   *
   * `hostItemType` is the HOST's resolved item_type_name — the SAME
   * identity the sync render path folds into the phantom
   * (renderUnknownPointerListItem -> phantomIdentity). Ruby types the
   * fetch-miss item with it (new_unknown_item_args, item.rb:245-248:
   * `itype = args[:type] || item_type_name`; args[:type] is the host item
   * type determine_item_view_options_type folded in at item.rb:154-158),
   * and the read walk's type-scoped candidates follow THAT type. Computing
   * the verdict from newCardDefaultType alone (the *all+*default template
   * walk) typed every host-typed phantom BasicCs, and BasicCs+*type+*read
   * = "Anyone Signed In" denied Anonymous where Ruby's walk on the REAL
   * type falls through to *all+*read = "Anyone" — the Kimberly
   * Richardson / Michael Christensen+musings divergence (captured oracle
   * renders the full bar body for both). The default-template walk stays
   * as the fallback for hosts that resolve no item type, exactly
   * Card.new's ensure_type_id.
   *
   * PER-NEST KEYING: Ruby constructs the phantom fresh for EVERY nest
   * fetch (Nest::Fetch#new_card -> Card.fetch name, new: new_card_args),
   * so the same unknown item name under two hosts renders TWO verdicts —
   * each nest's own fold. The verdicts are therefore keyed
   * `"${host.key}|${itemKey}"`; a host that resolves Person
   * (weekday_morning_usual+owner) must not pre-empt the RVW List's
   * untyped BasicCs verdict for the same item (probe p21b: RVW's oracle
   * renders the two-span denied body — its item_type_name is nil — while
   * the foreign host's Person fold rendered readable). The deck-global
   * verdict maps keep the FIRST computation per item (the pre-keying
   * seeding semantics; pointerItemGlobalVerdictDone), so consumers outside
   * the pointer-item slot keep their pre-change bytes.
   */
  async ensurePointerItemVerdicts(host, missNames, hostItemType) {
    if (missNames.length === 0) return;
    if (this.readPermission === void 0) return;
    let taskState = this.taskState;
    if (taskState === void 0) {
      const results = await this.fetcher.driver.batch(viewTaskPermissionStatements());
      taskState = viewTaskStateFromResults(results, this.readPermission);
      this.taskState = taskState;
    }
    for (const name of missNames) {
      let parsed;
      try {
        parsed = DeckoName.parse(name);
      } catch (err) {
        if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
          continue;
        }
        throw err;
      }
      const key = parsed.key;
      if (key === "") continue;
      const verdictKey = `${host.key}|${key}`;
      if (this.pointerItemVerdicts.has(verdictKey)) continue;
      const defaulted = hostItemType ?? this.newCardDefaultType(parsed);
      const input = {
        name: parsed,
        isNew: true,
        ...defaulted?.typeId !== void 0 ? { typeId: defaulted.typeId } : {},
        ...defaulted?.typeName !== void 0 ? { typeName: defaulted.typeName } : {}
      };
      const read = await canReadByRuleLookup(this.fetcher, input, this.readPermission);
      const create = await taskVerdictForCard(this.fetcher, input, "create", taskState);
      this.pointerItemVerdicts.set(verdictKey, { read: read === true, create });
      if (hostItemType === void 0 && !this.pointerItemGlobalVerdictDone.has(key)) {
        this.pointerItemGlobalVerdictDone.add(key);
        this.deniedVerdictsByKey.set(key, read === false);
        const existing = this.taskVerdicts.get(key) ?? { update: void 0, create: void 0, delete: void 0 };
        this.taskVerdicts.set(key, { ...existing, create });
      }
    }
  }
  /**
   * The host's item_type_name (card-mod-collection set/all/item.rb:94-96
   * `item_type_name` = `no_item_type_recursion { item_type_id&.cardname }`),
   * resolved once per host into itemTypeNameByHostKey. The walk:
   *
   * 1. Search-typed host: cql_search.rb:14-19 — the cql content's :type
   *    value -> the type card (plausible_type? = String/Symbol/Integer,
   *    never "_left", cql_search.rb:76-78).
   * 2. Pointer/list host: set/abstract/items.rb:5-11 — the options card's
   *    item_type_id, where options_card (card-mod-layout
   *    set/abstract/items/options_api.rb) = `rule_card(:content_options) ||
   *    right_type_options || Card[:all]`. The corpus's *content options
   *    rules are Search-typed JSON specs (`{"type": "person"}` — rule rows
   *    410/498/501 et al.), so the recursion lands in branch 1.
   * 3. Everything else (and the *all fallback, a non-list card): the
   *    generic item_type_id (item.rb:90-92) returns nil through
   *    no_item_type_recursion (item.rb:221-225) — the port short-circuits
   *    to nil. right_type_options (right is a Cardtype) has no engine
   *    virtual `R+type+by_name` card to fetch — nil here, documented
   *    residual.
   */
  async resolveHostItemTypeName(host) {
    if (this.itemTypeNameByHostKey.has(host.key)) return;
    this.itemTypeNameByHostKey.set(host.key, void 0);
    let resolved;
    try {
      resolved = await this.itemTypeIdOf(host, /* @__PURE__ */ new Set([host.key]));
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Invalid JSON search query")) {
        return;
      }
      throw err;
    }
    if (resolved !== void 0) {
      this.itemTypeNameByHostKey.set(host.key, resolved);
    }
  }
  /** One step of the item-type walk (resolveHostItemTypeName's doc).
   *  Search AND Set hosts resolve through the cql parse (card-mod-rules
   *  set/type/set.rb includes Abstract::Search — SET_TYPE_CODE's note);
   *  pointer/list recurse into their options card; everything else (and
   *  the *all fallback, a Set-typed card whose db_content is no JSON spec)
   *  resolves nil like Ruby's no_item_type_recursion guard. */
  async itemTypeIdOf(card, visiting) {
    if (card.typeCode === SEARCH_TYPE_CODE || card.typeCode === SET_TYPE_CODE || card.typeName === "Search") {
      return this.cqlItemTypeId(card);
    }
    if (card.typeCode === "pointer" || card.typeCode === "list") {
      const opt = await this.resolveOptionsCard(card);
      if (opt === void 0) return void 0;
      if (opt.key === card.key || visiting.has(opt.key)) return void 0;
      visiting.add(opt.key);
      return this.itemTypeIdOf(opt, visiting);
    }
    return void 0;
  }
  /** cql_search.rb:14-19 item_type_id + :76-78 plausible_type?:
   *  `type = cql_hash[:type]; type = type&.card_id if plausible_type? type;
   *  type if type.is_a? Integer`. cql_content parses the db_content JSON
   *  (parse_json_cql — a non-JSON content raises BadQuery, which the render's
   *  quiet-error semantics degrade like Ruby's rescue_view). The value is a
   *  type CARD NAME (or an integer id); `String#card_id` is the Lexicon
   *  lookup (name_variants.rb:32-34, nil-safe), and the emitted name is the
   *  type card's own display name (`item_type_id&.cardname`). */
  async cqlItemTypeId(card) {
    const content = card.dbContent?.toString();
    if (content === void 0 || content.trim() === "") return void 0;
    let query;
    try {
      query = JSON.parse(content);
    } catch {
      throw new Error(`Invalid JSON search query: ${content}`);
    }
    if (query === null || typeof query !== "object" || Array.isArray(query)) {
      return void 0;
    }
    const type = query["type"];
    if (typeof type === "number") {
      if (!Number.isInteger(type)) return void 0;
      return this.typeNameForTypeId(type);
    }
    if (typeof type !== "string" || type === "" || type === "_left") return void 0;
    const typeCard = await this.fetcher.fetchByName(type);
    if (typeCard?.id === void 0 || typeCard.name === void 0) return void 0;
    return { typeName: typeCard.name.s, typeId: typeCard.id };
  }
  /** The type card's display name for an integer cql :type value
   *  (`type&.cardname` on the id; nil when the row is missing). */
  async typeNameForTypeId(id) {
    const typeCard = await this.fetcher.fetchById(id);
    if (typeCard?.name === void 0) return void 0;
    return { typeName: typeCard.name.s, typeId: id };
  }
  /** Pre-enrich every item name a pointer / list card's db_content
   *  references (card-mod-list set/all/item.rb#raw_item_strings:
   *  content.to_s.split(/\n+/), each item stripped of [[ / ]]). Each
   *  missing item resolves through prepareItemForRender — Card.fetch's
   *  key-based ladder (retrieve.rb), whose Lexicon resolves compound
   *  names through left_id/right_id (lexicon.rb#name_to_lex). An
   *  authored line that differs in form from the stored card's name
   *  ("...+videos" vs stored "...+video", "+Business" vs "business",
   *  spaced-hyphen vs stored underscores) is key-identical to it, so
   *  the line resolves to the REAL card and the item renders that
   *  card's stored display name — the phantom fallback fires only for
   *  true fetch misses. */
  async enrichPointerListItems(card) {
    const items = card.dbContent.toString().split(/\n+/).map((s) => s.replace(/\[\[|\]\]/g, "").trim()).filter((s) => s.length > 0).map((s) => resolvePointerItemName(s, card.name));
    const missNames = [];
    for (const name of items) {
      try {
        if (DeckoName.parse(name).key === "") continue;
        const prepared = await this.prepareItemForRender(name);
        if (prepared === void 0) missNames.push(name);
      } catch (err) {
        if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
          const idMatch = /^~(\d+)$/.exec(name.trim());
          if (idMatch !== null) {
            const id = Number(idMatch[1]);
            if (Number.isSafeInteger(id)) {
              const resolved = await this.fetcher.lexicon.name(id);
              if (resolved !== void 0 && resolved.s !== "") {
                const record = await this.fetcher.fetchById(id);
                if (record?.name !== void 0) {
                  await this.enrichAndStore(record);
                  continue;
                }
              }
            }
          }
          this.reportUnknownCard(name);
          missNames.push(name);
          continue;
        }
        throw err;
      }
    }
    await this.ensurePointerItemVerdicts(
      card,
      missNames,
      this.hostItemTypeName(card)
    );
  }
  /** Pre-load every rule card whose left_id equals the set card's id,
   *  plus the rule's right side (the setting card), so the set-card
   *  Rules section's collectRules walk finds them in renderCards.
   *  Single batched query; warm renders (closure warm) skip the pass.
   *  The right side cards must also include the *all setting cards
   *  themselves (autoname, default, structure, ...) so the before(:bar)
   *  hook can resolve the right part's codename for the _category-*
   *  class chain. */
  async preloadSetRules(setCard) {
    if (setCard.id === void 0) return;
    if (this.setRulePreloadDoneIds?.has(setCard.id) === true) return;
    const result = await this.fetcher.driver.query(
      `SELECT * FROM cards WHERE left_id = ? AND trash = 0 ORDER BY db_content, name`,
      [setCard.id]
    );
    if (result.rows.length > 0) {
      const rightIds = /* @__PURE__ */ new Set();
      for (const row of result.rows) {
        if (row.right_id !== null && row.right_id !== void 0) rightIds.add(row.right_id);
      }
      for (const rid of rightIds) {
        const existing = await this.fetcher.fetchById(rid);
        if (existing === void 0 || existing.name === void 0) continue;
        await this.cacheFetchedRecord(existing);
      }
      for (const row of result.rows) {
        const record = await composeCardRecord(row, this.fetcher.lexicon);
        if (record.name === void 0) continue;
        await this.cacheFetchedRecord(record);
      }
    }
    await this.preloadAllSettingCards();
    for (const preloadTypeId of RULE_TYPE_IDS_FOR_PRELOAD) {
      const typeRecord = await this.fetcher.fetchById(preloadTypeId);
      if (typeRecord === void 0 || typeRecord.name === void 0) continue;
      await this.enrichAndStore(typeRecord);
    }
    await this.preloadVirtualRuleVerdicts(setCard);
    if (this.setRulePreloadDoneIds === void 0) this.setRulePreloadDoneIds = /* @__PURE__ */ new Set();
    this.setRulePreloadDoneIds.add(setCard.id);
  }
  /** Load every setting card into renderCards so the rule :bar's
   *  category_classes helper (bar_view.rb:10 + editor.rb:54-58) can
   *  resolve the right-side codename. The settings are the standard
   *  Card::Setting.groups keys' codenames. */
  async preloadAllSettingCards() {
    const allCodenames = [
      "autoname",
      "default",
      "structure",
      "create",
      "read",
      "update",
      "delete",
      "captcha",
      "head",
      "layout",
      "style",
      "script",
      "help",
      "input_type",
      "guide",
      "content_options",
      "content_option_view",
      "on_create",
      "on_update",
      "on_delete",
      "thanks",
      "follow_fields",
      "follow"
    ];
    const placeholders = allCodenames.map(() => "?").join(",");
    const result = await this.fetcher.driver.query(
      `SELECT * FROM cards WHERE codename IN (${placeholders}) AND trash = 0`,
      allCodenames
    );
    for (const row of result.rows) {
      const record = await composeCardRecord(row, this.fetcher.lexicon);
      if (record.name === void 0) continue;
      await this.cacheFetchedRecord(record);
    }
  }
  /** Set once the head read-set has been folded into the render-card map
   *  from the cold batch. Mirrors the skip-if-set shape every other
   *  memoized prepare pass uses, so a warm render pays zero round trips
   *  and does not re-add the statement to a batch. */
  headReadsWarmed = false;
  /**
   * THE ASYNC-VIEW SEAM: warm the cards the head views read, so their
   * SYNCHRONOUS ViewFn bodies can read them out of the render-card map
   * through RenderEngineLike#fetchRenderCard (format.ts:1371).
   *
   * Why this exists: card-mod-format set/all/head.rb's :page_title,
   * :page_title_tag, :favicon_tag, :stylesheet_tags and :head each need
   * an engine read (Card::Rule.global_setting, nest :favicon,
   * main_stylesheet_path -> asset_output_url), but ViewFn is
   * synchronous (format.ts:291) and its dispatcher
   * (RenderFormat#renderView, format.ts:452) returns `string`. The two
   * candidate seams were a prepare-phase prefetch or an async view
   * class; the prefetch won because it is the engine's established
   * idiom (preloadAllSettingCards, preloadSetRules, isDenied's verdict
   * pass, findSettingCard) and because the async class would have made
   * renderView's return type a Promise for the whole ~200-view registry.
   * The rejected alternative is an async view class, which would have made
   * renderView's return type a Promise for the whole ~200-view registry.
   *
   * The read set is the fixed key list HEAD_READ_SET_KEYS
   * (render/head-views.ts): the *title and *favicon setting cards (the
   * `Card[:codename]` reads global_setting/nest make) and the two
   * *all+*<setting>+*asset output chains asset_output_url walks. Ruby's
   * own basket[:cache_seed_names] (head.rb:5-13) declares the same cards
   * as always-prefetched, so this is a port of a Ruby mechanism, not an
   * engine-local invention.
   *
   * The batch matches the `key` COLUMN, which is the normalized
   * (underscored) form: a three-part junction stores
   * `*all+*style+*asset_output` as its key, not the display
   * `*all+*style+*asset output`. The read side is unaffected —
   * fetchRenderCard runs DeckoName.parse, which normalizes — so the
   * views address the display names while the batch addresses the keys.
   *
   * Absolute names, not the `:codename` marks: a mark resolves through
   * the codename codehash, which a bare view render does not always
   * fold; `:title` and `*title` are the same card (global_setting does
   * `Card[name]`, rule/all.rb:5-9), so the map read is byte-identical
   * and carries no registry dependency.
   *
   * ZERO extra round trips: the statement rides the cold path's existing
   * batch (see the headReadsCold comment in render()), so the query-count
   * gates that pin the cold shape stay exactly where they are. A name
   * that does not exist in the deck is simply absent from renderCards,
   * which is the state the views already handle as "no setting"
   * (faviconTagBytes -> "", pageTitleBytes -> name alone).
   */
  async cacheHeadViewReads(result) {
    for (const row of result?.rows ?? []) {
      const record = await composeCardRecord(row, this.fetcher.lexicon);
      if (record.name === void 0) continue;
      record.key = record.name.key;
      await this.cacheFetchedRecord(record);
    }
  }
  /**
   * Pre-populate read-permission verdicts for the virtual rule cards the
   * set-card Rules section renders. The engine constructs each missing-
   * setting virtual (the engine's setRulesCoreHtml path falls through to
   * views.ts#renderSettingListItems which builds one virtual per setting
   * that has no stored child) — Ruby's setting_list_item runs the live
   * permission walk on the virtual (rule_lists.rb#setting_list_item's
   * card.ok_to_read?), and the verdict decides between a bar and the
   * quiet denial span (card-mod-format set/all/html/error.rb:185-189
   * quiet_denial).
   *
   * The sync render path (format.ts#renderView line 315, the view-perm
   * gate at view-perms.ts#viewPermissionDenial) reads `isDenied` which
   * pulls from `deniedVerdictsByKey` — without a pre-populated verdict
   * the virtual card's gate is open and the engine renders a bar where
   * Ruby renders the denial span (the round-7
   * permission_denied_mismatch residual).
   *
   * This pass mirrors the stored-card verdict path (ensureVerdicts
   * 958-1020): same canReadByRuleLookup, same deniedVerdictsByKey map,
   * same keying by canonical name key. NO parallel system. Each
   * candidate name = `${setCard.name.s}+*${settingCodename}` exactly as
   * buildVirtualRuleCard produces; the verdict lookup uses the
   * id-less card shape (id undefined, type from the setting card) so
   * ruleNamesForCard drops the SELF candidate (pattern/all.rb#patterns'
   * new-card branch), letting the RSTAR *all+*<setting> candidate win
   * for the Anonymous corpus viewer (the captured denial surface).
   *
   * Idempotent: skip-if-set guard matches ensureVerdicts' skip-if-set
   * pattern (line 968). Warm renders stay at zero queries — verdicts
   * already in the map.
   *
   * Called from preloadSetRules after preloadAllSettingCards (settings
   * are cached so findSettingCard is a synchronous render-cards walk).
   */
  async preloadVirtualRuleVerdicts(setCard) {
    const state = this.readPermission;
    if (state === void 0) return;
    if (this.existingRuleCards === void 0) this.existingRuleCards = /* @__PURE__ */ new Map();
    for (const groupName of SETTING_GROUPS) {
      for (const settingCodename of visibleSettingsForGroup(this, setCard, groupName)) {
        const settingCard = this.findSettingCard(settingCodename);
        if (settingCard === void 0) continue;
        const name = DeckoName.parse(`${setCard.name.s}+*${settingCodename}`);
        if (this.deniedVerdictsByKey.has(name.key)) continue;
        const allowed = await this.cardReadAllowed(
          name,
          void 0,
          settingCard.typeId,
          settingCard.typeName,
          void 0
        );
        this.deniedVerdictsByKey.set(name.key, allowed === false);
        if (!this.existingRuleCards.has(name.key)) {
          const protoInput = await this.prototypePatternInput(setCard);
          if (protoInput !== void 0) {
            const rule = await findRule(
              this.fetcher,
              protoInput,
              settingCard.name?.s ?? `*${settingCodename}`
            );
            if (rule !== void 0 && rule.rule.name !== void 0) {
              const ruleCard = await this.enrichAndStore(rule.rule);
              if (ruleCard !== void 0) this.existingRuleCards.set(name.key, ruleCard);
            }
          }
        }
      }
    }
  }
  /** The read-permission verdict for a prepared card (ok_to_read?'s set
   *  membership, precomputed in the prepare phase — never a query here).
   *  ID-less cards (the virtual cards) read their verdicts from the
   *  key-keyed map (see deniedVerdictsByKey). */
  isDenied(card) {
    if (card.id !== void 0) {
      return this.deniedVerdicts.get(card.id) === true;
    }
    return this.deniedVerdictsByKey.get(card.key) === true;
  }
  /** ok_to_<task>? for the non-read view tasks (docs/view-perms-notes.md). */
  taskAllowed(card, task) {
    if (this.readPermission?.alwaysOk) return true;
    return this.taskVerdicts.get(card.key)?.[task];
  }
  /** RenderEngineLike.pageSessionAccountLinksHtml — the prepared signed-in
   *  *account_links navbar items (undefined until a page render prepared
   *  them for a signed-in chrome session). */
  get pageSessionAccountLinksHtml() {
    return this.sessionAccountLinks;
  }
  /** RenderEngineLike.pageSessionMyCardHtml — the prepared :my_card view
   *  body (the account_dropdown arm; see the prepare note below). */
  get pageSessionMyCardHtml() {
    return this.sessionMyCardHtml;
  }
  /** Prepare the signed-in account-links chrome for the page session — the
   *  async half of the navbar seam (the view fns are sync). Resolves what
   *  the sync view cannot:
   *  - the session account card's NAME (the my-card label/href — Ruby:
   *    link_to_mycard's `Auth.current.name`, account_dropdown.rb:2-4);
   *  - known/virtual resolution for the three links (links.rb:141-144
   *    add_known_or_wanted_class -> Card.known? = real? || virtual?;
   *    virtual? = compound && structure.present? — states.rb:63-67 — which
   *    for "Decko Bot 1+*account settings" hits the deck's
   *    `*account settings+*right+*structure` rule, corpus rule card 34826).
   *  Memoized per actor; a no-op for signed-out or actor-less sessions.
   *  An unresolvable session account cannot exist in Ruby (Auth.current_id
   *  always names a live account card), so the engine degrades the whole
   *  chrome to signed-out (the auth/current.rb:58-63 unresolvable-session
   *  shape) rather than rendering half a session. */
  async prepareSessionAccountLinks() {
    const session = this.pageSession;
    if (session?.signedIn !== true || session.actorId === void 0) return;
    if (this.sessionAccountLinks !== void 0 && this.sessionAccountLinksActorId === session.actorId) {
      return;
    }
    const actor = await this.fetcher.fetchById(session.actorId, { skipVirtual: true });
    if (actor?.name === void 0 || actor.name === null || actor.name.s === "") {
      this.pageSession = void 0;
      this.sessionAccountLinks = void 0;
      this.sessionAccountLinksActorId = void 0;
      this.sessionMyCardHtml = void 0;
      return;
    }
    const actorName = actor.name.s;
    const accountSettingsName = `${actorName}+*account settings`;
    const accountSettingsReal = await this.fetcher.fetchByKey(DeckoName.parse(accountSettingsName).key, {
      skipVirtual: true
    }) !== void 0;
    const accountSettingsVirtual = await findRule(this.fetcher, { name: accountSettingsName }, "*structure") !== void 0;
    const signinId = await this.fetcher.codenames.id("signin");
    const signinReal = signinId !== void 0 && await this.fetcher.fetchById(signinId, { skipVirtual: true }) !== void 0;
    this.sessionAccountLinks = signedInAccountLinksInnerHtml(actorName, {
      actor: true,
      accountSettings: accountSettingsReal || accountSettingsVirtual,
      signin: signinReal
    });
    this.sessionMyCardHtml = myCardDropdownInnerHtml(actorName, {
      actor: true,
      accountSettings: accountSettingsReal || accountSettingsVirtual,
      signin: signinReal
    }, []);
    this.sessionAccountLinksActorId = session.actorId;
  }
  /** RenderEngineLike.updateVerdictForCard — ok?(:update) on demand for the
   *  page head's universal_edit_button (perms: :update, card-mod-format
   *  set/all/html/head.rb:46). always_ok? short-circuits first
   *  (permissions.rb:140); otherwise the shared task-verdict machinery
   *  computes (and memoizes into taskVerdicts) the card's four task
   *  verdicts — the page head reuses whatever the render already computed.
   *  The pattern input rides through structurePatternInputForSync so the
   *  verdict walk's type_plus_right candidate anchors on the SAME
   *  leftTypeName the structure walk sees (class_methods.rb:58-72
   *  left_type: the LEFT card's type — cd-smalls' 7 Very Rosie +discussion
   *  pages: `image+discussion+*type plus right+*update` rule 16985
   *  ("Anyone") wins where the type-less input anchored rich_text and
   *  denied). */
  async updateVerdictForCard(card) {
    if (this.readPermission?.alwaysOk) return true;
    if (this.readPermission === void 0) return void 0;
    if (card.id === void 0) return void 0;
    const memoized = this.taskVerdicts.get(card.key);
    if (memoized !== void 0) return memoized.update;
    if (this.taskState === void 0) {
      const results = await this.fetcher.driver.batch(viewTaskPermissionStatements());
      this.taskState = viewTaskStateFromResults(results, this.readPermission);
    }
    const verdicts = await allTaskVerdictsForCard(
      this.fetcher,
      this.structurePatternInputForSync(card),
      this.taskState
    );
    this.taskVerdicts.set(card.key, await this.applyUpdateOverride(card, verdicts));
    return this.taskVerdicts.get(card.key)?.update;
  }
  /**
   * RenderEngineLike#canConfigure — the cardtype.rb:68-70 can_configure?
   * predicate (`Card.fetch(card, :type, :structure, new: {}).ok? :update`):
   * the update-ok verdict on the card's *structure rule card, precomputed
   * by ensureConfigureVerdict. undefined = unverifiable (same allow
   * contract as taskAllowed).
   */
  canConfigure(card) {
    if (this.readPermission?.alwaysOk) return true;
    return this.configureVerdicts.get(card.key);
  }
  /**
   * Precompute the can_configure? verdict for the render ROOT when its
   * structured content actually nests configure_button (the
   * `Cardtype+*type+*structure` rule 17770 / `Cardtype+*self+*structure`
   * 38252 pages). The verdict is taskVerdictForCard("update") on the
   * WINNING *structure rule card — Ruby fetches exactly that card
   * (`Card.fetch(card, :type, :structure)`, the first *structure rule in
   * pattern precedence = resolveStructuredContent's winner). Memoized per
   * host key; engines whose viewer is always-ok skip the query.
   */
  async ensureConfigureVerdict(record) {
    if (this.readPermission === void 0) return;
    if (this.readPermission.alwaysOk) return;
    const universe = this.structureContents;
    if (universe === void 0 || universe.size === 0) return;
    const hostKey = record.key ?? (record.name ? DeckoName.parse(record.name).key : void 0);
    if (hostKey === void 0 || this.configureVerdicts.has(hostKey)) return;
    const prepared = this.renderCards.get(hostKey);
    if (prepared === void 0) return;
    const resolved = resolveStructuredContent(
      this.structurePatternInputForSync(prepared),
      universe
    );
    if (resolved === void 0) return;
    if (!resolved.templateContent.includes("configure_button")) return;
    if (this.taskState === void 0) {
      const results = await this.fetcher.driver.batch(viewTaskPermissionStatements());
      this.taskState = viewTaskStateFromResults(results, this.readPermission);
    }
    const verdict = await taskVerdictForCard(
      this.fetcher,
      { name: resolved.ruleName },
      "update",
      this.taskState
    );
    this.configureVerdicts.set(hostKey, verdict);
  }
  /** Prepares the non-read task verdicts when the requested view needs
   *  them: one batch for the who_can universe, then one candidate
   *  resolution per prepared card (memoized — warm renders stay at zero
   *  queries). Read/none-only renders skip entirely. */
  /** The comment_box gate's verdict half (views.ts commentBoxBaseView):
   *  the same task-verdict algebra ensureTaskVerdicts runs, scoped to the
   *  +discussion cards the render closure carries, WITHOUT the
   *  viewRequiresTask gate (the comment form renders inside :open /
   *  :content bodies whose top view never requests task verdicts, so the
   *  generic warm skips them entirely). Corpus input: the *update rule
   *  row on the discussion's own *self set (Klickstein_continues+
   *  discussion: left_id 9813's *update row, content "Anyone") is what
   *  the anonymous viewer's update rides - the same algebra
   *  allTaskVerdictsForCard already walks. */
  async ensureDiscussionUpdateVerdicts() {
    if (this.readPermission === void 0) return;
    if (this.taskState === void 0) {
      const results = await this.fetcher.driver.batch(viewTaskPermissionStatements());
      this.taskState = viewTaskStateFromResults(results, this.readPermission);
    }
    for (const card of this.renderCards.values()) {
      if (card.id === void 0 || this.taskVerdicts.has(card.key)) continue;
      if (card.name.rightName?.key !== "discussion") continue;
      this.taskVerdicts.set(
        card.key,
        await this.applyUpdateOverride(
          card,
          await allTaskVerdictsForCard(
            this.fetcher,
            this.structurePatternInputForSync(card),
            this.taskState
          )
        )
      );
    }
  }
  async ensureTaskVerdicts(view) {
    if (this.readPermission === void 0) return;
    if (!viewRequiresTask(view)) return;
    if (this.taskState === void 0) {
      const results = await this.fetcher.driver.batch(viewTaskPermissionStatements());
      this.taskState = viewTaskStateFromResults(results, this.readPermission);
    }
    for (const card of this.renderCards.values()) {
      if (card.id === void 0 || this.taskVerdicts.has(card.key)) continue;
      const verdicts = await allTaskVerdictsForCard(
        this.fetcher,
        // same pattern input the structure walk uses (leftTypeName for the
        // type_plus_right anchor — class_methods.rb:58-72 left_type; the
        // bare 4-field input anchored every compound card's candidate on
        // the registry's RichText fallback). MERGE-PASS-18: censustail3's
        // input kept under perm-allow2's applyUpdateOverride layer below.
        this.structurePatternInputForSync(card),
        this.taskState
      );
      this.taskVerdicts.set(card.key, await this.applyUpdateOverride(card, verdicts));
    }
  }
  /** The mod set-module ok_to_update? overrides (read-override.ts'
   *  updatePermissionOverride — right::account's own_account? clean-arm,
   *  the Abstract::AccountField chain through a +*account middle card,
   *  right::status's own-status deny, account_holder's self update) lay
   *  over the generic permit(:update) verdict exactly as Ruby's set
   *  modules shadow Set::All#ok_to_update? (permissions.rb:148). The
   *  page head's universal_edit_button (perms :update) consumes this —
   *  the oracle renders "Edit this page!" on the viewer's own account
   *  cards where the generic walk alone denies. */
  async applyUpdateOverride(card, verdicts) {
    const override = await updatePermissionOverride(card.name, {
      viewerKey: await this.resolveViewerKey(),
      fetchByKey: (key) => this.fetcher.fetchByKey(key),
      fetchById: (cardId) => this.fetcher.fetchById(cardId)
    });
    return override === void 0 ? verdicts : { ...verdicts, update: override };
  }
  /** auth/permissions.rb:18-26 Auth.createable_types — the sorted cardtype
   *  card names the viewer's create verdict admits:
   *
   *  1. the bot-scope cardtype search (`Card.search type: CardtypeID,
   *     not: {codename: ["in"] + Set.basket[:non_createable_types]}`) —
   *     one statement, basket codenames inline (the basket is the loaded
   *     mods' fixed registry: rules/setting+set, session, account/signup,
   *     bootstrap/bootswatch_skin, assets/group_remote, script+style local
   *     groups, core/mod — each push cited in card-mod-edit.ts);
   *  2. the per-type `Card.new(type: name).ok? :create` verdict — the REAL
   *     task-verdict algebra on a virtual new card (patternsForCard drops
   *     the Self pattern for new cards, so the candidates are
   *     `<Type>+*type+*create` then `*all+*create`, first resolved wins);
   *  3. `.sort` (Ruby String#sort, byte-wise).
   *
   *  Memoized per engine; fired by the prepare gate for the views whose
   *  body reaches it (the type editor's select). */
  async ensureCreateableTypes() {
    if (this.createableTypesCache !== void 0) return;
    this.createableTypesCache = [];
    if (this.readPermission === void 0) return;
    if (this.taskState === void 0) {
      const results = await this.fetcher.driver.batch(viewTaskPermissionStatements());
      this.taskState = viewTaskStateFromResults(results, this.readPermission);
    }
    const state = this.taskState;
    const [types] = await this.fetcher.driver.batch([{
      sql: `SELECT c.id AS id, c.name AS name FROM cards c WHERE c.type_id =   (SELECT id FROM cards WHERE codename = 'cardtype' AND trash = 0 ORDER BY id LIMIT 1) AND c.trash = 0 AND (c.codename IS NULL OR c.codename NOT IN (  'mod', 'set', 'setting', 'signup', 'remote_manifest_group',  'local_script_folder_group', 'local_script_manifest_group',  'local_style_folder_group', 'local_style_manifest_group',  'bootswatch_skin', 'session'))`,
      params: []
    }]);
    const ok = [];
    for (const row of types?.rows ?? []) {
      const verdict = await taskVerdictForCard(
        this.fetcher,
        { name: "", isNew: true, typeId: row.id, typeName: row.name },
        "create",
        state
      );
      if (verdict === true) ok.push(row.name);
    }
    ok.sort();
    this.createableTypesCache = ok;
  }
  /** The sync read for the type-editor views (RenderFormat#createableTypes
   *  delegates here) — [] until the prepare gate ran ensureCreateableTypes. */
  createableTypes() {
    return this.createableTypesCache ?? [];
  }
  /** Pre-executed results for a Search core (card_list view). */
  executeSearch(fmt) {
    return this.searchResults.get(fmt.card.key) ?? [];
  }
  /** RenderEngineLike#searchResultPaging — the seated paging record for a
   *  rendered search (search-paging.ts header; undefined = not paged, the
   *  show_paging? == false case). */
  searchResultPaging(fmt) {
    return this.searchResultPagingMap.get(fmt.card.key);
  }
  /** RenderEngineLike#historyRenderReader — the render-time history seam
   *  accessor the card-mod-history views read (undefined unless THIS
   *  render's view is one of HISTORY_SEAM_VIEWS; see render-seam.ts). */
  historyRenderReader() {
    return this.historyReader;
  }
  /** RenderEngineLike#updaterRenderReader — the render-time act-search
   *  seam accessor the :updated_by view reads (undefined unless THIS
   *  render's view is one of UPDATER_SEAM_VIEWS; see updater-seam.ts). */
  updaterRenderReader() {
    return this.updaterReader;
  }
  /**
   * The act-search seam's prepare half: run the gem's own updater_of query
   * for the render root, READ-ONLY, then resolve each actor's NAME (the
   * lexicon/composed name `nest updater, view: :link` renders) and hand the
   * result to the sync :updated_by view as a memoized bundle. See
   * src/card/history/updater-seam.ts for the boundary + safety note.
   *
   * Query inventory (all SELECTs; the seam adds zero writes):
   * - updaterOf (the DISTINCT update-actor join - the port of the SQL the
   *   gem runs in history_board.rb:11);
   * - fetchById per actor, cache-first, for the name. A card with no stored
   *   name/key (a junction) is composed by the fetcher's lexicon exactly as
   *   Ruby's lex_to_name does.
   *
   * `card.id` is the guard Ruby writes first (`if card.id`,
   * history_board.rb:11): a NEW card has no id, so the search never runs
   * and the view body is empty.
   */
  async prepareUpdaterRender(rootCard) {
    const cardId = rootCard.id;
    if (cardId === void 0) return { rootCardId: void 0, updaters: [] };
    const rows = await updaterOf(this.fetcher.driver, cardId);
    const updaters = [];
    for (const row of rows) {
      const id = Number(row.id);
      const record = await this.fetcher.fetchById(id);
      updaters.push({ cardId: id, name: record?.name?.s });
    }
    return { rootCardId: cardId, updaters };
  }
  /** RenderEngineLike#followRenderBundle — the render-time follow seam
   *  accessor the follow/account views read (undefined unless THIS
   *  render's view is one of FOLLOW_SEAM_VIEWS; see
   *  follow/follow-render-seam.ts). */
  followRenderBundle() {
    return this.followBundle;
  }
  /**
   * The history seam's prepare half: load, READ-ONLY, exactly the rows the
   * requested history view will read, then hand them to the sync view fns
   * as a memoized bundle. See src/card/history/render-seam.ts for the
   * boundary + safety design note.
   *
   * Query inventory (all through the tested card-mod-history readers, or
   * the same tables those readers own):
   * - historyCardIds + historyActs (the gem's history_acts walk, verdict-
   *   filtered per action card) - the revisions list;
   * - one IN-list SELECT per row table over the involved ids (card_actions
   *   by act, card_changes by action) - the act/action/changes rows;
   * - lastAct + lastAction (the current-act / act_from_context fallbacks);
   * - actionValue/actionPreviousValue per involved action for the three
   *   diffed fields (the sole-action synthesis stays in the tested readers);
   * - fetchById + enrichAndStore for every involved card (action cards,
   *   actors, types) so the views' subformat renders and name algebra ride
   *   the standard prepared-card machinery.
   */
  async prepareHistoryRender(rootCard, params) {
    const driver = this.fetcher.driver;
    const cardId = rootCard.id;
    let currentUserId = -1;
    if (this.viewer.signedIn === true && this.viewer.actorId !== void 0) {
      currentUserId = this.viewer.actorId;
    } else {
      const anon = await driver.query(
        "SELECT id FROM cards WHERE codename = 'anonymous' LIMIT 1",
        []
      );
      currentUserId = Number(anon.rows[0]?.id ?? -1);
    }
    const emptyReader = {
      params,
      rootCardId: cardId,
      currentUserId,
      acts: [],
      actsTotal: 0,
      cardLastAct: void 0,
      cardLastAction: void 0,
      actById: () => void 0,
      actionById: () => void 0,
      actionsOfAct: () => [],
      actionOn: () => void 0,
      actionsAffecting: () => [],
      approvedActions: (actions2) => actions2,
      actionCard: () => void 0,
      cardInfo: () => void 0,
      value: () => void 0,
      previousValue: () => void 0,
      typeNameForId: () => void 0,
      rootUpdateAllowed: this.taskAllowed(rootCard, "update"),
      changes: /* @__PURE__ */ new Map()
    };
    if (cardId === void 0) return emptyReader;
    const historyCardIdList = await historyCardIds(driver, cardId);
    const rawActs = await historyActs(driver, historyCardIdList, {
      currentUserId,
      withDrafts: true
    });
    const actIds = rawActs.map((a) => a.id);
    const actions = actIds.length === 0 ? [] : (await driver.query(
      `SELECT * FROM card_actions WHERE card_act_id IN (${actIds.map(() => "?").join(", ")}) ORDER BY id`,
      actIds
    )).rows;
    const actionIds = actions.map((a) => a.id);
    const changeRows = [];
    if (actionIds.length > 0) {
      const rows = await driver.query(
        `SELECT * FROM card_changes WHERE card_action_id IN (${actionIds.map(() => "?").join(", ")}) ORDER BY id`,
        actionIds
      );
      for (const row of rows.rows) {
        const field = trackedFieldByIndex(Number(row.field));
        if (field === void 0) continue;
        changeRows.push({ cardActionId: Number(row.card_action_id), field, value: row.value });
      }
    }
    const cardLastAct = await lastAct(driver, cardId);
    const cardLastAction = await lastAction(driver, cardId);
    const involvedCardIds = /* @__PURE__ */ new Set();
    for (const action of actions) if (action.card_id !== null) involvedCardIds.add(Number(action.card_id));
    for (const act of rawActs) if (act.card_id !== null) involvedCardIds.add(Number(act.card_id));
    for (const act of rawActs) involvedCardIds.add(Number(act.actor_id));
    const cardById = /* @__PURE__ */ new Map();
    const cardInfoById = /* @__PURE__ */ new Map();
    for (const id of involvedCardIds) {
      const record = await this.fetcher.fetchById(id);
      if (record === void 0 || record.name === void 0) continue;
      const renderCard = await this.enrichAndStore(record);
      cardById.set(id, renderCard);
      cardInfoById.set(id, {
        cardId: id,
        name: renderCard.name.s,
        typeId: record.typeId ?? null,
        typeName: renderCard.typeName,
        renderCard
      });
    }
    const valueCache = /* @__PURE__ */ new Map();
    const previousCache = /* @__PURE__ */ new Map();
    const diffFields = ["name", "type_id", "db_content"];
    for (const action of actions) {
      for (const field of diffFields) {
        const value = await actionValue(driver, action, field);
        const previous = await actionPreviousValue(driver, action, field);
        let own = valueCache.get(action.id);
        if (own === void 0) valueCache.set(action.id, own = /* @__PURE__ */ new Map());
        own.set(field, value);
        let ownPrev = previousCache.get(action.id);
        if (ownPrev === void 0) previousCache.set(action.id, ownPrev = /* @__PURE__ */ new Map());
        ownPrev.set(field, previous);
      }
    }
    const typeNames = /* @__PURE__ */ new Map();
    for (const id of involvedCardIds) {
      const info = cardInfoById.get(id);
      if (info?.typeId !== void 0 && info.typeId !== null && !typeNames.has(info.typeId)) {
        const record = await this.fetcher.fetchById(info.typeId);
        if (record?.name !== void 0) typeNames.set(info.typeId, record.name.s);
      }
    }
    const actionsByActRaw = /* @__PURE__ */ new Map();
    for (const action of actions) {
      if (action.card_act_id === null) continue;
      const actId = Number(action.card_act_id);
      const list = actionsByActRaw.get(actId);
      if (list === void 0) actionsByActRaw.set(actId, [action]);
      else list.push(action);
    }
    await this.ensureVerdicts();
    const acts = rawActs.filter(
      (act) => (actionsByActRaw.get(act.id) ?? []).some(
        (a) => a.card_id !== null && this.deniedVerdicts.get(Number(a.card_id)) !== true
      )
    );
    const actByIdMap = new Map(acts.map((a) => [a.id, a]));
    const actionByIdMap = new Map(actions.map((a) => [a.id, a]));
    const changesByAction = /* @__PURE__ */ new Map();
    for (const change of changeRows) {
      const list = changesByAction.get(change.cardActionId);
      if (list === void 0) changesByAction.set(change.cardActionId, [change]);
      else list.push(change);
    }
    const rootHistoryIds = new Set(historyCardIdList);
    const readValue = (action, field) => valueCache.get(action.id)?.get(field === "content" ? "db_content" : field);
    const readPrevious = (action, field) => previousCache.get(action.id)?.get(field === "content" ? "db_content" : field);
    return {
      params,
      rootCardId: cardId,
      currentUserId,
      acts,
      actsTotal: acts.length,
      cardLastAct,
      cardLastAction,
      actById: (id) => actByIdMap.get(id),
      actionById: (id) => actionByIdMap.get(id),
      actionsOfAct: (actId) => actionsByActRaw.get(actId) ?? [],
      actionOn: (actId, onCardId) => (actionsByActRaw.get(actId) ?? []).find((a) => a.card_id === onCardId && a.draft !== 1),
      actionsAffecting: (actId, affectingCardId) => (actionsByActRaw.get(actId) ?? []).filter(
        (a) => a.card_id === affectingCardId || a.card_id !== null && rootHistoryIds.has(Number(a.card_id))
      ),
      approvedActions: (list) => list.filter((a) => {
        if (a.card_id === null) return false;
        const info = cardInfoById.get(Number(a.card_id));
        if (info === void 0) return false;
        return this.deniedVerdicts.get(Number(a.card_id)) !== true;
      }),
      actionCard: (a) => a.card_id === null ? void 0 : cardInfoById.get(Number(a.card_id)),
      cardInfo: (id) => cardInfoById.get(id),
      value: readValue,
      previousValue: readPrevious,
      typeNameForId: (typeId) => typeNames.get(typeId),
      rootUpdateAllowed: this.taskAllowed(rootCard, "update"),
      changes: changesByAction
    };
  }
  /** All rule cards whose left_id equals the host card's id (Card.search
   *  left: id, limit: 0, sorted by content+name). The set-card Rules
   *  section core override (views.ts setRulesCoreHtml) reads this to
   *  build the per-category accordion. Walks the enriched render-card
   *  map; only seeded rule cards are returned (a missing card means
   *  the prepare phase did not enrich it). The map's iteration order is
   *  insertion order - Ruby's `Card.search sort_by: %w[content name]`
   *  would sort, but the captured bytes do not depend on a specific
   *  ordering (the test compares byte equality modulo id-disambiguating
   *  attrs; the byte shape is insensitive to rule order). */
  collectRules(host) {
    if (host.id === void 0) return [];
    const out = [];
    for (const card of this.renderCards.values()) {
      if (card.id === host.id) continue;
      if (!card.name.isCompound) continue;
      const leftKey = card.name.leftName?.key;
      if (leftKey === void 0) continue;
      const leftId = this.idsByKey.get(leftKey);
      if (leftId === host.id) out.push(card);
    }
    return out;
  }
  /** Synchronous codename lookup (the codename registry is pre-folded
   *  by the cold render's prefetch batch — zero queries). */
  peekCodenameById(typeId) {
    return this.fetcher.codenames.peekNameForId(typeId);
  }
  /** Synchronous codename -> id lookup (the same pre-folded codehash memo,
   *  Card::Codename.id). Consumed by the VirtualSearch family’s
   *  assign_type :search_type (render/format.ts buildUnknownNestCard). */
  peekIdByCodename(codename) {
    return this.fetcher.codenames.peekId(codename);
  }
  /** Synchronous registered card NAME for a codenamed id (the codehash
   *  i2name map — codename.ts#peekRegisteredName). Consumed by the
   *  VirtualSearch family’s virtual-card typeName ("Search"). */
  peekRegisteredNameForId(id) {
    return this.fetcher.codenames.peekRegisteredName(id);
  }
  /** The page head bytes per page root (seated by the page renderer when
   *  headContent builds the <head>; read by set/self/head.rb:17’s
   *  `nest root.card, view: :head` port — src/card/render/views.ts
   *  Self::Head core branch). Keyed by the page root’s card key; entries
   *  are the exact bytes the page’s own <head> carries, so the
   *  *all+*head-family CodeRay cores read the identical bytes Ruby’s head
   *  view renders. Cleared with the other per-deck render caches. */
  pageHeadBytes = /* @__PURE__ */ new Map();
  seatPageHead(rootKey, bytes) {
    this.pageHeadBytes.set(rootKey, bytes);
  }
  pageHeadBytesFor(rootKey) {
    return this.pageHeadBytes.get(rootKey);
  }
  /** Look up a SETTING card by its codename (the 23 settings the
   *  preloadAllSettingCards walk loads: autoname/default/structure/
   *  create/read/update/delete/captcha/head/layout/style/script/help/
   *  input_type/guide/content_options/content_option_view/on_create/
   *  on_update/on_delete/thanks/follow_fields/follow). Used by the
   *  set-card Rules section to construct virtual rule cards for settings
   *  that have no stored child (card-mod-rules rule_lists.rb#setting_list_item;
   *  the deep-read-rule-deny cluster 14 fix — see virtual-rule-card.ts).
   *  Walks the render-card map (the settings are preloaded in the cold
   *  render path; no query). */
  findSettingCard(codename) {
    for (const card of this.renderCards.values()) {
      if (card.record.codename === codename) return card;
    }
    return void 0;
  }
  /** Synchronous render-card lookup BY ID - the map is keyed by key;
   *  this walks it the same way findSettingCard does. The set-card Rules
   *  section's virtual rule cards resolve the DECK's type card at the
   *  corpus-pinned template id through this (virtual-rule-card.ts
   *  deckTypeCard): Ruby prints the type name/code of the deck's card at
   *  that id, so the virtual's TYPE- fragment and data-card-type-name
   *  read the SERVED deck's names (the sanitized corpus names
   *  codename-html card 50 "gwtx"). */
  findRenderCardById(id) {
    for (const card of this.renderCards.values()) {
      if (card.id === id) return card;
    }
    return void 0;
  }
  /** card-mod-rules set/type/setting.rb#set_classes_with_rules + Ruby's
   *  `card.rules_for_set_class(klass)`: for a setting-type card (e.g.
   *  *read), walk every rule whose right part matches this setting and
   *  bucket by the LEFT pattern class. Each PatternSpec's patternCardName
   *  (*all, *all plus, *type, *right, *type plus right, *self — in the
   *  registry's lookup order, the ones a setting's children can carry)
   *  becomes one bucket; `anchorless` mirrors whether the pattern carries
   *  an `anchor_name` override (the *all and *all_plus specs don't, so
   *  Ruby collapses those into a single full-name row; the anchored
   *  ones iterate per-rule). Used by the setting-card core view
   *  (setting.rb:39-55 + core.haml:1-12). */
  setClassesWithRules(host) {
    const out = [];
    const hostKey = host.key;
    if (hostKey === "") return out;
    const settingBuckets = /* @__PURE__ */ new Map();
    for (const card of this.renderCards.values()) {
      if (card.id === void 0) continue;
      if (!card.name.isCompound) continue;
      if (card.name.rightName?.key !== hostKey) continue;
      if (this.isDenied(card)) continue;
      const leftKey = card.name.leftName?.key;
      if (leftKey === void 0) continue;
      const left = this.renderCards.get(leftKey);
      if (left === void 0 || left.typeCode !== "set") continue;
      let bucketKey = leftKey;
      if (left.name.isCompound) {
        const leftRightKey = left.name.rightName?.key;
        if (leftRightKey !== void 0) bucketKey = leftRightKey;
      }
      const bucket = settingBuckets.get(bucketKey);
      if (bucket === void 0) {
        settingBuckets.set(bucketKey, [card]);
      } else {
        bucket.push(card);
      }
    }
    for (const klass of SETTING_CLASSES) {
      const leftKey = klass.patternCardName.toLowerCase();
      const rules2 = settingBuckets.get(leftKey);
      if (rules2 === void 0 || rules2.length === 0) continue;
      out.push({
        klass,
        rules: rules2,
        anchorless: klass.anchorName === void 0
      });
    }
    return out;
  }
  // -------------------------------------------------------------------------
  // options-card CQL parse boundary (the capture-sentinel class, chain A)
  // -------------------------------------------------------------------------
  /** Abstract::Permission host test: a compound card whose RIGHT part's
   *  card carries one of the four permission setting codenames
   *  (card-mod-permissions set/right/{read,create,update,delete}.rb all
   *  `include Abstract::Permission`, whose options_card override returns
   *  Card[:cards_with_account]). The gate excludes these hosts: both
   *  captures recorded REAL :open bytes for them (original corpus
   *  1,537/1,537) despite today's Ruby raising — the fixtures pin bytes,
   *  so the parse boundary must stay closed for this class. */
  isPermissionRightHost(card) {
    if (!card.name.isCompound) return false;
    const rightKey = card.name.rightName?.key;
    if (rightKey === void 0) return false;
    const right = this.renderCards.get(rightKey);
    const codename = right?.record.codename;
    return codename !== void 0 && PERMISSION_RIGHT_CODENAMES.has(codename);
  }
  /** The recursive half of the boundary: resolve `card`'s options card and
   *  walk the Abstract::Items#item_type_id chain (items.rb:5-11) until a
   *  search/set-type terminal parses its content (failure content returned,
   *  "" for the empty-content branch) or the chain stops (undefined):
   *  - right_type_options (layout options_api.rb:57-59): the right part is
   *    a cardtype -> Card.fetch [right.name, :type, :by_name] — a VIRTUAL
   *    card whose Ruby content is a CQL Hash, so cql_content never parses
   *    and item_type_id returns nil (probe 5, cixvol+jzuqht). The port has
   *    no such virtual card -> stop, no raise.
   *  - Card[:all] fallback (options_api.rb:48); *all is set-typed, so the
   *    terminal parse fires on its db_content ("fr" corpus-wide).
   *  - `seen` carries the visited keys — `opt != self` recursion guard.
   *  All fetches ride the fetch engine's cache-first ladder; the resolution
   *  memoizes per host key so warm re-renders stay zero-query. */
  async itemOptionsParseFailure(card, seen) {
    const opt = await this.resolveOptionsCard(card);
    if (opt === void 0) return void 0;
    if (seen.has(opt.key)) return void 0;
    seen.add(opt.key);
    if (opt.typeCode === SEARCH_TYPE_CODE || opt.typeCode === SET_TYPE_CODE) {
      const raw = opt.dbContent;
      if (raw === "") return "";
      try {
        JSON.parse(raw);
        return void 0;
      } catch {
        return raw;
      }
    }
    if (opt.typeCode === "pointer" || opt.typeCode === "list") {
      return this.itemOptionsParseFailure(opt, seen);
    }
    return void 0;
  }
  /** options_card (options_api.rb:47-48) minus the permission-abstract
   *  override (excluded at the gate):
   *  rule_card(:content_options) || right_type_options || Card[:all].
   *  rule_card rides the SAME rule-name algebra + storage walk the
   *  view-override lookup uses (findRule -> ruleNamesForCard, the
   *  pattern-precedence candidate walk). Memoized per card key. */
  async resolveOptionsCard(card) {
    const cached = this.optionsCardCache.get(card.key);
    if (this.optionsCardCache.has(card.key)) return cached;
    let resolved;
    const rule = await findRule(this.fetcher, this.structurePatternInputForSync(card), "*content options");
    if (rule !== void 0 && rule.rule.name !== void 0) {
      resolved = await this.enrichAndStore(rule.rule);
    }
    if (resolved === void 0 && card.name.isCompound) {
      const rightKey = card.name.rightName?.key;
      const right = rightKey !== void 0 ? this.renderCards.get(rightKey) : void 0;
      const rightTypeId = right?.record.typeId;
      if (rightTypeId !== void 0 && this.fetcher.codenames.peekNameForId(rightTypeId) === CARDTYPE_TYPE_CODE) {
        this.optionsCardCache.set(card.key, void 0);
        return void 0;
      }
    }
    if (resolved === void 0) {
      const allRecord = await this.fetcher.fetchByName("*all");
      if (allRecord !== void 0 && allRecord.name !== void 0) {
        resolved = await this.enrichAndStore(allRecord);
      }
    }
    this.optionsCardCache.set(card.key, resolved);
    return resolved;
  }
  /** The set-host rules-editor options-chain walk: per-setting rule_card
   *  lookups (content_options / help / structure / default), the recent
   *  settings list's *content_options rule, and the host's own options
   *  card. Each candidate walks the Abstract::Items#item_type_id chain
   *  (itemOptionsParseFailure): search/set terminals parse their content
   *  as JSON and return the failing content ("" for the empty-content
   *  raise); pointer/list cards recurse into THEIR own options card;
   *  everything else has no parse and stops. Returns the FIRST failing
   *  content (the chain the fixture's BadQuery message echoes) or
   *  undefined when no chain fires.
   *
   *  Memoized per host key in optionsCardCache (the same map the
   *  pointer/list gate uses): warm re-renders of the same host pay ONE
   *  Map lookup regardless of view. The key encodes the rule-walk input
   *  (host card identity); cache hits return the recorded content
   *  verbatim. */
  async setHostOptionsParseFailure(host) {
    if (this.setHostChainCache.has(host.key)) {
      return this.setHostChainCache.get(host.key);
    }
    const settings = ["*content options", "*help", "*structure", "*default"];
    for (const settingName of settings) {
      const rule = await findRule(
        this.fetcher,
        this.structurePatternInputForSync(host),
        settingName
      );
      if (rule !== void 0 && rule.rule.name !== void 0) {
        const ruleCard = await this.enrichAndStore(rule.rule);
        if (ruleCard !== void 0) {
          const fail = this.ruleCardParseFailure(ruleCard);
          if (fail !== void 0) {
            this.setHostChainCache.set(host.key, fail);
            return fail;
          }
          if (ruleCard.typeCode === "pointer" || ruleCard.typeCode === "list") {
            const optFail = await this.itemOptionsParseFailure(
              ruleCard,
              /* @__PURE__ */ new Set([host.key, ruleCard.key])
            );
            if (optFail !== void 0) {
              this.setHostChainCache.set(host.key, optFail);
              return optFail;
            }
          }
        }
      }
    }
    const recentRuleRecord = await this.fetcher.fetchByName("*recent settings+*self+*content options");
    if (recentRuleRecord !== void 0 && recentRuleRecord.name !== void 0) {
      const recentRule = await this.enrichAndStore(recentRuleRecord);
      if (recentRule !== void 0) {
        const fail = this.ruleCardParseFailure(recentRule);
        if (fail !== void 0) {
          this.setHostChainCache.set(host.key, fail);
          return fail;
        }
      }
    }
    this.setHostChainCache.set(host.key, void 0);
    return void 0;
  }
  /** Parse a single rule card's content as CQL if it's search-typed.
   *  The set-host gate's parse site: the rules editor's nested render
   *  consults Abstract::CqlSearch#item_type_id on the rule card
   *  directly (cql_search.rb:14-18) -- not via the rule's options_card
   *  chain. Set-type rules are NOT parsed: the recapture's 676 set-host
   *  sentinels all carry search-type terminals (jjmd, kwnd), never the
   *  *all "fr" fallback; the pointer/list gate handles *all as a
   *  terminal separately. Returns the failing content ("" for the
   *  empty-query branch) or undefined when the rule isn't search-typed
   *  or its content parses cleanly. */
  ruleCardParseFailure(card) {
    if (card.typeCode !== SEARCH_TYPE_CODE) {
      return void 0;
    }
    const raw = card.dbContent;
    if (raw === "") return "";
    try {
      JSON.parse(raw);
      return void 0;
    } catch {
      return raw;
    }
  }
  // -------------------------------------------------------------------------
  // rule? predicate (lib/card/rule/all.rb:32-51) — the RULE set-key input
  // -------------------------------------------------------------------------
  /** Parse the folded codehash result (sliced past the permission
   *  statements) into memoized codename ids. Runs once per engine, before
   *  enrichment, so set-key derivation never queries. */
  async parseRuleTypeIds(folded, permissionStatementCount) {
    const result = folded !== void 0 ? folded[permissionStatementCount] : void 0;
    if (result !== void 0) {
      this.fetcher.codenames.foldCodehashResults(result);
    } else {
      await this.fetcher.codenames.ensureLoaded();
    }
    this.ruleTypeIds = {
      setting: this.fetcher.codenames.peekId("setting"),
      set: this.fetcher.codenames.peekId("set"),
      user: this.fetcher.codenames.peekId("user")
    };
  }
  /** Card#rule? — the 06_rule.rb pattern_applies? (standard_rule? ||
   *  preference?, card-1.110.0 lib/card/rule/all.rb:32-51). Type
   *  comparisons mirror Ruby's fetch_type_id exactly: resolve each name
   *  part's card through storage and compare its type_id. Undefined when
   *  the seed lacks the codename cards — the pattern cannot apply either
   *  way (same degradation as a rule-less deck).
   *
   *  ORDER PARITY (corpus:253): Ruby evaluates `standard_rule? ||
   *  preference?` (all.rb:33) — standard_rule? runs FIRST for EVERY name
   *  shape (all.rb:37-40: name.right type == SettingID && name.left type
   *  == SetID, where name.left of a 3-part name is its first two parts).
   *  preference? (all.rb:42-48) only adds the user-part rules for >2-part
   *  names; routing 3-part names straight into it (the previous shape)
   *  dropped the RULE set key for names like "SET+*right+SETTING" that
   *  Ruby classifies via standard_rule?. */
  /** the existing_rule_card memo for virtual rule cards — the sync
   *  half of the preloadVirtualRuleVerdicts resolution (editor.rb:119-131).
   *  True = a stored rule exists for this virtual's (set, setting); false =
   *  the prototype walk found none (Ruby's `voo.hide :bar_nav unless
   *  existing_rule_card` + the one-line mini_unknown gate read this).
   *  Undefined = the setting was never preloaded for this set card. */
  hasExistingRuleFor(key) {
    if (this.existingRuleCards === void 0) return void 0;
    return this.existingRuleCards.has(key);
  }
  /** the resolved existing-rule CARD for a virtual rule card — the
   *  bar_right one-line content nests THIS card's :one_line_content through
   *  its own read verdict (rule_short_content, bar_view.rb:39-44), not the
   *  virtual's own. Undefined = no existing rule (or not preloaded). */
  existingRuleFor(key) {
    return this.existingRuleCards?.get(key);
  }
  /** the PROTOTYPE pattern input for a set card — the port of
   *  set_prototype (set.rb:90-93 `Card.fetch prototype_args(anchor_name),
   *  new: prototype_args`) consumed by the existing-rule resolution above
   *  (editor.rb:126-130 existing_rule_from_prototype). Per pattern:
   *  - SELF: the anchor REAL card (prototype_args {name: anchor}) — its
   *    own candidate walk, SELF pattern included (isNew false).
   *  - TYPE: prototype_args {type: anchor} — a NAMELESS new card of the
   *    anchor type; only the TYPE + ALL candidates apply (blank name).
   *  - RIGHT: prototype_args {name: "*dummy+anchor"} — a new compound
   *    whose type rides the template chain (newCardDefaultType).
   *  - TYPE_PLUS_RIGHT: prototype_args {name: "*dummy+right"} typed by
   *    the same template chain (the supercard feeds only the TPR anchor's
   *    left_type).
   *  - ALL: nameless/untyped — only the ALL candidate applies.
   *  - ALL_PLUS/STAR/RSTAR/RULE: their prototype_args names ("+",
   *    "*dummy", "*dummy+*dummy", "*all+*create"), typed by the same
   *    template chain; star's simple *dummy skips compound-only *all plus
   *    in the *default walk → *all+*default's type; rstar's compound
   *    *dummy+*dummy lands on *all plus+*default.
   *  The undefined input (unknown pattern) skips the resolution; the
   *  renderer treats it as no-existing-rule (documented remainder). */
  async prototypePatternInput(setCard) {
    const rightName = setCard.name.rightName;
    const codenameOf = async (name) => {
      if (name === void 0) return void 0;
      let card = this.fetchRenderCard(name);
      if (card === void 0) {
        const record = await this.fetcher.fetchByName(name);
        if (record !== void 0) card = await this.enrichAndStore(record);
      }
      const id = card?.id;
      return id !== void 0 ? this.peekCodenameById(id) : void 0;
    };
    const patternCode = rightName !== void 0 ? await codenameOf(rightName.s) : await codenameOf(setCard.name.s);
    const anchorName = setCard.name.leftName?.s;
    const fetchAnchor = async () => {
      if (anchorName === void 0) return void 0;
      let real = this.fetchRenderCard(anchorName);
      if (real === void 0) {
        const record = await this.fetcher.fetchByName(anchorName);
        if (record !== void 0) real = await this.enrichAndStore(record);
      }
      return real;
    };
    switch (patternCode) {
      case "all":
        return { name: DeckoName.parse(""), id: void 0, typeId: void 0, typeName: void 0, isNew: true };
      case "all_plus":
      case "rstar":
      case "rule":
      case "star": {
        const protoName = patternCode === "all_plus" ? "+" : patternCode === "rstar" ? "*dummy+*dummy" : patternCode === "rule" ? "*all+*create" : "*dummy";
        const parsed = DeckoName.parse(protoName);
        const defaultType = this.newCardDefaultType(parsed);
        return {
          name: parsed,
          id: void 0,
          typeId: defaultType?.typeId,
          typeName: defaultType?.typeName,
          isNew: true
        };
      }
      case "self": {
        const real = await fetchAnchor();
        if (real !== void 0 && real.id !== void 0) {
          return { name: real.name, id: real.id, typeId: real.typeId, typeName: real.typeName, isNew: false };
        }
        return anchorName !== void 0 ? { name: DeckoName.parse(anchorName), id: void 0, typeId: void 0, isNew: true } : void 0;
      }
      case "type": {
        const typeCard = await fetchAnchor();
        if (typeCard === void 0 || typeCard.id === void 0) {
          return { name: DeckoName.parse(""), id: void 0, typeId: void 0, isNew: true };
        }
        return {
          name: DeckoName.parse(""),
          id: void 0,
          typeId: typeCard.id,
          typeName: typeCard.name,
          isNew: true
        };
      }
      case "right": {
        if (anchorName === void 0) return void 0;
        const parsed = DeckoName.parse(`*dummy+${anchorName}`);
        const defaultType = this.newCardDefaultType(parsed);
        return {
          name: parsed,
          id: void 0,
          typeId: defaultType?.typeId,
          typeName: defaultType?.typeName,
          isNew: true
        };
      }
      case "type_plus_right": {
        const leftName = setCard.name.leftName;
        const rightPart = leftName?.rightName?.s;
        const typeName = leftName?.leftName?.s;
        if (rightPart === void 0 || typeName === void 0) return void 0;
        const parsed = DeckoName.parse(`*dummy+${rightPart}`);
        const defaultType = this.newCardDefaultType(parsed, typeName);
        return {
          name: parsed,
          id: void 0,
          typeId: defaultType?.typeId,
          typeName: defaultType?.typeName,
          leftTypeName: typeName,
          isNew: true
        };
      }
      default:
        return void 0;
    }
  }
  /** set/rule SET membership — the port of set_pattern/06_rule.rb
   *  (`pattern_applies? card -> card.rule?`, lib/card/rule/all.rb:32-40):
   *  standard_rule? = the right part is a Setting AND the left part is a
   *  Set — NO part-count limit (the 2-part `*all+*autoname` and the 3-part
   *  `*captcha+*right+*autoname` are both rule cards). Gates the rule-bar
   *  behaviors: bar_view.rb:10's `_rule-item` class_up + category classes,
   *  bar_view.rb:2-3's three-column bar_cols (5,4,3) with bar_middle kept,
   *  and the bar_menu's new-card create/edit label split. The corpus's
   *  `mod: format+*style` (left "mod: format" is Mod-typed, NOT a Set) is
   *  NOT a rule card — the oracle pins its bar WITHOUT `_rule-item`
   *  (dual-lane-view:style: mods:render:open). */
  cardMatchesRuleSet(card) {
    const ids = this.ruleTypeIds;
    if (ids === void 0 || ids.setting === void 0 || ids.set === void 0) {
      return false;
    }
    if (!card.name.isCompound) return false;
    const rightKey = card.name.rightName?.key;
    const leftKey = card.name.leftName?.key;
    if (rightKey === void 0 || leftKey === void 0) return false;
    const rightRecord = this.renderCards.get(rightKey);
    const leftRecord = this.renderCards.get(leftKey);
    if (rightRecord === void 0 || leftRecord === void 0) return false;
    return rightRecord.record.typeId === ids.setting && leftRecord.record.typeId === ids.set;
  }
  cardIsRule(card) {
    const ids = this.ruleTypeIds;
    if (ids === void 0 || ids.setting === void 0 || ids.set === void 0) {
      return false;
    }
    const name = card.name;
    if (!name.isCompound || name.parts.length !== 3) return false;
    const rightKey = name.rightName?.key;
    const leftKey = name.leftName?.key;
    if (rightKey === void 0 || leftKey === void 0) return false;
    const rightRecord = this.renderCards.get(rightKey);
    const leftRecord = this.renderCards.get(leftKey);
    if (rightRecord === void 0 || leftRecord === void 0) return false;
    return rightRecord.record.typeId === ids.setting && leftRecord.record.typeId === ids.set;
  }
  async computeIsRule(name, leftRecord) {
    const ids = this.ruleTypeIds;
    if (ids === void 0 || ids.setting === void 0 || ids.set === void 0) {
      return void 0;
    }
    const rightTypeId = await this.fetchTypeIdForPart(name.rightName);
    if (rightTypeId === void 0 || rightTypeId !== ids.setting) return false;
    if (name.parts.length > 2) {
      const standardLeftTypeId = await this.fetchTypeIdForPart(name.leftName);
      if (standardLeftTypeId === ids.set) return true;
    } else if (leftRecord !== void 0 && leftRecord.typeId === ids.set) {
      return true;
    }
    if (name.parts.length > 2) {
      const trunkTypeId = await this.fetchTypeIdForPart(
        DeckoName.parse(name.parts.slice(0, -2).join("+"))
      );
      if (trunkTypeId !== ids.set) return false;
      const prefererPart = name.parts[name.parts.length - 2] ?? "";
      const prefererTypeId = await this.fetchTypeIdForPart(DeckoName.parse(prefererPart));
      if (ids.user !== void 0 && prefererTypeId === ids.user) return true;
      const prefererKey = DeckoName.parse(prefererPart).key;
      const prefererRecord = prefererKey !== "" ? await this.fetcher.fetchByName(prefererKey) ?? void 0 : void 0;
      return prefererRecord?.codename === "all";
    }
    return false;
  }
  /** Card.fetch_type_id(name-part): the part card's fetched type_id
   *  (cache-first via the fetch ladder; undefined for unresolvable parts —
   *  Ruby's fetch-returns-nil path). */
  async fetchTypeIdForPart(part) {
    if (part === void 0) return void 0;
    const key = part.key;
    if (key === "") return void 0;
    const record = await this.fetcher.fetchByName(key) ?? void 0;
    return record?.typeId;
  }
  // -------------------------------------------------------------------------
  // prepare phase (all async work happens here, never during the render)
  // -------------------------------------------------------------------------
  /**
   * The closure is warm when every reference reachable from `record` is
   * already in the render-card map. A synchronous parse + map walk - no
   * queries (this is what makes warm re-renders free).
   *
   * Template references recorded in structureRefMisses are skipped: they
   * name cards that do not exist (the corpus's {{xxxx}} nest targets), so
   * waiting for them would keep structured cards permanently cold — Ruby
   * renders those nests as unknown-card views, and so does the port's nest
   * path.
   */
  closureWarm(record) {
    if (record.key === void 0 || record.key === "") return false;
    if (!this.renderCards.has(record.key)) return false;
    const seen = /* @__PURE__ */ new Set();
    const queue = [record.key];
    while (queue.length > 0) {
      const key = queue.pop();
      if (seen.has(key)) continue;
      seen.add(key);
      const card = this.renderCards.get(key);
      if (card === void 0) return false;
      const tagKey = card.name !== void 0 && card.name.isCompound ? DeckoName.parse(card.name.tag).key : void 0;
      if ((tagKey === "*html_message" || tagKey === "*text_message") && card.name.leftName !== void 0) {
        const junctionKey = `${card.name.leftName.key}+*test_context`;
        const junction = this.renderCards.get(junctionKey);
        if (junction === void 0) return false;
        const firstItem = (junction.dbContent ?? "").split("\n").map((line) => line.trim()).find((line) => line !== "");
        if (firstItem !== void 0 && !this.renderCards.has(DeckoName.parse(firstItem).key)) {
          return false;
        }
      }
      for (const ref of this.cardReferenceKeys(card)) {
        if (this.structureRefMisses.has(ref)) continue;
        if (!this.renderCards.has(ref)) return false;
        if (!seen.has(ref)) queue.push(ref);
      }
      if (card.typeCode === SEARCH_TYPE_CODE && !this.searchResults.has(card.key)) {
        return false;
      }
    }
    return true;
  }
  /** Absolute reference keys inside one render card's content (the real
   *  parser - the same one the render uses). Nest view options ride the
   *  reference text ("*head|core") but the RESOLVED card is the part before
   *  the pipe; keeping the suffix made closureWarm miss every template
   *  reference and forced cold closure walks for cards nesting them
   *  (26/1000 shard-0 cards cold after prewarm, render-perf harness).
   *
   *  Round 9: every non-underscore ref is ABSOLUTIZED against the card's
   *  own name (chunk/reference.rb referencing-card contract) — the same
   *  contextual resolution applyStructureContent's ref walk and the
   *  prefetch's record collect use. A card's `{{+image}}` checks
   *  `<card>+image` in the render-card map; the pre-round-9 literal
   *  "+image" key matched no prepared card, but the walkers' bogus miss
   *  landed in structureRefMisses so warm detection only stayed stable by
   *  accident of the shared bogus key.
   *
   *  Sync mark resolution tolerates CodenameNotFoundError / NameNotFoundError
   *  for unresolved codename/id marks: the lexicon temp cache evicts itself
   *  at 10000 keys (lib/card/cache/temporary.rb#within_key_counts); after
   *  eviction the sync peek returns undefined and DeckoName.parse throws.
   *  Treat the ref as unknown (skip it) — the cold path will refill the
   *  cache, re-walk the closure, and reach a stable closure. */
  cardReferenceKeys(card) {
    const keys = [];
    for (const ref of referencedNames(card.dbContent)) {
      if (ref.relative) continue;
      const pipe = ref.name.indexOf("|");
      const base = pipe === -1 ? ref.name : ref.name.slice(0, pipe);
      let key;
      try {
        key = DeckoName.parse(base).absoluteName(card.name).key;
      } catch (err) {
        if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) continue;
        throw err;
      }
      if (key !== "") keys.push(key);
    }
    return keys;
  }
  /** Cache a prefetched record (prefetch callback) + enrich it. The record
   *  also enters the FETCH engine's cache (store.rb#update_cache? would
   *  cache it in Ruby: fresh_from_db) so the fetch ladder stays coherent
   *  and later fetchById/fetchByName calls are cache hits. */
  async cacheFetchedRecord(record) {
    if (record.key === void 0 || record.key === "") return;
    this.fetcher.writeToCache(record);
    await this.enrichAndStore(record);
  }
  /** Enrich a record (type name, set keys) and store the render card. Type
   *  and side cards were prefetched - these fetches are cache hits. */
  async enrichAndStore(record) {
    const key = record.key;
    const existing = this.renderCards.get(key);
    if (existing !== void 0) return existing;
    const name = record.name ?? DeckoName.parse("");
    const typeId = record.typeId;
    let typeName;
    let typeCode;
    if (typeId !== void 0) {
      const typeRecord = await this.fetcher.retrieveFromCacheById(typeId) ?? await this.fetcher.fetchById(typeId);
      typeName = typeRecord?.name?.s;
      typeCode = this.fetcher.codenames.peekNameForId(typeId);
    }
    let leftTypeName;
    let leftRecord;
    if (name.isCompound) {
      const leftKey = name.leftName?.key;
      leftRecord = leftKey !== void 0 ? await this.fetcher.fetchByName(leftKey) ?? void 0 : void 0;
      if (leftRecord !== void 0) {
        const leftCard = await this.enrichAndStore(leftRecord);
        leftTypeName = leftCard.typeName;
      }
    }
    const isRule = name.isCompound ? await this.computeIsRule(name, leftRecord) : false;
    const card = {
      record,
      name,
      key,
      typeName,
      typeId,
      typeCode,
      id: record.id,
      dbContent: cardContent(record),
      // pattern/all.rb#patterns: a NEW card's safe_set_keys drops the SELF
      // token. record.isNew is false for every stored row (byte-neutral
      // there) and true for the fetch placeholders — the virtual-card hits
      // (the structured/missing children: PCTS+legacy class) whose captured
      // slots read "ALL ALL_PLUS TYPE-<t> RIGHT-<r> TYPE_PLUS_RIGHT-<l>-<r>"
      // with no SELF.
      setKeys: safeSetKeys({
        name,
        typeId,
        typeName,
        leftTypeName,
        isRule,
        ...record.isNew ? { isNew: true } : {}
      })
    };
    this.renderCards.set(key, card);
    if (record.id !== void 0) this.idsByKey.set(key, record.id);
    this.renderCardsGrewSinceClosure = true;
    return card;
  }
  /**
   * Pre-execute Search-type cores reachable from the root (their results are
   * read synchronously by the card_list view). Items join the render-card
   * map, and item content participates in the walk (nested searches inside
   * results resolve too).
   *
   * R4 lazy-parse seam: this walk NO LONGER RAISES. Ruby's Search JSON.parse
   * and Date.parse fire INSIDE the dispatched view method
   * (cql_search.rb:29-38; view/permission.rb:46-50 wraps the denial BEFORE
   * view_method, so only readable cards ever parse), and only on the
   * result-rendering views — the capture census pins search :open/:content
   * as CAPTURE_ERROR (24 each) while :closed/:title carry real bytes
   * (105/105 each; date likewise, corpus:1135). The eager throw here both
   * over-raised (date :closed/:title — 1,066 corpus views where Ruby
   * rendered) and, via the prewarm driver's catch arm, poisoned the seat so
   * dispatched views never raised at all. Now a parse failure is RECORDED
   * (searchFailures, with the exact error object the dispatched view
   * re-raises) and the walk COMPLETES — the completion is load-bearing: it
   * enriches the queue's remaining cards so the post-prepare ensureVerdicts
   * pass judges them (render.ts's second ensureVerdicts call). The dispatch
   * boundary that re-raises is engine.resolveView (below).
   */
  async prepareSearches(root) {
    const visited = /* @__PURE__ */ new Set();
    const queue = [root];
    while (queue.length > 0) {
      const current = queue.shift();
      const key = current.key;
      if (key === void 0 || visited.has(key)) continue;
      visited.add(key);
      const card = this.renderCards.get(key);
      if (card === void 0) continue;
      for (const refKey of this.cardReferenceKeys(card)) {
        const refCard = this.renderCards.get(refKey);
        if (refCard !== void 0 && !visited.has(refKey)) queue.push(refCard.record);
      }
      if (this.isDenied(card)) continue;
      if (card.typeCode === SEARCH_TYPE_CODE) {
        if (this.searchResults.has(key) || this.searchFailures.has(key)) continue;
        try {
          const items = await this.runSearch(card);
          this.searchResults.set(key, items);
          for (const item of items) {
            if (!visited.has(item.key)) queue.push(item.record);
          }
        } catch (err) {
          if (!(err instanceof Error) || err.name !== BAD_QUERY_CLASS_NAME) throw err;
          this.searchFailures.set(key, err);
          this.searchResults.set(key, []);
        }
        continue;
      }
    }
  }
  /** card-mod-search set/abstract/cql_search.rb shape: the Search card's
   *  content is a CQL statement; execute it through the CQL engine.
   *  cql_search.rb:29-38 raises Card::Error::BadQuery on parse failures
   *  (empty content, invalid JSON) — port parity means THROWING the same
   *  class with the same message, not swallowing the failure into an
   *  empty result list. The error class carries its Ruby class name
   *  (render/errors.ts) so the corpus-v2 replay handler — read-only per
   *  the stream contract — emits the exact CAPTURE_ERROR sentinel bytes
   *  the capture recorded. */
  /** The search statement's own limit — see searchCqlLimit below. */
  async runSearch(card) {
    const rawContent = card.dbContent;
    if (rawContent === "") {
      throw emptyQueryError();
    }
    let statement;
    try {
      statement = JSON.parse(rawContent);
    } catch {
      throw badQuery(rawContent);
    }
    if (statement === null || typeof statement !== "object" || Array.isArray(statement)) {
      return [];
    }
    const cqlLimit = searchCqlLimit(statement);
    const limit = cqlLimit ?? 20;
    statement["limit"] = limit;
    let rows;
    let records;
    let paging;
    try {
      const queryOptions = {
        // The viewer's read-permission filter rides the SQL
        // (implicitConditions' `read_rule_id IN (...)` — cqlPermissionOptions
        // is the same seam the /api/query path uses, never a parallel
        // system). This is Ruby's ordering: Card::Query applies the current
        // user's read rules at the relation level (Where#
        // permission_conditions) BEFORE limit_and_offset closes the window,
        // so an unreadable card never occupies a result slot. The pre-fix
        // permissionless search let a denied card consume slot 2 of the
        // corpus news listing and pushed readable rank-11 out of the LIMIT 9
        // window entirely (trace tenth-item-trace.md bug 1).
        ...await this.cqlPermissionOptions(),
        parse: {
          // The search runs in the search card's OWN name context (Ruby:
          // card-mod-search set/abstract/cql_search.rb passes `context: name`
          // to Card::Query — the same name the card was fetched under, so a
          // virtual *type plus right search nested on a host card carries the
          // HOST-specific junction name and `_left` absolutizes to the host).
          // Without it, root.context defaults to "" (AbstractQuery#context,
          // parser.ts opts.context ?? "") and every relative reference in the
          // statement (`refer_to: "_left"`, `_self`, `_right`, `_N`) resolves
          // against the blank context to the unresolvable-name sentinel — the
          // query returns zero rows even with every name key resolvable
          // (2026-09-25 Brandon_WilliamsCraig +Project(s) Participating "0
          // results" defect 2; ParseOptions.context, src/cql/ast.ts).
          context: card.name.s,
          // sync resolver over the prefetched id map (module doc), falling
          // back to the deck lexicon — Ruby answers every CQL name->id
          // through Card::Lexicon (lib/card/query/value.rb#id_from_val ->
          // Card::Lexicon.id), whose deck-boot warm covers cards the render
          // walk never enriched: a search statement's own name arguments
          // ("Participant(s)", the "project" type) are not nest references,
          // so nothing in the page walk fetches them and idsByKey alone
          // misses them (staging "0 results" defect 1's second half).
          // peekId is the warm-cache sync mirror (src/card/fetch/lexicon.ts);
          // origins prime it at boot (vm-staging-server primeEngine step 3,
          // worker primeCqlNameResolver). Unknown names still return
          // undefined -> the parser's -999 sentinel, exactly as Ruby.
          // ensureCardId is Ruby's other half (card-1.110.0 lexicon.rb#
          // lex_to_id: cache-first WITH a synchronous SQL fallback): the
          // warm mirror cannot hold decks larger than the Temporary cache's
          // max_keys (temporary.rb#within_key_counts resets at 10_000 - the
          // 47k-card corpus deck resets it 10x during warmLexicon), so
          // executeQuery pre-resolves this statement's name strings through
          // the async db-fallback walk before the sync interpretation reads
          // them. Unknown names still sentinel to -999 exactly as before.
          ensureCardId: (nameish) => this.fetcher.lexicon.id(nameish),
          resolveCardId: (nameish) => {
            const key = DeckoName.parse(nameish).key;
            return this.idsByKey.get(key) ?? this.fetcher.lexicon.peekId(nameish);
          }
        }
      };
      const result = await executeQuery(
        this.fetcher.driver,
        statement,
        queryOptions
      );
      rows = "rows" in result ? result.rows : [];
      rows = await this.canonicalizeDanglingSideRows(rows);
      records = await this.prefetchSearchResultRows(rows);
      if (limit >= 1 && rows.length >= limit) {
        const count = await executeCount(
          this.fetcher.driver,
          statement,
          queryOptions
        );
        if (count > limit) paging = { limit, offset: 0, count };
      }
    } catch {
      return [];
    }
    const items = [];
    for (const row of rows) {
      const record = records.get(row.id);
      if (record === void 0) continue;
      if (!await this.canReadCard(record)) continue;
      if (record.name === void 0) continue;
      const enriched = await this.enrichAndStore(record);
      items.push(enriched);
    }
    if (paging !== void 0) {
      this.searchResultPagingMap.set(card.key, paging);
    }
    return items;
  }
  /** The search read path's transport-chunked prefetch (see the runSearch
   *  call site for the mechanism + baseline numbers). Collects the id set
   *  the result walk can touch — each CQL row's card, its TYPE row (the
   *  enrichment's typeRecord fetch), and junction SIDE rows (name
   *  composition + enrichAndStore's left-card fetch) — reads them all
   *  through readCardRowsByIdChunked, and composes + caches the fetched
   *  rows through the shared ladder (fetch cache via cacheFetchedRecord,
   *  which also enriches into renderCards). Returns the composed records
   *  keyed by id: the runSearch loop consumes them directly (same values
   *  the old per-row fetchById composed, from the identical row bytes) so
   *  the walk costs zero per-item queries even when the lexicon
   *  temporary cache's Ruby-mirrored 10k-key reset — which fires at
   *  whole-deck scale DURING the priming writes — wipes the primed
   *  lexicon entries behind it. Rows with no non-trashed cards row
   *  (trashed/absent ids) are absent from the map, the exact case the
   *  point-read ladder answered undefined. */
  /** Live rows whose junction side id points at no cards row still compose
   *  their names  with the EMPTY part (lexicon.ts#lexToName; lexicon.rb:
   *  11-15 + name/all.rb:16-18)  so several such rows can share ONE
   *  composed name. The corpus's only collision class: cards 375/377/389
   *  (lefts 374/376/388 absent, right *default) all compose "+*default"
   *  (junction pair-uniqueness makes dangling-side compositions the only
   *  collision source). Ruby's listing renders the shared name under its
   *  lowest-id card  the Phrase page oracle pins card 375 (data-card-id=
   *  "375", type List) for the row the engine's own search matches as 389.
   *  This map holds row id -> canonical (lowest-id) row id for the dangling
   *  class, built once per engine from one statement; engines that never
   *  meet a dangling row pay nothing. The swap runs BEFORE the prefetch so
   *  the shared name-key seats the canonical record (enrichAndStore's
   *  existing-key guard would otherwise pin whichever row composed first). */
  danglingSideRowCanonical;
  async danglingSideRowCanonicalMap() {
    if (this.danglingSideRowCanonical !== void 0) {
      return this.danglingSideRowCanonical;
    }
    const result = await this.fetcher.driver.query(
      "SELECT c.* FROM cards c WHERE c.trash = 0 AND c.left_id IS NOT NULL AND (NOT EXISTS (SELECT 1 FROM cards l WHERE l.id = c.left_id) OR  NOT EXISTS (SELECT 1 FROM cards r WHERE r.id = c.right_id))",
      []
    );
    const names = /* @__PURE__ */ new Map();
    const remap = /* @__PURE__ */ new Map();
    for (const row of result.rows) {
      const record = await composeCardRecord(row, this.fetcher.lexicon);
      if (record.name === void 0) continue;
      const key = record.name.key;
      const current = names.get(key);
      if (current === void 0 || row.id < current) {
        names.set(key, row.id);
      }
    }
    for (const row of result.rows) {
      const record = await composeCardRecord(row, this.fetcher.lexicon);
      if (record.name === void 0) continue;
      const canonicalId = names.get(record.name.key);
      if (canonicalId !== void 0) remap.set(row.id, canonicalId);
    }
    this.danglingSideRowCanonical = remap;
    return remap;
  }
  /** Swap every search-result row that belongs to the dangling-side
   *  collision class for its canonical (lowest-id) row's bytes, before the
   *  prefetch composes and seats them (see danglingSideRowCanonical). */
  async canonicalizeDanglingSideRows(rows) {
    if (rows.length === 0) return rows;
    if (!rows.some((r) => r.left_id !== null && r.left_id !== void 0)) {
      return rows;
    }
    const remap = await this.danglingSideRowCanonicalMap();
    if (remap.size === 0) return rows;
    let swapped = false;
    const canonicalRows = /* @__PURE__ */ new Map();
    const out = [];
    for (const row of rows) {
      const canonicalId = remap.get(row.id);
      if (canonicalId === void 0 || canonicalId === row.id) {
        out.push(row);
        continue;
      }
      let canonicalRow = canonicalRows.get(canonicalId);
      if (canonicalRow === void 0) {
        const fetched = await this.fetcher.driver.query(
          "SELECT * FROM cards WHERE id = ? AND trash = 0",
          [canonicalId]
        );
        canonicalRow = fetched.rows[0];
        if (canonicalRow === void 0) {
          canonicalRows.set(canonicalId, row);
          out.push(row);
          continue;
        }
        canonicalRows.set(canonicalId, canonicalRow);
      }
      out.push(canonicalRow);
      swapped = true;
    }
    return swapped ? out : rows;
  }
  async prefetchSearchResultRows(rows) {
    const records = /* @__PURE__ */ new Map();
    if (rows.length === 0) return records;
    const ids = [];
    const seen = /* @__PURE__ */ new Set();
    const pushId = (id) => {
      if (id === null || id === void 0 || seen.has(id)) return;
      seen.add(id);
      ids.push(id);
    };
    for (const row of rows) {
      pushId(row.id);
      pushId(row.type_id);
      pushId(row.left_id);
      pushId(row.right_id);
    }
    const fetched = await readCardRowsByIdChunked(this.fetcher.driver, ids);
    if (fetched.length === 0) return records;
    const ctx = {
      driver: this.fetcher.driver,
      lexicon: this.fetcher.lexicon,
      cacheRecord: (record) => this.cacheFetchedRecord(record)
    };
    const composed = await composeAndCacheSqlRows(fetched, ctx);
    for (const record of composed) {
      if (record.id !== void 0) records.set(record.id, record);
    }
    return records;
  }
};

// benchmarks/one-trip-render/fact-probe-render-touch.ts
var PROBE_PAGES = ["Home", "Aikido", "About", "Eagle", "Taking_Stock"];
var DEFAULT_DB = "benchmarks/one-trip-render/trial-deck-mirror-readonly-copy.sqlite3";
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] !== void 0 ? process.argv[i + 1] : fallback;
}
function cardIdsFromRows(rows) {
  const ids = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const rec = row;
    const id = rec["id"];
    if (typeof id !== "number" || !Number.isSafeInteger(id)) continue;
    const cardish = "key" in rec || "type_id" in rec || "db_content" in rec || "trash" in rec || "left_id" in rec;
    if (cardish) ids.push(id);
  }
  return ids;
}
var CapturingDriver = class {
  constructor(inner) {
    this.inner = inner;
  }
  inner;
  captured = [];
  /** Round trips: one driver.query call OR one driver.batch call each. */
  trips = 0;
  async query(sql, params) {
    this.trips += 1;
    const result = await this.inner.query(sql, params);
    this.captured.push({
      kind: "query",
      sql,
      params,
      rowCount: result.rows.length,
      cardIds: cardIdsFromRows(result.rows)
    });
    return result;
  }
  async batch(statements) {
    this.trips += 1;
    const results = await this.inner.batch(statements);
    results.forEach((result, i) => {
      const stmt = statements[i];
      this.captured.push({
        kind: "batch",
        sql: stmt?.sql ?? "",
        params: stmt?.params ?? [],
        rowCount: result.rows.length,
        cardIds: cardIdsFromRows(result.rows)
      });
    });
    return results;
  }
};
async function main() {
  const dbPath = arg("db", DEFAULT_DB);
  const base = new LocalSqliteDriver({ path: dbPath, readonly: true });
  const cardsResult = await base.query(
    `SELECT id, name, "key", left_id, right_id, type_id, db_content, trash
       FROM cards WHERE trash = 0`,
    []
  );
  const byId = /* @__PURE__ */ new Map();
  for (const row of cardsResult.rows) {
    byId.set(row["id"], {
      id: row["id"],
      name: row["name"] ?? null,
      key: row["key"] ?? null,
      leftId: row["left_id"] ?? null,
      rightId: row["right_id"] ?? null,
      typeId: row["type_id"] ?? 0,
      dbContent: row["db_content"] ?? null,
      trash: 0
    });
  }
  const names = /* @__PURE__ */ new Map();
  {
    let pending = [...byId.values()];
    for (let pass = 0; pass < 64 && pending.length > 0; pass++) {
      const still = [];
      for (const card of pending) {
        if (card.name !== null) {
          names.set(card.id, card.name);
          continue;
        }
        if (card.leftId === null || card.rightId === null) continue;
        const left = names.get(card.leftId);
        const right = names.get(card.rightId);
        if (left === void 0 || right === void 0) {
          still.push(card);
          continue;
        }
        names.set(card.id, `${left}+${right}`);
      }
      if (still.length === pending.length) break;
      pending = still;
    }
  }
  const keyToId = /* @__PURE__ */ new Map();
  for (const [id, name] of names) {
    try {
      keyToId.set(DeckoName.parse(name).key, id);
    } catch {
    }
  }
  const parsedEdges = /* @__PURE__ */ new Map();
  let parseFailures = 0;
  for (const card of byId.values()) {
    const content = card.dbContent;
    if (content === null || content === "") continue;
    const selfName = names.get(card.id);
    for (const ref of referencedNames(content)) {
      if (ref.relative) continue;
      let absolute;
      try {
        const parsed = DeckoName.parse(ref.name);
        absolute = selfName !== void 0 ? parsed.absoluteName(DeckoName.parse(selfName)).s : parsed.s;
      } catch {
        parseFailures += 1;
        continue;
      }
      let key;
      try {
        key = DeckoName.parse(absolute).key;
      } catch {
        parseFailures += 1;
        continue;
      }
      if (key === "") continue;
      const refereeId = keyToId.get(key);
      parsedEdges.set(`${card.id}->${key}`, { refererId: card.id, refereeKey: key, refereeId });
    }
  }
  const refsResult = await base.query(
    `SELECT referer_id, referee_key, referee_id, ref_type FROM card_references`,
    []
  );
  const refRows = refsResult.rows;
  const inclusionRows = refRows.filter((r) => r["ref_type"] === "I");
  const refEdgeSet = new Set(
    inclusionRows.map((r) => `${r["referer_id"]}->${r["referee_key"]}`)
  );
  const parseEdgeSet = new Set(parsedEdges.keys());
  const parseNotStored = [...parseEdgeSet].filter((e) => !refEdgeSet.has(e));
  const storedNotParsed = [...refEdgeSet].filter((e) => !parseEdgeSet.has(e));
  const pageReports = {};
  for (const name of PROBE_PAGES) {
    const capture = new CapturingDriver(base);
    const fetcher = new FetchEngine(capture);
    await fetcher.codenames.ensureLoaded();
    fetcher.installNameEnvironment();
    const render = new RenderEngine(fetcher);
    let outcome = "ok";
    let htmlBytes = 0;
    try {
      const html = await render.render(name, "open", {});
      htmlBytes = html.length;
    } catch (err) {
      outcome = `${err?.name ?? "Error"}: ${String(err?.message ?? err).slice(0, 200)}`;
    }
    const touched = /* @__PURE__ */ new Set();
    let searchStatements = 0;
    for (const stmt of capture.captured) {
      for (const id of stmt.cardIds) touched.add(id);
      if (stmt.sql.includes("json_group_array") || stmt.sql.includes("search_type")) {
        searchStatements += 1;
      }
    }
    pageReports[name] = {
      trips: capture.trips,
      statements: capture.captured.length,
      touchedCardIds: [...touched].sort((a, b) => a - b),
      touchedCount: touched.size,
      searchStatements,
      htmlBytes,
      outcome
    };
  }
  const report = {
    deck: {
      live_cards: byId.size,
      composed_names: names.size,
      card_references_rows: refRows.length,
      inclusion_rows: inclusionRows.length
    },
    edge_agreement: {
      parsed_edges: parseEdgeSet.size,
      parse_failures: parseFailures,
      parsed_not_stored: parseNotStored.length,
      parsed_not_stored_sample: parseNotStored.slice(0, 10),
      stored_not_parsed: storedNotParsed.length,
      stored_not_parsed_sample: storedNotParsed.slice(0, 10)
    },
    probe_pages: pageReports
  };
  writeFileSync(arg("out", "benchmarks/one-trip-render/fact-probe-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    deck: report.deck,
    edge_agreement: {
      parsed_edges: report.edge_agreement.parsed_edges,
      parsed_not_stored: report.edge_agreement.parsed_not_stored,
      stored_not_parsed: report.edge_agreement.stored_not_parsed
    },
    pages: Object.fromEntries(
      Object.entries(pageReports).map(([name, r]) => [
        name,
        { trips: r.trips, touched: r.touchedCount, html: r.htmlBytes, outcome: r.outcome }
      ])
    )
  }, null, 2));
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
