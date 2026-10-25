// Type declarations for the roster's own grader module
// (tools/edge-signed-in-exercise/lib/local-policy.mjs).
//
// The module is plain ESM JavaScript, so TypeScript needs this sibling
// declaration to type the imports that reach it (the parity pins under
// tests/card/mod-loader/ import verifiedCapabilities directly). Without it
// every such import is an implicit any, the repository's `tsc -p
// tsconfig.json` build exits non-zero, and the staging-server dist
// bootstrap (tests/card/auth/staging-server-dist-bootstrap.ts) refuses to
// build - which stops EVERY endpoint suite that boots the server, not only
// the ones that import this module.
//
// The shapes below describe what the module actually does; the grader's own
// contract is unchanged by this file.

export interface CapabilityRow {
  id: string;
  group?: string;
  capability?: string;
  status: string;
  checks?: string[];
  check?: string;
  requiredActors?: string[];
  finding?: string;
  [key: string]: unknown;
}

export interface CapabilityResult {
  check: string;
  pass: boolean | null;
  skipped?: boolean;
  evidence?: Record<string, unknown>;
}

export interface GradedCapability extends CapabilityRow {
  verifiedChecks: string[];
}

/** The render configuration the local exercise is allowed to inherit. */
export function localEnv(args: {
  live: Record<string, string>;
  dbUrl: string;
  origin: string;
}): Record<string, string>;

export function externalBrowserRequestAllowed(
  request: {
    url(): string;
    resourceType?(): string;
    isNavigationRequest?(): boolean;
  },
  args: {
    origin: string;
    allowedHosts: Set<string>;
    allowedFaviconUrls?: string[];
  },
): boolean;

/** The grader: one graded row per input row, with the status it computes. */
export function verifiedCapabilities(
  capabilities: CapabilityRow[],
  results: CapabilityResult[],
): GradedCapability[];
