// capture-feed-binding.mjs: the rule that binds a committed probe receipt
// into the grader the signed-in harness reads.
//
// WHY IT EXISTS. The registry's own grader
// (lib/local-policy.mjs verifiedCapabilities) credits a capability when a
// RESULT carries one of its declared check names and that result passed. The
// results it reads come from the harness run's own results array. One
// capability of this family is proved by a DIFFERENT instrument: the
// reference-harness probe
// reference-harness/browser/probe-c13-create-and-edit-templated-card.mjs,
// which drives a templated card end to end and grades eight legs, and whose
// committed receipt is
// reference-harness/browser/probe-receipts/probe-c13-run3-result.json.
//
// The registry row already names the binding, because the roster said so
// ("closing the row needs the probe results bound into a capture feed or an
// explicit registry decision, not more capability work"): the C13 row
// carries a captureFeed block naming the receipt, the instrument and the
// reader. What was missing is the reader's caller: nothing in the harness
// read the feed, so a run could never credit the row and the row's own
// instrument sat unread inside the repository.
//
// THE CONTRACT OF THIS BINDING:
//   - a feed is read only when the registry row names BOTH a receipt and a
//     reader, and both paths resolve INSIDE this repository. A path that
//     escapes the repository is refused, not clamped;
//   - the receipt is converted by the READER THE ROW NAMES, so the row keeps
//     ownership of how its own evidence becomes a result;
//   - a feed that cannot be read, or whose reader cannot be loaded, is
//     reported as a note and contributes NO result. A missing feed leaves
//     the row exactly where it was, which is the honest outcome;
//   - the feed cannot launder a red run. The reader decides the verdict
//     (lib/capture-feed.mjs resultsFromProbeReceipt), and that verdict is
//     carried into the run's results unchanged, so a red receipt is a failed
//     check in the run record like any other;
//   - the result carries its own group, naming the capability and the
//     instrument it came from, so a reader of the run record sees that this
//     check was graded from a committed receipt and not from this run's
//     browser.

import { isAbsolute, relative, resolve, sep } from 'node:path';

/**
 * The registry rows that carry a capture feed.
 * @param {any[]} capabilities the registry's capability rows.
 * @returns {{capabilityId: string, receipt: string, reader: string, instrument: string|null}[]}
 */
export function captureFeedBindings(capabilities) {
  if (!Array.isArray(capabilities)) return [];
  const bindings = [];
  for (const capability of capabilities) {
    const feed = capability?.captureFeed;
    if (!feed || typeof feed.receipt !== 'string' || typeof feed.reader !== 'string') continue;
    bindings.push({
      capabilityId: capability.id,
      receipt: feed.receipt,
      reader: feed.reader,
      instrument: typeof feed.instrument === 'string' ? feed.instrument : null,
    });
  }
  return bindings;
}

/**
 * A path inside the repository, or null.
 *
 * A relative path that climbs out of the repository (../..) and an absolute
 * path are both refused: the feed is a committed file in this tree, and a
 * path that points anywhere else is not one.
 * @param {string} repoRoot the repository root.
 * @param {string} relativePath the path the registry row named.
 * @returns {string|null} the resolved absolute path, or null.
 */
export function resolveInside(repoRoot, relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0) return null;
  if (isAbsolute(relativePath)) return null;
  const root = resolve(repoRoot);
  const full = resolve(root, relativePath);
  const inside = relative(root, full);
  if (inside.length === 0 || inside === '..' || inside.startsWith('..' + sep) || isAbsolute(inside)) return null;
  return full;
}

/**
 * The results every named feed contributes, and the notes for the feeds that
 * contributed nothing.
 *
 * @param {{capabilityId: string, receipt: string, reader: string, instrument: string|null}[]} bindings
 * @param {{repoRoot: string, readFile: (path: string) => string, loadReader: (path: string) => any}} deps
 * @returns {{results: any[], notes: any[]}}
 */
export async function captureFeedResults(bindings, { repoRoot, readFile, loadReader }) {
  const results = [];
  const notes = [];
  for (const binding of bindings) {
    const receiptPath = resolveInside(repoRoot, binding.receipt);
    const readerPath = resolveInside(repoRoot, binding.reader);
    if (receiptPath === null) {
      notes.push({ ...binding, skipped: 'the receipt path is not a file inside this repository' });
      continue;
    }
    if (readerPath === null) {
      notes.push({ ...binding, skipped: 'the reader path is not a file inside this repository' });
      continue;
    }
    let receipt;
    try {
      receipt = JSON.parse(readFile(receiptPath));
    } catch (error) {
      notes.push({ ...binding, skipped: `the receipt could not be read: ${String(error?.message ?? error).slice(0, 160)}` });
      continue;
    }
    let reader;
    try {
      reader = await loadReader(readerPath);
    } catch (error) {
      notes.push({ ...binding, skipped: `the reader could not be loaded: ${String(error?.message ?? error).slice(0, 160)}` });
      continue;
    }
    if (typeof reader?.resultsFromProbeReceipt !== 'function') {
      notes.push({ ...binding, skipped: 'the named reader exports no resultsFromProbeReceipt' });
      continue;
    }
    const rows = reader.resultsFromProbeReceipt(receipt);
    if (!Array.isArray(rows) || rows.length === 0) {
      notes.push({ ...binding, skipped: 'the reader produced no result for this receipt' });
      continue;
    }
    for (const row of rows) {
      results.push({
        ...row,
        group: `capture feed (${binding.capabilityId}${binding.instrument ? `, ${binding.instrument}` : ''})`,
        captureFeed: { capabilityId: binding.capabilityId, receipt: binding.receipt, reader: binding.reader, instrument: binding.instrument },
      });
    }
  }
  return { results, notes };
}
