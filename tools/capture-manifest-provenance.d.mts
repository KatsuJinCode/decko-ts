// Type declarations for capture-manifest-provenance.mjs (the M1/M2/M5/M6
// provenance primitives for the dual-lane capture). The .mjs is the
// implementation; this file exists so tsc (NodeNext) can type imports from
// tests and tooling. Added by the incremental-diff-grade lane (2026-09-30)
// because its test imports this module; declaration-only, no behavior.

export const MANIFEST_SCHEMA: string;
export const MANIFEST_FILENAME: string;

export function sha256File(file: string): string;
export function sqliteHeaderChangeCounter(file: string): number;
export function stageFile(
  src: string,
  dst: string,
  label: string,
  log?: (m: string) => void,
): { action: "verified-existing" | "copied"; sha256: string };

export function verifyManifestForGrading(args: {
  manifestPath: string;
  corpusFile: string;
  liveCorpusSha256?: string;
}): {
  ok: boolean;
  refusals: string[];
  manifest?: Record<string, unknown>;
};

export function contentAddressedPhotographPath(
  root: string,
  corpusSha256: string,
  runId: string,
): string;
