# Normalization evidence: rules N4 to N8

The corpus instrument compares engine output with the recorded Ruby oracle
output after applying a small set of canonical forms. Rules N1 to N3 are
described in [SPEC.md](SPEC.md), section 4.2. This document gives the evidence
for N4 to N8, the five canonical forms over volatile values, and for the
reproduced upstream failure category that the grader counts beside them.

The numbering is the one used in `runner/normalize.mjs`. Each section says
what the rule canonicalizes, the measured facts that justify it, and how to
reproduce each fact. Each fact carries one label:

- **shipped**: reproducible from the files in this repository, without Ruby.
- **engine run**: reproducible by running the composed TypeScript adapter, without Ruby.
- **recorded**: measured earlier with the stock Ruby oracle. Repeating it needs the oracle application installed. It was not repeated for this document.
- **withheld**: the operations are not in the public package, so the fact cannot be reproduced from it.

## The capture these facts come from

The committed oracle capture is `reference-harness/fixtures/synthetic-v2/expected/render.jsonl.gz`.
Its public part holds 2,573 render operations:

- 2,540 operations that return HTML;
- 9 operations that return a non-HTML view result (an integer or `null`);
- 24 operations whose recorded answer is a failure.

Eight further admin error-view operations, the ones that show a Ruby debug page,
are withheld from the public package. The full capture therefore has 2,581
operations. Every count below is over the 2,573 public operations unless it says
otherwise.

The composed adapter sets the capture clock to the fixture's `clock` value,
`2026-09-19T12:00:00Z` (`reference-harness/fixtures/synthetic-v2/deck.json`), for the whole run
(`adapters/ts-composed/adapter.ts`). The counts below were measured on
2026-10-14 with that adapter at the revision this document was committed with.

## Summary

| Rule | Value it canonicalizes | Shipped capture: operations whose grade changes when the rule is removed | Label of its main facts |
|---|---|---|---|
| N4 | Digits of an accordion collapse id, from Ruby's per-process string hash | 30 | shipped, engine run, recorded |
| N5 | Relative-time phrases, from the frozen capture clock | 0 | shipped, engine run |
| N6 | The backtrace frame list in a debug page (masked) | 0 public; all 8 withheld operations | withheld, engine run |
| N7 | Absolute paths and heap addresses in a debug page | not measured separately: it acts only on the 8 withheld operations, whose frame lists N6 masks | withheld, recorded |
| N8 | The class name of a recorded failure | 24 | shipped, engine run |

Reproduced upstream failures are a separate category: 24 items in the public
capture (see the last section).

## N4: collapse ids

**What varies.** The mod-admin pages render accordion sections whose collapse
ids include the digits of Ruby's `String#hash` for the section title. Ruby
seeds that hash per process, so two processes give different digits for the
same string. The engine's stand-in is `stringHash` in
`src/card/mod-loader/mods/core-mod.ts`. It is a deterministic function of the
title, so the engine's digits differ from Ruby's but do not change between runs.

**Measured facts.**

- shipped: 30 operations carry the token, with 84 tokens in all. They are the `page:` renders of the five mod cards (`mod: account`, `mod: style`, `mod: script`, `mod: search`, `mod: email`) for four actors, and the `core:` renders of the same cards for two actors.
- shipped: the operation ids that carry the token are listed by the measurement script in section A.
- engine run: with N4 switched off, exactly those 30 operations stop grading identical. No other operation changes. The engine run's rendering pass count falls from 2,529 to 2,499.
- shipped (checked with Ruby 3.4 on this machine): `ruby -e 'puts "Admin".hash'` printed `-109739842` on one run and `531507295` on the next. The seed changes per process.
- recorded: two complete stock-oracle processes (Ruby 3.3.12, decko 0.20.0) over the 44 render operations that match the mod-card filter differed in all 84 collapse-id tokens, and in all 442 slot ids. Nothing else differed (0 unexplained). This was measured at an earlier revision.

