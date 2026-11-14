# The reference walk's names, declared: the save's references cost a round trip each (2026-10-23)

Row ROW-2 of the save path's round three. Lane `port/savepath-round3-20261023`,
in the exclusive lane checkout
`C:/localProjects/decko-ts-savepath-round3-20261023`.

## 1. The headline

| | |
|---|---|
| The population | the reference walk's name resolutions: the deck's 17 referee names, each resolved through the Lexicon one at a time, one round trip each |
| The lever | the names are all known at the seam, so they are declared once (the transport packing's declaration) and the walk's own reads of them cost no round trip |
| The graded save, pipeline POSTs | **272 -> 257** (a 15-POST, 5.5% reduction) |
| The graded save, statements | 769 -> 772 (the declaration sends the names in one batch) |
| The correctness clause | the rows the walk produces are the rows it produced without the declaration, and the pinned test measures both ways |
| The battery | the family's seven suites: no green suite turned red; the same 5 MySQL 8.4 failures the base tree fails |

**The target (about 175, accept 200 or below) is NOT MET.** 257 is 57 POSTs
above 200.

## 2. The profile that named the population

This lane's own instrument (a driver-side trace of every round trip, every
memo store and every memo drop, plus a stack capture at the driver, not
landed) attributes every single-statement read of the graded save to the
engine seam that issued it. **THE LEXICON'S OWN NAME RESOLUTION IS THE
BIGGEST CONSUMER: 46 of the graded save's single-statement reads.**

