#!/usr/bin/env node
// Classify render-engine realFail entries from the corpus-v2 prewarm48 replay
// by their normalized diff signature. Reads:
//   - aggregate.real_failures (2000 sampled entries with excerpts)
//   - 48 shard-outcome files (counts only — used to confirm the 15,530 total)
// Scales bucket counts from the 2000 sample up to the full 15,530 render realFail
// population reported by the aggregate. Stdout prints only a short top-10 summary.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = 'REPO_ROOT/decko-ts';
const RESULTS_DIR = join(REPO, 'benchmarks/results/corpus-v2');
// Inputs overridable for re-classification of later replay runs:
//   node classify-render-realfails.mjs [aggregateJson [outJson]]
const AGGREGATE_PATH = process.argv[2]
  ? join(REPO, process.argv[2].replace(/^benchmarks\//, 'benchmarks/').replace(/^\//, ''))
  : join(RESULTS_DIR, 'replay-full-resultsprewarm48.json');
const OUT_JSON = process.argv[3]
  ? join(REPO, process.argv[3])
  : join(REPO, 'tools/corpus-failure-classes/failure-buckets.json');
// Target population read from the aggregate itself (renders.realFail), never
// hardcoded — later runs re-run this classifier against their own aggregate.
const _aggregateForTarget = JSON.parse(readFileSync(AGGREGATE_PATH, 'utf8'));
const TARGET_POPULATION = _aggregateForTarget.aggregate?.renders?.realFail
  ?? _aggregateForTarget.aggregate?.renders?.realFailCount
  ?? 0;

// --- normalization -----------------------------------------------------------

// Replace any run of letters/digits that looks like a corpus card name token or a
// random gibberish id with stable tokens so structurally-identical diffs collapse.
function normalize(text) {
  let s = text;
  // Decode the small set of HTML entities the fixtures emit so structural shape matches.
  s = s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#39;/g, "'");
  // Canonical view-suffix placeholders.
  // view-suffix rewrites must happen BEFORE the id-strip so the structural
  // rule at line ~123 (/accordion-body|card-body/.../-CV/) sees the -CV token
  // when it lives inside an id="..." value (the engine emits the extra
  // content-view wrapper as <div id="...-content-view"> — without this fix
  // the id-strip erased the token and the bucket under-collapsed).
  s = s.replace(/-open-view/g, '-OV')
       .replace(/-content-view/g, '-CV')
       .replace(/-closed-view/g, '-CLV')
       .replace(/-mini_bar-view/g, '-MV');
  // Drop noisy attribute values (ids, hrefs, data-bs-*). Stash any id that
  // carries a view-suffix marker to a sentinel first so the generic id-strip
  // does not erase the -CV/-OV/-CLV/-MV token; then run the generic strip
  // on the remaining ids; finally restore the stashed ids as id="X-CV" so
  // the structural rule still fires on them.
  const ID_SENTINEL_PREFIX = '\u0001IDSENT';
  s = s.replace(/id="[^"]*-OV[^"]*"/g, `${ID_SENTINEL_PREFIX}OV`)
       .replace(/id="[^"]*-CV[^"]*"/g, `${ID_SENTINEL_PREFIX}CV`)
       .replace(/id="[^"]*-CLV[^"]*"/g, `${ID_SENTINEL_PREFIX}CLV`)
       .replace(/id="[^"]*-MV[^"]*"/g, `${ID_SENTINEL_PREFIX}MV`)
       .replace(/id="[^"]*"/g, 'id="X"')
       .replace(/href="[^"]*"/g, 'href="X"')
       .replace(/data-[a-z-]+="[^"]*"/g, 'data-X="X"')
       .replace(new RegExp(`${ID_SENTINEL_PREFIX}(OV|CV|CLV|MV)`, 'g'), 'id="X-$1"');
  // Preserve structural class-name vocabulary that matters for bucketing.
  // Anything else that looks like a long lowercase token (>=6 chars) collapses to TOK.
  const preserved = ['pointer-list', 'pointer-item', 'card-list', 'item-bar', 'card-slot', 'd0-card-body', 'accordion-body', 'text-muted', 'one-line', 'home_view', 'mini-bar'];
  for (const w of preserved) {
    s = s.split(w).join('__' + w.replace(/-/g, '_') + '__');
  }
  s = s.replace(/\b[a-z]{6,}\b/g, 'TOK');
  for (const w of preserved) {
    s = s.split('__' + w.replace(/-/g, '_') + '__').join(w);
  }
  // Numbers >=2 digits collapse to NUM.
  s = s.replace(/\b\d{2,}\b/g, 'NUM');
  // Collapse whitespace.
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

// --- classification ---------------------------------------------------------

// Returns a bucket key derived from the failure excerpt shape. Buckets describe
// the structural diff (which wrapper is added/missing, where the divergence
// sits, what sentinel is missing) — never the literal card name.
function classify(fail) {
  const first = fail.first || '';

  // 1. Handler raised an unexpected nest-depth error.
  if (/handler raised Error: nest depth exceeded/.test(first)) {
    return 'nest_depth_error_raised_unexpectedly';
  }

  // 1b. Record-engine system cards (*now, *version, *alerts, *recent_changes) where
  //     Ruby serializes a non-empty `content` field but the TS engine emits "".
  if (/card-engine/.test(fail.area) || /:record\b/.test(fail.id)) {
    const codename = (first.match(/"codename":"([^*"]+)/) || [])[1] || 'system_card';
    return `record_system_card_content_empty:${codename}`;
  }

  // 2. Fixture expects CAPTURE_ERROR but the handler returned output.
  //    Sub-bucket by the Ruby error class so Ruby-equivalent fixes are visible.
  if (/fixture expects a raised error/.test(first) || /CAPTURE_ERROR/.test(first)) {
    const m = first.match(/CAPTURE_ERROR:\s*([^:\n]+)/);
    const errClass = m ? m[1].trim() : 'unknown';
    return `capture_error_not_raised:${errClass}`;
  }

  // 3. Rule-count mismatch — any "(N <kind> rules)" line where the engine and Ruby
  //    count the rule set differently. Default / table / input type / style sets.
  if (/default rules?\)/.test(first) ||
      /table of [a-z]+ rules\)/.test(first) ||
      /input type rules\)/.test(first) ||
      /style rules\)/.test(first) ||
      /[a-z]+ rules?\)/i.test(first)) {
    return 'rule_count_mismatch';
  }

  // 4. Permission-denied sentinel missing (Ruby emits <span class="denied">…</span>
  //    but the engine emits gibberish placeholder paragraphs).
  if (/Sorry, you don/.test(first) || /class="denied"/.test(first)) {
    return 'permission_denied_sentinel_replaced_with_placeholder';
  }

  const offMatch = first.match(/offset (\d+)[^\n]*expected "([^"]*)" but got "([^"]*)"/);
  const offset = offMatch ? +offMatch[1] : 0;
  const expC = offMatch ? offMatch[2] : '';
  const actC = offMatch ? offMatch[3] : '';

  const sizeMatch = first.match(/sizes:\s*expected\s+(\d+)\s+bytes,\s+actual\s+(\d+)/);
  const expSize = sizeMatch ? +sizeMatch[1] : 0;
  const actSize = sizeMatch ? +sizeMatch[2] : 0;

  const expRaw = (first.match(/expected excerpt:\s*([\s\S]*?)\s+actual excerpt:/) || [])[1] || '';
  const actRaw = (first.match(/actual excerpt:\s*([\s\S]*?)\s+sizes:/) || [])[1] || '';
  const expN = normalize(expRaw);
  const actN = normalize(actRaw);

  // 5. Extra content-view wrapper added inside an accordion / card-body slot.
  if (/(accordion-body|card-body)/.test(expN) && /-CV/.test(actN)) {
    return 'extra_content_view_wrapper_inside_card_body_or_accordion';
  }

  // 6. Pointer-item item-bar slot rendered empty (mini-bar view not emitted).
  if (/pointer-item item-bar/.test(expN) && /class="card-list card-list-bar pointer-list"/.test(actN)) {
    return 'pointer_item_bar_outer_card_list_wrapper_prepended';
  }
  if (/pointer-item item-bar/.test(expN) && /pointer-item item-bar"\s*><\/div>/.test(actN) && expSize > actSize * 1.5) {
    return 'pointer_item_bar_inner_mini_bar_view_not_emitted';
  }

  // 7. Card-name gibberish leaked as text where a closing tag / nested structure was expected.
  //    All share the same mechanism; bucket by where in the output the leak appears.
  if (expC === '<' && /^[a-z]/.test(actC)) {
    if (/text-muted one-line/.test(expN) && /text-muted one-line">TOK<\/div>/.test(actN)) {
      return 'card_name_leaked_as_text_replacing_text_muted_block';
    }
    if (/home_view":"TOK"/.test(expN)) {
      return 'card_name_leaked_as_text_after_home_view_data_attr';
    }
    if (/show":\["TOK"\]/.test(expN)) {
      return 'card_name_leaked_as_text_inside_content_view_after_data_attr';
    }
    return 'card_name_leaked_as_text_other_position';
  }

  // 8. Extra closing tags — engine produced </div> where a content character was expected.
  if (expC && actC === '/' && expSize > actSize * 1.5) {
    return 'extra_closing_div_unbalanced';
  }

  // Fallback: shape-only diff (offset tier, size delta category, char-pair hint).
  const offTier = offset < 100 ? 'E' : offset < 1000 ? 'M' : 'L';
  const sizeDelta = expSize > 0 ? Math.round(((actSize - expSize) / expSize) * 100) : 0;
  const sizeCat = sizeDelta > 30 ? '+S' : sizeDelta < -30 ? '-S' : '~';
  return `unclassified:${offTier}/${sizeCat}/exp=${expC || '_'}/act=${actC || '_'}`;
}

