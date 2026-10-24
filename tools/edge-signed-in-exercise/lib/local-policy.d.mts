// The declaration for local-policy.mjs, so the TypeScript tests that import
// the module carry types instead of an implicit any. The shapes below are the
// module's own: the roster row the grader reads, the result row it grades,
// and the two environment helpers the harness calls.

/** One row of the capability roster: the shape verifiedCapabilities reads. */
export interface CapabilityRow {
  id: string;
  status: string;
  checks?: string[];
  check?: string;
  requiredActors?: string[];
  verifiedChecks?: string[];
}

/** One result row the grader reads: a check name, a verdict, its evidence.
 *  The evidence carries whatever the producing instrument put in it; the
 *  grader reads the actor out of it. */
export interface GradedResult {
  check?: string | null;
  pass?: boolean;
  evidence?: Record<string, unknown>;
}

export function localEnv(args: {
  live: Record<string, string>;
  dbUrl: string;
  origin: string;
}): Record<string, string>;

export function externalBrowserRequestAllowed(
  request: {
    url(): string;
    resourceType(): string;
    method(): string;
    isNavigationRequest?(): boolean;
    frame(): { url(): string };
  },
  options: { origin: string; allowedHosts: Set<string>; allowedFaviconUrls?: string[] },
): boolean;

export function verifiedCapabilities(
  capabilities: CapabilityRow[],
  results: GradedResult[],
): CapabilityRow[];
