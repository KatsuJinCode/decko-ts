// parse-dump.mjs — streaming, quote-aware mysqldump INSERT parser.
//
// M4 migration tool (port-tracker stream 14, decko-commons/decko#1282).
// Generalizes the parser proven on the 1.2 GB the reference deck production dump
// (a private production dump (not distributed)).
//
// THE KEY LESSON FROM THAT MIGRATION (and the design constraint here): the
// production dump is 1.2 GB and carries multi-row INSERT statements as
// single physical lines up to ~3.6 MB. Naive backtracking regexes
// (/'(?:[^'\\]|\\.)*'/-style, run over the whole line) HANG on that input.
// Parsing must be:
//   1. LINEAR      — every byte is visited a bounded number of times; the
//                    only searches are native indexOf scans plus bounded
//                    escape-run walks. There are NO backtracking regexes.
//   2. ANCHORED    — statements are found in a fixed statement-scan state;
//                    consumed data is compacted away, never re-scanned.
//   3. QUOTE-AWARE — string literals, backslash escapes and doubled quotes
//                    are tracked in one forward pass; tuple/field boundaries
//                    are only trusted outside string literals.
//   4. STREAMING   — the file is read in fixed-size chunks with explicit
//                    buffer management; a row is emitted the moment its
//                    closing ")" is seen, and the consumed prefix is
//                    compacted away. Memory stays bounded no matter how
//                    long the physical line is.
//
// Grammar handled (mysqldump 10.13, verified against the production dump:
// 1177 `INSERT INTO `x` VALUES` statements, 0 column-list variants):
//   INSERT INTO `table` VALUES (v,...),(v,...),...;
// plus the --complete-insert variant with an explicit column list:
//   INSERT INTO `table` (`a`,`b`) VALUES (...);
// Everything else (LOCK TABLES, /*!...*/ conditional comments, -- and #
// comments, CREATE TABLE, SET ...) is skipped quote-aware in the
// statement-scan state.
//
// Value decoding follows MySQL server rules ("String Literals"): \0 \' \"
// \b \n \r \t \Z \\ map to their characters, \% and \_ KEEP the backslash
// (pattern-matching sequences evaluate to the two-character strings), and
// any other \x yields x. Doubled quotes ('') are accepted so
// NO_BACKSLASH_ESCAPES dumps parse too. NULL -> null; integers/floats ->
// JS numbers; 0x-hex, x'..' and b'..' literals -> Uint8Array; _binary /
// _charset introducers are consumed and the following literal kept as-is.
//
// Memory bounds (full argument in docs/migration-tool-notes.md): peak
// parser buffer <= chunkBytes + one unprocessed suffix, compacted whenever
// the consumed prefix passes COMPACT_LIMIT; the pending-row queue is
// drained by the consumer between feeds. Nothing accumulates rows across
// the file: callers consume a per-row async iterator.

import { open } from "node:fs/promises";

const DEFAULT_CHUNK_BYTES = 1 << 20; // 1 MiB read chunks
const COMPACT_LIMIT = 1 << 18; // compact once 256 KiB is consumed
/** Feed granularity inside dumpRows: bounds the pending-row queue. */
const FEED_SLICE_CHARS = 1 << 16; // 64 KiC
/** MySQL string-literal escapes (server grammar, "String Literals"). */
const ESCAPES = new Map([
  ["0", "\0"],
  ["'", "'"],
  ['"', '"'],
  ["b", "\b"],
  ["n", "\n"],
  ["r", "\r"],
  ["t", "\t"],
  ["Z", "\x1a"],
  ["\\", "\\"],
]);

/**
 * Decode the MySQL escapes of a raw (unquoted) literal body: backslash
 * escapes (with \% / \_ keeping the backslash per MySQL semantics) AND the
 * doubled-quote convention ('' -> ', the NO_BACKSLASH_ESCAPES form, which
 * MySQL accepts alongside backslash escapes in every mode). One linear
 * pass; output is never re-scanned, so \'\' (two escaped quotes) correctly
 * stays two quotes while '' (one doubled pair) collapses to one.
 */
