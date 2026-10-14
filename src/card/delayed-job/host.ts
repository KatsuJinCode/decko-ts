// The host side of card-mod-delayed_job: one call each host makes to get the
// engine's delayed-job config and the worker that performs the jobs.
//
// Ruby reads Cardio.config.delaying (false unless the deck sets
// `config.delaying = true`, as card-mod-delayed_job's README asks). The
// hosts read the same switch from DECKO_DELAYING, so a deploy that sets
// nothing keeps Ruby's default: integrate_with_delay runs in line.

import type { SQLDatabaseDriver } from "../../server/driver.js";
import type { FetchEngine } from "../fetch.js";
import { CardActionEngine, type CardActionEngineOptions } from "../actions/card-action-engine.js";
import {
  DelayedJobWorker,
  SqlDelayedJobQueue,
  SqlDelayedJobStore,
  type AfterResponse,
  type DelayedEventJob,
  type DelayedJobsConfig,
} from "./delayed-job.js";

/** DECKO_DELAYING read as Ruby's boolean: "true" or "1" turns delaying on. */
export function delayingFromEnv(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

export interface HostDelayedJobsOptions {
  readonly driver: SQLDatabaseDriver;
  readonly fetcher: FetchEngine;
  /** Cardio.config.delaying. */
  readonly delaying: boolean;
  /** How this host runs the worker after the response. */
  readonly afterResponse: AfterResponse;
  /** The options every write engine on this host gets (transport, mail
   *  context, ...); the performing engine is built with the same ones. */
  readonly engineOptions?: Omit<CardActionEngineOptions, "actor" | "delayedJobs">;
  /** GlobalID.app for the handler (the Rails app name, dasherized). */
  readonly globalIdApp?: string;
  /** Delayed::Worker#name for locked_by. */
  readonly workerName?: string;
  readonly log?: (line: string) => void;
}

export interface HostDelayedJobs {
  /** The engine option; undefined when not delaying. */
  readonly config: DelayedJobsConfig | undefined;
  /** The worker over the deck's delayed_jobs table (also the Queues consumer's). */
  readonly worker: DelayedJobWorker;
}

/** Build a host's delayed-job wiring. The worker performs each job with an
 *  engine acting as the job's current user (Card::Auth.with auth), built
 *  with the host's own engine options. */
export function hostDelayedJobs(opts: HostDelayedJobsOptions): HostDelayedJobs {
  const store = new SqlDelayedJobStore(opts.driver, {
    ...(opts.workerName === undefined ? {} : { workerName: opts.workerName }),
    ...(opts.globalIdApp === undefined ? {} : { globalIdApp: opts.globalIdApp }),
  });
  const perform = async (job: DelayedEventJob): Promise<void> => {
    const actorId = job.auth.current_id;
    const actorCard = actorId === null ? undefined : await opts.fetcher.fetchById(actorId);
    const actor = actorId !== null && actorCard?.name !== undefined ? { id: actorId, name: actorCard.name.s } : null;
    const engine = new CardActionEngine(opts.fetcher, { ...(opts.engineOptions ?? {}), actor });
    await engine.performDelayedJob(job);
  };
  const worker = new DelayedJobWorker(store, perform, opts.log);
  return {
    config: opts.delaying ? { delaying: true, queue: new SqlDelayedJobQueue(worker, opts.afterResponse) } : undefined,
    worker,
  };
}
