// register-events-oracle-helpers.ts - the shared helpers for the
// [Family] event rows' oracle-parity tests.
//
// Each row's test reads the EXECUTED Ruby oracle capture the shared
// capture harness (tests/server/oracle-capture-pinned-deck-harness-ruby.rb)
// produced over the pinned gemset, and pins the port against what that
// capture RECORDED. This file holds the two reads every one of those tests
// needs: the captured oracle, and the port's own event declarations.

import { readFileSync } from "node:fs";
import type { DeckoModManifest } from "../../../src/card/mod-loader/mod-manifest.js";

/** One captured Ruby oracle, read from its committed fixture. */
export function readOracle(slug: string): Record<string, any> {
  const path = new URL(
    `../../../fixtures/captured/${slug}-ruby-oracle.json`,
    import.meta.url,
  );
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Every event declaration in a manifest, flattened with its set path. */
export function declaredEvents(
  mod: DeckoModManifest,
): Array<{ setPath: string } & Record<string, unknown>> {
  const out: Array<{ setPath: string } & Record<string, unknown>> = [];
  for (const file of mod.setModules ?? []) {
    for (const event of file.events ?? []) {
      out.push({ setPath: file.setPath, ...(event as unknown as Record<string, unknown>) });
    }
  }
  return out;
}

/** The serving write route's source, read for the trigger and stage
 *  questions the reachability arms ask. */
export function writeRoutesSource(): string {
  return readFileSync(new URL("../../../src/server/write-routes.ts", import.meta.url), "utf8");
}

/** Every trigger name the serving write route parses. */
export function parsedWriteRouteTriggers(route: string): string[] {
  const inline = [...route.matchAll(/\["trigger"\]\s*===\s*"([a-z_]+)"/g)].map((m) => m[1]!);
  const local = [...route.matchAll(/\btrigger\s*(?:===|!==)\s*"([a-z_]+)"/g)].map((m) => m[1]!);
  return [...new Set([...inline, ...local])];
}
