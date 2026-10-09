// What a user sees, captured from the live page and normalised so that two
// engines can be compared. Normalisation (browser rules, applied to both
// sides; everything else is compared exactly):
//
//   B1. Text is the page's rendered text (innerText), whitespace collapsed.
//   B2. Relative times ("3 minutes ago") and calendar dates become <time>:
//       one engine may run on a pinned clock and the other on the wall clock.
//   B3. Structure is the element tree of the main area as tag plus sorted
//       classes; ids, data attributes and inline styles are left out, and
//       the classes Decko draws at random per render are masked.
//   B4. Fields are the visible form controls of the page by name and type.
//   B5. The URL is compared as path and query, decoded, without the host;
//       the server's own address inside text becomes <origin>.

export const SNAPSHOT_JS = () => {
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "svg", "SVG", "IFRAME"]);
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
  };
  const main = document.querySelector("#main") || document.body;
  const lines = [];
  const walk = (el, depth) => {
    for (const child of el.children) {
      if (SKIP.has(child.tagName)) continue;
      if (!visible(child) && !child.querySelector("input,textarea,select")) continue;
      const cls = [...child.classList].sort().join(".");
      lines.push(`${"  ".repeat(depth)}${child.tagName.toLowerCase()}${cls ? "." + cls : ""}`);
      walk(child, depth + 1);
    }
  };
  walk(main, 0);
  const fields = [...document.querySelectorAll("input,textarea,select,button")]
    .filter((f) => f.type !== "hidden" && (visible(f) || f.type === "file"))
    .map((f) => `${f.tagName.toLowerCase()}[${f.type || ""}] ${f.name || ""}`.trim());
  return {
    title: document.title,
    text: document.body ? document.body.innerText : "",
    mainText: main.innerText ?? "",
    structure: lines,
    fields,
  };
};

const MONTHS = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*";
const TIME_PATTERNS = [
  /\b(?:less than |about |over |almost )?(?:a|an|\d+) (?:second|minute|hour|day|month|year)s?(?: ago)?\b/gi,
  /\bless than a minute\b/gi,
  new RegExp(`\\b${MONTHS}\\.? \\d{1,2}(?:st|nd|rd|th)?,? \\d{4}\\b`, "g"),
  new RegExp(`\\b\\d{1,2} ${MONTHS} \\d{4}\\b`, "g"),
  /\b\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?Z?)?\b/g,
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
];

export function normText(s) {
  let t = String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/https?:\/\/127\.0\.0\.1:\d+/g, "<origin>");
  for (const re of TIME_PATTERNS) t = t.replace(re, "<time>");
  return t;
}

// Classes Decko generates per render (collapse/accordion ids and the like).
const RANDOM_CLASS = /\b[a-z0-9_-]*(?:[0-9a-f]{10,}|\d{6,})[a-z0-9_-]*\b/gi;

export function normStructure(lines) {
  return (lines ?? []).map((l) => l.replace(RANDOM_CLASS, "RAND"));
}

export function normUrl(url) {
  try {
    const u = new URL(url);
    let q = decodeURIComponent(u.search.replace(/\+/g, " "));
    return decodeURIComponent(u.pathname) + q;
  } catch {
    return String(url);
  }
}

/** One observation, normalised. `status` is the last main-frame navigation's HTTP status. */
export function normalizeObservation(raw) {
  return {
    url: normUrl(raw.url),
    status: raw.status ?? null,
    title: normText(raw.title),
    text: normText(raw.text),
    mainText: normText(raw.mainText),
    structure: normStructure(raw.structure),
    fields: raw.fields ?? [],
  };
}
