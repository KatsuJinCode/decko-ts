// Browser callback: address the editor belonging to the field, never a stale
// global activeEditor left by an earlier page or modal.
export function matchingRichEditor([id, focus = false]) {
  const api = window.tinymce ?? window.tinyMCE;
  const editor = api?.get?.(id);
  if (!document.getElementById(id) || !editor?.initialized ||
      !editor.getBody?.() || typeof editor.selection?.getRng !== 'function') return false;
  if (focus) editor.focus();
  return true;
}

export async function focusRichEditor(page) {
  const field = page.locator('.modal:visible textarea.tinymce-textarea, #edit_card:visible textarea.tinymce-textarea').first();
  const id = await field.getAttribute('id');
  if (!id) throw new Error('RichText field has no editor identity');
  await page.waitForFunction(matchingRichEditor, [id, false], { timeout: 30_000 });
  if (!await page.evaluate(matchingRichEditor, [id, true])) throw new Error('matching RichText editor became unavailable');
  return id;
}
