// Port the serializer line's census M2 + M2-refit engine change onto the fold
// line's src/card/render/views.ts. Donor state: 43d55e80 (the M2-refit tip).
//
// WHAT THIS IS. Two serializer commits land here as ONE change, deliberately:
//   448f74f5 (M2 GREEN) folded a blanket SETTING_NEVER_VISIBLE drop into
//   visibleSettingsForGroup; 43d55e80 (M2 refit) RETIRED that fold and replaced
//   it with a prototype-type-derivation gate (setPrototypeTypeInfo's
//   `templateDerived`). The intermediate M2 state never survived its own
//   refit, so porting it would be porting a state the donor line itself
//   abandoned. The net effect of M2 + M2-refit is the 43d55e80 state, and that
//   is what this script writes. Both commits' RED pins are the same file and
//   are already in the tree at their 43d55e80 (final) content.
//
// WHY BYTE SPLICE, NOT A PICK. views.ts carries 527 deliberate CRLF carriers;
// a whole-file write collapses them. This script asserts 527/527/0 before AND
// after and refuses to write otherwise. Every replaced string below was read
// off this fold base first (views.ts:3006-3018 and 3069-3201) and every
// replacement string is the donor's bytes.
//
// WHAT IS DELIBERATELY NOT TAKEN. SETTING_NEVER_VISIBLE itself survives on the
// fold base and is still consumed by visibleGroupSettings (the mod-file
// accordion + bar_setting_list flat seam). The refit retires only its use
// inside visibleSettingsForGroup; the donor keeps both, and so does this.
const fs = require("fs");
const { execFileSync } = require("child_process");

const P = "src/card/render/views.ts";
const DONOR_REV = "43d55e80";
const DONOR_REPO = "C:/localProjects/decko-ts-restored";

function crlfCounts(buf) {
  let cr = 0;
  let crlf = 0;
  let lone = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 13) {
      cr++;
      if (buf[i + 1] === 10) crlf++;
      else lone++;
    }
  }
  return { cr, crlf, lone };
}

const BEFORE = crlfCounts(fs.readFileSync(P));
if (BEFORE.crlf !== 527 || BEFORE.lone !== 0) {
  throw new Error(
    `pre-condition failed: ${JSON.stringify(BEFORE)} want crlf=527 lone=0`,
  );
}

const donor = execFileSync("git", ["show", `${DONOR_REV}:${P}`], {
  cwd: DONOR_REPO,
  maxBuffer: 1e9,
}).toString("latin1");
let s = fs.readFileSync(P).toString("latin1");

function replaceOnce(hay, needle, repl, what) {
  const first = hay.indexOf(needle);
  if (first < 0) throw new Error(`${what}: needle not found in ${P}`);
  if (hay.indexOf(needle, first + 1) >= 0) {
    throw new Error(`${what}: needle is NOT unique in ${P} - refusing`);
  }
  return hay.slice(0, first) + repl + hay.slice(first + needle.length);
}

// ---- region 1: visibleSettingsForGroup's filter tail ----------------------
const R1_OLD = [
  "  const prototypeCode = setPrototypeTypeCode(engine, setCard);",
  "  return settings.filter((codename) => {",
  "    const restricted = SETTING_RESTRICTED_TO_TYPE.get(codename);",
  "    if (restricted === undefined) return true;",
  "    return prototypeCode !== undefined && restricted.includes(prototypeCode);",
  "  });",
].join("\n");

// lifted verbatim from the donor, contiguous from the prototypeCode binding to
// the filter's close
const r1Start = donor.indexOf(
  "  const { code: prototypeCode, templateDerived } = setPrototypeTypeInfo(engine, setCard);",
);
if (r1Start < 0) throw new Error("region 1: donor start not found");
const r1End = donor.indexOf("\n  });\n}", r1Start);
if (r1End < 0) throw new Error("region 1: donor end not found");
const R1_NEW = donor.slice(r1Start, r1End + "\n  });".length);

// Idempotence (region 1), same contract as region 2 below.
if (s.includes(R1_NEW)) {
  console.log("region 1: already carries the donor bytes - no-op");
} else {
  s = replaceOnce(s, R1_OLD, R1_NEW, "region 1 visibleSettingsForGroup");
}

// ---- region 2: setPrototypeTypeCode -> setPrototypeTypeInfo + wrapper ------
const R2_OLD_HEAD =
  "export function setPrototypeTypeCode(engine: RenderEngineLike, setCard: RenderCard): string | undefined {";

/** Brace-matched function body, starting the walk AFTER the body's opening
 *  brace (the signature's `{ code: ... }` return-type literal would otherwise
 *  close the walk at depth 0). */