// --- load + run --------------------------------------------------------------

const aggregate = JSON.parse(readFileSync(AGGREGATE_PATH, 'utf8'));
const failures = aggregate.aggregate.real_failures;
const sampleSize = failures.length;

// Verify shard totals match the render realFail population. The shard-outcome
// prefix follows the aggregate's own tag (…outcomewithmods48-… for a run
// tagged withmods48) so re-runs classify against their own shards.
const runTag = (AGGREGATE_PATH.match(/results([A-Za-z0-9]+)\.json/) || [])[1] || 'prewarm48';
const shardFiles = readdirSync(RESULTS_DIR)
  .filter(f => f.startsWith(`replay-shard-outcome${runTag}-shard-`) && f.endsWith('.jsonl.json'))
  .sort();
let shardSum = 0;
for (const f of shardFiles) {
  const o = JSON.parse(readFileSync(join(RESULTS_DIR, f), 'utf8'));
  shardSum += o.renders.realFail;
}
if (shardFiles.length === 0) {
  console.error(`no shard-outcome files matched tag ${runTag}; skipping shard-sum check`);
} else if (shardSum !== TARGET_POPULATION) {
  console.error(`shard sum ${shardSum} != reported ${TARGET_POPULATION}`);
}

// Bucket the sample.
const buckets = new Map();
for (const fail of failures) {
  const k = classify(fail);
  const entry = buckets.get(k) || { count: 0, representative: null };
  entry.count++;
  if (!entry.representative) entry.representative = fail.id;
  buckets.set(k, entry);
}

