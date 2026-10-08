// The oracle replay engine: replays captured fixture entries through
// per-area handlers registered by the engine streams, byte-diffs actual vs
// expected (slot-id normalized on both sides), and produces a structured
// report. Areas without a registered handler report PENDING - a missing
// stream is a status, never a failure.
//
// This module references the engine streams by INTERFACE ONLY: handlers are
// plain functions registered here, no imports of src/card, src/cql, or any
// other engine area. See docs/parity-method.md for the adoption contract.

import {
  canonicalJson,
  cardRecordWithoutId,
  formatCaptureError,
  isCaptureErrorSentinel,
  loadFixtureFile,
  parseRenderedKey,
  renderedViewInput,
  nameAlgebraExpectation,
  type CapturedCardRecord,
  type CardRecordWithoutId,
  type CqlBasicFixture,
  type CqlQueryCase,
  type CaptureErrorSentinel,
  type LoadedFixture,
  type NameAlgebraExpectation,
  type ReadRuleFixture,
  type SmokeFixture,
} from "./fixture-schema.js";
import { compareNormalized, type ByteDiffResult } from "./diff.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "fixtures",
  "captured"
);

// ---- handler contract ------------------------------------------------------

/**
 * What a handler returns for one fixture entry. The harness converts each
 * variant to comparable bytes:
 * - bytes: compared as-is (render-engine HTML).
 * - json: canonicalized (deeply key-sorted, compact) then compared
 *   (name-engine / card-engine / rules-engine objects, cql-engine arrays).
 * - error: rebuilt as the recorded sentinel
 *   `CAPTURE_ERROR: <ruby class>: <message>` and compared as bytes.
 *   errorClass is the FULL Ruby class name (e.g. "Card::Error::UserError"),
 *   because the sentinel bytes are the parity target.
 */
export type HandlerOutcome =
  | { kind: "bytes"; bytes: string }
  | { kind: "json"; value: unknown }
  | { kind: "error"; errorClass: string; message: string };

export const renderBytes = (bytes: string): HandlerOutcome => ({ kind: "bytes", bytes });
export const jsonValue = (value: unknown): HandlerOutcome => ({ kind: "json", value });
export const raisedError = (errorClass: string, message: string): HandlerOutcome => ({
  kind: "error",
  errorClass,
  message,
});

// ---- replay checks (one per fixture entry), grouped by engine area ---------

export interface NameAlgebraCheck {
  id: string;
  area: "name-engine";
  input: { name: string };
  expected: NameAlgebraExpectation;
}

export interface CardRecordCheck {
  id: string;
  area: "card-engine";
  input: { name: string };
  expected: CardRecordWithoutId;
}

export interface CqlResultCheck {
  id: string;
  area: "cql-engine";
  input: { query: { [key: string]: unknown } };
  expected: string[] | CaptureErrorSentinel;
}

export interface RenderCheck {
  id: string;
  area: "render-engine";
  input: { cardName: string; view: string };
  expected: string; // HTML bytes, or a capture-error sentinel string
}

export interface ReadRuleCheck {
  id: string;
  area: "rules-engine";
  input: { target: string };
  expected: ReadRuleFixture;
}

export type ReplayCheck =
  | NameAlgebraCheck
  | CardRecordCheck
  | CqlResultCheck
  | RenderCheck
  | ReadRuleCheck;

export type ReplayEntry = ReplayCheck;

/**
 * Area -> check-type map. This is the closed set of engine areas the
 * fixtures exercise; a new capture section means extending this map (and
 * the flattener) deliberately.
 */
export interface AreaHandlerMap {
  "name-engine": NameAlgebraCheck;
  "card-engine": CardRecordCheck;
  "cql-engine": CqlResultCheck;
  "render-engine": RenderCheck;
  "rules-engine": ReadRuleCheck;
}

export type AreaKey = keyof AreaHandlerMap;

export type ReplayHandler<K extends AreaKey> = (
  input: AreaHandlerMap[K]["input"]
) => HandlerOutcome | Promise<HandlerOutcome>;

type AnyHandler = (input: never) => HandlerOutcome | Promise<HandlerOutcome>;

/**
 * Registry of per-area handlers. Streams register in their own test files
 * (never here - no engine imports in src/testing). Unregistered areas are
 * reported PENDING by replay, never a failure.
 */
export class HandlerRegistry {
  private handlers = new Map<AreaKey, AnyHandler>();

  register<K extends AreaKey>(area: K, handler: ReplayHandler<K>): void {
    if (this.handlers.has(area)) {
      throw new Error(`a handler is already registered for area "${area}"`);
    }
    this.handlers.set(area, handler as AnyHandler);
  }

