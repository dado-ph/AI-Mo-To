# Technical manual

Start with [Getting started](../getting-started.md) unless you are extending
the code. This section is the reference manual for contributors who need exact
command, protocol, and library details.

- [CLI guide](cli.md) - install, commands, exact approval flow, outputs, and exit codes.
- [Protocol](protocol.md) - JSON envelopes, schemas, ChangeSets, digests, and errors.
- [Library APIs](library-apis.md) - TypeScript entry points for the engine, foundry, snapshots, and module runtime.
- [Module development](module-development.md) - framed JSON-RPC and host expectations.
- [Operations and limits](operations-and-limits.md) - workspace files, trust model, recovery, and current boundaries.

The executable CLI lives in `apps/cli`. The packages under `packages/*` are
private pieces of this repository, not public npm packages.
