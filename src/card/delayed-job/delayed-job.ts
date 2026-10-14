// card-mod-delayed_job 0.20.0 + the integrate_with_delay half of card 1.110.0.
//
// Ruby sources ported here:
//   card-mod-delayed_job lib/card/mod/delayed_job.rb     config.delaying = false,
//                                                         active_job.queue_adapter = :delayed_job
//   card-mod-delayed_job config/late/delayed_job_config.rb
//                                                         Delayed::Worker.max_attempts = 1,
//                                                         destroy_failed_jobs = false,
//                                                         delay_jobs = Cardio.config.delaying
//   card lib/card/set/event/delayed_event.rb              IntegrateWithDelayJob, queue = event name,
//                                                         priority = event priority (default 10),
//                                                         perform(act_id, card, card_attribs, env,
//                                                                 auth, method_name)
//   card lib/card/director/event_delay.rb                 contextualize_delayed_event
//   card config/initializers/02_patches/active_job.rb     _aj_integer_keys on every hash
//   activejob 7.2 queue_adapters/delayed_job_adapter.rb   JobWrapper(job.serialize)
//   delayed_job 4.2.0 backend/base.rb + worker.rb         enqueue / reserve / run / reschedule / failed
//   delayed_job_active_record 4.1 backend/active_record.rb
//                                                         find_available ordering, locking
//
// The engine decides WHEN a job exists (card-action-engine.ts: an
// integrate_with_delay hook while delaying). This module owns the row: what
// one delayed_jobs row holds, how a worker reserves, runs and retires it, and
// how each host gets the worker to run after the response has been sent.

import type { SQLDatabaseDriver } from "../../server/driver.js";
import type { DelayedJobsRow, SQLDateTime } from "../../server/schema.js";
import { sqlDateTime } from "../history/act.js";

/** ActiveJob's job class for every delayed card event (delayed_event.rb:57). */
export const INTEGRATE_WITH_DELAY_JOB_CLASS = "Card::Set::Event::DelayedEvent::IntegrateWithDelayJob";
/** The YAML tag delayed_job writes for an ActiveJob payload (JobWrapper#to_yaml). */
export const JOB_WRAPPER_TAG = "!ruby/object:ActiveJob::QueueAdapters::DelayedJobAdapter::JobWrapper";
/** DelayedEvent#priority's default (delayed_event.rb:21-23); an event
 *  declared with priority: overrides it (notify_followers_after_save: 20). */
export const DEFAULT_DELAYED_EVENT_PRIORITY = 10;
/** Delayed::Worker.max_attempts as card-mod-delayed_job sets it. */
export const DELAYED_JOB_MAX_ATTEMPTS = 1;
/** Delayed::Worker.max_run_time default (worker.rb DEFAULT_MAX_RUN_TIME). */
export const DELAYED_JOB_MAX_RUN_TIME_MS = 4 * 60 * 60 * 1000;
/** Delayed::Worker.read_ahead default: rows find_available returns per reserve. */
const READ_AHEAD = 5;

/** Card::Env.serialize: every Card::Env::Serializable instance method, in
 *  the order Ruby's instance_methods lists them (oracle capture). */
export interface DelayedJobEnv {
  origin: string;
  html: boolean;
  "ajax?": boolean | null;
  "html?": boolean;
  ip: string | null;
  protocol: string | null;
  params: Record<string, unknown>;
  main_name: string | null;
  ajax: boolean | null;
  host: string | null;
}

/** Card::Auth.serialize (auth.rb:40-42). */
export interface DelayedJobAuth {
  as_id: number | null;
  current_id: number | null;
}

/** The card's serialize_for_active_job values the port tracks: the action
 *  verb (a Symbol) and the current action (a GlobalID). Every other
 *  action-specific attribute is nil or an empty hash at this stage. */
export interface DelayedJobCardAttribs {
  action: "create" | "update" | "delete";
  currentActionId: number | null;
}

/** Everything one IntegrateWithDelayJob carries: its perform arguments plus
 *  the queue options set_delayed_job_args gives it. */
