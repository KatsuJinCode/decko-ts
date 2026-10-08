// The harness's normalisation rules, stated once (reference-harness/SPEC.md,
// "Normalisation"). Everything not listed here is compared byte for byte.

/** N1-N2: rendered HTML. */
export function normalizeHtml(html) {
  if (typeof html !== "string") return html;
  return html
    // N1. Slot ids are random per render in every engine.
    .replace(/data-slot-id=(["'])[0-9a-f]+\1/g, 'data-slot-id="SLOT"')
    // N2. A host-language object address printed into an error message.
    .replace(/0x[0-9a-f]{8,16}/g, "0xADDR");
}

/** N3: a write result. The new card's id is a row id (persistence compares
 *  rows); mail text lines lose trailing whitespace. */
export function normalizeWriteResult(result) {
  if (result === null || typeof result !== "object") return result;
  const out = { ...result };
  if (out.card && typeof out.card === "object") out.card = { name: out.card.name };
  if (Array.isArray(out.mail)) {
    out.mail = out.mail.map((m) => ({
      to: m.to,
      subject: m.subject,
      text: String(m.text ?? "").replace(/[ \t]+$/gm, "").replace(/\r\n/g, "\n").trim(),
    }));
  }
  return out;
}

/** Stable JSON: object keys sorted, so key order never counts. */
export function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, stable(value[k])]));
  }
  return value;
}
