// Type declarations for deck-seed-parser.mjs (plain-JS tool module; the
// .d.mts travels beside it so strict-mode TypeScript consumers — tests and
// the engine bridge — import it safely).

export interface DeckSeedRow {
  /** Source table name (between the backticks of the INSERT INTO). */
  table: string;
  /** Explicit column names when the INSERT carried a column list. */
  columns: string[] | undefined;
  /** Decoded values, positional: string | number | null. */
  values: unknown[];
}

export interface DeckSeedRowsOptions {
  /** Only emit rows for these tables (file is still scanned linearly). */
  tables?: readonly string[];
}

/** Decode a single SQL literal body (between the quotes): doubled '' -> ',
 * backslash escapes NOT honored (deck INSERT files do not carry them). */
export function decodeLiteral(raw: string): string;

/** Async generator over the rows of a deck-INSERT file. Streaming: memory
 *  is bounded by the statement buffer, not the file size. */
export function deckSeedRows(
  path: string,
  opts?: DeckSeedRowsOptions,
): AsyncGenerator<DeckSeedRow, void, void>;
