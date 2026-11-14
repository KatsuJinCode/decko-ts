# Native compiler reuse

`build-native.mjs` shares verified artifacts between Git worktrees through
`<git-common-dir>/native-artifacts/libsass/`. `LIBSASS_CACHE_DIR` can select an
explicit alternative directory. No compiler binary is committed.
Outside a Git checkout it uses the operating system's per-user cache directory.
`LIBSASS_CACHE_ONLY=1` verifies reuse and refuses a cache miss without compiling.

The key includes every vendored source/header and the wrapper, compiler and
compiler-phase executable hashes, compiler header trees and static-library
hashes, compiler version/target, compilation/link flags, platform/architecture,
and relevant compiler environment settings. A manifest binds these inputs to
the executable's size and SHA256. Every reuse validates that manifest and the
executable bytes. A corrupt entry fails loudly without executing its bytes.

Only the exclusive owner of an input key may build. Waiters observe filesystem
events; they do not poll or terminate the owner. A demonstrably exited owner
can leave a reclaimable lock; a live or unreadable owner cannot be displaced.
The diagnostic wait deadline matches the test helper's existing ten-minute
build deadline. Builds use private object directories, wait for every started
compiler before cleanup, recheck inputs, and atomically publish only complete
artifacts. Scratch directories are removed in `finally`.

For an existing compiler whose original build predates receipts, an explicit
one-time import is available:

```
node tools/libsass/build-native.mjs tools/libsass/libsass tools/libsass/build --adopt-existing <verified-legacy-checkout>
```

This requires identical vendored source/wrapper hashes and the exact legacy
build script, checks the embedded current compiler version, and executes a real
SCSS compilation smoke test. The receipt labels this as an explicit legacy
import and states that an original toolchain receipt was unavailable. It does
not invent historical provenance. Ordinary test calls never import an existing
executable merely because it is present. New cold builds record their current
inputs directly.

Cache tests compile a tiny real C program to exercise independent-process
ownership, warm reuse, source/toolchain changes, failed builds, changed inputs,
manifest/binary tampering, and live-owner protection. The existing LibSass byte
parity suite separately exercises the real reused compiler, including every
recorded SCSS pin in both output styles.

## Local validation

On Windows x64 with GCC 16.1.0, the explicitly imported compiler was 6,558,517
bytes, SHA256
`ca84a1f0c254e4f9b1a40b232258ed599724fceaf532f0da003caeb641539ac2`.
The existing LibSass suite passed all 42 tests, including every corpus pin in
both output styles; all six cache controls and TypeScript checking passed.
Four independent processes requesting a new tiny-C artifact compiled it once.

A verified warm LibSass call measured 10,371 ms. Two concurrent cache-only
calls using identical source trees in separate worktrees measured 5,848 and
5,839 ms, both selecting the same key and binary. These measurements include
rehashing source/toolchain inputs. No full LibSass cold build was repeated for
this validation; no cold-build speed improvement is claimed.
