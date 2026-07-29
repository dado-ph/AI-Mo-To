# ChangeSet Approval Vertical Slice

## Goal

An engine can persist an immutable ChangeSet proposal, obtain human approval
for those exact bytes, and later apply it only when the workspace is still at
the proposal's base revision.

## User scenarios

1. A valid ChangeSet becomes a pending proposal with its canonical SHA-256
   digest.
2. An approval explicitly names the proposal, workspace, base revision, and
   ChangeSet digest it authorizes.
3. Applying after a revision change is rejected as `ProposalStale`.
4. Applying a ChangeSet with bytes different from the approved digest is
   rejected as `ApprovalDigestMismatch`.

## Requirements

- Canonical JSON sorts object keys lexicographically and preserves array order.
- A ChangeSet digest is `sha256:` plus lowercase SHA-256 hex of canonical JSON.
- Proposal records bind a ChangeSet to its workspace, base revision, digest,
  lifecycle status, and creation timestamp.
- Approval records bind the proposal identity to the same workspace, revision,
  and digest.
- Schema validation is structural; the engine must recompute the digest before
  committing an approval or application.
- The engine owns storage, lifecycle transitions, stale checks, and atomic
  commits.

## Out of scope

Module installation behavior, approval UI, authorization providers, and
conflict resolution.

## Acceptance criteria

- Equivalent objects with different insertion order have identical canonical
  serialization and digest.
- A base-revision change produces a distinct ChangeSet digest.
- Proposal and approval fixtures validate through runtime JSON Schema.