  has(area: AreaKey): boolean {
    return this.handlers.has(area);
  }

  get<K extends AreaKey>(area: K): ReplayHandler<K> | undefined {
    const handler = this.handlers.get(area);
    return handler ? (handler as ReplayHandler<K>) : undefined;
  }

  registeredAreas(): AreaKey[] {
    return [...this.handlers.keys()].sort();
  }
}

// ---- fixture -> replay entries --------------------------------------------

function cardEntries(kind: string, name: string, record: CapturedCardRecord): ReplayEntry[] {
  return [
    {
      id: `${kind}:cards:${name}:name-algebra`,
      area: "name-engine",
      input: { name },
      expected: nameAlgebraExpectation(record),
    },
    {
      id: `${kind}:cards:${name}:record`,
      area: "card-engine",
      input: { name },
      expected: cardRecordWithoutId(record),
    },
  ];
}

function smokeEntries(fixture: SmokeFixture, kind: string): ReplayEntry[] {
  const entries: ReplayEntry[] = [];
  for (const [name, record] of Object.entries(fixture.cards)) {
    entries.push(...cardEntries(kind, name, record));
  }
  for (const [key, html] of Object.entries(fixture.rendered)) {
    const { cardName, view: viewLabel } = parseRenderedKey(key);
    entries.push({
      id: `${kind}:rendered:${key}`,
      area: "render-engine",
      input: { cardName, view: renderedViewInput(viewLabel) },
      expected: html,
    });
  }
  entries.push({
    id: `${kind}:read_rule:${fixture.read_rule.target}`,
    area: "rules-engine",
    input: { target: fixture.read_rule.target },
    expected: fixture.read_rule,
  });
  // smoke.cql_search is validated by the schema but deliberately NOT
  // flattened: capture.rb recorded bare Card.search results without the
  // canonical query JSON, so there is no handler input to replay.
  return entries;
}

function cqlBasicEntries(fixture: CqlBasicFixture, kind: string): ReplayEntry[] {
  return Object.entries(fixture.queries).map(([caseName, queryCase]: [string, CqlQueryCase]) => ({
    id: `${kind}:queries:${caseName}`,
    area: "cql-engine" as const,
    input: { query: queryCase.query },
    expected: queryCase.result,
  }));
}

/** Flatten loaded fixtures into replay entries in deterministic file order. */
export function collectReplayEntries(fixtures: LoadedFixture[]): ReplayEntry[] {
  const entries: ReplayEntry[] = [];
  for (const loaded of fixtures) {
    if (loaded.kind === "smoke") {
      entries.push(...smokeEntries(loaded.data as SmokeFixture, loaded.kind));
    } else {
      entries.push(...cqlBasicEntries(loaded.data as CqlBasicFixture, loaded.kind));
    }
  }
  return entries;
}

export const DEFAULT_FIXTURE_PATHS = [
  path.join(FIXTURES_DIR, "smoke.json"),
  path.join(FIXTURES_DIR, "cql-basic.json"),
];

// ---- judgment --------------------------------------------------------------

function expectedBytes(entry: ReplayCheck): string {
  switch (entry.area) {
    case "name-engine":
      return canonicalJson(entry.expected);
    case "card-engine":
      return canonicalJson(entry.expected);
    case "cql-engine":
      return typeof entry.expected === "string" ? entry.expected : canonicalJson(entry.expected);
    case "render-engine":
      return entry.expected;
    case "rules-engine":
      return canonicalJson(entry.expected);
  }
}

function actualBytes(entry: ReplayCheck, outcome: HandlerOutcome): string {
  if (outcome.kind === "error") {
    return formatCaptureError(outcome.errorClass, outcome.message);
  }
  if (outcome.kind === "bytes") {
    return outcome.bytes;
  }
  if (entry.area === "card-engine" && outcome.value !== null && typeof outcome.value === "object") {
    // Card ids are DB-local and informational (docs/parity-method.md)
    // stripped from BOTH sides before comparison.
    return canonicalJson(cardRecordWithoutId(outcome.value as CapturedCardRecord));
  }
  return canonicalJson(outcome.value);
}

function shapeMismatchNote(entry: ReplayCheck, outcome: HandlerOutcome): string | undefined {
  const expectsSentinel =
    (entry.area === "cql-engine" && typeof entry.expected === "string") ||
    (entry.area === "render-engine" && isCaptureErrorSentinel(entry.expected));
  if (expectsSentinel && outcome.kind !== "error") {
    return "fixture expects a raised error (CAPTURE_ERROR sentinel) but the handler returned output";
  }
  if (!expectsSentinel && outcome.kind === "error") {
    return `handler raised ${outcome.errorClass}: ${outcome.message} but the fixture expects a successful result`;
  }
  return undefined;
}

