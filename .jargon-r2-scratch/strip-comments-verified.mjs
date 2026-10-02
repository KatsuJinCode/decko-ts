// Comment-strip, two independent implementations, for the tranche-2 scrub proof.
//
// Why not the original bare-scanner strip (comment-proof.mjs): a bare scanner
// has no parser context, so after a template substitution (`${x}`) it cannot
// know the closing backtick is a TemplateTail; it starts a NEW template token
// that swallows everything up to the next backtick. Comment text downstream of
// the first `${` lands in the "executable" stream -> false EXECUTABLE DRIFT.
//
// stripScanner: scanner + a stack of open template substitutions, each entry
// counting its own { } nesting so a brace BLOCK inside a substitution does not
// trigger the re-scan; reScanTemplateToken() only when the substitution's own
// closing } arrives. Template literal TEXT is kept (it is content).
// stripAst: parse a full AST, collect every leading+trailing comment range of
// every node, delete those byte ranges. Correct by construction.
// Verify on all 61 files: the two must agree byte-for-byte. Different failure
// modes agreeing is the evidence the strip is right.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('C:/localProjects/csdm-release/node_modules/typescript');

export function stripScanner(text) {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false, // skipTrivia=false so whitespace/newline tokens are kept
    ts.LanguageVariant.Standard,
    text,
  );
  const parts = [];
  // Stack of open `${ ... }` substitutions; each entry counts open { blocks.
  const subs = [];
  let tok;
  while ((tok = scanner.scan()) !== ts.SyntaxKind.EndOfFileToken) {
    switch (tok) {
      case ts.SyntaxKind.TemplateHead:
        subs.push({ braces: 0 }); // its trailing ${ opens a substitution
        parts.push(scanner.getTokenText());
        continue;
      case ts.SyntaxKind.OpenBraceToken:
        if (subs.length > 0) subs[subs.length - 1].braces++;
        break;
      case ts.SyntaxKind.CloseBraceToken: {
        if (subs.length > 0 && subs[subs.length - 1].braces > 0) {
          subs[subs.length - 1].braces--; // brace block inside the expression
          break;
        }
        if (subs.length === 0) break; // plain code brace, not a substitution end
        tok = scanner.reScanTemplateToken(); // -> TemplateMiddle | TemplateTail
        if (tok === ts.SyntaxKind.TemplateMiddle) {
          subs.pop(); // substitution closed; token ends with ${, so reopen
          subs.push({ braces: 0 });
        } else {
          subs.pop(); // TemplateTail: literal fully closed
        }
        parts.push(scanner.getTokenText());
        continue;
      }
      case ts.SyntaxKind.SingleLineCommentTrivia:
      case ts.SyntaxKind.MultiLineCommentTrivia:
        continue;
      default:
        break;
    }
    parts.push(scanner.getTokenText());
  }
  return parts.join('');
}

export function stripAst(text) {
  const sf = ts.createSourceFile('x.ts', text, ts.ScriptTarget.Latest, true);
  const ranges = [];
  const add = (r) => {
    if (r) ranges.push(...r);
  };
  // Walk ALL children INCLUDING punctuation tokens (getChildren, unlike
  // forEachChild, yields comma/semicolon/brace token nodes). TS splits trivia
  // at the newline: each token owns a same-line TRAILING window (after its
  // end) and the next token owns the post-newline LEADING window. A comment
  // after a comma (e.g. `content: undefined, // note`) is in the COMMA's
  // trailing window — invisible to node-level enumeration, caught here.
  const visit = (node) => {
    add(ts.getLeadingCommentRanges(text, node.getFullStart()));
    add(ts.getTrailingCommentRanges(text, node.getEnd()));
    for (const child of node.getChildren(sf)) visit(child);
  };
  visit(sf);
  // Windows overlap (trailing of N = leading of N+1); merge, then delete.
  ranges.sort((a, b) => a.pos - b.pos || a.end - b.end);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.pos <= last.end) {
      if (r.end > last.end) last.end = r.end;
      continue;
    }
    merged.push({ pos: r.pos, end: r.end });
  }
  let out = '';
  let at = 0;
  for (const r of merged) {
    out += text.slice(at, r.pos);
    at = Math.max(at, r.end);
  }
  return out + text.slice(at);
}
