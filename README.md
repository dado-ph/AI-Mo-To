# AI-Mo-To

AI-Mo-To is a work-in-progress tool for making small, local workspaces safely.

Today, you can use it to create a workspace on your computer, propose one
setting change, approve that exact change, and see the workspace move to a new
revision. It is a proof that changes can be visible and approved before they
take effect.

It is not a finished desktop app yet. There is no graphical interface, no
published npm package, and no command that generates a Habit Tracker for you.
Those pieces are being built around the working local core.

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

## What is in this repository?

- `apps/cli` is the command-line program you can use today.
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
