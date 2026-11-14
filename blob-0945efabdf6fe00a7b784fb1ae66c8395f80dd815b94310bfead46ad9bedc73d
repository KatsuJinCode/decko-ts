# Signed-in edge integration checks

The signed-in edge changes through 776d406f are integrated with actor-scoped
autocomplete checks. Suggestions establish freshness, apply the actor's CQL
read scope before limiting, and recheck each selected card's read permission.
The search box uses the normal search view, including create permission and
deck-origin URL generation. Name-only search projections resolve their names
before the final read verdict; they do not assume the projection contains ids.

On 2026-10-15, the new local Hrana regression tests reproduced the original
restricted-name disclosure before the correction and passed afterwards. They
cover filtering before the eight-result window, retained-engine revocation,
actor isolation, search-box prefix results and create permission, and the
origin check on the GET sign-out route.

The five focused edge test files passed 31 tests. TypeScript checking passed.
The complete synthetic-v1 comparisons on both ts and ts-composed passed:
1,754 rendering, 2,389 semantics, 16 persistence, 19 side effects, eight
read-write checks and 12 other-table checks. These were precommit development
runs with the dirty-checkout warning retained. The generated release package
requires separate verification. No deployment or production acceptance is
established by these checks, and large-deck search-box performance is unmeasured.

Normal npm ci also passed with npm 11.17.0 after explicitly denying the
unnecessary implicit build script for better-sqlite3 13.0.3. That package ships
native prebuilds and declares gypfile:false; npm's dependency metadata refresh
otherwise loses that flag and attempts a local MSVC build. The installed
prebuild opened SQLite successfully, and esbuild transformed TypeScript.
