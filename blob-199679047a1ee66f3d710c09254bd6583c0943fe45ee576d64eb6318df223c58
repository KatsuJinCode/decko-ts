import { parseDocument } from 'htmlparser2';

const sameName = (a, b) => a.replaceAll('_', ' ').trim().toLowerCase() === b.replaceAll('_', ' ').trim().toLowerCase();

/** Inspect the deleted target, not unrelated card forms in page chrome.
 *
 *  The check's contract is "completes the previous-page redirect or deleted
 *  confirmation, without recreating that target" - two clauses: the landing
 *  page completed the delete's own success target, and nothing recreated the
 *  deleted card. Recreation is therefore graded from what the deck STORES
 *  (`targetRecreated`, the caller's direct read of the cards row), never from
 *  whether a create form is merely OFFERED on the landing page.
 *
 *  That distinction is measured, not theoretical: once the read-path location
 *  history became live (7e21fc04), the delete's `*previous` resolves to the
 *  card's own edit URL - which is what the ORACLE serves too (8cc080d2 records
 *  the oracle's own answer on /Phrase_2?view=edit as
 *  `{"redirect":".../Phrase_2?view=edit"}`, and that journey's page checks
 *  pass against the oracle with that address). An unknown or trashed card
 *  name renders Decko's new-card form through the unknown-card page branch by
 *  design, so "a create form for that name is on the page" is the ORACLE'S
 *  own landing page, not evidence of recreation. The earlier proxy graded that
 *  affordance as failure, which made the check red exactly when the engine
 *  stopped being wrong. `targetCreateForm` stays in the evidence as an
 *  observation. */
export function deleteOutcome({ html, name, origin, finalUrl, responseBody, targetRecreated = false }) {
  let targetCreateForm = false;
  let deletedConfirmation = false;
  const walk = (node, form) => {
    const attrs = node.attribs ?? {};
    if (node.name === 'form') form = node;
    if ((attrs.class ?? '').split(/\s+/).includes('just_deleted-view') && sameName(attrs['data-card-name'] ?? '', name)) deletedConfirmation = true;
    if (form && node.name === 'input' && attrs.name === 'card[name]' && sameName(attrs.value ?? '', name)) {
      try {
        const action = new URL(form.attribs.action ?? '', origin);
        if (action.origin === new URL(origin).origin && action.pathname === '/card/create') targetCreateForm = true;
      } catch { /* A malformed action cannot establish a creation form. */ }
    }
    for (const child of node.children ?? []) walk(child, form);
  };
  walk(parseDocument(html), undefined);
  let redirect = null;
  let redirectCompleted = false;
  try {
    const parsed = JSON.parse(responseBody);
    if (typeof parsed.redirect === 'string') {
      const target = new URL(parsed.redirect, origin);
      const landed = new URL(finalUrl, origin);
      redirect = target.href;
      redirectCompleted = target.origin === new URL(origin).origin && landed.origin === target.origin && landed.pathname === target.pathname && landed.search === target.search;
    }
  } catch { /* A slot response is HTML; it must establish its confirmation. */ }
  return { targetCreateForm, deletedConfirmation, redirect, redirectCompleted, targetRecreated,
    pageAccepted: !targetRecreated && (deletedConfirmation || redirectCompleted) };
}
