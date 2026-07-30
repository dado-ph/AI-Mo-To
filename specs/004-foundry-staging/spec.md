# Foundry Staging Vertical Slice

## Goal

A coding agent can turn a plain request into a module plan, prefer a suitable
existing module, or stage a generated module bundle for validation without
changing the active workspace.

## User scenarios

1. A request for a Habit Tracker resolves to visible outcomes, records, views,
   commands, events, and capabilities.
2. A matching existing module is selected before generation is attempted.
3. A generated Habit Tracker bundle is written to a temporary,
   content-addressed directory.
4. Static validators and a dry activator run against the staged bundle and
   disposable workspace state.
5. The successful result contains the exact digest used by a later install
   ChangeSet; it does not install or activate the module.

## Requirements

- Planning structures describe the request and proposed module contract.
- Existing-module selection is an injected hook and runs before generation.
- Bundle digests are deterministic over sorted relative paths and exact bytes.
- Staging must reject unsafe paths that escape the bundle root.
- Validation and dry activation are injected interfaces with structured
  diagnostics.
- Dry activation receives a disposable state directory, never the active
  workspace path.
- A failed check returns no installable proposal.
- A successful generated proposal identifies the staging directory, digest,
  module identity, requested capabilities, and validation evidence.
- Staging never mutates an active workspace.

## Out of scope

AI provider calls, handler execution, ChangeSet construction, approval,
installation, workspace revision updates, snapshots, and desktop rendering.

## Acceptance criteria

- Tests stage a generated Habit Tracker manifest, schema, views, handler, and
  test file without modifying an active workspace sentinel.
- Repeated staging of identical bytes produces the same digest and directory.
- Existing-module selection bypasses generation and staging.
- Static validation or dry activation failure prevents a proposal.

