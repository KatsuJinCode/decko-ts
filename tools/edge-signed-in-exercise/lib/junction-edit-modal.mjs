// junction-edit-modal.mjs — the contract the E11b check enforces, and the
// reader that reads it out of Ruby's own captured bytes.
//
// THE CONTRACT. A card nested in another card's content ("the +summary
// junction") is edited through its OWN edit modal, and that modal must be
// the junction card's own form: it must carry the persisted-record dom id
// Rails' form_for emits ("edit_card_<id>", form_tag_helper.rb:980), it must
// post to the card's own /update/ route on the owned origin, it must sit
// inside the junction card's own slot (the element carrying the card's
// data-card-id), and its content field must be the card[content] textarea
// holding the junction card's stored content.
//
// WHY THE CONTRACT IS WRITTEN DOWN HERE, AND NOT ONLY IN THE CHECK. The
// check reads those facts out of the LIVE DOM, and a live DOM proves only
// that the port agrees with itself. The contract is also read out of RUBY's
// own committed capture - the real-Ruby render of the same views - so the
// check's expectations are pinned to the system the port is a port OF, not
// to a transcription of the port.
//
// THE ORACLE, AND WHICH ARM IS WHICH. The committed capture is
// reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl,
// one arm per view, rendered by the real Ruby engine against the pinned
// gems:
//
//   probe-view:136:edit_form@set/all/edit_content.rb
//     <div id="decko_bot-edit_form-view" class="card-slot edit_form-view
//     ... data-card-id="1" ...><form class="card-form slotter autosave"
//     id="edit_card_1" ... action="/update/Decko_Bot" ...>
//
//   probe-view:133:content_formgroup@set/all/form.rb
//     <div class="form-group card-editor" data-card-id="1" ...><label
//     for="card_content">Content</label><div class="editor content-editor">
//     ... <textarea rows="3" class="tinymce-textarea d0-card-content
//     form-control" id="decko_bot-1" name="card[content]">
//     &lt;p&gt;...&lt;/p&gt;</textarea></div></div>
//
// The textarea's body is the card's STORED content, escaped by Rails'
// content_tag (tag_helper.rb:44): the capture carries `&lt;p&gt;`, and a
// browser's DOM holds `<p>` again. So the content field's value and the
// card's db_content are the same string, and the check's equality holds in
// Ruby as well as here.
//
// THE QUOTING. This gem's Haml attr_wrapper is the apostrophe, so Ruby's own
// bytes read `class='card-slot'`; a browser's serialization of them reads
// `class="card-slot"`. A reader that accepts one quoting style only sees the
// element as absent in the other, which is the defect class the tranche-8
// receipt named ("a check that grades a page's serialized text instead of the
// page's DOM"). Every attribute read here accepts either style.

// ---------------------------------------------------------------- facts

