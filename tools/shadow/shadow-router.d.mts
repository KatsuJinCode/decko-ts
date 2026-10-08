// Type declarations for tools/shadow/shadow-router.mjs (stream T5's
// shadow-compare proxy skeleton). Signatures mirror the .mjs exports;
//

import type { Server } from "node:http";

/** The policy file shape after loadPolicy validation; allowlist/blocklist
 *  entries are compiled to RegExps at load time (anchored globs). Both
 *  arrays are present on every loaded policy (empty when unused by the
 *  mode), matching loadPolicy's normalization. */
export interface ShadowPolicy {
  mode: "shadow-everything" | "shadow-allowlist" | "shadow-blocklist";
  allowlist: RegExp[];
  blocklist: RegExp[];
  /** 0..100; percent-bucket sampling (monotonic subset across rates). */
  sampleRate: number;
}

/** One buffered upstream response (the skeleton does not stream). */
export interface ShadowResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

export interface ShadowResponseDiff {
  kind: "status" | "content-type" | "body";
  ruby?: unknown;
  ts?: unknown;
}

export interface ShadowComparison {
  same: boolean;
  diffs: ShadowResponseDiff[];
  firstDiffOffset: number;
  rubyBytes: number;
  tsBytes: number;
  bodyEqual: boolean;
}

export declare function loadPolicy(filePath: string): ShadowPolicy;

export declare function fnv1a(str: string): number;

export declare function shouldShadow(
  policy: ShadowPolicy,
  method: string,
  path: string,
): boolean;

export declare function forwardOnce(opts: {
  baseUrl: string;
  method: string;
  urlPath: string;
  headers: Record<string, string | undefined>;
  body: Buffer | null | undefined;
}): Promise<ShadowResponse>;

export declare function compareResponses(
  ruby: ShadowResponse,
  ts: ShadowResponse,
): ShadowComparison;

export declare function appendLogEntry(logPath: string, entry: unknown): void;

export declare function createProxyServer(opts: {
  rubyUrl: string;
  tsUrl: string;
  policy: ShadowPolicy;
  logPath?: string;
}): Server;
