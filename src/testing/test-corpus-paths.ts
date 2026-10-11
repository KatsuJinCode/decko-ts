// Shared path resolution for the committed miniature test corpus
// (fixtures/test-corpus/ — see its README-self-contained-test-fixtures.md).
//
// Resolution:
// - default: the COMMITTED miniatures — every clone, every machine, no
//   private data involved. This is the contract:
//   `npm test` must run from these bytes alone.
// - DECKO_TS_CORPUS_V2=<path>: explicit opt-in to the richer machine-local
//   corpus (bench-corpus-v2) + the private shard pair. Never assumed, never
//   probed by presence — private data participates only when asked for.
//
// Consumers: tests/card/render/permission-corpus-seeding.ts,
// tests/card/render/structure-corpus-seeding.ts, the corpus-replay tests
// with their own path constants, and the auth fixtures.

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const FIXTURE_CORPUS_DIR = path.join(REPO_ROOT, "fixtures", "test-corpus");
const PRIVATE_SHARD_DIR = path.join(REPO_ROOT, "fixtures", "corpus");

// The OTHER private corpus leg: tmp/raw-ground-truth/, machine-local and
// gitignored. It is NOT the fixtures/ leg and is not interchangeable with it —
// raw-corpus-seeding.ts's header says so explicitly, because seeding from the
// sanitized corpus silently invalidates a raw-capture comparison. It holds the
// dump the oracle's expected-v2 captures rendered from, plus those captures'
// view-surface shards.
const RAW_CORPUS_DIR = path.join(REPO_ROOT, "tmp", "raw-ground-truth");
export { RAW_CORPUS_DIR };

/** The raw ground-truth deck: the db the oracle's expected-v2 captures rendered from. */
export const RAW_CORPUS_DB_PATH = path.join(RAW_CORPUS_DIR, "bench-corpus-raw.sqlite3");

/**
 * The oracle's `expected-v2/view-surface` shards — the per-card `views.content` /
 * `views.open` yardstick the raw-corpus probes byte-compare against. Same
 * private leg as RAW_CORPUS_DB_PATH and from the same capture, so it resolves
 * beside it. Two probes each hardcoded their own absolute copy under a
 * different per-worktree, both of which have since left this machine.
 */
export const RAW_CORPUS_VIEW_LANE_DIR = path.join(
  RAW_CORPUS_DIR,
  "expected-v2",
  "view-lane",
);

/**
 * The machine-local private corpus shard directory (gitignored, never
 * committed). Exported so private-leg consumers resolve it from this
 * contract instead of hardcoding an absolute machine path — see
 * benchmarks/corpus-v2/README-coderay-byte-identity-shard-pair-provisioning.md
 * for the provisioning command that restores the coderay gate's shard pair.
 */
export const PRIVATE_SHARD_DIR_PATH = PRIVATE_SHARD_DIR;

const richCorpus = process.env.DECKO_TS_CORPUS_V2;

// The rich leg is an EXPLICIT opt-in: when it is requested, the machine's
// private corpus files must actually be there. A missing file fails LOUDLY
// at import with the exact paths — never a skip, never a deep ENOENT from
// whichever consumer opens first (skipping on missing data was explicitly
// overruled for this suite; the suite either runs on real bytes or fails).
if (richCorpus !== undefined) {
  const richShard000000 = path.join(PRIVATE_SHARD_DIR, "shard-000000.jsonl");
  const richShard000014 = path.join(PRIVATE_SHARD_DIR, "shard-000014.jsonl");
  const missing = [richCorpus, richShard000000, richShard000014].filter((p) => !existsSync(p));
  if (missing.length > 0) {
    throw new Error(
      "DECKO_TS_CORPUS_V2 rich-corpus leg requested but these machine-local corpus files are missing:\n" +
        missing.map((p) => `  ${p}`).join("\n") +
        "\nThe rich leg is opt-in and never assumed; unset DECKO_TS_CORPUS_V2 to run the " +
        "committed miniature corpus (fixtures/test-corpus/), or restore the private corpus " +
        "files (bench-corpus-v2.sqlite3 + fixtures/corpus/shard-000000.jsonl + shard-000014.jsonl) " +
        "to run the rich leg.",
    );
  }
}

/** The corpus sqlite the seeding helpers and replay drivers open. */
export const CORPUS_DB_PATH = richCorpus ?? path.join(FIXTURE_CORPUS_DIR, "test-corpus.sqlite3");

/** The captured-oracle shard the corpus replay tests read entries from. */
export const SHARD_000000_PATH = richCorpus
  ? path.join(PRIVATE_SHARD_DIR, "shard-000000.jsonl")
  : path.join(FIXTURE_CORPUS_DIR, "test-corpus-shard-000000.jsonl");

/** The depth-3 junction replay's shard (entry 19334). */
export const SHARD_000014_PATH = richCorpus
  ? path.join(PRIVATE_SHARD_DIR, "shard-000014.jsonl")
  : path.join(FIXTURE_CORPUS_DIR, "test-corpus-shard-000014.jsonl");

/** True when the explicit richer-corpus opt-in is active. */
export const RICH_CORPUS_REQUESTED = richCorpus !== undefined;
