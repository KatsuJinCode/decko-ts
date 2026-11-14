// card-mod-delayed_job: the integrate_with_delay stage through the real
// CardActionEngine and the deck's delayed_jobs table.
//
// Proven here:
//   - not delaying (the mod's default config): the follower notice is sent
//     in line and no delayed_jobs row is written;
//   - delaying: the save writes one row per applicable delayed event with
//     delayed_job's column values, sends nothing, and the worker later sends
//     the same notice and deletes the row;
//   - a failing job keeps its row (max_attempts 1, destroy_failed_jobs false)
//     with attempts, last_error and failed_at set and the lock left in place;
//   - the handler is the JobWrapper document and reads back to its job;
//   - each host's after-response hand-off runs the worker.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  seedCard,
  seedStandardDeck,
  type StandardFixture,
} from "../actions/actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import {
  buildFollowNotifyHook,
  CaptureTransport,
  deckEmailTemplateResolver,
  fixedAuthAs,
  fixedFollowerResolver,
  type SavePathIntegrationHook,
} from "../../../src/card/notify/index.js";
import {
  DelayedJobWorker,
  INTEGRATE_WITH_DELAY_JOB_CLASS,
  JOB_WRAPPER_TAG,
  SqlDelayedJobQueue,
  SqlDelayedJobStore,
  buildDelayedJobHandler,
  cloudflareAfterResponse,
  deferredAfterResponse,
  handleDelayedJobQueueBatch,
  parseDelayedJobHandler,
  type AfterResponse,
  type DelayedEventJob,
  type DelayedJobsConfig,
} from "../../../src/card/delayed-job/delayed-job.js";
import type { DelayedJobsRow } from "../../../src/server/schema.js";

const NOW = new Date("2026-10-14T09:30:00.000Z");
const NOW_TS = "2026-10-14 09:30:00";

function followHook(f: StandardFixture): SavePathIntegrationHook {
  return buildFollowNotifyHook({
    followers: fixedFollowerResolver([
      {
        followerId: 12,
        followerName: "Tova",
        followerEmail: "tova@example.com",
        followedSetName: "Watched Card+*followed",
        followOption: "always",
      },
    ]),
    template: deckEmailTemplateResolver(f.storage.engine),
    authAs: fixedAuthAs({ id: 12, name: "Tova", email: "tova@example.com" }),
    defaultFrom: "no-reply@decko.org",
  });
}

async function seedTemplateCards(f: StandardFixture): Promise<void> {
  await seedCard(f.storage, { id: 556, name: "follower notification email", typeId: 2 });
  await seedCard(f.storage, { id: 557, name: "*subject", typeId: 2 });
  await seedCard(f.storage, { id: 558, name: "*text message", typeId: 2 });
  await seedCard(f.storage, { id: 559, name: "*html message", typeId: 2 });
  await seedCard(f.storage, { id: 560, leftId: 556, rightId: 557, typeId: 2, dbContent: "{{followed_set}} on {{follow_option}}" });
  await seedCard(f.storage, { id: 561, leftId: 556, rightId: 558, typeId: 2, dbContent: "Hi! {{follower}} — {{followed_set}} changed." });
  await seedCard(f.storage, { id: 562, leftId: 556, rightId: 559, typeId: 2, dbContent: "" });
}

interface Rig {
  f: StandardFixture;
  transport: CaptureTransport;
  hooks: SavePathIntegrationHook[];
  store: SqlDelayedJobStore;
  worker: DelayedJobWorker;
  deferred: (() => Promise<unknown>)[];
  engine(delayedJobs?: DelayedJobsConfig): CardActionEngine;
  rows(): Promise<DelayedJobsRow[]>;
}

async function rig(perform?: (job: DelayedEventJob) => Promise<void>): Promise<Rig> {
  const storage = await createActionsTestStorage();
  const f = await seedStandardDeck(storage);
  await seedTemplateCards(f);
  const transport = new CaptureTransport();
  const hooks = [followHook(f)];
  const engine = (delayedJobs?: DelayedJobsConfig): CardActionEngine =>
    new CardActionEngine(f.storage.engine, {
      actor: { id: 7, name: "Dana" },
      integrationHooks: hooks,
      notifyTransport: transport,
      ...(delayedJobs === undefined ? {} : { delayedJobs }),
    });
  const store = new SqlDelayedJobStore(f.storage.driver, {
    now: () => NOW,
    workerName: "host:test pid:1",
    newJobId: () => "00000000-0000-4000-8000-000000000000",
  });
  const worker = new DelayedJobWorker(store, perform ?? ((job) => engine().performDelayedJob(job)));
  const deferred: (() => Promise<unknown>)[] = [];
  return {
    f,
    transport,
    hooks,
    store,
    worker,
    deferred,
    engine,
    rows: () => f.storage.selectAll<DelayedJobsRow>("SELECT * FROM delayed_jobs ORDER BY id", []),
  };
}

const collect = (sink: (() => Promise<unknown>)[]): AfterResponse => (run) => {
  sink.push(run);
};