export type ReplayEntryStatus = "pass" | "fail" | "pending";

export interface ReplayEntryResult {
  id: string;
  area: AreaKey;
  status: ReplayEntryStatus;
  /** On fail: the exact-bytes diff (slot ids normalized on both sides). */
  diff?: ByteDiffResult;
  /** On fail: one-line human hint for outcome/expectation shape mismatches. */
  detail?: string;
  /** On pending: why the entry was not replayed. */
  pendingReason?: string;
}

export interface ReplayReport {
  entries: ReplayEntryResult[];
  summary: { total: number; pass: number; fail: number; pending: number };
}

function judge(entry: ReplayCheck, outcome: HandlerOutcome): ReplayEntryResult {
  const diff = compareNormalized(expectedBytes(entry), actualBytes(entry, outcome));
  return {
    id: entry.id,
    area: entry.area,
    status: diff.equal ? "pass" : "fail",
    ...(diff.equal ? {} : { diff, detail: shapeMismatchNote(entry, outcome) }),
  };
}

function pendingResult(entry: ReplayCheck): ReplayEntryResult {
  return {
    id: entry.id,
    area: entry.area,
    status: "pending",
    pendingReason: `no handler registered for area "${entry.area}"`,
  };
}

async function runEntry(entry: ReplayCheck, registry: HandlerRegistry): Promise<ReplayEntryResult> {
  if (!registry.has(entry.area)) {
    return pendingResult(entry);
  }
  switch (entry.area) {
    case "name-engine":
      return judge(entry, await registry.get(entry.area)!(entry.input));
    case "card-engine":
      return judge(entry, await registry.get(entry.area)!(entry.input));
    case "cql-engine":
      return judge(entry, await registry.get(entry.area)!(entry.input));
    case "render-engine":
      return judge(entry, await registry.get(entry.area)!(entry.input));
    case "rules-engine":
      return judge(entry, await registry.get(entry.area)!(entry.input));
  }
}

/** Replay every entry against the registry, sequentially, in fixture order. */
export async function replayEntries(
  entries: ReplayEntry[],
  registry: HandlerRegistry
): Promise<ReplayReport> {
  const results: ReplayEntryResult[] = [];
  for (const entry of entries) {
    results.push(await runEntry(entry, registry));
  }
  const summary = {
    total: results.length,
    pass: results.filter((r) => r.status === "pass").length,
    fail: results.filter((r) => r.status === "fail").length,
    pending: results.filter((r) => r.status === "pending").length,
  };
  return { entries: results, summary };
}

/** Load fixture files, flatten to entries, and replay them. */
export async function replayFixtureFiles(
  paths: string[],
  registry: HandlerRegistry
): Promise<ReplayReport> {
  const fixtures = paths.map((path) => loadFixtureFile(path));
  return replayEntries(collectReplayEntries(fixtures), registry);
}

// ---- report formatting -----------------------------------------------------

/**
 * Multi-line failure message for one entry: offset + excerpt context.
 * This is what engine-stream tests should surface on assertion failure.
 */
export function formatReplayFailure(result: ReplayEntryResult): string {
  if (result.status !== "fail") {
    throw new Error(`formatReplayFailure: entry ${result.id} is ${result.status}, not failed`);
  }
  const lines: string[] = [];
  lines.push(`FAIL ${result.id} (${result.area})`);
  if (result.detail) {
    lines.push(`  ${result.detail}`);
  }
  if (result.diff?.firstDifference) {
    const first = result.diff.firstDifference;
    lines.push(
      `  first difference at code-unit offset ${first.codeUnitOffset} (byte offset ${first.byteOffset}): expected ${first.expectedChar} but got ${first.actualChar}`
    );
    lines.push(`  expected excerpt: ${first.expectedExcerpt}`);
    lines.push(`  actual excerpt:   ${first.actualExcerpt}`);
    lines.push(
      `  sizes: expected ${result.diff.expectedBytes} bytes, actual ${result.diff.actualBytes} bytes`
    );
  }
  return lines.join("\n");
}

/** Full human-readable report: one status line per entry, details on fails. */
export function formatReplayReport(report: ReplayReport): string {
  const lines: string[] = [];
  for (const entry of report.entries) {
    if (entry.status === "pass") {
      lines.push(`PASS ${entry.id}`);
    } else if (entry.status === "pending") {
      lines.push(`PENDING ${entry.id} (${entry.pendingReason})`);
    } else {
      lines.push(formatReplayFailure(entry));
    }
  }
  const { total, pass, fail, pending } = report.summary;
  lines.push(`replay summary: ${pass} passed, ${fail} failed, ${pending} pending, ${total} total`);
  return lines.join("\n");
}
