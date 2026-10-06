// Type declarations for mod-harness.mjs (the mod porting harness). The .mjs
// is the implementation; this file exists so tsc (NodeNext) can type the
// imports tests make of the enumerators. Declaration-only, no behavior.
//
// Added by the r2-phantom-rows lane (2026-10-06) so
// tests/tools/mod-porting-harness/format-census-view-set.test.ts can assert
// `mineViews` against the Ruby-truth oracle directly rather than through the
// committed surface.json artifact.

export interface MinedView {
  name: string;
  alias: string | null;
  line: number;
  viaLoop: boolean;
  config: string | null;
  file: string;
}

export interface MinedEvent {
  event: string;
  options: string;
  line: number;
  file: string;
}

export interface MinedBasketOp {
  op: string;
  line: number;
  file: string;
}

export interface SurfaceBehavior {
  id: string;
  kind: string;
  name: string;
  source: string;
  [key: string]: unknown;
}

export interface Surface {
  modId: string;
  gemName: string;
  gemPath: string;
  setFiles: { file: string; views: number; events: number; baskets: number }[];
  behaviors: SurfaceBehavior[];
  seeds: unknown[];
  configs: unknown[];
  assets: unknown[];
  publicAssets: unknown;
}

export function mineViews(src: string, relFile: string): MinedView[];
export function mineEvents(src: string, relFile: string): MinedEvent[];
export function mineBaskets(src: string, relFile: string): MinedBasketOp[];
export function surfaceMod(modId: string, gemName: string, gemPath: string): Surface;