# AI-Mo-To manual

Start with [Getting started](../getting-started.md) if you are using AI-Mo-To. The pages here explain how the workspace, CLI, and approval boundary work in more detail.

The short version is simple: AI-Mo-To prepares workspace changes in a separate staging area, shows you the proposal and its digest, and applies it only after you review it.

- [CLI guide](cli.md) — create a workspace, request a change, review it, and apply it.
- [Operations and limits](operations-and-limits.md) — current product boundaries and recovery behavior.
- [Protocol](protocol.md) — JSON envelopes, ChangeSets, digests, and errors for integrations.
- [Module development](module-development.md) — how modules communicate with the host.
- [Library APIs](library-apis.md) — TypeScript APIs for contributors extending the product.

The packages under `packages/*` are private parts of this repository, not published npm packages.
