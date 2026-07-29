# AI-Mo-To

AI-Mo-To is a local-first desktop application for turning a modest need into a
workspace you can inspect, change, and recover. The repository builds the app;
the installed app is what people use.

Today, you can create a local workspace, open it in the desktop app, ask the
built-in local agent workflow for a Habit Tracker, review the exact proposal,
approve its installation, and recover a saved workspace configuration through
the same approval path.

## Start here

To build the Windows installer from source, you need Node.js 22 or later and
pnpm. From this repository, run:

```powershell
pnpm install
pnpm --filter @ai-mo-to/desktop dist
```

The NSIS installer is written to `apps/desktop/release/`. For the product flow
and source-based CLI walkthrough, follow:

[Get started with your first workspace](docs/getting-started.md)

It takes you through this complete loop:

1. Create a workspace.
2. Ask to switch it into Build mode.
3. Review the proposed change.
4. Approve the exact proposal.
5. Confirm that the workspace has a new revision.

For the full product proof, use `agent habit plan` to stage a Habit Tracker,
then create a snapshot and use `snapshot restore-propose` followed by `apply`
to recover it as a new revision. The command reference includes each step.

## What is in this repository?

- `apps/cli` is the structured command-line interface for people and coding agents.
- `apps/desktop` is the installable local Electron application.
- `packages` contains the local building blocks: workspace state, proposals,
  snapshots, generated-module staging, and module hosting.
- `modules` contains the built-in Files and Tasks examples.
- `docs/manual` is the technical reference for contributors and integrations.

## Useful links

- [Getting started](docs/getting-started.md) - one complete, human-readable walkthrough.
- [Command reference](docs/manual/cli.md) - every supported command and its errors.
- [What the tool can and cannot do today](docs/manual/operations-and-limits.md).
- [Technical API reference](docs/manual/library-apis.md) - for people extending the code.

To check the repository after a change, run:

```powershell
pnpm validate
```
