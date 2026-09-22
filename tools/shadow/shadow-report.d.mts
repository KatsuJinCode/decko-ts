// Type declarations for tools/shadow/shadow-report.mjs (stream T5's
// shadow-log aggregator). Signatures mirror the .mjs exports.

export interface ShadowPatternStats {
  pattern: string;
  total: number;
  same: number;
  diff: number;
  skipped: number;
  errors: number;
}

export interface ShadowLogSummary {
  total: number;
  same: number;
  diff: number;
  skipped: number;
  errors: number;
  samePct: number;
  patterns: ShadowPatternStats[];
  worstOffenders: Array<Record<string, unknown>>;
  diffOffsetHistogram: Array<Record<string, unknown>>;
}

/** Aggregate a JSONL shadow-log text blob into a summary object. Pure. */
export declare function aggregateLog(jsonlText: string): ShadowLogSummary;

/** Collapse one URL path to its comparison pattern
 *  (e.g. "/cards/Sample-Name" -> "/cards/<name>"). */
export declare function classifyPath(path: string): string;
