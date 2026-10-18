# Local Material Icons asset mode

`DECKO_MATERIAL_ICONS=local` selects a pinned copy of the same Google Material Icons font used by the stock page. Unset or `stock` preserves stock HTML. Invalid values are refused. This is a deployment asset choice, independent of Font Awesome and the stored deck.

The option removes the runtime dependency on Google for this stylesheet/font. It was added after a qualifying full run recorded `ERR_CONNECTION_CLOSED` for that existing font. No failed requests are removed from the original receipt.

The observed font is128,352bytes, SHA256 `8265f64786397d6b832d1ca0aafdf149ad84e72759fffa9f7272e91a0fb015d1`. Its bytes are unchanged. Only its URL in the510-byte stylesheet becomes a relative local URL. The content-addressed asset path serves CSS, WOFF2 and the Apache2.0 license through the existing stock-font route. GET, HEAD and ETag revalidation are supported; writes and unknown/encoded names are refused. Existing stylesheet integrity metadata follows the replacement CSS digest.

Both ordinary and fallback page heads carry the selected mode. Request-local edge boots and fresh Node render engines inherit it. The mode appears in served-delta diagnostics. Local signed-in qualification must pass `--material-icons local`; the receipt records `DECKO_MATERIAL_ICONS:local`. A host-override walk cannot override its target's configuration.

Recreation uses `tools/assets/vendor-material-icons.mjs`, which accepts only the exact already-observed Google WOFF2 URL and checks font magic, size, stylesheet reference and license. It installs no package or system font. `vendor/decko-material-icons/provenance.json` records source URLs, retrieval agent, sizes and hashes; the full license is retained and served with the asset. Google's [Material Icons guide](https://developers.google.com/fonts/docs/material_icons) documents self-hosting and Apache2.0 licensing. The [upstream license](https://github.com/google/material-design-icons/blob/master/LICENSE) accompanies this copy.

Stock behavior remains the comparison reference. A deployment choosing local mode must qualify its rendered appearance and asset responses; a source build or isolated controls alone do not establish hosted acceptance.
