# Runtime assets in engine distributions

The first-run/account endpoint suites previously emitted TypeScript and copied
only three generated edge snapshots. The renderer also imports the HTML4 entity
table, and the compiler imports the embedded LibSass module. Those missing files
killed the server before it listened; readiness loops then consumed about64s
per suite. The original public-candidate report remains failed.

`tools/dist/runtime-assets.mjs` now supplies the same complete vendor copy and
byte-level readiness check to the production build and test bootstrap. It checks
required runtime inputs, refuses redirected directories/links, detects changed
or extraneous destination assets and verifies every copied file. The real build
still checks the generated static Uglifier source before compiling, cleans only
its owned distribution and records runtime asset manifest metadata. Both entry
points import the actual renderer and LibSass module before declaring readiness.

Local controls: three asset-distribution tests pass, including missing HTML4,
same-length corrupted LibSass, incomplete source, redirected output and stale
extra asset negatives. Type checking passes. A real browser-host distribution
build completes in8.50s and verifies44assets/6,546,950bytes, manifest
`8fbf701dc42f8896f4298c38af16de87d0db89afedd9625ed6b5b6e4dec137d2`.
The two actual Node HTTP endpoint suites pass all9tests; measured suite execution
is0.966s (accounts) and1.766s (first-run), versus63.774s/64.093s failed runs
before this repair. These are local source/HTTP checks, not hosted acceptance.

Commands:

```sh
node node_modules/vitest/vitest.mjs run tests/tools/runtime-asset-distribution.test.ts --maxWorkers=1
node node_modules/typescript/bin/tsc --noEmit
node tools/dist/build-engine.mjs --browser-hosts
node node_modules/vitest/vitest.mjs run tests/card/auth/first-run-setup-endpoint.test.ts tests/exercise/accounts-3.test.ts --maxWorkers=1 --fsModuleCache --fsModuleCachePath=node_modules/.vitest-cache
```

The endpoint run used the existing verified native compiler artifact and a local
transform cache; it did not download dependencies or compile LibSass.
