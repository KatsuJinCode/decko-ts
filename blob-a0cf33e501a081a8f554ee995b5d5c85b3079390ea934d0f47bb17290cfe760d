// deck-seed-parser.mjs — streaming parser for the "deck INSERT" format:
// a flat, one-INSERT-per-statement dump shape (explicit column list, no
// DDL, no dump-tool markers) that some decko export passes produce.
//
// The productized importer (tools/migrate/import-deck.mjs) accepts three
// source shapes:
//   * SQLite file       -> generalized-import.mjs (already streaming)
//   * mysqldump text    -> parse-dump.mjs (mysqldump grammar)
//   * deck INSERT text  -> THIS MODULE
//
// The deck-INSERT format is a flat stream of:
//
//   INSERT INTO <table> (col1, col2, ...) VALUES (v1, v2, ...);
//   INSERT INTO <table> (col1, col2, ...) VALUES (v1, v2, ...);
//
// Every statement carries its own explicit column list (no positional
// fallback). Statements can span multiple lines because content strings
// embed "\n". The terminator is one ";" outside string literals; the
// parser tracks a quote-aware state machine so it never confuses a ";"
// inside a string with the statement end.
//
// This is a SUBSET of the mysqldump grammar that the existing
// parse-dump.mjs already handles (it accepts the explicit-column-list
// variant). The reason this module exists is:
//   (1) the deck-INSERT shape is NOT a mysqldump file (no
//       backticks, no /*!40000 markers, no CREATE TABLE) - parse-dump
//       would treat it as an unknown shape and refuse to walk it;
//   (2) a smaller, statement-bounded parser is faster on the
//       statement-per-line deck shape because it never has to scan for
//       the backtick table name.
//
// The parser emits { table, columns, values } rows in the same shape the
// importer already expects. Callers feed it to the existing schema-map
// machinery or to the staging SQLite importer for column-drift handling.

import { open } from "node:fs/promises";

const FEED_CHARS = 1 << 16; // 64 KiC feed granularity inside the async gen

/** Decode a single SQL literal body (between the quotes) with the
 *  minimal SQL standard escape rules: doubled '' -> ' and \n literal
 *  newlines preserved as-is.  backslash escapes are NOT honored here -
 *  deck INSERT files do not carry them. */
export function decodeLiteral(raw) {
  if (raw.indexOf("''") < 0) return raw;
  let out = "";
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === "'" && raw[i + 1] === "'") {
      out += "'";
      i += 2;
      continue;
    }
    out += raw[i];
    i += 1;
  }
  return out;
}

const IDENT = /[A-Za-z0-9_]/;

/** Walk one statement's body to extract the (cols) list and one VALUES
 *  tuple. Returns { columns, values } or throws on malformed input.
 *  atEof=false lets the caller feed the rest when more input is needed. */
