# Workspace Kernel Vertical Slice

## Goal

A person or coding agent can create a durable local workspace and inspect its
identity, revision, composition, authority mode, and health through the same
engine used by the CLI.

## User scenarios

1. `aimoto workspace create "Neighborhood Clean-up" --root ./clean-up --json`
   creates the reference directory layout, a validated v1 manifest, SQLite
   state, revision zero, and a provenance event.
2. `aimoto inspect --workspace ./clean-up --json` returns the versioned CLI
   envelope and the exact workspace identity stored by the engine.
3. Recreating an existing workspace fails without replacing its state.
4. A missing or internally inconsistent workspace returns a stable error code.

## Requirements

- The engine is the single entry point for workspace creation and inspection.
- SQLite owns durable revision and event metadata.
- `.aimoto/workspace.json` contains pinned composition, not runtime history.
- Workspace creation begins at revision zero.
- JSON output contains no decorative text and validates against the protocol
  envelope schema.
- Human-readable output remains the default.
- A manifest/database identity or revision mismatch fails health validation.

## Out of scope

ChangeSet approval, module execution, desktop rendering, migrations, snapshots,
AI planning, and operating-system integration belong to later slices.

## Acceptance criteria

- Lifecycle tests create and inspect a workspace through the engine.
- CLI tests create and inspect the same workspace through versioned JSON.
- Missing workspaces and overwrite attempts return stable errors.
- Repository type checking, tests, and builds pass.

