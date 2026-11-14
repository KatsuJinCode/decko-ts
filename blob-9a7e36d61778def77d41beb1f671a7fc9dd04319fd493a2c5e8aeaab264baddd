// Type declarations for capture-manifest-provenance.mjs (the provenance
// primitives for the dual-lane capture: sha identity, staging verification,
// manifest grading, content-addressed photographs). The .mjs is the
// implementation; this file exists so tsc (NodeNext) can type imports from
// tests and tooling. Declaration-only, no behavior.

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
