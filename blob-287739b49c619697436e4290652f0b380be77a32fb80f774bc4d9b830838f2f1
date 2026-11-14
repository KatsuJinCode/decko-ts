# Delayed jobs (card-mod-delayed_job)

Ruby Decko runs card events declared at the `integrate_with_delay` stage
after the act is complete. With card-mod-delayed_job and
`config.delaying = true`, each such event becomes an ActiveJob
(`Card::Set::Event::DelayedEvent::IntegrateWithDelayJob`) stored as a row in
the `delayed_jobs` table and performed by a separate worker after the
response has been sent. With the mod's default `config.delaying = false`,
the same events run in line during the request and no row is written.

The port lives in `src/card/delayed-job/delayed-job.ts`; the engine side is
`CardActionEngine`'s `delayedJobs` option and `performDelayedJob` method.

## Behaviour

| Ruby | Port |
|------|------|
| `Cardio.config.delaying` (default false) | `delayedJobs.delaying`; omitted means false |
| event conditions (`when:`) evaluated at scheduling time | the hook's `notable` is evaluated when the job is enqueued |
| `set_delayed_job_args`: queue = event name, priority = event priority (default 10; `notify_followers_after_save` declares 20) | `queue` = the hook's `event` name, `priority` = the hook's `priority` or 10 |
| `perform_delayed_job_args`: act id, card, card attributes, `Env.serialize`, `Auth.serialize`, `<event>_without_callbacks` | the same six arguments, in order |
| `Delayed::Job.enqueue`: one INSERT, `run_at` = now, attempts 0, lock columns NULL | `SqlDelayedJobStore.insert` |
| `find_available` + `lock_exclusively!`: ready, unlocked or lock older than `max_run_time` (4 h), not failed; ordered by priority, then `run_at`; lock without touching `updated_at` | `SqlDelayedJobStore.reserve` |
| success: `job.destroy` | row deleted |
| failure with `max_attempts = 1`, `destroy_failed_jobs = false`: attempts 1, `last_error` = message and backtrace, `failed_at` = now, lock columns left as they were | `SqlDelayedJobStore.fail` |
| `IntegrateWithDelayJob#perform` re-raises after reporting | `performDelayedJob` throws; an unknown event fails like Ruby's `NoMethodError` |

The follower notice (card-mod-follow `notify_followers_after_save`) is the
delayed event the port's save path carries; its job sends the same mail the
in-line run sends.

## The handler column

`delayed_jobs.handler` is the YAML document delayed_job writes for
`JobWrapper.new(job.serialize)`: the `!ruby/object:...JobWrapper` tag, then
`job_data` with `job_class`, `job_id`, `provider_job_id`, `queue_name`,
`priority`, `arguments`, `executions`, `exception_executions`, `locale`,
`timezone`, `enqueued_at` (nanosecond ISO 8601) and `scheduled_at`. Hashes
carry ActiveJob's `_aj_symbol_keys` and the card patch's `_aj_integer_keys`;
the card is a GlobalID (`gid://<app>/Card/<id>`, app configurable, default
`decko`).

The port writes it the way Psych does (block style, Ruby's quoting, the
card's action-specific attributes and `Card::Env`'s readers in Ruby's
order). On perform, the act is read back from `card_acts` and
`card_actions` by its id, as Ruby's `Act.find` does.

Checked against the Ruby oracle app (`reference-harness/oracle/app`,
`config.delaying = true`, `active_job.queue_adapter = :delayed_job`) on
2026-10-14: an update by a signed-in user to a followed card on the
synthetic-v1 deck. Two Ruby runs on the same deck differ only in
`job_id`, `enqueued_at`, `run_at`, `created_at` and `updated_at`. The
port's handler equals Ruby's byte for byte once those two handler fields
are given Ruby's values, except that `enqueued_at` carries the instant at
millisecond precision followed by zeros (a JavaScript Date holds no finer
time); the other columns equal Ruby's. The captured row is
`tests/card/delayed-job/fixtures/ruby-oracle-notify-row.json`. Ruby writes
`run_at` a few microseconds before `created_at`; the port writes one
instant to both.


## Hosts

Each host gives `SqlDelayedJobQueue` an `AfterResponse` function that runs
the worker once the response is on its way. The row is always written in the
request, so a lost hand-off only delays the job to the next worker pass.

- **Node**: `nodeAfterResponse()` runs a work-off pass on a later turn of the
  event loop. `DelayedJobWorker.start(pollIntervalMs)` is the in-process
  equivalent of `script/delayed_job start` (unref'd timer, default 5 s like
  `Delayed::Worker.sleep_delay`).
- **Cloudflare**: `cloudflareAfterResponse(ctx, queue?)`. With a Queues
  producer binding the request sends a message and the consumer calls
  `handleDelayedJobQueueBatch(batch, worker)`; without one, `ctx.waitUntil`
  keeps the isolate alive while the worker runs. Rows live in D1.
- **Bunny**: `deferredAfterResponse(defer)` hands the pass to the host's
  deferred-execution primitive.

A host enables delaying by passing `delayedJobs: { delaying: true, queue }`
in `WriteRouteContext`. The worker's performer is an engine for the job's
actor (`auth.current_id`) with the host's integration hooks and transport,
calling `engine.performDelayedJob(job)`.

## Not covered

- The worker's mail after the job has not been compared with the oracle:
  the oracle probe's work-off ran the job without error but delivered no
  mail, and why has not been established.
- The deployed hosts' configuration does not yet turn delaying on.
- `DelayedJobWeb` (the `/*admin/delayed_job` inspection UI) is not ported.
- Mod-manifest events declared at `integrate_with_delay` (for example
  carrierwave's `clear_draft_files`) run through the mod-event dispatch, not
  this queue.

## Tests

`tests/card/delayed-job/delayed-job.test.ts`: in-line run with no row when
not delaying; one row with delayed_job's column values when delaying, then
the worker sends the same mail and deletes the row; the failed-row state;
an unknown event; reservation order; the handler document and its round
trip; the Cloudflare, Queues-consumer and Bunny hand-offs.
