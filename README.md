# AI-Mo-To

AI-Mo-To is a work-in-progress tool for making small, local workspaces safely.

Today, you can create a local workspace, use the desktop shell to inspect it,
ask the built-in local agent workflow for a Habit Tracker, review its exact
proposal, approve its installation, and recover a saved workspace configuration
through the same approval path. This is still an early local-first product, but
the core loop is now real rather than a diagram.

## Start here

You need Node.js 22 or later and pnpm. From this repository, run:

```powershell
pnpm install
pnpm build
```

Then follow the step-by-step guide:

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

- `apps/cli` is the command-line program and agent-facing workflow you can use today.
- `apps/desktop` is the local Electron shell for selecting and inspecting workspaces.
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