function scanStatement(stmtBody) {
  // The leading "INSERT INTO <table> " has already been consumed.
  // Locate the column list " (a, b, c)" - the open paren is the next char.
  let i = 0;
  const n = stmtBody.length;
  while (i < n && /\s/.test(stmtBody[i])) i += 1;
  if (i >= n || stmtBody[i] !== "(") {
    throw new Error(`expected column list near ${JSON.stringify(stmtBody.slice(0, 30))}`);
  }
  i += 1;
  const columns = [];
  for (;;) {
    while (i < n && /\s/.test(stmtBody[i])) i += 1;
    if (i >= n) throw new Error("unexpected end of column list");
    let nameStart = i;
    while (i < n && IDENT.test(stmtBody[i])) i += 1;
    if (i === nameStart) throw new Error(`malformed column name near ${i}`);
    columns.push(stmtBody.slice(nameStart, i));
    while (i < n && /\s/.test(stmtBody[i])) i += 1;
    if (i < n && stmtBody[i] === ",") {
      i += 1;
      continue;
    }
    if (i < n && stmtBody[i] === ")") {
      i += 1;
      break;
    }
    throw new Error(`malformed column list near ${i}: ${JSON.stringify(stmtBody.slice(i, i + 10))}`);
  }
  while (i < n && /\s/.test(stmtBody[i])) i += 1;
  // Expect "VALUES"
  if (!stmtBody.startsWith("VALUES", i) && !stmtBody.startsWith("values", i)) {
    throw new Error(`expected VALUES near ${i}: ${JSON.stringify(stmtBody.slice(i, i + 20))}`);
  }
  i += 6;
  while (i < n && /\s/.test(stmtBody[i])) i += 1;
  if (i >= n || stmtBody[i] !== "(") {
    throw new Error(`expected VALUES tuple near ${i}: ${JSON.stringify(stmtBody.slice(i, i + 20))}`);
  }
  i += 1;
  const values = [];
  for (;;) {
    while (i < n && /\s/.test(stmtBody[i])) i += 1;
    if (i >= n) throw new Error("unexpected end of VALUES tuple");
    const c = stmtBody[i];
    if (c === "'") {
      // single-quoted string literal
      i += 1;
      const start = i;
      for (;;) {
        const q = stmtBody.indexOf("'", i);
        if (q === -1) throw new Error("unterminated string literal");
        if (q + 1 < n && stmtBody[q + 1] === "'") {
          i = q + 2;
          continue;
        }
        values.push(decodeLiteral(stmtBody.slice(start, q)));
        i = q + 1;
        break;
      }
    } else if (c === "N" && (stmtBody[i + 1] === "U" || stmtBody[i + 1] === "u") &&
               (stmtBody[i + 2] === "L" || stmtBody[i + 2] === "l") &&
               (stmtBody[i + 3] === "L" || stmtBody[i + 3] === "l") &&
               (i + 4 >= n || !IDENT.test(stmtBody[i + 4])) &&
               (i - 1 < 0 || /\s|[(,]/.test(stmtBody[i - 1]))) {
      values.push(null);
      i += 4;
    } else if (c === "-" || c === "+" || (c >= "0" && c <= "9")) {
      const tokStart = i;
      if (c === "-" || c === "+") i += 1;
      while (i < n && /[0-9.]/.test(stmtBody[i])) i += 1;
      if (i < n && (stmtBody[i] === "e" || stmtBody[i] === "E")) {
        i += 1;
        if (i < n && (stmtBody[i] === "-" || stmtBody[i] === "+")) i += 1;
        while (i < n && /[0-9]/.test(stmtBody[i])) i += 1;
      }
      values.push(Number(stmtBody.slice(tokStart, i)));
    } else {
      throw new Error(`unexpected value char ${JSON.stringify(c)} near ${i}: ${JSON.stringify(stmtBody.slice(i, i + 20))}`);
    }
    while (i < n && /\s/.test(stmtBody[i])) i += 1;
    if (i < n && stmtBody[i] === ",") {
      i += 1;
      continue;
    }
    if (i < n && stmtBody[i] === ")") {
      i += 1;
      break;
    }
    throw new Error(`malformed VALUES tuple near ${i}: ${JSON.stringify(stmtBody.slice(i, i + 20))}`);
  }
  return { columns, values, tail: stmtBody.slice(i) };
}

/** Async generator over the rows of a deck-INSERT file. Each yielded row
 *  is { table, columns, values } - the same shape generalized-import
 *  expects.  The stream is read in chunks and rows flow as soon as their
 *  terminating ";" is seen; peak memory is O(chunk + unprocessed tail). */
export async function* deckSeedRows(path, opts = {}) {
  const tableFilter = opts.tables ? new Set(opts.tables) : undefined;
  const decoder = new TextDecoder("utf-8");
  const handle = await open(path, "r");
  try {
    const chunkBytes = opts.chunkBytes ?? (1 << 20);
    const buffer = Buffer.allocUnsafe(chunkBytes);
    let text = "";
    let read = await handle.read(buffer, 0, chunkBytes);
    let stats = { bytesRead: 0, rowsEmitted: 0, statements: 0, skippedTables: 0 };
    while (read.bytesRead > 0) {
      stats.bytesRead += read.bytesRead;
      const chunk = decoder.decode(buffer.subarray(0, read.bytesRead), { stream: true });
      text += chunk;
      // Walk text to find completed statements.
      // Quotes and parens only nest one level for our shape (each INSERT
      // has exactly one VALUES tuple), but the content can contain "\n"
      // and arbitrary chars inside a single-quoted literal.
      let i = 0;
      while (i < text.length) {
        // Find the next INSERT INTO at the top level.
        const head = text.indexOf("INSERT", i);
        if (head === -1) break;
        i = head;
        // Confirm the keyword.
        if (!text.startsWith("INSERT INTO ", i)) {
          i += 1;
          continue;
        }
        i += "INSERT INTO ".length;
        // Read the table name (ident chars).
        const tableStart = i;
        while (i < text.length && IDENT.test(text[i])) i += 1;
        const table = text.slice(tableStart, i);
        if (table.length === 0) {
          i += 1;
          continue;
        }
        // Now walk the statement body to find its terminating ";".
        let inStr = false;
        let stmtEnd = -1;
        for (let j = i; j < text.length; j++) {
          const c = text[j];
          if (inStr) {
            if (c === "'") {
              if (j + 1 < text.length && text[j + 1] === "'") {
                j += 1;
                continue;
              }
              inStr = false;
            }
            continue;
          }
          if (c === "'") {
            inStr = true;
            continue;
          }
          if (c === ";") {
            stmtEnd = j;
            break;
          }
        }
        if (stmtEnd === -1) break; // statement continues in next chunk
        const body = text.slice(i, stmtEnd);
        const parsed = scanStatement(body);
        stats.statements += 1;
        if (tableFilter === undefined || tableFilter.has(table)) {
          yield { table, columns: parsed.columns, values: parsed.values };
          stats.rowsEmitted += 1;
        } else {
          stats.skippedTables += 1;
        }
        i = stmtEnd + 1;
        // Trim the consumed prefix to bound memory.
        if (i > (1 << 18)) {
          text = text.slice(i);
          i = 0;
        }
      }
      // After draining, drop the consumed prefix (it may sit just before a
      // multi-line content literal that the next chunk will finish).
      if (i > 0 && i < text.length) {
        text = text.slice(i);
        i = 0;
      } else if (i === text.length) {
        text = "";
        i = 0;
      }
      opts.onProgress?.(stats.bytesRead, stats.rowsEmitted);
      read = await handle.read(buffer, 0, chunkBytes);
    }
  } finally {
    await handle.close();
  }
}
