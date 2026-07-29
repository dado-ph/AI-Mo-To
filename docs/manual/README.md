# AI-Mo-To manual

This manual describes the code currently in this repository, not a future
roadmap. It is intended for someone starting from a local checkout.

- [CLI guide](cli.md) - install, commands, exact approval flow, outputs, and exit codes.
- [Protocol](protocol.md) - JSON envelopes, schemas, ChangeSets, digests, and errors.
- [Library APIs](library-apis.md) - TypeScript entry points for the engine, foundry, snapshots, and module runtime.
- [Module development](module-development.md) - framed JSON-RPC and host expectations.
- [Operations and limits](operations-and-limits.md) - workspace files, trust model, recovery, and current boundaries.

The stable starting point is `pnpm validate`; package source directories are
`packages/*`, while the executable CLI package is `apps/cli`. All packages are
private monorepo-local packages, not documented public npm packages. Use them
from this checkout and its pnpm workspace only.