export interface DelayedEventJob {
  /** event.name (set_delayed_job_args). */
  readonly queue: string;
  /** event.priority. */
  readonly priority: number;
  /** Card::Director.act&.id. */
  readonly actId: number | null;
  /** The card the event belongs to (serialized by GlobalID). */
  readonly cardId: number;
  readonly cardAttribs: DelayedJobCardAttribs;
  readonly env: DelayedJobEnv;
  readonly auth: DelayedJobAuth;
  /** event.simple_method_name: "<event>_without_callbacks". */
  readonly methodName: string;
}

/** Where the engine puts a delayed event (Cardio.config.delaying = true). */
export interface DelayedJobQueue {
  enqueue(job: DelayedEventJob): Promise<void>;
}

// ---------------------------------------------------------------------------
// The handler column
// ---------------------------------------------------------------------------

type Yaml = null | boolean | number | string | Yaml[] | { [key: string]: Yaml };

/** One YAML scalar as Psych writes it. */
function yamlScalar(value: null | boolean | number | string): string {
  if (value === null) return "";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  // Psych single-quotes strings that would otherwise load as another type
  // (numbers, booleans, null, timestamps), empty strings, and strings with
  // YAML indicators.
  const otherType =
    value === "" ||
    /^[-+]?(\d[\d_]*(\.\d*)?([eE][-+]?\d+)?|\.\d+|0x[\da-fA-F]+)$/.test(value) ||
    /^\d{4}-\d\d?-\d\d?([Tt ]|$)/.test(value) ||
    /^(true|false|null|yes|no|on|off|y|n|~)$/i.test(value);
  if (!otherType && /^[\w./:?-]+$/.test(value) && !/^[-?:]/.test(value)) return value;
  return `'${value.replace(/'/g, "''")}'`;
}

function isScalar(v: Yaml): v is null | boolean | number | string {
  return v === null || typeof v !== "object";
}

/** Psych's block style: mappings indent by two, a sequence sits at its
 *  key's indent, a mapping item starts on its "- " line. */
function yamlMapping(obj: { [key: string]: Yaml }, indent: number): string[] {
  const pad = " ".repeat(indent);
  const lines: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (isScalar(v)) {
      const s = yamlScalar(v);
      lines.push(s === "" ? `${pad}${k}:` : `${pad}${k}: ${s}`);
    } else if (Array.isArray(v)) {
      if (v.length === 0) lines.push(`${pad}${k}: []`);
      else lines.push(`${pad}${k}:`, ...yamlSequence(v, indent));
    } else if (Object.keys(v).length === 0) {
      lines.push(`${pad}${k}: {}`);
    } else {
      lines.push(`${pad}${k}:`, ...yamlMapping(v, indent + 2));
    }
  }
  return lines;
}

function yamlSequence(items: Yaml[], indent: number): string[] {
  const pad = " ".repeat(indent);
  const lines: string[] = [];
  for (const item of items) {
    if (isScalar(item)) {
      const s = yamlScalar(item);
      lines.push(s === "" ? `${pad}-` : `${pad}- ${s}`);
    } else if (Array.isArray(item)) {
      const inner = yamlSequence(item, indent + 2);
      lines.push(`${pad}- ${(inner[0] ?? "").trimStart()}`, ...inner.slice(1));
    } else {
      const inner = yamlMapping(item, indent + 2);
      lines.push(`${pad}- ${(inner[0] ?? "").trimStart()}`, ...inner.slice(1));
    }
  }
  return lines;
}

/** ActiveJob's hash serialization with the card patch: string keys, the
 *  symbol keys listed under _aj_symbol_keys, then _aj_integer_keys. */
function ajSymbolHash(hash: { [key: string]: Yaml }): { [key: string]: Yaml } {
  return { ...hash, _aj_symbol_keys: Object.keys(hash), _aj_integer_keys: [] };
}

/** The action-specific attributes Card#serialize_for_active_job writes, in
 *  the order the oracle capture shows (card 1.110.0 + card-mod-carrierwave's
 *  duplicate_file). */
function cardAttribsYaml(attribs: DelayedJobCardAttribs, app: string): { [key: string]: Yaml } {
  return ajSymbolHash({
    action: { _aj_value_key: attribs.action, _aj_class_name_key: "Symbol" },
    current_action:
      attribs.currentActionId === null ? null : { _aj_globalid: `gid://${app}/Card::Action/${attribs.currentActionId}` },
    last_action_id_before_edit: null,
    comment: null,
    silent_change: null,
    skip: null,
    skip_in_action: null,
    trigger: null,
    trigger_in_action: null,
    skip_hash: ajSymbolHash({}),
    full_skip_hash: ajSymbolHash({}),
    trigger_hash: null,
    full_trigger_hash: null,
    duplicate_file: null,
  });
}