**Reproduce the two-run measurement** (recorded; needs the oracle application
in `reference-harness/oracle/app` installed with its Gemfile, see SPEC section 5):

```
node reference-harness/runner/run.mjs --adapter reference-harness/adapters/ruby/adapter.json \
     --fixture reference-harness/fixtures/synthetic-v2 --out <work>/run-1 --kinds render \
     --filter ":mod: (account|style|script|search|email)"
node reference-harness/runner/run.mjs --adapter reference-harness/adapters/ruby/adapter.json \
     --fixture reference-harness/fixtures/synthetic-v2 --out <work>/run-2 --kinds render \
     --filter ":mod: (account|style|script|search|email)"
: > <work>/run-1/semantics.jsonl; : > <work>/run-1/scenarios.jsonl
: > <work>/run-2/semantics.jsonl; : > <work>/run-2/scenarios.jsonl
node reference-harness/runner/compare-runs.mjs <work>/run-1 <work>/run-2
```

The last command prints the per-rule accounting. The `N4 collapse ids` line
reports how many paired tokens differ between the two runs.

## N5: relative-time spans

**What varies.** The oracle freezes its clock to the fixture clock for the whole
process (`oracle/lib/harness_env.rb`, `freeze_clock!`). Rails' relative-time
phrases are therefore fixed: a card built moments before the capture reads
"less than a minute" for ever. An engine that reads a live clock reads a
different phrase, such as "20 days". The composed adapter sets the same capture
clock on the engine side (`setCaptureWallClock`, `src/card/wall-clock.ts`), so
the two sides normally read the same value.

**Measured facts.**

- shipped: 22 operations carry at least one relative-time span, with 180 spans in all: 179 "less than a minute" and 1 "2 days".
- engine run: the engine renders the same 180 phrases on the same 22 operations. The phrase multisets are equal.
- engine run: with N5 switched off, no operation changes grade. The rendering pass count and the list of failing operations are unchanged.

So on the shipped capture N5 does not change any outcome. The rule stays
because an engine that reads a live clock would render different phrases for
the same stored timestamps, and the comparison should not depend on the capture
day. The shipped capture does not exercise that case.

**Reproduce.** The span counts are in section A. The effect of removing the rule
is in section C.

## N6: backtrace frame list

**Why it is masked.** A Ruby debug page embeds `exception.backtrace * "<br>\n"`:
the call stack of the engine that raised. A backtrace is engine-specific by
definition. The oracle's frames are Ruby's and include the frames of the
capture process's boot and of the harness; the engine's are its own V8 frames.
Neither the frame text nor the frame count says anything about the behaviour
the oracle defines, and a port can only match them by fabricating frames, which
the engine does not do. N6 therefore replaces the whole content of the
backtrace div with the single marker `N6#frames` on both sides. The div, the
heading, the error message (with N7) and every byte outside the div are still
compared byte for byte, so a different error message or a missing debug page
still fails.

This is the one mask that does not rest on two-run variation (SPEC section 4.2):
the oracle's backtrace is stable between runs, but no other engine has it.

**Measured facts** (2026-10-14, composed adapter, checkout holding the withheld set).

- shipped: no operation in the public capture renders a debug page, so N6 changes no public grade.
- withheld: the eight admin error-view operations render a debug page on both sides. The oracle pages carry 51 to 168 Ruby frames (edit_structure 168, verify_url and reset_password_url 63, preview_editor 60, closure 59, asset_output_url 53, debug_server_error and search_error 51). The engine's pages carry its real V8 stack, 8 to 10 frames (Node's default `Error.stackTraceLimit` is 10).
- engine run: with the frame list masked, all 8 grade identical. With the earlier rule (each frame line replaced by a marker, frame count compared) all 8 differ, and with no N6 all 8 differ. No other operation's output, on either side, carries a debug page, so the rule changes exactly these 8 grades.
- engine run: the error messages agree on all 8 operations. The debug page prints the message, not the class, so no class name is compared there.

