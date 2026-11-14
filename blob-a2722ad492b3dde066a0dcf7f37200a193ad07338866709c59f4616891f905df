// Type declarations for tools/cost-model/model.mjs. The model is plain ESM
// JavaScript so it runs without a build step; this file gives the test and
// any other TypeScript consumer the shape of its exports.

export interface Scenario {
  id: string;
  label: string;
  cpuMs: number;
  rowsPerView: number;
  statementsPerView: number;
}

export interface UncachedPage {
  statements: number;
  rows: number;
}

export interface RepoFigures {
  cards: number;
  references: number;
  storageBytes: number;
  uncached: Record<string, UncachedPage>;
}

export interface CloudflareFree {
  maxViewsPerMonth: number;
  binding: string;
  cpuOk: boolean;
  reqCap: number;
  rowsCap: number;
}

export interface TrafficRow {
  views: number;
  cf_free_warm: boolean;
  cf_paid_warm: number;
  cf_paid_uncached: number;
  bunny_warm: number;
  bunny_uncached: number;
  ruby_host: number;
  ruby_servers: number;
}

export interface Headline {
  prices_read_date: string;
  cf_free_views_per_month: number;
  cf_free_binding_warm: string;
  cf_free_views_per_month_uncached: number;
  cf_free_binding_uncached: string;
  bunny_min_views_per_month: number;
  bunny_minimum_usd: number;
  bunny_scale_views_per_month: number;
  bunny_scale_usd: number;
  cf_paid_views_per_month: number;
  cf_paid_usd: number;
}

export interface ModelResult {
  days: number;
  bytesPerView: number;
  storageGb: number;
  boots: number;
  coldCpuMs: number;
  scenarios: Scenario[];
  cfFree: { warm: CloudflareFree; uncached: CloudflareFree };
  headline: Headline;
  rows: TrafficRow[];
  fig: RepoFigures;
  inputs: any;
}

export const REPO: string;
export const INPUTS_PATH: string;
export const DOC_PATH: string;
export const BEGIN_MARK: string;
export const END_MARK: string;

export function loadInputs(path?: string): any;
export function resolveRepoFigures(inp: any): RepoFigures;
export function checkCitations(inp: any): string[];
export function scenarios(inp: any): Scenario[];
export function build(inp?: any): ModelResult;
export function renderMarkdown(b: ModelResult): string;
export function headlineJson(b: ModelResult): Headline;
export function writeDocBlock(markdown: string, docPath?: string): void;