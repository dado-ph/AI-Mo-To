# Snapshot and Recovery

## Purpose

Provide a portable, content-addressed recovery artifact that can be verified
before use and restored only by proposing a new workspace revision.

## Requirements

1. A snapshot binds the workspace manifest, module bundle digests, module
   schemas, workspace data, context files, event-log position, and engine
   configuration references.
2. Snapshot identity and every stored object are SHA-256 content addresses.
3. Verification detects a changed manifest, a missing object, and changed
   object bytes.
4. Credentials and secret values are never accepted or stored. A snapshot may
   contain only the machine-profile binding keys required to reacquire them.
5. Restoration is non-destructive. It validates the snapshot and returns a plan
   whose target revision is newer than the active revision.
6. Restoration reports missing historical module bundles and credential
   bindings as requirements; it does not mutate an active workspace.
7. Tests use disposable workspaces and do not depend on user state.

## Acceptance scenarios

- Identical logical input produces the same snapshot identifier.
- A complete snapshot verifies successfully after being written to disk.
- Tampering with an object causes verification to fail.
- A restore plan contains the selected snapshot, its source revision, a new
  target revision, object references, and required credential binding keys.
- Supplying a credential or secret value is rejected before any snapshot is
  written.

## Non-goals

- Applying a restore plan or changing the active workspace.
- Migration execution.
- Credential storage or machine key-store access.
- CLI integration.