function functionBody(s, head) {
  const i = s.indexOf(head);
  if (i < 0) throw new Error(`no head: ${head.slice(0, 60)}`);
  let depth = 0;
  for (let k = i + head.length; k < s.length; k++) {
    if (s[k] === "{") depth++;
    else if (s[k] === "}") {
      if (depth === 0) return s.slice(i, k + 1);
      depth--;
    }
  }
  throw new Error("unbalanced braces");
}

// The fold base's region-2 text is the pre-refit one-liner-signature form. A
// re-run of this script finds it absent (the wrapper's signature is
// multi-line), so the extraction and the cross-check below are conditional on
// the fold form still being present.
const foldFormPresent = s.includes(R2_OLD_HEAD);
const foldFn = foldFormPresent ? functionBody(s, R2_OLD_HEAD) : "";
if (foldFormPresent && foldFn.length < 5000) {
  throw new Error(`region 2: fold function looks truncated (${foldFn.length} bytes)`);
}

const DONOR_SIG = "function setPrototypeTypeInfo(\n  engine: RenderEngineLike,";
const DONOR_DOC = "/** The prototype-type resolution WITH its derivation";
// The function text starts at its doc block, not its signature: the refit
// introduces the M2 derivation block between the fold line's existing
// "Oracle-verified" block and the new signature, and that block is part of
// the change. The brace walk is anchored on the SIGNATURE'S CLOSE (which is
// where the body's opening `{` is), because a walk anchored mid-signature
// would count the return-type literal's braces and never close.
const DONOR_WALK_FROM = "): { code: string | undefined; templateDerived: boolean } {";
const donorSigAt = donor.indexOf(DONOR_SIG);
if (donorSigAt < 0) throw new Error("region 2: donor signature not found");
const donorDocAt = donor.lastIndexOf(DONOR_DOC, donorSigAt);
if (donorDocAt < 0) throw new Error("region 2: donor doc block not found");
// The replacement text runs from the M2 doc block (which the refit inserts
// between the fold line's "Oracle-verified" block and the new signature)
// through the function's closing brace, so the whole transplanted region is
// contiguous donor bytes.
const donorWalkAt = donor.indexOf(DONOR_WALK_FROM);
if (donorWalkAt < 0) throw new Error("region 2: donor signature tail not found");
const donorTail = functionBody(donor, DONOR_WALK_FROM);
const donorClose = donor.indexOf(donorTail, donorWalkAt) + donorTail.length;
const donorFn = donor.slice(donorDocAt, donorClose);
if (!donorFn.includes(DONOR_SIG)) {
  throw new Error("region 2: the transplanted donor region lost its signature");
}
// The wrapper's leading "" produces ONE newline, which would butt the
// wrapper's doc block straight against setPrototypeTypeInfo's closing brace.
// The donor has a BLANK LINE there, so the array carries two.
const WRAPPER = [
  "",
  "",
  "/** The bare code (the pre-census-M2 signature; the verdict preloads and",
  " *  the ruleSetPrototypeTypeCode verdict arm read it). */",
  "export function setPrototypeTypeCode(",
  "  engine: RenderEngineLike,",
  "  setCard: RenderCard,",
  "): string | undefined {",
  "  return setPrototypeTypeInfo(engine, setCard).code;",
  "}",
].join("\n");
// The donor's own bytes for the whole transplanted region, for the post-check.
const DONOR_REGION_2 = donorFn + WRAPPER;
if (
  !donor.includes(DONOR_REGION_2) ||
  donor.slice(donor.indexOf(DONOR_REGION_2), donor.indexOf(DONOR_REGION_2) + DONOR_REGION_2.length) !==
    DONOR_REGION_2
) {
  throw new Error(
    "region 2: the assembled donor region is NOT contiguous in ${DONOR_REV} - the wrapper text has drifted from the donor. Re-read the donor before writing.",
  );
}

