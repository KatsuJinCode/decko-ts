# Row smell-discovery-pageonly-ranks101-110-act082-save-post-body

Family row conversion, 2026-10-22. The row's own verification was re-run at the
shipping candidate; the row is NOT closed.

- Roster row: `smell-discovery-pageonly-ranks101-110-act082-save-post-body`
  (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `reference-harness/browser/discovery-pageonly-ranks101-110-act082-save-post-body.mjs`
  (discovery 4 of the ACT-082 set)
- Tree measured: `C:/localProjects/decko-ts-smell-test-measure-20261022` at commit
  `e8b70ad3aa85c75f9247d2cd1af747e4bf740505` (the shipping candidate), engine built there with
  `node tools/dist/build-engine.mjs`; `.runtime/browser-build.json` records
  `sourceDiffSha256` `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
  (the clean-tree git-diff hash).
- Command: `node reference-harness/browser/discovery-pageonly-ranks101-110-act082-save-post-body.mjs`
  (exit 0; the instrument records observations, it does not grade).
- Evidence in this directory: `steps.json` (the driven steps), `server.log`.

## What the run measured

The instrument drove the whole sequence against the candidate engine: the type select is present
(1 element), the freshly created Book cardtype IS in the select's DOM (`hasBook` true), and
`selectOption` on it succeeds (`value` `Book_mvk0yz7c`, no error). The stored row afterwards is
still `typeId` 37, `bookId` 912, `isBook` false. The one POST the instrument witnessed was:

```
POST /update/D4_TypeChange_mvk0yz7c
utf8=%E2%9C%93&_method=patch&card%5Blast_action_id_before_edit%5D=997&card%5Bcontent%5D=subject+D4_TypeChange_mvk0yz7c&button=
```

The body carries `card[content]` and `card[last_action_id_before_edit]`, and no `card[type]`
field at all.

## Gap, in one mechanism sentence

The type row's update body is serialised without the `card[type]` field, so the type the person
chose is dropped on the wire and the card's stored `type_id` stays 37.

## Disposition

`WORKING ON IT`. The verification ran and it measures the ACT-082 type-drop signature with the
witnessed POST body, so the port does not measurably match Ruby on this surface and the row is
not closed. The fix is engine work on the type row's update body.
