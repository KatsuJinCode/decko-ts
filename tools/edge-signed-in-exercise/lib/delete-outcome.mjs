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
  return { targetCreateForm, deletedConfirmation, redirect, redirectCompleted,
    pageAccepted: !targetCreateForm && (deletedConfirmation || redirectCompleted) };
}
