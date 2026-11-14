// READER: what does a port mod file register?
//
// Two questions, asked of one port-side file:
//
//   1. Which set paths does the file register, and which view and event
//      names does it register on each?
//   2. Which comments and string literals are in the way of reading that
//      answer straight off the text?
//
// THE COMMENT STRIPPER IS A LEXER, NOT A REGEX, AND IT HAS TO BE.
// A regex that removes /* ... */ pairs first reads a "/*" that sits inside
// a LINE comment as a block-comment opener, and then swallows the real
// code up to the next "*/". In src/card/mod-loader/mods/card-mod-account.ts
// the line
//
//   // /*signin titled body rendered the card's EMPTY RichText content and
//
// (line 1616) did exactly that: 41969 characters of the file were removed
// as one "comment", every set path after it (self/signin, type/role,
// type/signup, type/user, the type_plus_right trio) went unread, and the
// census reported eight gem set files as having no port registration when
// the port registers all twenty-three of them.
//
// So this walks the text the way a lexer does: string literals (single,
// double and backtick) and their escapes are tracked, and only a "/"
// that is not inside a string and not already inside a comment opens a
// comment.
//
// A "view:" or "event:" name is attributed to the set path whose manifest
// entry CONTAINS it: the registration block that follows a setPath: "..."
// marker up to the next setPath: "..." marker. That is the shape the mod
// files use - a manifest array whose entries carry setPath, events and a
// formats block of views.

/**
 * Remove comments from TypeScript source text, keeping string literals
 * intact. Line comments, block comments, single-quoted, double-quoted and
 * backtick strings, and backslash escapes inside strings are all tracked.
 *
 * @param {string} text
 * @returns {string}
 */
export function stripComments(text) {
  let out = "";
  let index = 0;
  let inLineComment = false;
  let inBlockComment = false;
  let quote = null;
  while (index < text.length) {
    const two = text.slice(index, index + 2);
    if (inLineComment) {
      if (text[index] === "\n") {
        inLineComment = false;
        out += "\n";
      }
      index += 1;
      continue;
    }
    if (inBlockComment) {
      if (two === "*/") {
        inBlockComment = false;
        index += 2;
        continue;
      }
      if (text[index] === "\n") out += "\n";
      index += 1;
      continue;
    }
    if (quote !== null) {
      out += text[index];
      if (text[index] === "\\") {
        out += text[index + 1] ?? "";
        index += 2;
        continue;
      }
      if (text[index] === quote) quote = null;
      index += 1;
      continue;
    }
    if (two === "//") {
      inLineComment = true;
      index += 2;
      continue;
    }
    if (two === "/*") {
      inBlockComment = true;
      index += 2;
      continue;
    }
    if (text[index] === '"' || text[index] === "'" || text[index] === "`") {
      quote = text[index];
      out += text[index];
      index += 1;
      continue;
    }
    out += text[index];
    index += 1;
  }
  return out;
}

/**
 * Read the manifest registrations out of a port mod file's text.
 *
 * @param {string} portText the whole file
 * @returns {{ setPaths: string[], bySetPath: Map<string, { views: string[], events: string[] }> }}
 */
export function readPortSetPathRegistrations(portText) {
  const stripped = stripComments(portText);
  const bySetPath = new Map();
  const chunks = stripped.split(/setPath:\s*"/);
  for (let i = 1; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    const name = chunk.slice(0, chunk.indexOf('"'));
    const body = chunk.split(/setPath:\s*"/)[0];
    const views = new Set();
    const events = new Set();
    for (const match of body.matchAll(/view:\s*"([a-z_0-9]+)"/g)) views.add(match[1]);
    for (const match of body.matchAll(/event:\s*"([a-z_0-9]+)"/g)) events.add(match[1]);
    if (!bySetPath.has(name)) {
      bySetPath.set(name, { views, events });
    }
  }
  // A set path can also be registered through a HELPER call, which the
  // setPath: scan above cannot see. card-mod-bootstrap.ts registers ten of
  // its twenty-four set paths that way:
  //
  //   const passiveSetModule = (setPath: string): ModSetModuleFile => ({
  //     setPath,
  //     formats: { html: { views: [] } },
  //   });
  //   ...
  //   passiveSetModule("all/bootstrap/accordion"),
  //
  // The census read those ten gem set files as having no port
  // registration. A call whose name carries "setModule" is read here, and
  // the names in its argument text are attributed to it.
  for (const match of stripped.matchAll(
    /\b[A-Za-z_$][\w$]*[sS]etModule[A-Za-z0-9_$]*\s*\(\s*"([^"]+)"([^)]*)\)/g,
  )) {
    const name = match[1];
    if (bySetPath.has(name)) continue;
    const views = new Set();
    const events = new Set();
    for (const viewMatch of match[2].matchAll(/view:\s*"([a-z_0-9]+)"/g)) {
      views.add(viewMatch[1]);
    }
    for (const eventMatch of match[2].matchAll(/event:\s*"([a-z_0-9]+)"/g)) {
      events.add(eventMatch[1]);
    }
    bySetPath.set(name, { views, events });
  }
  // A set path can also be registered through the loader's DSL, which
  // carries the same information in a different shape:
  //
  //   set("type/markdown", ({ format }) => {
  //     format("html", ({ view }) => {
  //       view("core", markdownCoreView);
  //     });
  //   });
  //
  // The setPath: scan above cannot see it, so card-mod-markdown read as
  // registering no set path at all. A call named "set" with a string path
  // is read here, and the view and event names inside its argument text
  // are attributed to it.
  // The callee must be the loader's set(), not a method named set on some
  // other object: voo.classUps.set("help-text", prevAlert) is a Map write,
  // not a set-module registration.
  for (const match of stripped.matchAll(/(?<![.\w$])set\(\s*"([^"]+)"/g)) {
    const name = match[1];
    const start = match.index + match[0].length;
    const argument = balancedArgumentText(stripped, start);
    const views = new Set();
    const events = new Set();
    for (const viewMatch of argument.matchAll(/\bview\(\s*"([a-z_0-9]+)"/g)) {
      views.add(viewMatch[1]);
    }
    for (const eventMatch of argument.matchAll(/\bevent\(\s*"([a-z_0-9]+)"/g)) {
      events.add(eventMatch[1]);
    }
    const existing = bySetPath.get(name);
    if (existing === undefined) {
      bySetPath.set(name, { views, events });
      continue;
    }
    for (const view of views) existing.views.add(view);
    for (const event of events) existing.events.add(event);
  }
  return {
    setPaths: [...bySetPath.keys()],
    bySetPath: new Map(
      [...bySetPath.entries()].map(([setPath, entry]) => [
        setPath,
        { views: [...entry.views].sort(), events: [...entry.events].sort() },
      ]),
    ),
  };
}

/**
 * The argument text of a call, from the "(" to its matching ")".
 * Braces, brackets and parens are counted, and a string literal is
 * skipped whole so a paren inside a string does not unbalance the count.
 *
 * @param {string} text
 * @param {number} start the index just after the opening paren
 * @returns {string}
 */
function balancedArgumentText(text, start) {
  let depth = 1;
  let index = start;
  let quote = null;
  while (index < text.length && depth > 0) {
    const character = text[index];
    if (quote !== null) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      index += 1;
      continue;
    }
    if (character === "(" || character === "{" || character === "[") depth += 1;
    else if (character === ")" || character === "}" || character === "]") depth -= 1;
    index += 1;
  }
  return text.slice(start, index);
}
