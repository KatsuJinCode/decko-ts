// A rename's referer repair, graded on the two things Ruby renders and Ruby
// maintains: the form's own referer control, and the card_references table.
//
//   reference-harness/browser/journeys/synthetic-v1.json
//     rename-topic-with-referers-admin  covers ["rename through the editor",
//     "referers updated"]; its steps rename /Topic_001 to "Topic Zero One" and
//     then visit /Note_001, the card that refers to it. The second visit IS the
//     leg: "referers updated" is not a claim about the renamed card.
//
// WHAT RUBY'S RENAME FORM OFFERS, from the committed Ruby capture
// fixtures/captured/edit-name-type.json (view :name_form, both targets, all
// three actors):
//
//   <input value="Oracle Basics" ... name="card[name]" id="card_name" />
//   <div class='skip-referers pb-2'>
//     <input type="checkbox" name="card[skip]" id="card_skip"
//            value="update_referer_content" />
//     <label class='ps-1'>do not update references to this name</label>
//   <button name="button" type="submit" class="renamer btn btn-primary" ...>Rename
//   action="/update/Oracle_Basics?id=605" data-slotter-mode="update-origin"
//
// The checkbox is UNCHECKED in the capture, so the default rename updates
// references and the opt-out is what the card may set. The port renders the
// same markup (src/card/mod-loader/mods/card-mod-edit.ts:1765-1766,1790), so
// the form half already matches; what was never graded is that the control
// exists, that it is offered UNCHECKED, and that the table moved as a result.
//
// WHAT THE TABLE DOES, from the gem's own source:
//
//   card-1.110.0 lib/card/reference.rb:26-27
//     def map_referees referee_key, referee_id
//       where(referee_key: referee_key).update_all referee_id: referee_id
//   :31-32
//     def unmap_referees referee_id
//       where(referee_id: referee_id).update_all referee_id: nil
//
// map_referees re-points every row whose referee_key is the renamed card's key
// at the renamed card's id, in ONE update over the table. So after a rename
// Ruby leaves no row carrying the old key with a live id, and every row for the
// new key carries the new id. Those two facts are the mechanism:
//
//   card-1.110.0 lib/card/query/reference_query.rb:5-6  the CQL table is
//     "card_references"; :36-37 non_outfield reads is_present = 0, so a row
//     whose referee_id was never re-pointed stays visible to CQL as a reference
//     to a card that no longer exists.
//
// Registry row cap-R1 (tools/edge-signed-in-exercise/capabilities.json, id R1)
// recorded "Rename checked but referers updates not checked." The bound check
// reads the renamed card and the old name; the referer leg read the referrer's
// STORED CONTENT string for the new name. Content is not the reference table: a
// rename that rewrote the text but not referee_id would satisfy that string test
// and still leave every reference query, rule and follow reading a dead referee.

