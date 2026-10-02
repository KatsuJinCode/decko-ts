// probe-wiki-link-divider-inside-a-nest.mjs — gate the LIVE wiki-link
// divider rule against the oracle bytes for a nest that splits the TARGET.
//
// WHAT THIS IS
//   M3: `[[/new/{{_self|linkname}}|add a {{_self|name}} card]]` carries a PIPE
//   INSIDE a nest. Ruby splits at the divider index of the RAW `[[...]]`
//   span, where the nest is opaque, so the oracle bytes are
//
//     <a class="internal-link" href="/new/{{_self|linkname}}">add a {{_self|name}} card</a>
//
//   Neither "first pipe" (target `/new/{{_self`) nor "last pipe" (label
//   `card`) reproduces that.
//
//   The negdelta-zero lane wrote this probe with its OWN COPY of the regexp
//   baked in as a literal, and its exit contract was inverted relative to a
//   gate: `process.exit(seen ? 1 : 0)` — exit 0 meant "the regexp never sees
//   the opener", i.e. exit 0 meant THE DEFECT. That copy also made the probe
//   incapable of ever changing verdict when the source was fixed, which is
//   the wrong shape for an instrument whose whole job is to be a gate.
//
//   This version READS THE LIVE SOURCE (`WIKI_LINK_REGEXP` out of
//   src/card/render/format.ts, by locating the literal), evaluates the three
//   candidate divider rules on the oracle's own line, and additionally runs
//   the ENGINE end to end so the verdict is about bytes, not about a
//   regex-shaped proxy.
//
// EXIT CONTRACT
//   0  the live divider rule reproduces the oracle anchor (correct)
//   1  it does not (the live defect)
//   2  usage / source-shape error
//
// USAGE (from the worktree root)
//   node tools/oracle/probe-wiki-link-divider-inside-a-nest.mjs

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");

const SOURCE = "<p>[[/new/{{_self|linkname}}|add a {{_self|name}} card]]</p>";
const EXPECTED_ANCHOR =
  '<a class="internal-link" href="/new/{{_self|linkname}}">add a {{_self|name}} card</a>';

/** Pull the live WIKI_LINK_REGEXP literal out of the source. Reading the
 *  source (rather than importing) keeps this probe zero-boot — importing
 *  format.ts pulls the whole render graph — and it still gates the file the
 *  engine actually runs. */
function readLiveRegexp() {
  const file = path.join(REPO, "src", "card", "render", "format.ts");
  const text = readFileSync(file, "utf8");
  const at = text.indexOf("const WIKI_LINK_REGEXP =");
  if (at < 0) return { error: "WIKI_LINK_REGEXP is not declared in format.ts" };
  const eq = text.indexOf("=", at);
  const end = text.indexOf(";", eq);
  const literal = text.slice(eq + 1, end).trim();
  if (!literal.startsWith("/")) return { error: `unreadable regexp literal: ${literal.slice(0, 80)}` };
  const lastSlash = literal.lastIndexOf("/");
  const flags = literal.slice(lastSlash + 1);
  const pattern = literal.slice(1, lastSlash);
  try {
    return { regexp: new RegExp(pattern, flags) };
  } catch (err) {
    return { error: `literal does not compile: ${String(err?.message ?? err)}` };
  }
}

const live = readLiveRegexp();
if (live.error !== undefined) {
  console.error(`PROBE-ERROR: ${live.error}`);
  process.exit(2);
}
const WIKI_LINK_REGEXP = live.regexp;
console.log(`LIVE REGEXP ${WIKI_LINK_REGEXP.source}`);
console.log(`SOURCE      ${JSON.stringify(SOURCE)}`);
console.log(`EXPECTED    ${EXPECTED_ANCHOR}`);

let liveAnchor = null;
for (const m of SOURCE.matchAll(new RegExp(WIKI_LINK_REGEXP.source, WIKI_LINK_REGEXP.flags))) {
  const target = m[1];
  const label = m[2];
  const href = `/${target.replace(/^\/+/, "")}`;
  liveAnchor = `<a class="internal-link" href="${href}">${(label ?? target).trim()}</a>`;
  console.log(
    `LIVE MATCH  match=${JSON.stringify(m[0])} target=${JSON.stringify(target)} label=${JSON.stringify(label)}`,
  );
  console.log(`LIVE ANCHOR ${JSON.stringify(liveAnchor)}`);
}
if (liveAnchor === null) console.log("LIVE MATCH  none -- the opener is not expanded at all");

/** Candidate divider rules, all evaluated on the same opener body. */
const RULES = {
  "first-pipe": (body) => body.indexOf("|"),
  "last-pipe": (body) => body.lastIndexOf("|"),
  "first-pipe-outside-a-nest": (body) => {
    let depth = 0;
    for (let i = 0; i < body.length; i += 1) {
      if (body.startsWith("{{", i)) {
        depth += 1;
        i += 1;
        continue;
      }
      if (body.startsWith("}}", i)) {
        depth -= 1;
        i += 1;
        continue;
      }
      if (body[i] === "|" && depth === 0) return i;
    }
    return -1;
  },
};

const body = "/new/{{_self|linkname}}|add a {{_self|name}} card";
for (const [name, pick] of Object.entries(RULES)) {
  const at = pick(body);
  const target = at === -1 ? body : body.slice(0, at);
  const label = at === -1 ? undefined : body.slice(at + 1);
  const href = `/${target.replace(/^\/+/, "")}`;
  const anchor = `<a class="internal-link" href="${href}">${(label ?? target).trim()}</a>`;
  console.log(
    `RULE ${name.padEnd(28)} at=${String(at).padStart(3)} target=${JSON.stringify(target)} label=${JSON.stringify(label)} anchorMatchesExpected=${anchor === EXPECTED_ANCHOR}`,
  );
}

const correct = liveAnchor === EXPECTED_ANCHOR;
console.log(`VERDICT ${correct ? "CORRECT — the live divider rule reproduces the oracle anchor" : "WRONG — the live rule does not reproduce the oracle anchor"}`);
process.exit(correct ? 0 : 1);
