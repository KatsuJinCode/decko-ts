// The stock 409 handler calls slot() with its default SUCCESS selector after
// notify(...,"error"). A modal's success target is its origin, while the
// revision and conflict notice belong to the editor. The actual two-browser
// probe leaves the editor on revision1 beside a notice containing revision2.
// Keep the upstream asset untouched; the explicit edge deployment option
// installs a document-level handler, after the stock body-level notification.
export const CONFLICT_RETRY_SCRIPT = `<script data-decko-conflict-retry="1">
(function(){
 var $=window.jQuery;if(!$)return;
 $(document).off('ajax:error.deckoConflictRetry','form.slotter').on('ajax:error.deckoConflictRetry','form.slotter',function(event,xhr){
  if(!xhr||xhr.status!==409)return;
  var form=$(this),field=form.find('input.current_revision_id[name="card[last_action_id_before_edit]"]');
  var marker=form.find('.card-notice .new-current-revision-id').last();
  var revision=marker.text().trim(),card=form.closest('.card-slot').attr('data-card-id');
  var conflicted=marker.closest('.card-slot').attr('data-card-id');
  if(field.length!==1||!card||card!==conflicted||!/^\\d+$/.test(revision))return;
  field.val(revision);
 });
})();
</script>`;

export function addConflictRetryScript(html:string):string{
 if(!html.includes('</body>')||html.includes('data-decko-conflict-retry="1"'))return html;
 return html.replace('</body>',CONFLICT_RETRY_SCRIPT+'\n</body>');
}
