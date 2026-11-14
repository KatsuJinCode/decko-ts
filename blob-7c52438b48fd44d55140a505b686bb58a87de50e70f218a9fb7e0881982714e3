// port-only-route-oracle.ts - the loader for the port-only route oracle
// fixture, and the check that the PORT's own surface is still there.
//
// The fixture (fixtures/captured/port-only-routes-e6-e13-ruby-oracle.json)
// is written by tests/server/oracle-capture-port-only-routes-e6-e13-ruby.rb.
// It holds three things, and this module reads all three:
//
//   1. THE PINNED RAILS' OWN ANSWER for each probe path and verb (the
//      pinned deck's route table drawn into a real pinned-rails route set,
//      recognized by the pinned router). This is the oracle the parity
//      tests pin.
//   2. THE PORT'S OWN SERVING SOURCE, quoted with line numbers at the
//      capture's branch.
//   3. THE PINNED GEMS' OWN SOURCE, quoted with line numbers, for the rows
//      whose pinned answer is a method rather than a route.
//
// WHY THE PORT'S CURRENT BYTES ARE CHECKED AND NOT JUST THE QUOTE. A
// quoted line is a record of one branch. The port keeps moving, so a test
// that only reads the quote would keep passing after the port's surface
// moved. The check below reads the port's OWN CURRENT file and looks for
// the surface's own text there, so the test fails when the port's surface
// is gone and passes when it is still there - line moves included, because
// the check is on the text, not on the line number.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const PORT_ONLY_ROUTE_ORACLE_FIXTURE =
  "fixtures/captured/port-only-routes-e6-e13-ruby-oracle.json";

export interface RouterAnswer {
  path: string;
  verb: string;
  matched: boolean;
  answer: {
    verb: string;
    path: string;
    defaults: Record<string, string>;
    parameters: Record<string, string>;
  } | null;
  matches: Array<{
    verb: string;
    path: string;
    defaults: Record<string, string>;
    parameters: Record<string, string>;
  }>;
}

export interface PortSurfaceQuote {
  host: string;
  file: string;
  lines: Array<{ line: number; text: string }>;
}

export interface PinnedSourceQuote {
  file: string;
  lines: Array<{ line: number; text: string }>;
}

export interface PortOnlyRouteOracle {
  row: string;
  gemset: string;
  rows: Record<string, string>;
  routerAnswers: Record<string, RouterAnswer[]>;
  sharedReductionAnswers: Record<
    string,
    Array<{
      path: string;
      verb: string;
      firstRouteAdmitting: number | null;
      candidateCount: number;
      note: string;
    }>
  >;
  pinnedRouteTable: Array<{ line: number; text: string }>;
  pinnedRouterRoutes: Array<{
    index: number;
    verb: string;
    path: string;
    defaults: Record<string, string>;
  }>;
  pinnedSource: Record<string, PinnedSourceQuote[]>;
  portSurface: Record<string, PortSurfaceQuote[]>;
  rigArtifacts: string[];
}

let cached: PortOnlyRouteOracle | null = null;

/** The oracle fixture, read once per process. */
export function loadPortOnlyRouteOracle(): PortOnlyRouteOracle {
  if (cached !== null) return cached;
  cached = JSON.parse(
    readFileSync(path.join(REPO, PORT_ONLY_ROUTE_ORACLE_FIXTURE), "utf8"),
  ) as PortOnlyRouteOracle;
  return cached;
}

/** The pinned router's answer for one path and verb, or undefined. */
export function pinnedAnswer(
  row: string,
  probePath: string,
  verb: string,
): RouterAnswer | undefined {
  const answers = loadPortOnlyRouteOracle().routerAnswers[row] ?? [];
  return answers.find((entry) => entry.path === probePath && entry.verb === verb);
}

/** The port's own current file, as text. */
export function portFileText(file: string): string {
  return readFileSync(path.join(REPO, file), "utf8");
}

/**
 * True when the port's OWN CURRENT file still carries the surface's own
 * text. The needle is a slice of the port's own source, so a port that
 * dropped the surface fails the check and a port that moved the line does
 * not.
 */
export function portServes(file: string, needle: string): boolean {
  return portFileText(file).includes(needle);
}

/** The text of one quoted line of a quote, joined. */
export function quoteText(quote: PortSurfaceQuote | PinnedSourceQuote): string {
  return quote.lines.map((line) => line.text).join("\n");
}