**Reproduce** (needs the withheld set):

```
node reference-harness/runner/run.mjs --adapter reference-harness/adapters/ts-composed/adapter.json \
     --fixture reference-harness/fixtures/synthetic-v2 --out tmp/g2
node reference-harness/runner/grade.mjs --fixture reference-harness/fixtures/synthetic-v2 \
     --actual tmp/g2 --expected reference-harness/fixtures/synthetic-v2/expected --report tmp/g2.json
```

The report lists no rendering failure among the eight withheld `view:admin:*`
operations. The rule's behaviour on constructed input is covered by the `N6`
block in `runner/test/normalize.test.mjs`.

## N7: capture-host content in debug pages

**What varies.** The debug page embeds the backtrace of the machine that
recorded the capture: its Ruby install, its gem home and its checkout path.
A heap address can appear in the message as well. These describe the capturing
machine, not the oracle's behaviour. N7 replaces absolute paths with `N7#path`
and hexadecimal addresses with `N7#addr`, only inside a debug-page title. The
frame's line number stays outside the placeholder, so the frame still counts.

**Measured facts.**

- shipped: no oracle row in the public capture contains the debug-page title, so the rule rewrites zero paths and zero addresses on the oracle side.
- engine run: the engine's debug pages appear only on the eight withheld operations (see N6).
- withheld: the eight debug-page operations carry 554 path tokens and 2 heap addresses. Recorded at an earlier revision. Not reproducible from the public package.

**Reproduce.** The unit tests in the `N7` block of `runner/test/normalize.test.mjs`
cover the rule on constructed input.

## N8: error class names

**What varies.** When the oracle raises, its capture records the class by Ruby's
name, `Card::Error::CodenameNotFound`. The engine names the same failure with
its own subclass, `CodenameNotFoundError`. The two names differ only by the
host language's naming convention. N8 keeps the class's name proper: the last
`::` segment of the Ruby path, with one trailing `Error` dropped on either side.
The message is compared byte for byte, and every other field counts.

**Measured facts.**

- shipped: 24 operations record a failure, all with class `Card::Error::CodenameNotFound` and message `unknown codename: test_context`. They are the `page:<actor>:<card>` rows for six cards (`Cohort Welcome`, `welcome email`, `password reset email`, `follower notification email`, `verification email`, `signup alert email`) and four actors (anonymous, member, contractor, admin).
- engine run: for all 24 operations the engine raises `CodenameNotFoundError` with the same message. Both class names canonicalize to `CodenameNotFound`.
- engine run: with N8 switched off, those 24 operations stop grading as reproduced failures and fail. Nothing else changes.

**Reproduce.** Section A prints the 24 operations and their recorded failure.
Section C shows the effect of removing the rule.

## Reproduced upstream failures

When the oracle's recorded answer for an operation is a failure, the grader does
not treat the operation as a divergence on that basis alone. `gradeRun` in
`runner/grade-lib.mjs` works through three cases:

1. The recorded answer is a capture-side fault: the capture script's own machinery threw, marked by the `CAPTURE_ERROR` sentinel. Such an operation says nothing about the site, so it is reported as an oracle capture fault and not graded. The shipped capture has none.
2. The recorded answer is an upstream failure and the engine raises the same failure: the same class under N8, with a byte-exact message. This is a reproduced upstream failure. It is counted in its own category, listed under `reproduced_upstream_failures` in the report, and not counted in the pass count.
3. The recorded answer is a failure and the engine gives a different failure, or renders a result. This fails the item.

The category is a success, not a rule that loosens the match. The message still
compares byte for byte, and the class is compared under N8.

**Measured result on the shipped capture** (engine run, composed adapter, measured
2026-10-14). The rendering report counts 2,573 operations:

- 2,529 identical after all canonical forms;
- 24 reproduced upstream failures;
- 20 that differ.

