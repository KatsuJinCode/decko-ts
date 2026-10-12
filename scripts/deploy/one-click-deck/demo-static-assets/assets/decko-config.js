// decko-config.js — the per-deck runtime config that the decko page head emits
// after the main script. Served as a static asset and loaded with `defer`
// AFTER all-script.js so the assignments run in the same order as the real
// page: the main JS executes first, then this config mutates the global
// `decko` object. The ace/tinymce editor configs are deliberately absent —
// this demo is a read-only surface with no editor views.
decko.rootUrl = 'https://decko-one-click-demo.jpswilner.workers.dev/';
decko.doubleClick = 'signed_in';
decko.cssPath = '/assets/all-style.css';
decko.signed_in = false;

$('document').ready(function () {
  $('.card-slot').trigger('decko.slot.ready');
});
