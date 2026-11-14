// Type declarations for parse-dump.mjs (plain-JS tool module; the .d.mts
// travels beside it so strict-mode TypeScript consumers — tests and the
// engine bridge — import it safely).

export interface DumpRow {
  /** Source table name (between the backticks). */
  table: string;
  /** Decoded values, positional: string | number | null | Uint8Array. */
  values: unknown[];
  /** Explicit column names when the dump carried a column list. */
  columns: string[] | undefined;
}

export interface ParserStats {
  bytesRead: number;
  rowsEmitted: number;
  statements: number;
  /** High-water mark of the retained text buffer, in characters. */
  maxBufferChars: number;
  skippedTables: number;
}

export interface DumpRowsOptions {
  /** Only emit rows for these tables (file is still scanned linearly). */
  tables?: readonly string[];
  /** Read chunk size in bytes (default 1 MiB). */
  chunkBytes?: number;
  /** Called after each read chunk: (bytesRead, rowsEmitted). */
  onProgress?: (bytesRead: number, rowsEmitted: number) => void;
  signal?: AbortSignal;
  /** Stop cleanly at a truncated tail instead of throwing. */
  tolerantTruncated?: boolean;
}

/** Decode MySQL backslash escapes (and doubled quotes) of a raw literal
 *  body. \% / \_ keep the backslash per MySQL string-literal semantics. */
export function decodeMysqlEscapes(raw: string): string;

/** Streaming parser: feed(text, atEof) then drain nextRow(). Feeding one
 *  character at a time produces byte-identical results to whole files. */
export class MysqldumpInsertParser {
  constructor(opts?: DumpRowsOptions);
  feed(text: string, atEof?: boolean): void;
  nextRow(): DumpRow | undefined;
  finish(): void;
  readonly stats: ParserStats;
  readonly warnings: string[];
}

/** Async generator over every INSERT row of a mysqldump (one linear
 *  streaming pass; rows in dump order). */
export declare function dumpRows(
  dumpPath: string,
  opts?: DumpRowsOptions,
): AsyncGenerator<DumpRow, void, undefined>;