describe("card-mod-delayed_job: integrate_with_delay", () => {
  it("runs the delayed stage in line and writes no row when not delaying", async () => {
    const r = await rig();
    const created = await r.engine().createCard({ name: "Watched Card", content: "first" });
    r.transport.drain();
    await r.engine().updateCard({ cardId: created.cardId, content: "second" });
    expect(r.transport.captured().map((m) => m.subject)).toEqual(["Watched Card+*followed on always"]);
    expect(await r.rows()).toEqual([]);
    r.f.storage.close();
  });

  it("queues one delayed_jobs row per delayed event, then the worker sends and deletes it", async () => {
    const r = await rig();
    const created = await r.engine().createCard({ name: "Watched Card", content: "first" });
    r.transport.drain();
    const queue = new SqlDelayedJobQueue(r.worker, collect(r.deferred));
    await r.engine({ delaying: true, queue }).updateCard({ cardId: created.cardId, content: "second" });

    expect(r.transport.captured()).toEqual([]);
    const rows = await r.rows();
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect({ ...row, id: undefined, handler: undefined }).toEqual({
      id: undefined,
      priority: 20,
      attempts: 0,
      handler: undefined,
      last_error: null,
      run_at: NOW_TS,
      locked_at: null,
      failed_at: null,
      locked_by: null,
      queue: "notify_followers_after_save",
      created_at: NOW_TS,
      updated_at: NOW_TS,
    });
    expect(row.handler.startsWith(`--- ${JOB_WRAPPER_TAG}\njob_data:\n  job_class: ${INTEGRATE_WITH_DELAY_JOB_CLASS}\n`)).toBe(true);
    const job = parseDelayedJobHandler(row.handler);
    expect(job.queue).toBe("notify_followers_after_save");
    expect(job.methodName).toBe("notify_followers_after_save_without_callbacks");
    expect(job.cardId).toBe(created.cardId);
    expect(job.auth).toEqual({ as_id: 7, current_id: 7 });
    expect(job.cardAttribs.action).toBe("update");

    // The host's after-response hand-off runs the worker.
    expect(r.deferred).toHaveLength(1);
    const result = await r.deferred[0]!();
    expect(result).toEqual({ success: 1, failure: 0 });
    const mails = r.transport.captured();
    expect(mails.map((m) => [m.to, m.subject, m.textBody])).toEqual([
      ["tova@example.com", "Watched Card+*followed on always", "Hi! Tova — Watched Card+*followed changed."],
    ]);
    expect(await r.rows()).toEqual([]);
    r.f.storage.close();
  });

  it("keeps a failed job's row with attempts, last_error, failed_at and its lock", async () => {
    const r = await rig(async () => {
      throw new Error("SMTP unreachable");
    });
    const created = await r.engine().createCard({ name: "Watched Card", content: "first" });
    const queue = new SqlDelayedJobQueue(r.worker, collect(r.deferred));
    await r.engine({ delaying: true, queue }).updateCard({ cardId: created.cardId, content: "second" });
    expect(await r.worker.workOff()).toEqual({ success: 0, failure: 1 });
    const [row] = await r.rows();
    expect(row).toMatchObject({
      attempts: 1,
      failed_at: NOW_TS,
      updated_at: NOW_TS,
      locked_at: NOW_TS,
      locked_by: "host:test pid:1",
    });
    expect(row!.last_error!.split("\n")[0]).toBe("SMTP unreachable");
    // A failed row is never reserved again.
    expect(await r.worker.workOff()).toEqual({ success: 0, failure: 0 });
    r.f.storage.close();
  });

  it("fails a job whose event the performing engine does not define", async () => {
    const r = await rig();
    const job: DelayedEventJob = {
      queue: "no_such_event",
      priority: 10,
      actId: 1,
      cardId: 1,
      methodName: "no_such_event_without_callbacks",
      env: { origin: "", html: true, "ajax?": null, "html?": true, ip: null, protocol: null, params: {}, main_name: null, ajax: null, host: null },
      auth: { as_id: null, current_id: 7 },
      cardAttribs: { action: "update", currentActionId: null },
    };
    await r.store.insert(job);
    expect(await r.worker.workOff()).toEqual({ success: 0, failure: 1 });
    const [row] = await r.rows();
    expect(row!.last_error!.split("\n")[0]).toBe("undefined method 'no_such_event_without_callbacks' for an instance of Card");
    r.f.storage.close();
  });

  it("orders reservation by priority, then run_at", async () => {
    const r = await rig();
    const seen: string[] = [];
    const worker = new DelayedJobWorker(r.store, async (job) => {
      seen.push(job.queue);
    });
    const base: Omit<DelayedEventJob, "queue" | "priority"> = {
      actId: null,
      cardId: 1,
      methodName: "x_without_callbacks",
      env: { origin: "", html: true, "ajax?": null, "html?": true, ip: null, protocol: null, params: {}, main_name: null, ajax: null, host: null },
      auth: { as_id: null, current_id: 7 },
      cardAttribs: { action: "update", currentActionId: null },
    };
    await r.store.insert({ ...base, queue: "late", priority: 100 });
    await r.store.insert({ ...base, queue: "early", priority: 10 });
    await worker.workOff();
    expect(seen).toEqual(["early", "late"]);
    r.f.storage.close();
  });
});

