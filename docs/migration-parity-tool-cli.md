# migration-parity-tool CLI — one command for "how many pages are not byte-identical?"

`bin/migration-parity-tool.mjs` is the front door to the migration parity checker: it chains the
existing, proven stages — live capture → import → render → byte-compare — behind one command and
produces the owner-facing parity report described in
`deliverables/migration-parity-tool-PLAN.md` (read that first for the full plan, the honest gaps,
and the milestones).

## Status (read this before promising anything)

The scaffold runs `--help`, validates inputs, and fails with a named missing-inputs list. It
wires the TRACKED stages (import via `tools/migrate/migrate.mjs` /
`migrate-generalized.mjs`; render via `vm-staging-server.mjs`) to their real verified CLIs.
The CAPTURE driver and the COMPARE classifier are proven lane tooling that lives outside this
repo today (gap G2/G4 in the plan); the scaffold checks for them and explains exactly what to
supply. It does NOT yet run end-to-end against a third-party site.

## Usage

```
node bin/migration-parity-tool.mjs run --site <slug> --targets <targets.tsv> \
    (--dump <file.sql> | --source <deck.sqlite>) --out <run-dir> [options]
```

- `--targets` is a TSV: one `slug<TAB>url` pair per line, the same shape the proven capture
  instrument consumed for the 247-request oracle run.
- Provide exactly one of `--dump` (mysqldump; stage 2 path A) or `--source` (existing SQLite
  deck; stage 2 path B). Both are verified importers with count/checksum parity.

Partial modes:

| Flag | Meaning |
|---|---|
| `--capture-only` | Stop after stage 1. Output: sha256-bound capture log + exact page bodies. Read-only GETs against the target site; nothing is written to it. |
| `--report-only` | Re-grade an existing run directory: `--run-dir <dir>` must contain `capture-log.jsonl` and `targets.tsv`. |
| `--dry-run` | Print the exact stage commands with per-stage provenance notes; execute nothing. |

Other options: `--capture-instrument`, `--classifier`, `--direct-driver` (override the lane
tooling paths), `--staging-port` (default 3100), `--workers` (default 8).

## What a full run does

1. **CAPTURE** — the capture driver fetches each target sequentially (curl children with a
   browser UA and one shared cookie jar — `node fetch` trips Cloudflare TLS fingerprinting),
   no redirects followed, recording per request: fetchedAt, url, status, bytes, sha256,
   content-type, cache/mitigation headers, attempts. Bodies are stored exactly as received.
   The reference is the site AS OF the fetch date; that binding is what makes the later
   engine-vs-content classification honest.
2. **IMPORT** — `tools/migrate/migrate.mjs --dump ... --out <run>/deck.sqlite --verify`
   (or `migrate-generalized.mjs --source ... --verify` for SQLite sources). `--verify` is
   count/checksum parity; add `--engine-verify` manually for spot-render checks.
3. **RENDER** — `node vm-staging-server.mjs <run>/deck.sqlite <port>` boots the TypeScript
   engine on the imported deck and serves the pages.
4. **COMPARE + REPORT** — the grading driver diff-scores rendered bytes against captured bytes
   (exactly one sanctioned mask: `data-slot-id`; everything else is a real mismatch), and the
   three-way analyzer classifies each differing page as ENGINE-GAP or CONTENT-CHANGED
   (plus test-data-gap/denied/mixed), producing the per-page table behind the report.

## Known convention to respect (until gap G4 is closed)

The three-way analyzer is directory-coupled: it reads `capture-log.jsonl`, `targets.tsv`, and
`rebuilt-edge-bytes/` from its own directory. For `--report-only`, copy the analyzer into the
run directory (or point `--classifier` at a copy placed there). The scaffold says so when it
matters instead of silently mis-reading.

## Safety posture

Production sites are touched with read-only GETs only, anonymous, sequential and polite.
There are no writes to the target site and no duplicated side effects — this is differential
testing, not shadow traffic. Write-side replay is out of scope by design.