// Cross-check, stated as the property I actually need: the fold function's
// BODY must be the donor function's BODY modulo its return statements and
// nothing else. The two heads legitimately differ (the refit adds a doc block
// and a return type and drops `export`), so the comparison is on the body only.
// If the fold line had drifted into this function since the serializer line
// forked, this fires rather than clobbering fold-line work.
const donorBody = donorFn.slice(
  donorFn.indexOf(DONOR_WALK_FROM) + DONOR_WALK_FROM.length,
  donorFn.lastIndexOf("}"),
);
const normalized = (t) => t.replace(/return [^;]*;/g, "return <R>;");
const foldReturns = [...foldFn.matchAll(/return [^;]*;/g)].map((m) => m[0]);
const donorReturns = [...donorFn.matchAll(/return \{[^}]*\};/g)].map((m) => m[0]);
if (foldFormPresent) {
  const foldBody = foldFn.slice(foldFn.indexOf("{") + 1, foldFn.lastIndexOf("}"));
  if (normalized(foldBody) !== normalized(donorBody)) {
    const a = normalized(foldBody).split("\n");
    const b = normalized(donorBody).split("\n");
    const at = a.findIndex((l, i) => l !== b[i]);
    throw new Error(
      `region 2: the fold function body is NOT the donor's pre-refit body (first divergent line ${at + 1}: fold ${JSON.stringify(a[at])} vs donor ${JSON.stringify(b[at])}). Re-read before splicing - do not clobber fold-line work.`,
    );
  }
  console.log(
    `region 2 cross-check: the fold function body IS the donor's pre-refit body modulo ${foldReturns.length} return statements, which the refit rewrites into ${donorReturns.length} typed records`,
  );
} else {
  console.log(
    "region 2 cross-check: skipped - the fold base's pre-refit form is not in the tree (already spliced); the donor-bytes post-check below is what guards this run",
  );
}

// Idempotence: the script is re-runnable. If the tree already holds the
// donor's region 2 with the wrapper's blank line missing (an earlier run of
// this script), that variant is the replacement target; if it already holds
// the correct donor bytes, this is a no-op. Anything else is a drift and
// stops the run rather than guessing.
if (s.includes(DONOR_REGION_2)) {
  console.log("region 2: already carries the donor bytes - no-op");
} else {
  const BROKEN = donorFn + WRAPPER.slice(1); // the one-blank-line-short variant
  if (s.includes(BROKEN)) {
    s = replaceOnce(s, BROKEN, DONOR_REGION_2, "region 2 repair");
    console.log("region 2: repaired the blank line the first run dropped");
  } else if (foldFormPresent) {
    s = replaceOnce(s, foldFn, DONOR_REGION_2, "region 2 setPrototypeTypeInfo");
  } else {
    throw new Error(
      "region 2: the tree holds neither the fold base's pre-refit form nor the donor bytes nor the one-blank-line-short variant. This is drift, not a re-run - re-read the file and the donor before writing anything.",
    );
  }
}

// ---- post-conditions ------------------------------------------------------
// The donor keeps setPrototypeTypeInfo MODULE-PRIVATE and re-exports the
// pre-M2 signature as setPrototypeTypeCode; the post-conditions assert that
// shape, not an export that the donor never had.
if (s.includes("SETTING_NEVER_VISIBLE.has(codename)) return false;")) {
  throw new Error("post-condition: the retired blanket fold is still present");
}
if (!s.includes("function setPrototypeTypeInfo(")) {
  throw new Error("post-condition: setPrototypeTypeInfo did not land");
}
if (!s.includes("const { code: prototypeCode, templateDerived } = setPrototypeTypeInfo(")) {
  throw new Error("post-condition: visibleSettingsForGroup does not read the derivation");
}
if (!s.includes("return setPrototypeTypeInfo(engine, setCard).code;")) {
  throw new Error("post-condition: the setPrototypeTypeCode wrapper did not land");
}
if (!s.includes("export function setPrototypeTypeCode(")) {
  throw new Error("post-condition: the verdict-preload export was lost");
}
// visibleGroupSettings must STILL consume SETTING_NEVER_VISIBLE - the refit
// retires only the visibleSettingsForGroup use, and dropping the other one
// would be a fold-line regression the donor never made.
if (!s.includes("!SETTING_NEVER_VISIBLE.has(codename)")) {
  throw new Error("post-condition: visibleGroupSettings lost its SETTING_NEVER_VISIBLE filter - the donor keeps it");
}

fs.writeFileSync(P, s, "latin1");
const AFTER = crlfCounts(fs.readFileSync(P));
if (AFTER.crlf !== 527 || AFTER.lone !== 0) {
  throw new Error(
    `POST-CONDITION FAILED - CRLF carriers changed: ${JSON.stringify(AFTER)} want crlf=527 lone=0. Restore from git and stop.`,
  );
}
console.log(
  `census M2 + M2-refit: ${P} spliced from ${DONOR_REV}; CRLF ${BEFORE.crlf}/${BEFORE.lone} -> ${AFTER.crlf}/${AFTER.lone} (527/0 held); bytes ${BEFORE.cr === AFTER.cr ? "ok" : "?"} ${JSON.stringify(BEFORE)} -> ${JSON.stringify(AFTER)}`,
);