| the seam | reads |
|---|---|
| `_DbLexicon.cacheFetch` (the Lexicon's name lookup) | 46 |
| `retrieveFromDb` (the fetch layer's retrieve path) | 24 |
| `_CardActionEngine.fetchRowById` (the write path's card row) | 7 |
| `fetchCardsRow` (the read-rule write path's card row) | 7 |
| `typeIdByCodename` (the codename map) | 6 |
| `findTrashedCardByLex` (the name validation's trashed-key check) | 5 |
| `isListCard` / `isSearchCard` (the reference walk's type checks) | 4 + 4 |
| `walkComposedNames` (the rule walk's composed-name walk) | 4 |
| `codenameOfId` (the mod event state's codename read) | 3 |

**THE 46 LEXICON READS SPLIT INTO 17 SIMPLE NAMES AND 29 COMPOUND NAMES,
AND THE 17 SIMPLE NAMES COME FROM ONE PLACE: THE REFERENCE WALK.**

| the read | reads |
|---|---|
| `SELECT id FROM cards WHERE key COLLATE NOCASE = ? AND trash = 0 LIMIT 1` (a simple name) | 17 |
| `SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 LIMIT 1` (a compound name) | 29 |

The 17 simple names are the deck's own content cards: aikido_oak_cliff,
b_whtml_header, bw_bio_source, conflict_done_well, embody_nonviolence,
free_aiki_dojo, home, intellectual_property, martial_nonviolence,
pacifica_graduate_institute, peace_practice, process_art, related_person,
statement, the_myth_of_peace, twitterfeed,
williamscraig_recommendation_20200924_u_censu.

**THE STACKS NAME THE SEAM: 13 of the 17 come from
`interpretReference` -> `createReferencesOut` -> `referenceRowsOut` ->
`refreshReferencesOut`, and 3 more come from the same walk resolving a
compound name's side.** The reference walk scans the content's reference
chunks and interprets each one, and each interpretation resolves the
referee's name through the Lexicon:

```ts
for (const chunk of scanReferenceChunks(content)) {
  if (chunk.refereeName === undefined) continue;
  await interpretReference(lexicon, refHash, chunk.refereeName, chunk.refType, refererName);
}
```

**THE DECLARATION COVERS NONE OF THEM.** The card-block declaration
prefetched 22 simple names (the save's input tree's keys and their sides:
bio, company, description, how_to_contact_me, image, musing, page, skill,
related_person, and the field references avocational_practice,
core_project, frequent_process, general_practice, occasional_process,
potential_project, project_s_organizing, project_s_participating,
regular_process, related_project, vocational_practice) and 20 junction
pairs. **Of the 17 names the Lexicon then read, the declaration had
prefetched exactly ONE.** The names the reference walk resolves are the
REFERENCES' names, not the input tree's names: the input tree names the
field, and the field's value names the card the field points at.

## 3. The lever

**THE NAMES ARE ALL KNOWN AT THE SEAM.** `scanReferenceChunks(content)`
yields every chunk before any of them is interpreted, so the walk knows all
of the names it is about to resolve. The declaration puts them in one run:

```ts
const chunks = scanReferenceChunks(content).filter((chunk) => chunk.refereeName !== undefined);
await declareReferenceNames(lexicon, chunks.map((chunk) => chunk.refereeName as string), refererName);
for (const chunk of chunks) {
  await interpretReference(lexicon, refHash, chunk.refereeName as string, chunk.refType, refererName);
}
```

`declareReferenceNames` resolves the names the way the walk itself resolves
them (parse, then absolutize against the referer), collects each compound
name's sides, and hands them to the Lexicon's `prefetchIds`, which is the
same declaration the card-block declaration uses: the simple names ride one
run, the compound names ride a second one (their sides' ids are known by
then), and the answers go into the driver's transaction read memo under the
keys the readers use.

**IT CHANGES NO ANSWER.** The declaration is a SPECULATION: the driver
remembers the answers under the same keys the readers use, and a read the
driver cannot vouch for is a MISS, so the reader's own read then takes the
blocking path, at its own sequence point, and answers the same. The
declaration changes the NUMBER of round trips, never the ANSWERS.

**THE THREE WALKS ARE ALL DECLARED**: the link and nest chunks
(`createReferencesOut`), the list card's items (`createListReferencesOut`),
and the query card's quoted names (`createQueryReferencesOut`).

**THE OPTIONAL METHOD.** `ReferenceLexicon` gains an optional
`prefetchIds?`. A Lexicon that does not implement it (a test fake, an
adapter) leaves the walk's reads on the ordinary path, which answers the
same.

## 4. The measurement

```
node tools/run-save-statement-ladder-to-completion.mjs --out tmp/ladder-R3-ROW2b.json
```

| | after ROW-1 | after this row |
|---|---:|---:|
| the graded save, pipeline POSTs | 272 | **257** |
| the graded save, statements | 769 | 772 |

## 5. The pinned test

`tests/card/actions/refresh-references-out-declaration.test.ts`, two cases
over the mock Hrana server (real better-sqlite3, so a wrong answer shows up
as a wrong answer), counting the PIPELINE POSTS the server received:

1. **the walk's name resolutions ride ONE round trip, measured both ways**:
   without the declaration three names cost three round trips; with it, one.
2. **the declaration changes the NUMBER of round trips, never the ANSWERS**:
   the rows the walk produces with the declaration are the rows it produces
   without it, and the walk's own read of a name the deck does not hold
   still answers the same.

## 6. The gates

```
npx vitest run tests/card/actions/ --reporter=dot
npx tsc --noEmit
```

- **The actions suite**: 41 files passed, 1 failed; 569 tests passed, 5
  failed. **The 5 failures are the same 5 the base tree fails**, and this
  lane checked that by running the file with this row's change parked: the
  same five `tests/card/actions/atomic-saves.test.ts` cases in the "MySQL
  8.4 (native)" group, the group that needs a MySQL server this machine does
  not have.
- **The typecheck**: the same 3 pre-existing errors in
  tests/card/actions/write-path-races.test.ts, and no new one.

## 7. What was not done

- **Nothing was deployed and nothing was pushed to a live host.**
- **The target was not met** (257, not 175 or 200).
- **The retrieve path's name resolutions were not declared** (24 reads): the
  fetch layer resolves one name per call, and the seam that holds the whole
  set of names it will resolve is not in the save's input tree.
- **The notification phase's memo was not touched**: the save pays 77 round
  trips after its commit, with no transaction and therefore no memo. That is
  a separate row of this round.
