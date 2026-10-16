# Scoped new-form browser evidence

Clean candidate `88eb29f8ac9e9ee00ae3311ea64739564ed3573a` was built with
`build:engine -- --browser-hosts` and exercised through the actual Bunny
handler over owned local Hrana/storage emulators. This is a four-journey
diagnostic, not full-suite or hosted-runtime acceptance.

| Journey | Completion | Duration | Required asset failures |
|---|---|---:|---:|
| create-structured-topic-member | completed | 15.825s | 0 |
| pointer-checkbox-input | completed | 50.445s | 0 |
| upload-file-admin | completed | 20.854s | 0 |
| upload-image-admin | completed | 17.116s | 1 |

All eight observations returned HTTP 200. The image journey remains RED:
its actual selected-draft preview requested `/files/~296/997-medium.png`
and received 404. Card 296 is `*new image`; action 997 is the preliminary
upload selected by the hidden cached-upload field. The final created card
stored `~911/998.png` and its large rendition loaded successfully. Journey
completion alone does not waive the failed intermediate preview.

The run used Chromium 154.0.8037.98, Node v24.19.0, PBKDF2-default, host-default
asset refresh, local capture mail and local Bunny object-storage emulation.
Its run ID is `1f6207c7-074a-444d-b868-9af98ffe233f`; source was clean and the
build receipt binds that source to distribution SHA-256
`a882edc85f2935834546d013e988adffdef74d9ad87ab9744ff001904d4318cf`.
Fixture hash is `066062bd09c25629d43691461a23bf37580e5cfe63cf68780fc4dfea2384f8aa`;
journey definitions hash is `2f4dc0bc216e77e8dde229bc4e2cfc1462f789af21c3f31c2c66feb27934bc20`.
The existing full Ruby33 reference has a different fixture hash
(`e5798f…`), so no exact reference parity is claimed or manufactured.

Original JSON, HTML, network outcomes, server log, build log and SHA manifest
are preserved outside the worktree at
`C:/localProjects/brandonDojoTech/recovery/release/private-probes/newform-request-scope-c3b06650/browser-88eb29f8/`.
The runner closed its owned engines naturally with exit 0. A subsequent
cache-area repair and its own run must be evaluated separately; these
original failures remain immutable.

## Cached-preview repair

Stock `card-mod-carrierwave-0.20.0/set/self/new_file.rb` and `new_image.rb`
both override `upload_dir` with `tmp_upload_dir`.
`set/abstract/attachment/00_upload_cache.rb` stores a preliminary upload's
identifier under that cache card, records its draft action, and removes the
cached files/action only after final create. The existing TypeScript storage
seam already writes these objects in the separate `tmp` area. File GETs
always read the regular files area, so an otherwise valid preview could
never retrieve the stored temporary image.

The repair carries the resolved card's codename through file routing and
chooses `tmp` only for the real `new_file`/`new_image` cache cards. It does
not search a second area on a miss. The current actor's existing read gate,
mark/action association, recorded content and identifier ownership checks
still run before storage reads.

The actual Bunny HTTP regression posts real PNG bytes, reads the selected
medium preview with the correct MIME, reads the original bytes exactly,
checks HEAD/body length, refuses a different cache card's action, and proves
these reads leave rows unchanged. It then creates the final image, downloads
exact original bytes, and verifies the consumed temporary preview is 404.
All 31 file-route and actual HTTP controls passed in 61.55s; TypeScript
validation passed. A clean browser rerun of this repair is recorded separately.

The clean rerun on `b7de77f4a663b37bfc1993fb840d0a743780ac22` completed the
same unmodified `upload-image-admin` journey in 21.520s. The identical
`/files/~296/997-medium.png` preview request returned 200; both observations
were 200, final content remained `~911/998.png`, and there were zero failed
network requests or required assets. The owned engine closed naturally.
This remains one focused journey, not full-suite acceptance.

Run ID: `c273d232-766b-4ab6-8caa-c10ce0bc710b`.
Clean distribution SHA-256:
`8fa27266d2ba6e22dc8180f9a5911577c3b6d20eb655ae643f7a471e94a4b099`.
Original JSON, HTML, metadata and logs are preserved beside the earlier
failure under `browser-b7de77f4/`, with their own SHA-256 manifest.
