// A reference-harness session for engine tests: the TypeScript adapter over a
// private copy of the synthetic-v1 deck (stock Ruby Decko 0.20.0 built it),
// with the recorded Ruby renders to compare against. The copy lives in the OS
// temp directory and is removed by close().
//
// The deck, its files and the Ruby outputs are committed under
// reference-harness/fixtures/synthetic-v1, so these tests need no local data
// beyond the checkout.

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
// @ts-expect-error plain ESM module without type declarations
import { AdapterSession, loadAdapterManifest } from "../../../../reference-harness/runner/adapter-process.mjs";
// @ts-expect-error plain ESM module without type declarations
import { normalizeHtml } from "../../../../reference-harness/runner/normalize.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const harness = path.resolve(here, "../../../../reference-harness");
const fixture = path.join(harness, "fixtures/synthetic-v1");

export interface RenderAnswer {
  ok: boolean;
  html?: string;
  error?: { class: string; message: string };
}

export interface HarnessSession {
  render(card: string, opts?: { actor?: string; view?: string }): Promise<RenderAnswer>;
  ask(body: Record<string, unknown>): Promise<{ ok: boolean; result?: unknown; error?: unknown }>;
  close(): Promise<void>;
}

let expectedRenders: Map<string, string> | undefined;

/** The Ruby oracle's normalised html for a render item id
 *  (`page:<actor>:<card>` or `<view>:<actor>:<card>`). */
export function rubyRender(id: string): string {
  if (expectedRenders === undefined) {
    expectedRenders = new Map();
    const text = gunzipSync(readFileSync(path.join(fixture, "expected/render.jsonl.gz"))).toString("utf8");
    for (const line of text.split("\n")) {
      if (line.trim() === "") continue;
      const row = JSON.parse(line) as { id: string; result?: { html?: string } };
      if (typeof row.result?.html === "string") expectedRenders.set(row.id, normalizeHtml(row.result.html));
    }
  }
  const html = expectedRenders.get(id);
  if (html === undefined) throw new Error(`no recorded Ruby render ${id}`);
  return html;
}

export function normalize(html: string): string {
  return normalizeHtml(html);
}

export async function openHarnessSession(): Promise<HarnessSession> {
  const work = mkdtempSync(path.join(os.tmpdir(), "decko-fresh-deck-"));
  try {
    cpSync(path.join(fixture, "deck/deck.sqlite3"), path.join(work, "deck.sqlite3"));
    const files = path.join(fixture, "deck/files");
    if (existsSync(files)) cpSync(files, path.join(work, "files"), { recursive: true });
    else mkdirSync(path.join(work, "files"));
    mkdirSync(path.join(work, "adapter"));
    const slash = (p: string) => p.replaceAll("\\", "/");
    const manifest = loadAdapterManifest(path.join(harness, "adapters/ts/adapter.json"));
    const session = new AdapterSession(manifest, {
      HARNESS_DECK: slash(path.join(work, "deck.sqlite3")),
      HARNESS_FILES: slash(path.join(work, "files")),
      HARNESS_DECK_JSON: slash(path.join(fixture, "deck.json")),
      HARNESS_WORK: slash(path.join(work, "adapter")),
    });
    await session.start();
    return {
      async render(card, opts = {}) {
        const answer = await session.request({ op: "render", card, actor: opts.actor ?? "anonymous", view: opts.view });
        if (!answer.ok) return { ok: false, error: answer.error };
        return { ok: true, html: normalizeHtml(answer.result.html) };
      },
      ask: (body) => session.request({ op: "ask", ...body }),
      async close() {
        try {
          await session.close();
        } finally {
          rmSync(work, { recursive: true, force: true });
        }
      },
    };
  } catch (error) {
    rmSync(work, { recursive: true, force: true });
    throw error;
  }
}
