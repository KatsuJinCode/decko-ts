import { describe, expect, it } from "vitest";
import {
  RANDOMIZED_GROUP_TOKEN,
  RANDOMIZED_SLOT_ATTRIBUTE,
  byteDiff,
  compareNormalized,
  normalizeAccordionGroupIds,
  normalizeCloudflareChallengeBlocks,
  normalizeForReplay,
  maskSlotIdValues,
  normalizeSlotIds,
  referenceErasedSlotQuotes,
} from "../../src/testing/diff.js";

const HEX20 = "abcdef0123456789abcd"; // exactly 20 lowercase hex chars
const hexId = (quote: string) => `data-slot-id=${quote}${HEX20}${quote}`;

describe("normalizeSlotIds (the recording-layer rule)", () => {
  it("replaces a double-quoted 20-hex slot id with the placeholder", () => {
    expect(normalizeSlotIds(`<div ${hexId('"')} class="card-slot">`)).toBe(
      `<div ${RANDOMIZED_SLOT_ATTRIBUTE} class="card-slot">`
    );
  });

  it("replaces a single-quoted slot id (search-result bars) with the double-quoted placeholder", () => {
    expect(normalizeSlotIds(`<div class='bar' ${hexId("'")}>`)).toBe(
      `<div class='bar' ${RANDOMIZED_SLOT_ATTRIBUTE}>`
    );
  });

  it("normalizes every occurrence in one document", () => {
    const html = `<a ${hexId('"')}><b ${hexId("'")}><c ${hexId('"')}>`;
    expect(normalizeSlotIds(html)).toBe(
      `<a ${RANDOMIZED_SLOT_ATTRIBUTE}><b ${RANDOMIZED_SLOT_ATTRIBUTE}><c ${RANDOMIZED_SLOT_ATTRIBUTE}>`
    );
  });

  it("is idempotent: the placeholder itself is never re-matched", () => {
    const once = normalizeSlotIds(`<div ${hexId('"')}>`);
    expect(normalizeSlotIds(once)).toBe(once);
    expect(once).toContain(RANDOMIZED_SLOT_ATTRIBUTE);
  });

  it("is strict about length: 19 or 21 hex chars survive so the byte diff surfaces them", () => {
    expect(normalizeSlotIds(`data-slot-id="${"a".repeat(19)}"`)).toBe(
      `data-slot-id="${"a".repeat(19)}"`
    );
    expect(normalizeSlotIds(`data-slot-id="${"a".repeat(21)}"`)).toBe(
      `data-slot-id="${"a".repeat(21)}"`
    );
  });

  it("is strict about case: uppercase hex survives (Ruby emits lowercase)", () => {
    const upper = `data-slot-id="${"A".repeat(20)}"`;
    expect(normalizeSlotIds(upper)).toBe(upper);
  });

  it("leaves non-slot attributes and bare hex text untouched", () => {
    const html = `<div data-other-id="${HEX20}" data-slot-id-other="${HEX20}">${HEX20}</div>`;
    expect(normalizeSlotIds(html)).toBe(html);
  });

  it("preserves attribute presence: occurrence count is unchanged", () => {
    const html = `<div ${hexId('"')}><span ${hexId("'")}></div>`;
    expect(normalizeSlotIds(html).split(RANDOMIZED_SLOT_ATTRIBUTE).length - 1).toBe(2);
  });
});

describe("byteDiff (exact bytes, no tolerance)", () => {
  it("reports equality with byte sizes", () => {
    const diff = byteDiff("same", "same");
    expect(diff.equal).toBe(true);
    expect(diff.firstDifference).toBeNull();
    expect(diff.expectedBytes).toBe(4);
    expect(diff.actualBytes).toBe(4);
  });

  it("counts UTF-8 bytes, not code units, for multibyte content", () => {
    const diff = byteDiff("\u00e9ab", "\u00e9ab");
    expect(diff.equal).toBe(true);
    expect(diff.expectedBytes).toBe(4);
  });

  it("locates the first differing byte with escaped chars and excerpts", () => {
    const diff = byteDiff('<span class="card-title"', '<span class="card-titlz"');
    expect(diff.equal).toBe(false);
    const first = diff.firstDifference;
    expect(first).not.toBeNull();
    expect(first!.codeUnitOffset).toBe(22);
    expect(first!.byteOffset).toBe(22); // ASCII prefix: byte offset == code-unit offset
    expect(first!.expectedChar).toBe('"e"');
    expect(first!.actualChar).toBe('"z"');
    expect(first!.expectedExcerpt).toContain("card-title");
    expect(first!.actualExcerpt).toContain("card-titlz");
  });

  it("reports a UTF-8 byte offset that differs from the code-unit offset after multibyte chars", () => {
    const diff = byteDiff("\u00e9abc", "\u00e9abx");
    expect(diff.firstDifference!.codeUnitOffset).toBe(3);
    expect(diff.firstDifference!.byteOffset).toBe(4); // "\u00e9" is 2 bytes in UTF-8
  });

  it("handles a length mismatch at end-of-string (one side exhausted)", () => {
    const diff = byteDiff("abcd", "ab");
    expect(diff.equal).toBe(false);
    const first = diff.firstDifference!;
    expect(first.codeUnitOffset).toBe(2);
    expect(first.expectedChar).toBe('"c"');
    expect(first.actualChar).toBe('""');
  });

  it("handles an entirely empty actual side", () => {
    const diff = byteDiff("expected bytes", "");
    expect(diff.equal).toBe(false);
    expect(diff.firstDifference!.codeUnitOffset).toBe(0);
    expect(diff.actualBytes).toBe(0);
  });

  it("respects a custom context radius for excerpts", () => {
    const long = "x".repeat(200) + "!" + "y".repeat(200);
    const diff = byteDiff(long, long.replace("!", "?"), 5);
    expect(diff.firstDifference!.expectedExcerpt.length).toBeLessThan(20);
  });
});

