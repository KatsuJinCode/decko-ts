// decko-config.js — the per-deck runtime config that the decko page head emits
// after the main script. Served as a static asset and loaded with `defer`
// AFTER all-script.js so the assignments run in the same order as the real
// page: the main JS executes first, then this config mutates the global
// `decko` object. The ace/tinymce editor configs are deliberately absent —
// this demo is a read-only surface with no editor views.
//
// rootUrl: the prefix all-script.js puts on its fetch paths. The documented
// default is the origin this page is actually served from — the demo is
// same-origin (the [assets] directory and the Worker deploy together), so the
// one-click deploy works on whatever workers.dev host it lands on, and on a
// custom domain, with no edit here.
// To serve the deck's API from a different host than the page, replace the
// assignment below with that host, trailing slash included:
//   decko.rootUrl = 'https://<your-deployment-host>/';
decko.rootUrl = `${location.origin}/`;
decko.doubleClick = 'signed_in';
decko.cssPath = '/assets/all-style.css';
decko.signed_in = false;

$('document').ready(function () {
  $('.card-slot').trigger('decko.slot.ready');
});
