# AI-Mo-To!

AI-Mo-To is an early, local-first workspace engine and module foundry. Its
current usable command-line path creates a workspace, stages an authority-mode
change, approves the exact proposed bytes, and inspects the resulting revision.

## Start here

Requirements: Node.js 22+ and pnpm 10+ (the repository is pinned to pnpm
11.9.0). From this checkout:

```sh
pnpm install
pnpm build
pnpm --filter @ai-mo-to/cli aimoto workspace create "My Workspace" --root ./my-workspace --json
pnpm --filter @ai-mo-to/cli aimoto inspect --workspace ./my-workspace --json
```

For the complete, runnable create -> plan -> approve -> inspect sequence, see
the [CLI manual](docs/manual/cli.md). The [manual index](docs/manual/README.md)
covers the JSON protocol, library APIs, module runtime, operational limits, and
the current implementation boundary.

## Current scope

The CLI supports workspace creation and inspection plus staging and approving a
`workspace.set-authority-mode` ChangeSet. Foundry staging, module installation,
snapshots, and the module host are exported libraries; they do not yet have CLI
commands or desktop UI flows. Treat the API as `0.1.0` early-stage software.
All `@ai-mo-to/*` packages in this monorepo are private workspace packages;
this repository does not claim they are published or installable from npm.

Run the repository checks with:

```sh
pnpm validate
```

Architecture decisions are in [docs/adrs](docs/adrs), and implementation
specifications are in [specs](specs).