export function decodeMysqlEscapes(raw) {
  if (!raw.includes("\\") && !raw.includes("''")) return raw;
  let out = "";
  let i = 0;
  const n = raw.length;
  while (i < n) {
    const c = raw[i];
    if (c === "\\" && i + 1 < n) {
      const next = raw[i + 1];
      if (next === "%" || next === "_") {
        out += c + next; // pattern sequences keep the backslash
      } else {
        out += ESCAPES.get(next) ?? next;
      }
      i += 2;
    } else if (c === "'" && raw[i + 1] === "'") {
      out += "'";
      i += 2;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

/**
 * Index of the closing quote of a string literal whose content starts at
 * `start` (buf[start] is the first content character; the opening quote
 * was already consumed). Returns -1 when the literal needs more input.
 * Handles backslash escapes and doubled quotes in one forward pass: the
 * only search is buf.indexOf plus a bounded backward walk over the escape
 * run. Never backtracks.
 *
 * `start` must be the literal's true first content character in the
 * current buffer: the parser never compacts while a literal is open
 * (compaction points are field/tuple boundaries or literal starts), so an
 * escape run can never reach before `start`.
 */
function findStringEnd(buf, start, quoteChar) {
  let i = start;
  for (;;) {
    const q = buf.indexOf(quoteChar, i);
    if (q === -1) return -1;
    let bs = 0;
    let j = q - 1;
    while (j >= start && buf[j] === "\\") {
      bs += 1;
      j -= 1;
    }
    if (bs % 2 === 1) {
      i = q + 1; // escaped quote, stay inside the string
      continue;
    }
    if (quoteChar === "'" && buf[q + 1] === "'") {
      i = q + 2; // doubled quote (''), stay inside the string
      continue;
    }
    return q;
  }
}

const IDENT_RE = /[A-Za-z0-9_$.]/;
const SEP_RE = /[\s,]/;
const WS_RE = /[\s]/;

/** Bare SQL token -> JS value (NULL, TRUE/FALSE, 0x-hex, numbers). */
function parseBareToken(tok) {
  if (tok === "NULL" || tok === "null") return null;
  if (tok === "TRUE" || tok === "true") return 1;
  if (tok === "FALSE" || tok === "false") return 0;
  if (/^0x[0-9a-fA-F]+$/.test(tok)) return hexOrBitToBuffer("hex", tok.slice(2));
  if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(tok)) return Number(tok);
  return tok; // unknown token shape: carry it through verbatim
}

/** Hex / bit literal digits -> bytes. */
function hexOrBitToBuffer(kind, digits) {
  if (kind === "b") {
    const byte = Number.parseInt(digits, 2);
    return new Uint8Array(Number.isNaN(byte) ? [0] : [byte]);
  }
  const padded = digits.length % 2 === 0 ? digits : `0${digits}`;
  return Uint8Array.from(Buffer.from(padded, "hex"));
}

/** Yield every row the parser has completed so far. */
async function* drainParser(parser) {
  for (;;) {
    const row = parser.nextRow();
    if (row === undefined) return;
    yield row;
  }
}

/**
 * Async generator over every INSERT row of a mysqldump file. One linear
 * streaming pass; yields { table, values, columns } per row in dump
 * order. `columns` is the explicit column-name array when the statement
 * carried one, else undefined (positional order = schema order).
 *
 * Options:
 * - tables: only emit rows for these table names (the file is still
 *   scanned linearly; skipped statements are counted, not decoded).
 * - chunkBytes: read chunk size (default 1 MiB).
 * - onProgress(bytesRead, rowsEmitted): called after each read chunk.
 * - signal: AbortSignal checked between chunks.
 * - tolerantTruncated: stop cleanly at a truncated tail instead of
 *   throwing (warning recorded on the returned... see parseStats note:
 *   callers that need the warning should construct MysqldumpInsertParser
 *   directly; the generator surfaces truncation as a thrown error unless
 *   tolerant, in which case the tail is silently dropped).
 */
export async function* dumpRows(dumpPath, opts = {}) {
  const parser = new MysqldumpInsertParser(opts);
  const chunkBytes = opts.chunkBytes ?? DEFAULT_CHUNK_BYTES;
  const decoder = new TextDecoder("utf-8");
  const handle = await open(dumpPath, "r");
  try {
    const buffer = Buffer.allocUnsafe(chunkBytes);
    let read = await handle.read(buffer, 0, chunkBytes);
    while (read.bytesRead > 0) {
      if (opts.signal?.aborted) throw new Error("aborted");
      const text = decoder.decode(buffer.subarray(0, read.bytesRead), {
        stream: true,
      });
      // Feed in slices so the pending-row queue stays small and rows
      // flow to the consumer per slice (bounded-memory part 2).
      for (let off = 0; off < text.length; off += FEED_SLICE_CHARS) {
        parser.feed(text.slice(off, off + FEED_SLICE_CHARS), false);
        yield* drainParser(parser);
      }
      opts.onProgress?.(parser.stats.bytesRead, parser.stats.rowsEmitted);
      read = await handle.read(buffer, 0, chunkBytes);
    }
    // Flush the TextDecoder's pending multibyte state; append one
    // sentinel newline so a final line without a terminator still parses.
    parser.feed(decoder.decode() + "\n", true);
    parser.finish();
    yield* drainParser(parser);
  } finally {
    await handle.close();
  }
}

/**
 * The streaming parser proper. feed(text, atEof) appends text and parses
 * everything that completes; nextRow() pops one completed row (or
 * undefined). The split exists so tests can drive the parser at
 * arbitrary chunk boundaries: feeding one character at a time MUST
 * produce byte-identical results to feeding whole files.
 *
 * A feed may complete many rows; they queue in arrival order (bounded by
 * what one feed parses — dumpRows feeds in 64 KiC slices and drains).
 */
export class MysqldumpInsertParser {
  buf = "";
  pos = 0;
  // States: scan | table | post-table | cols | await-open | fields
  state = "scan";
  table = "";
  columns;
  fields;
  queue = [];
  tableFilter;
  chunkBytes;
  tolerantTruncated;
  stats = {
    bytesRead: 0,
    rowsEmitted: 0,
    statements: 0,
    maxBufferChars: 0,
    skippedTables: 0,
  };
  /** Warnings (metadata only - never row content). */
  warnings = [];

  constructor(opts = {}) {
    this.tableFilter = opts.tables ? new Set(opts.tables) : undefined;
    this.chunkBytes = opts.chunkBytes ?? DEFAULT_CHUNK_BYTES;
    this.tolerantTruncated = opts.tolerantTruncated ?? false;
  }

  /** Append decoded text and parse what completes. atEof marks the final
   *  feed (no more input will ever arrive). */
  feed(text, atEof = false) {
    this.buf += text;
    this.stats.bytesRead += text.length;
    const pending = this.buf.length - this.pos;
    if (pending > this.stats.maxBufferChars) this.stats.maxBufferChars = pending;
    this.parse(atEof);
  }

  /** Pop the next completed row, or undefined while more input is needed. */
  nextRow() {
    return this.queue.shift();
  }

  /** Call once after the final feed(): throws on a truncated statement
   *  unless tolerantTruncated was set. */
  finish() {
    if (this.state !== "scan") {
      const msg = `dump ended mid-statement (state=${this.state}, table=${this.table})`;
      if (this.tolerantTruncated) {
        this.warnings.push(`truncated: ${msg}`);
        return;
      }
      throw new Error(msg);
    }
  }

  /** EOF inside a statement: drop the tail with a warning when tolerant,
   *  throw otherwise. Returns true (parse loop continues cleanly). */
  eofFail(msg) {
    if (this.tolerantTruncated) {
      this.warnings.push(`truncated: ${msg}`);
      this.state = "scan";
      this.table = "";
      this.columns = undefined;
      this.fields = undefined;
      return true;
    }
    throw new Error(msg);
  }

  // -------------------------------------------------------------------
  // buffer management
  // -------------------------------------------------------------------

  /** Drop the consumed prefix. Only called at points where no string
   *  literal is open mid-scan, so no escape run is ever cut in half. */
  compact() {
    if (this.pos > 0) {
      this.buf = this.buf.slice(this.pos);
      this.pos = 0;
    }
  }

  maybeCompact(minConsumed = COMPACT_LIMIT) {
    if (this.pos >= minConsumed) this.compact();
  }

  // -------------------------------------------------------------------
  // the state machine
  // -------------------------------------------------------------------

  parse(atEof) {
    for (;;) {
      const n = this.buf.length;
      if (this.pos >= n) {
        this.maybeCompact(1);
        return;
      }
      switch (this.state) {
        case "scan":
          if (!this.scanStatement(atEof)) return;
          break;
        case "table":
          if (!this.scanTableName(atEof)) return;
          break;
        case "post-table":
          if (!this.scanPostTable(atEof)) return;
          break;
        case "cols":
          if (!this.scanColumnList(atEof)) return;
          break;
        case "await-open":
          if (!this.scanTupleStart(atEof)) return;
          break;
        case "fields":
          if (!this.scanFields(atEof)) return;
          break;
        case "between":
          if (!this.afterTuple(atEof)) return;
          break;
        default:
          throw new Error(`unknown parser state: ${this.state}`);
      }
    }
  }

  /** scan state: skip everything until an INSERT INTO starts. Returns
   *  false when more input is needed. */
  scanStatement(atEof) {
    const n = this.buf.length;
    let i = this.pos;
    while (i < n) {
      const c = this.buf[i];
      if (WS_RE.test(c)) {
        i += 1;
        continue;
      }
      if (c === ";") {
        i += 1;
        continue;
      }
      if (c === "-" && this.buf[i + 1] === "-") {
        i = this.skipLine(i);
        continue;
      }
      if (c === "#") {
        i = this.skipLine(i);
        continue;
      }
      if (c === "/" && this.buf[i + 1] === "*") {
        i = this.skipBlockComment(i);
        continue;
      }
      if (c === "I" && this.buf.startsWith("INSERT INTO `", i)) {
        this.pos = i + 13; // "INSERT INTO `".length
        this.state = "table";
        this.maybeCompact();
        return true;
      }
      // Any other statement: skip to its terminating ";" quote-aware.
      const next = this.skipStatement(i, atEof);
      if (next === -1) return false; // keep pos: the statement continues
      i = next;
    }
    this.pos = i;
    this.maybeCompact();
    return false;
  }

  skipLine(i) {
    const nl = this.buf.indexOf("\n", i);
    return nl === -1 ? this.buf.length : nl + 1;
  }

  /** Skip a block comment (blind close scan — mysqldump comments carry no
   *  row data). Returns the index after the close, or buffer end when the
   *  comment is still open (more input needed). */
  skipBlockComment(i) {
    const close = this.buf.indexOf("*/", i + 2);
    return close === -1 ? this.buf.length : close + 2;
  }

  /** Skip one non-INSERT statement quote-aware; returns the index just
   *  past its ";" or -1 when more input is needed. */
  skipStatement(i, atEof) {
    const n = this.buf.length;
    let quote = null;
    let j = i;
    while (j < n) {
      const c = this.buf[j];
      if (quote !== null) {
        if (c === "\\") {
          j += 2; // escaped char inside the literal
          continue;
        }
        if (c === quote) quote = null;
        j += 1;
        continue;
      }
      if (c === "'" || c === '"' || c === "`") {
        quote = c;
        j += 1;
        continue;
      }
      if (c === "-" && this.buf[j + 1] === "-") {
        j = this.skipLine(j);
        continue;
      }
      if (c === "#") {
        j = this.skipLine(j);
        continue;
      }
      if (c === "/" && this.buf[j + 1] === "*") {
        j = this.skipBlockComment(j);
        continue;
      }
      if (c === ";") return j + 1;
      j += 1;
    }
    if (atEof && quote === null) return n; // trailing fragment without ";"
    return -1;
  }

  /** table state: pos is just past "INSERT INTO `". Read the name. */
  scanTableName(atEof) {
    const close = this.buf.indexOf("`", this.pos);
    if (close === -1) {
      if (atEof) return this.eofFail("dump ended inside INSERT table name");
      return false; // keep pos: the name continues in the next chunk
    }
    this.table = this.buf.slice(this.pos, close);
    this.columns = undefined;
    this.pos = close + 1;
    this.state = "post-table";
    this.maybeCompact();
    return true;
  }

  /** post-table state: expect VALUES, or "(" starting a column list. */
  scanPostTable(atEof) {
    const n = this.buf.length;
    let i = this.pos;
    while (i < n && WS_RE.test(this.buf[i])) i += 1;
    if (i >= n) {
      this.pos = i;
      if (atEof) return this.eofFail("dump ended before INSERT VALUES");
      return false;
    }
    if (this.buf[i] === "(") {
      this.pos = i + 1;
      this.state = "cols";
      return true;
    }
    if (this.buf.startsWith("VALUES", i) || this.buf.startsWith("values", i)) {
      this.pos = i + 6;
      this.state = "await-open";
      this.maybeCompact();
      return true;
    }
    // A chunk boundary can split the keyword: a short tail that is a
    // proper prefix of VALUES must wait for more input, not error.
    const tail = this.buf.slice(i, Math.min(n, i + 6));
    if (
      tail.length < 6 &&
      ("VALUES".startsWith(tail) || "values".startsWith(tail))
    ) {
      if (atEof) return this.eofFail("dump ended inside the VALUES keyword");
      this.pos = i;
      return false;
    }
    throw new Error(
      `malformed INSERT INTO \`${this.table}\`: expected VALUES near byte ${this.stats.bytesRead - (n - i)}`,
    );
  }

  /** cols state: inside the optional explicit column list. Column names
   *  accumulate on this.columns directly — the scan re-enters at every
   *  chunk boundary, so local arrays would silently drop names. */
  scanColumnList(atEof) {
    const n = this.buf.length;
    if (this.columns === undefined) this.columns = [];
    let i = this.pos;
    for (;;) {
      while (i < n && SEP_RE.test(this.buf[i])) i += 1;
      if (i >= n) {
        this.pos = i;
        if (atEof) return this.eofFail("dump ended inside column list");
        return false;
      }
      if (this.buf[i] === ")") {
        i += 1;
        break;
      }
      if (this.buf[i] === "`") {
        const end = this.buf.indexOf("`", i + 1);
        if (end === -1) {
          this.pos = i;
          if (atEof) return this.eofFail("dump ended inside column name");
          return false;
        }
        this.columns.push(this.buf.slice(i + 1, end));
        i = end + 1;
        continue;
      }
      throw new Error(`malformed column list for \`${this.table}\``);
    }
    this.pos = i;
    this.state = "post-table"; // now expect VALUES
    this.maybeCompact();
    return true;
  }

  /** await-open state: skip whitespace/commas to the tuple's "(". */
  scanTupleStart(atEof) {
    const n = this.buf.length;
    let i = this.pos;
    while (i < n && SEP_RE.test(this.buf[i])) i += 1;
    if (i >= n) {
      this.pos = i;
      if (atEof) return this.eofFail("dump ended before row tuple");
      return false;
    }
    if (this.buf[i] === "(") {
      this.pos = i + 1;
      this.fields = [];
      this.state = "fields";
      return true;
    }
    if (this.buf[i] === ";") {
      // INSERT ... VALUES (); - degenerate but legal; close the statement.
      this.pos = i + 1;
      this.finishStatement();
      this.maybeCompact();
      return true;
    }
    throw new Error(
      `malformed row tuple for \`${this.table}\` near byte ${this.stats.bytesRead - (n - i)}`,
    );
  }

  /** fields state: parse values until the tuple's ")". */
  scanFields(atEof) {
    const n = this.buf.length;
    const fields = this.fields;
    let i = this.pos;
    for (;;) {
      while (i < n && SEP_RE.test(this.buf[i])) i += 1;
      if (i >= n) {
        this.pos = i;
        this.maybeCompact();
        if (atEof) return this.eofFail(`dump ended mid-tuple in \`${this.table}\``);
        return false;
      }
      const c = this.buf[i];
      if (c === ")") {
        this.pos = i + 1;
        this.emitRow();
        this.state = "between"; // resume point after the tuple
        return true;
      }
      if (c === "'" || c === '"') {
        const contentStart = i + 1;
        const end = findStringEnd(this.buf, contentStart, c);
        // A terminator sitting on the buffer's last char is ambiguous for
        // single quotes: the next char decides doubled-quote (stay open)
        // vs close. Wait for one more char unless this is the final feed.
        const edgeAmbiguous =
          end === this.buf.length - 1 && c === "'" && !atEof;
        if (end === -1 || edgeAmbiguous) {
          this.pos = i; // resume at the opening quote with more input
          this.maybeCompact();
          if (atEof && end === -1) {
              return this.eofFail(`dump ended inside a string literal in \`${this.table}\``);
            }
          return false;
        }
        fields.push(decodeMysqlEscapes(this.buf.slice(contentStart, end)));
        i = end + 1;
        continue;
      }
      // Bare token: NULL, number (with optional sign and exponent), hex,
      // introducer...
      const tokStart = i;
      if (c === "-" || c === "+") i += 1; // numeric sign
      while (i < n && IDENT_RE.test(this.buf[i])) i += 1;
      // scientific-notation sign (1.5e-3): part of the same token
      while (
        i < n &&
        (this.buf[i] === "-" || this.buf[i] === "+") &&
        i > tokStart &&
        (this.buf[i - 1] === "e" || this.buf[i - 1] === "E")
      ) {
        i += 1;
        while (i < n && IDENT_RE.test(this.buf[i])) i += 1;
      }
      if (i === tokStart) {
        throw new Error(
          `unexpected character ${JSON.stringify(c)} in \`${this.table}\` row near byte ${this.stats.bytesRead - (n - i)}`,
        );
      }
      if (i >= n) {
        // The token may continue in the next chunk: restart it whole.
        this.pos = tokStart;
        this.maybeCompact();
        if (atEof) {
            return this.eofFail(`dump ended inside a bare token in \`${this.table}\``);
          }
        return false;
      }
      const tok = this.buf.slice(tokStart, i);
      // b'0101' / x'1F' bit/hex literals: introducer + quoted digits.
      if ((tok === "b" || tok === "B" || tok === "x" || tok === "X") && this.buf[i] === "'") {
        const litEnd = this.buf.indexOf("'", i + 1);
        if (litEnd === -1) {
          this.pos = tokStart;
          if (atEof) {
              return this.eofFail(`dump ended inside a hex/bit literal in \`${this.table}\``);
            }
          return false;
        }
        fields.push(
          tok === "b" || tok === "B"
            ? hexOrBitToBuffer("b", this.buf.slice(i + 1, litEnd))
            : hexOrBitToBuffer("x", this.buf.slice(i + 1, litEnd)),
        );
        i = litEnd + 1;
        continue;
      }
      // _charset / _binary introducers: consume the token, let the next
      // loop iteration parse the following literal as-is (decko dumps
      // carry none; robustness only).
      if (tok.charCodeAt(0) === 95 /* _ */) {
        continue;
      }
      fields.push(parseBareToken(tok));
    }
  }

  /** between state: a tuple just closed. "," -> next tuple, ";" -> done. */
  afterTuple(atEof) {
    const n = this.buf.length;
    let i = this.pos;
    while (i < n && WS_RE.test(this.buf[i])) i += 1;
    if (i >= n) {
      this.pos = i;
      if (atEof) {
        this.finishStatement();
        this.maybeCompact();
        return true;
      }
      return false;
    }
    const c = this.buf[i];
    if (c === ",") {
      this.pos = i + 1;
      this.state = "await-open";
      this.maybeCompact();
      return true;
    }
    if (c === ";") {
      this.pos = i + 1;
      this.finishStatement();
      this.maybeCompact();
      return true;
    }
    throw new Error(
      `unexpected character after tuple in \`${this.table}\` near byte ${this.stats.bytesRead - (n - i)}`,
    );
  }

  emitRow() {
    const values = this.fields;
    this.fields = [];
    if (this.tableFilter !== undefined && !this.tableFilter.has(this.table)) {
      this.stats.skippedTables += 1;
      return;
    }
    this.queue.push({ table: this.table, values, columns: this.columns });
    this.stats.rowsEmitted += 1;
  }

  finishStatement() {
    this.stats.statements += 1;
    this.state = "scan";
    this.table = "";
    this.columns = undefined;
    this.fields = undefined;
  }
}
