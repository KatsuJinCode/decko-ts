// Executed in the browser by Playwright. Plain inputs do not wait for a
// rich editor; a TinyMCE object alone is insufficient after a failed asset.
export function editorReady([name]) {
  const textarea = document.querySelector(`textarea[name="${name}"]`);
  if (!textarea) return document.querySelector(`input[name="${name}"]:not([type=hidden])`) !== null;
  if (!textarea.classList.contains("tinymce-textarea")) return true;
  const editor = textarea.id && window.tinyMCE && window.tinyMCE.get(textarea.id);
  return !!editor && editor.initialized === true && !!editor.getBody();
}