function attrMap(attrs) {
  const map = {};
  for (const match of String(attrs).matchAll(/([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    map[match[1].toLowerCase()] = match[2] ?? match[3] ?? "";
  }
  return map;
}

const classList = (attrs) => String(attrs.class ?? "").split(/\s+/).filter(Boolean);

/** The rename form's own facts, read out of the rendered slot. Scoped to the
 *  form that carries class `_rename-form` (Ruby: `form._rename-form card-form
 *  slotter`), so an unrelated form elsewhere on the page cannot answer. */
export function renameFormShape(html) {
  const source = String(html);
  const form = /<form\b([^>]*\bclass\s*=\s*"[^"]*\b_rename-form\b[^"]*"[^>]*)>([\s\S]*?)<\/form>/i.exec(source);
  if (form === null) return { ok: false, failures: ["noRenameForm"], nameField: null, skipReferers: null, renameButton: null, action: null, slotterMode: null };
  const formAttrs = attrMap(form[1]);
  const body = form[2];

  const nameInput = /<input\b([^>]*\bname\s*=\s*"card\[name\]"[^>]*)>/i.exec(body);
  const skipInput = /<input\b([^>]*\bname\s*=\s*"card\[skip\]"[^>]*\bvalue\s*=\s*"update_referer_content"[^>]*|[^>]*\bvalue\s*=\s*"update_referer_content"[^>]*\bname\s*=\s*"card\[skip\]"[^>]*)>/i.exec(body);
  // THE SKIP-REFERERS BLOCK, read with EITHER quote character.
  //
  // The committed Ruby capture of the gem's own bytes
  // (fixtures/captured/edit-name-type.json) writes
  //   <div class='skip-referers pb-2'>
  // with the apostrophe - this deck's Haml attr_wrapper - and the predicate
  // used to require exactly that. The page the harness reads carries the same
  // block with DOUBLE quotes, so the scope found nothing and the leg named a
  // rename form with no referer control: the signed-in run of 2026-10-22
  // recorded the leg as failures ["noSkipReferersBlock"] with the control
  // itself FOUND (card[skip]=update_referer_content, unchecked) and the
  // form's own action right.
  const skipBlock = skipInput === null ? null : /<div\s+class=(["'])skip-referers[^"']*\1[^>]*>([\s\S]*?)<\/div>/i.exec(body);
  const button = /<button\b([^>]*\bclass\s*=\s*"[^"]*\brenamer\b[^"]*"[^>]*)>/i.exec(body);

  const nameAttrs = nameInput === null ? null : attrMap(nameInput[1]);
  const skipAttrs = skipInput === null ? null : attrMap(skipInput[1]);
  const buttonAttrs = button === null ? null : attrMap(button[1]);
  // `checked` is a BARE attribute in Rails' check_box_tag output - it carries no
  // value - so attrMap (which only reads name="value" pairs) cannot see it.
  const skipChecked = skipInput !== null && /(^|\s)checked(\s|=|\/|>|$)/.test(skipInput[1]);

  const failures = [];
  if (nameAttrs === null) failures.push("noNameField");
  if (skipAttrs === null) failures.push("noSkipReferersControl");
  if (skipBlock === null) failures.push("noSkipReferersBlock");
  if (buttonAttrs === null) failures.push("noRenameButton");
  // Ruby's checkbox ships unchecked: present in the capture with no `checked`
  // attribute. An opt-out that is ON by default would invert the capability.
  if (skipChecked) failures.push("skipReferersCheckedByDefault");
  if (formAttrs["data-slotter-mode"] !== "update-origin") failures.push("slotterMode");
  if (!/^\/update\/[^?]+\?id=\d+/.test(formAttrs.action ?? "")) failures.push("action");

  return {
    ok: failures.length === 0,
    failures,
    nameField: nameAttrs === null ? null : (nameAttrs.value ?? null),
    skipReferers: skipAttrs === null ? null : { name: skipAttrs.name ?? null, value: skipAttrs.value ?? null, checked: skipChecked },
    renameButton: buttonAttrs === null ? null : (buttonAttrs.type ?? null),
    action: formAttrs.action ?? null,
    slotterMode: formAttrs["data-slotter-mode"] ?? null,
  };
}

/** THE CARD'S KEY, the form the reference table stores.
 *
 *  card-1.110.0 lib/card/reference.rb:26-27
 *    def map_referees referee_key, referee_id
 *      where(referee_key: referee_key).update_all referee_id: referee_id
 *
 *  The row's referee_key is the card's KEY, not its name: cardname's key
 *  (lib/cardname.rb simple_key: `decoded.underscore.gsub(/[^\w*]+/, "_")
 *  .split(/_+/).reject(&:empty?).join("_")`). A rename leaves the row's key at
 *  the NEW card's key - "Harness_rename_mvjqjstp_renamed" is stored as
 *  "harness_rename_mvjqjstp_renamed" - so a comparison against the NAME
 *  never matches, and the leg named a rename that had in fact re-pointed
 *  every row.
 */
export function cardKey(name) {
  const decoded = String(name ?? "");
  const underscored = decoded
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .replace(/\s+/g, "_")
    .toLowerCase();
  return underscored
    .replace(/[^\w*]+/g, "_")
    .split(/_+/)
    .filter((part) => part !== "")
    .join("_");
}

/** The exact text of a [[name]] link inside stored card content, in both the
 *  bare ([[name]]) and labelled ([[name|label]]) forms a rename rewrites. */
function mentionsLink(content, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\[\\[\\s*${escaped}\\s*(\\||\\]\\])`).test(String(content ?? ""));
}

/**
 * The predicate for one rename. `evidence` is:
 *   oldName, newName      the two names, before and after
 *   renamedId             the renamed card's id, read from cards
 *   writeStatus           HTTP status of the rename write (null when no write
 *                         was observed at all)
 *   newStatus             HTTP status of GET /<newName>
 *   oldGoneInDb           true when no live card still carries oldName
 *   references            the referer's card_references rows, each
 *                         {referee_key, referee_id, ref_type, is_present}
 *   referrerContent       the referrer's stored db_content
 *
 * Returns {ok, failures, references}. Every failure name is the leg that did
 * not hold; an empty failures list means every leg held.
 */
export function referersFollowRename(evidence) {
  const { oldName, newName, renamedId, writeStatus, newStatus, oldGoneInDb } = evidence;
  const references = Array.isArray(evidence.references) ? evidence.references : [];
  const content = String(evidence.referrerContent ?? "");
  const failures = [];

  // The rename itself: a write that answered, and the new name answering 200.
  if (writeStatus === null || writeStatus === undefined || writeStatus >= 400) {
    failures.push("write");
  }
  if (newStatus !== 200) failures.push("newCardStatus");
  if (!(Number.isInteger(renamedId) && renamedId > 0)) failures.push("renamedId");

  // The old name is gone as a live card: Ruby's rename trashes the old row
  // rather than deleting it, so the grade is "no live card", not "no row".
  if (oldGoneInDb !== true) failures.push("oldNameStillLive");

  // map_referees (reference.rb:26-27): no row may still carry the OLD key with
  // a live referee id. A row with a null referee_id is unmap_referees
  // (reference.rb:31-32), a legal Ruby state, so only a LIVE stale row fails.
  // The key is the card's KEY, the form the table stores (cardKey above).
  const oldKey = cardKey(oldName);
  const newKey = cardKey(newName);
  const staleLive = references.filter(
    (row) => row.referee_key === oldKey && row.referee_id !== null && row.referee_id !== undefined,
  );
  if (staleLive.length > 0) failures.push("staleRefereeKey");

  // ...and at least one row must carry the NEW key with the renamed card's id.
  // Without it the rename wrote no reference at all and the referer now points
  // at nothing (is_present semantics, reference_query.rb:36-37).
  const remapped = references.filter(
    (row) => row.referee_key === newKey && row.referee_id === renamedId,
  );
  if (remapped.length === 0) failures.push("refereeIdNotRemapped");

  // The referrer's own text, which is what the journey's second visit reads.
  if (!content.includes(newName)) failures.push("contentNotRewritten");
  if (mentionsLink(content, oldName)) failures.push("contentStaleLink");

  return { ok: failures.length === 0, failures, references, renamedId: renamedId ?? null };
}

/**
 * The card_references rows of one referer, read the way Ruby reads them:
 * reference_query.rb:12-14 `referer hash` adds conditions on referer_id.
 * `row` is a driver row; anything without a referee_key is not a reference row
 * and is dropped rather than graded.
 */
export function refererReferenceRows(rows, refererId) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row !== null && row !== undefined)
    .filter((row) => refererId === undefined || refererId === null || row.referer_id === refererId)
    .filter((row) => typeof row.referee_key === "string" && row.referee_key !== "")
    .map((row) => ({
      referee_key: row.referee_key,
      referee_id: row.referee_id ?? null,
      ref_type: row.ref_type ?? null,
      is_present: Number(row.is_present ?? 1),
    }));
}