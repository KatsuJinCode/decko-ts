import { describe, it } from "vitest";

/**
 * A corpus/replay suite that cannot run because its data is absent.
 *
 * These suites replay captured oracle bytes. In this fork the rich capture
 * (derived from the reference deck) is not committed, so the suite is skipped
 * unless the operator supplies it locally — see docs/TESTING.md. We skip
 * rather than fail because the missing data is expected on a fresh clone and
 * failing on it would drown the real signal.
 *
 * What we never do is skip SILENTLY: every skip prints its suite name, the
 * reason, and how to enable it. A green run that hides an unexecuted suite
 * is a false claim about what the tests actually guard.
 */
export function describeWithCorpus(
  enabled: boolean,
  suiteName: string,
  reason: string,
): typeof describe | typeof describe.skip {
  if (enabled) return describe;
  console.warn(
    `[corpus-gated] NOT RUN: "${suiteName}" — ${reason}\n` +
      `             It asserts real render parity and guards nothing when absent.\n` +
      `             Enable it by supplying the corpus (docs/TESTING.md).\n`,
  );
  return describe.skip;
}

/**
 * `describe.skipIf(skip)` that says why. `where` names the file, `gate` is the
 * condition that must hold for the suite to run (an environment variable, a
 * data file, a platform).
 */
export function describeOrSkipLoud(
  skip: boolean,
  where: string,
  gate: string,
): typeof describe | typeof describe.skip {
  if (!skip) return describe;
  console.warn(
    `[corpus-gated] NOT RUN: suite in ${where} — needs data or setup that a clean clone does not have.\n` +
      `             Gate not satisfied: ${gate}\n` +
      `             See docs/TESTING.md for how to supply it.\n`,
  );
  return describe.skip;
}

/** `it.skipIf(skip)` that says why; see describeOrSkipLoud. */
export function itOrSkipLoud(skip: boolean, where: string, gate: string): typeof it | typeof it.skip {
  if (!skip) return it;
  console.warn(
    `[corpus-gated] NOT RUN: test in ${where} — gate not satisfied: ${gate}. See docs/TESTING.md.\n`,
  );
  return it.skip;
}

/**
 * Skip the running test, and say so. Replaces a bare `ctx.skip()`, which
 * reports nothing beyond a skipped count.
 */
export function skipLoud(ctx: { skip: () => void; task?: { name?: string } }, where: string, gate: string): void {
  console.warn(
    `[corpus-gated] NOT RUN: "${ctx.task?.name ?? "test"}" in ${where} — gate not satisfied: ${gate}. See docs/TESTING.md.\n`,
  );
  ctx.skip();
}
