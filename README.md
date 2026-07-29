# AI-Mo-To!

AI-Mo-To! is a local-first desktop application, CLI, and workspace foundry for
building modular workspaces through explicit, reviewable changes.

The repository has completed the first Milestone 0 contract slice and is now
building **Milestone 1: Kernel**. The current vertical path creates a durable
workspace, records revision zero in SQLite, and inspects it through the same
engine used by the CLI.

The current implementation also includes:

- supervised child-process module hosting and a framed module SDK;
- declarative Files and Tasks modules;
- content-addressed snapshot creation, verification, and restore planning; and
- foundry staging with existing-module-first selection, validation, dry
  activation, and exact-digest proposals.
- canonical ChangeSets, visible proposal records, approval-bound SHA-256
  digests, stale-revision rejection, and atomic SQLite commits.
- verified generated-module installation that pins the approved Habit Tracker
  bundle and copies it into the workspace's content-addressed module store.

## Prerequisites

- Node.js 22 or newer
- pnpm 10

## Develop

```sh
pnpm install
pnpm validate
pnpm build
```

Create and inspect a workspace:

```sh
pnpm build
pnpm --filter @ai-mo-to/cli aimoto workspace create "Neighborhood Clean-up" --root ./clean-up --json
pnpm --filter @ai-mo-to/cli aimoto inspect --workspace ./clean-up --json
```

The implementation boundary and staged roadmap are recorded in
[`docs/adrs`](docs/adrs).

Each implemented vertical slice carries its working specification, plan, and
task record under [`specs`](specs).
