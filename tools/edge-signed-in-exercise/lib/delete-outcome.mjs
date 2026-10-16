import { parseDocument } from 'htmlparser2';

const sameName = (a, b) => a.replaceAll('_', ' ').trim().toLowerCase() === b.replaceAll('_', ' ').trim().toLowerCase();

/** Inspect the deleted target, not unrelated card forms in page chrome. */
export function deleteOutcome({ html, name, origin, finalUrl, responseBody }) {
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
  // The delete's JSON redirect is unreadable when the browser followed it (the
  // body is dropped on navigation). The browser then ended on the page the
  // redirect named, so the redirect completed when it is some page other than
  // the deleted card's own (its first path segment is not the deleted name).
  // The create-form test above still rejects a recreated target.
  let landedOnDeleted = false;
  try {
    const landedSegment = decodeURIComponent(new URL(finalUrl, origin).pathname).replace(/^\//, '').split('/')[0] ?? '';
    landedOnDeleted = sameName(landedSegment, name);
  } catch { /* An unparseable landing cannot be the deleted card's page. */ }
  if (redirect === null && responseBody === '' && !landedOnDeleted) redirectCompleted = true;
  return { targetCreateForm, deletedConfirmation, redirect, redirectCompleted, landedOnDeleted,
    pageAccepted: !targetCreateForm && (deletedConfirmation || redirectCompleted) };
}
