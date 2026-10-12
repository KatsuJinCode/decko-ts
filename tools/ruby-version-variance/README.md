# Oracle variance: which axis actually moves the bytes

Two stock Ruby Decko oracles, same fixture, same Decko version — what differs?

**The answer is the operating system, not the Ruby version.** That is the
correction this directory exists to record.

## What was measured, and what it missed

The public claim was that the oracle's expected bytes are "measured identical
across Ruby 3.2 / 3.3 / 3.4". That comparison was run entirely on Windows:
two Rubies of different patch versions, on one operating system. It found no
difference outside the random slot ids N1 already masks
(`evidence/compare-3.3.12-vs-3.2.11.json`, `evidence/variance-3.3.12-vs-3.2.11.json`).

It said nothing about a capture on Linux, and that turned out to be the axis
that matters. The committed `synthetic-v1` expected outputs were captured on
Windows (`ruby 3.3.12 [x64-mingw-ucrt]`). A capture of the same fixture with
stock Linux Ruby of the same version differs in the order of the tokens inside
`class="..."` attributes, and in nothing else. On `synthetic-v1`, **678 of the
1,752 render operations** differ that way; all 2,388 semantics operations and
all 16 scenarios are byte-identical after N1, and the classifier reports
**0 UNCLASSIFIED**. That is `evidence/class-order-linux-vs-committed.json`.

So the variance story has two axes, and they are not the same axis:

| axis | what varies | what it costs |
|---|---|---|
| Ruby patch version, same OS | nothing outside slot ids | nothing: 3.2 vs 3.3 on Windows is byte-identical after N1 |
| operating system, same Ruby version | class-token order | 678 of 1,752 render operations, all order-only |

### One thing a Linux capture does not give you

The deck a Linux capture builds is a **different fixture**: Decko's compiled
asset files concatenate their parts in a different order on Linux, so
`deck/deck.sqlite3` and `deck/files/*` hash differently and the fixture digest
changes. Under SPEC.md §6 that is a new fixture name (`synthetic-v2`) with its
own capture, not a recapture of `synthetic-v1`. The grader therefore refuses a
Linux run against the committed expected outputs, correctly — which is why the
comparison above is done answer by answer with this classifier rather than
with `grade.mjs`.

## How it is measured

```
node tools/ruby-version-variance/classify-ruby-variance.mjs <runA> <runB> [--json <out.json>]
```

Each run's `run-meta.json` names the environment it was captured in — the
Ruby oracle's ready line carries `ruby`, `ruby_platform` and `ruby_engine`,
and `run.mjs` copies that line into `runs.<kind>.engine`. The tool reads both
and prints the axis it is measuring before any classification, so a comparison
can never silently be the wrong axis.

It then applies the harness's own normalisation
(`reference-harness/runner/normalize.mjs`) so "equal after the harness's rules"
means exactly what SPEC.md section 4 means, and counts the order-only
differences separately from everything else. Anything it cannot classify is
printed as `UNCLASSIFIED` and the tool exits non-zero: a difference outside
the class-token-order class is a finding, not a rounding error.

## The files here

- `classify-ruby-variance.mjs` — the classifier.
- `haml-class-order-probe.rb` — probes whether Haml 5.2.2's class-token merge
  is order-stable, end to end and at the primitive level. Run it on two Rubies
  and compare.
- `adapter-ruby32.json`, `rebuild-ruby32-native-extensions.sh` — the Ruby 3.2
  adapter and the native-extension rebuild it needs on this machine.
- `evidence/` — the recorded comparisons.

## Reproducing the Linux capture

Four scripts, in this order. They exist because the Linux capture is the
evidence for the whole correction, and a claim that cannot be re-run is a
claim, not a measurement. Every one of them writes nothing into the
repository: the deck and the answers go to a work root you name, and the
bundle is installed into a copy of `oracle/app` whose lockfile carries the
linux platform.

```bash
# 1. The oracle's bundle for Linux, into a work root (needs ruby3.3 and build deps)
wsl -d Ubuntu-26.04 -- bash tools/ruby-version-variance/install-linux-oracle-bundle.sh \
  /mnt/c/<repo>/reference-harness/oracle /root/oracle-linux

# 2. Build synthetic-v1's deck on Linux (a Linux deck is a DIFFERENT fixture; see above)
wsl -d Ubuntu-26.04 -- bash tools/ruby-version-variance/build-synthetic-v1-deck-on-linux.sh \
  /mnt/c/<repo>/reference-harness/oracle /mnt/c/<repo>/reference-harness/fixtures/synthetic-v1 \
  /root/oracle-linux /root/oracle-linux/runs/linux-ruby33

# 3. Run the harness with the oracle as the engine (needs node >= 22.5 in WSL too)
wsl -d Ubuntu-26.04 -- bash tools/ruby-version-variance/capture-synthetic-v1-on-linux.sh \
  /mnt/c/<repo> /root/oracle-linux

# 4. Compare the answers, and see why grade.mjs will not
wsl -d Ubuntu-26.04 -- bash tools/ruby-version-variance/grade-linux-capture-against-committed.sh \
  /mnt/c/<repo> /root/oracle-linux
```

Docker is not installed on this machine, so the pinned `ruby:3.3.12-slim`
image could not be used; the capture ran on Ubuntu's `ruby 3.3.8` inside WSL2
instead. The recorded environment is in the run's `run-meta.json`, which is
the point of recording it.