export interface HandlerOptions {
  /** ActiveJob's job_id (SecureRandom.uuid). */
  jobId: string;
  /** Time.now.utc at enqueue. */
  enqueuedAt: Date;
  /** GlobalID.app: the Rails application name, dasherized ("reference-oracle"
   *  for the oracle app's ReferenceOracle). */
  globalIdApp?: string;
}

/** The delayed_jobs.handler text for one job: the YAML document Psych writes
 *  for JobWrapper.new(job.serialize) (activejob 7.2 core.rb#serialize). */
export function buildDelayedJobHandler(job: DelayedEventJob, opts: HandlerOptions): string {
  const app = opts.globalIdApp ?? "decko";
  const env = job.env;
  const args: Yaml[] = [
    job.actId,
    { _aj_globalid: `gid://${app}/Card/${job.cardId}` },
    cardAttribsYaml(job.cardAttribs, app),
    ajSymbolHash({
      origin: env.origin,
      html: env.html,
      "ajax?": env["ajax?"],
      "html?": env["html?"],
      ip: env.ip,
      protocol: env.protocol,
      params: ajSymbolHash(env.params as { [key: string]: Yaml }),
      main_name: env.main_name,
      ajax: env.ajax,
      host: env.host,
    }),
    ajSymbolHash({ as_id: job.auth.as_id, current_id: job.auth.current_id }),
    job.methodName,
  ];
  // iso8601(9): nanosecond fraction.
  const ms = String(opts.enqueuedAt.getUTCMilliseconds()).padStart(3, "0");
  const enqueued = `${opts.enqueuedAt.toISOString().slice(0, 19)}.${ms}000000Z`;
  const doc: { [key: string]: Yaml } = {
    job_data: {
      job_class: INTEGRATE_WITH_DELAY_JOB_CLASS,
      job_id: opts.jobId,
      provider_job_id: null,
      queue_name: job.queue,
      priority: job.priority,
      arguments: args,
      executions: 0,
      exception_executions: {},
      locale: "en",
      timezone: "UTC",
      enqueued_at: enqueued,
      scheduled_at: null,
    },
  };
  return [`--- ${JOB_WRAPPER_TAG}`, ...yamlMapping(doc, 0), ""].join("\n");
}

/** Read a handler in Ruby's IntegrateWithDelayJob shape (written by Ruby or
 *  by buildDelayedJobHandler) back into its job. Request params are not
 *  read back; no delayed event the port runs consults them. Throws
 *  DelayedJobDeserializationError (delayed_job's DeserializationError) when
 *  the text is not such a handler. */