describe("compareNormalized (both sides normalized, then exact bytes)", () => {
  it("matches engine output carrying fresh random slot ids against fixture placeholder bytes", () => {
    const fixtureHtml = `<div id="x" ${RANDOMIZED_SLOT_ATTRIBUTE} data-slot="{&quot;view&quot;:&quot;open&quot;}">body</div>`;
    const engineHtml = fixtureHtml.replace(RANDOMIZED_SLOT_ATTRIBUTE, hexId('"'));
    expect(compareNormalized(fixtureHtml, engineHtml).equal).toBe(true);
  });

  it("still fails when any other byte differs", () => {
    const fixtureHtml = `<div ${RANDOMIZED_SLOT_ATTRIBUTE}>body</div>`;
    const engineHtml = `<div ${RANDOMIZED_SLOT_ATTRIBUTE}>Body</div>`;
    const diff = compareNormalized(fixtureHtml, engineHtml);
    expect(diff.equal).toBe(false);
    expect(diff.firstDifference!.codeUnitOffset).toBe(fixtureHtml.indexOf(">b") + 1);
  });
});

// The two fragments below are a real-shaped byte pair for the `mod: core`
// page's accordion band: both are 329 bytes and the ONLY difference between
// them is the accordion group token, in BOTH positions the engine emits it
// (the `data-bs-target='#...'` fragment and the `id='...'` attribute).
// 97674992 is Ruby's String#hash("Admin"), which Ruby seeds per process;
// 63116079 is core-mod.ts stringHash("Admin"). A comparator cannot pin a
// per-process value, so it must mask the token instead.
const MOD_CORE_EXPECTED_ACCORDION =
  "<div class='accordion-item'>\n<h2 class='accordion-header nodblclick w-100'>\n<button class='collapsed accordion-button' data-bs-target='#card-mod_core-97674992-collapse-id' data-bs-toggle='collapse' type='button'>\nAdmin\n</button>\n</h2>\n<div class='accordion-collapse collapse' id='card-mod_core-97674992-collapse-id'>\n<div class='";
const MOD_CORE_ACTUAL_ACCORDION =
  "<div class='accordion-item'>\n<h2 class='accordion-header nodblclick w-100'>\n<button class='collapsed accordion-button' data-bs-target='#card-mod_core-63116079-collapse-id' data-bs-toggle='collapse' type='button'>\nAdmin\n</button>\n</h2>\n<div class='accordion-collapse collapse' id='card-mod_core-63116079-collapse-id'>\n<div class='";

describe("normalizeAccordionGroupIds (the per-process Ruby String#hash rule)", () => {
  it("masks the decimal group token in the data-bs-target fragment", () => {
    expect(normalizeAccordionGroupIds("data-bs-target='#card-mod_core-97674992-collapse-id'")).toBe(
      `data-bs-target='#card-mod_core-${RANDOMIZED_GROUP_TOKEN}-collapse-id'`
    );
  });

  it("masks the same token in the id attribute", () => {
    expect(normalizeAccordionGroupIds("id='card-mod_core-97674992-collapse-id'")).toBe(
      `id='card-mod_core-${RANDOMIZED_GROUP_TOKEN}-collapse-id'`
    );
  });

  it("masks a NEGATIVE hash - the capture's own rows carry card-mod_list--681338365-collapse-id", () => {
    expect(normalizeAccordionGroupIds("card-mod_list--681338365-collapse-id")).toBe(
      `card-mod_list-${RANDOMIZED_GROUP_TOKEN}-collapse-id`
    );
  });

  it("masks a 10-digit hash (mod: layout's capture token 1045438464)", () => {
    expect(normalizeAccordionGroupIds("card-mod_layout-1045438464-collapse-id")).toBe(
      `card-mod_layout-${RANDOMIZED_GROUP_TOKEN}-collapse-id`
    );
  });

  it("leaves every WORD-shaped group name untouched", () => {
    // The five non-hashed accordion group shapes the engine emits.
    for (const word of ["files", "depends_on", "closed", "templating", "editing"]) {
      const id = `card-mod_format-${word}-collapse-id`;
      expect(normalizeAccordionGroupIds(id)).toBe(id);
    }
  });

  it("leaves any id that is not a collapse id untouched, hashed token or not", () => {
    const html = `<div id='card-mod_core-97674992'>data-card-id='97674992'</div>`;
    expect(normalizeAccordionGroupIds(html)).toBe(html);
  });

  it("is idempotent: the HASH placeholder is not decimal, so it never re-matches", () => {
    const once = normalizeAccordionGroupIds("card-mod_core-97674992-collapse-id");
    expect(normalizeAccordionGroupIds(once)).toBe(once);
    expect(once).toContain(RANDOMIZED_GROUP_TOKEN);
  });
});

