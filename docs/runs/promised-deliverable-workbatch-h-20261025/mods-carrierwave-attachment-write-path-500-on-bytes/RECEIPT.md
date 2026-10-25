# mods-carrierwave-attachment-write-path-500-on-bytes: the write path works, and the 500 was an unarmed files area

- The row's own label: "carrierwave attachment write path: a create that
  carries real bytes answers 500 with a zero-byte body"
- The instrument:
  `tools/drive-multipart-upload-against-deployed-bundle.mjs`, which boots the
  deployed Bunny engine bundle behind the local harness HTTPS host, against a
  local copy of the deck and a local mock storage zone
- The bundle: built at this tree with
  `node tools/bundle-bunny-edge-engine.mjs`,
  `deploy/dist/bunny-edge-engine.bundle.js`, 7,449,150 bytes, sha256
  `38a62110d241e1324e27d2260c7bd10f79d9af28e64505254c8520ede12dd247`
- Commands:
  - `node tools/drive-multipart-upload-against-deployed-bundle.mjs`
  - `node tools/drive-multipart-upload-against-deployed-bundle.mjs --no-storage`
  - `npx vitest run tests/server/write-routes-multipart-upload.test.ts`
    (1 file, 10 tests, 10 passed)
  - `npx vitest run tests/server/write-surface-crash-boundary.test.ts`
    (1 file, 5 tests, 5 passed)
- Capture:
  `fixtures/captured/promised-deliverable-workbatch-h-20261025/mods-carrierwave-upload-drive.json`
- The tree: `c17906dbb39220a3dd1bcd58847d0fa0d1c9696b`, the newest pushed tip
  of `deploy/full-candidate-20261101`, which is the tip this branch starts
  from. No hosted edge was contacted; the harness serves a local origin.

## Verdict: the defect as the row states it is closed, and the residual is named

A create that carries real bytes does not answer 500 with a zero-byte body at
this tree. It answers 200 and stores the bytes, when the host arms its files
area. When the host does not, it answers a 500 whose body names the throw site
and the host's own files-area sentence.

## What the row's premise was, and what the measurements say

The row's blocker reads the cause off the port's own declaration:
`src/card/mod-loader/mods/card-mod-carrierwave.ts` listed the carrierwave mount
adapter and both attach paths under "Not ported (honest remainder)", so the
reading was that an unported upload path produced the live 500. The declaration
was stale for the write path, and the 500 had a different cause.

## The measurement, arms and all

| | files area CONFIGURED | files area ABSENT (`--no-storage`) |
|---|---|---|
| control, no file part | 422 `{"errors": {"file": "is missing"}}` | 422, the same |
| multipart create with `card[file]` (87-byte .txt) | **200**, 123 body bytes, card id 53053, act id 1 | **500**, 490 body bytes |
| the card row | committed, `db_content` `~53053/1.txt` | no row, the save never committed |
| the bytes in the files area | stored, byte-identical to the posted bytes | none |
| serve-back `GET /files/~53053/1.txt` | 200, 87 bytes, `text/plain` | not applicable |

The 500's body in the second arm carries the throw site and the host's
sentence:

    attachment save requires the engine's attachmentStore option
    (CardActionEngineOptions.attachmentStore) This Bunny Edge Script has no
    files area: the script reads its storage zone from the
    DECKO_STORAGE_ZONE and DECKO_STORAGE_PASSWORD variables (a pair, set
    both), and its region endpoint host from DECKO_STORAGE_HOST (default
    storage.bunnycdn.com).

## The mechanism, in one sentence

The write path is ported and stores a multipart create end to end; the live
500 was the deployed host's files area never armed, so the save threw at
`finalizeAttachment` with no attachment store, and because the throw was not a
`CardActionError` it left every handler, so the runtime answered a bare
zero-byte 500 while the no-file control kept answering a legible 422.

That mechanism was already established against the byte-identical deployed
artifact in commit 53cfa84b (2026-10-19), and the error boundary landed in
the same commit: `src/server/cloudflare-write-routes.ts`'s `writeCrashResponse`
carries the throw site's message into the 500 body and appends the host's
`attachmentStoreDiagnosis` sentence. `tests/server/write-surface-crash-boundary.test.ts`
pins it and is green here (5 tests).

## What changed in the port's own declaration

`src/card/mod-loader/mods/card-mod-carrierwave.ts` carried two bullets that
named the write path as not ported, and they were the reason the row read as
an unported path. Both are corrected in this commit, with the evidence each
correction rests on:

- the storage-type events are ported (the state source derives the type,
  `validate_storage_type` has its real body, `update_storage` is declared);
- `set/type/file.rb`'s `attach :file` and `SelectedAction`'s
  `last_content_action_id` parse are ported
  (`src/card/attachments/attachment-content.ts`'s
  `lastContentActionIdFromIdentifier`), and so is the write path
  (`card-action-engine.ts`'s `finalizeAttachment`; the `store_file_event`
  disposition is `engineOwnedEvent`);
- `set/type/image.rb`'s `attach :image` is the same write path, the mount
  decided by the card's type codename.

What is still not ported, and stays on the record: the carrierwave gem runtime
itself (fog, S3 buckets, mini_magick), Ruby's own `attachment :file` macro and
the `format :file` block, the public symlink management, the coded storage
directories, the bucket configuration, and the five image versions.

## What stays open, and why

The two matrix rows this row blocks (`mx-B-086` upload a file, `mx-B-081` the
nest image editor) are closed by a live drive against an edge whose files area
is armed. Arming it is an operator action on the live deployment (the same
files-area pair that the deploy of 2026-10-20 refused for), and nothing here
deploys. The instrument to run it is in the tree:
`tools/drive-multipart-upload-against-deployed-bundle.mjs`.

## What this lane did not do

It did not contact a hosted edge, did not deploy, did not change any
behaviour in the port (the change in the carrierwave module is its own
disposition comment), did not re-record an oracle capture, and did not arm or
touch any deployment's configuration.