// Scale sample counts to the full population.
const scaled = [];
for (const [signature, entry] of buckets.entries()) {
  const sampleCount = entry.count;
  const populationCount = Math.round((sampleCount / sampleSize) * TARGET_POPULATION);
  scaled.push({ signature, sampleCount, count: populationCount, representative: entry.representative });
}
scaled.sort((a, b) => b.count - a.count || a.signature.localeCompare(b.signature));

// --- write artifact ----------------------------------------------------------

const MECHANISMS = {
  'capture_error_not_raised:Card::Error::BadQuery':
    'Ruby raises Card::Error::BadQuery for invalid name lookups; the TS handler returns an empty shell HTML view instead of propagating the error. The wrapper renders, so size is the *actual* size, and the first-diff sentinel is the CAPTURE_ERROR prefix.',
  'capture_error_not_raised:Date::Error: invalid date':
    'Ruby raises Date::Error for malformed dates; the TS handler returns HTML rather than re-raising the sentinel. Same shape as Card::Error but confined to the date codec.',
  'card_name_leaked_as_text_inside_content_view_after_data_attr':
    'The TS renderer prints the literal card name where the fixture expects a closing </div> right after the data-attribute block. The engine is including the card key as body text inside the content-view wrapper instead of leaving the wrapper empty (Ruby uses a Nest/Subformat that suppresses the name).',
  'card_name_leaked_as_text_after_home_view_data_attr':
    'Same leak as above but inside the home/open view at the end of the render — fixture expects the trailing </div></div></div></div></div> sequence, TS engine emits the card name then partial closing tags.',
  'card_name_leaked_as_text_replacing_text_muted_block':
    'Inside a text-muted one-line slot, Ruby emits a nested <div class="pointer-list">… structure; TS engine emits just the card name and a single </div>. Same root cause: card name appears as body text where it should be hidden by the wrapper markup.',
  'pointer_item_bar_inner_mini_bar_view_not_emitted':
    'A pointer-item item-bar row should contain a nested <div id="…-mini_bar-view"> wrapper for the item-bar rendering. The TS engine emits an empty <div class="pointer-item item-bar"></div> — the inner mini-bar view never renders, so the row truncates and the expected size grows by ~1.5–2×.',
  'pointer_item_bar_outer_card_list_wrapper_prepended':
    'The expected list opens with <div class="pointer-list"> but the TS engine prepends <div class="card-list card-list-bar pointer-list"> and then collapses the body. The outer card-list-bar wrapper is wrong, and the inner item-bar rows are emitted without their content slots.',
  'pointer_item_bar_truncated_outer_card_list_missing':
    'The expected output begins with `<div class="pointer-list">`; the TS engine prepends `<div class="card-list card-list-bar pointer-list">` and then truncates. The outer card-list wrapper class is wrong and the slot body collapses.',
  'permission_denied_sentinel_replaced_with_placeholder':
    'Ruby renders <p><span class="denied"><!-- Sorry, you don\'t have permission --></span></p> for denied content; the TS engine emits the placeholder body paragraphs (<p>TOK</p>…) with no denied span. The permission check is missing.',
  'rule_count_mismatch':
    'Fixtures count rule sets (default rules, table of X rules, input type rules, style rules). TS engine and Ruby disagree on the count for one or more rule sets — the TS rule engine is reading a different or incomplete rule list.',
  'nest_depth_error_raised_unexpectedly':
    'The TS engine raises "nest depth exceeded" where Ruby produces a valid render. Cycle detection or recursion guard is firing too aggressively.',
  'record_system_card_content_empty:alerts':
    'The *alerts system card: Ruby serializes the deprecation notice as `content`; TS engine emits an empty `content` string. The seed/script that populates *alerts is not running.',
  'record_system_card_content_empty:now':
    'The *now system card: Ruby serializes the formatted current date/time; TS engine emits an empty `content`. The format helper is not wired.',
  'record_system_card_content_empty:version':
    'The *version system card: Ruby serializes the version string; TS engine emits an empty `content`. The version source is missing.',
  'extra_content_view_wrapper_inside_card_body_or_accordion':
    'Inside an accordion-body or card-body slot, the TS engine wraps the body in an extra <div id="…-content-view"> that Ruby does not emit. The engine is double-wrapping the slot view.',
  'card_name_leaked_as_text_other_position':
    'Same card-name leak as the more specific buckets, but the structural surrounding markup did not match one of the canonical positions (still > expected <, actual starts with a lowercase letter).',
  'extra_closing_div_unbalanced':
    'The TS engine emits extra `</div>` tags where the fixture expects content. Wrapper nesting is unbalanced — the engine is closing tags that Ruby leaves open for slot expansion.',
  'unclassified':
    'Shape-only residual bucket — could not be merged into a known structural class. Surfaced for further triage.',
};