export function parseDelayedJobHandler(handler: string): DelayedEventJob {
  const one = (re: RegExp, text: string = handler): string | undefined => {
    const m = re.exec(text);
    if (m === null) return undefined;
    const raw = (m[1] ?? "").trim();
    return raw.startsWith("'") ? raw.slice(1, -1).replace(/''/g, "'") : raw;
  };
  const fail = (why: string): never => {
    throw new DelayedJobDeserializationError(`Job failed to load: ${why}`);
  };
  if (!handler.startsWith(`--- ${JOB_WRAPPER_TAG}`) || one(/^  job_class: (.*)$/m) !== INTEGRATE_WITH_DELAY_JOB_CLASS) {
    fail("not an IntegrateWithDelayJob handler");
  }
  const argsAt = handler.indexOf("\n  arguments:\n");
  if (argsAt < 0) fail("no arguments");
  const args = handler.slice(argsAt);
  const nullable = (v: string | undefined): string | null => (v === undefined || v === "" ? null : v);
  const num = (v: string | undefined): number | null => (nullable(v) === null ? null : Number(v));
  const bool = (v: string | undefined): boolean | null => (nullable(v) === null ? null : v === "true");
  const cardGid = one(/^  - _aj_globalid: gid:\/\/[^/]+\/Card\/(\d+)$/m, args) ?? fail("no card GlobalID");
  const actionId = one(/^      _aj_globalid: gid:\/\/[^/]+\/Card::Action\/(\d+)$/m, args);
  return {
    queue: one(/^  queue_name: (.*)$/m) ?? "",
    priority: Number(one(/^  priority: (.*)$/m)),
    actId: num(one(/^  arguments:\n  -(.*)$/m)),
    cardId: Number(cardGid),
    cardAttribs: {
      action: (one(/^      _aj_value_key: (\w+)$/m, args) ?? "update") as DelayedJobCardAttribs["action"],
      currentActionId: num(actionId),
    },
    env: {
      origin: one(/^  - origin:(.*)$/m, args) ?? "",
      html: bool(one(/^    html:(.*)$/m, args)) ?? true,
      "ajax?": bool(one(/^    ajax\?:(.*)$/m, args)),
      "html?": bool(one(/^    html\?:(.*)$/m, args)) ?? true,
      ip: nullable(one(/^    ip:(.*)$/m, args)),
      protocol: nullable(one(/^    protocol:(.*)$/m, args)),
      params: {},
      main_name: nullable(one(/^    main_name:(.*)$/m, args)),
      ajax: bool(one(/^    ajax:(.*)$/m, args)),
      host: nullable(one(/^    host:(.*)$/m, args)),
    },
    auth: {
      as_id: num(one(/^  - as_id:(.*)$/m, args)),
      current_id: num(one(/^    current_id:(.*)$/m, args)),
    },
    methodName: one(/^  - (\w+_without_callbacks)$/m, args) ?? fail("no method name"),
  };
}

export class DelayedJobDeserializationError extends Error {
  override readonly name = "Delayed::DeserializationError";
}

// ---------------------------------------------------------------------------
// The delayed_jobs table
// ---------------------------------------------------------------------------

export interface DelayedJobStoreOptions {
  /** Delayed::Job.db_time_now. */
  now?: () => Date;
  /** Delayed::Worker#name: "host:<hostname> pid:<pid>" in Ruby. */
  workerName?: string;
  /** SecureRandom.uuid for ActiveJob's job_id. */
  newJobId?: () => string;
  globalIdApp?: string;
}

function randomUuid(): string {
  return globalThis.crypto.randomUUID();
}

/** The delayed_jobs table through the deck's own driver: the same rows
 *  delayed_job_active_record writes, so a Ruby worker and this one can share
 *  a deck. */
export class SqlDelayedJobStore {
  readonly workerName: string;
  private readonly now: () => Date;
  private readonly newJobId: () => string;
  private readonly globalIdApp: string | undefined;

  constructor(
    private readonly driver: SQLDatabaseDriver,
    opts: DelayedJobStoreOptions = {},
  ) {
    this.now = opts.now ?? (() => new Date());
    this.workerName = opts.workerName ?? "pid:0";
    this.newJobId = opts.newJobId ?? randomUuid;
    this.globalIdApp = opts.globalIdApp;
  }

  /** Delayed::Job.enqueue with delay_jobs on: one INSERT; run_at defaults to
   *  db_time_now (set_default_run_at), attempts 0, every lock column NULL. */
  async insert(job: DelayedEventJob): Promise<number> {
    const now = this.now();
    const ts = sqlDateTime(now);
    const handler = buildDelayedJobHandler(job, {
      jobId: this.newJobId(),
      enqueuedAt: now,
      ...(this.globalIdApp === undefined ? {} : { globalIdApp: this.globalIdApp }),
    });
    const r = await this.driver.query(
      `INSERT INTO delayed_jobs (priority, attempts, handler, last_error, run_at, locked_at, failed_at, locked_by, queue, created_at, updated_at)
       VALUES (?, 0, ?, NULL, ?, NULL, NULL, NULL, ?, ?, ?)`,
      [job.priority, handler, ts, job.queue, ts, ts],
    );
    return Number(r.lastInsertRowId);
  }

