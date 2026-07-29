# ADR-0001: Workspace identity and revision model

- Status: Accepted
- Date: 2026-07-29

## Decision

Each workspace owns a stable identifier, a pinned manifest, local state, context,
and monotonic revision history. Machine-profile defaults seed new workspaces but
never silently rewrite an existing workspace. Every workspace mutation names
its base revision and commits through a ChangeSet.

## Consequences

Concurrent proposals can become stale without corrupting active state. A
restoration produces a new revision instead of deleting subsequent history.

