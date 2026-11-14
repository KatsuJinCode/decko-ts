// Delayed work for the edge hosts: what a Ruby deck's job runner and its
// periodic maintenance do, expressed as queue messages a Cloudflare Queue
// (or any host's equivalent) carries and a cron trigger enqueues.
//
// The one message kind today is the periodic sweep:
//   - expired sign-in sessions are deleted (the auth_sessions table,
//     deploy/migrations/0005; a lookup already refuses an expired row, so
//     this only reclaims storage);
//   - upload drafts older than a day are deleted from the files bucket's
//     tmp/ area. A two-step upload (card-mod-carrierwave 00_upload_cache.rb)
//     caches the file before the card is saved; a save attaches and clears
//     it, and an abandoned edit leaves it behind. Ruby leaves those files in
//     its tmp directory for the operating system to reap; a bucket has no
//     such reaper, so the sweep is that reaper.
//
// The engine's own integrate_with_delay stage (card-mod-follow notices,
// card-mod-carrierwave clear_draft_files) still runs inside the request
// that saved the card, on every host, as it does on the Node host.

import type { SQLDatabaseDriver } from "./driver.js";
import type { BlobDriver } from "../blob/driver.js";
import { sqlDateTime } from "../card/auth/session-store.js";

/** The structural slice of a Cloudflare Queue producer binding. */
export interface QueueProducerLike {
  send(body: unknown): Promise<void>;
}

export interface SweepMessage {
  readonly kind: "sweep";
  /** ISO timestamp the sweep was requested at; ages are measured from it. */
  readonly at: string;
}

export type DelayedWorkMessage = SweepMessage;

/** Upload drafts older than this are abandoned. */
export const UPLOAD_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function sweepMessage(now: Date): SweepMessage {
  return { kind: "sweep", at: now.toISOString() };
}

export interface DelayedWorkDeps {
  readonly driver: SQLDatabaseDriver;
  /** The files bucket; absent = no draft sweep. */
  readonly files?: BlobDriver;
}

export interface SweepOutcome {
  readonly sessionsDeleted: number;
  readonly draftsDeleted: number;
}

export async function runDelayedWork(message: DelayedWorkMessage, deps: DelayedWorkDeps): Promise<SweepOutcome> {
  if (message === null || typeof message !== "object" || message.kind !== "sweep") {
    throw new Error(`unknown delayed work message: ${JSON.stringify(message)}`);
  }
  const at = new Date(message.at);
  if (Number.isNaN(at.getTime())) throw new Error(`sweep message has no valid time: ${JSON.stringify(message)}`);

  const sessions = await deps.driver.query(`DELETE FROM "auth_sessions" WHERE "expires_at" < ?`, [sqlDateTime(at)]);

  let draftsDeleted = 0;
  if (deps.files !== undefined) {
    const cutoff = at.getTime() - UPLOAD_DRAFT_MAX_AGE_MS;
    for (const entry of await deps.files.list("tmp/")) {
      if (entry.lastModified !== undefined && entry.lastModified.getTime() < cutoff) {
        await deps.files.delete(entry.key);
        draftsDeleted += 1;
      }
    }
  }
  return { sessionsDeleted: sessions.rowsAffected, draftsDeleted };
}