describe("normalizeForReplay (both rules, slot ids then group hashes)", () => {
  it("applies the slot-id rule and the group-hash rule together", () => {
    const html = `<button data-bs-target='#card-mod_core-63116079-collapse-id' ${hexId("'")}>`;
    expect(normalizeForReplay(html)).toBe(
      `<button data-bs-target='#card-mod_core-${RANDOMIZED_GROUP_TOKEN}-collapse-id' ${RANDOMIZED_SLOT_ATTRIBUTE}>`
    );
  });
});

describe("compareNormalized judges the mod:<x>:page accordion band", () => {
  it("RED-to-GREEN: the real mod: core byte pair is equal once the group hash is masked", () => {
    // The strict recording-layer rule alone still sees a divergence - proof the
    // two tokens really are different bytes, not a formatting artifact.
    expect(
      byteDiff(
        normalizeSlotIds(MOD_CORE_EXPECTED_ACCORDION),
        normalizeSlotIds(MOD_CORE_ACTUAL_ACCORDION)
      ).equal
    ).toBe(false);

    expect(compareNormalized(MOD_CORE_EXPECTED_ACCORDION, MOD_CORE_ACTUAL_ACCORDION).equal).toBe(true);
  });

  it("closes the -8..+4 digit-count band: a 9-digit capture token vs a 7-digit engine token", () => {
    // mod: format's shape - a 9-digit token against a 7-digit token is the
    // whole of that entry's delta. This synthetic pair carries the token
    // twice, so it measures -4; the same arithmetic across a full page
    // (four occurrences plus their sign positions) measures -8.
    const expected = "<div data-bs-target='#card-mod_format-660361415-collapse-id' id='card-mod_format-660361415-collapse-id'>";
    const actual = "<div data-bs-target='#card-mod_format-2603341-collapse-id' id='card-mod_format-2603341-collapse-id'>";
    const strict = byteDiff(expected, actual);
    expect(strict.equal).toBe(false);
    expect(strict.actualBytes - strict.expectedBytes).toBe(-4);
    expect(compareNormalized(expected, actual).equal).toBe(true);
  });

  it("still fails when a NON-token byte in the same accordion differs", () => {
    const actual = MOD_CORE_ACTUAL_ACCORDION.replace("\nAdmin\n", "\nAdmins\n");
    expect(actual).not.toBe(MOD_CORE_ACTUAL_ACCORDION);
    const diff = compareNormalized(MOD_CORE_EXPECTED_ACCORDION, actual);
    expect(diff.equal).toBe(false);
    expect(diff.firstDifference!.codeUnitOffset).toBeGreaterThan(0);
  });

  it("still fails when the ENGINE omits the hashed accordion the capture emitted", () => {
    // Masking must not manufacture agreement across a structural difference:
    // the expected side's token becomes HASH, the other side has no
    // accordion at all.
    const diff = compareNormalized(
      "<div data-bs-target='#card-mod_core-97674992-collapse-id'><p>group</p></div>",
      "<div class='card-slot'><p>group</p></div>"
    );
    expect(diff.equal).toBe(false);
  });

  it("still fails when one side carries a token and the other carries a word group name", () => {
    const diff = compareNormalized(
      "data-bs-target='#card-mod_format-660361415-collapse-id'",
      "data-bs-target='#card-mod_format-files-collapse-id'"
    );
    expect(diff.equal).toBe(false);
  });
});

describe("normalizeSlotIds keeps its documented recording-layer contract", () => {
  it("does NOT mask the accordion group hash - the widening is confined to the replay seam", () => {
    const id = "card-mod_core-97674992-collapse-id";
    expect(normalizeSlotIds(id)).toBe(id);
  });
});