describe("delayed_jobs handler", () => {
  // Captured from the Ruby oracle app (card 1.110.0, card-mod-delayed_job
  // 0.20.0, config.delaying = true): Ada Admin updates a card Mira Member
  // follows. Two Ruby runs on the same deck differ only in job_id,
  // enqueued_at, run_at, created_at and updated_at.
  const ruby = JSON.parse(
    readFileSync(fileURLToPath(new URL("./fixtures/ruby-oracle-notify-row.json", import.meta.url)), "utf8"),
  ) as DelayedJobsRow;

  it("matches the Ruby oracle's handler byte for byte, given Ruby's job_id and enqueue time", () => {
    const job = parseDelayedJobHandler(ruby.handler);
    expect(job).toEqual({
      queue: "notify_followers_after_save",
      priority: 20,
      actId: 105617,
      cardId: 911,
      cardAttribs: { action: "update", currentActionId: 1001 },
      env: {
        origin: "",
        html: true,
        "ajax?": null,
        "html?": true,
        ip: null,
        protocol: null,
        params: {},
        main_name: null,
        ajax: null,
        host: null,
      },
      auth: { as_id: 611, current_id: 611 },
      methodName: "notify_followers_after_save_without_callbacks",
    });
    const jobId = /^  job_id: (.*)$/m.exec(ruby.handler)![1]!;
    // Ruby's enqueued_at carries sub-millisecond digits a JavaScript Date
    // cannot hold; the instant is otherwise the same.
    const enqueuedRuby = /^  enqueued_at: '(.*)'$/m.exec(ruby.handler)![1]!;
    const port = buildDelayedJobHandler(job, {
      jobId,
      enqueuedAt: new Date(enqueuedRuby),
      globalIdApp: "reference-oracle",
    });
    const mask = (h: string): string => h.replace(/^  enqueued_at: .*$/m, "  enqueued_at: <instant>");
    expect(mask(port)).toBe(mask(ruby.handler));
    expect(port).toContain(`  enqueued_at: '${enqueuedRuby.slice(0, 23)}000000Z'`);
  });

  it("writes the Ruby oracle's column values for the row", async () => {
    const storage = await createActionsTestStorage();
    const job = parseDelayedJobHandler(ruby.handler);
    const at = new Date("2026-10-14T21:12:40.990Z");
    const store = new SqlDelayedJobStore(storage.driver, {
      now: () => at,
      newJobId: () => /^  job_id: (.*)$/m.exec(ruby.handler)![1]!,
      globalIdApp: "reference-oracle",
    });
    await store.insert(job);
    const [row] = await storage.selectAll<DelayedJobsRow>("SELECT * FROM delayed_jobs", []);
    const runToRun = ["id", "handler", "run_at", "created_at", "updated_at"] as const;
    const stable = (r: DelayedJobsRow): Partial<DelayedJobsRow> =>
      Object.fromEntries(Object.entries(r).filter(([k]) => !(runToRun as readonly string[]).includes(k)));
    expect(stable(row!)).toEqual(stable(ruby));
    storage.close();
  });

  it("refuses a handler that is not an IntegrateWithDelayJob", () => {
    expect(() => parseDelayedJobHandler("--- !ruby/object:Something\n")).toThrow(/Job failed to load/);
  });
});

describe("host hand-off", () => {
  it("Cloudflare sends a Queues message when bound, else keeps the worker alive with waitUntil", async () => {
    const kept: Promise<unknown>[] = [];
    const sent: unknown[] = [];
    let ran = 0;
    const run = async (): Promise<void> => {
      ran++;
    };
    cloudflareAfterResponse({ waitUntil: (p) => kept.push(p) }, { send: async (b) => void sent.push(b) })(run);
    await Promise.all(kept);
    expect(sent).toEqual([{ kind: "delayed_job" }]);
    expect(ran).toBe(0);
    cloudflareAfterResponse({ waitUntil: (p) => kept.push(p) })(run);
    await Promise.all(kept);
    expect(ran).toBe(1);
  });

  it("the Queues consumer works the table off and acks the batch", async () => {
    const r = await rig();
    let acked = 0;
    const result = await handleDelayedJobQueueBatch({ messages: [{ ack: () => void acked++ }] }, r.worker);
    expect(result).toEqual({ success: 0, failure: 0 });
    expect(acked).toBe(1);
    r.f.storage.close();
  });

  it("Bunny hands the worker pass to its deferred-execution primitive", async () => {
    const deferred: Promise<unknown>[] = [];
    let ran = 0;
    deferredAfterResponse((p) => deferred.push(p))(async () => {
      ran++;
    });
    await Promise.all(deferred);
    expect(ran).toBe(1);
  });
});
