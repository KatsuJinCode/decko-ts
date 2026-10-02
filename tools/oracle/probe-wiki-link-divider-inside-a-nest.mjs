// probe-wiki-link-divider-inside-a-nest.mjs -- why
// `[[/new/{{_self|linkname}}|add a {{_self|name}} card]]` renders RAW
// (lane-negdelta-zero, M3).
//
// WHAT THIS IS
//   The port's wiki-link regexp (WIKI_LINK_REGEXP, src/card/render/format.ts:3372)
//   is `/\\?\\[\\[([^\\[\\]\\n|]+?)(?:\\|([^\\[\\]\\n]+?))?\\]\\]/g`. Run against the
//   corpus bytes `<p>[[/new/{{_self|linkname}}|add a {{_self|name}} card]]</p>`
//   it reports whether the opener is seen at all, and if so which pipe it
//   divides on.
//
//   The three candidate split rules disagree and the oracle bytes pick one:
//     target `/new/{{_self|linkname}}`, label `add a {{_self|name}} card`
//   which is the SECOND pipe -- neither the first (which would make the
//   target `/new/{{_self`) nor the last (which would make the label `card`).
//   So the divider cannot be "first pipe" or "last pipe"; it has to skip
//   pipes that live inside a `{{ ... }}` nest. This probe prints what the
//   current regexp does and what each candidate rule would produce, so the
//   fix is pinned to the rule the oracle bytes actually show rather than to
//   whichever regex happens to be in the file today.
//
// USAGE (from the worktree root)
//   node tools/oracle/probe-wiki-link-divider-inside-a-nest.mjs
//
//   Exit 0 when the regexp fails to see the opener over the corpus bytes
//   (the live defect), 1 when it already matches.

const SOURCE = "<p>[[/new/{{_self|linkname}}|add a {{_self|name}} card]]</p>";
const EXPECTED_ANCHOR =
  '<a class="internal-link" href="/new/{{_self|linkname}}">add a {{_self|name}} card</a>';

const WIKI_LINK_REGEXP = /\\?\[\[([^\[\]\n|]+?)(?:\|([^\[\]\n]+?))?\]\]/g;

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

console.log(`SOURCE   ${JSON.stringify(SOURCE)}`);
console.log(`EXPECTED ${EXPECTED_ANCHOR}`);

let seen = false;
for (const m of SOURCE.matchAll(WIKI_LINK_REGEXP)) {
  seen = true;
  console.log(`REGEXP MATCH match=${JSON.stringify(m[0])} target=${JSON.stringify(m[1])} label=${JSON.stringify(m[2])}`);
}
if (!seen) console.log("REGEXP MATCH none -- the opener is not expanded at all");

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

process.exit(seen ? 1 : 0);
