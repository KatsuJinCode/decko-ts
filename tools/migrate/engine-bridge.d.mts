// Type declarations for engine-bridge.mjs (plain-JS tool module; the .mjs
// itself imports the TypeScript engine with explicit .ts specifiers, which
// resolves under vite/vitest and deliberately fails under bare node —
// migrate.mjs catches that and falls back to the vitest-runner path).

import type { LocalSqliteToolDriver } from "./import.mjs";

/** The real decko-ts name algebra (src/card/name.ts DeckoName.key) under the
 *  deployed deck's inflection table, for import.mjs's simple-card
 *  missing-key repair hook. */
export function deriveKeyWithEngine(name: string): string;

export interface EngineSpotResult {
  id: number;
  view: string;
  sha256: string;
  bytes: number;
  contentContained?: boolean;
}

export interface EngineChecksResult {
  junctionEngine: { sampled: number; resolved: number };
  spotRender: {
    sampled: number;
    rendered: number;
    renderErrors: number;
    contentContainedHits: number;
    results: EngineSpotResult[];
  };
  fixtures: {
    source: string;
    cardsPresent: number;
    contentParityHits: number;
    contentParityChecked: number;
    renderedCompared: number;
    renderedMismatched: number;
    /** The repo's own synthetic oracle fixture names ("Oracle ..."). */
    matchedFixtureNames: string[];
  };
}

/** The verify.mjs engineChecks hook: spot-render N cards through the real
 *  RenderEngine, resolve junctions through the real Lexicon, and
 *  byte-compare content and rendered views against the repo's committed
 *  fixture expectations when the migrated deck has the fixture cards.
 *  Content-free: ids, hashes, counts — never migrated card names/content. */
export function engineChecks(ctx: {
  driver: LocalSqliteToolDriver;
  spotCount: number;
  seed: number;
}): Promise<EngineChecksResult>;