/** The attributes of one tag, read with either quoting style. */
export function readAttributes(tagText) {
  const attributes = {};
  const pattern = /([:@A-Za-z0-9_.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match;
  while ((match = pattern.exec(tagText)) !== null) {
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (!(match[1] in attributes)) attributes[match[1]] = value;
  }
  return attributes;
}

/** The HTML entities a text node carries, decoded. */
export function decodeEntities(text) {
  return String(text ?? "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/**
 * The facts about an edit modal, read out of its markup.
 *
 * @param {string} markup the modal's own HTML
 * @returns {{ formId: string|null, formAction: string|null, targetCardId: number|null,
 *             contentFieldName: string|null, contentValue: string|null }}
 */
export function editModalFactsFromMarkup(markup) {
  const html = String(markup ?? "");
  const facts = {
    formId: null,
    formAction: null,
    targetCardId: null,
    contentFieldName: null,
    contentValue: null,
  };
  // The edit form: the persisted-record dom id AND the form_for class. The
  // first match wins, which is the order the check's own locator reads (the
  // modal shows one edit form at a time).
  const formPattern = /<form\b([^>]*)>/gi;
  let formMatch = null;
  let formAttributes = null;
  while ((formMatch = formPattern.exec(html)) !== null) {
    const attributes = readAttributes(formMatch[1]);
    if (!String(attributes.id ?? "").startsWith("edit_card")) continue;
    if (!String(attributes.class ?? "").split(/\s+/).includes("card-form")) continue;
    formAttributes = attributes;
    break;
  }
  if (formAttributes) {
    facts.formId = formAttributes.id;
    facts.formAction = formAttributes.action ?? null;
  }
  // The content field: the card[content] textarea. It is read on its own,
  // because Ruby's capture renders the content form group as its own arm
  // (probe-view:133) and the edit form as another (probe-view:136), and a
  // reader that insisted on finding both in one string would read neither.
  const textarea = /<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/i.exec(html);
  if (textarea) {
    const fieldAttributes = readAttributes(textarea[1]);
    if (fieldAttributes.name === "card[content]") {
      facts.contentFieldName = fieldAttributes.name;
      // Rails' text_area emits the body after a newline
      // (TagHelper PRE_CONTENT_STRINGS[:textarea] = "\n", tag_helper.rb:44),
      // and an HTML parser drops exactly one newline that immediately
      // follows a textarea's start tag - so the value a browser holds, and
      // the value the check reads, has no leading newline.
      facts.contentValue = decodeEntities(textarea[2].replace(/^\r?\n/, ""));
    }
  }
  // The nearest enclosing element carrying a data-card-id: the closest
  // data-card-id before the content field in the markup, which is the slot
  // the editor is rendered in. The reader stops at the field's own start, so
  // a data-card-id that belongs to a LATER slot cannot be picked up.
  const anchor = textarea ? textarea.index : formMatch ? formMatch.index : html.length;
  const ids = [...html.slice(0, anchor).matchAll(/data-card-id\s*=\s*(?:"(\d+)"|'(\d+)')/gi)];
  const last = ids[ids.length - 1];
  facts.targetCardId = last ? Number(last[1] ?? last[2]) : null;
  return facts;
}

// ------------------------------------------------------------ the contract

/**
 * The contract the E11b check enforces, written as a function so that the
 * live DOM's facts and Ruby's own captured facts are graded by ONE rule.
 *
 * @param {object} facts the facts read out of the modal
 * @param {{ expectedCardId?: number, expectedContent?: string, origin?: string }} expected
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function editModalContract(facts, { expectedCardId, expectedContent, origin } = {}) {
  const problems = [];
  const formId = String(facts?.formId ?? "");
  if (!formId.startsWith("edit_card")) {
    problems.push("the form does not carry the edit_card dom id a persisted card's form_for emits");
  }
  const action = String(facts?.formAction ?? "");
  if (!action.startsWith("/update/")) {
    problems.push("the form does not post to the card's own /update/ route");
  }
  if (origin && action) {
    // A relative action stays on the owned origin by construction; an
    // absolute one has to name it.
    const absolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(action);
    if (absolute) {
      let actionOrigin = null;
      try {
        actionOrigin = new URL(action).origin;
      } catch {
        actionOrigin = null;
      }
      if (actionOrigin !== origin) problems.push("the form posts off the owned origin");
    }
  }
  const targetCardId = facts?.targetCardId ?? null;
  if (targetCardId === null) {
    problems.push("the form is not inside an element carrying a data-card-id");
  } else if (expectedCardId !== undefined && targetCardId !== expectedCardId) {
    problems.push("the form is not inside the junction card's own slot");
  }
  if (facts?.contentFieldName !== "card[content]") {
    problems.push("the content field is not the card[content] textarea");
  }
  if (expectedContent !== undefined && facts?.contentValue !== expectedContent) {
    problems.push("the editor does not carry the junction card's stored content");
  }
  return { ok: problems.length === 0, problems };
}
