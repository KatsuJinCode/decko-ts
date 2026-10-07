// deploy/bunny-worker-src/edge-host-labels.ts — how the edge handler names
// its host in /_status and /api/status.
//
// The handler serves two hosts: Bunny Edge Scripting over BunnyDbDriver (the
// default, unchanged bytes) and Cloudflare Workers over a D1 binding
// (deploy/cf-worker-src/cf-edge-engine-entry.ts, which sets these once at
// module load). Labels are configuration, not request state.

export interface EdgeHostLabels {
  /** The runtime the handler runs on. */
  runtime: string;
  /** The database driver it reads through. */
  driver: string;
  /** Cloudflare: the D1 binding's name, reported instead of the Bunny
   *  credential variable names, which this host does not use. */
  binding?: string;
}

export const BUNNY_HOST_LABELS: EdgeHostLabels = {
  runtime: "bunny-edge-scripting",
  driver: "BunnyDbDriver (hrana v2 over fetch)",
};

let labels: EdgeHostLabels = BUNNY_HOST_LABELS;

export function setEdgeHostLabels(next: EdgeHostLabels): void {
  labels = next;
}

export function edgeHostLabels(): EdgeHostLabels {
  return labels;
}
