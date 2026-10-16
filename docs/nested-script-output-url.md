# Nested script output URLs

Opening a legacy HTML layout card from real search results reproduced a
script request shaped `/files/https://…/files/…js`, returning404. The same
page's outer application script URL was correct. The nested mod view used
`card-mod-script.ts`'s `assetOutputUrl`, which prefixed every stored output
with `/files/` regardless of storage type.

Stock source defines the path through
`card-mod-script/set/all/head_javascript.rb`'s `main_javascript_tag` →
`card-mod-assets/set/abstract/asset_outputter.rb`'s `asset_output_url` →
`FileCardUploader#url`. The uploader explicitly returns web content unchanged,
derives a cloud URL for fog storage, and uses the local path for other
storage types. Prefixing an absolute web URL does not follow that lifecycle.

`5f35156e` delegates web/cloud identifiers to the existing attachment URL
implementation, including the serving engine's configured cloud host. Legacy
local output identifiers keep their existing bytes. The script tag escapes
the URL with the existing Rails-compatible HTML attribute escape.

## Evidence

The actual browser baseline used current release product source: the
`src`/`deploy` diff between its source commit `aaf391b6` and release
`aae09c79` was empty. It opened Home, the selected legacy layout result and
an ordinary result on the approved existing local 21,676-card-derived mirror.
The protected original database hash remained unchanged.

The repaired browser renders the nested script with the same canonical
absolute URL as the outer application and records no malformed `/files/https:`
request. An independent read-only HEAD of that exact emitted approved asset
URL returned200 `text/javascript`. The probe did not record successful
browser subresource status codes, so that HEAD is labelled separately.

The overall three-page probe remains **RED**. The legacy card's real nested
content also requests a blocked third-party Twitter widget and an insecure
Facebook iframe. Neither the external-asset allowlist nor stored content was
changed to conceal these failures. Under host-wide memory pressure the page
walls were 3.06–4.19s, also above three seconds; these are not waived or used
as performance acceptance.

All 19 script-mod tests passed in 3.45s, including existing local oracle byte
controls, web/cloud output URLs and URL attribute escaping. Omitting the fix
produced one genuine failure in the new test while the other18 passed.
TypeScript compilation passed. No fresh Ruby, full oracle or hosted runtime
acceptance is claimed.

The first after-probe failed during bundle validation with a V8 allocation
error before starting its browser. The complete build and both bundle
validations then passed with an explicit 512MB heap bound:

```powershell
node --max-old-space-size=512 tools/bundle-bunny-edge-engine.mjs
```

The final full-engine bundle is 9,995,078 bytes, below the unchanged
10,000,000-byte gate with only4,922 bytes remaining. The original failure,
corrected build, raw HTML/reports, tests and source/configuration hashes are
preserved under private evidence-bundle ID
`selected-result-assets-20261016`. No private database or credentials are in
that bundle. Existing policy and historical browser captures are unchanged.
