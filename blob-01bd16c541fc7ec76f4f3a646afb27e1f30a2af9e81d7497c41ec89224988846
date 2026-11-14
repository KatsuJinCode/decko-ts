# Stock Bootstrap public font routes

The actual Node stock-assets probe at927bfaa5 passed with no failed required
assets. The same actual Bunny-handler probe verified Font Awesome glyphs and
the exact coded logo/favicon, but stayed red because Bootstrap's icons view
requested its stock WOFF2 and WOFF files under `/mod/bootstrap/fonts/`; that
edge host had no public-file route for them. The red receipt is preserved.

The repair serves exactly those two installed card-mod-bootstrap0.20.0 public
font files through the actual Node and Bunny entry points. The existing
compiled stylesheet's paths and mapping are unchanged. Font bytes, source
gem version, hashes and MIT attribution are retained under
`vendor/decko-bootstrap-fonts`; the upstream font release number is explicitly
unknown rather than inferred. No generic filesystem/public-directory proxy
or resource fetch was added. GET/HEAD serve only the two named files with
font MIME and nosniff; writes are405 and unrelated paths continue normally.

The handler tests verify exact hashes without DB credentials, both formats,
HEAD and rejected writes. A clean exact-source actual browser rerun must
still require zero failed assets on the icons page. No older failed request
or frozen reference byte is changed by this repair.