  /** Delayed::Backend::ActiveRecord::Job.reserve: find_available (ready to
   *  run, unlocked or lock expired or locked by this worker, not failed;
   *  priority then run_at order), then lock one row exclusively. */
  async reserve(): Promise<DelayedJobsRow | null> {
    const now = this.now();
    const nowTs = sqlDateTime(now);
    const expired = sqlDateTime(new Date(now.getTime() - DELAYED_JOB_MAX_RUN_TIME_MS));
    const { rows } = await this.driver.query<DelayedJobsRow>(
      `SELECT * FROM delayed_jobs
        WHERE ((run_at <= ? AND (locked_at IS NULL OR locked_at < ?)) OR locked_by = ?)
          AND failed_at IS NULL
        ORDER BY priority ASC, run_at ASC
        LIMIT ${READ_AHEAD}`,
      [nowTs, expired, this.workerName],
    );
    for (const row of rows) {
      // lock_exclusively!: update_all (no updated_at touch).
      const r = await this.driver.query(
        `UPDATE delayed_jobs SET locked_at = ?, locked_by = ?
          WHERE id = ? AND (locked_at IS NULL OR locked_at < ? OR locked_by = ?) AND run_at <= ?`,
        [nowTs, this.workerName, row.id, expired, this.workerName, nowTs],
      );
      if (r.rowsAffected === 1) return { ...row, locked_at: nowTs, locked_by: this.workerName };
    }
    return null;
  }

  /** Worker#run success: job.destroy. */
  async destroy(id: number): Promise<void> {
    await this.driver.query(`DELETE FROM delayed_jobs WHERE id = ?`, [id]);
  }

  /** Worker#handle_failed_job -> reschedule -> failed -> fail! with
   *  max_attempts 1 and destroy_failed_jobs false: attempts 1, last_error
   *  "message\nbacktrace", failed_at now; the lock columns stay as they were. */
  async fail(row: DelayedJobsRow, error: unknown): Promise<void> {
    const ts = sqlDateTime(this.now());
    const attempts = row.attempts + 1;
    const lastError = errorText(error);
    if (attempts < DELAYED_JOB_MAX_ATTEMPTS) {
      // Unreachable with card-mod-delayed_job's max_attempts; kept so the
      // reschedule arm reads like worker.rb if the setting is ever lifted.
      await this.driver.query(
        `UPDATE delayed_jobs SET attempts = ?, last_error = ?, locked_at = NULL, locked_by = NULL, updated_at = ? WHERE id = ?`,
        [attempts, lastError, ts, row.id],
      );
      return;
    }
    await this.driver.query(
      `UPDATE delayed_jobs SET attempts = ?, last_error = ?, failed_at = ?, updated_at = ? WHERE id = ?`,
      [attempts, lastError, ts, ts, row.id],
    );
  }
}

/** Delayed::Backend::Base#error=: "#{message}\n#{backtrace.join("\n")}". */
function errorText(error: unknown): string {
  if (error instanceof Error) {
    const frames = (error.stack ?? "").split("\n").slice(1).map((l) => l.trim());
    return `${error.message}\n${frames.join("\n")}`;
  }
  return `${String(error)}\n`;
}

// ---------------------------------------------------------------------------
// The worker
// ---------------------------------------------------------------------------

/** Performs one job (IntegrateWithDelayJob#perform). Throwing marks the row failed. */
export type DelayedJobPerformer = (job: DelayedEventJob) => Promise<void>;

export interface WorkOffResult {
  success: number;
  failure: number;
}

/** Delayed::Worker: reserves and runs rows until none is ready. */
export class DelayedJobWorker {
  private running: Promise<WorkOffResult> | null = null;
  private again = false;

  constructor(
    readonly store: SqlDelayedJobStore,
    private readonly perform: DelayedJobPerformer,
    private readonly log: (line: string) => void = () => {},
  ) {}

