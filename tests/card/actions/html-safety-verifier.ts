// An independent check of stored HTML, written separately from the cleaner so
// a defect in one is not repeated in the other. It tokenizes a fragment the
// way a browser's HTML tokenizer does (data state, tag open, tag name,
// attribute states, comments, bogus comments; HTML Living Standard 13.2.5)
// and reports every construct that could run script or escape the fragment:
//
//   - a start or end tag outside the cleaner's allowlist;
//   - an attribute outside the tag's allowlist, or any "on..." attribute;
//   - a URL attribute whose decoded value names a script-capable scheme;
//   - a style attribute with a script-capable construct;
//   - a fragment that ends inside a tag, an attribute value, a comment or a
//     declaration (it would absorb the markup the page puts after it).

const ALLOWED: Record<string, readonly string[]> = (() => {
  const plain = [
    "br", "i", "b", "pre", "cite", "caption", "strong", "em", "ins", "sup", "sub", "del", "hr",
    "li", "p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "span", "tr", "tbody", "thead", "tfoot",
  ];
  const map: Record<string, string[]> = {};
  for (const t of plain) map[t] = [];
  map["a"] = ["href", "title", "target"];
  map["img"] = ["src", "alt", "title"];
  map["code"] = ["lang"];
  map["blockquote"] = ["cite"];
  map["ol"] = ["type"];
  map["ul"] = ["type"];
  map["table"] = ["cellpadding", "align", "border", "cellspacing", "data-mce-style"];
  map["td"] = ["scope", "data-mce-style"];
  map["th"] = ["scope", "data-mce-style"];
  for (const k of Object.keys(map)) map[k]!.push("class", "style");
  return map;
})();

const SPACE = /[\t\n\f\r ]/;

function decode(value: string): string {
  return value.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[A-Za-z]+);?/g, (whole, body: string) => {
    if (body[0] === "#") {
      const cp = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
    }
    const named: Record<string, string> = { colon: ":", tab: "\t", newline: "\n", lpar: "(", rpar: ")", quot: '"', apos: "'", amp: "&", lt: "<", gt: ">", sol: "/", bsol: "\\" };
    return named[body.toLowerCase()] ?? whole;
  });
}

const DANGEROUS_SCHEME = /^(?:javascript|vbscript|livescript|mocha|data|blob|file|jar|view-source):/;

function urlProblem(tag: string, name: string, raw: string): string | null {
  const v = decode(raw).replace(/[\x00-\x20\x7f-\xa0]/g, "").toLowerCase();
  if (!DANGEROUS_SCHEME.test(v)) return null;
  if (tag === "img" && name === "src" && /^data:image\/(?:png|gif|jpe?g|webp|bmp|avif)[;,]/.test(v)) return null;
  return `${tag}[${name}] has a script-capable URL: ${raw}`;
}

function styleProblem(raw: string): string | null {
  const v = decode(raw)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_m, h: string) => String.fromCodePoint(parseInt(h, 16) || 0xfffd))
    .replace(/\\/g, "")
    .replace(/[\x00-\x20]/g, "")
    .toLowerCase();
  return /expression\(|javascript:|vbscript:|behavior:|-moz-binding|@import/.test(v) ? `unsafe style: ${raw}` : null;
}

export function htmlSafetyProblems(html: string): string[] {
  const problems: string[] = [];
  const n = html.length;
  let i = 0;
  while (i < n) {
    if (html[i] !== "<") {
      i++;
      continue;
    }
    const next = html[i + 1];
    if (next === undefined) {
      problems.push("fragment ends with '<'");
      break;
    }
    if (next === "!") {
      if (html.startsWith("<!--", i)) {
        if (html.startsWith("<!-->", i)) { i += 5; continue; }
        if (html.startsWith("<!--->", i)) { i += 6; continue; }
        const a = html.indexOf("-->", i + 4);
        const b = html.indexOf("--!>", i + 4);
        const end = a === -1 ? b : b === -1 ? a : Math.min(a, b);
        if (end === -1) { problems.push("unterminated comment"); break; }
        i = end + (end === a ? 3 : 4);
        continue;
      }
      const end = html.indexOf(">", i + 2);
      if (end === -1) { problems.push("unterminated declaration"); break; }
      i = end + 1;
      continue;
    }
    if (next === "?") {
      const end = html.indexOf(">", i + 2);
      if (end === -1) { problems.push("unterminated processing instruction"); break; }
      i = end + 1;
      continue;
    }
    let j = i + 1;
    let endTag = false;
    if (next === "/") {
      endTag = true;
      j++;
      if (j >= n) { problems.push("fragment ends with '</'"); break; }
      if (!/[A-Za-z]/.test(html[j]!)) {
        if (html[j] === ">") { i = j + 1; continue; }
        const end = html.indexOf(">", j);
        if (end === -1) { problems.push("unterminated bogus comment"); break; }
        i = end + 1;
        continue;
      }
    } else if (!/[A-Za-z]/.test(next)) {
      i++;
      continue;
    }
    // Tag name.
    let name = "";
    while (j < n && !SPACE.test(html[j]!) && html[j] !== "/" && html[j] !== ">") {
      name += html[j]!.toLowerCase();
      j++;
    }
    const allowed = ALLOWED[name];
    if (allowed === undefined) problems.push(`disallowed tag <${endTag ? "/" : ""}${name}>`);
    // Attributes.
    let closed = false;
    while (j < n) {
      const c = html[j]!;
      if (SPACE.test(c) || c === "/") { j++; continue; }
      if (c === ">") { closed = true; j++; break; }
      let an = c.toLowerCase();
      j++;
      while (j < n && !SPACE.test(html[j]!) && html[j] !== "/" && html[j] !== ">" && html[j] !== "=") {
        an += html[j]!.toLowerCase();
        j++;
      }
      while (j < n && SPACE.test(html[j]!)) j++;
      let value = "";
      if (html[j] === "=") {
        j++;
        while (j < n && SPACE.test(html[j]!)) j++;
        const q = html[j];
        if (q === '"' || q === "'") {
          const end = html.indexOf(q, j + 1);
          if (end === -1) { problems.push("fragment ends inside an attribute value"); j = n; break; }
          value = html.slice(j + 1, end);
          j = end + 1;
        } else {
          while (j < n && !SPACE.test(html[j]!) && html[j] !== ">") value += html[j++];
        }
      }
      if (endTag) continue;
      if (an.startsWith("on")) problems.push(`event handler attribute ${an} on <${name}>`);
      else if (allowed !== undefined && !allowed.includes(an)) problems.push(`disallowed attribute ${an} on <${name}>`);
      if (an === "href" || an === "src" || an === "cite") {
        const p = urlProblem(name, an, value);
        if (p) problems.push(p);
      }
      if (an === "style" || an === "data-mce-style") {
        const p = styleProblem(value);
        if (p) problems.push(p);
      }
    }
    if (!closed) { problems.push(`fragment ends inside <${name}>`); break; }
    i = j;
  }
  return problems;
}
