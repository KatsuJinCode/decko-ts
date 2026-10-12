// The page-diff second-pass walker: given slot-normalized expected and
// actual page bytes, trims the common prefix/suffix, then walks the
// divergent middle with a wide resync window and 24-char anchors, emitting
// at most MAX_REGIONS regions and classifying each into the known
// divergence families (quote-style, whitespace-only, class-token,
// href-name-case, d-permission-denied, double-escape, ...). Shared by the
// replay specs that record per-region mechanism evidence alongside their
// byte-parity verdicts.
export const RESYNC_WINDOW = 2000;
export const ANCHOR_K = 24;
export const MAX_REGIONS = 40;
export const SPAN_CAP = 160;
export const CTX = 90;

export interface WalkRegion {
  p: number;
  q: number;
  expSpan: string;
  actSpan: string;
  expCtx: string;
  actCtx: string;
  expRemainder: number;
  actRemainder: number;
  cls: string;
}

export function classifyRegion(
  expSpan: string,
  actSpan: string,
  expCtx: string | undefined,
): string {
  const e = expSpan;
  const a = actSpan;
  if (e.length === 0 && a.length === 0) return "empty";
  // quoting style: identical after unifying quote chars
  const stripQ = (s: string) => s.replace(/['"]/g, '"');
  if (e.length <= 200 && a.length <= 200 && stripQ(e) === stripQ(a)) return "quote-style";
  // whitespace-only
  if (e.replace(/\s+/g, "") === a.replace(/\s+/g, "")) return "whitespace-only";
  // newline vs tag: one side introduces a newline the other doesn't have
  if ((e === "\n" && a === "<") || (e === "<" && a === "\n")) return "newline-vs-tag";
  if (Math.max(e.length, a.length) <= 3) {
    // single/few-char swap -- token family if token chars
    if (/^[A-Za-z0-9_\-+*:X]*$/.test(e) && /^[A-Za-z0-9_\-+*:X]*$/.test(a)) return "token-swap";
    return "small-swap";
  }
  // class attribute context
  if (/class="[^"]*$/.test(expCtx ?? "")) {
    if (/^[\w\- +*:X]+$/.test(e) && /^[\w\- +*:X]+$/.test(a)) return "class-token";
  }
  // url/query escaping: spans differ only around ? & = escapes
  const unesc = (s: string) =>
    s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  if (e.length <= 300 && a.length <= 300 && unesc(e) === unesc(a)) return "html-entity-escape";
  // href/link name-case: expected /Name_Caps vs actual /name_key (same letters)
  const hrefCase = (s: string) => {
    const m = /\/([A-Za-z0-9_+%*]+)\s*$/.exec(s);
    return m ? m[1].toLowerCase().replace(/[^a-z0-9_+%*]/g, "") : null;
  };
  if (e.length <= 120 && a.length <= 120) {
    const he = hrefCase(e);
    const ha = hrefCase(a);
    if (he !== null && ha !== null && he === ha && e !== a) return "href-name-case";
  }
  // full-page/wanted-card link query dropped: expected href carries the
  // ?card[name]=... query, actual href ends without it
  if (/card%5Bname%5D=|card\[name\]=/.test(e) && !/card%5Bname%5D=|card\[name\]=/.test(a)) {
    return "link-query-dropped";
  }
  // wrong permission verdict: one side renders the denied stub
  const denied = /class="denied"|Sorry, you don't have permission/i;
  if (denied.test(e) !== denied.test(a)) return "d-permission-denied";
  // double-escaping: one side carries entity-escape fragments the other lacks
  if (/amp;/.test(a) && !/amp;/.test(e)) return "double-escape";
  if (/amp;/.test(e) && !/amp;/.test(a)) return "double-escape";
  // target attribute placement
  if (/target="_blank"/.test(e) || /target="_blank"/.test(a)) return "attr-target-placement";
  // attribute-boundary drift: spans differ but both are mostly attribute text
  if (e.length <= 300 && a.length <= 300 && /=" /.test(e + a)) {
    const norm = (s: string) => s.replace(/\s+/g, " ").replace(/['"]/g, '"').trim();
    if (norm(e).split(" ").sort().join(" ") === norm(a).split(" ").sort().join(" ")) {
      return "attr-order-or-quoting";
    }
  }
  return "content-divergence";
}

export function walkDiff(exp: string, act: string): { regions: WalkRegion[]; resyncFailed: boolean } {
  const n = Math.min(exp.length, act.length);
  let prefix = 0;
  while (prefix < n && exp[prefix] === act[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < n - prefix &&
    exp[exp.length - 1 - suffix] === act[act.length - 1 - suffix]
  ) {
    suffix++;
  }
  const regions: WalkRegion[] = [];
  let i = prefix;
  let j = prefix;
  const eEnd = exp.length - suffix;
  const aEnd = act.length - suffix;
  let resyncFailed = false;
  while (i < eEnd || j < aEnd) {
    while (i < eEnd && j < aEnd && exp[i] === act[j]) {
      i++;
      j++;
    }
    if (i >= eEnd || j >= aEnd) {
      regions.push({
        p: i,
        q: j,
        expSpan: exp.slice(i, Math.min(eEnd, i + SPAN_CAP)),
        actSpan: act.slice(j, Math.min(aEnd, j + SPAN_CAP)),
        expCtx: exp.slice(Math.max(0, i - CTX), i),
        actCtx: act.slice(Math.max(0, j - CTX), j),
        expRemainder: eEnd - i,
        actRemainder: aEnd - j,
        cls: "tail-exhaust",
      });
      resyncFailed = true;
      break;
    }
    let found: { a: number; b: number } | null = null;
    outer: for (let d = 0; d <= 2 * RESYNC_WINDOW; d++) {
      for (let a2 = Math.max(0, d - RESYNC_WINDOW); a2 <= Math.min(d, RESYNC_WINDOW); a2++) {
        const b2 = d - a2;
        if (i + a2 + ANCHOR_K > eEnd || j + b2 + ANCHOR_K > aEnd) continue;
        if (exp.slice(i + a2, i + a2 + ANCHOR_K) === act.slice(j + b2, j + b2 + ANCHOR_K)) {
          found = { a: a2, b: b2 };
          break outer;
        }
      }
    }
    if (found === null) {
      regions.push({
        p: i,
        q: j,
        expSpan: exp.slice(i, Math.min(eEnd, i + SPAN_CAP)),
        actSpan: act.slice(j, Math.min(aEnd, j + SPAN_CAP)),
        expCtx: exp.slice(Math.max(0, i - CTX), i),
        actCtx: act.slice(Math.max(0, j - CTX), j),
        expRemainder: eEnd - i,
        actRemainder: aEnd - j,
        cls: "tail-exhaust",
      });
      resyncFailed = true;
      break;
    }
    if (regions.length < MAX_REGIONS) {
      regions.push({
        p: i,
        q: j,
        expSpan: exp.slice(i, Math.min(i + found.a, i + SPAN_CAP)),
        actSpan: act.slice(j, Math.min(j + found.b, j + SPAN_CAP)),
        expCtx: exp.slice(Math.max(0, i - CTX), i),
        actCtx: act.slice(Math.max(0, j - CTX), j),
        expRemainder: found.a - ANCHOR_K,
        actRemainder: found.b - ANCHOR_K,
        cls: "",
      });
    }
    i += found.a;
    j += found.b;
    if (regions.length >= MAX_REGIONS) break;
  }
  for (const r of regions) {
    if (r.cls === "") r.cls = classifyRegion(r.expSpan, r.actSpan, r.expCtx);
  }
  return { regions, resyncFailed };
}
