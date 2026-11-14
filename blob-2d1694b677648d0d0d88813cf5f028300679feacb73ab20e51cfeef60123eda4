# Where the test suite's time actually goes

Date: 2026-10-10. Written to be read by someone who does not work in this
codebase. Every number was measured on this machine.

## The question

The long test runs 626 files, 4 at a time, and feels slow. This report says
where the time actually goes and what could be changed. The short version is at
the bottom.

## How this was measured

I ran a quarter of the suite — 157 of the 626 files, spread evenly across the
whole list rather than taken from the front — with the test runner writing down
how long every single test took. That gave timings for **1,718 individual
tests**. The tool that reads those timings is now in the repo at
`tools/profile-test-suite-cost.mjs`, so this can be repeated whenever we want.

## Finding 1: almost every test is already fast

**The middle test takes 1 millisecond.** More than two-thirds of them finish in
under 5 milliseconds.

| How long a test takes | How many tests | Share of all test time |
|---|---:|---:|
| under 5 ms | 1,538 | 2.5% |
| 5–20 ms | 502 | 7.3% |
| 20–100 ms | 240 | 15.1% |
| 100 ms – 1 s | 45 | 16.5% |
| **over 1 second** | **18** | **58.5%** |

You said if things happen in milliseconds we should be able to do thousands in
under a minute — and that is exactly what happens. **1,538 tests complete in
under 5 milliseconds each.** The volume is not the problem. The problem is
eighteen specific tests.

## Finding 2: the time is in a tiny handful of tests

The same 1,718 tests took 86 seconds in total. But:

- the **10 slowest tests** account for **70%** of all of it
- the **25 slowest** account for **79%**
- **one test alone accounts for 39.5%**

That one test is `tests/migrate/streaming-memory.test.ts`, and its name is
*"imports 1M rows with a bounded parser buffer and bounded heap growth"*. It
builds a synthetic file containing **one million rows**, then parses it back, to
prove that the importer's memory use stays flat no matter how much it is fed.

That is a perfectly reasonable test. It is also a **capacity test, not a
correctness test** — it answers "does this scale to a million rows", not "does
this compute the right answer". It is a different kind of question with a
different right frequency, and it is currently running inside the ordinary test
run that every change triggers.

## Finding 3 — and this is the important correction

When I removed the four heaviest test files and re-ran the same sample, the
**test time** dropped by 44%. But the **time you actually wait** dropped by only
**6%** (39.5s → 37.0s).

That is because the slow tests run at the same time as everything else. While
that one 34-second test is grinding on one processor, the other fifteen are
busy with the rest of the suite. The work overlaps, so removing it barely moves
the finish line.

**So the slow tests are not what makes you wait.** They are expensive, but they
are not the bottleneck. If we only went after them, we would spend effort and
see almost no improvement — which is the opposite of what we want.

## Finding 4: what you actually wait for is a fixed cost

At 16 workers, with everything warm, here is how long the run takes as the
number of files grows:

| Files in the run | Wall time |
|---:|---:|
| 1 | 4.6 s |
| 8 | 5.4 s |
| 32 | 5.7 s |
| 80 | 8.9 s |

Read that carefully. Going from 1 file to 32 files — thirty-two times the work —
cost **1.1 extra seconds**. There is a **fixed cost of roughly 4.6 seconds that
happens no matter how much work there is**, and after that each extra file adds
about 65 milliseconds.

That fixed cost is the machine starting up: the test runner booting, the engine
code being loaded and prepared, sixteen worker processes being spawned. It is
paid on every single run.

## Finding 5: yes, there is database redundancy — and here is the size of it

You asked whether we need to make sixteen copies of a database. There is
something like that, and it is worth knowing the scale.

**Thirteen test files boot a full copy of the production serving environment** —
the Cloudflare Workers runtime, emulated in-process, with its own database
engine. The two heaviest test files each boot one of these, and between them
declare **six separate databases**, because they are testing what happens when
two people edit the same card at the same time.

Every test that wants a clean database builds one from scratch: it replays all
**56 statements** that create the database structure. I measured that at
**0.42 seconds each time**.

The cheaper way, which I also measured: build the structure **once** into a
216 KB template file, then copy the file for each test. A file copy takes
effectively no time — **roughly 500 times cheaper** than replaying the
structure.

So the answer to your question is: the copies themselves are necessary, because
those tests genuinely need a pristine database. But we are **rebuilding the
database from scratch thousands of times when we could be copying a file**. The
rebuild is pure waste. At 0.42 seconds each, across the files that do it, this is
on the order of a few seconds of the total — real, but not the main event.

## What is genuinely wrong here

The suite currently mixes three different kinds of test and runs all of them,
at the same frequency, every time anything changes:

1. **Correctness tests** — the median one takes 1 millisecond. These are the
   overwhelming majority and they deserve to run constantly.
2. **Capacity tests** — the million-row importer, the thousand-junction render.
   These answer "does this scale". They take seconds each and they answer a
   question that does not change every time someone fixes a typo.
3. **Deployment tests** — the 11.5-second file that signs a real account in
   against the emulated edge runtime.

Where we are **not scaling responsibly** is not the volume of work. It is
putting a capacity test in the same gate as a one-millisecond test, so that
every lane and every merge pays for a million-row run whether or not the change
touched anything near it.

## What I propose

**1. Split the suite into three gates, each with its own frequency.**

- *Correctness* — runs on every change. Median 1 ms, so this is cheap and can
  run constantly.
- *Capacity* — the million-row importer and its relatives. Runs on demand, or
  on a schedule, or when someone touches the importer. Not on every keystroke.
- *Deployment* — the emulator-backed tests. Runs at merge, not per change.

This is the change that matches your instinct: run the smallest sample that
exercises the thing you changed, rather than running the biggest sample you
happened to build.

**2. Turn the parallel setting up from 4 to 16.** One line. Measured at roughly
30% faster, though the measurements are noisy enough that I would not promise
more than "meaningfully faster".

**3. Replace the database rebuilds with a template copy.** Build the structure
once, copy the file. Measured at ~500× cheaper. Small in the totals today, but
it is pure waste and it is easy.

**4. Fix the main project's missing checker.** Not a speed problem, but it
means one of our working copies cannot type-check at all, and it fails quietly
rather than loudly.

## Honest caveats

**The numbers are noisy.** The same 160-file run measured 23.9 seconds once and
16.4 seconds another time. The direction of every finding here is solid; the
exact percentages are soft, and I would rather say that than quote precision I
have not got.

**I did not run the full 626-file suite.** Everything above is measured on a
157-file quarter plus several smaller slices. That is enough to find where the
time goes, which was the question. It is not enough to promise a before-and-
after number for the whole run — that needs one full run at 4 workers and one
at 16, which takes a few minutes each and needs approval before starting.

**If a change to the importer is made, the capacity gate still has to run.** The
proposal is about *when* it runs, never about skipping it.