describe("normalizeCloudflareChallengeBlocks (the CF challenge-block mask)", () => {
  // The real Cloudflare challenge-block shape (900+ bytes on every page
  // that carries it; r/t are the per-response tokens, held here as obvious
  // placeholders -- the mask keys on the __CF$cv$params anchor, not on
  // their values).
  const CF_BLOCK =
    "<script>(function(){function c(){var b=a.contentDocument||(a.contentWindow&&a.contentWindow.document);if(b){var d=b.createElement('script');d.innerHTML=\"window.__CF$cv$params={r:'0000000000000000',t:'MDAwMDAwMDAwMA=='};var a=document.createElement('script');a.src='/cdn-cgi/challenge-platform/scripts/jsd/main.js';document.getElementsByTagName('head')[0].appendChild(a);\";b.getElementsByTagName('head')[0].appendChild(d)}}if(document.body){var a=document.createElement('iframe');a.height=1;a.width=1;a.style.position='absolute';a.style.top=0;a.style.left=0;a.style.border='none';a.style.visibility='hidden';document.body.appendChild(a);if('loading'!==document.readyState)c();else if(window.addEventListener)document.addEventListener('DOMContentLoaded',c);else{var e=document.onreadystatechange||function(){};document.onreadystatechange=function(b){e(b);'loading'!==document.readyState&&(document.onreadystatechange=e,c())}}}})();</script>";

  it("removes the challenge block from both sides so a CF-only pair compares equal", () => {
    const engine = "<footer>Decko v0.19.1</footer>\n</body>";
    const live = `<footer>Decko v0.19.1</footer>\n${CF_BLOCK}</body>`;
    // RAW bytes differ (the block is 900+ bytes the engine never emits)...
    expect(byteDiff(engine, live, 20).equal).toBe(false);
    // ...the compare seam masks them (compareNormalized applies
    // normalizeForReplay to both sides), so the comparison sees equal bytes.
    expect(compareNormalized(engine, live).equal).toBe(true);
    // the pure mask is idempotent and a no-op on block-free bytes.
    expect(normalizeCloudflareChallengeBlocks(engine)).toBe(engine);
    expect(normalizeCloudflareChallengeBlocks(normalizeCloudflareChallengeBlocks(live))).toBe(
      normalizeCloudflareChallengeBlocks(live),
    );
  });

  it("still fails when a non-CF byte differs outside the block", () => {
    const engine = "<footer>Decko v0.19.1</footer></body>";
    const live = `<footer>Decko v0.20.0</footer>
${CF_BLOCK}</body>`;
    expect(compareNormalized(engine, normalizeForReplay(live)).equal).toBe(false);
  });

  it("does not span a script element that merely precedes the block", () => {
    const engine = "<p>x</p>";
    const live = `<p>x</p><script>var harmless=1;</script>${CF_BLOCK}`;
    const masked = normalizeCloudflareChallengeBlocks(live);
    expect(masked).toBe("<p>x</p><script>var harmless=1;</script>");
  });

  it("leaves pages without the block untouched (the frozen corpus shape)", () => {
    const html = "<footer>Decko v0.20.0</footer><script>decko.rootUrl='/';</script></body>";
    expect(normalizeCloudflareChallengeBlocks(html)).toBe(html);
  });
});

describe("slot-id quote style against a reference stored as Ruby wrote it", () => {
  const OTHER = "0123456789abcdef0123";
  const bar = (q: string, id: string) => `<div class='bar' data-card-type-name='Topic' data-slot-id=${q}${id}${q}>`;

  it("masks the value and keeps the quote", () => {
    expect(maskSlotIdValues(bar("'", HEX20))).toBe("<div class='bar' data-card-type-name='Topic' data-slot-id='RANDOMIZED'>");
    expect(maskSlotIdValues(bar('"', HEX20))).toBe(`<div class='bar' data-card-type-name='Topic' data-slot-id="RANDOMIZED">`);
  });

  it("a raw reference passes the same quote style with another id", () => {
    expect(referenceErasedSlotQuotes(bar("'", HEX20))).toBe(false);
    expect(compareNormalized(bar("'", HEX20), bar("'", OTHER)).equal).toBe(true);
  });

  it("a raw reference fails a quote-style difference", () => {
    expect(compareNormalized(bar("'", HEX20), bar('"', OTHER)).equal).toBe(false);
    expect(compareNormalized(bar('"', HEX20), bar("'", OTHER)).equal).toBe(false);
  });

  it("a reference whose capture erased quote style is compared as before", () => {
    const erased = `<div class='bar' data-card-type-name='Topic' ${RANDOMIZED_SLOT_ATTRIBUTE}>`;
    expect(referenceErasedSlotQuotes(erased)).toBe(true);
    expect(compareNormalized(erased, bar("'", OTHER)).equal).toBe(true);
    expect(compareNormalized(erased, bar('"', OTHER)).equal).toBe(true);
  });
});