The 20 items that differ are not covered by N4 to N8. Their first differences are
structural (for example, the markup of a comment box or of a search result).
This document does not describe them.

**Reproduce.** Section B runs the engine and grades it.

### Six admin views that fail in stock Ruby Decko 0.20.0

Six of the eight withheld operations record an admin render of a view that
raises in stock Ruby Decko 0.20.0. The recorded answer is the admin error span
around Ruby's debug page. Each of these is a reproduced upstream failure: the
engine raises from the same precondition that makes Ruby fail, checked by the
ported code, and the Ruby source line below is where Ruby's own backtrace puts
the failure.

| Operation | Ruby failure | Ruby source line | Condition the engine checks |
| --- | --- | --- | --- |
| `view:admin:Report 1:preview_editor` | NoMethodError `undefined method 'gsub' for nil` | card-mod-carrierwave-0.20.0 `set/type/file.rb:145` (`cached_upload_card_name`, called from `preview_editor.haml` line 2) | the request carries no `:attachment_upload` param |
| `view:admin:Note 001:debug_server_error` | NameError `uninitialized constant Card::Set::All::Html::Error::BetterErrors` | card-mod-format-0.20.0 `set/all/html/error.rb:5` | the installed gem set has no card-mod-monkey, the gem that loads better_errors |
| `view:admin:Ada Admin+*account:verify_url` | JWT::DecodeError `HMAC key cannot be empty` | jwt-2.10.3 `lib/jwt/jwa/hmac.rb:40` (`ensure_valid_key!`), raised at `lib/jwt/jwa/signing_algorithm.rb:39` | the token secret (Rails' `secret_key_base`) is empty |
| `view:admin:Ada Admin+*account:reset_password_url` | as `verify_url` | as `verify_url` | as `verify_url` |
| `view:admin:Ada Admin+*account:closure` | NoMethodError `private method 'closure_deletions' called for #<Card:0x...>` | card-mod-account-0.20.0 `set/right/account/closure.haml:25`, raised through activemodel-7.2.4 `attribute_methods.rb:509` (`method_missing`) | the accounted card exists, so the explicit-receiver call meets a private method; a missing one is `nil.closure_deletions` |
| `view:admin:*all+*script:asset_output_url` | NoMethodError `undefined method 'asset_output_url' for #<Card::Format::CardActionView:0x...>` | card-mod-assets-0.20.0 `set/abstract/asset_outputter.rb:62`, raised at card-1.110.0 `lib/card/format/method_delegation.rb:73` (`delegate_to_action_view`) | the format the bare call resolves on defines no `asset_output_url` |

Ruby's messages for `closure` and `asset_output_url` end with the receiver's
`inspect`: a class name and a heap address. The engine does not imitate that
format. It names the receiver by its own identity, `#<Card id=611 name="Ada Admin">`
and `#<RenderFormat card="*all+*script">`. N7 replaces the heap address on the
Ruby side with `N7#addr`, but the class name and the text around it still
differ, so these two operations grade as differing.

**Measured** (engine run, composed adapter, withheld set present, 2026-10-14):
four of the six (`preview_editor`, `debug_server_error`, `verify_url`,
`reset_password_url`) are identical after N6 and N7. `closure` and
`asset_output_url` differ only in the receiver identity inside the message.
The rendering total is 2,555 of 2,581; the two operations are the only
`view / admin` differences (672 of 674).

## Reproduction

The commands below run from the repository root. Keep scratch outputs outside
the repository, or under `tmp/`, which is gitignored.

### A. Counts from the shipped capture (shipped)

Save the script below as `measure-shipped.mjs` in a scratch directory, then run
`node --input-type=module < <path-to>/measure-shipped.mjs` from the repository root.
It reads only `reference-harness/fixtures/synthetic-v2/expected/render.jsonl.gz` and uses the rules
exactly as the grader applies them.

```js
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { normalizeHtml, RELATIVE_TIME, COLLAPSE_ID, canonicalErrorClass } from "./reference-harness/runner/normalize.mjs";

const dir = "reference-harness/fixtures/synthetic-v2";
const load = (file) => gunzipSync(readFileSync(file)).toString("utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
const rows = load(`${dir}/expected/render.jsonl.gz`);
const html = rows.filter((r) => typeof r.result?.html === "string");
const errors = rows.filter((r) => r.error !== undefined);
const count = (text, re) => (text.match(re) ?? []).length;
const out = { rows: rows.length, html_rows: html.length, error_rows: errors.length };

const normalized = html.map((r) => ({ id: r.id, raw: r.result.html, out: normalizeHtml(r.result.html) }));

const collapse = { ops: 0, tokens: 0, ops_ids: [] };
for (const n of normalized) {
  const raw = count(n.raw, COLLAPSE_ID);
  if (raw) { collapse.ops++; collapse.tokens += raw; collapse.ops_ids.push(n.id); }
}
out.N4_collapse_id_ops = collapse.ops;
out.N4_collapse_id_tokens = collapse.tokens;
out.N4_collapse_id_op_ids = collapse.ops_ids;

const elapsed = { ops: 0, spans: 0, phrases: {} };
for (const n of normalized) {
  const k = count(n.out, /N5#elapsed/g);
  if (k) { elapsed.ops++; elapsed.spans += k; }
}
for (const n of normalized) for (const m of n.raw.matchAll(RELATIVE_TIME)) elapsed.phrases[m[0]] = (elapsed.phrases[m[0]] ?? 0) + 1;
out.N5_relative_time = elapsed;

out.N6_frame_list_rewrites = normalized.reduce((s, n) => s + count(n.out, /N6#frames/g), 0);
out.N7_path_rewrites = normalized.reduce((s, n) => s + count(n.out, /N7#path/g), 0);
out.N7_addr_rewrites = normalized.reduce((s, n) => s + count(n.out, /N7#addr/g), 0);
out.debug_page_marker_rows = normalized.filter((n) => n.raw.includes("Error message (visible to admin only)")).length;

const groups = {};
for (const r of errors) {
  const key = `${r.error.class} | ${r.error.message}`;
  groups[key] = (groups[key] ?? 0) + 1;
}
out.N8_recorded_failures = { groups, canonical_class: [...new Set(errors.map((r) => canonicalErrorClass(r.error.class)))], ids: errors.map((r) => r.id) };

console.log(JSON.stringify(out, null, 2));
```

Recorded output at the time of measurement:

- rows 2,573, HTML rows 2,540, error rows 24;
- N4: 30 operations, 84 tokens;
- N5: 22 operations, 180 spans (179 "less than a minute", 1 "2 days");
- N6 and N7: zero rewrites, zero debug-page rows;
- N8: 24 recorded failures in one group, canonical class `CodenameNotFound`.

### B. Engine run and grade (engine run)

The grader needs the fixture directory to carry its manifest name, `synthetic-v2`.
The runner and grader print the withheld set as `NOT RUN` when it is absent.
To grade the public operations only, copy the fixture to a scratch directory named
`synthetic-v2`, remove its `withheld` directory, and run from there.

```
node reference-harness/runner/run.mjs --adapter reference-harness/adapters/ts-composed/adapter.json \
     --fixture <scratch>/synthetic-v2 --out <scratch>/results
node reference-harness/runner/grade.mjs --fixture <scratch>/synthetic-v2 \
     --actual <scratch>/results --report <scratch>/report.json
```

The rendering line of the grade names the identical count and the reproduced
upstream failures. `report.json` holds `summary`, `failures` and `reproduced`.
Its `normalization` field lists the canonical forms the grade reached, in rule
order. A form is named when its pattern occurs in a value the grade compared,
on either side; a form whose pattern never occurs is not named. On this grade
that is N1 to N8.

### C. What each rule changes (engine run)

Removing one rule means editing a copy of `runner/normalize.mjs`. The copy has no
imports, so it can sit anywhere.

- Without N4: change `  const collapse = (text) =>` to `  const collapse = (text) => text;` followed by `  const unusedCollapse = (text) =>`, which leaves the old body unused.
- Without N5: change `const elapse = (text) => text.replace(RELATIVE_TIME, "N5#elapsed");` to `const elapse = (text) => text;`.
- Without N8: in `canonicalErrorClass`, replace the body after the first guard with `return name;`.

Save this script as `outcomes.mjs` in the scratch directory. It gives each
operation's outcome under the normalizer named by `NORM`:

```js
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const N = await import(process.env.NORM ?? "./reference-harness/runner/normalize.mjs");
const parse = (text) => text.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
const expected = parse(gunzipSync(readFileSync("reference-harness/fixtures/synthetic-v2/expected/render.jsonl.gz")).toString("utf8"));
const engine = new Map(parse(readFileSync(`${process.env.RESULTS}/render.jsonl`, "utf8")).map((r) => [r.id, r]));

const identical = [], reproduced = [], failing = [];
for (const e of expected) {
  const a = engine.get(e.id);
  if (e.error !== undefined) {
    if (a?.error && N.sameFailure(e.error, a.error)) reproduced.push(e.id);
    else failing.push(e.id);
    continue;
  }
  if (!a || a.error) { failing.push(e.id); continue; }
  const ok = N.sameJson(N.normalizeRender(e.result), N.normalizeRender(a.value ?? a.result));
  (ok ? identical : failing).push(e.id);
}
writeFileSync(process.env.OUT, JSON.stringify({ identical: identical.length, reproduced: reproduced.length, failing: failing.length, identical_ids: identical, reproduced_ids: reproduced, failing_ids: failing }, null, 1));
console.log(process.env.OUT, "identical", identical.length, "reproduced", reproduced.length, "failing", failing.length);
```

Run it from the repository root, once with the repository's normalizer and once
per ablated copy, each time with a different `OUT`:

```
RESULTS=<scratch>/results OUT=<scratch>/full.json node --input-type=module < <scratch>/outcomes.mjs
RESULTS=<scratch>/results NORM=file:///<scratch>/normalize-noN4.mjs OUT=<scratch>/noN4.json node --input-type=module < <scratch>/outcomes.mjs
```

Recorded results (2026-10-14):

| Normalizer | Identical | Reproduced | Failing |
|---|---|---|---|
| Full | 2,529 | 24 | 20 |
| Without N4 | 2,499 | 24 | 50 |
| Without N5 | 2,529 | 24 | 20 |
| Without N8 | 2,529 | 0 | 44 |

The changed operations are exactly the 30 collapse-id operations for N4, none for
N5, and the 24 recorded failures for N8.

### D. Oracle-versus-engine pair accounting (engine run)

`runner/compare-runs.mjs` takes two run directories. Given the committed expected
outputs and an engine run, it prints the per-rule accounting, with labels that
follow the numbering above:

```
node reference-harness/runner/compare-runs.mjs reference-harness/fixtures/synthetic-v2/expected <scratch>/results
```

Its rule lines for this capture read: N4 collapse ids, 84 of 84 paired tokens
differ; N5 relative-time spans, 0 of 174 differ. Its exit status is 1 here,
because the tool expects two runs of one engine, and the engine run differs from
the oracle on 20 items.

## Known gaps

1. **The Ruby-side figures are recorded, not repeated.** The two-run figures in N4 were measured with Ruby 3.3.12 and decko 0.20.0 at an earlier revision. The oracle application here declares decko 0.20.0 in its lock file. Repeating the measurement requires installing the oracle's gems.
2. **Withheld facts are not re-measurable from the public package.** N6 and N7 rest on the eight withheld debug-page operations. Their rules have unit tests; their effect on the real capture is measured only in a checkout that holds the withheld set.
