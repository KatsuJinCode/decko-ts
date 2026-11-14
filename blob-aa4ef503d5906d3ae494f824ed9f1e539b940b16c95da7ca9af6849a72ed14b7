# HTML4 text serialization before truncation

Source checkpoints: `6ebff642` and `fecf2141`. These implement the shared
Rails `strip_tags` / safe-buffer truncation path, not the separate
Card::Content::Chunk::Nest fast tag-removal helper.

The actual Ruby3.3.12 helper probes use ActionView7.2.4,
rails-html-sanitizer1.7.1, Loofah2.25.2 and Rails::HTML4::FullSanitizer.
The committed fixture retains 24 captured input/strip/truncate answers.
Controls include malformed tables and declarations, script/style removal,
encoded executable markup, textarea content, quotes, invalid numeric codepoints,
HTML5-only named references, semicolon requirements, supplementary Unicode and
combining characters. Named HTML4 references need a semicolon; numeric references
do not. The parser keeps raw references so the public XHTML1 table can supply
HTML4 semantics instead of applying HTML5 replacement rules.

The table comes from public htmlentities4.4.2's exact XHTML1 mapping, with
253 entries and source SHA in vendor/htmlentities-4.4.2/provenance.json.
The actual gem COPYING.txt identifies Paul Battley and MIT; it is retained
verbatim. htmlparser2 and all six dependency license texts are retained under
vendor/html-text-licenses and attributed in NOTICE. The pinned entities override
keeps the tested dependency closure unchanged.

## Checks and limits

Typecheck passes. Six focused render suites pass 144 tests, including 26 helper
controls. An additional existing corpus/source-pinned suite could not read its
configured archived Ruby source tree and lacked
the corpus; its three source-read errors and three skips are not passing checks.

The real TS adapter recapture at clean `fecf2141` selects only canonical IDs
209,232,233,238,313,316,423,433,510. All nine exactly equal the existing canonical
Ruby33 answers; all nine differed in the old575 capture. Expected render.jsonl
SHA256 is 539d98fb2ff90bf0e38b21f81e2ddb6b43484fea2d9f6e6025ae016c5ae269f1.
Actual subset SHA256 is b82ad21f931eae0fb1bacd999f3effed19770514a05fe579cdbb4323fac20208.
The fixture digest verified without problems. This is a filtered source parity
check, not a full grade, browser run, or deployment acceptance. ID358
`core@set/all/text.rb` is a separate unresolved text-format dispatch gap.
No canonical input, Ruby answer, or normalization rule changed.

Reproduce the filtered capture:

```powershell
node reference-harness/runner/run.mjs --adapter reference-harness/adapters/ts/adapter.json --fixture reference-harness/fixtures/synthetic-v3-mod-probes-ruby33 --out .runtime/html4-nine-local --kinds render --filter '^probe-view:(209|232|233|238|313|316|423|433|510):'
```

The final full Bunny artifact is 9,633,021 bytes, SHA256
7f1f4c0d158f7a1db24b2308e2316b1dd2e8c12ac7ea87e0231882de103508e5,
built in200ms; the read artifact is1,850,547bytes, built in69ms.
The minified neutral Parser-only bundle is76,535bytes; the shared HTML4 helper
bundle is79,765bytes. Earlier153KB prototype estimates used different build flags.
One cold Node24 import of the exact full artifact took124.15ms and registered
its handler through the existing style of local SDK shim. This excludes HTTP
server/certificate startup and does not measure vendor edge evaluation or CPU.

Raw probes, filtered results, clean-source runner metadata, comparison, startup
measurement, producer scripts and package-file hashes are preserved outside the
worktree in the private release evidence under
merge-review-worktree-preservation/cf-local/html4-fecf2141/.
The preservation.json SHA256 is
0283a9dc34da993d0ffdf85267fd36014d43236223c447a2cc49012aafae68de.
The earlier16-case probe is retained under html4-6ebff642/; its manifest SHA256 is
84dc80da4e9aaa4f6f21ce3fc17f15a20763a94115262971d470dc48faf28739.

## Isolated dependency adoption

Only the existing owned CF provider was installed into; no active root/shared
provider changed. provider-packages.json in preserved evidence records every
file SHA256 and npm integrity for these six modules beneath that provider:

| Module | Version | License |
| --- | --- | --- |
| htmlparser2 |10.0.0|MIT|
| domhandler |5.0.3|BSD-2-Clause|
| domelementtype |2.3.0|BSD-2-Clause|
| domutils |3.2.2|BSD-2-Clause|
| dom-serializer |2.0.0|MIT|
| entities |6.0.0|BSD-2-Clause|

The root can resolve just those new module paths through read-only junctions
once its frozen capture ends. Replacing or reinstalling its provider is unnecessary.
