# decko-ts documentation

How the engine is organised is in [ARCHITECTURE.md](../ARCHITECTURE.md), at the
repository root. This directory holds everything else: how parity is verified,
how the engine is deployed on each edge platform, how it is run and operated,
and the decisions that shaped it.

| Document | What it covers |
| --- | --- |
| [parity-method.md](parity-method.md) | How byte parity with Ruby Decko is measured: the oracle, the captured fixtures, corpus replay, the comparator and its one normalisation, and what a parity figure does and does not tell you. |
| [deploy-bunny.md](deploy-bunny.md) | Deploying on Bunny Edge Scripting against Bunny Database (libSQL): the two bundles, configuration variables, caching switches, the write-surface gate and status endpoints. |
| [deploy-cloudflare.md](deploy-cloudflare.md) | Deploying on Cloudflare Workers over D1: the deploy button, manual deployment, the Worker entry and its bundle, D1's tighter limits and how the engine works within them. |
| [operations.md](operations.md) | Running the engine: local development, the staging server, Server-Timing and the edge profiler, data freshness, cache invalidation, credential rotation and troubleshooting. |
| [TESTING.md](TESTING.md) | What the test suite guards, what data it needs and how to run it. |
| [decisions/README.md](decisions/README.md) | Decision records for the choices that are expensive to reverse. |

## Conventions

Documents use relative links, so they resolve from the repository root on
GitHub and in an editor. Anything under `benchmarks/` or `tmp/` is a
regenerable artifact rather than a source of truth; a document that cites one
cites it as evidence, not as a place to edit.