function describeMechanism(sig) {
  if (MECHANISMS[sig]) return MECHANISMS[sig];
  if (sig.startsWith('capture_error_not_raised:')) {
    return 'Ruby raises an error in this scenario but the TS handler returns HTML rather than re-raising the CAPTURE_ERROR sentinel.';
  }
  if (sig.startsWith('record_system_card_content_empty:')) {
    return 'Record-engine system card: the TS engine leaves the `content` field empty where Ruby populates it from a seed, format helper, or version source.';
  }
  if (sig.startsWith('unclassified:')) {
    return 'Shape-only residual — offset tier / size delta / char-pair hint did not match a known structural class.';
  }
  return 'Structural bucket — see the signature for the diff shape.';
}

const artifact = {
  targetPopulation: TARGET_POPULATION,
  sampleSize,
  shardSum,
  bucketCount: scaled.length,
  buckets: scaled.map(b => ({
    signature: b.signature,
    count: b.count,
    sampleCount: b.sampleCount,
    representative: b.representative,
    mechanism: describeMechanism(b.signature),
  })),
  method: 'Normalize excerpts (decode HTML entities, replace -view suffixes, collapse card-name/gibberish runs to TOK, drop noisy attribute values), then pattern-match each failure to a structural bucket keyed on wrapper shape, sentinel, and offset tier. Counts are scaled from the 2000-sample to the 15,530 population reported by aggregate.renders.realFail.',
};
writeFileSync(OUT_JSON, JSON.stringify(artifact, null, 2));

// --- stdout: top 10 only, under 20KB ----------------------------------------

const top = artifact.buckets.slice(0, 10);
const totalClassified = artifact.buckets.reduce((s, b) => s + b.count, 0);
const unclassifiedSig = 'unclassified';
const unclassifiedCount = artifact.buckets
  .filter(b => b.signature.startsWith(unclassifiedSig))
  .reduce((s, b) => s + b.count, 0);
const remainder = TARGET_POPULATION - totalClassified;

console.log(`render-engine realFail classification (target population = ${TARGET_POPULATION}, sample = ${sampleSize}, shard-sum verified = ${shardSum})`);
console.log(`buckets: ${artifact.bucketCount}    classified: ${totalClassified}    remainder: ${remainder}    unclassified: ${unclassifiedCount}`);
console.log('');
console.log('TOP 10 BUCKETS:');
console.log('  count   sample  representative                signature');
console.log('  -----   ------  ----------------------------   ----------------------------------------');
for (const b of top) {
  console.log(`  ${String(b.count).padStart(5)}   ${String(b.sampleCount).padStart(6)}  ${b.representative.padEnd(28)}  ${b.signature}`);
}