  /** Worker#work_off(num): run up to `max` jobs. Calls made while a pass is
   *  running join it and trigger one more pass, so no enqueued row is missed. */
  workOff(max = 100): Promise<WorkOffResult> {
    if (this.running !== null) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      const total: WorkOffResult = { success: 0, failure: 0 };
      try {
        do {
          this.again = false;
          for (let i = 0; i < max; i++) {
            const row = await this.store.reserve();
            if (row === null) break;
            if (await this.runRow(row)) total.success++;
            else total.failure++;
          }
        } while (this.again);
      } finally {
        this.running = null;
      }
      return total;
    })();
    return this.running;
  }

  /** Worker#run. */
  private async runRow(row: DelayedJobsRow): Promise<boolean> {
    let job: DelayedEventJob;
    try {
      job = parseDelayedJobHandler(row.handler);
    } catch (error) {
      this.log(`Job (id=${row.id}) FAILED permanently with ${(error as Error).name}: ${(error as Error).message}`);
      await this.store.fail(row, error);
      return false;
    }
    const name = `${INTEGRATE_WITH_DELAY_JOB_CLASS} from DelayedJob(${row.queue ?? ""})`;
    try {
      this.log(`Job ${name} (id=${row.id}) RUNNING`);
      await this.perform(job);
      await this.store.destroy(row.id);
      this.log(`Job ${name} (id=${row.id}) COMPLETED`);
      return true;
    } catch (error) {
      this.log(`Job ${name} (id=${row.id}) FAILED (${row.attempts} prior attempts) with ${(error as Error)?.name}: ${(error as Error)?.message}`);
      await this.store.fail(row, error);
      return false;
    }
  }

  /** The Node host's in-process worker (script/delayed_job's loop, inside the
   *  server process): polls every `pollIntervalMs` (Delayed::Worker.sleep_delay
   *  default 5 s) on an unref'd timer. Returns the stop function. */
  start(pollIntervalMs = 5000): () => void {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = (): void => {
      if (stopped) return;
      void this.workOff().finally(() => {
        if (stopped) return;
        timer = setTimeout(tick, pollIntervalMs);
        (timer as { unref?: () => void }).unref?.();
      });
    };
    tick();
    return () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }
}

// ---------------------------------------------------------------------------
// The queue each host hands the engine
// ---------------------------------------------------------------------------

/** How a host gets work to run after the response: Node defers to the next
 *  turn of its event loop, Cloudflare to a Queue message or ctx.waitUntil,
 *  Bunny to its deferred-execution primitive. */
export type AfterResponse = (run: () => Promise<unknown>) => void;

/** The delayed_jobs-backed queue: insert the row (the act's own request),
 *  then ask the host to run the worker after the response. */
export class SqlDelayedJobQueue implements DelayedJobQueue {
  constructor(
    private readonly worker: DelayedJobWorker,
    private readonly afterResponse: AfterResponse,
  ) {}

  async enqueue(job: DelayedEventJob): Promise<void> {
    await this.worker.store.insert(job);
    this.afterResponse(() => this.worker.workOff());
  }
}

/** Node: run on a later turn of the event loop, after the response is written. */
export function nodeAfterResponse(log: (line: string) => void = () => {}): AfterResponse {
  return (run) => {
    setImmediate(() => {
      run().catch((e: unknown) => log(`delayed_job worker pass failed: ${String(e)}`));
    });
  };
}

/** Cloudflare Queues producer binding (the subset used). */
export interface QueueProducer {
  send(body: unknown): Promise<void>;
}

/** The ExecutionContext subset the fallback uses. */
export interface WaitUntilContext {
  waitUntil(promise: Promise<unknown>): void;
}

/** Cloudflare: with a Queues binding, a message tells the consumer to work the
 *  table off (handleDelayedJobQueueBatch); without one, ctx.waitUntil keeps the
 *  isolate alive after the response while the worker runs. Either way the row
 *  in D1 is the job, so a lost message only delays it to the next pass. */
export function cloudflareAfterResponse(ctx: WaitUntilContext, queue?: QueueProducer): AfterResponse {
  return (run) => {
    if (queue !== undefined) {
      ctx.waitUntil(queue.send({ kind: "delayed_job" }));
      return;
    }
    ctx.waitUntil(run());
  };
}

/** The Cloudflare Queues consumer: one work_off pass per batch, then ack. */
export async function handleDelayedJobQueueBatch(
  batch: { messages: readonly { ack(): void }[] },
  worker: DelayedJobWorker,
): Promise<WorkOffResult> {
  const result = await worker.workOff();
  for (const m of batch.messages) m.ack();
  return result;
}

/** Bunny Edge Scripting: the host passes its deferred-execution primitive
 *  (the promise it keeps alive past the response). */
export function deferredAfterResponse(defer: (promise: Promise<unknown>) => void): AfterResponse {
  return (run) => defer(run());
}

/** Cardio.config.delaying for the engine: off (Ruby's default — the stage
 *  runs in line and no row is written) unless a host turns it on. */
export interface DelayedJobsConfig {
  readonly delaying: boolean;
  readonly queue: DelayedJobQueue;
}

export type { SQLDateTime };
